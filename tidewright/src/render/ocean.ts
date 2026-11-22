// Gerstner ocean: the vertex shader evaluates the SAME wave set as sim-core/waves.ts,
// so what you see is what the buoyancy feels. Chart-style toon water with depth contours and foam.
import * as THREE from 'three';
import type { Terrain } from '../sim-core/terrain';
import { WAVE_COUNT, type Wave } from '../sim-core/waves';

const GRID = 1400, SEG = 280, FADE0 = 380, FADE1 = 640;

function depthTexture(t: Terrain): THREE.DataTexture {
  const n = t.res;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const d = Math.max(0, Math.min(1, -t.heights[i] / 30));
    data[i * 4] = Math.round(d * 255); data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const vertex = /* glsl */ `
  #define NW ${WAVE_COUNT}
  uniform vec4 uW1[NW]; // dirX, dirZ, k, omega
  uniform vec4 uW2[NW]; // amp, steep, phase, 0
  uniform float uTime;
  uniform vec3 uCam;
  varying vec3 vW;
  varying vec3 vN;
  varying float vCrest;
  void main() {
    vec4 w0 = modelMatrix * vec4(position, 1.0);
    vec2 p = w0.xz;
    float dist = length(p - uCam.xz);
    float fade = 1.0 - smoothstep(${FADE0.toFixed(1)}, ${FADE1.toFixed(1)}, dist);
    vec3 d = vec3(0.0);
    vec3 dx = vec3(1.0, 0.0, 0.0), dz = vec3(0.0, 0.0, 1.0);
    float crest = 0.0;
    for (int i = 0; i < NW; i++) {
      vec2 dir = uW1[i].xy; float k = uW1[i].z, om = uW1[i].w;
      float amp = uW2[i].x * fade, qa = uW2[i].y * amp;
      float th = k * dot(dir, p) - om * uTime + uW2[i].z;
      float c = cos(th), s = sin(th);
      d += vec3(qa * dir.x * c, amp * s, qa * dir.y * c);
      dx += vec3(-qa * dir.x * dir.x * k * s, amp * k * dir.x * c, -qa * dir.y * dir.x * k * s);
      dz += vec3(-qa * dir.x * dir.y * k * s, amp * k * dir.y * c, -qa * dir.y * dir.y * k * s);
      crest += qa * k * s;
    }
    vN = normalize(cross(dz, dx));
    vCrest = crest;
    vW = vec3(p.x + d.x, d.y, p.y + d.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
  }`;

const fragment = /* glsl */ `
  uniform float uTime, uSize, uFogNear, uFogFar, uNight;
  uniform sampler2D uDepth;
  uniform vec3 uDeep, uShallow, uLine, uFogColor, uSunDir, uSunColor, uSky;
  varying vec3 vW;
  varying vec3 vN;
  varying float vCrest;
  void main() {
    vec2 uv = (vW.xz + uSize * 0.5) / uSize;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float depth = mix(1.0, texture2D(uDepth, uv).r, inside);
    vec3 n = normalize(vN);
    vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 0.6, depth));
    // 3-step toon light
    float l = dot(n, normalize(uSunDir));
    float band = l > 0.75 ? 1.0 : l > 0.35 ? 0.86 : 0.72;
    vec3 col = base * band * mix(vec3(1.0), uSunColor, 0.35);
    // Fresnel tint toward the sky at grazing angles
    vec3 V = normalize(cameraPosition - vW);
    float fr = pow(1.0 - max(dot(n, V), 0.0), 4.0);
    col = mix(col, uSky, fr * 0.45);
    float dist = length(vW - cameraPosition);
    float distFade = 1.0 - smoothstep(150.0, 700.0, dist);
    // Depth contours drifting toward shore
    float c = fract(depth * 9.0 + uTime * 0.07);
    float w = fwidth(depth * 9.0) * 1.2;
    float line = (1.0 - smoothstep(0.0, w + 0.02, c)) * (1.0 - smoothstep(0.35, 0.95, depth)) * distFade * step(w, 0.4);
    float surf = (1.0 - smoothstep(0.0, 0.035 + 0.01 * sin(uTime * 1.3 + vW.x * 0.05), depth)) * inside;
    // Crest foam where the Gerstner surface pinches
    float foam = smoothstep(0.42, 0.62, vCrest) * (0.6 + 0.4 * step(0.5, fract(vW.x * 0.37 + vW.z * 0.21 + uTime * 0.2)));
    col = mix(col, uLine, max(max(line * 0.5, surf * 0.85), foam * 0.85));
    vec2 gpos = abs(fract(vW.xz / 100.0 + 0.5) - 0.5) * 100.0;
    float gw = fwidth(vW.x);
    float grid = 1.0 - smoothstep(gw * 0.5, gw * 1.5, min(gpos.x, gpos.y));
    col = mix(col, uLine, grid * 0.1 * smoothstep(0.4, 1.0, depth) * distFade);
    col *= mix(1.0, 0.35, uNight);
    float fog = smoothstep(uFogNear, uFogFar, dist);
    gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
    #include <colorspace_fragment>
  }`;

export class Ocean {
  group = new THREE.Group();
  uniforms: Record<string, THREE.IUniform>;
  private grid: THREE.Mesh;
  private ring: THREE.Mesh;

  constructor(t: Terrain) {
    const w1 = Array.from({ length: WAVE_COUNT }, () => new THREE.Vector4());
    const w2 = Array.from({ length: WAVE_COUNT }, () => new THREE.Vector4());
    this.uniforms = {
      uW1: { value: w1 }, uW2: { value: w2 }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
      uDepth: { value: depthTexture(t) }, uSize: { value: t.size },
      uDeep: { value: new THREE.Color('#0f5d63') }, uShallow: { value: new THREE.Color('#3fb3a5') }, uLine: { value: new THREE.Color('#e3f6ef') },
      uFogColor: { value: new THREE.Color('#efe7d6') }, uFogNear: { value: 300 }, uFogFar: { value: 2600 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) }, uSunColor: { value: new THREE.Color('#fff3dc') }, uSky: { value: new THREE.Color('#a9cfe0') },
      uNight: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment });
    const g = new THREE.PlaneGeometry(GRID, GRID, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    this.grid = new THREE.Mesh(g, mat);
    this.grid.frustumCulled = false;
    const r = new THREE.RingGeometry(FADE1 + 10, 9000, 64, 1);
    r.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(r, mat);
    this.ring.frustumCulled = false;
    this.group.add(this.grid, this.ring);
    this.group.name = 'ocean';
  }

  setWaves(waves: Wave[]) {
    const w1 = this.uniforms.uW1.value as THREE.Vector4[], w2 = this.uniforms.uW2.value as THREE.Vector4[];
    waves.forEach((w, i) => { w1[i].set(w.dirX, w.dirZ, w.k, w.omega); w2[i].set(w.amp, w.steep, w.phase, 0); });
  }

  update(time: number, camera: THREE.Vector3) {
    this.uniforms.uTime.value = time;
    (this.uniforms.uCam.value as THREE.Vector3).copy(camera);
    const step = GRID / SEG;
    this.grid.position.set(Math.round(camera.x / step) * step, 0, Math.round(camera.z / step) * step);
    this.ring.position.set(camera.x, 0, camera.z);
  }
}
