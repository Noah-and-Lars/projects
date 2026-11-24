// Co-op (BUILD_BRIEF 7): host-authoritative play for up to 4.
//
// The host's browser runs the only simulation (physics, sim tick, economy,
// terrain). Guests render, move their own character (client-side prediction)
// and send intents; the host runs each guest's actions through its own copy
// of the hands code, then broadcasts snapshots.
//
// Messages (all broadcast on the room channel, see net.js):
//   'hi'  guest -> host   send me the world
//   'pk'  host -> guest   the world package in chunks (a .rillsave blob, base64)
//   'in'  guest -> host   20 Hz: pose, camera, vehicle input, queued actions
//   's'   host -> all     12 Hz: players, moving bodies, vehicles, ops since
//                         last time (entity upserts/removals, terrain edits,
//                         machines, vehicles, rails, toasts), machine status
//                         changes and the economy when it changed
//   'to'  host -> guest   things for one guest: toasts, sounds, teleports, menus
import * as THREE from 'three';
import { editLog, brush, boxBrush, createClaimVolume, readChunk, writeChunk } from '../world/claims.js';
import { clerk, textPlane } from '../render/buildings.js';
import { BLUEPRINTS } from '../defs/progression.js';
import { SHOPS } from '../defs/shops.js';
import { MACHINES } from '../defs/machines.js';
import { MATERIALS, CRAFT_MULT } from '../defs/materials.js';

const SNAP_HZ = 12, IN_HZ = 20, SCAN_HZ = 5, STATUS_HZ = 2;
const COLORS = [0x2a8a86, 0xc8902c, 0xa84a3a, 0x6e56a8];
const NEAR = 60; // moving bodies are sent within this range of a guest
const SETTINGS = ['throttle', 'filter', 'value', 'period', 'delay', 'op', 'pulseOnly', 'cutKg'];
// Guest messages are untrusted: numbers must be finite, vectors the right
// size, and machine settings in range, before the host acts on them.
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const vec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(num);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const STAGES = ['ore', 'uncut', 'cut', 'ingot', 'crafted'];
function cleanSetting(k, v, materials) {
  switch (k) {
    case 'throttle': return num(v) ? clamp(v, 0, 1) : undefined;
    case 'value': return num(v) ? clamp(v, -1e6, 1e6) : undefined;
    case 'period': case 'delay': return num(v) ? clamp(v, 0.1, 3600) : undefined;
    case 'op': return ['>', '<', '='].includes(v) ? v : undefined;
    case 'pulseOnly': return typeof v === 'boolean' ? v : undefined;
    case 'cutKg': return num(v) ? clamp(v, 0.25, 10) : undefined;
    case 'filter': return v && typeof v === 'object' && materials[v.material] && STAGES.includes(v.stage) ? { material: v.material, stage: v.stage } : undefined;
  }
}
const r3 = (v) => Math.round(v * 1000) / 1000, r4 = (v) => Math.round(v * 10000) / 10000;
export const b64 = {
  enc(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); },
  dec(str) { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
};

export function createCoop(ctx) {
  const { net, scene, camera, physics, items, hands, makeHands, machines, vehicles, economy, town, workshop, heavy, claims, hud, audio, panels, bed, auto, player, state, snapshot, restore, saves, teleport, materials } = ctx;
  const C = { role: 'off', guests: new Map(), left: new Map(), avatars: new Map(), acting: null, seq: 0, loading: false, stats: { snaps: 0, bytesOut: 0, pkgBytes: 0, pkgChunks: 0, pkgMs: 0 } };
  const ops = [];
  const push = (op) => { if (C.role === 'host') ops.push(op); };

  // ---------------------------------------------------------------- avatars
  function avatar(id, name, color) {
    let a = C.avatars.get(id);
    if (a) return a;
    const g = new THREE.Group();
    const body = new THREE.Mesh(clerk(color), materials.vcolor); body.castShadow = true; g.add(body);
    const tag = textPlane([name || 'Miner'], { w: 1.1, h: 0.28, bg: '#2b3440', fg: '#f6eedb', px: 384 });
    tag.position.y = 2.0; g.add(tag);
    const hold = new THREE.Group(); hold.position.set(0.32, 1.05, 0.25); g.add(hold);
    scene.add(g);
    a = { id, g, tag, hold, buf: [], heldId: null };
    C.avatars.set(id, a);
    return a;
  }
  function dropAvatar(id) { const a = C.avatars.get(id); if (!a) return; scene.remove(a.g); C.avatars.delete(id); }
  function poseAvatar(id, name, color, p, yaw, held, hidden) {
    const a = avatar(id, name, color);
    a.buf.push({ t: performance.now(), p: p.slice(), yaw });
    if (a.buf.length > 20) a.buf.shift();
    a.g.visible = !hidden;
    if (held !== a.heldId) {
      a.heldId = held; a.hold.clear();
      const e = held != null ? items.get(held) : null;
      if (e) { const m = items.buildMesh(e); m.scale.multiplyScalar(e.type === 'crate' ? 0.4 : 0.8); m.rotation.set(-0.6, 0, 0); a.hold.add(m); }
    }
  }
  function animateAvatars() {
    const at = performance.now() - 120;
    for (const a of C.avatars.values()) {
      const b = a.buf; if (!b.length) continue;
      let i = b.length - 1; while (i > 0 && b[i - 1].t > at) i--;
      const s1 = b[i], s0 = i > 0 ? b[i - 1] : s1, span = s1.t - s0.t, t = span > 0 ? Math.max(0, Math.min(1, (at - s0.t) / span)) : 1;
      // Feet on the ground: the pose is the eye-level body centre.
      a.g.position.set(s0.p[0] + (s1.p[0] - s0.p[0]) * t, s0.p[1] + (s1.p[1] - s0.p[1]) * t - 0.9, s0.p[2] + (s1.p[2] - s0.p[2]) * t);
      a.g.rotation.y = s1.yaw + Math.PI;
      a.tag.quaternion.copy(camera.quaternion);
    }
  }

  const takeSig = (it) => `${it.material}|${it.stage}|${it.kg}|${it.craft || ''}`;
  // ------------------------------------------------------------------- host
  function guestHud(g) {
    return { toast: (text, kind) => toGuest(g, { toast: [text, kind || ''] }), tooltip() {}, hint() {}, caption() {} };
  }
  function toGuest(g, payload) { if (payload.tp) g.tpOk = true; net.send('to', { to: g.id, ...payload }); }
  function addGuest(m) {
    if (C.guests.has(m.id)) return C.guests.get(m.id);
    const cam = new THREE.PerspectiveCamera(70, 1.6, 0.05, 50);
    const g = { id: m.id, name: m.n, color: COLORS[C.guests.size + 1], cam, hands: null, pose: { p: player.cur.toArray(), yaw: 0, pitch: 0 }, queue: [], busy: false, seq: -1, drv: null };
    const gh = makeHands({ camera: cam, hud: guestHud(g), audio: { play: (cue) => toGuest(g, { snd: cue }) } });
    g.hands = gh; gh.hud = guestHud(g);
    // Hooks other modules attached to the host's hands, for this guest too.
    for (const k of ['owns', 'vehicles', 'props', 'machines', 'auto', 'onDig', 'onWear', 'useHook', 'hintHook', 'secHook']) gh[k] = hands[k];
    gh.onLift = (mm) => { const top = machines._int.toWorld(mm, [0, 4.15, 0]), bottom = machines._int.toWorld(mm, [0, 0.4, -1.2]); const up = g.pose.p[1] < mm.pos[1] + 2; const p = up ? top : bottom; toGuest(g, { tp: [p[0], p[1] + 1, p[2]] }); };
    gh.onVehicle = () => {};
    gh.remoteCraft = (held) => toGuest(g, { craft: held.id });
    // Starting gear: a pan and a shovel of their own. A guest who left and
    // rejoins under the same name gets back what they dropped, if it's
    // still lying loose, instead of a new set each time.
    const left = C.left.get(m.n); C.left.delete(m.n);
    let back = 0;
    if (left) for (const k of ['hand', 'slot']) { const e = left[k] != null ? items.get(left[k]) : null; if (e && e.loc === 'loose') { items.take(e.id, 'held'); gh[k] = e.id; back++; } }
    if (!back) { gh.give('pan', { starter: true }); gh.give('shovel', { starter: true }); }
    C.guests.set(m.id, g);
    return g;
  }
  function removeGuest(id) {
    const g = C.guests.get(id); if (!g) return;
    // Whatever they held lands where they stood.
    const gp = guestPos(g);
    for (const k of ['hand', 'slot']) { const e = g.hands[k] ? items.get(g.hands[k]) : null; if (e) items.place(e.id, [gp[0], gp[1] + 0.2, gp[2]]); }
    C.left.set(g.name, { hand: g.hands.hand, slot: g.hands.slot });
    if (g.drv != null) vehicles.remoteDrivers.delete(g.drv);
    dropAvatar(id); C.guests.delete(id);
    hud.toast(`${g.name} left`);
  }
  async function sendPackage(g) {
    const t0 = performance.now();
    scanEntities(); // pending changes go to everyone first (seq after the package's)
    const snap = snapshot(); snap.coop = { seq: C.seq };
    // A multiplayer world: the guest gets its id and invite, and can reopen it later.
    const mpw = ctx.mpInfo?.(); if (mpw) snap.mp = mpw;
    const blob = saves.exportBlob(snap), buf = await blob.arrayBuffer();
    const str = b64.enc(buf);
    const n = net.sendBig('pk', g.id, str);
    C.stats.pkgBytes = str.length; C.stats.pkgChunks = n; C.stats.pkgMs = performance.now() - t0;
  }
  // Where a guest is: their vehicle while they drive (their own pose stays
  // where they got in), otherwise their reported position.
  function guestPos(g) { const v = g.drv != null ? vehicles.list.get(g.drv) : null; return v ? v.group.position.toArray() : g.pose.p; }
  // Run one queued action of a guest, with their camera.
  async function runAction(g, a) {
    if (a.cam) {
      // The guest's camera must be a real pose (finite numbers). Distances
      // aren't checked: the host's view of a guest lags their teleports.
      if (!vec(a.cam) || !vec(a.q, 4)) return;
      g.cam.position.fromArray(a.cam); g.cam.quaternion.fromArray(a.q).normalize(); g.cam.updateMatrixWorld();
    }
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(g.cam.quaternion);
    g.hands.aim = await physics.query({ type: 'ray', o: g.cam.position.toArray(), d: d.toArray(), max: 8 });
    g.hands.cooldown = 0;
    C.acting = g;
    try {
      const H = g.hands;
      if (a.k === 'use') H.use();
      else if (a.k === 'pick') H.pickup();
      else if (a.k === 'drop') { if (a.ring) { if (vec(a.ring)) H.dropAt(a.ring, num(a.yaw) ? a.yaw : 0, a.rot); } else { if (a.reach) H.reach = Math.max(1.5, Math.min(6, +a.reach || 3.5)); H.drop(); } }
      else if (a.k === 'swap') H.swap();
      else if (a.k === 'rmb') { const i = H.aimInfo(); H.secHook?.(i, H) || H.shovelRmb?.(i); }
      else if (a.k === 'sec') { const c = H.hand ? items.get(H.hand) : null; if (c?.type === 'coil') machines.undoRun(c); }
      else if (a.k === 'unlock') { const m = machines.get(a.id); if (m) { m.locked = false; g.hands.hud.toast(`${machines.name(m.def)} unlocked`); } }
      else if (a.k === 'place') {
        const e = H.hand ? items.get(H.hand) : null;
        if (e && e.id === a.ent && e.type === 'crate' && e.data.def === a.def && vec(a.pos) && num(a.rot)) {
          const why = machines.requirement(a.def, a.pos, a.rot);
          if (why) H.hud.toast(why, 'err');
          else if (!(await machines.checkFree(a.def, a.pos, a.rot))) H.hud.toast('Something is in the way', 'err');
          else { machines.place(a.def, a.pos, a.rot, e.data.state || {}, { wear: e.data.wear || 0 }); items.remove(e.id); H.hand = null; H.hud.toast(`${machines.name(a.def)} placed · lock it with the mallet`); }
        }
      } else if (a.k === 'veh') {
        const v = vehicles.list.get(a.id);
        if (v && !v.def.kinematic && g.drv != null) { /* already driving: one seat at a time */ }
        else if (v && !v.def.kinematic && vehicles.driving !== a.id && !vehicles.remoteDrivers.has(a.id)) { vehicles.remoteDrivers.set(a.id, { guest: g.id, input: {} }); g.drv = a.id; }
        else if (v?.def.kinematic) vehicles.onTram?.(v);
        else H.hud.toast('Someone else is driving that');
      } else if (a.k === 'vexit') {
        const v = vehicles.list.get(g.drv);
        if (v) { const p = new THREE.Vector3().fromArray(v.def.door).applyMatrix4(v.group.matrixWorld); toGuest(g, { tp: [p.x, p.y + 1.2, p.z] }); }
        vehicles.remoteDrivers.delete(g.drv); g.drv = null;
      } else if (a.k === 'xdig' || a.k === 'xdump') {
        const v = vehicles.list.get(g.drv);
        if (v?.def.hopper) a.k === 'xdig' ? heavy.dig(v) : heavy.dump(v);
      } else if (a.k === 'ui') uiAction(g, a);
    } finally { C.acting = null; }
  }
  // Panel buttons pressed on a guest's screen.
  function uiAction(g, a) {
    const H = g.hands, E = economy.state;
    switch (a.op) {
      case 'buy': if (SHOPS[a.shop] && Object.values(SHOPS).some(S => S.items.some(i => i.id === a.item))) town.buy(a.shop, a.item); break; // one catalogue at every counter
      case 'claim': { const r = economy.buyClaim(a.id); if (r === 'ok') hud.toast(`Claim bought: ${a.id}`, 'gold'); else H.hud.toast(r === 'poor' ? 'Not enough money' : 'Already owned', 'err'); break; }
      case 'bp': { const bp = BLUEPRINTS.find(b => b.id === a.id); if (bp) workshop.buyBlueprint(bp); break; }
      case 'build': { const bp = BLUEPRINTS.find(b => b.id === a.id); if (bp) workshop.build(bp); break; }
      case 'scrap': workshop.scrap(); break;
      case 'vcall': town.callVehicle(a.id); break;
      case 'vsell': town.sellVehicle(a.id); break;
      case 'pour': machines.pour(a.id); break;
      case 'interact': { const m = machines.get(a.id); if (m) auto.interact(m); break; }
      case 'take': {
        // The guest saw item i; if the bin shifted since (an ejector), take the one that matches.
        const m = machines.get(a.id), c = m?.state?.contents; if (!c) break;
        const i = a.sig == null || (c[a.i] && takeSig(c[a.i]) === a.sig) ? a.i : c.findIndex(it => takeSig(it) === a.sig);
        if (i >= 0) auto.takeFrom(m, i, H); break;
      }
      case 'craft': { const held = H.hand ? items.get(H.hand) : null; if (held?.item?.stage === 'ingot' && held.item.hotUntil > items.clock && Object.keys(CRAFT_MULT).includes(a.kind)) machines.craft(held, H, a.kind); break; }
      case 'mset': { const m = machines.get(a.id); if (!m) break; if (typeof a.on === 'boolean') m.on = a.on; for (const k of SETTINGS) if (a.set && k in a.set) { const v = cleanSetting(k, a.set[k], MATERIALS); if (v !== undefined) m.state[k] = v; } break; }
      case 'bedTake': bed.take(a.vid, a.ent, H); break;
      case 'bedPut': { const e = H.hand ? items.get(H.hand) : null; if (e) bed.putIn(a.vid, e, H); break; }
      case 'bedUnload': bed.unloadAll(a.vid); break;
    }
  }
  function onIntent(p) {
    const g = C.guests.get(p.f); if (!g) return;
    if (p.s <= g.seq) return; g.seq = p.s;
    // Accept the guest's own movement if it is plausible (no 40 m/s jumps
    // unless the host teleported them).
    if (vec(p.p)) {
      const dt = Math.max(0.05, (performance.now() - (g.lastIn || 0)) / 1000);
      // A jump is accepted after a teleport we sent, or when it persists for
      // half a second (the guest's own rescue or "Return to claim post").
      const ok = Math.hypot(p.p[0] - g.pose.p[0], p.p[2] - g.pose.p[2]) / dt < 40 || g.tpOk || !g.lastIn || (g.rejects || 0) >= 10;
      if (ok) { g.pose.p = p.p; g.tpOk = false; g.rejects = 0; g.lastIn = performance.now(); } else g.rejects = (g.rejects || 0) + 1;
      g.pose.yaw = num(p.yaw) ? p.yaw : 0; g.pose.pitch = num(p.pitch) ? p.pitch : 0;
    }
    if (g.drv != null && p.vi) { const d = vehicles.remoteDrivers.get(g.drv); if (d) d.input = { throttle: Math.max(-1, Math.min(1, +p.vi.throttle || 0)), steer: Math.max(-1, Math.min(1, +p.vi.steer || 0)), brake: !!p.vi.brake }; }
    for (const a of p.a || []) if (g.queue.length < 30) g.queue.push(a);
    pump(g);
  }
  async function pump(g) {
    if (g.busy) return; g.busy = true;
    try { while (g.queue.length) await runAction(g, g.queue.shift()); } catch (e) { console.error(e); }
    g.busy = false;
  }
  // ---- Replication state (host) ----
  const sigs = new Map();      // entity id -> signature
  const sentPose = new Map();  // entity id -> 'x,y,z' last sent
  const mStatus = new Map();   // machine id -> status signature
  let vSig = new Map(), ecSig = '', railSig = '', scanT = 0, snapT = 0, statusT = 0;
  function scanEntities() {
    const seen = new Set();
    for (const e of items.ents.values()) {
      seen.add(e.id);
      const s = items.sig(e);
      if (sigs.get(e.id) !== s) { sigs.set(e.id, s); push(['e', items.wire(e)]); sentPose.delete(e.id); }
    }
    for (const id of sigs.keys()) if (!seen.has(id)) { sigs.delete(id); sentPose.delete(id); push(['x', id]); }
    for (const v of vehicles.list.values()) {
      const s = `${v.cargo.join(',')}|${v.hopper.length}|${v.tram ? v.tram.line : ''}`;
      if (vSig.get(v.id) !== s) { vSig.set(v.id, s); push(['vc', v.id, v.cargo.slice(), v.hopper.length]); }
    }
    const rs = JSON.stringify(heavy.serialize());
    if (rs !== railSig) { railSig = rs; push(['r', JSON.parse(rs)]); }
  }
  const machineWire = (m) => (m.run ? { id: m.id, run: true, tier: m.tier, a: m.a, b: m.b, via: m.via } : { id: m.id, def: m.def, pos: m.pos, rot: m.rot, locked: m.locked, wear: m.wear, on: m.on, state: m.state });
  function machineStatus() {
    const out = [];
    for (const m of machines.list.values()) {
      if (m.run) continue;
      const st = { s: m.status, sp: r3(m.speed || 0), w: r3(m.wear || 0), on: m.on, l: m.locked, f: r3(m.flow?.satisfaction ?? 0), g: m.sig ?? 0, b: m.beltSpeed ?? 0, st: m.state };
      const sig = JSON.stringify(st);
      if (mStatus.get(m.id) !== sig) { mStatus.set(m.id, sig); out.push([m.id, st]); }
    }
    return out;
  }
  function hostSnapshot() {
    const gps = [...C.guests.values()].map(guestPos);
    const nearGuest = (p) => { for (const q of gps) if (Math.hypot(p[0] - q[0], p[2] - q[2]) < NEAR) return true; return false; };
    const b = [];
    for (const e of items.ents.values()) {
      if (e.loc !== 'loose' && e.loc !== 'belt') continue;
      const k = `${r3(e.pos[0])},${r3(e.pos[1])},${r3(e.pos[2])}`;
      if (sentPose.get(e.id) === k) continue;
      if (!nearGuest(e.pos) && sentPose.has(e.id)) continue;
      sentPose.set(e.id, k);
      b.push(e.id, r3(e.pos[0]), r3(e.pos[1]), r3(e.pos[2]), r4(e.quat[0]), r4(e.quat[1]), r4(e.quat[2]), r4(e.quat[3]));
    }
    const v = [];
    for (const veh of vehicles.list.values()) {
      const st = physics.vehicles.get(veh.id);
      const p = veh.def.kinematic || !st ? veh.group.position.toArray() : st.p, q = veh.def.kinematic || !st ? veh.group.quaternion.toArray() : st.q;
      v.push([veh.id, p.map(r3), q.map(r4), r3(st?.speed || 0), st?.wheels ? st.wheels.map(w => w.map(r3)) : [], r3(veh.fuel)]);
    }
    const pl = [[net.id, net.name(), COLORS[0], player.cur.toArray().map(r3), r3(player.yaw), r3(player.pitch), hands.hand, hands.slot, vehicles.driving]];
    for (const g of C.guests.values()) pl.push([g.id, g.name, g.color, g.pose.p.map(r3), r3(g.pose.yaw), r3(g.pose.pitch), g.hands.hand, g.hands.slot, g.drv]);
    const msg = { q: ++C.seq, t: r4(state.time), d: state.day, pl, b, v, ops: ops.splice(0) };
    statusT -= 1 / SNAP_HZ;
    if (statusT <= 0) {
      statusT = 1 / STATUS_HZ;
      const m = machineStatus(); if (m.length) msg.m = m;
      const ec = JSON.stringify(economy.serialize());
      if (ec !== ecSig) { ecSig = ec; msg.ec = JSON.parse(ec); }
    }
    net.send('s', msg);
    C.stats.snaps++;
  }

  // ------------------------------------------------------------------ guest
  let inT = 0, inSeq = 0, pending = [], buffered = [], hiT = 0, hiTries = 0, myDrv = null;
  const origRemoveVehicle = vehicles.remove;
  function queue(a) {
    const q = camera.quaternion;
    pending.push({ ...a, cam: camera.getWorldPosition(new THREE.Vector3()).toArray().map(r3), q: [q.x, q.y, q.z, q.w].map(r4) });
    sendIntent();
  }
  const ui = (op, extra) => queue({ k: 'ui', op, ...extra });
  function sendIntent() {
    const dv = vehicles.driving ? vehicles.list.get(vehicles.driving) : null;
    const mv = dv ? ctx.input.move() : null;
    net.send('in', { s: ++inSeq, p: player.cur.toArray().map(r3), yaw: r3(player.yaw), pitch: r3(player.pitch), vi: mv ? { throttle: mv.y, steer: -mv.x, brake: ctx.input.held('jump') } : null, a: pending.splice(0) });
  }
  function applyOp(op) {
    switch (op[0]) {
      case 'e': items.upsert(op[1]); break;
      case 'x': items.remove(op[1]); break;
      case 's': { const vol = claims.volumes.get(op[1]); if (vol) brush(vol, op[2], op[3], op[4], op[5]); break; }
      case 'b': { const vol = claims.volumes.get(op[1]); if (vol) boxBrush(vol, op[2], op[3], op[4]); break; }
      case 'mp': { const d = op[1]; if (machines.get(d.id)) machines.remove(d.id); if (d.run) machines.layRun(d.tier, d.a, d.b, { id: d.id, via: d.via }); else machines.place(d.def, d.pos, d.rot, d.state, { id: d.id, locked: d.locked, wear: d.wear, on: d.on }); break; }
      case 'mx': machines.remove(op[1]); break;
      case 'vs': vehicles.spawn(op[1].type, op[1].pos, 0, op[1]); break;
      case 'vx': origRemoveVehicle(op[1]); break;
      case 'vc': { const v = vehicles.list.get(op[1]); if (v) { vehicles.syncCargo(op[1], op[2]); v.hopper.length = 0; for (let i = 0; i < op[3]; i++) v.hopper.push({}); } break; }
      case 'r': heavy.restore(op[1]); break;
      case 't': hud.toast(op[1], op[2]); break;
      case 'fin': workshop.finale(true); break;
    }
  }
  function applySnapshot(s) {
    state.time = s.t; state.day = s.d;
    for (const o of s.ops || []) applyOp(o);
    for (let i = 0; i < s.b.length; i += 8) items.setPose(s.b[i], [s.b[i + 1], s.b[i + 2], s.b[i + 3]], [s.b[i + 4], s.b[i + 5], s.b[i + 6], s.b[i + 7]]);
    for (const [id, p, q, speed, wheels, fuel] of s.v) {
      const v = vehicles.list.get(id); if (!v) continue;
      v.fuel = fuel;
      if (v.def.kinematic) { v.group.position.fromArray(p); v.group.quaternion.fromArray(q); v.group.updateMatrixWorld(true); }
      else physics.vehicles.set(id, { id, p, q, speed, wheels, asleep: false });
    }
    for (const [id, name, color, p, yaw, pitch, hand, slot, drv] of s.pl) {
      if (id === net.id) {
        hands.hand = hand; hands.slot = slot;
        if (drv !== myDrv) { myDrv = drv; vehicles.driving = drv; if (drv != null) hud.toast('WASD drive · Space brake · F get out'); }
        continue;
      }
      void pitch;
      poseAvatar(id, name, color, p, yaw, hand, drv != null);
    }
    for (const id of [...C.avatars.keys()]) if (!s.pl.some(x => x[0] === id)) dropAvatar(id);
    if (s.m) for (const [id, st] of s.m) {
      const m = machines.get(id); if (!m) continue;
      m.status = st.s; m.speed = st.sp; m.wear = st.w; m.on = st.on; m.locked = st.l; m.sig = st.g; m.beltSpeed = st.b;
      m.flow = { ...(m.flow || {}), satisfaction: st.f };
      m.state = st.st;
    }
    if (s.ec) { economy.restore(s.ec); town.newDay(); workshop.applyStage(); }
  }
  async function loadPackage(str, ) {
    C.loading = true;
    const u8 = b64.dec(str);
    const snap = await saves.importFile(new Blob([u8]));
    // Drop the local world's bodies, then switch to puppet mode and load.
    for (const v of [...vehicles.list.values()]) await origRemoveVehicle(v.id);
    items.restore([]);
    items.remote = true; vehicles.remote = true;
    // Digging done in this browser's own world (before joining) is put back
    // to fresh ground; the host's package then writes their dug chunks.
    for (const vol of claims.volumes.values()) {
      if (!vol.modified.size) continue;
      const fresh = createClaimVolume(vol.def);
      for (const ck of [...vol.modified]) { const c = readChunk(fresh, ck); writeChunk(vol, ck, c.dens, c.band); }
      vol.modified.clear();
    }
    await restore(snap);
    if (snap.mp) ctx.onMpWorld?.(snap.mp);
    const seq = snap.coop?.seq ?? 0;
    for (const s of buffered) if (s.q > seq) applySnapshot(s);
    buffered = [];
    C.loading = false; C.ready = true;
    hud.toast(`Joined ${net.host()?.n || 'the host'}'s world`, 'gold');
    ctx.onJoined?.();
  }
  function patchGuestUI() {
    hands.remote = (a) => queue(a);
    // Guests keep no item or vehicle bodies: aim at them through the meshes.
    hands.remotePick = (o, d) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(...o), new THREE.Vector3(...d), 0, 6);
      let best = items.pick(ray);
      for (const v of vehicles.list.values()) {
        if (v.group.position.distanceTo(ray.ray.origin) > 12) continue;
        const h = ray.intersectObject(v.group, true)[0];
        if (h && (!best || h.distance < best.t)) best = { t: h.distance, p: h.point.toArray(), n: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).toArray() : [0, 1, 0], id: v.id };
      }
      return best;
    };
    town.buy = (shop, item) => { ui('buy', { shop, item }); return true; };
    town.callVehicle = (id) => ui('vcall', { id });
    economy.buyClaim = (id) => { ui('claim', { id }); return 'sent'; };
    workshop.buyBlueprint = (bp) => { ui('bp', { id: bp.id }); return 'sent'; };
    workshop.build = (bp) => { ui('build', { id: bp.id }); return 'sent'; };
    workshop.scrap = () => { ui('scrap', {}); return 'sent'; };
    town.sellVehicle = async (id) => { ui('vsell', { id }); return true; };
    machines.pour = (id) => ui('pour', { id });
    auto.interact = (m) => { ui('interact', { id: m.id }); return true; };
    auto.takeFrom = (m, i) => ui('take', { id: m.id, i, sig: m.state.contents?.[i] ? takeSig(m.state.contents[i]) : null });
    bed.remote = (a) => ui(a.op, a);
    // Machine panel settings: after a click or change in an open machine
    // panel, send its settings on.
    const sendSettings = () => setTimeout(() => {
      const cur = panels.current; if (!cur || !cur.startsWith('machine:')) return;
      const m = machines.get(+cur.slice(8)); if (!m) return;
      const set = {}; for (const k of SETTINGS) if (k in m.state) set[k] = m.state[k];
      ui('mset', { id: m.id, on: m.on, set });
    }, 0);
    panels.el.addEventListener('click', sendSettings); panels.el.addEventListener('change', sendSettings);
  }

  // -------------------------------------------------------------- handlers
  net.on_('members', (list, before) => {
    if (C.role === 'host') {
      // Two members opened the same multiplayer world at once and both
      // hosted: the one who came second steps down and joins the first.
      const self = net.self?.(), other = self?.w && list.find(m => m.h && m.id !== net.id && m.w === self.w);
      if (other && (other.t < self.t || (other.t === self.t && other.id < net.id))) { ctx.onHostClash?.(); return; }
      for (const m of list) if (m.id !== net.id && !C.guests.has(m.id)) { addGuest(m); hud.toast(`${m.n} joined`, 'gold'); }
      for (const id of [...C.guests.keys()]) if (!list.some(m => m.id === id)) removeGuest(id);
    } else if (C.role === 'guest') {
      if (before.some(m => m.h) && !list.some(m => m.h)) ctx.onHostLeft?.();
    }
    ctx.onMembers?.(list);
  });
  net.on_('hi', (p) => { if (C.role !== 'host') return; const m = net.members.find(x => x.id === p.f); const g = C.guests.get(p.f) || (m && addGuest(m)); if (g) sendPackage(g); });
  net.on_('pk', (p) => { if (C.role !== 'guest' || p.to !== net.id || C.ready || C.loading || p.f !== net.host()?.id) return; if (!C.pkT0) C.pkT0 = performance.now(); C.pkLast = performance.now(); const s = net.takeBig(p); if (s) { C.stats.pkgBytes = s.length; C.stats.pkgMs = performance.now() - C.pkT0; loadPackage(s); } });
  net.on_('in', (p) => { if (C.role === 'host') onIntent(p); });
  net.on_('s', (s) => { if (C.role !== 'guest') return; const host = net.host(); if (host && s.f !== host.id) return; if (!C.ready) { buffered.push(s); if (buffered.length > 200) buffered.shift(); return; } applySnapshot(s); });
  net.on_('to', (p) => {
    if (C.role !== 'guest' || p.to !== net.id || p.f !== net.host()?.id) return;
    if (p.toast) hud.toast(p.toast[0], p.toast[1]);
    if (p.snd) audio.play(p.snd);
    if (p.tp) teleport(p.tp[0], p.tp[1], p.tp[2]);
    if (p.craft != null) { const held = items.get(p.craft); if (held) machines.openCraftMenu(held, { slot: hands.slot }, (k) => { ui('craft', { kind: k }); panels.close(); }); }
  });

  // ------------------------------------------------------------------ API
  C.host = async (fixed) => {
    const code = await net.create(fixed);
    if (typeof code !== 'string' || code.length !== 5) return code;
    C.role = 'host';
    editLog.fn = (op) => push(op);
    // Machines and vehicles appearing or going.
    const place = machines.place, layRun = machines.layRun, rem = machines.remove;
    machines.place = (...a) => { const m = place(...a); if (m) push(['mp', machineWire(m)]); return m; };
    machines.layRun = (...a) => { const m = layRun(...a); if (m) push(['mp', machineWire(m)]); return m; };
    machines.remove = (id) => { rem(id); push(['mx', id]); };
    const spawn = vehicles.spawn, vrem = vehicles.remove;
    vehicles.spawn = async (...a) => { const v = await spawn(...a); push(['vs', { id: v.id, type: v.type, pos: v.group.position.toArray(), quat: v.group.quaternion.toArray(), fuel: v.fuel, cargo: v.cargo.slice(), hopper: v.hopper.slice(), tram: v.tram }]); return v; };
    vehicles.remove = async (id) => { await vrem(id); push(['vx', id]); };
    // Sales, contracts and other gold news reach everyone.
    // Gold news (sales, contracts, builds) reaches everyone; anything else
    // said while running a guest's action goes to that guest only.
    const toast = hud.toast;
    hud.toast = (text, kind) => {
      if (kind === 'gold') { toast(text, kind); push(['t', text, kind]); return; }
      if (C.acting) { toGuest(C.acting, { toast: [text, kind || ''] }); return; }
      toast(text, kind);
    };
    // Panels a guest's action would open on the host stay shut, except the
    // end screen, which everyone sees.
    const show = panels.show;
    panels.show = (...a) => { if (a[0] === 'finale') push(['fin']); else if (C.acting) return; return show(...a); };
    // Everything that exists now is in each guest's world package.
    for (const e of items.ents.values()) sigs.set(e.id, items.sig(e));
    for (const v of vehicles.list.values()) vSig.set(v.id, `${v.cargo.join(',')}|${v.hopper.length}|${v.tram ? v.tram.line : ''}`);
    railSig = JSON.stringify(heavy.serialize()); ecSig = JSON.stringify(economy.serialize());
    machineStatus();
    return code;
  };
  C.join = async (code) => {
    const r = await net.join(code);
    if (r !== 'ok') return r;
    C.role = 'guest';
    patchGuestUI();
    net.send('hi', {}); hiT = 2; hiTries = 1;
    return 'ok';
  };
  C.leave = () => { net.leave(); };
  // Guests: get in or out of a vehicle through the host.
  C.toggleVehicle = (aimId) => {
    if (vehicles.driving) { queue({ k: 'vexit' }); return; }
    const v = aimId != null ? vehicles.list.get(aimId) : vehicles.nearest(player.cur.toArray(), 3.5);
    if (v) queue({ k: 'veh', id: v.id });
  };
  C.update = (dt) => {
    animateAvatars();
    if (C.role === 'host') {
      for (const g of C.guests.values()) poseAvatar(g.id, g.name, g.color, g.pose.p, g.pose.yaw, g.hands.hand, g.drv != null);
      if (!C.guests.size) { ops.length = 0; return; }
      scanT -= dt; if (scanT <= 0) { scanT = 1 / SCAN_HZ; scanEntities(); }
      snapT -= dt; if (snapT <= 0) { snapT = 1 / SNAP_HZ; hostSnapshot(); }
    } else if (C.role === 'guest') {
      if (!C.ready) {
        // A world package that stalls (a lost chunk) is asked for again;
        // after six tries, say so instead of waiting forever.
        if (C.pkT0 && !C.loading && performance.now() - C.pkLast > 10000) { C.pkT0 = 0; net.clearParts(); hiT = 0; }
        hiT -= dt;
        if (hiT <= 0 && !C.loading && !C.pkT0) {
          if (hiTries < 6) { hiT = 3; hiTries++; net.send('hi', {}); }
          else if (!C.gaveUp) { C.gaveUp = true; hud.toast("Couldn't load the host's world. Leave from the Co-op menu and try again.", 'err'); }
        }
        return;
      }
      inT -= dt; if (inT <= 0) { inT = 1 / IN_HZ; sendIntent(); }
    }
  };
  C.queue = (a) => queue(a);
  // Guests: leave the vehicle through the host (it clears the driver seat).
  C.exitVehicle = () => { if (vehicles.driving) { queue({ k: 'vexit' }); vehicles.driving = null; } };
  C.isGuest = () => C.role === 'guest';
  C.isHost = () => C.role === 'host';
  void MACHINES;
  return C;
}
