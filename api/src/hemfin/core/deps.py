import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Path
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hemfin.core.config import get_settings
from hemfin.core.db import get_session
from hemfin.core.security import (
    AuthUnavailableError,
    InvalidTokenError,
    TokenClaims,
    TokenVerifier,
    build_verifier,
)
from hemfin.modules.spaces.models import Role, SpaceMembership
from hemfin.modules.users.service import CurrentUser, ensure_user

log = logging.getLogger("hemfin.auth")
_bearer = HTTPBearer(auto_error=False, description="Supabase access token")


@lru_cache
def get_verifier() -> TokenVerifier:
    s = get_settings()
    if not s.SUPABASE_URL:
        log.error("SUPABASE_URL is not configured; cannot verify tokens")
        raise HTTPException(503, detail="Authentication is temporarily unavailable.")
    return build_verifier(
        supabase_url=s.SUPABASE_URL,
        audience=s.SUPABASE_JWT_AUDIENCE,
        app_env=s.APP_ENV,
        hs256_secret=s.SUPABASE_JWT_SECRET.get_secret_value() if s.SUPABASE_JWT_SECRET else None,
        jwks_ttl=s.SUPABASE_JWKS_TTL_SECONDS,
        jwks_min_refetch=s.SUPABASE_JWKS_MIN_REFETCH_SECONDS,
    )


def _unauthorized(detail: str, invalid_token: bool = False) -> HTTPException:
    challenge = 'Bearer error="invalid_token"' if invalid_token else "Bearer"
    return HTTPException(401, detail=detail, headers={"WWW-Authenticate": challenge})


async def get_token_claims(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    verifier: Annotated[TokenVerifier, Depends(get_verifier)],
) -> TokenClaims:
    """Verify the bearer token. No database access. The token is never logged."""
    if creds is None or not creds.credentials:
        raise _unauthorized("Not authenticated.")
    try:
        return await verifier.verify(creds.credentials)
    except InvalidTokenError as exc:
        log.info("token rejected: %s", exc.reason)
        raise _unauthorized("Invalid or expired credentials.", invalid_token=True) from None
    except AuthUnavailableError:
        log.error("auth unavailable: signing keys or SUPABASE_URL missing")
        raise HTTPException(503, detail="Authentication is temporarily unavailable.") from None


async def get_current_user(
    claims: Annotated[TokenClaims, Depends(get_token_claims)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CurrentUser:
    """Authenticated user; creates the user row and personal space on first request."""
    return await ensure_user(session, claims)


@dataclass(frozen=True)
class SpaceAccess:
    space_id: UUID
    user_id: UUID
    role: Role


def require_space_member(min_role: Role = Role.member) -> Callable[..., Awaitable[SpaceAccess]]:
    """Single authorization gate for everything under /spaces/{space_id}.

    Non-members and unknown spaces both get 404 (existence is never revealed). 403 is only
    for a member whose role is below `min_role`.
    """

    async def dependency(
        space_id: Annotated[UUID, Path()],
        user: Annotated[CurrentUser, Depends(get_current_user)],
        session: Annotated[AsyncSession, Depends(get_session)],
    ) -> SpaceAccess:
        role_value = (
            await session.execute(
                select(SpaceMembership.role).where(
                    SpaceMembership.space_id == space_id, SpaceMembership.user_id == user.id
                )
            )
        ).scalar_one_or_none()
        if role_value is None:
            raise HTTPException(404, detail="Space not found.")
        role = Role(role_value)
        if role.rank < min_role.rank:
            raise HTTPException(403, detail="Insufficient role for this action.")
        return SpaceAccess(space_id=space_id, user_id=user.id, role=role)

    return dependency
