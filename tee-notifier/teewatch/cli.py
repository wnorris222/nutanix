"""Command line interface for teewatch."""

from __future__ import annotations

import argparse
import datetime as dt
import logging
import random
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Optional, Sequence

from . import __version__
from .config import Config, ConfigError, find_config, load_config
from .discover import DiscoveryError
from .fetch import FetchError, TeeTimeFetcher
from .models import TeeTime
from .notify import build_notifiers, notify_all
from .rules import Watch, candidate_dates, match_all
from .store import SeenStore
from .util import with_date

log = logging.getLogger("teewatch")

CONFIG_TEMPLATE = """\
# teewatch configuration
site:
  # The booking page you would normally open in a browser. teewatch swaps the
  # date for each day it checks, so leave the date in - any value works.
  url: "https://the-walker-course-at-clemson-university.book.teeitup.com/?course=12802&date=2026-09-11&holes=18&max=9999"
  timezone: "America/New_York"

poll:
  interval_seconds: 300   # how often to re-check (minimum 60)
  horizon_days: 30        # how far ahead to look
  renotify_after_hours: 12  # re-alert if a slot disappears and comes back

# Each watch is one "tell me about..." rule. A tee time matching any watch alerts.
watches:
  - name: "Friday mornings"
    days: [friday]
    before: "10:00"
    players: 2            # need room for at least this many
    holes: 18

  # - name: "Weekend twilight"
  #   days: [saturday, sunday]
  #   after: "16:00"
  #   players: 4

notify:
  console: true
  # desktop: true         # macOS/Linux notification banner
  # ntfy:                 # free push to your phone: install ntfy, subscribe to the topic
  #   topic: "walker-course-<something-random-and-private>"
  # email:
  #   host: "smtp.gmail.com"
  #   port: 587
  #   from: "you@example.com"
  #   to: ["you@example.com"]
  #   password_env: "TEEWATCH_SMTP_PASSWORD"   # app password, read from the environment
  # webhook:
  #   url: "https://hooks.slack.com/services/..."
  #   template: slack
"""


# --------------------------------------------------------------------------- #
# scanning
# --------------------------------------------------------------------------- #

def scan(config: Config, fetcher: TeeTimeFetcher) -> tuple[list[tuple[Watch, TeeTime]], list[str]]:
    """Fetch every date any watch cares about and return the matches."""
    dates = candidate_dates(config.watches, config.today(), config.horizon_days)
    hits: list[tuple[Watch, TeeTime]] = []
    problems: list[str] = []
    for index, date in enumerate(dates):
        if index and config.date_delay_seconds > 0:
            time.sleep(config.date_delay_seconds)
        try:
            tee_times = fetcher.fetch(date)
        except (FetchError, DiscoveryError) as exc:
            problems.append(f"{date}: {exc}")
            log.warning("could not fetch %s: %s", date, exc)
            continue
        matched = match_all(config.watches, tee_times)
        log.info("%s: %d tee times, %d match", date, len(tee_times), len(matched))
        hits.extend(matched)
    return hits, problems


def format_hits(hits: Sequence[tuple[Watch, TeeTime]]) -> str:
    """Group matches by watch, then by day, for a readable alert body."""
    by_watch: dict[str, list[TeeTime]] = defaultdict(list)
    for watch, tee in hits:
        by_watch[watch.name].append(tee)

    lines: list[str] = []
    for name, tee_times in by_watch.items():
        lines.append(f"{name}:")
        by_day: dict[dt.date, list[TeeTime]] = defaultdict(list)
        for tee in sorted(tee_times, key=lambda t: t.starts_at):
            by_day[tee.date].append(tee)
        for day, day_times in by_day.items():
            lines.append(f"  {day.strftime('%a %b %-d')}")
            for tee in day_times:
                detail = []
                if tee.max_players:
                    detail.append(f"{tee.max_players}p")
                if tee.holes:
                    detail.append(f"{tee.holes}h")
                if tee.price is not None:
                    detail.append(f"${tee.price:.0f}")
                suffix = f"  ({', '.join(detail)})" if detail else ""
                lines.append(f"    {tee.time.strftime('%-I:%M %p')}{suffix}")
    return "\n".join(lines)


def booking_link(config: Config, hits: Sequence[tuple[Watch, TeeTime]]) -> Optional[str]:
    if not hits:
        return None
    soonest = min((tee for _, tee in hits), key=lambda tee: tee.starts_at)
    return soonest.booking_url or with_date(config.site_url, soonest.date)


def run_check(config: Config, fetcher: TeeTimeFetcher, *, announce: bool) -> int:
    """One full pass. Returns the number of newly available matches."""
    hits, problems = scan(config, fetcher)
    if not hits:
        print("No tee times match your watches right now.")
        if problems:
            print(f"({len(problems)} date(s) could not be checked - run with -v for detail)")
        return 0

    with SeenStore(config.seen_db) as store:
        store.forget_before(config.today())
        matched = [tee for _, tee in hits]
        renotify = (
            dt.timedelta(hours=config.renotify_after_hours)
            if config.renotify_after_hours
            else None
        )
        fresh = set(
            tee.identity() for tee in store.select_new(matched, renotify_after=renotify)
        )
        new_hits = [(watch, tee) for watch, tee in hits if tee.identity() in fresh]
        store.mark_seen(matched)

    print(f"{len(hits)} matching tee time(s); {len(new_hits)} new since the last check.")
    print(format_hits(hits))

    if new_hits and announce:
        notifiers = build_notifiers(config.notify)
        if not notifiers:
            log.warning("no notification channels configured")
        else:
            course = next((tee.course for _, tee in new_hits if tee.course), "the Walker Course")
            count = len(new_hits)
            title = f"{count} tee time{'s' if count != 1 else ''} open at {course}"
            delivered = notify_all(
                notifiers, title, format_hits(new_hits), booking_link(config, new_hits)
            )
            log.info("notified via %d/%d channel(s)", delivered, len(notifiers))
    return len(new_hits)


def run_watch(config: Config, fetcher: TeeTimeFetcher) -> int:
    interval = config.interval_seconds
    print(
        f"Watching {len(config.watches)} rule(s) every {interval}s "
        f"({config.horizon_days} days ahead). Ctrl-C to stop."
    )
    for watch in config.watches:
        print(f"  - {watch.name}: {watch.describe()}")

    consecutive_failures = 0
    while True:
        started = time.time()
        try:
            run_check(config, fetcher, announce=True)
            consecutive_failures = 0
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            consecutive_failures += 1
            log.error("check failed (%d in a row): %s", consecutive_failures, exc)

        # Back off when the site is unhappy, and jitter so we are not a metronome.
        backoff = min(2 ** consecutive_failures, 8) if consecutive_failures else 1
        delay = interval * backoff + random.uniform(0, max(0, config.jitter_seconds))
        elapsed = time.time() - started
        sleep_for = max(5.0, delay - elapsed)
        log.info("next check in %.0fs", sleep_for)
        time.sleep(sleep_for)


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #

def cmd_init(args) -> int:
    path = Path(args.path).expanduser()
    if path.exists() and not args.force:
        print(f"{path} already exists (use --force to overwrite).", file=sys.stderr)
        return 1
    path.write_text(CONFIG_TEMPLATE)
    print(f"Wrote {path}\n\nNext:\n  1. Edit the watches to match the times you want\n"
          "  2. teewatch discover     # one-time: learn the site's tee-time API\n"
          "  3. teewatch watch        # start watching")
    return 0


def cmd_discover(args, config: Config) -> int:
    fetcher = _fetcher(config, args, mode="browser")
    date = (
        dt.date.fromisoformat(args.date)
        if args.date
        else next(iter(candidate_dates(config.watches, config.today(), config.horizon_days)), config.today())
    )
    print(f"Opening the booking page for {date} to find the tee-time API...")
    capture, tee_times = fetcher.rediscover(date)
    print(f"\nFound it: {capture.method} {capture.url.split('?')[0]}")
    print(f"Saved to {config.endpoint_cache}")
    print(f"That response held {len(tee_times)} tee time(s) for {date}.")
    for tee in tee_times[:5]:
        print(f"  {tee.label()}")
    if len(tee_times) > 5:
        print(f"  ... and {len(tee_times) - 5} more")
    return 0


def cmd_check(args, config: Config) -> int:
    run_check(config, _fetcher(config, args), announce=not args.no_notify)
    return 0


def cmd_list(args, config: Config) -> int:
    """Show current matches without touching state or sending anything."""
    hits, problems = scan(config, _fetcher(config, args))
    if hits:
        print(format_hits(hits))
    else:
        print("No tee times match your watches right now.")
    for problem in problems:
        print(f"! {problem}", file=sys.stderr)
    return 0


def cmd_watch(args, config: Config) -> int:
    try:
        run_watch(config, _fetcher(config, args))
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


def cmd_test_notify(args, config: Config) -> int:
    notifiers = build_notifiers(config.notify)
    if not notifiers:
        print("No notification channels are configured under notify:.", file=sys.stderr)
        return 1
    delivered = notify_all(
        notifiers,
        "teewatch test",
        "If you can read this, notifications are working.",
        with_date(config.site_url, config.today()),
    )
    print(f"Delivered to {delivered}/{len(notifiers)} channel(s): "
          f"{', '.join(n.name for n in notifiers)}")
    return 0 if delivered else 1


def _fetcher(config: Config, args, mode: Optional[str] = None) -> TeeTimeFetcher:
    return TeeTimeFetcher(
        config.site_url,
        config.endpoint_cache,
        tz=config.tz,
        mode=mode or getattr(args, "mode", None) or config.mode,
        headless=config.headless and not getattr(args, "show", False),
        settle_ms=getattr(args, "settle", None) or config.settle_ms,
        executable_path=config.browser_executable,
        channel=config.browser_channel,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="teewatch",
        description="Watch a TeeItUp booking site and alert when tee times open up.",
    )
    parser.add_argument("--version", action="version", version=f"teewatch {__version__}")
    parser.add_argument("-c", "--config", help="path to teewatch.yaml")
    parser.add_argument("-v", "--verbose", action="count", default=0)

    # Repeated on every subcommand so that both "teewatch -v check" and
    # "teewatch check -v" work. SUPPRESS keeps the subcommand copy from
    # clobbering a value given before the subcommand.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-v", "--verbose", action="count", default=argparse.SUPPRESS)
    common.add_argument("-c", "--config", default=argparse.SUPPRESS)

    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser("init", parents=[common], help="write a starter config file")
    init.add_argument("--path", default="teewatch.yaml")
    init.add_argument("--force", action="store_true")
    init.set_defaults(func=cmd_init, needs_config=False)

    for name, handler, help_text in (
        ("discover", cmd_discover, "learn the site's tee-time API (uses a browser)"),
        ("check", cmd_check, "run one check and notify about anything new"),
        ("list", cmd_list, "show matching tee times without notifying"),
        ("watch", cmd_watch, "keep checking on an interval"),
        ("test-notify", cmd_test_notify, "send a test notification"),
    ):
        sub = subparsers.add_parser(name, parents=[common], help=help_text)
        sub.set_defaults(func=handler, needs_config=True)
        if name != "test-notify":
            sub.add_argument(
                "--mode",
                choices=("auto", "replay", "browser"),
                help="auto (default): replay the cached request, re-discover if it breaks",
            )
            sub.add_argument("--show", action="store_true", help="show the browser window")
            sub.add_argument("--settle", type=int, help="ms to wait for the page to load data")
        if name == "discover":
            sub.add_argument("--date", help="date to probe (YYYY-MM-DD)")
        if name == "check":
            sub.add_argument("--no-notify", action="store_true", help="print only")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose > 1 else logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    if not getattr(args, "needs_config", False):
        return args.func(args)

    path = find_config(args.config)
    if path is None:
        target = args.config or "teewatch.yaml"
        print(f"No config found at {target}. Run 'teewatch init' to create one.", file=sys.stderr)
        return 2
    try:
        config = load_config(path)
    except ConfigError as exc:
        print(f"Config error: {exc}", file=sys.stderr)
        return 2

    try:
        return args.func(args, config)
    except DiscoveryError as exc:
        print(f"Discovery failed: {exc}", file=sys.stderr)
        return 3
    except FetchError as exc:
        print(f"Fetch failed: {exc}", file=sys.stderr)
        return 3
