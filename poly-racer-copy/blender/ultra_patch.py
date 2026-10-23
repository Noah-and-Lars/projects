# Adds the Ultra graphics tier to poly-racer-copy/index.html: photographic skies (Poly Haven HDRIs) for the sky and the
# reflections, photographic road and ground surfaces with normal and roughness maps, 4k shadows and bigger budgets.
# Run once: python3 -I ultra_patch.py <index.html>
import sys, re
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:80])
    s = s.replace(old, new)

# ---- the tier
rep("""  high:   { pr: 2,    aa: true,  shadows: 2048, trees: 18000, tufts: 6000, clouds: 1, mirror: 2, far: 5200, lights: 16, bloom: true },
};""", """  high:   { pr: 2,    aa: true,  shadows: 2048, trees: 18000, tufts: 6000, clouds: 1, mirror: 2, far: 5200, lights: 16, bloom: true },
  // Ultra: everything High does, plus photographic skies and road surfaces (Poly Haven), 4k shadows and far more trees
  ultra:  { pr: 2,    aa: true,  shadows: 4096, trees: 26000, tufts: 9000, clouds: 1, mirror: 2, far: 6200, lights: 24, bloom: true, ultra: true },
};""")
rep("""<button data-v="high">High</button></div></div>""", """<button data-v="high">High</button><button data-v="ultra">Ultra</button></div></div>""")
rep("""<small>Lower it if the game feels slow</small>""", """<small>Lower it if the game feels slow. Ultra adds real skies and road surfaces (a 20 MB download) and wants a proper graphics card</small>""")
rep("""{ const S = Q.shadows >= 2048 ? 48 : 70;""", """{ const S = Q.shadows >= 4096 ? 60 : Q.shadows >= 2048 ? 48 : 70;""")

# ---- the sky shader: an ULTRA path that shows the photographed sky
rep("""  vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  defines: Q.clouds ? { CLOUDS: 1 } : {},""", """  vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  defines: Object.assign(Q.clouds ? { CLOUDS: 1 } : {}, Q.ultra ? { ULTRA: 1 } : {}),""")
rep("""uniform float clouds; uniform float time; uniform float night; varying vec3 vDir;""",
    """uniform float clouds; uniform float time; uniform float night; varying vec3 vDir;
uniform sampler2D skyTex; uniform float skyShift; uniform float skyGain; uniform vec3 fogCol; uniform float skyOn;""")
rep("""  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
  float sd = max(dot(d, sunDir), 0.0);""", """  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
  float sd = max(dot(d, sunDir), 0.0);
  #ifdef ULTRA
  if (skyOn > 0.5) {
    // the photographed sky, turned so its sun sits where the game's sun is; it fades into the fog at the horizon
    vec2 suv = vec2(fract(atan(d.z, d.x) * 0.15915494 + 0.5 + skyShift), asin(clamp(h, -1.0, 1.0)) * 0.31830989 + 0.5);
    vec3 pc = sRGBToLinear(texture2D(skyTex, suv)).rgb * skyGain;
    pc = mix(pc, fogCol, smoothstep(0.1, 0.0, h) * 0.85);
    pc = mix(pc, ground, smoothstep(0.0, -0.06, h));
    gl_FragColor = vec4(pc, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
    return;
  }
  #endif""")
rep("""    sunDir: { value: new V3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, clouds: { value: 0.4 }, time: { value: 0 }, night: { value: 0 } },""",
    """    sunDir: { value: new V3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, clouds: { value: 0.4 }, time: { value: 0 }, night: { value: 0 },
    skyTex: { value: null }, skyShift: { value: 0 }, skyGain: { value: 1 }, fogCol: { value: new THREE.Color() }, skyOn: { value: 0 } },""")

# ---- applyEnv: the photographed sky lights and reflects on Ultra
rep("""  hemi.color.copy(C(E.hemi[0])); hemi.groundColor.copy(C(E.hemi[1])); hemi.intensity = E.hemi[2];
  scene.fog.color.copy(C(E.sky[1])).lerp(C(E.sky[0]), 0.12);
  scene.fog.density = E.fog;
  renderer.toneMappingExposure = E.exp;
  // reflections and soft light from this sky
  const sc = new THREE.Scene();""", """  hemi.color.copy(C(E.hemi[0])); hemi.groundColor.copy(C(E.hemi[1])); hemi.intensity = E.hemi[2];
  scene.fog.color.copy(C(E.sky[1])).lerp(C(E.sky[0]), 0.12);
  scene.fog.density = E.fog;
  renderer.toneMappingExposure = E.exp;
  if (ULTRA.ready && ultraSky(E)) return;
  // reflections and soft light from this sky
  const sc = new THREE.Scene();""")

# ---- the Ultra block itself, after applyEnv
rep("""// ---------- Textures (drawn once on canvases) ----------""", r"""// ---------- Ultra: photographed skies and surfaces (Poly Haven, CC0), loaded only on the Ultra setting ----------
// Skies come as a 2k JPG (what the player sees) and a 512x256 .hdr (what lights the scene and reflects in the paint);
// `ultra/sky/skies.json` says where the sun is in each, so the sky can be turned to put it where the game's sun is.
const ULTRA = { ready: false, img: {}, tex: {}, sky: {}, env: {}, info: {} };
const ULTRA_TEX = ['road', 'tarmac', 'grass', 'gravel', 'sand', 'dirt', 'snow', 'concrete'];
function loadImage(url) { return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('image ' + url)); im.src = url; }); }
// Radiance .hdr (RGBE, run-length coded) -> rows of RGBE bytes, bottom row first (how WebGL wants them)
function parseHDR(buf) {
  const b = new Uint8Array(buf); let p = 0, line = '';
  const readLine = () => { line = ''; while (p < b.length && b[p] !== 10) line += String.fromCharCode(b[p++]); p++; return line; };
  if (!readLine().startsWith('#?')) throw new Error('not an hdr');
  while (readLine() !== '') { /* header */ }
  const m = /-Y (\d+) \+X (\d+)/.exec(readLine()); if (!m) throw new Error('hdr layout');
  const H = +m[1], W = +m[2], out = new Uint8Array(W * H * 4), row = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (b[p] === 2 && b[p + 1] === 2 && ((b[p + 2] << 8) | b[p + 3]) === W && W >= 8 && W < 32768) {
      p += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < W) {
          let n = b[p++];
          if (n > 128) { n -= 128; const v = b[p++]; for (let i = 0; i < n; i++) row[(x++) * 4 + c] = v; }
          else for (let i = 0; i < n; i++) row[(x++) * 4 + c] = b[p++];
        }
      }
    } else { row.set(b.subarray(p, p + W * 4)); p += W * 4; }
    out.set(row, (H - 1 - y) * W * 4);
  }
  return { W, H, data: out };
}
async function loadUltra(progress) {
  const v = '?v=' + VERSION;
  try {
    ULTRA.info = await (await fetch('ultra/sky/skies.json' + v)).json();
    const jobs = [];
    for (const k of ULTRA_TEX) for (const t of ['diff', 'nor', 'rough']) {
      if (t === 'rough' && k !== 'road') continue;
      jobs.push(loadImage('ultra/tex/' + k + '_' + t + '.jpg' + v).then(im => { ULTRA.img[k + '_' + t] = im; }));
    }
    for (const k in ULTRA.info) {
      jobs.push(loadImage('ultra/sky/' + k + '_sky.jpg' + v).then(im => { ULTRA.img['sky_' + k] = im; }));
      jobs.push(fetch('ultra/sky/' + k + '_env.hdr' + v).then(r => r.arrayBuffer()).then(buf => { ULTRA.env[k] = parseHDR(buf); }));
    }
    let done = 0; const all = jobs.length;
    await Promise.all(jobs.map(j => j.then(() => { done++; if (progress) progress(done, all); })));
    ultraTextures();
    ULTRA.ready = true;
  } catch (e) { console.warn('Ultra assets', e); ULTRA.ready = false; }
}
// a photo as a grey detail map: the land's own colours (seasons, biomes) still come through the vertex colours
function ultraDetail(im, size, mean = 0.86) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.drawImage(im, 0, 0, size, size);
  const id = g.getImageData(0, 0, size, size), d = id.data; let sum = 0;
  for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; d[i] = l; sum += l; }
  const k = mean * 255 / (sum / (d.length / 4));
  for (let i = 0; i < d.length; i += 4) { const l = Math.min(255, d[i] * k); d[i] = d[i + 1] = d[i + 2] = l; }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(16, MAX_ANISO); t.encoding = THREE.sRGBEncoding; return t;
}
function ultraMap(im, data) {
  const t = new THREE.Texture(im); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(16, MAX_ANISO);
  t.encoding = data ? THREE.LinearEncoding : THREE.sRGBEncoding; t.needsUpdate = true; return t;
}
function ultraTiled(im, w, h, nx, ny, data) {
  return canvasTex(w, h, g => { for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g.drawImage(im, i * w / nx, j * h / ny, w / nx, h / ny); }, data ? { data: 1 } : {});
}
function ultraTextures() {
  const I = ULTRA.img, T = ULTRA.tex;
  // the road: the lines are painted on it by roadTexture; normals and roughness tiled 6 x 12 over its 12 x 24 m
  T.roadN = ultraTiled(I.road_nor, 2048, 4096, 6, 12, true); T.roadN.anisotropy = Math.min(16, MAX_ANISO);
  T.roadR = ultraTiled(I.road_rough, 1024, 2048, 6, 12, true);
  for (const k of ['grass', 'gravel', 'sand', 'dirt', 'snow', 'tarmac', 'concrete']) {
    T[k] = ultraDetail(I[k + '_diff'], 1024, k === 'snow' ? 0.92 : 0.86); T[k].nmap = ultraMap(I[k + '_nor'], true);
  }
  T.concreteC = ultraMap(I.concrete_diff);
  for (const k in ULTRA.info) { const t = ultraMap(I['sky_' + k]); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; T['sky_' + k] = t; }
  // the game's own textures give way to the photographs
  ribbonTextures();
  TEX.grassD = T.grass; TEX.gravel = T.gravel; TEX.sand = T.sand; TEX.dirt = T.dirt; TEX.tarmacR = T.tarmac; TEX.snowD = T.snow;
  if (MAT.ground) { MAT.ground.map = T.grass; MAT.ground.normalMap = T.grass.nmap; MAT.ground.normalScale = new THREE.Vector2(0.45, 0.45); MAT.ground.needsUpdate = true; }
  if (MAT.wall) { MAT.wall.map = T.concrete; MAT.wall.needsUpdate = true; }
  if (MAT.concrete) { MAT.concrete.map = T.concreteC; MAT.concrete.needsUpdate = true; }
}
// which photographed sky suits this environment: by the sun's height, the cloud cover and the weather
function ultraSkyKey(E) {
  const el = E.sun[0], w = E.weather, cl = E.clouds || 0;
  if (E.night) return (w === 'cloudy' || w === 'rain' || w === 'fog' || w === 'snow' || cl > 0.6) ? 'nightcloudy' : 'moon';
  if (w === 'snow' || (E.ice && cl > 0.5)) return 'snow';
  if (w === 'fog') return 'fog';
  if (w === 'rain' || cl > 0.78) return 'overcast';
  if (w === 'cloudy' || cl > 0.5) return el < 16 ? 'cloudysunset' : 'cloudy';
  if (el < 2) return 'dusk';
  if (el < 16) return E.sun[1] < 180 ? 'morning' : 'sunset';
  if (el < 46) return 'afternoon';
  return 'noon';
}
const ULTRA_GAIN = { noon: 2.6, afternoon: 2.6, morning: 2.2, sunset: 2.0, dusk: 1.6, cloudy: 2.4, cloudysunset: 2.0, overcast: 2.2, fog: 2.2, snow: 2.4, moon: 0.3, nightcloudy: 0.22 };
let ultraEnvKey = null;
function ultraSky(E) {
  const key = ultraSkyKey(E), info = ULTRA.info[key], tex = ULTRA.tex['sky_' + key], hdr = ULTRA.env[key];
  if (!info || !tex || !hdr) return false;
  const u = skyMat.uniforms;
  // the sun's place across the picture (how three.js reads an equirect: u = atan(z, x) / 2pi + 0.5) vs. the game's sun
  const az = E.sun[1] * Math.PI / 180, uGame = Math.atan2(Math.cos(az), Math.sin(az)) / (2 * Math.PI) + 0.5;
  const shift = uGame - info.sunU;
  u.skyTex.value = tex; u.skyShift.value = shift; u.skyGain.value = (ULTRA_GAIN[key] || 1) * (E.night ? 1 : 1); u.skyOn.value = 1;
  u.fogCol.value.copy(scene.fog.color);
  // the sky lights the scene and shows in the paint: the small HDR, turned the same way, through the PMREM filter
  const ek = key + '|' + Math.round(shift * 64);
  if (ek !== ultraEnvKey) {
    ultraEnvKey = ek;
    const W = hdr.W, H = hdr.H, roll = ((Math.round(shift * W) % W) + W) % W, d = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) { const r = y * W * 4; d.set(hdr.data.subarray(r + (W - roll) * 4, r + W * 4), r); d.set(hdr.data.subarray(r, r + (W - roll) * 4), r + roll * 4); }
    const dt = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType); dt.encoding = THREE.RGBEEncoding; dt.flipY = false;
    dt.minFilter = dt.magFilter = THREE.LinearFilter; dt.generateMipmaps = false; dt.needsUpdate = true;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromEquirectangular(dt); dt.dispose();
    scene.environment = envRT.texture;
  }
  hemi.intensity *= 0.45;   // the sky itself now gives the soft light
  return true;
}

// ---------- Textures (drawn once on canvases) ----------""")

# ---- the road texture: the photographed asphalt under the painted lines on Ultra
rep("""  const R = rng(kind.length * 17 + 3);
  TEX[key] = canvasTex(512, 1024, (g, w, h) => {
    pixels(g, w, h, (x, y) => {
      const n = fbm2(N1, x / 64, y / 64, 4, 8) * 0.5 + fbm2(N2, x / 8, y / 8, 2, 64) * 0.35;
      const grain = (R() - 0.5) * 0.22 + (R() < 0.04 ? 0.25 : 0);
      const u = x / w;
      let v = 0.28 + n * 0.06 + grain * 0.12;
      if (kind === 'track') v -= (Math.exp(-(((u - 0.4) / 0.09) ** 2)) + Math.exp(-(((u - 0.6) / 0.09) ** 2))) * 0.03;
      const line = (a, b) => u > a && u < b;
      let paint = null;
      if (kind === 'track') { if (line(0.012, 0.035) || line(0.965, 0.988)) paint = [0.82, 0.82, 0.8]; }
      else if (kind === 'city') { if (line(0.02, 0.035) || line(0.965, 0.98)) paint = [0.8, 0.8, 0.78]; if (line(0.493, 0.507) && (y % 512) < 256) paint = [0.82, 0.82, 0.8]; }
      else if (kind === 'country') { if (line(0.03, 0.05) || line(0.95, 0.97)) paint = [0.8, 0.8, 0.78]; if (line(0.478, 0.493) || line(0.507, 0.522)) paint = [0.85, 0.66, 0.12]; }
      if (paint) { const wear = 0.85 + n * 0.3 + grain * 0.2; return paint.map(c => Math.max(0, Math.min(255, c * wear * 255))); }
      const c = Math.max(0, Math.min(255, v * 255));
      return [c, c, c * 1.03];
    });""", """  const R = rng(kind.length * 17 + 3);
  const photo = ULTRA.ready && ULTRA.img.road_diff;   // Ultra: the photographed asphalt, tiled 6 x 12, under the paint
  const TW = photo ? 2048 : 512, TH = photo ? 4096 : 1024, dash = photo ? 2048 : 512;
  TEX[key] = canvasTex(TW, TH, (g, w, h) => {
    let base = null;
    if (photo) { for (let j = 0; j < 12; j++) for (let i = 0; i < 6; i++) g.drawImage(photo, i * w / 6, j * h / 12, w / 6, h / 12); base = g.getImageData(0, 0, w, h).data; }
    const lineAt = kind === 'track' ? u => u > 0.012 && u < 0.035 || u > 0.965 && u < 0.988
      : kind === 'city' ? u => u > 0.02 && u < 0.035 || u > 0.965 && u < 0.98 || u > 0.493 && u < 0.507
      : u => u > 0.03 && u < 0.05 || u > 0.95 && u < 0.97 || u > 0.478 && u < 0.493 || u > 0.507 && u < 0.522;
    pixels(g, w, h, (x, y) => {
      const u = x / w, o = (y * w + x) * 4;
      if (base && !lineAt(u)) {
        // the photo as it is, a shade darker where the tyres run
        const rub = kind === 'track' ? (Math.exp(-(((u - 0.4) / 0.09) ** 2)) + Math.exp(-(((u - 0.6) / 0.09) ** 2))) * 0.1 : 0;
        return [base[o] * (1 - rub), base[o + 1] * (1 - rub), base[o + 2] * (1 - rub)];
      }
      const n = fbm2(N1, x / 64, y / 64, 4, 8) * 0.5 + fbm2(N2, x / 8, y / 8, 2, 64) * 0.35;
      const grain = (R() - 0.5) * 0.22 + (R() < 0.04 ? 0.25 : 0);
      let v = 0.28 + n * 0.06 + grain * 0.12;
      if (kind === 'track') v -= (Math.exp(-(((u - 0.4) / 0.09) ** 2)) + Math.exp(-(((u - 0.6) / 0.09) ** 2))) * 0.03;
      const line = (a, b) => u > a && u < b;
      let paint = null;
      if (kind === 'track') { if (line(0.012, 0.035) || line(0.965, 0.988)) paint = [0.82, 0.82, 0.8]; }
      else if (kind === 'city') { if (line(0.02, 0.035) || line(0.965, 0.98)) paint = [0.8, 0.8, 0.78]; if (line(0.493, 0.507) && (y % dash) < dash / 2) paint = [0.82, 0.82, 0.8]; }
      else if (kind === 'country') { if (line(0.03, 0.05) || line(0.95, 0.97)) paint = [0.8, 0.8, 0.78]; if (line(0.478, 0.493) || line(0.507, 0.522)) paint = [0.85, 0.66, 0.12]; }
      if (paint) {
        const wear = 0.85 + n * 0.3 + grain * 0.2;
        if (base) { const k = 0.55 + (base[o] / 255) * 0.9; return paint.map(c => Math.max(0, Math.min(255, c * wear * k * 255))); }
        return paint.map(c => Math.max(0, Math.min(255, c * wear * 255)));
      }
      if (base) return [base[o], base[o + 1], base[o + 2]];
      const c = Math.max(0, Math.min(255, v * 255));
      return [c, c, c * 1.03];
    });""")
# the patches, cracks and tar snakes were sized for 512 x 1024: scale them with the canvas
rep("""    for (let i = 0; i < 7; i++) {
      const x = R() * w * 0.8 + w * 0.1, y = R() * h, pw = 30 + R() * 90, ph = 40 + R() * 160;""", """    const sc = w / 512;
    for (let i = 0; i < 7 * sc; i++) {
      const x = R() * w * 0.8 + w * 0.1, y = R() * h, pw = (30 + R() * 90) * sc, ph = (40 + R() * 160) * sc;""")
rep("""    for (let i = 0; i < 12; i++) {
      let x = R() * w, y = R() * h; g.lineWidth = 0.6 + R() * 0.9; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { x += (R() - 0.5) * 14; y += (R() - 0.3) * 16; g.lineTo(x, y); }""", """    for (let i = 0; i < 12 * sc; i++) {
      let x = R() * w, y = R() * h; g.lineWidth = (0.6 + R() * 0.9) * sc; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { x += (R() - 0.5) * 14 * sc; y += (R() - 0.3) * 16 * sc; g.lineTo(x, y); }""")
rep("""    for (let i = 0; i < 4; i++) {
      let x = R() * w, y = R() * h; g.lineWidth = 2 + R() * 2; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 10; k++) { x += (R() - 0.5) * 30; y += 20 + R() * 25; g.lineTo(x, y); }""", """    for (let i = 0; i < 4 * sc; i++) {
      let x = R() * w, y = R() * h; g.lineWidth = (2 + R() * 2) * sc; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 10; k++) { x += (R() - 0.5) * 30 * sc; y += (20 + R() * 25) * sc; g.lineTo(x, y); }""")

# ---- the circuit's materials: normal and roughness maps from the photographs
rep("""  const roadMat = lit(new THREE.MeshStandardMaterial({ map: roadTexture(rk, E.road === 2), normalMap: TEX.asphaltN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.85, metalness: 0 }));
  roadMat.userData.wetBase = 0.85;
  const surfMat = (tex, rough, rep) => { const m = lit(new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: 0, vertexColors: true })); m.userData.rep = rep; return m; };""",
"""  const roadMat = lit(new THREE.MeshStandardMaterial({ map: roadTexture(rk, E.road === 2), normalMap: ULTRA.ready ? ULTRA.tex.roadN : TEX.asphaltN, normalScale: new THREE.Vector2(ULTRA.ready ? 0.9 : 0.5, ULTRA.ready ? 0.9 : 0.5),
    roughnessMap: ULTRA.ready ? ULTRA.tex.roadR : null, roughness: ULTRA.ready ? 1.0 : 0.85, metalness: 0 }));
  roadMat.userData.wetBase = ULTRA.ready ? 1.0 : 0.85;
  const surfMat = (tex, rough, rep) => {
    const nm = tex.nmap;   // Ultra: the photograph's normal map rides along with its detail map
    const m = lit(new THREE.MeshStandardMaterial({ map: tex, normalMap: nm || null, normalScale: new THREE.Vector2(0.7, 0.7), roughness: rough, metalness: 0, vertexColors: true })); m.userData.rep = rep; return m; };""")
rep("""snow: surfMat(TEX.grassD, 0.7),""", """snow: surfMat(TEX.snowD || TEX.grassD, 0.7),""")

# ---- boot: the Ultra assets load after the cars
rep("""loadModels().catch(e => console.warn(e)).then(() => {
  setPlayerCar(carById(saved.car));""", """loadModels().catch(e => console.warn(e)).then(() => Q.ultra ? loadUltra((n, all) => ui.loading(true, 'Poly Racer', `Ultra textures and skies ${n} / ${all}`)) : null).then(() => {
  setPlayerCar(carById(saved.car));""")

# ---- version and notes
rep("""const VERSION = '2.2'""", """const VERSION = '2.3'""")
rep("""<span class="ver">2.2</span>""", """<span class="ver">2.3</span>""")
rep("""<h3>What's new in <span>2.2</span></h3>
      <ul>""", """<h3>What's new in <span>2.3</span></h3>
      <ul>
        <li>Ultra graphics: real photographed skies that light the cars and show in their paint, real asphalt, grass, gravel and sand with surface relief, 4k shadows</li>""")

# ---- the places that treated High as the top tier
rep("""N = settings.quality === 'low' ? 220 : custom ? 340 : 300, a = 0.72;""", """N = settings.quality === 'low' ? 220 : custom ? 340 : Q.ultra ? 380 : 300, a = 0.72;""")
rep("""im.castShadow = false; im.receiveShadow = settings.quality === 'high' && t.type !== 'tuft';""", """im.castShadow = false; im.receiveShadow = Q.shadows >= 2048 && t.type !== 'tuft';""")
rep("""- t.r > (settings.quality === 'high' ? 130 : 90);""", """- t.r > (Q.ultra ? 180 : settings.quality === 'high' ? 130 : 90);""")
rep("""  t.anisotropy = Math.min(8, MAX_ANISO);
  if (!opts.data) t.encoding = THREE.sRGBEncoding;""", """  t.anisotropy = Math.min(Q.ultra ? 16 : 8, MAX_ANISO);
  if (!opts.data) t.encoding = THREE.sRGBEncoding;""")
rep("""t.encoding = linear ? THREE.LinearEncoding : THREE.sRGBEncoding; t.anisotropy = Math.min(8, MAX_ANISO);""", """t.encoding = linear ? THREE.LinearEncoding : THREE.sRGBEncoding; t.anisotropy = Math.min(Q.ultra ? 16 : 8, MAX_ANISO);""")
rep("""  const N = 2600, box = 46, H = 26;""", """  const N = Q.ultra ? 4200 : 2600, box = 46, H = 26;""")
rep("""loading(true, 'Graphics: ' + v, 'Restarting');""", """loading(true, 'Graphics: ' + v[0].toUpperCase() + v.slice(1), 'Restarting');""")


# ================= Ultra, second pass: a look that is plainly different from High =================
# ---- ambient occlusion: a half-size depth pass of the scene, occlusion from the depth around each pixel, blurred and
# multiplied into the picture. Cars sit on the road, kerbs and barriers get contact shadow, cockpits gain depth.
rep("""  const comp = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, b: { value: null }, k: { value: 0.55 } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D t; uniform sampler2D b; uniform float k; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb + texture2D(b, vUv).rgb * k; vec2 q = vUv - 0.5;""",
    """  const comp = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, b: { value: null }, k: { value: 0.55 }, ao: { value: null }, aoK: { value: 0 } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D t; uniform sampler2D b; uniform float k; uniform sampler2D ao; uniform float aoK; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb * mix(1.0, texture2D(ao, vUv).r, aoK) + texture2D(b, vUv).rgb * k; vec2 q = vUv - 0.5;""")
rep("""  const quad = new THREE.Mesh(quadG, comp); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad);
  const oc = new THREE.Camera();
  function resize(w, h) {
    const pr = renderer.getPixelRatio(), W = Math.floor(w * pr), H = Math.floor(h * pr);
    if (rt) { rt.dispose(); bA.dispose(); bB.dispose(); }""",
    """  const quad = new THREE.Mesh(quadG, comp); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad);
  const oc = new THREE.Camera();
  // ----- Ultra: ambient occlusion from a half-size depth pass
  const AO = !!Q.ultra;
  let dRT = null, aA = null, aB = null, aoList = [], aoListT = 0;
  const depthM = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const aoMat = new THREE.ShaderMaterial({ uniforms: { tD: { value: null }, px: { value: new THREE.Vector2() }, near: { value: 0.3 }, far: { value: 1000 }, proj: { value: 1 }, radius: { value: 0.6 }, strength: { value: 1.0 } },
    vertexShader: VS, depthTest: false, depthWrite: false, fragmentShader: `#include <packing>
uniform sampler2D tD; uniform vec2 px; uniform float near; uniform float far; uniform float proj; uniform float radius; uniform float strength; varying vec2 vUv;
float lin(vec2 uv) { return -perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(tD, uv)), near, far); }
void main() {
  float z = lin(vUv);
  if (z > 260.0) { gl_FragColor = vec4(1.0); return; }
  float rp = radius * proj / z;   // the radius in pixels at this depth
  float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  float occ = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = n + float(i) * 2.399963;
    float rr = rp * (0.2 + 0.8 * fract(float(i) * 0.618034 + n * 0.1));
    vec2 o = vec2(cos(a), sin(a)) * rr * px;
    float zs = lin(vUv + o);
    float dz = z - zs;   // the sampled point is in front of this one by dz
    float hit = step(0.04 + z * 0.004, dz) * (1.0 - smoothstep(radius * 1.5, radius * 3.0, dz));
    occ += hit;
  }
  float ao = 1.0 - occ / 12.0 * strength;
  gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
}` });
  function aoDepthFor(m) {
    // leaves and fences keep their cut-outs in the depth pass; everything else is solid
    if (!m) return depthM;
    if (m.map && m.alphaTest > 0) { if (!m.userData.aoDepth) m.userData.aoDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m.map, alphaTest: m.alphaTest, side: m.side }); return m.userData.aoDepth; }
    return depthM;
  }
  function aoDepthPass(s, c) {
    if (performance.now() - aoListT > 1500) {
      aoListT = performance.now(); aoList = [];
      s.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.material && o !== sky) aoList.push(o); });
    }
    const swaps = [];
    for (const o of aoList) {
      const m = o.material; if (!m || Array.isArray(m)) continue;
      if (m.transparent && !m.depthWrite) { if (o.visible) { o.visible = false; swaps.push([o, m, true]); } continue; }
      swaps.push([o, m, false]); o.material = aoDepthFor(m);
    }
    const skyWas = sky.visible; sky.visible = false;
    renderer.setRenderTarget(dRT); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(s, c);
    sky.visible = skyWas;
    for (const [o, m, hidden] of swaps) { if (hidden) o.visible = true; else o.material = m; }
    const u = aoMat.uniforms; u.tD.value = dRT.texture; u.near.value = c.near; u.far.value = c.far;
    u.proj.value = 0.5 * dRT.height / Math.tan(c.fov * Math.PI / 360); u.px.value.set(1 / dRT.width, 1 / dRT.height);
    u.radius.value = camMode === 2 ? 0.35 : 0.7; u.strength.value = 1.15;
    pass(aoMat, aA);
    blur.uniforms.t.value = aA.texture; blur.uniforms.d.value.set(1 / aA.width, 0); pass(blur, aB);
    blur.uniforms.t.value = aB.texture; blur.uniforms.d.value.set(0, 1 / aA.height); pass(blur, aA);
  }
  function resize(w, h) {
    const pr = renderer.getPixelRatio(), W = Math.floor(w * pr), H = Math.floor(h * pr);
    if (rt) { rt.dispose(); bA.dispose(); bB.dispose(); }
    if (AO) {
      if (dRT) { dRT.dispose(); aA.dispose(); aB.dispose(); }
      const ao = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      dRT = new THREE.WebGLRenderTarget(W >> 1, H >> 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      aA = new THREE.WebGLRenderTarget(W >> 1, H >> 1, ao); aB = new THREE.WebGLRenderTarget(W >> 1, H >> 1, ao);
    }""")
rep("""      if (!rt) resize(innerWidth, innerHeight);
      renderer.setRenderTarget(rt); renderer.render(s, c);
      bright.uniforms.t.value = rt.texture; pass(bright, bA);""",
    """      if (!rt) resize(innerWidth, innerHeight);
      if (AO) { aoDepthPass(s, c); comp.uniforms.ao.value = aA.texture; comp.uniforms.aoK.value = 1.0; }
      renderer.setRenderTarget(rt); renderer.render(s, c);
      bright.uniforms.t.value = rt.texture; pass(bright, bA);""")

# ---- the asphalt reads as asphalt: darker, more contrast, stronger relief
rep("""        const rub = kind === 'track' ? (Math.exp(-(((u - 0.4) / 0.09) ** 2)) + Math.exp(-(((u - 0.6) / 0.09) ** 2))) * 0.1 : 0;
        return [base[o] * (1 - rub), base[o + 1] * (1 - rub), base[o + 2] * (1 - rub)];""",
    """        const rub = kind === 'track' ? (Math.exp(-(((u - 0.4) / 0.09) ** 2)) + Math.exp(-(((u - 0.6) / 0.09) ** 2))) * 0.1 : 0;
        const tone = c => Math.max(0, Math.min(255, ((c - 118) * 1.4 + 92) * (1 - rub)));
        return [tone(base[o]), tone(base[o + 1]), tone(base[o + 2])];""")
rep("""normalScale: new THREE.Vector2(ULTRA.ready ? 0.9 : 0.5, ULTRA.ready ? 0.9 : 0.5),""", """normalScale: new THREE.Vector2(ULTRA.ready ? 1.5 : 0.5, ULTRA.ready ? 1.5 : 0.5),""")
# ---- the terrain's grass tiles finer, so the detail shows from the road
rep("""  if (MAT.ground) { MAT.ground.map = T.grass; MAT.ground.normalMap = T.grass.nmap; MAT.ground.normalScale = new THREE.Vector2(0.45, 0.45); MAT.ground.needsUpdate = true; }""",
    """  if (MAT.ground) { const gf = T.grass.clone(); gf.repeat.set(2.5, 2.5); gf.needsUpdate = true; MAT.ground.map = gf; MAT.ground.normalMap = T.grass.nmap; MAT.ground.normalScale = new THREE.Vector2(0.8, 0.8); MAT.ground.needsUpdate = true; }""")
# ---- the sky does more of the lighting, the hemisphere light less
rep("""  hemi.intensity *= 0.45;   // the sky itself now gives the soft light""", """  hemi.intensity *= 0.3;   // the sky itself now gives the soft light""")

# ---- Ultra trees: photographed pine twigs make the conifers' branch skirts
rep("""      jobs.push(loadImage('ultra/tex/' + k + '_' + t + '.jpg' + v).then(im => { ULTRA.img[k + '_' + t] = im; }));
    }""", """      jobs.push(loadImage('ultra/tex/' + k + '_' + t + '.jpg' + v).then(im => { ULTRA.img[k + '_' + t] = im; }));
    }
    jobs.push(loadImage('ultra/tex/twig.png' + v).then(im => { ULTRA.img.twig = im; }));""")
rep("""    // right: leaf clusters
    for (let i = 0; i < 2600; i++) {""", """    if (ULTRA.ready && ULTRA.img.twig) {
      // Ultra: photographed pine twigs (grey, the tree's colour comes from its vertices) fill the skirt instead of strokes
      g.clearRect(0, 0, 256, 512);
      g.save(); g.beginPath(); g.rect(0, 0, 256, 512); g.clip();
      for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) {
        g.save(); g.translate(i * 100 + 30 + (j % 2) * 50, j * 140 + 60); g.rotate((R() - 0.5) * 0.9); g.drawImage(ULTRA.img.twig, -115, -115, 230, 230); g.restore();
      }
      g.restore();
      // the skirt tapers to the tip at the top and frays at the bottom
      const id = g.getImageData(0, 0, 256, 512), d = id.data;
      for (let y = 0; y < 512; y++) { const half = 18 + (y / 512) * 110, fray = y > 470 ? (512 - y) / 42 : 1; for (let x = 0; x < 256; x++) { const o = (y * 256 + x) * 4; if (Math.abs(x - 128) > half || R() > fray) d[o + 3] = 0; } }
      g.putImageData(id, 0, 0);
    }
    // right: leaf clusters
    for (let i = 0; i < 2600; i++) {""")

open(p, 'w').write(s); print('ultra patch applied')
