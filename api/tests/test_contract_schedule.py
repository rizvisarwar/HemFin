"""Schedule service: pure, so these run without a database."""

from datetime import date

import pytest

from hemfin.modules.contracts.schedule import (
    ContractTerms,
    EventType,
    Frequency,
    add_months,
    compute_schedule,
    upcoming_events,
)

D = date


def terms(start: date, freq: Frequency = Frequency.monthly, **kw: object) -> ContractTerms:
    return ContractTerms(start_date=start, frequency=freq, **kw)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("anchor", "months", "expected"),
    [
        (D(2026, 1, 31), 1, D(2026, 2, 28)),
        (D(2024, 1, 31), 1, D(2024, 2, 29)),  # leap year
        (D(2026, 1, 31), 2, D(2026, 3, 31)),  # back to the anchor day
        (D(2026, 1, 31), 3, D(2026, 4, 30)),
        (D(2024, 2, 29), 12, D(2025, 2, 28)),
        (D(2024, 2, 29), 48, D(2028, 2, 29)),
        (D(2026, 11, 15), 2, D(2027, 1, 15)),  # year rollover
    ],
)
def test_add_months(anchor: date, months: int, expected: date) -> None:
    assert add_months(anchor, months) == expected


@pytest.mark.parametrize(
    ("freq", "start", "as_of", "expected"),
    [
        (Frequency.weekly, D(2026, 1, 5), D(2026, 1, 5), D(2026, 1, 5)),  # today counts
        (Frequency.weekly, D(2026, 1, 5), D(2026, 1, 6), D(2026, 1, 12)),
        (Frequency.weekly, D(2026, 1, 5), D(2025, 12, 1), D(2026, 1, 5)),  # before start
        (Frequency.monthly, D(2026, 1, 31), D(2026, 2, 1), D(2026, 2, 28)),
        (Frequency.monthly, D(2026, 1, 31), D(2026, 3, 1), D(2026, 3, 31)),
        (Frequency.monthly, D(2024, 1, 31), D(2024, 2, 10), D(2024, 2, 29)),
        (Frequency.quarterly, D(2026, 1, 31), D(2026, 2, 1), D(2026, 4, 30)),
        (Frequency.quarterly, D(2026, 1, 15), D(2026, 4, 16), D(2026, 7, 15)),
        (Frequency.semiannual, D(2026, 1, 15), D(2026, 1, 16), D(2026, 7, 15)),
        (Frequency.annual, D(2024, 2, 29), D(2025, 1, 1), D(2025, 2, 28)),
        (Frequency.annual, D(2024, 2, 29), D(2027, 3, 1), D(2028, 2, 29)),
        (Frequency.monthly, D(2020, 5, 10), D(2026, 11, 27), D(2026, 12, 10)),
    ],
)
def test_next_payment(freq: Frequency, start: date, as_of: date, expected: date) -> None:
    assert compute_schedule(terms(start, freq), as_of).next_payment_date == expected


def test_end_date_without_auto_renew_stops_payments() -> None:
    t = terms(D(2026, 1, 15), end_date=D(2026, 6, 15))
    assert compute_schedule(t, D(2026, 6, 15)).next_payment_date == D(2026, 6, 15)
    assert compute_schedule(t, D(2026, 6, 16)).next_payment_date is None
    assert compute_schedule(t, D(2026, 6, 16)).renewal_date is None


def test_cancelled_has_no_schedule() -> None:
    t = terms(D(2026, 1, 15), auto_renew=True, notice_period_days=30, active=False)
    s = compute_schedule(t, D(2026, 2, 1))
    assert (s.next_payment_date, s.renewal_date, s.notice_deadline) == (None, None, None)
    assert upcoming_events(t, D(2026, 2, 1), D(2027, 2, 1)) == []


def test_no_end_date_pays_forever_and_never_renews() -> None:
    s = compute_schedule(terms(D(2020, 1, 1)), D(2026, 11, 27))
    assert s.next_payment_date == D(2026, 12, 1)
    assert s.renewal_date is None
    assert s.notice_deadline is None


@pytest.mark.parametrize(
    ("kw", "as_of", "renewal"),
    [
        # No end date: first renewal is start plus the default 12 months.
        ({}, D(2026, 3, 1), D(2027, 1, 10)),
        ({}, D(2027, 1, 10), D(2027, 1, 10)),  # on the day
        ({}, D(2027, 1, 11), D(2028, 1, 10)),  # rolls forward
        ({"renewal_term_months": 6}, D(2026, 3, 1), D(2026, 7, 10)),
        ({"renewal_term_months": 6}, D(2026, 8, 1), D(2027, 1, 10)),
        # The end date is the end of the current term and the first renewal.
        ({"end_date": D(2026, 6, 30)}, D(2026, 1, 1), D(2026, 6, 30)),
        ({"end_date": D(2026, 6, 30)}, D(2026, 7, 1), D(2027, 6, 30)),
        ({"end_date": D(2026, 6, 30), "renewal_term_months": 3}, D(2026, 7, 1), D(2026, 9, 30)),
        ({"end_date": D(2026, 6, 30), "renewal_term_months": 3}, D(2026, 10, 1), D(2026, 12, 30)),
    ],
)
def test_renewal_rollover(kw: dict[str, object], as_of: date, renewal: date) -> None:
    t = terms(D(2026, 1, 10), auto_renew=True, **kw)
    assert compute_schedule(t, as_of).renewal_date == renewal


def test_auto_renew_keeps_paying_past_end_date() -> None:
    t = terms(D(2026, 1, 10), end_date=D(2026, 6, 30), auto_renew=True)
    assert compute_schedule(t, D(2026, 8, 1)).next_payment_date == D(2026, 8, 10)


def test_notice_deadline_is_renewal_minus_notice_days() -> None:
    t = terms(D(2026, 1, 10), auto_renew=True, notice_period_days=30)
    s = compute_schedule(t, D(2026, 3, 1))
    assert s.renewal_date == D(2027, 1, 10)
    assert s.notice_deadline == D(2026, 12, 11)


def test_notice_deadline_can_be_in_the_past() -> None:
    t = terms(D(2026, 1, 10), auto_renew=True, notice_period_days=30)
    s = compute_schedule(t, D(2026, 12, 20))
    assert s.renewal_date == D(2027, 1, 10)
    assert s.notice_deadline == D(2026, 12, 11)


def test_no_notice_period_means_no_deadline() -> None:
    s = compute_schedule(terms(D(2026, 1, 10), auto_renew=True), D(2026, 3, 1))
    assert s.renewal_date is not None
    assert s.notice_deadline is None


def test_as_of_is_the_only_clock() -> None:
    t = terms(D(2026, 1, 31))
    assert compute_schedule(t, D(2026, 2, 1)) != compute_schedule(t, D(2026, 3, 1))
    assert compute_schedule(t, D(2026, 2, 1)) == compute_schedule(t, D(2026, 2, 1))


def test_upcoming_events_window_sorted() -> None:
    t = terms(
        D(2026, 1, 10),
        Frequency.weekly,
        auto_renew=True,
        end_date=D(2026, 12, 20),
        notice_period_days=14,
    )
    ev = upcoming_events(t, D(2026, 12, 1), D(2026, 12, 31))
    dates = [e.date for e in ev]
    assert dates == sorted(dates)
    payments = [e.date for e in ev if e.type is EventType.payment]
    assert payments[0] == D(2026, 12, 5)
    assert payments[-1] == D(2026, 12, 26)
    assert [(e.type, e.date) for e in ev if e.type is not EventType.payment] == [
        (EventType.notice_deadline, D(2026, 12, 6)),
        (EventType.renewal, D(2026, 12, 20)),
    ]


def test_upcoming_notice_deadline_before_window_end_for_later_renewal() -> None:
    t = terms(D(2026, 1, 10), auto_renew=True, notice_period_days=30)
    ev = upcoming_events(t, D(2026, 12, 1), D(2026, 12, 31))
    kinds = [(e.type, e.date) for e in ev if e.type is not EventType.payment]
    # Renewal is Jan 10, outside the window; the deadline (Dec 11) is inside.
    assert kinds == [(EventType.notice_deadline, D(2026, 12, 11))]


def test_upcoming_excludes_past_deadline_and_ends_at_end_date() -> None:
    t = terms(D(2026, 1, 10), end_date=D(2026, 3, 10), notice_period_days=30)
    ev = upcoming_events(t, D(2026, 2, 1), D(2026, 12, 31))
    assert [e.date for e in ev] == [D(2026, 2, 10), D(2026, 3, 10)]
