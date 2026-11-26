# Island Front (Havoc Bay mode, early test)

A combined-arms mode on one big island: tanks, IFVs, jeeps and infantry now; helicopters, jets and boats next.
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
