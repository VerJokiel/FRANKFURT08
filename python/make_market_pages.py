"""Write the Market View pages from python/markets.py: the overview of all indices (markets.html),
the five European market pages (cac40.html, ibex35.html, ftsemib.html, wig20.html, ftse100.html) from one
template, and the navigation of index.html and dax.html (one "Market View" tab in the main bar, and on
every index page a second bar with All indices · DAX · CAC 40 · …).

    python python/make_market_pages.py

Run it after changing markets.py (members, holidays, hours) or the template below, and commit the pages.
Each page embeds its configuration as window.MARKET and loads data/markets/<id>.js (daily data),
assets/market.js (daily views) and assets/market-live.js (5-minute layer).
"""
from __future__ import annotations

import html
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from markets import MARKETS, ORDER, view_entries  # noqa: E402

CCY_TEXT = {"EUR": "Prices in euros.", "PLN": "Prices in złoty.", "GBP": "Prices in pence (p), as quoted on the London Stock Exchange."}

RATES_NOTE = {
    "euro": ("Interest rates", "ECB deposit facility rate, the 10-year euro area AAA yield (daily, ECB yield curve) and the 10-year {adj} "
             "government bond yield (monthly average, ECB long-term interest rate statistics). The tile above shows the spread over Germany."),
    "wig20": ("Interest rates", "NBP reference rate (Bank for International Settlements policy-rate data) and the 10-year Polish government "
              "bond yield (monthly average, ECB long-term interest rate statistics)."),
    "ftse100": ("Interest rates", "Bank of England Bank Rate and the 10-year gilt par yield, both daily from the Bank of England database."),
}
FX_NOTE = {
    "euro": ("EUR/USD", "ECB euro reference rate. A stronger euro weighs on exporters and on companies that report in euros but earn in dollars."),
    "wig20": ("Złoty", "ECB reference rates: złoty per euro and per US dollar (the dollar rate is derived from the two euro rates). "
              "A weaker złoty raises the złoty value of exporters' sales, such as KGHM's copper."),
    "ftse100": ("Pound sterling", "US dollars and euros per pound, derived from ECB reference rates. Most FTSE 100 revenue is earned abroad, "
                "so a weaker pound tends to lift the index."),
}
SOURCES_NOTE = {
    "euro": '<a href="https://data.ecb.europa.eu">ECB Data Portal</a> API: deposit facility rate (FM), 10-year AAA yield (YC), long-term government bond yields of {country} and Germany (IRS, monthly) and the EUR/USD reference rate (EXR).',
    "wig20": '<a href="https://data.bis.org">BIS</a> central bank policy rates (WS_CBPOL) for the NBP reference rate; <a href="https://data.ecb.europa.eu">ECB Data Portal</a>: 10-year Polish yield (IRS, monthly) and the EUR/PLN and EUR/USD reference rates (EXR).',
    "ftse100": '<a href="https://www.bankofengland.co.uk/boeapps/database/">Bank of England database</a>: Bank Rate (IUDBEDR) and 10-year gilt par yield (IUDMNPY), with BIS policy rates as a fallback; <a href="https://data.ecb.europa.eu">ECB Data Portal</a>: EUR/GBP and EUR/USD reference rates (EXR).',
}


MAIN_TABS = [("index.html#overview", "Overview"), ("index.html#thesis", "Investment thesis"), ("index.html#vol", "Weekly volatility"),
             ("index.html#corr", "Correlation matrix"), ("index.html#risk", "Short-term risk"), ("index.html#ltrisk", "Long-term risk"),
             ("index.html#crises", "Crisis history")]


def nav(current: str | None) -> str:
    """Main tab bar plus the Market View bar, for markets.html, dax.html and the five market pages.
    current: 'view' for markets.html, otherwise the page file name of the index."""
    out = ['  <nav class="tabs" aria-label="Dashboard pages">']
    out += [f'    <a class="tab-link" href="{h}">{t}</a>' for h, t in MAIN_TABS]
    out.append('    <a class="tab-link dax-link" href="markets.html" aria-current="page">Market View</a>')
    out.append("  </nav>")
    out.append('  <nav class="subtabs" aria-label="Market View">')
    cur = ' aria-current="page"' if current == "view" else ""
    out.append(f'    <a class="subtab-link all" href="markets.html"{cur}>All indices</a>')
    for e in view_entries():
        cur = ' aria-current="page"' if e["page"] == current else ""
        out.append(f'    <a class="subtab-link" href="{e["page"]}"{cur}><span>{e["name"]}</span><small>{e["country"]}</small></a>')
    out.append("  </nav>")
    return "\n".join(out)


def page(mid: str) -> str:
    m = MARKETS[mid]
    kind = "euro" if m["currency"] == "EUR" else mid
    n = len(m["members"])
    cn = min(m["corr_n"], n)
    cfg = {k: m[k] for k in ("id", "name", "short", "country", "exchange", "city", "tz", "open", "close", "currency", "holidays", "corr_n")}
    e = html.escape
    rates_t, rates_n = RATES_NOTE[kind]
    fx_t, fx_n = FX_NOTE[kind]
    src = SOURCES_NOTE[kind].format(country=m["country"])
    corr_scope = "All 20 members" if cn == n else f"The {cn} largest members by index weight"
    hourly = (' The index has no daily history on Yahoo, so its closes before today are the last hourly bar of each session '
              '(they match the official close).') if mid == "wig20" else ""
    cap_txt = f"with the {int(m['cap'] * 100)}% single-name cap the index applies" if m["cap"] else "without a cap (the index has none)"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#13233f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap" rel="stylesheet">
<title>{e(m['name'])} market · FRANKFURT08</title>
<meta name="description" content="The current state of the {e(m['name'])} from real data: index level and risk, a market map of all {n} members, breadth, correlation of the largest stocks, sectors, rates and currency. 5-minute bars during the session, official closes after it.">
<link rel="stylesheet" href="assets/style.css">
<!-- generated by python/make_market_pages.py from python/markets.py; edit those, not this file -->
<script>window.MARKET = {json.dumps(cfg, ensure_ascii=False)};</script>
</head>
<body>
<div class="wrap">
  <header class="brand">
    <p class="kicker">FRANKFURT08 · {e(m['name'])} market</p>
    <h1>The {e(m['name'])} today</h1>
    <p class="lede">{e(m['lede'])} from real prices: 5-minute bars during the session and official closes after it. Where the index stands, how broad the move is, how tightly the largest stocks move together, and the rates and currency backdrop.</p>
    <div class="palette-strip" aria-hidden="true"><i style="flex:6;background:#24395f"></i><i style="flex:3;background:var(--sage-2)"></i><i style="flex:1;background:var(--alabaster)"></i><i style="flex:.6;background:var(--gold)"></i></div>
  </header>

{nav(m["page"])}

  <section class="page theme-a" id="page-mkt">
    <div class="card" id="dx-empty" hidden>
      <h2>Market data is on its way</h2>
      <p>The first data update has not finished yet. The job in <code>.github/workflows/live-markets.yml</code> (backup: <code>update-markets.yml</code>) fetches closing prices after every session and writes <code>data/markets/{mid}.js</code>; reload this page a few minutes after it completes.</p>
    </div>

    <div data-needs-data>
      <div class="dx-updates">
        <div class="dx-live-bar" role="status" aria-live="polite"><span class="dx-pill waiting" id="dx-live-pill">Waiting for data</span><span id="dx-live-text"></span></div>
        <p class="dx-next"><b>Next intraday update:</b> <span id="dx-next-live">checking…</span></p>
        <p class="dx-next"><b>Next daily update:</b> <span id="dx-next-daily"></span></p>
        <details class="dx-log"><summary>Updates received while this page is open (<span id="dx-log-count">0</span>)</summary><ul id="dx-log"></ul></details>
      </div>
      <p class="note" id="dx-asof"></p>
      <p class="note" id="dx-live-note"></p>
      <p class="dx-alert" id="dx-stale" hidden></p>
      <p class="dx-alert" id="dx-missing" hidden></p>
      <p class="dx-fresh" data-feed="mixed"></p>
      <div class="stats" id="dx-stats"></div>
      <p class="dx-read" id="dx-read"></p>

      <div class="card" data-feed="live" id="dx-intraday-card" hidden style="margin-top:16px">
        <h2 id="dx-intraday-title">Today's session</h2>
        <p class="note" id="dx-intraday-sub"></p>
        <div class="dx-canvas"><canvas id="dx-intraday" aria-label="{e(m['name'])} in 5-minute steps with the share of members above their previous close"></canvas></div>
      </div>

      <h2 class="section-title">Correlation of the largest stocks, updated with every bar</h2>
      <div class="card" data-feed="corr">
        <div class="controls">
          <span class="label">Returns</span>
          <div class="seg" id="dx-cwin" role="group" aria-label="Correlation window">
            <button type="button" data-w="today5" aria-pressed="false">Today, 5-min</button>
            <button type="button" data-w="week5" aria-pressed="false">5 sessions, 5-min</button>
            <button type="button" data-w="week30" aria-pressed="false">5 sessions, 30-min</button>
            <button type="button" data-w="d63" aria-pressed="true">3 months, daily</button>
            <button type="button" data-w="d252" aria-pressed="false">1 year, daily</button>
          </div>
        </div>
        <p class="note" id="dx-corr-note"></p>
        <p class="dx-sum" id="dx-corr-sum"></p>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="card wide" data-feed="corr" id="dx-matrix-card">
          <h2>Correlation matrix</h2>
          <p class="note">{corr_scope}, ordered by sector. Hover a cell for the pair.</p>
          <div class="tablewrap"><div class="dx-matrix-box dx-matrix-small"><canvas id="dx-matrix" aria-label="{cn} by {cn} correlation heatmap"></canvas></div></div>
          <div class="legend" id="dx-matrix-scale"></div>
        </div>
        <div class="card" data-feed="corr" id="dx-net-card">
          <h2>Correlation network</h2>
          <p class="note">The same {cn} stocks, sized by index weight. The spanning tree keeps the {cn - 1} strongest links that connect everything (distance √(2(1−ρ))); the threshold view shows every pair above a level. Drag to rearrange.</p>
          <div class="controls">
            <div class="seg" role="group" aria-label="Network links"><button type="button" id="dx-mst" aria-pressed="true">Spanning tree</button><button type="button" id="dx-thr-btn" aria-pressed="false">Threshold</button></div>
            <label class="label" for="dx-thr">ρ ≥ <span id="dx-thr-v">0.30</span></label><input id="dx-thr" type="range" min="0.05" max="0.8" step="0.05" value="0.3">
          </div>
          <div id="dx-net"><svg viewBox="0 0 640 480" role="img" aria-label="Force-directed correlation network"></svg><div class="tip" id="dx-net-tip" hidden></div></div>
        </div>
        <div class="card" data-feed="corr" id="dx-cy-card">
          <h2>Sector clusters</h2>
          <p class="note">The same {cn} stocks grouped by sector, each with its average internal correlation (ρ̄). Tap a sector to open it, tap its frame to close it. Edge labels are average correlations between groups.</p>
          <div class="controls">
            <button type="button" class="chip" id="dx-cy-all">Open all</button><button type="button" class="chip" id="dx-cy-none">Close all</button><button type="button" class="chip" id="dx-cy-lay">Re-arrange</button>
            <label class="label" for="dx-cy-cut">Show links</label><select id="dx-cy-cut"><option value="top12" selected>12 strongest</option><option value="0.1">0.10</option><option value="0.2">0.20</option><option value="0.3">0.30</option><option value="0.4">0.40</option></select>
          </div>
          <div id="dx-cy" aria-label="Interactive sector cluster graph"></div>
          <p class="note" id="dx-cy-info" style="margin-top:8px">Tap a stock for its correlation to its own sector and to the other largest members.</p>
        </div>
      </div>

      <h2 class="section-title">Market map</h2>
      <div class="card" data-feed="mixed">
        <div class="controls">
          <span class="label">Return over</span>
          <div class="seg" id="dx-period" role="group" aria-label="Return period">
            <button type="button" data-p="1d" aria-pressed="true">1 day</button>
            <button type="button" data-p="1w" aria-pressed="false">1 week</button>
            <button type="button" data-p="1m" aria-pressed="false">1 month</button>
            <button type="button" data-p="ytd" aria-pressed="false">Year to date</button>
            <button type="button" data-p="1y" aria-pressed="false">1 year</button>
          </div>
        </div>
        <div id="dx-map" class="box"></div>
        <div class="legend" id="dx-map-scale"></div>
      </div>

      <div class="grid" style="margin-top:16px">
        <div class="card" data-feed="mixed">
          <h2>Biggest moves</h2>
          <p class="note">Best and worst members over <span class="dx-period">1 day</span>. {CCY_TEXT[m['currency']]}</p>
          <div class="dx-movers">
            <div class="tablewrap"><table class="compact" id="dx-up"><thead><tr><th class="l">Up most</th><th>Close</th><th>Change</th></tr></thead><tbody></tbody></table></div>
            <div class="tablewrap"><table class="compact" id="dx-down"><thead><tr><th class="l">Down most</th><th>Close</th><th>Change</th></tr></thead><tbody></tbody></table></div>
          </div>
        </div>
        <div class="card" data-feed="mixed">
          <h2>Market internals</h2>
          <p class="note">How broad the market's move is. Unlike the index, each of the {n} members counts once, whatever its weight; the bars show the share of members.</p>
          <div class="tablewrap"><table class="compact dx-internals" id="dx-breadth-table"><thead><tr><th class="l">Measure</th><th>Now</th><th class="l">Share of members</th></tr></thead><tbody></tbody></table></div>
        </div>
      </div>

      <h2 class="section-title">The index</h2>
      <div class="grid">
        <div class="card wide" data-feed="mixed">
          <h2>{e(m['name'])} level</h2>
          <p class="note">Daily close in index points with its 200-day average. Trading above a rising 200-day average is the usual definition of an uptrend.</p>
          <div id="dx-level" class="box"></div>
        </div>
        <div class="card" data-feed="mixed">
          <h2>Drawdown</h2>
          <p class="note">Distance below the highest close so far in the window.</p>
          <div id="dx-dd" class="box"></div>
        </div>
        <div class="card" data-feed="mixed">
          <h2>Realised volatility</h2>
          <p class="note">Standard deviation of the last 21 daily returns, annualised, against its one-year average.</p>
          <div id="dx-vol" class="box"></div>
        </div>
      </div>

      <h2 class="section-title">Inside the index</h2>
      <div class="grid">
        <div class="card wide" data-feed="mixed">
          <h2>Breadth</h2>
          <p class="note">Share of members trading above their own 50-day and 200-day averages. A rising index with falling breadth means a few large names carry it.</p>
          <div id="dx-breadth" class="box"></div>
        </div>
        <div class="card" data-feed="mixed">
          <h2>Average correlation</h2>
          <p class="note">Mean of all <span id="dx-pairs"></span> pairwise correlations between the {n} members' daily returns over three months. High values mean macro news drives everything; diversification inside the index then works less.</p>
          <div id="dx-corr" class="box"></div>
        </div>
        <div class="card" data-feed="mixed">
          <h2>Dispersion</h2>
          <p class="note">Spread of members' one-month returns (cross-sectional standard deviation). High dispersion means stock picking matters more than the index direction.</p>
          <div id="dx-disp" class="box"></div>
        </div>
        <div class="card wide" data-feed="mixed">
          <h2>Sectors</h2>
          <p class="note">Members grouped by sector and weighted by index weight. Volatility and the average correlation inside the sector use the last year of daily returns.</p>
          <div class="tablewrap"><table class="compact" id="dx-sectors"><thead><tr><th class="l">Sector</th><th>Members</th><th>Weight</th><th>1 day</th><th>1 month</th><th>Year to date</th><th>1 year</th><th>Volatility</th><th>Avg correlation</th></tr></thead><tbody></tbody></table></div>
        </div>
      </div>

      <div id="dx-macro">
        <h2 class="section-title">Rates and currency</h2>
        <p class="dx-fresh" data-feed="ecb"></p>
        <div class="stats" id="dx-macro-stats"></div>
        <div class="grid" style="margin-top:16px">
          <div class="card" data-feed="ecb">
            <h2>{rates_t}</h2>
            <p class="note">{rates_n.format(adj=m['adj'])}</p>
            <div id="dx-rates" class="box"></div>
          </div>
          <div class="card" data-feed="ecb">
            <h2>{fx_t}</h2>
            <p class="note">{fx_n}</p>
            <div id="dx-fx" class="box"></div>
          </div>
        </div>
      </div>

      <h2 class="section-title">Data and method</h2>
      <div class="card">
        <ul class="dx-method">
          <li><b>Prices:</b> daily closes of the {n} {e(m['name'])} members on {e(m['exchange'])} and the index ({e(m['index_yf'])}), adjusted for dividends and splits, from Yahoo Finance through the open-source <a href="https://github.com/ranaroussi/yfinance">yfinance</a> library.{hourly} Trading hours {m['open']}–{m['close']} {e(m['city'])} time; times on this page are {e(m['city'])} time.</li>
          <li><b>Rates and currency:</b> {src}</li>
          <li><b>Weights:</b> <span id="dx-weights"></span>, computed from full market capitalisation {cap_txt}. The official index uses free-float market caps, so weights are close but not exact.</li>
          <li><b>Correlation views:</b> the matrix, network and sector clusters show the {cn} largest members by weight, so they stay readable; the average correlation, breadth and market map use all {n} members.</li>
          <li><b>Live updates:</b> during trading hours one GitHub Actions job (<code>live-markets.yml</code>) fetches 5-minute bars for all five market pages every 5 minutes and publishes them to the <code>live-markets</code> branch. This page checks for a new file every 30 seconds and recomputes everything on each new bar. Yahoo delays exchange quotes by about 15 minutes and GitHub can start jobs a few minutes late, so live figures trail the market by roughly 15–25 minutes. Real-time prices need a paid data licence.</li>
          <li><b>Daily update:</b> after the session the same job runs <code>python/build_market.py</code> (about 18:10 Frankfurt time) and commits the official closes to <code>data/markets/{mid}.js</code>; <code>update-markets.yml</code> repeats it later as a backup. If a fetch fails, the last good data stays online.</li>
          <li><b>Short-interval correlation:</b> 5-minute returns understate correlation because stocks do not all trade in the same seconds (the Epps effect); the 30-minute and daily windows correct for most of it.</li>
          <li><b>Metrics:</b> returns use closes 1, 5, 21 and 252 sessions back. VaR and ES are historical, from the last 252 daily index returns. Average correlation uses the identity Σρ<sub>ij</sub> = Var(Σz<sub>i</sub>) for standardised returns. A new 52-week high means the highest close of the last 10 sessions beats the previous 242.</li>
          <li><b>Members:</b> {e(m['review'])} The list in <code>python/markets.py</code> needs updating after each review.</li>
        </ul>
      </div>
    </div>
  </section>

  <footer>
    <p>Data: Yahoo Finance (via yfinance), the ECB Data Portal{', the Bank for International Settlements' if mid in ('wig20', 'ftse100') else ''}{' and the Bank of England' if mid == 'ftse100' else ''}. Intraday prices are 5-minute bars delayed about 15 minutes by the source; nothing on this page is real-time. Index weights are approximations from market capitalisation.</p>
    <p>For educational purposes only; not investment advice.</p>
    <p>The information provided on this page is for informational and educational purposes only and does not constitute general or personal investment advice, a personal recommendation, or an offer or solicitation to buy or sell any financial instruments. It does not take into account the specific investment objectives, financial situation, or particular needs of any individual recipient. Within the meaning of Directive 2014/65/EU (MiFID II), this content is deemed generic information or marketing communication and does not establish a fiduciary or advisory relationship.</p>
  </footer>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@2.0.1/dist/chartjs-chart-matrix.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js"></script>
<script src="data/markets/{mid}.js" onerror="window.MKT = null"></script>
<script src="assets/market.js"></script>
<script src="assets/market-live.js"></script>
</body>
</html>
"""


VIEW_COLORS = ["#d6b062", "#7fd1d8", "#f2948a", "#9fcb9b", "#c7a8e8", "#a3b8de"]


def view_page() -> str:
    entries = view_entries()
    cfg = [{k: e[k] for k in ("id", "page", "name", "country", "exchange", "city", "tz", "open", "close", "currency", "data", "series",
                              "live_branch", "live_file", "live_key", "holidays")} | {"color": VIEW_COLORS[i % len(VIEW_COLORS)]}
           for i, e in enumerate(entries)]
    names = ", ".join(e["name"] for e in entries[:-1]) + " and " + entries[-1]["name"]
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#13233f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap" rel="stylesheet">
<title>Market View · FRANKFURT08</title>
<meta name="description" content="All tracked equity indices side by side from real data: {names}. Levels, returns, risk, breadth, correlation between the markets, with 5-minute prices during the session.">
<link rel="stylesheet" href="assets/style.css">
<!-- generated by python/make_market_pages.py from python/markets.py; edit those, not this file -->
<script>window.MARKET_VIEW = {json.dumps(cfg, ensure_ascii=False)};</script>
</head>
<body>
<div class="wrap">
  <header class="brand">
    <p class="kicker">FRANKFURT08 · Market View</p>
    <h1>European equity indices</h1>
    <p class="lede">Every index tracked on this site side by side: {names}. Where each one stands, how they compare on return and risk, and how closely they move together. Daily closes after each session, 5-minute prices while the markets trade. Open any index for its full page.</p>
    <div class="palette-strip" aria-hidden="true"><i style="flex:6;background:#24395f"></i><i style="flex:3;background:var(--sage-2)"></i><i style="flex:1;background:var(--alabaster)"></i><i style="flex:.6;background:var(--gold)"></i></div>
  </header>

{nav("view")}

  <section class="page theme-a" id="page-view">
    <div class="dx-updates">
      <div class="dx-live-bar" role="status" aria-live="polite"><span class="dx-pill waiting" id="mv-pill">Loading</span><span id="mv-status">Loading the data of {len(entries)} indices…</span></div>
      <p class="dx-next"><b>Updates:</b> <span id="mv-next">5-minute prices are checked every minute while any market trades; daily closes arrive after each session (about 18:10 Frankfurt time).</span></p>
    </div>
    <p class="dx-alert" id="mv-error" hidden></p>

    <h2 class="section-title">The indices today</h2>
    <p class="note mv-intro">Each card: level and change on the day (from 5-minute prices while the exchange is open), the last year with its 200-day average, and returns and risk at a glance. Tap a card to open the index page.</p>
    <div class="mv-cards" id="mv-cards"></div>

    <h2 class="section-title">Performance compared</h2>
    <div class="card" data-feed="mixed">
      <div class="controls">
        <span class="label">Since</span>
        <div class="seg" id="mv-period" role="group" aria-label="Comparison period">
          <button type="button" data-p="21" aria-pressed="false">1 month</button>
          <button type="button" data-p="63" aria-pressed="false">3 months</button>
          <button type="button" data-p="ytd" aria-pressed="false">Year to date</button>
          <button type="button" data-p="252" aria-pressed="true">1 year</button>
          <button type="button" data-p="all" aria-pressed="false">2 years</button>
        </div>
      </div>
      <p class="note">Each index rebased to 100 at the start of the period, in its own currency (euro, złoty, pound). The DAX is a performance index that reinvests dividends; the others are price indices, so over a year the DAX gains roughly its dividend yield (about 2–3%) on them.</p>
      <div id="mv-perf" class="box"></div>
    </div>

    <h2 class="section-title">Side by side</h2>
    <div class="card" data-feed="mixed">
      <p class="note">Click a column to sort. Returns over 1, 5, 21 and 252 sessions; volatility is the annualised standard deviation of daily returns; VaR and ES come from the last 252 daily returns; breadth is the share of members above their 200-day average; average correlation is the mean pairwise correlation of the members' daily returns over three months.</p>
      <div class="tablewrap"><table class="compact mv-table" id="mv-table"><thead><tr></tr></thead><tbody></tbody></table></div>
    </div>

    <div class="grid" style="margin-top:16px">
      <div class="card" data-feed="mixed">
        <h2>Return and risk, last year</h2>
        <p class="note">One-year return against one-year volatility. Up and to the left is more return for less risk.</p>
        <div id="mv-scatter" class="box"></div>
      </div>
      <div class="card" data-feed="mixed">
        <h2>How the indices move together</h2>
        <div class="controls">
          <span class="label">Daily returns over</span>
          <div class="seg" id="mv-cwin" role="group" aria-label="Correlation window">
            <button type="button" data-w="63" aria-pressed="false">3 months</button>
            <button type="button" data-w="252" aria-pressed="true">1 year</button>
          </div>
        </div>
        <p class="note">Correlation of the indices' daily returns on days all of them traded, in local currency. All six close between 17:30 and 17:35 Central European time, so same-day returns line up.</p>
        <div id="mv-corr" class="box"></div>
        <div class="legend" id="mv-corr-scale"></div>
      </div>
    </div>

    <h2 class="section-title">Data and method</h2>
    <div class="card">
      <ul class="dx-method">
        <li><b>Data:</b> the same files as the index pages: daily closes (Yahoo Finance via yfinance, adjusted for dividends and splits) in <code>data/dax40.js</code> and <code>data/markets/&lt;id&gt;.js</code>, refreshed after each session; 5-minute bars from the <code>live-data</code> (DAX) and <code>live-markets</code> branches, delayed about 15 minutes by the source.</li>
        <li><b>Today:</b> while an exchange is open, its index and members get a provisional price for today (last close × latest 5-minute price ÷ previous close), and every figure for that index includes it. Closed exchanges show their last close.</li>
        <li><b>Currencies:</b> every index is measured in its own currency. For a euro investor the WIG20 and the FTSE 100 also carry the złoty and pound exchange rate, which the index pages show.</li>
        <li><b>Members:</b> current members only (survivorship); weights are approximations from market capitalisation. Each index page explains its own data in detail.</li>
      </ul>
    </div>
  </section>

  <footer>
    <p>Data: Yahoo Finance (via yfinance). Intraday prices are 5-minute bars delayed about 15 minutes by the source; nothing on this page is real-time.</p>
    <p>For educational purposes only; not investment advice.</p>
    <p>The information provided on this page is for informational and educational purposes only and does not constitute general or personal investment advice, a personal recommendation, or an offer or solicitation to buy or sell any financial instruments. It does not take into account the specific investment objectives, financial situation, or particular needs of any individual recipient. Within the meaning of Directive 2014/65/EU (MiFID II), this content is deemed generic information or marketing communication and does not establish a fiduciary or advisory relationship.</p>
  </footer>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<script src="assets/market-view.js"></script>
</body>
</html>
"""


NAV_START, NAV_END = "<!-- nav: python/make_market_pages.py -->", "<!-- /nav -->"
LINK_START, LINK_END = "<!-- market view link: python/make_market_pages.py -->", "<!-- /market view link -->"


def _between(s: str, a: str, b: str, block: str) -> str:
    i, j = s.index(a), s.index(b) + len(b)
    return s[:i] + block + s[j:]


def update_navs() -> None:
    """index.html: one Market View tab in its tab bar. dax.html: the same navigation as the market pages."""
    p = ROOT / "index.html"
    s = p.read_text(encoding="utf-8")
    link = LINK_START + '\n    <a class="tab-link dax-link" href="markets.html">Market View</a>\n    ' + LINK_END
    if LINK_START in s:
        s = _between(s, LINK_START, LINK_END, link)
    else:  # first run: replace the old DAX link and per-market links
        a = s.index('<a class="tab-link dax-link" href="dax.html">')
        b = s.index("<!-- /market links -->") + len("<!-- /market links -->") if "<!-- /market links -->" in s else s.index("</a>", a) + 4
        s = s[:a] + link + s[b:]
    p.write_text(s, encoding="utf-8")

    p = ROOT / "dax.html"
    s = p.read_text(encoding="utf-8")
    block = NAV_START + "\n" + nav("dax.html") + "\n  " + NAV_END
    if NAV_START in s:
        s = _between(s, NAV_START, NAV_END, block)
    else:
        a = s.index('<nav class="tabs"')
        b = s.index("</nav>", a) + len("</nav>")
        s = s[:a] + block + s[b:]
    p.write_text(s, encoding="utf-8")


def main() -> None:
    (ROOT / "markets.html").write_text(view_page(), encoding="utf-8")
    print("wrote markets.html")
    for mid in ORDER:
        (ROOT / MARKETS[mid]["page"]).write_text(page(mid), encoding="utf-8")
        print("wrote", MARKETS[mid]["page"])
    update_navs()
    print("updated the navigation of index.html and dax.html")


if __name__ == "__main__":
    main()
