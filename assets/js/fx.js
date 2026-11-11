// Small visual effects: a glow that follows the cursor across cards, and a burst of confetti for good news.
// Both stay off when the reader has asked for reduced motion.
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

// Cards read --mx/--my (see .card in app.css) to place a soft highlight under the pointer.
export function enableSpotlight(root = document) {
  if (calm.matches || !window.matchMedia('(hover: hover)').matches) return;
  let last = null;
  root.addEventListener('pointermove', e => {
    const card = e.target.closest && e.target.closest('.card');
    if (last && last !== card) { last.style.removeProperty('--mx'); last.style.removeProperty('--my'); }
    last = card;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

export function confetti({ count = 110, ms = 2200 } = {}) {
  if (calm.matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  const colours = ['#9d2235', '#e06e78', '#e0a526', '#f3dde1', '#ffffff', '#3077ad'];
  const bits = Array.from({ length: count }, (_, i) => {
    const left = i % 2 === 0; // two cannons, one in each bottom corner
    const angle = (left ? -Math.PI / 3 : -2 * Math.PI / 3) + (Math.random() - 0.5) * 0.9, speed = 9 + Math.random() * 11;
    return { x: left ? 0 : c.width, y: c.height, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, w: 6 + Math.random() * 6, h: 3 + Math.random() * 5,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, c: colours[i % colours.length] };
  });
  const t0 = performance.now();
  const step = now => {
    const k = (now - t0) / ms;
    g.clearRect(0, 0, c.width, c.height);
    if (k >= 1) { c.remove(); return; }
    g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    for (const b of bits) {
      b.vy += 0.32; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => c.remove(), ms + 400); // in case the tab is hidden and frames stop
}
