from datetime import date
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.dates import check_not_future, check_range
from hemfin.core.errors import CodedHTTPException
from hemfin.core.money import MoneyBase, validate_amount
from hemfin.core.pagination import decode_date_cursor, encode_date_cursor
from hemfin.modules.categories.models import Category
from hemfin.modules.categories.schemas import CategoryKind
from hemfin.modules.categories.service import ensure_category
from hemfin.modules.contracts.models import Contract
from hemfin.modules.expenses.models import Expense
from hemfin.modules.expenses.schemas import ExpenseCreate, ExpenseOut, ExpensePatch
from hemfin.modules.fx.base_amount import base_amounts
from hemfin.modules.spaces.service import ensure_member

_ROW = select(Expense, Category.key).join(Category, Category.id == Expense.category_id)


def _to_out(e: Expense, category_key: str, base: MoneyBase | None) -> ExpenseOut:
    return ExpenseOut(
        id=e.id,
        space_id=e.space_id,
        category_id=e.category_id,
        category=category_key,
        amount=e.amount,
        currency=e.currency,
        spent_on=e.spent_on,
        description=e.description,
        merchant=e.merchant,
        contract_id=e.contract_id,
        member_user_id=e.member_user_id,
        base_amount=base,
        created_by=e.created_by,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


async def _check_refs(
    session: AsyncSession,
    space_id: UUID,
    category_id: UUID | None,
    contract_id: UUID | None,
    member_user_id: UUID | None,
) -> None:
    """Ids must belong to this space. A foreign id gets the same 422 as an unknown one."""
    if category_id is not None:
        await ensure_category(session, space_id, category_id, CategoryKind.expense)
    if contract_id is not None:
        found = await session.scalar(
            select(Contract.id).where(Contract.id == contract_id, Contract.space_id == space_id)
        )
        if found is None:
            raise CodedHTTPException(422, "invalid_contract", "Unknown contract.")
    if member_user_id is not None:
        await ensure_member(session, space_id, member_user_id)


async def _get_row(session: AsyncSession, space_id: UUID, expense_id: UUID) -> tuple[Expense, str]:
    row = (
        await session.execute(
            _ROW.where(Expense.id == expense_id, Expense.space_id == space_id).execution_options(
                populate_existing=True
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, detail="Expense not found.")
    return row[0], row[1]


async def _out(
    session: AsyncSession, user_id: UUID, rows: list[tuple[Expense, str]]
) -> list[ExpenseOut]:
    bases = await base_amounts(
        session, user_id, [(e.amount, e.currency, e.spent_on) for e, _ in rows]
    )
    return [_to_out(e, key, b) for (e, key), b in zip(rows, bases, strict=True)]


async def create_expense(
    session: AsyncSession, *, space_id: UUID, actor: UUID, body: ExpenseCreate, today: date
) -> ExpenseOut:
    check_not_future(body.spent_on, today, "spent_on")
    await _check_refs(session, space_id, body.category_id, body.contract_id, body.member_user_id)
    e = Expense(
        space_id=space_id,
        created_by=actor,
        category_id=body.category_id,
        amount=body.amount,
        currency=body.currency,
        spent_on=body.spent_on,
        description=body.description,
        merchant=body.merchant,
        contract_id=body.contract_id,
        member_user_id=body.member_user_id,
    )
    session.add(e)
    await session.commit()
    return (await _out(session, actor, [await _get_row(session, space_id, e.id)]))[0]


async def get_expense(
    session: AsyncSession, *, space_id: UUID, user_id: UUID, expense_id: UUID
) -> ExpenseOut:
    return (await _out(session, user_id, [await _get_row(session, space_id, expense_id)]))[0]


async def list_expenses_page(
    session: AsyncSession,
    *,
    space_id: UUID,
    user_id: UUID,
    limit: int,
    cursor: str | None,
    from_: date | None = None,
    to: date | None = None,
    category: str | None = None,
    member_user_id: UUID | None = None,
    contract_id: UUID | None = None,
) -> tuple[list[ExpenseOut], str | None]:
    check_range(from_, to)
    stmt = _ROW.where(Expense.space_id == space_id)
    if from_ is not None:
        stmt = stmt.where(Expense.spent_on >= from_)
    if to is not None:
        stmt = stmt.where(Expense.spent_on <= to)
    if category:
        # `food` matches the group and everything under it; `food.groceries` is exact.
        stmt = stmt.where(
            (Category.key == category) | Category.key.startswith(f"{category}.", autoescape=True)
        )
    if member_user_id is not None:
        stmt = stmt.where(Expense.member_user_id == member_user_id)
    if contract_id is not None:
        stmt = stmt.where(Expense.contract_id == contract_id)
    if cursor:
        day, rid = decode_date_cursor(cursor)
        stmt = stmt.where(tuple_(Expense.spent_on, Expense.id) < tuple_(day, rid))
    rows = (
        await session.execute(
            stmt.order_by(Expense.spent_on.desc(), Expense.id.desc()).limit(limit + 1)
        )
    ).all()
    page = [(r[0], r[1]) for r in rows[:limit]]
    nxt = None
    if len(rows) > limit:
        last = page[-1][0]
        nxt = encode_date_cursor(last.spent_on, last.id)
    return await _out(session, user_id, page), nxt


async def update_expense(
    session: AsyncSession,
    *,
    space_id: UUID,
    user_id: UUID,
    expense_id: UUID,
    body: ExpensePatch,
    today: date,
) -> ExpenseOut:
    e, _ = await _get_row(session, space_id, expense_id)
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)
    if "amount" in changes or "currency" in changes:
        try:
            validate_amount(changes.get("amount", e.amount), changes.get("currency", e.currency))
        except ValueError as exc:
            raise CodedHTTPException(422, "invalid_amount", str(exc)) from None
    if "spent_on" in changes:
        check_not_future(changes["spent_on"], today, "spent_on")
    await _check_refs(
        session,
        space_id,
        changes.get("category_id"),
        changes.get("contract_id"),
        changes.get("member_user_id"),
    )
    for field, value in changes.items():
        setattr(e, field, value)
    await session.commit()
    return (await _out(session, user_id, [await _get_row(session, space_id, expense_id)]))[0]


async def delete_expense(session: AsyncSession, *, space_id: UUID, expense_id: UUID) -> None:
    e, _ = await _get_row(session, space_id, expense_id)
    await session.delete(e)
    await session.commit()
