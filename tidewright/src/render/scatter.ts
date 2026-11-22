// Deterministic instanced scenery (pines, scrub and rocks) so motion and slope read clearly.
import * as THREE from 'three';
import { heightAt, type Terrain } from '../sim-core/terrain';
import { rng } from '../sim-core/math';
import { toonRamp } from './materials';

export function buildScatter(t: Terrain, count = 2600): THREE.Group {
  const r = rng(t.seed * 977 + 13);
  const group = new THREE.Group();
  const pine = new THREE.ConeGeometry(1.6, 5.5, 6);
  pine.translate(0, 4.2, 0);
  const trunk = new THREE.CylinderGeometry(0.25, 0.3, 1.6, 5);
  trunk.translate(0, 0.8, 0);
  const rock = new THREE.DodecahedronGeometry(1.2, 0);
  const mk = (geo: THREE.BufferGeometry, color: string, n: number) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() }), n);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const pines = mk(pine, '#3f6e45', count), trunks = mk(trunk, '#6b4a2e', count), rocks = mk(rock, '#9a9488', Math.floor(count / 3));
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let np = 0, nr = 0;
  for (let i = 0; i < count * 4 && (np < count || nr < rocks.count); i++) {
    const x = (r() - 0.5) * t.size * 0.9, z = (r() - 0.5) * t.size * 0.9;
    const h = heightAt(t, x, z);
    if (h < 3 || Math.hypot(x - t.pad.x, z - t.pad.z) < t.pad.r * 2.4) continue;
    const slope = Math.abs(heightAt(t, x + 2, z) - heightAt(t, x - 2, z)) + Math.abs(heightAt(t, x, z + 2) - heightAt(t, x, z - 2));
    const k = r();
    if (slope < 2.2 && h < 65 && np < count && k < 0.75) {
      const sc = 0.6 + r() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      M.compose(p.set(x, h - 0.2, z), q, s.set(sc, sc * (0.8 + r() * 0.5), sc));
      pines.setMatrixAt(np, M); trunks.setMatrixAt(np, M); np++;
    } else if (nr < rocks.count) {
      const sc = 0.4 + r() * 1.4;
      q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
      M.compose(p.set(x, h - sc * 0.4, z), q, s.set(sc, sc * 0.7, sc));
      rocks.setMatrixAt(nr++, M);
    }
  }
  pines.count = trunks.count = np;
  rocks.count = nr;
  group.add(pines, trunks, rocks);
  return group;
}
