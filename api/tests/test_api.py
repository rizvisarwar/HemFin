import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from hemfin.core import db
from hemfin.core.config import Settings


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    assert r.headers["x-request-id"]


def test_request_id_is_propagated(client: TestClient) -> None:
    r = client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert r.headers["x-request-id"] == "abc-123"


def test_404_is_problem_json(client: TestClient) -> None:
    r = client.get("/nope")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    assert body["status"] == 404
    assert body["title"] == "Not Found"
    assert body["instance"] == "/nope"
    assert body["type"] == "about:blank"


def test_validation_error_is_problem_json(client: TestClient) -> None:
    r = client.get("/needs-int/abc")
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    assert body["status"] == 422
    assert body["errors"][0]["loc"] == ["path", "n"]


def test_unhandled_error_does_not_leak(client: TestClient) -> None:
    r = client.get("/boom")
    assert r.status_code == 500
    assert r.headers["content-type"].startswith("application/problem+json")
    assert "secret internal detail" not in r.text
    assert "Traceback" not in r.text


def test_ready_503_when_db_unavailable(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def broken() -> None:
        raise RuntimeError("no db")

    monkeypatch.setattr(db, "get_engine", broken)
    r = client.get("/health/ready")
    assert r.status_code == 503
    assert r.headers["content-type"].startswith("application/problem+json")


def test_openapi_title(client: TestClient) -> None:
    assert client.get("/openapi.json").json()["info"]["title"] == "HemFin API"


def test_settings_parsing() -> None:
    s = Settings(
        _env_file=None,  # type: ignore[call-arg]
        DATABASE_URL="postgresql://u:p@h/db",
        CORS_ORIGINS="http://a.com, http://b.com",  # type: ignore[arg-type]
    )
    assert s.DATABASE_URL == "postgresql+asyncpg://u:p@h/db"
    assert s.CORS_ORIGINS == ["http://a.com", "http://b.com"]


@pytest.mark.db
async def test_ready_ok_with_db(client: TestClient) -> None:
    r = client.get("/health/ready")
    assert r.status_code == 200
    await db.dispose_engine()


@pytest.mark.db
async def test_app_schema_exists() -> None:
    async with db.get_engine().connect() as conn:
        res = await conn.execute(
            text("SELECT 1 FROM information_schema.schemata WHERE schema_name='app'")
        )
        assert res.scalar() == 1
    await db.dispose_engine()
