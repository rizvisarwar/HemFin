"""`base_amount` for records: the amount in the caller's profile base currency."""

from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.money import MoneyBase
from hemfin.modules.fx.service import convert_many
from hemfin.modules.profile.service import get_profile


async def base_amounts(
    session: AsyncSession, user_id: UUID, items: Sequence[tuple[Decimal, str, date]]
) -> list[MoneyBase | None]:
    """One entry per (amount, currency, date). None when no rate exists (never guessed)."""
    if not items:
        return []
    base = (await get_profile(session, user_id)).base_currency
    converted = await convert_many(session, base, items)
    return [None if c is None else MoneyBase(amount=c, currency=base) for c in converted]
