import { html, raw, icon, fmt, fmtPct, fmtSigned, fmtDate, meter, gradePillFor, chip, series, isNum, cssVar } from '../ui.js';
import { lineChart, columnChart, legend } from '../charts.js';
import { awaitingMarks } from '../study.js';

function welcome(ctx) {
  return html`
  <section class="card welcome">
    <div>
      <div class="eyebrow">WAM · GPA · degree planning</div>
      <h2>Every mark, every <em>average</em>, every goal, in one place.</h2>
      <p class="lede">Track your weighted average mark and grade point average, see exactly what you need on the assessments left, and forecast where your degree will land. Built for Western Sydney University's 7-point scale, and adjustable for any grading scheme.</p>
      <div class="row">
        <button class="btn primary" data-action="import">${icon('upload')}Import my MySR results PDF</button>
        <button class="btn" data-action="add-first-subject">${icon('plus')}Add subjects by hand</button>
        <button class="btn ghost" data-action="sample">${icon('sparkle')}Explore with sample data</button>
      </div>
      <p class="note mt">${icon('shield', 14)} Your marks never leave this device. They are saved in this browser's local storage, and the PDF is read on your computer, not uploaded.</p>
    </div>
    <div class="steps">
      <button class="step" data-action="import"><span class="n">${icon('upload')}</span><span><b>1 · Import your results</b><span>MySR → My results → print the page to PDF, then drop it here. Codes, marks and credit points come straight in.</span></span></button>
      <button class="step" data-action="go" data-to="assessments"><span class="n">${icon('list')}</span><span><b>2 · Log assessments as you go</b><span>Quizzes, assignments and exams build your live mark, and show what you need for an HD.</span></span></button>
      <button class="step" data-action="go" data-to="planner"><span class="n">${icon('dice')}</span><span><b>3 · Plan and forecast</b><span>Reverse goal solver, what-if scenarios and a 2,003-scenario Monte Carlo of your final WAM.</span></span></button>
    </div>
  </section>`;
}

export default {
  title: 'Dashboard',
  render(ctx) {
    const { E, state } = ctx;
    if (!state.subjects.length) return welcome(ctx);
    const { m, text, S } = E;
    const hasMarks = m.MARK_N > 0;
    const mc = E.mc, sc = E.scanner, plan = E.plan;
    const deadlines = E.dueList.slice(0, 8);
    const kindOf = d => (d < 0 ? 'critical' : d <= 7 ? 'warning' : 'neutral');
    const back = awaitingMarks(E);
    return html`
    ${back.length ? html`<section class="callout warn nudge">${icon('check')}<span><b>Got ${back.length === 1 ? 'this mark' : 'these marks'} back?</b> ${back.slice(0, 4).map(a => `${a.code} ${a.name}`).join(', ')}${back.length > 4 ? ` and ${back.length - 4} more` : ''} ${back.length === 1 ? 'was' : 'were'} due over a week ago with no mark yet. <a href="#/assessments">Enter ${back.length === 1 ? 'it' : 'them'}</a> to keep your WAM current.</span></section>` : ''}
    <section class="kpis">
      <div class="card kpi hero">
        <div class="label">Overall WAM</div>
        <div class="value">${hasMarks ? fmt(m.WAM, 2) : '—'} ${hasMarks ? gradePillFor(E, m.WAM) : ''}</div>
        <div class="sub">${hasMarks ? html`Target ${fmt(S.targetWAM, 1)} · ${fmtPct(m.WAM_PCT_TARGET)} of the way` : 'Add a mark to see your WAM'}</div>
        ${meter(m.WAM_PCT_TARGET, { label: 'WAM toward target' })}
      </div>
      <div class="card kpi">
        <div class="label">Overall GPA</div>
        <div class="value">${hasMarks ? fmt(m.GPA, 3) : '—'}<small>/ ${E.maxGPA}</small></div>
        <div class="sub">${fmtPct(m.GPA_PCT)} of max · target ${fmt(S.targetGPA, 2)}</div>
        ${meter(m.GPA_PCT_TARGET, { label: 'GPA toward target' })}
      </div>
      <div class="card kpi">
        <div class="label">Credit points</div>
        <div class="value">${fmt(m.CP_DONE, 0)}<small>/ ${fmt(S.totalCP, 0)}</small></div>
        <div class="sub">${fmtPct(m.CP_PCT, 1)} of degree complete</div>
        ${meter(m.CP_PCT, { label: 'Degree progress' })}
      </div>
      <div class="card kpi">
        <div class="label">Subjects done</div>
        <div class="value">${m.SUBJ_DONE}</div>
        <div class="sub">${m.SUBJ_IP} in progress · ${m.SUBJ_PLAN} planned</div>
      </div>
      <div class="card kpi">
        <div class="label">Classification</div>
        <div class="value" style="font-size:20px;line-height:1.3">${hasMarks ? `${m.CLASS.badge} ${m.CLASS.name}` : '—'}</div>
        <div class="sub">${hasMarks ? text.NEXT_TEXT.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '') : ''}</div>
      </div>
    </section>

    <section class="insight-strip">
      <div class="card insight"><span class="em">${text.TREND_TEXT.split(' ')[0]}</span><div><b>Trend</b><span>${text.TREND_TEXT.replace(/^\S+\s/, '')}</span></div></div>
      <div class="card insight"><span class="em">${text.GOAL_TEXT.split(' ')[0]}</span><div><b>Goal</b><span>${text.GOAL_TEXT.replace(/^\S+\s/, '')}</span></div></div>
      <div class="card insight"><span class="em">${text.RISK_TEXT.split(' ')[0]}</span><div><b>Risk</b><span>${text.RISK_TEXT.replace(/^\S+\s/, '')}</span></div></div>
    </section>
    <div class="card ticker">
      <span>${icon('insights', 15)}<b>${text.FORECAST_TEXT}</b></span>
      <span>Momentum <b>${text.MOMENTUM_TEXT}</b></span>
      <span>Consistency <b>${text.CONSISTENCY_TEXT}</b></span>
      <span>Time to finish <b>${text.ETA_TEXT}</b></span>
    </div>

    <section class="grid g-2-1 mt">
      <div class="card">
        <div class="card-head"><h3>WAM trend</h3><span class="sub">Cumulative and term WAM by study period, with the fitted trend and your target</span>
          <div class="actions">${legendHTML()}</div></div>
        <div class="card-body"><div class="chart-box" id="ch-trend"></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Goal progress</h3></div>
        <div class="card-body">
          ${goal('WAM toward target', `${fmt(m.WAM, 1)} / ${fmt(S.targetWAM, 1)}`, m.WAM_PCT_TARGET)}
          ${goal('GPA toward target', `${fmt(m.GPA, 2)} / ${fmt(S.targetGPA, 2)}`, m.GPA_PCT_TARGET)}
          ${goal('Credit points completed', `${fmt(m.CP_DONE, 0)} / ${fmt(S.totalCP, 0)}`, m.CP_PCT)}
          ${goal('Pass rate', `${fmtPct(m.PASS_RATE, 1)} of ${m.MARK_N} graded`, m.PASS_RATE, 'good')}
          ${goal('High Distinction rate', `${m.N_HD} HD · ${fmtPct(m.HD_RATE, 1)}`, m.HD_RATE)}
        </div>
      </div>
    </section>

    <section class="grid g-2-1 mt">
      <div class="card fill">
        <div class="card-head"><h3>Credit load by term</h3><span class="sub">CP enrolled in each study period, completed and planned</span>
          <div class="actions">${raw(legend([{ label: 'Completed', color: series(0) }, { label: 'Current', color: series(1) }, { label: 'Planned', color: cssVar('--axis') }], 'box'))}</div></div>
        <div class="card-body"><div class="chart-box fill" id="ch-term"></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Key statistics</h3></div>
        <div class="card-body stat-list">
          ${stat('Highest mark', m.BEST ? html`${fmt(m.MARK_MAX, 0)} <small>· ${m.BEST.code}</small>` : '—')}
          ${stat('Lowest mark', m.WORST ? html`${fmt(m.MARK_MIN, 0)} <small>· ${m.WORST.code}</small>` : '—')}
          ${stat('Average / median', `${fmt(m.MARK_AVG, 1)} / ${fmt(m.MARK_MED, 1)}`)}
          ${stat('Std deviation (σ)', `${fmt(m.MARK_SD, 2)}`)}
          ${stat('Best term', m.BEST_TERM ? html`${fmt(m.BEST_TERM.wam, 1)} <small>· ${m.BEST_TERM.label}</small>` : '—')}
          ${stat('Latest term', m.LAST_TERM ? html`${fmt(m.LAST_TERM.wam, 1)} <small>· ${m.LAST_TERM.label}</small>` : '—')}
          ${stat('Best-case final WAM', html`${fmt(m.MAX_POSSIBLE, 1)} <small>· all 100s</small>`)}
          ${stat('Worst-case final WAM', html`${fmt(m.MIN_POSSIBLE, 1)} <small>· all zeros</small>`)}
          ${stat('Best-case final GPA', html`${fmt(m.MAX_POSSIBLE_GPA, 3)} <small>· ${m.TOP_GRADE ? `all ${m.TOP_GRADE}s` : 'top grade everywhere'}${m.MAX_POSSIBLE_GPA + 1e-9 < S.targetGPA ? ' · below your target' : ''}</small>`)}
          ${stat('Needed for target', m.NEED_AVG_WAM === '' ? 'Degree complete'
            : html`${fmt(m.NEED_AVG_WAM, 1)} WAM · ${fmt(m.NEED_AVG_GPA, 2)} GPA <small>on ${fmt(m.CP_TO_WAM, 0)} CP${m.NEED_AVG_WAM > 100 || m.NEED_AVG_GPA > E.maxGPA ? ' · not reachable' : ''}</small>`)}
        </div>
      </div>
    </section>

    <section class="grid g2 mt top">
      <div class="card">
        <div class="card-head"><h3>Projection odds</h3><span class="sub">Monte Carlo across ${mc.hasRemaining ? '2,003 seeded scenarios of your remaining subjects' : 'your record (nothing left to simulate)'}</span>
          <div class="actions"><button class="btn sm ghost" data-action="go" data-to="planner">Open planner ${icon('chevron', 14)}</button></div></div>
        <div class="card-body stat-list">
          ${odds(`Chance of ${E.classes[0] ? E.classes.find(c => /^first/i.test(c.name))?.name || E.classes[0].name : 'top class'}`, `WAM ≥ ${fmt(mc.FC_MIN, 1)}`, mc.pFC)}
          ${odds('Chance of University Medal GPA', `GPA ≥ ${fmt(S.uniMedalGPA, 2)}`, mc.pMedal)}
          ${odds('Chance of target WAM', `WAM ≥ ${fmt(S.targetWAM, 1)}`, mc.pTarget)}
          ${odds('Chance of target GPA', `GPA ≥ ${fmt(S.targetGPA, 2)}`, mc.pTargetGPA)}
          ${stat('Median final WAM · 80% range', html`${fmt(mc.p50, 1)} <small>· ${fmt(mc.p10, 1)} to ${fmt(mc.p90, 1)}</small>`)}
          ${stat('Median final GPA · 80% range', html`${fmt(mc.gp50, 2)} <small>· ${fmt(mc.gp10, 2)} to ${fmt(mc.gp90, 2)}</small>`)}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Risk &amp; opportunity</h3><span class="sub">From open assessments and your degree plan</span>
          <div class="actions"><button class="btn sm ghost" data-action="go" data-to="scanner">Open scanner ${icon('chevron', 14)}</button></div></div>
        <div class="card-body stat-list">
          ${stat('Best single lever', html`<span class="ink2" style="font-weight:550">${sc.bestLever}</span>`)}
          ${stat('Most fragile grade', html`<span class="ink2" style="font-weight:550">${sc.mostFragile}</span>`)}
          ${stat('Top slip risk', html`<span class="ink2" style="font-weight:550">${sc.topRisk}</span>`)}
          ${stat('Plan warnings', html`<span class="ink2" style="font-weight:550">Load ${plan.LOAD_ISSUES} · prereqs ${plan.PREREQ_ISSUES} · offerings ${plan.OFFER_ISSUES} · gap terms ${plan.GAP_SEMS}</span>`)}
        </div>
      </div>
    </section>

    <section class="grid g-3-2 mt">
      <div class="card">
        <div class="card-head"><h3>Next deadlines</h3><span class="sub">The nearest ungraded items across every subject; overdue items rise to the top</span>
          <div class="actions"><button class="btn sm ghost" data-action="go" data-to="assessments">All assessments ${icon('chevron', 14)}</button></div></div>
        ${deadlines.length ? html`<div class="card-body flush tbl-wrap"><table class="tbl">
          <thead><tr><th>Code</th><th>Assessment</th><th>Type</th><th>Due</th><th class="n">Days</th><th>Status</th></tr></thead>
          <tbody>${deadlines.map(a => html`<tr><td class="code-cell">${a.code}</td><td>${a.name}<div class="subtle">${a.subject}</div></td><td>${a.type}</td><td class="nowrap">${fmtDate(a.due)}</td><td class="n">${a.days}</td>
            <td>${chip(a.days < 0 ? `❌ Overdue ${Math.abs(a.days)}d` : a.days === 0 ? '🔥 Due today' : a.days <= 7 ? `🔥 Due in ${a.days}d` : `🗓 ${a.days}d`, kindOf(a.days))}</td></tr>`)}</tbody></table></div>`
          : html`<div class="empty"><b>Nothing due</b>Add due dates to ungraded assessments and they'll appear here.</div>`}
      </div>
      <div class="card">
        <div class="card-head"><h3>HD tracker</h3><span class="sub">${m.SUBJ_IP ? `${m.IP_ON_TRACK_HD} of ${m.SUBJ_IP} in-progress subject(s) still on track for a High Distinction · ${m.IP_HD_BANKED} already banked ≥ ${fmt(S.hdThr, 0)}` : 'Populates once a term is under way'}</span></div>
        ${E.tracker.length ? html`<div class="card-body flush tbl-wrap"><table class="tbl">
          <thead><tr><th>Subject</th><th class="n">So far</th><th class="n">Left</th><th class="n">Need · HD</th><th>Status</th></tr></thead>
          <tbody>${E.tracker.map(t => html`<tr><td class="code-cell">${t.code}</td><td class="n">${fmt(t.sofar, 1)}</td><td class="n">${fmt(t.remaining, 0)}%</td><td class="n">${t.remaining > 0 ? fmt(t.needHD, 1) + '%' : '—'}</td><td>${chip(t.statusText, t.kind)}</td></tr>`)}</tbody></table></div>`
          : html`<div class="empty"><b>No subjects in progress</b>Set a subject's status to In Progress to track it here.</div>`}
      </div>
    </section>

    <div class="card mt" style="padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="eyebrow">Data health</span>${chip(text.HEALTH_MSG, E.m.ISSUE_COUNT ? 'warning' : 'good')}
      <span class="muted" style="font-size:12.5px">${m.SUBJ_TOTAL} subjects recorded · edit Subjects, Assessments or Settings and every number updates instantly.</span>
    </div>`;
  },
  mount(root, ctx) {
    const { E } = ctx;
    if (!ctx.state.subjects.length) return;
    const t = E.activeTerms;
    const tr = root.querySelector('#ch-trend');
    if (tr) lineChart(tr, {
      title: 'WAM trend', labels: t.map(x => x.label), empty: 'Complete a subject to start your trend line',
      series: [
        { name: 'Cumulative WAM', values: t.map(x => x.cumWAM), color: series(0), area: true },
        { name: 'Term WAM', values: t.map(x => x.wam), color: series(1) },
        { name: 'Trend (fitted)', values: t.map(x => Math.min(100, Math.max(0, E.m.INTERCEPT + E.m.SLOPE * x.idx))), color: cssVar('--muted'), faint: true, markers: false, endLabel: false, width: 1.5 },
      ],
      refs: [{ y: E.S.targetWAM, label: `Target ${fmt(E.S.targetWAM, 0)}`, color: series(2) }],
      tipExtra: i => `<div class="tip-sub">${t[i].session} · ${t[i].cp} CP counted</div>`,
    });
    const tm = root.querySelector('#ch-term');
    const cols = E.plan.termCols;
    const termBy = new Map(E.terms.map(x => [x.key, x]));
    if (tm) columnChart(tm, {
      title: 'Credit load by term', name: 'CP enrolled', labels: cols.map(c => c.label), values: cols.map(c => c.loaded),
      colors: cols.map(c => (c.key < E.plan.CUR_KEY ? series(0) : c.current ? series(1) : cssVar('--axis'))),
      valueFmt: v => fmt(v, 0), yFmt: v => fmt(v, 0), yMin: 0, height: 250, empty: 'Add subjects with a year and semester',
      tipExtra: i => {
        const c = cols[i], tt = termBy.get(c.key);
        return `<div class="tip-sub">${c.session} · standard ${c.standard} CP${c.check !== 'past' ? ` · ${c.check}` : ''}</div>${tt && tt.wam !== '' ? `<div class="tip-sub">Term WAM ${fmt(tt.wam, 1)}${tt.dWAM === '' ? '' : ` (${fmtSigned(tt.dWAM)})`}</div>` : ''}`;
      },
    });
  },
};

function legendHTML() {
  return raw(legend([
    { label: 'Cumulative', color: series(0) },
    { label: 'Term', color: series(1) },
    { label: 'Trend', color: 'var(--muted)' },
    { label: 'Target', color: series(2) },
  ]));
}
function goal(label, val, p, kind = 'brand') {
  return html`<div class="goal"><div class="top"><span>${label}</span><b>${val}</b></div>${meter(p, { label, kind })}</div>`;
}
function stat(k, v) { return html`<div class="r"><span class="k">${k}</span><span class="v">${v}</span></div>`; }
function odds(k, sub, p) {
  return html`<div class="r"><span class="k">${k}<br><small class="muted">${sub}</small></span><span class="v" style="min-width:140px"><span style="font-size:18px">${fmtPct(p, 1)}</span>${meter(p, { label: k })}</span></div>`;
}
