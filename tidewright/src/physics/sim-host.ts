// Simulation host: owns the physics backend and all simulated vehicles. Runs in the worker
// (or headless in tests). Fixed 60 Hz ticks, each split into wheel substeps.
import type { PhysicsBackend } from './backend';
import { buildTerrain, heightAt, type Terrain, type TerrainSpec } from '../sim-core/terrain';
import { deserialize, type VehicleFile } from '../sim-core/vehicle-format';
import { assemble } from '../sim-core/assembly';
import { VehicleSim, NO_CONTROLS, type Controls } from '../sim-core/vehicle-sim';
import { qaxis, qrot, type Vec3, type Quat } from '../sim-core/math';
import { wavesFor, type Wave, type SeaState } from '../sim-core/waves';
import { SNAP_HEADER, SNAP_PER_WHEEL, type SpawnInfo, type VehicleSnap } from './protocol';

export const TICK = 1 / 60;
export const SUBSTEPS = 2;

interface HostVehicle { id: number; body: number; sim: VehicleSim; controls: Controls }

export class SimHost {
  terrain!: Terrain;
  vehicles = new Map<number, HostVehicle>();
  time = 0;
  tickCount = 0;
  sea: SeaState = { level: 0.15, windDir: 0.6 };
  waves: Wave[] = wavesFor(this.sea);
  constructor(public backend: PhysicsBackend) {}

  async init(spec: TerrainSpec): Promise<void> {
    await this.backend.init();
    this.terrain = buildTerrain(spec);
    this.backend.setTerrain(this.terrain);
  }

  setSea(level: number, windDir = this.sea.windDir) {
    this.sea = { level: Math.max(0, Math.min(1, level)), windDir };
    this.waves = wavesFor(this.sea);
  }

  /** Nearest open water south of the Yard pad (a launch point for boats). */
  seaSpawn(): { x: number; z: number } {
    const { pad } = this.terrain;
    for (let d = pad.r; d < 700; d += 4) {
      const z = pad.z + d;
      let ok = true;
      for (const [dx, dz] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) if (heightAt(this.terrain, pad.x + dx, z + dz) > -3.5) ok = false;
      if (ok) return { x: pad.x, z: z + 10 };
    }
    return { x: pad.x, z: pad.z + 300 };
  }

  spawn(id: number, file: VehicleFile, at?: { x: number; z: number; yaw: number }): SpawnInfo {
    this.remove(id);
    const { grid } = deserialize(file);
    const model = assemble(grid);
    const boat = model.screws.length > 0 || (model.wheels.length === 0 && model.hull.maxBuoyancy > model.mass * 9.81 * 1.1);
    if (boat) {
      const s = this.seaSpawn();
      at = { x: s.x, z: s.z, yaw: Math.PI }; // face the open sea (south, +Z)
    }
    const x = at?.x ?? this.terrain.pad.x, z = at?.z ?? this.terrain.pad.z;
    const quat = qaxis([0, 1, 0], at?.yaw ?? 0);
    // Lift so the lowest wheel/blocks clear the ground; the springs settle it.
    const lowest = Math.min(model.bounds.min[1], ...model.wheels.map((w) => w.center[1] - w.radius - w.travel * 0.5));
    let ground = -1e9;
    for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) ground = Math.max(ground, heightAt(this.terrain, x + dx, z + dz));
    const pos: Vec3 = boat ? [x, -model.bounds.min[1] - 0.25, z] : [x, ground - lowest + 0.15, z];
    const body = this.backend.createBody({ position: pos, quat, mass: model.mass, com: model.com, inertia: model.inertia, boxes: model.boxes });
    this.vehicles.set(id, { id, body, sim: new VehicleSim(model), controls: { ...NO_CONTROLS } });
    return {
      id, mass: model.mass, com: model.com as [number, number, number], colliders: model.boxes.length, inWater: boat,
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
    v.sim.flood.fill(0);
  }

  ignition(id: number, on: boolean): void {
    this.vehicles.get(id)?.sim.ignition(on);
  }

  tick(): void {
    const dt = TICK / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const v of this.vehicles.values()) {
        const pose = this.backend.getPose(v.body);
        const imps = v.sim.step(dt, pose, v.controls, (o, d, max) => this.backend.raycast(o, d, max, v.body), { waves: this.waves, t: this.time + s * dt });
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
