import { html, icon, fmt, gradePillFor, chip, statusKind, toast, confirmDialog } from '../ui.js';
import { TYPES, cleanCode } from '../engine.js';

const opt = (v, cur, label = v) => html`<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${label}</option>`;
const STATUS_KIND = { graded: 'good', pending: 'neutral', overdue: 'critical', soon: 'warning', upcoming: 'info' };

export default {
  title: 'Assessments',
  subtitle: () => 'Build each mark piece by piece · in-progress marks flow straight into Subjects and the Dashboard',
  render(ctx) {
    const { E, state } = ctx;
    const { m, S } = E;
    const items = E.assessments;
    const groups = [];
    const seen = new Set();
    const push = (code, row) => { if (seen.has(code)) return; seen.add(code); groups.push({ code, row, items: items.filter(a => a.code === code) }); };
    E.ledger.filter(r => r.status === 'In Progress').forEach(r => push(r.code, r));
    E.ledger.filter(r => r.code && items.some(a => a.code === r.code)).forEach(r => push(r.code, r));
    items.filter(a => a.code && !seen.has(a.code)).forEach(a => push(a.code, null));
    if (items.some(a => !a.code)) groups.push({ code: '', row: null, items: items.filter(a => !a.code) });
    const trackerBy = new Map(E.tracker.map(t => [t.code, t]));
    const ipCodes = E.ledger.filter(r => r.code).map(r => r.code);
    const totalW = items.reduce((s, a) => s + a.wgt, 0), gradedW = items.reduce((s, a) => s + a.wdone, 0), bonus = items.reduce((s, a) => s + a.bonus, 0);

    const groupHTML = g => {
      const t = trackerBy.get(g.code);
      const plan = E.targetPlans.get(g.code);
      const logged = items.filter(a => a.code === g.code).reduce((s, a) => s + a.wgt, 0);
      return html`
      <section class="card mt">
        <div class="card-head">
          <h3>${g.code || 'Items without a subject code'}${g.row ? html` <span class="muted" style="font-weight:500">· ${g.row.name}</span>` : ''}</h3>
          ${g.row ? chip(g.row.status || 'No status', statusKind(g.row.status)) : g.code ? chip('⚠ Not in Subjects', 'warning') : ''}
          <div class="actions">
            ${g.row ? html`<label class="target-in" title="The final mark you want in this subject"><span>Target mark</span><input class="cell n" data-bind="sub:${g.row.id}:target" data-type="num" value="${state.subjects[g.row.i]?.target ?? ''}" placeholder="e.g. ${fmt(S.hdThr, 0)}" inputmode="decimal" aria-label="Target mark for ${g.code}"></label>` : ''}
            ${g.code && !g.row ? html`<button class="btn sm" data-action="link" data-id="${g.code}">${icon('plus', 15)}Add ${g.code} to Subjects</button>` : ''}
            <button class="btn sm" data-action="add" data-id="${g.code}">${icon('plus', 15)}Add item</button>
          </div>
          <span class="sub">${g.row ? html`Weight logged ${fmt(logged, 0)}%${logged > 100.01 ? ' ⚠ over 100%' : ''}${t ? html` · graded ${fmt(t.graded, 0)}% · mark so far <b class="ink2">${t.sofar === '' ? '—' : fmt(t.sofar, 1)}</b>${t.remaining > 0 ? html` · needs <b class="ink2">${fmt(t.needHD, 1)}%</b> on the remaining ${fmt(t.remaining, 0)}% for an HD` : ''}` : ''}` : ''}</span>
        </div>
        ${plan ? targetPanel(plan) : ''}
        <div class="card-body flush tbl-wrap"><table class="tbl edit as-tbl">
          <colgroup>${g.code ? '' : html`<col style="width:110px">`}<col style="width:24%"><col style="width:124px"><col style="width:76px"><col style="width:70px"><col style="width:70px"><col style="width:74px"><col style="width:76px"><col style="width:62px"><col style="width:148px"><col style="width:132px"><col style="width:80px"><col><col style="width:44px"></colgroup>
          <thead><tr>${g.code ? '' : html`<th>Code</th>`}<th>Assessment</th><th>Type</th><th class="n">Weight %</th><th class="n">Score</th><th class="n">Out of</th><th class="n">Percent</th><th class="n">Weighted</th><th class="c">Grade</th><th>Due</th><th>Status</th><th title="Estimate? Yes = score is a guess · No = final · Auto = treat a scored item dated in the future as an estimate">Est?</th><th>Comment</th><th></th></tr></thead>
          <tbody>${g.items.map(a => {
            const src = state.assessments[a.i];
            return html`<tr>
              ${g.code ? '' : html`<td><input class="cell code" data-bind="as:${a.id}:code" data-type="code" value="${src.code}" list="as-codes" placeholder="Code"></td>`}
              <td><input class="cell" data-col="name-${g.code}" data-bind="as:${a.id}:name" value="${src.name}" placeholder="e.g. Final exam" aria-label="Assessment name"></td>
              <td><select class="cell" data-bind="as:${a.id}:type" aria-label="Type">${opt('', src.type, '—')}${TYPES.map(t => opt(t, src.type))}</select></td>
              <td><input class="cell n" data-col="w-${g.code}" data-bind="as:${a.id}:weight" data-type="num" value="${src.weight}" inputmode="decimal" aria-label="Weight percent"></td>
              <td><input class="cell n" data-col="s-${g.code}" data-bind="as:${a.id}:score" data-type="num" value="${src.score}" inputmode="decimal" aria-label="Score"></td>
              <td><input class="cell n" data-col="o-${g.code}" data-bind="as:${a.id}:outOf" data-type="num" value="${src.outOf}" inputmode="decimal" aria-label="Out of"></td>
              <td class="ro n strong">${a.pct === '' ? html`<span class="muted">—</span>` : fmt(a.pct * 100, 1) + '%'}</td>
              <td class="ro n computed">${a.weighted === '' ? '' : fmt(a.weighted, 2)}</td>
              <td class="ro c">${a.grade ? gradePillFor(E, a.pct * 100) : a.type === 'Bonus' && a.graded ? chip(`+${fmt(a.bonus, 1)}`, 'brand') : ''}</td>
              <td><input class="cell" type="date" data-bind="as:${a.id}:due" value="${src.due}" aria-label="Due date"></td>
              <td class="ro">${a.statusText ? chip(a.statusText, STATUS_KIND[a.statusKind]) : ''}</td>
              <td><select class="cell" data-bind="as:${a.id}:est" aria-label="Estimate">${opt('', src.est, 'Auto')}${opt('Yes', src.est)}${opt('No', src.est)}</select></td>
              <td><input class="cell" data-bind="as:${a.id}:comment" value="${src.comment}" placeholder="Comment"></td>
              <td class="ro"><button class="icon-btn sm del" data-action="del" data-id="${a.id}" aria-label="Delete item">${icon('trash', 16)}</button></td>
            </tr>`;
          })}</tbody>
        </table></div>
      </section>`;
    };

    return html`
    <datalist id="as-codes">${ipCodes.map(c => html`<option value="${c}">`)}</datalist>
    <div class="card" style="padding:14px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      ${chip(`Weight logged ${fmt(totalW, 0)}%`, 'muted')}${chip(`Graded weight ${fmt(gradedW, 0)}%`, 'muted')}
      ${chip(`${items.filter(a => a.name).length} items`, 'muted')}${chip(`${m.UNGRADED_ASSESS} ungraded`, m.UNGRADED_ASSESS ? 'info' : 'muted')}
      ${chip(`${m.OVERDUE_N} overdue`, m.OVERDUE_N ? 'critical' : 'muted')}
      ${E.unlinked.length ? chip(`🆕 ${E.unlinked.length} code(s) not in Subjects`, 'warning') : ''}
      ${chip(`Bonus banked +${fmt(bonus, 1)}`, 'muted')}${chip(`${E.scanner.openCount} open for the scanner`, 'muted')}
      <span class="spacer"></span>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>New item for</span>
        <select class="select" id="new-for" style="width:150px">${E.ledger.filter(r => r.code).sort((a, b) => (a.status === 'In Progress' ? 0 : 1) - (b.status === 'In Progress' ? 0 : 1)).map(r => html`<option value="${r.code}">${r.code}${r.status === 'In Progress' ? ' · in progress' : ''}</option>`)}<option value="">No code yet</option></select></label>
      <button class="btn primary sm" data-action="add-picked">${icon('plus', 15)}Add item</button>
    </div>
    <p class="note mt-s">Enter a score and what it's out of, and it counts as graded. Use the <b>Bonus</b> type for flat marks (like an attendance bonus): they add on top of the weighted mark, capped at 100, and don't count toward the 100% weight total. Set <b>Est?</b> to Yes for any score you've estimated rather than received, so the Scanner and Monte Carlo treat it as still open.</p>
    ${groups.length ? groups.map(groupHTML) : html`<section class="card mt"><div class="empty"><b>No assessments yet</b>Pick a subject above and add its assessment items, starting with the weightings from the learning guide.</div></section>`}

    <div class="section-title"><h2>Subject progress &amp; HD tracker</h2><p>What you need on what's left · targets come from your grade bands in Settings</p></div>
    <section class="card">
      ${E.tracker.length ? html`<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Code</th><th>Subject</th><th class="n">Wgt logged</th><th class="n">Wgt graded</th><th class="n">Mark so far</th><th class="n">Wgt remaining</th><th class="n">Needed · HD ${fmt(S.hdThr, 0)}</th><th class="n">Needed · D ${fmt(S.distThr, 0)}</th><th class="n">Needed · C ${fmt(S.creditThr, 0)}</th><th class="n">Needed · your target</th><th>Status</th></tr></thead>
        <tbody>${E.tracker.map(t => html`<tr><td class="code-cell">${t.code}</td><td>${t.name}</td><td class="n">${fmt(t.logged, 0)}%</td><td class="n">${fmt(t.graded, 0)}%</td>
          <td class="n strong">${t.sofar === '' ? '—' : fmt(t.sofar, 2)}</td><td class="n">${fmt(t.remaining, 0)}%</td>
          ${[t.needHD, t.needD, t.needC].map(v => html`<td class="n">${v === '' ? '—' : html`<span style="color:${v > 100 ? 'var(--critical)' : v <= S.passMark ? 'var(--good)' : 'inherit'}">${fmt(v, 1)}%</span>`}</td>`)}
          <td class="n">${t.target === '' ? html`<span class="muted">set on the card</span>` : t.needT === '' || t.needT <= 0 ? html`<span style="color:var(--good)">✅ ${fmt(t.target, 0)} secured</span>` : html`<span style="color:${t.needT > 100 ? 'var(--critical)' : 'inherit'}">${fmt(t.needT, 1)}% <small class="muted">for ${fmt(t.target, 0)}</small></span>`}</td>
          <td>${chip(t.statusText, t.kind)}</td></tr>`)}</tbody></table></div>
        <p class="note" style="padding:0 18px 16px">'Needed' assumes the ungraded weight is whatever's left to reach 100%.</p>`
        : html`<div class="empty"><b>No subjects in progress</b>Mark a subject In Progress on the Subjects page and it appears here.</div>`}
    </section>
    <div class="card mt" style="padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="eyebrow">Weight audit</span>
      ${m.WEIGHT_ERRORS === 0 ? chip('✅ All logged subjects total 100%', 'good') : chip(`⚖️ ${m.WEIGHT_ERRORS} subject(s) don't total 100%: ${E.weightIssues.map(r => `${r.code} ${fmt(r.wgt, 0)}%`).join(', ')}`, 'warning')}
    </div>`;
  },
  actions: {
    add: (el, ctx) => addItem(ctx, el.dataset.id),
    'add-picked': (el, ctx) => addItem(ctx, document.getElementById('new-for')?.value || ''),
    del: async (el, ctx) => {
      const a = ctx.state.assessments.find(x => x.id === el.dataset.id);
      if (!a) return;
      if ((a.name || a.score !== '') && !(await confirmDialog('Delete item?', `“${a.name || 'Untitled'}” will be removed from ${a.code || 'your assessments'}.`, 'Delete', true))) return;
      ctx.update(s => { s.assessments = s.assessments.filter(x => x.id !== a.id); });
    },
    link: (el, ctx) => {
      const code = cleanCode(el.dataset.id);
      ctx.update(s => { s.subjects.push({ id: ctx.uid(), year: Number(s.settings.curYear) || 1, sem: Number(s.settings.curSem) || 1, code, name: '', category: '', cp: 10, status: 'In Progress', mark: '', notes: '' }); });
      toast(`${code} added to Subjects as In Progress`);
    },
  },
};

// What the remaining assessments need to land the subject's target mark.
function targetPanel(p) {
  const showMath = !p.done && p.gap > 0 && p.remW > 0;
  return html`<div class="target-plan tp-${p.kind}" role="status" aria-live="polite">
    <div class="tp-head">
      <span class="tp-goal"><b>${fmt(p.target, 1)}</b>${p.grade ? html` <span class="muted">${p.grade}</span>` : ''}<small>target</small></span>
      <div class="tp-text"><b>${p.text}</b>
        ${showMath ? html`<span>Banked <b>${fmt(p.banked, 1)}</b> marks from ${fmt(p.gradedW, 0)}% graded · need <b>${fmt(p.gap, 1)}</b> more from the remaining ${fmt(p.remW, 0)}%</span>` : ''}</div>
    </div>
    ${showMath ? html`<div class="tp-bar" aria-hidden="true"><span class="tp-banked" style="width:${Math.min(100, p.banked)}%"></span><span class="tp-need" style="width:${Math.min(100 - Math.min(100, p.banked), p.gap)}%"></span><i style="left:${Math.min(100, p.target)}%"></i></div>` : ''}
    ${p.items.length ? html`<ul class="tp-items">${p.items.map(it => html`<li><span>${it.name} <span class="muted">(${fmt(it.weight, 0)}%)</span></span><b>${it.score !== '' ? `${fmt(it.score, 1)} / ${fmt(it.outOf, 0)}` : `${fmt(it.marks, 1)} of ${fmt(it.weight, 0)} marks`}</b></li>`)}
      ${p.unlogged > 0.01 ? html`<li class="muted"><span>Weight not logged yet (${fmt(p.unlogged, 0)}%)</span><b>${fmt(p.unlogged * p.need / 100, 1)} of ${fmt(p.unlogged, 0)} marks</b></li>` : ''}</ul>` : ''}
  </div>`;
}

function addItem(ctx, code) {
  ctx.update(s => { s.assessments.push({ id: ctx.uid(), code: cleanCode(code), name: '', type: 'Assignment', weight: '', score: '', outOf: '', due: '', comment: '', est: '' }); });
  setTimeout(() => {
    const inputs = document.querySelectorAll(`[data-col="name-${cleanCode(code)}"]`);
    inputs[inputs.length - 1]?.focus();
  }, 40);
}
