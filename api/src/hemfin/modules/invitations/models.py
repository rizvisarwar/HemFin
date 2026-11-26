import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from hemfin.core.db import APP_SCHEMA, Base


class InvitationStatus(enum.StrEnum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    revoked = "revoked"
    expired = "expired"


class Invitation(Base):
    """An invitation to a household. Only the SHA-256 of the token is stored."""

    __tablename__ = "invitations"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'member')", name="ck_invitations_role"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')",
            name="ck_invitations_status",
        ),
        # One pending invitation per space and email.
        Index(
            "uq_invitations_one_pending_per_space_email",
            "space_id",
            "email",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        Index("ix_invitations_space_id_created_at", "space_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    space_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.spaces.id", ondelete="CASCADE")
    )
    email: Mapped[str] = mapped_column(Text)  # stored lower-cased
    role: Mapped[str] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    status: Mapped[str] = mapped_column(Text, default=InvitationStatus.pending)
    invited_by: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.users.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Resend rate limit: at most MAX_RESENDS_PER_DAY within a rolling window.
    resend_count: Mapped[int] = mapped_column(Integer, server_default="0", default=0)
    resend_window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
