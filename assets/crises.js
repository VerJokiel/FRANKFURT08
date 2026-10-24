/* =====================================================================
   Crisis history tab: worst-case episodes since 2001, what happened,
   how each pillar behaved (computed from data/longterm.js), what a
   replay would cost today, and what the history implies for the
   portfolio. Uses LTCore (assets/ltrisk.js) for the data and the
   episode definitions.
   ===================================================================== */
(() => {
  'use strict';

  /* Narrative per episode. Facts are about markets and sectors; no company is named
     (the dashboard is anonymised). Figures in the cards come from the data. */
  const TEXT = {
    dotcom: {
      title: 'Dot-com bust, 9/11 and the 2002 bear market',
      what: 'The technology and telecom bubble that peaked in March 2000 deflated for three years. The 11 September 2001 attacks closed US markets for four trading days and hit insurers, airlines and banks; accounting scandals at large US companies in 2001–02 destroyed trust in reported earnings. German banks carried rising bad loans and large equity holdings, and the ECB cut rates to 2% by mid-2003. The DAX lost about two thirds of its value and bottomed in March 2003.',
      lesson: 'The one long bear market where the three pillars beat the index clearly: the DAX was full of technology and telecom stocks, while the pillars earn their money from credit, physical assets and energy, and oil rose during the slump. Even so, every pillar lost more than half its value: a valuation collapse eventually reaches everything.',
      sub: '911',
    },
    gfc: {
      title: 'Global financial crisis 2007–09',
      what: 'US subprime losses spread through securitised credit from mid-2007; in August 2007 interbank funding markets froze. After the Lehman Brothers bankruptcy on 15 September 2008 credit markets seized up worldwide. Germany set up a bank rescue fund (SoFFin) in October 2008, governments recapitalised and guaranteed banks across Europe, and the ECB cut its main rate to 1% by May 2009. Oil fell from a record of about $145 in July 2008 to the low $30s by the end of the year as the world economy went into recession.',
      lesson: 'The portfolio\'s worst episode and the clearest limit of the thesis. Banking, the pillar that finances the economy, was the epicentre and lost almost 90%; industry lost two thirds as orders collapsed; even energy halved as oil crashed. In a credit crisis all three pillars are hit through the same channel (credit and demand), and the portfolio needed far longer than the DAX to recover its 2007 level.',
      sub: 'lehman',
    },
    euro: {
      title: 'Euro sovereign debt crisis 2011',
      what: 'Doubts about the solvency of Greece spread in summer 2011 to Italy and Spain, whose bond yields jumped. European banks held large amounts of these bonds, so the sovereign crisis became a bank crisis. On 5 August 2011 S&P downgraded the United States\' credit rating. Calm returned only with the ECB\'s long-term liquidity operations (December 2011, February 2012) and the "whatever it takes" pledge in July 2012.',
      lesson: 'A second financial crisis in which banking dominated the result: the bank pillar lost more than half while industry lost a quarter. Because banks are the pillar most exposed to government bonds and funding markets, the portfolio is structurally sensitive to sovereign and funding stress in Europe.',
    },
    oil: {
      title: 'Oil price collapse 2014–16',
      what: 'US shale output flooded the market and in November 2014 OPEC decided not to cut production. Oil fell from over $100 in mid-2014 to below $30 in early 2016. At the same time the ECB introduced negative deposit rates (June 2014), China devalued its currency (August 2015) and European bank shares sold off in early 2016. European utilities suffered from falling power prices and had to rebuild their business models around renewables and networks.',
      lesson: 'Oil & Energy fell as expected, but banking fell even more because negative rates squeezed margins and growth fears hit credit. Industry held up, which is the offset the thesis predicts. The episode shows that a single macro story rarely arrives alone: an energy shock overlapped with a rate and bank shock.',
    },
    brexit: {
      title: 'Brexit referendum, June 2016',
      what: 'The UK voted on 23 June 2016 to leave the European Union, against market expectations. On 24 June European bank shares had one of their worst days on record as investors priced lower rates, weaker growth and legal uncertainty for London-based activities.',
      lesson: 'A short political shock that went straight to the banks. Energy and industry fell much less. Losses were recovered within months, which is typical for political shocks that do not damage the credit system.',
    },
    'q4-2018': {
      title: 'Q4 2018 sell-off',
      what: 'Rising US interest rates, the US–China trade war and a dispute over the Italian budget produced a broad sell-off in the last quarter of 2018, with industrial and cyclical stocks hit by fears of a manufacturing slowdown.',
      lesson: 'Banking and industry, the two most cyclical pillars, fell together while energy held up. Trade-war and growth scares hit orders and credit at the same time; only the energy pillar diversified.',
    },
    covid: {
      title: 'COVID-19 crash, February–March 2020',
      what: 'As the pandemic reached Europe, markets fell faster than in any previous crash: the DAX lost almost 40% in four weeks. An OPEC+ price war in early March sent oil down sharply, and in April US crude futures briefly traded below zero. Central banks and governments responded at record speed (the ECB launched a €750 bn emergency purchase programme on 18 March).',
      lesson: 'A liquidity crash in which correlations went to one: all three pillars lost between 40% and 55%, more than the index, because the DAX also contains defensive and technology stocks that the portfolio does not hold. Diversification across these three pillars gave almost no protection in the first weeks; recovery came with policy support.',
    },
    ukraine: {
      title: 'Ukraine war, energy and inflation shock 2022',
      what: 'Russia invaded Ukraine on 24 February 2022. European gas and power prices rose to records in the summer, inflation reached multi-decade highs and the ECB started raising rates in July 2022, ending eight years of negative rates. Energy-intensive industry and growth stocks fell, while energy producers earned exceptional profits.',
      lesson: 'The textbook case for the three-pillar idea: energy rose while energy-hungry industry fell, and bank shares fell less than industry as higher rates promised better margins. The portfolio lost clearly less than the DAX and regained its level within about two months. Inflationary supply shocks are where revenue-driven, real-economy sectors protect best.',
    },
    'banks-2023': {
      title: 'Banking turmoil, March 2023',
      what: 'The failure of Silicon Valley Bank on 10 March 2023 and the forced takeover of Credit Suisse by UBS on 19 March triggered fears about bank funding and bond losses after the fastest rate rises in decades. European bank shares fell sharply within days, although no large euro-area bank failed.',
      lesson: 'A pure banking scare: the bank pillar lost a fifth in about a week, pulling the portfolio down twice as much as the DAX. With one of three pillars in banks, any bank-specific panic is a portfolio event.',
    },
    tariffs: {
      title: 'Tariff shock, April 2025',
      what: 'Broad US import tariffs announced on 2 April 2025 triggered a global sell-off; the DAX fell about 16% in a month. Markets rebounded after a 90-day pause on most tariffs was announced on 9 April.',
      lesson: 'Diversification worked: energy fell little, and the portfolio lost less than the DAX and regained its level within days. A trade shock that threatens global demand but not the credit system is cushioned by the mix.',
    },
  };
  const SUBTEXT = {
    '911': '11 September 2001: the DAX fell about 8.5% on the day. Over the following two weeks banks were hit hardest, industry least.',
    lehman: 'Lehman weeks (12 Sep – 21 Nov 2008): the most violent part of the crisis.',
  };

  const st = { value: 15000 };
  let built = false;

  function skeleton() {
    const page = document.getElementById('page-crises');
    page.innerHTML = `
      <div class="card thesis-hero">
        <p class="kicker">Crisis history 2001–2026</p>
        <p class="big-quote">What did the worst market episodes of the last 25 years do to banking, industry and energy, and what would they cost this portfolio today?</p>
      </div>
      <div class="card green" style="margin-top:16px">
        <h2>Why look back</h2>
        <p>Value at Risk estimated from one or two calm years says little about the losses that matter most. Risk desks therefore replay history: they take the market moves of past crises and apply them to today's positions. The ten episodes below cover the main types of shock since 2001: a valuation bust, two credit and bank crises, an oil-price collapse, political shocks, a pandemic crash, an energy and inflation shock and a trade war.</p>
        <p>Each episode is measured from the DAX's peak to its trough. The same dates are used for the three pillar ETFs and the equal-weighted portfolio, built from up to 25 years of daily prices on the primary listings (see Long-term risk for the data notes). Returns include dividends. Oil is the WTI crude future in US dollars.</p>
      </div>

      <h2 class="section-title">The episodes at a glance</h2>
      <div class="card" id="card-cr-table">
        <div class="controls"><label class="rc" style="flex-direction:row;align-items:center;gap:8px"><span class="label">Replay on a portfolio of (€)</span><input type="number" id="cr-value" min="100" step="100" value="15000" inputmode="decimal" style="max-width:9rem"></label></div>
        <div class="tablewrap"><table class="compact wrap-cells" id="cr-table"><thead><tr><th class="l">Episode</th><th class="l">DAX peak → trough</th><th>DAX</th><th>Portfolio</th><th>Banking</th><th>Industry</th><th>Oil &amp; Energy</th><th>Oil (WTI)</th><th>Replay today</th><th>Recovery: portfolio / DAX</th></tr></thead><tbody></tbody></table></div>
        <p class="note" style="margin-top:8px">Replay today = the episode's portfolio return applied to the amount above. Recovery = time from the trough until the series regained its level at the start of the episode.</p>
      </div>
      <div class="card green" id="card-cr-bars" style="margin-top:16px">
        <h2>Portfolio vs DAX in each episode</h2>
        <p class="note">Peak-to-trough return. Where the dark bar is shorter than the grey one, the portfolio protected better than the index.</p>
        <div class="box" id="cr-bars" style="min-height:360px"></div>
      </div>

      <h2 class="section-title">Episode by episode</h2>
      <div id="cr-cards"></div>

      <h2 class="section-title">What the history teaches</h2>
      <div class="card green" id="cr-lessons"></div>

      <h2 class="section-title">Implementation: making the portfolio more crisis-resistant</h2>
      <div class="card" id="card-cr-mix">
        <h2>Same episodes, different pillar weights</h2>
        <p class="note">Each mix holds the three pillar ETFs at fixed weights, rebalanced daily. Risk parity uses inverse 20-year volatility. The last mix drops banking and is shown only to measure what the banking pillar costs in crises.</p>
        <div class="tablewrap"><table class="compact" id="cr-mix-table"></table></div>
        <div class="tablewrap" style="margin-top:12px"><table class="compact" id="cr-mix-perf"></table></div>
        <p class="note" id="cr-mix-note" style="margin-top:8px"></p>
      </div>
      <div class="card green" style="margin-top:16px" id="cr-playbook"></div>
      <p class="method">Full write-up with sources: <code>docs/CRISIS_HISTORY.md</code>. The table can be reproduced with <code>python python/longterm_risk.py --crises</code>.</p>`;
    document.getElementById('cr-value').addEventListener('change', (e) => { const x = Number(e.target.value); if (x > 0) { st.value = x; draw(); } else e.target.value = st.value; });
  }

  const p1 = d3.format('.1%'), sp1 = (v) => (v == null ? '–' : (v > 0 ? '+' : '') + p1(v)), eur = (v) => d3.format(',.0f')(v) + ' €';
  const dur = (d) => { if (d == null) return 'not yet'; if (d < 21) return `${d} trading day${d === 1 ? '' : 's'}`; if (d < 252) { const m = Math.round(d / 21); return `${m} month${m === 1 ? '' : 's'}`; } return `${(d / 252).toFixed(1)} years`; };

  function draw() {
    const K = window.DashKit; if (!K || !window.LT || !window.LTCore) return;
    if (!built) { skeleton(); built = true; }
    const LC = window.LTCore, B = LC.build();
    const eps = LC.EPISODES.map((ep) => ({ ep, s: LC.episodeStats(B, ep), t: TEXT[ep.id] }));
    const subs = Object.fromEntries(LC.SUB_EVENTS.map((ep) => [ep.id, LC.episodeStats(B, ep)]));
    const cls = (v) => (v == null ? '' : v < 0 ? 'neg' : 'pos');
    const day = (d) => K.fmtDay(K.parse(d));

    // table
    document.querySelector('#cr-table tbody').replaceChildren(...eps.map(({ ep, s }) => {
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      const nm = td('', 'l'); const a = K.el('a', { href: '#cr-' + ep.id, textContent: ep.name }); nm.appendChild(a);
      tr.append(nm, td(`${day(s.peak)} → ${day(s.trough)}`, 'l muted'), td(sp1(s.DAX), cls(s.DAX)), td(sp1(s.Portfolio), cls(s.Portfolio)),
        td(sp1(s.Banking), cls(s.Banking)), td(sp1(s.Industry), cls(s.Industry)), td(sp1(s['Oil & Energy']), cls(s['Oil & Energy'])), td(sp1(s.oil), 'muted'),
        td(eur(s.Portfolio * st.value), 'neg'), td(`${dur(s.recPortfolio)} / ${dur(s.recDAX)}`));
      if (s.Portfolio > s.DAX) tr.style.background = 'color-mix(in srgb, var(--ok) 8%, transparent)';
      return tr;
    }));

    // grouped bars
    {
      const box = document.getElementById('cr-bars'), card = box.closest('.card'); box.replaceChildren();
      const W = box.clientWidth;
      if (W) {
        const rowH = 34, top = 4, H = top + eps.length * rowH + 22;
        const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
        const lab = (e) => (W < 520 ? e.ep.name.replace(' & 9/11', '').replace('Global financial crisis', 'Financial crisis').replace('Ukraine war & energy shock', 'Ukraine/energy 2022').replace('Banking turmoil', 'Banks') : e.ep.name);
        const left = d3.max(eps, (e) => K.measure(svg, lab(e))) + 10;
        const x = d3.scaleLinear([d3.min(eps, (e) => Math.min(e.s.Portfolio, e.s.DAX)) * 1.05, 0], [left, W - 46]);
        const y = d3.scaleBand(eps.map((e) => e.ep.id), [top, top + eps.length * rowH]).padding(0.2);
        for (const t of x.ticks(5)) {
          svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', top).attr('y2', H - 20).attr('stroke', t === 0 ? 'var(--axis)' : 'var(--grid)');
          svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.format('.0%')(t));
        }
        const bh = y.bandwidth() / 2 - 1, cP = K.cssVar('--fg'), cD = K.cssVar('--muted');
        eps.forEach((e) => {
          svg.append('text').attr('class', 'tick').attr('x', left - 8).attr('y', y(e.ep.id) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').style('fill', 'var(--fg)').text(lab(e));
          svg.append('rect').attr('x', x(e.s.Portfolio)).attr('y', y(e.ep.id)).attr('width', x(0) - x(e.s.Portfolio)).attr('height', bh).attr('rx', 3).attr('fill', cP);
          svg.append('rect').attr('x', x(e.s.DAX)).attr('y', y(e.ep.id) + bh + 2).attr('width', x(0) - x(e.s.DAX)).attr('height', bh).attr('rx', 3).attr('fill', cD).attr('opacity', 0.6);
          svg.append('text').attr('class', 'tick').attr('x', x(0) + 4).attr('y', y(e.ep.id) + bh / 2).attr('dy', '0.32em').style('fill', 'var(--fg)').text(d3.format('.0%')(e.s.Portfolio));
          svg.append('text').attr('class', 'tick').attr('x', x(0) + 4).attr('y', y(e.ep.id) + bh * 1.5 + 2).attr('dy', '0.32em').text(d3.format('.0%')(e.s.DAX));
          svg.append('rect').attr('x', 0).attr('y', y(e.ep.id)).attr('width', W).attr('height', y.bandwidth()).attr('fill', 'transparent')
            .on('pointermove pointerdown', (ev) => K.showTip(card, ev, `${e.ep.name}: ${day(e.s.peak)} → ${day(e.s.trough)}`, [
              { color: cP, name: 'Portfolio', value: sp1(e.s.Portfolio) }, { color: cD, name: 'DAX', value: sp1(e.s.DAX) },
              { color: K.sectorColor('Banking'), name: 'Banking', value: sp1(e.s.Banking) }, { color: K.sectorColor('Industry'), name: 'Industry', value: sp1(e.s.Industry) },
              { color: K.sectorColor('Oil & Energy'), name: 'Oil & Energy', value: sp1(e.s['Oil & Energy']) }]))
            .on('pointerleave', () => K.hideTip(card));
        });
        K.legendItems(box, [{ color: cP, label: 'Portfolio' }, { color: cD, label: 'DAX' }]);
      }
    }

    // cards
    const cards = document.getElementById('cr-cards');
    cards.replaceChildren(...eps.map(({ ep, s, t }) => {
      const c = K.el('div', { className: 'card crisis-card', id: 'cr-' + ep.id });
      const h = K.el('h3', { textContent: t.title });
      const meta = K.el('p', { className: 'note', textContent: `${day(s.peak)} → ${day(s.trough)} · ${s.days} trading days · DAX peak to trough` });
      const stats = K.el('div', { className: 'crisis-stats' });
      const add = (label, v, color) => { const d = K.el('div'); const k = K.el('span', { className: 'k' }); if (color) { const i = K.el('i', { className: 'dot' }); i.style.background = color; k.appendChild(i); } k.appendChild(document.createTextNode(label)); d.append(k, K.el('b', { textContent: sp1(v), className: cls(v) })); stats.appendChild(d); };
      add('DAX', s.DAX, K.cssVar('--muted')); add('Portfolio', s.Portfolio, K.cssVar('--fg'));
      add('Banking', s.Banking, K.sectorColor('Banking')); add('Industry', s.Industry, K.sectorColor('Industry')); add('Oil & Energy', s['Oil & Energy'], K.sectorColor('Oil & Energy')); add('Oil (WTI)', s.oil);
      const what = K.el('p'); what.append(K.el('b', { textContent: 'What happened. ' }), document.createTextNode(t.what));
      const pill = [['Banking', s.Banking], ['Industry', s.Industry], ['Oil & Energy', s['Oil & Energy']]].sort((a, b) => a[1] - b[1]);
      const rel = s.Portfolio > s.DAX ? `lost ${p1(-s.Portfolio)} against ${p1(-s.DAX)} for the DAX, ${d3.format('.1f')((s.Portfolio - s.DAX) * 100)} points better` : `lost ${p1(-s.Portfolio)} against ${p1(-s.DAX)} for the DAX, ${d3.format('.1f')((s.DAX - s.Portfolio) * 100)} points worse`;
      const how = K.el('p'); how.append(K.el('b', { textContent: 'How the pillars behaved. ' }),
        document.createTextNode(`The portfolio ${rel}. Hardest hit: ${pill[0][0]} (${sp1(pill[0][1])}); most resilient: ${pill[2][0]} (${sp1(pill[2][1])}). Replayed today, the episode would cost ${eur(-s.Portfolio * st.value)} on ${eur(st.value)}. Recovery to the pre-crisis level took ${dur(s.recPortfolio)} for the portfolio and ${dur(s.recDAX)} for the DAX.`));
      const kids = [h, meta, stats, what, how];
      if (t.sub) {
        const ss = subs[t.sub];
        const sp = K.el('p', { className: 'note' });
        sp.textContent = `${SUBTEXT[t.sub]} Portfolio ${sp1(ss.Portfolio)}, DAX ${sp1(ss.DAX)}, Banking ${sp1(ss.Banking)}, Industry ${sp1(ss.Industry)}, Oil & Energy ${sp1(ss['Oil & Energy'])} (${day(ss.peak)} → ${day(ss.trough)}).`;
        kids.push(sp);
      }
      const les = K.el('p', { className: 'lesson' }); les.append(K.el('b', { textContent: 'Lesson for the portfolio. ' }), document.createTextNode(t.lesson));
      kids.push(les);
      c.append(...kids);
      return c;
    }));

    // lessons (numbers computed)
    const better = eps.filter((e) => e.s.Portfolio > e.s.DAX), worse = eps.filter((e) => e.s.Portfolio <= e.s.DAX);
    const bankWorst = eps.filter((e) => Math.min(e.s.Banking, e.s.Industry, e.s['Oil & Energy']) === e.s.Banking).length;
    const gfc = eps.find((e) => e.ep.id === 'gfc').s, covid = eps.find((e) => e.ep.id === 'covid').s, ukr = eps.find((e) => e.ep.id === 'ukraine').s;
    const avgB = d3.mean(eps, (e) => e.s.Banking), avgI = d3.mean(eps, (e) => e.s.Industry), avgO = d3.mean(eps, (e) => e.s['Oil & Energy']);
    const LCr = window.LTCore, i0 = LCr.trainingIndex(B, 'all'), secs = B.sectors;
    const rcBO = LCr.rollingCorr(B.series[secs[0]].slice(i0), B.series[secs[2]].slice(i0), 63);
    const maxRc = d3.max(rcBO.filter((v) => v != null)), nowRc = rcBO[rcBO.length - 1];
    const L = document.getElementById('cr-lessons');
    L.innerHTML = '';
    const ol = K.el('ol', { className: 'lessons' });
    const li = (title, text) => { const x = K.el('li'); x.append(K.el('b', { textContent: title + ' ' }), document.createTextNode(text)); ol.appendChild(x); };
    li('1. The portfolio protects in real-economy shocks, not in financial ones.', `It lost less than the DAX in ${better.length} of ${eps.length} episodes (${better.map((e) => e.ep.name).join(', ')}) and more in the other ${worse.length}. The good cases are a valuation bust in technology, an energy and inflation shock and a trade shock; the bad cases all involve banks, credit or a liquidity crash.`);
    li('2. Banking is the crisis amplifier.', `The bank pillar was the hardest-hit pillar in ${bankWorst} of ${eps.length} episodes and lost ${p1(-avgB)} on average across them, against ${p1(-avgI)} for industry and ${p1(-avgO)} for oil & energy. Banks are leveraged on the credit cycle: when the economy that they finance weakens, their losses arrive first and largest. In the financial crisis the pillar fell ${p1(-gfc.Banking)}.`);
    li('3. Energy is the most reliable cushion, but not in every crisis.', `Oil & Energy was the most resilient pillar in most episodes and even gained in 2022 (${sp1(ukr['Oil & Energy'])}), yet it fell ${p1(-covid['Oil & Energy'])} in the COVID crash and lost heavily in the 2014–16 oil collapse. Its protection comes from different drivers, which also means it has crises of its own.`);
    li('4. Correlations rise exactly when they are needed.', `The 3-month correlation between the banking and energy pillars is ${d3.format('.2f')(nowRc)} today but has reached ${d3.format('.2f')(maxRc)} during past crises. A portfolio that is diversified in normal times can behave like a single bet in a panic, which is why stress tests replace correlations with crisis values.`);
    li('5. Recovery time is a risk of its own.', `After the financial crisis the portfolio needed ${dur(gfc.recPortfolio)} to regain its 2007 level, the DAX ${dur(gfc.recDAX)}. Deep losses compound: a 70% loss needs a 233% gain to break even. For an investor who might need the money within five years, the depth of the drawdown matters more than the average return.`);
    L.appendChild(ol);

    // mixes
    const vol = (s) => { const r = B.series[s].slice(LCr.trainingIndex(B, '20y')); const m = d3.mean(r); return Math.sqrt(d3.sum(r, (x) => (x - m) ** 2) / (r.length - 1)) * Math.sqrt(252); };
    const iv = secs.map((s) => 1 / vol(s)), ivs = d3.sum(iv);
    const mixes = [
      { name: 'Equal (1/3 each)', w: [1 / 3, 1 / 3, 1 / 3] },
      { name: 'Risk parity (inverse vol)', w: iv.map((x) => x / ivs) },
      { name: 'Defensive tilt (20/30/50)', w: [0.2, 0.3, 0.5] },
      { name: 'Without banking (0/50/50)', w: [0, 0.5, 0.5], ref: true },
    ];
    const mixRet = (w, a, b) => { let g = 1; for (let t = a + 1; t <= b; t++) g *= 1 + secs.reduce((s, sec, k) => s + w[k] * B.series[sec][t], 0); return g - 1; };
    const daxRet = (a, b) => { let g = 1; for (let t = a + 1; t <= b; t++) g *= 1 + B.series.DAX[t]; return g - 1; };
    const head = K.el('thead'); const hr = K.el('tr'); hr.appendChild(K.el('th', { textContent: 'Episode', className: 'l' }));
    mixes.forEach((mx) => hr.appendChild(K.el('th', { textContent: `${mx.name}${mx.ref ? '*' : ''}` }))); hr.appendChild(K.el('th', { textContent: 'DAX' })); head.appendChild(hr);
    const body = K.el('tbody');
    eps.forEach(({ ep, s }) => {
      const tr = K.el('tr'); tr.appendChild(K.el('td', { textContent: ep.name, className: 'l' }));
      const vals = mixes.map((mx) => mixRet(mx.w, s.pk, s.tr)); const best = Math.max(...vals.slice(0, 3));
      vals.forEach((v, k) => { const td = K.el('td', { textContent: sp1(v), className: cls(v) }); if (k < 3 && v === best) td.style.fontWeight = 700; tr.appendChild(td); });
      tr.appendChild(K.el('td', { textContent: sp1(daxRet(s.pk, s.tr)), className: 'muted' }));
      body.appendChild(tr);
    });
    document.getElementById('cr-mix-table').replaceChildren(head, body);
    const j0 = LCr.trainingIndex(B, '20y');
    const perf = (rFn) => { const n = B.n - j0; let lvl = 1, peak = 1, mdd = 0, s1 = 0, s2 = 0; const rs = []; for (let t = j0; t < B.n; t++) { const r = rFn(t); rs.push(r); lvl *= 1 + r; peak = Math.max(peak, lvl); mdd = Math.min(mdd, lvl / peak - 1); s1 += r; s2 += r * r; } const m = s1 / n; return { cagr: lvl ** (252 / n) - 1, vol: Math.sqrt((s2 - n * m * m) / (n - 1)) * Math.sqrt(252), mdd, var1y: LCr.varEsFromReturns(LCr.overlapping(rs, 252), 0.99).var }; };
    const ph = K.el('thead'); const phr = K.el('tr'); ['Last 20 years', 'CAGR', 'Ann. vol', 'Max drawdown', '1-year VaR 99% (historical)'].forEach((t, k) => phr.appendChild(K.el('th', { textContent: t, className: k ? '' : 'l' }))); ph.appendChild(phr);
    const pb = K.el('tbody');
    [...mixes.map((mx) => ({ name: mx.name + (mx.ref ? '*' : ''), f: (t) => secs.reduce((s, sec, k) => s + mx.w[k] * B.series[sec][t], 0) })), { name: 'DAX', f: (t) => B.series.DAX[t] }].forEach((row) => {
      const p = perf(row.f); const tr = K.el('tr');
      [row.name, p1(p.cagr), p1(p.vol), p1(p.mdd), p1(p.var1y)].forEach((t, k) => tr.appendChild(K.el('td', { textContent: t, className: k ? (k === 3 ? 'neg' : '') : 'l' })));
      pb.appendChild(tr);
    });
    document.getElementById('cr-mix-perf').replaceChildren(ph, pb);
    document.getElementById('cr-mix-note').textContent = `Risk-parity weights: ${secs.map((s, k) => `${s} ${p1(mixes[1].w[k])}`).join(', ')}. Bold = best of the first three mixes in each episode. *Reference only: dropping a pillar abandons the three-pillar idea. Weights chosen with hindsight over the same 20 years look better in this table than they would have in real time.`;

    // playbook
    document.getElementById('cr-playbook').innerHTML = `
      <h2>A crisis playbook for the three-pillar portfolio</h2>
      <ol class="lessons">
        <li><b>Size the banking pillar by risk, not by count.</b> Over the last 20 years, equal capital gave banks the largest share of portfolio risk (about 41% of the variance, against 21% for oil &amp; energy). A risk-parity or defensive mix keeps all three pillars but lowered the financial-crisis loss and the 20-year drawdown in the table above, and also raised long-run return.</li>
        <li><b>Plan for the bad case before it happens.</b> Use the Long-term risk layer to set a maximum acceptable 1-year loss, and replay these episodes on every new allocation. If the financial-crisis replay is larger than you could tolerate, the allocation is too aggressive regardless of how calm recent volatility looks.</li>
        <li><b>Watch the warning signs of bank-led episodes.</b> Interbank funding stress (2007), sovereign-bond sell-offs in the euro area (2011) and sudden bank-funding fears (2023) marked the episodes where the portfolio did worst. Track bank credit spreads, euro-area bond spreads and the rolling pillar correlations (Long-term risk) as early-warning indicators.</li>
        <li><b>Hedge the common factor, not the pillars.</b> When those signals flash, an index hedge (for example DAX futures or put options on a share of the portfolio) offsets the market-wide part of the loss while keeping the long-term pillar exposure.</li>
        <li><b>Rebalance with rules.</b> Recoveries were often fastest in the pillar that had fallen most (banks were the best pillar in 2009 and 2021). Rebalancing back to target weights after large moves buys the laggard systematically, but only works if position sizes leave room to survive the drawdown first.</li>
        <li><b>Keep a liquidity buffer.</b> Recovery took months to years. Money that may be needed within that time should not be in the portfolio.</li>
      </ol>`;
  }

  window.CrisisTab = { draw, TEXT };
})();
