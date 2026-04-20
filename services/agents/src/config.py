from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Service
    host: str = "0.0.0.0"
    port: int = 8083

    # Database & Redis
    database_url: str = "postgresql://school_admin:school_sis_dev_2026@localhost:5432/school_sis"
    redis_url: str = "redis://localhost:6379/0"

    # Cloud LLM Configuration (Cerebras)
    llm_api_key: str = "csk-vfrek62k49v6c6eytt2tn6e6mvt9t95c2hfrwd2vvdw4e2ff"
    llm_base_url: str = "https://api.cerebras.ai/v1"
    llm_model: str = "llama3.1-70b"
    embed_model: str = "nvidia/nv-embedqa-e5-v5"  # Fallback valid NIM embedding model

    # Embedding
    embedding_dim: int = 1024

    # Agent behavior
    max_tool_calls: int = 10
    llm_timeout_seconds: int = 120
    default_temperature: float = 0.1
    max_tokens: int = 4096

    model_config = {"env_prefix": "AGENT_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
