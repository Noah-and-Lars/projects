/* Island Front: renderer, terrain, sea, forests, roads, bridges, buildings and colliders. */
'use strict';
const V3 = THREE.Vector3, TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const SUN_DIR = new V3(-0.45, 0.72, 0.52).normalize();
const SKY_TOP = new THREE.Color(0x3f78b8), SKY_HZ = new THREE.Color(0xb9cfdc);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
document.getElementById('gl').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY_HZ.clone(), 1400, 8500);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 16000);
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xcfe2f4, 0x4a5636, 0.62); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.35);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 1400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// sky dome with a vertical gradient
(() => {
  const g = new THREE.SphereGeometry(14000, 24, 12), col = [], p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = clamp(p.getY(i) / 14000, 0, 1), c = SKY_HZ.clone().lerp(SKY_TOP, Math.pow(t, .55)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; m.name = 'sky'; scene.add(m); window.SKY = m;
})();

const MATS = {};
function mat(color, o) { const k = color + (o ? JSON.stringify(o) : ''); return MATS[k] || (MATS[k] = new THREE.MeshLambertMaterial(Object.assign({}, o || {}, { color: new THREE.Color(color).convertSRGBToLinear() }))); }
const BOX = new THREE.BoxGeometry(1, 1, 1);
const ROOF_GEO = new THREE.ConeGeometry(1, 1, 4, 1);
function noiseTex(size, lo, hi, seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'), img = g.createImageData(size, size), R = rng(seed);
  for (let i = 0; i < size * size; i++) { const v = lo + (hi - lo) * (0.6 * R() + 0.4 * (.5 + .5 * Math.sin(i * .37) * Math.cos(i * .011))); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

/* ---------------- world state for the current map ---------------- */
const WORLD = { M: null, group: null, colliders: [], trees: [], bridges: [], pads: {} };
function terrainY(x, z) { // metres in, metres out (bilinear on the grid)
  if (WORLD.HF) return terrainYFine(x, z);
  const H = WORLD.M.H, fx = clamp(x / CELL, 0, GW - 1.001), fz = clamp(z / CELL, 0, GH - 1.001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, id = j * GW + i;
  // match the mesh's triangles exactly (split along the i+1,j -> i,j+1 diagonal)
  const h00 = H[id], h10 = H[id + 1], h01 = H[id + GW], h11 = H[id + GW + 1];
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
const RAMP = 22;
function bridgeAt(x, z, footY) { // the deck height if (x,z) is on a bridge (with a ramp down to the road at each end)
  for (const b of WORLD.bridges) {
    const dx = x - b.x, dz = z - b.z, a = dx * b.c + dz * b.s, s = -dx * b.s + dz * b.c;
    if (a < b.aL - RAMP || a > b.aR + RAMP || Math.abs(s) > b.w / 2) continue;
    const out = a < b.aL ? b.aL - a : a > b.aR ? a - b.aR : 0;
    const y = out ? lerp(b.y, Math.min(b.y, terrainY(x, z)), out / RAMP) : b.y;
    if (footY !== undefined && footY < y - 3) continue; // underneath it
    return y;
  }
  return null;
}
function groundY(x, z, footY) { const t = terrainY(x, z), b = bridgeAt(x, z, footY); return b !== null && b > t ? b : t; }
function groundNormal(x, z, out, d = 3) {
  const hL = groundY(x - d, z), hR = groundY(x + d, z), hD = groundY(x, z - d), hU = groundY(x, z + d);
  return out.set(hL - hR, 2 * d, hD - hU).normalize();
}
function onRoad(x, z) { const M = WORLD.M, i = Math.round(x / CELL), j = Math.round(z / CELL); return i < 0 || j < 0 || i >= GW || j >= GH ? 0 : M.ROAD[j * GW + i]; }
function inForest(x, z) { const M = WORLD.M, i = Math.round(x / CELL), j = Math.round(z / CELL); return i < 0 || j < 0 || i >= GW || j >= GH ? 0 : M.F[j * GW + i]; }

/* colliders: boxes turned about y. {x,z,hx,hz,c,s,y0,y1} */
function addCollider(x, z, hx, hz, ang, y0, y1, tag) { const c = { x, z, hx, hz, c: Math.cos(ang), s: Math.sin(ang), y0, y1, tag }; WORLD.colliders.push(c); return c; }
function pushOutCircle(p, r, footY, headY) { // move p (V3, x/z) out of every box it overlaps
  let hit = false;
  for (const b of WORLD.colliders) {
    if (footY > b.y1 - 0.4 || headY < b.y0) continue;
    const dx = p.x - b.x, dz = p.z - b.z; if (Math.abs(dx) > b.hx + b.hz + r + 1 && Math.abs(dz) > b.hx + b.hz + r + 1) continue;
    const lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c;
    const qx = clamp(lx, -b.hx, b.hx), qz = clamp(lz, -b.hz, b.hz), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
    if (d2 >= r * r) continue;
    let nx, nz, push;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; push = r - d; }
    else { const ox = b.hx - Math.abs(lx), oz = b.hz - Math.abs(lz); if (ox < oz) { nx = Math.sign(lx) || 1; nz = 0; push = ox + r; } else { nx = 0; nz = Math.sign(lz) || 1; push = oz + r; } }
    p.x += (nx * b.c - nz * b.s) * push; p.z += (nx * b.s + nz * b.c) * push; hit = true;
  }
  return hit;
}
function standTop(x, z, footY, r = 0.3) { // highest box top under a point that a unit could stand on (roofs, tower decks)
  let top = null;
  for (const b of WORLD.colliders) {
    if (!b.walk || footY < b.y1 - 1.2) continue;
    const dx = x - b.x, dz = z - b.z, lx = dx * b.c + dz * b.s, lz = -dx * b.s + dz * b.c;
    if (Math.abs(lx) <= b.hx + r && Math.abs(lz) <= b.hz + r && (top === null || b.y1 > top)) top = b.y1;
  }
  return top;
}
const _sa = new V3(), _sb = new V3();
function segBoxes(a, b) { // first hit fraction (0..1) of segment a->b against any box, or null
  let best = null;
  for (const k of WORLD.colliders) {
    const ax = a.x - k.x, az = a.z - k.z, bx = b.x - k.x, bz = b.z - k.z;
    const p0x = ax * k.c + az * k.s, p0z = -ax * k.s + az * k.c, p1x = bx * k.c + bz * k.s, p1z = -bx * k.s + bz * k.c;
    let t0 = 0, t1 = 1;
    const slab = (p0, p1, lo, hi) => { const d = p1 - p0; if (Math.abs(d) < 1e-9) return p0 >= lo && p0 <= hi; let u0 = (lo - p0) / d, u1 = (hi - p0) / d; if (u0 > u1) { const t = u0; u0 = u1; u1 = t; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); return t0 <= t1; };
    if (!slab(p0x, p1x, -k.hx, k.hx) || !slab(p0z, p1z, -k.hz, k.hz) || !slab(a.y, b.y, k.y0, k.y1)) continue;
    if (best === null || t0 < best) best = t0;
  }
  return best;
}
function segTerrain(a, b, step = 6) { // first fraction where the segment goes under the ground or water... ground only
  const L = a.distanceTo(b), n = Math.max(1, Math.ceil(L / step));
  for (let i = 1; i <= n; i++) { const t = i / n, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t); if (y < terrainY(x, z)) return (i - 0.5) / n; }
  return null;
}
function lineOfSight(a, b) { return segTerrain(a, b, 12) === null && segBoxes(a, b) === null && !(typeof smokeBlocks === 'function' && smokeBlocks(a, b)); }

/* ---------------- building the world ---------------- */
function kmToM(p) { return [p[0] * 1000, p[1] * 1000]; }
// static scenery is batched: one mesh per colour for the whole map instead of thousands of boxes
const BATCH = new Map(), _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bv = new V3(), _bs = new V3(), _bn = new THREE.Matrix3(), _bx = new V3();
function batchAdd(geo, color, matrix, dims) { // dims: box size (w,h,d) or [u,v] metres for geometry with its own uv
  let b = BATCH.get(color); if (!b) BATCH.set(color, b = { pos: [], nor: [], uv: [], idx: [], n: 0 });
  const p = geo.attributes.position, nr = geo.attributes.normal, uvA = geo.attributes.uv; _bn.getNormalMatrix(matrix);
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i), ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i));
    if (geo === BOX && dims) { // texture coordinates in metres on every face of a box
      if (ax >= ay && ax >= az) b.uv.push((lz + .5) * dims[2], (ly + .5) * dims[1]); else if (ay >= az) b.uv.push((lx + .5) * dims[0], (lz + .5) * dims[2]); else b.uv.push((lx + .5) * dims[0], (ly + .5) * dims[1]);
    } else if (uvA) b.uv.push(uvA.getX(i) * (dims ? dims[0] : 1), uvA.getY(i) * (dims ? dims[1] : 1)); else b.uv.push(0, 0);
    _bx.set(lx, ly, lz).applyMatrix4(matrix); b.pos.push(_bx.x, _bx.y, _bx.z); _bx.fromBufferAttribute(nr, i).applyMatrix3(_bn).normalize(); b.nor.push(_bx.x, _bx.y, _bx.z);
  }
  if (geo.index) for (let i = 0; i < geo.index.count; i++) b.idx.push(b.n + geo.index.getX(i)); else for (let i = 0; i < p.count; i++) b.idx.push(b.n + i);
  b.n += p.count;
}
function batchFlush(parent) {
  for (const [color, b] of BATCH) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(b.idx), 1));
    if (WORLD.gfx === 'realistic') g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.computeBoundingSphere(); let mt = WORLD.gfx === 'realistic' ? realMat(color) : mat(color); const dl = typeof DECAL_LEVEL !== 'undefined' && DECAL_LEVEL[color];
    if (dl) { const k = mt.userData.decal || (mt.userData.decal = Object.assign(mt.clone(), { polygonOffset: true, polygonOffsetFactor: -2 * dl, polygonOffsetUnits: -4 * dl })); mt = k; }
    const m = new THREE.Mesh(g, mt); m.castShadow = !dl; m.receiveShadow = true; parent.add(m);
  }
  BATCH.clear();
}
function addBoxMesh(parent, w, h, d, color, x, y, z, ang = 0) {
  _bm.compose(_bv.set(x, y, z), _bq.setFromAxisAngle(_bs.set(0, 1, 0), -ang), _bs.set(w, h, d)); batchAdd(BOX, color, _bm, [w, h, d]);
}
// a site: things placed in a local frame (+x along ang) on a flat pad at height y0
class Site {
  constructor(x, z, ang, y0) { this.x = x; this.z = z; this.ang = ang; this.c = Math.cos(ang); this.s = Math.sin(ang); this.y0 = y0; }
  w(fx, fz) { return [this.x + fx * this.c - fz * this.s, this.z + fx * this.s + fz * this.c]; }
  box(fx, fz, w, h, d, color, o = {}) { // w along local x, d along local z, sitting on the pad (or o.y)
    const [x, z] = this.w(fx, fz), y = (o.y ?? this.y0) + (o.dy || 0);
    const m = addBoxMesh(WORLD.group, w, h, d, color, x, y + h / 2, z, this.ang + (o.rot || 0), o.shadow !== false);
    if (o.collide !== false) { const c = addCollider(x, z, w / 2, d / 2, this.ang + (o.rot || 0), y - (o.sink ?? 2), y + h, o.tag); if (o.walk) c.walk = true; }
    return m;
  }
  roofHouse(fx, fz, w, d, h, wall, roof, rot = 0) {
    this.box(fx, fz, w, h, d, wall, { rot });
    if (WORLD.gfx === 'realistic') { // a gable roof with overhanging eaves
      const [x, z] = this.w(fx, fz), long = w >= d, rh = Math.min(w, d) * .38, L = long ? w : d, Dp = long ? d : w;
      const o = new THREE.Object3D(); o.position.set(x, this.y0 + h, z); o.rotation.y = -(this.ang + rot) + (long ? 0 : Math.PI / 2); o.scale.set(L + .6, rh, Dp + .9); o.updateMatrix();
      batchAdd(GABLE_GEO, roof, o.matrix, [L + .6, Math.hypot(Dp / 2, rh)]);
      if (L > 9) addBoxMesh(WORLD.group, .7, rh + 1.4, .7, 0x8f8a7c, ...((p) => [p[0], this.y0 + h + rh * .5, p[1]])(this.w(fx + (long ? L * .3 : 0), fz + (long ? 0 : L * .3))), this.ang); // chimney
      return;
    }
    const [x, z] = this.w(fx, fz), k = Math.max(w, d); // a hipped roof from a 4-sided cone
    const o = new THREE.Object3D(); o.position.set(x, this.y0 + h + h * 0.27, z); o.rotation.y = -(this.ang + rot); o.updateMatrix();
    const inner = new THREE.Matrix4().compose(new V3(), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.PI / 4), new V3(1, 1, 1));
    const sc = new THREE.Matrix4().makeScale(w / k * 1.414, 1, d / k * 1.414);
    batchAdd(ROOF_GEO, roof, o.matrix.multiply(sc).multiply(inner).multiply(new THREE.Matrix4().makeScale(k * .55, h * .55, k * .55)));
  }
  tower(fx, fz, h, color) { // a guard tower: legs, deck you can stand on, roof
    const s = 4.2;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.box(fx + a * s * .42, fz + b * s * .42, .35, h, .35, 0x5a4a38, { collide: false });
    this.box(fx, fz, s, .4, s, color, { y: this.y0 + h, walk: true, sink: .1, tag: 'deck' });
    this.box(fx, fz + s / 2, s, 1.1, .15, color, { y: this.y0 + h + .4, sink: 0 }); this.box(fx, fz - s / 2, s, 1.1, .15, color, { y: this.y0 + h + .4, sink: 0 });
    this.box(fx + s / 2, fz, .15, 1.1, s, color, { y: this.y0 + h + .4, sink: 0 }); this.box(fx - s / 2, fz, .15, 1.1, s, color, { y: this.y0 + h + .4, sink: 0 });
    this.box(fx, fz, s + .6, .25, s + .6, 0x4a4a44, { y: this.y0 + h + 3.2, collide: false });
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.box(fx + a * s * .46, fz + b * s * .46, .14, 2.8, .14, 0x4a3c2e, { y: this.y0 + h + .4, collide: false });
    // ladder collider so you can walk round the legs
    addCollider(...this.w(fx, fz), s * .45, s * .45, this.ang, this.y0 - 1, this.y0 + 1.2);
    return [this.w(fx, fz), this.y0 + h + .4];
  }
  wallLine(f0x, f0z, f1x, f1z, h, t, color, gaps = []) { // a straight wall with gaps (fractions [a,b])
    const L = Math.hypot(f1x - f0x, f1z - f0z), rot = Math.atan2(f1z - f0z, f1x - f0x);
    // a gate wherever a road crosses this wall
    const A = this.w(f0x, f0z), B = this.w(f1x, f1z);
    gaps = gaps.slice();
    for (const r of WORLD.M._roads) for (let k = 0; k < r.P.length - 1; k++) {
      const p = segX(A, B, kmToM(r.P[k]), kmToM(r.P[k + 1])); if (!p) continue;
      const t = Math.hypot(p[0] - A[0], p[1] - A[1]) / L, g = (r.main ? 16 : 10) / L / Math.max(.35, Math.abs(Math.sin(p[2] - Math.atan2(B[1] - A[1], B[0] - A[0]))));
      gaps.push([clamp(t - g, 0, 1), clamp(t + g, 0, 1)]);
    }
    gaps.sort((a, b) => a[0] - b[0]);
    const merged = []; for (const g of gaps) { const m = merged[merged.length - 1]; if (m && g[0] <= m[1]) m[1] = Math.max(m[1], g[1]); else merged.push(g.slice()); }
    let edges = [0]; for (const [a, b] of merged) edges.push(a, b); edges.push(1);
    for (let k = 0; k < edges.length; k += 2) {
      const a = edges[k], b = edges[k + 1]; if (b - a < 1e-3) continue;
      const m = (a + b) / 2, fx = lerp(f0x, f1x, m), fz = lerp(f0z, f1z, m);
      this.box(fx, fz, L * (b - a), h, t, color, { rot });
    }
  }
}

function buildTerrainMesh(M) {
  const N = GW * GH, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), uv = new Float32Array(N * 2), H = M.H, c = [0, 0, 0];
  const SAND = [196, 182, 140], ROCK = [128, 118, 104], FOREST = [58, 84, 44];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const id = j * GW + i, h = H[id], x = i * CELL, z = j * CELL;
    pos[id * 3] = x; pos[id * 3 + 1] = h; pos[id * 3 + 2] = z; uv[id * 2] = x / 18; uv[id * 2 + 1] = z / 18;
    const sl = Math.hypot((H[Math.min(id + 1, N - 1)] - H[Math.max(id - 1, 0)]), (H[Math.min(id + GW, N - 1)] - H[Math.max(id - GW, 0)])) / (2 * CELL);
    if (h < 0) { const t = clamp(-h / 30, 0, 1); c[0] = lerp(SAND[0], 60, t); c[1] = lerp(SAND[1], 96, t); c[2] = lerp(SAND[2], 100, t); }
    else if (h < 3.5) { c[0] = SAND[0] + 18; c[1] = SAND[1] + 16; c[2] = SAND[2] + 10; }
    else {
      ramp(LAND_RAMP, h, c);
      c[0] *= .8; c[1] *= .86; c[2] *= .72; // greener, less pastel than the map
      if (M.F[id]) { c[0] = lerp(c[0], FOREST[0], .75); c[1] = lerp(c[1], FOREST[1], .75); c[2] = lerp(c[2], FOREST[2], .75); }
      const r = sstep(.42, .8, sl); c[0] = lerp(c[0], ROCK[0], r); c[1] = lerp(c[1], ROCK[1], r); c[2] = lerp(c[2], ROCK[2], r);
      if (M.ROAD[id] === 2) { c[0] = lerp(c[0], 120, .25); c[1] = lerp(c[1], 112, .25); c[2] = lerp(c[2], 96, .25); }
    }
    const n = 1 + .09 * fbm(x * .004, z * .004, 77, 3);
    col[id * 3] = Math.pow(clamp(c[0] * n / 255, 0, 1), 2.2); col[id * 3 + 1] = Math.pow(clamp(c[1] * n / 255, 0, 1), 2.2); col[id * 3 + 2] = Math.pow(clamp(c[2] * n / 255, 0, 1), 2.2);
  }
  const idx = new Uint32Array((GW - 1) * (GH - 1) * 6); let k = 0;
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) { const a = j * GW + i, b = a + 1, d = a + GW, e = d + 1; idx[k++] = a; idx[k++] = d; idx[k++] = b; idx[k++] = b; idx[k++] = d; idx[k++] = e; }
  const g = new THREE.BufferGeometry();
  if (typeof gritColors === 'function') gritColors(col); // (chaos.js: a drier, muddier look)
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  WORLD.tcol = col; // (ground.js colours its grass from this)
  const m = new THREE.Mesh(g, typeof optTerrainMat === 'function' ? optTerrainMat() : new THREE.MeshLambertMaterial({ vertexColors: true, map: noiseTex(256, 170, 255, 5) }));
  m.receiveShadow = true; m.name = 'terrain';
  return m;
}
function buildSea() {
  const g = new THREE.PlaneGeometry(80000, 80000, 1, 1); g.rotateX(-Math.PI / 2);
  const tex = noiseTex(256, 200, 255, 9); tex.repeat.set(1600, 1600);
  const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x2b6a86, specular: 0x9ab8c8, shininess: 60, transparent: true, opacity: .82, map: tex, depthWrite: false }));
  m.position.set(WORLD_W / 2, 0, WORLD_H / 2); m.renderOrder = 1; m.name = 'sea';
  return m;
}
// trees: merged low-poly shapes with vertex colours, instanced per 2 km tile
function coloredGeo(parts) { // [[geometry, hex], ...] -> one non-indexed geometry with colours
  const P = [], N = [], C = [];
  for (const [g0, hex] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); const p = g.attributes.position, n = g.attributes.normal, col = new THREE.Color(hex).convertSRGBToLinear();
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(col.r, col.g, col.b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); return g;
}
const TREE_GEO = (() => {
  const trunk = new THREE.CylinderGeometry(.12, .2, 3, 5); trunk.translate(0, 1.5, 0);
  const c1 = new THREE.ConeGeometry(1.7, 4.2, 7); c1.translate(0, 4.6, 0);
  const c2 = new THREE.ConeGeometry(1.25, 3.4, 7); c2.translate(0, 6.6, 0);
  const c3 = new THREE.ConeGeometry(.8, 2.6, 7); c3.translate(0, 8.3, 0);
  const pine = coloredGeo([[trunk, 0x5a4330], [c1, 0x2f4a2a], [c2, 0x34522d], [c3, 0x3a5a31]]);
  const t2 = new THREE.CylinderGeometry(.14, .24, 3.6, 5); t2.translate(0, 1.8, 0);
  const b1 = new THREE.IcosahedronGeometry(2.3, 0); b1.scale(1, .85, 1); b1.translate(0, 4.8, 0);
  const b2 = new THREE.IcosahedronGeometry(1.6, 0); b2.translate(.9, 5.9, .5);
  const b3 = new THREE.IcosahedronGeometry(1.5, 0); b3.translate(-1, 5.5, -.6);
  const broad = coloredGeo([[t2, 0x5c4532], [b1, 0x46632f], [b2, 0x4f6d35], [b3, 0x3f5a2b]]);
  const pf = new THREE.ConeGeometry(1.6, 8.6, 5); pf.translate(0, 5, 0);
  const bf = new THREE.OctahedronGeometry(2.6, 0); bf.scale(1, .95, 1); bf.translate(0, 4.9, 0);
  return { pine, broad, pineFar: coloredGeo([[pf, 0x33502c]]), broadFar: coloredGeo([[bf, 0x46632f]]) };
})();
const TREE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
function buildTrees(M) {
  const R = rng(M.seed * 31 + 7), tiles = new Map(), T = 2000, dummy = new THREE.Object3D();
  for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
    const id = j * GW + i; if (!M.F[id]) continue;
    for (let n = 0; n < 2; n++) {
      if (R() > .62) continue;
      const x = (i + R() - .5) * CELL, z = (j + R() - .5) * CELL, h = terrainY(x, z); if (h < 4) continue;
      const key = Math.floor(x / T) + ',' + Math.floor(z / T); let t = tiles.get(key); if (!t) tiles.set(key, t = { pine: [], broad: [], cx: (Math.floor(x / T) + .5) * T, cz: (Math.floor(z / T) + .5) * T });
      (h > 160 || R() < .35 ? t.pine : t.broad).push([x, h - .3, z, R() * TAU, 1.0 + R() * .8]);
    }
  }
  WORLD.trees = [];
  for (const t of tiles.values()) for (const kind of ['pine', 'broad']) {
    const list = t[kind]; if (!list.length) continue;
    for (const far of [false, true]) { // a detailed tree up close, a cheap one further out
      const im = new THREE.InstancedMesh(TREE_GEO[far ? kind + 'Far' : kind], TREE_MAT, list.length);
      list.forEach(([x, y, z, r, s], k) => { dummy.position.set(x, y, z); dummy.rotation.set(0, r, 0); dummy.scale.set(s, s * (.9 + (k % 5) * .06), s); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); });
      im.frustumCulled = false; im.receiveShadow = true; im.userData = { cx: t.cx, cz: t.cz, far };
      WORLD.group.add(im); WORLD.trees.push(im);
    }
  }
}
const ROAD_MATS = {};
function roadMat(main) { return ROAD_MATS[main] || (ROAD_MATS[main] = new THREE.MeshStandardMaterial({ map: main ? TEX.asphalt : TEX.track, roughness: main ? .85 : .95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, envMapIntensity: .3 })); }
function buildRoads(M) {
  const g = new THREE.Group();
  for (const r of M._roads) {
    const W2 = r.main ? 4.5 : 2.6, P = r.P.map(kmToM), pts = [];
    for (let k = 0; k < P.length - 1; k++) { const a = P[k], b = P[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / (WORLD.gfx === 'realistic' ? 5 : 10))); for (let q = 0; q < n; q++) pts.push([lerp(a[0], b[0], q / n), lerp(a[1], b[1], q / n)]); }
    pts.push(P[P.length - 1]);
    let pos = [], idx = [], uvs = [], run = 0, along = 0;
    const flush = () => { if (idx.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, WORLD.gfx === 'realistic' ? roadMat(r.main) : mat(r.main ? 0x4e4c47 : 0x8a7352, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); m.receiveShadow = true; g.add(m); } pos = []; idx = []; uvs = []; run = 0; };
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(k - 1, 0)], b = pts[Math.min(k + 1, pts.length - 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      const [x, z] = pts[k], wet = terrainY(x, z) < .6 || bridgeAt(x, z) !== null;
      if (wet) { flush(); continue; }
      const xl = x + nx * W2, zl = z + nz * W2, xr = x - nx * W2, zr = z - nz * W2;
      if (k) along += Math.hypot(x - pts[k - 1][0], z - pts[k - 1][1]);
      const lift = WORLD.gfx === 'realistic' ? .3 : .18; pos.push(xl, Math.max(terrainY(xl, zl), terrainY(x, z)) + lift, zl, xr, Math.max(terrainY(xr, zr), terrainY(x, z)) + lift, zr); uvs.push(0, along / (r.main ? 6 : 5), 1, along / (r.main ? 6 : 5));
      if (run > 0) { const v = run * 2; idx.push(v - 2, v, v - 1, v - 1, v, v + 1); }
      run++;
    }
    flush();
  }
  WORLD.group.add(g);
}
function buildBridges(M) {
  WORLD.bridges = M.bridges.map(b => ({ ...b, c: Math.cos(b.ang), s: Math.sin(b.ang) }));
  for (const b of WORLD.bridges) {
    const site = new Site(b.x, b.z, b.ang, b.y), L = b.aR - b.aL, mid = (b.aL + b.aR) / 2;
    site.box(mid, 0, L, 1.2, b.w + 1, 0x77746c, { y: b.y - 1.2, collide: false });
    site.box(mid, b.w / 2 + .3, L, 1.1, .3, 0x6a675f, { sink: 0 });
    site.box(mid, -b.w / 2 - .3, L, 1.1, .3, 0x6a675f, { sink: 0 });
    for (let a = b.aL + 9; a < b.aR - 4; a += 18) for (const sd of [-1, 1]) { const [x, z] = site.w(a, sd * b.w * .35), ty = terrainY(x, z); if (ty < b.y - 2) addBoxMesh(WORLD.group, 1.4, b.y - ty, 1.4, 0x6d6a62, x, (b.y + ty) / 2 - 1.2, z, b.ang); }
  }
}
function buildTeamBase(M, b, team) {
  const y0 = b.zone.y0, site = new Site(b.x * 1000, b.y * 1000, b.ang, y0), TC = team ? 0xa0402e : 0x3a5f9e;
  const gx = 420, gz = 360;
  site.wallLine(-gx, -gz, gx, -gz, 2.4, .5, 0x8c8a80); site.wallLine(-gx, gz, gx, gz, 2.4, .5, 0x8c8a80);
  site.wallLine(-gx, -gz, -gx, gz, 2.4, .5, 0x8c8a80, [[.42, .58]]); site.wallLine(gx, -gz, gx, gz, 2.4, .5, 0x8c8a80, [[.38, .62]]);
  site.roofHouse(-60, -120, 60, 24, 7, 0xb9b3a2, 0x5e6a5c); site.roofHouse(110, -140, 34, 22, 6, 0xb9b3a2, 0x5e6a5c);
  site.roofHouse(-20, 100, 80, 26, 8, 0xa8a291, 0x55604f); site.box(160, 120, 30, 9, 30, 0x9b9585);
  site.box(-180, 20, 26, 6, 60, 0xa49e8d);
  site.box(300, -220, 90, 10, 50, 0x7d7b70); // motor pool shed
  site.box(300, -175, 90, .2, 40, 0x626058, { collide: false }); // apron
  for (const s of [-270, 270]) { const [x, z] = site.w(50, s); const pad = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, .3, 24), mat(0x5d6365)); pad.position.set(x, y0 + .15, z); pad.receiveShadow = true; WORLD.group.add(pad); const hx = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), mat(0xeeeeee, { transparent: true, alphaTest: .5, map: hTex() })); hx.rotation.x = -Math.PI / 2; hx.rotation.z = -b.ang; hx.position.set(x, y0 + .32, z); WORLD.group.add(hx); }
  // flag
  const [fx, fz] = site.w(0, 0); addBoxMesh(WORLD.group, .25, 18, .25, 0xdddddd, fx, y0 + 9, fz);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), mat(TC, { side: THREE.DoubleSide })); flag.position.set(fx + 2.6, y0 + 16.4, fz); WORLD.group.add(flag);
  // howitzer emplacements: sandbag rings (the guns themselves are units)
  b.gunSpots = [];
  for (let g = 0; g < 4; g++) {
    const fz2 = -240 + g * 160, [x, z] = site.w(-310, fz2);
    for (let a = 0; a < 10; a++) { if (a === 5) continue; const an = a / 10 * TAU, bx = x + Math.cos(an) * 9, bz = z + Math.sin(an) * 9;
      if (!propPlace('sandbagWall', bx, bz, an + Math.PI / 2, { y: y0 - .05, scale: 1.65, collide: false })) addBoxMesh(WORLD.group, 5.4, 1.1, 1.4, 0x9b8d68, bx, y0 + .55, bz, an + Math.PI / 2); // the downloaded sandbags if present (props.js)
      addCollider(bx, bz, 2.7, .7, an + Math.PI / 2, y0 - 1, y0 + 1.1); }
    b.gunSpots.push([x, z]);
  }
  propsCompound(site, 380, 320, 6, team * 53 + M.seed, [[260, 200, 50], [300, -140, 80], [50, 270, 24], [50, -270, 24], [0, 0, 20]]); propsConcrete(site, 380, 320, team * 59 + M.seed, true); // sandbag positions, clear of the spawn spots and helipads
  if (WORLD.gfx === 'realistic') { decorateCompound(site, 380, 320, 'B', team * 97 + M.seed); razorWire(site, -gx, -gz, gx, -gz, y0 + 2.4); razorWire(site, -gx, gz, gx, gz, y0 + 2.4); }
  b.vehicleSpawn = site.w(300, -150); b.infSpawn = site.w(260, 200); b.site = site;
}
let _hTex; function hTex() { if (_hTex) return _hTex; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 32, 35); return _hTex = new THREE.CanvasTexture(cv); }

function buildCheckpoint(M, p) {
  const y0 = p.zone.y0, site = new Site(p.x * 1000, p.y * 1000, p.ang, y0), [dxk, dyk] = CP_DIM[p.size], hx = dxk * 500, hz = dyk * 500;
  p.site = site; p.towers = []; p.posts = [];
  const sand = 0xa5946c, conc = 0x9a978e, dark = 0x6f6c63;
  if (p.size === 'S') {
    site.wallLine(-hx, -hz, hx, -hz, 1.3, 1.4, sand, [[.4, .5]]); site.wallLine(-hx, hz, hx, hz, 1.3, 1.4, sand, [[.55, .65]]);
    site.wallLine(-hx, -hz, -hx, hz, 1.3, 1.4, sand, [[.4, .6]]); site.wallLine(hx, -hz, hx, hz, 1.3, 1.4, sand, [[.4, .6]]);
    p.towers.push(site.tower(hx * .6, -hz * .6, 7, 0x6e6450));
  } else {
    const H = p.size === 'L' ? 5 : 3.2, T = p.size === 'L' ? 1.6 : .9;
    site.wallLine(-hx, -hz, hx, -hz, H, T, conc); site.wallLine(-hx, hz, hx, hz, H, T, conc);
    site.wallLine(-hx, -hz, -hx, hz, H, T, conc, [[.44, .56]]); site.wallLine(hx, -hz, hx, hz, H, T, conc, [[.44, .56]]);
    const corners = p.size === 'L' ? [[-1, -1], [1, -1], [1, 1], [-1, 1]] : [[-1, -1], [1, 1]];
    for (const [a, b] of corners) p.towers.push(site.tower(a * (hx - 3), b * (hz - 3), p.size === 'L' ? 10 : 8, 0x6b6656));
    if (p.size === 'L') { // gatehouses and a central keep
      for (const sx of [-1, 1]) { site.box(sx * hx, -hz * .16, 8, H + 2.5, 6, dark); site.box(sx * hx, hz * .16, 8, H + 2.5, 6, dark); }
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, .3, 24), mat(0x5d6365)); const [x, z] = site.w(120, -105); pad.position.set(x, y0 + .15, z); WORLD.group.add(pad);
    }
  }
  for (const [fx, fz, w, h] of p.blds) {
    const W = w * 1000, D = h * 1000, Ht = (p.size === 'L' ? 5 : 3.6) + ((fx * 997 + fz * 131) % 1 + 1) % 1 * 3;
    if (W > 17 && p.size !== 'S') site.roofHouse(fx * 1000, fz * 1000, W, D, Ht, 0xa29b88, 0x4d5546);
    else site.box(fx * 1000, fz * 1000, W, Ht, D, (W * 13 | 0) % 2 ? 0x8f8a7c : 0x9d9686, { walk: true });
  }
  // crates and barrels for cover
  const R = rng(p.n * 191 + M.seed);
  for (let k = 0; k < (p.size === 'L' ? 18 : p.size === 'M' ? 9 : 4); k++) { const fx = (R() - .5) * hx * 1.6, fz = (R() - .5) * hz * 1.6; if (Math.abs(fz) < 12) continue; site.box(fx, fz, 1.6, 1.6, 1.6, 0x7a6440, { rot: R() * 3 }); }
  propsCompound(site, hx, hz, { S: 1, M: 2, L: 4 }[p.size], p.n * 71 + M.seed); propsConcrete(site, hx, hz, p.n * 73 + M.seed, false); // sandbag fighting positions (props.js; nothing if the model is missing)
  // NPC guard posts: tower decks first, then spots round the yard
  for (const [[x, z], y] of p.towers) p.posts.push({ x, z, y, tower: true });
  const need = GARRISON[p.size];
  for (let k = 0; p.posts.filter(q => !q.tower).length < need && k < 400; k++) { // (yard posts as well as the towers: guards on the ground are found and fought)
    const fx = (R() - .5) * (hx * 2 - 16), fz = (R() - .5) * (hz * 2 - 16), [x, z] = site.w(fx, fz), pt = new V3(x, y0 + 1, z);
    if (pushOutCircle(pt, 1.2, y0, y0 + 1.8) || terrainY(x, z) < 0.5) continue;
    p.posts.push({ x, z, y: groundY(x, z) });
  }
  if (WORLD.gfx === 'realistic') {
    decorateCompound(site, hx, hz, p.size, p.n * 31 + M.seed);
    if (p.size === 'S') for (let a = -hx - 3; a <= hx + 3; a += 1.1) for (const sd of [-1, 1]) { if (Math.abs(a) < 22) continue; site.box(a, sd * (hz + 3), 1.05, 1.3, 1.05, 0xa5946c, { sink: .1 }); }
    else { const H = p.size === 'L' ? 5 : 3.2; razorWire(site, -hx, -hz, hx, -hz, y0 + H); razorWire(site, -hx, hz, hx, hz, y0 + H); }
  }
  // the flag in the middle (recoloured when the owner changes)
  const [fx, fz] = site.w(p.size === 'L' ? 0 : -hx * .5, p.size === 'L' ? 0 : hz * .5);
  addBoxMesh(WORLD.group, .22, 14, .22, 0xdddddd, fx, y0 + 7, fz);
  p.flag = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.7), new THREE.MeshLambertMaterial({ color: 0xdedede, side: THREE.DoubleSide })); p.flag.position.set(fx + 2.3, y0 + 12.6, fz); WORLD.group.add(p.flag);
}
function buildTowns(M) {
  if (WORLD.gfx === 'realistic') return buildRealTowns(M); // European villages (real-town.js)
  for (const [x, y, w, d, a] of M.buildings) {
    const s = new Site(x * 1000, y * 1000, a, groundY(x * 1000, y * 1000) - .3), W = w * 1000, D = d * 1000;
    s.roofHouse(0, 0, W, D, 3.2 + (W * 7 | 0) % 3 * 2.8, [0xd8cfb8, 0xc9bfa4, 0xe0d6c2, 0xb8ad94][(W * 3 | 0) % 4], [0x8a4b38, 0x6b5a4a, 0x7b3f30][(D * 5 | 0) % 3]);
  }
}
/* Airfield layout, in metres in the airfield's own frame (u along the runway, v across it; the apron and hangars are on the -v side). */
const AF = { runwayW: 46, apron: [-230, 230, -205, -115], taxi: [-200, 200], taxiW: 20, hangars: [-255, -205] };
function airLocal(a, x, z) { const c = Math.cos(a.ang), s = Math.sin(a.ang), dx = x - a.x * 1000, dz = z - a.y * 1000; return [dx * c + dz * s, -dx * s + dz * c]; }
function airPaved(x, z) { // on the runway, a taxiway, the apron or under the hangars
  for (const a of WORLD.M.airfields) { const [u, v] = airLocal(a, x, z), L = a.len * 1000;
    if (Math.abs(u) < L / 2 + 6 && Math.abs(v) < AF.runwayW / 2 + 3) return true;
    if (u > AF.apron[0] - 4 && u < AF.apron[1] + 4 && v > AF.hangars[0] - 6 && v < AF.apron[3] + 4) return true;
    if (AF.taxi.some(t => Math.abs(u - t) < AF.taxiW / 2 + 3) && v > AF.apron[3] - 2 && v < 0) return true; }
  return false;
}
function inAirfield(x, z, pad = 0) { // anywhere within the airfield's bounds
  for (const a of WORLD.M.airfields) { const [u, v] = airLocal(a, x, z); if (Math.abs(u) < a.len * 500 + 120 + pad && v > -300 - pad && v < 85 + pad) return true; }
  return false;
}
const RUNWAY_C = 0x3c3f41, TAXI_C = 0x3c3f42, APRON_C = 0x5d6062, PAINT_W = 0xe8e8e0, PAINT_Y = 0xd9b400;
// paved surfaces lie only a few centimetres above the ground, so from height the terrain would flicker through them: draw them pulled towards
// the camera (as the roads are), the paint a step further than the tarmac under it
const DECAL_LEVEL = { [APRON_C]: 1, [RUNWAY_C]: 1, [TAXI_C]: 1, [PAINT_W]: 2, [PAINT_Y]: 2 };
function buildAirfields(M) {
  for (const a of M.airfields) {
    const s = new Site(a.x * 1000, a.y * 1000, a.ang, a.zone.y0), L = a.len * 1000, W = AF.runwayW, mk = { collide: false };
    s.box(0, 0, L, .12, W, RUNWAY_C, mk);
    // markings (ICAO style): edge lines, centreline dashes, threshold bars, touchdown-zone bars and the aiming point at each end
    for (const sd of [-1, 1]) s.box(0, sd * (W / 2 - 1.2), L - 8, .15, .9, PAINT_W, mk);
    for (let k = -L / 2 + 120; k < L / 2 - 120; k += 50) s.box(k, 0, 30, .15, .9, PAINT_W, mk);
    for (const e of [-1, 1]) {
      const end = e * L / 2;
      for (let b = 0; b < 6; b++) for (const sd of [-1, 1]) s.box(end - e * 22, sd * (3.2 + b * 3.4), 30, .15, 1.8, PAINT_W, mk); // threshold "piano keys"
      for (const sd of [-1, 1]) s.box(end - e * 300, sd * 9.5, 45, .15, 7, PAINT_W, mk);                                          // aiming point
      for (const d of [150, 450, 600]) for (const sd of [-1, 1]) for (let b = 0; b < (d === 150 ? 3 : d === 450 ? 2 : 1); b++) s.box(end - e * d, sd * (6 + b * 2.6), 22, .15, 1.6, PAINT_W, mk); // touchdown zone
      s.box(end - e * 3, 0, 2, .15, W - 2, PAINT_W, mk);                                                                            // runway end bar
    }
    // taxiways from the apron to the runway, with yellow centrelines
    for (const t of AF.taxi) { const v0 = AF.apron[3] - 1, v1 = -W / 2 + .5, mid = (v0 + v1) / 2, len = v1 - v0;
      s.box(t, mid, AF.taxiW, .11, len, TAXI_C, mk); s.box(t, mid + 1, .5, .14, len + 2, PAINT_Y, mk); }
    const [a0, a1, b0, b1] = AF.apron; s.box((a0 + a1) / 2, (b0 + b1) / 2, a1 - a0, .1, b1 - b0, APRON_C, mk);
    s.box(0, b1 - 6, a1 - a0 - 20, .13, .5, PAINT_Y, mk); // apron lead-in line
    for (const k of [-140, -40, 60]) s.roofHouse(k, -230, 60, 40, 11, 0x8d9091, 0x5a5e60);
    s.box(180, -225, 10, 22, 10, 0xc9c4b6); s.box(180, -225, 13, 4, 13, 0x6f8c9b, { y: a.zone.y0 + 22, collide: false });
  }
}
function buildDocks(M) {
  for (const d of M._docks) {
    const x = d.x * 1000, z = d.y * 1000, s = new Site(x, z, d.ang, 1.6);
    s.box(110, 0, 220, 1, 12, 0x6b5a46, { y: .8, walk: true, sink: 6 });
    s.box(215, 0, 12, 1, 60, 0x6b5a46, { y: .8, walk: true, sink: 6 });
    for (let k = 10; k < 220; k += 20) for (const sd of [-6, 6]) s.box(k, sd, .8, 6, .8, 0x4a3c2e, { y: -4, collide: false });
  }
}

function buildWorld(M) {
  if (WORLD.group) { scene.remove(WORLD.group); WORLD.group.traverse(o => { if (o.geometry && o.geometry !== BOX && !o.userData.shared && !Object.values(TREE_GEO).includes(o.geometry)) o.geometry.dispose(); }); }
  WORLD.M = M; WORLD.colliders = []; propsReset(); WORLD.group = new THREE.Group(); scene.add(WORLD.group);
  WORLD.bridges = M.bridges.map(b => ({ ...b, c: Math.cos(b.ang), s: Math.sin(b.ang) }));
  WORLD.trees = [];
  if (WORLD.gfx === 'realistic') { WORLD.HF = null; WORLD.HF = buildFine(M); buildRealWorld(M); }
  else { WORLD.HF = null; WORLD.group.add(buildTerrainMesh(M)); WORLD.group.add(buildSea()); buildTrees(M); }
  buildRoads(M); buildBridges(M);
  M.bases.forEach((b, t) => buildTeamBase(M, b, t));
  M._cps.forEach(p => buildCheckpoint(M, p));
  buildTowns(M); buildAirfields(M); buildDocks(M);
  propsRoadside(M, M.seed + 7); propsCountry(M, M.seed + 11); // sandbag positions along the roads in open country
  if (WORLD.gfx === 'realistic') buildRealFlora(M); // woods, hedgerows and grass, clear of the houses
  batchFlush(WORLD.group); propsFlush(WORLD.group);
  if (WORLD.gfx === 'realistic') flushWire();
}
function updateWorldView(focus) {
  for (const t of WORLD.trees) { const d = Math.hypot(t.userData.cx - focus.x, t.userData.cz - focus.z); t.visible = t.userData.far ? d >= 1800 && d < 5200 : d < 1800; }
  for (const e of ENTS) if (e.model) { const d = Math.abs(e.pos.x - camera.position.x) + Math.abs(e.pos.z - camera.position.z); e.model.root.visible = !(e.kind === 'soldier' && e.veh) && d < (e.kind === 'soldier' ? 1100 : 6000); }
  propsUpdate(camera.position); if (typeof optGrassUpdate === 'function') optGrassUpdate(camera.position);
  sun.position.copy(focus).addScaledVector(SUN_DIR, 600); sun.target.position.copy(focus);
  if (WORLD.gfx === 'realistic') { const now = performance.now(); updateReal(focus, Math.min(.1, (now - (WORLD._t || now)) / 1000)); WORLD._t = now; }
  SKY.position.copy(camera.position); SKY.position.y = 0;
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
