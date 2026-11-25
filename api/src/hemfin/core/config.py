import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import SecretStr, field_validator
from pydantic_settings import (
    BaseSettings,
    NoDecode,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

DEFAULT_SECRETS_DIR = "/etc/secrets"


class MissingSecretError(RuntimeError):
    """A required secret is not configured. The message names the variable, never a value."""


class Settings(BaseSettings):
    """App config. Source priority: env vars > secret files in SECRETS_DIR > .env.

    Secret fields are SecretStr with no default. Never log this object.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Secrets. Optional at load time so non-DB code and tests run without a database;
    # `require_database_url()` fails loudly when the DB is actually used.
    DATABASE_URL: SecretStr | None = None

    # Non-secret settings
    APP_ENV: str = "local"
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    LOG_LEVEL: str = "INFO"
    SUPABASE_URL: str = ""
    SUPABASE_JWT_AUDIENCE: str = "authenticated"

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (init_settings, env_settings, file_secret_settings, dotenv_settings)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: Any) -> Any:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _async_driver(cls, v: Any) -> Any:
        raw = v.get_secret_value() if isinstance(v, SecretStr) else v
        if not raw:
            return None
        if isinstance(raw, str):
            for prefix in ("postgresql://", "postgres://"):
                if raw.startswith(prefix):
                    return "postgresql+asyncpg://" + raw[len(prefix) :]
        return raw

    def require_database_url(self) -> str:
        if self.DATABASE_URL is None:
            raise MissingSecretError(
                "DATABASE_URL is not configured. Set it as an env var, a secret file named "
                "DATABASE_URL in SECRETS_DIR, or in .env."
            )
        return self.DATABASE_URL.get_secret_value()


def load_settings(secrets_dir: str | Path | None = None) -> Settings:
    """Build Settings; a missing secrets directory is skipped without failing."""
    directory = Path(secrets_dir or os.environ.get("SECRETS_DIR", DEFAULT_SECRETS_DIR))
    if directory.is_dir():
        return Settings(_secrets_dir=directory)  # type: ignore[call-arg]
    return Settings()


@lru_cache
def get_settings() -> Settings:
    return load_settings()
