// The film's edit: who goes where, the slots for his moves, every shot (what
// part of the story it shows, how fast, and the camera), and the bullet
// cam's labels. src/showcase/cinematic/film.js plays it.
//
// TIME. The story has its own clock (seconds): his moves follow one another
// on it, and the shot is fired at S.fire. Each shot shows a stretch of the
// story [from, to] in `film` seconds of the film; `time` maps the shot's
// progress (0..1 of its film seconds) to the story, as keys [film seconds
// into the shot, story time] joined by a smooth curve that never runs
// backwards. Or `ramp` gives its speed instead: keys [film seconds into
// the shot, speed] (story seconds a film second: 1 real time, 0.001 a
// thousandth), eased from key to key in proportion (so a ramp from 1 to
// 1/2500 slows evenly all the way down); the shot lasts to its last key,
// and with `to` it first plays at the first key's speed for as long as it
// takes to end there. `from: 'prev'` starts where the shot before ended
// (time running on across the cut). A shot with neither plays its stretch
// at real speed. So slow motion is a shot whose film seconds are longer
// than its story seconds, and shots may show the same moment twice from
// different places. Everything moves by the story's clock (him, the gun,
// the bullet, the case, the plate, the flash, the sparks, the smoke), so
// slow motion slows it all; sounds at story moments (`cues`, below) play
// slowed (deeper) or in their slow-motion form. A camera key `at: 'end'`
// is the shot's last moment.
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
// through it), and moves smoothly; orbit() and pushIn() below make keys
// for the usual moves. The lens sets the field of view (a full-frame
// camera's: 24 mm wide, 50 mm normal, 100 mm long); the picture is wide
// screen (2.39:1) with bars, and a cut is simply the next shot. `blur` is how soft things far out of
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
import { EJECT, SHOT, SPIN, bulletSpeed, timeToTravel } from './ballistics.js';

// Where things are (metres). The barriers run along X at z = 0; he fires
// from behind them (+Z) towards -Z.
export const LAYOUT = {
  fireSpot: { x: 0.35, z: 0.8, yaw: Math.PI }, // where the fire slot starts, facing the target
  // The PF-9 held up to fire (until the fire clip gives his hand): its
  // muzzle, over the barrier, at a kneeling man's eye height.
  muzzle: [0.33, 1.12, 0.25],
  // Where on the plate's face the bullet strikes (from its middle).
  hit: [0.028, 0.034],
  // The ammunition crates (set.js) off to his left as he runs: where the
  // stack stands and how it's turned. The pistol lies on the top one (its
  // muzzle `restTurn` radians off the crate's long side) until a teammate
  // behind the crates, out of the picture, throws it to him: it flies for
  // `flight` seconds, turning end over end `turns` whole times, and
  // arrives in his hand at the dive's catch.
  crates: { x: 1.6, z: 6.2, yaw: 0.2 },
  toss: { flight: 1.05, turns: 1, restTurn: 0.5 },
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

// The labels' facts. Every number is checked (2026-11-08) against the
// sources listed in ballistics.js (the load, the speed, the slowing, the
// twist, the pressures) and round.js (the C.I.P./SAAMI sizes, the bullet's
// length), and most are worked out there from those figures rather than
// typed in here:
//   9.01 mm bullet, 19.15 mm case, 29.69 mm loaded (maximum): C.I.P.
//   124 gr = 8.04 g (1 gr = 64.79891 mg)
//   1,150 ft/s = 350.5 m/s from a 4 in barrel: Federal AE9AP
//   350.5 m/s / 0.254 m a turn = 1,380 turns a second = 82,800 rpm
//   235 MPa = 34,084 psi (C.I.P. maximum)
//   0.67 m/s lost a metre; 12 m in about 35 ms, 342 m/s at the plate
//   (ballistics.js, from Federal's 50 yd figure)
//   speed of sound 343 m/s (dry air, 20 °C)
// The cards: kicker, title, text, and optionally `live` (a line worked out
// each frame, after the kicker).
const fmt = (x, digits = 0) => x.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function cards(range) {
  const flight = timeToTravel(range + SHOT.bore) - SHOT.exit; // muzzle to plate
  const mm = (m) => fmt(m * 1000, 2);
  return {
    name: {
      kicker: 'Bullet cam · 1 / 5',
      title: '9×19 mm Parabellum',
      text: `The 9 mm Luger: a ${mm(ROUND.bullet.diameter)} mm bullet in a ${mm(ROUND.case.length)} mm brass case, at most ${mm(ROUND.overall)} mm long loaded. This one is a ${Math.round(SHOT.mass / 0.00006479891)}-grain (${fmt(SHOT.mass * 1000, 1)} g) bullet.`,
    },
    jacket: {
      kicker: 'Bullet cam · 2 / 5',
      title: 'Full metal jacket',
      text: 'A soft lead core inside a drawn copper-alloy jacket, open at the base where the lead shows. Just out of the barrel, it carries the rifling’s twisted marks.',
    },
    spin: {
      kicker: 'Bullet cam · 3 / 5',
      title: `${fmt(Math.round(SPIN / 10) * 10)} turns a second`,
      text: `The rifling makes one turn in 10 in (${Math.round(SHOT.twist * 1000)} mm), so it leaves the muzzle spinning at ${fmt(Math.round((SPIN * 60) / 100) * 100)} rpm. The spin keeps it flying point first.`,
    },
    case: {
      kicker: 'Bullet cam · 4 / 5',
      title: 'Brass case',
      text: 'It stays behind. Its 70/30 brass swelled to seal the chamber against up to 235 MPa (34,000 psi); then the slide drew it out and flicked it clear, its primer dented by the striker.',
    },
    speed: {
      kicker: 'Bullet cam · 5 / 5',
      title: `${Math.round(SHOT.speed)} m/s`,
      text: `${fmt(Math.round(SHOT.speed / 0.3048 / 10) * 10)} ft/s from a 4 in barrel, just faster than sound (${SHOT.sound} m/s). The air takes about ${fmt(SHOT.slowing, 1)} m/s off it every metre: it crosses these ${Math.round(range)} m in ${Math.round(flight * 1000)} thousandths of a second.`,
      // (The kicker shows its speed, its Mach number and how far it has gone, live.)
      live: ({ s, travelled }) => {
        const v = bulletSpeed(s);
        return `${Math.round(v)} m/s · Mach ${(v / SHOT.sound).toFixed(2)} · ${fmt(Math.max(0, travelled), 1)} m`;
      },
    },
  };
}

// Camera helpers for the shot list.
// orbit: keys swinging round what it looks at (look: [frame, x, y, z]),
// from angle[0] to angle[1] (degrees round the upright, 0 looking from +Z
// in the frame's axes, 90 from +X) between film seconds at[0] and at[1],
// at `radius` metres (a pair to close in or pull out as it goes), `height`
// metres above it (a pair too), with `lens` mm (a pair: a zoom).
export function orbit(look, { at = [0, 1], angle = [0, 90], radius = 1, height = 0, lens = 35, steps = 4 } = {}) {
  const pair = (v) => (Array.isArray(v) ? v : [v, v]);
  const [r0, r1] = pair(radius), [h0, h1] = pair(height), [l0, l1] = pair(lens);
  const [frame, lx = 0, ly = 0, lz = 0] = look;
  const keys = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const a = ((angle[0] + (angle[1] - angle[0]) * k) * Math.PI) / 180;
    const r = r0 + (r1 - r0) * k;
    keys.push({
      at: at[0] + (at[1] - at[0]) * k,
      pos: [frame, lx + Math.sin(a) * r, ly + h0 + (h1 - h0) * k, lz + Math.cos(a) * r],
      look: [frame, lx, ly, lz],
      lens: l0 + (l1 - l0) * k,
    });
  }
  return keys;
}

// pushIn: two keys moving the camera from `pos` towards what it looks at,
// ending `share` of the way (0.3: a third closer), with an optional zoom.
export function pushIn(pos, look, { at = [0, 1], share = 0.3, lens = 35 } = {}) {
  const [l0, l1] = Array.isArray(lens) ? lens : [lens, lens];
  const end = pos.map((v, i) => (i === 0 || pos[0] !== look[0] ? v : v + (look[i] - v) * share));
  return [{ at: at[0], pos, look, lens: l0 }, { at: at[1], pos: end, look, lens: l1 }];
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
      sounds: [[0.1, 'whoosh']],
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
    // Up over the barrier, aim: over his shoulder, the plate far off. As
    // the trigger breaks, time slows almost to a stop (a ramp from real
    // speed to a 2,500th), then a hard cut to the muzzle.
    {
      name: 'fire', slot: 'fire', from: fire + 0.25, to: F - ms(0.12), blur: 0.006,
      ramp: [[0, 1], [0.75, 1 / 2500], [1.05, 1 / 2500]],
      camera: [
        { at: 0, pos: ['world', 0.95, 1.3, 1.65], look: ['world', 0.3, 1.1, -6], lens: 45, focus: 1.2 },
        { at: 'end', pos: ['world', 0.8, 1.27, 1.42], look: ['world', 0.3, 1.1, -6], lens: 52, focus: 1.1 },
      ],
    },

    // ---- The bullet cam ----
    // At the muzzle: the flash, the bullet coming out of its gas; then the
    // camera rides with it, round it, as the labels come and go.
    {
      name: 'bullet-out', exposure: 0.95, from: F - ms(0.12), to: F + ms(3.0), film: 18.6, aim: true, blur: 0.011, fine: true,
      time: rel(F, [[0, -0.12], [1.2, 0.2], [2.8, 0.43], [5.2, 0.62], [8.0, 0.9], [11.4, 1.45], [15.2, 2.3], [18.6, 3.0]], ms(1)),
      camera: [
        { at: 0, pos: ['muzzle', -0.105, 0.032, 0.11], look: ['muzzle', 0, 0, 0.01], lens: 60 },
        { at: 2.6, pos: ['muzzle', -0.098, 0.028, 0.13], look: ['muzzle', 0, 0, 0.022], lens: 60 },
        { at: 5.2, pos: ['bullet', -0.085, 0.03, 0.004], look: ['bullet', 0, 0, 0], lens: 70 },
        { at: 7.6, pos: ['bullet', -0.08, 0.034, 0.01], look: ['bullet', 0, 0, 0], lens: 70 },
        { at: 9.8, pos: ['bullet', -0.05, 0.03, 0.07], look: ['bullet', 0, 0, 0.002], lens: 70 },
        { at: 12.4, pos: ['bullet', -0.045, 0.028, 0.078], look: ['bullet', 0, 0, 0.002], lens: 70 },
        { at: 14.5, pos: ['bullet', 0.035, 0.022, -0.075], look: ['bullet', 0, 0, 0.003], lens: 70 },
        { at: 18.6, pos: ['bullet', 0.04, 0.024, -0.085], look: ['bullet', 0, 0, 0.003], lens: 70 },
      ],
      labels: [
        { at: 2.8, until: 8.1, card: 'name', side: 'right', anchor: ['bullet', 0, 0, 0] },
        { at: 8.5, until: 13.3, card: 'jacket', side: 'left', anchor: ['bullet', 0, ROUND.bullet.diameter / 2, -0.001] },
        { at: 13.7, until: 18.4, card: 'spin', side: 'right', anchor: ['bullet', 0.0026, 0.0026, -0.0045] },
      ],
      sounds: [[2.7, 'rush14']],
    },
    // Meanwhile, at the gun: the slide back, the case flicked out.
    {
      name: 'case', exposure: 0.95, from: F + ms(3.0), to: F + ms(13), film: 6.5, aim: true, blur: 0.014, fine: true,
      time: rel(F, [[0, 3.0], [1.2, 3.55], [5.0, 9.0], [6.5, 13]], ms(1)),
      camera: [
        { at: 0, pos: ['gun', 0.13, 0.085, -0.095], look: ['gun', 0.025, 0.0, -0.03], lens: 50 },
        { at: 6.5, pos: ['gun', 0.135, 0.095, -0.075], look: ['gun', 0.05, 0.02, -0.015], lens: 50 },
      ],
      labels: [{ at: 0.9, until: 6.3, card: 'case', side: 'left', anchor: ['case', 0, 0, 0] }],
    },
    // Back with the bullet: the plate ahead, coming up fast.
    {
      name: 'flight', exposure: 0.95, from: F + ms(13), to: I - ms(0.45), film: 7.2, aim: true, blur: 0.012,
      time: [[0, F + ms(13)], [3.6, F + ms(21)], [6.2, I - ms(3.0)], [7.2, I - ms(0.45)]],
      // (Focused on the bullet, then pulling focus to the plate as it
      // comes up.)
      camera: [
        { at: 0, pos: ['bullet', -0.042, 0.01, -0.058], look: ['bullet', 0.06, -0.001, 0.2], lens: 40, focus: 0.073 },
        { at: 4.9, pos: ['bullet', -0.046, 0.012, -0.068], look: ['bullet', 0.065, 0, 0.25], lens: 40, focus: 0.083 },
        { at: 6.0, pos: ['bullet', -0.042, 0.016, -0.11], look: ['bullet', 0.006, 0.008, 0.3], lens: 38, focus: 0.13 },
        { at: 7.2, pos: ['bullet', -0.055, 0.022, -0.17], look: ['bullet', 0, 0.01, 0.45], lens: 35, focus: 0.9 },
      ],
      labels: [{ at: 0.5, until: 6.2, card: 'speed', side: 'left', anchor: ['bullet', 0, 0, 0] }],
      sounds: [[0, 'rush7']],
    },
    // The strike, close beside the plate, in slow motion: the bullet comes
    // in, flattens and splashes; then time snaps back (a ramp up to real
    // speed) as the camera pulls back and the plate swings away.
    {
      name: 'impact', exposure: 0.95, from: I - ms(0.45), blur: 0.008, aim: true,
      ramp: [[0, 4e-4], [1.9, 4e-4], [2.15, 6e-4], [2.6, 1], [3.2, 1]],
      camera: [
        { at: 0, pos: ['hit', 0.17, 0.035, 0.13], look: ['hit', 0, 0, 0.012], lens: 50 },
        { at: 2.0, pos: ['hit', 0.16, 0.032, 0.115], look: ['hit', 0, 0, 0.004], lens: 52 },
        { at: 3.2, pos: ['hit', 0.6, 0.09, 0.45], look: ['hit', -0.02, -0.07, 0], lens: 40 },
      ],
      sounds: [[2.05, 'snap']],
    },
    // Wide: the plate rings and swings on its chains.
    {
      name: 'snap', from: 'prev', to: I + 2.2, aim: true, blur: 0.004,
      camera: [
        { at: 0, pos: ['hit', 2.3, 0.05, 1.6], look: ['hit', -0.1, -0.12, 0], lens: 50 },
        { at: 'end', pos: ['hit', 2.2, 0.08, 1.5], look: ['hit', -0.1, -0.12, 0], lens: 50 },
      ],
      sounds: [[0.02, 'ring']],
    },
    // Back to him behind cover, the plate still swinging down range.
    {
      name: 'after', slot: 'fire', from: I + 2.2, to: I + 8.2, blur: 0.005, title: 'end',
      camera: [
        { at: 0, pos: ['world', 1.75, 0.95, 2.7], look: ['hips', -0.2, 0.35, 0], lens: 35 },
        { at: 6, pos: ['world', 1.45, 1.05, 2.35], look: ['hips', -0.2, 0.4, 0], lens: 35 },
      ],
    },
  ];
}

// Sounds at moments in the story, [story time, name, volume]: each plays
// once, the first time the film passes it, at the story's speed then (see
// film.js). S as for shots; film: the Film (for the case's bounces).
export function cues(S, film) {
  const list = [
    [S.fire, 'shot'],
    [S.impact, 'ring'],
    [S.mark('dive', 'catch'), 'slap'],
    [S.mark('dive', 'land'), 'thump'],
  ];
  // The spent case bouncing on the ground, softer each time.
  const landed = film.caseFlight ? film.caseFlight.landed : [];
  landed.slice(0, 4).forEach((t, i) => list.push([S.fire + EJECT.time + t, 'tink', 1 / (1 + i)]));
  return list;
}

export const FILM = {
  name: 'PF-9',
  subtitle: 'Dive · Catch · Cover · Fire',
  credit: 'Soldier: "Soldier Full Tactical Gear" by DanlyVostok, CC BY 4.0 · PF-9: "Pistol 9mm Custom" by ~D-Try~, CC BY 4.0',
  // (When the Mixamo clips are added, add their credit here and in
  // README.md, Credits.)
  slots: SLOTS,
};
