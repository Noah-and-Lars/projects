/** Missions on Kestrel Ridge (src/sim/levels/ridge.ts); props are placed relative to the level's named markers. */
import { tagBodies, type MissionDef } from '../../sim/mission';
import { goldIdol, serverBox, valuable } from '../../sim/missionProps';
import { hatchback, loader } from '../../sim/prefabs/vehicles';
import { at, escapeVan, wallAlarm } from './helpers';

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
    valuable(sim, at(lv, 'wine_cellar', -0.8, 0.12, -0.6), 'bottle', 300, 'Château Vane 1961');
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

export const RIDGE_MISSIONS: MissionDef[] = [cellarDoor, privateView, towerDown];
