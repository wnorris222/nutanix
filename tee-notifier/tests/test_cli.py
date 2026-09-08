import datetime as dt

import pytest

from teewatch import cli
from teewatch.config import from_dict
from teewatch.fetch import FetchError
from teewatch.models import TeeTime
from teewatch.rules import Watch


def tee(hour, minute=0, date=dt.date(2026, 9, 11), players=(1, 2, 3, 4), price=52.0):
    return TeeTime(date=date, time=dt.time(hour, minute), players=players,
                   holes=18, price=price, course="Walker Course")


def make_config(tmp_path, **overrides):
    raw = {
        "site": {"url": "https://x/?date=2026-09-11", "timezone": "America/New_York"},
        "watches": [{"name": "Friday mornings", "days": ["fri"], "before": "10:00", "players": 2}],
        "poll": {"horizon_days": 7, "date_delay_seconds": 0},
        "state_dir": str(tmp_path),
        "notify": {},
    }
    raw.update(overrides)
    return from_dict(raw)


class StubFetcher:
    """Stands in for the network: canned tee times per date, or an error."""

    def __init__(self, by_date=None, fail_dates=()):
        self.by_date = by_date or {}
        self.fail_dates = set(fail_dates)
        self.calls = []

    def fetch(self, date):
        self.calls.append(date)
        if date in self.fail_dates:
            raise FetchError("boom")
        return self.by_date.get(date, [])


def test_format_hits_groups_by_watch_then_day():
    watch = Watch.from_dict({"name": "Friday mornings", "days": ["fri"]})
    hits = [(watch, tee(7, 30)), (watch, tee(9, 10)),
            (watch, tee(8, 0, date=dt.date(2026, 9, 18)))]
    text = cli.format_hits(hits)
    assert "Friday mornings:" in text
    assert "Fri Sep 11" in text and "Fri Sep 18" in text
    assert "7:30 AM  (4p, 18h, $52)" in text
    assert text.index("7:30 AM") < text.index("9:10 AM") < text.index("8:00 AM")


def test_format_hits_omits_unknown_detail():
    watch = Watch.from_dict({"name": "w"})
    text = cli.format_hits([(watch, TeeTime(dt.date(2026, 9, 11), dt.time(7, 30)))])
    assert "7:30 AM" in text and "(" not in text


def test_booking_link_prefers_the_slots_own_url(tmp_path):
    watch = Watch.from_dict({"name": "w"})
    slot = TeeTime(dt.date(2026, 9, 11), dt.time(7, 30), booking_url="https://book/me")
    assert cli.booking_link(make_config(tmp_path), [(watch, slot)]) == "https://book/me"


def test_booking_link_falls_back_to_the_site_for_that_day(tmp_path):
    watch = Watch.from_dict({"name": "w"})
    link = cli.booking_link(make_config(tmp_path), [(watch, tee(7, date=dt.date(2026, 9, 18)))])
    assert link == "https://x/?date=2026-09-18"


def test_booking_link_of_nothing_is_none(tmp_path):
    assert cli.booking_link(make_config(tmp_path), []) is None


def test_scan_only_fetches_wanted_weekdays(tmp_path, monkeypatch):
    config = make_config(tmp_path)
    monkeypatch.setattr(config.__class__, "today", lambda self: dt.date(2026, 9, 8))
    fetcher = StubFetcher()
    cli.scan(config, fetcher)
    assert fetcher.calls == [dt.date(2026, 9, 11)]


def test_scan_survives_a_failing_date(tmp_path, monkeypatch):
    config = make_config(tmp_path, poll={"horizon_days": 14, "date_delay_seconds": 0})
    monkeypatch.setattr(config.__class__, "today", lambda self: dt.date(2026, 9, 8))
    fetcher = StubFetcher(
        by_date={dt.date(2026, 9, 18): [tee(7, 30, date=dt.date(2026, 9, 18))]},
        fail_dates={dt.date(2026, 9, 11)},
    )
    hits, problems = cli.scan(config, fetcher)
    assert len(hits) == 1
    assert len(problems) == 1 and "2026-09-11" in problems[0]


def test_scan_applies_the_time_window(tmp_path, monkeypatch):
    config = make_config(tmp_path)
    monkeypatch.setattr(config.__class__, "today", lambda self: dt.date(2026, 9, 8))
    fetcher = StubFetcher({dt.date(2026, 9, 11): [tee(7, 30), tee(13, 40), tee(9, 50)]})
    hits, _ = cli.scan(config, fetcher)
    assert sorted(t.time.hour for _, t in hits) == [7, 9]


def test_run_check_notifies_only_about_new_slots(tmp_path, monkeypatch):
    config = make_config(tmp_path)
    monkeypatch.setattr(config.__class__, "today", lambda self: dt.date(2026, 9, 8))
    sent = []
    monkeypatch.setattr(cli, "build_notifiers", lambda cfg: ["stub"])
    monkeypatch.setattr(
        cli, "notify_all", lambda notifiers, title, body, url=None: sent.append((title, body)) or 1
    )
    fetcher = StubFetcher({dt.date(2026, 9, 11): [tee(7, 30), tee(9, 10)]})

    assert cli.run_check(config, fetcher, announce=True) == 2
    assert len(sent) == 1 and "2 tee times open at Walker Course" == sent[0][0]

    # Nothing changed on the second pass, so nobody gets pinged.
    assert cli.run_check(config, fetcher, announce=True) == 0
    assert len(sent) == 1

    # A newly opened slot is news again.
    fetcher.by_date[dt.date(2026, 9, 11)].append(tee(8, 20))
    assert cli.run_check(config, fetcher, announce=True) == 1
    assert len(sent) == 2 and "1 tee time open" in sent[1][0]


def test_run_check_can_stay_quiet(tmp_path, monkeypatch):
    config = make_config(tmp_path)
    monkeypatch.setattr(config.__class__, "today", lambda self: dt.date(2026, 9, 8))
    monkeypatch.setattr(cli, "notify_all", lambda *a, **k: pytest.fail("should not notify"))
    fetcher = StubFetcher({dt.date(2026, 9, 11): [tee(7, 30)]})
    assert cli.run_check(config, fetcher, announce=False) == 1


def test_init_writes_a_usable_config(tmp_path, capsys):
    path = tmp_path / "teewatch.yaml"
    assert cli.main(["init", "--path", str(path)]) == 0
    config = cli.load_config(path)
    assert config.watches[0].name == "Friday mornings"
    assert config.watches[0].latest == dt.time(10, 0)
    assert config.watches[0].weekdays == frozenset({4})


def test_init_refuses_to_clobber(tmp_path):
    path = tmp_path / "teewatch.yaml"
    path.write_text("keep me")
    assert cli.main(["init", "--path", str(path)]) == 1
    assert path.read_text() == "keep me"
    assert cli.main(["init", "--path", str(path), "--force"]) == 0


def test_missing_config_is_reported(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(cli, "find_config", lambda explicit: None)
    assert cli.main(["check"]) == 2
    assert "teewatch init" in capsys.readouterr().err


def test_verbose_accepted_before_or_after_the_subcommand():
    parser = cli.build_parser()
    assert parser.parse_args(["-v", "check"]).verbose == 1
    assert parser.parse_args(["check", "-v"]).verbose == 1
    assert parser.parse_args(["-v", "check"]).verbose == 1
    assert parser.parse_args(["check"]).verbose == 0
