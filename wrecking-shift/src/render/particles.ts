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
    this.col.setRGB(PAL_RGB[pal * 3], PAL_RGB[pal * 3 + 1], PAL_RGB[pal * 3 + 2], THREE.SRGBColorSpace);
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
        { x: (dx / l) * s, y: (dy / l) * s + 1, z: (dz / l) * s }, pal, 0.05 + Math.random() * 0.06, 1.5 + Math.random() * 2,
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
        if ((i + frame) % 3 === 0 && sim.sample({ x: nx, y: ny - 0.03, z: nz })) {
          if (Math.abs(this.pv[o + 1]) < 1.2) { this.rest[i] = 1; }
          else { this.pv[o + 1] *= -0.3; this.pv[o] *= 0.5; this.pv[o + 2] *= 0.5; }
        } else { this.px[o] = nx; this.px[o + 1] = ny; this.px[o + 2] = nz; }
      }
      const s = this.size[i] * Math.min(1, this.life[i] * 3);
      m.makeScale(s, s, s);
      m.setPosition(this.px[o], this.px[o + 1], this.px[o + 2]);
      this.mesh.setMatrixAt(i, m);
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
