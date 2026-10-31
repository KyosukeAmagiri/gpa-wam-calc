// iPhone app only: keeps the home-screen widget, reminders and Lock Screen countdowns in step with the saved record.
import { isNativeApp, nativePlugin, toast } from './ui.js';

const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Notification ids must be 32-bit integers; a stable hash keeps one id per assessment and reminder kind.
const idFor = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return Math.abs(h | 0) || 1; };

let widgetTimer = 0, remindTimer = 0, lastWidget = '', lastRemind = '';

// Called after every recalculation; the work is debounced so typing does not spam the native side.
export function syncNative(state, E) {
  if (!isNativeApp()) return;
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => pushWidget(E, state.prefs).catch(() => {}), 700);
  clearTimeout(remindTimer);
  remindTimer = setTimeout(() => { scheduleReminders(state, E).catch(() => {}); autoPin(state, E); }, 1500);
}

// Numbers the Swift side decodes as Double?: anything blank or non-finite becomes null.
const num = (v, dp = 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** dp) / 10 ** dp : null);
const plain = s => String(s || '').replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/\s+/g, ' ').trim();

// What the widget and Siri read. The widget uses the top fields; Siri and Apple Intelligence also use the lists.
export function widgetSummary(E, prefs = {}) {
  const m = E.m, has = m.MARK_N > 0, mc = E.mc || {};
  const next = E.dueList.find(a => a.days >= 0);
  return {
    wam: has ? Math.round(m.WAM * 100) / 100 : null, gpa: has ? Math.round(m.GPA * 1000) / 1000 : null, maxGPA: E.maxGPA,
    grade: has ? m.GRADE || '' : '', classification: has ? m.CLASS.name : '',
    cp: m.CP_DONE, totalCP: E.S.totalCP, targetWAM: E.S.targetWAM, targetGPA: E.S.targetGPA,
    nextCode: next ? next.code : null, nextName: next ? next.name : null, nextDue: next ? isoDay(next.due) : null,
    dueSoon: m.DUE_SOON_N, updated: new Date().toISOString(),
    overdue: m.OVERDUE_N, cpToWAM: num(m.CP_TO_WAM, 0), needAvgWAM: m.CP_TO_WAM > 0 ? num(m.NEED_AVG_WAM) : null,
    projWAM: mc.hasRemaining ? num(mc.p50, 2) : null, projGPA: mc.hasRemaining ? num(mc.gp50, 2) : null,
    momentum: m.TERMS_N >= 2 ? num(m.MOMENTUM, 2) : null,
    pTarget: mc.hasRemaining ? num(mc.pTarget, 3) : null, pTargetGPA: mc.hasRemaining ? num(mc.pTargetGPA, 3) : null,
    upcoming: E.dueList.filter(a => a.days >= 0).slice(0, 8)
      .map(a => ({ code: a.code, name: a.name, due: isoDay(a.due), weight: num(a.weight), days: a.days })),
    current: E.tracker.map(t => ({
      code: t.code, name: t.name, sofar: num(t.sofar), graded: num(t.graded, 0), remaining: num(t.remaining, 0),
      needHD: num(t.needHD), needD: num(t.needD), needC: num(t.needC), status: plain(t.statusText),
    })),
    done: E.chron.filter(r => r.mark !== '' && r.status !== 'In Progress').slice(-60)
      .map(r => ({ code: r.code, name: r.name, mark: num(r.mark), grade: r.grade || '' })),
    // what the Insights and Risk pages say, so Siri can talk about patterns and not just numbers
    insights: has ? [
      E.text.TREND_TEXT, m.TERMS_N >= 2 && m.MOMENTUM && `WAM ${m.MOMENTUM > 0 ? 'up' : 'down'} ${num(Math.abs(m.MOMENTUM))} on the previous term`, E.text.CONSISTENCY_TEXT !== '—' && `Marks are ${E.text.CONSISTENCY_TEXT}`,
      E.text.GOAL_TEXT, E.text.RISK_TEXT, E.text.NEXT_TEXT,
      m.BEST && `Best subject: ${m.BEST.code} ${m.BEST.name} (${num(m.BEST.mark)})`, m.WORST && `Weakest subject: ${m.WORST.code} ${m.WORST.name} (${num(m.WORST.mark)})`,
      E.types.filter(t => t.n).length > 1 && `Average by assessment type: ${E.types.filter(t => t.n).map(t => `${t.type} ${num(t.avg)} (${t.n})`).join(', ')}`,
      E.scanner.openCount && `Best lever: ${E.scanner.bestLever}`, E.scanner.openCount && `Biggest risk: ${E.scanner.topRisk}`,
    ].filter(Boolean).map(plain).filter(s => s && s !== '—') : [],
    persona: { name: E.S.studentName || '', ...siriProfile(prefs) },
    sim: simData(E),
  };
}

// Everything Siri needs to redo the engine's WAM and GPA maths for a what-if: the counted totals, the grade
// bands and classifications, and each subject's credit points, current contribution and open assessments.
function simData(E) {
  const m = E.m;
  return {
    qp: num(m.QP, 4), cpc: m.CP_COUNTED, gpc: num(m.GPC, 4), cpToWAM: m.CP_TO_WAM, passMark: E.S.passMark,
    bands: E.bands.map((b, i) => ({ min: b.min, max: b.max, grade: b.grade, gp: num(E.helpers.gpOf(i), 3) })),
    classes: E.classes.map(c => ({ name: c.name, min: c.min })),
    subjects: E.ledger.filter(r => r.code && num(r.cp) !== null).map(r => {
      const t = r.status === 'In Progress' ? E.tracker.find(x => x.code === r.code) : null;
      return {
        code: r.code, name: r.name, cp: r.cp, status: r.status, mark: num(r.mark, 2), qp: num(r.qp, 4), cpc: r.cpc, gpc: num(r.gpc, 4), manual: r.markIn !== '',
        ...(t ? {
          contrib: num(t.contrib, 4), wdone: num(t.graded, 2), bonus: num(t.bonus, 4),
          open: E.assessments.filter(a => a.code === r.code && a.name && !a.graded && a.type !== 'Bonus').map(a => ({ id: a.id, name: a.name, weight: num(a.weight) })),
        } : {}),
      };
    }),
  };
}

// How Siri talks to you, chosen in Settings → Siri & Apple Intelligence.
export const SIRI_STYLES = [['encouraging', 'Encouraging coach'], ['direct', 'Straight to the point'], ['detailed', 'Detailed analyst']];
export const siriProfile = prefs => ({
  style: SIRI_STYLES.some(([v]) => v === prefs.siriStyle) ? prefs.siriStyle : 'encouraging',
  about: String(prefs.siriAbout || '').slice(0, 600),
});

async function pushWidget(E, prefs) {
  const bridge = nativePlugin('WidgetBridge');
  if (!bridge) return null;
  const full = widgetSummary(E, prefs), summary = JSON.stringify({ ...full, updated: '' });
  if (summary === lastWidget) return null;
  lastWidget = summary;
  return bridge.update({ summary: JSON.stringify(full) });
}

// The reminder choices offered in Settings, as days before the due date.
export const REMINDER_OPTIONS = [[14, '2 weeks before'], [7, '1 week before'], [3, '3 days before'], [2, '2 days before'], [1, '1 day before'], [0, 'On the day']];
export const reminderPlan = prefs => ({
  days: Array.isArray(prefs.reminderDays) ? prefs.reminderDays.filter(d => REMINDER_OPTIONS.some(([v]) => v === d)) : [2, 0],
  time: /^\d{1,2}:\d{2}$/.test(prefs.reminderTime || '') ? prefs.reminderTime : '09:00',
});
const dueText = days => (days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : days === 7 ? 'Due in a week' : days === 14 ? 'Due in 2 weeks' : `Due in ${days} days`);

// One reminder per chosen lead time for every ungraded assessment with a due date, at the chosen time of day.
async function scheduleReminders(state, E) {
  const LN = nativePlugin('LocalNotifications');
  if (!LN) return;
  const on = state.prefs.reminders === true;
  const { days, time } = reminderPlan(state.prefs);
  const [hh, mm] = time.split(':').map(Number);
  const now = Date.now(), list = [];
  if (on) {
    for (const a of E.assessments.filter(x => x.name && x.due && !x.graded)) {
      const title = `${a.code ? `${a.code} · ` : ''}${a.name}`;
      const worth = a.weight !== '' ? ` · worth ${a.weight}%` : '';
      for (const before of days) {
        const when = new Date(a.due);
        when.setDate(when.getDate() - before);
        when.setHours(hh, mm, 0, 0);
        if (when.getTime() > now + 60000) list.push({ id: idFor(`${a.id}:${before}`), title, body: `${dueText(before)}${worth}`, schedule: { at: when, allowWhileIdle: true }, extra: { route: 'assessments' } });
      }
      // a week after the due date, ask whether the mark is back (participation has no single mark to wait for)
      if (state.prefs.markNudges !== false && a.type !== 'Participation' && a.type !== 'Bonus') {
        const back = new Date(a.due);
        back.setDate(back.getDate() + 7);
        back.setHours(hh, mm, 0, 0);
        if (back.getTime() > now + 60000) list.push({ id: idFor(`${a.id}:back`), title: `Got your mark back? ${title}`, body: 'Enter it to keep your WAM, widget and Siri current.', schedule: { at: back, allowWhileIdle: true }, extra: { route: 'assessments' } });
      }
    }
    list.sort((x, y) => x.schedule.at - y.schedule.at);
  }
  const wanted = list.slice(0, 60); // iOS keeps at most 64 pending
  const key = JSON.stringify(wanted.map(n => [n.id, +n.schedule.at, n.title, n.body]));
  if (key === lastRemind) return;
  lastRemind = key;
  const pending = await LN.getPending();
  const stale = pending.notifications.filter(n => n.id !== FOCUS_ID); // a running focus timer keeps its alert
  if (stale.length) await LN.cancel({ notifications: stale.map(n => ({ id: n.id })) });
  if (wanted.length) await LN.schedule({ notifications: wanted });
}

// ---------- focus timer and Lock Screen countdowns ----------
const FOCUS_ID = 909090;

// Mirrors the focus timer as a Live Activity, and asks iOS to say when a focus block ends while the app is closed.
export function timerStarted(t) {
  if (!isNativeApp()) return;
  const bridge = nativePlugin('WidgetBridge'), LN = nativePlugin('LocalNotifications');
  bridge?.startActivity({ kind: 'timer', title: t.label, code: t.code || '', start: t.start, end: t.focus ? t.start + t.focus * 60000 : 0 }).catch(() => {});
  if (t.focus && LN) {
    LN.checkPermissions().then(p => (p.display === 'granted'
      ? LN.schedule({ notifications: [{ id: FOCUS_ID, title: 'Focus block done', body: `${t.focus} minutes on ${t.label}. Open the app to log it.`, schedule: { at: new Date(t.start + t.focus * 60000), allowWhileIdle: true }, extra: { route: 'study' } }] })
      : null)).catch(() => {});
  }
}

export function timerStopped() {
  if (!isNativeApp()) return;
  nativePlugin('WidgetBridge')?.endActivity({ kind: 'timer' }).catch(() => {});
  nativePlugin('LocalNotifications')?.cancel({ notifications: [{ id: FOCUS_ID }] }).catch(() => {});
}

// A live countdown to an assessment's due time (11:59 pm on the day) on the Lock Screen and in the Dynamic Island.
export async function pinCountdown(a, { quiet = false } = {}) {
  const bridge = nativePlugin('WidgetBridge');
  if (!bridge) return false;
  const due = new Date(a.due);
  due.setHours(23, 59, 0, 0);
  try {
    const r = await bridge.startActivity({ kind: 'deadline', id: a.id, title: a.name, code: a.code || '', end: due.getTime(), weight: a.weight === '' ? 0 : Number(a.weight) });
    if (!quiet) toast(r && r.ok ? `${a.code} ${a.name} is counting down on your Lock Screen. iOS keeps it for up to 8 hours, so it works best on the day.` : 'Live Activities are turned off for GPA & WAM in iPhone Settings.', r && r.ok ? 'good' : 'error', 6500);
    return !!(r && r.ok);
  } catch (e) {
    if (!quiet) toast('This iPhone could not start a Live Activity.', 'error');
    return false;
  }
}

// On a due day, pin the countdown by itself once (Settings → Lock Screen countdown).
const pinnedKey = 'gpawam.pinned';
function autoPin(state, E) {
  if (state.prefs.autoPin === false) return;
  const today = E.dueList.find(a => a.days === 0);
  if (!today) return;
  const tag = `${today.id}:${isoDay(new Date())}`;
  try { if (localStorage.getItem(pinnedKey) === tag) return; localStorage.setItem(pinnedKey, tag); } catch (e) { return; }
  pinCountdown(today, { quiet: true });
}

// Turns reminders on (asking iOS for permission) or off. Returns the new setting.
export async function setReminders(on) {
  const LN = nativePlugin('LocalNotifications');
  if (!LN) return false;
  if (!on) return false;
  const p = await LN.requestPermissions();
  return p.display === 'granted';
}

export async function nativeStatus() {
  const LN = nativePlugin('LocalNotifications'), bridge = nativePlugin('WidgetBridge');
  const out = { notifications: 'unavailable', pending: 0, widget: 'unavailable' };
  // a plugin that is missing on the native side never answers, so every check gives up after a few seconds
  const within = p => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3000))]);
  try { if (LN) { out.notifications = (await within(LN.checkPermissions())).display; out.pending = (await within(LN.getPending())).notifications.length; } } catch (e) { /* plugin missing */ }
  try { if (bridge) { const r = await within(bridge.status()); out.widget = r.shared ? 'connected' : 'not shared'; out.siri = r.siriReadable ? 'ready' : 'waiting'; out.memory = r.memory || 0; } } catch (e) { /* plugin missing */ }
  return out;
}

// Clears what Siri remembers about recent questions.
export async function forgetAssistant() {
  const bridge = nativePlugin('WidgetBridge');
  if (bridge) await bridge.forgetAssistant();
}

// Tapping a reminder opens the Assessments page; "Open the planner in GPA & WAM" (Siri) opens the page it names,
// and "Try it in the GPA & WAM sandbox" hands over a what-if for onScenario to set up in the sandbox.
export function initNative(go, onScenario) {
  const LN = nativePlugin('LocalNotifications');
  if (LN && LN.addListener) LN.addListener('localNotificationActionPerformed', ev => go((ev.notification.extra && ev.notification.extra.route) || 'assessments'));
  const bridge = nativePlugin('WidgetBridge');
  if (!bridge) return;
  const takeRoute = () => bridge.takeRoute().then(r => {
    if (!r || !r.route) return;
    if (r.scenario === undefined || !onScenario) { go(r.route); return; }
    let changes = [];
    try { changes = JSON.parse(r.scenario); } catch (e) { /* an unreadable what-if still opens the sandbox */ }
    onScenario(Array.isArray(changes) ? changes : [], r.route);
  }).catch(() => {});
  takeRoute();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) takeRoute(); });
  window.addEventListener('gpawam-siri', takeRoute); // sent by the app when Siri leaves something while it is running
}
