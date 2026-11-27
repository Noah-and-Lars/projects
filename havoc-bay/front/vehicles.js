/* Island Front: real-world vehicles, ammunition, armour, modules, crew and the damage model.
   Frames: hull x forward, y up from the ground, z to the right. The turret frame sits on the turret ring.
   Armour values are millimetres of rolled steel equivalent at a right angle, against kinetic (ke) and shaped-charge (ce) rounds. */
'use strict';

/* ---------------- ammunition ---------------- */
// pen: [at 0 m, at 2000 m] in mm. kind: ap (kinetic), heat, he, bullet. spall: fragments thrown inside after a penetration.
const AMMO = {
  m829a2: { name: 'M829A2', type: 'APFSDS', kind: 'ap', v: 1680, pen: [650, 610], main: 220, spall: [16, .32, 4.5, 45], rico: 78, look: 'dart', cal: 120 },
  m830a1: { name: 'M830A1', type: 'HEAT-MP', kind: 'heat', v: 1410, pen: [480, 480], main: 180, spall: [9, .18, 3, 38], rico: 84, splash: 5, splashDmg: 140, fragPen: 22, look: 'shell', cal: 120 },
  bm42: { name: '3BM42', type: 'APFSDS', kind: 'ap', v: 1700, pen: [540, 500], main: 220, spall: [15, .32, 4.5, 45], rico: 78, look: 'dart', cal: 125 },
  bk29: { name: '3BK29M', type: 'HEAT', kind: 'heat', v: 905, pen: [700, 700], tandem: true, main: 180, spall: [10, .18, 3, 40], rico: 84, splash: 5, splashDmg: 150, fragPen: 22, look: 'shell', cal: 125 },
  of26: { name: '3OF26', type: 'HE', kind: 'he', v: 850, pen: [42, 42], main: 0, op: 2.4, splash: 10, splashDmg: 300, fragPen: 32, look: 'shell', cal: 125 },
  m791: { name: 'M791', type: 'APDS', kind: 'ap', v: 1345, pen: [66, 30], main: 70, spall: [5, .25, 2, 26], rico: 72, rate: .3, look: 'tracer', cal: 25 },
  m792: { name: 'M792', type: 'HEI-T', kind: 'he', v: 1100, pen: [8, 8], main: 0, op: .6, splash: 3, splashDmg: 70, fragPen: 6, rate: .3, look: 'tracer', cal: 25 },
  ubr6: { name: '3UBR6', type: 'APBC', kind: 'ap', v: 970, pen: [58, 26], main: 70, spall: [5, .25, 2, 26], rico: 70, rate: .12, look: 'tracer', cal: 30 },
  uof8: { name: '3UOF8', type: 'HEI', kind: 'he', v: 960, pen: [7, 7], main: 0, op: .6, splash: 3, splashDmg: 70, fragPen: 6, rate: .12, look: 'tracer', cal: 30 },
  tow2a: { name: 'TOW-2A', type: 'ATGM', kind: 'heat', v: 280, pen: [900, 900], tandem: true, main: 220, spall: [14, .2, 3.5, 45], rico: 86, splash: 4, splashDmg: 160, fragPen: 15, guided: true, saclos: true, life: 14, look: 'missile', cal: 152 },
  konkurs: { name: '9M113M', type: 'ATGM', kind: 'heat', v: 208, pen: [750, 750], tandem: true, main: 220, spall: [13, .2, 3.5, 45], rico: 86, splash: 4, splashDmg: 160, fragPen: 15, guided: true, saclos: true, life: 14, look: 'missile', cal: 135 },
  cal50: { name: 'M2 .50 API', type: 'API', kind: 'bullet', v: 890, pen: [26, 12], main: 34, rico: 68, rate: .09, spread: .007, range: 1500 },
  kord: { name: 'Kord 12.7', type: 'API', kind: 'bullet', v: 860, pen: [25, 11], main: 34, rico: 68, rate: .09, spread: .008, range: 1500 },
  m240: { name: 'M240 7.62', type: 'Ball', kind: 'bullet', v: 850, pen: [11, 4], main: 20, rico: 65, rate: .075, spread: .006, range: 1000 },
  pkt: { name: 'PKT 7.62', type: 'Ball', kind: 'bullet', v: 830, pen: [11, 4], main: 20, rico: 65, rate: .075, spread: .007, range: 1000 },
  rifle: { name: '5.56 rifle', type: 'Ball', kind: 'bullet', v: 920, pen: [7, 2], main: 24, rico: 65, range: 650 },
  npcRifle: { name: '7.62 rifle', type: 'Ball', kind: 'bullet', v: 720, pen: [8, 2], main: 10, rico: 65, range: 400 },
  rpg7: { name: 'PG-7VL', type: 'HEAT', kind: 'heat', v: 170, g: 2, pen: [500, 500], main: 180, spall: [10, .22, 2.6, 40], rico: 84, splash: 3, splashDmg: 90, fragPen: 8, look: 'rocket', life: 4, cal: 93 },
  he155: { name: '155 mm HE', type: 'HE', kind: 'he', pen: [60, 60], main: 0, op: 4, splash: 22, splashDmg: 620, fragPen: 28, look: 'bigshell', life: 90, cal: 155 },
};
function penAt(A, dist) { return lerp(A.pen[0], A.pen[1], clamp(dist / 2000, 0, 1.4)); }

/* ---------------- vehicles ---------------- */
const VEH = {
  m1a2: {
    name: 'M1A2 Abrams', short: 'Abrams', cls: 'mbt', crew: ['driver', 'gunner', 'commander', 'loader'],
    mass: 62, kw: 1120, vmax: 18.6, vrev: 9, pivot: .55, turret: .7, elev: [-.16, .35], len: 7.9, wid: 3.66, hgt: 2.44, eye: 3.1, cam: 13,
    reload: 6.2, autoloader: false, ammo: ['m829a2', 'm830a1'], mg: 'm240', smoke: 2, ford: 1.2,
    load: { m829a2: 26, m830a1: 16 }, rack: 18, lrf: true, thermal: 2, // 42 rounds, 18 in the ready rack; laser rangefinder, second-generation thermal sight
    info: 'Thick turret front and hull lower plate. The ammo in the turret bustle has blow-out panels. Weak upper glacis bounces most darts.',
    armor: {
      hull: { x: [-3.85, 3.95], y: [.45, 1.62], z: 1.83, front: { ke: 50, ce: 60, slope: 82 }, frontLow: { ke: 560, ce: 850, slope: 30, y: 1.28 }, side: { ke: 70, ce: 220 }, rear: { ke: 35, ce: 35 }, top: { ke: 30, ce: 30 }, bottom: { ke: 25, ce: 25 } },
      ring: [-.2, 1.62], turret: { x: [-3.3, 2.2], y: [0, .95], z: 1.8, front: { ke: 820, ce: 1050, slope: 0 }, mantlet: { ke: 380, ce: 450, z: .55 }, side: { ke: 120, ce: 200 }, rear: { ke: 40, ce: 40 }, top: { ke: 40, ce: 40 } },
    },
    mods: [
      { id: 'driver', kind: 'crew', s: [2.55, 1.05, 0, .38] },
      { id: 'gunner', kind: 'crew', t: 1, s: [.55, .3, .65, .35] }, { id: 'commander', kind: 'crew', t: 1, s: [-.3, .55, .78, .35] }, { id: 'loader', kind: 'crew', t: 1, s: [-.2, .4, -.75, .35] },
      { id: 'breech', kind: 'breech', t: 1, b: [0, .2, -.35, 1.25, .7, .35], hp: 120 }, { id: 'drive', kind: 'drive', b: [-.9, 1.2, -.6, .5, 1.6, .6], hp: 90 },
      { id: 'engine', kind: 'engine', b: [-3.7, .55, -1.0, -2.0, 1.55, 1.0], hp: 140 }, { id: 'trans', kind: 'trans', b: [-3.85, .5, -1.0, -3.4, 1.2, 1.0], hp: 100 },
      { id: 'fuelL', kind: 'fuel', b: [1.4, .55, -1.2, 3.2, 1.5, -.6], hp: 90 }, { id: 'fuelR', kind: 'fuel', b: [1.4, .55, .6, 3.2, 1.5, 1.2], hp: 90 },
      { id: 'ammoHull', kind: 'ammo', b: [0, .55, -1.2, 1.0, 1.15, -.65], hp: 50 }, { id: 'ammoBustle', kind: 'ammo', blowout: true, t: 1, b: [-3.25, .1, -1.4, -2.0, .85, 1.4], hp: 60 },
      { id: 'optics', kind: 'optics', t: 1, b: [1.0, .8, .6, 1.45, 1.15, 1.0], hp: 40 },
    ],
  },
  t90a: {
    name: 'T-90A', short: 'T-90A', cls: 'mbt', crew: ['driver', 'gunner', 'commander'],
    mass: 46.5, kw: 735, vmax: 16.7, vrev: 1.4, pivot: .5, turret: .42, elev: [-.1, .24], len: 6.9, wid: 3.78, hgt: 2.23, eye: 2.9, cam: 12.5,
    reload: 7.1, autoloader: true, ammo: ['bm42', 'bk29', 'of26'], mg: 'pkt', smoke: 2, ford: 1.2,
    load: { bm42: 18, bk29: 12, of26: 13 }, rack: 22, lrf: true, thermal: 2, shtora: true, lws: true, ess: true, // 43 rounds, 22 in the autoloader carousel; Shtora-1 with laser warning; engine smoke
    info: 'Small and fast-loading, with Kontakt-5 reactive armour. Its ammo carousel sits under the turret: a hit there usually blows the turret off. Very slow in reverse.',
    armor: {
      hull: { x: [-3.45, 3.43], y: [.42, 1.5], z: 1.75, front: { ke: 230, ce: 330, slope: 68 }, frontLow: { ke: 100, ce: 110, slope: 55, y: 1.0 }, side: { ke: 80, ce: 220 }, rear: { ke: 40, ce: 40 }, top: { ke: 30, ce: 30 }, bottom: { ke: 20, ce: 20 } },
      ring: [.1, 1.5], turret: { x: [-1.95, 1.75], y: [0, .9], z: 1.6, front: { ke: 680, ce: 1100, slope: 25 }, mantlet: { ke: 300, ce: 380, z: .45 }, side: { ke: 140, ce: 200 }, rear: { ke: 70, ce: 70 }, top: { ke: 40, ce: 60 } },
    },
    mods: [
      { id: 'driver', kind: 'crew', s: [2.4, .95, 0, .36] },
      { id: 'gunner', kind: 'crew', t: 1, s: [.35, .25, -.62, .35] }, { id: 'commander', kind: 'crew', t: 1, s: [.25, .3, .65, .35] },
      { id: 'carousel', kind: 'ammo', toss: true, b: [-1.1, .45, -1.1, 1.1, .78, 1.1], hp: 50 }, { id: 'ammoFront', kind: 'ammo', b: [1.5, .5, .5, 2.6, 1.3, 1.1], hp: 50 },
      { id: 'breech', kind: 'breech', t: 1, b: [-.8, .15, -.3, .7, .6, .3], hp: 120 }, { id: 'drive', kind: 'drive', b: [-.6, 1.1, -.6, .6, 1.5, .6], hp: 90 },
      { id: 'engine', kind: 'engine', b: [-3.3, .5, -1.0, -1.7, 1.45, 1.0], hp: 130 }, { id: 'trans', kind: 'trans', b: [-3.45, .45, -1.0, -3.05, 1.1, 1.0], hp: 100 },
      { id: 'fuel', kind: 'fuel', b: [1.5, .5, -1.1, 2.8, 1.4, -.4], hp: 90 }, { id: 'optics', kind: 'optics', t: 1, b: [1.0, .65, -.9, 1.35, .95, -.5], hp: 40 },
    ],
  },
  m2a2: {
    name: 'M2A2 Bradley', short: 'Bradley', cls: 'ifv', crew: ['driver', 'gunner', 'commander'],
    mass: 30, kw: 450, vmax: 18.3, vrev: 6, pivot: .7, turret: .9, elev: [-.17, 1.03], len: 6.55, wid: 3.6, hgt: 2.98, eye: 3.4, cam: 12,
    reload: 0, ammo: ['m791', 'm792'], mg: 'm240', atgm: 'tow2a', atgmN: 2, atgmReload: 14, smoke: 2, ford: 1.0,
    load: { m791: 225, m792: 675 }, atgmLoad: 7, lrf: true, thermal: 1,
    info: '25 mm Bushmaster and a twin TOW launcher. Its armour stops heavy machine guns, not tank shells.',
    armor: {
      hull: { x: [-3.25, 3.3], y: [.45, 2.05], z: 1.65, front: { ke: 45, ce: 60, slope: 60 }, frontLow: { ke: 35, ce: 40, slope: 50, y: 1.2 }, side: { ke: 30, ce: 45 }, rear: { ke: 25, ce: 25 }, top: { ke: 20, ce: 20 }, bottom: { ke: 15, ce: 15 } },
      ring: [.2, 2.05], turret: { x: [-1.3, 1.25], y: [0, .8], z: 1.15, front: { ke: 40, ce: 55, slope: 30 }, mantlet: { ke: 25, ce: 25, z: .3 }, side: { ke: 30, ce: 30 }, rear: { ke: 20, ce: 20 }, top: { ke: 15, ce: 15 } },
    },
    mods: [
      { id: 'driver', kind: 'crew', s: [2.3, 1.4, -.8, .35] },
      { id: 'gunner', kind: 'crew', t: 1, s: [.15, .35, -.42, .35] }, { id: 'commander', kind: 'crew', t: 1, s: [.05, .4, .5, .35] },
      { id: 'engine', kind: 'engine', b: [1.3, .55, -.1, 3.1, 1.6, 1.4], hp: 110 }, { id: 'trans', kind: 'trans', b: [2.6, .5, -1.3, 3.2, 1.2, -.1], hp: 90 },
      { id: 'fuel', kind: 'fuel', b: [-2.7, .5, -1.4, -1.6, 1.3, -.8], hp: 80 }, { id: 'ammo', kind: 'ammo', det: .35, t: 1, b: [-.95, -.2, -.9, .2, .45, .9], hp: 50 },
      { id: 'tow', kind: 'ammo', det: .6, t: 1, b: [-.6, .3, -1.6, 1.0, .85, -1.15], hp: 40 },
      { id: 'breech', kind: 'breech', t: 1, b: [.3, .1, -.2, 1.15, .5, .2], hp: 80 }, { id: 'drive', kind: 'drive', b: [-.5, 1.7, -.5, .9, 2.05, .9], hp: 70 },
      { id: 'optics', kind: 'optics', t: 1, b: [.6, .6, .6, 1.0, .95, 1.0], hp: 35 },
    ],
  },
  bmp2: {
    name: 'BMP-2', short: 'BMP-2', cls: 'ifv', crew: ['driver', 'gunner', 'commander'],
    mass: 14.3, kw: 220, vmax: 18, vrev: 4, pivot: .8, turret: 1.0, elev: [-.09, 1.3], len: 6.72, wid: 3.15, hgt: 2.45, eye: 2.9, cam: 11,
    reload: 0, ammo: ['ubr6', 'uof8'], mg: 'pkt', atgm: 'konkurs', atgmN: 1, atgmReload: 18, smoke: 1, ford: 1.6,
    load: { ubr6: 160, uof8: 340 }, atgmLoad: 4, ess: true,
    info: 'Light and fast with a quick-firing 30 mm and a Konkurs missile. Thin armour: heavy machine guns go through the sides, and the fuel tanks are in the rear doors.',
    armor: {
      hull: { x: [-3.35, 3.37], y: [.4, 1.7], z: 1.55, front: { ke: 7, ce: 7, slope: 80 }, frontLow: { ke: 19, ce: 19, slope: 57, y: .9 }, side: { ke: 16, ce: 16 }, rear: { ke: 16, ce: 16 }, top: { ke: 6, ce: 6 }, bottom: { ke: 6, ce: 6 } },
      ring: [.15, 1.55], turret: { x: [-1.0, 1.0], y: [0, .65], z: 1.0, front: { ke: 23, ce: 23, slope: 35 }, mantlet: { ke: 15, ce: 15, z: .25 }, side: { ke: 16, ce: 16 }, rear: { ke: 10, ce: 10 }, top: { ke: 6, ce: 6 } },
    },
    mods: [
      { id: 'driver', kind: 'crew', s: [2.3, 1.0, -.7, .33] },
      { id: 'gunner', kind: 'crew', t: 1, s: [0, .2, -.45, .33] }, { id: 'commander', kind: 'crew', t: 1, s: [0, .25, .45, .33] },
      { id: 'engine', kind: 'engine', b: [1.5, .5, 0, 3.0, 1.3, 1.4], hp: 90 }, { id: 'trans', kind: 'trans', b: [2.8, .45, -1.2, 3.3, 1.0, 0], hp: 80 },
      { id: 'fuel', kind: 'fuel', b: [-3.35, .5, -1.25, -2.85, 1.6, 1.25], hp: 70 }, { id: 'ammo', kind: 'ammo', det: .35, t: 1, b: [-.6, -.35, -.9, .6, .15, .9], hp: 45 },
      { id: 'atgm', kind: 'ammo', det: .6, t: 1, b: [-.3, .65, -.18, .95, .88, .18], hp: 30 },
      { id: 'breech', kind: 'breech', t: 1, b: [.1, .05, -.15, .8, .4, .15], hp: 70 }, { id: 'drive', kind: 'drive', b: [-.6, 1.3, -.6, .6, 1.55, .6], hp: 60 },
      { id: 'optics', kind: 'optics', t: 1, b: [.45, .45, -.6, .75, .7, -.35], hp: 30 },
    ],
  },
  humvee: {
    name: 'M1114 Humvee', short: 'Humvee', cls: 'jeep', crew: ['driver', 'gunner', 'commander'], wheeled: true,
    mass: 5.5, kw: 140, vmax: 30, vrev: 8, pivot: 0, steer: .55, turret: 2.2, elev: [-.2, .9], len: 4.93, wid: 2.3, hgt: 2.6, eye: 2.8, cam: 9,
    reload: 0, ammo: ['cal50'], smoke: 1, ford: .76,
    info: 'Fast up-armoured truck with a roof .50 cal. Stops rifle bullets, nothing heavier.',
    armor: {
      hull: { x: [-2.45, 2.45], y: [.55, 1.9], z: 1.15, front: { ke: 9, ce: 9, slope: 20 }, frontLow: { ke: 9, ce: 9, slope: 0, y: .9 }, side: { ke: 9, ce: 9 }, rear: { ke: 9, ce: 9 }, top: { ke: 6, ce: 6 }, bottom: { ke: 6, ce: 6 } },
      ring: [-.35, 1.9], turret: { x: [-.45, .45], y: [0, .7], z: .55, front: { ke: 12, ce: 12, slope: 0 }, mantlet: { ke: 12, ce: 12, z: .1 }, side: { ke: 8, ce: 8 }, rear: { ke: 2, ce: 2 }, top: { ke: 0, ce: 0 } },
    },
    mods: [
      { id: 'driver', kind: 'crew', s: [.45, 1.25, -.5, .4] }, { id: 'commander', kind: 'crew', s: [.45, 1.25, .5, .4] },
      { id: 'gunner', kind: 'crew', t: 1, s: [-.15, .2, 0, .38] },
      { id: 'engine', kind: 'engine', b: [1.2, .6, -.7, 2.4, 1.3, .7], hp: 70 }, { id: 'fuel', kind: 'fuel', b: [-2.3, .55, -.6, -1.6, .95, .6], hp: 50 },
      { id: 'breech', kind: 'breech', t: 1, b: [.1, .15, -.1, .7, .35, .1], hp: 50 },
    ],
  },
  tigr: {
    name: 'GAZ Tigr', short: 'Tigr', cls: 'jeep', crew: ['driver', 'gunner', 'commander'], wheeled: true,
    mass: 7.2, kw: 158, vmax: 33, vrev: 8, pivot: 0, steer: .52, turret: 2.2, elev: [-.2, .9], len: 5.7, wid: 2.4, hgt: 2.7, eye: 2.9, cam: 9.5,
    reload: 0, ammo: ['kord'], smoke: 1, ford: 1.0,
    info: 'Fast armoured car with a 12.7 mm Kord on the roof.',
    armor: {
      hull: { x: [-2.8, 2.85], y: [.6, 2.1], z: 1.2, front: { ke: 8, ce: 8, slope: 25 }, frontLow: { ke: 8, ce: 8, slope: 0, y: 1.0 }, side: { ke: 8, ce: 8 }, rear: { ke: 8, ce: 8 }, top: { ke: 5, ce: 5 }, bottom: { ke: 5, ce: 5 } },
      ring: [-.5, 2.1], turret: { x: [-.45, .45], y: [0, .6], z: .5, front: { ke: 10, ce: 10, slope: 0 }, mantlet: { ke: 10, ce: 10, z: .1 }, side: { ke: 6, ce: 6 }, rear: { ke: 2, ce: 2 }, top: { ke: 0, ce: 0 } },
    },
    mods: [
      { id: 'driver', kind: 'crew', s: [.6, 1.35, -.52, .4] }, { id: 'commander', kind: 'crew', s: [.6, 1.35, .52, .4] },
      { id: 'gunner', kind: 'crew', t: 1, s: [-.15, .15, 0, .38] },
      { id: 'engine', kind: 'engine', b: [1.5, .65, -.75, 2.7, 1.45, .75], hp: 75 }, { id: 'fuel', kind: 'fuel', b: [-2.6, .6, -.6, -1.9, 1.0, .6], hp: 50 },
      { id: 'breech', kind: 'breech', t: 1, b: [.1, .15, -.1, .7, .35, .1], hp: 50 },
    ],
  },
};
const TEAM_VEH = [{ mbt: 'm1a2', ifv: 'm2a2', jeep: 'humvee' }, { mbt: 't90a', ifv: 'bmp2', jeep: 'tigr' }];
const MOD_NAME = { hdrive: 'Turret traverse', vdrive: 'Gun elevation', radiator: 'Radiator', autoloader: 'Autoloader', fcs: 'Fire control', driver: 'Driver', gunner: 'Gunner', commander: 'Commander', loader: 'Loader', engine: 'Engine', trans: 'Transmission', fuel: 'Fuel tank', ammo: 'Ammo rack', breech: 'Breech', drive: 'Turret drive', optics: 'Gun sight', barrel: 'Barrel', track: 'Track' };

/* ---------------- materials: one camo shader per team ---------------- */
const CAMO = [
  { c: [0xb9a27a, 0xa88f66, 0x8f7a58], cut: [.62, .86], dirt: 0x6e5c45 }, // US desert tan, faint mottling
  { c: [0x4a5332, 0x6e6748, 0x2e3125], cut: [.5, .72], dirt: 0x5a4a38 },  // Russian three-tone, faded
];
const GLSL_NOISE = `
float h3(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z); }`;
const VEH_MATS = [0, 1].map(t => { // painted steel: camouflage, dust on top faces, rain streaks and grime on the sides, mud low down
  const P = CAMO[t], m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .06, envMapIntensity: .7 });
  const col = h => new THREE.Color(h).convertSRGBToLinear();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uC0: { value: col(P.c[0]) }, uC1: { value: col(P.c[1]) }, uC2: { value: col(P.c[2]) }, uCut: { value: new THREE.Vector2(...P.cut) }, uDirt: { value: col(P.dirt) }, uDust: { value: col(t ? 0x8e8166 : 0xb3a17e) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCamo; varying float vCamo; varying vec3 vMP; varying vec3 vMN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamo = aCamo; vMP = position; vMN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uC0, uC1, uC2, uDirt, uDust; uniform vec2 uCut; varying float vCamo; varying vec3 vMP; varying vec3 vMN;' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wear = vn3(vMP * 6.0) * .5 + vn3(vMP * 23.0) * .5;
        vec3 mn = normalize(vMN);
        if (vCamo > .5) {
          float n = vn3(vMP * .55 + 3.1) * .62 + vn3(vMP * 1.5) * .38;
          vec3 c = n > uCut.y ? uC2 : n > uCut.x ? uC1 : uC0;
          diffuseColor.rgb = c * (.88 + wear * .2);
        }
        float side = 1.0 - abs(mn.y);
        float streak = smoothstep(.55, .9, vn3(vec3(vMP.x * 9.0, vMP.y * .7, vMP.z * 9.0))) * side;          // rain streaks run down the sides
        diffuseColor.rgb *= 1.0 - streak * .22;
        float dust = smoothstep(.55, .95, mn.y) * (.35 + .4 * vn3(vMP * 2.3));                              // dust settles on the flat tops
        diffuseColor.rgb = mix(diffuseColor.rgb, uDust * (.85 + wear * .3), dust * .45);
        float low = smoothstep(1.35, .35, vMP.y + (wear - .5) * .55);                                       // mud thrown up by the tracks
        diffuseColor.rgb = mix(diffuseColor.rgb, uDirt * (.8 + wear * .4), low * .62);
        diffuseColor.rgb *= .82 + .18 * smoothstep(-.6, .6, mn.y);                                          // faces turned down sit in shadow
        `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (wear - .5) * .22 + low * .15, .35, 1.0);');
  };
  return m;
});
const CAMO_MARK = new THREE.MeshLambertMaterial({ color: 0xffffff }); CAMO_MARK.userData.camo = true;
function mergeVehicleGroup(node, material) { // like mergeModel, but writes a camo flag per vertex
  for (const ch of node.children.slice()) if (!ch.isMesh && !ch.userData.keep) mergeVehicleGroup(ch, material);
  const parts = node.children.filter(ch => ch.isMesh && !ch.userData.keep && ch.material.isMeshLambertMaterial && !ch.material.transparent);
  if (!parts.length) return;
  const Pp = [], N = [], C = [], K = [], v = new V3(), nm = new THREE.Matrix3();
  for (const m of parts) {
    m.updateMatrix(); nm.getNormalMatrix(m.matrix);
    const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, ix = g.index, cnt = ix ? ix.count : p.count, camo = m.material.userData.camo ? 1 : 0, col = m.material.color;
    for (let k = 0; k < cnt; k++) { const i = ix ? ix.getX(k) : k; v.fromBufferAttribute(p, i).applyMatrix4(m.matrix); Pp.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z); C.push(col.r, col.g, col.b); K.push(camo); }
    node.remove(m);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aCamo', new THREE.Float32BufferAttribute(K, 1));
  const mesh = new THREE.Mesh(g, material); mesh.castShadow = mesh.receiveShadow = true; node.add(mesh);
}

/* ---------------- model helpers ---------------- */
const K_STEEL = 0x34342f, K_RUBBER = 0x1b1b19, K_GLASS = 0x22323a, K_BLACK = 0x161614, K_METAL = 0x5a5a52;
function bx(parent, x0, y0, z0, x1, y1, z1, color, o = {}) { // a box from corner to corner
  const m = new THREE.Mesh(BOX, color === 'C' ? CAMO_MARK : mat(color)); m.scale.set(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (o.r) m.rotation.set(o.r[0] || 0, o.r[1] || 0, o.r[2] || 0); parent.add(m); return m;
}
function prof(parent, pts, z0, z1, color, bevel = 0) { // side outline (x,y) extruded from z0 to z1
  const g = sideProfile(pts, Math.abs(z1 - z0), bevel), m = new THREE.Mesh(g, color === 'C' ? CAMO_MARK : mat(color)); m.position.z = (z0 + z1) / 2; parent.add(m); return m;
}
function topProf(parent, pts, y0, h, color, bevel = 0) { const m = new THREE.Mesh(topProfile(pts, h, bevel), color === 'C' ? CAMO_MARK : mat(color)); m.position.y = y0; parent.add(m); return m; }
function cylX(parent, x0, x1, r0, r1, y, z, color, seg = 12) { const m = new THREE.Mesh(gCyl(r1, r0, seg), color === 'C' ? CAMO_MARK : mat(color)); m.rotation.z = -Math.PI / 2; m.scale.set(1, x1 - x0, 1); m.position.set((x0 + x1) / 2, y, z); parent.add(m); return m; }
function cylY(parent, x, y0, y1, z, r, color, seg = 12) { const m = new THREE.Mesh(gCyl(r, r, seg), color === 'C' ? CAMO_MARK : mat(color)); m.scale.set(1, y1 - y0, 1); m.position.set(x, (y0 + y1) / 2, z); parent.add(m); return m; }
function cylZ(parent, x, y, z0, z1, r, color, seg = 12) { const m = new THREE.Mesh(gCyl(r, r, seg), color === 'C' ? CAMO_MARK : mat(color)); m.rotation.x = Math.PI / 2; m.scale.set(1, z1 - z0, 1); m.position.set(x, y, (z0 + z1) / 2); parent.add(m); return m; }
function smokeBank(parent, x, y, z, n, out) { for (let k = 0; k < n; k++) { const m = cylX(parent, 0, .32, .045, .045, 0, 0, K_STEEL, 6); m.position.set(x - k * .11, y + (k % 2) * .09, z); m.rotation.set(0, out * -.6, -.5); } }
// wheel geometry, axis along z, radius 1, width 1 (scaled per vehicle)
function latheZ(prof, seg = 24) { const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg); g.rotateX(Math.PI / 2); return g; }
const WHEEL_GEO = (() => {
  const t = new THREE.CylinderGeometry(1, 1, .9, 20); t.rotateX(Math.PI / 2);
  const r = new THREE.CylinderGeometry(.72, .72, 1.0, 16); r.rotateX(Math.PI / 2);
  const h = new THREE.CylinderGeometry(.25, .3, 1.15, 8); h.rotateX(Math.PI / 2);
  // a tracked vehicle's road wheel: two dished steel discs with rubber tyres and a gap between them for the guide horns
  const parts = [];
  for (const sd of [-1, 1]) {
    const z0 = sd * .1, z1 = sd * .5, P = (r, z) => [r, z]; // lathe (radius, along axis)
    const rv = l => sd > 0 ? l : l.reverse(); // mirrored profiles run the other way so faces stay outward
    const tyre = latheZ(rv([P(.8, z0), P(.97, z0), P(1, z0 + sd * .04), P(1, z1 - sd * .04), P(.97, z1), P(.8, z1)]));
    const dish = latheZ(rv([P(.8, z0 + sd * .02), P(.6, z0 + sd * .06), P(.36, z0 + sd * .02), P(.22, z0 + sd * .1), P(.22, z1 - sd * .02), P(.36, z1 - sd * .1), P(.62, z1 - sd * .03), P(.8, z1 - sd * .01)]));
    const hub = new THREE.CylinderGeometry(.2, .2, .44, 12); hub.rotateX(Math.PI / 2); hub.translate(0, 0, sd * .3);
    parts.push([tyre, 0x1d1d1b], [dish, 0x4a4b40], [hub, 0x34342f]);
    for (let k = 0; k < 8; k++) { const b2 = new THREE.CylinderGeometry(.035, .035, .06, 6); b2.rotateX(Math.PI / 2); const a = k / 8 * TAU; b2.translate(Math.cos(a) * .15, Math.sin(a) * .15, sd * .52); parts.push([b2, 0x2a2a26]); }
  }
  const idler = parts.map(([g, c]) => [g, c === 0x1d1d1b ? 0x3a3a34 : c]);
  // drive sprocket: two toothed rings on a hub
  const gear = new THREE.Shape(), T = 11; for (let k = 0; k < T * 4; k++) { const a = k / (T * 4) * TAU, rr = (k % 4 === 1 || k % 4 === 2) ? 1.0 : .82; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; k ? gear.lineTo(x, y) : gear.moveTo(x, y); }
  const hole = new THREE.Path(); hole.absarc(0, 0, .5, 0, TAU, true); gear.holes.push(hole);
  const spr = [];
  for (const sd of [-1, 1]) { const g = new THREE.ExtrudeGeometry(gear, { depth: .14, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, sd > 0 ? .28 : -.42); spr.push([g, 0x35352f]); }
  const sh = new THREE.CylinderGeometry(.55, .6, 1.0, 16); sh.rotateX(Math.PI / 2); spr.push([sh, 0x2c2c28]);
  for (let k = 0; k < 10; k++) { const b2 = new THREE.CylinderGeometry(.05, .05, 1.08, 6); b2.rotateX(Math.PI / 2); const a = k / 10 * TAU; b2.translate(Math.cos(a) * .38, Math.sin(a) * .38, 0); spr.push([b2, 0x45453d]); }
  return { road: coloredGeo(parts), idler: coloredGeo(idler), tyre: coloredGeo([[t, 0x1c1c1a], [r, 0x4a4a40], [h, 0x2e2e2a]]), sprocket: coloredGeo(spr) };
})();
// a single track link, x along the track (one pitch long), +y on the outside (ground side), z across (unit width)
function trackLinkGeo(pitch, rubber) {
  const B = (sx, sy, sz, x, y, z, c) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return [g, c]; };
  const parts = [B(pitch * .9, .045, 1, 0, 0, 0, 0x34342e)];
  if (rubber) for (const z of [-.27, .27]) parts.push(B(pitch * .72, .03, .4, 0, .035, z, 0x1a1a18));
  else parts.push(B(.035, .028, .92, -pitch * .2, .034, 0, 0x403f38), B(.035, .028, .92, pitch * .2, .034, 0, 0x403f38));
  for (const z of [-.47, .47]) { const c = new THREE.CylinderGeometry(.028, .028, .07, 8); c.rotateX(Math.PI / 2); c.translate(pitch * .45, 0, z); parts.push([c, 0x2a2a26]); }
  parts.push(B(.06, .1, .035, 0, -.07, -.05, 0x2e2e2a), B(.06, .1, .035, 0, -.07, .05, 0x2e2e2a)); // guide horns, on the inside running between the twin wheels
  return coloredGeo(parts);
}
const LINK_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .45 });

/* Each model returns { root, hull, turret, gun, muzzle, wheels: [{x,y,r,z,kind}], tracks: {y top, z, w, sprocket, idler} }.
   The M1A2 and T-90A are in tank-models.js. */
function modelM2A2() {
  const root = new THREE.Group(), hull = new THREE.Group(); root.add(hull);
  prof(hull, [[-3.25, .5], [2.9, .5], [3.3, 1.2], [2.1, 2.05], [-3.25, 2.05]], -1.65, 1.65, 'C', .03);
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 5; k++) bx(hull, -3.0 + k * 1.15, 1.15, sd * 1.65, -1.95 + k * 1.15, 1.95, sd * 1.73, 'C'); // bolted appliqué plates
    for (let k = 0; k < 5; k++) for (let j = 0; j < 2; j++) cylZ(hull, -2.85 + k * 1.15, 1.3 + j * .5, sd * 1.73, sd * 1.76, .03, K_STEEL, 6);
    bx(hull, -3.0, .72, sd * 1.65, 2.9, 1.15, sd * 1.7, 'C'); // skirt
    for (let k = 0; k < 4; k++) bx(hull, -2.6 + k * 1.3, 1.82, sd * 1.66, -2.35 + k * 1.3, 1.95, sd * 1.7, K_GLASS); // firing-port vision blocks
  }
  bx(hull, -3.32, .7, -1.2, -3.25, 1.95, 1.2, 'C'); bx(hull, -3.35, 1.2, -.4, -3.3, 1.8, .4, K_STEEL); // rear ramp and door
  cylY(hull, 2.1, 2.05, 2.15, -.85, .3, K_STEEL); bx(hull, 2.3, 2.05, -1.1, 2.5, 2.2, -.6, K_GLASS); // driver's hatch
  bx(hull, 1.5, 2.05, .2, 2.4, 2.12, 1.4, K_STEEL); for (let k = 0; k < 5; k++) bx(hull, 1.6 + k * .16, 2.12, .3, 1.7 + k * .16, 2.14, 1.3, K_BLACK); // engine grille, front right
  const turret = new THREE.Group(); turret.position.set(.2, 2.05, .25); hull.add(turret);
  topProf(turret, [[1.25, -.55], [1.25, .55], [.75, 1.1], [-1.2, 1.15], [-1.3, .8], [-1.3, -.8], [-1.2, -1.15], [.75, -1.1]], 0, .78, 'C', .05);
  bx(turret, -1.65, .1, -1.0, -1.3, .6, 1.0, K_STEEL); // rear stowage rack
  const tow = new THREE.Group(); tow.position.set(-.2, .45, -1.38); turret.add(tow); bx(tow, -.7, -.2, -.22, 1.2, .3, .22, 'C'); bx(tow, 1.18, -.18, -.2, 1.22, .28, .2, K_STEEL); // TOW box
  bx(turret, .55, .78, .55, 1.05, 1.08, 1.0, 'C'); bx(turret, 1.04, .82, .6, 1.07, 1.02, .95, K_GLASS); // ISU
  cylY(turret, -.2, .78, .95, .55, .35, 'C', 12); cylY(turret, -.8, .78, 2.6, -.6, .015, K_BLACK, 4);
  for (const sd of [-1, 1]) smokeBank(turret, 1.0, .5, sd * 1.12, 4, sd);
  const gun = new THREE.Group(); gun.position.set(1.15, .38, -.05); turret.add(gun);
  bx(gun, -.15, -.18, -.25, .3, .18, .25, 'C'); cylX(gun, .3, 1.0, .07, .06, 0, 0, K_STEEL, 10); cylX(gun, 1.0, 2.75, .042, .04, 0, 0, K_BLACK, 10); cylX(gun, 2.6, 2.8, .055, .055, 0, 0, K_BLACK, 8);
  const wheels = [], X = [-2.45, -1.5, -.55, .4, 1.35, 2.3];
  for (const x of X) wheels.push({ x, y: .34, r: .3, kind: 'road' });
  wheels.push({ x: 3.0, y: .78, r: .3, kind: 'sprocket' }, { x: -3.0, y: .65, r: .3, kind: 'road' });
  return { root, hull, turret, gun, muzzle: 2.8, tow, wheels, wz: 1.36, ww: .55, track: { top: 1.0, sag: .05, rollers: [-1.5, .5, 2.0] } };
}
function modelBMP2() {
  const root = new THREE.Group(), hull = new THREE.Group(); root.add(hull);
  prof(hull, [[-3.35, .45], [3.1, .45], [3.37, .9], [1.9, 1.35], [.9, 1.45], [-3.35, 1.7]], -1.25, 1.25, 'C', .03); // pointed nose, rising roof
  for (let k = 0; k < 6; k++) { const m = bx(hull, 0, 0, 0, .06, .05, 2.4, 'C'); m.position.set(3.2 - k * .25, .98 + k * .075, 0); } // ribbed glacis
  for (const sd of [-1, 1]) {
    bx(hull, -3.35, 1.1, sd * 1.25, 3.0, 1.35, sd * 1.55, 'C');
    bx(hull, -3.1, .75, sd * 1.55, 2.9, 1.1, sd * 1.58, 'C');
    for (let k = 0; k < 3; k++) cylZ(hull, -2.6 + k * .9, 1.42, sd * 1.24, sd * 1.3, .07, K_STEEL, 8); // firing ports
  }
  for (const sd of [-1, 1]) { bx(hull, -3.4, .55, sd * .1, -3.35, 1.65, sd * 1.0, 'C'); cylZ(hull, -3.42, 1.25, sd * .4, sd * .48, .08, K_GLASS, 8); } // rear doors (fuel inside)
  bx(hull, 1.0, 1.42, -1.2, 2.2, 1.5, -.3, K_STEEL); cylY(hull, 2.2, 1.32, 1.42, -.7, .25, K_STEEL); // driver's hatch
  for (let k = 0; k < 4; k++) cylY(hull, -2.6 + k * .7, 1.68, 1.76, .55, .28, 'C', 10); // troop hatches
  const turret = new THREE.Group(); turret.position.set(.15, 1.5, 0); hull.add(turret);
  const ring = []; for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; ring.push([Math.cos(a) * 1.0, Math.sin(a) * .98]); }
  topProf(turret, ring, 0, .55, 'C', .1);
  cylY(turret, -.1, .55, .7, .45, .32, 'C', 12); cylY(turret, -.1, .55, .66, -.45, .3, 'C', 12); // hatches
  bx(turret, .45, .5, -.65, .78, .72, -.35, 'C'); bx(turret, .77, .54, -.6, .8, .68, -.4, K_GLASS); // sight
  const atgm = new THREE.Group(); atgm.position.set(.2, .78, 0); turret.add(atgm); bx(atgm, -.15, -.12, -.12, .1, .02, .12, K_STEEL); cylX(atgm, -.45, .95, .075, .075, .08, 0, 0x4a5a3a, 10); // Konkurs tube
  for (const sd of [-1, 1]) smokeBank(turret, -.2, .35, sd * .97, 3, sd);
  const gun = new THREE.Group(); gun.position.set(.75, .3, 0); turret.add(gun);
  bx(gun, -.15, -.15, -.2, .2, .15, .2, 'C'); cylX(gun, .2, .8, .06, .055, 0, 0, K_STEEL, 10); cylX(gun, .8, 2.9, .036, .034, 0, 0, K_BLACK, 10); cylX(gun, 2.75, 2.95, .05, .05, 0, 0, K_BLACK, 8);
  const wheels = [], X = [-2.4, -1.45, -.5, .45, 1.4, 2.35];
  for (const x of X) wheels.push({ x, y: .38, r: .34, kind: 'road' });
  wheels.push({ x: 3.0, y: .7, r: .28, kind: 'sprocket' }, { x: -3.05, y: .62, r: .28, kind: 'road' });
  return { root, hull, turret, gun, muzzle: 2.95, atgm, wheels, wz: 1.33, ww: .44, track: { top: .9, sag: .06, rollers: [-1.0, .9] } };
}
function modelTruck(kind) { // Humvee or Tigr
  const H = kind === 'humvee', root = new THREE.Group(), hull = new THREE.Group(); root.add(hull);
  const L = H ? 2.45 : 2.85, Wd = H ? 1.15 : 1.2;
  if (H) {
    prof(hull, [[-2.45, .6], [2.45, .6], [2.5, 1.0], [2.35, 1.25], [.9, 1.3], [.75, 1.92], [-1.05, 1.92], [-1.1, 1.35], [-2.45, 1.35]], -Wd, Wd, 'C', .04);
    bx(hull, .8, 1.35, -1.12, .9, 1.85, 1.12, K_GLASS, { r: [0, 0, -.22] }); for (const sd of [-1, 1]) bx(hull, -.95, 1.38, sd * 1.15, .7, 1.82, sd * 1.17, K_GLASS); // armoured glass
    bx(hull, 2.45, .7, -.9, 2.55, 1.1, .9, K_STEEL); for (let k = 0; k < 6; k++) bx(hull, 2.5, .72, -.75 + k * .3, 2.56, 1.08, -.65 + k * .3, K_BLACK); // grille
  } else {
    prof(hull, [[-2.85, .65], [2.8, .65], [2.88, 1.15], [2.6, 1.5], [1.2, 1.55], [.9, 2.1], [-2.85, 2.1]], -Wd, Wd, 'C', .04);
    bx(hull, .95, 1.6, -1.15, 1.05, 2.05, 1.15, K_GLASS, { r: [0, 0, -.5] }); for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) bx(hull, -1.7 + k * 1.3, 1.6, sd * 1.2, -.7 + k * 1.3, 1.95, sd * 1.22, K_GLASS);
    bx(hull, 2.85, .75, -1.0, 2.95, 1.2, 1.0, K_STEEL);
  }
  for (const sd of [-1, 1]) { bx(hull, -L + .2, .55, sd * (Wd + .02), L - .2, .75, sd * (Wd + .1), K_STEEL); bx(hull, L - .02, 1.05, sd * .7, L + .03, 1.15, sd * .95, 0xd8d0b0); } // running boards, lights
  const turret = new THREE.Group(); turret.position.set(H ? -.35 : -.5, H ? 1.92 : 2.1, 0); hull.add(turret);
  cylY(turret, 0, 0, .12, 0, .55, K_STEEL, 16);
  for (let k = -2; k <= 2; k++) { const m = bx(turret, 0, 0, 0, .06, .6, .3, 'C'); m.position.set(Math.cos(k * .35) * .55, .45, Math.sin(k * .35) * .55); m.rotation.y = -k * .35; } // gun shield
  const gun = new THREE.Group(); gun.position.set(.2, .55, 0); turret.add(gun);
  bx(gun, -.4, -.08, -.09, .35, .1, .09, K_BLACK); cylX(gun, .35, 1.45, .03, .028, 0, 0, K_BLACK, 8); bx(gun, -.1, -.22, .08, .15, -.05, .2, 0x3e3a28); // HMG + ammo can
  const wheels = [{ x: L - .8, y: .48, r: .48, kind: 'tyre', steer: 1 }, { x: -L + .85, y: .48, r: .48, kind: 'tyre' }];
  return { root, hull, turret, gun, muzzle: 1.45, wheels, wz: Wd - .05, ww: .4 };
}
const VMODEL = { m1a2: modelM1A2, t90a: modelT90A, m2a2: modelM2A2, bmp2: modelBMP2, humvee: () => modelTruck('humvee'), tigr: () => modelTruck('tigr') };

/* running gear: road wheels on springs (instanced) and track belts that follow them */
function buildRunningGear(v) {
  const M = v.model, n = M.wheels.length * 2, tracked = !v.def.wheeled;
  M.rollers = tracked ? (M.track.rollers || []).map(x => ({ x, y: M.track.top - .13, r: .12, kind: 'roller' })) : [];
  const mk = (geo, cnt) => { const im = new THREE.InstancedMesh(geo, TREE_MAT, cnt); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.userData.keep = true; M.hull.add(im); return im; };
  M.wheelMesh = mk(tracked ? WHEEL_GEO.road : WHEEL_GEO.tyre, n + M.rollers.length * 2);
  if (tracked) { M.sprMesh = mk(WHEEL_GEO.sprocket, 2); M.idlerMesh = mk(WHEEL_GEO.idler, 2); }
  M.wheelOff = new Float32Array(n); M.wheelRot = 0;
  if (tracked) {
    const pitch = M.track.pitch || .16, geo = trackLinkGeo(pitch, !!M.track.rubber);
    M.belts = [-1, 1].map(sd => { const im = new THREE.InstancedMesh(geo, LINK_MAT, 140); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.userData.keep = true; M.hull.add(im); return { sd, im, off: 0, pitch }; });
  }
  updateRunningGear(v, 0, true);
}
const _wm = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _wv = new V3(), _ws = new V3(), _wz = new V3(0, 0, 1), _wp = new V3(), _wy = new V3(0, 1, 0), _wq2 = new THREE.Quaternion();
function updateRunningGear(v, dt, force) {
  const M = v.model, im = M.wheelMesh; if (!im) return;
  M.wheelRot += (v.speed || 0) * dt;
  // far away nobody sees the wheels turn: update a few times a second only
  if (!force && camera.position.distanceToSquared(v.pos) > 250 * 250) { M._skip = (M._skip || 0) + dt; if (M._skip < .25) return; dt = M._skip; }
  M._skip = 0;
  // suspension: how far the ground sits above or below where each wheel would rest
  if (force || dt > 0) {
    M.root.updateMatrixWorld(true);
    let k = 0;
    for (const sd of [-1, 1]) for (const w of M.wheels) {
      if (w.kind !== 'road') { M.wheelOff[k++] = 0; continue; }
      _wp.set(w.x, 0, sd * M.wz).applyMatrix4(M.root.matrixWorld);
      const g = groundY(_wp.x, _wp.z, v.pos.y + 1);
      const want = clamp(g - _wp.y, -.16, .2);
      M.wheelOff[k] += (want - M.wheelOff[k]) * clamp(dt * 18, 0, 1); k++;
    }
  }
  let k = 0, ks = 0, ki = 0, kr = M.wheels.length * 2;
  for (const sd of [-1, 1]) {
    for (const w of M.wheels) {
      const steer = w.steer && v.def.wheeled ? -(v.steerIn || 0) * .5 : 0;
      _wq.setFromAxisAngle(_wz, -(M.wheelRot + (v.def.wheeled ? 0 : sd * (v.turnRate || 0) * 1.5 * dt)) / w.r);
      if (steer) _wq.premultiply(_wq2.setFromAxisAngle(_wy, steer));
      const wide = w.kind === 'sprocket' ? M.ww * .8 : M.ww * (v.def.wheeled ? .75 : 1);
      _wm.compose(_wv.set(w.x, w.y + M.wheelOff[k], sd * M.wz), _wq, _ws.set(w.r, w.r, wide));
      if (w.kind === 'sprocket' && M.sprMesh) { M.sprMesh.setMatrixAt(ks++, _wm); _wm.makeScale(0, 0, 0); }
      else if (w.kind === 'idler' && M.idlerMesh) { M.idlerMesh.setMatrixAt(ki++, _wm); _wm.makeScale(0, 0, 0); }
      im.setMatrixAt(k++, _wm);
    }
    for (const w of M.rollers) { _wq.setFromAxisAngle(_wz, -M.wheelRot / w.r); _wm.compose(_wv.set(w.x, w.y, sd * M.wz), _wq, _ws.set(w.r, w.r, M.ww * .5)); im.setMatrixAt(kr++, _wm); }
  }
  im.instanceMatrix.needsUpdate = true; if (M.sprMesh) M.sprMesh.instanceMatrix.needsUpdate = true; if (M.idlerMesh) M.idlerMesh.instanceMatrix.needsUpdate = true;
  if (M.belts) for (const b of M.belts) buildBelt(v, b, dt);
}
const _lm = new THREE.Matrix4(), _lq = new THREE.Quaternion(), _lp = new V3(), _ls = new V3();
function buildBelt(v, b, dt) { // a closed loop of track links over the sprocket, return rollers, idler and road wheels
  const M = v.model, T = M.track, sd = b.sd, base = M.wheels.length * (sd < 0 ? 0 : 1), th = .06;
  const W = M.wheels.map((w, i) => ({ ...w, y: w.y + M.wheelOff[base + i] })).sort((a, c) => a.x - c.x);
  const rear = W[0], front = W[W.length - 1];
  const pts = [];
  const arc = (c, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([c.x + Math.cos(a) * (c.r + th / 2), c.y + Math.sin(a) * (c.r + th / 2)]); } };
  for (const w of W.slice(1, -1)) pts.push([w.x, w.y - w.r - th / 2]); // bottom run, under the road wheels
  arc(front, -Math.PI / 2, Math.PI / 2, 8); // round the idler
  const tx0 = front.x, tx1 = rear.x, ty = T.top + th / 2, rollers = (T.rollers || []).slice().sort((a, c) => c - a);
  if (rollers.length) for (const x of rollers) pts.push([x, ty]);
  else for (let i = 1; i < 8; i++) { const x = lerp(tx0, tx1, i / 8); pts.push([x, ty - Math.sin(i / 8 * Math.PI) * T.sag]); }
  arc(rear, Math.PI / 2, Math.PI * 1.5, 8); // round the sprocket
  pts.push(pts[0]);
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1], n = Math.min(b.im.count = Math.floor(total / b.pitch), 140); b.im.count = n;
  const trackSpeed = (v.speed || 0) + (v.def.wheeled ? 0 : sd * (v.turnRate || 0) * M.wz);
  b.off = ((b.off + trackSpeed * dt / b.pitch) % 1 + 1) % 1;
  const step = total / n; let seg = 0;
  for (let k = 0; k < n; k++) {
    let s = ((k + 1 - b.off) * step) % total; if (s < L[seg]) seg = 0; while (seg < L.length - 2 && L[seg + 1] < s) seg++;
    const p = pts[seg], q = pts[seg + 1], f = (s - L[seg]) / Math.max(1e-6, L[seg + 1] - L[seg]), dx = q[0] - p[0], dy = q[1] - p[1];
    _lq.setFromAxisAngle(_wz, Math.atan2(dy, dx)); _lm.compose(_lp.set(p[0] + dx * f, p[1] + dy * f, sd * M.wz), _lq, _ls.set(step / b.pitch, 1, M.ww)); b.im.setMatrixAt(k, _lm);
  }
  b.im.instanceMatrix.needsUpdate = true;
}

/* ---------------- the Vehicle entity ---------------- */
class Vehicle extends Ent {
  constructor(type, team) {
    super('vehicle', team); this.type = type; this.def = VEH[type]; this.T = this.def; this.cls = this.def.cls;
    this.yaw = 0; this.speed = 0; this.turnRate = 0; this.tYaw = 0; this.gPitch = 0; this.driver = null; this.cool = 0; this.cool2 = 0; this.recoil = 0;
    this.quat = new THREE.Quaternion(); this.pitchKick = 0; this.rollKick = 0; this.accel = 0;
    this.sel = this.def.ammo[0]; this.loaded = this.def.ammo[0]; this.reload = 0; this.atgmReady = this.def.atgmN || 0; this.atgmT = 0; this.smoke = this.def.smoke || 0; this.smokeT = 0;
    this.mods = this.def.mods.map(m => ({ ...m, hp: m.kind === 'crew' ? 100 : m.hp, max: m.kind === 'crew' ? 100 : m.hp }));
    this.mods.push({ id: 'trackL', kind: 'track', hp: 100, max: 100, side: -1 }, { id: 'trackR', kind: 'track', hp: 100, max: 100, side: 1 }, { id: 'barrel', kind: 'barrel', hp: 60, max: 60 });
    if (this.cls !== 'jeep') { // traverse and elevation are separate drives; a radiator sits over the engine; the fire control by the sight
      const dr = this.mods.find(m => m.kind === 'drive'), br = this.mod('breech'), en = this.mods.find(m => m.kind === 'engine'), op = this.mod('optics'), add = (id, t, b, hp) => this.mods.push({ id, kind: id, t, b, hp, max: hp });
      if (dr) { dr.id = 'hdrive'; dr.kind = 'hdrive'; }
      if (br && br.b) add('vdrive', 1, [br.b[0], br.b[1] - .22, br.b[2], br.b[0] + .55, br.b[1], br.b[5]], 60);
      if (en && en.b) add('radiator', 0, [en.b[0], en.b[4] - .22, en.b[2], en.b[3], en.b[4], en.b[5]], 45);
      if (op && op.b) add('fcs', 1, [op.b[0] - .5, op.b[1] - .3, Math.min(op.b[2], op.b[5]), op.b[0], op.b[1], Math.max(op.b[2], op.b[5])], 40);
      const ca = this.mod('carousel'); if (this.def.autoloader && ca) add('autoloader', 0, [ca.b[0] + .2, ca.b[4], ca.b[2] + .2, ca.b[3] - .2, ca.b[4] + .22, ca.b[5] - .2], 70);
    }
    this.load = this.def.load ? { ...this.def.load } : null; this.rackN = this.def.rack || 0; this.rackT = 0; this.atgmLoad = this.def.atgmLoad ?? 99;
    if (this.load && this.def.reload) { this.load[this.loaded]--; if (this.rackN) this.rackN--; } // one round is in the breech
    this.fpe = this.cls === 'jeep' ? 1 : 2; this.heat = 0; this.trackT = 0; this.supT = 0; this.sightR = 0; this.essT = 0; this.ess = this.def.ess ? 3 : 0;
    this.roles = {}; for (const r of this.def.crew) this.roles[r] = this.mods.find(m => m.id === r);
    this.swapT = 0; this.fire = 0; this.extT = 0; this.repairT = 0; this.hp = 1; // hp kept for code that only asks "alive?"
    this.model = VMODEL[type](team);
    if (!this.model.gltf) { mergeVehicleGroup(this.model.root, VEH_MATS[team]); buildRunningGear(this); } // (a downloaded model brings its own paint and running gear)
    scene.add(this.model.root);
  }
  mod(id) { return this.mods.find(m => m.id === id); }
}
// what still works
function vState(v) {
  const ok = id => { const m = v.mod(id); return !m || m.hp > 0; }, r = v.roles;
  const has = role => r[role] && r[role].hp > 0, eff = role => has(role) ? .6 + .4 * r[role].hp / 100 : 0; // a wounded man works, but slower
  const eng = v.mods.find(m => m.kind === 'engine'), trans = v.mods.find(m => m.kind === 'trans');
  const power = (!eng ? 1 : eng.hp <= 0 ? 0 : eng.hp < eng.max * .5 ? .55 : 1) * (!trans || trans.hp >= trans.max * .5 ? 1 : .6) * (v.heat > 1 ? .7 : 1); // (a damaged gearbox loses drive; an overheated engine loses power)
  return {
    drive: has('driver') && (!eng || eng.hp > 0) && (!trans || trans.hp > 0) && ok('trackL') && ok('trackR'),
    power: power * (has('driver') ? .75 + .25 * eff('driver') : 1),
    fire: has('gunner') && ok('breech') && ok('barrel'),
    traverse: ok('hdrive') ? (has('gunner') ? .7 + .3 * eff('gunner') : 1) : 0, // a dead drive freezes that axis: turn the hull to aim
    elevate: ok('vdrive') ? 1 : 0,
    optics: ok('optics'),
    fcs: ok('fcs') && ok('optics'), // rangefinder, thermal sight, stabiliser
    loader: v.def.autoloader ? ok('autoloader') : has('loader') || !v.def.crew.includes('loader'),
    loadEff: v.def.autoloader ? 1 : v.def.crew.includes('loader') ? (has('loader') ? eff('loader') : 0) : 1,
    crew: v.mods.filter(m => m.kind === 'crew' && m.hp > 0).length,
  };
}
/* how long the next round takes to load: the ready rack is quick; once it is empty the rounds come from deeper stowage
   (by hand on an autoloader tank, which is much slower); a wounded loader is slower, a dead one slower still */
function reloadTime(v) {
  const D = v.def, st = vState(v);
  return D.reload * (D.autoloader ? 1 : st.loadEff > 0 ? 1 / (.55 + .45 * st.loadEff) : 1.8) * (st.crew < D.crew.length ? 1.15 : 1) * (D.rack && v.rackN <= 0 ? (D.autoloader ? 2.2 : 1.4) : 1);
}
const ROLE_ORDER = ['gunner', 'driver', 'commander', 'loader'];
function crewStep(v, dt) { // crew fill empty seats, fires burn, repairs tick
  const r = v.roles, vacant = ROLE_ORDER.find(role => r[role] && r[role].hp <= 0 && v.def.crew.includes(role));
  if (vacant) {
    const donor = ROLE_ORDER.slice().reverse().find(role => role !== vacant && r[role] && r[role].hp > 0 && ROLE_ORDER.indexOf(role) > ROLE_ORDER.indexOf(vacant));
    if (donor) { v.swapT += dt; if (v.swapT > 5) { r[vacant] = r[donor]; r[donor] = { hp: 0, id: donor + '-empty' }; v.swapT = 0; vMsg(v, `${MOD_NAME[donor] || donor} took the ${MOD_NAME[vacant].toLowerCase()}'s seat`); } } else v.swapT = 0;
  }
  if (v.fire > 0) {
    v.fire -= dt;
    for (const m of v.mods) if (m.kind === 'crew' && m.hp > 0) m.hp -= 5 * dt;
    const e = v.mods.find(m => m.kind === 'engine'); if (e && e.hp > 0) e.hp -= 4 * dt;
    if (Math.random() < dt * 8) sprite(_wp.copy(v.pos).setY(v.pos.y + v.def.hgt * .7), 1.4, 1.2, .5, 0xffffff, true, 2.5);
    if (Math.random() < dt * 6) sprite(_wp.copy(v.pos).setY(v.pos.y + v.def.hgt), 2, 7, 3, 0x2a2826, false, 4, .75);
    if (v.fire <= 0) vMsg(v, 'The fire burned out');
    if (vState(v).crew < 2) destroyVehicle(v, v.lastAttacker, 'fire', 'burned out');
  }
  if (v.extT > 0) v.extT -= dt;
  // wounded crew recover slowly once they have not been hit for a while
  for (const m of v.mods) if (m.kind === 'crew') { if (m.hp < (m._hp ?? m.hp) - .01) m.hitT = GAME.time; if (m.hp > 0 && m.hp < 100 && GAME.time - (m.hitT ?? -99) > 20 && v.fire <= 0) m.hp = Math.min(100, m.hp + 2 * dt); m._hp = m.hp; }
  // a holed radiator: the engine overheats as it works, then starts to wreck itself
  { const rad = v.mod('radiator'), e = v.mods.find(m => m.kind === 'engine');
    if (rad && e && e.hp > 0) { const hot = rad.hp <= 0 && (Math.abs(v.speed) > .5 || Math.abs(v.accel) > .3); v.heat = clamp(v.heat + (hot ? dt / 40 : -dt / 25), 0, 1.6);
      if (v.heat > 1) { e.hp = Math.max(0, e.hp - 5 * dt); if (!v.heatMsg) { v.heatMsg = true; vMsg(v, 'Engine overheating: the radiator is holed. Stop and repair'); } } else if (v.heat < .6) v.heatMsg = false; } }
  // a thrown track goes back on by itself once the vehicle has stood still for a few seconds
  { const broken = v.mods.find(m => m.kind === 'track' && m.hp <= 0);
    if (broken && Math.abs(v.speed) < .2 && v.fire <= 0 && v.mods.some(m => m.kind === 'crew' && m.hp > 0)) { if ((v.trackT += dt) >= 8) { broken.hp = broken.max; v.trackT = 0; vMsg(v, 'Track repaired'); } } else v.trackT = 0; }
  // on a checkpoint your side holds, or at base: ammunition, smoke and extinguishers are topped up while you stand still
  { const D = v.def, home = typeof friendlyPoint === 'function' && Math.abs(v.speed) < .4 && friendlyPoint(v); v.atHome = !!home;
    if (home && (v.supT += dt) >= 2.5) { v.supT = 0; let got = false;
      if (v.load) for (const k of D.ammo) if (v.load[k] < D.load[k]) { v.load[k] = Math.min(D.load[k], v.load[k] + Math.max(1, Math.round(D.load[k] / 12))); got = true; }
      if (v.fpe < (v.cls === 'jeep' ? 1 : 2)) { v.fpe++; got = true; } if (v.smoke < (D.smoke || 0)) { v.smoke++; got = true; } if (D.atgm && v.atgmLoad < D.atgmLoad) { v.atgmLoad++; got = true; } if (D.ess && v.ess < 3) { v.ess++; got = true; }
      if (got) vMsg(v, 'Resupplying'); } else if (!home) v.supT = 0; }
  // the ready rack is refilled from the rest of the stowage while the gun is loaded and idle
  if (v.def.rack && v.loaded && v.rackN < v.def.rack && v.load) { const stowed = v.def.ammo.reduce((n, k) => n + v.load[k], 0); if (stowed > v.rackN) { if ((v.rackT += dt) >= 6) { v.rackT = 0; v.rackN++; } } } else v.rackT = 0;
  if (v.essT > 0) { v.essT -= dt; if (typeof essPuff === 'function') essPuff(v, dt); }
  if (v.repairT > 0) {
    if (Math.abs(v.speed) > .4) { v.repairT = 0; vMsg(v, 'Repair stopped: you moved'); }
    else if ((v.repairT -= dt) <= 0) {
      const full = v.atHome; // in the field a repair gets things working again; on a checkpoint you hold it makes them good as new
      for (const m of v.mods) if (m.kind !== 'crew' && m.kind !== 'ammo' && m.hp < m.max) m.hp = full || m.kind === 'track' || m.kind === 'radiator' ? m.max : Math.max(m.hp, m.max * .55);
      v.heat = Math.min(v.heat, .5); vMsg(v, full ? 'Fully repaired' : 'Field repairs done');
    }
  }
}
/* Shtora-1 (soft-kill protection): infra-red dazzlers either side of the gun. A wire-guided missile is steered by a tracker at the
   launcher that watches a flare on the missile's tail; inside the dazzlers' arc the tracker locks onto them instead and steers the
   missile off. It does nothing to laser-guided or beam-riding missiles, or to shells. */
function shtoraJam(p, tgt, dt) {
  for (const v of ENTS) {
    if (v.kind !== 'vehicle' || !v.alive || !v.def.shtora || v.team === p.team || !vState(v).fcs) continue;
    if (v.pos.distanceToSquared(tgt) > 30 * 30) continue; // the missile has to be coming for this tank
    const d = p.pos.distanceTo(v.pos); if (d > 2800 || d < 40) continue;
    const a = v.yaw + v.tYaw, toM = Math.atan2(p.pos.z - v.pos.z, p.pos.x - v.pos.x); let off = Math.abs(toM - a) % TAU; if (off > Math.PI) off = TAU - off;
    if (off > .35) continue; // about 20 degrees either side of the gun
    if (!p.jam) { p.jam = new V3(rand(-1, 1), rand(.1, .8), rand(-1, 1)).normalize().multiplyScalar(rand(14, 30)); vMsg(v, 'Shtora: incoming missile dazzled'); const o = p.owner && p.owner.driver; if (o && o.isPlayer && typeof playerVehMsg === 'function') playerVehMsg('Missile guidance lost: the target is dazzling it'); }
    tgt.add(p.jam); return;
  }
}
function vMsg(v, text) { if (v.driver && v.driver.isPlayer && typeof playerVehMsg === 'function') playerVehMsg(text); }

/* ---------------- the damage model ---------------- */
const _ia = new THREE.Matrix4(), _ib = new THREE.Matrix4(), _pa = new V3(), _pb = new V3(), _pc = new V3(), _pd = new V3(), _nn = new V3();
function slabBox(a, b, x0, x1, y0, y1, z0, z1) { // segment a->b vs box: entry {t, axis, sign} or null
  let t0 = 0, t1 = 1, ax = -1, sg = 0;
  const lo = [x0, y0, z0], hi = [x1, y1, z1], A = [a.x, a.y, a.z], B = [b.x, b.y, b.z];
  for (let i = 0; i < 3; i++) {
    const d = B[i] - A[i];
    if (Math.abs(d) < 1e-9) { if (A[i] < lo[i] || A[i] > hi[i]) return null; continue; }
    let u0 = (lo[i] - A[i]) / d, u1 = (hi[i] - A[i]) / d, s = -1;
    if (u0 > u1) { const t = u0; u0 = u1; u1 = t; s = 1; }
    if (u0 > t0) { t0 = u0; ax = i; sg = s; }
    t1 = Math.min(t1, u1); if (t0 > t1) return null;
  }
  return ax < 0 ? { t: 0, axis: 0, sign: 1, inside: true } : { t: t0, axis: ax, sign: sg };
}
function plateFor(zone, part, hit, local) { // which plate was hit, and its outward normal (local)
  const ax = hit.axis, sg = hit.sign, A = zone;
  if (ax === 0 && sg > 0) {
    if (part === 'turret' && Math.abs(local.z) < A.mantlet.z) { const s = 0; return { p: A.mantlet, n: _nn.set(1, 0, 0), name: 'mantlet' }; }
    if (part === 'hull' && A.frontLow && local.y < A.frontLow.y) { const s = A.frontLow.slope * Math.PI / 180; return { p: A.frontLow, n: _nn.set(Math.cos(s), -Math.sin(s), 0), name: 'lower front plate' }; }
    const s = (A.front.slope || 0) * Math.PI / 180; return { p: A.front, n: _nn.set(Math.cos(s), Math.sin(s), 0), name: part === 'turret' ? 'turret front' : 'upper front plate' };
  }
  if (ax === 0) return { p: A.rear, n: _nn.set(-1, 0, 0), name: part + ' rear' };
  if (ax === 2) return { p: A.side, n: _nn.set(0, 0, sg), name: part + ' side' };
  if (ax === 1 && sg > 0) return { p: A.top, n: _nn.set(0, 1, 0), name: part + ' roof' };
  return { p: A.bottom || A.top, n: _nn.set(0, -1, 0), name: 'belly' };
}
function frames(v) { v.model.root.updateMatrixWorld(true); _ia.copy(v.model.root.matrixWorld).invert(); _ib.copy(v.model.turret.matrixWorld).invert(); }
// a round (projectile or bullet) going from a to b (world) meets vehicle v. Returns null if it missed the armour boxes.
function shotVehicle(v, a, b, ammoKey, owner, range) {
  const A = AMMO[ammoKey], D = v.def.armor; frames(v);
  const ha = _pa.copy(a).applyMatrix4(_ia), hb = _pb.copy(b).applyMatrix4(_ia);
  const ta = _pc.copy(a).applyMatrix4(_ib), tb = _pd.copy(b).applyMatrix4(_ib);
  const H = D.hull, T = D.turret;
  const hh = slabBox(ha, hb, H.x[0], H.x[1], H.y[0], H.y[1], -H.z, H.z), th = slabBox(ta, tb, T.x[0], T.x[1], T.y[0], T.y[1], -T.z, T.z);
  // the barrel sticks out in front of everything
  const gun = v.model.gun; gun.updateMatrixWorld(true); const gi = new THREE.Matrix4().copy(gun.matrixWorld).invert();
  const ga = a.clone().applyMatrix4(gi), gb = b.clone().applyMatrix4(gi), bh = slabBox(ga, gb, .5, v.model.muzzle, -.16, .16, -.16, .16);
  let hit = null, part = null;
  if (hh && (!th || hh.t <= th.t)) { hit = hh; part = 'hull'; } else if (th) { hit = th; part = 'turret'; }
  if (bh && (!hit || bh.t < hit.t) && A.kind !== 'bullet') {
    const brl = v.mod('barrel'); const dmg = A.kind === 'ap' ? 80 : A.kind === 'he' ? 50 : 60; brl.hp = Math.max(0, brl.hp - dmg);
    return { t: bh.t, what: 'barrel', text: brl.hp <= 0 ? 'Barrel destroyed' : 'Barrel damaged', pen: false, modules: ['barrel'] };
  }
  if (!hit) return null;
  const dirW = _nn.copy(b).sub(a).normalize().clone();
  const local = (part === 'hull' ? ha.clone().lerp(hb, hit.t) : ta.clone().lerp(tb, hit.t));
  const plate = plateFor(part === 'hull' ? H : T, part, hit, local), n = plate.n.clone();
  const m4 = part === 'hull' ? _ia : _ib, dirL = dirW.clone().transformDirection(m4); // world dir into the part's frame
  const cosI = clamp(-dirL.dot(n), 0, 1), angle = Math.acos(cosI) * 180 / Math.PI;
  const pt = a.clone().lerp(b, hit.t);
  const res = { t: hit.t, what: part, pen: false, angle: Math.round(angle), plate: plate.name, modules: [], pt };
  // tracks: a side hit low on the hull goes through the running gear first
  let penMod = 0;
  if (part === 'hull' && hit.axis === 2 && local.y < (v.model.track ? v.model.track.top + .1 : .8) && !v.def.wheeled) {
    const tr = v.mod(local.z < 0 ? 'trackL' : 'trackR'); tr.hp = Math.max(0, tr.hp - (A.kind === 'bullet' ? 2 : 100)); if (A.kind !== 'bullet') res.modules.push('track'); penMod = 25;
  }
  const kinetic = A.kind === 'ap' || A.kind === 'bullet' || A.kind === 'he';
  let base = kinetic ? plate.p.ke : plate.p.ce * (A.tandem ? .85 : 1);
  const eff = base / Math.max(.12, cosI) + penMod;
  res.eff = Math.round(eff);
  // ricochet
  if (angle > (A.rico || 80) && Math.random() < clamp((angle - A.rico + 3) / 8, 0, 1)) { res.text = 'Ricochet'; res.rico = true; return res; }
  const pen = penAt(A, range) * (0.95 + Math.random() * .1);
  res.penVal = Math.round(pen);
  if (pen < eff) {
    res.text = A.kind === 'he' ? 'Hit' : 'No penetration';
    if (A.kind === 'he' || A.kind === 'heat') externalBlast(v, pt, A, res);
    return res;
  }
  res.pen = true; res.text = 'Penetration';
  // inside: the penetrator itself, then a cone of spall
  const rays = [];
  if (A.main) rays.push([dirW.clone(), A.kind === 'bullet' ? 1.6 : A.kind === 'heat' ? 3.2 : 5, A.main]);
  if (A.spall) {
    const [cnt, cone, len, dmg] = A.spall, up = Math.abs(dirW.y) < .9 ? new V3(0, 1, 0) : new V3(1, 0, 0), s1 = new V3().crossVectors(dirW, up).normalize(), s2 = new V3().crossVectors(dirW, s1);
    for (let i = 0; i < cnt; i++) { const a2 = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.tan(cone); rays.push([dirW.clone().addScaledVector(s1, Math.cos(a2) * r).addScaledVector(s2, Math.sin(a2) * r).normalize(), len * (.6 + Math.random() * .4), dmg]); }
  }
  const start = pt.clone().addScaledVector(dirW, .05), hitMods = new Set();
  for (const [d, len, dmg] of rays) for (const m of moduleHits(v, start, start.clone().addScaledVector(d, len))) { m.hp = Math.max(0, m.hp - dmg); hitMods.add(m); }
  if (A.op) for (const m of v.mods) { const c = modCenter(v, m); if (c) { const dd = c.distanceTo(pt); if (dd < A.op) { m.hp = Math.max(0, m.hp - 160 * (1 - dd / A.op)); hitMods.add(m); } } }
  res.modules = res.modules.concat([...hitMods].map(m => m.kind === 'crew' ? m.id : m.kind));
  afterHit(v, hitMods, A, owner, res);
  return res;
}
function moduleHits(v, a, b) { // modules a segment passes through, in order
  const ha = a.clone().applyMatrix4(_ia), hb = b.clone().applyMatrix4(_ia), ta = a.clone().applyMatrix4(_ib), tb = b.clone().applyMatrix4(_ib), out = [];
  for (const m of v.mods) {
    if (!m.b && !m.s) continue;
    const pa = m.t ? ta : ha, pb = m.t ? tb : hb;
    if (m.b) { if (slabBox(pa, pb, m.b[0], m.b[3], m.b[1], m.b[4], m.b[2], m.b[5])) out.push(m); }
    else if (segSphere(pa, pb, _pa.set(m.s[0], m.s[1], m.s[2]), m.s[3]) !== null) out.push(m);
  }
  return out;
}
function modCenter(v, m) {
  if (!m.b && !m.s) return null;
  const c = m.b ? new V3((m.b[0] + m.b[3]) / 2, (m.b[1] + m.b[4]) / 2, (m.b[2] + m.b[5]) / 2) : new V3(m.s[0], m.s[1], m.s[2]);
  return c.applyMatrix4(m.t ? v.model.turret.matrixWorld : v.model.root.matrixWorld);
}
function externalBlast(v, pt, A, res) { // a shell bursting on the outside: tracks, barrel and sight can still break
  const frag = A.fragPen || 0; if (!frag) return;
  for (const id of ['trackL', 'trackR', 'barrel', 'optics']) {
    const m = v.mod(id); if (!m) continue;
    let c;
    if (id === 'trackL' || id === 'trackR') c = new V3(0, .5, m.side * (v.model.wz || 1.2)).applyMatrix4(v.model.root.matrixWorld);
    else if (id === 'barrel') c = new V3(v.model.muzzle * .6, 0, 0).applyMatrix4(v.model.gun.matrixWorld);
    else c = modCenter(v, m);
    if (!c) continue;
    const d = c.distanceTo(pt), R = (A.splash || 3) * .4;
    if (d < R && !(v.def.wheeled && id.startsWith('track'))) { m.hp = Math.max(0, m.hp - frag * 3 * (1 - d / R)); res.modules.push(id.startsWith('track') ? 'track' : id); }
  }
}
function afterHit(v, hitMods, A, owner, res) {
  v.lastAttacker = owner;
  for (const m of hitMods) {
    if (m.hp > 0) continue;
    if (m.kind === 'ammo' && !m.gone) {
      m.gone = true;
      if (m.blowout) { res.text = 'Ammo hit: the blow-out panels vented it'; v.fire = Math.max(v.fire, 4); continue; }
      const chance = m.det ?? (A.kind === 'he' ? .9 : .7);
      if (Math.random() < chance) { res.detonate = true; destroyVehicle(v, owner, 'ammo', 'ammo detonation', !!m.toss); return; }
      v.fire = Math.max(v.fire, 12);
    }
    if ((m.kind === 'fuel' && Math.random() < .5) || (m.kind === 'engine' && Math.random() < .3)) { if (v.fire <= 0) res.fire = true; v.fire = Math.max(v.fire, 14); }
  }
  const st = vState(v);
  if (st.crew < 2) { destroyVehicle(v, owner, A.kind, 'crew knocked out'); res.destroyed = true; }
}
// HE bursting near (not on) a vehicle
function blastNearVehicle(v, pt, A, owner) {
  if (!v.alive) return;
  frames(v);
  const c = _pa.copy(v.pos).setY(v.pos.y + v.def.hgt * .5), d = c.distanceTo(pt), R = A.splash || 3; if (d > R) return;
  const res = { modules: [] };
  externalBlast(v, pt, A, res);
  // fragments against the roof and sides
  const f = (A.fragPen || 0) * (1 - d / R) * (A.op ? 1 + A.op * .1 : 1);
  const thin = Math.min(v.def.armor.hull.top.ke, v.def.armor.hull.side.ke);
  if (f > thin) { const hm = new Set(); for (const m of v.mods) if (m.kind === 'crew' && Math.random() < .5) { m.hp = Math.max(0, m.hp - 60 * (f / thin - .5)); hm.add(m); } afterHit(v, hm, A, owner, res); }
}
