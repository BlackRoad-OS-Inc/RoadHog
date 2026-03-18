from datetime import UTC, datetime
from typing import Optional

from dateutil.rrule import rrulestr

WINDOW_SIZE = 10  # Number of pending runs to maintain


def validate_rrule(rrule_string: str) -> None:
    """Validate an RRULE string. Raises ValueError if invalid."""
    rrulestr(rrule_string)


def compute_next_occurrences(
    rrule_string: str,
    starts_at: datetime,
    after: Optional[datetime] = None,
    count: int = WINDOW_SIZE,
) -> list[datetime]:
    """
    Compute the next `count` occurrences from an RRULE string.

    Args:
        rrule_string: RFC 5545 RRULE string
        starts_at: DTSTART for the recurrence
        after: Only return occurrences after this datetime (exclusive).
               Defaults to now if not provided.
        count: Maximum number of occurrences to return
    """
    rule = rrulestr(rrule_string, dtstart=starts_at)
    if after is None:
        after = datetime.now(UTC)

    # rrule.after() with inc=False excludes the exact datetime
    # We iterate to collect up to `count` occurrences
    occurrences: list[datetime] = []
    current = after
    for _ in range(count * 10):  # Safety limit to avoid infinite loop
        next_dt = rule.after(current, inc=False)
        if next_dt is None:
            break
        occurrences.append(next_dt)
        if len(occurrences) >= count:
            break
        current = next_dt

    return occurrences
