# Decisions & guesses

- **Game name / setting**: "Wrecking Shift" — original name, setting and content (see README).
- **Everything is a voxel body.** Static world pieces (ground tiles, buildings) and dynamic debris/props/vehicles share one
  `VoxelBody` type (dense `Uint8Array` grid + Rapier rigid body + native Rapier `Voxels` collider). Verified by experiment in
  Node: 65k-voxel collider builds in ~30 ms, `setVoxel` ≈ 0.7 µs, 30 voxel bodies settle and sleep, raycasts/shape casts work.
- **Palette byte = material(5 bits) << 3 | shade(3 bits)**; shades 0–4 colour variation, 5 spray paint, 6–7 scorched.
  Keeps the material when a voxel is scorched/painted without a second array.
- **Mass properties are computed by us** (collider density 0 + `setAdditionalMassProperties`): Rapier does not update mass
  after `setVoxel` (checked experimentally), and per-material densities are needed anyway.
- **Connectivity** = interleaved multi-seed flood fill (6-neighbourhood) with union-find, started only from voxels next to
  the edit; static bodies are anchored by their bottom voxel layer. Downward-biased DFS finds the ground quickly.
- **Fracture pattern**: explosions/sledge delete the inner part of the radius and cut a staggered-block crack pattern in an
  outer shell so loose chunks (rigid bodies) are produced instead of only a clean spherical hole. Own design.
- **Player** uses Rapier's kinematic character controller with a *cylinder* (experiment: capsule fails to auto-step 0.2 m
  voxel stairs, cylinder climbs them).
- **Raycasts for tools** use our own DDA through voxel grids (need voxel coords + material, and determinism).

## Heist framework / HUD / progression (mission worktree)
- **Mission data lives in body tags + level markers** (`target:<id>`, `destroy:<id>`, `alarm:<id>`, `valuable:<amount>`,
  `escape`; markers `escape`, `heli_start`; optional `LevelInfo.zones`). Mission-specific props are spawned by
  `MissionDef.setup(sim, level)` so a level stays clean for sandbox and other missions. Contract: header of `src/sim/mission.ts`.
- **Target tracking uses `body.center()` (grid box centre), not `rb.worldCom()`**: experiment showed `worldCom()` is not
  valid before the first physics step, which made freshly spawned targets look "moved" and tripped alarms.
- **Alarm box "comes loose"** = all solid probe points (5 per face, half a voxel outside the box, recorded at mission start)
  are empty; checked every 10 ticks. Static alarm boxes do not fall when their wall goes (no static->dynamic API) - guess:
  the alarm firing is what matters for gameplay.
- **Demolition sensor** counts voxels removed via `sim.onRemoved` on non-debris bodies before the alarm; separation by
  splitting is not counted (only `removeVoxel` reports).
- **Scoring (own numbers, guessed)**: required objective 100, optional 50 (overridable per objective), time bonus 2/s left on
  the alarm clock (full clock if the alarm never tripped; 0 for missions without any alarm source), optional client bonus.
  Cash = valuables + client fee, only paid on success. Rank = sum of per-mission best scores. Thresholds 0..3600 in
  `RANKS` (src/game/progress.ts) - guessed for ~2 missions per rank; tune once real missions exist.
- **Upgrades** only raise max ammo (as requested); base ammo is read from a pristine `createTools()` because
  `Game.loadLevel` carries `maxAmmo` over from the previous belt (applying `base + bonus` avoids compounding).
- **Free play** (`?level=` / `?test=1` without `?mission=`) leaves the belt untouched so existing tests and tool work are
  unaffected; progression locks apply only inside missions; sandbox unlocks everything + infinite ammo.
- **Graphics quality** is only published (`game.ext.settings.quality`); the renderer owner decides what it changes.
- **Head-bob** uses an additive `game.viewBob {y, roll}` (2-line change in `Game.draw`) instead of `cameraOverride`, so it
  never fights vehicles / map for the camera.
- **Helicopter** is cosmetic (no real spotlight light source - a translucent cone mesh, to avoid shader recompiles and
  per-pixel cost); flies from `heli_start` toward 14 m above the escape point during the last 15 s.
- **End screens** open 45 ticks after success/fail so the moment registers (and so e2e can drive it with `step`).
- **Escape while driving**: `MissionInput.vehicleBody` (= `game.ext.vehicles.current.body`) tagged `escape` ends the job
  anywhere (the van is the escape); deliver zones relative to the van (`{ bodyTag: 'escape', offset, half }`) are
  axis-aligned and ignore the van's rotation (guess: good enough for a flat-bed).
