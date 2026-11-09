// Gameplay values that the game and the future multiplayer server must agree on.
// Nothing in src/shared/ may use three.js or the browser, so a server can run it too.

// The game logic runs at a fixed rate, whatever the screen's frame rate.
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export const PLAYER = {
  height: 1.8, // m, standing
  eyeHeight: 1.65, // m, camera height above the feet, standing
  radius: 0.35, // m, how wide the player is when bumping into things
  // How tall the player is (for bumping into things) and where the eyes are,
  // in each stance and move.
  heights: { stand: 1.8, crouch: 1.2, slide: 0.95, prone: 0.55, supine: 0.6, dive: 0.8 },
  eyes: { stand: 1.65, crouch: 1.08, slide: 0.82, prone: 0.38, supine: 0.48, dive: 0.65 },
  stepHeight: 0.35, // m, walks straight up anything this low
};

export const MOVEMENT = {
  walkSpeed: 5.0, // m/s
  // Speeds as fractions of walkSpeed.
  aimSpeedFactor: 0.6, // aiming down the sights
  sprintSpeedFactor: 1.36, // sprinting (hold Shift going forwards): 6.8 m/s
  tacSprintSpeedFactor: 1.68, // tactical sprint (double-tap Shift): 8.4 m/s, while stamina lasts
  backSpeedFactor: 0.75, // walking backwards
  strafeSpeedFactor: 0.9, // walking sideways
  crouchSpeedFactor: 0.5, // crouched
  crouchAimSpeedFactor: 0.35, // crouched and aiming
  proneSpeed: 0.9, // m/s, crawling
  groundAccel: 50, // m/s², how hard you speed up or change direction on the ground
  groundDecel: 40, // m/s², how hard you stop when you let go of the keys
  airAccel: 12, // m/s², how much you can steer in the air
  gravity: 20, // m/s², stronger than real life so jumps feel crisp
  jumpHeight: 1.0, // m
  jumpBuffer: 0.1, // s, a jump pressed this long before landing still happens
  coyoteTime: 0.1, // s, you can still jump this long after walking off an edge
  doubleTap: 0.3, // s, two presses this close together are a double tap

  // Changing stance: how fast the eyes move (m/s).
  stanceSpeed: { crouch: 4, prone: 1.5 },

  // Tactical sprint and stamina (plain sprinting never runs out).
  tacSprintTime: 4, // s from full to empty
  tacSprintMinStamina: 0.25, // needed to start one
  staminaRegenDelay: 0.6, // s after it stops
  staminaRegenTime: 3, // s from empty to full
  fatigueStart: 0.3, // below this much stamina it slows towards a plain sprint

  // Sliding: press C while sprinting.
  slideMinSprintTime: 0.15, // s of sprinting first
  slideMinSpeed: 5.5, // m/s
  slideBoost: 1.2, // speed at the start, times the sprint speed you had
  slideMaxStartSpeed: 9.6, // m/s
  slideFriction: 7, // m/s², how fast it slows
  slideTime: 0.75, // s at most
  slideSteer: 4, // m/s², how much you can steer
  slideJumpDelay: 0.15, // s into a slide before you can jump out of it
  slideCooldown: 0.3, // s before the next one (sprinting again)
  // Supine slide: double-tap C while sprinting. Longer and lower, ending on
  // your back; getting up takes a moment.
  supineBoost: 1.4,
  supineFriction: 5,
  supineTime: 1.1,
  supineRise: 0.55, // s

  // Diving: press Z while sprinting.
  diveMinSprintTime: 0.15,
  diveUp: 3.2, // m/s up at the start
  diveMaxSpeed: 9,
  diveFriction: 10, // m/s², sliding on your front after landing
  diveRecover: 0.45, // s before you can crawl after landing
  diveAfterJump: 0.35, // s after a jump before you can dive

  // Landing: falls from higher than this slow you a little for a moment.
  landSlowFall: 1.5, // m
  landSlow: { time: 0.15, factor: 0.7 },
  hardLandFall: 3.5, // m
  hardLand: { time: 0.35, factor: 0.5 },
  sprintLandKeep: 0.8, // landing while sprinting keeps at least this much speed

  // Mantling and vaulting (Space at a ledge, or automatically in the air).
  mantleProbe: 0.5, // m beyond the player's edge
  mantleReach: 2.1, // m above the feet (standing or in the air)
  vaultMaxHeight: 1.15, // m: lower, and thin enough, and you go over instead of onto
  vaultMaxDepth: 0.8, // m
  mantleTimes: { vault: 0.4, low: 0.45, mid: 0.55, high: 0.75 }, // s
};

export const WORLD = {
  size: 2000, // m, the baseplate is size × size, centred on 0,0
};

// The guns. Times in seconds, angles in degrees, distances in metres. Each
// gun's `name` is what the player sees (the ammo counter, the loadout menu,
// the main menu's credits); everything else knows it by its key in GUNS.
// A gun fires once per trigger pull unless its fireMode is 'auto' (it fires
// as long as the trigger is held, see src/weapon.js).
// The first pistol: a compact 9 mm, 15 rounds.
export const PISTOL = {
  name: 'PF-9',
  fireInterval: 0.12, // fastest the trigger can be pulled again (500 rounds a minute)
  magazine: 15,
  reserve: 60,
  reloadTime: 2.1, // with rounds left: the old magazine is caught and kept
  emptyReloadTime: 2.5, // from empty: the slide has to be released too
  range: 150,
  // How far shots can stray from where the gun points (half the cone's angle).
  spread: { hip: 1.8, aim: 0.12, moving: 1.2 }, // moving is added at full walking speed
  recoil: 1, // how hard it kicks (the view and the gun)
};

// The second pistol: an M1911, a .45. Fewer, slower, harder-kicking shots.
// (Its reload times match the first pistol's for now: the hands' reload is
// shared, see src/viewmodel/viewmodel.js.)
export const PISTOL45 = {
  name: 'M1911',
  fireInterval: 0.17, // 350 rounds a minute at most
  magazine: 7,
  reserve: 35,
  reloadTime: 2.1,
  // From empty the support hand racks the slide (overhand, from the back)
  // after the magazine goes in, rather than the thumb dropping the slide
  // stop: a little longer. (Fractions of the reload; see RELOAD_STEPS in
  // src/weapon.js.)
  emptyReloadTime: 2.9,
  reloadSteps: {
    empty: { magOut: 0.086, magGrab: 0.31, magIn: 0.543, rackGrab: 0.69, rackPull: 0.735, slideRelease: 0.76, handOn: 0.9 },
  },
  range: 150,
  spread: { hip: 2.1, aim: 0.14, moving: 1.4 },
  recoil: 1.5,
  // Its inspect lingers longer on each thing it shows (extra seconds; see
  // INSPECT_HOLDS in src/weapon.js): 10.4 s in all instead of 7.2.
  inspectHolds: { right: 0.9, left: 0.9, magazine: 0.8, chamber: 0.6 },
};

// The third: a Beretta 92FS, a full-size 9 mm holding 15 rounds. It comes
// with its own arms and its own animations (src/viewmodel/beretta.js), so
// its times are those clips' own lengths: a reload with rounds left is its
// reload clip (2.7 s), one from empty its empty reload (4.03 s, the support
// hand pulls the locked slide back and lets it go at the end), and its
// inspect is its inspect clip (5.03 s). Each shot's clip has the slide home
// 0.12 s after the shot goes off and the trigger pulled again by 0.2: 300
// rounds a minute at most. A heavy, all-steel-slide 9 mm: it kicks a
// little more than the PF-9 and a little less than the M1911.
export const BERETTA = {
  name: 'Beretta 92FS',
  fireInterval: 0.2,
  magazine: 15,
  reserve: 60,
  reloadTime: 2.7,
  emptyReloadTime: 4.033,
  // When things happen, as fractions of the reload: the clips' own times
  // (src/viewmodel/beretta.js) over their lengths. With rounds left the
  // magazine comes out, is swapped for a fresh one at the belt and goes
  // back in (nothing catches it: magCaught is never reached); from empty it
  // drops free, the fresh one is taken at the belt and pushed in, and the
  // slide is pulled back and let go.
  reloadSteps: {
    empty: { magOut: 0.025, magGrab: 0.16, magIn: 0.436, handOn: 0.6, slidePull: 0.649, slideRelease: 0.686 },
    catching: { magOut: 0.127, magCaught: 2, magGrab: 0.247, magIn: 0.528, handOn: 0.6 },
  },
  range: 150,
  spread: { hip: 1.8, aim: 0.11, moving: 1.25 },
  recoil: 1.15,
  // Its inspect is its own clip, this long (seconds), and it's left out
  // with the slide locked back (the clip has the slide forward).
  inspectTime: 5.033,
  inspectLocked: false,
  // Cut short (firing, aiming, reloading, sprinting), its inspect pose goes
  // back to the hold this quickly (seconds): its support hand is far from
  // the grip for most of the clip.
  inspectFade: 0.4,
};

// The fourth: an FN 502 Tactical, a .22 LR pistol holding 10 rounds. It
// comes with its own arms and its own animations too (src/viewmodel/
// fn502.js), so its times are those clips' own lengths: a reload with
// rounds left is its reload clip (1.98 s), one from empty its full reload
// (2.98 s: the support hand racks the slide after the fresh magazine goes
// in). Its shot clip has the slide home 0.19 s after the shot: 300 rounds a
// minute at most. A light .22: it barely kicks, and strays a little less.
// It has no inspect (its maker made none).
export const FN502 = {
  name: 'FN 502',
  fireInterval: 0.2,
  magazine: 10,
  reserve: 40,
  reloadTime: 1.983,
  emptyReloadTime: 2.983,
  // When things happen, as fractions of the reload: the clips' own times
  // (src/viewmodel/fn502.js) over their lengths. Either way the magazine
  // comes out and is swapped for a fresh one at the belt (nothing catches
  // it: magCaught is never reached); from empty, the slide is then pulled
  // back and let go.
  reloadSteps: {
    empty: { magOut: 0.075, magGrab: 0.207, magIn: 0.444, slidePull: 0.612, slideRelease: 0.665, handOn: 0.869 },
    catching: { magOut: 0.113, magCaught: 2, magGrab: 0.311, magIn: 0.668, handOn: 0.811 },
  },
  range: 150,
  spread: { hip: 1.6, aim: 0.1, moving: 1.1 },
  recoil: 0.55,
  inspect: false,
  // Its spent case: a .22 LR's (metres), far smaller than a 9 mm's.
  caseSize: { diameter: 0.0057, length: 0.0156 },
};

// The fifth: a Browning Hi-Power, a 9 mm holding 13 rounds. It comes with
// its own arms and its own animations too (src/viewmodel/hipistol.js), so
// its times are those clips' own lengths: its one reload clip (2.71 s),
// from empty too (its slide goes home after the last shot, so there's
// nothing more to do). Its shot clip has the slide home 0.2 s after the
// shot: 300 rounds a minute at most. An all-steel 9 mm, a little lighter
// than the Beretta. It has no inspect (its maker made none).
export const HIPISTOL = {
  name: 'Browning Hi-Power',
  fireInterval: 0.2,
  magazine: 13,
  reserve: 52,
  reloadTime: 2.708,
  emptyReloadTime: 2.708,
  // When things happen, as fractions of the reload: the clip's own times
  // (src/viewmodel/hipistol.js) over its length. Either way the magazine
  // comes out and is swapped for a fresh one at the belt (nothing catches
  // it, and the slide isn't touched: magCaught and slideRelease are never
  // reached).
  reloadSteps: {
    empty: { magOut: 0.157, magGrab: 0.326, magIn: 0.665, handOn: 0.825, slideRelease: 2 },
    catching: { magOut: 0.157, magCaught: 2, magGrab: 0.326, magIn: 0.665, handOn: 0.825 },
  },
  range: 150,
  spread: { hip: 1.8, aim: 0.11, moving: 1.25 },
  recoil: 1.1,
  inspect: false,
};

// The sixth: a Xiri X4, a full-size pistol, played as a 9 mm holding 15
// rounds. Its clips came with the download and were put on the soldier's
// own arms (src/viewmodel/x4.js), so its times are those clips' own
// lengths: a reload with rounds left is its reload clip (1.53 s), one from
// empty its full reload (1.78 s: the slide stop drops the slide at the
// end), and its inspect is its inspect clip (2.8 s, left out with the slide
// locked back: the clip has it forward). Its shot clip lets go of the
// trigger 0.15 s after the shot: 400 rounds a minute at most.
export const X4 = {
  name: 'Xiri X4',
  fireInterval: 0.15,
  magazine: 15,
  reserve: 60,
  reloadTime: 1.533,
  emptyReloadTime: 1.783,
  // When things happen, as fractions of the reload: the clips' own times
  // (src/viewmodel/x4.js) over their lengths. Either way the old magazine
  // drops free and a fresh one is pushed in (nothing catches it: magCaught
  // is never reached); from empty, the slide then goes home.
  reloadSteps: {
    empty: { magOut: 0.159, magGrab: 0.299, magIn: 0.393, handOn: 0.5, slideRelease: 0.607 },
    catching: { magOut: 0.185, magCaught: 2, magGrab: 0.348, magIn: 0.457, handOn: 0.6 },
  },
  range: 150,
  spread: { hip: 1.8, aim: 0.11, moving: 1.25 },
  recoil: 1.05,
  inspectTime: 2.8,
  inspectLocked: false,
  inspectFade: 0.3,
};

// The seventh: an MP7A1, a compact sub-machine gun firing 4.6x30 mm from a
// 40-round magazine, with a suppressor and a red dot. It's fully automatic
// (fireMode 'auto': it fires as long as the trigger is held), about 950
// rounds a minute. Its clips came with the download and were put on the
// soldier's own arms (src/viewmodel/mp7.js), so its times are those clips'
// own lengths: a reload with rounds left is its reload clip (2.32 s), one
// from empty its full reload (2.72 s: the charging handle is pulled after
// the fresh magazine goes in), and its inspect is its inspect clip (2.8 s).
// Each shot kicks far less than a pistol's, but in a burst the kick grows a
// little with each round (burstKick: how much more per round, and at most).
export const MP7 = {
  name: 'MP7A1',
  fireMode: 'auto',
  fireInterval: 60 / 950,
  magazine: 40,
  reserve: 160,
  reloadTime: 2.317,
  emptyReloadTime: 2.717,
  // When things happen, as fractions of the reload: the clips' own times
  // over their lengths. With rounds left the magazine comes out, is put away
  // and a fresh one pushed in; from empty the empty one drops, the fresh
  // one goes in, and the charging handle is pulled and let go.
  reloadSteps: {
    empty: { magOut: 0.098, magGrab: 0.282, magIn: 0.399, slidePull: 0.607, slideRelease: 0.65, handOn: 0.75 },
    catching: { magOut: 0.151, magCaught: 2, magGrab: 0.496, magIn: 0.604, handOn: 0.75 },
  },
  range: 200,
  spread: { hip: 2.2, aim: 0.12, moving: 1.4 },
  recoil: 0.4,
  burstKick: { perRound: 0.05, most: 0.6 },
  inspectTime: 2.8,
  inspectFade: 0.3,
  // Its spent case: a 4.6x30 mm's (metres), longer and narrower than a 9 mm's.
  caseSize: { diameter: 0.008, length: 0.0305 },
};

// The eighth: an AR-15, a civilian rifle firing 5.56 mm from a 30-round
// magazine, semi-automatic (one shot per trigger pull), with a suppressor
// and a holographic sight. Its clips came with the download and were put on
// the soldier's own arms (src/viewmodel/ar15.js), so its times are those
// clips' own lengths: a reload with rounds left is its reload clip (2.5 s),
// one from empty its full reload (2.6 s: the bolt catch is slapped after
// the fresh magazine goes in, and the bolt runs home). It has no shoot
// clip, so nothing sets its pace but the trigger finger: up to 600 rounds a
// minute. A shouldered rifle: it kicks a little less than the PF-9 in the
// view, strays far less aimed, and reaches further. It has no inspect (its
// maker made none).
export const AR15 = {
  name: 'AR-15',
  fireInterval: 0.1,
  magazine: 30,
  reserve: 120,
  reloadTime: 2.5,
  emptyReloadTime: 2.6,
  // When things happen, as fractions of the reload: the clips' own times
  // (src/viewmodel/ar15.js) over their lengths. Either way the support hand
  // fetches the fresh magazine first, then the old one drops away (nothing
  // catches it: magCaught is never reached) and the fresh one is seated;
  // from empty, the bolt then runs home.
  reloadSteps: {
    empty: { magGrab: 0.007, magOut: 0.327, magIn: 0.513, slideRelease: 0.692, handOn: 0.8 },
    catching: { magGrab: 0.007, magOut: 0.34, magCaught: 2, magIn: 0.533, handOn: 0.8 },
  },
  range: 300,
  spread: { hip: 2.4, aim: 0.06, moving: 1.6 },
  recoil: 0.85,
  inspect: false,
  // Its spent case: a 5.56x45 mm's (metres), much longer than a 9 mm's.
  caseSize: { diameter: 0.0096, length: 0.0447 },
};

// The ninth: a Makarov PM, a 9x18 mm Makarov pistol holding 8 rounds. It
// comes with its own arms and its own animations (src/viewmodel/
// makarov.js), so its times are those clips' own lengths: a reload with
// rounds left is its fast reload clip (2.23 s), one from empty its full
// reload (2.98 s: the support hand racks the slide after the fresh
// magazine goes in). Its shot clip has the slide home 0.07 s after the
// shot; like the other pistols it fires up to 300 rounds a minute. A small,
// all-steel blowback gun with a short, sharp kick, a little more than the
// PF-9's. It has no inspect (its maker made none).
export const MAKAROV = {
  name: 'Makarov PM',
  fireInterval: 0.2,
  magazine: 8,
  reserve: 32,
  reloadTime: 2.232,
  emptyReloadTime: 2.982,
  // When things happen, as fractions of the reload: the clips' own times
  // (src/viewmodel/makarov.js) over their lengths. Either way the magazine
  // comes out and is swapped for a fresh one at the belt (nothing catches
  // it: magCaught is never reached); from empty, the slide is then pulled
  // back and let go.
  reloadSteps: {
    empty: { magOut: 0.218, magGrab: 0.355, magIn: 0.575, slidePull: 0.74, slideRelease: 0.807, handOn: 0.978 },
    catching: { magOut: 0.295, magCaught: 2, magGrab: 0.474, magIn: 0.768, handOn: 0.888 },
  },
  range: 150,
  spread: { hip: 1.8, aim: 0.11, moving: 1.25 },
  recoil: 1.1,
  inspect: false,
  // Its spent case: a 9x18 mm Makarov's (metres), a little shorter than a
  // 9x19 mm's.
  caseSize: { diameter: 0.0099, length: 0.0181 },
};

// The tenth: an AK-74M, a 5.45x39 mm assault rifle with a 30-round
// magazine, fully automatic at about 650 rounds a minute. It comes with its
// own arms and its own animations (src/viewmodel/ak74m.js), so its times are
// those clips' own lengths. It has two reloads with rounds left, which take
// turns (reloadTurns, see src/weapon.js): the first (2.65 s) knocks the old
// magazine out with the fresh one, the second (2.82 s) pulls the old one
// first and stows it. From empty (3.5 s) the support hand also reaches over
// and works the charging handle. Its muzzle brake keeps the kick down: a
// little less than the AR-15's per round, growing in a burst.
export const AK74M = {
  name: 'AK-74M',
  fireMode: 'auto',
  fireInterval: 60 / 650,
  magazine: 30,
  reserve: 120,
  reloadTime: 2.648,
  emptyReloadTime: 3.498,
  // When things happen, as fractions of the reload: the clips' own times
  // (src/viewmodel/ak74m.js) over their lengths. With rounds left the
  // fresh magazine is fetched first and knocks the old one out (nothing
  // catches it: magCaught is never reached); from empty the same, and the
  // charging handle is pulled and let go.
  reloadSteps: {
    empty: { magGrab: 0.267, magOut: 0.328, magIn: 0.543, slidePull: 0.705, slideRelease: 0.736, handOn: 0.891 },
    catching: { magGrab: 0.352, magOut: 0.434, magCaught: 2, magIn: 0.718, handOn: 0.824 },
  },
  // The second reload with rounds left: the old magazine pulled and
  // stowed, then the fresh one seated (its clip, length and steps).
  reloadTurns: [
    { clip: 'reload2', time: 2.815, steps: { magGrab: 0.189, magOut: 0.337, magCaught: 2, magIn: 0.583, handOn: 0.905 } },
  ],
  range: 300,
  spread: { hip: 2.6, aim: 0.08, moving: 1.6 },
  recoil: 0.6,
  burstKick: { perRound: 0.06, most: 0.7 },
  inspect: false,
  // Its spent case: a 5.45x39 mm's (metres).
  caseSize: { diameter: 0.01, length: 0.0396 },
};

// The eleventh: an AK-74U (an AKS-74U), the AK-74's short carbine: the same
// 5.45x39 mm from a 30-round magazine, fully automatic at about 700 rounds
// a minute. It comes with its own arms (a Mixamo character's) and its own
// animations (src/viewmodel/ak74u.js), so its times are those clips' own
// lengths: a reload with rounds left (2.23 s) swaps the magazine; one from
// empty (3.47 s) drops the empty one, seats a fresh one and works the
// charging handle. Its inspect is its own clip (4.63 s). A short barrel and
// a small muzzle booster in place of the AK-74M's brake: it kicks and
// climbs more, and strays more aimed.
export const AK74U = {
  name: 'AK-74U',
  fireMode: 'auto',
  fireInterval: 60 / 700,
  magazine: 30,
  reserve: 120,
  reloadTime: 2.233,
  emptyReloadTime: 3.467,
  // When things happen, as fractions of the reload: the clips' own times
  // (src/viewmodel/ak74u.js) over their lengths. With rounds left the
  // magazine catch is pressed and the old magazine taken out and swapped
  // (nothing catches it: magCaught is never reached); from empty the
  // fresh magazine is in the hand first, the empty one is knocked out and
  // dropped, and the charging handle is pulled and let go.
  reloadSteps: {
    empty: { magGrab: 0.038, magOut: 0.195, magIn: 0.365, slidePull: 0.637, slideRelease: 0.71, handOn: 0.834 },
    catching: { magOut: 0.19, magCaught: 2, magGrab: 0.42, magIn: 0.657, handOn: 0.858 },
  },
  range: 200,
  spread: { hip: 2.6, aim: 0.12, moving: 1.6 },
  recoil: 0.75,
  burstKick: { perRound: 0.07, most: 0.8 },
  inspectTime: 4.633,
  // Cut short, its inspect pose goes back to the hold this quickly: the
  // support hand is off the gun for part of it.
  inspectFade: 0.4,
  caseSize: { diameter: 0.01, length: 0.0396 },
};

// The twelfth: a Franchi SPAS-12, a 12-gauge combat shotgun, fired
// semi-automatically, with 8 shells in its tube magazine under the barrel
// and one more in the chamber. It comes with its own arms and its own
// animations (src/viewmodel/saps12.js; the download calls it "Saps-12").
// Each shot throws `pellets` pellets (00 buckshot: nine), each strayed by
// up to pelletSpread (degrees, half the cone) from where the shot goes.
// It's loaded a shell at a time (reload 'shells', see src/weapon.js): the
// gun is turned onto its side (shells.start), each shell is pushed into the
// tube (shells.each, counted at shells.shellIn), up to the tube's 8 (one
// more with a shell in the chamber); then it's turned back (shells.end)
// and, if it was empty, the fore-end is pumped to chamber a shell
// (shells.pump). A trigger pull while it's loading stops it after the
// shell in hand. The shot clip has the bolt home 0.24 s after the shot and
// the gun still well up in its recoil: about 200 rounds a minute.
export const SAPS12 = {
  name: 'Franchi SPAS-12',
  fireInterval: 0.3,
  magazine: 8,
  reserve: 32,
  reload: 'shells',
  // (Seconds: the clips' own lengths and times, src/viewmodel/saps12.js.)
  shells: { start: 1.0, each: 1.667, shellIn: 1.158, end: 0.917, pump: 1.25, pumpBack: 0.04, pumpForward: 0.5, chamber: 1 },
  // (For its stand-in, the PF-9's built-in model, if its own can't load;
  // its reload is the stand-in's.)
  reloadTime: 2.1,
  emptyReloadTime: 2.5,
  range: 60,
  pellets: 9,
  pelletSpread: 2.2,
  spread: { hip: 1.2, aim: 0.3, moving: 1 },
  recoil: 1.8,
  inspect: false,
  // Its spent hull: a fired 12-gauge shell's (metres).
  caseSize: { diameter: 0.0205, length: 0.065, color: 0xa3262a },
};

// The guns the player carries, in the order of their keys (1 to 9, then
// 0, - and =).
export const LOADOUT = ['pistol', 'pistol45', 'beretta', 'fn502', 'hipistol', 'x4', 'mp7', 'ar15', 'makarov', 'ak74m', 'ak74u', 'saps12'];
export const GUNS = {
  pistol: PISTOL, pistol45: PISTOL45, beretta: BERETTA, fn502: FN502, hipistol: HIPISTOL, x4: X4, mp7: MP7, ar15: AR15,
  makarov: MAKAROV, ak74m: AK74M, ak74u: AK74U, saps12: SAPS12,
};
