// Scene construction and per-frame drawing: themed environment, thick dirt
// track with a cut face, venue dressing, bikes and riders, particles,
// lighting, shadows and (on desktop) ambient occlusion.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeBikeModel, poseBike, makeRiderModel, poseRider } from './models.js';
import { RIDERS, LANES } from './race.js';
import { riderPose, toWorld } from './rider.js';
import { ragdollJoints } from './ragdoll.js';
import { THEMES, SPONSORS } from './themes.js';
import * as TX from './textures.js';

export const TW = 5.4; // half track width (z)

let envCache = null;
export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxDpr));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const pmrem = new THREE.PMREMGenerator(renderer);
  envCache = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return renderer;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
const smoothNoise = (x, seed) =>
  Math.sin(x * 0.021 + seed) * 0.5 + Math.sin(x * 0.047 + seed * 2.1) * 0.3 + Math.sin(x * 0.11 + seed * 3.7) * 0.2;

export function createView(renderer, race, quality) {
  const { track } = race;
  const def = track.def;
  const T = THEMES[def.theme] || THEMES.grassland;
  const scene = new THREE.Scene();
  crowd = null;
  const R = rng(def.id.length * 977 + def.features.length * 13);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  scene.background = keep(TX.skyTexture(T.sky[0], T.sky[1], T.stars));
  const fogCol = new THREE.Color(T.fog[0]);
  scene.fog = new THREE.Fog(fogCol, T.fog[1], T.fog[2]);
  scene.environment = envCache;
  scene.environmentIntensity = T.env;
  renderer.toneMappingExposure = T.exposure;

  // ---------- Lights ----------
  const hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(T.sun.color, T.sun.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  const sc = sun.shadow.camera;
  sc.left = -24; sc.right = 24; sc.top = 16; sc.bottom = -14; sc.near = 1; sc.far = 110;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(...T.sun.dir).normalize().multiplyScalar(40);

  // ---------- Ground levels ----------
  // The track is a raised dirt berm: its foot (base) sits BERM metres below
  // the lowest nearby riding surface, so even flat sections stand proud of the
  // venue ground and every jump reads as a solid sculpted mound.
  const BERM = 0.8;
  const n = track.xs.length;
  const base = new Float32Array(n);
  {
    const win = 24;
    const mins = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = Infinity;
      for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) m = Math.min(m, track.ys[k]);
      mins[i] = m;
    }
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) { s += mins[k]; c++; }
      base[i] = Math.min(s / c, track.ys[i]) - BERM;
    }
  }
  const x0 = track.xs[0], dxs = (track.xs[n - 1] - x0) / (n - 1);
  const idxAt = (x) => {
    let j = Math.max(0, Math.min(n - 2, Math.floor((x - x0) / dxs)));
    while (j > 0 && track.xs[j] > x) j--;
    while (j < n - 2 && track.xs[j + 1] < x) j++;
    return j;
  };
  const baseAt = (x) => {
    const cx = Math.max(x0, Math.min(track.xs[n - 1], x));
    const j = idxAt(cx);
    const t = Math.max(0, Math.min(1, (cx - track.xs[j]) / (track.xs[j + 1] - track.xs[j])));
    return base[j] + (base[j + 1] - base[j]) * t;
  };
  const heightAt = (x) => track.heightAt(Math.max(x0, Math.min(track.xs[n - 1], x)));
  // Shoulders: start SH_IN inside the riding edge and roll down to the foot.
  const SH_IN = 0.6;
  const runOf = (H) => 0.7 + H * 0.7;
  const outerAt = (x) => TW - SH_IN + runOf(heightAt(x) - baseAt(x)); // foot of either shoulder
  // Venue ground (gently rolling further back).
  const groundAt = (x, z) => baseAt(x) - 0.05 + (z < -14 ? smoothNoise(x, 3) * Math.min(4, (-z - 14) * 0.08) : 0);

  // ---------- Track: one sculpted cross-section swept along the profile ----------
  // Across the track (z): back foot -> rounded shoulder -> crowned riding
  // surface -> rounded shoulder -> front foot. The texture's v axis covers the
  // whole cross-section in metres, so the raked grooves run continuously over
  // the top and down both shoulders, and the lane ruts line up with LANES.
  const dirtCol = new THREE.Color(T.dirt);
  const SPAN = 7.5;                 // metres of shoulder texture each side
  const VT = 2 * TW + 2 * SPAN;     // texture height in metres
  const laneV = LANES.map(z => (z + TW + SPAN) / VT);
  const dirt = TX.dirtTexture(dirtCol, laneV, def.id.length * 31, { top: [SPAN / VT, (SPAN + 2 * TW) / VT], metres: VT });
  keep(dirt.map); keep(dirt.bump);
  const U = 8; // metres per texture repeat along the track
  {
    const TOPN = 12, SHN = 8;
    // +2: a skirt at each foot that digs below the venue ground, so no gap
    // can open between the berm and the ground beside it.
    const W = TOPN + 1 + 2 * SHN + 2;
    const inner = TW - SH_IN;
    const smooth = (u) => u * u * (3 - 2 * u);
    const pos = [], uv = [], col = [], idx = [];
    const zs = new Float32Array(W), ys = new Float32Array(W), vs = new Float32Array(W), ao = new Float32Array(W);
    for (let i = 0; i < n; i++) {
      const x = track.xs[i], y = track.ys[i], H = Math.max(0.3, y - base[i]), run = runOf(H);
      let k = 0;
      zs[k] = -inner - run - 0.8; ys[k] = base[i] - 0.6; ao[k] = 0.55; k++;
      for (let s = SHN; s >= 1; s--, k++) { const u = s / SHN; zs[k] = -inner - run * u; ys[k] = y - H * smooth(u); ao[k] = 1 - 0.4 * u * u; }
      for (let s = 0; s <= TOPN; s++, k++) { const t = s / TOPN; zs[k] = -inner + 2 * inner * t; ys[k] = y + Math.sin(t * Math.PI) * 0.06; ao[k] = 1; }
      for (let s = 1; s <= SHN; s++, k++) { const u = s / SHN; zs[k] = inner + run * u; ys[k] = y - H * smooth(u); ao[k] = 1 - 0.4 * u * u; }
      zs[k] = inner + run + 0.8; ys[k] = base[i] - 0.6; ao[k] = 0.55; k++;
      // v in metres: straight z on the top, arc length down each shoulder.
      const t0 = SHN + 1, t1 = SHN + 1 + TOPN;
      for (let q = t0; q <= t1; q++) vs[q] = zs[q] + TW + SPAN;
      for (let q = t0 - 1; q >= 0; q--) vs[q] = vs[q + 1] - Math.hypot(zs[q + 1] - zs[q], ys[q + 1] - ys[q]);
      for (let q = t1 + 1; q < W; q++) vs[q] = vs[q - 1] + Math.hypot(zs[q] - zs[q - 1], ys[q] - ys[q - 1]);
      for (let q = 0; q < W; q++) {
        pos.push(x, ys[q], zs[q]);
        uv.push(x / U, Math.max(0.002, Math.min(0.998, vs[q] / VT)));
        col.push(ao[q], ao[q] * 0.98, ao[q] * 0.95);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < W - 1; k++) {
      const a = i * W + k, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ map: dirt.map, bumpMap: dirt.bump, bumpScale: 1.6, roughness: 0.95, vertexColors: true })));
    m.receiveShadow = true; m.castShadow = true;
    scene.add(m);
  }
  {
    // Venue ground on both sides of the berm: behind it out to the scenery,
    // and in front of it down past the bottom of the screen.
    const gtex = keep(T.groundTex === 'sand' ? TX.sandTexture(new THREE.Color(T.ground)) : TX.grassTexture(new THREE.Color(T.ground)));
    const gmat = keep(new THREE.MeshStandardMaterial({ map: gtex, vertexColors: true, roughness: 1 }));
    const xa = track.minX - 150, xb = track.endX + 200, step = 3;
    const nx = Math.ceil((xb - xa) / step) + 1;
    const build = (rows, sign) => {
      const pos = [], uv = [], idx = [], col = [];
      for (let i = 0; i < nx; i++) {
        const x = xa + i * step;
        rows.forEach((z, r) => {
          // Row 0 starts hidden under the berm (the berm's skirt digs below it).
          const zz = r === 0 ? sign * (TW - SH_IN) : z;
          pos.push(x, groundAt(x, zz) - (r === 0 ? 0.45 : 0), zz);
          const us = sign > 0 ? 5 : 9;
          uv.push(x / us, zz / us);
          // Darker at the foot of the berm (contact occlusion), large soft
          // patches so distant ground never shows a tiling grid, and a darker
          // foreground so the eye goes to the track.
          let shade = r === 0 ? 0.62 : r === 1 ? 0.85 : 1;
          if (sign > 0) shade *= r >= 3 ? 0.72 : 0.85;
          const patch = 0.9 + 0.1 * smoothNoise(x * 0.8 + zz * 1.7, 7);
          col.push(shade * patch, shade * (patch * 0.97 + 0.03), shade * patch);
        });
      }
      const Wr = rows.length;
      for (let i = 0; i < nx - 1; i++) for (let k = 0; k < Wr - 1; k++) {
        const a = i * Wr + k, b = a + 1, c = a + Wr, d = c + 1;
        if (sign < 0) idx.push(a, c, d, a, d, b); else idx.push(a, d, c, a, b, d);
      }
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, gmat);
      m.receiveShadow = true;
      scene.add(m);
    };
    build([0, -TW - 6, -TW - 8, -14, -20, -30, -45, -70, -110], -1);
    build([0, TW + 6, TW + 9, TW + 14, TW + 22, TW + 40], 1);
  }

  // ---------- Background layers (parallax) ----------
  const layers = [];
  const addLayer = (obj, factor) => { scene.add(obj); layers.push({ obj, factor, baseX: obj.position.x, baseY: obj.position.y }); };
  const span = (track.endX - track.minX) + 600;
  const midX = (track.endX + track.minX) / 2;
  function ridge(L, profile, opts = {}) {
    const w = span * (1 - L.factor) + 500;
    const seg = Math.ceil(w / (opts.step || 6));
    const pos = [], col = [], idx = [], uv = [];
    // Far layers sit beyond the fog's end, so they skip scene fog and are
    // pre-blended toward the haze colour instead (aerial perspective).
    const far = L.factor >= 0.7;
    const c = new THREE.Color(L.color);
    if (far) c.lerp(fogCol, 0.3);
    const dark = c.clone().multiplyScalar(far ? 0.85 : 0.7);
    const yb = -60;
    for (let i = 0; i <= seg; i++) {
      const x = -w / 2 + (w * i) / seg;
      const y = profile(x);
      pos.push(x, y, 0, x, yb, 6);
      uv.push(x / 25, y / 25, x / 25, yb / 25);
      col.push(c.r, c.g, c.b, dark.r, dark.g, dark.b);
    }
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, map: opts.map || null, fog: !far }));
    const m = new THREE.Mesh(g, mat);
    const grp = new THREE.Group();
    grp.add(m);
    grp.position.set(midX * (1 - L.factor), track.minY - 2, L.z);
    addLayer(grp, L.factor);
    return grp;
  }
  const rockTex = keep(TX.rockTexture(new THREE.Color(T.dirt).lerp(new THREE.Color('#ffffff'), 0.25)));
  for (const L of T.layers) {
    const sd = L.z * 0.37;
    if (L.kind === 'hills') ridge(L, (x) => L.h * (0.55 + 0.45 * smoothNoise(x * 0.6, sd)));
    else if (L.kind === 'mountains') ridge(L, (x) => L.h * (0.45 + 0.4 * Math.abs(Math.sin(x * 0.012 + sd)) + 0.15 * smoothNoise(x * 2, sd)), { step: 10 });
    else if (L.kind === 'dunes') ridge(L, (x) => L.h * (0.5 + 0.5 * Math.sin(x * 0.035 + sd) * Math.sin(x * 0.011 + sd)));
    else if (L.kind === 'mesas' || L.kind === 'canyon') {
      // Flat-topped plateaus with steep sides.
      const r2 = rng(Math.abs(L.z) | 0);
      const blocks = [];
      let x = -span;
      while (x < span) { const w = 20 + r2() * 70, gap = 10 + r2() * 50; blocks.push([x, x + w, L.h * (0.6 + r2() * 0.5)]); x += w + gap * (L.kind === 'canyon' ? 0.15 : 1); }
      ridge(L, (px) => {
        let y = L.kind === 'canyon' ? L.h * 0.35 : 0;
        for (const [a, b, h] of blocks) {
          const e = Math.min(px - a, b - px);
          if (e > -6) y = Math.max(y, h * Math.min(1, (e + 6) / 6) + (r2() - 0.5) * 0.6);
        }
        return y;
      }, { step: 2, map: rockTex });
    } else if (L.kind === 'treeline') {
      // A dense band of small trees along the horizon breaks up the field.
      const r2 = rng(Math.abs(L.z) * 7 | 0);
      const geo = keep(L.pine ? new THREE.ConeGeometry(1.4, 5.5, 6).translate(0, 2.75, 0) : new THREE.IcosahedronGeometry(2.2, 1).translate(0, 2.4, 0));
      const xs0 = track.minX - 160, xs1 = track.endX + 220;
      const count = Math.ceil((xs1 - xs0) / 2.2) * 2;
      const inst = new THREE.InstancedMesh(geo, keep(new THREE.MeshLambertMaterial({ color: L.color })), count);
      const mt = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(), pp = new THREE.Vector3(), cc = new THREE.Color();
      let k = 0;
      for (let x = xs0; x < xs1 && k < count; x += 1.2 + r2() * 2) {
        for (let row = 0; row < 2 && k < count; row++) {
          const z = L.z - row * 6 - r2() * 4, sc = 0.8 + r2() * 0.7;
          pp.set(x, groundAt(x, z) - 0.3, z); ss.set(sc, sc * (0.85 + r2() * 0.4), sc);
          mt.compose(pp, qq, ss); inst.setMatrixAt(k, mt);
          inst.setColorAt(k, cc.set(L.color).offsetHSL((r2() - 0.5) * 0.04, 0, (r2() - 0.5) * 0.12));
          k++;
        }
      }
      inst.count = k;
      scene.add(inst);
    } else if (L.kind === 'city') {
      // Distant city lights behind the stadium.
      const r2 = rng(5);
      ridge(L, (px) => ((Math.floor(px / 9) * 7919) % 13) / 13 * L.h * (0.4 + 0.6 * r2()), { step: 3 });
    }
  }

  // Clouds (day themes).
  if (T.props.clouds) {
    const cloudMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc8d4e0, fog: false }));
    const cloudGeo = keep(new THREE.IcosahedronGeometry(1, 1));
    const clouds = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      const parts = 4 + Math.floor(R() * 4);
      for (let p = 0; p < parts; p++) {
        const m = new THREE.Mesh(cloudGeo, cloudMat);
        const s = 4 + R() * 5;
        m.scale.set(s * 1.6, s * 0.8, s);
        m.position.set(p * 6 - parts * 3 + R() * 3, R() * 3, R() * 4);
        c.add(m);
      }
      c.position.set(-500 + i * 80 + R() * 40, 32 + R() * 26, -320);
      clouds.add(c);
    }
    clouds.position.y = track.minY;
    addLayer(clouds, 0.92);
    layers[layers.length - 1].drift = 1.2;
  }

  // ---------- Scenery behind the track ----------
  const accent = T.accent.map(c => new THREE.Color(c));
  const finishX = track.finishX;
  const fenceZ = (x) => -(outerAt(x) + 1.0);

  // Trees / cacti (instanced).
  if (T.trees) {
    const spots = [];
    const density = T.trees.count;
    for (let x = track.minX - 100; x < track.endX + 150; x += (6 + R() * 10) / density) {
      const z = -20 - R() * (T.trees.kind === 'pine' ? 34 : 50);
      spots.push([x, z, 0.8 + R() * 0.8]);
    }
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const trunkG = keep(new THREE.CylinderGeometry(0.16, 0.24, 1.8, 6)); trunkG.translate(0, 0.9, 0);
    const trunk = new THREE.InstancedMesh(trunkG, keep(new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 1 })), spots.length);
    let foliage;
    if (T.trees.kind === 'cactus') {
      const g = keep(new THREE.CapsuleGeometry(0.28, 2.4, 4, 8)); g.translate(0, 1.4, 0);
      foliage = new THREE.InstancedMesh(g, keep(new THREE.MeshStandardMaterial({ color: T.trees.color, roughness: 0.8 })), spots.length);
    } else {
      const g = keep(new THREE.ConeGeometry(1.5, 4.6, 7)); g.translate(0, 3.6, 0);
      foliage = new THREE.InstancedMesh(g, keep(new THREE.MeshStandardMaterial({ color: T.trees.color, roughness: 0.9 })), spots.length);
    }
    const round = T.trees.kind === 'mixed'
      ? new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1.8, 1).translate(0, 3.2, 0)), keep(new THREE.MeshStandardMaterial({ color: 0x47a73c, roughness: 0.9 })), spots.length)
      : null;
    let ri = 0, fi = 0;
    spots.forEach(([x, z, sc], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6);
      s.set(sc, sc * (0.9 + R() * 0.4), sc); p.set(x, groundAt(x, z) - 0.1, z);
      mtx.compose(p, q, s);
      trunk.setMatrixAt(i, mtx);
      if (round && R() < 0.45) round.setMatrixAt(ri++, mtx); else foliage.setMatrixAt(fi++, mtx);
    });
    foliage.count = fi; if (round) round.count = ri;
    if (T.trees.kind === 'cactus') trunk.count = 0;
    for (const m of [trunk, foliage, round].filter(Boolean)) { m.castShadow = !quality.mobile; m.receiveShadow = true; scene.add(m); }
  }

  // Boulders scattered over the venue ground (desert and canyon).
  if (T.props.rocks) {
    const rockM = keep(new THREE.MeshStandardMaterial({ map: rockTex, color: 0xffffff, roughness: 0.95, flatShading: true }));
    const geo = keep(new THREE.DodecahedronGeometry(1, 0));
    const spots = [];
    for (let x = track.minX - 60; x < track.endX + 120; x += (3 + R() * 9) / T.props.rocks) {
      const z = -(TW + 9) - R() * 40;
      spots.push([x, z, 0.4 + R() * R() * 2.6]);
    }
    const inst = new THREE.InstancedMesh(geo, rockM, spots.length);
    const mt = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), ss = new THREE.Vector3(), pp = new THREE.Vector3();
    spots.forEach(([x, z, sc], i) => {
      ee.set(R() * 3, R() * 3, R() * 3); qq.setFromEuler(ee);
      ss.set(sc * (1 + R() * 0.6), sc * (0.55 + R() * 0.4), sc * (1 + R() * 0.5));
      pp.set(x, groundAt(x, z) + sc * 0.2, z);
      inst.setMatrixAt(i, mt.compose(pp, qq, ss));
    });
    inst.castShadow = !quality.mobile; inst.receiveShadow = true;
    scene.add(inst);
  }

  // Fence with banners along the back edge (or arena boards at night).
  const bannerG = keep(new THREE.PlaneGeometry(6, 0.95));
  let bi = 0;
  const bannerMats = SPONSORS.map(([t, bg, fg], i) => keep(new THREE.MeshStandardMaterial({ map: keep(TX.bannerTexture(t, bg, fg, i % 3)), roughness: 0.6 })));
  {
    const postG = keep(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6)); postG.translate(0, 0.7, 0);
    const posts = [];
    for (let x = track.minX + 5; x < track.endX; x += 3) posts.push(x);
    if (T.props.fence) {
      const inst = new THREE.InstancedMesh(postG, keep(new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 0.6, roughness: 0.4 })), posts.length);
      const m4 = new THREE.Matrix4();
      posts.forEach((x, i) => { m4.makeTranslation(x, groundAt(x, fenceZ(x)), fenceZ(x)); inst.setMatrixAt(i, m4); });
      inst.castShadow = true; scene.add(inst);
      // Mesh panels as one strip following the ground.
      const ft = keep(TX.fenceTexture());
      const pos = [], uv = [], idx = [];
      posts.forEach((x, i) => {
        const z = fenceZ(x), y = groundAt(x, z);
        pos.push(x, y + 0.1, z, x, y + 1.3, z);
        uv.push(i * 0.75, 0, i * 0.75, 1);
      });
      for (let i = 0; i < posts.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const fm = new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 })));
      scene.add(fm);
    }
    // Banners every few metres, mounted on the fence / boards.
    const boardH = T.props.boards ? 1.1 : 0.95;
    for (let x = track.minX + 10; x < track.endX; x += T.props.boards ? 6.1 : 9 + R() * 12) {
      const z = fenceZ(x) + 0.03;
      const y = Math.min(groundAt(x - 3, z), groundAt(x + 3, z));
      const b = new THREE.Mesh(bannerG, bannerMats[bi++ % bannerMats.length]);
      b.position.set(x, y + 0.2 + boardH / 2, z);
      b.scale.y = boardH / 0.95;
      b.receiveShadow = true;
      scene.add(b);
      if (T.props.boards) {
        const back = new THREE.Mesh(keep(new THREE.BoxGeometry(6.1, boardH + 0.3, 0.12)), keep(new THREE.MeshStandardMaterial({ color: 0x20242e })));
        back.position.set(x, y + 0.15 + boardH / 2, z - 0.08); scene.add(back);
      }
    }
  }

  // Tyre stacks near jumps.
  if (T.props.tyres) {
    const tyreG = keep(new THREE.TorusGeometry(0.32, 0.13, 8, 16)); tyreG.rotateX(Math.PI / 2);
    const spots = [];
    for (const lip of track.lips) spots.push(lip - 4, lip + 9);
    const count = spots.length * 4;
    const inst = new THREE.InstancedMesh(tyreG, keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })), count);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    let k = 0;
    for (const x of spots) {
      const z = -(outerAt(x) + 0.4), y = groundAt(x, z);
      const h = 2 + ((R() * 3) | 0);
      for (let i = 0; i < h && k < count; i++) {
        m4.makeTranslation(x + (R() - 0.5) * 0.05, y + 0.13 + i * 0.25, z);
        inst.setMatrixAt(k, m4);
        inst.setColorAt(k, c.set(i % 2 ? 0x1a1a1c : (R() < 0.5 ? accent[0] : 0xf0f0f0)));
        k++;
      }
    }
    inst.count = k;
    inst.castShadow = true; inst.receiveShadow = true;
    scene.add(inst);
  }

  // Flags on poles at jump lips (back edge only, so they never block the view).
  const lipFlags = [];
  if (T.props.flags) {
    const poleG = keep(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6)); poleG.translate(0, 1.2, 0);
    const flagShape = new THREE.Shape(); flagShape.moveTo(0, 0); flagShape.lineTo(0.75, -0.22); flagShape.lineTo(0, -0.45);
    const flagG = keep(new THREE.ShapeGeometry(flagShape));
    const poleM = keep(new THREE.MeshStandardMaterial({ color: 0xffffff }));
    const flagMats = accent.map(c => keep(new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.7 })));
    track.lips.forEach((lip, i) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleG, poleM); pole.castShadow = true; g.add(pole);
      const flag = new THREE.Mesh(flagG, flagMats[i % flagMats.length]); flag.position.y = 2.4; flag.castShadow = true; g.add(flag);
      g.position.set(lip, heightAt(lip) - 0.05, -(TW - 0.7));
      scene.add(g);
      lipFlags.push({ flag, phase: R() * 6 });
    });
  }

  // Marshal tents.
  if (T.props.tents) {
    const legG = keep(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 5)); legG.translate(0, 1.1, 0);
    const roofG = keep(new THREE.ConeGeometry(1.75, 0.8, 4, 1)); roofG.rotateY(Math.PI / 4);
    const valG = keep(new THREE.BoxGeometry(2.5, 0.25, 2.5));
    const legM = keep(new THREE.MeshStandardMaterial({ color: 0xcfd3da, metalness: 0.5, roughness: 0.4 }));
    for (let x = 60; x < finishX; x += 110 + R() * 40) {
      const z = fenceZ(x) - 5.5, y = groundAt(x, z);
      const g = new THREE.Group();
      const col = accent[(R() * accent.length) | 0];
      const roofM = keep(new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const l = new THREE.Mesh(legG, legM); l.position.set(dx, 0, dz); g.add(l); }
      const roof = new THREE.Mesh(roofG, roofM); roof.position.y = 2.6; roof.castShadow = true; g.add(roof);
      const val = new THREE.Mesh(valG, roofM); val.position.y = 2.1; g.add(val);
      // A marshal standing in the shade.
      const body = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.2, 0.8, 4, 8)), keep(new THREE.MeshStandardMaterial({ color: 0xff8a00 })));
      body.position.set(0.4, 0.8, 0.6); body.castShadow = true; g.add(body);
      const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.15, 10, 8)), keep(new THREE.MeshStandardMaterial({ color: 0xe0b08a })));
      head.position.set(0.4, 1.55, 0.6); g.add(head);
      g.position.set(x, y, z);
      scene.add(g);
    }
  }

  // Crowd stands (grandstands at intervals, or the full arena at night).
  const crowdPeople = [];
  function grandstand(xa, xb, z0, tiers, roof, wall) {
    const y0 = Math.min(groundAt(xa, z0), groundAt(xb, z0), groundAt((xa + xb) / 2, z0));
    const concrete = keep(new THREE.MeshStandardMaterial({ color: T.night ? 0x4a5060 : 0xb8bcc4, roughness: 0.9 }));
    const len = xb - xa;
    for (let t = 0; t < tiers; t++) {
      const step = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 0.5 + t * 0.55, 0.9)), concrete);
      step.position.set((xa + xb) / 2, y0 + (0.5 + t * 0.55) / 2, z0 - t * 0.9);
      step.receiveShadow = true; step.castShadow = !quality.mobile;
      scene.add(step);
      for (let x = xa + 0.4; x < xb - 0.3; x += 0.62 + R() * 0.3) {
        if (R() < 0.12) continue;
        crowdPeople.push([x, y0 + 0.5 + t * 0.55, z0 - t * 0.9 + 0.05]);
      }
    }
    if (wall) {
      // Arena: a tall back wall closes the bowl, with a lit rim on top.
      const h = tiers * 0.55 + 7;
      const w = new THREE.Mesh(keep(new THREE.BoxGeometry(len, h, 0.6)), keep(new THREE.MeshStandardMaterial({ color: 0x252a3a, roughness: 0.9 })));
      w.position.set((xa + xb) / 2, y0 + h / 2, z0 - tiers * 0.9 - 0.4);
      scene.add(w);
      const rim = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 0.35, 0.2)), keep(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: accent[(xa / 60 & 1) ? 1 : 0], emissiveIntensity: 1.6 })));
      rim.position.set((xa + xb) / 2, y0 + tiers * 0.55 + 0.9, z0 - tiers * 0.9 + 0.2);
      scene.add(rim);
      // Sponsor boards along the upper wall.
      for (let bx = xa + 6; bx < xb - 3; bx += 12) {
        const bd = new THREE.Mesh(bannerG, bannerMats[bi++ % bannerMats.length]);
        bd.position.set(bx, y0 + tiers * 0.55 + 3.2, z0 - tiers * 0.9 - 0.05);
        bd.scale.set(1.4, 1.6, 1);
        scene.add(bd);
      }
    }
    if (roof) {
      const top = y0 + tiers * 0.55 + 2.6;
      const r = new THREE.Mesh(keep(new THREE.BoxGeometry(len + 1, 0.15, tiers * 0.9 + 1.5)), keep(new THREE.MeshStandardMaterial({ color: accent[0], roughness: 0.6 })));
      r.position.set((xa + xb) / 2, top, z0 - tiers * 0.45 + 0.2); r.castShadow = true;
      scene.add(r);
      for (let x = xa; x <= xb; x += len / 4) {
        const p = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.08, 0.08, top - y0, 6)), concrete);
        p.position.set(x, y0 + (top - y0) / 2, z0 - tiers * 0.9 + 0.3); scene.add(p);
      }
    }
  }
  if (T.layers.some(L => L.kind === 'stadium')) {
    for (let x = track.minX - 40; x < track.endX + 80; x += 60) grandstand(x, x + 60, -(TW + 19), 13, false, true);
  } else {
    const nS = T.props.stands;
    for (let i = 0; i < nS; i++) {
      const x = track.startX + 20 + (i + 0.5) * (finishX / Math.max(1, nS)) * 0.95;
      grandstand(x - 22, x + 22, -40, 7, true);
    }
    // Finish grandstand.
    if (nS) grandstand(finishX - 28, finishX + 28, -40, 8, true);
  }
  if (crowdPeople.length) {
    const g = keep(new THREE.CapsuleGeometry(0.17, 0.35, 3, 6)); g.translate(0, 0.38, 0);
    const hg = keep(new THREE.SphereGeometry(0.11, 6, 5)); hg.translate(0, 0.8, 0);
    const bodies = new THREE.InstancedMesh(g, keep(new THREE.MeshLambertMaterial({ color: 0xffffff })), crowdPeople.length);
    const heads = new THREE.InstancedMesh(hg, keep(new THREE.MeshLambertMaterial({ color: 0xffffff })), crowdPeople.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const skins = [0xf1c7a1, 0xd9a07a, 0xa86e4a, 0x6e4630, 0xe7b48c];
    const shirts = [...T.accent, '#ffffff', '#222222', '#3a6fe0', '#e04a3a', '#f2d23a', '#38b04a'];
    crowdPeople.forEach(([x, y, z], i) => {
      m4.makeTranslation(x, y, z);
      bodies.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
      bodies.setColorAt(i, c.set(shirts[(R() * shirts.length) | 0]).multiplyScalar(T.night ? 0.4 : 0.9));
      heads.setColorAt(i, c.set(skins[(R() * skins.length) | 0]));
    });
    scene.add(bodies, heads);
    crowd = { bodies, heads, people: crowdPeople, phase: crowdPeople.map(() => R() * 6) };
  }

  // Floodlight towers (night).
  if (T.props.floodlights) {
    const poleM = keep(new THREE.MeshStandardMaterial({ color: 0x5a606c, metalness: 0.6, roughness: 0.4 }));
    const lampM = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 3 }));
    const glowMat = keep(new THREE.SpriteMaterial({ map: keep(TX.glowTexture()), color: 0xdfe8ff, transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    for (let x = track.minX + 20; x < track.endX; x += 70) {
      const z = -(TW + 22), y = groundAt(x, z);
      const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.25, 0.4, 26, 8)), poleM);
      pole.position.set(x, y + 13, z); scene.add(pole);
      const head = new THREE.Mesh(keep(new THREE.BoxGeometry(4, 2, 0.4)), poleM);
      head.position.set(x, y + 26, z + 0.4); head.rotation.x = 0.35; scene.add(head);
      const halo = new THREE.Sprite(glowMat);
      halo.scale.set(16, 10, 1);
      halo.position.set(x, y + 26, z + 1.2);
      scene.add(halo);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
        const l = new THREE.Mesh(keep(new THREE.CircleGeometry(0.42, 12)), lampM);
        l.position.set(x - 1.3 + a * 1.3, y + 25.5 + b * 0.9, z + 0.75); l.rotation.x = -0.35;
        scene.add(l);
      }
    }
  }

  // Start gate (frame behind the riders, one drop plate per lane).
  const gateX = track.startX + 1.35;
  const gatePlates = [];
  {
    const y = heightAt(gateX);
    const frameM = keep(new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.6, roughness: 0.4 }));
    const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(0.15, 0.12, (TW - 0.6) * 2)), frameM);
    beam.position.set(gateX, y + 0.05, 0); scene.add(beam);
    const pillarG = keep(new THREE.BoxGeometry(0.18, 2.6, 0.18)); pillarG.translate(0, 1.3, 0);
    const p = new THREE.Mesh(pillarG, frameM); p.position.set(gateX - 0.5, y, -(TW - 0.5)); p.castShadow = true; scene.add(p);
    const top = new THREE.Mesh(keep(new THREE.BoxGeometry(1.6, 0.7, 0.12)), bannerMats[0]);
    top.position.set(gateX - 0.5, y + 2.7, -(TW - 0.5)); scene.add(top);
    const plateG = keep(new THREE.BoxGeometry(0.06, 0.6, 1.3)); plateG.translate(0, 0.3, 0);
    const plateM = keep(new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 }));
    for (const z of LANES) {
      const pl = new THREE.Mesh(plateG, plateM);
      pl.position.set(gateX, y + 0.1, z); pl.castShadow = true;
      scene.add(pl); gatePlates.push(pl);
    }
  }
  // Finish gantry, cantilevered from the back so nothing sits in front of the riders.
  {
    const fx = finishX, y = heightAt(fx);
    const postM = keep(new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.3, roughness: 0.5 }));
    const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, 5.4, 0.4)), postM);
    post.position.set(fx, y + 2.7, -(TW - 0.4)); post.castShadow = true; scene.add(post);
    const arm = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 0.3, TW * 2 - 0.6)), postM);
    arm.position.set(fx, y + 5.2, -0.3); arm.castShadow = true; scene.add(arm);
    const banner = new THREE.Mesh(keep(new THREE.PlaneGeometry(TW * 2 - 1.0, 1.0)), keep(new THREE.MeshStandardMaterial({ map: keep(TX.checkerTexture('FINISH')), side: THREE.DoubleSide })));
    banner.rotation.y = Math.PI / 2; banner.position.set(fx + 0.05, y + 4.5, -0.3);
    scene.add(banner);
    const line = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.9, (TW - 0.6) * 2)), keep(new THREE.MeshStandardMaterial({ map: keep(TX.checkerTexture('')), roughness: 0.9 })));
    line.rotation.x = -Math.PI / 2; line.position.set(fx, y + 0.06, 0); line.receiveShadow = true;
    scene.add(line);
  }

  // ---------- Bikes and riders ----------
  const bikes = race.bikes.map((b, i) => {
    const bike = makeBikeModel(RIDERS[i], b.kind);
    const rider = makeRiderModel(RIDERS[i]);
    scene.add(bike.root, rider.group);
    if (quality.mobile && i > 0) for (const o of [bike.root, rider.group]) o.traverse(m => { if (m.isMesh) m.castShadow = false; });
    return { bike, rider, crouch: 0, crouchV: 0 };
  });
  const snap = () => race.bikes.map(b => ({
    c: { x: b.chassis.getPosition().x, y: b.chassis.getPosition().y, a: b.chassis.getAngle() },
    r: { x: b.rear.getPosition().x, y: b.rear.getPosition().y, a: b.rear.getAngle() },
    f: { x: b.front.getPosition().x, y: b.front.getPosition().y, a: b.front.getAngle() },
  }));
  let prev = snap(), curr = prev;

  // ---------- Particles ----------
  const MAXP = quality.mobile ? 260 : 600;
  const pGeo = keep(new THREE.DodecahedronGeometry(0.06, 0));
  const pMesh = new THREE.InstancedMesh(pGeo, keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })), MAXP);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  pMesh.castShadow = false;
  scene.add(pMesh);
  const P = Array.from({ length: MAXP }, () => ({ life: 0 }));
  let pNext = 0;
  const pColor = new THREE.Color();
  const dirtHex = dirtCol.getHex();
  const emit = (x, y, z, vx, vy, vz, life, s) => {
    const i = pNext; pNext = (pNext + 1) % MAXP;
    Object.assign(P[i], { x, y, z, vx, vy, vz, life, max: life, s, rot: Math.random() * 6 });
    pColor.set(dirtHex).offsetHSL(0, 0, (Math.random() - 0.6) * 0.2);
    pMesh.setColorAt(i, pColor);
  };
  const MAXD = 100;
  // Dust: soft camera-facing puffs (the camera looks down -z, so flat XY
  // quads face it). A radial-gradient texture keeps the edges feathered.
  const puffTex = keep(TX.puffTexture());
  const dMesh = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(1.3, 1.3)),
    keep(new THREE.MeshLambertMaterial({ color: dirtCol.clone().lerp(new THREE.Color(0xffffff), 0.5), map: puffTex, transparent: true, opacity: 0.6, depthWrite: false })), MAXD);
  dMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dMesh.frustumCulled = false;
  scene.add(dMesh);
  const D = Array.from({ length: MAXD }, () => ({ life: 0 }));
  let dNext = 0;
  const dust = (x, y, z, vx, vy, s) => { const d = D[dNext]; dNext = (dNext + 1) % MAXD; Object.assign(d, { x, y, z: z + 0.6, vx, vy, life: 0.9 + Math.random() * 0.6, max: 1.4, s, rot: Math.random() * 6 }); };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(), e4 = new THREE.Euler();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAXP; i++) { pMesh.setMatrixAt(i, zero); pMesh.setColorAt(i, pColor.set(dirtHex)); }
  for (let i = 0; i < MAXD; i++) dMesh.setMatrixAt(i, zero);

  function onEvents(events) {
    for (const e of events) {
      const b = race.bikes[e.bike];
      const z = LANES[e.bike];
      if (e.type === 'land') {
        const k = Math.min(1, e.impact / 12);
        bikes[e.bike].crouchV += 2 + e.impact * 0.6;
        for (const w of [b.rear, b.front]) {
          const p = w.getPosition();
          for (let i = 0; i < 2 + k * 5; i++) dust(p.x + (Math.random() - 0.5), p.y - 0.3, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 3, Math.random() * 1.2, 0.5 + k * 0.8);
          for (let i = 0; i < 5 + k * 12; i++) emit(p.x, p.y - 0.32, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 5, 1.5 + Math.random() * 4 * (0.4 + k), (Math.random() - 0.5) * 2, 0.8, 1);
        }
      } else if (e.type === 'crash') {
        for (let i = 0; i < 12; i++) dust(e.x + (Math.random() - 0.5) * 2, e.y, z + (Math.random() - 0.5), (Math.random() - 0.5) * 4, Math.random() * 2, 1.1);
        for (let i = 0; i < 30; i++) emit(e.x, e.y, z, (Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 3, 1.1, 1.3);
      } else if (e.type === 'respawn') {
        const p = b.chassis.getPosition();
        for (let i = 0; i < 8; i++) dust(p.x + (Math.random() - 0.5) * 2, p.y - 0.5, z, (Math.random() - 0.5) * 2, Math.random(), 0.7);
      }
    }
  }

  function afterStep() {
    prev = curr;
    curr = snap();
    onEvents(race.events);
    race.bikes.forEach((b, i) => {
      if (!b.rearContact || b.crashed || b.input.throttle <= 0) return;
      if (i > 0 && Math.random() < 0.5) return;
      const p = b.rear.getPosition();
      const v = b.chassis.getLinearVelocity();
      const spin = Math.abs(b.rear.getAngularVelocity()) * 0.36;
      const slip = Math.max(0, spin - Math.abs(v.x));
      const rate = 0.45 + Math.min(1.2, slip * 0.2) + (Math.abs(v.x) < 8 ? 0.5 : 0);
      const nEmit = rate > 1 ? 2 : Math.random() < rate ? 1 : 0;
      for (let k = 0; k < nEmit; k++) {
        emit(p.x - 0.3, p.y - 0.3, LANES[i] + (Math.random() - 0.5) * 0.3,
          v.x * 0.35 - 2.5 - Math.random() * 4 - slip * 0.4, 1.2 + Math.random() * 3.2, (Math.random() - 0.5) * 1.5, 0.75, 0.7 + Math.random() * 0.7);
      }
      if (Math.random() < 0.08) dust(p.x - 0.5, p.y - 0.25, LANES[i], v.x * 0.2 - 1, 0.4, 0.45);
    });
  }

  let time = 0;
  const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  function toLocal(c, px, py) {
    const dx = px - c.x, dy = py - c.y, cs = Math.cos(c.a), sn = Math.sin(c.a);
    return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs };
  }

  // ---------- Optional AO post-processing (desktop) ----------
  let composer = null, aoFailed = !quality.ao;
  function makeComposer(camera) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const size = renderer.getSize(new THREE.Vector2());
      const ao = new GTAOPass(scene, camera, size.x, size.y);
      ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      ao.blendIntensity = 0.8;
      composer.addPass(ao);
      composer.addPass(new OutputPass());
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(size.x, size.y);
    } catch (e) {
      console.warn('AO disabled:', e.message);
      composer = null; aoFailed = true;
    }
  }

  function draw(alpha, dt, camera, gateDrop) {
    time += dt;
    race.bikes.forEach((b, i) => {
      const p = prev[i], c = curr[i];
      const L = (o) => ({ x: p[o].x + (c[o].x - p[o].x) * alpha, y: p[o].y + (c[o].y - p[o].y) * alpha, a: lerpAngle(p[o].a, c[o].a, alpha) });
      const ch = L('c'), rw = L('r'), fw = L('f');
      const v = bikes[i];
      const z = LANES[i];
      v.bike.root.position.set(ch.x, ch.y, z);
      v.bike.root.rotation.z = ch.a;
      const rl = toLocal(ch, rw.x, rw.y), fl = toLocal(ch, fw.x, fw.y);
      // The physics wheel joints have springs but no travel limit, so an
      // upside-down crashed bike can stretch its wheels away. Draw them within
      // realistic suspension travel.
      rl.y = Math.max(-0.62, Math.min(-0.24, rl.y)); rl.x = Math.max(-0.8, Math.min(-0.64, rl.x));
      fl.y = Math.max(-0.62, Math.min(-0.24, fl.y)); fl.x = Math.max(0.66, Math.min(0.84, fl.x));
      poseBike(v.bike, rl, fl, rw.a - ch.a, fw.a - ch.a);
      // Landing absorption: a damped spring on the rider's crouch.
      const comp = Math.max(0, (-0.42 - (rl.y + fl.y) / 2)) * 2; // suspension compression
      v.crouchV += (-v.crouch * 70 - v.crouchV * 11) * dt;
      v.crouch += v.crouchV * dt * 0.06;
      const crouch = Math.max(-0.2, Math.min(1, v.crouch + comp * 0.8 + (b.grounded ? 0 : -0.1)));
      if (b.ragdoll) {
        const j = ragdollJoints(b.ragdoll);
        j.headAngle = j.torsoAngle - Math.PI / 2 + 0.6;
        poseRider(v.rider, j, z, j.torsoAngle - Math.PI / 2);
      } else {
        const pose = riderPose(b.leanVisual, crouch);
        const j = {};
        for (const k of ['hip', 'knee', 'foot', 'shoulder', 'elbow', 'hand', 'head']) j[k] = toWorld(pose[k], ch.x, ch.y, ch.a);
        j.headAngle = ch.a + 0.05;
        poseRider(v.rider, j, z, ch.a);
      }
      const blink = b.crashed && b.crashTimer < 0.35 && Math.floor(time * 16) % 2 === 0;
      v.bike.root.visible = v.rider.group.visible = !blink && !(b.remote && b.remote.gone);
    });

    for (let i = 0; i < MAXP; i++) {
      const p = P[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= 18 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const g = track.heightAt(p.x);
      if (p.y < g && Math.abs(p.z) < TW) { p.y = g; p.vy *= -0.2; p.vx *= 0.5; }
      p.rot += dt * 8;
      if (p.life <= 0) { pMesh.setMatrixAt(i, zero); continue; }
      const s = p.s * Math.min(1, p.life / (p.max * 0.4));
      e4.set(p.rot, p.rot * 0.7, 0); q4.setFromEuler(e4);
      m4.compose(v4.set(p.x, p.y, p.z), q4, s4.set(s, s, s));
      pMesh.setMatrixAt(i, m4);
    }
    pMesh.instanceMatrix.needsUpdate = true;
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
    for (let i = 0; i < MAXD; i++) {
      const d = D[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.96; d.vy *= 0.95;
      if (d.life <= 0) { dMesh.setMatrixAt(i, zero); continue; }
      const t = 1 - d.life / d.max;
      const s = d.s * (0.5 + t * 1.6) * Math.min(1, d.life * 2.5);
      e4.set(0, 0, d.rot + t * 0.6); q4.setFromEuler(e4);
      m4.compose(v4.set(d.x, d.y, d.z), q4, s4.set(s * 1.3, s, 1));
      dMesh.setMatrixAt(i, m4);
    }
    dMesh.instanceMatrix.needsUpdate = true;

    for (const f of lipFlags) f.flag.rotation.y = Math.sin(time * 4 + f.phase) * 0.35;
    for (const g of gatePlates) g.rotation.z = -gateDrop * Math.PI * 0.5;
    if (crowd && !quality.mobile) {
      // A gentle bounce in the crowd near the camera.
      const cx = camera.position.x;
      const { bodies, heads, people, phase } = crowd;
      let changed = false;
      for (let i = 0; i < people.length; i++) {
        const [x, y, z] = people[i];
        if (Math.abs(x - cx) > 30) continue;
        const h = Math.max(0, Math.sin(time * 6 + phase[i])) * 0.08;
        m4.makeTranslation(x, y + h, z);
        bodies.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
        changed = true;
      }
      if (changed) { bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true; }
    }

    for (const l of layers) {
      l.obj.position.x = l.baseX + camera.position.x * l.factor + (l.drift ? time * l.drift : 0);
      l.obj.position.y = l.baseY + (camera.position.y - track.minY) * l.factor * 0.8;
    }
    const pl = bikes[0].bike.root.position;
    sun.position.set(pl.x + 5 + sunDir.x, pl.y + sunDir.y, sunDir.z);
    sun.target.position.set(pl.x + 5, pl.y, 0);

    if (!composer && !aoFailed) makeComposer(camera);
    if (composer) {
      composer.render(dt);
    } else {
      renderer.render(scene, camera);
    }
  }

  function setSize(w, h) {
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  }

  function dispose() {
    scene.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    for (const d of disposables) d.dispose?.();
    composer?.dispose?.();
  }

  function playerState(alpha) {
    const p = prev[0].c, c = curr[0].c;
    return { x: p.x + (c.x - p.x) * alpha, y: p.y + (c.y - p.y) * alpha };
  }

  return { scene, draw, afterStep, dispose, playerState, setSize, laneZ: LANES[0] };
}
let crowd = null;
