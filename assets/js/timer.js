// The focus timer: one running session at a time, kept in prefs.timer so it survives a reload or the app being
// closed, and logged into state.sessions when it stops. The iPhone app mirrors it as a Live Activity.
import { html, icon, toast } from './ui.js';
import { runningMinutes } from './study.js';
import { timerStarted, timerStopped } from './native.js';
import { uid } from './state.js';

export const FOCUS_OPTIONS = [[0, 'Open-ended'], [25, '25 min focus'], [50, '50 min focus'], [90, '90 min deep work']];

export const clock = mins => {
  const s = Math.floor(mins * 60), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

// 95 → "1 h 35 min", 30.2 → "30 min"
export const duration = mins => { const m = Math.round(mins), h = Math.floor(m / 60); return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; };

// label: what the session is for, e.g. "ACCT3001 · Final exam"
export function startTimer(update, { code = '', itemId = '', label = '', focus = 0 }) {
  const timer = { code, itemId, label: label || code || 'Study', focus: Number(focus) || 0, start: Date.now(), alerted: false };
  update(s => { s.prefs.timer = timer; });
  timerStarted(timer);
  toast(`Timer started${timer.focus ? ` for ${timer.focus} minutes` : ''}: ${timer.label}.`);
}

export function stopTimer(update, state, { save = true } = {}) {
  const t = state.prefs.timer;
  if (!t) return 0;
  const minutes = Math.round(runningMinutes(t) * 10) / 10;
  update(s => {
    s.prefs.timer = null;
    if (save && minutes >= 1) {
      if (!Array.isArray(s.sessions)) s.sessions = [];
      s.sessions.push({ id: uid(), code: t.code, itemId: t.itemId, label: t.label, start: new Date(t.start).toISOString(), minutes });
    }
  });
  timerStopped();
  if (save) toast(minutes >= 1 ? `Logged ${duration(minutes)} on ${t.label}.` : 'Under a minute, so nothing was logged.', minutes >= 1 ? 'good' : undefined);
  return minutes;
}

export function logManual(update, { code = '', itemId = '', label = '', minutes, when = new Date() }) {
  if (!(minutes > 0)) return;
  update(s => {
    if (!Array.isArray(s.sessions)) s.sessions = [];
    s.sessions.push({ id: uid(), code, itemId, label: label || code || 'Study', start: new Date(when).toISOString(), minutes });
  });
}

// The running-timer chip in the top bar, ticking once a second. Calls back once when a focus block ends.
let tick = 0;
export function renderTimerChip(state, { go, onFocusEnd }) {
  let chip = document.getElementById('timer-chip');
  const t = state.prefs.timer;
  clearInterval(tick);
  if (!t) { if (chip) chip.remove(); return; }
  if (!chip) {
    chip = document.createElement('button');
    chip.id = 'timer-chip';
    chip.type = 'button';
    chip.className = 'timer-chip';
    chip.addEventListener('click', () => go('study'));
    document.querySelector('.top-actions').prepend(chip);
  }
  const paint = () => {
    const mins = runningMinutes(t);
    const left = t.focus ? t.focus - mins : 0;
    chip.innerHTML = html`<i aria-hidden="true"></i>${icon('clock', 15)}<b>${t.focus && left > 0 ? clock(left) : clock(mins)}</b><span class="lbl">${t.label}</span>`.s;
    chip.title = t.focus ? `${t.label}: ${t.focus}-minute focus block` : `${t.label}: timer running`;
    const el = document.getElementById('tm-elapsed');
    if (el) el.textContent = t.focus && left > 0 ? `${clock(left)} left` : clock(mins);
    if (t.focus && left <= 0 && !t.alerted) { t.alerted = true; onFocusEnd(t); }
  };
  paint();
  tick = setInterval(paint, 1000);
}
