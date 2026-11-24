/**
 * Small post-processing chain (own full-screen passes, no three/examples dependency):
 *   scene -> HalfFloat target (optionally MSAA, optionally at reduced resolution)
 *   bloom : soft-threshold prefilter at 1/2 res, dual-filter down/up pyramid
 *   composite : + bloom, exposure, filmic tone map (AgX), grade, vignette, sRGB, dither -> RGBA8
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

const COMPOSITE = /* glsl */ `
varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uBloom; uniform float uVignette; uniform float uContrast; uniform float uSaturationOut;
${THREE.ShaderChunk.tonemapping_pars_fragment}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  #ifdef USE_BLOOM
  c += uBloom * texture2D(tBloom, vUv).rgb;
  #endif
  c = AgXToneMapping(max(c, vec3(0.0)));
  // grade: a little contrast + saturation back after AgX's gentle desaturation
  c = clamp(c, 0.0, 1.0);
  c = mix(vec3(0.5), c, uContrast);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturationOut);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(q, q) * 2.0);
  c = clamp(c, 0.0, 1.0);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); // linear -> sRGB
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, dot(c, vec3(0.299, 0.587, 0.114)));
}`;

// compact FXAA (luma in alpha), after Timothy Lottes' FXAA 3 "console" variant
const FXAA = /* glsl */ `
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main() {
  #ifdef USE_FXAA
  vec4 m = texture2D(tSrc, vUv);
  float lNW = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).a, lNE = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).a;
  float lSW = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).a, lSE = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).a;
  float lM = m.a;
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.04, lMax * 0.125)) { gl_FragColor = vec4(m.rgb, 1.0); return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), vec2(-8.0), vec2(8.0)) * uTexel;
  vec4 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)) + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)));
  vec4 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5) + texture2D(tSrc, vUv + dir * 0.5));
  gl_FragColor = vec4((b.a < lMin || b.a > lMax) ? a.rgb : b.rgb, 1.0);
  #else
  gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0);
  #endif
}`;

export interface PostOptions {
  /** MSAA samples of the scene target (0 = off) */
  samples: number;
  bloom: boolean;
  fxaa: boolean;
  /** scene resolution scale 0.5..1 */
  scale: number;
}

const BLOOM_LEVELS = 5;

export class PostFX {
  /** false if the GPU cannot render to half-float targets (then the renderer draws straight to the canvas) */
  readonly supported: boolean;
  readonly options: PostOptions = { samples: 0, bloom: true, fxaa: true, scale: 1 };
  bloomStrength = 0.4;
  bloomThreshold = 1.1;
  vignette = 0.28;
  contrast = 1.02;
  saturation = 1.0;
  private scene: THREE.WebGLRenderTarget | null = null;
  private ldr: THREE.WebGLRenderTarget | null = null;
  private chain: THREE.WebGLRenderTarget[] = [];
  private w = 0; private h = 0;
  private dirty = true;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private mPre: THREE.ShaderMaterial; private mDown: THREE.ShaderMaterial; private mUp: THREE.ShaderMaterial;
  private mComp: THREE.ShaderMaterial; private mFxaa: THREE.ShaderMaterial;

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
      tScene: tex(), tBloom: tex(), uBloom: { value: 0.4 }, uVignette: { value: 0.3 }, uContrast: { value: 1 }, uSaturationOut: { value: 1 },
      toneMappingExposure: { value: 1 },
    });
    this.mFxaa = mk(FXAA, { tSrc: tex(), uTexel: { value: new THREE.Vector2() } });
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
    if (next.samples !== p.samples || next.scale !== p.scale || next.bloom !== p.bloom) this.dirty = true;
    Object.assign(p, next);
  }

  private disposeTargets(): void {
    this.scene?.dispose(); this.ldr?.dispose();
    for (const t of this.chain) t.dispose();
    this.scene = this.ldr = null; this.chain = [];
  }

  private allocate(): void {
    this.disposeTargets();
    const o = this.options;
    const sw = Math.max(1, Math.round(this.w * o.scale)), sh = Math.max(1, Math.round(this.h * o.scale));
    const maxSamples = this.three.capabilities.maxSamples ?? 0;
    this.scene = new THREE.WebGLRenderTarget(sw, sh, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
      samples: Math.min(o.samples, maxSamples), minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.ldr = new THREE.WebGLRenderTarget(this.w, this.h, {
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
    this.mComp.defines = o.bloom ? { USE_BLOOM: 1 } : {};
    this.mComp.needsUpdate = true;
    this.dirty = false;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.three.setRenderTarget(target);
    this.three.render(this.quad, this.cam);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, exposure: number): void {
    const three = this.three;
    if (this.dirty || !this.scene) this.allocate();
    const sceneRT = this.scene!, ldr = this.ldr!;
    const prevAuto = three.autoClear;
    three.autoClear = true;
    three.setRenderTarget(sceneRT);
    three.render(scene, camera);

    // the full-screen passes must not re-render shadow maps or clear anything
    const prevShadowAuto = three.shadowMap.autoUpdate;
    three.shadowMap.autoUpdate = false;
    three.autoClear = false;
    const chain = this.chain;
    if (chain.length) {
      this.mPre.uniforms.tSrc.value = sceneRT.texture;
      this.mPre.uniforms.uTexel.value.set(1 / sceneRT.width, 1 / sceneRT.height);
      this.mPre.uniforms.uThreshold.value = this.bloomThreshold;
      this.pass(this.mPre, chain[0]);
      for (let i = 1; i < chain.length; i++) {
        this.mDown.uniforms.tSrc.value = chain[i - 1].texture;
        this.mDown.uniforms.uTexel.value.set(1 / chain[i - 1].width, 1 / chain[i - 1].height);
        this.pass(this.mDown, chain[i]);
      }
      for (let i = chain.length - 1; i > 0; i--) { // additive: chain[i-1] += up(chain[i])
        this.mUp.uniforms.tSrc.value = chain[i].texture;
        this.mUp.uniforms.uTexel.value.set(1 / chain[i].width, 1 / chain[i].height);
        this.pass(this.mUp, chain[i - 1]);
      }
    }
    const fxaa = this.options.fxaa;
    const u = this.mComp.uniforms;
    u.tScene.value = sceneRT.texture; u.tBloom.value = chain.length ? chain[0].texture : null;
    u.uBloom.value = this.bloomStrength / Math.max(1, chain.length); u.uVignette.value = this.vignette;
    u.uContrast.value = this.contrast; u.uSaturationOut.value = this.saturation;
    u.toneMappingExposure.value = exposure;
    this.pass(this.mComp, ldr);
    const wantFxaa = fxaa ? 1 : undefined;
    if ((this.mFxaa.defines?.USE_FXAA as number | undefined) !== wantFxaa) { this.mFxaa.defines = fxaa ? { USE_FXAA: 1 } : {}; this.mFxaa.needsUpdate = true; }
    this.mFxaa.uniforms.tSrc.value = ldr.texture;
    this.mFxaa.uniforms.uTexel.value.set(1 / ldr.width, 1 / ldr.height);
    this.pass(this.mFxaa, null);
    three.autoClear = prevAuto;
    three.shadowMap.autoUpdate = prevShadowAuto;
  }

  /** scene target size (for stats) */
  get renderSize(): [number, number] { return this.scene ? [this.scene.width, this.scene.height] : [0, 0]; }

  dispose(): void {
    this.disposeTargets();
    for (const m of [this.mPre, this.mDown, this.mUp, this.mComp, this.mFxaa]) m.dispose();
    this.quad.geometry.dispose();
  }
}
