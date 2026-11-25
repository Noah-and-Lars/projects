import { compositeMap, defineMod } from '../../src/mods/kit';
import { spawnVehicle } from '../../src/sim/prefabs/vehicles';
import a from '../modes/tower-takedown.mod';
import b from '../modes/clock-out-quota.mod';
import c from '../modes/blaze-brigade.mod';
import d from '../modes/gilded-sweep.mod';
import e from '../modes/last-charge.mod';
import f from '../modes/rooftop-relay.mod';
import g from '../modes/dummy-drop.mod';
import h from '../modes/shell-shock.mod';
import i from '../modes/bare-knuckle-run.mod';

/** A big town map: nine small town sites on a 3 x 3 grid with streets between them. */
export default defineMod({
  id: 'hollin-borough', name: 'Hollin Borough', category: 'maps', author: 'Wrecking Shift',
  description: 'A big town map, about 175 m across: a tower block, terraces, timber houses, a market square, a water tower, rooftops, a test range and more, with streets between them.',
  maps: [compositeMap({
    id: 'hollin-borough', title: 'Hollin Borough', blurb: 'big map · 9 town blocks', sky: 'sunset', cell: 51.2, road: 9.6,
    cells: [
      [a.maps![0], b.maps![0], c.maps![0]],
      [d.maps![0], e.maps![0], f.maps![0]],
      [g.maps![0], h.maps![0], i.maps![0]],
    ],
    extra(sim, _rng, roads) {
      spawnVehicle(sim, 'hatchback', roads.x[0] + 2.5, 0, roads.z[0] - 9, 0);
      spawnVehicle(sim, 'van', roads.x[1] - 2.5, 0, roads.z[1] + 9, Math.PI);
    },
  })],
});
