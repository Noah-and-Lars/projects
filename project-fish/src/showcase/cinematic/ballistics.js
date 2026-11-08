// The shot, as numbers: where the bullet, the slide, the barrel and the
// spent case are at any moment, as plain functions of the time since the
// primer fired (seconds), so the film can show any instant exactly (and
// slow it down as much as it likes).
//
// The facts, and where they come from (each checked 2026-11-08):
// - The load: a 124 grain (8.04 g) full metal jacket round-nose bullet,
//   the NATO-standard weight. Federal American Eagle AE9AP (9mm Luger,
//   124 gr FMJ): 1,150 ft/s (350.5 m/s) at the muzzle from a 4 in test
//   barrel; 1,095 ft/s at 25 yd, 1,049 ft/s at 50 yd, 977 ft/s at 100 yd;
//   364 ft-lbf (494 J) at the muzzle.
//   https://www.federalpremium.com/handgun/american-eagle/11-AE9AP.html
//   So it loses (1,150 - 1,049) ft/s over 50 yd: 30.8 m/s in 45.72 m,
//   0.673 m/s for each metre it flies (speed falling in a straight line
//   with distance, which is what an exponential fall in time gives; good
//   to a fraction of a m/s over the film's 13 m). That leaves it at about
//   342 m/s after the film's 13 m.
// - The rifling: one turn in 10 in (254 mm), the usual twist of 9 mm
//   pistol barrels in the US (SIG Sauer's, for example); C.I.P. gives
//   250 mm (1 in 9.84 in) (https://en.wikipedia.org/wiki/9×19mm_Parabellum,
//   its infobox). So it leaves spinning 350.5 / 0.254 = 1,380 turns a
//   second (82,800 rpm). Spin dies away far more slowly than speed, so
//   over 13 m it's taken as constant.
// - Sound travels at 343 m/s in dry air at 20 °C: the bullet leaves just
//   faster than sound (Mach 1.02) and drops just below it by the end of
//   its 13 m flight.
// - Pressure: at most 235 MPa (34,084 psi) by C.I.P., 35,000 psi
//   (241 MPa) by SAAMI (the same Wikipedia infobox).
// - The PF-9's barrel (assets/pistol.glb): 104 mm (4.1 in) from the
//   chamber's back to the muzzle, close to the 4 in test barrel. The
//   bullet's base, seated (round.js: the cartridge at its 29.69 mm
//   maximum length), is 104 - (19.15 - 4.86) = 89.7 mm from the muzzle.
// - The case: 70/30 cartridge brass (70% copper, 30% zinc).
//
// What isn't measured: how a pistol's parts move inside the first few
// thousandths of a second. The times below are a believable sequence for a
// short-recoil pistol of this size (the bullet leaves before the slide has
// moved more than a millimetre; the barrel unlocks; the slide reaches the
// back about 5 ms in, throws the case out on the way and is home by about
// 12 ms), not a measurement of this gun.

import { ROUND } from './round.js';

const FT = 0.3048;
export const SHOT = {
  speed: 1150 * FT, // m/s at the muzzle (350.5)
  slowing: ((1150 - 1049) * FT) / (50 * 3 * FT), // m/s lost per metre flown (1/s): 0.673
  twist: 0.254, // metres per turn of the rifling (1 in 10 in)
  mass: 124 * 0.00006479891, // kg (124 grains: 8.035 g)
  barrel: 0.104, // the PF-9's, chamber's back to muzzle (m)
  sound: 343, // m/s
};
// How far the bullet's base travels in the barrel (m).
SHOT.bore = SHOT.barrel - (ROUND.case.length - ROUND.seat);
// (The bullet speeds up in the barrel as x = bore * (t / exit)^1.6, which
// leaves it at the muzzle speed.)
SHOT.exit = (1.6 * SHOT.bore) / SHOT.speed; // 0.41 ms

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// How far the bullet's base has gone from where it sat in the case
// (metres) t seconds after the primer fired.
export function bulletTravel(t) {
  if (t <= 0) return 0;
  if (t < SHOT.exit) return SHOT.bore * (t / SHOT.exit) ** 1.6;
  const k = SHOT.slowing;
  return SHOT.bore + (SHOT.speed / k) * (1 - Math.exp(-k * (t - SHOT.exit)));
}

// Its speed (m/s).
export function bulletSpeed(t) {
  if (t <= 0) return 0;
  if (t < SHOT.exit) return ((1.6 * SHOT.bore) / SHOT.exit) * (t / SHOT.exit) ** 0.6;
  return SHOT.speed * Math.exp(-SHOT.slowing * (t - SHOT.exit));
}

// The time the bullet's base has gone `d` metres (the inverse of
// bulletTravel), for working out when it reaches something.
export function timeToTravel(d) {
  if (d <= 0) return 0;
  if (d < SHOT.bore) return SHOT.exit * (d / SHOT.bore) ** (1 / 1.6);
  const k = SHOT.slowing;
  return SHOT.exit - Math.log(1 - ((d - SHOT.bore) * k) / SHOT.speed) / k;
}

// How far it has turned (radians, right-hand: clockwise seen from behind):
// the rifling turns it as it goes down the barrel, and it keeps the spin.
export function bulletSpin(t) {
  const inBarrel = Math.min(bulletTravel(t), SHOT.bore);
  let turns = inBarrel / SHOT.twist;
  if (t > SHOT.exit) turns += (SHOT.speed / SHOT.twist) * (t - SHOT.exit);
  return turns * Math.PI * 2;
}

// Spin, turns a second.
export const SPIN = SHOT.speed / SHOT.twist;

// How far the slide is back (metres) t seconds after the primer fired; it
// goes back `travel` (the PF-9's 34 mm).
export function slideBack(t, travel = 0.034) {
  const ms = t * 1000;
  if (ms <= 0.15) return 0;
  // Locked to the barrel, they move together a little while the bullet is
  // in the barrel; then it unlocks and the slide runs back fast, slowing
  // against the recoil spring, and is driven home again.
  if (ms < 1.2) return 0.003 * smooth(0.15, 1.2, ms) * (ms / 1.2);
  if (ms < 5.0) {
    const x = (ms - 1.2) / 3.8;
    return 0.003 + (travel - 0.003) * (1 - (1 - x) ** 2.2);
  }
  if (ms < 5.6) return travel;
  if (ms < 12) {
    const x = (ms - 5.6) / 6.4;
    return travel * (1 - x * x * (1.6 - 0.6 * x));
  }
  return 0;
}

// The barrel: it follows the slide back its first 3 mm, tipping its back
// end down as it unlocks (radians, up to `tilt`).
export function barrelPose(slide, barrel) {
  return {
    travel: Math.min(slide, barrel.travel),
    tilt: barrel.tilt * smooth(0.0015, 0.007, slide),
  };
}

// When the case leaves the slide: the extractor draws it back with the
// slide until it hits the ejector.
export const EJECT = {
  time: 0.0034, // s after the primer fires
  // Its throw in the gun's frame (+X right, +Y up, +Z back): out to the
  // right and up, a little back (m/s), tumbling end over end (turns a
  // second) about an axis a little off the gun's vertical.
  velocity: [4.2, 2.4, 1.0],
  spin: 38,
  axis: [0.25, 1, -0.35],
};

// The gun kicking in the hand (s since the primer fired): how far it's
// shoved back (m) and how far its muzzle flips up (radians). Little
// happens while the bullet is in the barrel; the flip peaks about 80 ms in
// and the hands bring it back down by about 350 ms.
export function gunKick(t) {
  if (t <= 0.0005) return { back: 0, rise: 0 };
  const s = t - 0.0005;
  const rise = 0.24 * (1 - Math.exp(-s / 0.03)) * Math.exp(-Math.max(0, s - 0.06) / 0.09);
  const back = 0.022 * (1 - Math.exp(-s / 0.012)) * Math.exp(-Math.max(0, s - 0.03) / 0.08);
  return { back, rise };
}
