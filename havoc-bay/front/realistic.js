/* Island Front: the Realistic graphics mode (the old look is the Optimised mode).
   Finer terrain with textured ground, wind grass, detailed trees with far billboards, rocks, wave water with shore foam,
   a sky with sun and clouds, textured buildings and roads, power lines and farm fields. Everything is generated here: no image files. */
'use strict';
const REAL = { on: false, objs: [], grass: null, trees: [], tick: 0, lastGrass: new V3(1e9, 0, 1e9) };
const RF = 2, GWF = (GW - 1) * RF + 1, GHF = (GH - 1) * RF + 1, CELLF = CELL / RF; // 13.3 m terrain grid

/* ---------------- procedural textures ---------------- */
function tnoise(size, cells, seed) { // tileable value noise, -1..1
  const out = new Float32Array(size * size), L = cells;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * L, fy = y / size * L, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const s = t => t * t * (3 - 2 * t), a = hash2(i % L, j % L, seed), b = hash2((i + 1) % L, j % L, seed), c = hash2(i % L, (j + 1) % L, seed), d = hash2((i + 1) % L, (j + 1) % L, seed);
    out[y * size + x] = lerp(lerp(a, b, s(u)), lerp(c, d, s(u)), s(v)) * 2 - 1;
  }
  return out;
}
function tfbm(size, base, oct, seed, ridge) {
  const out = new Float32Array(size * size); let amp = .5;
  for (let o = 0; o < oct; o++) { const n = tnoise(size, base << o, seed + o * 17); for (let i = 0; i < out.length; i++) out[i] += amp * (ridge ? 1 - Math.abs(n[i]) * 2 : n[i]); amp *= .5; }
  return out;
}
function canvasOf(size, h) { const cv = document.createElement('canvas'); cv.width = cv.height = size; if (h) cv.height = h; return cv; }
function texOf(cv, rep, srgb = true) { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; if (rep) t.repeat.set(rep[0], rep[1]); return t; }
function paint(size, fn) { // fn(x, y, i) -> [r,g,b]
  const cv = canvasOf(size), g = cv.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x, c = fn(x, y, i); img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return cv;
}
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function wrapDraw(g, size, x, y, draw) { for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) if (Math.abs(x + dx - size / 2) < size * .75 && Math.abs(y + dy - size / 2) < size * .75) draw(x + dx, y + dy); }
const TEX = {};
// a cut-out texture whose see-through pixels keep the average colour, so mipmaps don't fade to black at a distance
function alphaSafe(cv, repeat) {
  const w = cv.width, h = cv.height, src = cv.getContext('2d').getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4);
  let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < w * h; i++) if (src[i * 4 + 3] > 128) { r += src[i * 4]; g += src[i * 4 + 1]; b += src[i * 4 + 2]; n++; }
  r /= n || 1; g /= n || 1; b /= n || 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, o = ((h - 1 - y) * w + x) * 4, a = src[i + 3]; out[o] = a > 8 ? src[i] : r; out[o + 1] = a > 8 ? src[i + 1] : g; out[o + 2] = a > 8 ? src[i + 2] : b; out[o + 3] = a; }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat); t.encoding = THREE.sRGBEncoding; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t;
}
function makeTextures() {
  if (TEX.grass) return;
  const S = 512, R = rng(77);
  { // grass
    const n = tfbm(S, 4, 5, 11), dry = tfbm(S, 2, 3, 12), grit = tnoise(S, 128, 13);
    const cv = paint(S, (x, y, i) => { let c = mixc([62, 76, 36], [104, 114, 60], n[i] * .6 + .5); if (dry[i] > .18) c = mixc(c, [132, 122, 76], Math.min(1, (dry[i] - .18) * 3)); const k = 1 + grit[i] * .03; return [c[0] * k, c[1] * k, c[2] * k]; });
    const g = cv.getContext('2d');
    for (let k = 0; k < 6000; k++) { const x = R() * S, y = R() * S, a = R() * Math.PI * 2, l = 3 + R() * 7, lt = R() < .5; g.strokeStyle = lt ? `rgba(${120 + R() * 30 | 0},${136 + R() * 24 | 0},${62 + R() * 16 | 0},.16)` : `rgba(40,${58 + R() * 16 | 0},26,.16)`; g.lineWidth = 1; wrapDraw(g, S, x, y, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); }); }
    TEX.grass = texOf(cv);
  }
  { // dirt with pebbles
    const n = tfbm(S, 4, 5, 21), damp = tfbm(S, 2, 3, 22), grit = tnoise(S, 160, 23);
    const cv = paint(S, (x, y, i) => { let c = mixc([92, 74, 54], [140, 116, 86], n[i] * .6 + .5); if (damp[i] > .2) c = mixc(c, [70, 56, 42], Math.min(1, (damp[i] - .2) * 2.5)); const k = 1 + grit[i] * .05; return [c[0] * k, c[1] * k, c[2] * k]; });
    const g = cv.getContext('2d');
    for (let k = 0; k < 2600; k++) { const x = R() * S, y = R() * S, r = .8 + R() * 2.6, v = 110 + R() * 60 | 0; wrapDraw(g, S, x, y, (px, py) => { g.fillStyle = 'rgba(30,24,18,.35)'; g.beginPath(); g.ellipse(px + .7, py + .9, r, r * .75, 0, 0, 7); g.fill(); g.fillStyle = `rgb(${v},${v - 6},${v - 16})`; g.beginPath(); g.ellipse(px, py, r, r * .75, 0, 0, 7); g.fill(); }); }
    TEX.dirt = texOf(cv);
  }
  { // rock: strata, cracks, lichen
    const n = tfbm(S, 3, 6, 31, true), s = tfbm(S, 8, 3, 32), cr = tnoise(S, 6, 33);
    const cv = paint(S, (x, y, i) => { let c = mixc([88, 86, 80], [158, 152, 142], n[i] * .7 + .35 + s[i] * .3); if (Math.abs(cr[i]) < .025) c = mixc(c, [40, 38, 34], .7); return c; });
    const g = cv.getContext('2d');
    for (let k = 0; k < 90; k++) { const x = R() * S, y = R() * S, r = 4 + R() * 16; wrapDraw(g, S, x, y, (px, py) => { g.fillStyle = `rgba(${120 + R() * 30 | 0},${124 + R() * 20 | 0},70,.18)`; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); }); }
    TEX.rock = texOf(cv);
  }
  { // sand with ripples
    const n = tfbm(S, 6, 4, 41), w = tfbm(S, 2, 3, 42), grit = tnoise(S, 200, 43);
    const cv = paint(S, (x, y, i) => { const rip = Math.sin((x + w[i] * 60) / S * Math.PI * 2 * 18) * .5 + .5; const c = mixc([186, 168, 126], [216, 200, 160], n[i] * .5 + .5 - rip * .12); const k = 1 + grit[i] * .07; return [c[0] * k, c[1] * k, c[2] * k]; });
    TEX.sand = texOf(cv);
  }
  { const n = tfbm(256, 3, 5, 51); TEX.macro = texOf(paint(256, (x, y, i) => { const v = 128 + n[i] * 110; return [v, v, v]; }), null, false); }
  // water normals: (r,g) slope, b = foam noise
  { const Sz = 256, h = tfbm(Sz, 4, 5, 61), f = tfbm(Sz, 8, 3, 62); TEX.waterN = texOf(paint(Sz, (x, y, i) => { const xl = h[y * Sz + (x + Sz - 1) % Sz], xr = h[y * Sz + (x + 1) % Sz], yu = h[((y + Sz - 1) % Sz) * Sz + x], yd = h[((y + 1) % Sz) * Sz + x]; return [128 + (xl - xr) * 360, 128 + (yu - yd) * 360, 128 + f[i] * 160]; }), null, false); }
  // grass blades (alpha)
  { const cv = canvasOf(128), g = cv.getContext('2d'); for (let k = 0; k < 38; k++) { const x = 6 + R() * 116, h = 60 + R() * 66, bend = (R() - .5) * 26, w = 2 + R() * 3, c = [72 + R() * 40, 92 + R() * 34, 40 + R() * 22]; const gr = g.createLinearGradient(0, 128, 0, 128 - h); gr.addColorStop(0, `rgb(${c[0] * .78 | 0},${c[1] * .8 | 0},${c[2] * .72 | 0})`); gr.addColorStop(1, `rgb(${c[0] + 30 | 0},${c[1] + 30 | 0},${c[2] + 10 | 0})`); g.fillStyle = gr; g.beginPath(); g.moveTo(x - w, 128); g.quadraticCurveTo(x + bend * .3, 128 - h * .6, x + bend, 128 - h); g.quadraticCurveTo(x + bend * .3 + w * .4, 128 - h * .6, x + w, 128); g.fill(); } TEX.blade = alphaSafe(cv); }
  // leaves and needles (alpha)
  { const cv = canvasOf(256), g = cv.getContext('2d'); for (let k = 0; k < 520; k++) { const x = R() * 256, y = R() * 256, a = R() * 7, l = 6 + R() * 7; g.fillStyle = `rgb(${50 + R() * 40 | 0},${76 + R() * 50 | 0},${28 + R() * 22 | 0})`; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, l, l * .45, 0, 0, 7); g.fill(); g.restore(); } TEX.leaf = alphaSafe(cv, true); }
  { const cv = canvasOf(256), g = cv.getContext('2d'); g.lineCap = 'round'; for (let k = 0; k < 200; k++) { const x = R() * 256, y = R() * 220; g.strokeStyle = `rgb(${26 + R() * 22 | 0},${50 + R() * 30 | 0},${26 + R() * 16 | 0})`; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 40, y + 20 + R() * 30); g.stroke(); for (let q = 0; q < 6; q++) { const t = R(); g.beginPath(); g.moveTo(x + (R() - .5) * 20 * t, y + t * 40); g.lineTo(x + (R() - .5) * 30, y + t * 40 + 14); g.stroke(); } } TEX.needle = alphaSafe(cv, true); }
  { const n = tfbm(128, 2, 4, 71); TEX.bark = texOf(paint(128, (x, y, i) => { const s = Math.sin(x / 128 * Math.PI * 2 * 9 + n[i] * 4) * .5 + .5; const c = mixc([58, 44, 32], [104, 86, 66], s * .7 + n[i] * .3 + .2); return c; })); }
  // building and road surfaces (neutral greys, tinted by each material's colour)
  const B = 256;
  { const n = tfbm(B, 4, 4, 81), st = tfbm(B, 2, 3, 82); const cv = paint(B, (x, y, i) => { let v = 205 + n[i] * 22 - Math.max(0, st[i]) * 40 * (1 - y / B); return [v, v, v * .98]; }); const g = cv.getContext('2d'); g.fillStyle = 'rgba(60,60,60,.5)'; g.fillRect(0, 0, 2, B); g.fillRect(0, B - 2, B, 2); TEX.concrete = texOf(cv); } // 3 m panels
  { const n = tfbm(B, 4, 3, 91); const cv = paint(B, (x, y, i) => { const v = 214 + n[i] * 16; return [v, v * .99, v * .96]; }); const g = cv.getContext('2d'); // 3 m x 3 m wall bay with one window
    g.fillStyle = '#8a8478'; g.fillRect(84, 86, 92, 104); g.fillStyle = '#2b333a'; g.fillRect(90, 92, 80, 92); const gr = g.createLinearGradient(90, 92, 170, 184); gr.addColorStop(0, 'rgba(160,180,195,.55)'); gr.addColorStop(.5, 'rgba(60,70,80,.1)'); gr.addColorStop(1, 'rgba(120,140,155,.35)'); g.fillStyle = gr; g.fillRect(90, 92, 80, 92); g.fillStyle = '#7d776c'; g.fillRect(128, 92, 4, 92); g.fillRect(90, 136, 80, 4); g.fillStyle = '#c8c2b6'; g.fillRect(80, 184, 100, 7); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 248, B, 8);
    TEX.facade = texOf(cv); }
  { const cv = canvasOf(B), g = cv.getContext('2d'); g.fillStyle = '#c4beb6'; g.fillRect(0, 0, B, B); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const x = c * 32 + (r % 2) * 16, y = r * 32, v = 180 + R() * 50 | 0; g.fillStyle = `rgb(${v},${v - 4},${v - 8})`; wrapDraw(g, B, x, y, (px, py) => { g.beginPath(); g.ellipse(px + 16, py + 20, 15, 14, 0, Math.PI, 0); g.lineTo(px + 31, py + 32); g.lineTo(px + 1, py + 32); g.fill(); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(px + 1, py + 30, 30, 2); g.fillStyle = `rgb(${v},${v - 4},${v - 8})`; }); } TEX.tiles = texOf(cv); }
  { const cv = paint(B, (x) => { const v = 170 + Math.sin(x / B * Math.PI * 2 * 16) * 45; return [v, v, v]; }), g = cv.getContext('2d'); for (let k = 0; k < 40; k++) { const x = R() * B; g.fillStyle = 'rgba(120,70,40,.18)'; g.fillRect(x, R() * 60, 2 + R() * 4, 40 + R() * 160); } TEX.metal = texOf(cv); }
  { const cv = canvasOf(B), g = cv.getContext('2d'); g.fillStyle = '#6e6450'; g.fillRect(0, 0, B, B); for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { const x = c * 64 + (r % 2) * 32, y = r * 32, v = 170 + R() * 40 | 0; wrapDraw(g, B, x, y, (px, py) => { const gr = g.createLinearGradient(0, py, 0, py + 30); gr.addColorStop(0, `rgb(${v},${v - 8},${v - 30})`); gr.addColorStop(1, `rgb(${v - 60},${v - 66},${v - 80})`); g.fillStyle = gr; g.beginPath(); g.roundRect ? g.roundRect(px + 2, py + 2, 60, 28, 12) : g.rect(px + 2, py + 2, 60, 28); g.fill(); }); } TEX.sandbag = texOf(cv); }
  { const n = tfbm(B, 2, 4, 101); const cv = paint(B, (x, y, i) => { const plank = Math.floor(y / 32), v = 150 + hash2(plank, 0, 5) * 50 + n[i] * 20 + Math.sin(x * .3 + plank) * 6; return [v, v * .86, v * .7]; }), g = cv.getContext('2d'); g.fillStyle = 'rgba(30,20,10,.6)'; for (let p = 0; p < 8; p++) g.fillRect(0, p * 32, B, 2); TEX.wood = texOf(cv); }
  { const n = tfbm(B, 8, 4, 111), grit = tnoise(B, 128, 112); const cv = paint(B, (x, y, i) => { const v = 78 + n[i] * 14 + grit[i] * 10; return [v, v, v * 1.02]; }), g = cv.getContext('2d'); g.fillStyle = 'rgba(235,230,215,.9)'; g.fillRect(8, 0, 5, B); g.fillRect(B - 13, 0, 5, B); g.fillStyle = 'rgba(230,200,90,.85)'; g.fillRect(B / 2 - 3, 0, 6, B * .55); TEX.asphalt = texOf(cv); } // across the road; 6 m along
  { const n = tfbm(B, 6, 4, 121); const cv = paint(B, (x, y, i) => { const u = x / B, rut = Math.exp(-Math.pow((u - .28) / .07, 2)) + Math.exp(-Math.pow((u - .72) / .07, 2)), mid = Math.exp(-Math.pow((u - .5) / .1, 2)), edge = Math.min(1, Math.pow(Math.abs(u - .5) * 2, 6)); let c = mixc([132, 110, 82], [96, 78, 58], rut * .8 + n[i] * .3); c = mixc(c, [86, 102, 50], mid * .55 + edge * .6); return c; }); TEX.track = texOf(cv); }
}

/* ---------------- finer terrain: smooth (Catmull-Rom) upsample plus small detail ---------------- */
function buildFine(M) {
  const H = M.H, HF = new Float32Array(GWF * GHF);
  const mask = new Float32Array(GW * GH); // 1 = keep perfectly smooth (bases, towns, roads)
  for (const z of M.zones.concat(M.towns.map(t => t.zone))) zoneLoop(z, (id, d) => { mask[id] = Math.max(mask[id], 1 - sstep(.02, .09, d)); });
  M.yard = new Float32Array(GW * GH); for (const z of M.zones) zoneLoop(z, (id, d) => { M.yard[id] = Math.max(M.yard[id], (1 - sstep(0, .015, d)) * (.55 + .45 * hash2(id % GW, id / GW | 0, 4))); }); // worn ground in compounds
  for (let id = 0; id < GW * GH; id++) if (M.ROAD[id]) mask[id] = 1;
  const cr = (p0, p1, p2, p3, t) => p1 + .5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const Hc = (i, j) => H[clamp(j, 0, GH - 1) * GW + clamp(i, 0, GW - 1)];
  for (let j = 0; j < GHF; j++) for (let i = 0; i < GWF; i++) {
    const fx = i / RF, fz = j / RF, i0 = Math.floor(fx), j0 = Math.floor(fz), tx = fx - i0, tz = fz - j0;
    let h;
    if (!tx && !tz) h = Hc(i0, j0);
    else { const r = []; for (let k = -1; k <= 2; k++) r.push(cr(Hc(i0 - 1, j0 + k), Hc(i0, j0 + k), Hc(i0 + 1, j0 + k), Hc(i0 + 2, j0 + k), tx)); h = cr(r[0], r[1], r[2], r[3], tz); }
    const mk = mask[Math.min(GH - 1, Math.round(fz)) * GW + Math.min(GW - 1, Math.round(fx))];
    if (h > 1.5 && mk < 1) {
      const x = i * CELLF, z = j * CELLF, sl = Math.hypot(Hc(i0 + 1, j0) - Hc(i0 - 1, j0), Hc(i0, j0 + 1) - Hc(i0, j0 - 1)) / (2 * CELL);
      h += ((fbm(x * .03, z * .03, 501, 3) * 1.1 + fbm(x * .11, z * .11, 502, 2) * .35) * (1 + sl * 3) + (sl > .4 ? ridged(x * .02, z * .02, 503, 3) * 4 * sstep(.4, .9, sl) : 0)) * (1 - mk) * sstep(1.5, 6, h);
    }
    HF[j * GWF + i] = h;
  }
  return HF;
}
function terrainYFine(x, z) {
  const H = WORLD.HF, fx = clamp(x / CELLF, 0, GWF - 1.001), fz = clamp(z / CELLF, 0, GHF - 1.001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, id = j * GWF + i;
  const h00 = H[id], h10 = H[id + 1], h01 = H[id + GWF], h11 = H[id + GWF + 1];
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/* ---------------- terrain: chunks with a splat shader ---------------- */
function terrainMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0, envMapIntensity: .32 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tGrass: { value: TEX.grass }, tDirt: { value: TEX.dirt }, tRock: { value: TEX.rock }, tSand: { value: TEX.sand }, tMacro: { value: TEX.macro } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSplat; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tGrass, tDirt, tRock, tSand, tMacro; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN; vec3 tAlb;
      vec3 two(sampler2D t, vec2 p, float far) { vec3 a = texture2D(t, p / 4.5).rgb, b = texture2D(t, p / 23.0).rgb, c = texture2D(t, p / 110.0).rgb; return pow(mix(mix(a, b, .5), mix(b, c, .5), far), vec3(2.2)); }`)
      .replace('#include <map_fragment>', `
        float dist = length(vWP - cameraPosition), far = smoothstep(60.0, 420.0, dist);
        vec3 n = normalize(vWN), bw = pow(abs(n), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 rk = two(tRock, vWP.zy, far) * bw.x + two(tRock, vWP.xz, far) * bw.y + two(tRock, vWP.xy, far) * bw.z;
        vec4 w = vSplat; w /= max(.001, w.x + w.y + w.z + w.w);
        tAlb = two(tGrass, vWP.xz, far) * w.x + two(tDirt, vWP.xz, far) * w.y + rk * w.z + two(tSand, vWP.xz, far) * w.w;
        float mac = texture2D(tMacro, vWP.xz / 900.0).r * .7 + texture2D(tMacro, vWP.xz / 211.0).r * .3;
        float dry = smoothstep(.42, .72, texture2D(tMacro, vWP.xz / 2300.0 + .37).r) * .8 + smoothstep(.6, .8, texture2D(tMacro, vWP.xz / 310.0 + .71).r) * .35;
        vec3 grassTone = mix(vec3(.82, .9, .72), vec3(1.25, 1.08, .66), clamp(dry, 0.0, 1.0)); // olive meadows with dry, straw-coloured patches
        tAlb *= mix(vec3(1.0), grassTone, w.x);
        diffuseColor.rgb *= tAlb * (.66 + mac * .55);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        { float hL = dot(sqrt(tAlb), vec3(.333)); vec2 dH = vec2(dFdx(hL), dFdy(hL)) * 1.6 * (1.0 - far);
          vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition), R1 = cross(sY, normal), R2 = cross(normal, sX); float det = dot(sX, R1);
          normal = normalize(abs(det) * normal - sign(det) * (dH.x * R1 + dH.y * R2)); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .6, vSplat.w * smoothstep(3.0, 0.5, vWP.y));');
  };
  m.extensions = { derivatives: true };
  return m;
}
function buildTerrainChunks(M) {
  const HF = WORLD.HF, CH = 100, mat = terrainMaterial(), group = new THREE.Group();
  // farm plots round the towns
  const towns = M.towns.map(t => ({ x: t.x * 1000, z: t.y * 1000, a: hash2(t.x * 100 | 0, t.y * 100 | 0, 9) * Math.PI }));
  const crop = (x, z) => {
    for (const t of towns) {
      const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz); if (d > 1300 || d < 260) continue;
      const c = Math.cos(t.a), s = Math.sin(t.a), u = dx * c + dz * s, v = -dx * s + dz * c, pu = Math.floor(u / 160), pv = Math.floor(v / 110), k = hash2(pu + 500, pv + 500, 7);
      const edge = Math.min(Math.abs(u / 160 - Math.round(u / 160)) * 160, Math.abs(v / 110 - Math.round(v / 110)) * 110);
      if (edge < 4) return 0; // hedgerows and lanes between fields
      return 1 + Math.floor(k * 4) * (d < 1100 ? 1 : 0);
    }
    return 0;
  };
  for (let cj = 0; cj < GHF - 1; cj += CH) for (let ci = 0; ci < GWF - 1; ci += CH) {
    const i1 = Math.min(ci + CH, GWF - 1), j1 = Math.min(cj + CH, GHF - 1), nx = i1 - ci + 1, nz = j1 - cj + 1, N = nx * nz;
    const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), col = new Float32Array(N * 3), spl = new Float32Array(N * 4);
    for (let j = cj; j <= j1; j++) for (let i = ci; i <= i1; i++) {
      const k = (j - cj) * nx + (i - ci), id = j * GWF + i, x = i * CELLF, z = j * CELLF, h = HF[id];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const hl = HF[j * GWF + Math.max(i - 1, 0)], hr = HF[j * GWF + Math.min(i + 1, GWF - 1)], hu = HF[Math.max(j - 1, 0) * GWF + i], hd = HF[Math.min(j + 1, GHF - 1) * GWF + i];
      const nX = hl - hr, nY = 2 * CELLF, nZ = hu - hd, nl = Math.hypot(nX, nY, nZ); nor[k * 3] = nX / nl; nor[k * 3 + 1] = nY / nl; nor[k * 3 + 2] = nZ / nl;
      const sl = Math.hypot(hr - hl, hd - hu) / (2 * CELLF), cid = Math.min(GH - 1, Math.round(j / RF)) * GW + Math.min(GW - 1, Math.round(i / RF));
      const forest = M.F[cid], road = M.ROAD[cid];
      let gw = 1, dw = 0, rw = 0, sw = 0, tint = [1, 1, 1];
      const nn = fbm(x * .004, z * .004, 601, 3);
      sw = h < 3.2 ? 1 : h < 6 ? sstep(6, 3.2, h) : 0;
      if (h < 0) { sw = 1; tint = [.85, .9, .9]; }
      rw = sstep(.38, .75, sl) + (h > 450 ? sstep(450, 650, h) * .6 : 0);
      dw = (forest ? .55 : 0) + Math.max(0, nn - .15) * 1.4 + (road === 1 ? .6 : 0);
      if (forest) { tint = [.46, .5, .42]; dw += .35; }
      const cp = h > 6 && sl < .2 && !forest && !road ? crop(x, z) : 0;
      if (cp === 1) { dw += .9; tint = [.95, .82, .7]; } // ploughed
      else if (cp === 2) { gw = 1; tint = [1.28, 1.1, .62]; dw += .2; } // wheat
      else if (cp === 3) { tint = [.86, 1.12, .82]; } // young crop
      // in compounds the ground is worn to dirt
      if (M.yard) { const yd = M.yard[cid]; dw += yd * 1.1; gw *= 1 - yd * .7; }
      gw = Math.max(0, gw - rw - sw); dw = dw * (1 - rw) * (1 - sw);
      spl[k * 4] = gw; spl[k * 4 + 1] = dw; spl[k * 4 + 2] = rw; spl[k * 4 + 3] = sw;
      const lap = (hl + hr + hu + hd - 4 * h) / CELLF, ao = 1 - clamp(lap * .09, -.1, .2); // hollows a little darker, ridges a little lighter
      const tv = (1 + nn * .12) * ao; col[k * 3] = tint[0] * tv; col[k * 3 + 1] = tint[1] * tv; col[k * 3 + 2] = tint[2] * tv;
    }
    const lod = st => { const out = []; for (let j = 0; j < nz - 1; j += st) for (let i = 0; i < nx - 1; i += st) { const j2 = Math.min(j + st, nz - 1), i2 = Math.min(i + st, nx - 1), a = j * nx + i, b = j * nx + i2, d = j2 * nx + i, e = j2 * nx + i2; out.push(a, d, b, b, d, e); } return new THREE.BufferAttribute(new Uint32Array(out), 1); };
    const idx = lod(1), idx2 = lod(2), idx4 = lod(4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4));
    g.setIndex(idx); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.userData.lod = [idx, idx2, idx4]; mesh.userData.c = g.boundingSphere.center.clone(); group.add(mesh); REAL.chunks.push(mesh);
  }
  group.name = 'terrain';
  return group;
}

/* ---------------- sky: gradient, sun, drifting clouds ---------------- */
const SKY_U = { uSun: { value: SUN_DIR.clone() }, uTop: { value: new THREE.Color(0x2f6db3) }, uHz: { value: new THREE.Color(0xc4d4e0) }, uTime: { value: 0 } };
const SKY_FRAG_NOISE = `float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
  float fbm2(vec2 p){ float s = 0.0, a = .5; for (int i = 0; i < 6; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= .5; } return s; }`;
function buildSky() {
  const m = new THREE.ShaderMaterial({
    uniforms: SKY_U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uSun, uTop, uHz; uniform float uTime; varying vec3 vD; ${SKY_FRAG_NOISE}
      void main(){ vec3 d = normalize(vD); float y = max(d.y, 0.0);
        vec3 col = mix(uHz, uTop, pow(y, .45));
        float sd = max(dot(d, uSun), 0.0);
        col += vec3(1.0, .85, .6) * (pow(sd, 6.0) * .22 + pow(sd, 60.0) * .35) + vec3(1.0, .95, .85) * smoothstep(.9994, .9997, sd) * 8.0;
        if (d.y > 0.0) { vec2 p = d.xz / (d.y + .12) * 1.4 + vec2(uTime * .004, uTime * .0015);
          float c = smoothstep(.52, .78, fbm2(p)), fade = smoothstep(0.0, .25, d.y);
          vec3 cc = mix(vec3(.78, .8, .84), vec3(1.0, .98, .95), clamp(fbm2(p + .5) * 1.4 - .2, 0.0, 1.0)) + vec3(1., .9, .7) * pow(sd, 8.0) * .3;
          col = mix(col, cc, c * fade * .85); }
        col = mix(col, uHz * .82, smoothstep(0.0, -.15, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(15000, 48, 24), m); s.renderOrder = -10; s.frustumCulled = false; s.name = 'realSky';
  return s;
}

/* ---------------- water ---------------- */
function heightTexture(M) { // terrain height near sea level, packed in a byte: (h + 20) / 25
  const d = new Uint8Array(GW * GH * 4);
  for (let i = 0; i < GW * GH; i++) { const v = clamp((M.H[i] + 20) / 25, 0, 1) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, GW, GH, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
function buildWater(M) {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSun: { value: SUN_DIR.clone() }, uTop: { value: new THREE.Color(0x2f6db3) }, uHz: { value: new THREE.Color(0xc4d4e0) }, uDeep: { value: new THREE.Color(0x0e3a52) }, uShallow: { value: new THREE.Color(0x2f9a9a) }, uWorld: { value: new THREE.Vector2(WORLD_W, WORLD_H) } }]);
  u.tN = { value: TEX.waterN }; u.tH = { value: heightTexture(M) };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: true,
    vertexShader: ['varying vec3 vWP;', '#include <fog_pars_vertex>', 'void main(){', ' vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;', '#include <fog_vertex>', '}'].join('\n'),
    fragmentShader: `uniform float uTime; uniform vec3 uSun, uTop, uHz, uDeep, uShallow; uniform vec2 uWorld; uniform sampler2D tN, tH; varying vec3 vWP; #include <fog_pars_fragment>
      void main(){
        vec2 uv = vWP.xz / uWorld; float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float ter = mix(-40.0, texture2D(tH, uv).r * 25.0 - 20.0, inside), depth = max(0.0, -ter);
        float dist = length(cameraPosition - vWP);
        vec2 a = texture2D(tN, vWP.xz / 41.0 + vec2(uTime * .011, uTime * .007)).rg * 2.0 - 1.0;
        vec2 b = texture2D(tN, vWP.xz / 13.0 - vec2(uTime * .019, -uTime * .013)).rg * 2.0 - 1.0;
        vec2 c = texture2D(tN, vWP.xz / 230.0 + vec2(uTime * .003, 0.0)).rg * 2.0 - 1.0;
        vec3 n = normalize(vec3((a.x + b.x * .6 + c.x * 1.5) , 3.5 + dist * .004, (a.y + b.y * .6 + c.y * 1.5)));
        vec3 V = normalize(cameraPosition - vWP), R = reflect(-V, n);
        float fr = .02 + .98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 sky = mix(uHz, uTop, pow(clamp(R.y, 0.0, 1.0), .5));
        vec3 body = mix(uShallow, uDeep, smoothstep(0.5, 22.0, depth)) * (.8 + .2 * max(dot(n, uSun), 0.0));
        float sp = pow(max(dot(R, uSun), 0.0), 600.0) * 7.0 + pow(max(dot(R, uSun), 0.0), 40.0) * .18;
        float fn = texture2D(tN, vWP.xz / 6.0 + vec2(uTime * .03, uTime * .02)).b, shore = 1.0 - smoothstep(0.0, 1.6, depth);
        float wave = smoothstep(.0, .5, sin(depth * 4.0 - uTime * 1.3 + fn * 3.0) * .5 + .5) * (1.0 - smoothstep(.3, 2.6, depth));
        float foam = clamp(shore * smoothstep(.35, .7, fn + shore * .45) + wave * .35 * step(.45, fn), 0.0, 1.0) * inside;
        vec3 col = mix(body, sky, fr) + vec3(1.0, .93, .8) * sp;
        col = mix(col, vec3(.93, .95, .95), foam * .9);
        float alpha = mix(.45, .97, smoothstep(0.2, 7.0, depth)); alpha = max(alpha, foam * .95);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
        #include <fog_fragment>
      }`.replace(/#include <fog_pars_fragment>/, '\n#include <fog_pars_fragment>\n'),
  });
  const g = new THREE.PlaneGeometry(90000, 90000, 1, 1); g.rotateX(-Math.PI / 2);
  const w = new THREE.Mesh(g, m); w.position.set(WORLD_W / 2, 0, WORLD_H / 2); w.renderOrder = 1; w.name = 'realWater';
  return w;
}

/* ---------------- trees: detailed up close, billboards in the distance ---------------- */
function treeModels() {
  const bark = new THREE.MeshStandardMaterial({ map: TEX.bark, roughness: 1 });
  const nt = TEX.needle.clone(); nt.needsUpdate = true; nt.repeat.set(5, 2.5); const lt = TEX.leaf.clone(); lt.needsUpdate = true; lt.repeat.set(2, 2);
  const needle = new THREE.MeshStandardMaterial({ map: nt, alphaTest: .45, side: THREE.DoubleSide, roughness: .9 });
  const leaf = new THREE.MeshStandardMaterial({ map: lt, alphaTest: .45, side: THREE.DoubleSide, roughness: .85 });
  const merge = list => { const P = [], N = [], U = []; for (const [g0, m4] of list) { const g = g0.index ? g0.toNonIndexed() : g0; g.applyMatrix4(m4); const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); U.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); return g; };
  const M4 = (x, y, z, ry = 0, s = [1, 1, 1], rx = 0, rz = 0) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(...s));
  // pine: a trunk and tiers of needle skirts
  const pTrunk = merge([[new THREE.CylinderGeometry(.12, .3, 13, 7), M4(0, 6.5, 0)]]);
  const tiers = []; for (let k = 0; k < 6; k++) { const t = k / 5, r = lerp(2.8, .7, t), y = lerp(3.4, 12.0, t); tiers.push([new THREE.ConeGeometry(r, 2.8 - t * .8, 8, 1, true), M4(0, y, 0, k * .7)]); if (k % 2 === 0) tiers.push([new THREE.ConeGeometry(r * .78, 2.3 - t * .6, 6, 1, true), M4(0, y - .6, 0, k * 1.3)]); }
  const pFol = merge(tiers);
  // broadleaf: trunk, three limbs, leafy clumps
  const bParts = [[new THREE.CylinderGeometry(.18, .32, 5.5, 7), M4(0, 2.75, 0)]];
  for (let k = 0; k < 3; k++) bParts.push([new THREE.CylinderGeometry(.06, .14, 3.2, 5), M4(Math.cos(k * 2.1) * .7, 6.0, Math.sin(k * 2.1) * .7, 0, [1, 1, 1], Math.sin(k * 2.1) * .6, -Math.cos(k * 2.1) * .6)]);
  const bTrunk = merge(bParts);
  const clumps = []; const Rr = rng(5); for (let k = 0; k < 9; k++) { const a = Rr() * 7, r = Rr() * 2.2, y = 6 + Rr() * 3.5, s = 1.6 + Rr() * 1.3; clumps.push([new THREE.IcosahedronGeometry(1, 0), M4(Math.cos(a) * r, y, Math.sin(a) * r, Rr() * 3, [s, s * .8, s])]); }
  const bFol = merge(clumps);
  return { bark, needle, leaf, pine: { trunk: pTrunk, fol: pFol, fm: needle, h: 13.5, w: 6 }, broad: { trunk: bTrunk, fol: bFol, fm: leaf, h: 11.5, w: 7.5 } };
}
function impostor(model, w, h) { // draw the tree from the side into a texture for far billboards
  const rt = new THREE.WebGLRenderTarget(256, 512); rt.texture.encoding = THREE.sRGBEncoding;
  const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, -50, 50);
  sc.add(new THREE.HemisphereLight(0xdfeaf5, 0x3a4a2a, 1.0)); const dl = new THREE.DirectionalLight(0xfff2dd, 1.6); dl.position.set(-.5, .8, .6); sc.add(dl);
  sc.add(new THREE.Mesh(model.trunk, model.trunkMat || REAL.models.bark), new THREE.Mesh(model.fol, model.fm));
  cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
  const old = renderer.getRenderTarget(), oc = renderer.getClearColor(new THREE.Color()), oa = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam); renderer.setRenderTarget(old); renderer.setClearColor(oc, oa);
  return rt.texture;
}
function distCull(m, near, far) { // instances outside [near, far) metres from the camera fold to nothing (in the vertex shader)
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    if (prev) prev(sh);
    sh.uniforms.uCull = { value: new THREE.Vector2(near, far) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uCull;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float dd = distance(ip.xz, cameraPosition.xz); if (dd < uCull.x || dd >= uCull.y) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`);
  };
  m.customProgramCacheKey = () => 'cull' + near + '_' + far;
}
function billboardMat(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, fog: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uCull = { value: new THREE.Vector2(560, 7000) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uCull;').replace('#include <project_vertex>', `
      vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float sc = length(instanceMatrix[0].xyz);
      vec3 toCam = cameraPosition - ip; toCam.y = 0.0; vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
      vec3 wp = ip + right * position.x * sc + vec3(0.0, position.y * sc, 0.0);
      vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
      float dd = distance(ip.xz, cameraPosition.xz); if (dd < uCull.x || dd >= uCull.y) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
  };
  return m;
}
function buildRealTrees(M) {
  const mods = REAL.models = REAL.models || treeModels();
  if (!mods.pine.bb) { mods.pine.bb = impostor(mods.pine, mods.pine.w, mods.pine.h); mods.broad.bb = impostor(mods.broad, mods.broad.w, mods.broad.h); }
  const R = rng(M.seed * 53 + 1), T = 500, tiles = new Map(), dummy = new THREE.Object3D();
  for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
    const id = j * GW + i; if (!M.F[id]) continue;
    // forest edges thin out
    const edge = (M.F[id - 1] + M.F[id + 1] + M.F[id - GW] + M.F[id + GW]) / 4;
    for (let n = 0; n < 9; n++) {
      if (R() > .62 * (.35 + edge * .65)) continue;
      const x = (i + R() - .5) * CELL, z = (j + R() - .5) * CELL, h = terrainY(x, z); if (h < 4) continue;
      const key = Math.floor(x / T) + ',' + Math.floor(z / T); let t = tiles.get(key); if (!t) tiles.set(key, t = { pine: [], broad: [] });
      (h > 150 || hash2(Math.floor(x / 300), Math.floor(z / 300), 3) < .4 ? t.pine : t.broad).push([x, h - .4, z, R() * TAU, .7 + R() * .75, R()]);
    }
  }
  for (const [gx2, gy2] of M.gardens || []) { // a tree or two in the gardens
    const x = gx2 * 1000 + (R() - .5) * 6, z = gy2 * 1000 + (R() - .5) * 6, h = terrainY(x, z); if (h < 3) continue;
    const key = Math.floor(x / T) + ',' + Math.floor(z / T); let t = tiles.get(key); if (!t) tiles.set(key, t = { pine: [], broad: [] });
    t.broad.push([x, h - .3, z, R() * TAU, .55 + R() * .45, R()]);
  }
  const all = { pine: [], broad: [] };
  const fol = {}, trunk = {};
  for (const k of ['pine', 'broad']) {
    fol[k] = mods[k].fm.clone(); distCull(fol[k], 0, 600); trunk[k] = mods.bark.clone(); distCull(trunk[k], 0, 600);
  }
  const depth = {}; for (const k of ['pine', 'broad']) { depth[k] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mods[k].fm.map, alphaTest: .45 }); }
  const col = new THREE.Color();
  for (const t of tiles.values()) for (const k of ['pine', 'broad']) {
    const list = t[k]; if (!list.length) continue; all[k].push(...list);
    for (const [geo, mt, isFol] of [[mods[k].trunk, trunk[k], false], [mods[k].fol, fol[k], true]]) {
      const im = new THREE.InstancedMesh(geo, mt, list.length);
      list.forEach(([x, y, z, r, s, c], q) => { dummy.position.set(x, y, z); dummy.rotation.set(0, r, 0); dummy.scale.set(s, s * (.9 + c * .25), s); dummy.updateMatrix(); im.setMatrixAt(q, dummy.matrix); if (isFol) im.setColorAt(q, col.setRGB(.85 + c * .3, .9 + c * .2, .8 + c * .2)); });
      im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; if (isFol) im.customDepthMaterial = depth[k];
      const cx = list.reduce((a, p) => a + p[0], 0) / list.length, cz = list.reduce((a, p) => a + p[2], 0) / list.length;
      im.userData = { cx, cz, near: true }; WORLD.group.add(im); REAL.trees.push(im);
    }
  }
  // billboards: one instanced mesh per kind for the whole island
  for (const k of ['pine', 'broad']) {
    const list = all[k]; if (!list.length) continue;
    const g = new THREE.PlaneGeometry(mods[k].w, mods[k].h); g.translate(0, mods[k].h / 2, 0);
    const im = new THREE.InstancedMesh(g, billboardMat(mods[k].bb), list.length);
    list.forEach(([x, y, z, r, s, c], q) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s, s, s); dummy.updateMatrix(); im.setMatrixAt(q, dummy.matrix); im.setColorAt(q, col.setRGB(.82 + c * .3, .88 + c * .2, .82 + c * .2)); });
    im.frustumCulled = false; WORLD.group.add(im);
  }
}

/* ---------------- grass, bushes and pebbles round the camera ---------------- */
function buildGrass() {
  const P = []; const blade = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[-c * .42, 0, -s * .42, 0, 0], [c * .42, 0, s * .42, 1, 0], [c * .42, .48, s * .42, 1, 1], [-c * .42, 0, -s * .42, 0, 0], [c * .42, .48, s * .42, 1, 1], [-c * .42, .48, -s * .42, 0, 1]]; };
  for (const a of [0, 1.05, 2.1]) P.push(...blade(a));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(p => [p[0], p[1], p[2]]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap(p => [p[3], p[4]]), 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(P.flatMap(() => [0, 1, 0]), 3));
  const m = new THREE.MeshLambertMaterial({ map: TEX.blade, alphaTest: .5, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => { sh.uniforms.uTime = REAL_T; sh.fragmentShader = sh.fragmentShader.replace(/:\s*vLightBack/g, ': vLightFront').replace(/:\s*vIndirectBack/g, ': vIndirectFront'); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
    vec3 ipw = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float sway = sin(uTime * 1.8 + ipw.x * .31 + ipw.z * .23) + sin(uTime * 3.1 + ipw.x * .9) * .3;
    transformed.x += sway * .12 * uv.y; transformed.z += cos(uTime * 1.3 + ipw.z * .27) * .07 * uv.y;`); };
  const N = 22000, im = new THREE.InstancedMesh(g, m, N); im.frustumCulled = false; im.receiveShadow = false;
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  im.userData.max = N; WORLD.group.add(im); REAL.grass = im;
  const bushG = new THREE.IcosahedronGeometry(1, 1), bm = new THREE.MeshStandardMaterial({ map: TEX.leaf, alphaTest: .4, side: THREE.DoubleSide, roughness: .9 });
  const bush = new THREE.InstancedMesh(bushG, bm, 1400); bush.frustumCulled = false; bush.castShadow = true; bush.userData.max = 1400; WORLD.group.add(bush); REAL.bush = bush;
  const rockG = new THREE.IcosahedronGeometry(1, 1); { const p = rockG.attributes.position, Rr = rng(9); for (let i = 0; i < p.count; i++) { const k = .75 + Rr() * .5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * .7, p.getZ(i) * k); } rockG.computeVertexNormals(); }
  const rk = new THREE.InstancedMesh(rockG, new THREE.MeshStandardMaterial({ map: TEX.rock, roughness: .95 }), 1600); rk.frustumCulled = false; rk.castShadow = true; rk.receiveShadow = true; rk.userData.max = 1600; WORLD.group.add(rk); REAL.rocks = rk;
}
const REAL_T = { value: 0 };
function grassAt(x, z) { // how grassy the ground is here (0..1)
  const M = WORLD.M, i = Math.round(x / CELL), j = Math.round(z / CELL); if (i < 1 || j < 1 || i >= GW - 1 || j >= GH - 1) return 0;
  const id = j * GW + i; if (M.ROAD[id]) return 0;
  const h = terrainY(x, z); if (h < 4) return 0;
  const sl = Math.hypot(terrainY(x + 3, z) - terrainY(x - 3, z), terrainY(x, z + 3) - terrainY(x, z - 3)) / 6; if (sl > .55) return 0;
  for (const zn of M.zones) { const dx = x / 1000 - zn.x, dz = z / 1000 - zn.y, c = Math.cos(zn.ang || 0), s = Math.sin(zn.ang || 0); if (Math.abs(dx * c + dz * s) < zn.hx + .01 && Math.abs(-dx * s + dz * c) < zn.hy + .01) return .15; }
  return (M.F[id] ? .3 : 1) * (1 - sstep(.35, .55, sl));
}
function updateGrass(focus) {
  const im = REAL.grass; if (!im) return;
  if (Math.hypot(focus.x - REAL.lastGrass.x, focus.z - REAL.lastGrass.z) < 10) return;
  REAL.lastGrass.copy(focus);
  const dummy = new THREE.Object3D(), col = new THREE.Color(), S = 1.05, RAD = 75, cx = Math.floor(focus.x / S), cz = Math.floor(focus.z / S), r = Math.ceil(RAD / S);
  let n = 0, nb = 0, nr = 0; const GMAX = im.userData.max, BMAX = REAL.bush.userData.max, RMAX = REAL.rocks.userData.max;
  for (let j = -r; j <= r && n < GMAX; j++) for (let i = -r; i <= r && n < GMAX; i++) {
    const gi = cx + i, gj = cz + j, x = (gi + hash2(gi, gj, 1)) * S, z = (gj + hash2(gi, gj, 2)) * S, d = Math.hypot(x - focus.x, z - focus.z); if (d > RAD) continue;
    const w = grassAt(x, z); if (hash2(gi, gj, 3) > w) continue;
    const y = terrainY(x, z), s = (.6 + hash2(gi, gj, 4) * .75) * (1 - sstep(RAD * .7, RAD, d));
    dummy.position.set(x, y - .05, z); dummy.rotation.set(0, hash2(gi, gj, 5) * TAU, 0); dummy.scale.set(s, s * (.8 + hash2(gi, gj, 6) * .6), s); dummy.updateMatrix(); im.setMatrixAt(n, dummy.matrix);
    const k = hash2(gi, gj, 7); im.setColorAt(n, col.setRGB(.78 + k * .3, .78 + k * .18, .55 + k * .15)); n++;
    if (REAL.bush && nb < BMAX && hash2(gi, gj, 8) < (WORLD.M.F[Math.round(z / CELL) * GW + Math.round(x / CELL)] ? .05 : .0012 * w)) { const bs = .45 + hash2(gi, gj, 9) * .7; dummy.position.set(x, y + bs * .22, z); dummy.scale.set(bs * 1.35, bs * .6, bs * 1.2); dummy.updateMatrix(); REAL.bush.setMatrixAt(nb++, dummy.matrix); }
  }
  // pebbles and boulders, mostly on slopes and beaches
  const Sr = 7;
  for (let j = -Math.ceil(140 / Sr); j <= Math.ceil(140 / Sr) && nr < RMAX; j++) for (let i = -Math.ceil(140 / Sr); i <= Math.ceil(140 / Sr) && nr < RMAX; i++) {
    const gi = Math.floor(focus.x / Sr) + i, gj = Math.floor(focus.z / Sr) + j, x = (gi + hash2(gi, gj, 11)) * Sr, z = (gj + hash2(gi, gj, 12)) * Sr;
    if (Math.hypot(x - focus.x, z - focus.z) > 140) continue;
    const h = terrainY(x, z), sl = Math.hypot(terrainY(x + 3, z) - terrainY(x - 3, z), terrainY(x, z + 3) - terrainY(x, z - 3)) / 6;
    const want = sl > .35 ? .35 : h < 3 && h > -1 ? .12 : .02; if (hash2(gi, gj, 13) > want || onRoad(x, z)) continue;
    const s = (sl > .35 ? .5 + hash2(gi, gj, 14) * 1.8 : .2 + hash2(gi, gj, 14) * .5);
    dummy.position.set(x, h - s * .2, z); dummy.rotation.set(hash2(gi, gj, 15) * 3, hash2(gi, gj, 16) * 6, 0); dummy.scale.set(s, s, s); dummy.updateMatrix(); REAL.rocks.setMatrixAt(nr++, dummy.matrix);
  }
  im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  if (REAL.bush) { REAL.bush.count = nb; REAL.bush.instanceMatrix.needsUpdate = true; }
  REAL.rocks.count = nr; REAL.rocks.instanceMatrix.needsUpdate = true;
}

/* ---------------- power lines along the main roads ---------------- */
function buildPowerLines(M) {
  const wires = [];
  for (const r of M._roads) {
    if (!r.main || r.closed) continue;
    const P = r.P.map(kmToM); let acc = 0, last = null;
    for (let k = 0; k < P.length - 1; k++) {
      const a = P[k], b = P[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (let s = (55 - acc % 55) % 55; s < L; s += 55) {
        const x = a[0] + (b[0] - a[0]) * s / L + nx * 9, z = a[1] + (b[1] - a[1]) * s / L + nz * 9, h = terrainY(x, z);
        const ok = h > 1.5 && bridgeAt(x, z) === null && !M.zones.some(zn => Math.hypot(x / 1000 - zn.x, z / 1000 - zn.y) < Math.max(zn.hx, zn.hy) + .05);
        if (!ok) { last = null; continue; }
        const ang = Math.atan2(nz, nx);
        addBoxMesh(WORLD.group, .28, 9.5, .28, 0x5b4632, x, h + 4.75, z, 0); addBoxMesh(WORLD.group, 2.6, .18, .18, 0x5b4632, x, h + 9, z, -ang + Math.PI / 2);
        const tops = [-1.15, 0, 1.15].map(o => [x + nx * o, h + 9.15 + (o === 0 ? .25 : 0), z + nz * o]);
        if (last) for (let w = 0; w < 3; w++) { const p0 = last[w], p1 = tops[w]; for (let q = 0; q < 8; q++) { const t0 = q / 8, t1 = (q + 1) / 8, sag = t => Math.sin(t * Math.PI) * 1.1; wires.push(lerp(p0[0], p1[0], t0), lerp(p0[1], p1[1], t0) - sag(t0), lerp(p0[2], p1[2], t0), lerp(p0[0], p1[0], t1), lerp(p0[1], p1[1], t1) - sag(t1), lerp(p0[2], p1[2], t1)); } }
        last = tops;
      }
      acc += L;
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  WORLD.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1c1c1a, fog: true })));
}

/* ---------------- textured buildings and roads ---------------- */
// the colours world.js uses for each kind of surface
const SURF = {
  concrete: [0x8c8a80, 0x9a978e, 0x6f6c63, 0x626058, 0x666a6c, 0x77746c, 0x6a675f, 0x6d6a62, 0xc9c4b6],
  facade: [0xb9b3a2, 0xa8a291, 0x9b9585, 0xa49e8d, 0x8f8a7c, 0x9d9686, 0xa29b88, 0xd8cfb8, 0xc9bfa4, 0xe0d6c2, 0xb8ad94],
  tiles: [0x8a4b38, 0x6b5a4a, 0x7b3f30], metalroof: [0x5e6a5c, 0x55604f, 0x4d5546, 0x5a5e60, 0x4a4a44], metal: [0x7d7b70, 0x8d9091, 0xdddddd, 0x5a6340, 0x9b8a62, 0x7a4a32, 0x4a5a6a],
  sandbag: [0x9b8d68, 0xa5946c, 0x5c6040, 0x4f5638], wood: [0x6e6450, 0x6b6656, 0x5a4a38, 0x4a3c2e, 0x7a6440, 0x6b5a46, 0x5b4632], asphalt: [0x3f4244],
};
const SURF_OF = {}; for (const [k, list] of Object.entries(SURF)) for (const c of list) SURF_OF[c] = k;
const SURF_TEX = { concrete: ['concrete', 3], facade: ['facade', 3], tiles: ['tiles', 1.6], metalroof: ['metal', 2], metal: ['metal', 2], sandbag: ['sandbag', 1.6], wood: ['wood', 1.8], asphalt: ['asphalt', 9] };
const REAL_MATS = {}, MILITARY = [0xb9b3a2, 0xa8a291, 0x9b9585, 0xa49e8d, 0x8f8a7c, 0x9d9686, 0xa29b88];
function realMat(color) {
  if (REAL_MATS[color]) return REAL_MATS[color];
  const kind = SURF_OF[color] || 'concrete', [tk, meters] = SURF_TEX[kind], tex = TEX[tk].clone(); tex.needsUpdate = true; tex.repeat.set(1 / meters, 1 / meters);
  const c = new THREE.Color(color).convertSRGBToLinear(), lum = (c.r + c.g + c.b) / 3, tint = kind === 'facade' || kind === 'concrete' ? c.clone().multiplyScalar(.62 / Math.max(.05, lum)).lerp(new THREE.Color(1, 1, 1), .12) : kind === 'tiles' ? c.clone().multiplyScalar(2.2) : c.clone().multiplyScalar(1.6);
  if (MILITARY.includes(color)) tint.multiply(new THREE.Color(.78, .72, .55)); // weathered tan army buildings
  return REAL_MATS[color] = new THREE.MeshStandardMaterial({ map: tex, color: tint, roughness: kind === 'metal' || kind === 'metalroof' ? .6 : .9, metalness: kind === 'metal' || kind === 'metalroof' ? .2 : 0, envMapIntensity: .5 });
}
const GABLE_GEO = (() => { // unit gable roof: x along the ridge, z across, eaves at y 0, ridge at y 1
  const v = [], u = [];
  const quad = (a, b, c, d, ua) => { v.push(...a, ...b, ...c, ...a, ...c, ...d); u.push(...ua[0], ...ua[1], ...ua[2], ...ua[0], ...ua[2], ...ua[3]); };
  const L = [[0, 0], [1, 0], [1, 1], [0, 1]];
  quad([-.5, 0, -.5], [.5, 0, -.5], [.5, 1, 0], [-.5, 1, 0], L); quad([.5, 0, .5], [-.5, 0, .5], [-.5, 1, 0], [.5, 1, 0], L);
  v.push(-.5, 0, .5, -.5, 0, -.5, -.5, 1, 0, .5, 0, -.5, .5, 0, .5, .5, 1, 0); u.push(0, 0, 1, 0, .5, .6, 0, 0, 1, 0, .5, .6);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.computeVertexNormals(); return g;
})();


/* ---------------- military clutter for compounds (Realistic only) ---------------- */
const WIRE = [];
function placeFree(site, R, hx, hz, r, tries = 40) { for (let k = 0; k < tries; k++) { const fx = (R() - .5) * 2 * (hx - r - 4), fz = (R() - .5) * 2 * (hz - r - 4); if (Math.abs(fz) < 14) continue; const [x, z] = site.w(fx, fz), pt = new V3(x, site.y0 + 1, z); if (!pushOutCircle(pt, r, site.y0, site.y0 + 2)) return [fx, fz]; } return null; }
function decorateCompound(site, hx, hz, size, seed) {
  const R = rng(seed), n = { S: [1, 2, 0, 1], M: [4, 3, 2, 2], L: [10, 6, 4, 4], B: [8, 5, 4, 3] }[size];
  const CONT = [0x5a6340, 0x9b8a62, 0x7a4a32, 0x4a5a6a];
  for (let k = 0; k < n[0]; k++) { const p = placeFree(site, R, hx, hz, 4.5); if (!p) break; const c = CONT[k % 4], rot = R() < .5 ? 0 : Math.PI / 2; site.box(p[0], p[1], 6.1, 2.6, 2.44, c, { rot }); if (R() < .3) site.box(p[0], p[1], 6.1, 2.6, 2.44, CONT[(k + 1) % 4], { rot, dy: 2.6 }); }
  for (let k = 0; k < n[1]; k++) { // tents
    const p = placeFree(site, R, hx, hz, 5); if (!p) break; const rot = R() < .5 ? 0 : Math.PI / 2, [x, z] = site.w(p[0], p[1]);
    site.box(p[0], p[1], 8, 1.6, 5, 0x5c6040, { rot });
    const o = new THREE.Object3D(); o.position.set(x, site.y0 + 1.6, z); o.rotation.y = -(site.ang + rot); o.scale.set(8.2, 1.5, 5.4); o.updateMatrix(); batchAdd(GABLE_GEO, 0x5c6040, o.matrix, [8.2, 3]);
  }
  for (let k = 0; k < n[2]; k++) { // camouflage nets on poles
    const p = placeFree(site, R, hx, hz, 6); if (!p) break;
    for (const [a, b] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) site.box(p[0] + a, p[1] + b, .15, 3.2, .15, 0x4a3c2e, { collide: false });
    site.box(p[0], p[1], 11, .12, 11, 0x4f5638, { y: site.y0 + 3.2, collide: false });
  }
  for (let k = 0; k < n[3]; k++) { const p = placeFree(site, R, hx, hz, 2); if (!p) break; site.box(p[0], p[1], .3, 9, .3, 0x8d9091); site.box(p[0], p[1], 1.2, .5, .6, 0x2e2e2a, { y: site.y0 + 9, collide: false }); } // floodlights
  if (size !== 'S') for (let k = 0; k < (size === 'L' || size === 'B' ? 3 : 1); k++) { const p = placeFree(site, R, hx, hz, 3); if (!p) break; const [x, z] = site.w(p[0], p[1]), cyl = new THREE.CylinderGeometry(1.6, 1.6, 1, 14); _bm.compose(_bv.set(x, site.y0 + 1.6, z), _bq.set(0, 0, 0, 1), _bs.set(1, 3.2, 1)); batchAdd(cyl, 0x5a6340, _bm, [10, 3.2]); addCollider(x, z, 1.6, 1.6, 0, site.y0, site.y0 + 3.2); }
}
function razorWire(site, f0x, f0z, f1x, f1z, y) { // coils along a wall top
  const L = Math.hypot(f1x - f0x, f1z - f0z), n = Math.ceil(L / .35);
  for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, a0 = i * 1.9, a1 = (i + 1) * 1.9; const p = (t, a) => { const [x, z] = site.w(lerp(f0x, f1x, t), lerp(f0z, f1z, t)); return [x + Math.cos(a) * .25 * site.s, y + .3 + Math.sin(a) * .25, z - Math.cos(a) * .25 * site.c]; }; WIRE.push(...p(t0, a0), ...p(t1, a1)); }
}
function flushWire() { if (!WIRE.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(WIRE.splice(0), 3)); WORLD.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a3a36, fog: true }))); }

/* ---------------- switching the look ---------------- */
const LOOK = { optimised: null };
function applyLook(realistic) {
  if (!LOOK.optimised) LOOK.optimised = { fog: [scene.fog.color.getHex(), scene.fog.near, scene.fog.far], sun: sun.intensity, hemi: hemi.intensity, exp: renderer.toneMappingExposure, map: sun.shadow.mapSize.x, ext: sun.shadow.camera.right };
  const O = LOOK.optimised;
  if (realistic) {
    scene.fog.color.set(0xbfd0de); scene.fog.near = 700; scene.fog.far = 15000;
    sun.intensity = 3.0; sun.color.set(0xfff0dc); hemi.intensity = .3; renderer.toneMappingExposure = .78;
    setShadow(4096, 170);
    if (!REAL.sky) { REAL.sky = buildSky(); scene.add(REAL.sky); }
    REAL.sky.visible = true; SKY.visible = false;
    if (!REAL.env) { const pm = new THREE.PMREMGenerator(renderer), sc = new THREE.Scene(); sc.add(buildSky()); REAL.env = pm.fromScene(sc).texture; pm.dispose(); }
    scene.environment = REAL.env;
    document.body.classList.add('realistic');
  } else {
    scene.fog.color.setHex(O.fog[0]); scene.fog.near = O.fog[1]; scene.fog.far = O.fog[2];
    sun.intensity = O.sun; sun.color.set(0xfff0d8); hemi.intensity = O.hemi; renderer.toneMappingExposure = O.exp; setShadow(O.map, O.ext);
    if (REAL.sky) REAL.sky.visible = false; SKY.visible = true; scene.environment = null;
    document.body.classList.remove('realistic');
  }
}
function setShadow(size, ext) {
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext }); sun.shadow.camera.updateProjectionMatrix();
}
function buildRealWorld(M) { // terrain, water, trees, grass, power lines (buildings come from world.js with textured materials)
  makeTextures(); REAL.chunks = [];
  WORLD.group.add(buildTerrainChunks(M));
  WORLD.group.add(buildWater(M)); REAL.water = WORLD.group.children[WORLD.group.children.length - 1];
  REAL.trees = []; buildRealTrees(M); buildGrass(); buildPowerLines(M);
  REAL.lastGrass.set(1e9, 0, 1e9);
}
function updateReal(focus, dt) {
  REAL_T.value += dt || 0; SKY_U.uTime.value = REAL_T.value;
  if (REAL.water) REAL.water.material.uniforms.uTime.value = REAL_T.value;
  if (REAL.sky) REAL.sky.position.copy(camera.position);
  for (const c of REAL.chunks) { const d = Math.hypot(c.userData.c.x - camera.position.x, c.userData.c.z - camera.position.z), want = c.userData.lod[d < 2300 ? 0 : d < 5500 ? 1 : 2]; if (c.geometry.index !== want) c.geometry.setIndex(want); }
  for (const t of REAL.trees) t.visible = Math.hypot(t.userData.cx - camera.position.x, t.userData.cz - camera.position.z) < 960;
  updateGrass(camera.position);
}
