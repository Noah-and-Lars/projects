/* Island Front: ground detail for the Optimised graphics level (Realistic and Ultra have their own, in realistic.js and real-flora.js).
   - optTerrainMat: the terrain's material. A painted ground texture (grass strokes, clumps, soil specks) sampled at three scales, with patchy
     light and dark variation, so the ground reads as grass and earth at any distance instead of a flat colour.
   - Grass: clumps of crossed blade cards round the camera, coloured from the terrain under them, fading out at about 55 m. None on roads,
     airfield pavement, beaches or steep slopes; sparse in compounds and woods. About 13,000 clumps of 6 triangles: light enough for most computers. */
'use strict';
const OGRASS = { mesh: null, last: new V3(1e9, 0, 1e9), tex: null, R: 55, S: .95, max: 14000 };

function groundTex() { // tileable, grey (the terrain's vertex colour tints it): grass strokes, darker clumps, soil specks
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), R = rng(404);
  g.fillStyle = 'rgb(196,196,196)'; g.fillRect(0, 0, N, N);
  const wrap = (x, y, fn) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) fn(x + dx, y + dy); };
  for (let k = 0; k < 260; k++) { const x = R() * N, y = R() * N, r = 14 + R() * 60, v = 130 + R() * 100 | 0; g.fillStyle = `rgba(${v},${v},${v},.4)`; wrap(x, y, (a, b) => { g.beginPath(); g.ellipse(a, b, r, r * (.5 + R() * .5), R() * 3, 0, TAU); g.fill(); }); } // clumps and patches
  for (let k = 0; k < 7000; k++) { const x = R() * N, y = R() * N, l = 8 + R() * 18, a = -Math.PI / 2 + (R() - .5) * 1.4, v = R() < .5 ? 105 + R() * 50 | 0 : 220 + R() * 35 | 0; // blade strokes, light and dark
    g.strokeStyle = `rgba(${v},${v},${v},.6)`; g.lineWidth = 1.6 + R() * 2.2; wrap(x, y, (p, q) => { g.beginPath(); g.moveTo(p, q); g.lineTo(p + Math.cos(a) * l, q + Math.sin(a) * l); g.stroke(); }); }
  for (let k = 0; k < 1400; k++) { const x = R() * N, y = R() * N, v = 85 + R() * 50 | 0; g.fillStyle = `rgba(${v},${v * .92 | 0},${v * .8 | 0},.7)`; g.fillRect(x, y, 2 + R() * 4, 2 + R() * 4); } // soil and stones
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function optTerrainMat() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: OGRASS.gtex || (OGRASS.gtex = groundTex()) });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, farmUniforms(WORLD.M));
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;' + FARM_GLSL).replace('#include <map_fragment>', `
      { float d = length(vGW - cameraPosition);
        vec3 a = texture2D(map, vGW.xz / 4.0).rgb, b = texture2D(map, vGW.xz / 26.0).rgb, c = texture2D(map, vGW.xz / 150.0 + .31).rgb;
        float nearW = 1.0 - smoothstep(25.0, 140.0, d);
        vec3 tx = mix(b, a, nearW) * (c * 1.25 + .05) / .77;                         // fine detail close up, coarser further out, patches everywhere
        float mottle = texture2D(map, vGW.xz / 620.0 + .7).r;                        // big light and dark drifts across the fields
        diffuseColor.rgb *= tx * (.82 + (mottle - .77) * 1.4) * farmTint(vGW.xz, d); }`);
  };
  m.customProgramCacheKey = () => 'optTerrain' + (WORLD.M && WORLD.M.name); // (a map's own fields)
  return m;
}

/* ---------------- grass ---------------- */
function optGrassBuild() {
  if (WORLD.gfx === 'realistic' || !WORLD.group) return;
  if (!OGRASS.tex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), R = rng(51);
    for (let k = 0; k < 40; k++) { const x = 6 + R() * 116, h = 46 + R() * 80, bend = (R() - .5) * 34, w = 1.3 + R() * 2, v = 190 + R() * 65 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.moveTo(x - w, 128); g.quadraticCurveTo(x + bend * .3, 128 - h * .6, x + bend, 128 - h); g.quadraticCurveTo(x + bend * .3 + w * .3, 128 - h * .6, x + w, 128); g.fill(); }
    OGRASS.tex = new THREE.CanvasTexture(cv);
  }
  const P = [], card = a => { const c = Math.cos(a) * .45, s = Math.sin(a) * .45; return [[-c, 0, -s, 0, 0], [c, 0, s, 1, 0], [c, .5, s, 1, 1], [-c, 0, -s, 0, 0], [c, .5, s, 1, 1], [-c, .5, -s, 0, 1]]; };
  for (const a of [0, 1.05, 2.1]) P.push(...card(a));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(p => [p[0], p[1], p[2]]), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap(p => [p[3], p[4]]), 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(P.flatMap(() => [0, 1, 0]), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(P.flatMap(p => { const k = .5 + p[4] * .95; return [k, k, k]; }), 3)); // dark roots, light tips
  const mat = new THREE.MeshLambertMaterial({ map: OGRASS.tex, alphaTest: .5, side: THREE.DoubleSide, vertexColors: true });
  mat.onBeforeCompile = sh => { // fade the clumps in size towards the edge of the patch, so there is no hard line
    sh.uniforms.uCam = { value: camera.position };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uCam;').replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; transformed *= 1.0 - smoothstep(${(OGRASS.R - 14).toFixed(1)}, ${OGRASS.R.toFixed(1)}, distance(ip.xz, uCam.xz)); }`);
  };
  const ob = mat.onBeforeCompile; mat.onBeforeCompile = sh => { ob(sh); sh.fragmentShader = sh.fragmentShader.replace(/:\s*vLightBack/g, ': vLightFront').replace(/:\s*vIndirectBack/g, ': vIndirectFront'); }; // (both sides of a blade lit like the front)
  mat.customProgramCacheKey = () => 'optGrass';
  const im = new THREE.InstancedMesh(geo, mat, OGRASS.max); im.count = 0; im.frustumCulled = false; im.receiveShadow = true;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(OGRASS.max * 3), 3);
  WORLD.group.add(im); OGRASS.mesh = im; OGRASS.group = WORLD.group; OGRASS.last.set(1e9, 0, 1e9);
}
function terrainColAt(x, z, out) { // the Optimised terrain's vertex colour here (linear), bilinear
  const col = WORLD.tcol; if (!col) return out.setRGB(.2, .25, .1);
  const fx = clamp(x / CELL, 0, GW - 1.001), fz = clamp(z / CELL, 0, GH - 1.001), i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, a = (j * GW + i) * 3, b = a + 3, c = a + GW * 3, d = c + 3;
  const L = k => lerp(lerp(col[a + k], col[b + k], tx), lerp(col[c + k], col[d + k], tx), tz);
  return out.setRGB(L(0), L(1), L(2));
}
function optGrassUpdate(cam) {
  if (WORLD.gfx === 'realistic') return;
  if (!OGRASS.mesh || OGRASS.group !== WORLD.group) optGrassBuild();
  const im = OGRASS.mesh; if (!im || Math.hypot(cam.x - OGRASS.last.x, cam.z - OGRASS.last.z) < 5 || cam.y - terrainY(cam.x, cam.z) > 140) return;
  OGRASS.last.copy(cam);
  const S = OGRASS.S, R = OGRASS.R, cx = Math.floor(cam.x / S), cz = Math.floor(cam.z / S), r = Math.ceil(R / S), M = WORLD.M, dummy = OGRASS.d || (OGRASS.d = new THREE.Object3D()), col = new THREE.Color();
  const inZone = (x, z) => M.zones.some(zn => { const dx = x / 1000 - zn.x, dz = z / 1000 - zn.y, c = Math.cos(zn.ang || 0), s = Math.sin(zn.ang || 0); return Math.abs(dx * c + dz * s) < zn.hx && Math.abs(-dx * s + dz * c) < zn.hy; });
  let n = 0;
  for (let j = -r; j <= r && n < OGRASS.max; j++) for (let i = -r; i <= r && n < OGRASS.max; i++) {
    const gi = cx + i, gj = cz + j, x = (gi + hash2(gi, gj, 61)) * S, z = (gj + hash2(gi, gj, 62)) * S; if (Math.hypot(x - cam.x, z - cam.z) > R) continue;
    const h = terrainY(x, z); if (h < 3.8) continue;
    const id = Math.round(z / CELL) * GW + Math.round(x / CELL); if (M.ROAD[id] && onRoad(x, z) && roadNear(x, z)) continue;
    const sl = Math.hypot(terrainY(x + 3, z) - terrainY(x - 3, z), terrainY(x, z + 3) - terrainY(x, z - 3)) / 6; if (sl > .5) continue;
    let dens = 1 - sstep(.3, .5, sl); if (M.F[id]) dens *= .35;
    if (typeof inAirfield === 'function' && inAirfield(x, z)) { if (airPaved(x, z)) continue; dens *= .7; } else if (inZone(x, z)) dens *= .12;
    if (hash2(gi, gj, 63) > dens) continue;
    const s = .8 + hash2(gi, gj, 64) * .7, tall = .8 + hash2(gi, gj, 65) * .7;
    dummy.position.set(x, h - .03, z); dummy.rotation.set(0, hash2(gi, gj, 66) * TAU, 0); dummy.scale.set(s, s * tall, s); dummy.updateMatrix(); im.setMatrixAt(n, dummy.matrix);
    terrainColAt(x, z, col); const k = .85 + hash2(gi, gj, 67) * .35, dry = hash2(gi, gj, 68) < .1 ? .25 : 0;
    im.setColorAt(n, col.setRGB(col.r * k * 1.05 + dry * .1, col.g * k * 1.32 + dry * .06, col.b * k * .9)); n++;
  }
  im.count = n; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
}
function roadNear(x, z) { // within the road's width (the road grid cells are 27 m, too coarse for grass)
  for (const r of WORLD.M._roads) { const hw = r.main ? 5.5 : 3.6; for (let k = 0; k < r.P.length - 1; k++) { const ax = r.P[k][0] * 1000, az = r.P[k][1] * 1000, bx = r.P[k + 1][0] * 1000, bz = r.P[k + 1][1] * 1000;
    if (Math.max(ax, bx) + hw < x || Math.min(ax, bx) - hw > x || Math.max(az, bz) + hw < z || Math.min(az, bz) - hw > z) continue;
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); if (Math.hypot(ax + dx * t - x, az + dz * t - z) < hw) return true; } }
  return false;
}

/* ---------------- farmland: one field layout for every graphics level ----------------
   Each frame is a grid of fields (160 m by 110 m, turned by a) round a centre: the field systems round each village (from 260 m to 1300 m out),
   and isolated farms spread over the open lowland. Kept off bases, checkpoints, airfields, woods, water and steep ground.
   cropAtFrames: 0 none, 1 ploughed, 2 wheat, 3 young crop, 4 pasture (and the field grid's angle in .ang). */
const FIELD_U = 160, FIELD_V = 110;
function farmFrames(M) {
  if (M._farms) return M._farms;
  const out = M.towns.map((t, i) => ({ x: t.x * 1000, z: t.y * 1000, a: hash2(t.x * 100 | 0, t.y * 100 | 0, 9) * Math.PI, r0: 260, r1: 1300, rc: 1100, salt: 0 }));
  const R = rng((M.seed || 1) * 7 + 71), WX = GW * CELL, WZ = GH * CELL;
  const zoneDist = (x, z) => Math.min(...M.zones.map(zn => Math.hypot(x / 1000 - zn.x, z / 1000 - zn.y) * 1000 - Math.max(zn.hx, zn.hy) * 1000));
  const open = (x, z, r) => { let bad = 0, n = 0; for (let a = 0; a < TAU; a += TAU / 12) for (const f of [.35, .7, 1]) { const px = x + Math.cos(a) * r * f, pz = z + Math.sin(a) * r * f, h = terrainY(px, pz), sl = Math.hypot(terrainY(px + 8, pz) - terrainY(px - 8, pz), terrainY(px, pz + 8) - terrainY(px, pz - 8)) / 16; n++; if (h < 6 || h > 300 || sl > .22 || inForest(px, pz)) bad++; } return 1 - bad / n; };
  for (let gz = 700; gz < WZ - 700; gz += 900) for (let gx = 700; gx < WX - 700; gx += 900) {
    const x = gx + (R() - .5) * 500, z = gz + (R() - .5) * 500, r1 = 420 + R() * 380;
    if (out.some(f => Math.hypot(f.x - x, f.z - z) < f.r1 + r1 * .5)) continue;
    if (zoneDist(x, z) < r1 + 60 || open(x, z, r1) < .6) continue;
    out.push({ x, z, a: R() * Math.PI, r0: 0, r1, rc: r1 - 60, salt: out.length * 131 });
  }
  return M._farms = out;
}
function cropAtFrames(frames, x, z, out) {
  for (const t of frames) {
    const dx = x - t.x, dz = z - t.z; let d = Math.hypot(dx, dz); if (d > t.r1 + FIELD_U || d < t.r0 - FIELD_U) continue;
    const c = Math.cos(t.a), s = Math.sin(t.a), u = dx * c + dz * s, v = -dx * s + dz * c, pu = Math.floor(u / FIELD_U), pv = Math.floor(v / FIELD_V), k = hash2(pu + 500 + t.salt, pv + 500, 7);
    const dc = Math.hypot((pu + .5) * FIELD_U, (pv + .5) * FIELD_V) + (hash2(pu + 77 + t.salt, pv, 8) - .5) * 160; // whole fields only: a ragged, field-shaped edge
    if (dc > t.r1 || dc < t.r0) continue;
    d = dc;
    const edge = Math.min(Math.abs(u / FIELD_U - Math.round(u / FIELD_U)) * FIELD_U, Math.abs(v / FIELD_V - Math.round(v / FIELD_V)) * FIELD_V);
    if (out) out.ang = t.a;
    if (edge < 4) return 0; // hedgerows and lanes between fields
    return 1 + Math.floor(k * 4) * (d < t.rc ? 1 : 0);
  }
  return 0;
}

/* Field colours in the Optimised ground shader: the same frames, painted per pixel (crisp field edges instead of the 27 m colour grid). */
const FARM_MAX = 24;
function farmUniforms(M) {
  const F = farmFrames(M).slice(0, FARM_MAX), a = [], b = [];
  for (let i = 0; i < FARM_MAX; i++) { const f = F[i]; a.push(f ? new THREE.Vector4(f.x, f.z, f.a, f.r1) : new THREE.Vector4(-1e6, -1e6, 0, 0)); b.push(f ? new THREE.Vector4(f.r0, f.rc, f.salt % 997, 0) : new THREE.Vector4(0, 0, 0, 0)); }
  return { uFarmA: { value: a }, uFarmB: { value: b } };
}
const FARM_GLSL = `
  uniform vec4 uFarmA[${FARM_MAX}]; uniform vec4 uFarmB[${FARM_MAX}];
  vec3 farmTint(vec2 p, float dist) {
    for (int i = 0; i < ${FARM_MAX}; i++) {
      vec4 f = uFarmA[i], g = uFarmB[i]; vec2 d = p - f.xy; float r = length(d); if (r > f.w + 170.0 || r < g.x - 170.0) continue;
      float c = cos(f.z), s = sin(f.z), u = d.x * c + d.y * s, v = -d.x * s + d.y * c;
      vec2 cell = floor(vec2(u / ${FIELD_U}.0, v / ${FIELD_V}.0)); float k = fract(sin(dot(cell + vec2(g.z, g.z * .37), vec2(12.9898, 78.233))) * 43758.5453);
      { float dc = length((cell + .5) * vec2(${FIELD_U}.0, ${FIELD_V}.0)) + (fract(sin(dot(cell + vec2(g.z * .7, 3.1), vec2(39.3, 11.7))) * 24634.6345) - .5) * 160.0; if (dc > f.w || dc < g.x) continue; r = dc; } // whole fields only
      float edge = min(abs(u / ${FIELD_U}.0 - floor(u / ${FIELD_U}.0 + .5)) * ${FIELD_U}.0, abs(v / ${FIELD_V}.0 - floor(v / ${FIELD_V}.0 + .5)) * ${FIELD_V}.0);
      float hedge = 1.0 - smoothstep(1.5, 4.0, edge), fadeRows = 1.0 - smoothstep(150.0, 700.0, dist), soften = .85;
      float type = r < g.y ? 1.0 + floor(k * 4.0) : 1.0;
      vec3 t = vec3(1.0);
      if (type < 1.5) { float fur = sin(u * 6.0) * .5 + .5; t = vec3(.78, .64, .5) * mix(1.0, .84 + .26 * fur, fadeRows); }            // ploughed: brown soil and furrows
      else if (type < 2.5) { t = vec3(1.16, 1.02, .66) * mix(1.0, .94 + .1 * (sin(u * 22.0) * .5 + .5), fadeRows); }                   // wheat
      else if (type < 3.5) { float row = smoothstep(.55, .85, sin(v * 10.0) * .5 + .5); t = mix(vec3(.8, .68, .54), vec3(.72, .92, .58), mix(.45, row, fadeRows)); } // young crop in rows
      else { t = vec3(.9, 1.04, .8); }                                                                                               // pasture
      t = mix(t, vec3(.62, .74, .5), hedge * .8);                                                                                    // hedge line or grass strip
      return mix(vec3(1.0), t, soften);
    }
    return vec3(1.0);
  }`;

/* Hedgerows for Optimised: rounded green boxes along about a third of the field boundaries, instanced per 600 m patch and culled by distance. */
const OHEDGE = { patches: [], R: 1600 };
function optHedgesBuild(M) {
  OHEDGE.patches = []; if (WORLD.gfx === 'realistic') return;
  const geo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 1); { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i), z = p.getZ(i); p.setXYZ(i, x * (1 - (y + .5) * .25), y + .5, z * (1 - (y + .5) * .3)); } geo.computeVertexNormals(); } // tapering, rounded top
  const mat = new THREE.MeshLambertMaterial({ color: 0x4d6233, map: OGRASS.gtex || (OGRASS.gtex = groundTex()) });
  const groups = new Map(), dummy = new THREE.Object3D(), R = rng((M.seed || 1) + 404);
  const zones = M.zones.concat(M.towns.map(t => t.zone)), inZone = (x, z) => zones.some(zn => { const dx = x / 1000 - zn.x, dz = z / 1000 - zn.y, c = Math.cos(zn.ang || 0), s = Math.sin(zn.ang || 0); return Math.abs(dx * c + dz * s) < zn.hx + .02 && Math.abs(-dx * s + dz * c) < zn.hy + .02; });
  farmFrames(M).forEach((f, fi) => {
    const c = Math.cos(f.a), s = Math.sin(f.a), W = (u, v) => [f.x + u * c - v * s, f.z + u * s + v * c], nU = Math.ceil(f.r1 / FIELD_U) + 1, nV = Math.ceil(f.r1 / FIELD_V) + 1;
    for (let pu = -nU; pu <= nU; pu++) for (let pv = -nV; pv <= nV; pv++) for (const along of [0, 1]) {
      if (hash2(pu + 300 + fi * 17, pv + 300, along ? 52 : 51) > .34) continue; // most boundaries are a grass strip
      const u0 = pu * FIELD_U, v0 = pv * FIELD_V, u1 = along ? u0 + FIELD_U : u0, v1 = along ? v0 : v0 + FIELD_V, L = Math.hypot(u1 - u0, v1 - v0), seg = 5, n = Math.floor(L / seg), gate = hash2(pu, pv, 53) * n | 0;
      for (let k = 0; k < n; k++) {
        if (Math.abs(k - gate) < 1) continue; // a gap for a gate
        const t = (k + .5) / n, [x, z] = W(lerp(u0, u1, t), lerp(v0, v1, t)), d = Math.hypot(x - f.x, z - f.z); if (d > f.r1 - 30 || d < f.r0 + 20) continue;
        const h = terrainY(x, z); if (h < 6 || inForest(x, z) || inZone(x, z) || onRoad(x, z) && roadNear(x, z)) continue;
        const sl = Math.hypot(terrainY(x + 4, z) - terrainY(x - 4, z), terrainY(x, z + 4) - terrainY(x, z - 4)) / 8; if (sl > .3) continue;
        const ht = 1.4 + R() * 1.1 + (R() < .05 ? 3 : 0); // now and then a taller thorn or holly
        dummy.position.set(x, h - .25, z); dummy.rotation.set(0, -(f.a + (along ? 0 : Math.PI / 2)) + (R() - .5) * .1, 0); dummy.scale.set(seg * 1.08, ht, 1.3 + R() * .6); dummy.updateMatrix();
        const key = Math.floor(x / 600) + ',' + Math.floor(z / 600); let g = groups.get(key); if (!g) groups.set(key, g = { m: [], cx: 0, cz: 0 }); g.m.push(dummy.matrix.clone()); g.cx += x; g.cz += z;
      }
    }
  });
  for (const g of groups.values()) {
    const im = new THREE.InstancedMesh(geo, mat, g.m.length); g.m.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.userData.shared = true;
    WORLD.group.add(im); OHEDGE.patches.push({ im, x: g.cx / g.m.length, z: g.cz / g.m.length });
  }
  OHEDGE.count = [...groups.values()].reduce((a, g) => a + g.m.length, 0);
}
function optHedgesUpdate(cam) { for (const p of OHEDGE.patches) p.im.visible = Math.hypot(p.x - cam.x, p.z - cam.z) < OHEDGE.R; }

/* Trees in the open country (both graphics levels plant these): copses where a slow noise field rises, lone trees dotted over pasture and
   hillside, and scrub on rough slopes. Kept off fields (their edges have hedgerow trees already), roads, compounds, villages, airfields,
   beaches and cliffs. Returns [x, z, kind ('broad' | 'pine' | 'bush'), scale]. */
function openCountryTrees(M) {
  if (M._openTrees) return M._openTrees;
  const out = [], R = rng((M.seed || 1) * 13 + 611), frames = farmFrames(M), WX = GW * CELL, WZ = GH * CELL, S = 40;
  const zones = M.zones.concat(M.towns.map(t => t.zone)), inZone = (x, z) => zones.some(zn => { const dx = x / 1000 - zn.x, dz = z / 1000 - zn.y, c = Math.cos(zn.ang || 0), s = Math.sin(zn.ang || 0); return Math.abs(dx * c + dz * s) < zn.hx + .04 && Math.abs(-dx * s + dz * c) < zn.hy + .04; });
  const ok = (x, z) => { const h = terrainY(x, z); if (h < 5 || h > 340 || inForest(x, z)) return 0; const sl = Math.hypot(terrainY(x + 4, z) - terrainY(x - 4, z), terrainY(x, z + 4) - terrainY(x, z - 4)) / 8; if (sl > .48) return 0;
    if (onRoad(x, z) && roadNear(x, z)) return 0; if (inAirfield(x, z, 40) || inZone(x, z) || cropAtFrames(frames, x, z)) return 0; return 1 + sl; };
  for (let z = S; z < WZ - S; z += S) for (let x = S; x < WX - S; x += S) {
    const copse = fbm(x * .0032, z * .0032, (M.seed || 1) + 611, 3), rough = fbm(x * .01, z * .01, (M.seed || 1) + 612, 2);
    if (copse > .3) { for (let k = 0; k < 5; k++) { if (R() > .72) continue; const px = x + (R() - .5) * S, pz = z + (R() - .5) * S, o = ok(px, pz); if (!o) continue; out.push([px, pz, terrainY(px, pz) > 170 || R() < .2 ? 'pine' : R() < .25 ? 'bush' : 'broad', .75 + R() * .5]); } continue; }
    if (R() < .05) { const px = x + (R() - .5) * S, pz = z + (R() - .5) * S; if (ok(px, pz)) out.push([px, pz, terrainY(px, pz) > 200 ? 'pine' : 'broad', .85 + R() * .5]); } // a lone tree
    if (rough > .15 && R() < .12) { const px = x + (R() - .5) * S, pz = z + (R() - .5) * S, o = ok(px, pz); if (o > 1.1) out.push([px, pz, 'bush', .5 + R() * .5]); } // scrub on the rough ground
  }
  return M._openTrees = out;
}
