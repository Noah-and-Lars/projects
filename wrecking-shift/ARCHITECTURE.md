# Wrecking Shift — architecture guide (read before changing code)

Original first-person voxel-destruction heist game for the browser. TypeScript + Vite, three.js r187 (WebGL2),
Rapier 0.21 (`@dimforge/rapier3d-compat`, native `Voxels` colliders). Research on the genre reference lives in
`docs/research/` (master report: `teardown-report.md`; appendices `01`–`08`). **The game must stay original**:
own name, setting, characters, text, maps, art, sounds. Never copy the reference game's names, levels, assets,
scripts or UI — only genre mechanics.

## Layout
```
src/sim/        deterministic simulation — pure TS, runs in Node, fixed 60 Hz (DT), no DOM / three.js / Math.random / Date
  materials.ts  material table + palette (voxel byte = material<<3 | shade; shades 5 = paint, 6-7 = scorched)
  voxels.ts     VoxelGrid (dense Uint8Array, idx = x + sx*(y + sy*z)), mass properties
  body.ts       VoxelBody = grid + Rapier rigid body + Voxels collider (static world piece, prop, vehicle, debris)
  sim.ts        Sim: bodies, carve(), explode(), raycast(), removeVoxel()/setVoxel(), processEdits() (connectivity
                + splitting), step(), event queue `sim.out` (SimEvent), `sim.systems` (SimSystem.update before physics)
  connectivity.ts  island search   mesher.ts  greedy mesher + AO (pure, used by render)
  player.ts     first-person character (Rapier kinematic controller), health / damage()
  build.ts      voxel authoring helpers
  levels/       level generators (LevelDef.build(sim) -> LevelInfo); terrain.ts (heightmap + sloped roads ->
                ground tiles); kit/ (buildings.ts: buildings + geometry helpers, scenery.ts, props.ts)
  tools/        Tool base class + ToolBelt + one file per tool      fire.ts  FireApi
                also: water.ts, drones.ts, vehicle.ts + prefabs/, mission.ts + missionProps.ts, challenge.ts,
                snapshot.ts (quicksave), grab.ts
src/render/     three.js presentation: renderer.ts, bodyViews.ts (chunk meshes per body), worldMaterial.ts + trace.glsl.ts
                (traced sun / voxel AO), occupancy.ts + worldOccupancy.ts + volumes.ts (world occupancy volume),
                sky.ts, lamps.ts, post.ts, particles.ts, fireFx.ts, toolFx.ts, viewModel.ts, vehicleFx.ts, water.ts,
                backdrop.ts, lookModule.ts
src/game/       app glue: game.ts (main loop, GameModule, level loading, quicksave), modules.ts (module registry),
                levels.ts (level registry), missions/ (one file of mission definitions per level + helpers.ts), progress.ts (save data), input.ts,
                one *Module.ts per feature, ui/ (DOM HUD + menus + map)
src/audio/      WebAudio (procedural): engine.ts, bank.ts, director.ts (events -> sounds), music.ts
tests/unit/     Vitest (Node)         tests/e2e/   Playwright smoke tests against dist/ (run.mjs + harness.mjs)
```

## Conventions
- Units: metres, seconds, kg. Voxel = 0.1 m (`VOXEL`). +Y up. Player yaw 0 looks toward −Z; forward = (−sin yaw, 0, −cos yaw).
- Body-local voxel (i,j,k) occupies `[i*0.1,(i+1)*0.1]` from the body origin (grid corner). `body.toLocal(worldPos)` returns
  float voxel coords; `body.toWorld(voxelCoords)` the inverse. Static bodies: bottom voxel layer (y == 0) is the anchor;
  anything no longer face-connected to it becomes a dynamic debris body automatically (in `processEdits`, run every step).
- Never touch `body.grid.data` directly at runtime — use `sim.removeVoxel`, `sim.setVoxel`, `sim.carve`, `sim.explode`
  (they update the collider, dirty chunks, connectivity seeds and mass). Direct writes are fine while *building* a grid
  before `sim.addBody`.
- Sim code: all randomness via `sim.rng`; time via `sim.tick` / `DT`. Presentation-only code (particles, audio) may use
  Math.random.
- Sim → presentation communication is via events: `sim.out.push({type:'custom', name:'area:thing', data})` and the core
  events (`carve`, `split`, `crumb`, `explosion`, `impact`, `bodyRemoved`). Modules receive them in `onEvents`.
- Features plug in as a `GameModule` (see `src/game/game.ts`) registered in `src/game/modules.ts`; publish shared objects
  on `game.ext.<name>`. Keep edits to `game.ts`, `sim.ts`, `body.ts`, `renderer.ts` minimal and additive (other people
  are editing other features in parallel; small well-separated edits merge cleanly).
- Input: `game.input` (raw, per frame) and `game.pendingKeys` (keys pressed since the last fixed tick — use this inside
  `fixedUpdate`). LMB/RMB reach tools through `ToolInput`. `game.controlsEnabled`, `game.toolsEnabled`, `game.paused`,
  `game.cameraOverride` let modules take control.
- UI is plain DOM inside `#ui` (pointer-events none by default; menus enable them). No UI framework.
- Collision groups: see `GROUP_*` in sim.ts.
- Verify library APIs against the installed `.d.ts` (`node_modules/@dimforge/rapier3d-compat/dist/**/*.d.ts`,
  `node_modules/three/src`) instead of guessing; three r187 removed/changed things (e.g. PCFSoftShadowMap is gone).

## Missions, HUD, menus, progression
- `src/sim/mission.ts` - deterministic heist state machine (`Mission`, `MissionDef`); **its header is the level/mission
  authoring guide** (tags, markers, zones, events). Props: `src/sim/missionProps.ts`. Registry: `src/game/missions.ts`.
- `src/game/missionModule.ts` publishes `game.ext.mission` (start / startSandbox / restart / quit / serialize / restore /
  onEnd), `game.ext.progress` (src/game/progress.ts: save, ranks, unlocks, upgrades) and `game.ext.settings`.
- `src/game/uiModule.ts` + `src/game/ui/*` - DOM HUD/menus/map; publishes `game.ext.hud.setPrompt(text|null, prio, source)`
  and `game.ext.ui` (= `window.__game.ui` in tests). URL: `?mission=<id>`, `?sandbox=<levelId>`, no params = title menu.

## Testing (must stay green)
- `npx tsc --noEmit` — typecheck.  `npx vitest run` — unit/sim tests in Node (see tests/unit/core.test.ts for the pattern).
- `npx vite build && node tests/e2e/run.mjs` — headless Chromium (SwiftShader, slow but correct) against `dist/`.
  Page opened with `?test=1` (no rAF loop); drive with `window.__game` (`step(n)`, `render()`, `setView`, `key`,
  `buttons`, `selectTool`, `stats()`, `game`, `sim`, `player`). Screenshots land in `tests/e2e/out/*.png` — look at them.
  Keep viewports small (640×360). Never judge FPS in this container (no GPU); benchmark CPU work in Node instead.
- Playwright + Chromium are preinstalled (`require('playwright')`); do **not** run `playwright install`.
- Add tests for what you build (unit tests for sim logic; an e2e check + screenshot for anything visible).

## Challenges, photo mode, time/weather, map edges
- `src/sim/challenge.ts` - deterministic challenge rules ("Rubble Rush" timed wrecking, "Snatch Sprint" grab + clock out),
  crate spot picker, `challenge:*` events (header documents them). `src/game/challengeModule.ts` publishes `game.ext.challenge`
  (start(mode, levelId) / restart / current / active / best / lastResult / onEnd / expire). Only one of mission / sandbox /
  challenge is active: a level load the module did not ask for drops the challenge. UI: `src/game/ui/challengeUi.ts`
  (menus `challenges`, `chresult`, HUD panel), styles in `ui/extras.css`. Best scores: `Progress.challengeRecord/recordChallenge`.
- `src/game/photoModule.ts` - `game.ext.photo` (P / pause button; free camera via `cameraOverride`, sim paused, HUD hidden).
- `src/game/atmosModule.ts` - `game.ext.atmos` (time of day + weather choice for sandbox / challenges, `flashlight` on F).
- `src/game/edgeModule.ts` + `src/render/backdrop.ts` - far hills ring outside `level.bounds`, fog fitted to the level size,
  soft boundary (`game.ext.edge`). `MissionDef.timeOfDay` / `weather` are applied by the mission module.

## Rendering notes (see DECISIONS.md "Rendering / look")
- `renderer.setQuality('low'|'medium'|'high')`, `setTimeOfDay('day'|'sunset'|'overcast'|'night')`, `setResolutionScale(0.5..1)`,
  `pendingChunks()`, `stats()`, `patchMaterial(mat)`. Old members (`scene`, `camera`, `three`, `chips`, `sun`, `hemi`, `bodies`,
  `shake`, `setCamera`, `handleEvents`, `render`, `reset`, `setLevel`, `resize`) are unchanged.
- The scene is drawn into an HDR target and tone-mapped in `post.ts`; colours you put in the scene are linear radiance
  (values > 1 bloom). Add objects to `renderer.scene` as usual; lit three materials are patched automatically to receive the
  voxel world's traced shadows. Objects with `castShadow = true` render into the small sun shadow map.
- Static axis-aligned bodies are mirrored into the occupancy volume automatically (via `body.editBoxes`, filled by
  `markDirtyVoxel`). Glass and lamp voxels do not block light. `lamp`-like emissive voxel clusters get point lights.
- Look tests: `node tests/e2e/look.mjs` (also part of run.mjs; `LOOK_FULL=1` renders every tier x preset x viewpoint);
  dev helpers `tests/e2e/lookdev.mjs`, `probe.mjs`, `specks.py`. CPU benchmarks: `BENCH=1 npx vitest run tests/unit/perf.test.ts`.

## Power upgrades, vehicle arms, booster, gamepad
- `src/sim/tools/power.ts` — `POWER_UPGRADES` (absolute tool stat values per level, level 0 = class default) +
  `applyPower` / `carryPower`. `Progress.powerLevel/buyPower/applyPower` store levels in `save.upgrades` under dotted
  ids. Shop rows: `src/game/ui/powerShop.ts`. A new upgradeable stat must be a plain numeric tool field.
- `VehicleSpec.arm` (`ArmSpec`) + `VehicleBlueprint.arm` → `Vehicle.arm` (`VehicleArm`): a second voxel body on a
  motorised revolute joint (loader bucket). `VehicleInput.arm` -1..1; R / F while driving. Arm bodies are tagged
  `vehicle-arm` + `arm-of:<chassis id>` and found again by `adoptVehicle` after a quickload.
- `src/sim/tools/booster.ts` — sticky thruster can (`tool:boost` / `tool:boostEnd` events).
- `src/game/gamepad.ts` (pure `mapPad`, `GamepadInput`) + `gamepadModule.ts`: the pad is mapped to key codes, mouse
  motion / buttons and wheel steps; polled through `Input.pollers` before the game gathers input each frame.
