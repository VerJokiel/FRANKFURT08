/* DAX market page, daily layer: index, market map, movers, internals, sectors, rates.
   Plain JS + d3 v7, no build step. Data: window.DAX40 from data/dax40.js (daily closes,
   refreshed after each Xetra session by .github/workflows/update-dax40.yml).
   During the session, assets/dax-live.js calls DaxDaily.applyLive() with the latest 5-minute
   prices; they are added as a provisional row for today and every view below is rebuilt. */
(() => {
  const D = window.DAX40;
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  if (!D || !D.dates || !D.dates.length) {
    $('dx-empty').hidden = false;
    document.querySelectorAll('[data-needs-data]').forEach((n) => { n.hidden = true; });
    window.DaxDaily = null;
    return;
  }

  /* ---------- formatting ---------- */
  const parse = (s) => new Date(s + 'T00:00:00Z');
  const pct = d3.format('.1%'), pct0 = d3.format('.0%');
  const signed = (v, d = 1) => (v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%');
  const bp = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v * 100)) + ' bp';
  const pts = d3.format(',.0f'), eur = d3.format(',.2f');
  const fmtDay = d3.utcFormat('%-d %b %Y');
  const fmtClock = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  const tone = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const cssVar = (n) => getComputedStyle(document.querySelector('.page') || document.documentElement).getPropertyValue(n).trim();
  const SECTOR_COL = ['#d6b062', '#9fcb9b', '#a3b8de', '#7fd1d8', '#b3bccb', '#e8c79a', '#c7a8e8', '#e9a6c5', '#f2948a'];
  const secColor = (s) => SECTOR_COL[D.sectors.indexOf(s) % SECTOR_COL.length];

  /* ---------- statistics ---------- */
  const MEM = D.members;                                    // [{tk, name, sector, weight, cap}]
  const N = MEM.length;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  const annVol = (a) => sd(a) * Math.sqrt(252);
  const tail = (a, n) => a.slice(Math.max(1, a.length - n));
  const quant = (s, p) => { const h = (s.length - 1) * p, lo = Math.floor(h); return s[lo] + (s[Math.ceil(h)] - s[lo]) * (h - lo); };
  const sma = (a, n, t) => (t < n - 1 ? null : mean(a.slice(t - n + 1, t + 1)));
  // average pairwise correlation: for standardised returns z, the sum of all pairwise ρ equals Var(Σz)
  function avgCorrOf(series, cols) {
    const n = cols.length, win = series[cols[0]].length; if (n < 2 || win < 3) return null;
    const sum = new Float64Array(win);
    for (const j of cols) { const a = series[j], m = mean(a), s = sd(a) || 1e-12; for (let k = 0; k < win; k++) sum[k] += (a[k] - m) / s; }
    return (sd(Array.from(sum)) ** 2 - n) / (n * (n - 1));
  }

  /* ---------- model: everything the views show, rebuilt when live prices arrive ---------- */
  function buildModel(live) {
    const dates = D.dates.slice(), dax = D.dax.slice(), rows = D.rows.map((r) => r.slice());
    let provisional = null;
    if (live && live.session > D.asof && live.prev_date === D.asof && live.last.DAX) {
      const ratio = (tk) => (live.last[tk] && live.prev_close[tk] ? live.last[tk] / live.prev_close[tk] : 1);
      dates.push(live.session);
      dax.push(dax[dax.length - 1] * ratio('DAX'));
      rows.push(MEM.map((m, j) => rows[rows.length - 1][j] * ratio(m.tk)));
      provisional = { time: new Date(live.lastTime * 1000), missing: MEM.filter((m) => !live.last[m.tk]).map((m) => m.tk) };
    }
    const DATES = dates.map(parse), T = DATES.length;
    const px = MEM.map((_, j) => rows.map((r) => r[j]));
    const lr = px.map((p) => p.map((v, t) => (t ? Math.log(v / p[t - 1]) : 0)));
    const rDax = dax.map((v, t) => (t ? Math.log(v / dax[t - 1]) : 0));
    const ytdIndex = (() => { const yr = DATES[T - 1].getUTCFullYear(); let i = T - 1; while (i > 0 && DATES[i].getUTCFullYear() === yr) i--; return i; })();
    const PERIODS = {
      '1d': { label: provisional ? 'Today' : '1 day', from: T - 2, range: 0.03 },
      '1w': { label: '1 week', from: T - 6, range: 0.05 },
      '1m': { label: '1 month', from: T - 22, range: 0.10 },
      'ytd': { label: 'Year to date', from: ytdIndex, range: 0.30 },
      '1y': { label: '1 year', from: T - 253, range: 0.40 },
    };
    const chg = (a, from) => a[T - 1] / a[Math.max(0, from)] - 1;

    let peak = -Infinity; const dd = dax.map((v) => { peak = Math.max(peak, v); return v / peak - 1; });
    const r1y = tail(rDax, 252).map((x) => Math.exp(x) - 1).sort((a, b) => a - b);
    const vol21 = (t) => (t < 21 ? null : annVol(rDax.slice(t - 20, t + 1)));
    const stock = MEM.map((m, j) => {
      const p = px[j], o = { ...m, j, last: p[T - 1] };
      for (const k in PERIODS) o[k] = chg(p, PERIODS[k].from);
      const yr = p.slice(-252); o.hi = d3.max(yr); o.lo = d3.min(yr);
      const before = p.slice(-252, -10);
      o.newHi = d3.max(p.slice(-10)) >= d3.max(before); o.newLo = d3.min(p.slice(-10)) <= d3.min(before);
      return o;
    });
    const above = (n) => DATES.map((d, t) => {
      if (t < n - 1) return { x: d, y: null };
      let up = 0; for (let j = 0; j < N; j++) { const p = px[j]; let s = 0; for (let k = t - n + 1; k <= t; k++) s += p[k]; if (p[t] > s / n) up++; }
      return { x: d, y: up / N };
    });
    const ALL = MEM.map((_, j) => j);
    const corrAt = (t, win, cols) => avgCorrOf(lr.map((a) => a.slice(t - win + 1, t + 1)), cols);
    const corrSeries = [];
    for (let t = T - 1; t >= 63; t -= 3) corrSeries.unshift({ x: DATES[t], y: corrAt(t, 63, ALL) });
    const sectors = D.sectors.map((s) => {
      const cols = ALL.filter((j) => MEM[j].sector === s); if (!cols.length) return null;
      const w = d3.sum(cols, (j) => MEM[j].weight), lvl = [100];
      for (let t = 1; t < T; t++) lvl.push(lvl[t - 1] * (1 + d3.sum(cols, (j) => MEM[j].weight / w * (px[j][t] / px[j][t - 1] - 1))));
      const o = { s, cols, w, vol: annVol(tail(lvl.map((v, t) => (t ? Math.log(v / lvl[t - 1]) : 0)), 252)), corr: T > 253 ? corrAt(T - 1, 252, cols) : null };
      for (const k in PERIODS) o[k] = chg(lvl, PERIODS[k].from);
      return o;
    }).filter(Boolean).sort((a, b) => b.w - a.w);

    return {
      provisional, DATES, T, dax, rDax, px, lr, PERIODS, ytdIndex, chg, dd, vol21, stock, sectors, corrSeries,
      hi52: d3.max(dax.slice(-252)), lo52: d3.min(dax.slice(-252)),
      var99: -quant(r1y, 0.01), es975: -mean(r1y.filter((x) => x <= quant(r1y, 0.025))),
      vol1y: annVol(tail(rDax, 252)), ma200: dax.map((_, t) => sma(dax, 200, t)),
      above50: above(50), above200: above(200),
      adv: stock.filter((s) => s['1d'] > 0).length, dec: stock.filter((s) => s['1d'] < 0).length,
      dispSeries: DATES.map((d, t) => ({ x: d, y: t < 21 ? null : sd(px.map((p) => p[t] / p[t - 21] - 1)) })),
    };
  }
  let M = buildModel(null);

  /* ---------- tooltips and charts ---------- */
  function showTip(card, event, head, lines) {
    let t = card.querySelector(':scope > .tip'); if (!t) { t = el('div', { className: 'tip' }); card.appendChild(t); }
    t.replaceChildren(el('div', { className: 'h', textContent: head }));
    for (const l of lines) {
      const r = el('div', { className: 'r' });
      if (l.color) { const i = el('i', { className: 'dot' }); i.style.background = l.color; r.appendChild(i); }
      r.append(el('span', { textContent: l.name }), el('span', { textContent: l.value }));
      t.appendChild(r);
    }
    t.hidden = false;
    const b = card.getBoundingClientRect(), tw = t.offsetWidth;
    let x = event.clientX - b.left + 14; if (x + tw > b.width - 8) x = event.clientX - b.left - tw - 14;
    t.style.left = Math.max(8, x) + 'px'; t.style.top = (event.clientY - b.top + 14) + 'px';
  }
  const hideTip = (card) => { const t = card.querySelector(':scope > .tip'); if (t) t.hidden = true; };
  function measure(svg, text) { const t = svg.append('text').attr('class', 'tick').text(text); const w = t.node().getComputedTextLength(); t.remove(); return w; }

  /* line chart over dates: series [{name, color, points:[{x,y}], dash, area, step}] */
  function lineChart(box, series, o) {
    const card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const H = W < 520 ? Math.round((o.height || 240) * 0.82) : (o.height || 240);
    const all = series.flatMap((s) => s.points).filter((d) => d.y != null);
    if (!all.length) return;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const y = d3.scaleLinear(o.yDomain || [o.yMin ?? d3.min(all, (d) => d.y), o.yMax ?? d3.max(all, (d) => d.y)], [H - 26, 10]).nice();
    const ticks = y.ticks(5);
    const left = d3.max(ticks, (t) => measure(svg, o.yFmt(t))) + 10, right = 10;
    const x = d3.scaleUtc(d3.extent(all, (d) => d.x), [left, W - right]);
    const g = svg.append('g');
    for (const t of ticks) {
      g.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--grid)');
      g.append('text').attr('class', 'tick').attr('x', left - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(o.yFmt(t));
    }
    for (const t of x.ticks(Math.max(2, Math.floor((W - left - right) / 80)))) {
      const p = x(t); if (p < left + 18 || p > W - right - 18) continue;
      g.append('text').attr('class', 'tick').attr('x', p).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.utcFormat('%b %y')(t));
    }
    g.append('line').attr('x1', left).attr('x2', W - right).attr('y1', H - 26).attr('y2', H - 26).attr('stroke', 'var(--axis)');
    if (o.refY != null && o.refY >= y.domain()[0] && o.refY <= y.domain()[1]) {
      g.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(o.refY)).attr('y2', y(o.refY)).attr('stroke', 'var(--ref)').attr('stroke-dasharray', '4 3');
      if (o.refLabel) g.append('text').attr('class', 'tick').attr('x', W - right).attr('y', y(o.refY) - 5).attr('text-anchor', 'end').text(o.refLabel);
    }
    for (const s of series) {
      const curve = s.step ? d3.curveStepAfter : d3.curveLinear;
      if (s.area) svg.append('path').datum(s.points).attr('fill', s.color).attr('fill-opacity', 0.2)
        .attr('d', d3.area().curve(curve).defined((d) => d.y != null).x((d) => x(d.x)).y0(y(Math.max(y.domain()[0], Math.min(0, y.domain()[1])))).y1((d) => y(d.y)));
      svg.append('path').datum(s.points).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.width || 2)
        .attr('stroke-dasharray', s.dash || null).attr('stroke-linejoin', 'round')
        .attr('d', d3.line().curve(curve).defined((d) => d.y != null).x((d) => x(d.x)).y((d) => y(d.y)));
    }
    const last = series[0].points.filter((d) => d.y != null).at(-1);
    svg.append('circle').attr('cx', x(last.x)).attr('cy', y(last.y)).attr('r', 3.5).attr('fill', series[0].color);
    const rule = svg.append('line').attr('y1', 10).attr('y2', H - 26).attr('stroke', 'var(--axis)').attr('opacity', 0);
    const dots = svg.append('g');
    const times = [...new Set(all.map((d) => +d.x))].sort((a, b) => a - b);
    const near = (s, t) => { let best = null; for (const p of s.points) { if (p.y == null || +p.x > t) continue; best = p; } return best; };
    svg.append('rect').attr('x', left).attr('width', Math.max(0, W - left - right)).attr('height', H).attr('fill', 'transparent')
      .on('pointermove pointerdown', (event) => {
        const tv = +x.invert(d3.pointer(event)[0]); let i = d3.bisectLeft(times, tv);
        if (i >= times.length || (i > 0 && tv - times[i - 1] < times[i] - tv)) i -= 1;
        const t = times[i]; rule.attr('x1', x(t)).attr('x2', x(t)).attr('opacity', 1); dots.selectAll('*').remove();
        const lines = [];
        for (const s of series) {
          const p = near(s, t); if (!p) continue;
          dots.append('circle').attr('cx', x(p.x)).attr('cy', y(p.y)).attr('r', 3.5).attr('fill', s.color);
          lines.push({ color: series.length > 1 ? s.color : null, name: s.name, value: (s.fmt || o.yTip)(p.y) });
        }
        showTip(card, event, fmtDay(new Date(t)), lines);
      })
      .on('pointerleave', () => { rule.attr('opacity', 0); dots.selectAll('*').remove(); hideTip(card); });
    if (series.length > 1) {
      const wrap = el('div', { className: 'legend-items' });
      for (const s of series) {
        const sp = el('span'), sw = el('i'); sw.style.background = s.dash ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` : s.color;
        sp.append(sw, document.createTextNode(s.name)); wrap.appendChild(sp);
      }
      box.appendChild(wrap);
    }
  }

  function stat(label, value, sub, cls, accent) {
    const d = el('div', { className: 'stat' + (accent ? ' accent' : '') });
    d.append(el('div', { className: 'k', textContent: label }), el('div', { className: 'v' + (cls ? ' ' + cls : ''), textContent: value }),
      el('div', { className: 's', textContent: sub }));
    return d;
  }

  /* ---------- sections ---------- */
  function drawFreshness() {
    const { DATES, T, provisional } = M;
    const built = new Date(D.built.replace('Z', ':00Z'));
    $('dx-asof').textContent = provisional
      ? `Today's figures use 5-minute prices up to ${fmtClock(provisional.time)} Frankfurt time (Yahoo delays Xetra quotes by about 15 minutes); longer periods use daily closes to ${fmtDay(parse(D.asof))}.`
      : `Last close ${fmtDay(DATES[T - 1])}. Daily data updated ${d3.utcFormat('%-d %b %Y, %H:%M UTC')(built)} from ${D.sources.prices}${D.sources.fallback ? ' and ' + D.sources.fallback : ''}.`;
    const age = Math.floor((Date.now() - parse(D.asof)) / 864e5);
    const warn = $('dx-stale');
    warn.hidden = age <= 4;
    if (!warn.hidden) warn.textContent = `The daily data is ${age} days old. The daily update job may have failed; check the repository's Actions tab.`;
    const miss = (D.missing || []).map((x) => x.name);
    $('dx-missing').hidden = !miss.length;
    if (miss.length) $('dx-missing').textContent = `No data for ${miss.join(', ')} in this update; ${N} of ${N + miss.length} members shown.`;
  }

  function drawStats() {
    const { dax, T, chg, ytdIndex, DATES, vol21, vol1y, hi52, lo52, var99, es975, adv, dec, ma200, above50, above200, corrSeries, provisional } = M;
    const box = $('dx-stats'); box.replaceChildren();
    const d1 = dax[T - 1] / dax[T - 2] - 1;
    box.append(
      stat(provisional ? `DAX at ${fmtClock(provisional.time)}` : 'DAX close', pts(dax[T - 1]),
        `${signed(d1, 2)} ${provisional ? 'today' : 'on the day'} (${d1 >= 0 ? '+' : '−'}${pts(Math.abs(dax[T - 1] - dax[T - 2]))} pts)`, null, true),
      stat('1 month', signed(chg(dax, T - 22)), 'last 21 sessions', tone(chg(dax, T - 22))),
      stat('Year to date', signed(chg(dax, ytdIndex)), 'since ' + fmtDay(DATES[ytdIndex]), tone(chg(dax, ytdIndex))),
      stat('1 year', signed(chg(dax, T - 253)), 'last 252 sessions', tone(chg(dax, T - 253))),
      stat('Volatility, 1 month', pct(vol21(T - 1)), '1-year average ' + pct(vol1y)),
      stat('Off 52-week high', dax[T - 1] >= hi52 ? 'At high' : signed(dax[T - 1] / hi52 - 1), `range ${pts(lo52)} – ${pts(hi52)}`),
      stat('1-day VaR 99%', pct(var99), 'ES 97.5% ' + pct(es975) + ', last year'),
      stat('Breadth', `${adv} / ${dec}`, `members up / down ${provisional ? 'today' : 'on the day'}`),
    );
    const corrNow = corrSeries.at(-1).y, corrYear = corrSeries.filter((d) => d.x >= DATES[Math.max(0, T - 252)]).map((d) => d.y);
    $('dx-read').textContent = `The DAX is ${pct(Math.abs(dax[T - 1] / ma200[T - 1] - 1))} ${dax[T - 1] > ma200[T - 1] ? 'above' : 'below'} its 200-day average. ` +
      `${pct0(above50[T - 1].y)} of members trade above their 50-day average and ${pct0(above200[T - 1].y)} above their 200-day average. ` +
      `Stocks are moving ${corrNow > 0.45 ? 'closely together' : corrNow > 0.3 ? 'moderately together' : 'fairly independently'} ` +
      `(average correlation ${corrNow.toFixed(2)} over three months of daily returns, against ${d3.min(corrYear).toFixed(2)}–${d3.max(corrYear).toFixed(2)} in the past year).`;
  }

  let period = '1d';
  function drawMap() {
    const { PERIODS, sectors, stock } = M;
    const box = $('dx-map'); box.replaceChildren();
    const card = box.closest('.card');
    const W = box.clientWidth; if (!W) return;
    const H = W < 520 ? 520 : 440;
    const R = PERIODS[period].range;
    const color = d3.scaleLinear([-R, -R / 4, 0, R / 4, R], ['#c0463a', '#8a4a4a', '#34476a', '#3f7a58', '#47a26a']).clamp(true).interpolate(d3.interpolateRgb);
    const root = d3.hierarchy({ children: sectors.map((s) => ({ name: s.s, sec: s, children: s.cols.map((j) => ({ st: stock[j], value: stock[j].weight })) })) })
      .sum((d) => d.value || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([W, H]).paddingOuter(2).paddingTop((d) => (d.depth === 1 ? 18 : 0)).paddingInner(1.5).round(true)(root);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', `DAX members sized by index weight, coloured by ${PERIODS[period].label} return`);
    for (const s of root.children) {
      svg.append('rect').attr('x', s.x0).attr('y', s.y0).attr('width', s.x1 - s.x0).attr('height', s.y1 - s.y0).attr('fill', 'rgba(243,239,230,.05)').attr('rx', 3);
      if (s.x1 - s.x0 > 60) svg.append('text').attr('x', s.x0 + 5).attr('y', s.y0 + 13).attr('class', 'tick').style('fill', secColor(s.data.name))
        .text(`${s.data.name} ${signed(s.data.sec[period])}`).each(function () { const w = s.x1 - s.x0 - 10; while (this.getComputedTextLength() > w && this.textContent.length > 4) this.textContent = this.textContent.slice(0, -2) + '…'; });
    }
    const leaf = svg.selectAll('g.leaf').data(root.leaves()).join('g').attr('class', 'leaf').attr('transform', (d) => `translate(${d.x0},${d.y0})`);
    leaf.append('rect').attr('width', (d) => d.x1 - d.x0).attr('height', (d) => d.y1 - d.y0).attr('rx', 2).attr('fill', (d) => color(d.data.st[period]));
    leaf.each(function (d) {
      const w = d.x1 - d.x0, h = d.y1 - d.y0, g = d3.select(this), big = w > 70 && h > 46;
      if (w < 30 || h < 18) return;
      g.append('text').attr('x', w / 2).attr('y', h / 2 - (h > 32 ? 6 : -4)).attr('text-anchor', 'middle').style('fill', '#f3efe6')
        .style('font-size', big ? '14px' : '10.5px').style('font-weight', 600).text(d.data.st.tk);
      if (h > 32) g.append('text').attr('x', w / 2).attr('y', h / 2 + (big ? 13 : 10)).attr('text-anchor', 'middle').style('fill', '#f3efe6')
        .style('font-size', big ? '12px' : '10px').style('font-variant-numeric', 'tabular-nums').text(signed(d.data.st[period]));
    });
    leaf.on('pointermove', (event, d) => {
      const s = d.data.st;
      showTip(card, event, `${s.name} · ${s.sector}`, [
        { name: M.provisional ? 'Price' : 'Close', value: '€' + eur(s.last) }, { name: PERIODS[period].label, value: signed(s[period], 2) },
        { name: 'Index weight', value: pct(s.weight) }, { name: '52-week range', value: `€${eur(s.lo)} – €${eur(s.hi)}` }]);
    }).on('pointerleave', () => hideTip(card));
    $('dx-map-scale').replaceChildren(el('span', { textContent: signed(-R, 0) }),
      Object.assign(el('span', { className: 'ramp' }), { style: `background:linear-gradient(90deg,${d3.range(0, 1.01, 0.25).map((k) => color(-R + 2 * R * k)).join(',')})` }),
      el('span', { textContent: signed(R, 0) }), el('span', { textContent: ' · size = index weight' }));
    const b1 = document.querySelector('#dx-period button[data-p="1d"]'); if (b1) b1.textContent = PERIODS['1d'].label;
  }

  function drawMovers() {
    const { stock, PERIODS } = M;
    const sorted = stock.slice().sort((a, b) => b[period] - a[period]);
    const fill = (id, list) => $(id).querySelector('tbody').replaceChildren(...list.map((s) => {
      const tr = el('tr');
      const nm = el('td', { className: 'l' }); nm.append(el('b', { textContent: s.tk + ' ' }), el('span', { className: 'muted', textContent: s.name }));
      tr.append(nm, el('td', { textContent: '€' + eur(s.last) }), el('td', { className: tone(s[period]), textContent: signed(s[period]) }));
      return tr;
    }));
    fill('dx-up', sorted.slice(0, 5));
    fill('dx-down', sorted.slice(-5).reverse());
    document.querySelectorAll('.dx-period').forEach((n) => { n.textContent = PERIODS[period].label.toLowerCase(); });
  }

  function drawInternals() {
    const { stock, adv, dec, above50, above200, T, provisional } = M;
    const near = stock.filter((s) => s.last >= 0.95 * s.hi).length, hi = stock.filter((s) => s.newHi).length, lo = stock.filter((s) => s.newLo).length;
    const rows = [
      [`Members up / down ${provisional ? 'today' : 'on the day'}`, `${adv} / ${dec}`, adv / N],
      ['Above 50-day average', pct0(above50[T - 1].y), above50[T - 1].y],
      ['Above 200-day average', pct0(above200[T - 1].y), above200[T - 1].y],
      ['Within 5% of 52-week high', String(near), near / N],
      ['New 52-week high, last 10 sessions', String(hi), hi / N],
      ['New 52-week low, last 10 sessions', String(lo), lo / N],
    ];
    $('dx-breadth-table').querySelector('tbody').replaceChildren(...rows.map(([k, v, f]) => {
      const tr = el('tr'), bar = el('td', { className: 'l' }), b = el('span', { className: 'minibar' }), i = el('i');
      i.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; b.appendChild(i); bar.appendChild(b);
      tr.append(el('td', { className: 'l', textContent: k }), el('td', { textContent: v }), bar);
      return tr;
    }));
  }

  function drawCharts() {
    const { DATES, dax, ma200, dd, vol21, vol1y, above50, above200, corrSeries, dispSeries } = M;
    const fg = cssVar('--fg'), gold = cssVar('--accent'), muted = cssVar('--muted'), bad = cssVar('--bad'), ok = cssVar('--ok'), neg = cssVar('--neg');
    lineChart($('dx-level'), [
      { name: 'DAX', color: gold, points: DATES.map((d, t) => ({ x: d, y: dax[t] })) },
      { name: '200-day average', color: muted, dash: '5 4', width: 1.5, points: DATES.map((d, t) => ({ x: d, y: ma200[t] })) },
    ], { yFmt: pts, yTip: (v) => pts(v) + ' pts', height: 260 });
    lineChart($('dx-dd'), [{ name: 'Below running peak', color: bad, area: true, width: 1.5, points: DATES.map((d, t) => ({ x: d, y: dd[t] })) }],
      { yMax: 0, yFmt: pct0, yTip: (v) => signed(v), height: 200 });
    lineChart($('dx-vol'), [{ name: '21-day realised vol', color: fg, points: DATES.map((d, t) => ({ x: d, y: vol21(t) })) }],
      { yMin: 0, yFmt: pct0, yTip: pct, refY: vol1y, refLabel: '1-year average ' + pct(vol1y), height: 200 });
    lineChart($('dx-breadth'), [
      { name: 'Above 50-day average', color: ok, points: above50 },
      { name: 'Above 200-day average', color: neg, points: above200 },
    ], { yDomain: [0, 1], yFmt: pct0, yTip: pct0, refY: 0.5, height: 220 });
    lineChart($('dx-corr'), [{ name: 'Average correlation', color: gold, points: corrSeries }],
      { yMin: 0, yFmt: d3.format('.1f'), yTip: d3.format('.2f'), height: 200 });
    lineChart($('dx-disp'), [{ name: 'Dispersion of 1-month returns', color: fg, points: dispSeries }],
      { yMin: 0, yFmt: pct0, yTip: pct, height: 200 });
    drawMacroCharts();
  }

  function drawSectors() {
    const keys = ['1d', '1m', 'ytd', '1y'];
    const th = document.querySelector('#dx-sectors thead th:nth-child(4)'); if (th) th.textContent = M.PERIODS['1d'].label;
    $('dx-sectors').querySelector('tbody').replaceChildren(...M.sectors.map((s) => {
      const tr = el('tr'), nm = el('td', { className: 'l' }), i = el('i', { className: 'dot' });
      i.style.background = secColor(s.s); i.style.marginRight = '8px'; nm.append(i, document.createTextNode(s.s));
      tr.append(nm, el('td', { textContent: String(s.cols.length) }), el('td', { textContent: pct(s.w) }),
        ...keys.map((k) => el('td', { className: tone(s[k]), textContent: signed(s[k]) })),
        el('td', { textContent: pct(s.vol) }), el('td', { textContent: s.corr == null ? '–' : s.corr.toFixed(2) }));
      return tr;
    }));
  }

  /* ---------- rates and currency (ECB) ---------- */
  const MAC = D.macro || {};
  const mser = (k) => (MAC[k] ? MAC[k].dates.map((d, i) => ({ x: parse(d), y: MAC[k].values[i] })) : null);
  function monthAgo(s) { const t = +s.at(-1).x - 30 * 864e5; let p = s[0]; for (const d of s) if (+d.x <= t) p = d; return p; }
  function drawMacro() {
    const box = $('dx-macro-stats'); box.replaceChildren();
    const y10 = mser('y10'), dfr = mser('dfr'), fx = mser('eurusd');
    if (!y10 && !dfr && !fx) { $('dx-macro').hidden = true; return; }
    if (dfr) { const a = monthAgo(dfr); box.append(stat('ECB deposit rate', dfr.at(-1).y.toFixed(2) + '%', `${dfr.at(-1).y === a.y ? 'unchanged' : bp(dfr.at(-1).y - a.y)} vs a month ago · ${fmtDay(dfr.at(-1).x)}`)); }
    if (y10) { const a = monthAgo(y10); box.append(stat('10-year AAA yield', y10.at(-1).y.toFixed(2) + '%', `${bp(y10.at(-1).y - a.y)} vs a month ago · ${fmtDay(y10.at(-1).x)}`)); }
    if (fx) { const a = monthAgo(fx); box.append(stat('EUR/USD', fx.at(-1).y.toFixed(4), `${signed(fx.at(-1).y / a.y - 1, 1)} vs a month ago · ${fmtDay(fx.at(-1).x)}`)); }
    if (y10 && dfr) { const s = y10.at(-1).y - dfr.at(-1).y; box.append(stat('Curve: 10y minus deposit rate', bp(s), s > 0 ? 'upward-sloping' : 'inverted')); }
  }
  function drawMacroCharts() {
    const y10 = mser('y10'), dfr = mser('dfr'), fx = mser('eurusd');
    const rates = [y10 && { name: '10-year AAA yield', color: cssVar('--accent'), points: y10 }, dfr && { name: 'ECB deposit rate', color: cssVar('--muted'), step: true, width: 1.5, points: dfr }].filter(Boolean);
    if (rates.length) lineChart($('dx-rates'), rates, { yFmt: (v) => v.toFixed(1) + '%', yTip: (v) => v.toFixed(2) + '%', height: 220 });
    if (fx) lineChart($('dx-fx'), [{ name: 'EUR/USD', color: cssVar('--fg'), points: fx }], { yFmt: d3.format('.2f'), yTip: d3.format('.4f'), height: 220 });
  }

  /* ---------- wiring ---------- */
  function renderLive() { drawFreshness(); drawStats(); drawMap(); drawMovers(); drawInternals(); drawSectors(); drawCharts(); }
  document.querySelectorAll('#dx-period button').forEach((b) => b.addEventListener('click', () => {
    period = b.dataset.p;
    document.querySelectorAll('#dx-period button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawMap(); drawMovers();
  }));
  $('dx-weights').textContent = D.weights;
  drawMacro();
  renderLive();
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawMap(); drawCharts(); }, 150); });

  window.DaxDaily = {
    members: MEM, sectors: D.sectors, secColor, asof: D.asof,
    get model() { return M; },
    /* live = {session, prev_date, lastTime, last:{tk: price}, prev_close:{tk: price}} */
    applyLive(live) { M = buildModel(live); renderLive(); return !!M.provisional; },
  };
})();
