import { html, icon, fmt, fmtDate, series, todayISO, toast } from '../ui.js';
import { lineChart } from '../charts.js';

export default {
  title: 'History',
  subtitle: () => 'Frozen snapshots of your WAM and GPA so you can watch them move over time',
  render(ctx) {
    const { E, state } = ctx;
    const { m } = E;
    const rows = state.history.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return html`
    <section class="card">
      <div class="card-head"><h3>Right now</h3><span class="sub">Live figures. Log a snapshot to freeze them with today's date.</span>
        <div class="actions"><button class="btn primary sm" data-action="snap">${icon('camera', 15)}Log snapshot</button></div></div>
      <div class="card-body"><div class="grid g4">
        <div><div class="eyebrow">WAM</div><div style="font-size:26px;font-weight:650">${m.MARK_N ? fmt(m.WAM, 2) : '—'}</div></div>
        <div><div class="eyebrow">GPA</div><div style="font-size:26px;font-weight:650">${m.MARK_N ? fmt(m.GPA, 3) : '—'}</div></div>
        <div><div class="eyebrow">CP completed</div><div style="font-size:26px;font-weight:650">${fmt(m.CP_DONE, 0)}</div></div>
        <div><div class="eyebrow">Classification</div><div style="font-size:17px;font-weight:650;margin-top:6px">${m.MARK_N ? m.CLASS.name : '—'}</div></div>
      </div></div>
    </section>
    <section class="grid g2 mt">
      <div class="card"><div class="card-head"><h3>WAM over time</h3></div><div class="card-body"><div class="chart-box" id="ch-hw"></div></div></div>
      <div class="card"><div class="card-head"><h3>GPA over time</h3></div><div class="card-body"><div class="chart-box" id="ch-hg"></div></div></div>
    </section>
    <section class="card mt">
      <div class="card-head"><h3>Snapshots</h3><span class="sub">${rows.length} logged · edit the date or note any time</span></div>
      ${rows.length ? html`<div class="card-body flush tbl-wrap"><table class="tbl edit">
        <thead><tr><th>Date</th><th class="n">WAM</th><th class="n">GPA</th><th class="n">CP</th><th>Classification</th><th>Note</th><th></th></tr></thead>
        <tbody>${rows.map(h => html`<tr>
          <td><input class="cell" type="date" style="width:140px" data-bind="hist:${h.id}:date" value="${h.date}"></td>
          <td class="ro n strong">${fmt(h.wam, 2)}</td><td class="ro n">${fmt(h.gpa, 3)}</td><td class="ro n">${fmt(h.cp, 0)}</td><td class="ro">${h.cls}</td>
          <td><input class="cell" style="min-width:220px" data-bind="hist:${h.id}:note" value="${h.note || ''}" placeholder="What changed?"></td>
          <td class="ro"><button class="icon-btn sm del" data-action="del" data-id="${h.id}" aria-label="Delete snapshot">${icon('trash', 16)}</button></td></tr>`)}</tbody></table></div>`
        : html`<div class="empty"><b>No snapshots yet</b>Log one now, and again whenever results land. Daily in exam season works well.</div>`}
    </section>`;
  },
  mount(root, ctx) {
    const pts = ctx.state.history.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const labels = pts.map(p => fmtDate(p.date, { day: 'numeric', month: 'short', year: '2-digit' }));
    const w = root.querySelector('#ch-hw'), g = root.querySelector('#ch-hg');
    if (w) lineChart(w, { title: 'WAM over time', labels, series: [{ name: 'WAM', values: pts.map(p => p.wam), color: series(0), area: true }], valueFmt: v => fmt(v, 2), empty: 'Log two snapshots to draw a line', tipExtra: i => (pts[i].note ? `<div class="tip-sub">${pts[i].note.replace(/[<>&]/g, '')}</div>` : '') });
    if (g) lineChart(g, { title: 'GPA over time', labels, series: [{ name: 'GPA', values: pts.map(p => p.gpa), color: series(1), area: true }], yFmt: v => fmt(v, 1), valueFmt: v => fmt(v, 3), empty: 'Log two snapshots to draw a line' });
  },
  actions: {
    snap: (el, ctx) => {
      const { m } = ctx.E;
      if (!m.MARK_N) { toast('Add at least one counted mark first.'); return; }
      ctx.update(s => { s.history.push({ id: ctx.uid(), date: todayISO(), wam: +m.WAM.toFixed(4), gpa: +m.GPA.toFixed(4), cp: m.CP_DONE, cls: m.CLASS.name, note: '' }); });
      toast('Snapshot logged', 'good');
    },
    del: (el, ctx) => { ctx.update(s => { s.history = s.history.filter(h => h.id !== el.dataset.id); }); },
  },
};
