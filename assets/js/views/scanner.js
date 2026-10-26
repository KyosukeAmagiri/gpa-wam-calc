import { html, fmt, fmtDate, chip, gradePill } from '../ui.js';

export default {
  title: 'Risk & opportunity',
  subtitle: () => 'The marginal impact of every open assessment on your in-progress grades',
  render(ctx) {
    const { E } = ctx;
    const sc = E.scanner;
    const bandIdx = E.helpers.bandIdx;
    const gpaD = v => (v === '' ? '—' : `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), 3)}`);
    return html`
    <section class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="card kpi"><div class="label">Open items</div><div class="value">${sc.openCount}</div><div class="sub">${fmt(sc.openWeight, 0)}% of item weight across ${sc.openSubjects} subject(s)</div></div>
      <div class="card kpi"><div class="label">Best single lever</div><div class="value" style="font-size:15px;line-height:1.4">${sc.bestLever}</div></div>
      <div class="card kpi"><div class="label">Most fragile grade</div><div class="value" style="font-size:15px;line-height:1.4">${sc.mostFragile}</div></div>
      <div class="card kpi"><div class="label">Top slip risk</div><div class="value" style="font-size:15px;line-height:1.4">${sc.topRisk}</div></div>
    </section>
    <div class="callout info mt"><span>An item is <b>open</b> if it's ungraded, or its score is an estimate (Est? = Yes; Auto treats a scored item dated in the future as an estimate). Points are percentage points on the item itself.</span></div>

    <div class="section-title"><h2>Subject view</h2><p>Where each in-progress grade sits</p></div>
    <section class="card">
      ${sc.subjects.length ? html`<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Subject</th><th class="n">Projected</th><th class="c">Grade</th><th class="n">Open wt</th><th class="n">Possible range</th><th>Next band</th><th>Reachable?</th><th class="n">Uplift on every<span class="th-sub">open item</span></th><th class="n">Cushion</th><th>Best lever</th><th>Biggest risk</th></tr></thead>
        <tbody>${sc.subjects.map(s => html`<tr><td style="min-width:190px"><span class="code-cell">${s.code}</span><div class="subtle">${s.name}</div></td><td class="n strong">${fmt(s.proj, 2)}</td><td class="c">${gradePill(E, bandIdx(s.proj))}</td>
          <td class="n">${fmt(s.openW, 0)}%</td><td class="n nowrap">${fmt(s.minP, 1)} – ${fmt(s.maxP, 1)}</td><td class="nowrap">${s.next}${s.gap === '' ? '' : html` <span class="muted">(+${fmt(s.gap, 2)})</span>`}</td>
          <td>${chip(s.reach, /yes/.test(s.reach) ? 'good' : /no$/.test(s.reach) ? 'serious' : 'muted')}</td><td class="n nowrap">${s.uplift === '' ? '—' : `+${fmt(s.uplift, 1)} pts`}</td>
          <td class="n">${s.cushion === '' ? '—' : fmt(s.cushion, 2)}</td><td style="min-width:170px">${s.lever}</td><td style="min-width:170px">${s.risk}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty"><b>No subjects in progress</b>The scanner works on subjects marked In Progress that have assessments logged.</div>`}
    </section>

    <div class="section-title"><h2>Opportunities</h2><p>The cheapest single item that moves a grade up, achievable items first</p></div>
    <section class="card">
      ${sc.opps.length ? html`<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th class="n">#</th><th>Assessment</th><th>Code</th><th class="n">Weight</th><th>Basis</th><th class="n">Baseline</th><th class="n">Needs</th><th class="n">+ Points</th><th>Verdict</th><th>Grade move</th><th class="n">Final GPA</th><th class="n">Final WAM</th><th>Due</th></tr></thead>
        <tbody>${sc.opps.map((o, k) => html`<tr><td class="n muted">${k + 1}</td><td class="strong" style="min-width:160px">${o.name}</td><td class="code-cell">${o.code}</td><td class="n">${fmt(o.wgt, 1)}%</td><td>${chip(o.basis, o.basis === 'Estimate' ? 'info' : 'muted')}</td>
          <td class="n">${fmt(o.p0, 1)}%</td><td class="n strong">${fmt(o.targetPct, 1)}%</td><td class="n">+${fmt(o.dUp, 1)}</td>
          <td>${o.feasible ? chip('✅ achievable alone', 'good') : chip('✖ needs over 100%', 'serious')}</td><td class="nowrap">${o.gradeNow} → ${o.gradeUp}</td>
          <td class="n">${gpaD(o.gpaUp)}</td><td class="n">+${fmt(o.wamUp, 3)}</td><td class="nowrap">${fmtDate(o.due)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty"><b>No opportunities right now</b>Every open item already sits in the top band, or nothing is open.</div>`}
    </section>

    <div class="section-title"><h2>Risks</h2><p>The smallest slip that costs a grade</p></div>
    <section class="card">
      ${sc.risks.length ? html`<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th class="n">#</th><th>Assessment</th><th>Code</th><th class="n">Weight</th><th>Basis</th><th class="n">Baseline</th><th class="n">Floor</th><th class="n">Slip room</th><th>Grade at risk</th><th class="n">Final GPA</th><th>Due</th></tr></thead>
        <tbody>${sc.risks.map((o, k) => html`<tr><td class="n muted">${k + 1}</td><td class="strong">${o.name}</td><td class="code-cell">${o.code}</td><td class="n">${fmt(o.wgt, 1)}%</td><td>${chip(o.basis, o.basis === 'Estimate' ? 'info' : 'muted')}</td>
          <td class="n">${fmt(o.p0, 1)}%</td><td class="n strong">${fmt(o.floorPct, 1)}%</td><td class="n">${chip(`${fmt(o.dDn, 1)} pts`, o.dDn < 2 ? 'critical' : o.dDn < 8 ? 'warning' : 'muted')}</td>
          <td class="nowrap">${o.gradeNow} → ${o.gradeDn}</td><td class="n">${o.gpaLoss === '' ? '—' : `−${fmt(o.gpaLoss, 3)}`}</td><td class="nowrap">${fmtDate(o.due)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty"><b>✅ No open item can cost a grade</b></div>`}
    </section>
    <p class="note mt">Method: <b>Needs</b> is the score this one item would need for the subject to reach the next band, holding every other item at its baseline (estimates at face value, ungraded items at your running average, exactly as Subjects projects them). <b>Slip room</b> is how far the item can fall before the subject drops a band. Final GPA and WAM show the change to your graduating averages if that band move happens. Items marked ✖ can't move the grade alone; the subject view shows the uniform lift needed across all open items and whether the next band is reachable at all.</p>`;
  },
};
