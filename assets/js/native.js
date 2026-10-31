// iPhone app only: keeps the home-screen widget and the deadline reminders in step with the saved record.
import { isNativeApp, nativePlugin } from './ui.js';

const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Notification ids must be 32-bit integers; a stable hash keeps one id per assessment and reminder kind.
const idFor = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return Math.abs(h | 0) || 1; };

let widgetTimer = 0, remindTimer = 0, lastWidget = '', lastRemind = '';

// Called after every recalculation; the work is debounced so typing does not spam the native side.
export function syncNative(state, E) {
  if (!isNativeApp()) return;
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => pushWidget(E).catch(() => {}), 700);
  clearTimeout(remindTimer);
  remindTimer = setTimeout(() => scheduleReminders(state, E).catch(() => {}), 1500);
}

export function widgetSummary(E) {
  const m = E.m, has = m.MARK_N > 0;
  const next = E.dueList.find(a => a.days >= 0);
  return {
    wam: has ? Math.round(m.WAM * 100) / 100 : null, gpa: has ? Math.round(m.GPA * 1000) / 1000 : null, maxGPA: E.maxGPA,
    grade: has ? m.GRADE || '' : '', classification: has ? m.CLASS.name : '',
    cp: m.CP_DONE, totalCP: E.S.totalCP, targetWAM: E.S.targetWAM, targetGPA: E.S.targetGPA,
    nextCode: next ? next.code : null, nextName: next ? next.name : null, nextDue: next ? isoDay(next.due) : null,
    dueSoon: m.DUE_SOON_N, updated: new Date().toISOString(),
  };
}

async function pushWidget(E) {
  const bridge = nativePlugin('WidgetBridge');
  if (!bridge) return null;
  const summary = JSON.stringify({ ...widgetSummary(E), updated: '' });
  if (summary === lastWidget) return null;
  lastWidget = summary;
  return bridge.update({ summary: JSON.stringify(widgetSummary(E)) });
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
    }
    list.sort((x, y) => x.schedule.at - y.schedule.at);
  }
  const wanted = list.slice(0, 60); // iOS keeps at most 64 pending
  const key = JSON.stringify(wanted.map(n => [n.id, +n.schedule.at, n.title, n.body]));
  if (key === lastRemind) return;
  lastRemind = key;
  const pending = await LN.getPending();
  if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  if (wanted.length) await LN.schedule({ notifications: wanted });
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
  try { if (LN) { out.notifications = (await LN.checkPermissions()).display; out.pending = (await LN.getPending()).notifications.length; } } catch (e) { /* plugin missing */ }
  try { if (bridge) { const r = await bridge.status(); out.widget = r.shared ? 'connected' : 'not shared'; } } catch (e) { /* plugin missing */ }
  return out;
}

// Tapping a reminder opens the Assessments page.
export function initNative(go) {
  const LN = nativePlugin('LocalNotifications');
  if (LN && LN.addListener) LN.addListener('localNotificationActionPerformed', ev => go((ev.notification.extra && ev.notification.extra.route) || 'assessments'));
}
