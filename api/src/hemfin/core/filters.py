from uuid import UUID

from hemfin.core.errors import CodedHTTPException


def parse_member_filter(value: str | None) -> tuple[UUID | None, bool]:
    """`member_user_id` is a user id, or the word `none` for the whole household.

    Returns `(user_id, whole_household)`.
    """
    if value is None:
        return None, False
    if value == "none":
        return None, True
    try:
        return UUID(value), False
    except ValueError:
        raise CodedHTTPException(
            422, "invalid_member_filter", "member_user_id must be a user id or `none`."
        ) from None
