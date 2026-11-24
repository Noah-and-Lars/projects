# 09: Teardown voxels, how they look and behave (raw notes)

Research date: 2026-11-24. These are raw notes for an original browser game in the same genre. Nothing here is meant to be copied. Teardown's texture atlases, palette files and scripts were looked at only to measure the target quality and feel.

**Tags**
- **[SOURCE]**: stated directly on the cited page, or in code or data the cited page publishes.
- **[OBSERVED]**: seen in a published screenshot, video frame or frame capture. Where I looked at a published image myself, the note says so.
- **[INFERENCE]**: my own reasoning. Treat it as a hypothesis to tune.

**Avoiding duplicates.** Facts already covered in `teardown-report.md`, `02-engine-rendering.md`, `03-physics.md`, `04-modding-formats.md`, `07-gap-numbers.md` and `08-lighting-look.md` are only summarised here in one line, with a pointer. The new material is in sections 2, 3, 5 and 6.

**What is new compared with files 02, 03 and 07**
- The per-shape detail-texture system: the `texture` and `blendtexture` attributes, 32 albedo tiles plus 16 blend tiles, a tile index plus a weight, a texture offset, and one texel per voxel.
- What those atlases contain.
- The 4-step black, yellow and RGBA tint tables stored in each palette.
- The full material-type enum, including Ice.
- Debris particles are grey, 3–5 cm, square-sprite chips.
- The particle-atlas tile order.
- Screenshot observations of hole shapes and of how a single voxel looks.
- On-screen size of a voxel.
- The `nocull` render distance.

---

## 1. Voxel size and how objects are built

- **One voxel is 10 cm.** Gustafsson: "they are on the scale of where 1 voxel is 10 centimeters. There's quite a lot of them… that's sort of what inspired me to try and replicate that MagicaVoxel feel in a video game." He confirms the size came from MagicaVoxel. [SOURCE] https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt
- `GetShapeSize` returns `xsize, ysize, zsize` in voxels plus `scale`, "The size of one voxel in meters (with default scale it is 0.1)". [SOURCE] https://teardowngame.com/modding/api.html
- **Scale is stored per shape.** The binary level format stores `scale` per shape's voxel block, and XML writes it as `scale = 10 × stored value`, default 1. So a shape can use voxels finer or coarser than 10 cm. [SOURCE: reverse-engineered converter code] https://github.com/TTFH/Teardown-Converter (`src/entity.h` struct `Voxels`, `src/write_scene.cpp`)
- The world is many per-object grids, not one grid. Each shape is a dense 1-byte-per-voxel grid with its own transform, up to 256³. Official guidance is that 128³ is fine, flat 256×256×10 is fine, and "A house should never be built in one single object". Large levels hold about 0.5 billion voxels in thousands of shapes. See `02-engine-rendering.md` §2 and `04-modding-formats.md`. [SOURCE] https://teardowngame.com/modding/
- **Shapes larger than 256 are split.** The converter writes oversized shapes as a `<compound>` of sub-shapes, one per 256-voxel block on each axis. [SOURCE: converter code] https://github.com/TTFH/Teardown-Converter (`WriteCompound`)
- **Shape-origin enum in saves:** `Tool = 1, MapInit = 2, Debris = 3, CreateShape = 4, Spawn = 5`. The engine therefore tags shapes created as debris. [SOURCE: converter code, commented-out enum] https://github.com/TTFH/Teardown-Converter (`src/entity.h`)
- **Per-shape stored fields:**
  - flags and collide flag (0x10);
  - collision layer and mask;
  - `density` and `strength` (default 1);
  - `texture` and `blendtexture` (tile plus weight);
  - `texture_offset`;
  - `emissive_scale`;
  - `is_broken`;
  - voxels (RLE-encoded), `palette_id`, `scale`, an 8-byte `light_mask` and `is_disconnected`.

  [SOURCE: converter code] https://github.com/TTFH/Teardown-Converter (`src/parser.cpp` `ReadShape`)
- **Static versus dynamic.** Only rock and ground are unbreakable. Bodies that don't move are taken out of the simulation. Detached pieces become new dynamic bodies. See `03-physics.md` §6 and §9. [SOURCE] https://blog.voxagon.se/2020/11/05/teardown-design-notes.html, https://teardowngame.com/modding/api.html
- **Scripts can build shapes voxel by voxel.**
  - `CreateShape(body, transform, refShape)` creates an "empty shape … using the palette of a reference shape… The size of the new shape will be 1x1x1".
  - `SetBrush("sphere"|"cube"|"noise", size 1–16, index or vox)` is used with `DrawShapeLine`, `DrawShapeBox` and `ExtrudeShape`.
  - The **"noise" brush type** exists for scripted voxel drawing.

  [SOURCE] https://teardowngame.com/modding/api.html
- **Voxscript builds voxels at level-build time.** Functions include `CreateMaterial(type, r, g, b, [a], [reflect], [shiny], [metal], [emissive])`, `Box`, `Sphere`, `Line`, `Set`, `Heightmap` and `GetRandomFloat`/`GetRandomInt`. The docs' example is `CreateMaterial("masonry", 0.6, 0.5, 0.3, 0, 0.1, 0, 0)`. [SOURCE] https://teardowngame.com/modding/voxscript.html

## 2. How a single voxel looks on screen

### 2.1 Colour and material per voxel (palette)
- Each voxel is 1 byte, a palette index (0 = empty). Each entry holds type, RGBA, reflectivity (0–1), shininess (0–1), metallic (0–1) and emissive (0–32). See `02-engine-rendering.md` §3. [SOURCE] https://teardowngame.com/modding/api.html (`GetShapeMaterial`)
- **Material-type enum** (numeric order, as stored in level files):
  - 0 none, 1 glass, 2 wood, 3 masonry, 4 plaster, 5 metal;
  - 6 heavymetal, 7 rock, 8 dirt, 9 foliage, 10 plastic;
  - 11 hardmetal, 12 hardmasonry, 13 **ice**, 14 unphysical.

  "Masonry" covers both concrete and brick, which the editor distinguishes only by palette range. [SOURCE: converter code] https://github.com/TTFH/Teardown-Converter (`src/scene.cpp` `MaterialName`, `src/scene.h` `Material`)
- **Palette record:** `Material materials[256]`, `has_transparent`, plus three tint tables of `4 × 256` bytes each: `black_tint`, `yellow_tint` and `rgba_tint`. Every palette therefore stores **4 tint steps** per index for soot, spray and arbitrary-colour paint. Each material also carries an `is_tint` flag, which marks entries generated as tints. [SOURCE: converter code] https://github.com/TTFH/Teardown-Converter (`src/scene.h` `Palette`, `src/parser.cpp`). This matches the dev blog: "two shades in four steps" means 8 free slots per used material. [SOURCE] https://blog.voxagon.se/2020/12/03/spraycan.html
- "Most objects in teardown actually only use a handful of materials." A simple prop may use one, and a big boat or house uses dozens. [SOURCE] https://blog.voxagon.se/2020/12/03/spraycan.html
- **Converting a material to MagicaVoxel** (the community converter's mapping, not official):
  - alpha < 1 becomes Glass, with rough = 1 − shininess;
  - emissive > 0 becomes Emit, with power = 0–4 chosen by thresholds 0.1/1/10/100 and emission = emissive / 10^(power−1);
  - otherwise, any of reflectivity, shininess or metal > 0 becomes Metal, with rough = 1 − shininess, spec = 1 + reflectivity and metal = metallic;
  - otherwise Diffuse.

  [SOURCE: converter code] https://github.com/TTFH/Teardown-Converter (`src/write_scene.cpp` `ToMV`)
- **MagicaVoxel authoring rules** from the official docs: use type Metal for almost everything; metallic "also controls … how specular it is"; "only very low metallic values are ever used, and only for raw metal objects. For painted metal Metallic 0 should be used"; emissive needs Power ≥ 2; for glass only transparency = 100 or not matters. [SOURCE] https://teardowngame.com/modding/
- The MATL keys in the MagicaVoxel file format are `_type` (`_diffuse`, `_metal`, `_glass`, `_emit`), `_weight`, `_rough`, `_spec`, `_ior`, `_att`, `_flux` and `_plastic`. [SOURCE] https://raw.githubusercontent.com/ephtracy/voxel-model/master/MagicaVoxel-file-format-vox-extension.txt
- Version 1.3.0 added "Support for 'specular' material property in MagicaVoxel 0.99.7". [SOURCE] https://teardowngame.com/changelog/

### 2.2 Detail textures inside voxel faces (the key "not flat" ingredient)
- **Atlas sizes.** Changelog 0.9.0: "There are now 32 texture tiles" and "Separate blend texture with 16 tiles (good for adding dust)". 1.6.3 adds "Editor texture property selection preview". [SOURCE] https://teardowngame.com/changelog/
- **Per-shape attributes.** Every `vox`, `voxbox` and `compound` shape has `texture="<tile> [weight]"` and `blendtexture="<tile> [weight]"`, where weight defaults to 1 and tile 0 means none, plus a `texture_offset` vector. [SOURCE: converter code] https://github.com/TTFH/Teardown-Converter (`src/entity.h` `Texture {uint16 tile; float weight;}`, `src/xml_writer.cpp` `AddTextureAttribute`, `src/parser.cpp`)
- **One texel per voxel.** Blend, albedo and normal maps "used for all geometry" are projected onto voxels so that "Each texel maps to one voxel". The capture shows "fine details on flat surfaces". [SOURCE] https://juandiegomontoya.github.io/teardown_breakdown.html
- **What the atlases contain.** I looked at the images published in Montoya's breakdown (`uAlbedoMap.jpg`, `uBlendMap.jpg`, `uNormalMap.jpg`). [OBSERVED]
  - The **albedo atlas** is 1024×2048 in a 4×8 grid, so 32 tiles. The tiles are photo-derived, mostly desaturated grey or blue-grey surfaces:
    - small tiles and mosaics;
    - brick or block patterns;
    - stone or concrete with grime;
    - mossy or green-speckled plaster;
    - dark brown wood or earth;
    - corrugated or ribbed grey patterns;
    - heavy orange rust streaks;
    - flaked turquoise paint over rust;
    - stained concrete;
    - one soft cloudy noise tile;
    - a few blotchy brown/green dirt overlays;
    - some empty or white tiles.
  - The **blend atlas** is 1024×1024 in a 4×4 grid. Most tiles are empty. Filled tiles are sand/dust, green moss or grass with alpha holes, dirt and rocky ground.
  - So shapes get a world- or object-projected grime or rust pattern sampled once per voxel. This adds **per-voxel brightness and hue variation on top of the flat palette colour.**

  https://juandiegomontoya.github.io/assets/teardown/uAlbedoMap.jpg, https://juandiegomontoya.github.io/assets/teardown/uBlendMap.jpg
- **Normal detail.** Montoya's contrast-boosted G-buffer normals (`subtleNormalMap.png`) show **each voxel face with its own slightly tilted but uniform normal**. The result is a mosaic of per-voxel shading steps, not per-pixel bumps inside a voxel. [OBSERVED] https://juandiegomontoya.github.io/assets/teardown/subtleNormalMap.png
- [INFERENCE] **Within a single voxel face the colour and normal are constant.** All variation is quantised to the voxel. That keeps the crisp MagicaVoxel look while breaking up big flat walls. To get the same look cheaply: a hash or noise per voxel cell for albedo (about ±3–8 % brightness and a small hue shift) and a per-voxel random normal tilt of a few degrees. Optionally add a tiling grime map sampled at voxel centres, weighted per object.
- `texture` weight lets authors fade the effect per shape. [INFERENCE from the `weight` field] https://github.com/TTFH/Teardown-Converter

### 2.3 Edges: bevel, outline, edge darkening
- **No geometric bevel and no outline.** A **screen-space normal blur** gives a bevelled look. It is applied "only to voxels that are close to the camera" and to nearby pixels at almost the same depth. In acko's frame only the first-person tool got smoothed. Acko describes voxels that look like "plastic lego bricks, with rounded edges". [SOURCE] https://acko.net/blog/teardown-frame-teardown/
- The full-screen normal blur "gives the illusion of objects being beveled after they are shaded". [SOURCE] https://juandiegomontoya.github.io/teardown_breakdown.html
- **Wiki close-up (`Voxels.png`), which I inspected.** [OBSERVED] https://static.wikia.nocookie.net/teardown/images/1/16/Voxels.png
  - Light-grey voxels, each a slightly different grey (per-voxel value variation of roughly ±5–10 %).
  - Soft, slightly rounded-looking cube edges.
  - Darkening in concave creases from ray-traced AO.
  - No black outlines. Faces read as flat.
- Edge darkening in corners comes from the ray-traced AO, not from a per-voxel edge effect. AO details are in `02-engine-rendering.md` §4.5. [INFERENCE + SOURCE for AO] https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech

### 2.4 Distance, aliasing, noise
- Per-object volumes have two extra mips (½ and ¼). Acko describes them only as **empty-space skipping** for the tracer, not as display level of detail. He found no distance level of detail for individual voxels. [SOURCE] https://acko.net/blog/teardown-frame-teardown/
- **AA is TAA ("a variant of temporal anti-aliasing (TXAA)")**, with four temporal reprojections per frame. Blue-noise-dithered transparency and stochastic lighting depend on it. [SOURCE] https://acko.net/blog/teardown-frame-teardown/
- **Render distance.** The `nocull` tag "removes the maximum render distance on any object tagged with it". Untagged objects therefore stop rendering beyond some distance. The value is UNCONFIRMED. [SOURCE: community wiki] https://teardown-modding.fandom.com/wiki/Tags
- [INFERENCE] At distance, voxels smaller than a pixel are resolved by TAA jitter into a soft average. Since detail textures are one texel per voxel, distant walls show only palette colour plus coarse grime. That is why the look stays calm far away.

### 2.5 Paint, soot, rust, dirt
- **Paint and soot are palette-index swaps through the 4-step tint tables** (§2.1). See `02-engine-rendering.md` §7.2.
- `Paint(origin, radius 0–5, "explosion"|"spraycan", probability)` has a "Dithering probability between zero and one, default is 1.0". `PaintRGBA(origin, radius, r, g, b, [a], [probability])` is the RGBA variant. [SOURCE] https://teardowngame.com/modding/api.html
- **Rust and dirt are not dynamic.** They are authored through palette shades and the per-shape albedo/blend detail tiles (rust, moss, dust tiles in the atlas, §2.2). [OBSERVED + INFERENCE] https://juandiegomontoya.github.io/assets/teardown/uAlbedoMap.jpg
- Rain puddles are procedural splotches that change roughness on upward-facing surfaces. [SOURCE] https://acko.net/blog/teardown-frame-teardown/

## 3. How breaking works, visually and physically

### 3.1 Hole shapes
- `MakeHole(position, r0, [r1], [r2], [silent])` takes radii in metres for soft, medium and hard materials, with r1 ≤ r0 and r2 ≤ r1. It returns the number of voxels cut ("zero if there were no changes"). The `silent` flag skips break sounds, so **hole carving plays material break sounds by default**. [SOURCE] https://teardowngame.com/modding/api.html
- **Glass hit by the sledge, wiki screenshot (inspected).** [OBSERVED] https://static.wikia.nocookie.net/teardown/images/6/62/Sledgeholeglass.png (page https://teardown.fandom.com/wiki/Sledge)
  - One swing leaves a **clean, round, voxel-stepped disc** in a 1-voxel-thick glass pane.
  - The boundary is a regular staircase circle with **no visible random noise** on the rim.
  - The hole is roughly 2× the hammer head's on-screen width.
  - This suggests an exact sphere carve without edge randomisation, at least for glass.
- **Wooden door after several sledge swings, wiki screenshot (inspected).** [OBSERVED] https://static.wikia.nocookie.net/teardown/images/1/12/Example_of_sledge_work.png
  - The overlapping round carves form one big **irregular opening with jagged, stair-stepped edges**.
  - A torn-off plank piece lies on the floor as a rigid piece, keeping its dark-brown door voxels. It was not turned to dust.
  - The brick wall behind shows bricks with lighter grout and per-voxel shade variation.
- The wiki describes the sledge: "nearby surfaces near the player's crosshair will shatter, and many of the voxels hit will be outright removed." [SOURCE: community wiki] https://teardown.fandom.com/wiki/Sledge
- The shotgun "often [leaves] several holes in walls and surfaces". [SOURCE: community wiki] https://teardown.fandom.com/wiki/Shotgun
- Vanilla tool radii are UNCONFIRMED. Community reimplementation numbers are in `07-gap-numbers.md` §1.3: sledge soft 1.0 m(?), gun 0.35–0.65 m, blowtorch 0.15 m.
- [INFERENCE] Hole edges look rough because of overlap and voxel staircasing, not noise. An optional ±1-voxel jitter on the radius per hit would add variety. Teardown does not appear to need it.
- **Heat:** `AddHeat(shape, pos, amount)` works "similar to blowtorch. As soon as the heat of the voxel reaches a critical value, it destroys and can ignite the surrounding voxels". The blowtorch therefore removes voxels one by one as they cross a heat threshold, not by sphere. [SOURCE] https://teardowngame.com/modding/api.html

### 3.2 What comes off: chunks keep their voxels
- "When objects break apart, the engine will separate them into disconnected chunks, and make a new individual object for each". [SOURCE] https://acko.net/blog/teardown-frame-teardown/
- "When an object breaks, its pieces keep the original palette". [SOURCE] https://blog.voxagon.se/2020/12/03/spraycan.html
- [INFERENCE + OBSERVED door screenshot] There is **no pulverising**. Broken-off pieces are the exact original voxels as rigid bodies. Only voxels inside the carve sphere disappear, replaced visually by particles.
- `SplitShape(shape, removeResidual)`: "small disconnected chunks will be removed during this process to reduce the number of newly created shapes." [SOURCE] https://teardowngame.com/modding/api.html
- `IsShapeBroken`: "a shape can be transfered to another body during destruction, but might still not be considered broken if all voxels are intact." [SOURCE] https://teardowngame.com/modding/api.html

### 3.3 Chip particles (debris FX)
- **Explosion debris chips.** Source is `script/explosion.lua` in a community dump of the game's data folder (authenticity not verified by Tuxedo Labs): [SOURCE: data dump] https://github.com/ForCesCustom/Teardown-data/blob/main/script/explosion.lua
  - colour is grey, `w = rnd(0.2, 0.5)`, the same for r, g and b, so **not tinted by material**;
  - radius is `rnd(0.03, 0.05)` m, so **3–5 cm, smaller than one voxel**, held constant and fading at the end;
  - gravity −10;
  - `ParticleSticky(0.2)`, so chips stick a little to surfaces;
  - rotation ±20 easing out;
  - `ParticleTile(6)`;
  - lifetime `0.5 + r³·3`, so 0.5–3.5 s, most short;
  - speed `(0.4 + 0.6 r³)·vel` plus an upward bias;
  - counts per tier are 25, 50 and 100, at speeds 6, 7 and 10 m/s.
- **Particle atlas tile order** (my reading of Montoya's published `sprite_atlas.png`, a 4×4 grid). [OBSERVED + INFERENCE] https://juandiegomontoya.github.io/assets/teardown/sprite_atlas.png
  - Tiles count **from the bottom-left row upward**.
  - 0 = smoke puff, 4 = soft round dot, 5 = flame, 6 = **solid white square**, 8 = scattered dots.
  - Cross-checks: vanilla fire uses tile 5 with emissive, sparks use tile 4 (emissive orange), wind dust uses tile 8, smoke uses tile 0. https://github.com/ForCesCustom/Teardown-data/blob/main/script/winddust.lua
  - So **debris chips are small square sprites**: tiny "voxel-like" flecks, grey and lit by scene lighting.
- **Tool-hit chips** (sledge or bullet impact particles) are produced by the C++ engine. Count, colour and lifetime are **UNCONFIRMED**. [INFERENCE] They are likely similar small square plain particles, possibly tinted by the hit material. That is not confirmed.
- **Particle API ranges:** `ParticleType("smoke"|"plain")`, `ParticleCollide`, `ParticleSticky`, `ParticleGravity`, `ParticleDrag` and `ParticleAlpha`, each with start/end values and interpolation (linear, smooth, easein, easeout, constant). `SpawnParticle(pos, vel, lifetime)`. [SOURCE] https://teardowngame.com/modding/api.html
- **Dust and smoke on large explosions:** smoke life 3 s, size 1.0, plus a ring of sideways dust at 8–12 m/s. The table is in `07-gap-numbers.md` §2. [SOURCE: data dump] https://github.com/ForCesCustom/Teardown-data/blob/main/script/explosion.lua
- A community porting guide mentions shape tags `fxbreak=l9yellow` (break-FX intensity/lifetime and colour) and `fxsmoke=p3subtle`. Whether these are vanilla engine tags is **UNCONFIRMED** (no other source found). https://steamcommunity.com/sharedfiles/filedetails/?id=2944551630

### 3.4 Tumbling, settling, cleanup
- Resting bodies are deactivated ("bodies that don't move are taken out of the simulation"). Thresholds are UNCONFIRMED. See `03-physics.md` §6. [SOURCE] https://teardowngame.com/modding/api.html
- **Debris threshold.** Query layers `large` ("above debris threshold") and `small` ("below debris threshold") exist. The value is UNCONFIRMED; community claims are 25 or 50 voxels. [SOURCE] https://teardowngame.com/modding/api.html; community figures are in `07-gap-numbers.md` §5.
- **Vanilla level script `debriscleanup.lua`** deletes a broken single-shape dynamic body when all of these hold: more than 20 m from the camera, speed < 1 m/s, every dimension < 10 voxels, and < 200 voxels. See `07-gap-numbers.md` §5. [SOURCE: data dump] https://github.com/ForCesCustom/Teardown-data/blob/main/script/debriscleanup.lua
- [INFERENCE] Very small loose pieces are either deleted at split time (`removeResidual`) or culled later when far or out of view. No source confirms that the engine converts them into particles.

## 4. Connectivity and collapse
These points are already covered in detail in `03-physics.md` §9; the essentials:
- Connectivity is 6-neighbour, by faces: "Voxels touching only through their edges or corners will not stay together in the game". [SOURCE] https://teardowngame.com/modding/
- A piece falls only when it has no face-connected path to static geometry. There is **no load or strength simulation**: "if you … remove almost all of the lower floor, so it's only hangs on a single voxel, it is still connected". [SOURCE] https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt
- Partial collapse is faked with joints between building parts: "We do that for some parts of the buildings". [SOURCE] https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt. Changelog 0.9.0 adds "Plank attachments breaking under heavy stress". [SOURCE] https://teardowngame.com/changelog/
- **Shape `strength`:** "How the object breaks when colliding". **`density`:** "How heavy/buoyant the object is". These are editor-showcase descriptions on the community wiki, which suggests `strength` scales impact damage rather than static load. [SOURCE: community wiki] https://teardown.fandom.com/wiki/Editor_Showcase
- Since 0.7.0, "Large disconnected chunks now fall properly". [SOURCE] https://teardowngame.com/changelog/
- Authoring rule: "Softer materials should never be placed inside or between harder material as they risk becoming loose". Grout should be brick material "in an appropriately lighter color". [SOURCE] https://teardowngame.com/modding/
- `IsStaticShapeDetached(shape)` returns "True if static shape has detached parts". `IsShapeDisconnected` reports whether a shape has detached parts. [SOURCE] https://teardowngame.com/modding/api.html

## 5. Scale perception
- **Player height** is 180 cm on the wiki (character infobox), which is 18 voxels. [SOURCE: community wiki] https://teardown.fandom.com/wiki/Player. A porting guide also says "the player character is 18 voxels tall" and suggests it as a measuring stick. [SOURCE: community] https://steamcommunity.com/sharedfiles/filedetails/?id=2944551630
- **Eye height** is 1.7 m (`defaultEyeY` in an official API example, see `07-gap-numbers.md` §3), which is 17 voxels.
- **FOV** defaults to 90°, adjustable 60–120 (third-party). Scripts can override with `SetCameraFov`. See `06-ai-audio-art-feel.md`.
- **Wall and floor thickness in official levels: UNCONFIRMED.**
  - In the glass screenshot the pane looks **1 voxel thick**. [OBSERVED, low confidence] https://static.wikia.nocookie.net/teardown/images/6/62/Sledgeholeglass.png
  - Community advice is not to make walls one voxel thick; use a supporting or insulating layer. [SOURCE: community] https://progametalk.com/guides/how-to-create-custom-maps-teardown/
- **On-screen size of a voxel** [INFERENCE, computed]: at 90° horizontal FOV and 1920 px width, one 10 cm voxel at distance d covers about `0.1 × 1920 / (2 · d · tan 45°) ≈ 96/d` pixels.

  | Distance | Pixels per voxel (approx.) |
  |---|---|
  | 1 m | 96 |
  | 2 m | 48 |
  | 5 m | 19 |
  | 10 m | 10 |
  | 20 m | 5 |
  | 50 m | 2 |
  | about 100 m | 1 |

  So voxels are plainly visible as cubes within about 10 m and melt into texture beyond about 30 m. That is where TAA and the one-texel-per-voxel detail matter.
- **Levels** are up to about 4,000 voxels (400 m) across. See `02-engine-rendering.md` §2.4. [SOURCE] https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt

## 6. Palette approach and "voxel noise" authoring
- Material is chosen by **palette index range**, not colour ("the actual color … doesn't matter"; index 9 is always grass). The ranges are in `02-engine-rendering.md` §3.1: 16 indices per material for most materials, 8 for hard metal and hard masonry. [SOURCE] https://teardowngame.com/modding/
- So **within one material an author gets 16 (or 8) colour or PBR slots**. Shading variation, such as several shades of the same brick, is done by spreading voxels across those slots. [INFERENCE from the range sizes + official grout advice "brick material, … lighter color"] https://teardowngame.com/modding/
- Palettes are per object but often shared; the Castle level uses one palette for the whole scene. See `02-engine-rendering.md` §2.2. [SOURCE] https://blog.voxagon.se/2020/12/03/spraycan.html
- The engine reserves free slots at load for the tint variants (4 steps each of black, yellow and RGBA tint). With heavy palette use, slots run out and visually similar colours get merged. [SOURCE] https://blog.voxagon.se/2020/12/03/spraycan.html, https://github.com/TTFH/Teardown-Converter
- **Noise sources** available to authors:
  1. Hand-placed shades in MagicaVoxel (manual or MagicaVoxel brushes).
  2. The `texture`/`blendtexture` atlas tiles per shape (§2.2), which is the main automatic per-voxel variation.
  3. The scripted `SetBrush("noise", …)` for runtime drawing.
  4. Voxscript `GetRandom*` at build time.

  [SOURCE] https://teardowngame.com/modding/api.html, https://teardowngame.com/modding/voxscript.html, https://teardowngame.com/changelog/
- The developer calls the palette a limitation: "Restricted by the palette" (GPC 2025, shown with colour banding). The next engine gives "unique properties for each voxel without the need for palettes". See `02-engine-rendering.md` §3.2. [SOURCE] https://80.lv/articles/teardown-creator-is-working-on-a-new-voxel-engine

## 7. Could not confirm
- Vanilla hole radii per tool, and whether any tool randomises hole edges. Screenshots suggest clean sphere carves.
- Tool-impact chip particles (count, colour, tint by material).
- The exact debris threshold. Whether tiny chunks become particles.
- How the detail-texture projection is done (world-space or shape-space axes, tile scale, how `texture_offset` and weight combine with palette colour). The one-texel-per-voxel mapping is sourced; the rest is not.
- The default render or cull distance (`nocull`).
- Wall, floor and door thickness conventions in official levels.
- Whether `fxbreak`/`fxsmoke` are vanilla tags.
- I could not find the GPC 2025 slides PDF in this pass. Slide facts are taken from `02-engine-rendering.md`.

## 8. Takeaways for our renderer and destruction feel [INFERENCE]
1. Keep faces flat with a constant colour per voxel face. Add **per-voxel albedo jitter** (a hash of the voxel coordinate, a few % in value) and optionally a **per-voxel normal tilt** of 2–5°. Add a coarse per-object grime or rust layer sampled at voxel centres, weighted per object.
2. Use a soft bevel through a screen-space normal blur or a cheap edge-normal bend, near the camera only. No outlines.
3. Carve with exact spheres per hardness class. Rough edges come from overlap and the voxel staircase.
4. Detached pieces keep their exact voxels and palette as rigid bodies.
5. Spawn **grey square chips of 3–5 cm** (25–100 per blast, 0.5–3.5 s, gravity −10, slightly sticky), plus smoke and dust puffs.
6. Clean up small, slow, far debris: under 200 voxels, under 1 m/s, more than 20 m away.
7. Implement soot and spray as palette or tint-index swaps in 4 steps with dithered probability.
