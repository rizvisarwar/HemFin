"""The verified-email gate relies on server-controlled token facts only."""

from uuid import uuid4

import pytest

from authkit import TestKey
from hemfin.core.security import TokenVerifier

SUB = uuid4()


@pytest.mark.parametrize(
    ("kwargs", "verified"),
    [
        ({"email_verified": None}, True),  # no top-level claim: "Confirm email" is on
        ({"email_verified": True}, True),
        ({"email_verified": False}, False),
        ({"email_verified": None, "extra_claims": {"is_anonymous": True}}, False),
        ({"email_verified": True, "extra_claims": {"is_anonymous": True}}, False),
        ({"email_verified": None, "extra_claims": {"is_anonymous": False}}, True),
        # user_metadata is user-writable, so it never changes the outcome either way.
        ({"email_verified": False, "user_metadata": {"email_verified": True}}, False),
        ({"email_verified": None, "user_metadata": {"email_verified": False}}, True),
    ],
)
async def test_email_verified_uses_server_controlled_facts_only(
    verifier: TokenVerifier, key: TestKey, kwargs: dict[str, object], verified: bool
) -> None:
    claims = await verifier.verify(key.token(SUB, "a@example.test", **kwargs))  # type: ignore[arg-type]
    assert claims.email_verified is verified


async def test_blank_email_is_not_verified(verifier: TokenVerifier, key: TestKey) -> None:
    claims = await verifier.verify(key.token(SUB, "   ", email_verified=None))
    assert claims.email_verified is False
