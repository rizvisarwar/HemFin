from datetime import date, timedelta

from hemfin.core.errors import CodedHTTPException

# Record dates may run one day ahead of UTC today, to allow for time zones east of UTC.
MAX_DAYS_AHEAD = 1


def check_not_future(day: date, today: date, field: str) -> None:
    if day > today + timedelta(days=MAX_DAYS_AHEAD):
        raise CodedHTTPException(
            422, "date_in_future", f"{field} cannot be more than a day in the future."
        )
