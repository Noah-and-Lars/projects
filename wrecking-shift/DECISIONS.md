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

## Audio (src/audio, src/game/audioModule.ts)
- **Guesses (no spec in the research docs):** size-class thresholds (carve: <40 / <400 / more voxels; impact force: <15k / <60k /
  more; sim reports impacts from 4000), 0.75 m footstep length, 6 m indoor probe range, 32-voice cap, per-category token buckets
  (see `CATEGORY_LIMITS` in engine.ts). All are tunables, not measured against playtests.
- **Voice limiter clock** is wall-clock (`performance.now`), not `ctx.currentTime`, so a suspended/never-running context
  cannot make the limiter fill up forever.
- **Context creation** only on a user gesture (pointerdown/mousedown/keydown/touchstart/click) or `game.ext.audio.ensure()`.
- **Music** is rule-based (hash-randomised sparse arpeggio over a 4-chord minor progression; heist cue = bass pulse + noise
  percussion + stabs + noise riser driven by `tension`). Chord choices are our own, no existing melody is used.
- **Loops** (fire, engine, torch, heli, alarm, ambient) are refreshed by TTL (`engine.touchLoop`) instead of explicit stop calls,
  so a module that stops sending data silences them within ~0.5 s.

## Levels: Kestrel Ridge (`ridge`) and Brackwater Works (`works`)
- **Chimney grid is 44 x 302 x 44 voxels**, taller than the 256-per-axis guideline. The brief asks for a free-standing chimney of
  30 m or more, and a second body stacked on top would float when the lower one is cut (static bodies are anchored only by
  their own bottom layer). Checked in the code: chunk keys allow 16 chunks (512 voxels) in x and y, and neither the mesher nor
  the Rapier voxel colliders have a 256 limit. The unit test fells the chimney with a ring of charges. Width and depth stay
  at 256 or less (tested).
- **Spawn points are lifted 0.1 m** above the surface. An experiment (scripts/dbg-level.test.ts) showed that a `Player` created
  with its feet exactly on a voxel surface (y = 1.6 on flat terrain) never moves. Created 0.1 m higher, it drops and walks
  normally.
- **Floors sit 0.1 m above grade** (body at ground - 0.2 with a 3-voxel foundation), the same as `placeBuilding`. Flush floors
  z-fight with the terrain's top voxel: grass showed through the basement and gallery floors in screenshots.
- **Quad budget**: the greedy mesher emits each face that has an AO gradient as a single-voxel quad, so 1:2 voxel staircase
  roofs and thin cylinders are expensive. Roofs are now terraced (rise 4-6 voxels every 8-12), and plank floors stripe along
  one axis only. Silos, tanks and the chimney are still the most expensive bodies (about 100k, 15k and 38k quads). Merging
  faces whose AO gradient is the same along the merge direction in `mesher.ts` would fix this for every level (not my file).
- **Guesses**:
  - Lake and canal water use the single global water plane (level 0). The gallery pool on the 6.8 m terrace is therefore
    drained, because a second water level does not exist.
  - Road grades are 13-17 % (there is no vehicle spec yet).
  - Ridge uses 4x4 tiles and Works uses 5x4 tiles to stay under the 16 M voxel budget. Terrain alone is about 0.55-0.65 M
    voxels per tile.
- **kit.ts fixes** (each one was an island that turned into debris on the first edit):
  - `pine`: the trunk now reaches the top tier. The upper tiers were joined only through the trunk and floated.
  - `tree`, `pine` and `rock` now drop noise islands that are not connected to the bottom layer (`dropFloating` in kit2.ts).
  - Fuel `tank`: the explosive core now starts on the bottom plate. It used to float 1 voxel above it.
