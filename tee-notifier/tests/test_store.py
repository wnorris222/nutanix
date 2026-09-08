import datetime as dt

from teewatch.models import TeeTime
from teewatch.store import SeenStore


def tee(hour, players=(4,), date=dt.date(2026, 9, 11)):
    return TeeTime(date=date, time=dt.time(hour, 0), players=players, holes=18)


def test_first_sighting_is_new_then_not(tmp_path):
    with SeenStore(tmp_path / "seen.db") as store:
        slots = [tee(7), tee(8)]
        assert len(store.select_new(slots)) == 2
        store.mark_seen(slots)
        assert store.select_new(slots) == []


def test_more_open_spots_counts_as_news(tmp_path):
    with SeenStore(tmp_path / "seen.db") as store:
        store.mark_seen([tee(7, players=(1, 2))])
        assert len(store.select_new([tee(7, players=(1, 2, 3, 4))])) == 1


def test_reappearing_slot_realerts_after_the_window(tmp_path):
    with SeenStore(tmp_path / "seen.db") as store:
        long_ago = dt.datetime(2026, 9, 1, 12, 0)
        store.mark_seen([tee(7)], now=long_ago)
        window = dt.timedelta(hours=12)
        now = long_ago + dt.timedelta(hours=13)
        assert len(store.select_new([tee(7)], renotify_after=window, now=now)) == 1
        soon = long_ago + dt.timedelta(hours=1)
        assert store.select_new([tee(7)], renotify_after=window, now=soon) == []


def test_renotify_disabled_never_realerts(tmp_path):
    with SeenStore(tmp_path / "seen.db") as store:
        store.mark_seen([tee(7)], now=dt.datetime(2020, 1, 1))
        assert store.select_new([tee(7)], renotify_after=None) == []


def test_forget_before_prunes_past_days(tmp_path):
    with SeenStore(tmp_path / "seen.db") as store:
        store.mark_seen([tee(7, date=dt.date(2026, 9, 1)), tee(7, date=dt.date(2026, 9, 20))])
        assert store.forget_before(dt.date(2026, 9, 10)) == 1
        assert store.count() == 1


def test_empty_input_is_safe(tmp_path):
    with SeenStore(tmp_path / "seen.db") as store:
        assert store.select_new([]) == []
        store.mark_seen([])


def test_state_survives_reopen(tmp_path):
    path = tmp_path / "nested" / "seen.db"
    with SeenStore(path) as store:
        store.mark_seen([tee(7)])
    with SeenStore(path) as store:
        assert store.select_new([tee(7)]) == []
