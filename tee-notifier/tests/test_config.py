import datetime as dt

import pytest

from teewatch.config import ConfigError, from_dict, load_config

BASE = {
    "site": {"url": "https://x/?date=2026-09-11", "timezone": "America/New_York"},
    "watches": [{"name": "Fri AM", "days": ["fri"], "before": "10:00", "players": 2}],
}


def test_minimal_config():
    config = from_dict(dict(BASE))
    assert config.site_url == "https://x/?date=2026-09-11"
    assert config.timezone == "America/New_York"
    assert len(config.watches) == 1
    assert config.interval_seconds == 300
    assert config.notify == {"console": True}


def test_site_may_be_a_bare_url_string():
    assert from_dict({**BASE, "site": "https://x/"}).site_url == "https://x/"


def test_missing_url_is_rejected():
    with pytest.raises(ConfigError, match="site.url"):
        from_dict({"watches": BASE["watches"]})


def test_missing_watches_is_rejected():
    with pytest.raises(ConfigError, match="watches"):
        from_dict({"site": BASE["site"]})


def test_bad_weekday_names_the_offending_watch():
    with pytest.raises(ConfigError, match="Fri AM"):
        from_dict({**BASE, "watches": [{"name": "Fri AM", "days": ["funday"]}]})


def test_hammering_interval_is_rejected():
    with pytest.raises(ConfigError, match="at least 60"):
        from_dict({**BASE, "poll": {"interval_seconds": 5}})


def test_email_from_is_mapped_to_sender():
    config = from_dict({**BASE, "notify": {"email": {"host": "h", "from": "a@b.c", "to": ["a@b.c"]}}})
    assert config.notify["email"]["sender"] == "a@b.c"
    assert "from" not in config.notify["email"]


def test_renotify_can_be_disabled():
    assert from_dict({**BASE, "poll": {"renotify_after_hours": "never"}}).renotify_after_hours is None


def test_state_paths_derive_from_state_dir(tmp_path):
    config = from_dict({**BASE, "state_dir": str(tmp_path)})
    assert config.endpoint_cache == tmp_path / "endpoint.json"
    assert config.seen_db == tmp_path / "seen.db"


def test_unknown_timezone_degrades_to_naive_times():
    assert from_dict({**BASE, "site": {"url": "https://x/", "timezone": "Mars/Olympus"}}).tz is None


def test_today_uses_course_timezone():
    assert isinstance(from_dict(dict(BASE)).today(), dt.date)


def test_load_config_reports_bad_yaml(tmp_path):
    path = tmp_path / "teewatch.yaml"
    path.write_text("watches: [oops\n")
    with pytest.raises(ConfigError, match="not valid YAML"):
        load_config(path)


def test_load_config_round_trip(tmp_path):
    path = tmp_path / "teewatch.yaml"
    path.write_text(
        'site:\n  url: "https://x/?date=2026-09-11"\n'
        'watches:\n  - name: Fri\n    days: [friday]\n    before: "10:00"\n'
    )
    assert load_config(path).watches[0].name == "Fri"
