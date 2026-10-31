// Subject outline import: drop one or more WSU Subject Outline PDFs and their assessment items (weights, types and due
// dates) come in, after a review where every row can be checked and edited. Files are read on this device only.
import { html, icon, openModal, toast, fmt } from './ui.js';
import { TYPES, cleanCode } from './engine.js';
import { parseOutline } from './outline-parser.js';
import { pdfLines } from './import-pdf.js';
import { uid } from './state.js';

export function openOutlineImport(ctx) {
  const body = document.createElement('div');
  body.innerHTML = html`
    <p class="lede">Drop the Subject Outline (Learning Guide) for a subject and its assessments come straight in: names, weights, types and due dates. You can drop several at once.</p>
    <label class="drop mt" id="ol-drop" tabindex="0">
      ${icon('doc', 28)}<b>Drop subject outline PDFs here</b><br><span class="muted">or click to choose · read on this device, never uploaded</span>
      <input type="file" id="ol-input" accept="application/pdf,.pdf" multiple hidden>
    </label>
    <details class="paste"><summary>Or paste the assessment table instead</summary>
      <p class="note">Copy from the outline's Assessment Summary (Item, Weight, Due Date) and paste it here, with the subject code on the first line.</p>
      <textarea class="input" id="ol-text" rows="6" spellcheck="false" aria-label="Pasted assessment table" placeholder="LAWS2008&#10;Item    Weight    Due Date&#10;Professional Task    45%    21/09/2026 11:59 PM"></textarea>
      <div class="row mt-s"><button class="btn primary sm" type="button" id="ol-paste">${icon('list', 15)}Read pasted text</button><span class="muted" id="ol-msg" role="status" aria-live="polite"></span></div>
    </details>
    <p class="muted mt-s" id="ol-prog" role="status" aria-live="polite"></p>`.s;
  const modal = openModal({ title: 'Import a subject outline', body, wide: true });
  const input = body.querySelector('#ol-input'), drop = body.querySelector('#ol-drop'), prog = body.querySelector('#ol-prog');
  const handle = async files => {
    const pdfs = [...files].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!pdfs.length) { prog.textContent = 'Choose a PDF subject outline.'; return; }
    const found = [];
    for (const [i, f] of pdfs.entries()) {
      prog.textContent = `Reading ${f.name} (${i + 1} of ${pdfs.length})…`;
      try {
        const r = parseOutline(await pdfLines(f));
        if (r.items.length) found.push({ ...r, file: f.name }); else prog.textContent = `${f.name}: no assessment table found.`;
      } catch (e) { console.error(e); prog.textContent = `${f.name}: ${e.message || 'could not be read.'}`; }
    }
    if (!found.length) { prog.textContent += ' Nothing to import.'; return; }
    modal.close();
    openReview(ctx, found);
  };
  input.addEventListener('change', () => handle(input.files));
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => handle(e.dataTransfer.files));
  body.querySelector('#ol-paste').addEventListener('click', () => {
    const text = body.querySelector('#ol-text').value;
    const r = parseOutline(text);
    if (!r.items.length) { body.querySelector('#ol-msg').textContent = 'No rows with a weight like 40% were found.'; return; }
    modal.close();
    openReview(ctx, [{ ...r, file: 'pasted text' }]);
  });
}

function openReview(ctx, outlines) {
  const st = ctx.state;
  const commence = Number(st.settings.commenceYear) || new Date().getFullYear();
  const subs = outlines.map(o => {
    const code = cleanCode(o.code);
    const existing = st.assessments.filter(a => cleanCode(a.code) === code);
    return {
      o, code, mode: existing.length ? 'merge' : 'add', existing,
      addSubject: !!code && !st.subjects.some(s => cleanCode(s.code) === code),
      rows: o.items.map(x => ({ ...x, include: true })),
    };
  });
  const body = document.createElement('div');
  const paint = () => {
    body.innerHTML = html`${subs.map((s, si) => {
      const total = s.rows.filter(r => r.include).reduce((t, r) => t + (Number(r.weight) || 0), 0);
      const name = s.o.name || ctx.lookupName(s.code);
      return html`<section class="ol-sub">
        <div class="ol-head">
          <label class="field"><span>Subject code</span><input class="input code" data-s="${si}" data-f="code" value="${s.code}" style="width:120px"></label>
          <div class="ol-meta"><b>${name || 'Unknown subject'}</b><span class="muted">${[s.o.season && s.o.year ? `${s.o.season} ${s.o.year}` : '', s.o.cp ? `${s.o.cp} CP` : '', s.o.file].filter(Boolean).join(' · ')}</span></div>
          <span class="chip ${Math.abs(total - 100) < 0.5 ? 'chip-good' : 'chip-warning'}">${fmt(total, 0)}% of the mark</span>
        </div>
        ${s.addSubject ? html`<label class="check mt-s"><input type="checkbox" data-s="${si}" data-f="addSubject" checked><span>Also add ${s.code} to Subjects as In Progress${s.o.year && s.o.sem ? ` (Y${s.o.year - commence + 1} S${s.o.sem})` : ''}</span></label>` : ''}
        ${s.existing.length ? html`<label class="field mt-s" style="max-width:420px"><span>${s.code} already has ${s.existing.length} assessment item${s.existing.length === 1 ? '' : 's'}</span><select class="select" data-s="${si}" data-f="mode">
          <option value="merge" ${s.mode === 'merge' ? 'selected' : ''}>Update items with the same name, add the rest</option>
          <option value="replace" ${s.mode === 'replace' ? 'selected' : ''}>Replace its ungraded items with these</option>
          <option value="add" ${s.mode === 'add' ? 'selected' : ''}>Add these alongside</option></select></label>` : ''}
        <div class="tbl-wrap mt-s" style="border:1px solid var(--line);border-radius:12px"><table class="tbl edit">
          <thead><tr><th class="c"></th><th>Assessment</th><th>Type</th><th class="n">Weight %</th><th>Due</th><th>From the outline</th></tr></thead>
          <tbody>${s.rows.map((r, ri) => html`<tr>
            <td class="c"><input type="checkbox" data-s="${si}" data-r="${ri}" data-f="include" ${r.include ? 'checked' : ''} aria-label="Include ${r.name}"></td>
            <td><input class="cell" data-s="${si}" data-r="${ri}" data-f="name" value="${r.name}" style="min-width:180px"></td>
            <td><select class="cell" style="min-width:132px" data-s="${si}" data-r="${ri}" data-f="type">${TYPES.map(t => html`<option ${t === r.type ? 'selected' : ''}>${t}</option>`)}</select></td>
            <td><input class="cell n" data-s="${si}" data-r="${ri}" data-f="weight" value="${r.weight}" inputmode="decimal" style="width:70px"></td>
            <td><input class="cell" type="date" data-s="${si}" data-r="${ri}" data-f="due" value="${r.due}"></td>
            <td class="ro" style="min-width:180px">${r.dueText ? r.dueText : html`<span class="muted">no date given</span>`}
              ${r.estimated ? html` <span class="chip chip-warning" title="Worked out from the teaching weeks; check it against your timetable">estimate · ${r.how}</span>` : ''}
              ${r.threshold ? html` <span class="chip chip-info" title="You must reach the pass mark on this item">must pass</span>` : ''}</td></tr>`)}</tbody></table></div>
        ${s.o.warnings.map(w => html`<p class="note">⚠ ${w}</p>`)}
      </section>`;
    })}
    <p class="note mt-s">Dates marked “estimate” were worked out from the outline's teaching weeks (for example the first week of the exam period). Exams move once the timetable is out, so check them then.</p>`.s;
    body.querySelectorAll('[data-f]').forEach(el => el.addEventListener('change', () => {
      const s = subs[+el.dataset.s], f = el.dataset.f;
      if (el.dataset.r !== undefined) {
        const r = s.rows[+el.dataset.r];
        if (f === 'include') r.include = el.checked;
        else if (f === 'weight') { const n = Number(el.value); r.weight = Number.isFinite(n) ? n : ''; }
        else { r[f] = el.value; if (f === 'due') r.estimated = false; }
      } else if (f === 'code') {
        s.code = cleanCode(el.value);
        s.existing = st.assessments.filter(a => cleanCode(a.code) === s.code);
        s.addSubject = !!s.code && !st.subjects.some(x => cleanCode(x.code) === s.code);
        s.mode = s.existing.length ? 'merge' : 'add';
      } else if (f === 'addSubject') s.addSubject = el.checked;
      else if (f === 'mode') s.mode = el.value;
      paint();
    }));
  };
  paint();
  const count = () => subs.reduce((n, s) => n + s.rows.filter(r => r.include && r.name).length, 0);
  openModal({
    title: outlines.length === 1 ? `Review ${outlines[0].code || 'the outline'}'s assessments` : `Review ${outlines.length} subject outlines`, body, wide: true,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Import assessments', kind: 'primary', onClick: () => {
          if (!count()) { toast('Select at least one assessment to import.'); return true; }
          const out = apply(ctx, subs, commence);
          toast(`Imported ${out.added + out.updated} assessment item(s): ${out.added} added, ${out.updated} updated${out.subjects ? `, plus ${out.subjects} subject(s)` : ''}.`, 'good', 5000);
          ctx.go('assessments');
          return false;
        },
      },
    ],
  });
}

function apply(ctx, subs, commence) {
  let added = 0, updated = 0, subjects = 0;
  ctx.update(s => {
    for (const sub of subs) {
      const code = sub.code;
      if (sub.addSubject && code && !s.subjects.some(x => cleanCode(x.code) === code)) {
        const year = sub.o.year ? sub.o.year - commence + 1 : Number(s.settings.curYear) || 1;
        s.subjects.push({ id: uid(), year: year > 0 ? year : 1, sem: sub.o.sem || Number(s.settings.curSem) || 1, code, name: '', category: '', cp: sub.o.cp || 10, status: 'In Progress', mark: '', notes: '' });
        subjects++;
      }
      if (sub.mode === 'replace') s.assessments = s.assessments.filter(a => cleanCode(a.code) !== code || (a.score !== '' && a.outOf !== ''));
      for (const r of sub.rows.filter(x => x.include && x.name)) {
        const comment = [r.estimated && r.dueText ? `Outline: ${r.dueText}` : '', r.threshold ? 'Must pass this item' : ''].filter(Boolean).join(' · ');
        const same = sub.mode === 'merge' && s.assessments.find(a => cleanCode(a.code) === code && a.name.trim().toLowerCase() === r.name.trim().toLowerCase());
        if (same) { Object.assign(same, { weight: r.weight, type: r.type, due: r.due || same.due, comment: same.comment || comment }); updated++; }
        else { s.assessments.push({ id: uid(), code, name: r.name, type: r.type, weight: r.weight, score: '', outOf: '', due: r.due, comment, est: '' }); added++; }
      }
    }
  });
  return { added, updated, subjects };
}
