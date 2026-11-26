"""The compensating update after a failed invitation email (no database)."""

import logging
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from hemfin.core.email import EmailDeliveryError
from hemfin.core.errors import CodedHTTPException
from hemfin.modules.invitations import service

TOKEN = "T0kenValueThatMustNeverBeLogged"


class _Sender:
    async def send(self, *, to: str, subject: str, text: str) -> None:
        raise EmailDeliveryError


class _Session:
    def __init__(self, fail_on: str | None = None) -> None:
        self.fail_on = fail_on
        self.statements: list[Any] = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, stmt: Any) -> None:
        if self.fail_on == "execute":
            raise RuntimeError("db down")
        self.statements.append(stmt)

    async def commit(self) -> None:
        if self.fail_on == "commit":
            raise RuntimeError("db down")
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


async def _run(session: _Session) -> CodedHTTPException:
    with pytest.raises(CodedHTTPException) as exc:
        await service._deliver(
            session,  # type: ignore[arg-type]
            _Sender(),
            invitation_id=uuid4(),
            undo_resend_count=True,
            to="a@example.test",
            space_name="Home",
            inviter=None,
            link_base="http://web.test",
            token=TOKEN,
        )
    return exc.value


async def test_undo_only_touches_the_row_with_the_failed_token() -> None:
    session = _Session()
    err = await _run(session)
    assert (err.status_code, err.code) == (503, "email_not_sent")
    assert session.commits == 1
    sql = str(session.statements[0].compile(dialect=postgresql.dialect()))
    assert "token_hash" in sql.split("WHERE")[1]
    params = session.statements[0].compile(dialect=postgresql.dialect()).params
    assert service.hash_token(TOKEN) in params.values()
    assert TOKEN not in params.values()


@pytest.mark.parametrize("fail_on", ["execute", "commit"])
async def test_undo_failure_still_returns_503_and_logs_no_token(
    fail_on: str, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING)
    session = _Session(fail_on)
    err = await _run(session)
    assert (err.status_code, err.code) == (503, "email_not_sent")
    assert session.rollbacks == 1
    assert "could not undo" in caplog.text
    assert TOKEN not in caplog.text and service.hash_token(TOKEN) not in caplog.text
