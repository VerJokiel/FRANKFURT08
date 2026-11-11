"""Fetch intraday 5-minute bars for the DAX market page (dax.html).

Writes live.json: the last five sessions of 5-minute closes for the DAX index and its
40 members, plus each symbol's previous session close. The GitHub Actions workflow
.github/workflows/live-dax40.yml runs this every 5 minutes during Xetra hours and
publishes the file to the `live-data` branch, where the page polls it.

    pip install -r python/requirements.txt
    python python/build_live.py --out live.json --previous old.json

Source: Yahoo Finance via the open-source yfinance library. Yahoo delays Xetra quotes by
about 15 minutes; free sources do not carry real-time Xetra prices.

When --previous points at the last published file and no bar has changed, nothing is
written and `changed=false` goes to $GITHUB_OUTPUT, so the workflow skips the push.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dax40 import MEMBERS  # noqa: E402  (single source for the member list)

INDEX = "^GDAXI"
BERLIN = "Europe/Berlin"


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def download(symbols: list[str], **kw) -> pd.DataFrame:
    import yfinance as yf  # noqa: PLC0415

    for attempt in range(3):
        try:
            raw = yf.download(symbols, progress=False, threads=True, auto_adjust=False, **kw)
            close = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
            if close.notna().any().sum():
                return close
        except Exception as e:  # noqa: BLE001
            log(f"download attempt {attempt + 1} failed: {e}")
        time.sleep(5 * (attempt + 1))
    return pd.DataFrame()


def short(sym: str) -> str:
    return "DAX" if sym == INDEX else sym.removesuffix(".DE")


def build() -> dict:
    syms = [INDEX] + [m[0] + ".DE" for m in MEMBERS]
    bars = download(syms, period="5d", interval="5m", prepost=False)
    if bars.empty or INDEX not in bars or bars[INDEX].notna().sum() < 10:
        raise SystemExit("No intraday DAX bars returned; keeping the published file.")
    idx = pd.DatetimeIndex(bars.index)
    idx = idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")
    bars.index = idx
    bars = bars.rename(columns=short).sort_index()
    bars = bars[bars["DAX"].notna() | (bars.notna().sum(axis=1) > 20)]

    local_day = bars.index.tz_convert(BERLIN).date
    sessions = sorted(set(local_day))
    last_session = sessions[-1]

    daily = download(syms, period="15d", interval="1d").rename(columns=short)
    daily.index = pd.DatetimeIndex(daily.index).tz_localize(None).normalize()
    before = daily[daily.index.date < last_session]
    if before.empty:
        raise SystemExit("No previous daily close; keeping the published file.")
    prev = before.ffill().iloc[-1]
    prev_date = before.index[-1].strftime("%Y-%m-%d")

    cols = ["DAX"] + [m[0] for m in MEMBERS]
    close = {}
    missing = []
    for c in cols:
        s = bars[c] if c in bars else pd.Series(dtype=float)
        if s.notna().sum() < 10 or pd.isna(prev.get(c)):
            missing.append(c)
            continue
        close[c] = [None if pd.isna(v) else round(float(v), 4) for v in s.reindex(bars.index)]
    if "DAX" in missing:
        raise SystemExit("DAX index bars missing; keeping the published file.")

    now = pd.Timestamp.now(tz=BERLIN)
    open_now = now.weekday() < 5 and now.date() == last_session and (9, 0) <= (now.hour, now.minute) < (17, 35)
    return {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Yahoo Finance via yfinance, 5-minute bars, Xetra quotes delayed about 15 minutes",
        "interval_min": 5,
        "session": last_session.isoformat(),
        "prev_date": prev_date,
        "market_open": bool(open_now),
        "times": [int(t.timestamp()) for t in bars.index],
        "symbols": list(close),
        "close": close,
        "prev_close": {c: round(float(prev[c]), 4) for c in close},
        "missing": missing,
    }


def fingerprint(p: dict) -> str:
    return json.dumps([p["times"], p["close"], p["prev_close"]], separators=(",", ":"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="live.json")
    ap.add_argument("--previous", help="last published live.json, to skip unchanged data")
    a = ap.parse_args()

    payload = build()
    changed = True
    if a.previous and Path(a.previous).is_file():
        try:
            changed = fingerprint(json.loads(Path(a.previous).read_text())) != fingerprint(payload)
        except (ValueError, KeyError):
            changed = True
    if changed:
        Path(a.out).write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        last = datetime.fromtimestamp(payload["times"][-1], tz=timezone.utc)
        log(f"wrote {a.out}: {len(payload['times'])} bars, last {last:%Y-%m-%d %H:%M} UTC, "
            f"{len(payload['symbols'])} symbols, missing {payload['missing'] or 'none'}")
    else:
        log("no new bars; nothing written")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")


if __name__ == "__main__":
    main()
