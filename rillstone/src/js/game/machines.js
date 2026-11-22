// Machines (BUILD_BRIEF 3.5 and 4): placed from crates on a 0.5 m grid,
// joined by pipe runs between water ports, driven by the water flow budget.
// Gameplay state is plain data the host owns; meshes and static colliders
// are derived from it. The sim tick (20 Hz) runs flow, production and wear.
import * as THREE from 'three';
import { MACHINES, PIPE_TIERS, FAMILY, spinPart, needle } from '../defs/machines.js';
import { MACHINES2 } from '../defs/machines2.js';
import { MACHINES3 } from '../defs/machines3.js';
Object.assign(MACHINES, MACHINES2, MACHINES3);
PIPE_TIERS.cable = { name: 'Signal', cap: 0, hex: 0x8a6ad8, r: 0.022, cable: true };
import { solveFlow, speedFrom, wearRate } from '../sim/flow.js';
import { rollLoot } from '../sim/loot.js';
import { MATERIALS, itemName } from '../defs/materials.js';
import { bandAtDepth, BEDROCK } from '../world/claims.js';
import { riverSilt } from '../world/valley.js';
import { EXTRA_MESH, EXTRA_BOX, EXTRA_CARD, EXTRA_MASS } from './items.js';
import * as M from '../defs/models.js';
import { paint } from '../render/geom.js';
import { h } from '../ui/dom.js';

const GRID = 0.5;
const SOCKET_SNAP = 1.0;   // how close the aim must be to a port to start/finish a pipe run
const LINK_RANGE = 1.3;    // an 'out' port feeds an 'in' port within this distance
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

// Pipe coils and crafted goods as carriable entities.
EXTRA_MESH.coil = (e) => M.coil(PIPE_TIERS[e.data.tier]?.hex ?? 0xc0704a);
EXTRA_BOX.coil = () => [0.23, 0.12, 0.23];
EXTRA_MASS.coil = (e) => 2 + e.data.m * 1.5;
EXTRA_CARD.coil = (e) => (e.data.tier === 'cable' ? { name: `Signal cable · ${e.data.m.toFixed(1)} m`, lines: ['LMB an output terminal, then an input'] } : { name: `${PIPE_TIERS[e.data.tier].name} pipe · ${e.data.m.toFixed(1)} m`, lines: [`Carries ${PIPE_TIERS[e.data.tier].cap} L/s`, 'LMB a water port, then another, to lay a run'] });
EXTRA_MESH.crafted = (e) => { const g = M.crafted(e.item.craft); const m = MATERIALS[e.item.material]; const s = 0.18 + Math.cbrt(e.item.kg) * 0.08; g.scale(s, s, s); return paint(g, m.ingot ?? m.color, 0.04); };
EXTRA_BOX.crafted = (e) => { const s = (0.18 + Math.cbrt(e.item.kg) * 0.08) * 0.4; return [s, s * 0.6, s]; };
EXTRA_MASS.crafted = (e) => Math.max(0.3, e.item.kg);

const rotY = (r) => r * Math.PI / 2;
export const fmtSig = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(2));
function toWorld(m, p) { return _v.set(p[0], p[1], p[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY(m.rot)).add(new THREE.Vector3(...m.pos)).toArray(); }
function dirWorld(m, d) { return new THREE.Vector3(d[0], d[1], d[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY(m.rot)).toArray(); }

export function createMachines({ scene, physics, materials, items, claims, water, economy, hud, audio, panels, rng, fx, height }) {
  const list = new Map();        // id -> machine
  let nextId = 2000;
  const group = new THREE.Group(); scene.add(group);
  const runMat = materials.vcolor;
  let dirty = true;              // graph needs rebuilding
  let graph = { edges: [], links: new Map() };
  let flowResult = new Map();
  const api = { list, group, clock: 0 };

  // ---- Building meshes and colliders ----
  const ghostMats = { ok: new THREE.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.38, depthWrite: false }), bad: new THREE.MeshBasicMaterial({ color: 0xff3df0, transparent: true, opacity: 0.38, depthWrite: false }) };
  // Performance (BUILD_BRIEF 8): machine bodies share one BatchedMesh, one
  // geometry per machine type, so a base of 100 machines is a handful of
  // draw calls. Logic parts keep their own mesh (levers move, labels hang off it).
  let batch = null; const batchGeo = new Map();
  function batchAdd(m, def) {
    if (!batch) { batch = new THREE.BatchedMesh(4096, 1500000, 0, materials.vcolor); batch.castShadow = batch.receiveShadow = true; batch.frustumCulled = false; group.add(batch); }
    if (!batchGeo.has(m.def)) { let geo = def.build(m.state); if (geo.index) geo = geo.toNonIndexed(); batchGeo.set(m.def, batch.addGeometry(geo)); }
    m._bi = batch.addInstance(batchGeo.get(m.def));
    batch.setMatrixAt(m._bi, new THREE.Matrix4().compose(new THREE.Vector3().fromArray(m.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY(m.rot), 0)), new THREE.Vector3(1, 1, 1)));
  }
  function buildVisual(m) {
    const def = MACHINES[m.def];
    const g = new THREE.Group();
    if (def.role === 'logic') { const body = new THREE.Mesh(def.build(m.state), materials.vcolor); body.castShadow = body.receiveShadow = true; body.userData.machine = m.id; g.add(body); }
    else batchAdd(m, def);
    if (def.spin) { const sp = new THREE.Mesh(spinPart(def), materials.vcolor); sp.position.fromArray(def.spin.at); sp.castShadow = true; g.add(sp); m._spin = sp; }
    if (def.role === 'consumer') { const n = new THREE.Mesh(needle(), materials.vcolor); m._needle = n; g.add(n); placeNeedle(m, def); } // (tiny: no shadow)
    if (def.sheet) { // the animated sheet of water running down a sluice
      const s = def.sheet, geo = new THREE.PlaneGeometry(s.w, s.z1 - s.z0, 1, 8).rotateX(-Math.PI / 2 + s.tilt);
      const mat = water.sheetMaterial(); const sh = new THREE.Mesh(geo, mat); sh.position.set(0, s.y, (s.z0 + s.z1) / 2); g.add(sh); m._sheet = sh;
    }
    if (def.glow) { const gm = new THREE.Mesh(new THREE.PlaneGeometry(def.glow.w, def.glow.h), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, toneMapped: false })); gm.position.fromArray(def.glow.at); if (def.glow.fire) gm.rotation.x = -Math.PI / 2; g.add(gm); m._glow = gm; }
    g.position.fromArray(m.pos); g.rotation.y = rotY(m.rot);
    return g;
  }
  function placeNeedle(m, def) { const d = def.build.toString().match(/dial\(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/); if (d) m._needle.position.set(+d[1], +d[2], +d[3] + 0.02); }
  function colliders(m, remove = false) {
    const def = MACHINES[m.def], ops = [];
    def.boxes.forEach((b, i) => {
      const c = toWorld(m, [b[0], b[1], b[2]]);
      // A tilted box (b[6]: pitch about the machine's local x, e.g. a chute
      // bed) goes in rotated; plain boxes swap extents for 90° turns.
      if (b[6]) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(b[6], rotY(m.rot), 0, 'YXZ'));
        ops.push({ op: 'setStaticBox', key: `m${m.id}:${i}`, hx: b[3], hy: b[4], hz: b[5], pos: c, quat: [q.x, q.y, q.z, q.w], owner: m.id, group: 'machine', friction: def.slick ?? undefined, remove });
        return;
      }
      const swap = m.rot % 2 === 1;
      ops.push({ op: 'setStaticBox', key: `m${m.id}:${i}`, hx: swap ? b[5] : b[3], hy: b[4], hz: swap ? b[3] : b[5], pos: c, owner: m.id, group: 'machine', remove });
    });
    return ops;
  }
  function addVisual(m) { m._g = buildVisual(m); group.add(m._g); api.onVisual?.(m); }
  function removeVisual(m) {
    if (m._bi != null && batch) { batch.deleteInstance(m._bi); m._bi = null; }
    if (m._g) { group.remove(m._g); m._g.traverse(o => o.geometry?.dispose()); m._g = null; }
  }

  // ---- Pipe runs: a tube between two ports ----
  function runCurve(a, b) {
    const pa = new THREE.Vector3(...a.p), pb = new THREE.Vector3(...b.p);
    const da = new THREE.Vector3(...a.d), db = new THREE.Vector3(...b.d);
    const len = pa.distanceTo(pb);
    const k = Math.min(0.6, len * 0.3);
    const mid = pa.clone().lerp(pb, 0.5);
    mid.y = Math.max(mid.y, pa.y, pb.y, (height ? height(mid.x, mid.z) + 0.25 : -1e9));
    return new THREE.CatmullRomCurve3([pa, pa.clone().addScaledVector(da, k), mid, pb.clone().addScaledVector(db, k), pb]);
  }
  function runVisual(m) {
    const t = PIPE_TIERS[m.tier];
    const a = portOf(m.a), b = portOf(m.b);
    if (!a || !b) return null;
    const curve = runCurve(a, b);
    const geo = paint(new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(m.len * 4)), t.r, 8, false), t.hex, 0.05);
    const mesh = new THREE.Mesh(geo, runMat); mesh.castShadow = true; mesh.userData.machine = m.id;
    const g = new THREE.Group(); g.add(mesh);
    // Brass collars every metre.
    for (let s = 0.5; s < m.len; s += 1) { const p = curve.getPointAt(s / m.len); const c = new THREE.Mesh(paint(new THREE.CylinderGeometry(t.r * 1.3, t.r * 1.3, 0.05, 10), 0xc89a48, 0.04), runMat); c.position.copy(p); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(s / m.len)); g.add(c); }
    return g;
  }
  // World position/direction of a machine's socket: ref = { m: id, s: index }.
  function portOf(ref) {
    const m = list.get(ref.m); if (!m) return null;
    const s = MACHINES[m.def].sockets[ref.s]; if (!s) return null;
    return { p: toWorld(m, s.p), d: dirWorld(m, s.d), kind: s.kind, m: m.id, s: ref.s };
  }
  const portUsed = (ref) => { for (const m of list.values()) if (m.run && ((m.a.m === ref.m && m.a.s === ref.s) || (m.b.m === ref.m && m.b.s === ref.s))) return true; return false; };
  // Free water ports near a point.
  function freePortNear(p, maxD = SOCKET_SNAP, cable = false) {
    let best = null, bd = maxD;
    for (const m of list.values()) {
      if (m.run) continue;
      MACHINES[m.def].sockets.forEach((s, i) => {
        if (cable ? !s.kind.startsWith('sig') : s.kind !== 'water') return;
        const w = toWorld(m, s.p), d = Math.hypot(w[0] - p[0], w[1] - p[1], w[2] - p[2]);
        // Signal outputs can feed several cables; inputs and water ports take one.
        if (d < bd && (s.kind === 'sig-out' || !portUsed({ m: m.id, s: i }))) { bd = d; best = { m: m.id, s: i, p: w, kind: s.kind }; }
      });
    }
    return best;
  }

  // ---- Create / remove ----
  api.place = (defId, pos, rot = 0, state = {}, opts = {}) => {
    const def = MACHINES[defId];
    const m = { id: opts.id || nextId++, def: defId, pos: pos.slice(), rot: ((rot % 4) + 4) % 4, locked: !!opts.locked, wear: opts.wear || 0, on: opts.on ?? true, state: { ...defaultState(def), ...state } };
    nextId = Math.max(nextId, m.id + 1);
    list.set(m.id, m); addVisual(m);
    physics.post({ op: 'batch', ops: colliders(m) });
    dirty = true;
    return m;
  };
  api.layRun = (tier, a, b, opts = {}) => {
    const pa = portOf(a), pb = portOf(b); if (!pa || !pb) return null;
    const len = Math.hypot(pa.p[0] - pb.p[0], pa.p[1] - pb.p[1], pa.p[2] - pb.p[2]) * 1.1 + 0.3;
    const m = { id: opts.id || nextId++, run: true, tier, a: { ...a }, b: { ...b }, len, locked: true };
    nextId = Math.max(nextId, m.id + 1);
    list.set(m.id, m); m._g = runVisual(m); if (m._g) group.add(m._g);
    dirty = true;
    return m;
  };
  api.remove = (id) => {
    const m = list.get(id); if (!m) return;
    removeVisual(m);
    if (!m.run) {
      physics.post({ op: 'batch', ops: colliders(m, true) });
      for (const r of [...list.values()]) if (r.run && (r.a.m === id || r.b.m === id)) api.remove(r.id);
      // Anything riding a removed belt drops off.
      for (const q of m.state?.lanes || []) for (const it of q) { const e = items.get(it.eid); if (e && e.loc === 'belt') { items.hideEnt(e); e.loc = 'held'; items.place(e.id, [e.pos[0], e.pos[1] + 0.1, e.pos[2]]); } }
      // The lanes are empty now (a crate keeps this state for re-placing).
      if (m.state?.lanes) m.state.lanes = m.state.lanes.map(() => []);
    }
    list.delete(id); dirty = true;
  };
  function defaultState(def) {
    const s = {};
    if (def.role === 'source') s.throttle = 1;
    if (def.hopper) s.loads = [];
    if (def.role === 'consumer') s.progress = 0;
    if (def.role === 'tank') s.level = 0;
    if (def.role === 'booster' || def.fuelPerSec) s.fuel = 0;
    if (def.meltRate) { s.material = null; s.ore = 0; s.molten = 0; s.reheat = []; }
    if (def.role === 'belt') s.lanes = def.lanes.map(() => []);
    if (def.role === 'container') s.contents = [];
    if (def.role === 'shaftuser') s.queue = [];
    return s;
  }
  api.has = (id) => list.has(id);
  api.get = (id) => list.get(id);

  // ---- Graph: water edges from pipe runs; item links from out->in ports ----
  function rebuild() {
    const edges = [];
    for (const m of list.values()) if (m.run && m.tier !== 'cable') { edges.push([m.a.m, m.id], [m.id, m.b.m]); }
    const links = new Map();
    const outs = [], ins = [];
    for (const m of list.values()) {
      if (m.run) continue;
      MACHINES[m.def].sockets.forEach((s, i) => { if (s.kind === 'out') outs.push({ m, s: i, p: toWorld(m, s.p) }); if (s.kind === 'in') ins.push({ m, s: i, p: toWorld(m, s.p) }); });
    }
    for (const o of outs) {
      let best = null, bd = LINK_RANGE;
      for (const i of ins) { if (i.m === o.m) continue; const d = Math.hypot(o.p[0] - i.p[0], o.p[1] - i.p[1], o.p[2] - i.p[2]); if (d < bd) { bd = d; best = i; } }
      if (best) { links.set(`${o.m.id}:${o.s}`, { m: best.m.id, s: best.s }); if (!links.has(o.m.id)) links.set(o.m.id, best.m.id); }
    }
    graph = { edges, links };
    dirty = false;
    api.version = (api.version || 0) + 1;
  }
  api.linkOf = (id) => { if (dirty) rebuild(); return graph.links.get(id); };
  api.linkOfSocket = (id, s) => { if (dirty) rebuild(); return graph.links.get(`${id}:${s}`); };
  api.isDirty = () => dirty;

  // ---- Validity: water for intakes, an owned claim for drills ----
  function requirement(defId, pos, rot) {
    const def = MACHINES[defId], fake = { pos, rot };
    if (def.needsWater) { const p = toWorld(fake, def.needsWater); if (!water.contains(p[0], p[1] - 0.3, p[2])) return 'The intake mouth must sit in the river'; }
    if (def.needsClaim) {
      const vol = claims.volumeAt(pos[0], pos[2], pos[1]);
      if (!vol) return 'Drills only work inside a claim';
      if (!economy.owns(vol.id)) return `You don't own ${vol.def.name}`;
    }
    return null;
  }
  api.requirement = requirement;

  // ---- Sim tick ----
  api.tick = (dt) => {
    api.clock += dt;
    if (dirty) rebuild();
    const nodes = [];
    for (const m of list.values()) {
      if (m.run) { if (m.tier !== 'cable') nodes.push({ id: m.id, kind: 'pipe', cap: PIPE_TIERS[m.tier].cap }); continue; }
      const def = MACHINES[m.def];
      const n = { id: m.id, kind: def.drive ? 'consumer' : ['none', 'belt', 'logic', 'container', 'shaftuser'].includes(def.role) ? 'other' : def.role === 'tank' ? 'tank' : def.role };
      if (def.drive) n.demand = def.demand, n.on = m.on;
      if (def.role === 'source') { m.valid = !requirement(m.def, m.pos, m.rot); n.flow = m.on && m.valid ? def.flow * (m.state.throttle ?? 1) : 0; n.silt = riverSilt(m.pos[2]); }
      if (def.role === 'consumer') { n.demand = def.demand; n.on = m.on && m.wear < 1 && m.status !== 'too hard' && m.status !== 'no claim' && m.status !== 'Ember Seam only'; }
      if (def.role === 'pipe') n.cap = m.closed ? 0 : def.cap;
      if (def.role === 'source' && m.closed) n.flow = 0;
      if (def.role === 'tank') n.tank = { level: m.state.level, cap: def.tankCap };
      if (def.role === 'booster') n.fuelled = m.on && m.state.fuel > 0;
      nodes.push(n);
      m._node = n;
    }
    flowResult = solveFlow(nodes, graph.edges, dt);
    for (const m of list.values()) {
      if (m.run) continue;
      const def = MACHINES[m.def], r = flowResult.get(m.id) || {};
      m.flow = r;
      if (def.role === 'tank') m.state.level = m._node.tank.level;
      if (def.role === 'booster' && m._node.fuelled && (r.net?.demand > 0)) m.state.fuel = Math.max(0, m.state.fuel - def.fuelPerSec * dt);
      if (def.role === 'consumer' && !def.meltRate && !def.shaft) consumerTick(m, def, r, dt);
      if (def.role === 'consumer' && (def.meltRate || def.shaft)) { m.speed = m.on ? speedFrom(r.satisfaction || 0) : 0; }
      if (def.meltRate) furnaceTick(m, def, dt);
    }
    for (const f of api.extraTick) f(dt);
  };
  api.extraTick = [];
  function consumerTick(m, def, r, dt) {
    const sat = r.satisfaction || 0;
    m.speed = m.on ? speedFrom(sat) * (1 - 0.6 * m.wear) : 0;
    if (!m.on || m.wear >= 1) { m.status = m.wear >= 1 ? 'broken' : 'off'; return; }
    // Silt wears drills and sluices: 1% a minute per point above 4.
    const silt = r.net?.silt ?? 0;
    if (sat > 0) m.wear = Math.min(1, m.wear + wearRate(silt) * dt * (m.speed > 0 ? 1 : 0));
    if (m.wear > 0.6 && Math.random() < dt * 0.6 && fx) fx.burst(toWorld(m, [0, 1.0, 0]), 0xffd27a, 6, { speed: 2, size: 0.025, life: 0.3 });
    // A drill that can't dig at all says why (it's kept off the water network
    // for that, so "no water" would flicker with it every other tick).
    if (m.def.startsWith('drill')) { const why = drillBlock(m, def); if (why) { m.status = why; return; } }
    if (sat <= 0) { m.status = 'no water'; return; }
    if (m.def.startsWith('drill')) drillTick(m, def, dt);
    else if (def.hopper) sluiceTick(m, def, sat, dt);
  }
  // Why a drill can't dig here at all (null when it can); sets m.band/depth.
  function drillBlock(m, def) {
    const vol = claims.volumeAt(m.pos[0], m.pos[2], m.pos[1]);
    if (!vol || !economy.owns(vol.id)) return 'no claim';
    if (def.emberOnly && vol.id !== 'ember') return 'Ember Seam only';
    const depth = vol.depthAt(m.pos[0], m.pos[1] - def.tipDepth);
    const band = depth > vol.def.depth ? BEDROCK : bandAtDepth(Math.max(0, depth));
    m.band = band; m.depth = depth; m._vol = vol;
    return band === BEDROCK || band > def.tier ? 'too hard' : null;
  }
  function drillTick(m, def, dt) {
    const vol = m._vol, tipY = m.pos[1] - def.tipDepth, depth = m.depth, band = m.band;
    m.state.progress += dt * m.speed / def.period;
    m.status = 'running';
    if (m.state.progress >= 1) {
      const load = { band, depth: Math.max(0, depth), claim: vol.id };
      const vein = vol.veinAt(m.pos[0], tipY, m.pos[2]); if (vein) load.vein = vein;
      if (output(m, { load })) { m.state.progress -= 1; m.blocked = false; m.made = (m.made || 0) + 1; }
      else { m.state.progress = 1; m.blocked = true; m.status = 'output blocked'; }
    }
  }
  function sluiceTick(m, def, sat, dt) {
    // Finds that couldn't leave yet wait here; the sluice stalls until they do.
    const outq = m.state.outq || (m.state.outq = []);
    while (outq.length && output(m, { item: outq[0] })) outq.shift();
    if (outq.length) { m.status = 'output blocked'; m.blocked = true; return; }
    m.blocked = false;
    if (!m.state.loads.length) { m.status = 'waiting for gravel'; m.state.progress = 0; return; }
    m.status = 'running';
    m.state.progress += dt * m.speed * (m.state.loads[0].screened ? 1.25 : 1) / def.period;
    if (m.state.progress >= 1) {
      m.state.progress -= 1;
      const load = m.state.loads.shift();
      const lo = { band: load.band, depth: load.depth, vein: load.vein ? { material: load.vein } : null };
      const finds = [rollLoot(rng, lo)];
      if (rng() < 0.1 * sat) finds.push(rollLoot(rng, lo)); // bonus roll
      for (const it of finds) if (!output(m, { item: it })) outq.push(it);
      m.washed = (m.washed || 0) + 1;
      api.washed = (api.washed || 0) + 1;
    }
  }
  // Pass a load or an item out of a machine: into a linked machine if there
  // is one, otherwise onto the ground at its out port.
  function output(m, what) {
    const outIdx = what.socket ?? MACHINES[m.def].sockets.findIndex(s => s.kind === 'out');
    const link = outIdx >= 0 ? api.linkOfSocket(m.id, outIdx) : null;
    const target = link && list.get(link.m);
    if (target) {
      if (what.load && MACHINES[target.def].hopper && !MACHINES[target.def].role.startsWith('belt')) {
        if (target.state.loads.length >= MACHINES[target.def].hopper) return false;
        if (MACHINES[target.def].tier && what.load.band > MACHINES[target.def].tier) return false; // too hard for that sluice
        target.state.loads.push(what.load); return true;
      }
      if (api.accept) { const r = api.accept(target, what, link.s, m); if (r !== undefined) return r; }
    }
    const sock = MACHINES[m.def].sockets[outIdx];
    const p = toWorld(m, sock ? sock.p : [0, 1, 0]), d = dirWorld(m, sock ? sock.d : [0, 0, 1]);
    if (what.load) {
      // Dumped loads pile up as clods; too many and the drill jams.
      let near = 0; for (const e of items.ents.values()) if (e.type === 'clod' && e.loc === 'loose' && Math.hypot(e.pos[0] - p[0], e.pos[2] - p[2]) < 1.6) near++;
      if (near >= 8) return false;
      items.spawn('clod', [p[0] + d[0] * 0.3, p[1], p[2] + d[2] * 0.3], { data: { band: what.load.band, depth: what.load.depth, loads: [what.load] }, vel: [d[0], 0.5, d[2]] });
      return true;
    }
    if (what.item) {
      if (what.item.material && !what.item.craft && !what.item.hotUntil && what.item.stage !== 'crafted') {
        const e = items.spawn('nugget', [p[0] + d[0] * 0.15 + (Math.random() - 0.5) * 0.1, p[1] + 0.05, p[2] + d[2] * 0.15], { item: what.item, vel: [d[0] * 1.2, 0.4, d[2] * 1.2] });
        return e;
      }
      items.spawn(what.item.stage === 'crafted' ? 'crafted' : 'nugget', [p[0] + d[0] * 0.2, p[1] + 0.1, p[2] + d[2] * 0.2], { item: what.item });
      return true;
    }
    return false;
  }
  api.output = output;
  api._int = { toWorld, dirWorld, portOf, MACHINES, consume: (held, H) => consume(held, H), flowOf: (id) => flowResult.get(id) };
  function furnaceTick(m, def, dt) {
    const s = m.state;
    const hot = (def.fuelPerSec ? s.fuel > 0 : true) && (def.role !== 'consumer' || (m.speed || 0) > 0.21 || (m.flow?.satisfaction || 0) > 0);
    m.status = s.ore > 0 ? (hot ? 'melting' : 'needs quartz') : s.molten > 0 ? 'ready to pour' : 'empty';
    if (hot && (s.ore > 0 || s.reheat.length)) {
      if (def.fuelPerSec) s.fuel = Math.max(0, s.fuel - def.fuelPerSec * dt);
      const melt = Math.min(s.ore, def.meltRate * dt * (def.role === 'consumer' ? (m.speed || 0.2) : 1));
      s.ore -= melt; s.molten += melt;
      for (const r of s.reheat) r.t += dt;
      // A finished ingot the way out refuses (a full belt or bin) waits inside.
      s.reheat = s.reheat.filter(r => r.t < 20 || !output(m, { item: { ...r.item, hotUntil: items.clock + 90 } }));
    }
    // Firewood chars into a sack of charcoal while the kiln burns.
    if (s.wood > 0 && def.fuelPerSec && s.fuel > 0) {
      if (!(s.ore > 0 || s.reheat.length)) s.fuel = Math.max(0, s.fuel - def.fuelPerSec * dt);
      s.charT = (s.charT || 0) + dt;
      if (s.charT >= 40) {
        s.charT = 0; s.wood--;
        const out = def.sockets?.find(k => k.kind === 'out'), p = toWorld(m, out ? out.p : [0, 1.2, 1.2]);
        items.spawn('sack', [p[0], p[1] + 0.2, p[2]]);
        hud.toast('The kiln turned out a sack of charcoal');
      }
    }
    // The smelter pours by itself once full (unless set to pour on a pulse only).
    // "Full" means no room for another typical piece (3 kg), since intake
    // refuses anything that would overflow. A blocked pour waits 5 s.
    if (def.pourOnPulse && s.ore <= 0 && s.molten >= def.capKg - 3 && !s.pulseOnly) {
      if ((m._pourWait = (m._pourWait || 0) - dt) <= 0 && !api.pour(m.id, true)) m._pourWait = 5;
    }
    if (m._glow) m._glow.material.opacity = hot && (s.ore > 0 || s.molten > 0 || s.reheat.length) ? 0.55 + Math.sin(api.clock * 9) * 0.1 : 0;
  }
  // Pour the molten metal into an ingot (lever, panel, or a logic pulse in M5).
  api.pour = (id, quiet) => {
    const m = list.get(id); if (!m || !m.state || m.state.molten < 0.05) return null;
    const kg = Math.round(m.state.molten * 1000) / 1000;
    const it = { material: m.state.material, stage: 'ingot', kg, hotUntil: items.clock + 90 };
    const mat = m.state.material;
    m.state.molten = 0; if (m.state.ore <= 0) m.state.material = null;
    // Nothing is deleted: if the out port refuses the ingot, the metal stays molten.
    if (output(m, { item: it }) === false) { m.state.molten = kg; m.state.material = mat; if (!quiet) { hud.toast('The way out is blocked: clear the belt or bin first', 'err'); audio.play('error'); } return null; }
    audio.play('pour'); hud.toast(`Poured a ${kg.toFixed(1)} kg ${MATERIALS[it.material].name.toLowerCase()} ingot`, 'gold');
    for (const k of economy.smelted?.(it.material, kg) || []) { audio.play('contract'); hud.toast(`Contract done: ${k.text} · § ${k.reward} · ★ +${k.standing}`, 'gold'); }
    return it;
  };

  // ---- Using things on machines (from the hands) ----
  // Returns true when the click did something.
  api.useOn = (id, held, H) => {
    const m = list.get(id); if (!m || m.run) { if (m && m.run && held?.type === 'mallet') { hud.toast('Pipe runs: unlock a machine at either end and pick it up to remove a run'); return true; } return false; }
    const def = MACHINES[m.def];
    if (!held) return false;
    if (held.type === 'mallet') { m.locked = true; audio.play('drop'); hud.toast(`${def.name} locked`); return true; }
    if (held.type === 'wrench' || held.type === 'repairkit') {
      if (m.wear <= 0.001) { hud.toast(`${def.name} is in good order`); return true; }
      if (held.type === 'repairkit') { m.wear = 0; held.data.uses = (held.data.uses ?? 5) - 1; if (held.data.uses <= 0) { items.remove(held.id); H.hand = null; hud.toast('Repair kit used up'); } }
      else m.wear = Math.max(0, m.wear - 0.1);
      audio.play('clink'); hud.toast(`${def.name}: wear ${(m.wear * 100).toFixed(0)}%`); return true;
    }
    // Gravel loads from a shovel or bucket into a hopper.
    if (def.hopper && held.data?.loads?.length) {
      let n = 0;
      while (held.data.loads.length && m.state.loads.length < def.hopper) {
        const l = held.data.loads[held.data.loads.length - 1];
        if (l.band > def.tier) { hud.toast(`This sluice only washes band ${def.tier}; needs a Mk ${['', 'I', 'II', 'III', 'IV'][l.band]}`, 'err'); break; }
        m.state.loads.push(held.data.loads.pop()); n++;
      }
      if (n) { items.refresh(held.id); audio.play('pour'); H.play?.('pour'); }
      else if (m.state.loads.length >= def.hopper) hud.toast('Hopper full', 'err');
      return true;
    }
    const it = held.item;
    if (def.role === 'container' && (it || held.type === 'crafted')) {
      if (api.accept(m, { item: held.item }, 0) === true) { consume(held, H); audio.play('drop'); hud.toast(`Into the ${def.name.toLowerCase()} (${m.state.contents.length})`); }
      else hud.toast(`${def.name} is full`, 'err');
      return true;
    }
    // Firewood into the kiln chars into charcoal (BUILD_BRIEF 3.7).
    if (m.def === 'kiln' && held.type === 'firewood') {
      if ((m.state.wood || 0) >= 4) { hud.toast('The kiln holds 4 bundles at a time', 'err'); return true; }
      m.state.wood = (m.state.wood || 0) + 1; consume(held, H); audio.play('drop');
      hud.toast(m.state.fuel > 0 ? `Charring ${m.state.wood} bundle${m.state.wood > 1 ? 's' : ''} of firewood (40 s each)` : 'Firewood in: it chars once the kiln has quartz to burn');
      return true;
    }
    // Ore into a furnace; quartz as fuel; cold ingots to reheat.
    if (def.meltRate && it) {
      if (it.material === 'quartz' && def.fuelPerSec) { m.state.fuel += it.kg * 60 / 60; consume(held, H); hud.toast(`${def.name} fuel: ${m.state.fuel.toFixed(1)} kg quartz`); return true; }
      if (it.stage === 'ingot') { m.state.reheat.push({ item: { ...it, hotUntil: 0 }, t: 0 }); consume(held, H); hud.toast('Reheating — the ingot comes out hot in 20 s'); return true; }
      if (it.stage !== 'ore' || MATERIALS[it.material].kind !== 'metal') { hud.toast(`${def.name} melts metal ore only`, 'err'); audio.play('error'); return true; }
      if (m.state.material && m.state.material !== it.material) { hud.toast(`No alloys: the ${def.name.toLowerCase()} already holds ${MATERIALS[m.state.material].name.toLowerCase()}. Pour it first.`, 'err'); audio.play('error'); return true; }
      if (m.state.ore + m.state.molten + it.kg > def.capKg) { hud.toast(`${def.name} is full (${def.capKg} kg)`, 'err'); return true; }
      m.state.material = it.material; m.state.ore += it.kg; consume(held, H); audio.play('drop');
      hud.toast(`${MATERIALS[it.material].name}: ${(m.state.ore + m.state.molten).toFixed(1)} kg in the ${def.name.toLowerCase()}`);
      return true;
    }
    if (def.role === 'booster' && it && it.material === 'quartz') { m.state.fuel += it.kg; consume(held, H); hud.toast(`Booster fuel: ${m.state.fuel.toFixed(1)} kg quartz`); return true; }
    if (m.def === 'sawbench' && it) {
      const k = MATERIALS[it.material].kind;
      if (!(it.stage === 'ingot' || (k === 'gem' && (it.stage === 'uncut' || it.stage === 'cut')))) { hud.toast('The saw splits ingots and gems', 'err'); return true; }
      const cut = m.state.cutKg || 1;
      if (it.kg < cut + 0.05) { hud.toast(`Lighter than the ${cut} kg cut: set a smaller cut (RMB)`, 'err'); return true; }
      // You keep the cut piece; the rest lands on the bench.
      const rest = { ...it, kg: Math.round((it.kg - cut) * 1000) / 1000 }; delete rest.grind;
      // Sawn gems don't count towards "deliver N gems" contracts (no farming
      // one stone into many).
      if (k === 'gem') { rest.sawn = true; it.sawn = true; }
      it.kg = cut; items.refresh(held.id); H.refreshHeld?.();
      const p = toWorld(m, [0.25, 0.95, 0.1]);
      items.spawn('nugget', p, { item: rest });
      audio.play('clink'); fx?.burst(toWorld(m, [0, 0.9, 0.15]), 0xffe0a0, 10, { speed: 2, size: 0.02, life: 0.3 });
      hud.toast(`Cut off ${cut} kg · ${rest.kg.toFixed(2)} kg left on the bench`);
      return true;
    }
    if (m.def === 'grinder' && it) {
      if (MATERIALS[it.material].kind !== 'gem' || it.stage !== 'uncut') { hud.toast('The wheel cuts uncut gems', 'err'); return true; }
      it.grind = (it.grind || 0) + 1; audio.play('swish'); fx?.burst(toWorld(m, [0, 0.85, 0.3]), 0xfff4e0, 8, { speed: 1.5, size: 0.02, life: 0.3 });
      if (it.grind >= 3) { it.stage = 'cut'; it.kg = Math.round(it.kg * 0.85 * 1000) / 1000; delete it.grind; audio.play('rare'); hud.toast(`${itemName(it)} · ${it.kg.toFixed(2)} kg`, 'gold'); }
      else hud.toast(`Grinding… ${it.grind}/3`);
      H.refreshHeld?.();
      return true;
    }
    if (m.def === 'workbench' && it) {
      if (it.stage !== 'ingot') { hud.toast('The workbench needs a hot ingot', 'err'); return true; }
      if (!(it.hotUntil > items.clock)) { hud.toast('Too cold to work — reheat it in a kiln for 20 s', 'err'); return true; }
      openCraft(held, H); return true;
    }
    return false;
  };
  function consume(held, H) { items.remove(held.id); if (H.hand === held.id) H.hand = null; }
  // Workbench: hot ingot (+ a cut gem in the swap slot) -> crafted goods.
  // Make a crafted good from the held hot ingot (+ the cut gem in the swap slot).
  function craft(held, H, k) {
    const gem = H.slot ? items.get(H.slot) : null, gemOk = gem && gem.item && gem.item.stage === 'cut', it = held.item;
    const out = { material: it.material, stage: 'crafted', craft: k, kg: it.kg };
    if (gemOk && (k === 'ring' || k === 'chalice')) { out.gem = { ...gem.item }; items.remove(gem.id); H.slot = null; }
    items.remove(held.id); H.hand = null;
    const e = items.spawn('crafted', [0, 0, 0], { item: out, loc: 'held' }); H.hand = e.id;
    audio.play('rare'); hud.toast(`Made a ${itemName(out).toLowerCase()}`, 'gold');
    return e;
  }
  api.craft = craft;
  function openCraft(held, H) {
    // A co-op guest's workbench: the menu opens on their screen instead.
    if (H.remoteCraft) return H.remoteCraft(held);
    api.openCraftMenu(held, H, (k) => {
      // The menu can stay open a while: check the ingot is still in hand and hot.
      if (H.hand !== held.id || !items.get(held.id)) { panels.close(); return; }
      if (!(held.item.hotUntil > items.clock)) { hud.toast('It cooled while you chose — reheat it in a kiln', 'err'); panels.close(); return; }
      craft(held, H, k); panels.close();
    });
  }
  api.openCraftMenu = (held, H, onMake) => {
    const gem = H.slot ? items.get(H.slot) : null;
    const gemOk = gem && gem.item && gem.item.stage === 'cut';
    const it = held.item;
    const opts = [['toolhead', 'Tool head', '×1.1'], ['ring', 'Ring', '×1.15'], ['chain', 'Chain', '×1.2'], ['chalice', 'Chalice', '×1.3']];
    const body = h('div', {}, h('p', { class: 'small' }, `${itemName(it)} · ${it.kg.toFixed(2)} kg. ${gemOk ? `Rings and chalices get the ${itemName(gem.item).toLowerCase()} from your swap slot set in.` : 'Hold a cut gem in your swap slot to set it into a ring or chalice.'}`),
      ...opts.map(([k, name, mult]) => h('div', { class: 'entry' }, h('b', {}, name), h('button', { class: 'btn primary', onclick: () => onMake(k) }, 'Make'), h('span', { class: 'desc' }, `Value ${mult}${k === 'ring' || k === 'chalice' ? ' · can hold a gem' : ''}`))));
    panels.show('craft', 'Workbench', body);
  };

  // ---- Machine panel (RMB) ----
  api.openPanel = (id) => {
    const m = list.get(id); if (!m || m.run) return;
    const def = MACHINES[m.def];
    const render = () => {
      const f = m.flow || {}, net = f.net || {};
      const rows = [];
      const row = (k, v) => rows.push(h('div', { class: 'entry' }, h('b', {}, k), h('span', { class: 'pill' }, v)));
      if (def.role === 'consumer' && !def.shaft && !def.drive) {
        row('Status', m.status || 'idle');
        row('Water', `${(f.flow || 0).toFixed(0)} / ${def.demand} L/s · ${Math.round((f.satisfaction || 0) * 100)}%`);
        row('Speed', `${Math.round((m.speed || 0) * 100)}% of nominal`);
        if (!def.meltRate) row('Wear', `${Math.round(m.wear * 100)}% · silt ${net.silt ?? 0}`);
        if (m.def.startsWith('drill')) row('Tip', m.band ? `band ${m.band} · ${m.depth.toFixed(1)} m down` : '—');
        if (def.hopper) row('Hopper', `${m.state.loads.length} / ${def.hopper} loads`);
      }
      if (def.role === 'source') { row('Status', m.valid ? `drawing ${(def.flow * m.state.throttle).toFixed(0)} L/s` : 'mouth not in the river'); }
      if (def.role === 'tank') row('Level', `${Math.round(m.state.level)} / ${def.tankCap} L`);
      if (def.role === 'booster') row('Fuel', `${m.state.fuel.toFixed(2)} kg quartz (1 kg a minute)`);
      if (m.state.wood) row('Firewood', `${m.state.wood} bundle${m.state.wood > 1 ? 's' : ''} charring · ${Math.floor(40 - (m.state.charT || 0))} s to the next sack`);
      if (def.meltRate) { row('Contents', m.state.material ? `${MATERIALS[m.state.material].name} · ${m.state.ore.toFixed(1)} kg ore, ${m.state.molten.toFixed(1)} kg molten` : 'empty'); if (def.fuelPerSec) row('Fuel', `${m.state.fuel.toFixed(2)} kg quartz`); if (m.state.reheat.length) row('Reheating', `${m.state.reheat.length} ingot(s)`); }
      if (net.demand !== undefined && def.role !== 'none' && def.role !== 'logic' && def.role !== 'belt' || def.drive) row('Network', `${net.supply.toFixed(0)} L/s supply · ${net.demand.toFixed(0)} L/s demand`);
      const controls = h('div', { class: 'col' });
      api.panelRows?.(m, row, controls, render);
      if (!['none', 'pipe', 'logic', 'container'].includes(def.role) && !(def.role === 'belt' && !def.drive)) controls.append(h('button', { class: 'btn', onclick: () => { m.on = !m.on; render(); } }, m.on ? 'Switch off' : 'Switch on'));
      if (def.role === 'source') controls.append(h('div', { class: 'entry' }, h('b', {}, 'Intake valve'), h('span', {}, ...[0.25, 0.5, 0.75, 1].map(v => h('button', { class: 'btn' + (m.state.throttle === v ? ' primary' : ''), style: { marginLeft: '4px', padding: '6px 10px' }, onclick: () => { m.state.throttle = v; render(); } }, `${v * 100}%`)))));
      if (def.meltRate) controls.append(h('button', { class: 'btn primary', disabled: m.state.molten < 0.05, onclick: () => { api.pour(m.id); render(); } }, `Pour (${m.state.molten.toFixed(1)} kg)`));
      if (m.def === 'sawbench') controls.append(h('div', { class: 'entry' }, h('b', {}, 'Cut'), h('span', {}, ...[0.25, 0.5, 1, 2, 5, 10].map(v => h('button', { class: 'btn' + ((m.state.cutKg || 1) === v ? ' primary' : ''), style: { marginLeft: '4px' }, onclick: () => { m.state.cutKg = v; render(); } }, `${v} kg`)))));
      if (def.pourOnPulse) controls.append(h('div', { class: 'entry' }, h('b', {}, 'When full'), h('button', { class: 'btn', onclick: () => { m.state.pulseOnly = !m.state.pulseOnly; render(); } }, m.state.pulseOnly ? 'Waits for a pulse' : 'Pours by itself')));
      panels.show('machine:' + id, def.name, h('div', {}, h('p', { class: 'small' }, `${m.locked ? 'Locked with the mallet' : 'Unlocked: E picks it up, the mallet locks it'}`), ...rows, controls), { badge: def.family });
    };
    render();
  };

  // ---- Placement ghost (holding a crate) ----
  let ghost = null, ghostDef = null;
  const placeRot = { r: 0 };
  // Socket snapping (BUILD_BRIEF 4): an item socket of the ghost within
  // 0.6 m of a facing, opposite socket on a placed machine pulls the ghost
  // onto it, so belts, bins and furnaces line up and link.
  function snapToSocket(defId, pos, rot) {
    const gdef = MACHINES[defId], fake = { pos, rot };
    let best = null, bd = 0.6;
    for (const gs of gdef.sockets || []) {
      if (gs.kind !== 'in' && gs.kind !== 'out') continue;
      const gp = toWorld(fake, gs.p), gd = dirWorld(fake, gs.d);
      for (const m of list.values()) {
        if (m.run || Math.hypot(m.pos[0] - pos[0], m.pos[2] - pos[2]) > 5) continue;
        for (const ms of MACHINES[m.def].sockets || []) {
          if (ms.kind !== (gs.kind === 'in' ? 'out' : 'in')) continue;
          const md = dirWorld(m, ms.d);
          if (gd[0] * md[0] + gd[2] * md[2] > -0.9) continue; // they must face each other
          const mp = toWorld(m, ms.p), dx = mp[0] - gp[0], dy = mp[1] - gp[1], dz = mp[2] - gp[2], d = Math.hypot(dx, dz);
          if (d < bd && Math.abs(dy) < 0.6) { bd = d; best = [dx, dy, dz]; }
        }
      }
    }
    return best ? [pos[0] + best[0], pos[1] + best[1], pos[2] + best[2]] : pos;
  }
  api.ghost = (defId, aim, input, dt) => {
    if (!defId) { if (ghost) { scene.remove(ghost); ghost = null; ghostDef = null; } return null; }
    if (defId !== ghostDef) {
      if (ghost) scene.remove(ghost);
      ghost = new THREE.Mesh(MACHINES[defId].build({}), ghostMats.ok); ghost.renderOrder = 5; scene.add(ghost); ghostDef = defId;
    }
    if (input && (input.pressed('rotX') || input.pressed('rotY') || input.pressed('rotZ'))) placeRot.r = (placeRot.r + (input.reverse ? 3 : 1)) % 4;
    if (!aim) { ghost.visible = false; return null; }
    ghost.visible = true;
    let pos = [Math.round(aim.p[0] / GRID) * GRID, aim.p[1], Math.round(aim.p[2] / GRID) * GRID];
    // Face snapping: aiming at the side of a machine places flush against it.
    if (aim.machine && Math.abs(aim.n[1]) < 0.5) { pos[0] = Math.round((aim.p[0] + aim.n[0] * 0.5) / GRID) * GRID; pos[2] = Math.round((aim.p[2] + aim.n[2] * 0.5) / GRID) * GRID; pos[1] = list.get(aim.machine)?.pos[1] ?? pos[1]; }
    pos = snapToSocket(defId, pos, placeRot.r);
    const why = requirement(defId, pos, placeRot.r);
    ghost.position.fromArray(pos); ghost.rotation.y = rotY(placeRot.r);
    api._ghostPos = pos; api._ghostWhy = why;
    return { pos, rot: placeRot.r, why };
  };
  // Is the ghost's footprint free? (Asynchronous physics overlap query.)
  api.checkFree = async (defId, pos, rot) => {
    const fake = { pos, rot }, def = MACHINES[defId];
    for (const b of def.boxes) {
      const c = toWorld(fake, [b[0], b[1] + 0.06, b[2]]), swap = rot % 2 === 1;
      const q = await physics.query({ type: 'overlap', pos: c, hx: (swap ? b[5] : b[3]) * 0.9, hy: Math.max(0.02, b[4] - 0.08), hz: (swap ? b[3] : b[5]) * 0.9, groups: (16 << 16) | 26, excludePlayer: true });
      if (q && q.blocked) return false;
    }
    return true;
  };
  api.setGhostOk = (ok) => { if (ghost) ghost.material = ok ? ghostMats.ok : ghostMats.bad; };

  // ---- Pipe run in progress (holding a coil) ----
  // The first click of a run is kept on the coil itself, so co-op players
  // laying pipe at once don't pick up each other's start (and guests see it).
  let preview = null;
  api.runStart = (coil) => (coil && coil.data && coil.data.runFrom) || null;
  api.cancelRun = (coil) => { if (coil?.data) delete coil.data.runFrom; if (preview) { scene.remove(preview); preview = null; } };
  api.coilClick = (coil, aimP) => {
    const cable = coil.data.tier === 'cable';
    let runStart = coil.data.runFrom || null;
    // The start machine may have been picked up since the first click.
    if (runStart && (!list.get(runStart.m) || !portOf(runStart))) { delete coil.data.runFrom; runStart = null; }
    const port = freePortNear(aimP, SOCKET_SNAP, cable);
    if (!port) { hud.toast(cable ? 'Aim at a free signal terminal (the brass studs on logic parts)' : 'Aim at a free water port (the brass flanges)', 'err'); return false; }
    if (!runStart) { coil.data.runFrom = { ...port }; audio.play('pickup'); hud.toast('Run started — now click the other port'); return true; }
    if (runStart.m === port.m) { hud.toast('Pick a port on a different machine'); return false; }
    if (cable && runStart.kind === port.kind) { hud.toast('Join an output (right side) to an input (left side)'); return false; }
    const pa = portOf(runStart), pb = portOf(port);
    const need = Math.hypot(pa.p[0] - pb.p[0], pa.p[1] - pb.p[1], pa.p[2] - pb.p[2]) * 1.1 + 0.3;
    if (need > coil.data.m + 1e-6) { hud.toast(`Need ${need.toFixed(1)} m of pipe; this coil has ${coil.data.m.toFixed(1)} m`, 'err'); return false; }
    // Cables always run from the output to the input.
    const [ra, rb] = cable && runStart.kind === 'sig-in' ? [port, runStart] : [runStart, port];
    api.layRun(coil.data.tier, { m: ra.m, s: ra.s }, { m: rb.m, s: rb.s });
    coil.data.m = Math.round((coil.data.m - need) * 10) / 10;
    api.cancelRun(coil); audio.play('drop');
    hud.toast(`Laid ${need.toFixed(1)} m of ${PIPE_TIERS[coil.data.tier].name.toLowerCase()} pipe`);
    return 'laid';
  };
  api.previewRun = (coil, aimP) => {
    const runStart = coil?.data?.runFrom || null;
    if (!runStart) { if (preview) { scene.remove(preview); preview = null; } return; }
    const a = list.get(runStart.m) && portOf(runStart); if (!a) { api.cancelRun(coil); return; }
    const near = freePortNear(aimP, SOCKET_SNAP, coil.data.tier === 'cable');
    const b = near ? portOf(near) : { p: aimP, d: [0, 0, 0] };
    const curve = runCurve(a, b);
    if (preview) { scene.remove(preview); preview.geometry.dispose(); }
    preview = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, PIPE_TIERS[coil.data.tier].r, 6), near ? ghostMats.ok : ghostMats.bad);
    scene.add(preview);
  };
  api.freePortNear = freePortNear;

  // ---- Visual update per frame ----
  api.update = (dt) => {
    for (const m of list.values()) {
      if (m.run) continue;
      const def = MACHINES[m.def];
      const running = m.status === 'running' || (def.role === 'booster' && m.state.fuel > 0 && m.flow?.net?.demand > 0) || (m.def === 'grinder' && false);
      const spinning = running || ((def.role === 'shaftuser' || def.shaft) && (m.speed > 0 || m.shaftUnits > 0)) || (m.def === 'turbine' && (m.flow?.satisfaction || 0) > 0);
      if (m._spin) { const sp = spinning ? (m.speed || 1) : 0; if (def.spin.axis === 'y') m._spin.rotation.y += dt * 9 * sp; else if (def.spin.axis === 'z') m._spin.rotation.z += dt * 2.5 * sp; else m._spin.rotation.x += dt * 6 * sp; }
      if (m._stamps) { const t = api.clock * 6 * (m.speed || 0); m._stamps.children.forEach((r, i) => { r.position.y = 1.3 + Math.max(0, Math.sin(t + i * 2.1)) * 0.25 * ((m.state.queue?.length || 0) > 0 ? 1 : 0); }); }
      if (m._needle) m._needle.rotation.z = 1.2 - m.wear * 2.4;
      if (m._sheet) { m._sheet.visible = (m.flow?.satisfaction || 0) > 0 && m.on; m._sheet.material.uniforms.uTime.value += dt * (0.5 + (m.flow?.satisfaction || 0)); }
    }
  };

  // ---- Saves ----
  api.serialize = () => [...list.values()].map(m => m.run ? { id: m.id, run: true, tier: m.tier, a: m.a, b: m.b } : { id: m.id, def: m.def, pos: m.pos, rot: m.rot, locked: m.locked, wear: m.wear, on: m.on, state: m.state });
  api.restore = (arr) => {
    // Old belts' riders belong to the world being replaced: the ids may
    // now name the loaded world's items, so don't drop them.
    for (const m of list.values()) if (m.state?.lanes) m.state.lanes = m.state.lanes.map(() => []);
    for (const id of [...list.keys()]) api.remove(id);
    for (const d of arr || []) if (!d.run) api.place(d.def, d.pos, d.rot, d.state, { id: d.id, locked: d.locked, wear: d.wear, on: d.on });
    for (const d of arr || []) if (d.run) api.layRun(d.tier, d.a, d.b, { id: d.id });
  };
  api.name = (defId) => MACHINES[defId]?.name || defId;
  api.family = (defId) => MACHINES[defId]?.family;
  api.card = (id) => {
    const m = list.get(id); if (!m) return null;
    if (m.run && m.tier === 'cable') { const src = list.get(m.a.m); return { name: 'Signal cable', lines: [`value ${fmtSig(src?.sig ?? 0)}`, `${m.len.toFixed(1)} m`] }; }
    if (m.run) return { name: `${PIPE_TIERS[m.tier].name} pipe run`, lines: [`${m.len.toFixed(1)} m · ${PIPE_TIERS[m.tier].cap} L/s`] };
    const def = MACHINES[m.def], f = m.flow || {};
    const lines = [];
    if (def.role === 'consumer') { lines.push(`${def.meltRate ? '' : (m.status || 'idle') + ' · '}${Math.round((f.satisfaction || 0) * 100)}% water`); if (!def.meltRate && !def.shaft && !def.drive) lines.push(`wear ${Math.round(m.wear * 100)}%${def.hopper ? ` · hopper ${m.state.loads.length}/${def.hopper}` : ''}`); }
    if (def.role === 'source') lines.push(m.valid ? `${(def.flow * m.state.throttle).toFixed(0)} L/s` : 'needs to sit in the river');
    if (def.role === 'tank') lines.push(`${Math.round(m.state.level)} / ${def.tankCap} L`);
    if (def.role === 'booster') lines.push(`fuel ${m.state.fuel.toFixed(1)} kg quartz`);
    if (def.meltRate) lines.push(m.status || 'empty');
    if (def.role === 'belt') lines.push(m.beltSpeed ? `${m.beltSpeed.toFixed(1)} m/s${m._jam > 2 ? ' · jammed' : ''}` : 'no drive');
    if (def.role === 'container') lines.push(def.capKg ? `${m.state.contents.reduce((a, x) => a + x.kg, 0).toFixed(1)} / ${def.capKg} kg` : `${m.state.contents.length} / ${def.capItems} items`);
    if (def.role === 'logic') lines.push(`value ${fmtSig(m.sig || 0)}`);
    if (def.role === 'shaftuser') lines.push(m.status || 'idle');
    return { name: def.name, badge: m.locked ? 'Locked' : null, rivet: !!m.locked, lines };
  };
  api.counts = () => { let mach = 0, runs = 0; for (const m of list.values()) m.run ? runs++ : mach++; return { mach, runs }; };
  void _q; void _e; void FAMILY;
  return api;
}
