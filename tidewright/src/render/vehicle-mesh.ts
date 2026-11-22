// Vehicle mesher: block grid -> merged toon mesh with greedy-merged plate faces,
// per-vertex voxel AO, ink outlines, glass and emissive lamp layers.
import * as THREE from 'three';
import { GeomBuilder, type V3 } from './geom-builder';
import { VehicleGrid, cellKey, partCells, type PartInstance } from '../sim-core/grid';
import { CELL, partDef } from '../sim-core/parts';
import { ROTATIONS, mulMV } from '../sim-core/rotations';
import { PALETTE } from '../sim-core/palette';
import { bodyMaterial, glassMaterial, lampMaterial, inkMaterial } from './materials';

const colorCache = PALETTE.map((h) => new THREE.Color(h));
const DARK = new THREE.Color('#23262d');
const TYRE = new THREE.Color('#2a2c31');
const METAL = new THREE.Color('#8d8f93');
const AO_LEVELS = [0.5, 0.68, 0.84, 1];

export interface VehicleMesh {
  group: THREE.Group;
  wheels: Map<number, THREE.Object3D>;
  dispose(): void;
}

function setPartTransform(b: GeomBuilder, p: { pos: [number, number, number]; rot: number }) {
  const m = ROTATIONS[p.rot];
  b.xf = (q: V3) => {
    const r = mulMV(m, [q[0] - 0.5, q[1] - 0.5, q[2] - 0.5]);
    return [(p.pos[0] + 0.5 + r[0]) * CELL, (p.pos[1] + 0.5 + r[1]) * CELL, (p.pos[2] + 0.5 + r[2]) * CELL];
  };
}

/** Triangle with winding fixed so its normal points away from `inside`. */
function triOut(b: GeomBuilder, a: V3, c1: V3, c2: V3, col: THREE.Color, inside: V3) {
  const e1 = [c1[0] - a[0], c1[1] - a[1], c1[2] - a[2]], e2 = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const d = (a[0] - inside[0]) * n[0] + (a[1] - inside[1]) * n[1] + (a[2] - inside[2]) * n[2];
  if (d >= 0) b.tri(a, c1, c2, col); else b.tri(a, c2, c1, col);
}

/** Wheel geometry centred at the origin, axle along X (metres). */
export function wheelGeometry(radius: number, width: number, hubColor: THREE.Color): THREE.BufferGeometry {
  const b = new GeomBuilder();
  const hw = width / 2;
  b.cylX(-hw, hw, 0, 0, radius, TYRE, 18, DARK);
  b.cylX(-hw - 0.01, hw + 0.01, 0, 0, radius * 0.55, hubColor, 10);
  // tread blocks, so spin is visible
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const y = Math.cos(a) * radius, z = Math.sin(a) * radius;
    const s = 0.035;
    b.box([-hw - 0.005, y - s, z - s], [hw + 0.005, y + s, z + s], DARK);
  }
  return b.build();
}

function buildShape(b: GeomBuilder, glass: GeomBuilder, lamp: GeomBuilder, p: PartInstance, includeWheels: boolean) {
  const def = partDef(p.type);
  const col = colorCache[p.color] ?? colorCache[0];
  const [sx, sy, sz] = def.size;
  setPartTransform(b, p); setPartTransform(glass, p); setPartTransform(lamp, p);
  const C: V3 = [sx / 2, sy / 2, sz / 2];
  switch (def.shape) {
    case 'slab': b.box([0, 0, 0], [1, 0.5, 1], col); break;
    case 'ramp': {
      const P = { a: [0, 0, 0] as V3, b: [1, 0, 0] as V3, c: [1, 0, 1] as V3, d: [0, 0, 1] as V3, e: [1, 1, 1] as V3, f: [0, 1, 1] as V3 };
      const ins: V3 = [0.5, 0.3, 0.7];
      triOut(b, P.a, P.b, P.c, col, ins); triOut(b, P.a, P.c, P.d, col, ins); // bottom
      triOut(b, P.d, P.c, P.e, col, ins); triOut(b, P.d, P.e, P.f, col, ins); // back
      triOut(b, P.a, P.b, P.e, col, ins); triOut(b, P.a, P.e, P.f, col, ins); // slope
      triOut(b, P.a, P.d, P.f, col, ins); triOut(b, P.b, P.c, P.e, col, ins); // sides
      break;
    }
    case 'corner': {
      const B00: V3 = [0, 0, 0], B10: V3 = [1, 0, 0], B11: V3 = [1, 0, 1], B01: V3 = [0, 0, 1], A: V3 = [0, 1, 0];
      const ins: V3 = [0.3, 0.25, 0.3];
      triOut(b, B00, B10, B11, col, ins); triOut(b, B00, B11, B01, col, ins);
      triOut(b, B00, B01, A, col, ins); triOut(b, B00, A, B10, col, ins);
      triOut(b, A, B01, B11, col, ins); triOut(b, A, B11, B10, col, ins);
      break;
    }
    case 'frame': {
      const t = 0.17;
      for (const x of [0, 1 - t]) for (const z of [0, 1 - t]) b.box([x, 0, z], [x + t, 1, z + t], col);
      for (const y of [0, 1 - t]) {
        for (const z of [0, 1 - t]) b.box([t, y, z], [1 - t, y + t, z + t], col);
        for (const x of [0, 1 - t]) b.box([x, y, t], [x + t, y + t, 1 - t], col);
      }
      break;
    }
    case 'pane': {
      const tint = col.clone().lerp(new THREE.Color('#bfe3f2'), 0.7);
      glass.box([0.02, 0.02, 0.02], [0.98, 0.98, 0.98], tint);
      break;
    }
    case 'wheel': {
      if (!includeWheels) break;
      const r = sy / 2;
      b.cylX(0, sx, C[1], C[2], r, TYRE, 18, DARK);
      b.cylX(-0.04, sx + 0.04, C[1], C[2], r * 0.55, col, 10);
      break;
    }
    case 'engine': {
      b.box([0.08, 0, 0.05], [sx - 0.08, sy * 0.72, sz - 0.05], col);
      b.box([0.25, sy * 0.72, 0.3], [sx - 0.25, sy * 0.95, sz - 0.3], METAL);
      for (let z = 0.4; z < sz - 0.3; z += 0.45) b.box([0.02, sy * 0.25, z], [sx - 0.02, sy * 0.6, z + 0.15], DARK);
      b.cylX(sx - 0.1, sx + 0.12, sy * 0.4, sz - 0.5, 0.18, DARK, 8);
      break;
    }
    case 'seat': {
      b.box([0.15, 0, 0.3], [sx - 0.15, 1.1, sz - 0.1], DARK);
      b.box([0.3, 1.1, 0.5], [sx - 0.3, 1.4, sz - 0.4], col);
      b.box([0.3, 1.1, sz - 0.6], [sx - 0.3, sy, sz - 0.2], col);
      b.box([sx / 2 - 0.08, 0.8, 0], [sx / 2 + 0.08, 2.2, 0.16], DARK);
      b.cylX(sx / 2 - 0.5, sx / 2 + 0.5, 2.25, 0.1, 0.07, DARK, 6);
      break;
    }
    case 'tank': {
      b.cylX(0.05, sx - 0.05, C[1], C[2], Math.min(sy, sz) / 2 - 0.05, col, 14, METAL);
      b.box([sx / 2 - 0.15, sy - 0.2, C[2] - 0.15], [sx / 2 + 0.15, sy, C[2] + 0.15], DARK);
      break;
    }
    case 'battery': {
      b.box([0.08, 0, 0.08], [sx - 0.08, sy * 0.8, sz - 0.08], DARK);
      b.box([0.08, sy * 0.8 - 0.1, 0.08], [sx - 0.08, sy * 0.8, sz - 0.08], col);
      b.box([0.2, sy * 0.8, 0.25], [0.4, sy, 0.45], new THREE.Color('#d7263d'));
      b.box([sx - 0.4, sy * 0.8, 0.25], [sx - 0.2, sy, 0.45], DARK);
      break;
    }
    case 'gear':
      b.box([0.1, 0, 0.1], [sx - 0.1, sy * 0.8, sz - 0.1], col);
      b.cylX(-0.02, sx + 0.02, sy * 0.45, sz / 2, 0.55, METAL, 10);
      break;
    case 'diff':
      b.box([0.15, 0.1, 0.15], [sx - 0.15, sy * 0.85, sz - 0.15], col);
      b.cylX(-0.05, sx + 0.05, sy * 0.48, sz / 2, 0.35, METAL, 10);
      break;
    case 'lamp': {
      b.box([0, 0, 0.2], [1, 1, 1], DARK);
      const glow = col.clone().lerp(new THREE.Color('#ffffff'), 0.45);
      lamp.box([0.12, 0.12, 0], [0.88, 0.88, 0.2], glow);
      break;
    }
    case 'float':
      b.box([0.03, 0.03, 0.03], [0.97, 0.97, 0.97], col);
      b.box([0, 0.4, 0], [1, 0.6, 1], new THREE.Color('#f4efe3'));
      break;
    case 'screw': {
      // Hub along the thrust axis (Z) and three blades.
      const cy = sy / 2, cx = sx / 2;
      b.box([cx - 0.18, cy - 0.18, 0], [cx + 0.18, cy + 0.18, sz], METAL);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.3;
        const ex = Math.cos(a) * (sx / 2 - 0.05), ey = Math.sin(a) * (sy / 2 - 0.05);
        const px = -Math.sin(a) * 0.22, py = Math.cos(a) * 0.22;
        const P0: V3 = [cx + px, cy + py, 0.35], P1: V3 = [cx - px, cy - py, 0.65];
        const P2: V3 = [cx + ex - px, cy + ey - py, 0.65], P3: V3 = [cx + ex + px, cy + ey + py, 0.35];
        b.quad(P0, P1, P2, P3, col); b.quad(P3, P2, P1, P0, col);
      }
      break;
    }
    case 'rudder':
      b.box([0.38, 0, 0.1], [0.62, sy, sz - 0.1], col);
      b.box([0.3, sy - 0.25, 0], [0.7, sy, 0.6], METAL);
      break;
    default:
      b.box([0, 0, 0], [sx, sy, sz], col);
  }
}

/** Greedy-merged, AO-shaded faces for all 'cube' (Plate) parts. */
function meshCubes(b: GeomBuilder, grid: VehicleGrid) {
  const cubes = [...grid.parts.values()].filter((p) => partDef(p.type).shape === 'cube');
  if (!cubes.length) return;
  const isCube = new Map<number, number>(); // cell key -> color
  for (const p of cubes) isCube.set(cellKey(p.pos[0], p.pos[1], p.pos[2]), p.color);
  const solid = (x: number, y: number, z: number) => {
    const id = grid.cells.get(cellKey(x, y, z));
    return id !== undefined && partDef(grid.parts.get(id)!.type).solid;
  };
  const bounds = grid.bounds()!;
  b.xf = (q) => [q[0] * CELL, q[1] * CELL, q[2] * CELL];
  const AXES: [number, number, number][] = [[0, 1, 2], [1, 2, 0], [2, 0, 1]]; // d, u, v with u x v = +d
  for (const [d, u, v] of AXES) {
    for (const s of [1, -1]) {
      const lo = bounds[0], hi = bounds[1];
      const W = hi[u] - lo[u] + 1, H = hi[v] - lo[v] + 1;
      const mask = new Int32Array(W * H);
      for (let k = lo[d]; k <= hi[d]; k++) {
        mask.fill(-1);
        for (let j = 0; j < H; j++)
          for (let i = 0; i < W; i++) {
            const c = [0, 0, 0];
            c[d] = k; c[u] = lo[u] + i; c[v] = lo[v] + j;
            const color = isCube.get(cellKey(c[0], c[1], c[2]));
            if (color === undefined) continue;
            const nb = [...c]; nb[d] += s;
            if (isCube.has(cellKey(nb[0], nb[1], nb[2]))) continue;
            // AO for 4 corners in (u-,v-), (u+,v-), (u+,v+), (u-,v+) order
            let ao = 0;
            const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
            corners.forEach(([du, dv], ci) => {
              const p1 = [...nb]; p1[u] += du;
              const p2 = [...nb]; p2[v] += dv;
              const p3 = [...nb]; p3[u] += du; p3[v] += dv;
              const s1 = solid(p1[0], p1[1], p1[2]) ? 1 : 0, s2 = solid(p2[0], p2[1], p2[2]) ? 1 : 0, s3 = solid(p3[0], p3[1], p3[2]) ? 1 : 0;
              const lvl = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
              ao |= lvl << (ci * 2);
            });
            mask[j * W + i] = (color << 8) | ao;
          }
        // Greedy merge: only fully-lit faces merge, so AO gradients stay per-cell and correct.
        for (let j = 0; j < H; j++)
          for (let i = 0; i < W; ) {
            const key = mask[j * W + i];
            if (key < 0) { i++; continue; }
            const mergeable = (key & 255) === 255;
            let w = 1, h = 1;
            if (mergeable) {
              while (i + w < W && mask[j * W + i + w] === key) w++;
              outer: while (j + h < H) {
                for (let t = 0; t < w; t++) if (mask[(j + h) * W + i + t] !== key) break outer;
                h++;
              }
            }
            for (let jj = 0; jj < h; jj++) for (let t = 0; t < w; t++) mask[(j + jj) * W + i + t] = -1;
            const plane = s > 0 ? k + 1 : k;
            const P = (uu: number, vv: number): V3 => { const r = [0, 0, 0]; r[d] = plane; r[u] = lo[u] + uu; r[v] = lo[v] + vv; return r as V3; };
            const a = P(i, j), bb = P(i + w, j), c = P(i + w, j + h), dd = P(i, j + h);
            const aoc = [0, 1, 2, 3].map((ci) => AO_LEVELS[(key >> (ci * 2)) & 3]) as [number, number, number, number];
            const color = colorCache[key >> 8];
            if (s > 0) b.quad(a, bb, c, dd, color, aoc);
            else b.quad(dd, c, bb, a, color, [aoc[3], aoc[2], aoc[1], aoc[0]]);
            i += w;
          }
      }
    }
  }
}

export function buildVehicleMesh(grid: VehicleGrid, opts: { separateWheels?: boolean; outlines?: boolean } = {}): VehicleMesh {
  const body = new GeomBuilder(), glass = new GeomBuilder(), lamp = new GeomBuilder();
  meshCubes(body, grid);
  for (const p of grid.parts.values()) if (partDef(p.type).shape !== 'cube') buildShape(body, glass, lamp, p, !opts.separateWheels);
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  if (body.count) {
    const g = body.build();
    const m = bodyMaterial();
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); geos.push(g); mats.push(m);
    if (opts.outlines !== false) {
      const eg = new THREE.EdgesGeometry(g, 28);
      const lm = inkMaterial(0.9);
      group.add(new THREE.LineSegments(eg, lm)); geos.push(eg); mats.push(lm);
    }
  }
  if (glass.count) { const g = glass.build(), m = glassMaterial(); const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; group.add(mesh); geos.push(g); mats.push(m); }
  if (lamp.count) { const g = lamp.build(), m = lampMaterial(); const mesh = new THREE.Mesh(g, m); mesh.name = 'lamps'; group.add(mesh); geos.push(g); mats.push(m); }

  const wheels = new Map<number, THREE.Object3D>();
  if (opts.separateWheels) {
    for (const p of grid.parts.values()) {
      const def = partDef(p.type);
      if (def.sim?.kind !== 'wheel') continue;
      const g = wheelGeometry(def.sim.radius, def.sim.width, colorCache[p.color]);
      const m = bodyMaterial();
      const spin = new THREE.Mesh(g, m);
      spin.castShadow = true;
      const eg = new THREE.EdgesGeometry(g, 40);
      const lm = inkMaterial(0.6);
      spin.add(new THREE.LineSegments(eg, lm));
      const steer = new THREE.Group();
      steer.add(spin);
      group.add(steer);
      wheels.set(p.id, steer);
      geos.push(g, eg); mats.push(m, lm);
    }
  }
  return { group, wheels, dispose: () => { geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); } };
}

/** Thin ghost mesh of a single part (editor preview). */
export function buildPartGhost(type: string, rot: number, color: number): THREE.Group {
  const g = new VehicleGrid();
  g.add(g.make(type, [0, 0, 0], rot, color));
  const vm = buildVehicleMesh(g, { outlines: false });
  if (partDef(type).shape === 'cube') {
    // meshCubes ran; nothing else needed
  }
  vm.group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m) { m.transparent = true; (m as THREE.MeshToonMaterial).opacity = 0.55; m.depthWrite = false; }
  });
  return vm.group;
}

export { partCells };
