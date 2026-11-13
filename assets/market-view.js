/* Market View (markets.html): every index page of the site side by side.
   Configuration: window.MARKET_VIEW (inline, generated from python/markets.py by python/make_market_pages.py).
   Data: the same files the index pages use — daily closes in data/dax40.js and data/markets/<id>.js
   (read as text, so the pages' global variables do not collide), and 5-minute bars from the live-data
   (DAX) and live-markets branches. While an exchange trades, its index and members get a provisional
   price for today, exactly as on the index pages. */
(() => {
  const V = window.MARKET_VIEW;
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const cssVar = (n) => getComputedStyle(document.querySelector('.page')).getPropertyValue(n).trim();
  const OWNER_REPO = (() => {
    const h = location.hostname;
    if (h.endsWith('.github.io')) {
      const owner = h.split('.')[0], repo = location.pathname.split('/').filter(Boolean)[0];
      if (repo && !repo.endsWith('.html')) return `${owner}/${repo}`;
    }
    return 'VerJokiel/FRANKFURT08';
  })();
  const minute = () => Math.floor(Date.now() / 60000);
  /* on narrow screens the tab bars scroll sideways: bring this page's tabs into view */
  document.querySelectorAll('.tabs [aria-current="page"], .subtabs [aria-current="page"]').forEach((cur) => {
    const nav = cur.parentElement; if (nav.scrollWidth > nav.clientWidth) nav.scrollLeft = cur.offsetLeft - nav.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
  });

  /* ---------- formatting ---------- */
  const parse = (s) => new Date(s + 'T00:00:00Z');
  const pts = d3.format(',.0f'), pct = d3.format('.1%');
  const signed = (v, d = 1) => (v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%');
  const tone = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const fmtDay = d3.utcFormat('%-d %b %Y');
  const clockIn = (tz) => (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const dayIn = (tz) => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); return (d) => f.format(d); };
  const CORR_STOPS = [[-0.3, '#1a9850'], [0, '#66bd63'], [0.3, '#fee08b'], [0.55, '#f46d43'], [0.8, '#d73027']];
  const corrColor = d3.scaleLinear(CORR_STOPS.map((d) => d[0]), CORR_STOPS.map((d) => d[1])).interpolate(d3.interpolateRgb).clamp(true);

  /* ---------- statistics ---------- */
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  const quant = (s, p) => { const h = (s.length - 1) * p, lo = Math.floor(h); return s[lo] + (s[Math.ceil(h)] - s[lo]) * (h - lo); };

  /* is this exchange trading now? (local time, weekdays, holidays) */
  function isOpen(e, now = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: e.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(now).map((x) => [x.type, x.value]));
    if (p.weekday === 'Sat' || p.weekday === 'Sun' || (e.holidays || []).includes(`${p.year}-${p.month}-${p.day}`)) return false;
    const t = +p.hour * 60 + +p.minute, [oh, om] = e.open.split(':').map(Number), [ch, cm] = e.close.split(':').map(Number);
    return t >= oh * 60 + om && t < ch * 60 + cm;
  }

  /* ---------- state ---------- */
  const DAILY = {}, LIVE = {}, MODEL = {};
  let period = '252', cwin = 252, sortKey = 'y1', sortDir = -1;

  async function loadDaily(e) {
    const res = await fetch(`${e.data}?t=${minute()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${e.data}: HTTP ${res.status}`);
    const s = await res.text();
    return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  }
  async function loadLive(e) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${OWNER_REPO}/${e.live_branch}/${e.live_file}?t=${minute()}`, { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch (err) { return null; }
  }

  /* one index: daily closes plus, during its session, a provisional row for today */
  function buildModel(e, D, L) {
    const dates = D.dates.slice(), idx = D[e.series].slice(), rows = D.rows.map((r) => r.slice());
    const cols = D.columns;
    let liveInfo = null;
    if (L && L.session > D.asof && L.prev_date === D.asof) {
      const day = dayIn(e.tz), last = {};
      for (const s of L.symbols) {
        const a = L.close[s];
        for (let i = a.length - 1; i >= 0; i--) { if (day(new Date(L.times[i] * 1000)) !== L.session) break; if (a[i] != null) { last[s] = a[i]; break; } }
      }
      if (last[e.live_key] && L.prev_close[e.live_key]) {
        const ratio = (k) => (last[k] && L.prev_close[k] ? last[k] / L.prev_close[k] : 1);
        dates.push(L.session);
        idx.push(idx[idx.length - 1] * ratio(e.live_key));
        rows.push(cols.map((tk, j) => rows[rows.length - 1][j] * ratio(tk)));
        let lastT = 0; for (let i = L.times.length - 1; i >= 0; i--) if (L.close[e.live_key][i] != null) { lastT = L.times[i]; break; }
        liveInfo = { time: new Date(lastT * 1000) };
      }
    }
    const T = idx.length, DATES = dates.map(parse);
    const r = idx.map((v, t) => (t ? Math.log(v / idx[t - 1]) : 0));
    const ch = (n) => idx[T - 1] / idx[Math.max(0, T - 1 - n)] - 1;
    const yr = DATES[T - 1].getUTCFullYear(); let ytdI = T - 1; while (ytdI > 0 && DATES[ytdI].getUTCFullYear() === yr) ytdI--;
    const r1 = r.slice(-252), s1 = r1.map((x) => Math.exp(x) - 1).sort((a, b) => a - b);
    let peak = -Infinity, mdd = 0; for (const v of idx.slice(-253)) { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); }
    const ma = (n, t) => (t < n - 1 ? null : mean(idx.slice(t - n + 1, t + 1)));
    const N = cols.length, px = cols.map((_, j) => rows.map((row) => row[j]));
    let above = 0; for (const p of px) if (p[T - 1] > mean(p.slice(T - 200, T))) above++;
    // average pairwise correlation over 63 sessions: Σρ = Var(Σz) for standardised returns
    const win = 63, sum = new Float64Array(win);
    for (const p of px) { const a = []; for (let t = T - win; t < T; t++) a.push(Math.log(p[t] / p[t - 1])); const m = mean(a), s = sd(a) || 1e-12; a.forEach((v, k) => { sum[k] += (v - m) / s; }); }
    const avgCorr = (sd(Array.from(sum)) ** 2 - N) / (N * (N - 1));
    return {
      e, D, live: liveInfo, T, DATES, idx, r,
      level: idx[T - 1], d1: ch(1), w1: ch(5), m1: ch(21), ytd: idx[T - 1] / idx[ytdI] - 1, y1: ch(252),
      vol1m: sd(r.slice(-21)) * Math.sqrt(252), vol1y: sd(r1) * Math.sqrt(252),
      var99: -quant(s1, 0.01), es975: -mean(s1.filter((x) => x <= quant(s1, 0.025))),
      off: idx[T - 1] / d3.max(idx.slice(-252)) - 1, mdd, breadth: above / N, avgCorr, n: N,
      ma200: DATES.map((d, t) => ({ x: d, y: ma(200, t) })), asof: D.asof,
    };
  }

  /* ---------- cards ---------- */
  function spark(box, M) {
    const W = box.clientWidth || 280, H = 70, n = Math.min(252, M.T), from = M.T - n;
    const pts1 = M.DATES.slice(from).map((d, k) => ({ x: d, y: M.idx[from + k] })), ma = M.ma200.slice(from);
    const ys = pts1.map((p) => p.y).concat(ma.filter((p) => p.y != null).map((p) => p.y));
    const x = d3.scaleUtc(d3.extent(pts1, (p) => p.x), [2, W - 4]), y = d3.scaleLinear(d3.extent(ys), [H - 3, 4]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('aria-hidden', 'true');
    svg.append('path').datum(pts1).attr('fill', M.e.color).attr('fill-opacity', 0.12).attr('d', d3.area().x((p) => x(p.x)).y0(H).y1((p) => y(p.y)));
    svg.append('path').datum(ma).attr('fill', 'none').attr('stroke', cssVar('--muted')).attr('stroke-dasharray', '3 3').attr('stroke-width', 1)
      .attr('d', d3.line().defined((p) => p.y != null).x((p) => x(p.x)).y((p) => y(p.y)));
    svg.append('path').datum(pts1).attr('fill', 'none').attr('stroke', M.e.color).attr('stroke-width', 1.8).attr('d', d3.line().x((p) => x(p.x)).y((p) => y(p.y)));
    const last = pts1[pts1.length - 1]; svg.append('circle').attr('cx', x(last.x)).attr('cy', y(last.y)).attr('r', 3).attr('fill', M.e.color);
  }
  function drawCards() {
    const box = $('mv-cards'); box.replaceChildren();
    for (const e of V) {
      const M = MODEL[e.id];
      const a = el('a', { className: 'mv-card', href: e.page }); a.style.setProperty('--c', e.color);
      if (!M) {
        a.append(el('div', { className: 'mv-name', textContent: e.name }), el('p', { className: 'mv-sub', textContent: 'Data not available yet. Open the page for details.' }));
        box.appendChild(a); continue;
      }
      const open = isOpen(e), clock = clockIn(e.tz);
      const head = el('div', { className: 'mv-head' }), nm = el('div');
      nm.append(el('div', { className: 'mv-name', textContent: e.name }), el('div', { className: 'mv-sub', textContent: `${e.country} · ${e.exchange}` }));
      head.append(nm, el('span', { className: 'mv-state' + (open ? ' open' : ''), textContent: open ? `Trading · ${clock(new Date())} local` : 'Closed' }));
      const lvl = el('div', { className: 'mv-level', textContent: pts(M.level) });
      const chg = el('div', { className: 'mv-chg ' + tone(M.d1), textContent: `${signed(M.d1, 2)} ${M.live ? `today, ${clock(M.live.time)} ${e.city} time` : `on ${fmtDay(M.DATES[M.T - 1])}`}` });
      const sp = el('div', { className: 'mv-spark' });
      const grid = el('div', { className: 'mv-grid' });
      for (const [k, v, t] of [['1 month', signed(M.m1), tone(M.m1)], ['YTD', signed(M.ytd), tone(M.ytd)], ['1 year', signed(M.y1), tone(M.y1)], ['Vol 1M', pct(M.vol1m), '']]) {
        const d = el('div'); d.append(el('span', { textContent: k }), el('b', { className: t, textContent: v })); grid.appendChild(d);
      }
      const foot = el('div', { className: 'mv-foot' });
      foot.append(el('span', { textContent: `${M.n} members · ${Math.round(M.breadth * 100)}% above 200-day avg` }), el('span', { className: 'mv-open', textContent: 'Open →' }));
      a.append(head, lvl, chg, sp, grid, foot);
      a.setAttribute('aria-label', `${e.name}: ${pts(M.level)}, ${signed(M.d1, 2)}. Open the ${e.name} page`);
      box.appendChild(a);
      spark(sp, M);
    }
  }

  /* ---------- performance chart ---------- */
  function drawPerf() {
    const box = $('mv-perf'), card = box.closest('.card'); box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const H = W < 520 ? 260 : 320;
    const ms = V.map((e) => MODEL[e.id]).filter(Boolean);
    const ref = ms.reduce((a, b) => (b.T > a.T ? b : a));
    let start;
    if (period === 'ytd') start = new Date(Date.UTC(ref.DATES[ref.T - 1].getUTCFullYear(), 0, 1));
    else if (period === 'all') start = d3.max(ms, (m) => m.DATES[0]);
    else start = ref.DATES[Math.max(0, ref.T - 1 - +period)];
    const series = ms.map((m) => {
      let i = m.DATES.findIndex((d) => d >= start); if (i < 0) i = m.T - 1;
      if (period !== 'ytd' && i > 0 && m.DATES[i] > start) i -= 1;     // the last close on or before the start
      const base = m.idx[i];
      return { m, points: m.DATES.slice(i).map((d, k) => ({ x: d, y: 100 * m.idx[i + k] / base })) };
    });
    const all = series.flatMap((s) => s.points);
    const right = W < 520 ? 70 : 110;
    const x = d3.scaleUtc(d3.extent(all, (p) => p.x), [44, W - right]), y = d3.scaleLinear(d3.extent(all, (p) => p.y), [H - 24, 10]).nice();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    for (const t of y.ticks(6)) {
      svg.append('line').attr('x1', 44).attr('x2', W - right).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === 100 ? 'var(--ref)' : 'var(--grid)').attr('stroke-dasharray', t === 100 ? '4 3' : null);
      svg.append('text').attr('class', 'tick').attr('x', 38).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(t);
    }
    for (const t of x.ticks(Math.max(2, Math.floor(W / 110)))) svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.utcFormat(period === '21' ? '%-d %b' : '%b %y')(t));
    const labels = [];
    for (const s of series) {
      svg.append('path').datum(s.points).attr('fill', 'none').attr('stroke', s.m.e.color).attr('stroke-width', 2).attr('d', d3.line().x((p) => x(p.x)).y((p) => y(p.y)));
      const last = s.points[s.points.length - 1]; labels.push({ y: y(last.y), s, v: last.y });
    }
    labels.sort((a, b) => a.y - b.y); for (let k = 1; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 13);
    for (const l of labels) svg.append('text').attr('x', W - right + 6).attr('y', l.y).attr('dy', '0.32em').style('fill', l.s.m.e.color).style('font-size', '11px').style('font-weight', 600)
      .text(`${l.s.m.e.name} ${l.v >= 100 ? '+' : '−'}${Math.abs(l.v - 100).toFixed(1)}%`);
    const rule = svg.append('line').attr('y1', 10).attr('y2', H - 24).attr('stroke', 'var(--axis)').attr('opacity', 0);
    svg.append('rect').attr('x', 44).attr('width', W - right - 44).attr('height', H).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev) => {
        const t = x.invert(d3.pointer(ev)[0]); rule.attr('x1', x(t)).attr('x2', x(t)).attr('opacity', 1);
        const lines = series.map((s) => { let p = null; for (const q of s.points) { if (q.x > t) break; p = q; } return p && { name: s.m.e.name, color: s.m.e.color, v: p.y }; }).filter(Boolean).sort((a, b) => b.v - a.v);
        tip(card, ev, fmtDay(t), lines.map((l) => ({ color: l.color, name: l.name, value: (l.v >= 100 ? '+' : '−') + Math.abs(l.v - 100).toFixed(1) + '%' })));
      })
      .on('pointerleave', () => { rule.attr('opacity', 0); untip(card); });
  }
  function tip(card, event, head, lines) {
    let t = card.querySelector(':scope > .tip'); if (!t) { t = el('div', { className: 'tip' }); card.appendChild(t); }
    t.replaceChildren(el('div', { className: 'h', textContent: head }));
    for (const l of lines) { const r = el('div', { className: 'r' }); if (l.color) { const i = el('i', { className: 'dot' }); i.style.background = l.color; r.appendChild(i); } r.append(el('span', { textContent: l.name }), el('span', { textContent: l.value })); t.appendChild(r); }
    t.hidden = false;
    const b = card.getBoundingClientRect(), tw = t.offsetWidth;
    let xx = event.clientX - b.left + 14; if (xx + tw > b.width - 8) xx = event.clientX - b.left - tw - 14;
    t.style.left = Math.max(8, xx) + 'px'; t.style.top = (event.clientY - b.top + 14) + 'px';
  }
  const untip = (card) => { const t = card.querySelector(':scope > .tip'); if (t) t.hidden = true; };

  /* ---------- table ---------- */
  const COLS = [
    { k: 'name', label: 'Index', l: true },
    { k: 'level', label: 'Level', f: pts },
    { k: 'd1', label: 'Today', f: (v) => signed(v, 2), t: true },
    { k: 'w1', label: '1 week', f: signed, t: true },
    { k: 'm1', label: '1 month', f: signed, t: true },
    { k: 'ytd', label: 'YTD', f: signed, t: true },
    { k: 'y1', label: '1 year', f: signed, t: true },
    { k: 'vol1m', label: 'Vol 1M', f: pct },
    { k: 'vol1y', label: 'Vol 1Y', f: pct },
    { k: 'var99', label: 'VaR 99%', f: pct },
    { k: 'es975', label: 'ES 97.5%', f: pct },
    { k: 'off', label: 'Off 52w high', f: (v) => (v > -0.0005 ? 'At high' : signed(v)) },
    { k: 'mdd', label: 'Max drawdown 1Y', f: signed },
    { k: 'breadth', label: 'Above 200d', f: (v) => Math.round(v * 100) + '%' },
    { k: 'avgCorr', label: 'Avg corr 3M', f: (v) => v.toFixed(2) },
    { k: 'n', label: 'Members', f: String },
  ];
  function drawTable() {
    const tbl = $('mv-table'), tr = tbl.querySelector('thead tr');
    tr.replaceChildren(...COLS.map((c) => {
      const th = el('th', { className: c.l ? 'l' : '', textContent: c.label, scope: 'col', tabIndex: 0 });
      if (c.k === sortKey) th.setAttribute('aria-sort', sortDir < 0 ? 'descending' : 'ascending');
      const go = () => { if (sortKey === c.k) sortDir = -sortDir; else { sortKey = c.k; sortDir = c.k === 'name' ? 1 : -1; } drawTable(); };
      th.addEventListener('click', go); th.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
      return th;
    }));
    const ms = V.map((e) => MODEL[e.id]).filter(Boolean);
    const val = (m, k) => (k === 'name' ? m.e.name : m[k]);
    ms.sort((a, b) => { const x = val(a, sortKey), y = val(b, sortKey); return (x < y ? -1 : x > y ? 1 : 0) * sortDir; });
    tbl.querySelector('tbody').replaceChildren(...ms.map((m) => {
      const row = el('tr');
      for (const c of COLS) {
        if (c.k === 'name') { const td = el('td', { className: 'l' }), i = el('i'); i.style.background = m.e.color; const a = el('a', { href: m.e.page, textContent: m.e.name }); td.append(i, a, el('span', { className: 'muted', textContent: ' ' + m.e.country })); row.appendChild(td); continue; }
        row.appendChild(el('td', { className: c.t ? tone(m[c.k]) : '', textContent: c.f(m[c.k]) }));
      }
      return row;
    }));
  }

  /* ---------- return / risk scatter ---------- */
  function drawScatter() {
    const box = $('mv-scatter'), card = box.closest('.card'); box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const H = 280, ms = V.map((e) => MODEL[e.id]).filter(Boolean);
    const x = d3.scaleLinear([0, d3.max(ms, (m) => m.vol1y) * 1.15], [48, W - 16]).nice();
    const ye = d3.extent(ms, (m) => m.y1); const y = d3.scaleLinear([Math.min(0, ye[0]) - 0.03, Math.max(0, ye[1]) + 0.03], [H - 28, 12]).nice();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    for (const t of y.ticks(5)) { svg.append('line').attr('x1', 48).attr('x2', W - 16).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === 0 ? 'var(--ref)' : 'var(--grid)'); svg.append('text').attr('class', 'tick').attr('x', 42).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(d3.format('.0%')(t)); }
    for (const t of x.ticks(5)) svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 10).attr('text-anchor', 'middle').text(d3.format('.0%')(t));
    svg.append('text').attr('class', 'tick').attr('x', W - 16).attr('y', H - 30).attr('text-anchor', 'end').text('volatility, 1 year →');
    svg.append('text').attr('class', 'tick').attr('x', 52).attr('y', 14).text('↑ return, 1 year');
    const g = svg.selectAll('g.pt').data(ms).join('g').attr('class', 'pt').attr('transform', (m) => `translate(${x(m.vol1y)},${y(m.y1)})`);
    g.append('circle').attr('r', 7).attr('fill', (m) => m.e.color).attr('stroke', '#13233f').attr('stroke-width', 1.5);
    g.append('text').attr('x', 11).attr('dy', '0.32em').style('fill', 'var(--fg)').style('font-size', '11px').style('font-weight', 600).text((m) => m.e.name);
    g.on('pointermove', (ev, m) => tip(card, ev, m.e.name, [{ name: '1-year return', value: signed(m.y1) }, { name: '1-year volatility', value: pct(m.vol1y) }, { name: 'Return / volatility', value: (m.y1 / m.vol1y).toFixed(2) }]))
      .on('pointerleave', () => untip(card));
  }

  /* ---------- correlation between the indices ---------- */
  function drawCorr() {
    const box = $('mv-corr'), card = box.closest('.card'); box.replaceChildren();
    const ms = V.map((e) => MODEL[e.id]).filter(Boolean);
    const maps = ms.map((m) => new Map(m.DATES.map((d, t) => [+d, m.idx[t]])));
    let common = [...maps[0].keys()].filter((k) => maps.every((mp) => mp.has(k))).sort((a, b) => a - b);
    common = common.slice(-(cwin + 1));
    const R = maps.map((mp) => common.slice(1).map((k, i) => Math.log(mp.get(k) / mp.get(common[i]))));
    const z = R.map((a) => { const m = mean(a), s = sd(a) || 1e-12; return a.map((v) => (v - m) / s); });
    const n = ms.length, P = ms.map((_, i) => ms.map((__, j) => { let s = 0; for (let k = 0; k < z[i].length; k++) s += z[i][k] * z[j][k]; return s / (z[i].length - 1); }));
    const W = box.clientWidth; if (!W) return;
    const lab = 70, cell = Math.min(64, (W - lab - 4) / n), H = lab * 0.45 + cell * n + 4;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', `Correlation of daily index returns over ${common.length - 1} common sessions`);
    const top = lab * 0.45;
    ms.forEach((m, j) => svg.append('text').attr('x', lab + cell * j + cell / 2).attr('y', top - 8).attr('text-anchor', 'middle').style('fill', m.e.color).style('font-size', '10.5px').style('font-weight', 600).text(m.e.name));
    ms.forEach((m, i) => {
      svg.append('text').attr('x', lab - 8).attr('y', top + cell * i + cell / 2).attr('dy', '0.32em').attr('text-anchor', 'end').style('fill', m.e.color).style('font-size', '10.5px').style('font-weight', 600).text(m.e.name);
      ms.forEach((m2, j) => {
        const v = P[i][j], g = svg.append('g').attr('transform', `translate(${lab + cell * j},${top + cell * i})`);
        g.append('rect').attr('width', cell - 2).attr('height', cell - 2).attr('rx', 3).attr('fill', i === j ? '#2a3d5e' : corrColor(v));
        if (i !== j) g.append('text').attr('x', (cell - 2) / 2).attr('y', (cell - 2) / 2).attr('dy', '0.32em').attr('text-anchor', 'middle').style('fill', v > 0.2 && v < 0.65 ? '#13233f' : '#f3efe6').style('font-size', cell > 44 ? '12px' : '10px').style('font-weight', 600).text(v.toFixed(2));
        g.on('pointermove', (ev) => tip(card, ev, `${m.e.name} × ${m2.e.name}`, [{ name: 'Correlation', value: v.toFixed(2) }, { name: 'Common sessions', value: String(common.length - 1) }])).on('pointerleave', () => untip(card));
      });
    });
    const lo = CORR_STOPS[0][0], hi = CORR_STOPS[CORR_STOPS.length - 1][0];
    $('mv-corr-scale').replaceChildren(el('span', { textContent: 'independent ≤ −0.3' }),
      Object.assign(el('span', { className: 'ramp' }), { style: `background:linear-gradient(90deg,${CORR_STOPS.map(([v, c]) => `${c} ${((v - lo) / (hi - lo) * 100).toFixed(0)}%`).join(',')})` }),
      el('span', { textContent: '0.8+ together' }), el('span', { textContent: ` · ${common.length - 1} sessions to ${fmtDay(new Date(common[common.length - 1]))}` }));
  }

  /* ---------- status and update lines ---------- */
  function drawStatus() {
    const ms = V.map((e) => MODEL[e.id]).filter(Boolean);
    const open = V.filter((e) => isOpen(e)), liveMs = ms.filter((m) => m.live);
    const asofs = [...new Set(ms.map((m) => m.asof))].sort();
    const pill = $('mv-pill');
    const lastBar = liveMs.length ? new Date(Math.max(...liveMs.map((m) => +m.live.time))) : null;
    const ber = clockIn('Europe/Berlin');
    if (open.length) {
      pill.className = 'dx-pill live'; pill.textContent = 'Live';
      $('mv-status').textContent = `${open.length} of ${V.length} exchanges trading. ${liveMs.length ? `Today's prices from 5-minute bars, latest ${ber(lastBar)} Frankfurt time (about 15 minutes behind the market).` : 'Waiting for the first 5-minute bars.'}`;
    } else {
      pill.className = 'dx-pill closed'; pill.textContent = 'Markets closed';
      $('mv-status').textContent = `All exchanges closed. Showing daily closes to ${fmtDay(parse(asofs[asofs.length - 1]))}${liveMs.length ? `, with the last session's 5-minute prices for ${liveMs.map((m) => m.e.name).join(', ')} until the evening update` : ''}.`;
    }
    const text = `Daily closes to ${asofs.map((a) => fmtDay(parse(a))).join(' / ')}` + (liveMs.length ? ` · today from 5-minute bars (${liveMs.map((m) => m.e.name).join(', ')}), last ${ber(lastBar)} Frankfurt time` : '');
    document.querySelectorAll('#page-view .card[data-feed]').forEach((card) => {
      let p = card.querySelector(':scope > .dx-fresh');
      if (!p) { p = el('p', { className: 'dx-fresh' }); const h = card.querySelector(':scope > h2'); if (h) h.after(p); else card.prepend(p); }
      p.classList.toggle('is-live', liveMs.length > 0); p.textContent = text;
    });
  }

  function renderAll() {
    for (const e of V) { if (DAILY[e.id]) { try { MODEL[e.id] = buildModel(e, DAILY[e.id], LIVE[e.id]); } catch (err) { delete MODEL[e.id]; } } }
    drawStatus(); drawCards(); drawPerf(); drawTable(); drawScatter(); drawCorr();
  }

  /* ---------- loading and polling ---------- */
  async function loadAll() {
    const failed = [];
    await Promise.all(V.map(async (e) => {
      try { DAILY[e.id] = await loadDaily(e); } catch (err) { failed.push(e.name); }
      LIVE[e.id] = await loadLive(e);
    }));
    $('mv-error').hidden = !failed.length;
    if (failed.length) $('mv-error').textContent = `No daily data for ${failed.join(', ')} yet; the other indices are shown.`;
  }
  async function pollLive() {
    if (document.hidden) return;
    // only while an exchange trades or within 40 minutes after a close (the source delay)
    const soon = V.some((e) => isOpen(e) || isOpen(e, new Date(Date.now() - 40 * 60000)));
    if (!soon) { drawStatus(); return; }
    let changed = false;
    await Promise.all(V.map(async (e) => { const L = await loadLive(e); if (L && (!LIVE[e.id] || L.generated !== LIVE[e.id].generated)) { LIVE[e.id] = L; changed = true; } }));
    if (changed) renderAll(); else drawStatus();
  }
  async function pollDaily() {
    if (document.hidden) return;
    const before = V.map((e) => DAILY[e.id] && DAILY[e.id].built).join();
    await Promise.all(V.map(async (e) => { try { DAILY[e.id] = await loadDaily(e); } catch (err) { /* keep */ } }));
    if (V.map((e) => DAILY[e.id] && DAILY[e.id].built).join() !== before) renderAll();
  }

  document.querySelectorAll('#mv-period button').forEach((b) => b.addEventListener('click', () => {
    period = b.dataset.p; document.querySelectorAll('#mv-period button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawPerf();
  }));
  document.querySelectorAll('#mv-cwin button').forEach((b) => b.addEventListener('click', () => {
    cwin = +b.dataset.w; document.querySelectorAll('#mv-cwin button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawCorr();
  }));
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawCards(); drawPerf(); drawScatter(); drawCorr(); }, 150); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollLive(); });

  window.MarketView = { ready: loadAll().then(renderAll).catch((err) => { $('mv-error').hidden = false; $('mv-error').textContent = 'Could not load the market data: ' + err.message; }), get models() { return MODEL; } };
  setInterval(pollLive, 60000);
  setInterval(pollDaily, 15 * 60000);
})();
