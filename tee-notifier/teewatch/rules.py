"""Watch rules: which days and times you actually care about."""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

_DAY_NAMES = {
    "monday": 0, "mon": 0, "m": 0,
    "tuesday": 1, "tue": 1, "tues": 1, "tu": 1,
    "wednesday": 2, "wed": 2, "w": 2,
    "thursday": 3, "thu": 3, "thur": 3, "thurs": 3, "th": 3,
    "friday": 4, "fri": 4, "f": 4,
    "saturday": 5, "sat": 5, "sa": 5,
    "sunday": 6, "sun": 6, "su": 6,
}
_DAY_GROUPS = {
    "weekday": (0, 1, 2, 3, 4),
    "weekdays": (0, 1, 2, 3, 4),
    "weekend": (5, 6),
    "weekends": (5, 6),
    "any": tuple(range(7)),
    "all": tuple(range(7)),
    "daily": tuple(range(7)),
}


def parse_weekday(value) -> tuple[int, ...]:
    """Accept 'fri', 'Friday', 'weekend', or an int (Mon=0)."""
    if isinstance(value, bool):
        raise ValueError(f"invalid weekday: {value!r}")
    if isinstance(value, int):
        if 0 <= value <= 6:
            return (value,)
        raise ValueError(f"weekday out of range (0=Mon..6=Sun): {value}")
    key = str(value).strip().lower()
    if key in _DAY_GROUPS:
        return _DAY_GROUPS[key]
    if key in _DAY_NAMES:
        return (_DAY_NAMES[key],)
    raise ValueError(f"unrecognized weekday: {value!r}")


def parse_weekdays(values) -> frozenset[int]:
    """An empty/absent list means 'every day'."""
    if values is None:
        return frozenset(range(7))
    if isinstance(values, (str, int)):
        values = [values]
    days: set[int] = set()
    for value in values:
        days.update(parse_weekday(value))
    return frozenset(days) if days else frozenset(range(7))


def parse_time(value, *, default: Optional[dt.time] = None) -> dt.time:
    """Accept '7:30', '07:30', '7:30am', '7am', '1930', or a time object."""
    if value is None or value == "":
        if default is not None:
            return default
        raise ValueError("missing time")
    if isinstance(value, dt.time):
        return value
    if isinstance(value, dt.datetime):
        return value.time()
    text = str(value).strip().lower().replace(".", "")
    match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", text)
    if not match:
        match_compact = re.fullmatch(r"(\d{2})(\d{2})", text)
        if match_compact:
            hour, minute = int(match_compact.group(1)), int(match_compact.group(2))
            return dt.time(hour, minute)
        raise ValueError(f"unrecognized time: {value!r}")
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    meridiem = match.group(3)
    if meridiem == "am":
        if hour == 12:
            hour = 0
    elif meridiem == "pm":
        if hour != 12:
            hour += 12
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"time out of range: {value!r}")
    return dt.time(hour, minute)


@dataclass(frozen=True)
class Watch:
    """One 'tell me about Fridays before 10am' rule."""

    name: str
    weekdays: frozenset[int] = frozenset(range(7))
    earliest: dt.time = dt.time(0, 0)
    latest: dt.time = dt.time(23, 59)
    min_players: int = 1
    holes: Optional[int] = None
    max_price: Optional[float] = None

    @classmethod
    def from_dict(cls, data: dict) -> "Watch":
        unknown = set(data) - {
            "name", "weekdays", "days", "earliest", "latest", "after", "before",
            "min_players", "players", "holes", "max_price",
        }
        if unknown:
            raise ValueError(f"unknown watch option(s): {', '.join(sorted(unknown))}")
        weekdays = data.get("weekdays", data.get("days"))
        earliest = data.get("earliest", data.get("after"))
        latest = data.get("latest", data.get("before"))
        players = data.get("min_players", data.get("players", 1))
        return cls(
            name=str(data.get("name") or "watch"),
            weekdays=parse_weekdays(weekdays),
            earliest=parse_time(earliest, default=dt.time(0, 0)),
            latest=parse_time(latest, default=dt.time(23, 59)),
            min_players=int(players or 1),
            holes=int(data["holes"]) if data.get("holes") is not None else None,
            max_price=float(data["max_price"]) if data.get("max_price") is not None else None,
        )

    def wants_date(self, day: dt.date) -> bool:
        return day.weekday() in self.weekdays

    def matches(self, tee) -> bool:
        if not self.wants_date(tee.date):
            return False
        if not (self.earliest <= tee.time <= self.latest):
            return False
        # An unknown party size is reported rather than filtered out - missing
        # a real opening is worse than one extra alert.
        if tee.players and tee.max_players < self.min_players:
            return False
        if self.holes is not None and tee.holes is not None and tee.holes != self.holes:
            return False
        if self.max_price is not None and tee.price is not None and tee.price > self.max_price:
            return False
        return True

    def describe(self) -> str:
        days = ", ".join(
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d] for d in sorted(self.weekdays)
        )
        window = f"{self.earliest.strftime('%-I:%M %p')}-{self.latest.strftime('%-I:%M %p')}"
        return f"{days} {window}, {self.min_players}+ players"


def candidate_dates(
    watches: Sequence[Watch], start: dt.date, horizon_days: int
) -> list[dt.date]:
    """Only the dates some watch could care about - so we never poll a Tuesday
    when every rule is about Fridays."""
    days: list[dt.date] = []
    for offset in range(max(0, horizon_days) + 1):
        day = start + dt.timedelta(days=offset)
        if any(watch.wants_date(day) for watch in watches):
            days.append(day)
    return days


def match_all(watches: Iterable[Watch], tee_times: Iterable) -> list[tuple]:
    """Pair each tee time with the first watch that wants it."""
    watches = list(watches)
    hits = []
    for tee in tee_times:
        for watch in watches:
            if watch.matches(tee):
                hits.append((watch, tee))
                break
    return hits
