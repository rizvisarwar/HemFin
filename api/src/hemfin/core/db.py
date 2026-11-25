from collections.abc import AsyncIterator

from sqlalchemy import MetaData
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from hemfin.core.config import InvalidSecretError, get_settings

APP_SCHEMA = "app"


class Base(DeclarativeBase):
    """Declarative base; all tables live in the `app` schema."""

    metadata = MetaData(schema=APP_SCHEMA)


def parse_database_url(raw: str) -> URL:
    """Parse the DB URL. Parser errors echo the URL, so they are replaced by fixed text.

    The raise happens outside the except block so no exception context holds the value.
    """
    url: URL | None = None
    try:
        url = make_url(raw)
        url.get_dialect()
    except Exception:
        url = None
    if url is None:
        raise InvalidSecretError("DATABASE_URL is malformed")
    return url


def build_engine(raw: str) -> AsyncEngine:
    url = parse_database_url(raw)
    engine: AsyncEngine | None = None
    try:
        engine = create_async_engine(
            url,
            pool_pre_ping=True,
            # Required for Supabase transaction pooler (pgbouncer): no prepared statements.
            connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
        )
    except Exception:
        engine = None
    if engine is None:
        raise InvalidSecretError("DATABASE_URL could not be used to create an engine")
    return engine


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        _engine = build_engine(get_settings().require_database_url())
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def get_session() -> AsyncIterator[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        yield session


def get_session_ctx() -> AsyncSession:
    """A session usable as `async with get_session_ctx() as s` (services, scripts, tests)."""
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker()


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
