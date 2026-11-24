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

## Rendering / look (lighting upgrade)
- **Hybrid lighting** as recommended by research file 08: rasterized greedy meshes + a world occupancy volume traced in the
  fragment shader (sun shadow, AO, lamp shadows). Dynamic / rotated bodies are never stamped into the volume (also not when
  they sleep: un-stamping robustly on wake-up was not worth the risk); they use baked vertex AO and a small camera-following
  shadow map that only non-volume objects render into.
- **Glass and lamp voxels are not in the volume**: windows let the sun in, lamp fixtures do not shadow their own light.
- **Buried static faces are discarded in the shader** (front cell solid in the volume): abutting bodies (ground tiles) have
  hidden side walls that otherwise z-fight along the seam as dark specks.
- **T-junction cracks**: a fixed 1 mm quad overlap is not enough at distance (rasterizers snap vertices to a sub-pixel grid).
  Quads are overlapped only along edges where the surface continues (corner code in `aux.z`), by 1 mm + 0.15 % of the view
  distance in the vertex shader. Convex edges stay exact (no fins). Measured on SwiftShader: 33 -> 0 background specks.
  Guess: 0.15 % also suffices for real GPUs (8 sub-pixel bits; SwiftShader has fewer) — not verifiable here.
- **Horizontal faces at the grid boundary are treated as "surface continues"** (ground tiles lie side by side); vertical
  faces are not. A cliff crossing a tile seam can therefore still show a rare crack pixel.
- **Soft sun (high tier)** = 4 rays in a 0.012 rad cone with a rotation keyed on world-space quarter-voxel cells, so the
  penumbra dither is stable under camera motion; no temporal accumulation (could not be validated for stability here).
- **Tone mapping** = AgX (three's implementation) in our own composite pass, albedo desaturated to 72 % in the material,
  ambient cool / key light warm per preset. Reason: the previous ACES + raw palette looked flat and over-saturated.
- **Default time of day** for levels without `sky` is `sunset`: the level's sun azimuth with the preset's 16 degree elevation.
  A level that sets `sky` keeps its exact `sunDir`.
- **Other systems' materials are adopted automatically**: every ~20 frames the scene is scanned and lit three materials
  (Lambert / Phong / Standard / Toon) get the traced sun + cone AO patch (`renderer.patchMaterial`), so props, particles and
  view models are not sunlit inside dark rooms. Set `renderer.adoptForeignMaterials = false` to opt out.
- **Settings hook is a guess**: `src/render/lookModule.ts` reads `game.ext.settings.quality` / `.resolutionScale` and
  subscribes through `game.ext.settings.onChange(cb)` if that function exists; the UI can also just call
  `renderer.setQuality()` / `setResolutionScale()` directly. URL parameters `?quality=&tod=&res=` override for testing.
- **Volume memory budget** 96 MiB of bit volume (guess for broad GPU compatibility; research found no hard number).
