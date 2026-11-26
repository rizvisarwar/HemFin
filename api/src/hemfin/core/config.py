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


class InvalidSecretError(RuntimeError):
    """A secret is configured but unusable. Fixed message only, never the value."""


class Settings(BaseSettings):
    """App config. Source priority: env vars > secret files in SECRETS_DIR > .env.

    Secret fields are SecretStr with no default. Never log this object.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Secrets. Optional at load time so non-DB code and tests run without a database;
    # `require_database_url()` fails loudly when the DB is actually used.
    DATABASE_URL: SecretStr | None = None
    # Local/test only: HS256 secret of the local Supabase CLI stack (see core/security.py).
    # Ignored (HS256 stays off) unless APP_ENV is local or test.
    SUPABASE_JWT_SECRET: SecretStr | None = None
    # Optional: without it the app starts and invitation emails return a 503 problem.
    RESEND_API_KEY: SecretStr | None = None
    # Shared secret for /internal/jobs/*; without it those endpoints return 503.
    JOB_SECRET: SecretStr | None = None

    # Non-secret settings
    # Defaults to production so nothing local-only (HS256 tokens, test mode) is on unless the
    # environment says so explicitly. Local dev sets APP_ENV=local (api/.env.example).
    APP_ENV: str = "production"
    # Test-only switch: skips the startup fail-fast on DATABASE_URL. Set by tests/conftest.py
    # only. Never set it in a deployment; the app refuses to start if it is set while
    # APP_ENV is anything other than local or test.
    HEMFIN_TEST_MODE: bool = False
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    LOG_LEVEL: str = "INFO"
    SUPABASE_URL: str = ""
    # Sender address for invitation emails (a verified Resend sender). Empty disables sending.
    EMAIL_FROM: str = ""
    # Public web origin used to build invite links (the token goes in the URL fragment).
    WEB_BASE_URL: str = "http://localhost:3000"
    SUPABASE_JWT_AUDIENCE: str = "authenticated"
    # How long fetched signing keys are trusted, and the minimum gap between forced refetches
    # (triggered by an unknown `kid`, so a flood of bad tokens cannot hammer Supabase).
    SUPABASE_JWKS_TTL_SECONDS: int = 600
    SUPABASE_JWKS_MIN_REFETCH_SECONDS: int = 30

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
