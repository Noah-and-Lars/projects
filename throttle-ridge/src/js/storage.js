// Saved progress: best times, unlocked tracks and settings (localStorage).
const KEY = 'throttle-ridge.v1';

const defaults = () => ({ best: {}, unlocked: 1, skill: 'medium', muted: false, bike: 'stock' });

export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    return { ...defaults(), ...(d || {}) };
  } catch (_) {
    return defaults();
  }
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* private mode */ }
}

export function formatTime(t) {
  if (t == null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
