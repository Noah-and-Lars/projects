# Wrecking Shift — progress log

Branch: `teardown-voxel-game`, folder: `wrecking-shift/`. Research: `docs/research/` (all 10 files received).

**Playable private artifact:** https://claude.ai/artifact/XDodp916GTbW3g8YQ8pPyN
(published from `dist/`; it could not be opened from the build container, so whether the artifact sandbox allows the
physics WebAssembly and pointer lock is unverified — if it shows "Failed to start", run locally: `npm install && npm run dev`).

## Look matched to reference screenshots (2026-11-26)
User: find screenshots of the actual genre reference and tweak the look to match. 14 official screenshots (Steam store
+ the official site; analysis only, not committed) were measured against the same kinds of views rendered from Corvane
City (`tests/e2e/refmatch.mjs`). Write-up with sources, numbers and remaining gaps: `docs/research/14-reference-match.md`;
before / after: `docs/look/ref-*.jpg`; guesses: DECISIONS.md "Look matched to reference screenshots".
- **FOV**: 90° *horizontal* by default (was 80° vertical ≈ 112° horizontal): voxels and buildings ~1.5x bigger on
  screen. Setting is horizontal (70–120°); old saves migrate once (`migrateFov`, test in `tests/unit/progress.test.ts`).
- **Grade**: exponential tone curve (AgX as `?tone=agx`), per-preset saturation + warm colour balance, neutral / warm
  fill instead of saturated blue (navy shadows and black sunset streets are gone), paler day sky.
- **Atmospheric fog** (`src/render/fog.ts`): radial exponential haze, thinner looking up, glowing toward a low sun.
- **Sun shafts**: screen-space god rays from the bright sky / sun mask, all tiers.
- **Auto-exposure**: eye adaptation (+0.8 EV max into interiors, −0.5 EV toward bright sky), bit-identical when still
  (`tests/e2e/still.mjs`), `?autoexp=0` to disable.
- **Smoke**: sun-lit and world-shadowed, glows when backlit; blast smoke rises as a column and lingers 12–25 s.
- **Camera shake** is smooth (sines) instead of white noise.
- Numbers (16 city views): night pure-black pixels 28 % → 0.2 %, night mean 0.13 → 0.21 (reference 0.24), sunset
  shadow:lit 0.03 → 0.19, warmth −0.04 → +0.04 (reference +0.09). Saturation stays below the reference (0.22 vs 0.32):
  the city is grey concrete; the reference's maps are greener and more colourful.
- Performance mode gets all of it (fog, grade, shafts, adaptation: two tiny extra passes); its own extra saturation
  was removed because the grade already provides it.

## Follow-up (2026-11-25, user feedback): city, big maps, map preview, concrete
- **Corvane City**: a large procedural city (~300 m, 36 blocks, towers / apartments / houses / parks / warehouses,
  streets with lane markings, lamps, parked cars) — Sandbox → Corvane City. Heavy: ~49 M voxels, slow to load;
  use Performance mode on laptops. Test: `tests/unit/city.test.ts`; screenshots `tests/e2e/out/city-*.png`.
- **Big maps** from existing sites: Gullmouth County (256 m) and Hollin Borough (173 m) (`compositeMap`).
- **3D map preview**: selecting a map in Sandbox shows an orbiting voxel model before you load it.
- **Concrete** now breaks like the genre reference (guns, vehicles, explosives; not the sledge).

## Night pass (2026-11-25): performance mode, gap fixes, mods, tool bar
**Performance mode** — Settings → Graphics → *Performance mode (low-end laptops)* (remembered; `src/game/perfModule.ts`,
`renderer.setPerformanceMode`). Tuned low tier, DPR 1, adaptive 50–85 % resolution with a contrast-adaptive
sharpening upscale, 1024 shadow map refreshed every 2nd frame, 170 m draw distance behind fog, simple water,
debris / fire / particle caps, ≤ 2 physics ticks per frame. Measured CPU (harbour, 40 blasts + fires): sim tick
7.0 → 5.65 ms avg, 22 → 14.9 ms max. GPU cost judged by construction (no GPU here): see DECISIONS.md. A banner
suggests it after ~12 s below 24 fps (F7 / Turn on / Not now / Don't ask again). Tests: `tests/e2e/perf.mjs`
(applies live, persists, plays, screenshots `perf-*.png`).

**Gap analysis** — `docs/research/10-gap-analysis.md` (sources), inventory research `12-inventory.md`, mods research
`11-mods-research.md`. Filled: assists (alarm time / none, ammo ×1.5/×2, damage taken, unlock all jobs; results tagged
assisted), target outline within 8 m + look-at names and jokes for props, key rebinding, fail-screen "Back to my
save" + first-heist F5 hint, brightness + head-bob sliders, power upgrades in the workshop (blast, pellets, plank /
cable length, …), the loader's bucket raises / lowers on a motorised hinge (R / F), a new Booster Can tool, gamepad
support, and the sandbox spawn menu (B).

**Tool bar / inventory** (relayed request: work like the genre reference) — six groups on keys 1–6 (again = next
tool in the group), wheel through all tools, Q swaps back, compact always-on bar + expanded group columns on every
switch (Settings: always expanded), low / empty ammo states, mod tools in group 6. Tests: `tests/unit/inventory.test.ts`,
`tests/e2e/inventory.mjs` (`inv-*.png`).

**Mods** — 121 original built-in mods (`mods/`): 25 prop packs (≈55 props), 21 tools, 31 vehicle mods (32 vehicles),
13 maps, 11 game modes (each with its own small map), 11 rule tweaks, 9 looks. Format `src/mods/api.ts`, helpers
`src/mods/kit.ts` + `vehicleKit.ts`, registry `src/mods/registry.ts` (Vite glob, bundled: works in the single-file
build). Mods menu on the title screen and in the pause menu (on/off remembered, categories, search, conflicts),
spawn menu, mod game-mode HUD + results. `tests/unit/mods.test.ts` builds every map, spawns + drives every vehicle,
spawns every prop, uses every tool, runs every mode, applies / reverts every rule tweak, quickloads every mod
vehicle; `tests/e2e/mods.mjs` covers the menus, spawning, a mod tool, a mod map and a mode (`mods-*.png`).

**Known issues (this pass)** — performance-mode thresholds are reasoned, not measured on a real laptop; a parked
empty car barely moves under a booster (its brakes hold); rebinding crouch drops the second default key (C); gamepad
driving is on/off, not analog; the Controls page does not list gamepad buttons; mod tools are available in
Sandbox and mod game modes only (not in career jobs or challenges); the tool test checks for *an* effect, not that
the effect is good — mods were played by scripts and screenshots, not by a person.

## Earlier pass (2026-11-24): ground glitch fix + voxel look (research: `docs/research/09-voxels-deep-dive.md`)
**"The ground is glitched even when I am standing still" — cause and fix.** Logged the camera of a standing player:
on every big map the eye flipped by 0.1 mm every physics tick (Rapier's character controller nudges the character
off the ground, the -1 m/s ground-stick speed pulls it back), and on Kestrel Ridge's terraced slopes the player crept
~4 cm per 10 s. A headless probe that renders consecutive frames from a fixed standing position measured ~1050 ground
pixels changing per frame at 640x360 (harbor, medium); after the fix 0 on harbor / works at every tier (only the
animated water changes on ridge). The renderer itself had no frame-to-frame noise. Fix: a sub-0.3 mm deadband for a
standing player without movement input (`src/sim/player.ts`). Also fixed on the way, all visible as "glitchy ground":
- black specks on terraced hillsides: T-junction cracks at concave/convex step edges (now overlapped) and sun-shadowed
  nooks clipped to pure black by a linear-space contrast step in the post grade (now a log-space curve) plus an AO that
  counted nearby walls twice (now min(face AO, cone AO); cones start clear of the surface);
- distant ground sparkle when moving: per-voxel colour grain now fades out once a voxel is smaller than a pixel.
Tests: `tests/unit/standstill.test.ts` (eye perfectly still on flat ground, a voxel staircase slope, after walking,
and around spawn on harbor / ridge / works), `tests/e2e/still.mjs` (consecutive frames identical while standing);
probe `tests/e2e/stillprobe.mjs [maps] [tiers] [frames]` writes diff masks.

**Voxel look / breaking (compared with the genre reference, see the research file's table):**
- per-voxel normal tilt (~4°) so flat walls break into a mosaic of shading steps; soft bevel on convex voxel edges of
  static bodies near the camera;
- chips are small (2.5-5 cm) tumbling flecks, mostly short-lived, and no longer hang in the air around fresh holes;
- soot is graded (heavy near a blast hole, light outside) instead of pitch-black blots;
- hole rims are cleaner (the reference carves exact spheres); bricks are 3x1 voxels (real brick scale) instead of 4x2;
- small debris is only cleaned up when it is small, slow and more than 20 m from the player (it used to crumble in
  front of you 15 s after settling).
- Crash fix found by the playthroughs after these changes: Rapier `setVoxel` panics on small sparse dynamic bodies;
  those now rebuild their collider once per step.

**"Destroying the ground shows below the map":** the terrain was never actually open (crater floors are the
unbreakable layer 0.5 m down, also on tile seams; `tests/unit/dig.test.ts`), but that layer was near-black, so every
crater looked like a hole into the void. It is now compacted earth, and pits are lit more realistically (the cone AO
over-darkened them).

**What to try:** stand still on Kestrel Ridge or Gullwick Harbour and watch the distant ground (should be perfectly
still); hammer a wooden wall up close (chips, hole rim, the chunk on the floor); bomb a brick wall (soot gradient).

**Ground "heat waves" while standing — found and fixed:** the head bob never settled after walking (it kept moving
the camera by tiny amounts every frame, worst on high-refresh screens). It now runs only while walking and ends at
exactly zero within a quarter second. Head bob can stay on.

**If the ground still seems to move while standing still**: Esc -> Settings -> **Diagnostics**. Turn on the camera
readout (or press F4: camera motion per frame + raw mouse counts), then switch one feature off at a time (TAA, voxel
grain, moving-object shadows, near plane, crack hiding, head bob; quality is in Settings). Changes apply at once and
are remembered. Locally the same switches work as URL parameters (`?camdebug=1&taa=0&grain=0&dynshadow=0&near=0.05
&inflate=0&bob=0`); the artifact link does not pass query strings. In this container the camera and every shader input are
bit-identical frame to frame while standing (real game loop, recorded).

**Lamp posts** face the road now (they were turned the wrong way on every map).

**Anti-aliasing:** medium and high now use TAA like the reference (smooth terrace edges and distant detail while
moving; `?taa=0` or `renderer.setTAA(false)` switches back to FXAA / MSAA). A still camera converges to a still,
supersampled image.

**Still differs from the reference / known issues:** TAA without motion vectors (fast debris can smear slightly at
its edges; the image is a little softer than with FXAA); no per-shape grime/rust detail textures; the bevel exists only on
static (volume-lit) bodies; terraced hills at sunset show many tiny (now dark green, not black) step shadows; glass
window frames can show a dotted crack line against the glass. Real-GPU behaviour of the fix is reasoned, not seen:
the container renders with SwiftShader.

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
`npm test`: typecheck (with unused-code checks), 227 unit/sim tests in Node (incl. 11 scripted mission playthroughs
and a vehicle road test, ~3 min), build, headless-browser tests (boot, audio, 14 tools, missions/UI, vehicles,
lighting incl. GPU-vs-CPU ray check, fire, quicksave, challenge/photo modes, one mission played through per big map).

## Code review (after the first build)
Three independent review passes (simulation; app/render/UI; lighting shaders + level generators + missions). The
first two reported 20 defects, all fixed, with regression tests in `tests/unit/regressions.test.ts`. The worst: a crash
when a burning body was removed, vehicles never taking collision damage in the real game loop, and the physics world
leaking on every level load (~47 MB per harbour load). The third found no crashes or leaks; it reported visual and
placement defects, which are fixed: off-grid trees/rocks shadowing their own sunlit faces, the "Lights Out" lamp housing
spawning inside the lighthouse wall (it chewed 469 voxels out at load), mission props inside geometry, two floating lamps.

## Known issues / not verified
- **Never run on a real GPU.** The container renders in software, so frame rate, the medium/high tiers' cost and the
  96 MiB lighting-volume budget are untested on real hardware. Sim cost is measured: ~0.1–2 ms per tick idle.
- Only lightly played by a human so far: feel, difficulty and score balance are tuned mostly by numbers and scripted
  tests. The playthrough scripts are optimal players, so real difficulty for humans is still unmeasured.
- Audio levels were balanced by measurement; nobody has reported on how it sounds.
- Level load takes ~5 s on the big maps (progress bar; the build step itself still blocks for a few seconds).
- Quickload restores bodies, tools, planks/cables, placed charges, rockets, fires (fuel restarts) and drones, but not
  the player's crouch state or pending chain explosions.
- Glass is opaque-ish from inside vehicles (hood camera instead of a true driver view); the Kestrel Ridge pool is
  empty (one water level per map).
- After one failed lighting-volume allocation the renderer stays on the low tier for the rest of the session.
- Resuming from pause with Esc may need one click to recapture the mouse (browser rule; not reproducible headless).
- Two alarm boxes (Payday boiler house, Controlled Burn bund wall) sit partly buried in curved walls (cosmetic).
- Usage limits paused work twice (~13:10–16:20 and ~20:00–21:20 UTC); nothing was lost.
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
