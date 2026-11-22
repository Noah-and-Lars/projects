# Rillstone — build notes

Measurements and decisions made while building, milestone by milestone. The
benchmarks are the go/no-go checks from `BUILD_BRIEF.md` section 10.

All numbers come from this cloud container: headless Chromium, 4 CPU
cores, and SwiftShader standing in for the GPU (both WebGL and WebGPU). Absolute
times are slower than a real laptop, so use them to compare options, not to
predict real frame rates.

## Benchmark 4: renderer (M0)

`tools/bench/render.html`, run with `node tools/bench.cjs render`. It draws 500
"machines" (4 parts each, shared materials by machine family) with a shadowed
sun at 960×540, and times the CPU side of `renderer.render()` over 200 frames
after a 60-frame warm-up.

| Renderer | 500 machines as separate meshes (2,000 meshes) | Same, as 5 `BatchedMesh`es |
|---|---|---|
| `WebGLRenderer` | **8.3 ms** median (p90 14.0) | **1.6 ms** (p90 3.1) |
| `WebGPURenderer`, WebGPU backend | 14.5 ms (p90 18.6) | 2.4 ms (p90 2.8) |
| `WebGPURenderer`, forced WebGL2 backend | 21.7 ms (p90 29.5) | 2.2 ms (p90 4.5) |

**Decision: ship `WebGLRenderer` for now.** WebGPU costs about 1.7× the CPU per
mesh, and its WebGL2 fallback (which Firefox Android and older devices would
get) about 2.6×. Batching matters far more than the backend, so machines are
drawn as `BatchedMesh`/`InstancedMesh` per material family. Without TSL,
custom shading (terrain triplanar, water) uses `onBeforeCompile` patches on
standard materials and `ShaderMaterial`. Revisit WebGPU when its per-draw
overhead drops.

## Benchmark 2: body count (M0)

`tools/bench/bodies.html`, run with `node tools/bench.cjs bodies` (the query
string goes in `Q=`, e.g. `Q='?shape=box&n=300'`). It pours nuggets into a
10 × 10 × 4 m trimesh pit, 40 per physics step from 5–8 m up, and steps the
Rapier worker until every body sleeps. "Step" is the worker's time per 60 Hz
step while bodies are moving.

| Nuggets | Shape | Asleep after | Step median | Step p95 | Escaped the pit | Step when all asleep |
|---|---|---|---|---|---|---|
| 2,000 | convex hull (8 pts) | 3.9 s | 15.1 ms | 33.9 ms | 12 | 0.48 ms |
| 2,000 | box | 3.1 s | 19.0 ms | 29.6 ms | 0 | 0.46 ms |
| 2,000 | ball | 8.7 s | 9.6 ms | 16.4 ms | 0 | 0.47 ms |
| 2,000, 4 per step | box | 10.4 s | 7.3 ms | 21.0 ms | 0 | 0.48 ms |
| 600 | box | 2.7 s | 2.0 ms | 8.2 ms | 0 | 0.15 ms |
| 300 | box | 2.2 s | 1.3 ms | 7.8 ms | 0 | 0.11 ms |
| 300 | convex hull | 3.3 s | 1.5 ms | 8.6 ms | 4 | 0.14 ms |

(Max step time is 80–110 ms in every run. That's the first step, when the WASM
JIT warms up, not a steady cost.)

**Result: partly a no-go as specified.** 2,000 nuggets do settle and sleep in
3–4 s, and 2,000 *sleeping* bodies cost under 0.5 ms a step. But while all
2,000 are awake at once, the step is 15–19 ms, about 3× the 6 ms budget. With
the brief's own cap of ≤ 300 awake bodies, the step stays around 1.3 ms
(p95 under 8 ms in software).

**Decisions:**
- **Nuggets are boxes, not convex hulls.** Boxes never escaped the pit, and
  hulls let 0.6% through when bodies spawned overlapping. The rendered nugget
  mesh stays lumpy; only the collider is a box.
- **Keep awake bodies ≤ 300** with the pile merge in section 4: more than
  60 items of one material and stage resting within 1 m become one Pile
  entity. A big dump (a bucket or a bin emptied) spawns its contents straight
  into a Pile instead of as hundreds of bodies.
- **No forced freeze.** The brief asks for a forced sleep after 1.5 s at rest.
  Calling `rb.sleep()` ourselves made about a third of the pile sink through
  the floor: a body frozen while its neighbours were still moving lost its
  contacts. Rapier's own sleeping put all 2,000 to sleep within 4 s, so we
  rely on that.
- **Kill floor.** Any body that falls below y = −60 m is frozen and reported to
  the main thread, which puts it back at the nearest claim post.
- CCD made no difference to escapes here and costs a little, so it's off for
  nuggets. It's on only for fast, thin things later (thrown tools, vehicles).

## Physics worker design (M0)

- The worker is started from a Blob URL (`src/js/core/workers.js`). In the
  build, esbuild bundles each worker into a string. In dev, the loader fetches
  the worker module and rewrites its imports: bare names through the page's
  import map (module workers can't read import maps), relative paths into
  Blob URLs of their own rewritten source.
- The main thread drives the clock. Each frame it sends one `step` message
  with the number of fixed 60 Hz steps owed, the player's movement intent and
  any ray/overlap queries. The reply carries the transforms of awake bodies
  (plus a final pose when a body falls asleep) as a transferable
  `Float32Array` of `[id, x, y, z, qx, qy, qz, qw, asleep]`. Only one step is
  in flight at a time, so the player sees at most one frame of latency.
- Request ids travel as `rq` and replies as `re`, so they never clash with
  entity ids (an early bug).

## M1: walk the valley

- **Valley terrain** is a static trimesh in 100 m tiles (2 m cells, about
  180k triangles), not a Rapier heightfield, because it needs holes: claim
  plots are replaced by voxel volumes in M2, and the adit mouth is cut out.
- **Shadows.** Cascaded shadows use three's `CSM` addon: 3 cascades at
  2,048² out to 240 m on High, and 2 at 1,024² out to 160 m on Medium. Low turns
  shadows off. CSM sets `onBeforeCompile` on each material, so our grain shader
  hook is chained after it. Each CSM rebuild bumps a `customProgramCacheKey`:
  without it, three reused a cached program whose uniforms CSM had just
  deleted, and threw when the graphics setting changed.
- **Moonlight.** Below the horizon the CSM light turns into a cool moon
  opposite the sun at 0.9 intensity, with a minimum elevation, so nights keep
  shape and shadows. The hemisphere light never goes below 0.9. The test
  checks that night and cave screenshots average over 30/255 luminance; they
  measure 48 and 45.
- **Jump.** The worker integrates velocity before position at 60 Hz, which
  lowers the apex of `v = √(2gh)` to 1.04 m. The launch speed adds `g·dt/2` to
  correct for that, giving 1.10 m.
- **Tests and slow frames.** In headless software GL a frame takes around
  100 ms, which made per-tick tests crawl. The test hook can switch drawing
  off (`noRender`) while it runs physics ticks.

## M2: dig and wash

### Benchmark 1: digging (trimesh vs voxel colliders)

Measured by `node tools/test.cjs <dir> --dig`: 240 spherical digs (0.45 m)
spiralling down into Willow Bend, about 4 per frame, with the normal limit of
at most 2 collider rebuilds per frame.

| Step | Median | p95 |
|---|---|---|
| Surface-nets remesh of one 32³ chunk (worker) | 3.2–4.9 ms | 5.2–7.9 ms |
| Trimesh collider rebuild of one chunk (physics worker) | 1.7–2.2 ms | 2.5–3.0 ms |
| Remesh queue length while digging hard | at most 4–8 chunks | |

We also measured Rapier voxel colliders on one full 32³ chunk (32,768 solid
voxels). They take 7–10 ms to create and then about 0.001–0.003 ms per
`setVoxel` edit.

**Decision: keep trimesh colliders.** A rebuild costs about 2 ms in the physics
worker and happens at most twice a frame, so it fits easily. The colliders
also match the smooth surface-nets mesh exactly, so nuggets and the player
rest on what they see. A voxel collider would make edits almost free, but it
would be blocky (0.5 m steps under smooth ground), and dropped items would
float or sink visibly. Revisit if bigger claims or the excavator push rebuilds
past budget.

### Other notes

- **Claim volumes.** Gravel Bar is 48 × 18 × 48 voxels (one 6 m band plus
  bedrock and air). Willow Bend is 64 × 52 × 64. A 1-voxel ring at the edge
  can never be dug, so pits always have walls. The valley terrain leaves a
  grid-aligned hole for each volume.
- **Colours.** The mesher writes band colours in linear space (sRGB to the
  power 2.2). An early version wrote sRGB values straight in, and the claims
  looked washed out next to the valley.
- **Panning reach.** The aim ray goes through the water and hits the river
  bed, so reach for washing is measured to the water surface instead.
- **Piles.** More than 60 resting nuggets of one material and stage within
  1 m of their centre merge into a Pile, checked once a second. E takes the
  heaviest piece back out. Dirt clods don't merge yet.
- **Item models** are our own designs:
  - **Shovel:** ash shaft with a D-grip and a riveted brass collar, and a
    dished round-point blade with a centre ridge and a worn edge.
  - **Pan:** spun steel with riffle rings.
  - **Bucket:** 14 wooden staves with two iron hoops and a bail.
  - **Pick:** a forged curved head with a leather grip.
  - **Nuggets:** subdivided, lobed, with darker crevices.
  - **Gems and quartz:** crystal clusters.
- **Test flakiness.** The hands' per-frame aim ray could overwrite a ray the
  test had just aimed. Tests now turn the automatic aim off while they drive
  the hands.

## M3: town and money

### Benchmark 3: truck feel on dug terrain

Run as part of `node tools/test.cjs <dir> --town`. Five fresh ruts are cut
across Willow Bend (0.5 m spherical digs, about 0.3 m deep) and 40 random
mounds are added. The Old Hauler then drives across at full throttle.

| Measure | Result |
|---|---|
| Crossed the claim | yes, reaching 10 m/s |
| Upward speed (launch check: > 3 m/s) | max 0.55 m/s, 0 launches |
| Chassis up-vector (1 = level) | min 0.99 |
| Max angular velocity | 1.2 rad/s |
| Physics step while driving | 0.4–0.8 ms |

**Result: go.** The ray-cast vehicle with ballast low in the frame,
anti-roll torque, speed-clamped steering and friction slip 2.6 drives
across freshly dug ground without jitter or launching.

**Tuning:**
- **Engine:** an earlier pass (5,600 N) stalled climbing out of 0.5 m deep
  trenches. 8,500 N with a 16 m/s cap climbs out of ruts.
- **Ground clearance:** the truck clears about 0.5 m, so a hole deeper than
  the wheel radius still stops it, as it would in real life.

### Other notes

- **Economy.** The economy (`sim/economy.js`) is plain data: Scrip,
  Standing, 3 market stalls and 3 contracts.
  - **Stalls** pay 105–130% of base, falling 1.5% per § 100 sold that day,
    with a floor at base. Demand resets each new day.
  - **Contracts** fill from any sale of matching goods in town. Each pays
    Scrip and Standing, and a new one replaces it.
  - **Tests:** unit tests cover the price curve, quartz being refused, the
    overnight reset and contract completion.
- **Selling is physical.** You place goods on a counter and ring the bell.
  Items inside the counter's box are weighed, paid for and removed. Anything
  the buyer doesn't want stays on the counter with a message.
- **Buying.** Purchases appear on a delivery pad beside the shop. Machines
  arrive as crates, because placing them comes in M4.
- **Claim ownership.** Digging only works in claims you own. Willow Bend's
  deed is § 900 at the Guild board.
- **Panning income.** In the test, panning from 4–5 m deep averaged
  § 12.9 per load, so § 1,000 took 50 loads. Hand-panning near the surface
  is closer to § 5 per load. Tune against the brief's 40–80 §/min in M6.
- **Truck cargo.**
  - Items dropped onto the bed become data on the vehicle: a local position,
    drawn as children of the chassis, with no colliders. Their weight goes on
    the chassis with `setAdditionalMass`.
  - E takes the nearest item back out of the bed.
  - The bed holds 2,000 kg or 60 items.
- **Fuel.** 960 s of driving (two sacks). A sack of charcoal costs § 15 at
  the Wagon Shed; LMB pours it into the hopper. Unflip is H held for 1 s.
  "Call my hauler" is at the Wagon Shed.
- **Saves.**
  - **Storage:** IndexedDB with stores meta, entities, chunks and economy,
    and keys like `slot:A` / `slot:B`. Each save goes to the older half of
    the pair in one transaction, with meta written last.
  - **Files:** export and import use a deflated `.rillsave` file.
  - **Loading** reloads the page and restores at boot, because rebuilding the
    world in place is error-prone.
  - **Autosave** runs every 3 minutes to the current slot.
  - **Test:** saving, reloading the page and loading again gives the same
    Scrip, items, crates, dug chunks, contracts and truck position.
- **Held tools.**
  - The shovel's blade outline was built pointing back up the handle. It's
    now flipped, and the shovel is held with its blade ahead and face up.
  - Every tool has its own pose in the hand, plus animations: dig, scoop,
    swing, wash swirl, pour, dump, tip, clink recoil, grab and equip, with a
    gentle sway while walking.

### Feedback fixes after M3

- **Truck stutter.** Driving looked like a low frame rate. The truck's pose
  jumped whenever a physics step landed, because 0, 1 or 2 steps can land in
  one screen frame. Vehicles now render one physics interval behind the
  newest state and interpolate between the last two (position lerp,
  rotation slerp), with a snap for teleports. No motion blur is used
  anywhere.
- **Shovel model.** The shovel is rebuilt on real round-point shovel
  anatomy, checked from six angles in `tools/bench/model.html`.
  - **Blade:** a parametric round-point blade, 0.25 × 0.34 m, with rounded
    shoulders and a tapered point. It's concave across and slightly dished
    along, with real thickness, a bright worn cutting edge and a darker back.
  - **Lift:** the blade is bent **up** about 14° toward its working face, as
    on a real shovel, so the blade lies flat while the shaft rises behind it.
    Two earlier versions had this backwards: first the dish curled toward
    the ground, then the lift tipped the blade down.
  - **Frog:** a tapered strap runs down the back of the blade from the socket.
  - **Socket:** a tapered steel tube that flattens into the blade, with
    rivets. Rolled footsteps sit on the shoulders.
  - **Handle:** an ash shaft with a brass ferrule and a D-grip (two cheeks
    and a crossbar).
  - **Load:** the dirt heap sits on the working face.
  - **In the hand:** the shovel is carried blade-forward with the tip up and
    the scoop facing the camera. The pose was solved numerically for blade
    direction and face normal, then checked in screenshots so it stays clear
    of the hint line and hotbar.
- **Truck bed.** E on the truck opens an inventory screen: take any item,
  put the held item in, or unload everything behind the tailgate.
- **Hotbar.** Two slots at the bottom of the screen show the hand and the
  quick-swap slot.
- **Gem Buyer.** A new shop takes uncut gems. The Assay Office takes
  everything else and points you to the right counter if you bring gems.
- **Signs.** Shop signs had their top half inside the roof eaves, and long
  names overflowed. Signs now sit between the awning and the eaves, and the
  font shrinks to fit. Chalkboard faces leaned the opposite way to their
  frames and cut through them; they now match the frame's lean. Sign
  materials use a polygon offset.
- **Benchmark 3** now uses seeded, gentler mounds so it gives the same
  result every run.

## M4: water and machines

- **Flow solver** (`sim/flow.js`). It's pure data, with unit tests.
  - Each connected network adds up its sources, then boosts intake flow by
    50% if a fuelled booster pump is on it. A header tank gives up to
    60 L/s while above 10% and fills from any surplus.
  - Satisfaction is `min(1, supply / demand)` and speed is
    `0.2 + 0.8 × satisfaction`.
  - A consumer can't draw more than the narrowest pipe on its best path from
    a source. This is a widest-path search, which handles loops directly, so
    the brief's even-split fallback for cycles was never needed.
  - Silt is 6 from the river, minus 3 per settling tank on the network.
    Each point above 4 wears drills and sluices by 1% a minute.
- **Pipes are runs, not grid pieces.** Hold a coil (bought by the metre),
  click one machine's water port, then another. The run is laid as a curved
  tube between the two ports and uses its length from the coil (straight
  distance × 1.1 + 0.3 m). A Pipe Junction joins up to four runs.
  - **Why:** fixed 1 m pieces on a grid never line up on dug, uneven ground,
    and laying them one at a time is tedious.
  - **Brief:** this keeps its sockets and snapping (runs snap to ports) and
    its "narrowest pipe on the path" rule.
- **Placement.** Holding a machine crate shows a ghost on a 0.5 m grid,
  translucent green when valid and magenta when blocked. R rotates in 90°
  steps. Aiming at the side of a machine places flush against that face.
  - **Validity:** a physics overlap query against items, machines and
    vehicles, plus each machine's rule: an intake's mouth must be in the
    river; a drill needs a claim you own.
  - **Mallet:** LMB locks a machine, RMB unlocks it. Unlocked machines can be
    picked back up with E and return to a crate with their state.
- **Item links.** A machine's "out" port feeds any "in" port within 1.3 m.
  For example, a drill's spout over a sluice's hopper sends loads straight
  in. Otherwise loads land as clods. A drill jams when 8 clods pile up under
  its spout.
- **Machines in M4:**
  - **River Intake Mk I:** 40 L/s, with a valve at 25/50/75/100%.
  - **Water parts:** Header Tank, Settling Tank, Booster Pump and Pipe
    Junction.
  - **Drill Mk I:** band 1, one load every 5 s at full speed. Its tip sits
    3.6 m down (2.6 m until the M6 pacing pass), and the depth there decides
    band and weight.
  - **Sluice Mk I:** a 10-load hopper, one roll every 4 s, with a bonus roll
    chance of 10% × satisfaction.
  - **Kiln:** 10 kg per 8 s, burns quartz at 1 kg a minute, holds 50 kg of
    one material. It rejects a second material without deleting it, and
    reheats cold ingots in 20 s.
  - **Crucible & Campfire:** 10 kg, half speed, no fuel.
  - **Workbench:** turns a hot ingot into a tool head, ring, chain or
    chalice. A cut gem in the swap slot gets set into rings and chalices.
  - **Grinding Wheel:** 3 clicks cut a gem, keeping 85% of its weight.
- **Repairs.** The Wrench takes 10% wear off per click, and the Repair Kit
  fully repairs a machine, 5 times. Worn machines slow by up to 60% and
  spark above 60% wear. A brass dial on each machine shows its wear.
- **Ingots** stay hot (glowing) for 90 s of game time. Cut gems and ingots
  have their own instanced meshes.

### Acceptance (`node tools/test.cjs <dir> --machines`)

- **Unattended run:** an intake → junction → drill + sluice line on the
  Gravel Bar ran 10 simulated minutes and washed 112 loads. Nothing was
  blocked or broken, and silt 6 wore the drill exactly 20%.
- **Half intake:** with wear held at zero, halving the intake valve gave
  0.656× throughput against the formula's 0.2 + 0.8 × 20/35 = 0.657×.
- **Crafting:** the kiln melted 4 kg of silver and refused gold without
  deleting it. A garnet was cut, then a hot ingot and the cut garnet became a
  silver ring worth § 130.

## M5: belts and logic

- **Belts are lanes in data** (`game/automation.js`).
  - **Lanes:** each belt piece has one or more lanes (local polylines).
    Items sit at a distance `s` along a lane and keep a 0.26 m gap.
  - **Speed:** a line moves at 0.6 + 1.0 × the satisfaction of its
    best-supplied Belt Drive. A drive is a belt piece with a water motor that
    needs 10 L/s. A line is the set of belts joined by out→in links.
  - **Leaving a belt:** when the front item reaches the end of a lane, it's
    handed to whatever the belt's out port links to (another belt, a hopper,
    a furnace, a bin). If that refuses it, the lane backs up and the belt
    reports "jammed". Items become rigid bodies only when they drop off an
    open end.
  - **Drawing:** items on belts are drawn with the same instanced meshes as
    loose items, positioned from lane data.
- **Belt pieces.** Straight, corner, incline (1 m rise over 2 m), splitter
  (alternates), merger (the left-hand side lane joins mid-belt), sorter
  (straight on for one chosen material and stage, right for everything
  else) and the Gem Cutter Hook (cuts uncut gems passing under it).
- **Containers.** Ore Bin (400 kg) and Storage Crate (40 items) are data
  lists. RMB lists their contents with "Take one" buttons.
- **Never deleting.** Every machine output either succeeds or waits:
  - a sluice holds finds it can't pass on and stalls;
  - a drill holds its load;
  - the smelter refuses mixed ore, which then waits on the belt.

  An M4 bug made blocked consumers drop their water demand, so they could
  never retry; that's fixed.
- **Shaft power is by proximity.** A Water Wheel (in the river: 20 L/s plus
  3 shaft units) or a Turbine (on a pipe network, 30 L/s, 3 units ×
  satisfaction) drives shaft machines within 8 m, shown with a drawn drive
  line. Speed is `min(1, units / machines driven)`. Shaft runs like pipe
  runs would be truer to the brief but add a lot of fiddly placement for
  little play value; this can be revisited.
- **Shaft machines.**
  - **Stamp Mill:** one ore clod becomes 3 gravel loads. The pick breaks
    ore clods out of band 2 and deeper.
  - **Trommel:** screened loads wash 25% faster in a sluice.
  - **Lift:** carries items up 3 m; E rides it when it's locked.
- **Smelter.** Belt-fed through two inputs. Holds 100 kg of one ore, melts
  10 kg per 4 s scaled by water satisfaction (it needs 30 L/s), and burns
  quartz. It pours only on a logic pulse or from its panel.
- **Logic.**
  - **Signals:** held numbers on Signal Cable, laid like pipe from an output
    terminal (right side) to an input (left side). They're evaluated at
    10 Hz, and each gate reads the previous tick's values, so every gate
    adds one tick of delay.
  - **Parts:** Button, Lever, Dial and Clock; AND, OR, NOT, Compare
    (>, <, = against input B or a set number), Add, Subtract, Latch, Pulse
    and Delay. Sensors are the Scale Plate (kg resting on it), Counter
    (items leaving the nearest belt), Wear Sensor and Fill Sensor. Outputs
    are Valve (closes the nearest intake or junction), Belt Gate, Pour
    Trigger, Lamp, Siren, Logic Charge (blasts a 2 m hole in an owned claim),
    Item Ejector and Display Panel.
  - **"Nearest":** sensors and outputs act on the nearest suitable machine
    within 2.6 m.
  - **Hover:** hovering a cable shows its live value.

### Acceptance (`node tools/test.cjs <dir> --belts`)

The line, all automatic for 15 simulated minutes:

1. Two intakes and two junctions supply the water.
2. The drill feeds the sluice, which washes onto a belt drive.
3. The sorter sends iron straight on into the smelter and everything else
   right, over two belts, into an ore bin.
4. Smelter ingots drop onto a scale plate.
5. Fill sensor > 10 kg AND scale plate < 500 kg → Pulse → Pour Trigger.

**Result:**
- 179 loads washed.
- The longest hold on any belt was 0 s.
- 4 automatic pours left 4 iron ingots (41 kg) on the plate.
- 154 non-iron items were binned, and no iron.

**Also tested:**
- Logic truth tables, pulse and delay.
- A belt feeding a full crate backs up without losing anything (2 in, 6
  waiting).
- A water wheel drives the stamp mill: 1 ore clod → 3 loads.
- The gem cutter hook cut 4/4 garnets, and the splitter sent 2 straight and
  2 right.

## M6: progression and world

- **Claims.** All six claims are voxel volumes (0.5 m voxels, 32³ chunks).
  Boot meshes about 66 chunks, most of them solid or empty, which adds well
  under a second.
  - **Hand-shaped plots.** These are carved deterministically at creation,
    so they aren't saved:
    - Old Cut is an oval pit 5 m deep, dug in two steps.
    - Slate Shelf steps down 5 m at a time toward the valley. Its lowest
      terrace is open at the +x end, and the hillside outside follows it
      down.
    - Glimmer Hollow is a 3 m bowl.
  - **Ember Seam.** It's a tunnel claim: solid rock from 3 m under the adit
    floor to 9 m above it, with a bedrock skin top and bottom. Its depth for
    band and weight is horizontal, `14 + 14 × (x − x0) / 42` m. It starts in
    slate (band 3) behind the door, reaches basalt (band 4) about 24 m in,
    and ends in a bedrock wall.
  - **The adit door.** It's a box collider that is removed while you own the
    deed.
- **Veins.**
  - **Shape and placement.** One sphere per claim, radius 3–6 m. Positions
    come from a fixed seed (`rillstone-veins`), so saves stay consistent.
  - **Materials** follow each claim's character and price: Gravel Bar
    silver, Willow Bend and Old Cut gold, Slate Shelf and Glimmer Hollow
    glimmerite (Glimmer Hollow's is fixed about 11 m down), and Ember Seam
    emberite. Glimmerite veins are kept below 6 m, because band 1 never
    drops it from machines.
  - **Rolls.** A dug load remembers the vein it came from, and a third of
    its rolls give the vein's material. Measured: 36.8% glimmerite against
    35% expected.
- **The relic.** It's buried 0.6 m under the Old Cut pit floor. Digging
  within about 1 m of it turns up the brass governor, which Pumphouse stage 2
  needs. It can't be sold.
- **Drill tips** were retuned for pacing:
  - Mk I is now 3.6 m (was 2.6). On the surface that's band 1 at about
    10 § a load, which gives the target 120–180 §/min with a sluice.
  - Mk II is 6.5 m, so it reaches the gravel bed from the surface.
  - Mk III is 9 m: stand it in a pit or on Slate Shelf's low terrace for
    slate.
  - Mk IV works only in the Ember Seam.
- **Blueprint ingots are scaled to a fifth of the brief's numbers.**
  - **Example:** the brief's 600 kg iron + 80 kg glimmerite for a Mk II
    sluice is 120 + 15 kg here.
  - **Why:** at the brief's numbers, the first Mk II needed about 1,500
    band-2 loads washed by hand just for the glimmerite, before any Mk II
    machine could exist.
  - **Standing gates:** Mk II ★ 4, Mk III ★ 12, Mk IV ★ 24.
  - **How fast standing comes:** contracts give their tier in standing, and
    the tier rises every 4 standing. So ★ 24 is about 11 contracts in.
- **Sluice Mk IV** isn't in the brief's table. Mk III washes band ≤ 3 and the
  Mk IV drill makes band-4 loads, so without it basalt could only be panned.
- **Market and contracts.**
  - **Upper Falls stall:** the fourth stall always wants something refined
    (ingots, cut gems or crafted goods).
  - **Millbrook stalls:** they add ingot wants from ★ 4.
  - **Contracts:** from tier 2 they ask for ingots, cut gems and named
    crafts.
- **Vehicles.**
  - **Trail Buggy and Survey Buggy:** 650–720 kg on soft springs.
  - **Excavator:** six hidden wheels under track skirts. It skid-steers by
    driving the yaw rate toward the input, and its engine is spread over all
    wheels.
  - **Ore Tram:** a kinematic "vehicle" with a static box collider (so aim,
    the bed panel and cargo work unchanged). It moves along its rail
    polyline at 4 m/s by script, and the collider comes off while it moves.
  - **Rails** sample the claim surface or the terrain every 2 m, and refuse
    grades over 1 in 4.
- **Excavator cuts** are axis-aligned 1 × 0.85 × 1 m boxes on the world's
  1 m grid (a new box brush), aimed 4.4 m ahead of the chassis. Each cut is
  one load, and the bucket digs up to slate.
- **Audio.**
  - **Machine loops:** small synth chains (noise bands plus an oscillator,
    with an LFO for rhythm) feed PannerNodes.
  - **Grouping:** same-type machines within 6 m share one voice, and the
    8 nearest clusters play. Worn machines add a grinding rasp.
  - **Ambience:** the river is a band-passed noise bed that fades with
    distance to the water, plus wind.
  - **New cues:** machine start-up, low-fuel sputter and contract complete.

### Pacing (`node tools/test.cjs <dir> --pacing`)

A drill and sluice of each tier run for 2 simulated minutes in their own claim and band, with the real machine code. The measured wash rate is priced at the expected Assay Office value of a load at the drill's band and depth (20,000 rolls), plus the bonus-roll chance. Rare finds make a 2-minute sample too noisy to compare tiers directly.

| | Measured | Target (BUILD_BRIEF 3.6) |
| --- | --- | --- |
| Hand washing, first 20 min (model below) | § 70.7/min; first § 1,000 at 15.9 min | 40–80 §/min; 15–20 min to the first machines |
| One Mk I drill + sluice (Gravel Bar, band 1, § 10.1 a load) | § 127/min | 120–180 §/min |
| One Mk II line (Willow Bend, band 2, § 24.8 a load) | § 396/min | — |
| One Mk III line (Slate Shelf low terrace, band 3, § 74.8 a load) | § 1,355/min | — |
| One Mk IV line (Ember Seam, band 4, § 156 a load) | § 3,343/min | — |
| Late base: 20 Mk I + 10 Mk II drills | § 390,000/h = 92× hand washing | "two orders of magnitude" |

- **Hand-washing model.** It uses the real loot code with the game's
  timings:
  - **Values:** each load is priced at its expected value at the pit's
    current depth.
  - **Per cycle:** scoop 2 loads (0.4 s each), walk 10 m each way at
    4.2 m/s, dip, wash twice (0.6 s each), tip out (0.5 s), and pick up each
    find (0.8 s).
  - **Overhead:** a 90 s selling trip every 5 minutes.
  - **Depth:** the pit deepens 0.017 m per load.
- **The brief's late-game numbers disagree.** "Tens of thousands per hour
  from 20–40 drills" contradicts its own Mk I target: one Mk I line at
  120–180 §/min is already 7–11k/h, so 20 of them make 150k–200k/h. The
  check therefore uses "two orders of magnitude over hand labour" (100×
  ±30%), which the same paragraph also states.

## M7: co-op

- **Transport.** The arcade realtime server (`rt.js`), with the room and
  presence pattern from throttle-ridge.
  - **Rooms:** the channel is `rill1-r-CODE`, where CODE is 5 characters
    from the arcade alphabet.
  - **Presence:** `{ id, n, t, h }`. The host is the member with `h: 1`, and
    a room holds at most 4.
  - **Loading:** the client library loads only when you open a room, so the
    offline single file still makes no outside requests.
  - **Accounts:** `rt.js` refuses channels without an Arcade account and asks
    the player to make one.
- **Authority.** The host runs everything.
  - **Each guest has a headless hands instance on the host:** its own
    hand and slot, a virtual camera at the guest's last pose, and toasts and
    sounds routed back to that guest.
  - **Running actions:** a guest action (use, pick up, drop at the ring they
    saw, swap, place a crate at their ghost, drive) is replayed through that
    instance after a ray from their camera. So digging, panning, selling at
    a bell, loading the bed and laying rails all run the same code as for
    the host.
  - **Panels open on the guest's own screen:** shops, the guild board,
    machine panels, the truck bed and the workbench menu. Their buttons send
    UI actions (`buy`, `claim`, `bp`, `build`, `mset`, `bedTake` and so on).
  - **Guests never tick the sim:** no machines, economy, day roll-over,
    trams or autosave. Items and vehicles are puppets (`items.remote`,
    `vehicles.remote`), with no physics bodies.
- **Snapshots** go out at 12 Hz:
  - players (pose, held items, vehicle);
  - moving bodies within 60 m of a guest (mm and 1e-4 quaternion
    precision), sent again only when they change;
  - vehicles (pose, wheels, fuel);
  - an op list: entity upserts and removals (found by a 5 Hz signature
    scan), terrain brush ops (deterministic replays), machines placed or
    removed, vehicles spawned or removed, cargo, rails, and gold toasts;
  - machine status diffs at 2 Hz;
  - the economy when it changes.
- **Late join.**
  - **Package:** the host sends the save format (`exportBlob`, fflate)
    as base64 in 16 KB chunks.
  - **Catch-up:** the guest buffers snapshots while loading, then replays
    those newer than the package's sequence number.
- **Prediction and interpolation.**
  - **Guests:** each guest's own character runs in their own physics worker
    against the same static colliders, and the host accepts plausible poses
    (under 40 m/s).
  - **Avatars:** drawn 120 ms behind.
  - **Vehicles:** reuse the M3 arrival-time interpolation.
- **Host leaves:** guests see "host left" and go back to the title. There is
  no host migration, as in the brief.

### Benchmark 5 (network)

| | Measured (local relay) |
| --- | --- |
| World package (403 items, 8 dug chunks, 15 machines) | 47 KB in 4 chunks, built in about 80 ms |
| Join, from Join to playing | 0.8 s |
| Steady state, 2 players idle | 27 messages/s, 6.5 KB/s through the relay |
| Largest message | 24 KB (the first snapshot after a join) |

- **The live server wasn't measured.**
  - **Why:** the arcade Worker accepts channels only from an Arcade account
    with a token, and this session has none (and shouldn't use the owner's
    daily allowance for load tests).
  - **What the test does instead:** it runs the real `rt.js` client
    (`tools/fixtures/rt.js`), pointed with `window.ARCADE_RT_URL` at
    `tools/relay.mjs`, which speaks the same protocol.
  - **Cloudflare's limit:** received WebSocket messages can be up to 32 MiB
    ([changelog, 2025-10-31](https://developers.cloudflare.com/changelog/post/2025-10-31-increased-websocket-message-size-limit/)),
    so 16 KB chunks and ~25 KB snapshots sit far inside it.
  - **If the arcade Worker turns out to cap message size or rate lower:**
    `CHUNK` in `net.js` and the snapshot rate are single constants. The
    brief's fallback (a Durable Object relay) isn't needed unless that
    happens, and creating one needs the owner's go-ahead.
- **Acceptance (`--coop`).** Two contexts:
  - both dig in the Gravel Bar, and the claim voxel hashes match;
  - the guest carries an ingot into the truck bed;
  - the host drives the truck, and both agree within 2 mm;
  - the guest sells the ingot and buys a bucket, and Scrip is identical on
    both;
  - 400+ loose bodies near the guest agree within 1 mm;
  - the host leaving ends the guest's session.

## M8: polish

### Performance (BUILD_BRIEF 8)

Measured in headless Chromium with software GL (SwiftShader), at medium graphics (2 shadow cascades):

| Scene | Main-pass draw calls | All draw calls (with shadow passes) | Triangles | Physics step | Sim tick |
| --- | --- | --- | --- | --- | --- |
| Spawn | 73 | 352 | 0.88 M | 0.3–0.6 ms | — |
| Millbrook | 60 | 337 | 0.83 M | 0.2–0.6 ms | — |
| Busy base: 100 machines, 150 clods, 300 nuggets | 120 | 396 | 1.18 M | 0.5–0.9 ms | 0.1 ms (100 machines) |

- **What changed for M8:**
  - **Town meshes:** the static town meshes (buildings, counters, stalls,
    the bridge) are baked into one mesh at boot, which took spawn from 505
    to 349 calls.
  - **Machine bodies:** they share one `BatchedMesh`, with one geometry per
    machine type. Logic parts keep their own mesh.
  - **Dirt clods:** they're instanced per band, like nuggets.
  - **Instanced meshes:** they now draw only up to their highest used slot.
    Before, every material drew all 2,048 slots, and the zero-scale empty
    ones still cost vertices: 3.5 M triangles in the busy base, down to
    1.18 M.
  - **The busy base overall:** 1,456 draw calls before, 396 now.
- **Against the budgets:**
  - **Main pass:** well under 300.
  - **With shadows:** the cascaded shadow passes add about 280 calls.
    Graphics: Low and the shadow settings trade that away.
  - **Physics and sim:** both far inside their budgets (6 ms and 2 ms).
- **Debug overlay (F3):** it also shows co-op role, player count and net
  messages per second.

### Onboarding and accessibility

- **Guide (B).**
  - **Guided contracts:** eleven first-hour steps, each paying a little
    Scrip: scoop, wash, pick up, sell, load the truck, a better shovel, a
    contract, the starter kit, set up a line, bring the water, Willow Bend.
  - **The card:** the current step shows top-left. The guide panel lists
    every step plus short reference notes, and can hide the card.
  - **Saving and co-op:** progress lives in the economy flags, so it saves
    and is shared in co-op. Guests show the host's progress.
- **Map (M).** A top-down valley map with your claims, the places, the road,
  vehicles, other players and you.
- **Colour-blind-safe shapes.** Each metal has its own nugget and ingot
  shape, and a glyph on its tooltip:

  | Metal | Nugget | Ingot | Glyph |
  | --- | --- | --- | --- |
  | Copper | lobed lump | rounded loaf | ● |
  | Iron | angular block | plain bar | ■ |
  | Silver | flat flake | hexagonal bar | ⬢ |
  | Gold | smooth pebble | classic trapezoid | ▲ |
  | Glimmerite | crystal cluster | — | ✦ |
  | Emberite | spiky shards | — | ✸ |
- **Settings.**
  - **Already there:** key rebinding (keyboard and mouse, with reset),
    captions for every sound cue, field of view, sensitivity, invert look,
    sprint toggle, head-bob, graphics, and volume buses.
  - **New:** "Clear loose clods and piles" (BUILD_BRIEF 9).

### Review fixes (a second read of the M6–M8 code)

- **Co-op:**
  - **Teleports:** the host now follows a guest's teleport, whether it sent
    the teleport or the guest's own rescue or "Return to claim post" did.
    Before, the guest's position froze on the host.
  - **Driving:** getting out goes through the host, so the driver seat is
    freed.
  - **Excavator:** a guest's digs and dumps are sent to the host. Before,
    they ran only on the guest's own copy.
  - **Aiming:** guests aim at items and vehicles through their meshes
    (guests have no bodies), so hover cards, E on a truck and dropping into
    a bed work for them.
  - **Rails and pipes:** the first click of a rail line or pipe run is kept
    per player (pipe runs on the coil itself). Before, two players shared one
    start point.
  - **Joining:** a guest can no longer load the world package twice at once.
  - **Saving:** a guest's manual save no longer overwrites their own slot
    with the host's world.
  - **Trams:** a guest's trams no longer leave stale colliders.
  - **Messages:** toasts from a guest's actions reach that guest, not the
    host, and everyone sees the end screen.
- **Rails:** extending a line at its start keeps trams on it in place.
- **Pumphouse:** it takes only what a stage still needs from an ingot and
  returns the rest, like the Machine Shop.
- **Selling vehicles:** a vehicle can't be sold with loads in its hopper,
  and selling goes through one function (no local refund on guests).
- **Truck bed:** bed actions on a bad vehicle no longer throw.
- **Instanced items:** a full instanced mesh falls back to a mesh of its own
  instead of hiding the item.
- **Title screen:** the co-op panel opened from the title no longer sits
  behind the title card.
- **Pan (playtest).**
  - **The problem:** a new player holds a shovel with the pan in the swap
    slot. With both slots taken by tools, E on a find said "Hands full", and
    the pan had to be tipped out after every 2 loads.
  - **Now:** the pan carries up to 20 finds while you keep scooping and
    washing. E on a loose find drops it into your pan, held or in the swap
    slot. LMB tips the finds out on dry ground or a counter, or straight into
    a truck bed as cargo.
- **Guide.** Its payouts no longer count as "Scrip earned". Before, the
  "sell" step completed itself as soon as an earlier step paid out.

### Controls review (brief §5)

- **Gaps closed:** a review of §5 found five missing controls:
  - Ctrl reversing rotation;
  - scroll wheel for placement distance;
  - hold-G precision placement;
  - B as a look-up for the hovered item;
  - the gamepad's hold and D-pad mappings.
- **G:** now drops on release. While it's held, R/T/Y turn the item in 45°
  steps on each axis and the wheel sets the ring's reach (1.5–6 m, default
  3.5). Guests send the turn with the drop and the host applies it.
- **Gamepad:**
  - tap X to pick up, hold it to drop;
  - tap Y to swap tools, hold it to enter or leave a vehicle;
  - tap Start for the map, hold it to pause (350 ms threshold);
  - the D-pad rotates (down and left reverse), and the bumpers set reach.
- **B:** the look-up uses the shop catalogue's description of the hovered
  item or machine, plus a note on what to do with the metal or gem.
- **Saves:** they are now version 2. Version 1 saves migrate on load and on
  import: rails, vehicle hoppers and trams, and economy flags get their
  defaults.
- **Ctrl:** it is no longer a second crouch key. Chrome closes the tab on
  Ctrl+W even during Pointer Lock, so crouch-walking with Ctrl could lose
  the game. Ctrl now only reverses rotation; crouch is C.
- **Co-op rejoin:** a guest who leaves and rejoins under the same name gets
  back the pan and shovel they dropped, if those are still lying loose. They
  used to get a new pair every time.
- **Guest rail hint:** guests track the first click of a rail line
  themselves, so the hint reads "lay rails to here" after the first click.
  The host still keeps the real start point.

### Second review pass (save, economy, workshop, bed, heavy, town)

A read-only review found ten issues, all now fixed:

1. **Guest items lost in host saves.** Things a co-op guest was holding were
   saved as "held", with no hand to hold them, and vanished after a load.
   That included the brass governor, which made Pumphouse stage 2
   impossible. A load now sets any unclaimed held item down by the player.
2. **Day contracts.** A "Sell § X in one day" contract that appeared mid-day
   counted that day's earlier sales and finished on the next sale. It now
   counts only sales made after it appears.
3. **Joining with a dug world.** A guest who had dug in their own world
   before joining kept those holes. Joining now resets the guest's dug
   chunks to fresh ground before the host's chunks are written.
4. **Tram bed.** The "Put in bed" layout ran off the tram's small bed after
   12 items. The grid now fits each bed, and items stack once the floor is
   full.
5. **Double sell.** Two quick clicks on Sell could pay for a vehicle twice
   while the physics worker removed it. A vehicle is now marked as selling
   on the first click.
6. **Repeating rolls.** The loot, market and machine generators restarted
   from the seed on every load, so the same rolls came up each time. A load
   now reseeds them from the seed, day and play time.
7. **Scrip earned.** Contract rewards now count towards it; guide payouts
   still don't.
8. **Starter hauler.** It was free, but the Wagon Shed paid § 250 for it.
   It now sells for nothing.
9. **Loading.** If the newest half of a slot's A/B pair won't read, the
   older half loads instead. A save from a newer version is refused with a
   clear message.
10. **Piles on counters.** A load tipped onto a counter could merge into a
    pile, which counters ignore ("Counter is empty"). Piles no longer form
    on shop, cutter or Pumphouse counters.
- **HUD:** toasts used to draw behind the guide card, which sits in the
  same top-left corner. The card and the toasts now share one column, with
  toasts underneath.

### Third review pass (machines, belts, hands, vehicles, input)

1. **Picking up a belt.** It dropped its riders but kept their lane
   entries, and the crate shared that state by reference. Re-placing the
   belt pulled those items back onto it from wherever they were, a hand, a
   pan or a truck bed included. Lanes are now emptied on removal, and the
   crate keeps its own copy of the state. A co-op join also clears old
   lanes before removing the guest's belts, because their item ids may now
   name the host's items.
2. **Blocked pours.** A pour or reheat whose out port refused the ingot (a
   full belt or bin) deleted it. A refused pour now stays molten, and a
   refused reheat waits inside.
3. **Drill flicker.** A drill on rock too hard to dig switched between "too
   hard" and "no water" every tick, so it took water and wore on alternate
   ticks. Its blocking status now holds.
4. **Shaft machines.** A stamp mill, trommel or lift that was switched off
   kept working. It now stops.
5. **Machine clock.** It is now saved. Button holds, delays and sirens keep
   their times on it, and those broke after a load.
6. **Drill to sluice.** A drill linked straight into a sluice's hopper now
   respects the sluice's band limit.
7. **Unplugged gamepad.** It no longer leaves its last stick and button
   input held down.
8. **Truck bed reach.** The hint, the drop ring and loading a bed now use
   the same reach. Guests send their reach with the drop.
9. **Precision drop.**
   - R/T/Y and the wheel act only while G is held.
   - The turn resets after each drop and never applies to crates.
   - Opening a panel or losing pointer lock ends precision mode.
10. **Small fixes.**
    - The craft menu checks again that the ingot is still in hand and hot.
    - "Take one" from a bin in co-op takes the item the guest saw, even if
      the bin shifted.
    - The tram's hover card no longer says "Fuel NaN%".

### Fourth review pass (menus, saves, networking, frame loop)

1. **Title card stuck after Settings.** Settings opened from the title
   remembered the title as "back", and `play()` closed Settings with the
   same call, which showed the title again over the game. Leaving for play
   now hides Settings without restoring anything.
2. **Stuck after closing a panel from the pause menu.** Closing Save game,
   Load game or Co-op opened from pause showed nothing. There was no way
   back without a reload. Panels now remember the card they replaced and
   restore it on close.
3. **Panels under the menus.** A panel could open beneath the title or
   pause card. The panel screen now sits above them (z-index), and opening
   it hides the cards.
4. **New game overwrote slot 1.** Autosave went to slot 1 even when it held
   another game. New game now autosaves to the first empty slot. With all
   three full, autosave is off until the player picks a slot with Save
   game.
5. **Stalled join.** A world package that stalls (a lost chunk) is asked
   for again after 10 s. After six tries the guest gets a message instead
   of waiting forever.
6. **Full rooms.** Members are now ordered by when each client first saw
   them, not by the join time they report, which depends on their clocks.
   A newcomer to a full room is turned away instead of bumping a player.
   A failed or timed-out join leaves the channel. A member can no longer
   set the sender id (`f`) and pass as the host, and guests accept world
   packages and private messages only from the host.
7. **Items near a driving guest.** These kept updating only within 60 m of
   where the guest got in. The host now uses the vehicle's position for a
   guest who is driving.
8. **Vehicle lock.** A guest asking to drive a second vehicle before the
   first was confirmed could leave the first locked for the session. A
   guest now drives one vehicle at a time.
9. **Guest input checked on the host.**
   - Camera poses, drop rings, placement positions and the guest's own
     position must be finite numbers of the right size. Reach isn't
     checked: the host's view of a guest lags their teleports, and a reach
     check refused honest actions in the co-op test.
   - Machine settings are clamped or refused, for example a NaN throttle
     that would have poisoned the water network.
   - Guest placements get the host's overlap check.
10. **Frame loop.**
    - An exception in a frame is logged and the next frame still runs.
      Before, one exception stopped the game.
    - A host whose tab is hidden keeps the world running on a 50 ms timer
      while guests are connected, without rendering, so guests don't
      freeze.

### Fifth review pass (items, guide, audio, data and economy)

1. **Relic lost to a charge.** A logic charge could blast the ground
   around the buried governor without turning it up. After that no dig
   could get near enough, and Pumphouse stage 2 was blocked. Charges now
   run the relic check. As a backstop, the relic turns up whenever the
   ground around it is open to the air, whatever removed it.
2. **Engine sound pulsing.** Voices were keyed by a 6 m grid cell, so a
   moving engine restarted its sound every 6 m, and two machine clusters
   could share one voice. Voices are now keyed by the cluster's first
   source: a machine id, or "engine".
3. **Guide "Set up a line".** It looked only at the first drill. It now
   completes when any drill is linked.
4. **Ghost items.** An item drawn by a fallback mesh (its instanced mesh
   was full) took a freed instance slot and left the old mesh behind. It
   now keeps its own mesh.
5. **Guide "Load the truck".** It completed at once if you had driven
   during an earlier step. Now only a drive during that step counts.
6. **Look-up entries.** B on a Steel or Glimmer shovel, a steel pipe coil
   or a Steel Pick showed the plain item's entry. Entries now match on
   tier and capacity, Machine Shop blueprints included. The starter
   shovel has its own note.
7. **Pile value.** The tooltip priced a pile of uncut gems at the cut
   rate. It now sums each piece's real value.
8. **Piles losing details.** Piles keep only material, stage and weight,
   so hot ingots and half-ground gems no longer merge into them.
9. **Craft contracts.** A chalice made from a 0.05 kg scrap ingot paid a
   full contract. Crafted goods for contracts must now weigh 1 kg or more,
   and the contract text says so.

### Brief gap pass (an audit of BUILD_BRIEF against the code)

An audit listed requirements that were missing or only partly done. Closed
so far:

- **Smelter (§3.5):** it now pours by itself once full ("ingot when full or
  on a pulse"). Its panel can switch it to wait for a pulse.
- **River silt (§3.4):** silt is now 0–10 along the river: 2 off the falls,
  6 by the Gravel Bar (so the tuned wear numbers hold there), and muddier
  downstream of Millbrook. A network's silt is the flow-weighted mean of
  its intakes.
- **Debug overlay (§8):** it shows network kB/s next to msg/s.
- **Save list (§9):** each slot shows a small JPEG thumbnail of the view at
  save time.
- **Locked machines (§6):** their hover card shows a brass rivet.
- **Production contracts (§3.6):** from tier 2, "Smelt N kg of copper"
  counts metal poured from a kiln or smelter. It pays less than delivery
  contracts, because you keep the ingots.
- **Beds (§4):**
  - a Bedroll (§80) sleeps from 19:00 to 06:00;
  - in co-op each player's "in bed" lasts 20 s, and the night is skipped
    once everyone is in one.
- **Scrapping (§3.3):** crates and tools on the Machine Shop counter come
  back as scrap iron worth 30% of their price, or 30% of the ingots for
  blueprint builds.
- **Saw Bench (§3.5, §160):** splits an ingot or gem by a set weight (0.25
  to 10 kg). You keep the cut piece and the rest lands on the bench.
- **Shop items (§3.6):**
  - a Hand Scale (§60) weighs and values a find, pile, bin or truck bed;
  - a Brass Lantern (§30) is set down to light an area, and the nearest 4
    lanterns get pooled point lights after dusk (§3.1);
  - the worn lantern (L) stays free.
- **Charcoal (§3.7):** Firewood (§6) put in a lit kiln chars into a sack
  in 40 s.
- **Assay Office and gems (§3.6):** the Assay Office still sends gems to
  the Gem Buyer. That was the player's own request during development:
  "make it so uncut gems has its own store and the other store takes
  everything else".
