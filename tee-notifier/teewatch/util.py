"""Small shared helpers."""

from __future__ import annotations

import datetime as dt
import re
from typing import Optional
from urllib.parse import urlsplit

_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")


def with_date(url: str, date: dt.date) -> str:
    """Point a booking URL at a specific day.

    Honours an explicit ``{date}`` placeholder, otherwise rewrites the first
    ISO date it finds in the query string.
    """
    iso = date.isoformat()
    if "{date}" in url:
        return url.replace("{date}", iso)
    if _DATE_PATTERN.search(url):
        return _DATE_PATTERN.sub(iso, url, count=1)
    joiner = "&" if "?" in url else "?"
    return f"{url}{joiner}date={iso}"


def swap_date(text: Optional[str], old: str, new: str) -> Optional[str]:
    """Replace a specific date string, falling back to any ISO date.

    ``old`` must itself look like an ISO date - a shorter token would match
    arbitrary substrings and corrupt the request.
    """
    if not text:
        return text
    if old and _DATE_PATTERN.fullmatch(old) and old in text:
        return text.replace(old, new)
    if _DATE_PATTERN.search(text):
        return _DATE_PATTERN.sub(new, text)
    return text


def find_iso_date(*texts: Optional[str]) -> Optional[str]:
    for text in texts:
        if not text:
            continue
        match = _DATE_PATTERN.search(text)
        if match:
            return match.group()
    return None


def host_of(url: str) -> str:
    return urlsplit(url).netloc
