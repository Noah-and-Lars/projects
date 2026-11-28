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
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <map_fragment>', `
      { float d = length(vGW - cameraPosition);
        vec3 a = texture2D(map, vGW.xz / 4.0).rgb, b = texture2D(map, vGW.xz / 26.0).rgb, c = texture2D(map, vGW.xz / 150.0 + .31).rgb;
        float nearW = 1.0 - smoothstep(25.0, 140.0, d);
        vec3 tx = mix(b, a, nearW) * (c * 1.25 + .05) / .77;                         // fine detail close up, coarser further out, patches everywhere
        float mottle = texture2D(map, vGW.xz / 620.0 + .7).r;                        // big light and dark drifts across the fields
        diffuseColor.rgb *= tx * (.82 + (mottle - .77) * 1.4); }`);
  };
  m.customProgramCacheKey = () => 'optTerrain';
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
