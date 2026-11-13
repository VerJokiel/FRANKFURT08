# Repository guide

How this repository is built, where the data comes from, how it is kept up to date, and what needs looking after. Keep this file current: update it in the same commit as any change to the pages, data jobs, schedules, colour conventions or methodology, and add a line to the [change log](#change-log).

Site (GitHub Pages, branch `main`, root): [three-pillar dashboard](https://verjokiel.github.io/FRANKFURT08/) · [DAX market page](https://verjokiel.github.io/FRANKFURT08/dax.html)

## Pages

**`index.html` — three-pillar ETF dashboard.** Nine Frankfurt-listed stocks in three equal-weight pillar ETFs: Banking 1–3, Industry 1–3, Oil & Energy 1–3. The stocks are anonymised in this public repository; never add real names or tickers for them. Tabs (buttons `.tab[data-tab]`, hash routing): `#overview`, `#thesis` (investment thesis), `#vol` (weekly volatility), `#corr` (correlation matrix), `#risk` (short-term risk, layer 1), `#ltrisk` (long-term risk, layer 2), `#crises` (crisis history), plus a link tab to the DAX market page.

**`dax.html` — DAX market page.** All 40 DAX members from real data: daily closes plus a live layer of 5-minute bars during the Xetra session.
- An update box at the top shows the live status, the latest bar and its publish time, when the next intraday and daily updates are due (Frankfurt time, skipping weekends and Xetra holidays), and a log of updates received while the page is open.
- Every panel carries a `data-feed` attribute (`live`, `mixed`, `corr` or `ecb`) and an automatic update line saying what data it shows and when it next changes, refreshed every 15 seconds. Live-fed panels flash when a new bar arrives.
- An open page checks for a newer daily data file every 15 minutes and reloads when one is published.
- Sections: headline figures, intraday chart, correlation (matrix, network, sector clusters), market map, biggest moves, market internals, index charts, breadth, average correlation, dispersion, sectors, rates and EUR/USD, data and method.

## Code layout

Static site, no build step. d3 v7.9.0 from cdnjs; on `dax.html` also Chart.js 4.4.1, chartjs-chart-matrix 2.0.1 and Cytoscape.js 3.28.1.

| Path | Contents |
|---|---|
| `assets/app.js` | Overview, volatility and correlation tabs; shared helpers exported as `window.DashKit` (`lineChart` with options `yDomain`, `refY`, `endLabels`, `head`, `height`, `bands`; `showTip`, `stat`, `cssVar`, `sectorColor`, …). Correlation tab right panel: rolling chart with bands, pair figures and clickable most/least correlated pairs. |
| `assets/risk.js`, `ltrisk.js`, `crises.js`, `fan.js`, `thesis.js` | Risk layer 1, risk layer 2, crisis history, fan chart, investment-thesis checks. |
| `assets/dax.js` | `window.DaxSchedule` (Frankfurt-time helpers and the `XETRA_HOLIDAYS` list) and the daily views of `dax.html`. `DaxDaily.applyLive()` rebuilds every view with a provisional row for today; `DaxDaily.stamp()` writes the per-panel update lines. |
| `assets/dax-live.js` | Polls the live file every 30 s; update box; daily-file reload check; intraday chart (Chart.js); correlation matrix (chartjs-chart-matrix), force-directed network (D3: minimum spanning tree or threshold) and sector clusters (Cytoscape.js). |
| `assets/style.css` | Palette and all styles. Direction A (`.theme-a`): navy `#13233F` and sage `#3E5F44` panels, alabaster `#F3EFE6` canvas, gold `#C9A55A` accent, Newsreader headings, Inter body. Direction B (`.theme-b`, risk tabs): light fintech look with teal `#24BDC8`. |
| `data/` | `data.js` (nine-stock prices), `longterm.js` (25 years), `benchmark_dax.csv`, `dax40.js` and `dax40_prices.csv` (generated, do not edit by hand). |
| `python/` | `risk_metrics.py` and `longterm_risk.py` (reference implementations), `build_dax40.py` (daily DAX data), `build_live.py` (one fetch of 5-minute bars), `live_loop.py` (runs the live layer through a session), `requirements.txt`. |
| `docs/` | `INVESTMENT_THESIS.md`, `RISK_METHODOLOGY.md`, `CRISIS_HISTORY.md`, this guide. |
| `.github/workflows/` | `live-dax40.yml` (session job), `update-dax40.yml` (backup daily data). |

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
| Every December | Extend the Xetra holiday lists from the Deutsche Börse trading calendar, in both `XETRA_HOLIDAYS` in `assets/dax.js` and `HOLIDAYS` in `python/live_loop.py` (currently up to the end of 2027). |
| If the page shows a stale-data warning | Check *Actions* for failed runs, then start *Live DAX bars* or *Update DAX market data* by hand. |
| After 60 days without repository activity | GitHub pauses scheduled workflows; the daily bot commits normally prevent this. |

## Change log

- **2026-11-13** — Morning start moved to a weekday Claude scheduled task (08:10 Frankfurt). Kept data files now end the run with a warning instead of a failure. Added this guide and `CLAUDE.md`.
- **2026-11-12** — Session-long live job replaces the 5-minute cron. Daily data refreshed before the open as well as after the close, plus backup runs. Guards against older data, carry-over of market caps and ECB series, unchanged files not rewritten. Open pages reload new daily data. Market internals: description under each measure, unchanged stocks shown.
- **2026-11-11** — DAX market page added: daily data job, live 5-minute layer with Chart.js, D3 and Cytoscape views, update box and per-panel update lines. Volatility heatmap and correlation colours reworked to green-to-red scales.
