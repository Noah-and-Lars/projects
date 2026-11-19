// Keyboard, mouse (pointer lock) and touch. The game reads `input` each frame.
export const input = {
  keys: new Set(), pressed: new Set(),
  lookDX: 0, lookDY: 0, wheel: 0,
  mouseDown: false, clicked: false, rclicked: false,
  move: { x: 0, y: 0 }, // touch joystick
  touch: false, locked: false, typing: false,
  sens: 1,
};

export function initInput(canvas, opts) {
  addEventListener('keydown', (e) => {
    if (input.typing) return;
    if (e.code === 'Tab') e.preventDefault();
    // Ctrl+R turns a held piece by 15° (and Ctrl+Shift+R squares it up), not reload
    if (input.locked && (e.ctrlKey || e.metaKey) && e.code === 'KeyR') e.preventDefault();
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('mousedown', (e) => {
    if (input.touch) return;
    if (!input.locked) { opts.wantLock?.(); return; }
    if (e.button === 0) { input.mouseDown = true; input.clicked = true; }
    if (e.button === 2) input.rclicked = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.lookDX += e.movementX; input.lookDY += e.movementY;
  });
  addEventListener('wheel', (e) => { if (input.locked) input.wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) { input.keys.clear(); opts.lockLost?.(); }
  });
}

export function lockPointer(canvas) {
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
}

// On-screen controls for phones and tablets.
export function initTouch(root) {
  input.touch = true;
  root.classList.remove('hidden');
  const stick = root.querySelector('.stick'), knob = root.querySelector('.knob');
  let stickId = null, sx = 0, sy = 0, lookId = null, lx = 0, ly = 0;
  const R = 50;
  const onStart = (e) => {
    for (const t of e.changedTouches) {
      const btn = t.target.closest && t.target.closest('[data-key]');
      if (btn) { const k = btn.dataset.key; if (!input.keys.has(k)) input.pressed.add(k); input.keys.add(k); btn.classList.add('on'); btn._tid = t.identifier; continue; }
      if (t.target.closest && t.target.closest('.ui-touch-skip')) continue;
      if (t.clientX < innerWidth * 0.4 && stickId === null) {
        stickId = t.identifier; sx = t.clientX; sy = t.clientY;
        stick.style.left = sx - 60 + 'px'; stick.style.top = sy - 60 + 'px'; stick.classList.add('on');
      } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  };
  const onMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        let dx = t.clientX - sx, dy = t.clientY - sy; const m = Math.hypot(dx, dy);
        if (m > R) { dx *= R / m; dy *= R / m; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.move.x = dx / R; input.move.y = dy / R;
      } else if (t.identifier === lookId) {
        input.lookDX += (t.clientX - lx) * 2.2; input.lookDY += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY;
      }
    }
    e.preventDefault();
  };
  const onEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; input.move.x = input.move.y = 0; knob.style.transform = ''; stick.classList.remove('on'); }
      if (t.identifier === lookId) lookId = null;
      for (const b of root.querySelectorAll('[data-key]')) if (b._tid === t.identifier) { input.keys.delete(b.dataset.key); b.classList.remove('on'); b._tid = null; }
    }
  };
  root.addEventListener('touchstart', onStart, { passive: false });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', onEnd); root.addEventListener('touchcancel', onEnd);
}

// Game controllers (standard mapping). Sticks move and look; buttons press
// the same keys the keyboard does.
const PAD_KEYS = { 0: 'Space', 1: 'KeyC', 2: 'KeyE', 3: 'KeyH', 4: 'KeyF', 5: 'KeyT', 6: 'KeyR', 7: 'Mouse0', 8: 'KeyG', 9: 'Escape', 10: 'ShiftLeft', 11: 'KeyV', 12: 'KeyQ', 13: 'KeyZ' };
const padHeld = new Set();
export function pollGamepad(dt) {
  let pads = [];
  try { pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; } catch (_) { return; }
  const g = pads[0];
  if (!g) { if (input.pad) { input.pad = false; input.move.x = input.move.y = 0; for (const k of padHeld) input.keys.delete(k); padHeld.clear(); } return; }
  input.pad = true;
  const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
  input.move.x = dz(g.axes[0] || 0); input.move.y = dz(g.axes[1] || 0);
  input.lookDX += dz(g.axes[2] || 0) * 900 * dt; input.lookDY += dz(g.axes[3] || 0) * 700 * dt;
  g.buttons.forEach((b, i) => {
    const k = PAD_KEYS[i]; if (!k) return;
    const down = b.pressed || b.value > 0.5;
    if (down && !padHeld.has(k)) { padHeld.add(k); input.keys.add(k); input.pressed.add(k); if (k === 'Mouse0') input.clicked = true; }
    else if (!down && padHeld.has(k)) { padHeld.delete(k); input.keys.delete(k); }
  });
  // d-pad left / right: hotbar
  if (g.buttons[14] && g.buttons[14].pressed && !padHeld.has('pl')) { padHeld.add('pl'); input.wheel -= 1; } else if (g.buttons[14] && !g.buttons[14].pressed) padHeld.delete('pl');
  if (g.buttons[15] && g.buttons[15].pressed && !padHeld.has('pr')) { padHeld.add('pr'); input.wheel += 1; } else if (g.buttons[15] && !g.buttons[15].pressed) padHeld.delete('pr');
}

export function endFrame() {
  input.pressed.clear(); input.lookDX = 0; input.lookDY = 0; input.wheel = 0; input.clicked = false; input.rclicked = false;
}
