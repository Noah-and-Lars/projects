# Rillstone — build brief

This brief is the starting point for the session that builds the game. Read it top to bottom before writing code.

**Rillstone** is a working title; rename it freely. It is a first-person mining and water-automation sandbox for the browser, with online co-op for up to 4 players. You start by digging gravel with a shovel and washing it in a pan in the river. Later you build water-driven machines, belts and logic that mine, wash, smelt and sort on their own. You haul ingots and crafted goods to town in a truck, and use the money to buy deeper claims and better machines.

The genre and mechanics come from studying Hydroneer. The full research is in [`../reports/Hydroneer mechanics and web tech.md`](../reports/Hydroneer%20mechanics%20and%20web%20tech.md), and the raw notes are in `../research_notes/Hydroneer mechanics and web tech/`. **This is an original game, not a copy.** Do not use Hydroneer's names, items, places, art, UI look or map. Every name, number and system below is our own, even where the research inspired it. When you need to know *why* a design choice is here, look it up in the report's "Lessons for our game" section.

---

## 1. Hard rules for the building session

1. **Originality.** Do not use any of these anywhere in code, text or art: Hydroneer, Hydrocoin, Cloutium, Corestone, Bastion, Bridgepour, Ironil, Icehelm, Volcalidus, Masterwork Forge, Hydro Mole, Hydro Truck, Harvester (as a machine name), Construction Hammer, "Unstuck", or a blue/red placement ghost with an orange hover outline. Use the names in this brief.
2. **Repo conventions** follow the other games in this repo (`throttle-ridge/`, `cube-assault/`):
   - Source code lives in `rillstone/src/` as plain ES modules.
   - In development, libraries load from jsDelivr through an import map in `src/index.html`, pinned to exact versions.
   - `rillstone/tools/build.mjs` (esbuild) bundles everything into **one self-contained `rillstone/index.html`** that makes no outside requests except the optional realtime server. Copy the pattern from `throttle-ridge/tools/build.mjs`, including its check that the import map and `package.json` versions match.
   - Never edit `rillstone/index.html` by hand.
   - Include a `README.md` written in the same style as `throttle-ridge/README.md` (Play / Develop / Controls / Code layout).
   - Include a `tools/test.cjs` Playwright smoke test (see `throttle-ridge/tools/test.cjs`).
3. **Git.** Commit often, and push to the session's assigned branch. Don't open a pull request unless the user asks.
4. **Verify in the browser.** Chromium and Playwright are preinstalled. Every milestone ends with screenshots and the checks listed in section 11. Don't call a milestone done on code alone.
5. **Data first, physics second.** This is the most important architecture rule; see section 4. Gameplay state lives in plain data that the host owns. Rigid bodies are only for things that are loose and moving right now.

---

## 2. Tech stack (pinned)

These are the versions the research checked on 2026-11-22. Re-check npm before pinning, and keep the dev import map and `tools/package.json` identical.

| Part | Choice | Notes |
|---|---|---|
| Rendering | **three 0.187.0** with `WebGPURenderer` + TSL | Falls back to WebGL2 automatically; WebGL2 is still needed for Firefox Android and older devices. Pin exactly, because the API still changes between releases. In milestone M0, profile `WebGPURenderer` against `WebGLRenderer`. If WebGPU costs more CPU with many meshes, ship WebGL for now. |
| Physics | **@dimforge/rapier3d-compat 0.21.0** in a Web Worker | We use the `-compat` build because its WASM is inlined as base64, which fits our single-file rule (about 1.65 MB gzipped). Create the worker from a Blob URL so it works from one file. Step at a fixed 60 Hz, and send transforms back as a transferable `Float32Array`. |
| Compression | fflate 0.8.3 | Chunk deltas, saves and network snapshots. |
| Storage | IndexedDB (idb-keyval 6.3.0, or raw) | Saves (see section 9). |
| Realtime | The arcade's shared realtime server, `rt.js` | The same one Throttle Ridge uses; see `throttle-ridge/src/js/net.js`. It is loaded from `https://noah-and-lars.github.io/projects/rt.js?v=2` and exposes a Supabase-style client: `window.supabase.createClient()`, `client.channel(name, {config:{broadcast:{self:false,ack:false},presence:{key}}})`, `ch.track()`, `ch.send({type:'broadcast',event,payload})`, `ch.on('presence'|'broadcast', …)`. Its source isn't in this repo. Measure its message-size and rate limits in milestone M7 before relying on them. |
| Build | esbuild 0.24.x (match throttle-ridge) | |

Fallback options, only if a milestone's measurements force a change:
- **Jolt** (`jolt-physics` 1.1.2), if Rapier's raycast vehicle can't be made to feel good on dug terrain.
- **Babylon 9 + Havok**, if we need hundreds of dynamic lights. Avoid switching engines midway unless a benchmark demands it.

---

## 3. The game

### 3.1 Setting and art direction (our own)

**Setting.** Rillstone Vale is a terraced highland valley cut by a glacier-fed river. Generations ago a mining company abandoned it; now the valley guild is selling old claims to new prospectors. The mood is calm and cosy: no enemies, no health, no hunger. The danger is losing time, not your life.

**Look.** Make it a bright, crisp diorama, deliberately different from Hydroneer's muted, chunky, image-textured style.
- **Models and texture.** Use flat-shaded low-poly models with **vertex colours**. Add one small shared noise texture for grain, and avoid per-object image textures.
- **Edges.** Bevel edges lightly so the silhouettes read clearly.
- **Palette.** Pale sandstone and slate terraces, deep-teal river water, pine green, and warm cream wood. Use brass and copper for machines, with a clean enamel paint colour per machine family:
  - teal: water parts
  - ochre: extraction
  - brick: heat
  - violet: logic
- **Terrain.** Shade the dug terrain with a triplanar shader in **world space**, tinted by depth band (see 3.2), and bake per-vertex ambient occlusion during meshing.
- **Lighting.** One sun with cascaded shadows, plus a sky/hemisphere light. **Never let caves or night go below a minimum ambient level.** The research found that dark scenes were one of Hydroneer's two big readability fixes. Lanterns and machine lamps are pooled point lights.
- **Glow.** Molten metal, hot ingots and gems use selective bloom.
- **Water.** Use a shader: depth-tinted colour, foam where it meets geometry, and flow-map scrolling whose speed follows flow rate.
- **Hover and placement.** Hovered objects get a thin **white outline**. The placement ghost is translucent **green when valid and magenta when blocked**. The drop marker is an **unlit, high-contrast ring** projected exactly where the item will land.
- **UI.** Cream panels with dark-slate text in a rounded sans-serif. Show tooltips on hover with name, weight in kg, material and stage, and estimated value.

### 3.2 The world

The world is one hand-shaped valley (no procedural continents), roughly 600 m × 600 m. Its base terrain is generated from a fixed seed plus hand-placed features, and it is **not** diggable except inside claims.

- **Millbrook (town)** is the hub at the river bend. It has:
  - the **Assay Office**, which buys everything at its base price and holds the player's ledger;
  - the **General Store**, for tools and starter gear;
  - the **Millwright**, for pipes, belts and water machines;
  - the **Foundry Yard**, for heat machines and molds;
  - the **Signal House**, for logic parts;
  - the **Wagon Shed**, for vehicles;
  - the **Guild Hall**, with a contracts board and claim deeds;
  - a **Market Square** with three rotating buyers (see 3.6).
- **Upper Falls (hamlet).** A gem cutter and a second market buyer. You reach it up a switchback road where the truck matters.
- **Claims** are bounded diggable areas. Each one is its own voxel volume, with a different shape and character:

| Claim | Price | Size (m) | Depth | Character |
|---|---|---|---|---|
| Gravel Bar | free | 24 × 24 | 6 m (band 1 only) | River-edge starter |
| Willow Bend | 900 | 32 × 32 | 22 m | Gentle bank, good river access |
| Old Cut | 1,500 | 40 × 32 | 22 m | Half-dug old pit with a buried relic |
| Slate Shelf | 6,000 | 48 × 40 | 22 m | Terraced cliff; needs lifts and conveyors |
| Glimmer Hollow | 8,500 | 40 × 40 | 22 m | Has a guaranteed Glimmerite vein at mid-depth |
| Ember Seam | 12,000 | 32 × 48 | 28 m | Horizontal tunnel claim into the mountain, reaching band 4 |

The bounded claims are a deliberate performance cap: they bound voxel memory, remeshing work and save size. Players typically use about three. Ship M2 with Gravel Bar and Willow Bend only, then add the rest in M6.

**Depth bands** give each claim's dirt its colour and loot, and limit which tools can dig it:

| Band | Depth | Material look | Gate |
|---|---|---|---|
| 1 Topsoil & clay | 0–6 m | warm brown → ochre clay | any shovel |
| 2 Gravel bed | 6–14 m | grey-blue river gravel | Steel tools / Mk II machines |
| 3 Slate | 14–22 m | dark slate with quartz flecks | Glimmer tools / Mk III machines |
| 4 Basalt (Ember Seam only) | 22–28 m | near-black, warm glints | Ember tools / Mk IV drill |
| Bedrock | below | undiggable, visibly patterned | — |

A tool or machine works only on its own band or a shallower one. When a tool hits a band it can't dig, play a "clink" sound, throw sparks, and show a tooltip naming the tier needed.

### 3.3 Materials and loot

Our materials are real metals plus two invented rare minerals. All weights are in **kg**, as continuous numbers.

| Material | Ore value (per kg) | Refined value (per kg) | Rare tier role | Visual read |
|---|---|---|---|---|
| Copper | 6 | 8 (ingot) | — | orange-brown nugget → rose-copper ingot |
| Iron | 8 | 11 (ingot) | Mk I recipes | rust-grey nugget → dark steel ingot |
| Silver | 18 | 23 (ingot) | — | pale grey → bright white ingot |
| Gold | 30 | 36 (ingot) | — | yellow → deep gold ingot |
| Glimmerite | 140 | 170 (ingot) | gates Mk II/III | violet-blue crystal ore → violet ingot (faint glow) |
| Emberite | 200 | 240 (ingot) | gates Mk IV | black ore with red cracks → glowing red ingot (bands 3–4 only) |
| Quartz | not sellable | — | **fuel** for kilns and pressure boosters | milky white shards |
| Garnet / Peridot / Aquamarine | 14 / 16 / 20 | 26 / 28 / 32 (cut) | — | red / green / pale-blue, faceted when cut |
| Starstone | 160 | 260 (cut) | ultra-rare gem | dark blue with white sparkles |

**Loot roll.** Each processed gravel load makes one weighted roll on its band's table (the percentages below), then a weight roll.

| Result | Band 1 | Band 2 | Band 3 | Band 4 |
|---|---|---|---|---|
| Copper | 46% | 34% | 24% | 18% |
| Iron | 32% | 30% | 26% | 22% |
| Silver | 8% | 14% | 16% | 14% |
| Gold | 4% | 8% | 12% | 14% |
| Quartz | 6% | 6% | 8% | 8% |
| Gems (Garnet 50 / Peridot 35 / Aquamarine 15) | 3.9% | 5.5% | 7% | 8% |
| Glimmerite | 0.1% (pan only) | 2.4% | 5% | 6% |
| Emberite | — | — | 1.9% | 9.9% |
| Starstone | 0.01% | 0.1% | 0.1% | 0.1% |

- **Weight.** Draw weight from a lognormal distribution whose median grows with depth: 0.3 kg at the surface, 1.5 kg at 6 m, 2.5 kg at 14 m, 3.2 kg at 22 m and 4 kg at 28 m, with σ ≈ 0.5. Clamp the result to between 0.05 kg and 25 kg. Depth changes weight, not the odds within a band, and that is how deeper digging feels richer.
- **Veins.** A spherical vein (radius 3–6 m) gets seeded per claim at world generation. Inside a vein, ⅓ of rolls give the vein's material and ⅔ use the normal table. Veins are found with a Prospector's Lamp (a worn item) or the Survey Buggy.
- **Sizing.** Give nuggets a minimum visual size so small pieces stay visible and clickable.
- **Gem value.** Gems use superlinear value, `value = base × kg^1.15`, so a big gem is a real event; players asked Hydroneer for this.

**Value formula** (for the economy, tooltips and the scale): `value = baseValue[material][stage] × kg × craftMultiplier`.
- Craft multipliers at the Workbench: tool head ×1.1, ring ×1.15, chain ×1.2, chalice ×1.3. Setting a gem into a ring or chalice adds the gem's cut value × 1.1.
- Scrapping returns 30% of the value as scrap iron.
- No alloys. Each melt holds one material only. Feeding in a second material is rejected with a clear message, and it **never deletes items**.

### 3.4 The core loop and processing chain

```
DIG (shovel / pick / excavator / explosives)  → gravel loads (in shovel, bucket, barrow, hopper)
                                                or dirt clods (physics props that settle and merge)
WASH  pan in river (manual)  ─────────────────→ nuggets / gems / quartz
      Sluice Box (needs water flow) ──────────→ same, automated; yield bonus from flow
DRILL (fixed in place, never edits terrain) ──→ endless gravel loads from its band
SMELT crucible + campfire (manual) / Kiln (fuel: quartz) / Smelter (needs flow) → ingots
CUT   grinding wheel (manual) / Gem Cutter belt hook → cut gems
CRAFT Workbench: ingot (+gem) → tool heads, rings, chains, chalices
BUILD Machine Shop (in town): blueprint + ingot kg → Mk II–IV machines
SELL  Assay Office (base price, any amount) / Market buyers (better price, saturates)
```

A hand-digging session should feel tactile and quick. One click is one action, with no minigames:
- **Shovel.** One load per click; holds 1 load.
- **Bucket.** Holds 4 loads and pours at the drop ring.
- **Pan.** Holds 2 loads. Dip it in the river (drop it in), then click 2 times to wash; each washed load rolls once.
- **Pick.** Digs faster than the shovel and breaks hard clods.

### 3.5 Machines, water and logic (our own system)

We drive everything with a **water flow budget**, not Hydroneer's pressure-loss-per-pipe. Flow is a simple, readable resource with the same "invest in plumbing" payoff.

**Sources.** Each source adds flow (L/s) into its pipe network:

| Source | Flow |
|---|---|
| River Intake Mk I | 40 L/s |
| River Intake Mk II | 90 L/s |
| River Intake Mk III | 160 L/s |
| Water Wheel (also gives shaft power) | 20 L/s |
| Header Tank (a buffer that stores 2,000 L and smooths demand) | up to 60 L/s while above 10% full |
| Booster Pump (burns 1 kg quartz per 60 s) | +50% of the network's intake flow, applied after intakes |

**Pipes** have a capacity per tier: copper 60 L/s, steel 140 L/s, glimmer 300 L/s. A network's usable flow is capped by its narrowest pipe on the path to each consumer. This is solved as a simple max-flow over a tree. If the graph has cycles, fall back to an even split.

**Satisfaction.** Each consumer has a nominal demand. A network's satisfaction is `min(1, supply / demand)`, and every machine runs at `0.2 + 0.8 × satisfaction` of its nominal speed. That way machines never stop completely; they just slow down.

**Silt.** River water carries silt (0–10). Each Settling Tank on the line removes 3. Silt above 4 wears drills and sluices by 1% per minute per point over 4. Worn machines spark and slow, and the Wrench repairs them (the Repair Kit holds 5 uses). Make wear visible with a small dial on each machine.

**Shaft power** is a second, simple layer, and it is our own addition. Water Wheels, and later Turbines that sit on a pipe and convert flow, drive shafts and gearboxes. Shafts power the **Stamp Mill** (which crushes ore clods into gravel loads), the **Trommel** (which screens loads and makes sluices +25% faster) and the **Lift** (which moves players and items vertically).

**Machine catalogue (v1):**

| Machine | Cost | In → out | Needs | Notes |
|---|---|---|---|---|
| Sluice Box Mk I | 300 | gravel loads → loot (1 roll per load, 4 s) | 15 L/s | Hopper on top; bonus roll chance = 10% × satisfaction. |
| Sluice Box Mk II / III | blueprint 900 + 600 kg iron + 80 kg glimmerite / blueprint 2,200 + 500 kg glimmerite + 200 kg emberite | same, 3 s / 2 s; band ≤2 / ≤3 | 25 / 40 L/s | |
| Drill Mk I | 450 (Millwright, one-off) / blueprint 200 + 250 kg iron | → 1 gravel load per 5 s at its band | 20 L/s | Never edits terrain. Its tip depth decides the band and the weight. |
| Drill Mk II / III / IV | blueprints + ingots (scale like the sluices) | 4 s / 3.5 s / 3 s | 30 / 45 / 60 L/s | Mk IV only works in Ember Seam. |
| Stamp Mill | 1,100 | ore clods → 3 gravel loads | shaft | Loud and satisfying; shows its moving parts. |
| Trommel | 800 | gravel loads → screened loads (+25% sluice speed) | shaft | |
| Kiln | 1,200 | ore (one material) → ingot; 8 s per 10 kg | quartz fuel | Manual pour lever, or a logic pulse. |
| Smelter | 4,500 | belt-fed ore → ingot when full or on a pulse | 30 L/s + quartz | Rejects mixed ore with a message; never deletes. |
| Gem Cutter Hook | 500 | uncut → cut gem on the belt | belt | |
| Grinding Wheel | 90 | uncut → cut gem (manual, 3 clicks) | — | |
| Workbench | 120 | hot ingot (+gem) → crafted good | — | Ingots must be hot: reheat in the kiln for 20 s. |
| Machine Shop | (town) | blueprint + ingot kg → Mk II+ machines and boosters | — | Returns leftover kg as a smaller ingot. |
| Saw Bench | 160 | splits ingots or gems by a set kg | — | |

**Logistics:**
- **Belts** mount on a belt frame, not on pipes. That's different from Hydroneer.
  - **Pieces and prices:** straight (200), corner (220), incline (260), splitter (480), merger (440), sorter (520). The sorter filters by **material + stage**, picked from a menu; no example-item trays.
  - **Speed:** set by the shaft or flow they're attached to (0.6–1.6 m/s).
  - **Simulation:** belts are **lanes in data**. Items are spaced along a lane with a minimum gap and drawn as instanced props, and they become real rigid bodies only when they fall off the end. Jams are explicit: a lane backs up if its output is blocked. They are never emergent physics.
- **Containers:**
  - Crates hold 40 items and Ore Bins hold 400 kg; both are data lists with visual props.
  - The Hopper feeds a machine.
  - The Chute is a static ramp (a real collider).
- **Hand carts:** the Barrow holds 10 loads or 20 items and is pushed. Carts hook behind the truck.

**Logic** works through cables and signal hooks.
- **Signals are held values**, not momentary events like Hydroneer's: each cable carries a number that persists until it changes. That makes circuits easier to reason about.
- **Simulation:** it runs at 10 Hz in the host's sim tick.
- **Inputs:** Button, Lever, Dial (a number input), Clock (period set by a dial).
- **Gates:** AND, OR, NOT, Compare (`>`, `=`), Add, Sub, Latch, Pulse (rising edge), Delay (adjustable).
- **Sensors:** Scale Plate (kg on it), Counter (items passing on a belt), Wear Sensor (machine wear %), Fill Sensor (bin, tank or smelter fill).
- **Outputs:** Valve (cuts flow), Belt Gate, Smelter Pour, Kiln Pour, Lamp (colour), Siren, Logic Charge (explosive), Item Ejector.
- Show live values on cables when you hover them, and add a Display Panel output.
- **Selling stays manual on purpose.** You carry goods to town, which is what makes the truck matter.

### 3.6 Economy

- **The ledger is an abstract balance**, shown as "Scrip" (§) and held by the host. This avoids every duplication exploit the research found with physical coins. To make paying feel physical, you place goods on a counter, press the bell, and the clerk weighs and stamps them.
- **Assay Office** pays the base price for any amount, every day.
- **Market buyers.** Three stalls in Millbrook and one in Upper Falls each want one category each day: ingots of X, cut gems, crafted goods, or raw ore of Y.
  - **Price:** they pay 105–130% of base, falling 1.5% for every 100 § sold that day, with a floor at base.
  - **Recovery:** demand recovers overnight.
  - **Display:** a chalkboard shows today's wants and the price arrows.
- **No recurring costs, but goals keep coins meaningful:**
  - **Guild contracts.** Three active at a time, rotating and scaled to progress, e.g. "Deliver 300 kg iron ingots", "Deliver a garnet ring over 2 kg", "Smelt 1 t of copper".
  - **Contract rewards:** Scrip plus **Guild Standing**. Standing unlocks blueprint tiers and claim deeds, which stops pure grinding.
  - **Main goal:** restore the old **Rillstone Pumphouse**, a five-stage community project that each takes a large delivery. Finishing it is the visible end goal, rewarded with a dedicated end screen and a cosmetic gold-plated water wheel.
- **Starting state:** 0 §, a shovel, a bucket, a pan, a lantern, the Gravel Bar claim and the old hauler truck (see 3.7).

**Cost curve and pacing targets** (tune in playtests):

| Stage | What | Price (§) |
|---|---|---|
| Starter shop | shovel upgrades 25/600/2,000; pick 120; bucket 5; pan 12; crucible + campfire + mold 140; scale 60; lantern 30; prospector's lamp 400 | 5–2,000 |
| First automation | Sluice Mk I 300 + Drill Mk I 450 + Intake Mk I 40 + about 8 copper pipes 20–30 each | ≈ 1,000 |
| Mid | Kiln 1,200, belts 200–520, Stamp Mill 1,100, Steel pipes 180–240, Trail Buggy 700 | 200–2,500 |
| Late | Smelter 4,500, Mk III blueprints 2,200+, Mk II–III intakes 600/1,400, Survey Buggy 3,000, Excavator 6,500 | — |
| Claims | 900 / 1,500 / 6,000 / 8,500 / 12,000 | 28,900 total |

- **Hand washing** in band 1 earns about 40–80 § per minute, so the first machines take about 15–20 minutes of panning.
- **One Mk I drill + sluice** earns about 120–180 § per minute.
- **Late game:** an automated base of 20–40 drills should earn tens of thousands per hour. That's the "two orders of magnitude" jump from hand labour to automation that players love.

### 3.7 Vehicles

| Vehicle | Price | Role | Feel |
|---|---|---|---|
| Old Hauler (starter truck) | free (re-buy 500) | Carries machines, ingots and goods to town | Heavy, forgiving, strong traction, hard to roll |
| Trail Buggy | 700 | Fast errands, no cargo bed | Light, quick, bouncy |
| Hauler Mk II | 1,800 | Bigger bed, better handling | |
| Survey Buggy | 3,000 + Standing | Shows veins on a scanner | |
| Excavator | 6,500 + Standing | Digs with a bucket arm into its own hopper (10 loads) | Tracks; the cut volume is **fixed to the world grid, not the tilting chassis**, so trenches come out straight |
| Ore Tram | 400 per tram + rails 30 per segment | Rails between claim and Millbrook; carries 600 kg | Players asked Hydroneer for rails; ours is a scripted spline mover, not physics |

- **Fuel.** Fuel is charcoal, bought in sacks or made in the kiln from wood. One sack runs about 8 minutes, and you pour it into a hopper on the vehicle. A gauge and a sputter sound warn when it's low.
- **Cargo.** Items dropped into a bed or cart become **data attached to the vehicle**. They are drawn as props parented to the chassis, have no collision, and add mass to the vehicle body. This is the fix for Hydroneer's "trucknado". The bed holds 2,000 kg, or 60 items, or 4 machines.
- **Recovery.** Press **H** (hold 1 s) to unflip in place. There is a "Call vehicle" option at any Wagon Shed or claim post, and you can sell vehicles back for 50%.
- **Size.** Vehicles fit through all shop doors.
- **Physics.** Use Rapier's `DynamicRayCastVehicleController`:
  - Lower the centre of mass and add anti-roll.
  - Clamp steering by speed.
  - Use a high friction slip on dirt and add mild air control for landing.
  - The vehicle runs in the physics worker and the host owns it (see section 7).

---

## 4. Architecture

```
main thread                               physics worker                 mesher workers (2–4)
──────────────                            ──────────────                 ────────────────────
render (three)                            Rapier world @60 Hz            surface-nets meshing
input / UI / audio                        character controller           AO bake
SIM (host only): fixed 20 Hz tick         loose bodies (awake set)       collider vertex data
  ├ world state store (entities)          vehicles                       ↑ dirty chunk jobs
  ├ water/flow graph, shaft graph         terrain trimesh colliders      ↓ mesh + collider arrays
  ├ machines, belts (lanes), logic
  ├ economy, contracts, time of day
  └ net: snapshots out / intents in       ↕ transferable Float32Array (ids, pos, quat)
```

**Entities.** Everything placeable or carriable is an entity in one store: `{id, type, transform, state}`.
- `type` points to a definition table (`defs/*.js`) holding its mesh builder, collider, cost, footprint, sockets and behaviour.
- Item entities also carry `{material, stage, kg}`.
- An item is in exactly one **location state** at a time:
  - `loose`: a rigid body in the physics worker
  - `asleep`: a frozen body; no simulation, still collidable
  - `held`: a kinematic child of the camera
  - `contained(containerId)`: a data list entry
  - `onBelt(laneId, s)`
  - `inMachine(machineId)`

Each state change swaps how the item is represented. This mirrors the collision profiles the research found in Hydroneer's files, but in data.

**Sleeping.** Use Rapier sleeping, plus a forced freeze after 1.5 s at rest under a small velocity threshold. Picking up an item wakes only the bodies touching it.
- **Merging:** when more than 60 items of the same material and stage rest within 1 m, auto-merge them into a **Pile** entity (one mesh, a count and a total kg) so props stay cheap.
- **Budgets:** ≤ 300 awake bodies and ≤ 3,000 asleep.

**Placement grid.** The world grid is 0.5 m.
- **Snapping:** machines snap to it and to each other's sockets (pipe ends, belt ends, shaft ends, cable ports, hook slots).
- **Rotation:** 90° steps on all three axes.
- **Face snapping:** looking at a placed piece offers placement flush against the face you're aiming at.
- **Locking:** a placed machine is **unlocked** (can be picked up) until it's locked with the **Mallet**: left click locks, right click unlocks. Locked machines show a small brass rivet icon on hover.

**Terrain.**
- **Data:** each claim is a grid of 32³ chunks with 0.5 m voxels. Each chunk is an `Int8Array` density plus a `Uint8Array` band/material.
- **Edits:** edits are spherical SDF brushes (dig, fill, flatten). An edit marks the affected chunks and their neighbours dirty.
- **Meshing:** naive surface nets in a worker pool, with AO baked per vertex.
- **Colliders:** use a per-chunk trimesh collider, rebuilding at most 2 per frame and only for chunks near players, vehicles or active machines. If the M2 benchmark shows rebuilds are too slow, switch to Rapier's experimental voxel colliders.
- **Base terrain:** the town and the non-claim world are a static heightfield mesh with static colliders, which is cheap.
- **Dirt:** a dig produces gravel loads into the held container. If you're holding nothing, it produces one **dirt clod** prop (with the band's colour and 1 load), which merges into piles. There is no granular simulation.

**Water.** Rivers and ponds are a flat plane plus a trigger volume, drawn with the water shader. Pipes are a scalar graph solved in the sim tick; nothing is simulated as fluid.
- **Pipe outlets** show a particle stream.
- **Sluices** show an animated sheet of water.

**Time of day.** A 24-minute day with a sun angle curve and fog/sky colour curves. Beds skip to morning in single-player, or when every player is in a bed.

---

## 5. Controls

Pointer Lock goes on the canvas, requested from a click with `{unadjustedMovement:true}` and a fallback without it. Keys are rebindable through a settings panel stored in localStorage. Read the gamepad every frame. Touch is not a target for v1.

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move / look | WASD / mouse | left stick / right stick |
| Sprint (toggle option) / crouch / jump | Shift / C / Space | L3 / B / A |
| **Pick up** | E | X |
| **Drop / place held item** (at the drop ring) | **G** (separate from pickup, so you never pick something up by accident) | X (hold) |
| Use held tool / confirm placement | LMB | RT |
| Secondary (unlock with Mallet, open machine panel) | RMB | LT |
| Rotate held item or placement (Ctrl reverses) | R / T / Y | D-pad |
| Placement distance | scroll wheel | bumpers |
| Quick-swap tool slot (one extra carried tool) | Q | Y |
| Enter / exit vehicle | F | Y (hold) |
| Unflip vehicle | H (hold) | — |
| Look-up guide for the hovered item | B | Select |
| Map / journal | M | Start |
| Pause / menu | Esc | Start (hold) |

**Interaction model.**
- You hold one item in your hand, plus one **quick-swap tool slot**. The slot fixes the research's top complaint about having no inventory without breaking the physical feel.
- Worn items (Prospector's Lamp, helmet lamp) don't use your hand.
- The drop ring is placed **exactly under the crosshair ray**, with no offset, and drops are validated with a shape cast before they happen. Holding G enters precision placement (rotate, then set distance).

**Movement numbers** (our own; tune in playtests):

| Setting | Value |
|---|---|
| Walk | 4.2 m/s |
| Sprint | 6.8 m/s |
| Crouch | 2.0 m/s |
| Jump | 1.1 m apex |
| Gravity | 22 m/s² (snappier than Earth) |
| Step-up | 0.35 m |
| Max slope | 50° |
| FOV | 75° default (60–100 in settings) |
| Head-bob | small, off by default |

There is no fall damage. "Return to claim post" in the menu handles getting stuck.

---

## 6. UI and audio

**HUD:**
- crosshair
- drop ring (in the world)
- a hover tooltip card showing name, kg, material/stage, value and tier badge
- an action hint line, e.g. "LMB wash · G drop"
- Scrip balance and Standing in a corner
- a small clock
- toast messages for sales, contracts and errors

**Panels:** Shop (a catalogue with prices and a delivery pad), Machine (status, flow satisfaction, wear, settings), Contracts board, Map, Settings (graphics preset, FOV, sensitivity, rebinding, volume buses), and Multiplayer (host/join with a room code).

**Audio:**
- **Volume buses:** Music, Ambience, Machines, Water, UI.
- **Machine sounds:** spatial and attenuated, with a voice limit. Machines of the same type within 6 m are mixed into one loop.
- **Must-have cues:** a dig thunk per band, the pan swish, coins sounding when you sell, the "clink" when a band is too hard, a machine starting up, a worn machine grinding, low fuel, and a contract completing.
- **Making the sounds:** generate them with the Web Audio API (see `throttle-ridge/src/js/audio.js`) or use small embedded samples, keeping the single file under about 8 MB.

---

## 7. Multiplayer (host-authoritative, up to 4)

The user asked for online co-op. The research explains why Hydroneer dropped it: every item was a non-deterministic rigid body, and syncing thousands of them was impossible. Our data-first design avoids that.

- **Rooms.** Use the arcade realtime server (`rt.js`) and copy the room and presence pattern from `throttle-ridge/src/js/net.js`.
  - **Joining:** a 5-character room code from the same alphabet, a channel prefix such as `rill1-`, and at most 4 members.
  - **Host:** the player who created the world.
- **Authority.** The host's browser runs the only simulation: physics worker, sim tick, economy and terrain. Guests run rendering, their own character controller (client-side prediction), and interpolation of everything else.
- **Guests send intents** at up to 20 Hz, each with a sequence number:
  - movement: position, velocity and look, accepted if plausible
  - `pickup(id)`, `drop(id, pose)`, `use(toolId, target, hitPoint)`, `place(defId, pose)`, `lock(id)`
  - `vehicleInput(throttle, steer, brake)`
  - `uiAction` (buy, sell, contract, machine setting)
- **The host broadcasts snapshots** at 10–15 Hz:
  - awake rigid bodies within 60 m of each guest, as `id, pos (f32×3 or quantised i16), quat (smallest-three)`
  - vehicles and player avatars
  - changed entity fields (diffs)
  - terrain edit ops `{seq, claim, op, centre, radius}`
  - economy and contract changes

  Sleeping bodies, belt lanes (sent as lane parameters, not per-item positions), container contents and logic are sent only when they change.
- **Joining late.** A joiner gets a compressed world package: seed, claim chunk deltas, the entity table and economy state. Then they replay any ops with a higher sequence number. If the package is bigger than `rt.js` allows per message, chunk it and reassemble it. Measure the limit in M7.
- **Ownership.** Shared co-op wallet and Standing by default. Claims are shared, and everyone can build anywhere the group owns.
- **If the host leaves,** the session ends for guests with a "host left" message. v1 has no host migration. The host's save holds the world.
- **Fallback if `rt.js` can't carry it.** If the measured limits are too tight, add a small Cloudflare Worker with one Durable Object per room relaying WebSocket messages. A Cloudflare connector is attached to this environment, but it needs the user to authorise it. Ask before creating anything. Keep authority in the host browser either way.

Test this by playing in two browser contexts in one Playwright run. Both players dig in the same claim, one carries an ingot to the truck, the other drives it, and you check that the positions and balances agree.

---

## 8. Performance budgets (60 FPS on a mid-range laptop)

| Budget | Target |
|---|---|
| Physics worker per step | ≤ 6 ms |
| Sim tick (20 Hz) | ≤ 2 ms |
| Draw calls | ≤ 300 (`InstancedMesh` for nuggets, props and belt items; `BatchedMesh` for machines sharing a material) |
| Remeshes per frame | ≤ 2 |
| Initial single file | ≤ 8 MB uncompressed (Rapier compat alone is ~2.2 MB raw) |
| Garbage collection | Pool vectors, bodies and messages to avoid GC spikes; the research found this mattered in browser voxel games |

Add a debug overlay (F3) showing FPS, ms per system, awake/asleep bodies, draw calls, net kb/s and remesh queue length.

---

## 9. Save system

**IndexedDB layout:**

| Store | Contents |
|---|---|
| `meta` | save slot, version, play time, thumbnail |
| `entities` | one compressed blob of the entity table, including every machine setting (Hydroneer lost splitter and keypad settings on reload; we must not) |
| `chunks` | one record per **modified** chunk, compressed |
| `economy` | economy state |

- **Slots and autosave:** 3 slots. Autosave every 3 minutes, writing to a rolling A/B pair. A write commits only after the whole transaction succeeds, so you can never end up with a half-written save.
- **Persistence:** call `navigator.storage.persist()`.
- **Export/Import:** offer export and import of a `.rillsave` file, because Safari deletes site data after 7 days without a visit.
- **Versioning:** keep a `saveVersion` number and add a migration function for every bump.
- **Cleanup:** a settings option to clear loose clods and piles.

---

## 10. Things to measure early (risks)

Each of these has a go/no-go check in M0–M2:

1. **Digging.** Trimesh collider rebuild time while digging continuously, compared with Rapier voxel colliders.
2. **Body count.** 2,000 nuggets dropped into a pit: they must settle and fall asleep, and the physics step must stay ≤ 6 ms.
3. **Truck feel.** Driving the truck over freshly dug, uneven terrain without jitter or launching.
4. **Renderer.** WebGPU vs WebGL CPU cost with 500 machines on screen.
5. **Network.** `rt.js` message size and rate limits, and the cost of a world-package transfer.

---

## 11. Milestones and acceptance checks

Each milestone ends with a commit and push, updated README notes, Playwright screenshots, and the checks below passing.

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold & tech spike | `src/` and `tools/` layout copied from throttle-ridge. Three r187 scene, Rapier worker via Blob URL, single-file build works offline. Benchmarks 2 and 4 from section 10 recorded in `rillstone/NOTES.md`. |
| **M1** | Walk the valley | Static valley heightfield, river with water shader, sun, sky and fog, day/night cycle with a minimum ambient level. Pointer-lock FPS controller with the movement numbers in section 5. Settings panel with FOV, sensitivity and rebinding. Screenshot at noon, at dusk and in a cave. |
| **M2** | Dig & wash | Gravel Bar and Willow Bend as voxel claims, surface nets plus AO in workers, depth-band triplanar shading. Shovel, bucket, pan and pick. Loot rolls, nuggets as physics props with tooltips. Hold/drop with a precise drop ring. Sleeping and pile merging. Benchmark 1 recorded. Check: dig 50 holes, then pan 20 loads and get loot matching the band-1 table within ±5 percentage points over 1,000 simulated rolls (unit test). |
| **M3** | Town & money | Millbrook with the Assay Office, General Store and Wagon Shed. Ledger, sell flow at the counter, buy flow with a delivery pad. Market buyers with saturation. Contracts board with 3 contracts. Old Hauler truck with attached cargo, fuel and unflip (benchmark 3 recorded). Save/load with 3 slots, A/B autosave and export/import. Check: earn 1,000 § by panning, buy the starter automation kit, reload, and everything persists. |
| **M4** | Water & machines | Pipes with sockets and snapping, intakes, header tank, settling tank, booster pump. Flow solver with satisfaction. Sluice Mk I, Drill Mk I, Kiln, crucible and mold, Workbench, Grinding Wheel. Mallet lock/unlock and placement ghost. Wear and wrench. Check: a drill→sluice line runs unattended for 10 minutes, and halving its intake halves its throughput according to the formula. |
| **M5** | Belts & logic | Belt lanes (straight, corner, incline, splitter, merger, sorter), Smelter, Gem Cutter Hook. Water Wheel, shafts, Stamp Mill, Trommel, Lift. Logic cables, inputs, gates, sensors and outputs, plus a Display panel. Check: a fully automatic dig→wash→sort→smelt→bin line, gated by a scale plate and a smelter pour, runs for 15 minutes without jams. |
| **M6** | Progression & world | All six claims, Upper Falls, Machine Shop blueprints Mk II–IV, Guild Standing, veins and the Prospector's Lamp, Trail Buggy, Hauler Mk II, Survey Buggy, Excavator, Ore Tram and rails. Pumphouse restoration end goal. Audio pass. Check: a scripted fast-forward test reaches every tier, and the economy's pacing targets in section 3.6 hold within ±30%. |
| **M7** | Multiplayer | `rt.js` rooms with room codes, host-authoritative sim, intents and snapshots, late join with a world package, interpolation and prediction (benchmark 5 recorded). Check: a two-context Playwright test digs, carries, drives and sells, with state agreeing to within 0.1 m and to the exact Scrip. |
| **M8** | Polish | Performance against section 8, onboarding tips (first-hour guided contracts), accessibility (key rebinding, subtitle captions for audio cues, colour-blind-safe material shapes), README, final single-file build. |

---

## 12. How to test in this environment

- **Dev server:** `cd rillstone && python3 -m http.server 8765`, then open `http://localhost:8765/src/`.
- **Playwright:** `require('playwright')`; `chromium.launch()` needs no options. Pointer Lock doesn't work headless, so add a `?test=1` hook that exposes `window.__rill` with methods to teleport, give items, run N sim ticks, and read state, as Throttle Ridge does with its test camera hook.
- **Seeded randomness:** use a seeded RNG (`?seed=`) so loot and world generation are reproducible in tests.
- **Screenshots:** use `deviceScaleFactor: 2` for screenshots shown to the user and 1 for your own checks.
- **Build:** `cd rillstone/tools && npm install && npm run build`, then open `rillstone/index.html` from disk and confirm it runs offline.

---

## 13. Open decisions for the user

The building session can start without these, but should ask the user at the relevant milestone:

1. **The final name** (working title "Rillstone").
2. **Whether to add a link to the arcade's main page/menu** once M3 is playable. The site is served at `noah-and-lars.github.io/projects`.
3. **Whether to add cloud saves** using the arcade account (`arcade-acct` in localStorage) later.
4. **Whether to use Cloudflare for a multiplayer relay**, if `rt.js` turns out to be too limited (section 7).
