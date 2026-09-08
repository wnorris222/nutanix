"""Remembers which slots we have already alerted on.

Without this, every poll would re-announce the same tee times. Identity
includes the party size, so a slot that grows from 2 open spots to 4 counts as
news again.
"""

from __future__ import annotations

import datetime as dt
import sqlite3
from pathlib import Path
from typing import Iterable, Sequence

from .models import TeeTime

_SCHEMA = """
CREATE TABLE IF NOT EXISTS seen (
    identity   TEXT PRIMARY KEY,
    tee_date   TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seen_by_date ON seen (tee_date);
"""


class SeenStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    def __enter__(self) -> "SeenStore":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def close(self) -> None:
        self.conn.close()

    def select_new(
        self,
        tee_times: Sequence[TeeTime],
        *,
        renotify_after: dt.timedelta | None = None,
        now: dt.datetime | None = None,
    ) -> list[TeeTime]:
        """Which of these have we not already reported (or reported long ago)?"""
        if not tee_times:
            return []
        now = now or dt.datetime.now()
        known: dict[str, dt.datetime] = {}
        rows = self.conn.execute(
            "SELECT identity, last_seen FROM seen WHERE identity IN (%s)"
            % ",".join("?" * len(tee_times)),
            [tee.identity() for tee in tee_times],
        )
        for identity, last_seen in rows:
            try:
                known[identity] = dt.datetime.fromisoformat(last_seen)
            except ValueError:
                known[identity] = now

        fresh = []
        for tee in tee_times:
            last = known.get(tee.identity())
            if last is None:
                fresh.append(tee)
            elif renotify_after is not None and now - last >= renotify_after:
                fresh.append(tee)
        return fresh

    def mark_seen(self, tee_times: Iterable[TeeTime], now: dt.datetime | None = None) -> None:
        stamp = (now or dt.datetime.now()).isoformat(timespec="seconds")
        self.conn.executemany(
            """
            INSERT INTO seen (identity, tee_date, first_seen, last_seen)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(identity) DO UPDATE SET last_seen = excluded.last_seen
            """,
            [(tee.identity(), tee.date.isoformat(), stamp, stamp) for tee in tee_times],
        )
        self.conn.commit()

    def forget_before(self, date: dt.date) -> int:
        """Drop rows for dates that have already been played."""
        cursor = self.conn.execute("DELETE FROM seen WHERE tee_date < ?", (date.isoformat(),))
        self.conn.commit()
        return cursor.rowcount

    def count(self) -> int:
        return self.conn.execute("SELECT COUNT(*) FROM seen").fetchone()[0]
