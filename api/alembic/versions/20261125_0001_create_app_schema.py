"""create app schema

Revision ID: 0001
Revises:
Create Date: 2026-11-25
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS app")


def downgrade() -> None:
    # Intentionally a no-op: schema `app` holds `app.alembic_version`, so dropping it would
    # break `alembic downgrade base` (the version row delete would fail).
    pass
