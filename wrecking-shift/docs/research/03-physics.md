# 03 — Teardown: Physics and Destruction Systems (technical research)

Scope: how Teardown (Tuxedo Labs; engine and physics by Dennis Gustafsson) simulates rigid voxel bodies, destruction, connectivity, fire, water, joints, vehicles, debris, threading, and multiplayer determinism. Compiled 2026-11-24.

**Source-confidence key**
- **[DEV]**: Dennis Gustafsson's own words (blog, tweets, podcast transcript, interviews), or another Tuxedo Labs staff member.
- **[DOC]**: Official modding API docs (v2.2.0) or the official changelog. These describe engine behaviour indirectly, through the scripting surface.
- **[COMM]**: Community, mod authors, wikis or press paraphrase. Treat as indicative only.
- **UNCONFIRMED**: No primary source found. It may be a plausible inference, but it is not verified.

Primary documents used:
- Official Lua API, v2.2.0: https://teardowngame.com/modding/api.html
- Modding guide, including the materials table: https://teardowngame.com/modding/
- Official changelog: https://teardowngame.com/changelog/
- Software Engineering Daily podcast transcript (Dec 2024): https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt
- Voxagon blog (blog.tuxedolabs.com now redirects to blog.voxagon.se): https://blog.voxagon.se/
- "The unlikely story of Teardown Multiplayer" (2026-03-13): https://blog.voxagon.se/2026/03/13/teardown-multiplayer.html

---

## 0. Headline facts (TL;DR)

| Topic | Fact | Confidence |
|---|---|---|
| Voxel size | 1 voxel = 10 cm. `GetShapeSize` returns a scale of 0.1 m by default. | [DEV] SED transcript; [DOC] |
| World makeup | "Thousands of individual voxel volumes, each with anything from a couple of hundred up to millions of voxels". Large levels have about half a billion voxels. | [DEV] quicksave post |
| Voxel storage | Dense, uncompressed regular 3D grid per shape, with an 8-bit palette index per voxel. | [DEV] 2024 year summary |
| Physics representation | "a separate physics representation, which is also voxel data", regenerated at load time. | [DEV] quicksave post |
| Collision | Voxel-vs-voxel on the CPU. | [DEV] via Game Developer paraphrase |
| Solver | Projected Gauss-Seidel, the sequential-impulse method, with **8 iterations**. | [DEV] tweet, 2022-04-22 |
| Fixed step | Script `update()` runs at a fixed 1/60 s, at most twice per frame. `tick()` is variable and capped at 1/30 s. | [DOC] |
| Gravity | Default (0, −10, 0). | [DOC] `SetGravity` |
| Sleeping | Bodies that stop moving are "taken out of the simulation". The body tag `awake` makes a body start simulated. | [DOC] |
| Structural integrity | None. Only connectivity is tracked, so a building can stand on one voxel. This was a deliberate design choice. | [DEV] |
| Disconnection detection | Early Access had a search-distance limit. A new algorithm (Feb 2021) handles "unlimited search distance" and is "an order of magnitude faster". Changelog 0.7.0: "Large disconnected chunks now fall properly". | [DEV], [DOC] |
| Material tiers | Soft, medium, hard, unbreakable. `MakeHole(pos, rSoft, rMedium, rHard)`. | [DOC] |
| Explosions | `Explosion(pos, size)` with size from 0.5 to 4.0. | [DOC] |
| Fire | Per-voxel heat. At a "critical value" a voxel is destroyed and "can ignite the surrounding voxels". Registry keys `game.fire.maxcount` and `game.fire.spread`. | [DOC] |
| Threading | Data-parallel engine with SIMD and multithreading. The physics engine "is multithreaded already" (Jan 2023). | [DEV] |
| Multiplayer | Host acts as server, with up to 12 players. Destruction is a deterministic command stream rewritten in fixed-point integer maths. Physics uses unreliable state sync with per-client priority queues, at about 1 Mbit/s per client. | [DEV] |

---

## 1. Background: why this engine looks the way it does

- Gustafsson wrote his first rigid-body simulator in 1998, "inspired by the papers on impulse based dynamics by Brian Mirtich". His university project became **Meqon Research**, a physics SDK. 3D Realms licensed it for Duke Nukem Forever. In 2005 AGEIA acquired Meqon and "the whole team was integrated into the PhysX machinery". He was one of three software architects there and left in 2007, before the NVIDIA acquisition ([DEV] https://blog.voxagon.se/2021/02/22/background.html).
- At Mediocre he made Sprinkle, Granny Smith and Smash Hit. Smash Hit's destruction gives a useful precedent ([DEV] https://blog.voxagon.se/2014/05/13/cracking-destruction.html):
  - Breakage was "objects always break where they get hit", triggered when the contact impulse passed a threshold.
  - The broken region was carved with randomized planes into convex pieces.
  - Breakage ran **inside the solver loop**: contact impulses were capped, and when the cap was hit the object broke and the contacts were re-solved, up to 3 solves per step.
  - Connectivity used a "stateless" pass that merged IDs of nearby shapes.
  - Teardown generalizes the same pragmatic attitude to voxels. Whether impulse-capped in-solver breakage carried over to Teardown is UNCONFIRMED.
- His 2010 description of his solver ([DEV] https://blog.voxagon.se/2010/08/01/explaining-rigid-body-solver.html):
  - Contacts are solved one at a time and the solver iterates several times.
  - Impulses are accumulated.
  - Friction is clamped to μ times the normal impulse.
  - Penetration is fixed at the velocity level by giving a slightly positive target separating velocity (a Baumgarte-like bias) rather than a separate position pass.
  - This is the "projected Gauss-Seidel / sequential impulse" family that Teardown uses (see §4).
- Why voxels ([DEV] SED transcript): polygon destruction has "a lot of gnarly cases with degenerate triangles and floating-point precision issues and none of that really exists with voxels. Everything is nicely aligned on the grid. It's all integer math." The voxel scale (10 cm) came from the MagicaVoxel look.

---

## 2. Scene representation (what the physics operates on)

**Hierarchy**
- Scene → **bodies** (rigid, static or dynamic) → **shapes** (voxel volumes, each with a local transform inside its body) → voxels (palette indices).
- A shape "is always owned by a body, but can be transferred to a new body during destruction" ([DOC] `GetShapeBody`).
- There is an implicit static **world body** that "contains all shapes that are not explicitly assigned a body" ([DOC] `GetWorldBody`).
- Static bodies can become dynamic through destruction: "something that was created static may become dynamic due to destruction" ([DOC] `IsBodyDynamic`). This is how chunks cut off a static building start to fall.
- `GetBodyMass` returns zero for static bodies ([DOC]).

**Per-shape grids**
- "Instead of one big volume of billions of voxels, I have thousands of smaller volumes… Everything is straight within its own volume, but I have a lot of them instead" ([DEV] https://www.gamedeveloper.com/design/how-beautiful-voxels-laid-the-way-for-i-teardown-s-i-heist-y-framework).
- Each shape is an arbitrarily oriented box (OBB) containing an axis-aligned grid. Collision is therefore between **unaligned grids**.

**Dense storage**
- "Teardown uses a dense voxel format, where every shape stores voxel data in an uncompressed, regular 3D grid" ([DEV] https://blog.voxagon.se/2024/12/29/year-summary.html).
- The successor engine moves to sparse 8×8×8 chunks.

**Size limits**
- MagicaVoxel objects can be at most 256³ voxels. The docs recommend about 128³ or flat slabs such as 256×256×10, because big objects "might cause stutters" ([DOC] modding page).
- The world was limited to about 4,000 voxels across because of a 3D-texture limit in OpenGL ([DEV] SED). The Frustrum chase level was capped at 400 m for the same reason on AMD hardware ([DEV] https://blog.voxagon.se/2020/11/05/teardown-design-notes.html).

**Separate physics voxel data**
- "The voxel objects, for instance, has a separate physics representation, which is also voxel data… 100% reproducible from the main voxel data, so instead of saving it, it's generated at load time. The same goes for spatial acceleration structures for physics, culling, rendering and lighting" ([DEV] https://blog.voxagon.se/2020/11/18/teardown-quicksave.html).
- What exactly differs is UNCONFIRMED. It could be surface-only voxels, solid/empty bits, or per-voxel normals.

**Rendering shadow copy**
- The CPU maintains a world-space **1 bit per voxel** occlusion bitmap of "hundreds of millions of voxels", updated in the background as bodies move ([DEV] SED).
- A frame analysis found a 1252×128×1252 texture packing 2×2×2 voxels per byte, with 3 mip levels (https://juandiegomontoya.github.io/teardown_breakdown.html; also https://acko.net/blog/teardown-frame-teardown/).
- This structure serves lighting. It is not confirmed to be used by physics.

**Voxel connectivity rule**
- Voxels only "stick" together through **faces**. "Voxels touching only through their edges or corners will not stay together… [they] will fall apart the moment they are damaged or otherwise become dynamic" ([DOC] modding page, "Voxel Connectivity").
- Connectivity is therefore 6-neighbourhood.

**Non-physical voxels**
- `GetShapeMaterialAtPosition(..., includeUnphysical)` shows that some voxels are "unphysical" and have no collision ([DOC]; parameter added in 1.6.3).
- Which palette entries are unphysical is UNCONFIRMED.

**Materials via palette**
- The palette index sets the material ("the color at index 9 is always grass").
- The material types exposed to scripts include strings such as `"masonry"` ([DOC] voxscript `CreateMaterial(type, r,g,b,...)`, https://teardowngame.com/modding/voxscript.html).
- Shapes also carry `density` and `strength` properties ([DOC] `GetProperty`/`SetProperty`).

**Save state**
- Quicksave stores, per body, the transform, linear and angular velocity, the dynamic flag and the active flag.
- Saves are RLE-compressed to 15–20%. Large levels are about 80 MB; shipped mission snapshots are zlib-compressed to about 20 MB ([DEV] quicksave post).

---

## 3. Time stepping and integration

**Callbacks** ([DOC] api.html, "Teardown scripting"):
- `update(dt)` is "called at a fixed update rate, but at the most two times per frame. Time step is always 0.0166667 (60 updates per second). Depending on frame rate it might not be called at all for a particular frame."
- `postUpdate()` runs "like update, but after physics".
- `tick(dt)` runs once per frame with a variable dt between 0 and 0.0333.
- The physics step therefore almost certainly runs at **60 Hz fixed** with at most 2 substeps per rendered frame. Below 30 fps the simulation slows down instead of spiralling. The coupling of physics to `update` is inferred from the API wording: "Because update can trigger physics updates…" and "ConstrainVelocity… should only be used from the update callback".
- That physics itself is exactly 60 Hz is strongly implied but not stated outright (**UNCONFIRMED**, high likelihood).

**Render interpolation**
- `SetTimeScale` (range 0–2): "v1.4 and below: this function will affect physics behavior… Starting from v1.5 this function does not affect physics behavior and rely on rendering interpolation" ([DOC]).
- Bodies are therefore rendered interpolated between fixed steps.
- `AttachCameraTo` was added (1.5.3) because in `tick` "coordinates of bodies and shapes are accessed before being updated by physics" ([DOC] changelog).

**Gravity**: default (0, −10, 0) m/s², settable with `SetGravity` (1.7). Per-body `SetBodyGravityScale` is also available ([DOC]).

**Script tick rate**: the slowest common denominator is the Lua update at 60 Hz. The successor engine uses sub-stepping instead of iterations (§4).

---

## 4. Rigid-body solver

**Teardown's solver**
- "Teardown uses projected Gauss-Seidel iteration, sometimes referred to as the sequential impulse method with eight iterations" ([DEV] tweet 2022-04-22, https://x.com/voxagonlabs/status/1517437461575700480).
- This tweet is part of the thread explaining that campaign names are homages to algorithm authors. The "Gauss-Seidel and Jacobi" characters are named after the solver methods.
- The same thread honours Erin Catto (Box2D) and Dirk Gregorius (Rubikon) as "Erin Gregorius", Erwin Coumans (Bullet) as "Enid Coumans", Oliver Strunk (Havok/Ipion) as "Oliver Funke", and Casey Muratori for immediate-mode GUI and his "geometric interpretation of GJK" (https://twitter.com/voxagonlabs/status/1517437453761658880).
- Whether Teardown uses GJK for anything is **UNCONFIRMED**.

**Constraint API mirrors the solver's velocity-level formulation** ([DOC]):
- `ConstrainVelocity(bodyA, bodyB, point, dir, relVel, [min], [max])`: "tell the physics solver to constrain the velocity between two bodies… while not applying an impulse bigger than the min and max values."
- `ConstrainAngularVelocity`, `ConstrainPosition` (implemented on top of ConstrainVelocity with maxVel and maxImpulse) and `ConstrainOrientation`.
- These are added as one-frame rows in the solver, which only makes sense for an impulse-based PGS solver with clamped accumulated impulses.

**Friction and restitution**
- Per-body `friction` and `restitution` properties.
- `frictionMode` and `restitutionMode` choose how two values are combined: average, minimum, multiply or maximum ([DOC] `GetProperty`).
- Player body friction defaults to 0.8 ([DOC] `SetPlayerParam`).

**Collision filtering**
- `SetShapeCollisionFilter(shape, layer, mask)` uses 8-bit layer and mask values.
- "The layer of one object must be in the mask of the other object and vice versa." The default is layer 1, mask 255 ([DOC]).
- Joints have a `collide` property that controls whether the jointed shapes collide ([DOC] modding page property screenshot).

**Warm starting and contact caching**: **UNCONFIRMED** for Teardown. His 2010 post describes accumulated impulses but not warm starting.

**Successor engine** (not Teardown, but the direction he moved in):
- Sub-stepping instead of iterations ("Temporal Gauss-Seidel"), following Catto's Solver2D/Box2D v3 work ([DEV] year summary; [COMM] https://80.lv/articles/see-what-s-new-in-teardown-creator-s-custom-voxel-physics-engine).
- A parallel solver for large piles, with "improvements… to contact generation and the broad phase".
- Graph colouring with deterministic order: "Now large piles can be solved on multiple threads in deterministic order. It really helps with stability" ([DEV] tweet 2025-01-21, https://x.com/voxagonlabs/status/1881703759748935933).
- About 5 ms per step for the demo scene on an i9 using 32 threads ([COMM] 80.lv).

**BSC 2025 talk "Parallelizing the physics solver"** (https://www.youtube.com/watch?v=Kvsvd67XUKw):
- According to a third-party commentary, it covers multithreading the **Windows PC Teardown** physics solver, profiled on an i9-14900F (https://felixk15.github.io/posts/comment_on_parallelizing_the_physics_solver/).
- Reported details: a job system with "active processor count minus one" workers; the first version had a mutex-guarded queue that left gaps between jobs; it was replaced by a lockless queue with the "main thread sleep[ing] on atomic spinlock"; jobs last "a handful of microseconds"; the worker count was reduced to 8.
- An AI-generated summary claims a 3.8× to 9.1× speedup. That figure is **UNCONFIRMED**.

---

## 5. Collision detection and contact generation

**Confirmed**
- Collision is voxel-against-voxel on the CPU. Rendering is on the GPU ([DEV] paraphrased in the Game Developer interview above).
- "When I first started rewriting the collision detection to work with voxels, I thought it would be awfully slow, but it actually wasn't so bad" ([DEV] https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech).
- "A lot of physics actually turn out much nicer with voxels… collision detection… That was something I thought would be really tough, but actually turned out much easier than I thought" ([DEV] SED).
- SIMD was used in early-access optimization ([DEV] 80.lv).

**Not confirmed**
- **Contact generation scheme: UNCONFIRMED.** No primary source says whether contacts come from points or spheres at voxel centres or corners tested against the other grid, or from something else.
  - The usual way to do unaligned voxel-vs-voxel is to transform sample points (surface voxel centres or corners) of the smaller shape into the other shape's grid, look up occupancy, and derive a normal from neighbourhood or distance information. The separate "physics representation" (§2) is a natural place for precomputed surface points or normals. All of this is an inference.
  - A Hacker News commenter's claim that "Teardown convert[s] each physics chunk into a mesh and feeds all the meshes into a traditional physics engine" (https://news.ycombinator.com/item?id=47410910) contradicts the developer's statements and should be treated as false or unverified.
- **Broadphase: UNCONFIRMED** for Teardown. Spatial acceleration structures for physics exist and are rebuilt at load ([DEV] quicksave). The successor engine's broadphase was "improved".
- **CCD: UNCONFIRMED.** No source describes continuous collision for rigid bodies.
  - Bullets are not rigid bodies. `Shoot()` spawns projectile types "bullet", "rocket", "gun" and "shotgun" ([DOC]).
  - `QueryShot` and `QueryRaycast` are ray or sphere casts with optional thickness. Bullets are therefore ray-tested and cannot tunnel.
  - Tunnelling of fast rigid bodies through thin (1-voxel, 10 cm) walls at 60 Hz with 8 iterations is plausible but undocumented.
- **Known artifact**: soft material trapped inside hard material "risk[s] becoming loose and get[ting] stuck between the hard surrounding material, causing problems for the physics" ([DOC] modding guide). The docs recommend grout made of brick, not plaster. This hints that small dislodged pieces wedged between static voxels produce solver jitter and penetration problems.

**Script-visible queries** ([DOC]): `QueryRaycast` (ray or sphere cast, can reject transparent voxels), `QueryClosestPoint`, `QueryAabbShapes`/`QueryAabbBodies`, `IsShapeTouching` ("physical overlap"), `GetBodyClosestPoint`, `GetShapeClosestPoint`, `QueryRaycastRope`, `QueryRaycastWater`.

---

## 6. Sleeping, activation, islands

- "For performance reasons, bodies that don't move are taken out of the simulation… Only dynamic bodies can be active" ([DOC] `IsBodyActive`, added 0.6).
- `SetBodyActive` (0.9.0) lets scripts force a body in or out of simulation. The body tag `awake` makes a body "start in a simulated state" (0.7.0) ([DOC] changelog).
- Thresholds and timers are **UNCONFIRMED**.
- Islands: `GetJointedBodies(body)` returns "all dynamic bodies in the jointed structure", and `IsBodyJointedToStatic` checks whether a body is "directly or indirectly jointed to something static" ([DOC]). This implies the engine keeps joint-graph traversal.
- Contact-island sleeping (a whole pile sleeping together) is **UNCONFIRMED**.

---

## 7. Mass and inertia from voxels

- Each shape has a **density** (`SetShapeDensity`: "Change the material density of the shape") and a **strength** ([DOC] `GetProperty`/`SetProperty`).
- Body mass and centre of mass are exposed through `GetBodyMass` and `GetBodyCenterOfMass` (local space) ([DOC]).
- Mass changes as voxels are removed. Cut pieces get their own mass and centre of mass. This is implied by the splitting behaviour, but the exact recomputation is **UNCONFIRMED**.
- Formula: **UNCONFIRMED**. The natural model is mass = Σ voxels × voxel volume (0.001 m³) × density, plus an inertia tensor summed over voxel cubes.
- Whether density is per material or only per shape is **UNCONFIRMED**. The API exposes density only per shape. An unofficial guide mentions "material type, weight, and flammability" as editor properties (https://get-teardown.readthedocs.io, [COMM], low reliability).
- What `strength` does (probably a damage-resistance scale for the shape) is **UNCONFIRMED**.

---

## 8. Damage sources: how voxels get removed

### 8.1 Material hardness tiers ([DOC] https://teardowngame.com/modding/ "Materials")

| Material | Hardness | Sledge | Blowtorch | Guns | Explosives |
|---|---|---|---|---|---|
| Glass, Grass, Plastic, Wood | Soft | ✓ | ✓ | ✓ | ✓ |
| Dirt, Plaster | Soft | ✓ | ✗ | ✓ | ✓ |
| Concrete, Brick | Medium | ✗ | ✗ | ✓ | ✓ |
| Weak Metal | Medium | ✗ | ✓ | ✓ | ✓ |
| Hard Masonry, Hard Metal | Hard | ✗ | ✗ | ✗ | ✓ |
| Heavy Metal, Rock | Unbreakable | ✗ | ✗ | ✗ | ✗ |

The design notes say unbreakable material is reserved mostly for rock and ground, because more of it "would make the environment harder to read" ([DEV] design notes). There is also an `unbreakable` tag usable in `FindEntities("unbreakable")` ([DOC]).

### 8.2 `MakeHole` (the core carving primitive)

`count = MakeHole(position, r0, [r1], [r2], [silent])` ([DOC]):
- r0 is the radius for **soft** material: "glass, foliage, dirt, wood, plaster and plastic".
- r1 is for **medium**: "concrete, brick and weak metal". It must be ≤ r0.
- r2 is for **hard**: "hard metal and hard masonry". It must be ≤ r1.
- Radii are in metres. The function returns the number of voxels removed.
- So a single damage event is **three nested spheres**, one per hardness tier. Every tool is effectively parameterized by these three radii. The sledgehammer has r1 = r2 = 0; guns have r2 = 0.
- Exact per-tool radii live in the game's Lua scripts (**UNCONFIRMED** values).

### 8.3 Explosions

- `Explosion(pos, size)` takes a size "from 0.5 to 4.0" and an optional instigating player (added 2.0.1) ([DOC]).
- Internals are **UNCONFIRMED**: hole radii as a function of size, impulse falloff, player damage, fire ignition.
  - Modders say vanilla explosion behaviour lives in a Lua file `explosion.lua` in `data/script`.
  - One project removes a "hardcoded explosion radius limit" ([COMM] search results for Steam Workshop discussions and https://awesome.ecosyste.ms/projects/github.com%2Ftobyxdd%2Fteardownmininuke).
  - This suggests the engine-side `Explosion` calls MakeHole-like carving plus an impulse, with the size clamped to 4.
- `Paint(origin, radius, "explosion")` tints voxels black, which is the scorch look ([DOC]).
- Propane tanks and similar objects explode; the triggering mechanism is **UNCONFIRMED**.

### 8.4 Bullets and projectiles

- `Shoot(origin, dir, type, strength, maxDist)` with type "bullet", "rocket", "gun" or "shotgun", and a strength scale ([DOC]). It is server-only in multiplayer.
- Projectiles are simulated by the engine with ray tests (`QueryShot`, with a radius for thickness). Hits carve with MakeHole-style radii, and rockets call an explosion.
- Speeds, drop and penetration are **UNCONFIRMED**.

### 8.5 Heat (blowtorch, fire)

- `AddHeat(shape, pos, amount)`: "works similar to blowtorch. As soon as the heat of the voxel reaches a critical value, it destroys and can ignite the surrounding voxels" ([DOC]).
- So each voxel accumulates heat. Removal by heat is gated by material (blowtorch rows in §8.1).

### 8.6 Impact and collision damage

- Vehicles demolish walls: "Tear down walls with vehicles" (Steam store page). Heavy objects falling do break things in play.
- The **mechanism is UNCONFIRMED.** The most likely design is a contact-impulse threshold that triggers MakeHole-style carving at the contact point, scaled by impulse and gated by hardness. That would mirror Smash Hit's impulse-threshold breakage (§1).
- 0.9.0 changelog: "Vehicles not getting stuck as easily when driving over debris" and "Plank attachments breaking under heavy stress" ([DOC]). Joints and attachments therefore break under force.
- Vehicle damage is a separate health system (§13).

### 8.7 Script-level voxel editing (1.4+)

`CreateShape`, `ClearShape`, `ResizeShape`, `SetShapeBody`, `CopyShapeContent`, `SetBrush` (sphere, cube or vox brushes of 1–16 voxels), `DrawShapeLine`, `DrawShapeBox`, `ExtrudeShape`, `TrimShape`, `SplitShape`, `MergeShape` ([DOC]). `MergeShape` merges shapes that are "aligned to the same rotation and touching". This exposes the engine's internal split, trim and merge operations.

---

## 9. Connectivity, splitting and "structural integrity"

### 9.1 What the engine does: connectivity only

**After voxels are removed, the engine finds face-connected components**
- Any component no longer connected to the static world (or to its parent body) becomes a new shape on a new dynamic body. This was confirmed in principle by many sources; [DEV] SED: "this thing that find connected parts".
- Per-shape APIs: `IsShapeDisconnected(shape)` ("has detached parts"), `IsStaticShapeDetached(shape)` ("static shape has detached parts"), and `SplitShape(shape, removeResidual)`, which splits "based on connectivity. If the removeResidual flag is used, small disconnected chunks will be removed during this process to reduce the number of newly created shapes" ([DOC]).

**Connectivity crosses shapes**
- A house is many shapes, so whether a chunk is still "connected to ground" requires a search across shape boundaries. This is the hard part.
- Gustafsson: "It was a really challenging technical problem… to come up with an algorithm that could do that for infinitely large objects, because you may end up searching the whole level, which is hundreds of millions of voxels" ([DEV] SED).

**Early Access limitation**: "When we released Teardown in 2020 in early access, there was a limitation on this thing that find connected parts. So, if you have a really big house and you take down the whole entire lower floor, even the last voxel, it would actually still stand… That's something we updated a few months later" ([DEV] SED).

**Fix**
- 2021-02-26 tweet: "One of the biggest technical challenges with Teardown has been to identify disconnected chunks with good performance. I just came up with a new algorithm that handles unlimited search distance and is an order of magnitude faster than the old one!" ([DEV] https://x.com/voxagonlabs/status/1365312723194679296).
- Shipped in 0.7.0: "Large disconnected chunks now fall properly", "Massively improved destruction performance", "Improved physics performance" ([DOC] changelog).
- **The algorithm itself is UNCONFIRMED.** Likely ingredients:
  - Searching only from the voxels adjacent to the removed region.
  - Bidirectional or early-out flood fill that stops when ground or static anchors are reached.
  - Hierarchical or chunked connectivity.
  - Amortization across frames.

**Ownership changes**
- A split piece gets a new body, or a shape is reassigned. The multiplayer command stream includes "change ownership of that shape" and "reconnect joint to this shape" ([DEV] multiplayer post).
- So, when a split happens, joints attached to the original shape are re-bound to whichever fragment holds the joint anchor. `DetachJointFromShape` is the script-side analogue.

**Dynamic bodies** split too. Damage to a dynamic body produces new bodies with recomputed mass. `IsBodyBroken` and `IsShapeBroken` flag damaged shapes ([DOC]).

### 9.2 What the engine does not do: stress, load or strength

**No load paths**
- Gustafsson: "There is one clear candidate [for what wasn't implemented]. That is the structural integrity… you remove almost all of the lower floor, so it's only hangs on a single voxel, it is still connected… I still don't know exactly how I would go about implementing something like that… There are hundreds of millions of voxels in the scene and trying to untangle how they're connected exactly and how much weight they're feeling how much they're supporting. So, I'm not doing that" ([DEV] SED).
- Design rationale: "I do appreciate that you can trust the environment. If there is something holding up a building… it's not just going to randomly break… that gives you more ability to plan."
- The tutorial house deliberately shows the limitation up front ("we knew a lot of people were going to be disappointed").
- Co-founder Emil (Steam, Aug 2020): "The issue is performance. Calculating load-bearing strength for every voxel would make the game unrunnable on all modern computers" ([DEV] https://steamcommunity.com/app/1167630/discussions/0/2918850377439305091).

**Faked integrity**
- "You could also fake it a little bit by making the house in multiple parts and join them together with like physical joints instead. We do that for some parts of the buildings" ([DEV] SED).
- Joints with finite strength therefore give local collapse: planks, signs, attachments.
- The 0.9.0 note "Plank attachments breaking under heavy stress" confirms that joints break under load.

**Why buildings "float"**: a single face-connected voxel path to a static anchor keeps the whole structure static, so it has no mass in the solver. It is part of the static world body until detached. Weight never enters the equation.

**Large bodies under their own weight**: a detached chunk is a rigid body. It does not deform or self-fracture from weight. Damage on impact with the ground follows §8.6 (mechanism UNCONFIRMED). No update has added weight-based collapse to vanilla Teardown as of 2.2.0.

**Successor work**
- 80.lv (Sep 2026) reports a real-time voxel building demolition demo by Gustafsson. A Teardown developer (Riv Olle Patrik Lundahl) is quoted as confirming "this is a prototype of the game's structural integrity system", with "the solver… inspired by Erin's work" ([COMM] https://80.lv/articles/this-real-time-voxel-building-demolition-is-so-satisfying/).
- Whether this ships in Teardown or only in a future game is **UNCONFIRMED**. Separately, Gustafsson has said the new engine is "unlikely" to be integrated into Teardown ([COMM] https://80.lv/articles/teardown-creator-is-working-on-a-new-voxel-engine).

**Mods** fake integrity with impact or shockwave scripts. Examples are "Structural Integrity & Collateral Damage System" and "Impact Based Structural Integrity Test" on the Steam Workshop ([COMM]).

---

## 10. Debris management and limits

**Small-debris culling** ([COMM], from mod descriptions)
- Vanilla deletes "anything below 25 voxels when your camera looks away" (Small Debris Retainer, https://steamcommunity.com/sharedfiles/filedetails/?id=2996428267).
- The same mod warns that keeping debris "may very quickly reach the engine cap and cause wonky, flingy physics". Its anti-fling option starts deleting when "the total global physics body count is above 15000". That is a mod-chosen threshold, not an engine constant.
- The `removeResidual` flag of `SplitShape` documents an engine-side policy of discarding tiny disconnected chunks during splits ([DOC]).
- Some tiny fragments are probably converted to particles rather than bodies; this is **UNCONFIRMED** as an engine rule. The visible chip particles are spawned as effects.

**Particles**: a "particle density" option (1.5.1) and a particle API ([DOC]). See §12.

**Engine body cap**: an exact hard limit is **UNCONFIRMED**.

**Practical guidance for content**: avoid 256³ objects; ~128³ is fine; flat big objects are fine ([DOC]).

**Costs called out by the developer**
- Large moving objects are expensive because the shadow bitmap must be updated. "There's a yacht… That one is pretty expensive to update because there's just so many voxels moving" ([DEV] SED).
- The update is CPU-orchestrated and parallelized in the background.

---

## 11. Fire

**Model** ([DOC])
- Per-voxel heat (`AddHeat`).
- At a critical heat the voxel is destroyed and "can ignite the surrounding voxels".
- `SpawnFire(pos)` starts a fire. `GetFireCount`, `QueryClosestFire`, `QueryAabbFireCount` and `RemoveAabbFires` query and remove fires.
- Fires are discrete point entities attached to the voxels they burn.

**What burns**
- Flammable materials include wood and plastic; the wiki Tools page says tools can "set flammable materials like wood and plastic alight" ([COMM] teardown.fandom.com/wiki/Tools).
- Foliage and grass are likely flammable. The full flammability table is **UNCONFIRMED**.

**Spread and caps**
- Registry keys `game.fire.maxcount` and `game.fire.spread` were introduced in 0.8.0 ("Registry settings for fire control") ([DOC] changelog). Their default values are **UNCONFIRMED**.
- Community figures conflict and depend on the version:
  - The wiki says "hard coded limit of 100 fires".
  - Players measured about 200 in 2021, with "aggressive" culling of old fires and of new fires not started by existing flames.
  - Later reports give caps of about 950 and about 2,400–2,500.
  - A mod author claims an internal cap of 4,096 naturally spreading fires and "only 4 new fires to spread per update", and says both are hard-coded ([COMM] https://steamcommunity.com/sharedfiles/filedetails/?id=3625893976; https://steamcommunity.com/app/1167630/discussions/0/3057365873425867848/).
- Design takeaway: fire is capped by count plus a spread rate per tick.

**Extinguishing**
- The extinguisher sprays particles with `ParticleFlags(256)`, "fire extinguishing particles… currently the only flag in use" ([DOC]).
- Fires also end when their voxels are destroyed or when the burning object is put in water ([COMM] wiki).
- The leaf blower "can now remove snow and boost fires" (0.9.1, [DOC]). Wind and airflow therefore interact with fire.

**Gameplay hook**
- Missions trigger the alarm or timer when enough fire exists. This is driven by mission Lua scripts polling fire counts ([COMM] https://slythergames.com/?p=4077; mechanism plausible via `GetFireCount`).
- Smoke is emitted as particles.

**Charring**: whether heat-damaged voxels darken (a char colour) is **UNCONFIRMED**. Explosions blacken voxels via the "explosion" paint type ([DOC] `Paint`).

---

## 12. Water, smoke and particles

**Water**
- Water is a scene entity (a volume), not simulated fluid. Properties: `type`, `depth`, `wave`, `ripple`, `motion`, `foam`, `color` ([DOC] `GetProperty`).
- 2.0.3 extended water to lava-style volumes: foam textures, splash particles, sounds, PBR and emissive settings ([DOC] changelog).
- The surface is one of the few non-voxel elements: "Everything is volumetric data, except for water surfaces and the power lines" ([DEV] Game Developer). The animated surface is based on Inigo Quilez's work ([DEV] tweet).
- Queries: `IsPointInWater(point)` returns (inWater, depth), and `QueryRaycastWater` ([DOC]).
- Buoyancy: "Voxels make buoyancy easier to implement than to spell" ([DEV] tweet 2019-01-15, https://twitter.com/voxagonlabs/status/1085154363759382528). Per-voxel or per-sample submerged-volume buoyancy plus drag is strongly implied. The exact algorithm and the drag model are **UNCONFIRMED**.
- Boats are vehicles (scripts find them with `FindVehicles("boat")`, [DOC]) and float through the same buoyancy.
- The player is slowed in water ("real player speed depends on… water", [DOC]) and can swim. Swim mechanics are **UNCONFIRMED**.
- Vehicles have "less grip on wet roads" (0.8.0) ([DOC]).

**Smoke and particles** (`Particle*` API, [DOC])
- Types: "smoke" or "plain". Parameters include gravity along world Y, drag ("implemented slightly different for smoke and plain particles"), `ParticleCollide` (0..1; "collisions are ignored" at 0), `ParticleSticky` ("stick when in contact with objects… can be used for friction"), rotation, and emissive.
- Particles collide with voxels; the method is **UNCONFIRMED**.
- `GetWindVelocity(point)` gives wind that "varies with position procedurally" and affects particles. Snow and rain are environment properties.
- Gustafsson on smoke: "The smoke and particle physics is something I've been interested in for a long time as a hobby"; "Very complex physical calculations are carried out on the smoke and extinguisher" ([DEV] via TechRadar, https://www.techradar.com/gaming/consoles-pc/teardown-devs-top-priority-is-always-physics-the-game-can-come-later).
- Whether smoke particles interact with each other (fluid-like) or only with the wind field and geometry is **UNCONFIRMED**.

---

## 13. Joints, ropes and vehicles

**Joint types**: `"ball"`, `"hinge"`, `"prismatic"`, `"rope"` ([DOC] `GetJointType`). A joint always connects **two shapes**, not bodies (`GetJointShapes`, `GetJointOtherShape`).

**Joint properties** ([DOC] property tables and modding guide)
- `type`, `size` (the radius of the joint's anchor region), `rotstrength`, `rotspring`, `limits`, `collide` and `sound`.
- `rotstrength` and `rotspring` appear to be friction-like resistance and spring stiffness for rotational joints; exact semantics are **UNCONFIRMED**.

**Motors**
- `SetJointMotor(joint, velocity, [strength])`: rad/s for hinges, m/s for prismatic. Strength defaults to infinite; 0 disables.
- `SetJointMotorTarget(joint, target, [maxVel], [strength])`: degrees −180..180 for hinges, metres for prismatic.
- `GetJointLimits` and `GetJointMovement` ([DOC]).

**Breaking**: `IsJointBroken` and `DetachJointFromShape` exist. Destroying the voxels around a joint's anchor releases it ([DOC]). This is how doors fall off hinges and signs drop. The break-by-force threshold for non-rope joints is **UNCONFIRMED**, but the 0.9.0 plank-stress change shows force-based breaking exists for at least some attachments.

**Ropes**
- Properties: `slack`, `strength`, `maxstretch`, `ropecolor` ([DOC]).
- Ropes are point chains: `GetRopeNumberOfPoints` and `GetRopePointPosition` expose the points, `GetRopeBounds` the extent, `QueryRaycastRope` hits them, and `BreakRope(joint, point)` cuts them ([DOC]).
- The fact that `strength` and `maxstretch` exist implies ropes break when stretched past a limit.
- The integration scheme (Verlet/PBD particles versus solver distance constraints) and whether ropes collide with voxels are **UNCONFIRMED**.
- Power lines and wires are rendered as non-voxel geometry ([DEV]). Players have built slingshots from wires: "when that snapped off, the wires can slingshot the whole vehicle" ([DEV] Game Developer).
- Spawned prefabs can attach joints to existing scene geometry (`Spawn(..., jointExisting)`) ([DOC]). Joint spawning had a determinism bug fixed in 2.0.4 ("joints spawned from prefabs could fail to be deterministic").

**Vehicles**
- Vehicle entity parameters: `spring`, `damping`, `topspeed`, `acceleration`, `strength`, `antispin`, `antiroll`, `difflock`, `steerassist`, `friction`, `smokeintensity`, `brokenthreshold` ([DOC] `GetProperty`/`SetVehicleParam`).
- Wheel entity: `drive` (driven fraction), `steer` (steering factor), `travel` (suspension travel, x/y) ([DOC]).
- Wheel and tyre model (raycast versus shape-cast suspension versus real wheel bodies on hinges): **UNCONFIRMED**. Wheels can be lost, since "destruction affects handling (e.g., losing a wheel)" ([COMM] https://get-teardown.readthedocs.io/en/latest/gameplay/vehicles-and-equipment.html, low reliability).
- Health: vehicles have health from 0 to 1 (`GetVehicleHealth`). `brokenthreshold` and "vitals" (`GetVehicleVitalTransform`) suggest that damage to vital voxel regions such as the engine lowers health until the vehicle breaks.
- The `customhealth` tag "disables the common vehicles damage system" so scripts can implement their own ([DOC] `SetVehicleHealth`).
- Exhaust transforms emit smoke (`smokeintensity`).
- Driving onto debris was improved in 0.9.0. A new vehicle camera came in 0.9.3.

---

## 14. Player physics

**Exposed parameters** ([DOC] `GetPlayerParam`/`SetPlayerParam`)
- Persistent: `health`, `healthRegeneration`, `godMode`, `friction` (default 0.8), `frictionMode`, `flyMode`, `flashlightAllowed`, `CollisionMask` (8-bit, against shape layers).
- Immediate (re-set each tick): `walkingSpeed`, `jumpSpeed` ("height of the jump depends non-linearly on the jump speed"), `disableInteract`.
- Walking speed depends on "health, crouch, water, grabbing objects".

**Ground interaction**
- `GetPlayerGroundContact()` returns (bool, shape, point, normal) (1.7) ([DOC]).
- `SetPlayerGroundVelocity` exists (0.9.0) for moving platforms.
- The player is therefore a kinematic or dynamic controller that samples the ground contact and carries platform velocity.

**Collision shape: UNCONFIRMED.** No source says whether the player is a capsule, a box or a set of spheres.
- `QueryShot` returns a `playerDamageFactor` ("1.0 for a hit on the torso, and less for a lower body hit"), so hit detection distinguishes torso from lower body.
- Since 1.6 there are third-person characters, animated rigs (`GetPlayerRig...`) and a spawnable "Merlin" ragdoll ([DOC] changelog).

**Grab and throw**
- The player can grab bodies (`GetPlayerGrabBody`, `GetPlayerGrabPoint`, `ReleasePlayerGrab`). 0.9.0 added "new behavior when player collide with grabbed objects" and "adjusted throwing strength" ([DOC] changelog).
- The grab is likely implemented as a constraint with a force limit, consistent with `ConstrainPosition`'s maxImpulse design; this is **UNCONFIRMED**.

**Zero-g**: `SetPlayerOrientation` and `GetPlayerUp` support custom up vectors when gravity is disabled (1.7) ([DOC]).

---

## 15. Performance and multithreading

**Developer statements**
- "making use of both SIMD and multithreading to take advantage of modern hardware" ([DEV] 80.lv).
- "The Teardown engine is based around data parallelism" ([DEV] year summary).
- "The physics engine in Teardown is multithreaded already(!)" ([DEV] tweet 2023-01-23, https://x.com/voxagonlabs/status/1617616114581925888).
- Community perception in 2022 was that physics was single-threaded ([COMM] https://steamcommunity.com/app/1167630/discussions/0/3713810544740251342/). The developer corrected this, and the BSC 2025 talk covers further parallelization of the PC solver (§4).

**Console ports**: Saber Interactive did the D3D12 port and performance optimizations ([DEV] SED). 2.2.0.1 "Fixed threading issues in job scheduling and background processing" ([DOC]).

**Background CPU jobs**: updating the occlusion bitmap is spread across frames and threads ([DEV] SED).

**Physics data volume**: hundreds of millions of voxels per level. Physics touches only active bodies, and sleeping bodies cost nothing per step.

---

## 16. Determinism and multiplayer networking

Sources: ([DEV] https://blog.voxagon.se/2026/03/13/teardown-multiplayer.html; https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech; [DOC] api.html)

**Timeline**
- Internal 2021 experiment: "a naive approach to synchronize moving objects" plus sending changed voxel data. It "choked the connection when large objects were destroyed".
- A community mod, TDMP, added rudimentary multiplayer through DLL injection. "Since the engine isn't deterministic, it could easily get out of sync, especially with destruction."
- Serious work started in "late 2022".
- The multiplayer branch was merged with Saber's main-branch work (console ports, UI, optimizations) in a merge that took almost three months.
- The transport switched from Saber's backend to Steam Networking after the ownership change to Coffee Stain.
- **PC release 2.0.0 on 2026-03-12; consoles on 2026-09-15; up to 12 players** ([COMM] https://www.techtimes.com/articles/326489/20260903/teardown-multiplayer-hits-ps5-xbox-sept-15-solving-voxel-physics-once-deemed-impossible.htm; https://www.kitguru.net/tech-news/mustafa-mahmoud/physics-based-sandbox-teardown-gets-12-player-multiplayer-and-much-more-in-new-update/). There was a beta before the March 2026 release ([COMM] https://finalboss.io/teardowns-multiplayer-finally-leaves-beta-on-march-12).

**Topology**: no dedicated servers. "The player hosting a session will be the server for that session while also acting as one of the clients" ([DOC]).

**Hybrid model: two channels**

1. **Reliable, ordered stream of deterministic commands for destruction.**
   - "Sending large amounts of voxel data wasn't an option because of bandwidth, so we had to rely on determinism."
   - The team chose to "rewrite the destruction logic in fixed-point integer math".
   - Breakage is serialized as commands, for example "cut hole in this shape at voxel coord x,y,z", "change ownership of that shape", "reconnect joint to this shape".
   - Every machine applies them "in exactly the same way and order".
   - Command size is independent of object size.
   - "A lot of this still involves floating point math" (hierarchy separation and joints), which "is mostly safe if you know how to navigate around the pitfalls". A follow-up post was promised; none was found as of 2026-11.
2. **Unreliable state sync for physics.**
   - "Some parts of the engine, like the physics, still use traditional state synchronization."
   - The server picks objects each update with a **per-client priority queue** that favours objects visible or near that player within a budget of about **1 Mbit/s per client**. "The server keeps a priority queue to ensure everything is eventually sent."
   - "Each client runs a local simulation, as it normally would". Incoming state corrects the affected objects, "which can cause visible snapping" in busy scenes.
   - Ordering is not needed because newer packets supersede older ones.

**Physics is not lockstep-deterministic in Teardown.** "I dismissed the idea of full determinism for the entire engine (a view I have since reevaluated)." The successor engine's graph-coloured solver aims at "deterministic order" on multiple threads ([DEV] tweet 2025-01-21).

**Join-in-progress**
- Three options were considered: a full scene dump (30–50 MB+, reusing quicksave), serializing only changed objects, or **replaying the recorded command stream**. Replay was chosen.
- "We still limit the buffer size and disable join-in-progress when it fills up."

**Scripting model** ([DOC])
- Each script has `server`, `client` and `shared` tables. `shared` is auto-synced from server to client and read-only on clients.
- `ServerCall` and `ClientCall` are RPCs.
- Deterministic RNG helpers were added in 2.0.0 (`SetRandomSeed`, `GetRandomFloat`, …).
- Damage APIs (`MakeHole`, `Explosion`, `Shoot`, `SpawnFire`, `AddHeat`, `Paint`) are **SERVER ONLY**, so destruction always originates on the host and is broadcast as commands.

**Terminals and UI**: run on the server. Draw commands are delta-streamed, inspired by the X Window System ([DEV]).

**Fire and particle sync**: **UNCONFIRMED**. `SpawnFire` is server-only and fire queries work on clients, so fire is probably server-authoritative with replicated fire entities.

**Packet-loss bug fixed in 2.0.4**: "player state changes were not resent after packet loss" ([DOC]).

---

## 17. Implications for building a similar game (inference, not sourced)

1. **Representation**
   - Rigid bodies are compounds of dense voxel grids, each with its own transform.
   - Keep one 8-bit palette index per voxel. The palette maps to material, which maps to hardness tier, flammability and density.
   - Derive a separate collision-optimized voxel representation, such as surface voxels or normals, at load time.
2. **Damage primitive**
   - One function, `carve(pos, rSoft, rMed, rHard)`. Every tool, bullet, explosion and impact maps to three radii plus an impulse.
   - Implement it in **integer or fixed-point maths** from day one if multiplayer is planned.
3. **Connectivity, not stress**
   - Run a 6-connected flood fill from the boundary of the carved region, with an early-out when an anchor (static or world) is reached.
   - Make it work across shape boundaries with unbounded search.
   - Budget it. This was Teardown's hardest destruction problem, fixed only after Early Access.
   - Fake structural failure with breakable joints between authored building parts.
4. **Solver**
   - PGS/sequential impulse with about 8 iterations at a fixed 60 Hz is proven enough for this genre.
   - A modern alternative is a sub-stepped soft-step solver (Box2D v3-style) with graph colouring for parallel, deterministic piles.
5. **Budget**
   - Sleep aggressively.
   - Cull sub-25-voxel debris when out of view.
   - Cap fire count and spread per tick.
   - Prioritize state-sync bandwidth by player relevance.

---

## 18. Remaining unknowns (explicitly UNCONFIRMED)

- Exact contact-generation algorithm for unaligned voxel-vs-voxel collision (sample points, spheres or corners, normal estimation), contact reduction, and per-pair contact counts.
- Broadphase structure (SAP, BVH or grid) in Teardown.
- Whether CCD exists for rigid bodies.
- Warm starting, contact persistence, and solver position-correction method (Baumgarte versus split impulse).
- Whether physics runs at exactly 60 Hz. The API strongly implies the script update is fixed at 1/60 s with at most 2 steps per frame.
- Sleep thresholds and island-based sleeping.
- Mass formula, whether density is per material, and the meaning of shape `strength`.
- Impact or collision damage mechanism (impulse thresholds and how carving is scaled).
- Explosion internals: radius per size, impulse falloff, fire ignition.
- The disconnected-chunk algorithm itself, beyond "unlimited search distance, order of magnitude faster" (Feb 2021).
- Fire defaults (`game.fire.maxcount`, `game.fire.spread`), flammability per material, whether burnt voxels char, and the true caps. Community values range from 100 to 4,096 fires, with "4 new fires per update".
- Buoyancy algorithm, water drag, and swimming model.
- Rope simulation method and rope-voxel collision.
- Vehicle wheel model (raycast versus physical wheels), engine and torque model, and how vehicle health maps to damaged voxels.
- Player collision shape (capsule or other).
- Small-debris rule (the "<25 voxels when the camera looks away" figure comes from a mod description) and any hard engine body cap.
- Whether the Sep 2026 structural-integrity prototype will ship in Teardown.
- Floating-point determinism specifics for the multiplayer joint and hierarchy code (follow-up blog post promised but not found).
