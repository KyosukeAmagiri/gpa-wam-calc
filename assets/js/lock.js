// Face ID lock (iPhone app only, Settings → iPhone app): the app opens behind a cover that Face ID, Touch ID or the
// phone's passcode lifts, and locks again after a minute in the background. The app also hides its contents in the
// app switcher while the lock is on (see MainViewController.swift).
import { html, icon, isNativeApp, nativePlugin } from './ui.js';

const RELOCK_AFTER = 60000;
let locked = false, hiddenAt = 0;

export function initLock(getState) {
  if (!isNativeApp()) return;
  const on = () => getState().prefs.faceLock === true;
  setPrivacyShield(on()); // the native side forgets between launches
  if (on()) lock();
  document.addEventListener('visibilitychange', () => {
    if (!on()) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER) lock();
  });
}

function cover() {
  let el = document.getElementById('app-lock');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'GPA & WAM is locked');
    el.innerHTML = html`<div class="lock-box"><span class="brand-mark" aria-hidden="true">W</span><h2>GPA &amp; WAM is locked</h2>
      <p class="muted" id="lock-msg">Unlock with Face ID to see your marks.</p>
      <button class="btn primary" type="button" id="lock-btn">${icon('shield')}Unlock</button></div>`.s;
    el.querySelector('#lock-btn').addEventListener('click', () => unlock());
    document.body.appendChild(el);
  }
  return el;
}

export async function lock() {
  if (locked) return;
  locked = true;
  cover();
  document.body.classList.add('is-locked');
  await unlock();
}

async function unlock() {
  const ok = await confirmIdentity('Unlock your marks');
  if (ok) {
    locked = false;
    document.body.classList.remove('is-locked');
    document.getElementById('app-lock')?.remove();
  } else {
    const msg = document.getElementById('lock-msg');
    if (msg) msg.textContent = 'Not unlocked. Tap Unlock to try again.';
  }
  return ok;
}

// Face ID, Touch ID or the passcode. Resolves true when the owner confirmed it.
export async function confirmIdentity(reason) {
  const bridge = nativePlugin('WidgetBridge');
  if (!bridge) return false;
  try { const r = await bridge.authenticate({ reason }); return !!(r && r.ok); } catch (e) { return false; }
}

// "Face ID", "Touch ID", "Optic ID" or "" when the phone has none set up.
export async function biometryName() {
  const bridge = nativePlugin('WidgetBridge');
  if (!bridge) return '';
  try { const r = await bridge.biometry(); return { faceID: 'Face ID', touchID: 'Touch ID', opticID: 'Optic ID' }[r && r.type] || ''; } catch (e) { return ''; }
}

// Tells the app whether to hide its contents in the app switcher.
export function setPrivacyShield(on) {
  nativePlugin('WidgetBridge')?.setLock({ on }).catch(() => {});
}
