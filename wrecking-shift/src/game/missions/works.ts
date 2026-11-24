/** Missions on Brackwater Works (src/sim/levels/works.ts); props are placed relative to the level's named markers. */
import { tagBodies, type MissionDef } from '../../sim/mission';
import { goldIdol, paintCan, serverBox, valuable } from '../../sim/missionProps';
import { hatchback, loader } from '../../sim/prefabs/vehicles';
import { at, escapeVan, wallAlarm } from './helpers';

export const longDrop: MissionDef = {
  id: 'long-drop',
  levelId: 'works',
  title: 'The Long Drop',
  client: 'Barnaby Thrupp, Thrupp & Nephew Salvage',
  brief:
    'Thirty metres of Brackwater brick, and every one of them worth forty pence to a reclamation yard. ' +
    'The only thing between me and that chimney is that it is still vertical.\n\n' +
    'Fell it. Nothing left above eight metres. If it happens to land on the boiler house, I get paid for that ' +
    'demolition as well, and so do you.\n\n' +
    'There is a loader in the yard with the keys in. There usually is.',
  objectives: [
    { kind: 'demolish', id: 'chimney', title: 'Fell the chimney (nothing above 8 m)', height: 0 },
    { kind: 'destroy', id: 'boiler', title: 'Wreck 35% of the boiler house', percent: 35, required: false },
  ],
  reward: { cash: 1700 },
  // also after Dead Weight: felling a 0.3 m brick shaft takes the sticky bombs (career 700); with only pipe bombs
  // (career 540 after Lights Out) the chimney could not be brought down (tests/unit/playthrough.test.ts)
  unlockAfter: ['lights-out', 'dead-weight'],
  setup(sim, lv) {
    escapeVan(sim, lv, Math.PI / 2);
    tagBodies(sim, (b) => b.tags.has('chimney'), 'destroy:chimney');
    tagBodies(sim, (b) => b.name === 'boiler house', 'destroy:boiler');
    (this.objectives[0] as any).height = at(lv, 'chimney_door', 0, 0, 0).y + 8;
    const y = at(lv, 'factory_yard');
    loader(sim, y.x, y.y, y.z, 0);
  },
};

export const payday: MissionDef = {
  id: 'payday',
  levelId: 'works',
  title: 'Friday Payday',
  client: 'the Brackwater night shift (collectively)',
  brief:
    'The Works has "restructured" our wages into the manager\'s safe three Fridays running.\n\n' +
    'The payroll server is on the top floor of the office block. The cash box sits in the boiler house because he ' +
    'thinks nobody would look there. The third thing is a crate on the loading dock across the canal marked ' +
    'MACHINE PARTS, which rattles like champagne. The server and the cash box are alarmed; forty-five seconds once you touch either.\n\n' +
    'Two bridges cross that canal. You might think about how many should still be standing when Works Security drives in.',
  objectives: [
    { kind: 'collect', id: 'payroll', title: 'Take the payroll server (office, top floor)' },
    { kind: 'collect', id: 'cash', title: 'Take the cash box (boiler house)' },
    { kind: 'collect', id: 'parts', title: 'Take the "machine parts" (loading dock)', required: false },
  ],
  alarmSeconds: 45,
  fireAlarm: 250,
  reward: { cash: 2200 },
  unlockAfter: ['dead-weight'],
  setup(sim, lv) {
    escapeVan(sim, lv, Math.PI / 2);
    serverBox(sim, at(lv, 'office_top', -0.6, 0.12, 0.5), 'payroll', 'Payroll Server');
    wallAlarm(sim, lv, 'office_top', 'payroll');
    goldIdol(sim, at(lv, 'boiler_house', 0.6, 0.12, 0.6), 'cash', 'Cash Box');
    wallAlarm(sim, lv, 'boiler_house', 'cash');
    paintCan(sim, at(lv, 'dock', 0.4, 0.12, 0.4), 'parts', '"Machine Parts"');
    valuable(sim, at(lv, 'office_lobby', 0.5, 0.12, 0.5), 'coins', 70, 'Vending Machine Float');
    valuable(sim, at(lv, 'silo_catwalk', 0.2, 0.12, 0), 'watch', 320, 'Foreman\'s Lost Watch');
    valuable(sim, at(lv, 'gantry_top', 0, 0.12, 1.2), 'trophy', 240, 'Crane Driver of the Year 1987');
    const p = at(lv, 'parking');
    hatchback(sim, p.x, p.y, p.z, 0);
  },
};

export const bundFire: MissionDef = {
  id: 'bund-fire',
  levelId: 'works',
  title: 'Controlled Burn',
  client: 'Cornelius Ash, Ash Coastal Developments',
  brief:
    'I am buying Brackwater Works on Monday. The price depends on how much of it is, technically, still a going concern.\n\n' +
    'The tank farm should stop being one: seventy per cent of those fuel tanks destroyed. The factory halls are ' +
    'ugly — half of them gone would be a kindness. Works Security has a heat sensor on the tanks, so the moment ' +
    'the first one goes you are on the clock.\n\n' +
    'Do stand well back. I am not insured for you.',
  objectives: [
    { kind: 'destroy', id: 'tanks', title: 'Destroy 70% of the fuel tanks', percent: 70 },
    { kind: 'destroy', id: 'halls', title: 'Destroy 50% of the factory halls', percent: 50, required: false },
    { kind: 'deliver', id: 'wagon', target: 'spool', count: 1, title: 'Roll a cable spool into the canal', zone: { water: true }, required: false },
  ],
  alarmSeconds: 35,
  reward: { cash: 2600 },
  unlockAfter: ['long-drop', 'payday'],
  setup(sim, lv) {
    escapeVan(sim, lv, Math.PI / 2);
    tagBodies(sim, (b) => b.name === 'fuel tank', 'destroy:tanks');
    tagBodies(sim, (b) => b.tags.has('factory'), 'destroy:halls');
    tagBodies(sim, (b) => b.dynamic && /spool/i.test(b.name), 'target:spool');
    wallAlarm(sim, lv, 'tank_farm', 'tanks', 0.7, 25);
  },
};

export const WORKS_MISSIONS: MissionDef[] = [longDrop, payday, bundFire];
