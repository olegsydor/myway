from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: Literal["development", "production", "test"] = "development"

    public_origin: str = "http://localhost:5173"
    auth_secret: str = "development-only-change-before-production"
    registration_enabled: bool = True
    session_idle_days: int = 7
    session_absolute_days: int = 30
    verify_ttl_hours: int = 24
    reset_ttl_minutes: int = 30
    mail_mode: str = "smtp"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    smtp_from: str = "My Way <noreply@localhost>"
    mail_sink_path: str = "/tmp/myway-mail"

    @model_validator(mode="after")
    def validate_auth_config(self):
        from urllib.parse import urlsplit
        parsed = urlsplit(self.public_origin)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
            raise ValueError("PUBLIC_ORIGIN must be an origin without path or credentials")
        if self.mail_mode not in ("smtp", "file"):
            raise ValueError("MAIL_MODE must be smtp or file")
        if min(self.session_idle_days, self.session_absolute_days, self.verify_ttl_hours, self.reset_ttl_minutes) <= 0:
            raise ValueError("Auth lifetimes must be positive")
        if self.is_production and (parsed.scheme != "https" or len(self.auth_secret) < 32 or self.auth_secret.startswith(("development", "replace", "change")) or self.mail_mode != "smtp" or not self.smtp_starttls):
            raise ValueError("Production requires HTTPS, a private AUTH_SECRET, SMTP and STARTTLS")
        return self

    @property
    def session_cookie(self):
        return "__Host-myway_session" if self.is_production else "myway_session_dev"

    @property
    def csrf_cookie(self):
        return "__Host-myway_csrf" if self.is_production else "myway_csrf_dev"

    postgres_db: str
    postgres_user: str
    postgres_password: str
    postgres_host: str
    postgres_port: int = 5432

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://"
            f"{self.postgres_user}:"
            f"{self.postgres_password}@"
            f"{self.postgres_host}:"
            f"{self.postgres_port}/"
            f"{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()