// The old adit: a timbered tunnel into the terrace cliff east of Millbrook.
// Rough rock walls darken with depth (baked occlusion), timber sets every
// 3 m. The hemisphere light keeps it above the minimum ambient level; the
// player's lantern does the rest.
import * as THREE from 'three';
import { ADIT, CLAIMS, height } from '../world/valley.js';
import { textPlane } from './buildings.js';
import { paint, merge, place } from './geom.js';
import { noise2 } from '../core/noise.js';

export function buildAdit(scene, materials) {
  const a = ADIT, hw = a.w / 2;
  const pos = [], col = [], ci = [], cv = [];
  const rock = new THREE.Color(0x6e6a64), deep = new THREE.Color(0x3a3836), tmp = new THREE.Color();
  const x0 = a.x - 2.6, x1 = a.x + a.len, STEP = 1.5;
  // Cross-section ring (counter-clockwise looking down +x, faces inward).
  const ring = (x) => {
    const j = (u, v) => (noise2(x * 0.7 + u, v, 3) - 0.5) * 0.35;
    return [
      [-hw + j(1, 1), 0], [-hw * 0.4, 0], [hw * 0.4, 0], [hw + j(2, 1), 0],
      [hw + j(3, 2), a.h * 0.55], [hw * 0.75 + j(4, 2), a.h * 0.92], [hw * 0.2, a.h + j(5, 3) * 0.6], [-hw * 0.3, a.h + j(6, 3) * 0.6], [-hw * 0.8 + j(7, 2), a.h * 0.9], [-hw + j(8, 2), a.h * 0.5],
    ].map(([z, y]) => [z, y]);
  };
  let prev = null, prevX = 0;
  for (let x = x0; x <= x1 + 0.01; x += STEP) {
    const r = ring(x);
    if (prev) {
      for (let k = 0; k < r.length; k++) {
        const k2 = (k + 1) % r.length;
        // Floor stays flat (k 0..3 are floor points).
        const A = [prevX, a.y + prev[k][1], a.z + prev[k][0]], B = [x, a.y + r[k][1], a.z + r[k][0]];
        const Cc = [x, a.y + r[k2][1], a.z + r[k2][0]], D = [prevX, a.y + prev[k2][1], a.z + prev[k2][0]];
        const depth = Math.min(1, Math.max(0, (x - a.x) / 26));
        const isFloor = k < 3;
        tmp.copy(isFloor ? new THREE.Color(0x7a6a58) : rock).lerp(deep, depth * 0.55);
        for (const tri of [[A, B, Cc], [A, Cc, D]]) for (const p of tri) { pos.push(...p); const jj = 0.9 + noise2(p[0] * 1.3, p[1] + p[2], 9) * 0.2; col.push(tmp.r * jj, tmp.g * jj, tmp.b * jj); }
        const base = cv.length / 3;
        cv.push(...A, ...B, ...Cc, ...D);
        ci.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    prev = r; prevX = x;
  }
  // No end wall: the tunnel runs on into the Ember Seam claim volume, behind
  // a timber door that opens for the deed holder.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const tunnel = new THREE.Mesh(g, materials.vcolor);
  tunnel.material = materials.vcolor; tunnel.receiveShadow = true;
  // Rendered from inside, so faces must point inward: flip if needed via DoubleSide on a clone.
  tunnel.material = materials.vcolor.clone(); tunnel.material.side = THREE.DoubleSide;
  materials.litMaterial(tunnel.material);
  scene.add(tunnel);
  // Timber sets, portal surround (rock pillars and lintel) and apron slab.
  const wood = [];
  for (let x = a.x + 0.5; x < x1 - 1; x += 3) {
    wood.push(paint(place(new THREE.BoxGeometry(0.22, a.h - 0.2, 0.22), x, a.y + (a.h - 0.2) / 2, a.z - hw + 0.35), 0x8a6440, 0.12, x | 0));
    wood.push(paint(place(new THREE.BoxGeometry(0.22, a.h - 0.2, 0.22), x, a.y + (a.h - 0.2) / 2, a.z + hw - 0.35), 0x8a6440, 0.12, (x | 0) + 1));
    wood.push(paint(place(new THREE.BoxGeometry(0.26, 0.24, a.w - 0.3), x, a.y + a.h - 0.32, a.z), 0x7a5636, 0.12, (x | 0) + 2));
  }
  const timbers = new THREE.Mesh(merge(wood), materials.vcolor);
  timbers.castShadow = timbers.receiveShadow = true;
  scene.add(timbers);
  // The surround fills the gap where the cliff-face cells were cut out
  // (world/valley.js isHole), from the tunnel mouth up to the cliff top.
  let top = a.y + a.h + 2;
  for (let x = a.x - 2; x <= a.x + 2; x += 1) for (let z = a.z - 5; z <= a.z + 5; z += 1) top = Math.max(top, height(x, z));
  const lh = (top + 0.4 - (a.y + a.h)) / 2, ph2 = a.h / 2 + 0.5, pw = (4.4 - hw) / 2;
  const boxes = [
    // [cx, cy, cz, hx, hy, hz, colour]
    [a.x - 0.4, a.y + a.h + lh, a.z, 2.0, lh, 4.4, 0xc4a676],                   // lintel rock
    [a.x - 0.4, a.y - 0.5 + ph2, a.z - hw - pw, 2.0, ph2, pw, 0xbfa070],        // pillars
    [a.x - 0.4, a.y - 0.5 + ph2, a.z + hw + pw, 2.0, ph2, pw, 0xbfa070],
    [a.x - 2.9, a.y - 0.45, a.z, 0.6, 0.5, hw + 0.6, 0x8a7a64],                 // door step
  ];
  const surround = merge(boxes.map(([x, y, z, hx, hy, hz, c], i) => paint(place(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2, 2, 2, 2), x, y, z), c, 0.2, i + 7)));
  const sm = new THREE.Mesh(surround, materials.vcolor); sm.castShadow = sm.receiveShadow = true; scene.add(sm);
  // Portal frame: two posts and a cap beam, with a hanging sign board.
  const frame = merge([
    paint(place(new THREE.BoxGeometry(0.34, a.h + 0.2, 0.34), a.x - 2.5, a.y + a.h / 2, a.z - hw + 0.1), 0x6e4c2e, 0.1, 1),
    paint(place(new THREE.BoxGeometry(0.34, a.h + 0.2, 0.34), a.x - 2.5, a.y + a.h / 2, a.z + hw - 0.1), 0x6e4c2e, 0.1, 2),
    paint(place(new THREE.BoxGeometry(0.4, 0.4, a.w + 0.9), a.x - 2.5, a.y + a.h + 0.05, a.z), 0x6e4c2e, 0.1, 3),
  ]);
  const fm = new THREE.Mesh(frame, materials.vcolor); fm.castShadow = true; scene.add(fm);
  // The Ember Seam door: two plank leaves in a heavy frame, 3 m from the end.
  const dx = x1 - 3, leaves = [];
  const frameD = new THREE.Mesh(merge([
    paint(place(new THREE.BoxGeometry(0.3, a.h, 0.3), dx, a.y + a.h / 2, a.z - hw + 0.15), 0x5a3e24, 0.1, 1),
    paint(place(new THREE.BoxGeometry(0.3, a.h, 0.3), dx, a.y + a.h / 2, a.z + hw - 0.15), 0x5a3e24, 0.1, 2),
    paint(place(new THREE.BoxGeometry(0.34, 0.34, a.w), dx, a.y + a.h - 0.17, a.z), 0x5a3e24, 0.1, 3),
    // Rock packing between the frame and the rough tunnel wall.
    paint(place(new THREE.BoxGeometry(0.5, a.h + 0.6, 0.8), dx, a.y + a.h / 2, a.z - hw - 0.25), 0x6e6a64, 0.2, 4),
    paint(place(new THREE.BoxGeometry(0.5, a.h + 0.6, 0.8), dx, a.y + a.h / 2, a.z + hw + 0.25), 0x6e6a64, 0.2, 5),
    paint(place(new THREE.BoxGeometry(0.5, 0.9, a.w + 1.2), dx, a.y + a.h + 0.2, a.z), 0x6e6a64, 0.2, 6),
  ]), materials.vcolor);
  frameD.castShadow = true; scene.add(frameD);
  const leafW = (a.w - 0.6) / 2, leafH = a.h - 0.4;
  for (const s of [-1, 1]) {
    const parts = [];
    for (let i = 0; i < 4; i++) parts.push(paint(place(new THREE.BoxGeometry(0.1, leafH, leafW / 4 - 0.02), 0, leafH / 2, -s * (i + 0.5) * leafW / 4), i % 2 ? 0x8a6440 : 0x7e5a38, 0.15, i + s * 9));
    for (const y of [0.4, leafH - 0.4]) parts.push(paint(place(new THREE.BoxGeometry(0.14, 0.14, leafW), 0.03, y, -s * leafW / 2), 0x5a3e24, 0.1, 20));
    parts.push(paint(place(new THREE.BoxGeometry(0.14, 0.12, leafW * 1.1), 0.03, leafH / 2, -s * leafW / 2, Math.atan2(leafH - 0.8, leafW) * s, 0, 0), 0x5a3e24, 0.1, 21));
    parts.push(paint(place(new THREE.BoxGeometry(0.06, 0.18, 0.18), -0.08, leafH / 2, -s * (leafW - 0.2)), 0x3a3a3a, 0.4, 22));
    const leaf = new THREE.Mesh(merge(parts), materials.vcolor);
    // Hinged at the frame post; rotates back into the tunnel to open.
    leaf.position.set(dx, a.y + 0.05, a.z + s * (hw - 0.3));
    leaf.castShadow = true; scene.add(leaf); leaves.push({ leaf, s });
  }
  const sign = textPlane(['EMBER SEAM', 'deed holders only'], { w: 1.6, h: 0.6, bg: '#3a2a1a', fg: '#f0d8a8' });
  sign.position.set(dx - 0.09, a.y + a.h - 0.85, a.z - 0.9); sign.rotation.y = -Math.PI / 2; scene.add(sign);
  const ember = CLAIMS.find(c => c.id === 'ember');
  const colliders = [
    { op: 'setStaticBox', key: 'adit-door', hx: 0.15, hy: a.h / 2, hz: hw, pos: [dx, a.y + a.h / 2, a.z] },
    { op: 'setStatic', key: 'adit', vertices: new Float32Array(cv), indices: new Uint32Array(ci) },
    ...boxes.map(([x, y, z, hx, hy, hz], i) => ({ op: 'setStaticBox', key: 'adit-box' + i, hx, hy, hz, pos: [x, y, z] })),
  ];
  return {
    colliders,
    doorX: dx,
    doorOpen: false,
    // Open (swing back) or close the Ember Seam door; returns the physics op.
    setDoor(open) {
      this.doorOpen = open;
      for (const { leaf, s } of leaves) leaf.rotation.y = open ? -s * Math.PI * 0.47 : 0;
      sign.visible = !open;
      return open ? { op: 'setStaticBox', key: 'adit-door', remove: true } : colliders[0];
    },
    // Is a point inside the tunnel or the seam beyond (lantern and ambience)?
    contains: (x, y, z) => x > a.x - 0.5 && x < ember.x1 && Math.abs(z - a.z) < (x < x1 - 2 ? hw + 0.5 : ember.d / 2) && y > a.y - (x < x1 - 2 ? 1 : 3.5) && y < (x < x1 - 2 ? a.y + a.h + 1 : ember.top),
  };
}
