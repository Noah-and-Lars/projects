/**
 * Lit materials for voxel chunk meshes: MeshLambertMaterial patched with onBeforeCompile (three r187).
 * three keeps doing lights / fog / colour management; we replace
 *   - the sun shadow: one (or a few) rays per pixel through the world occupancy volume (voxel exact),
 *   - ambient occlusion: per-pixel "face AO" (static world) or baked vertex AO (dynamic bodies) x cone AO,
 *   - point-light shadows: one short ray per light through the same volume,
 * and add per-voxel colour grain, emissive voxels and a cheap glass look.
 *
 * Vertex attributes: color (rgb = sRGB albedo, a = baked AO), aux (x = emissive, y = glass).
 * The same lighting patch (without the voxel-specific parts) can be applied to any other lit three
 * material with `patchForeignMaterial` so props / particles / view models sit in the same light.
 */
import * as THREE from 'three';
import { VOXEL } from '../sim/materials';
import { TRACE_GLSL } from './trace.glsl';

export interface LookConfig {
  /** occupancy volumes available -> traced lighting */
  volumes: boolean;
  tracedSun: boolean;
  /** 1 = hard shadows, >1 = that many rays in a small cone (world-stable dither) */
  sunTaps: number;
  /** max coarse (0.4 m) cells a sun ray may cross */
  sunSteps: number;
  coneAO: boolean;
  /** cone length in voxels */
  coneMax: number;
  coneSteps: number;
  pointShadows: boolean;
}

/** uniform objects shared by every patched material (mutate `.value`, never replace the objects) */
export interface LookShared {
  uBits: { value: THREE.Data3DTexture | null };
  uDens: { value: THREE.Data3DTexture | null };
  uVolSize: { value: THREE.Vector3 };
  uVolOrigin: { value: THREE.Vector3 };
  uInvVoxel: { value: number };
  /** emissive voxel radiance multiplier */
  uEmissive: { value: number };
  /** ambient left in fully occluded places (0..1) */
  uAOMin: { value: number };
  /** sun cone radius (radians) for soft shadows */
  uSunSpread: { value: number };
  uSaturation: { value: number };
  /** distance-proportional quad overlap (metres per metre of view distance) */
  uInflate: { value: number };
  uSkyZenith: { value: THREE.Color };
  uSkyHorizon: { value: THREE.Color };
}

export function makeLookShared(): LookShared {
  return {
    uBits: { value: null }, uDens: { value: null },
    uVolSize: { value: new THREE.Vector3(4, 4, 4) }, uVolOrigin: { value: new THREE.Vector3() }, uInvVoxel: { value: 1 / VOXEL },
    uEmissive: { value: 3 }, uAOMin: { value: 0.12 }, uSunSpread: { value: 0.012 }, uSaturation: { value: 0.72 }, uInflate: { value: 0.0015 },
    uSkyZenith: { value: new THREE.Color(0.2, 0.4, 0.8) }, uSkyHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
  };
}

function mustReplace(src: string, find: string, repl: string): string {
  if (!src.includes(find)) throw new Error('shader patch failed, anchor not found: ' + find);
  return src.replace(find, repl);
}

type Kind = 'static' | 'dynamic' | 'glass' | 'foreign';

function definesFor(kind: Kind, cfg: LookConfig): Record<string, string | number> {
  const d: Record<string, string | number> = {};
  if (kind !== 'foreign') d.VX_OWN = 1;
  if (kind === 'glass') d.VX_GLASS = 1;
  if (cfg.volumes) {
    d.VX_VOLUME = 1;
    if (cfg.tracedSun) { d.VX_TRACED_SUN = 1; d.VX_SUN_TAPS = Math.max(1, cfg.sunTaps | 0); d.VX_MAX_COARSE_STEPS = cfg.sunSteps | 0; }
    if (cfg.coneAO) { d.VX_CONE_AO = 1; d.VX_CONE_MAX = cfg.coneMax.toFixed(1); d.VX_CONE_STEPS = cfg.coneSteps | 0; }
    if (cfg.pointShadows) d.VX_POINT_SHADOWS = 1;
    if (kind === 'static') d.VX_FACE_AO = 1;
    // ray origin offset along the normal (voxels): static faces sit exactly on voxel planes; anything else gets more slack
    d.VX_ORIGIN_OFFSET = kind === 'static' || kind === 'glass' ? '0.05' : '0.3';
  }
  if (kind === 'dynamic' || (kind === 'static' && !cfg.volumes)) d.VX_BAKED_AO = 1;
  return d;
}

const FRAG_PARS = /* glsl */ `
uniform float uEmissive; uniform float uAOMin; uniform float uSunSpread; uniform float uSaturation;
uniform vec3 uSkyZenith; uniform vec3 uSkyHorizon;
#ifdef VX_OWN
varying vec2 vAux; centroid varying vec3 vWPos; varying vec3 vWNrm; centroid varying vec3 vVox;
#endif
float vxGrain(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
#ifdef VX_VOLUME
${TRACE_GLSL}
#ifdef VX_TRACED_SUN
float vxSunShadow(vec3 lightDirView, vec3 pv, vec3 n) {
  vec3 L = normalize((vec4(lightDirView, 0.0) * viewMatrix).xyz); // view -> world
  if (dot(n, L) <= 0.0) return 0.0;
  vec3 o = pv + n * VX_ORIGIN_OFFSET;
  #if VX_SUN_TAPS > 1
    // a few rays in a small cone; the rotation is keyed on a world-space 1/4-voxel cell so the
    // penumbra dither is stable under camera motion (no temporal accumulation needed)
    float h = vxHash13(floor(pv * 4.0 + n * 0.5) + 0.5);
    vec3 t1 = normalize(cross(L, abs(L.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(L, t1);
    float lit = 0.0;
    for (int i = 0; i < VX_SUN_TAPS; i++) {
      float a = (h + float(i) * 0.61803399) * 6.2831853;
      float r = uSunSpread * sqrt((float(i) + 0.5) / float(VX_SUN_TAPS));
      vec3 d = L + (t1 * cos(a) + t2 * sin(a)) * r;
      lit += vxTrace(o, d, 4000.0) ? 0.0 : 1.0;
    }
    return lit / float(VX_SUN_TAPS);
  #else
    return vxTrace(o, L, 4000.0) ? 0.0 : 1.0;
  #endif
}
#endif
#ifdef VX_POINT_SHADOWS
// toLightView = light position - surface position (view space, metres)
float vxPointShadow(vec3 toLightView, vec3 pv, vec3 n) {
  vec3 D = (vec4(toLightView, 0.0) * viewMatrix).xyz * uInvVoxel; // world, voxels
  float len = length(D);
  if (len < 3.0 || dot(n, D) <= 0.0) return 1.0;
  return vxTrace(pv + n * VX_ORIGIN_OFFSET, D, 1.0 - 1.5 / len) ? 0.0 : 1.0;
}
#endif
#endif
`;

/** world-space position / normal of the fragment, declared right before the light loops */
const LIGHTS_PRE = /* glsl */ `
#ifdef VX_OWN
  vec3 vxN = normalize(vWNrm);
  vec3 vxW = vWPos;
#else
  vec3 vxN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 vxW = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
#endif
#ifdef VX_VOLUME
  vec3 vxP = (vxW - uVolOrigin) * uInvVoxel;
  #ifdef VX_FACE_AO
  // a static face whose front cell is solid is buried against another body (e.g. the side walls of two
  // ground tiles): it can only show up as z-fighting specks along the seam, so drop it
  if (vxSolidSafe(ivec3(floor(vxP + vxN * 0.5)))) discard;
  #endif
#endif
`;

const AO_CODE = /* glsl */ `
{
  float vxao = 1.0;
  #ifdef VX_BAKED_AO
    vxao *= vxBakedAO;
    reflectedLight.directDiffuse *= mix(1.0, vxBakedAO, 0.3);
  #endif
  #ifdef VX_VOLUME
    #ifdef VX_FACE_AO
      vxao *= mix(0.3, 1.0, vxFaceAO(vxP, vxN));
    #endif
    #ifdef VX_CONE_AO
      vxao *= vxConeAO(vxP, vxN);
    #endif
  #endif
  reflectedLight.indirectDiffuse *= mix(uAOMin, 1.0, vxao);
}
`;

function patchFragmentLighting(fs: string): string {
  fs = mustReplace(fs, '#include <common>', '#include <common>\n' + FRAG_PARS);
  let lights = THREE.ShaderChunk.lights_fragment_begin;
  lights = mustReplace(lights, 'getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );
    #if defined( VX_VOLUME ) && defined( VX_TRACED_SUN )
    if ( directLight.visible ) directLight.color *= vxSunShadow( directionalLight.direction, vxP, vxN );
    #endif`);
  lights = mustReplace(lights, 'getPointLightInfo( pointLight, geometryPosition, directLight );', `getPointLightInfo( pointLight, geometryPosition, directLight );
    #if defined( VX_VOLUME ) && defined( VX_POINT_SHADOWS )
    if ( directLight.visible ) directLight.color *= vxPointShadow( pointLight.position - geometryPosition, vxP, vxN );
    #endif`);
  fs = mustReplace(fs, '#include <lights_fragment_begin>', LIGHTS_PRE + lights);
  return fs;
}

function makeBase(kind: Kind, shared: LookShared, cfg: LookConfig, params: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  mat.defines = definesFor(kind, cfg);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    let vs = shader.vertexShader;
    vs = mustReplace(vs, '#include <common>', `#include <common>
      attribute vec3 aux;
      uniform float uInflate;
      varying vec2 vAux; centroid varying vec3 vWPos; varying vec3 vWNrm; centroid varying vec3 vVox;`);
    // Overlap quads along edges where the surface continues, proportional to the view distance: rasterizers snap
    // vertices to a sub-pixel grid, so T-junctions of greedy meshes need a (tiny) screen-space overlap, not a
    // fixed world-space one, or distant ground sparkles with background pixels.
    vs = mustReplace(vs, '#include <begin_vertex>', `#include <begin_vertex>
      {
        int vxc = int(aux.z * 255.0 + 0.5);
        vec3 vxa = abs(normal);
        vec3 vxU = vxa.x > 0.5 ? vec3(0.0, 1.0, 0.0) : (vxa.y > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0));
        vec3 vxV = vxa.x > 0.5 ? vec3(0.0, 0.0, 1.0) : (vxa.y > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0));
        float vxk = uInflate * length((modelViewMatrix * vec4(transformed, 1.0)).xyz);
        if ((vxc & 4) != 0) transformed += vxU * ((vxc & 1) != 0 ? vxk : -vxk);
        if ((vxc & 8) != 0) transformed += vxV * ((vxc & 2) != 0 ? vxk : -vxk);
      }`);
    vs = mustReplace(vs, '#include <project_vertex>', `#include <project_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWNrm = normalize(mat3(modelMatrix) * objectNormal);
      vVox = transformed * ${(1 / VOXEL).toFixed(1)} - normal * 0.5;
      vAux = aux.xy;`);
    shader.vertexShader = vs;

    let fs = patchFragmentLighting(shader.fragmentShader);
    fs = mustReplace(fs, '#include <color_fragment>', `
      float vxBakedAO = vColor.a;
      {
        vec3 alb = pow(vColor.rgb, vec3(2.2));
        alb = mix(vec3(dot(alb, vec3(0.2126, 0.7152, 0.0722))), alb, uSaturation);
        vec3 vox = floor(vVox);
        // per-voxel grain + a little 4-voxel blotchiness (greedy quads stay big, the shader adds the detail)
        alb *= 0.9 + 0.14 * vxGrain(vox + 0.5) + 0.06 * vxGrain(floor(vox * 0.25) + 7.5);
        diffuseColor.rgb *= alb;
      }`);
    fs = mustReplace(fs, '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vAux.x * uEmissive;`);
    fs = mustReplace(fs, '#include <aomap_fragment>', AO_CODE);
    fs = mustReplace(fs, '#include <envmap_fragment>', `
      #ifdef VX_GLASS
      {
        vec3 V = normalize(cameraPosition - vxW);
        float fr = pow(1.0 - abs(dot(vxN, V)), 4.0);
        vec3 R = reflect(-V, vxN);
        vec3 sky = R.y > 0.0 ? mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.7, R.y)) : uSkyHorizon * mix(1.0, 0.35, smoothstep(0.0, -0.4, R.y));
        outgoingLight = mix(outgoingLight * 0.6, sky, 0.15 + 0.7 * fr);
        diffuseColor.a = mix(0.34, 0.92, fr);
      }
      #endif`);
    shader.fragmentShader = fs;
  };
  const key = 'vx-' + kind + JSON.stringify(mat.defines);
  mat.customProgramCacheKey = () => key;
  return mat;
}

export interface VoxelMaterials {
  /** static bodies stamped into the occupancy volume (or everything static in the low tier) */
  static: THREE.MeshLambertMaterial;
  /** dynamic / rotated bodies: baked AO for self occlusion, traced world shadows */
  dynamic: THREE.MeshLambertMaterial;
  glass: THREE.MeshLambertMaterial;
}

export function makeVoxelMaterials(shared: LookShared, cfg: LookConfig): VoxelMaterials {
  return {
    static: makeBase('static', shared, cfg, {}),
    dynamic: makeBase('dynamic', shared, cfg, {}),
    glass: makeBase('glass', shared, cfg, { transparent: true, depthWrite: false }),
  };
}

export function disposeVoxelMaterials(m: VoxelMaterials): void {
  m.static.dispose(); m.dynamic.dispose(); m.glass.dispose();
}

const PATCHED = Symbol('vxPatched');

/**
 * Make another lit three material (Lambert / Phong / Standard / Toon ...) receive the traced sun shadow,
 * point-light shadows and cone AO. Safe to call repeatedly; returns false if the material cannot be patched.
 * Call again with a new config after a quality change.
 */
export function patchForeignMaterial(mat: THREE.Material, shared: LookShared, cfg: LookConfig): boolean {
  const m = mat as any;
  if (!(m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial || m.isMeshToonMaterial)) return false;
  if (m.defines?.VX_OWN) return false;
  const defs = definesFor('foreign', cfg);
  const key = 'vxf-' + JSON.stringify(defs);
  if (m[PATCHED] === key) return true;
  const first = m[PATCHED] === undefined;
  m[PATCHED] = key;
  // strip our old defines, add the new ones
  const d: Record<string, any> = { ...(m.defines ?? {}) };
  for (const k of Object.keys(d)) if (k.startsWith('VX_')) delete d[k];
  m.defines = Object.assign(d, defs);
  if (first) {
    const prevCompile = m.onBeforeCompile as THREE.Material['onBeforeCompile'];
    const prevKey = m.customProgramCacheKey as () => string;
    m.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => {
      prevCompile?.call(m, shader, r);
      try {
        const fs = mustReplace(patchFragmentLighting(shader.fragmentShader), '#include <aomap_fragment>', '#include <aomap_fragment>\n' + AO_CODE.replace('vxBakedAO', '1.0'));
        shader.fragmentShader = fs;
        Object.assign(shader.uniforms, shared);
      } catch (e) {
        console.warn('[render] could not patch material', m.type, e);
      }
    };
    m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + m[PATCHED];
  }
  m.needsUpdate = true;
  return true;
}
