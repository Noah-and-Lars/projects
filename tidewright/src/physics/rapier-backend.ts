// Rapier implementation of PhysicsBackend.
import RAPIER from '@dimforge/rapier3d-compat';
import type { BodyDesc, BodyPose, PhysicsBackend } from './backend';
import type { Vec3, Quat } from '../sim-core/math';
import type { Terrain } from '../sim-core/terrain';
import type { RayHit } from '../sim-core/vehicle-sim';

export class RapierBackend implements PhysicsBackend {
  readonly name = 'rapier';
  private world!: RAPIER.World;
  private bodies = new Map<number, RAPIER.RigidBody>();
  private terrainCollider: RAPIER.Collider | null = null;
  private nextId = 1;
  private ray!: RAPIER.Ray;

  async init(): Promise<void> {
    await (RAPIER.init as (o?: object) => Promise<void>)({});
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.integrationParameters.numSolverIterations = 4;
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  setGravity(g: Vec3): void {
    this.world.gravity = { x: g[0], y: g[1], z: g[2] };
  }

  setTerrain(t: Terrain): void {
    if (this.terrainCollider) this.world.removeCollider(this.terrainCollider, false);
    const n = t.res;
    // Rapier wants column-major heights with rows along Z and columns along X.
    const H = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) H[iz + ix * n] = t.heights[iz * n + ix];
    const desc = RAPIER.ColliderDesc.heightfield(n - 1, n - 1, H, { x: t.size, y: 1, z: t.size }).setFriction(0.9);
    this.terrainCollider = this.world.createCollider(desc);
    // Refresh the query pipeline so raycasts work before the first real step.
    const dt = this.world.timestep;
    this.world.timestep = 0;
    this.world.step();
    this.world.timestep = dt;
  }

  createBody(d: BodyDesc): number {
    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(d.position[0], d.position[1], d.position[2])
      .setRotation({ x: d.quat[0], y: d.quat[1], z: d.quat[2], w: d.quat[3] })
      .setAdditionalMassProperties(d.mass, { x: d.com[0], y: d.com[1], z: d.com[2] }, { x: d.inertia[0], y: d.inertia[1], z: d.inertia[2] }, { x: 0, y: 0, z: 0, w: 1 })
      .setCanSleep(false)
      .setAngularDamping(0.05)
      .setLinearDamping(0.0);
    const rb = this.world.createRigidBody(rbDesc);
    for (const b of d.boxes) {
      const cd = RAPIER.ColliderDesc.cuboid(b.half[0], b.half[1], b.half[2])
        .setTranslation(b.center[0], b.center[1], b.center[2])
        .setDensity(0)
        .setFriction(d.friction ?? 0.6)
        .setRestitution(0.05);
      this.world.createCollider(cd, rb);
    }
    rb.enableCcd(true);
    const id = this.nextId++;
    this.bodies.set(id, rb);
    return id;
  }

  removeBody(id: number): void {
    const rb = this.bodies.get(id);
    if (rb) { this.world.removeRigidBody(rb); this.bodies.delete(id); }
  }

  getPose(id: number): BodyPose {
    const rb = this.bodies.get(id)!;
    const t = rb.translation(), r = rb.rotation(), v = rb.linvel(), w = rb.angvel(), c = rb.worldCom();
    return { pos: [t.x, t.y, t.z], quat: [r.x, r.y, r.z, r.w], linvel: [v.x, v.y, v.z], angvel: [w.x, w.y, w.z], com: [c.x, c.y, c.z] };
  }

  setPose(id: number, pos: Vec3, quat: Quat, resetVelocity: boolean): void {
    const rb = this.bodies.get(id);
    if (!rb) return;
    rb.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
    rb.setRotation({ x: quat[0], y: quat[1], z: quat[2], w: quat[3] }, true);
    if (resetVelocity) { rb.setLinvel({ x: 0, y: 0, z: 0 }, true); rb.setAngvel({ x: 0, y: 0, z: 0 }, true); }
  }

  applyImpulseAtPoint(id: number, j: Vec3, p: Vec3): void {
    this.bodies.get(id)?.applyImpulseAtPoint({ x: j[0], y: j[1], z: j[2] }, { x: p[0], y: p[1], z: p[2] }, true);
  }

  raycast(o: Vec3, d: Vec3, maxDist: number, excludeBody?: number): RayHit | null {
    this.ray.origin = { x: o[0], y: o[1], z: o[2] };
    this.ray.dir = { x: d[0], y: d[1], z: d[2] };
    const ex = excludeBody !== undefined ? this.bodies.get(excludeBody) : undefined;
    const hit = this.world.castRayAndGetNormal(this.ray, maxDist, true, undefined, undefined, undefined, ex);
    if (!hit) return null;
    return { dist: hit.timeOfImpact, normal: [hit.normal.x, hit.normal.y, hit.normal.z] };
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  bodyCount(): number { return this.world.bodies.len(); }
  colliderCount(): number { return this.world.colliders.len(); }
}
