# Wrecking Shift — progress log

Branch: `teardown-voxel-game`, folder: `wrecking-shift/`.

## Status by milestone
- M0 Scaffold — done (Vite + TS + three + Rapier, Vitest, Playwright smoke harness, `window.__game`).
- M1 Voxel world — basic version done (materials/palette, greedy mesher + AO, test level, first-person controller).
- M2 Carving — basic version done (sledge / gun / bomb placeholders, hardness radii, chips).
- M3 Connectivity & debris — core done (island search, split to dynamic voxel bodies, budgets).
- M4+ — not started.

## Notes for the morning
- Research files had not arrived when the build started; work began from the instruction summary (§4).

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
