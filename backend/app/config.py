import secrets
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="STORE_",
        env_file=Path(__file__).resolve().parents[1] / ".env",
        extra="ignore",
    )
    environment: Literal["development", "production", "test"] = "development"
    database_url: str = "sqlite:///./store.db"
    secret_key: str | None = None
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    allowed_hosts: list[str] = Field(
        default_factory=lambda: ["localhost", "127.0.0.1", "testserver"]
    )
    cookie_name: str = "store_session"
    session_days: int = Field(default=14, ge=1, le=30)
    max_body_bytes: int = Field(default=1_048_576, ge=1024, le=10_485_760)

    @model_validator(mode="after")
    def validate_production(self):
        if self.environment == "production":
            if not self.database_url.startswith("postgresql+psycopg://"):
                raise ValueError("Production requires a postgresql+psycopg database URL.")
            if not self.secret_key or len(self.secret_key) < 50:
                raise ValueError(
                    "Production requires a persistent random STORE_SECRET_KEY (50+ chars)."
                )
            if not self.allowed_hosts or "*" in self.allowed_hosts:
                raise ValueError("Production requires explicit STORE_ALLOWED_HOSTS.")
            if any(not origin.startswith("https://") for origin in self.allowed_origins):
                raise ValueError("Production frontend origins must use HTTPS.")
        if "*" in self.allowed_origins:
            raise ValueError("Credentialed CORS requires exact origins, not '*'.")
        if not self.secret_key:
            self.secret_key = secrets.token_hex(32)
        return self
