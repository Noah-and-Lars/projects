# 11: Teardown mod ecosystem research, and a built-in mod plan for Wrecking Shift

Research date: 2026-11-25.

This doc builds on `04-modding-formats.md`, which covers the file formats, the Lua API, `info.txt`, `spawn.txt`, the registry and `RegisterTool`. Those details are not repeated here. This doc covers four things:
- what kinds of mods the community makes, and roughly how popular each kind is
- the usual mechanics of each kind
- how the mod and spawn UI works for players
- a plan for about 110 **original** built-in mods for Wrecking Shift

**Originality rule.** Workshop items are described only as kinds. No mod names, content or designs are carried into the plan. Every concept in section 6 is invented for Wrecking Shift. None uses a brand, a trademarked vehicle, or an idea copied from an existing mod.

## 1. Sources

**Official**
- Modding guide: https://www.teardowngame.com/modding/. It covers:
  - mod types: global, content, and spawnable exports
  - `info.txt` tags
  - `spawn.txt`
  - the Mod Manager Play, Enable and Options buttons
  - the example mods
  - `RegisterTool` and the callbacks
- Lua API: https://www.teardowngame.com/modding/api.html. Summarized in doc 04.
- Changelog: https://teardowngame.com/changelog. It dates the spawn menu, the Workshop integration, the Mod Manager filters, Creative Mode and the built-in mods.
- Multiplayer modding: https://teardowngame.com/modding-mp/. Covers the GameMode type and `gamemodes.txt` (see doc 04).

**Steam Workshop**
- Teardown Workshop hub (app 1167630), which has the tag sidebar: https://steamcommunity.com/app/1167630/workshop/
- Most-subscribed list, pages 1–2. I classified these 60 items by kind only:
  - https://steamcommunity.com/workshop/browse/?appid=1167630&browsesort=totaluniquesubscribers&section=readytouseitems&actualsort=totaluniquesubscribers&p=1
  - same URL with `&p=2`
- Example of a third-party spawn-menu replacement mod (changelog only): https://steamcommunity.com/sharedfiles/filedetails/changelog/2842414636

**Press and secondary**
- PCGamesN, update 1.2 featured mods: https://www.pcgamesn.com/teardown/best-mods-manager-update-1-2
- PC Gamer, Creative Mode coverage: https://www.pcgamer.com/teardowns-new-creative-mode-update-is-a-major-leap-for-its-thriving-modding-scene
- PC Gamer, the 1.2 featured list: https://www.pcgamer.com/it-just-got-much-easier-to-find-the-best-mods-in-teardown
- TheGamer, a mod roundup I used for kinds only: https://www.thegamer.com/teardown-best-mods-on-steam-workshop/
- PC Gamer, "5000 mods" interview: https://www.pcgamer.com/one-million-copies-and-5000-mods-later-teardowns-creator-is-just-getting-started
- Community guide: https://get-teardown.readthedocs.io/en/latest/mods/steam-workshop-guide.html

**Unreachable:** the fandom wiki (HTTP 402) and the Nexus category pages (HTTP 403).

## 2. Official structure, in short (details in doc 04)

**Mod types**
- **Global** mods run during all gameplay. They have an Enable toggle and are listed on the loading screen while active.
- **Content** mods ship a `main.xml` and get a Play button.
- **Game Mode** mods were added with multiplayer in 2026, via `gamemodes.txt`.
- "Spawnable" is **not** its own mod type. Any mod can export prefabs to the spawn menu through `spawn.txt`, one line per prefab: `path.xml : Category/Name`.

**`info.txt` tags.** The official tags are Map, Gameplay, Asset, Vehicle and Tool.

**Workshop sidebar filters**
- Type: Content or Global.
- Category: Map, Gameplay, Asset, Vehicle, Tool, Character, Spawn, Multiplayer, GameMode.
- Character, Spawn, Multiplayer and GameMode were added later, alongside third-person play, playable characters and multiplayer.

**Official example and built-in mods**
- **Laser Gun**: the custom tool template, built on `RegisterTool` and `game.tool.<id>.enabled`.
- **Speedometer**: the `options.lua` template, a global HUD mod.
- **Simple House**: a content-mod template that shows how groups work.
- **Scripting showcase**: Lua examples. Version 0.9 added pathfinding and constraints, and 0.9.3 added a spawn example.
- **Screen Recorder** (0.9.3).
- **Motor Park**, a vehicle playground (1.5.3).
- Other official Tuxedo Labs mods became built-in in 0.8.0.
- Built-in mods can be played or enabled but not edited. To change one you first "make a local copy".

**Timeline**

| Version | Change |
|---|---|
| 0.6 | Workshop integration |
| 0.8.0 | Subscribed-mod filters (all/global/content) and sorting (alphabetical/recent/updated); new and updated badges; global toggle in the list |
| 0.9.3 | Object spawning, plus two official spawnable asset packs |
| 1.2 | Curated "Featured mods" in the Mod Manager, grouped by type with short blurbs |
| 1.4 | Creative Mode, reached from Sandbox: spawn, move, duplicate and save objects |
| 1.5.2 | Spawn menu redesigned |
| 1.5.3 | Spawn menu search fixes |
| 1.6.0 | Spawnable ragdoll in the spawn menu |
| 2.0.2 | Multiplayer host can disable the spawn menu |

## 3. How players load, enable and use mods

**Mod Manager** (main menu → Play → Mod Manager)
- **Left column.** Source lists: Built-in, Subscribed (Workshop), Local (the user's own `mods/` folder) and Featured, which is curated by the developer. Subscribed mods can be filtered by all/global/content and sorted by name, recently subscribed or recently updated. New and updated mods carry a badge.
- **Right info pane.** Preview image, title, author and description, plus buttons:
  - **Play** for content mods
  - **Enable/Disable** toggle for global mods
  - **Options** if the mod has `options.lua`
  - **Make local copy** for built-in mods
- **Context menu.** Unsubscribe, or open the mod's Workshop page.
- **Featured mods.** Subscribing works in place. Once the download finishes, the button becomes an active/disabled toggle.
- **Enable state is global and persistent.** Every enabled global mod runs its `main.lua` in every level, campaign included, and they stack. Conflicts are common, for example two mods that both replace the spawn menu. Players resolve them by hand, and mod pages routinely warn "disable X before using this".

**Spawn menu** (in-game, Sandbox, Creative Mode and wherever spawning is allowed)
- It is a categorized browser of spawnable prefabs from the base game plus every installed mod's `spawn.txt`.
- The category comes from the left side of the slash in `Category/Name`. Mods freely invent categories such as cars, weapons, props or characters, and the menu groups entries by category and by mod. It also has a text search (since about 1.5).
- Picking an entry places the prefab in front of the player. Static parts become dynamic.
- Vehicles spawned this way are drivable at once. Tools exported as spawnables are pickups.
- Creative Mode adds moving, duplicating and saving spawned objects.
- Some community mods replace the whole menu with a more sandbox-style menu. These add icon grids, right-click popups, noclip, and "tool-gun" style manipulation. That such menus are among the most popular mods shows that players want a richer spawn and manipulation UI than the vanilla one.

**Tools in the toolbelt.** A tool mod calls `RegisterTool(id, name, vox)` and enables `game.tool.<id>.enabled`. The tool then joins the weapon wheel or hotbar next to the built-in sledge, extinguisher, spray can, pipe bomb and so on. Its ammo lives in the registry (`game.tool.<id>.ammo`).

**Lessons for Wrecking Shift**
- Keep three entry points:
  1. a Mod Manager with Enable toggles for global mods
  2. a Play list for maps and game modes
  3. a searchable in-game spawn menu fed by every enabled mod's spawn list
- Add what Teardown lacks:
  - conflict tags, such as "replaces:spawnmenu" and "gravity", that warn when two enabled mods touch the same system
  - per-mod quick toggles and a "disable all" button
  - spawn menu favorites
  - presets, i.e. saved mod sets

## 4. Category taxonomy and rough popularity

**Method.** The estimate comes from:
- 60 most-subscribed items, classified by kind only
- press roundups
- the Workshop tag filters

**Rough split of the top 60**
- maps: about 45% (18 of the first 30 and 15 of the second 30 are environments)
- weapons and tools: about 25%
- vehicles: about 12%
- creatures and characters: about 7%
- gameplay and multiplayer modes: about 5%
- visual and graphics: about 3%
- frameworks and libraries: about 3%. Vehicle frameworks appear twice in the top 30, as dependencies of other mods.

Broader catalog counts (by tag) are not published, so treat the percentages as indicative.

| Rank | Kind | Popularity | Typical tag(s) |
|---|---|---|---|
| 1 | Sandbox destruction maps (towns, houses, malls, prisons, castles, space stations, scrapyards, tiny or miniature cities) | Very high, the largest share | Map, Content |
| 2 | Weapon packs and single weapons (firearms, launchers, incendiary, rail/beam, melee, thrown novelty) | Very high | Tool, Global |
| 3 | Object manipulation tools (physics or grab guns, tool guns, welders, magnets, portals, grapples) | High; 3 in the top 30 | Tool, Global |
| 4 | Spawnable vehicle packs (military, emergency, civilian, aircraft, helicopters, airliners, walkers, robots) | High | Vehicle, Spawn |
| 5 | Explosives and destruction tools (charges, detonation cord, air strikes, bombardment) | High | Tool |
| 6 | Creatures, NPCs and characters (dinosaurs, zombies, giant monsters, animals, playable characters) | Medium to high | Character, Spawn, Gameplay |
| 7 | Disaster and event spawners (tornado, meteor, flood-like, earthquake-like) | Medium | Gameplay, Global |
| 8 | Gameplay modes and overhauls (multiplayer build modes, survival, heists, races) | Medium; rising since multiplayer | GameMode, Multiplayer |
| 9 | QoL and menus (spawn-menu replacements, slow-motion toggles, noclip, cheats, teleport) | Medium | Global |
| 10 | Visual and graphics (damage visuals, decals, lighting, weather, time of day) | Low to medium | Global |
| 11 | Performance and physics tweaks (freeze debris, debris cleanup, gravity, destruction strength) | Low to medium; often recommended alongside big maps | Global |
| 12 | Frameworks and libraries (vehicle frameworks, shared UI libraries) | Niche, but heavily subscribed because others depend on them | Asset, Global |
| 13 | Asset and prop packs (furniture, decorations, seasonal lights, building kits) | Medium in count, lower in subs | Asset, Spawn |
| 14 | Map editors and builders (in-game building, voxel paint, save and load) | Niche; partly absorbed by Creative Mode | Tool, Global |

## 5. Typical mechanics per kind

These describe how such mods usually work. They are not specific mods.

**Maps**
- An XML scene with many `.vox` buildings, a spawnpoint and environment settings.
- Often dense breakable interiors, ramps, and pre-placed vehicles and explosives.
- Variants: tiny-scale maps, which are cheap to render and fun to stomp; huge open maps; themed set pieces built around a scripted giant target.
- Sandbox maps have no objectives. Some add simple scripted objectives such as alarms, timers or collectables.

**Weapons**
- Built on `RegisterTool`. Per-frame `tick` reads input, raycasts or spawns projectile bodies, and calls `MakeHole` with three radii, `Explosion` or `SpawnFire`.
- Ammo is kept in the registry, plus recoil impulse on the player, particles and sound.
- Popular feel features: alternate fire modes, swappable ammo types, charge-up beams that pierce everything in a line, and self-knockback used for movement.

**Manipulation tools**
- Raycast to a shape, then attach a joint or apply a velocity to drive the body toward a target point.
- Rotate with the mouse wheel. Freeze in place. Weld two bodies with a joint, or delete, duplicate or resize them.
- Portals: render-target screens plus teleporting bodies.
- Grapples: a rope joint plus a pull force.

**Vehicles**
- A prefab XML with a `vehicle` node, wheels, a body, optional turrets and doors, and a `spawn.txt` export.
- Script add-ons cover turret aim, horns, sirens and lights, cranes and arms, tracks, flight, and boat buoyancy.
- Vehicle frameworks supply shared scripts: gearboxes, damage, fuel, and enter/exit seats.

**Explosives**
- Placeable bodies with a timer, remote, proximity or chain trigger, then `Explosion(pos, size)`.
- Larger "strike" tools call delayed explosions in from the sky at a marked point.

**Creatures and NPCs**
- Rigged or animated bodies whose AI is a script loop: pathfinding API, sight raycasts, a target state machine, melee or projectile attacks, and ragdoll on death.
- Giant monsters are big jointed bodies that stomp through buildings with `MakeHole` on contact.

**Disasters**
- A global or spawnable script that applies area forces: vortex velocity fields, falling meteor bodies with explosion on impact, a rising water plane, shaking forces, or lightning strikes with fire.

**Game modes**
- A script owns the rules: timers, scores, objectives, win and lose states, and HUD drawing in `draw`.
- In multiplayer they can use teams, rounds, and server-authoritative scoring through mplib.

**QoL and menus**
- Global scripts that draw a UI in `draw`.
- They toggle `SetTimeScale`, give noclip by moving the player, teleport to the crosshair, refill ammo or unlock tools through registry keys, and cleanly replace the spawn menu.

**Physics and performance tweaks**
- Global scripts that set gravity (an environment property or a per-frame impulse) or change destruction radii scaling.
- They also delete small debris shapes below a voxel-count threshold, freeze bodies that stop moving, and slow time.

**Visual**
- Post-processing and environment overrides (fog, sun, weather, night), extra decals and paint, lights placed via spawnables, camera mods and photo modes.

## 6. Recommended distribution: about 110 original mods for Wrecking Shift

**Design goals**
- Cover every popular kind. Weight toward maps, tools and vehicles, which drive Teardown's popularity, but put real investment into global tweaks, because they are cheap to build and highly replayable.
- Every mod is data plus a script on Wrecking Shift's own mod API, using the three entry points from §3.
- All names below are invented placeholders. There are no brands and no trademarked vehicles.

| Kind | Count | Entry point |
|---|---|---|
| Props and items (spawnable asset packs, physics objects, building kits) | 16 | Spawn menu |
| Tools and weapons (hand tools, explosives, manipulation, novelty) | 20 | Toolbelt (some also as pickups) |
| Vehicles: cars | 8 | Spawn menu |
| Vehicles: trucks and utility | 7 | Spawn menu |
| Vehicles: heavy machinery | 7 | Spawn menu |
| Vehicles: boats and water | 4 | Spawn menu |
| Vehicles: odd and novelty (walkers, carts, contraptions, aircraft-lite) | 6 | Spawn menu |
| Maps (sandbox destruction environments) | 14 | Play list |
| Game modes (rule sets that run on any map or a bundled map) | 10 | Play list |
| Global tweaks: physics, time and difficulty | 10 | Mod Manager toggle |
| Global tweaks: QoL and HUD | 4 | Mod Manager toggle |
| Creatures and NPCs, plus disasters/events | 4 | Spawn menu and toggles |
| Cosmetic and visual (palettes, weather, lighting, camera) | 8 | Mod Manager toggle |
| **Total** | **118** | Cut to about 110 by dropping the weakest ideas during prototyping |

Vehicles total 32. That is about 27%, more than their share of Teardown's top list. A demolition-job game benefits more from a deep vehicle roster than a weapon-led sandbox does.

Example concepts follow, 3–5 per kind, all original.

**Props and items (16)**
- *Pallet Mountain*: stackable wooden pallets, crates and drums with different material hardness, for building towers to topple.
- *Domino District*: tall concrete slabs and brick pillars arranged by a placement helper into chain-reaction runs.
- *Junkyard Odds*: rusty fridges, washing machines, tyres and oil barrels. Some barrels leak a flammable puddle.
- *Glasshouse Kit*: modular greenhouse panels and frames that shatter spectacularly.
- *Counterweight Set*: wrecking balls, chains, pulleys and pendulum frames to rig your own swing traps.

**Tools and weapons (20)**
- *Rivet Popper*: fires heavy rivets that pin two bodies together, or punch small holes in soft material.
- *Seam Cutter*: a slow, precise cutting torch that slices a straight line through metal plates, with a sparks trail.
- *Thump Charge*: a stickable charge with a dial for blast size versus fuse length, detonated from a clicker.
- *Tether Reel*: shoots an anchored cable. Reel in to drag a wall section down, or pull yourself across a gap.
- *Foam Sprayer*: hardening foam that glues debris into new, temporary solid blobs, for propping up or blocking.

**Vehicles: cars (8)**
- *Sprocket Hatch*: a tiny, light commuter hatchback with a soft body and comedic crumple.
- *Longhaul Wagon*: a boxy estate car with a roof rack that holds spawned props.
- *Dune Skipper*: an open-frame buggy with long-travel suspension, for ramp maps.
- *Patrol Sedan*: a generic four-door with a light bar. The siren and lights are a toggleable script.

**Vehicles: trucks and utility (7)**
- *Tipper Six*: a six-wheel dump truck whose bed raises and pours debris loads.
- *Boom Lift Van*: a van with an extending basket for reaching high floors.
- *Flatbed Hauler*: a winch and flatbed for loading wrecked cars or props.
- *Water Bowser*: a tank truck with a roof cannon that puts out fires and knocks things over.

**Vehicles: heavy machinery (7)**
- *Long-Reach Excavator*: a two-joint arm with interchangeable heads (bucket, breaker, shear), set in the spawn options.
- *Ball Crane*: a tracked crane swinging a wrecking ball on a real rope joint.
- *Bulldozer Mk2*: a blade that pushes rubble piles and topples weakened walls.
- *Pile Driver*: a slow rig that hammers vertical holes through floors.
- *Road Roller*: crushes small props flat, slowly and inevitably.

**Vehicles: boats and water (4)**
- *Harbor Tug*: a sturdy pusher boat with a bumper nose, for shoving barges into piers.
- *Skiff Runner*: a fast outboard boat that jumps off waves.
- *Dredge Barge*: a floating platform with a crane arm, for waterfront demolition maps.

**Vehicles: odd and novelty (6)**
- *Strider Rig*: a slow four-legged walker carrying a cutting torch.
- *Shopping Cart Racer*: a rocket-assisted cart with no brakes.
- *Gyro Kite*: a small, fragile autogyro for scouting maps from above.
- *Wheel of Ruin*: a giant rolling hamster-wheel cage you drive from inside.

**Maps (14)**
- *Quarry Edge Estates*: cliffside houses above an open quarry. Debris falls a long way.
- *Old Mill Row*: brick factories with tall chimneys, made for controlled-collapse practice.
- *Pocket Town*: a quarter-scale town where the player feels like a giant. A perf-friendly showcase.
- *Frozen Marina*: piers, boat sheds and thin ice. Pairs with the water vehicles.
- *Overpass Knot*: stacked concrete highway ramps and support pillars for structural-failure fun.

**Game modes (10)**
- *Shift Clock*: demolish a target percentage of marked buildings before the whistle. Score is based on efficiency.
- *Precision Contract*: destroy the marked rooms only. Collateral damage costs points.
- *Tower Topple*: build the tallest stable tower from props, then survive a scheduled quake.
- *Salvage Rush*: haul glowing valuable items to the drop zone while the building collapses around you.
- *Last Wall Standing* (multiplayer): teams fortify, then swap and wreck each other's fort.

**Global tweaks: physics, time and difficulty (10)**
- *Feather Gravity*: low gravity (a 0.2–0.6× slider) with floaty debris clouds.
- *Brittle World*: all destruction radii scaled up. Concrete behaves like chalk.
- *Bedrock Mode*: everything is twice as tough. Slow, methodical demolition.
- *Bullet Time Pedal*: a hold key for smooth slow motion, plus a speed slider.
- *Sticky Debris*: debris welds to whatever it lands on, so piles build up into strange sculptures.

**Global tweaks: QoL and HUD (4)**
- *Tidy Crew*: removes small debris after N seconds. Performance helper.
- *Freeform Camera*: noclip spectator and photo camera with FOV and roll controls.
- *Quick Rewind*: snapshots the scene every few seconds, so you can undo the last big collapse.
- *Stat Board*: an overlay with voxels destroyed, largest fall and a combo meter.

**Creatures, NPCs and events (4)**
- *Pigeon Flock*: harmless birds that scatter from noise. Ambient life.
- *Rumble Hour*: a periodic ground-shake event whose strength is set in options.
- *Meteor Drizzle*: small burning rocks rain on the map at a set rate.

**Cosmetic and visual (8)**
- *Golden Hour*: warm, low sun, long shadows and dust haze.
- *Blueprint Vision*: a toggleable wireframe overlay that tints materials by hardness.
- *Neon Night*: a night preset with emissive signage and colored street lamps.
- *Retro Palette*: limited-color, dithered post-process.
- *Confetti Debris*: purely cosmetic party-colored particles on every break.

## 7. Implementation notes for the built-in mod system

These follow from the research.
- **Manifest fields.** Mirror the Teardown concepts, with Wrecking Shift names:
  - `id`, `name`, `kind` (one of global, map, mode or asset), `tags[]`
  - `spawn[]`, holding `{prefab, category, name}`
  - `tools[]`
  - `options` schema
  - `conflicts[]` (system keys such as gravity, timescale or spawnmenu)
- **Options as data.** Use sliders, toggles and selects stored per mod, instead of hand-written `options.lua` UIs. That is easier for 110 built-ins and keeps them consistent.
- **Built-ins are read-only, but can be duplicated into user mods.** This is Teardown's "make local copy" pattern, and it gives modders 110 templates.
- **Spawn menu.** Order by category first and mod second. Add search, favorites and recently used. Show the category list from §6 so that built-ins and future user mods share the same names.
- **Featured shelf.** Hand-curate a rotating set of built-ins. Teardown's 1.2 change shows that curation matters once there are hundreds of mods.
