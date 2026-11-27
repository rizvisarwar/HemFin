from datetime import date
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.dates import check_not_future, check_range
from hemfin.core.errors import CodedHTTPException
from hemfin.core.money import CURRENCY
from hemfin.core.pagination import (
    decode_cursor,
    decode_date_cursor,
    encode_cursor,
    encode_date_cursor,
)
from hemfin.modules.income.models import (
    IncomeEntry,
    IncomeFrequency,
    IncomeSource,
    IncomeType,
)
from hemfin.modules.income.schemas import (
    EntryCreate,
    EntryOut,
    EntryPatch,
    SourceCreate,
    SourceOut,
    SourcePatch,
)
from hemfin.modules.spaces.service import ensure_member

# ---- sources ----


def _source_out(s: IncomeSource) -> SourceOut:
    return SourceOut(
        id=s.id,
        space_id=s.space_id,
        name=s.name,
        type=IncomeType(s.type),
        amount=s.amount,
        currency=s.currency,
        frequency=IncomeFrequency(s.frequency),
        member_user_id=s.member_user_id,
        active=s.active,
        created_by=s.created_by,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


async def _get_source(session: AsyncSession, space_id: UUID, source_id: UUID) -> IncomeSource:
    s = await session.scalar(
        select(IncomeSource)
        .where(IncomeSource.id == source_id, IncomeSource.space_id == space_id)
        .execution_options(populate_existing=True)
    )
    if s is None:
        raise HTTPException(404, detail="Income source not found.")
    return s


async def create_source(
    session: AsyncSession, *, space_id: UUID, actor: UUID, body: SourceCreate
) -> SourceOut:
    if body.member_user_id is not None:
        await ensure_member(session, space_id, body.member_user_id)
    s = IncomeSource(
        space_id=space_id,
        created_by=actor,
        name=body.name,
        type=body.type.value,
        amount=body.amount,
        currency=CURRENCY,
        frequency=body.frequency.value,
        member_user_id=body.member_user_id,
        active=body.active,
    )
    session.add(s)
    await session.commit()
    return _source_out(await _get_source(session, space_id, s.id))


async def get_source(session: AsyncSession, *, space_id: UUID, source_id: UUID) -> SourceOut:
    return _source_out(await _get_source(session, space_id, source_id))


async def list_sources_page(
    session: AsyncSession, *, space_id: UUID, limit: int, cursor: str | None
) -> tuple[list[SourceOut], str | None]:
    """Newest first (sources have no date of their own, so by creation time)."""
    stmt = select(IncomeSource).where(IncomeSource.space_id == space_id)
    if cursor:
        at, rid = decode_cursor(cursor)
        stmt = stmt.where(tuple_(IncomeSource.created_at, IncomeSource.id) < tuple_(at, rid))
    rows = list(
        await session.scalars(
            stmt.order_by(IncomeSource.created_at.desc(), IncomeSource.id.desc()).limit(limit + 1)
        )
    )
    page = rows[:limit]
    nxt = encode_cursor(page[-1].created_at, page[-1].id) if len(rows) > limit else None
    return [_source_out(s) for s in page], nxt


async def update_source(
    session: AsyncSession, *, space_id: UUID, source_id: UUID, body: SourcePatch
) -> SourceOut:
    s = await _get_source(session, space_id, source_id)
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)
    if changes.get("member_user_id") is not None:
        await ensure_member(session, space_id, changes["member_user_id"])
    for key in ("type", "frequency"):
        if key in changes:
            changes[key] = changes[key].value
    for field, value in changes.items():
        setattr(s, field, value)
    await session.commit()
    return _source_out(await _get_source(session, space_id, source_id))


async def delete_source(session: AsyncSession, *, space_id: UUID, source_id: UUID) -> None:
    s = await _get_source(session, space_id, source_id)
    await session.delete(s)
    await session.commit()


# ---- entries ----


def _entry_out(e: IncomeEntry) -> EntryOut:
    return EntryOut(
        id=e.id,
        space_id=e.space_id,
        source_id=e.source_id,
        amount=e.amount,
        currency=e.currency,
        received_on=e.received_on,
        description=e.description,
        member_user_id=e.member_user_id,
        created_by=e.created_by,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


async def _check_entry_refs(
    session: AsyncSession, space_id: UUID, source_id: UUID | None, member_user_id: UUID | None
) -> None:
    """Ids must belong to this space. A foreign id gets the same 422 as an unknown one."""
    if source_id is not None:
        found = await session.scalar(
            select(IncomeSource.id).where(
                IncomeSource.id == source_id, IncomeSource.space_id == space_id
            )
        )
        if found is None:
            raise CodedHTTPException(422, "invalid_source", "Unknown income source.")
    if member_user_id is not None:
        await ensure_member(session, space_id, member_user_id)


async def _get_entry(session: AsyncSession, space_id: UUID, entry_id: UUID) -> IncomeEntry:
    e = await session.scalar(
        select(IncomeEntry)
        .where(IncomeEntry.id == entry_id, IncomeEntry.space_id == space_id)
        .execution_options(populate_existing=True)
    )
    if e is None:
        raise HTTPException(404, detail="Income entry not found.")
    return e


async def create_entry(
    session: AsyncSession, *, space_id: UUID, actor: UUID, body: EntryCreate, today: date
) -> EntryOut:
    check_not_future(body.received_on, today, "received_on")
    await _check_entry_refs(session, space_id, body.source_id, body.member_user_id)
    e = IncomeEntry(
        space_id=space_id,
        created_by=actor,
        source_id=body.source_id,
        amount=body.amount,
        currency=CURRENCY,
        received_on=body.received_on,
        description=body.description,
        member_user_id=body.member_user_id,
    )
    session.add(e)
    await session.commit()
    return _entry_out(await _get_entry(session, space_id, e.id))


async def get_entry(
    session: AsyncSession, *, space_id: UUID, user_id: UUID, entry_id: UUID
) -> EntryOut:
    return _entry_out(await _get_entry(session, space_id, entry_id))


async def list_entries_page(
    session: AsyncSession,
    *,
    space_id: UUID,
    user_id: UUID,
    limit: int,
    cursor: str | None,
    from_: date | None = None,
    to: date | None = None,
    source_id: UUID | None = None,
) -> tuple[list[EntryOut], str | None]:
    check_range(from_, to)
    stmt = select(IncomeEntry).where(IncomeEntry.space_id == space_id)
    if from_ is not None:
        stmt = stmt.where(IncomeEntry.received_on >= from_)
    if to is not None:
        stmt = stmt.where(IncomeEntry.received_on <= to)
    if source_id is not None:
        stmt = stmt.where(IncomeEntry.source_id == source_id)
    if cursor:
        day, rid = decode_date_cursor(cursor)
        stmt = stmt.where(tuple_(IncomeEntry.received_on, IncomeEntry.id) < tuple_(day, rid))
    rows = list(
        await session.scalars(
            stmt.order_by(IncomeEntry.received_on.desc(), IncomeEntry.id.desc()).limit(limit + 1)
        )
    )
    page = rows[:limit]
    nxt = encode_date_cursor(page[-1].received_on, page[-1].id) if len(rows) > limit else None
    return [_entry_out(e) for e in page], nxt


async def update_entry(
    session: AsyncSession,
    *,
    space_id: UUID,
    user_id: UUID,
    entry_id: UUID,
    body: EntryPatch,
    today: date,
) -> EntryOut:
    e = await _get_entry(session, space_id, entry_id)
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)
    if "received_on" in changes:
        check_not_future(changes["received_on"], today, "received_on")
    await _check_entry_refs(
        session, space_id, changes.get("source_id"), changes.get("member_user_id")
    )
    for field, value in changes.items():
        setattr(e, field, value)
    await session.commit()
    return _entry_out(await _get_entry(session, space_id, entry_id))


async def delete_entry(session: AsyncSession, *, space_id: UUID, entry_id: UUID) -> None:
    e = await _get_entry(session, space_id, entry_id)
    await session.delete(e)
    await session.commit()
