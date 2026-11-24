// One material for both pipelines: MeshLambertMaterial + onBeforeCompile patches (three.js r187).
//  mode 'B' : three.js shadow map on the DirectionalLight + baked per-vertex AO attribute.
//  mode 'A' : NO shadow map; the DirectionalLight colour is multiplied by a ray traced through the
//             world occupancy volume (vxTrace), and indirect light by occupancy-based AO.
// Keeping three's lighting (hemisphere/point/spot lights, fog, tone mapping, colour management)
// and only swapping the shadow + AO terms is the least fragile integration for agents.
import * as THREE from 'three';
import { TRACE_GLSL } from './trace.glsl.js';
import { PALETTE } from './world.js';

function mustReplace(src, find, repl) {
  if (!src.includes(find)) throw new Error('onBeforeCompile patch failed, chunk not found: ' + find);
  return src.replace(find, repl);
}

export function makeVoxelMaterial(mode, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const palette = PALETTE.map(c => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace));
  while (palette.length < 16) palette.push(new THREE.Color(1, 0, 1));
  const uniforms = {
    uPalette: { value: palette },
    uFrame: { value: 0 },
    uSunSpread: { value: opts.sunSpread ?? 0.0 },   // radians-ish cone half-angle for soft shadows
    uAOStrength: { value: opts.aoStrength ?? 1.0 },
    ...(opts.volumeUniforms || {}),
  };
  m.userData.uniforms = uniforms;
  const defines = {};
  if (mode === 'A') {
    defines.VX_TRACED = 1;
    if (opts.shadow !== false) defines.VX_TRACED_SUN = 1;
    if (opts.faceAO !== false) defines.VX_FACE_AO = 1;
    if (opts.coneAO !== false) defines.VX_CONE_AO = 1;
    if (opts.rayAO) { defines.VX_RAY_AO = opts.rayAO; defines.VX_RAY_AO_RANGE = (opts.rayAORange ?? 24).toFixed(1); }
    if (opts.sunSteps) defines.VX_MAX_COARSE_STEPS = opts.sunSteps;
    if (opts.coneMax) defines.VX_CONE_MAX = opts.coneMax.toFixed(1);
  } else {
    defines.VX_BAKED_AO = 1;
  }
  if (opts.debugAO) { defines.VX_DEBUG_AO = 1; m.toneMapped = false; m.fog = false; }
  m.defines = defines;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>', `#include <common>
      attribute float mat; attribute float aoBake;
      varying float vMat; varying float vAO; varying vec3 vWPos; varying vec3 vWNrm;`);
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <project_vertex>', `#include <project_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWNrm = normalize(mat3(modelMatrix) * objectNormal);
      vMat = mat; vAO = aoBake;`);

    let fs = shader.fragmentShader;
    fs = mustReplace(fs, '#include <common>', `#include <common>
      varying float vMat; varying float vAO; varying vec3 vWPos; varying vec3 vWNrm;
      uniform vec3 uPalette[16];
      uniform float uFrame; uniform float uSunSpread; uniform float uAOStrength;
      #ifdef VX_TRACED
      ${TRACE_GLSL}
      #else
      uniform vec3 uVolOrigin; uniform float uVoxelSize;
      #endif
      float vxHash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      vec3 vxPV() { return (vWPos - uVolOrigin) / uVoxelSize; }
      #ifdef VX_TRACED_SUN
      float vxSunShadow(vec3 lightDirView) {
        vec3 L = normalize((vec4(lightDirView, 0.0) * viewMatrix).xyz); // view -> world
        vec3 n = normalize(vWNrm);
        if (dot(n, L) <= 0.0) return 0.0;
        if (uSunSpread > 0.0) { // jitter within a cone -> soft shadows (needs accumulation)
          float a = vxIGN(gl_FragCoord.xy, uFrame) * 6.2831853;
          float r = sqrt(vxIGN(gl_FragCoord.xy + 31.0, uFrame + 11.0)) * uSunSpread;
          vec3 t1 = normalize(cross(L, abs(L.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0)));
          vec3 t2 = cross(L, t1);
          L = normalize(L + (t1 * cos(a) + t2 * sin(a)) * r);
        }
        vec3 o = vxPV() + n * 0.05;
        return vxTrace(o, L, 2000.0) ? 0.0 : 1.0;
      }
      #endif`);
    fs = mustReplace(fs, '#include <color_fragment>', `
      {
        int mi = int(vMat + 0.5);
        vec3 alb = uPalette[mi];
        vec3 vox = floor(vxPV() - normalize(vWNrm) * 0.5);   // the solid voxel this face belongs to
        alb *= 0.88 + 0.24 * vxHash13(vox + 0.5);             // per-voxel colour variation (free with greedy quads)
        diffuseColor.rgb *= alb;
      }`);
    fs = mustReplace(fs, 'getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );
      #ifdef VX_TRACED_SUN
      directLight.color *= vxSunShadow( directionalLight.direction );
      #endif`);
    fs = mustReplace(fs, '#include <aomap_fragment>', `
      {
        float vxao = 1.0;
        #ifdef VX_BAKED_AO
          vxao = vAO;
        #endif
        #ifdef VX_TRACED
          vec3 pv = vxPV(); vec3 n = normalize(vWNrm);
          #ifdef VX_FACE_AO
            vxao *= vxFaceAO(pv, n);
          #endif
          #ifdef VX_RAY_AO
            vxao *= vxRayAO(pv, n, VX_RAY_AO, VX_RAY_AO_RANGE, gl_FragCoord.xy, uFrame);
          #endif
          #ifdef VX_CONE_AO
            vxao *= vxConeAO(pv, n);
          #endif
        #endif
        #ifdef VX_DEBUG_AO
          reflectedLight.indirectDiffuse = vec3(vxao); reflectedLight.directDiffuse = vec3(0.0);
        #else
          vxao = mix(1.0, 0.25 + 0.75 * vxao, uAOStrength);
          reflectedLight.indirectDiffuse *= vxao;
        #endif
      }`);
    shader.fragmentShader = fs;
  };
  // patch the include before three resolves it: expand <lights_fragment_begin> ourselves
  const orig = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin);
    orig(shader, r);
  };
  m.customProgramCacheKey = () => 'vx-' + mode + JSON.stringify(defines);
  return m;
}
