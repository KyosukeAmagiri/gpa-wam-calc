// App state: defaults, local persistence and backup/restore.
import { OFFERINGS, PREREQS } from '../data/handbook.js';

const STORAGE_KEY = 'gpawam.state.v1';
export const SCHEMA_VERSION = 1;

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const DEFAULT_BANDS = [
  { min: 0, max: 49.99, grade: 'F', gp4: 0, gp7: 0, desc: 'Fail' },
  { min: 50, max: 64.99, grade: 'P', gp4: 1, gp7: 4, desc: 'Pass' },
  { min: 65, max: 74.99, grade: 'C', gp4: 2, gp7: 5, desc: 'Credit' },
  { min: 75, max: 84.99, grade: 'D', gp4: 3, gp7: 6, desc: 'Distinction' },
  { min: 85, max: 100, grade: 'HD', gp4: 4, gp7: 7, desc: 'High Distinction' },
];

export const DEFAULT_CLASSES = [
  { name: 'First Class', badge: '🏆', min: 80, notes: 'Honours I · HD average' },
  { name: 'Second Class Upper', badge: '🥇', min: 75, notes: 'Honours IIA · Distinction' },
  { name: 'Second Class Lower', badge: '🥈', min: 70, notes: 'Honours IIB' },
  { name: 'Third Class', badge: '🥉', min: 65, notes: 'Credit average' },
  { name: 'Pass', badge: '✅', min: 50, notes: 'Degree awarded' },
  { name: 'At Risk', badge: '⚠️', min: 0, notes: 'Below pass average' },
];

export const DEFAULT_DISC = [
  ['ACCT', 'Accounting'], ['BUSM', 'Business'], ['COMM', 'Communication'], ['COMP', 'Computing'], ['ECON', 'Economics'],
  ['EDUC', 'Education'], ['ENGR', 'Engineering'], ['FINC', 'Finance'], ['HLTH', 'Health'], ['HUMN', 'Humanities'],
  ['LAWS', 'Law'], ['MATH', 'Mathematics & Statistics'], ['NURS', 'Nursing'], ['PSYC', 'Psychology'], ['TEAC', 'Teaching'],
].map(([prefix, label]) => ({ prefix, label }));

export function defaultOfferings() {
  return OFFERINGS.map(([code, name, aut, spr, sum]) => ({ id: uid(), code, name, aut: !!aut, spr: !!spr, sum: !!sum }));
}
export function defaultPrereqs() {
  return PREREQS.map(([subject, rule, opts]) => ({ id: uid(), subject, rule, opts: [opts[0] || '', opts[1] || '', opts[2] || ''] }));
}

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      studentName: '', institution: 'Western Sydney University', program: '', commenceYear: new Date().getFullYear(),
      gpaScale: 7, totalCP: 240, cpPerSem: 40, summerCP: 20, passMark: 50, creditThr: 65, distThr: 75, hdThr: 85,
      targetWAM: 75, targetGPA: 6, countIP: 'No', failCountsCP: 'No', curYear: 1, curSem: 1,
      bands: DEFAULT_BANDS.map(b => ({ ...b })), classes: DEFAULT_CLASSES.map(c => ({ ...c })),
      uniMedalGPA: 6, deansMedalGPA: 6.25, discLabels: DEFAULT_DISC.map(d => ({ ...d })),
    },
    subjects: [],
    assessments: [],
    planner: { seed: 2026, formShift: '', overrides: {}, scenario: [], desired: '', desiredGPA: '', remainingCP: '' },
    prereqs: defaultPrereqs(),
    offerings: defaultOfferings(),
    history: [],
    prefs: { theme: 'system' },
    updatedAt: null,
  };
}

// Fill any missing keys from defaults so older or hand-edited backups still load.
export function normaliseState(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const s = { ...d, ...raw };
  s.settings = { ...d.settings, ...(raw.settings || {}) };
  for (const k of ['bands', 'classes', 'discLabels']) if (!Array.isArray(s.settings[k])) s.settings[k] = d.settings[k];
  s.planner = { ...d.planner, ...(raw.planner || {}) };
  if (!s.planner.overrides || typeof s.planner.overrides !== 'object') s.planner.overrides = {};
  if (!Array.isArray(s.planner.scenario)) s.planner.scenario = [];
  s.prefs = { ...d.prefs, ...(raw.prefs || {}) };
  for (const k of ['subjects', 'assessments', 'history', 'prereqs', 'offerings']) if (!Array.isArray(s[k])) s[k] = d[k];
  s.subjects = s.subjects.map(x => ({ id: x.id || uid(), year: '', sem: '', code: '', name: '', category: '', cp: '', status: '', mark: '', notes: '', target: '', ...x }));
  s.assessments = s.assessments.map(x => ({ id: x.id || uid(), code: '', name: '', type: '', weight: '', score: '', outOf: '', due: '', comment: '', est: '', ...x }));
  s.prereqs = s.prereqs.map(x => ({ id: x.id || uid(), subject: '', rule: 'Pre', ...x, opts: [0, 1, 2].map(i => (x.opts || [])[i] || '') }));
  s.offerings = s.offerings.map(x => ({ id: x.id || uid(), ...x }));
  s.history = s.history.map(x => ({ id: x.id || uid(), ...x }));
  s.version = SCHEMA_VERSION;
  return s;
}

export function loadState() {
  try {
    const txt = localStorage.getItem(STORAGE_KEY);
    if (txt) return { state: normaliseState(JSON.parse(txt)), stored: true };
  } catch (e) { console.warn('Could not read saved data', e); }
  return { state: defaultState(), stored: false };
}

let saveTimer = null, pending = null;
export function saveState(state, onSaved) {
  clearTimeout(saveTimer);
  pending = () => {
    pending = null;
    try {
      state.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      onSaved && onSaved(true);
    } catch (e) {
      console.warn('Could not save', e);
      onSaved && onSaved(false);
    }
  };
  saveTimer = setTimeout(pending, 250);
}
// Writes a waiting save straight away, so closing the tab right after an edit does not lose it.
export function flushSave() {
  if (!pending) return;
  clearTimeout(saveTimer);
  pending();
}
export const STATE_KEY = STORAGE_KEY;

export function clearStored() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }
}

export function storageAvailable() {
  try { const k = '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
}

// Fictional sample record so new visitors can see every feature populated.
export function sampleState() {
  const s = defaultState();
  const yr = new Date().getFullYear();
  Object.assign(s.settings, {
    studentName: 'Alex Sample', program: 'Bachelor of Business (sample data)', commenceYear: yr - 2,
    totalCP: 240, targetWAM: 80, targetGPA: 6.3, curYear: 3, curSem: 1,
  });
  const rows = [
    [1, 1, 'ACCT1001', 'Core', 'Completed', 78], [1, 1, 'ECON1011', 'Core', 'Completed', 71], [1, 1, 'BUSM1001', 'Core', 'Completed', 82], [1, 1, 'MATH1030', 'Core', 'Completed', 88],
    [1, 2, 'FINC2002', 'Core', 'Completed', 74], [1, 2, 'BUSM1006', 'Core', 'Completed', 69], [1, 2, 'ACCT1005', 'Major', 'Completed', 81], [1, 2, 'LAWS1003', 'Elective', 'Completed', 66],
    [2, 1, 'ACCT2001', 'Major', 'Completed', 84], [2, 1, 'FINC2003', 'Major', 'Completed', 77], [2, 1, 'ECON2002', 'Elective', 'Completed', 90], [2, 1, 'BUSM2004', 'Core', 'Completed', 73],
    [2, 2, 'ACCT2005', 'Major', 'Completed', 86], [2, 2, 'FINC3004', 'Major', 'Completed', 79], [2, 2, 'BUSM2005', 'Core', 'Completed', 68], [2, 2, 'ECON1006', 'Elective', 'Completed', 83],
    [3, 1, 'ACCT3001', 'Major', 'In Progress', ''], [3, 1, 'ACCT3003', 'Major', 'In Progress', ''], [3, 1, 'FINC3014', 'Elective', 'In Progress', ''], [3, 1, 'BUSM3001', 'Capstone', 'Planned', ''],
    [3, 2, 'ACCT3006', 'Major', 'Planned', ''], [3, 2, 'ACCT3007', 'Major', 'Planned', ''], [3, 2, 'FINC3002', 'Elective', 'Planned', ''], [3, 2, 'BUSM3002', 'Capstone', 'Planned', ''],
  ];
  s.subjects = rows.map(([year, sem, code, category, status, mark]) => ({ id: uid(), year, sem, code, name: '', category, cp: 10, status, mark, notes: '' }));
  const d = n => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
  const A = (code, name, type, weight, score, outOf, due, est = '') => ({ id: uid(), code, name, type, weight, score, outOf, due, comment: '', est });
  s.assessments = [
    A('ACCT3001', 'Database design report', 'Assignment', 25, 21, 25, d(-30), 'No'),
    A('ACCT3001', 'Practical test', 'Quiz', 15, 11, 15, d(-12), 'No'),
    A('ACCT3001', 'Group project', 'Project', 20, '', '', d(9)),
    A('ACCT3001', 'Final exam', 'Exam', 40, '', '', d(28)),
    A('ACCT3003', 'Case analysis', 'Report', 30, 24, 30, d(-20), 'No'),
    A('ACCT3003', 'Mid-semester test', 'Exam', 20, 13, 20, d(-6), 'No'),
    A('ACCT3003', 'Final exam', 'Exam', 50, '', '', d(30)),
    A('FINC3014', 'Client strategy paper', 'Assignment', 40, 35, 40, d(-15), 'No'),
    A('FINC3014', 'Presentation', 'Presentation', 20, '', '', d(4)),
    A('FINC3014', 'Final exam', 'Exam', 40, '', '', d(32)),
    A('FINC3014', 'Seminar attendance bonus', 'Bonus', 1, 1, 1, '', 'No'),
  ];
  s.history = [
    { id: uid(), date: d(-120), wam: 76.6, gpa: 5.88, cp: 120, cls: 'Second Class Upper', note: 'End of first semester, year 2' },
    { id: uid(), date: d(-20), wam: 77.9, gpa: 6.0, cp: 160, cls: 'Second Class Upper', note: 'Year 2 results released' },
  ];
  s.planner.scenario = [{ id: uid(), label: 'Capstone', cp: 10, target: 82 }, { id: uid(), label: 'Electives', cp: 20, target: 78 }];
  return s;
}
