// Mk II-IV machines (BUILD_BRIEF 3.5), built at the Machine Shop from a
// blueprint plus ingots. Each reuses its Mk I model with its tier's colour
// (steel blue, glimmer violet, ember red) and a numbered plate.
import * as THREE from 'three';
import { MACHINES } from './machines.js';
import { MACHINES2 } from './machines2.js';
import { paint, merge, place } from '../render/geom.js';

export const TIER_HEX = { 2: 0x4f7396, 3: 0x7a5ad8, 4: 0xc8401a };
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const TEAL = 0x2a8a86, OCHRE = 0xc8902c;

// Swap one painted colour for another, keeping each face's jitter.
function recolor(geo, fromHex, toHex) {
  const g = geo.clone(), col = g.attributes.color, a = new THREE.Color(fromHex), b = new THREE.Color(toHex);
  for (let i = 0; i < col.count; i++) {
    const r = col.getX(i) / a.r, gg = col.getY(i) / a.g, bb = col.getZ(i) / a.b;
    if (Math.abs(r - gg) < 0.06 && Math.abs(r - bb) < 0.06 && r > 0.85 && r < 1.15) col.setXYZ(i, b.r * r, b.g * r, b.b * r);
  }
  return g;
}
// A small brass plate with pips for the tier (readable without text).
function plate(tier, x, y, z, ry = 0) {
  const parts = [paint(place(new THREE.BoxGeometry(0.22, 0.12, 0.02), x, y, z, 0, ry), 0xc89a48, 0.04, 3)];
  for (let i = 0; i < tier; i++) parts.push(paint(place(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), x + Math.cos(ry) * (i - (tier - 1) / 2) * 0.045, y, z - Math.sin(ry) * (i - (tier - 1) / 2) * 0.045, Math.PI / 2, ry), TIER_HEX[tier] || 0x3a3e44, 0.02, 4));
  return parts;
}
function variant(base, tier, over, brand, plateAt) {
  const b = MACHINES[base];
  return {
    ...b, ...over, tier,
    name: b.name.replace(/Mk I\b/, 'Mk ' + ROMAN[tier]),
    build: () => merge([recolor(b.build(), brand, TIER_HEX[tier]), ...plate(tier, ...plateAt)]),
  };
}
export const MACHINES3 = {
  // The Pumphouse reward: a gold-plated water wheel (cosmetic; works like the wooden one).
  goldwheel: { ...MACHINES2.waterwheel, name: 'Gold-plated Water Wheel', spin: { ...MACHINES2.waterwheel.spin, gold: true }, build: () => recolor(recolor(MACHINES2.waterwheel.build(), 0xc8902c, 0xe8b830), 0x8a5a30, 0xb8901a) },
  drill2: variant('drill1', 2, { demand: 30, period: 4, tipDepth: 6.5 }, OCHRE, [0, 1.75, 0.262]),
  drill3: variant('drill1', 3, { demand: 45, period: 3.5, tipDepth: 9 }, OCHRE, [0, 1.75, 0.262]),
  drill4: variant('drill1', 4, { demand: 60, period: 3, tipDepth: 10 }, OCHRE, [0, 1.75, 0.262]),
  sluice2: variant('sluice1', 2, { demand: 25, period: 3, hopper: 12 }, TEAL, [0.44, 0.75, -0.6, Math.PI / 2]),
  sluice3: variant('sluice1', 3, { demand: 40, period: 2, hopper: 14 }, TEAL, [0.44, 0.75, -0.6, Math.PI / 2]),
  // Not in the brief's table: Mk IV fills the gap for band-4 (basalt) loads.
  sluice4: variant('sluice1', 4, { demand: 55, period: 1.6, hopper: 16 }, TEAL, [0.44, 0.75, -0.6, Math.PI / 2]),
  intake2: variant('intake1', 2, { flow: 90 }, TEAL, [0, 0.95, 0.62]),
  intake3: variant('intake1', 3, { flow: 160 }, TEAL, [0, 0.95, 0.62]),
};
