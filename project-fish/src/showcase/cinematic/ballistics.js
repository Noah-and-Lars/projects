// The shot, as numbers: where the bullet, the slide, the barrel and the
// spent case are at any moment, as plain functions of the time since the
// primer fired (seconds), so the film can show any instant exactly (and
// slow it down as much as it likes).
//
// The facts, and where they come from (checked 2026-11):
// - The load: a 115 grain (7.45 g) FMJ round-nose bullet. Federal's
//   American Eagle AE9DP (115 gr FMJ) is listed at 1,180 ft/s (360 m/s) at
//   the muzzle from a 4 in test barrel, 1,048 ft/s at 50 yards, 356 ft·lbf
//   (483 J) at the muzzle (federalpremium.com, AE9DP; the same figures in
//   Vista Outdoor's ballistics chart). Wikipedia's "9×19mm Parabellum"
//   table gives the same 360 m/s for a 115 gr Federal FMJ. The speed falls
//   (1,180 - 1,048) ft/s over 50 yd: 0.88 m/s for each metre it flies.
// - The rifling: one turn in 250 mm (9.84 in), the C.I.P. figure Wikipedia
//   gives for the cartridge (and the twist of the polygonal barrels of the
//   pistols the PF-9 is like); so it leaves spinning 360 / 0.25 = 1,440
//   turns a second (86,400 rpm). Spin dies away far more slowly than speed,
//   so over 12 m it's taken as constant.
// - Sound travels at 343 m/s in air at 20 °C, so it leaves just faster
//   than sound.
// - Pressure: at most 235 MPa (C.I.P.), 35,000 psi (SAAMI).
// - The PF-9's barrel (assets/pistol.glb): 104 mm (4.1 in) from the
//   chamber's back to the muzzle; the bullet's base, seated, is 88.6 mm
//   from the muzzle.
// - The case: 70/30 cartridge brass (70% copper, 30% zinc).
//
// What isn't measured: how a pistol's parts move inside the first few
// thousandths of a second. The times below are a believable sequence for a
// short-recoil pistol of this size (the bullet leaves before the slide has
// moved more than a millimetre; the barrel unlocks; the slide reaches the
// back about 5 ms in, throws the case out on the way and is home by about
// 12 ms), not a measurement of this gun.

export const SHOT = {
  speed: 360, // m/s at the muzzle
  slowing: 0.88, // m/s lost per metre flown (1/s)
  twist: 0.25, // metres per turn of the rifling
  mass: 0.00745, // kg (115 grains)
  bore: 0.0886, // m the bullet's base travels in the barrel
  sound: 343, // m/s
};
// (The bullet speeds up in the barrel as x = bore * (t / exit)^1.6, which
// leaves it at the muzzle speed.)
SHOT.exit = (1.6 * SHOT.bore) / SHOT.speed; // 0.39 ms

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

// The plate's swing (radians, its bottom back from the shooter) t seconds
// after the bullet strikes. A 12 in plate of 3/8 in steel weighs about
// 5.3 kg; the bullet's 2.7 kg·m/s gives it about half a metre a second,
// which swings it some 15 degrees on its chains, a damped pendulum.
export function plateSwing(t, { peak = 0.26, period = 1.25, damping = 0.55 } = {}) {
  if (t <= 0) return 0;
  const w = (2 * Math.PI) / period;
  return peak * 1.25 * Math.exp(-damping * t) * Math.sin(w * t) * (1 - Math.exp(-t / 0.004));
}
