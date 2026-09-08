"""Find the booking site's tee-time request by watching a real browser.

The endpoint behind these booking pages is undocumented and site-specific, so
we never guess a URL. We load the page the way a person would, note which
network call came back with tee times in it, and remember how to make that
call again.
"""

from __future__ import annotations

import datetime as dt
import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

from .normalize import extract_tee_times
from .util import find_iso_date, with_date

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

# Headers that belong to the captured connection, not the request we replay.
_DROP_HEADERS = {
    "host", "content-length", "connection", "accept-encoding", "cookie",
    ":authority", ":method", ":path", ":scheme",
}


class DiscoveryError(RuntimeError):
    """Raised when no tee-time request could be identified."""


@dataclass
class Capture:
    """Everything needed to reissue the tee-time request without a browser."""

    url: str
    method: str = "GET"
    headers: dict[str, str] = field(default_factory=dict)
    post_data: Optional[str] = None
    cookies: list[dict] = field(default_factory=list)
    date_token: Optional[str] = None
    captured_at: str = ""
    sample_count: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True)

    @classmethod
    def from_json(cls, text: str) -> "Capture":
        data = json.loads(text)
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.to_json())

    @classmethod
    def load(cls, path: Path) -> Optional["Capture"]:
        try:
            return cls.from_json(path.read_text())
        except (OSError, ValueError):
            return None


def _clean_headers(headers: dict[str, str]) -> dict[str, str]:
    cleaned = {
        key: value
        for key, value in headers.items()
        if key.lower() not in _DROP_HEADERS and not key.startswith(":")
    }
    cleaned.setdefault("user-agent", USER_AGENT)
    return cleaned


def discover(
    site_url: str,
    date: dt.date,
    *,
    headless: bool = True,
    timeout_ms: int = 45_000,
    settle_ms: int = 4_000,
    tz=None,
    executable_path: Optional[str] = None,
    channel: Optional[str] = None,
) -> tuple[Capture, list]:
    """Load the booking page for ``date`` and capture the tee-time call."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:  # pragma: no cover - depends on install
        raise DiscoveryError(
            "playwright is not installed. Run: pip install playwright && "
            "playwright install chromium"
        ) from exc

    target = with_date(site_url, date)
    responses: list = []
    best: Optional[tuple[Capture, list]] = None

    # Prefer an explicitly configured binary (a system Chrome, or a browser
    # Playwright did not install itself) over Playwright's bundled download.
    executable_path = executable_path or os.environ.get("TEEWATCH_CHROMIUM") or None
    launch_options: dict[str, Any] = {"headless": headless}
    if executable_path:
        launch_options["executable_path"] = executable_path
    elif channel:
        launch_options["channel"] = channel

    with sync_playwright() as engine:
        try:
            browser = engine.chromium.launch(**launch_options)
        except Exception as exc:
            raise DiscoveryError(
                f"could not start Chromium: {exc}\n"
                "Install one with 'playwright install chromium', or point teewatch "
                "at an existing browser via browser.executable_path in the config "
                "(or the TEEWATCH_CHROMIUM environment variable)."
            ) from exc
        context = browser.new_context(user_agent=USER_AGENT, viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.on("response", lambda response: responses.append(response))
        try:
            page.goto(target, wait_until="domcontentloaded", timeout=timeout_ms)
            # The tee sheet is fetched after first paint; give it a moment and
            # nudge the page in case results are lazy-loaded.
            page.wait_for_timeout(settle_ms)
            try:
                page.mouse.wheel(0, 2000)
                page.wait_for_timeout(1_500)
            except Exception:
                pass

            for response in list(responses):
                candidate = _evaluate(response, date, tz)
                if candidate is None:
                    continue
                if best is None or candidate[1] > best[1]:
                    best = candidate
            if best is not None:
                capture, _, tee_times = best[0], best[1], best[2]
                capture.cookies = context.cookies()
                return capture, tee_times
        finally:
            context.close()
            browser.close()

    raise DiscoveryError(
        "No tee-time response was recognized on that page. The site may have "
        "changed, or the page may need a moment longer - try --settle 10000, "
        "or --show to watch the browser."
    )


def _evaluate(response, date: dt.date, tz) -> Optional[tuple[Capture, int, list]]:
    """Score one network response: does it contain tee times?"""
    url = response.url
    if any(url.endswith(ext) for ext in (".js", ".css", ".png", ".jpg", ".svg", ".woff2")):
        return None
    try:
        if response.status >= 400:
            return None
        payload: Any = response.json()
    except Exception:
        return None

    tee_times = extract_tee_times(payload, date, tz)
    if not tee_times:
        return None

    request = response.request
    try:
        post_data = request.post_data
    except Exception:
        post_data = None
    capture = Capture(
        url=url,
        method=request.method,
        headers=_clean_headers(dict(request.headers)),
        post_data=post_data,
        date_token=find_iso_date(url, post_data) or date.isoformat(),
        captured_at=dt.datetime.now().isoformat(timespec="seconds"),
        sample_count=len(tee_times),
    )
    return capture, len(tee_times), tee_times
