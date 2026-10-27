// Calculation engine. A pure function of the saved state: every number the
// app shows is derived here, so the views never do their own maths.

export const STATUSES = ['Completed', 'In Progress', 'Planned', 'Failed', 'Withdrawn', 'Exempt', 'Credit Transfer'];
export const CATEGORIES = ['Core', 'Major', 'Minor', 'Elective', 'Capstone', 'Honours', 'Breadth'];
export const TYPES = ['Assignment', 'Quiz', 'Exam', 'Project', 'Report', 'Presentation', 'Lab', 'Participation', 'Thesis', 'Bonus'];
export const SESSIONS = ['Autumn', 'Spring', 'Summer', 'Winter'];
export const SESSIONS_SHORT = ['Aut', 'Spr', 'Sum', 'Win'];

// Quasi-random lattice for the Monte Carlo trials: one generator per remaining
// subject plus a stream for the common form shift. Fixed so results are stable.
export const MC_N = 2003;
const MC_Z = [1703, 1868, 440, 198, 690, 1312, 991, 1147, 416, 1389, 1927, 767, 245, 611, 976, 1641, 438, 798, 960, 432, 595, 1770, 1798, 1410, 1636, 1938, 1473, 763, 1445, 1151, 1219];
const MC_ALPHA0 = 0.414213562373;
const PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293];
const frac = x => x - Math.floor(x);
const latticeZ = k => (k < MC_Z.length ? MC_Z[k] : (MC_Z[k % MC_Z.length] * (Math.floor(k / MC_Z.length) * 2 + 3)) % MC_N || 1);
const latticeAlpha = k => frac(Math.sqrt(PRIMES[k % PRIMES.length] + (k >= PRIMES.length ? 2 * k : 0)));

// ---------- small numeric helpers ----------
const isNum = v => typeof v === 'number' && Number.isFinite(v);
export const num = v => {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,%\s]/g, ''));
  return Number.isFinite(n) ? n : '';
};
const round = (x, d = 0) => { const f = 10 ** d; return Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9) / f; };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const median = arr => {
  const a = arr.filter(isNum).sort((p, q) => p - q);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const percentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const r = p * (sorted.length - 1), lo = Math.floor(r), hi = Math.ceil(r);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (r - lo);
};
const stdev = arr => {
  if (arr.length < 2) return 0;
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
};
const floorTo = (x, step) => Math.floor(x / step + 1e-9) * step;
const ceilTo = (x, step) => Math.ceil(x / step - 1e-9) * step;

// Standard normal CDF (Hart / West double-precision algorithm).
export function normCdf(z) {
  const x = Math.abs(z);
  let c;
  if (x > 37) c = 0;
  else {
    const e = Math.exp(-x * x / 2);
    if (x < 7.07106781186547) {
      let b = 3.52624965998911e-02 * x + 0.700383064443688;
      b = b * x + 6.37396220353165; b = b * x + 33.912866078383; b = b * x + 112.079291497871;
      b = b * x + 221.213596169931; b = b * x + 220.206867912376;
      let d = 8.83883476483184e-02 * x + 1.75566716318264;
      d = d * x + 16.064177579207; d = d * x + 86.7807322029461; d = d * x + 296.564248779674;
      d = d * x + 637.333633378831; d = d * x + 793.826512519948; d = d * x + 440.413735824752;
      c = e * b / d;
    } else {
      let b = x + 0.65; b = x + 4 / b; b = x + 3 / b; b = x + 2 / b; b = x + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return z > 0 ? 1 - c : c;
}

// Inverse standard normal (Acklam, refined with one Halley step).
export function normInv(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  let x;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}

// ---------- dates ----------
export function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
const dayDiff = (a, b) => Math.round((a - b) / 86400000);

// ---------- text helpers mirroring the workbook's TEXT() formats ----------
export const f0 = x => (isNum(x) ? round(x, 0).toFixed(0) : '—');
export const f1 = x => (isNum(x) ? round(x, 1).toFixed(1) : '—');
export const f2 = x => (isNum(x) ? round(x, 2).toFixed(2) : '—');
export const pct0 = x => (isNum(x) ? round(x * 100, 0).toFixed(0) + '%' : '—');
export const pct1 = x => (isNum(x) ? round(x * 100, 1).toFixed(1) + '%' : '—');
const signed1 = x => (x >= 0 ? '+' : '') + f1(x);

export function termLabel(key) {
  if (!key || key >= 99) return '—';
  return `Y${Math.floor(key / 10)} S${key % 10}`;
}
export function sessionName(key, commenceYear, short = false) {
  if (!key || key >= 99) return '';
  const s = clamp(key % 10, 1, 4) - 1;
  return `${(short ? SESSIONS_SHORT : SESSIONS)[s]} ${(Number(commenceYear) || 0) + Math.floor(key / 10) - 1}`;
}

// ---------- settings ----------
export function normaliseSettings(s = {}) {
  const n = (v, d) => (num(v) === '' ? d : num(v));
  return {
    ...s,
    gpaScale: n(s.gpaScale, 7) === 4 ? 4 : 7,
    totalCP: n(s.totalCP, 240),
    cpPerSem: n(s.cpPerSem, 40),
    summerCP: n(s.summerCP, 20),
    passMark: n(s.passMark, 50),
    creditThr: n(s.creditThr, 65),
    distThr: n(s.distThr, 75),
    hdThr: n(s.hdThr, 85),
    targetWAM: n(s.targetWAM, 75),
    targetGPA: n(s.targetGPA, 6),
    countIP: s.countIP === 'Yes' ? 'Yes' : 'No',
    failCountsCP: s.failCountsCP === 'Yes' ? 'Yes' : 'No',
    curYear: n(s.curYear, 1),
    curSem: n(s.curSem, 1),
    commenceYear: n(s.commenceYear, new Date().getFullYear()),
    uniMedalGPA: n(s.uniMedalGPA, 6),
    deansMedalGPA: n(s.deansMedalGPA, 6.25),
    bands: (s.bands || []).filter(b => b && String(b.grade ?? '').trim() !== '').map(b => ({
      min: n(b.min, 0), max: n(b.max, 0), grade: String(b.grade).trim(), gp4: n(b.gp4, 0), gp7: n(b.gp7, 0), desc: b.desc || '',
    })),
    classes: (s.classes || []).filter(c => c && String(c.name ?? '').trim() !== '').map(c => ({
      name: String(c.name).trim(), badge: c.badge || '', min: n(c.min, 0), notes: c.notes || '',
    })),
    discLabels: (s.discLabels || []).filter(d => d && d.prefix),
  };
}

// ---------- main entry ----------
export function compute(state, opts = {}) {
  const S = normaliseSettings(state.settings);
  const today = parseDate(opts.today) || parseDate(new Date());
  const lookupName = opts.lookupName || (() => '');
  const bands = S.bands;
  const gpOf = i => (i === '' || !bands[i] ? '' : (S.gpaScale === 4 ? bands[i].gp4 : bands[i].gp7));
  const bandIdx = m => {
    if (!isNum(m)) return '';
    const r = round(m, 2);
    const i = bands.findIndex(b => r >= b.min && r <= b.max);
    return i < 0 ? '' : i;
  };
  const gradeOf = m => { const i = bandIdx(m); return i === '' ? '' : bands[i].grade; };
  const bandMins = bands.map(b => b.min).sort((a, b) => a - b);
  const nextMinAbove = m => { const k = bandMins.filter(x => x <= m).length; return k < bandMins.length ? bandMins[k] : ''; };
  const bandByMin = mn => bands.findIndex(b => b.min === mn);
  const maxGPA = S.gpaScale === 4 ? 4 : 7;

  // ----- assessments: per-row raw values (needed before the ledger) -----
  const subjectsIn = (state.subjects || []).map((s, i) => ({ ...s, _i: i }));
  const ledgerCodes = new Set(subjectsIn.map(s => cleanCode(s.code)).filter(Boolean));
  const asRows = (state.assessments || []).map((a, i) => {
    const code = cleanCode(a.code);
    const weight = num(a.weight), score = num(a.score), outOf = num(a.outOf);
    const type = a.type || '';
    const graded = score !== '' && outOf !== '' && outOf !== 0;
    const pct = graded ? score / outOf : '';
    const wgt = !code || weight === '' || type === 'Bonus' ? 0 : weight;
    const due = parseDate(a.due);
    return {
      id: a.id, i, code, name: a.name || '', type, weight, score, outOf, due, dueStr: a.due || '', comment: a.comment || '', est: a.est || '',
      graded, pct, weighted: pct === '' || weight === '' ? '' : pct * weight, wgt,
      contrib: graded ? pct * wgt : 0, wdone: graded ? wgt : 0,
      bonus: graded && type === 'Bonus' && weight !== '' ? pct * weight : 0,
      pctNum: graded ? pct * 100 : 0,
      grade: pct === '' || type === 'Bonus' ? '' : gradeOf(pct * 100),
    };
  });
  const byCode = new Map();
  for (const a of asRows) {
    if (!a.code) continue;
    if (!byCode.has(a.code)) byCode.set(a.code, []);
    byCode.get(a.code).push(a);
  }
  const sumBy = (code, f, filt = () => true) => (byCode.get(code) || []).filter(filt).reduce((s, a) => s + f(a), 0);

  // ----- ledger -----
  const countIP = S.countIP === 'Yes';
  const L = subjectsIn.map(s => {
    const code = cleanCode(s.code);
    const status = s.status || '';
    const cp = num(s.cp);
    const markIn = num(s.mark);
    // A mark outside 0–100 is a typo: leave it out of every average and let Data health flag it.
    const badMark = markIn !== '' && (markIn < 0 || markIn > 100);
    let mark = badMark ? '' : markIn;
    let fromAssess = false;
    if (mark === '' && (status === 'In Progress' || status === 'Completed')) {
      const wd = sumBy(code, a => a.wdone);
      if (wd > 0) { mark = Math.min(100, sumBy(code, a => a.contrib) / wd * 100 + sumBy(code, a => a.bonus)); fromAssess = true; }
    }
    const cnt = mark !== '' && (status === 'Completed' || status === 'Failed' || (status === 'In Progress' && countIP)) ? 1 : 0;
    const band = bandIdx(mark);
    const gp = gpOf(band);
    const year = num(s.year), sem = num(s.sem);
    const term = year !== '' && sem !== '' ? year * 10 + sem : '';
    return {
      id: s.id, i: s._i, year, sem, code, name: (s.name || '').trim() || lookupName(code) || '', customName: (s.name || '').trim(),
      category: s.category || '', cp, status, markIn, mark, fromAssess, badMark, notes: s.notes || '', target: num(s.target),
      cnt, band, grade: band === '' ? '' : bands[band].grade, gp,
      qp: cnt ? mark * (cp || 0) : 0, cpc: cnt ? (cp || 0) : 0, gpc: cnt && band !== '' ? gp * (cp || 0) : 0,
      term, tkey: !code ? 0 : (term === '' ? 99 : term), disc: code ? code.slice(0, 4) : '',
      wgt: code ? sumBy(code, a => a.wgt) : 0,
    };
  });
  const codeCount = new Map();
  L.forEach(r => r.code && codeCount.set(r.code, (codeCount.get(r.code) || 0) + 1));

  const sum = (arr, f) => arr.reduce((s, r) => s + (f(r) || 0), 0);
  const QP = sum(L, r => r.qp), CPC = sum(L, r => r.cpc), GPC = sum(L, r => r.gpc);
  const WAM = CPC ? QP / CPC : 0;
  const GPA = CPC ? GPC / CPC : 0;
  const counted = L.filter(r => r.cnt);
  const marksC = counted.map(r => r.mark);

  L.forEach((r, idx) => {
    r.dup = r.code ? codeCount.get(r.code) : 0;
    if (r.term !== '') {
      const prior = L.filter((x, j) => (x.term !== '' && x.term < r.term) || (x.term === r.term && j <= idx));
      const cpS = sum(prior, x => x.cpc);
      r.cumWAM = r.code && cpS ? sum(prior, x => x.qp) / cpS : '';
      r.cumGPA = r.code && cpS ? sum(prior, x => x.gpc) / cpS : '';
    } else { r.cumWAM = ''; r.cumGPA = ''; }
    r.delta = r.cnt ? r.mark - WAM : '';
    r.rank = r.cnt ? marksC.filter(m => m > r.mark).length + 1 : '';
    r.flag = !r.code ? '' : r.badMark ? '⚠️' : r.dup > 1 ? '🔁' : r.status === 'Planned' ? '🗓' : r.status === 'In Progress' && r.mark === '' ? '⏳'
      : r.mark === '' ? '' : r.mark < S.passMark ? '❌' : r.mark >= S.hdThr ? '🔥' : r.mark >= WAM ? '▲' : '▼';
    r.rem = r.code && !r.cnt && (r.status === 'In Progress' || r.status === 'Planned') ? 1 : 0;
    r.trflag = !r.code ? 0 : ['Completed', 'Failed', 'Credit Transfer', 'Exempt'].includes(r.status) ? 1 : r.status === 'In Progress' ? 2 : 0;
  });
  const byTermThenRow = (a, b) => a.tkey - b.tkey || a.i - b.i;
  const chron = L.filter(r => r.code).sort(byTermThenRow);
  const ipRows = L.filter(r => r.status === 'In Progress');
  const remRows = L.filter(r => r.rem).sort(byTermThenRow);
  const transcript = L.filter(r => r.trflag > 0).sort((a, b) => a.trflag - b.trflag || byTermThenRow(a, b));

  // ----- core metrics -----
  const cpOf = st => sum(L.filter(r => r.status === st), r => r.cp);
  const CP_DONE = cpOf('Completed') + cpOf('Credit Transfer') + cpOf('Exempt') + (S.failCountsCP === 'Yes' ? cpOf('Failed') : 0);
  const SUBJ_DONE = L.filter(r => r.status === 'Completed').length;
  const SUBJ_TOTAL = L.filter(r => r.code).length;
  const SUBJ_IP = ipRows.length;
  const SUBJ_PLAN = L.filter(r => r.status === 'Planned').length;
  const CP_IP = cpOf('In Progress');
  const CP_PLANNED = cpOf('Planned') + CP_IP;
  const CP_REMAIN = Math.max(0, S.totalCP - CP_DONE);
  const MARK_N = counted.length;
  const SUM_X = sum(counted, r => r.mark);
  const SUM_X2 = sum(counted, r => r.mark ** 2);
  const MARK_MAX = MARK_N ? Math.max(...marksC) : 0;
  const MARK_MIN = MARK_N ? Math.min(...marksC) : 0;
  const MARK_AVG = MARK_N ? SUM_X / MARK_N : 0;
  const MARK_MED = MARK_N ? median(marksC) : 0;
  const MARK_SD = MARK_N < 2 ? 0 : Math.sqrt(Math.max(0, (MARK_N * SUM_X2 - SUM_X ** 2) / (MARK_N * (MARK_N - 1))));
  const best = counted.find(r => r.rank === 1);
  const worstRank = counted.reduce((m, r) => Math.max(m, r.rank), 0);
  const worst = MARK_N ? counted.find(r => r.rank === MARK_N) || counted.find(r => r.rank === worstRank) : null;
  const N_HD = counted.filter(r => r.grade === 'HD').length;
  const N_FAIL = counted.filter(r => r.mark < S.passMark).length;
  const HD_RATE = MARK_N ? N_HD / MARK_N : 0;
  const PASS_RATE = MARK_N ? 1 - N_FAIL / MARK_N : 0;
  const CP_PER_SEM = S.cpPerSem === 0 ? 24 : S.cpPerSem;
  const SEM_LEFT = Math.max(0, Math.ceil(CP_REMAIN / CP_PER_SEM - 1e-12));
  const CP_PCT = S.totalCP ? Math.min(1, CP_DONE / S.totalCP) : 0;
  const GPA_PCT = Math.min(1, GPA / maxGPA);
  const WAM_PCT_TARGET = S.targetWAM ? Math.min(1, WAM / S.targetWAM) : 0;
  const GPA_PCT_TARGET = S.targetGPA ? Math.min(1, GPA / S.targetGPA) : 0;
  const CP_TO_WAM = Math.max(0, S.totalCP - CP_DONE - sum(L.filter(r => r.status === 'In Progress'), r => r.cpc));
  const FINAL_CP = CPC + CP_TO_WAM;

  // ----- term table -----
  const termKeys = [...new Set(L.map(r => r.term).filter(t => t !== ''))].sort((a, b) => a - b);
  let idx = 0, cumQ = 0, cumC = 0, cumG = 0;
  const terms = termKeys.map(key => {
    const rows = L.filter(r => r.term === key);
    const cp = sum(rows, r => r.cpc), qp = sum(rows, r => r.qp), gpp = sum(rows, r => r.gpc);
    const has = cp > 0;
    if (has) idx++;
    cumQ += qp; cumC += cp; cumG += gpp;
    const cr = rows.filter(r => r.cnt);
    const gcount = g => cr.filter(r => r.grade === g).length;
    return {
      key, label: termLabel(key), session: sessionName(key, S.commenceYear), sessionShort: sessionName(key, S.commenceYear, true),
      n: cr.length, cp, qp, gp: gpp, wam: has ? qp / cp : '', gpa: has ? gpp / cp : '',
      cumCP: cumC, cumWAM: cumC ? cumQ / cumC : '', cumGPA: cumC ? cumG / cumC : '',
      idx: has ? idx : '', best: has ? Math.max(...cr.map(r => r.mark)) : '',
      hd: gcount('HD'), d: gcount('D'), c: gcount('C'), p: gcount('P'), f: gcount('F'),
      loaded: sum(rows.filter(r => r.status !== 'Withdrawn'), r => r.cp),
    };
  });
  const active = terms.filter(t => t.idx !== '');
  active.forEach((t, k) => { t.dWAM = k ? t.wam - active[k - 1].wam : ''; t.dGPA = k ? t.gpa - active[k - 1].gpa : ''; });
  const TERMS_N = active.length;
  const sx = sum(active, t => t.idx), sy = sum(active, t => t.wam), sxy = sum(active, t => t.idx * t.wam), sx2 = sum(active, t => t.idx ** 2), sy2 = sum(active, t => t.wam ** 2);
  const den = TERMS_N * sx2 - sx ** 2;
  const SLOPE = TERMS_N < 2 || !den ? 0 : (TERMS_N * sxy - sx * sy) / den;
  const INTERCEPT = TERMS_N < 2 ? WAM : (sy - SLOPE * sx) / TERMS_N;
  const r2den = den * (TERMS_N * sy2 - sy ** 2);
  const R2 = TERMS_N < 3 || !r2den ? 0 : (TERMS_N * sxy - sx * sy) ** 2 / r2den;
  const FORECAST_TERM = TERMS_N < 2 ? WAM : clamp(INTERCEPT + SLOPE * (TERMS_N + 1), 0, 100);
  const FORECAST_FINAL = CP_TO_WAM <= 0 ? WAM : clamp((WAM * CPC + FORECAST_TERM * CP_TO_WAM) / (CPC + CP_TO_WAM), 0, 100);
  const lastT = active[TERMS_N - 1], prevT = active[TERMS_N - 2];
  const LAST_TERM_WAM = lastT ? lastT.wam : 0;
  const PREV_TERM_WAM = TERMS_N >= 2 ? prevT.wam : 0;
  const MOMENTUM = TERMS_N < 2 ? 0 : LAST_TERM_WAM - PREV_TERM_WAM;
  const bestT = active.reduce((b, t) => (!b || t.wam > b.wam ? t : b), null);
  const CONSISTENCY = MARK_AVG === 0 ? 0 : Math.max(0, 1 - MARK_SD / MARK_AVG);
  const need = (target, cur) => (CP_TO_WAM <= 0 ? '' : (target * (CPC + CP_TO_WAM) - cur * CPC) / CP_TO_WAM);
  const NEED_AVG_WAM = need(S.targetWAM, WAM);
  const NEED_AVG_GPA = need(S.targetGPA, GPA);
  const MAX_POSSIBLE = CPC + CP_TO_WAM ? (WAM * CPC + 100 * CP_TO_WAM) / (CPC + CP_TO_WAM) : WAM;
  const MIN_POSSIBLE = CPC + CP_TO_WAM ? (WAM * CPC) / (CPC + CP_TO_WAM) : WAM;
  // The top grade in every remaining subject caps the final GPA, which is often well below the scale maximum.
  const TOP_BAND = bands.reduce((t, b) => (!t || gpOf(bands.indexOf(b)) > gpOf(bands.indexOf(t)) ? b : t), null);
  const MAX_POSSIBLE_GPA = CPC + CP_TO_WAM ? (GPC + (TOP_BAND ? gpOf(bands.indexOf(TOP_BAND)) : 0) * CP_TO_WAM) / (CPC + CP_TO_WAM) : GPA;
  const GOAL_FEASIBLE = CP_TO_WAM <= 0 ? (WAM >= S.targetWAM ? 1 : 0) : (NEED_AVG_WAM <= 100 ? 1 : 0);
  const PACE_CP_SEM = TERMS_N ? CP_DONE / TERMS_N : 0;
  const SEM_TO_FINISH = PACE_CP_SEM <= 0 ? SEM_LEFT : Math.ceil(CP_REMAIN / PACE_CP_SEM - 1e-12);

  const classes = S.classes;
  const classIdxFor = w => { const i = classes.findIndex(c => w >= c.min); return i < 0 ? classes.length - 1 : i; };
  const CLASS_IDX = classes.length ? classIdxFor(WAM) : -1;
  const cls = classes[CLASS_IDX] || { name: '—', badge: '', min: 0 };
  const NEXT = CLASS_IDX > 0 ? classes[CLASS_IDX - 1] : null;
  const NEED_NEXT_CLASS = !NEXT || CP_TO_WAM <= 0 ? '' : (NEXT.min * (CPC + CP_TO_WAM) - WAM * CPC) / CP_TO_WAM;

  // ----- assessments: derived per row -----
  const ipCodes = new Set(ipRows.map(r => r.code));
  const nameOf = code => { const r = L.find(x => x.code === code); return r ? r.name : ''; };
  asRows.forEach(a => {
    a.subject = !a.code ? '' : ledgerCodes.has(a.code) ? nameOf(a.code) : '⚠ code not in Ledger';
    a.days = a.due ? dayDiff(a.due, today) : '';
    a.statusText = !a.name ? '' : a.graded ? '✅ Graded' : !a.due ? '⏳ Pending' : a.days < 0 ? '❌ Overdue' : a.days <= 7 ? `🔥 Due in ${a.days}d` : '🗓 Upcoming';
    a.statusKind = !a.name ? '' : a.graded ? 'graded' : !a.due ? 'pending' : a.days < 0 ? 'overdue' : a.days <= 7 ? 'soon' : 'upcoming';
    a.open = !a.code || a.type === 'Bonus' || a.wgt <= 0 || !ipCodes.has(a.code) ? 0
      : (!a.graded || a.est === 'Yes' || (a.est !== 'No' && a.graded && a.due && a.due > today)) ? 1 : 0;
  });
  const dueList = asRows.filter(a => a.name && !a.graded && a.due).sort((x, y) => x.due - y.due || x.i - y.i);
  const UNGRADED_ASSESS = asRows.filter(a => a.name && !a.graded).length;
  const OVERDUE_N = asRows.filter(a => a.name && !a.graded && a.due && a.due < today).length;
  const DUE_SOON_N = asRows.filter(a => a.name && !a.graded && a.due && a.days >= 0 && a.days <= 14).length;
  const UNLINKED = [...new Set(asRows.filter(a => a.code && !ledgerCodes.has(a.code)).map(a => a.code))];

  const tracker = ipRows.map(r => {
    const logged = sumBy(r.code, a => a.wgt), graded = sumBy(r.code, a => a.wdone), contrib = sumBy(r.code, a => a.contrib), bonus = sumBy(r.code, a => a.bonus);
    const sofar = graded === 0 ? '' : Math.min(100, contrib / graded * 100 + bonus);
    const remaining = Math.max(0, 100 - graded);
    const needFor = thr => (remaining <= 0 ? '' : round((thr - bonus - contrib) / remaining * 100, 1));
    const nHD = needFor(S.hdThr), nD = needFor(S.distThr), nC = needFor(S.creditThr);
    let statusText, kind;
    if (remaining <= 0) {
      if (sofar >= S.hdThr) [statusText, kind] = ['🔥 HD banked', 'good'];
      else if (sofar >= S.distThr) [statusText, kind] = ['⭐ D banked', 'good'];
      else if (sofar >= S.creditThr) [statusText, kind] = ['👍 C banked', 'neutral'];
      else if (sofar >= S.passMark) [statusText, kind] = ['✅ Passed', 'neutral'];
      else [statusText, kind] = ['❌ Below pass', 'critical'];
    } else if (nHD > 100) [statusText, kind] = ['🚫 HD out of reach', 'serious'];
    else if (nHD <= S.passMark) [statusText, kind] = ['😎 HD locked in', 'good'];
    else if (nHD <= S.distThr) [statusText, kind] = ['🎯 HD on track', 'good'];
    else [statusText, kind] = ['🔥 Push for HD', 'warning'];
    return { code: r.code, name: r.name, logged, graded, sofar, remaining, contrib, bonus, needHD: nHD, needD: nD, needC: nC, statusText, kind };
  });
  // ----- per-subject mark targets: what the ungraded assessments need to land the mark the student wants -----
  const targetPlans = new Map(L.filter(r => r.code && r.target !== '' && r.status !== 'Withdrawn').map(r => {
    const T = r.target;
    const contrib = sumBy(r.code, a => a.contrib), gradedW = sumBy(r.code, a => a.wdone);
    const banked = Math.min(100, contrib + sumBy(r.code, a => a.bonus));
    const remW = Math.max(0, 100 - gradedW);
    const avg = gradedW > 0 ? contrib / gradedW * 100 : '';
    const done = (r.status === 'Completed' || r.status === 'Failed') && r.mark !== '';
    const need = !done && remW > 0 ? (T - banked) / remW * 100 : '';
    const open = (byCode.get(r.code) || []).filter(a => a.wgt > 0 && !a.graded);
    let kind, text;
    if (done) [kind, text] = r.mark >= T ? ['good', `✅ Target met with a final mark of ${f1(r.mark)}`] : ['serious', `Finished ${f1(T - r.mark)} marks short with ${f1(r.mark)}`];
    else if (banked >= T) [kind, text] = ['good', `✅ Target secured: you have already banked ${f1(banked)} marks, so there is nothing to worry about`];
    else if (remW <= 0) [kind, text] = ['serious', `Every assessment is graded and the mark is ${f1(banked)}, ${f1(T - banked)} short`];
    else if (need > 100) [kind, text] = ['critical', `🚫 Out of reach: full marks on the remaining ${f0(remW)}% would finish on ${f1(Math.min(100, banked + remW))}`];
    else if (avg === '') [kind, text] = ['info', `🎯 Average ${f1(need)}% across all assessments`];
    else if (need <= avg) [kind, text] = ['good', `🎯 On track: keep averaging ${f1(need)}% on what is left (you are on ${f1(avg)}% so far)`];
    else [kind, text] = ['warning', `🔥 Lift your average from ${f1(avg)}% to ${f1(need)}% on what is left`];
    return [r.code, {
      code: r.code, id: r.id, target: T, grade: gradeOf(T), banked, gradedW, remW, avg, need, gap: Math.max(0, T - banked), kind, text, done,
      items: need === '' || need <= 0 || need > 100 ? [] : open.map(a => ({ name: a.name || 'Untitled item', weight: a.wgt, marks: a.wgt * need / 100, score: a.outOf !== '' ? need / 100 * a.outOf : '', outOf: a.outOf })),
      unlogged: Math.max(0, remW - open.reduce((s, a) => s + a.wgt, 0)),
    }];
  }));
  tracker.forEach(t => { const p = targetPlans.get(t.code); t.target = p ? p.target : ''; t.needT = p ? p.need : ''; t.targetKind = p ? p.kind : ''; });
  const IP_HD_BANKED = tracker.filter(t => t.remaining <= 0 && t.sofar >= S.hdThr).length;
  const IP_ON_TRACK_HD = tracker.filter(t => (t.remaining <= 0 && t.sofar >= S.hdThr) || (t.remaining > 0 && t.needHD <= 100)).length;

  // ----- data health -----
  const WEIGHT_ERRORS = L.filter(r => r.code && r.wgt > 100.01).length + L.filter(r => r.code && r.status === 'Completed' && r.wgt > 0 && r.wgt < 99.99).length;
  const weightIssues = L.filter(r => r.code && (r.wgt > 100.01 || (r.status === 'Completed' && r.wgt > 0 && r.wgt < 99.99)));
  const DUP_CODES = L.filter(r => r.code && r.dup > 1).length;
  const CP_MISSING = L.filter(r => r.code && r.cp === '').length;
  const STAT_MISSING = L.filter(r => r.code && !r.status).length;
  const BAND_GAP = bands.length ? 0 : 1;
  const AT_RISK_N = N_FAIL;
  const BAD_MARKS = L.filter(r => r.code && r.badMark).length;
  const ISSUE_COUNT = DUP_CODES + CP_MISSING + STAT_MISSING + BAND_GAP + AT_RISK_N + OVERDUE_N + WEIGHT_ERRORS + UNLINKED.length + BAD_MARKS;
  const HEALTH_MSG = ISSUE_COUNT === 0 ? '✅ All clean'
    : BAD_MARKS > 0 ? `⚠️ ${BAD_MARKS} mark(s) outside 0–100, left out of your averages`
    : AT_RISK_N > 0 ? `❌ ${AT_RISK_N} fail(s) to review`
      : UNLINKED.length > 0 ? `🆕 ${UNLINKED.length} subject(s) logged in Assessments but missing from Subjects`
        : OVERDUE_N > 0 ? `⏰ ${OVERDUE_N} overdue item(s)`
          : DUP_CODES > 0 ? '🔁 Duplicate subject code'
            : WEIGHT_ERRORS > 0 ? '⚖️ Weights ≠ 100%'
              : CP_MISSING + STAT_MISSING > 0 ? '⚠️ Missing CP or status'
                : BAND_GAP ? '⚠️ No grade bands set' : `⚠️ ${ISSUE_COUNT} issue(s)`;

  // ----- narrative -----
  const ETA_TEXT = CP_REMAIN <= 0 ? '🎓 Degree complete' : `≈ ${SEM_LEFT} semester(s) to go`;
  const TREND_TEXT = TERMS_N < 2 ? 'Not enough history yet' : SLOPE > 0.25 ? `📈 Improving ${signed1(SLOPE)} WAM per term` : SLOPE < -0.25 ? `📉 Slipping ${f1(SLOPE)} WAM per term` : '➡️ Holding steady';
  const GOAL_TEXT = CP_TO_WAM <= 0
    ? (WAM >= S.targetWAM ? '🏁 Target achieved' : `🏁 Finished ${f1(S.targetWAM - WAM)} short of target`)
    : NEED_AVG_WAM > 100 ? `🚫 Target unreachable: would need ${f1(NEED_AVG_WAM)}`
      : NEED_AVG_WAM <= S.passMark ? '😎 Locked in: even passes hold the target'
        : `🎯 Average ${f1(NEED_AVG_WAM)} across the final ${f0(CP_TO_WAM)} CP`;
  const RISK_TEXT = AT_RISK_N > 0 ? `❌ ${AT_RISK_N} subject(s) below the pass mark`
    : OVERDUE_N > 0 ? `⏰ ${OVERDUE_N} assessment(s) overdue and ungraded`
      : DUE_SOON_N > 0 ? `📌 ${DUE_SOON_N} assessment(s) due within 14 days`
        : MARK_SD > 12 ? `🎢 Volatile results (σ ${f1(MARK_SD)})` : '🛡️ No risk flags';
  const NEXT_TEXT = CLASS_IDX <= 0 ? (classes.length ? '🏆 Holding the top classification' : '—')
    : CP_REMAIN <= 0 ? `Locked at ${cls.name}` : `Next up: ${NEXT.name} at ${f1(NEXT.min)} WAM`;
  const CONSISTENCY_TEXT = MARK_N < 2 ? '—' : CONSISTENCY >= 0.9 ? '🎯 Very consistent' : CONSISTENCY >= 0.8 ? '🙂 Fairly consistent' : '🎢 Inconsistent';
  const MOMENTUM_TEXT = TERMS_N < 2 ? '—' : MOMENTUM > 0 ? `▲ ${f1(MOMENTUM)} vs previous term` : MOMENTUM < 0 ? `▼ ${f1(Math.abs(MOMENTUM))} vs previous term` : '= flat vs previous term';
  const FORECAST_TEXT = TERMS_N < 2 ? 'Add another term to unlock forecasting' : `Projected finish ≈ ${f1(FORECAST_FINAL)} WAM (R² ${f2(R2)})`;

  // ----- grade distribution, categories, years, types, disciplines -----
  const gradeDist = bands.map((b, i) => {
    const rows = counted.filter(r => r.band === i);
    return { grade: b.grade, desc: b.desc, count: rows.length, cp: sum(rows, r => r.cpc), share: MARK_N ? rows.length / MARK_N : 0 };
  });
  const catNames = [...CATEGORIES, ...new Set(L.map(r => r.category).filter(c => c && !CATEGORIES.includes(c)))];
  const categories = catNames.map(name => {
    const rows = L.filter(r => r.category === name);
    const cp = sum(rows, r => r.cpc);
    return { name, cp, wam: cp ? sum(rows, r => r.qp) / cp : '', gpa: cp ? sum(rows, r => r.gpc) / cp : '', n: rows.filter(r => r.cnt).length };
  });
  const yearNums = [...new Set(L.map(r => r.year).filter(y => y !== ''))].sort((a, b) => a - b);
  const years = yearNums.map(y => {
    const rows = L.filter(r => r.year === y), cr = rows.filter(r => r.cnt);
    const cp = sum(rows, r => r.cpc);
    return { year: y, label: `Year ${y}`, cp, wam: cp ? sum(rows, r => r.qp) / cp : '', gpa: cp ? sum(rows, r => r.gpc) / cp : '', n: cr.length,
      best: cp ? Math.max(...cr.map(r => r.mark)) : '', worst: cp ? Math.min(...cr.map(r => r.mark)) : '' };
  });
  const types = TYPES.filter(t => t !== 'Bonus').map(t => {
    const rows = asRows.filter(a => a.type === t && a.graded);
    return { type: t, n: rows.length, avg: rows.length ? sum(rows, a => a.pctNum) / rows.length : '',
      best: rows.length ? Math.max(...rows.map(a => a.pctNum)) : '', worst: rows.length ? Math.min(...rows.map(a => a.pctNum)) : '' };
  });
  const discOrder = [...new Set(counted.map(r => r.disc).filter(Boolean))];
  const discLabel = p => (S.discLabels.find(d => String(d.prefix).toUpperCase() === p) || {}).label || p;
  const disciplines = discOrder.map((p, k) => {
    const rows = L.filter(r => r.disc === p);
    const cp = sum(rows, r => r.cpc);
    return { prefix: p, label: discLabel(p), n: rows.filter(r => r.cnt).length, cp, wam: cp ? sum(rows, r => r.qp) / cp : '', gpa: cp ? sum(rows, r => r.gpc) / cp : '', hd: rows.filter(r => r.cnt && r.grade === 'HD').length, k };
  }).filter(d => d.cp > 0).sort((a, b) => b.wam - a.wam || a.k - b.k);

  // Final WAM and GPA if the remaining CP average each mark; the GPA assumes every remaining subject lands on it.
  const scenarioGrid = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].map(avg => {
    const fw = CPC + CP_TO_WAM ? (WAM * CPC + avg * CP_TO_WAM) / (CPC + CP_TO_WAM) : WAM;
    const fg = CPC + CP_TO_WAM ? (GPC + (gpOf(bandIdx(avg)) || 0) * CP_TO_WAM) / (CPC + CP_TO_WAM) : GPA;
    return { avg, wam: fw, gpa: fg, cls: classes.length ? classes[classIdxFor(fw)].name : '', hits: fw >= S.targetWAM, hitsGPA: fg >= S.targetGPA - 1e-9 };
  });

  const base = {
    S, today, bands, classes, maxGPA, ledger: L, chron, transcript, ipRows, remRows, terms, activeTerms: active, assessments: asRows, dueList, tracker, targetPlans,
    gradeDist, categories, years, types, disciplines, scenarioGrid, unlinked: UNLINKED, weightIssues,
    m: {
      WAM, GPA, CP_COUNTED: CPC, QP, GPC, CP_DONE, SUBJ_DONE, SUBJ_TOTAL, SUBJ_IP, SUBJ_PLAN, CP_IP, CP_PLANNED, CP_REMAIN, CP_TO_WAM, FINAL_CP,
      MARK_N, MARK_MAX, MARK_MIN, MARK_AVG, MARK_MED, MARK_SD, BEST: best || null, WORST: worst || null, N_HD, N_FAIL, HD_RATE, PASS_RATE,
      SEM_LEFT, CP_PCT, GPA_PCT, WAM_PCT_TARGET, GPA_PCT_TARGET, TERMS_N, SLOPE, INTERCEPT, R2, FORECAST_TERM, FORECAST_FINAL,
      LAST_TERM: lastT || null, PREV_TERM_WAM, MOMENTUM, BEST_TERM: bestT, CONSISTENCY, NEED_AVG_WAM, NEED_AVG_GPA, MAX_POSSIBLE, MIN_POSSIBLE,
      MAX_POSSIBLE_GPA, TOP_GRADE: TOP_BAND ? TOP_BAND.grade : '',
      GOAL_FEASIBLE, GOAL_GAP: S.targetWAM - WAM, PACE_CP_SEM, SEM_TO_FINISH, CLASS_IDX, CLASS: cls, NEXT_CLASS: NEXT, NEED_NEXT_CLASS,
      AT_RISK_N, UNGRADED_ASSESS, OVERDUE_N, DUE_SOON_N, WEIGHT_ERRORS, DUP_CODES, CP_MISSING, STAT_MISSING, BAND_GAP, ISSUE_COUNT,
      UNLINKED_CODES: UNLINKED.length, IP_HD_BANKED, IP_ON_TRACK_HD, GRADE: gradeOf(WAM),
    },
    text: { HEALTH_MSG, ETA_TEXT, TREND_TEXT, GOAL_TEXT, RISK_TEXT, NEXT_TEXT, CONSISTENCY_TEXT, MOMENTUM_TEXT, FORECAST_TEXT },
    helpers: { bandIdx, gradeOf, gpOf, nextMinAbove, bandByMin, classIdxFor, sumBy },
  };
  base.mc = computeMonteCarlo(base, state.planner || {});
  base.scanner = computeScanner(base);
  base.plan = computePlan(base, state.prereqs || [], state.offerings || []);
  return base;
}

export function cleanCode(c) {
  return String(c ?? '').replace(/[\s​]/g, '').toUpperCase();
}

// ---------- risk & opportunity scanner ----------
function computeScanner(E) {
  const { S, bands, ledger: L, assessments: A, helpers: H, m } = E;
  const mcMean = new Map(E.mc.rows.map(r => [r.code, r.c]));
  const items = A.map(a => {
    const it = { ...a, open: a.open };
    if (!a.open) return it;
    const lr = L.find(r => r.code === a.code);
    it.basis = a.graded ? 'Estimate' : 'Ungraded';
    it.M0 = lr && lr.mark !== '' ? lr.mark : (mcMean.get(a.code) ?? m.WAM);
    const wd = H.sumBy(a.code, x => x.wdone);
    it.p0 = a.graded ? a.pct * 100 : (wd ? H.sumBy(a.code, x => x.contrib) / wd * 100 : it.M0);
    const bi = H.bandIdx(it.M0);
    it.gradeNow = bi === '' ? '' : bands[bi].grade;
    const up = H.nextMinAbove(it.M0);
    it.gradeUp = up === '' ? '' : bands[H.bandByMin(up)].grade;
    it.floor = bi === '' ? '' : bands[bi].min;
    it.gapUp = up === '' ? '' : up - it.M0;
    it.dUp = it.gapUp === '' || a.wgt <= 0 ? '' : it.gapUp / a.wgt * 100;
    it.headroom = 100 - it.p0;
    it.feasible = it.dUp !== '' && it.dUp <= it.headroom + 1e-6 ? 1 : 0;
    it.cushion = it.floor === '' ? '' : it.M0 - it.floor;
    it.dDn = it.cushion === '' || a.wgt <= 0 ? '' : it.cushion / a.wgt * 100;
    it.gpNow = H.gpOf(bi);
    it.gpUp = up === '' ? '' : H.gpOf(H.bandByMin(up));
    it.cp = lr && lr.cp !== '' ? lr.cp : 10;
    it.gpaUp = it.gpUp === '' || !m.FINAL_CP ? '' : (it.gpUp - it.gpNow) * it.cp / m.FINAL_CP;
    it.wamUp = it.gapUp === '' || !m.FINAL_CP ? '' : it.gapUp * it.cp / m.FINAL_CP;
    it.oppKey = it.dUp !== '' ? (it.feasible ? 0 : 1000) + it.dUp + a.i / 1e6 : '';
    it.riskKey = it.dDn !== '' && it.dDn < it.p0 ? it.dDn + a.i / 1e6 : '';
    const dnIdx = it.floor === '' ? '' : H.bandIdx(it.floor - 0.01);
    it.gradeDn = dnIdx === '' ? 'none' : bands[dnIdx].grade;
    it.gpDn = dnIdx === '' ? '' : H.gpOf(dnIdx);
    it.gpaLoss = it.gpDn === '' || !m.FINAL_CP ? '' : (it.gpNow - it.gpDn) * it.cp / m.FINAL_CP;
    it.targetPct = it.dUp === '' ? '' : it.p0 + it.dUp;
    it.floorPct = it.dDn === '' ? '' : Math.max(0, it.p0 - it.dDn);
    return it;
  });
  const openItems = items.filter(i => i.open);
  const opps = openItems.filter(i => i.oppKey !== '').sort((a, b) => a.oppKey - b.oppKey);
  const risks = openItems.filter(i => i.riskKey !== '').sort((a, b) => a.riskKey - b.riskKey);
  const subjects = E.ipRows.map(r => {
    const proj = r.mark;
    const openW = Math.max(0, 100 - H.sumBy(r.code, a => a.wdone, a => !items[a.i].open));
    const minP = Math.min(100, H.sumBy(r.code, a => a.contrib, a => !items[a.i].open) + H.sumBy(r.code, a => a.bonus));
    const maxP = Math.min(100, minP + openW);
    const bi = H.bandIdx(proj);
    const up = proj === '' ? '' : H.nextMinAbove(proj);
    const gap = proj === '' || up === '' ? '' : up - proj;
    const reach = proj === '' ? 'no mark yet' : gap === '' ? '🏁 top band' : openW === 0 ? '🔒 fully banked' : maxP >= proj + gap - 1e-6 ? '✅ yes' : '✖ no';
    const cushion = proj === '' || bi === '' ? '' : proj - bands[bi].min;
    const mine = openItems.filter(i => i.code === r.code);
    const lever = mine.filter(i => i.oppKey !== '').sort((a, b) => a.oppKey - b.oppKey)[0];
    const risk = mine.filter(i => i.riskKey !== '').sort((a, b) => a.riskKey - b.riskKey)[0];
    return {
      code: r.code, name: r.name, proj, grade: bi === '' ? '' : bands[bi].grade, openW, minP, maxP,
      next: proj === '' ? '' : up === '' ? 'top band' : `${bands[H.bandByMin(up)].grade} at ${f0(up)}`, gap, reach,
      uplift: gap === '' || !openW ? '' : gap / openW * 100, cushion, fragile: isNum(cushion) && openW > 0 ? cushion : '',
      lever: lever ? `${lever.name} (+${f1(lever.dUp)} pts${lever.feasible ? ')' : ', not alone)'}` : 'no open items',
      risk: risk ? `${risk.name} (slip > ${f1(risk.dDn)} pts)` : 'no slip risk',
    };
  });
  const fragileList = subjects.filter(s => s.fragile !== '');
  const fragile = fragileList.reduce((b, s) => (!b || s.fragile < b.fragile ? s : b), null);
  const top = opps[0];
  return {
    items, openItems, opps, risks, subjects,
    openCount: openItems.length,
    openWeight: sum2(openItems, i => i.wgt),
    openSubjects: subjects.filter(s => s.openW > 0).length,
    bestLever: !top ? 'No open item sits below a higher band'
      : `${top.name} (${top.code}): ${top.feasible ? `+${f1(top.dUp)} pts lifts ${top.gradeNow} to ${top.gradeUp}` : 'no single item can lift a grade alone'}`,
    mostFragile: !fragile ? 'No in-progress grade can still move' : `${fragile.code} · ${f2(fragile.fragile)} marks above the ${fragile.grade} floor`,
    fragileCushion: fragile ? fragile.fragile : 99,
    topRisk: !risks[0] ? '✅ No open item can cost a grade'
      : `${risks[0].name} (${risks[0].code}): below ${f1(risks[0].floorPct)}% costs ${risks[0].gradeNow} → ${risks[0].gradeDn}`,
  };
}
const sum2 = (arr, f) => arr.reduce((s, r) => s + (f(r) || 0), 0);

// ---------- Monte Carlo projection ----------
export function computeMonteCarlo(E, planner) {
  const { S, bands, m, remRows, assessments: A, helpers: H, ledger: L } = E;
  const seed = Math.abs(round(num(planner.seed) === '' ? 2026 : num(planner.seed), 0)) % 100000;
  const tauSuggested = round(m.MARK_SD / Math.sqrt(Math.max(1, m.MARK_N)), 1);
  const tauIn = num(planner.formShift);
  const tau = tauIn === '' ? tauSuggested : Math.max(0, tauIn);
  const overrides = planner.overrides || {};
  const openOf = new Map(A.map(a => [a.i, a.open]));
  const counted = L.filter(r => r.cnt);
  const discStats = disc => {
    const rows = counted.filter(r => r.disc === disc);
    const n = rows.length;
    if (n < 2) return { n, mean: m.MARK_AVG, sd: m.MARK_SD };
    const mean = rows.reduce((s, r) => s + r.mark, 0) / n;
    const ss = rows.reduce((s, r) => s + r.mark ** 2, 0);
    return { n, mean, sd: Math.sqrt(Math.max(0, (ss - n * mean ** 2) / (n - 1))) };
  };
  const rowsIn = remRows.map(r => ({ code: r.code, name: r.name, term: termLabel(r.tkey), status: r.status, cp: r.cp === '' ? 0 : r.cp, ip: r.status === 'In Progress', mark: r.mark }));
  const UNALLOC_CP = Math.max(0, m.CP_TO_WAM - rowsIn.reduce((s, r) => s + r.cp, 0));
  if (UNALLOC_CP > 0) rowsIn.push({ code: 'UNALLOC', name: 'Unallocated CP', term: 'not yet planned', status: 'Unallocated', cp: UNALLOC_CP, ip: false, mark: '', unalloc: true });

  const rows = rowsIn.map((r, k) => {
    const ds = r.unalloc ? { n: 0, mean: m.MARK_AVG, sd: m.MARK_SD } : discStats(r.code.slice(0, 4));
    const isOpen = a => openOf.get(a.i) === 1;
    const lockedC = r.ip ? H.sumBy(r.code, a => a.contrib, a => !isOpen(a)) : 0;
    const lockedW = r.ip ? H.sumBy(r.code, a => a.wdone, a => !isOpen(a)) : 0;
    const openFrac = r.ip ? clamp((100 - lockedW) / 100, 0, 1) : 1;
    const bonus = r.ip ? H.sumBy(r.code, a => a.bonus) : 0;
    const LO = r.ip ? Math.min(100, lockedC + bonus) : 0;
    const HI = r.ip ? Math.min(100, lockedC + bonus + 100 - lockedW) : 100;
    const ipMark = r.ip && r.mark !== '' ? r.mark : '';
    const exp = r.unalloc ? m.MARK_AVG : median([LO, HI, ipMark !== '' ? ipMark : ds.mean]);
    const hw = r.unalloc ? Math.sqrt(6) * Math.max(3, m.MARK_SD) / Math.sqrt(Math.max(1, r.cp / 10)) : openFrac * Math.sqrt(6) * Math.max(3, ds.sd);
    const sLow = Math.max(LO, exp - hw), sHigh = Math.min(HI, exp + hw);
    const ov = overrides[r.code] || {};
    const vLow = num(ov.low) === '' ? sLow : num(ov.low), vExp = num(ov.exp) === '' ? exp : num(ov.exp), vHigh = num(ov.high) === '' ? sHigh : num(ov.high);
    const a = Math.max(LO, Math.min(vLow, vExp, vHigh));
    const b = Math.max(a, Math.min(HI, Math.max(vLow, vExp, vHigh)));
    const c = median([a, b, median([vLow, vExp, vHigh])]);
    const F = b > a ? (c - a) / (b - a) : 0.5;
    const basis = r.ip ? (openFrac === 0 ? 'In progress · banked' : `In progress · ${pct0(openFrac)} open`)
      : r.unalloc ? `Overall record · ${f0(r.cp)} CP` : `${r.code.slice(0, 4)} ${f1(ds.mean)} ± ${f1(ds.sd)} · n ${ds.n}`;
    return {
      ...r, discN: ds.n, discMean: ds.mean, discSd: ds.sd, lockedC, lockedW, openFrac, bonus, LO, HI,
      sugg: { low: sLow, exp, high: sHigh }, override: ov, a, b, c, F, W: r.cp, E: openFrac,
      mean: (a + b + c) / 3, varr: (a * a + b * b + c * c - a * b - a * c - b * c) / 18,
      Z: latticeZ(k), SH: frac((seed + 1) * latticeAlpha(k)), basis,
    };
  });
  const QP0 = m.QP, GP0 = m.GPC, CP0 = m.CP_COUNTED;
  const CPT = CP0 + rows.reduce((s, r) => s + r.W, 0);
  const SH0 = frac((seed + 1) * MC_ALPHA0);
  const gpOfMark = mk => { for (const bd of bands) if (mk >= bd.min && mk <= bd.max) return S.gpaScale === 4 ? bd.gp4 : bd.gp7; return 0; };
  const wams = new Float64Array(MC_N), gpas = new Float64Array(MC_N);
  if (CPT > 0) {
    for (let i = 0; i < MC_N; i++) {
      const D = tau * normInv(clamp(frac(i * 1 / MC_N + SH0), 0.0001, 0.9999));
      let q = QP0, g = GP0;
      for (const r of rows) {
        if (!r.W) continue;
        const u = frac(i * r.Z / MC_N + r.SH);
        const x = u < r.F ? r.a + Math.sqrt(u * (r.b - r.a) * (r.c - r.a)) : r.b - Math.sqrt((1 - u) * (r.b - r.a) * (r.b - r.c));
        const s = clamp(D * r.E, r.LO - r.a, r.HI - r.b);
        const mk = round(x + s, 0);
        q += r.W * mk; g += r.W * gpOfMark(mk);
      }
      wams[i] = q / CPT; gpas[i] = g / CPT;
    }
  }
  const W = Array.from(wams), G = Array.from(gpas);
  const sorted = [...W].sort((a, b) => a - b), sortedG = [...G].sort((a, b) => a - b);
  const share = (arr, thr) => arr.filter(x => x >= thr - 1e-6).length / MC_N;
  const fcIdx = E.classes.findIndex(c => /^first/i.test(c.name));
  const FC_MIN = E.classes.length ? E.classes[fcIdx >= 0 ? fcIdx : 0].min : 80;
  const FC_NAME = E.classes.length ? E.classes[fcIdx >= 0 ? fcIdx : 0].name : 'top class';
  const mean = W.reduce((s, x) => s + x, 0) / MC_N;
  const anMean = CPT ? (QP0 + rows.reduce((s, r) => s + r.W * r.mean, 0)) / CPT : 0;
  const anSd = CPT ? Math.sqrt(rows.reduce((s, r) => s + r.W * r.W * r.varr, 0) + (rows.reduce((s, r) => s + r.W * r.E, 0) * tau) ** 2) / CPT : 0;
  const pNorm = thr => (anSd > 0 ? 1 - normCdf((thr - anMean) / anSd) : anMean >= thr ? 1 : 0);
  const minW = sorted[0] ?? 0, maxW = sorted[sorted.length - 1] ?? 0;
  const hLo = floorTo(minW, 0.5);
  const hW = Math.max(0.25, ceilTo((ceilTo(maxW, 0.5) - hLo) / 24, 0.25));
  const tgt = S.targetWAM;
  // Stacked shares per bin, split at two thresholds in whichever order they fall, so no scenario is counted twice.
  const histogram = (vals, lo, width, bins, cuts, labelOf) => {
    const [c1, c2] = [...cuts].sort((p, q) => p.at - q.at);
    const t1 = c1.at - 1e-6, t2 = c2.at - 1e-6;
    const cnt = (a, b) => vals.filter(x => x >= a && x < b).length / MC_N;
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    return {
      names: [`Below ${c1.name}`, `${cap(c1.name)} to ${c2.name}`, `At or above ${c2.name}`],
      bins: Array.from({ length: bins }, (_, f) => {
        const from = lo + f * width, to = from + width + (f === bins - 1 ? 0.001 : 0);
        return { from, to, ...labelOf(from, from + width), all: cnt(from, to), parts: [cnt(from, Math.min(to, t1)), cnt(Math.max(from, t1), Math.min(to, t2)), cnt(Math.max(from, t2), to)] };
      }),
    };
  };
  const hist = histogram(W, hLo, hW, 24, [{ at: FC_MIN, name: FC_NAME }, { at: tgt, name: 'target' }],
    (a, b) => ({ label: f1(a), title: `Final WAM ${f2(a)} to ${f2(b)}` }));
  // A final GPA can only land on a fixed grid (grade points × CP ÷ total CP), so its bins follow that grid.
  const gcdF = (a, b) => (b < 1e-7 ? a : gcdF(b, a % b));
  const gVals = sortedG.filter((x, k) => !k || x - sortedG[k - 1] > 1e-9);
  const gStep = Math.max(1e-4, gVals.length > 1 ? gVals.slice(1).map((x, k) => x - gVals[k]).reduce(gcdF) : 0.05);
  const gMin = gVals[0] ?? 0, gPts = Math.round(((gVals[gVals.length - 1] ?? 0) - gMin) / gStep) + 1, gPer = Math.ceil(gPts / 24);
  const histG = histogram(G, gMin - gStep / 2, gStep * gPer, Math.ceil(gPts / gPer), [{ at: S.uniMedalGPA, name: 'Uni Medal' }, { at: S.targetGPA, name: 'target' }],
    (a, b) => ({ label: f2(a + gStep / 2), title: gPer === 1 ? `Final GPA ${f2(a + gStep / 2)}` : `Final GPA ${f2(a + gStep / 2)} to ${f2(b - gStep / 2)}` }));
  const ladder = E.classes.map((c, k) => ({
    name: c.name, badge: c.badge, min: c.min,
    p: share(W, c.min) - (k ? share(W, E.classes[k - 1].min) : 0),
  }));
  return {
    seed, tau, tauSuggested, tauIn, rows, UNALLOC_CP, CPT, FC_MIN, FC_NAME, wams: W, gpas: G, hist, histG, ladder, hasRemaining: rows.some(r => r.W > 0),
    mean, sd: stdev(W), p10: percentile(sorted, 0.1), p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9), min: minW, max: maxW,
    pFC: share(W, FC_MIN), pTarget: share(W, tgt), pMedal: share(G, S.uniMedalGPA), pDean: share(G, S.deansMedalGPA), pTargetGPA: share(G, S.targetGPA),
    gpaMean: G.reduce((s, x) => s + x, 0) / MC_N, gpaSd: stdev(G),
    gp10: percentile(sortedG, 0.1), gp50: percentile(sortedG, 0.5), gp90: percentile(sortedG, 0.9),
    anMean, anSd, anPFC: pNorm(FC_MIN), anPTarget: pNorm(tgt),
    expWAM: CPT ? (QP0 + rows.reduce((s, r) => s + r.W * r.c, 0)) / CPT : 0,
    expGPA: CPT ? (GP0 + rows.reduce((s, r) => s + r.W * gpOfMark(round(r.c, 0)), 0)) / CPT : 0,
    reconOK: Math.abs(mean - anMean) <= 0.15,
  };
}

// ---------- degree map: load, prerequisites, offerings ----------
function computePlan(E, prereqs, offerings) {
  const { S, ledger: L, chron } = E;
  const CUR_KEY = S.curYear * 10 + S.curSem;
  const keys = [...new Set(L.map(r => r.term).filter(t => t !== ''))].sort((a, b) => a - b);
  const termCols = keys.map(key => {
    const loaded = L.filter(r => r.term === key && r.status !== 'Withdrawn').reduce((s, r) => s + (r.cp || 0), 0);
    const standard = key % 10 <= 2 ? S.cpPerSem : S.summerCP;
    const check = key < CUR_KEY ? 'past' : loaded > standard ? `⬆ +${loaded - standard}` : loaded < standard ? `⬇ −${standard - loaded}` : '✅ ok';
    return { key, label: termLabel(key), session: sessionName(key, S.commenceYear, true), loaded, standard, check, current: key === CUR_KEY };
  });
  const LOAD_ISSUES = termCols.filter(t => /^[⬆⬇]/.test(t.check)).length;
  const first = keys[0] || 0, last = keys[keys.length - 1] || 0;
  const maxYear = Math.max(6, Math.floor(last / 10));
  let GAP_SEMS = 0;
  for (let y = 1; y <= maxYear; y++) for (const s of [1, 2]) {
    const k = y * 10 + s;
    if (k >= first && k <= last && !L.some(r => r.term === k && r.status !== 'Withdrawn')) GAP_SEMS++;
  }
  const rowOf = code => L.find(r => r.code === code);
  const reqs = prereqs.map((p, n) => {
    const subject = cleanCode(p.subject), rule = p.rule === 'Co' ? 'Co' : 'Pre';
    const opts = (p.opts || []).map(cleanCode);
    const r = subject ? rowOf(subject) : null;
    const tkey = r ? r.tkey : '';
    const sat = o => {
      if (!o || tkey === '') return '';
      const ok = L.some(x => x.code === o && x.tkey > 0 && (rule === 'Co' ? x.tkey <= tkey : x.tkey < tkey) && x.status !== 'Failed' && x.status !== 'Withdrawn')
        || L.some(x => x.code === o && (x.status === 'Credit Transfer' || x.status === 'Exempt'));
      return ok ? 1 : 0;
    };
    const s = opts.map(sat);
    const inPlan = opts.some(o => o && L.some(x => x.code === o)) ? 1 : 0;
    const done = r && ['Completed', 'Credit Transfer', 'Exempt'].includes(r.status);
    const ok = !subject || !opts[0] || tkey === '' ? '' : done ? '' : s.some(v => v === 1) ? 1 : 0;
    const alt = opts[0] + (opts[1] ? ` / ${opts[1]}` : '');
    const msg = ok === '' ? '' : ok === 1 ? '✅ met' : inPlan ? `⚠ ${alt}${rule === 'Co' ? ' not by this term' : ' not before this term'}` : `❌ ${alt} not in plan`;
    const status = !subject ? '' : tkey === '' ? 'not in Subjects' : !opts[0] ? 'add an option' : ok === '' ? '✓ done' : msg;
    return { n, subject, name: r ? r.name : '', rule, opts, ok, msg, status };
  });
  const PREREQ_ISSUES = reqs.filter(q => q.ok === 0).length;
  const offerMap = new Map(offerings.map(o => [cleanCode(o.code), o]));
  const rows = chron.map((r, k) => {
    const mapped = reqs.filter(q => q.subject === r.code);
    const done = ['Completed', 'Credit Transfer', 'Exempt'].includes(r.status);
    const prereq = !mapped.length ? 'none mapped' : done ? '✓ done' : !mapped.some(q => q.ok === 0) ? `✅ ${mapped.length} requirement(s) met` : (mapped.find(q => q.ok === 0) || {}).msg;
    let offered = '';
    if (!['Completed', 'Failed', 'Credit Transfer', 'Exempt', 'Withdrawn'].includes(r.status) && r.tkey < 99) {
      const o = offerMap.get(r.code);
      const si = clamp(r.tkey % 10, 1, 3);
      const sess = ['Autumn', 'Spring', 'Summer'][si - 1];
      if (!o) offered = 'not listed';
      else if ([o.aut, o.spr, o.sum][si - 1]) offered = `✅ ${sess}`;
      else if (o.aut || o.spr || o.sum) offered = `⚠ not in ${sess}`;
      else offered = '⚠ no session listed';
    }
    const label = r.status === 'Completed' ? `${r.grade} ${f0(r.mark)}` : r.status === 'In Progress' ? `⏳ ${r.mark === '' ? '' : f0(r.mark)}`.trim()
      : r.status === 'Planned' ? '🗓' : r.status === 'Failed' ? '✖ F' : (r.status || '').slice(0, 4);
    const warn = /^[⚠❌]/.test(prereq || '') || /^⚠/.test(offered);
    return { n: k + 1, row: r, prereq, offered, label, warn };
  });
  const OFFER_ISSUES = rows.filter(x => /^⚠/.test(x.offered)).length;
  const COMPLETION_KEY = L.filter(r => (r.status === 'Planned' || r.status === 'In Progress') && r.tkey < 99).reduce((mx, r) => Math.max(mx, r.tkey), 0);
  const COMPLETION_CAL = COMPLETION_KEY === 0 ? 'complete' : sessionName(COMPLETION_KEY, S.commenceYear);
  const COMPLETION_LBL = COMPLETION_KEY === 0 ? 'Degree complete' : `${termLabel(COMPLETION_KEY)} · ${COMPLETION_CAL}`;
  return {
    CUR_KEY, termCols, rows, reqs, LOAD_ISSUES, PREREQ_ISSUES, OFFER_ISSUES, GAP_SEMS, PLAN_ISSUES: LOAD_ISSUES + PREREQ_ISSUES + OFFER_ISSUES + GAP_SEMS,
    COMPLETION_KEY, COMPLETION_CAL, COMPLETION_LBL,
  };
}

// What-if sandbox and reverse solver (Planner sheet), for WAM and GPA side by side.
export function whatIf(E, scenario, desired, remainingCP, desiredGPA) {
  const { bandIdx, gpOf } = E.helpers;
  const gpMark = mk => gpOf(bandIdx(mk)) || 0;
  const rows = (scenario || []).map(s => ({ ...s, cp: num(s.cp), target: num(s.target) }));
  const valid = rows.filter(r => r.cp !== '' && r.target !== '');
  const cp = valid.reduce((s, r) => s + r.cp, 0);
  const qp = valid.reduce((s, r) => s + r.cp * r.target, 0);
  const gq = valid.reduce((s, r) => s + r.cp * gpMark(r.target), 0);
  const { WAM, GPA, CP_COUNTED, GPC } = E.m;
  const proj = CP_COUNTED + cp ? (WAM * CP_COUNTED + qp) / (CP_COUNTED + cp) : WAM;
  const projGPA = CP_COUNTED + cp ? (GPC + gq) / (CP_COUNTED + cp) : GPA;
  const ci = E.classes.length ? E.helpers.classIdxFor(proj) : -1;
  const d = num(desired) === '' ? E.S.targetWAM : num(desired);
  const rem = num(remainingCP) === '' ? E.m.CP_TO_WAM : num(remainingCP);
  const req = rem > 0 ? (d * (CP_COUNTED + rem) - WAM * CP_COUNTED) / rem : '';
  const reqGrade = req === '' ? '—' : (E.bands.find(b => req >= b.min && req <= b.max) || {}).grade || '—';
  const verdict = req === '' ? 'Enter remaining CP.' : req > 100 ? `🚫 Not achievable: needs ${f1(req)}` : req <= E.S.passMark ? '😎 Comfortable: passes are enough' : `🎯 Achievable: average ${f1(req)}`;
  // GPA moves in whole grade points, so the required average is read as a mix of the two grades either side of it.
  const dG = num(desiredGPA) === '' ? E.S.targetGPA : num(desiredGPA);
  const reqG = rem > 0 ? (dG * (CP_COUNTED + rem) - GPC) / rem : '';
  const ladder = E.bands.map(b => ({ grade: b.grade, gp: E.S.gpaScale === 4 ? b.gp4 : b.gp7, pass: b.max >= E.S.passMark })).sort((a, b) => a.gp - b.gp);
  const passes = ladder.filter(x => x.pass);
  const topGP = ladder.length ? ladder[ladder.length - 1].gp : 0;
  let reqGPAGrade = '—', verdictGPA = 'Enter remaining CP.';
  if (reqG !== '' && ladder.length) {
    const lo = [...ladder].reverse().find(x => x.gp <= reqG + 1e-9), hi = ladder.find(x => x.gp >= reqG - 1e-9);
    if (reqG > topGP + 1e-9) verdictGPA = `🚫 Not achievable: needs ${f2(reqG)}, above the ${topGP} maximum`;
    else if (!lo || (passes.length && reqG <= passes[0].gp + 1e-9)) { reqGPAGrade = (passes[0] || ladder[0]).grade; verdictGPA = '😎 Comfortable: passes are enough'; }
    else if (hi.gp - lo.gp < 1e-9) { reqGPAGrade = hi.grade; verdictGPA = `🎯 Achievable: ${hi.grade} or better in every remaining subject`; }
    else {
      // With standard 10 CP subjects the mix becomes a subject count: k higher grades out of n is enough once k/n reaches the share.
      const share = (reqG - lo.gp) / (hi.gp - lo.gp), units = rem % 10 === 0 ? rem / 10 : 0, k = Math.ceil(share * units - 1e-9);
      reqGPAGrade = `${lo.grade} to ${hi.grade}`;
      verdictGPA = units
        ? `🎯 Achievable: ${hi.grade} in at least ${k} of your ${units} remaining subjects (10 CP each), ${lo.grade} in the rest`
        : `🎯 Achievable: ${hi.grade} on at least ${Math.ceil(share * 100 - 1e-9)}% of the remaining CP, ${lo.grade} on the rest`;
    }
  }
  return {
    rows, cp, qp, avg: cp ? qp / cp : 0, avgGP: cp ? gq / cp : 0, totalCP: CP_COUNTED + cp, proj, change: proj - WAM, projGPA, changeGPA: projGPA - GPA,
    projClass: ci < 0 ? '—' : `${E.classes[ci].badge} ${E.classes[ci].name}`.trim(),
    meets: proj >= E.S.targetWAM, short: E.S.targetWAM - proj, meetsGPA: projGPA >= E.S.targetGPA - 1e-9, shortGPA: E.S.targetGPA - projGPA,
    desired: d, remaining: rem, required: req, reqGrade, verdict, desiredGPA: dG, requiredGPA: reqG, reqGPAGrade, verdictGPA,
  };
}
