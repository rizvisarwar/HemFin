import os
from collections.abc import AsyncIterator, Iterator

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ["HEMFIN_TEST_MODE"] = "1"  # test-only: skips the startup DATABASE_URL fail-fast

from authkit import AUDIENCE, ISSUER, FakeJwks, TestKey  # noqa: E402
from hemfin.core import db  # noqa: E402
from hemfin.core.deps import get_verifier  # noqa: E402
from hemfin.core.security import JWKSCache, TokenVerifier  # noqa: E402
from hemfin.main import create_app  # noqa: E402


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get("DATABASE_URL"):
        return
    skip = pytest.mark.skip(reason="DATABASE_URL not set")
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app()

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret internal detail")

    @app.get("/needs-int/{n}")
    async def needs_int(n: int) -> dict[str, int]:
        return {"n": n}

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def key() -> TestKey:
    return TestKey("kid-1")


@pytest.fixture
def jwks(key: TestKey) -> FakeJwks:
    return FakeJwks(key)


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def verifier(jwks: FakeJwks, clock: Clock) -> TokenVerifier:
    return TokenVerifier(
        issuer=ISSUER,
        audience=AUDIENCE,
        jwks=JWKSCache(jwks, ttl_seconds=600, min_refetch_seconds=30, clock=clock),
    )


@pytest.fixture
def authed_app(verifier: TokenVerifier) -> FastAPI:
    """The real app with token verification wired to the mocked JWKS."""
    app = create_app()
    app.dependency_overrides[get_verifier] = lambda: verifier
    return app


@pytest.fixture
async def aclient(authed_app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    """Async client bound to the test's event loop (needed for DB-backed tests)."""
    transport = httpx.ASGITransport(app=authed_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await db.dispose_engine()
