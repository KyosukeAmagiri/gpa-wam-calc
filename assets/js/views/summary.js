import { html, icon, fmt, fmtPct, gradePill } from '../ui.js';
import { sessionName } from '../engine.js';

export default {
  title: 'Academic summary',
  subtitle: () => 'A one-page record you can print or save as a PDF',
  render(ctx) {
    const { E, state } = ctx;
    const { m, S } = E;
    const s = state.settings;
    const top = E.ledger.filter(r => r.cnt).sort((a, b) => a.rank - b.rank || a.i - b.i).slice(0, 5);
    const cats = E.categories.filter(c => c.cp > 0).sort((a, b) => b.wam - a.wam).slice(0, 4);
    const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    const sess = r => (r.year === '' ? 'n/a' : sessionName(r.year * 10 + (r.sem || 1), S.commenceYear, true));
    return html`
    <div class="row no-print" style="justify-content:flex-end;margin-bottom:14px">
      <span class="note">Edit your name and program in Settings.</span>
      <button class="btn primary" data-action="print">${icon('print')}Print or save as PDF</button>
    </div>
    <article class="doc">
      <header class="doc-head">
        <div>
          <div class="eyebrow">Academic summary</div>
          <h2>${s.studentName || 'Your name'}</h2>
          <p class="ink2">${[s.program || 'Program not set', s.institution].filter(Boolean).join('  ·  ')}</p>
        </div>
        <div class="meta">As at ${today}<br>Commenced ${S.commenceYear}<br>Expected completion ${E.plan.COMPLETION_CAL}</div>
      </header>
      <section class="doc-kpis">
        <div><span>WAM</span><b>${m.MARK_N ? fmt(m.WAM, 2) : '—'}</b><small>credit-weighted average</small></div>
        <div><span>GPA</span><b>${m.MARK_N ? fmt(m.GPA, 3) : '—'}</b><small>out of ${fmt(E.maxGPA, 2)}</small></div>
        <div><span>Standing</span><b style="font-size:17px;line-height:1.5">${m.MARK_N ? m.CLASS.name : '—'}</b><small>WAM band ${fmt(m.CLASS.min, 0)}+</small></div>
        <div><span>Credit points</span><b>${fmt(m.CP_DONE, 0)} / ${fmt(S.totalCP, 0)}</b><small>${fmtPct(m.CP_PCT, 0)} of degree complete</small></div>
        <div><span>High Distinctions</span><b>${m.N_HD}</b><small>of ${m.MARK_N} graded (${fmtPct(m.HD_RATE, 0)})</small></div>
      </section>
      <div class="grid g2" style="gap:28px">
        <section>
          <h3>Top results</h3>
          <table class="tbl"><tbody>${top.length ? top.map(r => html`<tr><td class="code-cell">${r.code}</td><td>${r.name}</td><td class="n strong">${fmt(r.mark, 0)}</td><td class="c">${gradePill(E, r.band)}</td></tr>`) : html`<tr><td class="muted">No graded subjects yet</td></tr>`}</tbody></table>
          <h3>Highlights</h3>
          <ul>
            <li>${m.N_HD} High Distinction${m.N_HD === 1 ? '' : 's'} from ${m.MARK_N} graded subjects (${fmtPct(m.HD_RATE, 0)})</li>
            ${m.BEST ? html`<li>Top result ${fmt(m.MARK_MAX, 0)} in ${m.BEST.name}</li>` : ''}
            ${m.BEST_TERM ? html`<li>Strongest study period (${m.BEST_TERM.label}, ${m.BEST_TERM.sessionShort}) averaged ${fmt(m.BEST_TERM.wam, 1)}</li>` : ''}
            <li>${fmtPct(m.PASS_RATE, 0)} pass rate · ${m.SUBJ_IP} subject${m.SUBJ_IP === 1 ? '' : 's'} currently in progress</li>
          </ul>
        </section>
        <section>
          <h3>Strengths by discipline · WAM · GPA</h3>
          <table class="tbl"><tbody>${E.disciplines.slice(0, 5).map(d => html`<tr><td>${d.label} <span class="muted">(${d.n})</span></td><td class="n strong">${fmt(d.wam, 1)}</td><td class="n">${fmt(d.gpa, 2)}</td></tr>`)}</tbody></table>
          ${cats.length ? html`<h3>By category · WAM · GPA</h3>
          <table class="tbl"><tbody>${cats.map(c => html`<tr><td>${c.name} <span class="muted">(${c.n})</span></td><td class="n strong">${fmt(c.wam, 1)}</td><td class="n">${fmt(c.gpa, 2)}</td></tr>`)}</tbody></table>` : ''}
        </section>
      </div>
      <h3>Academic record</h3>
      <table class="tbl">
        <thead><tr><th>Session</th><th>Code</th><th>Subject</th><th class="n">CP</th><th class="n">Mark</th><th class="c">Grade</th></tr></thead>
        <tbody>${E.transcript.map(r => html`<tr><td class="nowrap muted">${sess(r)}</td><td class="code-cell">${r.code}</td><td>${r.name}</td><td class="n">${r.cp === '' ? '' : fmt(r.cp, 0)}</td>
          <td class="n">${r.trflag === 1 && r.status !== 'Credit Transfer' && r.status !== 'Exempt' && r.mark !== '' ? fmt(r.mark, 0) : ''}</td>
          <td class="c">${r.trflag === 2 ? html`<span class="muted">Enrolled</span>` : r.status === 'Credit Transfer' ? 'CT' : r.status === 'Exempt' ? 'EX' : gradePill(E, r.band)}</td></tr>`)}</tbody>
      </table>
      <p class="note mt">Unofficial summary generated from the student's own records. Repeated units count each attempt toward the GPA. Confirm against an official Academic Transcript.</p>
    </article>`;
  },
  actions: { print: () => window.print() },
};
