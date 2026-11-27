"""categories and contracts

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-27
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

S = "app"
# Stable ids so every environment seeds the same system categories.
_NS = uuid.UUID("6f1c2d0e-5a4b-4c8e-9a57-3b1e0f7d2c11")

# (key, name, parent_key, kind)
_E, _I = "expense", "income"
SYSTEM_CATEGORIES = [
    ("insurance", "Insurance", None, _E),
    ("insurance.home", "Home insurance", "insurance", _E),
    ("insurance.car", "Car insurance", "insurance", _E),
    ("insurance.health", "Health insurance", "insurance", _E),
    ("insurance.life", "Life insurance", "insurance", _E),
    ("insurance.liability", "Liability insurance", "insurance", _E),
    ("insurance.other", "Other insurance", "insurance", _E),
    ("utility", "Utilities", None, _E),
    ("utility.electricity", "Electricity", "utility", _E),
    ("utility.gas", "Gas", "utility", _E),
    ("utility.water", "Water", "utility", _E),
    ("utility.internet", "Internet", "utility", _E),
    ("utility.phone", "Phone", "utility", _E),
    ("utility.waste", "Waste", "utility", _E),
    ("subscription", "Subscriptions", None, _E),
    ("subscription.streaming", "Streaming", "subscription", _E),
    ("subscription.software", "Software", "subscription", _E),
    ("subscription.news", "News and magazines", "subscription", _E),
    ("subscription.other", "Other subscription", "subscription", _E),
    ("membership", "Memberships", None, _E),
    ("membership.gym", "Gym", "membership", _E),
    ("membership.kids_activity", "Kids activity", "membership", _E),
    ("membership.club", "Club or association", "membership", _E),
    ("housing", "Housing", None, _E),
    ("housing.rent", "Rent", "housing", _E),
    ("housing.mortgage", "Mortgage", "housing", _E),
    ("transport", "Transport", None, _E),
    ("food", "Food", None, _E),
    ("health", "Health", None, _E),
    ("kids", "Kids", None, _E),
    ("other", "Other", None, _E),
    ("income", "Income", None, _I),
    ("income.salary", "Salary", "income", _I),
    ("income.business", "Business", "income", _I),
    ("income.other", "Other income", "income", _I),
]


def upgrade() -> None:
    categories = op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("parent_key", sa.Text(), nullable=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("space_id", sa.Uuid(), sa.ForeignKey(f"{S}.spaces.id", ondelete="CASCADE")),
        sa.CheckConstraint("kind IN ('expense', 'income')", name="ck_categories_kind"),
        schema=S,
    )
    op.create_index(
        "uq_categories_system_key",
        "categories",
        ["key"],
        unique=True,
        schema=S,
        postgresql_where=sa.text("space_id IS NULL"),
    )
    op.create_index(
        "uq_categories_space_key",
        "categories",
        ["space_id", "key"],
        unique=True,
        schema=S,
        postgresql_where=sa.text("space_id IS NOT NULL"),
    )
    op.bulk_insert(
        categories,
        [
            {
                "id": uuid.uuid5(_NS, key),
                "key": key,
                "name": name,
                "parent_key": parent,
                "kind": kind,
                "space_id": None,
            }
            for key, name, parent, kind in SYSTEM_CATEGORIES
        ],
    )

    op.create_table(
        "contracts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("space_id", sa.Uuid(), sa.ForeignKey(f"{S}.spaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", sa.Uuid(), sa.ForeignKey(f"{S}.categories.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=True),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("frequency", sa.Text(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("auto_renew", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("renewal_term_months", sa.Integer(), nullable=True),
        sa.Column("notice_period_days", sa.Integer(), nullable=True),
        sa.Column("member_user_id", sa.Uuid(), sa.ForeignKey(f"{S}.users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey(f"{S}.users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_contracts_amount_positive"),
        sa.CheckConstraint(
            "frequency IN ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual')",
            name="ck_contracts_frequency",
        ),
        sa.CheckConstraint("status IN ('active', 'cancelled')", name="ck_contracts_status"),
        sa.CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_contracts_dates"),
        sa.CheckConstraint(
            "renewal_term_months IS NULL OR renewal_term_months > 0", name="ck_contracts_term"
        ),
        sa.CheckConstraint(
            "notice_period_days IS NULL OR notice_period_days >= 0", name="ck_contracts_notice"
        ),
        schema=S,
    )
    op.create_index("ix_contracts_space_id_created_at", "contracts", ["space_id", "created_at", "id"], schema=S)
    op.create_index("ix_contracts_category_id", "contracts", ["category_id"], schema=S)


def downgrade() -> None:
    op.drop_table("contracts", schema=S)
    op.drop_table("categories", schema=S)
