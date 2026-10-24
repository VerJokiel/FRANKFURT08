/* =====================================================================
   Short-term risk tab (layer 1): Value at Risk, Expected Shortfall and related hedge-fund
   risk analytics for the three-pillar portfolio.

   Two parts:
     RiskCore  pure calculation functions (no DOM), documented in
               docs/RISK_METHODOLOGY.md and mirrored in python/risk_metrics.py
     RiskTab   the interactive dashboard tab (uses window.DashKit from app.js)

   Conventions
     - returns are simple daily returns r_t = P_t / P_{t-1} - 1
     - a loss is L = -r (positive number = money lost)
     - alpha is the confidence level, e.g. 0.99
     - VaR_alpha = the alpha-quantile of the loss distribution
     - ES_alpha  = the average loss in the worst (1 - alpha) share of outcomes
   ===================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* RiskCore: statistics                                               */
  /* ------------------------------------------------------------------ */
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const variance = (a, m = mean(a)) => a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
  const std = (a) => Math.sqrt(variance(a));
  function skewness(a) {            // sample skewness (moment estimator)
    const m = mean(a), n = a.length;
    const m2 = a.reduce((s, x) => s + (x - m) ** 2, 0) / n;
    const m3 = a.reduce((s, x) => s + (x - m) ** 3, 0) / n;
    return m3 / m2 ** 1.5;
  }
  function excessKurtosis(a) {      // sample excess kurtosis (normal = 0)
    const m = mean(a), n = a.length;
    const m2 = a.reduce((s, x) => s + (x - m) ** 2, 0) / n;
    const m4 = a.reduce((s, x) => s + (x - m) ** 4, 0) / n;
    return m4 / m2 ** 2 - 3;
  }
  /** Empirical quantile, linear interpolation between order statistics (Excel/NumPy "linear"). */
  function quantile(sortedAsc, p) {
    const n = sortedAsc.length, h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return sortedAsc[lo] + (h - lo) * (sortedAsc[hi] - sortedAsc[lo]);
  }

  /* normal distribution */
  const SQRT2PI = Math.sqrt(2 * Math.PI);
  const normPdf = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;
  function erf(x) {                 // Abramowitz-Stegun 7.1.26, |err| < 1.5e-7
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const normCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  /** Inverse normal CDF (Acklam's algorithm, relative error < 1.2e-9). */
  function normInv(p) {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425, ph = 1 - pl;
    let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p <= ph) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  /** Chi-square(1) upper tail p-value. */
  const chi2SurvivalDf1 = (x) => (x <= 0 ? 1 : 1 - erf(Math.sqrt(x / 2)));
  /** Binomial CDF P(X <= k), X ~ Bin(n, p). */
  function binomCdf(k, n, p) {
    let s = 0, logC = 0;
    for (let i = 0; i <= k; i++) {
      if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
      s += Math.exp(logC + i * Math.log(p) + (n - i) * Math.log(1 - p));
    }
    return Math.min(1, s);
  }

  /* linear algebra on small dense matrices */
  const matVec = (M, v) => M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  function covMatrix(cols) {        // cols: array of return series (same length)
    const k = cols.length, n = cols[0].length, mu = cols.map(mean);
    const C = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) for (let j = i; j < k; j++) {
      let s = 0; for (let t = 0; t < n; t++) s += (cols[i][t] - mu[i]) * (cols[j][t] - mu[j]);
      C[i][j] = C[j][i] = s / (n - 1);
    }
    return C;
  }
  function cholesky(A) {
    const n = A.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-18)) : s / L[j][j];
    }
    return L;
  }
  /** Reproducible pseudo-random numbers (mulberry32) and standard normals (Box-Muller). */
  function rng(seed) {
    let a = seed >>> 0;
    const u = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let spare = null;
    const n = () => { if (spare != null) { const s = spare; spare = null; return s; } let x, y, r; do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r >= 1 || r === 0); const f = Math.sqrt(-2 * Math.log(r) / r); spare = y * f; return x * f; };
    return { u, n };
  }

  /* ------------------------------------------------------------------ */
  /* RiskCore: VaR / ES estimators. Input: daily portfolio returns.      */
  /* Output: one-day {var, es} as positive fractions of portfolio value. */
  /* ------------------------------------------------------------------ */
  /** Historical simulation: empirical loss quantile, ES = mean of losses at or beyond VaR. */
  function historical(r, alpha) {
    const L = r.map((x) => -x).sort((a, b) => a - b);
    const v = quantile(L, alpha);
    const tail = L.filter((x) => x >= v);
    return { var: v, es: mean(tail) };
  }
  /** Parametric (variance-covariance) under normality. */
  function parametricNormal(r, alpha) {
    const mu = mean(r), s = std(r), z = normInv(alpha);
    return { var: -mu + z * s, es: -mu + s * normPdf(z) / (1 - alpha) };
  }
  /** Cornish-Fisher expansion: adjusts the normal quantile for skewness and excess kurtosis.
      ES integrates the CF quantile over the tail (numerical, midpoint rule). */
  function cornishFisher(r, alpha) {
    const mu = mean(r), s = std(r), S = skewness(r), K = excessKurtosis(r);
    // the loss -r has skewness -S and the same kurtosis
    const cfL = (z) => z + (z * z - 1) * (-S) / 6 + (z ** 3 - 3 * z) * K / 24 - (2 * z ** 3 - 5 * z) * S * S / 36;
    const v = -mu + cfL(normInv(alpha)) * s;
    const N = 400; let acc = 0;
    for (let i = 0; i < N; i++) { const u = alpha + (1 - alpha) * (i + 0.5) / N; acc += -mu + cfL(normInv(u)) * s; }
    return { var: v, es: acc / N, skew: S, kurt: K };
  }
  /** EWMA volatility (RiskMetrics, lambda = 0.94). Returns sigma_t forecasts for each day and the next-day forecast. */
  function ewmaSigma(r, lambda = 0.94, seedN = 30) {
    let v = variance(r.slice(0, Math.min(seedN, r.length)));
    const sig = [];
    for (let t = 0; t < r.length; t++) { sig.push(Math.sqrt(v)); v = lambda * v + (1 - lambda) * r[t] * r[t]; }
    return { sig, next: Math.sqrt(v) };
  }
  /** EWMA-normal VaR: zero mean, current RiskMetrics volatility. */
  function ewmaNormal(r, alpha, lambda = 0.94) {
    const s = ewmaSigma(r, lambda).next, z = normInv(alpha);
    return { var: z * s, es: s * normPdf(z) / (1 - alpha), sigma: s };
  }
  /** Filtered historical simulation (Barone-Adesi et al.): devolatilise past returns by their EWMA sigma,
      rescale by today's sigma, then take the empirical quantile. */
  function filteredHS(r, alpha, lambda = 0.94) {
    const { sig, next } = ewmaSigma(r, lambda);
    const scen = r.map((x, t) => (x / sig[t]) * next);
    return historical(scen, alpha);
  }
  /** Monte Carlo on the stocks: multivariate normal or multivariate Student-t (fat tails),
      both matched to the sample mean vector and covariance matrix. */
  function monteCarlo(R, w, alpha, { n = 50000, dist = 'normal', nu = 4, seed = 42 } = {}) {
    const k = R.length, mu = R.map(mean), L = cholesky(covMatrix(R)), g = rng(seed);
    const scale = dist === 't' ? Math.sqrt((nu - 2)) : 1;
    const pr = new Array(n);
    for (let s = 0; s < n; s++) {
      const z = Array.from({ length: k }, () => g.n());
      let m = 1;
      if (dist === 't') { let chi = 0; for (let i = 0; i < nu; i++) { const e = g.n(); chi += e * e; } m = scale / Math.sqrt(chi); }
      const x = matVec(L, z);
      let p = 0; for (let i = 0; i < k; i++) p += w[i] * (mu[i] + m * x[i]);
      pr[s] = p;
    }
    return historical(pr, alpha);
  }

  /* ------------------------------------------------------------------ */
  /* RiskCore: decomposition                                             */
  /* ------------------------------------------------------------------ */
  /** Euler allocation of parametric (zero-mean normal) VaR: component_i = w_i * z * (Sigma w)_i / sigma_p. */
  function componentVaR(Sigma, w, alpha) {
    const z = normInv(alpha), Sw = matVec(Sigma, w), sp = Math.sqrt(dot(w, Sw));
    const marginal = Sw.map((x) => z * x / sp);
    const component = marginal.map((m, i) => m * w[i]);
    return { sigmaP: sp, total: z * sp, marginal, component };
  }
  /** Euler allocation of historical ES: average loss of each position on the portfolio's tail days. */
  function componentES(R, w, alpha) {
    const n = R[0].length;
    const pr = Array.from({ length: n }, (_, t) => R.reduce((s, col, i) => s + w[i] * col[t], 0));
    const v = historical(pr, alpha).var;
    const tail = []; for (let t = 0; t < n; t++) if (-pr[t] >= v) tail.push(t);
    const component = R.map((col, i) => mean(tail.map((t) => -w[i] * col[t])));
    return { total: component.reduce((s, x) => s + x, 0), component, tailDays: tail.length };
  }

  /* ------------------------------------------------------------------ */
  /* RiskCore: portfolio weights                                         */
  /* ------------------------------------------------------------------ */
  function normalise(w) { const s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); }
  const inverseVol = (Sigma) => normalise(Sigma.map((row, i) => 1 / Math.sqrt(row[i])));
  /** Equal risk contribution (risk parity), multiplicative fixed-point iteration. */
  function equalRiskContribution(Sigma, iters = 500) {
    let w = inverseVol(Sigma);
    for (let it = 0; it < iters; it++) {
      const Sw = matVec(Sigma, w), tot = dot(w, Sw);
      const rc = w.map((x, i) => x * Sw[i] / tot);
      const target = 1 / w.length;
      w = normalise(w.map((x, i) => x * Math.sqrt(target / rc[i])));
    }
    return w;
  }
  /** Projection onto the probability simplex (long-only, sum to 1). */
  function projectSimplex(v) {
    const u = [...v].sort((a, b) => b - a); let css = 0, rho = 0, theta = 0;
    for (let i = 0; i < u.length; i++) { css += u[i]; const t = (css - 1) / (i + 1); if (u[i] - t > 0) { rho = i; theta = t; } }
    return v.map((x) => Math.max(x - theta, 0));
  }
  /** Long-only minimum-variance portfolio by projected gradient descent. */
  function minVariance(Sigma, iters = 4000) {
    const k = Sigma.length; let w = new Array(k).fill(1 / k);
    const tr = Sigma.reduce((s, row, i) => s + row[i], 0), step = 0.5 / tr;
    for (let it = 0; it < iters; it++) { const g = matVec(Sigma, w).map((x) => 2 * x); w = projectSimplex(w.map((x, i) => x - step * g[i] * k)); }
    return w;
  }

  /* ------------------------------------------------------------------ */
  /* RiskCore: backtesting                                               */
  /* ------------------------------------------------------------------ */
  /** Rolling out-of-sample 1-day VaR. model: 'hist' | 'normal' | 'ewma' | 'fhs'. */
  function rollingVaR(r, alpha, model, win = 250) {
    const out = [];
    const ew = ewmaSigma(r);              // full-sample recursion is causal: sig[t] uses data up to t-1
    for (let t = win; t < r.length; t++) {
      const past = r.slice(t - win, t);
      let v;
      if (model === 'hist') v = historical(past, alpha).var;
      else if (model === 'normal') v = parametricNormal(past, alpha).var;
      else if (model === 'ewma') v = normInv(alpha) * ew.sig[t];
      else { const sigPast = ew.sig.slice(t - win, t); v = historical(past.map((x, i) => (x / sigPast[i]) * ew.sig[t]), alpha).var; }
      out.push({ t, var: v, ret: r[t], hit: -r[t] > v });
    }
    return out;
  }
  /** Kupiec proportion-of-failures test (unconditional coverage). */
  function kupiec(hits, alpha) {
    const T = hits.length, x = hits.filter(Boolean).length, p = 1 - alpha, ph = x / T;
    const ll0 = (T - x) * Math.log(1 - p) + x * Math.log(p);
    const ll1 = (x === 0 ? 0 : x * Math.log(ph)) + (x === T ? 0 : (T - x) * Math.log(1 - ph));
    const LR = -2 * (ll0 - ll1);
    return { T, x, expected: T * p, LR, p: chi2SurvivalDf1(LR) };
  }
  /** Christoffersen independence test (are exceptions clustered?). */
  function christoffersen(hits) {
    let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
    for (let t = 1; t < hits.length; t++) { const a = hits[t - 1], b = hits[t]; if (!a && !b) n00++; else if (!a && b) n01++; else if (a && !b) n10++; else n11++; }
    const pi0 = n01 / Math.max(1, n00 + n01), pi1 = n11 / Math.max(1, n10 + n11), pi = (n01 + n11) / Math.max(1, n00 + n01 + n10 + n11);
    const lg = (x) => (x > 0 ? Math.log(x) : 0);
    const l0 = (n00 + n10) * lg(1 - pi) + (n01 + n11) * lg(pi);
    const l1 = n00 * lg(1 - pi0) + n01 * lg(pi0) + n10 * lg(1 - pi1) + n11 * lg(pi1);
    const LR = -2 * (l0 - l1);
    return { LR, p: chi2SurvivalDf1(LR), n11 };
  }
  /** Basel traffic light: zone by cumulative binomial probability of seeing <= x exceptions. */
  function baselZone(x, T, alpha) {
    const c = binomCdf(x, T, 1 - alpha);
    return c < 0.95 ? 'green' : c < 0.9999 ? 'yellow' : 'red';
  }

  /* ------------------------------------------------------------------ */
  /* RiskCore: performance                                               */
  /* ------------------------------------------------------------------ */
  function drawdowns(r) {
    let lvl = 1, peak = 1, max = 0, pk = 0, tr = 0, curPk = 0; const dd = [];
    r.forEach((x, t) => { lvl *= 1 + x; if (lvl > peak) { peak = lvl; curPk = t; } const d = lvl / peak - 1; dd.push(d); if (d < max) { max = d; pk = curPk; tr = t; } });
    return { dd, max, peakIdx: pk, troughIdx: tr };
  }
  function performance(r, rfAnnual = 0.02) {
    const n = r.length, years = n / 252;
    const growth = r.reduce((g, x) => g * (1 + x), 1);
    const annRet = growth ** (1 / years) - 1, annVol = std(r) * Math.sqrt(252);
    const rfD = (1 + rfAnnual) ** (1 / 252) - 1;
    const ex = r.map((x) => x - rfD);
    const downside = Math.sqrt(ex.reduce((s, x) => s + Math.min(x, 0) ** 2, 0) / n) * Math.sqrt(252);
    const sharpe = mean(ex) * 252 / annVol;
    const sortino = mean(ex) * 252 / downside;
    const mdd = drawdowns(r).max;
    return { annRet, annVol, sharpe, sortino, maxDD: mdd, calmar: annRet / Math.abs(mdd), skew: skewness(r), kurt: excessKurtosis(r),
      var999: historical(r, 0.999).var, es975: historical(r, 0.975).es };
  }
  function worstWindow(r, h) {      // worst compounded h-day return
    let worst = Infinity, at = 0;
    for (let t = h - 1; t < r.length; t++) { let g = 1; for (let k = t - h + 1; k <= t; k++) g *= 1 + r[k]; if (g - 1 < worst) { worst = g - 1; at = t; } }
    return { ret: worst, end: at };
  }

  /** Fan-chart paths for the next H trading days: each day's return drawn at random (with replacement)
      from the estimation window (historical simulation of paths). Returns growth factors for days 0..H. */
  function fanHistorical(r, H = 21, { paths = 10000, seed = 11 } = {}) {
    const g = rng(seed), n = r.length, out = new Array(paths);
    for (let p = 0; p < paths; p++) {
      const row = new Float64Array(H + 1); row[0] = 1; let v = 1;
      for (let t = 1; t <= H; t++) { v *= 1 + r[Math.floor(g.u() * n)]; row[t] = v; }
      out[p] = row;
    }
    return out;
  }

  window.RiskCore = { fanHistorical, mean, std, variance, skewness, excessKurtosis, quantile, normPdf, normCdf, normInv, binomCdf, covMatrix, cholesky, rng,
    historical, parametricNormal, cornishFisher, ewmaSigma, ewmaNormal, filteredHS, monteCarlo, componentVaR, componentES,
    inverseVol, equalRiskContribution, minVariance, projectSimplex, rollingVaR, kupiec, christoffersen, baselZone, drawdowns, performance, worstWindow };

  /* ================================================================== */
  /* RiskTab: the interactive dashboard                                  */
  /* ================================================================== */
  const C = window.RiskCore;
  const SCENARIOS = [   // illustrative instantaneous pillar shocks (assumptions)
    { name: 'Global equity crash (2008-style)', shock: { Banking: -0.45, Industry: -0.35, 'Oil & Energy': -0.30 } },
    { name: 'Banking crisis / credit event', shock: { Banking: -0.30, Industry: -0.10, 'Oil & Energy': -0.05 } },
    { name: 'Oil price spike (+40% crude)', shock: { Banking: -0.05, Industry: -0.08, 'Oil & Energy': 0.12 } },
    { name: 'Oil price crash (−40% crude)', shock: { Banking: -0.03, Industry: 0.03, 'Oil & Energy': -0.25 } },
    { name: 'AI / capex unwind', shock: { Banking: -0.05, Industry: -0.25, 'Oil & Energy': -0.05 } },
    { name: 'Rates fall 150 bp', shock: { Banking: -0.15, Industry: 0.05, 'Oil & Energy': 0.02 } },
  ];
  const METHODS = [
    { id: 'hist', name: 'Historical simulation' },
    { id: 'normal', name: 'Parametric normal' },
    { id: 'cf', name: 'Cornish-Fisher' },
    { id: 'ewma', name: 'EWMA normal (λ 0.94)' },
    { id: 'fhs', name: 'Filtered historical' },
    { id: 'mcn', name: 'Monte Carlo normal' },
    { id: 'mct', name: 'Monte Carlo Student-t (ν 4)' },
  ];
  const st = { value: 15000, alpha: 0.999, h: 1, win: 252, scheme: 'equal', pillarW: null, btModel: 'hist', rho: 0.8, volm: 1.5, rf: 0.02 };
  let wired = false, data = null;

  function load() {
    if (data) return data;
    const D = window.DATA;
    const ids = D.stocks.map((s) => s.id);
    const rows = D.rows;
    const dates = rows.slice(1).map((r) => r[0]);
    const R = ids.map((id) => { const c = D.columns.indexOf(id); return rows.slice(1).map((r, t) => r[c] / rows[t][c] - 1); });
    data = { ids, stocks: D.stocks, dates, R };
    return data;
  }

  function weights(Rw, stocks) {
    const S = C.covMatrix(Rw), sectors = [...new Set(stocks.map((s) => s.sector))];
    if (!st.pillarW) st.pillarW = Object.fromEntries(sectors.map((s) => [s, 1 / sectors.length]));
    switch (st.scheme) {
      case 'pillar': {
        const tot = Object.values(st.pillarW).reduce((a, b) => a + b, 0) || 1;
        return stocks.map((s) => st.pillarW[s.sector] / tot / stocks.filter((x) => x.sector === s.sector).length);
      }
      case 'invvol': return C.inverseVol(S);
      case 'erc': return C.equalRiskContribution(S);
      case 'minvar': return C.minVariance(S);
      default: return stocks.map(() => 1 / stocks.length);
    }
  }

  function compute() {
    const { ids, stocks, dates, R } = load();
    const n = R[0].length, start = st.win ? Math.max(0, n - st.win) : 0;
    const Rw = R.map((c) => c.slice(start)), dw = dates.slice(start);
    const w = weights(Rw, stocks);
    const port = (RR) => RR[0].map((_, t) => RR.reduce((s, c, i) => s + w[i] * c[t], 0));
    const r = port(Rw), rAll = port(R);
    const a = st.alpha, sq = Math.sqrt(st.h);
    const res = {
      hist: C.historical(r, a), normal: C.parametricNormal(r, a), cf: C.cornishFisher(r, a), ewma: C.ewmaNormal(r, a),
      fhs: C.filteredHS(r, a), mcn: C.monteCarlo(Rw, w, a, { dist: 'normal' }), mct: C.monteCarlo(Rw, w, a, { dist: 't', nu: 4 }),
    };
    for (const k in res) { res[k].varH = res[k].var * sq; res[k].esH = res[k].es * sq; }
    const Sigma = C.covMatrix(Rw);
    const cvar = C.componentVaR(Sigma, w, a), ces = C.componentES(Rw, w, a);
    return { ids, stocks, dates: dw, datesAll: dates, R, Rw, w, r, rAll, res, Sigma, cvar, ces, sq };
  }

  /* ---------- formatting ---------- */
  const eur = (v) => (Math.abs(v) >= 1e6 ? d3.format(',.2s')(v).replace('G', 'B') : d3.format(',.0f')(v)) + ' €';
  const eurS = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + eur(Math.abs(v));
  const p2 = d3.format('.2%'), p1 = d3.format('.1%');
  const confLabel = () => d3.format('.1~%')(st.alpha);
  const hLabel = () => ({ 1: '1-day', 5: '1-week', 10: '10-day', 21: '1-month' }[st.h]);

  /* ---------- wiring controls ---------- */
  function segWire(id, key, parse) {
    document.getElementById(id).addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; st[key] = parse(b.dataset.v); draw(); });
  }
  function segSync(id, val) { document.querySelectorAll('#' + id + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v) === String(val) ? 'true' : 'false')); }
  function wire() {
    if (wired) return; wired = true;
    const v = document.getElementById('rk-value');
    v.addEventListener('change', () => { const x = Number(v.value); if (x > 0) { st.value = x; draw(); } else v.value = st.value; });
    segWire('rk-conf', 'alpha', Number); segWire('rk-h', 'h', Number); segWire('rk-win', 'win', Number);
    segWire('rk-wscheme', 'scheme', String); segWire('rk-btmodel', 'btModel', String);
    const rho = document.getElementById('rk-rho'), volm = document.getElementById('rk-volm');
    rho.addEventListener('input', () => { st.rho = Number(rho.value); drawCorrStress(last); });
    volm.addEventListener('input', () => { st.volm = Number(volm.value); drawCorrStress(last); });
    const rf = document.getElementById('rk-rf');
    rf.addEventListener('change', () => { const x = Number(rf.value); if (isFinite(x)) { st.rf = x / 100; drawPerf(last); } });
  }

  let last = null;
  function draw() {
    if (!window.DashKit) return;
    wire();
    segSync('rk-conf', st.alpha); segSync('rk-h', st.h); segSync('rk-win', st.win); segSync('rk-wscheme', st.scheme); segSync('rk-btmodel', st.btModel);
    last = compute();
    drawSliders(last); drawKpis(last); drawMethods(last); drawHist(last); drawComp(last); drawPillars(last);
    drawFan(last); drawBacktest(last); drawStress(last); drawCorrStress(last); drawPerf(last); drawWeights(last);
  }

  function drawSliders(m) {
    const box = document.getElementById('rk-sliders');
    if (st.scheme !== 'pillar') { box.replaceChildren(); return; }
    const K = window.DashKit, wrap = K.el('div', { className: 'sliders' });
    const tot = Object.values(st.pillarW).reduce((a, b) => a + b, 0) || 1;
    for (const sec of Object.keys(st.pillarW)) {
      const lab = K.el('label'); const b = K.el('b', { textContent: p1(st.pillarW[sec] / tot) });
      const head = K.el('span'); head.append(document.createTextNode(sec + ' ETF  '), b);
      const inp = K.el('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(st.pillarW[sec] * 100) });
      inp.style.accentColor = K.sectorColor(sec);
      inp.addEventListener('input', () => { st.pillarW[sec] = Number(inp.value) / 100; if (Object.values(st.pillarW).every((x) => x === 0)) st.pillarW[sec] = 0.01; draw(); });
      lab.append(head, inp); wrap.appendChild(lab);
    }
    box.replaceChildren(wrap);
    void m;
  }

  function drawKpis(m) {
    const K = window.DashKit, V = st.value, h = m.res.hist, nrm = m.res.normal;
    const standalone = m.w.reduce((s, wi, i) => s + wi * Math.sqrt(m.Sigma[i][i]), 0) * C.normInv(st.alpha) * m.sq;
    const divB = standalone - m.cvar.total * m.sq;
    const wd = C.worstWindow(m.r, 1), dd = C.drawdowns(m.r);
    document.getElementById('rk-kpis').replaceChildren(
      K.stat(`VaR ${confLabel()} · ${hLabel()}`, eur(h.varH * V), p2(h.varH) + ' of portfolio (historical)', null, true),
      K.stat(`Expected Shortfall ${confLabel()}`, eur(h.esH * V), p2(h.esH) + ' · average tail loss'),
      K.stat('Parametric VaR', eur(nrm.varH * V), 'normal distribution, incl. mean'),
      K.stat('Diversification benefit', eur(divB * V), `${p1(divB / standalone)} below the sum of 9 stand-alone VaRs`),
      K.stat('Worst day in window', eur(-wd.ret * V), K.fmtDay(K.parse(m.dates[wd.end]))),
      K.stat('Max drawdown', p1(dd.max), 'peak to trough in window'),
    );
    const ratio = m.res.cf.var / nrm.var;
    document.getElementById('rk-summary').textContent =
      `With ${eur(V)} invested, on ${d3.format('.1~%')(1 - st.alpha)} of ${hLabel()} periods the portfolio would be expected to lose more than ${eur(h.varH * V)} (historical VaR), and in those cases ${eur(h.esH * V)} on average (ES). ` +
      (ratio > 1.05 ? `Cornish-Fisher VaR is ${d3.format('.0%')(ratio - 1)} above normal VaR, a sign of fat tails that a normal model underestimates.` : 'Fat-tail corrections change VaR only slightly in this window.');
  }

  function drawMethods(m) {
    const K = window.DashKit, V = st.value, box = document.getElementById('rk-methods'), card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const rows = METHODS.map((mt) => ({ ...mt, v: m.res[mt.id].varH * V, e: m.res[mt.id].esH * V }));
    const narrow = W < 480, rowH = 30, top = 6, H = top + rows.length * rowH + 22;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const lab = (d) => (narrow ? d.name.replace('simulation', 'sim.').replace('Parametric ', '').replace(' (λ 0.94)', '').replace('Monte Carlo', 'MC').replace(' (ν 4)', '') : d.name);
    const left = d3.max(rows, (d) => K.measure(svg, lab(d))) + 10;
    const x = d3.scaleLinear([0, d3.max(rows, (d) => d.e) * 1.08], [left, W - 8]).nice();
    const y = d3.scaleBand(rows.map((d) => d.id), [top, top + rows.length * rowH]).padding(0.22);
    for (const t of x.ticks(narrow ? 3 : 5)) {
      svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', top).attr('y2', H - 20).attr('stroke', 'var(--grid)');
      svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.format(',.0f')(t) + ' €');
    }
    const vc = K.cssVar('--accent'), ec = K.cssVar('--hot');
    const g = svg.append('g').selectAll('g').data(rows).join('g');
    g.append('text').attr('class', 'tick').attr('x', left - 8).attr('y', (d) => y(d.id) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').style('fill', 'var(--fg)').text(lab);
    g.append('rect').attr('x', left).attr('y', (d) => y(d.id)).attr('height', y.bandwidth() / 2 - 1).attr('width', (d) => Math.max(0, x(d.v) - left)).attr('rx', 3).attr('fill', vc);
    g.append('rect').attr('x', left).attr('y', (d) => y(d.id) + y.bandwidth() / 2 + 1).attr('height', y.bandwidth() / 2 - 1).attr('width', (d) => Math.max(0, x(d.e) - left)).attr('rx', 3).attr('fill', ec);
    g.append('rect').attr('x', left).attr('y', (d) => y(d.id)).attr('width', W - left).attr('height', y.bandwidth()).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev, d) => K.showTip(card, ev, d.name, [{ color: vc, name: 'VaR', value: eur(d.v) }, { color: ec, name: 'ES', value: eur(d.e) }]))
      .on('pointerleave', () => K.hideTip(card));
    K.legendItems(box, [{ color: vc, label: `VaR ${confLabel()} ${hLabel()}` }, { color: ec, label: `Expected Shortfall ${confLabel()}` }]);
    document.querySelector('#rk-method-table tbody').replaceChildren(...rows.map((d) => {
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      tr.append(td(d.name, 'l'), td(eur(d.v)), td(p2(d.v / V)), td(eur(d.e)), td(p2(d.e / V)), td(d3.format('.2f')(d.e / d.v)));
      return tr;
    }));
  }

  function drawHist(m) {
    const K = window.DashKit, box = document.getElementById('rk-hist'), card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const H = W < 520 ? 230 : 280, r = m.r;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const ext = d3.extent(r), pad = (ext[1] - ext[0]) * 0.04;
    const x = d3.scaleLinear([ext[0] - pad, ext[1] + pad], [36, W - 8]);
    const bins = d3.bin().domain(x.domain()).thresholds(W < 520 ? 30 : 45)(r);
    const mu = C.mean(r), sd = C.std(r);
    const dens = (b) => b.length / r.length / (b.x1 - b.x0);
    const maxD = Math.max(d3.max(bins, dens), C.normPdf(0) / sd);
    const y = d3.scaleLinear([0, maxD * 1.05], [H - 24, 8]);
    const v1 = m.res.hist.var, e1 = m.res.hist.es;  // one-day, in return space at -v
    for (const t of x.ticks(W < 520 ? 4 : 7)) svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.format('.0%')(t));
    svg.append('line').attr('x1', 36).attr('x2', W - 8).attr('y1', H - 24).attr('y2', H - 24).attr('stroke', 'var(--axis)');
    const tailC = K.cssVar('--hot'), bodyC = K.cssVar('--accent');
    svg.append('g').selectAll('rect').data(bins).join('rect')
      .attr('x', (b) => x(b.x0) + 0.5).attr('width', (b) => Math.max(0, x(b.x1) - x(b.x0) - 1)).attr('y', (b) => y(dens(b))).attr('height', (b) => y(0) - y(dens(b)))
      .attr('fill', (b) => (b.x1 <= -v1 + 1e-12 ? tailC : bodyC)).attr('opacity', (b) => (b.x1 <= -v1 + 1e-12 ? 0.9 : 0.55)).attr('rx', 1.5)
      .on('pointermove pointerdown', (ev, b) => K.showTip(card, ev, `${p2(b.x0)} to ${p2(b.x1)}`, [{ name: 'Days', value: String(b.length) }]))
      .on('pointerleave', () => K.hideTip(card));
    const xs = d3.range(x.domain()[0], x.domain()[1], (x.domain()[1] - x.domain()[0]) / 200);
    svg.append('path').datum(xs).attr('fill', 'none').attr('stroke', 'var(--fg)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3')
      .attr('d', d3.line().x((t) => x(t)).y((t) => y(C.normPdf((t - mu) / sd) / sd)));
    const mark = (val, label, color, dy, side) => {
      svg.append('line').attr('x1', x(-val)).attr('x2', x(-val)).attr('y1', 8).attr('y2', H - 24).attr('stroke', color).attr('stroke-width', 2);
      const t = svg.append('text').attr('class', 'tick').attr('y', 18 + dy).style('fill', color).style('font-weight', 600).text(label);
      const tw = t.node().getComputedTextLength();
      let tx = side > 0 ? x(-val) + 4 : x(-val) - 4 - tw;
      if (tx < 2) tx = x(-val) + 4;
      t.attr('x', tx);
    };
    mark(v1, `VaR ${p2(v1)}`, 'var(--fg)', 0, 1);
    mark(e1, `ES ${p2(e1)}`, tailC, 16, -1);
    K.legendItems(box, [{ color: bodyC, label: 'Daily returns' }, { color: tailC, label: `Tail beyond ${confLabel()} VaR` }, { color: K.cssVar('--fg'), label: 'Normal fit', dash: true }]);
    const cf = m.res.cf;
    document.getElementById('rk-moments').replaceChildren(
      K.stat('Daily mean', p2(mu), 'average return'), K.stat('Daily vol', p2(sd), p1(sd * Math.sqrt(252)) + ' annualised'),
      K.stat('Skewness', d3.format('.2f')(cf.skew), cf.skew < 0 ? 'longer left tail' : 'longer right tail'),
      K.stat('Excess kurtosis', d3.format('.2f')(cf.kurt), cf.kurt > 0 ? 'fatter tails than normal' : 'thinner tails'));
  }

  let fanKey = null, fanData = null;
  function drawFan(m) {
    const K = window.DashKit, V = st.value, FC = window.FanChart; if (!FC) return;
    const key = `${st.win}|${st.scheme}|${m.w.map((x) => x.toFixed(4)).join(',')}`;
    if (key !== fanKey) { const paths = C.fanHistorical(m.r, 21); fanData = { paths, q: FC.percentiles(paths, [0.01, 0.05, 0.10, 0.25, 0.5, 0.75, 0.90, 0.95, 0.99]) }; fanKey = key; }
    const qs = [0.01, 0.05, 0.10, 0.25, 0.5, 0.75, 0.90, 0.95, 0.99], bands = Object.fromEntries(qs.map((q, i) => [q, fanData.q[i]]));
    const tail = FC.percentiles(fanData.paths, [1 - st.alpha])[0];
    const xs = d3.range(0, 22), h = st.h;
    const atH = fanData.paths.map((p) => p[h]).sort((a, b) => a - b);
    const qv = C.quantile(atH, 1 - st.alpha), tailAtH = atH.filter((x) => x <= qv), esG = C.mean(tailAtH);
    const tableG = 1 - m.res.hist.varH;
    window.FanChart.draw(document.getElementById('rk-fan'), {
      xs, bands, V, alpha: st.alpha, tail, es: esG, samples: [],
      xFmt: (d, long) => (long ? `Trading day ${d}` : `${d}d`), xTicks: [0, 1, 5, 10, 15, 21],
      markers: [
        { x: h, g: qv, label: `Simulated VaR: −${eur((1 - qv) * V)}`, color: K.cssVar('--bad'), vline: true },
        { x: h, g: tableG, label: `Table VaR (1-day × √${h}): −${eur((1 - tableG) * V)}`, color: K.cssVar('--fg') },
        { x: h, g: esG, label: `Simulated ES: −${eur((1 - esG) * V)}`, color: K.cssVar('--hot') },
      ],
    });
    document.getElementById('rk-fan-note').textContent =
      `10,000 paths, each day's return drawn at random from the ${m.r.length} daily portfolio returns of the estimation window. ` +
      `At the selected ${hLabel()} horizon (vertical line) the ${confLabel()} boundary corresponds to a loss of ${eur((1 - qv) * V)} and the average loss beyond it to ${eur((1 - esG) * V)}; ` +
      `the table's historical VaR scaled with √${h} gives ${eur((1 - tableG) * V)}. ` +
      (h === 1 ? `At one day the simulation resamples the same ${m.r.length} returns, so it differs from the table only by sampling and interpolation${st.alpha >= 0.999 ? ' (at 99.9% both are close to the worst day in the window)' : ''}.` : 'The simulation compounds actual daily returns, so the two differ by the effect of compounding and drift; the gap shows how rough the square-root-of-time rule is.') +
      ` After a month, half the paths are between ${eur(bands[0.25][21] * V)} and ${eur(bands[0.75][21] * V)}.`;
  }

  function drawComp(m) {
    const K = window.DashKit, box = document.getElementById('rk-comp'), card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const rows = m.stocks.map((s, i) => ({ id: s.id, name: s.name, w: m.w[i], cv: m.cvar.component[i] / m.cvar.total, ce: m.ces.component[i] / m.ces.total }));
    const rowH = 30, top = 4, H = top + rows.length * rowH + 22;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const left = d3.max(rows, (d) => K.measure(svg, d.name)) + 10;
    const lo = Math.min(0, d3.min(rows, (d) => Math.min(d.cv, d.ce)));
    const x = d3.scaleLinear([lo, d3.max(rows, (d) => Math.max(d.cv, d.ce, d.w)) * 1.1], [left, W - 8]).nice();
    const y = d3.scaleBand(rows.map((d) => d.id), [top, top + rows.length * rowH]).padding(0.2);
    for (const t of x.ticks(4)) {
      svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', top).attr('y2', H - 20).attr('stroke', t === 0 ? 'var(--axis)' : 'var(--grid)');
      svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.format('.0%')(t));
    }
    const g = svg.append('g').selectAll('g').data(rows).join('g');
    g.append('text').attr('class', 'tick').attr('x', left - 8).attr('y', (d) => y(d.id) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').style('fill', (d) => K.colorOf(d.id)).text((d) => d.name);
    const bw = y.bandwidth() / 2 - 1;
    g.append('rect').attr('x', (d) => x(Math.min(0, d.cv))).attr('y', (d) => y(d.id)).attr('height', bw).attr('width', (d) => Math.abs(x(d.cv) - x(0))).attr('rx', 3).attr('fill', (d) => K.colorOf(d.id));
    g.append('rect').attr('x', (d) => x(Math.min(0, d.ce))).attr('y', (d) => y(d.id) + bw + 2).attr('height', bw).attr('width', (d) => Math.abs(x(d.ce) - x(0))).attr('rx', 3).attr('fill', (d) => K.colorOf(d.id)).attr('opacity', 0.45);
    g.append('line').attr('x1', (d) => x(d.w)).attr('x2', (d) => x(d.w)).attr('y1', (d) => y(d.id) - 2).attr('y2', (d) => y(d.id) + y.bandwidth() + 2).attr('stroke', 'var(--fg)').attr('stroke-width', 2);
    g.append('rect').attr('x', 0).attr('y', (d) => y(d.id)).attr('width', W).attr('height', y.bandwidth()).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev, d) => K.showTip(card, ev, d.name, [{ name: 'Weight', value: p1(d.w) }, { name: 'Share of VaR', value: p1(d.cv) }, { name: 'Share of ES', value: p1(d.ce) }]))
      .on('pointerleave', () => K.hideTip(card));
    K.legendItems(box, [{ color: K.cssVar('--muted'), label: 'Solid: share of VaR' }, { color: K.cssVar('--line'), label: 'Pale: share of ES' }, { color: K.cssVar('--fg'), label: 'Line: capital weight' }]);
  }

  function drawPillars(m) {
    const K = window.DashKit, V = st.value, z = C.normInv(st.alpha);
    const secs = [...new Set(m.stocks.map((s) => s.sector))];
    const rows = secs.map((sec) => {
      const idx = m.stocks.map((s, i) => (s.sector === sec ? i : -1)).filter((i) => i >= 0);
      const wv = m.w.map((x, i) => (idx.includes(i) ? x : 0));
      const sp = Math.sqrt(wv.reduce((s, wi, i) => s + wi * wv.reduce((t, wj, j) => t + wj * m.Sigma[i][j], 0), 0));
      return { sec, w: d3.sum(idx, (i) => m.w[i]), alone: z * sp * m.sq * V, comp: d3.sum(idx, (i) => m.cvar.component[i]) * m.sq * V,
        sv: d3.sum(idx, (i) => m.cvar.component[i]) / m.cvar.total, se: d3.sum(idx, (i) => m.ces.component[i]) / m.ces.total };
    });
    document.querySelector('#rk-pillar-table tbody').replaceChildren(...rows.map((d) => {
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      const n = td('', 'l'); const dot = K.el('i', { className: 'dot' }); dot.style.cssText = `margin-right:8px;background:${K.sectorColor(d.sec)}`; n.append(dot, document.createTextNode(d.sec));
      tr.append(n, td(p1(d.w)), td(eur(d.alone)), td(eur(d.comp)), td(p1(d.sv)), td(p1(d.se)));
      return tr;
    }));
    // waterfall-style bar: stand-alone sum vs diversified
    const box = document.getElementById('rk-divbar'); box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const alone = d3.sum(rows, (d) => d.alone), port = m.cvar.total * m.sq * V;
    const H = 110, svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleLinear([0, alone], [0, W - 4]);
    let acc = 0;
    rows.forEach((d) => { svg.append('rect').attr('x', x(acc)).attr('y', 18).attr('width', Math.max(0, x(d.alone) - 1)).attr('height', 22).attr('rx', 3).attr('fill', K.sectorColor(d.sec)); acc += d.alone; });
    svg.append('text').attr('class', 'tick').attr('x', 0).attr('y', 12).text(`Sum of stand-alone pillar VaRs: ${eur(alone)}`);
    svg.append('rect').attr('x', 0).attr('y', 66).attr('width', x(port)).attr('height', 22).attr('rx', 3).attr('fill', 'var(--fg)');
    svg.append('rect').attr('x', x(port)).attr('y', 66).attr('width', Math.max(0, x(alone) - x(port))).attr('height', 22).attr('rx', 3).attr('fill', 'none').attr('stroke', K.cssVar('--ok')).attr('stroke-dasharray', '4 3');
    svg.append('text').attr('class', 'tick').attr('x', 0).attr('y', 60).text(`Portfolio VaR: ${eur(port)} · saved by diversification: ${eur(alone - port)}`);
    document.getElementById('rk-tailnote').textContent = `Stand-alone and component VaR are parametric (normal, zero mean). Component ES uses the ${m.ces.tailDays} historical tail day${m.ces.tailDays === 1 ? '' : 's'} at ${confLabel()}` + (m.ces.tailDays < 5 ? ', so its split is driven by very few days and is noisy.' : '.');
  }

  function drawBacktest(m) {
    const K = window.DashKit, V = st.value, box = document.getElementById('rk-bt'), card = box.closest('.card');
    const models = [['hist', 'Historical (250d)'], ['normal', 'Normal (250d)'], ['ewma', 'EWMA normal'], ['fhs', 'Filtered HS']];
    const all = Object.fromEntries(models.map(([id]) => [id, C.rollingVaR(m.rAll, st.alpha, id, 250)]));
    document.querySelector('#rk-bt-table tbody').replaceChildren(...models.map(([id, name]) => {
      const bt = all[id], hits = bt.map((d) => d.hit), ku = C.kupiec(hits, st.alpha), ch = C.christoffersen(hits), zone = C.baselZone(ku.x, ku.T, st.alpha);
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      const zt = td(''); zt.appendChild(K.el('span', { className: 'zone ' + zone, textContent: zone }));
      const pf = (p) => d3.format('.3f')(p) + (p < 0.05 ? ' ✗' : ' ✓');
      const nm = td(name, 'l'); if (id === st.btModel) nm.style.fontWeight = 600;
      tr.append(nm, td(String(ku.T)), td(String(ku.x)), td(d3.format('.1f')(ku.expected)), td(pf(ku.p)), td(pf(ch.p)), zt);
      return tr;
    }));
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const bt = all[st.btModel], H = W < 520 ? 240 : 300;
    const pts = bt.map((d) => ({ x: K.parse(m.datesAll[d.t]), pnl: d.ret * V, var: -d.var * V, hit: d.hit }));
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const y = d3.scaleLinear([Math.min(d3.min(pts, (d) => d.pnl), d3.min(pts, (d) => d.var)) * 1.05, d3.max(pts, (d) => d.pnl) * 1.05], [H - 24, 8]).nice();
    const left = d3.max(y.ticks(5), (t) => K.measure(svg, d3.format(',.0f')(t))) + 10;
    const x = d3.scaleUtc(d3.extent(pts, (d) => d.x), [left, W - 8]);
    for (const t of y.ticks(5)) {
      svg.append('line').attr('x1', left).attr('x2', W - 8).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === 0 ? 'var(--axis)' : 'var(--grid)');
      svg.append('text').attr('class', 'tick').attr('x', left - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(d3.format(',.0f')(t));
    }
    for (const t of x.ticks(Math.max(2, Math.floor((W - left) / 90)))) svg.append('text').attr('class', 'tick').attr('x', x(t)).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.utcFormat('%b %y')(t));
    const okC = K.cssVar('--accent'), badC = K.cssVar('--bad');
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.pnl)).attr('r', (d) => (d.hit ? 4 : 2.2))
      .attr('fill', (d) => (d.hit ? badC : okC)).attr('opacity', (d) => (d.hit ? 1 : 0.5));
    svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', 'var(--fg)').attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('d', d3.line().x((d) => x(d.x)).y((d) => y(d.var)));
    const times = pts.map((d) => +d.x);
    const rule = svg.append('line').attr('y1', 8).attr('y2', H - 24).attr('stroke', 'var(--axis)').attr('opacity', 0);
    svg.append('rect').attr('x', left).attr('width', W - left - 8).attr('height', H).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev) => {
        const tv = +x.invert(d3.pointer(ev)[0]); const i = Math.max(0, Math.min(pts.length - 1, d3.bisectLeft(times, tv))); const d = pts[i];
        rule.attr('x1', x(d.x)).attr('x2', x(d.x)).attr('opacity', 1);
        K.showTip(card, ev, K.fmtDay(d.x), [{ color: d.hit ? badC : okC, name: 'P&L', value: eurS(d.pnl) }, { color: K.cssVar('--fg'), name: `VaR ${confLabel()}`, value: eur(-d.var) }]);
      })
      .on('pointerleave', () => { rule.attr('opacity', 0); K.hideTip(card); });
    K.legendItems(box, [{ color: okC, label: 'Daily P&L' }, { color: badC, label: 'Exception' }, { color: K.cssVar('--fg'), label: `1-day VaR ${confLabel()} (as a loss)` }]);
  }

  function drawStress(m) {
    const K = window.DashKit, V = st.value;
    const secs = [...new Set(m.stocks.map((s) => s.sector))];
    const pw = Object.fromEntries(secs.map((sec) => [sec, d3.sum(m.stocks.map((s, i) => (s.sector === sec ? m.w[i] : 0)))]));
    const rows = [];
    const wd = (h, name) => { const x = C.worstWindow(m.rAll, h); rows.push({ name: `${name} (to ${K.fmtDay(K.parse(m.datesAll[x.end]))})`, type: 'Historical', pnl: x.ret }); };
    wd(1, 'Worst day'); wd(5, 'Worst week'); wd(21, 'Worst month');
    const dd = C.drawdowns(m.rAll);
    rows.push({ name: `Max drawdown (${K.fmtDay(K.parse(m.datesAll[dd.peakIdx]))} – ${K.fmtDay(K.parse(m.datesAll[dd.troughIdx]))})`, type: 'Historical', pnl: dd.max });
    for (const s of SCENARIOS) rows.push({ name: s.name, type: 'Hypothetical', pnl: secs.reduce((acc, sec) => acc + pw[sec] * (s.shock[sec] || 0), 0) });
    document.querySelector('#rk-stress-table tbody').replaceChildren(...rows.map((d) => {
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      tr.append(td(d.name, 'l'), td(d.type, 'l muted'), td(eurS(d.pnl * V), d.pnl < 0 ? 'neg' : 'pos'), td((d.pnl > 0 ? '+' : '') + p1(d.pnl), d.pnl < 0 ? 'neg' : 'pos'));
      return tr;
    }));
  }

  function drawCorrStress(m) {
    if (!m) return;
    const K = window.DashKit, V = st.value, z = C.normInv(st.alpha);
    document.getElementById('rk-rho-v').textContent = st.rho.toFixed(2);
    document.getElementById('rk-volm-v').textContent = st.volm.toFixed(1) + '×';
    const k = m.w.length, sd = m.Sigma.map((row, i) => Math.sqrt(row[i]));
    const varOf = (rhoFn, vm) => { let s = 0; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) s += m.w[i] * m.w[j] * sd[i] * sd[j] * vm * vm * rhoFn(i, j); return z * Math.sqrt(s) * m.sq * V; };
    const actualRho = (i, j) => m.Sigma[i][j] / (sd[i] * sd[j]);
    const base = varOf(actualRho, 1), stressedC = varOf((i, j) => (i === j ? 1 : st.rho), 1), both = varOf((i, j) => (i === j ? 1 : Math.max(st.rho, actualRho(i, j))), st.volm);
    const full = varOf(() => 1, 1);
    document.getElementById('rk-corrstress').replaceChildren(
      K.stat('Parametric VaR, actual ρ', eur(base), `${confLabel()} ${hLabel()}, zero mean`),
      K.stat(`All correlations ${st.rho.toFixed(2)}`, eur(stressedC), `${eurS(stressedC - base)} vs actual`),
      K.stat(`+ vol ×${st.volm.toFixed(1)}`, eur(both), `${eurS(both - base)} vs actual`, null, true),
      K.stat('No diversification (ρ = 1)', eur(full), 'upper bound for normal VaR'));
    // drawdown chart of the portfolio, full sample
    const dd = C.drawdowns(m.rAll).dd;
    K.lineChart(document.getElementById('rk-dd'), [{ name: 'Drawdown', color: K.cssVar('--bad'), points: dd.map((v, t) => ({ x: K.parse(m.datesAll[t]), y: v })) }],
      { yFmt: d3.format('.0%'), yTip: d3.format('.1%'), yDomain: [Math.min(-0.05, d3.min(dd) * 1.1), 0], height: 220, head: (d) => 'Drawdown on ' + K.fmtDay(d) });
  }

  function drawPerf(m) {
    if (!m) return;
    const K = window.DashKit;
    const start = st.win ? Math.max(0, m.R[0].length - st.win) : 0;
    const etfs = K.ETFS.map((e) => {
      const idx = m.stocks.map((s, i) => (s.sector === e.sector ? i : -1)).filter((i) => i >= 0);
      return { name: e.name, color: K.sectorColor(e.sector), r: m.R[0].slice(start).map((_, t) => d3.mean(idx, (i) => m.R[i][start + t])) };
    });
    const series = [{ name: 'Portfolio (selected weights)', color: K.cssVar('--fg'), r: m.r, bold: true }, ...etfs,
      ...m.stocks.map((s, i) => ({ name: s.name, color: K.colorOf(s.id), r: m.R[i].slice(start) }))];
    const f2 = d3.format('.2f');
    document.querySelector('#rk-perf-table tbody').replaceChildren(...series.map((s) => {
      const p = C.performance(s.r, st.rf);
      const tr = K.el('tr'); const td = (t, c) => K.el('td', { textContent: t, className: c || '' });
      const n = td('', 'l'); const dot = K.el('i', { className: 'dot' }); dot.style.cssText = `margin-right:8px;background:${s.color}`;
      n.append(dot, s.bold ? K.el('b', { textContent: s.name }) : document.createTextNode(s.name));
      tr.append(n, td(p1(p.annRet), p.annRet >= 0 ? 'pos' : 'neg'), td(p1(p.annVol)), td(f2(p.sharpe)), td(f2(p.sortino)), td(p1(p.maxDD), 'neg'), td(f2(p.calmar)),
        td(f2(p.skew)), td(f2(p.kurt)), td(p2(p.var999)), td(p2(p.es975)));
      return tr;
    }));
  }

  function drawWeights(m) {
    const K = window.DashKit, box = document.getElementById('rk-weights'), card = box.closest('.card');
    box.replaceChildren();
    const W = box.clientWidth; if (!W) return;
    const H = 150, n = m.w.length;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleBand(m.stocks.map((s) => s.id), [30, W - 4]).padding(0.25);
    const y = d3.scaleLinear([0, Math.max(0.2, d3.max(m.w) * 1.15)], [H - 24, 8]).nice();
    for (const t of y.ticks(4)) {
      svg.append('line').attr('x1', 30).attr('x2', W - 4).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--grid)');
      svg.append('text').attr('class', 'tick').attr('x', 26).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(d3.format('.0%')(t));
    }
    const code = (s) => s.sector[0] + s.name.slice(-1);
    m.stocks.forEach((s, i) => {
      svg.append('rect').attr('x', x(s.id)).attr('width', x.bandwidth()).attr('y', y(m.w[i])).attr('height', y(0) - y(m.w[i])).attr('rx', 3).attr('fill', K.colorOf(s.id))
        .on('pointermove pointerdown', (ev) => K.showTip(card, ev, s.name, [{ name: 'Weight', value: p1(m.w[i]) }, { name: 'Amount', value: eur(m.w[i] * st.value) }]))
        .on('pointerleave', () => K.hideTip(card));
      svg.append('text').attr('class', 'tick').attr('x', x(s.id) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').style('fill', K.colorOf(s.id)).text(W < 520 ? code(s) : s.name);
      if (x.bandwidth() > 26) svg.append('text').attr('class', 'tick').attr('x', x(s.id) + x.bandwidth() / 2).attr('y', y(m.w[i]) - 4).attr('text-anchor', 'middle').text(d3.format('.0%')(m.w[i]));
    });
    void n;
  }

  window.RiskTab = { draw, state: st, compute };
})();
