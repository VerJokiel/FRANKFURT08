"""
risk_metrics.py — reference implementation of the risk analytics in the
dashboard's "Risk: VaR & ES" tab (assets/risk.js).

Same data, same formulas, so the numbers can be checked independently or
reused in research notebooks. Only numpy and pandas are required.

Usage
-----
    python python/risk_metrics.py                         # defaults: €15,000, 99.9%, 1 day, last 252 days, equal weights
    python python/risk_metrics.py --value 15000 --alpha 0.975 --horizon 10 --window 0 --weights erc
    python python/risk_metrics.py --json                  # machine-readable output

Conventions
-----------
* returns are simple daily returns  r_t = P_t / P_{t-1} - 1
* a loss is L = -r (positive = money lost)
* alpha is the confidence level (0.99 = 99%)
* VaR_alpha = alpha-quantile of the loss distribution
* ES_alpha  = mean loss in the worst (1 - alpha) share of outcomes
* multi-day figures use the square-root-of-time rule: X_h = X_1 * sqrt(h)

See docs/RISK_METHODOLOGY.md for the theory behind every function.
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from statistics import NormalDist

import numpy as np
import pandas as pd

N01 = NormalDist()
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "prices_indexed.csv"
SECTOR = {"BANK": "Banking", "IND": "Industry", "OE": "Oil & Energy"}


# --------------------------------------------------------------------------- data
def load_returns(path: Path = DATA) -> pd.DataFrame:
    """Daily simple returns of the nine stocks (columns BANK_1 … OE_3)."""
    px = pd.read_csv(path, parse_dates=["date"]).set_index("date").sort_index()
    return px.pct_change().dropna(how="all")


def sector_of(col: str) -> str:
    return SECTOR[col.rsplit("_", 1)[0]]


# --------------------------------------------------------------------------- statistics
def skewness(r: np.ndarray) -> float:
    m = r.mean(); m2 = ((r - m) ** 2).mean(); m3 = ((r - m) ** 3).mean()
    return float(m3 / m2 ** 1.5)


def excess_kurtosis(r: np.ndarray) -> float:
    m = r.mean(); m2 = ((r - m) ** 2).mean(); m4 = ((r - m) ** 4).mean()
    return float(m4 / m2 ** 2 - 3)


# --------------------------------------------------------------------------- VaR / ES estimators
@dataclass
class Risk:
    var: float  # one-day VaR, fraction of portfolio value
    es: float   # one-day ES, fraction of portfolio value


def historical(r: np.ndarray, alpha: float) -> Risk:
    """Historical simulation. Linear-interpolated loss quantile; ES = mean of losses >= VaR."""
    L = np.sort(-np.asarray(r))
    v = float(np.quantile(L, alpha, method="linear"))
    return Risk(v, float(L[L >= v].mean()))


def parametric_normal(r: np.ndarray, alpha: float) -> Risk:
    """Variance-covariance VaR under normality: VaR = -mu + z*sigma, ES = -mu + sigma*phi(z)/(1-alpha)."""
    mu, s, z = r.mean(), r.std(ddof=1), N01.inv_cdf(alpha)
    return Risk(float(-mu + z * s), float(-mu + s * N01.pdf(z) / (1 - alpha)))


def cornish_fisher(r: np.ndarray, alpha: float, n_int: int = 400) -> Risk:
    """Modified VaR: normal quantile corrected for skewness and excess kurtosis.
    The loss (-r) has skewness -S. ES integrates the corrected quantile over the tail."""
    mu, s, S, K = r.mean(), r.std(ddof=1), skewness(r), excess_kurtosis(r)
    def q(z: float) -> float:
        return z + (z * z - 1) * (-S) / 6 + (z ** 3 - 3 * z) * K / 24 - (2 * z ** 3 - 5 * z) * S * S / 36
    v = -mu + q(N01.inv_cdf(alpha)) * s
    us = alpha + (1 - alpha) * (np.arange(n_int) + 0.5) / n_int
    es = np.mean([-mu + q(N01.inv_cdf(u)) * s for u in us])
    return Risk(float(v), float(es))


def ewma_sigma(r: np.ndarray, lam: float = 0.94, seed_n: int = 30) -> tuple[np.ndarray, float]:
    """RiskMetrics EWMA volatility. sig[t] is the forecast for day t made with data up to t-1."""
    v = np.var(r[:min(seed_n, len(r))], ddof=1)
    sig = np.empty(len(r))
    for t, x in enumerate(r):
        sig[t] = math.sqrt(v)
        v = lam * v + (1 - lam) * x * x
    return sig, math.sqrt(v)


def ewma_normal(r: np.ndarray, alpha: float, lam: float = 0.94) -> Risk:
    """Zero-mean normal VaR with today's EWMA volatility."""
    _, s = ewma_sigma(r, lam)
    z = N01.inv_cdf(alpha)
    return Risk(z * s, s * N01.pdf(z) / (1 - alpha))


def filtered_hs(r: np.ndarray, alpha: float, lam: float = 0.94) -> Risk:
    """Filtered historical simulation: standardise by EWMA sigma, rescale by today's sigma."""
    sig, nxt = ewma_sigma(r, lam)
    return historical(r / sig * nxt, alpha)


def monte_carlo(R: np.ndarray, w: np.ndarray, alpha: float, n: int = 50000,
                dist: str = "normal", nu: int = 4, seed: int = 42) -> Risk:
    """Monte Carlo on the stocks: multivariate normal or Student-t with the sample mean and covariance.
    (Random numbers differ from the browser version, so results agree only up to sampling noise.)"""
    rng = np.random.default_rng(seed)
    mu, cov = R.mean(axis=0), np.cov(R, rowvar=False)
    L = np.linalg.cholesky(cov)
    Z = rng.standard_normal((n, R.shape[1])) @ L.T
    if dist == "t":
        chi = rng.chisquare(nu, size=(n, 1))
        Z = Z * np.sqrt((nu - 2) / chi)
    return historical((mu + Z) @ w, alpha)


# --------------------------------------------------------------------------- decomposition
def component_var(cov: np.ndarray, w: np.ndarray, alpha: float) -> dict:
    """Euler allocation of zero-mean parametric VaR. Components sum to z * sigma_p."""
    z = N01.inv_cdf(alpha)
    Sw = cov @ w
    sp = math.sqrt(w @ Sw)
    comp = w * z * Sw / sp
    return {"total": z * sp, "component": comp, "marginal": z * Sw / sp}


def component_es(R: np.ndarray, w: np.ndarray, alpha: float) -> dict:
    """Euler allocation of historical ES: each position's mean loss on the portfolio's tail days."""
    pr = R @ w
    v = historical(pr, alpha).var
    tail = -pr >= v
    comp = (-(R[tail] * w)).mean(axis=0)
    return {"total": comp.sum(), "component": comp}


# --------------------------------------------------------------------------- weights
def inverse_vol(cov: np.ndarray) -> np.ndarray:
    w = 1 / np.sqrt(np.diag(cov)); return w / w.sum()


def equal_risk_contribution(cov: np.ndarray, iters: int = 500) -> np.ndarray:
    w = inverse_vol(cov)
    for _ in range(iters):
        Sw = cov @ w; rc = w * Sw / (w @ Sw)
        w = w * np.sqrt((1 / len(w)) / rc); w /= w.sum()
    return w


def project_simplex(v: np.ndarray) -> np.ndarray:
    u = np.sort(v)[::-1]; css = np.cumsum(u)
    rho = np.nonzero(u - (css - 1) / (np.arange(len(v)) + 1) > 0)[0][-1]
    theta = (css[rho] - 1) / (rho + 1)
    return np.maximum(v - theta, 0)


def min_variance(cov: np.ndarray, iters: int = 4000) -> np.ndarray:
    k = len(cov); w = np.full(k, 1 / k); step = 0.5 / np.trace(cov)
    for _ in range(iters):
        w = project_simplex(w - step * 2 * (cov @ w) * k)
    return w


def make_weights(scheme: str, R: pd.DataFrame, pillar_mix: dict | None = None) -> np.ndarray:
    cov = np.cov(R.values, rowvar=False)
    if scheme == "invvol": return inverse_vol(cov)
    if scheme == "erc": return equal_risk_contribution(cov)
    if scheme == "minvar": return min_variance(cov)
    if scheme == "pillar":
        mix = pillar_mix or {s: 1 / 3 for s in SECTOR.values()}
        tot = sum(mix.values()); secs = [sector_of(c) for c in R.columns]
        return np.array([mix[s] / tot / secs.count(s) for s in secs])
    return np.full(R.shape[1], 1 / R.shape[1])


# --------------------------------------------------------------------------- backtesting
def rolling_var(r: np.ndarray, alpha: float, model: str, win: int = 250) -> pd.DataFrame:
    """Out-of-sample one-day VaR forecasts and exceptions."""
    sig, _ = ewma_sigma(r)
    rows = []
    for t in range(win, len(r)):
        past = r[t - win:t]
        if model == "hist": v = historical(past, alpha).var
        elif model == "normal": v = parametric_normal(past, alpha).var
        elif model == "ewma": v = N01.inv_cdf(alpha) * sig[t]
        else: v = historical(past / sig[t - win:t] * sig[t], alpha).var
        rows.append((t, v, r[t], -r[t] > v))
    return pd.DataFrame(rows, columns=["t", "var", "ret", "hit"])


def chi2_sf_df1(x: float) -> float:
    return 1.0 if x <= 0 else math.erfc(math.sqrt(x / 2))


def kupiec(hits: np.ndarray, alpha: float) -> dict:
    T, x, p = len(hits), int(hits.sum()), 1 - alpha
    ph = x / T
    ll0 = (T - x) * math.log(1 - p) + x * math.log(p)
    ll1 = (x * math.log(ph) if x else 0) + ((T - x) * math.log(1 - ph) if x < T else 0)
    LR = -2 * (ll0 - ll1)
    return {"T": T, "exceptions": x, "expected": T * p, "LR": LR, "p_value": chi2_sf_df1(LR)}


def christoffersen(hits: np.ndarray) -> dict:
    h = hits.astype(int); a, b = h[:-1], h[1:]
    n00 = int(((a == 0) & (b == 0)).sum()); n01 = int(((a == 0) & (b == 1)).sum())
    n10 = int(((a == 1) & (b == 0)).sum()); n11 = int(((a == 1) & (b == 1)).sum())
    pi0 = n01 / max(1, n00 + n01); pi1 = n11 / max(1, n10 + n11); pi = (n01 + n11) / max(1, len(a))
    lg = lambda x: math.log(x) if x > 0 else 0.0
    l0 = (n00 + n10) * lg(1 - pi) + (n01 + n11) * lg(pi)
    l1 = n00 * lg(1 - pi0) + n01 * lg(pi0) + n10 * lg(1 - pi1) + n11 * lg(pi1)
    LR = -2 * (l0 - l1)
    return {"LR": LR, "p_value": chi2_sf_df1(LR)}


def basel_zone(x: int, T: int, alpha: float) -> str:
    p = 1 - alpha
    cdf = sum(math.comb(T, i) * p ** i * (1 - p) ** (T - i) for i in range(x + 1))
    return "green" if cdf < 0.95 else "yellow" if cdf < 0.9999 else "red"


# --------------------------------------------------------------------------- fan chart (next month)
def fan_historical(r: np.ndarray, H: int = 21, paths: int = 10000, seed: int = 11,
                   qs=(0.01, 0.05, 0.10, 0.25, 0.5, 0.75, 0.90, 0.95, 0.99)) -> pd.DataFrame:
    """Fan chart for the next H trading days: each day's return drawn at random (with replacement)
    from the estimation window; percentiles of the value (growth of 1) for days 0..H."""
    rng = np.random.default_rng(seed)
    draws = rng.choice(np.asarray(r), size=(paths, H), replace=True)
    vals = np.concatenate([np.ones((paths, 1)), np.cumprod(1 + draws, axis=1)], axis=1)
    return pd.DataFrame(np.quantile(vals, qs, axis=0).T, index=pd.Index(range(H + 1), name="day"),
                        columns=[f"p{int(q * 100)}" for q in qs])


# --------------------------------------------------------------------------- performance & stress
def drawdown(r: np.ndarray) -> np.ndarray:
    lvl = np.cumprod(1 + r); return lvl / np.maximum.accumulate(lvl) - 1


def performance(r: np.ndarray, rf: float = 0.02) -> dict:
    years = len(r) / 252
    ann_ret = np.prod(1 + r) ** (1 / years) - 1
    ann_vol = r.std(ddof=1) * math.sqrt(252)
    rf_d = (1 + rf) ** (1 / 252) - 1
    ex = r - rf_d
    downside = math.sqrt((np.minimum(ex, 0) ** 2).mean()) * math.sqrt(252)
    mdd = drawdown(r).min()
    return {"ann_return": ann_ret, "ann_vol": ann_vol, "sharpe": ex.mean() * 252 / ann_vol,
            "sortino": ex.mean() * 252 / downside, "max_drawdown": mdd, "calmar": ann_ret / abs(mdd),
            "skew": skewness(r), "excess_kurtosis": excess_kurtosis(r),
            "var999_1d": historical(r, 0.999).var, "es975_1d": historical(r, 0.975).es}


SCENARIOS = {  # illustrative instantaneous pillar shocks (assumptions, not forecasts)
    "Global equity crash (2008-style)": {"Banking": -0.45, "Industry": -0.35, "Oil & Energy": -0.30},
    "Banking crisis / credit event":    {"Banking": -0.30, "Industry": -0.10, "Oil & Energy": -0.05},
    "Oil price spike (+40% crude)":     {"Banking": -0.05, "Industry": -0.08, "Oil & Energy": 0.12},
    "Oil price crash (-40% crude)":     {"Banking": -0.03, "Industry": 0.03, "Oil & Energy": -0.25},
    "AI / capex unwind":                {"Banking": -0.05, "Industry": -0.25, "Oil & Energy": -0.05},
    "Rates fall 150 bp":                {"Banking": -0.15, "Industry": 0.05, "Oil & Energy": 0.02},
}


def stressed_var(cov: np.ndarray, w: np.ndarray, alpha: float, rho: float, vol_mult: float = 1.0) -> float:
    """Zero-mean normal VaR with every pairwise correlation set to rho and volatilities scaled."""
    sd = np.sqrt(np.diag(cov)) * vol_mult
    C = np.full_like(cov, rho); np.fill_diagonal(C, 1.0)
    return N01.inv_cdf(alpha) * math.sqrt(w @ (np.outer(sd, sd) * C) @ w)


# --------------------------------------------------------------------------- systematic risk vs the DAX
def market_exposure(window: int = 252) -> pd.DataFrame:
    """Beta, R², downside/upside capture and average return on the DAX's 10 worst days
    for each pillar ETF and the equal-weighted portfolio (Investment thesis tab)."""
    R = load_returns()
    dax = pd.read_csv(ROOT / "data" / "benchmark_dax.csv", parse_dates=["date"]).set_index("date")["DAX"].pct_change().dropna()
    if window: R, dax = R.iloc[-window:], dax.iloc[-window:]
    series = {f"{s} ETF": R[[c for c in R.columns if sector_of(c) == s]].mean(axis=1) for s in SECTOR.values()}
    series["Portfolio (equal)"] = R.mean(axis=1)
    worst = dax.nsmallest(10).index
    rows = []
    for name, r in series.items():
        beta = np.cov(r, dax)[0, 1] / dax.var()
        rows.append({"series": name, "beta": beta, "r2": np.corrcoef(r, dax)[0, 1] ** 2,
                     "downside_capture": r[dax < 0].mean() / dax[dax < 0].mean(),
                     "upside_capture": r[dax >= 0].mean() / dax[dax >= 0].mean(),
                     "avg_on_dax_10_worst": r[worst].mean()})
    rows.append({"series": "DAX", "beta": 1.0, "r2": 1.0, "downside_capture": 1.0, "upside_capture": 1.0, "avg_on_dax_10_worst": dax[worst].mean()})
    return pd.DataFrame(rows).set_index("series")


# --------------------------------------------------------------------------- report
def report(value=15000.0, alpha=0.999, horizon=1, window=252, scheme="equal") -> dict:
    R_all = load_returns()
    R = R_all.iloc[-window:] if window else R_all
    w = make_weights(scheme, R)
    r = R.values @ w
    sq = math.sqrt(horizon)
    methods = {
        "Historical simulation": historical(r, alpha),
        "Parametric normal": parametric_normal(r, alpha),
        "Cornish-Fisher": cornish_fisher(r, alpha),
        "EWMA normal (lambda 0.94)": ewma_normal(r, alpha),
        "Filtered historical": filtered_hs(r, alpha),
        "Monte Carlo normal": monte_carlo(R.values, w, alpha),
        "Monte Carlo Student-t (nu 4)": monte_carlo(R.values, w, alpha, dist="t"),
    }
    cov = np.cov(R.values, rowvar=False)
    cv, ce = component_var(cov, w, alpha), component_es(R.values, w, alpha)
    r_all = R_all.values @ w
    bt = {}
    for m in ["hist", "normal", "ewma", "fhs"]:
        d = rolling_var(r_all, alpha, m); k = kupiec(d.hit.values, alpha)
        bt[m] = {**k, "christoffersen_p": christoffersen(d.hit.values)["p_value"], "zone": basel_zone(k["exceptions"], k["T"], alpha)}
    pillar_w = {s: float(sum(w[i] for i, c in enumerate(R.columns) if sector_of(c) == s)) for s in SECTOR.values()}
    return {
        "settings": {"value_eur": value, "alpha": alpha, "horizon_days": horizon, "window_days": len(R), "weights": scheme},
        "weights": dict(zip(R.columns, np.round(w, 4).tolist())),
        "var_es_eur": {k: {"VaR": v.var * sq * value, "ES": v.es * sq * value} for k, v in methods.items()},
        "component_var_share": dict(zip(R.columns, np.round(cv["component"] / cv["total"], 4).tolist())),
        "component_es_share": dict(zip(R.columns, np.round(ce["component"] / ce["total"], 4).tolist())),
        "backtest": bt,
        "stress_eur": {k: sum(pillar_w[s] * sh[s] for s in sh) * value for k, sh in SCENARIOS.items()},
        "stressed_var_rho_0.8_eur": stressed_var(cov, w, alpha, 0.8) * sq * value,
        "performance": performance(r),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--value", type=float, default=15000)
    ap.add_argument("--alpha", type=float, default=0.999)
    ap.add_argument("--horizon", type=int, default=1)
    ap.add_argument("--window", type=int, default=252, help="days of history; 0 = all")
    ap.add_argument("--weights", default="equal", choices=["equal", "pillar", "invvol", "erc", "minvar"])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--fan", action="store_true", help="print fan-chart percentiles for the next 21 trading days")
    ap.add_argument("--market", action="store_true", help="print market exposure vs the DAX and exit")
    a = ap.parse_args()
    if a.fan:
        R = load_returns(); R = R.iloc[-a.window:] if a.window else R
        r = R.values @ make_weights(a.weights, R)
        print((fan_historical(r) * a.value).round(0).to_string()); return
    if a.market:
        print(market_exposure(a.window).round(3).to_string()); return
    out = report(a.value, a.alpha, a.horizon, a.window, a.weights)
    if a.json:
        print(json.dumps(out, indent=2, default=float)); return
    s = out["settings"]
    print(f"\nPortfolio €{s['value_eur']:,.0f} · {s['alpha']:.1%} · {s['horizon_days']}-day · {s['window_days']} days · weights={s['weights']}\n")
    print(f"{'Method':32s}{'VaR €':>10s}{'ES €':>10s}")
    for k, v in out["var_es_eur"].items():
        print(f"{k:32s}{v['VaR']:>10,.0f}{v['ES']:>10,.0f}")
    print("\nBacktest (rolling 250-day, 1-day):")
    for k, v in out["backtest"].items():
        print(f"  {k:7s} exceptions {v['exceptions']:3d}/{v['T']} (exp {v['expected']:.1f})  Kupiec p={v['p_value']:.3f}  Christoffersen p={v['christoffersen_p']:.3f}  zone={v['zone']}")
    print("\nStress scenarios (€):")
    for k, v in out["stress_eur"].items():
        print(f"  {k:36s}{v:>10,.0f}")
    p = out["performance"]
    print(f"\nAnn. return {p['ann_return']:.1%} · vol {p['ann_vol']:.1%} · Sharpe {p['sharpe']:.2f} · Sortino {p['sortino']:.2f} · max DD {p['max_drawdown']:.1%}")


if __name__ == "__main__":
    main()
