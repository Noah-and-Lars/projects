/**
 * Small post-processing chain (own full-screen passes, no three/examples dependency):
 *   scene -> HalfFloat target (optionally MSAA, optionally at reduced resolution)
 *   bloom : soft-threshold prefilter at 1/2 res, dual-filter down/up pyramid
 *   TAA (optional): sub-pixel jittered camera, history reprojected from depth, clamped to the current 3x3
 *         neighbourhood (YCoCg min / max box) so moving things do not ghost; replaces MSAA / FXAA
 *   composite : + bloom, exposure, tone curve (1 - exp(-c), per channel; AgX as an option), grade (saturation,
 *               colour balance, contrast), vignette, sRGB, dither -> RGBA8
 *   sun shafts: radial blur of the bloom mask (1/4 res) toward the sun's screen position (screen-space god rays)
 *   auto-exposure: log luminance at 32x18 -> one 1x1 pass (centre-weighted average, eased toward the target, held
 *         once within 0.01 EV so a still camera converges to bit-identical frames) -> composite reads the 1x1 EV
 *   FXAA -> canvas
 * Other people's scene objects (view models, particles, lights) need nothing special: they are drawn by the
 * normal scene pass into the HDR target.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PREFILTER = /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
void main() {
  vec3 c = 0.25 * (texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
                 + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb);
  c = min(c, vec3(24.0)); // tame fireflies
  float l = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.5;
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const DOWN = /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

const UP = /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 0.0)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, 1.0)).rgb;
  c += 0.5 * (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
            + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb);
  gl_FragColor = vec4(c / 6.0, 1.0);
}`;

// screen-space sun shafts: march from the pixel toward the sun over the thresholded bright mask (sun disc + glowing
// sky); whatever blocks the bright area (buildings, smoke-free silhouettes) leaves dark streaks between the rays
const SHAFTS = /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uSun; uniform float uLen;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 d = (uSun - vUv) * (uLen / 24.0);
  vec2 p = vUv + d * ign(gl_FragCoord.xy);
  vec3 s = vec3(0.0); float w = 1.0, ws = 0.0;
  for (int i = 0; i < 24; i++) {
    vec2 q = clamp(p, vec2(0.0), vec2(1.0));
    s += min(texture2D(tSrc, q).rgb, vec3(8.0)) * w; ws += w; w *= 0.94; p += d;
  }
  gl_FragColor = vec4(s / ws, 1.0);
}`;

// log2 luminance of the (exposed) scene, 4 bilinear taps per texel (each covers a block of the scene)
const LUM = /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uExposure;
void main() {
  vec3 c = 0.25 * (texture2D(tSrc, vUv + uTexel * vec2(-0.25, -0.25)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.25, -0.25)).rgb
                 + texture2D(tSrc, vUv + uTexel * vec2(-0.25, 0.25)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.25, 0.25)).rgb);
  float l = dot(min(c, vec3(64.0)), vec3(0.2126, 0.7152, 0.0722)) * uExposure;
  gl_FragColor = vec4(log2(max(l, 1e-4)), 0.0, 0.0, 1.0);
}`;

// 1x1: centre-weighted mean log luminance -> target EV offset, eased from the previous frame's value
const ADAPT = /* glsl */ `
uniform sampler2D tLum; uniform sampler2D tPrev;
uniform float uKey; uniform float uMinEV; uniform float uMaxEV; uniform float uUp; uniform float uDown; uniform float uReset;
void main() {
  float s = 0.0, w = 0.0;
  for (int j = 0; j < 9; j++) for (int i = 0; i < 16; i++) {
    vec2 uv = (vec2(float(i), float(j)) + 0.5) / vec2(16.0, 9.0);
    vec2 q = (uv - 0.5) * vec2(1.6, 2.0);
    float k = 1.0 - 0.7 * clamp(dot(q, q), 0.0, 1.0);
    s += texture2D(tLum, uv).r * k; w += k;
  }
  float target = clamp(log2(uKey) - s / w, uMinEV, uMaxEV);
  float prev = texture2D(tPrev, vec2(0.5)).r;
  float e = uReset > 0.5 ? target : mix(prev, target, target > prev ? uUp : uDown);
  if (uReset < 0.5 && abs(target - prev) < 0.01) e = prev; // hold: a still view must stop changing
  gl_FragColor = vec4(e, 0.0, 0.0, 1.0);
}`;

const COMPOSITE = /* glsl */ `
varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uBloom; uniform float uVignette; uniform float uContrast; uniform float uSaturationOut; uniform vec3 uBalance;
uniform sampler2D tExposure; uniform sampler2D tShafts; uniform float uShafts;
${THREE.ShaderChunk.tonemapping_pars_fragment}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  #ifdef USE_BLOOM
  c += uBloom * texture2D(tBloom, vUv).rgb;
  #endif
  #ifdef USE_SHAFTS
  c += uShafts * texture2D(tShafts, vUv).rgb;
  #endif
  c = max(c, vec3(0.0)) * uBalance;
  #ifdef USE_AUTOEXP
  c *= exp2(texture2D(tExposure, vec2(0.5)).r);
  #endif
  #ifdef TONE_AGX
  c = AgXToneMapping(c);
  #else
  // per-channel exponential curve: keeps saturated mid-tones and rolls highlights off to a soft white (the genre
  // reference's look; AgX desaturates bright colours on purpose and made every frame milky)
  c = 1.0 - exp(-c * toneMappingExposure);
  #endif
  c = clamp(c, 0.0, 1.0);
  // contrast as a power curve around mid grey (log space). The old linear mix(0.5, c, k) pushed every value below
  // 0.5 - 0.5 / k (0.0098 for k = 1.02, i.e. sRGB < 23/255) negative, so sun-shadowed corners clipped to pure black
  // specks on the ground.
  c = 0.18 * pow(c / 0.18, vec3(uContrast));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturationOut);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(q, q) * 2.0);
  c = clamp(c, 0.0, 1.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); // linear -> sRGB
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, dot(c, vec3(0.299, 0.587, 0.114)));
}`;


const TAA = /* glsl */ `
varying vec2 vUv; uniform sampler2D tCur; uniform sampler2D tHist; uniform sampler2D tDepth;
uniform mat4 uInvVP; uniform mat4 uPrevVP; uniform vec2 uTexel; uniform float uBlend; uniform float uBlendStill; uniform vec3 uCamPos; uniform vec3 uPrevCamPos;
// work in a Reinhard-compressed space so bright pixels do not dominate the blend / clamp
vec3 cmp(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 unc(vec3 c) { return c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-3); }
vec3 toY(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
vec3 fromY(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
void main() {
  vec3 cur = toY(cmp(texture2D(tCur, vUv).rgb));
  vec3 mn = vec3(1e9), mx = vec3(-1e9);
  float dmn = 1e9, dmx = 0.0; // distance range of the neighbourhood (from the current camera)
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vUv + uTexel * vec2(float(i), float(j));
    vec3 s = toY(cmp(texture2D(tCur, o).rgb));
    mn = min(mn, s); mx = max(mx, s);
    vec4 q = uInvVP * vec4(o * 2.0 - 1.0, texture2D(tDepth, o).r * 2.0 - 1.0, 1.0);
    float dq = length(q.xyz / q.w - uCamPos);
    dmn = min(dmn, dq); dmx = max(dmx, dq);
  }

  float d = texture2D(tDepth, vUv).r;
  vec4 wp = uInvVP * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  wp /= wp.w;
  vec4 pc = uPrevVP * wp;
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  float dist = length(wp.xyz - uCamPos);
  if (uBlend >= 1.0 || pc.w <= 0.0 || any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0)))) {
    gl_FragColor = vec4(fromY(cur), dist); return;
  }
  vec4 hs = texture2D(tHist, puv);
  vec3 h = toY(hs.rgb);
  // Pixels whose history may be wrong (moved on screen, or the history saw another surface: its distance from the
  // previous camera disagrees, e.g. a moving body or a disocclusion) keep the fast blend; trusted pixels of a still
  // camera accumulate progressively, so sub-pixel detail converges instead of flickering with the jitter.
  float expect = length(wp.xyz - uPrevCamPos);
  float moved = clamp(length((puv - vUv) / uTexel) * 2.0, 0.0, 1.0); // pixels of on-screen motion
  // the history's surface is accepted if its distance lies within the neighbourhood's distance range (+2 % + 5 cm):
  // the jitter moves the sample by up to a pixel, so at silhouettes and on grazing ground it legitimately flips
  // between neighbouring surfaces (a camera move shifts the range by expect - dist)
  float shift = expect - dist, tol = 0.02 * expect + 0.05;
  float changed = 1.0 - step(dmn + shift - tol, hs.a) * step(hs.a, dmx + shift + tol);
  float suspect = max(moved, changed);
  // trusted pixels are clamped only when the history is far outside the neighbourhood (a real change: smoke, fire,
  // water, a light switching), not for the small differences the jitter causes on sub-pixel detail
  vec3 hc = clamp(h, mn, mx);
  h = mix(h, hc, max(suspect, step(0.06, length(h - hc))));
  // a camera that has not moved for a while accumulates progressively (blend down to 1/64): the image converges to
  // a still, supersampled average instead of following each jittered frame
  gl_FragColor = vec4(fromY(mix(h, cur, mix(uBlendStill, uBlend, suspect))), dist);
}`;
// history is kept in the compressed space; this expands it again for the composite
const TAA_OUT = /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc;
void main() { vec3 c = texture2D(tSrc, vUv).rgb; gl_FragColor = vec4(c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-3), 1.0); }`;

// compact FXAA (luma in alpha), after Timothy Lottes' FXAA 3 "console" variant; optional contrast-adaptive sharpening
// (after AMD's CAS idea: a negative 4-neighbour lobe whose weight shrinks where the neighbourhood is already
// contrasty) that restores edge crispness when the scene was rendered at a reduced resolution and upscaled here
const FXAA = /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uSharpen;
vec3 aa() {
  vec4 m = texture2D(tSrc, vUv);
  #ifdef USE_FXAA
  float lNW = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).a, lNE = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).a;
  float lSW = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).a, lSE = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).a;
  float lM = m.a;
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.04, lMax * 0.125)) return m.rgb;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), vec2(-8.0), vec2(8.0)) * uTexel;
  vec4 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)) + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)));
  vec4 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5) + texture2D(tSrc, vUv + dir * 0.5));
  return (b.a < lMin || b.a > lMax) ? a.rgb : b.rgb;
  #else
  return m.rgb;
  #endif
}
void main() {
  vec3 c = aa();
  #ifdef USE_SHARPEN
  vec3 n = texture2D(tSrc, vUv + vec2(0.0, -uTexel.y)).rgb, s = texture2D(tSrc, vUv + vec2(0.0, uTexel.y)).rgb;
  vec3 e = texture2D(tSrc, vUv + vec2(uTexel.x, 0.0)).rgb, w = texture2D(tSrc, vUv + vec2(-uTexel.x, 0.0)).rgb;
  vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-3)), 0.0, 1.0));
  vec3 wt = -amp * uSharpen * 0.2; // 0 .. -0.2 per neighbour
  c = clamp((c + wt * (n + s + e + w)) / (1.0 + 4.0 * wt), 0.0, 1.0);
  #endif
  gl_FragColor = vec4(c, 1.0);
}`;

export interface PostOptions {
  /** MSAA samples of the scene target (0 = off) */
  samples: number;
  bloom: boolean;
  fxaa: boolean;
  /** scene resolution scale 0.5..1 */
  scale: number;
  /** temporal anti-aliasing (forces samples = 0) */
  taa: boolean;
  /** contrast-adaptive sharpening strength in the final pass (0 = off) */
  sharpen: number;
  /** tone-map / grade / FXAA at the scene resolution too (cheaper at scale < 1; the final pass upscales) */
  lowRes: boolean;
}

// Halton(2, 3) sub-pixel offsets in [-0.5, 0.5)
const JITTER: [number, number][] = [];
for (let i = 1; i <= 8; i++) {
  const h = (b: number) => { let f = 1, r = 0, n = i; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; };
  JITTER.push([h(2) - 0.5, h(3) - 0.5]);
}

const BLOOM_LEVELS = 5;

export class PostFX {
  /** false if the GPU cannot render to half-float targets (then the renderer draws straight to the canvas) */
  readonly supported: boolean;
  readonly options: PostOptions = { samples: 0, bloom: true, fxaa: true, scale: 1, taa: false, sharpen: 0, lowRes: false };
  bloomStrength = 0.4;
  bloomThreshold = 1.1;
  vignette = 0.28;
  contrast = 1.02;
  saturation = 1.0;
  /** time-of-day grade (renderer presets): saturation multiplier and per-channel colour balance (applied in linear
   *  light before the tone curve) */
  gradeSaturation = 1.0;
  readonly balance = new THREE.Vector3(1, 1, 1);
  /** 'exp' (default, 1 - exp(-c)) or 'agx' (the older filmic curve, kept for comparison: ?tone=agx) */
  toneCurve: 'exp' | 'agx' = 'exp';
  /** eye adaptation (see ADAPT): on/off, target mean luminance (after the preset exposure), EV range, speeds (1/s) */
  autoExposure = true;
  readonly adapt = { key: 0.2, minEV: -0.6, maxEV: 1.4, up: 2.2, down: 1.4 };
  /** sun shafts: sun position in screen uv and strength (0 = off; the renderer fades it out as the sun leaves the view) */
  readonly shaftSun = new THREE.Vector2(0.5, 0.5);
  shaftStrength = 0;
  private shaftRT: THREE.WebGLRenderTarget | null = null;
  private mShafts!: THREE.ShaderMaterial;
  /** frame time for the adaptation speed (set by the renderer before render) */
  dt = 1 / 60;
  private lumRT: THREE.WebGLRenderTarget | null = null;
  private expRT: THREE.WebGLRenderTarget[] = [];
  private mLum!: THREE.ShaderMaterial; private mAdapt!: THREE.ShaderMaterial;
  private expValid = false;
  private scene: THREE.WebGLRenderTarget | null = null;
  private ldr: THREE.WebGLRenderTarget | null = null;
  private chain: THREE.WebGLRenderTarget[] = [];
  private w = 0; private h = 0;
  private dirty = true;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private mPre: THREE.ShaderMaterial; private mDown: THREE.ShaderMaterial; private mUp: THREE.ShaderMaterial;
  private mComp: THREE.ShaderMaterial; private mFxaa: THREE.ShaderMaterial;
  private mTaa: THREE.ShaderMaterial; private mTaaOut: THREE.ShaderMaterial;
  private hist: THREE.WebGLRenderTarget[] = [];
  private histValid = false;
  private jitterIndex = 0;
  private prevVP = new THREE.Matrix4();
  private vp = new THREE.Matrix4();
  private savedProj = new THREE.Matrix4();
  private prevCam = new THREE.Vector3();
  /** frames the (unjittered) camera has not moved */
  private stillFrames = 0;
  /** fraction of the current frame mixed into the history (lower = smoother, slower to react) */
  taaBlend = 0.1;
  /** jitter amplitude in pixels (1 = full Halton pattern; 0 = no jitter, debugging) */
  jitterScale = 1;

  constructor(private three: THREE.WebGLRenderer) {
    const gl = three.getContext();
    this.supported = three.capabilities.isWebGL2 !== false && !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
    const mk = (fs: string, uniforms: Record<string, THREE.IUniform>, extra: THREE.ShaderMaterialParameters = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false, fog: false, ...extra });
    const tex = () => ({ value: null as THREE.Texture | null });
    this.mPre = mk(PREFILTER, { tSrc: tex(), uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } });
    this.mDown = mk(DOWN, { tSrc: tex(), uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tSrc: tex(), uTexel: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.mComp = mk(COMPOSITE, {
      tScene: tex(), tBloom: tex(), tExposure: tex(), tShafts: tex(), uShafts: { value: 0 }, uBloom: { value: 0.4 }, uVignette: { value: 0.3 }, uContrast: { value: 1 }, uSaturationOut: { value: 1 }, uBalance: { value: new THREE.Vector3(1, 1, 1) },
      toneMappingExposure: { value: 1 },
    });
    this.mFxaa = mk(FXAA, { tSrc: tex(), uTexel: { value: new THREE.Vector2() }, uSharpen: { value: 0 } });
    this.mTaa = mk(TAA, { tCur: tex(), tHist: tex(), tDepth: tex(), uInvVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() }, uPrevCamPos: { value: new THREE.Vector3() }, uTexel: { value: new THREE.Vector2() }, uBlend: { value: 1 }, uBlendStill: { value: 1 } });
    this.mTaaOut = mk(TAA_OUT, { tSrc: tex() });
    this.mShafts = mk(SHAFTS, { tSrc: tex(), uSun: { value: new THREE.Vector2() }, uLen: { value: 0.85 } });
    this.mLum = mk(LUM, { tSrc: tex(), uTexel: { value: new THREE.Vector2() }, uExposure: { value: 1 } });
    this.mAdapt = mk(ADAPT, { tLum: tex(), tPrev: tex(), uKey: { value: 0.2 }, uMinEV: { value: -1 }, uMaxEV: { value: 1 }, uUp: { value: 0.05 }, uDown: { value: 0.05 }, uReset: { value: 1 } });
    this.quad = new THREE.Mesh(geo, this.mPre);
    this.quad.frustumCulled = false;
  }

  /** drawing-buffer size in pixels */
  setSize(w: number, h: number): void {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (w !== this.w || h !== this.h) { this.w = w; this.h = h; this.dirty = true; }
  }

  configure(o: Partial<PostOptions>): void {
    const p = this.options;
    const next = { ...p, ...o };
    next.scale = Math.max(0.25, Math.min(1, next.scale));
    if (next.samples !== p.samples || next.scale !== p.scale || next.bloom !== p.bloom || next.taa !== p.taa || next.lowRes !== p.lowRes) this.dirty = true;
    Object.assign(p, next);
  }

  private disposeTargets(): void {
    this.scene?.depthTexture?.dispose();
    this.scene?.dispose(); this.ldr?.dispose();
    for (const t of this.chain) t.dispose();
    for (const t of this.hist) t.dispose();
    this.lumRT?.dispose(); for (const t of this.expRT) t.dispose();
    this.shaftRT?.dispose(); this.shaftRT = null;
    this.lumRT = null; this.expRT = []; this.expValid = false;
    this.scene = this.ldr = null; this.chain = []; this.hist = []; this.histValid = false;
  }

  private allocate(): void {
    this.disposeTargets();
    const o = this.options;
    const sw = Math.max(1, Math.round(this.w * o.scale)), sh = Math.max(1, Math.round(this.h * o.scale));
    const maxSamples = this.three.capabilities.maxSamples ?? 0;
    this.scene = new THREE.WebGLRenderTarget(sw, sh, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
      samples: o.taa ? 0 : Math.min(o.samples, maxSamples), minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    if (o.taa) {
      this.scene.depthTexture = new THREE.DepthTexture(sw, sh, THREE.UnsignedIntType);
      for (let i = 0; i < 3; i++) this.hist.push(new THREE.WebGLRenderTarget(sw, sh, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      }));
    }
    const lw = o.lowRes ? sw : this.w, lh = o.lowRes ? sh : this.h;
    this.ldr = new THREE.WebGLRenderTarget(lw, lh, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    if (o.bloom) {
      let bw = sw, bh = sh;
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
        this.chain.push(new THREE.WebGLRenderTarget(bw, bh, {
          type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
        }));
        if (bw <= 4 || bh <= 4) break;
      }
    }
    const small = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false } as const;
    if (this.chain.length >= 2) this.shaftRT = new THREE.WebGLRenderTarget(this.chain[1].width, this.chain[1].height, { ...small, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.lumRT = new THREE.WebGLRenderTarget(32, 18, { ...small, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.expRT = [new THREE.WebGLRenderTarget(1, 1, small), new THREE.WebGLRenderTarget(1, 1, small)];
    this.mComp.defines = o.bloom ? { USE_BLOOM: 1 } : {};
    this.mComp.needsUpdate = true;
    this.dirty = false;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.three.setRenderTarget(target);
    this.three.render(this.quad, this.cam);
  }

  /** forget the TAA history (cuts, teleports, level loads, test frames) */
  resetHistory(): void { this.histValid = false; }

  /**
   * `reset` = draw this frame without jitter or history (tests / big camera cuts).
   */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, exposure: number, reset = false): void {
    const three = this.three;
    if (this.dirty || !this.scene) this.allocate();
    const sceneRT = this.scene!, ldr = this.ldr!;
    const taa = this.options.taa && this.hist.length === 3;
    if (reset) this.histValid = false;
    if (taa && this.histValid) {
      // sub-pixel jitter of the projection (restored after the scene pass)
      const [jx, jy] = JITTER[this.jitterIndex = (this.jitterIndex + 1) % JITTER.length];
      this.savedProj.copy(camera.projectionMatrix);
      const e = camera.projectionMatrix.elements;
      e[8] += (2 * jx * this.jitterScale) / sceneRT.width; e[9] += (2 * jy * this.jitterScale) / sceneRT.height;
    }
    camera.updateMatrixWorld();
    const prevAuto = three.autoClear;
    three.autoClear = true;
    three.setRenderTarget(sceneRT);
    three.render(scene, camera);
    let sceneTex: THREE.Texture = sceneRT.texture;

    // the full-screen passes must not re-render shadow maps or clear anything
    const prevShadowAuto = three.shadowMap.autoUpdate;
    three.shadowMap.autoUpdate = false;
    three.autoClear = false;
    if (taa) {
      // reproject pixel centres: current clip -> world -> previous clip, both unjittered (the history lives in
      // unjittered screen space; reconstructing with the jittered matrix made a still view wobble with the jitter)
      if (this.histValid) camera.projectionMatrix.copy(this.savedProj);
      this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const t = this.mTaa.uniforms;
      t.uInvVP.value.copy(this.vp).invert();
      t.uPrevVP.value.copy(this.prevVP);
      t.uPrevCamPos.value.copy(this.prevCam);
      t.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      t.tCur.value = sceneRT.texture; t.tDepth.value = sceneRT.depthTexture; t.tHist.value = this.hist[0].texture;
      t.uTexel.value.set(1 / sceneRT.width, 1 / sceneRT.height);
      let same = this.histValid;
      for (let i = 0; i < 16 && same; i++) same = Math.abs(this.vp.elements[i] - this.prevVP.elements[i]) < 1e-6;
      this.stillFrames = same ? this.stillFrames + 1 : 0;
      t.uBlend.value = this.histValid ? this.taaBlend : 1;
      t.uBlendStill.value = this.histValid ? (same ? 1 / Math.min(1 / this.taaBlend + this.stillFrames, 64) : this.taaBlend) : 1;
      this.pass(this.mTaa, this.hist[1]);
      this.mTaaOut.uniforms.tSrc.value = this.hist[1].texture;
      this.pass(this.mTaaOut, this.hist[2]);
      sceneTex = this.hist[2].texture;
      [this.hist[0], this.hist[1]] = [this.hist[1], this.hist[0]];
      this.prevVP.copy(this.vp);
      this.prevCam.copy(t.uCamPos.value);
      this.histValid = true;
    }
    const chain = this.chain;
    if (chain.length) {
      this.mPre.uniforms.tSrc.value = sceneTex;
      this.mPre.uniforms.uTexel.value.set(1 / sceneRT.width, 1 / sceneRT.height);
      this.mPre.uniforms.uThreshold.value = this.bloomThreshold;
      this.pass(this.mPre, chain[0]);
      for (let i = 1; i < chain.length; i++) {
        this.mDown.uniforms.tSrc.value = chain[i - 1].texture;
        this.mDown.uniforms.uTexel.value.set(1 / chain[i - 1].width, 1 / chain[i - 1].height);
        this.pass(this.mDown, chain[i]);
      }
      // shafts read the 1/4-res bright mask before the up passes add the wider levels into it
      if (this.shaftRT && this.shaftStrength > 0.001) {
        this.mShafts.uniforms.tSrc.value = chain[1].texture;
        this.mShafts.uniforms.uSun.value.copy(this.shaftSun);
        this.pass(this.mShafts, this.shaftRT);
      }
      for (let i = chain.length - 1; i > 0; i--) { // additive: chain[i-1] += up(chain[i])
        this.mUp.uniforms.tSrc.value = chain[i].texture;
        this.mUp.uniforms.uTexel.value.set(1 / chain[i].width, 1 / chain[i].height);
        this.pass(this.mUp, chain[i - 1]);
      }
    }
    const autoExp = this.autoExposure && !!this.lumRT;
    if (autoExp) {
      const l = this.mLum.uniforms, a = this.mAdapt.uniforms, A = this.adapt;
      l.tSrc.value = sceneTex; l.uTexel.value.set(1 / 32, 1 / 18); l.uExposure.value = exposure;
      this.pass(this.mLum, this.lumRT!);
      const dt = Math.min(Math.max(this.dt, 0), 0.25);
      a.tLum.value = this.lumRT!.texture; a.tPrev.value = this.expRT[0].texture;
      a.uKey.value = A.key; a.uMinEV.value = A.minEV; a.uMaxEV.value = A.maxEV;
      a.uUp.value = 1 - Math.exp(-dt * A.up); a.uDown.value = 1 - Math.exp(-dt * A.down);
      a.uReset.value = reset || !this.expValid ? 1 : 0;
      this.pass(this.mAdapt, this.expRT[1]);
      [this.expRT[0], this.expRT[1]] = [this.expRT[1], this.expRT[0]];
      this.expValid = true;
    }
    if (!!this.mComp.defines?.USE_AUTOEXP !== autoExp) { this.mComp.defines = { ...this.mComp.defines }; if (autoExp) this.mComp.defines.USE_AUTOEXP = 1; else delete this.mComp.defines.USE_AUTOEXP; this.mComp.needsUpdate = true; }
    const shafts = !!this.shaftRT && this.shaftStrength > 0.001;
    if (!!this.mComp.defines?.USE_SHAFTS !== shafts) { this.mComp.defines = { ...this.mComp.defines }; if (shafts) this.mComp.defines.USE_SHAFTS = 1; else delete this.mComp.defines.USE_SHAFTS; this.mComp.needsUpdate = true; }
    const fxaa = this.options.fxaa && !taa;
    const u = this.mComp.uniforms;
    u.tShafts.value = shafts ? this.shaftRT!.texture : null; u.uShafts.value = this.shaftStrength;
    u.tExposure.value = autoExp ? this.expRT[0].texture : null;
    u.tScene.value = sceneTex; u.tBloom.value = chain.length ? chain[0].texture : null;
    u.uBloom.value = this.bloomStrength / Math.max(1, chain.length); u.uVignette.value = this.vignette;
    u.uContrast.value = this.contrast; u.uSaturationOut.value = this.saturation * this.gradeSaturation;
    u.uBalance.value.copy(this.balance);
    u.toneMappingExposure.value = exposure;
    const agx = this.toneCurve === 'agx';
    if (!!this.mComp.defines?.TONE_AGX !== agx) { this.mComp.defines = { ...this.mComp.defines }; if (agx) this.mComp.defines.TONE_AGX = 1; else delete this.mComp.defines.TONE_AGX; this.mComp.needsUpdate = true; }
    this.pass(this.mComp, ldr);
    const sharpen = this.options.sharpen > 0;
    const d = this.mFxaa.defines ?? {};
    if (!!d.USE_FXAA !== fxaa || !!d.USE_SHARPEN !== sharpen) {
      this.mFxaa.defines = { ...(fxaa ? { USE_FXAA: 1 } : {}), ...(sharpen ? { USE_SHARPEN: 1 } : {}) };
      this.mFxaa.needsUpdate = true;
    }
    this.mFxaa.uniforms.uSharpen.value = this.options.sharpen;
    this.mFxaa.uniforms.tSrc.value = ldr.texture;
    this.mFxaa.uniforms.uTexel.value.set(1 / ldr.width, 1 / ldr.height);
    this.pass(this.mFxaa, null);
    three.autoClear = prevAuto;
    three.shadowMap.autoUpdate = prevShadowAuto;
  }

  /** the current adapted exposure offset in EV (reads the 1x1 target back: tests / debugging only) */
  readExposureEV(): number {
    if (!this.expValid) return 0;
    const buf = new Uint16Array(4);
    this.three.readRenderTargetPixels(this.expRT[0], 0, 0, 1, 1, buf);
    return THREE.DataUtils.fromHalfFloat(buf[0]);
  }

  /** scene target size (for stats) */
  get renderSize(): [number, number] { return this.scene ? [this.scene.width, this.scene.height] : [0, 0]; }

  dispose(): void {
    this.disposeTargets();
    for (const m of [this.mPre, this.mDown, this.mUp, this.mComp, this.mFxaa, this.mTaa, this.mTaaOut, this.mLum, this.mAdapt, this.mShafts]) m.dispose();
    this.quad.geometry.dispose();
  }
}
