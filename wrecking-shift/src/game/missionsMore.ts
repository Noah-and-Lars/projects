/** Missions on Kestrel Ridge and Brackwater Works. Props are placed relative to the levels' named markers. */
import type { LevelInfo } from '../sim/levels/types';
import { tagBodies, type MissionDef } from '../sim/mission';
import { alarmBox, goldIdol, paintCan, serverBox, valuable } from '../sim/missionProps';
import { hatchback, loader, van } from '../sim/prefabs/vehicles';
import type { Sim } from '../sim/sim';
import type { V3 } from '../sim/vec';

const at = (lv: LevelInfo, name: string, dx = 0, dy = 0.12, dz = 0): V3 => {
  const m = lv.markers[name] ?? lv.spawn;
  return { x: m.x + dx, y: m.y + dy, z: m.z + dz };
};
/** alarm box stuck to the nearest wall around a marker (searches the four horizontal directions) */
function wallAlarm(sim: Sim, lv: LevelInfo, marker: string, id: string, h = 1.3, range = 12): void {
  const o = at(lv, marker, 0, h, 0);
  let best: { p: V3; axis: 'x' | 'z'; d: number } | null = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const h = sim.raycast(o, { x: dx, y: 0, z: dz }, range, null, (b) => !b.dynamic);
    if (!h || (best && h.dist >= best.d)) continue;
    // box min corner: flush against the wall face, protruding into the room
    const axis = dx ? 'x' : 'z';
    const p = { x: h.point.x - (dx > 0 ? 0.2 : 0) - (dz ? 0.2 : 0), y: o.y, z: h.point.z - (dz > 0 ? 0.2 : 0) - (dx ? 0.2 : 0) };
    best = { p, axis, d: h.dist };
  }
  if (best) alarmBox(sim, best.p, id, best.axis);
}
/** the escape van beside the escape marker (levels without their own) */
function escapeVan(sim: Sim, lv: LevelInfo, yaw: number): void {
  const e = at(lv, 'escape', 0, 0, 0);
  const v = van(sim, e.x, e.y, e.z, yaw);
  v.body.tags.add('escape');
}

// ------------------------------------------------------------------------------------------ Kestrel Ridge

export const cellarDoor: MissionDef = {
  id: 'cellar-door',
  levelId: 'ridge',
  title: 'What\'s in the Cellar',
  client: 'Ines Halloran, formerly of Halloran & Vane Shipping',
  brief:
    'Lucian Vane bought Kestrel Ridge with money that was half mine. The half I can prove is in his cellar vault: ' +
    'a gold figure he calls "the retirement plan" and the server with the real books.\n\n' +
    'The vault is half a metre of concrete behind an old armoured door of riveted plate. A hammer will not do it. Whatever does it will be heard, ' +
    'so open it LAST — everything in there is wired, and from the first tremor you have fifty seconds to be ' +
    'back at the van by the lake.\n\n' +
    'It is a long way down from the house. Plan how you are getting off that hill before you light the fuse.',
  objectives: [
    { kind: 'collect', id: 'plan', title: 'Take the gold "retirement plan" from the vault' },
    { kind: 'collect', id: 'books', title: 'Take the books server from the vault' },
    { kind: 'collect', id: 'deed', title: 'Take the deed box from the study', required: false },
  ],
  alarmSeconds: 50,
  reward: { cash: 2000 },
  unlockAfter: ['lights-out'],
  setup(sim, lv) {
    escapeVan(sim, lv, -Math.PI / 2);
    goldIdol(sim, at(lv, 'vault', -0.5, 0.12, 0), 'plan', 'The Retirement Plan');
    serverBox(sim, at(lv, 'vault', 0.5, 0.12, 0.3), 'books', 'Books Server');
    wallAlarm(sim, lv, 'vault', 'plan');
    serverBox(sim, at(lv, 'mansion_study', 0.4, 0.12, 0.4), 'deed', 'Deed Box');
    valuable(sim, at(lv, 'wine_cellar', 0.5, 0.12, 0.5), 'bottle', 300, 'Château Vane 1961');
    valuable(sim, at(lv, 'mansion_bedroom', 0.3, 0.12, 0.3), 'watch', 450, 'Vane\'s Chronometer');
    valuable(sim, at(lv, 'mansion_attic', 0.3, 0.12, 0.3), 'trophy', 180, 'Regional Snooker Cup');
    valuable(sim, at(lv, 'gazebo', 0.3, 0.12, 0), 'coins', 90, 'Jar of Casino Chips');
    hatchback(sim, at(lv, 'forecourt').x, at(lv, 'forecourt').y, at(lv, 'forecourt').z, 0);
  },
};

export const privateView: MissionDef = {
  id: 'private-view',
  levelId: 'ridge',
  title: 'Private View',
  client: 'Odile Maren, Maren Fine Art (Insurance Division)',
  brief:
    'Mr Vane\'s glass gallery holds six pieces insured through my office for considerably more than they are worth. ' +
    'If they were to be stolen — professionally, tonight — everyone would be happier, me in particular.\n\n' +
    'The gallery is all glass, which is good news for a person with a hammer. Its pressure alarm is wired to the ' +
    'centre plinth; once it trips, Ridge Security is thirty-five seconds up the lake road.\n\n' +
    'Bring at least four. All six and I will remember you fondly.',
  objectives: [
    { kind: 'collect', id: 'art', target: 'art', count: 4, title: 'Steal four pieces from the gallery' },
    { kind: 'collect', id: 'art6', target: 'art', count: 6, title: 'Steal all six', required: false },
  ],
  alarmSeconds: 35,
  reward: { cash: 1500 },
  unlockAfter: ['paper-trail'],
  setup(sim, lv) {
    escapeVan(sim, lv, -Math.PI / 2);
    // the level's sculptures are tagged 'art' by the map; make the six nearest to the gallery the targets
    const g = at(lv, 'gallery');
    const arts = [...sim.bodies.values()].filter((b) => b.tags.has('art'))
      .sort((a, b) => (a.center().x - g.x) ** 2 + (a.center().z - g.z) ** 2 - ((b.center().x - g.x) ** 2 + (b.center().z - g.z) ** 2)).slice(0, 6);
    for (const b of arts) { b.tags.add('target:art'); b.impactProof = true; }
    wallAlarm(sim, lv, 'gallery', 'art');
    valuable(sim, at(lv, 'gallery_roof', 0.3, 0.12, 0.3), 'bottle', 120, 'Unopened Champagne');
    valuable(sim, at(lv, 'boathouse', 0.3, 0.12, 0.3), 'watch', 260, 'Yachtmaster\'s Watch');
  },
};

export const towerDown: MissionDef = {
  id: 'tower-down',
  levelId: 'ridge',
  title: 'Spoiling the View',
  client: 'Cornelius Ash, Ash Coastal Developments',
  brief:
    'Vane\'s watchtower stands exactly where my funicular needs to go, and he will not sell.\n\n' +
    'Take it down to four metres. Only the bottom storey is stone; the lookout on top is an old timber frame, which ' +
    'should make it a short afternoon. And since you are up there — his boathouse is on my side of the old survey line. ' +
    'Sixty per cent of it gone would settle the boundary nicely. It is wood. I am told wood burns.',
  objectives: [
    { kind: 'demolish', id: 'tower', title: 'Demolish the watchtower (nothing above 4 m)', height: 0 },
    { kind: 'destroy', id: 'boathouse', title: 'Destroy 60% of the boathouse', percent: 60, required: false },
  ],
  reward: { cash: 1800 },
  unlockAfter: ['cellar-door'],
  setup(sim, lv) {
    escapeVan(sim, lv, -Math.PI / 2);
    tagBodies(sim, (b) => b.tags.has('tower'), 'destroy:tower');
    tagBodies(sim, (b) => b.tags.has('boathouse'), 'destroy:boathouse');
    (this.objectives[0] as any).height = at(lv, 'watchtower_door', 0, 0, 0).y + 4;
    const f = at(lv, 'forecourt');
    loader(sim, f.x + 4, f.y, f.z, Math.PI / 2);
  },
};

// ------------------------------------------------------------------------------------------ Brackwater Works

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
  unlockAfter: ['lights-out'],
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
    'MACHINE PARTS, which rattles like champagne. All alarmed; one minute once you touch any of them.\n\n' +
    'Two bridges cross that canal. You might think about how many should still be standing when Works Security drives in.',
  objectives: [
    { kind: 'collect', id: 'payroll', title: 'Take the payroll server (office, top floor)' },
    { kind: 'collect', id: 'cash', title: 'Take the cash box (boiler house)' },
    { kind: 'collect', id: 'parts', title: 'Take the "machine parts" (loading dock)', required: false },
  ],
  alarmSeconds: 60,
  fireAlarm: 250,
  reward: { cash: 2200 },
  unlockAfter: ['dead-weight'],
  setup(sim, lv) {
    escapeVan(sim, lv, Math.PI / 2);
    serverBox(sim, at(lv, 'office_top', 0.5, 0.12, 0.5), 'payroll', 'Payroll Server');
    wallAlarm(sim, lv, 'office_top', 'payroll');
    goldIdol(sim, at(lv, 'boiler_house', 0.6, 0.12, 0.6), 'cash', 'Cash Box');
    wallAlarm(sim, lv, 'boiler_house', 'cash');
    paintCan(sim, at(lv, 'dock', 0.4, 0.12, 0.4), 'parts', '"Machine Parts"');
    valuable(sim, at(lv, 'office_lobby', 0.5, 0.12, 0.5), 'coins', 70, 'Vending Machine Float');
    valuable(sim, at(lv, 'silo_catwalk', 0.2, 0.12, 0), 'watch', 320, 'Foreman\'s Lost Watch');
    valuable(sim, at(lv, 'gantry_top', 0, 0.12, 0), 'trophy', 240, 'Crane Driver of the Year 1987');
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
  alarmSeconds: 45,
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

export const MORE_MISSIONS: MissionDef[] = [cellarDoor, privateView, towerDown, longDrop, payday, bundFire];
