import * as THREE from 'three';
import { PAL_RGB } from '../sim/materials';
import type { Sim } from '../sim/sim';
import type { V3 } from '../sim/vec';

const MAX = 3000;

/** Presentation-only voxel chip particles (instanced cubes with cheap ballistic motion). */
export class ChipParticles {
  readonly mesh: THREE.InstancedMesh;
  private px = new Float32Array(MAX * 3);
  private pv = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private rest = new Uint8Array(MAX);
  /** tumbling: random axis (3) + angle + angular speed per chip */
  private rax = new Float32Array(MAX * 3);
  private ang = new Float32Array(MAX * 2);
  private q = new THREE.Quaternion();
  private ax = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private head = 0;
  private m = new THREE.Matrix4();
  private col = new THREE.Color();
  alive = 0;

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = MAX;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, this.col.setRGB(1, 1, 1)); }
  }

  spawn(p: V3, v: V3, pal: number, size = 0.1, life = 2.5): void {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.px[i * 3] = p.x; this.px[i * 3 + 1] = p.y; this.px[i * 3 + 2] = p.z;
    this.pv[i * 3] = v.x; this.pv[i * 3 + 1] = v.y; this.pv[i * 3 + 2] = v.z;
    this.life[i] = life; this.size[i] = size; this.rest[i] = 0;
    let ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5;
    const al = Math.hypot(ax, ay, az) || 1;
    this.rax[i * 3] = ax / al; this.rax[i * 3 + 1] = ay / al; this.rax[i * 3 + 2] = az / al;
    this.ang[i * 2] = Math.random() * 6.283; this.ang[i * 2 + 1] = (Math.random() - 0.5) * 30;
    // chips are mostly dust-grey flecks with a hint of the material (the genre reference uses plain grey chips)
    const r = PAL_RGB[pal * 3], g = PAL_RGB[pal * 3 + 1], b = PAL_RGB[pal * 3 + 2];
    const grey = (r + g + b) / 3, w = 0.55, k = 0.8 + Math.random() * 0.4;
    this.col.setRGB((r * w + grey * (1 - w)) * k, (g * w + grey * (1 - w)) * k, (b * w + grey * (1 - w)) * k, THREE.SRGBColorSpace);
    this.mesh.setColorAt(i, this.col);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** burst of chips flying away from `origin` */
  burst(p: V3, pal: number, count: number, speed: number, origin?: V3): void {
    for (let k = 0; k < count; k++) {
      let dx = Math.random() - 0.5, dy = Math.random() - 0.2, dz = Math.random() - 0.5;
      if (origin) { dx += (p.x - origin.x) * 2; dy += (p.y - origin.y) * 2; dz += (p.z - origin.z) * 2; }
      const l = Math.hypot(dx, dy, dz) || 1;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(
        { x: p.x + (Math.random() - 0.5) * 0.1, y: p.y + (Math.random() - 0.5) * 0.1, z: p.z + (Math.random() - 0.5) * 0.1 },
        // small flecks (2.5-5 cm, smaller than a voxel), most short-lived, a few linger on the ground
        { x: (dx / l) * s, y: (dy / l) * s + 1, z: (dz / l) * s }, pal, 0.025 + Math.random() * 0.025, 0.6 + Math.random() ** 3 * 3,
      );
    }
  }

  update(dt: number, sim: Sim, frame: number): void {
    let alive = 0;
    const m = this.m;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const o = i * 3;
      if (this.life[i] <= 0) { m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); continue; }
      alive++;
      if (!this.rest[i]) {
        this.pv[o + 1] -= 9.81 * dt;
        const nx = this.px[o] + this.pv[o] * dt, ny = this.px[o + 1] + this.pv[o + 1] * dt, nz = this.px[o + 2] + this.pv[o + 2] * dt;
        // cheap collision: test a third of the particles per frame
        // (a chip that is still inside solid matter, e.g. spawned against the rim of the hole, flies on: it used to
        // come to rest at once and hang in the air around fresh holes)
        if ((i + frame) % 3 === 0 && this.pv[o + 1] < 0.5 && sim.sample({ x: nx, y: ny - 0.03, z: nz }) && !sim.sample({ x: this.px[o], y: this.px[o + 1], z: this.px[o + 2] })) {
          if (Math.abs(this.pv[o + 1]) < 1.2) { this.rest[i] = 1; }
          else { this.pv[o + 1] *= -0.3; this.pv[o] *= 0.5; this.pv[o + 2] *= 0.5; this.ang[i * 2 + 1] *= 0.5; }
        } else { this.px[o] = nx; this.px[o + 1] = ny; this.px[o + 2] = nz; }
      }
      const s = this.size[i] * Math.min(1, this.life[i] * 3);
      if (!this.rest[i]) this.ang[i * 2] += this.ang[i * 2 + 1] * dt;
      this.q.setFromAxisAngle(this.ax.set(this.rax[o], this.rax[o + 1], this.rax[o + 2]), this.ang[i * 2]);
      m.compose(this.pos.set(this.px[o], this.px[o + 1], this.px[o + 2]), this.q, this.sc.set(s, s, s));
      this.mesh.setMatrixAt(i, m);
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
