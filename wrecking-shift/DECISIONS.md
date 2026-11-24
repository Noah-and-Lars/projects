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

## Player tools (src/sim/tools, src/sim/grab.ts)
- **Ammo** (base, `maxAmmo` raisable): pistol 18, shotgun 12, plank 8, cable 6, pipe bomb 6, bomb 6, rocket 6, nitro 4,
  blowtorch 20 s of fuel stored as 1200 ticks (`ammoLabel` shows "12.3s"); sledge / spray / extinguisher unlimited.
- **Carve radii** (soft, medium, hard): sledge 0.42/0/0, pistol 0.2/0.12/0, shotgun pellet 0.22/0.15/0 shrinking to 45 % at
  20 m; explosions via `sim.explode` (pipe 1.0, rocket 1.3, bomb 1.6, nitro 1.6 from the material). Values from the task
  brief; the research's community numbers (gun hole 0.35–0.55 m) were not used because brick is "medium" here.
- **Explosive tool bodies get a fake light mass** (pipe 2.5 kg, bomb 4 kg, nitro 3 kg) via `setAdditionalMassProperties`:
  a 3×3×6-voxel steel pipe would weigh ~90 kg and bulldoze crates. Breaking any voxel of a pipe bomb / bomb sets it off.
- **Blowtorch** heats voxels within 0.15 m of the *whole flame ray* (eye+0.3 m .. hit+5 cm): once the centre melts the ray
  passes through and keeps widening the hole, so it cuts lines while the view moves. Melt thresholds (ticks of centre
  heat, guesses): foliage 4, plastic 8, wood 10, sheet metal 16, painted metal 18 (~0.3–0.5 s for a 1-voxel sheet).
  Brick / plaster / concrete / dirt never melt, they only scorch. Calls `fire.heat(p, 0.06)` per tick (the fire CA's doc
  says 0.08/tick lights wood in ~0.4 s).
- **Planks** are 3 voxels wide × 1 thick (a 4 m plank weighs ~66 kg; the sim test shows it holding a ~120 kg crate and the
  80 kg player between two static pillars with < 10 cm sag). Ends overlap 5 cm into the surfaces; joints have contacts
  disabled. The glue tears if the joint points drift > 0.35 m apart (guess), or when either end voxel is destroyed. When
  a plank is cut, glued ends that went with the cut-off piece are re-jointed to it (`sim.onSplit`).
- **Cable** = Rapier rope joint (pure max-distance, no spring). Bullets passing within 6 cm of a rope cut it (shot
  listeners registered per Sim in gun.ts). Both points static, or both on the same body, is rejected without using ammo.
- **Nitro** also goes off on a hard knock (> 6 m/s velocity change in one tick) once it has come loose. Guess.
- **Grab**: mass limit 250 kg (the reference's value is unconfirmed); heavier bodies only get a capped 2.6 kN pull. The
  hold spring sets linvel toward the hold point (gain 14/s, max 14 m/s), angular velocity ×0.8 per tick. Throw Δv =
  clamp(900 / mass, 3.5, 12) m/s. The body is dropped when it is > 2.2 m from the hold point. Tool bodies are tagged
  `nograb`; vehicles cannot be grabbed.
- **Mouse wheel** cycles tools when nothing is held. With 12 tools only the first ten have digit keys (1–0); Q / wheel
  reach the rest.
- View-model tool-switch animation and the muzzle flash run on sim time, not frame time, so the rarely rendered headless
  test frames show the settled pose.
