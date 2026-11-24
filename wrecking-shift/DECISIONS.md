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
- **Impact damage**: Rapier contact manifolds for voxel shapes give no usable world contact points/impulses (checked
  experimentally), so impulse = contact-force-event force × dt, and the contact point is estimated by a voxel raycast from
  the lighter body's centre of mass along the force direction. Damage only when the velocity change exceeds 2.2 m/s, so
  resting stacks never grind themselves down. Radii scale with the cube root of the impact energy (tuned by feel).
- **Structural crush check** (our answer to "buildings stand on one voxel"): per y-layer of a static body, weight above
  vs. summed compressive capacity of the layer's voxels (per-material strength in MPa, gameplay-tuned). An overloaded
  layer and a small band around it are pulverised; connectivity then drops the structure and impact damage breaks it.
  Cheap (per-layer sums maintained incrementally) and predictable for players: thick supports hold, slivers do not.
- **Terrain** = heightmap voxelised into 25.6 m tiles: 1 surface voxel + 0.5 m diggable soil + unbreakable bedrock shell,
  hollow underneath with a flat underside per 16×16 block (keeps Rapier voxel count and mesh quads low). Terrain tiles
  never split or fracture. Measured: 36 tiles (153 m square) build in ~7 s in Node on the busy container.
- **Water** is a plane at `level.waterLevel`; buoyancy by submerged fraction of an equivalent box, drag, splashes.
  Player swims; 12 s of breath.
- **Explosive material**: breaking voxels of the `explosive` material queues one delayed explosion per container
  (chain reactions); loose crumbs under 12 voxels fizzle.
