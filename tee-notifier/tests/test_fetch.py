"""Replay-path tests against a real local HTTP server."""

import datetime as dt
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import pytest

from teewatch.discover import Capture
from teewatch.fetch import FetchError, TeeTimeFetcher

REQUESTS: list[dict] = []


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        REQUESTS.append({"path": parsed.path, "query": parse_qs(parsed.query),
                         "headers": dict(self.headers)})
        if parsed.path == "/broken":
            body, status, ctype = b"<html>nope</html>", 200, "text/html"
        elif parsed.path == "/missing":
            body, status, ctype = b"{}", 404, "application/json"
        else:
            date = parse_qs(parsed.query).get("bookingDate", ["2026-09-11"])[0]
            body = json.dumps({"teeTimes": [
                {"teeTimeStart": f"{date}T07:30:00", "players": [1, 2, 3, 4], "holes": 18}
            ]}).encode()
            status, ctype = 200, "application/json"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def server():
    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_port}"
    httpd.shutdown()


@pytest.fixture(autouse=True)
def _no_proxy(monkeypatch):
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        monkeypatch.delenv(name, raising=False)
    REQUESTS.clear()


def make_fetcher(server, tmp_path, path="/v2/tee-times", mode="replay"):
    cache = tmp_path / "endpoint.json"
    Capture(
        url=f"{server}{path}?courseId=12802&bookingDate=2026-09-11",
        method="GET",
        headers={"x-api-key": "abc123", "referer": f"{server}/?date=2026-09-11"},
        date_token="2026-09-11",
    ).save(cache)
    return TeeTimeFetcher(f"{server}/?date=2026-09-11", cache, mode=mode)


def test_replay_returns_tee_times(server, tmp_path):
    tees = make_fetcher(server, tmp_path).fetch(dt.date(2026, 9, 11))
    assert len(tees) == 1 and tees[0].time == dt.time(7, 30)


def test_replay_substitutes_the_requested_date(server, tmp_path):
    tees = make_fetcher(server, tmp_path).fetch(dt.date(2026, 10, 2))
    assert REQUESTS[-1]["query"]["bookingDate"] == ["2026-10-02"]
    assert tees[0].date == dt.date(2026, 10, 2)


def test_replay_keeps_captured_headers(server, tmp_path):
    make_fetcher(server, tmp_path).fetch(dt.date(2026, 10, 2))
    headers = REQUESTS[-1]["headers"]
    assert headers["x-api-key"] == "abc123"
    # The referer must follow the date, not point at the captured day.
    assert "2026-10-02" in headers["referer"]


def test_non_json_response_is_a_fetch_error(server, tmp_path):
    with pytest.raises(FetchError, match="not JSON"):
        make_fetcher(server, tmp_path, path="/broken").fetch(dt.date(2026, 9, 11))


def test_http_error_is_a_fetch_error(server, tmp_path):
    with pytest.raises(FetchError, match="HTTP 404"):
        make_fetcher(server, tmp_path, path="/missing").fetch(dt.date(2026, 9, 11))


def test_replay_mode_without_a_cache_explains_itself(tmp_path):
    fetcher = TeeTimeFetcher("https://x/", tmp_path / "absent.json", mode="replay")
    with pytest.raises(FetchError, match="teewatch discover"):
        fetcher.fetch(dt.date(2026, 9, 11))


def test_auto_mode_rediscovers_when_replay_breaks(server, tmp_path, monkeypatch):
    fetcher = make_fetcher(server, tmp_path, path="/broken", mode="auto")
    called = {}

    def fake_rediscover(date):
        called["date"] = date
        return None, ["rediscovered"]

    monkeypatch.setattr(fetcher, "rediscover", fake_rediscover)
    assert fetcher.fetch(dt.date(2026, 9, 11)) == ["rediscovered"]
    assert called["date"] == dt.date(2026, 9, 11)


def test_empty_day_does_not_trigger_rediscovery(server, tmp_path, monkeypatch):
    """A day with no availability is a real answer, not a broken endpoint."""
    fetcher = make_fetcher(server, tmp_path, mode="auto")
    monkeypatch.setattr(
        "teewatch.fetch.extract_tee_times", lambda *args, **kwargs: []
    )
    monkeypatch.setattr(
        fetcher, "rediscover", lambda date: pytest.fail("should not re-discover")
    )
    assert fetcher.fetch(dt.date(2026, 9, 11)) == []


def test_capture_round_trips_through_json(tmp_path):
    path = tmp_path / "endpoint.json"
    Capture(url="https://x/", method="POST", post_data="{}", date_token="2026-09-11").save(path)
    loaded = Capture.load(path)
    assert loaded.url == "https://x/" and loaded.method == "POST"


def test_capture_load_tolerates_a_corrupt_cache(tmp_path):
    path = tmp_path / "endpoint.json"
    path.write_text("{not json")
    assert Capture.load(path) is None
