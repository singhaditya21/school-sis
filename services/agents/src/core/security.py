"""Security Layer — Rate Limiting, Prompt Injection Defense, and Cost Tracking.

Implements token usage tracking via Redis, heuristically blocks common
LLM jailbreaks, and enforces SaaS subscription tiers.
"""

from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

import redis.asyncio as redis
import structlog
from fastapi import HTTPException

from src.config import settings

logger = structlog.get_logger()
_redis_pool = None

# Blacklist of common prompt injection & jailbreak phrases
JAILBREAK_PATTERNS = [
    r"ignore\s+(all\s+)?(previous\s+)?instructions",
    r"disregard\s+(the\s+)?above",
    r"you\s+are\s+now\s+(an?\s+)?unrestricted",
    r"bypass\s+safety\s+filters",
    r"print\s+(all\s+)?(your\s+)?system\s+prompt",
    r"developer\s+mode",
    r"do\s+anything\s+now",
    r"dan\s+mode",
    r"reveal\s+(your\s+)?(system\s+)?prompt",
    r"act\s+as\s+.*without\s+restrictions",
]
COMPILED_JAILBREAKS = [re.compile(p, re.IGNORECASE) for p in JAILBREAK_PATTERNS]


async def init_redis(url: str | None = None) -> None:
    """Initialize async Redis client pool."""
    global _redis_pool
    redis_url = url or getattr(settings, 'redis_url', None) or "redis://localhost:6379"
    try:
        _redis_pool = redis.from_url(redis_url, decode_responses=True)
        await _redis_pool.ping()
        logger.info("redis_connected", url=redis_url.split("@")[-1])  # Don't log credentials
    except Exception as e:
        logger.warning("redis_connection_failed", error=str(e))
        _redis_pool = None


async def close_redis() -> None:
    """Close Redis client pool."""
    global _redis_pool
    if _redis_pool:
        await _redis_pool.aclose()


def sanitize_prompt(query: str) -> None:
    """
    Check input query for obvious prompt injection patterns.
    Raises HTTPException (400) if a trigger is detected.
    """
    for pattern in COMPILED_JAILBREAKS:
        if pattern.search(query):
            logger.warning("prompt_injection_attempt_detected", query_preview=query[:80])
            raise HTTPException(
                status_code=400,
                detail="Your query was flagged by the security guardrail. Please refine your request."
            )


async def check_subscription_tier(tenant_id: UUID) -> None:
    """
    Enforce SaaS Pricing Tiers.
    Queries the database to ensure the tenant is on AI_PRO or ENTERPRISE
    before generating heavy LLM tokens.

    SECURITY: Fails CLOSED — if we can't verify the tier, we deny access.
    A DB blip should not grant free AI access.
    """
    from src.tools.db import get_db_pool

    pool = get_db_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT subscription_tier FROM tenants WHERE id = %s", (tenant_id,))
                result = await cur.fetchone()

                if not result:
                    logger.warning("tenant_not_found", tenant_id=str(tenant_id))
                    raise HTTPException(
                        status_code=403,
                        detail="Tenant not found. AI agent access denied."
                    )

                if result[0] == 'CORE':
                    logger.warning("subscription_tier_blocked", tenant_id=str(tenant_id))
                    raise HTTPException(
                        status_code=403,
                        detail="AI Agents require the 'AI Pro' Tier. Please upgrade your plan to unlock AI features."
                    )
    except HTTPException:
        raise  # Re-raise our own HTTP exceptions
    except Exception as e:
        logger.error("tenant_tier_check_failed", error=str(e))
        # FAIL CLOSED: If DB is down, deny AI access rather than giving it away free
        raise HTTPException(
            status_code=503,
            detail="Unable to verify subscription tier. Please try again shortly."
        )


async def check_rate_limit(tenant_id: UUID, user_id: UUID | None) -> None:
    """
    Enforce queries per minute.
    Simple sliding/fixed window rate limit per tenant.
    Max 30 queries per minute per tenant.
    """
    if not _redis_pool:
        return  # Fail open if Redis is down — rate limiting is secondary

    key = f"rate_limit:tenant:{tenant_id}"

    try:
        requests = await _redis_pool.incr(key)
        if requests == 1:
            await _redis_pool.expire(key, 60)

        if requests > 30:
            logger.warning("rate_limit_exceeded", tenant_id=str(tenant_id))
            raise HTTPException(status_code=429, detail="Too many requests. Please slow down and try again in a minute.")
    except redis.RedisError as e:
        logger.error("redis_rate_limit_error", error=str(e))
        # Fail open for rate limiting — availability > protection here
        return


async def check_login_rate_limit(ip_address: str) -> None:
    """
    Enforce login attempts per IP.
    Max 5 login attempts per 15 minutes per IP address.
    """
    if not _redis_pool:
        return

    key = f"login_rate:{ip_address}"

    try:
        attempts = await _redis_pool.incr(key)
        if attempts == 1:
            await _redis_pool.expire(key, 900)  # 15 minutes

        if attempts > 5:
            logger.warning("login_rate_limit_exceeded", ip=ip_address)
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Please try again in 15 minutes."
            )
    except redis.RedisError as e:
        logger.error("redis_login_rate_error", error=str(e))
        return


async def track_token_usage(tenant_id: UUID, agent_name: str, tokens: int) -> None:
    """Track LLM tokens consumed for billing and cost management."""
    if not _redis_pool or tokens <= 0:
        return

    # Dynamic month key — no more hardcoded values
    month_key = datetime.utcnow().strftime("%Y-%m")
    key = f"cost:{tenant_id}:{month_key}"
    agent_key = f"cost:{tenant_id}:{month_key}:{agent_name}"

    try:
        pipe = _redis_pool.pipeline()
        pipe.incrby(key, tokens)
        pipe.incrby(agent_key, tokens)
        # Set TTL of 90 days so old billing data auto-expires
        pipe.expire(key, 60 * 60 * 24 * 90)
        pipe.expire(agent_key, 60 * 60 * 24 * 90)
        await pipe.execute()
    except redis.RedisError as e:
        logger.error("redis_token_track_error", error=str(e))
