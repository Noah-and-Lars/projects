# War Thunder helicopter mechanics: research notes and plan

These notes record what War Thunder's helicopters do, where each point comes from, and how Island Front compares. Points that could not be confirmed are listed under "Unverified".

No datamined game files were used. Numbers for our helicopters come from the real aircraft.

## Sources

| Short name | Page |
| --- | --- |
| Helicopter devblog | https://warthunder.com/en/news/5742-development-flight-models-and-physics-of-war-thunder-helicopters-en (Gaijin, September 2018, read in full) |
| Apache guide | https://wiki.warthunder.com/1752-a-comprehensive-guide-to-the-ah-64-apache-family (community guide on the official wiki, January 2025, read in full) |
| Mi-24P guide | https://wiki.warthunder.com/3543-mi-24p-the-ultimate-gunship (search summary) |
| Helicopter tips thread | https://forum.warthunder.com/t/useful-helicopter-tips-thread/302199 (search summary) |
| Guided munitions guide | https://forum.warthunder.com/t/guide-dusage-et-de-connaissances-des-munitions-guidees-et-des-elements-associes/5658 (search summary) |
| Damage model threads | https://forum.warthunder.com/t/helicopter-damage-model-a-much-needed-rework/349959 and https://forum.warthunder.com/t/helicopter-damage-problems/172564 (search summaries) |
| Ka-52 thread | https://forum.warthunder.com/t/kamov-ka-52-alligator-hokum-b-technology-discussion-and-balance/44021 (search summary) |

## How War Thunder does it

### Flight and controls (Helicopter devblog)

- **Axes:** cyclic for pitch and roll, collective for climb and descent, pedals for yaw.
- **Collective:** manual in every control mode.
- **Mouse aim:** you set the direction to turn or fly towards and the instructor works the cyclic and pedals. The cyclic and pedal keys still add their own input.
- **Hover mode (H by default):** the helicopter holds its place. You can still move in every axis, and near the ground the descent rate is limited for a soft landing.
- **Ground effect:** lift is greater close to the surface.
- **Vortex ring:** at low forward speed with a descent of 3 m/s or more, the rotor loses thrust and the helicopter falls. Gaining forward speed is the way out.
- **Tail rotor:** counters the main rotor's torque. Spinning hard in the hover towards the tail rotor's airflow can lose control.
- **Engines:** a twin can keep flying on one engine. With all engines out the rotor can be kept turning by the airflow (autorotation) if the collective is kept low.

### Weapons (Apache guide, tips thread, Mi-24P guide)

- **Gun:** the Apache's 30 mm M230 fires dual-purpose shells and is slaved to the crew's helmet sight, so it points where you look.
- **Rockets:** Hydra pods hold 19 each. A ballistic computer shows where they will land. The marker does not work on air targets.
- **Hellfire:** laser-guided, with a launch range of 8 km in the guide. The gunner must keep line of sight to guide it; its course can be changed in flight. A timer shows the time to impact. Up to 4 per pylon.
- **Pop-up attack:** fire from behind cover towards the ground, then rise and put the sight on the target shortly before impact.
- **Air-to-air:** the Apache can carry 4 ATAS Stingers (all-aspect, 5 km) or Sidewinders.
- **Russian missiles:** the Shturm on the Mi-24 is guided by keeping the sight on the target (SACLOS).

### Defences (Apache guide, guided munitions guide, Mi-24P guide)

- **Countermeasures:** the base Apache has 30. Flares decoy infra-red missiles; chaff decoys radar-guided ones.
- **Infra-red jammer (IRCM):** shows the missile a brighter infra-red source than the helicopter. Stinger, Igla and Mistral ignore it.
- **Wire- and radio-guided missiles** from the ground are not affected by countermeasures.
- **Warning systems:** the Apache has radar and laser warning; later versions add a missile approach warner.

### Damage (damage model threads, Apache guide, Ka-52 thread)

- The AH-64 and Ka-52 have fully detailed damage models; other helicopters fold their systems into one fuselage model.
- A tail hit can cut the tail off. Engine and transmission damage from machine guns is a common cause of loss.
- The Apache's pilot and gunner sit in tandem and either can fly it, so one usually survives a hit that takes out the other.
- Coaxial Kamovs have no tail rotor to lose.

## What Island Front had, and what changed

| Mechanic | War Thunder | Island Front before | Now |
| --- | --- | --- | --- |
| Collective | Manual | Climb-rate keys | Manual lever (done in the flight rework) |
| Mouse aim | Instructor points the nose | Tilt keys | Nose follows the aim in pitch and yaw |
| Hover mode | Holds position; soft landing | Missing | H toggles it |
| Vortex ring | From 3 m/s descent at low speed | From about 8 m/s | From about 4 m/s |
| Crew | Pilot and gunner, either can fly | One cockpit hit killed the helicopter | Two crew; it flies on with one |
| Air-to-air missiles | Stinger on the Apache | None | 4 Stingers on the Apache, 4 Iglas on the Ka-52 (key 4); bot helicopters use them |
| Rocket ballistic computer | Impact marker | None for rockets | Marker shows where rockets will land |
| Missile timer | Time to impact shown | None | Shown while a guided missile is in flight |
| Gunner's thermal view | Zoomed sight with thermal | Zoom only | N toggles thermal in the zoomed view; lost if the nose sight is destroyed |
| Hellfire guidance | Laser, steerable in flight | Follows the crosshair | Unchanged |
| Countermeasures | 30 on the base Apache | 30 flares | Unchanged |

## Unverified

- **Hellfire speed, lock-on-after-launch details and whether smoke breaks the laser:** not in any page that loaded. Our Hellfire flies at 420 m/s and follows the crosshair.
- **Which thermal generation the Apache and Ka-52 sights have in War Thunder:** not stated. Both are treated as second generation.
- **Infra-red jammer effect on missiles other than Stinger, Igla and Mistral:** not confirmed, so no jammer is modelled.
- **Rearming on a helipad:** no source found. Island Front rearms helicopters at base in 15 seconds.
- **Whether a helicopter with one crewman left loses any weapons:** not confirmed. Here all weapons keep working.
- **Radar (Longbow) and radar warning:** not implemented; the game has no radar-guided weapons.
- **Stinger and Igla speed and range in War Thunder:** the guide gives 5 km for the Stinger. Ours use 750 m/s for 8 seconds and 600 m/s for 9 seconds, from the real missiles.
