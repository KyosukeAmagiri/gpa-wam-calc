// Study planning maths, kept free of the DOM: when deadlines pile up (crunch weeks), a revision plan counted back
// from each deadline, focus-timer statistics, and the assessments whose marks are probably back by now.

const DAY = 86400000;
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = d => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ---------- crunch weeks ----------
// Assessment weight due in each week, from last week to the last due date. A week is "crunch" when it carries far
// more than a typical week, and "busy" when it is heavier than usual.
export function crunchWeeks(E, { back = 1, max = 18 } = {}) {
  const items = E.assessments.filter(a => a.name && a.due && a.type !== 'Bonus');
  const first = addDays(mondayOf(E.today), -7 * back);
  const ahead = items.filter(a => a.due >= first);
  if (!ahead.length) return { weeks: [], peak: 0, crunch: 0 };
  const last = mondayOf(new Date(Math.max(...ahead.map(a => +a.due))));
  const n = Math.min(max, Math.round((last - first) / (7 * DAY)) + 1);
  const thisWeek = +mondayOf(E.today);
  const weeks = Array.from({ length: n }, (_, i) => {
    const start = addDays(first, 7 * i), end = addDays(start, 7);
    const list = ahead.filter(a => a.due >= start && a.due < end).sort((x, y) => x.due - y.due);
    return { start, end, items: list, weight: list.reduce((s, a) => s + num(a.weight), 0), open: list.filter(a => !a.graded).length,
      now: +start === thisWeek, past: +end <= thisWeek };
  });
  const loaded = weeks.filter(w => w.weight > 0);
  const typical = loaded.length ? loaded.reduce((s, w) => s + w.weight, 0) / loaded.length : 0;
  for (const w of weeks) w.level = w.weight >= Math.max(50, typical * 1.6) ? 'crunch' : w.weight >= Math.max(25, typical * 1.15) ? 'busy' : w.weight > 0 ? 'light' : 'free';
  return { weeks, peak: Math.max(...weeks.map(w => w.weight)), crunch: weeks.filter(w => w.level === 'crunch' && !w.past).length };
}

// ---------- study plan ----------
// Hours for each upcoming item come from its weight and type, scaled up when the subject needs a big lift to reach
// its target. Sessions are packed earliest-deadline-first into the hours available each day, starting a type-based
// number of days before the deadline.
const KIND = {
  Exam: { perPct: 0.6, lead: 21 }, Thesis: { perPct: 0.6, lead: 28 }, Project: { perPct: 0.5, lead: 21 },
  Assignment: { perPct: 0.5, lead: 14 }, Report: { perPct: 0.5, lead: 14 }, Presentation: { perPct: 0.35, lead: 10 },
  Quiz: { perPct: 0.25, lead: 5 }, Lab: { perPct: 0.2, lead: 4 }, Participation: { perPct: 0, lead: 0 },
};
export const PACES = [[0.75, 'Light'], [1, 'Steady'], [1.3, 'Intense']];
export const studyPrefs = prefs => {
  const p = prefs.study || {};
  const n = (v, d, lo, hi) => (typeof v === 'number' && v >= lo && v <= hi ? v : d);
  return { weekday: n(p.weekday, 3, 0, 12), weekend: n(p.weekend, 2, 0, 12), pace: n(p.pace, 1, 0.5, 2), start: /^\d{1,2}:\d{2}$/.test(p.start || '') ? p.start : '18:00' };
};

export function studyPlan(E, state, { days: horizon = 60 } = {}) {
  const P = studyPrefs(state.prefs);
  const today = startOfDay(E.today);
  const tracker = new Map(E.tracker.map(t => [t.code, t]));
  const done = loggedByItem(state);
  const items = E.assessments
    .filter(a => a.name && a.due && !a.graded && a.type !== 'Bonus' && a.due > today && num(a.weight) > 0)
    .map(a => {
      const k = KIND[a.type] || KIND.Assignment;
      const t = tracker.get(a.code);
      // a subject that needs well above its current average on what is left gets more time, one that is safe gets less
      const need = t ? (t.target !== '' && t.needT !== '' ? t.needT : t.needD) : '';
      const lift = t && need !== '' && t.sofar !== '' ? Math.max(0.75, Math.min(1.5, 1 + (need - t.sofar) / 40)) : 1;
      const hours = Math.round(num(a.weight) * k.perPct * lift * P.pace * 2) / 2;
      const studied = (done.get(a.id) || 0) / 60;
      return { a, hours, studied, left: Math.max(0, hours - studied), from: addDays(a.due, -k.lead), lift, scheduled: 0 };
    })
    .filter(x => x.hours > 0)
    .sort((x, y) => x.a.due - y.a.due);
  const lastDue = items.length ? new Date(Math.max(...items.map(x => +x.a.due))) : today;
  const end = new Date(Math.min(+addDays(today, horizon), +lastDue));
  const days = [];
  for (let d = today; d < end; d = addDays(d, 1)) {
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    let free = weekend ? P.weekend : P.weekday;
    if (+d === +today) free = Math.max(0, free - todayMinutes(state) / 60);
    const sessions = [];
    const open = items.filter(x => x.left - x.scheduled > 0.01 && x.from <= d && x.a.due > d);
    // first pass: earliest deadline first, but no single item takes more than 60% of a day while others wait
    const cap = open.length > 1 ? Math.max(1, Math.round(free * 0.6 * 2) / 2) : free;
    for (const pass of [cap, Infinity]) {
      for (const x of open) {
        if (free < 0.5) break;
        const already = sessions.find(s => s.x === x);
        const room = Math.min(free, x.left - x.scheduled, pass - (already ? already.hours : 0));
        const h = Math.floor(room * 2) / 2;
        if (h < 0.5) continue;
        if (already) already.hours += h; else sessions.push({ x, hours: h });
        x.scheduled += h; free -= h;
      }
    }
    days.push({ date: d, sessions: sessions.map(s => ({ a: s.x.a, hours: s.hours })), total: sessions.reduce((s, x) => s + x.hours, 0) });
  }
  for (const x of items) x.short = Math.max(0, Math.round((x.left - x.scheduled) * 2) / 2);
  return { items, days, prefs: P, total: items.reduce((s, x) => s + x.left, 0), short: items.filter(x => x.short > 0) };
}

// ---------- focus timer ----------
// Logged sessions are { id, code, itemId, start (ISO), minutes }. A running timer lives in prefs.timer.
export const sessionsOf = state => (Array.isArray(state.sessions) ? state.sessions : []);
export function loggedByItem(state) {
  const m = new Map();
  for (const s of sessionsOf(state)) if (s.itemId) m.set(s.itemId, (m.get(s.itemId) || 0) + num(s.minutes));
  return m;
}
function todayMinutes(state) {
  const key = isoDay(new Date());
  return sessionsOf(state).filter(s => isoDay(new Date(s.start)) === key).reduce((t, s) => t + num(s.minutes), 0);
}
export const runningMinutes = timer => (timer && timer.start ? Math.max(0, (Date.now() - timer.start) / 60000) : 0);

export function focusStats(E, state) {
  const list = sessionsOf(state);
  const today = startOfDay(E.today), week = mondayOf(E.today);
  const byCode = new Map();
  for (const s of list) {
    const r = byCode.get(s.code || '') || { code: s.code || '', minutes: 0, week: 0, n: 0 };
    r.minutes += num(s.minutes); r.n++;
    if (new Date(s.start) >= week) r.week += num(s.minutes);
    byCode.set(r.code, r);
  }
  const marks = new Map(E.ledger.filter(r => r.code).map(r => [r.code, r]));
  const subjects = [...byCode.values()].map(r => ({ ...r, row: marks.get(r.code) || null, mark: marks.get(r.code)?.mark ?? '' }))
    .sort((a, b) => b.minutes - a.minutes);
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6), key = isoDay(d);
    return { date: d, minutes: list.filter(s => isoDay(new Date(s.start)) === key).reduce((t, s) => t + num(s.minutes), 0) };
  });
  let streak = 0;
  for (let i = 0; ; i++) {
    const key = isoDay(addDays(today, -i));
    if (list.some(s => isoDay(new Date(s.start)) === key)) streak++;
    else if (i > 0) break;
  }
  return {
    subjects, last7, streak, sessions: list.length,
    total: list.reduce((t, s) => t + num(s.minutes), 0),
    week: list.filter(s => new Date(s.start) >= week).reduce((t, s) => t + num(s.minutes), 0),
  };
}

// ---------- marks probably back ----------
// Ungraded items whose due date passed at least a week ago (but not more than ten weeks), so the mark is likely out.
export function awaitingMarks(E, { after = 7, within = 70 } = {}) {
  const today = startOfDay(E.today);
  return E.assessments.filter(a => a.name && a.due && !a.graded && a.type !== 'Bonus' && a.type !== 'Participation'
    && today - a.due >= after * DAY && today - a.due <= within * DAY).sort((x, y) => x.due - y.due);
}
