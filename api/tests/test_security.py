import base64
import json
import logging
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI

from authkit import FakeJwks, TestKey
from conftest import Clock
from hemfin.core.security import (
    AuthUnavailableError,
    InvalidTokenError,
    JWKSCache,
    TokenVerifier,
    build_verifier,
)

SUB = uuid4()


async def test_valid_token(verifier: TokenVerifier, key: TestKey) -> None:
    claims = await verifier.verify(key.token(SUB, "a@example.test"))
    assert claims.sub == SUB
    assert claims.email == "a@example.test"


@pytest.mark.parametrize(
    ("kwargs", "reason"),
    [
        ({"exp_in": -3600}, "invalid"),
        ({"iss": "http://evil.test/auth/v1"}, "invalid"),
        ({"aud": "somebody-else"}, "invalid"),
        ({"email": None}, "missing_email"),
    ],
)
async def test_rejected_claims(
    verifier: TokenVerifier, key: TestKey, kwargs: dict[str, object], reason: str
) -> None:
    with pytest.raises(InvalidTokenError) as exc:
        await verifier.verify(key.token(SUB, **kwargs))  # type: ignore[arg-type]
    assert exc.value.reason == reason


async def test_small_leeway_accepts_just_expired(verifier: TokenVerifier, key: TestKey) -> None:
    assert (await verifier.verify(key.token(SUB, exp_in=-3))).sub == SUB


async def test_bad_signature(verifier: TokenVerifier, key: TestKey) -> None:
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(InvalidTokenError):
        await verifier.verify(key.token(SUB, signing_key=other))


def _b64(obj: object) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


async def test_alg_none_rejected(verifier: TokenVerifier, key: TestKey) -> None:
    payload = {"sub": str(SUB), "iss": "http://supabase.test/auth/v1", "aud": "authenticated"}
    payload["exp"] = 4102444800  # far future
    unsigned = f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(payload)}."
    with pytest.raises(InvalidTokenError) as exc:
        await verifier.verify(unsigned)
    assert exc.value.reason == "unsupported_alg"


async def test_hs256_rejected_unless_enabled(verifier: TokenVerifier) -> None:
    secret = "x" * 40
    token = jwt.encode(
        {
            "sub": str(SUB),
            "email": "a@example.test",
            "iss": "http://supabase.test/auth/v1",
            "aud": "authenticated",
            "exp": 4102444800,
        },
        secret,
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError) as exc:
        await verifier.verify(token)
    assert exc.value.reason == "unsupported_alg"


def _hs_token(secret: str) -> str:
    return jwt.encode(
        {
            "sub": str(SUB),
            "email": "a@example.test",
            "iss": "http://supabase.test/auth/v1",
            "aud": "authenticated",
            "exp": 4102444800,
        },
        secret,
        algorithm="HS256",
    )


@pytest.mark.parametrize(
    ("env", "secret", "accepted"),
    [
        ("local", "s" * 40, True),
        ("test", "s" * 40, True),
        ("production", "s" * 40, False),  # never in a deployed environment
        ("local", None, False),  # needs the secret too
    ],
)
async def test_hs256_only_local_with_secret(env: str, secret: str | None, accepted: bool) -> None:
    v = build_verifier(
        supabase_url="http://supabase.test",
        audience="authenticated",
        app_env=env,
        hs256_secret=secret,
        jwks_ttl=600,
        jwks_min_refetch=30,
        fetcher=FakeJwks(),
    )
    token = _hs_token("s" * 40)
    if accepted:
        assert (await v.verify(token)).sub == SUB
    else:
        with pytest.raises(InvalidTokenError):
            await v.verify(token)


async def test_unknown_kid_triggers_refetch(
    verifier: TokenVerifier, key: TestKey, jwks: FakeJwks, clock: Clock
) -> None:
    await verifier.verify(key.token(SUB))
    assert jwks.fetches == 1
    rotated = TestKey("kid-2")
    jwks.keys.append(rotated)
    # Within the cooldown the cache is not hammered...
    with pytest.raises(InvalidTokenError):
        await verifier.verify(rotated.token(SUB))
    assert jwks.fetches == 1
    # ...after it, an unknown kid refetches and the rotated key verifies.
    clock.now += 31
    assert (await verifier.verify(rotated.token(SUB))).sub == SUB
    assert jwks.fetches == 2


async def test_unknown_kid_never_found(verifier: TokenVerifier, key: TestKey, clock: Clock) -> None:
    await verifier.verify(key.token(SUB))
    clock.now += 31
    with pytest.raises(InvalidTokenError) as exc:
        await verifier.verify(key.token(SUB, kid="nope"))
    assert exc.value.reason == "unknown_kid"


async def test_jwks_ttl_expiry_refetches(
    verifier: TokenVerifier, key: TestKey, jwks: FakeJwks, clock: Clock
) -> None:
    await verifier.verify(key.token(SUB))
    clock.now += 601
    await verifier.verify(key.token(SUB))
    assert jwks.fetches == 2


async def test_jwks_outage_without_cache_is_unavailable(key: TestKey) -> None:
    async def boom() -> list[dict[str, object]]:
        raise httpx.ConnectError("down")

    v = TokenVerifier(issuer="i", audience="a", jwks=JWKSCache(boom))
    with pytest.raises(AuthUnavailableError):
        await v.verify(key.token(SUB))


async def test_jwks_outage_keeps_stale_keys(
    verifier: TokenVerifier, key: TestKey, jwks: FakeJwks, clock: Clock
) -> None:
    await verifier.verify(key.token(SUB))

    async def boom() -> list[dict[str, object]]:
        raise httpx.ConnectError("down")

    verifier._jwks._fetcher = boom  # type: ignore[assignment]
    clock.now += 601
    assert (await verifier.verify(key.token(SUB))).sub == SUB


async def test_garbage_token(verifier: TokenVerifier) -> None:
    with pytest.raises(InvalidTokenError):
        await verifier.verify("not-a-jwt")


# ---- HTTP behaviour ----


async def test_me_without_token_is_401_problem(
    aclient: httpx.AsyncClient,
) -> None:
    r = await aclient.get("/api/v1/me")
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"
    assert r.headers["content-type"].startswith("application/problem+json")


async def test_invalid_token_is_401_and_not_logged(
    aclient: httpx.AsyncClient, caplog: pytest.LogCaptureFixture, key: TestKey
) -> None:
    token = key.token(SUB, exp_in=-3600)
    with caplog.at_level(logging.DEBUG):
        r = await aclient.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert r.headers["www-authenticate"].startswith("Bearer")
    assert token not in caplog.text
    assert token not in r.text
    assert token.split(".")[1] not in caplog.text


async def test_unconfigured_supabase_is_503(
    authed_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    from hemfin.core import config
    from hemfin.core.deps import get_verifier

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    authed_app.dependency_overrides.clear()
    config.get_settings.cache_clear()
    get_verifier.cache_clear()
    transport = httpx.ASGITransport(app=authed_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/api/v1/me", headers={"Authorization": "Bearer abc.def.ghi"})
    assert r.status_code == 503
