# Island Front (Havoc Bay mode, early test)

A combined-arms mode on one big island: tanks, IFVs, jeeps, infantry, attack helicopters and jets; boats next.
Open `index.html` in this folder, or use the **Island Front** card on Havoc Bay's title screen.

## The rules

- Three maps: **Ironback Ridge**, **Kettle Lake**, **The Narrows**. Each is 20 × 13.2 km.
- Between the two team bases sit five neutral checkpoints in order: small, medium, the main base, medium, small.
- Every checkpoint is guarded by neutral infantry NPCs (6 / 14 / 30) who shoot both teams. A guard killed in a match stays dead.
- Once a checkpoint's guards are all dead, stand inside it to capture it. You can only take the next checkpoint along from one your team holds.
- Hold all five to win. After 30 minutes, the team holding more checkpoints wins.
- Each team base has 4 towed howitzers that lob high shells at enemies up to 6 km away. About 1 shell in 6.5 lands on its target (`HIT_CHANCE` in `game.js`); the rest scatter 30 to 140 m away.
- Infantry can spawn at checkpoints their team holds. Vehicles start at the team base.

## Graphics

The title screen has a **Graphics** setting:

- **Optimised**: the original lighter map. Runs on most computers.
- **Realistic**: European countryside in the style of Normandy and Poland. A finer 13 m terrain grid with textured ground, farm fields boxed in by hedgerows and dry stone walls, stone villages, mixed woods, wind-blown grass, wave water with shore foam, and a sky with sun and clouds. Needs a good graphics card.
  - **Villages**: stone farmhouses, half-timbered, plaster and brick houses and barns, with windows and doors set into the walls, shutters, sills, steep tiled or slate roofs with overhanging eaves and chimneys, and a church with a spire in every town. Gardens behind the houses have stone walls or hedges.
  - **Woods**: oak, beech, birch, Norway spruce and Scots pine, with hazel scrub thickening the forest edges and ferns on the forest floor. Each tree has three levels of detail: a full model with branches and leaf sprays up to 140 m, a lighter model up to 620 m, and a billboard beyond. Broadleaf crowns are built from clustered lobes, and the leaf cards' normals are bent onto each lobe and the crown so a tree shades as one volume, and the leaf textures keep their coverage in the smaller mipmaps so distant trees don't thin out.
  - **Fields**: wheat, young crops in rows on bare soil, pasture and ploughed land with furrows, round each town, with hedgerow oaks.
  - **Light**: a lower, warmer afternoon sun. Hills cast long shadows over the land beyond the shadow map, hollows get less sky light (both baked when the map is built), and the haze thickens naturally with distance. Leaves and grass glow when the sun is behind them.
  - **Grass**: real curved, tapering blades within 28 m of the camera, finer grass cards to 80 m, coloured to match the ground's green and dry patches, all moving in gusts of wind. Meadows have patches of wildflowers (daisies, buttercups, clover, campion) and seed heads. The ground texture under it is a dense mat of fine blades, clover and dead stalks.
  - **Soldiers**: proper proportions with smooth limbs, camouflage uniforms (woodland for Blue, tan for Red, grey for the guards), plate carriers with pouches, radios and hydration packs, helmets with covers and mounts, gloves, boots, and detailed rifles (M4, AK-74M, AKM). They walk and run with a proper gait, lean into a run, breathe when standing and keep their heads level.

Everything in Realistic mode is generated in code; there are no image files. Optimised mode looks exactly as before.

## Vehicles

Each team has its own real-world vehicles: Blue drives the M1A2 Abrams, M2A2 Bradley and M1114 Humvee; Red drives the T-90A, BMP-2 and GAZ Tigr.

The tanks are detailed models (`tank-models.js`): sloped armour faces, the Abrams' wedge turret with its bustle rack, skirts, sights, remote weapon station and loader's gun shield; the T-90A's Kontakt-5 reactive armour, Shtora dazzlers, fender tanks, fuel drums and dozer blade. All tracked vehicles run on individual 3D track links (rubber-padded on the Abrams) over twin road wheels, toothed sprockets, idlers and return rollers. The paint has dust on the flat tops, rain streaks down the sides and mud low down. Engines sound like engines: a diesel thump for the T-90A, a smooth roar of air for the Abrams' turbine, track links clattering with speed.

There are no health bars:

- Every hull and turret face has an armour thickness and slope (separate values against kinetic darts and shaped charges).
- Rounds have real-ish muzzle velocities and penetration that falls off with range (APFSDS, HEAT, HE, APDS, ATGMs, machine guns).
- A penetrating hit throws spall through the inside and can knock out crew, the engine, transmission, breech, turret drive, sight, fuel tanks or ammo racks. Ammo can detonate (the T-90A's carousel throws the turret), fuel and engines can catch fire, tracks and barrels can be shot off.
- Crew swap seats when someone is knocked out. Two crew lost destroys the vehicle.
- Keys in a vehicle: 1-3 shell type, F machine gun, T missile (steers to your aim), G smoke screen, R repair (stand still), X put out a fire, Shift in the gun sight for more zoom.

## Aircraft

Blue flies the Mitsubishi F-2A and the AH-64D Apache. Red flies the Su-30SM and the Ka-52 Alligator.

- **Jets** start at the end of your runway. Take off at full throttle and pull up past 230 km/h. The mouse flies the jet, W/S set the throttle and A/D roll. 1-4 choose a weapon, F fires the gun, G drops flares and X pulls the fire handle. Land on your runway to rearm, which takes 15 seconds.
- **Helicopters** start at your base. Space climbs, C descends, W/S move forward and back, and A/D move sideways. The gun follows your aim. Land at your base to rearm.
- **Missiles** lock on before you fire. AIM-9X and R-73 chase heat and can be decoyed by flares. Maverick and Kh-29T lock onto ground targets. Hellfire and Vikhr follow your crosshair. Jets also carry bombs, aimed with a falling-bomb sight.
- **Damage** is tracked per part, not as one health bar:
  - Each aircraft is split into the cockpit, nose, front and rear fuselage, fuel tank, each engine, inner and outer wing on each side, tailplanes and fin. Helicopters also have the rotor, transmission, tail boom and tail rotor.
  - Losing an outer wing makes the jet roll towards that side.
  - On the Su-30SM, one engine out makes it yaw, but it keeps flying on the other.
  - An Apache that loses its tail rotor spins. A dead transmission forces an autorotation landing.
  - Fires spread until they burn out. E ejects you, and you come down on a parachute.
- **The F-2A** is a downloaded 3D model (`models/f2.js`). `gltf-models.js` reads it without a loader, so the game still opens straight from disk. It cuts the one-piece airframe into the damageable parts above, with hit areas fitted to the real shape. The model keeps its own JASDF blue camouflage, and its landing gear retracts after take-off.

## Spawn points

You start with 150 SP. Infantry and jeeps are free, an IFV costs 50, a tank 150, a helicopter 400 and a jet 500. There is no limit on aircraft.

You earn SP on the ground:

| Action | SP |
| --- | --- |
| Soldier kill | 60 |
| Guard kill | 50 |
| Jeep destroyed | 80 |
| Howitzer destroyed | 120 |
| IFV destroyed | 150 |
| Checkpoint capture | 150 |
| Tank destroyed | 200 |
| Aircraft destroyed | 250 |

Only ground units can capture checkpoints, so a team still needs tanks and infantry to win.

For testing, press 0 six times in a row (each press within 1.5 seconds of the last) to get 10,000 SP. It works in a match and on the deploy screen.

Bots earn and spend SP the same way. Each bot has its own skill level, and bots make human mistakes:

- They are slow to notice targets, and their aim takes time to settle.
- They flinch when hit and sometimes freeze.
- They pick the wrong ammo, reload at bad moments and forget to crouch.
- Their steering is sloppy and overshoots turns.
- Bot pilots flare late or not at all, and their aim wanders, more so right after they are hit.

## Credits

Blue's F-2A: This work is based on "Mitsubishi F-2 - Fighter Jet - Free" (https://sketchfab.com/3d-models/mitsubishi-f-2-fighter-jet-free-d3d7244554974f499b106e6c11fe3aaf) by bohmerang (https://sketchfab.com/bohmerang) licensed under CC-BY-NC-SA-4.0 (http://creativecommons.org/licenses/by-nc-sa/4.0/). Because of that licence, the game (or at least the F-2 model and anything made from it) must not be used commercially, and changed versions of the model must be shared under the same licence. The full licence note is in `models/f2-license.txt`.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Page, menus, HUD styles |
| `three.r128.js` | three.js r128, the same build Havoc Bay embeds |
| `maps.js` | The three map definitions and the terrain generator (heights in metres on a 26.7 m grid) |
| `world.js` | Renderer, terrain mesh, sea, forests, roads, bridges, buildings, colliders (Optimised look) |
| `realistic.js` | The Realistic graphics mode: terrain, ground textures, sky, water, power lines, compound clutter |
| `real-flora.js` | Realistic mode plants: tree species and their three levels of detail, hedgerows, grass, wheat, ferns, pebbles |
| `real-town.js` | Realistic mode villages: the wall and roof textures, houses, barns, churches, garden and field walls |
| `real-soldier.js` | Realistic mode soldiers: camouflage, kit, rifles |
| `tank-models.js` | The detailed M1A2 and T-90A models |
| `aircraft.js` | Jets and helicopters: built-in models, weapons, flight physics, part damage, bot pilots |
| `models/f2.js` | The F-2 model (glTF with its textures packed in, so it loads from disk) |
| `gltf-models.js` | Reads packed glTF models; builds the F-2A with damageable parts, pylons and retracting gear |
| `vehicles.js` | Real vehicles, ammunition, armour, modules, crew, the damage model, running gear and track links |
| `units.js` | Howitzer and soldier models, projectiles, effects, sound |
| `game.js` | Match rules, checkpoints, NPC guards, howitzers, bots, player controls, camera, HUD, menus |

## Tuning

- Guard counts: `GARRISON` in `maps.js`.
- Capture times: `CAP_TIME` in `maps.js`.
- Checkpoint sizes: `CP_DIM` in `maps.js`.
- Howitzer accuracy, range and reload: `HIT_CHANCE`, `HOW_RANGE`, `HOW_COOL` in `game.js`.
- Vehicle stats, armour and modules: `VEH` in `vehicles.js`.
- Ammunition: `AMMO` in `vehicles.js`.
- Realistic tree species, sizes and crown shapes: `SPECIES` in `real-flora.js`; level-of-detail distances: `NEAR_R`, `FAR_R`.
- What each town is built of: `TOWN_KIND` in `real-town.js`.
- Soldier camouflage, kit colours and rifles: `KIT` in `real-soldier.js`.

## Testing

`window.IF_TEST` drives the game without a mouse:

```js
IF_TEST.start(0, 0, 8, 'realistic')   // map, team, bots per team, graphics
IF_TEST.deploy('mbt')    // 'inf' | 'mbt' | 'ifv' | 'jeep'
IF_TEST.sim(120)         // run 120 simulated seconds
IF_TEST.state()          // checkpoint owners, guards left, units alive
```
