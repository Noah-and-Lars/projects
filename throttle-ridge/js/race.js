// Race simulation: world, four bikes, AI, checkpoints, respawns, positions.
// Has no rendering dependencies, so it also runs headless for testing.
import { createWorld, stepWorld, STEP } from './physics.js';
import { createBike, applyControls, updateBike, resetBike } from './bike.js';
import { createAI, aiControl } from './ai.js';
import { buildTrack } from './tracks.js';
import { createRagdoll, destroyRagdoll } from './ragdoll.js';
import { riderPose, toWorld } from './rider.js';

// Each rider has a full colour scheme: bike plastics, jersey, pants, helmet.
export const RIDERS = [
  { name: 'You',    color: 0xe8331c, accent: 0xffffff, jersey: 0xe8331c, jersey2: 0xffffff, pants: 0x1c1c22, helmet: 0xffffff, helmet2: 0xe8331c, frame: 0x2a2a2e, num: 1 },
  { name: 'Kenji',  color: 0x1f6fe0, accent: 0xffd23f, jersey: 0x1f6fe0, jersey2: 0xffd23f, pants: 0xf2f2f2, helmet: 0xffd23f, helmet2: 0x1f6fe0, frame: 0x9aa4b4, num: 27 },
  { name: 'Mara',   color: 0x35c24a, accent: 0x111111, jersey: 0x111111, jersey2: 0x35c24a, pants: 0x35c24a, helmet: 0x35c24a, helmet2: 0x111111, frame: 0x1a1a1a, num: 44 },
  { name: 'Diesel', color: 0xff8a00, accent: 0x6b2bd9, jersey: 0x6b2bd9, jersey2: 0xff8a00, pants: 0x6b2bd9, helmet: 0xff8a00, helmet2: 0x6b2bd9, frame: 0x2a2a2e, num: 9 },
];
// Depth offsets (render only). The player is in the nearest lane.
// Spread wide enough that, with the camera's slight downward tilt, each rider
// sits visibly higher and smaller than the one in front: no overlapping blob.
export const LANES = [4.1, 1.35, -1.4, -4.15];
const RESPAWN_DELAY = 1.0;
const STUCK_TIME = 3.5;

export function createRace(trackDef, { skill = 'medium', aiOnly = false } = {}) {
  const track = buildTrack(trackDef);
  const { world } = createWorld(track);
  const bikes = RIDERS.map((r, i) => {
    const b = createBike(world, track.startX, 2, { id: i });
    b.name = r.name;
    b.checkpoint = track.startX;
    b.bestX = track.startX;
    b.ai = (i > 0 || aiOnly) ? createAI(skill, i * 17 + 3) : null;
    resetBike(b, track, track.startX);
    return b;
  });
  const race = {
    track, world, bikes,
    player: bikes[0],
    time: 0,
    state: 'countdown', // countdown | racing | done
    countdown: 3.4,
    finishOrder: [],
    events: [],
    playerInput: { throttle: 0, brake: 0, lean: 0 },
  };
  return race;
}

export function startRacing(race) {
  race.state = 'racing';
  race.time = 0;
}

export function respawn(race, bike) {
  if (bike.ragdoll) { destroyRagdoll(race.world, bike.ragdoll); bike.ragdoll = null; }
  bike.bestX = Math.min(bike.bestX ?? 0, bike.checkpoint);
  resetBike(bike, race.track, bike.checkpoint, 7);
  race.events.push({ type: 'respawn', bike: bike.id });
}

export function restartPlayer(race) {
  respawn(race, race.player);
}

export function stepRace(race) {
  const { track, bikes } = race;
  race.events.length = 0;
  const holding = race.state === 'countdown';

  for (const b of bikes) {
    if (b.ai) aiControl(b.ai, b, track);
    else Object.assign(b.input, race.playerInput);
    b.input.hold = holding;
    {
      if (holding) { b.input.throttle = 0; b.input.brake = 0; b.input.lean = 0; }
    }
    if (b.finished) {
      b.input.throttle = 0; b.input.brake = b.chassis.getLinearVelocity().x > 3 ? 0.4 : 0;
      b.input.lean = b.ai ? b.input.lean : race.playerInput.lean;
    }
    applyControls(b, track);
  }
  if (holding) {
    // Keep bikes behind the gate.
    for (const b of bikes) {
      const v = b.chassis.getLinearVelocity();
      if (v.x > 0) for (const body of [b.chassis, b.rear, b.front]) body.setLinearVelocity({ x: 0, y: body.getLinearVelocity().y });
    }
  }

  stepWorld(race.world);
  if (!holding) race.time += STEP;

  for (const b of bikes) {
    updateBike(b, track);
    for (const e of b.events) {
      race.events.push({ ...e, bike: b.id });
      if (e.type === 'crash' && !b.ragdoll) throwRider(race, b);
    }
    const x = b.chassis.getPosition().x;

    // Checkpoints: the furthest one passed while on the ground and upright.
    if (!b.crashed && b.grounded) {
      for (const cp of track.checkpoints) if (cp <= x && cp > b.checkpoint) b.checkpoint = cp;
    }
    if (b.crashed) {
      b.crashTimer -= STEP;
      if (b.crashTimer <= 0) respawn(race, b);
    }
    // Stuck detection (e.g. stalled on a face or sideways).
    if (race.state === 'racing' && !b.finished) {
      // No forward progress for a while: stalled on a face, wedged, etc.
      if (x > b.bestX + 1.5 || b.crashed) { b.bestX = Math.max(b.bestX, x); b.stuckTimer = 0; }
      else b.stuckTimer += STEP;
      if (b.stuckTimer > (b.ai ? STUCK_TIME : STUCK_TIME + 1.5)) { b.bestX = b.checkpoint; respawn(race, b); }
    }
    // Fell out of the world somehow.
    if (b.chassis.getPosition().y < track.minY - 20) respawn(race, b);

    b.progress = Math.max(0, Math.min(1, (x - track.startX) / (track.finishX - track.startX)));
    if (race.state === 'racing' && !b.finished && x >= track.finishX) {
      b.finished = true;
      b.finishTime = race.time;
      race.finishOrder.push(b.id);
      race.events.push({ type: 'finish', bike: b.id, position: race.finishOrder.length });
    }
  }
}

// Throw the rider off the bike as a ragdoll, starting from the riding pose.
function throwRider(race, b) {
  const pose = riderPose(b.leanVisual, 0);
  const p = b.chassis.getPosition(), a = b.chassis.getAngle();
  const jw = {};
  for (const k of ['hip', 'knee', 'foot', 'shoulder', 'elbow', 'hand', 'head']) jw[k] = toWorld(pose[k], p.x, p.y, a);
  b.ragdoll = createRagdoll(race.world, jw, b.lastVel || b.chassis.getLinearVelocity(), b.chassis.getAngularVelocity());
}

// Live positions: finished riders by order, then by distance.
export function standings(race) {
  return [...race.bikes].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.chassis.getPosition().x - a.chassis.getPosition().x;
  });
}

export function positionOf(race, bike) {
  return standings(race).indexOf(bike) + 1;
}
