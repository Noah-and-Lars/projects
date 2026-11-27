# War Thunder ground vehicle mechanics: research notes and plan

These notes record what War Thunder's Ground Realistic Battles do, where each point comes from, and how Island Front compares. They were written from official pages where those loaded, and from forum and guide summaries otherwise. Anything that could not be confirmed is listed under "Unverified" and is not presented as fact.

No datamined game files were used. Numbers for our vehicles come from the real vehicles.

## Sources

| Short name | Page |
| --- | --- |
| Modules wiki | https://wiki.warthunder.com/mechanics/4775-ground-vehicle-modules (official wiki, read in full) |
| Penetration devblog | https://warthunder.com/en/news/6010-development-improved-calculation-of-armour-penetration-in-the-game-en (Gaijin, January 2019, read in full) |
| Ballistics Q&A | https://warthunder.com/en/news/6023-qa-ballistic-update-questions-and-answers-from-the-developers-en (search summary) |
| APS wiki | https://wiki.warthunder.com/mechanics/241-active-protection-systems (official wiki, read in full) |
| Stabiliser wiki | https://wiki.warthunder.com/mechanics/199-gun-stabilizer (official wiki, read in full) |
| Damage mechanics wiki | https://old-wiki.warthunder.com/Damage_mechanics (search summary; the page itself needs a login) |
| Roadmap: repair and FPE | https://forum.warthunder.com/t/following-the-roadmap-maps-for-aircraft-flares-and-repair/3586 (search summary) |
| Assisted fire-fighting | https://warthunder.com/en/news/7203-development-assistance-when-extinguishing-fires-en (search summary) |
| Damage-model roadmap | https://warthunder.com/en/news/8851-roadmap-following-the-roadmap-possible-changes-to-ground-vehicle-damage-models-en (search summary) |
| Shell and spall guide | https://senseos.gg/guides/war-thunder/shell-types-armour-spall-liners/ (third-party guide, search summary) |
| Manual autoloader article | https://happygamer.com/war-thunder-manual-autoloader-reloading-new-tank-modules-170520/ (third-party, search summary) |
| NVD forum guide | https://forum.warthunder.com/t/night-vision-devices-nvd/7415 (search summary) |
| Realistic battles wiki | https://wiki.warthunder.com/gamemode/realistic_battles (search summary) |

## How War Thunder does it

### Modules (Modules wiki)

- **Engine:** damage is gradual. A damaged engine loses a lot of power. A destroyed one stops the vehicle in Realistic and is likely to catch fire.
- **Transmission:** the same pattern: damaged means a large loss of drive, destroyed means no movement. It can catch fire.
- **Radiator:** a holed radiator overheats the engine. Left alone, the engine is damaged, loses power and finally stalls. A partly damaged radiator has no immediate effect.
- **Fuel tanks:** a hit can start a fire or cause an explosion that destroys the vehicle; HE is the most dangerous. A destroyed tank is removed, so it can no longer burn or shield what is behind it.
- **Breech:** a damaged breech can misfire. A destroyed one cannot fire in Realistic.
- **Barrel:** a damaged barrel is likely to fail. A destroyed one cannot fire in Realistic. It is quicker to repair a damaged barrel than to replace a destroyed one.
- **Horizontal and vertical drives:** two separate modules. Damage short of destruction does not slow aiming. A destroyed drive stops aiming on that axis entirely in Realistic; turning the hull is the workaround.
- **Tracks:** a lost track immobilises a tracked vehicle. Tracks repair on their own once the vehicle has stood still for "a few seconds". Tracks also add a little armour.
- **Ammunition:** a detonation usually destroys the vehicle. Empty racks cannot be hit, and racks empty in a fixed order. With protected stowage (the Abrams' turret bustle), blow-out panels vent the fire outwards and the crew survives if the partition is intact.
- **Autoloader:** when damaged it stops loading until repaired; the crew cannot load by hand. A round already in the breech can still be fired.
- **Fire-control system:** damage can take out the laser rangefinder, night vision, gun stabilisation and warning systems. Manual aiming and firing usually still work.
- **Electrical system:** damage can shut down the fire-control system and stabiliser and raises the risk of fire.
- **Driver controls:** if they fail the vehicle may be unable to move or steer.

### Crew (Modules wiki, damage-model roadmap)

- Each crew member is his own target. A wounded man keeps working at reduced effectiveness until he is knocked out for the rest of the battle.
- Wounded crew heal on their own after a delay.
- Any hit on a crew member stuns him briefly (damage-model roadmap, 2024).
- Most vehicles count as destroyed when fewer than two crew remain.
- Repair time depends on the crew: knocked-out members count as unskilled, which lengthens it.

### Fire and repair (roadmap post, assisted fire-fighting devblog, Modules wiki)

- Fire starts from a destroyed engine, a transmission hit, a fuel tank hit or electrical damage, and it damages modules inside.
- The standard fire extinguisher gives one use; the improved one adds a second.
- A light tank or squad mate can put out someone else's fire, spending one of his own extinguishers.
- The standard repair kit restores every module to partial function in the field. The improved kit is faster and removes the penalty.
- Repairs on a friendly capture point are faster, and players report that everything can be repaired there.

### Shells and penetration (penetration devblog, ballistics Q&A, damage mechanics wiki, shell guide)

- Full-calibre armour-piercing shells and APCR use the DeMarre formula. Fin-stabilised darts use the Lanz-Odermatt formula. Penetration at range follows from the shell's speed at that range.
- Explosive filler lowers an armour-piercing shell's penetration.
- Slope is handled per shell type. HEAT can ricochet at high angles depending on its fuse.
- A penetrating dart throws a cone of spall. A 2024 guide reports that darts throw most fragments 7° to 14° off the path, and that spall liners cut the effect.
- **Overpressure** replaced the old "hull break": when the crew compartment is exposed to a blast wave, the crew is knocked out. It comes from the explosive filling, not from a HEAT jet. HEAT, HESH and ATGM warheads only cause it through very thin plates (roughly under 15 mm), though large tandem missiles manage 20 to 30 mm. Armour-piercing shells need about 170 g of TNT or more.

### Loading (forum posts, manual autoloader article)

- The stated reload time applies to the first-stage (ready) rack. Once that is empty, loading is slower.
- The ready rack refills only while the gun is not being loaded.
- A human loader who is knocked out lengthens the reload. An autoloader's time does not depend on the crew.

### Gunnery (Stabiliser wiki, forum guides)

- **Stabilisers:** a two-plane stabiliser holds the gun steady on both axes at any speed. A single-plane one holds elevation only, and cuts out above a speed that varies by tank. After a rough ride the sight can settle before the gun does.
- **Rangefinders:** the measurable distance and error depend on the device. The sight's range setting starts at 200 m.
- **Thermal sights:** three generations, which differ in image detail. Thermals work in the gunner's sight, not in the outside view.
- Enemy markers, range read-outs and penetration indicators are not shown in Ground Realistic.

### Protection systems (APS wiki)

- **Soft-kill** systems such as Shtora-1 dazzle a missile's guidance. They only work on wire- or radio-guided (SACLOS) missiles without counter-countermeasures. Laser, TV and manually guided missiles are unaffected.
- **Hard-kill** systems detect an incoming missile or slow shell and fire a charge at it. They need a clear line to the threat, and an intercepted missile can still hit from momentum.

### Match rules (Realistic battles wiki)

- Vehicles cost spawn points, earned from kills, assists and captures. Aircraft need points earned on the ground first.

## What Island Front had before this work

| Area | Before |
| --- | --- |
| Armour | Plates with separate protection against darts and shaped charges, slope, ricochet angles |
| Shells | APFSDS, HEAT (tandem), HE with overpressure, autocannon AP and HE, wire-guided ATGMs, machine guns; penetration falls with range |
| Modules | Engine, transmission, fuel tanks, ammo racks, breech, barrel, one turret drive, tracks, sight |
| Crew | Driver, gunner, commander, loader; seat swaps take 5 s; destroyed below two crew |
| Fire | Burns crew and engine; unlimited extinguishing with a 40 s cooldown |
| Repair | R while stationary, 12 s, restores modules to 55 %, tracks fully |
| Loading | Fixed reload; a dead loader slows it; the loaded round stays until fired |
| Sights | Gun sight with zoom and a marker showing where the shell will land |

## Gaps and what was changed

| Mechanic | War Thunder | Island Front before | Change |
| --- | --- | --- | --- |
| Turret drives | Separate horizontal and vertical; destroyed means no aiming on that axis | One drive; destroyed slowed traverse to 15 % | Split into two modules; a destroyed one freezes its axis |
| Transmission damage | Large loss of drive when damaged | Only mattered when destroyed | Damaged transmission cuts power |
| Radiator | Leak overheats the engine until it stalls | Missing | Added to tanks and IFVs |
| Breech and barrel damage | Damaged breech misfires; damaged barrel may fail | Only destruction mattered | Misfire chance; a damaged barrel can burst on firing |
| Autoloader | Stops loading when damaged; chambered round still fires | Missing | Added to the T-90A and BMP-2 |
| Fire control | Loses rangefinder, night sight and stabiliser | Missing | Added; see gunnery |
| Tracks | Repair themselves after standing still | Needed the repair key | Automatic after 8 s stationary |
| Crew wounds | Gradual loss of effectiveness, healing after a delay | All or nothing | Wounded crew work slower; they recover slowly when not being hit |
| Fire extinguisher | One use, two with the improved kit | Unlimited with cooldown | Two charges |
| Capture-point repair | Faster and complete | None | Full, faster repair and restock on a checkpoint you hold or at base |
| Ready rack | Slower loading once the ready rack is empty; refills when idle | Missing | Added |
| Laser rangefinder | Sets the sight to the target's range | Missing | Added; the sight shows the range and the gun takes the elevation |
| Thermal sight | Gunner's sight only | Missing | Added: white-hot thermal view in the gun sight |
| Stabiliser | Lost with fire-control damage | Always perfect | Gun sways on the move once the fire control is out |
| Soft-kill APS | Shtora defeats SACLOS missiles without ECCM | Missing | T-90A: Shtora in a frontal arc, with a laser warning |
| Engine smoke | Smoke screen from the exhaust on vehicles that have it | Missing | T-90A and BMP-2 |

## Unverified

These points could not be confirmed from a page that loaded. Where the game needs a number, the value used is stated so it can be corrected.

- **Timings:** field repair time, extinguishing time, crew healing delay, the stationary time before tracks repair, and the ready-rack refill rate. Used here: 12 s repair (18 s with crew missing), 8 s for tracks, healing from 20 s after the last wound, one round back in the rack every 6 s.
- **How much slower loading is from the second-stage rack:** sources only say "slightly". Used here: 1.4 times the ready-rack time.
- **Shtora's arc and which missiles it defeats:** the wiki gives no arc. Used here: the real system's coverage, about 20° either side of the gun. TOW-2A and Konkurs are treated as affected; whether War Thunder gives TOW-2A counter-countermeasures was not confirmed.
- **Which vehicles have engine smoke, laser warning or which thermal generation** in War Thunder. The real T-90A has Shtora with laser warning and engine smoke; the real M1A2 has a second-generation thermal sight and no laser warning. Those real fits are used.
- **Default key bindings:** no source listed them. Island Front keeps its own keys.
- **Scouting, artillery call-in, commander sights and binoculars:** not researched in detail and not implemented.
- **Crew stun on hit:** from a 2024 roadmap post that may have changed; not implemented.
