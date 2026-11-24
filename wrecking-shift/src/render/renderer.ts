import * as THREE from 'three';
import type { LevelInfo } from '../sim/levels/types';
import type { Sim, SimEvent } from '../sim/sim';
import type { V3 } from '../sim/vec';
import { BodyViews } from './bodyViews';
import { ChipParticles } from './particles';
import { makeWorldMaterial } from './worldMaterial';

export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
  readonly bodies: BodyViews;
  readonly chips = new ChipParticles();
  readonly sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7f6a, 1.1);
  readonly worldMaterial = makeWorldMaterial();
  private frame = 0;
  shake = 0;
  private sunDir = new THREE.Vector3(-0.45, -0.75, -0.5).normalize();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.three = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = THREE.PCFSoftShadowMap;
    this.three.toneMapping = THREE.ACESFilmicToneMapping;
    this.three.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color(0x9cc4e8);
    this.scene.fog = new THREE.Fog(0xa9cbe8, 40, 260);
    this.bodies = new BodyViews(this.worldMaterial);
    this.scene.add(this.bodies.root, this.chips.mesh, this.hemi, this.sun, this.sun.target);
    const s = this.sun.shadow;
    s.mapSize.set(2048, 2048);
    s.camera.near = 1; s.camera.far = 160;
    const e = 34;
    s.camera.left = -e; s.camera.right = e; s.camera.top = e; s.camera.bottom = -e;
    s.bias = -0.0004; s.normalBias = 0.03;
    this.resize();
  }

  setLevel(info: LevelInfo): void {
    this.sunDir.set(info.sunDir.x, info.sunDir.y, info.sunDir.z).normalize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.three.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCamera(eye: V3, yaw: number, pitch: number, roll = 0): void {
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.set(pitch, yaw, roll, 'YXZ');
    if (this.shake > 0.001) {
      const s = this.shake * 0.05;
      this.camera.rotation.x += (Math.random() - 0.5) * s;
      this.camera.rotation.y += (Math.random() - 0.5) * s;
      this.camera.rotation.z += (Math.random() - 0.5) * s;
    }
  }

  /** react to sim events with particles etc. */
  handleEvents(events: SimEvent[], viewer: V3): void {
    for (const e of events) {
      if (e.type === 'carve') {
        const per = Math.max(1, Math.min(4, Math.round(60 / Math.max(1, e.samples.length))));
        for (const s of e.samples) this.chips.burst(s.p, s.pal, per, e.cause === 'explosion' ? 9 : 3.2, e.pos);
      } else if (e.type === 'crumb') {
        this.chips.burst(e.pos, e.pal, Math.min(10, e.count + 2), 2);
      } else if (e.type === 'explosion') {
        const d = Math.hypot(e.pos.x - viewer.x, e.pos.y - viewer.y, e.pos.z - viewer.z);
        this.shake = Math.max(this.shake, Math.min(1.5, (e.size * 6) / (d + 2)));
      }
    }
  }

  render(sim: Sim, dt: number, fullSync = false): void {
    this.frame++;
    this.bodies.sync(sim, fullSync);
    this.chips.update(dt, sim, this.frame);
    this.shake *= Math.exp(-dt * 6);
    // shadow frustum follows the camera (snapped to texels to avoid shimmer)
    const c = this.camera.position;
    const snap = 68 / 2048;
    const tx = Math.round(c.x / snap) * snap, tz = Math.round(c.z / snap) * snap;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx - this.sunDir.x * 80, -this.sunDir.y * 80, tz - this.sunDir.z * 80);
    this.three.render(this.scene, this.camera);
  }
}
