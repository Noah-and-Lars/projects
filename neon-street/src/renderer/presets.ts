// Quality presets. Every value can also be changed individually in the menu.

export interface RenderSettings {
  /** Internal resolution relative to the canvas (2.0 = supersampling). */
  renderScale: number;
  /** Light paths traced per pixel per frame. */
  spp: number;
  maxBounces: number;
  /** Candidate lights considered per shading point (resampled importance sampling). */
  lightSamples: number;
  /** 0 = no fog, 1 = cheap analytic haze, 2 = volumetric (light scatters in the air). */
  fogMode: number;
  fogDensity: number;
  /** Frames of history the temporal filter may accumulate. */
  maxHistory: number;
  /** Edge-aware blur iterations after temporal accumulation. */
  atrousIterations: number;
  /** Bloom strength. */
  bloom: number;
  exposure: number;
}

export type PresetName = 'Low' | 'Medium' | 'High' | 'Ultra' | 'Melt';

// Tuned against an RTX 3060 Ti at 1080p: High ~60 fps, Ultra ~30 fps.
export const PRESETS: Record<PresetName, RenderSettings> = {
  Low:    { renderScale: 0.5,  spp: 1, maxBounces: 2,  lightSamples: 2,  fogMode: 1, fogDensity: 0.006, maxHistory: 24, atrousIterations: 4, bloom: 0.06, exposure: 1.3 },
  Medium: { renderScale: 0.6,  spp: 1, maxBounces: 3,  lightSamples: 4,  fogMode: 2, fogDensity: 0.006, maxHistory: 24, atrousIterations: 4, bloom: 0.06, exposure: 1.3 },
  High:   { renderScale: 0.7,  spp: 1, maxBounces: 4,  lightSamples: 6,  fogMode: 2, fogDensity: 0.006, maxHistory: 32, atrousIterations: 3, bloom: 0.06, exposure: 1.3 },
  Ultra:  { renderScale: 0.85, spp: 2, maxBounces: 5,  lightSamples: 8,  fogMode: 2, fogDensity: 0.006, maxHistory: 32, atrousIterations: 3, bloom: 0.06, exposure: 1.3 },
  Melt:   { renderScale: 1.75, spp: 4, maxBounces: 10, lightSamples: 16, fogMode: 2, fogDensity: 0.008, maxHistory: 32, atrousIterations: 2, bloom: 0.06, exposure: 1.3 },
};

export const PRESET_ORDER: PresetName[] = ['Low', 'Medium', 'High', 'Ultra', 'Melt'];

/** Slider definitions for the settings menu. */
export const SETTING_RANGES: { key: keyof RenderSettings; label: string; min: number; max: number; step: number }[] = [
  { key: 'renderScale', label: 'Render scale', min: 0.25, max: 2, step: 0.05 },
  { key: 'spp', label: 'Samples per pixel', min: 1, max: 8, step: 1 },
  { key: 'maxBounces', label: 'Light bounces', min: 1, max: 12, step: 1 },
  { key: 'lightSamples', label: 'Light candidates', min: 1, max: 32, step: 1 },
  { key: 'fogMode', label: 'Fog (0 off, 1 cheap, 2 volumetric)', min: 0, max: 2, step: 1 },
  { key: 'fogDensity', label: 'Fog density', min: 0, max: 0.04, step: 0.001 },
  { key: 'maxHistory', label: 'Temporal history', min: 1, max: 64, step: 1 },
  { key: 'atrousIterations', label: 'Denoise passes', min: 1, max: 5, step: 1 },
  { key: 'bloom', label: 'Bloom', min: 0, max: 0.4, step: 0.01 },
  { key: 'exposure', label: 'Exposure', min: 0.3, max: 3, step: 0.05 },
];

export function presetFromName(name: string | null): PresetName {
  const n = (name ?? '').toLowerCase();
  return PRESET_ORDER.find((p) => p.toLowerCase() === n) ?? 'High';
}
