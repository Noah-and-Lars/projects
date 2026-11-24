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
  build.ts      voxel authoring helpers       levels/   level generators (LevelDef.build(sim) -> LevelInfo)
  tools/        Tool base class + ToolBelt + one file per tool      fire.ts  FireApi
src/render/     three.js presentation: renderer.ts, bodyViews.ts (chunk meshes per body), particles.ts, worldMaterial.ts
src/game/       app glue: game.ts (main loop, GameModule), modules.ts (module registry), levels.ts (level registry),
                input.ts, ui/ (DOM HUD + menus)
src/audio/      WebAudio (procedural)
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
