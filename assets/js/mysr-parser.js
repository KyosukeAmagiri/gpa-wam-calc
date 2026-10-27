// Parses the text of a MySR "Subject Results" page (from a PDF text layer or OCR)
// into subject rows plus the program summary. Tolerant of OCR slips such as O/0
// swaps, doubled letters and rows split across a page break.

const SEASONS = [
  [/^autumn$/i, 1, 'Autumn'], [/^spring$/i, 2, 'Spring'], [/^summer[ab]?$/i, 3, 'Summer'], [/^winter$/i, 4, 'Winter'],
  [/^1h$/i, 1, '1H'], [/^2h$/i, 2, '2H'],
];
const KNOWN_GRADES = new Set(['HD', 'H', 'D', 'DN', 'C', 'CR', 'P', 'PS', 'PC', 'F', 'FF', 'FN', 'FW', 'AF', 'TF', 'WF', 'S', 'U', 'W', 'WN', 'AW', 'CT', 'EX', 'I', 'IN', 'NC', 'AD', 'X']);
const MARK_GRADES = /^(HD|D|DN|C|CR|P|PS|F)$/i;
const FAIL_GRADES = new Set(['F', 'FF', 'FN', 'FW', 'AF', 'TF', 'WF', 'U']);
const WITHDRAWN_GRADES = new Set(['W', 'WN', 'AW']);
const UNCOUNTED_GRADES = new Set(['S', 'U', 'CT', 'EX', 'W', 'WN', 'AW', 'I', 'IN', 'NC', 'AD', 'X']);
const TICKS = /^(v|vv|V|VV|✓|✔|J|\/|\||y|Y|«|¥|w)$/;
// OCR reads the "included in GPA" tick as all sorts of short junk (Vv, Jv, Ni, V4). Nothing else follows the CP column,
// so a short non-number there is the tick.
const isTickJunk = t => t.length <= 3 && !/^\d{1,3}(\.\d+)?$/.test(t);

const L2D = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', i: '1', '|': '1', '!': '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', g: '9', T: '7' };
const D2L = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z', 6: 'G', 4: 'A' };

// Turn an OCR'd token into a subject code like ACCT3007, or '' if it isn't one.
export function normaliseCode(tok, known) {
  const t = String(tok).replace(/[^A-Za-z0-9|!]/g, '');
  if (t.length < 8 || t.length > 10) return '';
  const letters = t.slice(0, 4).split('').map(c => D2L[c] || c).join('').toUpperCase();
  if (!/^[A-Z]{4}$/.test(letters)) return '';
  const restRaw = t.slice(4);
  if ((restRaw.match(/\d/g) || []).length < 3) return '';
  let digits = restRaw.split('').map(c => L2D[c] ?? c).join('');
  if (!/^\d+$/.test(digits)) return '';
  if (digits.length > 4) {
    const tail = digits.slice(-4), head = digits.slice(0, 4);
    digits = known && known(letters + tail) ? tail : known && known(letters + head) ? head : digits[0] === '0' ? tail : head;
  }
  if (digits.length !== 4) return '';
  return letters + digits;
}

export function normaliseGrade(tok) {
  const t = String(tok || '').replace(/[^A-Za-z]/g, '');
  const up = t.toUpperCase();
  if (!up) return '';
  if (KNOWN_GRADES.has(up)) return up === 'H' ? 'HD' : up;
  if (up.length === 2 && up[0] === up[1] && KNOWN_GRADES.has(up[0])) return up[0] === 'H' ? 'HD' : up[0];
  if (KNOWN_GRADES.has(up[0]) && /[a-z]/.test(t.slice(1))) return up[0] === 'H' ? 'HD' : up[0];
  return '';
}

function seasonOf(tok) {
  const t = String(tok).replace(/[^A-Za-z0-9]/g, '');
  for (const [re, sem, name] of SEASONS) if (re.test(t)) return { sem, name };
  return null;
}

const isJunkLine = l => /https?:|www\.|Banner Page|BannerExtensibility|^\s*\d{1,2}\/\d{1,2}\/\d{4}/i.test(l);

export function parseMySR(text, { known } = {}) {
  const lines = String(text).replace(/\r/g, '').split('\n').map(l => l.replace(/ /g, ' ').trimEnd()).filter(l => l.trim());
  const startIdx = lines.findIndex(l => /SUBJECT\s+CODE|SUBJECT\s+TITLE/i.test(l));
  const endIdx = lines.findIndex((l, i) => i > startIdx && /PROGRAM\s+SUMMARY|Please note:/i.test(l));
  const from = startIdx >= 0 ? startIdx + 1 : 0;
  const to = endIdx >= 0 ? endIdx : lines.length;

  // anchors: lines inside the table that hold a subject code. Transcripts often put the year and session on a
  // heading line above their rows, so those carry down to rows that lack their own.
  const anchors = [];
  let ctxYear = null, ctxSeason = null;
  const headings = new Set();
  for (let i = from; i < to; i++) {
    const toks = lines[i].trim().split(/\s+/);
    let found = false;
    for (let k = 0; k < toks.length; k++) {
      let code = normaliseCode(toks[k], known);
      let span = 1;
      if (!code && k + 1 < toks.length && /^[A-Za-z0-9]{4}$/.test(toks[k]) && /^[0-9OoIl]{4}$/.test(toks[k + 1])) { code = normaliseCode(toks[k] + toks[k + 1], known); span = 2; }
      if (code) {
        const yearTok = toks.slice(0, k).find(x => /^(19|20)\d{2}$/.test(x));
        if (!yearTok && startIdx < 0 && !ctxYear) continue;
        anchors.push({ i, k, span, code, toks, yearTok, ctxYear, ctxSeason });
        found = true;
        break;
      }
    }
    if (!found && !isJunkLine(lines[i])) {
      const y = lines[i].match(/\b(19|20)\d{2}\b/), sz = toks.map(seasonOf).find(Boolean);
      if (y && toks.length <= 6) { ctxYear = +y[0]; ctxSeason = sz || null; headings.add(i); }
      else if (sz && toks.length <= 4) { ctxSeason = sz; headings.add(i); }
    }
  }

  const rows = anchors.map((a, n) => {
    const nextI = n + 1 < anchors.length ? anchors[n + 1].i : to;
    // fix O/l slips inside short numbers ("1O" → "10") so marks and CP still read as numbers
    const after = a.toks.slice(a.k + a.span).filter(t => !TICKS.test(t)).map(t => (/^[\dOoIl]{2,3}$/.test(t) && /\d/.test(t) ? t.replace(/[OoIl]/g, c => L2D[c]) : t));
    // transcripts often put the mark before the grade ("78 D 10", "71 C"): move the grade in front of the numbers, as MySR has it
    const isN = t => /^\d{1,3}(\.\d+)?$/.test(t);
    const gk = [after.length - 1, after.length - 2].find(k => k > 0 && KNOWN_GRADES.has(after[k]) && isN(after[k - 1]) && after.slice(k + 1).every(isN));
    if (gk !== undefined) {
      let s = gk;
      while (s > 0 && isN(after[s - 1])) s--;
      if (!(s > 0 && KNOWN_GRADES.has(after[s - 1]))) after.splice(s, 0, after.splice(gk, 1)[0]);
    }
    while (after.length > 1 && isTickJunk(after[after.length - 1]) && /^\d{1,3}(\.\d+)?$/.test(after[after.length - 2])) after.pop();
    let season = a.toks.slice(0, a.k).map(seasonOf).find(Boolean) || (a.yearTok ? null : a.ctxSeason) || null;
    let year = a.yearTok ? +a.yearTok : a.ctxYear || null;
    const cont = [];
    for (let j = a.i + 1; j < nextI; j++) {
      const l = lines[j];
      if (isJunkLine(l) || headings.has(j)) continue;
      const toks = l.trim().split(/\s+/).filter(t => !TICKS.test(t) && /[A-Za-z]/.test(t));
      const sIdx = toks.findIndex(t => seasonOf(t));
      if (sIdx >= 0 && !season) { season = seasonOf(toks[sIdx]); toks.splice(sIdx, 1); }
      if (!year) { const y = l.match(/\b(19|20)\d{2}\b/); if (y) year = +y[0]; }
      const words = toks.filter(t => /^[A-Za-z&(),.'’-]+$/.test(t) && !/^[-–—>]+$/.test(t));
      if (words.length && !/^(-|–|—|>)/.test(l.trim())) cont.push(words.join(' '));
    }
    // trailing numbers: mark and CP
    const nums = [];
    while (after.length && /^\d{1,3}(\.\d+)?$/.test(after[after.length - 1]) && nums.length < 2) nums.unshift(+after.pop());
    let mark = '', cp = '';
    if (nums.length === 2) [mark, cp] = nums;
    else if (nums.length === 1) cp = nums[0];
    let grade = '', gradeRaw = '';
    if (after.length) {
      const g = normaliseGrade(after[after.length - 1]);
      if (g && after[after.length - 1].length <= 3) { grade = g; gradeRaw = after.pop(); }
      else if (nums.length === 1 && after.length > 1 && after[after.length - 1].length <= 3 && MARK_GRADES.test(after[after.length - 2])) {
        // a graded row whose mark OCR couldn't read ("71" → "Val"): keep the grade and leave the mark blank so the review flags it
        after.pop(); gradeRaw = after.pop(); grade = normaliseGrade(gradeRaw);
      }
    }
    const title = [after.join(' '), ...cont].join(' ').replace(/\s+/g, ' ').trim();
    if (mark !== '' && (mark > 100 || mark < 0)) mark = '';
    if (cp !== '' && cp > 60) { if (mark === '') { mark = cp <= 100 ? cp : ''; } cp = ''; }
    const status = !grade && mark === '' ? 'In Progress'
      : FAIL_GRADES.has(grade) ? 'Failed'
        : WITHDRAWN_GRADES.has(grade) ? 'Withdrawn'
          : grade === 'CT' ? 'Credit Transfer'
            : UNCOUNTED_GRADES.has(grade) || cp === 0 ? 'Exempt' : 'Completed';
    const counted = status === 'Completed' || status === 'Failed';
    return { code: a.code, year, season: season ? season.name : '', sem: season ? season.sem : '', title, grade, gradeRaw, mark, cp, status, counted, line: lines[a.i] };
  });

  const all = lines.join('\n');
  const num = re => { const m = all.match(re); return m ? +m[1] : null; };
  // MySR prints the GPA to 3 places; OCR sometimes drops the point ("5526") or reads it as a comma.
  const GPA_NUM = /(?<!\d)(\d)[.,]?(\d{2,3})(?!\d)/;
  const gpaLine = lines.find(l => /^\s*GPA\b/i.test(l) && GPA_NUM.test(l));
  const gm = gpaLine && gpaLine.match(GPA_NUM);
  const gpa = gm ? +`${gm[1]}.${gm[2]}` : null;
  const cpRequired = num(/Total\s+Credit\s+Points\s+Required[^\d\n]*(\d{1,3})/i);
  const cpAchieved = num(/Total\s+Credit\s+Points\s+Achieved[^\d\n]*(\d{1,3})/i);
  let program = '', programCode = '';
  const pl = lines.find(l => /^\s*\d{4}\s*[-–]\s*\S/.test(l) && /(Bachelor|Master|Graduate|Diploma|Doctor|Associate|Juris|Undergraduate|Certificate|Honours)/i.test(l));
  if (pl) {
    const m = pl.trim().match(/^(\d{4})\s*[-–]\s*(.+)$/);
    programCode = m[1];
    program = m[2].split(/\s{3,}/)[0].replace(/\s+[A-Z@©®]{1,3}$/, '').trim();
  }
  const looksLikeMySR = /Subject\s+Results/i.test(all) || startIdx >= 0;
  return { rows, gpa, cpRequired, cpAchieved, program, programCode, looksLikeMySR };
}

// Group positioned text items (from a PDF text layer) into reading-order lines.
export function itemsToLines(items) {
  const parts = items.filter(it => it.str && it.str.trim()).map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 10 }));
  parts.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const p of parts) {
    const ln = lines.find(l => Math.abs(l.y - p.y) <= Math.max(2, Math.min(l.h, p.h) * 0.45));
    if (ln) ln.items.push(p); else lines.push({ y: p.y, h: p.h, items: [p] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map(l => {
    l.items.sort((a, b) => a.x - b.x);
    let out = '', end = null;
    for (const it of l.items) {
      if (end !== null) out += it.x - end > it.h * 1.2 ? '    ' : it.x - end > it.h * 0.15 ? ' ' : '';
      out += it.s;
      end = it.x + it.w;
    }
    return out;
  });
}
