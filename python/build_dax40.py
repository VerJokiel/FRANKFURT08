"""Fetch real market data for the DAX market page (dax.html).

Writes data/dax40.js (loaded by the page) and data/dax40_prices.csv (same closes as CSV).
Runs daily in GitHub Actions after the Xetra close (.github/workflows/update-dax40.yml),
and can be run by hand:

    pip install yfinance pandas numpy requests
    python python/build_dax40.py            # last 2 years
    python python/build_dax40.py --period 3y

Sources (all free, no API key):
  - Daily closes of the 40 DAX members (Xetra, EUR) and the DAX index (^GDAXI):
    Yahoo Finance through the open-source yfinance library; Stooq CSV as a fallback
    for any symbol Yahoo does not return.
  - Market capitalisation per member (yfinance fast_info), used as index weights:
    full market cap with the DAX's 15% single-name cap applied. The real index uses
    free-float caps, so weights are approximate.
  - ECB Data Portal (data-api.ecb.europa.eu): deposit facility rate, 10-year euro area
    AAA government bond yield, EUR/USD reference rate.

The script refuses to overwrite the data file when the DAX index or more than four
members are missing, so a bad fetch keeps the last good data online.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import time
from datetime import datetime, timezone
from datetime import time as dtime
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
UA = {"User-Agent": "FRANKFURT08 dashboard data job (github.com/VerJokiel/FRANKFURT08)"}

# ticker (Xetra), name, sector, fallback weight % (used only if no market cap comes back).
# Members as of the 30 Oct 2026 index list; update after each review (Mar, Jun, Sep, Dec).
MEMBERS = [
    ("SAP", "SAP", "Tech", 12.5), ("SIE", "Siemens", "Industrials", 10.0), ("ALV", "Allianz", "Financials", 8.0),
    ("DTE", "Deutsche Telekom", "Telecom & Real estate", 6.5), ("AIR", "Airbus", "Industrials", 6.0),
    ("ENR", "Siemens Energy", "Utilities & Energy", 5.0), ("RHM", "Rheinmetall", "Industrials", 4.0),
    ("MUV2", "Munich Re", "Financials", 3.5), ("IFX", "Infineon", "Tech", 3.0), ("DBK", "Deutsche Bank", "Financials", 3.0),
    ("DB1", "Deutsche Börse", "Financials", 2.4), ("DHL", "DHL Group", "Industrials", 2.2), ("MBG", "Mercedes-Benz", "Autos", 2.2),
    ("BAS", "BASF", "Materials", 2.2), ("EOAN", "E.ON", "Utilities & Energy", 2.0), ("CBK", "Commerzbank", "Financials", 2.0),
    ("BMW", "BMW", "Autos", 1.6), ("RWE", "RWE", "Utilities & Energy", 1.5), ("SHL", "Siemens Healthineers", "Healthcare", 1.5),
    ("HEI", "Heidelberg Materials", "Materials", 1.4), ("VNA", "Vonovia", "Telecom & Real estate", 1.3),
    ("MTX", "MTU Aero Engines", "Industrials", 1.3), ("BAYN", "Bayer", "Healthcare", 1.3), ("ADS", "adidas", "Consumer", 1.2),
    ("HNR1", "Hannover Rück", "Financials", 1.2), ("DTG", "Daimler Truck", "Autos", 1.1), ("FRE", "Fresenius", "Healthcare", 1.0),
    ("VOW3", "Volkswagen Vz", "Autos", .9), ("HOT", "Hochtief", "Industrials", .9), ("MRK", "Merck KGaA", "Healthcare", .8),
    ("HEN3", "Henkel Vz", "Consumer", .8), ("BEI", "Beiersdorf", "Consumer", .6), ("FME", "Fresenius Medical Care", "Healthcare", .6),
    ("CON", "Continental", "Autos", .6), ("G1A", "GEA Group", "Industrials", .6), ("SY1", "Symrise", "Materials", .5),
    ("QIA", "Qiagen", "Healthcare", .5), ("G24", "Scout24", "Tech", .5), ("BNR", "Brenntag", "Materials", .4),
    ("ZAL", "Zalando", "Consumer", .4),
]
SECTORS = ["Financials", "Industrials", "Utilities & Energy", "Tech", "Autos", "Materials", "Healthcare", "Consumer", "Telecom & Real estate"]
INDEX_YF, INDEX_STOOQ = "^GDAXI", "^dax"
MAX_MISSING = 4
CAP = 0.15

ECB = {  # key: (dataflow, series key, label, unit)
    "dfr": ("FM", "D.U2.EUR.4F.KR.DFR.LEV", "ECB deposit facility rate", "%"),
    "y10": ("YC", "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y", "10-year euro area AAA yield", "%"),
    "eurusd": ("EXR", "D.USD.EUR.SP00.A", "EUR/USD reference rate", "USD"),
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- prices
def fetch_yahoo(period: str) -> pd.DataFrame:
    import yfinance as yf  # noqa: PLC0415

    syms = [INDEX_YF] + [m[0] + ".DE" for m in MEMBERS]
    for attempt in range(3):
        try:
            raw = yf.download(syms, period=period, interval="1d", auto_adjust=True, progress=False, threads=True)
            close = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
            close = close.rename(columns=lambda c: "DAX" if c == INDEX_YF else c.removesuffix(".DE"))
            close.index = pd.to_datetime(close.index).tz_localize(None).normalize()
            if close.notna().any().sum() > 0:
                return close
        except Exception as e:  # noqa: BLE001
            log(f"yahoo attempt {attempt + 1} failed: {e}")
        time.sleep(10 * (attempt + 1))
    return pd.DataFrame()


def fetch_stooq(symbol: str, start: pd.Timestamp) -> pd.Series | None:
    url = f"https://stooq.com/q/d/l/?s={symbol}&i=d&d1={start:%Y%m%d}"
    try:
        r = requests.get(url, headers=UA, timeout=20)
        r.raise_for_status()
        df = pd.read_csv(io.StringIO(r.text))
        if "Close" not in df or df.empty:
            return None
        return df.set_index(pd.to_datetime(df["Date"]))["Close"].astype(float)
    except Exception as e:  # noqa: BLE001
        log(f"stooq {symbol} failed: {e}")
        return None


def market_caps() -> dict[str, float]:
    import yfinance as yf  # noqa: PLC0415

    caps = {}
    for tk, *_ in MEMBERS:
        try:
            v = yf.Ticker(tk + ".DE").fast_info.market_cap
            if v and np.isfinite(v) and v > 0:
                caps[tk] = float(v)
        except Exception as e:  # noqa: BLE001
            log(f"market cap {tk} failed: {e}")
        time.sleep(0.3)
    return caps


def capped_weights(raw: dict[str, float], cap: float = CAP) -> dict[str, float]:
    """Normalise to 1 and redistribute anything above the cap pro rata, as the index does."""
    w = pd.Series(raw, dtype=float)
    w /= w.sum()
    for _ in range(20):
        over = w > cap + 1e-12
        if not over.any():
            break
        excess = (w[over] - cap).sum()
        w[over] = cap
        w[~over] += excess * w[~over] / w[~over].sum()
    return w.to_dict()


# ---------------------------------------------------------------- ECB
def fetch_ecb(start: pd.Timestamp) -> dict:
    out = {}
    for key, (flow, series, label, unit) in ECB.items():
        url = f"https://data-api.ecb.europa.eu/service/data/{flow}/{series}?format=csvdata&startPeriod={start:%Y-%m-%d}"
        try:
            r = requests.get(url, headers=UA, timeout=30)
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text))[["TIME_PERIOD", "OBS_VALUE"]].dropna()
            df = df.sort_values("TIME_PERIOD")
            out[key] = {"label": label, "unit": unit, "source": f"ECB Data Portal, {flow}.{series}",
                        "dates": df["TIME_PERIOD"].astype(str).tolist(), "values": [round(float(v), 4) for v in df["OBS_VALUE"]]}
        except Exception as e:  # noqa: BLE001
            log(f"ECB {key} failed: {e}")
    return out


# ---------------------------------------------------------------- build
def build(close: pd.DataFrame, caps: dict[str, float], macro: dict, sources: dict[str, str]) -> dict:
    if "DAX" not in close or close["DAX"].notna().sum() < 260:
        raise SystemExit("DAX index history missing or too short; keeping the existing data file.")
    close = close.sort_index()
    close = close[close["DAX"].notna()]                       # index trading days only
    last = close.index[-1]
    tks = [m[0] for m in MEMBERS]
    missing = []
    for tk in tks:
        s = close.get(tk)
        if s is None or s.notna().mean() < 0.9 or pd.isna(s.loc[last - pd.Timedelta(days=7):].last_valid_index()):
            missing.append(tk)
    if len(missing) > MAX_MISSING:
        raise SystemExit(f"{len(missing)} members missing ({', '.join(missing)}); keeping the existing data file.")
    have = [t for t in tks if t not in missing]
    # coverage is at least 90%; carry the last close over holidays and short gaps
    px = close[have].ffill().bfill()

    fallback = {m[0]: m[3] for m in MEMBERS}
    use_caps = {t: caps[t] for t in have if t in caps}
    if len(use_caps) >= len(have) - 2:
        # members without a cap get their fallback share of the known total
        known = sum(use_caps.values())
        for t in have:
            use_caps.setdefault(t, known * fallback[t] / sum(fallback[x] for x in use_caps))
        weights, wsrc = capped_weights(use_caps), "market capitalisation (yfinance), 15% cap"
    else:
        weights, wsrc = capped_weights({t: fallback[t] for t in have}), "static approximation (market caps unavailable)"

    meta = {m[0]: m for m in MEMBERS}
    members = [{"tk": t, "name": meta[t][1], "sector": meta[t][2], "weight": round(weights[t], 5),
                "cap": round(caps[t] / 1e9, 2) if t in caps else None} for t in have]
    return {
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "asof": last.strftime("%Y-%m-%d"),
        "sources": sources,
        "weights": wsrc,
        "sectors": SECTORS,
        "members": members,
        "missing": [{"tk": t, "name": meta[t][1]} for t in missing],
        "dates": [d.strftime("%Y-%m-%d") for d in px.index],
        "dax": [round(float(v), 2) for v in close["DAX"]],
        "columns": have,
        "rows": [[round(float(v), 4) for v in row] for row in px.to_numpy()],
        "macro": macro,
    }


def write(payload: dict, close_csv: pd.DataFrame) -> None:
    js = ("// DAX market page data. Generated by python/build_dax40.py, do not edit by hand.\n"
          f"window.DAX40 = {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))};\n")
    (ROOT / "data" / "dax40.js").write_text(js, encoding="utf-8")
    close_csv.round(4).rename_axis("date").to_csv(ROOT / "data" / "dax40_prices.csv")
    log(f"wrote data/dax40.js: {len(payload['dates'])} days to {payload['asof']}, "
        f"{len(payload['columns'])} members, missing: {[m['tk'] for m in payload['missing']] or 'none'}, "
        f"macro: {list(payload['macro'])}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--period", default="2y", help="history length, e.g. 2y or 3y")
    a = ap.parse_args()

    close = fetch_yahoo(a.period)
    sources = {"prices": "Yahoo Finance via yfinance"}
    years = int(a.period.rstrip("y")) if a.period.endswith("y") else 2
    start = pd.Timestamp.today().normalize() - pd.DateOffset(years=years, days=7)
    want = ["DAX"] + [m[0] for m in MEMBERS]
    gaps = [t for t in want if t not in close or close[t].notna().sum() < 50]
    if gaps:
        log("filling from Stooq:", ", ".join(gaps))
        for t in gaps:
            s = fetch_stooq(INDEX_STOOQ if t == "DAX" else t.lower() + ".de", start)
            if s is not None and len(s) >= 50:
                close = close.reindex(close.index.union(s.index)) if len(close) else pd.DataFrame(index=s.index)
                close[t] = s
                sources.setdefault("fallback", "Stooq CSV")
    if not len(close):
        raise SystemExit("No price data from Yahoo or Stooq; keeping the existing data file.")
    # a run during trading hours returns today's running price; keep only finished sessions
    now = pd.Timestamp.now(tz="Europe/Berlin")
    close = close.sort_index()
    if close.index[-1].date() == now.date() and now.time() < dtime(17, 45):
        log(f"dropping unfinished session {now.date()} (run at {now:%H:%M} Frankfurt time)")
        close = close.iloc[:-1]

    caps = market_caps()
    macro = fetch_ecb(start)
    payload = build(close, caps, macro, sources)
    keep = ["DAX"] + payload["columns"]
    write(payload, close.loc[close["DAX"].notna(), keep])


if __name__ == "__main__":
    main()
