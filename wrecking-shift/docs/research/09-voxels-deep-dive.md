# 09 — How the genre reference's voxels work, and where ours differed

Research date 2026-11-24. Source notes, with a URL and a [SOURCE] / [OBSERVED] / [INFERENCE] tag on every claim,
are in `09-voxels-notes-raw.md`. Earlier files cover the rendering pipeline (`02`, `08`), physics (`03`), formats
(`04`) and numbers (`07`). This file condenses what matters for "do our voxels look and break right", compares it
with our code, and records what was changed. Nothing is copied: we match the quality and feel, not assets or code.

## 1. What the reference does (condensed; sources in the raw notes)

**Size and construction.** One voxel is 10 cm (developer interview, modding API `GetShapeSize` scale 0.1). The world
is thousands of separate dense grids ("shapes", ≤ 256³, 1 byte per voxel = palette index) with their own transform;
houses are split into many thin shapes. The player is 18 voxels tall, eyes at 17; default FOV 90°. At 1080p a voxel
is ~19 px at 5 m, ~5 px at 20 m, ~1 px at 100 m: individual cubes read clearly within ~10 m.

**How a voxel looks.**
- Flat faces, one colour per voxel face. Colour comes from the palette entry (type, RGBA, reflectivity, shininess,
  metallic, emissive) plus a per-shape detail texture sampled **one texel per voxel** (photo-derived grime / rust /
  moss / dust tiles, weight per shape). So each voxel is a few % different in value and hue, constant inside the voxel.
- The G-buffer normals show **every voxel face slightly tilted at random**: lighting forms a mosaic of per-voxel steps
  even on a flat wall.
- **No outlines, no geometric bevel.** A screen-space normal blur near the camera rounds edges ("lego brick" look).
  Crease darkening comes from ray-traced AO. Shadows are dark but never crushed to black (sky light + soft tonemap).
- TAA resolves sub-pixel voxels at distance into a calm average; there is no per-voxel LOD.
- Soot and paint are palette-index swaps through **4-step tint tables** (gradual, dithered by probability).

**How breaking looks and works.**
- `MakeHole` carves **exact spheres** with one radius per hardness class (soft ≥ medium ≥ hard). Screenshots: a clean
  voxel-stepped disc in glass; jagged openings in wood come from overlapping hits, not from edge noise.
- Pieces that lose their face-connection to static geometry become rigid bodies that **keep their exact voxels and
  palette** (no pulverising). Only voxels inside the carve sphere vanish, replaced by particles.
- Chips: small (3–5 cm, smaller than a voxel) plain square flecks, grey-ish, rotating, gravity, slightly sticky,
  lifetime 0.5–3.5 s skewed short; 25/50/100 per explosion tier. Plus smoke and a sideways dust ring for big blasts.
- Debris rests and is deactivated; the shipped cleanup script removes only small (< 200 voxels, < 10 per side), slow
  (< 1 m/s) pieces **more than 20 m from the camera**.
- Connectivity only (6-neighbour). No load model: a floor hanging on one voxel stays up. Some building parts use
  joints that break under stress.

## 2. Our implementation vs the reference

| Aspect | Reference | Ours before this pass | Player would notice | Status |
|---|---|---|---|---|
| Voxel size | 10 cm | 10 cm | — | same |
| Per-voxel colour | palette + 1 texel/voxel detail | palette shades (authored in patches) + shader hash grain ±7 % | fine up close; **sparkling at distance** (sub-pixel noise, no TAA) | grain fades below 1 px (fixed) |
| Per-voxel normal | random small tilt per voxel face | perfectly flat | walls look flat/plastic, "too smooth" | **added** (≈4°, near only) |
| Edges | soft bevel near camera (normal blur) | hard | cubes look like flat paper | **added** convex-edge bevel (static bodies, near only) |
| Shadows / AO | dark, readable | sun-shadowed nooks clipped to **pure black** (linear-space contrast bug + double-counted AO + cones self-occluding) | black specks on terraced ground | **fixed** |
| Cracks | none (raymarched) | pinholes at concave and convex edges of terrace steps | dark specks on hillsides | **fixed** (concave overlap + sub-pixel convex overlap) |
| Brick pattern | bricks ≈ real size, grout lighter | 4×2 voxel bricks (40×20 cm) | walls read like breeze blocks, voxels look coarse | **3×1** bricks |
| Hole shape | exact sphere per hardness | sphere × noise (sledge rough 0.6, blasts 0.35, default 0.25) | holes too ragged / noisy | rough 0.2 / 0.2 / 0.15 |
| Chips | 3–5 cm, rotating, short-lived, grey-ish | 5–11 cm axis-aligned cubes, material colour, 1.5–3.5 s, **came to rest in mid-air** around holes | big floating cubes around every hole | **fixed** (2.5–5 cm, tumbling, greyed, never rest inside solid) |
| Soot | 4 gradual steps | 2 steps at 22 % / 14 % of the colour, checkerboard | blast marks look like black holes | 50 % / 27 %, heavy near the rim, light outside |
| Debris cleanup | small slow pieces > 20 m away | hammer chunks crumbled 15 s after settling, in front of the player | pieces vanish while you watch | only small, slow, untagged pieces > 20 m from the player |
| Loose pieces keep voxels | yes | yes | — | same |
| Connectivity | 6-neighbour, no load | 6-neighbour + our crush check (thin supports fail) | — | kept (own design, documented in DECISIONS) |
| Hammer chunk knock-out | not in the reference (only disconnection) | 2–3-voxel chunks knocked out of the hole | — | kept (own feel), fewer floaters now |
| Anti-aliasing | TAA | FXAA (medium), MSAA 4× + FXAA (high) | terrace edges crawl when moving | **not changed** (see §4) |
| Dig floor | deep diggable earth | 0.5 m of dirt over a near-black unbreakable layer | craters look like holes into the void | layer recoloured as earth, pit AO less dark (diggable depth unchanged) |
| Detail textures (grime/rust) | per-shape tiles | none | big surfaces a bit clean | not done |

## 3. The ground glitch (part of this pass)

Not a voxel-format issue, but it was the user's first report: Rapier's character controller nudged a standing player
0.1 mm off the ground every tick (and made it creep on terraced slopes); the -1 m/s ground-stick speed pulled it back
the next tick, so the camera flipped by 0.1 mm at 30 Hz and ~1000 ground-edge pixels changed every frame at 640×360.
See PROGRESS.md and DECISIONS.md for the fix and tests.

## 4. What still differs (deliberately or not yet)

- **No TAA.** Sub-pixel geometry (terrace edges, distant thin props) still aliases and crawls while moving; the
  reference hides this with TAA. A reprojection TAA would need motion vectors for moving voxel bodies — a larger job.
- **No per-shape detail textures** (grime, rust, dust tiles). The shader grain is uniform per material.
- **Bevel only on static, volume-lit bodies** (it needs the occupancy volume to know which edges are convex); debris
  and props get the per-voxel tilt but no bevel.
- **Rasterised greedy meshes** instead of per-object raymarching: visually equivalent for opaque voxels now that the
  cracks are closed; glass and transparency still differ (no stochastic transparency).
- **Our crush check** makes thin supports fail, which the reference does not do (it keeps a floor hanging on one
  voxel). Kept as a gameplay choice.
