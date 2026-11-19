// Surfaces and light.
//
// Textures: every model is vertex-coloured, and each vertex also carries a
// surface id (aMat: wood, fabric, metal, cardboard...). One shared material
// reads it to pick a procedural detail texture (projected from world space
// on all three axes, so nothing needs UVs), a roughness and a metalness.
//
// Light: the ceiling has a fluorescent fitting every 6 m, forever. Instead of
// thousands of real lights, the shader works out the nine fittings nearest
// each pixel and lights it from them (diffuse plus a glossy highlight), so
// you get pools of light on the floor and reflections in its polish. At
// night the fittings go out, except the emergency ones (one in nine), which
// glow orange.
import * as THREE from 'three';

export const SURF = { paint: 0, wood: 1, fabric: 2, metal: 3, card: 4, plastic: 5, concrete: 6, floor: 7, skin: 8, steel: 9 };
export const FIX = { spacing: 6, len: 2.4, wid: 0.5 };

export const uniforms = {
  uDetail: { value: null },
  uLevel: { value: 1 },    // main lights, 0..1
  uEmerg: { value: 0 },    // emergency lights, 0..1
  uCeil: { value: 6.5 },
  uGain: { value: 1 },
  uRed: { value: 0 },      // Crimson Night
  // Closing time and opening time ripple out from the player: fittings
  // within uCutR of uCutC are at uCutIn, the rest at uLevel.
  uCutC: { value: new THREE.Vector2() },
  uCutR: { value: 0 },
  uCutIn: { value: 1 },
};

// ---- Detail texture: R wood grain, G fabric weave, B card fibre, A plaster.
function makeDetail() {
  const N = 256, data = new Uint8Array(N * N * 4);
  const lat = (P, seed) => { const a = new Float32Array(P * P); let s = seed; for (let i = 0; i < a.length; i++) { s = (s * 16807) % 2147483647; a[i] = s / 2147483647; } return a; };
  // tileable value noise: period P lattice cells across the texture
  const noise = (tab, P, u, v) => {
    const x = u * P, y = v * P, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const g = (i, j) => tab[((j % P + P) % P) * P + ((i % P + P) % P)];
    const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const tabs = [4, 8, 16, 32, 64, 128].map((P, i) => [P, lat(P, 1234 + i * 977)]);
  const fbm = (u, v, from, to) => { let s = 0, w = 0, amp = 1; for (let o = from; o <= to; o++) { s += noise(tabs[o][1], tabs[o][0], u, v) * amp; w += amp; amp *= 0.55; } return s / w; };
  const grainTab = lat(8, 99);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = (y * N + x) * 4;
    // wood: long wavy grain lines running along v
    const warp = noise(grainTab, 8, u * 0.5, v * 0.125) * 2.2 + fbm(u, v, 1, 2) * 0.8;
    const ring = 0.5 + 0.5 * Math.sin((u * 26 + warp) * Math.PI * 2);
    const wood = 0.32 + 0.38 * Math.pow(ring, 3) + 0.3 * fbm(u * 1, v, 3, 5);
    // fabric: fine over-under weave with slubs
    const tx = x % 4, ty = y % 4, over = ((x >> 2) + (y >> 2)) & 1;
    const thread = over ? (tx === 0 ? 0.25 : 0.65 + 0.1 * Math.sin(ty * 1.6)) : (ty === 0 ? 0.25 : 0.6 + 0.1 * Math.sin(tx * 1.6));
    const fabric = thread * 0.75 + fbm(u, v, 3, 5) * 0.25 + 0.05;
    // card: fibres and the odd crease
    const card = 0.35 + 0.4 * fbm(u, v, 4, 5) + 0.25 * fbm(u, v, 1, 2);
    // plaster / concrete
    const plaster = 0.2 + 0.6 * fbm(u, v, 2, 5) + (noise(tabs[5][1], 128, u, v) > 0.93 ? -0.2 : 0);
    data[i] = Math.max(0, Math.min(255, wood * 255));
    data[i + 1] = Math.max(0, Math.min(255, fabric * 255));
    data[i + 2] = Math.max(0, Math.min(255, card * 255));
    data[i + 3] = Math.max(0, Math.min(255, plaster * 255));
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
uniforms.uDetail.value = makeDetail();

const VERT_HEAD = /* glsl */`
attribute float aMat;
varying float vMat;
varying vec3 vWP;
varying vec3 vWN;
`;
const VERT_BODY = /* glsl */`
vMat = aMat;
vec4 esW = vec4(transformed, 1.0);
vec3 esN = objectNormal;
#ifdef USE_INSTANCING
esW = instanceMatrix * esW;
esN = mat3(instanceMatrix) * esN;
#endif
esW = modelMatrix * esW;
vWP = esW.xyz;
vWN = normalize(mat3(modelMatrix) * esN);
`;
const FRAG_HEAD = /* glsl */`
uniform sampler2D uDetail;
uniform float uLevel, uEmerg, uCeil, uGain, uRed, uCutR, uCutIn;
uniform vec2 uCutC;
varying float vMat;
varying vec3 vWP;
varying vec3 vWN;
vec4 esTri(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
  return texture2D(uDetail, p.zy * 0.62) * w.x + texture2D(uDetail, p.xz * 0.62) * w.y + texture2D(uDetail, p.xy * 0.62) * w.z;
}
`;
const FRAG_COLOR = /* glsl */`
int esM = int(vMat + 0.5);
vec4 esD = esTri(vWP, vWN);
float esDet = 0.5, esStr = 0.0, esRough = 0.8, esMetal = 0.0;
if (esM == 0) { esDet = esD.a; esStr = 0.16; esRough = 0.88; }
else if (esM == 1) { esDet = esD.r; esStr = 0.3; esRough = 0.55; }
else if (esM == 2) { esDet = esD.g; esStr = 0.4; esRough = 0.96; }
else if (esM == 3) { esDet = esD.a; esStr = 0.12; esRough = 0.28; esMetal = 0.85; }
else if (esM == 4) { esDet = esD.b; esStr = 0.45; esRough = 0.95; }
else if (esM == 5) { esDet = esD.a; esStr = 0.05; esRough = 0.32; }
else if (esM == 6) { esDet = esD.a; esStr = 0.16; esRough = 0.9; }
else if (esM == 7) { esDet = esD.a; esStr = 0.1; esRough = 0.22; }
else if (esM == 8) { esDet = 0.5; esStr = 0.0; esRough = 0.6; }
else if (esM == 9) { esDet = esD.a; esStr = 0.1; esRough = 0.42; esMetal = 0.4; }
diffuseColor.rgb *= 1.0 + (esDet - 0.5) * 2.0 * esStr;
// a touch of occlusion where things meet the floor
if (esM != 7) diffuseColor.rgb *= mix(0.66, 1.0, smoothstep(0.0, 0.45, vWP.y));
`;
const FRAG_LIGHTS = /* glsl */`
{
  vec3 esNr = normalize(vWN);
  vec3 esV = normalize(cameraPosition - vWP);
  vec3 esAcc = vec3(0.0);
  float esShin = min(2.0 / max(0.0016, pow(roughnessFactor, 4.0)), 900.0);
  vec3 esF0 = mix(vec3(0.04), diffuseColor.rgb, metalnessFactor);
#ifdef ES_LOW
  // low graphics: only the four nearest fittings
  vec2 esC0 = floor(vWP.xz / ${FIX.spacing.toFixed(1)} - 0.5) + 1.0;
  for (int i = -1; i <= 0; i++) for (int j = -1; j <= 0; j++) {
#else
  vec2 esC0 = floor(vWP.xz / ${FIX.spacing.toFixed(1)});
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
#endif
    vec2 c = esC0 + vec2(float(i), float(j));
    vec3 lp = vec3(c.x * ${FIX.spacing.toFixed(1)} + ${(FIX.spacing / 2).toFixed(1)}, uCeil - 0.1, c.y * ${FIX.spacing.toFixed(1)} + ${(FIX.spacing / 2).toFixed(1)});
    lp.x = clamp(vWP.x, lp.x - ${(FIX.len / 2).toFixed(2)}, lp.x + ${(FIX.len / 2).toFixed(2)});
    vec3 L = lp - vWP; float d2 = max(dot(L, L), 0.05); L *= inversesqrt(d2);
    float sel = mix(step(mod(c.x * 7.0 + c.y * 13.0, 9.0), 0.5), step(mod(c.x * 7.0 + c.y * 13.0, 3.0), 0.5), uRed);
    float em = sel * uEmerg;
    float lvl = distance(c * ${FIX.spacing.toFixed(1)} + ${(FIX.spacing / 2).toFixed(1)}, uCutC) < uCutR ? uCutIn : uLevel;
    float I = lvl + em * mix(0.3, 0.45, uRed);
    if (I < 0.002) continue;
    vec3 emCol = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.06, 0.03), uRed);
    vec3 col = mix(vec3(1.0, 0.96, 0.88), emCol, clamp(em * (1.0 - lvl * 3.0), 0.0, 1.0));
    float att = I / (1.0 + 0.1 * d2) * smoothstep(170.0, 70.0, d2);
    float ndl = max(dot(esNr, L), 0.0);
    vec3 H = normalize(L + esV);
    float spec = pow(max(dot(esNr, H), 0.0), esShin) * (esShin + 8.0) / 25.13;
    esAcc += col * att * ndl * (diffuseColor.rgb * (1.0 - metalnessFactor) * 0.3183 + esF0 * spec * 0.25);
  }
  outgoingLight += esAcc * uGain;
}
`;

// Turn a MeshStandardMaterial into a store material.
const ALL = [];
let low = false;
export function setLowQuality(on) {
  low = !!on;
  for (const m of ALL) { if (low) m.defines.ES_LOW = ''; else delete m.defines.ES_LOW; m.needsUpdate = true; }
}
export function storeMaterial(params = {}) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.8, metalness: 0 }, params));
  m.defines = low ? { ES_LOW: '' } : {};
  ALL.push(m);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = esRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = esMetal;')
      .replace('#include <opaque_fragment>', FRAG_LIGHTS + '\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'store' + (params.map ? 'm' : '') + (params.transparent ? 't' : '') + (low ? 'l' : '');
  return m;
}

export const furnitureMaterial = storeMaterial();
export const staticMaterial = storeMaterial();
export const characterMaterial = storeMaterial();

// ---- Soft contact shadows under everything that stands on something.
function shadowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
  x.filter = 'blur(10px)';
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(26, 26, 76, 76, 14); x.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}
export const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex(), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
export const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// Flat shadow quads for a chunk's fixed shelving, walls and counters.
export class ShadowBuilder {
  constructor() { this.pos = []; this.uv = []; this.idx = []; this.n = 0; }
  rect(x0, z0, x1, z1, y = 0.004, pad = 0.35) {
    // the texture's soft edge sits in its outer 20%, so grow the quad to match
    const w = (x1 - x0) + pad * 2, d = (z1 - z0) + pad * 2, ex = w * 0.26, ez = d * 0.26;
    const a = x0 - pad - ex, b = x1 + pad + ex, c = z0 - pad - ez, e = z1 + pad + ez;
    this.pos.push(a, y, e, b, y, e, b, y, c, a, y, c);
    this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const n = this.n; this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3); this.n += 4;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---- The fittings themselves: an instanced grid that follows the camera.
export function makeFixtures(scene) {
  const R = 11, n = (R * 2 + 1) ** 2;
  const geo = new THREE.BoxGeometry(FIX.len, 0.06, FIX.wid);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  mesh.frustumCulled = false;
  // housings: a darker rim around each panel
  const rim = new THREE.InstancedMesh(new THREE.BoxGeometry(FIX.len + 0.16, 0.05, FIX.wid + 0.16), new THREE.MeshBasicMaterial({ color: 0x8d8b86 }), n);
  rim.frustumCulled = false;
  scene.add(rim, mesh);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  let cx = 1e9, cz = 1e9, lastKey = '';
  const day = new THREE.Color(1.6, 1.55, 1.42), emerg = new THREE.Color(1.5, 0.45, 0.12), redEm = new THREE.Color(1.6, 0.05, 0.03), off = new THREE.Color(0.09, 0.09, 0.1);
  return {
    update(x, z, level, emergLevel, ceil) {
      const ncx = Math.floor(x / FIX.spacing), ncz = Math.floor(z / FIX.spacing);
      const cut = uniforms.uCutR.value;
      const key = ncx + ',' + ncz + ',' + level.toFixed(2) + ',' + emergLevel.toFixed(2) + ',' + uniforms.uRed.value + ',' + cut.toFixed(1);
      if (key === lastKey) return;
      const moved = ncx !== cx || ncz !== cz;
      lastKey = key; cx = ncx; cz = ncz;
      let k = 0;
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
        const gx = cx + i, gz = cz + j;
        if (moved) {
          m4.makeTranslation(gx * FIX.spacing + FIX.spacing / 2, ceil - 0.03, gz * FIX.spacing + FIX.spacing / 2);
          mesh.setMatrixAt(k, m4);
          m4.makeTranslation(gx * FIX.spacing + FIX.spacing / 2, ceil - 0.015, gz * FIX.spacing + FIX.spacing / 2);
          rim.setMatrixAt(k, m4);
        }
        const red = uniforms.uRed.value > 0.5;
        const isEm = ((((gx * 7 + gz * 13) % (red ? 3 : 9)) + (red ? 3 : 9)) % (red ? 3 : 9)) === 0;
        const fx = gx * FIX.spacing + FIX.spacing / 2, fz = gz * FIX.spacing + FIX.spacing / 2;
        const lv = cut > 0 && Math.hypot(fx - uniforms.uCutC.value.x, fz - uniforms.uCutC.value.y) < cut ? uniforms.uCutIn.value : level;
        col.copy(off).lerp(day, lv);
        if (isEm && emergLevel > 0) col.lerp(red ? redEm : emerg, emergLevel * (1 - Math.min(1, lv * 3)));
        mesh.setColorAt(k, col);
        k++;
      }
      if (moved) { mesh.instanceMatrix.needsUpdate = true; rim.instanceMatrix.needsUpdate = true; }
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---- Dust drifting in the air near the camera.
export function makeDust(scene) {
  const N = 260, S = 14;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * S; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = (Math.random() - 0.5) * S;
    vel[i * 3] = (Math.random() - 0.5) * 0.05; vel[i * 3 + 1] = (Math.random() - 0.5) * 0.03; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({ size: 0.018, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55, depthWrite: false, color: 0xfff4dc, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  scene.add(pts);
  let ox = 0, oz = 0;
  return {
    update(dt, cx, cz, level) {
      mat.opacity = 0.32 * level;
      pts.visible = level > 0.05;
      // keep the cloud centred on the camera by wrapping particles around it
      for (let i = 0; i < N; i++) {
        let px = pos[i * 3] + vel[i * 3] * dt, py = pos[i * 3 + 1] + vel[i * 3 + 1] * dt, pz = pos[i * 3 + 2] + vel[i * 3 + 2] * dt;
        const rx = px - cx, rz = pz - cz;
        if (rx > S / 2) px -= S; else if (rx < -S / 2) px += S;
        if (rz > S / 2) pz -= S; else if (rz < -S / 2) pz += S;
        if (py > 6) py -= 6; else if (py < 0) py += 6;
        pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = pz;
      }
      g.attributes.position.needsUpdate = true;
      ox = cx; oz = cz;
    },
  };
}
