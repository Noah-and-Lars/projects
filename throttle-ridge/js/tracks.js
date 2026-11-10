// Track data and geometry.
//
// Each track is an array of feature entries. A builder expands the features
// into height control points, and a cubic Hermite spline (Catmull-Rom style
// tangents, with optional sharp corners for jump lips) smooths them into a
// dense ground profile. Heights and lengths are in metres.
//
// Feature reference (h = height, all lengths along x):
//   ['flat', len]
//   ['roller', h, len]                     smooth bump
//   ['table', h, face, top, back]          tabletop
//   ['double', h, face, gap, back]         lip, gap, landing hump
//   ['triple', h, face, span, back]        lip, two gaps, landing
//   ['whoops', count, h, spacing]
//   ['stepup', h, face, gap, rise]         jump up onto a higher plateau
//   ['drop', h, len]                       sheer edge then a downslope landing
//   ['up', h, len] / ['down', h, len]      gentle level change

export const TRACKS = [
  {
    id: 'meadow',
    theme: 'grassland',
    name: 'Meadow Run',
    tagline: 'Tabletops and rollers to warm up',
    sky: ['#3d95f5', '#c4e8ff'],
    ground: '#5cba3c',
    features: [
      ['flat', 30],
      ['roller', 1.0, 12],
      ['flat', 10],
      ['table', 2.2, 8, 12, 9],
      ['flat', 16],
      ['roller', 1.2, 11], ['roller', 1.2, 11],
      ['flat', 12],
      ['table', 2.6, 9, 14, 10],
      ['flat', 18],
      ['up', 2, 14],
      ['flat', 10],
      ['down', 2, 14],
      ['flat', 14],
      ['table', 3.0, 9, 16, 11],
      ['flat', 16],
      ['roller', 1.4, 12],
      ['flat', 12],
      ['table', 2.4, 8, 12, 9],
      ['flat', 16],
      ['roller', 1.0, 10], ['roller', 1.0, 10], ['roller', 1.0, 10],
      ['flat', 14],
      ['table', 2.8, 9, 15, 10],
      ['flat', 16],
      ['up', 2.5, 16],
      ['table', 2.2, 8, 12, 9],
      ['flat', 10],
      ['down', 2.5, 16],
      ['flat', 14],
      ['roller', 1.3, 12],
      ['flat', 12],
      ['table', 3.2, 10, 16, 11],
      ['flat', 16],
      ['table', 2.4, 8, 12, 9],
      ['flat', 20],
    ],
  },
  {
    id: 'dustbowl',
    theme: 'desert',
    name: 'Dust Bowl',
    tagline: 'Doubles and your first whoops',
    sky: ['#4a9ff0', '#ffe0a3'],
    ground: '#e0ab62',
    features: [
      ['flat', 30],
      ['table', 2.4, 8, 12, 9],
      ['flat', 14],
      ['double', 2.6, 8, 9, 10],
      ['flat', 16],
      ['whoops', 6, 0.6, 3.6],
      ['flat', 14],
      ['double', 2.8, 8, 10, 11],
      ['flat', 14],
      ['roller', 1.3, 11],
      ['flat', 10],
      ['table', 3.0, 9, 15, 11],
      ['flat', 16],
      ['double', 3.0, 9, 11, 11],
      ['flat', 14],
      ['whoops', 8, 0.65, 3.6],
      ['flat', 14],
      ['double', 2.8, 8, 10, 10],
      ['flat', 16],
      ['up', 2, 14],
      ['double', 2.6, 8, 9, 10],
      ['flat', 10],
      ['down', 2, 14],
      ['flat', 12],
      ['whoops', 6, 0.6, 3.8],
      ['flat', 14],
      ['table', 3.0, 9, 14, 10],
      ['flat', 12],
      ['double', 3.0, 9, 11, 11],
      ['flat', 14],
      ['roller', 1.2, 11], ['roller', 1.2, 11],
      ['flat', 12],
      ['double', 3.2, 9, 12, 11],
      ['flat', 20],
    ],
  },
  {
    id: 'ridgeback',
    theme: 'forest',
    name: 'Pine Ridge',
    tagline: 'Step-ups, drop-offs and a triple',
    sky: ['#5b9fe0', '#d6eee4'],
    ground: '#3f8f3a',
    features: [
      ['flat', 30],
      ['double', 2.6, 8, 9, 10],
      ['flat', 14],
      ['stepup', 3.0, 8, 8, 2.2],
      ['flat', 18],
      ['drop', 2.2, 12],
      ['flat', 14],
      ['triple', 3.0, 9, 18, 11],
      ['flat', 16],
      ['whoops', 7, 0.6, 3.8],
      ['flat', 12],
      ['stepup', 3.2, 9, 9, 2.6],
      ['flat', 12],
      ['table', 2.6, 8, 12, 9],
      ['flat', 12],
      ['drop', 2.6, 13],
      ['flat', 14],
      ['double', 3.0, 9, 11, 11],
      ['flat', 16],
      ['roller', 1.3, 11],
      ['flat', 10],
      ['stepup', 3.0, 8, 8, 2.4],
      ['flat', 14],
      ['double', 2.8, 8, 10, 10],
      ['flat', 10],
      ['drop', 2.4, 12],
      ['flat', 14],
      ['triple', 3.2, 9, 19, 11],
      ['flat', 14],
      ['whoops', 6, 0.6, 3.8],
      ['flat', 14],
      ['table', 3.0, 9, 14, 10],
      ['flat', 20],
    ],
  },
  {
    id: 'canyon',
    theme: 'canyon',
    name: 'Red Canyon',
    tagline: 'Big triples and rhythm sections',
    sky: ['#f2763c', '#ffd49c'],
    ground: '#c4623a',
    features: [
      ['flat', 30],
      ['triple', 3.0, 9, 18, 11],
      ['flat', 14],
      ['whoops', 9, 0.62, 3.8],
      ['flat', 12],
      ['stepup', 3.4, 9, 9, 2.8],
      ['flat', 10],
      ['drop', 3.0, 14],
      ['flat', 12],
      ['double', 3.2, 9, 12, 11],
      ['flat', 8],
      ['double', 3.0, 9, 11, 11],
      ['flat', 14],
      ['triple', 3.4, 10, 20, 12],
      ['flat', 14],
      ['up', 3, 16],
      ['table', 2.6, 8, 12, 9],
      ['flat', 8],
      ['drop', 3.0, 14],
      ['flat', 12],
      ['whoops', 8, 0.62, 3.8],
      ['flat', 12],
      ['double', 3.2, 9, 12, 11],
      ['flat', 14],
      ['stepup', 3.2, 9, 9, 2.6],
      ['flat', 8],
      ['stepup', 3.2, 9, 9, 2.6],
      ['flat', 10],
      ['drop', 3.0, 14],
      ['flat', 6],
      ['drop', 2.2, 12],
      ['flat', 14],
      ['triple', 3.4, 10, 20, 12],
      ['flat', 12],
      ['whoops', 8, 0.62, 3.8],
      ['flat', 12],
      ['double', 3.2, 9, 12, 11],
      ['flat', 20],
    ],
  },
  {
    id: 'thunder',
    theme: 'stadium',
    name: 'Thunder Arena',
    tagline: 'Night race under the floodlights',
    sky: ['#060a22', '#27336a'],
    ground: '#3b7a36',
    features: [
      ['flat', 30],
      ['double', 3.0, 9, 11, 11],
      ['flat', 8],
      ['triple', 3.4, 10, 20, 12],
      ['flat', 12],
      ['stepup', 3.6, 9, 10, 3.0],
      ['flat', 8],
      ['stepup', 3.4, 9, 9, 2.8],
      ['flat', 10],
      ['drop', 3.4, 15],
      ['flat', 6],
      ['drop', 2.4, 12],
      ['flat', 12],
      ['whoops', 10, 0.62, 3.8],
      ['flat', 12],
      ['triple', 3.6, 10, 21, 12],
      ['flat', 8],
      ['double', 3.2, 9, 12, 11],
      ['flat', 8],
      ['double', 3.2, 9, 12, 11],
      ['flat', 14],
      ['up', 3, 14],
      ['table', 3.0, 9, 14, 10],
      ['flat', 6],
      ['drop', 3.0, 14],
      ['flat', 10],
      ['whoops', 8, 0.62, 3.8],
      ['flat', 22],
      ['triple', 3.6, 10, 21, 12],
      ['flat', 12],
      ['stepup', 3.4, 9, 9, 2.8],
      ['flat', 8],
      ['stepup', 3.4, 9, 9, 2.8],
      ['flat', 8],
      ['drop', 3.2, 15],
      ['flat', 6],
      ['drop', 2.6, 13],
      ['flat', 12],
      ['double', 3.4, 10, 12, 11],
      ['flat', 8],
      ['triple', 3.6, 10, 21, 12],
      ['flat', 12],
      ['whoops', 10, 0.62, 3.8],
      ['flat', 14],
      ['double', 3.4, 10, 12, 11],
      ['flat', 20],
    ],
  },
];

const PRE_START = 40; // metres of flat ground behind the gate
const RUN_OUT = 70;   // metres of flat ground past the finish line

// Expand features into control points [x, y, sharp].
function expand(features) {
  const pts = [[-PRE_START, 0, 0], [0, 0, 0]];
  const lips = [];      // x of jump lips (for flags)
  const flats = [];     // start x of flat sections (checkpoints)
  let x = 0, y = 0;
  const P = (px, py, sharp = 0) => pts.push([px, py, sharp]);

  for (const f of features) {
    const [type, a, b, c, d] = f;
    switch (type) {
      case 'flat':
        if (a >= 6) flats.push(x);
        x += a; P(x, y);
        break;
      case 'roller':
        P(x + b * 0.5, y + a); x += b; P(x, y);
        break;
      case 'up':
        P(x + b * 0.5, y + a * 0.5); x += b; y += a; P(x, y);
        break;
      case 'down':
        P(x + b * 0.5, y - a * 0.5); x += b; y -= a; P(x, y);
        break;
      case 'table': {
        const [h, face, top, back] = [a, b, c, d];
        kicker(x, y, h, face); lips.push(x + face);
        P(x + face + top, y + h, 1);
        P(x + face + top + back * 0.5, y + h * 0.48);
        x += face + top + back; P(x, y);
        break;
      }
      case 'double': {
        const [h, face, gap, back] = [a, b, c, d];
        kicker(x, y, h, face); const lip = x + face; lips.push(lip);
        P(lip + gap * 0.3, y + h * 0.3);
        P(lip + gap * 0.5, y + h * 0.12);
        P(lip + gap * 0.75, y + h * 0.45);
        P(lip + gap, y + h * 0.92, 1);
        P(lip + gap + back * 0.5, y + h * 0.44);
        x = lip + gap + back; P(x, y);
        break;
      }
      case 'triple': {
        const [h, face, span, back] = [a, b, c, d];
        kicker(x, y, h, face); const lip = x + face; lips.push(lip);
        const s = span / 3;
        P(lip + s * 0.5, y + h * 0.15);
        P(lip + s * 1.1, y + h * 0.55);
        P(lip + s * 1.5, y + h * 0.68);
        P(lip + s * 1.9, y + h * 0.55);
        P(lip + s * 2.5, y + h * 0.15);
        P(lip + s * 2.8, y + h * 0.45);
        P(lip + span, y + h * 0.92, 1);
        P(lip + span + back * 0.5, y + h * 0.44);
        x = lip + span + back; P(x, y);
        break;
      }
      case 'whoops': {
        const [n, h, sp] = [a, b, c];
        for (let i = 0; i < n; i++) {
          P(x + sp * (i + 0.5), y + h);
          P(x + sp * (i + 1), y);
        }
        x += n * sp;
        break;
      }
      case 'stepup': {
        const [h, face, gap, rise] = [a, b, c, d];
        kicker(x, y, h, face); const lip = x + face; lips.push(lip);
        P(lip + gap * 0.45, y + h * 0.35);
        P(lip + gap * 0.8, y + rise * 0.9);
        P(lip + gap, y + rise, 1);
        x = lip + gap; y += rise;
        P(x + 3, y);
        x += 3;
        break;
      }
      case 'drop': {
        const [h, len] = [a, b];
        P(x + 1.5, y, 1); lips.push(x + 1.5);
        P(x + 1.5 + len * 0.3, y - h * 0.42);
        P(x + 1.5 + len * 0.7, y - h * 0.9);
        x += 1.5 + len; y -= h; P(x, y);
        break;
      }
      default:
        throw new Error('Unknown track feature ' + type);
    }
  }
  return { pts, lips, flats, endX: x, endY: y };

  function kicker(x0, y0, h, face) {
    P(x0 + face * 0.3, y0 + h * 0.08);
    P(x0 + face * 0.62, y0 + h * 0.36);
    P(x0 + face * 0.86, y0 + h * 0.72);
    P(x0 + face, y0 + h, 1);
  }
}

// Cubic Hermite interpolation of y(x) through control points.
function smooth(ctrl, step = 0.5) {
  const n = ctrl.length;
  const mIn = new Array(n), mOut = new Array(n);
  const chord = i => (ctrl[i + 1][1] - ctrl[i][1]) / (ctrl[i + 1][0] - ctrl[i][0]);
  for (let i = 0; i < n; i++) {
    if (i === 0) { mIn[i] = mOut[i] = chord(0); continue; }
    if (i === n - 1) { mIn[i] = mOut[i] = chord(n - 2); continue; }
    if (ctrl[i][2]) { mIn[i] = chord(i - 1); mOut[i] = chord(i); continue; }
    const m = (ctrl[i + 1][1] - ctrl[i - 1][1]) / (ctrl[i + 1][0] - ctrl[i - 1][0]);
    mIn[i] = mOut[i] = m;
  }
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = ctrl[i], [x1, y1] = ctrl[i + 1];
    const w = x1 - x0;
    const segs = Math.max(1, Math.ceil(w / step));
    for (let s = 0; s < segs; s++) {
      const t = s / segs, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([x0 + w * t, h00 * y0 + h10 * w * mOut[i] + h01 * y1 + h11 * w * mIn[i + 1]]);
    }
  }
  out.push([ctrl[n - 1][0], ctrl[n - 1][1]]);
  return out;
}

export function buildTrack(def) {
  const { pts, lips, flats, endX, endY } = expand(def.features);
  const finishX = endX - 6;
  pts.push([endX + RUN_OUT, endY, 0]);
  const profile = smooth(pts);
  const xs = new Float64Array(profile.length);
  const ys = new Float64Array(profile.length);
  profile.forEach((p, i) => { xs[i] = p[0]; ys[i] = p[1]; });

  function index(x) {
    let lo = 0, hi = xs.length - 1;
    if (x <= xs[0]) return 0;
    if (x >= xs[hi]) return hi - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    return lo;
  }
  function heightAt(x) {
    const i = index(x);
    const t = Math.min(1, Math.max(0, (x - xs[i]) / (xs[i + 1] - xs[i])));
    return ys[i] + (ys[i + 1] - ys[i]) * t;
  }
  function slopeAt(x) {
    const i = index(x);
    return (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  }
  // Average slope over a short window: smoother for AI and landing checks.
  function slopeAround(x, w = 0.8) {
    return (heightAt(x + w) - heightAt(x - w)) / (2 * w);
  }
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < ys.length; i++) { minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]); }

  const checkpoints = [2, ...flats.filter(f => f > 5 && f < finishX - 5).map(f => f + 1)];
  return {
    def, xs, ys, heightAt, slopeAt, slopeAround,
    startX: 2, finishX, endX: endX + RUN_OUT,
    minX: -PRE_START, minY, maxY,
    lips, checkpoints,
  };
}
