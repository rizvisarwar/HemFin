from datetime import date, timedelta

from hemfin.core.errors import CodedHTTPException

# Record dates may run one day ahead of UTC today, to allow for time zones east of UTC.
MAX_DAYS_AHEAD = 1


def check_range(from_: date | None, to: date | None) -> None:
    if from_ is not None and to is not None and from_ > to:
        raise CodedHTTPException(422, "invalid_dates", "from must be on or before to.")


def check_not_future(day: date, today: date, field: str) -> None:
    if day > today + timedelta(days=MAX_DAYS_AHEAD):
        raise CodedHTTPException(
            422, "date_in_future", f"{field} cannot be more than a day in the future."
        )
