"""Opaque keyset cursors: base64url(JSON [iso timestamp, uuid]) over (created_at, id)."""

import base64
import json
from datetime import UTC, date, datetime, time
from typing import Annotated, Generic, TypeVar
from uuid import UUID

from fastapi import HTTPException, Query
from pydantic import BaseModel

DEFAULT_LIMIT = 50
MAX_LIMIT = 100

LimitParam = Annotated[int, Query(ge=1, le=MAX_LIMIT, description="Page size.")]
CursorParam = Annotated[str | None, Query(description="Opaque cursor from `next_cursor`.")]

T = TypeVar("T")


class Page(BaseModel, Generic[T]):  # noqa: UP046 - keep Python 3.11 compatible
    items: list[T]
    next_cursor: str | None = None


def encode_cursor(created_at: datetime, row_id: UUID) -> str:
    raw = json.dumps([created_at.isoformat(), str(row_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        ts, rid = json.loads(base64.urlsafe_b64decode(padded.encode()))
        at = datetime.fromisoformat(ts)
        if at.tzinfo is None:
            raise ValueError("naive")
        return at, UUID(rid)
    except Exception:
        raise HTTPException(422, detail="Invalid cursor.") from None


def encode_date_cursor(day: date, row_id: UUID) -> str:
    """Cursor over (date, id), for lists ordered by a calendar date."""
    return encode_cursor(datetime.combine(day, time.min, tzinfo=UTC), row_id)


def decode_date_cursor(cursor: str) -> tuple[date, UUID]:
    at, rid = decode_cursor(cursor)
    return at.astimezone(UTC).date(), rid
