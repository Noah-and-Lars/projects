# Neon Street

A path-traced, rainy cyberpunk street you can walk around in, rendered live in
the browser with WebGPU. It is a graphics showcase and a "how hard can your PC
go" test rather than a game: pick a preset from Low to Melt and watch the FPS
counter.

## Run it

Requirements: an up-to-date Chrome or Edge, and a PC with a dedicated graphics
card. WebGPU runs the path tracer on the GPU's regular cores (browsers can't
reach the dedicated ray-tracing hardware yet), so Ultra is heavy by design.

```sh
npm install
npm run dev
```

Open the printed URL, click the view, then walk with **W A S D**, run with
**Shift**, look with the mouse. **Esc** opens the settings panel, **H** hides
the stats, **F2** cycles debug views (radiance / albedo / normals).

URL parameters: `?preset=ultra`, `&scale=0.75`, `&spp=2`, `&bounces=6`,
`&fog=2`, `&w=1280&h=720` (fixed canvas size), `&autostart=1` (skip the start
screen).

## Presets

| Preset | Render scale | Samples/pixel | Bounces | Fog |
|--------|-------------:|--------------:|--------:|-----|
| Low    | 0.50 | 1 | 2  | cheap haze |
| Medium | 0.67 | 1 | 3  | volumetric |
| High   | 0.75 | 1 | 4  | volumetric |
| Ultra  | 1.00 | 2 | 6  | volumetric |
| Melt   | 2.00 (supersampled) | 4 | 10 | volumetric |

Every value can also be changed individually in the panel.

## How it works

- `src/renderer/shaders/trace.wgsl` — the path tracer. One light path per pixel
  per dispatch over a BVH of the whole street, with next-event estimation
  toward neon, windows and streetlights, GGX materials, glass, procedural
  puddles on the road, and volumetric fog with single scattering.
- `temporal.wgsl` + `atrous.wgsl` — an SVGF-style denoiser: reproject last
  frame's result with the previous camera, accumulate, then edge-aware blur.
- `display.wgsl` — remodulate albedo, expose, ACES tone map, upscale.
- `src/world/street.ts` — the procedural street (buildings, windows, neon
  signs, streetlights, props) built from boxes and quads.
- `src/renderer/bvh.ts` — binned-SAH BVH builder.

## Headless check

Renders a few frames in headless Chromium (software WebGPU) and saves a PNG.
Useful to confirm the shaders compile on a machine without a display.

```sh
npm run build
node scripts/headless.mjs --out shot.png --query "preset=low&w=320&h=180"
```
