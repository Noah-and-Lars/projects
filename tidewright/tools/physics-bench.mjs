// Phase 0 spike: 20 jointed vehicles in raw Rapier (worst case: unmerged colliders).
// Each vehicle = chassis with ~300 cuboid colliders + 4 motorised wheel bodies on revolute joints
// + 2 hinged flaps = 6 joints. Usage: node tools/physics-bench.mjs [vehicles] [colliders]
import RAPIER from '@dimforge/rapier3d-compat';

const N = Number(process.argv[2] ?? 20);
const COLL = Number(process.argv[3] ?? 300);
await RAPIER.init({});
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = 1 / 60;
world.integrationParameters.numSolverIterations = 4;
world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0));

for (let v = 0; v < N; v++) {
  const x0 = (v % 5) * 8 - 16, z0 = Math.floor(v / 5) * 10 - 20;
  const chassis = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x0, 1.2, z0));
  // ~COLL cells of 0.25 m in a 10 x 3 x 10 slab-ish hull (unmerged on purpose)
  let c = 0;
  for (let y = 0; y < 3 && c < COLL; y++) for (let ix = 0; ix < 10 && c < COLL; ix++) for (let iz = 0; iz < 16 && c < COLL; iz++, c++)
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.125, 0.125, 0.125).setTranslation(ix * 0.25 - 1.125, y * 0.25, iz * 0.25 - 2).setDensity(40), chassis);
  for (const [wx, wz] of [[-1.5, -1.6], [1.5, -1.6], [-1.5, 1.6], [1.5, 1.6]]) {
    const wheel = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x0 + wx, 0.45, z0 + wz));
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.12, 0.42).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setFriction(1.2).setDensity(200), wheel);
    const j = world.createImpulseJoint(RAPIER.JointData.revolute({ x: wx, y: -0.75, z: wz }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), chassis, wheel, true);
    j.configureMotorVelocity(-8, 50);
  }
  for (const fz of [-2.3, 2.3]) {
    const flap = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x0, 1.0, z0 + fz));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.0, 0.05, 0.3).setDensity(50), flap);
    world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0.8, z: fz }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), chassis, flap, true);
  }
}
for (let i = 0; i < 60; i++) world.step();
const times = [];
for (let i = 0; i < 600; i++) { const t = performance.now(); world.step(); times.push(performance.now() - t); }
times.sort((a, b) => a - b);
const mean = times.reduce((a, b) => a + b, 0) / times.length;
console.log(JSON.stringify({ vehicles: N, collidersPerVehicle: COLL, joints: N * 6, bodies: world.bodies.len(), colliders: world.colliders.len(),
  stepMs: { mean: +mean.toFixed(3), median: +times[300].toFixed(3), p95: +times[570].toFixed(3), max: +times[599].toFixed(3) } }));
