from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.errors import CodedHTTPException
from hemfin.modules.categories.models import Category
from hemfin.modules.categories.schemas import CategoryCreate, CategoryKind, CategoryOut
from hemfin.modules.contracts.models import Contract
from hemfin.modules.expenses.models import Expense

MAX_CUSTOM_CATEGORIES = 100


def to_out(c: Category) -> CategoryOut:
    return CategoryOut(
        id=c.id,
        key=c.key,
        name=c.name,
        parent_key=c.parent_key,
        kind=CategoryKind(c.kind),
        system=c.space_id is None,
    )


def _visible(space_id: UUID) -> ColumnElement[bool]:
    return or_(Category.space_id.is_(None), Category.space_id == space_id)


async def list_categories(session: AsyncSession, space_id: UUID) -> list[CategoryOut]:
    """System categories plus the space's own. Bounded (seed list plus at most 100 custom)."""
    rows = await session.scalars(
        select(Category).where(_visible(space_id)).order_by(Category.kind, Category.key)
    )
    return [to_out(c) for c in rows]


async def get_visible(session: AsyncSession, space_id: UUID, category_id: UUID) -> Category | None:
    """A system category or one of this space's; anything else (foreign space) is None."""
    return await session.scalar(
        select(Category).where(Category.id == category_id, _visible(space_id))
    )


async def ensure_category(
    session: AsyncSession, space_id: UUID, category_id: UUID, kind: CategoryKind
) -> None:
    """422 unless the category is visible to the space and of `kind`. A foreign id gets the
    same error as an unknown one."""
    cat = await get_visible(session, space_id, category_id)
    if cat is None or cat.kind != kind:
        raise CodedHTTPException(422, "invalid_category", "Unknown category.")


async def create_category(
    session: AsyncSession, space_id: UUID, body: CategoryCreate
) -> CategoryOut:
    if body.parent_key is not None:
        parent = await session.scalar(
            select(Category).where(Category.key == body.parent_key, _visible(space_id))
        )
        if parent is None or parent.kind != body.kind:
            raise CodedHTTPException(
                422, "invalid_parent", "Parent must be an existing category of the same kind."
            )
    taken = await session.scalar(
        select(Category.id).where(Category.key == body.key, _visible(space_id))
    )
    if taken is not None:
        raise CodedHTTPException(409, "category_exists", "A category with this key already exists.")
    count = await session.scalar(
        select(func.count()).select_from(Category).where(Category.space_id == space_id)
    )
    if (count or 0) >= MAX_CUSTOM_CATEGORIES:
        raise CodedHTTPException(
            409, "category_limit", f"At most {MAX_CUSTOM_CATEGORIES} custom categories."
        )
    if body.key is None:  # the schema derives it; this keeps the type honest
        raise CodedHTTPException(422, "invalid_key", "A category key is required.")
    cat = Category(
        space_id=space_id,
        key=body.key,
        name=body.name,
        kind=body.kind.value,
        parent_key=body.parent_key,
    )
    session.add(cat)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise CodedHTTPException(
            409, "category_exists", "A category with this key already exists."
        ) from None
    return to_out(cat)


async def delete_category(session: AsyncSession, space_id: UUID, category_id: UUID) -> None:
    cat = await get_visible(session, space_id, category_id)
    if cat is None:
        raise HTTPException(404, detail="Category not found.")
    if cat.space_id is None:
        raise CodedHTTPException(409, "system_category", "System categories cannot be deleted.")
    in_use = await session.scalar(
        select(Contract.id).where(Contract.category_id == cat.id).limit(1)
    ) or await session.scalar(select(Expense.id).where(Expense.category_id == cat.id).limit(1))
    child = await session.scalar(
        select(Category.id)
        .where(Category.space_id == space_id, Category.parent_key == cat.key)
        .limit(1)
    )
    if in_use is not None or child is not None:
        raise CodedHTTPException(409, "category_in_use", "This category is in use.")
    await session.delete(cat)
    try:
        await session.commit()
    except IntegrityError:  # a contract was added concurrently (FK restrict)
        await session.rollback()
        raise CodedHTTPException(409, "category_in_use", "This category is in use.") from None
