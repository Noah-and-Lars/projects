# Decisions & guesses

- **Game name / setting**: "Wrecking Shift" — original name, setting and content (see README).
- **Everything is a voxel body.** Static world pieces (ground tiles, buildings) and dynamic debris/props/vehicles share one
  `VoxelBody` type (dense `Uint8Array` grid + Rapier rigid body + native Rapier `Voxels` collider). Verified by experiment in
  Node: 65k-voxel collider builds in ~30 ms, `setVoxel` ≈ 0.7 µs, 30 voxel bodies settle and sleep, raycasts/shape casts work.
- **Palette byte = material(5 bits) << 3 | shade(3 bits)**; shades 0–4 colour variation, 5 spray paint, 6–7 scorched.
  Keeps the material when a voxel is scorched/painted without a second array.
- **Mass properties are computed by us** (collider density 0 + `setAdditionalMassProperties`): Rapier does not update mass
  after `setVoxel` (checked experimentally), and per-material densities are needed anyway.
- **Connectivity** = interleaved multi-seed flood fill (6-neighbourhood) with union-find, started only from voxels next to
  the edit; static bodies are anchored by their bottom voxel layer. Downward-biased DFS finds the ground quickly.
- **Fracture pattern**: explosions/sledge delete the inner part of the radius and cut a staggered-block crack pattern in an
  outer shell so loose chunks (rigid bodies) are produced instead of only a clean spherical hole. Own design.
- **Player** uses Rapier's kinematic character controller with a *cylinder* (experiment: capsule fails to auto-step 0.2 m
  voxel stairs, cylinder climbs them).
- **Raycasts for tools** use our own DDA through voxel grids (need voxel coords + material, and determinism).

## Audio (src/audio, src/game/audioModule.ts)
- **Guesses (no spec in the research docs):** size-class thresholds (carve: <40 / <400 / more voxels; impact force: <15k / <60k /
  more; sim reports impacts from 4000), 0.75 m footstep length, 6 m indoor probe range, 32-voice cap, per-category token buckets
  (see `CATEGORY_LIMITS` in engine.ts). All are tunables, not measured against playtests.
- **Voice limiter clock** is wall-clock (`performance.now`), not `ctx.currentTime`, so a suspended/never-running context
  cannot make the limiter fill up forever.
- **Context creation** only on a user gesture (pointerdown/mousedown/keydown/touchstart/click) or `game.ext.audio.ensure()`.
- **Music** is rule-based (hash-randomised sparse arpeggio over a 4-chord minor progression; heist cue = bass pulse + noise
  percussion + stabs + noise riser driven by `tension`). Chord choices are our own, no existing melody is used.
- **Loops** (fire, engine, torch, heli, alarm, ambient) are refreshed by TTL (`engine.touchLoop`) instead of explicit stop calls,
  so a module that stops sending data silences them within ~0.5 s.
- **Impact damage**: Rapier contact manifolds for voxel shapes give no usable world contact points/impulses (checked
  experimentally), so impulse = contact-force-event force × dt, and the contact point is estimated by a voxel raycast from
  the lighter body's centre of mass along the force direction. Damage only when the velocity change exceeds 2.2 m/s, so
  resting stacks never grind themselves down. Radii scale with the cube root of the impact energy (tuned by feel).
- **Structural crush check** (our answer to "buildings stand on one voxel"): per y-layer of a static body, weight above
  vs. summed compressive capacity of the layer's voxels (per-material strength in MPa, gameplay-tuned). An overloaded
  layer and a small band around it are pulverised; connectivity then drops the structure and impact damage breaks it.
  Cheap (per-layer sums maintained incrementally) and predictable for players: thick supports hold, slivers do not.
- **Terrain** = heightmap voxelised into 25.6 m tiles: 1 surface voxel + 0.5 m diggable soil + unbreakable bedrock shell,
  hollow underneath with a flat underside per 16×16 block (keeps Rapier voxel count and mesh quads low). Terrain tiles
  never split or fracture. Measured: 36 tiles (153 m square) build in ~7 s in Node on the busy container.
- **Water** is a plane at `level.waterLevel`; buoyancy by submerged fraction of an equivalent box, drag, splashes.
  Player swims; 12 s of breath.
- **Explosive material**: breaking voxels of the `explosive` material queues one delayed explosion per container
  (chain reactions); loose crumbs under 12 voxels fizzle.
- **Fire (sim/fire.ts)** — own design, tuned by experiment (no reference numbers are public; research only says "count cap
  + spread rate per tick"). Guesses and why:
  - 10 Hz fire updates staggered by slot (`slot % 6 == tick % 6`), fuel = `burnTime` fire ticks × 0.75–1.25 (wood ≈ 9 s).
  - Heat model: neighbour heat += 0.2 × intensity × distance weight (face 1 / edge 0.5 / corner 0.3) × up-bias (up ×3,
    side ×1, down ×0.3) × flammability; half-life 1.5 s; ignition at 1.0 (surface voxels) or 2.5 (no air face).
    Result: a 3 × 2.5 m wooden wall is engulfed in ~6–7 s and burnt out in ~20 s; a test-yard tree crowns in ~5 s, falls ~13 s.
  - Spread budget per tick = 4 + 0.3 % of the active fires (bigger fires have longer fronts); cap 1200 (reports for the
    genre reference range from 100 to 4096; 1200 fits the < 1 ms budget easily, measured ~0.4 ms/tick).
  - Grass gets ×0.2 neighbour spread (otherwise every lawn becomes an endless wildfire) and burns down to scorched dirt.
  - 40 % of burnt wood / crate / rubber turns to char that crumbles 4–11 s later (black skeleton look, still collapses).
  - Interior (no air face) voxels need 2.5× heat: fire eats surfaces first, so thick beams last longer than planks.
  - Player fire damage 0.3 health/s at the flame (within 0.8 m), scaled by distance and fire count; checked at 10 Hz by
    scanning cached fire positions (1200 distance checks are cheaper than maintaining a spatial hash).
- **Fire fx**: smoke sprites are unlit; FireModule estimates the scene light level from the scene's standard three.js
  lights every 30 frames (works with whatever light rig the renderer ends up with) and the smoke vertex shader adds warm
  light from the fire lights, so smoke is dark at night and lit orange from below. The fire lights are a fixed pool (the
  count only changes via setQuality) so lit shaders are not recompiled when fires start or stop.
## Player tools (src/sim/tools, src/sim/grab.ts)
- **Ammo** (base, `maxAmmo` raisable): pistol 18, shotgun 12, plank 8, cable 6, pipe bomb 6, bomb 6, rocket 6, nitro 4,
  blowtorch 20 s of fuel stored as 1200 ticks (`ammoLabel` shows "12.3s"); sledge / spray / extinguisher unlimited.
- **Carve radii** (soft, medium, hard): sledge 0.42/0/0, pistol 0.2/0.12/0, shotgun pellet 0.22/0.15/0 shrinking to 45 % at
  20 m; explosions via `sim.explode` (pipe 1.0, rocket 1.3, bomb 1.6, nitro 1.6 from the material). Values from the task
  brief; the research's community numbers (gun hole 0.35–0.55 m) were not used because brick is "medium" here.
- **Explosive tool bodies get a fake light mass** (pipe 2.5 kg, bomb 4 kg, nitro 3 kg) via `setAdditionalMassProperties`:
  a 3×3×6-voxel steel pipe would weigh ~90 kg and bulldoze crates. Breaking any voxel of a pipe bomb / bomb sets it off.
- **Blowtorch** heats voxels within 0.15 m of the *whole flame ray* (eye+0.3 m .. hit+5 cm): once the centre melts the ray
  passes through and keeps widening the hole, so it cuts lines while the view moves. Melt thresholds (ticks of centre
  heat, guesses): foliage 4, plastic 8, wood 10, sheet metal 16, painted metal 18 (~0.3–0.5 s for a 1-voxel sheet).
  Brick / plaster / concrete / dirt never melt, they only scorch. Calls `fire.heat(p, 0.06)` per tick (the fire CA's doc
  says 0.08/tick lights wood in ~0.4 s).
- **Planks** are 3 voxels wide × 1 thick (a 4 m plank weighs ~66 kg; the sim test shows it holding a ~120 kg crate and the
  80 kg player between two static pillars with < 10 cm sag). Ends overlap 5 cm into the surfaces; joints have contacts
  disabled. The glue tears if the joint points drift > 0.35 m apart (guess), or when either end voxel is destroyed. When
  a plank is cut, glued ends that went with the cut-off piece are re-jointed to it (`sim.onSplit`).
- **Cable** = Rapier rope joint (pure max-distance, no spring). Bullets passing within 6 cm of a rope cut it (shot
  listeners registered per Sim in gun.ts). Both points static, or both on the same body, is rejected without using ammo.
- **Nitro** also goes off on a hard knock (> 6 m/s velocity change in one tick) once it has come loose. Guess.
- **Grab**: mass limit 250 kg (the reference's value is unconfirmed); heavier bodies only get a capped 2.6 kN pull. The
  hold spring sets linvel toward the hold point (gain 14/s, max 14 m/s), angular velocity ×0.8 per tick. Throw Δv =
  clamp(900 / mass, 3.5, 12) m/s. The body is dropped when it is > 2.2 m from the hold point. Tool bodies are tagged
  `nograb`; vehicles cannot be grabbed.
- **Mouse wheel** cycles tools when nothing is held. With 12 tools only the first ten have digit keys (1–0); Q / wheel
  reach the rest.
- View-model tool-switch animation and the muzzle flash run on sim time, not frame time, so the rarely rendered headless
  test frames show the settled pose.
- **Optional tools**: rifle (6 rounds, range 120 m, carve 0.17/0.12/0, passes through up to 4 soft/medium surfaces, hard
  material stops it) and leaf blower (unlimited, 6 m cone, push 30 m/s² scaled by min(1, 25 kg / mass), mostly horizontal).
## Heist framework / HUD / progression (mission worktree)
- **Mission data lives in body tags + level markers** (`target:<id>`, `destroy:<id>`, `alarm:<id>`, `valuable:<amount>`,
  `escape`; markers `escape`, `heli_start`; optional `LevelInfo.zones`). Mission-specific props are spawned by
  `MissionDef.setup(sim, level)` so a level stays clean for sandbox and other missions. Contract: header of `src/sim/mission.ts`.
- **Target tracking uses `body.center()` (grid box centre), not `rb.worldCom()`**: experiment showed `worldCom()` is not
  valid before the first physics step, which made freshly spawned targets look "moved" and tripped alarms.
- **Alarm box "comes loose"** = all solid probe points (5 per face, half a voxel outside the box, recorded at mission start)
  are empty; checked every 10 ticks. Static alarm boxes do not fall when their wall goes (no static->dynamic API) - guess:
  the alarm firing is what matters for gameplay.
- **Demolition sensor** counts voxels removed via `sim.onRemoved` on non-debris bodies before the alarm; separation by
  splitting is not counted (only `removeVoxel` reports).
- **Scoring (own numbers, guessed)**: required objective 100, optional 50 (overridable per objective), time bonus 2/s left on
  the alarm clock (full clock if the alarm never tripped; 0 for missions without any alarm source), optional client bonus.
  Cash = valuables + client fee, only paid on success. Rank = sum of per-mission best scores. Thresholds 0..3600 in
  `RANKS` (src/game/progress.ts) - guessed for ~2 missions per rank; tune once real missions exist.
- **Upgrades** only raise max ammo (as requested); base ammo is read from a pristine `createTools()` because
  `Game.loadLevel` carries `maxAmmo` over from the previous belt (applying `base + bonus` avoids compounding).
- **Free play** (`?level=` / `?test=1` without `?mission=`) leaves the belt untouched so existing tests and tool work are
  unaffected; progression locks apply only inside missions; sandbox unlocks everything + infinite ammo.
- **Graphics quality** is only published (`game.ext.settings.quality`); the renderer owner decides what it changes.
- **Head-bob** uses an additive `game.viewBob {y, roll}` (2-line change in `Game.draw`) instead of `cameraOverride`, so it
  never fights vehicles / map for the camera.
- **Helicopter** is cosmetic (no real spotlight light source - a translucent cone mesh, to avoid shader recompiles and
  per-pixel cost); flies from `heli_start` toward 14 m above the escape point during the last 15 s.
- **End screens** open 45 ticks after success/fail so the moment registers (and so e2e can drive it with `step`).
- **Escape while driving**: `MissionInput.vehicleBody` (= `game.ext.vehicles.current.body`) tagged `escape` ends the job
  anywhere (the van is the escape); deliver zones relative to the van (`{ bodyTag: 'escape', offset, half }`) are
  axis-aligned and ignore the van's rotation (guess: good enough for a flat-bed).
- **Vehicles** (`src/sim/vehicle.ts`): one dynamic voxel body + Rapier `DynamicRayCastVehicleController`. Chassis frame: +Z
  forward, +X across (x=0 = right side). The forward axis is set with the oddly named setter `setIndexForwardAxis = 2`
  (checked in Node: the default forward axis is X). Wheel rotation is positive when rolling forward (measured). Brake = impulse per tick.
- **Vehicle mass** is the voxel mass scaled to a target (`body.massScale`, a new additive field), because 0.1 m sheet-metal panels
  would make a car weigh ~3 t. The targets are guesses, roughly real-world: hatchback 1150 kg, van 2300 kg, loader 7500 kg.
- **Ramming** is a guess tuned by Node experiments. Severity = approach speed × cbrt(mass/1500), plus a push bonus for the loader.
  The carve radius per hardness is clamp((sev − thr)·k, 0, rmax), with thr soft/medium/hard = 2 / 4.5 / 26. The whole vehicle
  cross-section is projected onto the obstacle plane and carved. Only the rammed body is carved; neighbours (the ground) are
  shielded, so corners and the belly never snag. The vehicle loses 0.25 × removed mass × speed of momentum (capped at 30 % per tick).
- **Vehicle health** = 0.7 × vital (steel frame + engine-bay voxels) + 0.3 × all voxels − wear (blast waves, hard crashes).
  The vehicle dies below 0.12 health or when less than 25 % of the engine bay is left. It smokes below 0.3 health or below 55 %
  engine bay. Own design.
- **First-person vehicle camera** is a hood camera in front of the windshield, because glass voxels currently render opaque.
- `tests/unit/mesher.test.ts > is fast enough` (40 ms threshold) fails intermittently on this loaded shared container,
  even without the vehicle code. Left unchanged.
## Rendering / look (lighting upgrade)
- **Hybrid lighting** as recommended by research file 08: rasterized greedy meshes + a world occupancy volume traced in the
  fragment shader (sun shadow, AO, lamp shadows). Dynamic / rotated bodies are never stamped into the volume (also not when
  they sleep: un-stamping robustly on wake-up was not worth the risk); they use baked vertex AO and a small camera-following
  shadow map that only non-volume objects render into.
- **Glass and lamp voxels are not in the volume**: windows let the sun in, lamp fixtures do not shadow their own light.
- **Buried static faces are discarded in the shader** (front cell solid in the volume): abutting bodies (ground tiles) have
  hidden side walls that otherwise z-fight along the seam as dark specks.
- **T-junction cracks**: a fixed 1 mm quad overlap is not enough at distance (rasterizers snap vertices to a sub-pixel grid).
  Quads are overlapped only along edges where the surface continues (corner code in `aux.z`), by 1 mm + 0.15 % of the view
  distance in the vertex shader. Convex edges stay exact (no fins). Measured on SwiftShader: 33 -> 0 background specks.
  Guess: 0.15 % also suffices for real GPUs (8 sub-pixel bits; SwiftShader has fewer) — not verifiable here.
- **Horizontal faces at the grid boundary are treated as "surface continues"** (ground tiles lie side by side); vertical
  faces are not. A cliff crossing a tile seam can therefore still show a rare crack pixel.
- **Soft sun (high tier)** = 4 rays in a 0.012 rad cone with a rotation keyed on world-space quarter-voxel cells, so the
  penumbra dither is stable under camera motion; no temporal accumulation (could not be validated for stability here).
- **Tone mapping** = AgX (three's implementation) in our own composite pass, albedo desaturated to 72 % in the material,
  ambient cool / key light warm per preset. Reason: the previous ACES + raw palette looked flat and over-saturated.
- **Default time of day** for levels without `sky` is `sunset`: the level's sun azimuth with the preset's 16 degree elevation.
  A level that sets `sky` keeps its exact `sunDir`.
- **Other systems' materials are adopted automatically**: every ~20 frames the scene is scanned and lit three materials
  (Lambert / Phong / Standard / Toon) get the traced sun + cone AO patch (`renderer.patchMaterial`), so props, particles and
  view models are not sunlit inside dark rooms. Set `renderer.adoptForeignMaterials = false` to opt out.
- **Settings hook is a guess**: `src/render/lookModule.ts` reads `game.ext.settings.quality` / `.resolutionScale` and
  subscribes through `game.ext.settings.onChange(cb)` if that function exists; the UI can also just call
  `renderer.setQuality()` / `setResolutionScale()` directly. URL parameters `?quality=&tod=&res=` override for testing.
- **Volume memory budget** 96 MiB of bit volume (guess for broad GPU compatibility; research found no hard number).

## Levels: Kestrel Ridge (`ridge`) and Brackwater Works (`works`)
- **Chimney grid is 44 x 302 x 44 voxels**, taller than the 256-per-axis guideline. The brief asks for a free-standing chimney of
  30 m or more, and a second body stacked on top would float when the lower one is cut (static bodies are anchored only by
  their own bottom layer). Checked in the code: chunk keys allow 16 chunks (512 voxels) in x and y, and neither the mesher nor
  the Rapier voxel colliders have a 256 limit. The unit test fells the chimney with a ring of charges. Width and depth stay
  at 256 or less (tested).
- **Spawn points are lifted 0.1 m** above the surface. An experiment (scripts/dbg-level.test.ts) showed that a `Player` created
  with its feet exactly on a voxel surface (y = 1.6 on flat terrain) never moves. Created 0.1 m higher, it drops and walks
  normally.
- **Floors sit 0.1 m above grade** (body at ground - 0.2 with a 3-voxel foundation), the same as `placeBuilding`. Flush floors
  z-fight with the terrain's top voxel: grass showed through the basement and gallery floors in screenshots.
- **Quad budget**: the greedy mesher emits each face that has an AO gradient as a single-voxel quad, so 1:2 voxel staircase
  roofs and thin cylinders are expensive. Roofs are now terraced (rise 4-6 voxels every 8-12), and plank floors stripe along
  one axis only. Silos, tanks and the chimney are still the most expensive bodies (about 100k, 15k and 38k quads). Merging
  faces whose AO gradient is the same along the merge direction in `mesher.ts` would fix this for every level (not my file).
- **Guesses**:
  - Lake and canal water use the single global water plane (level 0). The gallery pool on the 6.8 m terrace is therefore
    drained, because a second water level does not exist.
  - Road grades are 13-17 % (there is no vehicle spec yet).
  - Ridge uses 4x4 tiles and Works uses 5x4 tiles to stay under the 16 M voxel budget. Terrain alone is about 0.55-0.65 M
    voxels per tile.
- **kit.ts fixes** (each one was an island that turned into debris on the first edit):
  - `pine`: the trunk now reaches the top tier. The upper tiers were joined only through the trunk and floated.
  - `tree`, `pine` and `rock` now drop noise islands that are not connected to the bottom layer (`dropFloating` in kit2.ts).
  - Fuel `tank`: the explosive core now starts on the bottom plate. It used to float 1 voxel above it.

## Challenges, photo mode, time/weather presets, map edges
- **Mode names / rules are original**: "Rubble Rush" (timed wrecking score) and "Snatch Sprint" (grab and clock out).
  Rules live in `src/sim/challenge.ts` as a small state machine of their own, not as generated `MissionDef`s. The mission
  clock only starts on an alarm and mission scoring is objective-based, so generated missions would need special cases.
- **Rubble Rush stars** `[4000, 10000, 20000]` (big maps), `[2500, 6000, 12000]` (testyard). This is a guess based on a Node
  experiment (12 explosions per size against buildings next to markers). Counted voxels per blast: about 300 (pipe bomb,
  size 1.0), 750 (rocket, 1.3) and 600-730 (bomb, 1.6) on harbor/works; 650-2100 on the denser testyard. A 90 s run fits
  roughly 20-30 charges, so 3 stars needs a busy, well-aimed run.
- **Rubble ammo** = 3x the base max ammo (upgrades ignored, all tools unlocked, finite ammo). Snatch gets 2x.
  The score counts every `sim.onRemoved` on `world` / `prop` bodies, including the 500 warm-up voxels and voxels that
  burn away. Pieces of a collapse that turn into debris only count when they are broken directly (the spec says no debris).
- **Snatch Sprint scoring** (my design): 100 per crate + 5 per whole second left when you clock out. You clock out with E
  at the escape marker, or automatically when no crates are left and you stand there. If the clock runs out you get half
  the crate points and no time bonus. Dying = 0. Stars `[300, 700, 1200]`.
- **Crate spots**: candidates sit on rings of 0/4/8/12 m around every marker except `escape`/`heli_start`. Each one is
  dropped to the floor from 1.6 m above the marker height and kept only if it lands on the same storey (within 1.2 m of
  the marker height), the start point is not inside solid, there is 1 m of head room, no drop-off within 0.3 m, and it is
  above water. A 6 m grid at spawn height is the fallback (testyard has no usable markers). Spots are picked greedily from a
  seeded shuffle with 8 m horizontal spacing. Spacing drops to 5.3 / 3.2 m only when there are not enough candidates.
  Spots stay 6 m away from the escape point. Crates are small dynamic props, so they can be knocked around or blown into
  the water, which just makes them harder to get.
- **Quicksave is disabled during challenges** (score attack; a restore would also drop the challenge state).
- **Mission time of day was never applied**: MissionModule wrote `level.sky` after `renderer.setLevel` had already read
  it. `applyLook()` now calls `renderer.setTimeOfDay` and `game.ext.weather.set` for `MissionDef.timeOfDay` / `weather`.
- **Time/weather choice** is kept in memory only (not saved) and defaults to the map's own look ("Map"). Sunset and
  overcast are labelled "Dusk" and "Grey" so the segmented buttons stay short at 640 px.
- **Flashlight**: SpotLight on the camera, intensity 22, range 26 m, decay 1.6, no shadow map. It is created on the
  first toggle and then stays in the scene at intensity 0 when off, because changing the number of lights recompiles
  every material (three.js light-count defines). It gets no traced shadows, so it lights the far side of thin walls a bit.
- **Photo mode** raises the quality tier from medium to high (never low to high, which rebuilds the occupancy volumes) and
  sets the resolution scale to 1; both are restored on exit. Losing pointer lock in photo mode exits it, and the UI then
  shows the pause menu as usual. Without pointer lock you look around by dragging with a mouse button or with the arrow keys.
- **Map edge**: fog far = min(preset far, 2 x half-extent + 130 m). The backdrop ring reaches 235 m beyond the bounds, so
  its rim is always fogged out. Edge heights come from downward rays on `terrain`-tagged bodies (any static body when a
  level has no terrain). The soft boundary holds the player 1 m inside the bounds (teleport that keeps vertical speed) and
  shows "Turn back" within 4 m. A vehicle being driven loses its outward velocity and gets a 1.5 m/s push back.
## Mission playthroughs and Kestrel Ridge roads (QA pass)
Scripted, deterministic playthroughs of all 11 big-map missions live in `tests/unit/playthrough.test.ts` (harness:
`tests/unit/playHarness.ts`), the road test in `tests/unit/ridgeRoads.test.ts`, one browser run per big map in
`tests/e2e/playthrough.mjs`. Every change below was made because a run showed the mission or road could not be done.
- **Career score of a "typical" player** (guess, needed to decide which tools a mission may assume): the player has
  finished exactly the missions in the `unlockAfter` closure plus Housewarming, each with its required objectives, the
  client bonus and 10 s left on the clock (missions with an alarm). No optional objectives, no cash upgrades. This is
  deliberately conservative: real careers are higher. `careerScore()` in the harness computes it from the live data.
- **Target of 8-25 s left for the scripted run** (guess): the scripts walk optimal lines with perfect aim, so a human
  needs more time; 8 s is the floor so a slightly slower human still makes it, 25 s the ceiling so it stays tense.
  `alarmSeconds` were tuned to this (briefs that quoted the old numbers were updated).
- **Demolition targets need a weak point the career's tools can reach.** Measured: 6 sticky bombs on the 0.3 m brick
  lighthouse drum leave >150 voxels in every layer (ring not cut); the 0.4 m rock watchtower needs ~20 bombs; 6 bombs +
  6 pipe bombs remove only ~10 % of the concrete pump house; pipe bombs bounce off the steel vault door without a dent.
  Fixes stay in the fiction: timber shoring band at the foot of the lighthouse (restoration works), a timber lookout on
  the watchtower above head height, an "old armoured door of riveted plate" (painted metal: blowtorch / shotgun / pipe
  bombs work) on the vault, and a 6 % "hole" instead of 40 % for the pump house. The chimney (Long Drop) is felled by
  6 bombs placed on the round shaft just above the plinth, so the mission now also requires Dead Weight (career 760).
- **Alarm wiring is per target id**, so Dead Weight's unalarmed pump-house strongbox got its own id and objective (the
  brief said it was unalarmed, the data made it alarmed).
- **Drones count as an alarm source** for `Mission.hasAlarm`: Night Watch has no alarm boxes, only drones, so it never
  gave a time bonus (nor the "silent job" bonus) even though a drone sighting starts the countdown.
- **Roads (RoadHeightmap)** now apply in order like pads (a later road overrides an earlier one inside its half
  width). Nearest-road-only left a vertical step along the line where the nearest road changes (1.4 m at the switchback
  junction). The switchback leaves the shore lane flat for 6 m before climbing, the hairpin radius grew from ~4 m to
  ~5.8 m (the van's turning radius at walking pace), a street lamp standing in the carriageway at the top was moved.
- **Vehicle suspension**: compression damping 4.4 > relaxation 2.3 for all prefabs (was 3.0 / 4.0). With slow rebound
  every 0.1 m voxel step of a 15 % grade pumped the chassis down until it scraped and stopped dead at 8-9 m/s
  (reproduced on a synthetic slope). `tests/unit/vehicle.test.ts` (speed ranges, settling, braking) is unchanged.
- **Loader bucket raised 0.2 m** (floor 0.45 m above the ground): with 2.3 m of overhang it dug into any grade above
  ~10 %. **Terrain is excluded from vehicle ramming**: voxel risers of a slope looked like walls to the ram probes.
- **Rapier `setVoxel` panic during splits of small dynamic bodies** ("unreachable", reproduced in a lighthouse bomb
  run): such bodies now get their collider rebuilt instead of per-voxel `setVoxel` (cheap below 20k voxels). Root
  cause inside Rapier 0.21 not found. `combineVoxelStates` between terrain tiles was tried for the vehicle problem and
  changed nothing, so it was not kept.
- **Player fall speed**: while the controller is held up (not "grounded" on a ledge / prop) the vertical speed no
  longer grows without limit; it used to reach -30 m/s and the eventual landing killed the player with fall damage.
- **Fire visitors and removed bodies**: fires of a body removed by a chain explosion lived until their next fire update;
  the renderer visiting them read the removed rigid body and Rapier aborted (browser crash in Controlled Burn).
- **Level layout fixes**: warehouse mezzanine stairs rose away from the office door (unreachable mezzanine); building
  stair openings started too late (head hit the slab); the Brackwater office's west corridor + office 1 were sealed
  rooms (door added); the Kestrel greenhouse door was 0.9 m off the footbridge deck, behind its railing end.
- **Not fixed (noted)**: `VehicleSystem.scanImpacts` reads impact events from `sim.out`, but the game drains `sim.out`
  after every step, before the next step's systems run, so contact-force crashes never wear vehicles in the real game
  (ramming damage still works). Fixing it would suddenly make vehicles take crash damage everywhere; left for a
  deliberate decision. Also noted: a player running into the parked escape van shoves it a metre or two.
## Still-camera ground flicker + voxel look pass (see docs/research/09-voxels-deep-dive.md)
- **Standing-still deadband** (`Player.update`): with no movement input, vertical corrections < 0.3 mm while grounded
  or held up, and sideways drift < 0.3 mm per tick, are dropped. Cause found by logging the eye: Rapier's controller
  lifts the character by its normal nudge (1e-4 m) every call and the -1 m/s ground-stick speed pulls it back; on terraced
  slopes the cylinder rests on voxel edges, is never "grounded" and crept ~4 cm / 10 s. Only without input, because while
  walking those nudges are what slides the cylinder over voxel edges (a playthrough got stuck otherwise). Not changed:
  Rapier's nudge factor itself (lowering it risks getting stuck in geometry).
- **Grain anti-aliasing**: per-voxel grain fades to its mean between 0.5 and 1.5 voxels per pixel (4-voxel blotches
  between 2 and 6). Static bodies use world-space grain so abutting ground tiles match in their overlap strips.
- **Crack overlap**: concave edges are overlapped like flat continuations (the overlap slides between two solid voxels,
  hidden). Convex edges get 35 % of the distance-proportional overlap (sub-pixel, no constant part), which closed the
  black slivers at terrace step ends. Guess: fins of < 0.5 px at silhouettes are invisible.
- **Grade contrast** is a power curve around 0.18 instead of `mix(0.5, c, k)` in linear space, which clipped every
  linear value < 0.0098 to black.
- **AO combination** = min(face AO term, cone AO) instead of the product (both see the adjacent walls); cones start
  2 voxels off the surface and take their first sample at 6 voxels (they used to sample the 4³ density cell of the
  surface they start from). Interiors stay dark (cone AO is the smaller term there).
- **Per-voxel normal tilt** ±~4° (hash of the voxel cell; rotates with dynamic bodies) and a 0.14-voxel convex-edge
  bevel on static volume-lit bodies; both fade out with distance (tilt below ~1 px per voxel, bevel below ~4 px). The
  reference's bevel is a screen-space normal blur; ours is analytic from the occupancy volume (cheaper, no extra pass).
  Amounts are guesses tuned on screenshots.
- **Chips**: 2.5-5 cm, tumbling, colour 55 % material / 45 % grey, lifetime 0.6 + 3·r³ s; a chip inside solid matter
  never comes to rest (they hung in the air around fresh holes).
- **Soot** shades 50 % / 27 % of the greyed colour; explosions put heavy soot near the rim and light soot further out.
- **Debris cleanup**: debris bodies < 200 voxels, < 10 per side, untagged, slow or asleep, older than 5 s and more than
  20 m from the player are removed (numbers from the reference's shipped cleanup script). Replaces "hammer chunks
  crumble 15 s after settling". The `maxDebris` budget still applies everywhere.
- **Hole edge roughness** lowered (sledge 0.6 → 0.2, explosions 0.35 → 0.2, default 0.25 → 0.15): the reference
  carves exact spheres; raggedness comes from overlapping hits. Our crack-seam fracture of blasts is kept (own design).
- **Bricks** are 3 × 1 voxels, staggered by one voxel per course (were 4 × 2): real-brick scale at 10 cm voxels.
  Costs ~3-4 % more quads on the big maps (harbor 372 k → 384 k).
- **Dig floor ("the ground shows below the map")**: measured, the terrain never opens (crater floors hit the
  unbreakable layer 0.5 m down, also on tile seams; `tests/unit/dig.test.ts`). It *looked* open: that layer was
  near-black grey and a shaded pit rendered at about (16,16,20). The `bedrock` material is now compacted earth
  (0x7a5e42, audio group dirt), and the cone AO density boost is 1.6 instead of 2.5 (a 3 m wide, 1.4 m deep pit sees
  about half the sky; the cones reported ~15 %). Interiors stay dark (look test: inside floor luma 74 vs 134 outside).
  Not done: a deeper diggable soil layer (≈ +6 M voxels on the big maps).
- **TAA** (medium + high tiers, replaces FXAA and the high tier's 4x MSAA; `renderer.setTAA(false)` / `?taa=0` restores
  them): Halton(2,3) 8-sample sub-pixel jitter, history reprojected with the *unjittered* matrices from the depth
  buffer, clamped to the current 3x3 YCoCg neighbourhood in a Reinhard-compressed space. A still camera must stay
  still (the user's complaint), so: the history stores each pixel's distance; pixels that moved on screen or whose
  history saw another surface (distance outside the neighbourhood's range) blend fast (10 %) and are clamped; trusted
  pixels of a camera that has not moved accumulate progressively (blend down to 1/64) and are clamped only when the
  history is far outside the neighbourhood (smoke / fire / water / lights still update). Measured on harbor at
  640x360 after warm-up: ~40-90 of 230 k pixels change by up to ~20/765 per frame (0 with TAA off). Moving bodies get
  no motion vectors (the clamp handles them). Test frames (`render()` = full sync) reset the history and are not
  jittered, so screenshots stay comparable. Guess: blend 0.1 / 1/64 and the 2 % + 5 cm distance tolerance.
- **Lamp posts turned 180 degrees** (user report): `lampPost` and `streetLamp` now reach toward -x / -z. Checked per
  lamp (`scripts/dbg-lamps.test.ts`, asphalt under the arm tip vs the other side): every lamp next to a road had its
  arm pointing away from it; now all of them reach over asphalt (quay / yard lamps have concrete on both sides). The
  pole stays at the same spot, so mission props and roads are unaffected.
- **"Heat waves" report (after the 23:14 build, before TAA)**: verified with evidence that a standing player's
  picture inputs do not change: the real rAF loop on harbor (`tests/e2e/realstill.mjs`) records camera, projection,
  shadow camera, lamps and every shared shader uniform for 120 frames: bit-identical after the spawn landing; a sweep of
  600 random standing spots (all maps, every 5th crouched, `scripts/dbg-stand3.test.ts`) found one moving camera (on a
  settling scrap prop). No shader has per-frame noise (no uFrame / time term outside sky clouds, water, fire). Most
  likely cause of what the user saw: sub-pixel view motion (mouse hand tremor) making sub-pixel detail crawl ("heat
  haze"), which TAA (published since) resolves. Because the GPU path cannot be observed here, debug URL switches were
  added (`?taa=0 &grain=0 &dynshadow=0 &near= &inflate=0 &bob=0 &camdebug=1`, see `src/render/lookModule.ts`), and the
  near plane went 0.05 -> 0.1 m (2x depth precision; the view model starts ~0.15 m from the eye).
- **Diagnostics page** (Esc -> Settings -> Diagnostics, F4 = camera readout): the artifact link passes no query
  strings, so the URL switches are also in-game toggles (`game.ext.diag`, own localStorage key
  `wrecking-shift-diag`, not part of the versioned settings save). Applied live.
- **Head bob caused the "heat waves"** (user confirmed: Diagnostics -> head bob off fixed it). The bob took its speed
  from the stride change per rendered frame (0 / 2.4x alternating on a 144 Hz screen, as stride only advances on
  60 Hz ticks) and decayed exponentially, so the final camera never settled (measured: 1499 of 1499 frames changed
  after stopping). Now it runs only while walking (movement input + grounded + horizontal sim speed > 0.6 m/s) and
  ramps linearly to exactly 0 within ~0.25 s; roll is exactly 0 then. My earlier checks missed it because they never
  walked before standing and the readout ignored roll; the F4 readout now compares the final camera matrix and
  `tests/e2e/still.mjs` has a walk-then-stop case with head bob on (fails on the old code).

## Performance mode (low-end laptops) — 2026-11-25
Settings → Graphics → **Performance mode (low-end laptops)** (`settings.perfMode`, `src/game/perfModule.ts`,
`renderer.setPerformanceMode`). Chosen by construction because the container has no GPU (SwiftShader only):
- **Pixels are the bottleneck of integrated GPUs**, so the biggest wins are per-pixel: device pixel ratio capped to 1
  (a 2x laptop screen draws 4x fewer pixels), the scene at 75 % resolution (adaptive 50-85 %: -0.1 when the 1 s frame
  average is above 1/28 s, +0.05 after 3 s below 1/50 s), tone map / grade / FXAA at that reduced size too, and one
  final upscale pass with contrast-adaptive sharpening (5 fetches / output pixel) so edges stay crisp.
- **Low tier, tuned:** no lighting volumes (medium = up to ~250 texture fetches per world pixel, low = shadow-map PCF
  only), no bloom (5-level pyramid) and no TAA (3 history targets + a 9-tap pass). Kept: baked voxel AO, the sun
  shadow map (1024 instead of 2048, ±22 m instead of ±34 m, refreshed every second frame — it holds dynamic objects
  and nearby world, one frame of lag is not visible), two lamp point lights instead of three (every forward-lit
  pixel loops over them). Screenshots `tests/e2e/out/perf-03-harbor.png` vs `perf-04-harbor-normal.png`: same scene,
  very close look.
- **Draw distance 170 m** with the fog closed in front of it: the far plane culls 1.6 m chunk meshes behind the fog
  (fewer draw calls is a CPU win on slow laptops too). The overhead map and photo mode get the full 600 m back.
- **Water:** simple shader (2 noise lookups instead of 15 per pixel).
- **CPU caps** (measured, `BENCH=1 npx vitest run tests/unit/perf.test.ts -t "performance mode"`, harbour, 40 blasts
  + fires, 300 ticks): sim tick 7.0 ms avg / 22 ms max -> 5.65 ms / 14.9 ms; the fire cap (1200 -> 450 burning
  voxels) is most of it. Debris cap 260 -> 110 bodies (only matters in extreme scenes), chunk meshing 4 ms per frame
  instead of 8, chip particles 3000 -> 900 (also fewer instances drawn), **at most 2 physics ticks per frame**: a CPU
  that cannot keep up gets slow motion instead of a spiral of ever longer frames.
- Gameplay is untouched (same tools, damage, physics rules, missions).
- **Auto-suggestion:** with the mode off, when the frame rate stays below 24 fps for ~12 s of play (not in menus,
  photo mode, or the first 6 s after a load) a small banner offers it once per session (F7 / Turn on / Not now /
  Don't ask again, remembered as `settings.perfHintOff`). Not forced: a guess about what players accept.
- Guess: the exact thresholds (24 fps, 28-50 fps band, 170 m) are not measured on real laptops; they are the usual
  console-style targets (30 fps floor) and the fog distances of the overcast preset.

## Power upgrades, loader bucket, booster can, gamepad — 2026-11-25
Gaps 3 / 4 / 8 / Top-10 #5, #8, #9, #10 of `docs/research/10-gap-analysis.md`, built our own way.
- **Power upgrades** (`src/sim/tools/power.ts` table, `Progress.powerLevel/buyPower/applyPower`, shop rows in
  `src/game/ui/powerShop.ts`). Nine upgrades, 2-3 levels: sledge head (bite 0.55->0.82 m, reach 2.6->3.2 m), blowtorch
  nozzle (0.15->0.27 m), shotgun load (8->14 pellets), plank length (4->7 m), cable spool (12->21 m), pipe-bomb blast
  (1.0->1.4), bomb blast (1.6->2.35), rifle core (4->9 surfaces), booster fuel (3.5->5 s, +40 % thrust). Prices sit
  between the ammo upgrades and roughly one job's pay per level (guess: one solid job, ~$200-400, buys one level).
  Each upgrade stores *absolute* values per level (level 0 = stock, checked against the class defaults by a unit
  test), so re-applying is idempotent and a fresh career resets the belt. Saved in the existing `upgrades` map under
  dotted ids (`bomb.blast`) — old saves load with level 0, the save version stays 1, the ammo upgrade keys are
  untouched. Applied in missions, the sandbox and challenges (guess: challenge bests are local only, so bought power
  counting there is fine); free play (`?level=`) keeps stock tools. Because `Game.setupWorld` builds a new belt on
  every load / quickload, `carryPower` copies the stats over the same way `maxAmmo` already was. Charges already placed
  keep the blast size they were placed with (it is copied into each charge, and saved with it).
- **Loader bucket** (`VehicleSpec.arm`, `VehicleArm` in `src/sim/vehicle.ts`, `loaderBlueprint`): the lift arms and
  bucket are a *second dynamic voxel body* (kind 'vehicle', tags `vehicle-arm`, `arm-of:<chassis id>`) on a Rapier
  revolute joint about the chassis X axis with a force-based position motor (600 kN·m/rad, damping 90 kN·m·s,
  160 kN·m cap, limits -0.2 .. 0.9 rad). Chosen over a kinematic offset because the bucket then really collides,
  carries load and is pushed back by what it hits. Chassis mass 7500 -> 6800 kg + 700 kg arm (same total).
  The arm rams like the chassis front (same probe/carve code run on the arm body when moving forward), so the loader
  still digs through walls with the bucket at any height. Angle 0 = the old fixed carry pose, so the Ridge road and
  wall tests drive exactly the geometry they were tuned on. Controls: hold **R** raise / **F** lower while driving (R
  only flips when the vehicle is on its side; F's flashlight toggle is skipped while in a vehicle with an arm),
  gamepad RB / LB. Quicksave: the target angle lives in the arm body's `user.armTarget`, the snapshot restores the
  arm body by id, `adoptVehicle` finds it by tag and re-creates the joint (the relative pose = the angle).
  **Scoop assist:** a voxel cutting edge is a 0.1 m step and a box pushed by a step just slides along the ground, so
  with the bucket fully lowered and the loader creeping forward (0.15-4 m/s), loose bodies (< 2.5 t) right at the lip
  get their velocity nudged up and back into the bucket. A deliberate gameplay assist standing in for a sharp
  wedge edge the voxel collider cannot represent.
- **Booster can** (`src/sim/tools/booster.ts`, id `booster`, unlocks at Load Bearer with the planks): sticks with
  `placeSticky` like the nitro / bomb, lights after a 1 s fuse (no separate ignite key: E is already interact and
  there is no free mouse button — guess that auto-light reads better than a hidden key), burns 3.5 s pushing the
  glued partner along the stuck surface normal (into the surface) at 9 kN, capped at 28 m/s² so small props do not
  vanish; a can knocked loose flies by itself; burnt cans are removed. Only on dynamic bodies (on a building it would
  do nothing; the click is refused without using a can). Parked cars barely move (their brakes and handbrake hold, as
  they should); a car with someone at the wheel takes off. Flame / smoke from `toolsModule` (reads `booster.live`),
  sound: new `boost` loop + torch-on/off one-shots through `tool:boost` / `tool:boostEnd` events. Quicksave via
  `save/load` (sticky + remaining fuse / burn ticks).
- **Gamepad** (`src/game/gamepad.ts` pure mapping + `GamepadInput`, `src/game/gamepadModule.ts`): the pad is turned
  into the same key codes / mouse motion / mouse buttons / wheel the keyboard produces (synthetic keydown / keyup),
  so menus, tools, vehicles and future key rebinding need no gamepad code. Polled once per frame *before* the game
  gathers input (`Input.poll`, one line in `Game.frame`). Right stick = 1100 "mouse px"/s at full tilt x the mouse
  sensitivity setting (so the Settings slider and invert-Y apply), dead zone 0.22 + squared curve. Driving is digital
  (RT/LT thresholds -> W/S) like the keyboard. Menus: d-pad / left stick move focus over the visible buttons of the top
  `.ws-menu`, left/right adjust a focused slider, A clicks, B / Start = Esc. Guess: "standard" mapping layout (the
  W3C one every modern browser reports for Xbox / PlayStation pads); non-standard pads may have other indices.
  Not done: on-screen button glyphs and a gamepad column on the Controls page (another branch is rebuilding that page).
