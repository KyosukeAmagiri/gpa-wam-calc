import { html, icon, fmt, chip, gradeStyle, confirmDialog, toast } from '../ui.js';
import { defaultOfferings, defaultPrereqs } from '../state.js';

let showOfferings = false;

export default {
  title: 'Degree map',
  subtitle: ctx => `Every subject against its term · standard load ${ctx.E.S.cpPerSem} CP per semester, ${ctx.E.S.summerCP} CP per summer term`,
  render(ctx) {
    const { E, state } = ctx;
    const P = E.plan;
    const cols = P.termCols;
    const barFor = x => {
      const r = x.row;
      if (r.status === 'Completed' || r.status === 'Failed') return html`<span class="bar" style="${gradeStyle(E.bands, r.band, E.S.passMark)}">${x.label}</span>`;
      if (r.status === 'In Progress') return html`<span class="bar ${x.warn ? 'warn' : 'ip'}">${x.label}</span>`;
      if (r.status === 'Planned') return html`<span class="bar ${x.warn ? 'warn' : 'plan'}">${x.label}</span>`;
      return html`<span class="bar muted">${x.label || '—'}</span>`;
    };
    const loadCls = c => (c === 'past' ? 'load-past' : c.startsWith('⬆') ? 'load-up' : c.startsWith('⬇') ? 'load-down' : 'load-ok');
    return html`
    <section class="kpis" style="grid-template-columns:repeat(6,minmax(0,1fr))">
      ${k('Expected completion', P.COMPLETION_LBL, true)}
      ${k('CP planned vs needed', `${fmt(E.m.CP_PLANNED, 0)} / ${fmt(E.m.CP_REMAIN, 0)} CP`, true)}
      ${k('Load warnings', P.LOAD_ISSUES)}${k('Prereq issues', P.PREREQ_ISSUES)}${k('Offering warnings', P.OFFER_ISSUES)}${k('Gap terms', P.GAP_SEMS)}
    </section>

    <section class="card mt">
      <div class="card-head"><h3>Timeline</h3><span class="sub">Terms you use, left to right · current term (Y${E.S.curYear} S${E.S.curSem}) highlighted · set it in Settings</span></div>
      ${P.rows.length ? html`<div class="card-body flush tbl-wrap"><table class="gantt">
        <thead><tr><th class="sticky-l">#</th><th class="sticky-l" style="left:34px">Code</th><th>Subject</th><th class="right">CP</th><th>Checks</th>
          ${cols.map(c => html`<th class="tcol ${c.current ? 'cur' : ''}">${c.label}<span class="th-sub">${c.session}</span></th>`)}</tr></thead>
        <tbody>
          ${P.rows.map(x => html`<tr>
            <td class="sticky-l muted">${x.n}</td><td class="sticky-l code-cell" style="left:34px">${x.row.code}</td>
            <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${x.row.name} · ${x.row.status || 'no status'}">${x.row.name}</td>
            <td class="right tnum">${x.row.cp === '' ? '—' : x.row.cp}</td>
            <td title="Prerequisites: ${x.prereq} · Offered: ${x.offered || 'n/a'}">${checks(x)}</td>
            ${cols.map(c => html`<td class="tcol ${c.current ? 'cur' : ''}">${x.row.tkey === c.key ? barFor(x) : ''}</td>`)}
          </tr>`)}
          <tr class="sum"><td class="sticky-l"></td><td class="sticky-l" style="left:34px">CP loaded</td><td colspan="3"></td>${cols.map(c => html`<td class="tcol tnum ${c.current ? 'cur' : ''}">${c.loaded}</td>`)}</tr>
          <tr class="sum"><td class="sticky-l"></td><td class="sticky-l" style="left:34px">Standard</td><td colspan="3"></td>${cols.map(c => html`<td class="tcol tnum ${c.current ? 'cur' : ''}">${c.standard}</td>`)}</tr>
          <tr class="sum"><td class="sticky-l"></td><td class="sticky-l" style="left:34px">Load check</td><td colspan="3"></td>${cols.map(c => html`<td class="tcol ${loadCls(c.check)} ${c.current ? 'cur' : ''}">${c.check}</td>`)}</tr>
        </tbody></table></div>
        <div class="card-body"><div class="legend">
          ${E.bands.filter(b => b.max >= E.S.passMark).slice().reverse().map(b => html`<span><i class="key-box" style="background:${(/--g:([^;]+)/.exec(gradeStyle(E.bands, E.bands.indexOf(b), E.S.passMark)) || [])[1]}"></i>${b.grade} result</span>`)}
          <span><i class="key-box" style="background:var(--info-bg);box-shadow:inset 0 0 0 1.5px var(--dot-info)"></i>In progress (live mark)</span>
          <span><i class="key-box" style="background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-strong)"></i>Planned</span>
          <span><i class="key-box" style="background:var(--critical-bg);box-shadow:inset 0 0 0 1.5px var(--dot-critical)"></i>Prerequisite or offering warning</span>
        </div></div>`
        : html`<div class="empty"><b>No subjects yet</b>Add subjects with a year and semester to see your degree laid out term by term.</div>`}
    </section>

    <div class="section-title"><h2>Prerequisite &amp; co-requisite map</h2><p>One row per requirement · options on a row are alternatives (OR) · every row for a subject must be met (AND)</p></div>
    <section class="card">
      <div class="toolbar">
        <button class="btn sm primary" data-action="pre-add">${icon('plus', 15)}Add requirement</button>
        <button class="btn sm ghost" data-action="pre-reset">Restore handbook defaults</button>
        <span class="note">'Pre' must finish in an earlier term; 'Co' may sit in the same term. Credit Transfer or Exempt rows satisfy a requirement.</span>
      </div>
      <div class="tbl-wrap"><table class="tbl edit">
        <thead><tr><th class="n">#</th><th>Subject ✎</th><th>Name</th><th>Rule ✎</th><th>Option 1 ✎</th><th>Option 2 ✎</th><th>Option 3 ✎</th><th>Status</th><th></th></tr></thead>
        <tbody>${P.reqs.length ? P.reqs.map((q, i) => {
          const src = state.prereqs[i];
          return html`<tr><td class="ro n muted">${i + 1}</td>
            <td><input class="cell code" style="width:108px" data-col="pre-s" data-bind="pre:${src.id}:subject" data-type="code" value="${src.subject}" list="subj-codes"></td>
            <td class="ro">${q.name || html`<span class="muted">${q.subject ? '(not in Subjects)' : ''}</span>`}</td>
            <td><select class="cell" style="width:70px" data-bind="pre:${src.id}:rule"><option ${src.rule === 'Pre' ? 'selected' : ''}>Pre</option><option ${src.rule === 'Co' ? 'selected' : ''}>Co</option></select></td>
            ${[0, 1, 2].map(j => html`<td><input class="cell code" style="width:108px" data-col="pre-o${j}" data-bind="pre:${src.id}:opt${j}" data-type="code" value="${src.opts[j]}" list="subj-codes"></td>`)}
            <td class="ro">${q.status ? chip(q.status, /^✅|✓/.test(q.status) ? 'good' : /^⚠/.test(q.status) ? 'warning' : /^❌/.test(q.status) ? 'critical' : 'muted') : ''}</td>
            <td class="ro"><button class="icon-btn sm del" data-action="pre-del" data-id="${src.id}" aria-label="Delete requirement">${icon('trash', 16)}</button></td></tr>`;
        }) : html`<tr><td colspan="9"><div class="empty" style="padding:20px">No requirements mapped.</div></td></tr>`}</tbody></table></div>
      <p class="note" style="padding:0 18px 16px">Pre-filled for common WSU Law subjects from the WSU Handbook. WSU asks students to follow the handbook for their commencement year, so confirm before relying on it.</p>
    </section>

    <div class="section-title"><h2>Subject offerings</h2><p>Which sessions each subject runs in · used to flag planned subjects in a term they aren't offered</p></div>
    <section class="card">
      <div class="toolbar">
        <button class="btn sm" data-action="off-toggle">${showOfferings ? 'Hide' : 'Show'} ${state.offerings.length} offerings</button>
        <button class="btn sm" data-action="off-add">${icon('plus', 15)}Add subject</button>
        <button class="btn sm ghost" data-action="off-reset">Restore handbook defaults</button>
      </div>
      ${showOfferings ? html`<div class="tbl-wrap" style="max-height:560px;overflow:auto"><table class="tbl edit">
        <thead><tr><th>Code ✎</th><th>Name ✎</th><th class="c">Autumn</th><th class="c">Spring</th><th class="c">Summer</th><th></th></tr></thead>
        <tbody>${state.offerings.map(o => html`<tr>
          <td><input class="cell code" style="width:108px" data-bind="off:${o.id}:code" data-type="code" value="${o.code}"></td>
          <td><input class="cell" data-bind="off:${o.id}:name" value="${o.name}"></td>
          ${['aut', 'spr', 'sum'].map(k2 => html`<td class="c"><input type="checkbox" data-bind="off:${o.id}:${k2}" ${o[k2] ? 'checked' : ''} aria-label="${k2}"></td>`)}
          <td class="ro"><button class="icon-btn sm del" data-action="off-del" data-id="${o.id}" aria-label="Delete">${icon('trash', 16)}</button></td></tr>`)}</tbody></table></div>` : ''}
    </section>`;
  },
  actions: {
    'pre-add': (el, ctx) => { ctx.update(s => { s.prereqs.push({ id: ctx.uid(), subject: '', rule: 'Pre', opts: ['', '', ''] }); }); },
    'pre-del': (el, ctx) => { ctx.update(s => { s.prereqs = s.prereqs.filter(p => p.id !== el.dataset.id); }); },
    'pre-reset': async (el, ctx) => {
      if (!(await confirmDialog('Restore prerequisite defaults?', 'Your edits to the prerequisite map will be replaced with the handbook defaults.', 'Restore'))) return;
      ctx.update(s => { s.prereqs = defaultPrereqs(); });
      toast('Prerequisite map restored');
    },
    'off-toggle': (el, ctx) => { showOfferings = !showOfferings; ctx.render(); },
    'off-add': (el, ctx) => { showOfferings = true; ctx.update(s => { s.offerings.unshift({ id: ctx.uid(), code: '', name: '', aut: false, spr: false, sum: false }); }); },
    'off-del': (el, ctx) => { ctx.update(s => { s.offerings = s.offerings.filter(o => o.id !== el.dataset.id); }); },
    'off-reset': async (el, ctx) => {
      if (!(await confirmDialog('Restore offering defaults?', 'Your edits to the offerings list will be replaced with the handbook defaults.', 'Restore'))) return;
      ctx.update(s => { s.offerings = defaultOfferings(); });
      toast('Offerings restored');
    },
  },
};

function checks(x) {
  const bad = [];
  if (/^[⚠❌]/.test(x.prereq || '')) bad.push(chip(x.prereq, /^❌/.test(x.prereq) ? 'critical' : 'warning'));
  if (/^⚠/.test(x.offered)) bad.push(chip(x.offered, 'warning'));
  if (bad.length) return html`${bad}`;
  if (/^✅/.test(x.prereq || '') || /^✅/.test(x.offered)) return html`<span class="load-ok" style="font-size:12px">✓ ok</span>`;
  return html`<span class="muted">—</span>`;
}

function k(label, value, small = false) {
  return html`<div class="card kpi"><div class="label">${label}</div><div class="value" style="${small ? 'font-size:16px;line-height:1.35' : 'font-size:26px'}">${value}</div></div>`;
}
