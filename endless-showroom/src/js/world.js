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
import { TYPES, ITEMS, STOCK, FOOD_KEYS, furnitureGeometry, itemGeometry, itemDims, itemMatrix, itemParts, cleanQuat, hasState, TV_CHANNELS, STRIP_COLORS } from './furniture.js';
import { SURF, staticMaterial, furnitureMaterial, shadowMaterial, shadowGeometry, ShadowBuilder } from './mats.js';

// There is no roof: the pillars run up into the fog. CEIL is only the height
// limit for things (and you); STORE_H is the height of the walls.
export const CHUNK = 24, CEIL = 400, STORE_H = 6.5, HALF = 12;
const CELL = 4; // item spatial hash cell
const RENDER_R = 2, DATA_R = 2; // data around other players reaches past where staff spawn
const Q = 9.6, QPAD = 1.2; // usable quadrant size and aisle padding

const WALL = 0xd9d3c7, WALL_BASE = 0x8a857b, PILLAR = 0xd6d1c8, PARTITION = 0xe4ded2, RACK = 0x3f6f9a, RACK_BEAM = 0xe07b2b;
const P_JOINT = 0xb3aea5, P_BAND = 0xa29d94, CONDUIT = 0x80868d, CABLE = 0x26282c, JBOX = 0x9aa0a6, HAZ_Y = 0xd8a320, HAZ_K = 0x1d1d1f, LAMP_CAGE = 0x2b2d31, LAMP_GLOW = 0xffb066;
// Surface of the fixed parts, by colour (anything else is paint).
const FOOD_SET = new Set(FOOD_KEYS);
const STATIC_SURF = {
  [PILLAR]: SURF.concrete, [WALL_BASE]: SURF.plastic, [RACK]: SURF.steel, [RACK_BEAM]: SURF.steel,
  0xc8a26e: SURF.card, 0xb8915c: SURF.card, 0xd2b07d: SURF.card, 0xe7e1d3: SURF.card, 0x9cb3c4: SURF.plastic,
  [P_JOINT]: SURF.concrete, [P_BAND]: SURF.concrete, [CONDUIT]: SURF.steel, [JBOX]: SURF.steel, [CABLE]: SURF.plastic, [LAMP_CAGE]: SURF.steel, [LAMP_GLOW]: SURF.glow,
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

// Warehouses come in streets: two to five chunks in a row along x, their
// racks running the whole length.
function inStreet(seed, cx, cz) {
  const seg = Math.floor(cx / 6), hs = hashInts(seed, cz, seg, 51);
  if (hs % 100 >= 24) return false;
  const start = (hs >>> 8) % 3, len = 2 + ((hs >>> 12) % 4), off = cx - seg * 6;
  return off >= start && off < start + len;
}
function sectionOf(seed, cx, cz) {
  if (cx === 0 && cz === 0) return 'display';
  if (Math.abs(cx) > 1 || Math.abs(cz) > 1 ? inStreet(seed, cx, cz) : false) return 'warehouse';
  const h = hashInts(seed, cx, cz, 11) % 100;
  if (h < 48) return 'showroom';
  if (h < 60) return 'display';
  if (h < 69) return 'garden';
  if (h < 82) return 'market';
  if (h < 87) return 'food'; // a cafeteria fills a whole chunk: rare, and worth finding
  return 'storage';
}

// The big structural pillars stand every fourth chunk in each direction, in
// the middle of the chunk, each with a screen giving its grid reference.
// Most are plain; some are being worked on, some are cracked, a few are
// overgrown, and one in a few hundred is the store's lost-property corner.
export const isGridChunk = (cx, cz) => (cx & 3) === 0 && (cz & 3) === 0;
export function pillarOf(seed, cx, cz) {
  if (!isGridChunk(cx, cz)) return null;
  const h = hashInts(seed, cx, cz, 61), roll = h % 10000;
  const type = cx === 0 && cz === 0 ? 'standard' : roll < 7900 ? 'standard' : roll < 9200 ? 'scaffold' : roll < 9790 ? 'cracked' : roll < 9970 ? 'overgrown' : 'lost';
  const glitch = ((h >>> 14) % 100) < (type === 'cracked' ? 70 : 15);
  const gx = cx / 4, gz = cz / 4;
  const label = (gx >= 0 ? 'E' : 'W') + Math.abs(gx) + ' · ' + (gz >= 0 ? 'S' : 'N') + Math.abs(gz);
  return { type, glitch, label };
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
    this.pillar = pillarOf(world.seed, cx, cz);
    this.skylights = [];
  }
  // Static solid, in chunk-local coordinates.
  solid(x0, z0, x1, z1, y0, y1, hex, draw = true) {
    if (draw) this.g.boxMin(x0, y0, z0, x1 - x0, y1 - y0, z1 - z0, hex);
    if (draw && y0 === 0) this.sh.rect(x0, z0, x1, z1, 0.004, y1 > 3 ? 0.3 : 0.18);
    this.boxes.push({ x0: x0 + this.ox, x1: x1 + this.ox, z0: z0 + this.oz, z1: z1 + this.oz, y0, y1 });
  }
  deco(x0, z0, x1, z1, y0, y1, hex) { this.g.boxMin(x0, y0, z0, x1 - x0, y1 - y0, z1 - z0, hex); }
  furn(type, x, z, rot, y = 0) {
    const it = { t: type, k: 'f', v: this.r.int(16), x: x + this.ox, y, z: z + this.oz, r: ((rot % 4) + 4) % 4 };
    // some screens are showing something
    if (type === 'tv' || type === 'wallTV' || type === 'curvedTV' || type === 'miniTV' || type === 'boxTV') it.s = this.r.chance(0.2) ? 1 + this.r.int(TV_CHANNELS) : 0;
    else if (type === 'arcadeCabinet') it.s = this.r.chance(0.6) ? 1 : 0;
    else if (type === 'pencilLamp' || type === 'globeLamp') it.s = this.r.chance(0.8) ? 1 + this.r.int(this.r.chance(0.15) ? 7 : 6) : 0;
    this.items.push(it);
    return it;
  }
  food(kind, x, z, y) { this.items.push({ t: kind, k: 'i', v: 0, x: x + this.ox, y, z: z + this.oz, r: this.r.int(4) }); }
  randomFood(x, z, y, stock = STOCK.any) {
    if (this.r.chance(0.03)) this.food('medkit', x, z, y);
    else this.food(this.r.pick(stock), x, z, y);
  }
  // Four times the food: every bit of food the layout puts down gets three
  // more of the same beside it, on the same surface (checked against this
  // chunk's walls, racks and furniture), so shelves and counters read as
  // stocked. The extras go on the end of the list, so the ids of everything
  // else stay the same, and their own random numbers don't move the layout.
  moreFood() {
    const r = rng(hashInts(this.w.seed, this.cx, this.cz, 77));
    const solids = this.boxes.slice();
    for (const it of this.items) {
      if (it.k !== 'f' || !Object.prototype.hasOwnProperty.call(TYPES, it.t) || TYPES[it.t].flat) continue;
      const parts = itemParts(it.t, it.r, it.tl, it.o, it.s);
      if (!parts) { solids.push(this.w.itemBox(it)); continue; }
      for (const [a, c, d, e, f, g] of parts) solids.push({ x0: it.x + a, x1: it.x + e, y0: it.y + c, y1: it.y + f, z0: it.z + d, z1: it.z + g });
    }
    // Where a bit of food sits: the surface under it, and whatever solid it's
    // inside (food on a rack shelf is inside the rack's block). A spot for an
    // extra has to sit exactly the same way: same surface, inside the same things.
    const where = (x, z, y) => {
      const g = 0.06; let top = 0; const inside = [];
      solids.forEach((b, i) => {
        if (b.x1 <= x - g || b.x0 >= x + g || b.z1 <= z - g || b.z0 >= z + g) return;
        if (b.y1 <= y + 0.02) { if (b.y1 > top) top = b.y1; }
        else if (b.y0 < y + 0.12) inside.push(i);
      });
      return { top, key: inside.join(',') };
    };
    const foods = this.items.filter((it) => it.k === 'i' && FOOD_SET.has(it.t));
    this.foodBase = foods.length; this.foodAdded = 0;
    for (const f of foods) {
      const home = where(f.x, f.z, f.y);
      for (let n = 0; n < 3; n++) for (let tries = 0; tries < 20; tries++) {
        const a = r() * Math.PI * 2, d = 0.14 + r() * (0.2 + tries * 0.04);
        const x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
        // not on top of another bit of food
        const gap = Math.max(ITEMS[f.t].w, ITEMS[f.t].d) * 0.5 + 0.03;
        if (this.items.some((o) => o.k === 'i' && Math.abs(o.y - f.y) < 0.1 && Math.hypot(o.x - x, o.z - z) < gap + Math.max(ITEMS[o.t].w, ITEMS[o.t].d) * 0.5)) continue;
        const w = where(x, z, f.y);
        if (Math.abs(w.top - home.top) > 0.025 || w.key !== home.key) continue;
        this.items.push({ t: f.t, k: 'i', v: 0, x, y: f.y, z, r: r.int(4) }); this.foodAdded++;
        break;
      }
    }
    return this;
  }
  // Furniture and food in a quadrant frame.
  ff(f, type, u, v, rot, y = 0) { const [x, z] = f.pt(u, v); return this.furn(type, x, z, rot + f.k, y); }
  fd(f, stock, u, v, y) { const [x, z] = f.pt(u, v); this.food(this.r.pick(stock), x, z, y); }
  fs(f, u0, v0, u1, v1, y0, y1, hex) { const [a, b, c, d] = f.rect(u0, v0, u1, v1); this.solid(a, b, c, d, y0, y1, hex); }

  run() {
    const { r } = this;
    // Pillars on a 12 m grid (a big grid pillar replaces the middle one).
    for (const px of [0, HALF]) for (const pz of [0, HALF]) {
      if (this.pillar && px === HALF && pz === HALF) continue;
      this.solid(px - 0.45, pz - 0.45, px + 0.45, pz + 0.45, 0, CEIL, PILLAR);
      this.deco(px - 0.47, pz - 0.47, px + 0.47, pz + 0.47, 0, 0.18, WALL_BASE);
      this.deco(px - 0.46, pz - 0.46, px + 0.46, pz + 0.46, 2.3, 2.6, parseInt(SECTIONS[this.section].color.slice(1), 16));
    }
    // Full-height walls along the chunk's north (z = 0) and west (x = 0) edges.
    const nearSpawn = Math.abs(this.cx) <= 1 && Math.abs(this.cz) <= 1;
    for (const axis of [0, 1]) {
      if (nearSpawn || this.section === 'warehouse' || this.section === 'food' || hashInts(this.w.seed, this.cx, this.cz, 20 + axis) % 100 >= 32) continue;
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
        if (axis === 0) { this.solid(a, -0.15, b, 0.15, 0, STORE_H, WALL); this.deco(a, -0.17, b, 0.17, 0, 0.15, WALL_BASE); }
        else { this.solid(-0.15, a, 0.15, b, 0, STORE_H, WALL); this.deco(-0.17, a, 0.17, b, 0, 0.15, WALL_BASE); }
      }
    }
    if (this.pillar) this.gridPillar();
    // whole-chunk layouts: a cafeteria hall, or a stretch of a warehouse street
    if (this.section === 'food') { this.bigCafeteria(); return this; }
    if (this.section === 'warehouse') { this.street(); return this; }
    for (const qx of [0, HALF]) for (const qz of [0, HALF]) {
      const f = frame(qx + QPAD, qz + QPAD, r.int(4));
      const roll = r();
      if (roll < 0.025 && this.section !== 'food') this.q_firstaid(f);
      else if (roll < 0.04 && this.section !== 'food') this.q_fort(f);
      else if (roll < 0.08 && this.section === 'showroom') this.q_play(f);
      else if (roll < 0.14 && this.section === 'storage') this.q_office(f);
      else if (roll < 0.06 && (this.section === 'display' || this.section === 'market' || this.section === 'warehouse')) this.q_mezzanine(f);
      else if (roll < 0.35 && this.section === 'market') this.q_snack(f);
      else if (this.section === 'showroom' || this.section === 'garden') this.room(f, this.section === 'garden' ? GARDEN_ROOMS : ROOMS);
      else this['q_' + this.section](f);
    }
    return this;
  }

  // What every grid pillar has, all the way up: the joints of the shuttering
  // it was cast in, a thicker band where the walls give out, a conduit and a
  // cable running up into the fog, struck corner guards at the bottom and a
  // caged lamp on each face that stays on all night.
  pillarDressing(c, w) {
    const o = w + 0.012;
    for (let y = 9.5; y < 120; y += 3.0 + (y > 40 ? 1.5 : 0)) this.deco(c - o, c - o, c + o, c + o, y, y + 0.045, P_JOINT);
    for (let y = 3.6; y < 6.4; y += 1.4) this.deco(c - o, c - o, c + o, c + o, y, y + 0.03, P_JOINT);
    this.deco(c - w - 0.07, c - w - 0.07, c + w + 0.07, c + w + 0.07, 6.35, 6.75, P_BAND);
    this.deco(c - w - 0.04, c - w - 0.04, c + w + 0.04, c + w + 0.04, 6.75, 6.82, P_JOINT);
    // conduit and cable up the east face, off to one side of the screen
    const fx = c + w, cz = c + 0.82;
    this.deco(fx, cz - 0.04, fx + 0.08, cz + 0.04, 0.22, 160, CONDUIT);
    this.deco(fx, cz + 0.13, fx + 0.035, cz + 0.165, 0.9, 160, CABLE);
    for (let y = 1.6; y < 70; y += 2.4) this.deco(fx, cz - 0.08, fx + 0.1, cz + 0.2, y, y + 0.05, CONDUIT);
    this.deco(fx, cz - 0.13, fx + 0.12, cz + 0.13, 0.75, 1.05, JBOX);
    // corner guards, hazard striped, up to 1.2 m
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = c + sx * w, z = c + sz * w;
      const ax = x - sx * 0.16, bx = x + sx * 0.02, az = z - sz * 0.16, bz = z + sz * 0.02;
      for (let i = 0; i < 8; i++) this.deco(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), 0.22 + i * 0.125, 0.22 + (i + 1) * 0.125, i % 2 ? HAZ_K : HAZ_Y);
    }
    // a caged lamp on each face, under the band
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const lx = c + nx * w, lz = c + nz * w, hx = nx ? 0 : 0.16, hz = nz ? 0 : 0.16;
      this.deco(Math.min(lx, lx + nx * 0.1) - hx, Math.min(lz, lz + nz * 0.1) - hz, Math.max(lx, lx + nx * 0.1) + hx, Math.max(lz, lz + nz * 0.1) + hz, 4.55, 4.85, LAMP_CAGE);
      const gx = lx + nx * 0.1, gz = lz + nz * 0.1, ex = nx ? 0 : 0.11, ez = nz ? 0 : 0.11;
      this.deco(Math.min(gx, gx + nx * 0.04) - ex, Math.min(gz, gz + nz * 0.04) - ez, Math.max(gx, gx + nx * 0.04) + ex, Math.max(gz, gz + nz * 0.04) + ez, 4.58, 4.82, LAMP_GLOW);
    }
  }

  // ---- Whole-chunk layouts ----
  // A big grid pillar in the middle of the chunk, 2.4 m square, with a screen
  // on each face (drawn with the visuals) and dressing for its type.
  gridPillar() {
    const { r } = this, P = this.pillar, c = HALF, w = 1.2;
    const CONC = PILLAR, BAND = 0x5a6370;
    if (P.type === 'cracked') {
      // a chunk knocked out of one face, the steel showing
      this.solid(c - w, c - w, c + w, c + w, 0, 1.2, CONC); this.solid(c - w, c - w, c + w, c + w, 2.3, CEIL, CONC);
      this.solid(c - w, c - w + 0.5, c + w, c + w, 1.2, 2.3, CONC);
      for (let i = 0; i < 4; i++) this.deco(c - w + 0.3 + i * 0.55, c - w + 0.1, c - w + 0.36 + i * 0.55, c - w + 0.5, 1.15, 2.35, 0x6b4a3a);
      this.deco(c - w + 0.1, c - w + 0.42, c + w - 0.1, c - w + 0.5, 1.2, 2.3, 0x9a9590);
      for (let i = 0; i < 5; i++) { const x = c + r.range(-1.6, 1.6), z = c - w - r.range(0.2, 1.0); this.deco(x - 0.12, z - 0.1, x + 0.12, z + 0.1, 0, 0.1, 0xb9b4ab); }
    } else this.solid(c - w, c - w, c + w, c + w, 0, CEIL, CONC);
    this.deco(c - w - 0.03, c - w - 0.03, c + w + 0.03, c + w + 0.03, 0, 0.22, WALL_BASE);
    this.pillarDressing(c, w);
    this.deco(c - w - 0.02, c - w - 0.02, c + w + 0.02, c + w + 0.02, 2.9, 3.1, P.type === 'lost' ? 0xc9a227 : BAND);
    // screen housings on all four faces (the pictures go on with the visuals)
    for (const [x0, z0, x1, z1] of [[c - 0.55, c + w, c + 0.55, c + w + 0.08], [c - 0.55, c - w - 0.08, c + 0.55, c - w], [c + w, c - 0.55, c + w + 0.08, c + 0.55], [c - w - 0.08, c - 0.55, c - w, c + 0.55]]) this.deco(x0, z0, x1, z1, 1.55, 2.25, 0x1b1d22);
    if (P.type === 'scaffold') {
      // being worked on: a rack of tools, a ladder against it, pallets and crates in the aisles
      this.furn('ladder', c, c + w + 0.35, 0); this.furn('wireRack', c, c - w - 0.4, 2);
      for (let j = 0; j < 3; j++) this.furn('pallet', c + w + 0.9, c, 1, j * 0.15);
      this.furn('crate', c - w - 0.7, c, 0); this.furn('box', c - w - 0.7, c, 0, 1.0);
      this.furn('workLight', c + 0.5, c + w + 1.3, 0); this.furn('toolbox', c - 0.6, c + w + 0.5, 0); this.furn('stepLadder', c - w - 2.0, c + 0.4, 1);
      this.deco(c - w - 0.06, c - w - 0.06, c + w + 0.06, c + w + 0.06, 3.6, 3.75, 0xe0a526);
    } else if (P.type === 'overgrown') {
      // planters and hedges lie along the aisles, not across them
      for (const [x, z, k] of [[c, c + w + 0.9, 1], [c, c - w - 0.9, 1], [c + w + 0.9, c, 0], [c - w - 0.9, c, 0]]) this.furn(r.chance(0.5) ? 'planter' : 'hedge', x, z, k);
      for (let i = 0; i < 14; i++) { const side = r.int(4), t = r.range(-w, w), y = r.range(0.3, 5.5), sz = r.range(0.25, 0.6); const x = side < 2 ? c + t : c + (side === 2 ? w : -w), z = side < 2 ? c + (side === 0 ? w : -w) : c + t; this.deco(x - sz / 2, z - sz / 2, x + sz / 2, z + sz / 2, y, y + sz, r.pick([0x3f7a3a, 0x4f8f45, 0x2f6a2f])); }
      for (let i = 0; i < 2; i++) this.furn('plant', c + (i ? 0.7 : -0.7), c + w + 0.4, 0);
    } else if (P.type === 'lost') {
      // the lost-property corner: boxes of things nobody came back for, and a few treats
      this.furn('toyChest', c, c + w + 0.45, 0); this.furn('crate', c + w + 0.6, c - 0.4, 0); this.furn('box', c + w + 0.6, c + 0.5, 0);
      this.furn('box', c - w - 0.5, c, 0); this.furn('box', c - w - 0.5, c, 0, 0.5); this.furn('floorLamp', c - 0.8, c + w + 0.4, 0);
      this.food('torch', c + w + 0.6, c - 0.4, 1.0); this.furn('giftBox', c + 0.6, c - w - 0.5, 0);
      this.food('chocolate', c - 0.3, c + w + 0.45, 0.6); this.food('medkit', c + 0.3, c + w + 0.45, 0.6); this.food('cinnamon', c, c + w + 0.45, 0.6);
    }
  }

  // A cafeteria hall across the whole chunk: one long serving counter heaped
  // with food (about fifty things and a first aid kit) and rows of tables.
  bigCafeteria() {
    const { r } = this, RED = 0x9c3d2e;
    for (const [x0, x1] of [[1.2, 11.2], [12.8, 22.8]]) {
      this.solid(x0, 1.0, x1, 1.9, 0, 1.0, RED);
      this.deco(x0 - 0.05, 0.95, x1 + 0.05, 1.95, 1.0, 1.05, 0xe8e2d6);
      this.deco(x0, 0.2, x1, 0.3, 0, 2.4, 0xd9cfc0); // the back wall of the servery
      this.deco(x0, 0.3, x1, 0.6, 1.4, 1.5, 0xb7b2ab); // a shelf above
      const n = 24 + r.int(5);
      for (let i = 0; i < n; i++) this.food(r.pick(STOCK.cafeteria), x0 + 0.3 + (i / n) * (x1 - x0 - 0.6) + r.range(-0.05, 0.05), r.range(1.2, 1.7), 1.05);
    }
    this.food('medkit', r.chance(0.5) ? 2.0 : 22.0, 1.45, 1.05);
    for (const x of [2.6, 6.8, 17.2, 21.4]) for (const z of [4.6, 8.4, 15.6, 19.4]) {
      this.furn('diningTable', x, z, 0);
      this.furn('chair', x - 0.5, z - 0.8, 0); this.furn('chair', x + 0.5, z - 0.8, 0);
      this.furn('chair', x - 0.5, z + 0.8, 2); if (r.chance(0.75)) this.furn('chair', x + 0.5, z + 0.8, 2);
      if (r.chance(0.15)) this.food(r.pick(STOCK.cafeteria), x + r.range(-0.4, 0.4), z, 0.77);
    }
    this.furn('plant', 11.2, 22.6, 0); this.furn('plant', 12.8, 22.6, 0); this.furn('trashCan', 0.6, 22.6, 0); this.furn('trashCan', 23.4, 22.6, 0); this.furn('stool', 9.0, 2.6, 0); this.furn('stool', 15.0, 2.6, 0);
  }

  // A stretch of a warehouse street: six rows of high racking along x, run
  // end to end with the neighbouring chunks of the street, pallets, crates and
  // ladders in the aisles.
  street() {
    const { r } = this, top = 4.4, deep = 1.2;
    for (const zc of [2.0, 5.6, 9.2, 14.8, 18.4, 22.0]) {
      const z0 = zc - deep / 2, z1 = zc + deep / 2, x0 = 0.05, x1 = CHUNK - 0.05;
      this.boxes.push({ x0: x0 + this.ox, x1: x1 + this.ox, z0: z0 + this.oz, z1: z1 + this.oz, y0: 0, y1: top, climb: true });
      this.sh.rect(x0, z0, x1, z1, 0.004, 0.3);
      for (let i = 0; i <= 10; i++) for (const zz of [z0, z1 - 0.1]) { const px = x0 + i * ((x1 - x0 - 0.1) / 10); this.deco(px, zz, px + 0.1, zz + 0.1, 0, top, RACK); }
      for (const y of [0.15, 1.55, 2.95, 4.3]) {
        this.deco(x0, z0, x1, z1, y - 0.08, y, RACK_BEAM);
        if (y > 4) continue;
        let p = 0.15;
        while (p < x1 - x0 - 0.6) {
          const bw = r.range(0.5, 1.2), bh = r.range(0.4, 1.2);
          if (r.chance(0.82)) this.deco(x0 + p, z0 + 0.1, x0 + p + bw, z1 - 0.1, y, y + bh, r.pick([0xc8a26e, 0xb8915c, 0xd2b07d, 0xe7e1d3, 0x9cb3c4]));
          p += bw + 0.08;
        }
      }
    }
    // loose stock in the aisles (the aisles run along x at z 3.8, 7.4, 16.6, 20.2)
    const n = 6 + r.int(6);
    for (let i = 0; i < n; i++) {
      const z = r.pick([3.8, 7.4, 16.6, 20.2]), x = 1 + r() * (CHUNK - 2), k = r();
      if (Math.abs(x - HALF) < 1.2 && this.pillar) continue;
      if (k < 0.35) { const st = 1 + r.int(3); for (let j = 0; j < st; j++) this.furn('pallet', x, z, 1, j * 0.15); }
      else if (k < 0.45) this.furn(r.chance(0.5) ? 'ladder' : 'stepLadder', x, z, 1);
      else if (k < 0.52) this.furn('metalCart', x, z, 1);
      else if (k < 0.58) this.furn(r.chance(0.6) ? 'workLight' : 'smallWorkLight', x, z, r.int(4));
      else if (k < 0.66) { this.furn('milkCrate', x, z, r.int(4)); if (r.chance(0.5)) this.furn('milkCrate', x, z, r.int(4), 0.3); }
      else if (k < 0.7) this.furn('toolbox', x, z, r.int(4));
      else if (k < 0.71) this.furn('safe', x, z, r.int(4));
      else this.furn(k < 0.85 ? r.pick(['box', 'smallBox', 'tinyBox']) : 'crate', x, z, r.int(4));
    }
    if (r.chance(0.3)) this.randomFood(1 + r() * 22, r.pick([3.8, 16.6]), 0);
  }

  // ---- Rooms ----
  // The three walls of a room display, its back wall painted a feature colour.
  walls(f) {
    const feature = this.r.pick([0x9fb39a, 0xc98f74, 0x5d7189, 0xe2cf96, 0xb7b2ab, 0x8a9e9a, 0xd9b4a8, 0x6f7f5c, PARTITION, PARTITION]);
    this.fs(f, 0, 0, Q, 0.12, 0, 2.6, feature);
    { const [a, b, c, d] = f.rect(0, 0, Q, 0.16); this.deco(a, b, c, d, 2.6, 2.7, 0x8a857b); }
    this.fs(f, 0, 0.12, 0.12, 6.2, 0, 2.6, PARTITION);
    this.fs(f, Q - 0.12, 0.12, Q, 6.2, 0, 2.6, PARTITION);
  }
  // Pick a room by weight and build it.
  room(f, list) {
    const forced = this.w.forceRoom && list.find((rm) => rm.name === this.w.forceRoom);
    let rm = forced;
    if (!rm) {
      let total = 0; for (const x of list) total += x.w;
      let t = this.r() * total;
      for (const x of list) { t -= x.w; if (t <= 0) { rm = x; break; } }
      rm = rm || list[0];
    }
    if (!rm.open) this.walls(f);
    this.roomName = rm.name;
    rm.build(this, f, this.r);
    const extra = ROOM_EXTRAS[rm.name];
    if (extra) extra(this, f, this.r);
  }

  q_display(f) {
    const { r } = this;
    const pick = r.pick([
      ['sofa', 2.8, 2.4], ['armchair', 1.7, 1.8], ['bedSingle', 1.8, 3.0], ['bedDouble', 2.4, 3.1], ['wardrobe', 1.9, 1.6],
      ['bookshelf', 1.4, 1.4], ['diningTable', 2.6, 2.4], ['dresser', 1.7, 1.5], ['desk', 2.0, 1.8], ['shelfCube', 2.2, 1.6], ['counter', 1.5, 1.6], ['floorLamp', 1.2, 1.2], ['bunkBed', 1.6, 2.6], ['tv', 1.6, 1.2], ['beanbag', 1.3, 1.3], ['filingCabinet', 1.8, 2.2],
      ['queenBed', 2.6, 3.2], ['loveseat', 2.0, 1.8], ['roundTable', 1.8, 1.8], ['modernShelf', 1.4, 1.4], ['metalLamp', 1.2, 1.2], ['plushBear', 1.2, 1.2],
      ['closet', 2.2, 1.6], ['cafeChair', 1.0, 1.0], ['standingDesk', 2.0, 1.8], ['arcLamp', 1.8, 1.4], ['boxTV', 1.2, 1.2], ['fancyShelf', 1.4, 1.4],
      ['sofaModule', 1.2, 1.6], ['drawerUnit', 1.0, 1.0], ['curvedTV', 1.8, 1.2], ['miniTV', 1.0, 1.0], ['boxTV', 1.2, 1.2], ['tripleLamp', 1.2, 1.2], ['modernLamp', 1.2, 1.2], ['thinLight', 1.0, 1.0], ['picnicTable', 2.4, 2.4], ['trashCan', 1.0, 1.0], ['flowerPot', 1.0, 1.0],
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
        else this.ff(f, r.pick(['tableLamp', 'warmTableLamp', 'colourLamp', 'nightLight', 'pencilLamp', 'globeLamp', 'deskLamp', 'lantern', 'candle', 'flowerPot', 'plant', 'box', 'smallBox', 'puzzleCube', 'toaster', 'toyRobot', 'toyCar']), u, v, r.int(4), 0.86);
      }
    }
    for (let i = 0; i < 2; i++) this.ff(f, r.pick(['plant', 'floorLamp', 'box', 'stool']), r.range(0.6, Q - 0.6), r.pick([3.2, 7.6]), r.int(4));
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
    this.ff(f, 'plant', 8.9, 9.0, 0); this.ff(f, 'lockers', 7.6, 9.0, 2); this.ff(f, 'trashCan', 9.0, 5.4, 0); if (r.chance(0.5)) this.ff(f, 'standingDesk', 8.4, 3.0, 3);
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
      this.ff(f, r.pick(['crate', 'crate', 'box', 'box', 'smallBox', 'tinyBox', 'milkCrate', 'toolbox']), u, v, 0);
    }
    if (r.chance(0.4)) this.ff(f, 'lockers', 0.4, 4.8, 1);
    if (r.chance(0.3)) this.ff(f, 'metalWardrobe', 9.0, 4.8, 3);
    if (r.chance(0.25)) this.ff(f, 'metalCart', 4.8, 9.0, 0);
    if (r.chance(0.06)) { const [x, z] = f.pt(r.range(1, 8), r.range(1, 8)); this.food('torch', x, z, 0); }
    if (r.chance(0.2)) { const [x, z] = f.pt(r.range(1, 8), r.range(1, 8)); this.randomFood(x, z, 0); }
  }
}

// ---- Room types ----
// Each is a quadrant (Q x Q, back wall at v = 0, open towards +v). w is how
// common it is. Showrooms pick from ROOMS, garden centres from GARDEN_ROOMS.
const lamp = (g, f, u, v, y = 0) => g.ff(f, 'tableLamp', u, v, 0, y);
export const ROOMS = [
  { name: 'living room', w: 8, build(g, f, r) {
    g.ff(f, 'rug', 4.8, 3.0, 0); g.ff(f, 'sofa', 4.8, 0.75, 0); g.ff(f, 'coffeeTable', 4.8, 2.4, 0);
    g.ff(f, 'armchair', 1.4, 2.8, 1); g.ff(f, 'tvStand', 4.8, 5.0, 2); g.ff(f, 'tv', 4.8, 5.0, 2, 0.5); g.ff(f, 'bookshelf', 8.6, 0.4, 0);
    g.ff(f, 'sideTable', 2.0, 0.6, 0); lamp(g, f, 2.0, 0.6, 0.55); g.ff(f, 'floorLamp', 2.8, 0.5, 0); g.ff(f, 'plant', 0.7, 0.7, 0);
    if (r.chance(0.6)) g.ff(f, 'armchair', 8.2, 3.0, 3);
  } },
  { name: 'modern living room', w: 6, build(g, f, r) {
    g.ff(f, 'cornerSofa', 1.6, 1.6, 0); g.ff(f, 'rug', 4.4, 3.4, 0); g.ff(f, 'coffeeTable', 4.0, 3.2, 1); g.ff(f, 'ottoman', 5.6, 2.4, 0);
    g.ff(f, 'tvStand', 8.9, 3.4, 3); g.ff(f, 'tv', 8.9, 3.4, 3, 0.5); g.ff(f, 'floorLamp', 8.8, 0.6, 0); g.ff(f, 'plant', 6.6, 0.6, 0); g.ff(f, 'shelfCube', 4.8, 0.32, 0);
  } },
  { name: 'tv lounge', w: 5, build(g, f, r) {
    g.ff(f, 'tvStand', 4.8, 0.35, 0); g.ff(f, 'tv', 4.8, 0.35, 0, 0.5); g.ff(f, 'rug', 4.8, 3.2, 0);
    g.ff(f, 'sofa', 4.8, 4.6, 2); g.ff(f, 'beanbag', 2.4, 2.6, 1); g.ff(f, 'beanbag', 7.2, 2.6, 3); g.ff(f, 'sideTable', 2.8, 4.6, 0); lamp(g, f, 2.8, 4.6, 0.55);
    g.ff(f, 'floorLamp', 8.8, 0.6, 0); g.ff(f, 'plant', 0.7, 0.6, 0);
  } },
  { name: 'study', w: 3, build(g, f, r) {
    for (const u of [0.6, 1.6, 2.6]) g.ff(f, 'bookshelf', u, 0.4, 0);
    g.ff(f, 'desk', 6.0, 0.45, 0); g.ff(f, 'officeChair', 6.0, 1.3, 2); lamp(g, f, 6.5, 0.4, 0.75); g.ff(f, 'armchair', 2.2, 2.8, 0); g.ff(f, 'sideTable', 3.3, 2.8, 0);
    g.ff(f, 'rug', 4.8, 3.0, 0); g.ff(f, 'floorLamp', 8.8, 0.5, 0); g.ff(f, 'plant', 8.8, 3.0, 0);
  } },
  { name: 'dining room', w: 6, build(g, f, r) {
    g.ff(f, 'rug', 4.8, 3.2, 0); g.ff(f, 'diningTable', 4.8, 3.2, 0);
    for (const du of [-0.5, 0.5]) { g.ff(f, 'chair', 4.8 + du, 2.4, 0); g.ff(f, 'chair', 4.8 + du, 4.0, 2); }
    g.ff(f, 'chair', 3.7, 3.2, 1); g.ff(f, 'chair', 5.9, 3.2, 3); g.ff(f, 'cabinet', 1.4, 0.3, 0); g.ff(f, 'cabinet', 8.2, 0.3, 0); g.ff(f, 'standingMirror', 4.8, 0.3, 0);
    g.ff(f, 'plant', 0.6, 5.6, 0); if (r.chance(0.3)) g.fd(f, STOCK.kitchen, 4.6, 3.2, 0.75);
  } },
  { name: 'kitchen', w: 4, build(g, f, r) {
    for (let i = 0; i < 3; i++) g.ff(f, 'counter', 0.8 + i * 1.22, 0.42, 0);
    g.ff(f, 'stove', 4.5, 0.42, 0); g.ff(f, 'fridge', 5.75, 0.5, 0); g.ff(f, 'diningTable', 5.6, 4.4, 0);
    g.ff(f, 'chair', 5.1, 3.6, 0); g.ff(f, 'chair', 6.1, 3.6, 0); g.ff(f, 'chair', 5.1, 5.2, 2); g.ff(f, 'chair', 6.1, 5.2, 2);
    g.ff(f, 'cabinet', 8.6, 0.4, 0); for (let i = 0, n = r.int(3); i < n; i++) g.fd(f, STOCK.kitchen, 0.6 + i * 1.2 + r.range(0, 0.6), 0.4, 0.9);
  } },
  { name: 'island kitchen', w: 3, build(g, f, r) {
    for (let i = 0; i < 5; i++) g.ff(f, i === 2 ? 'stove' : i === 4 ? 'sink' : 'counter', 1.0 + i * 1.25, 0.42, 0);
    g.ff(f, 'fridge', 8.5, 0.5, 0); g.ff(f, 'kitchenIsland', 4.4, 3.0, 0);
    for (const u of [3.6, 4.4, 5.2]) g.ff(f, 'barStool', u, 3.95, 2);
    if (r.chance(0.6)) g.fd(f, STOCK.kitchen, 4.0 + r.range(0, 0.8), 3.0, 0.9);
    g.ff(f, 'plant', 0.6, 5.6, 0);
  } },
  { name: 'compact kitchen', w: 3, build(g, f, r) {
    g.ff(f, 'counter', 1.0, 0.42, 0); g.ff(f, 'stove', 2.25, 0.42, 0); g.ff(f, 'sink', 3.5, 0.42, 0); g.ff(f, 'fridge', 4.75, 0.5, 0);
    g.ff(f, 'diningTable', 7.2, 3.0, 1); g.ff(f, 'stool', 6.6, 2.4, 0); g.ff(f, 'stool', 7.8, 3.6, 0);
    for (let i = 0, n = 1 + r.int(2); i < n; i++) g.fd(f, STOCK.kitchen, 0.8 + i * 0.5, 0.4, 0.9);
  } },
  { name: 'master bedroom', w: 6, build(g, f, r) {
    g.ff(f, 'bedDouble', 4.8, 1.25, 0); g.ff(f, 'nightstand', 3.5, 0.35, 0); lamp(g, f, 3.5, 0.35, 0.6); g.ff(f, 'nightstand', 6.1, 0.35, 0); lamp(g, f, 6.1, 0.35, 0.6);
    g.ff(f, 'wardrobe', 8.4, 0.58, 0); g.ff(f, 'dresser', 1.2, 0.45, 0); g.ff(f, 'rug', 4.8, 3.6, 0); g.ff(f, 'standingMirror', 0.5, 2.6, 1);
    g.ff(f, 'plant', 0.7, 4.8, 0); if (r.chance(0.5)) g.ff(f, 'armchair', 8.3, 3.4, 3);
  } },
  { name: 'guest bedroom', w: 4, build(g, f, r) {
    g.ff(f, 'bedSingle', 2.0, 1.1, 0); g.ff(f, 'nightstand', 3.1, 0.35, 0); lamp(g, f, 3.1, 0.35, 0.6); g.ff(f, 'dresser', 6.0, 0.45, 0);
    g.ff(f, 'wardrobe', 8.4, 0.58, 0); g.ff(f, 'rug', 3.0, 3.2, 1); g.ff(f, 'coatRack', 8.9, 3.0, 0); g.ff(f, 'plant', 0.7, 4.6, 0);
  } },
  { name: 'kids room', w: 4, build(g, f, r) {
    g.ff(f, 'bunkBed', 0.75, 1.1, 0); g.ff(f, 'shelfCube', 3.4, 0.32, 0); g.ff(f, 'toyChest', 5.0, 0.4, 0); g.ff(f, 'mattress', 7.6, 3.4, 0);
    g.ff(f, 'rug', 4.6, 4.0, 1); g.ff(f, 'beanbag', 6.0, 2.6, 1); g.ff(f, 'stool', 3.4, 4.2, 0); lamp(g, f, 3.4, 0.32, 1.5);
    if (r.chance(0.5)) for (let i = 0, n = 1 + r.int(2); i < n; i++) g.fd(f, ['crackers', 'apple', 'cookie', 'pizza'].filter((k) => k in ITEMS), 4.0 + i * 0.4, 4.2, 0);
  } },
  { name: 'teen room', w: 3, build(g, f, r) {
    g.ff(f, 'bedSingle', 1.0, 1.1, 0); g.ff(f, 'desk', 4.4, 0.45, 0); g.ff(f, 'officeChair', 4.4, 1.3, 2); g.ff(f, 'tv', 4.4, 0.35, 0, 0.75);
    g.ff(f, 'beanbag', 6.8, 2.8, 2); g.ff(f, 'shelfCube', 8.4, 0.32, 0); g.ff(f, 'rug', 5.6, 3.2, 0); g.ff(f, 'floorLamp', 8.9, 2.0, 0);
  } },
  { name: 'nursery', w: 2, build(g, f, r) {
    g.ff(f, 'crib', 2.2, 0.85, 0); g.ff(f, 'crib', 4.6, 0.85, 0); g.ff(f, 'dresser', 7.2, 0.45, 0); g.ff(f, 'armchair', 7.6, 3.2, 3);
    g.ff(f, 'rug', 4.0, 3.2, 0); g.ff(f, 'toyChest', 2.0, 3.6, 1); lamp(g, f, 7.2, 0.45, 0.85);
  } },
  { name: 'bunk bed showcase', w: 2, build(g, f, r) {
    for (const u of [0.75, 2.6, 4.45, 6.3, 8.15]) g.ff(f, 'bunkBed', u, 1.1, 0);
    g.ff(f, 'rug', 4.8, 4.0, 0); g.ff(f, 'box', 3.0, 3.6, 0); g.ff(f, 'box', 6.4, 3.8, 0);
  } },
  { name: 'walk-in wardrobe', w: 2, build(g, f, r) {
    for (const u of [0.7, 2.0, 3.3]) g.ff(f, 'wardrobe', u, 0.58, 0);
    g.ff(f, 'wardrobe', 0.58, 3.0, 1); g.ff(f, 'shoeRack', 6.0, 0.3, 0); g.ff(f, 'standingMirror', 8.6, 0.4, 0); g.ff(f, 'ottoman', 5.4, 2.8, 0); g.ff(f, 'coatRack', 8.8, 3.0, 0);
  } },
  { name: 'bathroom', w: 5, build(g, f, r) {
    g.ff(f, 'bathtub', 1.2, 0.5, 0); g.ff(f, 'toilet', 3.4, 0.45, 0); g.ff(f, 'sink', 4.8, 0.32, 0); g.ff(f, 'sink', 5.9, 0.32, 0);
    g.ff(f, 'standingMirror', 7.2, 0.3, 0); g.ff(f, 'plant', 8.9, 0.6, 0); g.ff(f, 'rug', 3.0, 2.2, 0); g.ff(f, 'shelfCube', 8.6, 2.6, 3);
  } },
  { name: 'home office', w: 4, build(g, f, r) {
    g.ff(f, 'desk', 2.6, 0.45, 0); g.ff(f, 'officeChair', 2.6, 1.3, 2); g.ff(f, 'desk', 6.6, 0.45, 0); g.ff(f, 'officeChair', 6.6, 1.3, 2);
    g.ff(f, 'whiteboard', 0.42, 3.0, 1); g.ff(f, 'filingCabinet', 9.2, 2.6, 3); g.ff(f, 'lockers', 9.2, 4.4, 3); g.ff(f, 'rug', 4.6, 3.4, 0);
    lamp(g, f, 3.0, 0.4, 0.75); if (r.chance(0.08)) g.ff(f, 'safe', 4.6, 0.4, 0);
  } },
  { name: 'library', w: 3, build(g, f, r) {
    for (let i = 0; i < 8; i++) g.ff(f, 'bookshelf', 0.6 + i * 1.18, 0.4, 0);
    g.ff(f, 'bookshelf', 0.4, 2.4, 1); g.ff(f, 'bookshelf', 9.2, 2.4, 3); g.ff(f, 'diningTable', 4.8, 3.4, 0);
    for (const u of [4.3, 5.3]) { g.ff(f, 'chair', u, 2.6, 0); g.ff(f, 'chair', u, 4.2, 2); } lamp(g, f, 4.8, 3.4, 0.75); g.ff(f, 'armchair', 1.8, 4.6, 1);
  } },
  { name: 'bar', w: 2, build(g, f, r) {
    g.ff(f, 'barCounter', 4.8, 1.4, 0); for (const u of [3.4, 4.3, 5.2, 6.1]) g.ff(f, 'barStool', u, 2.2, 2);
    g.ff(f, 'cabinet', 2.0, 0.3, 0); g.ff(f, 'fridge', 7.4, 0.5, 0); g.ff(f, 'shelfCube', 4.8, 0.32, 0);
    g.ff(f, 'patioTable', 2.2, 4.6, 0); g.ff(f, 'patioTable', 7.4, 4.6, 0); g.ff(f, 'barStool', 1.4, 4.6, 0); g.ff(f, 'barStool', 6.6, 4.6, 0);
    if (r.chance(0.5)) g.fd(f, ['soda', 'bigsoda', 'water', 'chips'], 4.4, 1.4, 1.05);
  } },
  { name: 'games room', w: 2, build(g, f, r) {
    g.ff(f, 'billiardsTable', 4.0, 3.2, 1); g.ff(f, 'arcadeCabinet', 7.4, 0.45, 0); g.ff(f, 'arcadeCabinet', 8.4, 0.45, 0);
    g.ff(f, 'coatRack', 0.6, 0.6, 0); g.ff(f, 'barStool', 8.6, 3.0, 0); g.ff(f, 'barStool', 8.6, 4.2, 0); g.ff(f, 'floorLamp', 1.0, 5.4, 0);
  } },
  { name: 'music room', w: 1.5, build(g, f, r) {
    g.ff(f, 'piano', 3.0, 0.4, 0); g.ff(f, 'stool', 3.0, 1.2, 0); g.ff(f, 'sofa', 6.4, 4.2, 2); g.ff(f, 'rug', 4.8, 3.0, 0);
    g.ff(f, 'bookshelf', 8.6, 0.4, 0); g.ff(f, 'floorLamp', 0.6, 0.6, 0); g.ff(f, 'plant', 0.6, 4.6, 0);
  } },
  { name: 'entrance hall', w: 3, build(g, f, r) {
    g.ff(f, 'door', 2.4, 0.18, 0); g.ff(f, 'door', 7.2, 0.18, 0); g.ff(f, 'coatRack', 4.2, 0.4, 0); g.ff(f, 'shoeRack', 5.4, 0.3, 0);
    g.ff(f, 'standingMirror', 0.4, 2.4, 1); g.ff(f, 'bench', 8.9, 2.6, 3); g.ff(f, 'rug', 4.8, 2.6, 0); g.ff(f, 'plant', 0.6, 5.4, 0);
  } },
  { name: 'door display', w: 1.5, build(g, f, r) {
    for (let i = 0; i < 6; i++) g.ff(f, 'door', 0.9 + i * 1.55, 0.2 + (i % 2) * 2.2, 0);
    g.ff(f, 'plant', 8.9, 5.0, 0);
  } },
  { name: 'lighting display', w: 2, build(g, f, r) {
    for (let i = 0; i < 6; i++) g.ff(f, 'floorLamp', 0.8 + i * 1.6, 0.6, 0);
    for (let i = 0; i < 3; i++) { g.ff(f, 'sideTable', 2.0 + i * 2.8, 3.2, 0); lamp(g, f, 2.0 + i * 2.8, 3.2, 0.55); }
    g.ff(f, 'rug', 4.8, 4.8, 0);
  } },
  { name: 'rug gallery', w: 2, build(g, f, r) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) g.ff(f, 'rug', 2.4 + i * 4.8, 1.2 + j * 1.8, j % 2);
    g.ff(f, 'ottoman', 4.8, 5.6, 0);
  } },
  { name: 'mannequin showcase', w: 0.5, build(g, f, r) {
    for (let i = 0; i < 5; i++) g.ff(f, 'mannequin', 1.2 + i * 1.8, 0.8 + (i % 2) * 0.8, 0);
    g.ff(f, 'standingMirror', 0.4, 3.4, 1); g.ff(f, 'coatRack', 9.0, 3.4, 0); g.ff(f, 'shoeRack', 4.8, 3.6, 2);
  } },
  { name: 'information desk', w: 1, build(g, f, r) {
    g.fs(f, 2.8, 2.0, 6.8, 2.8, 0, 1.05, 0x34495e); const [a, b, c, d] = f.rect(2.75, 1.95, 6.85, 2.85); g.deco(a, b, c, d, 1.05, 1.1, 0xe8e2d6);
    for (const u of [2.6, 4.0, 5.6, 7.0]) g.ff(f, 'barStool', u, 3.6, 2); g.ff(f, 'officeChair', 4.8, 1.3, 0); g.ff(f, 'whiteboard', 4.8, 0.42, 0); g.ff(f, 'plant', 0.6, 0.6, 0);
  } },
];

export const GARDEN_ROOMS = [
  { name: 'garden', w: 4, open: true, build(g, f) { g.q_garden(f); } },
  { name: 'patio', w: 5, open: true, build(g, f, r) {
    { const [a, b, c, d] = f.rect(0.4, 0.4, Q - 0.4, Q - 0.4); g.deco(a, b, c, d, 0, 0.03, 0xb8b0a2); }
    g.ff(f, 'patioTable', 3.2, 3.2, 0); g.ff(f, 'patioUmbrella', 3.2, 3.2, 0); for (const [u, v, k] of [[2.4, 3.2, 1], [4.0, 3.2, 3], [3.2, 2.4, 0], [3.2, 4.0, 2]]) g.ff(f, 'chair', u, v, k);
    g.ff(f, 'planter', 7.6, 1.0, 0); g.ff(f, 'planter', 7.6, 7.6, 0); g.ff(f, 'bench', 7.0, 4.6, 3); g.ff(f, 'hedge', 0.8, 8.6, 0); g.ff(f, 'hedge', 2.4, 8.6, 0);
  } },
  { name: 'backyard', w: 4, open: true, build(g, f, r) {
    { const [a, b, c, d] = f.rect(0, 0, Q, Q); g.deco(a, b, c, d, 0, 0.02, 0x5e8a3a); }
    g.ff(f, 'firePit', 4.8, 4.8, 0); for (const [u, v, k] of [[4.8, 3.2, 0], [4.8, 6.4, 2], [3.2, 4.8, 1], [6.4, 4.8, 3]]) g.ff(f, 'bench', u, v, k);
    for (let i = 0; i < 5; i++) g.ff(f, 'hedge', 0.8 + i * 2.0, 0.6, 0); g.ff(f, 'planter', 8.6, 8.6, 0); g.ff(f, 'patioUmbrella', 1.6, 8.0, 0);
  } },
  { name: 'pergola lounge', w: 3, open: true, build(g, f, r) {
    { const [a, b, c, d] = f.rect(1.6, 1.6, 8.0, 8.0); g.deco(a, b, c, d, 0, 0.03, 0xa89a86); }
    g.ff(f, 'pergola', 4.8, 4.8, 0); g.ff(f, 'sofa', 4.8, 4.0, 0); g.ff(f, 'coffeeTable', 4.8, 5.2, 0); g.ff(f, 'planter', 1.0, 1.0, 0); g.ff(f, 'planter', 8.6, 1.0, 0);
    g.ff(f, 'floorLamp', 8.4, 8.4, 0);
  } },
  { name: 'greenhouse', w: 2, open: true, build(g, f, r) {
    { const [a, b, c, d] = f.rect(0, 0, Q, Q); g.deco(a, b, c, d, 0, 0.02, 0x7a6a52); }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.ff(f, 'planter', 1.6 + i * 3.2, 2.0 + j * 4.2, 1);
    for (let i = 0; i < 4; i++) g.ff(f, 'plant', 0.7 + i * 2.6, 9.0, 0);
    // a broken pane: glass on the floor
    if ('glass' in ITEMS) for (let i = 0; i < 4; i++) g.fd(f, ['glass'], 4.0 + r.range(-1.5, 1.5), 4.0 + r.range(-1.2, 1.2), 0);
  } },
  { name: 'hedge garden', w: 2, open: true, build(g, f, r) {
    { const [a, b, c, d] = f.rect(0, 0, Q, Q); g.deco(a, b, c, d, 0, 0.02, 0x5e8a3a); }
    for (let i = 0; i < 4; i++) { g.ff(f, 'hedge', 1.0 + i * 1.6, 2.0, 0); g.ff(f, 'hedge', 3.4 + i * 1.6, 6.2, 0); }
    g.ff(f, 'bench', 8.2, 4.0, 3); g.ff(f, 'planter', 1.0, 8.6, 0);
  } },
];

// The smaller things in each room: pictures, lamps, appliances, toys.
const pic = (g, f, r, u) => g.ff(f, r.pick(['painting', 'painting', 'tallPainting', 'wallArt']), u, 0.15, 0); // leaning on the back wall
const ROOM_EXTRAS = {
  'living room': (g, f, r) => { if (r.chance(0.4)) g.ff(f, 'wallTV', 4.8, 0.17, 0, 1.2); pic(g, f, r, 6.6); g.ff(f, 'flowerPot', 9.0, 2.2, 0); if (r.chance(0.3)) { g.ff(f, 'sideTable', 8.9, 4.0, 0); g.ff(f, 'recordPlayer', 8.9, 4.0, 0, 0.55); } },
  'modern living room': (g, f, r) => { g.ff(f, 'modernLamp', 6.4, 0.5, 0); g.ff(f, 'arcLamp', 3.0, 4.6, 0); g.ff(f, 'wallArt', 3.6, 0.15, 0); if (r.chance(0.5)) g.ff(f, 'sofaModule', 6.8, 4.4, 2); },
  'tv lounge': (g, f, r) => { if (r.chance(0.4)) g.ff(f, 'boxTV', 7.4, 0.4, 0); else g.ff(f, 'curvedTV', 7.6, 0.2, 0, 1.2); g.ff(f, 'thinLight', 0.4, 4.6, 1); g.ff(f, 'puzzleCube', 4.6, 3.2, 0); },
  'study': (g, f, r) => { g.ff(f, 'warmTableLamp', 3.3, 2.8, 0, 0.55); g.ff(f, 'smallBookcase', 4.0, 0.25, 0); g.ff(f, 'deskLamp', 5.5, 0.4, 0, 0.75); pic(g, f, r, 7.6); g.ff(f, 'lantern', 3.3, 2.8, 0, 0.55); },
  'dining room': (g, f, r) => { g.ff(f, 'ceilingLamp', 4.8, 3.2, 0, STORE_H - 1.2); pic(g, f, r, 3.2); pic(g, f, r, 6.4); g.ff(f, 'candle', 4.8, 3.2, 0, 0.75); g.ff(f, 'flowerPot', 9.0, 5.6, 0); },
  'kitchen': (g, f, r) => { g.ff(f, 'ceilingLamp', 5.6, 4.4, 0, STORE_H - 1.2); g.ff(f, 'microwave', 1.4, 0.35, 0, 0.9); g.ff(f, 'toaster', 2.4, 0.35, 0, 0.9); g.ff(f, 'trashCan', 7.4, 0.4, 0); },
  'island kitchen': (g, f, r) => { g.ff(f, 'toaster', 1.0, 0.35, 0, 0.9); g.ff(f, 'microwave', 3.8, 0.35, 0, 0.9); g.ff(f, 'trashCan', 9.0, 2.0, 0); },
  'compact kitchen': (g, f, r) => { g.ff(f, 'microwave', 1.0, 0.35, 0, 0.9); g.ff(f, 'milkCrate', 6.0, 0.4, 0); },
  'master bedroom': (g, f, r) => { g.ff(f, 'warmTableLamp', 1.2, 0.45, 0, 0.85); g.ff(f, 'nightLight', 6.6, 0.15, 0); pic(g, f, r, 2.2); g.ff(f, 'roundMirror', 7.2, 0.15, 0); g.ff(f, 'drawerUnit', 0.5, 4.0, 1); },
  'guest bedroom': (g, f, r) => { g.ff(f, 'nightLight', 0.4, 2.4, 1); g.ff(f, 'miniTvStand', 8.6, 3.2, 3); g.ff(f, 'miniTV', 8.6, 3.2, 3, 0.45); pic(g, f, r, 4.6); g.ff(f, 'candle', 6.3, 0.45, 0, 0.85); },
  'kids room': (g, f, r) => { if (r.chance(0.5)) g.ff(f, 'curvedTV', 6.4, 0.2, 0, 1.2); g.ff(f, 'nightLight', 9.4, 4.0, 3); g.ff(f, 'pencilLamp', 3.0, 0.32, 0, 1.5); g.ff(f, 'plushBear', 8.6, 1.0, 3); g.ff(f, 'playTable', 2.6, 4.6, 0); g.ff(f, 'toyRobot', 2.4, 4.6, 0, 0.5); g.ff(f, 'toyCar', 4.4, 3.4, r.int(4)); if (r.chance(0.5)) g.ff(f, 'foamDice', 6.8, 4.6, 0); },
  'teen room': (g, f, r) => { g.ff(f, 'tripleLamp', 2.6, 4.4, 0); g.ff(f, 'globeLamp', 8.4, 0.32, 0, 1.5); g.ff(f, 'wallTV', 7.6, 0.17, 0, 1.3); g.ff(f, 'miniTV', 8.4, 0.32, 0, 1.0); g.ff(f, 'wallShelf', 6.6, 0.26, 0, 1.4); g.ff(f, 'lightStrip', 4.4, 0.16, 0, 1.6).s = 1 + r.int(6); g.ff(f, 'puzzleCube', 3.85, 0.6, 0, 0.75); },
  'nursery': (g, f, r) => { g.ff(f, 'nightLight', 3.4, 0.15, 0); g.ff(f, 'globeLamp', 7.2, 0.45, 0, 0.85); g.ff(f, 'plushBear', 6.4, 4.6, 2); g.ff(f, 'flowerPot', 0.6, 0.6, 0); },
  'walk-in wardrobe': (g, f, r) => { g.ff(f, 'closet', 6.0, 4.6, 2); g.ff(f, 'wideMirror', 4.6, 0.15, 0); },
  'bathroom': (g, f, r) => { g.ff(f, 'wallLight', 7.2, 0.23, 0, 1.8); g.ff(f, 'wideMirror', 5.4, 0.15, 0, 1.0); g.ff(f, 'trashCan', 2.4, 0.4, 0); g.ff(f, 'welcomeMat', 6.4, 2.6, 0); },
  'home office': (g, f, r) => { g.ff(f, 'standingDesk', 4.6, 4.6, 2); g.ff(f, 'deskLamp', 6.2, 0.4, 0, 0.75); g.ff(f, 'trashCan', 1.0, 0.5, 0); g.ff(f, 'metalCart', 8.2, 0.4, 0); },
  'library': (g, f, r) => { g.ff(f, 'wallLight', 0.23, 4.0, 1, 1.7); g.ff(f, 'wallLight', 9.37, 4.0, 3, 1.7); g.ff(f, 'woodenShelf', 0.5, 4.6, 1); g.ff(f, 'lantern', 4.4, 3.4, 0, 0.75); g.ff(f, 'smallBookcase', 9.2, 4.6, 3); },
  'bar': (g, f, r) => { const c = 1 + r.int(6); for (const u of [3.8, 5.8]) g.ff(f, 'lightStrip', u, 1.1, 0, 1.1).s = c; g.ff(f, 'barTable', 4.8, 4.6, 0); g.ff(f, 'recordPlayer', 2.0, 0.3, 0, 1.0); },
  'games room': (g, f, r) => { g.ff(f, 'foamDice', 2.0, 1.4, r.int(4)); g.ff(f, 'bigButton', 8.6, 3.6, 0, 0.78); g.ff(f, 'boxTV', 1.4, 0.4, 0); for (const u of [3.4, 4.6, 5.8]) g.ff(f, 'lightStrip', u, 0.12, 0, 2.2).s = 1 + r.int(6); },
  'music room': (g, f, r) => { g.ff(f, 'sideTable', 7.4, 0.4, 0); g.ff(f, 'recordPlayer', 7.4, 0.4, 0, 0.55); pic(g, f, r, 5.6); },
  'entrance hall': (g, f, r) => { g.ff(f, 'welcomeMat', 2.4, 0.8, 0); g.ff(f, 'welcomeMat', 7.2, 0.8, 0); g.ff(f, 'roundMirror', 4.8, 0.15, 0, 0.9); g.ff(f, 'flowerPot', 9.0, 0.6, 0); },
  'lighting display': (g, f, r) => {
    for (const [u, k] of [[1.6, 'tripleLamp'], [4.8, 'modernLamp'], [8.0, 'thinLight']]) g.ff(f, k, u, 2.2, 0);
    g.ff(f, 'ceilingLamp', 3.2, 3.2, 0, STORE_H - 1.2); g.ff(f, 'ceilingLamp', 6.4, 3.2, 0, STORE_H - 1.2); g.ff(f, 'wallLight', 0.23, 3.0, 1, 1.7); g.ff(f, 'wallLight', 9.37, 3.0, 3, 1.7);
    g.ff(f, 'smallWorkLight', 0.6, 5.0, 1); g.ff(f, 'nightLight', 9.2, 5.6, 3); g.ff(f, 'metalLamp', 0.8, 5.6, 0); g.ff(f, 'arcLamp', 3.0, 5.6, 0); g.ff(f, 'workLight', 5.6, 5.6, 0); g.ff(f, 'gardenLamp', 8.6, 5.6, 0); for (const [u, k] of [[2.0, 'lantern'], [4.8, 'candle'], [7.6, 'deskLamp']]) { g.ff(f, 'sideTable', u, 4.2, 0); g.ff(f, k, u, 4.2, 0, 0.55); } for (let i = 0; i < 4; i++) g.ff(f, 'lightStrip', 1.6 + i * 2.1, 0.12, 0, 2.0).s = 1 + i; },
  'rug gallery': (g, f, r) => { g.ff(f, 'roundRug', 2.4, 6.6, 0); g.ff(f, 'longRug', 7.0, 6.6, 0); },
  'mannequin showcase': (g, f, r) => { g.ff(f, 'showcaseSign', 4.8, 5.2, 0); },
  'information desk': (g, f, r) => { g.ff(f, 'showcaseSign', 1.2, 3.6, 0); g.ff(f, 'bigButton', 4.0, 2.4, 0, 1.1); },
};
ROOMS.push(
  { name: 'tv showcase', w: 2, build(g, f, r) {
    // every kind of television, most of them on
    const on = () => (r.chance(0.7) ? 1 + r.int(TV_CHANNELS) : 0);
    g.ff(f, 'wallTV', 2.4, 0.17, 0, 1.3).s = on(); g.ff(f, 'curvedTV', 7.2, 0.2, 0, 1.3).s = on();
    g.ff(f, 'tvStand', 2.4, 0.35, 0); g.ff(f, 'tv', 2.4, 0.35, 0, 0.5).s = on();
    g.ff(f, 'tvStand', 7.2, 0.35, 0); g.ff(f, 'boxTV', 7.2, 0.35, 0, 0.5).s = on();
    for (const [u, v] of [[1.6, 3.2], [4.8, 3.2], [8.0, 3.2]]) { g.ff(f, 'modernTable', u, v, 0); g.ff(f, r.pick(['boxTV', 'miniTV']), u, v, 0, 0.74).s = on(); }
    g.ff(f, 'miniTvStand', 4.8, 0.3, 0); g.ff(f, 'miniTV', 4.8, 0.3, 0, 0.45).s = on();
    g.ff(f, 'loveseat', 4.8, 5.2, 2); g.ff(f, 'showcaseSign', 0.6, 5.0, 0);
  } },
  { name: 'picture gallery', w: 2, build(g, f, r) {
    for (let i = 0; i < 6; i++) g.ff(f, r.pick(['painting', 'tallPainting', 'wallArt']), 0.8 + i * 1.6, 0.15, 0);
    g.ff(f, 'roundMirror', 0.15, 3.0, 1); g.ff(f, 'wideMirror', 9.45, 3.0, 3); g.ff(f, 'longBench', 4.8, 3.6, 0); g.ff(f, 'flowerPot', 0.6, 5.6, 0);
  } },
  { name: 'toy shop', w: 2, build(g, f, r) {
    for (let i = 0; i < 3; i++) g.ff(f, 'plushBear', 1.2 + i * 1.2, 0.5, 0);
    g.ff(f, 'smallBookcase', 6.0, 0.25, 0); g.ff(f, 'smallBookcase', 7.0, 0.25, 0);
    for (const [u, v] of [[2.4, 3.2], [6.0, 3.2]]) { g.ff(f, 'playTable', u, v, 0); g.ff(f, r.pick(['toyRobot', 'toyCar', 'puzzleCube']), u - 0.2, v, 0, 0.5); g.ff(f, r.pick(['toyRobot', 'toyCar', 'puzzleCube']), u + 0.25, v, 0, 0.5); }
    g.ff(f, 'foamDice', 8.6, 3.6, 0); g.ff(f, 'foamDice', 8.6, 4.1, 1); if (r.chance(0.35)) g.ff(f, 'giftBox', 4.4, 5.2, 0);
    g.ff(f, 'toyChest', 0.7, 4.4, 1); g.ff(f, 'pencilLamp', 6.0, 0.25, 0, 1.0); g.ff(f, 'globeLamp', 7.0, 0.25, 0, 1.0);
  } },
  { name: 'café', w: 2, build(g, f, r) {
    for (const [u, v] of [[2.0, 2.0], [5.0, 2.0], [8.0, 2.0], [3.4, 5.0], [6.6, 5.0]]) {
      g.ff(f, 'roundTable', u, v, 0); g.ff(f, 'cafeChair', u - 0.7, v, 1); g.ff(f, 'cafeChair', u + 0.7, v, 3);
      if (r.chance(0.2)) g.fd(f, ['cinnamon', 'donut', 'cookie', 'water', 'soda'].filter((k) => k in ITEMS), u, v, 0.75);
    }
    g.ff(f, 'flowerPot', 0.5, 0.5, 0); g.ff(f, 'flowerPot', 9.1, 0.5, 0); g.ff(f, 'barTable', 8.6, 5.0, 0);
  } },
  { name: 'storage display', w: 2, build(g, f, r) {
    g.ff(f, 'closet', 1.0, 0.4, 0); g.ff(f, 'metalWardrobe', 2.6, 0.4, 0); g.ff(f, 'modernShelf', 3.7, 0.3, 0); g.ff(f, 'fancyShelf', 4.7, 0.35, 0);
    g.ff(f, 'woodenShelf', 5.9, 0.3, 0); g.ff(f, 'smallCabinet', 7.0, 0.3, 0); g.ff(f, 'drawerUnit', 7.8, 0.3, 0); g.ff(f, 'smallBookcase', 8.8, 0.25, 0);
    for (let i = 0; i < 4; i++) g.ff(f, 'milkCrate', 2.0 + i * 0.6, 3.4, 0); g.ff(f, 'milkCrate', 2.3, 3.4, 0, 0.3); g.ff(f, 'metalCart', 6.4, 3.4, 0);
  } },
  { name: 'kitchen appliances', w: 1.5, build(g, f, r) {
    for (let i = 0; i < 3; i++) { g.ff(f, 'modernTable', 1.8 + i * 3.0, 2.0, 0); g.ff(f, 'microwave', 1.5 + i * 3.0, 2.0, 0, 0.74); g.ff(f, 'toaster', 2.2 + i * 3.0, 2.0, 0, 0.74); }
    g.ff(f, 'fridge', 1.0, 0.5, 0); g.ff(f, 'fridge', 1.9, 0.5, 0); g.ff(f, 'stove', 3.2, 0.42, 0); g.ff(f, 'stove', 4.0, 0.42, 0); g.ff(f, 'showcaseSign', 8.6, 4.6, 0);
  } },
  { name: 'party room', w: 1, build(g, f, r) {
    for (let i = 0; i < 4; i++) g.ff(f, 'lightStrip', 1.4 + i * 2.2, 0.12, 0, 2.2).s = 1 + ((i + r.int(6)) % 6);
    g.ff(f, 'roundTable', 3.0, 3.4, 0); g.ff(f, 'roundTable', 6.6, 3.4, 0); g.ff(f, 'recordPlayer', 3.0, 3.4, 0, 0.75); g.ff(f, 'bigButton', 6.6, 3.4, 0, 0.75);
    for (let i = 0, n = 1 + r.int(2); i < n; i++) g.ff(f, 'giftBox', 4.4 + i * 0.6, 5.4, r.int(4));
    g.ff(f, 'loveseat', 4.8, 0.6, 0); g.ff(f, 'beanbag', 8.6, 5.2, 3); g.ff(f, 'globeLamp', 0.6, 5.2, 0).s = 7;
  } },
);
GARDEN_ROOMS[1].build = ((orig) => function (g, f, r) { orig(g, f, r); g.ff(f, 'gardenLamp', 0.6, 0.6, 0); g.ff(f, 'flowerPot', 5.6, 0.6, 0); })(GARDEN_ROOMS[1].build);
GARDEN_ROOMS.push(
  { name: 'picnic area', w: 3, open: true, build(g, f, r) {
    { const [a, b, c, d] = f.rect(0, 0, Q, Q); g.deco(a, b, c, d, 0, 0.02, 0x5e8a3a); }
    g.ff(f, 'picnicTable', 2.6, 2.8, 0); g.ff(f, 'picnicTable', 6.8, 2.8, 0); g.ff(f, 'picnicTable', 4.8, 6.6, 1);
    g.ff(f, 'gardenLamp', 0.6, 0.6, 0); g.ff(f, 'gardenLamp', 9.0, 9.0, 0); g.ff(f, 'trashCan', 9.0, 0.6, 0); g.ff(f, 'lantern', 2.6, 2.8, 0, 0.75);
    if (r.chance(0.3)) g.fd(f, ['apple', 'banana', 'water', 'lemon'].filter((k) => k in ITEMS), 6.8, 2.8, 0.75);
  } },
);

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

// A pillar screen: a grid reference in green on black, or snow and NO SIGNAL.
function screenTexture(label, type) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 154;
  const x = c.getContext('2d');
  x.fillStyle = '#05080a'; x.fillRect(0, 0, 256, 154);
  if (label) {
    x.fillStyle = type === 'lost' ? '#ffd34d' : '#5cff9d'; x.font = 'bold 20px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('GRID REFERENCE', 128, 32); x.font = 'bold 46px monospace'; x.fillText(label, 128, 86, 240);
    x.font = '16px monospace'; x.fillText(type === 'lost' ? 'LOST PROPERTY' : type === 'scaffold' ? 'MAINTENANCE IN PROGRESS' : type === 'cracked' ? 'STRUCTURE CHECK DUE' : 'KEEP CLEAR', 128, 130);
    x.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < 154; y += 3) x.fillRect(0, y, 256, 1);
  } else {
    const img = x.getImageData(0, 0, 256, 154);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 180; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    x.fillStyle = '#000a'; x.fillRect(48, 56, 160, 42); x.fillStyle = '#fff'; x.font = 'bold 24px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('NO SIGNAL', 128, 78);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
    this.held = []; this.withHeld = false; // boxes of furniture being held right now
    this.fadePhase = 0; this.hasFading = false;
    this.focusX = 0; this.focusZ = 0;
    this.inst = new Map(); this.itemsDirty = true;
    this.version = 0; // bumps whenever anything solid moves (staff path cache)
  }

  reset(seed) {
    for (const ch of this.chunks.values()) this._dropVisual(ch);
    for (const im of this.inst.values()) { this.group.remove(im); im.dispose(); }
    if (this.shadowInst) { this.group.remove(this.shadowInst); this.shadowInst.dispose(); this.shadowInst = null; }
    this.inst.clear(); this.itemsDirty = true; this._lastFocus = null;
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
    // Build the visuals nearest the player first, a couple per update.
    const fcx = this.focusX / CHUNK - 0.5, fcz = this.focusZ / CHUNK - 0.5, toBuild = [];
    for (const [k, render] of want) {
      let ch = this.chunks.get(k);
      if (!ch) { const [cx, cz] = k.split(',').map(Number); ch = this._load(cx, cz); }
      if (render && !ch.mesh) toBuild.push(ch);
      if (!render && ch.mesh) this._dropVisual(ch);
    }
    toBuild.sort((a, b) => Math.hypot(a.cx - fcx, a.cz - fcz) - Math.hypot(b.cx - fcx, b.cz - fcz));
    for (let i = 0; i < Math.min(2, toBuild.length); i++) this._buildVisual(toBuild[i]);
    for (const [k, ch] of this.chunks) if (!want.has(k)) this._unload(ch);
    // Loading and changes mark the items dirty themselves; walking only
    // matters once we've moved far enough to change which ones are drawn.
    if (!this._lastFocus || Math.hypot(this.focusX - this._lastFocus[0], this.focusZ - this._lastFocus[1]) > 6) {
      this._lastFocus = [this.focusX, this.focusZ];
      this.itemsDirty = true;
    }
  }

  _load(cx, cz) {
    const gen = new ChunkGen(this, cx, cz).run().moreFood();
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
    // it hangs from two cables that disappear up into the fog
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.03, 120, 0.03), new THREE.MeshBasicMaterial({ color: 0x3a3c40, fog: true }));
    for (const dx of [-1.3, 1.3]) { const c = cable.clone(); c.position.set(dx, 60.6, 0); sign.add(c); }
    sign.position.set(ch.cx * CHUNK + 6, 4.9, ch.cz * CHUNK + 0.6);
    this.group.add(sign);
    ch.sign = sign;
    // the grid pillar's screens: its reference, or static when the screen's broken
    if (ch.gen.pillar) {
      const P = ch.gen.pillar, smat = new THREE.MeshBasicMaterial({ map: screenTexture(P.glitch ? null : P.label, P.type), fog: true, toneMapped: false });
      const pl = new THREE.PlaneGeometry(1.0, 0.6), cx = ch.cx * CHUNK + HALF, cz = ch.cz * CHUNK + HALF, d = 1.2 + 0.085;
      const grp = new THREE.Group();
      for (const [x, z, ry] of [[0, d, 0], [0, -d, Math.PI], [d, 0, Math.PI / 2], [-d, 0, -Math.PI / 2]]) { const m3 = new THREE.Mesh(pl, smat); m3.position.set(cx + x, 1.9, cz + z); m3.rotation.y = ry; grp.add(m3); }
      this.group.add(grp); ch.screens = grp;
    }
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
    if (ch.screens) { this.group.remove(ch.screens); const m = ch.screens.children[0]; m.material.map.dispose(); m.material.dispose(); m.geometry.dispose(); ch.screens = null; }
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

  // The grid pillar of the chunk at (x, z), with where it stands, or null.
  pillarAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), p = pillarOf(this.seed, cx, cz);
    return p ? { ...p, x: cx * CHUNK + HALF, z: cz * CHUNK + HALF } : null;
  }
  staticMeshes() { const out = []; for (const ch of this.chunks.values()) if (ch.mesh) out.push(ch.mesh); return out; }
  sectionAt(x, z) { return sectionOf(this.seed, Math.floor(x / CHUNK), Math.floor(z / CHUNK)); }

  // ---- Items ----
  _addItem(id, s) {
    // unknown kinds (an old save, a newer screen) are skipped
    if (s.k === 'f' ? !Object.prototype.hasOwnProperty.call(TYPES, s.t) : !Object.prototype.hasOwnProperty.call(ITEMS, s.t)) return null;
    const it = { id, t: s.t, k: s.k, v: s.v | 0, x: s.x, y: s.y, z: s.z, r: s.r | 0, tl: ((s.tl | 0) % 3 + 3) % 3, hp: s.hp != null ? s.hp : (s.k === 'f' ? TYPES[s.t].hp : 1), g: !!s.g, c: s.c || null, d: s.d | 0, o: cleanQuat(s.o), a: !!s.a, s: Math.max(0, Math.min(15, s.s | 0)), mesh: null, cells: null };
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
      const [w, h, d] = itemDims(it.t, it.r, it.tl, it.o);
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

  // Is this lamp giving light? Ordinary lamps are on unless switched off;
  // colour lamps and light strips are off at 0 and lit in a colour after.
  isLit(it) {
    const t = it.k === 'f' && TYPES[it.t]; if (!t || !t.lamp) return false;
    return t.use === 'strip' || t.use === 'colour' ? it.s > 0 : !it.s;
  }
  // The state the model shows: state 7 on a colour light is a slow fade
  // through the six colours.
  shownState(it) {
    if (!hasState(it.t)) return 0;
    const u = TYPES[it.t].use;
    if ((u === 'strip' || u === 'colour') && it.s === 7) return 1 + (this.fadePhase % 6);
    return it.s | 0;
  }
  // The colour of a lamp's light.
  lightColor(it) {
    const t = TYPES[it.t];
    if (t.use === 'strip' || t.use === 'colour') return STRIP_COLORS[(this.shownState(it) - 1 + 6) % 6];
    if (t.glowCol === 'shade') return t.cols[it.v % t.cols.length];
    return t.glowCol || 0xffd59a;
  }
  flushItems() {
    if (!this.itemsDirty) return;
    this.itemsDirty = false;
    const groups = new Map();
    let fading = 0;
    const R = CHUNK * (RENDER_R + 0.5);
    for (const it of this.items.values()) {
      if (!this.active(it) || Math.abs(it.x - this.focusX) > R || Math.abs(it.z - this.focusZ) > R) continue;
      // doors and screens have a second model (open / showing a picture)
      if (it.s === 7) fading++;
      const key = it.k === 'f' ? it.t + ':' + (it.v % TYPES[it.t].cols.length) + ':' + this.shownState(it) : 'item:' + it.t;
      let g = groups.get(key); if (!g) groups.set(key, g = []);
      g.push(it);
    }
    const m4 = this._m4 || (this._m4 = new THREE.Matrix4()), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (const [key, im] of this.inst) if (!groups.has(key)) { im.count = 0; im.visible = false; }
    // a soft glow over every lamp (shown at night)
    {
      const lamps = [];
      this.hasFading = fading > 0;
      for (const list of groups.values()) for (const it of list) if (this.isLit(it)) lamps.push(it);
      if (!this.glow || this.glow.geometry.attributes.position.count < lamps.length) {
        if (this.glow) { this.group.remove(this.glow); this.glow.geometry.dispose(); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(32, lamps.length * 2) * 3), 3));
        this.glow = new THREE.Points(g, glowMaterial()); this.glow.frustumCulled = false; this.glow.renderOrder = 2;
        this.group.add(this.glow);
      }
      const a = this.glow.geometry.attributes.position;
      lamps.forEach((it, i) => { const h = itemDims(it.t, it.r, it.tl, it.o)[1]; a.setXYZ(i, it.x, it.y + h * (TYPES[it.t].glowY ?? 0.82), it.z); });
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
        const [dw, dh, dd] = itemDims(it.t, it.r, it.tl, it.o), grow = 1.55 + Math.min(0.5, dh * 0.2);
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
        const [a, b, st] = key.split(':');
        const geo = a === 'item' ? itemGeometry(b) : furnitureGeometry(a, +b, +st || 0);
        im = new THREE.InstancedMesh(geo, furnitureMaterial, Math.max(16, Math.ceil(list.length * 1.5)));
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(im);
        this.inst.set(key, im);
      }
      list.forEach((it, i) => {
        if (it.k === 'f') itemMatrix(m4, it.t, it.x, it.y, it.z, it.r, it.tl, 1, it.o);
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
      if (!this.isLit(it) || !this.active(it)) return;
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
      const parts = itemParts(it.t, it.r, it.tl, it.o, it.s);
      if (!parts) { fn(b); return; }
      for (const [a, c, d, e, f, g] of parts) {
        const pb = { x0: it.x + a, x1: it.x + e, y0: it.y + c, y1: it.y + f, z0: it.z + d, z1: it.z + g, item: it, climb: b.climb };
        if (pb.x1 > x0 && pb.x0 < x1 && pb.z1 > z0 && pb.z0 < z1) fn(pb);
      }
    });
    // furniture someone is holding: solid to players (you can ride it up)
    if (this.withHeld) for (const pb of this.held) if (pb.x1 > x0 && pb.x0 < x1 && pb.z1 > z0 && pb.z0 < z1) fn(pb);
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
  stateOf(it) { const s = { t: it.t, k: it.k, v: it.v, x: +it.x.toFixed(3), y: +it.y.toFixed(3), z: +it.z.toFixed(3), r: it.r, tl: it.tl | 0, hp: Math.round(it.hp), g: it.g ? 1 : 0, c: it.c || 0, d: it.d }; if (it.o) s.o = it.o; if (it.a) s.a = 1; if (it.s) s.s = it.s; return s; }

  applyState(id, s) {
    if (!s || typeof s !== 'object') return null;
    const fin = (v, lo, hi) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
    const st = { t: String(s.t), k: s.k === 'i' ? 'i' : 'f', v: s.v | 0, x: fin(s.x, -1e6, 1e6), y: fin(s.y, 0, CEIL), z: fin(s.z, -1e6, 1e6), r: (s.r | 0) & 3, tl: ((s.tl | 0) % 3 + 3) % 3, hp: +s.hp || 0, g: !!s.g, c: s.c ? String(s.c) : null, d: s.d | 0, o: cleanQuat(s.o), a: !!s.a, s: Math.max(0, Math.min(15, s.s | 0)) };
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
        if (!this.active(it) || it.a) return; // anchored pieces stay put
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
