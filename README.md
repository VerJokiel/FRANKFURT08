# Three-Pillar ETF Dashboard

An interactive dashboard for a portfolio of **nine Frankfurt-listed stocks grouped into three equal-weighted mini-ETFs**, one per investment pillar: **Banking**, **Industry** and **Oil & Energy**. It measures weekly volatility and return correlation for every stock and every pillar ETF.

**The main finding: the pillars move remarkably independently.** Over the last year:

- the three pillar ETFs had an average daily-return correlation of only **0.23**; the Oil & Energy ETF correlated just **0.06** with Banking and **0.15** with Industry;
- stocks from *different* pillars averaged **0.13**, against **0.34** for stocks in the *same* pillar;
- holding all three ETFs cut annualised volatility to **20.0%**, against **28.0%** for the average pillar ETF and **37.6%** for the average single stock.

> Company names are anonymised (Banking 1, Banking 2, … Oil & Energy 3) and prices are rebased to 100, so the dashboard shows relative moves only.

## Portfolio rationale

The portfolio is built in two layers:

1. **Pillar ETFs.** For each investment pillar, three stocks are combined into an equal-weighted basket (each stock = 1/3 of its ETF, rebalanced daily). This spreads company-specific risk inside the pillar.
2. **Combining the pillars.** The three ETFs are held in equal parts (each stock = 1/9 of the portfolio). Because the pillars are driven by different economic forces, their returns partly offset each other, which lowers the risk of the whole portfolio far more than adding another stock from a pillar already held.

| Pillar ETF | Stocks | Main return drivers |
|---|---|---|
| **Banking** | 3 | Interest rates and the yield curve, the credit cycle, regulation and capital returns |
| **Industry** | 3 | Corporate investment cycles and order books, grid, wind and power equipment for the energy transition, project execution |
| **Oil & Energy** | 3 | Crude prices and refining margins, power prices and renewable generation, geopolitics and supply shocks |

An oil price spike lifts oil producers but raises costs for industrial companies; a change in interest rates moves banks far more than turbine makers or utilities. Mixing integrated oil companies with a renewable power producer inside the Oil & Energy pillar also spreads that pillar across fossil and green energy.

## What's in the dashboard

- **Overview**: the rationale, growth of 100 for the three pillar ETFs and the combined portfolio, the 3×3 ETF correlation matrix with ETF and portfolio volatility, plus stock-level correlation within vs across pillars.
- **Weekly volatility**: a sortable table of every stock, ETF and the combined portfolio; weekly volatility over time (filter by stock, pillar or ETFs); a heatmap with each pillar's stocks above its ETF; and the weekly volatility of each pillar ETF.
- **Investment thesis**: the qualitative case for the three pillars and a systematic-risk check vs the DAX (see below).
- **Correlation matrix**: switch between the 9×9 stock matrix and the 3×3 ETF matrix, choose the window (3M / 6M / 1Y / 2Y) and return frequency (daily / weekly), and click any cell to see the rolling 3-month correlation of that pair.
- **Short-term risk** (risk layer 1): VaR and Expected Shortfall over 1 day to 1 month at up to 99.9%, risk decomposition, backtesting and stress tests (see below).
- **Long-term risk** (risk layer 2): VaR and Expected Shortfall over 1-year and 5-year holding periods, trained on 20–25 years of data, with drawdowns, long-run correlations and performance vs the DAX (see below).
- **Crisis history**: the ten worst market episodes since 2001, what they did to each pillar, what a replay would cost today, and a crisis playbook (see below).

## DAX market page (`dax.html`)

A separate page, linked as **DAX market** in the tab bar, shows the current state of the German market for all 40 DAX members, from 5-minute bars during the session and daily closes:

- **Index:** close in points and daily change, 1-month / year-to-date / 1-year return, 21-day realised volatility, distance from the 52-week high, 1-day historical VaR 99% and ES 97.5%, level against the 200-day average, drawdown.
- **Market map:** all members sized by index weight and coloured by return over 1 day, 1 week, 1 month, year to date or 1 year, with the five biggest gainers and losers.
- **Market internals:** advancers and decliners, share of members above their 50- and 200-day averages, new 52-week highs and lows, average pairwise correlation (3 months) and cross-sectional dispersion.
- **Sectors:** weight, returns, volatility and internal correlation for nine sectors.
- **Rates and currency:** ECB deposit rate, 10-year euro area AAA yield and EUR/USD.

**Live updates:** GitHub starts frequent scheduled jobs late or skips them, so the live layer runs as one long job per Xetra session. `.github/workflows/live-dax40.yml` has several redundant morning start times; the first that fires runs `python/live_loop.py`, which waits for the 09:00 open and then, on its own 5-minute clock, fetches 5-minute bars for the DAX and all 40 members (`python/build_live.py`) and force-pushes them as `live.json` to the `live-data` branch (one commit, so history stays small). Before the 6-hour job limit it starts a fresh run of itself; after the close it commits the official daily closes (the separate daily workflow stays as a backup). Later start times queue behind the running job and exit when there is nothing to do. The page checks that file through the GitHub API every 30 seconds and, on each new bar, adds today's prices to every view and recomputes the correlation matrix, which it draws three ways: a Chart.js heatmap, a D3 force-directed network (minimum spanning tree or threshold) and Cytoscape.js sector clusters. Correlation windows: today or five sessions of 5-minute returns, five sessions of 30-minute returns, or 3 months / 1 year of daily returns. Yahoo delays Xetra quotes by about 15 minutes and GitHub can start scheduled jobs late, so live figures trail the market by roughly 15–25 minutes; real-time Xetra data needs a paid licence. A box at the top of the page says when the next intraday bar and the next daily update are due (Frankfurt time, skipping weekends and Xetra holidays), flags a late scheduled run, and logs each update received while the page is open. Every panel also carries its own update line (what data it shows, when it next changes), and live-fed panels flash briefly when a new bar arrives.

**Data sources (free, no API key):** Yahoo Finance through the open-source [yfinance](https://github.com/ranaroussi/yfinance) library (Stooq CSV as fallback) and the [ECB Data Portal](https://data.ecb.europa.eu) API. A static site cannot call these from the browser, so the GitHub Actions workflow `.github/workflows/update-dax40.yml` runs `python/build_dax40.py` on weekdays at 18:20 UTC, after the Xetra close, and commits `data/dax40.js`. It can also be started by hand under *Actions → Update DAX market data → Run workflow*, or locally:

```bash
pip install yfinance pandas numpy requests
python python/build_dax40.py --period 2y
```

If the DAX or more than four members fail to download, the script stops and the last good data stays online. Index weights are approximated from market capitalisation with the 15% single-name cap; the member list in the script follows the 30 Oct 2026 index list and needs updating after each quarterly review.

## Investment thesis (qualitative analysis)

The **Investment thesis** tab explains why these three pillars form a strategy: they are the sectors the real economy cannot run without (they **finance**, **build** and **power** it), their value rests on current, often contracted revenues, and they respond to different macro shocks, so their cycles offset each other. It includes a macro-shock map, risks to the thesis, a monitoring checklist, and a quantitative test of the systematic-risk claim against the DAX:

- portfolio beta to the DAX **0.67–0.77**; the market explains only **31–38%** of its daily variance;
- the portfolio fell **55–70%** as much as the DAX on down days but rose **~95%** as much on up days;
- the Oil & Energy ETF has a beta near **0**, providing most of the cushion; correlations between pillars do rise in sell-offs, so systemic shocks are softened, not removed.

Full write-up: **[docs/INVESTMENT_THESIS.md](docs/INVESTMENT_THESIS.md)**.

## Risk analytics: two layers

### Layer 1: Short-term risk

The **Short-term risk** tab applies the risk toolkit used by hedge-fund risk desks to the portfolio, estimated from the last 1–2 years of daily Frankfurt prices (estimation window: last 1 year or full 2 years):

- **VaR and Expected Shortfall** at 95% / 97.5% / 99.9% (default 99.9%, a 1-in-1,000-day loss), for 1-day to 1-month horizons and any portfolio value (default €15,000), estimated seven ways: historical simulation, parametric normal, Cornish-Fisher, EWMA (RiskMetrics), filtered historical simulation, and Monte Carlo with normal and Student-t shocks.
- **Five weighting schemes:** equal, pillar mix (sliders), inverse volatility, equal risk contribution (risk parity) and minimum variance.
- **Risk decomposition:** component VaR and component ES by stock and pillar (Euler allocation), stand-alone vs diversified VaR.
- **Backtesting:** rolling out-of-sample VaR with Kupiec and Christoffersen tests and the Basel traffic light.
- **Stress testing:** worst historical day, week, month and drawdown, six hypothetical pillar shocks, and correlation/volatility stress.
- **Risk-adjusted performance:** Sharpe, Sortino, Calmar, max drawdown, skewness, kurtosis.
- **Fan chart:** 10,000 resampled paths of the portfolio value over the next 21 trading days, with percentile bands, the VaR boundary and VaR/ES markers at the selected horizon.

With €15,000 in equal weights the 1-day 99.9% VaR is about **520 €** (historical) and the ES about **550 €**.

### Layer 2: Long-term risk

The **Long-term risk** tab answers how much could be lost over a **1-year or 5-year holding period**, trained on up to 25 years of daily prices of the same nine stocks on their primary listings (last 20 years by default, or since 2001):

- **Five long-horizon estimators:** historical overlapping holding periods, moving-block bootstrap (10,000 paths of 3-month blocks), lognormal (GBM), square-root-of-time (for comparison) and stressed volatility (most turbulent 12 months, Basel 2.5 style); all compared with the DAX.
- **Fan chart:** how €15,000 could evolve over 1 or 5 years (10,000 block-bootstrap paths): median, 50/80/90/98% bands, the VaR boundary and VaR/ES at the horizon, for the portfolio, each pillar ETF or the DAX, with the DAX as an overlay.
- **Range of outcomes:** percentiles, probability of a loss, median outcome for each pillar ETF, the portfolio and the DAX.
- **History:** rolling 1- and 5-year returns with crisis episodes, drawdowns and time under water since 2001, rolling pillar correlations since 2001, long-run performance and calendar-year returns.

Key results (last 20 years, 99%): 1-year VaR about **49–51%** of the money for the portfolio vs **35–40%** for the DAX; 5-year bootstrap VaR about **70%** vs **50%**; worst drawdown −70% (2009). Pillar correlations over 20 years were mostly around 0.4–0.5; the very low values of the last year are historically unusual.

### Crisis history

The **Crisis history** tab replays the dot-com bust and 9/11, the 2008 financial crisis, the euro crisis, the 2014–16 oil collapse, Brexit, Q4 2018, COVID-19, the 2022 energy shock, the 2023 banking turmoil and the 2025 tariff shock. The portfolio lost less than the DAX in the real-economy shocks (dot-com, 2022, 2025) and more in the seven bank-, credit- or liquidity-driven episodes; the banking pillar was the hardest-hit pillar in 8 of 10. An implementation section compares equal, risk-parity and defensive pillar weights across all episodes and ends with a crisis playbook.

### Documentation and code

- **[docs/RISK_METHODOLOGY.md](docs/RISK_METHODOLOGY.md)**: concepts, formulas, code reference and validation for both layers.
- **[docs/CRISIS_HISTORY.md](docs/CRISIS_HISTORY.md)**: the crisis episodes, lessons and implementation.
- Python reference implementations that reproduce the dashboard's numbers:

```bash
pip install numpy pandas
python python/risk_metrics.py --value 15000 --alpha 0.999 --horizon 1 --window 252 --weights equal   # layer 1
python python/longterm_risk.py --horizon 252 --alpha 0.99 --train 20y                                # layer 2, 1 year
python python/longterm_risk.py --horizon 1260                                                        # layer 2, 5 years
python python/longterm_risk.py --crises                                                              # crisis table
```

## Method

- **Data:** daily closing prices from Yahoo Finance, Frankfurt listings in EUR, 23 Oct 2024 – 23 Oct 2026 (`data/prices_indexed.csv`, rebased to 100). The long-term layer and crisis history use daily prices of the same stocks on their primary listings (Xetra, Euronext, Warsaw in EUR) since 2000 (`data/longterm_prices.csv`, `data/longterm.js`), anonymised and rebased.
- **Pillar ETFs:** daily return = average of the three members' daily simple returns (equal weight, rebalanced daily, no costs). The combined portfolio averages the three ETF returns.
- **Returns:** daily log returns, `ln(Pₜ / Pₜ₋₁)`. Weekly returns are the sum of daily log returns within a calendar week.
- **Weekly volatility:** standard deviation of a week's daily log returns × √252 (annualised). Weeks with fewer than three trading days are excluded.
- **Correlation:** Pearson correlation over the selected window using all dates where both series traded. Pillar averages are the mean of all pairwise correlations in that group.
- **Rolling correlation:** 63-trading-day window, sampled every 5 trading days.
- **Colour scales:** the volatility heatmap runs green (calm) → yellow → red (turbulent), scaled to the 10th–90th percentile of all cells; correlation matrices and pair lists run green (independent, ≤ 0) → yellow (≈ 0.3) → red (moves together, ≥ 0.8).
- **Design:** two palettes defined as CSS variables in `assets/style.css`. Analysis tabs use deep midnight navy (#13233F) and forest sage (#3E5F44) panels with warm alabaster (#F3EFE6) and gold (#C9A55A) accents. The two risk tabs use light fintech panels with teal (#24BDC8), so risk metrics stand apart at a glance. Headings are set in Newsreader and body text in Inter.

## Run it

No build step, just static files.

- **Locally:** open `index.html` in a browser (needs internet access for the d3 library from cdnjs).
- **GitHub Pages:** push this folder to a repository, then *Settings → Pages → Deploy from a branch → `main` / root*. The dashboard will be live at `https://verjokiel.github.io/FRANKFURT08/#vol`.

```
├── index.html             page layout and text
├── dax.html               DAX market page (5-minute live layer + daily data)
├── .github/workflows/
│   ├── live-dax40.yml     session-long job: 5-minute bars to the live-data branch, daily closes after the close
│   └── update-dax40.yml   daily closes for dax.html
├── assets/
│   ├── app.js             overview, volatility and correlation tabs (d3 v7)
│   ├── risk.js            risk layer 1: short-term VaR / ES engine and tab
│   ├── ltrisk.js          risk layer 2: long-term VaR / ES engine and tab, crisis episodes
│   ├── crises.js          Crisis history tab
│   ├── fan.js             fan charts (both risk layers)
│   ├── thesis.js          systematic-risk check vs the DAX (Investment thesis tab)
│   ├── dax.js             DAX market page: daily views, rebuilt with live prices
│   ├── dax-live.js        live polling, intraday chart, correlation matrix / network / clusters
│   └── style.css          styling, light and dark mode, phone layout
├── data/
│   ├── data.js            price data loaded by the page
│   ├── prices_indexed.csv same data as CSV
│   ├── benchmark_dax.csv  DAX benchmark, rebased to 100
│   ├── longterm.js        25-year daily prices (primary listings) for the long-term layer
│   ├── longterm_prices.csv same data as CSV
│   ├── dax40.js           DAX market data (generated by the daily job)
│   └── dax40_prices.csv   same closes as CSV
├── python/
│   ├── risk_metrics.py    reference implementation of risk layer 1
│   ├── longterm_risk.py   reference implementation of risk layer 2 and the crisis table
│   ├── build_dax40.py     fetches DAX member prices, market caps and ECB rates
│   ├── build_live.py      fetches 5-minute bars for the live layer
│   ├── live_loop.py       runs the live layer through a whole session (one job per day)
│   └── requirements.txt   Python packages for both data jobs
└── docs/
    ├── INVESTMENT_THESIS.md qualitative case and systematic-risk analysis
    ├── RISK_METHODOLOGY.md risk concepts, formulas, code reference (both layers)
    └── CRISIS_HISTORY.md   worst-case episodes since 2001 and implementation
```

## Limitations

- Correlations change over time; the long-term layer shows they were much higher (around 0.4–0.5) for most of the last 20 years than in the last two, and they rise in broad sell-offs.
- The Frankfurt quotes of one Oil & Energy stock before mid-2025 are unreliable (far below its primary listing in EUR), which overstates that stock's two-year return in the short-term tabs; the long-term data use the primary listing.
- Banking and Industry are moderately linked at ETF level (≈0.47 over the last year); most of the diversification comes from Oil & Energy.
- One Oil & Energy stock trades thinly on the Frankfurt venue, so isolated stale quotes can inflate its weekly volatility.
- The ETFs are hypothetical baskets, not traded funds. For educational purposes only; this is not investment advice.

## Legal Disclaimer

The information provided [on this platform / in this document] is for informational and educational purposes only and does not constitute general or personal investment advice, a personal recommendation, or an offer or solicitation to buy or sell any financial instruments.

This content has not been prepared in accordance with legal requirements designed to promote the independence of investment research. It does not take into account the specific investment objectives, financial situation, or particular needs of any individual recipient.

Any investment service or financial instrument mentioned may not be suitable for all investors. Accordingly, no representation or warranty, express or implied, is made as to the accuracy or completeness of the information, and any decision to invest is made solely at the user's risk. Within the meaning of Directive 2014/65/EU (MiFID II), this content is deemed generic information or marketing communication and does not establish a fiduciary or advisory relationship.

