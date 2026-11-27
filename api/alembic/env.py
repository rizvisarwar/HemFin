import asyncio

from alembic import context
from sqlalchemy import text
from sqlalchemy.engine import Connection

from hemfin.core.config import get_settings
from hemfin.core.db import APP_SCHEMA, Base, build_engine, parse_database_url
from hemfin.modules.categories import models as _categories_models  # noqa: F401
from hemfin.modules.contracts import models as _contracts_models  # noqa: F401
from hemfin.modules.fx import models as _fx_models  # noqa: F401
from hemfin.modules.invitations import models as _invitations_models  # noqa: F401
from hemfin.modules.profile import models as _profile_models  # noqa: F401
from hemfin.modules.spaces import models as _spaces_models  # noqa: E402,F401  (register tables)
from hemfin.modules.users import models as _users_models  # noqa: E402,F401

target_metadata = Base.metadata


def _url() -> str:
    raw = get_settings().require_database_url()
    parse_database_url(raw)  # fixed-text error if malformed
    return raw


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        version_table_schema=APP_SCHEMA,
        include_schemas=True,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _run(connection: Connection) -> None:
    # The version table lives in `app`, so the schema must exist before alembic touches it.
    connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {APP_SCHEMA}"))
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=APP_SCHEMA,
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = build_engine(_url())
    async with engine.connect() as conn:
        await conn.run_sync(_run)
        await conn.commit()
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
