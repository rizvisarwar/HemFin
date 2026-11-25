"""Test helpers: locally generated EC keys, a mocked JWKS and token minting. No network."""

import base64
import time
from typing import Any
from uuid import UUID

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

SUPABASE_URL = "http://supabase.test"
ISSUER = f"{SUPABASE_URL}/auth/v1"
AUDIENCE = "authenticated"


def _b64(n: int) -> str:
    raw = n.to_bytes(32, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class TestKey:
    __test__ = False

    def __init__(self, kid: str) -> None:
        self.kid = kid
        self.private = ec.generate_private_key(ec.SECP256R1())

    def jwk(self) -> dict[str, Any]:
        nums = self.private.public_key().public_numbers()
        return {
            "kty": "EC",
            "crv": "P-256",
            "alg": "ES256",
            "use": "sig",
            "kid": self.kid,
            "x": _b64(nums.x),
            "y": _b64(nums.y),
        }

    def token(
        self,
        sub: UUID | str,
        email: str | None = "user@example.test",
        *,
        iss: str = ISSUER,
        aud: str = AUDIENCE,
        exp_in: int = 3600,
        alg: str = "ES256",
        kid: str | None = None,
        signing_key: Any = None,
    ) -> str:
        now = int(time.time())
        claims: dict[str, Any] = {
            "sub": str(sub),
            "iss": iss,
            "aud": aud,
            "iat": now,
            "exp": now + exp_in,
        }
        if email is not None:
            claims["email"] = email
        return jwt.encode(
            claims,
            signing_key or self.private,
            algorithm=alg,
            headers={"kid": kid or self.kid},
        )


class FakeJwks:
    """A mutable JWKS endpoint stand-in; counts fetches."""

    def __init__(self, *keys: TestKey) -> None:
        self.keys = list(keys)
        self.fetches = 0

    async def __call__(self) -> list[dict[str, Any]]:
        self.fetches += 1
        return [k.jwk() for k in self.keys]
