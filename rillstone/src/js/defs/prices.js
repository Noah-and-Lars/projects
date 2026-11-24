// Prices across the game run at a fifth of the brief's cost curve (the player
// asked for everything to be much cheaper so progress comes fast). `cheap`
// scales a listed price and rounds it to a tidy number; Machine Shop builds
// also take half the ingots (`fewerIngots`).
export const PRICE_SCALE = 0.2, INGOT_SCALE = 0.5;
export function cheap(p) {
  const x = p * PRICE_SCALE;
  if (x <= 0) return 0;
  if (x < 10) return Math.max(1, Math.round(x));
  if (x < 100) return Math.round(x / 5) * 5;
  if (x < 1000) return Math.round(x / 10) * 10;
  return Math.round(x / 50) * 50;
}
export const fewerIngots = (kg) => Math.max(1, Math.round(kg * INGOT_SCALE));
