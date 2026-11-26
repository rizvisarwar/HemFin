"""exactly one owner per space (partial unique index)

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

S = "app"


def upgrade() -> None:
    op.create_index(
        "uq_space_memberships_one_owner",
        "space_memberships",
        ["space_id"],
        unique=True,
        schema=S,
        postgresql_where=sa.text("role = 'owner'"),
    )


def downgrade() -> None:
    op.drop_index("uq_space_memberships_one_owner", table_name="space_memberships", schema=S)
