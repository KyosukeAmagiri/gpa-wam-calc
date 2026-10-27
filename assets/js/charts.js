// Lightweight responsive SVG charts with hover tooltips. One y-axis per chart.
import { esc, isNum, fmt } from './ui.js';

const tipEl = () => {
  let t = document.getElementById('chart-tip');
  if (!t) { t = document.createElement('div'); t.id = 'chart-tip'; t.setAttribute('role', 'tooltip'); document.body.appendChild(t); }
  return t;
};
function showTip(html, x, y) {
  const t = tipEl();
  t.innerHTML = html;
  t.classList.add('on');
  const w = t.offsetWidth, h = t.offsetHeight;
  let left = x + 14, top = y - h - 12;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (top < 8) top = y + 16;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${top}px`;
}
function hideTip() { tipEl().classList.remove('on'); }
const tipRow = (color, value, label, line = false) =>
  `<div class="tip-row"><i class="${line ? 'key-line' : 'key-box'}" style="background:${color}"></i><b>${esc(value)}</b><span>${esc(label)}</span></div>`;

function niceTicks(min, max, count = 5) {
  if (!(max > min)) { max = min + 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { ticks, lo, hi, step };
}

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function frame(el, height, padL = 38, padR = 16, padT = 14, padB = 30) {
  const W = Math.max(260, Math.floor(el.clientWidth || el.parentElement?.clientWidth || 600));
  // A .fill box stretches with its card (to match a taller card beside it), but never below the asked height.
  let H = height;
  if (el.classList.contains('fill')) { el.style.minHeight = `${height}px`; H = Math.max(height, Math.floor(el.clientHeight)); }
  return { W, H, x0: padL, x1: W - padR, y0: padT, y1: H - padB };
}

function yAxis(f, ticks, y, fmtTick) {
  return ticks.map(v => `<g class="tick"><line x1="${f.x0}" x2="${f.x1}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
    <text x="${f.x0 - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmtTick(v))}</text></g>`).join('');
}
function xLabels(f, labels, x, maxLabels) {
  const every = Math.max(1, Math.ceil(labels.length / Math.max(1, maxLabels)));
  return labels.map((l, i) => (i % every === 0 ? `<text class="xl" x="${x(i)}" y="${f.y1 + 18}" text-anchor="middle">${esc(l)}</text>` : '')).join('');
}

// Rounded data-end, square baseline column path.
function colPath(x, w, yTop, yBase, r = 4) {
  const h = yBase - yTop;
  if (h <= 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${yBase}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${yBase}Z`;
}
function barPath(xBase, xEnd, y, h, r = 4) {
  const w = xEnd - xBase;
  if (w <= 0.5) return '';
  const rr = Math.min(r, w, h / 2);
  return `M${xBase},${y}H${xEnd - rr}Q${xEnd},${y} ${xEnd},${y + rr}V${y + h - rr}Q${xEnd},${y + h} ${xEnd - rr},${y + h}H${xBase}Z`;
}

function attachHover(el, svg, onMove) {
  svg.addEventListener('pointermove', e => onMove(e, true));
  svg.addEventListener('pointerleave', () => { hideTip(); onMove(null, false); });
}

// ---------- line chart ----------
export function lineChart(el, spec) {
  el._chart = () => lineChart(el, spec);
  const { labels, series, refs = [], height = 260, yFmt = v => fmt(v, 0), valueFmt = v => fmt(v, 1), title = '' } = spec;
  if (!labels.length) { el.innerHTML = `<div class="chart-empty">${esc(spec.empty || 'No data yet')}</div>`; return; }
  const f = frame(el, height, 40, 64);
  const vals = series.flatMap(s => s.values).concat(refs.map(r => r.y)).filter(isNum);
  let min = spec.yMin ?? Math.min(...vals), max = spec.yMax ?? Math.max(...vals);
  const pad = Math.max(1, (max - min) * 0.12);
  if (spec.yMin === undefined) min -= pad;
  if (spec.yMax === undefined) max += pad;
  const { ticks, lo, hi } = niceTicks(min, max, 4);
  const y = v => f.y1 - (v - lo) / (hi - lo) * (f.y1 - f.y0);
  const n = labels.length;
  const x = i => (n === 1 ? (f.x0 + f.x1) / 2 : f.x0 + 10 + i * (f.x1 - f.x0 - 20) / (n - 1));
  const surface = css('--surface');
  let body = yAxis(f, ticks, y, yFmt);
  body += `<line x1="${f.x0}" x2="${f.x1}" y1="${f.y1}" y2="${f.y1}" class="baseline"/>`;
  refs.forEach(r => {
    if (!isNum(r.y)) return;
    body += `<line x1="${f.x0}" x2="${f.x1}" y1="${y(r.y)}" y2="${y(r.y)}" class="ref" stroke="${r.color}"/>`
      + `<text class="ref-label" x="${f.x1 + 6}" y="${y(r.y) + 4}">${esc(r.label)}</text>`;
  });
  series.forEach(s => {
    const pts = s.values.map((v, i) => (isNum(v) ? [x(i), y(v)] : null));
    let d = '', pen = false;
    pts.forEach(p => { if (!p) { pen = false; return; } d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`; pen = true; });
    if (s.area && pts.filter(Boolean).length > 1) {
      const P = pts.filter(Boolean);
      body += `<path d="M${P[0][0]},${f.y1}L${P.map(p => p.join(',')).join('L')}L${P[P.length - 1][0]},${f.y1}Z" fill="${s.color}" opacity="0.08"/>`;
    }
    body += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linecap="round" stroke-linejoin="round" ${s.faint ? 'opacity="0.55"' : ''}/>`;
    if (s.markers !== false) pts.forEach(p => { if (p) body += `<circle cx="${p[0]}" cy="${p[1]}" r="${s.faint ? 2.5 : 3.5}" fill="${s.color}" stroke="${surface}" stroke-width="2"/>`; });
  });
  // direct end labels for up to 4 series, nudged apart only when they would overlap
  const ends = series.filter(s => s.endLabel !== false).map(s => {
    let i = s.values.length - 1; while (i >= 0 && !isNum(s.values[i])) i--;
    return i < 0 ? null : { s, i, yv: y(s.values[i]) };
  }).filter(Boolean).sort((a, b) => a.yv - b.yv);
  const placed = [];
  ends.forEach(e => {
    if (placed.some(p => Math.abs(p - e.yv) < 13)) return;
    placed.push(e.yv);
    body += `<text class="end-label" x="${x(e.i) + 8}" y="${e.yv + 4}">${esc(valueFmt(e.s.values[e.i]))}</text>`;
  });
  body += xLabels(f, labels, x, Math.floor((f.x1 - f.x0) / 64));
  body += `<line class="xhair" x1="0" x2="0" y1="${f.y0}" y2="${f.y1}" visibility="hidden"/>`;
  body += `<rect class="hit" x="${f.x0}" y="${f.y0}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="transparent"/>`;
  el.innerHTML = `<svg class="chart" width="${f.W}" height="${f.H}" viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(title)}">${body}</svg>`;
  const svg = el.querySelector('svg'), xh = svg.querySelector('.xhair');
  attachHover(el, svg, (e, on) => {
    if (!on) { xh.setAttribute('visibility', 'hidden'); return; }
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const dd = Math.abs(x(i) - px); if (dd < bd) { bd = dd; best = i; } }
    xh.setAttribute('x1', x(best)); xh.setAttribute('x2', x(best)); xh.setAttribute('visibility', 'visible');
    const rows = series.filter(s => isNum(s.values[best])).map(s => tipRow(s.color, valueFmt(s.values[best]), s.name, true)).join('');
    const extra = spec.tipExtra ? spec.tipExtra(best) : '';
    showTip(`<div class="tip-title">${esc(labels[best])}</div>${rows}${extra}`, e.clientX, e.clientY);
  });
}

// ---------- column chart (single series, optional per-bar colour) ----------
export function columnChart(el, spec) {
  el._chart = () => columnChart(el, spec);
  const { labels, values, color, colors, height = 240, yFmt = v => fmt(v, 0), valueFmt = v => fmt(v, 1), refs = [], title = '', name = '' } = spec;
  if (!labels.length) { el.innerHTML = `<div class="chart-empty">${esc(spec.empty || 'No data yet')}</div>`; return; }
  const f = frame(el, height, 40, refs.length ? 64 : 16, 20);
  const vals = values.filter(isNum).concat(refs.map(r => r.y).filter(isNum));
  let lo0 = spec.yMin ?? Math.min(0, ...vals), hi0 = spec.yMax ?? Math.max(...vals, 1);
  const { ticks, lo, hi } = niceTicks(lo0, hi0, 4);
  const y = v => f.y1 - (Math.max(lo, v) - lo) / (hi - lo) * (f.y1 - f.y0);
  const n = labels.length, band = (f.x1 - f.x0) / n;
  const bw = Math.min(24, Math.max(6, band * 0.56));
  const xc = i => f.x0 + band * (i + 0.5);
  let body = yAxis(f, ticks, y, yFmt);
  body += `<line x1="${f.x0}" x2="${f.x1}" y1="${f.y1}" y2="${f.y1}" class="baseline"/>`;
  values.forEach((v, i) => {
    if (!isNum(v)) return;
    const c = colors ? colors[i] : color;
    body += `<path class="mark" data-i="${i}" d="${colPath(xc(i) - bw / 2, bw, y(v), f.y1)}" fill="${c}"/>`;
    if (spec.labelValues !== false && band > 26) body += `<text class="cap" x="${xc(i)}" y="${y(v) - 6}" text-anchor="middle">${esc(valueFmt(v))}</text>`;
  });
  refs.forEach(r => {
    if (!isNum(r.y)) return;
    body += `<line x1="${f.x0}" x2="${f.x1}" y1="${y(r.y)}" y2="${y(r.y)}" class="ref" stroke="${r.color}"/><text class="ref-label" x="${f.x1 + 6}" y="${y(r.y) + 4}">${esc(r.label)}</text>`;
  });
  body += xLabels(f, labels, xc, Math.floor((f.x1 - f.x0) / 54));
  values.forEach((v, i) => { body += `<rect class="hit" data-i="${i}" x="${f.x0 + band * i}" y="${f.y0}" width="${band}" height="${f.y1 - f.y0}" fill="transparent"/>`; });
  el.innerHTML = `<svg class="chart" width="${f.W}" height="${f.H}" viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(title)}">${body}</svg>`;
  const svg = el.querySelector('svg');
  attachHover(el, svg, (e, on) => {
    svg.querySelectorAll('.mark').forEach(m => m.classList.remove('hover'));
    if (!on) return;
    const hit = e.target.closest('.hit');
    if (!hit) { hideTip(); return; }
    const i = +hit.dataset.i;
    svg.querySelector(`.mark[data-i="${i}"]`)?.classList.add('hover');
    const c = colors ? colors[i] : color;
    const extra = spec.tipExtra ? spec.tipExtra(i) : '';
    showTip(`<div class="tip-title">${esc(labels[i])}</div>${tipRow(c, isNum(values[i]) ? valueFmt(values[i]) : '—', name)}${extra}`, e.clientX, e.clientY);
  });
}

// ---------- stacked columns (e.g. Monte Carlo histogram) ----------
export function stackedColumns(el, spec) {
  el._chart = () => stackedColumns(el, spec);
  const { labels, stacks, height = 260, yFmt = v => `${fmt(v * 100, 0)}%`, valueFmt = v => `${fmt(v * 100, 1)}%`, title = '' } = spec;
  if (!labels.length) { el.innerHTML = `<div class="chart-empty">${esc(spec.empty || 'No data yet')}</div>`; return; }
  const f = frame(el, height, 44, 14, 14);
  const totals = labels.map((_, i) => stacks.reduce((s, st) => s + (st.values[i] || 0), 0));
  const { ticks, lo, hi } = niceTicks(0, Math.max(...totals, 0.01), 4);
  const y = v => f.y1 - (v - lo) / (hi - lo) * (f.y1 - f.y0);
  const n = labels.length, band = (f.x1 - f.x0) / n;
  const bw = Math.min(24, Math.max(4, band - 2));
  const xc = i => f.x0 + band * (i + 0.5);
  const surface = css('--surface');
  let body = yAxis(f, ticks, y, yFmt);
  body += `<line x1="${f.x0}" x2="${f.x1}" y1="${f.y1}" y2="${f.y1}" class="baseline"/>`;
  labels.forEach((_, i) => {
    let acc = 0;
    const segs = stacks.map(st => ({ v: st.values[i] || 0, c: st.color })).filter(s => s.v > 0);
    segs.forEach((s, k) => {
      const yb = y(acc), yt = y(acc + s.v);
      const top = k === segs.length - 1;
      const d = top ? colPath(xc(i) - bw / 2, bw, yt, yb) : `M${xc(i) - bw / 2},${yb}V${yt}H${xc(i) + bw / 2}V${yb}Z`;
      body += `<path class="mark" data-i="${i}" d="${d}" fill="${s.c}"/>`;
      if (!top) body += `<line x1="${xc(i) - bw / 2}" x2="${xc(i) + bw / 2}" y1="${yt}" y2="${yt}" stroke="${surface}" stroke-width="2"/>`;
      acc += s.v;
    });
  });
  body += xLabels(f, labels, xc, Math.floor((f.x1 - f.x0) / 48));
  labels.forEach((_, i) => { body += `<rect class="hit" data-i="${i}" x="${f.x0 + band * i}" y="${f.y0}" width="${band}" height="${f.y1 - f.y0}" fill="transparent"/>`; });
  el.innerHTML = `<svg class="chart" width="${f.W}" height="${f.H}" viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(title)}">${body}</svg>`;
  const svg = el.querySelector('svg');
  attachHover(el, svg, (e, on) => {
    svg.querySelectorAll('.mark').forEach(m => m.classList.remove('hover'));
    if (!on) return;
    const hit = e.target.closest('.hit');
    if (!hit) { hideTip(); return; }
    const i = +hit.dataset.i;
    svg.querySelectorAll(`.mark[data-i="${i}"]`).forEach(m => m.classList.add('hover'));
    const rows = stacks.filter(st => st.values[i] > 0).map(st => tipRow(st.color, valueFmt(st.values[i]), st.name)).join('') || '<div class="tip-row"><span>No scenarios</span></div>';
    showTip(`<div class="tip-title">${esc(spec.tipTitle ? spec.tipTitle(i) : labels[i])}</div>${rows}`, e.clientX, e.clientY);
  });
}

// ---------- horizontal bars ----------
export function hbarChart(el, spec) {
  el._chart = () => hbarChart(el, spec);
  const { items, max, valueFmt = v => fmt(v, 1), color, title = '', name = '' } = spec;
  const shown = items.filter(it => isNum(it.value));
  if (!shown.length) { el.innerHTML = `<div class="chart-empty">${esc(spec.empty || 'No data yet')}</div>`; return; }
  const rowH = 30, labelW = Math.min(150, Math.max(70, ...shown.map(it => it.label.length * 7.2)));
  const f = { W: Math.max(260, Math.floor(el.clientWidth || 500)), H: shown.length * rowH + 8 };
  const x0 = labelW + 12, x1 = f.W - 56;
  const hi = max ?? Math.max(...shown.map(it => it.value), 1);
  const lo = spec.min ?? 0;
  const x = v => x0 + (Math.max(lo, v) - lo) / (hi - lo || 1) * (x1 - x0);
  let body = `<line x1="${x0}" x2="${x0}" y1="2" y2="${f.H - 6}" class="baseline"/>`;
  shown.forEach((it, i) => {
    const yy = 4 + i * rowH, bh = Math.min(18, rowH - 10);
    body += `<text class="hl" x="${x0 - 10}" y="${yy + bh / 2 + 4}" text-anchor="end">${esc(it.label)}</text>`;
    body += `<path class="mark" data-i="${i}" d="${barPath(x0, x(it.value), yy, bh)}" fill="${it.color || color}"/>`;
    body += `<text class="cap" x="${x(it.value) + 6}" y="${yy + bh / 2 + 4}">${esc(valueFmt(it.value))}</text>`;
    body += `<rect class="hit" data-i="${i}" x="0" y="${yy - 4}" width="${f.W}" height="${rowH}" fill="transparent"/>`;
  });
  el.innerHTML = `<svg class="chart" width="${f.W}" height="${f.H}" viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(title)}">${body}</svg>`;
  const svg = el.querySelector('svg');
  attachHover(el, svg, (e, on) => {
    svg.querySelectorAll('.mark').forEach(m => m.classList.remove('hover'));
    if (!on) return;
    const hit = e.target.closest('.hit');
    if (!hit) { hideTip(); return; }
    const i = +hit.dataset.i, it = shown[i];
    svg.querySelector(`.mark[data-i="${i}"]`)?.classList.add('hover');
    showTip(`<div class="tip-title">${esc(it.label)}</div>${tipRow(it.color || color, valueFmt(it.value), name)}${it.tip ? `<div class="tip-sub">${esc(it.tip)}</div>` : ''}`, e.clientX, e.clientY);
  });
}

export function legend(items, kind = 'line') {
  return `<div class="legend">${items.map(it => `<span><i class="${kind === 'line' || it.kind === 'line' ? 'key-line' : 'key-box'}" style="background:${it.color}"></i>${esc(it.label)}</span>`).join('')}</div>`;
}
