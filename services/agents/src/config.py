from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Service
    host: str = "0.0.0.0"
    port: int = 8083

    # Database
    database_url: str = "postgresql://school_admin:school_sis_dev_2026@localhost:5432/school_sis"

    # Inference engine
    inference_url: str = "http://localhost:8081"

    # Embedding
    embedding_dim: int = 768

    # Agent behavior
    max_tool_calls: int = 10
    llm_timeout_seconds: int = 120
    default_temperature: float = 0.1
    max_tokens: int = 4096

    model_config = {"env_prefix": "AGENT_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
