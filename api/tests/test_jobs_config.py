"""Job-secret auth, blank optional secrets, and the production WEB_BASE_URL warning."""

import logging
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from pydantic import SecretStr

from hemfin.core.config import Settings, get_settings
from hemfin.core.db import get_session
from hemfin.main import lifespan

DAILY = "/internal/jobs/daily"


class _FakeSession:
    async def commit(self) -> None: ...


def _client(app: FastAPI, **settings: Any) -> httpx.AsyncClient:
    cfg = Settings(**settings)
    app.dependency_overrides[get_settings] = lambda: cfg
    app.dependency_overrides[get_session] = lambda: _FakeSession()
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@pytest.mark.parametrize("blank", ["", "   ", "\t"])
def test_blank_optional_secrets_are_unset(blank: str) -> None:
    cfg = Settings(JOB_SECRET=blank, RESEND_API_KEY=blank, SUPABASE_JWT_SECRET=blank)
    assert cfg.JOB_SECRET is None
    assert cfg.RESEND_API_KEY is None
    assert cfg.SUPABASE_JWT_SECRET is None
    assert Settings(JOB_SECRET="real-value").JOB_SECRET is not None  # type: ignore[arg-type]


@pytest.mark.parametrize("blank", ["", "   "])
async def test_blank_job_secret_gives_503_even_with_a_blank_header(
    authed_app: FastAPI, blank: str
) -> None:
    async with _client(authed_app, JOB_SECRET=blank) as c:
        assert (await c.post(DAILY)).status_code == 503
        assert (await c.post(DAILY, headers={"X-Job-Secret": blank})).status_code == 503


async def test_blank_secret_that_bypasses_the_validator_is_still_503(authed_app: FastAPI) -> None:
    cfg = Settings().model_copy(update={"JOB_SECRET": SecretStr("")})
    authed_app.dependency_overrides[get_settings] = lambda: cfg
    authed_app.dependency_overrides[get_session] = lambda: _FakeSession()
    transport = httpx.ASGITransport(app=authed_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        assert (await c.post(DAILY, headers={"X-Job-Secret": ""})).status_code == 503


@pytest.mark.parametrize("header", [None, "", "   ", "wrong"])
async def test_missing_empty_or_wrong_header_is_401(
    authed_app: FastAPI, header: str | None
) -> None:
    headers = {} if header is None else {"X-Job-Secret": header}
    async with _client(authed_app, JOB_SECRET="s3cret-for-test") as c:
        r = await c.post(DAILY, headers=headers)
    assert r.status_code == 401


async def test_correct_header_passes_auth(
    authed_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    from hemfin.modules.invitations import service

    async def fake_expire(_: Any) -> int:
        return 2

    monkeypatch.setattr(service, "expire_due", fake_expire)
    async with _client(authed_app, JOB_SECRET="s3cret-for-test") as c:
        r = await c.post(DAILY, headers={"X-Job-Secret": "s3cret-for-test"})
    assert r.status_code == 200 and r.json() == {"expired_invitations": 2}


@pytest.mark.parametrize(
    ("env", "base", "warns"),
    [
        ("production", "http://localhost:3000", True),
        ("production", "", True),
        ("production", "https://hemfin.example.test", False),
        ("local", "http://localhost:3000", False),
    ],
)
async def test_startup_warns_about_localhost_web_base_url_in_production(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    env: str,
    base: str,
    warns: bool,
) -> None:
    cfg = Settings(APP_ENV=env, WEB_BASE_URL=base, HEMFIN_TEST_MODE=env != "production")
    monkeypatch.setattr("hemfin.main.get_settings", lambda: cfg)
    monkeypatch.setattr("hemfin.main.db.parse_database_url", lambda _: None)
    monkeypatch.setattr(Settings, "require_database_url", lambda self: "x")
    caplog.set_level(logging.WARNING)
    async with lifespan(FastAPI()):
        pass
    assert ("WEB_BASE_URL" in caplog.text) is warns
