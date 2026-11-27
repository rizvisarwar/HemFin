"""fx_rates

Revision ID: 0007
Revises: 0005
Create Date: 2026-11-27
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
# NOTE for PM: HEM-018 adds 0006. Re-point this to "0006" when the chain is rebased at merge.
down_revision = "0005"
branch_labels = None
depends_on = None

S = "app"


def upgrade() -> None:
    op.create_table(
        "fx_rates",
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("base", sa.CHAR(3), server_default="EUR", nullable=False),
        sa.Column("quote", sa.CHAR(3), nullable=False),
        sa.Column("rate", sa.Numeric(18, 8), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("rate_date", "quote", name="pk_fx_rates"),
        sa.CheckConstraint("base = 'EUR'", name="ck_fx_rates_base_eur"),
        sa.CheckConstraint("rate > 0", name="ck_fx_rates_rate_positive"),
        schema=S,
    )


def downgrade() -> None:
    op.drop_table("fx_rates", schema=S)
