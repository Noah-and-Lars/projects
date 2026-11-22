// Physics engine abstraction so Rapier can be swapped (e.g. for Jolt) without touching game code.
import type { Vec3, Quat } from '../sim-core/math';
import type { Terrain } from '../sim-core/terrain';
import type { RayHit } from '../sim-core/vehicle-sim';

export interface BodyDesc {
  position: Vec3;
  quat: Quat;
  mass: number;
  com: Vec3; // body-local
  inertia: Vec3; // principal, body axes
  boxes: { center: Vec3; half: Vec3 }[];
  friction?: number;
}

export interface BodyPose { pos: Vec3; quat: Quat; linvel: Vec3; angvel: Vec3; com: Vec3 }

export interface PhysicsBackend {
  readonly name: string;
  init(): Promise<void>;
  setGravity(g: Vec3): void;
  setTerrain(t: Terrain): void;
  createBody(desc: BodyDesc): number;
  removeBody(id: number): void;
  getPose(id: number): BodyPose;
  setPose(id: number, pos: Vec3, quat: Quat, resetVelocity: boolean): void;
  applyImpulseAtPoint(id: number, impulse: Vec3, point: Vec3): void;
  raycast(origin: Vec3, dir: Vec3, maxDist: number, excludeBody?: number): RayHit | null;
  step(dt: number): void;
  bodyCount(): number;
  colliderCount(): number;
}
