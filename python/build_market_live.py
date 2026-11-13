"""Fetch intraday 5-minute bars for the European market pages.

build(market_id) returns the live payload for one market: the last five sessions of 5-minute
closes for the index and its members plus each symbol's previous session close. The same layout
as live.json for the DAX page (python/build_live.py), with the index under the key "INDEX".
python/markets_loop.py calls it every 5 minutes during the session and publishes one file per
market (<id>.json) to the `live-markets` branch, where the pages poll it.

    python python/build_market_live.py cac40 --out cac40.json     # one fetch, for testing

Source: Yahoo Finance via yfinance; exchange quotes delayed about 15 minutes.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from markets import MARKETS  # noqa: E402


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


_prev_cache: dict[tuple[str, str], tuple[pd.Series, str]] = {}


def previous_close(m: dict, rename: dict, session) -> tuple[pd.Series, str]:
    """Each symbol's last daily close before `session`, cached per market and session (one daily download a day)."""
    key = (m["id"], session.isoformat())
    if key not in _prev_cache:
        daily = download(list(rename), period="15d", interval="1d").rename(columns=rename)
        daily.index = pd.DatetimeIndex(daily.index).tz_localize(None).normalize()
        before = daily[daily.index.date < session]
        if before.empty:
            raise SystemExit(f"{m['name']}: no previous daily close; keeping the published file.")
        prev = before.ffill().iloc[-1]
        prev_date = before.index[-1].strftime("%Y-%m-%d")
        if pd.isna(prev.get("INDEX")):
            # no daily history for this index on Yahoo (WIG20): previous close = last hourly bar of the previous session
            h = download([m["index_yf"]], period="15d", interval="1h")
            if not h.empty:
                c = (h[m["index_yf"]] if m["index_yf"] in h else h.iloc[:, 0]).dropna()
                ix = pd.DatetimeIndex(c.index)
                c.index = (ix.tz_localize("UTC") if ix.tz is None else ix).tz_convert(m["tz"])
                c = c[c.index.date < session]
                if len(c):
                    prev["INDEX"] = float(c.iloc[-1])
                    hd = c.index[-1].strftime("%Y-%m-%d")
                    if hd != prev_date:
                        log(f"{m['name']}: previous session from hourly bars {hd} differs from members' {prev_date}")
        # do not cache an incomplete answer: a later fetch may fill the gaps
        if prev.notna().sum() >= len(rename) - 2:
            _prev_cache[key] = (prev, prev_date)
        return prev, prev_date
    return _prev_cache[key]


def build(mid: str) -> dict:
    m = MARKETS[mid]
    rename = {m["index_yf"]: "INDEX", **{ys: tk for tk, ys, *_ in m["members"]}}
    bars = download(list(rename), period="5d", interval="5m", prepost=False)
    if bars.empty or m["index_yf"] not in bars or bars[m["index_yf"]].notna().sum() < 10:
        raise SystemExit(f"No intraday {m['name']} bars returned; keeping the published file.")
    idx = pd.DatetimeIndex(bars.index)
    bars.index = idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")
    bars = bars.rename(columns=rename).sort_index()
    bars = bars[bars["INDEX"].notna() | (bars.notna().sum(axis=1) > len(rename) // 2)]

    local_day = bars.index.tz_convert(m["tz"]).date
    last_session = sorted(set(local_day))[-1]
    prev, prev_date = previous_close(m, rename, last_session)

    cols = ["INDEX"] + [x[0] for x in m["members"]]
    close, missing = {}, []
    for c in cols:
        s = bars[c] if c in bars else pd.Series(dtype=float)
        if s.notna().sum() < 10 or pd.isna(prev.get(c)):
            missing.append(c)
            continue
        close[c] = [None if pd.isna(v) else round(float(v), 4) for v in s.reindex(bars.index)]
    if "INDEX" in missing:
        raise SystemExit(f"{m['name']} index bars missing; keeping the published file.")

    now = pd.Timestamp.now(tz=m["tz"])
    oh, om = map(int, m["open"].split(":"))
    ch, cm = map(int, m["close"].split(":"))
    open_now = (now.weekday() < 5 and now.date() == last_session and now.strftime("%Y-%m-%d") not in m["holidays"]
                and (oh, om) <= (now.hour, now.minute) < (ch, cm + 5))
    return {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "market": mid,
        "source": f"Yahoo Finance via yfinance, 5-minute bars, {m['exchange']} quotes delayed about 15 minutes",
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
    ap.add_argument("market")
    ap.add_argument("--out")
    a = ap.parse_args()
    p = build(a.market)
    out = a.out or f"{a.market}.json"
    Path(out).write_text(json.dumps(p, separators=(",", ":")), encoding="utf-8")
    log(f"wrote {out}: {len(p['times'])} bars, {len(p['symbols'])} symbols, missing {p['missing'] or 'none'}")


if __name__ == "__main__":
    main()
