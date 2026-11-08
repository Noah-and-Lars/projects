// The film's edit: who goes where, the slots for his moves, every shot (what
// part of the story it shows, how fast, and the camera), and the bullet
// cam's labels. src/showcase/cinematic/film.js plays it.
//
// TIME. The story has its own clock (seconds): his moves follow one another
// on it, and the shot is fired at S.fire. Each shot shows a stretch of the
// story [from, to] in `film` seconds of the film; `time` maps the shot's
// progress (0..1 of its film seconds) to the story, as keys [film seconds
// into the shot, story time] joined by a smooth curve that never runs
// backwards. A shot without `time` plays its stretch at real speed. So slow
// motion is a shot whose film seconds are longer than its story seconds,
// and shots may show the same moment twice from different places.
//
// HIS MOVES. Each slot is one Mixamo clip (sprint, dive, catch, roll,
// cover, fire), retargeted onto the soldier by tools/cinematic/
// retarget_mixamo.py into assets/cinematic/<id>.glb; set the slot's
// `file` to it (see tools/cinematic/README.md). Until then the slot plays a
// stand-in: his idle, carried along the slot's planned path (`travel`, in
// his own frame: [sideways (+ his left), forward] metres, and `turn`
// radians) over its planned `length`. With a clip, its own length and the
// distance it carries him are used instead, and the cameras, which follow
// his hips and his right hand, follow him there. Slots play one after
// another (each fading in over its `blend`); they're placed backwards from
// the fire slot, which starts where he fires from (LAYOUT.fireSpot), so
// whatever the clips do, he ends behind the barriers. `marks` are moments
// in a slot (seconds into it): the dive's catch (where the pistol meets his
// hand), the fire slot's shot. A slot with `layer: true` plays over another
// (only his spine, arms and hands), starting `lead` seconds before that
// slot's mark `at`: the catch, over the dive. `trim` [from, to] uses part
// of a clip; `speed` plays it faster or slower.
//
// CAMERAS. Each shot's camera has keys at film seconds into the shot: where
// it is (`pos`) and what it looks at (`look`), each [frame, x, y, z], with a
// lens (`lens`, mm on a full-frame camera: its width sets the view across)
// and optionally `roll` (degrees) and `focus` (metres; else the distance to
// what it looks at). Frames:
//   world            the set's own axes (metres)
//   hips, hand       his hips' or right hand's position, the set's axes
//   catch            where the pistol meets his hand, the set's axes
//   muzzle           the muzzle, along the bore: [right, up, forward]
//   bullet           the bullet's middle, along its flight: [right, up, forward]
//   gun              the PF-9's own frame (+X its right, +Y up, -Z the muzzle)
//   case             the spent case's middle, the set's axes
//   hit              where the bullet strikes the plate, the set's axes
// Between keys the camera swings round what it looks at (it doesn't cut
// through it), and moves smoothly. `blur` is how soft things far out of
// focus get (a share of the picture's width); `shake` a little handheld
// wobble.
//
// Each shot can also: hide the soldier (`hide: ['soldier']`); with
// `aim: true`, while the fire slot has no clip, hold the gun up in its aim
// pose (LAYOUT.muzzle) and leave him out (his idle has no arm to hold it
// up: the bullet cam's shots are framed on the gun and the bullet, so once
// the fire clip is in he and his hands are simply there, and the bullet
// flies from wherever his gun points at the shot); show labels (`labels`,
// at film seconds into the shot, with the card on one `side`, pointing at
// `anchor`); play sounds (`sounds`: [film seconds into the shot, name],
// see film.js); show the title or the end (`title`); and draw tight
// shadows round what's close up (`fine`).

import { ROUND } from './round.js';
import { SHOT, SPIN, bulletSpeed, timeToTravel } from './ballistics.js';

// Where things are (metres). The barriers run along X at z = 0; he fires
// from behind them (+Z) towards -Z.
export const LAYOUT = {
  fireSpot: { x: 0.35, z: 0.8, yaw: Math.PI }, // where the fire slot starts, facing the target
  // The PF-9 held up to fire (until the fire clip gives his hand): its
  // muzzle, over the barrier, at a kneeling man's eye height.
  muzzle: [0.33, 1.12, 0.25],
  // Where on the plate's face the bullet strikes (from its middle).
  hit: [0.028, 0.034],
  // The pistol is thrown to him from off to his left (a teammate out of
  // the picture), arriving in his hand at the dive's catch.
  toss: { from: [-5.6, 1.35, 2.5], flight: 1.05, turns: 1.25 },
  // The round standing on the barrier in the opening shot.
  round: [-0.3, 0.81, 0.012],
};

export const SLOTS = [
  {
    id: 'sprint', name: 'Sprint', file: null, length: 2.2, travel: [0, 6.6], turn: 0, blend: 0,
    hint: 'A flat-out run (Mixamo: a sprint or fast run, not "In Place").',
  },
  {
    id: 'dive', name: 'Dive', file: null, length: 1.0, travel: [0, 3.1], turn: 0, blend: 0.2,
    marks: { takeoff: 0.12, catch: 0.5, land: 0.85 },
    hint: 'A running dive forward, arms reaching out (Mixamo: a dive or dive roll, not "In Place").',
  },
  {
    id: 'catch', name: 'Catch', file: null, layer: true, over: 'dive', at: 'catch', lead: 0.35, length: 0.8, blend: 0,
    hint: 'His arms catching something in front of him (only his spine, arms and hands are used, over the dive).',
  },
  {
    id: 'roll', name: 'Roll', file: null, length: 1.1, travel: [0, 1.7], turn: 0, blend: 0.2,
    hint: 'Landing from the dive into a forward roll, coming up on one knee.',
  },
  {
    id: 'cover', name: 'Cover', file: null, length: 1.6, travel: [0, 0.9], turn: -Math.PI / 2, blend: 0.25,
    hint: 'Moving in behind cover low and turning to face it, kneeling.',
  },
  {
    id: 'fire', name: 'Fire', file: null, length: 6.5, travel: [0, 0], turn: 0, blend: 0.25,
    marks: { aim: 0.75, shot: 1.0 },
    hint: 'Kneeling with a pistol: rising over the cover, aiming and firing once (Mixamo: a pistol kneeling shot).',
  },
];

// The labels' facts. Sources (checked 2026-11): Wikipedia, "9×19mm
// Parabellum" (the C.I.P. sizes, twist and pressure); Federal Premium's
// American Eagle AE9DP 115 gr FMJ (360 m/s, 1,180 ft/s from a 4 in test
// barrel; its 50 yd figure gives the slowing); see also ballistics.js and
// round.js. Speed of sound: 343 m/s in air at 20 °C.
export function cards(range) {
  const flight = timeToTravel(range + SHOT.bore) - SHOT.exit; // muzzle to plate
  return {
    name: {
      kicker: 'Bullet cam · 1 / 5',
      title: '9×19 mm Parabellum',
      text: `The 9 mm Luger: a ${(ROUND.bullet.diameter * 1000).toFixed(2)} mm bullet in a ${(ROUND.case.length * 1000).toFixed(2)} mm brass case, ${(ROUND.overall * 1000).toFixed(2)} mm long loaded. This one is a 115-grain (7.45 g) full metal jacket bullet, a common practice load.`,
    },
    jacket: {
      kicker: 'Bullet cam · 2 / 5',
      title: 'Full metal jacket',
      text: 'A copper-alloy (gilding metal) jacket drawn over a soft lead core; on most FMJ pistol bullets the lead shows at the open base. The barrel’s rifling has just pressed its twist into the jacket.',
    },
    spin: {
      kicker: 'Bullet cam · 3 / 5',
      title: 'Spin',
      text: `The rifling makes one turn in 250 mm (about 1 in 10 in), so it leaves the barrel spinning about ${Math.round(SPIN).toLocaleString('en-GB')} times a second, some ${Math.round((SPIN * 60) / 1000)},000 rpm. The spin keeps it flying point first.`,
    },
    case: {
      kicker: 'Bullet cam · 4 / 5',
      title: 'Brass case',
      text: 'It stays behind. Its 70/30 brass swelled to seal the chamber against up to 235 MPa (about 34,000 psi) of gas; then the slide drew it out and the ejector flicked it away, its primer dented by the striker.',
    },
    speed: {
      kicker: 'Bullet cam · 5 / 5',
      title: `${SHOT.speed} m/s`,
      text: `About 1,180 ft/s from a 4 in barrel: just faster than sound (${SHOT.sound} m/s). The air slows it by under 1 m/s for every metre, so it crosses these ${Math.round(range)} m in about ${Math.round(flight * 1000)} thousandths of a second.`,
      // (The kicker shows its speed and how far it has gone, live.)
      live: ({ s, travelled }) => `${Math.round(bulletSpeed(s))} m/s · ${Math.max(0, travelled).toFixed(1)} m`,
    },
  };
}

// The shots, in order. S: the story's times ({ fire, impact, start(id),
// mark(id, name) }); ms(x) is x thousandths of a second.
export function shots(S) {
  const ms = (x) => x / 1000;
  const F = S.fire, I = S.impact;
  const rel = (base, keys, scale = 1) => keys.map(([f, s]) => [f, base + s * scale]);
  const dive = S.start('dive'), roll = S.start('roll'), cover = S.start('cover'), fire = S.start('fire');
  const grab = S.mark('dive', 'catch');
  return [
    // The round, close up, standing on the barrier; the film's title.
    {
      name: 'title', from: -4.6, to: -0.1, film: 4.5, hide: ['soldier'], title: 'open', blur: 0.03,
      camera: [
        { at: 0, pos: ['world', -0.52, 0.842, 0.18], look: ['world', -0.3, 0.829, 0.012], lens: 100 },
        { at: 4.5, pos: ['world', -0.485, 0.84, 0.155], look: ['world', -0.3, 0.829, 0.012], lens: 100 },
      ],
      sounds: [[0.1, 'rushIn']],
    },
    // He sprints in from the right across the open ground: tracked, long lens.
    {
      name: 'sprint', slot: 'sprint', from: 0, to: dive + 0.05, blur: 0.006, shake: 0.4,
      camera: [
        { at: 0, pos: ['hips', 1.6, -0.25, -5.2], look: ['hips', 0, 0.25, 0], lens: 70 },
        { at: dive + 0.05, pos: ['hips', -0.5, -0.3, -4.6], look: ['hips', -0.2, 0.2, 0], lens: 70 },
      ],
      sounds: [],
    },
    // The dive: low and wide, as he leaves the ground, slowing.
    {
      name: 'dive', slot: 'dive', from: dive + 0.05, to: grab - 0.16, film: 1.5, blur: 0.004,
      time: [[0, dive + 0.05], [0.7, dive + 0.05 + 0.6 * (grab - 0.21 - dive) ], [1.5, grab - 0.16]],
      camera: [
        { at: 0, pos: ['world', 2.6, 0.3, 2.2], look: ['hips', 0, 0.1, 0], lens: 28 },
        { at: 1.5, pos: ['world', 2.45, 0.28, 2.05], look: ['hips', 0, 0.2, 0], lens: 28 },
      ],
      sounds: [[0.05, 'thump']],
    },
    // The catch, in slow motion: round his hand as the pistol spins into it.
    {
      name: 'catch', slot: 'catch', from: grab - 0.2, to: grab + 0.18, film: 3.4, blur: 0.012,
      time: [[0, grab - 0.2], [1.4, grab - 0.03], [2.2, grab + 0.02], [3.4, grab + 0.18]],
      camera: [
        { at: 0, pos: ['catch', -0.75, 0.12, -0.55], look: ['catch', 0, 0, 0], lens: 50 },
        { at: 1.7, pos: ['catch', -0.95, 0.18, 0.05], look: ['catch', 0, 0, 0], lens: 50 },
        { at: 3.4, pos: ['catch', -0.7, 0.28, 0.65], look: ['hand', 0, 0, 0], lens: 50 },
      ],
      sounds: [[1.75, 'slap']],
    },
    // He lands and rolls; time comes back up to speed.
    {
      name: 'roll', slot: 'roll', from: grab + 0.18, to: roll + 0.95, film: 1.9, blur: 0.006,
      time: [[0, grab + 0.18], [0.6, grab + 0.18 + 0.12], [1.9, roll + 0.95]],
      camera: [
        { at: 0, pos: ['world', 0.2, 0.32, 1.75], look: ['hips', 0, 0, 0], lens: 32 },
        { at: 1.9, pos: ['world', 0.05, 0.36, 1.85], look: ['hips', 0, 0.1, 0], lens: 32 },
      ],
      sounds: [[0.55, 'thump'], [1.1, 'thump']],
    },
    // Into cover behind the barrier.
    {
      name: 'cover', slot: 'cover', from: roll + 0.95, to: fire + 0.25, blur: 0.006, shake: 0.3,
      camera: [
        { at: 0, pos: ['world', -0.85, 0.72, 1.75], look: ['hips', 0, 0.25, 0], lens: 40 },
        { at: fire + 0.25 - roll - 0.95, pos: ['world', -0.75, 0.78, 1.6], look: ['hips', 0, 0.35, 0], lens: 40 },
      ],
    },
    // Up over the barrier, aim: over his shoulder, the plate far off. Cut
    // as the trigger breaks.
    {
      name: 'fire', slot: 'fire', from: fire + 0.25, to: F - ms(2), blur: 0.006,
      camera: [
        { at: 0, pos: ['world', 0.95, 1.3, 1.65], look: ['world', 0.3, 1.1, -6], lens: 45, focus: 1.2 },
        { at: F - ms(2) - fire - 0.25, pos: ['world', 0.82, 1.28, 1.45], look: ['world', 0.3, 1.1, -6], lens: 50, focus: 1.1 },
      ],
    },

    // ---- The bullet cam ----
    // At the muzzle: the flash, the bullet coming out; then the camera
    // rides with it, round it, as the labels come and go.
    {
      name: 'bullet-out', exposure: 0.95, from: F + ms(0.3), to: F + ms(3.0), film: 14.5, aim: true, blur: 0.02, fine: true,
      time: rel(F, [[0, 0.30], [1.5, 0.405], [4, 0.6], [6, 0.85], [9, 1.45], [12, 2.35], [14.5, 3.0]], ms(1)),
      camera: [
        { at: 0, pos: ['muzzle', -0.1, 0.03, 0.13], look: ['muzzle', 0, 0, 0.012], lens: 60 },
        { at: 1.4, pos: ['muzzle', -0.095, 0.028, 0.135], look: ['muzzle', 0, 0, 0.02], lens: 60 },
        { at: 3.6, pos: ['bullet', -0.085, 0.016, 0.004], look: ['bullet', 0, 0, 0], lens: 70 },
        { at: 5.6, pos: ['bullet', -0.08, 0.015, 0.01], look: ['bullet', 0, 0, 0], lens: 70 },
        { at: 7.4, pos: ['bullet', -0.05, 0.03, 0.07], look: ['bullet', 0, 0, 0.002], lens: 70 },
        { at: 9.6, pos: ['bullet', -0.045, 0.028, 0.078], look: ['bullet', 0, 0, 0.002], lens: 70 },
        { at: 11.2, pos: ['bullet', 0.035, 0.022, -0.075], look: ['bullet', 0, 0, 0.003], lens: 70 },
        { at: 14.5, pos: ['bullet', 0.04, 0.024, -0.085], look: ['bullet', 0, 0, 0.003], lens: 70 },
      ],
      labels: [
        { at: 2.0, until: 5.6, card: 'name', side: 'right', anchor: ['bullet', 0, 0, 0] },
        { at: 6.2, until: 9.8, card: 'jacket', side: 'left', anchor: ['bullet', 0, ROUND.bullet.diameter / 2, -0.001] },
        { at: 10.4, until: 14.0, card: 'spin', side: 'right', anchor: ['bullet', 0.0026, 0.0026, -0.0045] },
      ],
      sounds: [[0, 'slowShot'], [1.4, 'rush14']],
    },
    // Meanwhile, at the gun: the slide back, the case flicked out.
    {
      name: 'case', exposure: 0.95, from: F + ms(3.0), to: F + ms(13), film: 4.6, aim: true, blur: 0.014, fine: true,
      time: rel(F, [[0, 3.0], [1.0, 3.55], [3.6, 9.0], [4.6, 13]], ms(1)),
      camera: [
        { at: 0, pos: ['gun', 0.13, 0.085, -0.095], look: ['gun', 0.025, 0.0, -0.03], lens: 50 },
        { at: 4.6, pos: ['gun', 0.135, 0.095, -0.075], look: ['gun', 0.05, 0.02, -0.015], lens: 50 },
      ],
      labels: [{ at: 1.0, until: 4.4, card: 'case', side: 'left', anchor: ['case', 0, 0, 0] }],
      sounds: [[0.6, 'slowTink']],
    },
    // Back with the bullet: the plate ahead, coming up fast.
    {
      name: 'flight', exposure: 0.95, from: F + ms(13), to: I - ms(2.2), film: 6.5, aim: true, blur: 0.012,
      time: [[0, F + ms(13)], [3, F + ms(21)], [5.5, I - ms(4.5)], [6.5, I - ms(2.2)]],
      camera: [
        { at: 0, pos: ['bullet', -0.05, 0.016, -0.1], look: ['bullet', 0, 0, 0.35], lens: 35 },
        { at: 4.5, pos: ['bullet', -0.055, 0.02, -0.12], look: ['bullet', 0, 0, 0.4], lens: 35 },
        { at: 6.5, pos: ['bullet', -0.07, 0.03, -0.2], look: ['bullet', 0, 0, 0.5], lens: 35 },
      ],
      labels: [{ at: 0.6, until: 4.6, card: 'speed', side: 'left', anchor: ['bullet', 0, 0, 0] }],
      sounds: [[0, 'rush7']],
    },
    // The strike, from beside the plate.
    {
      name: 'impact', exposure: 0.95, from: I - ms(2.2), to: I + ms(0.9), film: 3.2, aim: true, blur: 0.01,
      time: rel(I, [[0, -2.2], [1.3, -0.12], [1.9, 0.06], [3.2, 0.9]], ms(1)),
      camera: [
        { at: 0, pos: ['hit', 0.42, 0.07, 0.3], look: ['hit', 0, 0, 0.05], lens: 42 },
        { at: 3.2, pos: ['hit', 0.4, 0.06, 0.27], look: ['hit', 0, 0, 0], lens: 45 },
      ],
      sounds: [[1.36, 'slowRing']],
    },
    // Time snaps back: the plate rings and swings.
    {
      name: 'snap', from: I + ms(0.9), to: I + 2.2, aim: true, blur: 0.004,
      camera: [
        { at: 0, pos: ['hit', 2.3, 0.05, 1.6], look: ['hit', -0.1, -0.12, 0], lens: 50 },
        { at: 2.2, pos: ['hit', 2.2, 0.08, 1.5], look: ['hit', -0.1, -0.12, 0], lens: 50 },
      ],
      sounds: [[0, 'snap'], [0.02, 'ring']],
    },
    // Back to him behind cover, the plate still swinging down range.
    {
      name: 'after', slot: 'fire', from: I + 2.2, to: I + 8.2, blur: 0.005, title: 'end',
      camera: [
        { at: 0, pos: ['world', 1.75, 0.95, 2.7], look: ['hips', -0.2, 0.35, 0], lens: 35 },
        { at: 6, pos: ['world', 1.45, 1.05, 2.35], look: ['hips', -0.2, 0.4, 0], lens: 35 },
      ],
      sounds: [[0.15, 'tink']],
    },
  ];
}

export const FILM = {
  name: 'PF-9',
  subtitle: 'Dive · Catch · Cover · Fire',
  credit: 'Soldier: "Soldier Full Tactical Gear" by DanlyVostok, CC BY 4.0 · PF-9: "Pistol 9mm Custom" by ~D-Try~, CC BY 4.0',
  // (When the Mixamo clips are added, add their credit here and in
  // README.md, Credits.)
  slots: SLOTS,
};
