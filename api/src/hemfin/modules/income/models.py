import enum
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from hemfin.core.db import APP_SCHEMA, Base


class IncomeType(enum.StrEnum):
    salary = "salary"
    business = "business"
    other = "other"


class IncomeFrequency(enum.StrEnum):
    """The contract frequencies plus `irregular`."""

    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    semiannual = "semiannual"
    annual = "annual"
    irregular = "irregular"


class IncomeSource(Base):
    """A recurring (or irregular) source of income, such as a salary."""

    __tablename__ = "income_sources"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_income_sources_amount_positive"),
        CheckConstraint("type IN ('salary', 'business', 'other')", name="ck_income_sources_type"),
        CheckConstraint(
            "frequency IN ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'irregular')",
            name="ck_income_sources_frequency",
        ),
        Index("ix_income_sources_space_id_created_at", "space_id", "created_at", "id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    space_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.spaces.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    currency: Mapped[str] = mapped_column(String(3))
    frequency: Mapped[str] = mapped_column(Text)
    member_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.users.id", ondelete="SET NULL")
    )
    active: Mapped[bool] = mapped_column(Boolean, server_default="true", default=True)
    created_by: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class IncomeEntry(Base):
    """Income received on a date, optionally from a source."""

    __tablename__ = "income_entries"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_income_entries_amount_positive"),
        Index("ix_income_entries_space_id_received_on", "space_id", "received_on", "id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    space_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.spaces.id", ondelete="CASCADE")
    )
    source_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.income_sources.id", ondelete="SET NULL")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    currency: Mapped[str] = mapped_column(String(3))
    received_on: Mapped[date] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)
    member_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.users.id", ondelete="SET NULL")
    )
    created_by: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
