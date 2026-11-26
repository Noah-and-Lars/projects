import * as THREE from 'three';
import { CHUNK, type VoxelBody } from '../sim/body';
import { chunkDims, meshChunk, type MeshOptions } from '../sim/mesher';
import type { Sim } from '../sim/sim';
import type { VoxelMaterials } from './worldMaterial';

interface ChunkView { opaque: THREE.Mesh | null; glass: THREE.Mesh | null; quads: number }
interface View {
  body: VoxelBody;
  group: THREE.Group;
  chunks: Map<number, ChunkView>;
  /** lit from the occupancy volume (static + stamped) -> no baked AO, no shadow-map casting */
  inVolume: boolean;
  dist: number;
}

// quad overlap ("crack hiding") is off by default; Diagnostics can switch it on (lookModule)
const VOL_OPTS: MeshOptions = { bakeAO: false, inflate: 0 };
const BAKED_OPTS: MeshOptions = { bakeAO: true, inflate: 0 };
/** quad overlap (voxels) that hides T-junction cracks of the greedy meshes */
export function setMeshInflate(v: number): void { VOL_OPTS.inflate = v; BAKED_OPTS.inflate = v; }
const S = CHUNK * 0.1;

/** Keeps three.js meshes in sync with the sim's voxel bodies (incremental remeshing). */
export class BodyViews {
  readonly root = new THREE.Group();
  private views = new Map<number, View>();
  /** remesh time budget per frame (ms) */
  budgetMs = 8;
  /** dynamic bodies (props, debris, vehicles) farther than this from the camera are not drawn (performance mode) */
  maxDynamicDist = Infinity;
  stats = { remeshed: 0, meshes: 0, quads: 0 };
  /** is this body lit from the occupancy volume? (set by the renderer; default: nothing is) */
  classify: (body: VoxelBody) => boolean = () => false;
  /** do volume-lit static chunks also render into the shadow map? (true in the low tier) */
  staticCastShadow = true;
  private order: View[] = [];
  private keys: number[] = [];

  constructor(private materials: VoxelMaterials) {}

  /** swap materials / lighting mode (quality change); everything is remeshed lazily when the AO mode changes */
  setLook(materials: VoxelMaterials, staticCastShadow: boolean): void {
    this.materials = materials;
    this.staticCastShadow = staticCastShadow;
    for (const v of this.views.values()) {
      const inVol = this.classify(v.body);
      if (inVol !== v.inVolume) { v.inVolume = inVol; v.body.allDirty = true; }
      for (const c of v.chunks.values()) {
        if (c.opaque) { c.opaque.material = inVol ? materials.static : materials.dynamic; c.opaque.castShadow = !inVol || staticCastShadow; }
        if (c.glass) c.glass.material = materials.glass;
      }
    }
  }

  private ensure(body: VoxelBody): View {
    let v = this.views.get(body.id);
    if (!v) {
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      this.root.add(group);
      v = { body, group, chunks: new Map(), inVolume: this.classify(body), dist: 0 };
      this.views.set(body.id, v);
      this.place(v);
    }
    return v;
  }

  private place(v: View): void {
    const t = v.body.rb.translation(), r = v.body.rb.rotation();
    v.group.position.set(t.x, t.y, t.z);
    v.group.quaternion.set(r.x, r.y, r.z, r.w);
    v.group.updateMatrix();
    v.group.matrixWorldNeedsUpdate = true;
  }

  private drop(v: View, c: ChunkView): void {
    if (c.opaque) { v.group.remove(c.opaque); c.opaque.geometry.dispose(); c.opaque = null; }
    if (c.glass) { v.group.remove(c.glass); c.glass.geometry.dispose(); c.glass = null; }
  }

  private remesh(v: View, key: number): void {
    const cx = key & 15, cy = (key >> 4) & 15, cz = key >> 8;
    const m = meshChunk(v.body.grid, cx, cy, cz, v.inVolume ? VOL_OPTS : BAKED_OPTS);
    let c = v.chunks.get(key);
    if (!m) {
      if (c) { this.stats.quads -= c.quads; this.drop(v, c); v.chunks.delete(key); }
      return;
    }
    if (!c) { c = { opaque: null, glass: null, quads: 0 }; v.chunks.set(key, c); }
    this.stats.quads += m.quads - (c.quads);
    c.quads = m.quads;
    const pos = new THREE.BufferAttribute(m.positions, 3);
    const nor = new THREE.BufferAttribute(m.normals, 3, true);
    const col = new THREE.BufferAttribute(m.colors, 4, true);
    const aux = new THREE.BufferAttribute(m.aux, 3, true);
    const box = new THREE.Box3(new THREE.Vector3(cx * S, cy * S, cz * S), new THREE.Vector3((cx + 1) * S, (cy + 1) * S, (cz + 1) * S));
    const sphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * S, (cy + 0.5) * S, (cz + 0.5) * S), S * 0.87);
    const build = (indices: Uint32Array): THREE.BufferGeometry => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', pos); geo.setAttribute('normal', nor); geo.setAttribute('color', col); geo.setAttribute('aux', aux);
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.boundingBox = box; geo.boundingSphere = sphere;
      return geo;
    };
    // the two geometries share vertex buffers, so always dispose both before rebuilding
    const oldO = c.opaque?.geometry, oldG = c.glass?.geometry;
    oldO?.dispose(); oldG?.dispose();
    if (m.indices.length) {
      const geo = build(m.indices);
      if (c.opaque) c.opaque.geometry = geo;
      else {
        const mesh = new THREE.Mesh(geo, v.inVolume ? this.materials.static : this.materials.dynamic);
        mesh.castShadow = !v.inVolume || this.staticCastShadow; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        v.group.add(mesh);
        c.opaque = mesh;
      }
    } else if (c.opaque) { v.group.remove(c.opaque); c.opaque = null; }
    if (m.glassIndices.length) {
      const geo = build(m.glassIndices);
      if (c.glass) c.glass.geometry = geo;
      else {
        const mesh = new THREE.Mesh(geo, this.materials.glass);
        mesh.castShadow = false; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        v.group.add(mesh);
        c.glass = mesh;
      }
    } else if (c.glass) { v.group.remove(c.glass); c.glass = null; }
    this.stats.remeshed++;
  }

  /** chunks still waiting to be (re)meshed — e.g. for a loading indicator while `sync` runs budgeted */
  pendingChunks(sim: Sim): number {
    let n = 0;
    for (const body of sim.bodies.values()) {
      if (body.allDirty) { const [nx, ny, nz] = chunkDims(body.grid); n += nx * ny * nz; } else n += body.dirty.size;
    }
    return n;
  }

  /**
   * Call once per rendered frame. `full` = ignore the time budget (loading / tests).
   * Budgeted mode meshes dynamic bodies first, then static bodies / chunks nearest to `focus` first.
   */
  sync(sim: Sim, full = false, focus?: THREE.Vector3): void {
    const t0 = performance.now();
    // removed bodies
    for (const [id, v] of this.views) {
      if (v.body.removed || sim.bodies.get(id) !== v.body) {
        for (const c of v.chunks.values()) { this.stats.quads -= c.quads; this.drop(v, c); }
        this.root.remove(v.group);
        this.views.delete(id);
      }
    }
    const order = this.order;
    order.length = 0;
    for (const body of sim.bodies.values()) {
      const v = this.ensure(body);
      if (body.dynamic) {
        this.place(v);
        if (this.maxDynamicDist < Infinity && focus) {
          const p = v.group.position;
          v.group.visible = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 < this.maxDynamicDist ** 2;
        } else if (!v.group.visible) v.group.visible = true;
      }
      if (body.allDirty) {
        body.allDirty = false;
        const [nx, ny, nz] = chunkDims(body.grid);
        for (let cz = 0; cz < nz; cz++) for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) body.dirty.add(cx | (cy << 4) | (cz << 8));
      }
      if (body.dirty.size === 0) continue;
      // dynamic bodies first (they are the ones visibly wrong when stale), then nearest static
      if (body.dynamic) v.dist = -1;
      else if (focus && !full) {
        const p = v.group.position, g = body.grid;
        const dx = Math.max(p.x - focus.x, 0, focus.x - (p.x + g.sx * 0.1));
        const dy = Math.max(p.y - focus.y, 0, focus.y - (p.y + g.sy * 0.1));
        const dz = Math.max(p.z - focus.z, 0, focus.z - (p.z + g.sz * 0.1));
        v.dist = dx * dx + dy * dy + dz * dz;
      } else v.dist = 0;
      order.push(v);
    }
    if (order.length === 0) return;
    if (!full) order.sort((a, b) => a.dist - b.dist);
    for (const v of order) {
      const body = v.body;
      let keys: Iterable<number> = body.dirty;
      if (!full && focus && !body.dynamic && body.dirty.size > 4) {
        // nearest chunks of this body first
        const p = v.group.position;
        const fx = (focus.x - p.x) / S - 0.5, fy = (focus.y - p.y) / S - 0.5, fz = (focus.z - p.z) / S - 0.5;
        const ks = this.keys; ks.length = 0;
        for (const k of body.dirty) ks.push(k);
        const d = (k: number) => { const x = (k & 15) - fx, y = ((k >> 4) & 15) - fy, z = (k >> 8) - fz; return x * x + y * y + z * z; };
        ks.sort((a, b) => d(a) - d(b));
        keys = ks;
      }
      for (const key of keys) {
        this.remesh(v, key);
        body.dirty.delete(key);
        if (!full && performance.now() - t0 > this.budgetMs) return;
      }
    }
  }

  clear(): void {
    for (const v of this.views.values()) {
      for (const c of v.chunks.values()) this.drop(v, c);
      this.root.remove(v.group);
    }
    this.views.clear();
    this.stats.quads = 0;
  }

  meshFor(bodyId: number): THREE.Group | undefined {
    return this.views.get(bodyId)?.group;
  }
}
