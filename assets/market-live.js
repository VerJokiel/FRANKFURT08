/* European market pages, live layer. A generalised copy of assets/dax-live.js.
   Every 30 seconds the page asks GitHub for <id>.json on the `live-markets` branch, which
   .github/workflows/live-markets.yml rewrites every 5 minutes during trading hours with 5-minute
   bars (Yahoo Finance, exchange quotes delayed about 15 minutes). On each new bar it:
     - adds today's prices to the daily views (MarketDaily.applyLive),
     - redraws the intraday chart (Chart.js, two axes),
     - recomputes the correlation matrix of the largest members (MARKET.corr_n by index weight)
       and redraws it three ways: Chart.js heatmap, D3 force-directed network, Cytoscape.js sector clusters.
   Libraries: d3 v7, Chart.js 4 + chartjs-chart-matrix, Cytoscape.js 3. */
(() => {
  const DD = window.MarketDaily;
  if (!DD) return;
  const CFG = window.MARKET, IDX = CFG.name, TZ = CFG.tz, LOCAL = CFG.city + ' time';
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const cssVar = (n) => getComputedStyle(document.querySelector('.page') || document.documentElement).getPropertyValue(n).trim();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- where the live file lives ---------- */
  const OWNER_REPO = (() => {
    const h = location.hostname;
    if (h.endsWith('.github.io')) {
      const owner = h.split('.')[0], repo = location.pathname.split('/').filter(Boolean)[0];
      if (repo && !repo.endsWith('.html')) return `${owner}/${repo}`;
    }
    return 'VerJokiel/FRANKFURT08';
  })();
  const API_URL = `https://api.github.com/repos/${OWNER_REPO}/contents/${CFG.id}.json?ref=live-markets`;
  const RAW_URL = `https://raw.githubusercontent.com/${OWNER_REPO}/live-markets/${CFG.id}.json`;
  const POLL_MS = 30000;

  /* ---------- formatting ---------- */
  const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const clock = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const clockS = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ });
  const dayLabel = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const pts = d3.format(',.0f');
  const signed = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%';

  /* ---------- state ---------- */
  let L = null, lastGenerated = null, windowKey = null, userPicked = false;
  let netMode = 'mst', thr = 0.3, cyCut = 'top12';
  let C = null;
  const ALLM = DD.members;
  /* correlation views use the largest members only: readable matrix, network and clusters */
  const MEM = ALLM.slice().sort((a, b) => b.weight - a.weight).slice(0, CFG.corr_n);
  const CORR_SECTORS = DD.sectors.filter((s) => MEM.some((m) => m.sector === s));
  const wShare = MEM.reduce((a, m) => a + m.weight, 0);
  const ORDER = MEM.map((m, j) => j).sort((a, b) => DD.sectors.indexOf(MEM[a].sector) - DD.sectors.indexOf(MEM[b].sector) || MEM[b].weight - MEM[a].weight);
  const dailyIdx = MEM.map((m) => ALLM.indexOf(m));

  /* ---------- live file → derived series ---------- */
  function prepare(raw) {
    const times = raw.times.map((t) => new Date(t * 1000));
    const day = times.map((d) => localDay.format(d));
    const ff = {};
    for (const s of raw.symbols) {
      const a = raw.close[s], out = new Array(a.length);
      let prev = null;
      for (let i = 0; i < a.length; i++) { if (i && day[i] !== day[i - 1]) prev = null; out[i] = a[i] ?? prev; prev = out[i]; }
      ff[s] = out;
    }
    const lastIdx = (() => { for (let i = times.length - 1; i >= 0; i--) if (raw.close.INDEX[i] != null) return i; return times.length - 1; })();
    const sessionIdx = times.map((_, i) => i).filter((i) => day[i] === raw.session);
    const last = {};
    for (const s of raw.symbols) { for (let i = lastIdx; i >= 0 && day[i] === raw.session; i--) if (raw.close[s][i] != null) { last[s] = raw.close[s][i]; break; } }
    return { ...raw, times, day, ff, lastIdx, sessionIdx, last, lastTime: raw.times[lastIdx] };
  }

  /* ---------- correlation engine ---------- */
  const WINDOWS = {
    today5: { note: 'returns between 5-minute bars in today\'s session' },
    week5: { note: 'returns between 5-minute bars over the last five sessions (overnight gaps left out)' },
    week30: { note: 'returns between 30-minute bars over the last five sessions; slower bars reduce the downward bias of very short returns' },
    d63: { note: 'daily returns over the last 63 sessions' },
    d252: { note: 'daily returns over the last 252 sessions' },
  };
  function intradayReturns(step, onlyToday) {
    const idx = [];
    for (let i = 0; i < L.times.length; i++) {
      if (onlyToday && L.day[i] !== L.session) continue;
      if (step > 1 && new Date(L.times[i]).getUTCMinutes() % (5 * step) !== 0) continue;
      idx.push(i);
    }
    const cols = MEM.map((m) => L.ff[m.tk] || null);
    const out = MEM.map(() => []);
    for (let k = 1; k < idx.length; k++) {
      const a = idx[k - 1], b = idx[k];
      if (L.day[a] !== L.day[b]) continue;
      for (let j = 0; j < MEM.length; j++) { const s = cols[j]; out[j].push(s && s[a] && s[b] ? Math.log(s[b] / s[a]) : 0); }
    }
    return out;
  }
  function dailyReturns(n) { const lr = DD.model.lr; return dailyIdx.map((j) => lr[j].slice(Math.max(1, lr[j].length - n))); }
  function correlation(key) {
    let R;
    if (key === 'today5') R = intradayReturns(1, true);
    else if (key === 'week5') R = intradayReturns(1, false);
    else if (key === 'week30') R = intradayReturns(6, false);
    else R = dailyReturns(key === 'd63' ? 63 : 252);
    const n = R[0].length;
    const ok = R.map((a) => a.length > 2 && a.every((v) => v != null) && a.some((v) => v !== 0));
    const z = R.map((a, j) => { if (!ok[j]) return null; const m = d3.mean(a), s = d3.deviation(a) || 1e-12; return a.map((v) => (v - m) / s); });
    const P = MEM.map(() => new Array(MEM.length).fill(null));
    for (let i = 0; i < MEM.length; i++) {
      if (!z[i]) continue; P[i][i] = 1;
      for (let j = i + 1; j < MEM.length; j++) {
        if (!z[j]) continue;
        let s = 0; const a = z[i], b = z[j]; for (let k = 0; k < n; k++) s += a[k] * b[k];
        P[i][j] = P[j][i] = s / (n - 1);
      }
    }
    const pairs = [];
    for (let i = 0; i < MEM.length; i++) for (let j = i + 1; j < MEM.length; j++) if (P[i][j] != null) pairs.push([i, j, P[i][j]]);
    return { key, P, n, ok, pairs, avg: d3.mean(pairs, (p) => p[2]) };
  }

  /* ---------- status ---------- */
  function setStatus(kind, text) {
    const pill = $('dx-live-pill');
    pill.className = 'dx-pill ' + kind;
    pill.textContent = { live: 'Live', closed: 'Market closed', waiting: 'Waiting for data', error: 'Live feed unavailable' }[kind];
    $('dx-live-text').textContent = text;
  }
  const S = window.MarketSchedule;
  const CRON_MIN = 5, LATE_MIN = 12;
  let lastChecked = null;
  function describeStatus(checkedAt) {
    if (checkedAt) lastChecked = checkedAt;
    if (!L) return;
    const now = new Date();
    const lastBar = new Date(L.lastTime * 1000), published = new Date(L.generated);
    const sessionOn = S.sessionOpen(now);
    const tail = !sessionOn && L.session === localDay.format(now) && (now - lastBar) / 60000 < 45 && L.market_open;
    let kind, next;
    const due = new Date(+published + CRON_MIN * 60000), late = (now - due) / 60000 > LATE_MIN - CRON_MIN;
    if (sessionOn || tail) {
      kind = 'live';
      next = late
        ? 'Next update is running late: GitHub sometimes starts scheduled jobs a few minutes behind. This page checks every 30 seconds and refreshes by itself.'
        : `Next update expected around ${clock(due)} (${S.inTime(due, now)}); this page refreshes by itself.`;
    } else {
      kind = 'closed';
      const open = S.nextOpen(now), firstBars = open ? new Date(+open + 20 * 60000) : null;
      next = firstBars ? `Next live update ${S.when(firstBars, now)} ${LOCAL} (${S.inTime(firstBars, now)}), when the first bars after the ${CFG.open} open arrive.` : '';
    }
    const shortNext = kind === 'live'
      ? (late ? 'next update overdue, checking every 30 s' : `next ≈ ${clock(due)} (${S.inTime(due, now)})`)
      : (() => { const o = S.nextOpen(now); return o ? `session closed, next bars ${S.when(new Date(+o + 20 * 60000), now)}` : 'session closed'; })();
    DD.stamp({ lastBar, active: kind === 'live', next: shortNext, nextShort: shortNext,
      sessionLabel: L.session === localDay.format(now) ? '' : dayLabel(L.session), corrIntraday: !!windowKey && !windowKey.startsWith('d') });
    setStatus(kind, kind === 'live'
      ? `Latest 5-minute bar ${clock(lastBar)} ${LOCAL} (source delay about 15 min), published ${clock(published)}.`
      : `Showing the session of ${dayLabel(L.session)}, last bar ${clock(lastBar)} ${LOCAL}.`);
    $('dx-next-live').textContent = next + (lastChecked ? ` Last checked ${clockS(lastChecked)}.` : '');
  }
  const LOG = [];
  function logUpdate(first) {
    LOG.unshift({ at: new Date(), bar: new Date(L.lastTime * 1000), published: new Date(L.generated), first });
    LOG.splice(8);
    $('dx-log-count').textContent = String(LOG.length);
    $('dx-log').replaceChildren(...LOG.map((e) => el('li', { textContent:
      `${clockS(e.at)} · ${e.first ? 'loaded' : 'new data'}: 5-minute bar ${clock(e.bar)}, published ${clock(e.published)}` })));
  }
  setInterval(() => { if (!document.hidden) describeStatus(null); }, 15000);

  /* ---------- polling ---------- */
  let timer = null, useRaw = false;
  async function poll() {
    const checkedAt = new Date();
    try {
      const res = useRaw
        ? await fetch(RAW_URL + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
        : await fetch(API_URL, { cache: 'no-cache', headers: { Accept: 'application/vnd.github.raw+json' } });
      if (res.status === 404) { if (!L) setStatus('waiting', 'The live feed has not been published yet. Daily data is shown.'); return; }
      if (res.status === 403 || res.status === 429) { useRaw = true; return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();
      if (raw.prev_date > DD.asof) checkDaily(true);
      if (raw.generated !== lastGenerated) {
        const first = lastGenerated === null;
        lastGenerated = raw.generated;
        L = prepare(raw);
        onLive();
        logUpdate(first);
      }
      describeStatus(checkedAt);
    } catch (e) {
      if (!useRaw) { useRaw = true; return; }
      if (!L) setStatus('error', 'Could not reach the live feed. Daily data is shown; the page keeps trying every 30 seconds.');
    }
  }
  function schedule() { clearInterval(timer); timer = setInterval(() => { if (!document.hidden) poll(); }, POLL_MS); }

  let lastDailyCheck = 0;
  async function checkDaily(force) {
    if (!force && Date.now() - lastDailyCheck < 15 * 60000) return;
    lastDailyCheck = Date.now();
    try {
      const res = await fetch(`data/markets/${CFG.id}.js?t=` + Math.floor(Date.now() / 60000), { cache: 'no-store' });
      if (!res.ok) return;
      const head = (await res.text()).slice(0, 400);
      const asof = (head.match(/"asof":"(\d{4}-\d{2}-\d{2})"/) || [])[1];
      const built = (head.match(/"built":"([^"]+)"/) || [])[1];
      if ((asof && asof > DD.asof) || (built && built > DD.built)) location.reload();
    } catch (e) { /* offline: try again later */ }
  }
  setInterval(() => { if (!document.hidden) checkDaily(false); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  /* ---------- on new data ---------- */
  function onLive() {
    const spliced = DD.applyLive({ session: L.session, prev_date: L.prev_date, lastTime: L.lastTime, last: L.last, prev_close: L.prev_close });
    $('dx-intraday-card').hidden = false;
    drawIntraday();
    if (!userPicked || (windowKey === 'today5' && !enoughToday())) windowKey = 'week5';
    document.querySelectorAll('#dx-cwin button').forEach((b) => { b.disabled = b.dataset.w.startsWith('today') && !enoughToday(); b.setAttribute('aria-pressed', String(b.dataset.w === windowKey)); });
    refreshCorrelation(true);
    if (!spliced && L.session > DD.asof) $('dx-live-note').textContent = 'Daily figures will catch up after the evening update.';
  }
  const enoughToday = () => L && L.sessionIdx.length >= 13;

  /* ---------- Chart.js: today's session on two axes ---------- */
  let intraChart = null;
  function drawIntraday() {
    const idx = L.sessionIdx;
    const labels = idx.map((i) => clock(L.times[i]));
    const series = idx.map((i) => L.close.INDEX[i]);
    const prev = L.prev_close.INDEX;
    const breadth = idx.map((i) => {
      let up = 0, n = 0;
      for (const m of ALLM) { const s = L.ff[m.tk], p = L.prev_close[m.tk]; if (!s || s[i] == null || !p) continue; n++; if (s[i] > p) up++; }
      return n ? (up / n) * 100 : null;
    });
    const gold = cssVar('--accent'), muted = cssVar('--muted'), ok = cssVar('--ok'), grid = 'rgba(243,239,230,.09)';
    $('dx-intraday-title').textContent = `Session of ${dayLabel(L.session)}`;
    const lastV = series.filter((v) => v != null).at(-1);
    $('dx-intraday-sub').textContent = lastV ? `${IDX} ${pts(lastV)} at ${clock(new Date(L.lastTime * 1000))} ${LOCAL}, ${signed(lastV / prev - 1)} against the previous close of ${pts(prev)}.` : '';
    const data = {
      labels,
      datasets: [
        { label: IDX, data: series, yAxisID: 'y', borderColor: gold, backgroundColor: gold, borderWidth: 2, pointRadius: 0, tension: 0.15, spanGaps: true },
        { label: 'Previous close', data: labels.map(() => prev), yAxisID: 'y', borderColor: muted, borderDash: [4, 4], borderWidth: 1, pointRadius: 0 },
        { label: 'Members above previous close (rhs)', data: breadth, yAxisID: 'y1', borderColor: ok, backgroundColor: 'rgba(147,211,162,.12)', fill: 'origin', borderWidth: 1.2, pointRadius: 0, stepped: true },
      ],
    };
    if (intraChart) { intraChart.data = data; intraChart.update(reduced ? 'none' : undefined); return; }
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = muted;
    intraChart = new Chart($('dx-intraday'), {
      type: 'line', data,
      options: {
        maintainAspectRatio: false, animation: reduced ? false : { duration: 400 }, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { boxWidth: 12, color: muted } },
          tooltip: { callbacks: { label: (c) => c.datasetIndex === 2 ? ` ${c.dataset.label.replace(' (rhs)', '')}: ${Math.round(c.parsed.y)}%` : ` ${c.dataset.label}: ${pts(c.parsed.y)}` } },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 9, color: muted }, grid: { color: grid } },
          y: { position: 'left', ticks: { color: muted, callback: (v) => pts(v) }, grid: { color: grid }, title: { display: true, text: `${IDX} points`, color: muted } },
          y1: { position: 'right', min: 0, max: 100, ticks: { color: muted, callback: (v) => v + '%' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Members up on the day', color: muted } },
        },
      },
    });
  }

  /* ---------- correlation views ---------- */
  function refreshCorrelation(fromNewData) {
    if (windowKey === null) windowKey = 'd63';
    C = correlation(windowKey);
    const stampTxt = L && !windowKey.startsWith('d') ? ` Last bar ${clock(new Date(L.lastTime * 1000))}.` : '';
    $('dx-corr-note').textContent = `Pearson correlation of ${WINDOWS[windowKey].note}: ${C.n} returns per stock, for the ${MEM.length} largest members (${(wShare * 100).toFixed(0)}% of the index by weight).${stampTxt}`;
    summary();
    drawMatrix(); drawNet(); updateCy();
    if (fromNewData && !reduced) document.querySelectorAll('#page-mkt .card[data-feed]:not([data-feed="ecb"])').forEach((n) => { n.classList.remove('dx-flash'); void n.offsetWidth; n.classList.add('dx-flash'); });
    if (!fromNewData) describeStatus(null);
  }
  const f2 = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
  function summary() {
    if (!C.pairs.length) { $('dx-corr-sum').textContent = ''; return; }
    const top = C.pairs.reduce((a, b) => (b[2] > a[2] ? b : a));
    const avgOf = (i) => d3.mean(MEM.map((_, j) => (j !== i ? C.P[i][j] : null)).filter((v) => v != null));
    const loners = MEM.map((m, i) => ({ m, v: C.ok[i] ? avgOf(i) : null })).filter((d) => d.v != null).sort((a, b) => a.v - b.v);
    $('dx-corr-sum').replaceChildren(
      document.createTextNode('Average correlation '), el('b', { textContent: f2(C.avg) }),
      document.createTextNode('. Closest pair '), el('b', { textContent: `${MEM[top[0]].tk}–${MEM[top[1]].tk} ${f2(top[2])}` }),
      document.createTextNode('. Most independent '), el('b', { textContent: `${loners[0].m.tk} (${f2(loners[0].v)})` }),
      document.createTextNode(` and ${loners[1].m.tk} (${f2(loners[1].v)}).`));
  }

  /* Chart.js matrix heatmap */
  let matChart = null;
  const CORR_STOPS = [[-0.3, '#1a9850'], [0, '#66bd63'], [0.3, '#fee08b'], [0.55, '#f46d43'], [0.8, '#d73027']];
  const corrColor = d3.scaleLinear(CORR_STOPS.map((d) => d[0]), CORR_STOPS.map((d) => d[1])).interpolate(d3.interpolateRgb).clamp(true);
  const cellColor = (v) => (v == null ? 'rgba(243,239,230,.04)' : v >= 0.999 ? '#2a3d5e' : corrColor(v));
  function drawMatrix() {
    const labels = ORDER.map((j) => MEM[j].tk);
    const data = [];
    for (const i of ORDER) for (const j of ORDER) data.push({ x: MEM[j].tk, y: MEM[i].tk, v: C.P[i][j] });
    if (matChart) { matChart.data.datasets[0].data = data; matChart.update('none'); return; }
    const tickColor = (c) => DD.secColor(MEM[ORDER[c.index]].sector);
    matChart = new Chart($('dx-matrix'), {
      type: 'matrix',
      data: { datasets: [{ data, backgroundColor: (c) => cellColor(c.raw && c.raw.v), borderWidth: 0,
        width: ({ chart }) => ((chart.chartArea || {}).width || 0) / labels.length - 0.8,
        height: ({ chart }) => ((chart.chartArea || {}).height || 0) / labels.length - 0.8 }] },
      options: {
        maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: (it) => { const r = it[0].raw; const a = MEM.find((m) => m.tk === r.y), b = MEM.find((m) => m.tk === r.x); return `${a.name} × ${b.name}`; },
          label: (it) => (it.raw.v == null ? ' no data' : ` ρ = ${it.raw.v.toFixed(2)}`) } } },
        scales: {
          x: { type: 'category', labels, offset: true, position: 'top', grid: { display: false }, ticks: { autoSkip: false, maxRotation: 90, minRotation: 90, font: { size: 10 }, color: tickColor } },
          y: { type: 'category', labels, offset: true, reverse: true, grid: { display: false }, ticks: { autoSkip: false, font: { size: 10 }, color: tickColor } },
        },
      },
    });
    const lo = CORR_STOPS[0][0], hi = CORR_STOPS[CORR_STOPS.length - 1][0];
    $('dx-matrix-scale').replaceChildren(el('span', { textContent: 'independent ≤ −0.3' }),
      Object.assign(el('span', { className: 'ramp' }), { style: `background:linear-gradient(90deg,${CORR_STOPS.map(([v, c]) => `${c} ${((v - lo) / (hi - lo) * 100).toFixed(0)}%`).join(',')})` }),
      el('span', { textContent: '0.8+ together' }), el('span', { textContent: ' · axis labels coloured by sector' }));
  }

  /* D3 force-directed network */
  const VW = 640, VH = 480;
  let sim = null, gL, gN, nodes, links = [];
  const nr = (d) => 7 + 28 * Math.sqrt(MEM[d.i].weight / wShare);
  function mst() {
    const E = C.pairs.map(([i, j, r]) => [Math.sqrt(2 * (1 - r)), i, j]).sort((a, b) => a[0] - b[0]);
    const par = MEM.map((_, i) => i), f = (x) => (par[x] === x ? x : (par[x] = f(par[x])));
    const out = [];
    for (const [, i, j] of E) { const a = f(i), b = f(j); if (a !== b) { par[a] = b; out.push([i, j]); } }
    return out;
  }
  function drawNet() {
    const pairs = netMode === 'mst' ? mst() : C.pairs.filter((p) => p[2] >= thr).map(([i, j]) => [i, j]);
    const next = pairs.map(([i, j]) => ({ key: MEM[i].tk + '|' + MEM[j].tk, source: MEM[i].tk, target: MEM[j].tk, r: C.P[i][j] }));
    const svg = d3.select('#dx-net svg');
    if (!sim) {
      const ns = Math.max(1, CORR_SECTORS.length);
      nodes = MEM.map((m, i) => ({ id: m.tk, i, x: VW / 2 + Math.cos(CORR_SECTORS.indexOf(m.sector) / ns * 6.28) * 160 + (i % 5) * 6, y: VH / 2 + Math.sin(CORR_SECTORS.indexOf(m.sector) / ns * 6.28) * 140 + (i % 7) * 5 }));
      gL = svg.append('g'); gN = svg.append('g');
      sim = d3.forceSimulation(nodes).force('charge', d3.forceManyBody().strength(-260)).force('link', d3.forceLink().id((d) => d.id))
        .force('x', d3.forceX(VW / 2).strength(0.04)).force('y', d3.forceY(VH / 2).strength(0.06)).force('col', d3.forceCollide((d) => nr(d) + 4))
        .on('tick', ticked);
      const g = gN.selectAll('g').data(nodes, (d) => d.id).join((enter) => { const e = enter.append('g').attr('tabindex', 0).style('cursor', 'grab'); e.append('circle'); e.append('text'); return e; });
      g.select('circle').attr('r', nr).attr('fill', (d) => DD.secColor(MEM[d.i].sector)).attr('stroke', '#13233f').attr('stroke-width', 1.2);
      g.select('text').text((d) => d.id).attr('text-anchor', 'middle').attr('dy', (d) => (nr(d) > 13 ? 3 : -(nr(d) + 3)))
        .style('fill', (d) => (nr(d) > 13 ? '#13233f' : '#f3efe6')).style('font-size', '10px').style('font-weight', 600).style('pointer-events', 'none');
      g.call(d3.drag().on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; }).on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
      g.on('pointerenter focus', (e, d) => netTip(d)).on('pointerleave blur', netUntip);
    }
    const changed = next.map((l) => l.key).join() !== links.map((l) => l.key).join();
    links = next;
    sim.force('link').links(links).distance((l) => 45 + 170 * (1 - l.r)).strength((l) => (netMode === 'mst' ? 0.8 : Math.max(0.05, l.r * 0.6)));
    gL.selectAll('line').data(links, (d) => d.key).join('line').attr('stroke', (d) => corrColor(d.r))
      .attr('stroke-width', (d) => 0.8 + 3 * Math.max(0, d.r)).attr('stroke-opacity', (d) => 0.45 + 0.5 * Math.max(0, d.r));
    if (reduced) { sim.stop(); for (let k = 0; k < 200; k++) sim.tick(); ticked(); }
    else if (changed) sim.alpha(links.length && gL.attr('data-ready') ? 0.3 : 0.9).restart();
    gL.attr('data-ready', 1);
  }
  function ticked() {
    for (const d of nodes) { const r = nr(d) + 2; d.x = Math.max(r, Math.min(VW - r, d.x)); d.y = Math.max(r, Math.min(VH - r, d.y)); }
    gL.selectAll('line').attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    gN.selectAll('g').attr('transform', (d) => `translate(${d.x},${d.y})`);
  }
  function netTip(d) {
    const i = d.i, m = MEM[i];
    const peers = C.P[i].map((v, j) => ({ j, v })).filter((x) => x.j !== i && x.v != null).sort((a, b) => b.v - a.v).slice(0, 3);
    const deg = links.filter((l) => l.source.id === d.id || l.target.id === d.id).length;
    const t = $('dx-net-tip');
    t.replaceChildren(el('div', { className: 'h', textContent: `${m.name} · ${m.sector}` }),
      el('div', { textContent: `${deg} links · weight ${(m.weight * 100).toFixed(1)}%` }),
      el('div', { textContent: 'Closest: ' + peers.map((p) => `${MEM[p.j].tk} ${p.v.toFixed(2)}`).join(', ') }));
    t.hidden = false;
    const box = $('dx-net').getBoundingClientRect(), sc = box.width / VW;
    let x = d.x * sc + 12; if (x > box.width - 220) x = d.x * sc - 230;
    t.style.left = x + 'px'; t.style.top = d.y * sc + 12 + 'px';
    const near = new Set([d.id, ...links.filter((l) => l.source === d || l.target === d).flatMap((l) => [l.source.id, l.target.id])]);
    gN.selectAll('g').attr('opacity', (n) => (near.has(n.id) ? 1 : 0.25));
    gL.selectAll('line').attr('opacity', (l) => (l.source === d || l.target === d ? 1 : 0.15));
  }
  function netUntip() { $('dx-net-tip').hidden = true; gN.selectAll('g').attr('opacity', 1); gL.selectAll('line').attr('opacity', 1); }

  /* Cytoscape.js sector clusters */
  let cy = null; const expanded = new Set(); const posMem = {};
  const sectorMembers = (s) => MEM.map((m, i) => (m.sector === s ? i : -1)).filter((i) => i >= 0);
  function units() {
    const out = [];
    DD.sectors.forEach((s, k) => {
      const mem = sectorMembers(s); if (!mem.length) return;
      if (expanded.has(k)) mem.forEach((i) => out.push({ id: MEM[i].tk, mem: [i], k }));
      else out.push({ id: 'C' + k, mem, k });
    });
    return out;
  }
  function avgP(a, b) { let s = 0, n = 0; for (const i of a) for (const j of b) if (i !== j && C.P[i][j] != null) { s += C.P[i][j]; n++; } return n ? s / n : null; }
  function cyEdges(us) {
    const all = [];
    for (let a = 0; a < us.length; a++) for (let b = a + 1; b < us.length; b++) { const w = avgP(us[a].mem, us[b].mem); if (w != null) all.push([a, b, w]); }
    const cut = cyCut === 'top12' ? (all.map((e) => e[2]).sort((x, y) => y - x)[11] ?? -1) : +cyCut;
    const ws = all.map((e) => e[2]), lo = Math.min(cut, d3.max(ws) ?? 0), span = Math.max(0.05, (d3.max(ws) ?? 1) - lo);
    return all.filter((e) => e[2] >= cut).map(([a, b, w]) => ({ group: 'edges', data: {
      id: 'e:' + us[a].id + '|' + us[b].id, source: us[a].id, target: us[b].id, w, lbl: w.toFixed(2),
      wd: 1 + 6 * (w - lo) / span, op: Math.min(0.95, 0.5 + 0.45 * (w - lo) / span), col: corrColor(w) } }));
  }
  function clusterLabel(s, mem) { const ic = mem.length > 1 ? avgP(mem, mem) : null; const w = d3.sum(mem, (i) => MEM[i].weight); return `${s}\n${mem.length} · ρ̄ ${ic == null ? '–' : ic.toFixed(2)} · ${(w * 100).toFixed(0)}%`; }
  function rebuildCy() {
    if (!cy) {
      cy = cytoscape({
        container: $('dx-cy'), minZoom: 0.3, maxZoom: 3, boxSelectionEnabled: false,
        style: [
          { selector: "node[type='cluster']", style: { 'background-color': 'data(color)', label: 'data(label)', color: '#f3efe6', 'font-size': 10, 'text-wrap': 'wrap', 'text-valign': 'bottom', 'text-margin-y': 5, width: 'data(sz)', height: 'data(sz)', 'border-width': 2, 'border-color': '#13233f', 'text-background-color': '#13233f', 'text-background-opacity': 0.75, 'text-background-padding': 2, 'text-background-shape': 'roundrectangle', 'z-index': 10 } },
          { selector: "node[type='parent']", style: { 'background-color': 'data(color)', 'background-opacity': 0.08, 'border-color': 'data(color)', 'border-width': 1.5, 'border-style': 'dashed', label: 'data(label)', color: '#b3bccb', 'font-size': 10, 'text-valign': 'top', 'text-halign': 'center', padding: 12, shape: 'round-rectangle' } },
          { selector: "node[type='stock']", style: { 'background-color': 'data(color)', label: 'data(id)', color: '#f3efe6', 'font-size': 9, width: 'data(sz)', height: 'data(sz)', 'text-valign': 'bottom', 'text-margin-y': 2 } },
          { selector: 'edge', style: { width: 'data(wd)', 'line-color': 'data(col)', opacity: 'data(op)', 'curve-style': 'bezier', label: 'data(lbl)', 'font-size': 9, 'font-weight': 600, color: '#f3efe6', 'text-background-color': '#13233f', 'text-background-opacity': 0.9, 'text-background-padding': 2, 'text-background-shape': 'roundrectangle' } },
        ],
      });
      cy.on('tap', (e) => {
        const n = e.target; if (n === cy || !n.isNode || !n.isNode()) return;
        const t = n.data('type'), k = n.data('k');
        if (t === 'cluster') { expanded.add(k); rebuildCy(); } else if (t === 'parent') { expanded.delete(k); rebuildCy(); } else if (t === 'stock') stockInfo(n.data('i'));
      });
    }
    cy.nodes().forEach((n) => { posMem[n.id()] = { ...n.position() }; });
    const us = units(), els = [];
    DD.sectors.forEach((s, k) => {
      const mem = sectorMembers(s); if (!mem.length) return;
      const color = DD.secColor(s);
      if (expanded.has(k)) els.push({ group: 'nodes', data: { id: 'P' + k, type: 'parent', k, color, label: s } });
      else { const p = posMem['C' + k] || posMem['P' + k]; const node = { group: 'nodes', data: { id: 'C' + k, type: 'cluster', k, color, sz: 22 + 90 * Math.sqrt(d3.sum(mem, (i) => MEM[i].weight) / wShare), label: clusterLabel(s, mem) } }; if (p) node.position = { ...p }; els.push(node); }
    });
    us.filter((u) => u.mem.length === 1 && expanded.has(u.k)).forEach((u) => {
      const i = u.mem[0], base = posMem['C' + u.k] || posMem['P' + u.k] || { x: 0, y: 0 };
      els.push({ group: 'nodes', data: { id: u.id, parent: 'P' + u.k, type: 'stock', k: u.k, i, color: DD.secColor(MEM[i].sector), sz: 10 + 60 * Math.sqrt(MEM[i].weight / wShare) },
        position: posMem[u.id] || { x: base.x + ((i * 37) % 80) - 40, y: base.y + ((i * 53) % 80) - 40 } });
    });
    cy.elements().remove(); cy.add(els.concat(cyEdges(us)));
    const fresh = Object.keys(posMem).length === 0;
    if (!expanded.size) {
      cy.layout({ name: 'circle', animate: !reduced && !fresh, animationDuration: 450, padding: 46, avoidOverlap: true, startAngle: -Math.PI / 2,
        sort: (a, b) => (b.data('sz') || 0) - (a.data('sz') || 0) }).run();
    } else {
      cy.layout({ name: 'cose', animate: !reduced && !fresh, animationDuration: 450, randomize: fresh, nodeRepulsion: () => 60000, nodeOverlap: 20,
        idealEdgeLength: (e) => 110 + 160 * (1 - Math.max(0, e.data('w'))), edgeElasticity: (e) => 40 + 120 * Math.max(0, e.data('w')),
        nestingFactor: 0.8, gravity: 0.6, componentSpacing: 80, numIter: 1500, fit: true, padding: 30 }).run();
    }
  }
  function updateCy() {
    if (!cy) { rebuildCy(); return; }
    const want = cyEdges(units()), ids = new Set(want.map((e) => e.data.id));
    cy.batch(() => {
      cy.edges().forEach((e) => { if (!ids.has(e.id())) e.remove(); });
      for (const e of want) { const ex = cy.getElementById(e.data.id); if (ex.nonempty()) ex.data(e.data); else cy.add(e); }
      DD.sectors.forEach((s, k) => { const n = cy.getElementById('C' + k); if (n.nonempty()) n.data('label', clusterLabel(s, sectorMembers(s))); });
    });
  }
  function stockInfo(i) {
    const m = MEM[i], same = sectorMembers(m.sector).filter((j) => j !== i), other = MEM.map((_, j) => j).filter((j) => MEM[j].sector !== m.sector);
    const a = same.length ? avgP([i], same) : null, b = avgP([i], other);
    $('dx-cy-info').replaceChildren(el('b', { textContent: m.name }),
      document.createTextNode(` · average ρ to its own sector ${a == null ? '– (only member shown)' : a.toFixed(2)}, to the other largest members ${b == null ? '–' : b.toFixed(2)}`));
  }

  /* ---------- controls ---------- */
  document.querySelectorAll('#dx-cwin button').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    windowKey = b.dataset.w; userPicked = true;
    document.querySelectorAll('#dx-cwin button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    refreshCorrelation(false);
  }));
  const segNet = (mode) => { netMode = mode; $('dx-mst').setAttribute('aria-pressed', String(mode === 'mst')); $('dx-thr-btn').setAttribute('aria-pressed', String(mode !== 'mst')); drawNet(); };
  $('dx-mst').addEventListener('click', () => segNet('mst'));
  $('dx-thr-btn').addEventListener('click', () => segNet('thr'));
  $('dx-thr').addEventListener('input', (e) => { thr = +e.target.value; $('dx-thr-v').textContent = thr.toFixed(2); if (netMode !== 'mst') drawNet(); });
  $('dx-cy-cut').addEventListener('change', (e) => { cyCut = e.target.value; updateCy(); });
  $('dx-cy-all').addEventListener('click', () => { DD.sectors.forEach((_, k) => expanded.add(k)); rebuildCy(); });
  $('dx-cy-none').addEventListener('click', () => { expanded.clear(); rebuildCy(); });
  $('dx-cy-lay').addEventListener('click', () => { Object.keys(posMem).forEach((k) => delete posMem[k]); rebuildCy(); });

  /* ---------- start: daily correlation first, then the live feed ---------- */
  document.querySelectorAll('#dx-cwin button').forEach((b) => { if (!b.dataset.w.startsWith('d')) b.disabled = true; b.setAttribute('aria-pressed', String(b.dataset.w === 'd63')); });
  setStatus('waiting', 'Connecting to the live feed…');
  refreshCorrelation(false);
  const firstPoll = poll();
  schedule();
  window.MarketLive = { poll, get live() { return L; }, get corr() { return C; }, ready: firstPoll };
})();
