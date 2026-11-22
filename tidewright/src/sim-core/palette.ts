// "Chart & Signal" 24-swatch paint palette. Blocks store an index, never RGB.
// Rows: neutrals, safety primaries, sea/land tones, darks & accents.
export const PALETTE: readonly string[] = [
  '#f4efe3', '#d9d3c4', '#a7a296', '#6e6c66', '#3b3d42', '#1e2229',
  '#f26a21', '#ffb000', '#ffd84a', '#d7263d', '#2a5bd7', '#1d3a8a',
  '#0f6e72', '#2fa39b', '#8fd1c4', '#4f8a3b', '#a3c76a', '#c49a5a',
  '#7a4e2d', '#5b3f8c', '#e88fb0', '#9ec9f0', '#ffffff', '#111111',
];
export const PALETTE_NAMES: readonly string[] = [
  'Chart paper', 'Sail', 'Fog', 'Slate', 'Graphite', 'Night ink',
  'Signal orange', 'Amber', 'Signal yellow', 'Flare red', 'Cobalt', 'Deep cobalt',
  'Deep teal', 'Lagoon', 'Seafoam', 'Moss', 'Lime', 'Sandbar',
  'Driftwood', 'Dusk violet', 'Coral', 'Sky', 'White', 'Black',
];
export const DEFAULT_COLOR = 6;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
