/* Three-Pillar ETF Dashboard — plain JS + d3 v7, no build step. */
(() => {
  const D = window.DATA;
  const STOCKS = D.stocks;                                   // [{id, name, sector}]
  const IDS = STOCKS.map((s) => s.id);
  const SECTORS = [...new Set(STOCKS.map((s) => s.sector))]; // Banking, Industry, Oil & Energy
  const sectorVar = (sec) => '--' + sec.toLowerCase().replace(/[^a-z]/g, '');

  /* pillar ETFs: equal weight, three stocks each, plus the combined portfolio */
  const ETFS = SECTORS.map((sec) => ({ id: 'ETF_' + sec.replace(/[^A-Za-z]/g, '').toUpperCase(), name: sec + ' ETF', sector: sec, etf: true,
    members: STOCKS.filter((s) => s.sector === sec).map((s) => s.id) }));
  const COMBINED = { id: 'ETF_ALL', name: 'Combined portfolio', sector: 'All', etf: true, members: ETFS.map((e) => e.id) };
  const ETF_IDS = ETFS.map((e) => e.id);
  const byId = Object.fromEntries([...STOCKS, ...ETFS, COMBINED].map((s) => [s.id, s]));

  /* ---------- formatting ---------- */
  const pct = d3.format('.1%'), pct0 = d3.format('.0%');
  const fmtDay = d3.utcFormat('%b %-d, %Y');
  const parse = (s) => new Date(s + 'T00:00:00Z');
  const signedPct = (v) => (v > 0 ? '+' : '') + pct(v);
  const pts = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(1) + ' pts';
  const f2 = (v) => (v == null ? '–' : v.toFixed(2));
  // colours are read from the visible page, so each page's palette (navy/sage or fintech light) applies to its charts
  const cssVar = (n) => getComputedStyle(document.querySelector('.page:not([hidden])') || document.documentElement).getPropertyValue(n).trim();
  const sectorColor = (sec) => (sec === 'All' ? cssVar('--fg') : cssVar(sectorVar(sec)));

  /* colours: one hue per pillar, shades per stock; ETFs take the pillar colour */
  function colorOf(id) {
    const s = byId[id];
    if (s.etf) return sectorColor(s.sector);
    const base = d3.hsl(sectorColor(s.sector));
    const same = STOCKS.filter((x) => x.sector === s.sector);
    const i = same.findIndex((x) => x.id === id), n = same.length;
    const c = base.copy(); c.l = Math.max(0.2, Math.min(0.8, base.l + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.3)));
    return c.formatHex();
  }
  const shortName = (id) => { const s = byId[id]; return s.etf ? s.sector : s.name; };
  const code = (id) => { const s = byId[id]; return s.etf ? s.sector.split(' ')[0] : s.sector[0] + s.name.slice(-1); };

  /* ---------- prices, ETF levels, returns ---------- */
  const prices = D.rows.map((r) => Object.fromEntries(D.columns.map((c, i) => [c, r[i]])));
  { // ETF index levels: average of members' daily simple returns, compounded from 100
    const lvl = {}; ETFS.forEach((e) => (lvl[e.id] = 100)); lvl[COMBINED.id] = 100;
    let prev = null;
    for (const p of prices) {
      if (prev) {
        const er = {};
        for (const e of ETFS) {
          const rs = e.members.filter((m) => p[m] != null && prev[m] != null).map((m) => p[m] / prev[m] - 1);
          er[e.id] = rs.length ? d3.mean(rs) : 0; lvl[e.id] *= 1 + er[e.id];
        }
        lvl[COMBINED.id] *= 1 + d3.mean(ETF_IDS, (id) => er[id]);
      }
      for (const k in lvl) p[k] = lvl[k];
      prev = p;
    }
  }
  const ALL_SERIES = [...IDS, ...ETF_IDS, COMBINED.id];
  const returns = [];
  { const last = {};
    for (const p of prices) for (const t of ALL_SERIES) {
      const v = p[t]; if (v == null || !(v > 0)) continue;
      if (last[t]) returns.push({ date: p.date, id: t, r: Math.log(v / last[t]) });
      last[t] = v;
    } }

  const wk = (d) => { const t = parse(d); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };

  const weeklyVol = (() => {
    const g = new Map();
    for (const x of returns) {
      const w = wk(x.date), k = w + '|' + x.id;
      if (!g.has(k)) g.set(k, { week: w, id: x.id, rs: [], end: x.date });
      const o = g.get(k); o.rs.push(x.r); if (x.date > o.end) o.end = x.date;
    }
    const out = [];
    for (const o of g.values()) {
      const n = o.rs.length; if (n < 3) continue;
      const s = d3.sum(o.rs), m = s / n, v = d3.sum(o.rs, (b) => (b - m) ** 2) / (n - 1);
      out.push({ week: o.week, week_end: o.end, id: o.id, vol: Math.sqrt(v * 252), ret: Math.exp(s) - 1, days: n });
    }
    return out.sort((a, b) => d3.ascending(a.week, b.week) || d3.ascending(a.id, b.id));
  })();

  const TABLE_IDS = [...IDS, ...ETF_IDS, COMBINED.id];
  const summary = TABLE_IDS.map((id) => {
    const s = byId[id];
    const w = weeklyVol.filter((x) => x.id === id);
    const L = w[w.length - 1], P = w[w.length - 2], y = w.slice(-52);
    const series = prices.map((p) => p[id]).filter((v) => v != null);
    return {
      id, name: s.name, sector: s.sector, etf: !!s.etf,
      ret_last: L?.ret ?? null, vol_last: L?.vol ?? null, vol_chg: L && P ? L.vol - P.vol : null,
      vol_avg52: y.length ? d3.mean(y, (d) => d.vol) : null, vol_max52: y.length ? d3.max(y, (d) => d.vol) : null,
      ret_total: series.length ? series[series.length - 1] / series[0] - 1 : null,
    };
  });

  const pear = (xs, ys) => {
    const n = xs.length; if (n < 5) return null;
    const mx = d3.mean(xs), my = d3.mean(ys); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
    return sxy / Math.sqrt(sxx * syy);
  };
  const dates = [...new Set(returns.map((r) => r.date))].sort();
  const weeks = [...new Set(dates.map(wk))].sort();
  const RD = new Map(), RW = new Map();
  for (const r of returns) { RD.set(r.id + '|' + r.date, r.r); const k = r.id + '|' + wk(r.date); RW.set(k, (RW.get(k) || 0) + r.r); }
  const WINDOWS = { '3M': 63, '6M': 126, '1Y': 252, '2Y': 1e6 };
  const corrCache = {};
  function corrMatrix(win, freq, ids) {
    const key = win + freq + ids.join(); if (corrCache[key]) return corrCache[key];
    const N = WINDOWS[win];
    const keys = freq === 'daily' ? dates.slice(-N) : weeks.slice(-Math.ceil(N / 5));
    const M = freq === 'daily' ? RD : RW;
    const out = [];
    for (const a of ids) for (const b of ids) {
      const xs = [], ys = [];
      for (const k of keys) { const x = M.get(a + '|' + k), y = M.get(b + '|' + k); if (x != null && y != null) { xs.push(x); ys.push(y); } }
      out.push({ a, b, rho: a === b ? 1 : pear(xs, ys), obs: xs.length });
    }
    return (corrCache[key] = out);
  }
  function groupCorr(win, freq) {
    const g = {};
    for (const c of corrMatrix(win, freq, IDS)) {
      if (IDS.indexOf(c.a) >= IDS.indexOf(c.b) || c.rho == null) continue;
      const sa = byId[c.a].sector, sb = byId[c.b].sector;
      const grp = sa === sb ? sa : 'Across pillars';
      (g[grp] = g[grp] || []).push(c.rho);
    }
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, d3.mean(v)]));
  }
  function etfCorr(win, freq) {
    const v = corrMatrix(win, freq, ETF_IDS).filter((c) => ETF_IDS.indexOf(c.a) < ETF_IDS.indexOf(c.b)).map((c) => c.rho);
    return d3.mean(v);
  }
  function annVol(id, N) {
    const rs = dates.slice(-N).map((d) => RD.get(id + '|' + d)).filter((x) => x != null);
    return d3.deviation(rs) * Math.sqrt(252);
  }
  function rolling(a, b) {
    const out = [];
    for (let e = 62; e < dates.length; e += 5) {
      const xs = [], ys = [];
      for (let k = e - 62; k <= e; k++) { const x = RD.get(a + '|' + dates[k]), y = RD.get(b + '|' + dates[k]); if (x != null && y != null) { xs.push(x); ys.push(y); } }
      if (xs.length >= 30) out.push({ x: parse(dates[e]), y: pear(xs, ys) });
    }
    return out;
  }

  /* ---------- state ---------- */
  const state = { tab: 'overview', selected: null, sortKey: 'sector', sortDir: 1, win: '1Y', freq: 'daily', level: 'stocks', heatRes: 'month',
    pair: { stocks: [IDS[0], IDS[1]], etfs: [ETF_IDS[0], ETF_IDS[2]] } };

  /* ---------- helpers ---------- */
  function measure(svg, text) { const t = svg.append('text').attr('class', 'tick').text(text); const w = t.node().getComputedTextLength(); t.remove(); return w; }
  function tipFor(card) { let t = card.querySelector(':scope > .tip'); if (!t) { t = document.createElement('div'); t.className = 'tip'; t.hidden = true; card.appendChild(t); } return t; }
  function showTip(card, event, head, lines) {
    const t = tipFor(card);
    const h = document.createElement('div'); h.className = 'h'; h.textContent = head;
    const kids = [h];
    for (const l of lines) {
      const r = document.createElement('div'); r.className = 'r';
      if (l.color) { const i = document.createElement('i'); i.className = 'dot'; i.style.background = l.color; r.appendChild(i); }
      const n = document.createElement('span'); n.textContent = l.name; const v = document.createElement('span'); v.textContent = l.value;
      r.append(n, v); kids.push(r);
    }
    t.replaceChildren(...kids); t.hidden = false;
    const cr = card.getBoundingClientRect();
    let x = event.clientX - cr.left + 14, y = event.clientY - cr.top + 14;
    if (x + t.offsetWidth > cr.width - 4) x = event.clientX - cr.left - t.offsetWidth - 14;
    if (x < 4) x = 4;
    if (y + t.offsetHeight > cr.height - 4) y = event.clientY - cr.top - t.offsetHeight - 14;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  const hideTip = (card) => { const t = card.querySelector(':scope > .tip'); if (t) t.hidden = true; };
  const el = (tag, props) => Object.assign(document.createElement(tag), props);

  function lineChart(box, series, o) {
    const card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const narrow = W < 520;
    const H = narrow ? Math.round((o.height || 280) * 0.78) : (o.height || 280);
    const all = series.flatMap((s) => s.points); if (!all.length) return;
    const useEnd = o.endLabels && !narrow;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const yd = o.yDomain || [o.yMin ?? 0, d3.max(all, (d) => d.y) * 1.05];
    const y = d3.scaleLinear(yd, [H - 26, 10]).nice();
    const ticks = y.ticks(5);
    const left = d3.max(ticks, (t) => measure(svg, o.yFmt(t))) + 10;
    const right = useEnd ? d3.max(series, (s) => measure(svg, s.label)) + 18 : 10;
    const x = d3.scaleUtc(d3.extent(all, (d) => d.x), [left, W - right]);
    const g = svg.append('g');
    for (const t of ticks) {
      g.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--grid)');
      g.append('text').attr('class', 'tick').attr('x', left - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(o.yFmt(t));
    }
    if (o.bands) for (const bd of o.bands) {
      const y0 = y(Math.min(bd.to, y.domain()[1])), y1 = y(Math.max(bd.from, y.domain()[0])); if (y1 <= y0) continue;
      g.insert('rect', ':first-child').attr('x', left).attr('width', W - right - left).attr('y', y0).attr('height', y1 - y0).attr('fill', bd.color).attr('fill-opacity', 0.16);
    }
    if (o.refY != null && o.refY > y.domain()[0] && o.refY < y.domain()[1])
      g.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(o.refY)).attr('y2', y(o.refY)).attr('stroke', 'var(--ref)').attr('stroke-dasharray', '4 3');
    for (const t of x.ticks(Math.max(2, Math.floor((W - left - right) / 80)))) {
      const px = x(t); if (px < left + 18 || px > W - right - 18) continue;
      g.append('text').attr('class', 'tick').attr('x', px).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.utcFormat('%b %y')(t));
    }
    g.append('line').attr('x1', left).attr('x2', W - right).attr('y1', H - 26).attr('y2', H - 26).attr('stroke', 'var(--axis)');
    const line = d3.line().defined((d) => d.y != null).x((d) => x(d.x)).y((d) => y(d.y));
    for (const s of series) svg.append('path').datum(s.points).attr('d', line).attr('fill', 'none').attr('stroke', s.color)
      .attr('stroke-width', s.width || 2).attr('stroke-dasharray', s.dash || null).attr('stroke-linecap', s.dash ? 'butt' : 'round').attr('stroke-linejoin', 'round');
    if (useEnd) {
      const labs = series.map((s) => ({ s, y: y(s.points[s.points.length - 1].y) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 14) labs[i].y = labs[i - 1].y + 14;
      for (const l of labs) svg.append('text').attr('class', 'tick').attr('x', W - right + 6).attr('y', l.y).attr('dy', '0.32em').style('fill', l.s.color).text(l.s.label);
    }
    const times = [...new Set(all.map((d) => +d.x))].sort((a, b) => a - b);
    const rule = svg.append('line').attr('y1', 10).attr('y2', H - 26).attr('stroke', 'var(--axis)').attr('opacity', 0);
    const dots = svg.append('g');
    svg.append('rect').attr('x', left).attr('width', Math.max(0, W - left - right)).attr('height', H).attr('fill', 'transparent')
      .on('pointermove pointerdown', (event) => {
        const tv = +x.invert(d3.pointer(event)[0]);
        const i = d3.bisectLeft(times, tv);
        const t = (i > 0 && (i >= times.length || tv - times[i - 1] < times[i] - tv)) ? times[i - 1] : times[i];
        if (t == null) return;
        rule.attr('x1', x(t)).attr('x2', x(t)).attr('opacity', 1);
        dots.selectAll('*').remove();
        const lines = [];
        for (const s of series) {
          const p = s.points.find((d) => +d.x === t); if (!p || p.y == null) continue;
          dots.append('circle').attr('cx', x(t)).attr('cy', y(p.y)).attr('r', 3.5).attr('fill', s.color);
          lines.push({ color: series.length > 1 ? s.color : null, name: s.name, value: o.yTip(p.y), v: p.y });
        }
        lines.sort((a, b) => b.v - a.v);
        showTip(card, event, o.head(new Date(t)), lines);
      })
      .on('pointerleave', () => { rule.attr('opacity', 0); dots.selectAll('*').remove(); hideTip(card); });
    if (o.endLabels && !useEnd) legendItems(box, series.map((s) => ({ color: s.color, label: s.label || s.name, dash: s.dash })));
  }
  function legendItems(box, items) {
    const wrap = el('div', { className: 'legend-items' });
    for (const it of items) {
      const sp = el('span'); const sw = el('i'); sw.style.background = it.color;
      if (it.dash) sw.style.background = `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)`;
      sp.append(sw, document.createTextNode(it.label)); wrap.appendChild(sp);
    }
    box.appendChild(wrap);
  }

  function stat(label, value, sub, color, accent) {
    const d = el('div', { className: 'stat' + (accent ? ' accent' : '') });
    const k = el('div', { className: 'k' });
    if (color) { const i = el('i', { className: 'dot' }); i.style.background = color; k.appendChild(i); }
    k.appendChild(document.createTextNode(label));
    d.append(k, el('div', { className: 'v', textContent: value }), el('div', { className: 's', textContent: sub }));
    return d;
  }

  const inkFor = (rgb) => { const c = d3.rgb(rgb); return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 > 0.55 ? '#1a1a1a' : '#ffffff'; };

  /* correlation colours: green = moves independently (diversifies), yellow = moderate, red = moves together */
  const CORR_STOPS = [[-0.3, '#1a9850'], [0, '#66bd63'], [0.3, '#fee08b'], [0.55, '#f46d43'], [0.8, '#d73027']];
  const corrColor = d3.scaleLinear(CORR_STOPS.map((d) => d[0]), CORR_STOPS.map((d) => d[1])).interpolate(d3.interpolateRgb).clamp(true);
  /* volatility colours: green = calm, yellow = typical, red = turbulent (RdYlGn, reversed) */
  const volRamp = (t) => d3.interpolateRdYlGn(1 - t);

  /* generic correlation matrix */
  function drawMatrix(box, ids, C, opts = {}) {
    const card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return null;
    const narrow = W < 480;
    const lab = (id) => (narrow ? code(id) : shortName(id));
    const tmp = d3.select(box).append('svg'); const left = d3.max(ids, (t) => measure(tmp, lab(t))) + 10; tmp.remove();
    const cell = Math.max(24, Math.min(opts.maxCell || 58, Math.floor((W - left - 4) / ids.length)));
    const top = 22, H = top + cell * ids.length + 4;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleBand(ids, [left, left + cell * ids.length]).paddingInner(0.06);
    const y = d3.scaleBand(ids, [top, top + cell * ids.length]).paddingInner(0.06);
    const f = corrColor;
    for (const t of ids) {
      svg.append('text').attr('class', 'tick').attr('x', left - 6).attr('y', y(t) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').style('fill', colorOf(t)).text(lab(t));
      svg.append('text').attr('class', 'tick').attr('x', x(t) + x.bandwidth() / 2).attr('y', top - 8).attr('text-anchor', 'middle').style('fill', colorOf(t)).text(code(t));
    }
    const sel = opts.pair || [];
    const g = svg.append('g').selectAll('g').data(C).join('g').style('cursor', (d) => (d.a === d.b || !opts.onPick ? 'default' : 'pointer'));
    g.append('rect').attr('x', (d) => x(d.b)).attr('y', (d) => y(d.a)).attr('width', x.bandwidth()).attr('height', y.bandwidth()).attr('rx', 3)
      .attr('fill', (d) => (d.a === d.b ? 'var(--line)' : d.rho == null ? 'transparent' : f(d.rho)))
      .attr('stroke', (d) => ((d.a === sel[0] && d.b === sel[1]) || (d.a === sel[1] && d.b === sel[0]) ? 'var(--fg)' : 'none')).attr('stroke-width', 2);
    if (opts.blocks) for (const sec of SECTORS) {
      const m = ids.filter((id) => byId[id].sector === sec); if (m.length < 2) continue;
      const x0 = x(m[0]) - 2, x1 = x(m[m.length - 1]) + x.bandwidth() + 2;
      svg.append('rect').attr('x', x0).attr('y', y(m[0]) - 2).attr('width', x1 - x0).attr('height', x1 - x0).attr('rx', 5).attr('fill', 'none')
        .attr('stroke', sectorColor(sec)).attr('stroke-width', 1.5).attr('stroke-dasharray', '3 3').attr('pointer-events', 'none');
    }
    const fmtCell = (v) => (cell >= 40 ? f2(v) : v == null ? '–' : v.toFixed(2).replace(/^(-?)0\./, '$1.'));
    if (cell >= 26) g.append('text').attr('x', (d) => x(d.b) + x.bandwidth() / 2).attr('y', (d) => y(d.a) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'middle')
      .style('font-size', cell >= 50 ? '13px' : cell >= 40 ? '11px' : '10px').style('font-variant-numeric', 'tabular-nums')
      .style('fill', (d) => (d.a === d.b || d.rho == null ? 'var(--muted)' : inkFor(f(d.rho)))).text((d) => fmtCell(d.rho));
    g.on('pointermove pointerdown', (event, d) => {
      if (d.a === d.b) return hideTip(card);
      showTip(card, event, opts.head || '', [{ name: byId[d.a].name + ' × ' + byId[d.b].name, value: f2(d.rho) }, { name: 'Observations', value: String(d.obs) }]);
    }).on('pointerleave', () => hideTip(card))
      .on('click', (event, d) => { if (d.a !== d.b && opts.onPick) opts.onPick(ids.indexOf(d.a) < ids.indexOf(d.b) ? [d.a, d.b] : [d.b, d.a]); });
    return { stops: CORR_STOPS };
  }
  function legend(target, c) {
    const lo = c.stops[0][0], hi = c.stops[c.stops.length - 1][0];
    const ramp = el('span', { className: 'ramp' });
    ramp.style.background = `linear-gradient(90deg, ${c.stops.map(([v, col]) => `${col} ${((v - lo) / (hi - lo) * 100).toFixed(0)}%`).join(', ')})`;
    document.getElementById(target).replaceChildren(el('span', { textContent: 'independent ≤ −0.3' }), ramp, el('span', { textContent: '0.8+ together' }));
  }

  /* ---------- overview ---------- */
  function drawOverview() {
    const g1 = groupCorr('1Y', 'daily');
    const within = d3.mean(SECTORS, (s) => g1[s]);
    const ec = etfCorr('1Y', 'daily');
    const vComb = annVol(COMBINED.id, 252), vEtfAvg = d3.mean(ETF_IDS, (id) => annVol(id, 252)), vStockAvg = d3.mean(IDS, (id) => annVol(id, 252));
    document.getElementById('ov-stats').replaceChildren(
      stat('Between pillar ETFs', f2(ec), 'avg correlation, 1Y daily', null, true),
      stat('Stocks across pillars', f2(g1['Across pillars']), 'avg correlation, 1Y daily'),
      stat('Stocks within a pillar', f2(within), 'avg correlation, 1Y daily'),
      stat('Combined portfolio vol', pct(vComb), `vs ${pct(vStockAvg)} avg single stock, 1Y`),
    );
    document.getElementById('lede').replaceChildren(
      document.createTextNode('Over the last year, the three pillar ETFs had an average return correlation of just '),
      el('b', { textContent: f2(ec) }),
      document.createTextNode('. Holding all three cut annualised volatility to '),
      el('b', { textContent: pct(vComb) }),
      document.createTextNode(', against '),
      el('b', { textContent: pct(vStockAvg) }),
      document.createTextNode(' for the average single stock.'),
    );

    // ETF growth
    lineChart(document.getElementById('etf-perf'), [...ETFS, COMBINED].map((e) => ({
      name: e.name, color: sectorColor(e.sector), dash: e.id === COMBINED.id ? '5 4' : null,
      label: (e.id === COMBINED.id ? 'Combined' : e.sector) + ' ' + d3.format('.0f')(prices[prices.length - 1][e.id]),
      points: prices.map((p) => ({ x: parse(p.date), y: p[e.id] })),
    })), { yFmt: d3.format('.0f'), yTip: d3.format('.1f'), yMin: 50, refY: 100, endLabels: true, height: 400, head: (d) => fmtDay(d) });

    // ETF correlation + risk
    const c = drawMatrix(document.getElementById('etf-corr'), ETF_IDS, corrMatrix('1Y', 'daily', ETF_IDS), { maxCell: 80, head: '1Y · daily returns' });
    document.getElementById('etf-risk').replaceChildren(
      ...ETFS.map((e) => stat(e.sector + ' ETF', pct(annVol(e.id, 252)), 'annualised vol, 1Y', sectorColor(e.sector))),
      stat('All three combined', pct(vComb), `vs ${pct(vEtfAvg)} avg ETF`, null, true));

    // grouped bars
    const box = document.getElementById('ov-bars'); const card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const H = 280, groups = [...SECTORS, 'Across pillars'], wins = ['3M', '6M', '1Y', '2Y'];
    const data = wins.flatMap((w) => { const gc = groupCorr(w, 'daily'); return groups.map((gname) => ({ w, g: gname, v: gc[gname] })); });
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const y = d3.scaleLinear([Math.min(0, d3.min(data, (d) => d.v)), Math.max(0.7, d3.max(data, (d) => d.v))], [H - 46, 10]).nice();
    const left = d3.max(y.ticks(5), (t) => measure(svg, t.toFixed(1))) + 10;
    const x0 = d3.scaleBand(wins, [left, W - 6]).paddingInner(0.25).paddingOuter(0.1);
    const x1 = d3.scaleBand(groups, [0, x0.bandwidth()]).padding(0.12);
    const col = (gname) => (gname === 'Across pillars' ? cssVar('--fg') : sectorColor(gname));
    for (const t of y.ticks(5)) {
      svg.append('line').attr('x1', left).attr('x2', W - 6).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === 0 ? 'var(--axis)' : 'var(--grid)');
      svg.append('text').attr('class', 'tick').attr('x', left - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(t.toFixed(1));
    }
    const wl = { '3M': 'Last 3 months', '6M': 'Last 6 months', '1Y': 'Last year', '2Y': 'Last 2 years' };
    for (const w of wins) svg.append('text').attr('class', 'tick').attr('x', x0(w) + x0.bandwidth() / 2).attr('y', H - 30).attr('text-anchor', 'middle').text(W < 480 ? w : wl[w]);
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => x0(d.w) + x1(d.g)).attr('width', x1.bandwidth())
      .attr('y', (d) => y(Math.max(0, d.v))).attr('height', (d) => Math.abs(y(d.v) - y(0))).attr('rx', 3).attr('fill', (d) => col(d.g))
      .on('pointermove pointerdown', (event, d) => showTip(card, event, wl[d.w] + ' · daily returns', [{ color: col(d.g), name: d.g === 'Across pillars' ? 'Across pillars' : 'Within ' + d.g, value: f2(d.v) }]))
      .on('pointerleave', () => hideTip(card));
    svg.attr('height', H - 22).attr('viewBox', `0 0 ${W} ${H - 22}`);
    legendItems(box, groups.map((gname) => ({ color: col(gname), label: gname })));

    // stock growth
    lineChart(document.getElementById('ov-perf'), STOCKS.map((s) => ({ name: s.name, color: colorOf(s.id), label: s.name,
      points: prices.filter((p) => p[s.id] != null).map((p) => ({ x: parse(p.date), y: p[s.id] })) })),
    { yFmt: d3.format('.0f'), yTip: d3.format('.1f'), yMin: 0, refY: 100, endLabels: W > 520, head: (d) => fmtDay(d) });

    const g2 = groupCorr('2Y', 'weekly');
    document.getElementById('ov-finding').textContent =
      `The pattern holds with weekly returns over two years: stocks within a pillar averaged ${f2(d3.mean(SECTORS, (s) => g2[s]))} correlation against ${f2(g2['Across pillars'])} across pillars, and the pillar ETFs averaged ${f2(etfCorr('2Y', 'weekly'))} with each other. Banking is the most tightly linked pillar inside; Oil & Energy is the strongest diversifier, moving almost independently of Banking and Industry.`;
  }

  /* ---------- volatility ---------- */
  function drawTable() {
    const S = [...summary];
    const ord = (r) => (r.id === COMBINED.id ? 999 : (r.etf ? 500 : 0) + SECTORS.indexOf(r.sector) * 10 + TABLE_IDS.indexOf(r.id));
    S.sort((a, b) => {
      let va = a[state.sortKey], vb = b[state.sortKey];
      if (state.sortKey === 'sector') { va = ord(a); vb = ord(b); }
      if (va == null) return 1; if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * state.sortDir;
    });
    document.querySelectorAll('#vol-table th').forEach((th) => th.setAttribute('aria-sort', th.querySelector('button').dataset.sort === state.sortKey ? (state.sortDir > 0 ? 'ascending' : 'descending') : 'none'));
    document.querySelector('#vol-table tbody').replaceChildren(...S.map((r) => {
      const tr = el('tr'); tr.dataset.key = r.id;
      const td = (txt, cls) => el('td', { textContent: txt, className: cls || '' });
      const name = td('', 'l'); const sw = el('i', { className: 'dot' }); sw.style.cssText = `margin-right:8px;background:${colorOf(r.id)}`;
      name.append(sw, r.etf ? el('b', { textContent: r.name }) : document.createTextNode(r.name));
      tr.append(name, td(r.sector === 'All' ? 'All pillars' : r.sector, 'l muted'),
        td(r.ret_total == null ? '–' : signedPct(r.ret_total), r.ret_total > 0 ? 'pos' : 'neg'),
        td(r.ret_last == null ? '–' : signedPct(r.ret_last), r.ret_last > 0 ? 'pos' : r.ret_last < 0 ? 'neg' : ''),
        td(r.vol_last == null ? '–' : pct(r.vol_last)),
        td(r.vol_chg == null ? '–' : pts(r.vol_chg), r.vol_chg > 0 ? 'up' : r.vol_chg < 0 ? 'down' : ''),
        td(r.vol_avg52 == null ? '–' : pct(r.vol_avg52)),
        td(r.vol_max52 == null ? '–' : pct(r.vol_max52)));
      return tr;
    }));
  }
  document.querySelectorAll('#vol-table th button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sort;
    if (state.sortKey === k) state.sortDir = -state.sortDir; else { state.sortKey = k; state.sortDir = (k === 'name' || k === 'sector') ? 1 : -1; }
    drawTable();
  }));
  document.querySelector('#vol-table tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-key]'); if (!tr) return;
    state.selected = (state.selected && state.selected.length === 1 && state.selected[0] === tr.dataset.key) ? null : [tr.dataset.key];
    drawChips(); drawVolLines();
    document.getElementById('card-vol-lines').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const CHIP_IDS = [...IDS, ...ETF_IDS];
  function drawChips() {
    const on = state.selected || IDS;
    document.getElementById('stock-chips').replaceChildren(...CHIP_IDS.map((id) => {
      const b = el('button', { className: 'chip' }); b.dataset.t = id;
      b.setAttribute('aria-pressed', on.includes(id) ? 'true' : 'false');
      const i = el('i', { className: 'dot' }); i.style.background = colorOf(id);
      b.append(i, document.createTextNode(byId[id].name)); return b;
    }));
    const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const sel = state.selected;
    const pil = sel == null ? 'All' : same(sel, ETF_IDS) ? 'ETFs' : SECTORS.find((p) => same(sel, STOCKS.filter((s) => s.sector === p).map((s) => s.id)));
    document.querySelectorAll('#sector-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.p === pil ? 'true' : 'false'));
  }
  document.getElementById('stock-chips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    let on = state.selected ? [...state.selected] : [...IDS];
    on = on.includes(b.dataset.t) ? on.filter((x) => x !== b.dataset.t) : [...on, b.dataset.t];
    if (!on.length) on = [b.dataset.t];
    state.selected = (on.length === IDS.length && on.every((x) => IDS.includes(x))) ? null : on;
    drawChips(); drawVolLines();
  });
  document.getElementById('sector-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]'); if (!b) return;
    const p = b.dataset.p;
    state.selected = p === 'All' ? null : p === 'ETFs' ? [...ETF_IDS] : STOCKS.filter((s) => s.sector === p).map((s) => s.id);
    drawChips(); drawVolLines();
  });

  function drawVolLines() {
    const on = state.selected || IDS;
    lineChart(document.getElementById('vol-lines'), on.map((t) => ({
      name: byId[t].name, color: colorOf(t),
      points: weeklyVol.filter((r) => r.id === t).map((r) => ({ x: parse(r.week_end), y: r.vol })),
    })), { yFmt: pct0, yTip: pct, head: (d) => 'Week ending ' + fmtDay(d) });
  }

  /* volatility heatmap: one row per stock and pillar ETF, one column per month (or week),
     green = calm, red = turbulent, relative to the whole table (10th to 90th percentile) */
  const monthlyVol = (() => {
    const g = new Map();
    for (const x of returns) {
      const k = x.date.slice(0, 7) + '|' + x.id;
      if (!g.has(k)) g.set(k, { period: x.date.slice(0, 7), id: x.id, rs: [] });
      g.get(k).rs.push(x.r);
    }
    const out = [];
    for (const o of g.values()) {
      const n = o.rs.length; if (n < 8) continue;   // skip months with fewer than 8 trading days
      const s = d3.sum(o.rs), m = s / n;
      out.push({ period: o.period, id: o.id, vol: Math.sqrt(d3.sum(o.rs, (b) => (b - m) ** 2) / (n - 1) * 252), ret: Math.exp(s) - 1, days: n });
    }
    return out;
  })();
  function drawHeat() {
    const box = document.getElementById('vol-heat'); const card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const monthly = state.heatRes !== 'week';
    document.querySelectorAll('#heat-seg button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.r === 'week') !== monthly)));
    const rowsIds = [];
    for (const sec of SECTORS) { rowsIds.push(...STOCKS.filter((s) => s.sector === sec).map((s) => s.id)); rowsIds.push(ETFS.find((e) => e.sector === sec).id); }
    const V = (monthly ? monthlyVol : weeklyVol.map((r) => ({ ...r, period: r.week }))).filter((r) => rowsIds.includes(r.id));
    const cols = [...new Set(V.map((r) => r.period))].sort();
    const avg = new Map(rowsIds.map((id) => [id, d3.mean(V.filter((r) => r.id === id), (r) => r.vol)]));
    const sorted = V.map((r) => r.vol).sort(d3.ascending);
    const lo = d3.quantile(sorted, 0.1), mid = d3.quantile(sorted, 0.5), hi = d3.quantile(sorted, 0.9);
    const col = (v) => volRamp(Math.max(0, Math.min(1, v <= mid ? 0.5 * (v - lo) / (mid - lo) : 0.5 + 0.5 * (v - mid) / (hi - mid))));
    const hn = W < 520;
    const rowLab = (id) => (hn ? (byId[id].etf ? code(id) + ' ETF' : code(id)) : byId[id].name);
    const rowH = monthly ? (hn ? 24 : 30) : (hn ? 18 : 22), top = 4, gapAfterEtf = 8;
    const yPos = new Map(); let yy = top;
    rowsIds.forEach((id) => { yPos.set(id, yy); yy += rowH + (byId[id].etf ? gapAfterEtf : 0); });
    const H = yy + 24;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const left = d3.max(rowsIds, (id) => measure(svg, rowLab(id))) + 12;
    const avgW = hn ? 34 : 46;
    const x = d3.scaleBand(cols, [left, W - avgW - 8]).paddingInner(monthly ? 0.06 : 0.1);
    const cellH = rowH - 3, showText = monthly && x.bandwidth() >= 24;
    for (const id of rowsIds) svg.append('text').attr('class', 'tick').attr('x', left - 8).attr('y', yPos.get(id) + cellH / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
      .style('font-weight', byId[id].etf ? 600 : null).style('fill', byId[id].etf ? 'var(--fg)' : null).text(rowLab(id));
    const tipFor = (d) => [{ name: byId[d.id].name, value: pct(d.vol) + ' annualised' }, { name: monthly ? 'Month return' : 'Week return', value: signedPct(d.ret) }, { name: 'Trading days', value: String(d.days) },
      { name: 'Its 2-year average', value: pct(avg.get(d.id)) }];
    const g = svg.append('g').selectAll('g').data(V).join('g').attr('transform', (d) => `translate(${x(d.period)},${yPos.get(d.id)})`);
    g.append('rect').attr('width', x.bandwidth()).attr('height', cellH).attr('rx', Math.min(3, x.bandwidth() / 3)).attr('fill', (d) => col(d.vol));
    if (showText) g.append('text').attr('x', x.bandwidth() / 2).attr('y', cellH / 2).attr('dy', '0.34em').attr('text-anchor', 'middle')
      .style('font-size', x.bandwidth() >= 34 ? '11px' : '9.5px').style('font-variant-numeric', 'tabular-nums').style('pointer-events', 'none')
      .style('fill', (d) => inkFor(col(d.vol))).text((d) => Math.round(d.vol * 100));
    g.on('pointermove pointerdown', (event, d) => showTip(card, event, monthly ? d3.utcFormat('%B %Y')(parse(d.period + '-01')) : 'Week ending ' + fmtDay(parse(d.week_end)), tipFor(d)))
      .on('pointerleave', () => hideTip(card));
    // average column
    const ax = W - avgW - 2;
    svg.append('text').attr('class', 'tick').attr('x', ax + avgW / 2).attr('y', H - 8).attr('text-anchor', 'middle').style('font-weight', 600).text('Avg');
    for (const id of rowsIds) {
      const v = avg.get(id), y0 = yPos.get(id);
      svg.append('rect').attr('x', ax).attr('y', y0).attr('width', avgW).attr('height', cellH).attr('rx', 3).attr('fill', col(v)).attr('stroke', 'var(--fg)').attr('stroke-opacity', 0.35);
      svg.append('text').attr('x', ax + avgW / 2).attr('y', y0 + cellH / 2).attr('dy', '0.34em').attr('text-anchor', 'middle').style('font-size', '11px').style('font-weight', 600)
        .style('font-variant-numeric', 'tabular-nums').style('fill', inkFor(col(v))).text(Math.round(v * 100));
    }
    // x labels: every month (or every month start in weekly view), with the year on January and the first column
    const starts = cols.filter((c, i) => i === 0 || c.slice(0, 7) !== cols[i - 1].slice(0, 7));
    const step = Math.max(1, Math.ceil(starts.length / Math.max(2, Math.floor((W - left - avgW) / (monthly ? 46 : 56)))));
    starts.forEach((c, i) => {
      if (i % step) return; const d = parse(c.slice(0, 7) + '-01');
      svg.append('text').attr('class', 'tick').attr('x', x(c) + (monthly ? x.bandwidth() / 2 : 0)).attr('y', H - 8).attr('text-anchor', monthly ? 'middle' : 'start')
        .text(d3.utcFormat(i === 0 || d.getUTCMonth() === 0 ? "%b %y" : '%b')(d));
    });
    const ramp = el('span', { className: 'ramp' });
    ramp.style.background = `linear-gradient(90deg, ${d3.range(0, 1.001, 0.125).map(volRamp).join(', ')})`;
    document.getElementById('heat-legend').replaceChildren(
      el('span', { textContent: `calm ≤ ${pct0(lo)}` }), ramp, el('span', { textContent: `${pct0(hi)}+ turbulent` }),
      el('span', { className: 'muted', textContent: ` · middle ${pct0(mid)} · numbers are annualised volatility in %` }));
  }

  function drawSectorVol() {
    lineChart(document.getElementById('sector-lines'), ETFS.map((e) => {
      const p = weeklyVol.filter((r) => r.id === e.id).map((r) => ({ x: parse(r.week_end), y: r.vol }));
      return { name: e.name, color: sectorColor(e.sector), points: p, label: e.sector + ' ' + pct0(p[p.length - 1].y) };
    }), { yFmt: pct0, yTip: pct, endLabels: true, head: (d) => 'Week ending ' + fmtDay(d) });
  }

  /* ---------- correlation tab ---------- */
  document.getElementById('heat-seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-r]'); if (b) { state.heatRes = b.dataset.r; drawHeat(); } });
  document.getElementById('level-seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-l]'); if (b) { state.level = b.dataset.l; drawCorr(); drawRoll(); } });
  document.getElementById('win-seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-w]'); if (b) { state.win = b.dataset.w; drawCorr(); } });
  document.getElementById('freq-seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (b) { state.freq = b.dataset.f; drawCorr(); } });

  function drawCorr() {
    document.querySelectorAll('#level-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.l === state.level ? 'true' : 'false'));
    document.querySelectorAll('#win-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.w === state.win ? 'true' : 'false'));
    document.querySelectorAll('#freq-seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === state.freq ? 'true' : 'false'));
    const ids = state.level === 'stocks' ? IDS : ETF_IDS;
    const c = drawMatrix(document.getElementById('corr-matrix'), ids, corrMatrix(state.win, state.freq, ids), {
      blocks: state.level === 'stocks', maxCell: state.level === 'stocks' ? 54 : 90, pair: state.pair[state.level],
      head: state.win + ' · ' + state.freq + ' returns', onPick: (p) => { state.pair[state.level] = p; drawCorr(); drawRoll(); } });
    if (c) legend('corr-legend', c);
    const gc = groupCorr(state.win, state.freq);
    document.getElementById('corr-stats').replaceChildren(
      stat('Between pillar ETFs', f2(etfCorr(state.win, state.freq)), 'avg correlation', null, true),
      stat('Stocks across pillars', f2(gc['Across pillars']), 'avg correlation'),
      ...SECTORS.map((s) => stat('Within ' + s, f2(gc[s]), 'avg stock correlation', sectorColor(s))));
    drawPairLists(ids, corrMatrix(state.win, state.freq, ids));
  }

  /* right panel: the pairs that move together most and least, for the selected window */
  function drawPairLists(ids, C) {
    const pairs = C.filter((d) => ids.indexOf(d.a) < ids.indexOf(d.b) && d.rho != null).sort((p, q) => q.rho - p.rho);
    const few = pairs.length <= 6;
    const item = (d) => {
      const li = el('li'), b = el('button', { type: 'button', className: 'pair-btn' });
      const sel = state.pair[state.level]; if (sel[0] === d.a && sel[1] === d.b) b.setAttribute('aria-current', 'true');
      const v = el('span', { className: 'pair-v', textContent: f2(d.rho) }); v.style.background = corrColor(d.rho); v.style.color = inkFor(corrColor(d.rho));
      b.append(v, el('span', { textContent: shortName(d.a) + ' × ' + shortName(d.b) }));
      b.addEventListener('click', () => { state.pair[state.level] = [d.a, d.b]; drawCorr(); drawRoll(); });
      li.appendChild(b); return li;
    };
    document.getElementById('pairs-hi-label').textContent = few ? 'All pairs, highest first' : 'Move together most';
    document.getElementById('pairs-hi').replaceChildren(...(few ? pairs : pairs.slice(0, 5)).map(item));
    document.getElementById('pairs-lo-wrap').hidden = few;
    if (!few) document.getElementById('pairs-lo').replaceChildren(...pairs.slice(-5).reverse().map(item));
    document.getElementById('pairs-note').textContent = `${state.win} window, ${state.freq} returns. Click a pair to chart it above.`;
  }

  function drawRoll() {
    const [a, b] = state.pair[state.level];
    document.getElementById('roll-title').textContent = 'Rolling correlation: ' + byId[a].name + ' × ' + byId[b].name;
    const p = rolling(a, b);
    const ymin = Math.min(-0.2, d3.min(p, (d) => d.y) ?? 0);
    lineChart(document.getElementById('corr-roll'), [{ name: 'Correlation', color: '#f3efe6', points: p, width: 2.2 }],
      { yFmt: d3.format('.1f'), yTip: d3.format('.2f'), yDomain: [ymin, 1], refY: 0, head: (d) => '63 days to ' + fmtDay(d), height: 260,
        bands: [{ from: ymin, to: 0.3, color: '#66bd63' }, { from: 0.3, to: 0.55, color: '#fee08b' }, { from: 0.55, to: 1, color: '#f46d43' }] });
    const cur = corrMatrix(state.win, state.freq, state.level === 'stocks' ? IDS : ETF_IDS).find((d) => d.a === a && d.b === b);
    const ys = p.map((d) => d.y), last = ys[ys.length - 1];
    const tag = (v) => (v == null ? '' : v < 0.3 ? 'diversifying' : v < 0.55 ? 'moderate' : 'moving together');
    document.getElementById('pair-stats').replaceChildren(
      stat('Last 3 months', f2(last), tag(last), last == null ? null : corrColor(last), true),
      stat(`${state.win} ${state.freq}`, f2(cur && cur.rho), tag(cur && cur.rho), cur && cur.rho != null ? corrColor(cur.rho) : null),
      stat('Range, 3-month windows', ys.length ? `${f2(d3.min(ys))} – ${f2(d3.max(ys))}` : '–', 'lowest to highest'),
      stat('Average', f2(d3.mean(ys)), 'of all 3-month windows'));
  }

  /* ---------- shared toolkit for other tabs (assets/risk.js) ---------- */
  window.DashKit = { lineChart, legendItems, showTip, hideTip, measure, el, stat, cssVar, sectorColor, colorOf, byId, STOCKS, SECTORS, ETFS, fmtDay, parse, pct, f2 };

  /* ---------- tabs + redraw ---------- */
  function drawAll() {
    if (state.tab === 'overview') drawOverview();
    else if (state.tab === 'vol') { drawTable(); drawChips(); drawVolLines(); drawHeat(); drawSectorVol(); }
    else if (state.tab === 'corr') { drawCorr(); drawRoll(); }
    else if (state.tab === 'risk' && window.RiskTab) window.RiskTab.draw();
    else if (state.tab === 'thesis' && window.ThesisTab) window.ThesisTab.draw();
    else if (state.tab === 'ltrisk' && window.LTRiskTab) window.LTRiskTab.draw();
    else if (state.tab === 'crises' && window.CrisisTab) window.CrisisTab.draw();
  }
  function showTab(name) {
    state.tab = name;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false'));
    document.querySelectorAll('.page').forEach((s) => { s.hidden = s.id !== 'page-' + name; });
    history.replaceState(null, '', '#' + name);
    drawAll();
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.addEventListener('click', (e) => { const a = e.target.closest('a[data-goto]'); if (!a) return; e.preventDefault(); showTab(a.dataset.goto); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawAll, 150); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawAll);
  const h = location.hash.slice(1);
  showTab(['overview', 'thesis', 'vol', 'corr', 'risk', 'ltrisk', 'crises'].includes(h) ? h : 'overview');
})();
