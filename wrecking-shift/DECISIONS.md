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
- **Vehicles** (`src/sim/vehicle.ts`): one dynamic voxel body + Rapier `DynamicRayCastVehicleController`. Chassis frame: +Z
  forward, +X across (x=0 = right side). The forward axis is set with the oddly named setter `setIndexForwardAxis = 2`
  (checked in Node: the default forward axis is X). Wheel rotation is positive when rolling forward (measured). Brake = impulse per tick.
- **Vehicle mass** is the voxel mass scaled to a target (`body.massScale`, a new additive field), because 0.1 m sheet-metal panels
  would make a car weigh ~3 t. The targets are guesses, roughly real-world: hatchback 1150 kg, van 2300 kg, loader 7500 kg.
- **Ramming** is a guess tuned by Node experiments. Severity = approach speed × cbrt(mass/1500), plus a push bonus for the loader.
  The carve radius per hardness is clamp((sev − thr)·k, 0, rmax), with thr soft/medium/hard = 2 / 4.5 / 26. The whole vehicle
  cross-section is projected onto the obstacle plane and carved. Only the rammed body is carved; neighbours (the ground) are
  shielded, so corners and the belly never snag. The vehicle loses 0.25 × removed mass × speed of momentum (capped at 30 % per tick).
- **Vehicle health** = 0.7 × vital (steel frame + engine-bay voxels) + 0.3 × all voxels − wear (blast waves, hard crashes).
  The vehicle dies below 0.12 health or when less than 25 % of the engine bay is left. It smokes below 0.3 health or below 55 %
  engine bay. Own design.
- **First-person vehicle camera** is a hood camera in front of the windshield, because glass voxels currently render opaque.
- `tests/unit/mesher.test.ts > is fast enough` (40 ms threshold) fails intermittently on this loaded shared container,
  even without the vehicle code. Left unchanged.
