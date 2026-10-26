import { html, icon, fmt, fmtPct, gradePill, confirmDialog, toast } from '../ui.js';
import { STATUSES, CATEGORIES, termLabel, sessionName } from '../engine.js';

let filter = 'all';
let query = '';

const opt = (v, cur, label = v) => html`<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${label}</option>`;

export default {
  title: 'Subjects',
  subtitle: ctx => `Your subject ledger · ${ctx.E.m.SUBJ_TOTAL} recorded · grades, GPA, quality points and running averages are automatic`,
  render(ctx) {
    const { E, state } = ctx;
    const { m, S } = E;
    const rows = E.ledger.filter(r => {
      if (filter === 'done' && !['Completed', 'Failed', 'Credit Transfer', 'Exempt'].includes(r.status)) return false;
      if (filter === 'ip' && r.status !== 'In Progress') return false;
      if (filter === 'plan' && r.status !== 'Planned') return false;
      if (query) { const q = query.toLowerCase(); if (!`${r.code} ${r.name} ${r.category} ${r.notes}`.toLowerCase().includes(q)) return false; }
      return true;
    });
    const termStats = new Map(E.terms.map(t => [t.key, t]));
    let lastTerm = null;
    const body = rows.map(r => {
      const src = state.subjects[r.i];
      const head = r.term !== lastTerm && r.term !== '' ? (() => {
        const t = termStats.get(r.term);
        lastTerm = r.term;
        return html`<tr class="group"><td colspan="19">${termLabel(r.term)} <span class="muted" style="font-weight:500">· ${sessionName(r.term, S.commenceYear)}${t && t.wam !== '' ? ` · term WAM ${fmt(t.wam, 1)} · GPA ${fmt(t.gpa, 2)}` : ''}${t ? ` · ${t.loaded} CP loaded` : ''}</span></td></tr>`;
      })() : '';
      const autoMark = r.fromAssess ? fmt(r.mark, 1) : '';
      return html`${head}<tr>
        <td><input class="cell n" style="width:44px" data-col="year" data-bind="sub:${r.id}:year" data-type="int" value="${src.year}" inputmode="numeric" aria-label="Study year"></td>
        <td><input class="cell n" style="width:40px" data-col="sem" data-bind="sub:${r.id}:sem" data-type="int" value="${src.sem}" inputmode="numeric" aria-label="Semester (1 Autumn, 2 Spring, 3 Summer, 4 Winter)" title="1 = Autumn · 2 = Spring · 3 = Summer · 4 = Winter"></td>
        <td><input class="cell code" style="width:108px" data-col="code" data-bind="sub:${r.id}:code" data-type="code" value="${src.code}" list="subj-codes" placeholder="ABCD1234" aria-label="Subject code"></td>
        <td class="name-cell"><input class="cell" data-col="name" data-bind="sub:${r.id}:name" value="${src.name || ctx.lookupName(r.code)}" placeholder="Subject name" aria-label="Subject name" title="${src.name ? 'Custom name' : 'Name from the WSU subject list'}"></td>
        <td><select class="cell" style="width:96px" data-bind="sub:${r.id}:category" aria-label="Category">${opt('', src.category, '—')}${CATEGORIES.map(c => opt(c, src.category))}</select></td>
        <td><input class="cell n ${r.code && r.cp === '' ? 'input-required' : ''}" style="width:46px" data-col="cp" data-bind="sub:${r.id}:cp" data-type="num" value="${src.cp}" inputmode="decimal" aria-label="Credit points"></td>
        <td><select class="cell ${r.code && !r.status ? 'input-required' : ''}" style="width:122px" data-bind="sub:${r.id}:status" aria-label="Status">${opt('', src.status, '—')}${STATUSES.map(st => opt(st, src.status))}</select></td>
        <td><input class="cell n" style="width:62px" data-col="mark" data-bind="sub:${r.id}:mark" data-type="num" value="${src.mark}" placeholder="${autoMark}" inputmode="decimal" aria-label="Mark"></td>
        <td class="ro n strong nowrap" title="${r.fromAssess ? 'Built from the graded items on the Assessments page' : ''}">${r.mark === '' ? html`<span class="muted">—</span>` : html`${r.fromAssess ? html`<i class="auto-dot" aria-label="from assessments"></i>` : ''}${fmt(r.mark, r.fromAssess ? 1 : 0)}`}</td>
        <td class="ro c">${gradePill(E, r.band)}</td>
        <td class="ro n">${r.gp === '' ? '—' : r.gp}</td>
        <td class="ro n computed">${r.cnt ? fmt(r.qp, 0) : ''}</td>
        <td class="ro n computed">${r.delta === '' ? '' : html`<span style="color:${r.delta >= 0 ? 'var(--good)' : 'var(--critical)'}">${r.delta >= 0 ? '+' : '−'}${fmt(Math.abs(r.delta), 1)}</span>`}</td>
        <td class="ro n computed">${r.cumWAM === '' ? '' : fmt(r.cumWAM, 2)}</td>
        <td class="ro n computed">${r.cumGPA === '' ? '' : fmt(r.cumGPA, 2)}</td>
        <td class="ro n computed">${r.rank}</td>
        <td class="ro c flag" title="${flagTitle(r.flag)}">${r.flag}</td>
        <td><input class="cell" style="min-width:140px" data-col="notes" data-bind="sub:${r.id}:notes" value="${src.notes}" placeholder="Notes" aria-label="Notes"></td>
        <td class="ro"><button class="icon-btn sm del" data-action="del" data-id="${r.id}" aria-label="Delete ${r.code || 'row'}">${icon('trash', 16)}</button></td>
      </tr>`;
    });
    return html`
    <section class="kpis" style="grid-template-columns:repeat(6,minmax(0,1fr))">
      ${kpi('Overall WAM', m.MARK_N ? fmt(m.WAM, 2) : '—')}
      ${kpi('Overall GPA', m.MARK_N ? fmt(m.GPA, 3) : '—')}
      ${kpi('Completed CP', fmt(m.CP_DONE, 0), `of ${fmt(S.totalCP, 0)}`)}
      ${kpi('Progress', fmtPct(m.CP_PCT, 1))}
      ${kpi('Classification', m.MARK_N ? `${m.CLASS.badge} ${m.CLASS.name}` : '—', '', true)}
      ${kpi('Data health', E.text.HEALTH_MSG, '', true)}
    </section>
    <section class="card mt">
      <div class="toolbar">
        <button class="btn primary sm" data-action="add">${icon('plus', 16)}Add subject</button>
        <button class="btn sm" data-action="sort" title="Order rows by year and semester">${icon('sort', 16)}Sort by term</button>
        <div class="seg" role="tablist" aria-label="Filter">
          ${[['all', 'All'], ['done', 'Done'], ['ip', 'In progress'], ['plan', 'Planned']].map(([k, l]) => html`<button class="${filter === k ? 'on' : ''}" data-action="filter" data-id="${k}">${l}</button>`)}
        </div>
        <span class="spacer"></span>
        <label class="search">${icon('search', 15)}<input class="input" data-action-input="search" type="search" placeholder="Search code, name, notes" value="${query}" aria-label="Search subjects"></label>
      </div>
      ${state.subjects.length ? html`<div class="tbl-wrap"><table class="tbl edit">
        <thead><tr><th>Yr</th><th>Sem</th><th>Code</th><th>Subject</th><th>Category</th><th class="n">CP</th><th>Status</th><th class="n">Mark ✎</th><th class="n">Mark</th><th class="c">Grade</th><th class="n">GPA</th><th class="n">Qual pts</th><th class="n">Δ WAM</th><th class="n">Cum WAM</th><th class="n">Cum GPA</th><th class="n">Rank</th><th class="c">Flag</th><th>Notes</th><th></th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="5">Totals · counted study only</td><td class="n">${fmt(m.CP_COUNTED, 0)}</td><td>${m.SUBJ_DONE} done</td><td></td><td class="n">${m.MARK_N ? fmt(m.WAM, 2) : '—'}</td><td class="c">${m.MARK_N ? gradePill(E, E.helpers.bandIdx(m.WAM)) : ''}</td><td class="n">${m.MARK_N ? fmt(m.GPA, 2) : '—'}</td><td class="n">${fmt(m.QP, 0)}</td><td colspan="7" class="muted" style="font-weight:500">Remaining ${fmt(m.CP_REMAIN, 0)} CP · ${m.SUBJ_PLAN} planned · ${E.text.ETA_TEXT}</td></tr></tfoot>
      </table></div>` : html`<div class="empty"><b>No subjects yet</b>Import your MySR results PDF or add your first subject.<br><button class="btn primary" data-action="import">${icon('upload')}Import MySR PDF</button> <button class="btn" data-action="add">${icon('plus')}Add subject</button></div>`}
    </section>
    <p class="note mt-s">Fill the code, CP, status and mark. Leave <b>Mark ✎</b> blank on an in-progress subject and the mark builds itself from the Assessments page (shown with a blue dot). Sem: 1 = Autumn, 2 = Spring, 3 = Summer, 4 = Winter. Flags: 🔥 HD · ▲ above your WAM · ▼ below · ❌ below pass · ⏳ in progress, no mark yet · 🗓 planned · 🔁 duplicate code.</p>`;
  },
  mount(root, ctx) {
    const s = root.querySelector('[data-action-input="search"]');
    if (s) {
      s.addEventListener('input', () => {
        query = s.value;
        clearTimeout(s._t);
        s._t = setTimeout(() => { ctx.render(); setTimeout(() => { const n = document.querySelector('[data-action-input="search"]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 5); }, 180);
      });
    }
  },
  actions: {
    add: (el, ctx) => {
      ctx.update(s => {
        const last = s.subjects[s.subjects.length - 1];
        s.subjects.push({ id: ctx.uid(), year: last ? last.year : (Number(s.settings.curYear) || 1), sem: last ? last.sem : (Number(s.settings.curSem) || 1), code: '', name: '', category: '', cp: 10, status: 'Planned', mark: '', notes: '' });
      });
      filter = 'all';
      setTimeout(() => { const codes = document.querySelectorAll('[data-col="code"]'); codes[codes.length - 1]?.focus(); }, 30);
    },
    del: async (el, ctx) => {
      const r = ctx.state.subjects.find(x => x.id === el.dataset.id);
      if (!r) return;
      const linked = ctx.state.assessments.filter(a => a.code && a.code === r.code).length;
      if ((r.code || r.mark !== '') && !(await confirmDialog('Delete subject?', `${r.code || 'This row'} will be removed${linked ? `. Its ${linked} assessment item(s) stay on the Assessments page` : ''}.`, 'Delete', true))) return;
      ctx.update(s => { s.subjects = s.subjects.filter(x => x.id !== r.id); });
      toast(`${r.code || 'Row'} deleted`);
    },
    sort: (el, ctx) => {
      ctx.update(s => {
        const key = x => (x.year === '' || x.sem === '' ? 999 : Number(x.year) * 10 + Number(x.sem));
        s.subjects = s.subjects.map((x, i) => [x, i]).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(p => p[0]);
      });
      toast('Sorted by year and semester');
    },
    filter: (el, ctx) => { filter = el.dataset.id; ctx.render(); },
  },
};

function kpi(label, value, sub = '', small = false) {
  return html`<div class="card kpi"><div class="label">${label}</div><div class="value" style="${small ? 'font-size:15px;line-height:1.35' : 'font-size:24px'}">${value}${sub ? html`<small>${sub}</small>` : ''}</div></div>`;
}
function flagTitle(f) {
  return { '🔥': 'High Distinction', '▲': 'Above your WAM', '▼': 'Below your WAM', '❌': 'Below the pass mark', '⏳': 'In progress, no mark yet', '🗓': 'Planned', '🔁': 'Duplicate code' }[f] || '';
}
