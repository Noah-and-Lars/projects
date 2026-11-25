import { compositeMap, defineMod } from '../../src/mods/kit';
import { spawnVehicle } from '../../src/sim/prefabs/vehicles';
import farm from './haywick-farm.mod';
import fort from './harrowmoor-bastion.mod';
import nursery from './fernhollow-nursery.mod';
import close from './maple-close.mod';
import plaza from './copperleaf-plaza.mod';
import carpark from './stackhouse-car-park.mod';
import sidings from './cinder-sidings.mod';
import scrap from './rustbelt-scrapyard.mod';
import brick from './brickfield.mod';

/** A big map: nine sites on a 3 x 3 grid joined by roads (about 256 m across). */
export default defineMod({
  id: 'gullmouth-county', name: 'Gullmouth County', category: 'maps', author: 'Wrecking Shift',
  description: 'A big map, about 256 m across: farm, fort ruins, nursery, a suburb, an office plaza, a car park, a rail yard, a scrapyard and a brickworks, joined by roads. Bring a car.',
  maps: [compositeMap({
    id: 'gullmouth-county', title: 'Gullmouth County', blurb: 'big map · 9 sites + roads', sky: 'day',
    cells: [
      [farm.maps![0], fort.maps![0], nursery.maps![0]],
      [close.maps![0], plaza.maps![0], carpark.maps![0]],
      [sidings.maps![0], scrap.maps![0], brick.maps![0]],
    ],
    extra(sim, _rng, roads) {
      // cars parked along the roads near the spawn crossroads
      const x = roads.x[0], z = roads.z[0];
      spawnVehicle(sim, 'hatchback', x + 3, 0, z - 10, 0);
      spawnVehicle(sim, 'van', x - 3, 0, z + 12, Math.PI);
      spawnVehicle(sim, 'loader', roads.x[1] + 3, 0, roads.z[1] - 14, 0);
      spawnVehicle(sim, 'hatchback', roads.x[1] - 3, 0, z + 20, Math.PI);
    },
  })],
});
