// Map previews: every sandbox map (built-in + mods) builds a 3D preview without physics, in reasonable time.
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/game/levels';
import { buildPreview } from '../../src/render/mapPreview';

describe('map previews', () => {
  for (const def of Object.values(LEVELS)) {
    it(`preview of ${def.id}`, () => {
      const d = buildPreview(def);
      const tris = (d.geometry.index?.count ?? 0) / 3;
      console.log(`${def.id}: ${d.size.toFixed(0)} m, cell ${d.cell.toFixed(1)} m, ${tris} tris, ${d.ms.toFixed(0)} ms`);
      expect(tris).toBeGreaterThan(100);
      expect(tris).toBeLessThan(600000);
      expect(d.geometry.boundingSphere!.radius).toBeGreaterThan(5);
    });
  }
});
