"""One-off check of every ticker and data source for the market pages (temporary, run in Actions)."""
from __future__ import annotations

import io
import json
import sys
import time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from markets import MARKETS, ORDER  # noqa: E402

UA = {"User-Agent": "FRANKFURT08 dashboard data job (github.com/VerJokiel/FRANKFURT08)"}
EXTRA = {  # alternative symbols to try for uncertain names
    "wig20": {"SPL": ["SPL.WA", "EBP.WA", "ERSTE.WA"], "CCC": ["CCC.WA", "MDV.WA", "MOD.WA", "MODIVO.WA"], "INDEX": ["WIG20.WA", "^WIG20", "WIG20TR.WA"]},
    "ftse100": {"BGEO": ["BGEO.L", "LION.L", "LIFG.L"], "SDLF": ["SDLF.L", "SDL.L", "PHNX.L", "SL.L", "STDL.L"], "CCEP": ["CCEP.L", "CCEP"],
                "PSH": ["PSH.L", "PSHD.L"], "INDEX": ["^FTSE"]},
    "ftsemib": {"SPM": ["SPM.MI", "S7.MI", "SPM7.MI"], "LTMC": ["LTMC.MI", "LTMC"], "INDEX": ["FTSEMIB.MI", "^FTSEMIB"], "MB": ["MB.MI"]},
    "cac40": {"MT": ["MT.AS", "MT.PA"], "INDEX": ["^FCHI"]},
    "ibex35": {"INDEX": ["^IBEX"]},
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def main() -> None:
    import yfinance as yf

    report = {"yfinance": yf.__version__, "markets": {}, "sources": {}}
    for mid in ORDER:
        m = MARKETS[mid]
        ex = EXTRA.get(mid, {})
        syms = {tk: ex.get(tk, [ys]) for tk, ys, *_ in m["members"]}
        syms["INDEX"] = ex.get("INDEX", [m["index_yf"]])
        flat = sorted({s for v in syms.values() for s in v})
        d = yf.download(flat, period="1mo", interval="1d", auto_adjust=True, progress=False, threads=True)
        close = d["Close"] if isinstance(d.columns, pd.MultiIndex) else d
        res = {}
        for tk, cands in syms.items():
            res[tk] = {}
            for s in cands:
                c = close[s].dropna() if s in close else pd.Series(dtype=float)
                res[tk][s] = {"n": int(len(c)), "last": None if c.empty else round(float(c.iloc[-1]), 4),
                              "last_date": None if c.empty else str(c.index[-1].date())}
        bars = yf.download([syms["INDEX"][0]] + [m["members"][0][1], m["members"][1][1]], period="5d", interval="5m", progress=False)
        bc = bars["Close"] if isinstance(bars.columns, pd.MultiIndex) else bars
        intraday = {s: {"n": int(bc[s].notna().sum()), "first": str(bc[s].dropna().index[0]) if bc[s].notna().any() else None,
                        "last": str(bc[s].dropna().index[-1]) if bc[s].notna().any() else None} for s in bc.columns}
        info = {}
        for tk, ys, *_ in m["members"][:3] + m["members"][-2:]:
            try:
                fi = yf.Ticker(ys).fast_info
                info[ys] = {"currency": fi.currency, "cap": fi.market_cap, "last": fi.last_price}
            except Exception as e:  # noqa: BLE001
                info[ys] = {"error": repr(e)[:200]}
            time.sleep(0.3)
        report["markets"][mid] = {"daily": res, "intraday": intraday, "fast_info": info,
                                  "missing": [tk for tk, v in res.items() if not any(x["n"] for x in v.values())]}
        log(mid, "missing:", report["markets"][mid]["missing"])

    def get(name, url):
        try:
            r = requests.get(url, headers=UA, timeout=30)
            report["sources"][name] = {"url": url, "status": r.status_code, "len": len(r.text), "head": r.text[:300], "tail": r.text[-300:]}
        except Exception as e:  # noqa: BLE001
            report["sources"][name] = {"url": url, "error": repr(e)[:300]}

    ecb = "https://data-api.ecb.europa.eu/service/data/{}/{}?format=csvdata&startPeriod=2026-01-01"
    for name, (flow, key) in {"irs_fr": ("IRS", "M.FR.L.L40.CI.0000.EUR.N.Z"), "irs_pl": ("IRS", "M.PL.L.L40.CI.0000.PLN.N.Z"),
                              "irs_de": ("IRS", "M.DE.L.L40.CI.0000.EUR.N.Z"), "exr_pln": ("EXR", "D.PLN.EUR.SP00.A"),
                              "exr_gbp": ("EXR", "D.GBP.EUR.SP00.A")}.items():
        get(name, ecb.format(flow, key))
    get("bis_v1_pl", "https://stats.bis.org/api/v1/data/WS_CBPOL/D.PL?startPeriod=2026-01-01&format=csv")
    get("bis_v2_pl", "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.PL?startPeriod=2026-01-01&format=csv")
    get("bis_v1_gb", "https://stats.bis.org/api/v1/data/WS_CBPOL/D.GB?startPeriod=2026-01-01&format=csv")
    get("boe", "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Oct/2026&Dateto=now"
               "&SeriesCodes=IUDBEDR,IUDMNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N")
    for s in ["10fry.b", "10ity.b", "10esy.b", "10dey.b", "10ply.b", "10uky.b"]:
        get("stooq_" + s, f"https://stooq.com/q/d/l/?s={s}&i=d&d1=20261001")
    Path("probe.json").write_text(json.dumps(report, indent=1, default=str))
    print(json.dumps(report, default=str))


if __name__ == "__main__":
    main()
