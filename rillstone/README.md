# Rillstone

A first-person mining and water-automation sandbox for the browser. You dig
gravel in a riverside claim, wash it in a pan, then build water-driven
machines, belts and logic that mine, wash, smelt and sort on their own. It's
built with [Three.js](https://threejs.org/) for rendering and
[Rapier](https://rapier.rs/) for physics, running in a Web Worker.

Work in progress: see `BUILD_BRIEF.md` for the plan and `NOTES.md` for
measurements and decisions so far. Milestones M0–M7 are done: digging,
washing, the town, water machines, belts and logic, all six claims,
Mk II–IV machines, vehicles, the Pumphouse end goal and 4-player co-op.

## Play

`index.html` is the whole game in one self-contained file, the same way the
other games in this repo ship. Three.js, Rapier (with its WebAssembly inlined),
fflate, the styles and the icon are all built in, so it makes no outside
requests. Put it on any static host, or just open it in a desktop browser. It
works offline.

Don't edit `index.html` by hand. It's generated from `src/` (see below).

## Develop

The source lives in `src/` as plain ES modules. While you work, serve the
`rillstone` folder and open `src/`:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765/src/>. In development, the libraries load
from jsDelivr through the import map in `src/index.html`, pinned to the same
versions the build bundles.

To rebuild the single-file `index.html` after changing anything in `src/`:

```bash
cd tools && npm install && npm run build
```

`tools/build.mjs` bundles each Web Worker into a string first, then bundles
and minifies the game with esbuild and inlines it with the CSS and icon. It
stops with an error if the import map's library versions drift from the ones
in `tools/package.json`, or if the file grows past 8 MB.

## Controls

Click the game to capture the mouse (Pointer Lock). Every key can be rebound
in Settings → Controls; bindings and settings are saved in `localStorage`.

Holding G is precision placement: R/T/Y turn the held item 45° per press
(Ctrl turns it back), the scroll wheel sets how far away the drop ring can
go, and letting go of G drops it there. B over an item, machine or prop opens
its look-up entry: what it is, what it's worth and what it's for. With
nothing under the crosshair, B opens the full guide.

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Move / look | WASD / mouse | left stick / right stick |
| Sprint / crouch / jump | Shift / C / Space | L3 / B / A |
| Pick up | E | X |
| Drop / place held item (on release) | G | X (hold) |
| Use held tool / confirm placement | LMB | RT |
| Secondary (unlock, machine panel) | RMB | LT |
| Rotate placement or held item (Ctrl reverses) | R / T / Y | D-pad |
| Drop reach (1.5–6 m) | scroll wheel | bumpers |
| Quick-swap tool | Q | Y |
| Enter / exit vehicle | F | Y (hold) |
| Unflip vehicle (hold) | H | |
| Look-up guide for the hovered item | B | Select |
| Map | M | Start |
| Lantern | L | |
| Fly (sandbox games only) | V | |
| Debug overlay | F3 | |
| Menu | Esc | Start (hold) |

Movement is 4.2 m/s walking, 6.8 m/s sprinting (Shift, or a toggle in
Settings), 2.0 m/s crouched, with a 1.1 m jump under 22 m/s² gravity. The
character steps up 0.35 m and climbs slopes up to 50°. There's no fall damage;
"Return to claim post" in the pause menu frees you if you get stuck.
Settings → Graphics has four presets: High, Medium, Low and **Very low**, for slow
machines. Very low renders at reduced resolution with no shadows, a nearer
view and fewer trees.

Water slows you down: wading knee-deep drops you to about 70% speed, and
waist-deep to under half. Vehicles slow down in the river too, throwing
spray, and past their wading depth the engine sputters at a fifth of its
power. Back out to shallower water. The river flows: wood, charcoal sacks, bedrolls,
crates and empty buckets float off downstream and wash up on a bank, while
ore, ingots, gems and metal tools sink and stay put, and deep water pushes you
along.

## Sandbox mode

Pick **Sandbox** on the New game page to build without earning first:

- Scrip never runs out (the wallet shows § ∞);
- every claim is yours and every Machine Shop blueprint is unlocked;
- Machine Shop builds need no ingots;
- vehicles never use fuel;
- **V** toggles flying (Space to rise, C to sink).

The mode is kept in the save, and the Saves page marks sandbox games with a
badge. Normal games stay as they were.

## First hour

A guide card in the top-left corner walks you through your first hour: scoop, wash, sell, load the truck, buy a better shovel, finish a contract, set up a drill line and buy your next claim. Each step pays a little Scrip. **B** opens the full guide with reference notes, and **M** opens the map.

Every metal has its own shape as well as its colour, so finds read without colour (● copper lump, ■ iron block, ⬢ silver flake, ▲ gold pebble). Tooltips show the same glyph.

## Digging and washing

You start on the **Gravel Bar** claim by the river, holding a shovel, with a
pan in your quick-swap slot and a bucket by the claim post.

- **Shovel** (LMB on the claim) digs one gravel load. LMB again pours it into
  a pan or bucket you're aiming at, or dumps it as a dirt clod.
- **Bucket** holds 4 loads. Dig straight into it, then pour into a pan.
- **Pan** holds 2 loads. Scoop from the claim, then aim at the river and click
  once per load to wash it. Each washed load rolls once on the band's loot
  table and drops a find into the pan, which carries up to 20 finds while
  you keep washing. LMB on dry ground or a shop counter tips them out, and
  LMB on the truck bed tips them in as cargo. E on a loose find drops it into
  your pan, even with the pan in the swap slot.
- **Pick** breaks ground fast and drops a dirt clod.
- **E** picks things up, **G** drops what you hold exactly at the ring under
  the crosshair (white means there's room, magenta means blocked), and **Q**
  swaps hand and slot. Hover anything for its name, weight, material and
  value.

Claims are voxel volumes with depth bands:

| Band | Depth | Look | Needs |
|---|---|---|---|
| 1 | 0–6 m | brown topsoil to ochre clay | any tool |
| 2 | 6–14 m | grey-blue river gravel | Steel tools |
| 3 | 14–22 m | dark slate with quartz flecks | Glimmer tools |
| Bedrock | below | patterned, undiggable | |

Deeper loads give heavier finds. Tools clink, throw sparks and tell you the
tier you need when a band is too hard. More than 60 resting finds of one kind
merge into a pile so the physics stays cheap.

- **Fill and level.** On your own claim, RMB with a loaded shovel packs the
  load back into ground near the surface (the top 1.5 m); RMB with an empty
  shovel cuts bumps down to the height you aim at.
- **Dirt piles.** A dozen dumped clods resting together merge into a dirt
  pile. E takes a clod; a shovel, bucket or pan scoops a load from it.

## Town and money

Millbrook sits across the bridge from the Gravel Bar.

Prices are low so you progress fast: the starter kit (sluice, drill, intake
and pipe) costs about § 200, and Machine Shop builds take half the ingots
they used to.

- **Selling.** The **Assay Office** is the one shop that buys, and it buys
  everything: ore, ingots, gems (cut or uncut) and crafted goods. Put things
  on its counter and ring the bell (E); the clerk weighs them and pays
  today's price in Scrip (§).
- **Today's prices.** Prices move a little every morning (between 80% and
  125% of a material's base value). The big board beside the Assay Office
  shows today's § per kg for every material, raw and refined, with ▲/▼ for
  the change since yesterday; E on it opens the full list.
- **Leaderboard** (pause menu or title). Players with an online Arcade
  account are listed by their Arcade name, ranked by Scrip, with how many
  ores they've sold. **View base** on an online player asks their game for
  a picture of their base from above. Players who aren't online show their
  last-seen numbers. Sandbox games and co-op guests aren't listed, and
  Settings → Gameplay can take you off it.
- **Shops.** Every shop counter in Millbrook (General Store, Millwright,
  Foundry Yard, Signal House, Wagon Shed) sells everything: tools, machines,
  logic parts, fuel and vehicles. What you buy appears on the pad by that
  counter, and vehicles wait in the yard. Any counter can call or sell your
  vehicles, and E on any claim post calls your vehicle to that claim.
- **Guild board.** It has three contracts, which pay Scrip, and claim deeds
  for Scrip (see Claims below). After a few contracts they also ask for
  ingots, cut gems and crafted goods.
- **The Old Hauler.** F gets in and out, WASD drives, Space brakes and H
  (hold) unflips. Drop items onto the bed with G to carry them to town; E takes
  them out again. It burns charcoal: LMB with a sack on the truck refuels it.
- **Barrow and chute.** A Barrow (General Store) carries 10 loads or 20
  finds while you push it. A Chute (Millwright) is a slick steel ramp:
  things dropped on its high end slide off the low end.
- **Camp gear.** The General Store also sells:
  - a **Bedroll**: RMB on it at night sleeps until 06:00; in co-op, everyone
    has to be in a bed;
  - a **Brass Lantern** that lights the ground round it after dusk;
  - a **Hand Scale** that weighs a find, pile, bin or truck bed and tallies
    its value;
  - **Firewood**, which a lit kiln chars into a sack of charcoal.
- **Scrapping.** Machine crates and tools left on the Machine Shop counter
  can be scrapped for iron worth 30% of what they cost.
- **Menus and saving.**
  - **Title screen:** a menu over the live valley, with Continue (your
    newest save, with its name, day and age), New game, Saves, Co-op and
    Settings.
  - **New game:** name the claim and pick one of 6 slots. A used slot says
    what it would replace.
  - **Saves page:** a card per slot, showing a picture, the name, day,
    Scrip, claims, play time and when it was saved. Each card has
    Load, Save here, Rename, Export (to a `.rillsave` file), Import and
    Delete (which asks first).
  - **Backups:** with "Show backups" ticked, each slot's save-before-last
    appears and can be loaded.
  - **Pause menu:** a sidebar of big buttons, each with its icon: Resume,
    Save and quit to title, Save, Saves, Settings, Co-op, How to play, Photo
    mode, Return to claim post, Call nearest vehicle, and Quit without
    saving (click twice). The HUD steps back while it's open.
    - **Photo mode** hides the menu and HUD for a clean screenshot; any key
      or click brings the menu back.
    - **Call nearest vehicle** parks your nearest vehicle that nobody is
      driving 5 m in front of you.
  - **Settings** opens beside the sidebar (from the title too).
    - **Tabs:** Graphics (quality, field of view, head-bob), Controls (a key
      table with a second key for each action), Audio and Gameplay
      (sensitivity, invert, sprint toggle, captions, tidy up).
    - **Saving changes:** changes wait until **Apply and save**.
      **Restore defaults** resets the tab you're on, and Back with unsaved
      changes asks once before throwing them away.
  - **Co-op page:**
    - set your name, host your world (from the title, host your newest
      save) or join with a 5-letter code;
    - in a session it shows the room code with Copy, the players and free
      seats, and Stop hosting or Leave.
  - **Autosave:** the game autosaves every 3 minutes to the slot you're
    playing. If the newest copy in a slot won't load, the older one does.

## Machines and water

Buy machines at the **Millwright** and **Foundry Yard**. They arrive as
crates.

- **Placing.** Hold a crate to see a placement ghost (green fits, magenta
  doesn't). R rotates and LMB places. A 0.5 m grid lies over the ground
  around the ghost and bends with the terrain, with the machine's footprint
  outlined; the machine sits on the ground at the snapped cell.
- **Port arrows.** While you hold a crate or a pipe coil, or look at a
  machine, arrows show its ports: green arrows point into item inputs,
  orange ones out of item outputs, teal rings mark water ports and violet
  arrows mark signal terminals. A placed machine is unlocked: E picks
  it back up, and the **Mallet** locks it (LMB) or unlocks it (RMB).
- **Machine panel.** RMB opens it: status, water, speed, wear, settings.
- **Water.** A **River Intake** (mouth in the river) supplies water. A
  **Pipe Junction** splits one supply between machines.
- **Laying pipe.** Hold a coil and click one machine's brass port.
  - **Mounting:** on the way, each click on the ground mounts the pipe to
    the floor there. It drops from the port to the floor, hugs the ground
    through every mount (held by brackets, with a joint collar every 2 m)
    and rises again into the far port.
  - **Finishing:** click the other port.
  - **Undo:** RMB takes back the last mount (or cancels a run with none).
  - **Preview:** shows the route and how much of the coil it needs.
  - **Direct runs:** with no mounts, the pipe arcs straight across as
    before.
  - **Signal cable:** works the same way.
- **Flow.** Each network shares its flow: machines run at
  `0.2 + 0.8 × min(1, supply / demand)` of full speed, so too little water
  slows them rather than stopping them.
- **Pressure.** Water leaves an intake at 100% pressure, and every metre of
  pipe loses some of it: copper 1% a metre, steel 0.6%, glimmer 0.35%. A
  **Header Tank** that is more than 10% full puts the line back to full
  pressure, so long lines want a tank every 30 m or so. Low pressure slows
  machines down to 55% of their speed (it never stops them). The machine
  panel shows the pressure, and a **Pressure Gauge** reads it as a signal.
- **Boosters.** Each fuelled **Booster Pump** on a network adds 20% of its
  intake flow and 10% pressure, up to four.
- **Silt.** River silt wears drills and sluices. Settling tanks clean the
  water, and the Wrench and Repair Kit fix wear.
- **A first line.** Put a **Drill** in your claim with its spout over a
  **Sluice**'s hopper and pipe water to both. It digs and washes on its own,
  spilling finds out of the sluice's end.
- **Heat.** The **Kiln** (quartz fuel) or the **Crucible** melts one ore at
  a time; pour it from the panel to get a hot ingot. The **Workbench** turns
  a hot ingot into a tool head, ring, chain, pendant, chalice or blade;
  hold a cut gem in your swap slot to set it into a ring, pendant or
  chalice. The **Grinding Wheel**
  cuts gems (3 clicks).
- **Sorting Hopper** (5 L/s). Pour finds in the top, by hand or from a
  belt. Those matching the sample set on its panel (a material, and a form
  or any form) drop out of the side chute; the rest go out of the front.
- **Gem Press** (15 L/s). Feed it cut gems of one kind. Two seconds after
  the last one arrives it fuses them into one bigger stone, and bigger gems
  are worth more per kilo (four 0.3 kg peridots: § 28 loose, § 35 pressed).
- **Funnel.** Drop finds or clods into its mouth, or feed it from a belt:
  they slide out of the spout into the machine in front, or onto the ground.
- **Magnet Rod** (General Store). LMB pulls loose finds within 6 m towards
  you.

## Belts and logic

- **Belts** (Millwright) carry items from machine to machine.
  - **Placing:** butt pieces end to end; a **Belt Drive** with water runs
    the whole line.
  - **Routing:** **Sorters** pick one material and stage (RMB to choose),
    **Splitters** alternate, and **Mergers** join lines.
  - **Gems:** the **Gem Cutter Hook** cuts gems riding past.
  - **Cutting to size:** the **Belt Saw** cuts ingots and gems riding under
    it to the size on its panel, or to the number on its signal terminal.
    The offcut follows behind.
  - **Jams:** belts back up when the next machine is full; nothing is ever
    deleted.
- **Ore Bins** and **Storage Crates** collect items. RMB lists what's in
  them.
- **Shaft power:** a **Water Wheel** in the river (or a **Turbine** on a
  pipe) drives the **Stamp Mill** (ore clods → 3 loads), the **Trommel**
  (screened loads wash 25% faster) and the **Lift** within 8 m.
- **The Smelter** (Foundry Yard) melts belt-fed ore and pours on a logic
  pulse.
- **Logic parts** (Signal House) hold numbers on signal cable, laid like
  pipe from an output (right) to an input (left).
  - **Inputs:** buttons and levers (E), dials, clocks.
  - **Gates:** AND/OR/NOT, compare, add/subtract/multiply/divide, latch,
    toggle, pass gate, pulse, delay.
  - **Sensors:** scale plate, counter, wear, fill, pressure gauge.
  - **Outputs:** valve, belt gate, pour trigger, machine switch (turns the
    nearest machine on and off), lamp, siren, charge, ejector, display,
    magnet (pulls loose finds within 2.5 m).
  - **Machines on signal:** the **Disposal Chute** destroys whatever falls
    in or arrives by belt while its signal is above 0 (always, with no
    cable). The **Mender** holds repair charges (a wrench gives 3, a repair
    kit up to 20); each rising signal fixes the most worn machine within
    4 m by 25%. A wear sensor, a compare gate and a Mender keep a line
    running on its own.
  - **Range:** sensors and outputs act on the nearest machine within 2.6 m.

## Claims, progression and the Pumphouse

**Claims.** Six claims, each its own voxel volume. Deeds are on the Guild board and cost Scrip only.

| Claim | Deed | Character |
| --- | --- | --- |
| Gravel Bar | yours | 6 m deep starter by the river |
| Willow Bend | § 180 | 22 m deep, good river access |
| Old Cut | § 300 | A half-dug pit. Dig its floor to find the relic the old diggers left |
| Slate Shelf | § 1,200 | Three terraces stepping down to the hillside: lifts and belts country |
| Glimmer Hollow | § 1,700 | A sure Glimmerite vein about 11 m down |
| Ember Seam | § 2,400 | Behind the door at the end of the adit; it gets deeper the further in you dig, down to basalt (band 4) |

**Veins.** Every claim has one hidden ore vein. A third of the loads washed from inside it give its metal. The **Prospector's Lamp** (any shop, § 80) is worn: E on it, and a meter by your Scrip glows violet and ticks faster as you near a vein. The **Survey Buggy** shows veins on a scanner while you drive.

**Machine Shop** (Millbrook, by the Wagon Shed). Buy a blueprint once, then put ingots on its counter and build. Leftover metal comes back as a smaller ingot; machines arrive as crates on its pad. A blueprint only needs the Scrip, then the ingots.

| Tier | Machines and tools |
| --- | --- |
| Mk II | Drill (tip 6.5 m: the gravel bed from the surface), Sluice (3 s), River Intake (90 L/s), Steel Pick |
| Mk III | Drill (tip 9 m), Sluice (2 s), River Intake (160 L/s), Glimmer Pick, Glimmer Pipe |
| Mk IV | Drill (Ember Seam only), Sluice for basalt, Ember Shovel, Ember Pick |

**Upper Falls.** Take the switchback road up the falls step, on the west bank. The **Gem Cutter** cuts any uncut gems on its counter for 12% of their cut value (ring the bell).

**Vehicles** (Wagon Shed). The Wagon Shed also lists your vehicles, so you can call one to the yard or sell it back for half.

| Vehicle | Price | What it does |
| --- | --- | --- |
| Trail Buggy | § 140 | Light, quick and bouncy. No bed |
| Hauler Mk II | § 360 | Bigger bed (3,000 kg, 90 items) and better grip |
| Survey Buggy | § 600 | A scanner shows veins within 90 m and how deep they are |
| Excavator | § 1,300 | Tracks. LMB cuts the next 1 m cell (fixed to the world grid) into its 10-load hopper; RMB empties it into a sluice under the bucket, or onto the ground |
| Ore Tram | § 80, rails § 60 for 10 | Click a start and an end to lay rails (4 m segments). Click a rail with the tram kit to set it on, drop up to 600 kg into its tub, and F sends it to the far end |

**The Rillstone Pumphouse** stands ruined on the bank below Millbrook. It is restored in five stages, and each stage takes a large delivery at its counter:

1. Iron and copper ingots.
2. The Old Cut relic and silver ingots.
3. Gold ingots and cut gems.
4. Glimmerite ingots.
5. Emberite ingots and three chalices.

Each stage pays Scrip, and the building comes back piece by piece. The fifth stage shows the end screen and puts a gold-plated water wheel on the Millwright's pad.

**Sound.** Machines play spatial loops by type. Machines of one type within 6 m share a voice, at most 8 play at once, and worn ones grind. The river sounds louder as you near it, and the engine follows your speed. Captions can show every cue.

## Co-op

Up to 4 players share one world. Open **Co-op** from the pause menu.

- **Hosting.** Press Host to get a 5-letter room code to share. Your browser runs the world, and your save keeps it.
- **Joining.** Type a friend's code and press Join. Their world loads in a moment; your own world is set aside until you leave.
- **Sharing.** Scrip and claims are shared. Everyone can dig, build and drive anywhere the group owns.
- **Accounts.** Online play goes through the arcade's realtime server and needs an Arcade account.
- **If the host leaves,** the session ends for everyone else with a "host left" message.

How it works: the host's browser runs the only simulation (physics, machines, economy, terrain). Guests move their own character at once and send what they do (dig, pick up, drop, place, drive, buy) about 20 times a second. The host runs those actions through its own copy of the guest's hands, then sends snapshots 12 times a second. Snapshots carry players, moving bodies within 60 m of a guest, vehicles, terrain edits, entity changes, machine status and the shared ledger. A joiner gets the whole world as one compressed package, sent in 16 KB chunks.

## The valley

Rillstone Vale is about 600 × 600 m, shaped by `src/js/world/valley.js`.

- **River.** A glacier-fed river winds north to south down the middle,
  dropping 16 m over the falls below Upper Falls.
- **Terraces.** The valley sides climb in pale sandstone terraces to slate
  mountains with snow on the peaks.
- **Places.** Millbrook sits flat on the east bank of a bend, and Upper Falls
  sits on a shelf above the falls. Claim plots are flattened into the terrain.
- **The old adit.** A timbered tunnel cut into the terrace cliff east of
  town. The door at its far end opens onto the Ember Seam for the deed holder.

A day lasts 24 real minutes. The sky, fog, sun colour and hemisphere light
follow the sun's height. At night the sun becomes a cool moonlight from the
opposite side. The sky light never drops below a minimum level, so nights and
the adit stay readable. Your lantern lights up by itself at night and
underground, and L toggles it.

## Code layout

| File (in `src/` unless noted) | What it does |
| --- | --- |
| `js/main.js` | Entry point: boot, frame loop (60 Hz physics, 20 Hz sim tick), lantern, test hook (`window.__rill`) |
| `js/core/rng.js`, `js/core/noise.js` | Seeded RNG (`?seed=`) and value noise |
| `js/core/settings.js`, `js/core/input.js` | Saved settings and key bindings; keyboard, Pointer Lock mouse and gamepad mapped to actions |
| `js/world/valley.js` | The valley's shape: height function, river, falls, town, hamlet, claim plots, adit |
| `js/render/scene.js` | Renderer, sky dome, sun/moon with cascaded shadows, day/night colour curves, shared materials with grain |
| `js/render/terrain.js` | Flat-shaded valley terrain in 100 m tiles with per-face colours, plus trimesh colliders |
| `js/render/water.js` | River ribbon with the depth-tint, flow and foam shader |
| `js/render/flora.js` | Instanced pines and boulders, with static colliders |
| `js/render/adit.js` | The old adit tunnel, timber sets and portal |
| `js/render/geom.js` | Helpers for vertex-coloured low-poly models |
| `js/world/claims.js` | Claim voxel volumes (density + band), spherical dig/fill brushes, chunk sampling |
| `js/workers/mesher.js` | Surface nets per 32³ chunk with baked AO and band colours |
| `js/render/claimMesh.js` | Mesher worker pool, chunk meshes, collider rebuilds (≤ 2 per frame, nearest first) |
| `js/defs/materials.js`, `js/sim/loot.js` | Materials, values, loot tables; weighted loot and lognormal weight rolls |
| `js/defs/items.js`, `js/defs/models.js` | Tool and item definitions; detailed low-poly models |
| `js/game/items.js` | Entity store for carriable things: location states, physics bodies, instanced nuggets, piles |
| `js/game/hands.js` | Hand and swap slot, tool actions (dig, scoop, pour, wash), pick up/drop, drop ring, hover outline, tooltips |
| `js/render/fx.js`, `js/core/audio.js` | Particle bursts; synthesised sound cues on volume buses with captions |
| `js/sim/economy.js` | Ledger, market buyers with saturation, contracts, claim deeds |
| `js/game/town.js`, `js/render/buildings.js` | Millbrook: buildings, counters, bells, clerks, stalls, guild board, delivery pads, bridge |
| `js/defs/shops.js` | Shop catalogues |
| `js/game/vehicles.js`, `js/defs/vehicles.js` | Vehicles (hauler, buggies, Excavator, tram): models, wheels, driving input, chase camera, fuel, unflip, cargo |
| `js/game/progress.js` | The Old Cut relic, the Ember Seam door, the Prospector's Lamp and vein meter |
| `js/game/workshop.js`, `js/defs/progression.js`, `js/render/pumphouse.js` | Machine Shop blueprints and builds, the Upper Falls gem cutter, the Pumphouse stages and end screen |
| `js/defs/machines3.js` | Mk II–IV machines and the gold-plated wheel |
| `js/game/heavy.js` | Excavator arm and hopper, Survey Buggy scanner, rails and the Ore Tram |
| `js/net/net.js`, `js/net/coop.js` | Co-op rooms over the arcade realtime server (rt.js); host-authoritative replication, guest actions, avatars |
| `js/core/save.js` | IndexedDB save slots with A/B halves, migrations, `.rillsave` export/import |
| `js/ui/panels.js` | Shop, contracts and save panels |
| `js/sim/flow.js` | Water flow budget: networks, sources, boosters, tanks, widest-path pipe limits, silt |
| `js/defs/machines.js`, `js/game/machines.js` | Machine models and specs; placement ghost, pipe runs, item links, production, furnaces, crafting, wear, machine panels |
| `js/defs/machines2.js`, `js/game/automation.js` | Belts (data lanes), containers, shaft power, stamp mill, trommel, lift, smelter feeding, logic engine |
| `js/game/player.js` | First-person controller: input to wanted velocity, view angles, smoothed camera |
| `js/ui/hud.js`, `js/ui/menu.js`, `style.css` | HUD, title, pause and settings panels |
| `js/core/workers.js` | Starts workers from Blob URLs (bundled strings in the build, rewritten modules in dev) |
| `js/core/physics.js` | Main-thread side of the physics worker: latest poses, batched queries |
| `js/workers/physics.js` | Rapier world at a fixed 60 Hz, character controller, bodies, queries |
| `tools/build.mjs` | Builds the single-file `index.html` (not in `src/`) |
| `tools/test.cjs` | Headless browser test (not in `src/`) |
| `tools/unit.mjs` | Node unit tests: loot table, weights, values (not in `src/`) |
| `tools/bench.cjs`, `tools/bench/` | Benchmarks from the brief's section 10, and `model.html` (renders a model from six angles: `?m=shovel&load=1`) (not in `src/`) |
| `tools/relay.mjs`, `tools/fixtures/rt.js` | A local stand-in for the arcade realtime server, and a copy of its client, for the co-op test (not in `src/`) |
| `tools/THIRD_PARTY_LICENSES.txt` | three.js, Rapier and fflate licence texts |

## Testing

Serve the `rillstone` folder first, then run:

```bash
node tools/test.cjs <screenshot-dir>
```

By default it tests the built `index.html`, and blocks and fails on any
outside request to prove the file is self-contained. Add `--src` to test
`src/index.html` instead, and `--move` or `--shots` to run one part only.
`SCALE=2` takes the screenshots at double resolution. It:

- measures walk, sprint and crouch speeds and the jump apex against the
  numbers above;
- screenshots the title, the start, noon, dusk, night, the adit from outside
  and inside, and the falls;
- checks the night and cave screenshots stay above a minimum brightness;
- rebinds a key through the settings panel and checks it took, and opens
  Save game from the pause menu and checks closing it returns there;
- digs 50 holes with the shovel, then pans 20 loads in the river and checks
  20 finds land on the bank (`--dig`);
- drops 80 copper nuggets in one spot and checks they merge into a pile;
- holds G, turns the held item with R and drops it on release, then
  presses B over it for its look-up entry;
- fills and levels claim ground with the shovel's RMB, and checks a dozen
  resting clods merge into a dirt pile you can scoop from;
- earns § 1,000 by panning and selling, buys the starter kit, carries a
  nugget in the truck bed, drives over fresh ruts (benchmark 3), unflips the
  truck, saves, reloads the page and checks everything persists (`--town`);
- runs an intake → drill → sluice line for 10 simulated minutes, checks that
  halving the intake slows it by the formula, and melts, cuts and crafts a
  ring (`--machines`);
- runs a fully automatic dig → wash → sort → smelt → bin line for 15
  simulated minutes, gated by sensors and a pour trigger; checks logic truth
  tables, jams and shaft power (`--belts`);
- checks M6: all six claims, the relic, the Ember Seam door, the lamp and
  veins, a Machine Shop build with leftovers, the gem cutter, all five
  Pumphouse stages and the end screen, the Excavator's grid cuts, rails and
  a tram run, the machine-sound voice limit, and the camp gear (bedroll,
  scale, Saw Bench, firewood into charcoal, smelter auto-pour, scrapping)
  (`--progress`);
- fast-forwards a drill and sluice of every tier in its own claim and band,
  and checks the pacing targets: hand washing, one Mk I line, and a late
  base (`--pacing`);
- runs digging benchmark 1 and screenshots the depth bands, the drop ring,
  a tooltip and panning;
- runs co-op in two browser contexts over the local relay: the guest joins
  a well-used world, both dig in the same claim, the guest carries an ingot
  to the truck, the host drives it, the guest sells it and buys a bucket,
  and claims, positions and Scrip must agree; then the host leaves
  (`--coop`);
- fails on any console error.

`node tools/unit.mjs` runs the loot unit tests, including 1,000 band-1 rolls
matching the table within ±5 percentage points.

Pointer Lock doesn't work headless, so `?test=1` exposes `window.__rill`
with methods to teleport, fly, set the time, run physics ticks and read
state.
