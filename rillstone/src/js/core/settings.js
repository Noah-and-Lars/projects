// Player settings, saved in localStorage. Key bindings live here too.
const KEY = 'rill-settings';
export const DEFAULT_BINDS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC'],
  pickup: ['KeyE'], drop: ['KeyG'], use: ['Mouse0'], secondary: ['Mouse2'],
  rotX: ['KeyR'], rotY: ['KeyT'], rotZ: ['KeyY'], swap: ['KeyQ'], vehicle: ['KeyF'], unflip: ['KeyH'],
  guide: ['KeyB'], map: ['KeyM'], lantern: ['KeyL'], fly: ['KeyV'], debug: ['F3'],
};
export const ACTION_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', sprint: 'Sprint', crouch: 'Crouch',
  pickup: 'Pick up', drop: 'Drop / place', use: 'Use tool', secondary: 'Secondary', rotX: 'Rotate (pitch)', rotY: 'Rotate (yaw)', rotZ: 'Rotate (roll)',
  swap: 'Quick-swap tool', vehicle: 'Enter / exit vehicle', unflip: 'Unflip vehicle (hold)', guide: 'Look-up guide', map: 'Map / journal', lantern: 'Lantern', fly: 'Fly (sandbox games)', debug: 'Debug overlay',
};
export const DEFAULTS = {
  fov: 75, sensitivity: 1, invertY: false, sprintToggle: false, headBob: false, graphics: 'high',
  volume: { master: 0.8, music: 0.5, ambience: 0.7, machines: 0.8, water: 0.7, ui: 0.8 },
  captions: false, binds: DEFAULT_BINDS,
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {}
  const out = { ...DEFAULTS, ...s, volume: { ...DEFAULTS.volume, ...(s.volume || {}) }, binds: { ...DEFAULT_BINDS } };
  for (const k in DEFAULT_BINDS) if (Array.isArray(s.binds?.[k])) out.binds[k] = s.binds[k].filter(x => typeof x === 'string').slice(0, 2);
  out.fov = Math.min(100, Math.max(60, +out.fov || 75));
  out.sensitivity = Math.min(3, Math.max(0.2, +out.sensitivity || 1));
  if (!['verylow', 'low', 'medium', 'high'].includes(out.graphics)) out.graphics = 'high';
  return out;
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
}
export const keyLabel = (code) => {
  if (!code) return '—';
  if (code.startsWith('Mouse')) return ['LMB', 'MMB', 'RMB', 'Mouse 4', 'Mouse 5'][+code.slice(5)] || code;
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/Left$/, ' L').replace(/Right$/, ' R').replace('Arrow', '↑↓←→'.includes(code) ? '' : 'Arrow ');
};
