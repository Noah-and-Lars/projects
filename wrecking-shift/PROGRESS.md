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
- M11 Extras — partly: security drones (watcher/gunner, die only in water), water buoyancy + swimming/drowning,
  rain/snow particles (no level uses them yet). Not done: photo mode, challenge modes, wet-road physics.

## Tests
`npm test`: typecheck, 212 unit/sim tests in Node (incl. 11 mission playthroughs, ~2.5 min), build, headless-browser tests (boot, audio, 14 tools, missions/UI,
vehicles, lighting incl. GPU-vs-CPU ray check, fire, quicksave, one mission played through per big map). All green at the last commit.

## Known issues / not verified
- **Never run on a real GPU.** The container renders in software, so frame rate, the medium/high tiers' cost and the
  96 MiB lighting-volume budget are untested on real hardware. Sim cost is measured: ~0.1–2 ms per tick idle.
- Nobody has played it with a real mouse and keyboard: pointer lock, Esc/pause, feel of movement, driving and
  difficulty/score balance are tuned by numbers and scripted tests only.
- All 11 missions on the three big maps are played start to finish by scripted runs (see "Mission playthroughs");
  the scripts are optimal players, so real difficulty for humans is still unmeasured.
- Level load takes ~5 s on the big maps (no progress bar, just "LOADING…").
- Quickload does not restore fires, thrown/placed explosives in flight, or drone alert state.
- Glass is opaque-ish from inside vehicles (hood camera instead of a true driver view); the Kestrel Ridge pool is
  empty (one water level per map). Kestrel Ridge roads (15-16 %) are driven up and down by van, hatchback and loader
  in `tests/unit/ridgeRoads.test.ts`.
- Vehicle contact-force crash wear never applies in the real game (impact events are drained before the vehicle
  system reads them); see DECISIONS.md.
- The map edges are abrupt: terrain simply ends at the water plane.
- A 5-hour account usage limit paused all work from ~13:10 to 16:20 UTC; nothing was lost.
- Nothing was blocked by approval prompts.

## Mission playthroughs
`tests/unit/playthrough.test.ts` (harness `tests/unit/playHarness.ts`) plays every big-map mission with the tools of a
"typical" career at that point (prerequisite chain + Housewarming, required objectives + 10 s left, no upgrades).
Teleports only while planning; after the alarm everything is controller input, real tools and real driving.
Browser runs (one per map): `tests/e2e/playthrough.mjs` (Paper Trail, Private View, Controlled Burn).

| mission | career | tools / means | time left | score | changed to make it completable / tense |
|---|---|---|---|---|---|
| paper-trail | 220 | none (E), on foot | 18.2 s | 286 | warehouse mezzanine stairs rebuilt (rose away from the door); building stair openings widened; alarm 60→45 s |
| lights-out | 440 | sledge | no alarm | 100 | timber shoring band at the lighthouse foot (brick drum not fellable with 440-career tools) |
| dead-weight | 440 | grab/carry (RMB), on foot | 17.4 s | 234 | pump-house box got its own target id (was alarmed against the brief); alarm 75→50 s |
| depot-clearance | 760 | bomb, pistol | 15.0 s | 230 | pump house 40 % → 6 % (concrete: ~10 % max with all explosives); alarm 50→30 s |
| night-watch | 980 | none, on foot (drone spots you) | 24.2 s | 148 | drones count as an alarm source (time bonus); alarm 60→45 s |
| private-view | 440 | none, on foot | 17.7 s | 184 | alarm 60→35 s |
| cellar-door | 540 | blowtorch, hatchback down the switchback | 16.8 s | 282 | vault door is riveted plate (blowtorchable); alarm 75→50 s; Ridge roads/vehicles fixed (below) |
| tower-down | 760 | bomb | no alarm | 100 | watchtower above head height is timber (rock needed ~20 bombs) |
| long-drop | 760 | bomb | no alarm | 100 | now also unlocks after Dead Weight (needs bombs) |
| payday | 660 | none, on foot | 12.7 s | 274 | door in the office's top-floor corridor wall (office 1 was sealed); alarm 60→45 s |
| bund-fire | 1080 | pistol | 16.2 s | 132 | alarm 45→35 s |

Kestrel Ridge roads (`tests/unit/ridgeRoads.test.ts`, lot → forecourt, turn round, back): van up 33 s (grade top
35 km/h, mean 21), hatchback 27 s (37 / 26), loader 41 s (23 / 14); down 20-26 s. Fixes: road junction without a
1.4 m cliff, flat start of the switchback, wider hairpin, lamp out of the carriageway, suspension damping, raised
loader bucket, terrain excluded from ramming. Crashes found and fixed on the way: Rapier `setVoxel` panic on small
debris splits, fire visitors reading removed bodies (browser crash in Controlled Burn), unlimited fall speed while
standing on a ledge (death by fall damage after a hop).

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
