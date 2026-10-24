# Crisis history 2001–2026: worst-case episodes and what they mean for the three-pillar portfolio

Value at Risk estimated from one or two calm years says little about the losses that matter most. Risk desks therefore *replay history*: they take the market moves of past crises and apply them to today's positions. This document, which accompanies the **Crisis history** tab, looks at the ten worst market episodes since 2001, measures what each did to the three pillars, and draws practical conclusions for running the portfolio.

**Data and method.** Daily dividend-adjusted closes of the nine stocks on their primary listings since 2000 (see [RISK_METHODOLOGY.md §19](RISK_METHODOLOGY.md#19-long-term-data)), the DAX and WTI crude oil (USD). Each episode runs from the DAX's peak to its trough within a defined search window; the same dates are applied to the three equal-weighted pillar ETFs and to the equal-weighted portfolio (1/3 per pillar). Recovery is the number of trading days after the trough until a series regains its level at the start of the episode. Company names are anonymised throughout; the narrative is about markets and sectors. Reproduce the table with `python python/longterm_risk.py --crises`.

---

## The episodes at a glance

| Episode | DAX peak → trough | DAX | Portfolio | Banking | Industry | Oil & Energy | Oil (WTI) | Replay on €15,000 | Recovery portfolio / DAX |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Dot-com bust & 9/11 | 31 Jan 2001 → 12 Mar 2003 | −67.6% | **−57.4%** | −64.6% | −58.7% | −57.0% | +31.8% | −8,614 € | 1.9 yrs / 3.9 yrs |
| Global financial crisis | 16 Jul 2007 → 6 Mar 2009 | −54.8% | −69.6% | −86.4% | −67.2% | −49.2% | −38.6% | −10,440 € | 14.0 yrs / 4.2 yrs |
| Euro debt crisis | 2 May 2011 → 12 Sep 2011 | −32.6% | −40.4% | −57.3% | −25.1% | −35.5% | −22.3% | −6,066 € | 2.1 yrs / 1.3 yrs |
| Oil price collapse | 3 Jul 2014 → 11 Feb 2016 | −12.7% | −24.9% | −40.7% | −6.9% | −28.4% | −74.8% | −3,742 € | 1.2 yrs / 2 months |
| Brexit vote | 23 Jun 2016 → 27 Jun 2016 | −9.6% | −13.5% | −21.5% | −11.3% | −7.6% | −7.5% | −2,024 € | 5 months / 1 month |
| Q4 2018 sell-off | 27 Sep 2018 → 27 Dec 2018 | −16.5% | −25.0% | −34.6% | −30.6% | −8.3% | −38.1% | −3,743 € | 1.1 yrs / 6 months |
| COVID-19 crash | 19 Feb 2020 → 18 Mar 2020 | −38.8% | −49.2% | −52.3% | −52.8% | −42.5% | −61.8% | −7,375 € | 10 months / 9 months |
| Ukraine war & energy shock | 5 Jan 2022 → 29 Sep 2022 | −26.4% | **−16.8%** | −24.3% | −31.0% | +1.5% | +4.3% | −2,523 € | 2 months / 8 months |
| Banking turmoil 2023 | 6 Mar 2023 → 15 Mar 2023 | −5.9% | −12.2% | −20.1% | −6.5% | −9.5% | −16.0% | −1,826 € | 12 months / 17 days |
| Tariff shock 2025 | 6 Mar 2025 → 9 Apr 2025 | −16.0% | **−11.3%** | −15.7% | −12.7% | −5.8% | −6.0% | −1,698 € | 7 days / 19 days |

Bold: episodes in which the portfolio lost less than the DAX. Sub-events: **9/11** (10 → 21 Sep 2001): portfolio −16.4%, DAX −18.9%, banking −28.3%, industry −7.7%, oil & energy −12.5%. **Lehman weeks** (12 Sep → 21 Nov 2008): portfolio −47.2%, DAX −33.8%, banking −64.0%, industry −50.9%, oil & energy −22.4%.

For scale: the short-term layer's 1-day 99.9% VaR for the same €15,000 is about 520 €. The financial-crisis replay is twenty times that figure, which is exactly why historical stress tests complement VaR.

---

## Episode by episode

### 1. Dot-com bust, 9/11 and the 2002 bear market (2001–2003)

**What happened.** The technology and telecom bubble that peaked in March 2000 deflated for three years. The attacks of 11 September 2001 closed US stock markets for four trading days and hit insurers, airlines and banks; the DAX fell about 8.5% on the day. Accounting scandals at large US companies in 2001–02 destroyed trust in reported earnings. German banks carried rising bad loans and large equity holdings; the ECB cut its main rate to 2% by mid-2003. The DAX lost about two thirds of its value and bottomed on 12 March 2003.

**How the pillars behaved.** The portfolio lost 57.4% against 67.6% for the DAX, about 10 points better. Banking was hit hardest (−64.6%), oil & energy least (−57.0%), while oil prices rose 32%.

**Lesson.** The one long bear market in which the pillars clearly beat the index: the DAX of 2000 was full of technology and telecom stocks, while the pillars earn their money from credit, physical assets and energy. Yet every pillar still lost more than half its value. A valuation collapse eventually reaches every sector.

### 2. Global financial crisis (2007–2009)

**What happened.** US subprime mortgage losses spread through securitised credit from mid-2007; in August 2007 interbank funding markets froze. After the Lehman Brothers bankruptcy on 15 September 2008 credit markets seized up worldwide. Germany set up a bank rescue fund (SoFFin) in October 2008, governments recapitalised and guaranteed banks across Europe, and the ECB cut its main rate to 1% by May 2009. Oil fell from a record of about $145 in July 2008 to the low $30s by December as the world went into recession.

**How the pillars behaved.** The portfolio lost 69.6% against 54.8% for the DAX, 15 points worse. The banking pillar lost 86.4%; industry 67.2%; oil & energy 49.2%. In the Lehman weeks alone the banking pillar fell 64%. The portfolio needed about 14 years to regain its July 2007 level (the DAX about 4).

**Lesson.** The portfolio's worst episode and the clearest limit of the thesis. In a credit crisis all three pillars are hit through the same channels, credit and demand, and the bank pillar, which *finances* the economy, sits at the epicentre. Diversification across pillars reduced the bank loss (the portfolio lost "only" 70%) but could not offset it.

### 3. Euro sovereign debt crisis (2011)

**What happened.** Doubts about the solvency of Greece spread in summer 2011 to Italy and Spain, whose bond yields jumped. European banks held large amounts of these bonds, so the sovereign crisis became a bank crisis. On 5 August 2011 S&P downgraded the United States' credit rating. Calm returned only with the ECB's long-term refinancing operations (December 2011, February 2012) and the "whatever it takes" pledge of July 2012.

**How the pillars behaved.** Portfolio −40.4% vs DAX −32.6%. Banking −57.3%, oil & energy −35.5%, industry −25.1%.

**Lesson.** A second financial crisis decided by the banks. Because banks are the pillar most exposed to government bonds and wholesale funding, the portfolio is structurally sensitive to sovereign and funding stress in the euro area.

### 4. Oil price collapse (2014–2016)

**What happened.** US shale output flooded the market and in November 2014 OPEC decided not to cut production; WTI fell from over $100 in mid-2014 to below $30 in early 2016 (−75% peak to trough of the DAX window). At the same time the ECB introduced negative deposit rates (June 2014), China devalued its currency (August 2015) and European bank shares sold off in early 2016. European utilities suffered from falling power prices and rebuilt their business models around renewables and networks.

**How the pillars behaved.** Portfolio −24.9% vs DAX −12.7%. Oil & energy −28.4% as expected, but banking fell even more (−40.7%) as negative rates squeezed margins; industry held up (−6.9%).

**Lesson.** A single macro story rarely arrives alone: an energy shock overlapped with a rate and bank shock. Industry provided the offset the thesis predicts, but not enough to compensate two pillars falling at once.

### 5. Brexit referendum (June 2016)

**What happened.** The UK voted on 23 June 2016 to leave the EU, against market expectations. On 24 June European bank shares had one of their worst days on record as investors priced lower rates, weaker growth and legal uncertainty for London-based activities.

**How the pillars behaved.** Portfolio −13.5% vs DAX −9.6% in two trading days. Banking −21.5%, industry −11.3%, oil & energy −7.6%. Recovery took about five months.

**Lesson.** Political shocks go straight to the banks, but if they do not damage the credit system they are recovered within months.

### 6. Q4 2018 sell-off

**What happened.** Rising US interest rates, the US–China trade war and a dispute over the Italian budget produced a broad sell-off in the last quarter of 2018, with industrial and cyclical stocks hit by fears of a manufacturing slowdown.

**How the pillars behaved.** Portfolio −25.0% vs DAX −16.5%. Banking −34.6% and industry −30.6% fell together; oil & energy only −8.3%.

**Lesson.** Banking and industry are both cyclical: growth and trade scares hit orders and credit at the same time. Only the energy pillar diversified.

### 7. COVID-19 crash (February–March 2020)

**What happened.** As the pandemic reached Europe, markets fell faster than in any previous crash; the DAX lost almost 40% in four weeks. An OPEC+ price war in early March sent oil down sharply, and on 20 April US crude futures closed below zero. Central banks and governments responded at record speed; the ECB launched a €750 bn pandemic emergency purchase programme on 18 March 2020.

**How the pillars behaved.** Portfolio −49.2% vs DAX −38.8%. All three pillars lost between 42% and 53%.

**Lesson.** In a liquidity crash correlations go to one. The DAX also contains defensive, healthcare and technology stocks that the portfolio does not hold, which is why the index fell less. Recovery came with policy support within about ten months.

### 8. Ukraine war, energy and inflation shock (2022)

**What happened.** Russia invaded Ukraine on 24 February 2022. European gas and power prices rose to records in the summer, inflation reached multi-decade highs and the ECB began raising rates in July 2022, ending eight years of negative rates. Energy-intensive industry and growth stocks fell, while energy producers earned exceptional profits.

**How the pillars behaved.** Portfolio −16.8% vs DAX −26.4%, almost 10 points better. Oil & energy +1.5%, banking −24.3%, industry −31.0%. The portfolio regained its level within about two months; the DAX needed eight.

**Lesson.** The textbook case for the three-pillar idea. Inflationary supply shocks are where revenue-driven, real-economy sectors protect best: energy gains what industry loses, and rising rates support bank margins.

### 9. Banking turmoil (March 2023)

**What happened.** The failure of Silicon Valley Bank on 10 March 2023 and the forced takeover of Credit Suisse by UBS on 19 March triggered fears about bank funding and bond losses after the fastest rate rises in decades. European bank shares fell sharply within days, although no large euro-area bank failed.

**How the pillars behaved.** Portfolio −12.2% vs DAX −5.9% in seven trading days. Banking −20.1%.

**Lesson.** With one pillar in banks, any bank-specific panic is a portfolio event: the portfolio fell twice as much as the index and needed about a year to recover.

### 10. Tariff shock (April 2025)

**What happened.** Broad US import tariffs announced on 2 April 2025 triggered a global sell-off; the DAX fell about 16% from its early-March high. Markets rebounded after a 90-day pause on most tariffs was announced on 9 April.

**How the pillars behaved.** Portfolio −11.3% vs DAX −16.0%. Oil & energy only −5.8%. The portfolio regained its level within seven trading days.

**Lesson.** A trade shock that threatens global demand but not the credit system is cushioned by the mix.

---

## What the history teaches

1. **The portfolio protects in real-economy shocks, not in financial ones.** It lost less than the DAX in 3 of 10 episodes (dot-com bust, 2022 energy shock, 2025 tariffs) and in the 9/11 sub-event, and more in the other 7. The good cases are a technology valuation bust, an energy and inflation shock and a trade shock; the bad cases all involve banks, credit or a liquidity crash.
2. **Banking is the crisis amplifier.** The bank pillar was the hardest-hit pillar in 8 of 10 episodes and lost 41.7% on average across them, against 30.3% for industry and 24.2% for oil & energy. Banks are leveraged on the credit cycle: when the economy they finance weakens, their losses arrive first and largest.
3. **Energy is the most reliable cushion, but not in every crisis.** Oil & energy was the most resilient pillar in 7 of 10 episodes and rose in 2022, yet fell 42.5% in the COVID crash and 28% in the 2014–16 oil collapse. Different drivers mean different crises, not no crises.
4. **Correlations rise exactly when they are needed.** The 3-month correlation between the banking and oil & energy pillars is about 0.05 today but has reached 0.84 in past crises; over 20 years the 1-year correlations between pillars were around 0.4–0.5 most of the time.
5. **Recovery time is a risk of its own.** After 2008 the portfolio needed about 14 years to regain its 2007 level, the DAX about 4. A 70% loss needs a 233% gain to break even. For money that may be needed within five years, drawdown depth matters more than average return.

---

## Implementation: making the portfolio more crisis-resistant

### Same episodes, different pillar weights

Each mix holds the pillar ETFs at fixed weights, rebalanced daily. Risk parity uses inverse 20-year volatility (banking 26.7%, industry 28.1%, oil & energy 45.2%).

| Episode | Equal (1/3 each) | Risk parity | Defensive tilt (20/30/50) | Without banking* (0/50/50) | DAX |
|---|---:|---:|---:|---:|---:|
| Dot-com bust & 9/11 | −57.4% | −57.0% | −56.5% | −55.5% | −67.6% |
| Global financial crisis | −69.6% | −66.1% | −63.4% | −57.1% | −54.8% |
| Euro debt crisis | −40.4% | −39.3% | −37.5% | −30.2% | −32.6% |
| Oil price collapse | −24.9% | −25.1% | −23.8% | −16.7% | −12.7% |
| Brexit vote | −13.5% | −12.4% | −11.5% | −9.4% | −9.6% |
| Q4 2018 sell-off | −25.0% | −22.1% | −20.8% | −19.9% | −16.5% |
| COVID-19 crash | −49.2% | −48.0% | −47.6% | −47.8% | −38.8% |
| Ukraine war & energy shock | −16.8% | −13.6% | −12.8% | −15.2% | −26.4% |
| Banking turmoil 2023 | −12.2% | −11.6% | −10.8% | −8.0% | −5.9% |
| Tariff shock 2025 | −11.3% | −10.3% | −9.8% | −9.1% | −16.0% |

| Last 20 years | CAGR | Ann. vol | Max drawdown | 1-year VaR 99% (historical) |
|---|---:|---:|---:|---:|
| Equal (1/3 each) | 7.9% | 28.0% | −70.1% | 51.4% |
| Risk parity (inverse vol) | 8.5% | 26.2% | −66.8% | 48.5% |
| Defensive tilt (20/30/50) | 9.1% | 25.6% | −64.5% | 46.4% |
| Without banking* (0/50/50) | 11.2% | 26.6% | −59.9% | 43.4% |
| DAX | 7.2% | 20.9% | −54.8% | 39.9% |

\*Reference only: dropping a pillar abandons the three-pillar idea; it measures what the banking pillar cost in crises. All weights here are chosen with hindsight over the same 20 years, so the improvements are an upper bound of what could have been achieved in real time.

**Reading.** Shifting weight from banking towards oil & energy kept all three pillars, reduced the loss in every bank-led episode, lowered the 20-year drawdown and 1-year VaR, and even raised the long-run return. It did not close the gap to the DAX in financial crises: a portfolio concentrated in three cyclical sectors remains riskier than the broad index in a credit crisis.

### A crisis playbook

1. **Size the banking pillar by risk, not by count.** Over 20 years equal capital gave banks the largest share of portfolio risk (about 41% of the variance against 21% for oil & energy). Risk-parity or defensive weights keep the pillar but reduce its crisis impact.
2. **Plan for the bad case before it happens.** Set a maximum acceptable 1-year loss using the Long-term risk layer and replay these episodes on every new allocation. If the financial-crisis replay is larger than you could tolerate, the allocation is too aggressive, however calm recent volatility looks.
3. **Watch the warning signs of bank-led episodes.** Interbank funding stress (2007), sovereign-bond sell-offs in the euro area (2011) and sudden bank-funding fears (2023) marked the episodes where the portfolio did worst. Track bank credit spreads, euro-area bond spreads and rolling pillar correlations as early-warning indicators.
4. **Hedge the common factor, not the pillars.** When those indicators flash, an index hedge (for example DAX futures or put options on part of the portfolio) offsets the market-wide part of the loss while keeping the long-term pillar exposure.
5. **Rebalance with rules.** Recoveries were often fastest in the pillar that had fallen most (banks were the best pillar in 2009 and 2021). Rebalancing to target weights after large moves buys the laggard systematically, provided position sizes leave room to survive the drawdown first.
6. **Keep a liquidity buffer.** Recoveries took months to years; money that may be needed within that time should not be in the portfolio.

---

## Sources

* Market data: Yahoo Finance (stocks on primary listings, DAX `^GDAXI`, WTI `CL=F`), January 2000 – 23 October 2026.
* Event dates and policy actions are matters of public record (central-bank, government and exchange announcements): ECB monetary policy decisions (2003, 2009, 2011–12, 2014, 2020, 2022); German Financial Market Stabilisation Fund (SoFFin), October 2008; S&P US sovereign downgrade, 5 August 2011; OPEC decision of 27 November 2014; UK EU referendum, 23 June 2016; ECB Pandemic Emergency Purchase Programme, 18 March 2020; Silicon Valley Bank closure, 10 March 2023; UBS–Credit Suisse merger, 19 March 2023; US tariff announcement of 2 April 2025 and pause of 9 April 2025.
* Longin, F. & Solnik, B. (2001). *Extreme Correlation of International Equity Markets.* Journal of Finance 56(2).
* Reinhart, C. & Rogoff, K. (2009). *This Time Is Different: Eight Centuries of Financial Folly.* Princeton University Press.

*Educational analysis, not investment advice.*
