"""Run the live layer for a whole Xetra session from one GitHub Actions job.

GitHub's scheduler starts frequent cron jobs late or skips them, so instead of one job per
5-minute bar, .github/workflows/live-dax40.yml only has to start this script once per morning
(several redundant start times). The script then keeps its own clock:

  - before the session window it waits (up to --max-wait minutes), outside it it publishes once and exits;
  - during the window (09:00-17:55 Frankfurt, Xetra trading days) it fetches 5-minute bars with
    build_live.py and publishes live.json to the `live-data` branch every 5 minutes (when changed);
  - shortly before the 6-hour job limit it starts a fresh run of the workflow and exits;
  - after the window it runs build_dax40.py and commits the official daily closes to main.

    python python/live_loop.py --dry-run --once      # local test: one fetch, no push

Needs GITHUB_TOKEN and GITHUB_REPOSITORY (set by Actions) to publish, and the gh CLI for the restart.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import build_live  # noqa: E402

BERLIN = ZoneInfo("Europe/Berlin")
OPEN, CLOSE = (9, 0), (17, 55)          # 17:30 close plus the source's ~15-minute delay and a margin
STEP_MIN, OFFSET_MIN = 5, 2              # publish at :02, :07, :12 ... (2 min after each bar boundary)
WORKFLOW = "live-dax40.yml"
# Xetra trading holidays on weekdays; keep in step with XETRA_HOLIDAYS in assets/dax.js.
HOLIDAYS = {"2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01", "2027-03-26", "2027-03-29", "2027-12-24", "2027-12-31"}


def log(*a):
    print(datetime.now(BERLIN).strftime("%H:%M:%S"), *a, flush=True)


def window(day: datetime) -> tuple[datetime, datetime] | None:
    if day.weekday() >= 5 or day.strftime("%Y-%m-%d") in HOLIDAYS:
        return None
    return (day.replace(hour=OPEN[0], minute=OPEN[1], second=0, microsecond=0),
            day.replace(hour=CLOSE[0], minute=CLOSE[1], second=0, microsecond=0))


BOT = {"GIT_AUTHOR_NAME": "github-actions[bot]", "GIT_AUTHOR_EMAIL": "41898283+github-actions[bot]@users.noreply.github.com",
       "GIT_COMMITTER_NAME": "github-actions[bot]", "GIT_COMMITTER_EMAIL": "41898283+github-actions[bot]@users.noreply.github.com"}


def git(*args, cwd=None, check=True):
    # a fixed identity for every git call: `pull --rebase` re-commits and fails without a committer
    return subprocess.run(["git", *args], cwd=cwd, check=check, capture_output=True, text=True, env={**os.environ, **BOT})


def push_main(cwd) -> bool:
    """Rebase the local data commit onto the current main and push; True only if main now has it."""
    for _ in range(3):
        r = git("pull", "-q", "--rebase", "-X", "theirs", remote_url(), "main", cwd=cwd, check=False)
        if r.returncode:   # generated files only: on a conflict this run's fresh build wins (-X theirs)
            log("rebase failed:", (r.stderr or r.stdout).strip()[-300:])
            git("rebase", "--abort", cwd=cwd, check=False)
        else:
            p = git("push", "-q", remote_url(), "HEAD:main", cwd=cwd, check=False)
            head = git("rev-parse", "HEAD", cwd=cwd).stdout.strip()
            remote = git("ls-remote", remote_url(), "refs/heads/main", cwd=cwd, check=False).stdout.split()
            if not p.returncode and remote and remote[0] == head:
                return True
            log("push failed:", (p.stderr or "main does not have the commit").strip()[-300:])
        time.sleep(10)
    return False


def remote_url() -> str | None:
    tok, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    return f"https://x-access-token:{tok}@github.com/{repo}.git" if tok and repo else None


def publish(payload: dict, dry: bool) -> None:
    if dry or not remote_url():
        log("dry run: not publishing")
        return
    with tempfile.TemporaryDirectory() as d:
        Path(d, "live.json").write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        Path(d, "README.md").write_text("# live-data\n\nWritten by python/live_loop.py (workflow live-dax40.yml) every 5 minutes "
                                        "during Xetra hours. Do not edit; each update replaces this branch.\n")
        git("init", "-q", "-b", "live-data", cwd=d)
        git("add", "-A", cwd=d)
        git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898283+github-actions[bot]@users.noreply.github.com",
            "commit", "-q", "-m", f"Live DAX bars {payload['generated']}", cwd=d)
        r = git("push", "-q", "--force", remote_url(), "live-data", cwd=d, check=False)
        if r.returncode:
            log("push failed:", r.stderr.strip()[-300:])


last_fp: str | None = None


def fetch_and_publish(dry: bool) -> None:
    global last_fp
    try:
        payload = build_live.build()
    except SystemExit as e:          # build_live refuses on bad data
        log("skip:", e)
        return
    except Exception as e:  # noqa: BLE001
        log("fetch failed:", repr(e)[:300])
        return
    fp = build_live.fingerprint(payload)
    if fp == last_fp:
        log("no new bars")
        return
    last_fp = fp
    log(f"publishing: {len(payload['times'])} bars, last {datetime.fromtimestamp(payload['times'][-1], BERLIN):%H:%M}, "
        f"missing {payload['missing'] or 'none'}")
    publish(payload, dry)


def daily_closes(dry: bool, wait: bool = True) -> None:
    """Rebuild data/dax40.js (closes, market caps, ECB series) and commit it if it changed."""
    if wait:
        # the closing auction ends ~17:35 and the source lags ~15 minutes: wait until 18:05 for final closes
        ready = datetime.now(BERLIN).replace(hour=18, minute=5, second=0, microsecond=0)
        secs = (ready - datetime.now(BERLIN)).total_seconds()
        if secs > 0:
            log(f"waiting until {ready:%H:%M} for final closes")
            time.sleep(secs)
        log("session over: building official daily closes")
    else:
        log("morning refresh of daily closes, market caps and ECB data")
    r = subprocess.run([sys.executable, str(HERE / "build_dax40.py"), "--period", "2y"], cwd=ROOT, capture_output=True, text=True)
    log((r.stderr or r.stdout).strip()[-400:])
    if r.returncode or dry or not remote_url():
        return
    git("add", "data/dax40.js", "data/dax40_prices.csv", cwd=ROOT)
    if not git("diff", "--cached", "--quiet", cwd=ROOT, check=False).returncode:
        log("daily data unchanged")
        return
    stamp = datetime.now(BERLIN).strftime("%Y-%m-%d")
    git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898283+github-actions[bot]@users.noreply.github.com",
        "commit", "-q", "-m", f"Update DAX market data ({stamp})", cwd=ROOT)
    if push_main(ROOT):
        log("daily data committed")
    else:
        print("::warning title=Daily data not committed::the daily data commit could not be pushed to main", flush=True)


def restart(dry: bool) -> None:
    log("time budget used: starting a fresh run")
    if dry:
        return
    env = {**os.environ, "GH_TOKEN": os.environ.get("GITHUB_TOKEN", "")}
    r = subprocess.run(["gh", "workflow", "run", WORKFLOW, "--ref", os.environ.get("GITHUB_REF_NAME", "main")],
                       env=env, capture_output=True, text=True)
    log("restart:", (r.stdout + r.stderr).strip()[-300:] or "ok")


def next_tick(now: datetime) -> datetime:
    base = now.replace(second=30, microsecond=0)
    m = (base.minute // STEP_MIN) * STEP_MIN + OFFSET_MIN
    t = base.replace(minute=0) + timedelta(minutes=m)
    while t <= now:
        t += timedelta(minutes=STEP_MIN)
    return t


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--budget", type=float, default=335, help="minutes before handing over to a fresh run (job limit is 360)")
    ap.add_argument("--max-wait", type=float, default=120, help="minutes to wait for the session to open")
    ap.add_argument("--once", action="store_true", help="fetch and publish once, then exit")
    ap.add_argument("--dry-run", action="store_true", help="do not push anything")
    a = ap.parse_args()
    start = time.monotonic()
    budget_left = lambda: a.budget * 60 - (time.monotonic() - start)  # noqa: E731

    now = datetime.now(BERLIN)
    win = window(now)
    if a.once or win is None or now >= win[1] or (win[0] - now).total_seconds() > a.max_wait * 60:
        log("outside the session window: one update, then exit")
        fetch_and_publish(a.dry_run)
        return
    if now < win[0]:
        # catch up on anything the evening run missed (closes, market caps, ECB); never moves data backwards
        daily_closes(a.dry_run, wait=False)
        now = datetime.now(BERLIN)
        log(f"waiting for the open at {win[0]:%H:%M}")
        time.sleep((win[0] - now).total_seconds() + 60 * OFFSET_MIN)

    while True:
        fetch_and_publish(a.dry_run)
        now = datetime.now(BERLIN)
        if now >= win[1]:
            daily_closes(a.dry_run)
            return
        t = next_tick(now)
        if (t - now).total_seconds() > budget_left() - 120:
            restart(a.dry_run)
            return
        time.sleep(max(1, (t - datetime.now(BERLIN)).total_seconds()))


if __name__ == "__main__":
    main()
