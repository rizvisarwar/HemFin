import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from hemfin.core import config, db
from hemfin.core.config import InvalidSecretError, MissingSecretError, Settings, load_settings
from hemfin.main import create_app


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
        DATABASE_URL="postgresql://u@h/db",  # type: ignore[arg-type]
        CORS_ORIGINS="http://a.com, http://b.com",  # type: ignore[arg-type]
    )
    assert s.DATABASE_URL is not None
    assert s.DATABASE_URL.get_secret_value() == "postgresql+asyncpg://u@h/db"
    assert s.CORS_ORIGINS == ["http://a.com", "http://b.com"]


MARKER = "fake-marker-value"


def test_secret_read_from_secrets_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    (tmp_path / "DATABASE_URL").write_text(f"postgresql://u:{MARKER}@h/db\n")
    s = load_settings(tmp_path)
    assert s.require_database_url() == f"postgresql+asyncpg://u:{MARKER}@h/db"


def test_env_overrides_secrets_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "DATABASE_URL").write_text("postgresql://from-file/db")
    monkeypatch.setenv("DATABASE_URL", "postgresql://from-env/db")
    s = load_settings(tmp_path)
    assert s.require_database_url().endswith("from-env/db")


def test_missing_secrets_dir_is_skipped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    s = load_settings(tmp_path / "does-not-exist")
    assert s.DATABASE_URL is None


def test_secret_masked_in_repr_and_str(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"postgresql://u:{MARKER}@h/db")
    s = load_settings()
    assert MARKER not in repr(s)
    assert MARKER not in str(s)
    assert MARKER not in repr(s.DATABASE_URL)


def test_missing_database_url_names_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    s = Settings(_env_file=None)  # type: ignore[call-arg]
    with pytest.raises(MissingSecretError, match="DATABASE_URL"):
        s.require_database_url()


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


def _reset(monkeypatch: pytest.MonkeyPatch) -> None:
    config.get_settings.cache_clear()
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(db, "_sessionmaker", None)


def test_malformed_url_never_leaks(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    _reset(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", f"postgresql+asyncpg://u:{MARKER}")
    with caplog.at_level(logging.DEBUG):
        r = client.get("/health/ready")
    assert r.status_code == 503
    assert MARKER not in r.text
    assert MARKER not in caplog.text
    for rec in caplog.records:
        assert MARKER not in rec.getMessage()
    with pytest.raises(InvalidSecretError) as ei:
        db.parse_database_url(f"postgresql+asyncpg://u:{MARKER}")
    assert MARKER not in str(ei.value)
    assert ei.value.__cause__ is None
    assert ei.value.__context__ is None
    config.get_settings.cache_clear()


def test_startup_fails_without_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    _reset(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("SECRETS_DIR", "/nonexistent-dir")
    with (
        pytest.raises(MissingSecretError, match="DATABASE_URL") as ei,
        TestClient(create_app()),
    ):
        pass
    assert "postgres" not in str(ei.value)
    config.get_settings.cache_clear()


def test_startup_fails_with_malformed_url(monkeypatch: pytest.MonkeyPatch) -> None:
    _reset(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", f"postgresql+asyncpg://u:{MARKER}")
    with pytest.raises(InvalidSecretError) as ei, TestClient(create_app()):
        pass
    assert MARKER not in str(ei.value)
    config.get_settings.cache_clear()
