# Risk methodology: short-term and long-term VaR, Expected Shortfall and hedge-fund risk analytics

This document explains the two risk layers of the Three-Pillar ETF Dashboard and the matching Python implementations:

* **Layer 1, Short-term risk** (tab *Short-term risk*, `assets/risk.js`, `python/risk_metrics.py`): losses over 1 day to 1 month, estimated from the last 1–2 years of daily Frankfurt prices. Sections 1–17.
* **Layer 2, Long-term risk** (tab *Long-term risk*, `assets/ltrisk.js`, `python/longterm_risk.py`): losses over 1-year and 5-year holding periods, estimated from up to 25 years of daily prices on the primary listings. Sections 18–25.

The worst historical episodes behind the long-term numbers are analysed in [CRISIS_HISTORY.md](CRISIS_HISTORY.md) and the *Crisis history* tab. For each layer the document covers the concepts, every formula used, how the code is organised, how the results were validated, and the limits of the approach.

---

## Contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Quick start](#2-quick-start)
3. [Data and preprocessing](#3-data-and-preprocessing)
4. [Portfolio construction](#4-portfolio-construction)
5. [Core concepts: VaR and Expected Shortfall](#5-core-concepts-var-and-expected-shortfall)
6. [Seven estimation methods](#6-seven-estimation-methods)
7. [Time horizon scaling](#7-time-horizon-scaling)
8. [Risk decomposition and diversification](#8-risk-decomposition-and-diversification)
9. [Backtesting](#9-backtesting)
10. [Stress testing](#10-stress-testing)
11. [Risk-adjusted performance](#11-risk-adjusted-performance)
12. [Results snapshot](#12-results-snapshot)
13. [How a hedge fund uses these numbers](#13-how-a-hedge-fund-uses-these-numbers)
14. [Limitations and model risk](#14-limitations-and-model-risk)
15. [Code reference](#15-code-reference)
16. [Validation](#16-validation)
17. [Extending the code](#17-extending-the-code)

**Part B: Long-term risk**

18. [Why a second layer](#18-why-a-second-layer)
19. [Long-term data](#19-long-term-data)
20. [Five long-horizon estimators](#20-five-long-horizon-estimators)
21. [Range of outcomes, drawdowns and long-run correlations](#21-range-of-outcomes-drawdowns-and-long-run-correlations)
22. [Long-term results snapshot](#22-long-term-results-snapshot)
23. [Long-term limitations](#23-long-term-limitations)
24. [Long-term code reference](#24-long-term-code-reference)
25. [Long-term validation](#25-long-term-validation)
26. [Glossary](#26-glossary)
27. [References](#27-references)

---

## 1. Purpose and scope

The portfolio holds nine Frankfurt-listed stocks in three equal-weighted pillar ETFs (Banking, Industry, Oil & Energy). The Short-term risk tab answers four questions a hedge-fund risk manager asks every day:

| Question | Tool in the dashboard |
|---|---|
| How much can we lose on a bad day/week/month? | VaR and Expected Shortfall, 7 methods |
| Where does that risk come from? | Component VaR / ES by stock and pillar, diversification benefit |
| Can we trust the model? | Rolling backtest with Kupiec, Christoffersen and Basel traffic-light tests |
| What if the past is not a guide? | Historical and hypothetical stress scenarios, correlation and volatility stress |

It also reports risk-adjusted performance (Sharpe, Sortino, Calmar, drawdowns, higher moments) and lets you compare five weighting schemes, including risk parity and minimum variance.

All figures are computed in the browser from the daily price file. Nothing is sent anywhere.

## 2. Quick start

**Dashboard.** Open `index.html` (or the standalone HTML file) and choose the **Short-term risk** tab. Controls:

| Control | Options | Default |
|---|---|---|
| Portfolio value | any amount in € | €15,000 |
| Confidence level α | 95%, 97.5%, 99.9% | 99.9% |
| Horizon h | 1, 5, 10, 21 trading days | 1 day |
| Estimation window | last 252 days, full ~2 years (506 days) | last 252 days |
| Weighting scheme | Equal, Pillar mix (sliders), Inverse vol, Risk parity (ERC), Min variance | Equal |
| Backtest model | Historical, Normal, EWMA, Filtered HS | Historical |
| Stress sliders | stressed correlation 0–1, volatility multiplier 1–3× | 0.80, 1.5× |
| Risk-free rate | % per year (Sharpe/Sortino) | 2% |

**Python.**

```bash
pip install numpy pandas
python python/risk_metrics.py                                   # default settings
python python/risk_metrics.py --alpha 0.975 --horizon 10 --window 0 --weights erc
python python/risk_metrics.py --json > risk_report.json         # machine-readable
```

## 3. Data and preprocessing

* **Source:** Yahoo Finance daily adjusted closing prices of nine stocks on the Frankfurt Stock Exchange (EUR), 23 Oct 2024 – 23 Oct 2026: the same data set used throughout the project. Prices are rebased to 100 (`data/prices_indexed.csv`, `data/data.js`); rebasing does not change returns.
* **Returns:** simple daily returns, `r_{i,t} = P_{i,t} / P_{i,t−1} − 1`. Simple returns are used because they aggregate linearly across positions: the portfolio return is `r_{p,t} = Σ_i w_i r_{i,t}`. (Log returns are used elsewhere in the dashboard for correlation and weekly volatility.)
* **Sample:** 507 price days → 506 return days. The "last 1Y" window uses the most recent 252 returns.
* **Sign convention:** a loss is `L = −r`. VaR and ES are reported as **positive** numbers (money that could be lost), in % of portfolio value and in €.
* **Rebalancing:** weights are held constant every day (daily rebalancing), matching how the pillar ETFs are defined.

## 4. Portfolio construction

All schemes are long-only and fully invested (`w_i ≥ 0`, `Σ w_i = 1`). Optimised schemes use the sample covariance matrix Σ of the estimation window.

| Scheme | Rule | Idea |
|---|---|---|
| Equal (1/9) | `w_i = 1/9` | Three equal pillar ETFs, each an equal basket of three stocks. The project's base case. |
| Pillar mix | sliders set pillar weights `W_s`; inside a pillar `w_i = W_s / 3` | Tilt between Banking, Industry and Oil & Energy. |
| Inverse volatility | `w_i ∝ 1/σ_i` | "Naive risk parity": calmer stocks get more capital. |
| Equal risk contribution (ERC) | each stock contributes `1/9` of portfolio variance: `w_i (Σw)_i / wᵀΣw = 1/9` | True risk parity, popular with multi-asset hedge funds (Maillard, Roncalli & Teïletche 2010). Solved by the fixed-point iteration `w_i ← w_i · √((1/9)/RC_i)`, renormalised, 500 iterations. |
| Minimum variance | `min wᵀΣw` s.t. long-only, fully invested | Lowest-volatility mix. Solved by projected gradient descent with Euclidean projection onto the simplex (Duchi et al. 2008), 4,000 iterations. |

Caveat: the optimised weights are estimated on the same window that is then used to measure risk, so in-sample risk looks better than it would out of sample.

## 5. Core concepts: VaR and Expected Shortfall

Let `L` be the portfolio loss over the horizon and α the confidence level.

**Value at Risk.** The loss that is not exceeded with probability α:

```
VaR_α = inf { ℓ : P(L ≤ ℓ) ≥ α }      (the α-quantile of L)
```

"With 99% confidence we will not lose more than VaR tomorrow", or equivalently "on 1 day in 100 we expect to lose more than VaR".

**Expected Shortfall** (also called Conditional VaR, CVaR, or Expected Tail Loss): the average loss *given* that VaR is exceeded:

```
ES_α = E[ L | L ≥ VaR_α ] = 1/(1−α) ∫_α^1 VaR_u du
```

**Why both?**

| | VaR | ES |
|---|---|---|
| Answers | "How bad is a bad day?" | "When it is bad, how bad on average?" |
| Sees the shape of the tail | No: two portfolios with very different crash losses can share a VaR | Yes |
| Coherent risk measure (Artzner et al. 1999) | No: can violate sub-additivity, i.e. VaR(A+B) > VaR(A)+VaR(B) | Yes: sub-additive, so diversification never increases ES |
| Regulation | Basel 2.5 market risk (99%, 10-day) | Basel FRTB (97.5%, liquidity-adjusted horizons) |
| Backtesting | Easy (count exceptions) | Harder |

Under normality, ES at 97.5% ≈ VaR at 99% (both ≈ 2.33σ), which is why the FRTB moved to 97.5% ES.

**Why 99.9%?** The short-term layer defaults to 99.9%: a loss exceeded on about one trading day in four years. This is the level used for economic capital and solvency-style "1-in-1,000" questions. It has a practical consequence: with 252–506 days of data, the historical estimate at 99.9% is essentially the single worst day (or an interpolation between the two worst), and historical ES is that one day. Parametric, Cornish–Fisher and Monte Carlo methods extrapolate beyond the sample instead, so the spread between methods widens; the Student-t Monte Carlo, with its fat tails, gives by far the largest figure. For a 99.9% figure supported by many more observations, use the Long-term risk layer. The ratio **ES/VaR** shown in the method table is a quick fat-tail gauge: 1.15 for a normal distribution at 99%; higher means fatter tails.

## 6. Seven estimation methods

Notation: `r_1 … r_T` are the portfolio's daily returns in the window, `μ` the mean, `σ` the sample standard deviation (`ddof = 1`), `z = Φ⁻¹(α)`, `φ` the standard normal density.

### 6.1 Historical simulation (HS)

Revalue today's portfolio with every past day's returns and read off the empirical quantile.

```
VaR = Q_α( −r )        (linear interpolation between order statistics)
ES  = mean{ −r_t : −r_t ≥ VaR }
```

*Pros:* no distribution assumption; keeps real fat tails, skew and cross-stock dependence. *Cons:* only as good as the window: blind to events not in the sample, slow to react, noisy at high α with ~250 points (only 2–3 tail observations at 99%).

### 6.2 Parametric normal (variance–covariance, "delta-normal")

```
VaR = −μ + z σ
ES  = −μ + σ φ(z) / (1 − α)
σ²  = wᵀ Σ w
```

*Pros:* fast, smooth, gives an analytical decomposition (§8). *Cons:* assumes normal returns, so it underestimates tail risk when returns are fat-tailed.

### 6.3 Cornish–Fisher ("modified VaR")

Adjusts the normal quantile for sample skewness `S` and excess kurtosis `K` (Favre & Galeano 2002, common in hedge-fund reporting). For losses the skewness is `−S`:

```
z_CF = z + (z² − 1)(−S)/6 + (z³ − 3z) K/24 − (2z³ − 5z) S²/36
VaR  = −μ + z_CF σ
ES   = 1/(1−α) ∫_α^1 (−μ + z_CF(Φ⁻¹(u)) σ) du     (400-point midpoint rule)
```

*Pros:* captures fat tails cheaply. *Cons:* the expansion is only reliable for moderate skew/kurtosis; with very high kurtosis (e.g. a thinly traded stock with stale prices) it can overshoot badly or become non-monotonic. Over the full two-year window this data has high kurtosis, and Cornish–Fisher is the outlier, which is itself a useful warning.

### 6.4 EWMA normal (RiskMetrics)

Volatility reacts to recent shocks with an exponentially weighted moving average (J.P. Morgan RiskMetrics 1996):

```
σ²_{t+1} = λ σ²_t + (1 − λ) r_t²,     λ = 0.94,   σ²_0 = sample variance of the first 30 days
VaR = z σ_{T+1},     ES = σ_{T+1} φ(z) / (1 − α)        (zero mean)
```

*Pros:* adapts quickly to volatility clustering. *Cons:* still normal tails; λ is fixed rather than estimated.

### 6.5 Filtered historical simulation (FHS)

Combines HS's realistic tail shape with EWMA's responsiveness (Barone-Adesi, Giannopoulos & Vosper 1999; Hull & White 1998):

```
ε_t      = r_t / σ_t                 (devolatilised returns)
scenario = ε_t · σ_{T+1}             (rescaled to today's volatility)
VaR, ES  = historical estimators on the scenarios
```

*Pros:* widely regarded as the best practical model for equity books. *Cons:* depends on the volatility model; more moving parts.

### 6.6 Monte Carlo, multivariate normal

Simulate 50,000 joint daily returns of the nine stocks `x = μ + L z`, with `L` the Cholesky factor of Σ and `z ~ N(0, I)`, compute `r_p = wᵀx`, and apply the historical estimators to the simulated P&L. In this one-day linear setting it converges to the parametric normal result; it is shown because it is the template for non-linear books (options) and path-dependent risk.

### 6.7 Monte Carlo, multivariate Student-t (ν = 4)

Same, with fat-tailed shocks: `x = μ + L z · √((ν − 2)/χ²_ν)`. The scaling keeps the covariance equal to Σ, so any difference from 6.6 is purely tail shape. ν = 4 is a typical equity-tail calibration.

Random numbers come from a seeded generator (mulberry32 + Box–Muller in JavaScript, NumPy PCG64 in Python), so the dashboard is reproducible. The two languages use different generators, so Monte Carlo results agree only up to sampling noise (about ±2–3% for VaR at 99% with 50,000 paths).

## 7. Time horizon scaling

Multi-day figures use the **square-root-of-time rule**:

```
VaR_h = VaR_1 · √h,     ES_h = ES_1 · √h
```

This assumes i.i.d. returns with zero drift. It is the Basel convention (10-day = 1-day × √10) and keeps all methods comparable. It understates risk when returns are autocorrelated or volatility clusters, and ignores that positions might be cut during a drawdown. The backtest (§9) is always one-day.

### 7.1 Fan chart: the next month

The *Fan chart* card visualises the distribution of the portfolio value day by day over the next 21 trading days. 10,000 paths are simulated by drawing each day's return at random, with replacement, from the portfolio's daily returns in the estimation window (historical simulation of paths, seeded):

```
V_t = V_0 · Π_{k=1}^{t} (1 + r*_k),     r*_k drawn uniformly from {r_1 … r_T},   t = 0 … 21
```

For every day the chart shows the median and the 25–75%, 10–90%, 5–95% and 1–99% bands, plus the **VaR boundary**: the (1 − α) quantile of V_t (red dashed line). At the selected horizon h (vertical line) three markers are drawn: the simulated VaR and ES at h, and the table's historical VaR scaled with √h. Because the simulation compounds actual daily returns, the gap between the simulated and the √h figure shows the error of the square-root-of-time rule; at h = 1 they differ only by sampling and interpolation. Daily resampling assumes independent days, so volatility clustering within the month is not captured (the long-term fan chart uses blocks for that reason).

## 8. Risk decomposition and diversification

VaR and ES are homogeneous of degree one in the weights, so **Euler's theorem** splits them exactly into contributions that sum to the total (Tasche 2000):

```
Risk(w) = Σ_i w_i · ∂Risk/∂w_i
```

**Component VaR** (parametric, zero mean):

```
marginal VaR_i  = z (Σw)_i / σ_p
component VaR_i = w_i · z (Σw)_i / σ_p,        Σ_i component VaR_i = z σ_p
```

**Component ES** (historical): the average loss of each position on the portfolio's tail days:

```
component ES_i = mean_{t ∈ tail} ( −w_i r_{i,t} ),     tail = { t : −r_{p,t} ≥ VaR }
```

**Reading the chart.** If a stock's share of VaR exceeds its capital weight (the black line), it adds more risk than capital; a share below the weight, or negative, means it diversifies the book. In this portfolio the Oil & Energy stocks carry ~33% of capital but only ~18% of VaR, which is the quantitative version of the project thesis.

**Stand-alone VaR and diversification benefit:**

```
stand-alone VaR_s   = z σ(w_s)          (VaR of the pillar on its own, same € weight)
diversification     = Σ_s stand-alone VaR_s − VaR_portfolio  ≥ 0  (for normal VaR)
```

The KPI tile does the same at stock level (nine stand-alone VaRs). The sum of stand-alone VaRs equals the portfolio VaR only if every correlation is 1.

## 9. Backtesting

A VaR model is only useful if it is right about as often as it claims. The dashboard runs an **out-of-sample** backtest over the full sample:

1. For each day `t` from 251 to 506, estimate one-day VaR using only days `t−250 … t−1`.
2. Record an **exception** (hit) if the realised loss `−r_t` exceeds that VaR.
3. With `T` test days, expect about `T(1−α)` exceptions.

Four models are tested side by side: Historical (250d), Normal (250d), EWMA and Filtered HS.

**Kupiec proportion-of-failures test** (unconditional coverage). With `x` exceptions in `T` days and `p = 1 − α`:

```
LR_POF = −2 ln[ (1−p)^{T−x} p^x ] + 2 ln[ (1−x/T)^{T−x} (x/T)^x ]  ~  χ²(1)
```

p-value < 5% → the exception rate is statistically inconsistent with α (too many *or* too few).

**Christoffersen independence test.** Good models produce exceptions that are not clustered. With `n_ij` = number of days in state `j` following state `i` (0 = no hit, 1 = hit):

```
π_0 = n01/(n00+n01),  π_1 = n11/(n10+n11),  π = (n01+n11)/(n00+n01+n10+n11)
LR_ind = −2 ln[ (1−π)^{n00+n10} π^{n01+n11} ] + 2 ln[ (1−π_0)^{n00} π_0^{n01} (1−π_1)^{n10} π_1^{n11} ]  ~  χ²(1)
```

**Basel traffic light.** Based on the cumulative binomial probability of observing at most `x` exceptions if the model were correct: **green** < 95%, **yellow** 95%–99.99%, **red** ≥ 99.99%. For 250 days at 99% this gives the familiar green 0–4, yellow 5–9, red 10+.

Caveats: about 256 test days is short (at 99% only ~2.6 exceptions are expected, at 99.9% only ~0.26, so the tests have little power; at 99.9% a single exception already gives a yellow Basel zone, so judge the models at 95% or 97.5%); optimised weights are fixed with hindsight; ES is not backtested directly (see Acerbi & Székely 2014 for ES backtests).

## 10. Stress testing

VaR describes normal-to-bad days; stress tests describe very bad days. Three kinds are shown.

**Historical** (from the data): worst day, worst 5-day and worst 21-day compounded return, and maximum drawdown with peak and trough dates, all over the full sample with the selected weights.

**Hypothetical pillar shocks** (instantaneous, applied to pillar weights `W_s`: `P&L = V · Σ_s W_s · shock_s`). These are illustrative assumptions, not forecasts; edit `SCENARIOS` in `assets/risk.js` and `python/risk_metrics.py` to change them.

| Scenario | Banking | Industry | Oil & Energy |
|---|---:|---:|---:|
| Global equity crash (2008-style) | −45% | −35% | −30% |
| Banking crisis / credit event | −30% | −10% | −5% |
| Oil price spike (+40% crude) | −5% | −8% | +12% |
| Oil price crash (−40% crude) | −3% | +3% | −25% |
| AI / capex unwind | −5% | −25% | −5% |
| Rates fall 150 bp | −15% | +5% | +2% |

**Correlation and volatility stress.** In crises correlations rise towards 1 and volatility jumps, which is exactly when diversification is needed. The dashboard recomputes zero-mean parametric VaR with:

* every pairwise correlation set to ρ* (slider, default 0.80);
* additionally volatilities × k (slider, default 1.5) and correlations floored at ρ*;
* ρ = 1 for all pairs: the "no diversification" upper bound for normal VaR.

```
VaR_stress = z · √( Σ_ij w_i w_j (kσ_i)(kσ_j) ρ*_ij ) · √h · V
```

The drawdown chart shows the portfolio's running peak-to-trough loss over the whole sample.

## 11. Risk-adjusted performance

Computed over the estimation window for the portfolio, each pillar ETF and each stock (252 trading days per year; `r_f` daily = `(1 + r_f)^{1/252} − 1`):

| Metric | Formula | Notes |
|---|---|---|
| Annualised return | `(Π(1+r_t))^{252/T} − 1` | geometric |
| Annualised volatility | `σ · √252` | |
| Sharpe ratio | `mean(r − r_f) · 252 / (σ√252)` | return per unit of total risk |
| Sortino ratio | `mean(r − r_f) · 252 / (√mean(min(r − r_f, 0)²) · √252)` | penalises only downside |
| Maximum drawdown | `min_t (V_t / max_{s≤t} V_s − 1)` | worst peak-to-trough |
| Calmar ratio | `annualised return / |max drawdown|` | |
| Skewness, excess kurtosis | moment estimators | normal = 0, 0 |
| 1-day VaR 99.9%, ES 97.5% | historical | tail reference points (99.9% = layer default, 97.5% ES = FRTB) |

## 12. Results snapshot

Default settings (€15,000, equal weights, last 252 days to 23 Oct 2026, one-day horizon, 99.9%):

| Method | VaR 99.9% | ES 99.9% |
|---|---:|---:|
| Historical simulation | 517 € (3.45%) | 546 € (3.64%) |
| Parametric normal | 568 € | 620 € |
| Cornish–Fisher | 581 € | 644 € |
| EWMA normal | 555 € | 605 € |
| Filtered historical | 488 € | 492 € |
| Monte Carlo normal | 580 € (Python: 572 €) | 626 € (Python: 628 €) |
| Monte Carlo Student-t (ν 4) | 899 € (Python: 933 €) | 1,220 € (Python: 1,227 €) |

For comparison, at 99% the same portfolio has a historical VaR of 389 € and ES of 457 €.

* **Volatility:** portfolio 20.0% a year vs 37.6% for the average single stock.
* **Risk contributions (share of parametric VaR):** Banking 35%, Industry 47%, Oil & Energy 18% (each pillar is 33% of capital). Contribution shares do not depend on α in the parametric model.
* **Diversification:** the sum of the three stand-alone pillar VaRs is 819 € against a portfolio VaR of 585 € (zero-mean normal), so diversification saves 234 €. At stock level the saving is 47%.
* **Stress:** with all correlations at 0.8 VaR rises to 998 €; with volatility also ×1.5 it reaches 1,497 €. A 2008-style crash scenario costs 5,500 € (−36.7%), roughly ten times the 1-day 99.9% VaR.
* **Backtest at 99.9%:** 0 exceptions for historical, normal and EWMA models and 1 for filtered HS in 256 days (0.26 expected); the single FHS exception gives a yellow zone, which at this level says more about the test than the model. At 99% all four models were green with 1–4 exceptions.

Numbers change with the settings; the Python script prints the same report for any configuration.

## 13. How a hedge fund uses these numbers

* **Risk limits.** A desk gets a VaR or ES budget (e.g. 1-day 99% ES ≤ 2% of NAV). Positions are sized so the book stays inside it; breaches trigger de-risking.
* **Risk budgeting.** Component VaR/ES show which positions consume the budget. A position whose risk share far exceeds its expected-return share is a candidate for cutting. ERC weights are the "equal budget" benchmark.
* **Leverage and capital.** Prime brokers and internal capital models use VaR/ES and stress losses to set margin and maximum gross exposure.
* **Model governance.** Daily backtesting with traffic-light monitoring; a yellow or red zone forces model review (e.g. switching from HS to FHS).
* **Stress and scenario limits.** Many funds cap the loss in named scenarios (e.g. "2008 replay ≤ 15% of NAV") because VaR says little about extreme events.
* **Investor reporting.** VaR, ES, volatility, Sharpe, Sortino, max drawdown and Calmar are standard in hedge-fund factsheets and due-diligence questionnaires.

## 14. Limitations and model risk

* **Short history.** Two years (one year by default) contains few extreme days; 99% estimates rest on 2–5 observations. Results can move a lot when the window changes.
* **Stationarity.** All methods assume the future resembles the window. Regime changes (rates, energy shocks, M&A situations in banks) break this.
* **Liquidity and data quality.** VaR assumes positions can be held or exited at closing prices. One stock (Oil & Energy 3) trades thinly on the Frankfurt venue. Comparing with its primary listing converted to EUR (long-term data) shows that its Frankfurt quotes before mid-2025 were far too low: the Frankfurt series implies a two-year return of about +440%, the primary listing about +230%, and the weekly returns of the two series correlate only 0.62 (all other stocks about 0.95 or higher). This inflates that stock's kurtosis and returns in the short-term layer and can distort HS and Cornish–Fisher. Replacing it with the primary-listing series would be the natural fix. Real liquidation costs are ignored.
* **Square-root-of-time.** Approximate for multi-day horizons (§7).
* **No currency, dividend or transaction-cost effects** beyond what is in the adjusted prices; all prices are in EUR.
* **Hypothetical scenarios are judgement calls**, not predictions.
* **Optimised weights are in-sample** and would perform worse out of sample.
* This is an educational tool, not investment advice.

## 15. Code reference

```
assets/risk.js            Layer 1: RiskCore (pure maths) + RiskTab (Short-term risk tab)
assets/ltrisk.js          Layer 2: LTCore (pure maths) + LTRiskTab (Long-term risk tab), crisis episode definitions
assets/crises.js          Crisis history tab (uses LTCore)
assets/fan.js             fan-chart percentiles and drawing, used by both risk layers
assets/app.js             rest of the dashboard; exposes chart helpers as window.DashKit
data/data.js              2-year Frankfurt prices (layer 1)
data/longterm.js          25-year primary-listing prices (layer 2), CSV copy in data/longterm_prices.csv
python/risk_metrics.py    reference implementation of layer 1
python/longterm_risk.py   reference implementation of layer 2 and the crisis table
docs/RISK_METHODOLOGY.md  this document
docs/CRISIS_HISTORY.md    crisis episodes since 2001
```

`RiskCore` has no DOM dependencies, so every function can be called from the browser console, e.g. `RiskCore.historical(returns, 0.99)`.

| Concept | JavaScript (`window.RiskCore`) | Python (`risk_metrics`) |
|---|---|---|
| Historical VaR/ES | `historical(r, alpha)` | `historical(r, alpha)` |
| Parametric normal | `parametricNormal(r, alpha)` | `parametric_normal(r, alpha)` |
| Cornish–Fisher | `cornishFisher(r, alpha)` | `cornish_fisher(r, alpha)` |
| EWMA volatility | `ewmaSigma(r, lambda)` | `ewma_sigma(r, lam)` |
| EWMA normal VaR | `ewmaNormal(r, alpha)` | `ewma_normal(r, alpha)` |
| Filtered HS | `filteredHS(r, alpha)` | `filtered_hs(r, alpha)` |
| Monte Carlo (normal / t) | `monteCarlo(R, w, alpha, {dist, nu, n, seed})` | `monte_carlo(R, w, alpha, n, dist, nu, seed)` |
| Component VaR | `componentVaR(Sigma, w, alpha)` | `component_var(cov, w, alpha)` |
| Component ES | `componentES(R, w, alpha)` | `component_es(R, w, alpha)` |
| Inverse vol / ERC / min var | `inverseVol`, `equalRiskContribution`, `minVariance` | `inverse_vol`, `equal_risk_contribution`, `min_variance` |
| Rolling backtest | `rollingVaR(r, alpha, model, win)` | `rolling_var(r, alpha, model, win)` |
| Kupiec / Christoffersen | `kupiec(hits, alpha)`, `christoffersen(hits)` | `kupiec(hits, alpha)`, `christoffersen(hits)` |
| Basel zone | `baselZone(x, T, alpha)` | `basel_zone(x, T, alpha)` |
| Performance | `performance(r, rf)`, `drawdowns(r)` | `performance(r, rf)`, `drawdown(r)` |
| Correlation stress | inside `drawCorrStress` | `stressed_var(cov, w, alpha, rho, vol_mult)` |
| Fan chart (next month) | `fanHistorical(r, 21)` + `FanChart.percentiles` | `fan_historical(r, 21)` |

Numerical helpers in `RiskCore`: `normInv` (Acklam's inverse normal, relative error < 1.2·10⁻⁹), `normCdf` via `erf` (Abramowitz–Stegun 7.1.26), `binomCdf`, `covMatrix`, `cholesky`, `rng` (seeded). Note that R is passed as a list of per-stock return columns in JavaScript and as a `T × k` matrix in Python.

**Data flow in the tab:** `load()` turns `window.DATA` into return columns → `compute()` slices the window, builds weights, portfolio returns, the seven estimators and both decompositions → `draw()` renders KPIs, method chart and table, histogram, contributions, pillar table, backtest, stress, performance and weights. Every control writes to the state object `RiskTab.state` and calls `draw()`.

## 16. Validation

The JavaScript and Python implementations were run on the same data for four configurations (equal/1Y/99%, ERC/2Y/97.5%, min-variance/1Y/95%, inverse-vol/2Y/99%):

* Historical, parametric, Cornish–Fisher, EWMA and FHS VaR and ES agree to at least five decimal places (Cornish–Fisher ES to 1·10⁻⁵ because of numerical integration).
* Weights for all schemes agree to four decimals; component VaR and component ES shares agree to four decimals.
* Backtest exception counts are identical for all four models.
* Monte Carlo agrees within sampling error. With 200,000+ paths both converge to the same value (Student-t 99% VaR ≈ 3.22–3.24%, normal ≈ 2.82–2.83% for the default portfolio).

Sanity checks built into the design: component VaR sums exactly to parametric VaR; component ES sums to historical ES; stressed VaR at ρ = 1 equals the sum of stand-alone stock VaRs.

## 17. Extending the code

* **New scenario:** add an entry to `SCENARIOS` (both files).
* **New VaR method:** add a function to `RiskCore` returning `{var, es}` (one-day, fraction of value), register it in `METHODS` and in `compute()`.
* **Other λ for EWMA:** pass `lambda` to `ewmaNormal`/`filteredHS`/`ewmaSigma`.
* **Overlapping h-day returns instead of √h:** build h-day compounded returns and feed them to `historical`.
* **GARCH(1,1)** volatility in place of EWMA, **extreme value theory** (peaks-over-threshold with a generalised Pareto tail) for 99%+ quantiles, and **ES backtests** (Acerbi–Székely) are natural next steps.
* **Live data:** replace `data/data.js` with fresh prices in the same format; everything recalculates.

---

# Part B: Long-term risk

## 18. Why a second layer

Short-term VaR answers "how bad can tomorrow be, given the last year or two?". It cannot answer the question that matters for a long-term allocation: **how much of the money could be gone after one or five years**, including the deep crises that a calm two-year window does not contain. Layer 2 therefore:

* trains on **up to 25 years** of daily data (default: the last 20 years, 23 Oct 2006 – 23 Oct 2026; option: since January 2001), so the 2008 financial crisis, the 2011 euro crisis, the 2020 crash and the 2022 energy shock are all in the sample;
* measures the loss over a **holding period of 1 year (252 trading days) or 5 years (1,260 trading days)**, not over one day;
* compares every figure with the **DAX** over the same period.

Confidence levels: 95%, 97.5%, 99% (default) and 99.9%.

## 19. Long-term data

* **Source:** Yahoo Finance daily dividend-adjusted closes for the nine stocks on their **primary listings** (Xetra, Euronext Paris, Euronext Amsterdam, Warsaw converted to EUR with the EUR/PLN rate), the DAX index and WTI crude oil (USD, context only), from January 2000 to 23 October 2026. File: `data/longterm.js` (CSV copy `data/longterm_prices.csv`), anonymised and rebased to 100 at each series' first date.
* **Calendar:** Xetra trading days (6,809 days). Prices from other venues are aligned by date; holidays of other venues are forward-filled for at most five trading days; FX gaps for at most 25 days (one 17-day gap in August 2008).
* **Cleaning:** a stock joins the universe on its first reliable price. Industry 1 from April 2001 (listing); Oil & Energy 3 from April 2003 (the EUR/PLN series has bad ticks before); Oil & Energy 1 from 20 July 2005 (earlier raw data is not adjusted for a share unification and contains ±30–50% jumps); Industry 3 from 29 September 2020 (listing). After these starts no stock has a gap. Eight remaining daily moves above 25% (six for Industry 1 in 2003–2020, two for Industry 3 in 2023) were kept: none is reversed on the following day, which is the usual signature of a bad tick, and they fall on crisis, rebound or company-news days.
* **Dynamic pillar ETFs:** each pillar's daily return is the equal-weighted average of the members listed that day; the portfolio is the equal-weighted average of the three pillars (1/3 each), rebalanced daily. In the 20-year window only Industry is affected (two members until September 2020).
* **Consistency check with layer 1:** over the two years both data sets overlap, weekly returns of the two price sources correlate 0.95–0.99 for eight of nine stocks and two-year returns agree within about 7 percentage points, which confirms the anonymised mapping. The exception (Oil & Energy 3) is discussed in §14.
* **Timing:** primary listings close at the same time as the DAX, so betas and correlations from this data set are more reliable than those from the Frankfurt floor quotes (which close later). For example, the portfolio's 1-year beta to the DAX is 0.93 here against 0.77 with Frankfurt quotes.

## 20. Five long-horizon estimators

Let `r_1 … r_T` be the portfolio's daily simple returns in the training window, `ℓ_t = ln(1 + r_t)` the log returns, `h` the horizon, `z = Φ⁻¹(α)`. The h-day loss is `L_h = 1 − Π_{t}^{t+h−1}(1 + r_t) = 1 − exp(Σ ℓ)`. Losses are capped at 100% because a long-only portfolio cannot lose more than it holds.

### 20.1 Historical simulation on overlapping holding periods

Compute the compounded return of every h-day window that starts on a trading day of the sample (using prefix sums of log returns), then apply the historical estimators of §6.1:

```
R_h(t) = exp( Σ_{k=t}^{t+h−1} ℓ_k ) − 1,      t = 1 … T−h+1
VaR = Q_α(−R_h),   ES = mean{ −R_h : −R_h ≥ VaR }
```

*Strength:* uses actual paths, including crisis sequences. *Weakness:* windows overlap heavily; 20 years contain about 20 independent 1-year periods and only 4 independent 5-year periods, so at 5 years the historical tail is essentially "the 2007–2012 path".

### 20.2 Moving-block bootstrap

Simulate 10,000 holding periods by concatenating randomly chosen blocks of 63 consecutive trading days (≈ 3 months) from the training data (Künsch 1989; Politis & Romano 1994), and apply the historical estimators to the simulated returns. Blocks keep short-term autocorrelation and volatility clustering inside each block; random recombination creates many more plausible long paths than history contains. Seeded random numbers make the dashboard reproducible.

### 20.3 Lognormal (geometric Brownian motion)

Assume daily log returns are i.i.d. normal with mean μ and volatility σ estimated from the window. Over h days `ln(1 + R_h) ~ N(m, s²)` with `m = μh`, `s = σ√h`:

```
VaR = 1 − exp(m − z s)
ES  = 1 − exp(m + s²/2) · Φ(−z − s) / (1 − α)
```

Unlike √h scaling, it includes the drift and compounding (a 5-year position has positive expected growth) and can never exceed 100%. It ignores fat tails and volatility regimes.

### 20.4 Square-root-of-time (for comparison)

`VaR_h = VaR_1 · √h`, `ES_h = ES_1 · √h` with historical 1-day figures, capped at 100%. This is the regulatory shortcut of §7. Over a year it multiplies the daily figure by 15.9, over five years by 35.5; it ignores both drift and compounding and the fact that a long-only loss is bounded, so it massively overstates long-horizon risk. It is shown to make that point.

### 20.5 Stressed volatility (lognormal)

Inspired by Basel 2.5 *stressed VaR*: find the 252-day window with the highest volatility of daily log returns in the training data (for the portfolio: 17 Jul 2008 – 15 Jul 2009, 60% annualised) and use that σ in the lognormal formula with the long-run drift μ. It answers "what if the next year or five years were as turbulent as the worst year we have seen?". Using the crisis-year drift as well would compound a crash for five years and is deliberately avoided.

## 21. Range of outcomes, drawdowns and long-run correlations

* **Fan chart:** the value of the investment along the holding period for the portfolio, any pillar ETF or the DAX (with the DAX median and VaR boundary as an optional overlay). It is built from the same 10,000 block-bootstrap paths as §20.2, recorded every 5 trading days (1-year horizon) or every 21 (5-year horizon); the generator replays the same random numbers, so the end points are **identical** to the bootstrap distribution behind the tables. Bands: median, 25–75%, 10–90%, 5–95%, 1–99%; red dashed line: the (1 − α) quantile at every date (the VaR boundary); markers at the horizon: median, VaR and ES. Twelve evenly spaced sample paths show what individual paths look like. The note under the chart reports the share of paths ending below the start, losing more than 25% and more than 50%.
* **Range of outcomes:** percentiles (1st, 5th, 25th, median, 75th, 95th) of the bootstrapped holding-period return, the probability of a loss `P(R_h < 0)`, VaR and ES, for each pillar ETF, the portfolio and the DAX.
* **Rolling holding-period return:** `R_h` for a position bought on each date since 2001, plotted at the end of the holding period, with the crisis episodes shaded.
* **Drawdowns:** `DD_t = V_t / max_{s≤t} V_s − 1` since 2001, with maximum drawdown, trough date, the longest time under water (days between a peak and the next new high, or until today) and today's distance from the peak.
* **Long-run correlations:** rolling 252-day correlations of daily returns between the pillar ETFs since 2001, today's value, the long-run median and today's percentile rank.
* **Long-run performance:** CAGR, volatility, Sharpe ratio (2% risk-free rate), maximum drawdown, worst and best calendar year, number of positive years and beta to the DAX over the training window, plus a calendar-year return table since 2001.

## 22. Long-term results snapshot

Last 20 years (23 Oct 2006 – 23 Oct 2026), €15,000, equal pillar weights:

| Method | 1-year VaR 99% | 1-year ES 99% | DAX VaR / ES | 5-year VaR 99% | 5-year ES 99% | DAX VaR / ES |
|---|---:|---:|---:|---:|---:|---:|
| Historical (overlapping) | 51.4% (7,713 €) | 54.1% | 39.9% / 42.2% | 54.0% | 56.6% | 19.4% / 22.8% |
| Block bootstrap | 49.3% (7,394 €) | 56.2% | 35.0% / 40.6% | 69.5% | 76.0% | 49.9% / 57.3% |
| Lognormal | 43.8% | 48.7% | 34.1% / 38.5% | 66.0% | 72.0% | 52.3% / 58.9% |
| Square-root-of-time | 82.4% | 100% (capped) | 60.4% / 81.2% | 100% | 100% | 100% / 100% |
| Stressed volatility | 73.0% | 77.6% | 59.3% / 64.3% | 93.4% | 95.5% | 83.7% / 87.7% |

(Bootstrap figures are from the browser; the Python script gives 49.8% / 56.9% at 1 year and 68.3% / 75.0% at 5 years, within sampling error.)

* **Probability of a loss** (bootstrap): 36% over one year and 26% over five years (DAX 32% and 20%). Median outcome +10.4% over one year, +51% over five years.
* **Worst actual periods:** 1 year −59.4% (31 Oct 2007 – 28 Oct 2008); 5 years −58.7% (17 Jul 2007 – 26 Jun 2012).
* **Drawdowns since 2001:** portfolio −70.1% (trough 9 Mar 2009), DAX −67.6% (trough 12 Mar 2003); the banking ETF fell −93.4% (trough 15 May 2020) and has not regained its 2007 peak. After the financial crisis the portfolio needed about 14 years to regain its 2007 level.
* **Long-run performance (20 years):** portfolio CAGR 7.9% at 28.0% volatility, DAX 7.2% at 20.9%; beta to the DAX 1.11; Sharpe 0.34 for both.
* **Correlations:** the 1-year correlation between the banking and oil & energy ETFs is −0.05 today, the lowest reading since 2001 (long-run median 0.50). Banking × Industry is 0.54 (median 0.46), Industry × Oil & Energy 0.17 (median 0.40).

**Interpretation.** Over 20 years the three-pillar portfolio has delivered slightly more return than the DAX but with clearly larger tail risk: its 1-year 99% VaR is roughly 50% of the money against roughly 35–40% for the DAX, and its worst drawdown was deeper. The reason is the banking pillar, whose crises (2008, 2011) were far worse than the market's. The very low pillar correlations of the last year, the core of the project's thesis, are unusual by historical standards. A long-term investor should plan with the long-run figures, not with the recent ones; risk-parity or defensive pillar weights reduce the gap (see CRISIS_HISTORY.md, implementation section).

## 23. Long-term limitations

* **Few independent observations.** At 1 year about 20, at 5 years about 4 in 20 years of data. All long-horizon tail estimates are uncertain; read them as orders of magnitude, and compare methods.
* **Survivorship and selection.** The nine stocks were chosen today. Companies that failed or were taken over in the past are not in the data, which flatters long-run returns and may understate risk.
* **Changing universe.** Some pillars had two members in some years; the risk of a two-stock pillar is higher than that of a three-stock pillar.
* **Venue difference.** Layer 2 uses primary listings, layer 1 uses Frankfurt floor quotes; the two layers are therefore not exactly the same price series (see §19).
* **Bootstrap assumptions.** Block length (63 days) is a judgement; it captures clustering within a quarter but not multi-year regimes such as a decade of negative interest rates.
* **Stationarity.** The past 20 years include zero and negative interest rates for a long stretch, which shaped bank returns. The next 20 may differ.

## 24. Long-term code reference

| Concept | JavaScript (`window.LTCore`) | Python (`longterm_risk`) |
|---|---|---|
| Pillar ETFs, portfolio, DAX returns | `build()` | `load()` |
| Training window | `trainingIndex(B, '20y' \| 'all')` | `training_start(dates, train)` |
| Overlapping h-day returns | `overlapping(r, h)` | `overlapping(r, h)` |
| VaR/ES from returns | `varEsFromReturns(rets, alpha)` | `var_es(returns, alpha)` |
| Block bootstrap | `bootstrap(r, h, {paths, block, seed})` | `bootstrap(r, h, paths, block, seed)` |
| Fan-chart paths / percentiles | `fanPaths(r, h, {step})` + `FanChart.percentiles` (`assets/fan.js`) | `fan_bootstrap(r, h, step=...)` |
| Lognormal | `lognormal(mu, sigma, h, alpha)` | `lognormal(mu, sigma, h, alpha)` |
| Square-root-of-time | `sqrtTime(r, h, alpha)` | `sqrt_time(r, h, alpha)` |
| Stressed window | `stressedWindow(r, dates)` | `stressed_window(r, dates)` |
| All estimators | `estimate(r, dates, h, alpha)` | `estimate(r, dates, h, alpha)` |
| Drawdowns | `drawdownStats(r, dates)` | `drawdown(r)` |
| Rolling correlation | `rollingCorr(a, b, w)` | `rolling_corr(a, b, w)` |
| Crisis episodes | `EPISODES`, `SUB_EVENTS`, `episodeStats(B, ep)` | `EPISODES`, `episode_table(px, R)` |

Command line:

```bash
python python/longterm_risk.py                               # 1-year, 99%, last 20 years
python python/longterm_risk.py --horizon 1260 --alpha 0.975  # 5-year, 97.5%
python python/longterm_risk.py --train all                   # since 2001
python python/longterm_risk.py --crises                      # crisis-episode table
python python/longterm_risk.py --fan --horizon 1260          # fan-chart percentiles (€)
python python/risk_metrics.py --fan                          # short-term fan chart, next 21 days (€)
```

## 25. Long-term validation

* Both implementations read the same anonymised prices (5 significant digits). Across 36 configurations (training 20y / since 2001 × horizon 1y / 5y × α 95% / 99% / 99.9% × portfolio, DAX, banking ETF):
  * historical (overlapping) and square-root-of-time VaR and ES are identical to machine precision;
  * lognormal and stressed-volatility VaR and ES agree within 0.007 percentage points (the browser uses a polynomial approximation of the normal CDF);
  * the stressed window is identical in every case (for the portfolio, 17 Jul 2008 – 15 Jul 2009).
* The long-term fan chart's end points equal the browser's bootstrap returns exactly (largest difference 1·10⁻¹⁴ over 10,000 paths at both horizons). Python fan percentiles agree within sampling noise (1-year median value 16,559 € in the browser vs 16,520 € in Python for €15,000; 5-year median 22,663 € vs 22,656 €; next-month interquartile range 14,755–15,953 € vs 14,739–15,941 €).
* Bootstrap results differ only by sampling noise from different random-number generators: at most 1.3 percentage points at 95%, 2.0 at 99% and 3.9 at 99.9% (for example 1-year portfolio VaR 99%: 49.3% vs 49.8%).
* The crisis-episode table (peak and trough dates, returns of the DAX, portfolio and pillars, recovery times) is identical in both implementations for all twelve episodes and sub-events.
* Sanity checks: the DAX drawdown of −67.6% to 12 March 2003 and of −54.8% to 6 March 2009 match the well-known index history; the WTI series shows its negative close of 20 April 2020.

## 26. Glossary

| Term | Meaning |
|---|---|
| α (confidence level) | Probability that the loss stays below VaR, e.g. 99% |
| Basel traffic light | Regulatory zones (green/yellow/red) based on backtest exceptions |
| Component VaR/ES | A position's additive share of portfolio VaR/ES (Euler allocation) |
| Cornish–Fisher | Quantile correction for skewness and kurtosis |
| Drawdown | Fall from the running peak of portfolio value |
| ERC / risk parity | Weights that make every position contribute equally to risk |
| ES / CVaR | Average loss beyond VaR |
| EWMA | Exponentially weighted moving average volatility (RiskMetrics) |
| Exception | A day when the loss exceeded the forecast VaR |
| FHS | Filtered historical simulation: HS on volatility-rescaled returns |
| FRTB | Fundamental Review of the Trading Book (Basel market-risk rules, 97.5% ES) |
| Kurtosis (excess) | Tail heaviness relative to a normal distribution (normal = 0) |
| Marginal VaR | Change in VaR per unit increase in a position's weight |
| Sub-additivity | Risk(A+B) ≤ Risk(A) + Risk(B); ES has it, VaR may not |
| VaR | Loss quantile at confidence α over a horizon |
| Block bootstrap | Resampling blocks of consecutive days to simulate new return paths |
| Holding period | The horizon over which a loss is measured (here up to 5 years) |
| Overlapping windows | Holding periods starting on consecutive days; they share most of their days |
| Stressed VaR | VaR calibrated on the most turbulent period in the data (Basel 2.5) |

## 27. References

* Acerbi, C. & Székely, B. (2014). *Backtesting Expected Shortfall.* Risk.
* Artzner, P., Delbaen, F., Eber, J.-M. & Heath, D. (1999). *Coherent Measures of Risk.* Mathematical Finance 9(3).
* Barone-Adesi, G., Giannopoulos, K. & Vosper, L. (1999). *VaR without Correlations for Portfolios of Derivative Securities.* Journal of Futures Markets 19(5).
* Basel Committee on Banking Supervision (1996). *Supervisory Framework for the Use of Backtesting in Conjunction with the Internal Models Approach.*
* Basel Committee on Banking Supervision (2019). *Minimum Capital Requirements for Market Risk* (FRTB).
* Christoffersen, P. (1998). *Evaluating Interval Forecasts.* International Economic Review 39(4).
* Duchi, J., Shalev-Shwartz, S., Singer, Y. & Chandra, T. (2008). *Efficient Projections onto the ℓ1-Ball.* ICML.
* Favre, L. & Galeano, J.-A. (2002). *Mean-Modified Value-at-Risk Optimization with Hedge Funds.* Journal of Alternative Investments 5(2).
* Hull, J. & White, A. (1998). *Incorporating Volatility Updating into the Historical Simulation Method for VaR.* Journal of Risk 1(1).
* J.P. Morgan / Reuters (1996). *RiskMetrics — Technical Document*, 4th ed.
* Jorion, P. (2006). *Value at Risk: The New Benchmark for Managing Financial Risk*, 3rd ed. McGraw-Hill.
* Kupiec, P. (1995). *Techniques for Verifying the Accuracy of Risk Measurement Models.* Journal of Derivatives 3(2).
* Maillard, S., Roncalli, T. & Teïletche, J. (2010). *The Properties of Equally Weighted Risk Contribution Portfolios.* Journal of Portfolio Management 36(4).
* McNeil, A., Frey, R. & Embrechts, P. (2015). *Quantitative Risk Management*, revised ed. Princeton University Press.
* Tasche, D. (2000). *Risk Contributions and Performance Measurement.* Working paper, TU München.
* Basel Committee on Banking Supervision (2009). *Revisions to the Basel II Market Risk Framework* (Basel 2.5, stressed VaR).
* Danielsson, J. & Zigrand, J.-P. (2006). *On Time-Scaling of Risk and the Square-Root-of-Time Rule.* Journal of Banking & Finance 30(10).
* Künsch, H. (1989). *The Jackknife and the Bootstrap for General Stationary Observations.* Annals of Statistics 17(3).
* Politis, D. & Romano, J. (1994). *The Stationary Bootstrap.* Journal of the American Statistical Association 89(428).
