"""Verification of Supabase access tokens.

Asymmetric keys (ES256/RS256) come from the project's JWKS, cached with a TTL and refetched
(rate limited) when a token names an unknown `kid`. `alg=none` and every other algorithm is
rejected before any key lookup.

HS256 exists only for the local Supabase CLI stack. As far as we know the CLI signs local
tokens with the legacy shared JWT secret (HS256) unless `auth.signing_keys_path` is set;
reports of that option misbehaving exist (UNVERIFIED here, no Docker). HS256 is therefore
accepted only when SUPABASE_JWT_SECRET is set AND APP_ENV is local or test. A shared secret
that can mint tokens must never be trusted in a deployed environment.

Token strings and exception messages are never logged; only fixed reason codes are.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
import jwt
from jwt import PyJWK

log = logging.getLogger("hemfin.security")

ASYMMETRIC_ALGS = frozenset({"ES256", "RS256"})
LEEWAY_SECONDS = 10
LOCAL_ENVS = frozenset({"local", "test"})

JwksFetcher = Callable[[], Awaitable[list[dict[str, Any]]]]


class InvalidTokenError(Exception):
    """The token is not acceptable. `reason` is a fixed code, safe to log."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class AuthUnavailableError(Exception):
    """Signing keys could not be obtained and no cached key can verify the token."""


@dataclass(frozen=True)
class TokenClaims:
    sub: UUID
    email: str
    # True only when Supabase marks the email as confirmed (token `email_verified`, or
    # `user_metadata.email_verified`). Invitation acceptance requires it.
    email_verified: bool = False


def issuer_for(supabase_url: str) -> str:
    return f"{supabase_url.rstrip('/')}/auth/v1"


def http_jwks_fetcher(supabase_url: str, timeout: float = 5.0) -> JwksFetcher:
    url = f"{issuer_for(supabase_url)}/.well-known/jwks.json"

    async def fetch() -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            keys = resp.json().get("keys", [])
        return [k for k in keys if isinstance(k, dict)]

    return fetch


class JWKSCache:
    def __init__(
        self,
        fetcher: JwksFetcher,
        ttl_seconds: float = 600,
        min_refetch_seconds: float = 30,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._fetcher = fetcher
        self._ttl = ttl_seconds
        self._min_refetch = min_refetch_seconds
        self._clock = clock
        # kid -> (key, algorithm the JWK declares, if any)
        self._keys: dict[str, tuple[PyJWK, str | None]] = {}
        self._fetched_at: float | None = None  # time of the last fetch ATTEMPT (even a failed one)
        self._lock = asyncio.Lock()

    async def _refresh(self) -> None:
        self._fetched_at = self._clock()  # record the attempt first: failures are rate limited too
        try:
            raw = await self._fetcher()
        except Exception:
            log.warning("jwks fetch failed")
            return  # keep serving any stale keys; the next attempt waits for the cooldown
        keys: dict[str, tuple[PyJWK, str | None]] = {}
        for jwk in raw:
            kid = jwk.get("kid")
            if not isinstance(kid, str) or jwk.get("use") == "enc":
                continue
            try:
                alg = jwk.get("alg")
                keys[kid] = (PyJWK(jwk), alg if isinstance(alg, str) else None)
            except Exception:
                continue  # unsupported key type (e.g. a legacy symmetric entry)
        self._keys = keys

    def _needs_fetch(self, kid: str) -> bool:
        if self._fetched_at is None:
            return True
        age = self._clock() - self._fetched_at
        if not self._keys:
            return age >= self._min_refetch  # nothing usable cached: retry after the cooldown
        if age >= self._ttl:
            return True
        return kid not in self._keys and age >= self._min_refetch

    async def get_key(self, kid: str) -> tuple[PyJWK, str | None]:
        # The fetch runs under the lock on purpose: concurrent lookups share one fetch
        # (single-flight) instead of stampeding the JWKS endpoint.
        async with self._lock:
            if self._needs_fetch(kid):
                await self._refresh()
            entry = self._keys.get(kid)
            has_keys = bool(self._keys)
        if entry is None:
            if not has_keys:
                raise AuthUnavailableError  # 503 (also during the cooldown), no fetcher call
            raise InvalidTokenError("unknown_kid")
        return entry


class TokenVerifier:
    def __init__(
        self,
        *,
        issuer: str,
        audience: str,
        jwks: JWKSCache,
        hs256_secret: str | None = None,
        leeway: int = LEEWAY_SECONDS,
    ) -> None:
        self._issuer = issuer
        self._audience = audience
        self._jwks = jwks
        self._hs256_secret = hs256_secret
        self._leeway = leeway

    async def verify(self, token: str) -> TokenClaims:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            raise InvalidTokenError("malformed") from None
        alg = header.get("alg")
        verify_with: Any
        if alg in ASYMMETRIC_ALGS:
            kid = header.get("kid")
            if not isinstance(kid, str) or not kid:
                raise InvalidTokenError("missing_kid")
            jwk, jwk_alg = await self._jwks.get_key(kid)
            if jwk_alg is not None and jwk_alg != alg:  # a JWK that declares an alg must match
                raise InvalidTokenError("alg_mismatch")
            verify_with = jwk.key
            allowed: list[str] = sorted(ASYMMETRIC_ALGS)
        elif alg == "HS256" and self._hs256_secret:
            verify_with = self._hs256_secret
            allowed = ["HS256"]
        else:
            raise InvalidTokenError("unsupported_alg")
        try:
            payload = jwt.decode(
                token,
                verify_with,
                algorithms=allowed,
                audience=self._audience,
                issuer=self._issuer,
                leeway=self._leeway,
                options={"require": ["exp", "iss", "aud", "sub"]},
            )
            sub = UUID(str(payload["sub"]))
        except (jwt.PyJWTError, ValueError):
            raise InvalidTokenError("invalid") from None
        email = payload.get("email")
        if not isinstance(email, str) or not email:
            raise InvalidTokenError("missing_email")
        meta = payload.get("user_metadata")
        verified = payload.get("email_verified") is True or (
            isinstance(meta, dict) and meta.get("email_verified") is True
        )
        return TokenClaims(sub=sub, email=email, email_verified=verified)


def build_verifier(
    *,
    supabase_url: str,
    audience: str,
    app_env: str,
    hs256_secret: str | None,
    jwks_ttl: float,
    jwks_min_refetch: float,
    fetcher: JwksFetcher | None = None,
) -> TokenVerifier:
    allow_hs256 = bool(hs256_secret) and app_env.strip().lower() in LOCAL_ENVS
    return TokenVerifier(
        issuer=issuer_for(supabase_url),
        audience=audience,
        jwks=JWKSCache(fetcher or http_jwks_fetcher(supabase_url), jwks_ttl, jwks_min_refetch),
        hs256_secret=hs256_secret if allow_hs256 else None,
    )
