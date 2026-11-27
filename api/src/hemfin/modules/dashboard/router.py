from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.db import get_session
from hemfin.core.deps import SpaceAccess, require_space_member
from hemfin.core.errors import PROBLEM_JSON
from hemfin.modules.contracts.router import Today
from hemfin.modules.dashboard import service
from hemfin.modules.dashboard.schemas import DashboardOut

router = APIRouter(prefix="/spaces/{space_id}/dashboard", tags=["dashboard"])

Session = Annotated[AsyncSession, Depends(get_session)]
Member = Annotated[SpaceAccess, Depends(require_space_member())]

_P: dict[str, Any] = {"content": {PROBLEM_JSON: {}}}
_404: dict[int | str, dict[str, Any]] = {404: {"description": "Not a member", **_P}}
_422: dict[int | str, dict[str, Any]] = {422: {"description": "Validation error", **_P}}


@router.get(
    "",
    summary="Month totals and the next 30 days, in the caller's base currency",
    description=(
        "`upcoming` covers today through today + 30 days inclusive (31 calendar days), at most "
        "10 events. `recurring_monthly` counts active contracts that pay in the month. "
        "`has_records` is true when the space has any contract, expense or income entry."
    ),
    responses={**_404, **_422},
)
async def get_dashboard(
    access: Member,
    session: Session,
    today: Today,
    month: Annotated[
        str | None,
        Query(
            pattern=r"^(19|20)\d\d-(0[1-9]|1[0-2])$",
            description="YYYY-MM. Defaults to the current UTC month.",
        ),
    ] = None,
) -> DashboardOut:
    return await service.dashboard(
        session,
        space_id=access.space_id,
        user_id=access.user_id,
        month=month or service.current_month(today),
        today=today,
    )
