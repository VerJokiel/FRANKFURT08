"""
longterm_risk.py — reference implementation of the dashboard's "Long-term risk" layer
(assets/ltrisk.js) and of the crisis-episode analysis in "Crisis history" (assets/crises.js).

VaR and Expected Shortfall of the three-pillar portfolio over 1-year and 5-year holding
periods, estimated from up to 25 years of daily data (data/longterm_prices.csv).

Usage
-----
    python python/longterm_risk.py                              # 1-year horizon, 99%, last 20 years
    python python/longterm_risk.py --horizon 1260 --alpha 0.975 # 5-year horizon
    python python/longterm_risk.py --train all                  # training data since 2001
    python python/longterm_risk.py --crises                     # crisis-episode table
    python python/longterm_risk.py --json

Conventions: simple daily returns; loss = -return (positive = money lost); alpha = confidence
level; horizon h in trading days (252 = 1 year, 1260 = 5 years). See docs/RISK_METHODOLOGY.md
(section "Long-term risk") and docs/CRISIS_HISTORY.md.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from statistics import NormalDist

import numpy as np
import pandas as pd

N01 = NormalDist()
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "longterm_prices.csv"
PILLARS = {"Banking": ["BANK_1", "BANK_2", "BANK_3"],
           "Industry": ["IND_1", "IND_2", "IND_3"],
           "Oil & Energy": ["OE_1", "OE_2", "OE_3"]}

EPISODES = [  # DAX peak searched in [p0, p1], trough in [t0, t1] — identical to assets/ltrisk.js
    ("Dot-com bust & 9/11", "2000-12-01", "2001-06-30", "2002-06-01", "2003-04-30"),
    ("Global financial crisis", "2007-06-01", "2007-12-31", "2008-06-01", "2009-03-31"),
    ("Euro debt crisis", "2011-04-01", "2011-07-31", "2011-08-01", "2011-12-31"),
    ("Oil price collapse", "2014-05-01", "2014-07-31", "2015-08-01", "2016-02-29"),
    ("Brexit vote", "2016-06-23", "2016-06-23", "2016-06-24", "2016-07-08"),
    ("Q4 2018 sell-off", "2018-09-01", "2018-10-31", "2018-11-01", "2018-12-31"),
    ("COVID-19 crash", "2020-01-15", "2020-02-28", "2020-03-01", "2020-04-30"),
    ("Ukraine war & energy shock", "2021-12-15", "2022-01-31", "2022-02-01", "2022-10-31"),
    ("Banking turmoil 2023", "2023-03-01", "2023-03-09", "2023-03-10", "2023-03-31"),
    ("Tariff shock 2025", "2025-03-01", "2025-03-31", "2025-04-01", "2025-04-30"),
    ("9/11 attacks (sub-event)", "2001-09-10", "2001-09-10", "2001-09-11", "2001-09-30"),
    ("Lehman collapse (sub-event)", "2008-09-12", "2008-09-12", "2008-09-15", "2008-11-30"),
]


# --------------------------------------------------------------------------- data
def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (prices, daily returns of pillar ETFs, Portfolio and DAX)."""
    px = pd.read_csv(DATA, parse_dates=["date"]).set_index("date").sort_index()
    r = px.drop(columns=["OIL_WTI"]).pct_change(fill_method=None)
    out = pd.DataFrame(index=px.index)
    for p, ids in PILLARS.items():
        out[p] = r[ids].mean(axis=1, skipna=True)        # equal weight over listed members
    out = out.fillna(0.0)
    out["Portfolio"] = out[list(PILLARS)].mean(axis=1)   # equal pillar weights
    out["DAX"] = r["DAX"].fillna(0.0)
    out.iloc[0] = 0.0
    return px, out


def training_start(dates: pd.DatetimeIndex, train: str) -> int:
    last = dates[-1]
    start = pd.Timestamp(year=last.year - 20, month=last.month, day=last.day) if train == "20y" else pd.Timestamp("2001-01-02")
    return max(1, int(np.searchsorted(dates.values, np.datetime64(start))))


# --------------------------------------------------------------------------- estimators
def overlapping(r: np.ndarray, h: int) -> np.ndarray:
    """All compounded h-day returns (one window starting on each day)."""
    P = np.concatenate([[0.0], np.cumsum(np.log1p(r))])
    return np.expm1(P[h:] - P[:-h])


def var_es(returns: np.ndarray, alpha: float) -> tuple[float, float]:
    L = np.sort(-np.asarray(returns))
    v = float(np.quantile(L, alpha, method="linear"))
    return min(1.0, v), min(1.0, float(L[L >= v].mean()))


def bootstrap(r: np.ndarray, h: int, paths: int = 10000, block: int = 63, seed: int = 7) -> np.ndarray:
    """Moving-block bootstrap of h-day returns (random 3-month blocks). Random numbers differ
    from the browser, so results agree only up to sampling noise."""
    rng = np.random.default_rng(seed)
    P = np.concatenate([[0.0], np.cumsum(np.log1p(r))]); N = len(r)
    tot = np.zeros(paths); left = h
    while left > 0:
        ln = min(block, left)
        st = rng.integers(0, N - ln + 1, size=paths)
        tot += P[st + ln] - P[st]; left -= ln
    return np.expm1(tot)


def fan_bootstrap(r: np.ndarray, h: int, paths: int = 10000, block: int = 63, seed: int = 7, step: int = 21,
                  qs=(0.01, 0.05, 0.10, 0.25, 0.5, 0.75, 0.90, 0.95, 0.99)) -> pd.DataFrame:
    """Fan chart: percentiles of the bootstrapped value (growth of 1) at every `step` days and at h.
    Uses the same block scheme as bootstrap(); with the same seed its end points equal bootstrap() + 1."""
    rng = np.random.default_rng(seed)
    P = np.concatenate([[0.0], np.cumsum(np.log1p(r))]); N = len(r)
    xs = list(range(0, h, step)) + [h]
    vals = np.ones((paths, len(xs)))
    tot = np.zeros(paths); left = h; done = 0
    while left > 0:
        ln = min(block, left)
        st = rng.integers(0, N - ln + 1, size=paths)
        for k, c in enumerate(xs):
            if done < c <= done + ln:
                vals[:, k] = np.exp(tot + P[st + (c - done)] - P[st])
        tot += P[st + ln] - P[st]; done += ln; left -= ln
    return pd.DataFrame(np.quantile(vals, qs, axis=0).T, index=pd.Index(xs, name="day"), columns=[f"p{int(q * 100)}" for q in qs])


def lognormal(mu: float, sigma: float, h: int, alpha: float) -> tuple[float, float]:
    """GBM on daily log returns: VaR = 1 - exp(m - z s); ES = 1 - exp(m + s²/2) Φ(-z - s)/(1-α)."""
    z = N01.inv_cdf(alpha); m = mu * h; s = sigma * math.sqrt(h)
    return 1 - math.exp(m - z * s), 1 - math.exp(m + s * s / 2) * N01.cdf(-z - s) / (1 - alpha)


def sqrt_time(r: np.ndarray, h: int, alpha: float) -> tuple[float, float]:
    """1-day historical VaR/ES × √h (Basel convention), capped at 100%."""
    v, e = var_es(r, alpha)
    return min(1.0, v * math.sqrt(h)), min(1.0, e * math.sqrt(h))


def stressed_window(r: np.ndarray, dates: pd.DatetimeIndex, w: int = 252) -> tuple[float, str, str]:
    """Daily log-return volatility of the most volatile 252-day window."""
    lr = pd.Series(np.log1p(r))
    v = lr.rolling(w).var(ddof=1)
    end = int(np.nanargmax(v.values))
    return math.sqrt(v.iloc[end]), str(dates[end - w + 1].date()), str(dates[end].date())


def estimate(r: np.ndarray, dates: pd.DatetimeIndex, h: int, alpha: float) -> dict:
    lr = np.log1p(r); mu, sigma = lr.mean(), lr.std(ddof=1)
    ov, bs = overlapping(r, h), bootstrap(r, h)
    s_sig, s_from, s_to = stressed_window(r, dates)
    return {"historical": var_es(ov, alpha), "bootstrap": var_es(bs, alpha), "lognormal": lognormal(mu, sigma, h, alpha),
            "sqrt_time": sqrt_time(r, h, alpha), "stressed": lognormal(mu, s_sig, h, alpha),
            "stress_window": (s_from, s_to, s_sig * math.sqrt(252)),
            "p_loss_bootstrap": float((bs < 0).mean()), "median_bootstrap": float(np.median(bs)),
            "worst_overlapping": float(ov.min()), "n_windows": len(ov)}


# --------------------------------------------------------------------------- drawdowns, correlations, episodes
def drawdown(r: pd.Series) -> pd.Series:
    lvl = (1 + r).cumprod(); return lvl / lvl.cummax() - 1


def rolling_corr(a: pd.Series, b: pd.Series, w: int = 252) -> pd.Series:
    return a.rolling(w).corr(b)


def episode_table(px: pd.DataFrame, R: pd.DataFrame) -> pd.DataFrame:
    dax, oil = px["DAX"], px["OIL_WTI"]
    L = (1 + R).cumprod()
    rows = []
    for name, p0, p1, t0, t1 in EPISODES:
        pk, tr = dax[p0:p1].idxmax(), dax[t0:t1].idxmin()
        seg = L.loc[pk:tr]; ret = seg.iloc[-1] / seg.iloc[0] - 1
        o = oil[pk:tr].dropna()
        rec = {}
        for s in ["Portfolio", "DAX"]:
            after = L[s][tr:]; hit = np.nonzero(after.values >= L[s][pk])[0]
            rec[s] = int(hit[0]) if len(hit) else None           # trading days from trough
        rows.append({"episode": name, "peak": pk.date(), "trough": tr.date(), "trading_days": len(seg) - 1,
                     **{k: ret[k] for k in ["DAX", "Portfolio", "Banking", "Industry", "Oil & Energy"]},
                     "oil_wti": o.iloc[-1] / o.iloc[0] - 1 if len(o) > 1 else np.nan,
                     "recovery_days_portfolio": rec["Portfolio"], "recovery_days_dax": rec["DAX"]})
    return pd.DataFrame(rows).set_index("episode")


# --------------------------------------------------------------------------- report
def report(value=15000.0, horizon=252, alpha=0.99, train="20y") -> dict:
    px, R = load()
    i0 = training_start(R.index, train)
    dates = R.index[i0:]
    out = {"settings": {"value_eur": value, "horizon_days": horizon, "alpha": alpha, "train": train,
                        "from": str(dates[0].date()), "to": str(dates[-1].date())}}
    for s in ["Portfolio", "Banking", "Industry", "Oil & Energy", "DAX"]:
        e = estimate(R[s].values[i0:], dates, horizon, alpha)
        out[s] = e
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--value", type=float, default=15000)
    ap.add_argument("--horizon", type=int, default=252, help="252 = 1 year, 1260 = 5 years")
    ap.add_argument("--alpha", type=float, default=0.99)
    ap.add_argument("--train", default="20y", choices=["20y", "all"])
    ap.add_argument("--crises", action="store_true")
    ap.add_argument("--fan", action="store_true", help="print fan-chart percentiles of the portfolio value")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if a.crises:
        px, R = load()
        t = episode_table(px, R)
        pd.set_option("display.width", 200)
        print(t.to_string(float_format=lambda x: f"{x:+.1%}" if abs(x) < 10 else f"{x:.0f}"))
        return
    if a.fan:
        px, R = load(); i0 = training_start(R.index, a.train)
        f = fan_bootstrap(R["Portfolio"].values[i0:], a.horizon, step=21 if a.horizon > 252 else 63) * a.value
        print(f.round(0).to_string()); return
    out = report(a.value, a.horizon, a.alpha, a.train)
    if a.json:
        print(json.dumps(out, indent=2, default=str)); return
    s = out["settings"]
    print(f"\n{s['horizon_days']}-day horizon · {s['alpha']:.1%} · training {s['from']} – {s['to']} · €{s['value_eur']:,.0f}\n")
    print(f"{'Method':22s}{'Portfolio VaR':>15s}{'ES':>9s}{'DAX VaR':>10s}{'ES':>8s}")
    for k in ["historical", "bootstrap", "lognormal", "sqrt_time", "stressed"]:
        p, d = out["Portfolio"][k], out["DAX"][k]
        print(f"{k:22s}{p[0]:>15.1%}{p[1]:>9.1%}{d[0]:>10.1%}{d[1]:>8.1%}")
    p = out["Portfolio"]
    print(f"\nPortfolio: P(loss) {p['p_loss_bootstrap']:.0%}, median {p['median_bootstrap']:+.1%}, worst window {p['worst_overlapping']:+.1%}, "
          f"stress window {p['stress_window'][0]} – {p['stress_window'][1]} ({p['stress_window'][2]:.0%} vol)")


if __name__ == "__main__":
    main()
