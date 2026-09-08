"""Core value types shared across the app."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class TeeTime:
    """A single bookable slot, normalized away from any vendor payload shape."""

    date: dt.date
    time: dt.time
    players: tuple[int, ...] = ()
    holes: Optional[int] = None
    price: Optional[float] = None
    course: Optional[str] = None
    booking_url: Optional[str] = None
    raw: dict = field(default_factory=dict, repr=False, compare=False)

    @property
    def starts_at(self) -> dt.datetime:
        return dt.datetime.combine(self.date, self.time)

    @property
    def max_players(self) -> int:
        return max(self.players) if self.players else 0

    def identity(self) -> str:
        """Stable key for de-duplicating alerts across polls.

        Party size is part of the identity so that a slot growing from 2 to 4
        open spots is treated as news rather than a slot we already reported.
        """
        return "|".join(
            [
                self.date.isoformat(),
                self.time.strftime("%H:%M"),
                str(self.holes or "?"),
                str(self.max_players),
            ]
        )

    def label(self) -> str:
        stamp = self.starts_at.strftime("%a %b %-d, %-I:%M %p")
        bits = [stamp]
        if self.max_players:
            noun = "player" if self.max_players == 1 else "players"
            bits.append(f"up to {self.max_players} {noun}")
        if self.holes:
            bits.append(f"{self.holes} holes")
        if self.price is not None:
            bits.append(f"${self.price:.0f}")
        return " - ".join(bits)
