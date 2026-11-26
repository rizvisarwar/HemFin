import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from hemfin.core.db import APP_SCHEMA, Base


class SpaceType(enum.StrEnum):
    personal = "personal"
    household = "household"


class Role(enum.StrEnum):
    owner = "owner"
    admin = "admin"
    member = "member"

    @property
    def rank(self) -> int:
        return {"member": 1, "admin": 2, "owner": 3}[self.value]


class Space(Base):
    __tablename__ = "spaces"
    __table_args__ = (
        CheckConstraint("type IN ('personal', 'household')", name="ck_spaces_type"),
        # At most one personal space per user.
        Index(
            "uq_spaces_one_personal_per_user",
            "created_by",
            unique=True,
            postgresql_where="type = 'personal'",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    type: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    created_by: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SpaceMembership(Base):
    __tablename__ = "space_memberships"
    __table_args__ = (
        CheckConstraint("role IN ('owner', 'admin', 'member')", name="ck_space_memberships_role"),
        UniqueConstraint("space_id", "user_id", name="uq_space_memberships_space_user"),
        Index("ix_space_memberships_user_id", "user_id"),
        # Exactly one owner per space.
        Index(
            "uq_space_memberships_one_owner",
            "space_id",
            unique=True,
            postgresql_where="role = 'owner'",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    space_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.spaces.id", ondelete="CASCADE")
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
