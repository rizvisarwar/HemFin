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
from hemfin.modules.expenses import service
from hemfin.modules.expenses.schemas import ExpenseCreate, ExpenseOut, ExpensePatch

router = APIRouter(prefix="/spaces/{space_id}/expenses", tags=["expenses"])

Session = Annotated[AsyncSession, Depends(get_session)]
Member = Annotated[SpaceAccess, Depends(require_space_member())]
Today = Annotated[date, Depends(get_today)]

_P: dict[str, Any] = {"content": {PROBLEM_JSON: {}}}
_404: dict[int | str, dict[str, Any]] = {404: {"description": "Not a member, or not found", **_P}}
_422: dict[int | str, dict[str, Any]] = {422: {"description": "Validation error", **_P}}


@router.get("", summary="List expenses, newest first", responses=_404)
async def list_expenses(
    access: Member,
    session: Session,
    limit: LimitParam = DEFAULT_LIMIT,
    cursor: CursorParam = None,
    from_: Annotated[
        date | None, Query(alias="from", description="Spent on or after (inclusive).")
    ] = None,
    to: Annotated[date | None, Query(description="Spent on or before (inclusive).")] = None,
    category: Annotated[
        str | None,
        Query(
            max_length=60,
            description="Category key; a group key such as `food` includes its children.",
        ),
    ] = None,
    member_user_id: UUID | None = None,
    contract_id: UUID | None = None,
) -> Page[ExpenseOut]:
    items, nxt = await service.list_expenses_page(
        session,
        space_id=access.space_id,
        user_id=access.user_id,
        limit=limit,
        cursor=cursor,
        from_=from_,
        to=to,
        category=category,
        member_user_id=member_user_id,
        contract_id=contract_id,
    )
    return Page[ExpenseOut](items=items, next_cursor=nxt)


@router.post("", status_code=201, summary="Create an expense", responses={**_404, **_422})
async def create_expense(
    body: ExpenseCreate, access: Member, session: Session, today: Today
) -> ExpenseOut:
    return await service.create_expense(
        session, space_id=access.space_id, actor=access.user_id, body=body, today=today
    )


@router.get("/{expense_id}", summary="Get an expense", responses=_404)
async def get_expense(expense_id: UUID, access: Member, session: Session) -> ExpenseOut:
    return await service.get_expense(
        session, space_id=access.space_id, user_id=access.user_id, expense_id=expense_id
    )


@router.patch("/{expense_id}", summary="Update an expense", responses={**_404, **_422})
async def update_expense(
    expense_id: UUID, body: ExpensePatch, access: Member, session: Session, today: Today
) -> ExpenseOut:
    return await service.update_expense(
        session,
        space_id=access.space_id,
        user_id=access.user_id,
        expense_id=expense_id,
        body=body,
        today=today,
    )


@router.delete("/{expense_id}", status_code=204, summary="Delete an expense", responses=_404)
async def delete_expense(expense_id: UUID, access: Member, session: Session) -> Response:
    await service.delete_expense(session, space_id=access.space_id, expense_id=expense_id)
    return Response(status_code=204)
