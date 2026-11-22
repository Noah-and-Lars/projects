// Small particle bursts: dirt puffs when digging, sparks on a "clink",
// splashes when washing. One pooled InstancedMesh, no allocation per burst.
import * as THREE from 'three';

export function createFX(scene) {
  const N = 400;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0.05, g: 9 }));
  let next = 0;
  const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), sv = new THREE.Vector3();
  const api = {
    burst(pos, color, n = 12, { speed = 2, size = 0.05, life = 0.6, gravity = 9, up = 1.5 } = {}) {
      c.set(color);
      for (let i = 0; i < n; i++) {
        const p = P[next]; mesh.setColorAt(next, c); next = (next + 1) % N;
        p.life = p.max = life * (0.6 + Math.random() * 0.6);
        p.p.set(pos[0], pos[1], pos[2]);
        p.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.6 + up, (Math.random() - 0.5) * speed);
        p.s = size * (0.6 + Math.random() * 0.8); p.g = gravity;
      }
      mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life <= 0) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); continue; }
        p.life -= dt; p.v.y -= p.g * dt; p.p.addScaledVector(p.v, dt);
        const s = p.s * Math.max(0, p.life / p.max);
        mesh.setMatrixAt(i, m.compose(p.p, q, sv.set(s, s, s)));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}
