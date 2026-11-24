# Teardown: AI, Audio, Art, Game Feel, Level Patterns, Performance, Patch History, Peers

Research compiled 2026-11-24 for a team building an **original** voxel-destruction heist game. Everything below describes Teardown (Tuxedo Labs) as a reference. Do not copy its assets, names, or code. Items we could not verify from a primary or strong secondary source are marked **UNCONFIRMED**.

Key sources (used throughout):
- Official modding docs: https://teardowngame.com/modding/ and API reference (v2.2.0): https://teardowngame.com/modding/api.html
- Official changelog: https://teardowngame.com/changelog
- Official FAQ: https://teardowngame.com/faq.html
- Dennis Gustafsson's blog (formerly blog.tuxedolabs.com, now https://blog.voxagon.se/)
- Douglas Holmquist's sound/music write-up: https://www.tonalitet.com/project/teardown/
- Fan wiki (MediaWiki API, wikitext): https://teardown.fandom.com/wiki/ (Robots, Security, Security_Chopper, Updates, Voxels, Fire, Game_Settings, Escape_vehicle, Teardown_OST, Photo_Mode, Player)
- Software Engineering Daily interview with Gustafsson (Dec 2024): https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt
- Steven Wittens, "Teardown Frame Teardown": https://acko.net/blog/teardown-frame-teardown/

---

## 1. Enemies, AI and security

### 1.1 Design history: no enemies at first
- **Early access (Oct 2020) had no NPC enemies.** Gustafsson: environments are mostly industrial/commercial so an empty world feels believable, "since the game has no NPCs" (Game Developer, Jul 21 2021: https://www.gamedeveloper.com/design/combining-bombastic-heists-with-a-fully-destructible-voxel-world-in-i-teardown-i-).
- Spider enemies existed in prototypes (shown with a health system in Mar 2019) and shipped in early access by accident. They were removed in Nov 2020: "Spiders removed. They were included by accident. Since they neither look or act as we intend them to, we remove them as not to spoil their comeback in the game." (wiki Cut_content). Wikipedia says Gustafsson found enemies disrupted the destruction gameplay (https://en.wikipedia.org/wiki/Teardown_(video_game)).
- A 2018 prototype used "shadowy figures with lights on their head" for **A\* pathfinding** experiments (wiki Teardown_History).
- **Robots arrived with Part 2 on 2 Dec 2021** (v0.9.0). The same release exposed path planning to Lua (`QueryPath`, `AbortPath`, `GetPathState`, `GetPathLength`, `GetPathPoint`) (changelog 0.9.0). In June 2021 Gustafsson teased robots on Twitter and said pathfinding would be fully exposed to Lua (PC Gamer: https://www.pcgamer.com/im-terrified-of-teardowns-unrelenting-robots).
- **Guard dogs: none in the official game.** No wiki page, mission, or press coverage mentions dogs. Treat this as confirmed absent, though it rests on the lack of any mention rather than a direct statement.
- **Police: no police NPCs in heist missions.** The "cops arrive" framing (https://progameguides.com/teardown/how-to-disable-alarms-in-teardown/) is shown in-game as the timer expiring and the security chopper reaching the escape vehicle (see 1.4). A police car vehicle exists in the vehicle list. Whether any police AI pursues the player is **UNCONFIRMED (believed none)**.

### 1.2 Security robots (Part 2)
Source: wiki Robots (https://teardown.fandom.com/wiki/Robots) unless noted.
- **Two visual "brands"**: Quilez (missions Roborazzi, The droid abduction, Handle with care, Droid dismount) and RoboSec (The secret ingredients, Ornament ordeal). They are mostly humanoid, walking physics robots. The **spider robot** is the only non-humanoid one.
- **Types, with a face-light colour code that tells the player the threat at a glance:**
  - **Gun robot** (yellow light): after a short delay, fires "a short, inaccurate burst of bullets".
  - **Flamethrower robot** (red light): runs at the player and burns them at close range.
  - **Missile robot** (blue light): after a short delay, fires 2 missiles from each launcher.
  - **Alarm robot** (white camera face): passive. It scans the player, and **a 2 s continuous scan triggers the alarm**. Used in Ornament ordeal: "robots which will trigger the alarm if they see you for over 2 seconds" (wiki Ornament_ordeal).
  - **Spider robot**: carries a flamethrower and a rocket launcher, shoots at range and burns up close (Droid dismount).
  - **Basic robot** (Robot Showcase map only, unarmed): follows the player when it can see them.
- **Controller script `robot.lua`, configured per instance by a `type` parameter** of space-separated keywords (wiki):
  - `investigate`: stares at the player and goes to where the player last made a sound.
  - `chase`: chases and attacks when it sees or hears the player.
  - `alarm`: scans the player and triggers the alarm.
  - `avoid`: flees the player.
  - `aggressive`: always knows where the player is, through walls.
  - `practice`: shoots at targets, and at the player inside a zone.
  - `nooutline`: hides the proximity outline.
- **Vision**: robots see through their "eye" light entity. **Default FOV 150°, view distance 25 m** (wiki). Both can be overridden by tags on the eye light (`viewdist`, `viewfov`) and hearing by a `heardist` tag on the head. This tag scheme comes from a community mod derived from `robot.lua` (https://raw.githubusercontent.com/deffcolony/TD-ALIEN/HEAD/script/alien.lua). The tag names are confirmed there, but the mod's numeric defaults have been edited, so take default values from the wiki.
- **Hearing**: the engine exposes `GetLastSound()`, which returns "volume of loudest sound played last frame" and its world position (API). `PlaySound` has a `registerVolume` flag that opts each sound into this system. That makes hearing data-driven: any gunshot, explosion or impact the engine plays becomes an AI stimulus. In the derived script, a robot tagged `sleeping` wakes when `GetLastSound` volume exceeds 0.2 inside its investigate trigger. That threshold comes from the mod, so it is **UNCONFIRMED for vanilla**.
- **Other config fields seen in the derived script**, all **UNCONFIRMED as vanilla values**:
  - `patrol` route via "patrol" location entities.
  - `visibilityTimer = 0.3` s, the time the player must be seen before being identified.
  - `lostVisibilityTimer = 5.0` s.
  - `huntSpeedScale`, `aimTime`, `sensorDist`.
  - Per-robot `stepsound` size (s/m/l).
- **Patrol paths**: placed as location entities named "patrol" in the level XML (derived script). Robots in Roborazzi also do "pathfinding between 2 points" and "autonomously pathfinding" (wiki Roborazzi).
- **Damage and defeat**:
  - A bullet stuns a robot for **0.2 s**.
  - An explosion stuns it for `f*4` seconds, where `f = clamp(1-(d-2)/6, 0, 1) * strength`. Explosions with strength ≤ 0.99 are ignored (wiki, quoting the script).
  - Robots **"can be only killed using water"**: when the body part is submerged the robot dies and ragdolls. Missions also have the player physically carry or dump robots (Droid dismount, The droid abduction).
  - Design takeaway: enemies are puzzle objects (stun, then move them into a hazard), not damage sponges.
- **Mission scripting around robots**: in Roborazzi, provoking robot "DNGEROU-5" makes robots chase the player and "alarms trigger causing blast doors at the checkpoints to slowly lock down" (wiki Roborazzi).
- **Robot audio** (paths referenced in the derived script, base-game sound library): `robot/step-{s,m,l}0.ogg`, `robot/walk-loop.ogg`, `robot/charge-loop.ogg`, `robot/disable0.ogg`. Weapons reuse player tool sounds (`tools/gun0.ogg`, `tools/launcher0.ogg`, `tools/blowtorch-loop.ogg`).
- 0.9.3 notes: "Tweaked Robot logic". Factory updated for "Visibility through floor/ceiling between robot factory and safe factory" (wiki Updates). This shows level geometry was tuned for robot sightlines.

### 1.3 Security helicopter ("Security Chopper")
Source: https://teardown.fandom.com/wiki/Security_Chopper
- **First shown on 22 Nov 2019.** It is the only Part 1 "NPC". Visually like a Bell 412 / UH-1, armed with an **autocannon, missiles and a spotlight**.
- **Role A, in alarm missions and the Fetch challenge:**
  - It **enters when the alarm timer passes 15 s remaining**.
  - It flies to the **escape vehicle** regardless of where the player is.
  - If it reaches the vehicle, the mission fails.
  - It does not fire in this role.
- **Role B, in chopper missions** (An assortment of dishes, Havoc in paradise, Hunted challenge). Here it replaces the timer with an enemy:
  - It "always knows the general location of the player", hovering nearby.
  - It **attacks only when the player is in its spotlight**, firing the autocannon.
  - If the player hides in a building, it may fire missiles. These make bomb-sized holes and can start fires.
  - A **short beeping telegraph plays before any weapon fires**.
  - It reacts to loud noises (explosions, gunshots) by turning toward them, with a distinct cue. Players use this as a decoy mechanic.
- **The chase** (final Part 1 mission) uses a different script: the chopper always knows the player's location, never fires rockets, and is less accurate.
- **Hunted challenge**: a second chopper spawns at 15 chests (3 stars). "Hard mode" at 25 chests means more bullets and faster noticing (wiki Hunted_Challenge).
- **Designer rationale** (Gustafsson, "Teardown design notes", 5 Nov 2020, https://blog.voxagon.se/2020/11/05/teardown-design-notes.html):
  - A chopper chasing the player in every mission was rejected because randomness undermines planning.
  - Instead, in a separate mission type "the chopper shows up shortly after clearing the first target, effectively replacing the timer with an enemy."
- The chopper body has physics geometry but cannot be damaged or collided with (wiki).

### 1.4 Alarm system mechanics
Sources: wiki Security (https://teardown.fandom.com/wiki/Security), Game_Settings.
- **The core loop**:
  1. Any alarm starts a **60 s countdown**. The player must clear the remaining targets and enter the escape vehicle.
  2. The escape vehicle can be entered only once all required targets are done (wiki Escape_vehicle).
  3. On entry the vehicle auto-drives away in a straight line.
- **Timer options** (Options → Game): Disabled (default 1:00), +15 s, +30 s, +60 s, −10 s, −20 s. Covert chaos uses a 2:00 base (wiki Game_Settings). Added as "Configurable difficulty and accessibility options" in 0.7.3.
- **Alarm sources**:
  - **Alarm boxes** (grey boxes with red lights, wired to targets): trigger when the target is tampered with, the box becomes dynamic or broken, or the **wire is disconnected**. There is no legitimate way to disarm them (https://progameguides.com/teardown/how-to-disable-alarms-in-teardown/).
  - **Fire alarms** (invisible): trigger "when a fire gets out of control". The fire-count threshold is **UNCONFIRMED**. Old code had a warning "Chopper noticed the fire" (wiki Fire). Fire is the main threat in "Art return".
  - **Moisture sensors** (A wet affair): the target safe must not touch rain or water.
  - **Explosion sensors** (Motivational reminder, Power outage): trigger when the attached object breaks.
  - **Demolition sensors** (Covert chaos): during preparation, more than 1% building destruction means game over. Damage below that shows a warning.
  - **Alarm robots** (2 s scan).
  - **Security doors and blast doors** close on alarm (Roborazzi).
- **"Heavy" targets**: some alarmed targets sit on heavy objects, so the player chooses between moving them before the heist or running for it (design notes).
- **Quicksave**: one slot, usable any time in preparation and **disabled once the alarm sounds** (design notes; also "Teardown quicksave" post, 18 Nov 2020, https://blog.voxagon.se/2020/11/18/teardown-quicksave.html).
- **Alarm audio**: place-specific alarm sounds plus a stereo loop of "bell fire alarms, war klaxons, car alarms, digital alarms" processed to sound distant and spread across the stereo field. The music switches to an intense heist cue ("The Heist" track) (tonalitet.com; wiki Teardown_OST).
- **Other mission-specific security**:
  - Laser deflectors and laser emitters at Quilez Security. The lasers cut through materials (changelog 0.9.1; wiki Quilez_Security).
  - Hacking terminals that stop the alarm (The alarm system).
  - Tearing hacked targets off their supports instantly triggers the alarm (An assortment of dishes).

---

## 2. Audio design

### 2.1 People and style
- **Composer and sound designer: Douglas Holmquist** (Holmquist Tonalitet, Sweden). He previously worked on Mediocre games (Smash Hit etc.). He started part-time in Nov 2019 and joined full-time in Feb 2020 (https://www.tonalitet.com/project/teardown/; Wikipedia).
- **Foley**: recorded with Mathias Schlegel over 1.5 days in May 2020 on planks, dirt, sand, leaves and metal shelves (tonalitet).
- **Music**:
  - Part 1 OST released 1 Dec 2020: 16 tracks, about 65 min. Bandcamp tags: ambient, post-rock, electronic, free jazz. Drums by Andreas Baw, mastered by Håkan Åkesson (https://douglasholmquist.bandcamp.com/album/teardown-part-1-original-game-soundtrack).
  - Part 2 OST: VGMdb lists 29 Dec 2021 (https://vgmdb.net/album/121618).
  - Later albums: Art Vandals, The Greenwash Gambit (Bandcamp).
  - Holmquist described the sound as "synths, a warmly distorted drum machine and Fender Jaguar twangs". This is surfaced from his tweet via search and is **secondary**. Other secondary descriptions call it jazz-fusion/surf-rock flavoured (**UNCONFIRMED** wording).
- **Music system** (wiki Teardown_OST):
  - Each map has separate tracks for heist and non-heist missions. Some missions have their own track.
  - "The Heist" plays during the alarm countdown.
  - "Mission Completed" is the tail of the main theme.
  - Hunted challenge uses remixes of each map's theme.
  - Mod API: `PlayMusic(path)` / `StopMusic()`.

### 2.2 Material-based impact system (the key idea)
From Holmquist (tonalitet.com, verbatim):
- "There's 7 materials in the game engine – wood, metal, glass, plastic, masonry, foliage and dirt."
- "For the different categories I created hit- and break sounds, in 3 different sizes and multiple variations of each size."
- "I also created slide sounds for each material, in three different sizes."
- "The Teardown engine isn't aware that for example a chair is a chair, just that it's made out of wood, and how big it is."
- Looping **squeak** sounds for metal and wood joints (hinges, nailed planks, pipes).

**Implications for our design:**
- The sound bank is keyed by **(material group × size class × event type {hit, break, slide})**, with random variation.
- Exactly how impulse or mass maps to size class and volume is **UNCONFIRMED**. The source only says sounds depend on material and "how big it is".
- The 13 gameplay materials (glass, grass, dirt, plastic, wood, plaster, concrete, brick, weak metal, hard masonry, hard metal, heavy metal, rock) appear to collapse into the 7 audio groups. That mapping (e.g. plaster/brick/concrete → masonry) is inferred and **UNCONFIRMED**.

### 2.3 Other sound categories (tonalitet.com)
- **Explosions**: "3 sizes, and a bunch of variations of all of them".
- **Weapons**:
  - Shotgun from a Benelli M4, pistol from a Colt M1911.
  - Recorded dry, so indoor reverb comes from the acoustic simulation.
  - Sledge swing, grab, throw and plank attachment have subtle, varied sounds.
- **Vehicles** (about 40):
  - Each has an ignition, an idle loop (10–20 s), a drive loop (10–40 s) and a shut-off sound.
  - Drive-loop **pitch is driven by vehicle velocity**.
  - Extra layers: brake squeak, tyre screech, gravel, a reverse layer, reverse beeps on work vehicles, suspension bounce.
  - Source material mostly from the Odyssey library (Mangini/Anderson): summed to mono, EQ'd, de-reverbed in iZotope RX.
- **Ambient and props**:
  - Fluorescent lights, soda machines, copiers and factory machines have loops.
  - **A broken light's loop ends with a spark sound**.
  - The hub TV plays gibberish "Scandinavian" news voices.
- **Rain**: "a wet layer to the footsteps of whichever material you're walking on". It persists a few seconds after going indoors.
- **UI**: made with Logic's EFM1/Retro Synth/Klopfgeist, arpeggiators and fast note repeats. Placeholder UI sounds were from Smash Hit.
- **Fire sounds, wind and bird ambience: UNCONFIRMED.** The write-up does not cover them. The blowtorch has a loop (`tools/blowtorch-loop.ogg`).

### 2.4 Acoustic simulation (a differentiator)
- Gustafsson built a **CPU voxel ray tracer used for both lighting and acoustics**.
- Room volume sets the early reflections, and larger rooms add a reverb tail.
- **Material affects damping**: "wood makes for a more damped sound than masonry" (tonalitet.com).
- Gustafsson blogged about environmental acoustics back in 2014 ("Hail to the hall – Environmental Acoustics", https://blog.voxagon.se/2014/05/28/hail-to-hall-environmental-acousticts.html), and "acoustic noise" experiments appear in Jan 2019 tweets (wiki History).

### 2.5 Engine/modding sound API (v2.2.0)
Source: https://teardowngame.com/modding/api.html
- `LoadSound(path, [nominalDistance])` and `LoadLoop(path, [nominalDistance])`.
  - `nominalDistance` is "the distance in meters this sound is recorded at. Affects attenuation, default is 10.0".
  - Base-game robot scripts use 5–15 m: small steps 5, large steps 9, hunt cue 15 (derived script).
- `PlaySound(handle, [pos], [volume], [registerVolume], [pitch])` returns a play handle. Companion functions: `StopSound`, `IsSoundPlaying`, `Get/SetSoundProgress`.
- **Automatic random variation**: if files are named `name0.ogg, name1.ogg, …`, loading `name0.ogg` makes each `PlaySound` "pick a random sound from that list".
- `PlayLoop(handle, pos, volume, registerVolume, pitch)` "must be called continuously" (every frame) to keep a loop alive. Stopping is implicit.
- `PlaySoundForUser` / `SetSoundLoopUser` for per-player and gamepad-speaker playback (multiplayer era).
- `GetLastSound()` gives the loudest sound last frame, used for AI hearing (see 1.2).
- **File format and layout**:
  - All audio is `.ogg`.
  - Shipped files are encrypted to `.tde` for licensing reasons. A same-named `.ogg` placed beside one overrides it (modding docs).
  - Built-in paths look like `tools/…`, `robot/…`. The exact root folder (`data/snd/`) is **UNCONFIRMED** from primary docs.
- Changelog audio notes:
  - 0.4.6: "Audio improvements when using Voicemeeter…"
  - 0.9.3: handle audio device switch at runtime.
  - 1.1.0: "Mute audio when defocused".
  - 1.5.3: fixed "TV sound may disappear when it's out of view", which implies visibility- or culling-related sound management.
  - 2.0.3: editor water volumes support "custom water sounds".

---

## 3. Art direction

- **Core look**: "abstract voxel appearance" combined with "very realistic lighting". Gustafsson: "it creates some very interesting dynamic there". Art style credit "goes to … MagicaVoxel… it later became the main inspiration for the art style" (TechRadar, 28 Sep 2023, https://www.techradar.com/gaming/consoles-pc/ray-tracing-is-so-crucial-to-teardown-that-the-world-goes-black-if-you-turn-it-off).
  - Ray tracing is part of the core renderer and cannot be disabled (FAQ).
  - Many planning phases are set at golden hour (SE Daily interviewer).
  - Sandbox offers time of day and weather presets: sunrise, sunny, fog, rain, sunset, night, night rain, snowy (wiki Quilez_Security; changelog 0.8.0, 0.9.1).
- **Voxel scale**: **1 voxel = 10 cm**, deliberately much smaller than typical voxel games, to "replicate that MagicaVoxel feel" (Gustafsson, SE Daily).
- **Player scale**:
  - Canonical height 180 cm ≈ 18 voxels (wiki Player).
  - Community measurements: walk clearance about 14–16 vox (forced semi-crouch below that), crouch 9–13 vox, impassable at 8 vox or less, width about 5–6 vox (https://steamah.com/teardown-measurements-and-other-tools-for-map-makers/, community, approximate).
- **Asset authoring**: "Almost all assets … modeled in … MagicaVoxel" (modding docs).
  - The **palette index defines the material**: "the color at index 9 is always grass". The wood group is indices 57–72. Glass/window is roughly indices 1–8/9 (steamah, **approximate**). The colour itself is free.
  - Render types: dull metal, shiny metal, diffuse, emissive, glass. Metallic is used "only very low… only for raw metal". Painted metal uses metallic 0.
  - Emissive voxels look lit but **don't light the scene**. Lights are separate entities.
  - Glass is binary transparent (any transparency value other than 100).
  - 1.3.0 added MagicaVoxel "specular" material support.
- **Material ladder** (modding docs table). These double as both the art vocabulary and the gameplay gating:

| Material | Hardness | Sledge | Blowtorch | Guns | Explosives |
|---|---|---|---|---|---|
| Glass, Grass, Plastic, Wood | Soft | yes | yes | yes | yes |
| Dirt, Plaster | Soft | yes | no | yes | yes |
| Concrete, Brick | Medium | no | no | yes | yes |
| Weak metal | Medium | no | yes | yes | yes |
| Hard masonry, Hard metal | Hard | no | no | no | yes |
| Heavy metal, Rock | Unbreakable | no | no | no | no |

- **Construction rules (official)**:
  - Max object size 256³ voxels. 128³ "generally OK". Flat 256×256×10 is OK.
  - "A house should never be built in one single object. Instead walls and floors should be divided into thinner objects", which avoids empty-space traversal cost.
  - Voxels must share faces to stay connected. Edge or corner contact falls apart.
  - "Softer materials should never be placed inside or between harder material." For example, brick grout should be **brick material in a lighter colour**, not plaster. Rebar (hard) inside concrete is fine.
  - Object order matters: newer overlapping objects overwrite older voxels.
  - Object dimensions are padded to multiples of 4 for the MIP chain (acko.net).
- **Typical building make-up**:
  - Brick factories with glass windows at Lee Chemicals.
  - Scrap metal and concrete on Isla Estocastica.
  - Wooden cabins on stilts at the Marina (wiki Maps).
  - Community guidance: walls should be multi-layer (structure, insulation, finish), not 1 voxel of one material (https://steamah.com/teardown-how-to-create-custom-maps/).
  - **Exact wall and floor thickness in voxels in the official maps: UNCONFIRMED.** Measure in-game or in the editor before relying on a number.
  - Some building parts are joined with physical joints to fake partial collapse (Gustafsson, SE Daily).
- **Props**:
  - Valuables (tools, art, cash) are scattered per map with $ values (wiki Valuables).
  - Fictional brands: BlueTide, Quilez, Lee Chemicals.
  - Environmental storytelling through emails, a TV and object descriptions (design notes).
- **Colour palettes in detail: UNCONFIRMED.** No official art bible was found. Observations from screenshots and press: warm golden-hour key light, desaturated industrial materials, saturated brand accents.
- **Rendering features that shape the look** (acko.net, OpenGL-era pipeline):
  - Per-object 3D volume textures, with palette-indexed 1-byte voxels.
  - A global 1-bit shadow volume. On the Marina it is 1752×100×1500 texels at 2×2×2 voxels each, about 262 MB.
  - Ray-traced AO, soft shadows and specular occlusion, but no full GI (80.lv, Mar 2026: https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech).
  - Volumetric lights, depth fog, murky water.
  - CPU-simulated smoke rendered with blue-noise dithering.
  - Subtle motion blur, half-res bokeh DOF, auto-exposure, bloom.
  - Optional "pretty subtle" lens (barrel) distortion, and lens dirt only when the sun is visible.
  - Heavy blue-noise and TAA accumulation.
  - Scorch and paint are voxel recolours (spraycan, skid marks).

---

## 4. Game feel

- **Camera**:
  - **Default FOV 90°, adjustable 60–120 in steps of 10** under Options → Graphics (https://seekingtech.com/how-to-change-the-field-of-view-in-teardown/, third-party).
  - Mods can override 10–170° per frame with `SetCameraFov` (API, added 0.7.0).
  - **Head bob / sway**: a **"Head movement" slider under Options → Input**. Setting it to 0 removes the strafe-tilt sway that causes motion sickness (Steam thread https://steamcommunity.com/app/1167630/discussions/0/4035851449848362742).
  - 0.7.1: "Less choppy camera movement at high framerates". 0.9.3: "New vehicle camera with less stuttering".
  - 1.3.0: `SetPlayerCameraOffsetTransform` "for custom head movement", made stackable in 1.5.3.
  - 1.6.0 (Oct 2024): first/third-person toggle with full animations for all tools and vehicles.
- **Screen shake**: `ShakeCamera(strength)` takes a normalised strength (API, opened to mods in 1.5.3).
  - Which base-game events shake the camera, and how much: **UNCONFIRMED**.
  - **No official shake toggle was found.** PC Gamer's list of accessibility options covers the timer, ammo, health, mission skip and unlocks only (https://www.pcgamer.com/uk/new-teardown-difficulty-options-let-you-unlock-everything-at-once/).
- **Hit-stop / freeze frames: UNCONFIRMED.** No source mentions them.
  - `SetTimeScale` (experimental slow-motion, 0.6) exists for mods.
  - The design leans on physics response and sound, not time manipulation.
- **Sledgehammer**:
  - Unlimited ammo. Breaks voxels near the crosshair: "many of the voxels hit will be outright removed" (wiki Sledge).
  - Works on glass, foliage, dirt, wood, plaster, plastic and snow/grass. Not on brick, concrete or metal.
  - Swing sound is subtle and varied (Holmquist).
  - It is the iconic first tool (the game icon). Its limits on brick teach the material ladder in the first mission: "I can't just sledgehammer through this wall because it's brick. Ah, there's a window" (SE Daily).
  - Exact hole radius and swing timing: **UNCONFIRMED**.
- **Impact feedback stack**:
  1. Voxels removed, with loose clusters becoming rigid bodies.
  2. Material-keyed hit/break/slide sounds in 3 sizes.
  3. Particles.
  4. Voxel recolouring (scorch).
  5. Acoustic reverb by room.
  - Particle effects were improved in 0.7.0 ("Improved particle effects and new particle API") and in 0.9.6/1.0 ("Improved particle effects").
  - Particle API: smoke or plain types, a texture atlas of 16 tiles, expanded to 32 plus a "blend texture with 16 tiles (good for adding dust)" in 0.9.0. Collisions, gravity, drag, colour and alpha are interpolated.
  - **Per-material dust or splinter colouring on hit: UNCONFIRMED** (likely, but no source).
- **Smoke and fire extinguisher physics**: "probably way more advanced than it would have needed… because I like it that way" (Gustafsson, TechRadar 28 Sep 2023, https://www.techradar.com/gaming/consoles-pc/teardown-devs-top-priority-is-always-physics-the-game-can-come-later).
- **Photo mode** (0.7.0, May 2021):
  - High-quality rendering with adjustable DOF, exposure, bloom, zoom and a tool show/hide toggle.
  - Freecam and zoom added in 0.7.3.
  - Sprites and lines visible since 0.9.3.
  - Saved to Documents\Teardown\screenshots (wiki Photo_Mode).
  - Built-in **Screen Recorder** mod for "no-lag movie clips" (0.9.3).
- **Spraycan**: lets players mark routes. Gustafsson wrote a dedicated post on it (https://blog.voxagon.se/2020/12/03/spraycan.html). This is a route-planning feel tool.

---

## 5. Level design patterns

- **Obstacles in a fully destructible world**: "the only real obstacles we have to work with are elevation, water, and distance" (Game Developer 2021).
  - Unbreakable materials are restricted to rock formations and ground so the world stays readable (design notes).
  - Gustafsson calls full destructibility "a nightmare for a designer": a yellow-key-card door is meaningless if walls can be removed (SE Daily).
- **Two-phase structure**:
  - A relaxed **preparation** phase: roam, plan, pre-cut holes, build plank bridges, move vehicles and stage ramps.
  - Then a timed **execution** phase, started when the first alarmed target is touched (design notes).
  - Intended core loop: test a route, then back to planning, with quicksave as the safety net. The third mission enforces it.
- **Targets**:
  - Required targets set the minimum route. **Optional targets are "placed to disrupt the most efficient route"** and raise the score.
  - Progression (tool upgrades) makes old missions replayable.
  - Escape vehicle placement and the alarm-target spread define the 60 s challenge (design notes).
- **Map size and verticality**:
  - Levels are kept small because players must learn every corner.
  - **Villa Gordon is the largest and "already tedious" to cross.**
  - **Hollowrock Island is praised for compactness and verticality.**
  - Quilez Security is "considerably more vertical" (wiki).
  - The Frustrum end chase was cut to **400 m** because of a 3D-texture size limit on AMD GPUs (design notes).
  - Hard engine limit: "no more than 4,000 voxels across the world" (≈400 m) due to OpenGL texture limits (Gustafsson, SE Daily). The new engine removes this.
  - Example: West Point Marina's shadow volume covers about 3504×200×3000 voxels ≈ **350 m × 20 m × 300 m** (acko.net).
- **Escape vehicles** (wiki Escape_vehicle):
  - The player **spawns at the escape vehicle**, which tells them where the route must end. It shows as a green circle on the Tab map.
  - Most common: Cruise boat (21 missions) and Van (17). Also small helicopter (Fetch), Semi (vehicle-theft missions, for the trailer), Taskmaster pickup, Speedboat (The chase), Patrol boat.
  - Watery maps use boats. Land maps use vans.
- **Mission archetypes beyond heists**: destroy N% of a building (Covert chaos), hack terminals under chopper pursuit, dump objectives in water, take photos (Roborazzi), deactivate robots, timed fetch, and "Hunted" survival.
- **Tutorial pattern**: the first house provides 2–3 propane tanks that are "not enough to take down the house", which encourages scavenging the environment (SE Daily).
- **Structural limitation as design**:
  - In early access, a building could stay up on a single voxel. 0.7.0 fixed "Large disconnected chunks now fall properly".
  - There is still **no stress model**: anything still connected to ground stands (GMTK, Oct 2025: https://gmtk.substack.com/p/how-games-do-destruction).

---

## 6. Performance, settings and requirements

- **Steam requirements** (https://store.steampowered.com/app/1167630):

| | Minimum | Recommended |
|---|---|---|
| OS | Windows 10, 64-bit | Windows 10, 64-bit |
| CPU | Quad core | Intel Core i7 or better |
| RAM | 8 GB | 8 GB |
| GPU | GTX 1060 or similar, 4 GB VRAM | GTX 1080 or similar, 4 GB VRAM |
| Storage | 12 GB | 12 GB |
| Note | "Integrated graphics cards not supported" | |

- **Console targets** (FAQ):
  - PS5 / Series X Performance: 1080p at about 120 fps.
  - PS5 / Series X Quality: 2880×1620 at about 60 fps.
  - Series S: 1440×810 at about 60 fps.
  - Consoles launched 15 Nov 2023.
- **PC frame rate** (FAQ): no in-game frame-rate cap setting. Targets 60 Hz. CPU- or GPU-bound depending on scene, and "rarely uses all available hardware".
- **Graphics options (Options → Graphics)**. Confirmed by Steam users (https://steamcommunity.com/app/1167630/discussions/0/3001047413714759540), the changelog and the FAQ:
  - FOV.
  - Render quality (low/medium/high).
  - Render scale (100/75/50%).
  - Depth of field.
  - Barrel distortion.
  - Motion blur.
  - V-sync, including variable vsync (0.7.1).
  - Graphics API: DX12 or OpenGL (1.5.1). The FAQ now says DX12 on all platforms.
  - Particle density (1.5.1).
  - Upscaling: FSR/DLSS Ultra Performance → Native AA (2.2.0). FSR 4.1.1 on ML-capable hardware, otherwise FSR 3.1.5.
- **Known limits**:
  - **Fire**: hard-coded default cap of **100 fires** (wiki Fire). Configurable via registry `game.fire.maxcount` and `game.fire.spread` (changelog 0.8.0). Fire API: `SpawnFire`, `GetFireCount`, `QueryClosestFire`, `RemoveAabbFires`.
  - **Debris**: "massive amounts of loose debris will slow down the simulation" in sandbox, with a "Clear debris" option (community guide).
    - A built-in default system removes small debris, while the performance mod puts debris to sleep rather than deleting it (Steam mod discussion https://steamcommunity.com/sharedfiles/filedetails/comments/2677340659).
    - Exact vanilla debris thresholds: **UNCONFIRMED**.
  - **Large moving voxel objects** (e.g. the yacht) are expensive because the shadow volume must be updated for every voxel moved (Gustafsson, SE Daily).
  - **Object size**: 256³ maximum, and maximum-size objects can cause stutter (modding docs).
  - **World size**: about 4,000 voxels across in the OpenGL renderer (SE Daily).
  - **Multiplayer**: about 1 Mbit/s per-client budget. Join-in-progress is disabled when the destruction command buffer fills. There are object spawn limits (blog Mar 2026: https://blog.voxagon.se/2026/03/13/teardown-multiplayer.html; FAQ).
  - **Perf wins over time**:
    - 0.5.5 AMD optimisations.
    - 0.7.0 "Massively improved destruction performance".
    - 0.7.1 Mall optimisations.
    - 1.4.0 performance increases and a mod performance profiler.
    - 1.5.1 DX12 backend.
    - 2.1.0.1 frametime-spike fix.

---

## 7. Patch and feature history highlights

Dates are from the fan wiki Updates page, Wikipedia, and news. Version contents are from the official changelog (https://teardowngame.com/changelog).

| Date | Version / event | Engine and feature highlights |
|---|---|---|
| 2017–2018 | Prototype | Ray-traced voxel renderer. Destruction teased Jun 2018. Explosives Oct 2018. A\* AI test figures. "Plastic joints" for wood deformation (Dec 2018) |
| 2019 | Prototype | Buoyancy (Jan). Vehicles (Mar). Gun, rope, spraycan (Sep). Revealed as *Teardown* 1 Oct 2019. Shotgun + chopper (Nov). **Fire spreading** (12 Dec) |
| Jan 2020 | Prototype | Water shader rewrite, **rain** |
| Mar–Apr 2020 | Prototype | Lua scripting. Vehicle and sound-effect rework |
| 29 Oct 2020 | Early access | Campaign Part 1, sandbox, fire, rain, water, vehicles |
| 5 Nov 2020 | 0.4.6 | Win 7/8.1, AZERTY, audio routing fix. Spiders removed |
| 22 Dec 2020 | 0.5.2 | Challenges. Modding API overhaul |
| 5 Feb 2021 | 0.5.5 | Performance/AMD optimisations. Level editor, asset pack |
| 4 Mar 2021 | 0.6 | Steam Workshop. Custom tools. `SetTimeScale` |
| May 2021 | 0.7.0–0.7.2 | Evertides Mall. **Large disconnected chunks now fall properly**. Massively improved destruction and physics performance. New explosions, smoke sim update. **Photo mode**. New particle API. Steam Input |
| Jun 2021 | 0.7.3/0.7.4 | Difficulty and accessibility options (alarm timer, ammo, health) |
| 2021 | 0.8.0 | Configurable **weather/time of day** in sandbox. Wet roads reduce grip. Fire registry controls. Environment and post-processing API |
| 2 Dec 2021 | 0.9.0 (Part 2) | 18 missions, 7 tools. **Robots + path-planning API**. Terrain rework. **Procedural snow**. Wind. Tornadoes (https://pcgamer.com/teardowns-campaign-now-complete-with-flamethrowing-robots-and-tornadoes). Plank attachments break under stress |
| Dec 2021 | 0.9.1 | Snowy weather in sandbox. Leaf blower removes snow and boosts fire |
| early 2022 | 0.9.3–0.9.6 | Spawn menu. Screen recorder. Steam Deck. Improved particles. Cullington |
| 21 Apr 2022 | 1.0 | Full release |
| Dec 2022 | 1.3.0 | Art Vandals expansion. Custom head-movement API |
| 2023 | 1.4.0 | Creative mode. Runtime shape-editing API (`CreateShape`, `SplitShape`…). Water shading |
| 2023 | 1.5.x | **DX12 backend**. Particle-density option. 9 languages. `ShakeCamera` opened to mods |
| 15 Nov 2023 | Consoles | PS5 / Xbox Series |
| 19 Jun 2024 | DLC | Folkrace (https://www.gamedeveloper.com/press-release/race-wreck-your-way-through-teardown-s-new-folkrace-dlc-available-june-19) |
| Oct 2024 | 1.6.0 | **Third-person view**, playable characters, Merlin ragdoll, animation API |
| Jun 2025 | 1.7.x / DLC | The Greenwash Gambit. **Zero-gravity / custom-up player API** |
| 12 Mar 2026 | 2.0.0 | **Online multiplayer, up to 12 players**: co-op campaign, deathmatch, CTF and more. Deterministic fixed-point destruction commands. Client/server Lua |
| 15 Sep 2026 | Consoles | Multiplayer on PS5/Xbox |
| 2026 | 2.1 / 2.2 | DLC in multiplayer (Space DLC). **FSR/DLSS**. Water normals |

Note: the 0.x month dates are from the fan wiki. Part 2, 1.0 and multiplayer dates are confirmed by Wikipedia and press.

---

## 8. Peer projects and design references

- **Red Faction: Guerrilla (Volition, 2009)**: parts carry weight and strength values and layers check load, so **real structural stress causes collapse**. Teardown lacks this (GMTK 2025).
- **The Finals (Embark)**: a Red Faction-style fractured-parts and stress model in UE5/PhysX, in a competitive arena (GMTK 2025). Reference for server-authoritative multiplayer destruction.
- **Instruments of Destruction (Radiangames)**:
  - Founder Luke Schneider was lead tech artist on Red Faction Guerrilla.
  - Vehicle-building destruction sandbox. 1.0 on 10 May 2024 with 50+ missions and 100+ pre-built vehicles, campaign inspired by *Blast Corps* (PC Gamer: https://www.pcgamer.com/games/puzzle/the-physics-based-vehicle-demolition-game-ive-waited-two-years-for-just-hit-10-with-a-full-campaign-inspired-by-1997s-blast-corps).
  - Differs from Teardown: fractured mesh buildings rather than a voxel grid, and creativity through vehicle construction. Fracture model internals **UNCONFIRMED**.
- **Lay of the Land (Southern Cross Interactive, solo developer, UE5)**:
  - Fantasy sandbox RPG with a physically simulated, destructible world. Trees fall when cut from below and water flows downhill.
  - Non-cubic voxel building. Reviewers note AI pathfinding struggles on deformable terrain (https://www.vpesports.com/featured-news/lay-of-the-land-cubeless-physics-sandbox; Steam app 2776090).
  - Reference for terrain-scale destruction and survival framing.
- **John Lin's voxel sandbox**: untitled, path-traced voxel renderer with volumetric water and building, shown on YouTube and Twitter since about 2020 (PC Gamer: https://www.pcgamer.com/john-lins-beautiful-physics-sandbox-gives-me-minecraft-vibes; Shacknews: https://shacknews.com/cortex/article/249/john-lins-voxel-experiments). Reference for fluid simulation and visual fidelity. Not a shipped game.
- **Gabe Rundlett (gvox engine / "Daxa")**:
  - Open-source voxel engine author (https://github.com/GabeRundlett).
  - Per Gustafsson's 2024 summary, a colleague who took over Tuxedo's next-gen renderer prototype.
  - Shows where the tech is heading: hardware RT, path tracing, DLSS Ray Reconstruction, sparse 8³ chunks, unlimited world size, substepped parallel physics (https://blog.voxagon.se/2024/12/29/year-summary.html).
- **Douglas Dwyer**: **UNCONFIRMED.** Searches found only a reference to him as the author of the "Geese" event system used by another engine. No voxel destruction project could be verified.
- **"Voxelab"**: **UNCONFIRMED / not found.** The name matches a 3D-printer brand, and no voxel game or engine by that name was found.
- **Silica (Bohemia Interactive / Martin Melichárek)**: RTS/FPS hybrid on a desert planet, 1.0 on 3 Nov 2026. **No evidence of voxel or destructible terrain**, so it is not a destruction reference. It is relevant only as an RTS/FPS role-split design.
- **Other references from GMTK**:
  - Battlefield: Bad Company 2: swap-to-destroyed prefabs, scripted collapse.
  - Rainbow Six Siege: real-time mesh slicing of walls.
  - Control: jointed break pieces and material impact FX.
  - Far Cry 2: cell-based fire spread with wind.
  - Noita: per-pixel simulation.
  - Donkey Kong Bananza: voxel terrain.
  - Takeaway: destruction cost spreads into lighting, sound, AI pathfinding and level design, and should serve explicit goals.

---

## 9. Takeaways for an original game (synthesis)

1. **Make enemies readable puzzle pieces**:
   - Colour-coded threat lights.
   - Telegraphed attacks (beep before fire, delay before burst).
   - Short stuns from tools.
   - One clean environmental kill (water) instead of HP grinding.
   - Hearing driven by the engine's loudest-sound registry, so every destruction event is a stimulus for free.
2. **Use the alarm as a design primitive**:
   - A countdown started by player action.
   - Multiple sensor types (wire, moisture, explosion, demolition %, fire, camera robot) as mission modifiers.
   - A late "arrival" threat (chopper at T−15 s) aimed at the exit, not at the player.
3. **Key audio by material × size × event, not per object.**
   - Add simulated room acoustics with material damping.
   - Record weapons dry.
   - Write music per map in heist and non-heist variants, plus one shared high-intensity alarm cue.
4. **Fix the art contract early**:
   - Voxel size (10 cm worked).
   - Material-by-palette-index authoring.
   - Multi-layer walls in hard-outside/soft-never-inside order.
   - Thin objects rather than one giant volume.
   - Lights as separate entities.
5. **Keep levels small (≤ about 400 m) and vertical.**
   - Spawn at the exit.
   - Put optional targets off the optimal path.
   - Limit unbreakables to terrain and rock.
   - Use height, water and distance as the obstacles.
6. **Budget for fires (cap and spread), debris (sleep/cull), large moving voxel bodies (lighting update cost), and multiplayer** (deterministic destruction commands rather than voxel replication).
