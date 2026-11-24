# Wrecking Shift — progress log

Branch: `teardown-voxel-game`, folder: `wrecking-shift/`. Research: `docs/research/` (all 10 files received).

**Playable private artifact:** https://claude.ai/artifact/XDodp916GTbW3g8YQ8pPyN
(published from `dist/`; it could not be opened from the build container, so whether the artifact sandbox allows the
physics WebAssembly and pointer lock is unverified — if it shows "Failed to start", run locally: `npm install && npm run dev`).

## What to try first
1. `npm install && npm run dev`, open the URL, **Play — Job Board → Housewarming** (tiny tutorial yard), then
   **Paper Trail** on Gullwick Harbour. Sandbox mode gives every tool with infinite ammo on any map.
2. Break things: sledge the wooden cottage, shoot brick, bomb concrete, cut the lighthouse base (mission *Lights Out*),
   burn the tree, drive the loader through the warehouse wall.
3. Settings → graphics quality (low / medium / high). If it runs slowly, use low or lower the resolution scale.

## Status by milestone
- M0 Scaffold — done.  M1 Voxel world — done.  M2 Carving — done.
- M3 Connectivity & debris — done, plus impact damage and a structural crush check (thin supports fail under load).
- M4 Tools — done: sledge, spray, extinguisher, blowtorch, handgun, shotgun, plank, cable, pipe bomb, bomb, rocket,
  nitro, rifle, leaf blower; RMB grab/throw; view models.
- M5 Fire & smoke — done (spreads, burns structures through, extinguisher, fire alarm).
- M6 Vehicles — done: hatchback, van, wheel loader; ramming; damage; chase/hood cameras.
- M7 Heist loop — done: objectives (collect/deliver/destroy/demolish/reach), wired alarm boxes, countdown, cosmetic
  helicopter, escape van, score, HUD, map (Tab), menus, pause, quicksave/quickload (F5/F9, planning only).
- M8 Audio — done (fully procedural; **balanced by measured levels only — nobody has listened to it**).
- M9 Look — done: traced sun shadows + voxel AO from a world occupancy volume, sky/time-of-day presets, lamp lights,
  bloom/tone mapping, three quality tiers with automatic fallback.
- M10 Content — done: 4 levels (test yard, Gullwick Harbour, Kestrel Ridge, Brackwater Works), 13 missions across
  heist / demolition / sink-in-water / destroy-% / drone-guarded types, sandbox, ranks + tool unlocks, cash upgrades,
  localStorage save.
- M11 Extras — done: security drones (watcher/gunner, die only in water), water buoyancy + swimming/drowning,
  two challenge modes (Rubble Rush, Snatch Sprint), photo mode (P), time-of-day and rain/snow pickers, flashlight (F),
  backdrop hills + soft map boundary. Not done: wet-road physics, any mission that uses rain/snow.

## Tests
`npm test`: typecheck (with unused-code checks), 209 unit/sim tests in Node, build, headless-browser tests (boot,
audio, 14 tools, missions/UI, vehicles, lighting incl. GPU-vs-CPU ray check, fire, quicksave, challenge/photo modes).

## Code review (after the first build)
Two independent review passes (simulation; app/render/UI) reported 20 defects; all were fixed, with regression
tests in `tests/unit/regressions.test.ts`. The worst: a crash when a burning body was removed, vehicles never taking
collision damage in the real game loop, and the physics world leaking on every level load (~47 MB per harbour load).
A third pass over the lighting shaders and level generators is recorded below if it found anything.

## Known issues / not verified
- **Never run on a real GPU.** The container renders in software, so frame rate, the medium/high tiers' cost and the
  96 MiB lighting-volume budget are untested on real hardware. Sim cost is measured: ~0.1–2 ms per tick idle.
- Nobody has played it with a real mouse and keyboard: pointer lock, Esc/pause, feel of movement, driving and
  difficulty/score balance are tuned by numbers and scripted tests only.
- The 9 missions on the three big maps are only tested for "props rest where placed, nothing trips on its own";
  none has been played start to finish (the two test-yard missions are completed in tests). Some may be too hard
  or too easy with the tools unlocked at that point.
- Level load takes ~5 s on the big maps (progress bar; the build step itself still blocks for a few seconds).
- Quickload restores bodies, tools, planks/cables, placed charges, rockets, fires (fuel restarts) and drones, but not
  the player's crouch state or pending chain explosions.
- Glass is opaque-ish from inside vehicles (hood camera instead of a true driver view); the Kestrel Ridge pool is
  empty (one water level per map); roads on Kestrel Ridge are steep (13–17%) and untested with vehicles.
- A 5-hour account usage limit paused all work from ~13:10 to 16:20 UTC; nothing was lost.
- Nothing was blocked by approval prompts.

## Rendering
Lighting / look upgrade (see `src/render/*`, research recipe `docs/research/08-lighting-look.md`). Reference screenshots: `docs/look/`.
- World occupancy volume: 1 bit per voxel (R8UI, 2x2x2 per byte) + R8 density volume (4^3 cells, CPU-built mips), mirrored
  from the static bodies; edits re-stamp sub-boxes and upload them with raw `texSubImage3D`.
- Voxel material = patched `MeshLambertMaterial`: traced sun shadow, per-pixel face AO, cone AO, traced point-light shadows,
  per-voxel colour grain, emissive voxels, translucent glass. Dynamic bodies: baked vertex AO + small sun shadow map.
- Sky dome + presets `day | sunset | overcast | night`, lamp point lights, HDR post chain (bloom, AgX, vignette, FXAA / MSAA).
- Quality tiers `low | medium | high` with automatic fallback to `low`, resolution scale.
- Mesher rewritten (bit-parallel face detection, AO-free merge for volume-lit bodies, crack-free quad overlap).

Measured (Node 22, shared 4-vCPU container under load; GPU numbers are not available here — SwiftShader only):
- Volume build, `testyard` (512x112x512 voxels): 17 ms CPU (75-135 ms in the browser incl. texture upload); 4.0 MiB CPU + 4.0 MiB GPU.
- Volume build, synthetic 200x40x200 m level (2000x400x2000 voxels, 64 ground tiles + 60 hollow buildings): 1.0 s;
  218 MiB CPU mirror (190.7 bits + 27.2 density mips) and the same again on the GPU -> above the default 96 MiB bit budget,
  so such a level is cropped in XZ around the spawn point (or raise `renderer.maxVolumeBytes`). Height is taken from the static
  content, so real levels are usually much smaller (128x128 m with 30 m of content = 61 MiB).
- Incremental update, size-1.5 explosion: 3-20 boxes, 10-16 k voxels re-stamped, 0.3-1.0 ms CPU (collect + bits + density +
  mips); size 2.5: 83 k voxels, 0.4 ms. In the browser incl. `texSubImage3D` of 21 boxes: about 10 ms on SwiftShader. A 30^3
  voxel edit box in the 200 m volume: 0.08 ms.
- Mesher, terrain-like tile 256x60x256 (128 chunks, ~880 quads / chunk, harsher than the real terrain):
  before 970-1040 ms / tile (7.6-8.1 ms / chunk, 202 k quads); after 122 ms / tile with baked AO (0.95 ms / chunk, same quads) and
  87 ms / tile in volume mode (0.68 ms / chunk, 112 k quads). 25 tiles: ~25 s -> 2.2 s. Empty chunk: ~20 us; fully solid: ~0.5 ms.
- GLSL DDA vs CPU reference in the real game volume: 0 mismatches / 30 000 rays, before and after destruction.
- Per-pixel texture fetches (static world pixel): low = 0 volume fetches (shadow map PCF only). medium = 1 (buried-face test)
  + 8 (face AO) + <= 25 trilinear (5 cones x 5 steps, 3.2 m) + sun ray (1 fetch per 0.4 m cell crossed, <= 192, plus <= 12 bit
  fetches inside non-empty cells; typically 10-40) + one short ray per point light in range. high = 4 sun rays, cones 5 x 8
  steps (9.6 m), otherwise the same. Cost is linear in pixels: use `setResolutionScale`.
