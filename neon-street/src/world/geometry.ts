// Scene builder: collects triangles, materials, lights and colliders in the
// exact layouts the GPU buffers use (see renderer/shaders/trace.wgsl).

import { type AABB, type Vec3, cross, luminance, normalize, sub } from '../core/math';
import { textureLayer, textureScale } from '../renderer/textures';

/** Material flags understood by the shader (bitmask stored in prm.z). */
export const MatFlag = {
  None: 0,
  /** Road: procedural puddles, lane markings, wet/dry roughness split. */
  Road: 1,
  /** Lit window: a virtual room behind the glass (interior mapping). */
  Window: 2,
  /** Facade: procedural grime and darkening near the ground. */
  Grime: 4,
  /** Sidewalk: wet concrete with noisy roughness. */
  Sidewalk: 8,
  /** Animated advertising screen. */
  Billboard: 16,
  /** Neon glyph strip (procedural characters). */
  Glyph: 32,
  /** Emission pulses or blinks over time (aux.x = phase, aux.y = pattern). */
  Blink: 64,
} as const;

export const MatKind = {
  Opaque: 0,
  Glass: 1,
  /** Pure emitter: paths terminate on it (neon tubes, LEDs, light bulbs). */
  Emitter: 2,
  /** Translucent hologram: adds light and lets the ray continue. */
  Hologram: 3,
  /** Tinted translucent surface (spinning prop discs): attenuates and continues. */
  Translucent: 4,
} as const;

export interface MaterialDesc {
  base?: Vec3;
  metallic?: number;
  roughness?: number;
  emission?: Vec3;
  kind?: number;
  flags?: number;
  ior?: number;
  /** Free parameters used by procedural flags (window bottom/height/seed, texture scale). */
  extra?: [number, number, number, number];
  /** Name of a texture from the manifest; base becomes a tint and roughness a multiplier. */
  tex?: string;
  /** Override the manifest's metres-per-tile. */
  texScale?: number;
  /** Normal map strength (1 = as authored). */
  bump?: number;
  /** Extra procedural parameters: seed, variant, room width, room depth. */
  aux?: [number, number, number, number];
}

/** Bit mask naming the faces of a box: -x,+x,-y,+y,-z,+z. */
export const Face = { NX: 1, PX: 2, NY: 4, PY: 8, NZ: 16, PZ: 32, All: 63 } as const;

const MAT_FLOATS = 24; // 6 x vec4f
const TRI_FLOATS = 16; // 4 x vec4f

export class SceneBuilder {
  private matData: number[] = [];
  private matCount = 0;
  private triData: number[] = [];
  private triCount = 0;
  /** Per triangle: index into lights, or -1. Resolved in finish(). */
  private triLight: number[] = [];
  private lightTris: number[] = [];
  private lightPower: number[] = [];
  readonly colliders: AABB[] = [];
  /** Axis-aligned step surfaces the player can stand on (sidewalks). */
  readonly walkSurfaces: { min: Vec3; max: Vec3; height: number }[] = [];
  /** Edges that shed drips (awning fronts, ledges). */
  readonly dripEdges: [Vec3, Vec3][] = [];

  material(d: MaterialDesc): number {
    const base = d.base ?? [0.5, 0.5, 0.5];
    const em = d.emission ?? [0, 0, 0];
    const extra = d.extra ?? [0, 0, 0, 0];
    const layer = d.tex ? textureLayer(d.tex) : -1;
    const scale = d.texScale ?? (d.tex ? textureScale(d.tex) : 1);
    const aux = d.aux ?? [0, 0, 0, 0];
    this.matData.push(
      base[0], base[1], base[2], d.metallic ?? 0,
      em[0], em[1], em[2], 0,
      d.roughness ?? 0.5, d.ior ?? 1.5, d.flags ?? 0, d.kind ?? MatKind.Opaque,
      extra[0], extra[1], extra[2], extra[3],
      layer, layer, scale, d.bump ?? 1,
      aux[0], aux[1], aux[2], aux[3],
    );
    return this.matCount++;
  }

  private materialEmission(mat: number): Vec3 {
    const o = mat * MAT_FLOATS + 4;
    return [this.matData[o], this.matData[o + 1], this.matData[o + 2]];
  }

  /** Adds one triangle. Winding defines the outward normal (right-handed). */
  triangle(a: Vec3, b: Vec3, c: Vec3, mat: number): void {
    const n = cross(sub(b, a), sub(c, a));
    const area = 0.5 * Math.hypot(n[0], n[1], n[2]);
    if (area < 1e-9) return;
    const nn = normalize(n);
    const idx = this.triCount++;
    this.triData.push(
      a[0], a[1], a[2], mat,
      b[0], b[1], b[2], -1, // light index patched below
      c[0], c[1], c[2], area,
      nn[0], nn[1], nn[2], 0,
    );
    const em = this.materialEmission(mat);
    const power = luminance(em) * area;
    if (power > 1e-6) {
      this.triLight.push(this.lightTris.length);
      this.triData[idx * TRI_FLOATS + 7] = this.lightTris.length;
      this.lightTris.push(idx);
      this.lightPower.push(power);
    } else {
      this.triLight.push(-1);
    }
  }

  /** Quad from four corners in order (outward normal from winding). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, mat: number): void {
    this.triangle(a, b, c, mat);
    this.triangle(a, c, d, mat);
  }

  /** Axis-aligned box. `faces` selects which sides to emit (hidden sides can be skipped). */
  box(min: Vec3, max: Vec3, mat: number, faces: number = Face.All, collide = false): void {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    if (faces & Face.NX) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], mat);
    if (faces & Face.PX) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], mat);
    if (faces & Face.NY) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], mat);
    if (faces & Face.PY) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], mat);
    if (faces & Face.NZ) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], mat);
    if (faces & Face.PZ) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], mat);
    if (collide) this.colliders.push({ min: [...min], max: [...max] });
  }

  finish(): SceneData {
    const tris = new Float32Array(this.triData);
    const mats = new Float32Array(this.matData);
    const lightCount = this.lightTris.length;
    const lightTris = new Uint32Array(this.lightTris);
    const lightCdf = new Float32Array(lightCount);
    let total = 0;
    for (let i = 0; i < lightCount; i++) total += this.lightPower[i];
    let acc = 0;
    for (let i = 0; i < lightCount; i++) {
      acc += this.lightPower[i];
      lightCdf[i] = acc / total;
    }
    if (lightCount > 0) lightCdf[lightCount - 1] = 1;
    return {
      tris,
      triCount: this.triCount,
      mats,
      matCount: this.matCount,
      lightTris,
      lightCdf,
      lightCount,
      colliders: this.colliders,
      walkSurfaces: this.walkSurfaces,
      dripEdges: this.dripEdges,
    };
  }
}

/**
 * Append the triangles and materials of `extra` after `base`. Lights stay
 * those of `base`; the extra object (the drone) is lit analytically.
 */
export function mergeScenes(base: SceneData, extra: SceneData): { scene: SceneData; triStart: number } {
  const tris = new Float32Array(base.tris.length + extra.tris.length);
  tris.set(base.tris, 0);
  tris.set(extra.tris, base.tris.length);
  for (let i = 0; i < extra.triCount; i++) {
    const o = base.tris.length + i * TRI_FLOATS;
    tris[o + 3] += base.matCount; // material id
    tris[o + 7] = -1;             // never a sampled light
  }
  const mats = new Float32Array(base.mats.length + extra.mats.length);
  mats.set(base.mats, 0);
  mats.set(extra.mats, base.mats.length);
  return {
    scene: {
      ...base,
      tris,
      triCount: base.triCount + extra.triCount,
      mats,
      matCount: base.matCount + extra.matCount,
    },
    triStart: base.triCount,
  };
}

export interface SceneData {
  /** 16 floats per triangle: v0.xyz, matId | v1.xyz, lightIdx | v2.xyz, area | n.xyz, 0 */
  tris: Float32Array;
  triCount: number;
  /** 24 floats per material. */
  mats: Float32Array;
  matCount: number;
  lightTris: Uint32Array;
  lightCdf: Float32Array;
  lightCount: number;
  colliders: AABB[];
  walkSurfaces: { min: Vec3; max: Vec3; height: number }[];
  dripEdges: [Vec3, Vec3][];
}
