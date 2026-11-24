/** Missions on the Test Yard (src/sim/levels/testyard.ts). */
import { tagBodies, type MissionDef } from '../../sim/mission';
import { alarmBox, goldIdol, paintCan, serverBox, valuable } from '../../sim/missionProps';
import { nearestNamed } from './helpers';

/** Demo heist on the test yard: two alarmed targets, one optional, three valuables. */
export const housewarming: MissionDef = {
  id: 'housewarming',
  levelId: 'testyard',
  title: 'Housewarming',
  client: 'Dottie Fenwick, Fenwick & Daughter Realty',
  brief:
    'Contractor — when my partner Ambrose Pell and I split the firm, he walked off with three things. ' +
    'Only one of them was his. The other two are at his place on Tanner\'s Row.\n\n' +
    'The Gold Idol sits on his kitchen table like a fruit bowl. The Server Box in his shed has our client ledger on it. ' +
    'Both are wired to cheap alarm boxes: the moment either one moves, Gullmouth Private Security is on its way, ' +
    'and they are annoyingly punctual. Sixty seconds, give or take a doughnut.\n\n' +
    'If you see a tin of Harbour Blue paint, take that too. He painted my boat with it. Out of spite.\n\n' +
    'Your van is parked by the gate. Plan the route first, then work fast.',
  objectives: [
    { kind: 'collect', id: 'idol', title: 'Take the Gold Idol from the house' },
    { kind: 'collect', id: 'server', title: 'Take the Server Box from the shed' },
    { kind: 'collect', id: 'paint', title: 'Take the Harbour Blue paint', required: false },
  ],
  alarmSeconds: 60,
  fireAlarm: 150,
  reward: { cash: 250 },
  setup(sim) {
    // house kitchen table top is at y = 1.1 (x 1.0..2.6, z -11..-9.6)
    goldIdol(sim, { x: 1.55, y: 1.12, z: -10.55 }, 'idol');
    alarmBox(sim, { x: 0.3, y: 1.3, z: -8.5 }, 'idol', 'z'); // on the back wall, inside
    // shed floor at y = 0.2; right wall inner face at x = 13.8
    serverBox(sim, { x: 12.6, y: 0.21, z: -0.2 }, 'server');
    alarmBox(sim, { x: 13.6, y: 1.0, z: 0.1 }, 'server', 'x');
    paintCan(sim, { x: -8.3, y: 0.02, z: 2.9 }, 'paint');
    valuable(sim, { x: 0.55, y: 1.72, z: -3.85 }, 'coins', 60, 'Jar of Ferry Tokens');
    valuable(sim, { x: -2.5, y: 0.31, z: -12 }, 'trophy', 120, 'Darts League Trophy');
    valuable(sim, { x: 9.2, y: 0.21, z: 1.5 }, 'bottle', 35, 'Bottle of Gullmouth Rum');
  },
};

/** Demolition job on the same yard: no alarm boxes, but a fire alarm. */
export const shedHappens: MissionDef = {
  id: 'shed-happens',
  levelId: 'testyard',
  title: 'Shed Happens',
  client: 'Barnaby Thrupp, Thrupp & Nephew Salvage',
  brief:
    'The council calls the shed on Tanner\'s Row "structurally historic". I call it structurally in my way.\n\n' +
    'Turn a good quarter of it into scrap so the inspector condemns it on Monday. Nobody lives there and nobody ' +
    'will mind the noise — but the neighbours have the fire brigade on speed dial and a lot of free time, ' +
    'so keep any fires small or you will have company.\n\n' +
    'Bonus if the old pear tree by the gate comes down too. It drops fruit on my car. Every. Single. Autumn.',
  objectives: [
    { kind: 'destroy', id: 'shed', title: 'Wreck 25% of the shed', percent: 25 },
    { kind: 'demolish', id: 'pear', title: 'Fell the pear tree (below 1 m)', height: 1.0, required: false },
  ],
  alarmSeconds: 45,
  fireAlarm: 120,
  reward: { cash: 400 },
  unlockAfter: ['housewarming'],
  setup(sim) {
    tagBodies(sim, (b) => b.name === 'shed', 'destroy:shed');
    nearestNamed(sim, 'tree', 3, 9)?.tags.add('destroy:pear');
    valuable(sim, { x: -6, y: 0.02, z: -6 }, 'record', 45, 'Scratched Sea-Shanty LP');
  },
};

export const TESTYARD_MISSIONS: MissionDef[] = [housewarming, shedHappens];
