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
- **Realistic**: a finer 13 m terrain grid with textured ground (grass, dirt, rock, sand), dry patches and farm fields, wind-blown grass and rocks round the camera, dense forests (detailed trees up close, billboards far away), wave water with shore foam, a sky with sun and clouds, textured buildings (windows, tiled roofs, concrete, sandbags), asphalt roads with markings, power lines, and tents, containers, nets and razor wire in the compounds. Needs a good graphics card.

Everything in Realistic mode is generated in code (`realistic.js`); there are no image files.

## Vehicles

Each team has its own real-world vehicles: Blue drives the M1A2 Abrams, M2A2 Bradley and M1114 Humvee; Red drives the T-90A, BMP-2 and GAZ Tigr. There are no health bars:

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
| `realistic.js` | The Realistic graphics mode |
| `vehicles.js` | Real vehicles, ammunition, armour, modules, crew and the damage model |
| `units.js` | Howitzer and soldier models, projectiles, effects, sound |
| `game.js` | Match rules, checkpoints, NPC guards, howitzers, bots, player controls, camera, HUD, menus |

## Tuning

- Guard counts: `GARRISON` in `maps.js`.
- Capture times: `CAP_TIME` in `maps.js`.
- Checkpoint sizes: `CP_DIM` in `maps.js`.
- Howitzer accuracy, range and reload: `HIT_CHANCE`, `HOW_RANGE`, `HOW_COOL` in `game.js`.
- Vehicle stats, armour and modules: `VEH` in `vehicles.js`.
- Ammunition: `AMMO` in `vehicles.js`.

## Testing

`window.IF_TEST` drives the game without a mouse:

```js
IF_TEST.start(0, 0, 8, 'realistic')   // map, team, bots per team, graphics
IF_TEST.deploy('mbt')    // 'inf' | 'mbt' | 'ifv' | 'jeep'
IF_TEST.sim(120)         // run 120 simulated seconds
IF_TEST.state()          // checkpoint owners, guards left, units alive
```
