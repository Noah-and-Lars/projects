/**
 * 3D map preview for the Sandbox list: select a map and a slowly orbiting voxel model of it appears before you
 * load it.
 *
 * The map's own builder runs against a capture stand-in for the Sim (no physics, no colliders): every grid it
 * adds is recorded with its transform. The grids are downsampled (0.2-0.8 m cells depending on the map size),
 * meshed with the game's greedy mesher and merged into one geometry, then drawn by a small separate WebGL renderer
 * into a canvas in the menu. Results are cached per map id.
 */
import * as THREE from 'three';
import type { LevelDef, LevelInfo } from '../sim/levels/types';
import { VOXEL } from '../sim/materials';
import { chunkDims, meshChunk } from '../sim/mesher';
import { Rng } from '../sim/rng';
import { QID, qrot, qyaw, type Quat, type V3 } from '../sim/vec';
import { VoxelGrid } from '../sim/voxels';

interface Piece { grid: VoxelGrid; pos: V3; rot: Quat; body: { removed: boolean } }
export interface PreviewData { info: LevelInfo; geometry: THREE.BufferGeometry; size: number; center: V3; cell: number; voxels: number; ms: number }

/** an object that absorbs any property access / call / arithmetic (stand-in for physics handles) */
function absorb(): any {
  const f: any = function () { return p; };
  const p: any = new Proxy(f, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : p),
    set: () => true,
    apply: () => p,
    construct: () => p,
  });
  return p;
}

/** run a level builder against a capture Sim; returns the placed grids and the level info */
export function captureLevel(def: LevelDef): { pieces: Piece[]; info: LevelInfo } {
  const pieces: Piece[] = [];
  let nextId = 1;
  const bodies = new Map<number, any>();
  const makeBody = (grid: VoxelGrid, pos: V3, rot: Quat, dynamic: boolean, kind: string, name: string) => {
    const base: any = { id: nextId++, grid, tags: new Set<string>(), user: {}, dynamic, kind, name, removed: false, keepIndex: -1 };
    const body = new Proxy(base, { get: (t, k) => (k in t ? t[k] : absorb()), set: (t, k, v) => { t[k] = v; return true; } });
    bodies.set(base.id, body);
    pieces.push({ grid, pos: { ...pos }, rot: { ...rot }, body: base });
    return body;
  };
  const vehicles: any = {
    list: [], waterLevel: null,
    spawn(_sim: unknown, bp: { grid: VoxelGrid; spec: { wheels: { radius: number; y: number }[]; restLength: number } }, x: number, y: number, z: number, yaw: number) {
      // same placement as VehicleSystem.spawn
      const g = bp.grid, rot = qyaw(yaw + Math.PI);
      const w0 = bp.spec.wheels[0];
      const clear = w0 ? w0.radius - (w0.y - bp.spec.restLength) : 0.3;
      const half = qrot(rot, { x: (g.sx * VOXEL) / 2, y: 0, z: (g.sz * VOXEL) / 2 });
      makeBody(g, { x: x - half.x, y: y + Math.max(0.05, clear) + 0.02, z: z - half.z }, rot, true, 'vehicle', 'vehicle');
      return absorb();
    },
  };
  const real: any = {
    rng: new Rng(1234), bodies, onRemoved: [], onExplosion: [], out: [], systems: [], ext: {}, waterLevel: null,
    previewVehicles: vehicles, tick: 0, time: 0,
    addBody(grid: VoxelGrid, pos: V3, opts: { dynamic?: boolean; kind?: string; name?: string; rot?: Quat } = {}) {
      return makeBody(grid, pos, opts.rot ?? QID, !!opts.dynamic, opts.kind ?? (opts.dynamic ? 'prop' : 'world'), opts.name ?? '');
    },
    removeBody(b: any) { b.removed = true; },
    raycast: () => null, sample: () => 0, bodiesNear: () => [], explode() {}, explodeLater() {}, carve: () => ({ removed: 0, byMat: [] }),
  };
  const sim = new Proxy(real, { get: (t, k) => (k in t ? t[k] : absorb()), set: (t, k, v) => { t[k] = v; return true; } });
  const info = def.build(sim);
  return { pieces: pieces.filter((p) => !p.body.removed), info };
}

/** downsample a grid by `f` (a cell is solid if any voxel in it is; colour = its topmost voxel) */
function downsample(g: VoxelGrid, f: number): VoxelGrid {
  if (f === 1) return g;
  const nx = Math.ceil(g.sx / f), ny = Math.ceil(g.sy / f), nz = Math.ceil(g.sz / f);
  const out = new VoxelGrid(nx, ny, nz);
  const d = g.data, sx = g.sx, sxy = g.sx * g.sy;
  for (let z = 0; z < g.sz; z++) for (let y = g.sy - 1; y >= 0; y--) {
    const row = sx * y + sxy * z;
    for (let x = 0; x < sx; x++) {
      const v = d[row + x];
      if (!v) continue;
      const i = ((x / f) | 0) + nx * (((y / f) | 0) + ny * ((z / f) | 0));
      if (!out.data[i]) out.data[i] = v;
    }
  }
  out.recount();
  return out;
}

/** build the merged preview geometry of a map */
export function buildPreview(def: LevelDef): PreviewData {
  const t0 = performance.now();
  const { pieces, info } = captureLevel(def);
  const b = info.bounds;
  const size = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  // cell size: keep the triangle count modest on big maps
  const f = size > 180 ? 8 : size > 110 ? 6 : size > 70 ? 4 : 3;
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  let voxels = 0;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const p of pieces) {
    const g = downsample(p.grid, f);
    voxels += g.count;
    q.set(p.rot.x, p.rot.y, p.rot.z, p.rot.w);
    const [cx, cy, cz] = chunkDims(g);
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      if (i >= 16 || j >= 16 || k >= 16) continue;
      const m = meshChunk(g, i, j, k, { bakeAO: true });
      if (!m) continue;
      const base = pos.length / 3;
      const nv = m.positions.length / 3;
      for (let a = 0; a < nv; a++) {
        v.set(m.positions[a * 3] * f, m.positions[a * 3 + 1] * f, m.positions[a * 3 + 2] * f).applyQuaternion(q);
        pos.push(v.x + p.pos.x, v.y + p.pos.y, v.z + p.pos.z);
        n.set(m.normals[a * 3], m.normals[a * 3 + 1], m.normals[a * 3 + 2]).normalize().applyQuaternion(q);
        nor.push(n.x, n.y, n.z);
        // albedo (0..255, display space) x baked AO -> linear
        const ao = 0.45 + 0.55 * (m.colors[a * 4 + 3] / 255);
        for (let c = 0; c < 3; c++) col.push(Math.pow(m.colors[a * 4 + c] / 255, 2.2) * ao);
      }
      const all = m.glassIndices.length ? [...m.indices, ...m.glassIndices] : m.indices;
      for (let a = 0; a < all.length; a++) idx.push(all[a] + base);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const center = { x: (b.min.x + b.max.x) / 2, y: 0, z: (b.min.z + b.max.z) / 2 };
  return { info, geometry: geo, size, center, cell: f * VOXEL, voxels, ms: performance.now() - t0 };
}

const SKY: Record<string, [number, number]> = { day: [0x8fbbe6, 0xdfeaf2], sunset: [0x5d6f9a, 0xf2b98a], overcast: [0x9aa3ab, 0xc9ced2], night: [0x0c1424, 0x27344d] };

/** small orbiting renderer for previews (one WebGL context, reused) */
export class MapPreview {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 16 / 10, 0.5, 2000);
  private mesh: THREE.Mesh | null = null;
  private water: THREE.Mesh | null = null;
  private cache = new Map<string, PreviewData>();
  private current: PreviewData | null = null;
  private currentId = '';
  private raf = 0;
  private angle = 0.8;
  private last = 0;
  /** level id being shown (or built) */
  get id(): string { return this.currentId; }
  get data(): PreviewData | null { return this.current; }
  onStatus: (text: string) => void = () => {};

  constructor() {
    this.canvas.className = 'ws-preview-canvas';
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x6b5a45, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
    sun.position.set(-0.6, 1, -0.5);
    this.scene.add(sun);
  }

  private ensureRenderer(): boolean {
    if (this.renderer) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      return true;
    } catch (e) { console.warn('[preview] no WebGL', e); return false; }
  }

  /** show a map (builds it on first use; the build is deferred a moment so the menu can paint "Building…") */
  show(def: LevelDef, done?: () => void): void {
    this.currentId = def.id;
    const cached = this.cache.get(def.id);
    if (cached) { this.use(cached); done?.(); return; }
    this.onStatus('Building preview…');
    setTimeout(() => {
      if (this.currentId !== def.id) return;
      try {
        const d = buildPreview(def);
        this.cache.set(def.id, d);
        if (this.currentId === def.id) this.use(d);
      } catch (e) { console.warn('[preview] build failed', def.id, e); this.onStatus('No preview available'); }
      done?.();
    }, 30);
  }

  private use(d: PreviewData): void {
    this.current = d;
    if (!this.ensureRenderer()) { this.onStatus('No preview (WebGL unavailable)'); return; }
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = new THREE.Mesh(d.geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.mesh);
    if (this.water) { this.scene.remove(this.water); this.water = null; }
    if (d.info.waterLevel != null) {
      this.water = new THREE.Mesh(new THREE.PlaneGeometry(d.size * 1.6, d.size * 1.6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1f6b80, transparent: true, opacity: 0.8 }));
      this.water.position.set(d.center.x, d.info.waterLevel - 0.04, d.center.z);
      this.scene.add(this.water);
    }
    const [top, bottom] = SKY[d.info.sky ?? 'day'] ?? SKY.day;
    this.scene.background = new THREE.Color(bottom).lerp(new THREE.Color(top), 0.35);
    this.scene.fog = new THREE.Fog(bottom, d.size * 1.2, d.size * 3);
    this.onStatus('');
    this.renderNow();
  }

  /** draw one frame (also used by tests) */
  renderNow(): void {
    const r = this.renderer, d = this.current;
    if (!r || !d) return;
    const w = this.canvas.clientWidth || 320, h = this.canvas.clientHeight || 200;
    const s = r.getSize(new THREE.Vector2());
    if (s.x !== w || s.y !== h) { r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    const dist = d.size * 0.95;
    this.camera.position.set(d.center.x + Math.cos(this.angle) * dist, d.size * 0.55, d.center.z + Math.sin(this.angle) * dist);
    this.camera.lookAt(d.center.x, 0, d.center.z);
    r.render(this.scene, this.camera);
  }

  /** orbit while visible */
  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.canvas.isConnected) { this.raf = 0; return; }
      this.angle += Math.min(0.05, (t - this.last) / 1000) * 0.25;
      this.last = t;
      this.renderNow();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
}

let shared: MapPreview | null = null;
/** the one preview renderer of the page (created on first use) */
export function mapPreview(): MapPreview { return (shared ??= new MapPreview()); }
