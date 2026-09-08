import datetime as dt

import pytest
from conftest import load_fixture
from zoneinfo import ZoneInfo

from teewatch.normalize import extract_tee_times, parse_moment

EASTERN = ZoneInfo("America/New_York")
DATE = dt.date(2026, 9, 11)


def test_nested_vendor_shape():
    tees = extract_tee_times(load_fixture("nested_payload"), DATE, EASTERN)
    assert [t.time.strftime("%H:%M") for t in tees] == ["07:30", "09:10", "13:40", "15:00"]
    assert tees[0].max_players == 4
    assert tees[0].holes == 18
    # Price lives under 'rates', not a key literally named 'price'.
    assert tees[0].price == 52.0
    assert tees[0].course == "The Walker Course at Clemson University"
    assert tees[0].booking_url.startswith("https://")


def test_flat_shape_with_different_field_names():
    tees = extract_tee_times(load_fixture("flat_payload"), DATE, EASTERN)
    assert [t.time.strftime("%H:%M") for t in tees] == ["07:45", "10:15"]
    assert tees[0].price == 49.0
    assert tees[0].holes == 18


def test_epoch_millis_render_in_course_timezone():
    tees = extract_tee_times(load_fixture("epoch_payload"), DATE, EASTERN)
    assert [t.time.strftime("%H:%M") for t in tees] == ["07:30", "09:30"]
    assert tees[1].max_players == 1


def test_absurd_prices_are_ignored():
    payload = {"t": [{"teetime": "2026-09-11T07:30:00", "price": 999999}]}
    assert extract_tee_times(payload, DATE)[0].price is None


def test_results_are_deduplicated_and_sorted():
    payload = {
        "a": [{"teetime": "2026-09-11T09:00:00", "players": [4]}],
        "b": [{"teetime": "2026-09-11T09:00:00", "players": [4]},
              {"teetime": "2026-09-11T07:00:00", "players": [4]}],
    }
    tees = extract_tee_times(payload, DATE)
    assert [t.time.hour for t in tees] == [7, 9]


def test_bare_time_falls_back_to_requested_date():
    payload = {"times": [{"time": "7:30 AM", "players": 4}]}
    tee = extract_tee_times(payload, DATE)[0]
    assert tee.date == DATE and tee.time == dt.time(7, 30)


@pytest.mark.parametrize("payload", [
    {}, [], {"errors": ["no availability"]}, {"count": 0, "items": []},
    {"nav": [{"name": "Home", "url": "/"}, {"name": "Rates", "url": "/rates"}]},
])
def test_payloads_without_tee_times_yield_nothing(payload):
    assert extract_tee_times(payload, DATE) == []


def test_relative_booking_urls_are_dropped():
    payload = {"t": [{"teetime": "2026-09-11T07:30:00", "bookingUrl": "/book/123"}]}
    assert extract_tee_times(payload, DATE)[0].booking_url is None


@pytest.mark.parametrize("value,expected_time", [
    ("2026-09-11T07:30:00", dt.time(7, 30)),
    ("2026-09-11 07:30", dt.time(7, 30)),
    ("09/11/2026 07:45 AM", dt.time(7, 45)),
    ("7:30 PM", dt.time(19, 30)),
    ("not a time", None),
    (None, None),
    (True, None),
    (42, None),
])
def test_parse_moment(value, expected_time):
    assert parse_moment(value)[1] == expected_time


def test_parse_moment_converts_offsets_to_course_time():
    _, time = parse_moment("2026-09-11T11:30:00+00:00", EASTERN)
    assert time == dt.time(7, 30)
