// Visual themes, one per track: sky, light, colours and which scenery to build.
export const THEMES = {
  grassland: {
    sky: ['#2f86f0', '#bfe4ff'], fog: ['#cfe9ff', 70, 330],
    sun: { color: '#fff1d6', intensity: 3.4, dir: [-0.45, 0.85, 0.55] },
    hemi: ['#bfe3ff', '#4d7a2a', 0.9], env: 0.45, exposure: 1.0,
    dirt: '#a8683a', ground: '#4fae34', groundTex: 'grass',
    layers: [
      { kind: 'hills', z: -70, h: 9, color: '#3f9a33', factor: 0.35 },
      { kind: 'hills', z: -140, h: 18, color: '#5e9f66', factor: 0.6 },
      { kind: 'mountains', z: -260, h: 55, color: '#7f9fc4', factor: 0.82 },
    ],
    trees: { kind: 'mixed', count: 1, color: '#2e8a37' },
    props: { fence: true, stands: 3, tents: true, tyres: true, flags: true, clouds: true },
    accent: ['#e8331c', '#ffd23f', '#1f6fe0'],
  },
  desert: {
    sky: ['#3b8ee8', '#ffe1a8'], fog: ['#ffe6bd', 70, 340],
    sun: { color: '#ffe2b0', intensity: 3.8, dir: [-0.35, 0.8, 0.5] },
    hemi: ['#d7ecff', '#c08a50', 0.85], env: 0.4, exposure: 1.0,
    dirt: '#b9773e', ground: '#e3b46e', groundTex: 'sand',
    layers: [
      { kind: 'dunes', z: -60, h: 6, color: '#e7b46a', factor: 0.3 },
      { kind: 'mesas', z: -150, h: 32, color: '#c9683a', factor: 0.6 },
      { kind: 'mesas', z: -280, h: 50, color: '#d59a7a', factor: 0.82 },
    ],
    trees: { kind: 'cactus', count: 0.35, color: '#4b8a3c' },
    props: { fence: true, stands: 2, tents: true, tyres: true, flags: true, clouds: false },
    accent: ['#ff8a00', '#1f6fe0', '#ffffff'],
  },
  forest: {
    sky: ['#4f97de', '#d3ece2'], fog: ['#c9e2d6', 45, 250],
    sun: { color: '#fff4dc', intensity: 3.0, dir: [-0.5, 0.8, 0.45] },
    hemi: ['#cde8ff', '#2f5a24', 0.95], env: 0.4, exposure: 1.02,
    dirt: '#8d5a33', ground: '#3d8a32', groundTex: 'grass',
    layers: [
      { kind: 'pines', z: -40, h: 0, color: '#1f6b2c', factor: 0 },
      { kind: 'hills', z: -110, h: 22, color: '#2c6e3a', factor: 0.5 },
      { kind: 'mountains', z: -240, h: 60, color: '#6d8fa8', factor: 0.8 },
    ],
    trees: { kind: 'pine', count: 2.2, color: '#1f6b2c' },
    props: { fence: true, stands: 1, tents: true, tyres: true, flags: true, clouds: true },
    accent: ['#35c24a', '#ffd23f', '#e8331c'],
  },
  canyon: {
    sky: ['#e8642e', '#ffd09a'], fog: ['#f7c49a', 60, 300],
    sun: { color: '#ffd2a0', intensity: 3.6, dir: [-0.55, 0.65, 0.5] },
    hemi: ['#ffd7b0', '#8a3a1e', 0.85], env: 0.4, exposure: 1.0,
    dirt: '#b45a30', ground: '#c46a3c', groundTex: 'sand',
    layers: [
      { kind: 'canyon', z: -45, h: 26, color: '#b9532c', factor: 0.15 },
      { kind: 'mesas', z: -140, h: 45, color: '#c26a40', factor: 0.55 },
      { kind: 'mesas', z: -280, h: 70, color: '#d99a7c', factor: 0.82 },
    ],
    trees: { kind: 'cactus', count: 0.2, color: '#5a7a34' },
    props: { fence: true, stands: 1, tents: true, tyres: true, flags: true, clouds: false },
    accent: ['#ffd23f', '#e8331c', '#ffffff'],
  },
  stadium: {
    sky: ['#03061a', '#1d2a5c'], fog: ['#141c3e', 60, 260], stars: true, night: true,
    sun: { color: '#e9f1ff', intensity: 3.4, dir: [-0.25, 0.9, 0.6] },
    hemi: ['#5a6fb0', '#1a2a1a', 0.55], env: 0.25, exposure: 1.05,
    dirt: '#8a5532', ground: '#2f6d2c', groundTex: 'grass',
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
