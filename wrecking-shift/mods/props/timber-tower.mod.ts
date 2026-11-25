import type { VoxelBody } from '../../src/sim/body';
import { MAT, box, defineMod, pal, planks, vox } from '../../src/mods/kit';
import { placeLocal } from './_util';

const block = (seed: number) => vox(3, 2, 9, (g) => {
  box(g, 0, 0, 0, 3, 2, 9, planks(MAT.wood, 2, seed, 'z'));
  box(g, 0, 0, 0, 3, 2, 1, pal(MAT.wood, 0)); box(g, 0, 0, 8, 3, 2, 9, pal(MAT.wood, 0));
});

function tower(sim: Parameters<typeof placeLocal>[0], pos: Parameters<typeof placeLocal>[2], yaw: number, layers: number): VoxelBody[] {
  const out: VoxelBody[] = [];
  for (let l = 0; l < layers; l++) {
    const y = l * 0.205;
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 0.305;
      // alternate layers cross at right angles
      if (l % 2 === 0) out.push(placeLocal(sim, block(l * 3 + i), pos, yaw, off, y, 0, 'timber block'));
      else out.push(placeLocal(sim, block(l * 3 + i), pos, yaw, 0, y, off, 'timber block', { spin: Math.PI / 2 }));
    }
  }
  return out;
}

/** A stacking-blocks tower in lumber scale: three beams per layer, crossed, each one loose. */
export default defineMod({
  id: 'timber-tower', name: 'Timber Tower', category: 'props', author: 'Wrecking Shift',
  description: 'Loose timber beams stacked three to a layer in crossed courses. Pull one out with the grabber, or just shoot the bottom.',
  props: [
    { id: 'timber-tower-short', name: 'Timber tower (8 layers)', group: 'Toys', spawn: (sim, pos, yaw) => tower(sim, pos, yaw, 8) },
    { id: 'timber-tower-tall', name: 'Timber tower (16 layers)', group: 'Toys', spawn: (sim, pos, yaw) => tower(sim, pos, yaw, 16) },
  ],
});
