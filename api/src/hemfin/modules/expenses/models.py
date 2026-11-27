from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
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


class Expense(Base):
    """A one-off expense."""

    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
        Index("ix_expenses_space_id_spent_on", "space_id", "spent_on", "id"),
        Index("ix_expenses_category_id", "category_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    space_id: Mapped[UUID] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.spaces.id", ondelete="CASCADE")
    )
    category_id: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.categories.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    currency: Mapped[str] = mapped_column(String(3))
    spent_on: Mapped[date] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)
    merchant: Mapped[str | None] = mapped_column(Text)
    contract_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.contracts.id", ondelete="SET NULL")
    )
    member_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.users.id", ondelete="SET NULL")
    )
    created_by: Mapped[UUID] = mapped_column(ForeignKey(f"{APP_SCHEMA}.users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
