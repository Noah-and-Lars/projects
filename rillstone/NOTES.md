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
