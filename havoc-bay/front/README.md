# Island Front (Havoc Bay mode, early test)

A combined-arms mode on one big island: tanks, IFVs, jeeps, infantry, attack helicopters and jets; boats next.
Open `index.html` in this folder, or use the **Island Front** card on Havoc Bay's title screen.

## The rules

- Three maps: **Ironback Ridge**, **Kettle Lake**, **The Narrows**. Each is 20 × 13.2 km.
- Between the two team bases sit five neutral checkpoints in order: small, medium, the main base, medium, small.
- Every checkpoint is guarded by neutral infantry NPCs (6 / 14 / 30) who shoot both teams. A guard killed in a match stays dead. The last three guards of a checkpoint leave their posts and come out to the road, so a match cannot stall on one guard hidden in a corner. A post that a building was placed on is moved beside it.
- Roads are graded where they leave a bridge or reach a levelled site (a base, checkpoint, airfield or town): cut into the bank or carried on an embankment at about 1 in 4, so every bridge and every checkpoint can be driven into at any speed.
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
- **Ground:** a new rock surface on the mountains, differently coloured fields so farmland reads as a patchwork from the air, darker wet sand at the waterline, and greener grass in sheltered hollows.
- **Cloud shadows:** patches of shade drift across the land and sea.
- **Finish:** film-style tone response, a slight grade and vignette, and edge smoothing.

Optimised and Realistic look as they did before.

If a graphics card cannot run the Ultra effects (a pass fails to compile, or the high-range picture buffer is refused), the game notices within the first few frames, shows the scene without them and says so; later matches then use the Realistic look.

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

Blue flies the Mitsubishi F-2A and Red the Eurofighter Typhoon, in Luftwaffe markings. Blue also has the AH-64D Apache and Red the Ka-52 Alligator. The earlier code-built F-16C and Su-30SM models have been removed.

- **Jets** start at the end of your runway. Take off at full throttle and look up past 250 km/h; the jet lifts off at about 270 km/h. The jet follows your aim. W/S set the throttle, A/D roll, Q/E work the rudder and B is the airbrake. The number keys choose a weapon (1-4 on the F-2A, 1-5 on the Typhoon), F fires the gun, G drops flares and X pulls the fire handle. Land on your runway to rearm and refuel, which takes 15 seconds.
- **Helicopters** start at your base. Hold Space to raise the collective and lift off; C lowers it. The nose follows your aim, so look down to fly forward. W/S push the nose down or up, A/D roll. H switches hover mode on and off. The gun follows your aim. Land at your base to rearm. Key 4 selects air-to-air missiles (Stinger on the Apache, Igla on the Ka-52), N switches the thermal view on when zoomed, a marker shows where rockets will land, and a timer counts a guided missile down to impact. Each helicopter has a pilot and a gunner and flies on with one. The research behind this is in `docs/wt-helicopter-mechanics.md`.
- **Missiles** lock on before you fire. AIM-9X, R-73 and IRIS-T chase heat and can be decoyed by flares. Meteor is radar-guided: flares do nothing to it, the chaff fired with them breaks its lock only sometimes, and the HUD warns RADAR MISSILE. Maverick, Kh-29T and Brimstone lock onto ground targets. Hellfire and Vikhr follow your crosshair. Jets also carry bombs, aimed with a falling-bomb sight; the Typhoon's GBU-48 then steers itself onto the target.
- **Damage** is tracked per part, not as one health bar:
  - Each aircraft is split into the cockpit, nose, front and rear fuselage, fuel tank, each engine, inner and outer wing on each side, tailplanes and fin. Helicopters also have the rotor, transmission, tail boom and tail rotor.
  - Losing an outer wing makes the jet roll towards that side.
  - The Typhoon has two engines: with one out it yaws towards the dead one but flies on the other. It has canards beside the cockpit instead of tailplanes.
  - An Apache that loses its tail rotor spins. A dead transmission forces an autorotation landing.
  - Fires spread until they burn out. J bails you out, and you come down on a parachute. E gets you out once you have landed. In a jet E is also the right rudder, so it only lets you out once the jet has stopped. An aircraft you have parked stays where it is, and E beside it puts you back in the cockpit.
- **The battle area:** fly more than 2.5 km past the edge of the map and you are warned to turn back. Nothing else happens; bot pilots turn round at 3 km.
- **The Eurofighter Typhoon** (Red) is a downloaded 3D model too (`models/typhoon.js`), cut into parts the same way: nose, canards, front and rear fuselage, both engines, inner and outer wing each side, fin. It has its own features, as the real aircraft does:
  - **Weapons, as a Luftwaffe jet carries them:** the Mauser BK-27 27 mm cannon in the right wing root (150 rounds at 1,700 a minute), 2 IRIS-T heat-seekers on the outer wing stations (they lock far off the nose), 4 Meteor radar missiles half sunk into the fuselage (they lock out to 9 km and keep their speed), 6 Brimstone 3 on two triple launchers (fire and forget, and can be rippled), and 2 GBU-48 1,000 lb guided bombs.
  - **DASS:** its defensive aids system sees a missile coming and fires flares and chaff by itself a moment after the launch.
  - **Low-speed recovery:** too slow with the nose high or the wing loaded, and the flight computer unloads the wing and selects full reheat until it is flying again. The HUD says LOW SPEED RECOVERY.
  - **Brake chute:** it streams from the base of the fin on the landing roll and is let go once slow, or if you open the throttle to go round.
  - **Reheat:** two flames, one per EJ200, yellow-white at the nozzle rather than the F-2A's blue-white, with more shock diamonds.
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
- **Landing:** touch down level on the wheels at under 7 m/s sink and under 450 km/h. Above 3.6 m/s is a hard landing that strains the fuselage. Harder, faster or more crooked than that and the undercarriage gives way: the jet drops onto its belly and slides.
- **Fuel and weight:** fuel burns with thrust, about four times faster in afterburner. The F-2A's standard load lasts about 23 minutes at 100 % and about 4 minutes on WEP; the HUD shows the time left. Burning fuel and dropping weapons makes the jet lighter, so it climbs and turns better. With no fuel the engine stops. A holed tank leaks.
- **Overload:** the wings stand a load, which is weight times g, so a heavy jet takes less g than a light one. Past the limit, or past the airframe's speed limit, the HUD shows OVERLOAD and stress builds; ease off and it fades, hold it and a wing rips off. The F-2A's flight computer keeps it under its limit while it is working.
- **Pilot:** holding 7 g or more greys the view in from the edges after a few seconds. Holding 9 g for about 4 seconds (8 g for about 7) blacks the pilot out, and nobody flies the jet for 4.5 seconds. Strong negative g reddens the view.
- **Collisions (the jet is a solid body):** the jet has contact points on the nose, belly, tail, both wingtips, both mid-wings, the tailplane tips, the fin and the three wheels. A point that meets the ground gets a rigid-body impulse there, so the blow pushes back where it landed and friction drags that point.
  - A wingtip on the ground rolls the jet back and slews it round. The first touch damages the wing by how fast it closed and how fast the jet was going, and dragging it grinds it away: a gentle touch at landing speed scuffs the tip, the same at 300 km/h tears the outer panel off.
  - A wing against a building or bridge comes off and the jet slews towards it; the nose or fuselage into one at speed is a crash. Flying through the tops of a wood batters whatever goes through the trees and feeds branches to the engine.
  - A flat, slow arrival without wheels is a belly landing. The jet slides, the nose swinging round if it arrived crooked or a wing is gone, the belly and the engine wearing away, until it stops. E gets you out. On your own airfield it is repaired like any other damage.
  - In the sea it ploughs to a stop and sinks; the pilot gets out and swims.
  - Only a hard hit with the nose or body destroys the jet outright: closing on the ground at more than about 80 km/h straight in, or a steep dive.
  - Parts that come off keep flying: they tumble away at the jet's speed, fall, and lie where they land.
- **Going down:** a wreck falls as a 10-13 tonne body, not a weightless one.
  - Gravity pulls it and drag depends on how it meets the air: nose first it stays sleek and keeps gathering speed towards the speed of sound; broadside or tail first it is far draggier.
  - The air also turns it. With the tail on, the tailplane and fin swing the nose round into the direction it is falling. Without them it pitches over and tumbles. A single wing lifts on one side only and rolls it. Every turn works against the airframe's inertia, so a heavy wreck takes time to start turning and time to stop, and a tumbling one couples its axes as real bodies do.
  - A jet that breaks up in the air loses its tail, a wing or both on the way down. A wreck keeps turning the way the jet was turning when it was hit.
  - It trails smoke laid along its path, so the trail stretches as it speeds up, and it burns as it falls.
  - Hitting the ground, the speed has to go somewhere. Steeply (more than about 30 degrees), it ends there in a fireball. At a shallow angle the fireball is smeared along the ground ahead, the wings and tail are flung on, and what is left skids and bounces on until the ground stops it, then burns. In the sea it throws up a column of spray and stops.
  - When your own jet is destroyed the camera follows the wreck down, hanging back further the faster it falls, and shakes on impact. The deploy screen waits until it has come to rest (14 seconds at most).
- **Damage (where it is hit decides what stops working):**
  - Nothing blows a jet up at once except a big warhead straight into the fuselage. A fire left burning for 18 seconds reaches the fuel, and that does. X pulls the fire handle.
  - A warhead bursting nearby throws fragments that find some parts and miss others, more of them the closer it bursts.
  - The rear fuselage shot through: the tail comes away with the engine, tailplanes and fin. Losing the tailplane's downforce pitches the nose down hard, and with nothing to hold it into the airflow the jet tumbles and falls as a wreck. The forward fuselage wrecked: nothing answers the stick, and because the F-2, like the F-16, is built slightly unstable in pitch and relies on its flight computer, the nose wanders off within a few seconds into a stall or a dive. Either way J bails you out. A bot pilot ejects a second or two after it happens.
  - Fuselage damage weakens the hydraulics, so the stick does less. A wounded pilot cannot hold the jet steady.
  - A damaged wing rolls the jet towards it, harder the more g you pull, and its drag pulls the nose that way. A jet with a whole wing gone can limp level but can barely turn.
  - Losing one tailplane slows the pitch response. Losing both leaves almost no pitch control.
  - Losing the fin makes the jet weave.
  - Losing the nose sensors, or both tailplanes, takes the flight computer out. The stick then sets angle of attack directly, so you can stall, and pulling well past 9 g bends the wings.

| | F-2A | Real F-2 | Typhoon | Real Typhoon |
| --- | --- | --- | --- | --- |
| Top speed at low level, afterburner | Mach 1.05 | about Mach 1.1 | Mach 1.2 | Mach 1.25 (limit) |
| Top speed at low level, dry | Mach 0.95 | about Mach 0.95 | Mach 1.0 | |
| Top speed at 9 km, dry (supercruise) | Mach 1.0 | none | Mach 1.2 | Mach 1.1-1.5 (1.21 seen loaded) |
| Take-off run, afterburner, from a standstill | 250 m | 300-550 m | 240 m | about 300 m |
| Landing roll | 650 m | 600-900 m | 540 m, with the chute | about 700 m (unverified) |
| Roll rate | 250°/s | 180-270°/s | 210°/s | 150-200°/s (estimates) |

How the Typhoon is meant to feel, from pilots' accounts:
- **Power first.** Two EJ200s give 180 kN in reheat for about 16 t, a thrust-to-weight ratio above 1. It accelerates from 540 to 1,080 km/h in 17 seconds where the F-2A takes 20, and it supercruises.
- **Carefree handling.** The flight computer will not let it pass 24° angle of attack or 9 g, so full back stick goes straight to the limit and no further.
- **It doesn't do very slow.** The low aspect ratio delta has less lift per degree than the F-2A's wing and pays more drag for it. In a hard turn at 540 km/h it pulls 4 g where the F-2A pulls 4.5, so it fights by keeping its speed, not by hanging on the nose.
- **Unstable by design.** If the forward fuselage is wrecked and the flight computer goes, the nose wanders off faster than the F-2A's does.

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
- **Turning:** at speed the helicopter banks into its turns and can't spin on the spot, and the tail fin keeps the nose pointing the way it is going. In the hover it turns freely.
- **The sea:** water is a surface. Touching it in a helicopter is a crash; a jet can be ditched in it.
- **Vortex ring:** sinking faster than about 4 m/s with little forward speed puts the rotor in its own downwash and it loses lift. Fly forward to get out. Hover mode holds the descent to about 2.6 m/s when slow, lets you sink faster only above about 60 km/h, and puts the nose down to fly out if the rotor is caught anyway.
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
- Drivers slow down and line up for bridges, steer round walls and buildings, and stop to repair knocked-out parts when nobody is shooting at them. A crew whose vehicle has been bogged down for over a minute gets out and walks; the abandoned vehicle is cleared away later.
- A crew that is hit turns to look for whoever fired, and may pop smoke.
- A crew that runs out of shells drives back to the nearest checkpoint its side holds (or the base), restocks there and returns. An immobilised crew repairs as soon as it is not under fire.
- With six or fewer guards left at a checkpoint, bots there go for the guards first.
- Bot pilots will not dive below the height a pull-out needs, give up attack runs that are too steep, watch for rising ground, and come back if a dogfight drifts more than 3 km off the map.
- Bot pilots flare late or not at all, and their aim wanders, more so right after they are hit.

## Interface

The interface is laid out the way War Thunder lays its own out, studied from that game's official wiki and news screenshots. Only the layout and conventions are borrowed: every drawing, icon and colour here is the game's own, and no War Thunder artwork, logo or font is used.

- **Top centre:** how many checkpoints each side holds on slanted blue and red plates with the clock between them, the five checkpoints as diamonds under that (blue, red or neutral, filling as they are taken, with the number of guards left beneath and corner brackets round the one you are standing in), then a compass tape.
- **Top left:** spawn points. In an aircraft the flight read-out sits here as bare text: throttle, speed, altitude, then the weapons with `>` marking the chosen one, flares and fuel time, then the other instruments.
- **Bottom left:** the damage panel, a plan view of what you are in on a round plate. Each part and crew seat is green when working, yellow when damaged and red when knocked out; an empty seat is dark. The jet's panel is the aircraft's own shape, taken from the 3D model: a part flashes white when it is hit, and shows faint red where it has broken off. Damage to the jet is shown there and not in words. Speed and sight range are under it.
- **Bottom centre:** the action bar. One slot for each thing you can use, with its key on a tab above, a picture, and how many are left. The chosen shell or weapon is lit, the shell in the gun has a gold marker, and the slot fills as the gun loads.
- **Bottom right:** the map. **Top right:** who knocked out whom.
- **The map** (minimap, deploy screen and the big map on M) is drawn as a printed tactical map to match: muted tints by height, hill shading, a contour every 50 m, woods, roads and runways, a dark coastline, fold creases and paper grain, under a 2 km grid numbered across and lettered down. Checkpoints are the same diamonds as on the HUD with their names and guard counts on dark plates; on the deploy screen a gold ring marks where you can start and white brackets mark the place you chose.
- **Warnings** (fire, missile, stall and so on) appear in red under the compass.
- **F1** shows or hides the controls for what you are in. They also show for 20 seconds each time you change unit.
- **Menus** are flat slate windows with tabs and a row of buttons along the bottom. The title screen has the red "To battle" button at the top with the chosen map under it. The deploy screen shows the battle name, time left and score on top, your line-up as a strip of cards with their spawn-point costs, the chosen unit's weapons and figures and the mission objectives on the left, and the map on the right.

Nothing is flat paint: the menus, windows, buttons and HUD plates carry a worn finish made of three small tiles (fine grain, a scuffed and scratched surface, and a mask that chips paint off the big lettering and the battle button). The tiles are generated from seeded noise, not taken from anywhere. The action bar is left clean so its pictures and counts stay easy to read.

All of it is in `ui.css`; the Barlow typeface and the wear tiles are packed into that file so the game still opens from disk.

## Credits

Red's Eurofighter Typhoon: This work is based on "Eurofighter Typhoon - Fighter Jet - Free" (https://sketchfab.com/3d-models/eurofighter-typhoon-fighter-jet-free-992bcc8987964ca09d55410330aa8579) by bohmerang (https://sketchfab.com/bohmerang), licensed under CC-BY-NC-SA-4.0 (http://creativecommons.org/licenses/by-nc-sa/4.0/). The licence text is in `models/typhoon-license.txt`.

Blue's F-2A: This work is based on "Mitsubishi F-2 - Fighter Jet - Free" (https://sketchfab.com/3d-models/mitsubishi-f-2-fighter-jet-free-d3d7244554974f499b106e6c11fe3aaf) by bohmerang (https://sketchfab.com/bohmerang) licensed under CC-BY-NC-SA-4.0 (http://creativecommons.org/licenses/by-nc-sa/4.0/). Because of that licence, the game (or at least the F-2 model and anything made from it) must not be used commercially, and changed versions of the model must be shared under the same licence. The full licence note is in `models/f2-license.txt`.

Interface typeface: Barlow, Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow), licensed under the SIL Open Font License 1.1. The licence text is in `docs/barlow-font-license.txt`.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Page: title, deploy, pause and end screens, HUD elements |
| `ui.css` | All interface styles and the two packed Barlow fonts |
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
| `models/typhoon.js` | The Eurofighter Typhoon model, packed the same way |
| `gltf-models.js` | Reads packed glTF models; builds the F-2A with damageable parts, pylons and retracting gear |
| `model-kit.js` | The model kit: reads any packed glTF (parts, skeletons, animations) and fits it as a tank, helicopter or soldier |
| `models/config.js` | Which downloaded model is used for which unit, and how it is fitted |
| `tools/pack_model.py` | Packs a glTF or GLB download into `models/<key>.js` |
| `docs/` | Research notes on War Thunder's tank and helicopter mechanics, and how to add models (`docs/models.md`) |
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
