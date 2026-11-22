// Heavy kit (BUILD_BRIEF 3.7): the Excavator's bucket arm and hopper, the
// Survey Buggy's scanner, and Ore Tram rails. Rails are polylines in data;
// a tram is a kinematic vehicle moved along its line by script (a spline
// mover, not physics), carrying cargo like a truck bed (600 kg).
import * as THREE from 'three';
import { paint, merge, place } from '../render/geom.js';
import { EXTRA_MESH, EXTRA_BOX, EXTRA_CARD, EXTRA_MASS } from './items.js';
import { boxBrush, surfaceY } from '../world/claims.js';
import { VEINS } from '../world/claims.js';
import { CLAIMS } from '../world/valley.js';
import { MATERIALS } from '../defs/materials.js';
import { MACHINES } from '../defs/machines.js';

const STEEL = 0x7a848c, SLEEPER = 0x6a4a2e;
const P = (g, hex, j = 0.06, s = 1) => paint(g.index ? g.toNonIndexed() : g, hex, j, s);
EXTRA_MESH.railkit = () => merge([...[-0.12, 0, 0.12].map((x, i) => P(place(new THREE.BoxGeometry(0.07, 0.08, 1.6), x, 0.05 + (i % 2) * 0.08, 0), STEEL, 0.05, i)), ...[-0.6, 0.6].map(z => P(place(new THREE.BoxGeometry(0.4, 0.05, 0.08), 0, 0.17, z), 0x8a6a3a, 0.05))]);
EXTRA_BOX.railkit = () => [0.2, 0.1, 0.8];
EXTRA_MASS.railkit = () => 20;
EXTRA_CARD.railkit = (e) => ({ name: `Rails · ${e.data.n} segment${e.data.n === 1 ? '' : 's'}`, lines: ['4 m a segment', 'LMB a start, then an end, to lay a line'] });
EXTRA_MESH.tramkit = () => merge([P(new THREE.BoxGeometry(0.86, 0.6, 0.86).translate(0, 0.3, 0), 0x7a5a3a, 0.08), ...[-1, 1].map(s => P(place(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10), s * 0.45, 0.25, 0, 0, 0, Math.PI / 2), 0x6a6e74, 0.05)), P(place(new THREE.BoxGeometry(0.9, 0.06, 0.06), 0, 0.62, 0), 0xc89a48, 0.04)]);
EXTRA_BOX.tramkit = () => [0.43, 0.3, 0.43];
EXTRA_MASS.tramkit = () => 60;
EXTRA_CARD.tramkit = () => ({ name: 'Ore Tram', lines: ['Carries 600 kg along rails', 'LMB a rail to set it on'] });

export function createHeavy({ scene, physics, items, vehicles, claims, economy, machines, hud, audio, fx, materials, height, hands }) {
  const api = { lines: [], nextLine: 1 };
  const railGroup = new THREE.Group(); scene.add(railGroup);

  // ---- Excavator ----
  const fwdOf = (v) => { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(v.group.quaternion); f.y = 0; return f.normalize(); };
  api.excavatorTarget = (v) => {
    const f = fwdOf(v), p = v.group.position;
    // The cut cell is fixed to the world's 1 m grid, not the chassis.
    const x = Math.floor(p.x + f.x * 4.4) + 0.5, z = Math.floor(p.z + f.z * 4.4) + 0.5;
    const vol = claims.volumeAt(x, z, p.y);
    const sy = vol ? surfaceY(vol, x, z, p.y + 3) : null;
    return { x, z, vol, sy };
  };
  api.dig = (v) => {
    if (v.arm.t > 0.2) return false;
    if (v.hopper.length >= v.def.hopper) { hud.toast(`Hopper full (${v.def.hopper} loads) · RMB to empty it`, 'err'); audio.play('error'); return false; }
    const t = api.excavatorTarget(v);
    if (!t.vol || t.sy == null) { hud.toast('The bucket only digs inside a claim', 'err'); audio.play('error'); return false; }
    if (!economy.owns(t.vol.id)) { hud.toast(`${t.vol.def.name} isn't yours`, 'err'); audio.play('error'); return false; }
    const r = boxBrush(t.vol, [t.x - 0.5, t.sy - 0.55, t.z - 0.5], [t.x + 0.5, t.sy + 0.3, t.z + 0.5], 3);
    v.arm.t = 1;
    if (r.removed < 0.05) { audio.play('clink'); hud.toast(r.blockedBand ? 'Too hard for the bucket (basalt or bedrock)' : 'Nothing to dig there', 'err'); return false; }
    const band = +Object.entries(r.bands).sort((a, b) => b[1] - a[1])[0][0];
    const c = [t.x, t.sy - 0.25, t.z];
    const load = { band, depth: Math.max(0, t.vol.depthAt(c[0], c[1])), claim: t.vol.id };
    const vein = t.vol.veinAt(...c); if (vein) load.vein = vein;
    v.hopper.push(load);
    hands.onDig?.(t.vol, c, 0.7);
    audio.play('dig', band); fx?.burst(c, 0x8a6a4a, 14, { speed: 2, size: 0.07, life: 0.6 });
    return true;
  };
  const bucketTip = (v) => { const p = new THREE.Vector3(0, -0.5, 0.3); v.arm.bucket.localToWorld(p); return p; };
  api.dump = (v) => {
    if (!v.hopper.length) { hud.toast('The hopper is empty'); return false; }
    const tip = bucketTip(v);
    // Into a hopper machine (sluice) under the bucket, if there is one.
    let best = null, bd = 3.5;
    for (const m of machines.list.values()) { const d = MACHINES[m.def]; if (!d || !d.hopper || d.role.startsWith('belt')) continue; const dd = Math.hypot(m.pos[0] - tip.x, m.pos[2] - tip.z); if (dd < bd) { bd = dd; best = m; } }
    let n = 0;
    if (best) {
      const d = MACHINES[best.def];
      while (v.hopper.length && best.state.loads.length < d.hopper && v.hopper[0].band <= d.tier) { best.state.loads.push(v.hopper.shift()); n++; }
      if (n) { audio.play('pour'); hud.toast(`${n} load${n > 1 ? 's' : ''} into the ${d.name}`); return true; }
    }
    const gy = Math.max(height(tip.x, tip.z), tip.y - 2);
    while (v.hopper.length) { const l = v.hopper.shift(); items.spawn('clod', [tip.x + (Math.random() - 0.5) * 0.6, tip.y - 0.2, tip.z + (Math.random() - 0.5) * 0.6], { data: { band: l.band, depth: l.depth, loads: [l] } }); n++; }
    void gy; v.arm.t = Math.max(v.arm.t, 0.5); audio.play('pour');
    fx?.burst([tip.x, tip.y, tip.z], 0x8a6a4a, 20, { speed: 1.4, size: 0.07, life: 0.6 });
    return true;
  };
  // Boom, stick and bucket: rest pose, then a scoop-and-lift as arm.t runs 1 -> 0.
  vehicles.animateArm = (v, dt) => {
    const a = v.arm; a.t = Math.max(0, a.t - dt * 0.9);
    const s = Math.sin(Math.min(1, (1 - a.t)) * Math.PI) * (a.t > 0 ? 1 : 0);
    a.boom.rotation.x = -0.55 + s * 0.75;
    a.stick.rotation.x = 1.5 - s * 0.45;
    a.bucket.rotation.x = 0.7 - s * 1.3;
  };

  // ---- Survey scanner: veins within 90 m on a little radar ----
  api.drawScanner = (canvas, v) => {
    const g = canvas.getContext('2d'), W = canvas.width, R = W / 2 - 4, range = 90;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#163028'; g.beginPath(); g.arc(W / 2, W / 2, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(140,220,170,0.35)'; g.lineWidth = 1;
    for (const k of [0.33, 0.66, 1]) { g.beginPath(); g.arc(W / 2, W / 2, R * k, 0, Math.PI * 2); g.stroke(); }
    const f = fwdOf(v), yaw = Math.atan2(f.x, f.z), p = v.group.position;
    const toScreen = (x, z) => { const dx = x - p.x, dz = z - p.z, c = Math.cos(-yaw), s = Math.sin(-yaw); const rx = dx * c + dz * s, rz = -dx * s + dz * c; return [W / 2 - rx / range * R, W / 2 - rz / range * R]; };
    g.strokeStyle = 'rgba(240,228,196,0.5)';
    for (const c of CLAIMS) { g.beginPath(); for (const [x, z] of [[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z1]]) { const [sx, sy] = toScreen(x, z); g.lineTo(sx, sy); } g.closePath(); g.stroke(); }
    const sweep = (performance.now() / 1000) % (Math.PI * 2);
    g.fillStyle = 'rgba(140,220,170,0.12)'; g.beginPath(); g.moveTo(W / 2, W / 2); g.arc(W / 2, W / 2, R, sweep - 0.5, sweep); g.fill();
    for (const vn of Object.values(VEINS)) {
      const d = Math.hypot(vn.x - p.x, vn.z - p.z); if (d > range + vn.r) continue;
      const [sx, sy] = toScreen(vn.x, vn.z);
      g.fillStyle = '#' + (MATERIALS[vn.material].ingot ?? MATERIALS[vn.material].color).toString(16).padStart(6, '0');
      g.beginPath(); g.arc(sx, sy, Math.max(3, vn.r / range * R), 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f0e4c4'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(`${MATERIALS[vn.material].name} · ${Math.round(p.y - vn.y)} m down`, sx, sy - 7);
    }
    g.fillStyle = '#f0e4c4'; g.beginPath(); g.moveTo(W / 2, W / 2 - 6); g.lineTo(W / 2 - 4, W / 2 + 4); g.lineTo(W / 2 + 4, W / 2 + 4); g.fill();
  };

  // ---- Rails ----
  const SEG = 4;
  function lineLengths(L) { const cum = [0]; for (let i = 1; i < L.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(L.pts[i][0] - L.pts[i - 1][0], L.pts[i][1] - L.pts[i - 1][1], L.pts[i][2] - L.pts[i - 1][2])); L.cum = cum; L.len = cum[cum.length - 1]; return L; }
  // Position and heading s metres along a line.
  function pointAt(L, s) {
    s = Math.max(0, Math.min(L.len, s));
    let i = 1; while (i < L.cum.length - 1 && L.cum[i] < s) i++;
    const a = L.pts[i - 1], b = L.pts[i], t = (s - L.cum[i - 1]) / Math.max(1e-6, L.cum[i] - L.cum[i - 1]);
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], d: [b[0] - a[0], b[1] - a[1], b[2] - a[2]] };
  }
  function rebuildRails() {
    for (const m of railGroup.children.slice()) { railGroup.remove(m); m.geometry.dispose(); }
    for (const L of api.lines) {
      lineLengths(L);
      const parts = [];
      for (let i = 1; i < L.pts.length; i++) {
        const a = new THREE.Vector3(...L.pts[i - 1]), b = new THREE.Vector3(...L.pts[i]), d = b.clone().sub(a), len = d.length();
        const yaw = Math.atan2(d.x, d.z), pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z)), mid = a.clone().add(b).multiplyScalar(0.5);
        for (const s of [-1, 1]) parts.push(P(new THREE.BoxGeometry(0.07, 0.09, len + 0.02).rotateX(pitch).rotateY(yaw).translate(mid.x + Math.cos(yaw) * s * 0.52, mid.y + 0.16, mid.z - Math.sin(yaw) * s * 0.52), STEEL, 0.04));
        for (let u = 0.4; u < len; u += 0.8) { const q = a.clone().addScaledVector(d, u / len); parts.push(P(place(new THREE.BoxGeometry(1.4, 0.08, 0.22), q.x, q.y + 0.07, q.z, 0, yaw), SLEEPER, 0.12, (u * 10) | 0)); }
      }
      if (parts.length) { const m = new THREE.Mesh(merge(parts), materials.vcolor); m.receiveShadow = true; railGroup.add(m); }
    }
  }
  const groundY = (x, z, hint) => { const vol = claims.volumeAt(x, z, hint); const s = vol ? surfaceY(vol, x, z, hint + 2) : null; return s ?? height(x, z); };
  function nearestEnd(p, maxD = 3) {
    let best = null, bd = maxD;
    for (const L of api.lines) for (const end of [0, L.pts.length - 1]) { const q = L.pts[end], d = Math.hypot(q[0] - p[0], q[2] - p[2]); if (d < bd) { bd = d; best = { L, end }; } }
    return best;
  }
  function nearestOnLine(p, maxD = 3) {
    let best = null, bd = maxD;
    for (const L of api.lines) for (let s = 0; s <= L.len; s += 0.5) { const q = pointAt(L, s).p, d = Math.hypot(q[0] - p[0], q[2] - p[2]); if (d < bd) { bd = d; best = { L, s }; } }
    return best;
  }
  api.layRails = (kit, a, b) => {
    const snap = nearestEnd(a);
    const start = snap ? snap.L.pts[snap.end] : [a[0], groundY(a[0], a[2], a[1]), a[2]];
    const full = Math.hypot(b[0] - start[0], b[2] - start[2]);
    if (full < 2) return 'short';
    const segs = Math.min(kit.data.n, Math.ceil(full / SEG)), len = Math.min(full, segs * SEG);
    const ux = (b[0] - start[0]) / full, uz = (b[2] - start[2]) / full;
    const pts = [];
    for (let u = 2; u <= len + 0.01; u += 2) { const x = start[0] + ux * u, z = start[2] + uz * u; pts.push([x, groundY(x, z, start[1]) + 0.02, z]); }
    if (!pts.length) return 'short';
    // Too steep for a tram (over 1 in 4)?
    let prev = start; for (const q of pts) { if (Math.abs(q[1] - prev[1]) > 0.5) return 'steep'; prev = q; }
    if (snap) {
      if (snap.end === 0) {
        // Growing the line at its start: trams on it keep their place.
        const before = lineLengths(snap.L).len;
        snap.L.pts.unshift(...pts.reverse());
        const grown = lineLengths(snap.L).len - before;
        for (const v of vehicles.list.values()) if (v.tram && v.tram.line === snap.L.id) v.tram.s += grown;
      } else snap.L.pts.push(...pts);
    }
    else api.lines.push({ id: api.nextLine++, pts: [[start[0], start[1] + 0.02, start[2]], ...pts] });
    kit.data.n -= segs;
    rebuildRails();
    return 'ok';
  };
  // The first click of a line is kept per player (each has their own hands).
  hands.useHook = (e, info, H = hands) => {
    if (e.type === 'railkit') {
      if (!info.p || info.dist > 8) { hud.toast('Aim at the ground'); return true; }
      if (!H.railStart) { const sn = nearestEnd(info.p); H.railStart = sn ? sn.L.pts[sn.end].slice() : info.p.slice(); audio.play('pickup'); hud.toast(sn ? 'Extending the line: click where it should run to' : 'Rails start here: click where they should run to'); return true; }
      const r = api.layRails(e, H.railStart, info.p); H.railStart = null;
      if (r === 'ok') { audio.play('drop'); H.play?.('place'); if (e.data.n <= 0) { items.remove(e.id); H.hand = null; } else items.refresh(e.id); }
      else { audio.play('error'); hud.toast(r === 'steep' ? 'Too steep for rails (over 1 in 4)' : 'Too short: lay at least 2 m', 'err'); }
      return true;
    }
    if (e.type === 'tramkit') {
      const hit = info.p && nearestOnLine(info.p, 2.5);
      if (!hit) { hud.toast('Click a rail line to set the tram on it', 'err'); audio.play('error'); return true; }
      const pa = pointAt(hit.L, hit.s);
      items.remove(e.id); H.hand = null;
      vehicles.spawn('tram', [pa.p[0], pa.p[1] + 0.1, pa.p[2]], Math.atan2(pa.d[0], pa.d[2]), { tram: { line: hit.L.id, s: hit.s, dir: 1, moving: false } }).then(v => seat(v));
      audio.play('drop'); hud.toast('Tram on the rails · F sends it to the far end');
      return true;
    }
    return false;
  };
  hands.hintHook = (e, info, H = hands) => {
    if (e.type === 'railkit') return H.railStart ? `{LMB} lay rails to here (${e.data.n} segments left)` : `{LMB} start rails here`;
    if (e.type === 'tramkit') return '{LMB} set the tram on a rail';
    return '';
  };
  // ---- Trams ----
  function seat(v) {
    const L = api.lines.find(l => l.id === v.tram.line); if (!L) return;
    if (!L.cum) lineLengths(L);
    const a = pointAt(L, v.tram.s);
    v.group.position.set(a.p[0], a.p[1] + 0.1, a.p[2]);
    v.group.rotation.set(-Math.atan2(a.d[1], Math.hypot(a.d[0], a.d[2])), Math.atan2(a.d[0], a.d[2]), 0, 'YXZ');
    v.group.updateMatrixWorld(true);
  }
  const collide = (v, on) => vehicles.remote ? null : physics.post(on ? { op: 'setStaticBox', key: 'veh' + v.id, hx: v.def.hx, hy: v.def.hy, hz: v.def.hz, pos: [v.group.position.x, v.group.position.y + v.def.bodyY, v.group.position.z], quat: v.group.quaternion.toArray(), owner: v.id, group: 'machine' } : { op: 'setStaticBox', key: 'veh' + v.id, remove: true });
  vehicles.onTram = (v) => {
    const L = api.lines.find(l => l.id === v.tram.line); if (!L) return;
    if (v.tram.moving) { v.tram.moving = false; collide(v, true); hud.toast('Tram stopped'); return; }
    if (v.tram.s >= L.len - 0.2) v.tram.dir = -1; else if (v.tram.s <= 0.2) v.tram.dir = 1;
    v.tram.moving = true; collide(v, false); audio.play('pickup');
    hud.toast(`Tram off to the ${v.tram.dir > 0 ? 'far' : 'near'} end · ${vehicles.cargoKg(v.id).toFixed(0)} kg aboard`);
  };
  api.update = (dt) => {
    for (const v of vehicles.list.values()) {
      if (!v.tram) continue;
      const L = api.lines.find(l => l.id === v.tram.line); if (!L) continue;
      if (!L.cum) lineLengths(L);
      if (v.tram.moving) {
        v.tram.s += v.tram.dir * v.def.speed * dt;
        if (v.tram.s <= 0 || v.tram.s >= L.len) { v.tram.s = Math.max(0, Math.min(L.len, v.tram.s)); v.tram.moving = false; seat(v); collide(v, true); audio.play('drop'); }
      }
      seat(v);
    }
  };
  api.serialize = () => ({ lines: api.lines.map(l => ({ id: l.id, pts: l.pts })), nextLine: api.nextLine });
  api.restore = (d) => { api.lines = (d?.lines || []).map(l => ({ id: l.id, pts: l.pts })); api.nextLine = d?.nextLine || 1; rebuildRails(); for (const v of vehicles.list.values()) if (v.tram) { seat(v); collide(v, !v.tram.moving); } };
  api.pointAt = pointAt; api.rebuild = rebuildRails;
  return api;
}
