// Reads a WSU Subject Outline (Learning Guide) PDF's text: the subject details, the Assessment Summary table, each
// item's details block, and the teaching-weeks calendar, so an item due "in the exam period" or "Week 7" still gets
// a date. Pure text in, plain data out; the dialog in import-outline.js does the rest.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SEASON_SEM = { autumn: 1, spring: 2, summer: 3, winter: 4 };
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const real = (y, m, d) => { const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? t : null; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function guessType(name, format = '') {
  const n = norm(name), f = norm(format);
  const has = (re, s = n) => re.test(s);
  if (has(/\bparticipation|attendance|engagement|tutorial (work|activit)/)) return 'Participation';
  if (has(/\bexam|examination\b/)) return 'Exam';
  if (has(/\bquiz|test\b/)) return has(/\bmid ?semester|midterm/) ? 'Exam' : 'Quiz';
  if (has(/\bpresentation|pitch|viva|oral\b/)) return 'Presentation';
  if (has(/\bthesis|dissertation\b/)) return 'Thesis';
  if (has(/\blab|practical\b/)) return 'Lab';
  if (has(/\breport\b/)) return 'Report';
  if (has(/\bproject|portfolio\b/)) return 'Project';
  if (has(/\bexam\b/, f)) return 'Exam';
  return 'Assignment';
}

// The teaching calendar, e.g. "Week 120-07-2026Week 227-07-2026…" (week number and Monday run together).
function teachingWeeks(text) {
  const weeks = new Map();
  for (const m of text.matchAll(/Week\s*(\d{1,2}?)\s*(\d{2})[-/.](\d{2})[-/.](\d{4})/g)) {
    const d = real(+m[4], +m[3], +m[2]);
    if (d && !weeks.has(+m[1])) weeks.set(+m[1], d);
  }
  // keep only a run that really is weekly, so stray dates elsewhere don't sneak in
  const nums = [...weeks.keys()].sort((a, b) => a - b);
  for (const n of nums) {
    const prev = weeks.get(n - 1);
    if (prev && Math.abs((weeks.get(n) - prev) / 86400000 - 7) > 1) weeks.delete(n);
  }
  return weeks;
}

/** Turns a due-date cell into a date. Returns { due: 'YYYY-MM-DD' or '', estimated, how }. */
export function parseDue(raw, ctx = {}) {
  const t = String(raw || '').trim(), low = t.toLowerCase();
  const year = ctx.year || new Date().getFullYear();
  let m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = real(y, +m[2], +m[1]);
    if (d) return { due: iso(d), estimated: false, how: 'date' };
  }
  m = low.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/)
    || low.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?/);
  if (m) {
    const [day, mon] = /^\d/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]];
    const d = real(m[3] ? +m[3] : year, MONTHS.indexOf(mon) + 1, day);
    if (d) return { due: iso(d), estimated: false, how: 'date' };
  }
  const weekday = WEEKDAYS.findIndex(w => low.includes(w));
  m = low.match(/\bweek\s*(\d{1,2})\b/);
  if (m && ctx.weeks?.get(+m[1])) return { due: iso(addDays(ctx.weeks.get(+m[1]), weekday >= 0 ? weekday : 4)), estimated: weekday < 0, how: `Week ${m[1]}` };
  if (/exam(ination)? period|formal exam|final exam|examination/.test(low) && ctx.examStart) return { due: iso(ctx.examStart), estimated: true, how: 'exam period' };
  if (ctx.schedWeek && ctx.weeks?.get(ctx.schedWeek)) return { due: iso(addDays(ctx.weeks.get(ctx.schedWeek), 4)), estimated: true, how: `Week ${ctx.schedWeek}` };
  return { due: '', estimated: false, how: '' };
}

export function parseOutline(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, ''));
  const joined = lines.join('\n');
  const cells = l => l.trim().split(/\s{3,}|\t+/).map(c => c.trim()).filter(Boolean);
  const isWeight = c => /^\d{1,3}(?:\.\d+)?\s*%$/.test(c);
  const out = { code: '', name: '', cp: '', season: '', year: '', sem: '', items: [], weeks: 0, examStart: '', warnings: [] };

  // ----- subject details -----
  let m = joined.match(/Subject Code:\s*([A-Z]{4}\s?\d{4})/);
  if (!m) {
    const counts = {};
    for (const x of joined.matchAll(/\b([A-Z]{4})\s?(\d{4})\b/g)) counts[x[1] + x[2]] = (counts[x[1] + x[2]] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) m = [null, top[0]];
  }
  if (m) out.code = m[1].replace(/\s/g, '');
  m = joined.match(/Subject Name:\s*(.+)/) || (out.code && joined.match(new RegExp(`${out.code}\\s+([A-Z][^\\n]{3,80}?)(?:\\s+(?:Autumn|Spring|Summer|Winter)\\b|\\n)`)));
  if (m) out.name = m[1].replace(/\s{2,}.*$/, '').trim();
  m = joined.match(/Credit Points:\s*(\d{1,2})/);
  if (m) out.cp = +m[1];
  m = joined.match(/\b(Autumn|Spring|Summer|Winter)\s+(20\d{2})\b/);
  if (m) { out.season = m[1]; out.year = +m[2]; out.sem = SEASON_SEM[m[1].toLowerCase()]; }

  // ----- calendar -----
  const weeks = teachingWeeks(joined);
  out.weeks = weeks.size;
  const topicWeeks = [...joined.matchAll(/Week\s(\d{1,2}):/g)].map(x => +x[1]);
  const lastTopic = topicWeeks.length ? Math.max(...topicWeeks) : 0;
  const examStart = lastTopic && weeks.get(lastTopic + 1);
  if (examStart) out.examStart = iso(examStart);
  // "Assessment Due- Participation- … - Professional Task- …": what is due in each teaching week, in order
  const dueRow = lines.find(l => /^Assessment Due\b/i.test(l.trim()));
  const sched = dueRow ? dueRow.trim().replace(/^Assessment Due\s*-?\s*/i, '').split(/\s*-\s+/).map(norm) : [];
  const schedWeek = name => {
    const n = norm(name);
    if (!n || sched.length > Math.max(weeks.size, 20)) return 0;
    for (let i = sched.length - 1; i >= 0; i--) if (sched[i] && (sched[i] === n || sched[i].includes(n) || n.includes(sched[i]))) return i + 1;
    return 0;
  };
  const ctx = { year: out.year, weeks, examStart };

  // ----- each item's details block: "3.2.2 Professional Task" then "Weight: 45%", "Due: …" -----
  const details = [];
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].trim().match(/^\d+\.\d+\.\d+\s+(.{2,80})$/);
    if (!h) continue;
    const block = lines.slice(i + 1, i + 14).join('\n');
    const w = block.match(/^\s*Weight:\s*(\d{1,3}(?:\.\d+)?)\s*%/m);
    if (!w) continue;
    const due = block.match(/^\s*Due:\s*(.+)$/m);
    details.push({ name: h[1].trim(), weight: +w[1], dueText: due ? due[1].replace(/\s{3,}.*/, '').trim() : '',
      format: (block.match(/^\s*Format:\s*(.+)$/m) || [])[1] || '', group: /Type of Collaboration:\s*Group/i.test(block), threshold: /Threshold Detail:/i.test(block) });
  }

  // ----- the Assessment Summary table -----
  const rows = [];
  const head = lines.findIndex(l => /\bItem\b/i.test(l) && /\bWeight\b/i.test(l) && /\bDue\b/i.test(l));
  if (head >= 0) {
    const header = cells(lines[head]);
    for (let i = head + 1; i < lines.length && i < head + 40; i++) {
      const l = lines[i].trim();
      if (/^(Feedback on Assessment|Assessment Details|=== page)/i.test(l) && rows.length) break;
      const c = cells(l);
      const wi = c.findIndex(isWeight);
      if (wi < 1) continue;
      const tail = c.slice(wi + 2);
      rows.push({ name: c.slice(0, wi).join(' '), weight: parseFloat(c[wi]), dueText: c[wi + 1] || '',
        threshold: header.some(h => /threshold/i.test(h)) && tail[tail.length - 1] === 'Yes' });
    }
  }

  // ----- merge: the summary table first, details fill the gaps -----
  const base = rows.length ? rows : details.map(d => ({ name: d.name, weight: d.weight, dueText: d.dueText, threshold: d.threshold }));
  for (const r of base) {
    const d = details.find(x => norm(x.name) === norm(r.name)) || details.find(x => norm(x.name).includes(norm(r.name)) || norm(r.name).includes(norm(x.name)));
    const dueText = (d && d.dueText && d.dueText.length > r.dueText.length ? d.dueText : r.dueText) || (d ? d.dueText : '');
    const when = parseDue(dueText, { ...ctx, schedWeek: schedWeek(r.name) });
    out.items.push({
      name: r.name, weight: r.weight, type: guessType(r.name, d ? d.format : ''), dueText, due: when.due, estimated: when.estimated, how: when.how,
      threshold: r.threshold || (d ? d.threshold : false), group: d ? d.group : false,
    });
  }
  const total = out.items.reduce((s, x) => s + (x.weight || 0), 0);
  out.total = Math.round(total * 100) / 100;
  if (!out.items.length) out.warnings.push('No assessment table was found.');
  else if (Math.abs(total - 100) > 0.5) out.warnings.push(`The weights add up to ${out.total}%, not 100%.`);
  return out;
}
