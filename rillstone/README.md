# Rillstone

A first-person mining and water-automation sandbox for the browser. You dig
gravel in a riverside claim, wash it in a pan, then build water-driven
machines, belts and logic that mine, wash, smelt and sort on their own. It's
built with [Three.js](https://threejs.org/) for rendering and
[Rapier](https://rapier.rs/) for physics, running in a Web Worker.

Work in progress: see `BUILD_BRIEF.md` for the plan and `NOTES.md` for
measurements and decisions so far.

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
in Settings → Keys; bindings and settings are saved in `localStorage`.

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Move / look | WASD / mouse | left stick / right stick |
| Sprint / crouch / jump | Shift / C / Space | L3 / B / A |
| Pick up | E | X |
| Drop / place held item | G | |
| Use held tool | LMB | RT |
| Secondary | RMB | LT |
| Quick-swap tool | Q | Y |
| Lantern | L | |
| Debug overlay | F3 | |
| Menu | Esc | Start |

Movement is 4.2 m/s walking, 6.8 m/s sprinting (Shift, or a toggle in
Settings), 2.0 m/s crouched, with a 1.1 m jump under 22 m/s² gravity. The
character steps up 0.35 m and climbs slopes up to 50°. There's no fall damage;
"Return to claim post" in the pause menu gets you unstuck.

## Digging and washing

You start on the **Gravel Bar** claim by the river, holding a shovel, with a
pan in your quick-swap slot and a bucket by the claim post.

- **Shovel** (LMB on the claim) digs one gravel load. LMB again pours it into
  a pan or bucket you're aiming at, or dumps it as a dirt clod.
- **Bucket** holds 4 loads. Dig straight into it, then pour into a pan.
- **Pan** holds 2 loads. Scoop from the claim, then aim at the river and click
  once per load to wash it. Each washed load rolls once on the band's loot
  table and drops a find into the pan. LMB on dry ground tips the finds out.
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

## Town and money

Millbrook sits across the bridge from the Gravel Bar.

- **Selling.** Put finds on the **Assay Office** counter and ring the bell
  (E). The clerk weighs them and the ledger pays base price in Scrip (§).
- **Market stalls.** The three stalls each want one thing a day, shown on
  their chalkboards. They pay up to 130% of base, falling as you sell to them.
- **Shops.** The **General Store** sells tools and shovel upgrades, the
  **Millwright** sells the starter automation kit as crates, and the **Wagon
  Shed** sells charcoal and can call your truck to its yard. Purchases
  appear on the delivery pad by each shop.
- **Guild board.** It has three contracts, which pay Scrip and Guild
  Standing, and claim deeds. Willow Bend costs § 900.
- **The Old Hauler.** F gets in and out, WASD drives, Space brakes and H
  (hold) unflips. Drop items onto the bed with G to carry them to town; E takes
  them out again. It burns charcoal: LMB with a sack on the truck refuels it.
- **Saving.** The pause menu has 3 save slots (autosave every 3 minutes),
  plus export and import of `.rillsave` files.

## Machines and water

Buy machines at the **Millwright** and **Foundry Yard**. They arrive as
crates.

- **Placing.** Hold a crate to see a placement ghost (green fits, magenta
  doesn't). R rotates and LMB places. A placed machine is unlocked: E picks
  it back up, and the **Mallet** locks it (LMB) or unlocks it (RMB).
- **Machine panel.** RMB opens it: status, water, speed, wear, settings.
- **Water.** A **River Intake** (mouth in the river) supplies water. Lay
  **pipe** by holding a coil and clicking one machine's brass port, then
  another's. A **Pipe Junction** splits one supply between machines.
- **Flow.** Each network shares its flow: machines run at
  `0.2 + 0.8 × min(1, supply / demand)` of full speed, so too little water
  slows them rather than stopping them.
- **Silt.** River silt wears drills and sluices. Settling tanks clean the
  water, and the Wrench and Repair Kit fix wear.
- **A first line.** Put a **Drill** in your claim with its spout over a
  **Sluice**'s hopper and pipe water to both. It digs and washes on its own,
  spilling finds out of the sluice's end.
- **Heat.** The **Kiln** (quartz fuel) or the **Crucible** melts one ore at
  a time; pour it from the panel to get a hot ingot. The **Workbench** turns
  a hot ingot into a tool head, ring, chain or chalice; hold a cut gem in
  your swap slot to set it into a ring or chalice. The **Grinding Wheel**
  cuts gems (3 clicks).

## Belts and logic

- **Belts** (Millwright) carry items from machine to machine.
  - **Placing:** butt pieces end to end; a **Belt Drive** with water runs
    the whole line.
  - **Routing:** **Sorters** pick one material and stage (RMB to choose),
    **Splitters** alternate, and **Mergers** join lines.
  - **Gems:** the **Gem Cutter Hook** cuts gems riding past.
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
  - **Gates:** AND/OR/NOT, compare, add/subtract, latch, pulse, delay.
  - **Sensors:** scale plate, counter, wear, fill.
  - **Outputs:** valve, belt gate, pour trigger, lamp, siren, charge,
    ejector, display.
  - **Range:** sensors and outputs act on the nearest machine within 2.6 m.

## The valley

Rillstone Vale is about 600 × 600 m, shaped by `src/js/world/valley.js`.

- **River.** A glacier-fed river winds north to south down the middle,
  dropping 16 m over the falls below Upper Falls.
- **Terraces.** The valley sides climb in pale sandstone terraces to slate
  mountains with snow on the peaks.
- **Places.** Millbrook sits flat on the east bank of a bend, and Upper Falls
  sits on a shelf above the falls. Claim plots are flattened into the terrain.
- **The old adit.** A timbered tunnel cut into the terrace cliff east of
  town. It will lead to the Ember Seam claim later.

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
| `js/game/vehicles.js`, `js/defs/vehicles.js` | The Old Hauler: model, wheels, driving input, chase camera, fuel, unflip, cargo |
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
- rebinds a key through the settings panel and checks it took;
- digs 50 holes with the shovel, then pans 20 loads in the river and checks
  20 finds land on the bank (`--dig`);
- drops 80 copper nuggets in one spot and checks they merge into a pile;
- earns § 1,000 by panning and selling, buys the starter kit, carries a
  nugget in the truck bed, drives over fresh ruts (benchmark 3), unflips the
  truck, saves, reloads the page and checks everything persists (`--town`);
- runs an intake → drill → sluice line for 10 simulated minutes, checks that
  halving the intake slows it by the formula, and melts, cuts and crafts a
  ring (`--machines`);
- runs a fully automatic dig → wash → sort → smelt → bin line for 15
  simulated minutes, gated by sensors and a pour trigger; checks logic truth
  tables, jams and shaft power (`--belts`);
- runs digging benchmark 1 and screenshots the depth bands, the drop ring,
  a tooltip and panning;
- fails on any console error.

`node tools/unit.mjs` runs the loot unit tests, including 1,000 band-1 rolls
matching the table within ±5 percentage points.

Pointer Lock doesn't work headless, so `?test=1` exposes `window.__rill`
with methods to teleport, fly, set the time, run physics ticks and read
state.
