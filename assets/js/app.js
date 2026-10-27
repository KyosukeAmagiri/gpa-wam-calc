import { compute, num, cleanCode } from './engine.js';
import { loadState, saveState, normaliseState, defaultState, sampleState, storageAvailable, clearStored, uid } from './state.js';
import { html, icon, toast, confirmDialog, openModal } from './ui.js';
import SUBJECTS from '../data/subjects.js';
import * as exporter from './export.js';

import dashboard from './views/dashboard.js';
import subjects from './views/subjects.js';
import assessments from './views/assessments.js';
import insights from './views/insights.js';
import scanner from './views/scanner.js';
import planner from './views/planner.js';
import degree from './views/degree.js';
import summary from './views/summary.js';
import history from './views/history.js';
import settings from './views/settings.js';

const VIEWS = { dashboard, subjects, assessments, insights, scanner, planner, degree, summary, history, settings };
const NAV = [
  ['Overview', [['dashboard', 'Dashboard', 'dashboard']]],
  ['Record', [['subjects', 'Subjects', 'book'], ['assessments', 'Assessments', 'list']]],
  ['Analyse', [['insights', 'Insights', 'insights'], ['scanner', 'Risk & opportunity', 'radar'], ['planner', 'Planner & odds', 'dice'], ['degree', 'Degree map', 'map']]],
  ['Report', [['summary', 'Academic summary', 'doc'], ['history', 'History', 'clock']]],
  ['', [['settings', 'Settings', 'gear']]],
];

let state = loadState().state;
let E = null;
let route = 'dashboard';
const lookupName = code => SUBJECTS[cleanCode(code)] || '';
export const subjectName = lookupName;

// ---------- theme ----------
const mql = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const pref = state.prefs.theme || 'system';
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme; else root.dataset.theme = pref;
  const dark = pref === 'dark' || (pref === 'system' && mql.matches);
  root.dataset.resolvedTheme = dark ? 'dark' : 'light';
  document.getElementById('btn-theme').innerHTML = icon(dark ? 'sun' : 'moon').s;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#110f10' : '#9d2235');
}
mql.addEventListener?.('change', () => { if ((state.prefs.theme || 'system') === 'system') { applyTheme(); render(); } });

// ---------- state updates ----------
function recompute() {
  E = compute(state, { lookupName });
  return E;
}
const saveEl = () => document.getElementById('save-state');
function persist() {
  const el = saveEl();
  el.classList.add('unsaved');
  el.querySelector('span').textContent = 'Saving…';
  saveState(state, ok => {
    el.classList.toggle('unsaved', !ok);
    el.querySelector('span').textContent = ok ? 'Saved on this device' : 'Not saved (storage blocked)';
  });
}
export function update(mutator, { rerender = true } = {}) {
  mutator(state);
  persist();
  recompute();
  if (rerender) render();
}
export function replaceState(next) {
  state = normaliseState(next);
  applyTheme();
  persist();
  recompute();
  render();
}
export const getState = () => state;
export const getE = () => E;

// ---------- binding: data-bind="kind:key:field" ----------
function parseValue(el) {
  const t = el.dataset.type || 'text';
  if (el.type === 'checkbox') return el.checked;
  const v = el.value;
  if (t === 'num') { const n = num(v); return n === '' ? '' : n; }
  if (t === 'int') { const n = num(v); return n === '' ? '' : Math.round(n); }
  if (t === 'code') return cleanCode(v);
  return v.trim();
}
const findById = (arr, id) => arr.find(x => x.id === id);
function applyBind(bind, value) {
  const [kind, key, field] = bind.split(':');
  update(s => {
    switch (kind) {
      case 'S': s.settings[key] = value; break;
      case 'P': s.planner[key] = value; break;
      case 'sub': {
        const r = findById(s.subjects, key);
        if (!r) break;
        // A name identical to the WSU list entry stays 'automatic' so it follows code changes.
        r[field] = field === 'name' && value === lookupName(r.code) ? '' : value;
        break;
      }
      case 'as': { const r = findById(s.assessments, key); if (r) r[field] = value; break; }
      case 'pre': {
        const r = findById(s.prereqs, key);
        if (!r) break;
        if (field.startsWith('opt')) r.opts[+field.slice(3)] = value; else r[field] = value;
        break;
      }
      case 'off': { const r = findById(s.offerings, key); if (r) r[field] = value; break; }
      case 'hist': { const r = findById(s.history, key); if (r) r[field] = value; break; }
      case 'scen': { const r = findById(s.planner.scenario, key); if (r) r[field] = value; break; }
      case 'band': { const r = s.settings.bands[+key]; if (r) r[field] = value; break; }
      case 'cls': { const r = s.settings.classes[+key]; if (r) r[field] = value; break; }
      case 'disc': { const r = s.settings.discLabels[+key]; if (r) r[field] = field === 'prefix' ? cleanCode(value).slice(0, 4) : value; break; }
      case 'ov': {
        s.planner.overrides[key] = { ...(s.planner.overrides[key] || {}), [field]: value };
        const o = s.planner.overrides[key];
        if (['low', 'exp', 'high'].every(k => o[k] === '' || o[k] === undefined)) delete s.planner.overrides[key];
        break;
      }
      default: break;
    }
  });
}

// ---------- rendering ----------
const viewEl = () => document.getElementById('view');
let renderQueued = false;
function snapshotFocus() {
  const a = document.activeElement;
  if (!a || !viewEl().contains(a)) return null;
  return { bind: a.dataset.bind, action: a.dataset.action && a.dataset.id ? `${a.dataset.action}|${a.dataset.id}` : null, start: a.selectionStart, end: a.selectionEnd };
}
function restoreFocus(f) {
  if (!f) return;
  let el = null;
  if (f.bind) el = viewEl().querySelector(`[data-bind="${CSS.escape(f.bind)}"]`);
  if (!el && f.action) { const [a, id] = f.action.split('|'); el = viewEl().querySelector(`[data-action="${CSS.escape(a)}"][data-id="${CSS.escape(id)}"]`); }
  if (el) {
    el.focus({ preventScroll: true });
    try { if (f.start !== null && f.start !== undefined && el.setSelectionRange) el.setSelectionRange(f.start, f.end); } catch (e) { /* not a text input */ }
  }
}
export function render() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    const focus = snapshotFocus();
    const scrollY = window.scrollY;
    const v = VIEWS[route];
    const ctx = makeCtx();
    document.getElementById('page-title').textContent = v.title;
    document.getElementById('page-sub').textContent = (v.subtitle && v.subtitle(ctx)) || headline();
    const entering = route !== shownRoute;
    shownRoute = route;
    viewEl().classList.remove('enter');
    viewEl().innerHTML = v.render(ctx).s;
    if (entering) playEntrance(viewEl());
    v.mount && v.mount(viewEl(), ctx);
    mountCharts();
    renderNav();
    window.scrollTo(0, scrollY);
    restoreFocus(focus);
  }, 0);
}

// ---------- entrance motion: plays when a page opens, never on the re-renders that follow typing ----------
let shownRoute = null, enterTimer = 0;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function playEntrance(root) {
  if (reduceMotion.matches) return;
  const parts = root.querySelectorAll(':scope > :not(.grid):not(.kpis):not(datalist), :scope > .grid > *, :scope > .kpis > *');
  parts.forEach((el, i) => { el.classList.add('a-in'); el.style.setProperty('--i', Math.min(i, 12)); });
  void root.offsetWidth; // restart the animation when moving between pages
  root.classList.add('enter');
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => root.classList.remove('enter'), 1400);
  root.querySelectorAll('.kpi .value').forEach(countUp); // not the printable summary, which can print mid-count
}
// Counts a card's headline number up from zero. A timer puts the exact final text back even if the browser pauses animation frames.
function countUp(el) {
  const node = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.nodeValue));
  const m = node && node.nodeValue.match(/^(\s*)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/);
  if (!m) return;
  const final = node.nodeValue, target = Number(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, grouping = m[2].includes(',');
  const t0 = performance.now(), dur = 900;
  let done = false;
  const step = now => {
    if (done) return;
    const k = Math.min(1, (now - t0) / dur), eased = 1 - (1 - k) ** 3;
    node.nodeValue = m[1] + (target * eased).toLocaleString('en-AU', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: grouping }) + m[3];
    if (k < 1 && node.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => { done = true; node.nodeValue = final; }, dur + 60);
}
function headline() {
  const s = state.settings;
  return [s.studentName, s.program, s.institution].filter(Boolean).join('  ·  ');
}
function makeCtx() {
  return { state, E, update, render, go, replaceState, lookupName, headline: headline(), openImport, uid, runExport, resetAll };
}

function renderNav() {
  const badges = {
    subjects: state.subjects.length ? String(state.subjects.length) : '',
    assessments: E.m.OVERDUE_N ? `${E.m.OVERDUE_N} overdue` : E.dueList.length ? String(E.dueList.length) : '',
    scanner: E.scanner.openCount ? String(E.scanner.openCount) : '',
    degree: E.plan.PLAN_ISSUES ? String(E.plan.PLAN_ISSUES) : '',
  };
  const warn = { assessments: E.m.OVERDUE_N > 0, degree: E.plan.PLAN_ISSUES > 0 };
  document.getElementById('nav').innerHTML = NAV.map(([group, items]) => html`
    ${group ? html`<div class="nav-group">${group}</div>` : html`<div class="nav-group" aria-hidden="true"></div>`}
    ${items.map(([id, label, ic]) => html`<a href="#/${id}" class="${route === id ? 'active' : ''}" ${route === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${badges[id] ? html`<span class="badge ${warn[id] ? 'warn' : ''}">${badges[id]}</span>` : ''}</a>`)}
  `.s).join('');
}

// Charts mount into [data-chart] placeholders after the HTML is in place.
// .fill boxes also redraw when their height changes.
const boxH = el => (el.classList.contains('fill') ? Math.round(el.clientHeight) : 0);
const ro = new ResizeObserver(entries => {
  for (const en of entries) {
    const el = en.target;
    const w = Math.round(en.contentRect.width), h = boxH(el);
    if (el._w && (Math.abs(el._w - w) > 2 || Math.abs(el._h - h) > 2) && el._chart) { el._w = w; el._h = h; el._chart(); } else { el._w = w; el._h = h; }
  }
});
function mountCharts() {
  viewEl().querySelectorAll('.chart-box').forEach(el => { el._w = Math.round(el.clientWidth); el._h = boxH(el); ro.observe(el); });
}

// ---------- routing ----------
export function go(r) { if (location.hash !== `#/${r}`) location.hash = `#/${r}`; else onRoute(); }
function onRoute() {
  const r = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  route = VIEWS[r] ? r : 'dashboard';
  document.body.classList.remove('nav-open');
  closeMenu();
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => (location.hash.startsWith('#sync=') ? receiveTransfer() : onRoute()));

// ---------- global event delegation ----------
const view = viewEl();
view.addEventListener('change', e => {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  applyBind(el.dataset.bind, parseValue(el));
});
view.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Enter' && el.matches('input.cell')) {
    e.preventDefault();
    const col = el.dataset.col;
    const tr = el.closest('tr');
    let next = tr && tr.nextElementSibling;
    while (next && !next.querySelector(`[data-col="${col}"]`)) next = next.nextElementSibling;
    const target = next && next.querySelector(`[data-col="${col}"]`);
    if (target) target.focus(); else el.blur();
  }
});
view.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const v = VIEWS[route];
  const fn = (v.actions && v.actions[el.dataset.action]) || GLOBAL_ACTIONS[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, makeCtx(), e); }
});

const GLOBAL_ACTIONS = {
  go: el => go(el.dataset.to),
  import: () => openImport(),
  sample: async () => {
    if (state.subjects.length && !(await confirmDialog('Load sample data?', 'This replaces everything currently saved in this browser with a fictional sample student. Export a backup first if you want to keep your data.', 'Replace with sample', true))) return;
    replaceState(sampleState());
    toast('Loaded a fictional sample student. Reset from Settings when you are ready to add your own.', 'good');
  },
  'add-first-subject': () => { update(s => { s.subjects.push(blankSubject(s)); }); go('subjects'); },
};
export function blankSubject(s) {
  const last = s.subjects[s.subjects.length - 1];
  return { id: uid(), year: last ? last.year : (num(s.settings.curYear) || 1), sem: last ? last.sem : (num(s.settings.curSem) || 1), code: '', name: '', category: '', cp: 10, status: 'Planned', mark: '', notes: '' };
}

// ---------- top bar ----------
document.getElementById('menu-btn').innerHTML = icon('menu').s;
document.getElementById('menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.addEventListener('click', e => { if (document.body.classList.contains('nav-open') && !e.target.closest('.side') && !e.target.closest('#menu-btn')) document.body.classList.remove('nav-open'); });
document.getElementById('btn-import').innerHTML = html`${icon('upload')}<span class="lbl">Import from MySR</span>`.s;
document.getElementById('btn-import').addEventListener('click', () => openImport());
document.getElementById('btn-export').innerHTML = html`${icon('download')}<span class="lbl">Export</span>`.s;
document.getElementById('btn-theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.resolvedTheme === 'dark';
  state.prefs.theme = dark ? 'light' : 'dark';
  persist();
  applyTheme();
  render();
});

const menu = document.getElementById('export-menu');
function closeMenu() { menu.classList.remove('open'); document.getElementById('btn-export').setAttribute('aria-expanded', 'false'); }
document.getElementById('export-list').innerHTML = html`
  <button data-x="json" role="menuitem">${icon('shield')}<span>Back up everything<small>JSON file you can restore later</small></span></button>
  <button data-x="restore" role="menuitem">${icon('refresh')}<span>Restore from backup<small>Load a JSON backup file</small></span></button>
  <button data-x="link" role="menuitem">${icon('upload')}<span>Transfer link<small>Open your data on another device</small></span></button>
  <hr>
  <button data-x="xlsx" role="menuitem">${icon('file')}<span>Excel workbook (.xlsx)<small>Subjects, assessments, terms, summary</small></span></button>
  <button data-x="csv-subjects" role="menuitem">${icon('book')}<span>Subjects (.csv)</span></button>
  <button data-x="csv-assess" role="menuitem">${icon('list')}<span>Assessments (.csv)</span></button>
  <hr>
  <button data-x="print" role="menuitem">${icon('print')}<span>Print or save summary as PDF</span></button>`.s;
document.getElementById('btn-export').addEventListener('click', e => {
  e.stopPropagation();
  const open = !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  document.getElementById('btn-export').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', e => { if (!e.target.closest('#export-menu')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
document.getElementById('export-list').addEventListener('click', e => {
  const b = e.target.closest('button[data-x]');
  if (!b) return;
  closeMenu();
  runExport(b.dataset.x);
});
export function runExport(kind) {
  try {
    if (kind === 'json') exporter.exportJSON(state);
    else if (kind === 'restore') document.getElementById('file-json').click();
    else if (kind === 'link') showTransferLink();
    else if (kind === 'xlsx') exporter.exportXLSX(state, E);
    else if (kind === 'csv-subjects') exporter.exportSubjectsCSV(E);
    else if (kind === 'csv-assess') exporter.exportAssessmentsCSV(E);
    else if (kind === 'print') { go('summary'); setTimeout(() => window.print(), 400); }
  } catch (err) {
    console.error(err);
    toast('Export failed: ' + err.message, 'error');
  }
}
document.getElementById('file-json').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { throw new Error('That isn’t a backup file. Choose the .json file saved by “Back up everything”.'); }
    const payload = data && data.app === 'gpa-wam-calculator' ? data.state : data;
    if (!payload || typeof payload !== 'object' || !('subjects' in payload || 'settings' in payload)) throw new Error('This file is not a calculator backup.');
    if (!(await confirmDialog('Restore this backup?', `It holds ${(payload.subjects || []).length} subject(s) and ${(payload.assessments || []).length} assessment item(s). Everything currently saved in this browser will be replaced.`, 'Restore', true))) return;
    replaceState(payload);
    toast('Backup restored.', 'good');
  } catch (err) {
    toast(err.message || 'Could not read that file.', 'error');
  }
});

// ---------- transfer link ----------
async function showTransferLink() {
  const link = await exporter.makeTransferLink(state);
  const body = document.createElement('div');
  body.innerHTML = html`
    <p class="lede">Open this link on your phone or another computer to load your ${state.subjects.length} subject(s) and ${state.assessments.length} assessment item(s) there. Nothing is uploaded: the data travels inside the link itself.</p>
    <textarea class="input mt" id="xfer-link" rows="4" readonly aria-label="Transfer link" style="font:12px/1.45 ui-monospace,Consolas,monospace;word-break:break-all">${link}</textarea>
    <p class="note mt-s">${icon('shield', 14)} Anyone who has this link can see your marks, so send it only to yourself (for example by email or a notes app). It is a snapshot: later changes need a new link. ${link.length.toLocaleString('en-AU')} characters.</p>`.s;
  openModal({
    title: 'Transfer link', body,
    actions: [{ label: 'Close' }, {
      label: 'Copy link', kind: 'primary', onClick: async () => {
        try { await navigator.clipboard.writeText(link); toast('Link copied', 'good'); } catch (e) { body.querySelector('#xfer-link').select(); toast('Press Ctrl/⌘ C to copy the selected link'); return true; }
        return false;
      },
    }],
  });
}
async function receiveTransfer() {
  const payload = location.hash.slice('#sync='.length);
  window.history.replaceState(null, '', `${location.pathname}#/dashboard`); // keep the record out of the address bar and history (`history` here is the History view)
  onRoute();
  try {
    const incoming = await exporter.readTransferLink(payload);
    const msg = `It holds ${incoming.subjects.length} subject(s) and ${(incoming.assessments || []).length} assessment item(s).${state.subjects.length ? ` Everything currently saved in this browser (${state.subjects.length} subject(s)) will be replaced.` : ''}`;
    if (!(await confirmDialog('Load data from this link?', msg, state.subjects.length ? 'Replace my data' : 'Load it', state.subjects.length > 0))) return;
    replaceState(incoming);
    toast('Data loaded from the transfer link.', 'good');
  } catch (err) {
    toast(err.message || 'That transfer link could not be read.', 'error');
  }
}

let importer = null;
export async function openImport() {
  try {
    importer = importer || await import('./import-pdf.js');
    importer.openImportDialog({ getState: () => state, getE: () => E, update, lookupName, go });
  } catch (err) {
    console.error(err);
    toast('The PDF importer could not load: ' + err.message, 'error');
  }
}

// Reset helper used by Settings.
export async function resetAll() {
  if (!(await confirmDialog('Erase all data?', 'This permanently deletes every subject, assessment, plan and setting saved in this browser. Export a backup first if you might need it.', 'Erase everything', true))) return false;
  clearStored();
  replaceState(defaultState());
  toast('All data erased. You are starting fresh.');
  return true;
}

// ---------- boot ----------
applyTheme();
recompute();
if (!storageAvailable()) setTimeout(() => toast('This browser is blocking local storage, so changes will not be kept after you close the tab. Use Export → Back up.', 'error', 7000), 600);
if (location.hash.startsWith('#sync=')) receiveTransfer(); else onRoute();

// Subject-code autocomplete, built once in idle time.
(window.requestIdleCallback || (f => setTimeout(f, 800)))(() => {
  const dl = document.createElement('datalist');
  dl.id = 'subj-codes';
  const frag = document.createDocumentFragment();
  for (const [code, name] of Object.entries(SUBJECTS)) { const o = document.createElement('option'); o.value = code; o.label = name; frag.appendChild(o); }
  dl.appendChild(frag);
  document.body.appendChild(dl);
});
