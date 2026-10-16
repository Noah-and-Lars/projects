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

Open the printed URL, click the view, and the wake-up sequence plays (skip it
with **Space** or a click; replay it from the settings panel). Then walk with
**W A S D**, run with **Shift**, look with the mouse. **Esc** opens the
settings panel, **H** hides the stats, **F2** cycles debug views (diffuse /
albedo / normals / specular).

URL parameters: `?preset=ultra`, `&scale=0.75`, `&spp=2`, `&bounces=6`,
`&fog=2`, `&rain=1.5`, `&drops=30` (thousands of streaks), `&warm=20`
(seconds of rain simulated before the first frame), `&lightning=0`,
`&x=..&z=..&yaw=..&pitch=..` (start pose), `&intro=0` / `&intro=1`,
`&introAt=7&introFreeze=1` (hold the intro at a given second), `&drone=0` /
`&drone=pin`, `&w=1280&h=720` (fixed canvas size), `&autostart=1` (skip the
start screen).

## Desktop app (no browser)

The same engine can run as a normal Windows program through Electron, with
a launcher for preset, resolution, fullscreen and an unlocked frame rate:

```sh
npm install
npm run app        # build and open the desktop app
npm run package    # build NeonStreet-<version>-x64.exe into release/
```

`npm run package` produces a portable `.exe` (no installer) and a `.zip` in
`release/`. In the app, **F11** toggles fullscreen, **F10** returns to the
launcher, **Alt+F4** quits. The launcher shows which GPU WebGPU picked.

## Presets

| Preset | Render scale | Samples/pixel | Bounces | Light candidates | Fog |
|--------|-------------:|--------------:|--------:|-----------------:|-----|
| Low    | 0.50 | 1 | 2  | 2  | cheap haze |
| Medium | 0.60 | 1 | 3  | 4  | volumetric |
| High   | 0.70 | 1 | 4  | 6  | volumetric |
| Ultra  | 0.85 | 2 | 5  | 8  | volumetric |
| Melt   | 1.75 (supersampled) | 4 | 10 | 16 | volumetric |

Tuned against an RTX 3060 Ti at 1080p: High around 60 fps, Ultra around
30 fps. Every value can also be changed individually in the panel, and the
stats overlay shows GPU time split into trace / denoise / post.

## How it works

- `src/renderer/shaders/trace.wgsl` — the path tracer. One light path per pixel
  per dispatch over a BVH of the whole street, with next-event estimation
  toward neon, windows and streetlights, GGX materials, glass, procedural
  puddles on the road, and volumetric fog with single scattering.
- `temporal.wgsl` + `atrous.wgsl` — an SVGF-style denoiser with separate
  diffuse and specular channels. Reflections on smooth surfaces are
  reprojected through the *virtual* point behind the mirror so they stay
  sharp while the camera moves.
- `lightgrid.ts` — per-cell light selection along the street, plus
  resampled importance sampling in the shader, so nearby neon dominates.
- `composite.wgsl`, `bloom.wgsl`, `display.wgsl` — HDR composite, bloom mip
  chain, Catmull-Rom upscale, ACES tone map.
- `src/weather/water.ts` — shallow-water simulation over the street: rain
  fills a depth layer that flows downhill into gutters and drains; a wave
  layer carries raindrop and footstep ripples. The tracer reads it for
  puddles and ripple normals.
- `src/weather/rain.ts` — rain streaks, splashes and awning drips as GPU
  particles, lit by an irradiance probe volume the tracer fills in
  progressively, drawn after denoising with a depth test against the
  G-buffer.
- `src/weather/lightning.ts` — sky flashes.
- `src/drone/` — the patrol drone: mesh, flight path and searchlight. Dynamic
  objects are traced as rigidly transformed second-level BVHs.
- `src/audio/audio.ts` — all sound, synthesised with the Web Audio API.
- `src/intro/` — the wake-up sequence: camera script, arm and helmet meshes,
  and the visor overlay drawn in `display.wgsl`.
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
