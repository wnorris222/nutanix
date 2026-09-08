"""Turn an arbitrary booking-API JSON payload into TeeTime objects.

The booking engine's response shape is not public and can change without
warning, so nothing here hardcodes a field path. We walk the JSON, find the
list(s) that look like tee times, and pull recognizable fields out of each
item by name. That survives renames of the wrapper objects around the data.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any, Iterable, Iterator, Optional, Sequence

from .models import TeeTime

# Ordered by how strongly the name implies "this is the tee-off moment".
_TIME_KEYS = (
    "teetime", "teetimestart", "teeofftime", "starttime", "startdatetime",
    "datetime", "time", "start", "date",
)
_PLAYER_KEYS = (
    "availableparticipantno", "availableplayers", "availablespots",
    "openspots", "players", "playercount", "participants", "spots",
    "slots", "golfers", "capacity", "maxplayers", "availability",
)
_HOLE_KEYS = ("holes", "holecount", "numberofholes", "holesnumber")
_PRICE_KEYS = (
    "price", "greenfee", "greenfeewalking", "rate", "cost", "amount",
    "total", "displayprice", "pricepererson", "priceperplayer",
)
_COURSE_KEYS = ("coursename", "facilityname", "clubname", "course", "facility", "name")
_URL_KEYS = ("bookingurl", "bookurl", "reservationurl", "deeplink", "url", "link")

_EPOCH_SECONDS_FLOOR = 10**9
_EPOCH_MILLIS_FLOOR = 10**12


def _norm(key: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


def _normalized_items(item: dict) -> dict[str, Any]:
    """Map normalized key -> value, keeping the first spelling we see."""
    out: dict[str, Any] = {}
    for key, value in item.items():
        out.setdefault(_norm(key), value)
    return out


def _to_local(moment: dt.datetime, tz: Optional[dt.tzinfo]) -> dt.datetime:
    """Render an instant as wall-clock time at the course."""
    if moment.tzinfo is None:
        return moment
    if tz is None:
        return moment.replace(tzinfo=None)
    return moment.astimezone(tz).replace(tzinfo=None)


def parse_moment(
    value: Any, tz: Optional[dt.tzinfo] = None
) -> tuple[Optional[dt.date], Optional[dt.time]]:
    """Parse a value that may be a datetime, a date, a bare time, or an epoch."""
    if isinstance(value, bool) or value is None:
        return None, None
    if isinstance(value, dt.datetime):
        moment = _to_local(value, tz)
        return moment.date(), moment.time()
    if isinstance(value, dt.date):
        return value, None
    if isinstance(value, dt.time):
        return None, value
    if isinstance(value, (int, float)):
        number = float(value)
        if number >= _EPOCH_MILLIS_FLOOR:
            number /= 1000.0
        elif number < _EPOCH_SECONDS_FLOOR:
            return None, None
        moment = dt.datetime.fromtimestamp(number, tz=dt.timezone.utc)
        moment = _to_local(moment, tz)
        return moment.date(), moment.time()
    if not isinstance(value, str):
        return None, None

    text = value.strip()
    if not text:
        return None, None

    iso = text.replace("Z", "+00:00")
    try:
        moment = _to_local(dt.datetime.fromisoformat(iso), tz)
        return moment.date(), moment.time().replace(microsecond=0)
    except ValueError:
        pass
    try:
        return dt.date.fromisoformat(text), None
    except ValueError:
        pass

    for fmt in (
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%m/%d/%Y %I:%M %p",
        "%m/%d/%Y %H:%M", "%Y/%m/%d %H:%M",
    ):
        try:
            moment = dt.datetime.strptime(text, fmt)
            return moment.date(), moment.time()
        except ValueError:
            continue

    match = re.fullmatch(r"(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?", text)
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2))
        meridiem = (match.group(4) or "").lower()
        if meridiem == "am" and hour == 12:
            hour = 0
        elif meridiem == "pm" and hour != 12:
            hour += 12
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return None, dt.time(hour, minute)
    return None, None


def _find_time(
    fields: dict[str, Any], tz: Optional[dt.tzinfo] = None
) -> tuple[Optional[dt.date], Optional[dt.time]]:
    """Prefer a field that yields an actual clock time; fall back to a date."""
    fallback_date: Optional[dt.date] = None
    for key in _TIME_KEYS:
        if key not in fields:
            continue
        found_date, found_time = parse_moment(fields[key], tz)
        if found_time is not None:
            return found_date or fallback_date, found_time
        if found_date and fallback_date is None:
            fallback_date = found_date
    return fallback_date, None


def _candidate_keys(fields: dict[str, Any], keys: Sequence[str]) -> Iterator[str]:
    """Exact name matches first, then near-misses like 'rates' for 'rate'."""
    seen: set[str] = set()
    for key in keys:
        if key in fields:
            seen.add(key)
            yield key
    for field in fields:
        if field in seen:
            continue
        if any(key in field for key in keys):
            yield field


def _iter_numbers(value: Any, depth: int = 0) -> Iterator[float]:
    if depth > 4:
        return
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        yield float(value)
    elif isinstance(value, str):
        match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
        if match:
            yield float(match.group())
    elif isinstance(value, list):
        for item in value:
            yield from _iter_numbers(item, depth + 1)
    elif isinstance(value, dict):
        for item in value.values():
            yield from _iter_numbers(item, depth + 1)


def _find_players(fields: dict[str, Any]) -> tuple[int, ...]:
    """Open spots may be a count (4), a list ([1,2,3,4]), or objects."""
    for key in _candidate_keys(fields, _PLAYER_KEYS):
        value = fields[key]
        counts = {
            int(number)
            for number in _iter_numbers(value)
            if number == int(number) and 1 <= number <= 8
        }
        if counts:
            return tuple(sorted(counts))
    return ()


def _find_holes(fields: dict[str, Any]) -> Optional[int]:
    for key in _candidate_keys(fields, _HOLE_KEYS):
        for number in _iter_numbers(fields[key]):
            if number in (9, 18, 27, 36):
                return int(number)
    return None


def _find_price(fields: dict[str, Any]) -> Optional[float]:
    """Take the cheapest plausible price; ignore zeros and absurd values."""
    for key in _candidate_keys(fields, _PRICE_KEYS):
        divisor = 100.0 if "cent" in key else 1.0
        prices = [
            number / divisor
            for number in _iter_numbers(fields[key])
            if 0 < number / divisor < 2000
        ]
        if prices:
            return round(min(prices), 2)
    return None


def _find_text(fields: dict[str, Any], keys: Iterable[str]) -> Optional[str]:
    for key in keys:
        value = fields.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            nested = _normalized_items(value)
            for nested_key in ("name", "title", "url", "href"):
                candidate = nested.get(nested_key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
    return None


def _iter_lists(node: Any, ancestors: tuple = (), depth: int = 0) -> Iterator[tuple[list, tuple]]:
    """Yield every list in the document along with its ancestor dicts."""
    if depth > 12:
        return
    if isinstance(node, dict):
        for value in node.values():
            yield from _iter_lists(value, ancestors + (node,), depth + 1)
    elif isinstance(node, list):
        yield node, ancestors
        for item in node:
            if isinstance(item, (dict, list)):
                yield from _iter_lists(item, ancestors, depth + 1)


def _looks_like_tee_times(items: list, tz: Optional[dt.tzinfo] = None) -> bool:
    dicts = [item for item in items if isinstance(item, dict)]
    if not dicts:
        return False
    with_time = sum(
        1 for item in dicts if _find_time(_normalized_items(item), tz)[1] is not None
    )
    return with_time >= max(1, int(0.6 * len(dicts)))


def extract_tee_times(
    payload: Any,
    default_date: Optional[dt.date] = None,
    tz: Optional[dt.tzinfo] = None,
) -> list[TeeTime]:
    """Pull every tee time out of a payload, whatever its wrapper shape."""
    found: dict[str, TeeTime] = {}
    for items, ancestors in _iter_lists(payload):
        if not _looks_like_tee_times(items, tz):
            continue
        ancestor_course = None
        for ancestor in reversed(ancestors):
            ancestor_course = _find_text(_normalized_items(ancestor), _COURSE_KEYS)
            if ancestor_course:
                break
        for item in items:
            if not isinstance(item, dict):
                continue
            tee = _to_tee_time(item, default_date, ancestor_course, tz)
            if tee is not None:
                found.setdefault(tee.identity(), tee)
    return sorted(found.values(), key=lambda tee: tee.starts_at)


def _to_tee_time(
    item: dict,
    default_date: Optional[dt.date],
    ancestor_course: Optional[str],
    tz: Optional[dt.tzinfo] = None,
) -> Optional[TeeTime]:
    fields = _normalized_items(item)
    date, time = _find_time(fields, tz)
    if time is None:
        return None
    date = date or default_date
    if date is None:
        return None
    players = _find_players(fields)
    url = _find_text(fields, _URL_KEYS)
    if url and not url.lower().startswith(("http://", "https://")):
        url = None
    return TeeTime(
        date=date,
        time=time.replace(second=0, microsecond=0),
        players=players,
        holes=_find_holes(fields),
        price=_find_price(fields),
        course=_find_text(fields, _COURSE_KEYS) or ancestor_course,
        booking_url=url,
        raw=item,
    )
