// Simulation host: owns the physics backend and all simulated vehicles. Runs in the worker
// (or headless in tests). Fixed 60 Hz ticks, each split into wheel substeps.
import type { PhysicsBackend } from './backend';
import { buildTerrain, heightAt, type Terrain, type TerrainSpec } from '../sim-core/terrain';
import { deserialize, type VehicleFile } from '../sim-core/vehicle-format';
import { assemble } from '../sim-core/assembly';
import { VehicleSim, NO_CONTROLS, type Controls } from '../sim-core/vehicle-sim';
import { qaxis, qrot, type Vec3, type Quat } from '../sim-core/math';
import { SNAP_HEADER, SNAP_PER_WHEEL, type SpawnInfo, type VehicleSnap } from './protocol';

export const TICK = 1 / 60;
export const SUBSTEPS = 2;

interface HostVehicle { id: number; body: number; sim: VehicleSim; controls: Controls }

export class SimHost {
  terrain!: Terrain;
  vehicles = new Map<number, HostVehicle>();
  time = 0;
  tickCount = 0;
  constructor(public backend: PhysicsBackend) {}

  async init(spec: TerrainSpec): Promise<void> {
    await this.backend.init();
    this.terrain = buildTerrain(spec);
    this.backend.setTerrain(this.terrain);
  }

  spawn(id: number, file: VehicleFile, at?: { x: number; z: number; yaw: number }): SpawnInfo {
    this.remove(id);
    const { grid } = deserialize(file);
    const model = assemble(grid);
    const x = at?.x ?? this.terrain.pad.x, z = at?.z ?? this.terrain.pad.z;
    const quat = qaxis([0, 1, 0], at?.yaw ?? 0);
    // Lift so the lowest wheel/blocks clear the ground; the springs settle it.
    const lowest = Math.min(model.bounds.min[1], ...model.wheels.map((w) => w.center[1] - w.radius - w.travel * 0.5));
    let ground = -1e9;
    for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) ground = Math.max(ground, heightAt(this.terrain, x + dx, z + dz));
    const pos: Vec3 = [x, ground - lowest + 0.15, z];
    const body = this.backend.createBody({ position: pos, quat, mass: model.mass, com: model.com, inertia: model.inertia, boxes: model.boxes });
    this.vehicles.set(id, { id, body, sim: new VehicleSim(model), controls: { ...NO_CONTROLS } });
    return {
      id, mass: model.mass, com: model.com as [number, number, number], colliders: model.boxes.length,
      wheels: model.wheels.map((w) => ({ partId: w.partId, center: w.center as [number, number, number], radius: w.radius, width: w.width, travel: w.travel })),
    };
  }

  remove(id: number): void {
    const v = this.vehicles.get(id);
    if (v) { this.backend.removeBody(v.body); this.vehicles.delete(id); }
  }

  setControls(id: number, c: Controls): void {
    const v = this.vehicles.get(id);
    if (v) v.controls = c;
  }

  /** Put the vehicle back on its wheels, a little above where it is now, keeping its heading. */
  reset(id: number): void {
    const v = this.vehicles.get(id);
    if (!v) return;
    const p = this.backend.getPose(v.body);
    const f = qrot(p.quat, [0, 0, -1]);
    const yaw = Math.atan2(-f[0], -f[2]);
    const q: Quat = qaxis([0, 1, 0], yaw);
    const g = heightAt(this.terrain, p.pos[0], p.pos[2]);
    this.backend.setPose(v.body, [p.pos[0], Math.max(g, 0) + 2.5, p.pos[2]], q, true);
  }

  ignition(id: number, on: boolean): void {
    this.vehicles.get(id)?.sim.ignition(on);
  }

  tick(): void {
    const dt = TICK / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const v of this.vehicles.values()) {
        const pose = this.backend.getPose(v.body);
        const imps = v.sim.step(dt, pose, v.controls, (o, d, max) => this.backend.raycast(o, d, max, v.body));
        for (const { impulse, point } of imps) this.backend.applyImpulseAtPoint(v.body, impulse, point);
      }
      this.backend.step(dt);
      // Edge-triggered inputs only fire once.
      for (const v of this.vehicles.values()) { v.controls.shiftUp = false; v.controls.shiftDown = false; }
    }
    this.time += TICK;
    this.tickCount++;
  }

  snapshot(): VehicleSnap[] {
    const out: VehicleSnap[] = [];
    for (const v of this.vehicles.values()) {
      const p = this.backend.getPose(v.body);
      const n = v.sim.wheels.length;
      const data = new Float32Array(SNAP_HEADER + n * SNAP_PER_WHEEL);
      data.set(p.pos, 0);
      data.set(p.quat, 3);
      v.sim.wheels.forEach((w, i) => {
        const o = SNAP_HEADER + i * SNAP_PER_WHEEL;
        data[o] = w.compression; data[o + 1] = w.steerAngle; data[o + 2] = w.spin;
      });
      out.push({ id: v.id, data, telem: v.sim.telemetry(p) });
    }
    return out;
  }
}
