"""SEK only: drop fx_rates, default currency to SEK

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-27

No CHECK on the currency columns: rows written before this may hold other codes (demo use),
and they keep displaying their own code. The profile `base_currency` column stays, readable.
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

S = "app"
_TABLES = ("contracts", "expenses", "income_sources", "income_entries")


def upgrade() -> None:
    op.drop_table("fx_rates", schema=S)
    for table in _TABLES:
        op.alter_column(table, "currency", server_default="SEK", schema=S)
    op.alter_column("profiles", "base_currency", server_default="SEK", schema=S)


def downgrade() -> None:
    op.alter_column("profiles", "base_currency", server_default="EUR", schema=S)
    for table in _TABLES:
        op.alter_column(table, "currency", server_default=None, schema=S)
    # As in 0007.
    op.create_table(
        "fx_rates",
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("base", sa.CHAR(3), server_default="EUR", nullable=False),
        sa.Column("quote", sa.CHAR(3), nullable=False),
        sa.Column("rate", sa.Numeric(18, 8), nullable=False),
        sa.Column(
            "fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("rate_date", "quote", name="pk_fx_rates"),
        sa.CheckConstraint("base = 'EUR'", name="ck_fx_rates_base_eur"),
        sa.CheckConstraint("rate > 0", name="ck_fx_rates_rate_positive"),
        schema=S,
    )
