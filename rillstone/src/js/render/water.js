// River water: a ribbon along the river centreline, drawn with a shader that
// tints by depth (deep teal in the channel, paler at the banks), scrolls a
// flow pattern downstream at a speed that follows the flow rate (fast over
// the falls), and puts foam where the water meets the banks and on the falls.
import * as THREE from 'three';
import { riverX, waterY, RIVER_HALF_WIDTH, HALF } from '../world/valley.js';

const vert = /* glsl */`
attribute float steep;
varying vec2 vUv; varying float vSteep; varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv; vSteep = steep;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const frag = /* glsl */`
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky;
uniform vec3 uDeep; uniform vec3 uShallow; uniform float uFlow; uniform float uLight;
varying vec2 vUv; varying float vSteep; varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float edge = abs(vUv.x - 0.5) * 2.0;
  float speed = uFlow * (1.0 + vSteep * 6.0);
  vec2 p = vec2(vUv.x * 6.0, vUv.y * 0.35 - uTime * speed);
  float n1 = vnoise(p * 1.7), n2 = vnoise(p * 4.3 + 7.1 + vec2(0.0, -uTime * speed * 0.6));
  float flow = n1 * 0.6 + n2 * 0.4;
  vec3 col = mix(uDeep, uShallow, smoothstep(0.35, 1.0, edge) * 0.85);
  col = mix(col, uSky, 0.18);
  // Fake ripple normal from the flow pattern, for sun glints.
  vec3 nrm = normalize(vec3((n2 - 0.5) * 0.5, 1.0, (n1 - 0.5) * 0.5));
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 hv = normalize(uSunDir + view);
  float spec = pow(max(dot(nrm, hv), 0.0), 90.0) * 1.6;
  col += uSunColor * spec;
  col += (flow - 0.5) * 0.06;
  // Foam at the banks and on the falls.
  float foamEdge = smoothstep(0.78, 0.98, edge + (n2 - 0.5) * 0.25);
  float foamFall = smoothstep(0.15, 0.6, vSteep) * smoothstep(0.35, 0.75, n1 * 0.7 + n2 * 0.5);
  float foam = max(foamEdge, foamFall);
  col = mix(col, vec3(0.93, 0.97, 0.98), foam * 0.85);
  col *= uLight;
  float alpha = mix(0.86, 0.55, smoothstep(0.6, 1.0, edge));
  alpha = max(alpha, foam);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// The thin animated sheet of water running down a sluice.
const sheetFrag = /* glsl */`
uniform float uTime; varying vec2 vUv;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float n = vn(vec2(vUv.x * 8.0, vUv.y * 6.0 - uTime * 3.0)) * 0.6 + vn(vec2(vUv.x * 16.0, vUv.y * 14.0 - uTime * 5.0)) * 0.4;
  vec3 col = mix(vec3(0.16, 0.5, 0.52), vec3(0.85, 0.95, 0.96), smoothstep(0.55, 0.9, n));
  gl_FragColor = vec4(col, 0.62 + n * 0.25);
  #include <colorspace_fragment>
}`;
export function sheetMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: sheetFrag, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } } });
}

export function buildWater(scene) {
  const pos = [], uv = [], steep = [], idx = [];
  const STEP = 2, ACROSS = 8;
  let along = 0, prev = null, rows = 0;
  for (let z = -HALF - 10; z <= HALF + 10; z += STEP) {
    const x = riverX(z), y = waterY(z), w = RIVER_HALF_WIDTH(z) + 2.2;
    // Perpendicular to the river direction.
    const dx = (riverX(z + 1) - riverX(z - 1)) / 2, len = Math.hypot(dx, 1);
    const px = 1 / len, pz = -dx / len;
    if (prev) along += Math.hypot(x - prev.x, y - prev.y, STEP);
    const s = prev ? Math.min(1, Math.abs(y - prev.y) / STEP) : 0;
    for (let k = 0; k <= ACROSS; k++) {
      const t = k / ACROSS - 0.5;
      pos.push(x + px * t * 2 * w, y, z + pz * t * 2 * w);
      uv.push(k / ACROSS, along);
      steep.push(s);
    }
    if (rows > 0) for (let k = 0; k < ACROSS; k++) {
      const a = (rows - 1) * (ACROSS + 1) + k, b = a + 1, c = a + ACROSS + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    prev = { x, y }; rows++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('steep', new THREE.Float32BufferAttribute(steep, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0x9cc6d8) }, uDeep: { value: new THREE.Color(0x0f5f66) }, uShallow: { value: new THREE.Color(0x4fa3a0) },
      uFlow: { value: 0.35 }, uLight: { value: 1 },
    }]),
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 2;
  scene.add(mesh);
  return {
    mesh, mat, sheetMaterial,
    // Is a point under the river surface (used for panning, splashes, swimming)?
    contains(x, y, z) { const w = RIVER_HALF_WIDTH(z) + 0.8; return Math.abs(x - riverX(z)) < w && y < waterY(z) + 0.05; },
    update(t, env) { const u = mat.uniforms; u.uTime.value = t; u.uSunDir.value.copy(env.sunDir); u.uSunColor.value.copy(env.sunColor).multiplyScalar(env.sunIntensity * 0.5); u.uSky.value.copy(env.horizon); u.uLight.value = env.waterLight; },
  };
}
