/**
 * Test hook: run the GLSL `vxTrace` for a batch of rays on the GPU (against the live game volume) so
 * tests can compare it with the CPU reference `Occupancy.trace`.
 */
import * as THREE from 'three';
import { TRACE_GLSL } from './trace.glsl';
import type { LookShared } from './worldMaterial';

/** rays: 7 floats each (origin xyz, direction xyz, tMax) in volume voxel units. Returns 1 byte per ray (1 = hit). */
export function gpuTrace(three: THREE.WebGLRenderer, shared: LookShared, rays: Float32Array): Uint8Array {
  const n = Math.floor(rays.length / 7);
  const w = 256, h = Math.max(1, Math.ceil(n / w));
  const a = new Float32Array(w * h * 4), b = new Float32Array(w * h * 4);
  for (let i = 0; i < n; i++) {
    a[i * 4] = rays[i * 7]; a[i * 4 + 1] = rays[i * 7 + 1]; a[i * 4 + 2] = rays[i * 7 + 2]; a[i * 4 + 3] = rays[i * 7 + 6];
    b[i * 4] = rays[i * 7 + 3]; b[i * 4 + 1] = rays[i * 7 + 4]; b[i * 4 + 2] = rays[i * 7 + 5];
  }
  const mkTex = (d: Float32Array) => {
    const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
    return t;
  };
  const ta = mkTex(a), tb = mkTex(b);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...shared, tA: { value: ta }, tB: { value: tb } },
    defines: { VX_MAX_COARSE_STEPS: 1024 },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tA; uniform sampler2D tB;\n${TRACE_GLSL}\nvoid main() {
      ivec2 p = ivec2(gl_FragCoord.xy);
      vec4 A = texelFetch(tA, p, 0); vec4 B = texelFetch(tB, p, 0);
      gl_FragColor = vec4(vxTrace(A.xyz, B.xyz, A.w) ? 1.0 : 0.0, 0.0, 0.0, 1.0);
    }`,
    depthTest: false, depthWrite: false, toneMapped: false, fog: false,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  const quad = new THREE.Mesh(geo, mat);
  quad.frustumCulled = false;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const prev = three.getRenderTarget();
  three.setRenderTarget(rt);
  three.render(quad, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  const px = new Uint8Array(w * h * 4);
  three.readRenderTargetPixels(rt, 0, 0, w, h, px);
  three.setRenderTarget(prev);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = px[i * 4] > 127 ? 1 : 0;
  rt.dispose(); ta.dispose(); tb.dispose(); mat.dispose(); geo.dispose();
  return out;
}
