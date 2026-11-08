// Small helpers the film's modules share: seeded randomness (so every
// frame of the film is the same each time it's drawn), easing, and curves.

import * as THREE from 'three';

// A seeded random number generator (mulberry32): rng() gives 0..1.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));

// A monotone curve through points [[x, y], ...] (x increasing): never
// overshoots, so a time map made with it never runs backwards.
export function monotone(points) {
  const n = points.length;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  // (Fritsch and Carlson's slopes: a weighted harmonic mean of the slopes
  // either side, or flat where the curve turns.)
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

// A smooth path through points (centripetal Catmull-Rom), at u in 0..1
// spread evenly over the keys' own u values.
export function pathAt(points, us, u, out = new THREE.Vector3()) {
  const n = points.length;
  if (n === 1 || u <= us[0]) return out.copy(points[0]);
  if (u >= us[n - 1]) return out.copy(points[n - 1]);
  let i = 0;
  while (u > us[i + 1]) i++;
  const t = (u - us[i]) / Math.max(1e-9, us[i + 1] - us[i]);
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
  // (A uniform Catmull-Rom with its tangents scaled by the keys' spacing,
  // so uneven keys don't kink.)
  const h = us[i + 1] - us[i];
  const h0 = i > 0 ? us[i] - us[i - 1] : h;
  const h1 = i + 2 < n ? us[i + 2] - us[i + 1] : h;
  const m1 = new THREE.Vector3().subVectors(p2, p0).multiplyScalar(h / (h + h0));
  const m2 = new THREE.Vector3().subVectors(p3, p1).multiplyScalar(h / (h + h1));
  if (i === 0) m1.subVectors(p2, p1);
  if (i + 2 >= n) m2.subVectors(p2, p1);
  const t2 = t * t, t3 = t2 * t;
  out.copy(p1).multiplyScalar(2 * t3 - 3 * t2 + 1)
    .addScaledVector(m1, t3 - 2 * t2 + t)
    .addScaledVector(p2, -2 * t3 + 3 * t2)
    .addScaledVector(m2, t3 - t2);
  return out;
}

// A canvas texture drawn by draw(context, width, height).
export function canvasTexture(width, height, draw, { srgb = true, repeat = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// Smooth value noise on a canvas-sized grid that tiles: a few octaves.
export function tileNoise(width, height, rng, octaves = [[8, 0.5], [32, 0.3], [128, 0.2]]) {
  const out = new Float32Array(width * height);
  for (const [cells, weight] of octaves) {
    const cw = cells, ch = Math.max(1, Math.round((cells * height) / width));
    const grid = new Float32Array(cw * ch).map(() => rng());
    for (let y = 0; y < height; y++) {
      const gy = (y / height) * ch, y0 = Math.floor(gy), fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < width; x++) {
        const gx = (x / width) * cw, x0 = Math.floor(gx), fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const a = grid[(y0 % ch) * cw + (x0 % cw)], b = grid[(y0 % ch) * cw + ((x0 + 1) % cw)];
        const c = grid[((y0 + 1) % ch) * cw + (x0 % cw)], d = grid[((y0 + 1) % ch) * cw + ((x0 + 1) % cw)];
        out[y * width + x] += weight * lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
      }
    }
  }
  return out;
}
