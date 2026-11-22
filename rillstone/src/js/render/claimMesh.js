// Turns claim volumes into chunk meshes and colliders. Dirty chunks are
// meshed in a small worker pool; colliders are rebuilt at most 2 per frame
// (BUILD_BRIEF section 4), nearest first.
import * as THREE from 'three';
import { startWorker, rpc } from '../core/workers.js';
import { createClaimVolume, chunkSamples, claimDefs, CHUNK } from '../world/claims.js';

export async function createClaims(scene, materials, physics, opts = {}) {
  const pool = [];
  const n = Math.max(1, Math.min(opts.workers || 2, (navigator.hardwareConcurrency || 4) - 2));
  for (let i = 0; i < n; i++) pool.push(rpc(await startWorker('mesher')));
  let rr = 0;
  const volumes = new Map(claimDefs().map(d => [d.id, createClaimVolume(d)]));
  const meshes = new Map();        // chunk key -> Mesh
  const pendingCollider = new Map(); // chunk key -> { vertices, indices }
  const inFlight = new Map();      // chunk key -> seq
  const stats = { meshMs: [], colliderMs: [], remeshes: 0, colliders: 0 };
  const group = new THREE.Group(); scene.add(group);
  let seq = 0;

  function dispatch(vol, ck) {
    const key = vol.id + ':' + ck;
    if (inFlight.has(key)) return false;
    const [i, j, k] = ck.split(',').map(Number);
    const smp = chunkSamples(vol, i, j, k);
    const mySeq = ++seq;
    inFlight.set(key, mySeq);
    const w = pool[rr++ % pool.length];
    w.call({ ...smp, key, seq: mySeq }, [smp.dens.buffer, smp.band.buffer]).then((r) => {
      inFlight.delete(key);
      stats.remeshes++; stats.meshMs.push(r.ms); if (stats.meshMs.length > 200) stats.meshMs.shift();
      let m = meshes.get(key);
      if (!r.idx.length) { if (m) { group.remove(m); m.geometry.dispose(); meshes.delete(key); } }
      else {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(r.col, 3));
        g.setIndex(new THREE.BufferAttribute(r.idx, 1));
        g.computeVertexNormals(); g.computeBoundingSphere();
        if (m) { m.geometry.dispose(); m.geometry = g; }
        else { m = new THREE.Mesh(g, materials.claim); m.receiveShadow = m.castShadow = true; m.userData.claim = vol.id; group.add(m); meshes.set(key, m); }
      }
      pendingCollider.set(key, { vertices: r.pos, indices: r.idx, centre: chunkCentre(vol, i, j, k) });
    });
    return true;
  }
  const chunkCentre = (vol, i, j, k) => [vol.origin[0] + (i + 0.5) * CHUNK * 0.5, vol.origin[1] + (j + 0.5) * CHUNK * 0.5, vol.origin[2] + (k + 0.5) * CHUNK * 0.5];

  const api = {
    volumes, meshes, stats, group,
    // Called every frame: send dirty chunks to the mesher (up to maxJobs) and
    // rebuild up to 2 colliders, nearest to `near` first.
    update(near, maxColliders = 2, maxJobs = 4) {
      let jobs = 0;
      for (const vol of volumes.values()) {
        for (const ck of [...vol.dirty]) {
          if (jobs >= maxJobs) break;
          if (dispatch(vol, ck)) { vol.dirty.delete(ck); jobs++; }
        }
      }
      if (!pendingCollider.size) return;
      const list = [...pendingCollider.entries()];
      if (near) list.sort((a, b) => dist2(a[1].centre, near) - dist2(b[1].centre, near));
      for (const [key, c] of list.slice(0, maxColliders)) {
        pendingCollider.delete(key);
        const t0 = performance.now();
        physics.call({ op: 'setStatic', key: 'claim:' + key, vertices: c.vertices.slice(), indices: c.indices.slice() }).then((r) => {
          stats.colliders++; stats.colliderMs.push(r.ms ?? performance.now() - t0); if (stats.colliderMs.length > 200) stats.colliderMs.shift();
        });
      }
    },
    get busy() { let d = 0; for (const v of volumes.values()) d += v.dirty.size; return d + inFlight.size + pendingCollider.size; },
    // Wait until every chunk is meshed and collided (loading, tests).
    async settle() { while (api.busy) { api.update(null, 64, 16); await new Promise(r => setTimeout(r, 16)); } await physics.call({ op: 'batch', ops: [] }); },
    volumeAt(x, z, y) { for (const v of volumes.values()) if (v.contains(x, z, y)) return v; return null; },
  };
  return api;
}
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
