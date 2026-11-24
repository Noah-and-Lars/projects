import * as THREE from 'three';
import { CHUNK, type VoxelBody } from '../sim/body';
import { chunkDims, meshChunk } from '../sim/mesher';
import type { Sim } from '../sim/sim';

interface View {
  body: VoxelBody;
  group: THREE.Group;
  chunks: Map<number, THREE.Mesh>;
}

/** Keeps three.js meshes in sync with the sim's voxel bodies (incremental remeshing). */
export class BodyViews {
  readonly root = new THREE.Group();
  private views = new Map<number, View>();
  /** remesh time budget per frame (ms) */
  budgetMs = 8;
  stats = { remeshed: 0, meshes: 0, quads: 0 };

  constructor(private material: THREE.Material) {}

  private ensure(body: VoxelBody): View {
    let v = this.views.get(body.id);
    if (!v) {
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      this.root.add(group);
      v = { body, group, chunks: new Map() };
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

  private remesh(v: View, key: number): void {
    const cx = key & 15, cy = (key >> 4) & 15, cz = key >> 8;
    const m = meshChunk(v.body.grid, cx, cy, cz);
    let mesh = v.chunks.get(key);
    if (!m) {
      if (mesh) { v.group.remove(mesh); mesh.geometry.dispose(); v.chunks.delete(key); }
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3, true));
    geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 4, true));
    geo.setAttribute('aux', new THREE.BufferAttribute(m.aux, 2, true));
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
    const s = CHUNK * 0.1;
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(cx * s, cy * s, cz * s), new THREE.Vector3((cx + 1) * s, (cy + 1) * s, (cz + 1) * s));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * s, (cy + 0.5) * s, (cz + 0.5) * s), s * 0.87);
    if (mesh) { mesh.geometry.dispose(); mesh.geometry = geo; }
    else {
      mesh = new THREE.Mesh(geo, this.material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      v.group.add(mesh);
      v.chunks.set(key, mesh);
    }
    this.stats.remeshed++;
  }

  /** call once per rendered frame. `full` = ignore the time budget (loading / tests) */
  sync(sim: Sim, full = false): void {
    const t0 = performance.now();
    // removed bodies
    for (const [id, v] of this.views) {
      if (v.body.removed || !sim.bodies.has(id)) {
        for (const m of v.chunks.values()) m.geometry.dispose();
        this.root.remove(v.group);
        this.views.delete(id);
      }
    }
    let over = false;
    // dynamic bodies first (they are the ones visibly wrong when stale), then static
    for (let pass = 0; pass < 2; pass++) {
      for (const body of sim.bodies.values()) {
        if ((pass === 0) !== body.dynamic) continue;
        const v = this.ensure(body);
        if (body.dynamic) this.place(v);
        if (body.allDirty) {
          body.allDirty = false;
          const [nx, ny, nz] = chunkDims(body.grid);
          for (let cz = 0; cz < nz; cz++) for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) body.dirty.add(cx | (cy << 4) | (cz << 8));
        }
        if (body.dirty.size === 0) continue;
        if (over && !full) continue;
        for (const key of body.dirty) {
          this.remesh(v, key);
          body.dirty.delete(key);
          if (!full && performance.now() - t0 > this.budgetMs) { over = true; break; }
        }
      }
    }
  }

  meshFor(bodyId: number): THREE.Group | undefined {
    return this.views.get(bodyId)?.group;
  }
}
