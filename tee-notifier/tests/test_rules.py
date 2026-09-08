import datetime as dt

import pytest

from teewatch.models import TeeTime
from teewatch.rules import Watch, candidate_dates, match_all, parse_time, parse_weekdays


def tee(time_str, players=(1, 2, 3, 4), holes=18, price=None, date=dt.date(2026, 9, 11)):
    hour, minute = (int(part) for part in time_str.split(":"))
    return TeeTime(date=date, time=dt.time(hour, minute), players=tuple(players),
                   holes=holes, price=price)


@pytest.mark.parametrize("value,expected", [
    ("7:30", dt.time(7, 30)), ("07:30", dt.time(7, 30)), ("7:30am", dt.time(7, 30)),
    ("7am", dt.time(7, 0)), ("7:30 PM", dt.time(19, 30)), ("12am", dt.time(0, 0)),
    ("12pm", dt.time(12, 0)), ("1930", dt.time(19, 30)),
])
def test_parse_time(value, expected):
    assert parse_time(value) == expected


def test_parse_time_rejects_nonsense():
    with pytest.raises(ValueError):
        parse_time("tea time")


@pytest.mark.parametrize("value,expected", [
    ("fri", {4}), ("Friday", {4}), (["sat", "sun"], {5, 6}),
    ("weekend", {5, 6}), ("weekdays", {0, 1, 2, 3, 4}), (None, set(range(7))),
    ([], set(range(7))),
])
def test_parse_weekdays(value, expected):
    assert parse_weekdays(value) == expected


def test_parse_weekdays_rejects_unknown_day():
    with pytest.raises(ValueError):
        parse_weekdays(["funday"])


class TestWatchMatching:
    watch = Watch.from_dict(
        {"name": "Fri AM", "days": ["fri"], "before": "10:00", "players": 2, "holes": 18}
    )

    def test_matches_inside_window(self):
        assert self.watch.matches(tee("07:30"))

    def test_rejects_after_window(self):
        assert not self.watch.matches(tee("10:30"))

    def test_boundary_is_inclusive(self):
        assert self.watch.matches(tee("10:00"))

    def test_rejects_wrong_weekday(self):
        assert not self.watch.matches(tee("07:30", date=dt.date(2026, 9, 12)))

    def test_rejects_too_few_spots(self):
        assert not self.watch.matches(tee("07:30", players=(1,)))

    def test_rejects_wrong_hole_count(self):
        assert not self.watch.matches(tee("07:30", holes=9))

    def test_unknown_party_size_still_alerts(self):
        # Better one extra alert than a missed opening.
        assert self.watch.matches(tee("07:30", players=()))

    def test_unknown_hole_count_still_alerts(self):
        assert self.watch.matches(tee("07:30", holes=None))

    def test_max_price(self):
        pricey = Watch.from_dict({"name": "cheap", "max_price": 40})
        assert pricey.matches(tee("07:30", price=35))
        assert not pricey.matches(tee("07:30", price=55))


def test_from_dict_rejects_unknown_option():
    with pytest.raises(ValueError, match="unknown watch option"):
        Watch.from_dict({"name": "x", "befor": "10:00"})


def test_candidate_dates_only_covers_wanted_weekdays():
    watch = Watch.from_dict({"name": "Fri", "days": ["fri"]})
    days = candidate_dates([watch], dt.date(2026, 9, 8), 21)
    assert days == [dt.date(2026, 9, 11), dt.date(2026, 9, 18), dt.date(2026, 9, 25)]


def test_candidate_dates_unions_across_watches():
    watches = [
        Watch.from_dict({"name": "Fri", "days": ["fri"]}),
        Watch.from_dict({"name": "Sat", "days": ["sat"]}),
    ]
    days = candidate_dates(watches, dt.date(2026, 9, 8), 7)
    assert days == [dt.date(2026, 9, 11), dt.date(2026, 9, 12)]


def test_match_all_attributes_each_tee_to_one_watch():
    watches = [
        Watch.from_dict({"name": "early", "days": ["fri"], "before": "09:00"}),
        Watch.from_dict({"name": "late", "days": ["fri"], "after": "12:00"}),
    ]
    hits = match_all(watches, [tee("07:30"), tee("13:00"), tee("10:30")])
    assert [(watch.name, hit.time.hour) for watch, hit in hits] == [("early", 7), ("late", 13)]
