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
const bodies = new Map();   // id -> { rb, col, sentAsleep }
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
    statics.set(m.key, world.createCollider(d));
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

function movePlayer(inp) {
  if (!player || !inp) return;
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

function step(m) {
  const t0 = performance.now();
  const n = Math.max(0, Math.min(m.n ?? 1, 600));
  for (let i = 0; i < n; i++) {
    movePlayer(m.player);
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
  const queries = (m.queries || []).map(query);
  stepMs = n ? (performance.now() - t0) / n : 0;
  return { msg: { tr, lost, player: pl, queries, stats: { stepMs, awake, asleep, bodies: bodies.size } }, transfer: [tr.buffer] };
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
