/** Missions on Gullwick Harbour (src/sim/levels/harbor.ts). Authoring contract: header of src/sim/mission.ts. */
import { tagBodies, type MissionDef } from '../../sim/mission';
import { alarmBox, goldIdol, serverBox, strongbox, valuable } from '../../sim/missionProps';

const G = 1.4; // quay level of Gullwick Harbour

export const paperTrail: MissionDef = {
  id: 'paper-trail',
  levelId: 'harbor',
  title: 'Paper Trail',
  client: 'Marguerite Oyelaran, Gullwick Fishermen\'s Co-op',
  brief:
    'The harbour company has been short-weighing our catch for three seasons, and the proof is in two places.\n\n' +
    'Their accounts server sits upstairs in the brick office by the cross street. The paper ledger — they call it ' +
    '"the Idol", because the manager keeps it under a gold paperweight shaped like one — is in the glass office on the ' +
    'warehouse mezzanine. Both are on alarm boxes wired straight to Harbour Watch. Once either moves you have forty-five seconds.\n\n' +
    'Walk the route first. Knock holes, stack crates, park the van where you need it. Nobody is counting until the alarm does.\n\n' +
    'There is petty cash lying about. I did not tell you that.',
  objectives: [
    { kind: 'collect', id: 'server', title: 'Take the accounts server (office, upstairs)' },
    { kind: 'collect', id: 'idol', title: 'Take the Idol (warehouse mezzanine)' },
    { kind: 'collect', id: 'log', title: 'Take the harbour master\'s log (cottage)', required: false },
  ],
  alarmSeconds: 45,
  fireAlarm: 200,
  reward: { cash: 600 },
  unlockAfter: ['housewarming'],
  setup(sim) {
    serverBox(sim, { x: 13.2, y: 4.55, z: -4.6 }, 'server', 'Accounts Server');
    alarmBox(sim, { x: 13.0, y: 5.4, z: -6.7 }, 'server', 'z');
    goldIdol(sim, { x: -39.5, y: 4.45, z: 20.2 }, 'idol', 'The Idol');
    alarmBox(sim, { x: -39.6, y: 5.3, z: 17.6 }, 'idol', 'z');
    serverBox(sim, { x: -15.5, y: 2.12, z: -30.5 }, 'log', 'Harbour Master\'s Log');
    valuable(sim, { x: 15.5, y: 1.55, z: -2.5 }, 'coins', 80, 'Petty Cash Jar');
    valuable(sim, { x: -30, y: 1.55, z: 15 }, 'bottle', 40, 'Bottle of Gullwick Rum');
    valuable(sim, { x: 0.3, y: 1.42, z: 48.5 }, 'watch', 220, 'Diver\'s Watch');
    valuable(sim, { x: 18.5, y: 4.55, z: -1.5 }, 'trophy', 150, 'Regatta Cup');
  },
};

export const lightsOut: MissionDef = {
  id: 'lights-out',
  levelId: 'harbor',
  title: 'Lights Out',
  client: 'Cornelius Ash, Ash Coastal Developments',
  brief:
    'My hotel cannot get planning permission while a listed lighthouse stands on the plot. Listed buildings, ' +
    'however, are only listed while they are buildings.\n\n' +
    'Bring the Gullwick light down so that nothing stands taller than a garden wall — six metres. ' +
    'How is your business. The restorers have propped the bottom of the tower on timber shoring while they repoint ' +
    'the brickwork, which is very considerate of them. The fuel depot across the harbour is full of ideas, too.\n\n' +
    'No alarm on a lighthouse, so take your time. Do try not to be under it.',
  objectives: [
    { kind: 'demolish', id: 'light', title: 'Demolish the lighthouse (nothing above 6 m)', height: 3.2 + 6 },
    { kind: 'deliver', id: 'lamp', target: 'lamp', title: 'Sink the lamp housing in the sea', zone: { water: true }, required: false },
  ],
  reward: { cash: 900 },
  unlockAfter: ['paper-trail'],
  setup(sim) {
    tagBodies(sim, (b) => b.name === 'lighthouse', 'destroy:light');
    strongbox(sim, { x: -53.4, y: 3.32, z: 30.75 }, 'lamp', 'Lamp Housing'); // inside the tower, opposite the first stair treads
    valuable(sim, { x: -52.6, y: 3.32, z: 30.2 }, 'record', 60, 'Keeper\'s Shanty Record');
  },
};

export const deadWeight: MissionDef = {
  id: 'dead-weight',
  levelId: 'harbor',
  title: 'Dead Weight',
  client: 'a friend of Marguerite\'s',
  brief:
    'Three strongboxes came in on last night\'s boat. By tomorrow the customs men open them, and several people ' +
    'I like will be having a very bad year.\n\n' +
    'They are too heavy to run with. Drag them, push them with something that has an engine, rope them to a bumper — ' +
    'I do not care. I want all three at the bottom of the harbour.\n\n' +
    'Two are on Harbour Watch alarm boxes. The third is in the pump house behind the depot fence, which is not ' +
    'alarmed, only concrete.',
  objectives: [
    // the alarm is wired per target id, so the unalarmed pump-house box needs its own id (it used to share 'box'
    // with the two alarmed ones, which made it alarmed too, against the brief)
    { kind: 'deliver', id: 'boxes', target: 'box', count: 2, title: 'Sink the two alarmed strongboxes in the harbour', zone: { water: true } },
    { kind: 'deliver', id: 'pump', target: 'pumpbox', count: 1, title: 'Sink the strongbox from the pump house', zone: { water: true } },
  ],
  alarmSeconds: 50,
  reward: { cash: 1100 },
  unlockAfter: ['paper-trail'],
  setup(sim) {
    strongbox(sim, { x: -25, y: G + 0.15, z: 14 }, 'box', 'Strongbox A');
    alarmBox(sim, { x: -25.2, y: G + 1.2, z: 9.7 }, 'box', 'z');
    strongbox(sim, { x: 20, y: G + 0.05, z: 20 }, 'box', 'Strongbox B');
    strongbox(sim, { x: 41, y: G + 0.15, z: -20.5 }, 'pumpbox', 'Strongbox C');
  },
};

export const depotClearance: MissionDef = {
  id: 'depot-clearance',
  levelId: 'harbor',
  title: 'Depot Clearance',
  client: 'Barnaby Thrupp, Thrupp & Nephew Salvage',
  brief:
    'The harbour company owes me for nine skips. They say the fuel depot "is not scrap". Everything is scrap ' +
    'if you believe in it.\n\n' +
    'Flatten the depot: half of the tanks gone, and a proper hole in the pump house. Harbour Watch has a sensor ' +
    'on the big tank — the second it is damaged the clock starts, so set everything up before you light anything.\n\n' +
    'And contractor: the big one is full.',
  objectives: [
    { kind: 'destroy', id: 'tanks', title: 'Destroy half of the fuel tanks', percent: 50 },
    // 40% was out of reach: the pump house is concrete (6 bombs + 6 pipe bombs remove ~10% of it, measured)
    { kind: 'destroy', id: 'pump', title: 'Blast a hole in the pump house (6%)', percent: 6 },
    { kind: 'destroy', id: 'boxes', title: 'Wreck the container stack (30%)', percent: 30, required: false },
  ],
  alarmSeconds: 30,
  reward: { cash: 1300 },
  unlockAfter: ['lights-out', 'dead-weight'],
  setup(sim) {
    tagBodies(sim, (b) => b.name === 'fuel tank' || b.name === 'tank', 'destroy:tanks');
    tagBodies(sim, (b) => b.name === 'pump house', 'destroy:pump');
    tagBodies(sim, (b) => b.name === 'container', 'destroy:boxes');
    alarmBox(sim, { x: 30.8, y: G + 1.0, z: -25.45 }, 'tanks', 'z');
  },
};

export const nightWatch: MissionDef = {
  id: 'night-watch',
  levelId: 'harbor',
  title: 'Night Watch',
  client: 'Marguerite Oyelaran, Gullwick Fishermen\'s Co-op',
  brief:
    'They have replaced the night guard with machines. Two Watchers float the quay — two seconds in their ' +
    'light and the alarm is called in; Harbour Watch is then forty-five seconds out. A Gunner minds the warehouse door and is exactly as friendly as it sounds.\n\n' +
    'You cannot break them. Explosions only daze them. But they are heavy, stupid, and not waterproof.\n\n' +
    'Three sealed evidence cases are stacked around the quay. Bring them all home.',
  objectives: [
    { kind: 'collect', id: 'case', target: 'case', count: 3, title: 'Collect the three evidence cases' },
    { kind: 'collect', id: 'idol', title: 'Take the spare Idol from the lighthouse gallery', required: false },
  ],
  alarmSeconds: 45,
  timeOfDay: 'night',
  reward: { cash: 1600 },
  unlockAfter: ['depot-clearance'],
  setup(sim) {
    serverBox(sim, { x: -30, y: G + 0.15, z: 19 }, 'case', 'Evidence Case');
    serverBox(sim, { x: 24, y: G + 0.05, z: 27.5 }, 'case', 'Evidence Case');
    serverBox(sim, { x: 0, y: G + 0.02, z: 44 }, 'case', 'Evidence Case');
    goldIdol(sim, { x: -50.2, y: 3.2 + 15.05, z: 31.2 }, 'idol', 'Spare Idol');
    const dr = sim.ext.drones;
    if (dr) {
      dr.spawn('watcher', { x: -10, y: G + 1.2, z: 26 }, [{ x: -12, y: 0, z: 26 }, { x: 8, y: 0, z: 26 }, { x: 8, y: 0, z: 12 }, { x: -12, y: 0, z: 12 }]);
      dr.spawn('watcher', { x: 30, y: G + 1.2, z: 28 }, [{ x: 40, y: 0, z: 28.5 }, { x: 12, y: 0, z: 28.5 }]);
      dr.spawn('gunner', { x: -32, y: G + 1.2, z: 7.5 }, [{ x: -36, y: 0, z: 7.5 }, { x: -18, y: 0, z: 7.5 }]);
    }
  },
};

export const HARBOR_MISSIONS: MissionDef[] = [paperTrail, lightsOut, deadWeight, depotClearance, nightWatch];
