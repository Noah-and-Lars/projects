# Stormworks: Build and Rescue - Core Mechanics, Modes, Progression (genre reference)

Scope: mechanics/economy/progression study for designing an ORIGINAL vehicle-building physics sandbox. Nothing here is to be copied (names, art, text, UI).

CONFIDENCE NOTE: Direct wiki fetches (fandom) returned HTTP 402, so numbers come from search summaries, Steam store pages and Steam forum anecdotes. Items marked [UNVERIFIED] are community anecdotes or my recollection of the game and should be checked against the in-game data files / wiki before use. No official payout table was found.

## Summary

- Base game: released 17 Sep 2020 (early access earlier), by Geometa; $24.99; Very Positive, ~90% of ~42k reviews. Windows + macOS.
- Pitch: build block-based vehicles, program them with a built-in logic/microcontroller system, and use them for rescue/transport in a large storm-swept ocean-and-island world. Workshop sharing and a mission editor extend it. Co-op and PvP multiplayer.
- Modes: Custom/Creative (no limits), Career (money-driven rescue-service sim), plus a "Classic" career variant where parts need research. Survival-difficulty toggles add engine/fuel modelling, damage, fire spread, and player-danger systems.
- Economy: start with about $20,000 and a small workbench at a starter base; earn per-objective mission rewards; also earn from container shipping, fuel trading, mining, oil drilling/refining, fishing. Parts are not refunded; spent parts go into the workbench inventory for reuse.
- DLC (all $9.99, $29.97 together; bundle "Complete Collection" ~$46.71): Search and Destroy (5 Oct 2021, modular weapons + conquest mode + AI enemies), Industrial Frontier (13 Oct 2022, arid mega-island, mining/refining/selling), Space (12 Oct 2023, rockets, orbit, space missions).
- Consensus criticism: building/simulation is excellent; career is shallow, repetitive, no storyline, money is the only motivation.

## Detailed findings

### Modes
- Custom Creative: no survival/realism limits, all parts, big builds from the start. Primary mode for builders.
- Career Survival: "build a rescue service from the ground up", manage finances, expand to cover the map. Difficulty options layer on advanced engine and fuel mechanics, vehicle damage, spreading fire, player dangers (drowning, cold, etc. [UNVERIFIED specifics]).
- Classic: behaves like career, main difference is components must be unlocked with research points. Some players prefer it because the newer career has all parts unlocked, so the only goal is money and one well-optimized boat suffices.
- Multiplayer: co-op multi-crew vehicles; PvP.
- Search and Destroy adds a conquest-style mode: fight AI air force and navy for control of objectives across the map.

### Money economy
- Starting funds about $20,000 at a starter base with a small workbench (wiki summary via search).
- Reward granted after each mission objective (per-objective, not only at the end).
- Anecdotal payouts [UNVERIFIED, mixed versions]: random crate deliveries ~5k-15k; a short (<5 min) rescue ~6k+; a long (30+ min) boat transport ~2k. A YouTube career video title mentions a first mission paying $110,000 (likely a modded/custom setting or later version). Lesson: payout was not well calibrated to effort/distance in at least some versions.
- Parts cost money when placed/spawned; parts are not refunded on deleting a vehicle but are retained in the workbench inventory and reused for the next build (design: "bought parts become a stockpile").
- Fuel: Industrial Frontier (v1.6.2) gave workbench tiles an internal inventory for diesel, jet fuel, coal and uranium ingots so fuel can be drawn from stored inventory instead of purchased. Diesel buy stations were added at all gas stations (Oct 2022). Coal became a physical resource (pour/hopper/furnace) in v1.2.1, and a resource-trading addon replaced older fluid gantries.
- Other income: container shipping, fuel trading, mining, oil drilling/refining, fishing.

### Research / unlocks
- Classic mode: research points awarded per mission; early reports 1-3 per mission, some items >20 points (2019 post). Later reports say points are plentiful so research is no longer a bottleneck. Community claims the research system has barely changed since introduction.

### Bases / tiles / workbenches
- Player starts with a starter base (small workbench). Expanding means buying other map tiles that have workbenches, hangars, docks, helipads, with larger workbenches allowing bigger builds. Exact prices and dimensions NOT verified; check wiki/in-game. [UNVERIFIED: the world is a grid of tiles, some purchasable, with workbench size tiers.]

### Missions
- Generated over time, pay in-game currency. Types seen across sources: rescue (people/survivors, often by helicopter or boat), cargo/crate delivery, towing, transport, firefighting, medical, fishing, oil rigs, mining; later space rescues/deployments/retrievals/repairs. Scoring is simply completion of objectives paying a reward; no star/quality rating is documented.
- Complaint: missions can spawn 15-20+ km away; long travel with little reward.
- Mission editor + Workshop allow user-made missions/addons (big longevity driver).

### Industrial Frontier (Industry & Logistics content)
- 400 sq km arid island. Mineral drill component; deposits of iron, aluminium, uranium, gold-bearing dirt; separate processing sites per resource (separator, foundry, power plant); refined ingots sold at a trading yard.
- Mineral exchange stations (truck-to-train transfer points) added later; trains exist since v0.5.1 era (12 km track with container terminals); train updates added braking changes and bogie derailment on sharp turns; logic node to dismount rolling stock. A default addon emphasizes truck and train logistics. I did not find a single patch literally named "Industry & Logistics"; treat the user's term as the combination of these.

### Space
- Liquid-fuel rockets, electrolyser for rocket fuel, RCS thrusters, reaction wheels, astronomy sensor; geostationary orbit ~300 km (v1.9.0); missions: rescue, deployment, retrieval, repair at space stations, moon bases, lunar surface.

### Search and Destroy
- Modular weapons assembled from receiver, barrel, belts/drums; cannons of several calibres, miniguns, machine guns; handheld weapons; AI enemies; ships replenish ammo after ~5-10 s so players must destroy weapons/fire-control radar. Conquest objective capture.

### Settings toggles
- Known: survival difficulty options (advanced engine/fuel, vehicle damage, fire spread, player dangers), infinite fuel/money/ unlocks via creative mode and custom game settings [UNVERIFIED which exact toggles exist in career]. Missions and some difficulty values are editable in data files per community.

### Tutorial
- Not researched in depth. [OPEN]

## What keeps players engaged / what frustrates

Engaged: the build-test-iterate loop; logic programming; Workshop vehicles/missions; emergent physics stories (storms, buoyancy, fire); multiplayer crews; DLC adding new domains (combat, mining, space).

Frustrated: career shallow/repetitive; no overarching story; money is only goal and one optimized vehicle trivializes it; missions spawn too far; payouts poorly scaled; research trivial; stagnant career development; parts not refunded.

## Design notes for our original game

Proposed core loop: Contract board -> pick contract -> choose/design vehicle (blueprint library) -> fit out at workbench using stockpile -> execute in physics world with hazards -> payout minus costs (fuel, repairs, lost parts) -> reinvest in upgrades/bases/tech -> unlock harder contract tiers/regions.

Economy tuning ideas:
- Payout = base(type) x distance x risk x time-pressure x cargo mass, minus a "recoverable value" so reusing a vehicle is profitable but a single mega-vehicle isn't dominant: add per-contract constraints (max tonnage, draft limit, pad size, noise/fuel caps).
- Running costs: fuel price per liter by region, hull wear/maintenance, docking fees, so efficiency matters. Make fuel stored in base inventory purchasable in bulk (as Stormworks later did).
- Refund policy: partial refund (e.g. 50-70%) on part recycle to reduce punishing iteration but keep sink.
- Tech tree: unlock by milestone/contract-type XP rather than flat points; gate by capability (engines, hydraulics, sensors) so unlocks open new mission classes.
- Regional expansion: buy tiles/bases with escalating cost; each tile gives workbench size, dock, helipad, storage; limit mission spawn radius to owned area plus a band.

Mission generator design: templates {type, origin, destination, payload, constraints, hazards, reward formula, expiry}; spawner weighted by player's owned bases, unlocked tech, difficulty; ensure distance bounded and diversity (no same type twice in a row); chain missions (supply chain: mine -> refine -> train -> port) for director-like direction; optional story arcs as scripted chains.

Data structures (sketch): Contract{id,type,seed,reward,penalties,objectives[],constraints,expires}; Objective{kind,target,conditions,state}; Base{id,tileId,workbenchTier,facilities[],inventory}; Inventory{partId->count, fluids, items}; Blueprint{parts[],logic,cost,massStats}; TechNode{id,prereqs,unlocksParts[],cost}; ResourceChain{nodes: producer/processor/market, recipes{in,out,rate}, prices with supply/demand drift}.

## Open questions
- Exact workbench/tile prices and sizes; exact mission payout formula; research point costs; full list of difficulty/infinite toggles; tutorial structure; Reddit sentiment (Reddit not reachable via search); whether Industrial Frontier adds a dynamic market price model.
- Next steps: read stormworks.fandom.com / wiki.gg pages and in-game mission/data XML for numbers.

## Sources
- https://store.steampowered.com/app/573090/Stormworks_Build_and_Rescue/
- https://store.steampowered.com/app/1542360 (Search and Destroy)
- https://store.steampowered.com/app/2124750 (Industrial Frontier)
- https://store.steampowered.com/app/2383250 (Space)
- https://store.steampowered.com/sub/760015 and /sub/544624 (bundles)
- https://en.wikipedia.org/wiki/Stormworks:_Build_and_Rescue
- https://stormworks.fandom.com/wiki/Gameplay/Gamemodes/Career (surfaced by search, fetch blocked)
- https://steamdb.info/patchnotes/9714038 and https://steamdb.info/patchnotes/12356266 (patch notes)
- https://www.greenmangaming.com/blog/new-stormworks-update-trains-and-microprocessors-out-now/
- https://steamcommunity.com/app/573090/discussions/0/3091137796286039370/ , /3200370471681507612/ , /3172198151270584837/ (career/payout threads)
- https://chalgyr.com/2021/06/review-pc-stormworks-buildandrescue.html
- https://www.youtube.com/watch?v=XOoGaG8QzXg
