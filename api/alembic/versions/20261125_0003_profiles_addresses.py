"""profiles and addresses

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

S = "app"


def _ts(name: str) -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("phone_e164", sa.String(16), nullable=True),
        sa.Column("base_currency", sa.String(3), server_default="EUR", nullable=False),
        sa.Column("locale", sa.String(35), server_default="en", nullable=False),
        _ts("created_at"),
        _ts("updated_at"),
        schema=S,
    )
    op.create_table(
        "addresses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("line1", sa.String(200), nullable=False),
        sa.Column("line2", sa.String(200), nullable=True),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column("postcode", sa.String(20), nullable=True),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        _ts("created_at"),
        _ts("updated_at"),
        schema=S,
    )
    op.create_index("ix_addresses_user_id", "addresses", ["user_id"], schema=S)
    op.create_index(
        "uq_addresses_one_default_per_user",
        "addresses",
        ["user_id"],
        unique=True,
        schema=S,
        postgresql_where=sa.text("is_default"),
    )


def downgrade() -> None:
    op.drop_table("addresses", schema=S)
    op.drop_table("profiles", schema=S)
