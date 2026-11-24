# Teardown: Engine and Rendering, a Technical Research Dossier

Scope: the voxel data model, the renderer, materials, lighting, and visual damage in *Teardown* (Tuxedo Labs, lead and engine programmer Dennis Gustafsson). This file feeds a report on building a similar voxel-destruction game. Physics, networking, and gameplay are covered only where they shape rendering.

Confidence labels used below:
- **[DEV]**: Dennis Gustafsson's own words (blog, talk slides, podcast, interview), or official Tuxedo Labs docs.
- **[RE]**: reverse engineering from a frame capture (RenderDoc or apitrace) by a third party.
- **[DATA]**: read by me directly from an official file (the shipped `teardown_palette.vox`, the Lua API docs, the Steam API).
- **UNCONFIRMED**: plausible, but no primary source found.

---

## 0. Primary sources and how far to trust them

| Source | Type | Date | Notes |
|---|---|---|---|
| Gustafsson & Rundlett, *"Raytracing Voxels in Teardown and Beyond"*, Graphics Programming Conference, Breda. Slides (PDF, 63 pp.): https://static.graphicsprogrammingconference.com/public/2025/talks/raytracing-voxels-in-teardown-and-beyond/Rundlett-Gustafsson-raytracing-voxels-in-teardown-and-beyond.pdf; abstract: https://graphicsprogrammingconference.com/archive/2025/ | DEV talk | Nov 2025 | Most authoritative. Slides are mostly images, which I rendered and read. No video is listed in the archive. The slides themselves cite the two frame breakdowns below as "Frame breakdown", which effectively endorses them. |
| Steven Wittens, *"Teardown Frame Teardown"*: https://acko.net/blog/teardown-frame-teardown/ | RE (1080p capture) | 24 Jan 2023 | Pass-by-pass analysis. Calls the game an "ordinary" OpenGL application. |
| J. D. Montoya, *"Teardown Teardown"*: https://juandiegomontoya.github.io/teardown_breakdown.html | RE (2560×1440, max settings) | Feb 2022 | Gives render-target formats, GLSL function names, and constants. |
| Voxagon (formerly Tuxedo Labs) blog: https://blog.voxagon.se/ (blog.tuxedolabs.com now 301-redirects there) | DEV | 2017–2026 | Key posts: *From screen space to voxel space* (2018), *The importance of good noise* (2018), *Teardown quicksave* (2020), *The Spraycan* (2020), *Teardown design notes* (2020), *Year summary* (2024), *Teardown Multiplayer* (2026). |
| Software Engineering Daily ep. 1772 transcript: https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt | DEV podcast | Dec 2024 / Jan 2025 | |
| Official modding docs: https://www.teardowngame.com/modding/ ; Lua API: https://www.teardowngame.com/modding/api.html ; official palette: https://www.teardowngame.com/modding/downloadable/teardown_palette.vox | DEV/DATA | current (API 2.x) | |
| Game Developer (GDC Twitch interview summary): https://www.gamedeveloper.com/design/how-beautiful-voxels-laid-the-way-for-i-teardown-s-i-heist-y-framework | DEV quotes | 2020 | |
| 80.lv interview: https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech | DEV | Mar 2026 | |
| PCGH tech test (German): https://www.pcgameshardware.de/Teardown-Spiel-73677/Specials/PC-Game-Test-Benchmark-Voxel-Dynamic-Destruction-1394545/ | Press | 2020 | Mostly paraphrases the 2018 blog post. Contains errors (for example, it claims dynamic GI, which Gustafsson denies). |

---

## 1. Engine overview and graphics API

- **Custom C++ engine.** Gameplay is in Lua, and the engine is written by Gustafsson, with "small third-party libraries for compression and image loading" [DEV, SE Daily]. Work began in early 2018 [PCGH], after Mediocre closed in 2017 (https://en.wikipedia.org/wiki/Teardown_(video_game)). Releases: Early Access 29 Oct 2020; 1.0 on 21 Apr 2022; PS5/Xbox Series on 15 Nov 2023; multiplayer 12 Mar 2026.
- **API, original:** OpenGL. The GPC slide shows the OpenGL logo, and Gustafsson said "I wrote the graphics using the OpenGL API" [DEV]. Montoya identifies **OpenGL 3.3**, with "no hardware-accelerated ray tracing and no compute shaders. Almost all effects run in fragment shaders" [RE]. Acko also calls it "an 'ordinary' OpenGL application" [RE].
- **API, consoles:** "It's actually a D3D12", ported by Saber Interactive [DEV, SE Daily].
- **API, PC:** **Teardown 1.5 (15 Nov 2023) added DirectX 12** ("With it comes DirectX 12, massive performance improvements", from the official Steam announcement via the Steam news API). The community changelog for 1.5.1 says "Players can now choose between DX 12 and OpenGL rendering" and "Fixed problem with shadow limitation" (https://teardown.fandom.com/wiki/Updates, community-maintained). A later 1.5.x note reportedly says a *"DX12 shadow volume max cap affected mods with larger shadow volumes"*, and the team "reverted the global rule so OpenGL keeps the previous behaviour". I found that only in a search snippet, so it is **UNCONFIRMED** wording.
- **Upscaling:** **NVIDIA DLSS and AMD FSR were added on 3 Nov 2026** (Steam announcement "More frames. More destruction. DLSS and FSR are here!", under Options/Graphics/Upscaling). A secondary report of the official FAQ says the options require the DX12 renderer, and that FSR is 4.1.1 on ML-capable hardware with a 3.1.5 fallback (https://windowsforum.com/news/teardown-adds-dlss-and-fsr-upscaling-directx-12-requirement-and-gpu-support.451421/). The version numbers are **UNCONFIRMED from a primary source**. TAA remains the default AA.
- **No hardware ray tracing.** Everything is software ray marching through voxel volumes in fragment shaders [DEV GPC abstract: "an unconventional raytracing technique that runs well on older GPUs"].
- **Requirements (Steam API, current):** minimum is a GTX 1060 "or similar. 4 Gb VRAM", a quad-core CPU, and 8 GB RAM. Recommended is a GTX 1080 and Core i7. "Integrated graphics cards not supported." Gustafsson in 2020 named the GTX 1070 as the "lowest recommended" card [DEV, Game Developer].
- **No global illumination:** "Teardown actually doesn't implement global illumination (light does not bounce off surfaces), but we use raytracing for ambient occlusion, soft shadows and specular occlusion" [DEV, 80.lv]. "No global illumination" is also listed as a limitation in the GPC slides. He attributes this to the renderer predating hardware RT.
- **"There are no triangles in this game."** "Apart from water surfaces and power lines … Everything is volumetric data" [DEV, Game Developer]. Note that each voxel object's bounding box *is* rasterized as 12 triangles (§4.1).
- **Simulation rate:** script `update()` runs at a fixed 60 Hz (dt 0.0166667), at most twice per frame. `tick()` runs per frame with dt ≤ 1/30 [DEV, modding docs]. Physics presumably runs at the same fixed step (**UNCONFIRMED**).

---

## 2. Voxel scale, storage, and world limits

### 2.1 Voxel size
- **10 cm per voxel** at the default scale: "1 voxel is 10 centimeters" [DEV, SE Daily]. `GetShapeSize()` returns `scale`, "the size of one voxel in meters (with default scale it is 0.1)" [DATA, Lua API]. The GPC slides imply the same (4000 voxels ≙ 400 m).
- The 2018 prototype used a 5 cm shadow-texture resolution ("Texture resolution: 5 cm. Octant bits each represent a 10 cm cube"), from *From screen space to voxel space* (https://blog.voxagon.se/2018/10/17/from-screen-space-to-voxel-space.html). The shipped game uses 10 cm voxels.

### 2.2 Shapes (per-object voxel volumes)
- The world is **"thousands of smaller volumes that are filled with voxels"**, and "Everything is straight within its own volume" [DEV, Game Developer]. Each **shape** has its own local grid with an arbitrary rigid transform, so objects can rotate freely: "each object is on its own grid" [DEV, SE Daily]. Bodies own one or more shapes.
- **Dense storage:** "Teardown uses a dense voxel format, where every shape stores voxel data in an uncompressed, regular 3D grid … regions of empty space within an object take up the same amount of memory as regions that actually contain voxels" [DEV, Year summary 2024: https://blog.voxagon.se/2024/12/29/year-summary.html]. "Sparse shapes are very inefficient" is the first limitation in the GPC slides, illustrated with a diagonal staircase in a huge mostly empty box.
- **Per-voxel data = 1 byte**, a palette index where 0 means empty [DEV, Spraycan post: https://blog.voxagon.se/2020/12/03/spraycan.html; RE, acko]. "Each object is stored as a 3D volume texture, with one byte per voxel … indexes into a 256-entry palette consisting of both color and material properties" [RE, acko].
- **Size limit:** "Each individual object can be a maximum of 256 × 256 × 256 voxels". "Objects of half that size … (128 × 128 × 128) are generally OK", and "very big but flat objects are also OK, i.e., 256 × 256 × 10". "A house should never be built in one single object" [DEV, modding docs]. Splitting objects "helps the engine avoid spending time traversing empty space inside objects".
- **Connectivity rule:** voxels touching only by edge or corner "will not stay together", so connectivity is 6-neighbour (face) [DEV, modding docs].
- **GPU representation:** one 3D texture per shape. **Dimensions are padded to multiples of 4** to support **2 extra mip levels** (½ and ¼ size). These let the tracer skip empty 2×2×2 and 4×4×4 blocks. Objects are centred in the padded volume, leaving 1–2 empty voxels per side [RE, acko]. Montoya: a "modified voxel DDA that uses mipmaps to form a dense octree to accelerate empty space traversal" [RE]. The per-object 3D-texture format (likely R8/R8UI) is **UNCONFIRMED**.
- **Palettes on GPU:** "packed into a GPU texture that is 256 in width and number of materials in height", one row per palette [DEV, Spraycan]. Colour and material palettes are "each packed into one large texture" [RE, acko]. The palette row is passed as a uniform [RE, Montoya]. The GPC slide 4 shows a box with a ray entering it and a palette column beside it.
- **Palette sharing:** "Objects can have unique palettes, but many share one. When an object breaks, its pieces keep the original palette" [DEV, Spraycan]. The Castle level uses a single palette for the whole scene.
- **Physics representation** is a separate structure, "generated at load time from the main voxel data" and not saved [DEV, quicksave post: https://blog.voxagon.se/2020/11/18/teardown-quicksave.html]. PCGH summarises this as separate voxel structures for display, the RT acceleration structure, shadows, and physics.

### 2.3 Scene scale
- "The larger levels contain roughly half a billion voxels" in "thousands of individual voxel volumes, each with anything from a couple of hundred up to millions of voxels" [DEV, quicksave]. The scene holds "hundreds of millions of voxels" [DEV, SE Daily].
- Quicksaves store the whole world state, RLE-compressed to "15–20% of original size", which is "around 80 Mb" on larger levels. Shipped missions are zlib-compressed at bake time to "about 20 Mb per mission" [DEV, quicksave]. Multiplayer full-scene serialization is "30–50 MB is common, often more" [DEV, multiplayer post: https://blog.voxagon.se/2026/03/13/teardown-multiplayer.html].

### 2.4 The world "shadow volume" and level-size limits
This is the core acceleration structure for all secondary rays (§4.5).
- It is a **single large axis-aligned 1-bit occupancy volume** for the whole level, built by rasterizing all transformed shapes into it ("4 objects, individually transformed → Single large axis-aligned volume") [DEV, GPC slide 13].
- It holds **no colour or material**: "I don't have access to any colors in that data structure" [DEV, Game Developer]. "Represent each voxel as a single bit … It's super fast to just traverse the bits in that grid" [DEV, SE Daily].
- **Packing: "2x2x2 = 8 voxels per byte".** Example from the largest level: **4000 × 3400 × 290 voxels = 4 billion voxels → 2000 × 1700 × 145 bytes ≈ 500 MB VRAM** [DEV, GPC slides 14–15]. At 10 cm this is 400 × 340 × 29 m. Which level that is remains **UNCONFIRMED** (it shows a city with high-rises).
- Observed sizes [RE]: Marina is a 1752×100×1500 texture, "a 262MB chonker", effective 3504×200×3000 voxels (acko). Another level (unnamed) is 1252×128×1252, "over 200 MB" (Montoya).
- **Mips:** there are two extra mip levels, plus a **"-1" level packed inside the bits** of each byte, which "requires a custom loop to trace through it" [RE, acko]. The 2018 prototype describes the same scheme: base octant bits, a byte level, plus 2 mips, "four levels including the octant bits", for 256+32+4 = 292 MB [DEV, 2018 blog].
- **Updates are CPU-side:** "Objects are rasterized into the world texture on the CPU, and the affected regions are uploaded with `glTexSubImage3D`. Several simultaneously moving objects are clustered and sent in larger chunks" [DEV, 2018]. In an explosion frame acko counted "~50 individual updates … multiplied by 3 for the 3 MIP levels". Gustafsson: "The ray tracing is not on the CPU … It's only the update of this shadow volume" on the CPU. Large moving objects are "pretty expensive to update because there's just so many voxels moving". Updates run in the background and parallelise well [DEV, SE Daily].
- **Maximum level size:** "We couldn't have more than 4,000 voxels across the world" [DEV, SE Daily]. That is AMD's 3D-texture limit, and since 2×2×2 packing halves the texture dimension, a 2048-texel max gives about 4000 voxels. The Frustrum level had to be cut to 400 m "due to a 3D texture size limitation on AMD graphics cards" [DEV, design notes: https://blog.voxagon.se/2020/11/05/teardown-design-notes.html]. GPC slide: "Shadow volume implies a maximum level size".

---

## 3. Materials and the palette

### 3.1 Physical material by palette index (authoritative mapping)
"These indices are used in Teardown to decide what material any individual voxel is made of … Only the position in the palette is important … the color at index 9 is always grass … wood group (indices 57–72)" [DEV, modding docs].

I parsed the official `teardown_palette.vox` (MagicaVoxel 0.99.7 format) [DATA]. Its `NOTE` chunk carries 32 row labels, one per 8-entry palette row, listed bottom-up. Resolved through the file's `IMAP` (display-order) chunk, the rows map cleanly to the ranges below. This matches the docs' "index 9 = grass" and "wood 57–72".

| Palette indices | Material (row label) | Hardness [docs] | Default look in official palette (MagicaVoxel MATL) |
|---|---|---|---|
| 1–8 | **glass** | soft | 4× `_glass` (alpha 0.01), plus 4× **`_emit`** (emit 1, flux 2), so the "glass" row also hosts the emissive lamp colours |
| 9–24 | **grass** (foliage) | soft | metal-type, rough 0.25, metal 0 |
| 25–40 | **dirt** | soft (blowtorch ✗) | rough 0.6 |
| 41–56 | **rock** | **unbreakable** | rough 0.35 |
| 57–72 | **wood** | soft | rough 0.25 |
| 73–88 | **concrete** | medium | rough 0.5 |
| 89–104 | **brick** | medium | rough 0.75 |
| 105–120 | **plaster** | soft (blowtorch ✗) | rough 0.7 |
| 121–136 | **weak metal** | medium | 121–128: metal 1.0 / rough 0.15; 129–136: metal 0.5 / rough 0.4 |
| 137–152 | **heavy metal** | **unbreakable** | same split as weak metal |
| 153–168 | **plastic** | soft | rough 0.25 (blues, reds, yellows) |
| 169–176 | **hard metal** | hard (explosives only) | metal 0.25 / rough 0.4 |
| 177–184 | **hard masonry** | hard (explosives only) | rough 0.5 |
| 185–224 | reserved | – | black `_diffuse` |
| 225–240 | **unphysical** | – | black `_diffuse` |
| 241–255 | reserved | – | black `_diffuse` |

- **Tool and hardness table** [DEV, modding docs]:
  - Glass, Grass, Plastic, Wood: soft; sledge ✓, blowtorch ✓, guns ✓, explosives ✓.
  - Dirt, Plaster: soft; sledge ✓, blowtorch ✗, guns ✓, explosives ✓.
  - Concrete, Brick: medium; sledge ✗, blowtorch ✗, guns ✓, explosives ✓.
  - Weak Metal: medium; blowtorch ✓, guns ✓, explosives ✓.
  - Hard Masonry, Hard Metal: hard; explosives only.
  - Heavy Metal, Rock: unbreakable.
- **`MakeHole(pos, r0, r1, r2)`** has three radii [DATA, Lua API]:
  - "Soft materials: glass, foliage, dirt, wood, plaster and plastic."
  - "Medium materials: concrete, brick and weak metal."
  - "Hard materials: hard metal and hard masonry."
  - r1 ≤ r0 and r2 ≤ r1.
  - So damage is a per-hardness-class sphere carve.
- **Unphysical** voxels are rendered but excluded from physics. `GetShapeMaterialAtPosition(..., includeUnphysical)` defaults to ignoring them [DATA, Lua API]. Their exact use (decals, snow, wires?) is **UNCONFIRMED**.
- **Reserved slots** are plausibly where load-time paint variants go (§7.2). **UNCONFIRMED.**
- "Unbreakable objects" in levels are limited to "rock formations and the ground you're standing on" [DEV, design notes].
- Per-shape **density** and **strength** properties exist on top of the material [DATA, Lua API `GetProperty(shape, "density"/"strength")`].
- A hard-in-soft authoring rule follows from the physics: soft grout between bricks gets stuck when broken, so "make the grout out of the brick material" [DEV, modding docs].

### 3.2 Render properties per palette entry
- Each palette entry defines "color, roughness, emissiveness, reflectivity, and physical type" [DEV, Spraycan]. The Lua API exposes `type, r, g, b, a, reflectivity (0–1), shininess (0–1), metallic (0–1), emissive (0–32) = GetShapeMaterial(shape, entry)` [DATA].
- The **G-buffer material target** carries R = reflectivity [0,1], G = smoothness (1−roughness), B = metallic, A = emissive [0,32] [RE, Montoya]. Acko: "Reflectivity and metallicness are separate channels."
- **Authoring in MagicaVoxel** [DEV, modding docs]:
  - Use type **Metal** for almost everything. "Diffuse is the same as Metal with max roughness."
  - Glass and Emit are the exceptions.
  - Metallic "also controls the reflectivity". "Only very low metallic values are ever used, and only for raw metal objects. For painted metal Metallic 0 should be used."
  - **Emissive** "doesn't actually light up the scene". It needs Emission *and* **Power ≥ 2** to look emissive.
  - **Glass:** "The transparency value only matters whether it is 100 or not". The HSV *value* of the colour sets the tint strength, and roughness is ignored.
  - "The appearance of the materials does not match 1:1 between MagicaVoxel and Teardown."
  - The exact conversion from MagicaVoxel `_rough/_metal/_emit/_flux` to Teardown's reflectivity/shininess/metallic/emissive is **UNCONFIRMED**.
- Version 1.3.0 added support for the MagicaVoxel 0.99.7 "mirror" material property (community changelog, fandom). Tested MagicaVoxel versions run "up to 0.99.6.4" [DEV, docs].
- **Five appearance classes** per the docs: dull metal, shiny metal, diffuse, emissive, glass.
- **Surface detail textures:** blend, albedo, and normal maps are projected onto voxels at one texel per voxel [RE, Montoya]. The editor exposes a per-shape `texture` property (the docs show a tooltip for it on *small_junk1*). This is what gives brick, wood grain, and similar micro-detail beyond flat colour.
- **Limitation:** "Restricted by the palette" (GPC slide 28; a top-down shot shows colour banding). The next engine has "unique properties for each voxel without the need for palettes" (https://80.lv/articles/teardown-creator-is-working-on-a-new-voxel-engine).

---

## 4. Rendering pipeline, pass by pass

The order below combines Montoya's table of contents (Feb 2022, 1440p) with acko (Jan 2023, 1080p). Both are OpenGL captures. The GPC slides cite both breakdowns as the reference frame breakdown.

| # | Pass | Resolution | Notes |
|---|---|---|---|
| 0 | State reset; shadow-volume sub-uploads interleaved mid-render | – | CPU-rasterized updates, ×3 mips |
| 1 | **G-buffer**: voxel objects (OBB raster + DDA), then cables, smoke/particles, rain/snow, water | full | front-to-back, custom early-Z |
| 2 | Focal-plane estimate | 1×1 RG16F | golden-ratio spiral depth samples, 20% blend per frame |
| 3 | **Normal blur** (bevel look) | full | spiral filter; affects nearby similar-depth pixels |
| 4 | **Lighting**: ambient/AO, sun, local lights (proxy meshes) | full | stochastic, 1–2 rays per pixel |
| 5 | **Irradiance denoise** | full | 12-tap Poisson/spiral bilateral, then temporal |
| 6 | Albedo/emissive modulation | full | lighting demodulated until here |
| 7 | **Volumetric lighting** (fog, light shafts) | **½ × ½** | per-step shadow rays |
| 8 | Volumetric denoise | ½ | 50/50 temporal plus bilateral |
| 9 | **Specular reflections** | full | traced in the shadow volume |
| 10 | Specular denoise | full | temporal only |
| 11 | **Composite** plus height/depth fog plus skybox | full | |
| 12 | Sprites (lamp/sun glare) | full | no depth test, shown if the light centre is visible |
| 13 | **Auto-exposure** | 256² → mips | 1×1 result |
| 14 | **TAA** | full | 4th temporal reprojection in the frame |
| 15 | Motion blur (optional) and **DOF** | DOF at ½ | |
| 16 | **Bloom** | ½ down to ~8 px | |
| 17 | Final post: bloom, exposure, saturation, colour balance, tonemap, gamma; optional lens distortion and dirt | full | single shader |
| 18 | UI | full | SDF font atlas |

No official per-pass GPU timings exist. Neither breakdown profiled the game, and Montoya's "Part 2" on performance was never published.

### 4.1 Primary visibility: rasterized boxes plus fragment-shader DDA
- "Each object's bounding box is rasterized, then **raymarched in a fragment shader** to see which voxel you hit" [DEV, Game Developer 2020].
- GPC slides 4–6 show a box with a ray entering it, and cite **"Fast Voxel Traversal Algorithm, Amanatides & Woo (1987)"**. Slides 7–10 show per-object OBBs (yellow wireframes) and frustum culling.
- **One draw call per object**: "Every draw call renders exactly 36 vertices, i.e. 12 triangles, making up a box … each with a unique 3D texture bound" [RE, acko]. Montoya says *back faces* of the OBB are rasterized, so the box is still drawn when the camera is inside it.
- The ray is transformed to object space and DDA-stepped. Mip levels 1 and 2 (2³ and 4³ blocks) are used for empty-space skipping, like a "dense octree" [RE].
- On hit, the shader writes **`gl_FragDepth`** (real voxel depth) and the G-buffer.
- **Custom early-Z** is needed because writing `gl_FragDepth` disables hardware early-Z. Objects draw front-to-back, and linear depth (RT4) is **copied a few times per frame at "checkpoints" (8 in acko's frame)**. The tracer reads the copy and rejects fragments behind already-written depth before marching [RE, acko and Montoya]. Acko says this pays off on the Evertides Mall map. Montoya suggests `glTextureBarrier` as an alternative.
- Frustum culling is CPU-side. No occlusion-query or HZB culling is documented (**UNCONFIRMED**).
- **Voxel normals:** derivation is not documented. The face normal of the DDA step axis is the obvious choice (**UNCONFIRMED**). Normal-map detail is projected per voxel, and a **screen-space normal blur** pass softens voxel edges for a bevelled look [RE].

### 4.2 G-buffer layout [RE, Montoya formats; acko channel usage]

| RT | Format | Content |
|---|---|---|
| 0 | RGB16_UNORM | Albedo |
| 1 | RGB8_SNORM | Normal |
| 2 | RGBA16_FLOAT | R reflectivity, G smoothness, B metallic, A emissive (0–32) |
| 3 | RGB16_FLOAT | RG motion vectors, B reactive/water mask |
| 4 | R16_UNORM | Linear depth (used for custom early-Z) |
| DS | D32 | Hardware depth |

Acko notes the depth buffer as 16-bit (likely the linear-depth RT).

### 4.3 Non-voxel geometry drawn into the G-buffer
- **Cables, ropes, and wires** are the only classic geometry: billboarded triangle lists drawn in one call after solids [RE].
- **Water** is map-wide, drawn as quads (one per water plane) at the end of the G-buffer pass [RE, Montoya]:
  - static foam layer plus **up to 64 distorted foam splashes**, from a single foam texture
  - ripples via normal offsets
  - the albedo buffer is copied before refraction (acko)
  - only effect that writes the reactive mask
  - water planes cannot move at runtime [DEV, docs]
  - Lua water properties: depth, wave, ripple, motion, foam, color
  - 1.4.0 "Improved water shading" (community changelog)
- **Rain and snow** are several thousand camera-facing billboards with CPU-computed orientation and dithered transparency. Rain splashes are perpendicular ground quads. Snow has no impact effect [RE, Montoya]. Puddles and wetness are environment parameters (§5).
- **Smoke and particles** come in two types [DATA, Lua API]:
  - **Plain** billboard particles, "simulated with gravity and velocity", used for fire, debris, rain, snow.
  - **Smoke**, "simulated with fluid dynamics internally and rendered with some special tricks". Wikipedia attributes the smoke fluid system to Gustafsson's *Sprinkle* code.
  - Rendering trick [RE]: each smoke particle is a 4-triangle hollow pyramid facing the viewer. Every other pixel's normal is reflected about the view vector to fake scattering (acko: normals alternate forward/backward). Alpha is blue-noise-dithered and resolved by TAA.
  - Particles are lit by the same deferred lighting, so smoke receives raytraced shadows.
  - The atlas has 16 tiles (`ParticleTile` 0–15). `ParticleEmissive` is used for fire and embers.
  - Smoke simulation runs on the CPU [RE, acko].
  - 1.5.1 added a particle-density option.
- **Transparency (glass, smoke, fades)** is **stochastic screen-door**: a 50% pattern for glass, blue-noise thresholding for other opacities, resolved by TAA [RE]. In Gustafsson's words: "I'm trying out dithered (blue noise) transparency in the voxel raytracing pipeline. Works surprisingly well together with TAA and gives much nicer reflections. The only issue is that the denoiser understandably gets very confused" [DEV, tweet 2019, https://x.com/voxagonlabs/status/1138555634503360513]. Ghosting on windows is the visible cost (acko). The Spraycan post says "transparency blending works poorly in the engine".

### 4.4 Secondary rays: three trace qualities through the shadow volume
GPC slides 21–24 [DEV]:
- **High-quality trace:** exact DDA (Amanatides & Woo) through the bit volume. Watertight.
- **Medium-quality trace:** fixed-step sampling along the ray. This can skip corner voxels (slide marks a "?"), giving artifacts such as light leaks and jaggy reflections (slide 23 shows a reflection artifact under a sign).
- **Low-quality trace:** step size grows with distance, switching to coarser mips. It is effectively a cone trace (slide 24).

In shader code these correspond to `raycastShadowVolume`, `raycastShadowVolumeSparse`, and `raycastShadowVolumeSuperSparse` [RE, Montoya]. Acko calls the last one "a few steps per MIP level, a rough cone-trace". The 2018 post describes the same idea: "supercover" traversal for watertight shadow rays, and the cheaper fixed-step method for AO and fog. It also says to start at the finest level and move to coarser levels while empty [DEV].

### 4.5 Lighting pass (deferred, stochastic, demodulated)
All secondary visibility uses the 1-bit world volume, never the per-object textures. Quality settings presumably pick the trace mode and ray counts; the mapping of in-game settings to passes is **UNCONFIRMED**.

- **Ambient/AO** [RE]:
  - **2 cosine-weighted hemisphere rays per pixel**, super-sparse trace, **max length 24 units**.
  - Unoccluded rays add the ambient (sky) constant, so the output is *ambient irradiance*, not an AO factor.
  - The ray origin is jittered and offset along the normal "to hide voxel artefacts". A **one-voxel screen-space step** adds small-scale occlusion (acko).
  - The 2018 blog used 5 rays per pixel and offset the origin by normal and ray direction to fix acne, with "short-range screen-space tracing" for fine detail [DEV].
- **Sun** [RE]:
  - **1 shadow ray per pixel** toward the sun, jittered within `sunSpread` (0 at midday, about 0.02 at dawn/dusk in the analysed levels), so penumbra width is constant.
  - Uses the sparse trace, with ray length set by `sunLength`.
  - The sun direction defaults to the brightest skybox texel.
- **Local lights** [RE]:
  - Light volumes are drawn as **proxy meshes**: hemisphere, sphere, capsule, cone. Front-face culling, no depth test.
  - Each pixel casts **1 shadow ray to a random point on the light's surface** using the sparse trace, which gives true area-light soft shadows.
  - Inverse-square falloff. Cone and area lights add cosine terms (cone 2, area 1).
  - **Types:** sphere (fires, bare lamps); cone/spot (covered street lights, headlights, flashlight); capsule (exit signs, tubes); area/rectangle (ceiling panels); **screen** (TVs and cinema screens, modulated by the screen texture).
  - The 2018 prototype example used a 30 cm light radius and about 10 lights with fog at 1080p.
- **Emissive voxels do not emit light.** Separate lights are placed by hand, often parented to the emissive shape. "If a light source is owned by a shape, the intensity … is scaled by the emissive scale of that shape. If the parent shape breaks, the emissive scale is set to zero and the light source is disabled" [DATA, Lua API]. So shooting a lamp kills its light.
- **Denoising** [RE]:
  - Spatial: 12 Poisson/golden-spiral taps, bilateral-weighted by planar (tangent-plane) depth and normal.
  - Temporal: reproject with motion vectors, **clamp history to the current neighbourhood min/max**, blend 50/50.
  - The result is multiplied by albedo, plus emissive.
  - Gustafsson: "I denoise by spatial blurring and temporal accumulation" [DEV, noise post].
- **Specular occlusion** comes from the same voxel tracing [DEV, 2018 and 80.lv].

### 4.6 Reflections
- A full-screen pass runs for reflectivity > 0. It casts a world-space ray in the reflection direction, jittered by roughness, **up to 32 units**, through the shadow volume (sparse or super-sparse by setting) [RE, Montoya].
- On hit, if the hit point is **visible on screen**, use its lit screen colour; if off-screen, treat it as occluded. On a miss, use the skybox/cubemap [RE]. Acko calls this "screen-space reflections traced through the volumetric shadow map, not the 2D Z-buffer", which fades at screen edges. Zero-reflectivity voxels are skipped.
- **Denoise:** temporal only, with blend weighted by reflectivity change. Glossier surfaces accumulate more slowly [RE].
- Gustafsson describes this as SSR "rather than full path tracing … mainly for performance" [DEV, Game Developer]. The 2018 post says: screen-space where available, fade to black elsewhere, plus voxel-traced specular occlusion.
- **Composite:** metallic specular is tinted by albedo. Diffuse and specular are blended by reflectivity, with Fresnel folded into the alpha [RE].

### 4.7 Volumetric light and fog
- **Rendered at half width × half height** [RE, both]. Light proxies are drawn again, and the shader ray-marches camera → depth. At each (jittered) step it casts a visibility ray to a random point on the light, and only when the contribution is significant (acko). The sun covers the full screen.
- Denoised with a 50/50 temporal pass and a depth-aware bilateral (no normal weight) [RE].
- Per-light `fogscale` and `fogiter` properties, and environment `sunFogScale`, control it [DATA].
- **Distance/height fog** is applied in composite. It depends on the *view-ray's vertical direction*, not world height, which is cheaper (acko). The environment `fogParams` takes start, end, amount, and exponent (§5).
- PCGH notes coarse steps can cause light bleeding.

### 4.8 Post-processing
- **Auto-exposure** [RE]: luminance at 256×256, then a mip chain. Mip 6 (4×4) is sampled in an X pattern with more weight in the centre. Target = scene `brightness` / luminance. Actual exposure lerps toward it with **α = 0.05** per frame, clamped by the environment `exposure` min/max, and stored in a 1×1 texture.
- **TAA:** a TXAA-like variant [RE]:
  - per-frame sub-pixel jitter in the projection matrix
  - plus-shaped neighbourhood min/max
  - blend factor raised by velocity and the reactive (water) mask
  - history clamped when the blend factor is high
- **Bloom** [RE]: thresholded half-res source, downsampled repeatedly to about 20×11 (from 1440p) or about 8 px, with separable **7×7 Gaussian** blurs per level, then summed. 50% temporal accumulation. Bloom scale is 1.0 by default.
- **DOF** [RE]:
  - Focal distance comes from the 1×1 spiral-sampled centre depth, blended over time.
  - CoC is stored in alpha. Half-res blur with foreground masking.
  - The 2×2 downsample with blue-noise jittered upsample runs even with DOF off, to smooth screen-door noise (acko).
  - Gustafsson's single-pass bokeh DOF post (2018: https://blog.voxagon.se/2018/05/04/bokeh-depth-of-field-in-single-pass.html) is likely related (**UNCONFIRMED** that it ships).
  - Lua `SetCameraDof(distance, amount)` forces it on.
- **Motion blur:** optional, **up to 10 samples per pixel** along saved motion vectors [RE]. Lua has `DisableMotionBlur()`.
- **Final shader order** [RE, Montoya]:
  1. bloom (scale 1.0)
  2. exposure
  3. **saturation**
  4. **colour balance** (RGB multipliers)
  5. tonemap **`1 − exp(−c)`**
  6. **gamma 2.2 × user factor**
  - Then: optional **lens/barrel distortion**; **lens dirt** only when the sun is visible (static overlay); vignette not documented.
  - Post-processing properties (saturation, colorbalance, brightness, gamma, bloom) are scriptable via `SetPostProcessingProperty` [DATA].
- **Extras:**
  - Third-person ghosting of occluders.
  - Vehicle outline: solid-white offscreen render, then edge detection (acko).
  - `DrawShapeOutline` / `DrawShapeHighlight` in Lua.
  - Sun and lamp glare sprites (`sunGlare`, per-light `glare`).

### 4.9 Noise and sampling
- A **512×512 blue-noise texture**, mapped 1:1 to pixels with no filtering, animated per frame by adding the golden ratio: `noise = mod(blueNoise + GOLDEN_RATIO*frameNumber, 1.0)` with `frameNumber % 100`. For multi-channel noise it uses an RGB blue-noise texture with *different* irrational offsets per channel (R2 sequence) [DEV, https://blog.voxagon.se/2018/12/07/the-importance-of-good-noise.html].
- "Blue noise, animated in a quasi-random sequence using the golden angle … what I use for everything that jitters" [DEV, tweet https://x.com/voxagonlabs/status/1052838704320933889].
- Acko observed blue noise plus Martin Roberts' R-sequences for 1D/2D/3D time-varying samples [RE].
- Stochastic rendering is used for transparency, particles, lighting, and reflections (Gustafsson, 2022 tweet, seen only in a search snippet; wording **UNCONFIRMED**). It relies on TAA plus four separate temporal reprojections per frame (irradiance, volumetrics, specular, TAA).

---

## 5. Lighting and environment authoring (sun, sky, fog, weather)

**Environment** properties are the same set in the editor XML `<environment>` and in Lua `SetEnvironmentProperty`. Descriptions come from the community docs (https://script-session.gitbook.io/teardown/teardown-unofficial-documentation/xml-mapping-tags) and the official API, which says "exactly the same as in the editor, except for 'snowonground'" [DATA]:

| Group | Properties |
|---|---|
| **Sky** | `skybox` (DDS cubemap in data/env; custom ones are made with the official `skybox-dds.zip` tool); `skyboxtint`; `skyboxbrightness`; `skyboxrot` (Y rotation, which also rotates the sun) |
| **Ambient** | `ambient` ("how much the skybox lights the scene"); `ambientexponent` exists but its meaning is **UNCONFIRMED** |
| **Sun** | `sunBrightness`; `sunColorTint` (multiplied with the brightest skybox spot); `sunDir` (0 means auto from the brightest skybox texel); `sunSpread` (divergence; "0.05 blurs shadows 5 cm per meter"); `sunLength` (max shadow-ray length, lower is faster); `sunFogScale` (sun volumetrics); `sunGlare` |
| **Fog** | `fogColor`; `fogParams` = start, end, amount, exponent ("higher means steeper falloff along Y") |
| **Exposure** | `exposure` (min, max); `brightness` (target scene brightness for auto-exposure) |
| **Weather** | `wetness`, `puddleamount`, `puddlesize`, `rain`; snow properties (`snowdir`, `snowamount`, `snowonground`; names from community sources, **UNCONFIRMED** semantics); `wind` (Lua `GetWindVelocity` exists) |
| **Misc** | `nightlight` (false removes lights tagged "night"); `ambience` (sound) |

- Adjustable weather and time of day in sandbox arrived in 0.8.0 (Oct 2021, Steam announcement). **"Procedural snow"** and a "Terrain rework" arrived in 0.9.0 (Dec 2021, community changelog). Whether snow-on-ground is generated as voxels (perhaps the "unphysical" range) or as a shading layer is **UNCONFIRMED**.
- **Light entity properties** [DATA, Lua API]: `type`, `color`, `intensity`, `size` (number, or a vector for area lights), `reach`, `unshadowed`, `fogscale`, `fogiter`, `glare`, `enabled`/`active`. Lua `PointLight(pos, r, g, b, intensity)` adds a temporary per-frame point light, used for muzzle flashes and explosions.
- A level's look is mostly sky, sun spread, fog, and exposure. Gustafsson credits the art style to MagicaVoxel, contrasting "this abstract voxel appearance … with the very realistic lighting" (https://www.techradar.com/gaming/consoles-pc/ray-tracing-is-so-crucial-to-teardown-that-the-world-goes-black-if-you-turn-it-off).
- **Lighting is entirely raytraced and dynamic.** Nothing is baked: no lightmaps, no shadow maps. "I never implemented cascaded shadow maps" [DEV, SE Daily]. GPC slide 12 contrasts an unlit albedo view with the lit result.

---

## 6. Performance: budgets, numbers, and tricks

- **Only documented GPU budget (prototype, 2018):** "Full HD, about ten lights with volumetric fog, soft shadows, and no precomputed lighting: **about 9 ms total** for AO, lighting, fog, and reflections, including denoising", on a **GTX 1080** [DEV, 2018 blog]. No shipped per-pass budget is published.
- **CPU-bound under destruction:** PCGH found slowdowns during destruction "mostly CPU-bound", and explosive chain reactions overwhelm even high-end CPUs. On the GPU side, in 2020 AMD beat comparable NVIDIA cards (a Vega 56 ahead of an RTX 3090 at 1080p), which PCGH attributed to utilisation problems. Early Access 0.5.5 shipped "Performance and AMD optimisations"; 0.7.2 "Massively improved destruction and physics performance". Physics and destruction were optimised with SIMD and multithreading, and Saber optimised further for consoles [DEV, 80.lv].
- **Key tricks, all sourced above:**
  1. **One cheap draw per object** (a 12-triangle box), with all detail in the fragment shader, and frustum culling only.
  2. **Mip-based empty-space skipping** in the per-object 3D textures (½ and ¼), which is why dimensions are padded to multiples of 4.
  3. **Custom early-Z checkpoints** to recover early rejection lost to `gl_FragDepth`.
  4. **Decoupled visibility structure:** a 1-bit world volume, 8 voxels per byte (about 500 MB for 4 billion voxels), with a −1/0/1/2 bit-mip hierarchy and three trace qualities. Secondary rays never touch per-object data or transforms.
  5. **Incremental CPU updates** of the world volume, clustered `glTexSubImage3D` uploads of only the changed regions, in the background and multithreaded.
  6. **1–2 rays per pixel** for everything, plus blue-noise + R2 sampling, plus spatial bilateral filtering, plus temporal accumulation with clamping.
  7. **Half-resolution volumetrics, DOF, and bloom.**
  8. **Stochastic transparency**: no sorting and no forward pass. Everything goes through the G-buffer and TAA cleans up.
  9. **Lighting is demodulated** (albedo applied after denoising), so the denoiser does not blur texture.
  10. **Content rules:** split assets into small, tight shapes and avoid empty space. Shape count has its own overhead [DEV, Year summary].
  11. **Render scale** option (and, since Nov 2026, DLSS/FSR on DX12).
- **Graphics options** named publicly: render scale, render quality (low/medium/high), DOF, motion blur, vsync (variable vsync since 0.7.2), particle density (1.5.1), upscaling (DLSS/FSR, 2026), and graphics API (DX12/OpenGL). What each quality tier changes internally is **UNCONFIRMED**; presumably ray counts and trace mode.
- **Memory:** 4 GB VRAM is the minimum per Steam. Level VRAM is dominated by the shadow volume (200–500 MB) plus per-object volumes and palettes. GPC slides 54–58 chart "Level data VRAM, normalized by Level data VRAM in Teardown". Teardown is normalised to 1.0 and "includes the bitmap, palette indices, and palette data". The new engine's variants use 2.6–6.1 bytes per voxel with chunk sizes 4³, 8³, and 16³, across levels including The Arryo Chasm, Muratori Beach, Cullington, E.F.O. Recycling Plant, Frustrum, Villa Gordon, Space Hub, Hollowrock Island, and Isla Estocastica.

---

## 7. Visual damage

### 7.1 Holes and voxel removal
- Damage removes voxels (sets index 0) in a sphere, with a separate radius per hardness class (`MakeHole`, which returns the cut voxel count). `Explosion(pos, size 0.5–4.0)` combines holes, impulses, fire, and black paint [DATA].
- In multiplayer, damage is replicated as fixed-point deterministic commands, for example "cut hole in this shape at voxel coord x,y,z" [DEV, multiplayer post].
- After a cut, the changed shape's 3D texture and the shadow-volume region are re-uploaded (§2.4).
- **Splitting:** connectivity analysis splits disconnected parts into new shapes and bodies. `SplitShape(shape, removeResidual)`: "small disconnected chunks will be removed during this process to reduce the number of newly created shapes" [DATA]. "Destroyed objects split into chunks, each becoming its own object" [RE, acko]. Pieces keep the parent palette [DEV, Spraycan].
- **No structural-stress simulation:** a house can stand on a single voxel; this was a deliberate choice. 0.7.2 added algorithms so "large buildings … fall properly when disconnected" [DEV, SE Daily; Steam 0.7.2 notes].
- **Debris:** small fragments are spawned as **plain particles** ("fire, debris, rain, snow" per the API) and are presumably tinted by material colour. Larger pieces become rigid-body shapes. The exact threshold and whether tiny residual chunks convert to particles are **UNCONFIRMED**. Patch notes mention that voxels "regenerate health gradually over time" and that repaired voxel objects restore their voxels (search snippets of steamdb patch notes, **UNCONFIRMED** wording), which implies **per-voxel damage/health state** for partial damage. Its storage is **UNCONFIRMED**.

### 7.2 Paint, blackening, and charring
The `The Spraycan` post is the definitive source [DEV, https://blog.voxagon.se/2020/12/03/spraycan.html]:
- Two tint colours exist: **yellow (spraycan) and black ("from fire and explosions")**. Multiple shades give gradients and antialiased edges.
- **At load time, colour variants of each used material are precomputed into unused palette slots.** Translation tables (e.g. `yellowVariant[256][STEPS]`) map index to tinted index, and steps can be chained.
- Two shades × 4 steps need 8 free slots per used material, which reduces usable entries "from 255 to a mere 28". Black variants are also needed for each yellow variant.
- When slots run out, the engine merges visually similar colours. Opaque colours get priority over transparent ones.
- So **charring is a palette-index swap**, not a separate texture or decal. It keeps material type and works with the 1-byte format.
- Lua: `Paint(origin, radius, "explosion"|"spraycan", probability)` with dithering probability, and `PaintRGBA(origin, radius, r, g, b, a, probability)` in newer versions [DATA].

### 7.3 Fire
- Fires are point entities that spread over flammable materials. Wood, plastic, foliage and similar burn; the official docs call flammability an editor-defined object property. Lua: `SpawnFire`, `GetFireCount`, `QueryClosestFire`, `RemoveAabbFires`, plus extinguisher particles flagged `ParticleFlags(256)` [DATA].
- Rendering is **emissive plain particles plus fluid-simulated smoke**, plus temporary/attached lights.
- Fire consuming voxels over time, and fire-driven black paint, are observed in-game but have no primary-source description of the algorithm. **UNCONFIRMED.**
- Fire rendering costs: smoke is lit by the raytraced lighting (PCGH, "fire smoke is lit dynamically using raymarching").

---

## 8. Limitations stated by the developer (GPC 2025) and what the next engine changes

GPC slide list [DEV]: **Sparse shapes · Indexed palette · Maximum level size · Global illumination · Dynamic objects (require shadow-volume updates) · Quantization artifacts (shadow-volume)**. Slides 32–33 show voxel-stair-stepped shadows from a rotated object, because the world volume is axis-aligned and quantised, so rotated shapes cast blocky shadows.

Year-summary [DEV]: the shadow volume blocked deformable-voxel experiments: "I could never really get it to work properly with lighting because of the shadow volume". "The Teardown engine is based around data parallelism".

The next engine (not Teardown) shows what the shipped design traded away:
- **Vulkan with hardware RT** (`traceRayEXT`), via the Daxa framework.
- Sparse 8×8×8 voxel chunks, "no longer uses a shadow volume, which enables unlimited world size".
- "True reflections and global illumination".
- Per-voxel properties without palettes.
- Physics substepping instead of solver iterations [DEV, Year summary; GPC slides 35–61].

Gustafsson also mused that HW RT "can just operate directly on the objects", removing the bitmap [DEV, SE Daily].

---

## 9. Consolidated UNCONFIRMED list
1. The exact GL texture formats of per-object volumes (R8 vs R8UI) and of palette textures; the palette texture dimensions beyond "256 × number of palettes".
2. How voxel normals are computed (presumably the DDA entry face).
3. What the render-quality tiers change (ray counts, trace mode, resolution of AO).
4. Physics tick rate (scripts' `update()` is 60 Hz; physics likely the same).
5. The debris particle vs rigid-chunk threshold; per-voxel health storage.
6. Fire spread algorithm, voxel consumption, and charring trigger rules.
7. Snow-on-ground implementation; the use of the "unphysical" (225–240) and "reserved" palette ranges.
8. The MagicaVoxel MATL → Teardown reflectivity/shininess/metallic/emissive conversion.
9. Which level the 4000×3400×290 shadow volume belongs to.
10. FSR/DLSS versions and the DX12-only requirement (secondary source only); the DX12 shadow-volume cap wording.
11. Per-pass GPU timings in the shipped game (none public; only the 2018 prototype's ~9 ms).
12. Any per-object occlusion culling beyond frustum culling and the custom early-Z.
13. The Our Machinery podcast (Dec 2021) and the "indiedevs talk shop #3" video (https://www.youtube.com/watch?v=YjoCOpiL2I8) likely contain more internals. I could not get transcripts.

---

## 10. Distilled blueprint for a similar engine (derived from the above)
1. Use a **10 cm voxel**, with one dense 1-byte-per-voxel volume per object (≤256³). Store a palette index per voxel and keep a 256-entry palette per object group. Pack palettes into a 256×N texture.
2. For primary rays, **rasterize each object's OBB** (back faces). In the fragment shader, transform the ray to object space, run an Amanatides–Woo DDA with ½ and ¼ mips for skipping, and write `gl_FragDepth` and a deferred G-buffer (albedo, normal, material, motion, linear depth). Draw front-to-back with periodic depth copies for manual early-out.
3. For secondary rays, keep a **separate world-space, axis-aligned 1-bit occupancy volume** (8 voxels per byte, plus coarse mips). Update it incrementally on the CPU by re-voxelizing moved or changed shapes and uploading sub-boxes. Offer exact, fixed-step, and mip/cone trace variants.
4. Lighting: 1–2 stochastic rays per pixel for AO/sky, sun, and every area light (random point on the light), with blue noise + R2. Demodulate albedo, then a bilateral spatial filter, then clamped temporal reprojection. Do reflections by tracing the occupancy volume and fetching screen colour when visible, else the sky. Render volumetrics at half resolution.
5. Use dithered transparency for glass and smoke, resolved by TAA. Post chain: auto-exposure, bloom, DOF, motion blur, saturation and colour balance, `1−exp(−x)` tonemap, gamma.
6. Do damage as **index→0 carving** with per-hardness radii. Split by 6-connectivity into new bodies that keep their palette. Do paint and char as **precomputed palette-variant index swaps**.
7. Known ceilings to design around: the level size is capped by the 3D-texture limits of the world bitmap (Teardown: about 4000 voxels per axis, about 500 MB). Expect no GI, quantised shadows from rotated objects, palette limits, and update cost for large moving objects. Teardown's own successor moves to sparse chunks plus HW RT to remove these.
