"""ScholarMind Agent Service — FastAPI entry point."""

from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.core.rag import RAGPipeline
from src.api.routes import router, init_agents, _indexer
from src.indexing.listener import IndexingListener
from src.core.security import init_redis, close_redis

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("agent_service_starting", port=settings.port)

    # Initialize Redis for rate limiting & token tracking
    await init_redis()

    # Initialize RAG pipeline
    rag = RAGPipeline()

    # Initialize all agents and indexer
    init_agents(rag)
    logger.info("agents_initialized")

    # Start the real-time indexing listener
    listener = None
    if _indexer:
        listener = IndexingListener(_indexer)
        await listener.start()

    yield

    # Cleanup
    if listener:
        await listener.stop()
    await rag.close()
    await close_redis()
    logger.info("agent_service_stopped")


app = FastAPI(
    title="ScholarMind Agent Service",
    description="AI-first agent orchestration for education management",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for Vercel demo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "scholarmind-agents"}


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="info",
    )
