// Shared camera viewpoints + helpers for the look tests (testyard level).
import fs from 'node:fs';
import path from 'node:path';
import { outDir } from './harness.mjs';

/** eye x,y,z, yaw, pitch (yaw 0 looks toward -Z) */
export const VIEWS = {
  overview: [7.5, 4.2, 3.5, 0.55, -0.25],
  street: [1.5, 1.7, 3.5, 0.25, 0.02],
  interior: [-2.6, 1.6, -12.6, -2.25, -0.12],
  interior2: [2.8, 1.7, -9.2, 0.95, -0.2],
  blast: [3.6, 1.6, -3.4, 0.38, -0.05],
  debris: [2.6, 0.9, -5.2, 0.35, -0.3],
  sunward: [-9, 1.7, -5, -2.25, 0.08],
  crates2: [-2.5, 1.5, -7.5, -2.43, -0.2],
  shed: [10.5, 1.6, 6.5, 0.1, 0.0],
  crates: [1.8, 1.2, -1.6, 0.55, -0.25],
};

export async function setCam(page, v) {
  const [x, y, z, yaw, pitch] = typeof v === 'string' ? VIEWS[v] : v;
  await page.evaluate(([x, y, z, yaw, pitch]) => { window.__game.game.cameraOverride = { eye: { x, y, z }, yaw, pitch }; }, [x, y, z, yaw, pitch]);
}

export async function snap(page, name) {
  fs.mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => { window.__game.render(); window.__game.render(); });
  const file = path.join(outDir, name + '.png');
  await page.screenshot({ path: file });
  return file;
}

export async function look(page, quality, tod) {
  await page.evaluate(([q, t]) => { const r = window.__game.game.renderer; if (q) r.setQuality(q); if (t) r.setTimeOfDay(t); }, [quality, tod]);
}
