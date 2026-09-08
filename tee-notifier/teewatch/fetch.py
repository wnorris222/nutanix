"""Fetch tee times for a date - cheaply when possible, via a browser when not.

Discovery is expensive (it drives a real browser), so we do it once, cache the
resulting request, and then replay that request with plain HTTP on every poll.
If the replay stops working - expired token, changed endpoint - we transparently
re-discover and carry on.
"""

from __future__ import annotations

import datetime as dt
import logging
from pathlib import Path
from typing import Optional

from .discover import Capture, DiscoveryError, discover
from .models import TeeTime
from .normalize import extract_tee_times
from .util import swap_date

log = logging.getLogger("teewatch.fetch")


class FetchError(RuntimeError):
    """Raised when a date could not be fetched by any available means."""


class TeeTimeFetcher:
    """Fetches tee times for a given date, hiding the discover/replay dance."""

    def __init__(
        self,
        site_url: str,
        cache_path: Path,
        *,
        tz=None,
        mode: str = "auto",
        headless: bool = True,
        settle_ms: int = 4_000,
        request_timeout: int = 30,
        executable_path: Optional[str] = None,
        channel: Optional[str] = None,
    ) -> None:
        self.site_url = site_url
        self.cache_path = Path(cache_path)
        self.tz = tz
        self.mode = mode
        self.headless = headless
        self.settle_ms = settle_ms
        self.request_timeout = request_timeout
        self.executable_path = executable_path
        self.channel = channel
        self._capture: Optional[Capture] = None

    @property
    def capture(self) -> Optional[Capture]:
        if self._capture is None:
            self._capture = Capture.load(self.cache_path)
        return self._capture

    def rediscover(self, date: dt.date) -> tuple[Capture, list[TeeTime]]:
        log.info("discovering the tee-time endpoint via browser (date=%s)", date)
        capture, tee_times = discover(
            self.site_url,
            date,
            headless=self.headless,
            settle_ms=self.settle_ms,
            tz=self.tz,
            executable_path=self.executable_path,
            channel=self.channel,
        )
        capture.save(self.cache_path)
        self._capture = capture
        log.info("captured %s %s", capture.method, capture.url.split("?")[0])
        return capture, tee_times

    def fetch(self, date: dt.date) -> list[TeeTime]:
        """Tee times for one date, in ascending time order."""
        if self.mode == "browser":
            return self.rediscover(date)[1]

        capture = self.capture
        if capture is None:
            if self.mode == "replay":
                raise FetchError(
                    f"no cached endpoint at {self.cache_path}. Run 'teewatch discover' first."
                )
            return self.rediscover(date)[1]

        try:
            return self._replay(capture, date)
        except FetchError as exc:
            if self.mode == "replay":
                raise
            log.warning("replay failed (%s); falling back to browser discovery", exc)
            return self.rediscover(date)[1]

    def _replay(self, capture: Capture, date: dt.date) -> list[TeeTime]:
        try:
            import requests
        except ImportError as exc:  # pragma: no cover - depends on install
            raise FetchError("requests is not installed (pip install requests)") from exc

        iso = date.isoformat()
        token = capture.date_token or iso
        url = swap_date(capture.url, token, iso) or capture.url
        body = swap_date(capture.post_data, token, iso)
        # The referer (and any other date-bearing header) must move with it, or
        # a picky backend may answer for the originally captured day.
        headers = {
            key: swap_date(value, token, iso) or value
            for key, value in (capture.headers or {}).items()
        }
        cookies = {
            cookie["name"]: cookie["value"]
            for cookie in capture.cookies
            if "name" in cookie and "value" in cookie
        }

        try:
            response = requests.request(
                capture.method or "GET",
                url,
                headers=headers,
                data=body.encode("utf-8") if body else None,
                cookies=cookies or None,
                timeout=self.request_timeout,
            )
        except Exception as exc:
            raise FetchError(f"request error: {exc}") from exc

        if response.status_code >= 400:
            raise FetchError(f"HTTP {response.status_code} from {url.split('?')[0]}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise FetchError("response was not JSON") from exc

        # An empty day is a legitimate answer, not a broken endpoint - only a
        # transport or parse failure should trigger re-discovery.
        return extract_tee_times(payload, date, self.tz)
