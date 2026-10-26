import { html, raw, icon, fmt, fmtPct, fmtSigned, chip, oklch, isDark, meter } from '../ui.js';
import { whatIf, MC_N } from '../engine.js';
import { stackedColumns, legend } from '../charts.js';

const ramp3 = () => (isDark() ? [0.48, 0.64, 0.80] : [0.72, 0.55, 0.38]).map(L => oklch(L, isDark() ? 0.14 : 0.15, 18));

export default {
  title: 'Planner & odds',
  subtitle: () => 'What-if sandbox · reverse goal solver · Monte Carlo projection of your final WAM',
  render(ctx) {
    const { E, state } = ctx;
    const { m, S } = E;
    const P = state.planner;
    const w = whatIf(E, P.scenario, P.desired, P.remainingCP);
    const mc = E.mc;
    const fcName = (E.classes.find(c => /^first/i.test(c.name)) || E.classes[0] || { name: 'top class' }).name;
    const [c1, c2, c3] = ramp3();
    const hasMC = mc.hasRemaining && m.CP_COUNTED > 0;
    return html`
    <section class="grid g-3-2">
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
          ${row('Current WAM', fmt(m.WAM, 2))}${row('CP in current WAM', fmt(m.CP_COUNTED, 0))}${row('Scenario CP', fmt(w.cp, 0))}${row('Scenario average', w.cp ? fmt(w.avg, 1) : '—')}
          ${row('Projected total CP', fmt(w.totalCP, 0))}
          ${row('Projected final WAM', html`<span style="font-size:20px">${fmt(w.proj, 2)}</span>`)}
          ${row('Change vs today', html`<span style="color:${w.change >= 0 ? 'var(--good)' : 'var(--critical)'}">${fmtSigned(w.change, 2)}</span>`)}
          ${row('Projected classification', w.projClass)}
          ${row('Meets your target?', w.meets ? chip('✅ Yes, target met', 'good') : chip(`❌ No, ${fmt(w.short, 1)} short`, 'serious'))}
        </div>
      </div>
    </section>

    <section class="grid g2 mt">
      <div class="card">
        <div class="card-head"><h3>Reverse goal solver</h3><span class="sub">Reads your real record: current WAM ${fmt(m.WAM, 2)} over ${fmt(m.CP_COUNTED, 0)} counted CP</span></div>
        <div class="card-body">
          <div class="grid-form">
            <label class="field"><span>Desired final WAM</span><input class="input" data-bind="P:desired" data-type="num" value="${P.desired}" placeholder="${fmt(S.targetWAM, 1)} (your target)" inputmode="decimal"></label>
            <label class="field"><span>Remaining CP</span><input class="input" data-bind="P:remainingCP" data-type="num" value="${P.remainingCP}" placeholder="${fmt(m.CP_TO_WAM, 0)} (from your record)" inputmode="decimal"></label>
          </div>
          <div class="stat-list mt">
            ${row('Required average', html`<span style="font-size:22px">${w.required === '' ? '—' : fmt(w.required, 1)}</span>`)}
            ${row('Required grade', w.reqGrade)}
            ${row('Verdict', html`<span class="ink2">${w.verdict}</span>`)}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Scenario table</h3><span class="sub">If you average X across the remaining ${fmt(m.CP_TO_WAM, 0)} CP</span></div>
        <div class="card-body flush tbl-wrap"><table class="tbl">
          <thead><tr><th class="n">Avg on remaining</th><th class="n">Final WAM</th><th class="n">Grade pt</th><th>Classification</th><th class="c">Hits target</th></tr></thead>
          <tbody>${E.scenarioGrid.map(g => html`<tr><td class="n strong">${g.avg}</td><td class="n">${fmt(g.wam, 2)}</td><td class="n">${g.gp}</td><td>${g.cls}</td><td class="c">${g.hits ? '✅' : html`<span class="muted">—</span>`}</td></tr>`)}</tbody></table></div>
      </div>
    </section>

    <div class="section-title"><h2>Monte Carlo projection</h2><p>${MC_N.toLocaleString('en-AU')} seeded scenarios across every remaining subject</p></div>
    ${hasMC ? html`
    <section class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      ${big(`Chance of ${fcName}`, fmtPct(mc.pFC, 1), `WAM ≥ ${fmt(mc.FC_MIN, 1)} at graduation`, mc.pFC)}
      ${big('Chance of Uni Medal GPA', fmtPct(mc.pMedal, 1), `GPA ≥ ${fmt(S.uniMedalGPA, 2)}`, mc.pMedal)}
      ${big('Chance of target WAM', fmtPct(mc.pTarget, 1), `WAM ≥ ${fmt(S.targetWAM, 1)} (your target)`, mc.pTarget)}
      ${big('Median final WAM', fmt(mc.p50, 1), `80% range ${fmt(mc.p10, 1)} to ${fmt(mc.p90, 1)}`)}
    </section>
    <section class="grid g-3-2 mt">
      <div class="card">
        <div class="card-head"><h3>Outcome distribution</h3><span class="sub">Final WAM across all scenarios</span>
          <div class="actions">${raw(legend([{ label: `Below ${fcName}`, color: c1 }, { label: `${fcName} to target`, color: c2 }, { label: 'At or above target', color: c3 }], 'box'))}</div></div>
        <div class="card-body"><div class="chart-box" id="ch-mc"></div></div>
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
            ${row('WAM if every expected mark lands', fmt(mc.expWAM, 2))}${row('Scenarios · seed in use', `${MC_N.toLocaleString('en-AU')} · ${mc.seed}`)}
          </div>
        </div>
      </div>
    </section>
    <p class="note mt">Closed form is the normal approximation from each subject's triangular mean and variance plus the common shift. It ignores whole-mark rounding and the achievability caps, so agreement within about ±0.1 WAM is expected. Results only change when an input or the seed changes, so every number here is stable and auditable.</p>`
    : html`<section class="card"><div class="empty"><b>${m.CP_COUNTED ? 'Nothing left to simulate' : 'Add some results first'}</b>${m.CP_COUNTED ? 'Add planned or in-progress subjects (or raise total CP in Settings) to project your final WAM.' : 'The projection starts from your counted marks, then simulates every remaining subject.'}</div></section>`}`;
  },
  mount(root, ctx) {
    const { E } = ctx;
    const el = root.querySelector('#ch-mc');
    if (!el) return;
    const mc = E.mc;
    const [c1, c2, c3] = ramp3();
    const fcName = (E.classes.find(c => /^first/i.test(c.name)) || E.classes[0] || { name: 'top class' }).name;
    stackedColumns(el, {
      title: 'Outcome distribution', labels: mc.hist.map(h => h.label), height: 270,
      stacks: [{ name: `Below ${fcName}`, values: mc.hist.map(h => h.below), color: c1 }, { name: `${fcName} to target`, values: mc.hist.map(h => h.first), color: c2 }, { name: 'At or above target', values: mc.hist.map(h => h.target), color: c3 }],
      tipTitle: i => `Final WAM ${fmt(mc.hist[i].from, 2)} to ${fmt(mc.hist[i].to, 2)}`,
    });
  },
  actions: {
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
function big(label, value, sub, p) {
  return html`<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div>${p !== undefined ? meter(p, { label }) : ''}</div>`;
}
