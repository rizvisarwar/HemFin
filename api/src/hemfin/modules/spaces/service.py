from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.modules.spaces.models import Role, Space, SpaceMembership


async def list_user_spaces(session: AsyncSession, user_id: UUID) -> list[tuple[Space, Role]]:
    rows = await session.execute(
        select(Space, SpaceMembership.role)
        .join(SpaceMembership, SpaceMembership.space_id == Space.id)
        .where(SpaceMembership.user_id == user_id)
        .order_by(Space.type, Space.created_at)  # household < personal; stable by creation
    )
    return [(space, Role(role)) for space, role in rows.all()]


async def get_space(session: AsyncSession, space_id: UUID) -> Space | None:
    return await session.get(Space, space_id)
