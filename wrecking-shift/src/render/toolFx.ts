import * as THREE from 'three';
import type { V3 } from '../sim/vec';

/**
 * Tool presentation effects (render only, Math.random allowed): rope / cable lines, plank & cable
 * placement previews, rocket meshes + smoke trails, muzzle flash light, foam / spray / spark puffs.
 */

const PUFF_MAX = 900;

/** soft coloured cubes that drift, grow and fade (foam, paint mist, smoke, sparks) */
export class Puffs {
  readonly mesh: THREE.InstancedMesh;
  private p = new Float32Array(PUFF_MAX * 3);
  private v = new Float32Array(PUFF_MAX * 3);
  private life = new Float32Array(PUFF_MAX);
  private maxLife = new Float32Array(PUFF_MAX);
  private size = new Float32Array(PUFF_MAX);
  private grow = new Float32Array(PUFF_MAX);
  private grav = new Float32Array(PUFF_MAX);
  private drag = new Float32Array(PUFF_MAX);
  private head = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private t = new THREE.Vector3();
  private c = new THREE.Color();
  alive = 0;

  constructor(glow = false) {
    const mat = glow ? new THREE.MeshBasicMaterial({ toneMapped: false }) : new THREE.MeshLambertMaterial();
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, PUFF_MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < PUFF_MAX; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1)); }
  }

  spawn(pos: V3, vel: V3, color: number, size: number, life: number, grow = 0, gravity = 0, drag = 0): void {
    const i = this.head;
    this.head = (this.head + 1) % PUFF_MAX;
    const o = i * 3;
    this.p[o] = pos.x; this.p[o + 1] = pos.y; this.p[o + 2] = pos.z;
    this.v[o] = vel.x; this.v[o + 1] = vel.y; this.v[o + 2] = vel.z;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow; this.grav[i] = gravity; this.drag[i] = drag;
    this.mesh.setColorAt(i, this.c.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let alive = 0;
    for (let i = 0; i < PUFF_MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0)); continue; }
      alive++;
      const o = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      this.v[o] *= k; this.v[o + 1] = this.v[o + 1] * k - this.grav[i] * dt; this.v[o + 2] *= k;
      this.p[o] += this.v[o] * dt; this.p[o + 1] += this.v[o + 1] * dt; this.p[o + 2] += this.v[o + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const f = this.life[i] / this.maxLife[i];
      const sz = this.size[i] * Math.min(1, f * 3);
      this.q.set(0.3 * i % 1, 0.7 * i % 1, 0, 1).normalize();
      this.mesh.setMatrixAt(i, this.m.compose(this.t.set(this.p[o], this.p[o + 1], this.p[o + 2]), this.q, this.s.set(sz, sz, sz)));
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    const zero = this.m.makeScale(0, 0, 0);
    for (let i = 0; i < PUFF_MAX; i++) this.mesh.setMatrixAt(i, zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const SEG_MAX = 96;

/** thin oriented boxes between point pairs (ropes, cable preview) */
export class Segments {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private d = new THREE.Vector3();
  private s = new THREE.Vector3();
  private z = new THREE.Vector3(0, 0, 1);
  private c = new THREE.Color();

  constructor(material: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, SEG_MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    for (let i = 0; i < SEG_MAX; i++) this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1));
  }
  begin(): void { this.n = 0; }
  /** box from a to b, cross-section w × h, optional sag (rope droop at the middle, metres) */
  add(a: V3, b: V3, w: number, h: number, color: number, up?: V3): void {
    if (this.n >= SEG_MAX) return;
    this.a.set(a.x, a.y, a.z); this.b.set(b.x, b.y, b.z);
    const len = this.d.subVectors(this.b, this.a).length();
    if (len < 1e-4) return;
    this.d.divideScalar(len);
    if (up) {
      // orient so the box's local Y follows `up` (plank preview lies flat)
      const zAxis = this.d.clone();
      const xAxis = new THREE.Vector3(up.x, up.y, up.z).cross(zAxis).normalize();
      if (xAxis.lengthSq() < 1e-6) this.q.setFromUnitVectors(this.z, this.d);
      else { const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis); this.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)); }
    } else this.q.setFromUnitVectors(this.z, this.d);
    this.a.add(this.b).multiplyScalar(0.5);
    this.m.compose(this.a, this.q, this.s.set(w, h, len));
    this.mesh.setMatrixAt(this.n, this.m);
    this.mesh.setColorAt(this.n, this.c.set(color));
    this.n++;
  }
  /** rope drawn as a few segments sagging under its own weight when slack */
  rope(a: V3, b: V3, length: number, w: number, color: number): void {
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const sag = d < length ? Math.sqrt(Math.max(0, length * length - d * d)) * 0.45 : 0;
    const N = sag > 0.02 ? 8 : 1;
    let prev = a;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), z: a.z + (b.z - a.z) * t };
      this.add(prev, p, w, w, color);
      prev = p;
    }
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** a light that flashes and decays (muzzle flash, beeps, torch glow) */
export class FlashLight {
  readonly light: THREE.PointLight;
  private level = 0;
  private decay: number;
  private peak = 0;
  constructor(color: number, distance: number, decayPerSec: number) {
    this.light = new THREE.PointLight(color, 0, distance, 2);
    this.light.castShadow = false;
    this.decay = decayPerSec;
  }
  flash(pos: V3 | THREE.Vector3, intensity: number, color?: number): void {
    this.light.position.set(pos.x, pos.y, pos.z);
    this.peak = intensity;
    this.level = 1;
    if (color !== undefined) this.light.color.set(color);
  }
  /** keep lit (continuous sources) */
  hold(pos: V3 | THREE.Vector3, intensity: number): void {
    this.light.position.set(pos.x, pos.y, pos.z);
    this.peak = Math.max(this.peak * this.level, intensity);
    this.level = 1;
  }
  update(dt: number): void {
    this.level = Math.max(0, this.level - dt * this.decay);
    this.light.intensity = this.peak * this.level * this.level;
  }
}

export interface RocketView { id: number; pos: V3; vel: V3 }

/** rocket meshes (body + glowing exhaust), pooled */
export class Rockets {
  readonly root = new THREE.Group();
  private pool: THREE.Group[] = [];
  private q = new THREE.Quaternion();
  private z = new THREE.Vector3(0, 0, -1);
  private d = new THREE.Vector3();
  constructor() {
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), new THREE.MeshLambertMaterial({ color: 0x4f5a2e }));
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.08), new THREE.MeshLambertMaterial({ color: 0xc4291c }));
      tip.position.z = -0.2;
      const fins = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), new THREE.MeshLambertMaterial({ color: 0x2a2d31 }));
      fins.position.z = 0.15; fins.scale.set(1, 0.15, 1);
      const fins2 = fins.clone(); fins2.scale.set(0.15, 1, 1);
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.22), new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false }));
      flame.position.z = 0.26; flame.name = 'flame';
      g.add(body, tip, fins, fins2, flame);
      g.visible = false;
      this.pool.push(g);
      this.root.add(g);
    }
  }
  sync(list: RocketView[]): void {
    for (let i = 0; i < this.pool.length; i++) {
      const g = this.pool[i];
      const r = list[i];
      g.visible = !!r;
      if (!r) continue;
      g.position.set(r.pos.x, r.pos.y, r.pos.z);
      this.d.set(r.vel.x, r.vel.y, r.vel.z).normalize();
      g.quaternion.copy(this.q.setFromUnitVectors(this.z, this.d));
      const f = g.getObjectByName('flame')!;
      f.scale.z = 0.7 + Math.random() * 0.7;
    }
  }
}
