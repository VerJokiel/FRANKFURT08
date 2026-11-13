# Repository guide

How this repository is built, where the data comes from, how it is kept up to date, and what needs looking after. Keep this file current: update it in the same commit as any change to the pages, data jobs, schedules, colour conventions or methodology, and add a line to the [change log](#change-log).

Site (GitHub Pages, branch `main`, root): [three-pillar dashboard](https://verjokiel.github.io/FRANKFURT08/) · [DAX market page](https://verjokiel.github.io/FRANKFURT08/dax.html) · European market pages: [CAC 40](https://verjokiel.github.io/FRANKFURT08/cac40.html), [IBEX 35](https://verjokiel.github.io/FRANKFURT08/ibex35.html), [FTSE MIB](https://verjokiel.github.io/FRANKFURT08/ftsemib.html), [WIG20](https://verjokiel.github.io/FRANKFURT08/wig20.html), [FTSE 100](https://verjokiel.github.io/FRANKFURT08/ftse100.html)

## Pages

**`index.html` — three-pillar ETF dashboard.** Nine Frankfurt-listed stocks in three equal-weight pillar ETFs: Banking 1–3, Industry 1–3, Oil & Energy 1–3. The stocks are anonymised in this public repository; never add real names or tickers for them. Tabs (buttons `.tab[data-tab]`, hash routing): `#overview`, `#thesis` (investment thesis), `#vol` (weekly volatility), `#corr` (correlation matrix), `#risk` (short-term risk, layer 1), `#ltrisk` (long-term risk, layer 2), `#crises` (crisis history), plus a link tab to the DAX market page.

**`dax.html` — DAX market page.** All 40 DAX members from real data: daily closes plus a live layer of 5-minute bars during the Xetra session.
- An update box at the top shows the live status, the latest bar and its publish time, when the next intraday and daily updates are due (Frankfurt time, skipping weekends and Xetra holidays), and a log of updates received while the page is open.
- Every panel carries a `data-feed` attribute (`live`, `mixed`, `corr` or `ecb`) and an automatic update line saying what data it shows and when it next changes, refreshed every 15 seconds. Live-fed panels flash when a new bar arrives.
- An open page checks for a newer daily data file every 15 minutes and reloads when one is published.
- Sections: headline figures, intraday chart, correlation (matrix, network, sector clusters), market map, biggest moves, market internals, index charts, breadth, average correlation, dispersion, sectors, rates and EUR/USD, data and method.

**Market View — the category of all index pages.** The main tab bar has one *Market View* tab (`index.html`: between the `market view link` comments). `markets.html`, `dax.html` and the five market pages show the main bar with *Market View* current plus a second bar, `nav.subtabs` (*All indices · DAX · CAC 40 · …*), between the `nav` comments in `dax.html`. All of it is written by `python/make_market_pages.py` from `python/markets.py` (`DAX_VIEW` + `MARKETS`, order `view_entries()`).

**`markets.html` — all indices side by side** (`assets/market-view.js`, config `window.MARKET_VIEW`). Reads the index pages' daily files as text (`data/dax40.js`, `data/markets/<id>.js`; parsed from the first `{` to the last `}`, so their global variables do not collide) and the live files from `raw.githubusercontent.com` (`live-data/live.json`, `live-markets/<id>.json`; raw, not the API, because six files every five minutes would exceed the API's 60 requests an hour). Live files are polled every minute only while an exchange trades or within 40 minutes after a close; daily files every 15 minutes. While an exchange trades, its index and members get the provisional today row (same splice rule as the index pages). Sections: cards per index (level, day change, one-year sparkline with 200-day average, returns, volatility, breadth, link to the page), performance rebased to 100 (1M, 3M, YTD, 1Y, 2Y), sortable table (returns, volatility, VaR 99% / ES 97.5% from 252 daily returns, off 52-week high, max drawdown over a year, share of members above the 200-day average, average member correlation over 63 sessions), return / volatility scatter, correlation matrix of the indices' daily returns on common trading days (3 months / 1 year). Note on the page: the DAX is a performance index (dividends reinvested), the others are price indices; all in local currency.

**`cac40.html`, `ibex35.html`, `ftsemib.html`, `wig20.html`, `ftse100.html` — European market pages.** The DAX page's layout and behaviour (update box, per-panel update lines, live splice, reload on new daily data) for CAC 40 (40 members), IBEX 35 (35), FTSE MIB (40), WIG20 (20) and FTSE 100 (100), from real data. Differences from the DAX page:
- The correlation matrix, network and sector clusters show the 20 largest members by index weight (`corr_n` in `python/markets.py`; all 20 for the WIG20). Average correlation, breadth, the market map and the sector table use all members.
- Times are the exchange's local time (Paris, Madrid, Milan, Warsaw, London). Prices are in the quote currency: euros, złoty, pence (a few London lines quote in US dollars).
- Rates and currency per market: euro markets show the ECB deposit rate, 10-year AAA yield, the country's 10-year yield (monthly) and its spread over Germany, and EUR/USD; WIG20 the NBP reference rate, 10-year Polish yield (monthly), EUR/PLN and USD/PLN; FTSE 100 Bank Rate, 10-year gilt yield, GBP/USD and GBP/EUR.
- The pages are generated: edit `python/markets.py` or the template in `python/make_market_pages.py`, then run `python python/make_market_pages.py` (it also rewrites the market links in the tab bars of `index.html` and `dax.html`, between the `market links` comments).

## Code layout

Static site, no build step. d3 v7.9.0 from cdnjs; on `dax.html` also Chart.js 4.4.1, chartjs-chart-matrix 2.0.1 and Cytoscape.js 3.28.1.

| Path | Contents |
|---|---|
| `assets/app.js` | Overview, volatility and correlation tabs; shared helpers exported as `window.DashKit` (`lineChart` with options `yDomain`, `refY`, `endLabels`, `head`, `height`, `bands`; `showTip`, `stat`, `cssVar`, `sectorColor`, …). Correlation tab right panel: rolling chart with bands, pair figures and clickable most/least correlated pairs. |
| `assets/risk.js`, `ltrisk.js`, `crises.js`, `fan.js`, `thesis.js` | Risk layer 1, risk layer 2, crisis history, fan chart, investment-thesis checks. |
| `assets/dax.js` | `window.DaxSchedule` (Frankfurt-time helpers and the `XETRA_HOLIDAYS` list) and the daily views of `dax.html`. `DaxDaily.applyLive()` rebuilds every view with a provisional row for today; `DaxDaily.stamp()` writes the per-panel update lines. |
| `assets/dax-live.js` | Polls the live file every 30 s; update box; daily-file reload check; intraday chart (Chart.js); correlation matrix (chartjs-chart-matrix), force-directed network (D3: minimum spanning tree or threshold) and sector clusters (Cytoscape.js). |
| `assets/market-view.js` | Market View page (`markets.html`), see above. |
| `assets/market.js`, `assets/market-live.js` | European market pages: market-independent versions of `dax.js` and `dax-live.js`, configured by `window.MARKET` (inlined in each page) and fed by `window.MKT` (`data/markets/<id>.js`). `window.MarketSchedule`, `MarketDaily.applyLive()`, `MarketDaily.stamp()` as on the DAX page. The correlation views use the `corr_n` largest members. |
| `assets/style.css` | Palette and all styles. Direction A (`.theme-a`): navy `#13233F` and sage `#3E5F44` panels, alabaster `#F3EFE6` canvas, gold `#C9A55A` accent, Newsreader headings, Inter body. Direction B (`.theme-b`, risk tabs): light fintech look with teal `#24BDC8`. |
| `data/` | `data.js` (nine-stock prices), `longterm.js` (25 years), `benchmark_dax.csv`, `dax40.js` and `dax40_prices.csv` (generated, do not edit by hand), `markets/<id>.js` and `markets/<id>_prices.csv` for the European market pages (generated, do not edit by hand). |
| `python/` | `risk_metrics.py` and `longterm_risk.py` (reference implementations), `build_dax40.py` (daily DAX data), `build_live.py` (one fetch of 5-minute bars), `live_loop.py` (runs the live layer through a session), `requirements.txt`. European market pages: `markets.py` (single source of truth: members and Yahoo tickers, sectors, hours, time zones, holidays, weight caps, rates sources), `build_market.py` (daily data, `all` or one market id), `build_market_live.py` (5-minute bars for one market), `markets_loop.py` (session job for all five), `make_market_pages.py` (writes `markets.html`, the five market pages and the Market View navigation of `index.html` and `dax.html`). |
| `docs/` | `INVESTMENT_THESIS.md`, `RISK_METHODOLOGY.md`, `CRISIS_HISTORY.md`, this guide. |
| `.github/workflows/` | `live-dax40.yml` (session job), `update-dax40.yml` (backup daily data), `live-markets.yml` and `update-markets.yml` (the same for the European market pages). |

## Data and automation (DAX market page)

**Sources (free, no API key):** Yahoo Finance through the open-source [yfinance](https://github.com/ranaroussi/yfinance) library (Xetra quotes, delayed about 15 minutes), Stooq as fallback for prices, and the [ECB Data Portal](https://data.ecb.europa.eu) API for the deposit facility rate, the 10-year euro area AAA yield and the EUR/USD reference rate. Real-time Xetra prices need a paid licence.

**How often each item is refreshed**

| Data | Refreshed |
|---|---|
| 5-minute prices, DAX and 40 members | every 5 minutes during the session (published to the `live-data` branch) |
| Daily closes (dividend- and split-adjusted) | after the close (~18:05 Frankfurt), again before the next open, and by backup runs |
| Market capitalisations (index weights, 15% cap) | with the daily closes |
| ECB rates and EUR/USD | with the daily closes; the midday backup run picks up the ECB yield curve, which is published around noon |
| Member list, Xetra holiday list | by hand (see [maintenance](#maintenance)) |

**Session job (`live-dax40.yml` → `python/live_loop.py`).** One job runs the whole session: if started before the open it first refreshes the daily data, then waits for 09:00 Frankfurt, publishes `live.json` to the one-commit `live-data` branch every 5 minutes on its own clock, starts a fresh run of itself before GitHub's 6-hour job limit, and after 18:05 commits the official daily closes to `main`. Runs share the concurrency group `live-dax40`, so extra starts queue and exit when there is nothing to do.

**Morning start.** GitHub's scheduler starts this repository's scheduled jobs hours late or not at all, so the cron entries in `live-dax40.yml` are only backups. The job is started every weekday at 08:10 Frankfurt by a Claude scheduled task on the owner's account. To start it by hand: *Actions → Live DAX bars → Run workflow*, or `gh workflow run live-dax40.yml --ref main`.

**Backup daily job (`update-dax40.yml`).** Runs at 18:20 and 20:40 UTC, 04:10 UTC (Tuesday to Saturday) and 11:35 UTC, and on pushes to `python/build_dax40.py` or the workflow. It commits only when the data changed.

**Safeguards in `build_dax40.py`.**
- It stops, and keeps the published file, when the DAX or more than four members fail to download.
- It never replaces the published data with data ending earlier. At night Yahoo often returns history without the latest session.
- It keeps yesterday's market caps or ECB series when one of those downloads fails (recorded in `carried_over` in the data file).
- It writes nothing when only the build time would change.
- A kept file ends the run with a warning annotation, not a failure.
- During the session it drops today's unfinished row from the daily data.

**How the page reads the data.** `live.json` comes through the GitHub API (`contents/live.json?ref=live-data`), with `raw.githubusercontent.com` as fallback. Today's provisional prices are spliced onto the daily data only when the live file's previous session equals the daily file's last date (`live.prev_date === DAX40.asof`).

## Data and automation (European market pages)

**Sources:** Yahoo Finance via yfinance for prices, 5-minute bars and market caps (exchange quotes delayed about 15 minutes); ECB Data Portal for the euro rates, the countries' 10-year yields (`IRS`, monthly) and reference FX rates (`EXR`); BIS central bank policy rates (`WS_CBPOL`) for the NBP rate; Bank of England database for Bank Rate (`IUDBEDR`) and the 10-year gilt par yield (`IUDMNPY`), with BIS as fallback for Bank Rate. Stooq now answers scripts with a JavaScript challenge, so its fallback rarely works.

**Session job (`live-markets.yml` → `python/markets_loop.py`).** One job for all five markets, same design as the DAX job. All five trade 09:00–17:30 Central European time (London 08:00–16:30 UK time, Warsaw until 17:00), so one window, 09:00–17:55 Frankfurt, covers them; a market on holiday, or past its close plus 25 minutes, is skipped. On start it loads the files already on the `live-markets` branch, fetches every market once, then every 5 minutes fetches the open markets and force-pushes one commit with `cac40.json`, `ibex35.json`, `ftsemib.json`, `wig20.json`, `ftse100.json`. Before the open it refreshes the daily data; after 18:05 Frankfurt it runs `build_market.py all` and commits `data/markets/` to `main`; before the 6-hour limit it starts a fresh run of itself. It starts when the DAX job is requested (`workflow_run` on *Live DAX bars*), so the 08:10 morning start covers both; its own crons are back-ups. Concurrency group `live-markets`.

**Backup daily job (`update-markets.yml`).** 18:30 and 20:50 UTC, 04:20 UTC (Tuesday to Saturday) and 11:45 UTC, and on pushes to `build_market.py`, `markets.py` or the workflow. Commits only when data changed; on a rebase conflict in the generated files, this run's build wins (`-X theirs`), as in the session job.

**Safeguards in `build_market.py`:** the same as `build_dax40.py` (keeps the published file when the index or more than `max_missing` members fail — 4, WIG20 3, FTSE 100 6; never moves data backwards; carries over market caps and rates series; writes nothing unchanged; drops today's unfinished session; a kept file is a warning, not a failure). In addition:
- A member the batch download misses is fetched again on its own (Yahoo occasionally drops one symbol from a batch) before the Stooq fallback.
- Members listed during the window count if they have a year of closes; earlier dates carry the first close back (the member gets `since` in the data file). Example: Metlen, in London since August 2025.
- Market caps are converted to the market's currency (pence ÷ 100; dollar or euro lines at ECB rates) before weights are computed. Weight caps: CAC 40, FTSE MIB and WIG20 15%; IBEX 35 and FTSE 100 none.
- Yahoo has no daily history for the WIG20 index (`WIG20.WA`): the script rebuilds it from hourly bars, taking the last bar of each Warsaw session (equal to the official close, checked against members). `build_market_live.py` takes the WIG20's previous close the same way.

**Committing data from the session jobs.** `push_main()` in `live_loop.py` and `markets_loop.py`: git runs with a fixed bot identity (a rebase re-commits and needs one), `pull --rebase -X theirs` onto the current `main`, push, then `ls-remote` must show the new commit; up to three tries, else a `::warning::` on the run and the backup job fills in.

**Bad prints.** `build_market_live.py` blanks an isolated 5-minute bar that sits more than 0.6% away from both neighbours while the neighbours agree (seen on 9 Nov 2026 at 17:05 for every Paris stock). Without this, one bad bar dominates five days of 5-minute correlations.

**How the pages read the data.** `<id>.json` through the GitHub API (`contents/<id>.json?ref=live-markets`), fallback `raw.githubusercontent.com`; splice condition `live.prev_date === MKT.asof`, as on the DAX page.

## Methodology notes

**Market internals** (equal-count breadth: each member counts once, unlike the cap-weighted index).
- During the session, today's price is the last daily close × (latest 5-minute price ÷ previous close).
- **Up / down:** today's price against the previous close. An exactly unchanged stock, or one not yet traded today, counts in neither, so up + down can be less than 40. The page shows unchanged stocks explicitly.
- **Above 50- / 200-day average:** latest price above the simple mean of the last 50 / 200 closes, today included.
- **Within 5% of 52-week high:** price at least 95% of the highest close in the last 252 sessions.
- **New 52-week high / low in the last 10 sessions:** the highest / lowest close of the last 10 sessions is at or beyond every close in the 242 sessions before.
- **Caveats:**
  - One stock moves a share by 2.5 points.
  - History uses the current members only (survivorship).
  - Ex-dividend days look like falls in the live ratio until the evening close.
  - Averages use adjusted prices, so they differ slightly from charting platforms.

**Correlation views on `dax.html`.** Pearson correlation for five windows: today 5-minute, five sessions 5-minute (the default once live data is in), five sessions 30-minute, three months daily, one year daily. Overnight gaps are left out. Short-interval returns understate correlation (the Epps effect). The network's spanning tree uses the distance √(2(1−ρ)).

Risk layers and crisis analysis: see [RISK_METHODOLOGY.md](RISK_METHODOLOGY.md) and [CRISIS_HISTORY.md](CRISIS_HISTORY.md).

## Colour conventions

- **Volatility heatmap:** green (calm) → yellow → red (turbulent), `d3.interpolateRdYlGn` reversed, scaled to the 10th–90th percentile of all cells; monthly cells with values, weekly optional, average column.
- **Correlation, both pages:** green (independent, ≤ 0) → yellow (≈ 0.3) → red (moving together, ≥ 0.8). Stops `[-0.3 #1a9850] [0 #66bd63] [0.3 #fee08b] [0.55 #f46d43] [0.8 #d73027]` (`CORR_STOPS` in `app.js` and `dax-live.js`).
- Use standard, readable green-to-red scales for good/bad and calm/turbulent; avoid low-contrast gold, grey or blue ramps.

## Maintenance

| When | What |
|---|---|
| After each quarterly DAX review (March, June, September, December) | Update `MEMBERS` in `python/build_dax40.py`; `build_live.py` imports it. |
| Every December | Extend the Xetra holiday lists from the Deutsche Börse trading calendar, in both `XETRA_HOLIDAYS` in `assets/dax.js` , `HOLIDAYS` in `python/live_loop.py` and `DAX_VIEW["holidays"]` in `python/markets.py` (Market View; currently up to the end of 2027). |
| If the page shows a stale-data warning | Check *Actions* for failed runs, then start *Live DAX bars* or *Update DAX market data* by hand. |
| After each quarterly review of CAC 40, IBEX 35, FTSE MIB, WIG20, FTSE 100 (March, June, September, December; FTSE 100 also mid-quarter replacements after takeovers) | Update the member list in `python/markets.py` (code, Yahoo symbol, name, sector, fallback weight), then run `python python/make_market_pages.py` (member counts appear in the page text) and commit. |
| Every December | Extend the holiday lists in `python/markets.py` (including `DAX_VIEW`, which must match `XETRA_HOLIDAYS` in `assets/dax.js`), for Euronext Paris, BME, Borsa Italiana, GPW, LSE (currently to the end of 2027), then run `make_market_pages.py`. |
| After 60 days without repository activity | GitHub pauses scheduled workflows; the daily bot commits normally prevent this. |

## Change log

- **2026-11-13** — Fix: the evening data commit of both session jobs (`live_loop.py`, `markets_loop.py`) failed whenever `main` had moved during the day, because `git pull --rebase` had no committer identity; the DAX loop even logged success after pushing nothing. Both now run git with a fixed bot identity, rebase with `-X theirs` (fresh build wins on the generated files), and report success only after checking that `main` has the commit (otherwise a warning on the run).

- **2026-11-13** — Market View: all index pages grouped under one *Market View* tab with a second tab bar; new overview page `markets.html` (`assets/market-view.js`) comparing all six indices; navigation of every index page and `index.html` generated by `make_market_pages.py`; tab bars scroll to the current page on phones.

- **2026-11-13** — European market pages for CAC 40, IBEX 35, FTSE MIB, WIG20 and FTSE 100: configuration `python/markets.py`, page generator, `assets/market.js` and `market-live.js`, daily builder `build_market.py`, 5-minute builder `build_market_live.py` with a bad-print filter, session job `markets_loop.py` / `live-markets.yml` (started with the DAX job) and backup `update-markets.yml`. Correlation views limited to the 20 largest members. Market links added to the tab bars. Later the same day: `build_market.py` fetches a member again on its own when Yahoo's batch download drops it.

- **2026-11-13** — Morning start moved to a weekday Claude scheduled task (08:10 Frankfurt). Kept data files now end the run with a warning instead of a failure. Added this guide and `CLAUDE.md`.
- **2026-11-12** — Session-long live job replaces the 5-minute cron. Daily data refreshed before the open as well as after the close, plus backup runs. Guards against older data, carry-over of market caps and ECB series, unchanged files not rewritten. Open pages reload new daily data. Market internals: description under each measure, unchanged stocks shown.
- **2026-11-11** — DAX market page added: daily data job, live 5-minute layer with Chart.js, D3 and Cytoscape views, update box and per-panel update lines. Volatility heatmap and correlation colours reworked to green-to-red scales.
