import { html, icon, fmt, fmtPct, chip, toast, confirmDialog } from '../ui.js';
import { DEFAULT_BANDS, DEFAULT_CLASSES } from '../state.js';

const field = (label, bind, value, { type = 'text', hint = '', placeholder = '', mode = '' } = {}) => html`
  <label class="field"><span>${label}</span><input class="input" data-bind="${bind}" ${type !== 'text' ? html`data-type="${type}"` : ''} value="${value ?? ''}" placeholder="${placeholder}" ${mode ? html`inputmode="${mode}"` : ''}>${hint ? html`<small>${hint}</small>` : ''}</label>`;
const select = (label, bind, value, options, hint = '', type = 'text') => html`
  <label class="field"><span>${label}</span><select class="select" data-bind="${bind}" ${type !== 'text' ? html`data-type="${type}"` : ''}>${options.map(([v, l]) => html`<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${l}</option>`)}</select>${hint ? html`<small>${hint}</small>` : ''}</label>`;

export default {
  title: 'Settings',
  subtitle: () => 'Grade scale and configuration · everything recalculates from here',
  render(ctx) {
    const { E, state } = ctx;
    const s = state.settings;
    const S = E.S;
    const m = E.m;
    return html`
    <section class="grid g2">
      <div class="card">
        <div class="card-head"><h3>Profile</h3><span class="sub">Shown on the dashboard header and the academic summary</span></div>
        <div class="card-body grid-form">
          ${field('Student name', 'S:studentName', s.studentName, { placeholder: 'Your name' })}
          ${field('Institution', 'S:institution', s.institution)}
          ${field('Degree / program', 'S:program', s.program, { placeholder: 'e.g. Bachelor of Business' })}
          ${field('Commencing year', 'S:commenceYear', s.commenceYear, { type: 'int', mode: 'numeric', hint: 'Year 1 of study. Turns Y2 S1 into Autumn of the following year.' })}
          ${select('Current study year', 'S:curYear', s.curYear, [1, 2, 3, 4, 5, 6, 7].map(y => [y, `Year ${y}`]), 'Highlights the current term on the degree map', 'int')}
          ${select('Current semester', 'S:curSem', s.curSem, [[1, '1 · Autumn'], [2, '2 · Spring'], [3, '3 · Summer'], [4, '4 · Winter']], '', 'int')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Goals</h3><span class="sub">Targets drive the goal tracker, the reverse solver and the projection odds</span></div>
        <div class="card-body grid-form">
          ${field('🎯 Target WAM', 'S:targetWAM', s.targetWAM, { type: 'num', mode: 'decimal' })}
          ${field('🎯 Target GPA', 'S:targetGPA', s.targetGPA, { type: 'num', mode: 'decimal' })}
          ${field('Total credit points in degree', 'S:totalCP', s.totalCP, { type: 'num', mode: 'numeric', hint: 'Commonly 240 for a 3-year bachelor; double degrees run higher' })}
          ${field('Standard CP per semester', 'S:cpPerSem', s.cpPerSem, { type: 'num', mode: 'numeric' })}
          ${field('Standard CP per summer term', 'S:summerCP', s.summerCP, { type: 'num', mode: 'numeric' })}
        </div>
      </div>
    </section>

    <section class="card mt">
      <div class="card-head"><h3>Calculation settings</h3></div>
      <div class="card-body grid-form">
        ${select('GPA scale in use', 'S:gpaScale', s.gpaScale, [[7, '7-point (WSU)'], [4, '4-point']], `Maximum GPA ${E.maxGPA}`, 'int')}
        ${field('Pass mark', 'S:passMark', s.passMark, { type: 'num', mode: 'decimal' })}
        ${field('Credit threshold', 'S:creditThr', s.creditThr, { type: 'num', mode: 'decimal' })}
        ${field('Distinction threshold', 'S:distThr', s.distThr, { type: 'num', mode: 'decimal' })}
        ${field('High Distinction threshold', 'S:hdThr', s.hdThr, { type: 'num', mode: 'decimal' })}
        ${select("Count 'In Progress' in WAM?", 'S:countIP', s.countIP, [['No', 'No'], ['Yes', 'Yes, use live marks']])}
        ${select('Failed CP count as completed?', 'S:failCountsCP', s.failCountsCP, [['No', 'No'], ['Yes', 'Yes']])}
      </div>
    </section>

    <section class="grid g-3-2 mt">
      <div class="card">
        <div class="card-head"><h3>Grade bands</h3><span class="sub">Up to 12 bands, any order · marks are matched to the first band whose range contains them (rounded to 2 dp)</span>
          <div class="actions"><button class="btn sm" data-action="band-add" ${S.bands.length >= 12 ? 'disabled' : ''}>${icon('plus', 15)}Add band</button><button class="btn sm ghost" data-action="band-reset">WSU defaults</button></div></div>
        <div class="card-body flush tbl-wrap"><table class="tbl edit">
          <thead><tr><th class="n">Min mark</th><th class="n">Max mark</th><th>Grade</th><th class="n">GPA (4.0)</th><th class="n">GPA (7.0)</th><th>Description</th><th></th></tr></thead>
          <tbody>${s.bands.map((b, i) => html`<tr>
            <td><input class="cell n" style="width:72px" data-bind="band:${i}:min" data-type="num" value="${b.min}"></td>
            <td><input class="cell n" style="width:72px" data-bind="band:${i}:max" data-type="num" value="${b.max}"></td>
            <td><input class="cell" style="width:64px;font-weight:650" data-bind="band:${i}:grade" value="${b.grade}"></td>
            <td><input class="cell n" style="width:64px" data-bind="band:${i}:gp4" data-type="num" value="${b.gp4}"></td>
            <td><input class="cell n" style="width:64px" data-bind="band:${i}:gp7" data-type="num" value="${b.gp7}"></td>
            <td><input class="cell" data-bind="band:${i}:desc" value="${b.desc}"></td>
            <td class="ro"><button class="icon-btn sm del" data-action="band-del" data-id="${i}" aria-label="Delete band">${icon('trash', 16)}</button></td></tr>`)}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>How the maths works</h3></div>
        <div class="card-body"><ul class="note" style="padding-left:18px;margin:0;line-height:1.75;font-size:13px">
          <li><b>WAM</b> = Σ(mark × CP) ÷ Σ(CP)</li>
          <li><b>GPA</b> = Σ(grade point × CP) ÷ Σ(CP)</li>
          <li>A subject counts only with a mark and a counting status: Completed, Failed, and In Progress (optional).</li>
          <li>Withdrawn, Exempt and Credit Transfer never touch WAM or GPA.</li>
          <li>Fails count as 0 grade points, but their CP stays in the denominator. Repeated units count each attempt.</li>
          <li>In-progress marks build from the Assessments page when you leave the mark blank.</li>
          <li>The Monte Carlo, Scanner and Degree map all read these same bands and thresholds.</li>
        </ul></div>
      </div>
    </section>

    <section class="grid g2 mt">
      <div class="card">
        <div class="card-head"><h3>Award classification ladder</h3><span class="sub">Highest first · driven by overall WAM</span>
          <div class="actions"><button class="btn sm" data-action="cls-add">${icon('plus', 15)}Add</button><button class="btn sm ghost" data-action="cls-reset">Defaults</button></div></div>
        <div class="card-body flush tbl-wrap"><table class="tbl edit">
          <thead><tr><th>Classification</th><th>Badge</th><th class="n">Min WAM</th><th>Notes</th><th></th></tr></thead>
          <tbody>${s.classes.map((c, i) => html`<tr>
            <td><input class="cell" style="min-width:150px;font-weight:600" data-bind="cls:${i}:name" value="${c.name}"></td>
            <td><input class="cell" style="width:52px" data-bind="cls:${i}:badge" value="${c.badge}"></td>
            <td><input class="cell n" style="width:70px" data-bind="cls:${i}:min" data-type="num" value="${c.min}"></td>
            <td><input class="cell" style="min-width:160px" data-bind="cls:${i}:notes" value="${c.notes}"></td>
            <td class="ro"><button class="icon-btn sm del" data-action="cls-del" data-id="${i}" aria-label="Delete">${icon('trash', 16)}</button></td></tr>`)}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>🏅 Academic excellence benchmarks</h3><span class="sub">Cumulative GPA, 7-point scale</span></div>
        <div class="card-body flush tbl-wrap"><table class="tbl edit">
          <thead><tr><th>Benchmark</th><th class="n">Cum GPA</th><th>Standing</th></tr></thead>
          <tbody>
            <tr><td class="ro">University Medal</td><td><input class="cell n" style="width:72px" data-bind="S:uniMedalGPA" data-type="num" value="${s.uniMedalGPA}"></td><td class="ro">${m.MARK_N ? (m.GPA >= S.uniMedalGPA ? chip('✅ above', 'good') : chip('below', 'muted')) : ''}</td></tr>
            <tr><td class="ro">Dean's Medal</td><td><input class="cell n" style="width:72px" data-bind="S:deansMedalGPA" data-type="num" value="${s.deansMedalGPA}"></td><td class="ro">${m.MARK_N ? (m.GPA >= S.deansMedalGPA ? chip('✅ above', 'good') : chip('below', 'muted')) : ''}</td></tr>
            <tr><td class="ro">Your GPA target</td><td class="ro n">${fmt(S.targetGPA, 2)}</td><td class="ro">${m.MARK_N ? (m.GPA >= S.targetGPA ? chip('✅ above', 'good') : chip('below', 'muted')) : ''}</td></tr>
            <tr><td class="ro">Current cumulative GPA</td><td class="ro n strong">${m.MARK_N ? fmt(m.GPA, 3) : '—'}</td><td class="ro muted">${fmtPct(m.GPA_PCT)} of max${m.NEED_AVG_GPA !== '' && m.MARK_N ? ` · needs ${fmt(m.NEED_AVG_GPA, 2)} average across the remaining ${fmt(m.CP_TO_WAM, 0)} CP to reach your target` : ''}</td></tr>
          </tbody></table>
          <p class="note" style="padding:10px 18px 16px">University Medal: Honours Class I with a cumulative GPA of at least 6.000 in both the honours and undergraduate components. Dean's Medal: the highest cumulative GPA in the graduating cohort with a GPA of at least 6.25 and at least 80 CP completed at WSU. Thresholds from the WSU Recognition of Academic Excellence procedure (policies.westernsydney.edu.au); confirm against the current policy before relying on them.</p></div>
      </div>
    </section>

    <section class="grid g2 mt">
      <div class="card">
        <div class="card-head"><h3>Discipline labels</h3><span class="sub">Code prefix and the name used on Insights and the summary</span>
          <div class="actions"><button class="btn sm" data-action="disc-add">${icon('plus', 15)}Add</button></div></div>
        <div class="card-body flush tbl-wrap" style="max-height:360px;overflow:auto"><table class="tbl edit">
          <thead><tr><th>Prefix</th><th>Label</th><th></th></tr></thead>
          <tbody>${s.discLabels.map((d, i) => html`<tr><td><input class="cell code" style="width:80px" data-bind="disc:${i}:prefix" value="${d.prefix}" maxlength="4"></td><td><input class="cell" data-bind="disc:${i}:label" value="${d.label}"></td>
            <td class="ro"><button class="icon-btn sm del" data-action="disc-del" data-id="${i}" aria-label="Delete">${icon('trash', 16)}</button></td></tr>`)}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Your data</h3><span class="sub">Saved automatically in this browser only${state.updatedAt ? ` · last saved ${new Date(state.updatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</span></div>
        <div class="card-body stack" style="gap:12px">
          <div class="callout">${icon('shield')}<span>Nothing is sent to a server. Clearing your browser data, or switching browser or device, starts you fresh, so keep a backup file somewhere safe.</span></div>
          <div class="row">
            <button class="btn primary" data-action="x-json">${icon('download')}Back up (JSON)</button>
            <button class="btn" data-action="x-restore">${icon('refresh')}Restore backup</button>
            <button class="btn" data-action="x-xlsx">${icon('file')}Export to Excel</button>
          </div>
          <div class="row">
            <button class="btn" data-action="import">${icon('upload')}Import MySR PDF</button>
            <button class="btn ghost" data-action="sample">${icon('sparkle')}Load sample data</button>
            <span class="spacer"></span>
            <button class="btn danger" data-action="reset">${icon('trash')}Erase all data</button>
          </div>
        </div>
      </div>
    </section>`;
  },
  actions: {
    'band-add': (el, ctx) => { ctx.update(s => { s.settings.bands.push({ min: '', max: '', grade: '', gp4: 0, gp7: 0, desc: '' }); }); },
    'band-del': (el, ctx) => { ctx.update(s => { s.settings.bands.splice(+el.dataset.id, 1); }); },
    'band-reset': async (el, ctx) => {
      if (!(await confirmDialog('Restore WSU grade bands?', 'F 0–49.99, P 50–64.99, C 65–74.99, D 75–84.99, HD 85–100 on the 7-point scale.', 'Restore'))) return;
      ctx.update(s => { s.settings.bands = DEFAULT_BANDS.map(b => ({ ...b })); });
    },
    'cls-add': (el, ctx) => { ctx.update(s => { s.settings.classes.push({ name: '', badge: '', min: 0, notes: '' }); }); },
    'cls-del': (el, ctx) => { ctx.update(s => { s.settings.classes.splice(+el.dataset.id, 1); }); },
    'cls-reset': (el, ctx) => { ctx.update(s => { s.settings.classes = DEFAULT_CLASSES.map(c => ({ ...c })); }); toast('Classification ladder restored'); },
    'disc-add': (el, ctx) => { ctx.update(s => { s.settings.discLabels.push({ prefix: '', label: '' }); }); },
    'disc-del': (el, ctx) => { ctx.update(s => { s.settings.discLabels.splice(+el.dataset.id, 1); }); },
    'x-json': (el, ctx) => ctx.runExport('json'),
    'x-restore': (el, ctx) => ctx.runExport('restore'),
    'x-xlsx': (el, ctx) => ctx.runExport('xlsx'),
    reset: (el, ctx) => ctx.resetAll(),
  },
};
