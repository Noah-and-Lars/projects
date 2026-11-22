// Keyboard, mouse (Pointer Lock) and gamepad, mapped to named actions
// through the rebindable bindings in settings.
export function createInput(canvas, settings) {
  const down = new Set();       // codes held
  const pressed = new Set();    // actions pressed this frame
  const released = new Set();
  let mdx = 0, mdy = 0, wheel = 0;
  let locked = false;
  let captureCb = null;         // rebinding: next input goes here
  const pad = { lx: 0, ly: 0, rx: 0, ry: 0, buttons: [], prev: [], since: [], holding: [] };

  const actionsFor = (code) => { const out = []; for (const a in settings.binds) if (settings.binds[a].includes(code)) out.push(a); return out; };
  function press(code) {
    if (captureCb) { const cb = captureCb; captureCb = null; cb(code); return true; }
    if (down.has(code)) return false;
    down.add(code);
    for (const a of actionsFor(code)) pressed.add(a);
    return actionsFor(code).length > 0;
  }
  function release(code) { if (!down.delete(code)) return; for (const a of actionsFor(code)) released.add(a); }

  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (captureCb && e.code === 'Escape') { captureCb = null; e.preventDefault(); return; }
    if (press(e.code) && locked) e.preventDefault();
    if (e.code === 'F3' || (locked && (e.code === 'Space' || e.code === 'Tab'))) e.preventDefault();
  });
  addEventListener('keyup', (e) => release(e.code));
  addEventListener('blur', () => { for (const c of [...down]) release(c); });
  canvas.addEventListener('mousedown', (e) => { if (locked || captureCb) { press('Mouse' + e.button); e.preventDefault(); } });
  addEventListener('mousedown', (e) => { if (captureCb && e.target !== canvas) { e.preventDefault(); press('Mouse' + e.button); } }, true);
  addEventListener('mouseup', (e) => release('Mouse' + e.button));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => { if (locked) { mdx += e.movementX; mdy += e.movementY; } });
  addEventListener('wheel', (e) => { if (locked) wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; api.onLockChange?.(locked); if (!locked) for (const c of [...down]) release(c); });

  const api = {
    get locked() { return locked; },
    async lock() {
      try { await canvas.requestPointerLock({ unadjustedMovement: true }); }
      catch (_) { try { await canvas.requestPointerLock(); } catch (_) {} }
    },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    held: (a) => settings.binds[a].some(c => down.has(c)) || padHeld(a),
    pressed: (a) => pressed.has(a),
    released: (a) => released.has(a),
    // Mouse/look delta since last frame, in radians-ish units.
    look() { const s = 0.0022 * settings.sensitivity; const r = { x: mdx * s + pad.rx * 0.045 * settings.sensitivity, y: (mdy * s + pad.ry * 0.045 * settings.sensitivity) * (settings.invertY ? -1 : 1) }; mdx = mdy = 0; return r; },
    wheel() { const w = wheel; wheel = 0; return w; },
    move() { // x: strafe, y: forward, each -1..1
      let x = (api.held('right') ? 1 : 0) - (api.held('left') ? 1 : 0), y = (api.held('forward') ? 1 : 0) - (api.held('back') ? 1 : 0);
      if (Math.abs(pad.lx) > 0.15 || Math.abs(pad.ly) > 0.15) { x = pad.lx; y = -pad.ly; }
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      return { x, y };
    },
    capture(cb) { captureCb = cb; },
    get capturing() { return !!captureCb; },
    // Test hook: simulate an action press.
    simulate(action, held = true) { const c = settings.binds[action][0]; held ? press(c) : release(c); },
    // Rotation direction: Ctrl (or a reverse D-pad press) turns the other way.
    get reverse() { return down.has('ControlLeft') || down.has('ControlRight') || padReverse; },
    endFrame() { pressed.clear(); released.clear(); padReverse = false; },
    poll() { // gamepad, once per frame
      const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
      if (!gp) return;
      const dz = (v) => Math.abs(v) < 0.12 ? 0 : v;
      pad.lx = dz(gp.axes[0] || 0); pad.ly = dz(gp.axes[1] || 0); pad.rx = dz(gp.axes[2] || 0); pad.ry = dz(gp.axes[3] || 0);
      pad.prev = pad.buttons; pad.buttons = gp.buttons.map(b => b.pressed || b.value > 0.5);
      const now = performance.now();
      for (const [a, i] of Object.entries(PAD)) if (pad.buttons[i] && !pad.prev[i]) pressed.add(a); else if (!pad.buttons[i] && pad.prev[i]) released.add(a);
      // Tap/hold buttons: X picks up / drops, Y swaps / enters a vehicle,
      // Start opens the map / pauses (BUILD_BRIEF section 5).
      for (const [i, tap, hold] of TAP_HOLD) {
        if (pad.buttons[i] && !pad.prev[i]) pad.since[i] = now;
        if (pad.buttons[i] && pad.since[i] != null && now - pad.since[i] > HOLD_MS) { pressed.add(hold); pad.since[i] = null; pad.holding[i] = true; }
        if (!pad.buttons[i] && pad.prev[i]) {
          if (pad.since[i] != null) { pressed.add(tap); released.add(tap); }
          else if (pad.holding[i]) released.add(hold);
          pad.since[i] = null; pad.holding[i] = false;
        }
      }
      // D-pad rotates (down/left reverse); bumpers set placement distance.
      for (const [i, a, rev] of DPAD) if (pad.buttons[i] && !pad.prev[i]) { pressed.add(a); if (rev) padReverse = true; }
      if (pad.buttons[4] && !pad.prev[4]) wheel -= 1;
      if (pad.buttons[5] && !pad.prev[5]) wheel += 1;
    },
  };
  // Standard gamepad mapping (BUILD_BRIEF section 5).
  const PAD = { jump: 0, crouch: 1, secondary: 6, use: 7, sprint: 10, guide: 8 };
  const TAP_HOLD = [[2, 'pickup', 'drop'], [3, 'swap', 'vehicle'], [9, 'map', 'pause']];
  const DPAD = [[12, 'rotX', false], [13, 'rotX', true], [15, 'rotY', false], [14, 'rotY', true]];
  const HOLD_MS = 350;
  let padReverse = false;
  function padHeld(a) {
    const i = PAD[a]; if (i !== undefined) return !!pad.buttons[i];
    for (const [j, , hold] of TAP_HOLD) if (hold === a) return !!pad.holding[j];
    return false;
  }
  return api;
}
