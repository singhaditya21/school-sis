from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Service
    host: str = "0.0.0.0"
    port: int = 8083

    # Database & Redis
    database_url: str = "postgresql://school_admin:school_sis_dev_2026@localhost:5432/school_sis"
    redis_url: str = "redis://localhost:6379/0"

    # Cloud LLM Configuration (NVIDIA NIM)
    nvidia_api_key: str = "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"
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_model: str = "z-ai/glm4.7"
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
