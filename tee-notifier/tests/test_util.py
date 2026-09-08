import datetime as dt

from teewatch.util import find_iso_date, host_of, swap_date, with_date

DATE = dt.date(2026, 10, 2)


def test_with_date_rewrites_existing_query_date():
    url = "https://x.book.teeitup.com/?course=12802&date=2026-09-11&holes=18"
    assert with_date(url, DATE) == "https://x.book.teeitup.com/?course=12802&date=2026-10-02&holes=18"


def test_with_date_honours_placeholder():
    assert with_date("https://x/?d={date}", DATE) == "https://x/?d=2026-10-02"


def test_with_date_appends_when_absent():
    assert with_date("https://x/teetimes", DATE) == "https://x/teetimes?date=2026-10-02"
    assert with_date("https://x/?a=1", DATE) == "https://x/?a=1&date=2026-10-02"


def test_with_date_only_replaces_the_first_date():
    url = "https://x/?date=2026-09-11&until=2026-09-11"
    assert with_date(url, DATE) == "https://x/?date=2026-10-02&until=2026-09-11"


def test_swap_date_prefers_the_known_token():
    assert swap_date("a=2026-09-11", "2026-09-11", "2026-10-02") == "a=2026-10-02"


def test_swap_date_falls_back_to_any_iso_date():
    assert swap_date("a=2026-09-11", "1999-01-01", "2026-10-02") == "a=2026-10-02"


def test_swap_date_handles_missing_text():
    assert swap_date(None, "2026-09-11", "2026-10-02") is None
    assert swap_date("no dates here", "2026-09-11", "2026-10-02") == "no dates here"


def test_swap_date_ignores_a_token_that_is_not_a_date():
    # A short token would otherwise substring-match and corrupt the request.
    assert swap_date("courseId=12802", "12802", "2026-10-02") == "courseId=12802"


def test_find_iso_date():
    assert find_iso_date(None, "x", "d=2026-09-11") == "2026-09-11"
    assert find_iso_date("nothing") is None


def test_host_of():
    assert host_of("https://x.book.teeitup.com/?a=1") == "x.book.teeitup.com"
