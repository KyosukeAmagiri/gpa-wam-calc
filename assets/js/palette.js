// Command palette (Ctrl/⌘ K): find any page, subject or action by typing, then run it with Enter.
import { html, icon } from './ui.js';

let open = null;

// items: [{ label, hint, icon, group, keywords, run }]
export function openPalette(getItems) {
  if (open) { open.input.focus(); return; }
  const items = getItems();
  const wrap = document.createElement('div');
  wrap.className = 'pal-wrap';
  wrap.innerHTML = html`<div class="pal" role="dialog" aria-modal="true" aria-label="Search and commands">
    <div class="pal-in">${icon('search', 18)}<input type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Search pages, subjects and actions"><kbd>Esc</kbd></div>
    <ul class="pal-list" id="pal-list" role="listbox" aria-label="Results"></ul>
    <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> anywhere</span></div>
  </div>`.s;
  const input = wrap.querySelector('input'), list = wrap.querySelector('ul');
  let shown = [], active = 0;
  const lastFocus = document.activeElement;

  const score = (it, words) => {
    const hay = `${it.label} ${it.keywords || ''} ${it.group}`.toLowerCase();
    if (!words.every(w => hay.includes(w))) return -1;
    const label = it.label.toLowerCase();
    return (label.startsWith(words[0] || '') ? 2 : 0) + (label.includes(words.join(' ')) ? 1 : 0);
  };
  const paint = () => {
    const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    shown = items.map(it => ({ it, s: score(it, words) })).filter(x => x.s >= 0)
      .sort((a, b) => b.s - a.s || 0).slice(0, 40).map(x => x.it);
    if (!words.length) shown = items.filter(it => it.group !== 'Subjects').concat(items.filter(it => it.group === 'Subjects').slice(0, 6));
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length ? shown.map((it, i) => html`<li role="option" id="pal-${i}" data-i="${i}" aria-selected="${i === active}" class="${i === active ? 'on' : ''}">
      <span class="pal-ico">${icon(it.icon || 'chevron', 16)}</span><span class="pal-label">${it.label}${it.hint ? html`<small>${it.hint}</small>` : ''}</span><span class="pal-group">${it.group}</span></li>`.s).join('')
      : '<li class="pal-empty">Nothing matches. Try a subject code, a page name or an action like “export”.</li>';
    input.setAttribute('aria-activedescendant', shown.length ? `pal-${active}` : '');
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    wrap.remove();
    open = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  };
  const run = i => { const it = shown[i]; if (!it) return; close(); it.run(); };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
  };
  input.addEventListener('input', () => { active = 0; paint(); });
  list.addEventListener('mousemove', e => { const li = e.target.closest('[data-i]'); if (li && +li.dataset.i !== active) { active = +li.dataset.i; paint(); } });
  list.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) run(+li.dataset.i); });
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(wrap);
  open = { input };
  paint();
  input.focus();
}
