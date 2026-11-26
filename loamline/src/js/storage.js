// Everything is saved in this browser (localStorage), wrapped so the game
// still runs with storage blocked.

const KEY = 'loamline:v1';

const DEFAULTS = {
  coins: 0,
  bikes: ['trail'],
  bike: 'trail',
  colors: {},             // bikeId -> frame colour
  kit: { jersey: '#2fb8e6', helmet: '#f2f2f2' },
  best: {},               // courseId -> { time, style, splits }
  tasks: {},              // courseId -> { taskId: true }
  settings: {
    assist: 1,            // 0 off, 1 weak, 2 strong
    quality: 'auto',      // auto | high | medium | low
    weather: 'random',    // day | dusk | night | fog | random
    camera: 'follow',
    sound: true,
    music: true,
    steerSens: 1,
    tilt: false,
    tips: true,
  },
};

let state = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULTS, ...s, settings: { ...DEFAULTS.settings, ...(s.settings || {}) }, kit: { ...DEFAULTS.kit, ...(s.kit || {}) } };
    }
  } catch { /* storage blocked */ }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

export function store() {
  if (!state) state = load();
  return state;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function setting(k, v) {
  const s = store();
  if (v === undefined) return s.settings[k];
  s.settings[k] = v;
  save();
  window.dispatchEvent(new CustomEvent('loam:setting', { detail: { k, v } }));
  return v;
}

// Ghosts are big: keep them in their own keys.
export function loadGhost(courseId) {
  try {
    const raw = localStorage.getItem(`${KEY}:ghost:${courseId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function saveGhost(courseId, g) {
  try { localStorage.setItem(`${KEY}:ghost:${courseId}`, JSON.stringify(g)); } catch { /* full */ }
}
