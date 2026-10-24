/* =====================================================================
   Long-term risk layer: VaR and Expected Shortfall over 1-year and
   5-year holding periods, estimated from up to 25 years of daily data.

   LTCore  pure calculations (mirrored in python/longterm_risk.py)
   LTRiskTab  the dashboard tab

   Conventions (as in risk.js): simple returns, loss = -return, losses positive,
   alpha = confidence level, horizon h in trading days (252 = 1Y, 1260 = 5Y).
   ===================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Crisis episodes shared with the Crisis history tab.                 */
  /* peak = DAX high searched in [p0, p1]; trough = DAX low in [t0, t1]. */
  /* ------------------------------------------------------------------ */
  const EPISODES = [
    { id: 'dotcom', name: 'Dot-com bust & 9/11', p0: '2000-12-01', p1: '2001-06-30', t0: '2002-06-01', t1: '2003-04-30' },
    { id: 'gfc', name: 'Global financial crisis', p0: '2007-06-01', p1: '2007-12-31', t0: '2008-06-01', t1: '2009-03-31' },
    { id: 'euro', name: 'Euro debt crisis', p0: '2011-04-01', p1: '2011-07-31', t0: '2011-08-01', t1: '2011-12-31' },
    { id: 'oil', name: 'Oil price collapse', p0: '2014-05-01', p1: '2014-07-31', t0: '2015-08-01', t1: '2016-02-29' },
    { id: 'brexit', name: 'Brexit vote', p0: '2016-06-23', p1: '2016-06-23', t0: '2016-06-24', t1: '2016-07-08' },
    { id: 'q4-2018', name: 'Q4 2018 sell-off', p0: '2018-09-01', p1: '2018-10-31', t0: '2018-11-01', t1: '2018-12-31' },
    { id: 'covid', name: 'COVID-19 crash', p0: '2020-01-15', p1: '2020-02-28', t0: '2020-03-01', t1: '2020-04-30' },
    { id: 'ukraine', name: 'Ukraine war & energy shock', p0: '2021-12-15', p1: '2022-01-31', t0: '2022-02-01', t1: '2022-10-31' },
    { id: 'banks-2023', name: 'Banking turmoil 2023', p0: '2023-03-01', p1: '2023-03-09', t0: '2023-03-10', t1: '2023-03-31' },
    { id: 'tariffs', name: 'Tariff shock 2025', p0: '2025-03-01', p1: '2025-03-31', t0: '2025-04-01', t1: '2025-04-30' },
  ];
  const SUB_EVENTS = [   // short, sharp events inside the big episodes
    { id: '911', name: '9/11 attacks', p0: '2001-09-10', p1: '2001-09-10', t0: '2001-09-11', t1: '2001-09-30' },
    { id: 'lehman', name: 'Lehman collapse', p0: '2008-09-12', p1: '2008-09-12', t0: '2008-09-15', t1: '2008-11-30' },
  ];

  /* ------------------------------------------------------------------ */
  /* LTCore                                                              */
  /* ------------------------------------------------------------------ */
  const RC = () => window.RiskCore;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

  let built = null;
  /** Daily returns of stocks, pillar ETFs (equal weight over listed members), portfolio (equal pillars) and DAX. */
  function build() {
    if (built) return built;
    const L = window.LT, n = L.dates.length;
    const stocks = window.DATA.stocks;                 // ids, names, sectors (same codes)
    const ret = (col) => { const v = L.values[col]; const r = new Array(n).fill(null); for (let t = 1; t < n; t++) if (v[t] != null && v[t - 1] != null) r[t] = v[t] / v[t - 1] - 1; return r; };
    const R = Object.fromEntries(stocks.map((s) => [s.id, ret(s.id)]));
    const sectors = [...new Set(stocks.map((s) => s.sector))];
    const series = {};
    const members = {};
    for (const sec of sectors) {
      const ids = stocks.filter((s) => s.sector === sec).map((s) => s.id);
      members[sec] = new Array(n).fill(0);
      series[sec] = new Array(n).fill(0);
      for (let t = 1; t < n; t++) { const xs = ids.map((id) => R[id][t]).filter((x) => x != null); members[sec][t] = xs.length; series[sec][t] = xs.length ? mean(xs) : 0; }
    }
    series.Portfolio = new Array(n).fill(0);
    for (let t = 1; t < n; t++) series.Portfolio[t] = mean(sectors.map((s) => series[s][t]));
    series.DAX = ret('DAX').map((x) => x ?? 0);
    const oil = L.values.OIL_WTI;
    built = { dates: L.dates, n, R, series, sectors, members, oil, start: L.start };
    return built;
  }

  /** Slice of daily returns for the training sample ('20y' = last 20 calendar years, 'all' = since 2001-01-02). */
  function trainingIndex(B, train) {
    const last = B.dates[B.n - 1];
    const from = train === '20y' ? (Number(last.slice(0, 4)) - 20) + last.slice(4) : '2001-01-02';
    let i = B.dates.findIndex((d) => d >= from); if (i < 1) i = 1;
    return i;                                  // returns r[i..n-1]
  }

  const logs = (r) => r.map((x) => Math.log1p(x));
  function prefix(a) { const p = new Float64Array(a.length + 1); for (let i = 0; i < a.length; i++) p[i + 1] = p[i] + a[i]; return p; }

  /** Historical simulation on overlapping h-day windows: all compounded h-day returns. */
  function overlapping(r, h) {
    const P = prefix(logs(r)), out = [];
    for (let t = h; t <= r.length; t++) out.push(Math.expm1(P[t] - P[t - h]));
    return out;                                // returns (not losses)
  }
  function varEsFromReturns(rets, alpha) {
    const L = rets.map((x) => -x).sort((a, b) => a - b);
    const v = RC().quantile(L, alpha), tail = L.filter((x) => x >= v);
    return { var: Math.min(1, v), es: Math.min(1, mean(tail)) };
  }
  /** Moving-block bootstrap: paths of length h built from random blocks of b days. */
  function bootstrap(r, h, { paths = 10000, block = 63, seed = 7 } = {}) {
    const P = prefix(logs(r)), N = r.length, g = RC().rng(seed), out = new Float64Array(paths);
    for (let p = 0; p < paths; p++) {
      let left = h, s = 0;
      while (left > 0) { const len = Math.min(block, left); const st = Math.floor(g.u() * (N - len + 1)); s += P[st + len] - P[st]; left -= len; }
      out[p] = Math.expm1(s);
    }
    return Array.from(out);
  }
  /** Fan-chart paths: the same block bootstrap (same random numbers, so the end points equal bootstrap()),
      recording the growth factor at every `step` days and at h. Returns {xs, paths}. */
  function fanPaths(r, h, { paths = 10000, block = 63, seed = 7, step = 21 } = {}) {
    const P = prefix(logs(r)), N = r.length, g = RC().rng(seed);
    const xs = [0]; for (let c = step; c < h; c += step) xs.push(c); xs.push(h);
    const out = new Array(paths);
    for (let p = 0; p < paths; p++) {
      const row = new Float64Array(xs.length); row[0] = 1;
      let left = h, s = 0, done = 0, k = 1;
      while (left > 0) {
        const len = Math.min(block, left); const st = Math.floor(g.u() * (N - len + 1));
        while (k < xs.length && xs[k] <= done + len) { row[k] = Math.exp(s + P[st + (xs[k] - done)] - P[st]); k++; }
        s += P[st + len] - P[st]; done += len; left -= len;
      }
      out[p] = row;
    }
    return { xs, paths: out };
  }
  /** Lognormal (geometric Brownian motion) on daily log returns: m = mu*h, s = sigma*sqrt(h). */
  function lognormal(mu, sigma, h, alpha) {
    const z = RC().normInv(alpha), m = mu * h, s = sigma * Math.sqrt(h);
    const v = 1 - Math.exp(m - z * s);
    const es = 1 - Math.exp(m + s * s / 2) * RC().normCdf(-z - s) / (1 - alpha);
    return { var: v, es };
  }
  /** Square-root-of-time scaling of 1-day historical VaR/ES (Basel convention), capped at 100%. */
  function sqrtTime(r, h, alpha) {
    const one = RC().historical(r, alpha), k = Math.sqrt(h);
    return { var: Math.min(1, one.var * k), es: Math.min(1, one.es * k), capped: one.es * k >= 1 || one.var * k >= 1 };
  }
  /** Stressed calibration: volatility of the most volatile 252-day window, long-run drift. */
  function stressedWindow(r, dates0) {
    const lr = logs(r), P = prefix(lr), P2 = prefix(lr.map((x) => x * x)), w = 252;
    let best = -1, at = 0;
    for (let t = w; t <= lr.length; t++) { const s1 = P[t] - P[t - w], s2 = P2[t] - P2[t - w]; const v = (s2 - s1 * s1 / w) / (w - 1); if (v > best) { best = v; at = t; } }
    return { sigma: Math.sqrt(best), from: dates0[at - w], to: dates0[at - 1] };
  }

  function estimate(r, dates0, h, alpha) {
    const lr = logs(r), mu = mean(lr), sigma = std(lr);
    const ov = overlapping(r, h), bs = bootstrap(r, h);
    const sw = stressedWindow(r, dates0);
    return {
      hist: { ...varEsFromReturns(ov, alpha), n: ov.length, indep: r.length / h },
      boot: varEsFromReturns(bs, alpha),
      logn: lognormal(mu, sigma, h, alpha),
      sqrt: sqrtTime(r, h, alpha),
      stress: { ...lognormal(mu, sw.sigma, h, alpha), from: sw.from, to: sw.to, sigmaAnn: sw.sigma * Math.sqrt(252) },
      ov, bs, mu, sigma,
    };
  }
  const pctile = (sorted, p) => RC().quantile(sorted, p);

  function drawdownStats(r, dates0) {
    let lvl = 1, peak = 1, peakIdx = 0, max = 0, trough = 0, maxPeak = 0, longest = 0, curStart = null;
    const dd = new Array(r.length);
    for (let t = 0; t < r.length; t++) {
      lvl *= 1 + r[t];
      if (lvl >= peak) { peak = lvl; peakIdx = t; if (curStart != null) { longest = Math.max(longest, t - curStart); curStart = null; } }
      else if (curStart == null) curStart = peakIdx;
      dd[t] = lvl / peak - 1;
      if (dd[t] < max) { max = dd[t]; trough = t; maxPeak = peakIdx; }
    }
    const underNow = curStart != null ? r.length - 1 - curStart : 0;
    longest = Math.max(longest, underNow);
    return { dd, max, troughDate: dates0[trough], peakDate: dates0[maxPeak], longestDays: longest, underNow, ddNow: dd[r.length - 1] };
  }

  /** Rolling correlation over w days (incremental sums). */
  function rollingCorr(a, b, w) {
    const out = new Array(a.length).fill(null);
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let t = 0; t < a.length; t++) {
      sa += a[t]; sb += b[t]; saa += a[t] * a[t]; sbb += b[t] * b[t]; sab += a[t] * b[t];
      if (t >= w) { const x = a[t - w], y = b[t - w]; sa -= x; sb -= y; saa -= x * x; sbb -= y * y; sab -= x * y; }
      if (t >= w - 1) { const cov = sab - sa * sb / w, va = saa - sa * sa / w, vb = sbb - sb * sb / w; out[t] = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null; }
    }
    return out;
  }

  /** DAX peak/trough dates for an episode, and each series' return between them. */
  function episodeStats(B, ep) {
    const d = B.dates, dax = window.LT.values.DAX;
    const range = (a, b) => { const i0 = d.findIndex((x) => x >= a); let i1 = d.length - 1; for (let i = i0; i < d.length; i++) { if (d[i] > b) { i1 = i - 1; break; } } return [i0, i1]; };
    const [a0, a1] = range(ep.p0, ep.p1), [b0, b1] = range(ep.t0, ep.t1);
    let pk = a0; for (let i = a0; i <= a1; i++) if (dax[i] > dax[pk]) pk = i;
    let tr = b0; for (let i = b0; i <= b1; i++) if (dax[i] < dax[tr]) tr = i;
    const total = (s) => { let g = 1; for (let t = pk + 1; t <= tr; t++) g *= 1 + B.series[s][t]; return g - 1; };
    const recovery = (s) => {             // trading days from trough until the series regains its level at the peak
      let g = 1; for (let t = pk + 1; t <= tr; t++) g *= 1 + B.series[s][t];
      let lvl = g; for (let t = tr + 1; t < B.n; t++) { lvl *= 1 + B.series[s][t]; if (lvl >= 1) return t - tr; }
      return null;
    };
    const res = { peak: d[pk], trough: d[tr], days: tr - pk, pk, tr };
    for (const s of [...B.sectors, 'Portfolio', 'DAX']) res[s] = total(s);
    res.recPortfolio = recovery('Portfolio'); res.recDAX = recovery('DAX');
    const oil = B.oil; let o0 = pk, o1 = tr; while (o0 <= tr && oil[o0] == null) o0++; while (o1 >= pk && oil[o1] == null) o1--;
    res.oil = o0 < o1 ? oil[o1] / oil[o0] - 1 : null;
    return res;
  }

  window.LTCore = { EPISODES, SUB_EVENTS, build, trainingIndex, overlapping, bootstrap, fanPaths, lognormal, sqrtTime, stressedWindow, estimate, varEsFromReturns, drawdownStats, rollingCorr, episodeStats };

  /* ================================================================== */
  /* LTRiskTab                                                           */
  /* ================================================================== */
  const st = { value: 15000, h: 252, alpha: 0.99, train: '20y', dd: 'port', fan: 'Portfolio', fanCmp: true };
  let wired = false, cache = {};
  const eur = (v) => d3.format(',.0f')(v) + ' €';
  const p1 = d3.format('.1%'), p0 = d3.format('.0%'), sp1 = (v) => (v > 0 ? '+' : '') + p1(v);
  const confLabel = () => d3.format('.1~%')(st.alpha);
  const hLabel = () => (st.h === 252 ? '1-year' : '5-year');

  function segSync(id, val) { document.querySelectorAll('#' + id + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v) === String(val) ? 'true' : 'false')); }
  function wire() {
    if (wired) return; wired = true;
    const seg = (id, key, parse) => document.getElementById(id).addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; st[key] = parse(b.dataset.v); draw(); });
    seg('lt-h', 'h', Number); seg('lt-conf', 'alpha', Number); seg('lt-train', 'train', String); seg('lt-ddsel', 'dd', String); seg('lt-fansel', 'fan', String);
    document.getElementById('lt-fancmp').addEventListener('change', (e) => { st.fanCmp = e.target.checked; draw(); });
    const v = document.getElementById('lt-value');
    v.addEventListener('change', () => { const x = Number(v.value); if (x > 0) { st.value = x; draw(); } else v.value = st.value; });
  }

  function compute() {
    const B = build(), i0 = trainingIndex(B, st.train), key = `${st.train}|${st.h}|${st.alpha}`;
    if (cache[key]) return cache[key];
    const dates0 = B.dates.slice(i0);
    const names = [...B.sectors, 'Portfolio', 'DAX'];
    const est = Object.fromEntries(names.map((s) => [s, estimate(B.series[s].slice(i0), dates0, st.h, st.alpha)]));
    return (cache[key] = { B, i0, dates0, names, est });
  }

  function colorOf(s) { const K = window.DashKit; return s === 'Portfolio' ? K.cssVar('--fg') : s === 'DAX' ? K.cssVar('--muted') : K.sectorColor(s); }

  function draw() {
    if (!window.DashKit || !window.LT) return;
    wire();
    segSync('lt-h', st.h); segSync('lt-conf', st.alpha); segSync('lt-train', st.train); segSync('lt-ddsel', st.dd); segSync('lt-fansel', st.fan);
    const m = compute();
    drawKpis(m); drawFan(m); drawMethods(m); drawHist(m); drawOutcomes(m); drawRolling(m); drawDD(m); drawCorr(m); drawPerf(m); drawYears(m);
  }

  function drawKpis(m) {
    const K = window.DashKit, V = st.value, P = m.est.Portfolio, D = m.est.DAX;
    const bsS = [...P.bs].sort((a, b) => a - b), pLoss = P.bs.filter((x) => x < 0).length / P.bs.length;
    const worst = Math.min(...P.ov), wIdx = P.ov.indexOf(worst);
    const wEnd = m.dates0[wIdx + st.h - 1], wStart = m.dates0[wIdx];
    const dd = drawdownStats(m.B.series.Portfolio.slice(m.i0), m.dates0);
    document.getElementById('lt-kpis').replaceChildren(
      K.stat(`${hLabel()} VaR ${confLabel()}`, eur(P.boot.var * V), `${p1(P.boot.var)} · block bootstrap`, null, true),
      K.stat(`${hLabel()} ES ${confLabel()}`, eur(P.boot.es * V), `${p1(P.boot.es)} · average tail loss`),
      K.stat('Chance of a loss', p0(pLoss), `over ${hLabel()} holding (DAX ${p0(D.bs.filter((x) => x < 0).length / D.bs.length)})`),
      K.stat('Median outcome', sp1(pctile(bsS, 0.5)), `${hLabel()} total return`),
      K.stat(`Worst ${hLabel()} period`, sp1(worst), `${K.fmtDay(K.parse(wStart))} – ${K.fmtDay(K.parse(wEnd))}`),
      K.stat('Max drawdown', p1(dd.max), `trough ${K.fmtDay(K.parse(dd.troughDate))}`));
    const yrs = Math.round((m.B.n - m.i0) / 252);
    document.getElementById('lt-summary').textContent =
      `Trained on ${yrs} years of daily data (${K.fmtDay(K.parse(m.dates0[0]))} – ${K.fmtDay(K.parse(m.dates0[m.dates0.length - 1]))}). ` +
      `With ${eur(V)} held for ${st.h === 252 ? 'one year' : 'five years'}, the bootstrap puts the ${confLabel()} worst case at a loss of ${eur(P.boot.var * V)} and the average loss beyond it at ${eur(P.boot.es * V)}; ` +
      `for the DAX the same figures are ${p1(D.boot.var)} and ${p1(D.boot.es)} of the amount invested. ` +
      (P.boot.var > D.boot.var ? 'Over long horizons the portfolio is riskier than the index: its banking pillar has suffered far deeper crises than the broad market.' : 'Over this horizon the portfolio\'s tail is no worse than the index.');
  }

  const fanCache = {};
  function fanFor(m, s) {
    const key = `${st.train}|${st.h}|${s}`;
    if (!fanCache[key]) {
      const f = fanPaths(m.B.series[s].slice(m.i0), st.h, { step: st.h === 252 ? 5 : 21 });
      fanCache[key] = { xs: f.xs, paths: f.paths, q: window.FanChart.percentiles(f.paths, [0.01, 0.05, 0.10, 0.25, 0.5, 0.75, 0.90, 0.95, 0.99]) };
    }
    const F = fanCache[key];
    const tail = window.FanChart.percentiles(F.paths, [1 - st.alpha])[0];
    return { ...F, tail, es: window.FanChart.tailMean(F.paths, 1 - st.alpha) };
  }
  function drawFan(m) {
    const K = window.DashKit, V = st.value, s = st.fan, F = fanFor(m, s);
    const qs = [0.01, 0.05, 0.10, 0.25, 0.5, 0.75, 0.90, 0.95, 0.99], bands = Object.fromEntries(qs.map((q, i) => [q, F.q[i]]));
    const D = st.fanCmp && s !== 'DAX' ? fanFor(m, 'DAX') : null;
    const pick = []; for (let i = 0; i < 12; i++) pick.push(F.paths[Math.floor((i + 0.5) * F.paths.length / 12)]);
    const end = F.xs[F.xs.length - 1], last = (a) => a[a.length - 1];
    const nm = s === 'Portfolio' || s === 'DAX' ? s : s + ' ETF';
    document.getElementById('lt-fan-title').textContent = `Fan chart: ${eur(V)} in the ${nm} over ${st.h === 252 ? 'one year' : 'five years'}`;
    window.FanChart.draw(document.getElementById('lt-fan'), {
      xs: F.xs, bands, V, alpha: st.alpha, tail: F.tail, es: F.es, samples: pick,
      compare: D ? { name: 'DAX', median: D.q[4], tail: D.tail } : null,
      xFmt: (d, long) => (st.h === 252 ? (long ? `Month ${(d / 21).toFixed(1)} (day ${d})` : `${Math.round(d / 21)}m`) : (long ? `Year ${(d / 252).toFixed(2)} (day ${d})` : `${(d / 252).toFixed(0)}y`)),
      xTicks: st.h === 252 ? [0, 63, 126, 189, 252] : [0, 252, 504, 756, 1008, 1260],
      markers: [
        { x: end, g: last(bands[0.5]), label: `Median ${eur(last(bands[0.5]) * V)}`, color: K.cssVar('--fg') },
        { x: end, g: last(F.tail), label: `VaR ${confLabel()}: −${eur((1 - last(F.tail)) * V)}`, color: K.cssVar('--bad') },
        { x: end, g: F.es, label: `ES: −${eur((1 - F.es) * V)}`, color: K.cssVar('--hot') },
      ],
    });
    const lossVar = 1 - last(F.tail), lossEs = 1 - F.es, pLoss = F.paths.filter((p) => last(p) < 1).length / F.paths.length;
    const below = (thr) => F.paths.filter((p) => last(p) < thr).length / F.paths.length;
    document.getElementById('lt-fan-note').textContent =
      `Each band contains the stated share of the 10,000 simulated paths at every point in time; the paths are built from random 3-month blocks of the ${nm}'s actual daily returns (${st.train === '20y' ? 'last 20 years' : 'since 2001'}), so their end points are exactly the bootstrap distribution in the tables below. ` +
      `After ${st.h === 252 ? 'one year' : 'five years'} the median value is ${eur(last(bands[0.5]) * V)}; half the paths end between ${eur(last(bands[0.25]) * V)} and ${eur(last(bands[0.75]) * V)}. ` +
      `${d3.format('.0%')(pLoss)} of paths end below the starting ${eur(V)}, ${d3.format('.0%')(below(0.75))} lose more than a quarter and ${d3.format('.1%')(below(0.5))} lose more than half. ` +
      `The red dashed line is the ${confLabel()} VaR boundary: only ${d3.format('.1~%')(1 - st.alpha)} of paths are below it at each date; at the horizon it means a loss of ${d3.format('.1%')(lossVar)} (${eur(lossVar * V)}), and the average loss beyond it (ES) is ${d3.format('.1%')(lossEs)}.`;
  }

  function drawMethods(m) {
    const K = window.DashKit, V = st.value, P = m.est.Portfolio, D = m.est.DAX;
    const rows = [
      ['Historical (overlapping periods)', P.hist, D.hist],
      ['Block bootstrap (3-month blocks)', P.boot, D.boot],
      ['Lognormal (GBM)', P.logn, D.logn],
      ['Square-root-of-time (1-day × √h)', P.sqrt, D.sqrt],
      ['Stressed volatility (lognormal)', P.stress, D.stress],
    ];
    const cap = (o, v) => (o.capped && v >= 1 ? '100% (capped)' : p1(v));
    document.querySelector('#lt-method-table tbody').replaceChildren(...rows.map(([name, a, b]) => {
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      tr.append(td(name, 'l'), td(eur(a.var * V)), td(cap(a, a.var)), td(eur(a.es * V)), td(cap(a, a.es)), td(cap(b, b.var), 'muted'), td(cap(b, b.es), 'muted'));
      return tr;
    }));
    document.getElementById('lt-method-note').textContent =
      `Historical uses ${d3.format(',')(P.hist.n)} overlapping ${hLabel()} periods, but only about ${Math.round(P.hist.indep)} of them are independent. ` +
      `The stressed estimate uses the volatility of the most turbulent 12 months in the training data (${K.fmtDay(K.parse(P.stress.from))} – ${K.fmtDay(K.parse(P.stress.to))}, ${p0(P.stress.sigmaAnn)} annualised) with the long-run drift. ` +
      `Square-root-of-time ignores drift and compounding, so at long horizons it overstates losses and can exceed 100%.`;
  }

  function drawHist(m) {
    const K = window.DashKit, box = document.getElementById('lt-hist'), card = box.closest('.card');
    document.getElementById('lt-hist-title').textContent = `Distribution of ${hLabel()} returns`;
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const H = W < 520 ? 230 : 280, P = m.est.Portfolio, D = m.est.DAX;
    const all = P.ov.concat(D.ov), lo = Math.max(-1, d3.min(all)), hi = d3.quantile([...all].sort((a, b) => a - b), 0.995);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleLinear([lo, hi], [36, W - 8]);
    const thr = x.ticks(W < 520 ? 30 : 45);
    const binner = d3.bin().domain(x.domain()).thresholds(thr);
    const bP = binner(P.ov.filter((v) => v <= hi)), bD = binner(D.ov.filter((v) => v <= hi));
    const dens = (b, n) => b.length / n / (b.x1 - b.x0);
    const y = d3.scaleLinear([0, Math.max(d3.max(bP, (b) => dens(b, P.ov.length)), d3.max(bD, (b) => dens(b, D.ov.length))) * 1.08], [H - 24, 8]);
    for (const t of x.ticks(W < 520 ? 4 : 7)) svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.format('.0%')(t));
    svg.append('line').attr('x1', 36).attr('x2', W - 8).attr('y1', H - 24).attr('y2', H - 24).attr('stroke', 'var(--axis)');
    const v = P.hist.var, e = P.hist.es, tailC = K.cssVar('--hot'), bodyC = K.cssVar('--accent');
    svg.append('g').selectAll('rect').data(bP).join('rect')
      .attr('x', (b) => x(b.x0) + 0.5).attr('width', (b) => Math.max(0, x(b.x1) - x(b.x0) - 1)).attr('y', (b) => y(dens(b, P.ov.length))).attr('height', (b) => y(0) - y(dens(b, P.ov.length)))
      .attr('fill', (b) => (b.x1 <= -v + 1e-12 ? tailC : bodyC)).attr('opacity', (b) => (b.x1 <= -v + 1e-12 ? 0.9 : 0.55)).attr('rx', 1.5)
      .on('pointermove pointerdown', (ev, b) => K.showTip(card, ev, `${p0(b.x0)} to ${p0(b.x1)}`, [{ name: 'Share of periods', value: p1(b.length / P.ov.length) }]))
      .on('pointerleave', () => K.hideTip(card));
    const line = d3.line().curve(d3.curveStepAfter).x((b) => x(b.x0)).y((b) => y(dens(b, D.ov.length)));
    svg.append('path').datum(bD).attr('d', line).attr('fill', 'none').attr('stroke', 'var(--fg)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
    const anchorX = Math.max(x(-v), x(-e)) + 6;    // labels stacked to the right of both lines
    const mark = (val, label, color, dy) => {
      if (-val < lo) return;
      svg.append('line').attr('x1', x(-val)).attr('x2', x(-val)).attr('y1', 8).attr('y2', H - 24).attr('stroke', color).attr('stroke-width', 2);
      svg.append('text').attr('class', 'tick').attr('x', anchorX).attr('y', 18 + dy).style('fill', color).style('font-weight', 600).text(label);
    };
    mark(v, `VaR ${p1(v)}`, 'var(--fg)', 0);
    mark(e, `ES ${p1(e)}`, tailC, 15);
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 8).attr('y2', H - 24).attr('stroke', 'var(--axis)').attr('stroke-dasharray', '2 3');
    K.legendItems(box, [{ color: bodyC, label: `Portfolio ${hLabel()} returns` }, { color: tailC, label: `Tail beyond ${confLabel()} VaR (historical)` }, { color: K.cssVar('--fg'), label: 'DAX', dash: true }]);
  }

  function drawOutcomes(m) {
    const K = window.DashKit;
    document.querySelector('#lt-out-table tbody').replaceChildren(...m.names.map((s) => {
      const e = m.est[s], b = [...e.bs].sort((x, y) => x - y), pl = e.bs.filter((x) => x < 0).length / e.bs.length;
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      const nm = td('', 'l'); const dot = K.el('i', { className: 'dot' }); dot.style.cssText = `margin-right:8px;background:${colorOf(s)}`;
      nm.append(dot, s === 'Portfolio' ? K.el('b', { textContent: 'Portfolio' }) : document.createTextNode(s === 'DAX' ? 'DAX' : s + ' ETF'));
      const c = (v) => (v < 0 ? 'neg' : 'pos');
      tr.append(nm, ...[0.01, 0.05, 0.25, 0.5, 0.75, 0.95].map((q) => { const v = pctile(b, q); return td(sp1(v), c(v)); }), td(p0(pl)), td(p1(e.boot.var)), td(p1(e.boot.es)));
      return tr;
    }));
  }

  function drawRolling(m) {
    const K = window.DashKit, box = document.getElementById('lt-roll'), card = box.closest('.card');
    document.getElementById('lt-roll-title').textContent = `Rolling ${hLabel()} return`;
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const H = W < 520 ? 240 : 300, B = m.B, i0 = trainingIndex(B, 'all');     // always full history since 2001 for context
    const r = (s) => B.series[s].slice(i0), d0 = B.dates.slice(i0);
    const pts = (s) => overlapping(r(s), st.h).map((v, k) => ({ x: K.parse(d0[k + st.h - 1]), y: v }));
    const ser = [{ name: 'Portfolio', color: colorOf('Portfolio'), points: pts('Portfolio') }, { name: 'DAX', color: K.cssVar('--muted'), points: pts('DAX') }];
    const all = ser.flatMap((s) => s.points);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const y = d3.scaleLinear([Math.max(-1, d3.min(all, (p) => p.y)), d3.max(all, (p) => p.y)], [H - 24, 8]).nice();
    const left = d3.max(y.ticks(5), (t) => K.measure(svg, d3.format('.0%')(t))) + 10;
    const x = d3.scaleUtc([K.parse(B.dates[i0]), K.parse(B.dates[B.n - 1])], [left, W - 8]);
    for (const ep of EPISODES) {
      const s = episodeStats(B, ep);
      svg.append('rect').attr('x', x(K.parse(s.peak))).attr('width', Math.max(2, x(K.parse(s.trough)) - x(K.parse(s.peak)))).attr('y', 8).attr('height', H - 32).attr('fill', 'var(--bad)').attr('opacity', 0.08);
    }
    for (const t of y.ticks(5)) {
      svg.append('line').attr('x1', left).attr('x2', W - 8).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === 0 ? 'var(--axis)' : 'var(--grid)');
      svg.append('text').attr('class', 'tick').attr('x', left - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(d3.format('.0%')(t));
    }
    for (const t of x.ticks(W < 520 ? 4 : 10)) svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.utcFormat('%Y')(t));
    const line = d3.line().x((p) => x(p.x)).y((p) => y(p.y));
    for (const s of [...ser].reverse()) svg.append('path').datum(s.points).attr('d', line).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.name === 'Portfolio' ? 1.8 : 1.4).attr('stroke-linejoin', 'round');
    const times = ser[0].points.map((p) => +p.x);
    const rule = svg.append('line').attr('y1', 8).attr('y2', H - 24).attr('stroke', 'var(--axis)').attr('opacity', 0);
    svg.append('rect').attr('x', left).attr('width', W - left - 8).attr('height', H).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev) => {
        const tv = +x.invert(d3.pointer(ev)[0]); const i = Math.max(0, Math.min(times.length - 1, d3.bisectLeft(times, tv)));
        const xd = ser[0].points[i].x; rule.attr('x1', x(xd)).attr('x2', x(xd)).attr('opacity', 1);
        const start = new Date(+xd); start.setUTCFullYear(start.getUTCFullYear() - (st.h === 252 ? 1 : 5));
        K.showTip(card, ev, `Bought ~${d3.utcFormat('%b %Y')(start)}, held to ${K.fmtDay(xd)}`, ser.map((s) => ({ color: s.color, name: s.name, value: sp1(s.points[i].y) })));
      })
      .on('pointerleave', () => { rule.attr('opacity', 0); K.hideTip(card); });
    K.legendItems(box, [{ color: colorOf('Portfolio'), label: 'Portfolio' }, { color: K.cssVar('--muted'), label: 'DAX' }, { color: K.cssVar('--bad'), label: 'Crisis episodes' }]);
  }

  function drawDD(m) {
    const K = window.DashKit, B = m.B, i0 = trainingIndex(B, 'all'), d0 = B.dates.slice(i0);
    const names = st.dd === 'port' ? ['Portfolio', 'DAX'] : [...B.sectors, 'Portfolio'];
    const stats = Object.fromEntries([...B.sectors, 'Portfolio', 'DAX'].map((s) => [s, drawdownStats(B.series[s].slice(i0), d0)]));
    const step = 3;   // thin points for drawing speed
    K.lineChart(document.getElementById('lt-dd'), names.map((s) => ({ name: s === 'DAX' || s === 'Portfolio' ? s : s + ' ETF', color: colorOf(s),
      points: stats[s].dd.filter((_, t) => t % step === 0).map((v, k) => ({ x: K.parse(d0[k * step]), y: v })) })),
    { yFmt: d3.format('.0%'), yTip: d3.format('.1%'), yDomain: [-1, 0], height: 260, head: (d) => K.fmtDay(d) });
    const yrs = (dd) => (dd / 252).toFixed(1) + ' yrs';
    document.querySelector('#lt-dd-table tbody').replaceChildren(...[...B.sectors, 'Portfolio', 'DAX'].map((s) => {
      const x = stats[s], tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      const nm = td('', 'l'); const dot = K.el('i', { className: 'dot' }); dot.style.cssText = `margin-right:8px;background:${colorOf(s)}`;
      nm.append(dot, document.createTextNode(s === 'DAX' || s === 'Portfolio' ? s : s + ' ETF'));
      tr.append(nm, td(p1(x.max), 'neg'), td(K.fmtDay(K.parse(x.troughDate)), 'l'), td(yrs(x.longestDays)), td(x.ddNow > -0.005 ? 'at a new high' : `${p1(x.ddNow)} below peak`, 'l'));
      return tr;
    }));
  }

  function drawCorr(m) {
    const K = window.DashKit, B = m.B, secs = B.sectors, i0 = trainingIndex(B, 'all'), d0 = B.dates.slice(i0);
    const pairs = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => ({ a: secs[a], b: secs[b], rc: rollingCorr(B.series[secs[a]].slice(i0), B.series[secs[b]].slice(i0), 252) }));
    const pal = [K.cssVar('--banking'), K.cssVar('--hot'), K.cssVar('--oilenergy')];
    const series = pairs.map((p, k) => ({ name: `${p.a.split(' ')[0]} × ${p.b.split(' ')[0]}`, color: pal[k],
      points: p.rc.map((v, t) => (v == null || t % 3 ? null : { x: K.parse(d0[t]), y: v })).filter(Boolean) }));
    K.lineChart(document.getElementById('lt-corr'), series, { yFmt: d3.format('.1f'), yTip: d3.format('.2f'), yDomain: [-0.2, 1], refY: 0, height: 260, head: (d) => '1 year to ' + K.fmtDay(d) });
    document.getElementById('lt-corr-stats').replaceChildren(...pairs.map((p, k) => {
      const vals = p.rc.filter((v) => v != null).sort((a, b) => a - b), med = RC().quantile(vals, 0.5), now = p.rc[p.rc.length - 1];
      const rank = vals.filter((v) => v <= now).length / vals.length;
      const where = rank <= 0.005 ? 'lowest reading since 2001' : rank >= 0.995 ? 'highest reading since 2001' : `lower than ${p0(1 - rank)} of readings since 2001`;
      return K.stat(series[k].name, d3.format('.2f')(now), `today · long-run median ${d3.format('.2f')(med)} · ${where}`, pal[k]);
    }));
  }

  function drawPerf(m) {
    const K = window.DashKit, B = m.B, i0 = m.i0, d0 = m.dates0, dax = B.series.DAX.slice(i0);
    const years = [...new Set(d0.map((d) => d.slice(0, 4)))];
    const fullYears = years.filter((y) => d0[0].slice(0, 4) < y && y < d0[d0.length - 1].slice(0, 4));
    document.querySelector('#lt-perf-table tbody').replaceChildren(...[...B.sectors, 'Portfolio', 'DAX'].map((s) => {
      const r = B.series[s].slice(i0), n = r.length, g = r.reduce((a, x) => a * (1 + x), 1), cagr = g ** (252 / n) - 1, vol = std(r) * Math.sqrt(252);
      const rfD = 1.02 ** (1 / 252) - 1, sharpe = (mean(r) - rfD) * 252 / vol, mdd = drawdownStats(r, d0).max;
      const yr = fullYears.map((y) => { let gg = 1; d0.forEach((d, t) => { if (d.startsWith(y)) gg *= 1 + r[t]; }); return gg - 1; });
      const ma = mean(dax), mb = mean(r); let cov = 0, vd = 0; for (let t = 0; t < n; t++) { cov += (r[t] - mb) * (dax[t] - ma); vd += (dax[t] - ma) ** 2; }
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      const nm = td('', 'l'); const dot = K.el('i', { className: 'dot' }); dot.style.cssText = `margin-right:8px;background:${colorOf(s)}`;
      nm.append(dot, s === 'Portfolio' ? K.el('b', { textContent: 'Portfolio' }) : document.createTextNode(s === 'DAX' ? 'DAX' : s + ' ETF'));
      tr.append(nm, td(p1(cagr), cagr >= 0 ? 'pos' : 'neg'), td(p1(vol)), td(d3.format('.2f')(sharpe)), td(p1(mdd), 'neg'), td(p1(Math.min(...yr)), 'neg'), td(sp1(Math.max(...yr)), 'pos'),
        td(`${yr.filter((v) => v > 0).length} / ${yr.length}`), td(d3.format('.2f')(cov / vd)));
      return tr;
    }));
  }

  function drawYears(m) {
    const K = window.DashKit, B = m.B, d = B.dates;
    const years = [...new Set(d.slice(1).map((x) => x.slice(0, 4)))].filter((y) => y >= '2001');
    const cols = [...B.sectors, 'Portfolio', 'DAX'];
    const yr = (s, y) => { let g = 1; for (let t = 1; t < B.n; t++) if (d[t].startsWith(y)) g *= 1 + B.series[s][t]; return g - 1; };
    const okC = d3.color(K.cssVar('--ok')), badC = d3.color(K.cssVar('--bad'));
    const bg = (v) => { const c = (v >= 0 ? okC : badC).copy(); c.opacity = Math.min(0.55, Math.abs(v) * 0.9); return c.formatRgb(); };
    document.querySelector('#lt-year-table tbody').replaceChildren(...years.slice().reverse().map((y) => {
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      tr.appendChild(td(y + (y === d[B.n - 1].slice(0, 4) ? ' YTD' : ''), 'l'));
      const vals = cols.map((s) => yr(s, y));
      vals.forEach((v) => { const c = td(sp1(v)); c.style.background = bg(v); tr.appendChild(c); });
      const diff = vals[3] - vals[4]; tr.appendChild(td((diff > 0 ? '+' : '') + d3.format('.1f')(diff * 100) + ' pts', diff >= 0 ? 'pos' : 'neg'));
      return tr;
    }));
  }

  window.LTRiskTab = { draw, state: st, compute };
})();
