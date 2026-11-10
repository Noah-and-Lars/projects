// Visual themes, one per track: sky, light, colours and which scenery to build.
export const THEMES = {
  // Day themes use a warm, hazy, slightly muted palette: soft golden light,
  // strong aerial haze into the distance, and a sun that still casts crisp
  // shadows on the track.
  grassland: {
    sky: ['#8dbde3', '#f2e5c6'], fog: ['#eadfc2', 18, 200],
    sun: { color: '#ffe5bd', intensity: 3.2, dir: [-0.45, 0.8, 0.6] },
    hemi: ['#f1e4c8', '#6b6a3c', 1.05], env: 0.4, exposure: 1.0,
    dirt: '#c69962', ground: '#8f9f4e', groundTex: 'grass',
    layers: [
      { kind: 'treeline', z: -34, h: 0, color: '#6d8a42', factor: 0 },
      { kind: 'treeline', z: -52, h: 0, color: '#7a9150', factor: 0 },
      { kind: 'hills', z: -80, h: 9, color: '#8d9c5a', factor: 0.35 },
      { kind: 'hills', z: -140, h: 18, color: '#a0aa78', factor: 0.6 },
      { kind: 'mountains', z: -260, h: 38, color: '#a8b0b4', factor: 0.82 },
    ],
    trees: { kind: 'mixed', count: 1, color: '#5c7e33' },
    props: { fence: true, stands: 3, tents: true, tyres: true, flags: true, clouds: true },
    accent: ['#e8331c', '#ffd23f', '#1f6fe0'],
  },
  desert: {
    sky: ['#86b5df', '#f6dfb2'], fog: ['#f0dbb2', 18, 210],
    sun: { color: '#ffe0ae', intensity: 3.5, dir: [-0.35, 0.78, 0.55] },
    hemi: ['#f3e3c6', '#b88a55', 1.0], env: 0.38, exposure: 1.0,
    dirt: '#d2a56b', ground: '#dfbc84', groundTex: 'sand',
    layers: [
      { kind: 'dunes', z: -46, h: 5, color: '#e2bf89', factor: 0.2 },
      { kind: 'mesas', z: -150, h: 14, color: '#c68a5c', factor: 0.6 },
      { kind: 'mesas', z: -280, h: 26, color: '#d6b49a', factor: 0.82 },
    ],
    trees: { kind: 'cactus', count: 0.35, color: '#6a8a46' },
    props: { fence: true, stands: 2, tents: true, tyres: true, flags: true, clouds: false, rocks: 0.6 },
    accent: ['#ff8a00', '#1f6fe0', '#ffffff'],
  },
  forest: {
    sky: ['#97bdd6', '#e5e4cf'], fog: ['#d9d9c4', 16, 175],
    sun: { color: '#fff0d2', intensity: 3.0, dir: [-0.5, 0.78, 0.5] },
    hemi: ['#e6e6d2', '#3f5a2c', 1.05], env: 0.38, exposure: 1.02,
    dirt: '#b3875a', ground: '#6e8a46', groundTex: 'grass',
    layers: [
      { kind: 'treeline', z: -32, h: 0, color: '#3f6a36', factor: 0, pine: true },
      { kind: 'treeline', z: -50, h: 0, color: '#557a48', factor: 0, pine: true },
      { kind: 'hills', z: -110, h: 13, color: '#62805a', factor: 0.5 },
      { kind: 'mountains', z: -240, h: 38, color: '#9aa8ac', factor: 0.8 },
    ],
    trees: { kind: 'pine', count: 2.2, color: '#3d6c34' },
    props: { fence: true, stands: 1, tents: true, tyres: true, flags: true, clouds: true },
    accent: ['#35c24a', '#ffd23f', '#e8331c'],
  },
  canyon: {
    sky: ['#e6915c', '#f7d8a8'], fog: ['#f0c9a0', 18, 200],
    sun: { color: '#ffd6a6', intensity: 3.4, dir: [-0.55, 0.65, 0.55] },
    hemi: ['#f6dcc0', '#8a4a2a', 1.0], env: 0.38, exposure: 1.0,
    dirt: '#c98756', ground: '#c98c5e', groundTex: 'sand',
    layers: [
      { kind: 'canyon', z: -52, h: 10, color: '#b8704a', factor: 0.1 },
      { kind: 'mesas', z: -150, h: 20, color: '#c3845c', factor: 0.55 },
      { kind: 'mesas', z: -280, h: 34, color: '#d9ad92', factor: 0.82 },
    ],
    trees: { kind: 'cactus', count: 0.2, color: '#6e7f44' },
    props: { fence: true, stands: 1, tents: true, tyres: true, flags: true, clouds: false, rocks: 1.2 },
    accent: ['#ffd23f', '#e8331c', '#ffffff'],
  },
  stadium: {
    sky: ['#03061a', '#1d2a5c'], fog: ['#10173a', 26, 170], stars: true, night: true,
    sun: { color: '#e9f1ff', intensity: 3.4, dir: [-0.25, 0.9, 0.6] },
    hemi: ['#5a6fb0', '#1a2a1a', 0.55], env: 0.25, exposure: 1.05,
    dirt: '#a97b4f', ground: '#35663a', groundTex: 'grass',
    layers: [
      { kind: 'stadium', z: -14, h: 0, color: '#3a3f4c', factor: 0 },
      { kind: 'city', z: -200, h: 30, color: '#1a2140', factor: 0.75 },
    ],
    trees: null,
    props: { fence: false, boards: true, stands: 0, tents: true, tyres: true, flags: true, clouds: false, floodlights: true },
    accent: ['#ff2fa0', '#30e0ff', '#ffd23f'],
  },
};

// Made-up sponsor names for banners.
export const SPONSORS = [
  ['THROTTLE RIDGE', '#e8331c', '#ffffff'],
  ['GRITWORKS', '#14202e', '#ffd23f'],
  ['VOLTA FUEL', '#ffd23f', '#111111'],
  ['KNOBBY TYRES', '#1f6fe0', '#ffffff'],
  ['DUSTDEVIL', '#35c24a', '#ffffff'],
  ['HOLESHOT', '#6b2bd9', '#ffffff'],
  ['RIDGELINE', '#ffffff', '#e8331c'],
  ['MOTO KANGA', '#ff8a00', '#14202e'],
  ['BRAAP ENERGY', '#111111', '#35c24a'],
];
