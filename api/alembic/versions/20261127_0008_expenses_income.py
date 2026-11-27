"""expenses, income_sources, income_entries

Revision ID: 0008
Revises: 0006
Create Date: 2026-11-27
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0006"
branch_labels = None
depends_on = None

S = "app"


def _common() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("space_id", sa.Uuid(), sa.ForeignKey(f"{S}.spaces.id", ondelete="CASCADE"), nullable=False),
    ]


def _tail() -> list[sa.Column]:
    return [
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey(f"{S}.users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def _member() -> sa.Column:
    return sa.Column(
        "member_user_id", sa.Uuid(), sa.ForeignKey(f"{S}.users.id", ondelete="SET NULL"), nullable=True
    )


def upgrade() -> None:
    op.create_table(
        "expenses",
        *_common(),
        sa.Column("category_id", sa.Uuid(), sa.ForeignKey(f"{S}.categories.id"), nullable=False),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("spent_on", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("merchant", sa.Text(), nullable=True),
        sa.Column("contract_id", sa.Uuid(), sa.ForeignKey(f"{S}.contracts.id", ondelete="SET NULL"), nullable=True),
        _member(),
        *_tail(),
        sa.CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
        schema=S,
    )
    op.create_index("ix_expenses_space_id_spent_on", "expenses", ["space_id", "spent_on", "id"], schema=S)
    op.create_index("ix_expenses_category_id", "expenses", ["category_id"], schema=S)

    op.create_table(
        "income_sources",
        *_common(),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("frequency", sa.Text(), nullable=False),
        _member(),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        *_tail(),
        sa.CheckConstraint("amount > 0", name="ck_income_sources_amount_positive"),
        sa.CheckConstraint("type IN ('salary', 'business', 'other')", name="ck_income_sources_type"),
        sa.CheckConstraint(
            "frequency IN ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'irregular')",
            name="ck_income_sources_frequency",
        ),
        schema=S,
    )
    op.create_index(
        "ix_income_sources_space_id_created_at", "income_sources", ["space_id", "created_at", "id"], schema=S
    )

    op.create_table(
        "income_entries",
        *_common(),
        sa.Column(
            "source_id", sa.Uuid(), sa.ForeignKey(f"{S}.income_sources.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("received_on", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        _member(),
        *_tail(),
        sa.CheckConstraint("amount > 0", name="ck_income_entries_amount_positive"),
        schema=S,
    )
    op.create_index(
        "ix_income_entries_space_id_received_on", "income_entries", ["space_id", "received_on", "id"], schema=S
    )


def downgrade() -> None:
    op.drop_table("income_entries", schema=S)
    op.drop_table("income_sources", schema=S)
    op.drop_table("expenses", schema=S)
