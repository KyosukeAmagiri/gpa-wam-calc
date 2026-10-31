// Rendering helpers: escaped HTML templates, formatting, modals, toasts, grade colours.

export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s ?? ''));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const renderVal = v => (v === null || v === undefined || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(renderVal).join('') : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += renderVal(v) + strings[i + 1]; });
  return new Raw(out);
}

export const isNum = v => typeof v === 'number' && Number.isFinite(v);
const r = (x, d) => Math.sign(x) * Math.round(Math.abs(x) * 10 ** d + 1e-9) / 10 ** d;
export const fmt = (x, d = 1, dash = '—') => (isNum(x) ? r(x, d).toFixed(d) : dash);
export const fmtPct = (x, d = 0, dash = '—') => (isNum(x) ? r(x * 100, d).toFixed(d) + '%' : dash);
export const fmtSigned = (x, d = 1) => (isNum(x) ? (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(r(x, d)).toFixed(d) : '—');
export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d + 'T00:00:00');
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-AU', opts);
};
export const todayISO = () => { const t = new Date(); return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

// ---------- colour ----------
const toGam = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function oklch(L, C, h) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const c = x => Math.round(Math.min(1, Math.max(0, toGam(x))) * 255).toString(16).padStart(2, '0');
  return '#' + c(rr) + c(g) + c(bb);
}
export const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const isDark = () => document.documentElement.dataset.resolvedTheme === 'dark';

// Ordinal crimson ramp for passing grades (validated light and dark); fails stay neutral.
// --g/--gi follow the theme; --gp/--gpi are the light colours that print uses.
export function gradeStyle(bands, idx, passMark = 50) {
  if (idx === '' || idx === undefined || !bands[idx]) return '';
  const b = bands[idx];
  if (b.max < passMark) return `--g:${isDark() ? '#5d5557' : '#7d7375'};--gi:#fff;--gp:#7d7375;--gpi:#fff`;
  const passing = bands.filter(x => x.max >= passMark).sort((p, q) => p.min - q.min);
  const k = passing.indexOf(b), n = passing.length;
  const t = n <= 1 ? 1 : k / (n - 1);
  const pill = dark => {
    const L = dark ? 0.48 + 0.32 * t : 0.70 - 0.32 * t;
    return [oklch(L, dark ? 0.14 : 0.15, 18), L > 0.66 ? '#1b1718' : '#ffffff'];
  };
  const [hex, ink] = pill(isDark()), [printHex, printInk] = pill(false);
  return `--g:${hex};--gi:${ink};--gp:${printHex};--gpi:${printInk}`;
}
export function gradePill(E, bandIdx, label) {
  if (bandIdx === '' || bandIdx === undefined) return html`<span class="muted">—</span>`;
  return html`<span class="gpill" style="${gradeStyle(E.bands, bandIdx, E.S.passMark)}">${label ?? E.bands[bandIdx].grade}</span>`;
}
export function gradePillFor(E, mark) {
  const i = E.helpers.bandIdx(mark);
  return gradePill(E, i);
}

export const SERIES = {
  light: ['#9d2235', '#3077ad', '#e19b1b', '#1f9b82'],
  dark: ['#d55661', '#5399d1', '#c6841b', '#32a88e'],
};
export const series = i => (isDark() ? SERIES.dark : SERIES.light)[i % 4];

// ---------- toasts ----------
export function toast(msg, kind = 'info', ms = 3200) {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('role', 'status'); document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- modal ----------
export function openModal({ title, body, actions = [], wide = false, onMount, dismissable = true }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = html`<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
    <header class="modal-head"><h2>${title}</h2>${dismissable ? html`<button class="icon-btn" data-close aria-label="Close">${icon('x')}</button>` : ''}</header>
    <div class="modal-body"></div>
    <footer class="modal-foot"></footer></div>`.s;
  const bodyEl = wrap.querySelector('.modal-body');
  if (body instanceof Node) bodyEl.appendChild(body); else bodyEl.innerHTML = String(body ?? '');
  const foot = wrap.querySelector('.modal-foot');
  const close = () => { wrap.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(() => wrap.remove(), 200); };
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = `btn ${a.kind || ''}`;
    b.textContent = a.label;
    if (a.id) b.id = a.id;
    b.addEventListener('click', async () => { const keep = a.onClick ? await a.onClick(close, wrap) : false; if (keep !== true) close(); });
    foot.appendChild(b);
  });
  if (!actions.length) foot.remove();
  const onKey = e => { if (e.key === 'Escape' && dismissable) close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => { if (dismissable && (e.target === wrap || e.target.closest('[data-close]'))) close(); });
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  onMount && onMount(wrap, close);
  const first = wrap.querySelector('input, select, textarea, button.primary');
  first && setTimeout(() => first.focus(), 50);
  return { el: wrap, close };
}

export function confirmDialog(title, message, confirmLabel = 'Confirm', danger = false) {
  return new Promise(resolve => {
    openModal({
      title, body: html`<p class="lede">${message}</p>`.s,
      actions: [
        { label: 'Cancel', onClick: () => resolve(false) },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => resolve(true) },
      ],
    });
  });
}

// ---------- icons (inline, stroke-based) ----------
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5Z"/><path d="M8 7h7M8 11h5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  insights: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/><circle cx="8.5" cy="15.5" r="1.2"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  sort: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
};
export const icon = (name, size = 18) => raw(`<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);

// Status chip: icon + label, never colour alone.
export const chip = (text, kind = 'neutral') => html`<span class="chip chip-${kind}">${text}</span>`;
export const statusKind = s => ({ Completed: 'good', 'In Progress': 'info', Planned: 'neutral', Failed: 'critical', Withdrawn: 'muted', Exempt: 'muted', 'Credit Transfer': 'muted' }[s] || 'neutral');

// True inside the iPhone app build, where the page runs in a native wrapper.
export const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.();

// Apps cannot download files, so the iPhone app writes the file to its cache and opens the share sheet
// (Save to Files, AirDrop, Mail and so on) instead.
async function shareNative(filename, blob) {
  const { Filesystem, Share } = window.Capacitor.Plugins;
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: 'CACHE' });
  await Share.share({ title: filename, files: [uri] });
}

export function download(filename, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  if (isNativeApp() && window.Capacitor.Plugins?.Filesystem && window.Capacitor.Plugins?.Share) {
    shareNative(filename, blob).catch(err => { if (!/cancel/i.test(String(err && err.message))) toast(`Could not share ${filename}: ${err.message || err}`, 'error'); });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function meter(value, { max = 1, kind = 'brand', label = '' } = {}) {
  const p = isNum(value) && max ? Math.max(0, Math.min(1, value / max)) : 0;
  return html`<div class="meter meter-${kind}" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${isNum(value) ? value : 0}" aria-label="${label}"><span style="width:${(p * 100).toFixed(1)}%"></span></div>`;
}
