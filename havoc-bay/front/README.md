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

### Ultra

Ultra is a third level above Realistic. It is the same world and layout under better light, drawn through a high-dynamic-range pipeline (`ultra.js`). It needs a strong graphics card.

- **Sun:** a low, warm sun about 19° above the horizon, so shadows are long and the sun is often in view.
- **Sun shafts:** the bright sky round the sun is smeared outwards from it, so trees, ridges, clouds and aircraft in front of it cut dark fingers into the light.
- **Bloom:** very bright things glow into what is next to them: the sun, its glitter on the sea, the afterburner, explosions.
- **Lens flare:** a faint flare shows when the sun itself is in view and nothing hides it.
- **Air:** distance fades into a haze that lies thicker in low ground and turns warm when you look towards the sun.
- **Sky:** deep blue overhead, pale at the horizon, with clouds that are lit on the sun's side and glow at their thin edges.
- **Sea:** the sun lays a path of glitter out to the horizon, worked out from how steep the waves are.
- **Woods:** about 1.8 times as many trees, so the canopy closes when seen from the air. Trees don't block movement, so play is the same.
- **Finish:** film-style tone response, a slight grade and vignette, and edge smoothing.

Optimised and Realistic look as they did before.

## Vehicles

Each team has its own real-world vehicles: Blue drives the M1A2 Abrams, M2A2 Bradley and M1114 Humvee; Red drives the T-90A, BMP-2 and GAZ Tigr.

The tanks are detailed models (`tank-models.js`): sloped armour faces, the Abrams' wedge turret with its bustle rack, skirts, sights, remote weapon station and loader's gun shield; the T-90A's Kontakt-5 reactive armour, Shtora dazzlers, fender tanks, fuel drums and dozer blade. All tracked vehicles run on individual 3D track links (rubber-padded on the Abrams) over twin road wheels, toothed sprockets, idlers and return rollers. The paint has dust on the flat tops, rain streaks down the sides and mud low down. Engines sound like engines: a diesel thump for the T-90A, a smooth roar of air for the Abrams' turbine, track links clattering with speed.

There are no health bars:

- Every hull and turret face has an armour thickness and slope (separate values against kinetic darts and shaped charges).
- Rounds have real-ish muzzle velocities and penetration that falls off with range (APFSDS, HEAT, HE, APDS, ATGMs, machine guns).
- A penetrating hit throws spall through the inside and can knock out crew, the engine, transmission, breech, turret drive, sight, fuel tanks or ammo racks. Ammo can detonate (the T-90A's carousel throws the turret), fuel and engines can catch fire, tracks and barrels can be shot off.
- Crew swap seats when someone is knocked out. Two crew lost destroys the vehicle.
- Keys in a vehicle: 1-3 shell type, F machine gun, T missile (steers to your aim), G smoke grenades, H engine smoke, V laser rangefinder, N thermal sight, R repair (stand still), X fire extinguisher, Shift in the gun sight for more zoom.

The ground vehicles follow War Thunder's Ground Realistic Battles. The research, with sources and the points that could not be confirmed, is in `docs/wt-tank-mechanics.md`.

- **Modules:**
  - Turret traverse and gun elevation are separate drives. A destroyed one freezes that axis, so you aim by turning the hull.
  - A holed radiator overheats the engine as it works, and the engine then wrecks itself unless you stop and repair.
  - A damaged transmission loses drive.
  - A damaged breech misfires about one shot in four, and a damaged barrel can burst when fired.
  - The T-90A's autoloader is a module: when it is out the gun can't be reloaded, but a round already loaded still fires.
  - With the fire control out you lose the rangefinder, the thermal sight and the stabiliser, so the gun sways on the move.
- **Crew:** a wounded crewman works slower: the loader loads slower, the gunner traverses slower, the driver gets less out of the engine. Crew recover slowly once they have gone 20 seconds without being hit.
- **Tracks:** a thrown track goes back on by itself after 8 seconds standing still.
- **Fire:** tanks and IFVs carry two extinguisher charges, jeeps one.
- **Repair:** in the field, R gets modules working again (55 %). On a checkpoint your side holds, or at base, the repair is complete and takes half as long.
- **Resupply:** ammunition, smoke, extinguishers and missiles are topped up while you stand still on a checkpoint you hold or at base.
- **Ammunition:** guns carry real loads and can run out. The Abrams has 42 rounds, the T-90A 43, the Bradley 900 and the BMP-2 500.
- **Ready rack:** the Abrams keeps 18 rounds ready and the T-90A 22 in its autoloader. Once the ready rounds are gone, loading is slower (1.4 times on the Abrams, 2.2 times on the T-90A, which must then be loaded by hand). The rack refills one round every 6 seconds while the gun is loaded and idle.
- **Changing shell:** the loaded round goes back in the rack and the new type is loaded.
- **Sights:**
  - The gun is laid for the range set on the sight: 400 m until you lase.
  - V lases what the crosshair is on, and the gun takes the right elevation for that range for 45 seconds.
  - The marker still shows where the shell will land.
  - The BMP-2 has no rangefinder.
- **Thermal sight:** N switches it on in the gun sight of the Abrams, T-90A and Bradley. The picture goes grey and warm things show white: running vehicles, soldiers, aircraft, fires. The Bradley's older sight is blurrier.
- **Shtora:** the T-90A's dazzlers throw off wire-guided missiles (TOW, Konkurs) that come from within about 20° of where its gun points. They do nothing against laser-guided missiles or shells. Its laser warning tells you when a laser-guided missile is coming, and a bot T-90A that you lase may pop smoke.
- **Engine smoke:** the T-90A and BMP-2 can lay a smoke screen from the exhaust, three times, for 9 seconds each.

## Aircraft

Both sides fly the Mitsubishi F-2A; Red's wear a darker paint. Blue also has the AH-64D Apache and Red the Ka-52 Alligator. The earlier code-built F-16C and Su-30SM models have been removed.

- **Jets** start at the end of your runway. Take off at full throttle and look up past 250 km/h; the jet lifts off at about 270 km/h. The jet follows your aim. W/S set the throttle, A/D roll, Q/E work the rudder and B is the airbrake. 1-4 choose a weapon, F fires the gun, G drops flares and X pulls the fire handle. Land on your runway to rearm and refuel, which takes 15 seconds.
- **Helicopters** start at your base. Hold Space to raise the collective and lift off; C lowers it. The nose follows your aim, so look down to fly forward. W/S push the nose down or up, A/D roll. H switches hover mode on and off. The gun follows your aim. Land at your base to rearm.
- **Missiles** lock on before you fire. AIM-9X and R-73 chase heat and can be decoyed by flares. Maverick and Kh-29T lock onto ground targets. Hellfire and Vikhr follow your crosshair. Jets also carry bombs, aimed with a falling-bomb sight.
- **Damage** is tracked per part, not as one health bar:
  - Each aircraft is split into the cockpit, nose, front and rear fuselage, fuel tank, each engine, inner and outer wing on each side, tailplanes and fin. Helicopters also have the rotor, transmission, tail boom and tail rotor.
  - Losing an outer wing makes the jet roll towards that side.
  - A twin-engined jet with one engine out yaws but keeps flying on the other (the code supports it; the F-2A has one engine).
  - An Apache that loses its tail rotor spins. A dead transmission forces an autorotation landing.
  - Fires spread until they burn out. J bails you out, and you come down on a parachute. E gets you out once you have landed.
- **The F-2A** is a downloaded 3D model (`models/f2.js`). `gltf-models.js` reads it without a loader, so the game still opens straight from disk. It cuts the one-piece airframe into the damageable parts above, with hit areas fitted to the real shape. The model keeps its own JASDF blue camouflage, and its landing gear retracts after take-off.

### Flight model

The flight physics are written for this game (`aircraft.js`). The handling follows War Thunder's Realistic Battles: an instructor flies the aircraft towards your aim, and fuel, weight, overload, blackout and the helicopter's collective work as they do there. The numbers use real figures for weight, wing area, thrust and rotor size.

**Jets**

- **Air:** density falls with height, which thins lift, drag and thrust. Speed is also tracked as a Mach number, and drag rises sharply near Mach 1.
- **Engines:** they take about 3 seconds to spool from idle to full dry power. The throttle reads 0-100 %, then WEP, which is the afterburner. Thrust falls with height and gains a little from speed. On WEP a flame stands behind the nozzle: blue-white where it leaves, orange further back.
- **Lift and drag:** lift follows the wing's angle to the airflow up to the stall, then falls away. Pulling g costs speed, so a hard turn bleeds energy until the jet settles at the turn it can sustain.
- **Fly-by-wire:** as on the real jets, the stick asks the flight computer for g. The computer holds 1 g hands-off, caps the pull at 9 g and stops at its angle-of-attack limit, so a healthy jet won't stall or overstress.
- **Instructor (mouse aim):** the cursor leads the nose, where the guns point. The bank grows with how far the cursor is off the nose: a small nudge is flown with rudder and a few degrees of bank, about 10° off asks for a 40° bank, and a target well off the nose gets a full-rate turn. It pulls the g that turn needs and holds height if the wing can manage it. For a target behind you it flies a level turn. Slow, the nose rides above the flight path, so aim above where you want to go.
- **Runway:** the nose lifts only once the tail has enough air over it. Ground effect cushions the flare. The gear and flaps lower themselves when low and slow; the flaps add lift and drag. B is the airbrake. Throttle right back gives wheel brakes on the ground.
- **Landing:** touch down level at under 5.5 m/s sink and under 410 km/h. Between 3.6 and 5.5 m/s is a hard landing that damages the fuselage.
- **Fuel and weight:** fuel burns with thrust, about four times faster in afterburner. The F-2A's standard load lasts about 23 minutes at 100 % and about 4 minutes on WEP; the HUD shows the time left. Burning fuel and dropping weapons makes the jet lighter, so it climbs and turns better. With no fuel the engine stops. A holed tank leaks.
- **Overload:** the wings stand a load, which is weight times g, so a heavy jet takes less g than a light one. Past the limit, or past the airframe's speed limit, the HUD shows OVERLOAD and stress builds; ease off and it fades, hold it and a wing rips off. The F-2A's flight computer keeps it under its limit while it is working.
- **Pilot:** holding 7 g or more greys the view in from the edges after a few seconds. Holding 9 g for about 4 seconds (8 g for about 7) blacks the pilot out, and nobody flies the jet for 4.5 seconds. Strong negative g reddens the view.
- **Damage:**
  - A damaged wing rolls the jet towards it, harder the more g you pull. A jet with a whole wing gone can limp level but can barely turn.
  - Losing one tailplane slows the pitch response. Losing both leaves almost no pitch control.
  - Losing the fin makes the jet weave.
  - Losing the nose sensors, or both tailplanes, takes the flight computer out. The stick then sets angle of attack directly, so you can stall, and pulling well past 9 g bends the wings.

| | F-2A | Real aircraft |
| --- | --- | --- |
| Top speed at low level, afterburner | Mach 1.05 | about Mach 1.1 |
| Top speed at low level, dry | Mach 0.95 | about Mach 0.95 |
| Take-off run, afterburner | 290 m | 300-550 m |
| Landing roll | 820 m | 600-900 m |
| Roll rate | 250°/s | 180-270°/s |

**Helicopters**

- **Power:** the engines must supply the power the rotor asks for.
  - Hovering costs the most: about 75 % torque.
  - At 100-150 km/h the rotor works in cleaner air, so there is power to spare for climbing.
  - Flat out, fuselage drag sets the top speed.
- **Rotor speed:** ask for more than the engines can give and the rotor slows, and lift falls with the square of its speed. The HUD shows rotor RPM and torque.
- **Collective:** the lever is yours, as in War Thunder. Space raises it, C lowers it, and it stays where you leave it; about 63 % holds a hover. The HUD shows the lever, your climb rate, rotor RPM and torque.
- **Instructor:** the nose follows your aim in pitch and yaw. Nose down pulls the helicopter forward, so you fly by looking where you want to go and adding collective to hold height.
- **Hover mode (H):** the helicopter holds its place and height. W/A/S/D move it about gently, Space and C climb and descend, and close to the ground the descent is held to a soft landing. It also works the collective for you in an autorotation.
- **Ground effect:** close to the ground the rotor needs less power.
- **Turning:** at speed the helicopter banks into its turns and can't spin on the spot. In the hover it turns freely.
- **Vortex ring:** sinking faster than about 4 m/s with little forward speed puts the rotor in its own downwash and it loses lift. Fly forward to get out. Hover mode keeps the descent below that.
- **One engine out:** the helicopter can't hover out of ground effect, but it flies on if you keep 100 km/h or more.
- **Both engines out (autorotation):** lower the collective at once and the air coming up through the rotor keeps it turning; you come down at about 12 m/s at 150 km/h. Pull the nose up from about 25 m to flare, then raise the collective in the last 8 m to spend the rotor's spin on a soft touchdown. It takes practice. A run-on landing at up to 100 km/h is survivable.
- **Tail rotor lost:** the Apache spins in the hover, harder the more power you pull. At speed the fin holds it nearly straight.

| | Apache | Ka-52 | Real aircraft |
| --- | --- | --- | --- |
| Top speed | 303 km/h | 305 km/h | 293 and 300 km/h |
| Vertical climb | 8.4 m/s | 7.1 m/s | 8-12 m/s |

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
| `ultra.js` | The Ultra graphics level: HDR render passes (sun shafts, bloom, lens flare, haze, tone response, edge smoothing), its sky and sun |
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
IF_TEST.start(0, 0, 8, 'realistic')   // map, team, bots per team, graphics ('optimised' | 'realistic' | 'ultra')
IF_TEST.deploy('mbt')    // 'inf' | 'mbt' | 'ifv' | 'jeep' | 'heli' | 'jet'
IF_TEST.sim(120)         // run 120 simulated seconds
IF_TEST.state()          // checkpoint owners, guards left, units alive
```
