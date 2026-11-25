import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from hemfin.main import create_app


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
