// Spatial light selection: the street is cut into cells along z and every
// cell gets its own CDF over *all* lights, weighted by emitted power and the
// inverse squared distance to the cell. Shading points pick lights from their
// cell's CDF, so nearby neon dominates; the dense table keeps the selection
// probability available for MIS at emissive hits.

import type { SceneData } from '../world/geometry';

export interface LightGrid {
  /** cellCount x lightCount cumulative probabilities, row-major by cell. */
  cdf: Float32Array;
  cellCount: number;
  z0: number;
  cellSize: number;
}

const TRI_FLOATS = 16;

export function buildLightGrid(scene: SceneData, zMin: number, zMax: number, cellSize = 6): LightGrid {
  const n = scene.lightCount;
  const cellCount = Math.max(1, Math.ceil((zMax - zMin) / cellSize));
  const cdf = new Float32Array(cellCount * Math.max(n, 1));
  if (n === 0) return { cdf, cellCount, z0: zMin, cellSize };

  // Light centroids and raw power (luminance x area, matching the global CDF).
  const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n), power = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = scene.lightTris[i] * TRI_FLOATS;
    cx[i] = (scene.tris[t] + scene.tris[t + 4] + scene.tris[t + 8]) / 3;
    cy[i] = (scene.tris[t + 1] + scene.tris[t + 5] + scene.tris[t + 9]) / 3;
    cz[i] = (scene.tris[t + 2] + scene.tris[t + 6] + scene.tris[t + 10]) / 3;
    const prev = i > 0 ? scene.lightCdf[i - 1] : 0;
    power[i] = Math.max(scene.lightCdf[i] - prev, 1e-9);
  }

  const w = new Float64Array(n);
  for (let c = 0; c < cellCount; c++) {
    const zc = zMin + (c + 0.5) * cellSize;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const dx = cx[i], dy = cy[i] - 1.5, dz = cz[i] - zc;
      // Distance measured from the cell's centre line; the floor term keeps a
      // tiny probability for every light so the estimator stays unbiased.
      const d2 = Math.max(dx * dx + dy * dy + dz * dz, 4);
      w[i] = power[i] * (1 / d2 + 1 / 6000);
      total += w[i];
    }
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += w[i] / total;
      cdf[c * n + i] = acc;
    }
    cdf[c * n + n - 1] = 1;
  }
  return { cdf, cellCount, z0: zMin, cellSize };
}
