// Island terrain mesh (toon, vertex colours, chart contour lines) and the stylised sea.
import * as THREE from 'three';
import { fbm, type Terrain } from '../sim-core/terrain';
import { toonRamp } from './materials';

const SAND = new THREE.Color('#e3cf9a');
const GRASS = new THREE.Color('#8fb35a');
const GRASS2 = new THREE.Color('#5f8f45');
const ROCK = new THREE.Color('#9a9488');
const SNOWCAP = new THREE.Color('#ece6d8');
const SEABED = new THREE.Color('#5d8f8a');
const PAD = new THREE.Color('#c9c2b0');

export function buildTerrainMesh(t: Terrain): THREE.Mesh {
  const n = t.res;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  for (let iz = 0; iz < n; iz++)
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const x = -t.size / 2 + ix * t.step, z = -t.size / 2 + iz * t.step;
      const h = t.heights[i];
      pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
      const hx = t.heights[iz * n + Math.min(ix + 1, n - 1)] - t.heights[iz * n + Math.max(ix - 1, 0)];
      const hz = t.heights[Math.min(iz + 1, n - 1) * n + ix] - t.heights[Math.max(iz - 1, 0) * n + ix];
      const slope = Math.hypot(hx, hz) / (2 * t.step);
      if (h < -0.5) c.copy(SEABED).lerp(SAND, Math.max(0, 1 + h / 6));
      else if (h < 2.2) c.copy(SAND);
      else {
        c.copy(GRASS).lerp(GRASS2, Math.min(1, Math.max(0, (h - 10) / 40)));
        if (slope > 0.55) c.lerp(ROCK, Math.min(1, (slope - 0.55) * 3));
        if (h > 70) c.lerp(SNOWCAP, Math.min(1, (h - 70) / 12));
      }
      // Patchy meadow tones so slopes read at speed.
      if (h > 2.2) { const v = fbm(x / 38, z / 38, 99, 3); c.multiplyScalar(0.86 + 0.26 * v); }
      const dp = Math.hypot(x - t.pad.x, z - t.pad.z);
      if (dp < t.pad.r) c.copy(PAD);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  // Same triangulation as the physics heightfield: diagonal (ix+1,iz)-(ix,iz+1).
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < n - 1; iz++)
    for (let ix = 0; ix < n - 1; ix++) {
      const a = iz * n + ix, b = a + 1, cc = a + n, d = cc + 1;
      idx[k++] = a; idx[k++] = cc; idx[k++] = b;
      idx[k++] = b; idx[k++] = cc; idx[k++] = d;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  // Chart contour lines every 10 m, plus a bold one every 50 m.
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (vH > 0.6) {
          float f = abs(fract(vH / 10.0 + 0.5) - 0.5) * 10.0;
          float w = fwidth(vH) * 0.9;
          float line = 1.0 - smoothstep(w * 0.6, w * 1.4, f);
          float f5 = abs(fract(vH / 50.0 + 0.5) - 0.5) * 50.0;
          float bold = 1.0 - smoothstep(w * 1.2, w * 2.4, f5);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.16, 0.22, 0.32), max(line * 0.28, bold * 0.45));
        }`,
      );
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Height texture for the water shader (shore tint and depth contours). */
function heightTexture(t: Terrain): THREE.DataTexture {
  const n = t.res;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const d = Math.max(0, Math.min(1, -t.heights[i] / 30)); // 0 at shore .. 1 at 30 m deep
    const land = t.heights[i] > 0 ? 255 : 0;
    data[i * 4] = Math.round(d * 255); data[i * 4 + 1] = land; data[i * 4 + 2] = 0; data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function buildSea(t: Terrain): { mesh: THREE.Mesh; update(time: number): void } {
  const g = new THREE.PlaneGeometry(12000, 12000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uDepth: { value: heightTexture(t) },
    uSize: { value: t.size },
    uDeep: { value: new THREE.Color('#0f5d63') },
    uShallow: { value: new THREE.Color('#3fb3a5') },
    uLine: { value: new THREE.Color('#d9f2ea') },
    uFogColor: { value: new THREE.Color('#efe7d6') },
    uFogNear: { value: 300 },
    uFogFar: { value: 2600 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    transparent: false,
    vertexShader: `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uSize, uFogNear, uFogFar;
      uniform sampler2D uDepth;
      uniform vec3 uDeep, uShallow, uLine, uFogColor;
      varying vec3 vW;
      void main() {
        vec2 uv = (vW.xz + uSize * 0.5) / uSize;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float depth = mix(1.0, texture2D(uDepth, uv).r, inside);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.6, depth));
        // Banded toon water
        col *= 0.92 + 0.08 * step(0.5, fract(depth * 4.0));
        // Animated depth contours drifting toward shore
        float c = fract(depth * 9.0 + uTime * 0.07);
        float w = fwidth(depth * 9.0) * 1.2;
        float distFade = 1.0 - smoothstep(150.0, 700.0, length(vW - cameraPosition));
        float line = (1.0 - smoothstep(0.0, w + 0.02, c)) * (1.0 - smoothstep(0.35, 0.95, depth)) * distFade * step(w, 0.4);
        // Surf line at the shore
        float surf = (1.0 - smoothstep(0.0, 0.035 + 0.01 * sin(uTime * 1.3 + vW.x * 0.05), depth)) * inside;
        col = mix(col, uLine, max(line * 0.55, surf * 0.85));
        // Open-sea chart grid every 100 m
        vec2 gpos = abs(fract(vW.xz / 100.0 + 0.5) - 0.5) * 100.0;
        float gw = fwidth(vW.x) * 1.0;
        float grid = 1.0 - smoothstep(gw * 0.5, gw * 1.5, min(gpos.x, gpos.y));
        col = mix(col, uLine, grid * 0.12 * smoothstep(0.4, 1.0, depth) * distFade);
        float dist = length(vW - cameraPosition);
        float fog = smoothstep(uFogNear, uFogFar, dist);
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = 0;
  mesh.name = 'sea';
  return { mesh, update: (time) => { uniforms.uTime.value = time; } };
}
