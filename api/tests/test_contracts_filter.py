from uuid import UUID, uuid4

import pytest

from hemfin.core.errors import CodedHTTPException
from hemfin.core.filters import parse_member_filter


def test_member_filter_values() -> None:
    uid = uuid4()
    assert parse_member_filter(None) == (None, False)
    assert parse_member_filter("none") == (None, True)
    parsed, whole = parse_member_filter(str(uid))
    assert parsed == uid and isinstance(parsed, UUID) and whole is False


def test_member_filter_rejects_other_text() -> None:
    with pytest.raises(CodedHTTPException) as exc:
        parse_member_filter("someone")
    assert exc.value.status_code == 422
    assert exc.value.code == "invalid_member_filter"
