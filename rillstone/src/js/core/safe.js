// Data from outside this browser (save files, a host's world, other
// players' messages) is cleaned before the game uses it: keys that could
// reach an object's prototype are dropped, and very deep nesting is cut.
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
export function cleanKeys(v, depth = 0) {
  if (depth > 40) return null;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) if (v[i] && typeof v[i] === 'object') v[i] = cleanKeys(v[i], depth + 1); return v; }
  if (!v || typeof v !== 'object' || ArrayBuffer.isView(v)) return v;
  for (const k of Object.keys(v)) {
    if (BAD.has(k)) { delete v[k]; continue; }
    const x = v[k]; if (x && typeof x === 'object') v[k] = cleanKeys(x, depth + 1);
  }
  return v;
}
// An own key of a lookup table (never an inherited one like "toString").
export const own = (obj, k) => typeof k === 'string' && Object.hasOwn(obj, k);
