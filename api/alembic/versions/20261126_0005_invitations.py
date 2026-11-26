"""invitations

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

S = "app"


def upgrade() -> None:
    op.create_table(
        "invitations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("space_id", sa.Uuid(), sa.ForeignKey(f"{S}.spaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("invited_by", sa.Uuid(), sa.ForeignKey(f"{S}.users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resend_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("resend_window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("token_hash", name="invitations_token_hash_key"),
        sa.CheckConstraint("email = lower(email)", name="ck_invitations_email_lower"),
        sa.CheckConstraint("resend_count >= 0", name="ck_invitations_resend_count"),
        sa.CheckConstraint("role IN ('admin', 'member')", name="ck_invitations_role"),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')",
            name="ck_invitations_status",
        ),
        schema=S,
    )
    op.create_index(
        "uq_invitations_one_pending_per_space_email",
        "invitations",
        ["space_id", "email"],
        unique=True,
        schema=S,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index("ix_invitations_space_id_created_at", "invitations", ["space_id", "created_at"], schema=S)
    op.create_index(
        "ix_invitations_pending_expires_at",
        "invitations",
        ["expires_at"],
        schema=S,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_table("invitations", schema=S)
