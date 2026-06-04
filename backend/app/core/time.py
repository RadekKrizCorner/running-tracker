from __future__ import annotations

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo


def utc_now() -> datetime:
    """Return the current UTC datetime."""
    return datetime.now(UTC)


def parse_datetime(value: str | None) -> datetime | None:
    """Parse an ISO datetime string into a timezone-aware datetime."""
    if value is None:
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def start_of_day(value: date, timezone: str) -> datetime:
    """Return the UTC instant for local start of day."""
    local = datetime.combine(value, time.min, tzinfo=ZoneInfo(timezone))
    return local.astimezone(UTC)


def end_of_day(value: date, timezone: str) -> datetime:
    """Return the UTC instant for local end of day."""
    local = datetime.combine(value, time.max, tzinfo=ZoneInfo(timezone))
    return local.astimezone(UTC)


def local_date(value: datetime, timezone: str) -> date:
    """Return a datetime as a date in the requested timezone."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(ZoneInfo(timezone)).date()


def week_start(value: date, timezone: str = "Europe/Prague") -> date:
    """Return the Monday week start for a date."""
    _ = timezone
    return value.fromordinal(value.toordinal() - value.weekday())
