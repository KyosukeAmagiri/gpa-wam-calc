// MySR results import: reads the PDF in the browser (text layer first, OCR fallback),
// then shows a review table before anything touches the saved record.
import { html, icon, openModal, toast, fmt, esc } from './ui.js';
import { parseMySR, itemsToLines } from './mysr-parser.js';
import { STATUSES, normaliseSettings } from './engine.js';
import { uid } from './state.js';

const V = p => new URL(`../../vendor/${p}`, import.meta.url).href;
let pdfjsPromise = null;
let tessPromise = null;

function loadPdfJs() {
  pdfjsPromise = pdfjsPromise || import(V('pdfjs/pdf.min.js')).then(lib => { lib.GlobalWorkerOptions.workerSrc = V('pdfjs/pdf.worker.min.js'); return lib; });
  return pdfjsPromise;
}
function loadTesseract() {
  tessPromise = tessPromise || new Promise((resolve, reject) => {
    if (window.Tesseract) { resolve(window.Tesseract); return; }
    const s = document.createElement('script');
    s.src = V('tesseract/tesseract.min.js');
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('Could not load the OCR engine.'));
    document.head.appendChild(s);
  });
  return tessPromise;
}

// Every page's text as lines, without OCR (subject outlines always carry a text layer).
export async function pdfLines(file) {
  const pdfjs = await loadPdfJs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  } catch (e) {
    throw new Error(e && e.name === 'PasswordException' ? 'This PDF is password protected.' : 'That file could not be read as a PDF.');
  }
  const lines = [];
  for (let p = 1; p <= Math.min(doc.numPages, 40); p++) lines.push(...itemsToLines((await (await doc.getPage(p)).getTextContent()).items));
  return lines.join('\n');
}

async function readFile(file, onProgress, known) {
  const isImage = /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
  let text = '', source = 'text';
  const canvases = [];
  if (!isImage) {
    onProgress(0.04, 'Opening PDF…');
    const pdfjs = await loadPdfJs();
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('This PDF is password protected. Print the MySR page to PDF again without a password.');
      throw new Error('That file could not be read as a PDF.');
    }
    const pages = Math.min(doc.numPages, 12);
    const lines = [];
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      lines.push(...itemsToLines(tc.items));
      onProgress(0.04 + 0.08 * p / pages, `Reading page ${p} of ${pages}…`);
    }
    text = lines.join('\n');
    const parsed = parseMySR(text, { known });
    if (parsed.rows.length) return { text, source: 'text', parsed, pages };
    // No usable text layer (e.g. "Microsoft Print to PDF" draws text as shapes): render and OCR.
    source = 'ocr';
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 3 });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      canvases.push(c);
      onProgress(0.12 + 0.08 * p / pages, `Preparing page ${p} of ${pages} for text recognition…`);
    }
  } else {
    source = 'ocr';
    // Screenshot text is small; doubling it (within a size cap) roughly halves the misread digits.
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('That image could not be opened. Try a PNG or JPG screenshot.'); }
    const k = Math.max(1, Math.min(2, 4000 / bmp.width, Math.sqrt(16e6 / (bmp.width * bmp.height))));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    canvases.push(c);
  }
  onProgress(0.2, 'Loading the text recogniser (first time only, about 10 MB)…');
  const T = await loadTesseract();
  let current = 0;
  const worker = await T.createWorker('eng', 1, {
    workerPath: V('tesseract/worker.min.js'), corePath: V('tesseract/core/'), langPath: V('tesseract/lang'), gzip: true,
    logger: m => {
      if (m.status === 'recognizing text') onProgress(0.3 + 0.68 * (current + m.progress) / canvases.length, `Recognising text on page ${current + 1} of ${canvases.length}… ${Math.round(m.progress * 100)}%`);
      else if (/loading/.test(m.status)) onProgress(0.2 + 0.1 * (m.progress || 0), 'Loading the text recogniser…');
    },
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const out = [];
    for (current = 0; current < canvases.length; current++) {
      const { data } = await worker.recognize(canvases[current]);
      out.push(data.text);
    }
    text = out.join('\n');
  } finally {
    await worker.terminate();
  }
  return { text, source, image: isImage, parsed: parseMySR(text, { known }), pages: canvases.length };
}

// ---------- dialog ----------
export function openImportDialog(app) {
  const body = document.createElement('div');
  body.innerHTML = html`
    <p class="lede">Bring your results in straight from MySR. The file is read on this device and never uploaded.</p>
    <div class="howto">
      <div><b>Step 1</b>Log in to MySR and open <i>My Results</i> → Subject Results.</div>
      <div><b>Step 2</b>Pick your program from the drop-down so every subject shows.</div>
      <div><b>Step 3</b>Print the page (Ctrl/⌘ P) and choose <i>Save as PDF</i>.</div>
      <div><b>Step 4</b>Drop that PDF below. A screenshot of the table works too.</div>
    </div>
    <label class="drop mt" id="drop" tabindex="0">
      ${icon('upload', 28)}<b>Drop your MySR results PDF here</b><br><span class="muted">or click to choose a file · PDF, PNG or JPG</span>
      <input type="file" id="pdf-input" accept="application/pdf,.pdf,image/png,image/jpeg,image/webp" hidden>
    </label>
    <details class="paste" id="paste-box">
      <summary>Or paste the text from MySR instead</summary>
      <p class="note">On MySR's Subject Results page, select the whole results table (and the program summary under it), copy, and paste it here. Text copied from an unofficial transcript works too. Rows without credit points come in as 10 CP, and you can check every row before anything is saved.</p>
      <textarea class="input" id="paste-text" rows="7" spellcheck="false" aria-label="Pasted MySR results" placeholder="2024   Autumn   ACCT1001   Accounting Information for Managers   D   78   10"></textarea>
      <div class="row mt-s"><button class="btn primary sm" type="button" id="paste-go">${icon('list', 15)}Read pasted text</button><span class="muted" id="paste-msg" role="status" aria-live="polite"></span></div>
    </details>
    <div class="progress hidden" id="prog"><div class="bar-o"><span></span></div><p></p></div>`.s;
  const modal = openModal({ title: 'Import results from MySR', body, wide: true });
  const drop = body.querySelector('#drop'), input = body.querySelector('#pdf-input'), prog = body.querySelector('#prog');
  const setProg = (p, msg) => { prog.classList.remove('hidden'); prog.querySelector('span').style.width = `${Math.round(p * 100)}%`; prog.querySelector('p').textContent = msg; };
  const known = c => !!app.lookupName(c);
  let busy = false;
  const handle = async file => {
    if (!file || busy) return;
    busy = true;
    drop.classList.add('hidden');
    try {
      const res = await readFile(file, setProg, known);
      setProg(1, 'Done');
      if (!res.parsed.rows.length) {
        prog.querySelector('p').innerHTML = html`<span class="chip chip-warning">No subjects found</span> ${res.parsed.looksLikeMySR ? 'This looks like a MySR page, but no result rows could be read.' : "This doesn't look like the MySR Subject Results page."} Check you printed the Subject Results table with your program selected, or add subjects by hand.`.s;
        drop.classList.remove('hidden');
        busy = false;
        return;
      }
      modal.close();
      openReview(app, res);
    } catch (err) {
      console.error(err);
      prog.querySelector('p').textContent = err.message || 'Something went wrong reading that file.';
      drop.classList.remove('hidden');
      busy = false;
    }
  };
  input.addEventListener('change', () => handle(input.files[0]));
  body.querySelector('#paste-go').addEventListener('click', () => {
    const text = body.querySelector('#paste-text').value;
    const msg = body.querySelector('#paste-msg');
    if (!text.trim()) { msg.textContent = 'Paste your results into the box first.'; return; }
    const parsed = parseMySR(text, { known });
    if (!parsed.rows.length) { msg.textContent = 'No subject codes with a year were found. Copy the whole results table, including the year and session columns.'; return; }
    parsed.rows.forEach(r => { if (r.cp === '' && r.status !== 'Exempt') r.cp = 10; });
    modal.close();
    openReview(app, { text, source: 'paste', parsed });
  });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => handle(e.dataTransfer.files[0]));
}

function openReview(app, res) {
  const state = app.getState();
  const S = normaliseSettings(state.settings);
  const P = res.parsed;
  const years = P.rows.map(r => r.year).filter(Boolean);
  let commence = years.length ? Math.min(...years) : S.commenceYear;
  const rows = P.rows.map(r => ({ ...r, include: r.status !== 'Exempt' || r.cp > 0, name: app.lookupName(r.code) || r.title }));
  const hadSubjects = state.subjects.length > 0;
  let mode = 'merge';
  let applyProgram = !!(P.program || P.cpRequired);

  const bandOf = mark => S.bands.find(x => Math.round(mark * 100) / 100 >= x.min && Math.round(mark * 100) / 100 <= x.max);
  const gpOf = mark => { const b = bandOf(mark); return b ? (S.gpaScale === 4 ? b.gp4 : b.gp7) : 0; };
  // a mark outside its MySR grade's band is almost always a misread digit
  const bandGrades = new Set(S.bands.map(b => b.grade));
  const markOff = r => bandGrades.has(r.grade) && (r.mark === '' || bandOf(r.mark)?.grade !== r.grade);
  const recon = () => {
    const c = rows.filter(r => r.include && (r.status === 'Completed' || r.status === 'Failed') && r.mark !== '' && r.cp);
    const cp = c.reduce((s, r) => s + r.cp, 0);
    const doneCP = rows.filter(r => r.include && ['Completed', 'Credit Transfer', 'Exempt'].includes(r.status)).reduce((s, r) => s + (r.cp || 0), 0);
    return { n: rows.filter(r => r.include).length, cp, doneCP, wam: cp ? c.reduce((s, r) => s + r.mark * r.cp, 0) / cp : null, gpa: cp ? c.reduce((s, r) => s + gpOf(r.mark) * r.cp, 0) / cp : null };
  };
  const termOf = r => (r.year && r.sem ? `Y${r.year - commence + 1} S${r.sem}` : '—');

  const body = document.createElement('div');
  const paint = () => {
    const rc = recon();
    const gpaOK = P.gpa !== null && rc.gpa !== null && Math.abs(rc.gpa - P.gpa) < 0.0006;
    const cpOK = P.cpAchieved !== null && rc.doneCP === P.cpAchieved;
    body.innerHTML = html`
      <div class="recon">
        <div><span>Subjects found</span><b>${P.rows.length}</b> <span class="muted" style="display:inline">· ${rc.n} selected</span></div>
        <div><span>GPA · MySR vs calculated</span><b>${P.gpa === null ? '—' : fmt(P.gpa, 3)}</b> <span class="muted" style="display:inline">vs ${rc.gpa === null ? '—' : fmt(rc.gpa, 3)}</span> ${P.gpa === null ? '' : gpaOK ? html`<span class="chip chip-good">✓ match</span>` : html`<span class="chip chip-warning">⚠ check</span>`}</div>
        <div><span>Credit points achieved</span><b>${P.cpAchieved ?? '—'}</b> <span class="muted" style="display:inline">vs ${rc.doneCP}</span> ${P.cpAchieved === null ? '' : cpOK ? html`<span class="chip chip-good">✓ match</span>` : html`<span class="chip chip-warning">⚠ check</span>`}</div>
        <div><span>WAM from these results</span><b>${rc.wam === null ? '—' : fmt(rc.wam, 2)}</b></div>
      </div>
      ${res.source === 'ocr' ? html`<div class="callout info" style="margin-bottom:12px">${icon('sparkle')}<span>${res.image ? 'This is an image' : 'This PDF had no selectable text'}, so it was read with on-device text recognition. Check the codes and marks below before importing, especially any marked “mark?”; everything is editable.</span></div>` : ''}
      <div class="grid-form" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-bottom:14px">
        <label class="field"><span>Commencing year (Year 1)</span><input class="input" id="rv-commence" value="${commence}" inputmode="numeric"><small>${esc(`${years.length ? `Earliest term in the PDF is ${Math.min(...years)}` : ''}`)}</small></label>
        <label class="field"><span>Import mode</span><select class="select" id="rv-mode">
          <option value="merge" ${mode === 'merge' ? 'selected' : ''}>Merge: update matching subjects, add the rest</option>
          <option value="replace" ${mode === 'replace' ? 'selected' : ''}>Replace all my subjects with these</option></select>
          <small>${hadSubjects ? `You have ${state.subjects.length} subject(s) saved. Assessments are kept either way.` : 'Nothing saved yet.'}</small></label>
        ${P.program || P.cpRequired ? html`<div class="field"><span>Program details</span><label class="check"><input type="checkbox" id="rv-prog" ${applyProgram ? 'checked' : ''}><span>Use ${P.program ? `“${P.program}”` : ''}${P.program && P.cpRequired ? ' and ' : ''}${P.cpRequired ? `${P.cpRequired} total CP` : ''}</span></label></div>` : ''}
      </div>
      <div class="tbl-wrap" style="max-height:48vh;overflow:auto;border:1px solid var(--line);border-radius:12px"><table class="tbl edit">
        <thead><tr><th class="c"><input type="checkbox" id="rv-all" ${rows.every(r => r.include) ? 'checked' : ''} aria-label="Select all"></th><th>MySR term</th><th>Study term</th><th>Code</th><th>Subject</th><th class="c">MySR grade</th><th class="n">Mark</th><th class="n">CP</th><th>Status</th></tr></thead>
        <tbody>${rows.map((r, i) => html`<tr>
          <td class="c"><input type="checkbox" data-i="${i}" data-f="include" ${r.include ? 'checked' : ''} aria-label="Include ${r.code}"></td>
          <td class="ro nowrap">${r.year || '?'} ${r.season || html`<span class="chip chip-warning">term?</span>`}</td>
          <td class="ro nowrap strong">${termOf(r)}</td>
          <td><input class="cell code" style="width:100px" data-i="${i}" data-f="code" value="${r.code}"></td>
          <td class="ro" style="min-width:200px">${r.name}${!app.lookupName(r.code) ? html` <span class="chip chip-muted">not in WSU list</span>` : ''}</td>
          <td class="ro c nowrap">${r.grade || html`<span class="muted">—</span>`}${markOff(r) ? html` <span class="chip chip-warning" title="This mark doesn't fit the ${r.grade} grade">mark?</span>` : ''}</td>
          <td><input class="cell n" style="width:64px" data-i="${i}" data-f="mark" value="${r.mark}" inputmode="decimal"></td>
          <td><input class="cell n" style="width:56px" data-i="${i}" data-f="cp" value="${r.cp}" inputmode="decimal"></td>
          <td><select class="cell" style="width:126px" data-i="${i}" data-f="status">${STATUSES.map(st => html`<option ${st === r.status ? 'selected' : ''}>${st}</option>`)}</select></td>
        </tr>`)}</tbody></table></div>
      <p class="note mt-s">Rows marked “not counted in GPA” on MySR (like the Academic Integrity Module) come in as Exempt, so they never move your WAM. Summer terms map to semester 3, so 2024 Summer becomes Y1 S3 when you commenced in 2024.</p>`.s;
    body.querySelector('#rv-commence').addEventListener('change', e => { const v = parseInt(e.target.value, 10); if (v > 1900 && v < 2200) commence = v; paint(); });
    body.querySelector('#rv-mode').addEventListener('change', e => { mode = e.target.value; });
    body.querySelector('#rv-prog')?.addEventListener('change', e => { applyProgram = e.target.checked; });
    body.querySelector('#rv-all').addEventListener('change', e => { rows.forEach(r => { r.include = e.target.checked; }); paint(); });
    body.querySelectorAll('[data-i]').forEach(el => el.addEventListener('change', () => {
      const r = rows[+el.dataset.i], f = el.dataset.f;
      if (f === 'include') r.include = el.checked;
      else if (f === 'code') { r.code = el.value.replace(/\s/g, '').toUpperCase(); r.name = app.lookupName(r.code) || r.title; }
      else if (f === 'mark' || f === 'cp') { const n = el.value.trim() === '' ? '' : Number(el.value); r[f] = Number.isFinite(n) ? n : ''; }
      else if (f === 'status') r.status = el.value;
      paint();
    }));
  };
  paint();
  openModal({
    title: `Review ${P.rows.length} results from MySR`, body, wide: true,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Import results', kind: 'primary', onClick: () => {
          const chosen = rows.filter(r => r.include && r.code);
          if (!chosen.length) { toast('Select at least one subject to import.'); return true; }
          const out = applyImport(app, chosen, { commence, mode, applyProgram, P });
          toast(`Imported ${chosen.length} subject(s): ${out.added} added, ${out.updated} updated.`, 'good', 4500);
          app.go('dashboard');
          return false;
        },
      },
    ],
  });
}

function applyImport(app, chosen, { commence, mode, applyProgram, P }) {
  let added = 0, updated = 0;
  app.update(s => {
    s.settings.commenceYear = commence;
    if (applyProgram) {
      if (P.program) s.settings.program = P.program;
      if (P.cpRequired) s.settings.totalCP = P.cpRequired;
    }
    // MySR lists this term's enrolments as in progress, so the earliest of them is the current study period
    const ipKeys = chosen.filter(r => r.status === 'In Progress' && r.year >= commence && r.sem).map(r => (r.year - commence + 1) * 10 + r.sem);
    if (ipKeys.length) { const k = Math.min(...ipKeys); s.settings.curYear = Math.floor(k / 10); s.settings.curSem = k % 10; }
    if (mode === 'replace') s.subjects = [];
    for (const r of chosen) {
      const year = r.year ? r.year - commence + 1 : '';
      const sem = r.sem || '';
      const rec = { year, sem, code: r.code, cp: r.cp === '' ? '' : r.cp, status: r.status, mark: r.status === 'Exempt' ? '' : r.mark, notes: r.status === 'Exempt' && r.grade ? `MySR grade ${r.grade} · not counted in GPA` : '' };
      const same = s.subjects.find(x => x.code === r.code && Number(x.year) === year && Number(x.sem) === sem);
      const open = s.subjects.find(x => x.code === r.code && (x.status === 'Planned' || x.status === 'In Progress' || !x.status));
      const target = same || open;
      if (target) { Object.assign(target, { ...rec, notes: target.notes || rec.notes }); updated++; }
      else { s.subjects.push({ id: uid(), name: '', category: '', ...rec }); added++; }
    }
    const key = x => (x.year === '' || x.sem === '' ? 999 : Number(x.year) * 10 + Number(x.sem));
    s.subjects = s.subjects.map((x, i) => [x, i]).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(p => p[0]);
  });
  return { added, updated };
}
