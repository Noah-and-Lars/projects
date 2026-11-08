// The film's edit: where everything is, the soldier's and the enemy's
// moves (which Mixamo clips play when), every shot (what part of the story
// it shows, how fast, and the camera), the bullet cam's labels and the
// sounds. src/showcase/cinematic/film.js plays it.
//
// TIME. The story has its own clock (seconds): his moves follow one another
// on it, he fires three times (S.fires; the last, S.fire, is the one the
// bullet cam follows) and that bullet strikes at S.impact. Each shot shows
// a stretch of the story [from, to] in `film` seconds of the film; `time`
// maps the shot's progress to the story, as keys [film seconds into the
// shot, story time] joined by a smooth curve that never runs backwards.
// Or `ramp` gives its speed instead: keys [film seconds into the shot,
// speed] (story seconds a film second: 1 real time, 0.001 a thousandth),
// eased from key to key in proportion (so a ramp from 1 to 1/2500 slows
// evenly all the way down); the shot lasts to its last key, and with `to`
// it first plays at the first key's speed for as long as it takes to end
// there. `from: 'prev'` starts where the shot before ended (time running
// on across the cut). A shot with neither plays its stretch at real
// speed. So slow motion is a shot whose film seconds are longer than its
// story seconds. Everything moves by the story's clock (both men, the
// pistols, the bullets, the cases, the flash, the smoke, the dust), so
// slow motion slows it all; sounds at story moments (`cues`, below) play
// slowed (deeper) or in their slow-motion form. A camera key `at: 'end'`
// is the shot's last moment.
//
// HIS MOVES. Only Mixamo clips move the men (tools/cinematic/README.md has
// the clips, their marks and how they chain): HERO is his timeline,
// enemy() the enemy's (see Actor.setTimeline in actor.js for what a
// segment holds). His timeline is placed by its cover segment (kneeling
// behind the barriers at LAYOUT.cover), turned to run towards -Z. The PF-9
// is thrown to him and is in his right hand from the dive's catch on, at
// one fixed grip (actor.js, GRIP; the fire clip's grip is turned by the
// film a degree or two so the third shot's bore points exactly at the
// strike).
//
// CAMERAS. Each shot's camera has keys at film seconds into the shot: where
// it is (`pos`) and what it looks at (`look`), each [frame, x, y, z], with a
// lens (`lens`, mm on a full-frame camera: its width sets the view across)
// and optionally `roll` (degrees) and `focus` (metres; else the distance to
// what it looks at). Frames:
//   world            the set's own axes (metres)
//   hips, hand, head his hips', right hand's or head's position, the set's axes
//   catch            where the pistol meets his hand, the set's axes
//   rest             where the pistol lies on the crate, the set's axes
//   muzzle           the muzzle at the last shot, along the bore: [right, up, forward]
//   bullet           the bullet's middle, along its flight: [right, up, forward]
//   gun              the PF-9's own frame (+X its right, +Y up, -Z the muzzle)
//   case             the last shot's spent case, the set's axes
//   hit              where the bullet strikes the enemy, the set's axes
//   sleeve           the same spot on his sleeve, moving with him, the set's axes
//   strike           the same point, along the bullet's flight: [right, up, forward]
//   enemy, ehead     the enemy's hips or head, the set's axes
// Between keys the camera swings round what it looks at (it doesn't cut
// through it), and moves smoothly; orbit() and pushIn() below make keys
// for the usual moves. The picture is wide screen (2.39:1) with bars, and
// a cut is simply the next shot. `blur` is how soft things far out of
// focus get (a share of the picture's width); `shake` a little handheld
// wobble.
//
// Each shot can also: hide someone (`hide: ['soldier', 'enemy']`); show
// labels (`labels`, at film seconds into the shot, with the card on one
// `side`, pointing at `anchor`); play sounds (`sounds`: [film seconds into
// the shot, name], see film.js); show the title or the end (`title`); and
// draw tight shadows round what's close up (`fine`).

import { ROUND } from './round.js';
import { EJECT, SHOT, SPIN, bulletSpeed, timeToTravel } from './ballistics.js';

// Where things are (metres). The barriers run along X at z = 0; he takes
// cover behind them (+Z) and fires towards -Z, at the enemy standing in
// the open by the house.
export const LAYOUT = {
  // His hips as he kneels behind the barriers (the cover segment's first
  // frame): the barrier's middle is 0.75 m ahead of them.
  cover: { x: 0.35, z: 0.8 },
  // The enemy: his left shoulder (where the third shot strikes) is
  // `range` metres down the bore from the muzzle; he faces the shooter,
  // aiming his own PF-9.
  enemy: { range: 13 },
  // The house behind him (the game's, src/world.js): its middle.
  house: { x: 1.5, z: -19.2 },
  // The ammunition crates (set.js) off to his right as he runs in, by the
  // end of the barriers: where the stack stands and how it's turned. The
  // pistol lies on the top one (its muzzle `restTurn` radians off the
  // crate's long side) until a teammate behind the crates, out of the
  // picture, throws it to him: it flies for `flight` seconds, turning end
  // over end `turns` whole times, and arrives in his hand at the dive's
  // catch.
  crates: { x: 3.75, z: 1.2, yaw: 0.25 },
  toss: { flight: 1.05, turns: 1, restTurn: 0.5 },
};

// ---- His moves ----
// (Story seconds. The dive clip's own times are the download's: see
// tools/cinematic/README.md for its marks.)
export const DIVE_AT = 3.2; // the dive starts (6 strides into the sprint)
const DIVE_FROM = 0.42; // at the dive clip's 0.42 s, feet planted
export const dive = (c) => +(DIVE_AT + c - DIVE_FROM).toFixed(4); // story time of dive clip time c
const CUT = dive(2.45); // hard cut to him kneeling behind the barrier
const POP = CUT + 1.25; // he rises
const FIRE1 = POP + 1.05; // the fire clip; shot at its 0.22 s
const FIRE2 = FIRE1 + 0.55; // again from its 0.05 s: shot 0.17 s in
const FIRE3 = FIRE2 + 1.0; // the aimed shot: from 0, shot at 0.22
export const SHOT_AT = 0.22; // the fire clip's shot (the frame before the muzzle climbs)
// His right thumb and fingers, for the grip layer.
const FINGERS = /^CC_Base_R_(Thumb|Index|Mid|Ring|Pinky)[123]$/;

// Fire clip yaw: 22° matches the pop-up (its body is bladed 22° more);
// the first two shots go a little left of him (they strike the house).
export const HERO = [
  { clip: 'sprint', start: 0, from: 0 },
  { clip: 'dive', start: DIVE_AT, from: DIVE_FROM, blend: 0.2 },
  // (The goalkeeper's hands are open claws: from the catch his right
  // fingers close round the grip, from the kneeling aim.)
  { clip: 'cover_aim', layer: true, mask: FINGERS, start: dive(0.9) - 0.03, blend: 0.06, end: CUT, from: 0.5, weight: 20 },
  { clip: 'cover', start: CUT, from: 0, yaw: 12, alignPrev: 2.8 },
  { clip: 'pop_up', start: POP, from: 0, blend: 0.35, yaw: 12 },
  { clip: 'fire', start: FIRE1, from: 0, blend: 0.25, yaw: 25.2 },
  { clip: 'fire', start: FIRE2, from: 0.05, blend: 0.15, yaw: 24.4 },
  { clip: 'fire', start: FIRE3, from: 0, blend: 0.3, yaw: 22 },
];
export const COVER_SEGMENT = 3;
// The shots he fires, story seconds.
export const FIRES = [FIRE1 + SHOT_AT, FIRE2 + SHOT_AT - 0.05, FIRE3 + SHOT_AT];
// Back in cover after the strike (a hard cut, the same place as before),
// gun low.
export const backInCover = (S) => ({ clip: 'cover', start: S.impact + 1.65, from: 0.4, yaw: 12, sameAs: COVER_SEGMENT });

// The enemy's: aiming, still, until the bullet strikes; then struck in his
// left shoulder (Shoulder_Hit_And_Fall reacts from its 0.23 s), cross-fading
// in from the strike as he twists and falls.
export const ENEMY_HIT = 0.23;
export function enemy(S) {
  return [
    { clip: 'enemy_aim', start: -60, from: 0, loop: true, align: false },
    { clip: 'enemy_hit_fall', start: S.impact, from: ENEMY_HIT, blend: 0.14, sameAs: 0, yaw: -20 },
  ];
}
// He lets go of his pistol as he's struck (story seconds after the strike).
export const ENEMY_DROPS = 0.12;

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
//   0.67 m/s lost a metre; 13 m in about 37 ms, 342 m/s at the strike
//   (ballistics.js, from Federal's 50 yd figure)
//   speed of sound 343 m/s (dry air, 20 °C)
//   energy ½ m v², momentum m v (g = 9.81 m/s² for the comparisons)
// The cards: kicker, title, text, and optionally `live` (a line worked out
// each frame, after the kicker). range: muzzle to strike (m); hitS: the
// strike, seconds after the primer fired.
const fmt = (x, digits = 0) => x.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function cards(range, hitS) {
  const flight = timeToTravel(range + SHOT.bore) - SHOT.exit; // muzzle to strike
  const mm = (m) => fmt(m * 1000, 2);
  const v = bulletSpeed(hitS);
  const energy = 0.5 * SHOT.mass * v * v; // J
  const momentum = SHOT.mass * v; // kg m/s
  const g = 9.81;
  return {
    name: {
      kicker: 'Bullet cam · 1 / 5',
      title: '9×19 mm Parabellum',
      text: `The 9 mm Luger: a ${mm(ROUND.bullet.diameter)} mm, ${Math.round(SHOT.mass / 0.00006479891)}-grain (${fmt(SHOT.mass * 1000, 2)} g) full metal jacket bullet (a lead core in a drawn copper-alloy jacket, open at the base) in a ${mm(ROUND.case.length)} mm brass case: ${mm(ROUND.overall)} mm long loaded, at most.`,
    },
    spin: {
      kicker: 'Bullet cam · 2 / 5',
      title: `${fmt(Math.round(SPIN / 10) * 10)} turns a second`,
      text: `The rifling makes one turn in 10 in (${Math.round(SHOT.twist * 1000)} mm), so it leaves the muzzle spinning at ${fmt(Math.round((SPIN * 60) / 100) * 100)} rpm, its jacket scored by the rifling. The spin keeps it flying point first.`,
    },
    case: {
      kicker: 'Bullet cam · 3 / 5',
      title: 'Brass case',
      text: 'It stays behind. Its 70/30 brass swelled to seal the chamber against up to 235 MPa (34,000 psi); then the slide drew it out and flicked it clear, its primer dented by the striker.',
    },
    speed: {
      kicker: 'Bullet cam · 4 / 5',
      title: `${Math.round(SHOT.speed)} m/s`,
      text: `${fmt(Math.round(SHOT.speed / 0.3048 / 10) * 10)} ft/s from a 4 in barrel, just faster than sound (${SHOT.sound} m/s). The air takes about ${fmt(SHOT.slowing, 1)} m/s off it every metre: it crosses these ${Math.round(range)} m in ${Math.round(flight * 1000)} thousandths of a second.`,
      // (The kicker shows its speed, its Mach number and how far it has gone, live.)
      live: ({ s, travelled }) => {
        const u = bulletSpeed(s);
        return `${Math.round(u)} m/s · Mach ${(u / SHOT.sound).toFixed(2)} · ${fmt(Math.max(0, travelled), 1)} m`;
      },
    },
    energy: {
      kicker: 'Bullet cam · 5 / 5',
      title: `${fmt(Math.round(energy / 10) * 10)} joules`,
      text: `The energy it brings at ${Math.round(v)} m/s: ½ × ${fmt(SHOT.mass * 1000, 2)} g × (${Math.round(v)} m/s)², about what a 1 kg weight gathers falling ${Math.round(energy / g)} m, given up in a fraction of a millisecond. Its push is small, though: ${fmt(momentum, 2)} kg·m/s, like a 1 kg bag dropped from ${Math.round((momentum * momentum) / (2 * g) * 100)} cm.`,
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

// The shots, in order. S: the story's times ({ fire, fires, impact });
// ms(x) is x thousandths of a second.
export function shots(S) {
  const ms = (x) => x / 1000;
  const F = S.fire, I = S.impact;
  const [F1, F2] = S.fires;
  const rel = (base, keys, scale = 1) => keys.map(([f, s]) => [f, base + s * scale]);
  return [
    // The PF-9 lying on the crate with a round beside it; the title.
    {
      name: 'open', from: -3.0, to: 0, title: 'open', blur: 0.03, hide: ['soldier'],
      camera: [
        { at: 0, pos: ['rest', 0.3, 0.07, 0.2], look: ['rest', 0.02, 0.0, 0], lens: 85 },
        { at: 'end', pos: ['rest', 0.25, 0.085, 0.27], look: ['rest', -0.02, 0.0, 0], lens: 85 },
      ],
      sounds: [[0.05, 'whoosh']],
    },
    // He sprints in, far off, past the enemy's shoulder (soft, in the
    // foreground) as he watches over his pistol: long lens.
    {
      name: 'establish', from: 0, to: 2.3, blur: 0.012, shake: 0.3,
      camera: [
        { at: 0, pos: ['ehead', 0.5, 0.02, -2.4], look: ['hips', 0, 0.1, 0], lens: 70, focus: 24 },
        { at: 'end', pos: ['ehead', 0.47, 0.02, -2.3], look: ['hips', 0, 0.15, 0], lens: 70, focus: 18 },
      ],
    },
    // Tracking beside him, low, on his last strides.
    {
      name: 'track', from: 2.3, to: dive(0.57), blur: 0.008, shake: 0.6,
      camera: [
        { at: 0, pos: ['hips', 3.3, -0.3, -1.9], look: ['hips', 0, 0.22, 0], lens: 35 },
        { at: 'end', pos: ['hips', 3.0, -0.35, -0.9], look: ['hips', 0, 0.2, 0], lens: 35 },
      ],
    },
    // The takeoff, from low on the ground: time slows as he leaves it and
    // the pistol comes spinning in.
    {
      name: 'takeoff', from: dive(0.57), to: dive(0.83), blur: 0.006,
      ramp: [[0, 1], [0.08, 1], [0.5, 0.09], [1.0, 0.09]],
      camera: [
        { at: 0, pos: ['world', -0.75, 0.16, 2.5], look: ['hips', 0, 0.15, 0], lens: 24 },
        { at: 'end', pos: ['world', -0.7, 0.17, 2.4], look: ['catch', 0.25, -0.05, 0.25], lens: 24 },
      ],
      sounds: [[0.1, 'whoosh']],
    },
    // The grab, slowest of all, the camera swinging round him as the
    // pistol turns into his hand; at the catch time snaps back to speed.
    {
      name: 'grab', from: 'prev', blur: 0.01,
      ramp: [[0, 0.09], [0.45, 0.028], [2.15, 0.028], [2.45, 1], [2.75, 1]],
      camera: [
        ...orbit(['catch', 0, 0, 0], { at: [0, 2.2], angle: [200, 282], radius: [1.25, 1.1], height: [0.12, 0.2], lens: 40, steps: 5 }),
        { at: 2.75, pos: ['catch', -2.1, 0.1, 1.0], look: ['hips', 0, 0.1, 0], lens: 34 },
      ],
    },
    // He lands and rolls, a moment slower as he hits the ground, into
    // the barrier's shelter.
    {
      name: 'land', from: 'prev', to: CUT, blur: 0.006,
      ramp: [[0, 1], [0.12, 1], [0.32, 0.32], [0.9, 0.32], [1.2, 1], [1.4, 1]],
      camera: [
        { at: 0, pos: ['world', -2.5, 0.35, 2.6], look: ['hips', 0, 0, 0], lens: 28 },
        { at: 'end', pos: ['world', -2.35, 0.4, 2.35], look: ['hips', 0, 0.1, 0], lens: 28 },
      ],
      sounds: [],
    },
    // Hard cut: kneeling behind the barrier, close, in profile.
    {
      name: 'cover', from: CUT, to: POP + 0.2, blur: 0.012, shake: 0.4,
      camera: [
        { at: 0, pos: ['world', -0.6, 0.86, 0.36], look: ['head', 0, -0.12, 0], lens: 40 },
        { at: 'end', pos: ['world', -0.45, 0.88, 0.38], look: ['head', 0, -0.1, 0], lens: 40 },
      ],
    },
    // He rises over it: from low, the enemy's side.
    {
      name: 'rise', from: POP + 0.2, to: F1 - 0.06, blur: 0.008,
      camera: [
        { at: 0, pos: ['world', 1.25, 0.5, -2.4], look: ['hips', 0, 0.55, 0], lens: 32 },
        { at: 'end', pos: ['world', 1.2, 0.52, -2.3], look: ['hips', 0, 0.75, 0], lens: 32 },
      ],
    },
    // Two quick shots, over his shoulder: the house behind the enemy
    // takes them.
    {
      name: 'shots', from: F1 - 0.06, to: F2 + 0.45, blur: 0.006, shake: 0.5,
      camera: [
        { at: 0, pos: ['hips', 0.62, 0.78, 1.15], look: ['enemy', 0, 0.3, 0], lens: 45, focus: 1.6 },
        { at: 'end', pos: ['hips', 0.6, 0.8, 1.05], look: ['enemy', 0, 0.35, 0], lens: 47, focus: 1.5 },
      ],
    },
    // The aimed shot: close on his face and the gun; as the trigger
    // breaks, time slows almost to a stop, then a hard cut to the muzzle.
    {
      name: 'aim', from: F2 + 0.45, to: F - ms(0.12), blur: 0.01,
      ramp: [[0, 1], [0.25, 1], [1.05, 1 / 2500], [1.3, 1 / 2500]],
      camera: [
        { at: 0, pos: ['head', -1.15, -0.04, -0.22], look: ['head', 0, -0.1, -0.42], lens: 60 },
        { at: 'end', pos: ['head', -1.0, -0.04, -0.25], look: ['head', 0, -0.1, -0.45], lens: 66 },
      ],
    },

    // ---- The bullet cam ----
    // At the muzzle: the flash, the bullet coming out of its gas; then the
    // camera rides with it, round it, as the labels come and go.
    {
      name: 'bullet-out', exposure: 0.95, from: F - ms(0.12), to: F + ms(3.0), film: 11, blur: 0.011, fine: true,
      time: rel(F, [[0, -0.12], [1.2, 0.2], [2.6, 0.43], [4.4, 0.66], [7.2, 1.2], [11, 3.0]], ms(1)),
      camera: [
        { at: 0, pos: ['muzzle', -0.105, 0.032, 0.11], look: ['muzzle', 0, 0, 0.01], lens: 60 },
        { at: 2.4, pos: ['muzzle', -0.098, 0.028, 0.13], look: ['muzzle', 0, 0, 0.022], lens: 60 },
        { at: 4.2, pos: ['bullet', -0.085, 0.03, 0.004], look: ['bullet', 0, 0, 0], lens: 70 },
        { at: 6.4, pos: ['bullet', -0.07, 0.032, 0.03], look: ['bullet', 0, 0, 0.001], lens: 70 },
        { at: 8.4, pos: ['bullet', 0.035, 0.022, -0.075], look: ['bullet', 0, 0, 0.003], lens: 70 },
        { at: 11, pos: ['bullet', 0.04, 0.024, -0.085], look: ['bullet', 0, 0, 0.003], lens: 70 },
      ],
      labels: [
        { at: 2.6, until: 7.0, card: 'name', side: 'right', anchor: ['bullet', 0, 0, 0] },
        { at: 7.3, until: 10.85, card: 'spin', side: 'left', anchor: ['bullet', 0.0026, 0.0026, -0.0045] },
      ],
      sounds: [[2.5, 'rush14']],
    },
    // Meanwhile, at the gun: the slide back, the case flicked out.
    {
      name: 'case', exposure: 0.95, from: F + ms(3.0), to: F + ms(13), film: 5, blur: 0.014, fine: true,
      time: rel(F, [[0, 3.0], [1.0, 3.55], [3.9, 9.0], [5, 13]], ms(1)),
      camera: [
        { at: 0, pos: ['gun', 0.13, 0.085, -0.095], look: ['gun', 0.025, 0.0, -0.03], lens: 50 },
        { at: 5, pos: ['gun', 0.135, 0.095, -0.075], look: ['gun', 0.05, 0.02, -0.015], lens: 50 },
      ],
      labels: [{ at: 0.7, until: 4.85, card: 'case', side: 'left', anchor: ['case', 0, 0, 0] }],
    },
    // Back with the bullet: the enemy ahead, coming up fast.
    {
      name: 'flight', exposure: 0.95, from: F + ms(13), to: I - ms(0.45), film: 6, blur: 0.012,
      time: [[0, F + ms(13)], [3.0, F + ms(21)], [5.1, I - ms(3.0)], [6, I - ms(0.45)]],
      // (Focused on the bullet, then pulling focus to him as he comes up.)
      camera: [
        { at: 0, pos: ['bullet', -0.042, 0.01, -0.058], look: ['bullet', 0.06, -0.001, 0.2], lens: 40, focus: 0.073 },
        { at: 4.1, pos: ['bullet', -0.046, 0.012, -0.068], look: ['bullet', 0.065, 0, 0.25], lens: 40, focus: 0.083 },
        { at: 5.0, pos: ['bullet', -0.042, 0.016, -0.11], look: ['bullet', 0.006, 0.008, 0.3], lens: 38, focus: 0.13 },
        { at: 6, pos: ['bullet', -0.055, 0.022, -0.17], look: ['bullet', 0, 0.01, 0.45], lens: 35, focus: 0.9 },
      ],
      labels: [{ at: 0.4, until: 5.0, card: 'speed', side: 'left', anchor: ['bullet', 0, 0, 0] }],
      sounds: [[0, 'rush7']],
    },
    // The strike, close beside his shoulder, in deep slow motion: the
    // bullet comes in and a puff of cloth dust bursts from his sleeve;
    // time eases up as he twists (the camera holding on him), then snaps
    // back to real speed as he drops.
    {
      name: 'impact', exposure: 1.0, from: I - ms(0.45), blur: 0.008,
      ramp: [[0, 4e-4], [1.7, 4e-4], [2.4, 1 / 14], [5.9, 1 / 14], [6.5, 1], [7.6, 1]],
      camera: [
        { at: 0, pos: ['strike', 0.62, 0.08, -0.52], look: ['strike', -0.08, -0.05, 0.02], lens: 50 },
        { at: 1.8, pos: ['strike', 0.66, 0.09, -0.55], look: ['strike', -0.08, -0.06, 0.04], lens: 50 },
        { at: 3.6, pos: ['strike', 1.0, 0.12, -0.85], look: ['enemy', 0, 0.38, 0], lens: 42 },
        { at: 5.9, pos: ['strike', 1.3, 0.1, -1.1], look: ['enemy', 0, 0.25, 0], lens: 38 },
        { at: 7.6, pos: ['strike', 2.4, 0.0, -1.9], look: ['enemy', 0, 0.0, 0], lens: 35 },
      ],
      labels: [{ at: 2.0, until: 5.85, card: 'energy', side: 'right', anchor: ['sleeve', 0, 0, 0] }],
      sounds: [[6.15, 'snap']],
    },
    // Back to him behind cover, the pistol low; the end.
    {
      name: 'after', from: I + 1.65, to: I + 7.6, blur: 0.012, title: 'end',
      camera: [
        { at: 0, pos: ['world', -1.35, 0.78, 0.42], look: ['head', 0.1, -0.3, 0], lens: 35 },
        { at: 'end', pos: ['world', -1.05, 0.8, 0.45], look: ['head', 0.1, -0.28, 0], lens: 35 },
      ],
    },
  ];
}

// Sounds at moments in the story, [story time, name, volume]: each plays
// once, the first time the film passes it, at the story's speed then (see
// film.js). S as for shots; film: the Film (for the cases' bounces, his
// footfalls and the dropped pistol).
export function cues(S, film) {
  const list = [
    ...S.fires.map((t) => [t, 'shot']),
    [S.impact, 'hit'],
    [S.catch, 'slap'],
    [dive(0.8), 'whoosh', 0.6],
    [dive(1.27), 'thump', 0.7],
    [dive(1.4), 'thump'],
    [dive(1.85), 'thump', 0.6],
    [CUT + 0.05, 'cloth', 0.6],
    [S.impact + 0.9, 'thump', 0.7],
    [S.impact + 1.2, 'thump'],
  ];
  // His footfalls as he sprints (each foot's touchdown).
  for (const t of film.footfalls || []) list.push([t, 'step', 0.8]);
  // The spent cases bouncing on the ground, softer each time.
  for (const shot of film.shots || []) {
    shot.caseFlight.landed.slice(0, 3).forEach((t, i) => list.push([shot.F + EJECT.time + t, 'tink', 0.8 / (1 + i)]));
  }
  // The enemy's pistol hitting the ground.
  for (const t of film.enemyGunLands || []) list.push([t, 'clatter']);
  return list;
}

export const FILM = {
  name: 'PF-9',
  subtitle: 'Dive · Catch · Cover · Fire',
  // The end's credits, a line each (the full credits are in README.md,
  // Credits, and the game's own credits in index.html).
  credits: [
    'Animations from Mixamo (Adobe), retargeted onto the soldier',
    'Soldier: "Soldier Full Tactical Gear" by DanlyVostok, CC BY 4.0',
    'PF-9: "Pistol 9mm Custom" by ~D-Try~, CC BY 4.0',
    'Outfit gear: models by Exactly, CC BY 4.0',
  ],
};
