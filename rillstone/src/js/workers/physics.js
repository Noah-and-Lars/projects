// Physics worker: owns the Rapier world and steps it at a fixed 60 Hz.
//
// Only things that are loose and moving right now live here as dynamic
// bodies (BUILD_BRIEF section 4). Terrain is static colliders; the player is a
// kinematic character controller. The main thread drives the clock: each
// 'step' message advances N fixed steps and replies with the transforms of
// bodies that moved, packed into a transferable Float32Array, plus the
// answers to any ray or shape queries batched with it.
import RAPIER from '@dimforge/rapier3d-compat';

const DT = 1 / 60;
const KILL_Y = -60;
const G = { TERRAIN: 1, ITEM: 2, PLAYER: 4, VEHICLE: 8, MACHINE: 16 };
// Rapier interaction groups: high 16 bits = membership, low 16 = filter.
const grp = (member, filter) => (member << 16) | filter;
const GROUPS = {
  terrain: grp(G.TERRAIN, 0xffff),
  item: grp(G.ITEM, G.TERRAIN | G.ITEM | G.VEHICLE | G.MACHINE),
  player: grp(G.PLAYER, G.TERRAIN | G.VEHICLE | G.MACHINE),
  vehicle: grp(G.VEHICLE, 0xffff),
  machine: grp(G.MACHINE, 0xffff),
};

let world, kcc, player = null;
const vehicles = new Map(); // id -> { rb, vc, def, input, hold }
const bodies = new Map();   // id -> { rb, col, sentAsleep }
const flows = new Map();    // id -> { y, vx, vz, t } floating items in the river
const statics = new Map();  // key -> collider
const colliderOwner = new Map(); // collider handle -> body id
let stepMs = 0;

function shapeDesc(s) {
  const C = RAPIER.ColliderDesc;
  switch (s.type) {
    case 'ball': return C.ball(s.r);
    case 'box': return C.cuboid(s.hx, s.hy, s.hz);
    case 'capsule': return C.capsule(s.hh, s.r);
    case 'cylinder': return C.cylinder(s.hh, s.r);
    case 'convex': return C.convexHull(new Float32Array(s.points)) || C.ball(0.1);
    default: throw new Error('unknown shape ' + s.type);
  }
}

const H = {
  async init(m) {
    await RAPIER.init();
    world = new RAPIER.World({ x: 0, y: -(m.gravity || 22), z: 0 });
    world.timestep = DT;
    if (m.lengthUnit) world.lengthUnit = m.lengthUnit;
    return { ok: true, version: RAPIER.version() };
  },

  // Static trimesh (a terrain chunk or the valley). Replaces any previous one with this key.
  setStatic(m) {
    const old = statics.get(m.key);
    if (old) { world.removeCollider(old, false); statics.delete(m.key); }
    if (!m.vertices || m.indices.length < 3) return { ok: true };
    const t0 = performance.now();
    const desc = m.kind === 'heightfield'
      ? RAPIER.ColliderDesc.heightfield(m.nrows, m.ncols, m.heights, m.scale)
      : RAPIER.ColliderDesc.trimesh(m.vertices, m.indices);
    if (m.pos) desc.setTranslation(m.pos[0], m.pos[1], m.pos[2]);
    desc.setCollisionGroups(GROUPS.terrain).setFriction(m.friction ?? 0.9);
    statics.set(m.key, world.createCollider(desc));
    return { ok: true, ms: performance.now() - t0 };
  },
  setStaticBox(m) {
    const old = statics.get(m.key);
    if (old) { world.removeCollider(old, false); statics.delete(m.key); }
    if (m.remove) return { ok: true };
    const d = RAPIER.ColliderDesc.cuboid(m.hx, m.hy, m.hz).setTranslation(m.pos[0], m.pos[1], m.pos[2]).setCollisionGroups(GROUPS[m.group || 'terrain']);
    if (m.quat) d.setRotation({ x: m.quat[0], y: m.quat[1], z: m.quat[2], w: m.quat[3] });
    if (m.sensor) d.setSensor(true);
    // Slick surfaces (a chute): low friction, combined by the minimum so
    // items slide whatever their own friction.
    if (m.friction != null) d.setFriction(m.friction).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
    const col = world.createCollider(d);
    statics.set(m.key, col);
    if (m.owner != null) colliderOwner.set(col.handle, m.owner);
    return { ok: true };
  },

  addBody(m) {
    if (bodies.has(m.id)) H.removeBody(m);
    const rd = (m.kinematic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(m.pos[0], m.pos[1], m.pos[2])
      .setCcdEnabled(!!m.ccd)
      .setLinearDamping(m.linDamp ?? 0.05).setAngularDamping(m.angDamp ?? 0.4);
    if (m.quat) rd.setRotation({ x: m.quat[0], y: m.quat[1], z: m.quat[2], w: m.quat[3] });
    if (m.vel) rd.setLinvel(m.vel[0], m.vel[1], m.vel[2]);
    if (m.asleep) rd.setSleeping(true);
    const rb = world.createRigidBody(rd);
    const cd = shapeDesc(m.shape).setCollisionGroups(GROUPS[m.group || 'item']).setFriction(m.friction ?? 0.7).setRestitution(m.restitution ?? 0.1);
    if (m.mass) cd.setMass(m.mass);
    const col = world.createCollider(cd, rb);
    colliderOwner.set(col.handle, m.id);
    bodies.set(m.id, { rb, col, sentAsleep: false });
    return { ok: true };
  },
  removeBody(m) {
    const b = bodies.get(m.id);
    if (!b) return { ok: true };
    colliderOwner.delete(b.col.handle);
    world.removeRigidBody(b.rb);
    bodies.delete(m.id);
    return { ok: true };
  },
  // Teleport / impulse / wake.
  setBody(m) {
    const b = bodies.get(m.id);
    if (!b) return { ok: false };
    if (m.pos) b.rb.setTranslation({ x: m.pos[0], y: m.pos[1], z: m.pos[2] }, true);
    if (m.quat) b.rb.setRotation({ x: m.quat[0], y: m.quat[1], z: m.quat[2], w: m.quat[3] }, true);
    if (m.vel) b.rb.setLinvel({ x: m.vel[0], y: m.vel[1], z: m.vel[2] }, true);
    if (m.wake) b.rb.wakeUp();
    b.sentAsleep = false;
    return { ok: true };
  },

  // Vehicles: a dynamic chassis with Rapier's ray-cast vehicle controller
  // (BUILD_BRIEF 3.7): low centre of mass, anti-roll, speed-clamped steering,
  // high friction slip on dirt, mild air control.
  createVehicle(m) {
    if (vehicles.has(m.id)) H.removeVehicle(m);
    const d = m.def;
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(m.pos[0], m.pos[1], m.pos[2])
      .setRotation({ x: m.quat[0], y: m.quat[1], z: m.quat[2], w: m.quat[3] }).setLinearDamping(0.08).setAngularDamping(0.6).setCcdEnabled(true));
    const body = world.createCollider(RAPIER.ColliderDesc.cuboid(d.hx, d.hy, d.hz).setTranslation(0, d.bodyY, 0).setMass(d.mass * 0.6).setFriction(0.6).setCollisionGroups(GROUPS.vehicle), rb);
    // Ballast low in the frame pulls the centre of mass down: hard to roll.
    world.createCollider(RAPIER.ColliderDesc.cuboid(d.hx * 0.8, 0.08, d.hz * 0.8).setTranslation(0, d.ballastY, 0).setMass(d.mass * 0.4).setCollisionGroups(GROUPS.vehicle), rb);
    colliderOwner.set(body.handle, m.id);
    const vc = world.createVehicleController(rb);
    vc.indexUpAxis = 1; vc.setIndexForwardAxis = 2;
    for (const w of d.wheels) {
      vc.addWheel({ x: w[0], y: w[1], z: w[2] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, d.suspRest, d.wheelR);
      const i = vc.numWheels() - 1;
      vc.setWheelSuspensionStiffness(i, d.stiffness); vc.setWheelSuspensionCompression(i, d.compression); vc.setWheelSuspensionRelaxation(i, d.relaxation);
      vc.setWheelMaxSuspensionTravel(i, d.travel); vc.setWheelMaxSuspensionForce(i, d.mass * 40); vc.setWheelFrictionSlip(i, d.slip); vc.setWheelSideFrictionStiffness(i, d.sideStiff);
    }
    vehicles.set(m.id, { rb, vc, def: d, input: { throttle: 0, steer: 0, brake: 0 }, body, extra: 0, steer: 0 });
    return { ok: true };
  },
  removeVehicle(m) { const v = vehicles.get(m.id); if (!v) return { ok: true }; colliderOwner.delete(v.body.handle); world.removeVehicleController(v.vc); world.removeRigidBody(v.rb); vehicles.delete(m.id); return { ok: true }; },
  // River current for floating items: [{ id, y (water surface), vx, vz }].
  // Each step they're held at the surface and eased toward the current;
  // an entry lapses if the main thread stops sending it (out of the water).
  flow(m) { const t = performance.now(); for (const f of m.list) flows.set(f.id, { ...f, t }); return { ok: true }; },
  vehicleInput(m) { const v = vehicles.get(m.id); if (v) Object.assign(v.input, m.input); return { ok: true }; },
  // Cargo is data on the vehicle; its weight is added to the chassis.
  vehicleMass(m) { const v = vehicles.get(m.id); if (v) { v.extra = m.kg; v.rb.setAdditionalMass(m.kg, true); } return { ok: true }; },
  // Unflip in place: lift and set upright, keep heading.
  unflip(m) {
    const v = vehicles.get(m.id); if (!v) return { ok: false };
    const q = v.rb.rotation(), p = v.rb.translation();
    const fwdX = 2 * (q.x * q.z + q.w * q.y), fwdZ = 1 - 2 * (q.x * q.x + q.y * q.y);
    const yaw = Math.atan2(fwdX, fwdZ);
    v.rb.setTranslation({ x: p.x, y: p.y + 1.6, z: p.z }, true);
    v.rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    v.rb.setLinvel({ x: 0, y: 0, z: 0 }, true); v.rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return { ok: true };
  },
  teleportVehicle(m) {
    const v = vehicles.get(m.id); if (!v) return { ok: false };
    v.rb.setTranslation({ x: m.pos[0], y: m.pos[1], z: m.pos[2] }, true);
    v.rb.setRotation({ x: m.quat[0], y: m.quat[1], z: m.quat[2], w: m.quat[3] }, true);
    v.rb.setLinvel({ x: 0, y: 0, z: 0 }, true); v.rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return { ok: true };
  },
  // Benchmark 1: build a Rapier voxel collider for a chunk's solid voxels,
  // then time single-voxel edits, for comparison with trimesh rebuilds.
  benchVoxels(m) {
    const t0 = performance.now();
    const col = world.createCollider(RAPIER.ColliderDesc.voxels(m.points, { x: 0.5, y: 0.5, z: 0.5 }).setCollisionGroups(GROUPS.terrain));
    const create = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < m.edits; i++) { const k = (i * 3) % (m.points.length / 3); col.setVoxel(m.points[k * 3], m.points[k * 3 + 1], m.points[k * 3 + 2], i % 2 === 1); }
    const edit = (performance.now() - t1) / m.edits;
    world.removeCollider(col, false);
    return { create, edit, voxels: m.points.length / 3 };
  },
  createPlayer(m) {
    if (player) world.removeRigidBody(player.rb);
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(m.pos[0], m.pos[1], m.pos[2]));
    // Capsule: 1.8 m tall, 0.3 m radius. Position is the capsule centre.
    const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.3).setCollisionGroups(GROUPS.player), rb);
    kcc = world.createCharacterController(0.02);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    kcc.setMinSlopeSlideAngle(55 * Math.PI / 180);
    kcc.enableAutostep(m.stepUp ?? 0.35, 0.2, false);
    kcc.enableSnapToGround(0.3);
    kcc.setApplyImpulsesToDynamicBodies(true);
    kcc.setCharacterMass(80);
    player = { rb, col, vy: 0, grounded: false, fly: false };
    return { ok: true };
  },
  teleportPlayer(m) {
    if (!player) return { ok: false };
    player.rb.setTranslation({ x: m.pos[0], y: m.pos[1], z: m.pos[2] }, true);
    player.rb.setNextKinematicTranslation({ x: m.pos[0], y: m.pos[1], z: m.pos[2] });
    player.vy = 0;
    return { ok: true };
  },
};

function driveVehicle(v) {
  const d = v.def, inp = v.input, rb = v.rb, vc = v.vc;
  const speed = vc.currentVehicleSpeed();
  // Steering clamped by speed, eased toward the target.
  const maxSteer = d.maxSteer / (1 + Math.abs(speed) * d.steerFalloff);
  v.steer += (inp.steer * maxSteer - v.steer) * 0.15;
  const fuelOk = inp.fuel !== false;
  const throttle = fuelOk ? inp.throttle : 0;
  // Reversing: throttle backwards once nearly stopped; otherwise it brakes.
  let engine = 0, brake = inp.brake ? d.brake : 0;
  const top = Math.max(0, 1 - Math.abs(speed) / (d.topSpeed || 15));
  if (throttle > 0) engine = throttle * d.engine * top * (speed < -0.5 ? 0 : 1), brake += speed < -0.5 ? d.brake : 0;
  else if (throttle < 0) { if (speed > 0.5) brake += d.brake; else engine = throttle * d.engine * 0.6; }
  else if (!inp.driver) brake += d.brake; // parked: handbrake on
  else brake += d.brake * 0.03; // rolling resistance
  // In the river: water over the bed drags the chassis, and an engine in
  // deeper water than its wading depth loses most of its power.
  const wet = inp.water || 0;
  if (wet > 0.05) {
    const wade = d.wade ?? 0.8;
    engine *= wet > wade ? 0.2 : 1 - 0.45 * (wet / wade);
    const lv = rb.linvel(), k = Math.min(0.9, wet * 1.4) * rb.mass() * DT;
    rb.applyImpulse({ x: -lv.x * k, y: 0, z: -lv.z * k }, true);
  }
  for (let i = 0; i < vc.numWheels(); i++) {
    const front = d.wheels[i][2] > 0;
    // Tracks: no steering wheels, every wheel drives (skid steer below).
    vc.setWheelSteering(i, d.skid ? 0 : front ? v.steer : 0);
    vc.setWheelEngineForce(i, d.skid ? engine / vc.numWheels() : front ? engine * 0.35 : engine * 0.65);
    vc.setWheelBrake(i, d.skid && inp.steer && !throttle ? brake * 0.3 : brake);
  }
  if (d.skid && fuelOk) {
    // Skid steer: turn on the spot by driving the yaw rate toward the input.
    const av = rb.angvel();
    rb.setAngvel({ x: av.x, y: av.y + (inp.steer * d.turnRate - av.y) * 0.25, z: av.z }, true);
  }
  vc.updateVehicle(DT, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, grp(G.VEHICLE, G.TERRAIN | G.MACHINE), (c) => c.parent() !== rb);
  // Anti-roll and mild air control: torque the chassis back toward upright.
  const q = rb.rotation();
  const upX = 2 * (q.x * q.y - q.w * q.z), upY = 1 - 2 * (q.x * q.x + q.z * q.z), upZ = 2 * (q.y * q.z + q.w * q.x);
  let grounded = 0; for (let i = 0; i < vc.numWheels(); i++) if (vc.wheelIsInContact(i)) grounded++;
  const k = (grounded ? d.antiRoll : d.airControl) * rb.mass();
  // Torque axis = up x worldUp = (upZ, 0, -upX) * ... (cross(up, (0,1,0)) = (-upZ, 0, upX)) negated to restore.
  if (upY > 0.2) rb.applyTorqueImpulse({ x: upZ * k * DT, y: 0, z: -upX * k * DT }, true);
  v.grounded = grounded; v.speed = speed;
}

function movePlayer(inp) {
  if (!player || !inp) return;
  if (inp.drive != null) {
    const v = vehicles.get(inp.drive);
    if (v) {
      if (!player.driving) { player.col.setCollisionGroups(0); player.driving = true; }
      const p = v.rb.translation();
      player.rb.setNextKinematicTranslation({ x: p.x, y: p.y + 1.2, z: p.z });
      player.vy = 0; player.grounded = false;
      return;
    }
  } else if (player.driving) { player.col.setCollisionGroups(GROUPS.player); player.driving = false; }
  const g = world.gravity.y;
  if (inp.fly) { player.vy = 0; }
  else {
    if (player.grounded && player.vy <= 0) player.vy = -1;
    if (inp.jump && player.grounded) { player.vy = inp.jumpV; player.grounded = false; }
    player.vy += g * DT;
    if (player.vy < -40) player.vy = -40;
  }
  const want = { x: inp.vx * DT, y: (inp.fly ? inp.vy : player.vy) * DT, z: inp.vz * DT };
  kcc.computeColliderMovement(player.col, want, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, GROUPS.player);
  const mv = kcc.computedMovement();
  const p = player.rb.translation();
  player.rb.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });
  player.grounded = kcc.computedGrounded();
  if (player.grounded && player.vy < 0) player.vy = 0;
  // Bumped our head.
  if (!inp.fly && player.vy > 0 && mv.y < want.y * 0.5) player.vy = 0;
}

function query(q) {
  const filterGroups = q.groups != null ? q.groups : 0xffffffff;
  const excl = player && q.excludePlayer !== false ? player.col : undefined;
  if (q.type === 'ray') {
    const ray = new RAPIER.Ray({ x: q.o[0], y: q.o[1], z: q.o[2] }, { x: q.d[0], y: q.d[1], z: q.d[2] });
    const hit = world.castRayAndGetNormal(ray, q.max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, filterGroups, excl);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return { id: colliderOwner.get(hit.collider.handle) ?? null, t, p: [q.o[0] + q.d[0] * t, q.o[1] + q.d[1] * t, q.o[2] + q.d[2] * t], n: [hit.normal.x, hit.normal.y, hit.normal.z] };
  }
  if (q.type === 'overlap') {
    // Is a box at pos free of everything but the ignored id?
    let blocked = false;
    world.intersectionsWithShape({ x: q.pos[0], y: q.pos[1], z: q.pos[2] }, q.quat ? { x: q.quat[0], y: q.quat[1], z: q.quat[2], w: q.quat[3] } : { x: 0, y: 0, z: 0, w: 1 },
      new RAPIER.Cuboid(q.hx, q.hy, q.hz), (c) => { if (colliderOwner.get(c.handle) !== q.ignore) { blocked = true; return false; } return true; },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, filterGroups, excl);
    return { blocked };
  }
  return null;
}

function applyFlows() {
  if (!flows.size) return;
  const now = performance.now();
  for (const [id, f] of flows) {
    const b = bodies.get(id);
    if (!b || now - f.t > 2000) { flows.delete(id); continue; } // refreshed every 0.2 s; lenient for slow frames
    const rb = b.rb, t = rb.translation(), lv = rb.linvel(), sub = f.y - t.y;
    if (sub < -0.25) continue; // above the water (on a bank)
    // Buoyancy: cancel this step's gravity, then a damped spring to the
    // surface; horizontal drift toward the current.
    const vy = lv.y - world.gravity.y * DT + (Math.max(-2.5, Math.min(2.5, sub * 7)) - lv.y) * 0.12;
    rb.setLinvel({ x: lv.x + (f.vx - lv.x) * 0.04, y: vy, z: lv.z + (f.vz - lv.z) * 0.04 }, true);
    const av = rb.angvel(); rb.setAngvel({ x: av.x * 0.97, y: av.y * 0.97 + 0.004, z: av.z * 0.97 }, true);
  }
}
function step(m) {
  const t0 = performance.now();
  const n = Math.max(0, Math.min(m.n ?? 1, 600));
  for (let i = 0; i < n; i++) {
    for (const v of vehicles.values()) driveVehicle(v);
    movePlayer(m.player);
    applyFlows();
    world.step();
  }
  // Collect transforms of awake bodies, plus one final pose when a body
  // falls asleep. (A forced freeze via rb.sleep() was tried for M0 and made
  // bodies sink through terrain when their supports moved; Rapier's own
  // sleeping settles 2,000 nuggets in seconds, see NOTES.md.)
  const out = [];
  let awake = 0, asleep = 0;
  const lost = [];
  for (const [id, b] of bodies) {
    const rb = b.rb;
    // Fell out of the world (through a seam, or thrown): freeze it and tell
    // the main thread, which puts it back somewhere sensible.
    if (!rb.isSleeping() && rb.translation().y < KILL_Y) { rb.setLinvel({ x: 0, y: 0, z: 0 }, false); rb.sleep(); lost.push(id); }
    const nowSleep = rb.isSleeping();
    if (nowSleep) asleep++; else awake++;
    if (!nowSleep || !b.sentAsleep) {
      const p = rb.translation(), q = rb.rotation();
      out.push(id, p.x, p.y, p.z, q.x, q.y, q.z, q.w, nowSleep ? 1 : 0);
      b.sentAsleep = nowSleep;
    }
  }
  const tr = new Float32Array(out);
  let pl = null;
  if (player) { const p = player.rb.translation(); pl = { pos: [p.x, p.y, p.z], grounded: player.grounded, vy: player.vy }; }
  const veh = [];
  for (const [id, v] of vehicles) {
    const p = v.rb.translation(), q = v.rb.rotation(), vc = v.vc, wheels = [];
    for (let i = 0; i < vc.numWheels(); i++) wheels.push([vc.wheelSuspensionLength(i) ?? v.def.suspRest, vc.wheelRotation(i) ?? 0, vc.wheelSteering(i) ?? 0, vc.wheelIsInContact(i) ? 1 : 0]);
    const lv = v.rb.linvel(), av = v.rb.angvel();
    veh.push({ id, p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w], wheels, speed: v.speed || 0, grounded: v.grounded || 0, lv: [lv.x, lv.y, lv.z], av: [av.x, av.y, av.z] });
  }
  const queries = (m.queries || []).map(query);
  stepMs = n ? (performance.now() - t0) / n : 0;
  return { msg: { tr, lost, veh, player: pl, queries, stats: { stepMs, awake, asleep, bodies: bodies.size } }, transfer: [tr.buffer] };
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.op === 'step') { const r = step(m); self.postMessage({ re: m.rq, ...r.msg }, r.transfer); return; }
    if (m.op === 'batch') { for (const x of m.ops) await H[x.op](x); if (m.rq !== undefined) self.postMessage({ re: m.rq, ok: true }); return; }
    const fn = H[m.op];
    if (!fn) throw new Error('unknown op ' + m.op);
    const r = await fn(m);
    if (m.rq !== undefined) self.postMessage({ re: m.rq, ...r });
  } catch (err) {
    if (m.rq !== undefined) self.postMessage({ re: m.rq, err: String(err && err.message || err), stack: err && err.stack });
    else console.error('physics worker', err);
  }
};
