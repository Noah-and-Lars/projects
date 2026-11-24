# TEARDOWN — Research Report for Building an Original Voxel-Destruction Game

Compiled 2026-11-24 by the research session. This is the **master report**. It distils eight detailed research files, which go with it as appendices:

| File | Contents |
|---|---|
| `00-container-facts.md` | What the cloud container can do (WebGL/WebGPU headless, CPU, RAM) — verified by running it |
| `01-gameplay.md` | Story, maps, missions, heist loop, alarms, all 17 tools with upgrade data, ranks/economy, player controller, vehicles, modes, DLC/multiplayer timeline, critic reception |
| `02-engine-rendering.md` | Voxel data model, palette/materials, the full rendering pipeline pass by pass, lighting, post-processing, visual damage |
| `03-physics.md` | Rigid bodies, solver, connectivity/splitting, MakeHole/explosions/fire/water/joints/ropes/vehicles/player physics, debris, multiplayer determinism |
| `04-modding-formats.md` | Entity tree, XML level format, material palette index ranges, Lua API surface (= how the engine is structured), .vox and save formats |
| `05-tech-implementation.md` | How to build it: stack recommendation with measured benchmarks (three.js, Rapier voxels, greedy meshing, connectivity), testing strategy, assets, audio |
| `06-ai-audio-art-feel.md` | Robots/chopper AI, alarm system, audio design, art direction, game feel, level design patterns, performance limits, patch history, peer games |
| `07-gap-numbers.md` | Gap-fill: concrete numbers (tool radii, player params, explosion internals) recovered from official open-source code and community copies (see that file for what was / wasn't found) |
| `08-lighting-look.md` | Gap-fill: hands-on prototype of how to get a Teardown-like look in WebGL2, with tested shader code and screenshots |

**Confidence labels used throughout:** **[DEV]** developer's own words / official docs; **[RE]** third-party reverse engineering (frame captures, file-format parsers); **[WIKI]** community wiki; **[MEASURED]** run in the container by the research session; **UNCONFIRMED** = no reliable source found (a guess or inference; treat as a design choice, not a fact).

> **Important framing for the builder:** the goal is an **original game in the same genre with similar mechanics and similar-quality voxel physics** — not a copy of Teardown. Do not reuse Teardown's name, story, characters (Löckelle, Gordon Woo, BlueTide, Quilez…), map layouts, assets, sounds, music, UI art or logo. Mechanics (voxel destruction, heist timer, tools, material hardness tiers, connectivity collapse, fire, vehicles) are genre conventions and fine to implement in your own way.

---

## 1. What Teardown is (one page)

- **Developer:** Tuxedo Labs (Malmö, Sweden), founded by **Dennis Gustafsson** (engine/physics programmer; ex-Meqon physics SDK → AGEIA/PhysX; Mediocre: Smash Hit, Sprinkle). Early Access 29 Oct 2020, 1.0 on 21 Apr 2022, PS5/Xbox Nov 2023, online multiplayer (up to 12 players) PC 12 Mar 2026 / consoles 15 Sep 2026. ~95% positive on Steam (77k reviews). Price $29.99. [DEV/PRESS]
- **Pitch:** "Plan and execute the perfect heist in a fully destructible world." First-person. Every object is made of **10 cm voxels** and can be broken, cut, burned, blown up, driven through. [DEV]
- **Core loop:** each mission has an **untimed planning phase** (cut holes, build plank bridges, stage vehicles, move obstacles) and a **60-second execution phase** that starts when you touch the first alarmed target; collect all required targets and reach the **escape vehicle** (where you spawned) before security arrives. [DEV design notes]
- **Why it works (critics):** tactile, convincing destruction as the core verb; every level is an open puzzle with no set solution; plan-then-sprint tension; ray-traced lighting makes chunky voxels look real; huge mod scene. **Criticisms:** no structural stress (buildings stand on one voxel), repetitive "grab all things" objectives, instant-fail timers, hardware demands. [PRESS]
- **Tech in one sentence:** a custom C++ engine where the world is thousands of independently-transformed dense voxel grids (1 byte/voxel palette index, ≤256³ each), rendered by rasterizing each object's bounding box and ray-marching its 3D texture in the fragment shader, lit by stochastic ray tracing through a world-wide 1-bit occupancy volume, simulated by a custom voxel-vs-voxel rigid-body solver (projected Gauss-Seidel, 8 iterations, 60 Hz), with destruction = sphere carving by hardness class + connectivity-based splitting. Gameplay is Lua. [DEV/RE]

---

## 2. Design pillars to carry over

1. **Everything breaks, but by rules the player can learn.** A 13-material ladder decides which tool breaks what (sledge can't break brick; blowtorch cuts thin metal but not plaster; only explosives break hard materials; rock/ground/heavy metal never break). The tutorial teaches it: "I can't sledgehammer through this wall because it's brick. Ah, there's a window." [DEV]
2. **Trustworthy environment.** Gustafsson deliberately chose connectivity-only physics: a building stands as long as any voxel connects it to the ground. "You can trust the environment… that gives you more ability to plan." (It is also the #1 realism criticism — see §10.4 for an optional improvement.) [DEV]
3. **Plan, then execute.** Generous tools + a timer, instead of scarce resources ("restricting resources just doesn't make the game fun"). Quicksave allowed only during planning. Optional targets are placed to "break up the most efficient path". [DEV]
4. **Obstacles in a destructible world are only elevation, distance, water and the few unbreakables.** Levels are small (≤ ~400 m), cluttered and vertical; you always spawn at the exit. [DEV]
5. **Systemic emergence:** fire spreads and triggers fire alarms, explosions start fires, vehicles ram walls, ropes slingshot cars, water kills robots, etc.
6. **Physical feedback everywhere:** voxel chips fly, dust/smoke clouds, material-specific hit/break/slide sounds in 3 sizes, room-acoustic reverb, scorch marks.

---

## 3. Gameplay systems (details for implementation)

### 3.1 Heist structure, alarms, security [DEV design notes; WIKI]
- Win = all **required** objectives + enter escape vehicle (enterable only once required objectives are done; it then drives away by script). Optional targets add score.
- **Alarm timer:** 60 s default (options: off, +15/+30/+60 s, −10/−20 s). Fail message: "You failed to escape before security arrived."
- **What actually starts the alarm (from shipped mission script `heist.lua`, see `07-gap-numbers.md`):** not "picking up a target" by itself — the alarm fires when an **alarm box** wired to the target is broken, its rope/wire or joint breaks, the box comes loose (becomes dynamic), or a jointed body drops below half its starting mass; also alarm robots, some special targets, water-sensitive safes, and **fire count reaching 100**. Timer = 60 s + difficulty option. (Player-facing effect is the same: tampering with a wired target sets it off.)
- **Security helicopter (timer role):** appears when **15 s remain** and glides from a start point to an end point near the escape vehicle. Per the shipped script it is **cosmetic** — the mission fails when the timer reaches 0 (the wiki's "fail if the chopper reaches the vehicle" is effectively the same moment). In "chopper missions" it instead *replaces* the timer: always knows your general area, fires only when you're in its spotlight, **beeps before firing**, may fire missiles that make bomb-sized holes and start fires, turns toward loud noises (players use decoys). Cannot be damaged.
- **Alarm sources (mission modifiers):** wired **alarm boxes** on targets (trigger if target tampered, box broken/knocked loose, or wire cut); **fire alarm** (too much fire); **moisture sensor** (target must not get wet); **explosion sensor** (attached object broken); **demolition sensor** (>1% destruction during prep = busted); camera/**alarm robots** (2 s continuous scan); hackable terminals that disable alarms; security/blast doors that close on alarm; lasers.
- **Heavy targets:** some alarmed targets sit on heavy objects (safes) → choose between moving them during prep or risking it in the run.
- **Quicksave:** one slot, any time in prep, disabled once the alarm sounds.
- **Mission types:** heist (most common); demolish/reduce building height; dump objects into water; vehicle theft (drive cars into a trailer); race; chopper-hunted (no timer); chase; destroy N% (50/70/90%) within a timer; robot stealth; photo objectives; escort/finale (divert a slow bomb truck).
- **Challenges (any map):** *Mayhem* (destroy max voxels in 60 s; timer starts after 1,000 voxels destroyed; star every 200k voxels to 1M), *Hunted* (chests spawn one at a time, chopper hunts you; 2nd chopper at 15 chests), *Fetch* (15–17 alarmed chests, grab as many as possible in 60 s).
- **Sandbox:** infinite ammo, no timer, weather/time-of-day presets (sunrise, sunny, fog, rain, sunset, night, night rain, snow), spawn menu.

### 3.2 Progression & economy [WIKI; DEV]
- **Score → rank → tool unlock:** 0 Sledge/Spraycan/Extinguisher · 5 Blowtorch · 10 Shotgun · 15 Plank · 20 Pipe bomb · 30 Pistol · 40 Bomb · 50 Cable · 60 Rocket · 70 Leaf blower · 80 Rocket booster · 90 Vehicle thruster · 100 Nitroglycerin · 110 Rifle · 120 Energy drink; then cash ($1k→$5k) to 200. Max score 204. Tools arrive as crates at the hub.
- **Cash** comes mostly from **hidden valuables** ($1–$1,500, most $15–$400, often joke/story items). Cash buys **tool upgrades** (ammo count, blast size, range, damage), which carry into sandbox. Ammo refills each mission.
- **Hub:** a home base whose computer has Messages (story via one-way emails), Missions (map), Tools (upgrades). The hub visibly improves over the campaign.

### 3.3 Tools (17 in campaign) — what they do [WIKI infoboxes; DEV materials table]
(Full upgrade numbers in `01-gameplay.md` §6; concrete hole radii etc. in `07-gap-numbers.md`.)

| Tool | Behaviour | Breaks | Ammo/upgrades (base→max) |
|---|---|---|---|
| Sledgehammer | unlimited melee, removes voxels near crosshair | soft only (glass, foliage, dirt, wood, plaster, plastic) | — |
| Spray can | paints voxels (route marking; visible on map) | — | — |
| Extinguisher | foam particles that put out fire | — | unlimited |
| Blowtorch | heats voxels until they melt; most precise cutter; starts fires | glass, foliage, wood, plastic, **weak metal**; not plaster/dirt/brick | fuel 20→60 s |
| Shotgun | pellet spread, falloff | up to brick/concrete/weak metal | 12→96 shells; range 20→60; dmg 3→5 |
| Plank | click-drag to place a wooden plank between two points (bridges, supports, fastening) | — | 8→64 planks; width 3→5; length 40→64 |
| Pipe bomb | thrown, fuse, can ignite | all destructible | 6→36; blast 2→4 |
| Pistol | precise long-range, low damage; detonates distant explosives | up to brick/concrete/weak metal | 6→36; range 40→100; dmg 1→3 |
| Bomb | placed, ~2.5–3 s timer, walk-through hole | all destructible | 6→36; blast 4→6 |
| Cable/rope | rope between 2 points; pulls harder near max length; snaps from a bullet; tow safes behind cars | — | 6→24; stretch 3→5 |
| Rocket launcher | slow projectile with drop | all destructible | 6→24; blast 3→5 |
| Leaf blower | pushes objects/debris, boosts fire, clears snow | nothing | power 20→50 |
| Rocket booster | stick a thruster on any dynamic object; activate with interact | — | 6→24; power 200→400; 4→8 s |
| Vehicle thruster | thruster tied to a vehicle's throttle | — | 6→24 |
| Nitroglycerin | sticky canister, explodes when damaged, chainable; most destructive | all destructible | 4→16; blast 5→8 |
| Rifle | scoped, penetrates multiple obstacles, slow | up to brick/concrete/weak metal | 6→18 |
| Energy drink | consumable speed/jump boost | — | magnitude UNCONFIRMED |

### 3.4 Player controller [DEV API; community]
- First-person (third-person option added late). WASD, Space jump, Ctrl crouch, E interact/enter vehicle, LMB use tool, **RMB hold = grab** physics object (hold in front; scroll changes distance; LMB while holding = throw), F flashlight, Tab map, 1–9/wheel select tool. **No sprint.**
- Walking speed param 7 and jump speed 5 (API examples; UNCONFIRMED defaults). Hurt-speed scale 2/7. Health 0–1, regenerates. Damage from explosions, fire, falling, bullets, drowning, cold water. Friction 0.8. Gravity (0,−10,0). Eye height ≈1.7 m.
- Player ≈ **180 cm ≈ 18 voxels**; community measures: walk clearance 14–16 voxels, crouch 9–13, width 5–6 voxels.
- Grab mass limit, jump speed, fall-damage curve: see `07-gap-numbers.md` (largely UNCONFIRMED).
- FOV default 90 (60–120 option); "head movement" sway slider; camera shake on events.

### 3.5 Vehicles [WIKI; DEV API]
- Many drivable vehicles: cars, vans, trucks, excavators/loaders/cranes/forklifts (with arm controls: raise/lower/action), boats, tank. Top speeds 4–120 km/h. Driven with throttle/brake/handbrake; enter/exit with E; deep water ejects the player.
- Vehicle bodies are voxel objects and take damage; frames and wheels are indestructible; vehicle health 0–1 from damage to "vital" voxel regions; parameters: spring, damping, topspeed, acceleration, strength, antispin, antiroll, difflock, steerassist, friction; wheels: drive, steer, travel.
- Vehicles are the main tool for moving heavy loads and ramming walls.

### 3.6 Enemies [WIKI; DEV]
- Launched with **no enemies**; robots added in Part 2 because enemies "disrupted the destruction gameplay" otherwise. Enemies are **puzzle objects**, not damage sponges:
- Robots: colour-coded face light = threat (yellow gun burst, red flamethrower chaser, blue missile, white camera = alarm after 2 s scan). Vision **150° FOV, 25 m**; hearing via "loudest sound last frame" (every gunshot/explosion/impact is a stimulus). Bullets stun 0.2 s; explosions stun up to ~4 s by distance; **only water kills them** (push/carry/dump them in). Patrol routes, investigate last sound, chase.
- Path planning API for AI on a destructible world (query path, async).

### 3.7 Other gameplay elements
- **Water:** volumes (not simulated fluid); buoyancy by material (wood/foliage/plastic float); slows player/vehicles; drowning; hypothermia in cold water; robots die in it.
- **Weather:** rain (wet roads reduce grip, puddles, lightning can start fires), snow (procedural snow on surfaces, cleared by leaf blower), fog, night (flashlight), wind, tornado missions.
- **Map view (Tab):** overview with targets, escape vehicle, spray marks.
- **Photo mode** with DOF/exposure/bloom/free camera.
- **Creative mode:** build voxel objects and spawn them.

---

## 4. The voxel world model (engine core) [DEV; RE]

- **Voxel = 10 cm** (chosen for the MagicaVoxel look). Player ≈ 18 voxels tall.
- **Scene = tree of entities:** Body → Shape(s); also Light, Location, Water, Joint (ball/hinge/prismatic/rope), Vehicle, Wheel, Screen (in-world UI), Trigger, Script. An implicit static **world body** owns all non-dynamic shapes. Static shapes become dynamic when cut loose.
- **Shape = dense 3D grid, 1 byte per voxel = palette index (0 = empty), max 256³**, own local transform (free rotation). Official guidance: keep objects ≤128³ or flat (256×256×10); **never build a house as one object** — split walls/floors into thin objects. Large levels: thousands of shapes, ~0.5 billion voxels.
- **Material is decided by palette index, not colour.** Official palette index ranges (parsed from the official palette file; matches docs "index 9 = grass, wood 57–72"):

| Indices | Material | Hardness | Sledge | Torch | Guns | Explosives |
|---|---|---|---|---|---|---|
| 1–8 | glass (row also hosts emissive lamp colours) | soft | ✓ | ✓ | ✓ | ✓ |
| 9–24 | grass/foliage | soft | ✓ | ✓ | ✓ | ✓ |
| 25–40 | dirt | soft | ✓ | ✗ | ✓ | ✓ |
| 41–56 | rock | unbreakable | ✗ | ✗ | ✗ | ✗ |
| 57–72 | wood | soft | ✓ | ✓ | ✓ | ✓ |
| 73–88 | concrete (engine type "masonry") | medium | ✗ | ✗ | ✓ | ✓ |
| 89–104 | brick (engine type "masonry") | medium | ✗ | ✗ | ✓ | ✓ |
| 105–120 | plaster | soft | ✓ | ✗ | ✓ | ✓ |
| 121–136 | weak metal | medium | ✗ | ✓ | ✓ | ✓ |
| 137–152 | heavy metal | unbreakable | ✗ | ✗ | ✗ | ✗ |
| 153–168 | plastic | soft | ✓ | ✓ | ✓ | ✓ |
| 169–176 | hard metal | hard | ✗ | ✗ | ✗ | ✓ |
| 177–184 | hard masonry | hard | ✗ | ✗ | ✗ | ✓ |
| 185–224 | reserved (possibly ice) | | | | | |
| 225–240 | unphysical (rendered, no collision) | | | | | |
| 241–255 | reserved (254 = snow, RE) | | | | | |

- Each palette entry: material type, RGBA, reflectivity, shininess (=1−roughness), metallic, emissive (0–32). Emissive voxels **don't** light the scene; real lights are separate entities parented to the shape (shooting the lamp breaks the light). Glass: binary transparency.
- **Paint/char = palette index swap:** at load, tinted variants (yellow spray, black soot, several strengths) of every used colour are precomputed into unused palette slots; painting remaps indices. No per-voxel colour storage. [DEV Spraycan post]
- **Connectivity is 6-neighbour (faces).** Edge/corner-touching voxels fall apart once dynamic.
- **Authoring rules:** never put softer material inside/between harder material (soft grout between bricks gets stuck when broken — make grout from brick material in a lighter colour); rebar (hard) inside concrete is fine; walls as multi-layer (structure/insulation/finish).
- Per-shape `density` and `strength` multipliers exist (exact effect UNCONFIRMED). Mass ≈ voxel count × 0.001 m³ × density (formula UNCONFIRMED but natural).
- **Separate physics representation** (also voxel data) is regenerated at load, not saved.
- Saves = full scene dump, RLE-compressed voxels (15–20%), 30–80 MB for big levels; includes velocities, fires, projectiles and script state.

---

## 5. Destruction & physics [DEV unless marked]

### 5.1 Solver and stepping
- Custom rigid-body engine: **projected Gauss-Seidel / sequential impulse, 8 iterations** [DEV tweet 2022]. Friction clamped to μ·normal impulse; penetration fixed via velocity bias. Collision is **voxel-vs-voxel on the CPU** (SIMD + multithreaded). Contact-generation details UNCONFIRMED (typical approach: sample surface voxels of one shape against the other's grid).
- **Fixed 60 Hz** update (dt 1/60), at most 2 steps per rendered frame (below 30 fps the game slows rather than spirals); rendering interpolates between steps. Gravity −10.
- Sleeping: bodies that stop moving leave the simulation. Collision filter: 8-bit layer/mask.
- Per-body friction/restitution with combine modes (average/min/multiply/max).

### 5.2 Damage primitive: `MakeHole(pos, rSoft, rMedium, rHard)`
- **Every damage event is three nested spheres**, one radius per hardness class (soft ≥ medium ≥ hard). Soft = glass, foliage, dirt, wood, plaster, plastic; medium = concrete, brick, weak metal; hard = hard metal, hard masonry. Unbreakable never removed. Sledge has medium=hard=0; guns have hard=0. Returns voxel count removed.
- **Explosion(pos, size 0.5–4.0):** carves holes (all three classes), pushes bodies outward, may ignite, blackens surfaces (paint "explosion"), damages the player by distance. Tools map to sizes (pipe bomb 2→4, bomb 4→6, nitro 5→8 in upgrade units). Concrete per-tool numbers: `07-gap-numbers.md`.
- **Bullets** are ray/sphere casts (no tunnelling), carving small holes at hits; rifle penetrates.
- **Heat:** blowtorch adds heat to voxels; at a critical value the voxel is destroyed and can ignite neighbours.
- **Impacts:** fast heavy objects/vehicles break walls (mechanism UNCONFIRMED; likely contact-impulse threshold → small carve at contact point, gated by hardness). Joints/plank attachments break under heavy stress.

### 5.3 Connectivity, splitting, collapse
- After voxels are removed, the engine finds **face-connected components**; any component no longer connected to the static world becomes a **new dynamic body** (keeps palette; mass recomputed; joints re-attached to whichever fragment holds the anchor). Dynamic bodies split too.
- Finding whether a chunk is still connected **across many shapes and hundreds of millions of voxels** was "one of the biggest technical challenges"; Early Access had a search-distance limit (houses with a removed ground floor stayed up); a new algorithm in Feb 2021 with "unlimited search distance, an order of magnitude faster" shipped in 0.7 ("Large disconnected chunks now fall properly"). The algorithm itself is unpublished. Sensible approach: search outward only from voxels adjacent to the removed region, stop each search as soon as it reaches an anchor, and whatever search exhausts without reaching an anchor is a floating island (see `05-tech-implementation.md` §4.3).
- **No load/stress simulation** by design ("hundreds of millions of voxels… so I'm not doing that"). Local collapse is faked with **breakable joints** between authored building parts. A structural-integrity prototype by the developer was shown Sep 2026 (not shipped).
- **Debris:** small disconnected residue can be deleted (`SplitShape(removeResidual)`); community reports pieces <25 voxels get removed when the camera looks away (UNCONFIRMED). Visual chips are particles. Big moving voxel objects are expensive (lighting volume update).

### 5.4 Fire
- Fires are point entities attached to burning voxels on flammable material (wood, plastic, foliage; plaster barely). Spread to neighbours, consume voxels (feeding collapse), make smoke. Capped by count (`game.fire.maxcount`; community figures 100 → several thousand by version) and spread rate (one source: max 4 new spreads per update). Extinguished by extinguisher foam particles, water, or removing the voxels; leaf blower boosts fire. Too much fire triggers fire alarms.

### 5.5 Water, joints, ropes, vehicles, player
- Water: polygon volumes with depth, waves, ripples, foam, drag; buoyancy per voxel/material ("voxels make buoyancy easier to implement than to spell"); boats are vehicles that float.
- Joints connect **two shapes** (survive splits): ball, hinge, prismatic, rope; motors (velocity/target), limits, spring/strength; break when their anchor voxels are destroyed or under force (planks: connection strength 3000, disconnect distance 0.8 — RE).
- Ropes: point chains with slack, strength, max-stretch; break when over-stretched or shot.
- Vehicles: see §3.5; wheel model UNCONFIRMED.
- Player: kinematic/dynamic controller with ground contact, moving-platform velocity, grab via force-limited constraint (UNCONFIRMED).

### 5.6 Multiplayer (if ever needed)
- Host-as-server, 12 players. **Destruction = deterministic, reliable command stream** ("cut hole in shape S at voxel x,y,z", "change ownership", "reconnect joint") with destruction rewritten in **fixed-point integer math**; **physics = unreliable state sync** with per-client priority queues (~1 Mbit/s/client); late joiners replay the command log. Lesson: if multiplayer may come later, make carving/splitting integer-deterministic and command-driven from day one.

---

## 6. Rendering (how Teardown gets its look) [DEV GPC 2025 talk; RE frame analyses]

- OpenGL 3.3, no compute, no hardware RT (DX12 later). "Everything is volumetric data" except water surfaces and cables.
- **Primary visibility:** each shape = one draw call of its bounding box (12 triangles, back faces); fragment shader transforms the ray to object space and runs an **Amanatides–Woo DDA** through the shape's 3D texture, using two extra mips (2³, 4³ blocks; dims padded to multiples of 4) for empty-space skipping; writes `gl_FragDepth` + deferred G-buffer (albedo, normal, material [reflectivity, smoothness, metallic, emissive], motion vectors, linear depth). Front-to-back with periodic depth copies for a custom early-out.
- **Secondary rays (all lighting):** one **world-space, axis-aligned 1-bit occupancy volume** of the whole level (2×2×2 voxels per byte + coarse mips; ~500 MB for 4 billion voxels; updated on the CPU by re-rasterizing moved/changed shapes, uploaded in sub-boxes). Three trace qualities: exact DDA, fixed-step, coarse mip "cone-ish" stepping. This structure limits levels to ~4,000 voxels (400 m) per axis.
- **Lighting:** fully dynamic, nothing baked, **no GI**. Ambient/AO: 2 cosine rays/pixel up to 24 units (sky ambient where unoccluded) + 1-voxel screen-space step. Sun: 1 jittered shadow ray/pixel (soft penumbra via `sunSpread`). Local lights (sphere, cone, capsule, area, screen): 1 ray/pixel to a random point on the light → true soft area shadows; inverse-square falloff. Blue noise (512² texture, golden-ratio animated) + R2 sequences; **lighting demodulated**, spatial bilateral (12 taps, depth+normal weighted), temporal accumulation with neighbourhood clamping.
- **Reflections:** trace reflection ray through the occupancy volume (≤32 units); if the hit is on screen use its lit colour, else sky.
- **Volumetrics** (fog, light shafts) at half resolution; distance/height fog; skybox.
- **Transparency** (glass, smoke) is **dithered/stochastic**, resolved by TAA. Smoke = CPU fluid-ish particles drawn as dithered billboards lit by the same lighting.
- **Post:** auto-exposure (α 0.05/frame), TAA, bloom (half-res pyramid), DOF (half-res), motion blur, saturation, colour balance, tonemap `1−exp(−x)`, gamma 2.2, optional barrel distortion and lens dirt (only when the sun is visible). Screen-space normal blur gives a slight bevel to voxel edges. Per-voxel detail textures (one texel per voxel) add micro-variation.
- **Performance:** 2018 prototype ≈ 9 ms GPU for all lighting at 1080p on a GTX 1080; min spec GTX 1060 4 GB. Destruction-heavy scenes are CPU-bound.
- **Art look:** golden-hour key light, desaturated industrial materials with saturated brand accents, MagicaVoxel-style blockiness under realistic lighting.

**For a browser game:** see §9 and `08-lighting-look.md` for what is feasible in WebGL2 and tested shader code.

---

## 7. Audio [DEV composer write-up]

- One composer/sound designer. **Impact sounds keyed by material group × size class × event**, not per object: 7 audio material groups (wood, metal, glass, plastic, masonry, foliage, dirt) × hit/break/slide × 3 sizes × several random variations. "The engine isn't aware that a chair is a chair, just that it's made of wood and how big it is."
- Explosions: 3 sizes × variations. Weapons recorded dry; **room acoustics** simulated by a CPU voxel ray tracer (room size → early reflections + reverb tail; wood damps more than masonry).
- Vehicles: ignition, idle loop, drive loop with pitch from speed, shut-off, tyre screech, gravel, reverse beeps.
- Ambient loops on props (fluorescent lights, machines); a broken light's loop ends with a spark. Rain adds a wet layer to footsteps. Alarm: distant layered bells/klaxons; music switches to an intense heist cue during the countdown.
- Music: ambient / post-rock / surf-jazz, per-map heist and non-heist tracks.
- Engine sound API: positional sounds with nominal distance (default 10 m) for attenuation; numbered variants picked randomly; loops must be refreshed every frame; "loudest sound last frame" registry feeds AI hearing.

---

## 8. Level & art direction guidance [DEV; WIKI]

- Maps ~350×300 m (largest ~400 m), dense, vertical; few unbreakables (ground, rock).
- Typical construction: brick factories with glass windows; wooden cabins on stilts; concrete/scrap-metal compounds; plaster interior walls; concrete floors; props (furniture, computers, propane tanks that explode, cars, boats).
- Optional targets off the optimal route; spawn at the exit; escape by van (land) or boat (water maps).
- Weather/time presets drastically change mood (sunset/golden hour is iconic).

---

## 9. Recommended implementation (from measured research) [MEASURED + sources — see `05`, `08`, `00`]

**Platform:** browser game, **TypeScript + Vite**, static build (deployable as static files). Reason: it can be tested headlessly in this container (WebGL2 works via SwiftShader; WebGPU only with `--enable-unsafe-webgpu` on localhost, software adapter).

**Libraries (versions verified on npm 2026-11-24):** `three@0.187.0` (WebGL2 renderer), `@dimforge/rapier3d-compat@0.21.0` (or `-simd-compat`; `-deterministic-compat` if cross-machine determinism is needed), `vitest`, Playwright 1.63 (preinstalled; don't reinstall), `pixelmatch@8.0.0`, `vox-reader@4.0.1` (MIT; avoid GPL `parse-magica-voxel`), `zzfx@1.4.0`/`jsfxr@1.4.1` for procedural SFX.

**Architecture:** strict split `sim/` (pure TS, runs in Node, fixed 60 Hz step, seeded RNG, no `Math.random`/`Date.now`) vs `render/` (three.js) vs `app/` (input, HUD, audio). Debug hook `window.__game` with `stepN`, `state`, `exec(cmd)`, `stats`; `?test=1` disables the rAF loop so Playwright drives ticks deterministically.

**Voxel data:** dense `Uint8Array` per object (palette index, 0 = empty), ≤256 per axis; static world as a sparse map of 32³ chunks. Material table: `{hardness: soft|medium|hard|unbreakable, density, flammability, audioGroup, colours…}` with Teardown-like palette ranges.

**Rendering baseline:** chunked **binary greedy meshing** (32³ chunks, bitmask columns; ~0.1–0.3 ms per chunk in JS [MEASURED], 50–100× faster than three's VOXLoader mesher), packed vertex format, per-vertex AO, `MeshStandardMaterial` or small custom shader with vertex colours; remesh budget 2–4 ms/frame (nearest first), optionally in a Web Worker. Debris: `InstancedMesh`/`BatchedMesh`. Look upgrade: see `08-lighting-look.md` (world occupancy 3D texture + ray-traced soft shadows/AO in shader, tested in WebGL2).

**Physics:** Rapier **native `Voxels` colliders** (`ColliderDesc.voxels(Int32Array coords, {x:.1,y:.1,z:.1})`, `collider.setVoxel(i,j,k,false)` is O(1); dynamic voxel bodies since 0.17; voxel(i,j,k) occupies `[i·s,(i+1)·s]` — origin at corner). One voxel collider per 32³ world chunk (call `combineVoxelStates` once per neighbouring pair, `propagateVoxelChange` after border edits); large debris = voxel collider per body; small debris = single cuboid; tiny = particles. **Budget [MEASURED]:** ≤~300 complex debris bodies or ≤~1000 cuboid bodies for a ~6 ms step. Vehicles: `world.createVehicleController(chassis)` (raycast wheels hit voxel colliders [MEASURED]; call `updateVehicle(dt)` before `world.step()`; the forward-axis setter is oddly named `setIndexForwardAxis`). Player: Rapier `createCharacterController` with a capsule (~1.8 m).

**Destruction pipeline per event:** carve spheres per hardness (r_soft ≥ r_med ≥ r_hard, optional noise on radius) → `setVoxel` on colliders → mark render chunks dirty → spawn capped debris (e.g. ≤20 voxel bodies + ≤60 cuboids per explosion, rest particles) → queue connectivity: multi-seed "race BFS" from neighbours of removed voxels, stop at anchors, split exhausted islands into new bodies (velocity from parent `velocityAtPoint`), full BFS labelling fallback (384k cells ≈ 10–28 ms [MEASURED]) → apply explosion impulses **after** carving (so new pieces get pushed) → sleep/freeze settled debris → delete smallest/oldest when over cap → remove bodies below y −50.

**Optional structural improvement (addresses Teardown's main criticism):** support-distance model (each voxel's support cost = min over neighbours; down to anchor free, horizontal +1; voxels exceeding a material `maxSpan` detach) run only in the edited region; plus breakable joints between authored wall panels. Ship connectivity-only first.

**Fire:** sparse cellular automaton on voxels at ~10 Hz with seeded RNG, per-material flammability/fuel, upward + wind bias, global cap (e.g. 1500), burned-out voxels removed (feeds collapse), smoke/flame instanced particles (cap ~2000), extinguisher particles remove fires.

**Testing:** Vitest unit tests (mesher watertightness, carve exactness, component labelling, greedy box cover), simulation tests in Node with Rapier ("cut 4 pillars → roof falls >2 m in 300 ticks"; golden transform hashes on replays), perf budgets in Node, Playwright smoke at 320×180–640×360 (no console/shader errors, non-blank canvas, pixelmatch vs baseline), screenshots inspected by agents. **Never judge frame rate in the container** (720p SwiftShader raymarch ≈ 330 ms/frame).

**Assets:** procedural voxel buildings (floors 2.8–3.2 m, outer walls 2 voxels brick/plaster/wood, glass panes 1 voxel, concrete slabs 2–3 voxels, pillars, stairs, roofs), procedural props, per-voxel colour variation via 4 shades per material in the palette; optional CC0 .vox props (check licences, rescale). Audio: procedural WebAudio (noise+filter explosions, filtered-noise debris by material, brown-noise fire, oscillator engines) + optionally CC0 samples.

---

## 9b. Concrete numbers recovered by the gap-fill (details & sources in `07-gap-numbers.md`)

- **Robot AI (two mod copies of vanilla `robot.lua` agree; UNCONFIRMED as vanilla):** spotted after 0.3 s in ideal visibility, remembered 5 s, aim builds over 5 s, alarm robot triggers after 2 s in its light; hearing threshold volume >0.1 with (5/d)² falloff; weapon idle 1 s → charge 1.2 s → 0.15 s between shots, spread 0.01; flamethrower 0.02 health/tick within 2 m; explosion effect on robots full at 2 m, zero at 8 m.
- **Explosion visuals** (`explosion.lua`) choose small/medium/large effects at strength thresholds 1 and 2; actual destruction is engine-side (formulas not public).
- **Player:** friction 0.8, hurt speed scale 2/7, eye height ≈1.7 m (API example), walking speed 7 and jump speed 5 (API examples, UNCONFIRMED defaults).
- **Tool stand-ins** (from an unofficial multiplayer mod's rewrite of the tools, *not* vanilla): pistol hole radius ~0.35–0.65 m, shotgun 8 pellets, rocket 20 m/s with −2 m/s² gravity, blowtorch hole ~0.15 m. Wiki upgrade ranges: pipe bomb 2→4, bomb 4→6, rocket 3→5, nitro 5→8 (explosion size units, engine clamps size to 0.5–4).
- **Debris cleanup** in a shipped level script: deletes single-shape broken bodies >20 m from camera, moving <1 m/s, <10 voxels per side and <200 voxels total.
- **Vehicles** (mod XML copies): city car spring ≈0.5–1.0, damping ≈0.7–1.5, topspeed ≈30, acceleration ≈3; sports car topspeed ≈80; tank topspeed ≈90, strength 30 (units unclear).
- **Fire:** 100 fires triggers fire alarm in heist script; engine defaults for `game.fire.maxcount/spread` still unknown.

> These numbers are for calibrating *feel*. Do not copy Teardown's scripts or code — the appendix quotes short snippets only as evidence.

---

## 10. Things nobody could confirm (design them yourself)

Exact contact-generation algorithm; broadphase; CCD; mass formula and the `strength` property; impact-damage formula; explosion internals beyond size range (partly in `07`); the disconnection-search algorithm; fire defaults; buoyancy/swim model; rope solver; wheel model; player collider shape; debris threshold and hard body caps; grab mass limit; jump/fall-damage numbers; energy-drink boost. Where `07-gap-numbers.md` found values in official open-source code they are noted there; everything else should be tuned by feel.

---

## 11. Key sources
- Official: https://teardowngame.com/modding/ · https://teardowngame.com/modding/api.html · https://teardowngame.com/changelog · https://teardowngame.com/faq.html · https://github.com/tuxedolabsorg/mplib
- Developer blog: https://blog.voxagon.se/ (design notes 2020-11-05, quicksave 2020-11-18, spraycan 2020-12-03, year summary 2024-12-29, multiplayer 2026-03-13, "From screen space to voxel space" 2018, "The importance of good noise" 2018)
- Talk: Gustafsson & Rundlett, "Raytracing Voxels in Teardown and Beyond", Graphics Programming Conference 2025 (slides PDF)
- Podcast: Software Engineering Daily ep. 1772 transcript
- Frame analyses: https://acko.net/blog/teardown-frame-teardown/ · https://juandiegomontoya.github.io/teardown_breakdown.html
- Interviews: Game Developer (2020, 2021), 80.lv (2026), TechRadar (2023)
- Audio: https://www.tonalitet.com/project/teardown/
- Community: teardown.fandom.com (via MediaWiki API), TTFH/Teardown-Converter, TTFH/TDLL
- Tech: rapier.js changelog & docs, three.js r187 source/examples, cgerikj/binary-greedy-meshing, sbobyn/three-voxel-destruction, web.dev WebGPU support
(Full source lists with URLs are inline in each appendix file.)
