from collections.abc import AsyncIterator

from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from hemfin.core.config import get_settings

APP_SCHEMA = "app"


class Base(DeclarativeBase):
    """Declarative base; all tables live in the `app` schema."""

    metadata = MetaData(schema=APP_SCHEMA)


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        url = get_settings().DATABASE_URL
        if not url:
            raise RuntimeError("DATABASE_URL is not configured")
        _engine = create_async_engine(
            url,
            pool_pre_ping=True,
            # Required for Supabase transaction pooler (pgbouncer): no prepared statements.
            connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
        )
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def get_session() -> AsyncIterator[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        yield session


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
