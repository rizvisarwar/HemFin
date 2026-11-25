from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, false, func, text
from sqlalchemy.orm import Mapped, mapped_column

from hemfin.core.db import APP_SCHEMA, Base


class Profile(Base):
    """One-to-one with users. Created lazily on first read or write."""

    __tablename__ = "profiles"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.users.id", ondelete="CASCADE"), primary_key=True
    )
    phone_e164: Mapped[str | None] = mapped_column(String(16))
    base_currency: Mapped[str] = mapped_column(String(3), server_default="EUR")
    locale: Mapped[str] = mapped_column(String(35), server_default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Address(Base):
    __tablename__ = "addresses"
    __table_args__ = (
        # At most one default address per user.
        Index(
            "uq_addresses_one_default_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
        Index("ix_addresses_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.users.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(50))
    line1: Mapped[str] = mapped_column(String(200))
    line2: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100))
    region: Mapped[str | None] = mapped_column(String(100))
    postcode: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(2))
    is_default: Mapped[bool] = mapped_column(Boolean, server_default=false(), default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
