// Phones and tablets: swipe in from the left edge to pull the menu open, swipe left to push it closed.
// The menu follows the finger and snaps open or shut on release.
const EDGE = 24; // px from the left edge where an opening swipe can start

export function enableMenuGestures() {
  const side = document.getElementById('side');
  const narrow = () => window.innerWidth <= 980; // checked per swipe, matching the CSS breakpoint where the menu slides in
  const isOpen = () => document.body.classList.contains('nav-open');
  const width = () => side.getBoundingClientRect().width || 272;
  let drag = null;

  document.addEventListener('touchstart', e => {
    if (!narrow() || e.touches.length !== 1 || document.querySelector('.modal-wrap, .pal-wrap')) return;
    const t = e.touches[0];
    if (!isOpen() && t.clientX > EDGE) return;
    drag = { x: t.clientX, y: t.clientY, open: isOpen(), dx: 0, decided: false, horizontal: false };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!drag) return;
    const t = e.touches[0], dx = t.clientX - drag.x, dy = t.clientY - drag.y;
    if (!drag.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.decided = true;
      // only clearly sideways movement drives the menu, so vertical scrolling is never hijacked
      drag.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2 && (drag.open ? dx < 0 : dx > 0);
      if (!drag.horizontal) { drag = null; return; }
      side.classList.add('dragging');
    }
    drag.dx = dx;
    const w = width();
    side.style.transform = `translateX(${drag.open ? Math.min(0, dx) : Math.min(0, dx - w)}px)`;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  const end = () => {
    if (!drag) return;
    const { open, dx, horizontal } = drag;
    drag = null;
    if (!horizontal) return;
    side.classList.remove('dragging');
    side.style.transform = '';
    const far = Math.abs(dx) > Math.min(60, width() * 0.3);
    document.body.classList.toggle('nav-open', open ? !far : far);
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
}
