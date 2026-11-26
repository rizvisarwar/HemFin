"""Internal scheduled-job endpoints, called by GitHub Actions with the shared job secret."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.config import Settings, get_settings
from hemfin.core.db import get_session
from hemfin.modules.invitations import service as invitations

router = APIRouter(prefix="/internal/jobs", tags=["internal"], include_in_schema=False)


def require_job_secret(
    settings: Annotated[Settings, Depends(get_settings)],
    x_job_secret: Annotated[str | None, Header()] = None,
) -> None:
    if settings.JOB_SECRET is None:
        raise HTTPException(503, detail="Scheduled jobs are not configured.")
    expected = settings.JOB_SECRET.get_secret_value().encode()
    # Defence in depth: a blank configured secret is already treated as unset (503 above).
    if not expected.strip():
        raise HTTPException(503, detail="Scheduled jobs are not configured.")
    if (
        x_job_secret is None
        or not x_job_secret.strip()
        or not hmac.compare_digest(x_job_secret.encode(), expected)
    ):
        raise HTTPException(401, detail="Invalid job credentials.")


@router.post("/daily", dependencies=[Depends(require_job_secret)])
async def daily(session: Annotated[AsyncSession, Depends(get_session)]) -> dict[str, int]:
    """Idempotent: marks pending invitations past their expiry as expired."""
    expired = await invitations.expire_due(session)
    await session.commit()
    return {"expired_invitations": expired}
