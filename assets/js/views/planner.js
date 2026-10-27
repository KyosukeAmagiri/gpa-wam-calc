import { html, raw, icon, fmt, fmtPct, fmtSigned, chip, oklch, isDark, meter } from '../ui.js';
import { whatIf, MC_N } from '../engine.js';
import { stackedColumns, legend } from '../charts.js';

const ramp3 = () => (isDark() ? [0.48, 0.64, 0.80] : [0.72, 0.55, 0.38]).map(L => oklch(L, isDark() ? 0.14 : 0.15, 18));
let dist = 'wam'; // which final result the outcome chart shows

export default {
  title: 'Planner & odds',
  subtitle: () => 'What-if sandbox · reverse goal solver · Monte Carlo projection of your final WAM and GPA',
  render(ctx) {
    const { E, state } = ctx;
    const { m, S } = E;
    const P = state.planner;
    const w = whatIf(E, P.scenario, P.desired, P.remainingCP, P.desiredGPA);
    const mc = E.mc;
    const fcName = mc.FC_NAME;
    const H = dist === 'gpa' ? mc.histG : mc.hist;
    const ramp = ramp3();
    const hasMC = mc.hasRemaining && m.CP_COUNTED > 0;
    return html`
    <section class="grid g-3-2 top">
      <div class="card">
        <div class="card-head"><h3>Scenario subjects</h3><span class="sub">Model the marks you expect on remaining study. Nothing here touches your real record.</span>
          <div class="actions"><button class="btn sm" data-action="scen-add">${icon('plus', 15)}Add row</button><button class="btn sm ghost" data-action="scen-fill" title="Add your planned and in-progress subjects at their expected marks">Fill from plan</button></div></div>
        <div class="card-body flush tbl-wrap"><table class="tbl edit">
          <thead><tr><th>Subject (optional)</th><th class="n">CP</th><th class="n">Target mark</th><th class="n">Qual pts</th><th></th></tr></thead>
          <tbody>${P.scenario.length ? P.scenario.map(r => html`<tr>
            <td><input class="cell" data-col="sl" data-bind="scen:${r.id}:label" value="${r.label}" placeholder="e.g. Corporate Law"></td>
            <td><input class="cell n" style="width:70px" data-col="scp" data-bind="scen:${r.id}:cp" data-type="num" value="${r.cp}" inputmode="decimal"></td>
            <td><input class="cell n" style="width:90px" data-col="st" data-bind="scen:${r.id}:target" data-type="num" value="${r.target}" inputmode="decimal"></td>
            <td class="ro n computed">${r.cp !== '' && r.target !== '' ? fmt(r.cp * r.target, 0) : ''}</td>
            <td class="ro"><button class="icon-btn sm del" data-action="scen-del" data-id="${r.id}" aria-label="Remove row">${icon('trash', 16)}</button></td></tr>`)
            : html`<tr><td colspan="5"><div class="empty" style="padding:22px"><b>No scenario yet</b>Add rows for the subjects you want to test, or fill from your planned subjects.</div></td></tr>`}</tbody>
          ${P.scenario.length ? html`<tfoot><tr><td>Scenario total</td><td class="n">${fmt(w.cp, 0)}</td><td class="n">${w.cp ? fmt(w.avg, 1) : '—'}</td><td class="n">${fmt(w.qp, 0)}</td><td></td></tr></tfoot>` : ''}
        </table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Projected outcome</h3></div>
        <div class="card-body stat-list">
          ${row('CP counted so far', fmt(m.CP_COUNTED, 0))}${row('Scenario CP', fmt(w.cp, 0))}${row('Projected total CP', fmt(w.totalCP, 0))}
          ${duo('', 'WAM', 'GPA', true)}
          ${duo('Current', fmt(m.WAM, 2), fmt(m.GPA, 3))}
          ${duo('Scenario average', w.cp ? fmt(w.avg, 1) : '—', w.cp ? fmt(w.avgGP, 2) : '—')}
          ${duo('Projected final', html`<span class="big">${fmt(w.proj, 2)}</span>`, html`<span class="big">${fmt(w.projGPA, 3)}</span>`)}
          ${duo('Change vs today', signed(w.change, 2), signed(w.changeGPA, 3))}
          ${duo('Your target', fmt(S.targetWAM, 1), fmt(S.targetGPA, 2))}
          ${duo('Meets target?', met(w.meets, w.short, 1), met(w.meetsGPA, w.shortGPA, 2))}
          ${row('Projected classification', w.projClass)}
        </div>
      </div>
    </section>

    <section class="grid g2 mt">
      <div class="card">
        <div class="card-head"><h3>Reverse goal solver</h3><span class="sub">Reads your real record: WAM ${fmt(m.WAM, 2)} and GPA ${fmt(m.GPA, 3)} over ${fmt(m.CP_COUNTED, 0)} counted CP</span></div>
        <div class="card-body">
          <div class="grid-form">
            <label class="field"><span>Desired final WAM</span><input class="input" data-bind="P:desired" data-type="num" value="${P.desired}" placeholder="${fmt(S.targetWAM, 1)} (your target)" inputmode="decimal"></label>
            <label class="field"><span>Desired final GPA</span><input class="input" data-bind="P:desiredGPA" data-type="num" value="${P.desiredGPA ?? ''}" placeholder="${fmt(S.targetGPA, 2)} (your target)" inputmode="decimal"></label>
            <label class="field"><span>Remaining CP</span><input class="input" data-bind="P:remainingCP" data-type="num" value="${P.remainingCP}" placeholder="${fmt(m.CP_TO_WAM, 0)} (from your record)" inputmode="decimal"></label>
          </div>
          <div class="stat-list mt">
            ${duo('', 'WAM', 'GPA', true)}
            ${duo('Desired final', fmt(w.desired, 1), fmt(w.desiredGPA, 2))}
            ${duo('Required average', html`<span class="big">${w.required === '' ? '—' : fmt(w.required, 1)}</span>`, html`<span class="big">${w.requiredGPA === '' ? '—' : fmt(w.requiredGPA, 2)}</span>`)}
            ${duo('Required grade', w.reqGrade, w.reqGPAGrade)}
            ${row('WAM verdict', html`<span class="ink2">${w.verdict}</span>`)}
            ${row('GPA verdict', html`<span class="ink2">${w.verdictGPA}</span>`)}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Scenario table</h3><span class="sub">If you average X across the remaining ${fmt(m.CP_TO_WAM, 0)} CP. The GPA assumes every remaining subject lands on X, and ✓ marks a result that meets your target.</span></div>
        <div class="card-body flush tbl-wrap"><table class="tbl">
          <thead><tr><th class="n">Avg on remaining</th><th class="n">Final WAM</th><th class="n">Final GPA</th><th>Classification</th></tr></thead>
          <tbody>${E.scenarioGrid.map(g => html`<tr><td class="n strong">${g.avg}</td><td class="n${g.hits ? ' hit' : ''}">${fmt(g.wam, 2)}<span class="tick">${g.hits ? '✓' : ''}</span></td><td class="n${g.hitsGPA ? ' hit' : ''}">${fmt(g.gpa, 3)}<span class="tick">${g.hitsGPA ? '✓' : ''}</span></td><td>${g.cls}</td></tr>`)}</tbody></table></div>
      </div>
    </section>

    <div class="section-title"><h2>Monte Carlo projection</h2><p>${MC_N.toLocaleString('en-AU')} seeded scenarios across every remaining subject, scored for final WAM and GPA</p></div>
    ${hasMC ? html`
    <section class="kpis mc">
      ${big(`Chance of ${fcName}`, fmtPct(mc.pFC, 1), `WAM ≥ ${fmt(mc.FC_MIN, 1)} at graduation`, mc.pFC)}
      ${big('Chance of Uni Medal GPA', fmtPct(mc.pMedal, 1), `GPA ≥ ${fmt(S.uniMedalGPA, 2)}`, mc.pMedal)}
      ${big('Chance of target WAM', fmtPct(mc.pTarget, 1), `WAM ≥ ${fmt(S.targetWAM, 1)} (your target)`, mc.pTarget)}
      ${big('Chance of target GPA', fmtPct(mc.pTargetGPA, 1), `GPA ≥ ${fmt(S.targetGPA, 2)} (your target)`, mc.pTargetGPA)}
      ${big('Median final WAM', fmt(mc.p50, 1), `80% range ${fmt(mc.p10, 1)} to ${fmt(mc.p90, 1)}`)}
      ${big('Median final GPA', fmt(mc.gp50, 2), `80% range ${fmt(mc.gp10, 2)} to ${fmt(mc.gp90, 2)}`)}
    </section>
    <section class="grid g-3-2 mt">
      <div class="card fill">
        <div class="card-head"><h3>Outcome distribution</h3><span class="sub">Final ${dist === 'gpa' ? 'GPA' : 'WAM'} across all scenarios</span>
          <div class="actions">
            <div class="seg" role="tablist" aria-label="Show final WAM or GPA">${[['wam', 'WAM'], ['gpa', 'GPA']].map(([k, l]) => html`<button class="${dist === k ? 'on' : ''}" role="tab" aria-selected="${dist === k}" data-action="dist" data-id="${k}">${l}</button>`)}</div>
            ${raw(legend(H.names.map((label, k) => ({ label, color: ramp[k] })), 'box'))}
          </div></div>
        <div class="card-body"><div class="chart-box fill" id="ch-mc"></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Probability ladder</h3></div>
        <div class="card-body flush tbl-wrap"><table class="tbl">
          <thead><tr><th>Outcome at graduation</th><th class="n">Probability</th></tr></thead>
          <tbody>${mc.ladder.map(l => html`<tr><td>${l.badge} ${l.name}</td><td class="n strong">${fmtPct(l.p, 1)}</td></tr>`)}</tbody>
          <thead><tr><th>Benchmark</th><th class="n">P(reach)</th></tr></thead>
          <tbody>
            <tr><td>University Medal GPA ≥ ${fmt(S.uniMedalGPA, 2)}</td><td class="n strong">${fmtPct(mc.pMedal, 1)}</td></tr>
            <tr><td>Dean's Medal GPA ≥ ${fmt(S.deansMedalGPA, 2)}</td><td class="n strong">${fmtPct(mc.pDean, 1)}</td></tr>
            <tr><td>Your GPA target ≥ ${fmt(S.targetGPA, 2)}</td><td class="n strong">${fmtPct(mc.pTargetGPA, 1)}</td></tr>
            <tr><td>Your WAM target ≥ ${fmt(S.targetWAM, 1)}</td><td class="n strong">${fmtPct(mc.pTarget, 1)}</td></tr>
            <tr><td>Mean final GPA</td><td class="n strong">${fmt(mc.gpaMean, 2)}</td></tr>
          </tbody></table></div>
      </div>
    </section>
    <section class="grid g-2-1 mt">
      <div class="card">
        <div class="card-head"><h3>Remaining subjects</h3><span class="sub">Each draws a mark from its low · expected · high range. Leave a cell blank to use the suggestion.</span>
          <div class="actions">${Object.keys(P.overrides).length ? html`<button class="btn sm ghost" data-action="ov-reset">Clear overrides</button>` : ''}</div></div>
        <div class="card-body flush tbl-wrap"><table class="tbl edit">
          <thead><tr><th>Subject</th><th class="n">Low ✎</th><th class="n">Expected ✎</th><th class="n">High ✎</th><th>Basis</th><th class="n">Range in use</th><th class="n">CP</th></tr></thead>
          <tbody>${mc.rows.map(r => html`<tr>
            <td><span class="code-cell">${r.unalloc ? 'Unallocated CP' : r.code}</span><div class="subtle">${r.unalloc ? 'not yet in your plan' : `${r.term} · ${r.name}`}</div></td>
            ${['low', 'exp', 'high'].map(k => html`<td><input class="cell n" style="width:72px" data-col="ov-${k}" data-bind="ov:${r.code}:${k}" data-type="num" value="${r.override[k] ?? ''}" placeholder="${fmt(r.sugg[k], k === 'exp' ? 1 : 0)}" inputmode="decimal"></td>`)}
            <td class="ro subtle nowrap">${r.basis}</td>
            <td class="ro n nowrap">${fmt(r.a, 0)} · <b>${fmt(r.c, 1)}</b> · ${fmt(r.b, 0)}</td>
            <td class="ro n">${fmt(r.W, 0)}</td></tr>`)}</tbody></table></div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>Simulation controls</h3></div>
          <div class="card-body">
            <div class="grid-form" style="grid-template-columns:1fr 1fr">
              <label class="field"><span>Random seed</span><input class="input" data-bind="P:seed" data-type="int" value="${P.seed}" inputmode="numeric"><small>Change to re-draw</small></label>
              <label class="field"><span>Common form shift (σ, marks)</span><input class="input" data-bind="P:formShift" data-type="num" value="${P.formShift}" placeholder="${fmt(mc.tauSuggested, 1)} suggested" inputmode="decimal"><small>Blank uses the suggestion</small></label>
            </div>
            <p class="note mt-s">Form shift is how far a strong or weak stretch moves every remaining subject together (0 treats them as independent). The suggestion is your mark σ ÷ √(graded subjects): the uncertainty in your own average.</p>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Reconciliation</h3>${mc.reconOK ? chip('✅ reconciles', 'good') : chip('⚠ check inputs', 'warning')}</div>
          <div class="card-body stat-list">
            ${row('Mean final WAM · simulation', fmt(mc.mean, 2))}${row('Mean final WAM · closed form', fmt(mc.anMean, 2))}${row('Difference', fmtSigned(mc.mean - mc.anMean, 3))}
            ${row('Spread σ · simulation', fmt(mc.sd, 2))}${row('Spread σ · closed form', fmt(mc.anSd, 2))}
            ${row(`P(${fcName}) · closed form`, fmtPct(mc.anPFC, 1))}${row('P(target WAM) · closed form', fmtPct(mc.anPTarget, 1))}
            ${row('WAM if every expected mark lands', fmt(mc.expWAM, 2))}
            ${row('Mean final GPA · simulation', fmt(mc.gpaMean, 3))}${row('GPA if every expected mark lands', fmt(mc.expGPA, 3))}
            ${row('Scenarios · seed in use', `${MC_N.toLocaleString('en-AU')} · ${mc.seed}`)}
          </div>
        </div>
      </div>
    </section>
    <p class="note mt">Closed form is the normal approximation from each subject's triangular mean and variance plus the common shift. It ignores whole-mark rounding and the achievability caps, so agreement within about ±0.1 WAM is expected. GPA is read from the same simulated marks through your grade bands. Grade points jump at each band edge, so GPA has no closed form, and its mean can sit away from the expected-marks GPA when expected marks are close to a band edge. Results only change when an input or the seed changes, so every number here is stable and auditable.</p>`
    : html`<section class="card"><div class="empty"><b>${m.CP_COUNTED ? 'Nothing left to simulate' : 'Add some results first'}</b>${m.CP_COUNTED ? 'Add planned or in-progress subjects (or raise total CP in Settings) to project your final WAM and GPA.' : 'The projection starts from your counted marks, then simulates every remaining subject.'}</div></section>`}`;
  },
  mount(root, ctx) {
    const { E } = ctx;
    const el = root.querySelector('#ch-mc');
    if (!el) return;
    const H = dist === 'gpa' ? E.mc.histG : E.mc.hist;
    const ramp = ramp3();
    stackedColumns(el, {
      title: `Outcome distribution · final ${dist === 'gpa' ? 'GPA' : 'WAM'}`, labels: H.bins.map(b => b.label), height: 270,
      stacks: H.names.map((name, k) => ({ name, values: H.bins.map(b => b.parts[k]), color: ramp[k] })),
      tipTitle: i => H.bins[i].title,
    });
  },
  actions: {
    dist: (el, ctx) => { dist = el.dataset.id; ctx.render(); },
    'scen-add': (el, ctx) => { ctx.update(s => { s.planner.scenario.push({ id: ctx.uid(), label: '', cp: 10, target: '' }); }); },
    'scen-del': (el, ctx) => { ctx.update(s => { s.planner.scenario = s.planner.scenario.filter(r => r.id !== el.dataset.id); }); },
    'scen-fill': (el, ctx) => {
      ctx.update(s => {
        const have = new Set(s.planner.scenario.map(r => r.label));
        ctx.E.remRows.forEach(r => { const label = `${r.code} ${r.name}`.trim(); if (!have.has(label)) s.planner.scenario.push({ id: ctx.uid(), label, cp: r.cp || 10, target: Math.round(ctx.E.mc.rows.find(x => x.code === r.code)?.c ?? ctx.E.m.MARK_AVG) }); });
      });
    },
    'ov-reset': (el, ctx) => { ctx.update(s => { s.planner.overrides = {}; }); },
  },
};

function row(k, v) { return html`<div class="r"><span class="k">${k}</span><span class="v">${v}</span></div>`; }
// A stat row with WAM and GPA values in two aligned columns; `head` makes it the column header.
function duo(k, wam, gpa, head = false) { return html`<div class="r duo${head ? ' head' : ''}"><span class="k">${k}</span><span class="v">${wam}</span><span class="v">${gpa}</span></div>`; }
function signed(x, d) { return html`<span style="color:${x >= 0 ? 'var(--good)' : 'var(--critical)'}">${fmtSigned(x, d)}</span>`; }
function met(ok, short, d) { return ok ? chip('Met', 'good') : chip(`${fmt(short, d)} short`, 'serious'); }
function big(label, value, sub, p) {
  return html`<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div>${p !== undefined ? meter(p, { label }) : ''}</div>`;
}
