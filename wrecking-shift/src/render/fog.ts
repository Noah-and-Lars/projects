/**
 * Atmospheric fog for every fogged material (docs/research/13-lighting-feel.md item 4, 14-reference-match.md).
 *
 * three's fog chunks are replaced once, globally, before anything compiles:
 *  - radial distance (not view depth, so the haze does not change when the view turns),
 *  - exponential build-up between `fog.near` and `fog.far` that still reaches 100 % at `fog.far` (chunks beyond the
 *    draw distance must stay hidden: the edge module fits these distances to the level),
 *  - thinner when looking up (the reference's fog depends on the vertical view direction, which reads as height fog
 *    at no cost),
 *  - sun inscatter: the fog colour brightens toward the sun with the sky dome's own horizon-glow term, so far
 *    buildings melt into the glowing sky at golden hour instead of a flat beige wall.
 *
 * The extra uniforms (`fogSun`, `fogGlow`, `fogShape`) are plain {x,y,z,w} objects shared by reference: three's
 * uniform cloning copies three objects (Vector3 ...) but keeps plain objects, so one `setFogAtmosphere` call updates
 * every material at once. Materials whose uniforms lack them (custom ShaderMaterials) read zeros = no glow, plain
 * height-free exponential fog.
 */
import * as THREE from 'three';

type V4 = { x: number; y: number; z: number; w: number };
/** xyz: unit vector toward the sun (world), w: glow exponent */
const fogSun: V4 = { x: 0, y: 1, z: 0, w: 6 };
/** xyz: glow colour added to the fog colour toward the sun (linear), w: unused */
const fogGlow: V4 = { x: 0, y: 0, z: 0, w: 0 };
/** x: density scale (1 = default), y: vertical thinning (0 = none), z, w: unused */
const fogShape: V4 = { x: 1, y: 0, z: 0, w: 0 };

export const FOG_UNIFORMS = { fogSun: { value: fogSun }, fogGlow: { value: fogGlow }, fogShape: { value: fogShape } };

let installed = false;
/** replace three's fog chunks and give the built-in shader libraries the shared atmosphere uniforms (idempotent) */
export function installFog(): void {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogView;
#endif`;
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
#endif`;
  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogView;
  uniform vec4 fogSun; uniform vec4 fogGlow; uniform vec4 fogShape;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  {
    vec3 fogDirW = normalize((vec4(vFogView, 0.0) * viewMatrix).xyz); // view -> world (rotation transpose)
    float fogDist = length(vFogView);
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(- fogDensity * fogDensity * fogDist * fogDist);
    #else
      float fogSpan = max(fogFar - fogNear, 1.0);
      float fogT = max(fogDist - fogNear, 0.0) / fogSpan;
      // thinner looking up; density 2.4 / span reaches ~90 % at the far distance, the smoothstep closes the rest
      float fogK = 2.4 * (fogShape.x > 0.0 ? fogShape.x : 1.0) * exp(- fogShape.y * max(fogDirW.y, 0.0));
      float fogFactor = max(1.0 - exp(- fogK * fogT), smoothstep(0.82, 1.0, fogT));
    #endif
    float fogSd = max(dot(fogDirW, fogSun.xyz), 0.0);
    vec3 fogCol = fogColor + fogGlow.rgb * pow(fogSd, max(fogSun.w, 1.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogFactor);
  }
#endif`;
  const L = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> }>;
  for (const k of Object.keys(L)) if (L[k].uniforms && 'fogColor' in L[k].uniforms) Object.assign(L[k].uniforms, FOG_UNIFORMS);
  Object.assign(THREE.UniformsLib.fog as Record<string, THREE.IUniform>, FOG_UNIFORMS);
}

/** per frame / per preset: sun direction (toward the sun), glow colour and strength, density scale, vertical thinning */
export function setFogAtmosphere(towardsSun: THREE.Vector3, glow: [number, number, number], strength: number, density = 1, thinUp = 1.2, exponent = 6): void {
  const l = towardsSun.length() || 1;
  fogSun.x = towardsSun.x / l; fogSun.y = towardsSun.y / l; fogSun.z = towardsSun.z / l; fogSun.w = exponent;
  fogGlow.x = glow[0] * strength; fogGlow.y = glow[1] * strength; fogGlow.z = glow[2] * strength;
  fogShape.x = density; fogShape.y = thinUp;
}

/** current values (tests) */
export function fogAtmosphere(): { sun: V4; glow: V4; shape: V4 } { return { sun: { ...fogSun }, glow: { ...fogGlow }, shape: { ...fogShape } }; }
