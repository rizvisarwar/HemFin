"""DB-backed profile and address tests (CI only)."""

import asyncio
import logging
from uuid import uuid4

import httpx
import pytest

from authkit import TestKey

pytestmark = pytest.mark.db

ADDR = {"label": "Home", "line1": "Main Street 1", "city": "Utrecht", "country": "NL"}
PHONE = "+31612345678"


def _h(key: TestKey, sub: object) -> dict[str, str]:
    return {"Authorization": f"Bearer {key.token(sub, f'{sub}@example.test')}"}  # type: ignore[arg-type]


async def test_profile_defaults_and_patch(aclient: httpx.AsyncClient, key: TestKey) -> None:
    h = _h(key, uuid4())
    r = await aclient.get("/api/v1/me/profile", headers=h)
    assert r.status_code == 200
    assert r.json()["base_currency"] == "EUR"
    assert r.json()["locale"] == "en"
    assert r.json()["phone_e164"] is None

    r = await aclient.patch(
        "/api/v1/me/profile",
        headers=h,
        json={"phone_e164": "+31 6 1234 5678", "base_currency": "usd", "locale": "nl-nl"},
    )
    assert r.status_code == 200
    assert r.json()["phone_e164"] == PHONE
    assert r.json()["base_currency"] == "USD"
    assert r.json()["locale"] == "nl-NL"

    # Partial patch leaves the rest alone; null clears the phone.
    r = await aclient.patch("/api/v1/me/profile", headers=h, json={"phone_e164": None})
    assert r.json()["phone_e164"] is None
    assert r.json()["base_currency"] == "USD"


async def test_invalid_phone_is_422(aclient: httpx.AsyncClient, key: TestKey) -> None:
    r = await aclient.patch(
        "/api/v1/me/profile", headers=_h(key, uuid4()), json={"phone_e164": "+987 6543 21"}
    )
    assert r.status_code == 422
    assert "6543" not in r.text
    assert r.headers["content-type"].startswith("application/problem+json")


async def test_address_crud_and_default(aclient: httpx.AsyncClient, key: TestKey) -> None:
    h = _h(key, uuid4())
    assert (await aclient.get("/api/v1/me/addresses", headers=h)).json() == []

    first = (await aclient.post("/api/v1/me/addresses", headers=h, json=ADDR)).json()
    assert first["is_default"] is True  # the first address becomes the default
    second = (
        await aclient.post("/api/v1/me/addresses", headers=h, json={**ADDR, "label": "Work"})
    ).json()
    assert second["is_default"] is False

    r = await aclient.post(f"/api/v1/me/addresses/{second['id']}/default", headers=h)
    assert r.status_code == 200 and r.json()["is_default"] is True
    listed = (await aclient.get("/api/v1/me/addresses", headers=h)).json()
    assert [a["is_default"] for a in listed].count(True) == 1
    assert listed[0]["id"] == second["id"]

    # Creating with is_default moves the default.
    third = (
        await aclient.post(
            "/api/v1/me/addresses", headers=h, json={**ADDR, "label": "Cabin", "is_default": True}
        )
    ).json()
    listed = (await aclient.get("/api/v1/me/addresses", headers=h)).json()
    assert [a["id"] for a in listed if a["is_default"]] == [third["id"]]

    r = await aclient.patch(
        f"/api/v1/me/addresses/{first['id']}", headers=h, json={"city": "Leiden", "line2": "Apt 4"}
    )
    assert r.status_code == 200
    assert r.json()["city"] == "Leiden" and r.json()["line2"] == "Apt 4"
    r = await aclient.patch(f"/api/v1/me/addresses/{first['id']}", headers=h, json={"line2": None})
    assert r.json()["line2"] is None
    r = await aclient.patch(f"/api/v1/me/addresses/{first['id']}", headers=h, json={"city": None})
    assert r.status_code == 422

    assert (
        await aclient.delete(f"/api/v1/me/addresses/{first['id']}", headers=h)
    ).status_code == 204
    assert (
        await aclient.delete(f"/api/v1/me/addresses/{first['id']}", headers=h)
    ).status_code == 404


async def test_other_users_address_is_404(aclient: httpx.AsyncClient, key: TestKey) -> None:
    a, b = _h(key, uuid4()), _h(key, uuid4())
    addr = (await aclient.post("/api/v1/me/addresses", headers=a, json=ADDR)).json()
    path = f"/api/v1/me/addresses/{addr['id']}"
    assert (await aclient.patch(path, headers=b, json={"city": "X"})).status_code == 404
    assert (await aclient.delete(path, headers=b)).status_code == 404
    assert (await aclient.post(f"{path}/default", headers=b)).status_code == 404
    assert (await aclient.get("/api/v1/me/addresses", headers=b)).json() == []
    # Untouched for the owner.
    assert (await aclient.get("/api/v1/me/addresses", headers=a)).json()[0]["city"] == "Utrecht"


async def test_address_limit(aclient: httpx.AsyncClient, key: TestKey) -> None:
    h = _h(key, uuid4())
    for i in range(20):
        r = await aclient.post("/api/v1/me/addresses", headers=h, json={**ADDR, "label": f"A{i}"})
        assert r.status_code == 201
    r = await aclient.post("/api/v1/me/addresses", headers=h, json=ADDR)
    assert r.status_code == 409


async def test_concurrent_default_changes_keep_one_default(
    aclient: httpx.AsyncClient, key: TestKey
) -> None:
    h = _h(key, uuid4())
    ids = [
        (
            await aclient.post("/api/v1/me/addresses", headers=h, json={**ADDR, "label": f"A{i}"})
        ).json()["id"]
        for i in range(4)
    ]
    results = await asyncio.gather(
        *[aclient.post(f"/api/v1/me/addresses/{i}/default", headers=h) for i in ids]
    )
    assert all(r.status_code in (200, 409) for r in results)
    listed = (await aclient.get("/api/v1/me/addresses", headers=h)).json()
    assert [a["is_default"] for a in listed].count(True) == 1


async def test_no_pii_in_logs(
    aclient: httpx.AsyncClient, key: TestKey, caplog: pytest.LogCaptureFixture
) -> None:
    h = _h(key, uuid4())
    with caplog.at_level(logging.DEBUG):
        await aclient.patch("/api/v1/me/profile", headers=h, json={"phone_e164": PHONE})
        await aclient.patch("/api/v1/me/profile", headers=h, json={"phone_e164": "+31 bad 77"})
        await aclient.post(
            "/api/v1/me/addresses", headers=h, json={**ADDR, "line1": "Secretlaan 99"}
        )
    assert PHONE not in caplog.text
    assert "Secretlaan" not in caplog.text
