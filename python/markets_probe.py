"""One-off check of WIG20 index history sources (temporary, run in Actions)."""
import json
import pandas as pd
import requests
import yfinance as yf

out = {}
for s in ["WIG20.WA", "WIG20TR.WA", "ETFBW20TR.WA", "WIG.WA", "^WIG"]:
    for kw in [dict(period="2y", interval="1d"), dict(period="2y", interval="1wk"), dict(period="730d", interval="1h")]:
        try:
            d = yf.download(s, progress=False, auto_adjust=True, **kw)
            c = d["Close"].dropna()
            c = c.iloc[:, 0] if isinstance(c, pd.DataFrame) else c
            out[f"{s} {kw['interval']}"] = {"n": int(len(c)), "first": str(c.index[0]) if len(c) else None,
                                            "last": str(c.index[-1]) if len(c) else None,
                                            "tail": [round(float(x), 2) for x in c.tail(3)]}
        except Exception as e:
            out[f"{s} {kw['interval']}"] = {"error": repr(e)[:200]}
    try:
        h = yf.Ticker(s).history(period="2y", interval="1d")
        out[f"{s} history"] = {"n": int(len(h)), "first": str(h.index[0]) if len(h) else None}
    except Exception as e:
        out[f"{s} history"] = {"error": repr(e)[:200]}
# hourly closes vs official daily closes for PKO (does the last hourly bar equal the daily close?)
d1 = yf.download("PKO.WA", period="1mo", interval="1d", auto_adjust=False, progress=False)["Close"].squeeze()
h1 = yf.download("PKO.WA", period="1mo", interval="1h", auto_adjust=False, progress=False)["Close"].squeeze()
h1.index = h1.index.tz_convert("Europe/Warsaw")
lastbar = h1.groupby(h1.index.date).last()
out["PKO daily vs last hourly"] = [[str(k), round(float(d1.get(pd.Timestamp(k), float("nan"))), 2), round(float(v), 2)] for k, v in lastbar.tail(8).items()]
w = yf.download("WIG20.WA", period="5d", interval="1h", auto_adjust=False, progress=False)["Close"].squeeze()
out["WIG20 hourly tail"] = [[str(k), round(float(v), 2)] for k, v in w.tail(10).items()]
for u in ["https://gpwbenchmark.pl/karta-indeksu?isin=PL9999999987", "https://www.gpw.pl/archiwum-notowan?fetch=1&type=1&instrument=WIG20&date=&show_x=Poka%C5%BC+wyniki"]:
    try:
        r = requests.get(u, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        out[u] = {"status": r.status_code, "len": len(r.text), "head": r.text[:200]}
    except Exception as e:
        out[u] = {"error": repr(e)[:200]}
print("PROBE" + json.dumps(out, separators=(",", ":")))
