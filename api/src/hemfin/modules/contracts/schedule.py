"""Contract schedule: next payment, renewal and notice deadline.

Pure functions: no database, no clock. Every result is relative to the `as_of` date that
the caller passes in. Phase 5 notifications reuse `upcoming_events`.

Rules
- Payments fall on `start_date` plus k periods. Monthly-based periods keep the start day and
  clamp to the month end (start Jan 31 pays Feb 28/29, then Mar 31).
- A cancelled contract has no schedule. Without auto-renew, nothing is paid after `end_date`.
  With auto-renew, `end_date` is the end of the current term and payments continue.
- Renewals exist only with auto-renew. The first renewal is `end_date` (or `start_date` plus
  one term when there is no end date); later ones roll forward by `renewal_term_months`
  (default 12). The renewal date is the next one on or after `as_of`.
- Notice deadline = renewal date minus `notice_period_days`. It can already be in the past
  (too late to cancel before that renewal); `upcoming_events` only lists deadlines in range.
"""

import calendar
import enum
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, timedelta

DEFAULT_RENEWAL_TERM_MONTHS = 12


class Frequency(enum.StrEnum):
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    semiannual = "semiannual"
    annual = "annual"


class EventType(enum.StrEnum):
    payment = "payment"
    renewal = "renewal"
    notice_deadline = "notice_deadline"


_STEP_MONTHS = {
    Frequency.monthly: 1,
    Frequency.quarterly: 3,
    Frequency.semiannual: 6,
    Frequency.annual: 12,
}


@dataclass(frozen=True)
class ContractTerms:
    start_date: date
    frequency: Frequency
    end_date: date | None = None
    auto_renew: bool = False
    renewal_term_months: int | None = None
    notice_period_days: int | None = None
    active: bool = True


@dataclass(frozen=True)
class Schedule:
    next_payment_date: date | None
    renewal_date: date | None
    notice_deadline: date | None


@dataclass(frozen=True)
class ScheduleEvent:
    type: EventType
    date: date


def add_months(anchor: date, months: int) -> date:
    """`anchor` plus whole months, keeping the anchor's day clamped to the month end."""
    year, month0 = divmod(anchor.year * 12 + anchor.month - 1 + months, 12)
    month = month0 + 1
    return date(year, month, min(anchor.day, calendar.monthrange(year, month)[1]))


def _months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


def _payment(terms: ContractTerms, k: int) -> date:
    if terms.frequency is Frequency.weekly:
        return terms.start_date + timedelta(days=7 * k)
    return add_months(terms.start_date, _STEP_MONTHS[terms.frequency] * k)


def _payments(terms: ContractTerms, lo: date) -> Iterator[date]:
    """Payment dates on or after `lo`, ascending, honouring the end rule."""
    if not terms.active:
        return
    if lo <= terms.start_date:
        k = 0
    elif terms.frequency is Frequency.weekly:
        k = -(-(lo - terms.start_date).days // 7)
    else:
        step = _STEP_MONTHS[terms.frequency]
        k = max(0, _months_between(terms.start_date, lo) // step - 1)
        while _payment(terms, k) < lo:
            k += 1
    while True:
        d = _payment(terms, k)
        if not terms.auto_renew and terms.end_date is not None and d > terms.end_date:
            return
        yield d
        k += 1


def _renewals(terms: ContractTerms, lo: date) -> Iterator[date]:
    """Renewal dates on or after `lo`, ascending. Empty without auto-renew."""
    if not terms.active or not terms.auto_renew:
        return
    term = terms.renewal_term_months or DEFAULT_RENEWAL_TERM_MONTHS
    # Every renewal is anchor + k terms (clamped from the anchor's own day, so a Feb 29 start
    # renews Feb 28 and then Feb 29 again). The anchor is the end date, else the start date
    # (whose k=0 is not a renewal).
    anchor = terms.end_date or terms.start_date
    k = 0 if terms.end_date else 1
    if lo > anchor:
        k = max(k, _months_between(anchor, lo) // term - 1)
        while add_months(anchor, term * k) < lo:
            k += 1
    while True:
        yield add_months(anchor, term * k)
        k += 1


def _deadline(terms: ContractTerms, renewal: date) -> date | None:
    if terms.notice_period_days is None:
        return None
    return renewal - timedelta(days=terms.notice_period_days)


def compute_schedule(terms: ContractTerms, as_of: date) -> Schedule:
    renewal = next(_renewals(terms, as_of), None)
    return Schedule(
        next_payment_date=next(_payments(terms, as_of), None),
        renewal_date=renewal,
        notice_deadline=_deadline(terms, renewal) if renewal else None,
    )


def upcoming_events(terms: ContractTerms, as_of: date, until: date) -> list[ScheduleEvent]:
    """All events with `as_of <= date <= until`, sorted by date."""
    events: list[ScheduleEvent] = []
    for d in _payments(terms, as_of):
        if d > until:
            break
        events.append(ScheduleEvent(EventType.payment, d))
    for renewal in _renewals(terms, as_of):
        deadline = _deadline(terms, renewal)
        if (deadline or renewal) > until:
            break
        if renewal <= until:
            events.append(ScheduleEvent(EventType.renewal, renewal))
        if deadline is not None and as_of <= deadline <= until:
            events.append(ScheduleEvent(EventType.notice_deadline, deadline))
    # Same order the service uses: (date, type value); notice_deadline < payment < renewal.
    return sorted(events, key=lambda e: (e.date, e.type.value))
