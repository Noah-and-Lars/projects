/**
 * Far backdrop ring: low-poly hills / shoreline silhouettes outside the level bounds (presentation only,
 * no physics). Built procedurally from the bounds: around the rectangle (rounded corners) a strip of
 * rings goes outward. Where the terrain at the edge is land, the ring starts flush with it (just under the
 * edge height) and climbs into hills; where the edge is water it stays under the surface for a while
 * (open water) and then rises into a distant far shore. Fog does the rest.
 */
import * as THREE from 'three';
import type { V3 } from '../sim/vec';

export interface BackdropInput {
  bounds: { min: V3; max: V3 };
  waterLevel: number | null;
  /** terrain top just inside the bounds at (x, z), or null when there is nothing (falls into the water) */
  edgeHeight: (x: number, z: number) => number | null;
  seed?: number;
}

/** ring distances outside the bounds (m) */
const RINGS = [0, 1.5, 5, 11, 20, 32, 48, 68, 92, 120, 152, 190, 235];
const STEP = 4;
const CORNER_STEPS = 6;

function hash(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
/** smooth 1-D value noise in [0, 1] */
function noise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const a = hash(i + seed * 57.3), b = hash(i + 1 + seed * 57.3);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}
function smooth(e0: number, e1: number, x: number): number { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

export interface PerimeterSample { x: number; z: number; nx: number; nz: number; u: number }

/** points along the bounds rectangle with outward normals (corners: fan of normals), param u = metres along */
export function perimeter(b: { min: V3; max: V3 }): PerimeterSample[] {
  const out: PerimeterSample[] = [];
  const corners = [
    { x: b.max.x, z: b.min.z }, { x: b.max.x, z: b.max.z }, { x: b.min.x, z: b.max.z }, { x: b.min.x, z: b.min.z },
  ];
  // edge k goes from corner k-1 to corner k; normals: -z (top), +x, +z, -x
  const edgeN = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }];
  let u = 0;
  for (let k = 0; k < 4; k++) {
    const a = corners[(k + 3) % 4], c = corners[k];
    const n = edgeN[k];
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const steps = Math.max(1, Math.round(len / STEP));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t, nx: n.x, nz: n.z, u: u + len * t });
    }
    u += len;
    // rounded corner at c: rotate the normal from this edge's to the next edge's
    const n2 = edgeN[(k + 1) % 4];
    const a0 = Math.atan2(n.z, n.x);
    let a1 = Math.atan2(n2.z, n2.x);
    if (a1 < a0) a1 += Math.PI * 2;
    for (let s = 0; s < CORNER_STEPS; s++) {
      const ang = a0 + ((a1 - a0) * s) / CORNER_STEPS;
      out.push({ x: c.x, z: c.z, nx: Math.cos(ang), nz: Math.sin(ang), u: u + s * 0.01 });
    }
  }
  return out;
}

export function buildBackdropGeometry(inp: BackdropInput): THREE.BufferGeometry {
  const b = inp.bounds;
  const wl = inp.waterLevel;
  const seed = inp.seed ?? 1;
  const ps = perimeter(b);
  const n = ps.length;
  // edge heights + land / water, smoothed along the perimeter
  const edge: number[] = [], landRaw: number[] = [];
  for (const p of ps) {
    const h = inp.edgeHeight(p.x - p.nx * 0.3, p.z - p.nz * 0.3);
    const water = wl != null && (h == null || h < wl + 0.1);
    landRaw.push(water ? 0 : 1);
    edge.push(h ?? (wl != null ? wl - 3 : b.min.y));
  }
  const land: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -3; k <= 3; k++) s += landRaw[(i + k + n) % n];
    land.push(s / 7);
  }
  const seaFloor = wl != null ? wl - 3 : b.min.y;
  const nr = RINGS.length;
  const pos = new Float32Array(n * nr * 3);
  const col = new Float32Array(n * nr * 3);
  for (let i = 0; i < n; i++) {
    const p = ps[i];
    const u = p.u;
    const amp = 5 + 20 * noise1(u / 70, seed);
    const shore = 55 + 80 * noise1(u / 110, seed + 3);
    const e = landRaw[i] ? edge[i] : seaFloor;
    for (let j = 0; j < nr; j++) {
      const d = RINGS[j];
      const ripple = 0.55 + 0.45 * noise1(u / 23 + d / 31, seed + 7);
      const hLand = e - 0.12 + amp * smooth(4, 130, d) * ripple + (d > 0 ? 1.5 * noise1(u / 9 + d, seed + 11) * smooth(0, 12, d) : 0);
      const hWater = d < shore ? seaFloor : seaFloor + (amp * 1.1 + 5) * smooth(shore, shore + 70, d) * ripple;
      const l = land[i];
      let h = hWater + (hLand - hWater) * l;
      if (j === 0 && landRaw[i]) h = edge[i] - 0.12; // flush with the terrain edge
      const k = (i * nr + j) * 3;
      pos[k] = p.x + p.nx * d; pos[k + 1] = h; pos[k + 2] = p.z + p.nz * d;
      // colour: sand at the waterline, dark grass, grey rock up high (linear radiance-ish albedo)
      const above = wl != null ? h - wl : h - b.min.y;
      const v = 0.8 + 0.4 * noise1(u / 13 + d / 17, seed + 5);
      let r = 0.07, g = 0.1, bl = 0.045; // grass
      if (above < 1.2) { r = 0.2; g = 0.17; bl = 0.11; }
      else if (above > 20) { const t = smooth(20, 30, above); r = r + (0.16 - r) * t; g = g + (0.15 - g) * t; bl = bl + (0.14 - bl) * t; }
      col[k] = r * v; col[k + 1] = g * v; col[k + 2] = bl * v;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < nr - 1; j++) {
      const a = i * nr + j, bq = i2 * nr + j, c = i2 * nr + j + 1, d = i * nr + j + 1;
      idx.push(a, d, bq, bq, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  // make sure the triangles face up (winding depends on the perimeter direction)
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  let up = 0;
  for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
  if (up < 0) {
    for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  geo.computeBoundingSphere();
  return geo;
}

export function buildBackdrop(inp: BackdropInput): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: true });
  const mesh = new THREE.Mesh(buildBackdropGeometry(inp), mat);
  mesh.name = 'backdrop';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/** fog distances that hide the backdrop's outer rim from anywhere on the map */
export function fogForBounds(b: { min: V3; max: V3 }, preset: { fogNear: number; fogFar: number }): { near: number; far: number } {
  const ext = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
  const far = Math.min(preset.fogFar, ext * 2 + 130);
  const near = Math.min(preset.fogNear, far * 0.3);
  return { near, far };
}
