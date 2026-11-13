"""Run the live layer of the five European market pages for a whole trading day from one GitHub Actions job.

Same design as python/live_loop.py (DAX): .github/workflows/live-markets.yml only has to start this
script once per morning; it then keeps its own clock.

  - All five markets trade 09:00-17:30 Central European time (London 08:00-16:30 UK time, Warsaw
    until 17:00), so one window, 09:00-17:55 Frankfurt time, covers them; a market on holiday is skipped.
  - At start it fetches every market once (so each page has its latest session), then during the window
    fetches 5-minute bars for each open market (build_market_live.py) every 5 minutes and publishes one
    file per market (cac40.json, ibex35.json, ...) to the one-commit `live-markets` branch when anything changed.
  - Shortly before the 6-hour job limit it starts a fresh run of the workflow and exits.
  - Before the window it refreshes the daily data; after the window it runs build_market.py for all
    markets and commits data/markets/ to main.

    python python/markets_loop.py --dry-run --once      # local test: one fetch of every market, no push
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
import build_market_live  # noqa: E402
from markets import MARKETS, ORDER  # noqa: E402

BERLIN = ZoneInfo("Europe/Berlin")
OPEN, CLOSE = (9, 0), (17, 55)          # 17:30 CET closes plus the source's ~15-minute delay and a margin
STEP_MIN, OFFSET_MIN = 5, 2
WORKFLOW = "live-markets.yml"
BRANCH = "live-markets"


def log(*a):
    print(datetime.now(BERLIN).strftime("%H:%M:%S"), *a, flush=True)


def trading_today(mid: str, now: datetime) -> bool:
    local = now.astimezone(ZoneInfo(MARKETS[mid]["tz"]))
    return local.weekday() < 5 and local.strftime("%Y-%m-%d") not in MARKETS[mid]["holidays"]


def in_session(mid: str, now: datetime) -> bool:
    """Open, or within 25 minutes after the close (the source delay), on a trading day."""
    m = MARKETS[mid]
    local = now.astimezone(ZoneInfo(m["tz"]))
    oh, om = map(int, m["open"].split(":"))
    ch, cm = map(int, m["close"].split(":"))
    t = local.hour * 60 + local.minute
    return trading_today(mid, now) and oh * 60 + om <= t < ch * 60 + cm + 25


def window(day: datetime) -> tuple[datetime, datetime] | None:
    if not any(trading_today(mid, day) for mid in ORDER):
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


PAYLOADS: dict[str, dict] = {}
FPS: dict[str, str] = {}


def load_published() -> None:
    """Start from the files already on the branch, so markets not fetched yet keep their last data."""
    url = remote_url()
    if not url:
        return
    with tempfile.TemporaryDirectory() as d:
        if git("clone", "-q", "--depth", "1", "--branch", BRANCH, url, d, check=False).returncode:
            log("no live-markets branch yet")
            return
        for mid in ORDER:
            p = Path(d, f"{mid}.json")
            if p.is_file():
                try:
                    PAYLOADS[mid] = json.loads(p.read_text())
                    FPS[mid] = build_market_live.fingerprint(PAYLOADS[mid])
                except (ValueError, KeyError):
                    pass
    log("loaded published files:", ", ".join(PAYLOADS) or "none")


def publish(dry: bool) -> None:
    if dry or not remote_url():
        log("dry run: not publishing")
        return
    with tempfile.TemporaryDirectory() as d:
        for mid, p in PAYLOADS.items():
            Path(d, f"{mid}.json").write_text(json.dumps(p, separators=(",", ":")), encoding="utf-8")
        Path(d, "README.md").write_text("# live-markets\n\nWritten by python/markets_loop.py (workflow live-markets.yml) every 5 minutes "
                                        "during trading hours: one file per market page. Do not edit; each update replaces this branch.\n")
        git("init", "-q", "-b", BRANCH, cwd=d)
        git("add", "-A", cwd=d)
        stamp = max(p["generated"] for p in PAYLOADS.values())
        git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898283+github-actions[bot]@users.noreply.github.com",
            "commit", "-q", "-m", f"Live market bars {stamp}", cwd=d)
        r = git("push", "-q", "--force", remote_url(), BRANCH, cwd=d, check=False)
        if r.returncode:
            log("push failed:", r.stderr.strip()[-300:])


def fetch(mids: list[str]) -> bool:
    changed = False
    for mid in mids:
        try:
            p = build_market_live.build(mid)
        except SystemExit as e:
            log(f"{mid} skip:", e)
            continue
        except Exception as e:  # noqa: BLE001
            log(f"{mid} fetch failed:", repr(e)[:300])
            continue
        fp = build_market_live.fingerprint(p)
        if fp == FPS.get(mid):
            continue
        FPS[mid], PAYLOADS[mid] = fp, p
        changed = True
        log(f"{mid}: {len(p['times'])} bars, last {datetime.fromtimestamp(p['times'][-1], BERLIN):%H:%M}, missing {p['missing'] or 'none'}")
    return changed


def daily_closes(dry: bool, wait: bool = True) -> None:
    """Rebuild data/markets/*.js and commit whatever changed."""
    if wait:
        ready = datetime.now(BERLIN).replace(hour=18, minute=5, second=0, microsecond=0)
        secs = (ready - datetime.now(BERLIN)).total_seconds()
        if secs > 0:
            log(f"waiting until {ready:%H:%M} for final closes")
            time.sleep(secs)
        log("session over: building official daily closes")
    else:
        log("morning refresh of daily closes, market caps and rates")
    r = subprocess.run([sys.executable, str(HERE / "build_market.py"), "all", "--period", "2y"], cwd=ROOT, capture_output=True, text=True)
    log(((r.stderr or "") + (r.stdout or "")).strip()[-1500:])
    if r.returncode or dry or not remote_url():
        return
    git("add", "data/markets", cwd=ROOT)
    if not git("diff", "--cached", "--quiet", cwd=ROOT, check=False).returncode:
        log("daily data unchanged")
        return
    stamp = datetime.now(BERLIN).strftime("%Y-%m-%d")
    git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898283+github-actions[bot]@users.noreply.github.com",
        "commit", "-q", "-m", f"Update European market data ({stamp})", cwd=ROOT)
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
    ap.add_argument("--daily", action="store_true", help="only rebuild and commit the daily data, then exit")
    ap.add_argument("--dry-run", action="store_true", help="do not push anything")
    a = ap.parse_args()
    start = time.monotonic()
    budget_left = lambda: a.budget * 60 - (time.monotonic() - start)  # noqa: E731

    if a.daily:
        daily_closes(a.dry_run, wait=False)
        return
    load_published()
    now = datetime.now(BERLIN)
    win = window(now)
    if a.once or win is None or now >= win[1] or (win[0] - now).total_seconds() > a.max_wait * 60:
        log("outside the session window: one update of every market, then exit")
        if fetch(ORDER):
            publish(a.dry_run)
        return
    if now < win[0]:
        daily_closes(a.dry_run, wait=False)
        if fetch(ORDER):  # the previous session for every page
            publish(a.dry_run)
        now = datetime.now(BERLIN)
        log(f"waiting for the open at {win[0]:%H:%M}")
        time.sleep(max(0, (win[0] - now).total_seconds()) + 60 * OFFSET_MIN)
    else:
        missing = [mid for mid in ORDER if mid not in PAYLOADS]
        if missing and fetch(missing):
            publish(a.dry_run)

    while True:
        now = datetime.now(BERLIN)
        if fetch([mid for mid in ORDER if in_session(mid, now)]):
            publish(a.dry_run)
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
