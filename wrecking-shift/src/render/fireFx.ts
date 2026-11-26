import * as THREE from 'three';
import type { FireCluster, FireVisitor } from '../sim/fire';
import type { V3 } from '../sim/vec';

/** What the fx needs from the fire simulation (FireSystem implements it). */
export interface FireSource {
  count(): number;
  forEachFire(cb: FireVisitor, max?: number, offset?: number): number;
  clusters(cell?: number, max?: number): FireCluster[];
}

export type FxQuality = 'low' | 'medium' | 'high';

const QUALITY: Record<FxQuality, { flames: number; smoke: number; lights: number }> = {
  low: { flames: 500, smoke: 250, lights: 2 },
  medium: { flames: 1000, smoke: 500, lights: 4 },
  high: { flames: 1500, smoke: 800, lights: 6 },
};
const MAX_FLAMES = 1500;
const MAX_SMOKE = 800;
const MAX_LIGHTS = 6;

/** particle kinds (packed into the shader data) */
const K_FLAME = 0, K_EMBER = 1, K_SMOKE = 0, K_DUST = 1, K_BLAST = 2;

// ------------------------------------------------------------------ procedural sprite textures

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** deterministic tiny PRNG for texture generation */
function prng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** soft puffy smoke blob: R channel = density (several overlapping soft circles + speckle) */
function smokeTexture(): THREE.Texture {
  return canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'lighter';
    const r = prng(7);
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = r() * s * 0.2;
      const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d;
      const rad = s * (0.16 + r() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.32)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    // soften the outer edge so no square shows
    ctx.globalCompositeOperation = 'destination-in';
    const m = ctx.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s * 0.5);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = m; ctx.fillRect(0, 0, s, s);
  });
}

/** flame tongue: soft core, slightly pointed top (R channel) */
function flameTexture(): THREE.Texture {
  return canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'lighter';
    const blob = (x: number, y: number, rx: number, ry: number, a: number) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.45, `rgba(255,255,255,${a * 0.55})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    blob(s * 0.5, s * 0.62, s * 0.34, s * 0.34, 0.85);
    blob(s * 0.5, s * 0.42, s * 0.22, s * 0.36, 0.6);
    blob(s * 0.5, s * 0.25, s * 0.1, s * 0.22, 0.45);
  });
}

// ------------------------------------------------------------------ shaders

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData; // size, age 0..1, seed, kind
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vKind;
#include <fog_pars_vertex>
uniform float uStretch;
#ifdef SMOKE_LIT
uniform vec3 uAmbient;
uniform vec4 uFireLights[${MAX_LIGHTS}]; // xyz, intensity
uniform vec3 uSunDir; uniform vec3 uSunLight; // toward the sun; sun radiance for smoke (0 = unlit rig: uAmbient only)
varying vec3 vLit;
#endif
void main() {
  vAge = iData.y; vSeed = iData.z; vKind = floor(iData.w);
  #ifdef SMOKE_LIT
    // per-particle lighting: sky fill + sun (visibility from CPU rays, packed in the fraction of iData.w) with
    // forward scattering, so smoke between the viewer and a low sun glows + warm light from the nearby fires
    float sunVis = fract(iData.w) / 0.9;
    vec3 toP = normalize(iPos - cameraPosition);
    float fwd = max(dot(toP, uSunDir), 0.0);
    float phase = 0.55 + 0.35 * max(dot(-toP, uSunDir), 0.0) + 1.6 * pow(fwd, 5.0);
    vLit = uAmbient + uSunLight * sunVis * phase;
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec3 d = uFireLights[i].xyz - iPos;
      vLit += vec3(1.0, 0.5, 0.2) * uFireLights[i].w / (1.0 + dot(d, d) * 0.5);
    }
  #endif
  vUv = position.xy * 0.5 + 0.5;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  float a = (vSeed - 0.5) * uSpin + vAge * (vSeed - 0.5) * 2.0;
  vec2 c = position.xy * vec2(1.0, 1.0 + uStretch * step(vKind, 0.5));
  float ca = cos(a), sa = sin(a);
  c = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
  mvPosition.xy += c * iData.x * 0.5;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FLAME_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vKind;
#include <fog_pars_fragment>
void main() {
  float t = vAge;
  vec3 col;
  float a;
  if (vKind < 0.5) {
    float d = texture2D(uTex, vUv).r;
    // white-yellow core -> orange -> deep red, fading out
    col = mix(vec3(1.0, 0.78, 0.4) * 1.7, vec3(1.0, 0.38, 0.07) * 1.4, smoothstep(0.02, 0.3, t));
    col = mix(col, vec3(0.55, 0.09, 0.02), smoothstep(0.45, 0.9, t));
    a = d * smoothstep(0.0, 0.08, t) * pow(1.0 - t, 1.3);
  } else {
    // ember: small hard glowing dot that cools down
    vec2 p = vUv - 0.5;
    float d = max(0.0, 1.0 - dot(p, p) * 4.0);
    col = mix(vec3(1.0, 0.7, 0.3) * 3.0, vec3(0.9, 0.2, 0.03) * 1.5, t);
    a = d * d * (1.0 - t) * (0.6 + 0.4 * sin(vSeed * 40.0 + t * 30.0));
  }
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogF = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    a *= 1.0 - fogF;
  #endif
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SMOKE_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uTint;
varying vec3 vLit;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vKind;
#include <fog_pars_fragment>
void main() {
  float t = vAge;
  float d = texture2D(uTex, vUv).r;
  vec3 L = uTint * vLit;
  vec3 col;
  float a;
  if (vKind < 0.5) {
    // fire smoke: dark, lightening as it thins out; glows warm right above the flames
    col = mix(vec3(0.07, 0.065, 0.06), vec3(0.32, 0.31, 0.3), smoothstep(0.0, 0.8, t) * (0.5 + 0.5 * vSeed)) * L;
    col += vec3(1.0, 0.38, 0.08) * 0.9 * pow(max(0.0, 1.0 - t * 5.0), 2.0);
    a = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.45, 1.0, t)) * 0.75;
  } else if (vKind < 1.5) {
    // dust: light brownish grey
    col = mix(vec3(0.5, 0.46, 0.4), vec3(0.62, 0.6, 0.56), vSeed) * L;
    a = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.3, 1.0, t)) * 0.55;
  } else {
    // blast smoke: grey with a short hot start
    col = mix(vec3(0.1, 0.095, 0.09), vec3(0.34, 0.33, 0.32), smoothstep(0.0, 0.7, t) * (0.4 + 0.6 * vSeed)) * L;
    col += vec3(1.0, 0.45, 0.12) * 2.0 * pow(max(0.0, 1.0 - t * 12.0), 3.0);
    a = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.5, 1.0, t)) * 0.7;
  }
  gl_FragColor = vec4(col, a * d);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// ------------------------------------------------------------------ particle pool

/** dense CPU particle pool drawn as one instanced camera-facing quad mesh */
class Pool {
  n = 0;
  limit: number;
  readonly p: Float32Array;
  readonly v: Float32Array;
  readonly life: Float32Array; // seconds lived
  readonly max: Float32Array; // lifetime
  readonly size0: Float32Array;
  readonly size1: Float32Array;
  readonly seed: Float32Array;
  readonly kind: Uint8Array;
  /** sun visibility 0..1 (smoke lighting; 1 when nobody updates it) */
  readonly vis: Float32Array;
  readonly mesh: THREE.Mesh;
  private aPos: THREE.InstancedBufferAttribute;
  private aData: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private order: Uint16Array;
  private depth: Float32Array;

  constructor(readonly cap: number, mat: THREE.ShaderMaterial, renderOrder: number) {
    this.limit = cap;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.size0 = new Float32Array(cap); this.size1 = new Float32Array(cap);
    this.seed = new Float32Array(cap); this.kind = new Uint8Array(cap); this.vis = new Float32Array(cap).fill(1);
    this.order = new Uint16Array(cap); this.depth = new Float32Array(cap);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aData.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iData', this.aData);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** extra buoyancy (m/s²) of kind-2 particles, decaying over ~2.5 s (blast smoke columns) */
  blastLift = 0;
  /** sun visibility given to particles added from now on */
  spawnVis = 1;
  /** returns the new particle index or -1 when full */
  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, kind: number): number {
    if (this.n >= this.limit) return -1;
    const i = this.n++;
    const o = i * 3;
    this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z;
    this.v[o] = vx; this.v[o + 1] = vy; this.v[o + 2] = vz;
    this.life[i] = 0; this.max[i] = life; this.size0[i] = s0; this.size1[i] = s1;
    this.seed[i] = Math.random(); this.kind[i] = kind; this.vis[i] = this.spawnVis;
    return i;
  }

  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    const o = i * 3, q = j * 3;
    this.p[o] = this.p[q]; this.p[o + 1] = this.p[q + 1]; this.p[o + 2] = this.p[q + 2];
    this.v[o] = this.v[q]; this.v[o + 1] = this.v[q + 1]; this.v[o + 2] = this.v[q + 2];
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size0[i] = this.size0[j]; this.size1[i] = this.size1[j];
    this.seed[i] = this.seed[j]; this.kind[i] = this.kind[j]; this.vis[i] = this.vis[j];
  }

  /** integrate: velocity damping, buoyancy, wind with height, swirl */
  step(dt: number, buoy: number, damp: number, wind: THREE.Vector3, windGain: number, swirl: number, time: number): void {
    const k = Math.exp(-damp * dt);
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) { this.kill(i); i--; continue; }
      const o = i * 3;
      const t = this.life[i] / this.max[i];
      const sd = this.seed[i] * 6.283;
      const w = windGain * Math.min(1, 0.3 + t);
      const sx = swirl * Math.sin(time * 2.1 + sd + this.p[o + 1] * 1.7);
      const sz = swirl * Math.cos(time * 1.7 + sd * 1.3 + this.p[o + 1] * 1.3);
      this.v[o] = (this.v[o] - wind.x * w) * k + wind.x * w + sx * dt;
      // blast smoke (kind 2 in the smoke pool) keeps rising as a column for the first seconds
      const lift = this.blastLift > 0 && this.kind[i] === 2 ? this.blastLift * Math.exp(-this.life[i] / 2.5) : 0;
      this.v[o + 1] = this.v[o + 1] * k + (buoy + lift) * dt;
      this.v[o + 2] = (this.v[o + 2] - wind.z * w) * k + wind.z * w + sz * dt;
      this.p[o] += this.v[o] * dt; this.p[o + 1] += this.v[o + 1] * dt; this.p[o + 2] += this.v[o + 2] * dt;
    }
  }

  /** write GPU buffers (optionally sorted back-to-front for alpha blending) */
  upload(cam: THREE.Camera | null, sizeCurve: (t: number) => number): void {
    const n = this.n;
    const P = this.aPos.array as Float32Array, D = this.aData.array as Float32Array;
    const ord = this.order;
    for (let i = 0; i < n; i++) ord[i] = i;
    if (cam && n > 1) {
      const e = cam.matrixWorld.elements;
      const fx = -e[8], fy = -e[9], fz = -e[10];
      const cx = e[12], cy = e[13], cz = e[14];
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        this.depth[i] = (this.p[o] - cx) * fx + (this.p[o + 1] - cy) * fy + (this.p[o + 2] - cz) * fz;
      }
      const d = this.depth;
      const sub = ord.subarray(0, n);
      sub.sort((a, b) => d[b] - d[a]);
    }
    for (let k = 0; k < n; k++) {
      const i = ord[k];
      const o = i * 3;
      const t = this.life[i] / this.max[i];
      P[k * 3] = this.p[o]; P[k * 3 + 1] = this.p[o + 1]; P[k * 3 + 2] = this.p[o + 2];
      D[k * 4] = (this.size0[i] + (this.size1[i] - this.size0[i]) * sizeCurve(t));
      D[k * 4 + 1] = t; D[k * 4 + 2] = this.seed[i]; D[k * 4 + 3] = this.kind[i] + Math.min(1, Math.max(0, this.vis[i])) * 0.9;
    }
    this.geo.instanceCount = n;
    if (n) {
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, n * 3); this.aPos.needsUpdate = true;
      this.aData.clearUpdateRanges(); this.aData.addUpdateRange(0, n * 4); this.aData.needsUpdate = true;
    }
    this.mesh.visible = n > 0;
  }

  clear(): void { this.n = 0; this.geo.instanceCount = 0; this.mesh.visible = false; }
}

// ------------------------------------------------------------------ fire fx

interface FireLight {
  light: THREE.PointLight;
  x: number; y: number; z: number;
  target: number;
  cur: number;
  phase: number;
}

/**
 * Flames, embers, smoke and flickering fire lights. Presentation only (Math.random is fine here).
 * Add `root` to the scene, call `update()` every frame with the fire source.
 */
export class FireFx {
  readonly root = new THREE.Group();
  /** wind (m/s) that smoke and embers drift with */
  readonly wind = new THREE.Vector3(0.7, 0, 0.3);
  /** smoke colour multiplier (darker at night) */
  readonly smokeTint = new THREE.Color(1, 1, 1);
  /**
   * scene light level for the (unlit) smoke sprites, 1 = the default daylight rig. FireModule estimates it from the
   * scene's lights; set it yourself for special lighting.
   */
  readonly ambient = new THREE.Color(1, 1, 1);
  /** direction toward the sun and the sun's radiance on smoke (black = the old unlit behaviour: `ambient` only) */
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly sunLight = new THREE.Color(0, 0, 0);
  /** optional: is the sun visible from this point? (CPU ray through the world; smoke in shadow is not sun-lit) */
  sunVisible: ((x: number, y: number, z: number) => boolean) | null = null;
  /** how many smoke particles re-test sun visibility per frame (round robin) */
  visPerFrame = 8;
  private visCursor = 0;
  private fireLightU = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -1000, 0, 0));
  quality: FxQuality = 'medium';
  /** max light intensity (candela) of one fire light */
  lightIntensity = 14;
  private flames: Pool;
  private smoke: Pool;
  private flameMat: THREE.ShaderMaterial;
  private smokeMat: THREE.ShaderMaterial;
  private lights: FireLight[] = [];
  private flash = { x: 0, y: 0, z: 0, t: 0, power: 0 };
  private time = 0;
  private frame = 0;
  private flameAcc = 0;
  private emberAcc = 0;
  private smokeAcc: number[] = [];
  private clusters: FireCluster[] = [];
  private clusterAge = 1e9;
  private tex: THREE.Texture[] = [];
  stats = { flames: 0, smoke: 0, lights: 0, fires: 0 };

  constructor(quality: FxQuality = 'medium') {
    const flameTex = flameTexture(), smokeTex = smokeTexture();
    this.tex.push(flameTex, smokeTex);
    const fogU = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { ...fogU, uTex: { value: flameTex }, uStretch: { value: 0.45 }, uSpin: { value: 0.5 } },
      vertexShader: 'uniform float uSpin;\n' + VERT,
      fragmentShader: FLAME_FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: true,
    });
    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTex: { value: smokeTex }, uStretch: { value: 0 }, uSpin: { value: 6.28 },
        uTint: { value: this.smokeTint }, uAmbient: { value: this.ambient }, uFireLights: { value: this.fireLightU },
        uSunDir: { value: this.sunDir }, uSunLight: { value: this.sunLight },
      },
      defines: { SMOKE_LIT: 1 },
      vertexShader: 'uniform float uSpin;\n' + VERT,
      fragmentShader: SMOKE_FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending, fog: true,
    });
    this.flames = new Pool(MAX_FLAMES, this.flameMat, 20);
    this.smoke = new Pool(MAX_SMOKE, this.smokeMat, 21);
    this.smoke.blastLift = 1.1;
    this.root.add(this.flames.mesh, this.smoke.mesh);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const light = new THREE.PointLight(0xff8a3a, 0, 16, 2);
      light.castShadow = false;
      this.root.add(light);
      this.lights.push({ light, x: 0, y: -1000, z: 0, target: 0, cur: 0, phase: i * 1.7 });
    }
    this.setQuality(quality);
  }

  setQuality(level: FxQuality): void {
    this.quality = level;
    const q = QUALITY[level];
    this.flames.limit = q.flames;
    this.smoke.limit = q.smoke;
    // changing the number of visible lights recompiles lit shaders once; intensity 0 keeps the count stable otherwise
    this.lights.forEach((l, i) => { l.light.visible = i < q.lights; });
  }

  reset(): void {
    this.flames.clear();
    this.smoke.clear();
    this.clusters = [];
    this.clusterAge = 1e9;
    this.flash.t = 0;
    for (const l of this.lights) { l.cur = 0; l.target = 0; l.light.intensity = 0; }
  }

  /** smoke + dust + fireball burst (explosion events) */
  explosion(pos: V3, size: number): void {
    const s = Math.max(0.3, Math.min(4, size));
    // one sun-visibility ray for the whole burst; the round robin in update() refines it as the column rises
    this.smoke.spawnVis = this.sunVisible ? (this.sunVisible(pos.x, pos.y + 1, pos.z) ? 1 : 0) : 1;
    // the reference's blast smoke is a dense column that keeps rising and drifts for tens of seconds: a short-lived
    // billow (3-6 s) plus a lingering part (12-25 s, larger, rises with `blastLift`)
    const nSmoke = Math.round(Math.min(90, 8 + s * 16));
    for (let i = 0; i < nSmoke; i++) {
      const [dx, dy, dz] = randDir(0.35);
      const r = Math.random() * s * 0.5;
      const sp = (0.6 + Math.random() * 1.6) * Math.sqrt(s);
      const linger = i % 3 === 0;
      this.smoke.add(pos.x + dx * r, pos.y + Math.abs(dy) * r * 0.6 + 0.1, pos.z + dz * r, dx * sp * (linger ? 0.5 : 1), Math.abs(dy) * sp + (linger ? 1.2 : 0.6), dz * sp * (linger ? 0.5 : 1),
        linger ? (12 + Math.random() * 8) * Math.min(1.25, 0.6 + s * 0.25) : 3 + Math.random() * 3,
        (0.6 + Math.random() * 0.6) * s, (linger ? 3.0 + Math.random() * 2 : 1.6 + Math.random() * 1.4) * s, K_BLAST);
    }
    const nDust = Math.round(Math.min(40, 6 + s * 8));
    for (let i = 0; i < nDust; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 2.5) * Math.sqrt(s);
      this.smoke.add(pos.x + Math.cos(a) * s * 0.4, pos.y - 0.1 + Math.random() * 0.3, pos.z + Math.sin(a) * s * 0.4,
        Math.cos(a) * sp, 0.3 + Math.random() * 0.8, Math.sin(a) * sp, 1.8 + Math.random() * 2, 0.4 * s, (1.2 + Math.random()) * s, K_DUST);
    }
    const nFlame = Math.round(Math.min(100, 8 + s * 14));
    for (let i = 0; i < nFlame; i++) {
      const [dx, dy, dz] = randDir(0.2);
      const sp = (1 + Math.random() * 3) * Math.sqrt(s);
      this.flames.add(pos.x + dx * 0.2, pos.y + dy * 0.2, pos.z + dz * 0.2, dx * sp, dy * sp + 1, dz * sp,
        0.25 + Math.random() * 0.35, (0.5 + Math.random() * 0.5) * s, (0.9 + Math.random() * 0.6) * s, K_FLAME);
    }
    for (let i = 0; i < Math.min(40, 6 + s * 8); i++) {
      const [dx, dy, dz] = randDir(0.4);
      const sp = 3 + Math.random() * 6 * Math.sqrt(s);
      this.flames.add(pos.x, pos.y + 0.1, pos.z, dx * sp, Math.abs(dy) * sp + 2, dz * sp, 0.8 + Math.random() * 1.4, 0.05, 0.03, K_EMBER);
    }
    this.smoke.spawnVis = 1;
    this.flash.x = pos.x; this.flash.y = pos.y + 0.5; this.flash.z = pos.z; this.flash.t = 0.35; this.flash.power = s;
  }

  /** small dust puff (big carve / collapse) */
  dust(pos: V3, amount: number): void {
    const n = Math.min(10, 2 + Math.floor(amount / 120));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 0.9;
      this.smoke.add(pos.x + (Math.random() - 0.5) * 0.4, pos.y + (Math.random() - 0.5) * 0.3, pos.z + (Math.random() - 0.5) * 0.4,
        Math.cos(a) * sp, 0.2 + Math.random() * 0.4, Math.sin(a) * sp, 1.5 + Math.random() * 1.5, 0.3, 0.9 + Math.random() * 0.6, K_DUST);
    }
  }

  /** advance and redraw. `camera` is used for smoke sorting. */
  update(dt: number, src: FireSource, camera: THREE.Camera | null): void {
    if (dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.frame++;
    const n = src.count();
    this.stats.fires = n;
    if (n > 0) this.emit(dt, src, n);
    else this.clusters.length = 0;

    this.flames.step(dt, 2.2, 2.5, this.wind, 0.35, 1.6, this.time);
    this.smoke.step(dt, 0.25, 0.9, this.wind, 1.0, 0.5, this.time);
    // sun visibility: a few particles per frame re-test (eased, so a particle crossing a shadow edge fades)
    const sm = this.smoke;
    if (this.sunVisible && sm.n > 0) {
      const m = Math.min(sm.n, this.visPerFrame);
      for (let k = 0; k < m; k++) {
        const i = this.visCursor = (this.visCursor + 1) % sm.n;
        const o = i * 3;
        const v = this.sunVisible(sm.p[o], sm.p[o + 1], sm.p[o + 2]) ? 1 : 0;
        sm.vis[i] += (v - sm.vis[i]) * 0.6;
      }
    }
    this.flames.upload(null, flameSize);
    this.smoke.upload(this.frame % 2 === 0 || this.smoke.n < 200 ? camera : null, smokeSize);
    this.updateLights(dt);
    this.stats.flames = this.flames.n;
    this.stats.smoke = this.smoke.n;
  }

  /** simulate `seconds` of fx in coarse steps (after the sim jumped ahead, e.g. tests or loading) */
  prewarm(src: FireSource, camera: THREE.Camera | null, seconds = 1.5): void {
    const steps = Math.ceil(seconds * 30);
    for (let i = 0; i < steps; i++) this.update(1 / 30, src, i === steps - 1 ? camera : null);
  }

  private emit(dt: number, src: FireSource, n: number): void {
    const fl = this.flames;
    // flames: ~7 particles/s per fire, limited by what the pool can hold; bigger particles when budget-limited
    const want = n * 7;
    const budget = fl.limit / 0.55;
    const rate = Math.min(want, budget);
    const boost = Math.min(2, Math.sqrt(want / rate));
    this.flameAcc += rate * dt;
    const k = Math.floor(this.flameAcc);
    this.flameAcc -= k;
    if (k > 0) {
      src.forEachFire((x, y, z, I, _pal, ex, ey, ez) => {
        if (Math.random() > 0.35 + 0.65 * I) return;
        const off = 0.06;
        const px = x + ex * off + (Math.random() - 0.5) * 0.09;
        const py = y + ey * off + (Math.random() - 0.5) * 0.06 + 0.02;
        const pz = z + ez * off + (Math.random() - 0.5) * 0.09;
        const s = (0.16 + Math.random() * 0.16) * (0.5 + 0.5 * I) * boost;
        fl.add(px, py, pz, ex * 0.25 + (Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.6, ez * 0.25 + (Math.random() - 0.5) * 0.2,
          0.35 + Math.random() * 0.4, s * 0.35, s * (1.3 + Math.random() * 0.5), K_FLAME);
      }, k, Math.floor(Math.random() * 1e6));
    }
    // embers
    this.emberAcc += Math.min(25, n * 0.25) * dt;
    const ke = Math.floor(this.emberAcc);
    this.emberAcc -= ke;
    if (ke > 0) {
      src.forEachFire((x, y, z) => {
        fl.add(x + (Math.random() - 0.5) * 0.1, y + 0.1, z + (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.8, (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 2, 0.045, 0.025, K_EMBER);
      }, ke, Math.floor(Math.random() * 1e6));
    }
    // clusters: smoke sources + lights (refreshed 4x per second)
    this.clusterAge += dt;
    if (this.clusterAge > 0.25) {
      this.clusterAge = 0;
      this.clusters = src.clusters(1.6, 24);
      this.smokeAcc.length = this.clusters.length;
      this.assignLights();
    }
    const sm = this.smoke;
    let total = 0;
    for (const c of this.clusters) total += Math.min(5, 0.6 + c.strength * 0.12);
    const smokeBudget = sm.limit / 4.5;
    const scale = total > smokeBudget ? smokeBudget / total : 1;
    for (let i = 0; i < this.clusters.length; i++) {
      const c = this.clusters[i];
      const r = Math.min(5, 0.6 + c.strength * 0.12) * scale;
      this.smokeAcc[i] = (this.smokeAcc[i] ?? Math.random()) + r * dt;
      const spread = Math.min(0.8, 0.12 + Math.sqrt(c.n) * 0.06);
      while (this.smokeAcc[i] >= 1) {
        this.smokeAcc[i] -= 1;
        const big = Math.min(1.8, 0.7 + Math.sqrt(c.n) * 0.08);
        sm.add(c.x + (Math.random() - 0.5) * spread * 2, c.y + 0.55 + Math.random() * 0.3, c.z + (Math.random() - 0.5) * spread * 2,
          (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3,
          3 + Math.random() * 3, 0.35 * big, (1.6 + Math.random() * 1.2) * big, K_SMOKE);
      }
    }
  }

  /** move the fire lights to the strongest clusters (each light keeps the nearest one to avoid popping) */
  private assignLights(): void {
    const active = this.lights.filter((l) => l.light.visible);
    const cl = this.clusters.slice(0, active.length);
    const used = new Set<number>();
    for (const l of active) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < cl.length; i++) {
        if (used.has(i)) continue;
        const c = cl[i];
        const d = (c.x - l.x) ** 2 + (c.y - l.y) ** 2 + (c.z - l.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) { l.target = 0; continue; }
      used.add(best);
      const c = cl[best];
      if (bd > 4 || l.cur < 0.05) { l.x = c.x; l.y = c.y + 0.4; l.z = c.z; }
      else { l.x += (c.x - l.x) * 0.5; l.y += (c.y + 0.4 - l.y) * 0.5; l.z += (c.z - l.z) * 0.5; }
      l.target = Math.min(1, 0.25 + c.strength / 40);
    }
  }

  private updateLights(dt: number): void {
    const t = this.time;
    let on = 0;
    if (this.flash.t > 0) this.flash.t -= dt;
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      if (!l.light.visible) { this.fireLightU[i].w = 0; continue; }
      if (!this.clusters.length) l.target = 0;
      l.cur += (l.target - l.cur) * Math.min(1, dt * 3);
      const flick = 0.72 + 0.14 * Math.sin(t * 11.3 + l.phase) + 0.09 * Math.sin(t * 23.7 + l.phase * 2.3) + 0.05 * Math.sin(t * 41 + l.phase * 5.1);
      let I = l.cur * this.lightIntensity * flick;
      let x = l.x, y = l.y, z = l.z;
      // the last light doubles as the explosion flash
      if (i === this.lights.length - 1 || !this.lights[i + 1].light.visible) {
        if (this.flash.t > 0) {
          const f = this.flash.t / 0.35;
          I = Math.max(I, f * f * 120 * this.flash.power);
          x = this.flash.x; y = this.flash.y; z = this.flash.z;
        }
      }
      l.light.intensity = I;
      l.light.position.set(x, y, z);
      this.fireLightU[i].set(x, y, z, Math.min(3, (I / this.lightIntensity) * 0.6));
      if (I > 0.01) on++;
    }
    this.stats.lights = on;
  }

  dispose(): void {
    this.flames.mesh.geometry.dispose();
    this.smoke.mesh.geometry.dispose();
    this.flameMat.dispose();
    this.smokeMat.dispose();
    for (const t of this.tex) t.dispose();
  }
}

function flameSize(t: number): number {
  // grow quickly, then shrink into a tongue
  return t < 0.25 ? t / 0.25 : 1 - (t - 0.25) * 1.1;
}
function smokeSize(t: number): number {
  return Math.sqrt(t);
}
function randDir(up: number): [number, number, number] {
  let x = 0, y = 0, z = 0, l = 0;
  do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1 + up; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1.6 || l < 0.01);
  l = Math.sqrt(l);
  return [x / l, y / l, z / l];
}
