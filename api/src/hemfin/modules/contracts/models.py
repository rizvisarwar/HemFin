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
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from hemfin.core.db import APP_SCHEMA, Base


class ContractStatus(enum.StrEnum):
    active = "active"
    cancelled = "cancelled"


class Contract(Base):
    """A recurring obligation (insurance, utility, subscription, membership, ...)."""

    __tablename__ = "contracts"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_contracts_amount_positive"),
        CheckConstraint(
            "frequency IN ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual')",
            name="ck_contracts_frequency",
        ),
        CheckConstraint("status IN ('active', 'cancelled')", name="ck_contracts_status"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_contracts_dates"),
        CheckConstraint(
            "renewal_term_months IS NULL OR renewal_term_months > 0", name="ck_contracts_term"
        ),
        CheckConstraint(
            "notice_period_days IS NULL OR notice_period_days >= 0", name="ck_contracts_notice"
        ),
        Index("ix_contracts_space_id_created_at", "space_id", "created_at", "id"),
        Index("ix_contracts_category_id", "category_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    space_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.spaces.id", ondelete="CASCADE")
    )
    category_id: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.categories.id"))
    name: Mapped[str] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    currency: Mapped[str] = mapped_column(String(3), server_default="SEK")
    frequency: Mapped[str] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    auto_renew: Mapped[bool] = mapped_column(Boolean, server_default="false", default=False)
    renewal_term_months: Mapped[int | None] = mapped_column(Integer)
    notice_period_days: Mapped[int | None] = mapped_column(Integer)
    member_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.users.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(Text, server_default="active", default="active")
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
