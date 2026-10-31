import { html, fmt, fmtPct, fmtSigned, gradePill, gradeStyle, series, oklch, isDark } from '../ui.js';
import { hbarChart, columnChart } from '../charts.js';
import { focusStats } from '../study.js';

// Sequential crimson ramp for the heatmap (light near low, dark near high).
function heatStyle(v, lo, hi) {
  if (v === '' || v === undefined) return '';
  const t = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 1;
  const L = isDark() ? 0.30 + 0.42 * t : 0.94 - 0.52 * t;
  const bg = oklch(L, 0.03 + 0.12 * t, 18);
  const ink = (isDark() ? L > 0.6 : L < 0.62) ? (isDark() ? '#1b1718' : '#ffffff') : (isDark() ? '#f3eeef' : '#1b1718');
  return `--hb:${bg};--hi:${ink}`;
}

export default {
  title: 'Insights',
  subtitle: () => 'Heatmap · leaderboard · term detail · where your marks come from',
  render(ctx) {
    const { E } = ctx;
    const { m } = E;
    if (!m.MARK_N) return html`<section class="card"><div class="empty"><b>Nothing to analyse yet</b>Insights appear once at least one subject has a counted mark.</div></section>`;
    const years = [...new Set(E.terms.map(t => Math.floor(t.key / 10)))].sort((a, b) => a - b);
    const termByKey = new Map(E.terms.map(t => [t.key, t]));
    const vals = E.terms.map(t => t.wam).filter(v => v !== '');
    const lo = Math.min(...vals, 100), hi = Math.max(...vals, 0);
    const yearRow = new Map(E.years.map(y => [y.year, y]));
    const counted = E.ledger.filter(r => r.cnt).sort((a, b) => a.rank - b.rank || a.i - b.i);
    const N = counted.length;
    return html`
    <section class="grid g2">
      <div class="card">
        <div class="card-head"><h3>Mark heatmap</h3><span class="sub">Term WAM by year and semester · darker is stronger</span></div>
        <div class="card-body tbl-wrap"><table class="tbl heat">
          <thead><tr><th>Year</th><th class="c">Sem 1 · Aut</th><th class="c">Sem 2 · Spr</th><th class="c">Sem 3 · Sum</th><th class="c">Sem 4 · Win</th><th class="n">Year WAM</th></tr></thead>
          <tbody>${years.map(y => html`<tr><td class="strong">Year ${y}</td>${[1, 2, 3, 4].map(s => {
            const t = termByKey.get(y * 10 + s);
            const v = t ? t.wam : '';
            return html`<td class="h" style="${heatStyle(v, lo, hi)}" title="${t ? `${t.label} · ${t.session}` : ''}">${v === '' ? '' : fmt(v, 1)}</td>`;
          })}<td class="n strong">${yearRow.get(y) && yearRow.get(y).wam !== '' ? fmt(yearRow.get(y).wam, 1) : '—'}</td></tr>`)}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Grade distribution</h3><span class="sub">${m.MARK_N} graded subjects</span></div>
        <div class="card-body"><div class="chart-box" id="ch-grades"></div>
          <table class="tbl mt-s"><thead><tr><th>Grade</th><th>Description</th><th class="n">Count</th><th class="n">CP</th><th class="n">Share</th></tr></thead>
          <tbody>${E.gradeDist.slice().reverse().map(g => html`<tr><td>${gradePill(E, E.bands.indexOf(E.bands.find(b => b.grade === g.grade)))}</td><td>${g.desc}</td><td class="n">${g.count}</td><td class="n">${fmt(g.cp, 0)}</td><td class="n">${fmtPct(g.share, 1)}</td></tr>`)}</tbody></table>
        </div>
      </div>
    </section>

    <section class="grid g-3-2 mt">
      <div class="card">
        <div class="card-head"><h3>Subject leaderboard</h3><span class="sub">Every counted subject ranked by mark</span></div>
        <div class="card-body flush tbl-wrap" style="max-height:520px;overflow:auto"><table class="tbl">
          <thead><tr><th class="n">#</th><th>Code</th><th>Subject</th><th class="n">Mark</th><th class="c">Grade</th><th class="n">CP</th><th class="n">Percentile</th></tr></thead>
          <tbody>${counted.map(r => html`<tr><td class="n muted">${r.rank}</td><td class="code-cell">${r.code}</td><td>${r.name}</td><td class="n strong">${fmt(r.mark, r.fromAssess ? 1 : 0)}</td><td class="c">${gradePill(E, r.band)}</td><td class="n">${fmt(r.cp, 0)}</td><td class="n">${fmtPct((N - r.rank + 0.5) / N, 0)}</td></tr>`)}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Term detail</h3></div>
        <div class="card-body flush tbl-wrap"><table class="tbl">
          <thead><tr><th>Term</th><th>Session</th><th class="n">N</th><th class="n">CP</th><th class="n">Term WAM</th><th class="n">Cum WAM</th><th class="n">Δ WAM</th></tr></thead>
          <tbody>${E.activeTerms.map(t => html`<tr><td class="strong nowrap">${t.label}</td><td class="muted nowrap">${t.sessionShort}</td><td class="n">${t.n}</td><td class="n">${fmt(t.cp, 0)}</td><td class="n strong">${fmt(t.wam, 1)}</td><td class="n">${fmt(t.cumWAM, 2)}</td>
            <td class="n">${t.dWAM === '' ? html`<span class="muted">—</span>` : html`<span style="color:${t.dWAM >= 0 ? 'var(--good)' : 'var(--critical)'}">${fmtSigned(t.dWAM)}</span>`}</td></tr>`)}</tbody></table></div>
      </div>
    </section>

    <section class="grid g3 mt">
      <div class="card"><div class="card-head"><h3>WAM by category</h3></div><div class="card-body"><div class="chart-box" id="ch-cat"></div>
        <table class="tbl mt-s"><thead><tr><th>Category</th><th class="n">N</th><th class="n">CP</th><th class="n">WAM</th><th class="n">GPA</th></tr></thead>
        <tbody>${E.categories.filter(c => c.cp > 0).map(c => html`<tr><td>${c.name}</td><td class="n">${c.n}</td><td class="n">${fmt(c.cp, 0)}</td><td class="n strong">${fmt(c.wam, 1)}</td><td class="n">${fmt(c.gpa, 2)}</td></tr>`)}</tbody></table>
        ${E.categories.some(c => c.cp > 0) ? '' : html`<p class="note">Give subjects a category (Core, Major, Elective…) to compare them.</p>`}</div></div>
      <div class="card"><div class="card-head"><h3>Strengths by discipline</h3><span class="sub">Grouped by the first four letters of the code</span></div><div class="card-body"><div class="chart-box" id="ch-disc"></div>
        <table class="tbl mt-s"><thead><tr><th>Discipline</th><th class="n">N</th><th class="n">WAM</th><th class="n">GPA</th><th class="n">HDs</th></tr></thead>
        <tbody>${E.disciplines.map(d => html`<tr><td>${d.label} <span class="muted">${d.prefix}</span></td><td class="n">${d.n}</td><td class="n strong">${fmt(d.wam, 1)}</td><td class="n">${fmt(d.gpa, 2)}</td><td class="n">${d.hd}</td></tr>`)}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>Average by assessment type</h3><span class="sub">Graded items only</span></div><div class="card-body"><div class="chart-box" id="ch-type"></div>
        <table class="tbl mt-s"><thead><tr><th>Type</th><th class="n">Items</th><th class="n">Avg</th><th class="n">Best</th><th class="n">Worst</th></tr></thead>
        <tbody>${E.types.filter(t => t.n).map(t => html`<tr><td>${t.type}</td><td class="n">${t.n}</td><td class="n strong">${fmt(t.avg, 1)}%</td><td class="n">${fmt(t.best, 0)}%</td><td class="n">${fmt(t.worst, 0)}%</td></tr>`)}</tbody></table>
        ${E.types.some(t => t.n) ? '' : html`<p class="note">Log graded items on the Assessments page to see which formats suit you.</p>`}</div></div>
    </section>

    <section class="card mt">
      <div class="card-head"><h3>Year by year</h3></div>
      <div class="card-body flush">
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Year</th><th class="n">N</th><th class="n">CP</th><th class="n">WAM</th><th class="n">GPA</th><th class="n">Best</th><th class="n">Worst</th></tr></thead>
        <tbody>${E.years.filter(y => y.cp > 0).map(y => html`<tr><td class="strong">${y.label}</td><td class="n">${y.n}</td><td class="n">${fmt(y.cp, 0)}</td><td class="n strong">${fmt(y.wam, 1)}</td><td class="n">${fmt(y.gpa, 2)}</td><td class="n">${fmt(y.best, 0)}</td><td class="n">${fmt(y.worst, 0)}</td></tr>`)}</tbody></table></div>
      </div>
    </section>
    ${studyVsMarks(E, ctx.state)}`;
  },
  mount(root, ctx) {
    const { E } = ctx;
    if (!E.m.MARK_N) return;
    const gradeColor = g => { const i = E.bands.findIndex(b => b.grade === g); const st = gradeStyle(E.bands, i, E.S.passMark); return (/--g:([^;]+)/.exec(st) || [])[1] || series(0); };
    const g = root.querySelector('#ch-grades');
    if (g) columnChart(g, { title: 'Grade distribution', name: 'Subjects', labels: E.gradeDist.map(x => x.grade), values: E.gradeDist.map(x => x.count), colors: E.gradeDist.map(x => gradeColor(x.grade)), valueFmt: v => fmt(v, 0), yFmt: v => fmt(v, 0), height: 200, tipExtra: i => `<div class="tip-sub">${E.gradeDist[i].desc} · ${fmt(E.gradeDist[i].share * 100, 1)}% of graded</div>` });
    const cats = E.categories.filter(c => c.cp > 0);
    const c = root.querySelector('#ch-cat');
    if (c) hbarChart(c, { title: 'WAM by category', name: 'WAM', items: cats.map(x => ({ label: x.name, value: x.wam, tip: `${x.n} subject(s) · GPA ${fmt(x.gpa, 2)}` })), color: series(0), min: 0, max: 100, empty: 'No categories assigned yet' });
    const d = root.querySelector('#ch-disc');
    if (d) hbarChart(d, { title: 'WAM by discipline', name: 'WAM', items: E.disciplines.map(x => ({ label: x.label, value: x.wam, tip: `${x.n} subject(s) · ${x.hd} HD` })), color: series(0), min: 0, max: 100 });
    const ty = E.types.filter(x => x.n);
    const t = root.querySelector('#ch-type');
    if (t) hbarChart(t, { title: 'Average by assessment type', name: 'Average', items: ty.map(x => ({ label: x.type, value: x.avg, tip: `${x.n} item(s) · best ${fmt(x.best, 0)}%` })), color: series(1), min: 0, max: 100, valueFmt: v => `${fmt(v, 1)}%`, empty: 'No graded items yet' });
  },
};

// Hours logged with the focus timer next to each subject's mark, so you can see where effort paid off.
function studyVsMarks(E, state) {
  const F = focusStats(E, state);
  const rows = F.subjects.filter(r => r.code);
  if (!rows.length) return '';
  const most = Math.max(...rows.map(r => r.minutes));
  return html`<section class="card mt">
    <div class="card-head"><h3>Study time vs marks</h3><span class="sub">From the focus timer on the Study planner · ${fmt(F.total / 60, 1)} hours logged</span></div>
    <div class="card-body flush tbl-wrap"><table class="tbl"><thead><tr><th>Subject</th><th>Hours</th><th class="n">Mark</th><th class="n">Marks per hour</th></tr></thead>
      <tbody>${rows.map(r => html`<tr><td><b>${r.code}</b> <span class="muted">${r.row ? r.row.name : ''}</span></td>
        <td><span class="sv-bar"><i style="width:${(r.minutes / most) * 100}%"></i></span> ${fmt(r.minutes / 60, 1)}</td>
        <td class="n strong">${r.mark === '' ? '—' : fmt(r.mark, 1)}</td>
        <td class="n">${r.mark === '' || r.minutes < 30 ? '—' : fmt(r.mark / (r.minutes / 60), 1)}</td></tr>`)}</tbody></table></div>
  </section>`;
}
