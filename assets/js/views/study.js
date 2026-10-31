import { html, icon, fmt, fmtDate, chip, toast, isNativeApp } from '../ui.js';
import { crunchWeeks, studyPlan, focusStats, awaitingMarks, studyPrefs, PACES, runningMinutes, isoDay } from '../study.js';
import { startTimer, stopTimer, logManual, clock, FOCUS_OPTIONS } from '../timer.js';
import { exportStudyPlan } from '../export.js';
import { pinCountdown } from '../native.js';

const hrs = h => (h >= 10 ? fmt(h, 0) : fmt(h, h % 1 ? 1 : 0)) + 'h';
const mins = m => (m >= 60 ? `${fmt(m / 60, 1)}h` : `${Math.round(m)}m`);
const dayName = d => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
let showAll = false;
let picked = { code: '', itemId: '', focus: 25 }; // the timer form between renders

// Week-by-week assessment weight. Used here and on the Assessments page.
export function crunchCard(E, { title = 'Crunch weeks', compact = false } = {}) {
  const C = crunchWeeks(E);
  if (!C.weeks.length) return '';
  const peak = Math.max(50, C.peak);
  const upcoming = C.weeks.filter(w => !w.past && (w.level === 'crunch' || w.level === 'busy'));
  return html`<section class="card ${compact ? '' : 'mt'}">
    <div class="card-head"><h3>${title}</h3><span class="sub">Assessment weight due each week${C.crunch ? html` · <b class="ink2">${C.crunch} crunch week${C.crunch === 1 ? '' : 's'} ahead</b>` : ''}</span></div>
    <div class="card-body">
      <div class="crunch" role="list" aria-label="Assessment weight by week">${C.weeks.map(w => html`
        <div class="cw ${w.level} ${w.now ? 'now' : ''} ${w.past ? 'past' : ''}" role="listitem"
          title="${`Week of ${dayName(w.start)}: ${w.items.length ? w.items.map(a => `${a.code} ${a.name} (${fmt(a.weight || 0, 0)}%)`).join(', ') : 'nothing due'}`}">
          <span class="cw-v">${w.weight ? fmt(w.weight, 0) + '%' : ''}</span>
          <span class="cw-bar"><i style="height:${Math.max(w.weight ? 6 : 0, (w.weight / peak) * 100)}%"></i></span>
          <span class="cw-l">${w.now ? 'This wk' : w.start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
        </div>`)}</div>
      ${upcoming.length ? html`<ul class="cw-list">${upcoming.slice(0, compact ? 3 : 6).map(w => html`<li>
        ${chip(w.level === 'crunch' ? '🔥 Crunch' : 'Busy', w.level === 'crunch' ? 'critical' : 'warning')}
        <b>${w.now ? 'This week' : `Week of ${dayName(w.start)}`}</b> · ${fmt(w.weight, 0)}% due:
        <span class="muted">${w.items.map(a => `${a.code} ${a.name} (${fmt(a.weight || 0, 0)}%)`).join(' · ')}</span></li>`)}</ul>`
        : html`<p class="note">No week ahead stands out. Deadlines are spread evenly.</p>`}
    </div></section>`;
}

export default {
  title: 'Study planner',
  subtitle: () => 'Crunch weeks · a revision plan counted back from your deadlines · focus timer and study stats',
  render(ctx) {
    const { E, state } = ctx;
    const plan = studyPlan(E, state);
    const P = plan.prefs;
    const F = focusStats(E, state);
    const t = state.prefs.timer;
    const open = E.assessments.filter(a => a.name && !a.graded && a.type !== 'Bonus');
    const codes = [...new Set([...E.tracker.map(r => r.code), ...open.map(a => a.code)].filter(Boolean))];
    if (picked.code && !codes.includes(picked.code)) picked = { ...picked, code: '', itemId: '' };
    const items = open.filter(a => a.code === picked.code);
    const days = plan.days.filter(d => d.total > 0);
    const shown = showAll ? days : days.slice(0, 10);
    const todayKey = isoDay(E.today);
    const back = awaitingMarks(E);
    const next = E.dueList.find(a => a.days >= 0);
    return html`
    ${back.length ? html`<section class="callout warn" style="margin-bottom:16px">${icon('check')}<span><b>Got ${back.length === 1 ? 'this mark' : 'these marks'} back?</b> ${back.map(a => `${a.code} ${a.name}`).join(', ')} ${back.length === 1 ? 'was' : 'were'} due over a week ago and still ${back.length === 1 ? 'has' : 'have'} no mark. <a href="#/assessments">Enter them on Assessments</a> to keep your WAM, widget and Siri current.</span></section>` : ''}

    <section class="grid g-3-2 top">
      <div class="card timer-card ${t ? 'running' : ''}">
        <div class="card-head"><h3>Focus timer</h3><span class="sub">${t ? 'Running. It keeps going if you close the page.' : 'Time a study session and it is logged against the subject'}</span></div>
        <div class="card-body">
          ${t ? html`
            <div class="tm-now"><span class="tm-dot" aria-hidden="true"></span><div><div class="tm-label">${t.label}</div>
              <div class="tm-big" id="tm-elapsed" aria-live="off">${t.focus ? clock(Math.max(0, t.focus - runningMinutes(t))) + ' left' : clock(runningMinutes(t))}</div>
              <div class="muted">Started ${new Date(t.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}${t.focus ? ` · ${t.focus}-minute focus block` : ''}</div></div></div>
            <div class="row mt"><button class="btn primary" data-action="tm-stop">${icon('check')}Stop and log</button><button class="btn ghost" data-action="tm-cancel">Discard</button></div>`
          : html`
            <div class="grid-form tm-form">
              <label class="field"><span>Subject</span><select class="select" id="tm-code"><option value="">General study</option>${codes.map(c => html`<option value="${c}" ${picked.code === c ? 'selected' : ''}>${c}</option>`)}</select></label>
              <label class="field"><span>For</span><select class="select" id="tm-item" ${picked.code ? '' : 'disabled'}><option value="">The whole subject</option>${items.map(a => html`<option value="${a.id}" ${picked.itemId === a.id ? 'selected' : ''}>${a.name}</option>`)}</select></label>
              <label class="field"><span>Length</span><select class="select" id="tm-focus">${FOCUS_OPTIONS.map(([v, l]) => html`<option value="${v}" ${Number(picked.focus) === v ? 'selected' : ''}>${l}</option>`)}</select></label>
            </div>
            <div class="row mt"><button class="btn primary" data-action="tm-start">${icon('clock')}Start timer</button>
              <span class="spacer"></span>
              <label class="tm-manual">Forgot to time it? <input class="input" id="tm-min" inputmode="numeric" placeholder="mins" aria-label="Minutes studied"> <button class="btn sm" data-action="tm-log">Log</button></label></div>`}
          ${isNativeApp() && next ? html`<p class="note mt">${icon('calendar', 14)} <a href="#" data-action="pin-next">Pin ${next.code} ${next.name} to the Lock Screen</a> as a live countdown.</p>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Focus stats</h3><span class="sub">${F.sessions ? `${F.sessions} session${F.sessions === 1 ? '' : 's'} logged` : 'Start the timer to build these up'}</span></div>
        <div class="card-body">
          <div class="fs-kpis"><div><small>This week</small><b>${mins(F.week)}</b></div><div><small>All time</small><b>${mins(F.total)}</b></div><div><small>Streak</small><b>${F.streak} day${F.streak === 1 ? '' : 's'}</b></div></div>
          <div class="fs-days" aria-label="Minutes studied, last 7 days">${F.last7.map(d => html`<div title="${`${dayName(d.date)}: ${mins(d.minutes)}`}"><span><i style="height:${Math.min(100, d.minutes / Math.max(60, ...F.last7.map(x => x.minutes)) * 100)}%"></i></span><small>${d.date.toLocaleDateString('en-AU', { weekday: 'narrow' })}</small></div>`)}</div>
        </div>
      </div>
    </section>

    ${crunchCard(E)}

    <section class="card mt">
      <div class="card-head"><h3>Study plan</h3><span class="sub">${plan.items.length ? `${hrs(plan.total)} of revision for ${plan.items.length} upcoming item${plan.items.length === 1 ? '' : 's'}, packed into the time you have` : 'Add due dates and weights to ungraded assessments and a plan appears here'}</span>
        <div class="actions">${plan.items.length ? html`<button class="btn sm" data-action="plan-ics">${icon('calendar', 15)}Add to calendar</button>` : ''}</div></div>
      <div class="card-body">
        <div class="plan-prefs">
          <label>Weekdays <input class="input" id="sp-weekday" value="${P.weekday}" inputmode="decimal" aria-label="Study hours on weekdays"> h</label>
          <label>Weekends <input class="input" id="sp-weekend" value="${P.weekend}" inputmode="decimal" aria-label="Study hours on weekends"> h</label>
          <label>From <input class="input" type="time" id="sp-start" value="${P.start}" aria-label="Usual start time"></label>
          <label>Pace <select class="select" id="sp-pace">${PACES.map(([v, l]) => html`<option value="${v}" ${P.pace === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        </div>
        ${plan.short.length ? html`<div class="callout warn mt-s">${icon('clock')}<span><b>Not enough time for everything.</b> ${plan.short.map(x => `${x.a.code} ${x.a.name} is ${hrs(x.short)} short`).join('; ')}. Add hours on the days before, or start earlier.</span></div>` : ''}
        ${shown.length ? html`<div class="agenda">${shown.map(d => html`<div class="ag-day ${isoDay(d.date) === todayKey ? 'today' : ''}">
          <div class="ag-date"><b>${isoDay(d.date) === todayKey ? 'Today' : d.date.toLocaleDateString('en-AU', { weekday: 'short' })}</b><span>${d.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span></div>
          <div class="ag-items">${d.sessions.map(s => html`<button class="ag-s" data-action="tm-start-item" data-id="${s.a.id}" title="Start the timer for this">
            <b>${hrs(s.hours)}</b> ${s.a.code} · ${s.a.name} <span class="muted">due ${fmtDate(s.a.due)}</span></button>`)}</div></div>`)}</div>
          ${days.length > 10 ? html`<button class="btn sm ghost mt-s" data-action="plan-more">${showAll ? 'Show fewer days' : `Show all ${days.length} days`}</button>` : ''}`
        : plan.items.length ? html`<p class="note">Nothing is scheduled: set some weekday or weekend hours above.</p>` : ''}
        ${plan.items.length ? html`<div class="tbl-wrap mt"><table class="tbl">
          <thead><tr><th>Item</th><th>Due</th><th class="n">Weight</th><th class="n">Planned</th><th class="n">Studied</th><th>Starts</th><th></th></tr></thead>
          <tbody>${plan.items.map(x => html`<tr><td><b>${x.a.code}</b> ${x.a.name}${x.lift > 1.05 ? html` ${chip('needs a lift', 'warning')}` : x.lift < 0.95 ? html` ${chip('on track', 'good')}` : ''}</td>
            <td class="nowrap">${fmtDate(x.a.due)}</td><td class="n">${fmt(x.a.weight, 0)}%</td><td class="n">${hrs(x.hours)}</td>
            <td class="n">${x.studied ? hrs(Math.round(x.studied * 10) / 10) : '—'}</td><td class="nowrap">${fmtDate(x.from < E.today ? E.today : x.from)}</td>
            <td>${x.short ? chip(`${hrs(x.short)} short`, 'critical') : ''}</td></tr>`)}</tbody></table></div>
          <p class="note">Hours scale with each item's weight and type, and go up when a subject needs a big lift to reach its target (or a Distinction). Time you log against an item counts towards it.</p>` : ''}
      </div>
    </section>

    ${F.subjects.length ? html`<section class="card mt">
      <div class="card-head"><h3>Study time vs marks</h3><span class="sub">Where your hours went, next to each subject's mark</span></div>
      <div class="card-body flush tbl-wrap"><table class="tbl"><thead><tr><th>Subject</th><th class="n">This week</th><th class="n">Total</th><th class="n">Sessions</th><th class="n">Mark</th></tr></thead>
        <tbody>${F.subjects.map(r => html`<tr><td><b>${r.code || 'General'}</b> ${r.row ? html`<span class="muted">${r.row.name}</span>` : ''}</td><td class="n">${mins(r.week)}</td><td class="n">${mins(r.minutes)}</td><td class="n">${r.n}</td><td class="n strong">${r.mark === '' ? '—' : fmt(r.mark, 1)}</td></tr>`)}</tbody></table></div>
    </section>` : ''}`;
  },
  mount(root, ctx) {
    const P = studyPrefs(ctx.state.prefs);
    const setPref = (k, v) => ctx.update(s => { s.prefs.study = { ...P, ...(s.prefs.study || {}), [k]: v }; });
    const hours = id => root.querySelector(id)?.addEventListener('change', e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n <= 12) setPref(id.slice(4), n); else e.target.value = P[id.slice(4)]; });
    hours('#sp-weekday'); hours('#sp-weekend');
    root.querySelector('#sp-start')?.addEventListener('change', e => { if (e.target.value) setPref('start', e.target.value); });
    root.querySelector('#sp-pace')?.addEventListener('change', e => setPref('pace', Number(e.target.value)));
    root.querySelector('#tm-code')?.addEventListener('change', e => { picked = { ...picked, code: e.target.value, itemId: '' }; ctx.render(); });
    root.querySelector('#tm-item')?.addEventListener('change', e => { picked.itemId = e.target.value; });
    root.querySelector('#tm-focus')?.addEventListener('change', e => { picked.focus = Number(e.target.value); });
  },
  actions: {
    'tm-start': (el, ctx) => {
      const a = ctx.E.assessments.find(x => x.id === picked.itemId);
      startTimer(ctx.update, { code: picked.code, itemId: picked.itemId, label: a ? `${a.code} · ${a.name}` : picked.code || 'General study', focus: picked.focus });
    },
    'tm-start-item': (el, ctx) => {
      if (ctx.state.prefs.timer) { toast('A timer is already running. Stop it first.'); return; }
      const a = ctx.E.assessments.find(x => x.id === el.dataset.id);
      if (!a) return;
      picked = { code: a.code, itemId: a.id, focus: picked.focus };
      startTimer(ctx.update, { code: a.code, itemId: a.id, label: `${a.code} · ${a.name}`, focus: picked.focus });
    },
    'tm-stop': (el, ctx) => stopTimer(ctx.update, ctx.state),
    'tm-cancel': (el, ctx) => { stopTimer(ctx.update, ctx.state, { save: false }); toast('Timer discarded.'); },
    'tm-log': (el, ctx) => {
      const n = Number(document.getElementById('tm-min')?.value);
      if (!(n > 0 && n <= 600)) { toast('Enter the minutes you studied, from 1 to 600.'); return; }
      const a = ctx.E.assessments.find(x => x.id === picked.itemId);
      logManual(ctx.update, { code: picked.code, itemId: picked.itemId, label: a ? `${a.code} · ${a.name}` : picked.code || 'General study', minutes: n, when: new Date(Date.now() - n * 60000) });
      toast(`Logged ${mins(n)}.`, 'good');
    },
    'plan-more': (el, ctx) => { showAll = !showAll; ctx.render(); },
    'plan-ics': (el, ctx) => exportStudyPlan(studyPlan(ctx.E, ctx.state)),
    'pin-next': async (el, ctx) => {
      const a = ctx.E.dueList.find(x => x.days >= 0);
      if (a) await pinCountdown(a);
    },
  },
};
