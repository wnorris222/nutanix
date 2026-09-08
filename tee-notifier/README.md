# teewatch

Watches the [Walker Course at Clemson](https://the-walker-course-at-clemson-university.book.teeitup.com/)
booking site (or any other TeeItUp site) and notifies you when tee times open up
in the windows you actually care about — *Fridays before 10am*, *weekend
twilight*, and so on.

```
$ teewatch check
3 matching tee time(s); 2 new since the last check.
Friday mornings:
  Fri Sep 11
    7:20 AM  (4p, 18h, $52)
    8:40 AM  (4p, 18h, $52)
  Fri Sep 18
    9:50 AM  (4p, 18h, $52)
```

## How it works

These booking pages are JavaScript apps that fetch availability from a private,
undocumented JSON API. teewatch never guesses that URL. Instead:

1. **`teewatch discover`** opens the real booking page in a headless browser
   once, watches the network traffic, and identifies the request that came back
   with tee times in it. It caches that request — URL, method, headers, cookies.
2. **Every poll after that** replays the cached request directly over HTTP with
   the date swapped out. No browser, fast and light.
3. **If the replay ever breaks** (endpoint moved, token expired), teewatch
   notices and silently re-runs discovery.

Responses are parsed structurally rather than by hardcoded field paths, so a
vendor-side rename of the wrapper objects doesn't break it.

## Setup

```bash
pip install -e .            # or: pip install -r requirements.txt
playwright install chromium # one-time, for the discovery step
```

If you already have Chrome or Chromium installed and would rather not download
another one, skip `playwright install` and point teewatch at it (see
`browser.executable_path` below).

```bash
teewatch init        # writes teewatch.yaml, pre-filled for the Walker Course
$EDITOR teewatch.yaml
teewatch discover    # one-time: learn the site's tee-time API
teewatch check       # one pass
teewatch watch       # keep checking on an interval
```

## Configuration

`teewatch.yaml`:

```yaml
site:
  # The page you would normally open. teewatch swaps the date per day checked,
  # so whatever date is in the URL doesn't matter.
  url: "https://the-walker-course-at-clemson-university.book.teeitup.com/?course=12802&date=2026-09-11&holes=18&max=9999"
  timezone: "America/New_York"

poll:
  interval_seconds: 300     # how often to re-check (minimum 60)
  horizon_days: 30          # how far ahead to look
  renotify_after_hours: 12  # re-alert if a slot vanishes and comes back

watches:
  - name: "Friday mornings"
    days: [friday]
    before: "10:00"
    players: 2
    holes: 18

  - name: "Weekend twilight"
    days: [saturday, sunday]
    after: "16:00"
    players: 4

notify:
  console: true
  ntfy:
    topic: "walker-course-something-private"
```

### Watch options

| Option | Meaning | Example |
| --- | --- | --- |
| `days` | Which weekdays. Names, abbreviations, or `weekday`/`weekend`. Omit for every day. | `[friday]`, `[sat, sun]`, `weekend` |
| `after` / `earliest` | Earliest tee time | `"6:00"`, `"6am"` |
| `before` / `latest` | Latest tee time (inclusive) | `"10:00"`, `"10am"` |
| `players` | Need room for at least this many | `2` |
| `holes` | `9` or `18` | `18` |
| `max_price` | Skip anything pricier | `60` |

A tee time alerts if it matches **any** watch. Only the weekdays your watches
mention are ever fetched — a Fridays-only config never requests a Tuesday.

Where the site doesn't tell us a slot's party size, hole count, or price,
teewatch alerts anyway rather than filtering it out: a spurious alert is
cheaper than a missed tee time.

### Notification channels

Configure any combination; each one is independent, and a broken channel is
logged without stopping the others.

```yaml
notify:
  console: true          # print to the terminal
  desktop: true          # macOS/Linux notification banner

  ntfy:                  # free push to your phone
    topic: "pick-something-private-and-unguessable"
    # server: "https://ntfy.sh"

  email:
    host: "smtp.gmail.com"
    port: 587
    from: "you@example.com"
    to: ["you@example.com"]
    password_env: "TEEWATCH_SMTP_PASSWORD"   # read from the environment

  webhook:
    url: "https://hooks.slack.com/services/..."
    template: slack      # slack | discord | generic
```

For phone push, install the [ntfy](https://ntfy.sh) app and subscribe to your
topic. Anyone who knows a topic name can read it, so pick an unguessable one.

For email, prefer `password_env` and export the secret rather than writing it
into the config file. Gmail requires an
[app password](https://support.google.com/accounts/answer/185833).

Check your setup with `teewatch test-notify`.

### Browser options

```yaml
browser:
  headless: true
  settle_ms: 4000                                  # wait for the page to load data
  executable_path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  # channel: "chrome"                              # or let Playwright find installed Chrome
```

`executable_path` can also be set with the `TEEWATCH_CHROMIUM` environment
variable.

## Commands

| Command | Purpose |
| --- | --- |
| `teewatch init` | Write a starter config |
| `teewatch discover` | Learn the site's tee-time API (uses a browser) |
| `teewatch check` | One pass; notify about anything new |
| `teewatch list` | Show current matches without notifying or recording |
| `teewatch watch` | Keep checking on an interval |
| `teewatch test-notify` | Verify your notification setup |

Useful flags: `-v` (progress) / `-vv` (debug), `--show` (watch the browser
work, helpful when discovery fails), `--mode browser|replay|auto`.

## Running it continuously

`teewatch watch` runs in the foreground and is the simplest option. To have it
survive logout, run one `teewatch check` on a schedule instead — state lives in
SQLite, so scheduled runs de-duplicate correctly.

**macOS (launchd)** — `~/Library/LaunchAgents/com.you.teewatch.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>com.you.teewatch</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/teewatch</string>
    <string>-c</string><string>/Users/you/teewatch.yaml</string>
    <string>check</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.you.teewatch.plist
```

**Linux (cron)**:

```cron
*/5 * * * * cd /home/you && /usr/local/bin/teewatch check >> /home/you/teewatch.log 2>&1
```

## State

Everything lives under `~/.teewatch` (override with `state_dir`):

- `endpoint.json` — the cached tee-time request. May contain session cookies;
  treat it like a credential.
- `seen.db` — which slots you've already been told about. Delete it to be
  re-notified about everything currently open.

## Troubleshooting

**`Discovery failed: No tee-time response was recognized`** — the page probably
hadn't finished loading. Try `teewatch discover --settle 12000`, or
`teewatch discover --show` to watch what the browser actually does.

**`could not start Chromium`** — run `playwright install chromium`, or set
`browser.executable_path` to a Chrome you already have.

**Nothing ever matches** — run `teewatch list -v` to see how many tee times came
back per date before filtering. Courses typically only release tee times a week
or two out, so a far-future date legitimately returns nothing. Widen the window
or drop `players` to sanity-check.

**Notifications aren't arriving** — `teewatch test-notify` reports per-channel
success; run with `-v` for the underlying error.

## Be reasonable

This polls a public availability page on your behalf, the same page you'd
otherwise refresh by hand. The minimum interval is 60 seconds and the default
is 5 minutes, requests are spaced out, and failures back off. Please don't
lower those — hammering a small course's booking provider is both rude and a
good way to get your IP blocked.

## Development

```bash
pip install -e ".[dev]"
python -m pytest
```

The suite covers rule matching, payload normalization across several different
API shapes, the replay fetcher (against a local HTTP server), de-duplication,
and the CLI flow — no network access required.

## Status

The discovery → replay → notify pipeline is tested end-to-end against a local
stand-in for a TeeItUp site. It has **not** been run against the live Walker
Course site, because the network this was built on blocks that host — so the
first `teewatch discover` against the real site is the step to watch. If it
can't find the endpoint, `teewatch discover --show --settle 12000` will show
you what the page is doing.
