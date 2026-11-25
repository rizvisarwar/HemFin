"""users, spaces, space_memberships

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

S = "app"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema=S,
    )
    op.create_table(
        "spaces",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey(f"{S}.users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("type IN ('personal', 'household')", name="ck_spaces_type"),
        schema=S,
    )
    op.create_index(
        "uq_spaces_one_personal_per_user",
        "spaces",
        ["created_by"],
        unique=True,
        schema=S,
        postgresql_where=sa.text("type = 'personal'"),
    )
    op.create_table(
        "space_memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("space_id", sa.Uuid(), sa.ForeignKey(f"{S}.spaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('owner', 'admin', 'member')", name="ck_space_memberships_role"),
        sa.UniqueConstraint("space_id", "user_id", name="uq_space_memberships_space_user"),
        schema=S,
    )
    op.create_index("ix_space_memberships_user_id", "space_memberships", ["user_id"], schema=S)


def downgrade() -> None:
    op.drop_table("space_memberships", schema=S)
    op.drop_table("spaces", schema=S)
    op.drop_table("users", schema=S)
