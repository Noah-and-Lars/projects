# Research Report & Game Design Brief — "Tidewright" (working title)

An original browser game in the **vehicle-building physics sandbox** genre: build cars, boats, planes and helicopters from blocks, then use them for rescue, delivery and firefighting jobs. Play happens on an island ocean with weather, disasters and multiplayer. The game runs on the user's website.

Stormworks: Build and Rescue was studied as a **genre reference only**. That means its systems, numbers and player feedback, not its assets. The detailed findings are in the 19 topic reports listed at the bottom.

> **Originality rules (non-negotiable).** The game does not use the Stormworks name, logos, textures, models, sounds, UI layout or look, map, island names or text. Every part, place and mode gets our own name (see §6), and the art and UI styles below are deliberately different. Borrowed numbers, such as a 0.25 m grid or a 60 Hz tick, are common engineering choices. Treat them as tuning starting points, not as data to replicate.

> **Evidence quality.** The main wikis (Fandom, wiki.gg, SteamDB) blocked automated access. The research therefore rests on Steam guides and threads, patch-note snippets, the community Lua API docs and hosting guides. Each topic report tags its claims as verified, recalled/unverified, or our own design. Wherever a reference number is uncertain, **tune by feel in playtests**.

---

## 1. What the research tells us (top findings)

| Area | Key takeaways | Report |
|---|---|---|
| Core physics | Blocks are 0.25 m. Voxels get merged into a few convex collision shapes. Physics runs at a fixed ~60 Hz, and the **whole world slows down (time dilation)** instead of desyncing under load. Hollow, air-filled volumes are the main performance cost. Vehicles at rest go to sleep. | 01 |
| Land vehicles | Drive goes through a rotational network: engine → clutch → gearbox stages → wheels. There is **no stock differential and no Ackermann steering**, and players fake both with logic. Suspension wheels come with stiffness and damping settings. Tracks need very high torque. Custom suspensions jitter at rest. | 02 |
| Aircraft | Lift seems to come from many blocks, and the air is "thick". Players needed external tools to see lift. Rotors are a built-in part with a collective input, and a confusing legacy mode tied lift to throttle. Players build PID governors to hold engine RPS steady. | 03 |
| Weather & disasters | Weather is stored per location as 0..1 factors (fog, rain, snow, wind, temperature). The disasters are tsunami, meteor, volcano, tornado and whirlpool. They run as a **replaceable script addon** and spawn disaster-relief missions. Only one tsunami or whirlpool can be active at a time. | 04 |
| Player | The player has **4 small slots, 1 large slot and 1 outfit slot**. Outfits include scuba (~50 m, ~2 min of air) and a diving suit (~250 m, ~10 min). Revival is a defibrillator followed by a medkit. Ragdoll in multiplayer has caused bugs. Seat controls are labelled by the vehicle's builder. | 05 |
| Art | Low-poly blocky models, with atmosphere (water, weather, light) doing the heavy lifting. The game is CPU-bound by physics. Players lower lights, shadows and foam to gain FPS. | 06 |
| UI | Minimal HUD, a world-space editor and programmable in-vehicle screens. The main complaints are a steep learning curve, no onboarding, crude script editing, thin error feedback and weak accessibility. | 07 |
| Multiplayer | One authoritative host for up to 32 players, with 8–16 recommended. A replication rework cut bandwidth by 60–80%. One heavy vehicle slows everyone down. Admins get kick, ban and spawn-auth tools. | 08 |
| Modes & economy | Players enjoy the build-test-iterate loop, logic programming, sharing creations and emergent physics stories. The **career mode is shallow and repetitive**, with money as the only goal. One optimised vehicle trivialises it, and missions spawn too far away. | 09 |
| Editor | The tools are place, erase, paint/eyedropper, select/move/copy, logic, merge and mirror (symmetry on X, Y and Z). There is a section plane, a centre-of-mass marker and warnings. Players rely on third-party tools to find leaks and trace wiring. | 10 |
| Parts | There are hundreds of parts. The research cuts them down to an original MVP list (§6). | 11, 12 |
| Logic & scripting | Logic is tick-based with about one tick of delay per gate. Composite signals carry 32 bool and 32 number channels. A ~4,000-character script cap is the biggest pain point, followed by debugging and API breakage. | 13 |
| Engines, fluids & power | Fuel burn scales with RPS, not load. Heat rises with RPS and is removed by coolant and radiators. Gearing sets each engine's efficient band. Hybrid builds are efficient but heavy. | 14 |
| Ships & ocean | Buoyancy comes from sealed volume. Compartments flood, and hatches and pumps move water. Submarine ballast is player-built. Players called the water too thin and the boats bouncy. Odd drag behaviour underwater was noticed. | 15 |
| World | The world is tile-based islands in separate climate zones. Rail lines exist. Floating-origin and 64-bit physics are needed for far islands. Sharp procedural rail curves were criticised. | 16 |
| Damage & fire | Fire spreads across vehicle surfaces and respects compartments. A spread-per-tick cap protects performance. Missions scale their survivor and fire counts with difficulty. There is no simple per-block HP; flooding is the main way vehicles fail. | 17 |
| Audio & modding | Vehicle files were hand-editable XML. Workshop categories are vehicles, mods, missions and microcontrollers. **A physics rework broke many shared creations**, which teaches us to version everything. | 18 |
| Browser tech | TypeScript + Vite, three.js (WebGL first), Rapier physics in a Web Worker, Cloudflare Workers + Durable Objects + R2 + D1. | 19 |

### The lessons, condensed

1. **Keep the build → test → iterate loop fast and visible.** Show the player lift, buoyancy, centre of mass and power budgets instead of making them guess.
2. **Built-in helpers where the reference made players hack around gaps.** Ship a differential, Ackermann steering, an engine governor, a rotor with a separate collective, and a "stabiliser" chip. Advanced players can still build their own.
3. **The career mode needs direction.** Use contract chains and regional progression. Per-contract constraints (tonnage, draft, pad size) stop one mega-vehicle from solving everything. Spawn missions within a bounded distance.
4. **Degrade gracefully under load.** Use time dilation and a spawn complexity budget, and let distant vehicles sleep.
5. **Version every save, vehicle and physics model** so that updates never silently break player creations.
6. **Onboarding and accessibility from day one.** That means guided first builds, clear error messages that jump to the problem part, rebindable controls, and gamepad and touch support.

---

## 2. Vision & pillars

**Pitch:** *You run a small coastal rescue-and-salvage outfit on a stormy archipelago. Design your own machines block by block, then take them out into the weather to save people, move cargo and fight fires, alone or with friends, in your browser.*

**Pillars**
1. **Engineering you can see.** Every force is visible: there are overlays for lift, buoyancy, centre of mass, torque flow and fluid flow.
2. **The sea is the antagonist.** Weather, waves and disasters create the stories.
3. **Purposeful jobs.** Contracts with constraints reward clever designs, not just bigger ones.
4. **Share and remix.** Vehicles are small, versioned files with a web gallery.
5. **Runs anywhere.** Desktop, laptop and phone browsers, with quality tiers.

---

## 3. Core loop & modes

```
Harbor hub ─▶ Contract board ─▶ pick contract (constraints shown)
     ▲                              │
     │                              ▼
 reinvest: parts,           Yard (editor): build / fit-out from stockpile
 bases, tech, regions               │
     ▲                              ▼
 payout − costs  ◀──── run it in the world: weather, hazards, rescue, cargo
 (fuel, repairs, lost parts)
```

- **Sandbox mode:** everything unlocked, with toggles for infinite money and fuel, damage on/off, and weather and disaster sliders.
- **Career mode ("Outfit"):** start with roughly 20k credits, a small Yard and one dock.
  - Unlock parts through *capability milestones*, for example the first sea rescue unlocks ballast and pumps.
  - Buy new bases at escalating cost; each adds Yard size, a dock, a helipad and storage.
  - Recycling a part refunds 50–70% of its cost.
- **Contracts:** each is a template of `{type, origin, destination, payload, constraints, hazards, reward formula, expiry}`.
  - Payout = base(type) × distance × risk × time pressure × payload, minus costs.
  - Chains such as mine → refinery → rail → port give the player direction. There are optional story arcs.
  - The board never offers the same type twice in a row, and the spawn radius is limited to owned regions plus a band around them.
- **Contract types (in order of introduction):** delivery, then sea rescue, then medical evacuation, then firefighting, then search (sonar or binoculars), then salvage (winch), then disaster relief.

---

## 4. Systems design (with starting numbers)

### 4.1 Physics core (01, 19)
- The grid is **0.25 m**. Mass, centre of mass and inertia are accumulated per voxel from part definitions.
- Contiguous blocks become one rigid body built from greedy-merged box colliders. Joints (hinge, servo, spinner, ram) split a vehicle into several bodies.
- Physics runs at a **fixed 60 Hz** step in a Web Worker, with at most 4 catch-up steps per frame. Beyond that the game time-dilates rather than entering a spiral of death.
- Rendering interpolates between snapshots.
- Order within each tick: inputs → logic → custom forces (engine, buoyancy, aero, wind) → physics step → damage, fluids and sensors → snapshot.
- Sleeping bodies, plus a simulation level of detail (LOD) for distant vehicles (15 Hz, coarse buoyancy points).
- Physics sits behind a **`PhysicsBackend` interface**: Rapier by default, with Jolt as the fallback if joint-heavy builds turn out unstable.

### 4.2 Land vehicles (02)
- **Raycast wheels** with a spring-damper suspension and tunable stiffness, damping and travel. Tyre grip uses a Pacejka-lite slip curve. Wheels come in S, M and L sizes, with and without suspension.
- **Drivetrain graph:**
  - engine → slip clutch (a torque-limited link) → gear stack (selectable ratio, ~0.95 efficiency per stage) → a **built-in differential** (open or locked) → wheels.
  - Brakes are a per-wheel torque.
- A **built-in steering mixer** handles Ackermann geometry and speed-sensitive steering. Tracks are a later phase, modelled as belt speed with idlers.
- Speeds to aim for: a road car should do 30–50 m/s, and a race build up to ~80 m/s.

### 4.3 Boats & submarines (15)
- Each vehicle caches **64–128 hull sample points**, clustered from voxel cells.
- Buoyancy force per point is ρ·g·V·(submerged fraction). Add quadratic drag and added-mass damping to avoid bounciness, and use **a realistic water density** (players complained the reference's water felt too thin).
- **The wave function is shared exactly by the shader and the CPU**, using 4–6 Gerstner waves driven by wind and sea state.
- Flooding works by flood-filling sealed compartments. Water flows in through openings and hatches, pumps move it out, and the extra mass is updated at 5–10 Hz.
- Ballast tanks control submarine depth, and there is a built-in depth-hold chip.
- Propellers produce momentum-theory thrust; rudders are control surfaces in water.

### 4.4 Aircraft & helicopters (03)
- Lift comes from **per-surface elements**. Coplanar wing blocks are merged into one surface at build time.
- Lift and drag coefficients come from 64-entry lookup tables over angle of attack, **with stall**. Each element's local velocity includes rotation and wind.
- Flaps, ailerons and rudders are control surfaces that deflect their element's lift curve.
- **Propellers** use momentum theory for thrust and torque from RPM and pitch.
- **Rotors** have a separate collective and cyclic, and an engine governor holds rotor RPM. They are never tied to throttle. Tail rotors and coaxial rotors handle torque.
- An **in-editor lift and centre-of-lift overlay** shows the centre of lift against the centre of mass. That one overlay fixes the reference's biggest aircraft pain point.
- Air density falls with altitude.

### 4.5 Engines, fuel & power (14)
- The **burner engine** comes in S, M and L.
  - Its RPS range is ~2–20 (scaled per size), with a torque curve and a sweet spot.
  - **Fuel burn follows RPS**; heat also rises with RPS, and coolant through a radiator removes it.
  - Overheating cuts power, then risks fire.
- **Electrics:** an electric motor, a dynamo, batteries (charge 0..1, with output sagging at low charge) and a solar plate. Each vehicle's electric network is solved as one power balance.
- **Fluids:** a relaxation solver over tanks and pipes, with pumps and valves. One fuel type plus water at first.

### 4.6 Logic & scripting (13)
- Signal types: **Bool, Number, Bundle (32 bool and 32 number slots), Video, Power, Fluid, Torque**.
- The logic graph is compiled to a flat, topologically ordered op array and evaluated at 60 Hz, with **one tick of delay per node** (memory and delay nodes keep state slots). A typical 1,000-node graph costs about 0.05 ms per tick.
- Wire mode is a 3D overlay plus a pop-out schematic sheet, and both edit the same graph. **Probe nodes** show live values for debugging.
- **"Brain" chip:**
  - A resizable user chip that can hold a sub-graph or a script (Lua via wasmoon, or JS via QuickJS-wasm).
  - Scripts run in a Worker with an instruction budget and a kill watchdog.
  - The source limit is generous (e.g. 64 KB) instead of a ~4K-character cap.
  - The draw API produces a command buffer that renders into the in-vehicle screen texture.
- An addon/mission scripting API is versioned and scoped by permissions.

### 4.7 Weather, time & disasters (04)
- Weather is a Markov state machine per region (clear → overcast → rain → storm → fog).
- Each region stores 0..1 factors for fog, rain, snow, wind and temperature, and the factors blend smoothly between states.
- The wind field pushes on exposed block faces, and wind and sea state drive wave amplitude.
- The day/night cycle defaults to 60 real minutes.
- **Disaster scheduler** (Poisson, with frequency and magnitude sliders and a master off switch):
  - Tsunami: a radial wave.
  - Tornado: a vortex force field.
  - Whirlpool: a downward flow sink.
  - Meteor: an impact, possibly triggering a tsunami.
  - Volcano: ash clogs engine intakes.
- At most one tsunami or whirlpool at a time. Warnings go out through sirens and map notices, and disasters spawn relief contracts.

### 4.8 Player character (05)
- A kinematic character controller that walks **in the local frame of the body it stands on**, so the player stays put on moving decks.
- Movement: walk, sprint, crouch, jump, ladders, seats.
- Swim and dive states. Air supply comes from the outfit, as in the table below.

| Outfit | Depth | Air |
|---|---|---|
| Scuba | ~50 m | ~2 min |
| Dive suit | ~250 m | ~10 min |
| Fire, cold and parachute outfits | — | — |

- Inventory: 4 small slots, 1 large slot, 1 outfit slot.
  - Small items: flashlight, binoculars, radio, flare, medkit, extinguisher.
  - Large items: defibrillator, hose.
- Health, incapacitation and revive (defibrillator then medkit). Ragdoll state is server-authoritative.

### 4.9 Damage, fire & rescue (17)
- Each voxel has HP and a material class. Impacts above a threshold damage voxels.
- A connectivity check runs after damage; disconnected pieces become debris bodies.
- Repairs happen at the Yard.
- **Fire** is a cellular automaton over voxels and terrain cells:
  - Fuel, heat and compartments shape the spread, which is capped per tick.
  - Water or foam put fires out.
  - Fire spreads between vehicles on contact.
- **Survivors** (NPCs) are state machines: idle → panicking → injured → incapacitated → being carried → treated → delivered. Injuries need specific treatment items.

### 4.10 World (16)
- **Original archipelago**: three climate bands (temperate, cold north, arid east) plus a deep trench. All island and place names are our own.
- The world is a grid of cells: heightmap terrain plus hand-placed sets (harbors, towns, rigs, airstrips).
- Cells stream in through a worker using LOD rings, and a **floating origin** keeps far islands precise.
- Rail is a later phase: spline track with a minimum curve radius and readable switches.

### 4.11 Multiplayer (08, 19)
- **Host-authoritative rooms**: one player's browser runs the simulation. A **Cloudflare Durable Object** acts as the lobby, the relay and the store for saves, using WebSocket Hibernation.
- Snapshots are batched every 50–100 ms using quantised positions and rotations relative to each joint, and delta compression.
- Other players' vehicles are interpolated about 100–160 ms behind. The player's own vehicle gets smoothed corrections.
- Inputs are sent with redundancy.
- Expect ~45 KB/s per client with 16 vehicles. Target 8–16 players.
- Anti-abuse: a spawn complexity budget, rate limits, roles (owner, admin, crew, guest), and kick, ban and audit-log tools.
- Throttle Ridge's `net.js` (owner simulates, others interpolate) is the starting pattern.

### 4.12 Audio & sharing (18)
- **WebAudio** for all sound:
  - Engine sound crossfades loops by RPM and load, or uses a procedural oscillator.
  - Ambience runs on separate buses with an "indoor" muffling factor.
  - Sound is spatial.
- **Vehicle file:**
  - Versioned JSON or binary with a block-name table, gzipped with `CompressionStream`, typically 5–20 KB.
  - It records `schemaVersion` and `physicsVersion`, and migrations are kept forever.
- Saves are stored in IndexedDB locally. A **Gallery** (R2 for files, D1 for metadata) supports upload, thumbnails, ratings, remix and moderation, with Turnstile on uploads.

---

## 5. Editor ("Yard") spec (07, 10)

**Layout:** a parts drawer on the left (category rail, search with filters, favourites), the 3D viewport in the centre, the Inspector on the right, and a **budget bar** along the bottom (mass, cost, centre of mass, power and part count; click any of them to highlight the parts responsible).

**Mode strip:** Build · Wire · Paint · Measure · Test. In Test mode the vehicle runs in a live physics test pool or pad.

**Tools:**

| Tool | Behaviour |
|---|---|
| Place | Ghost preview, snaps to the 0.25 m grid and connection faces, rotates on the 3 axes |
| Erase | Remove a part or selection |
| Select / Box-select | Move, rotate, mirror, copy, paste or delete a selection |
| Paint / Eyedropper | 24-swatch harmonised palette, stored as a palette index per block |
| Symmetry | Mirror on X, Y and Z with a movable plane |
| Section plane | Clip the view to see inside the hull |
| Overlays | Centre of mass, centre of lift, buoyancy, torque flow, fluid and electric networks, sealed compartments (leak finder) |
| Measure | Ruler and grid readouts |
| Validator | Errors and warnings with "show me" jumps (unpowered, unconnected, floating parts, no seat, leaks) |
| Undo / Redo | Command pattern, shown as a scrubbable history |
| Save / Load / Export / Upload | IndexedDB, file, and Gallery |
| Sub-assemblies | Save a selection as a reusable template |

**Controls:**
- Mouse: left to place, right-drag to orbit, middle to pan, wheel to zoom.
- Keyboard: rebindable shortcuts, e.g. R/T/Y rotate, Ctrl+Z/Y undo/redo, Enter test.
- Touch: tap to place, two-finger orbit, pinch to zoom.
- Gamepad: a focus grid plus a radial part picker.

**Data model:** a sparse map from cell to part instance (each instance has a type, an orientation as one of 24 rotations, a palette index and parameters), plus a separate logic graph of port-to-port links. Meshing and collider merging run in a worker and rebuild only dirty chunks.

---

## 6. MVP part list (original names) (11, 12)

| Group | Parts |
|---|---|
| Structure | Plate (cube), Slab (half), Ramp (wedge), Corner, Frame (beam), Pane (glass), Hatch, Door |
| Control | Helm seat (throttle, steer and aux axes + 4 buttons), Switch, Lever, Stick, Keypad |
| Motion | Roller wheel S/M/L, Spring roller S/M/L, Joint (free), Servo joint (target angle), Spinner joint (target speed), Ram (linear) |
| Drive | Burner engine S/M/L, Cell motor, Clutch, Gear stack, Differential, Flywheel |
| Power & fluid | Cell battery S/M/L, Dynamo, Sun plate, Fuel tank S/M/L, Duct (pipe), Pump, Valve, Radiator |
| Thrust & aero | Screw (propeller) S/M, Rudder, Wing section, Flap, Fin, Rotor hub + blades, Fan-jet (intake/core/nozzle) |
| Float | Float block, Ballast tank, Anchor, Chute |
| Logic | AND/OR/NOT, Compare, Add/Mul/Clamp, Hold (memory), Delay, Pulse, Governor (PID), Bundle in/out, Brain chip |
| Sensors | Height, Speed, Heading, Tilt, Position, Depth, Tank level, Range finder, Sonar (later), Radar (later) |
| Display & light | Panel S/L (screen), Dial, Lamp, Floodlight, Beacon, Horn |
| Equipment | Winch/Hook line, Magnet, Dock clamp, Hose/Water cannon, Stretcher mount |

Every part is a data-driven JSON definition: `{id, category, size, mass, cost, material, ports[{name, dir, type, pos}], props[], sim{kind, params}, unlock}`. Numbers start as placeholders and get tuned in playtests.

---

## 7. Art direction — "Chart & Signal" (06)

- The base is **proposal A "Blueprint Noon"**: flat colour with a 2–3 step toon ramp and crisp outlines on block silhouettes, plus hard shadows.
- The palette is a warm off-white sky, deep teal water with animated contour lines, and saturated "safety" primaries (orange, cobalt, signal yellow).
- Paint uses a fixed **24-swatch palette** that always harmonises.
- From proposal **B "Dusk Diorama"**, night takes over **emissive lights plus bloom**, so vehicle lights become the night-time signature. There are no swarms of real point lights.
- Rendering tricks:
  - Per-vertex voxel AO baked when meshing.
  - Triplanar procedural terrain colouring.
  - A sum-of-sines/Gerstner water shader that matches the CPU buoyancy function exactly.
  - Fog themed by weather.
- Quality tiers (shadow map, pixel ratio, bloom, water detail) with an automatic governor. This reuses Throttle Ridge's approach: vertex colours, theme table, canvas textures.

## 8. UI direction — "Survey sheet" (07)

- The look is paper-white panels with ink-blue linework, safety-orange for active elements, monospace numerals and notched square corners. There is also a "night watch" dark theme in navy and amber.
- **Colour is never the only signal:** each wire type also has a dash pattern and a glyph.
- Screen flow: Harbor (hub: Worlds, Fleet, Contracts, Gallery, Settings) → World → Yard.
- **HUD** in four zones:
  - bottom-left: vitals rings
  - bottom-centre: the item in hand plus a radial menu
  - top-centre: toasts
  - right edge: the contract tracker
- Interaction prompts appear next to the object being targeted.
- **Map (M):** a chart with a layers drawer, waypoints and measuring. The same chart component is reused on in-vehicle screens.
- **Notifications** come in three tiers (toast, banner, alarm) and are all kept in a history drawer.
- **Accessibility:** every control rebindable, UI scale 75–200%, colour-blind-safe palettes, reduced motion, and gamepad and touch support throughout.
- **Implementation:** a DOM/CSS overlay on top of the WebGL canvas. In-world screens are render-to-texture.

---

## 9. Technical architecture (19)

| Layer | Choice |
|---|---|
| Language/build | TypeScript + Vite monorepo (`shared/`, `client/`, `worker/`), plus an optional single-file esbuild "offline edition" |
| Rendering | three.js on WebGLRenderer, with WebGPU/TSL later. Merged vehicle meshes plus `InstancedMesh` |
| Physics | Rapier (`@dimforge/rapier3d-compat`) in a Web Worker behind `PhysicsBackend`, with Jolt as the fallback |
| Custom sim | `shared/sim-core`: pure TypeScript with no DOM, unit-tested in vitest. Covers the logic VM, buoyancy, aero, engines and the wave function |
| Worker transport | `postMessage` with transferable buffers. No SharedArrayBuffer, so COOP/COEP headers are not needed for the MVP |
| Multiplayer | Cloudflare Worker + Durable Object rooms (WebSocket Hibernation), host-authoritative, binary protocol |
| Scripting | wasmoon (Lua) or QuickJS-wasm in a Worker, with a watchdog |
| Storage | IndexedDB locally; R2 + D1 for the Gallery |
| Hosting | Cloudflare Workers static assets (the user's existing Cloudflare account) |

**Frame budget on desktop (60 fps):**

| Work | Desktop budget | Phone budget |
|---|---|---|
| Physics step (worker) | ≤4 ms | ≤8 ms |
| Custom forces (worker) | ≤1.5 ms | ≤3 ms |
| Logic and scripts (worker) | ≤1 ms | ≤2 ms |
| Main-thread JS | ≤4 ms | ≤8 ms |
| GPU frame | ≤10 ms | ≤20 ms |

On a phone, the simulation can drop to 30 Hz.

Module tree: see 19 §10.

---

## 10. Roadmap

| Phase | Scope | Exit criterion |
|---|---|---|
| **0 Spikes** | Vite+TS skeleton; Rapier in a worker; snapshot pipeline; greedy mesher; three.js scene; benchmark of 20 jointed vehicles | 60 fps proof on desktop; Rapier vs Jolt decision written up |
| **1 Yard + land** | Block editor (place, erase, paint, mirror, undo, validator, budget bar); structure, wheel, engine, seat, fuel and battery parts; vehicle assembly; raycast wheels; drivetrain with differential; heightmap island; chase and first-person cameras; keyboard, gamepad and touch; IndexedDB save and file export | Build a car, drive it on hills, save and reload it |
| **2 Water** | Gerstner ocean (shared shader/CPU); buoyancy points; propeller, rudder and drag; basic flooding; floating origin; day/night and sky | Build a boat and ride out a rising sea state |
| **3 Air** | Aero surfaces with stall; control surfaces; propellers and fan-jets; rotors with collective and governor; joints; logic graph v1; damage and debris | Fly a plane and a helicopter |
| **4 Multiplayer** | Durable Object rooms, lobby, binary protocol, interpolation, roles, chat, co-op | 8–16 players on one ocean |
| **5 Career** | Contracts (delivery, rescue, fire), economy, tech milestones, NPC survivors, weather and disasters, Brain chip scripting and screens | A full contract loop is playable |
| **6 Gallery & polish** | R2/D1 sharing, moderation, WebGPU ocean, PWA, localization | Public launch on the site |

## 11. Risks

1. **Joint stability with large mass ratios.** Mitigate with substeps, by merging rigid groups, and by benchmarking Jolt.
2. **Mobile performance.** Mitigate with the quality governor, a 30 Hz simulation and simulation LOD.
3. **Host authority and cheating.** Acceptable for co-op; add validation later.
4. **Durable Object costs.** Mitigate by batching frames, using hibernation and capping rates.
5. **Scope creep.** The scope is enormous, so ship each phase as a playable build.
6. **Originality drift.** Review names, art and UI against the rules at the top of this brief.

## 12. Open questions for in-game verification or playtesting

These came up across the reports:
- Part masses and costs, and exact tyre and wing coefficients.
- Disaster rates and wave units.
- Whether the economy's payout curve feels right.
- Microcontroller limits.

None of these block development. **Tune by feel.**

---

## Index of detailed reports

| # | Report |
|---|---|
| 01 | [Core physics](01-core-physics.md) |
| 02 | [Land vehicles](02-land-vehicles.md) |
| 03 | [Aircraft & helicopters](03-aircraft-helicopters.md) |
| 04 | [Weather & disasters](04-weather-disasters.md) |
| 05 | [Player character](05-player-character.md) |
| 06 | [Art & rendering](06-art-rendering.md) |
| 07 | [UI, HUD & overlay](07-ui-hud-overlay.md) |
| 08 | [Multiplayer](08-multiplayer.md) |
| 09 | [Game mechanics & modes](09-game-mechanics-modes.md) |
| 10 | [Editor tools & buttons](10-editor-tools-buttons.md) |
| 11 | [Parts: structural & mechanical](11-parts-catalogue-structural-mechanical.md) |
| 12 | [Parts: electrical, logic & sensors](12-parts-catalogue-electrical-logic-sensors.md) |
| 13 | [Logic, microcontrollers & scripting](13-logic-microcontrollers-lua.md) |
| 14 | [Engines, fluids & electrics](14-engines-fluids-electrical.md) |
| 15 | [Ships, submarines & ocean](15-ships-submarines-ocean.md) |
| 16 | [World, map & trains](16-world-map-trains.md) |
| 17 | [Damage, fire, NPCs & rescue](17-damage-fire-npcs-rescue.md) |
| 18 | [Audio, modding & workshop](18-audio-modding-workshop.md) |
| 19 | [Browser tech stack](19-browser-tech-stack.md) |
