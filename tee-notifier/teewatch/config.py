"""Load and validate teewatch.yaml."""

from __future__ import annotations

import datetime as dt
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .rules import Watch

DEFAULT_CONFIG_NAMES = ("teewatch.yaml", "teewatch.yml")
DEFAULT_STATE_DIR = Path(os.path.expanduser("~/.teewatch"))
MIN_INTERVAL_SECONDS = 60


class ConfigError(ValueError):
    """Raised for a config file we cannot act on."""


@dataclass
class Config:
    site_url: str
    watches: list[Watch]
    timezone: str = "America/New_York"
    horizon_days: int = 30
    interval_seconds: int = 300
    jitter_seconds: int = 30
    date_delay_seconds: float = 1.0
    renotify_after_hours: Optional[float] = 12.0
    notify: dict = field(default_factory=lambda: {"console": True})
    state_dir: Path = DEFAULT_STATE_DIR
    mode: str = "auto"
    headless: bool = True
    settle_ms: int = 4_000
    browser_executable: Optional[str] = None
    browser_channel: Optional[str] = None
    source_path: Optional[Path] = None

    @property
    def tz(self) -> Optional[dt.tzinfo]:
        try:
            return ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            return None

    @property
    def endpoint_cache(self) -> Path:
        return self.state_dir / "endpoint.json"

    @property
    def seen_db(self) -> Path:
        return self.state_dir / "seen.db"

    def today(self) -> dt.date:
        tz = self.tz
        return (dt.datetime.now(tz) if tz else dt.datetime.now()).date()


def find_config(explicit: Optional[str] = None) -> Optional[Path]:
    if explicit:
        path = Path(explicit).expanduser()
        return path if path.exists() else None
    for name in DEFAULT_CONFIG_NAMES:
        candidate = Path.cwd() / name
        if candidate.exists():
            return candidate
    fallback = Path(os.path.expanduser("~/.config/teewatch/config.yaml"))
    return fallback if fallback.exists() else None


def load_config(path: str | Path) -> Config:
    path = Path(path).expanduser()
    try:
        import yaml
    except ImportError as exc:  # pragma: no cover - depends on install
        raise ConfigError("PyYAML is not installed (pip install pyyaml)") from exc
    try:
        raw = yaml.safe_load(path.read_text()) or {}
    except OSError as exc:
        raise ConfigError(f"cannot read {path}: {exc}") from exc
    except yaml.YAMLError as exc:
        raise ConfigError(f"{path} is not valid YAML: {exc}") from exc
    if not isinstance(raw, dict):
        raise ConfigError(f"{path} must contain a YAML mapping")
    return from_dict(raw, source_path=path)


def from_dict(raw: dict[str, Any], source_path: Optional[Path] = None) -> Config:
    site = raw.get("site") or {}
    if isinstance(site, str):
        site = {"url": site}
    site_url = site.get("url") or raw.get("url")
    if not site_url:
        raise ConfigError("config needs site.url (the booking page URL)")

    watch_specs = raw.get("watches") or raw.get("watch") or []
    if isinstance(watch_specs, dict):
        watch_specs = [watch_specs]
    if not watch_specs:
        raise ConfigError("config needs at least one entry under watches:")
    watches = []
    for index, spec in enumerate(watch_specs, start=1):
        if not isinstance(spec, dict):
            raise ConfigError(f"watches[{index}] must be a mapping")
        spec.setdefault("name", f"watch {index}")
        try:
            watches.append(Watch.from_dict(spec))
        except ValueError as exc:
            raise ConfigError(f"watches[{index}] ({spec['name']}): {exc}") from exc

    poll = raw.get("poll") or {}
    interval = int(poll.get("interval_seconds", 300))
    if interval < MIN_INTERVAL_SECONDS:
        raise ConfigError(
            f"poll.interval_seconds must be at least {MIN_INTERVAL_SECONDS} "
            "- polling harder than that just gets you rate limited"
        )

    notify = raw.get("notify")
    if notify is None:
        notify = {"console": True}
    if not isinstance(notify, dict):
        raise ConfigError("notify: must be a mapping of channel name to settings")
    email = notify.get("email")
    if isinstance(email, dict) and "from" in email:
        email = dict(email)
        email["sender"] = email.pop("from")
        notify = {**notify, "email": email}

    state_dir = raw.get("state_dir")
    browser = raw.get("browser") or {}

    return Config(
        site_url=str(site_url),
        watches=watches,
        timezone=str(site.get("timezone", raw.get("timezone", "America/New_York"))),
        horizon_days=int(poll.get("horizon_days", 30)),
        interval_seconds=interval,
        jitter_seconds=int(poll.get("jitter_seconds", 30)),
        date_delay_seconds=float(poll.get("date_delay_seconds", 1.0)),
        renotify_after_hours=_optional_float(poll.get("renotify_after_hours", 12)),
        notify=notify,
        state_dir=Path(state_dir).expanduser() if state_dir else DEFAULT_STATE_DIR,
        mode=str(raw.get("mode", "auto")),
        headless=bool(browser.get("headless", True)),
        settle_ms=int(browser.get("settle_ms", 4_000)),
        browser_executable=_optional_str(browser.get("executable_path")),
        browser_channel=_optional_str(browser.get("channel")),
        source_path=source_path,
    )


def _optional_str(value: Any) -> Optional[str]:
    text = str(value).strip() if value not in (None, "") else ""
    return os.path.expanduser(text) if text else None


def _optional_float(value: Any) -> Optional[float]:
    if value in (None, False, "", "never"):
        return None
    return float(value)
