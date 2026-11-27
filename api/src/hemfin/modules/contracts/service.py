from datetime import date, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.errors import CodedHTTPException
from hemfin.core.money import MoneyBase, validate_amount
from hemfin.core.pagination import decode_cursor, encode_cursor
from hemfin.modules.categories.models import Category
from hemfin.modules.categories.schemas import CategoryKind
from hemfin.modules.categories.service import ensure_category
from hemfin.modules.contracts.models import Contract, ContractStatus
from hemfin.modules.contracts.schedule import (
    ContractTerms,
    Frequency,
    compute_schedule,
    upcoming_events,
)
from hemfin.modules.contracts.schemas import (
    ContractCreate,
    ContractOut,
    ContractPatch,
    ScheduleOut,
    UpcomingEvent,
    UpcomingOut,
)
from hemfin.modules.spaces.service import ensure_member

MAX_UPCOMING_DAYS = 366


def terms_of(c: Contract) -> ContractTerms:
    return ContractTerms(
        start_date=c.start_date,
        frequency=Frequency(c.frequency),
        end_date=c.end_date,
        auto_renew=c.auto_renew,
        renewal_term_months=c.renewal_term_months,
        notice_period_days=c.notice_period_days,
        active=c.status == ContractStatus.active,
    )


def to_out(c: Contract, category_key: str, as_of: date) -> ContractOut:
    s = compute_schedule(terms_of(c), as_of)
    return ContractOut(
        id=c.id,
        space_id=c.space_id,
        category_id=c.category_id,
        category=category_key,
        name=c.name,
        provider=c.provider,
        amount=c.amount,
        currency=c.currency,
        frequency=Frequency(c.frequency),
        start_date=c.start_date,
        end_date=c.end_date,
        auto_renew=c.auto_renew,
        renewal_term_months=c.renewal_term_months,
        notice_period_days=c.notice_period_days,
        member_user_id=c.member_user_id,
        status=ContractStatus(c.status),
        notes=c.notes,
        created_by=c.created_by,
        created_at=c.created_at,
        updated_at=c.updated_at,
        schedule=ScheduleOut(
            next_payment_date=s.next_payment_date,
            renewal_date=s.renewal_date,
            notice_deadline=s.notice_deadline,
        ),
    )


def _invalid(code: str, detail: str) -> CodedHTTPException:
    return CodedHTTPException(422, code, detail)


async def _check_refs(
    session: AsyncSession, space_id: UUID, category_id: UUID | None, member_user_id: UUID | None
) -> None:
    """Ids must belong to this space. A foreign id gets the same 422 as an unknown one."""
    if category_id is not None:
        # Contracts are expenses: income categories are rejected like unknown ones.
        await ensure_category(session, space_id, category_id, CategoryKind.expense)
    if member_user_id is not None:
        await ensure_member(session, space_id, member_user_id)


_ROW = select(Contract, Category.key).join(Category, Category.id == Contract.category_id)


async def _get_row(
    session: AsyncSession, space_id: UUID, contract_id: UUID
) -> tuple[Contract, str]:
    row = (
        await session.execute(
            _ROW.where(Contract.id == contract_id, Contract.space_id == space_id).execution_options(
                populate_existing=True
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, detail="Contract not found.")
    return row[0], row[1]


async def create_contract(
    session: AsyncSession, *, space_id: UUID, actor: UUID, body: ContractCreate, as_of: date
) -> ContractOut:
    await _check_refs(session, space_id, body.category_id, body.member_user_id)
    c = Contract(
        space_id=space_id,
        created_by=actor,
        category_id=body.category_id,
        name=body.name,
        provider=body.provider,
        amount=body.amount,
        currency=body.currency,
        frequency=body.frequency.value,
        start_date=body.start_date,
        end_date=body.end_date,
        auto_renew=body.auto_renew,
        renewal_term_months=body.renewal_term_months,
        notice_period_days=body.notice_period_days,
        member_user_id=body.member_user_id,
        notes=body.notes,
        status=ContractStatus.active.value,
    )
    session.add(c)
    await session.commit()
    row, key = await _get_row(session, space_id, c.id)
    return to_out(row, key, as_of)


async def get_contract(
    session: AsyncSession, *, space_id: UUID, contract_id: UUID, as_of: date
) -> ContractOut:
    c, key = await _get_row(session, space_id, contract_id)
    return to_out(c, key, as_of)


async def list_contracts_page(
    session: AsyncSession,
    *,
    space_id: UUID,
    limit: int,
    cursor: str | None,
    as_of: date,
    category: str | None = None,
    status: ContractStatus | None = None,
    member_user_id: UUID | None = None,
    whole_household: bool = False,
) -> tuple[list[ContractOut], str | None]:
    stmt = _ROW.where(Contract.space_id == space_id)
    if category:
        # `insurance` matches the group and everything under it; `insurance.home` is exact.
        stmt = stmt.where(
            (Category.key == category) | Category.key.startswith(f"{category}.", autoescape=True)
        )
    if status is not None:
        stmt = stmt.where(Contract.status == status.value)
    if member_user_id is not None:
        stmt = stmt.where(Contract.member_user_id == member_user_id)
    elif whole_household:
        stmt = stmt.where(Contract.member_user_id.is_(None))
    if cursor:
        at, rid = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Contract.created_at, Contract.id) > tuple_(at, rid))
    rows = (
        await session.execute(stmt.order_by(Contract.created_at, Contract.id).limit(limit + 1))
    ).all()
    page = rows[:limit]
    items = [to_out(c, key, as_of) for c, key in page]
    nxt = None
    if len(rows) > limit:
        last = page[-1][0]
        nxt = encode_cursor(last.created_at, last.id)
    return items, nxt


async def update_contract(
    session: AsyncSession,
    *,
    space_id: UUID,
    contract_id: UUID,
    body: ContractPatch,
    as_of: date,
) -> ContractOut:
    c, _ = await _get_row(session, space_id, contract_id)
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)

    amount = changes.get("amount", c.amount)
    currency = changes.get("currency", c.currency)
    if "amount" in changes or "currency" in changes:
        try:
            validate_amount(amount, currency)
        except ValueError as exc:
            raise _invalid("invalid_amount", str(exc)) from None
    start = changes.get("start_date", c.start_date)
    end = changes.get("end_date", c.end_date)
    if end is not None and end < start:
        raise _invalid("invalid_dates", "end_date must be on or after start_date.")
    await _check_refs(session, space_id, changes.get("category_id"), changes.get("member_user_id"))

    if "frequency" in changes:
        changes["frequency"] = Frequency(changes["frequency"]).value
    if "status" in changes:
        changes["status"] = ContractStatus(changes["status"]).value
    for field, value in changes.items():
        setattr(c, field, value)
    await session.commit()
    row, key = await _get_row(session, space_id, contract_id)
    return to_out(row, key, as_of)


async def delete_contract(session: AsyncSession, *, space_id: UUID, contract_id: UUID) -> None:
    c, _ = await _get_row(session, space_id, contract_id)
    await session.delete(c)
    await session.commit()


async def upcoming(
    session: AsyncSession, *, space_id: UUID, as_of: date, days: int, limit: int
) -> UpcomingOut:
    """Events in [as_of, as_of + days] across active contracts, at most `limit`, sorted.

    Phase 5 notifications reuse this.
    """
    until = as_of + timedelta(days=days)
    rows = await session.scalars(
        select(Contract).where(
            Contract.space_id == space_id, Contract.status == ContractStatus.active.value
        )
    )
    events: list[UpcomingEvent] = []
    for c in rows:
        for e in upcoming_events(terms_of(c), as_of, until):
            events.append(
                UpcomingEvent(
                    type=e.type,
                    date=e.date,
                    contract_id=c.id,
                    contract_name=c.name,
                    amount=MoneyBase(amount=c.amount, currency=c.currency),
                )
            )
    # One deterministic order: (date, type, contract name, id). The type values sort as
    # notice_deadline < payment < renewal, matching schedule.upcoming_events.
    events.sort(key=lambda e: (e.date, e.type.value, e.contract_name, str(e.contract_id)))
    return UpcomingOut(as_of=as_of, until=until, items=events[:limit], has_more=len(events) > limit)
