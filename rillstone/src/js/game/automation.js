// Belts, containers, shaft power and logic (BUILD_BRIEF 3.5), on top of
// game/machines.js.
//
// Belts are lanes in data: items sit at a distance s along a lane, move at
// the line's speed and keep a minimum gap. A lane backs up when its exit is
// blocked (jams are explicit, never physics); items only become rigid
// bodies when they fall off an open end. Signals are held values that
// persist until they change, evaluated at 10 Hz.
import * as THREE from 'three';
import { beltSurface, logicLabel } from '../defs/machines2.js';
import { MATERIALS, itemName, STAGE_NAMES } from '../defs/materials.js';
import { fmtSig } from './machines.js';
import { h } from '../ui/dom.js';

const GAP = 0.26;            // minimum spacing on a belt, metres
const SHAFT_RANGE = 8;       // a wheel or turbine drives shaft machines this close
const _v = new THREE.Vector3();

export function createAutomation({ machines, items, scene, materials, hud, audio, panels, fx, brush, claims, economy }) {
  const { list } = machines, I = machines._int, D = I.MACHINES;
  const beltTex = makeBeltTexture();
  const lines = new THREE.Group(); scene.add(lines);
  let logicT = 0, groupsDirty = true, beltGroups = new Map();
  const auto = { counters: new Map() };

  // ---- Belt geometry helpers ----
  function lanesOf(m) {
    if (m._lanes) return m._lanes;
    const def = D[m.def];
    m._lanes = def.lanes.map(pts => {
      const w = pts.map(p => I.toWorld(m, p)); const cum = [0];
      for (let i = 1; i < w.length; i++) cum.push(cum[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1], w[i][2] - w[i - 1][2]));
      return { pts: w, cum, len: cum[cum.length - 1] };
    });
    return m._lanes;
  }
  function pointOn(lane, s) {
    const c = lane.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++;
    const t = Math.min(1, Math.max(0, (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1])));
    const a = lane.pts[i - 1], b = lane.pts[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + 0.06, a[2] + (b[2] - a[2]) * t];
  }
  function ensureBeltState(m) { if (!m.state.lanes) m.state.lanes = D[m.def].lanes.map(() => []); return m.state.lanes; }
  // Decorate belts with a scrolling surface mesh.
  machines.onVisual = (m) => {
    const def = D[m.def];
    if (def.role === 'belt' && m._g) {
      const mat = new THREE.MeshStandardMaterial({ map: beltTex.clone(), roughness: 0.9 }); mat.map.needsUpdate = true;
      materials.litMaterial(mat);
      for (const lane of def.lanes) { const s = new THREE.Mesh(beltSurface(lane), mat); s.receiveShadow = true; m._g.add(s); }
      m._beltMat = mat;
    }
    if (def.role === 'logic' && m._g) {
      const mat = new THREE.MeshBasicMaterial({ map: logicLabel(def.label), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(def.cell[0] > 1 ? 0.3 : 0.34, def.cell[0] > 1 ? 0.15 : 0.17), mat);
      lbl.position.fromArray(def.labelAt); if (def.labelUp) lbl.rotation.x = -Math.PI / 2;
      if (def.logic === 'display') lbl.scale.set(1.5, 1.8, 1);
      m._g.add(lbl); m._label = lbl;
      if (def.logic === 'lamp') { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0x000000, roughness: 0.3 })); b.position.set(0, 0.5, 0); m._g.add(b); m._bulb = b; }
    }
    if (def.stamps && m._g) { const s = new THREE.Group(); for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), materials.brass); r.position.set(-0.35 + i * 0.35, 1.3, -0.4); s.add(r); } m._g.add(s); m._stamps = s; }
  };

  // ---- Accept: can a target machine take this payload? ----
  // payload: { item } | { load } | { ent } (an entity already on a belt).
  function payloadItem(p) { return p.ent ? p.ent.item : p.item; }
  function payloadLoad(p) { return p.load || (p.ent && p.ent.type === 'clod' ? p.ent.data.loads?.[0] : null); }
  function finish(p) { if (p.ent) items.remove(p.ent.id); return true; }
  machines.accept = (t, p, sock, from) => {
    const def = D[t.def];
    if (def.role === 'belt') {
      const lanes = ensureBeltState(t);
      const lane = def.merge && D[t.def].sockets[sock] && sock === 2 ? 1 : 0;
      const q = lanes[lane];
      if (q.length && q[q.length - 1].s < GAP) return false;
      let ent = p.ent;
      if (!ent) {
        const load = payloadLoad(p), it = payloadItem(p);
        ent = load ? items.spawn('clod', [0, 0, 0], { data: { band: load.band, depth: load.depth, loads: [load], ore: p.oreClod || load.ore }, loc: 'belt' })
          : items.spawn(it.stage === 'crafted' ? 'crafted' : 'nugget', [0, 0, 0], { item: it, loc: 'belt' });
      } else { ent.loc = 'belt'; }
      q.push({ eid: ent.id, s: 0 });
      placeOnBelt(t, lane, q[q.length - 1]);
      return true;
    }
    if (def.hopper) { const l = payloadLoad(p); if (!l || t.state.loads.length >= def.hopper || l.band > def.tier) return false; t.state.loads.push(l); return finish(p); }
    if (def.role === 'container') {
      const it = payloadItem(p); if (!it) return false;
      const kg = t.state.contents.reduce((a, x) => a + x.kg, 0);
      if (def.capKg && kg + it.kg > def.capKg) return false;
      if (def.capItems && t.state.contents.length >= def.capItems) return false;
      t.state.contents.push({ ...it }); return finish(p);
    }
    if (def.meltRate) {
      const it = payloadItem(p); if (!it) return false;
      if (it.material === 'quartz' && def.fuelPerSec) { t.state.fuel += it.kg; return finish(p); }
      if (it.stage !== 'ore' || MATERIALS[it.material].kind !== 'metal') return false;
      if (t.state.material && t.state.material !== it.material) { if (!t._warned) { t._warned = true; hud.toast(`${def.name}: mixed ore refused (it waits on the belt)`, 'err'); } return false; }
      if (t.state.ore + t.state.molten + it.kg > def.capKg) return false;
      t.state.material = it.material; t.state.ore += it.kg; t._warned = false; return finish(p);
    }
    if (t.def === 'stampmill') { const l = payloadLoad(p); const ent = p.ent; if (!l || !(ent?.data?.ore || p.oreClod)) return false; if ((t.state.queue ||= []).length >= 4) return false; t.state.queue.push(l); return finish(p); }
    if (t.def === 'trommel') { const l = payloadLoad(p); if (!l) return false; if ((t.state.queue ||= []).length >= 6) return false; t.state.queue.push(l); return finish(p); }
    if (t.def === 'lift') { if ((t.state.queue ||= []).length >= 6) return false; const it = payloadItem(p), l = payloadLoad(p); t.state.queue.push(it ? { item: { ...it } } : { load: l }); return finish(p); }
    return undefined; // not a machine that takes things
  };
  function placeOnBelt(m, laneIdx, slot) {
    const e = items.get(slot.eid); if (!e) return;
    const lane = lanesOf(m)[laneIdx]; const p = pointOn(lane, slot.s);
    e.pos[0] = p[0]; e.pos[1] = p[1] + items.halfHeight(e); e.pos[2] = p[2];
    items.showAt(e);
  }

  // ---- Belt groups and speed ----
  function rebuildGroups() {
    const parent = new Map();
    const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
    for (const m of list.values()) if (!m.run && D[m.def].role === 'belt') parent.set(m.id, m.id);
    for (const m of list.values()) {
      if (m.run || D[m.def].role !== 'belt') continue;
      D[m.def].sockets.forEach((s, i) => { if (s.kind !== 'out') return; const l = machines.linkOfSocket(m.id, i); if (l && parent.has(l.m)) parent.set(find(m.id), find(l.m)); });
    }
    beltGroups = new Map();
    for (const id of parent.keys()) { const r = find(id); if (!beltGroups.has(r)) beltGroups.set(r, []); beltGroups.get(r).push(list.get(id)); }
    groupsDirty = false;
  }

  // ---- Tick (20 Hz) ----
  machines.extraTick.push((dt) => {
    machines.linkOf(-1); // make sure links are current
    if (groupsDirty || machines.version !== auto._ver) { auto._ver = machines.version; rebuildGroups(); }
    // Line speed: 0.6-1.6 m/s from the best-supplied belt drive in the line.
    for (const group of beltGroups.values()) {
      let best = -1;
      for (const m of group) if (D[m.def].drive && m.on) best = Math.max(best, I.flowOf(m.id)?.satisfaction ?? 0);
      const v = best >= 0 && best > 0 ? 0.6 + 1.0 * best : 0;
      for (const m of group) { m.beltSpeed = v; m.status = v ? (m._jam > 2 ? 'jammed' : 'running') : 'no drive'; }
    }
    for (const m of list.values()) if (!m.run && D[m.def].role === 'belt') beltTick(m, dt);
    shaftTick(dt);
    for (const m of list.values()) if (!m.run && D[m.def].role === 'shaftuser') shaftUserTick(m, dt);
    logicT += dt; if (logicT >= 0.1) { logicTick(logicT); logicT = 0; }
  });
  function beltTick(m, dt) {
    const def = D[m.def], lanes = ensureBeltState(m), geo = lanesOf(m);
    const v = (m.gateClosed ? 0 : m.beltSpeed || 0) * dt;
    let moved = false, blocked = false;
    lanes.forEach((q, li) => {
      const lane = geo[li];
      q.sort((a, b) => b.s - a.s);
      for (let k = 0; k < q.length; k++) {
        const it = q[k];
        const limit = k === 0 ? lane.len : q[k - 1].s - GAP;
        const ns = Math.min(limit, it.s + v);
        if (ns > it.s) { it.s = ns; moved = true; }
        // Splitters and sorters choose a route at the middle of lane 0.
        if (li === 0 && def.split && !it.routed && it.s >= lane.len / 2) {
          const e = items.get(it.eid);
          const side = def.split === 'alternate' ? (m.state.flip = !m.state.flip) : !(e?.item && matchesFilter(m, e.item));
          it.routed = true;
          if (side) { const q1 = lanes[1]; if (!q1.length || q1[q1.length - 1].s >= GAP) { q.splice(k, 1); k--; q1.push({ eid: it.eid, s: 0 }); continue; } else { it.s = lane.len / 2 - 0.001; it.routed = false; blocked = true; } }
        }
        if (def.gemcut && !it.cut && it.s >= lane.len / 2) {
          const e = items.get(it.eid); it.cut = true;
          if (e?.item && MATERIALS[e.item.material].kind === 'gem' && e.item.stage === 'uncut') { items.hideEnt(e); e.item.stage = 'cut'; e.item.kg = Math.round(e.item.kg * 0.85 * 1000) / 1000; fx?.burst(e.pos, 0xfff4e0, 8, { speed: 1.4, size: 0.02, life: 0.3 }); }
        }
      }
      // Merger: the side lane joins the main lane in the middle.
      if (def.merge && li === 1 && q.length && q[0].s >= lane.len - 1e-6) {
        const main = lanes[0], mid = geo[0].len / 2;
        if (main.every(x => Math.abs(x.s - mid) >= GAP)) { const it = q.shift(); main.push({ eid: it.eid, s: mid }); }
        else blocked = true;
      }
      // The front item at the end of lane 0 (or a split lane) leaves the belt.
      if (q.length && q[0].s >= lane.len - 1e-6 && !(def.merge && li === 1)) {
        const outSock = li === 0 ? def.sockets.findIndex(s => s.kind === 'out') : def.sockets.map((s, i) => [s, i]).filter(([s]) => s.kind === 'out')[1]?.[1];
        const link = machines.linkOfSocket(m.id, outSock);
        const e = items.get(q[0].eid);
        if (!e) { q.shift(); return; }
        if (link) {
          const t = list.get(link.m);
          if (t && D[t.def].role === 'belt') {
            if (machines.accept(t, { ent: e }, link.s, m)) { q.shift(); countOut(m); } else blocked = true;
          } else if (t) {
            const r = machines.accept(t, { ent: e }, link.s, m);
            if (r) { q.shift(); countOut(m); } else blocked = true;
          }
        } else {
          // Open end: the item drops off as a rigid body.
          const d = I.toWorld(m, def.sockets[outSock].p), dir = machines._int.dirOf ? null : null; void dir;
          q.shift(); countOut(m);
          items.hideEnt(e); e.loc = 'held';
          const sd = def.sockets[outSock].d, w = new THREE.Vector3(...sd).applyAxisAngle(new THREE.Vector3(0, 1, 0), m.rot * Math.PI / 2);
          items.place(e.id, [d[0] + w.x * 0.15, d[1] + 0.05, d[2] + w.z * 0.15], undefined, [w.x * (m.beltSpeed || 0.8), 0.2, w.z * (m.beltSpeed || 0.8)]);
        }
      }
      for (const it of q) placeOnBelt(m, li, it);
    });
    m._jam = blocked && !moved ? (m._jam || 0) + dt : 0;
    if (m._beltMat && m.beltSpeed && !m.gateClosed) m._beltMat.map.offset.y -= m.beltSpeed * dt * 2;
  }
  function countOut(m) { auto.counters.set(m.id, (auto.counters.get(m.id) || 0) + 1); }
  function matchesFilter(m, it) { const f = m.state.filter || { material: 'iron', stage: 'ore' }; return it.material === f.material && it.stage === f.stage; }

  // ---- Shaft power: wheels and turbines drive shaft machines nearby ----
  function shaftTick() {
    const providers = [...list.values()].filter(m => !m.run && D[m.def].shaft);
    const all = [...list.values()].filter(m => !m.run && D[m.def].role === 'shaftuser');
    for (const u of all) if (!u.on) { u.speed = 0; u.status = 'off'; u._provider = null; }
    const users = all.filter(m => m.on);
    for (const p of providers) { const def = D[p.def]; p.shaftUnits = def.role === 'source' ? (machines.requirement(p.def, p.pos, p.rot) ? 0 : def.shaft) : def.shaft * (I.flowOf(p.id)?.satisfaction || 0); p._users = []; }
    for (const u of users) {
      let best = null, bd = SHAFT_RANGE;
      for (const p of providers) { const d = Math.hypot(p.pos[0] - u.pos[0], p.pos[2] - u.pos[2]); if (d < bd && p.shaftUnits > 0) { bd = d; best = p; } }
      u._provider = best; if (best) best._users.push(u);
    }
    for (const u of users) { const p = u._provider; u.speed = p ? Math.min(1, p.shaftUnits / Math.max(1, p._users.length)) : 0; u.status = p ? (u.speed > 0 ? 'running' : 'no power') : 'no shaft power nearby'; }
    // Drive lines between providers and the machines they drive.
    const key = users.map(u => `${u.id}-${u._provider?.id}`).join(',');
    if (key !== auto._lineKey) {
      auto._lineKey = key; lines.clear();
      for (const u of users) if (u._provider) {
        const a = new THREE.Vector3(...u._provider.pos).add(new THREE.Vector3(0, 1.3, 0)), b = new THREE.Vector3(...u.pos).add(new THREE.Vector3(0, 1.0, 0));
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.2, 0)), b]), 12, 0.025, 5);
        lines.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.8 })));
      }
    }
  }
  function shaftUserTick(m, dt) {
    const def = D[m.def], q = m.state.queue ||= [];
    if (!q.length) { if (m.status === 'running') m.status = 'idle'; m.state.progress = 0; return; }
    if (!m.speed) return;
    m.state.progress = (m.state.progress || 0) + dt * m.speed / def.period;
    if (m.state.progress < 1) return;
    const job = q[0];
    let ok;
    if (m.def === 'stampmill') { // one ore clod -> three gravel loads
      m.state.pending = m.state.pending ?? 3;
      while (m.state.pending > 0 && machines.output(m, { load: { ...job, ore: false } })) m.state.pending--;
      ok = m.state.pending === 0; if (ok) m.state.pending = null;
      if (ok && fx) fx.burst(I.toWorld(m, [0, 0.6, 0.3]), 0x9a948a, 10, { speed: 1.5, size: 0.04, life: 0.4 });
    } else if (m.def === 'trommel') ok = machines.output(m, { load: { ...job, screened: true } });
    else ok = machines.output(m, job); // lift
    if (ok) { q.shift(); m.state.progress = 0; } else m.state.progress = 1;
  }

  // ---- Logic (10 Hz) ----
  const inputsOf = (m) => {
    const ins = [0, 0], conn = [false, false];
    for (const r of list.values()) if (r.run && r.tier === 'cable' && r.b.m === m.id) { const src = list.get(r.a.m); const port = D[m.def].sockets[r.b.s]?.port ?? 0; ins[port] = src ? (src.sig || 0) : 0; conn[port] = true; }
    return { a: ins[0], b: ins[1], conn };
  };
  function nearestMachine(m, pred, range = 2.6) {
    let best = null, bd = range;
    for (const t of list.values()) { if (t.run || t === m || !pred(D[t.def], t)) continue; const d = Math.hypot(t.pos[0] - m.pos[0], t.pos[2] - m.pos[2]); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  function logicTick(dt) {
    const clock = machines.clock;
    const logic = [...list.values()].filter(m => !m.run && D[m.def].role === 'logic');
    const next = new Map();
    for (const m of logic) {
      const L = D[m.def].logic, s = m.state, { a, b, conn } = inputsOf(m);
      let v = 0;
      switch (L) {
        case 'button': v = (s.until || 0) > clock ? 1 : 0; break;
        case 'lever': v = s.on ? 1 : 0; break;
        case 'dial': v = s.value ?? 0; break;
        case 'clock': { const per = Math.max(0.2, s.period ?? 5); v = (clock % per) < 0.5 ? 1 : 0; break; }
        case 'and': v = a > 0 && b > 0 ? 1 : 0; break;
        case 'or': v = a > 0 || b > 0 ? 1 : 0; break;
        case 'not': v = a > 0 ? 0 : 1; break;
        case 'compare': { const rhs = conn[1] ? b : (s.value ?? 0); v = (s.op === '=' ? Math.abs(a - rhs) < 1e-6 : s.op === '<' ? a < rhs : a > rhs) ? 1 : 0; break; }
        case 'add': v = a + b; break;
        case 'sub': v = a - b; break;
        case 'latch': if (a > 0) s.held = 1; if (b > 0) s.held = 0; v = s.held || 0; break;
        case 'pulse': v = a > 0 && !(s.last > 0) ? 1 : 0; s.last = a; break;
        case 'delay': { (s.buf ||= []).push([clock, a]); const d = s.delay ?? 1; while (s.buf.length > 1 && s.buf[1][0] <= clock - d) s.buf.shift(); v = s.buf[0][0] <= clock - d ? s.buf[0][1] : (s.prevOut ?? 0); s.prevOut = v; break; }
        case 'scale': { let kg = 0; const r = 0.6; for (const e of items.ents.values()) if (e.loc === 'loose' && e.item && Math.abs(e.pos[0] - m.pos[0]) < r && Math.abs(e.pos[2] - m.pos[2]) < r && e.pos[1] > m.pos[1] - 0.2 && e.pos[1] < m.pos[1] + 1.5) kg += e.item.kg; for (const e of items.ents.values()) if (e.type === 'pile' && Math.abs(e.pos[0] - m.pos[0]) < r && Math.abs(e.pos[2] - m.pos[2]) < r) kg += e.data.kgs.reduce((x, y) => x + y, 0); v = Math.round(kg * 100) / 100; break; }
        case 'counter': { const t = nearestMachine(m, d => d.role === 'belt'); if (a > 0 && !(s.lastA > 0)) s.base = t ? auto.counters.get(t.id) || 0 : 0; s.lastA = a; v = t ? (auto.counters.get(t.id) || 0) - (s.base || 0) : 0; break; }
        case 'wearsensor': { const t = nearestMachine(m, d => d.role === 'consumer'); v = t ? Math.round(t.wear * 100) : 0; break; }
        case 'fillsensor': { const t = nearestMachine(m, d => d.role === 'container' || d.role === 'tank' || !!d.meltRate); if (t) { const d = D[t.def]; v = d.role === 'container' ? (d.capKg ? t.state.contents.reduce((x, y) => x + y.kg, 0) : t.state.contents.length) : d.role === 'tank' ? Math.round(t.state.level / d.tankCap * 100) : t.state.ore + t.state.molten; v = Math.round(v * 100) / 100; } break; }
        default: v = a; // outputs show their input
      }
      next.set(m.id, v);
      // Effects of outputs.
      const rising = a > 0 && !(s.prevA > 0); s.prevA = a;
      if (L === 'valve') { const t = nearestMachine(m, d => d.role === 'source' || d.role === 'pipe'); if (t) t.closed = !(a > 0); m.target = t?.id; }
      if (L === 'beltgate') { const t = nearestMachine(m, d => d.role === 'belt'); if (t) t.gateClosed = !(a > 0); }
      if (L === 'pourer' && rising) { const t = nearestMachine(m, d => !!d.meltRate); if (t) machines.pour(t.id); }
      if (L === 'siren' && a > 0 && (s.next || 0) < clock) { s.next = clock + 1.2; audio.play('siren'); }
      if (L === 'charge' && rising) { const vol = claims.volumeAt(m.pos[0], m.pos[2], m.pos[1]); if (vol && economy.owns(vol.id)) { const c = [m.pos[0], m.pos[1] - 0.5, m.pos[2]]; brush(vol.id, c, 2.0, 'dig', 3); auto.onDig?.(vol, c, 2.0); } fx?.burst([m.pos[0], m.pos[1] + 0.3, m.pos[2]], 0xffb050, 40, { speed: 6, size: 0.08, life: 0.8 }); audio.play('boom'); hud.toast('Boom!'); machines.remove(m.id); }
      if (L === 'ejector' && rising) { const t = nearestMachine(m, d => d.role === 'container'); if (t && t.state.contents.length) { const it = t.state.contents.shift(); if (!machines.output(t, { item: it })) t.state.contents.unshift(it); } }
    }
    for (const m of logic) {
      const v = next.get(m.id); const changed = v !== m.sig; m.sig = v;
      if (changed && D[m.def].logic === 'display' && m._label) m._label.material.map = logicLabel(fmtSig(v), '#1e2a24', '#9cf0b0');
      if (D[m.def].logic === 'lamp' && m._bulb) { const c = v <= 0 ? 0x000000 : [0x3dff7a, 0xffd23d, 0xff4a3a, 0x4ab0ff][Math.min(3, Math.floor(v) - 1)] ?? 0x3dff7a; m._bulb.material.emissive.setHex(c); m._bulb.material.emissiveIntensity = v > 0 ? 2 : 0; }
    }
  }

  // ---- Interactions ----
  // E on a locked button or lever presses/toggles it.
  auto.interact = (m) => {
    const L = D[m.def].logic;
    if (L === 'button') { m.state.until = machines.clock + 1; audio.play('pickup'); return true; }
    if (L === 'lever') { m.state.on = !m.state.on; audio.play('pickup'); m._g && (m._g.children[0].rotation.x = 0); return true; }
    return false;
  };
  auto.panelRows = (m, row, controls, render) => {
    const def = D[m.def];
    if (def.role === 'belt') {
      row('Line speed', m.beltSpeed ? `${m.beltSpeed.toFixed(2)} m/s` : 'stopped — needs a Belt Drive with water');
      row('On the belt', String(ensureBeltState(m).reduce((a, q) => a + q.length, 0)));
      if (m._jam > 2) row('Jam', `blocked for ${m._jam.toFixed(0)} s: the next machine is full or refusing`);
      if (def.split === 'filter') {
        const f = m.state.filter || { material: 'iron', stage: 'ore' };
        const sel = h('select', { onchange: (e) => { const [mat, st] = e.target.value.split('|'); m.state.filter = { material: mat, stage: st }; render(); } },
          ...Object.keys(MATERIALS).flatMap(mat => ['ore', 'uncut', 'cut', 'ingot', 'crafted'].filter(st => (MATERIALS[mat].kind === 'gem') === (st === 'uncut' || st === 'cut') || st === 'crafted').filter(st => !(MATERIALS[mat].kind === 'fuel' && st !== 'ore')).map(st => h('option', { value: `${mat}|${st}`, selected: f.material === mat && f.stage === st }, `${MATERIALS[mat].name} · ${STAGE_NAMES[st] || st}`))));
        controls.append(h('div', { class: 'entry' }, h('b', {}, 'Sort out (straight on)'), sel, h('span', { class: 'desc' }, 'Matching items go straight through; everything else turns right.')));
      }
    }
    if (def.role === 'container') {
      const kg = m.state.contents.reduce((a, x) => a + x.kg, 0);
      row('Holds', def.capKg ? `${kg.toFixed(1)} / ${def.capKg} kg` : `${m.state.contents.length} / ${def.capItems} items`);
      const groups = new Map();
      m.state.contents.forEach((it, i) => { const k = itemName(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
      for (const [name, idx] of groups) controls.append(h('div', { class: 'entry' }, h('b', {}, `${name} ×${idx.length}`), h('button', { class: 'btn primary', onclick: () => { auto.takeFrom?.(m, idx[0]); render(); } }, 'Take one'), h('span', { class: 'desc' }, `${idx.reduce((a, i) => a + m.state.contents[i].kg, 0).toFixed(1)} kg`)));
    }
    if (def.role === 'shaftuser') { row('Shaft power', m._provider ? `from ${D[m._provider.def].name} · ${Math.round((m.speed || 0) * 100)}%` : `none within ${SHAFT_RANGE} m`); row('Queue', String((m.state.queue || []).length)); }
    if (def.shaft) row('Drives', `${(m._users || []).length} machine(s) · ${m.shaftUnits?.toFixed(1) ?? 0} of ${def.shaft} units`);
    if (def.role === 'logic') {
      const L = def.logic, s = m.state;
      row('Value', fmtSig(m.sig || 0));
      const num = (label, key, dflt, step = 1) => controls.append(h('div', { class: 'entry' }, h('b', {}, label), h('span', {}, h('button', { class: 'btn', onclick: () => { s[key] = Math.round(((s[key] ?? dflt) - step) * 100) / 100; render(); } }, '−'), ` ${fmtSig(s[key] ?? dflt)} `, h('button', { class: 'btn', onclick: () => { s[key] = Math.round(((s[key] ?? dflt) + step) * 100) / 100; render(); } }, '+'))));
      if (L === 'dial') num('Value', 'value', 0, 1);
      if (L === 'clock') num('Period (s)', 'period', 5, 1);
      if (L === 'delay') num('Delay (s)', 'delay', 1, 0.5);
      if (L === 'compare') { num('Compare with (if input B is empty)', 'value', 0, 1); controls.append(h('div', { class: 'entry' }, h('b', {}, 'Test'), h('span', {}, ...['>', '<', '='].map(op => h('button', { class: 'btn' + ((s.op || '>') === op ? ' primary' : ''), onclick: () => { s.op = op; render(); } }, op))))); }
      if (L === 'button') controls.append(h('button', { class: 'btn primary', onclick: () => { auto.interact(m); render(); } }, 'Press'));
      if (L === 'lever') controls.append(h('button', { class: 'btn primary', onclick: () => { auto.interact(m); render(); } }, s.on ? 'Switch off' : 'Switch on'));
      const help = { valve: 'Closes the nearest intake or junction while its input is 0.', beltgate: 'Stops the nearest belt while its input is 0.', pourer: 'Pours the nearest kiln or smelter when its input rises.', scale: 'Outputs the kg of items resting on the plate.', counter: 'Counts items leaving the nearest belt; input A resets it.', fillsensor: 'Outputs the fill of the nearest bin, tank or furnace.', wearsensor: 'Outputs the wear % of the nearest machine.', ejector: 'Pushes one item out of the nearest bin when its input rises.', charge: 'Blasts a hole when its input rises. Inside claims you own only.' }[L];
      if (help) controls.append(h('p', { class: 'small' }, help + ' "Nearest" means within 2.6 m.'));
    }
  };
  return auto;
}

function makeBeltTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#2c2e33'; g.fillRect(0, 0, 32, 64); g.fillStyle = '#3c3f46';
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 32, 5);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
void _v;
