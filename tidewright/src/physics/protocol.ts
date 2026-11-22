// Messages between the main thread and the physics worker.
import type { Controls, Telemetry } from '../sim-core/vehicle-sim';
import type { TerrainSpec } from '../sim-core/terrain';
import type { VehicleFile } from '../sim-core/vehicle-format';

export type ToWorker =
  | { type: 'init'; terrain: TerrainSpec }
  | { type: 'spawn'; id: number; file: VehicleFile; at?: { x: number; z: number; yaw: number } }
  | { type: 'remove'; id: number }
  | { type: 'controls'; id: number; controls: Controls }
  | { type: 'reset'; id: number }
  | { type: 'ignition'; id: number; on: boolean }
  | { type: 'pause'; paused: boolean }
  | { type: 'sea'; level: number; windDir?: number };

export interface SpawnInfo {
  id: number;
  wheels: { partId: number; center: [number, number, number]; radius: number; width: number; travel: number }[];
  mass: number;
  com: [number, number, number];
  colliders: number;
  inWater: boolean;
}

export interface VehicleSnap { id: number; data: Float32Array; telem: Telemetry }

export type FromWorker =
  | { type: 'ready'; backend: string }
  | { type: 'spawned'; info: SpawnInfo }
  | { type: 'snap'; t: number; tick: number; stepMs: number; dilation: number; sea: { level: number; windDir: number }; vehicles: VehicleSnap[] }
  | { type: 'error'; message: string };

/** Per-vehicle snapshot layout: pos(3) quat(4) then per wheel: compression, steer, spin. */
export const SNAP_HEADER = 7;
export const SNAP_PER_WHEEL = 3;
