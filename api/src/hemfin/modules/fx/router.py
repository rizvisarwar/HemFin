from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.db import get_session
from hemfin.core.deps import get_current_user
from hemfin.core.errors import PROBLEM_JSON, CodedHTTPException
from hemfin.modules.fx import service
from hemfin.modules.fx.schemas import FxRatesOut

# Reference data, not space data: any signed-in user may read it.
router = APIRouter(prefix="/fx", tags=["fx"], dependencies=[Depends(get_current_user)])


@router.get(
    "/rates",
    response_model=FxRatesOut,
    summary="ECB reference rates for a date (or the latest date before it)",
    responses={
        401: {"description": "Not authenticated", "content": {PROBLEM_JSON: {}}},
        404: {"description": "No rates on or before that date", "content": {PROBLEM_JSON: {}}},
    },
)
async def get_rates(
    session: Annotated[AsyncSession, Depends(get_session)],
    on: Annotated[date | None, Query(alias="date", description="Defaults to today (UTC).")] = None,
) -> FxRatesOut:
    found = await service.rates_on_or_before(session, on or service.today_utc())
    if found is None:
        raise CodedHTTPException(404, "fx_rates_not_found", "No exchange rates for that date.")
    rate_date, rates = found
    return FxRatesOut(rate_date=rate_date, rates=rates)
