/* Island Front: terrain generation (same generator as the map drafts, sampled on a 26.7 m grid). */
'use strict';
const KMW = 20, KMH = 13.2;                 // map size in km
const WORLD_W = KMW * 1000, WORLD_H = KMH * 1000; // metres; world x = east, z = south, y = up
const GW = 751, GH = 496, CELL = WORLD_W / (GW - 1); // height grid (vertices)
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const smax = (a, b, k) => { const h = clamp(.5 + .5 * (a - b) / k, 0, 1); return b + (a - b) * h + k * h * (1 - h); };
function hash2(i, j, s) { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, y, s, o = 5) { let f = 0, a = .5, t; for (let k = 0; k < o; k++) { f += a * vnoise(x, y, s + k * 101); t = x; x = (.8 * t - .6 * y) * 2.03; y = (.6 * t + .8 * y) * 2.03; a *= .5; } return f; }
function ridged(x, y, s, o = 4) { let f = 0, a = .5, t; for (let k = 0; k < o; k++) { let n = 1 - Math.abs(vnoise(x, y, s + k * 131)); f += a * n * n; t = x; x = (.8 * t - .6 * y) * 2.07; y = (.6 * t + .8 * y) * 2.07; a *= .5; } return f; }
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function smooth(pts, closed = false, n = 8) {
  const out = [], N = pts.length, get = k => closed ? pts[(k + N) % N] : pts[clamp(k, 0, N - 1)];
  const segs = closed ? N : N - 1;
  for (let s = 0; s < segs; s++) {
    const p0 = get(s - 1), p1 = get(s), p2 = get(s + 1), p3 = get(s + 2);
    for (let t = 0; t < n; t++) {
      const u = t / n, u2 = u * u, u3 = u2 * u, f = c => .5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(closed ? out[0] : pts[N - 1]);
  return out;
}
const bbox = P => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of P) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); } return [a, b, c, d]; };
let _t = 0;
function distPoly(x, y, P, bb, m) {
  if (x < bb[0] - m || x > bb[2] + m || y < bb[1] - m || y > bb[3] + m) return 1e9;
  let best = 1e18, bt = 0; const n = P.length - 1;
  for (let k = 0; k < n; k++) {
    const ax = P[k][0], ay = P[k][1], dx = P[k + 1][0] - ax, dy = P[k + 1][1] - ay;
    const l2 = dx * dx + dy * dy; let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x, ey = ay + dy * t - y, d2 = ex * ex + ey * ey;
    if (d2 < best) { best = d2; bt = (k + t) / n; }
  }
  _t = bt; return Math.sqrt(best);
}
function segX(a, b, c, d) {
  const r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1], den = r0 * s1 - r1 * s0;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den, u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r0 * t, a[1] + r1 * t, Math.atan2(r1, r0)] : null;
}
const ellipse = (cx, cy, rx, ry, n, wob = 0, ph = 0) => Array.from({ length: n }, (_, k) => { const a = k / n * Math.PI * 2, w = 1 + wob * Math.sin(a * 3 + ph) + wob * .6 * Math.cos(a * 5 + ph); return [cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]; });

const GARRISON = { S: 3, M: 3, L: 4 }; // guards per checkpoint (the outposts start held, so theirs are not used)
const SIZE_NAME = { S: 'Small', M: 'Medium', L: 'Main base' };
const CP_DIM = { S: [.12, .09], M: [.22, .17], L: [.42, .32] }; // km (the drafts drew them bigger so they showed up)
const CAP_TIME = { S: 20, M: 30, L: 45 };   // seconds to capture with one unit inside
const MAPS = [
  {
    id: 'ironback', name: 'Ironback Ridge', eye: 'Draft A · west vs east', seed: 11, plain: 70, hills: 120, forestT: .04,
    pitch: 'A long island cut in two by the Ironback, a 700 m mountain spine. The main base sits in the one wide gap through the middle of it, so every tank route goes through the fort or round the south coast past Port Wen.',
    fights: ['The main base: the only wide gap through the Ironback', 'South coast road over the Gant pass and through Port Wen', 'Wen Bay: boats can land behind the main base', 'River bridges either side of the main base'],
    blobs: [[3.8, 6.8, 3.0, 2.5], [7.0, 6.2, 3.4, 3.4], [10.4, 6.6, 3.8, 3.8], [13.8, 6.4, 3.4, 3.2], [16.6, 6.6, 2.8, 2.4], [9.2, 9.2, 2.4, 2.0]],
    ridges: [
      { pts: [[7.2, 2.9], [8.2, 3.9], [9.1, 5.0], [9.5, 5.5]], w: .8, h: 720 },
      { pts: [[10.6, 7.9], [11.3, 8.9], [12.0, 9.9], [12.4, 10.6]], w: .8, h: 680, passes: [[11.55, 9.25, .5]] },
      { pts: [[3.6, 4.7], [5.8, 4.0]], w: .6, h: 220 },
      { pts: [[15.2, 9.0], [16.8, 8.8]], w: .6, h: 200 },
    ],
    features: [], lakes: [], islets: [], causeways: [],
    bays: [{ x: 10.3, y: 11.0, rx: 1.1, ry: 1.0 }],
    rivers: [
      { pts: [[8.9, 6.0], [8.7, 7.2], [8.0, 8.2], [7.3, 9.3], [6.9, 10.4], [6.7, 11.6]], w0: .022, w1: .06, depth: 4 },
      { pts: [[11.3, 7.2], [11.9, 6.0], [12.9, 5.0], [13.6, 3.8], [13.9, 2.2]], w0: .022, w1: .06, depth: 4 },
    ],
    bases: [{ team: 0, x: 2.5, y: 6.8 }, { team: 1, x: 17.5, y: 6.5 }],
    cps: [['S', 5.0, 6.2, 'Hale Outpost'], ['M', 7.4, 6.8, 'Ford Camp'], ['L', 10.0, 6.6, 'Ironback Fort'], ['M', 12.6, 6.4, 'Kell Camp'], ['S', 15.1, 6.8, 'Gant Outpost']],
    airfields: [{ team: 0, x: 4.6, y: 8.6, len: 1.8, ang: -.06 }, { team: 1, x: 15.0, y: 4.8, len: 1.8, ang: -.06 }],
    docks: [{ team: 0, x: 2.0, y: 6.1, ang: Math.PI }, { team: 1, x: 18.0, y: 7.0, ang: 0 }, { team: -1, x: 10.0, y: 10.2, ang: Math.PI / 2 }],
    towns: [{ n: 'Ashford', x: 6.0, y: 4.5, r: .3 }, { n: 'Port Wen', x: 9.7, y: 9.8, r: .36 }, { n: 'Kell', x: 14.0, y: 8.6, r: .3 }],
    roads: [
      { main: true, pts: [[2.5, 6.8], [3.8, 6.4], [5.0, 6.2], [6.2, 6.6], [7.4, 6.8], [8.7, 6.6], [10.0, 6.6], [11.3, 6.6], [12.6, 6.4], [13.9, 6.7], [15.1, 6.8], [16.3, 6.6], [17.5, 6.5]] },
      { main: true, pts: [[2.5, 6.8], [3.6, 7.9], [4.6, 8.4], [6.4, 9.0], [8.1, 9.5], [9.7, 9.8], [10.9, 9.6], [11.55, 9.25], [12.8, 8.8], [14.0, 8.6], [15.6, 7.8], [17.5, 6.5]] },
      { main: true, pts: [[12.6, 6.4], [13.8, 5.4], [15.0, 5.1], [16.6, 5.6], [17.5, 6.5]] },
      { pts: [[5.0, 6.2], [6.0, 4.5], [7.4, 6.8]] },
      { pts: [[9.7, 9.8], [9.4, 8.4], [10.0, 6.6]] },
      { pts: [[14.0, 8.6], [13.5, 7.4], [12.6, 6.4]] },
      { pts: [[6.0, 4.5], [7.6, 3.6]] },
    ],
    peaks: [[8.4, 4.0, 'Mt Hale'], [12.0, 10.0, 'Gant Head'], [9.2, 5.2, 'Ironback']],
    water: [[10.7, 11.75, 'Wen Bay', 13], [2.4, 1.6, 'Havoc Sea', 16], [17.4, 12.1, 'Havoc Sea', 16]],
  },
  {
    id: 'kettle', name: 'Kettle Lake', eye: 'Draft B · north-west vs south-east', seed: 23, plain: 70, hills: 95, forestT: .0,
    pitch: 'A round island built around a flooded crater. The main base is a fort on Kettle Isle in the middle of the lake, reached by two causeways. Four gaps in the crater rim let vehicles into the bowl, and boats can sail up Kettle Run from the sea to attack the fort from the water.',
    fights: ['Kettle Isle fort: two causeways for tanks, boats all round', 'The rim gaps: tank choke points into the bowl', 'Lowtide bridge at the mouth of Kettle Run', 'Rim tops: long sight lines for infantry and AA'],
    blobs: [[10.0, 6.6, 6.6, 5.0], [4.8, 4.8, 2.6, 2.4], [15.4, 8.8, 2.6, 2.4], [13.6, 3.4, 2.0, 1.8], [6.0, 9.8, 2.0, 1.6]],
    ridges: [
      { closed: true, pts: ellipse(10.2, 6.2, 3.5, 3.0, 16, .04, 2), w: .68, h: 400, passes: [[7.19, 4.67, .6], [13.21, 7.73, .6], [10.5, 9.2, .55], [12.3, 3.8, .5]] },
      { pts: [[3.4, 6.0], [3.0, 8.0]], w: .6, h: 160 },
      { pts: [[16.8, 6.4], [17.2, 4.8]], w: .6, h: 170 },
    ],
    features: [],
    lakes: [{ x: 10.2, y: 6.2, rx: 2.15, ry: 1.85, depth: 24 }],
    islets: [{ x: 10.2, y: 6.2, r: .78, h: 26 }],
    causeways: [{ pts: [[8.3, 5.12], [9.65, 5.88]] }, { pts: [[10.75, 6.52], [12.1, 7.28]] }],
    bays: [],
    rivers: [
      { pts: [[10.4, 7.75], [10.6, 9.0], [10.8, 10.0], [10.6, 11.0], [10.4, 12.8]], w0: .07, w1: .1, depth: 6 },
      { pts: [[14.6, 3.1], [13.2, 4.0], [12.2, 4.8]], w0: .02, w1: .035, depth: 3 },
    ],
    bases: [{ team: 0, x: 4.1, y: 3.9 }, { team: 1, x: 16.2, y: 9.5 }],
    cps: [['S', 6.2, 4.4, 'Holm Outpost'], ['M', 8.2, 5.0, 'Rimgate Camp'], ['L', 10.2, 6.2, 'Kettle Isle Fort'], ['M', 12.2, 7.4, 'Southgate Camp'], ['S', 14.2, 8.4, 'Esk Outpost']],
    airfields: [{ team: 0, x: 5.0, y: 7.1, len: 1.8, ang: Math.PI / 2 - .1 }, { team: 1, x: 15.0, y: 5.8, len: 1.8, ang: Math.PI / 2 - .1 }],
    docks: [{ team: 0, x: 3.0, y: 4.2, ang: Math.PI }, { team: 1, x: 17.2, y: 9.4, ang: 0 }, { team: -1, x: 8.4, y: 6.8, ang: 0 }, { team: -1, x: 11.25, y: 10.9, ang: Math.PI }],
    towns: [{ n: 'Kettle', x: 7.9, y: 6.9, r: .32 }, { n: 'Lowtide', x: 11.5, y: 10.9, r: .38 }, { n: 'Mirren', x: 12.0, y: 2.6, r: .3 }],
    roads: [
      { main: true, pts: [[4.1, 3.9], [5.2, 4.1], [6.2, 4.4], [7.19, 4.67], [8.2, 5.0], [8.9, 5.45], [9.65, 5.88], [10.2, 6.2], [10.75, 6.52], [11.5, 6.95], [12.2, 7.4], [13.21, 7.73], [14.2, 8.4], [15.2, 9.0], [16.2, 9.5]] },
      { main: true, closed: true, pts: ellipse(10.2, 6.2, 2.6, 2.3, 12, .05, 1) },
      { main: true, pts: [[5.0, 7.1], [5.8, 8.8], [7.0, 9.8], [8.6, 10.3], [10.0, 10.5], [11.5, 10.9], [13.4, 10.6], [15.0, 10.1], [16.2, 9.5]] },
      { pts: [[11.5, 10.9], [11.05, 9.9], [10.95, 9.1], [10.85, 8.4]] },
      { pts: [[12.0, 2.6], [12.3, 3.8], [12.0, 4.2]] },
      { pts: [[12.0, 2.6], [14.0, 3.4], [15.0, 4.9]] },
      { pts: [[4.1, 3.9], [4.8, 5.6], [5.0, 6.2]] },
      { pts: [[15.0, 6.7], [15.3, 8.1], [16.2, 9.5]] },
    ],
    peaks: [[7.6, 8.0, 'Brack Fell'], [11.4, 3.3, 'Kettle Rim'], [13.4, 5.2, 'Oxtor']],
    water: [[10.2, 7.55, 'Kettle Lake', 13], [11.2, 12.4, 'Kettle Run', 11], [1.8, 1.3, 'Havoc Sea', 16], [18.0, 12.2, 'Havoc Sea', 16]],
  },
  {
    id: 'narrows', name: 'The Narrows', eye: 'Draft C · two halves', seed: 37, plain: 55, hills: 95, forestT: .02,
    pitch: 'Two hilly halves joined by a strip of land about 1.5 km wide. The main base straddles the boat canal cut through the strip, with both canal bridges inside its walls, so it is the only ground route between the halves.',
    fights: ['The main base: both canal bridges are inside it', 'North Sound and Gull Sound: boat fights either side of the strip', 'Mt Cinder and Table Mesa: high ground near each team', 'Cinder and Halden: the long northern roads'],
    blobs: [[5.2, 6.6, 4.4, 4.4], [3.2, 5.0, 2.0, 2.0], [14.8, 6.4, 4.2, 4.4], [16.8, 8.0, 2.0, 2.0], [10.0, 6.8, 2.6, .86]],
    ridges: [{ pts: [[7.2, 8.8], [8.2, 10.0]], w: .5, h: 130 }, { pts: [[16.4, 3.2], [17.8, 4.4]], w: .6, h: 170 }],
    features: [{ type: 'cone', x: 4.6, y: 5.2, r: 2.4, h: 680, crater: 120, cr: .4 }, { type: 'mesa', x: 15.2, y: 5.6, r: 1.6, h: 250 }],
    lakes: [], islets: [], causeways: [], bays: [],
    rivers: [
      { pts: [[6.6, 5.6], [7.4, 4.8], [8.0, 3.9], [8.4, 2.8]], w0: .022, w1: .055, depth: 4 },
      { pts: [[14.4, 8.4], [13.4, 9.2], [12.5, 10.0], [11.8, 11.2]], w0: .022, w1: .055, depth: 4 },
      { canal: true, pts: [[10.1, 4.6], [10.0, 6.0], [10.0, 7.6], [9.9, 9.0]], w0: .05, w1: .05, depth: 7 },
    ],
    bases: [{ team: 0, x: 2.1, y: 7.2 }, { team: 1, x: 17.8, y: 6.6 }],
    cps: [['S', 4.4, 8.0, 'Ash Outpost'], ['M', 7.3, 7.2, 'Cinder Camp'], ['L', 10.0, 6.8, 'Canal Fort'], ['M', 12.7, 6.8, 'Halden Camp'], ['S', 15.6, 7.9, 'Mesa Outpost']],
    airfields: [{ team: 0, x: 5.2, y: 9.7, len: 1.8, ang: .08 }, { team: 1, x: 14.0, y: 3.2, len: 1.8, ang: .05 }],
    docks: [{ team: 0, x: 1.6, y: 7.6, ang: Math.PI }, { team: 1, x: 18.4, y: 7.0, ang: 0 }, { team: -1, x: 6.9, y: 3.3, ang: -Math.PI / 2 }],
    towns: [{ n: 'Cinder', x: 6.8, y: 3.7, r: .32 }, { n: 'Halden', x: 12.8, y: 5.0, r: .3 }],
    roads: [
      { main: true, pts: [[2.1, 7.2], [3.3, 7.7], [4.4, 8.0], [5.9, 7.7], [7.3, 7.2], [8.7, 6.9], [10.0, 6.8], [11.3, 6.8], [12.7, 6.8], [14.1, 7.4], [15.6, 7.9], [16.8, 7.2], [17.8, 6.6]] },
      { main: true, pts: [[2.1, 7.2], [2.4, 5.2], [3.4, 3.3], [5.2, 2.6], [6.8, 3.7], [7.5, 5.3], [7.3, 7.2]] },
      { main: true, pts: [[12.7, 6.8], [12.8, 5.0], [14.0, 3.2], [16.2, 4.8], [17.8, 6.6]] },
      { pts: [[5.2, 9.7], [4.4, 8.0]] },
      { pts: [[6.8, 3.7], [5.4, 4.6]] },
      { pts: [[14.0, 3.2], [14.9, 4.6]] },
      { pts: [[15.6, 7.9], [14.6, 9.6], [13.0, 9.5]] },
      { main: true, pts: [[9.55, 6.55], [10.0, 6.55], [10.45, 6.55]] },
    ],
    peaks: [[4.6, 4.8, 'Mt Cinder'], [15.4, 5.8, 'Table Mesa']],
    water: [[10.0, 4.7, 'North Sound', 13], [10.0, 9.1, 'Gull Sound', 13], [1.8, 1.3, 'Havoc Sea', 16], [18.0, 12.2, 'Havoc Sea', 16]],
  },
];


/* Roads never cross an airfield: a road that passes through one (the runway, the apron and the hangars behind it, with a margin) is led round
   the edge the shorter way, with rounded corners; a road that ends inside one is cut back to its edge. Works in km, in the airfield's own frame
   (u along the runway, v across it; the apron and hangars are on the -v side, as buildAirfields lays them out). */
function detourAirfields(M) {
  for (const a of M.airfields || []) {
    const c = Math.cos(a.ang), s = Math.sin(a.ang), U = a.len / 2 + .14, V1 = .3, V2 = .085; // the keep-out box
    const toL = p => [(p[0] - a.x) * c + (p[1] - a.y) * s, -(p[0] - a.x) * s + (p[1] - a.y) * c], toW = q => [a.x + q[0] * c - q[1] * s, a.y + q[0] * s + q[1] * c];
    const inside = q => Math.abs(q[0]) < U && q[1] > -V1 && q[1] < V2;
    const corners = [[-U, -V1], [U, -V1], [U, V2], [-U, V2]], edge = [2 * U, V1 + V2, 2 * U, V1 + V2], per = 2 * (2 * U + V1 + V2);
    const perimT = q => { // the nearest boundary point's distance round the box from the first corner
      const cand = [[0, clamp(q[0], -U, U) + U, Math.abs(q[1] + V1)], [1, clamp(q[1], -V1, V2) + V1, Math.abs(q[0] - U)], [2, U - clamp(q[0], -U, U), Math.abs(q[1] - V2)], [3, V2 - clamp(q[1], -V1, V2), Math.abs(q[0] + U)]];
      const [e, d] = cand.reduce((b, x) => x[2] < b[2] ? x : b); let t = d; for (let k = 0; k < e; k++) t += edge[k]; return t; };
    const atT = t => { t = ((t % per) + per) % per; for (let k = 0; k < 4; k++) { if (t <= edge[k]) { const A = corners[k], B = corners[(k + 1) % 4], f = t / edge[k]; return [lerp(A[0], B[0], f), lerp(A[1], B[1], f)]; } t -= edge[k]; } return corners[0]; };
    const chaikin = (Q, n) => { for (let it = 0; it < n; it++) { const R = [Q[0]]; for (let k = 0; k < Q.length - 1; k++) { const p = Q[k], q = Q[k + 1]; R.push([p[0] * .75 + q[0] * .25, p[1] * .75 + q[1] * .25], [p[0] * .25 + q[0] * .75, p[1] * .25 + q[1] * .75]); } R.push(Q[Q.length - 1]); Q = R; } return Q; };
    for (const r of M._roads) {
      let P = r.P;
      for (let guard = 0; guard < 6; guard++) {
        const L = P.map(toL), i0 = L.findIndex(inside); if (i0 < 0) break;
        let i1 = i0; while (i1 + 1 < L.length && inside(L[i1 + 1])) i1++;
        if (i0 === 0 || i1 === L.length - 1) { P = i0 === 0 ? P.slice(i1 + 1) : P.slice(0, i0); if (P.length < 2) break; continue; } // a road that ends here: stop at the edge
        const E = L[i0 - 1], X = L[i1 + 1], o = .035; // (walk a box a little bigger, so the rounded corners stay outside)
        const big = q => [q[0] * (U + o) / U, q[1] < 0 ? q[1] * (V1 + o) / V1 : q[1] * (V2 + o) / V2];
        let tE = perimT(E), tX = perimT(X), fwd = ((tX - tE) % per + per) % per; const dir = fwd <= per / 2 ? 1 : -1, span = dir > 0 ? fwd : per - fwd;
        const Q = [E, big(atT(tE))]; for (let k = 0; k < 4; k++) { let tc = 0; for (let m = 0; m < k; m++) tc += edge[m]; const d = dir > 0 ? ((tc - tE) % per + per) % per : ((tE - tc) % per + per) % per; if (d > 1e-6 && d < span - 1e-6) Q.push([d, big(corners[k])]); }
        const mid = Q.splice(2).sort((p, q) => p[0] - q[0]).map(x => x[1]); Q.push(...mid, big(atT(tX)), X);
        P = P.slice(0, i0 - 1).concat(chaikin(Q, 3).map(toW), P.slice(i1 + 2));
      }
      r.P = P;
    }
  }
  M._roads = M._roads.filter(r => r.P.length >= 2);
}
function prep(M) {
  M._ridges = M.ridges.map(r => { const P = smooth(r.pts, r.closed, 8); return { ...r, P, bb: bbox(P) }; });
  M._rivers = M.rivers.map(r => { const P = smooth(r.pts, false, 8); return { ...r, P, bb: bbox(P) }; });
  M._causeways = M.causeways.map(r => ({ P: r.pts, bb: bbox(r.pts) }));
  M._roads = M.roads.map(r => ({ ...r, P: smooth(r.pts, r.closed, 8) }));
  detourAirfields(M);
  const tm = Math.atan2(M.bases[1].y - M.bases[0].y, M.bases[1].x - M.bases[0].x);
  M.bases[0].ang = tm; M.bases[1].ang = tm + Math.PI;
  const chain = [[M.bases[0].x, M.bases[0].y], ...M.cps.map(c => [c[1], c[2]]), [M.bases[1].x, M.bases[1].y]];
  M._cps = M.cps.map((c, k) => { const a = chain[k], b = chain[k + 2]; return { size: c[0], x: c[1], y: c[2], name: c[3], n: k + 1, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; });
}
function carveRiver(r, x, y, h) {
  const d = distPoly(x, y, r.P, r.bb, 1); if (d >= 1) return h;
  const w = lerp(r.w0, r.w1, _t) * 1.25 + .012; // a little wider in game so the 27 m grid shows every river
  if (!r.canal && h > 0) { const v = sstep(1, 0, d); h *= 1 - .45 * v * v; }
  return d < w ? Math.min(h, -r.depth * sstep(w, w * .4, d) - .8) : Math.min(h, lerp(1.5, h, sstep(w, w * 1.6 + (r.canal ? .02 : .07), d)));
}
function terrain(M, x, y) {
  let L = -2;
  for (const b of M.blobs) { const dx = (x - b[0]) / b[2], dy = (y - b[1]) / b[3]; L = smax(L, 1 - Math.sqrt(dx * dx + dy * dy), .3); }
  L += .2 * fbm(x * .45, y * .45, M.seed) + .07 * fbm(x * 1.6, y * 1.6, M.seed + 7);
  let h = L < 0 ? Math.max(-150, L * 380) : 1 + Math.pow(L, 1.15) * M.plain + (.5 + .5 * fbm(x * .9, y * .9, M.seed + 13)) * M.hills * sstep(.02, .4, L);
  const cm = sstep(-.04, .22, L);
  for (const r of M._ridges) {
    const m = r.w * 3, d = distPoly(x, y, r.P, r.bb, m); if (d >= m) continue;
    let pm = 1; if (r.passes) for (const p of r.passes) { const dp = Math.hypot(x - p[0], y - p[1]); pm *= 1 - .84 * Math.exp(-(dp * dp) / (p[2] * p[2])); }
    h += r.h * Math.exp(-(d * d) / (r.w * r.w)) * (.55 + .6 * ridged(x * 1.1, y * 1.1, M.seed + 21)) * (.8 + .3 * vnoise(x * .5, y * .5, M.seed + 3)) * pm * cm;
  }
  for (const f of M.features) {
    const d = Math.hypot(x - f.x, y - f.y);
    if (f.type === 'cone' && d < f.r) { h += f.h * Math.pow(1 - d / f.r, 1.7) * (.85 + .3 * ridged(x * 1.6, y * 1.6, M.seed + 70)) * cm; if (f.crater) h -= f.crater * sstep(f.cr, 0, d); }
    if (f.type === 'mesa') { const dn = d * (1 + .1 * fbm(x * 1.4, y * 1.4, M.seed + 80)); if (dn < f.r * 1.05) h += f.h * sstep(f.r, f.r * .82, dn) * cm; }
  }
  for (const b of M.bays) { const d = Math.hypot((x - b.x) / b.rx, (y - b.y) / b.ry) + .12 * fbm(x * 1.4, y * 1.4, M.seed + 60); if (d < 1.3) h = Math.min(h, lerp(-30, h, sstep(.6, 1.15, d))); }
  for (const k of M.lakes) { const dx = (x - k.x) / k.rx, dy = (y - k.y) / k.ry, d = Math.sqrt(dx * dx + dy * dy) + .08 * fbm(x * 1.3, y * 1.3, M.seed + 40); if (d < 1.4) h = Math.min(h, lerp(-k.depth, h, sstep(.8, 1.25, d))); }
  for (const r of M._rivers) if (!r.canal) h = carveRiver(r, x, y, h);
  for (const s of M.islets) { const d = Math.hypot(x - s.x, y - s.y) / s.r + .1 * fbm(x * 2.5, y * 2.5, M.seed + 90); if (d < 1) h = Math.max(h, lerp(s.h, -5, sstep(.55, 1, d))); }
  for (const c of M._causeways) { const d = distPoly(x, y, c.P, c.bb, .1); if (d < .1) h = Math.max(h, lerp(3, h, sstep(.035, .07, d))); }
  return h;
}
// grid helpers (km <-> grid index)
const gi = x => x * 1000 / CELL, gx = i => i * CELL / 1000;
function zoneLoop(z, fn) {
  const c = Math.cos(z.ang || 0), s = Math.sin(z.ang || 0), R = Math.hypot(z.hx, z.hy) + z.m;
  const i0 = clamp(Math.floor(gi(z.x - R)), 0, GW - 1), i1 = clamp(Math.ceil(gi(z.x + R)), 0, GW - 1);
  const j0 = clamp(Math.floor(gi(z.y - R)), 0, GH - 1), j1 = clamp(Math.ceil(gi(z.y + R)), 0, GH - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = gx(i) - z.x, y = gx(j) - z.y, lx = x * c + y * s, ly = -x * s + y * c;
    fn(j * GW + i, Math.hypot(Math.max(Math.abs(lx) - z.hx, 0), Math.max(Math.abs(ly) - z.hy, 0)));
  }
}
function flatten(H, z) {
  const c = Math.cos(z.ang || 0), s = Math.sin(z.ang || 0);
  let sum = 0, n = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const x = z.x + c * a * z.hx * .8 - s * b * z.hy * .8, y = z.y + s * a * z.hx * .8 + c * b * z.hy * .8;
    sum += H[clamp(Math.round(gi(y)), 0, GH - 1) * GW + clamp(Math.round(gi(x)), 0, GW - 1)]; n++;
  }
  const target = z.target ?? clamp(sum / n, z.min || 8, 300), k = z.k ?? 1;
  z.y0 = target;
  zoneLoop(z, (id, d) => { const t = sstep(0, z.m, d); if (t < 1) H[id] = lerp(H[id], target, (1 - t) * k); });
}

/* Build everything the game needs about one map: heights (metres), forest, roads, bridges, zones. */
function buildMap(M) {
  prep(M);
  const H = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) H[j * GW + i] = terrain(M, gx(i), gx(j));
  M.zones = [];
  M.bases.forEach(b => { b.zone = { x: b.x, y: b.y, hx: .46, hy: .4, ang: b.ang, m: .4, min: 10 }; M.zones.push(b.zone); });
  M._cps.forEach(p => { const [dx, dy] = CP_DIM[p.size]; p.zone = { x: p.x, y: p.y, hx: dx / 2 + .05, hy: dy / 2 + .05, ang: p.ang, m: p.size === 'L' && M.islets.length ? .05 : p.size === 'L' ? .45 : .3, min: 8 }; if (p.size === 'L' && M.rivers.some(r => r.canal)) Object.assign(p.zone, { target: 9, m: .9 }); M.zones.push(p.zone); }); // the canal fort sits low so the canal isn't a gorge
  M.airfields.forEach(a => { a.zone = { x: a.x, y: a.y, hx: a.len / 2 + .1, hy: .18, ang: a.ang, m: .35, min: 8, airfield: true }; M.zones.push(a.zone); });
  for (const z of M.zones) flatten(H, z);
  for (const t of M.towns) { t.zone = { x: t.x, y: t.y, hx: t.r * .7, hy: t.r * .7, m: .25, k: .65, min: 5 }; flatten(H, t.zone); }
  for (const r of M._rivers) if (r.canal) { const [a, b, c, d] = r.bb; for (let j = clamp(Math.floor(gi(b - 1)), 0, GH - 1); j <= clamp(Math.ceil(gi(d + 1)), 0, GH - 1); j++) for (let i = clamp(Math.floor(gi(a - 1)), 0, GW - 1); i <= clamp(Math.ceil(gi(c + 1)), 0, GW - 1); i++) { const id = j * GW + i; H[id] = carveRiver(r, gx(i), gx(j), H[id]); } }
  // the sea floor all round the edge, so nobody drives off the world
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const e = Math.min(i, j, GW - 1 - i, GH - 1 - j); if (e < 8) H[j * GW + i] = Math.min(H[j * GW + i], -40); }
  M.H = H;
  // roads mask (for speed) and forest
  const ROAD = new Uint8Array(GW * GH);
  for (const r of M._roads) {
    for (let k = 0; k < r.P.length - 1; k++) {
      const a = r.P[k], b = r.P[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L * 1000 / 8);
      for (let q = 0; q <= n; q++) { const x = lerp(a[0], b[0], q / n), y = lerp(a[1], b[1], q / n); const i = Math.round(gi(x)), j = Math.round(gi(y)); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < GW && jj < GH) ROAD[jj * GW + ii] = r.main ? 2 : Math.max(ROAD[jj * GW + ii], 1); } }
    }
  }
  M.ROAD = ROAD;
  const F = new Uint8Array(GW * GH), inZone = (x, y, pad) => M.zones.concat(M.towns.map(t => t.zone)).some(z => { const c = Math.cos(z.ang || 0), s = Math.sin(z.ang || 0), dx = x - z.x, dy = y - z.y; return Math.abs(dx * c + dy * s) < z.hx + pad && Math.abs(-dx * s + dy * c) < z.hy + pad; });
  for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
    const id = j * GW + i, h = H[id]; if (h < 6 || h > 560 || ROAD[id]) continue;
    const sl = Math.hypot(H[id + 1] - H[id - 1], H[id + GW] - H[id - GW]) / (2 * CELL); if (sl > .8) continue;
    const x = gx(i), y = gx(j);
    if (fbm(x * .7, y * .7, M.seed + 50) + .35 * fbm(x * 2.8, y * 2.8, M.seed + 51) - (h > 380 ? (h - 380) / 400 : 0) > M.forestT && !inZone(x, y, .1)) F[id] = 1;
  }
  M.F = F;
  // bridges: where a road crosses a river or the canal
  M.bridges = [];
  for (const r of M._roads) for (const v of M._rivers) for (let a = 0; a < r.P.length - 1; a++) for (let b = 0; b < v.P.length - 1; b++) {
    const p = segX(r.P[a], r.P[a + 1], v.P[b], v.P[b + 1]); if (!p) continue;
    const ca = Math.cos(p[2]), sa = Math.sin(p[2]), along = d => sampleKm(M, p[0] + ca * d, p[1] + sa * d);
    // the deck sits at the height of the lower bank 150 m out, so a gorge gets a tall viaduct instead of a dip to the water
    const y0 = Math.max(3.5, Math.min(along(-.15), along(.15))) + .3;
    let aR = .02, aL = .02;
    for (; aR < .4; aR += .005) if (along(aR) >= y0 - .3) break;
    for (; aL < .4; aL += .005) if (along(-aL) >= y0 - .3) break;
    M.bridges.push({ x: p[0] * 1000, z: p[1] * 1000, ang: p[2], aL: -aL * 1000, aR: aR * 1000, w: r.main ? 9 : 6, y: y0, _r: r, _a: a, _p: p, _ends: [aL, aR] });
  }
  // Off each end of a bridge the road is cut into the bank at a grade vehicles can climb. The deck is level with the lower bank, so the higher
  // bank can meet it as a slope close to a cliff; the cutting follows the road up until it comes out at the natural ground.
  { const H0 = H.slice(), h0 = (x, y) => { const fx = clamp(gi(x), 0, GW - 1.001), fy = clamp(gi(y), 0, GH - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, id = j * GW + i; return lerp(lerp(H0[id], H0[id + 1], u), lerp(H0[id + GW], H0[id + GW + 1], u), v); };
    const walk = (r, a, p, dir, dist) => { let x = p[0], y = p[1], k = dir > 0 ? a + 1 : a; // the point `dist` km along the road from the crossing, towards its end (1) or its start (-1)
      while (k >= 0 && k < r.P.length) { const q = r.P[k], L = Math.hypot(q[0] - x, q[1] - y); if (L >= dist) return [x + (q[0] - x) * dist / L, y + (q[1] - y) * dist / L]; dist -= L; x = q[0]; y = q[1]; k += dir; }
      return null; };
    const GRADE = .2, STEP = CELL / 2000;
    for (const b of M.bridges) for (const dir of [-1, 1]) { const a0 = b._ends[dir < 0 ? 0 : 1];
      for (let d = 0; d <= .6; d += STEP) { const q = walk(b._r, b._a, b._p, dir, a0 + d); if (!q) break; const cap = b.y + d * 1000 * GRADE;
        if (d > .02 && h0(q[0], q[1]) <= cap) break; // out at the natural ground
        const ci = gi(q[0]), cj = gi(q[1]);
        for (let jj = Math.floor(cj) - 2; jj <= Math.ceil(cj) + 2; jj++) for (let ii = Math.floor(ci) - 2; ii <= Math.ceil(ci) + 2; ii++) { if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue;
          const lat = Math.hypot(gx(ii) - q[0], gx(jj) - q[1]) * 1000, c2 = cap + Math.max(0, lat - CELL * .8) * .9, id = jj * GW + ii; if (H[id] > c2) H[id] = c2; } } }
    for (const b of M.bridges) { delete b._r; delete b._a; delete b._p; delete b._ends; } }
  // Where a road meets a levelled site (a base, checkpoint, airfield or town) that stands well above or below the land round it, the last stretch
  // could be far too steep to drive. Outside the site the road is carried up on an embankment, or let down in a cutting, at a steady grade.
  { const H1 = H.slice(), h1 = (x, y) => { const fx = clamp(gi(x), 0, GW - 1.001), fy = clamp(gi(y), 0, GH - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, id = j * GW + i; return lerp(lerp(H1[id], H1[id + 1], u), lerp(H1[id + GW], H1[id + GW + 1], u), v); };
    const onSpan = (x, y) => M.bridges.some(b => { const dx = x * 1000 - b.x, dz = y * 1000 - b.z, c = Math.cos(b.ang), sn = Math.sin(b.ang), al = dx * c + dz * sn; return al > b.aL - 30 && al < b.aR + 30 && Math.abs(-dx * sn + dz * c) < 70; });
    const GRADE = .24, DS = CELL / 2;
    for (const r of M._roads) { const X = [], Y = [];
      for (let k = 0; k < r.P.length - 1; k++) { const p0 = r.P[k], p1 = r.P[k + 1], n = Math.max(1, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 1000 / DS)); for (let q = k ? 1 : 0; q <= n; q++) { X.push(lerp(p0[0], p1[0], q / n)); Y.push(lerp(p0[1], p1[1], q / n)); } }
      const deckAt = (x, y) => { for (const b of M.bridges) { const dx = x * 1000 - b.x, dz = y * 1000 - b.z, c = Math.cos(b.ang), sn = Math.sin(b.ang), al = dx * c + dz * sn; if (al >= b.aL && al <= b.aR && Math.abs(-dx * sn + dz * c) < 25) return b.y; } return null; }; // on a bridge the road is the deck, whatever lies below
      const n = X.length, deck = X.map((x, i) => deckAt(x, Y[i])), h = X.map((x, i) => deck[i] ?? h1(x, Y[i])), fixed = X.map((x, i) => deck[i] !== null || inZone(x, Y[i], 0)), Lo = h.map((v, i) => fixed[i] ? v : -1e9), Up = h.map((v, i) => fixed[i] ? v : 1e9), dist = i => Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]) * 1000 * GRADE;
      for (let i = 1; i < n; i++) { Lo[i] = Math.max(Lo[i], Lo[i - 1] - dist(i)); Up[i] = Math.min(Up[i], Up[i - 1] + dist(i)); }
      for (let i = n - 2; i >= 0; i--) { Lo[i] = Math.max(Lo[i], Lo[i + 1] - dist(i + 1)); Up[i] = Math.min(Up[i], Up[i + 1] + dist(i + 1)); }
      const T = h.map((v, i) => fixed[i] ? v : clamp(v, Lo[i], Up[i])); // then no stretch of open road steeper than the grade either: the high side is cut down
      for (let i = 1; i < n; i++) if (!fixed[i]) T[i] = Math.max(Lo[i], Math.min(T[i], T[i - 1] + dist(i)));
      for (let i = n - 2; i >= 0; i--) if (!fixed[i]) T[i] = Math.max(Lo[i], Math.min(T[i], T[i + 1] + dist(i + 1)));
      for (let i = 0; i < n; i++) { if (fixed[i] || onSpan(X[i], Y[i])) continue; const t = T[i]; if (Math.abs(t - h[i]) < .3) continue;
        const ci = gi(X[i]), cj = gi(Y[i]), fill = t > h[i];
        for (let jj = Math.floor(cj) - 3; jj <= Math.ceil(cj) + 3; jj++) for (let ii = Math.floor(ci) - 3; ii <= Math.ceil(ci) + 3; ii++) { if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue; const x = gx(ii), y = gx(jj); if (inZone(x, y, 0) || onSpan(x, y)) continue;
          const lat = Math.hypot(x - X[i], y - Y[i]) * 1000, side = Math.max(0, lat - CELL * .8) * .8, id = jj * GW + ii; if (fill) { if (H[id] < t - side) H[id] = t - side; } else if (H[id] > t + side) H[id] = t + side; } } } }
  // town buildings and checkpoint interiors
  const R = rng(M.seed * 977);
  M.buildings = []; M.gardens = [];
  const free = (x, y, r) => sampleKm(M, x, y) > 3 && M.ROAD[Math.round(gi(y)) * GW + Math.round(gi(x))] !== 2 && !M.buildings.some(b => Math.hypot(b[0] - x, b[1] - y) < r) && !M.zones.some(z => Math.hypot(x - z.x, y - z.y) < Math.max(z.hx, z.hy) + .04);
  for (const t of M.towns) { // houses lined up along the roads through town, facing the street, with gardens behind
    let placed = 0;
    for (const r of M._roads) for (let k = 0; k < r.P.length - 1; k++) {
      const a = r.P[k], b = r.P[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, ang = Math.atan2(uy, ux);
      for (let s = 0; s < L; s += .02 + R() * .012) {
        const cx = a[0] + ux * s, cy = a[1] + uy * s; if (Math.hypot(cx - t.x, cy - t.y) > t.r * 1.35) continue;
        for (const side of [-1, 1]) for (const row of [0, 1]) {
          if (row && R() < .45) continue;
          const w = .01 + R() * .008, d = .008 + R() * .005, off = (r.main ? .016 : .012) + d / 2 + row * .03 + R() * .004;
          const x = cx - uy * side * off, y = cy + ux * side * off;
          if (Math.hypot(x - t.x, y - t.y) > t.r * 1.3 || !free(x, y, .014)) continue;
          M.buildings.push([x, y, w, d, ang + (R() - .5) * .06]); placed++;
          if (R() < .7) M.gardens.push([x - uy * side * (d / 2 + .008), y + ux * side * (d / 2 + .008)]);
        }
      }
    }
    if (placed > 12) continue;
    const ta = R() * Math.PI;
    for (let k = 0; k < 48; k++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * t.r, x = t.x + Math.cos(a) * rr, y = t.y + Math.sin(a) * rr;
      if (!free(x, y, .014)) continue;
      M.buildings.push([x, y, .012 + R() * .014, .009 + R() * .01, ta + (R() < .5 ? 0 : Math.PI / 2) + (R() - .5) * .1]);
    }
  }
  for (const p of M._cps) {
    const [dx, dy] = CP_DIM[p.size], cnt = { S: 3, M: 9, L: 22 }[p.size], b = [];
    for (let k = 0, tries = 0; k < cnt && tries < 900; tries++) {
      const w = (p.size === 'L' ? .022 : p.size === 'M' ? .016 : .009) + R() * (p.size === 'S' ? .006 : .016), h = (p.size === 'S' ? .006 : .01) + R() * .01;
      const fx = (R() - .5) * (dx - w - .03), fy = (R() - .5) * (dy - h - .03);
      if (Math.abs(fy) < .016 + h / 2) continue; // keep the road through the middle open
      if (p.size === 'L' && Math.abs(fx) < .06 && Math.abs(fy) < .05) continue; // parade ground
      if (M._rivers.some(r => r.canal) && p.size === 'L' && Math.abs(fx) < .03 + w / 2) continue; // the canal runs through the fort
      if (b.some(o => Math.abs(o[0] - fx) < (o[2] + w) / 2 + .012 && Math.abs(o[1] - fy) < (o[3] + h) / 2 + .012)) continue;
      b.push([fx, fy, w, h]); k++;
    }
    p.blds = b;
  }
  M._docks = M.docks.map(d => { let x = d.x, y = d.y; for (let k = 0; k < 200 && sampleKm(M, x, y) > 0; k++) { x += Math.cos(d.ang) * .02; y += Math.sin(d.ang) * .02; } return { ...d, x: x - Math.cos(d.ang) * .05, y: y - Math.sin(d.ang) * .05 }; });
  // the front-line route: the first main road runs base -> 5 checkpoints -> base
  M.route = M._roads[0].P.map(p => [p[0] * 1000, p[1] * 1000]);
  M.routeLen = [0]; for (let k = 1; k < M.route.length; k++) M.routeLen.push(M.routeLen[k - 1] + Math.hypot(M.route[k][0] - M.route[k - 1][0], M.route[k][1] - M.route[k - 1][1]));
  const along = (x, z) => { let best = 1e18, s = 0; for (let k = 0; k < M.route.length - 1; k++) { const a = M.route[k], b = M.route[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; let t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1); const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z); if (d < best) { best = d; s = M.routeLen[k] + t * Math.sqrt(l2); } } return s; };
  M.routeAt = along;
  M._cps.forEach(p => p.s = along(p.x * 1000, p.y * 1000));
  M.bases.forEach(b => b.s = along(b.x * 1000, b.y * 1000));
  return M;
}
function sampleKm(M, x, y) { // bilinear height, km in
  const fx = clamp(gi(x), 0, GW - 1.001), fy = clamp(gi(y), 0, GH - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, H = M.H, id = j * GW + i;
  return lerp(lerp(H[id], H[id + 1], u), lerp(H[id + GW], H[id + GW + 1], u), v);
}

/* the map picture for the minimap, the deploy screen and the big map: a printed tactical map, two pixels per grid point.
   Muted tints by height, hill shading, a contour every 50 m (heavier every 200 m), woods, roads, runways, a dark coastline, paper grain.
   The grid, names and markers are drawn over it each time (game.js), so they stay sharp at any size. */
const LAND_RAMP = [[0, [166, 160, 124]], [8, [156, 156, 118]], [40, [150, 153, 112]], [120, [154, 149, 110]], [220, [164, 150, 112]], [340, [171, 153, 117]], [480, [172, 158, 130]], [640, [180, 172, 152]], [820, [198, 194, 182]], [1000, [216, 214, 206]]];
const SEA_RAMP = [[-160, [19, 28, 37]], [-60, [23, 35, 46]], [-22, [28, 44, 57]], [-7, [36, 56, 70]], [0, [50, 74, 87]]];
function ramp(st, h, out) {
  if (h <= st[0][0]) { const c = st[0][1]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return; }
  for (let k = 1; k < st.length; k++) if (h <= st[k][0]) { const a = st[k - 1], b = st[k], t = (h - a[0]) / (b[0] - a[0]); out[0] = lerp(a[1][0], b[1][0], t); out[1] = lerp(a[1][1], b[1][1], t); out[2] = lerp(a[1][2], b[1][2], t); return; }
  const c = st[st.length - 1][1]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}
function mapImage(M) {
  const S = 2, W = GW * S, Hh = GH * S, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d'), img = g.createImageData(W, Hh), d = img.data, col = [0, 0, 0], H = M.H, F = M.F;
  const hs = new Float32Array(W * Hh), fs = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { // heights and woods, smoothed between grid points
    const fx = clamp((x + .5) / S - .5, 0, GW - 1.001), fy = clamp((y + .5) / S - .5, 0, GH - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, id = j * GW + i;
    hs[y * W + x] = lerp(lerp(H[id], H[id + 1], u), lerp(H[id + GW], H[id + GW + 1], u), v);
    fs[y * W + x] = lerp(lerp(F[id], F[id + 1], u), lerp(F[id + GW], F[id + GW + 1], u), v);
  }
  let seed = (M.seed || 1) * 9301 + 49297; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const id = y * W + x, h = hs[id], o = id * 4, r = x < W - 1 ? hs[id + 1] : h, b = y < Hh - 1 ? hs[id + W] : h, l = x > 0 ? hs[id - 1] : h, t = y > 0 ? hs[id - W] : h;
    if (h < 0) { ramp(SEA_RAMP, h, col); if (r >= 0 || b >= 0 || l >= 0 || t >= 0) { col[0] = 14; col[1] = 20; col[2] = 26; } } // (the dark line is the coast)
    else {
      ramp(LAND_RAMP, h, col);
      const f = clamp((fs[id] - .35) / .3, 0, 1); if (f > 0) { const k = f * (.6 + .08 * ((x * 7 + y * 13) % 5 === 0)); col[0] = lerp(col[0], 92, k); col[1] = lerp(col[1], 108, k); col[2] = lerp(col[2], 80, k); }
      const dx = (r - l) / (CELL / S) , dy = (b - t) / (CELL / S), sh = (dx * .62 + dy * .62 + .48) / Math.hypot(dx, dy, 1) / .48;
      const m = clamp(1 + (sh - 1) * .85, .55, 1.25); col[0] *= m; col[1] *= m; col[2] *= m;
      const c0 = Math.floor(h / 50); if (c0 !== Math.floor(r / 50) || c0 !== Math.floor(b / 50)) { const k = Math.max(c0, Math.floor(r / 50), Math.floor(b / 50)) % 4 === 0 ? .66 : .82; col[0] *= k * .98; col[1] *= k * .95; col[2] *= k * .9; } // contours, in brown ink
    }
    const n = (rnd() - .5) * 11; // paper grain
    d[o] = col[0] + n; d[o + 1] = col[1] + n; d[o + 2] = col[2] + n; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.save(); g.scale(W / KMW, Hh / KMH); g.lineCap = g.lineJoin = 'round';
  const path = P => { g.beginPath(); P.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };
  for (const a of M.airfields) { g.save(); g.translate(a.x, a.y); g.rotate(a.ang); g.fillStyle = '#23292c'; g.fillRect(-a.len / 2 - .012, -.045, a.len + .024, .09); g.fillStyle = '#c4c4b8'; g.fillRect(-a.len / 2, -.033, a.len, .066); g.restore(); }
  for (const r of M._roads) if (!r.main) { path(r.P); g.setLineDash([.09, .06]); g.strokeStyle = 'rgba(58,44,30,.85)'; g.lineWidth = .026; g.stroke(); }
  g.setLineDash([]);
  for (const r of M._roads) if (r.main) { path(r.P); g.strokeStyle = '#2a2a22'; g.lineWidth = .078; g.stroke(); }
  for (const r of M._roads) if (r.main) { path(r.P); g.strokeStyle = '#e4dab4'; g.lineWidth = .044; g.stroke(); }
  g.restore();
  // the creases of a map that has been folded and carried about, and darker worn edges
  for (const fx of [W / 3, 2 * W / 3]) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(fx | 0, 0, 1, Hh); g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect((fx | 0) + 1, 0, 1, Hh); }
  { const fy = Hh / 2 | 0; g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, fy, W, 1); g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(0, fy + 1, W, 1); }
  const vg = g.createRadialGradient(W / 2, Hh / 2, Hh * .45, W / 2, Hh / 2, W * .62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.34)'); g.fillStyle = vg; g.fillRect(0, 0, W, Hh);
  return cv;
}
