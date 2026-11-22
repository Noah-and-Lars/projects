// Vehicles on the main thread: models, wheel animation, driving input, the
// chase camera, fuel, unflip, and cargo. Cargo is data attached to the
// vehicle (BUILD_BRIEF 3.7): items in the bed are drawn as props parented to
// the chassis, have no collision, and add their weight to the chassis.
import * as THREE from 'three';
import { VEHICLES, FUEL_PER_SACK, vehicleBody, wheel, sack, scannerDish, excavatorArm } from '../defs/vehicles.js';
import { EXTRA_MESH, EXTRA_BOX, EXTRA_CARD, EXTRA_MASS } from './items.js';

EXTRA_MESH.sack = () => sack();
EXTRA_BOX.sack = () => [0.21, 0.25, 0.21];
EXTRA_MASS.sack = () => 12;
EXTRA_CARD.sack = () => ({ name: 'Sack of charcoal', lines: ['Fuel for vehicles · about 8 minutes', 'LMB on a vehicle to pour it in'] });

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export function createVehicles({ scene, physics, items, materials, hud, audio }) {
  const list = new Map();
  let nextId = 900;
  const api = { list, driving: null, camYaw: 0, camPitch: -0.25, remote: false, remoteDrivers: new Map() };

  api.spawn = async (type, pos, yaw = 0, state = {}) => {
    const def = VEHICLES[type], id = state.id || nextId++;
    nextId = Math.max(nextId, id + 1);
    const quat = state.quat || [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    // Trams ride rails on a script: a static box (owned by the tram) lets
    // the aim ray find them; game/tram.js moves them.
    if (api.remote) {} // co-op guest: a puppet moved by the host's snapshots
    else if (def.kinematic) physics.post({ op: 'setStaticBox', key: 'veh' + id, hx: def.hx, hy: def.hy, hz: def.hz, pos: [pos[0], pos[1] + def.bodyY, pos[2]], quat, owner: id, group: 'machine' });
    else await physics.call({ op: 'createVehicle', id, pos, quat, def });
    const group = new THREE.Group();
    const body = new THREE.Mesh(vehicleBody(def.model), materials.vcolor); body.castShadow = body.receiveShadow = true; group.add(body);
    const wg = wheel(def.wheelR);
    const wheels = def.wheels.map(([x, y, z]) => { const w = new THREE.Mesh(wg, materials.vcolor); w.castShadow = true; w.position.set(x, y - def.suspRest, z); w.visible = !def.skid; group.add(w); return w; });
    let dish = null, arm = null;
    if (def.scanner) { dish = new THREE.Mesh(scannerDish(), materials.vcolor); dish.position.set(0.45, 2.15, -0.9); group.add(dish); }
    if (def.model === 'excavator') {
      const a = excavatorArm(), M = (g) => { const m = new THREE.Mesh(g, materials.vcolor); m.castShadow = true; return m; };
      const boom = M(a.boom), stick = M(a.stick), bucket = M(a.bucket);
      boom.position.set(0.35, 1.6, 0.9); stick.position.set(0, 0, 2.4); bucket.position.set(0, 0, 1.7);
      boom.add(stick); stick.add(bucket); group.add(boom);
      arm = { boom, stick, bucket, t: 0 };
    }
    const cargoGroup = new THREE.Group(); group.add(cargoGroup);
    // Headlamps for night driving.
    const lamp = new THREE.SpotLight(0xfff0c8, 0, 40, 0.5, 0.5, 1.2); lamp.position.set(0, 1.4, 2.4); lamp.target.position.set(0, 0.5, 12); group.add(lamp, lamp.target);
    scene.add(group);
    const v = { id, type, def, group, wheels, cargoGroup, lamp, dish, arm, fuel: state.fuel ?? def.fuelMax, cargo: [], state: null, flipHold: 0, sputter: 0, hopper: (state.hopper || []).slice(), tram: state.tram ? { ...state.tram } : null, free: !!state.free };
    list.set(id, v);
    if (!def.kinematic) physics.poses.set(id, { p: pos.slice(), q: quat.slice(), asleep: false });
    group.position.fromArray(pos); group.quaternion.fromArray(quat);
    for (const c of state.cargo || []) { const e = items.get(c); if (e) attachCargoMesh(v, e); v.cargo.push(c); }
    syncMass(v);
    return v;
  };
  api.isVehicle = (id) => list.has(id);

  // ---- Cargo ----
  function cargoKg(v) { return v.cargo.reduce((a, id) => { const e = items.get(id); return a + (e ? (e.item ? e.item.kg : 5) : 0); }, 0); }
  function syncMass(v) { physics.post({ op: 'vehicleMass', id: v.id, kg: cargoKg(v) }); }
  function attachCargoMesh(v, e) {
    const m = items.buildMesh(e); m.position.fromArray(e.data.local || [0, v.def.bed.y, -1]); m.quaternion.fromArray(e.data.localQ || [0, 0, 0, 1]);
    m.castShadow = true; m.userData.cargo = e.id; v.cargoGroup.add(m);
  }
  // Does a world point land in this vehicle's bed? Returns the local point.
  api.bedPoint = (id, p) => {
    const v = list.get(id); if (!v || !v.def.bed) return null;
    const inv = _m.copy(v.group.matrixWorld).invert();
    const lp = _v.fromArray(p).applyMatrix4(inv);
    const b = v.def.bed;
    if (Math.abs(lp.x) > b.x + 0.15 || lp.z < b.z0 - 0.15 || lp.z > b.z1 + 0.15 || lp.y < b.y - 0.3 || lp.y > b.y + 1.2) return null;
    return [Math.max(-b.x, Math.min(b.x, lp.x)), b.y, Math.max(b.z0, Math.min(b.z1, lp.z))];
  };
  api.addCargo = (id, ent, worldPoint) => {
    const v = list.get(id); if (!v) return 'none';
    const lp = api.bedPoint(id, worldPoint); if (!lp) return 'miss';
    if (v.cargo.length >= v.def.cargoItems) return 'full';
    const kg = ent.item ? ent.item.kg : 5;
    if (cargoKg(v) + kg > v.def.cargoKg) return 'heavy';
    // Stack on whatever is already near that spot.
    let y = lp[1] + items.halfHeight(ent);
    for (const cid of v.cargo) { const c = items.get(cid); if (c && Math.hypot(c.data.local[0] - lp[0], c.data.local[2] - lp[2]) < 0.25) y = Math.max(y, c.data.local[1] + items.halfHeight(c) * 2); }
    ent.data.local = [lp[0], y, lp[2]]; ent.data.localQ = [0, Math.sin(Math.random() * 3), 0, 1];
    const n = Math.hypot(ent.data.localQ[1], 1); ent.data.localQ[1] /= n; ent.data.localQ[3] /= n;
    ent.loc = 'contained'; ent.container = id;
    v.cargo.push(ent.id); attachCargoMesh(v, ent); syncMass(v);
    return 'ok';
  };
  // Nearest cargo item to a world point (picking things back out of the bed).
  api.cargoNear = (id, p, maxD = 0.5) => {
    const v = list.get(id); if (!v) return null;
    const inv = _m.copy(v.group.matrixWorld).invert(); const lp = _v.fromArray(p).applyMatrix4(inv);
    let best = null, bd = maxD;
    for (const cid of v.cargo) { const c = items.get(cid); if (!c) continue; const d = Math.hypot(c.data.local[0] - lp.x, c.data.local[2] - lp.z); if (d < bd) { bd = d; best = c; } }
    return best;
  };
  api.removeCargo = (id, entId) => {
    const v = list.get(id); if (!v) return;
    v.cargo = v.cargo.filter(c => c !== entId);
    const m = v.cargoGroup.children.find(c => c.userData.cargo === entId); if (m) { v.cargoGroup.remove(m); m.geometry.dispose(); }
    syncMass(v);
  };
  api.cargoKg = (id) => cargoKg(list.get(id));
  // Co-op guests: rebuild the drawn cargo from the host's list.
  api.syncCargo = (id, ids) => {
    const v = list.get(id); if (!v) return;
    if (v.cargo.join(',') === ids.join(',')) return;
    for (const m of v.cargoGroup.children.slice()) { v.cargoGroup.remove(m); m.geometry.dispose(); }
    v.cargo = [];
    for (const c of ids) { const e = items.get(c); if (e && e.data.local) { attachCargoMesh(v, e); v.cargo.push(c); } }
  };

  api.refuel = (id) => {
    const v = list.get(id); if (!v || !v.def.fuelMax) return false;
    if (v.fuel > v.def.fuelMax - FUEL_PER_SACK * 0.5) return false;
    v.fuel = Math.min(v.def.fuelMax, v.fuel + FUEL_PER_SACK);
    return true;
  };
  api.unflip = (id) => physics.call({ op: 'unflip', id });
  api.teleport = (id, pos, yaw) => physics.call({ op: 'teleportVehicle', id, pos, quat: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] });

  api.enter = (id) => { const v = list.get(id); if (!v) return false; if (v.def.kinematic) { api.onTram?.(v); return false; } if (api.remoteDrivers.has(id)) { hud.toast('Someone else is driving that'); return false; } api.driving = id; api.camYaw = 0; audio.play('pickup'); return true; };
  // Where to put the player when they get out: beside the driver's door.
  api.exitPoint = () => {
    const v = list.get(api.driving); if (!v) return null;
    const p = _v.fromArray(v.def.door).applyMatrix4(v.group.matrixWorld);
    return [p.x, p.y + 1.2, p.z];
  };
  api.exit = () => { const p = api.exitPoint(); api.driving = null; return p; };

  // Per-frame: inputs to the worker, fuel, unflip, visuals.
  // alpha: how far we are between the last two physics steps (0..1).
  api.update = (dt, input, enabled, alpha = 1) => {
    for (const v of list.values()) {
      const st = physics.vehicles.get(v.id);
      const driver = api.driving === v.id;
      if (driver) {
        const mv = enabled ? input.move() : { x: 0, y: 0 };
        const throttle = mv.y, steer = -mv.x, brake = enabled && input.held('jump');
        const fuel = v.fuel > 0;
        if (fuel && Math.abs(throttle) > 0.05) v.fuel = Math.max(0, v.fuel - dt * Math.abs(throttle));
        physics.post({ op: 'vehicleInput', id: v.id, input: { throttle, steer, brake: brake ? 1 : 0, driver: true, fuel } });
        if (!fuel && Math.abs(throttle) > 0.05 && (v.sputter -= dt) < 0) { v.sputter = 2.5; hud.toast('Out of fuel — buy charcoal at the Wagon Shed', 'err'); audio.play('error'); }
        else if (fuel && v.fuel < v.def.fuelMax * 0.15 && (v.sputter -= dt) < 0) { v.sputter = 20; hud.toast('Fuel low', 'err'); audio.play('sputter'); }
        // Unflip: hold H for 1 s.
        if (enabled && input.held('unflip')) { v.flipHold += dt; if (v.flipHold > 1) { v.flipHold = -10; api.unflip(v.id); hud.toast('Back on its wheels'); } } else v.flipHold = 0;
      } else if (api.remoteDrivers.has(v.id)) {
        // A co-op guest drives this one: their inputs arrive with their intents.
        const inp = api.remoteDrivers.get(v.id).input || { throttle: 0, steer: 0, brake: 0 };
        const fuel = v.fuel > 0;
        if (fuel && Math.abs(inp.throttle) > 0.05) v.fuel = Math.max(0, v.fuel - dt * Math.abs(inp.throttle));
        physics.post({ op: 'vehicleInput', id: v.id, input: { throttle: +inp.throttle || 0, steer: +inp.steer || 0, brake: inp.brake ? 1 : 0, driver: true, fuel } });
        v.remoteDriven = true;
      } else if (v.wasDriven || v.remoteDriven) { physics.post({ op: 'vehicleInput', id: v.id, input: { throttle: 0, steer: 0, brake: 0, driver: false } }); v.remoteDriven = false; }
      v.wasDriven = driver;
      if (v.dish) v.dish.rotation.y += dt * 2.2;
      if (v.arm) api.animateArm?.(v, dt);
      if (v.def.kinematic) continue;
      if (!st) continue;
      // Interpolate between the last two physics states so the truck glides
      // instead of jumping whenever a physics step lands between frames.
      if (st !== v.state) {
        v.prevP = v.curP ? v.curP.slice() : st.p.slice(); v.prevQ = v.curQ ? v.curQ.slice() : st.q.slice();
        v.curP = st.p.slice(); v.curQ = st.q.slice();
        v.state = st;
        v.tPrev = v.tCur || performance.now(); v.tCur = performance.now();
      }
      // Render one physics interval behind the newest state: smooth even
      // when 0, 1 or 2 steps land in a frame.
      const span = Math.max(1, v.tCur - v.tPrev);
      const a = Math.min(1, Math.max(0, (performance.now() - v.tCur) / span));
      void alpha;
      v.group.position.set(v.prevP[0] + (v.curP[0] - v.prevP[0]) * a, v.prevP[1] + (v.curP[1] - v.prevP[1]) * a, v.prevP[2] + (v.curP[2] - v.prevP[2]) * a);
      if (Math.hypot(v.curP[0] - v.prevP[0], v.curP[2] - v.prevP[2]) > 5) v.group.position.fromArray(v.curP); // teleports snap
      v.group.quaternion.fromArray(v.prevQ).slerp(_q.fromArray(v.curQ), a);
      v.group.updateMatrixWorld(); // bed and seat maths must not wait for a render
      st.wheels.forEach(([susp, rot, steerA], i) => {
        const w = v.wheels[i], [x, y, z] = v.def.wheels[i];
        w.position.set(x, y - susp, z);
        w.rotation.set(rot, steerA, 0, 'YXZ');
      });
      v.lamp.intensity = api.night ? 30 : 0;
    }
  };
  // Chase camera behind the driven vehicle; the mouse orbits it.
  api.camera = (cam, look, dt) => {
    const v = list.get(api.driving); if (!v) return;
    api.camYaw -= look.x; api.camPitch = Math.max(-0.9, Math.min(0.3, api.camPitch - look.y));
    api.camYaw *= Math.pow(0.4, dt); // drift back behind the truck
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.group.quaternion); fwd.y = 0; fwd.normalize();
    const yaw = Math.atan2(fwd.x, fwd.z) + api.camYaw;
    const dist = 8, h = 2.4;
    const target = v.group.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    const want = target.clone().add(new THREE.Vector3(-Math.sin(yaw) * dist * Math.cos(api.camPitch), h - Math.sin(api.camPitch) * dist, -Math.cos(yaw) * dist * Math.cos(api.camPitch)));
    if (!api._cam) api._cam = want.clone();
    api._cam.lerp(want, 1 - Math.pow(0.002, dt));
    cam.position.copy(api._cam);
    cam.lookAt(target);
  };
  api.hud = () => {
    const v = list.get(api.driving); if (!v || !v.state) return null;
    return { speed: Math.abs(v.state.speed) * 3.6, fuel: v.fuel / v.def.fuelMax, cargo: v.cargo.length, kg: cargoKg(v), bed: !!v.def.bed, scanner: !!v.def.scanner, hopper: v.def.hopper ? v.hopper.length : null, hopperMax: v.def.hopper, v };
  };
  api.nearest = (p, maxD = 4) => {
    let best = null, bd = maxD;
    for (const v of list.values()) { const d = v.group.position.distanceTo(_v.fromArray(p)); if (d < bd) { bd = d; best = v; } }
    return best;
  };
  // What the Wagon Shed pays back: half the price (nothing for the free starter).
  api.refund = (v) => v.free ? 0 : Math.round((v.def.price || 0) * 0.5);
  api.serialize = () => [...list.values()].map(v => ({ id: v.id, type: v.type, pos: v.group.position.toArray(), quat: v.group.quaternion.toArray(), fuel: v.fuel, cargo: v.cargo.slice(), hopper: v.hopper.slice(), tram: v.tram ? { ...v.tram } : null, free: v.free || undefined }));
  // Remove a vehicle (selling it back, or a load).
  api.remove = async (id) => {
    const v = list.get(id); if (!v) return;
    if (api.remote) {}
    else if (v.def.kinematic) physics.post({ op: 'setStaticBox', key: 'veh' + id, remove: true });
    else await physics.call({ op: 'removeVehicle', id });
    scene.remove(v.group); list.delete(id);
  };
  return api;
}
