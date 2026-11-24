// Behaviour for the machines in defs/machines4.js, on top of game/machines.js
// and game/automation.js: the Sorting Hopper, Gem Press, Funnel, Disposal
// Chute and Mender, plus the Magnet Rod tool. (The Belt Saw and the new
// logic parts live in automation.js with the other belts and gates.)
import { magnetRod } from '../defs/machines4.js';
import { MATERIALS, itemName, STAGE_NAMES } from '../defs/materials.js';
import { EXTRA_MESH, EXTRA_BOX, EXTRA_CARD, EXTRA_MASS } from './items.js';
import { h } from '../ui/dom.js';

EXTRA_MESH.magrod = () => magnetRod();
EXTRA_BOX.magrod = () => [0.1, 0.32, 0.05];
EXTRA_MASS.magrod = () => 1;
EXTRA_CARD.magrod = () => ({ name: 'Magnet Rod', lines: ['LMB pulls loose finds within 6 m', 'towards you'] });

export const MENDER_CHARGES = { wrench: 3, repairkit: 20 };
const MENDER_MAX = 20;

export function createMachines4({ machines, auto, items, physics, hands, hud, audio, fx }) {
  const { list } = machines, I = machines._int, D = I.MACHINES;
  const payloadItem = (p) => (p.ent ? p.ent.item : p.item);
  const payloadLoad = (p) => p.load || (p.ent && p.ent.type === 'clod' ? p.ent.data.loads?.[0] : null);
  const done = (p) => { if (p.ent) items.remove(p.ent.id); return true; };
  // A Disposal Chute runs while its input is above 0, or always with no cable.
  const shredOn = (m) => { const i = auto.inputsOf(m); return !i.conn[0] || i.a > 0; };
  const sorts = (it) => it && (it.stage !== 'crafted' || it.material);

  // ---- What each machine takes ----
  const prevAccept = machines.accept;
  machines.accept = (t, p, sock, from) => {
    const def = D[t.def];
    if (def.sorter) {
      const it = payloadItem(p); if (!sorts(it)) return false;
      const q = (t.state.queue ||= []); if (q.length >= 20) return false;
      q.push({ ...it }); return done(p);
    }
    if (def.press) {
      const it = payloadItem(p);
      if (!it || MATERIALS[it.material]?.kind !== 'gem' || it.stage !== 'cut') return false;
      const g = (t.state.gems ||= []);
      if (g.length >= def.capGems || (g.length && g[0].material !== it.material)) return false;
      g.push({ ...it }); t.state.lastIn = machines.clock; return done(p);
    }
    if (def.role === 'funnel') {
      const it = payloadItem(p), l = payloadLoad(p);
      if (it) return machines.output(t, { item: { ...it } }) ? done(p) : false;
      if (l) return machines.output(t, { load: { ...l } }) ? done(p) : false;
      return false;
    }
    if (def.logic === 'shredder') {
      if (!shredOn(t)) return false;
      shred(t, p.ent);
      return true;
    }
    return prevAccept ? prevAccept(t, p, sock, from) : undefined;
  };
  function shred(m, ent) {
    if (ent) items.remove(ent.id);
    m.state.ground = (m.state.ground || 0) + 1;
    if ((m._fxT || 0) < machines.clock) { m._fxT = machines.clock + 0.4; fx?.burst(I.toWorld(m, [0, 0.9, 0]), 0x9a948a, 8, { speed: 1.6, size: 0.03, life: 0.35 }); audio.play('clink'); }
  }

  // ---- Using things on them by hand ----
  const prevUse = machines.useOn;
  machines.useOn = (id, held, H) => {
    const m = list.get(id); const def = m && !m.run && D[m.def];
    if (!def || !held) return prevUse(id, held, H);
    const say = (t, k) => (H?.hud || hud).toast(t, k);
    const consume = () => { items.remove(held.id); if (H.hand === held.id) H.hand = null; };
    if (def.logic === 'mender' && (held.type === 'wrench' || held.type === 'repairkit')) {
      const add = held.type === 'repairkit' ? Math.round(MENDER_CHARGES.repairkit * (held.data.uses ?? 5) / 5) : MENDER_CHARGES.wrench;
      if ((m.state.charges || 0) >= MENDER_MAX) { say(`The Mender is full (${MENDER_MAX} charges)`, 'err'); return true; }
      m.state.charges = Math.min(MENDER_MAX, (m.state.charges || 0) + add); consume(); audio.play('clink');
      say(`Mender: ${m.state.charges} repair charge${m.state.charges === 1 ? '' : 's'} (25% each)`); return true;
    }
    if ((def.sorter || def.press || def.role === 'funnel') && (held.item)) {
      if (machines.accept(m, { item: held.item }, 0) === true) { consume(); audio.play('drop'); say(def.press ? `Into the press (${m.state.gems.length} gem${m.state.gems.length > 1 ? 's' : ''})` : def.sorter ? `Into the hopper (${m.state.queue.length} waiting)` : 'Down the funnel'); }
      else say(def.press ? 'The press takes cut gems of one kind (up to 12)' : def.sorter ? 'The hopper is full' : 'Something in front of the funnel is full', 'err');
      return true;
    }
    if (def.logic === 'shredder' && held.item) { say('Drop things in (G) to get rid of them: the chute destroys whatever falls in', 'err'); return true; }
    return prevUse(id, held, H);
  };

  // ---- Tick (20 Hz with the other machines) ----
  let catchT = 0;
  machines.extraTick.push((dt) => {
    for (const m of list.values()) {
      if (m.run) continue;
      const def = D[m.def];
      if (def.sorter) sorterTick(m, def, dt);
      else if (def.press) pressTick(m, def, dt);
    }
    catchT += dt; if (catchT >= 0.2) { catchT = 0; catchLoose(); }
  });
  const sat = (m) => I.flowOf(m.id)?.satisfaction || 0;
  function matches(m, it) { const f = m.state.filter; return !!f && it.material === f.material && (f.stage === 'any' || it.stage === f.stage); }
  function sorterTick(m, def, dt) {
    const q = (m.state.queue ||= []);
    if (!m.on) { m.status = 'off'; return; }
    if (sat(m) <= 0) { m.status = 'no water'; return; }
    if (!q.length) { m.status = 'waiting for finds'; m.state.progress = 0; return; }
    m.state.progress = (m.state.progress || 0) + dt * (m.speed || 0) / def.period;
    if (m.state.progress < 1) { m.status = 'running'; return; }
    const it = q[0], hit = matches(m, it);
    if (machines.output(m, { item: it, socket: hit ? 3 : 2 })) { q.shift(); m.state.progress = 0; m.status = 'running'; m.sorted = (m.sorted || 0) + 1; if (hit) m.matched = (m.matched || 0) + 1; }
    else { m.state.progress = 1; m.status = 'output blocked'; }
  }
  function pressTick(m, def, dt) {
    const g = (m.state.gems ||= []);
    if (m.state.out) { if (machines.output(m, { item: m.state.out })) m.state.out = null; else { m.status = 'output blocked'; return; } }
    if (!m.on) { m.status = 'off'; return; }
    if (sat(m) <= 0) { m.status = 'no water'; return; }
    // Wait 2 s after the last gem arrives, so a batch goes in together.
    if (g.length < 2 || machines.clock - (m.state.lastIn || 0) < 2) { m.status = g.length ? `${g.length} gem${g.length > 1 ? 's' : ''} in · needs 2+` : 'waiting for cut gems'; m.state.progress = 0; return; }
    m.state.progress = (m.state.progress || 0) + dt * (m.speed || 0) / def.period;
    m.status = 'pressing';
    if (m.state.progress < 1) return;
    const kg = Math.round(g.reduce((a, x) => a + x.kg, 0) * 1000) / 1000;
    const out = { material: g[0].material, stage: 'cut', kg, pressed: g.reduce((a, x) => a + (x.pressed || 1), 0) };
    if (g.some(x => x.sawn)) out.sawn = true;
    m.state.gems = []; m.state.progress = 0; m.pressed = (m.pressed || 0) + 1;
    audio.play('rare'); fx?.burst(I.toWorld(m, [0, 0.55, 0.3]), 0xfff4e0, 14, { speed: 1.8, size: 0.025, life: 0.4 });
    if (!machines.output(m, { item: out })) m.state.out = out;
  }
  // Loose finds and clods resting in a funnel's mouth or on a chute's rollers.
  function catchLoose() {
    if (items.remote) return;
    const catchers = [...list.values()].filter(m => !m.run && (D[m.def].role === 'funnel' || (D[m.def].logic === 'shredder' && shredOn(m))));
    if (!catchers.length) return;
    for (const e of [...items.ents.values()]) {
      if (e.loc !== 'loose' || !(e.item || e.type === 'clod')) continue;
      for (const m of catchers) {
        const def = D[m.def], dx = e.pos[0] - m.pos[0], dz = e.pos[2] - m.pos[2], dy = e.pos[1] - m.pos[1];
        if (Math.hypot(dx, dz) > def.catchR || dy < def.catchY[0] || dy > def.catchY[1]) continue;
        if (def.logic === 'shredder') { shred(m, e); break; }
        const ok = e.item ? machines.output(m, { item: { ...e.item } }) : machines.output(m, { load: e.data.loads?.[0] || { band: e.data.band, depth: e.data.depth } });
        if (ok) { items.remove(e.id); m.passed = (m.passed || 0) + 1; }
        break;
      }
    }
  }

  // ---- Logic effects (Mender) ----
  auto.logicEffects.push((m, L, a, rising) => {
    if (L !== 'mender' || !rising) return;
    if (!(m.state.charges > 0)) { m.status = 'no charges'; return; }
    let best = null;
    for (const t of list.values()) { if (t.run || t === m || !(t.wear > 0.01)) continue; const d = Math.hypot(t.pos[0] - m.pos[0], t.pos[2] - m.pos[2]); if (d < 4 && (!best || t.wear > best.wear)) best = t; }
    if (!best) return;
    best.wear = Math.max(0, best.wear - 0.25); m.state.charges--; m.mended = (m.mended || 0) + 1;
    audio.play('clink'); fx?.burst(I.toWorld(best, [0, 1, 0]), 0x9cf0b0, 12, { speed: 1.4, size: 0.03, life: 0.4 });
  });

  // ---- Panels ----
  const prevRows = auto.panelRows;
  auto.panelRows = (m, row, controls, render) => {
    prevRows(m, row, controls, render);
    const def = D[m.def];
    if (def.sorter) {
      const f = m.state.filter;
      row('Waiting', `${(m.state.queue || []).length} / 20`);
      row('Sample on the tray', f ? `${MATERIALS[f.material].name} · ${f.stage === 'any' ? 'any form' : STAGE_NAMES[f.stage] || f.stage}` : 'none: everything goes out of the front');
      const opts = [h('option', { value: '', selected: !f }, 'No sample')];
      for (const mat of Object.keys(MATERIALS)) {
        if (MATERIALS[mat].kind === 'fuel') { opts.push(h('option', { value: `${mat}|ore`, selected: f?.material === mat }, MATERIALS[mat].name)); continue; }
        const stages = MATERIALS[mat].kind === 'gem' ? ['any', 'uncut', 'cut'] : MATERIALS[mat].kind === 'alloy' ? ['any', 'ingot', 'crafted'] : ['any', 'ore', 'ingot', 'crafted'];
        for (const st of stages) opts.push(h('option', { value: `${mat}|${st}`, selected: f?.material === mat && f?.stage === st }, `${MATERIALS[mat].name} · ${st === 'any' ? 'any form' : STAGE_NAMES[st] || st}`));
      }
      controls.append(h('div', { class: 'entry' }, h('b', {}, 'Sample'), h('select', { onchange: (e) => { const v = e.target.value; m.state.filter = v ? { material: v.split('|')[0], stage: v.split('|')[1] } : null; render(); } }, ...opts),
        h('span', { class: 'desc' }, 'Matches drop out of the side chute (right); everything else out of the front. Pour finds in the top, or feed it from a belt.')));
    }
    if (def.press) {
      const g = m.state.gems || [];
      row('Inside', g.length ? `${g.length} ${itemName(g[0]).toLowerCase()} · ${g.reduce((a, x) => a + x.kg, 0).toFixed(2)} kg` : 'empty');
      controls.append(h('p', { class: 'small' }, 'Feed it cut gems of one kind. Two seconds after the last one arrives it fuses them into a single stone; bigger gems are worth more per kilo. A Machine Switch can turn it on and off.'));
    }
    if (def.role === 'funnel') { row('Passed through', String(m.passed || 0)); controls.append(h('p', { class: 'small' }, 'Drop finds or clods into the mouth (or feed it from a belt): they slide out of the spout into the machine in front, or onto the ground.')); }
    if (def.logic === 'shredder') { row('Destroyed', String(m.state.ground || 0)); controls.append(h('p', { class: 'small' }, 'Destroys anything that falls in or arrives by belt, while its input is above 0. With no cable it is always on: careful what you drop.')); }
    if (def.logic === 'mender') { row('Charges', `${m.state.charges || 0} / ${MENDER_MAX}`); controls.append(h('p', { class: 'small' }, 'Load it with wrenches (3 charges) or repair kits (up to 20). Each rising signal fixes the most worn machine within 4 m by 25%. Pair it with a Wear Sensor and a Compare gate.')); }
  };

  // ---- Magnet Rod ----
  const prevUseHook = hands.useHook, prevHint = hands.hintHook;
  hands.useHook = (e, info, H = hands) => {
    if (e.type !== 'magrod') return prevUseHook?.(e, info, H) || false;
    const eye = H.eye ? H.eye() : null; if (!eye) return true;
    let n = 0;
    for (const t of items.ents.values()) {
      if (t.loc !== 'loose' || !t.item) continue;
      const dx = eye[0] - t.pos[0], dy = eye[1] - 0.6 - t.pos[1], dz = eye[2] - t.pos[2], d = Math.hypot(dx, dy, dz);
      if (d > 6 || d < 0.9) continue;
      const k = Math.min(6, 2 + d) / d;
      if (!items.remote) physics.post({ op: 'setBody', id: t.id, vel: [dx * k, Math.max(1.5, dy * k + 2), dz * k], wake: true });
      n++;
    }
    audio.play(n ? 'swish' : 'tick'); (H.hud || hud).toast(n ? `Pulled ${n} find${n > 1 ? 's' : ''}` : 'No loose finds within 6 m');
    return true;
  };
  hands.hintHook = (e, info, H = hands) => (e.type === 'magrod' ? '{LMB} pull finds' : prevHint?.(e, info, H) || '');
  return { shredOn };
}
