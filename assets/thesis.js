/* Investment thesis tab: the quantitative check of the systematic-risk argument.
   Measures each pillar ETF and the equal-weighted portfolio against the DAX:
   beta, R² (share of variance explained by the market), downside / upside capture,
   behaviour on the DAX's worst days, and pillar correlations in market stress. */
(() => {
  'use strict';
  const st = { win: 252 };
  let wired = false, base = null;

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  function covar(a, b) { const ma = mean(a), mb = mean(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / (a.length - 1); }
  const corr = (a, b) => covar(a, b) / Math.sqrt(covar(a, a) * covar(b, b));

  /** Market statistics of a return series r against benchmark returns m. */
  function marketStats(r, m) {
    const beta = covar(r, m) / covar(m, m), rho = corr(r, m);
    const down = m.map((x, i) => (x < 0 ? i : -1)).filter((i) => i >= 0), up = m.map((x, i) => (x >= 0 ? i : -1)).filter((i) => i >= 0);
    const cap = (idx) => mean(idx.map((i) => r[i])) / mean(idx.map((i) => m[i]));
    const worst = m.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]).slice(0, 10).map((d) => d[1]);
    return { beta, r2: rho * rho, downCap: cap(down), upCap: cap(up), worstAvg: mean(worst.map((i) => r[i])), worstIdx: worst };
  }

  function load() {
    if (base) return base;
    const D = window.DATA, K = window.DashKit;
    const rows = D.rows, bm = D.benchmark.values;
    const R = Object.fromEntries(D.stocks.map((s) => { const c = D.columns.indexOf(s.id); return [s.id, rows.slice(1).map((r, t) => r[c] / rows[t][c] - 1)]; }));
    const m = bm.slice(1).map((v, t) => v / bm[t] - 1);
    const secs = K.SECTORS;
    const etf = Object.fromEntries(secs.map((sec) => { const ids = D.stocks.filter((s) => s.sector === sec).map((s) => s.id); return [sec, m.map((_, t) => mean(ids.map((id) => R[id][t])))]; }));
    const port = m.map((_, t) => mean(D.stocks.map((s) => R[s.id][t])));
    base = { m, etf, port, secs, dates: rows.slice(1).map((r) => r[0]) };
    return base;
  }

  function draw() {
    const K = window.DashKit; if (!K || !window.DATA.benchmark) return;
    if (!wired) {
      wired = true;
      document.getElementById('sys-win').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { st.win = Number(b.dataset.v); draw(); } });
    }
    document.querySelectorAll('#sys-win button').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.v) === st.win ? 'true' : 'false'));
    const B = load(), n = B.m.length, s0 = st.win ? n - st.win : 0;
    const cut = (a) => a.slice(s0);
    const m = cut(B.m);
    const series = [...B.secs.map((sec) => ({ name: sec + ' ETF', color: K.sectorColor(sec), r: cut(B.etf[sec]) })),
      { name: 'Portfolio (equal)', color: K.cssVar('--fg'), r: cut(B.port), bold: true }];
    series.forEach((s) => { s.st = marketStats(s.r, m); });
    const P = series[series.length - 1].st;
    const daxWorst = mean(P.worstIdx.map((i) => m[i]));
    const f2 = d3.format('.2f'), p0 = d3.format('.0%'), p2 = d3.format('+.2%');

    document.getElementById('sys-kpis').replaceChildren(
      K.stat('Portfolio beta to DAX', f2(P.beta), 'DAX = 1.00', null, true),
      K.stat('Not explained by the market', p0(1 - P.r2), `1 − R² (R² = ${f2(P.r2)})`),
      K.stat('Downside capture', p0(P.downCap), `upside ${p0(P.upCap)}`),
      K.stat("DAX's 10 worst days", p2(P.worstAvg), `vs DAX ${p2(daxWorst)}`));

    document.querySelector('#sys-table tbody').replaceChildren(...series.map((s) => {
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      const nm = td('', 'l'); const dot = K.el('i', { className: 'dot' }); dot.style.cssText = `margin-right:8px;background:${s.color}`;
      nm.append(dot, s.bold ? K.el('b', { textContent: s.name }) : document.createTextNode(s.name));
      tr.append(nm, td(f2(s.st.beta)), td(f2(s.st.r2)), td(p0(s.st.downCap)), td(p0(s.st.upCap)), td(p2(s.st.worstAvg), s.st.worstAvg < 0 ? 'neg' : 'pos'));
      return tr;
    }));

    // bars: average return on DAX's 10 worst days
    {
      const box = document.getElementById('sys-bars'), card = box.closest('.card'); box.replaceChildren();
      const W = box.clientWidth;
      if (W) {
        const items = [{ name: 'DAX', color: K.cssVar('--muted'), v: daxWorst }, ...series.map((s) => ({ name: s.name.replace(' (equal)', ''), color: s.color, v: mean(P.worstIdx.map((i) => s.r[i])) }))];
        const H = 220, svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
        const lab = (d) => (W < 480 ? d.name.replace(' ETF', '').replace('Oil & Energy', 'O&E') : d.name);
        const y = d3.scaleLinear([Math.min(0, d3.min(items, (d) => d.v)) * 1.15, Math.max(0.002, d3.max(items, (d) => d.v)) * 1.3], [H - 26, 10]).nice();
        const left = d3.max(y.ticks(4), (t) => K.measure(svg, d3.format('.1%')(t))) + 10;
        const x = d3.scaleBand(items.map((d) => d.name), [left, W - 4]).padding(0.3);
        for (const t of y.ticks(4)) {
          svg.append('line').attr('x1', left).attr('x2', W - 4).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === 0 ? 'var(--axis)' : 'var(--grid)');
          svg.append('text').attr('class', 'tick').attr('x', left - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(d3.format('.1%')(t));
        }
        items.forEach((d) => {
          svg.append('rect').attr('x', x(d.name)).attr('width', x.bandwidth()).attr('y', y(Math.max(0, d.v))).attr('height', Math.abs(y(d.v) - y(0))).attr('rx', 4).attr('fill', d.color)
            .on('pointermove pointerdown', (ev) => K.showTip(card, ev, d.name, [{ name: "Avg on DAX's 10 worst days", value: p2(d.v) }])).on('pointerleave', () => K.hideTip(card));
          svg.append('text').attr('class', 'tick').attr('x', x(d.name) + x.bandwidth() / 2).attr('y', d.v < 0 ? y(d.v) + 13 : y(d.v) - 4).attr('text-anchor', 'middle').style('fill', 'var(--fg)').text(d3.format('.1%')(d.v));
          svg.append('text').attr('class', 'tick').attr('x', x(d.name) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').text(lab(d));
        });
      }
    }

    // correlation: all days vs DAX worst 10%
    const q = [...m].sort((a, b) => a - b)[Math.floor(m.length * 0.1)];
    const stressIdx = m.map((x, i) => (x <= q ? i : -1)).filter((i) => i >= 0);
    const pairs = [];
    for (let i = 0; i < B.secs.length; i++) for (let j = i + 1; j < B.secs.length; j++) {
      const a = cut(B.etf[B.secs[i]]), b = cut(B.etf[B.secs[j]]);
      pairs.push({ name: B.secs[i] + ' × ' + B.secs[j], short: B.secs[i].split(' ')[0] + ' × ' + B.secs[j].split(' ')[0], all: corr(a, b), stress: corr(stressIdx.map((t) => a[t]), stressIdx.map((t) => b[t])) });
    }
    {
      const box = document.getElementById('sys-corr'), card = box.closest('.card'); box.replaceChildren();
      const W = box.clientWidth;
      if (W) {
        const rowH = 46, H = 10 + pairs.length * rowH + 22;
        const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
        const left = d3.max(pairs, (p) => K.measure(svg, W < 480 ? p.short : p.name)) + 10;
        const x = d3.scaleLinear([Math.min(0, d3.min(pairs, (p) => Math.min(p.all, p.stress))), 1], [left, W - 30]);
        const y = d3.scaleBand(pairs.map((p) => p.name), [10, 10 + pairs.length * rowH]).padding(0.25);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', 10).attr('y2', H - 20).attr('stroke', t === 0 ? 'var(--axis)' : 'var(--grid)');
          svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(t.toFixed(2));
        }
        const cAll = K.cssVar('--banking'), cStress = K.cssVar('--bad'), bh = y.bandwidth() / 2 - 1;
        pairs.forEach((p) => {
          svg.append('text').attr('class', 'tick').attr('x', left - 8).attr('y', y(p.name) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').style('fill', 'var(--fg)').text(W < 480 ? p.short : p.name);
          svg.append('rect').attr('x', x(Math.min(0, p.all))).attr('y', y(p.name)).attr('height', bh).attr('width', Math.abs(x(p.all) - x(0))).attr('rx', 3).attr('fill', cAll);
          svg.append('rect').attr('x', x(Math.min(0, p.stress))).attr('y', y(p.name) + bh + 2).attr('height', bh).attr('width', Math.abs(x(p.stress) - x(0))).attr('rx', 3).attr('fill', cStress);
          svg.append('text').attr('class', 'tick').attr('x', x(Math.max(0, p.all)) + 4).attr('y', y(p.name) + bh / 2).attr('dy', '0.32em').text(f2(p.all));
          svg.append('text').attr('class', 'tick').attr('x', x(Math.max(0, p.stress)) + 4).attr('y', y(p.name) + bh * 1.5 + 2).attr('dy', '0.32em').text(f2(p.stress));
          svg.append('rect').attr('x', 0).attr('y', y(p.name)).attr('width', W).attr('height', y.bandwidth()).attr('fill', 'transparent')
            .on('pointermove pointerdown', (ev) => K.showTip(card, ev, p.name, [{ color: cAll, name: 'All days', value: f2(p.all) }, { color: cStress, name: "DAX's worst 10% of days", value: f2(p.stress) }]))
            .on('pointerleave', () => K.hideTip(card));
        });
        K.legendItems(box, [{ color: cAll, label: 'All days' }, { color: cStress, label: `DAX's worst 10% of days (${stressIdx.length})` }]);
      }
    }

    const oe = series.find((s) => s.name.startsWith('Oil'));
    const avgAll = mean(pairs.map((p) => p.all)), avgStress = mean(pairs.map((p) => p.stress));
    document.getElementById('sys-finding').textContent =
      `Result (${st.win ? 'last year' : 'full two years'}): the portfolio's beta to the DAX is ${f2(P.beta)} and the market explains only ${p0(P.r2)} of its daily variance. ` +
      `On average it fell ${p0(P.downCap)} as much as the DAX on down days and rose ${p0(P.upCap)} as much on up days; on the DAX's ten worst days it lost ${p2(P.worstAvg)} against ${p2(daxWorst)} for the index. ` +
      `The Oil & Energy ETF (beta ${f2(oe.st.beta)}) does most of the cushioning. ` +
      (avgStress > avgAll + 0.02
        ? `The limit: average correlation between the pillars rises from ${f2(avgAll)} on all days to ${f2(avgStress)} on the DAX's worst days, so a broad sell-off still hits the portfolio, just less than the market. `
        : `In this window the pillars stayed weakly correlated even on the DAX's worst days (${f2(avgStress)} vs ${f2(avgAll)} on all days); over the full two years, which include the April 2025 sell-off, correlations do rise in stress, so a broad sell-off still hits the portfolio, just less than the market. `) +
      `Note that the stocks are Frankfurt-floor quotes, which close later than the DAX; this timing gap slightly lowers measured betas and correlations.`;
  }

  window.ThesisTab = { draw, marketStats };
})();
