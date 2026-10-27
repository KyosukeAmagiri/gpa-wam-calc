// Backups and exports: JSON (full restore), CSV and a dependency-free .xlsx writer.
import { download, todayISO, toast } from './ui.js';
import { sessionName, termLabel } from './engine.js';

const stamp = () => todayISO();

export function exportJSON(state) {
  const payload = { app: 'gpa-wam-calculator', exportedAt: new Date().toISOString(), state };
  download(`gpa-wam-backup-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Backup downloaded. Keep it somewhere safe.', 'good');
}

const r2 = x => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const blank = v => (v === '' || v === null || v === undefined ? '' : v);

function subjectRows(E) {
  const head = ['Year', 'Sem', 'Session', 'Code', 'Subject', 'Category', 'CP', 'Status', 'Mark entered', 'Mark used', 'Grade', 'Grade point', 'Quality points', 'Cumulative WAM', 'Cumulative GPA', 'Notes'];
  const rows = E.ledger.map(r => [blank(r.year), blank(r.sem), r.term === '' ? '' : sessionName(r.term, E.S.commenceYear), r.code, r.name, r.category, blank(r.cp), r.status,
    blank(r.markIn), r2(blank(r.mark)), r.grade, blank(r.gp), r.cnt ? r2(r.qp) : '', r2(blank(r.cumWAM)), r2(blank(r.cumGPA)), r.notes]);
  return [head, ...rows];
}
function assessmentRows(E) {
  const head = ['Code', 'Subject', 'Assessment', 'Type', 'Weight %', 'Score', 'Out of', 'Percent', 'Weighted', 'Grade', 'Due', 'Status', 'Estimate?', 'Comment'];
  const rows = E.assessments.map(a => [a.code, a.subject, a.name, a.type, blank(a.weight), blank(a.score), blank(a.outOf), a.pct === '' ? '' : r2(a.pct * 100),
    r2(blank(a.weighted)), a.grade, a.dueStr, a.statusText.replace(/^\S+\s/, ''), a.est || 'Auto', a.comment]);
  return [head, ...rows];
}

// ---------- CSV ----------
const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
export function exportSubjectsCSV(E) { download(`subjects-${stamp()}.csv`, toCSV(subjectRows(E)), 'text/csv;charset=utf-8'); }
export function exportAssessmentsCSV(E) { download(`assessments-${stamp()}.csv`, toCSV(assessmentRows(E)), 'text/csv;charset=utf-8'); }

// ---------- XLSX ----------
const xmlEsc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

function sheetXML(rows, widths) {
  const body = rows.map((row, ri) => `<row r="${ri + 1}">${row.map((v, ci) => {
    const ref = `${colName(ci)}${ri + 1}`;
    const style = ri === 0 ? ' s="1"' : '';
    if (v === '' || v === null || v === undefined) return ri === 0 ? `<c r="${ref}"${style}/>` : '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}${ri ? (Number.isInteger(v) ? '' : ' s="2"') : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = widths && widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body}</sheetData></worksheet>`;
}
const autoWidths = rows => rows[0].map((_, c) => Math.min(48, Math.max(8, ...rows.map(r => String(r[c] ?? '').length + 2))));

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9D2235"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function buildXLSX(sheets) {
  const files = [];
  const add = (name, text) => files.push({ name, data: new TextEncoder().encode(text) });
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXML(s.rows, s.widths || autoWidths(s.rows))));
  return zipStore(files);
}

// Minimal ZIP (stored, no compression) with CRC-32.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = d => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = new TextEncoder().encode(f.name);
    const crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function exportXLSX(state, E) {
  const { m, S } = E;
  const s = state.settings;
  const summary = [
    ['Measure', 'Value'],
    ['Student', s.studentName || ''], ['Program', s.program || ''], ['Institution', s.institution || ''], ['Exported', new Date().toLocaleString('en-AU')],
    ['Overall WAM', r2(m.WAM)], ['Overall GPA', Math.round(m.GPA * 1000) / 1000], ['Classification', m.CLASS.name],
    ['Credit points completed', m.CP_DONE], ['Total credit points', S.totalCP], ['Subjects completed', m.SUBJ_DONE], ['Subjects in progress', m.SUBJ_IP], ['Subjects planned', m.SUBJ_PLAN],
    ['High Distinctions', m.N_HD], ['Highest mark', m.MARK_N ? m.MARK_MAX : ''], ['Lowest mark', m.MARK_N ? m.MARK_MIN : ''], ['Mark std deviation', r2(m.MARK_SD)],
    ['Target WAM', S.targetWAM], ['Needed average on remaining CP', r2(m.NEED_AVG_WAM)], ['Projected finish (trend)', r2(m.FORECAST_FINAL)],
    ['Monte Carlo median final WAM', r2(E.mc.p50)], ['Chance of First Class (%)', r2(E.mc.pFC * 100)], ['Chance of target WAM (%)', r2(E.mc.pTarget * 100)],
  ];
  const terms = [['Term', 'Session', 'Subjects', 'CP counted', 'Term WAM', 'Term GPA', 'Cumulative WAM', 'Cumulative GPA'],
    ...E.activeTerms.map(t => [termLabel(t.key), t.session, t.n, t.cp, r2(t.wam), r2(t.gpa), r2(t.cumWAM), r2(t.cumGPA)])];
  const bands = [['Min mark', 'Max mark', 'Grade', 'GPA (4.0)', 'GPA (7.0)', 'Description'], ...E.bands.map(b => [b.min, b.max, b.grade, b.gp4, b.gp7, b.desc])];
  const blob = buildXLSX([
    { name: 'Summary', rows: summary, widths: [34, 44] },
    { name: 'Subjects', rows: subjectRows(E) },
    { name: 'Assessments', rows: assessmentRows(E) },
    { name: 'Terms', rows: terms },
    { name: 'Grade bands', rows: bands },
  ]);
  download(`gpa-wam-${stamp()}.xlsx`, blob);
  toast('Excel workbook downloaded', 'good');
}

export { buildXLSX };
