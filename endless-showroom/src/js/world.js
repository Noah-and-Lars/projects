// The endless store. The floor is split into 24 m chunks, each generated from
// the room's seed, so every player sees the same store without sending it.
//
// A chunk has data (collision boxes and the furniture/food that starts there)
// and, when it's near the local player, visuals. Chunks near other players are
// loaded as data only, so the host can run the staff around them.
//
// Movable things are "items". An item that anybody has touched is "modded":
// its full state lives in `mods` (kept the same on every screen by net.js) and
// it is always loaded, wherever it ended up. Untouched items come and go with
// their chunk.
import * as THREE from 'three';
import { hashInts, rng } from './rng.js';
import { restockEpoch } from './env.js';
import { GeoBuilder } from './geo.js';
import { TYPES, ITEMS, STOCK, furnitureGeometry, itemGeometry, itemDims, itemMatrix, itemParts } from './furniture.js';
import { SURF, staticMaterial, furnitureMaterial, shadowMaterial, shadowGeometry, ShadowBuilder } from './mats.js';

export const CHUNK = 24, CEIL = 6.5, HALF = 12;
const CELL = 4; // item spatial hash cell
const RENDER_R = 2, DATA_R = 2; // data around other players reaches past where staff spawn
const Q = 9.6, QPAD = 1.2; // usable quadrant size and aisle padding

const WALL = 0xd9d3c7, WALL_BASE = 0x8a857b, PILLAR = 0xd6d1c8, PARTITION = 0xe4ded2, RACK = 0x3f6f9a, RACK_BEAM = 0xe07b2b;
// Surface of the fixed parts, by colour (anything else is paint).
const STATIC_SURF = {
  [PILLAR]: SURF.concrete, [WALL_BASE]: SURF.plastic, [RACK]: SURF.steel, [RACK_BEAM]: SURF.steel,
  0xc8a26e: SURF.card, 0xb8915c: SURF.card, 0xd2b07d: SURF.card, 0xe7e1d3: SURF.card, 0x9cb3c4: SURF.plastic,
  0x7b6a58: SURF.wood, 0xb8a98f: SURF.wood, 0xe8e2d6: SURF.concrete, 0x34495e: SURF.steel,
};

const SECTIONS = {
  showroom: { label: 'SHOWROOM', color: '#2b6cb0' },
  warehouse: { label: 'WAREHOUSE', color: '#c05621' },
  display: { label: 'FURNITURE', color: '#2f855a' },
  market: { label: 'MARKET HALL', color: '#6b46c1' },
  food: { label: 'CAFETERIA', color: '#c53030' },
  storage: { label: 'STOCK ROOM', color: '#4a5568' },
  garden: { label: 'GARDEN CENTRE', color: '#4f8a2b' },
};

function sectionOf(seed, cx, cz) {
  if (cx === 0 && cz === 0) return 'display';
  const h = hashInts(seed, cx, cz, 11) % 100;
  if (h < 37) return 'showroom';
  if (h < 58) return 'warehouse';
  if (h < 69) return 'display';
  if (h < 75) return 'garden';
  if (h < 87) return 'market';
  if (h < 91) return 'food'; // cafeterias are rare, and worth finding
  return 'storage';
}

// Canonical frame for a quadrant: (u, v) in [0, Q], back at v = 0, open
// towards +v. k quarter-turns map it into the chunk.
function frame(ox, oz, k) {
  const c = Q / 2;
  const pt = (u, v) => {
    let du = u - c, dv = v - c;
    for (let i = 0; i < k; i++) { const t = du; du = dv; dv = -t; }
    return [ox + c + du, oz + c + dv];
  };
  return {
    k,
    pt,
    rect(u0, v0, u1, v1) {
      const a = pt(u0, v0), b = pt(u1, v1);
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    },
  };
}

class ChunkGen {
  constructor(world, cx, cz) {
    this.w = world; this.cx = cx; this.cz = cz;
    this.ox = cx * CHUNK; this.oz = cz * CHUNK;
    this.g = new GeoBuilder();
    this.g.mat = SURF.paint;
    this.g.matOf = (hex) => STATIC_SURF[hex] ?? null;
    this.sh = new ShadowBuilder();
    this.boxes = [];
    this.items = [];
    this.r = rng(hashInts(world.seed, cx, cz, 1));
    this.section = sectionOf(world.seed, cx, cz);
    this.skylights = [];
    if (this.section === 'garden') this.skylights.push({ x0: this.ox + 2, z0: this.oz + 2, x1: this.ox + CHUNK - 2, z1: this.oz + CHUNK - 2 });
  }
  // Static solid, in chunk-local coordinates.
  solid(x0, z0, x1, z1, y0, y1, hex, draw = true) {
    if (draw) this.g.boxMin(x0, y0, z0, x1 - x0, y1 - y0, z1 - z0, hex);
    if (draw && y0 === 0) this.sh.rect(x0, z0, x1, z1, 0.004, y1 > 3 ? 0.3 : 0.18);
    this.boxes.push({ x0: x0 + this.ox, x1: x1 + this.ox, z0: z0 + this.oz, z1: z1 + this.oz, y0, y1 });
  }
  deco(x0, z0, x1, z1, y0, y1, hex) { this.g.boxMin(x0, y0, z0, x1 - x0, y1 - y0, z1 - z0, hex); }
  furn(type, x, z, rot, y = 0) {
    this.items.push({ t: type, k: 'f', v: this.r.int(16), x: x + this.ox, y, z: z + this.oz, r: ((rot % 4) + 4) % 4 });
  }
  food(kind, x, z, y) { this.items.push({ t: kind, k: 'i', v: 0, x: x + this.ox, y, z: z + this.oz, r: this.r.int(4) }); }
  randomFood(x, z, y, stock = STOCK.any) {
    if (this.r.chance(0.03)) this.food('medkit', x, z, y);
    else this.food(this.r.pick(stock), x, z, y);
  }
  // Furniture and food in a quadrant frame.
  ff(f, type, u, v, rot, y = 0) { const [x, z] = f.pt(u, v); this.furn(type, x, z, rot + f.k, y); }
  fd(f, stock, u, v, y) { const [x, z] = f.pt(u, v); this.food(this.r.pick(stock), x, z, y); }
  fs(f, u0, v0, u1, v1, y0, y1, hex) { const [a, b, c, d] = f.rect(u0, v0, u1, v1); this.solid(a, b, c, d, y0, y1, hex); }

  run() {
    const { r } = this;
    // Pillars on a 12 m grid.
    for (const px of [0, HALF]) for (const pz of [0, HALF]) {
      this.solid(px - 0.45, pz - 0.45, px + 0.45, pz + 0.45, 0, CEIL, PILLAR);
      this.deco(px - 0.47, pz - 0.47, px + 0.47, pz + 0.47, 0, 0.18, WALL_BASE);
      this.deco(px - 0.46, pz - 0.46, px + 0.46, pz + 0.46, 2.3, 2.6, parseInt(SECTIONS[this.section].color.slice(1), 16));
    }
    // Full-height walls along the chunk's north (z = 0) and west (x = 0) edges.
    const nearSpawn = Math.abs(this.cx) <= 1 && Math.abs(this.cz) <= 1;
    for (const axis of [0, 1]) {
      if (nearSpawn || hashInts(this.w.seed, this.cx, this.cz, 20 + axis) % 100 >= 32) continue;
      const er = rng(hashInts(this.w.seed, this.cx, this.cz, 30 + axis));
      const gaps = [];
      const g1 = er.range(1.5, 7.5), g2 = er.range(13.5, 19.5);
      if (er.chance(0.8)) gaps.push([g1, g1 + 3.5]);
      if (er.chance(0.8) || !gaps.length) gaps.push([g2, g2 + 3.5]);
      // The wall runs the whole edge, minus the doorways and the middle pillar.
      const holes = gaps.concat([[HALF - 0.45, HALF + 0.45]]).sort((p, q) => p[0] - q[0]);
      const out = [];
      let s = 0.45;
      for (const [a, b] of holes) { if (a > s) out.push([s, a]); s = Math.max(s, b); }
      if (s < CHUNK - 0.45) out.push([s, CHUNK - 0.45]);
      for (const [a, b] of out) {
        if (b - a < 0.2) continue;
        if (axis === 0) { this.solid(a, -0.15, b, 0.15, 0, CEIL, WALL); this.deco(a, -0.17, b, 0.17, 0, 0.15, WALL_BASE); }
        else { this.solid(-0.15, a, 0.15, b, 0, CEIL, WALL); this.deco(-0.17, a, 0.17, b, 0, 0.15, WALL_BASE); }
      }
    }
    for (const qx of [0, HALF]) for (const qz of [0, HALF]) {
      const f = frame(qx + QPAD, qz + QPAD, r.int(4));
      const roll = r();
      if (roll < 0.025 && this.section !== 'food') this.q_firstaid(f);
      else if (roll < 0.04 && this.section !== 'food') this.q_fort(f);
      else if (roll < 0.08 && this.section === 'showroom') this.q_play(f);
      else if (roll < 0.14 && this.section === 'storage') this.q_office(f);
      else if (roll < 0.06 && (this.section === 'display' || this.section === 'market' || this.section === 'warehouse')) this.q_mezzanine(f);
      else if (roll < 0.35 && this.section === 'market') this.q_snack(f);
      else this['q_' + this.section](f);
    }
    return this;
  }

  // ---- Sections ----
  q_showroom(f) {
    const { r } = this;
    // A three-walled room display, its back wall painted a feature colour.
    const feature = r.pick([0x9fb39a, 0xc98f74, 0x5d7189, 0xe2cf96, 0xb7b2ab, 0x8a9e9a, 0xd9b4a8, 0x6f7f5c, PARTITION, PARTITION]);
    this.fs(f, 0, 0, Q, 0.12, 0, 2.6, feature);
    { const [a, b, c, d] = f.rect(0, 0, Q, 0.16); this.deco(a, b, c, d, 2.6, 2.7, 0x8a857b); }
    this.fs(f, 0, 0.12, 0.12, 6.2, 0, 2.6, PARTITION);
    this.fs(f, Q - 0.12, 0.12, Q, 6.2, 0, 2.6, PARTITION);
    const theme = r.int(6);
    if (theme === 0) { // living room
      this.ff(f, 'rug', 4.8, 3.0, 0); this.ff(f, 'sofa', 4.8, 0.75, 0); this.ff(f, 'coffeeTable', 4.8, 2.4, 0);
      this.ff(f, 'armchair', 1.4, 2.8, 1); this.ff(f, 'tvStand', 4.8, 5.0, 2); this.ff(f, 'tv', 4.8, 5.0, 2, 0.5); this.ff(f, 'bookshelf', 8.6, 0.4, 0);
      this.ff(f, 'sideTable', 2.0, 0.6, 0); this.ff(f, 'tableLamp', 2.0, 0.6, 0, 0.55);
      this.ff(f, 'floorLamp', 2.8, 0.5, 0); this.ff(f, 'plant', 0.7, 0.7, 0); if (r.chance(0.6)) this.ff(f, 'armchair', 8.2, 3.0, 3);
    } else if (theme === 1) { // bedroom
      this.ff(f, 'bedDouble', 4.8, 1.25, 0); this.ff(f, 'cabinet', 3.4, 0.4, 0); this.ff(f, 'tableLamp', 3.4, 0.4, 0, 1.0); this.ff(f, 'floorLamp', 6.3, 0.5, 0);
      this.ff(f, 'wardrobe', 8.4, 0.58, 0); this.ff(f, 'dresser', 1.2, 0.45, 0); this.ff(f, 'rug', 4.8, 3.6, 0);
      this.ff(f, 'plant', 0.7, 4.8, 0); if (r.chance(0.5)) this.ff(f, 'armchair', 8.3, 3.4, 3);
    } else if (theme === 2) { // kitchen
      for (let i = 0; i < 4; i++) this.ff(f, 'counter', 0.8 + i * 1.22, 0.42, 0);
      this.ff(f, 'fridge', 5.75, 0.5, 0); this.ff(f, 'diningTable', 5.6, 4.4, 0);
      this.ff(f, 'chair', 5.1, 3.6, 0); this.ff(f, 'chair', 6.1, 3.6, 0); this.ff(f, 'chair', 5.1, 5.2, 2); this.ff(f, 'chair', 6.1, 5.2, 2);
      this.ff(f, 'cabinet', 8.6, 0.4, 0); this.ff(f, 'stool', 2.0, 1.4, 0); this.ff(f, 'stool', 3.0, 1.4, 0);
      for (let i = 0, n = r.int(2); i < n; i++) this.fd(f, STOCK.kitchen, 0.6 + i * 1.2 + r.range(0, 0.6), 0.4, 0.9);
    } else if (theme === 3) { // workspace
      this.ff(f, 'desk', 2.6, 0.45, 0); this.ff(f, 'chair', 2.6, 1.3, 2); this.ff(f, 'desk', 6.6, 0.45, 0); this.ff(f, 'chair', 6.6, 1.3, 2);
      this.ff(f, 'bookshelf', 0.32, 2.6, 1); this.ff(f, 'bookshelf', 0.32, 3.6, 1); this.ff(f, 'cabinet', 9.3, 2.8, 3);
      this.ff(f, 'plant', 8.9, 0.6, 0); this.ff(f, 'lockers', 9.3, 4.6, 3); this.ff(f, 'rug', 4.6, 3.4, 0); this.ff(f, 'filingCabinet', 4.6, 0.35, 0);
      this.ff(f, 'tableLamp', 3.0, 0.4, 0, 0.75);
    } else if (theme === 5) { // bathroom
      this.ff(f, 'bathtub', 1.2, 0.5, 0); this.ff(f, 'toilet', 3.4, 0.45, 0); this.ff(f, 'cabinet', 4.6, 0.3, 0);
      this.ff(f, 'cabinet', 5.5, 0.3, 0); this.ff(f, 'plant', 8.9, 0.6, 0); this.ff(f, 'rug', 3.0, 2.2, 0); this.ff(f, 'shelfCube', 7.8, 0.3, 0);
      this.ff(f, 'tableLamp', 4.6, 0.3, 0, 1.0);
    } else { // kids room
      this.ff(f, 'bunkBed', 0.75, 1.1, 0); this.ff(f, 'bunkBed', 3.0, 1.1, 0); this.ff(f, 'shelfCube', 6.4, 0.32, 0);
      this.ff(f, 'mattress', 7.6, 3.4, 0); this.ff(f, 'rug', 4.6, 4.0, 1); this.ff(f, 'box', 5.2, 2.2, 0); this.ff(f, 'beanbag', 6.0, 2.6, 1);
      this.ff(f, 'stool', 3.4, 4.2, 0); this.ff(f, 'plant', 9.0, 0.6, 0); this.ff(f, 'tableLamp', 6.0, 0.3, 0, 1.5);
      if (r.chance(0.4)) for (let i = 0, n = 1 + r.int(2); i < n; i++) this.fd(f, STOCK.play, 4.0 + i * 0.4, 4.2, 0);
    }
  }

  q_warehouse(f) {
    const { r } = this;
    const deep = 1.2, top = 4.4;
    const rows = [0.7, 4.8, 8.9];
    for (const v of rows) {
      const [x0, z0, x1, z1] = f.rect(0.2, v - deep / 2, Q - 0.2, v + deep / 2);
      this.boxes.push({ x0: x0 + this.ox, x1: x1 + this.ox, z0: z0 + this.oz, z1: z1 + this.oz, y0: 0, y1: top, climb: true });
      this.sh.rect(x0, z0, x1, z1, 0.004, 0.3);
      const alongX = x1 - x0 > z1 - z0;
      const len = alongX ? x1 - x0 : z1 - z0;
      const n = Math.round(len / 2.3);
      // uprights
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        for (const s of [0, 1]) {
          const px = alongX ? x0 + t * (len - 0.1) : (s ? x1 - 0.1 : x0);
          const pz = alongX ? (s ? z1 - 0.1 : z0) : z0 + t * (len - 0.1);
          this.deco(px, pz, px + 0.1, pz + 0.1, 0, top, RACK);
        }
      }
      // shelves and goods
      for (const y of [0.15, 1.55, 2.95, 4.3]) {
        this.deco(x0, z0, x1, z1, y - 0.08, y, RACK_BEAM);
        if (y > 4) continue;
        let p = 0.15;
        while (p < len - 0.6) {
          const bw = r.range(0.5, 1.2), bh = r.range(0.4, 1.2);
          if (r.chance(0.82)) {
            const col = r.pick([0xc8a26e, 0xb8915c, 0xd2b07d, 0xe7e1d3, 0x9cb3c4]);
            if (alongX) this.deco(x0 + p, z0 + 0.1, x0 + p + bw, z1 - 0.1, y, y + bh, col);
            else this.deco(x0 + 0.1, z0 + p, x1 - 0.1, z0 + p + bw, y, y + bh, col);
          }
          p += bw + 0.08;
        }
      }
    }
    // loose stock in the aisles: pallets (great for building), crates, boxes
    const n = 3 + r.int(4);
    for (let i = 0; i < n; i++) {
      const v = r.pick([2.75, 6.85]), u = 0.9 + (i / n) * (Q - 1.8) + r.range(-0.2, 0.2), k = r();
      if (k < 0.45) { const st = 1 + r.int(3); for (let j = 0; j < st; j++) this.ff(f, 'pallet', u, v, 1, j * 0.15); }
      else this.ff(f, k < 0.75 ? 'box' : 'crate', u, v, r.int(4));
    }
    if (r.chance(0.25)) { const [x, z] = f.pt(r.range(1, Q - 1), r.pick([2.2, 6.3])); this.randomFood(x, z, 0); }
  }

  q_display(f) {
    const { r } = this;
    const pick = r.pick([
      ['sofa', 2.8, 2.4], ['armchair', 1.7, 1.8], ['bedSingle', 1.8, 3.0], ['bedDouble', 2.4, 3.1], ['wardrobe', 1.9, 1.6],
      ['bookshelf', 1.4, 1.4], ['diningTable', 2.6, 2.4], ['dresser', 1.7, 1.5], ['desk', 2.0, 1.8], ['shelfCube', 2.2, 1.6], ['counter', 1.5, 1.6], ['floorLamp', 1.2, 1.2], ['bunkBed', 1.6, 2.6], ['tv', 1.6, 1.2], ['beanbag', 1.3, 1.3], ['filingCabinet', 1.8, 2.2],
    ]);
    const [type, su, sv] = pick;
    const nu = Math.max(1, Math.floor((Q - 0.6) / su)), nv = Math.max(1, Math.floor((Q - 2.0) / sv));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      if (r.chance(0.18)) continue;
      this.ff(f, type, 0.3 + su * (i + 0.5), 0.3 + sv * (j + 0.5), 0);
    }
    // a price stand at the front
    this.fs(f, 0.2, Q - 0.9, 1.0, Q - 0.6, 0, 1.2, 0x34495e);
    if (r.chance(0.5)) this.ff(f, 'plant', Q - 0.6, Q - 0.6, 0);
  }

  q_market(f) {
    const { r } = this;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const u0 = 0.4 + i * 3.1, v0 = 1.0 + j * 4.2;
      this.fs(f, u0, v0, u0 + 2.2, v0 + 1.2, 0, 0.8, 0x7b6a58);
      const [a, b, c, d] = f.rect(u0 + 0.08, v0 + 0.08, u0 + 2.12, v0 + 1.12);
      this.deco(a, b, c, d, 0.8, 0.86, 0xb8a98f);
      const n = 1 + r.int(3);
      for (let k = 0; k < n; k++) {
        const u = u0 + 0.35 + k * 0.7, v = v0 + 0.6;
        if (r.chance(0.08)) this.fd(f, STOCK.any, u, v, 0.86);
        else this.ff(f, r.pick(['tableLamp', 'tableLamp', 'plant', 'box']), u, v, r.int(4), 0.86);
      }
    }
    for (let i = 0; i < 2; i++) this.ff(f, r.pick(['plant', 'floorLamp', 'box', 'stool']), r.range(0.6, Q - 0.6), r.pick([3.2, 7.6]), r.int(4));
  }

  // Cafeterias: long serving counters piled with food, and seating.
  q_food(f) {
    const { r } = this;
    this.fs(f, 0.3, 0.3, Q - 0.3, 1.1, 0, 1.0, 0x9c3d2e);
    const [a, b, c, d] = f.rect(0.25, 0.25, Q - 0.25, 1.15);
    this.deco(a, b, c, d, 1.0, 1.05, 0xe8e2d6);
    const n = 7 + r.int(4);
    for (let i = 0; i < n; i++) this.fd(f, STOCK.cafeteria, 0.6 + (i / n) * (Q - 1.2), r.range(0.5, 0.9), 1.05);
    if (r.chance(0.3)) { const [x, z] = f.pt(Q - 0.7, 0.7); this.food('medkit', x, z, 1.05); }
    for (const u of [2.4, 7.2]) for (const v of [3.6, 7.4]) {
      this.ff(f, 'diningTable', u, v, 0);
      this.ff(f, 'chair', u - 0.5, v - 0.8, 0); this.ff(f, 'chair', u + 0.5, v - 0.8, 0);
      this.ff(f, 'chair', u - 0.5, v + 0.8, 2); if (r.chance(0.7)) this.ff(f, 'chair', u + 0.5, v + 0.8, 2);
      if (r.chance(0.3)) this.fd(f, STOCK.cafeteria, u + r.range(-0.4, 0.4), v, 0.77);
    }
  }

  // Somebody's old fort: walls of upturned pallets and crates around a lamp,
  // a raised platform, and maybe a little food left behind.
  q_fort(f) {
    const { r } = this;
    for (let i = 0; i < 3; i++) {
      this.ff(f, 'pallet', 3.0 + i * 1.2, 2.5, 0, 0); this.items[this.items.length - 1].tl = 1;
      this.ff(f, 'pallet', 3.0 + i * 1.2, 6.1, 0, 0); this.items[this.items.length - 1].tl = 1;
    }
    for (let i = 0; i < 3; i++) {
      this.ff(f, 'pallet', 2.3, 3.2 + i * 1.2, 1, 0); this.items[this.items.length - 1].tl = 1;
      if (i !== 1) { this.ff(f, 'pallet', 6.3, 3.2 + i * 1.2, 1, 0); this.items[this.items.length - 1].tl = 1; }
    }
    this.ff(f, 'crate', 4.2, 4.3, 0); this.ff(f, 'crate', 4.2, 4.3, 0, 1.0); this.ff(f, 'pallet', 4.2, 4.3, 0, 2.0);
    this.ff(f, 'floorLamp', 3.2, 3.5, 0); this.ff(f, 'mattress', 5.4, 4.6, 0);
    for (let i = 0, n = r.int(3); i < n; i++) this.fd(f, STOCK.any, 3.3 + i * 0.5, 5.4, 0);
  }

  // A garden centre under open skylights: grass, planters, trees, patio sets.
  q_garden(f) {
    const { r } = this;
    { const [a, b, c, d] = f.rect(0, 0, Q, Q); this.deco(a, b, c, d, 0, 0.02, 0x5e8a3a); }
    for (let i = 0; i < 2; i++) { // planters
      const u0 = 0.5 + i * 5.2;
      this.fs(f, u0, 0.4, u0 + 3.6, 1.4, 0, 0.5, 0x7a5a3a);
      const [a, b, c, d] = f.rect(u0 + 0.1, 0.5, u0 + 3.5, 1.3); this.deco(a, b, c, d, 0.5, 0.52, 0x4a3426);
      for (let k = 0; k < 3; k++) this.ff(f, 'plant', u0 + 0.6 + k * 1.2, 0.9, r.int(4), 0.5);
    }
    // a tree in a big pot
    const [tx, tz] = f.pt(7.6, 6.8);
    this.solid(tx - 0.5, tz - 0.5, tx + 0.5, tz + 0.5, 0, 0.6, 0x9a5b3a);
    this.solid(tx - 0.14, tz - 0.14, tx + 0.14, tz + 0.14, 0.6, 2.4, 0x6b4a2f);
    for (const [dx, dy, dz, sz] of [[0, 3.0, 0, 1.8], [0.5, 2.6, 0.3, 1.2], [-0.5, 2.7, -0.3, 1.3], [0.1, 3.6, -0.2, 1.1]]) this.deco(tx + dx - sz / 2, tz + dz - sz / 2, tx + dx + sz / 2, tz + dz + sz / 2, dy - sz / 2, dy + sz / 2, r.pick([0x3f7a3a, 0x4f8f45, 0x356a32]));
    this.ff(f, 'diningTable', 3.2, 5.6, 1); this.ff(f, 'chair', 2.4, 5.6, 1); this.ff(f, 'chair', 4.0, 5.6, 3);
    this.ff(f, 'bench', 3.2, 8.6, 0); this.ff(f, 'plant', 0.8, 8.8, 0); this.ff(f, 'pallet', 6.0, 8.6, 0);
    if (r.chance(0.5)) this.fd(f, STOCK.play, 3.0, 5.4, 0.77);
  }

  // A kids' play area: slides, beanbags, little tables, and apples.
  q_play(f) {
    const { r } = this;
    this.ff(f, 'rug', 4.8, 4.8, 0); this.ff(f, 'rug', 4.8, 3.0, 1);
    this.ff(f, 'slide', 1.2, 2.0, 0); this.ff(f, 'slide', 8.4, 6.5, 2);
    for (let i = 0; i < 4; i++) this.ff(f, 'beanbag', 3.5 + i * 1.0, 7.8, r.int(4));
    this.ff(f, 'coffeeTable', 5.0, 4.4, 0); this.ff(f, 'stool', 4.2, 4.4, 0); this.ff(f, 'stool', 5.8, 4.4, 0);
    this.ff(f, 'shelfCube', 4.8, 0.4, 0); this.ff(f, 'box', 7.0, 1.0, 0);
    for (let i = 0, n = 1 + r.int(3); i < n; i++) this.fd(f, STOCK.play, 4.7 + i * 0.2, 4.4, 0.45);
  }

  // An office floor: rows of desks, chairs and filing cabinets.
  q_office(f) {
    const { r } = this;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const u = 1.6 + i * 3.2, v = 1.5 + j * 4.0;
      this.ff(f, 'desk', u, v, 0); this.ff(f, 'chair', u, v + 0.85, 2);
      if (r.chance(0.4)) this.ff(f, 'tableLamp', u - 0.4, v - 0.1, 0, 0.75);
    }
    for (let i = 0; i < 4; i++) this.ff(f, 'filingCabinet', 0.6 + i * 0.6, 9.0, 2);
    this.ff(f, 'plant', 8.9, 9.0, 0); this.ff(f, 'lockers', 7.6, 9.0, 2);
    if (r.chance(0.5)) this.fd(f, ['water', 'soda', 'cookie', 'chips'], 1.4, 1.4, 0.75);
  }

  // A mezzanine: a platform 3 m up on four posts, with a staircase and
  // railings, and something left on top. A ready-made high point, if you can
  // keep the stairs clear.
  q_mezzanine(f) {
    const { r } = this, top = 3.0, STEEL = 0x34495e;
    this.fs(f, 3.0, 2.0, 9.2, 8.2, top - 0.2, top, 0x8d8b86);                 // the deck
    for (const [u, v] of [[3.1, 2.1], [9.0, 2.1], [3.1, 8.0], [9.0, 8.0]]) this.fs(f, u, v, u + 0.12, v + 0.12, 0, top - 0.2, STEEL);
    // railings on three sides (the stairs come up the fourth, at u = 3)
    this.fs(f, 3.0, 2.0, 9.2, 2.06, top, top + 1.0, STEEL); this.fs(f, 3.0, 8.14, 9.2, 8.2, top, top + 1.0, STEEL);
    this.fs(f, 9.14, 2.0, 9.2, 8.2, top, top + 1.0, STEEL);
    this.fs(f, 3.0, 4.2, 3.06, 8.2, top, top + 1.0, STEEL);
    // stairs: ten 0.28 m steps climbing towards +u, up to the open gap at v 2..4.2
    for (let i = 0; i < 10; i++) {
      const h = (i + 1) * (top / 10.5);
      this.fs(f, 0.2 + i * 0.28, 2.1, 0.48 + i * 0.28, 4.1, 0, h, 0x9aa2aa);
    }
    this.fs(f, 0.2, 2.06, 3.0, 2.1, 0, top, STEEL);
    this.ff(f, r.pick(['crate', 'box', 'bench', 'floorLamp']), 6.0, 5.0, r.int(4), top);
    if (r.chance(0.4)) this.fd(f, STOCK.any, 7.2, 6.0, top);
  }

  // A first aid station: a white kiosk with four kits on it.
  q_firstaid(f) {
    this.fs(f, 3.2, 0.3, 6.4, 1.0, 0, 1.0, 0xf2f2f2);
    const [a, b, c, d] = f.rect(3.2, 0.25, 6.4, 0.35); this.deco(a, b, c, d, 1.0, 2.2, 0xf2f2f2);
    const [e, g, h, i] = f.rect(4.5, 0.36, 5.1, 0.38); this.deco(e, g, h, i, 1.4, 2.0, 0xd63031);
    const [j, k, l, m] = f.rect(4.2, 0.36, 5.4, 0.38); this.deco(j, k, l, m, 1.6, 1.8, 0xd63031);
    for (let n = 0; n < 4; n++) { const [x, z] = f.pt(3.6 + n * 0.8, 0.65); this.food('medkit', x, z, 1.0); }
    this.ff(f, 'bench', 4.8, 3.0, 2);
  }

  // A snack bar: ice cream, fizzy drinks and crisps.
  q_snack(f) {
    const { r } = this;
    this.fs(f, 1.0, 0.3, 6.0, 1.0, 0, 1.05, 0x2e86c1);
    const [a, b, c, d] = f.rect(0.95, 0.25, 6.05, 1.05); this.deco(a, b, c, d, 1.05, 1.1, 0xf2f2f2);
    for (let i = 0, n = 3 + r.int(3); i < n; i++) this.fd(f, STOCK.snack, 1.4 + i * 0.9, 0.65, 1.1);
    for (let i = 0; i < 3; i++) this.ff(f, 'stool', 2.0 + i * 1.5, 1.6, 0);
    this.ff(f, 'diningTable', 7.6, 4.0, 1); this.ff(f, 'bench', 6.8, 4.0, 1); this.ff(f, 'bench', 8.4, 4.0, 3);
  }

  q_storage(f) {
    const { r } = this;
    const n = 6 + r.int(6);
    for (let i = 0; i < n; i++) {
      const u = 0.8 + r.int(8) * 1.1, v = 0.8 + r.int(8) * 1.1;
      this.ff(f, r.chance(0.5) ? 'crate' : 'box', u, v, 0);
    }
    if (r.chance(0.4)) this.ff(f, 'lockers', 0.4, 4.8, 1);
    if (r.chance(0.2)) { const [x, z] = f.pt(r.range(1, 8), r.range(1, 8)); this.randomFood(x, z, 0); }
  }
}

// The sky through a skylight: a gradient that follows the time of day.
let _skyMat = null;
function skyMaterial() {
  if (_skyMat) return _skyMat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 128, 128);
  gr.addColorStop(0, '#bfe0ff'); gr.addColorStop(1, '#7fb6ee'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(20 + i * 19, 30 + (i % 3) * 30, 22, 9, 0, 0, 7); x.fill(); }
  x.strokeStyle = '#5b6470'; x.lineWidth = 3; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 128); x.stroke(); x.beginPath(); x.moveTo(0, i * 32); x.lineTo(128, i * 32); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  _skyMat = new THREE.MeshBasicMaterial({ map: t, fog: false, toneMapped: false });
  return _skyMat;
}
export function setSkyLight(day, storm) { const m = skyMaterial(); m.color.setRGB(0.06 + 0.94 * day * (storm ? 0.45 : 1), 0.07 + 0.93 * day * (storm ? 0.48 : 1), 0.12 + 0.88 * day * (storm ? 0.55 : 1)); }

let _glowMat = null;
function glowMaterial() {
  if (_glowMat) return _glowMat;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,230,180,1)'); gr.addColorStop(0.25, 'rgba(255,200,120,0.45)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  _glowMat = new THREE.PointsMaterial({ size: 1.6, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false, sizeAttenuation: true });
  return _glowMat;
}
export function setLampGlow(k) { glowMaterial().opacity = k; }

// Canvas text for the hanging aisle signs.
function signTexture(label, color, line2) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 512, 192);
  x.fillStyle = '#ffffff22'; x.fillRect(0, 140, 512, 52);
  x.fillStyle = '#fff'; x.font = 'bold 64px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, 256, 72, 480);
  x.font = 'bold 34px system-ui, sans-serif'; x.fillText(line2, 256, 166, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}


export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.seed = 1;
    this.day = 1;
    this.epoch = 1;
    this.chunks = new Map();
    this.items = new Map();
    this.mods = new Map();
    this.grid = new Map();
    this.focusX = 0; this.focusZ = 0;
    this.inst = new Map(); this.itemsDirty = true;
    this.version = 0; // bumps whenever anything solid moves (staff path cache)
  }

  reset(seed) {
    for (const ch of this.chunks.values()) this._dropVisual(ch);
    for (const im of this.inst.values()) { this.group.remove(im); im.dispose(); }
    if (this.shadowInst) { this.group.remove(this.shadowInst); this.shadowInst.dispose(); this.shadowInst = null; }
    this.inst.clear(); this.itemsDirty = true;
    this.chunks.clear(); this.items.clear(); this.mods.clear(); this.grid.clear();
    this.seed = seed >>> 0;
    this.day = 1; this.epoch = 1;
  }

  static key(cx, cz) { return cx + ',' + cz; }

  // ---- Chunks ----
  // focus: [{x, z, render}] — the local player renders, the others only load data.
  update(focus) {
    const want = new Map();
    for (const f of focus) {
      const cx = Math.floor(f.x / CHUNK), cz = Math.floor(f.z / CHUNK), R = f.render ? RENDER_R : DATA_R;
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
        const k = World.key(cx + i, cz + j);
        if (f.render || !want.has(k)) want.set(k, (want.get(k) || false) || f.render);
      }
      if (f.render) { this.focusX = f.x; this.focusZ = f.z; }
    }
    let built = 0;
    for (const [k, render] of want) {
      let ch = this.chunks.get(k);
      if (!ch) { const [cx, cz] = k.split(',').map(Number); ch = this._load(cx, cz); }
      if (render && !ch.mesh && built < 2) { this._buildVisual(ch); built++; }
      if (!render && ch.mesh) this._dropVisual(ch);
    }
    for (const [k, ch] of this.chunks) if (!want.has(k)) this._unload(ch);
    this.itemsDirty = true;
  }

  _load(cx, cz) {
    const gen = new ChunkGen(this, cx, cz).run();
    this.version++;
    const ch = { cx, cz, key: World.key(cx, cz), gen, boxes: gen.boxes, skylights: gen.skylights, itemIds: [], mesh: null, sign: null };
    gen.items.forEach((spec, i) => {
      const id = ch.key + ':' + i;
      ch.itemIds.push(id);
      if (this.mods.has(id)) return; // modded items are already loaded
      this._addItem(id, spec);
    });
    this.chunks.set(ch.key, ch);
    return ch;
  }

  _unload(ch) {
    this._dropVisual(ch);
    for (const id of ch.itemIds) {
      if (this.mods.has(id)) continue;
      const it = this.items.get(id);
      if (it) { this._gridRemove(it); this.items.delete(id); this.itemsDirty = true; }
    }
    this.chunks.delete(ch.key);
  }

  _buildVisual(ch) {
    const geo = ch.gen.g.build();
    const m = new THREE.Mesh(geo, staticMaterial);
    m.position.set(ch.cx * CHUNK, 0, ch.cz * CHUNK);
    m.matrixAutoUpdate = false; m.updateMatrix();
    this.group.add(m);
    ch.mesh = m;
    const sh = new THREE.Mesh(ch.gen.sh.build(), shadowMaterial);
    sh.position.copy(m.position); sh.matrixAutoUpdate = false; sh.updateMatrix(); sh.renderOrder = 1;
    this.group.add(sh);
    ch.shadow = sh;
    const sec = SECTIONS[ch.gen.section];
    const tex = signTexture(sec.label, sec.color, 'AISLE ' + (ch.cx >= 0 ? 'E' : 'W') + Math.abs(ch.cx) + ' · ' + (ch.cz >= 0 ? 'S' : 'N') + Math.abs(ch.cz));
    const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
    // Two faces back to back, so the text reads the right way from both sides.
    const sign = new THREE.Group(), plane = new THREE.PlaneGeometry(3.2, 1.2);
    const front = new THREE.Mesh(plane, mat), back = new THREE.Mesh(plane, mat);
    front.position.z = 0.01; back.position.z = -0.01; back.rotation.y = Math.PI;
    sign.add(front, back);
    sign.position.set(ch.cx * CHUNK + 6, 4.9, ch.cz * CHUNK + 0.6);
    this.group.add(sign);
    ch.sign = sign;
    for (const sk of ch.skylights) {
      const m2 = new THREE.Mesh(new THREE.PlaneGeometry(sk.x1 - sk.x0, sk.z1 - sk.z0), skyMaterial());
      m2.rotation.x = Math.PI / 2; m2.position.set((sk.x0 + sk.x1) / 2, CEIL - 0.03, (sk.z0 + sk.z1) / 2);
      this.group.add(m2); (ch.sky = ch.sky || []).push(m2);
    }
  }

  _dropVisual(ch) {
    if (ch.mesh) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; }
    if (ch.shadow) { this.group.remove(ch.shadow); ch.shadow.geometry.dispose(); ch.shadow = null; }
    if (ch.sky) { for (const m of ch.sky) { this.group.remove(m); m.geometry.dispose(); } ch.sky = null; }
    if (ch.sign) { this.group.remove(ch.sign); const m = ch.sign.children[0]; m.material.map.dispose(); m.material.dispose(); m.geometry.dispose(); ch.sign = null; }
  }

  // Open skylights (garden centres) near a point.
  skylightsNear(x, z, r) {
    const out = [];
    for (const ch of this.chunks.values()) for (const sk of ch.skylights) if (sk.x1 > x - r && sk.x0 < x + r && sk.z1 > z - r && sk.z0 < z + r) out.push(sk);
    return out;
  }
  underSky(x, y, z) {
    const ch = this.chunks.get(World.key(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
    if (!ch || !ch.skylights.some((sk) => x > sk.x0 && x < sk.x1 && z > sk.z0 && z < sk.z1)) return false;
    let covered = false;
    this.forBoxes(x - 0.2, z - 0.2, x + 0.2, z + 0.2, (b) => { if (b.y0 >= y && b.x0 <= x && b.x1 >= x && b.z0 <= z && b.z1 >= z) covered = true; });
    return !covered;
  }

  staticMeshes() { const out = []; for (const ch of this.chunks.values()) if (ch.mesh) out.push(ch.mesh); return out; }
  sectionAt(x, z) { return sectionOf(this.seed, Math.floor(x / CHUNK), Math.floor(z / CHUNK)); }

  // ---- Items ----
  _addItem(id, s) {
    const it = { id, t: s.t, k: s.k, v: s.v | 0, x: s.x, y: s.y, z: s.z, r: s.r | 0, tl: ((s.tl | 0) % 3 + 3) % 3, hp: s.hp != null ? s.hp : (s.k === 'f' ? TYPES[s.t].hp : 1), g: !!s.g, c: s.c || null, d: s.d | 0, mesh: null, cells: null };
    if (it.k === 'f' && !Object.prototype.hasOwnProperty.call(TYPES, it.t)) return null;
    if (it.k === 'i' && !Object.prototype.hasOwnProperty.call(ITEMS, it.t)) return null;
    this.items.set(id, it);
    this._gridAdd(it);
    this.itemsDirty = true;
    return it;
  }

  // Food and kits taken stay gone until the next restock (Monday or Friday).
  isGone(it) { return it.k === 'i' ? (it.g && it.d === this.epoch) : it.g; }
  active(it) { return !this.isGone(it) && !it.c; }

  setDay(d) {
    if (d === this.day) return;
    this.day = d;
    const e = restockEpoch(d);
    if (e === this.epoch) return;
    this.epoch = e;
    for (const it of this.items.values()) this.edit(it);
  }

  // Box of an item in world space.
  itemBox(it) {
    if (it.k === 'f') {
      const [w, h, d] = itemDims(it.t, it.r, it.tl);
      return { x0: it.x - w / 2, x1: it.x + w / 2, z0: it.z - d / 2, z1: it.z + d / 2, y0: it.y, y1: it.y + h, item: it, climb: !!TYPES[it.t].climb };
    }
    const s = ITEMS[it.t], w = Math.max(s.w, s.d) / 2 + 0.05;
    return { x0: it.x - w, x1: it.x + w, z0: it.z - w, z1: it.z + w, y0: it.y, y1: it.y + s.h, item: it };
  }

  _gridAdd(it) {
    this.version++;
    if (!this.active(it)) { it.cells = null; return; }
    const b = this.itemBox(it);
    it.cells = [];
    for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i++) for (let j = Math.floor(b.z0 / CELL); j <= Math.floor(b.z1 / CELL); j++) {
      const k = i + ',' + j; let s = this.grid.get(k); if (!s) this.grid.set(k, s = new Set()); s.add(it); it.cells.push(k);
    }
  }
  _gridRemove(it) {
    this.version++;
    if (!it.cells) return;
    for (const k of it.cells) { const s = this.grid.get(k); if (s) { s.delete(it); if (!s.size) this.grid.delete(k); } }
    it.cells = null;
  }

  // Items are drawn as one InstancedMesh per model (type + colour), rebuilt
  // whenever anything changes, so 1,000+ pieces cost ~100 draw calls.
  _syncItemVisibility() { this.itemsDirty = true; }
  _removeItemMesh() { this.itemsDirty = true; }

  // Move / change an item and keep the spatial hash and drawing up to date.
  edit(it, patch) {
    this._gridRemove(it);
    if (patch) Object.assign(it, patch);
    this._gridAdd(it);
    this.itemsDirty = true;
  }

  flushItems() {
    if (!this.itemsDirty) return;
    this.itemsDirty = false;
    const groups = new Map();
    const R = CHUNK * (RENDER_R + 0.5);
    for (const it of this.items.values()) {
      if (!this.active(it) || Math.abs(it.x - this.focusX) > R || Math.abs(it.z - this.focusZ) > R) continue;
      const key = it.k === 'f' ? it.t + ':' + (it.v % TYPES[it.t].cols.length) : 'item:' + it.t;
      let g = groups.get(key); if (!g) groups.set(key, g = []);
      g.push(it);
    }
    const m4 = this._m4 || (this._m4 = new THREE.Matrix4()), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (const [key, im] of this.inst) if (!groups.has(key)) { im.count = 0; im.visible = false; }
    // a soft glow over every lamp (shown at night)
    {
      const lamps = [];
      for (const list of groups.values()) for (const it of list) if (it.k === 'f' && TYPES[it.t].lamp) lamps.push(it);
      if (!this.glow || this.glow.geometry.attributes.position.count < lamps.length) {
        if (this.glow) { this.group.remove(this.glow); this.glow.geometry.dispose(); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(32, lamps.length * 2) * 3), 3));
        this.glow = new THREE.Points(g, glowMaterial()); this.glow.frustumCulled = false; this.glow.renderOrder = 2;
        this.group.add(this.glow);
      }
      const a = this.glow.geometry.attributes.position;
      lamps.forEach((it, i) => { const h = itemDims(it.t, it.r, it.tl)[1]; a.setXYZ(i, it.x, it.y + h * 0.82, it.z); });
      a.needsUpdate = true; this.glow.geometry.setDrawRange(0, lamps.length);
    }
    // soft shadows under furniture
    let shadows = 0;
    for (const list of groups.values()) for (const it of list) if (it.k === 'f' && !TYPES[it.t].flat) shadows++;
    if (!this.shadowInst || this.shadowInst.instanceMatrix.count < shadows) {
      if (this.shadowInst) { this.group.remove(this.shadowInst); this.shadowInst.dispose(); }
      this.shadowInst = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, Math.max(64, Math.ceil(shadows * 1.5)));
      this.shadowInst.renderOrder = 1;
      this.group.add(this.shadowInst);
    }
    {
      const sc = new THREE.Vector3(); let k = 0;
      for (const list of groups.values()) for (const it of list) {
        if (it.k !== 'f' || TYPES[it.t].flat) continue;
        const [dw, dh, dd] = itemDims(it.t, it.r, it.tl), grow = 1.55 + Math.min(0.5, dh * 0.2);
        q.identity();
        m4.compose(pos.set(it.x, it.y + 0.005, it.z), q, sc.set(dw * grow + 0.15, 1, dd * grow + 0.15));
        this.shadowInst.setMatrixAt(k++, m4);
      }
      this.shadowInst.count = k; this.shadowInst.instanceMatrix.needsUpdate = true; this.shadowInst.computeBoundingSphere();
    }
    for (const [key, list] of groups) {
      let im = this.inst.get(key);
      if (!im || im.instanceMatrix.count < list.length) {
        if (im) { this.group.remove(im); im.dispose(); }
        const [a, b] = key.split(':');
        const geo = a === 'item' ? itemGeometry(b) : furnitureGeometry(a, +b);
        im = new THREE.InstancedMesh(geo, furnitureMaterial, Math.max(16, Math.ceil(list.length * 1.5)));
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(im);
        this.inst.set(key, im);
      }
      list.forEach((it, i) => {
        if (it.k === 'f') itemMatrix(m4, it.t, it.x, it.y, it.z, it.r, it.tl);
        else { q.setFromAxisAngle(up, it.r * Math.PI / 2); m4.compose(pos.set(it.x, it.y, it.z), q, one); }
        im.setMatrixAt(i, m4);
      });
      im.count = list.length; im.visible = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }

  // Lamps standing near (x, z), nearest first.
  lampsNear(x, z, r, max) {
    const out = [];
    this.forItems(x - r, z - r, x + r, z + r, (it) => {
      if (it.k !== 'f' || !TYPES[it.t].lamp || !this.active(it)) return;
      const d = Math.hypot(it.x - x, it.z - z); if (d < r) out.push([d, it]);
    });
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, max).map((e) => e[1]);
  }

  forItems(x0, z0, x1, z1, fn) {
    const seen = new Set();
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const s = this.grid.get(i + ',' + j); if (!s) continue;
      for (const it of s) if (!seen.has(it)) { seen.add(it); fn(it); }
    }
  }

  // Calls fn(box) for every solid box overlapping the rectangle. Flat items
  // (rugs) and food never block.
  forBoxes(x0, z0, x1, z1, fn) {
    const c0 = Math.floor(x0 / CHUNK), c1 = Math.floor(x1 / CHUNK), d0 = Math.floor(z0 / CHUNK), d1 = Math.floor(z1 / CHUNK);
    for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
      const ch = this.chunks.get(World.key(i, j)); if (!ch) continue;
      for (const b of ch.boxes) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) fn(b);
    }
    this.forItems(x0, z0, x1, z1, (it) => {
      if (it.k !== 'f' || TYPES[it.t].flat) return;
      const b = this.itemBox(it);
      if (!(b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1)) return;
      const parts = itemParts(it.t, it.r, it.tl);
      if (!parts) { fn(b); return; }
      for (const [a, c, d, e, f, g] of parts) {
        const pb = { x0: it.x + a, x1: it.x + e, y0: it.y + c, y1: it.y + f, z0: it.z + d, z1: it.z + g, item: it, climb: b.climb };
        if (pb.x1 > x0 && pb.x0 < x1 && pb.z1 > z0 && pb.z0 < z1) fn(pb);
      }
    });
  }

  // Highest surface under a footprint that is no higher than maxY.
  supportHeight(x0, z0, x1, z1, maxY, skip) {
    let y = 0;
    this.forBoxes(x0 + 0.02, z0 + 0.02, x1 - 0.02, z1 - 0.02, (b) => { if (b.item && b.item === skip) return; if (b.y1 <= maxY + 0.001 && b.y1 > y) y = b.y1; });
    return y;
  }

  // Would a box fit here without overlapping anything solid?
  fits(b, skip) {
    if (b.y1 > CEIL) return false;
    let ok = true;
    this.forBoxes(b.x0 + 0.03, b.z0 + 0.03, b.x1 - 0.03, b.z1 - 0.03, (o) => {
      if (!ok || (o.item && o.item === skip)) return;
      if (o.y1 > b.y0 + 0.02 && o.y0 < b.y1 - 0.02) ok = false;
    });
    return ok;
  }

  // ---- Shared state (net.js keeps every screen's mods the same) ----
  stateOf(it) { return { t: it.t, k: it.k, v: it.v, x: +it.x.toFixed(3), y: +it.y.toFixed(3), z: +it.z.toFixed(3), r: it.r, tl: it.tl | 0, hp: Math.round(it.hp), g: it.g ? 1 : 0, c: it.c || 0, d: it.d }; }

  applyState(id, s) {
    if (!s || typeof s !== 'object') return null;
    const fin = (v, lo, hi) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
    const st = { t: String(s.t), k: s.k === 'i' ? 'i' : 'f', v: s.v | 0, x: fin(s.x, -1e6, 1e6), y: fin(s.y, 0, CEIL), z: fin(s.z, -1e6, 1e6), r: (s.r | 0) & 3, tl: ((s.tl | 0) % 3 + 3) % 3, hp: +s.hp || 0, g: !!s.g, c: s.c ? String(s.c) : null, d: s.d | 0 };
    if (st.k === 'f' ? !Object.prototype.hasOwnProperty.call(TYPES, st.t) : !Object.prototype.hasOwnProperty.call(ITEMS, st.t)) return null;
    this.mods.set(id, st);
    let it = this.items.get(id);
    if (!it) return this._addItem(id, st);
    this.edit(it, st);
    return it;
  }

  // Everything modded, for a newcomer.
  allMods() { const out = []; for (const [id, s] of this.mods) out.push([id, s]); return out; }

  // Dropping things that lost what held them up (host only). Returns the ids that changed.
  settle(around) {
    const changed = [];
    const queue = [around];
    let guard = 0;
    while (queue.length && guard++ < 64) {
      const b = queue.shift();
      const above = [];
      this.forItems(b.x0, b.z0, b.x1, b.z1, (it) => {
        if (!this.active(it)) return;
        const ib = this.itemBox(it);
        if (ib.x1 <= b.x0 + 0.02 || ib.x0 >= b.x1 - 0.02 || ib.z1 <= b.z0 + 0.02 || ib.z0 >= b.z1 - 0.02) return;
        if (ib.y0 >= b.y1 - 0.05 && ib.y0 > 0.001) above.push(it);
      });
      above.sort((p, q) => p.y - q.y);
      for (const it of above) {
        const ib = this.itemBox(it);
        const y = this.supportHeight(ib.x0, ib.z0, ib.x1, ib.z1, it.y + 0.01, it);
        if (y < it.y - 0.01) {
          this.edit(it, { y });
          this.mods.set(it.id, this.stateOf(it));
          changed.push(it.id);
          queue.push(ib);
        }
      }
    }
    return changed;
  }
}
