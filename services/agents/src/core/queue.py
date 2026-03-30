"""ARQ Redis Queue Configuration."""

from arq.connections import RedisSettings
from src.config import settings

redis_settings = RedisSettings.from_dsn(settings.redis_url)

_redis_pool = None

# This will be used by FastAPI to connect to the pool to enqueue jobs.
async def get_redis_pool():
    global _redis_pool
    if _redis_pool is None:
        from arq import create_pool
        _redis_pool = await create_pool(redis_settings)
    return _redis_pool
