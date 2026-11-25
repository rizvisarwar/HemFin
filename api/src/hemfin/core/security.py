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
        self._keys: dict[str, PyJWK] = {}
        self._fetched_at: float | None = None
        self._lock = asyncio.Lock()

    async def _refresh(self) -> None:
        try:
            raw = await self._fetcher()
        except Exception:
            log.warning("jwks fetch failed")
            if not self._keys:
                raise AuthUnavailableError from None
            self._fetched_at = self._clock()  # keep serving stale keys; retry after cooldown
            return
        keys: dict[str, PyJWK] = {}
        for jwk in raw:
            kid = jwk.get("kid")
            if not isinstance(kid, str) or jwk.get("use") == "enc":
                continue
            try:
                keys[kid] = PyJWK(jwk)
            except Exception:
                continue  # unsupported key type (e.g. a legacy symmetric entry)
        self._keys = keys
        self._fetched_at = self._clock()

    async def get_key(self, kid: str) -> PyJWK:
        async with self._lock:
            now = self._clock()
            age = None if self._fetched_at is None else now - self._fetched_at
            expired = age is None or age >= self._ttl
            unknown_kid = kid not in self._keys and age is not None and age >= self._min_refetch
            if expired or unknown_kid:
                await self._refresh()
        key = self._keys.get(kid)
        if key is None:
            raise InvalidTokenError("unknown_kid")
        return key


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
            jwk = await self._jwks.get_key(kid)
            jwk_alg = jwk._jwk_data.get("alg")  # a JWK that declares an alg must match
            if jwk_alg is not None and jwk_alg != alg:
                raise InvalidTokenError("alg_mismatch")
            verify_with = jwk.key
        elif alg == "HS256" and self._hs256_secret:
            verify_with = self._hs256_secret
        else:
            raise InvalidTokenError("unsupported_alg")
        try:
            payload = jwt.decode(
                token,
                verify_with,
                algorithms=[alg],
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
        return TokenClaims(sub=sub, email=email)


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
