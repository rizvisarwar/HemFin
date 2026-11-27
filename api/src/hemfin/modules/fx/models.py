from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CHAR, CheckConstraint, Date, DateTime, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from hemfin.core.db import Base


class FxRate(Base):
    """One ECB euro reference rate: 1 EUR = `rate` units of `quote` on `rate_date`."""

    __tablename__ = "fx_rates"
    __table_args__ = (
        CheckConstraint("base = 'EUR'", name="ck_fx_rates_base_eur"),
        CheckConstraint("rate > 0", name="ck_fx_rates_rate_positive"),
    )

    rate_date: Mapped[date] = mapped_column(Date, primary_key=True)
    quote: Mapped[str] = mapped_column(CHAR(3), primary_key=True)
    base: Mapped[str] = mapped_column(CHAR(3), server_default="EUR")
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 8))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
