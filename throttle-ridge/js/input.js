// Keyboard and multi-touch input. Both are always active, so touch laptops
// can use either; touch buttons are shown automatically on touch devices.

const KEYMAP = {
  ArrowUp: 'gas', KeyW: 'gas',
  ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'back', KeyA: 'back',
  ArrowRight: 'fwd', KeyD: 'fwd',
};

export function createInput({ onRestart, onPause, onMute, onAnyInput }) {
  const keys = new Set();
  const touches = new Map(); // pointerId -> action
  const buttons = {};
  const root = document.getElementById('touch');
  root.querySelectorAll('[data-act]').forEach(el => { buttons[el.dataset.act] = el; });

  window.addEventListener('keydown', (e) => {
    onAnyInput?.();
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === 'KeyR') onRestart?.();
    if (e.code === 'Escape' || e.code === 'KeyP') onPause?.();
    if (e.code === 'KeyM') onMute?.();
  });
  window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
  window.addEventListener('blur', () => { keys.clear(); touches.clear(); refresh(); });

  // Touch: track each pointer and which button is under it, so fingers can
  // slide between buttons and several can be held at once.
  const actAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const b = el && el.closest && el.closest('[data-act]');
    return b ? b.dataset.act : null;
  };
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    onAnyInput?.();
    touches.set(e.pointerId, actAt(e.clientX, e.clientY));
    try { root.setPointerCapture(e.pointerId); } catch (_) {}
    refresh();
    e.preventDefault();
  };
  const move = (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, actAt(e.clientX, e.clientY));
    refresh();
  };
  const up = (e) => { touches.delete(e.pointerId); refresh(); };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('lostpointercapture', up);

  function refresh() {
    const active = new Set(touches.values());
    for (const [act, el] of Object.entries(buttons)) el.classList.toggle('on', active.has(act));
  }

  function held(act) {
    if (keys.has(act)) return true;
    for (const a of touches.values()) if (a === act) return true;
    return false;
  }

  function state() {
    const lean = (held('fwd') ? 1 : 0) - (held('back') ? 1 : 0);
    return { throttle: held('gas') ? 1 : 0, brake: held('brake') ? 1 : 0, lean };
  }

  function clear() { keys.clear(); touches.clear(); refresh(); }

  return { state, clear, _touches: touches };
}

export function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
}
