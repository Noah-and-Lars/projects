# 04: Teardown modding API, level format and data formats, and what they show about the engine

Research date: 2026-11-24. Current official API version: **2.2.0** (Lua 5.1).

**Primary sources**
- Official modding guide: https://www.teardowngame.com/modding/
- Lua API reference: https://www.teardowngame.com/modding/api.html. The machine-readable version is https://www.teardowngame.com/modding/api.xml.
- Voxscript API: https://www.teardowngame.com/modding/voxscript.html
- Multiplayer modding guide: https://teardowngame.com/modding-mp/
- Official mplib source: https://github.com/tuxedolabsorg/mplib
- Official `teardown_palette.vox` and `pipebomb.vox`. I downloaded both from `/modding/downloadable/` and parsed them for this report.
- Community reverse-engineering:
  - TTFH/Teardown-Converter, a .tdbin parser and XML/vox writer (C++): https://github.com/TTFH/Teardown-Converter
  - TTFH/TDLL, an in-memory engine struct layout plus an extended API DLL: https://github.com/TTFH/TDLL
- Dennis Gustafsson's multiplayer devblog: https://blog.voxagon.se/2026/03/13/teardown-multiplayer.html
- 80.lv interview with the developer: https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech
- MagicaVoxel spec: https://github.com/ephtracy/voxel-model (`MagicaVoxel-file-format-vox.txt` and `-vox-extension.txt`)
- Steam Workshop guides, cited inline.

**Conventions**
- "UNCONFIRMED" means I could not verify the item against an official source or code I read.
- "RE" marks facts taken from community reverse-engineering code. They are accurate for the game version that code targets (.tdbin 2.1.0, game 2.0.4+), but Tuxedo Labs does not document them.

Some sources could not be read. The Teardown fandom wiki (Cloudflare challenge / HTTP 402), the TCRF notes page (403) and Dennispedia (404) were all unreachable.

---

## 0. Key engine takeaways for a clone

1. **Everything is an entity in a single tree.** There are 13 runtime entity types: Body, Shape, Light, Location, Water, Joint, Vehicle, Wheel, Screen, Trigger, Script, Animator and Rig (RE: `entity.h` in Teardown-Converter, `teardown_structs.h` in TDLL).
   - Each entity has an int handle, tags (name=value), a description string and children.
   - Lua sees only integer handles. "Handles to objects are plain Lua numbers" (api.html).
   - XML "editor-only" nodes are flattened away at load time. These include group, instance, voxbox, vox, compound, rope, boundary, environment, spawnpoint, postprocessing and voxscript.
2. **Shape is a dense voxel grid with one byte per voxel.**
   - Each byte is a palette index; 0 means empty.
   - The grid is owned by a Body, has a local transform, and has a default voxel scale of 0.1 m.
   - Shapes reference a shared palette by id. RE: `Voxels { uint32 size[3]; uint8_t* voxels; float scale; uint32 palette; }` in TDLL.
3. **Material is a property of the palette index, not the voxel.** Each palette has 256 entries, each with a material type, RGBA, reflectivity, shininess, metallic, emissive and a tint flag. MagicaVoxel palette rows map to physical material types.
4. **Destruction is radius-by-hardness.** `MakeHole(pos, rSoft, rMedium, rHard)` takes three radii for three hardness classes, and each material is assigned to a class. Disconnected voxel islands are split into new shapes or bodies (`SplitShape`, `IsShapeDisconnected`).
5. **Fixed 60 Hz simulation and per-frame tick.** `update(dt)` always gets dt = 1/60 and runs at most twice per frame. `tick(dt)` runs once per frame with dt between 0 and 1/30.
6. **The registry is a global hierarchical string-keyed key/value tree.** The engine, scripts, options and save data all share it.
7. **Levels are XML scene graphs that reference .vox files.** At runtime and for saves, the whole scene is serialized into a zlib-compressed binary (`.bin`, magic "TDBIN"). This includes every voxel (RLE-encoded), every palette, the registry, and each script's Lua global state.

---

## 1. Mod packaging and loading (official)

Source: https://www.teardowngame.com/modding/

**Mod types**
- **Global mods** are active in all gameplay.
- **Content mods** contain playable levels. A mod is a content mod if `main.xml` is present.
- Multiplayer adds a third type, **Game Modes**, declared in a root `gamemodes.txt`. They come as Global Game Modes (with `path=` to a Lua file and an optional `restart=true`) or Content Game Modes (with `layers=` lists). Source: https://teardowngame.com/modding-mp/

**Folder layout**
- Mods live in `Documents/Teardown/mods/<ModName>/`.
- These files must sit in the root: `info.txt`, `main.xml`, `main.lua`, `options.lua` and `preview.jpg` (max 1 MB).
- `info.txt` holds key = value pairs: `name`, `author`, `description`, and `tags` (one or more of Map, Gameplay, Asset, Vehicle, Tool).
- Multiplayer mods add `version = 2` and `preview = file.png` (512×292) to `info.txt`.
- The game creates `id.txt` after the first Steam Workshop upload.

**Path keywords**
- `MOD/` means the mod root.
- `LEVEL/` means the folder with the same name as the open level XML.
- `Spawn` can reference another mod's prefab as `modid:path`. In multiplayer, that mod must be listed in `mods.available` (api.html, Spawn).

**Asset override**
- A mod can mirror the `data/` tree, e.g. `data/vox/pipebomb.vox`, to replace base assets.
- The base game's audio is encrypted `.tde`. An `.ogg` with the same name next to it takes priority.

**`spawn.txt`**
- Each line is `path/to/prefab.xml : Category/Display name`. It exports prefabs to the in-game spawn menu.
- Static objects become dynamic when spawned from the menu.

**`options.lua`**
- Its `draw()` function builds an Options screen in the Mod Manager.

**Multi-level mods**
- `StartLevel("level2", "MOD/mylevel2.xml", "layerA layerB")` loads another level XML with chosen layers.
- Groups have a `layer` property. A `-layername` "minus layer" excludes a group when that layer is active.

**Custom skybox**
- Skyboxes are DDS files, built with the official `skybox-dds.zip` tool.

**Script versioning**
- Multiplayer-capable scripts must start with `#version 2`.
- Without that line a script is "automatically (and silently) disabled in multiplayer" (https://teardowngame.com/modding-mp/).

**Outdated official note**
- The "Possibilities and Limitations" section still says objects "can not spawn at run time" and that water node positions cannot change. The first point is stale: the API now has `Spawn`, `SpawnLayer` and `SpawnTool`. The water limitation appears still valid. Community TDLL adds `SetWaterVertex` through memory hacks, which suggests there is no official API for it.

---

## 2. Scene graph and XML level format

### 2.1 How XML maps to runtime

- Level files (`main.xml`) use a `<scene>` root. Prefab files use a `<prefab version="...">` root.
- Property inheritance applies: "Child nodes will inherit the properties of their parent unless the property is explicitly set for the child" (modding guide, "Hierarchy & Inheritance").
- Hierarchy also scopes script lookups. `FindShape("tag")` searches only *below the script node*, and `FindShape("tag", true)` searches globally.
- In the binary format each Script entity stores an explicit `entities` list of the handles it owns (RE: `ScriptCore.entities` in Teardown-Converter `parser.cpp`).

**Minimal real level** (from TDLL's "Infinite Craft" mod, https://github.com/TTFH/TDLL):
```xml
<scene version="1.7.0" shadowVolume="200 50 200">
  <environment template="sunset"/>
  <script file="main.lua"/>          <!-- base game's data/script/main.lua: gives player tools -->
  <script file="sandbox.lua"/>
  <voxbox pos="-25 0 -25" size="500 1 500"/>
  <voxbox pos="-1 0.1 -5" size="20 20 2" material="wood" color="0.7 0.5 0.3"/>
  <spawnpoint pos="-3.8 1.0 0.0" rot="0 180 0"/>
  <instance pos="0.0 0.1 0.0" file="MOD/computer.xml"/>
</scene>
```

**Matching prefab**:
```xml
<prefab version="1.7.0">
  <group name="instance=MOD/computer.xml">
    <script pos="0.1 1.1 0.2" file="terminal.lua">
      <body tags="interact" dynamic="true">
        <vox pos="0.2 -1.1 -0.2" file="MOD/vox/office_murky.vox" object="desk"/>
        <vox pos="0.0 -0.1 -0.3" file="MOD/vox/modern_pc.vox" object="monitor">
          <screen tags="terminal" pos="0 0.45 0" size="0.6 0.3" bulge="0"
                  resolution="1920 1080" script="MOD/options.lua" enabled="true" interactive="true"/>
        </vox>
      </body>
    </script>
    <vox pos="0.3 0 0.8" rot="0 -180 0" prop="true" file="MOD/vox/office_murky.vox" object="chair_boss"/>
  </group>
</prefab>
```

**Common attributes on every node**
- `pos="x y z"` (meters) and `rot="x y z"` (Euler degrees), relative to the parent.
- `name`.
- `tags="a b=c"`: space-separated, with optional values.
- `desc`.
- Transforms are local to the parent, e.g. a shape is in body space. "The transform of shape is expressed in the parent body coordinate system" (api.html, Shape).

### 2.2 Node types and key attributes

Most attribute names and defaults below come from Teardown-Converter's `write_scene.cpp`. That tool regenerates editor-loadable XML from the game's binaries, so these names are what the editor accepts. Defaults are the values the converter omits.

| Node | Runtime entity | Key attributes (default) |
|---|---|---|
| `scene` | root | `version`; `shadowVolume` ("100 25 100"), the world volume in meters used for shadow/lighting. Its semantics are inferred from the name: UNCONFIRMED. |
| `environment` | scene-global | see §2.3; also `template="sunset"` etc. |
| `postprocessing` | scene-global | `saturation`(1), `colorbalance`("1 1 1"), `brightness`(1), `gamma`(1), `bloom`(1) |
| `spawnpoint` | scene-global transform | `pos`, `rot` |
| `boundary` | scene-global polygon | child `<vertex pos="x z"/>`s; `padleft/padright/padtop/padbottom` (5); `maxheight` (0). The player cannot pass it. `IsPointInBoundaries` and `GetBoundaryBounds` are exposed in the API. |
| `group` | none (organizational) | `name`, `layer` (incl. `-layer`), inherited properties |
| `instance` | expands prefab | `file="MOD/x.xml"`; prefabs edit-propagate to all instances (modding guide, "Prefabs") |
| `body` | **Body** | `dynamic` (false); runtime props: `friction`, `restitution`, `frictionMode`/`restitutionMode` (average/minimum/multiply/maximum), `active`, `velocity`, `angVelocity` (api.html GetProperty) |
| `vox` | **Shape** | `file`, `object` (MagicaVoxel object name), `scale` (1; multiplies the 0.1 m voxel), `prop` (true → gets its own dynamic body), `density` (1), `strength` (1), `collide` (true), `texture="tile [weight]"`, `blendtexture`. The `texture` semantics are UNCONFIRMED: it is stored as a uint16 tile index and a float weight, and is likely a detail/noise texture overlay. |
| `voxbox` | **Shape** (single-material box) | `size="x y z"` in voxels, `material` (none/glass/wood/masonry/…), `color="r g b"`, `pbr="reflectivity shininess metallic emissive"`, plus density/strength/collide/texture. Official example: `Spawn("<voxbox size='10 10 10' prop='true' material='wood'/>", ...)` (api.html Spawn). |
| `compound` | **Shape** >256³ | Converter emits this for runtime shapes bigger than 256 per axis, with `vox` children of up to 256³ each. In-game shapes can therefore exceed MagicaVoxel's 256 limit after merging (RE). |
| `voxscript` | generates Shapes at build time | `file` (e.g. ground.lua) plus params that the script exposes (see §6.3). |
| `light` | **Light** | `type` sphere/capsule/cone/area; `color`, `scale`, `angle`(90), `penumbra`(10), `size`, `reach`, `unshadowed`, `fogscale`, `fogiter`, `glare`, `sound`, `breaksound`. Lights parented to a shape break and switch off with it (API `GetShapeLights`, `IsLightActive`). |
| `location` | **Location** | transform only; used for tags such as vehicle `player`, `camera`, `exit`, `propeller`, `exhaust[=strength]`, `vital`, and MP `playerspawn`, `teamspawn=N`, `ammospawn rarity=low/medium/high`, `pointofinterest=N` (modding-mp). |
| `water` | **Water** | `type="polygon"` + `<vertex>`s; `depth`(10), `wave`, `ripple`, `motion`, `foam`, `color`, `ringheight`, `drag`(0.005), `visibility`(3), foam/splash particle (`sp_*`) and sound (`snd_*`) params |
| `joint` | **Joint** | `type` ball/hinge/prismatic/cone (plus rope internally); `size`(0.1), `rotstrength`, `rotspring`(0.5), `collide`, `limits` (deg for hinge, m for prismatic), `sound`, `autodisable` |
| `rope` | **Joint** (type rope) | two `location` children as endpoints; `size`(0.2), `color`, `slack`, `strength`(1), `maxstretch` |
| `vehicle` | **Vehicle** | `sound`, `spring`, `damping`, `topspeed` (km/h, stored as m/s), `acceleration`, `strength`, `antispin`, `antiroll`, `difflock`, `steerassist`, `friction`(1.3), `driven`; children: one body, wheels, tagged locations |
| `wheel` | **Wheel** | `drive`, `steer`, `travel="min max"` ("-0.1 0.1"); contains a vox |
| `screen` | **Screen** | `size`(0.9 0.5 m), `bulge`, `resolution`(640 480), `script` (a Lua UI script rendered into the screen texture), `enabled`, `interactive`, `emissive`, `fxraster/fxca/fxnoise/fxglitch` |
| `trigger` | **Trigger** | `type` sphere/box/polygon; `size`; `sound`, `soundramp` (ambient zones) |
| `script` | **Script** | `file`; parameters `param0="name=value"` … (read via `GetIntParam`/`GetFloatParam`/…); children are owned by the script |
| `animator` | **Animator** | `file` (animated character/rig asset; added for characters in 1.6/2.0 – details UNCONFIRMED) |
| (none) | **Rig** | runtime player/vehicle rig with tagged locations (API `FindRig`, `SetPlayerRig`) |

Sources: Teardown-Converter `src/write_scene.cpp`, `src/xml_writer.cpp`, `src/entity.h`; property lists in api.html `GetProperty` and `SetProperty`; Steam vehicle guide https://steamcommunity.com/sharedfiles/filedetails/?id=2271537978.

**Vehicle XML example** (from that guide):
```xml
<vehicle name="suv2" pos="5.7 1 -12" driven="true" sound="suv2" spring="0.8" damping="0.8" topspeed="..." strength="5" antiroll="0.2" difflock="0.5">
  <body pos="-0.05 0.6 -0.25" dynamic="true">
    <vox pos="0.05 -0.2 0.25" rot="0 180 0" density="2" strength="3" file="LEVEL/suv3.vox" object="body">
      <location tags="player" pos="0.35 1.25 0.25"/>
    </vox>
    <wheel name="fl" pos="-0.5 -0.15 -.55" drive="1" steer="1" travel="-0.1 0.2">
      <vox pos="0 -0.45 -0.05" rot="0 180 0" file="LEVEL/suv3.vox" object="wheel_fl"/>
    </wheel> ...
  </body>
</vehicle>
```

### 2.3 Environment attributes

These are the attribute names and defaults the converter emits (`WriteEnvironment`).
- **Skybox:** `skybox`("cloudy.dds"), `skyboxtint`, `skyboxbrightness`, `skyboxrot`, `skyboxaxis`.
- **Lens and ambient:** `lensdirt`, `constant`("0.003 0.003 0.003"), `ambient`(1), `ambientexponent`(1.3).
- **Fog:** `fogType` (classic/linear/exp/exp2), `fogColor`, `fogParams`("40 100 0.9 4", meaning start, end/density, amount, exponent), `fogHeightOffset`.
- **Sun:** `sunBrightness`, `sunColorTint`, `sunDir` ("auto" = derive from skybox), `sunSpread`, `sunLength`(32), `sunFogScale`, `sunGlare`.
- **Exposure:** `exposure`("0 10"), `brightness`.
- **Wet weather:** `wetness`, `puddleamount`, `puddlesize`, `rain`.
- **Other:** `nightlight` (a bool that enables lamps), `ambience`("outdoor/field.ogg"), `fogscale`, `slippery`, `waterhurt`, `snowdir`("0 -1 0 0.2"), `snowamount`, `snowonground`, `wind`.
- **Runtime access:** `SetEnvironmentProperty(name, …)` and `SetPostProcessingProperty` change these at runtime. The available properties are "exactly the same as in the editor, except for 'snowonground'" (api.html). `snowonground` is baked into voxels: snow voxels use palette index 254 (RE: `SNOW_INDEX = 254`, Teardown-Converter `vox_writer.h`).

### 2.4 Tags with engine meaning

Official status: "Teardown defines a couple of built-in tags… listed as context-specific help for the Object 'tag' property" in the editor. The full list is therefore not published on the web (modding guide).

**Confirmed by multiple community sources** (https://steamcommunity.com/sharedfiles/filedetails/?id=2923645484 and comments; the API example `FindEntities("unbreakable", true)`):
- `unbreakable`
- `invisible`
- `nocull`
- `inherittags` (children inherit tags)
- `nosnow`
- `explosive=N` (explodes when broken, roughly 0–10)
- `fxbreak=l5blue` or `fxbreak=g5grey` (a liquid or gas leak effect when broken)
- `fxsmoke=p1subtle` on locations (a smoke emitter)
- `interact` (bodies the player can interact with; seen in the prefab above)
- `attachment`
- vehicle location tags (`player`, `camera`, `exit`, `exhaust`, `vital`, `propeller`)
- MP spawn tags (official, modding-mp)

**Internal flag bits (RE)**: Teardown-Converter's commented `Flags` enum lists entity flag bits named NoShadow, Invisible, Interact, NoNav, AutoBreak, BreakAll, NoCull, Unbreakable, InheritTags and HasTag. This suggests built-in tags are compiled into per-entity flag bits at load time. The exact tag strings `nonav`, `autobreak` and `breakall` are UNCONFIRMED.

---

## 3. Material system

### 3.1 MagicaVoxel palette rows → physical material (official palette file)

The official modding guide says MagicaVoxel has 255 indexed colors and "the color at index 9 is always grass, no matter what actual color it is." It also says the wood group is indices 57–72.

I parsed the official `teardown_palette.vox` (https://www.teardowngame.com/modding/downloadable/teardown_palette.vox). Its `NOTE` chunk labels 32 palette rows of 8 entries.
- Chunks present: MATL×256, IMAP, LAYR×8, rOBJ, rCAM and NOTE. Version is 150.
- Row-to-index mapping uses `row = 31 - (index-1)/8`, the same formula as Teardown-Converter's `GetIndexNote`. It matches both official anchors (index 9 is grass; 57–72 is wood).

| Palette indices | Material (official note) | Engine type name (RE enum) | Hardness class (official table) |
|---|---|---|---|
| 1–8 | glass | glass (1) | soft |
| 9–24 | grass | foliage (9) | soft |
| 25–40 | dirt | dirt (8) | soft |
| 41–56 | rock | rock (7) | unbreakable |
| 57–72 | wood | wood (2) | soft |
| 73–88 | concrete | masonry (3) | medium |
| 89–104 | brick | masonry (3) | medium |
| 105–120 | plaster | plaster (4) | soft |
| 121–136 | weak metal | metal (5) | medium |
| 137–152 | heavy metal | heavymetal (6) | unbreakable |
| 153–168 | plastic | plastic (10) | soft |
| 169–176 | hard metal | hardmetal (11) | hard |
| 177–184 | hard masonry | hardmasonry (12) | hard |
| 185–224 | reserved (Teardown-Converter's own notes table labels 185–192 "ice", engine type 13) | ice (13) is in the RE enum; whether it maps to these rows is UNCONFIRMED | – |
| 225–240 | unphysical (visual-only, no collision) | unphysical (14) | – |
| 241–255 | reserved (254 = snow, RE) | – | – |

Notes:
- The engine material enum comes from Teardown-Converter `scene.h`: `None0 Glass1 Wood2 Masonry3 Plaster4 Metal5 HeavyMetal6 Rock7 Dirt8 Foliage9 Plastic10 HardMetal11 HardMasonry12 Ice13 Unphysical14`.
- Concrete and brick share the runtime type `masonry`, so the engine only distinguishes them by palette color.
- Voxscript's `CreateMaterial("masonry", r,g,b,…)` uses the same type strings.
- `GetShapeMaterialAtPosition` returns a type string plus RGBA plus the palette entry.

**Official tool-vs-material table** (modding guide):

| Material | Sledge | Blowtorch | Guns | Explosives |
|---|---|---|---|---|
| glass | ✓ | ✓ | ✓ | ✓ |
| grass | ✓ | ✓ | ✓ | ✓ |
| dirt | ✓ | ✗ | ✓ | ✓ |
| plastic | ✓ | ✓ | ✓ | ✓ |
| wood | ✓ | ✓ | ✓ | ✓ |
| plaster | ✓ | ✗ | ✓ | ✓ |
| concrete | ✗ | ✗ | ✓ | ✓ |
| brick | ✗ | ✗ | ✓ | ✓ |
| weak metal | ✗ | ✓ | ✓ | ✓ |
| hard masonry | ✗ | ✗ | ✗ | ✓ |
| hard metal | ✗ | ✗ | ✗ | ✓ |
| heavy metal | ✗ | ✗ | ✗ | ✗ |
| rock | ✗ | ✗ | ✗ | ✗ |

`MakeHole` codifies the three classes explicitly (api.html):
- "Soft materials: glass, foliage, dirt, wood, plaster and plastic."
- "Medium materials: concrete, brick and weak metal."
- "Hard materials: hard metal and hard masonry."

The `r1 ≤ r0` and `r2 ≤ r1` constraints mean that harder materials are always cut by a smaller sphere.

### 3.2 Rendering material (MagicaVoxel MATL)

- Rendering properties come from MagicaVoxel's Render-mode material per palette entry: Metal, Glass, Emit and Diffuse (modding guide).
  - Use `_metal` for most materials. Diffuse is equivalent to metal at max roughness.
  - Roughness becomes "shininess".
  - Metallic tints the specular highlight and controls reflectivity.
  - Glass is transparent if transparency ≠ 100. All values 0–99 are equally transparent. The HSV value of the color controls the tint.
  - Emit needs Power (`_flux`) ≥ 2 to look emissive. "Emissive materials doesn't actually light up the scene."
- At runtime each palette entry stores `type, rgba, reflectivity, shininess, metallic, emissive (0–32), is_tint`. This is visible through `GetShapeMaterial(shape, entry)` (api.html) and the RE `Material` struct (40 bytes) in TDLL.
- Teardown-Converter's reverse mapping suggests TD `emissive ≈ _emit × 10^(_flux−1)`, `shininess = 1 − _rough`, and `reflectivity = _sp − 1`. These are UNCONFIRMED (reverse-engineered).

### 3.3 Palettes are shared and carry precomputed paint tints (RE)

- The scene holds a global `Vec<Palette>`. Each shape stores a `palette_id`; each unique vox palette becomes one entry (Teardown-Converter `Scene.palettes`; TDLL `Game.palettes` at +0xC8).
- Each `Palette` holds 256 materials plus three 4×256-byte tables: `black_tint`, `yellow_tint` and `rgba_tint` (TDLL `sizeof(Palette)==0x3440`).
- This strongly suggests that painting (`Paint` with "explosion" for black soot or "spraycan" for yellow, and `PaintRGBA`) works by **remapping a voxel's palette index to a precomputed tinted index**, with 4 strength levels. Voxels do not store per-voxel colors. Entries flagged `is_tint` would be the reserved tint slots.
- This mechanism is inferred from the data layout (UNCONFIRMED). It fits the one-byte-per-voxel storage.

### 3.4 Density and strength

- `density` and `strength` are per-shape float multipliers. Both are 1 by default and set in XML on vox/voxbox.
- They can be changed at runtime with `SetShapeDensity` and `SetProperty(shape,"strength",…)`.
- The official docs do not describe exactly how `strength` modifies breakage (UNCONFIRMED).
- `GetBodyMass` returns 0 for static bodies. Mass derives from voxel count × density, but the exact formula is UNCONFIRMED.

---

## 4. Lua scripting model

### 4.1 Contexts and callbacks (api.html, modding-mp)

- Each script runs in its own Lua 5.1 context. Scripts interact only through the API, the registry and events.
- Since API 2.0, one file holds both `server.*` and `client.*` functions plus a `shared` table. `shared` replicates from server to clients and is read-only on clients. No dedicated servers exist: the host is both server and a client.
- **Server callbacks:**
  - `init()`
  - `tick(dt)`: once per frame, 0 ≤ dt ≤ 0.0333.
  - `update(dt)`: fixed dt = 0.0166667 (60 Hz), "at the most two times per frame… might not be called at all for a particular frame".
  - `postUpdate()`: after physics.
  - `destroy()`: game modes only.
- **Client callbacks:** the same set plus `draw()` and `render(dt)`.
  - `draw()` draws the 2D overlay "after the scene but before the standard HUD". It is the only place Ui* functions work.
  - `render(dt)` runs "right before things are actually drawn".
- **Frame order:** `tick` first, then 0–2 `update` calls, then `draw`. Input must be read in `tick`, never in `update` (modding guide).
- **Physics constraints:** `ConstrainVelocity`, `ConstrainAngularVelocity`, `ConstrainPosition` and `ConstrainOrientation` "should only be used from the update callback". They feed custom constraints into the solver with min/max impulse bounds.
- **Remote calls:** `ServerCall(fn, …)` and `ClientCall(playerId, fn, …)` (0 = broadcast).
- **Registry sync:** registry setters accept a `sync` flag to replicate to clients, e.g. `SetInt(key, value, [sync])`.
- **Function availability:** many functions are marked SERVER ONLY or CLIENT ONLY.
  - Server only: `MakeHole`, `Explosion`, `Shoot`, `Paint`, `SpawnFire`, `RegisterTool`, `SetToolAmmo`, `SetGravity`, `SetEnvironmentProperty`, `AddHeat`, `SetTimeScale`.
  - Client only: `SetToolTransform`.
- **Script state persists in saves.** The binary format stores each script's `tick_time`, `update_time`, parameters, **all Lua globals as a serialized table**, owned entity handles, loaded sounds, value transitions (`SetValue` tweens) and sprites. Supported Lua types are bool, number (double), string, table, and a handle "Reference" type (RE: `ReadScriptCore`, `lua_table.h`). Functions and userdata are not serialized.

### 4.2 Entities and handles

- Entity handles are integers; 0 means invalid.
- Entity functions: `FindEntity/FindEntities(tag, global, type)`, `GetEntityType`, `GetEntityChildren`, `GetEntityParent`, `SetTag/HasTag/GetTagValue/ListTags/RemoveTag`, `Get/SetDescription`, `Delete`, `IsHandleValid`, `GetProperty/SetProperty`.
- `GetProperty` and `SetProperty` are a generic reflection API, keyed per type (Body/Shape/Light/Location/Water/Joint/Vehicle/Wheel/Screen/Trigger). The keys are listed in §2.2.
- Every scene has an implicit static **world body**, `GetWorldBody()`, which owns all shapes not explicitly given a body.

### 4.3 API function groups and notable functions (API 2.2.0)

This list is complete at the group level and taken from the api.html index.

**Parameters**
- `GetInt/Float/Bool/String/ColorParam`

**Script control**
- Time: `GetVersion`, `HasVersion`, `GetTime`, `GetTimeStep`.
- Input: `InputPressed/Released/Down/Value(name, [playerId])`. Names are physical keys (`lmb`, `a`–`z`, `mousedx`) or logical actions (`usetool`, `grab`, `interact`, `jump`, `crouch`, `vehicleraise`, `extra0..6`, `camerax`).
- Flow: `SetValue` (tweened variable), `StartLevel`, `SetPaused`, `Restart`, `Menu`, `PauseMenuButton`, `HasFile`, `ClientCall`, `ServerCall`.

**Registry**
- `SetInt/GetInt/SetFloat/GetFloat/SetBool/GetBool/SetString/GetString/SetColor/GetColor`
- `ListKeys`, `HasKey`, `ClearKey`
- Translation: `GetTranslatedStringByKey`, `LoadLanguageTable`
- `GetUserNickname`

**Events**
- `PostEvent(name, …)`, `GetEventCount`, `GetEvent`
- Built-in events: `playerhurt`, `playerdied`, `explosion` (point, strength; server only), `projectilehit` (shape, point, dir; server only).
- `RegisterListenerTo` and `TriggerEvent` are deprecated.

**Vector math**
- `Vec*`, `Quat*` (Euler, AxisAngle, LookAt, Slerp, RotateVec), `Transform*` (To/FromParent/Local Point/Vec/Transform)
- RNG: `SetRandomSeed`, `GetRandom*`

**Body**
- `Find/FindBodies`, `Get/SetBodyTransform`, `GetBodyMass`, `Is/SetBodyDynamic`
- `Set/GetBodyVelocity`, `GetBodyVelocityAtPos`, `Set/GetBodyAngularVelocity`, `SetBodyGravityScale`, `Is/SetBodyActive` (sleep control), `ApplyBodyImpulse(body, worldPos, worldImpulse)`
- `GetBodyShapes`, `GetBodyBounds`, `GetBodyCenterOfMass`, `IsBodyBroken`, `IsBodyJointedToStatic`, `GetBodyClosestPoint`
- `Constrain*`, `DrawBodyOutline/Highlight`, `GetWorldBody`

**Shape**: this is the voxel API.
- Transforms: `Get/SetShapeLocalTransform`, `GetShapeWorldTransform`, `GetShapeBody`, `GetShapeJoints`, `GetShapeLights`, `GetShapeBounds`.
- Size and state: `GetShapeSize` (returns x,y,z voxels plus voxel scale, 0.1 m default), `GetShapeVoxelCount`, `IsShapeVisible`, `IsShapeBroken`.
- Voxel and material reads: `GetShapeMaterialAtPosition(shape, worldPos)` and `GetShapeMaterialAtIndex(shape, x,y,z)` (0-based), which return type, RGBA and palette entry. `GetShapePalette` and `GetShapeMaterial` also read material data.
- Physics settings: `SetShapeEmissiveScale` (also scales attached lights), `SetShapeDensity`, `Set/GetShapeCollisionFilter(layer 8-bit, mask 8-bit)`. The default layer is 1 and the mask 255. Two shapes collide only if each layer is in the other's mask.
- **Procedural voxel editing:**
  - `CreateShape(body, transform, refShapeOrVoxPath)` creates a new 1×1×1 shape that uses the palette of a reference shape or vox file.
  - `ClearShape`, `ResizeShape(shape, xmin…zmax)` (returns an offset; the transform is auto-adjusted to keep content fixed in body space), `SetShapeBody` (reparent).
  - `CopyShapeContent`, `CopyShapePalette`.
  - `SetBrush("sphere"|"cube"|"noise", size 1–16, materialIndex | brushVoxPath, [object])`. Index 0 erases.
  - `DrawShapeLine(… paint, noOverwrite)`, `DrawShapeBox`.
  - `ExtrudeShape(shape, x,y,z, dx,dy,dz, steps, "exact"|"material"|"geometry")`.
  - `TrimShape` (crop empty space).
  - `SplitShape(shape, removeResidual)` splits into new shapes by connectivity, optionally deleting small chunks.
  - `MergeShape` merges with an aligned, touching shape.
  - `IsShapeDisconnected`, `IsStaticShapeDetached`, `GetShapeClosestPoint`, `IsShapeTouching`.
- **No per-voxel `SetShapeVoxel` or `GetShapeVoxel` exists.** Single voxels are written with `SetBrush("cube",1,idx)` plus `DrawShapeBox(x,y,z,x,y,z)` and read with `GetShapeMaterialAtIndex`. Community TDLL adds `GetShapeVoxelMatrix` through memory access, which confirms the gap.

**Location / Joint / Rope**
- `FindLocation(s)`, `GetLocationTransform`
- Joints: `FindJoint(s)`, `IsJointBroken`, `GetJointType` ("ball", "hinge", "prismatic", "rope"), `GetJointOtherShape`, `GetJointShapes`, `SetJointMotor`, `SetJointMotorTarget`, `GetJointLimits`, `GetJointMovement`, `GetJointedBodies`, `DetachJointFromShape`
- Ropes: `GetRopeNumberOfPoints`, `GetRopePointPosition`, `GetRopeBounds`, `BreakRope`
- Joints attach **shapes**, not bodies. This means joints survive and re-home when bodies split; the multiplayer blog also mentions "joint reconnections" in its destruction command stream.

**Animation** (characters, 2.0+)
- Inverse kinematics: `SetAnimatorPositionIK`, `SetAnimatorTransformIK`
- Playback: `PlayAnimation(Loop/Instance/Frame)`, `Begin/EndAnimationGroup`, clip control
- Ragdoll: `MakeRagdoll`, `UnRagdoll`
- Bones: `SetBoneRotation`, `SetBoneLookAt`, `GetBoneWorldTransform`

**Light / Trigger / Screen / Vehicle / Rig**
- Light: `SetLightEnabled`, `SetLightColor`, `SetLightIntensity`, `IsPointAffectedByLight`, `Get/SetFlashlight`
- Trigger: `IsBodyInTrigger`, `IsVehicleInTrigger`, `IsShapeInTrigger`, `IsPointInTrigger`, `IsPointInBoundaries`, `IsTriggerEmpty`, `GetTriggerDistance`, `GetTriggerClosestPoint`
- Screen: `SetScreenEnabled`, `GetScreenShape`
- Vehicle: `DriveVehicle`, `GetVehicleHealth`, `SetVehicleParam`, `GetVehicleExhaustTransforms`, `GetVehicleVitalTransforms`, seat and passenger queries
- Rig: `FindRig`, `Get/SetRigWorldTransform`, rig locations

**Player** (all take an optional playerId in 2.x)
- Players: `GetAllPlayers`, `GetAddedPlayers`, `GetRemovedPlayers`, `GetLocalPlayer`, `IsPlayerHost`
- Transforms and camera: `Get/SetPlayerTransform(WithPitch)`, `GetPlayerEyeTransform`, `GetPlayerCameraTransform`, `GetPlayerAimInfo`
- Vehicle and health: `Get/SetPlayerVehicle`, `Get/SetPlayerHealth`
- Grab and pick: `GetPlayerGrabShape/Body`, `GetPlayerPickShape`, `GetPlayerInteractShape`, `ReleasePlayerGrab`
- Spawn and respawn: `SetPlayerSpawnTransform/Health/Tool`, `RespawnPlayer`
- Movement and damage: walking/crouch speed params, `ApplyPlayerDamage`, `DisablePlayerInput`
- Tools: `RegisterTool`, `SetToolEnabled`, `SetToolAmmo`, `GetToolBody`, `SetToolTransform`, `SetToolTransformOverride`, `SetToolHandPoseLocalTransform`, `SetToolAllowedZoom`, `SetToolAmmoPickupAmount`
- Rigs: player rig functions

**Sound**
- `LoadSound(path, nominalDistance=10)`, `PlaySound(h, pos, volume, registerVolume, pitch)`, `LoadLoop/PlayLoop`, `StopSound`, `PlaySoundForUser`, `PlayMusic/StopMusic/SetMusicVolume/SetMusicLowPass`
- World sounds "are always positioned and will be affected by acoustics simulation". `UiSound` is dry.
- `GetLastSound` lets AI hear registered sounds.

**Sprite**
- `LoadSprite`, `DrawSprite(h, transform, w, h, rgba, depthTest, additive, fogAffected)`. Sprites are unlit but post-processed.

**Scene queries**
- Filters set per query: `QueryRequire("physical dynamic static large small visible animator player tool")`, `QueryInclude`, `QueryCollisionMask`, `QueryReject*(Body/Shape/Vehicle/Player/Animator)`.
- `QueryRaycast(origin, dir, maxDist, radius, rejectTransparent)` returns hit, dist, normal, shape. A radius > 0 makes it a spherecast.
- Other casts: `QueryRaycastRope`, `QueryRaycastWater`, `QueryShot` (returns shape or player hit plus a damage factor), `QueryClosestPoint`, `QueryAabbShapes/Bodies`.
- Async navigation: `QueryPath(start, end, maxDist, targetRadius, "low|standart|water|flying")` plus `CreatePathPlanner/PathPlannerQuery/GetPathState/GetPathPoint`.
- `IsPointInWater`, `GetWindVelocity`.
- The "large/small" layer names refer to a **debris threshold**. The engine classifies shapes as small debris or large objects, which is a key performance tier.

**Particles**
- State-machine style: `ParticleReset/Type("plain"|"smoke")/Tile/Color/Radius/Alpha/Gravity/Drag/Emissive/Rotation/Stretch/Sticky/Collide/Flags`, then `SpawnParticle(pos, vel, lifetime)`.
- "Smoke particles… are simulated with fluid dynamics internally" (api.html).

**Spawn**
- `Spawn(xmlFileOrString, transform, allowStatic, jointExisting)` returns all new handles.
- `SpawnLayer(…, voxLayer, …)` and `SpawnTool(id, transform, allowStatic, voxScale)`.

**Miscellaneous**
- Destruction and combat:
  - `MakeHole(pos, r0, r1, r2, silent)` returns the voxel count removed.
  - `Explosion(pos, size 0.5–4.0, [playerId])`.
  - `Shoot(origin, dir, "bullet|rocket|gun|shotgun", strength, maxDist, playerId)` spawns only the projectile, with no sound.
  - `Paint(origin, radius ≤5, "explosion"|"spraycan", probability)` and `PaintRGBA`.
- Fire:
  - `SpawnFire(pos)`, `GetFireCount`, `QueryClosestFire`, `QueryAabbFireCount`, `RemoveAabbFires`.
  - `AddHeat(shape, pos, amount)`: "As soon as the heat of the voxel reaches a critical value, it destroys and can ignite the surrounding voxels" (blowtorch model).
- Camera: `Get/SetCameraTransform`, `RequestFirstPerson/ThirdPerson`, `AttachCameraTo`, `ShakeCamera`, `SetCameraFov`, `SetCameraDof`.
- Time and lighting: `SetTimeScale(0–2)` (since v1.5 it uses render interpolation and no longer affects physics), `PointLight` (an immediate light).
- Environment: `Set/GetEnvironmentProperty`, `Set/GetPostProcessingProperty`.
- Debug: `DrawLine`, `DebugLine`, `DebugCross`, `DebugWatch`, `DebugPrint`.
- Haptics: `LoadHaptic`, `PlayHaptic`, and related functions.
- World: `GetBoundaryArea/Bounds`, `Get/SetGravity` (default (0,−10,0)), `GetFps`, `AddMapMarker`.

**User interface** (`client.draw` only)
- Immediate-mode GUI with a cursor and state stack. "Pushing and popping the stack is cheap and designed to be called often."
- Stack and transform: `UiPush/UiPop`, `UiTranslate/Rotate/Scale`.
- Windows: `UiWindow(w, h, clip, inherit)` sets new bounds for `UiWidth/UiHeight/UiCenter/UiMiddle`. `UiClipRect` and `UiSafeMargins` also exist.
- Alignment: `UiAlign("left|center|right top|middle|bottom")`, `UiTextAlignment`.
- Styling: `UiColor`, `UiColorFilter`.
- Text: `UiFont(path, size)`, `UiText`, `UiWordWrap`, `UiTextOutline/Shadow`.
- Shapes and images: `UiRect`, `UiRoundedRect`, `UiCircle`, `UiImage`, `UiImageBox` (9-slice), `UiBlur`, `UiBackgroundBlur`.
- Widgets: `UiTextButton`, `UiImageButton`, `UiBlankButton`, `UiSlider(img, axis, cur, min, max)`.
- Modal and input: `UiModalBegin/End`, `UiMakeInteractive()` (call every frame to get the mouse pointer without pausing).
- Projection: `UiWorldToPixel` and `UiPixelToWorld`.
- Gamepad navigation: `UiNav*`.
- Content measurement: `UiBeginFrame/UiEndFrame`.
- Sound: `UiSound/UiSoundLoop`.
- **Screens.** In-world `screen` entities run their own script, which draws with the same Ui API into a texture of the given resolution. In multiplayer, terminal scripts run on the server and stream draw-command deltas to clients, "similar to the X Window System" (voxagon blog).

### 4.4 Custom tools

The official example (api.html, `RegisterTool`):
```lua
#version 2
#include "script/include/player.lua"
function server.init()
  RegisterTool("lasergun", "Laser Gun", "MOD/vox/lasergun.vox", 6)  -- id, HUD name, vox or prefab xml, group 1-6
end
function server.tick()
  for p in PlayersAdded() do SetToolEnabled("lasergun", true, p); SetToolAmmo("lasergun", 60, p) end
  for p in Players() do
    if GetPlayerTool(p) == "lasergun" and InputPressed("usetool", p) then --[[ server-side effect: MakeHole/Shoot ]] end
  end
end
function client.tick()  -- client-side particles/sound for the same input
end
```

- Tools are disabled by default after `RegisterTool`.
- In the legacy (v1) API, a tool is enabled with `SetBool("game.tool.lasergun.enabled", true)` (modding guide).
- The tool body is engine-owned. Read it with `GetToolBody`, and animate it with `SetToolTransform` or `SetToolTransformOverride` rather than setting the body transform.
- Registry: each tool lives under `game.tool.<id>`. Seen keys are `.enabled` (official), `.name` and `.custom` (official mplib `tools.lua`). Base tool ids include sledge, spraycan, extinguisher, blowtorch, gun, shotgun, plank, pipebomb, bomb, rocket, rifle, steroid, explosive and wire (from mplib loot tables and API examples).
- The binary save format stores 17 built-in tool slots per player, plus a list of mod tools, each with an id, name, path, file, group, ammo and pickup amount (RE: `ToolInfo`/`ToolInfoExtended` in Teardown-Converter `scene.h`).

### 4.5 Registry

- **Structure:** "a hierarchical node structure and can store a value in each node (parent nodes can also have a value)". Values are float, int, bool or string with automatic conversion. Node names are limited to `a-z 0-9 . - _` (api.html).
- **Reserved roots** (api.html):
  - `options`: game settings, write-protected from mods.
  - `game`: engine internals.
  - `savegame`: persistent, write-protected.
  - `savegame.mod`: per-mod persistent data.
  - `level`: not reserved, but recommended for level-scoped data.
- **Keys confirmed in official code and docs:**
  - `game.tool.*`, `game.thirdperson` (api.html)
  - `game.map.enabled`, `game.disablemap`, `game.map.fade`, `game.gamemode`, `game.gamemode.next`, `game.levelid`, `game.pausemenu.gamemodes` (mplib)
  - `hud.disable`, `hud.hintinfo`, `characters.<id>.preview` (mplib)
  - `level.*` examples (api.html)
- **UNCONFIRMED:** frequently cited community keys such as `game.player.health`, `game.player.tool`, `game.player.canusetool` and `game.break*`. I could not reach an authoritative list.
- In binary saves, the registry is serialized as (key, value string, sync bool) triples (RE). A search snippet from the now-offline Dennispedia says `savegame.xml` and `options.xml` in the local Teardown folder use a `<registry>` XML element with lower-cased keys (UNCONFIRMED; page 404).

---

## 5. File formats

### 5.1 MagicaVoxel .vox (spec: https://github.com/ephtracy/voxel-model)

**Container**
- RIFF-style: `"VOX "` followed by an int32 version (150 or 200).
- Each chunk is `id[4]`, `int32 contentBytes N`, `int32 childrenBytes M`, then the content, then the children.
- Everything sits inside the `MAIN` chunk.

**Model chunks**
- `PACK` (legacy) holds a model count.
- `SIZE` holds int32 x, y, z. **z is up (the gravity axis).**
- `XYZI` holds int32 N followed by N×(x, y, z, colorIndex) bytes.
- Because coordinates are bytes, each model is limited to 256³, which is also Teardown's per-object limit.

**Palette chunks**
- `RGBA` has 256×4 bytes. Color slot i maps to palette index i+1, and index 0 is empty.
- `IMAP` is a 256-entry palette display-order map (Teardown's palette file uses one).
- `NOTE` holds row names (Teardown uses them for material labels).
- `MATL` has an int32 id plus a DICT of `_type` (`_diffuse/_metal/_glass/_emit`), `_rough`, `_spec`/`_sp`, `_ior`, `_metal`, `_alpha`, `_emit`, `_flux`, and so on.

**Scene graph chunks**
- `nTRN` (transform): node id, DICT (`_name`, `_hidden`), child id, reserved −1, layer id, frames. Each frame is a DICT with `_t` "x y z" and `_r` packed rotation byte.
- `nGRP` (group): child id list.
- `nSHP` (shape): references a model id.
- `LAYR`, `rOBJ` and `rCAM` hold editor-only render settings.

**How Teardown uses them**
- The XML `object="name"` attribute selects an `nTRN`'s `_name`.
- `SpawnLayer` and voxscript `CreateBrush("file.vox:object")` select by layer or object.
- "Newer objects that overlap older objects replace the voxels in the older object when imported" (modding guide, "Object Order"). This means the import rasterizes MagicaVoxel scene objects into shapes in creation order.
- Teardown is Y-up. The converter applies `rot × QuatEuler(90,0,0)` and a half-size XY offset when going between a runtime shape (whose origin is at the grid corner) and an XML `vox` (whose origin is at the bottom-center of the MagicaVoxel model) (RE, `WriteVox`).
- **Teardown extension chunk `TDCZ` (RE).** It contains int32 sizes plus a **zlib-compressed dense voxel array** and can replace `XYZI`. Teardown-Converter writes it when "compress vox" is enabled. Official VoxTool lists "File compression and decompression" (https://teardowngame.com/voxtool). That the game reads `TDCZ` is inferred from the converter offering it as an output option (UNCONFIRMED by Tuxedo Labs docs).

**Official guidance** (modding guide):
- Max object size is 256³.
- Prefer ≤128³, or large but thin shapes such as 256×256×10.
- Split hollow objects into several objects, e.g. separate walls and floors rather than one house shape, to avoid traversing empty space.
- Voxels must share faces to stay connected; edge or corner contact does not hold.
- Don't enclose soft materials inside hard ones (e.g. plaster grout between bricks), or they get stuck when broken.

### 5.2 Runtime and save binary: `.bin` / `.tdbin` (RE, Teardown-Converter `parser.cpp`)

**Where the files are**
- Shipped levels are pre-cooked as `Teardown/data/bin/<level>.bin` (also `dlcs/*/`).
- Saves are `AppData/Local/Teardown/quicksave.bin`, plus `quicksavecampaign` and `quicksavesession1..4` for multiplayer.

**Compression**
- The whole file is a **zlib stream**.
- Once decompressed it begins with the 5-byte magic `TDBIN` and 3 version bytes (e.g. 2,1,0). The converter supports 2.1.0.
- Strings are NUL-terminated; vectors are float32; quaternions are xyzw.

**Layout in order**
1. Header: `level_id`, `level_path`, `layers`, `mod` (strings); an unknown int; a marker `0xAAA1`; active mods list; spawn mods list.
2. `shadow_volume` (Vec3), `gravity` (Vec3), `spawnpoint` (Transform).
3. Handles of the `world_body` and of three engine scripts: `explosionclient.lua`, `characters.lua`, `achievements.lua`.
4. PostProcessing: brightness, colorbalance, saturation, gamma, bloom.
5. **Players**: one record per player.
   - Transform, pitch and yaw, orientation, velocity, health.
   - `bluetide_timer`, time underwater, driven vehicle, flashlights, animators.
   - 17 built-in tool records plus mod tools, and the current tool.
6. **Environment**:
   - Skybox: texture, tint, brightness, rotation, sun, constant, ambient.
   - Exposure and fog (type, color, params, height).
   - Water/wetness/puddles/rain, nightlight, ambience sound, slippery, fogscale.
   - Snow (dir, amount, onground), wind, waterhurt, lensdirt.
7. **Boundary**: vertices (Vec2) and pads.
8. **In-flight projectiles**: origin, dir, dist, maxDist, strength, type, player.
9. **Fires**: shape, position, max_time, time, painted, broken, spawned_count. Fire is a list of point emitters attached to shapes.
10. **Palettes**: a count, then for each palette 256 × (u8 type, RGBA float4, reflectivity, shininess, metalness, emissive, bool is_tint), a has_transparent flag, and the three 1024-byte tint tables.
11. **Registry**: a count, then (key, value, sync) entries.
12. **Entity tree**: a count of top-level entities, then recursive entity records. Each record is:
    - `u8 type`, `i32 handle`, `u8 tagCount` × (name, value), `desc`.
    - Type-specific payload.
    - `i32 childCount` followed by the children.
    - End marker `0xBEEFBEEF`.

**Type payloads** (abridged from `entity.h` and `parser.cpp`)
- **Body**: u16 flags, transform, velocity, angular velocity, bool dynamic, u8 active, friction + mode, restitution + mode.
- **Shape**:
  - u16 flags, transform, u16 shape_flags (0x10 = physical/collide), u8 collision layer, u8 mask.
  - Float density and strength; texture tile/weight; blendtexture tile/weight; texture offset; emissive scale; bool broken.
  - **Voxels**:
    - u32 sx, sy, sz.
    - If the volume is non-zero, the voxels are **run-length encoded as (count−1, paletteIndex) byte pairs in x-fastest order** (`data[x + sx*(y + sy*z)]`).
    - u32 palette_id, float scale (×10 = XML `scale`), u8 light_mask[8], u8 is_disconnected.
  - u8 origin (1 Tool, 2 MapInit, 3 Debris, 4 CreateShape, 5 Spawn) and an animator handle.
- **Light**: on, type (1 sphere, 2 capsule, 3 cone, 4 area), transform, color (linear; XML is gamma 2.2), scale, reach, size, unshadowed, angle (stored as cos), penumbra, fogiter, fogscale, area size, capsule size, flicker, sound, glare, breaksound.
- **Joint**: type (1 ball, 2 hinge, 3 prismatic, 4 rope, 5 cone), two shape handles, local positions and axes on each shape, connected, collide, rotstrength, rotspring, limits, max velocity, strength, size, sound, autodisable, `connection_strength` (3000 for planks), `disconnect_dist` (0.8 for planks). Ropes add color, strength, maxstretch, slack, segment length and a segment list.
- **Vehicle**: body, wheels, properties (topspeed, spring, damping, accel, strength, friction, max steer angle (30°), antispin, steerassist, antiroll, sound), camera/player/driver-seat/exit/propeller points, difflock, health, main voxel count, exhausts, **vitals** (body, position, radius, nearby voxel count), locations, passengers, brokenthreshold, smokeintensity.
- **Wheel**: vehicle, bodies, shape, ground shape plus voxel position, on_ground, transforms, steer, drive, travel, radius, width, angular speed, stance.
- **Water**: transform, depth, wave, ripple, motion, foam, color, PBR, drag, foam and splash params, sounds, visibility, polygon vertices.
- **Trigger**: type (1 sphere, 2 box, 3 polygon), sizes, polygon vertices, sound.
- **Screen**: transform, size, bulge, resolution, script, enabled, interactive, emissive, fx params.
- **Script**: flags, file, then server ScriptCore and client ScriptCore. Each ScriptCore holds params, timers, Lua globals table, owned entities, sounds, transitions and sprites.
- **Animator** and **Rig**: partially decoded.

**What this means for a clone**
- The save format is a direct dump of the live scene. The entire destructible world is voxels, and simulation state includes velocities, fires, projectiles and Lua VM globals.
- RLE over dense byte grids keeps it compact.
- The voxagon blog says full scene serialization is "typically 30–50 MB". That was a reason multiplayer join-in-progress replays the destruction command stream instead of sending the scene.

### 5.3 Runtime memory layout (RE, TDLL `teardown_structs.h`, game 2.0.4+)

- `Game` (+0x50 → `Scene*`, +0xB8 → `Player*`, +0xC8 → `td_vector<Palette>*`, +0x1B4 → `time_scale`).
- `Scene` has `FireSystem*` and `Environment*`, shadow-volume size, and **two entity lists: `client_entities` (+0x208) and `server_entities` (+0xA18)**. The engine therefore keeps separate server and client scene copies, which matches the 2.0 client/server design.
- `Entity` is 0x40 bytes: type at +8, handle at +0xC.
- `Shape`: shape_flags (+0xC8), density (+0xD0), textures, `Voxels*` (+0xF0).
- `Voxels`: size[3], **`uint8_t* voxels` dense array**, scale, palette id.
- `Fire` is 0x48 bytes and holds a shape and a position.
- `Player.heats` is a `td_vector<Heat{Shape*, x,y,z, amount}>`. Blowtorch heat is tracked **per voxel coordinate** in a sparse list, not as a grid.
- `Script` holds a ScriptCore, which holds a `lua_State*`. There is one Lua VM per script.

---

## 6. How levels are built from vox files

### 6.1 Composition

- A level is an XML tree of `body`/`vox`/`voxbox` nodes.
- Each `vox` names a .vox file and an `object` within it. Many shapes reference the same file.
- Bodies without `dynamic="true"` are static.
- Shapes outside any body attach to the implicit static world body.
- `prop="true"` on a vox or voxbox gives it its own dynamic body.
- Static structures become dynamic only when cut loose. `IsStaticShapeDetached` and `IsBodyJointedToStatic` exist for this.
- Converted official levels use thousands of shapes, each with ≤256³ voxels; some cooked runtime shapes exceed this and appear as `compound` (RE).

### 6.2 Prefabs and instances

- An editor group can be "converted to a prefab". It is saved as a separate XML file and placed with `<instance file=…>`.
- Committing edits to one instance updates all instances (modding guide).
- Prefabs are also the unit for `Spawn`, `spawn.txt` and `RegisterTool` (which accepts a vox file or a prefab XML).

### 6.3 Procedural voxels: voxscript (https://www.teardowngame.com/modding/voxscript.html)

- Lua scripts run **at level build time** to generate shapes.
- Parameters declared outside `init` "will show up in the editor".
- **API:**
  - Parameters: `GetFloat/GetInt/GetBool/GetString/GetColor(name, default)`.
  - Randomness: `Randomize`, `GetRandomFloat/Int`.
  - Materials and brushes: `CreateMaterial(type, r,g,b,a, reflect, shiny, metal, emissive)`, `CreateBrush("file.vox[:object]", local)`, `Flip/Rotate/TranslateBrush`, `GetBrushSize`, `Material(handleOr0)`.
  - Images: `LoadImage(png, [grassMap])`, `GetImageSize`, `GetImagePixel`.
  - Shapes and drawing: `Vox(x,y,z, rx,ry,rz)` starts a new shape. Then `Box`, `Sphere`, `Line(…, thicknessStart, thicknessEnd)`, `Set(x,y,z)`, `Get(x,y,z)` and `Heightmap` draw into it.
- **Terrain generation:**
  - Official terrain is built with `ground.lua`. Its PNG input uses the **R channel for height** (scale 256 means 1 brightness unit = 1 voxel), G for grass height/density, and B for roads.
  - Presets are fixed: dirt, grass, and a concrete road (masonry, which the sledge can't break).
  - VoxTool (v0.87, https://teardowngame.com/voxtool) adds mesh2vox, heightmap terrain (16-bit height, an indexed 8-bit material map, colormap, grass density/color, soil and fill layers such as indestructible rock underneath, and triplanar "projective" textures), palette replacement, connectivity fixes and shape-count optimization.
  - Source: the official guide https://docs.google.com/document/d/1QClYTQXLVRIDuUNYZu3WtsPIPJ43gK5tevP4lGm1mzY

---

## 7. Multiplayer and engine-limit evidence

### 7.1 Official multiplayer (PC launch 12 March 2026; 12 players)

Sources: blog.voxagon.se 2026-03-13 and 80.lv.

**Network model**
- The host is the server. Transport is Steam Networking.
- A reliable stream carries scene-changing commands. Unreliable packets carry transforms, velocities and player positions.
- **Destruction is deterministic.** Destruction logic was rewritten in **fixed-point integer math**, since voxel volumes are discrete. Breakage is emitted as a command stream, such as "cut hole in this shape at voxel coord x,y,z", plus ownership changes and joint reconnections. All clients apply the commands in order. Bandwidth is independent of object size.
- **Physics uses state sync.** Each client has its own priority queue that favors visible objects, with a budget of about 1 Mbit per client. Clients simulate locally and snap to corrections.
- **Join-in-progress** replays the buffered command stream. When the buffer cap is hit, join is disabled; the numeric cap is UNCONFIRMED.
- A 20 Hz tick rate is reported by one review site only (UNCONFIRMED).

**Scripting implications**
- Old (v1) scripts run in single-player only. Their levels can load in multiplayer with scripts disabled.
- Existing API functions gained optional `playerId` parameters.

**Level markup conventions**
- These are official but optional: a `multiplayer` group with locations tagged `playerspawn`, `teamspawn=N`, `ammospawn rarity=low|medium|high` and `pointofinterest=N`.
- Crate colors: gray, blue, red, and purple for mod tools (modding-mp).

**Official helper library**
- `mplib` (Lua modules: teams, spawn, tools/loot, HUD, UI, stats, countdown, spectate, event log): https://github.com/tuxedolabsorg/mplib

### 7.2 Notable community mods and tools showing the engine's limits

- **TDMP (Teardown Multiplayer)** came before official multiplayer. It was done "through reverse engineering and DLL injection" (voxagon blog), shipped through a launcher (https://github.com/TDMP-Team/TDMP-Launcher-Public), and supported game 1.3.0.
  - Destruction was client-side, so walls could differ between players (PC Gamer, via search).
  - It broke with game updates such as 1.5.
  - It shows that the engine was not designed for network sync. Official multiplayer required rewriting destruction in fixed point.
- **TDLL** (https://github.com/TTFH/TDLL) is a `winmm.dll` proxy that adds Lua functions by direct memory access, which shows what the official API does not expose:
  - Voxel and texture access: `GetShapeVoxelMatrix`, `SetShapeScale`, `SetShapePalette`, `SetShapeTexture`, `SetPaletteMaterialType`.
  - World geometry: `SetWaterVertex`, `SetBoundaryVertex`, `RemoveBoundary`, `GetShadowVolumeSize`.
  - Heat and fire inspection: `GetHeatInfo`, `GetFireInfo`.
  - Joints: `SetJointStrength`.
  - External: HTTP and UDP.
- **Teardown-Converter** converts cooked `.bin` levels and quicksaves back into editable XML and vox. It is the best open documentation of the binary format.
- **Large maps.** Workshop maps of about 2000×2000 voxels (~200 m) of forest exist. Map pages commonly recommend "performance mods" for detailed maps, and one community mod "freezes every voxel to reduce lag". No official hard voxel cap is published; a 2021 update added total-objects and total-voxels counters (search results via top-mods.com and Steam; UNCONFIRMED specifics).
- **Physics and performance mods** in the GitHub topic list (https://github.com/topics/teardowngame) include SigmaSkid/IntrusivePerformance and Z-offset (prevents z-fighting by offsetting shapes). They indicate pain points in debris count and coplanar shapes.

---

## 8. Remaining unknowns (UNCONFIRMED)

- The full official built-in tag list, which exists only in the editor's tooltip help.
- Exact semantics of shape `texture`/`blendtexture` tile indices.
- How `strength` scales breakage.
- The mass formula.
- The meaning of `shadowVolume` beyond its name and default.
- That the `ice` material maps to palette rows 185–192.
- That the game reads the `TDCZ` chunk.
- The paint-tint mechanism.
- Exact values of the debris "small/large" threshold.
- A complete `game.*` registry key list, including keys like `game.player.*`.
- Numeric multiplayer limits (join buffer size, tick rate).
