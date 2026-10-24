# Investment thesis: why Banking, Industry and Oil & Energy

This is the qualitative case for the three-pillar strategy, with a quantitative check of its central claim about systematic risk. It accompanies the **Investment thesis** tab of the dashboard. For risk measurement (VaR, Expected Shortfall, backtests, stress tests), see [RISK_METHODOLOGY.md](RISK_METHODOLOGY.md).

## The idea in one sentence

> Own the three sectors the real economy cannot run without, the ones that **finance** it, **build** it and **power** it, through companies whose value rests on **today's revenues**, and let their different cycles offset each other.

The portfolio holds three equal-weighted mini-ETFs of three Frankfurt-listed stocks each (each stock = 1/3 of its pillar, 1/9 of the portfolio, rebalanced to target).

---

## 1. The backbone of the economy

Every economic activity needs three inputs: **credit**, **physical capacity** and **energy**. Households and firms can postpone a new phone or a holiday; they cannot stop using payment systems, maintaining plants or buying electricity. The three pillars sit at these choke points of the economy.

| | Banking: *finances* the economy | Industry: *builds* the economy | Oil & Energy: *powers* the economy |
|---|---|---|---|
| **Role** | Turns savings into loans, runs payments, underwrites trade and investment | Makes and maintains physical capital: power plants, grids, turbines, process plants, industrial services | Supplies fuels and electricity, from integrated oil and refining to renewable generation |
| **Revenue engine** | Net interest income; fees from payments, asset management, capital markets | Order backlog converted into sales over several years; recurring service and maintenance contracts | Sales of crude, gas, refined products and power; long-term power purchase agreements, regulated returns |
| **Demand driver** | Loan growth, level and shape of interest rates, business and trade activity | Corporate and public investment budgets, energy transition, electrification | Energy consumption, commodity and power prices, refining margins |
| **Structural tailwind** | Positive interest rates after a decade at zero; consolidation and capital returns in European banking; financing Europe's investment wave | Germany's €500 bn Special Fund for Infrastructure and Climate Neutrality (approved March 2025, investments over 12 years, incl. €100 bn for the Climate and Transformation Fund); the EU's estimate of €584 bn grid investment needed this decade | Rising electricity demand from electrification and data centres; energy security after 2022; mixing oil with renewables spreads the pillar across both energy worlds |
| **Key indicators** | Net interest margin, CET1 ratio, cost of risk, cost/income ratio | Order intake, book-to-bill, backlog, service share, margins, free cash flow | Oil and gas prices, refining margins, power prices, volumes, capex discipline, dividends |

## 2. Why "revenue-driven" matters

What the three pillars have in common:

1. **Essential demand.** Credit, industrial maintenance and energy are needed in every phase of the cycle; volumes fall less than for discretionary goods.
2. **Visible, often contracted revenue.** Loan books, multi-year order backlogs, service contracts and power purchase agreements give earnings visibility.
3. **Value anchored in current earnings.** A large part of the share price is backed by profits and dividends earned now rather than in ten years. Such "short-duration" equities are less sensitive to rising discount rates than long-duration growth stocks, whose valuations depend on distant cash flows.
4. **Inflation pass-through.** Banks earn more when rates rise with inflation, energy companies sell at market prices, and industrial contracts are often index-linked, giving the portfolio a natural hedge against inflation.
5. **Cash returns.** Mature, cash-generative businesses tend to pay dividends and buy back shares, adding a steady component to total return.

**The honest caveat.** Revenue-driven does not mean defensive. All three pillars are *cyclical*: bank profits fall as loan losses rise in a recession, industrial orders are postponed when clients delay investment, and energy earnings swing with commodity prices. The strategy does not rely on any single pillar being safe; it relies on the pillars being exposed to **different** cycles, so that a bad year for one is rarely a bad year for all three.

## 3. Different shocks hit different pillars

Typical first-order effects (▲ helps, ▼ hurts, ● limited). These are qualitative tendencies, not forecasts.

| Macro shock | Banking | Industry | Oil & Energy | Portfolio effect |
|---|---|---|---|---|
| Interest rates rise | ▲ wider margins | ▼ dearer project finance | ● | Partly offset |
| Interest rates fall sharply | ▼ margin squeeze | ▲ cheaper capex | ▲ cheaper renewables finance | Partly offset |
| Oil price spike | ● | ▼ input costs | ▲ higher prices and margins | Offset |
| Oil price crash | ● | ▲ lower costs | ▼ lower revenue | Offset |
| Inflation surge | ▲ higher rates | ● index-linked contracts | ▲ pricing power | Mostly positive |
| Investment boom (infrastructure, grids) | ▲ loan demand | ▲ orders | ▲ power demand | Positive |
| Credit or banking crisis | ▼▼ losses | ▼ financing harder | ● essential demand | Cushioned by energy |
| Broad recession | ▼ loan losses | ▼ orders delayed | ▼ lower demand | Hit, but less than single pillars |

Most rows contain both ▲ and ▼: the pillars react to the same event in opposite directions. Only a broad recession hurts all three, and even then by different amounts and at different times.

## 4. Systematic risk: what diversification can and cannot do

**Theory.** Total risk = **idiosyncratic risk** (company and sector specific: a profit warning, a regulation, an oil-price move) + **systematic risk** (the whole market: recession, global sell-off). Diversification across sectors with different drivers removes most idiosyncratic and sector risk. Systematic risk cannot be fully diversified away inside equities, but a portfolio can **reduce its exposure** to it by holding assets that move little with the market.

**The claim tested.** "A systemic shock should not hit this diversified portfolio as hard as the market." We measure each pillar ETF and the equal-weighted portfolio against the **DAX** (Yahoo Finance `^GDAXI`, same dates).

Metrics:

* **Beta** `β = cov(r, r_DAX) / var(r_DAX)`: sensitivity to the market (DAX = 1).
* **R²** `= corr(r, r_DAX)²`: share of daily variance explained by the market; `1 − R²` is the part diversification and stock selection control.
* **Downside / upside capture**: average return on DAX down (up) days divided by the DAX's average on those days.
* **Average return on the DAX's 10 worst days.**
* **Stress correlation**: correlation between pillar ETFs on all days vs on the DAX's worst 10% of days.

Results:

| Series | Beta 1Y | R² 1Y | Down capture 1Y | Up capture 1Y | DAX's 10 worst days, 1Y | Beta 2Y | Down capture 2Y | DAX's 10 worst days, 2Y |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Banking ETF | 1.17 | 0.45 | 106% | 117% | −2.46% | 0.95 | 82% | −2.41% |
| Industry ETF | 1.18 | 0.31 | 128% | 136% | −2.60% | 0.93 | 91% | −0.69% |
| Oil & Energy ETF | −0.04 | 0.00 | −24% | 34% | +0.01% | 0.14 | −7% | −1.02% |
| **Portfolio (equal)** | **0.77** | **0.38** | **70%** | **95%** | **−1.68%** | **0.67** | **55%** | **−1.37%** |
| DAX | 1.00 | 1.00 | 100% | 100% | −2.22% | 1.00 | 100% | −3.24% |

Stress correlation between pillar ETFs (average of the three pairs): 0.23 on all days vs 0.17 on the DAX's worst days over the last year; 0.27 vs 0.53 over two years, which include the April 2025 sell-off.

**Interpretation.**

* The portfolio's market beta is **0.67–0.77**: a 10% DAX fall translates into roughly a 7% portfolio fall on average.
* Only **31–38%** of the portfolio's daily variance is explained by the DAX; most of its risk is pillar-specific and therefore diversifiable.
* The asymmetry is the attractive part: the portfolio fell **55–70%** as much as the DAX on down days but rose **~95%** as much on up days.
* **Oil & Energy does most of the cushioning**: its beta is close to zero, so it barely participates in equity sell-offs. Banking and Industry behave like (or more than) the market.
* **The limit:** in the two-year sample, correlation between the pillars roughly doubled on the DAX's worst days. A true systemic crash still hits the portfolio: it is hit less than the market, but it is not spared. The Risk tab quantifies this with correlation stress (all correlations at 0.8) and a 2008-style scenario.

Measurement caveat: the stock prices are Frankfurt floor quotes, which close later than the Xetra-based DAX. The timing mismatch slightly lowers measured betas and correlations, so the true market exposure is probably somewhat higher than shown.

## 5. Risks to the thesis

* **Home bias.** Mostly German and European companies: a European recession, energy crisis or political shock would hit all three pillars together.
* **Value and cyclical tilt.** All three are "old economy" value sectors that can lag for long periods in a growth or technology-led market; the portfolio has no technology, healthcare or consumer-staples exposure.
* **Policy and regulation.** Bank capital rules, windfall taxes on energy, subsidy changes for renewables and wind, carbon pricing.
* **Energy transition.** Stranded-asset risk for oil; execution and pricing pressure for renewables and wind manufacturers. Holding both reduces but does not remove it.
* **Concentration.** Nine stocks; single company events still matter.
* **Unstable correlations.** They rise in crises, exactly when diversification is needed most.
* **Short sample.** Two years of data is enough to illustrate, not to prove.
* **Long history is less kind.** With 20–25 years of data (Long-term risk tab, [CRISIS_HISTORY.md](CRISIS_HISTORY.md)) the 1-year correlation between the pillars was around 0.4–0.5 most of the time and the two pairs involving Oil & Energy are now near their lowest readings since 2001; the portfolio's beta to the DAX over 20 years is 1.11, and it fell more than the DAX in 7 of the 10 crises since 2001, all bank-, credit- or liquidity-driven. The low correlations of the last two years are real but historically unusual.

## 6. How to run the strategy

**Implementation**

* Hold the three pillar ETFs in equal parts, or in a risk-parity mix (Short-term risk tab; see also the implementation section of CRISIS_HISTORY.md), and rebalance to target, e.g. quarterly or when a pillar drifts more than 5 percentage points.
* Keep each stock near one third of its pillar.
* Set a risk budget, such as a 1-day 99% Expected Shortfall limit, and review positions when it is breached.
* Replace a stock when its business no longer fits its pillar's economic role, not because of short-term price moves.

**Monitoring checklist**

| Pillar | Indicators |
|---|---|
| Banking | ECB rate path, net interest margins, loan growth, credit spreads, CET1 ratios |
| Industry | PMIs and order intake, book-to-bill, infrastructure-fund disbursement, grid tenders |
| Oil & Energy | Brent, refining margins, power and gas prices, renewable auction prices |
| Portfolio | Rolling pillar correlations, beta to the DAX, VaR/ES vs budget, drawdown |

## 7. Reproducing the numbers

The tab computes everything in the browser (`assets/thesis.js`, function `marketStats`). The same table can be printed in Python:

```bash
python python/risk_metrics.py --market              # last 252 days
python python/risk_metrics.py --market --window 0   # full two years
```

Data: `data/prices_indexed.csv` (stocks) and `data/benchmark_dax.csv` (DAX, rebased to 100), both from Yahoo Finance, 23 Oct 2024 – 23 Oct 2026.

## Sources

* German Federal Ministry of Finance, *Special Fund for Infrastructure and Climate Neutrality* — https://www.bundesfinanzministerium.de/Web/EN/Issues/Public-Finances/SVIK/special-fund-infrastructure-and-climate-neutrality.html
* European Commission, *Grids, the missing link: An EU Action Plan for Grids*, COM(2023) 757 — https://energy.ec.europa.eu/publications/eu-action-plan-grids_en
* Sharpe, W. (1964). *Capital Asset Prices: A Theory of Market Equilibrium under Conditions of Risk.* Journal of Finance 19(3) — systematic vs idiosyncratic risk.
* Longin, F. & Solnik, B. (2001). *Extreme Correlation of International Equity Markets.* Journal of Finance 56(2) — correlations rise in bear markets.

*Educational analysis, not investment advice.*
