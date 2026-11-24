/**
 * Time-of-day presets + procedural sky dome (gradient, sun / moon disc and glow, soft clouds, stars).
 * All colours are linear working-space values (HDR allowed); the post pass tone-maps.
 */
import * as THREE from 'three';

export type TimeOfDay = 'day' | 'sunset' | 'overcast' | 'night';

export interface SkyPreset {
  /** sun (or moon) elevation in degrees used when the level does not dictate the direction */
  elevation: number;
  sunColor: [number, number, number];
  sunIntensity: number;
  /** hemisphere ambient */
  skyLight: [number, number, number];
  groundLight: [number, number, number];
  ambient: number;
  zenith: [number, number, number];
  horizon: [number, number, number];
  /** colour of the glow around the sun near the horizon */
  glow: [number, number, number];
  /** sun disc radiance multiplier (drives bloom) */
  disc: number;
  cloudCover: number;
  cloudColor: [number, number, number];
  stars: number;
  fogNear: number; fogFar: number;
  exposure: number;
  /** emissive voxel radiance */
  emissive: number;
  /** lamp point-light intensity (candela-ish) */
  lamp: number;
  aoMin: number;
  bloom: number;
}

export const SKY_PRESETS: Record<TimeOfDay, SkyPreset> = {
  day: {
    elevation: 48, sunColor: [1.0, 0.95, 0.86], sunIntensity: 3.2,
    skyLight: [0.55, 0.7, 1.0], groundLight: [0.45, 0.4, 0.33], ambient: 1.35,
    zenith: [0.13, 0.3, 0.72], horizon: [0.56, 0.72, 0.92], glow: [1.0, 0.9, 0.7], disc: 40,
    cloudCover: 0.42, cloudColor: [1.0, 1.0, 1.0], stars: 0,
    fogNear: 50, fogFar: 420, exposure: 1.0, emissive: 2.5, lamp: 5, aoMin: 0.1, bloom: 0.35,
  },
  sunset: {
    elevation: 16, sunColor: [1.0, 0.62, 0.32], sunIntensity: 4.4,
    skyLight: [0.48, 0.58, 0.95], groundLight: [0.5, 0.38, 0.28], ambient: 1.5,
    zenith: [0.09, 0.17, 0.46], horizon: [0.82, 0.44, 0.2], glow: [1.0, 0.45, 0.12], disc: 30,
    cloudCover: 0.4, cloudColor: [0.85, 0.48, 0.34], stars: 0,
    fogNear: 25, fogFar: 300, exposure: 1.0, emissive: 3.5, lamp: 9, aoMin: 0.12, bloom: 0.55,
  },
  overcast: {
    elevation: 55, sunColor: [0.95, 0.97, 1.0], sunIntensity: 0.7,
    skyLight: [0.72, 0.78, 0.88], groundLight: [0.4, 0.4, 0.4], ambient: 1.55,
    zenith: [0.42, 0.47, 0.54], horizon: [0.62, 0.66, 0.7], glow: [0.8, 0.8, 0.8], disc: 0,
    cloudCover: 1.0, cloudColor: [0.75, 0.78, 0.82], stars: 0,
    fogNear: 15, fogFar: 200, exposure: 1.0, emissive: 3, lamp: 7, aoMin: 0.08, bloom: 0.3,
  },
  night: {
    elevation: 38, sunColor: [0.55, 0.68, 1.0], sunIntensity: 0.42,
    skyLight: [0.2, 0.3, 0.6], groundLight: [0.08, 0.09, 0.14], ambient: 0.32,
    zenith: [0.006, 0.012, 0.04], horizon: [0.03, 0.05, 0.11], glow: [0.3, 0.4, 0.7], disc: 6,
    cloudCover: 0.3, cloudColor: [0.08, 0.1, 0.18], stars: 1,
    fogNear: 20, fogFar: 260, exposure: 1.25, emissive: 6, lamp: 14, aoMin: 0.2, bloom: 0.8,
  },
};

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww; // at the far plane: only pixels nothing else covered get shaded
}`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSunColor; uniform vec3 uCloudColor;
uniform vec3 uSunDir; // towards the sun
uniform float uDisc; uniform float uCloud; uniform float uStars; uniform float uTime;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
  // warm glow around the sun, strongest near the horizon
  float low = 1.0 - smoothstep(0.0, 0.55, d.y);
  col += uGlow * (pow(sd, 6.0) * 0.35 * low + pow(sd, 48.0) * 0.5);
  // stars
  if (uStars > 0.0 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.35) * 90.0;
    float st = hash21(floor(sp));
    vec2 f = fract(sp) - 0.5;
    col += uStars * smoothstep(0.985, 1.0, st) * smoothstep(0.35, 0.0, length(f)) * vec3(0.9, 0.95, 1.0) * 1.6 * smoothstep(0.0, 0.25, d.y);
  }
  // sun / moon disc
  float disc = smoothstep(0.99955, 0.9998, sd);
  vec3 sun = uSunColor * uDisc * disc;
  // clouds on a plane
  if (uCloud > 0.0 && d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(cp);
    float c = smoothstep(1.0 - uCloud * 0.75, 1.15 - uCloud * 0.55, n + 0.25);
    c *= smoothstep(0.0, 0.18, d.y);
    vec3 cc = uCloudColor * (0.55 + 0.45 * fbm(cp * 2.3 + 3.0)) + uGlow * pow(sd, 4.0) * 0.5;
    cc = mix(cc, col, 0.25 + 0.35 * (1.0 - smoothstep(0.0, 0.35, d.y))); // aerial perspective
    col = mix(col, cc, c);
    sun *= 1.0 - c;
  }
  col += sun;
  // below the horizon: fade to a darker ground tone
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.35, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() }, uCloudColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uDisc: { value: 1 }, uCloud: { value: 0.4 }, uStars: { value: 0 }, uTime: { value: 0 },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    mat.depthFunc = THREE.LessEqualDepth;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000; // after the opaque world (front-to-back), before transparents
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'sky';
  }

  apply(p: SkyPreset, towardsSun: THREE.Vector3): void {
    const u = this.uniforms;
    u.uZenith.value.setRGB(...p.zenith); u.uHorizon.value.setRGB(...p.horizon); u.uGlow.value.setRGB(...p.glow);
    u.uSunColor.value.setRGB(...p.sunColor); u.uCloudColor.value.setRGB(...p.cloudColor);
    u.uDisc.value = p.disc; u.uCloud.value = p.cloudCover; u.uStars.value = p.stars;
    u.uSunDir.value.copy(towardsSun).normalize();
  }
}
