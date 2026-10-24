/* =====================================================================
   Fan charts: percentile bands of simulated portfolio value over time.
   Used by the Short-term risk tab (next month, resampled daily returns)
   and the Long-term risk tab (1 or 5 years, block bootstrap).

   FanChart.percentiles(paths, qs)  -> per checkpoint, the requested quantiles
   FanChart.draw(box, opts)         -> SVG fan chart (uses window.DashKit)
   ===================================================================== */
(() => {
  'use strict';
  /** paths: array of Float64Array (one per path) of growth factors at each checkpoint. */
  function percentiles(paths, qs) {
    const n = paths.length, k = paths[0].length, out = qs.map(() => new Array(k));
    const col = new Float64Array(n);
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < n; i++) col[i] = paths[i][j];
      col.sort();
      qs.forEach((q, m) => { const h = (n - 1) * q, lo = Math.floor(h), hi = Math.ceil(h); out[m][j] = col[lo] + (h - lo) * (col[hi] - col[lo]); });
    }
    return out;
  }
  /** Mean of the values at or below the q-quantile, at the last checkpoint (expected shortfall level). */
  function tailMean(paths, q) {
    const last = paths.map((p) => p[p.length - 1]).sort((a, b) => a - b);
    const h = (last.length - 1) * q, lo = Math.floor(h), v = last[lo] + (h - lo) * (last[Math.ceil(h)] - last[lo]);
    const tail = last.filter((x) => x <= v);
    return tail.reduce((s, x) => s + x, 0) / tail.length;
  }

  /**
   * opts: {
   *   xs: checkpoint times (trading days, starting with 0),
   *   bands: {q: [values...]} growth factors per checkpoint incl. t=0 (=1),
   *   V: start value (€), alpha: confidence level,
   *   tail: growth factors of the (1-alpha) quantile, es: expected-shortfall growth at the end,
   *   samples: [[growth...]] a few sample paths, compare: {name, median, tail} optional,
   *   xFmt: (days) => label, height, markers: [{x, g, label, color}]
   * }
   */
  function draw(box, o) {
    const K = window.DashKit, card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const H = o.height || (W < 520 ? 260 : 340);
    const V = o.V, xs = o.xs;
    const all = [o.bands[0.01] || o.bands[0.05], o.bands[0.99] || o.bands[0.95], o.tail, o.compare ? o.compare.tail : []].flat().concat([o.es]).filter((x) => x != null);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const y = d3.scaleLinear([Math.max(0, d3.min(all) * V * 0.97), d3.max(all) * V * 1.03], [H - 26, 10]).nice();
    const fmtE = (v) => (Math.abs(v) >= 1e6 ? d3.format(',.3s')(v) : d3.format(',.0f')(v)) + ' €';
    const left = d3.max(y.ticks(5), (t) => K.measure(svg, fmtE(t))) + 10;
    const endMarkers = (o.markers || []).filter((m) => m.x === xs[xs.length - 1]);
    const right = W < 520 ? 12 : Math.min(W * 0.32, Math.max(12, ...endMarkers.map((m) => K.measure(svg, m.label) + 16)));
    const x = d3.scaleLinear([xs[0], xs[xs.length - 1]], [left, W - right]);
    for (const t of y.ticks(5)) {
      svg.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--grid)');
      svg.append('text').attr('class', 'tick').attr('x', left - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmtE(t));
    }
    const xt = o.xTicks || x.ticks(Math.max(2, Math.floor((W - left - right) / 80)));
    for (const t of xt) svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(o.xFmt(t));
    svg.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(V)).attr('y2', y(V)).attr('stroke', 'var(--ref)').attr('stroke-dasharray', '4 3');
    const base = K.cssVar('--accent');
    const area = (lo, hi) => d3.area().x((_, i) => x(xs[i])).y0((_, i) => y(lo[i] * V)).y1((_, i) => y(hi[i] * V));
    const pairs = [[0.01, 0.99, 0.10], [0.05, 0.95, 0.16], [0.10, 0.90, 0.22], [0.25, 0.75, 0.34]].filter(([a, b]) => o.bands[a] && o.bands[b]);
    for (const [a, b, op] of pairs) svg.append('path').datum(xs).attr('d', area(o.bands[a], o.bands[b])).attr('fill', base).attr('opacity', op);
    const line = (arr) => d3.line().x((_, i) => x(xs[i])).y((_, i) => y(arr[i] * V));
    for (const s of o.samples || []) svg.append('path').datum(s).attr('d', line(s)).attr('fill', 'none').attr('stroke', 'var(--fg)').attr('stroke-width', 0.6).attr('opacity', 0.18);
    if (o.compare) {
      svg.append('path').datum(o.compare.median).attr('d', line(o.compare.median)).attr('fill', 'none').attr('stroke', 'var(--muted)').attr('stroke-width', 1.5).attr('stroke-dasharray', '5 4');
      svg.append('path').datum(o.compare.tail).attr('d', line(o.compare.tail)).attr('fill', 'none').attr('stroke', 'var(--muted)').attr('stroke-width', 1.2).attr('stroke-dasharray', '2 3');
    }
    svg.append('path').datum(o.bands[0.5]).attr('d', line(o.bands[0.5])).attr('fill', 'none').attr('stroke', 'var(--fg)').attr('stroke-width', 2);
    const tailC = K.cssVar('--bad');
    svg.append('path').datum(o.tail).attr('d', line(o.tail)).attr('fill', 'none').attr('stroke', tailC).attr('stroke-width', 2).attr('stroke-dasharray', '6 3');
    // markers at chosen horizon(s): dots, plus labels pushed apart so they never overlap
    const labs = [];
    for (const m of o.markers || []) {
      const px = x(m.x), py = y(m.g * V);
      if (m.vline) svg.append('line').attr('x1', px).attr('x2', px).attr('y1', 10).attr('y2', H - 26).attr('stroke', 'var(--axis)').attr('stroke-dasharray', '2 3');
      svg.append('circle').attr('cx', px).attr('cy', py).attr('r', 4.5).attr('fill', m.color).attr('stroke', 'var(--panel)').attr('stroke-width', 1.5);
      labs.push({ m, px, py, ly: py });
    }
    if (W >= 520 && labs.length) {
      labs.sort((a, b) => a.py - b.py);
      for (let i = 1; i < labs.length; i++) if (labs[i].ly - labs[i - 1].ly < 15) labs[i].ly = labs[i - 1].ly + 15;
      const over = labs[labs.length - 1].ly - (H - 30); if (over > 0) labs.forEach((l) => { l.ly -= over; });
      for (const l of labs) {
        const t = svg.append('text').attr('class', 'tick').attr('y', l.ly).attr('dy', '0.32em').style('fill', l.m.color).style('font-weight', 600).style('paint-order', 'stroke').style('stroke', 'var(--panel)').style('stroke-width', 3).text(l.m.label);
        const tw = t.node().getComputedTextLength();
        const toLeft = l.px + 10 + tw > W - 2;
        t.attr('x', toLeft ? l.px - 10 - tw : l.px + 10);
        if (Math.abs(l.ly - l.py) > 3) svg.append('line').attr('x1', l.px + (toLeft ? -5 : 5)).attr('x2', toLeft ? l.px - 9 : l.px + 9).attr('y1', l.py).attr('y2', l.ly).attr('stroke', l.m.color).attr('stroke-width', 1);
      }
    }
    // hover
    const rule = svg.append('line').attr('y1', 10).attr('y2', H - 26).attr('stroke', 'var(--axis)').attr('opacity', 0);
    svg.append('rect').attr('x', left).attr('width', W - left - right).attr('height', H).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev) => {
        const tv = x.invert(d3.pointer(ev)[0]); let i = d3.bisectLeft(xs, tv); if (i > 0 && (i >= xs.length || tv - xs[i - 1] < xs[i] - tv)) i -= 1; i = Math.max(0, Math.min(xs.length - 1, i));
        rule.attr('x1', x(xs[i])).attr('x2', x(xs[i])).attr('opacity', 1);
        const rows = [[0.95, '95th percentile'], [0.75, '75th'], [0.5, 'Median'], [0.25, '25th'], [0.05, '5th']].filter(([q]) => o.bands[q])
          .map(([q, n]) => ({ name: n, value: fmtE(o.bands[q][i] * V) }));
        rows.push({ color: tailC, name: `Worst ${d3.format('.1~%')(1 - o.alpha)} boundary`, value: fmtE(o.tail[i] * V) });
        if (o.compare) rows.push({ color: K.cssVar('--muted'), name: `${o.compare.name} median`, value: fmtE(o.compare.median[i] * V) });
        K.showTip(card, ev, o.xFmt(xs[i], true), rows);
      })
      .on('pointerleave', () => { rule.attr('opacity', 0); K.hideTip(card); });
    const leg = [
      { color: K.cssVar('--fg'), label: 'Median path' },
      { color: base, label: pairs.length === 4 ? 'Bands: 25–75, 10–90, 5–95, 1–99%' : 'Percentile bands' },
      { color: tailC, label: `Worst ${d3.format('.1~%')(1 - o.alpha)} boundary (VaR)`, dash: true },
    ];
    if (o.samples && o.samples.length) leg.push({ color: K.cssVar('--muted'), label: 'Sample paths' });
    if (o.compare) leg.push({ color: K.cssVar('--muted'), label: `${o.compare.name}: median / VaR boundary`, dash: true });
    K.legendItems(box, leg);
  }

  window.FanChart = { percentiles, tailMean, draw };
})();
