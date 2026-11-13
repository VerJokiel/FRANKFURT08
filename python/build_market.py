"""Fetch real end-of-day data for one of the European market pages (cac40.html, ibex35.html,
ftsemib.html, wig20.html, ftse100.html). The DAX page has its own script, build_dax40.py.

Writes data/markets/<id>.js (loaded by the page) and data/markets/<id>_prices.csv.

    pip install -r python/requirements.txt
    python python/build_market.py cac40              # one market, last 2 years
    python python/build_market.py all                # every market in python/markets.py

Sources (all free, no API key):
  - Daily closes of the members and the index: Yahoo Finance through yfinance (adjusted for
    dividends and splits), Stooq CSV as a fallback for any symbol Yahoo does not return.
  - Market capitalisation per member (yfinance fast_info), used as index weights with the index's
    single-name cap where it has one. The real indices use free-float caps, so weights are approximate.
  - Rates and currency: ECB Data Portal (euro rates, EU long-term yields, reference FX rates),
    Bank for International Settlements (central bank policy rates) and the Bank of England database.

Safeguards (same as build_dax40.py): keeps the published file when the index or more than
`max_missing` members fail; never replaces data with data ending earlier; carries over yesterday's
market caps and rates series when a download fails; writes nothing when only the build time would change;
drops today's unfinished session.
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

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from markets import MARKETS, ORDER  # noqa: E402

UA = {"User-Agent": "FRANKFURT08 dashboard data job (github.com/VerJokiel/FRANKFURT08)"}
OUT = ROOT / "data" / "markets"


def log(*a):
    print(*a, file=sys.stderr, flush=True)


class Kept(Exception):
    """Bad or incomplete download: the published file stays online."""


# ---------------------------------------------------------------- prices
def fetch_yahoo(m: dict, period: str) -> pd.DataFrame:
    import yfinance as yf  # noqa: PLC0415

    rename = {m["index_yf"]: "INDEX", **{ys: tk for tk, ys, *_ in m["members"]}}
    syms = list(rename)
    for attempt in range(3):
        try:
            raw = yf.download(syms, period=period, interval="1d", auto_adjust=True, progress=False, threads=True)
            close = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
            close = close.rename(columns=rename)
            close.index = pd.to_datetime(close.index).tz_localize(None).normalize()
            if close.notna().any().sum() > 0:
                return close
        except Exception as e:  # noqa: BLE001
            log(f"yahoo attempt {attempt + 1} failed: {e}")
        time.sleep(10 * (attempt + 1))
    return pd.DataFrame()


def hourly_closes(symbol: str, tz: str, period: str = "730d") -> pd.Series:
    """Daily closes rebuilt from Yahoo's hourly bars: the last bar of each local trading day.
    Used for indices whose daily history Yahoo does not carry (WIG20); the last hourly bar's
    close equals the official close (checked against members' daily closes)."""
    import yfinance as yf  # noqa: PLC0415

    for attempt in range(3):
        try:
            raw = yf.download(symbol, period=period, interval="1h", auto_adjust=False, progress=False)
            c = raw["Close"]
            c = (c.iloc[:, 0] if isinstance(c, pd.DataFrame) else c).dropna()
            if len(c):
                idx = pd.DatetimeIndex(c.index)
                c.index = (idx.tz_localize("UTC") if idx.tz is None else idx).tz_convert(tz)
                d = c.groupby(c.index.date).last()
                d.index = pd.to_datetime(d.index)
                return d.astype(float)
        except Exception as e:  # noqa: BLE001
            log(f"hourly {symbol} attempt {attempt + 1} failed: {e}")
        time.sleep(5 * (attempt + 1))
    return pd.Series(dtype=float)


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


def stooq_symbol(m: dict, tk: str) -> str:
    if tk == "INDEX":
        return m["index_stooq"]
    ys = next(x[1] for x in m["members"] if x[0] == tk)
    base, _, sfx = ys.rpartition(".")
    return f"{base.lower()}.{ {'PA': 'fr', 'AS': 'nl', 'MC': 'es', 'MI': 'it', 'WA': 'pl', 'L': 'uk'}.get(sfx, sfx.lower()) }".replace(" ", "")


def market_info(m: dict) -> tuple[dict[str, float], dict[str, str]]:
    """Market capitalisation (raw, in the quote currency) and quote currency per member."""
    import yfinance as yf  # noqa: PLC0415

    caps, ccy = {}, {}
    for tk, ys, *_ in m["members"]:
        try:
            fi = yf.Ticker(ys).fast_info
            v = fi.market_cap
            c = fi.currency
            if c:
                ccy[tk] = str(c)
            if v and np.isfinite(v) and v > 0:
                caps[tk] = float(v)
        except Exception as e:  # noqa: BLE001
            log(f"market cap {tk} failed: {e}")
        time.sleep(0.3)
    return caps, ccy


def capped_weights(raw: dict[str, float], cap: float | None) -> dict[str, float]:
    """Normalise to 1 and redistribute anything above the cap pro rata, as the index does."""
    w = pd.Series(raw, dtype=float)
    w /= w.sum()
    if cap:
        for _ in range(30):
            over = w > cap + 1e-12
            if not over.any():
                break
            excess = (w[over] - cap).sum()
            w[over] = cap
            w[~over] += excess * w[~over] / w[~over].sum()
    return w.to_dict()


# ---------------------------------------------------------------- rates and currency
def _ecb(flow: str, key: str, start: pd.Timestamp) -> pd.Series:
    url = f"https://data-api.ecb.europa.eu/service/data/{flow}/{key}?format=csvdata&startPeriod={start:%Y-%m-%d}"
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text))[["TIME_PERIOD", "OBS_VALUE"]].dropna()
    idx = pd.to_datetime(df["TIME_PERIOD"].astype(str))
    return pd.Series(df["OBS_VALUE"].astype(float).to_numpy(), index=idx).sort_index()


def _bis(area: str, start: pd.Timestamp) -> pd.Series:
    """BIS central bank policy rates (WS_CBPOL), daily."""
    urls = [f"https://stats.bis.org/api/v1/data/WS_CBPOL/D.{area}?startPeriod={start:%Y-%m-%d}&format=csv",
            f"https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.{area}?startPeriod={start:%Y-%m-%d}&format=csv"]
    last = None
    for url in urls:
        try:
            r = requests.get(url, headers=UA, timeout=30)
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text))
            cols = {c.upper(): c for c in df.columns}
            t, v = cols.get("TIME_PERIOD"), cols.get("OBS_VALUE")
            df = df[[t, v]].dropna()
            return pd.Series(df[v].astype(float).to_numpy(), index=pd.to_datetime(df[t].astype(str))).sort_index()
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"BIS {area}: {last}")


def _boe(code: str, start: pd.Timestamp) -> pd.Series:
    url = ("https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes"
           f"&Datefrom={start:%d/%b/%Y}&Dateto=now&SeriesCodes={code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N")
    r = requests.get(url, headers={**UA, "Accept": "text/csv,*/*"}, timeout=30)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text))
    df = df[[df.columns[0], code]].dropna()
    idx = pd.to_datetime(df[df.columns[0]], format="%d %b %Y", errors="coerce")
    s = pd.Series(pd.to_numeric(df[code], errors="coerce").to_numpy(), index=idx).dropna()
    if s.empty:
        raise RuntimeError(f"BoE {code}: no rows")
    return s[s.index.notna()].sort_index()


def fetch_macro(m: dict, start: pd.Timestamp) -> dict:
    series: dict[str, pd.Series] = {}
    src: dict[str, str] = {}
    for key, spec in m["macro"].items():
        kind = spec["kind"]
        try:
            if kind == "ecb":
                series[key], src[key] = _ecb(spec["flow"], spec["key"], start), f"ECB Data Portal, {spec['flow']}.{spec['key']}"
            elif kind == "bis":
                series[key], src[key] = _bis(spec["area"], start), f"BIS central bank policy rates, WS_CBPOL D.{spec['area']}"
            elif kind == "boe":
                try:
                    series[key], src[key] = _boe(spec["code"], start), f"Bank of England database, {spec['code']}"
                except Exception as e:  # noqa: BLE001
                    fb = spec.get("fallback")
                    if not fb:
                        raise
                    log(f"BoE {spec['code']} failed ({e}); using {fb}")
                    series[key], src[key] = _bis(fb["area"], start), f"BIS central bank policy rates, WS_CBPOL D.{fb['area']}"
        except Exception as e:  # noqa: BLE001
            log(f"rates/currency {m['id']}.{key} failed: {e}")
    for key, spec in m["macro"].items():  # derived series
        if spec["kind"] == "spread" and spec["a"] in series and spec["b"] in series:
            a, b = series[spec["a"]], series[spec["b"]]
            j = pd.concat([a, b], axis=1, join="inner").dropna()
            if len(j):
                series[key], src[key] = (j.iloc[:, 0] - j.iloc[:, 1]) * 100, f"{src[spec['a']]} minus {src[spec['b']]}"
        elif spec["kind"] == "ratio" and spec["b"] in series and (spec["a"] is None or spec["a"] in series):
            b = series[spec["b"]]
            if spec["a"] is None:
                series[key], src[key] = 1 / b, f"1 / {src[spec['b']]}"
            else:
                j = pd.concat([series[spec["a"]], b], axis=1, join="inner").dropna()
                series[key], src[key] = j.iloc[:, 0] / j.iloc[:, 1], f"{src[spec['a']]} / {src[spec['b']]}"
    out = {}
    for key, s in series.items():
        spec = m["macro"][key]
        if spec.get("hidden"):
            continue
        s = s[~s.index.duplicated(keep="last")].dropna()
        dec = 6 if spec["unit"] not in ("%", "bp") else (1 if spec["unit"] == "bp" else 4)
        out[key] = {"label": spec["label"], "unit": spec["unit"], "source": src[key], "chart": spec.get("chart"), "step": bool(spec.get("step")),
                    "role": spec.get("role"), "dates": [d.strftime("%Y-%m-%d") for d in s.index], "values": [round(float(v), dec) for v in s]}
    return out


# ---------------------------------------------------------------- build
def to_ccy(cap: float, ccy: str | None, base: str, fx: dict[str, float]) -> float:
    """Convert a market cap from the quote currency to the market's base currency (approximate)."""
    if not ccy:
        return cap
    if ccy in ("GBp", "GBX"):
        cap, ccy = cap / 100, "GBP"
    if ccy == base:
        return cap
    # fx: units of each currency per EUR
    if ccy in fx and base in fx:
        return cap / fx[ccy] * fx[base]
    return cap


def build(m: dict, close: pd.DataFrame, caps: dict[str, float], ccy: dict[str, str], macro: dict, sources: dict[str, str]) -> dict:
    if "INDEX" not in close or close["INDEX"].notna().sum() < 260:
        raise Kept(f"{m['name']} index history missing or too short; keeping the existing data file.")
    close = close.sort_index()
    close = close[close["INDEX"].notna()]
    last = close.index[-1]
    tks = [x[0] for x in m["members"]]
    missing = []
    for tk in tks:
        s = close.get(tk)
        # recently listed members (e.g. Metlen in London since August 2025) count if they have a full year of closes
        if (s is None or (s.notna().mean() < 0.9 and s.notna().sum() < 260)
                or pd.isna(s.loc[last - pd.Timedelta(days=7):].last_valid_index())):
            missing.append(tk)
    if len(missing) > m["max_missing"]:
        raise Kept(f"{len(missing)} members missing ({', '.join(missing)}); keeping the existing data file.")
    have = [t for t in tks if t not in missing]
    px = close[have].ffill().bfill()   # before a late listing the first close is carried back (flat, zero returns)
    since = {t: close[t].first_valid_index() for t in have}

    fallback = {x[0]: x[4] for x in m["members"]}
    use_caps = {t: caps[t] for t in have if t in caps}  # already in the base currency
    cap_txt = f"{int(m['cap'] * 100)}% cap" if m["cap"] else "no cap"
    if len(use_caps) >= len(have) - 2:
        known = sum(use_caps.values())
        for t in have:
            use_caps.setdefault(t, known * fallback[t] / sum(fallback[x] for x in use_caps))
        weights, wsrc = capped_weights(use_caps, m["cap"]), f"market capitalisation (yfinance), {cap_txt}"
    else:
        weights, wsrc = capped_weights({t: fallback[t] for t in have}, m["cap"]), "static approximation (market caps unavailable)"

    meta = {x[0]: x for x in m["members"]}
    members = [{"tk": t, "name": meta[t][2], "sector": meta[t][3], "weight": round(weights[t], 5),
                "cap": round(use_caps[t] / 1e9, 2) if t in caps else None, "ccy": ccy.get(t),
                **({"since": since[t].strftime("%Y-%m-%d")} if since[t] > close.index[0] + pd.Timedelta(days=10) else {})} for t in have]
    sectors = list(dict.fromkeys(x[3] for x in m["members"]))
    return {
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "asof": last.strftime("%Y-%m-%d"),
        "market": m["id"],
        "sources": sources,
        "weights": wsrc,
        "sectors": sectors,
        "members": members,
        "missing": [{"tk": t, "name": meta[t][2]} for t in missing],
        "dates": [d.strftime("%Y-%m-%d") for d in px.index],
        "index": [round(float(v), 2) for v in close["INDEX"]],
        "columns": have,
        "rows": [[round(float(v), 4) for v in row] for row in px.to_numpy()],
        "macro": macro,
    }


def data_path(mid: str) -> Path:
    return OUT / f"{mid}.js"


def published(mid: str) -> dict:
    try:
        s = data_path(mid).read_text(encoding="utf-8")
        return json.loads(s[s.index("{"):s.rindex("}") + 1])
    except (OSError, ValueError):
        return {}


def carry_over_macro(macro: dict, old: dict) -> tuple[dict, list[str]]:
    kept = []
    for k, prev in (old.get("macro") or {}).items():
        new = macro.get(k)
        if not new or not new.get("dates") or new["dates"][-1] < prev["dates"][-1]:
            macro[k] = prev
            kept.append(k)
    return macro, kept


def carry_over_caps(caps: dict[str, float], ccy: dict[str, str], old: dict) -> tuple[dict, dict, list[str]]:
    """Fill members whose market cap did not download with yesterday's value (both in the base currency),
    and their quote currency if that did not come back either."""
    kept = []
    for x in old.get("members") or []:
        if x.get("ccy") and x["tk"] not in ccy:
            ccy[x["tk"]] = x["ccy"]
        if x["tk"] not in caps and x.get("cap"):
            caps[x["tk"]] = x["cap"] * 1e9
            kept.append(x["tk"])
    return caps, ccy, kept


def write(mid: str, payload: dict, close_csv: pd.DataFrame) -> bool:
    prev = published(mid)
    old = prev.get("asof")
    if old and payload["asof"] < old:
        raise Kept(f"Fetched data ends {payload['asof']}, published data ends {old}; keeping the published file.")
    strip = lambda d: {k: v for k, v in d.items() if k != "built"}  # noqa: E731
    if prev and strip(json.loads(json.dumps(payload))) == strip(prev):
        log(f"{mid}: no new data (closes, market caps and rates unchanged); nothing written")
        return False
    OUT.mkdir(parents=True, exist_ok=True)
    js = (f"// {MARKETS[mid]['name']} market page data. Generated by python/build_market.py, do not edit by hand.\n"
          f"window.MKT = {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))};\n")
    data_path(mid).write_text(js, encoding="utf-8")
    close_csv.round(4).rename_axis("date").to_csv(OUT / f"{mid}_prices.csv")
    log(f"wrote data/markets/{mid}.js: {len(payload['dates'])} days to {payload['asof']}, {len(payload['columns'])} members, "
        f"missing: {[x['tk'] for x in payload['missing']] or 'none'}, rates/currency: {list(payload['macro'])}")
    return True


def fx_per_eur(macro_all: dict) -> dict[str, float]:
    """Latest units per EUR, for converting market caps quoted in another currency."""
    out = {"EUR": 1.0}
    for k, cc in (("eurusd", "USD"), ("eurpln", "PLN"), ("eurgbp", "GBP")):
        if k in macro_all and macro_all[k]["values"]:
            out[cc] = macro_all[k]["values"][-1]
    return out


def run(mid: str, period: str) -> bool:
    m = MARKETS[mid]
    close = fetch_yahoo(m, period)
    sources = {"prices": "Yahoo Finance via yfinance"}
    years = int(period.rstrip("y")) if period.endswith("y") else 2
    start = pd.Timestamp.today().normalize() - pd.DateOffset(years=years, days=7)
    want = ["INDEX"] + [x[0] for x in m["members"]]
    gaps = [t for t in want if t not in close or close[t].notna().sum() < 50]
    if gaps:
        log(f"{mid}: filling from Stooq:", ", ".join(gaps))
        for t in gaps:
            s = fetch_stooq(stooq_symbol(m, t), start)
            if s is not None and len(s) >= 50:
                close = close.reindex(close.index.union(s.index)) if len(close) else pd.DataFrame(index=s.index)
                close[t] = s
                sources.setdefault("fallback", "Stooq CSV")
    if len(close) and ("INDEX" not in close or close["INDEX"].notna().sum() < 260):
        # Yahoo carries no daily history for some indices (WIG20): rebuild it from hourly bars
        h = hourly_closes(m["index_yf"], m["tz"])
        if len(h) >= 260:
            log(f"{mid}: index closes rebuilt from hourly bars ({len(h)} days)")
            close["INDEX"] = h.reindex(close.index)
            sources["index"] = "index closes from Yahoo hourly bars (last bar of each day)"
    if not len(close):
        raise Kept(f"No {m['name']} price data from Yahoo or Stooq; keeping the existing data file.")
    now = pd.Timestamp.now(tz=m["tz"])
    close = close.sort_index()
    hh, mm = map(int, m["close"].split(":"))
    ready = dtime(hh + (1 if mm + 15 >= 60 else 0), (mm + 15) % 60)
    if close.index[-1].date() == now.date() and now.time() < ready:
        log(f"{mid}: dropping unfinished session {now.date()} (run at {now:%H:%M} local time)")
        close = close.iloc[:-1]

    old = published(mid)
    # FX for cap conversion needs the euro reference rates, fetched with the market's own series
    macro_full = fetch_macro({**m, "macro": {**m["macro"], **{k: {**v, "hidden": False} for k, v in m["macro"].items() if v.get("hidden")}}}, start)
    fx = fx_per_eur(macro_full)
    macro = {k: v for k, v in macro_full.items() if not m["macro"][k].get("hidden")}
    raw_caps, ccy = market_info(m)
    caps = {t: to_ccy(v, ccy.get(t), m["currency"], fx) for t, v in raw_caps.items()}
    caps, ccy, caps_kept = carry_over_caps(caps, ccy, old)
    macro, macro_kept = carry_over_macro(macro, old)
    if caps_kept:
        log(f"{mid}: market caps carried over:", ", ".join(caps_kept))
    if macro_kept:
        log(f"{mid}: rates/currency carried over:", ", ".join(macro_kept))
    payload = build(m, close, caps, ccy, macro, sources)
    payload["carried_over"] = {"caps": caps_kept, "macro": macro_kept}
    keep = ["INDEX"] + payload["columns"]
    return write(mid, payload, close.loc[close["INDEX"].notna(), keep])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("market", help="market id (" + ", ".join(ORDER) + ") or 'all'")
    ap.add_argument("--period", default="2y", help="history length, e.g. 2y or 3y")
    a = ap.parse_args()
    ids = ORDER if a.market == "all" else [a.market]
    for mid in ids:
        try:
            run(mid, a.period)
        except Kept as e:
            # bad or incomplete download, published file kept: a warning on the Actions run, not a failure
            print(f"::warning title={MARKETS[mid]['name']} data kept::{e}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"::warning title={MARKETS[mid]['name']} data kept::unexpected error {e!r}", flush=True)


if __name__ == "__main__":
    main()
