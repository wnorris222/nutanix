"""Notification channels. Every sender is best-effort: one broken channel must
not stop the others, and must never kill the watch loop."""

from __future__ import annotations

import json
import logging
import os
import shutil
import smtplib
import subprocess
import sys
import urllib.request
from email.message import EmailMessage
from typing import Optional, Protocol

log = logging.getLogger("teewatch.notify")


class Notifier(Protocol):
    name: str

    def send(self, title: str, body: str, url: Optional[str] = None) -> None: ...


class ConsoleNotifier:
    name = "console"

    def send(self, title: str, body: str, url: Optional[str] = None) -> None:
        print(f"\n\033[1m{title}\033[0m\n{body}" + (f"\n{url}" if url else ""), flush=True)


class NtfyNotifier:
    """Free phone push via ntfy.sh - install the app, subscribe to your topic."""

    name = "ntfy"

    def __init__(self, topic: str, server: str = "https://ntfy.sh", priority: str = "default"):
        if not topic:
            raise ValueError("ntfy requires a topic")
        self.topic = topic
        self.server = server.rstrip("/")
        self.priority = priority

    def send(self, title: str, body: str, url: Optional[str] = None) -> None:
        headers = {
            "Title": title.encode("ascii", "replace").decode(),
            "Priority": self.priority,
            "Tags": "golf",
        }
        if url:
            headers["Click"] = url
        request = urllib.request.Request(
            f"{self.server}/{self.topic}",
            data=body.encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()


class WebhookNotifier:
    """Generic JSON POST - also fits Slack and Discord incoming webhooks."""

    name = "webhook"

    def __init__(self, url: str, template: str = "generic"):
        if not url:
            raise ValueError("webhook requires a url")
        self.url = url
        self.template = template

    def send(self, title: str, body: str, url: Optional[str] = None) -> None:
        if self.template in ("slack", "discord"):
            payload = {"text": f"*{title}*\n{body}" + (f"\n{url}" if url else "")}
            if self.template == "discord":
                payload = {"content": payload["text"]}
        else:
            payload = {"title": title, "body": body, "url": url}
        request = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()


class EmailNotifier:
    name = "email"

    def __init__(
        self,
        host: str,
        to: list[str],
        sender: str,
        port: int = 587,
        username: Optional[str] = None,
        password: Optional[str] = None,
        password_env: Optional[str] = None,
        use_tls: bool = True,
    ):
        if not host or not to or not sender:
            raise ValueError("email requires host, from and to")
        self.host, self.port, self.to, self.sender = host, int(port), list(to), sender
        self.username = username or sender
        self.password = password or (os.environ.get(password_env) if password_env else None)
        self.use_tls = use_tls
        if not self.password:
            hint = f" (env {password_env} is unset)" if password_env else ""
            raise ValueError(f"email requires a password{hint}")

    def send(self, title: str, body: str, url: Optional[str] = None) -> None:
        message = EmailMessage()
        message["Subject"] = title
        message["From"] = self.sender
        message["To"] = ", ".join(self.to)
        message.set_content(body + (f"\n\nBook: {url}" if url else ""))
        with smtplib.SMTP(self.host, self.port, timeout=30) as server:
            if self.use_tls:
                server.starttls()
            server.login(self.username, self.password)
            server.send_message(message)


class DesktopNotifier:
    """Native desktop banner on macOS or Linux."""

    name = "desktop"

    def send(self, title: str, body: str, url: Optional[str] = None) -> None:
        first_line = body.strip().splitlines()[0] if body.strip() else ""
        if sys.platform == "darwin":
            script = (
                f'display notification {json.dumps(first_line)} '
                f'with title {json.dumps(title)}'
            )
            subprocess.run(["osascript", "-e", script], check=False, timeout=15)
        elif shutil.which("notify-send"):
            subprocess.run(["notify-send", title, first_line], check=False, timeout=15)
        else:
            raise RuntimeError("no desktop notification backend available")


_BUILDERS = {
    "console": lambda cfg: ConsoleNotifier(),
    "desktop": lambda cfg: DesktopNotifier(),
    "ntfy": lambda cfg: NtfyNotifier(**cfg),
    "webhook": lambda cfg: WebhookNotifier(**cfg),
    "email": lambda cfg: EmailNotifier(**cfg),
}


def build_notifiers(config: dict) -> list[Notifier]:
    """Turn the ``notify:`` config block into live notifier objects."""
    notifiers: list[Notifier] = []
    for key, value in (config or {}).items():
        builder = _BUILDERS.get(key)
        if builder is None:
            log.warning("ignoring unknown notifier %r", key)
            continue
        if value is False or value is None:
            continue
        options = {} if value is True else dict(value)
        if options.pop("enabled", True) is False:
            continue
        try:
            notifiers.append(builder(options))
        except Exception as exc:
            log.error("notifier %r is misconfigured: %s", key, exc)
    return notifiers


def notify_all(
    notifiers: list, title: str, body: str, url: Optional[str] = None
) -> int:
    """Send to every channel; returns how many succeeded."""
    delivered = 0
    for notifier in notifiers:
        try:
            notifier.send(title, body, url)
            delivered += 1
        except Exception as exc:
            log.error("%s notification failed: %s", getattr(notifier, "name", notifier), exc)
    return delivered
