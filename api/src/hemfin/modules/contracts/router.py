from datetime import UTC, date, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.db import get_session
from hemfin.core.deps import SpaceAccess, require_space_member
from hemfin.core.errors import PROBLEM_JSON, CodedHTTPException
from hemfin.core.pagination import DEFAULT_LIMIT, CursorParam, LimitParam, Page
from hemfin.modules.contracts import service
from hemfin.modules.contracts.models import ContractStatus
from hemfin.modules.contracts.schemas import (
    ContractCreate,
    ContractOut,
    ContractPatch,
    UpcomingOut,
)

router = APIRouter(prefix="/spaces/{space_id}/contracts", tags=["contracts"])


def get_today() -> date:
    """The reference date for schedules (UTC). A dependency so tests can pin it."""
    return datetime.now(UTC).date()


Session = Annotated[AsyncSession, Depends(get_session)]
Member = Annotated[SpaceAccess, Depends(require_space_member())]
Today = Annotated[date, Depends(get_today)]

_P: dict[str, Any] = {"content": {PROBLEM_JSON: {}}}
_404: dict[int | str, dict[str, Any]] = {404: {"description": "Not a member, or not found", **_P}}
_422: dict[int | str, dict[str, Any]] = {422: {"description": "Validation error", **_P}}


def parse_member_filter(value: str | None) -> tuple[UUID | None, bool]:
    """`member_user_id` is a user id, or the word `none` for the whole household."""
    if value is None:
        return None, False
    if value == "none":
        return None, True
    try:
        return UUID(value), False
    except ValueError:
        raise CodedHTTPException(
            422, "invalid_member_filter", "member_user_id must be a user id or `none`."
        ) from None


@router.get(
    "", summary="List contracts (filter by category, status, member)", responses={**_404, **_422}
)
async def list_contracts(
    access: Member,
    session: Session,
    today: Today,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
    category: Annotated[
        str | None,
        Query(
            max_length=60,
            description="Category key; a group key such as `insurance` includes its children.",
        ),
    ] = None,
    status: ContractStatus | None = None,
    member_user_id: Annotated[
        str | None,
        Query(
            max_length=36,
            description=(
                "A member's user id, or `none` for contracts that apply to the whole household."
            ),
        ),
    ] = None,
) -> Page[ContractOut]:
    member, whole_household = parse_member_filter(member_user_id)
    items, nxt = await service.list_contracts_page(
        session,
        space_id=access.space_id,
        limit=limit,
        cursor=cursor,
        as_of=today,
        category=category,
        status=status,
        member_user_id=member,
        whole_household=whole_household,
    )
    return Page[ContractOut](items=items, next_cursor=nxt)


@router.get(
    "/upcoming",
    summary="Payments, renewals and notice deadlines in the next N days",
    description=(
        "Bounded, not cursor-paginated (approved exception): the window is at most 366 days "
        "and the response holds at most `limit` events (default 50, max 200), sorted by "
        "date, type, contract name and id. `has_more` is true when events were cut off; "
        "narrow `days` to see the rest."
    ),
    responses={**_404, **_422},
)
async def upcoming_contracts(
    access: Member,
    session: Session,
    today: Today,
    days: Annotated[int, Query(ge=1, le=service.MAX_UPCOMING_DAYS)] = 30,
    limit: Annotated[int, Query(ge=1, le=200, description="Maximum events returned.")] = 50,
) -> UpcomingOut:
    return await service.upcoming(
        session, space_id=access.space_id, as_of=today, days=days, limit=limit
    )


@router.post("", status_code=201, summary="Create a contract", responses={**_404, **_422})
async def create_contract(
    body: ContractCreate, access: Member, session: Session, today: Today
) -> ContractOut:
    return await service.create_contract(
        session, space_id=access.space_id, actor=access.user_id, body=body, as_of=today
    )


@router.get("/{contract_id}", summary="Get a contract", responses=_404)
async def get_contract(
    contract_id: UUID, access: Member, session: Session, today: Today
) -> ContractOut:
    return await service.get_contract(
        session, space_id=access.space_id, contract_id=contract_id, as_of=today
    )


@router.patch("/{contract_id}", summary="Update a contract", responses={**_404, **_422})
async def update_contract(
    contract_id: UUID, body: ContractPatch, access: Member, session: Session, today: Today
) -> ContractOut:
    return await service.update_contract(
        session, space_id=access.space_id, contract_id=contract_id, body=body, as_of=today
    )


@router.delete("/{contract_id}", status_code=204, summary="Delete a contract", responses=_404)
async def delete_contract(contract_id: UUID, access: Member, session: Session) -> Response:
    await service.delete_contract(session, space_id=access.space_id, contract_id=contract_id)
    return Response(status_code=204)
