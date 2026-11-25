from pathlib import Path

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


def test_invalid_request_id_is_replaced(client: TestClient) -> None:
    for bad in ("has space!", "x" * 65, "a/b"):
        r = client.get("/health", headers={"X-Request-ID": bad})
        assert r.headers["x-request-id"] != bad
        assert len(r.headers["x-request-id"]) == 32


def test_500_has_request_id_and_cors(client: TestClient) -> None:
    r = client.get("/boom", headers={"Origin": "http://localhost:3000", "X-Request-ID": "rid-1"})
    assert r.status_code == 500
    assert r.headers["x-request-id"] == "rid-1"
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert r.json()["request_id"] == "rid-1"


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


@pytest.mark.db
def test_migration_roundtrip() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parent.parent / "alembic"))
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
