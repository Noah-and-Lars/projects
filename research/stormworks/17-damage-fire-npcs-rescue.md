# Stormworks: Damage, Fire, Destruction, NPCs/AI, Rescue/Medical (genre reference)

## Research caveat (read first)
Research was heavily limited: wiki.stormworks.com did not resolve (not on the session network allowlist), stormworks.fandom.com returned HTTP 402, steamdb.info returned 403, Steam announcement pages returned only headlines (no body), reddit is blocked for search. So **very few hard numbers were verified**. Items are tagged:
- [V] verified from a fetched/search-snippet source (URLs at bottom)
- [M] from the researcher's background memory of the game, UNVERIFIED; treat as plausible, re-check if it matters
- [D] design suggestion for our game (not Stormworks fact)
Re-run with wiki.stormworks.com and steamdb.info allowed to fill numbers.

## Summary
- Stormworks has NO per-block hit points for ordinary structure in the classic sense; vehicles are rigid bodies of voxels, and damage is mostly: (a) fire, (b) flooding, (c) components breaking from impact/overheat/electrical faults, (d) block removal by explosions/weapons (Weapons DLC). [M] A forum reply [V] says a "blocks break past max health" model is infeasible given the compartment/buoyancy system, consistent with this.
- Fire (since v1.0, Sept 2020) is a spreadable surface fire: it creeps across vehicle surfaces, respects doors/compartments, is extinguished by internal water, damages components and characters it touches, can be started by damaged engine/electrical components [V]. v1.0.25 added vehicle-to-vehicle spread on contact where either contact point is burning [V]. v1.1.23-24 capped max vehicle fire spreads per tick for performance [V]. Mainland wildfires (v0.9.1-2 / Major Update #8, Oct 2019): trees burn and fire spreads over hours [V].
- Missions: procedurally generated (since 1.0), types include delivery, rescue, firefighting, large evacuations needing enough capacity for all stranded characters; v1.2.3 notes say mission survivors/fires scale with difficulty [V]. Rescue is the core theme [V].
- Search & Destroy DLC (Oct 5 2021) adds vehicle guns (modular: receiver, barrel, belt, drum), missiles/rockets/torpedoes with warheads, handheld pistol/SMG/rifle/grenades/C4, enemy NPCs and Conquest mode where enemy air force and navy stage assaults, defend/fortify, patrol and hunt the player [V]. Ammo payload types: kinetic, high-explosive (large splash), fragmentation (small splash + secondary projectiles), armor-piercing (penetration depends on velocity), incendiary (less damage, chance to ignite vehicle blocks) [V, via search snippet].
- Creatures: custom/creative mode can spawn kraken and megalodon; Industrial Frontier DLC adds land animals ("stormwoofs") [V]. Sharks/whales in ocean [M].

## Detailed findings

### Vehicle damage model
- Broken/damaged components rather than block HP [M]: engines overheat/fail, electrical components can be damaged (and then ignite) [V], batteries/fuel can burn.
- Impact: collisions apply forces; fragile parts (small blocks, wings, rotors, wheels, glass) can detach or be destroyed above speed/force thresholds [M, no numbers found]. Structure connectivity: parts held by welds/blocks; severed bodies split into separate vehicles [M].
- Explosions: fuel/warheads/C4/self-destruct produce blast that removes/damages blocks in radius; fuel tank detonation when burning [M]. Weapons DLC ammo types give HE large radius, frag small radius + secondaries [V].
- Flooding is the main "structural" failure: compartments (sealed volumes) fill via breaches; internal water extinguishes fire; pumps/piping empty compartments [V].
- Repair: workbench/vehicle edit mode lets you respawn/repair the vehicle in your home base [M]; field repair via welding torch for repairing/rebuilding (and cutting) vehicle blocks [M]. Fuel spawned is auto charged/refunded [V].

### Fire
- Spreadable fire system v1.0 [V]: fire moves along surfaces slowly, compartmentalised by doors, damaging components and players it touches; engine/electrical damage starts fires; internal water puts fire out so flooding a compartment is a valid tactic.
- Vehicle-to-vehicle spread on collision contact points [V]. Per-tick spread cap for perf [V].
- Extinguishing [M]: handheld fire extinguisher (limited charge), fire hose + water pump (hose/monitor/nozzle components; sea-water pump via pipes, "piping networks can carry water to fight fires" [V]), foam via foam tank/additive on hose, firefighting helicopters with water buckets/tanks. Fuel fires need foam/dousing [M].
- Wildfires [V]: trees ignite and spread over hours across the mainland; a 2021 Steam thread says crash fires may not ignite nearby trees, while mission-editor fire placed on trees or flares beside trunks do [V]. Fire grid ~50 m is from an unrelated firefighting manual, NOT Stormworks.
- Building fires: firefighting missions involve burning buildings/vehicles/rigs [M]; hospital/industrial areas [M].

### NPCs and rescue
- Stranded characters appear in rescue and evacuation missions; you transport and "escort all to safety" [V]. Characters are ragdoll-physics humans that can be picked up, carried, seated in vehicle seats, winched/hoisted, and can drown, burn, or die [M].
- Survivors are scored by being alive at delivery; dead survivors reduce/void the payout [M]. Medical: characters have a health bar; the player can use first-aid kit/medkit and defibrillator (revive) items, and oxygen/diving gear exists [M]. Exact injury list (burn, drowning, hypothermia, fall damage) and treatment rates were NOT verified. Hospital Island and NPC oil rigs exist as random island types [V]; hospitals as delivery destinations [M].
- Reward scaling: mission rewards and counts of survivors/fires scale with difficulty (v1.2.3) [V]; missions expire on a timer and are regenerated when you sleep [V].

### AI vehicles / enemies
- Pre-DLC: NPC ships/air traffic and populated areas (v1.0 "populated some areas with NPCs") [V, thin]. Some mods/add-ons mention enemy ship fire-control radars and ammo regeneration every 5-10 s, but that is a community add-on, not base game [V, add-on only].
- DLC: enemy vehicles hunt, patrol, defend, assault objectives; later updates arm AI vehicles with missiles/rockets/radar-seeking missiles and add armed enemy NPCs [V]. Conquest territory control.

## Player-facing feel
- Fire is scary and design-shaping: fuel/engine rooms need doors/compartments; flooding as an extinguisher is a clever trade-off [V]. Rescue is tense because time-limited, with fragile ragdoll survivors, and ship stability/flooding matter more than HP bars.

## Known problems
- Fire spread lag (hence per-tick cap) [V]. Crash fires failing to ignite trees [V]. Physics/Workshop breakage after reworks [V, Space update]. Ragdoll NPC handling is jank [M].

## Implementation notes for our original browser game
1. Per-voxel HP + connectivity: store hp (uint8) per voxel by material; damage events (impact impulse above threshold, blast radius with 1/r^2 falloff, fire tick) subtract hp; at hp<=0 remove voxel and mark region dirty. Run a bounded flood-fill from "anchor" voxels (hull core/keel) on dirty regions only (amortize across frames); any component not reaching an anchor becomes a debris rigid body (merge small ones into particles). Make fragile categories (glass, rotors, wheels) have low hp.
2. Compartments: maintain sealed-volume labeling per flood fill of air voxels; breach = adjacent voxel removal; water fills compartment volume at rate ~ hole_area*sqrt(depth). Water in compartment extinguishes fire there.
3. Fire CA: each flammable surface voxel has state {unlit, burning(t), burnt}; per tick (fixed 4-10 Hz, budgeted N spreads/tick like Stormworks) a burning voxel ignites each flammable neighbor with p = base * flammability * (door? 0 : 1) ; burning voxels deal dps to hp and to characters in/adjacent; fuel voxels (tanks) have a long burn then explode when hp or temperature crosses threshold. Extinguishers apply "wet/foam" counter that decays and blocks ignition; hose = particle/raycast stream applying wetness on hit.
4. Vehicle-to-vehicle: on collision contacts, if either contact voxel burning, ignite the other.
5. Wildfire (terrain): coarse grid (e.g. 4-8 m cells) with fuel, moisture, burn timer; slow spread, wind bias; trees as cell attributes.
6. NPC state machines: Idle/Wander -> Stranded (waiting, signals/flare) -> Grabbed/Carried -> Seated/Hoisted -> Delivered; hazards sub-states Burning, Drowning, Hypothermic. Health vector {hp, bleed, burn, oxygen, temperature}; oxygen drains underwater, temperature drains in cold water, burn from fire contact.
7. Treatment: items consume charges (medkit heals/stabilizes bleed, defib revives within a time window, blanket/warm room reverses hypothermia); stabilized patients stop decay; deliver to hospital zone to finalize. Score = base * fraction alive * time bonus - property loss; scale survivors/fires with difficulty.
8. AI vehicles: simple FSM (Patrol -> Detect -> Pursue -> Engage -> Flee/Repair); subsystem hit points (radar, guns) so damaging the fire-control cripples them; ammo types as damage profile structs {direct, blast_radius, frag_count, penetration, ignite_chance} mirroring the DLC list.
9. Creatures: shark/whale as steering-behavior agents with attraction to swimmers; kraken/megalodon as scripted bosses.

## Open questions
- Exact health values of characters, burn dps, extinguisher capacity, hose flow rates, fire spread probability/tick.
- Impact thresholds and how detachment/welding works internally.
- Medical item list and rates; mission payout formulae.
- AI targeting details and difficulty scaling.

## Sources
- https://store.steampowered.com/app/1542360 (DLC overview)
- https://en.wikipedia.org/wiki/Stormworks:_Build_and_Rescue (missions, DLC, pipes, creatures)
- https://steamcommunity.com/games/573090/announcements/detail/2949259187583541440 and https://store.steampowered.com/news/app/573090/view/2949259187583541439 (v1.0.25 headline: vehicle-to-vehicle fire spreading; body not retrievable)
- https://steamcommunity.com/games/573090/announcements/detail/2917725111236953034 (V1.0 Spreadable Fire System headline)
- https://stormworks.fandom.com/wiki/V1.0.0 , /V1.1.23-24 , /V1.2.3 (via search snippets; fetch blocked)
- https://steamdb.info/patchnotes/4293122/ (Mainland Wildfires update; via snippet)
- https://steamcommunity.com/app/573090/discussions/0/2960544821846552443 (tree ignition thread, via snippet)
- https://steamcommunity.com/app/573090/discussions/0/3427823723503699684 (block-health discussion, via snippet)
- https://steamcommunity.com/sharedfiles/filedetails/changelog/3315725001 (community add-on notes, not base game)
