from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.db import get_session
from hemfin.core.deps import SpaceAccess, require_space_member
from hemfin.core.errors import PROBLEM_JSON
from hemfin.core.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page
from hemfin.modules.contracts.router import get_today
from hemfin.modules.income import service
from hemfin.modules.income.schemas import (
    EntryCreate,
    EntryOut,
    EntryPatch,
    SourceCreate,
    SourceOut,
    SourcePatch,
)

sources_router = APIRouter(prefix="/spaces/{space_id}/income-sources", tags=["income"])
entries_router = APIRouter(prefix="/spaces/{space_id}/income-entries", tags=["income"])

Session = Annotated[AsyncSession, Depends(get_session)]
Member = Annotated[SpaceAccess, Depends(require_space_member())]
Today = Annotated[date, Depends(get_today)]

_P: dict[str, Any] = {"content": {PROBLEM_JSON: {}}}
_404: dict[int | str, dict[str, Any]] = {404: {"description": "Not a member, or not found", **_P}}
_422: dict[int | str, dict[str, Any]] = {422: {"description": "Validation error", **_P}}


# ---- sources ----


@sources_router.get("", summary="List income sources, newest first", responses=_404)
async def list_sources(
    access: Member, session: Session, limit: LimitParam = DEFAULT_LIMIT, cursor: CursorParam = None
) -> Page[SourceOut]:
    items, nxt = await service.list_sources_page(
        session, space_id=access.space_id, limit=limit, cursor=cursor
    )
    return Page[SourceOut](items=items, next_cursor=nxt)


@sources_router.post(
    "", status_code=201, summary="Create an income source", responses={**_404, **_422}
)
async def create_source(body: SourceCreate, access: Member, session: Session) -> SourceOut:
    return await service.create_source(
        session, space_id=access.space_id, actor=access.user_id, body=body
    )


@sources_router.get("/{source_id}", summary="Get an income source", responses=_404)
async def get_source(source_id: UUID, access: Member, session: Session) -> SourceOut:
    return await service.get_source(session, space_id=access.space_id, source_id=source_id)


@sources_router.patch("/{source_id}", summary="Update an income source", responses={**_404, **_422})
async def update_source(
    source_id: UUID, body: SourcePatch, access: Member, session: Session
) -> SourceOut:
    return await service.update_source(
        session, space_id=access.space_id, source_id=source_id, body=body
    )


@sources_router.delete(
    "/{source_id}", status_code=204, summary="Delete an income source", responses=_404
)
async def delete_source(source_id: UUID, access: Member, session: Session) -> Response:
    await service.delete_source(session, space_id=access.space_id, source_id=source_id)
    return Response(status_code=204)


# ---- entries ----


@entries_router.get("", summary="List income entries, newest first", responses=_404)
async def list_entries(
    access: Member,
    session: Session,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
    from_: Annotated[
        date | None, Query(alias="from", description="Received on or after (inclusive).")
    ] = None,
    to: Annotated[date | None, Query(description="Received on or before (inclusive).")] = None,
    source_id: UUID | None = None,
) -> Page[EntryOut]:
    items, nxt = await service.list_entries_page(
        session,
        space_id=access.space_id,
        user_id=access.user_id,
        limit=limit,
        cursor=cursor,
        from_=from_,
        to=to,
        source_id=source_id,
    )
    return Page[EntryOut](items=items, next_cursor=nxt)


@entries_router.post(
    "", status_code=201, summary="Create an income entry", responses={**_404, **_422}
)
async def create_entry(
    body: EntryCreate, access: Member, session: Session, today: Today
) -> EntryOut:
    return await service.create_entry(
        session, space_id=access.space_id, actor=access.user_id, body=body, today=today
    )


@entries_router.get("/{entry_id}", summary="Get an income entry", responses=_404)
async def get_entry(entry_id: UUID, access: Member, session: Session) -> EntryOut:
    return await service.get_entry(
        session, space_id=access.space_id, user_id=access.user_id, entry_id=entry_id
    )


@entries_router.patch("/{entry_id}", summary="Update an income entry", responses={**_404, **_422})
async def update_entry(
    entry_id: UUID, body: EntryPatch, access: Member, session: Session, today: Today
) -> EntryOut:
    return await service.update_entry(
        session,
        space_id=access.space_id,
        user_id=access.user_id,
        entry_id=entry_id,
        body=body,
        today=today,
    )


@entries_router.delete(
    "/{entry_id}", status_code=204, summary="Delete an income entry", responses=_404
)
async def delete_entry(entry_id: UUID, access: Member, session: Session) -> Response:
    await service.delete_entry(session, space_id=access.space_id, entry_id=entry_id)
    return Response(status_code=204)
