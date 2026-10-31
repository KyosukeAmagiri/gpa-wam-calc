// Makes the fixtures for the iOS build's Siri check (see "Check what Siri says" in .github/workflows/ios.yml):
//   sample-summary.json  what the web app hands to Siri for the sample student
//   sim-expected.json    what-if answers worked out by the web engine itself, which Siri's Swift maths must match
// Run from the repository root:  node ios-app/native/test/make-sample.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// just enough of a browser for the modules to load
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, innerWidth: 400, location: { hash: '' } };
globalThis.document = { addEventListener() {}, querySelector: () => null, getElementById: () => null, documentElement: { dataset: {} } };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const load = p => import(pathToFileURL(join(root, p)).href);
const { sampleState } = await load('assets/js/state.js');
const { compute, cleanCode } = await load('assets/js/engine.js');
const { widgetSummary } = await load('assets/js/native.js');

const base = sampleState();
base.prefs.siriStyle = 'encouraging';
base.prefs.siriAbout = 'Aiming for honours. I work 20 hours a week.';
const E0 = compute(base);
writeFileSync(join(here, 'sample-summary.json'), JSON.stringify(widgetSummary(E0, base.prefs), null, 1) + '\n');

const clone = () => JSON.parse(JSON.stringify(base));
const pass = E0.S.passMark;
const finish = (st, code, mark) => {
  const rows = st.subjects.filter(x => cleanCode(x.code) === code);
  const r = rows.find(x => x.status !== 'Completed' && x.status !== 'Failed') || rows[rows.length - 1];
  r.mark = mark; r.status = mark >= pass ? 'Completed' : 'Failed';
};
const metrics = st => { const m = compute(st).m; return { wam: m.WAM, gpa: m.GPA, cpToWAM: m.CP_TO_WAM, needAvg: m.CP_TO_WAM > 0 ? m.NEED_AVG_WAM : null }; };
const cases = [];

// finishing subjects on a mark, in progress, planned (failed), and a completed one changed after the fact
for (const changes of [[['ACCT3001', 85]], [['ACCT3001', 85], ['FINC3014', 70]], [['BUSM3001', 45]], [['ECON2002', 60]]]) {
  const st = clone();
  for (const [code, mark] of changes) finish(st, code, mark);
  cases.push({ kind: 'subjects', changes, ...metrics(st) });
}

// one assessment mark, then the whole subject finished with the rest on the same mark
{
  const code = 'ACCT3001', item = 'Final exam', mark = 70;
  const one = clone();
  one.assessments.find(a => cleanCode(a.code) === code && a.name === item).score = mark;
  one.assessments.find(a => cleanCode(a.code) === code && a.name === item).outOf = 100;
  const average = compute(one).tracker.find(t => t.code === code).sofar;
  const all = clone();
  for (const a of all.assessments.filter(x => cleanCode(x.code) === code && x.score === '')) { a.score = mark; a.outOf = 100; }
  all.subjects.find(x => cleanCode(x.code) === code).status = 'Completed';
  cases.push({ kind: 'assessment', code, item, mark, average, ...metrics(all) });
}

// averaging a mark across everything left
{
  const st = clone(), avg = 75;
  for (const r of st.subjects.filter(x => x.status !== 'Completed' && x.status !== 'Failed')) { r.mark = avg; r.status = 'Completed'; }
  cases.push({ kind: 'average', average: avg, ...metrics(st) });
}

// the lowest final mark that brings the WAM to a target, found by bisection on the engine itself
{
  const code = 'ACCT3001', target = 78.5;
  let lo = 0, hi = 100;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2, st = clone(); finish(st, code, mid); if (compute(st).m.WAM >= target) hi = mid; else lo = mid; }
  cases.push({ kind: 'needed', code, target, mark: hi });
}

writeFileSync(join(here, 'sim-expected.json'), JSON.stringify(cases, null, 1) + '\n');
console.log(`${cases.length} what-if cases from the web engine`);
for (const c of cases) console.log(JSON.stringify(c));
