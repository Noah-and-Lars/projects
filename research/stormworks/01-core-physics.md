# Stormworks: Core Physics Simulation (genre reference)

Confidence legend: [V] verified in a fetched/search-returned source; [C] community claim; [B] background knowledge or inference, not verified this session. Web fetches of the fandom wiki (HTTP 402) and SteamDB (403) were blocked, so much below rests on search snippets. Treat all numbers as leads to confirm in-game.

## Summary
- Vehicles are voxel grids (basic block = 0.25 m [V, JP wiki]) that the game converts into a much smaller set of convex physics shapes using in-house tech; devs describe it as lossless [V, patch notes via search]. Engine origin is unconfirmed: one workshop post guesses "Havok / Bullet" [C]; the in-house voxel-to-convex-hull step is real. [B] The game is believed to be built on a Bullet-style rigid body solver, but no dev statement was found.
- Tick rate: community says "60 ticks per in-game second", with game time slowing under load (so physics is effectively fixed-step and lag = slow motion). A user measured 18,750 ticks in 5 min = 62.5/s with a microcontroller, and argued ticks are tied to the physics update [C]. Unresolved; plan for ~60-62.5 Hz fixed step.
- Mass is per-block (basic block mass value 1) [V, JP wiki]; a forum claim puts 1 mass unit near 10 kg, water 1000 L = 100 units [C]. Standard 1x1x1 block of mass 1 floats [C].
- Multi-body: separate physics bodies joined by pivots/hinges/sliders/rotors/connectors/ropes/winches/magnets [B: well-known features]; each moving sub-assembly is its own rigid body.
- Performance control: sleeping (patch notes: parked or sea-floor vehicles have very low cost; later "more objects can sleep") [V], and the Physics Flooder block, which floods sealed interior volumes with physics at zero added mass; devs claim 20%+ physics improvement on most vehicles [V, patch notes]. F2 debug view colors each physics shape [V].
- Known problems: wheels stuck underground at high speed impact causing lock + jitter [C, reddit], collision-engine bugs fixed across patches (v0.10.20 "physics engine collision issue") [V], large-hull lag, dock lag from buoyancy + collision pre-calc [C].

## Detailed findings
### Voxel representation
- Grid unit 0.25 m per basic block [V]. Parts (engines, wings, etc.) occupy multi-voxel footprints [B].
- Voxels -> convex shapes: "hundreds of thousands of voxels into a much smaller number of convex physics shapes", lossless, internally developed [V]. Debug view (F2) shows each shape in a distinct color [V], so shape count is observable by players.
- Physics Flooder: marks interior empty cells so the hull-merging treats the enclosed void as solid collision, reducing shape count; adds no mass [V]. Implication: interior (hollow) volume is what makes hulls expensive, because hollow spaces break convexity.

### Mass / CoM / inertia
- Official wiki CoM page is an empty stub [V]. Standard approach, almost certainly used: m = sum(m_i); com = sum(m_i r_i)/m; inertia tensor = sum of per-voxel box inertia + parallel axis term [B].
- Blocks differ in mass (basic block 1; heavier materials/parts higher) [V/B]. Fluid tanks add mass by contents [C].
### Tick rate / time
- Nominal 60 ticks/s of game time; game slows when it can't keep up, so ticks per game second stay constant [C, Steam thread]. Counter-measurement 62.5/s [C]. Devs added benchmarks reporting FPS and tick rate [V].
- Design consequence: lockstep determinism of logic (microcontrollers run per tick) tied to physics step.
### Joints and multi-body
- Features known [B]: pivots, hinges, sliders, robotic pivots with motor control (target angle/speed, composite-driven), connectors/couplers, rope hooks/winches, magnets/electromagnets. Each connected group is separate body; shape rebuild for moving parts is costlier (players avoid large rotating assemblies) [B].
### Collision / friction / drag / buoyancy
- Not documented in sources found. [B] Per-block buoyancy for submerged voxels, drag per exposed face, wing lift from wing blocks. Use standard lift/drag formulas: F = 1/2 rho v^2 A C.
### LOD / sleeping
- Sleeping vehicles cheap [V]; engine allows more sleepers over time [V]. Streaming of world tiles/zones around the player [B]. Debris/AI despawn rules anecdotal [C].
### Bugs
- Wheel stuck under terrain, jitter [C]. Large hull lag [C]. Kraken: in-game sea creature, not a physics "kraken" glitch; classic physics-explosion kraken (KSP term) was not documented for Stormworks here, but self-intersecting joints are the typical cause [B].

## Player-facing feel
Fun: everything built from your own blocks behaves plausibly; time slows rather than breaking. Frustrating: hull lag, interior-volume cost, joint wobble, wheel clipping, opaque physics shape cost (needs F2 debugging).

## Known problems to avoid
1. Unbounded convex-shape counts from hollow hulls: give builders a flood-fill/"solid interior" tool or auto-fill sealed volumes.
2. Hidden cost: show a physics-cost meter.
3. Variable time step coupled to logic: use fixed step with slow-motion degradation.
4. Wheel tunneling: use CCD/raycast suspension.
5. Joint instability with large mass ratios.

## Implementation notes for our original game
- Data: sparse voxel map (hash of chunk 8x8x8) per body at 0.25 m; body = {voxels, mass props, shape list, joints}.
- Mass props: accumulate per voxel; cache; update incrementally on edit (running sums of m, m*r, and second moments I_ij = sum m (|r|^2 delta - r r^T) + own box inertia m/12*(...)).
- Collision: greedy-merge voxels into convex boxes (or merge into convex hulls via quickhull when coplanar), maintain per-chunk shapes; interior flooding option excludes hidden voxels (cells whose six neighbours are solid never emit faces).
- Engine suggestions: Bullet (btCompoundShape of boxes/convex hulls), Jolt Physics (strong compound shapes, constraints, sleeping, deterministic-ish), or Rapier. Fixed step 60 Hz, 4-8 solver iterations, substeps for fast bodies.
- Joints: hinge/slider/6DOF constraints with motors; separate bodies per assembly; limit joint-chain depth; magnet = distance-limited attractor constraint; rope = chain of distance constraints or Jolt rope.
- Aero: per-exposed-face drag F = -0.5 rho Cd A |v|v applied at face centre; wing blocks: lift = 0.5 rho v^2 A Cl(alpha) perpendicular to flow. Buoyancy: per submerged voxel F = rho_w g V_voxel (V = 0.015625 m^3) applied at voxel centre; sample by sub-grid, with damping.
- Sleep: per-body velocity thresholds, island sleeping, distance-based freeze of unattended bodies, low-rate tick for far bodies.
- Units: 1 voxel 0.25 m, g = 9.81 (not verified for Stormworks), mass units chosen so a voxel of "light material" = 1.

## Open questions
- Actual engine (Bullet vs custom), exact tick (60 vs 62.5), gravity value, mass-unit-to-kg, part/voxel limits per vehicle, how CoM/inertia is computed, aero model details, joint solver details. Need in-game testing or dev interviews.

## Sources
- https://steamcommunity.com/app/573090/discussions/0/3264459260611904917 (tick rate thread)
- https://steamdb.info/patchnotes/6630071 , https://steamdb.info/patchnotes/6123828 , https://steamdb.info/patchnotes/5127004 (patch notes: physics flooder, F2 view, sleeping)
- https://wikiwiki.jp/sbarjp/BLOCKS (0.25 m block, mass 1, Physics Flooder)
- https://stormworks.fandom.com/wiki/Gameplay/Mechanics/Center_of_Mass (stub)
- https://stormworks.fandom.com/wiki/V1.1.23-24 (patch notes)
- https://steamcommunity.com/workshop/filedetails/discussion/2777757262/6126615404779309055 (engine guess)
- https://pol1.lr.ggtyler.dev/r/Stormworks/comments/1i18zbv/bug_wheels_can_get_stuck_underground_this_has (wheel bug mirror)
