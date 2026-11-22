// Item and tool definitions: names, sizes, colliders and mesh builders.
// Tools are held in the hand; nuggets, clods and piles are props.
import * as THREE from 'three';
import { paint, merge, place, bevelBox } from '../render/geom.js';
import { MATERIALS } from './materials.js';
import * as M from './models.js';

export const TIER_NAMES = ['', 'Iron', 'Steel', 'Glimmer', 'Ember'];
export const BAND_NAMES = ['', 'topsoil & clay', 'gravel bed', 'slate', 'basalt', 'bedrock'];

export const TOOLS = {
  shovel: { name: 'Shovel', tier: 1, loads: 1, dig: 0.42, cooldown: 0.42, kg: 2.2 },
  bucket: { name: 'Bucket', tier: 1, loads: 4, dig: 0.4, cooldown: 0.5, kg: 1.4 },
  pan:    { name: 'Pan', tier: 1, loads: 2, dig: 0.36, cooldown: 0.4, kg: 0.9 },
  pick:   { name: 'Pick', tier: 1, loads: 0, dig: 0.6, cooldown: 0.26, kg: 2.8 },
};
// A tool's effective stats: upgrades store tier/capacity/name on the entity.
export const toolDef = (e) => (e && TOOLS[e.type] ? { ...TOOLS[e.type], ...(e.data?.tier ? { tier: e.data.tier } : {}), ...(e.data?.cap ? { loads: e.data.cap } : {}), name: e.data?.name || TOOLS[e.type].name } : null);
// Collider half-extents for loose tools lying on the ground.
export const TOOL_BOX = { shovel: [0.13, 0.06, 0.55], bucket: [0.18, 0.17, 0.18], pan: [0.24, 0.05, 0.24], pick: [0.32, 0.06, 0.12] };

// Visual size of a nugget: real metal is small, so give it a floor so
// small pieces stay visible and clickable (BUILD_BRIEF 3.3).
export function nuggetSize(kg, material) {
  const dens = MATERIALS[material]?.kind === 'gem' ? 3.5 : MATERIALS[material]?.kind === 'fuel' ? 2.6 : 7;
  const real = Math.cbrt(kg / (dens * 1000)) * 1.15; // edge length in m
  return Math.max(0.075, real * 1.6);
}

// ---- Meshes (unit-sized; scaled per instance) ----
export function nuggetGeometry(kind, seed = 3) {
  if (kind === 'gem' || kind === 'fuel') { const g = M.crystals(seed, kind === 'gem' ? 3 : 5); g.scale(0.9, 0.9, 0.9); return g; }
  return M.nugget(seed);
}
export function nuggetMaterial(materialId) {
  const m = MATERIALS[materialId];
  const mat = new THREE.MeshStandardMaterial({ color: m.color, metalness: m.metal, roughness: m.kind === 'gem' ? 0.12 : m.kind === 'fuel' ? 0.3 : 0.42, flatShading: true, vertexColors: true });
  if (m.kind === 'gem' || m.kind === 'fuel') { mat.transparent = true; mat.opacity = m.kind === 'gem' ? 0.88 : 0.92; }
  if (m.glow) { mat.emissive = new THREE.Color(m.cracks || m.color); mat.emissiveIntensity = m.glow; }
  if (m.kind === 'gem') { mat.emissive = new THREE.Color(m.color); mat.emissiveIntensity = 0.12; }
  return mat;
}

// Dirt colour per band, matching the mesher.
export const BAND_DIRT = [0x8a6a44, 0x8c6040, 0x8a949e, 0x4a505a, 0x2a2626, 0x3a3240];
export function toolGeometry(type, data = {}) {
  const loads = data.loads ? data.loads.length : 0, cap = data.cap || TOOLS[type]?.loads || 1;
  const fill = loads ? BAND_DIRT[data.loads[loads - 1].band] : 0;
  if (type === 'shovel') return M.shovel(loads ? fill : 0);
  if (type === 'bucket') return M.bucket(loads / cap, fill);
  if (type === 'pan') return M.pan(loads ? loads / cap : 0, fill, data.contents?.length || 0);
  if (type === 'pick') return M.pick();
  return new THREE.BoxGeometry(0.2, 0.2, 0.2);
}
export function clodGeometry(band) { return M.clod(BAND_DIRT[band] || BAND_DIRT[1]); }
export function claimPostGeometry(name) {
  void name;
  return merge([
    paint(place(new THREE.BoxGeometry(0.16, 1.6, 0.16), 0, 0.8, 0), 0x8a6440, 0.12, 1),
    paint(place(new THREE.BoxGeometry(0.9, 0.5, 0.06), 0, 1.35, 0.11), 0xefe2c0, 0.04, 2),
    paint(place(new THREE.BoxGeometry(0.96, 0.06, 0.08), 0, 1.62, 0.11), 0x1f7a7a, 0.05, 3),
  ].map(g => g.index ? g.toNonIndexed() : g));
}
export { bevelBox };
