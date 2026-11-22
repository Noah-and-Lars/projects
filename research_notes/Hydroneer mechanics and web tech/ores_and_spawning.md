# Hydroneer: Ores, Raw Materials and Spawning Mechanics (reference for an original mining game)

Scope note on versions (used throughout): Hydroneer released on Steam in May 2020 (the "one year on Steam" post is dated 2021-05-08). The developer says it "has never been listed as an Early Access game" ([Max, Steam news 2024-01-11](https://store.steampowered.com/news/app/1106840)). So the brief's "Early Access 2019, 1.0 in 2021" framing does not match the developer's statement. Major versions, all from the official Steam announcements feed ([Steam News API for app 1106840](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)):
- 1.3 (Jul 2020), 1.4 "Gem Crisis" (Sep 2020), 1.6 Logic/Power (Jan 2021), 1.7 Creative and Onyx (Nov 2021).
- 2.0 (8 May 2022): complete rework that brought in dirt tiers, tiered drills and harvesters, and Icehelm crafting.
- 2.0.6 (Jul 2022), 2.1 Farming (Dec 2022).
- 2.2 "Prospecting" (14 Apr 2023): Tier 3, Corestone and ore veins.
- 3.0 "Mega Patch" plus the paid DLC "Journey to Volcalidus" (5 Apr 2024). Patches 3.0.1 to 3.0.9 followed, the last in Mar 2025.
- "Mega-Optimization" (8 May 2026): the post calls Hydroneer "a finished title", says development ended in April 2024, and announces console ports with PlayEveryWare.
- The studio's next game is "Die Trying" (announced May 2025).
- I found no "Hydroneer 2" sequel.
Anything dated before 2.0 (May 2022) describes a different resource system and is marked OUTDATED below.

Source-reliability legend:
- [OFFICIAL] = developer patch notes or Steam news.
- [COMMUNITY-MEASURED] = player test rigs.
- [COMMUNITY-WIKI] = Fandom pages. The Fandom wiki is small (27 pages) and uneven. Its "Onyx" page appears fabricated, or written for a different game: it mentions an "Excavator", a "Vibrating Jig" and supply-and-demand pricing, none of which match Hydroneer. Do not use it.
- [GUIDE] = Steam guides. Several have since been removed by Steam, but their text is still readable.

The official community wiki is Bridgepour.com ([1.4 patch notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). It blocked automated fetches (ModSecurity 406), so none of its data is included here.

## Q1. What ores and materials exist, and where (maps, digsites, depths)?

### Takeaway
The base game (2.2 onward) has seven ground resources:
- Iron and Gold: common.
- Shards (also called "Crystal"): uncommon, unsellable utility item.
- Cloutium: rare, and pricey per unit of weight.
- Corestone: rare. Tier 2/3 depths only, and needed for Tier 3 gear.
- Gems: Emerald, Sapphire, Ruby, and super-rare Onyx. They come out uncut and must be cut.

The Volcalidus DLC (2024) adds Ice, Frost Rock, Hardstone and Diamond. Cobalt, arcanite, chromium, bismuth and "paydirt" do not exist in Hydroneer: none appear anywhere in the 2019–2026 patch notes. Depth is organised as three dirt tiers stacked by block depth inside purchasable digsites.

### Cited Findings
- [OFFICIAL] The list of raw resources covered by the "Save Raw Resources" option: "iron ore/gold ore/shards/cloutium ore/uncut gems" ([1.6 patch notes, Jan 2021](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] 2.2 added Corestone: "Found in Tier 2 and Tier 3 depths... required for the crafting of T3 machines". It is "slightly more common than Cloutium, not as expensive but can only be found in Tier 2 and Tier 3 depths" ([2.2 Prospecting Update notes, 2023-04-14](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] Onyx was added in 1.7 as a "super rare gem that has a 0.1% spawn chance", with uncut, compressed, ring and necklace forms ([1.7 patch notes, 2021-11-05](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] 2.0.6 changed gem prices and spawn rates. The ordering by expense and rarity is "Onyx is still expensive and rare, then Rubies, Sapphires, then Emeralds" ([2.0.6 notes, 2022-07-05](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [COMMUNITY-WIKI] Fandom calls Iron, Gold and Cloutium each "one of the seven main resources that you can acquire from the ground" ([Fandom Cloutium/Gold Ore/Iron Ore pages, via API](https://hydroneer.fandom.com/wiki/Cloutium)). Corestone is "the highest level of ore in the game and is exceedingly rare" ([Fandom Corestone, edited 2026-02](https://hydroneer.fandom.com/wiki/Corestone)).
- [COMMUNITY-WIKI] Shards "cannot be sold or crafted". They go into the Pressure Tank to re-pressurize water lines, and can be melted into a Shard Bar ([Fandom Shard](https://hydroneer.fandom.com/wiki/Shard)).
- [OFFICIAL] There is no water on Volcalidus. Water comes from melting ice, which uses an Ice Melter fed with lava ([DLC dev vlog 2024-03-24](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json); [Steam store DLC page](https://store.steampowered.com/app/2659380/)). The store page promises "new resources deep underground" and lava-powered machinery.
- [GUIDE] DLC resources ([Journey to Volcalidus DLC Mega Guide, Apr–May 2024, based on closed beta](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622)):
  - Ice: shovels or drills, 1 coin per weight. The top level always yields Ice.
  - Frost Rock: drills only, 1 per weight. More of it deeper.
  - Hardstone: cannot be smelted, must go through a Hardstone refiner, 8 per weight.
  - Diamond: a gem, less rare than Onyx.
  - The same split of Ice (shallow) vs. Frost Rock (deep, drill-only) and Hardstone needing a refiner is confirmed by [Gameplay.tips DLC guide, 2024-04-08](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html).
- [OFFICIAL] "Hardstone Blocks" exist as an item ([3.0.5 patch notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- Depth tiers in blocks:
  - [GUIDE] T1 = 0–8, T2 = 9–14, T3 = 15–22, bedrock = 23 ([Call Before You Dig: Dial 811, v2.0.2 updated toward 2.2, May 2023](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
  - Cross-check: T1 "8 grid squares", T2 "9-14", T3 "15-??" (player said "if I remember correctly") ([Steam discussion, mine depth tier](https://steamcommunity.com/app/1106840/discussions/0/832746831844812932/)).
  - Cross-check: T1 = floor 0–8, T2 to floor 14 ([GamesFuze, May 2022](https://gamesfuze.com/guides/hydroneer-2-0-tier-dirt-explained/)).
- [GUIDE] Minimum depths for the rare ores: Cloutium "requires digging at least one block deep", and Corestone "at least one block below T2 dirt" ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). In the DLC, Cloutium "only 2 blocks below the surface" and Corestone only in "Perma Frost (T2 Snow) and below, unless hand panning" ([DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622)).
- [OFFICIAL] Depth/tier quirks by site: Icehelm is a "horizontal dig site. Like normal dig sites, the deeper you go the better the resources" ([2.0 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Dreck Quarry's tier levels were adjusted so T3 drills work at the very bottom ([2.2.3 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- Base-game digsites (purchasable plots) and their costs, which two sources agree on:

  | Digsite | Cost |
  |---|---|
  | Ember Cradle | free (starter) |
  | Mildew's Aquifer | 970 |
  | Dreck Quarry | 1,200 |
  | South Hope | 6,600 |
  | Snowrune Falls | 7,000 |
  | Icehelm | 7,200 |

  Sources: [Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites); [Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
  - DLC sites: Dawn Rest is free; Waterside, Lumberton Bluff, Scoria Chamber, Cinder Footing and Shattered Breach are 5,000 each ([Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites)).
  - Site personalities ([dev vlog 2024-03-24](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)): Scoria Chamber "Dig down to get to lava!"; Shattered Breach "has a lava-duct running through it".
- [GUIDE] Mildew's Aquifer has a deliberately staged depth profile: the left side is a few blocks deep, the middle reaches T2, and the right reaches T3 down to bedrock ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
- [OFFICIAL] Relics are buried objects that spawn in the world and "will also not be destroyed by explosives" ([2.0.3 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).

### Inferences
- The ore roster follows a clear design: two bulk commons (Iron, Gold), one utility item (Shards), two rare progression gates (Cloutium for T2, Corestone for T3), and a gem family whose rarity scales with price.
- Biome or map variation is mostly flavour plus depth profile. Only the DLC changes the "dirt" medium (snow/ice/frost rock) and the power source (lava instead of water).

### Gaps
- I found no official per-digsite loot differences. Sources imply all base-game digsites share the same depth-based tables.
- I found no exact DLC drop table. Both DLC guides publish it only as an image.

## Q2. How are ores obtained (panning, drills, harvesters, veins, abandoned mines), and what are the drop chances?

### Takeaway
The core loop has no rock nodes:
1. Dig voxel dirt (shovel, pickaxe, TNT, nukes, Hydro Mole), or drill it.
2. Get "dirt chunks" as physics objects.
3. Process the chunks into ores and gems, either by hand-panning (pan + water + brush) or in a water-powered Harvester.

Drills do not remove terrain. They yield dirt chunks indefinitely at a fixed depth, and depth sets the dirt tier.

The measured base loot table for regular dirt (v2.2+) is about:

| Iron | Gold | Shards | Gems | Corestone | Cloutium |
|---|---|---|---|---|---|
| 50% | 37% | 5% | 5% | 2% | 1% |

Two community sources agree on these numbers. Onyx is about 0.1% (official). Ore veins make about 1/3 of drops the vein's resource.

### Cited Findings
- [COMMUNITY-WIKI] Panning steps: shovel dirt into a bucket, dump it into the pan, fill the bucket with water and pour it in, brush the pan, collect the valuables. New worlds start with bucket, brush, pan and shovel ([Fandom Panning, 2025](https://hydroneer.fandom.com/wiki/Panning)). [OFFICIAL] Since 2.0, "Pan now takes one scrub instead of two" ([2.0 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [GUIDE] "A bucket takes four shovel loads to fill" ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
- [COMMUNITY-WIKI] The Drill "doesn't drill up ores; it gives small dirt chunks" that you or a Harvester process ([Fandom Drill](https://hydroneer.fandom.com/wiki/Drill)). The Harvester takes dirt chunks in the top, outputs "Ores and uncut gems... via the front slot", is water-powered, and "Must be repaired when damaged" ([Fandom Harvester](https://hydroneer.fandom.com/wiki/Harvester)).
- [OFFICIAL] 2.0 tiered drills "do not remove the dirt under them, instead only work to a certain depth depending on their tier". Harvesters "will only work with dirt dug at certain depths depending on their tier". Pickaxes and shovels "dig to a certain depth depending on their tier" ([2.0 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [COMMUNITY] Tool tier rules: a T1 drill works only on T1 dirt, T2 on T1+T2, and T3 on all dirt ([Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/4417479689928960321); same in [GamesFuze](https://gamesfuze.com/guides/hydroneer-2-0-tier-dirt-explained/)). A "Ting" sound and/or sparks mean you have hit the next tier's border. The Hydro Mole vehicle digs all three tiers ([Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/832746831844812932/)).
- [OFFICIAL] Cloutium "can only be found under the ground now using drills. Will still spawn for pans at any level" ([2.0.6 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Hand panning therefore had a looser rare-ore rule than machines.
- [OFFICIAL] 2.2 balancing: "Shards are now slightly rarer; Cloutium is now slightly less rare" ([2.2 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [COMMUNITY-MEASURED] Regular dirt at a fixed depth (v2.2, Apr 2023): Cloutium 1%, Gold 37%, Iron 50%, Corestone 2%, Crystal (Shards) 5%, Gems 5% ([Steam "Ore Veins Data" thread, 2023-04-25](https://steamcommunity.com/app/1106840/discussions/0/3821909708353152671)).
  - Cross-check: Iron 50%, Gold 37.3%, Corestone 2%, Cloutium 1.1%, Shards 4.7%, Gems 4.9% ([Rainrune "Hydroneer Price Guide", Jun 2024, since removed by Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3265890693)). This may not be independent of the first source.
- [COMMUNITY-MEASURED] Pre-2.2 (v2.0.x, no Corestone): four T1 drills at Ember Cradle for about 2 h gave "mostly iron and gold, a decent amount of shards, about 4.5% normal gems, 1/8 of a percent onyx, and 3/4 of a percent cloutium". The run earned "almost 140,000 coins" (one drill about 35,000) ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). The 0.125% Onyx figure fits the official 0.1% ([1.7 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] Ore veins (2.2): "randomly spawned zones which when using a drill or shovelling into these zones will increase the chance of a certain resource spawning". They are found with the Prospecting Helmet (direction-based) or the Hydro Prospector vehicle, which "prospects downwards to find what type of vein is under the ground" ([2.2 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [COMMUNITY-MEASURED] Vein tables ([Ore Veins Data thread, 2023-04-25/26](https://steamcommunity.com/app/1106840/discussions/0/3821909708353152671)):

  | Vein | Sample | Main resource | Iron | Gold | Gems | Corestone | Other |
  |---|---|---|---|---|---|---|---|
  | Cloutium | over 10,000 cycles; repeat 10K gave about the same | Cloutium 33.3% | 33.9% | 25% | 3.6% | 1.2% | Crystal 3% |
  | Small Crystal | about 1,000 cycles | Crystal 36.6% | 33% | 25% | 3.3% | 1.1% | Cloutium 1% |

  - The poster describes this as a "x33+ increase on cloutium" over plain dirt.
  - Veins come in small, medium and large and are roughly spherical. The drill's bottom must be inside the radius. Center vs. edge made no difference.
  - Veins are generated with the map at "new game" and occur at any depth.
  - A reply (BearlyKodiak) gives the rule as "1/3 of resources collected are of the vein type" with the other 2/3 from the normal depth table. Another reply disputes it, saying the flat rates are lower than in regular dirt.
- [GUIDE] Depth changes nugget weight, not ore odds: "verified for gems, iron, gold, and cloutium" ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). Same claim from the vein tester: "Chunk weight depends on depth, and veins only change drop rates" ([Ore Veins Data](https://steamcommunity.com/app/1106840/discussions/0/3821909708353152671)).
- [COMMUNITY] A forum commenter says soil type mainly makes gems larger rather than more frequent ([Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/4417479689928960321)). This is anecdotal.
- [OFFICIAL] "Harvesters are now effected by pressure to produce better resources" ([2.0.6](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). [GUIDE] says higher water pressure "increases the chance of extra nuggets from harvesters" ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
- [GUIDE] Throughput:
  - A T1 drill outputs one dirt chunk about every 5 s.
  - One harvester can process dirt from "300 drills or more".
  - Max water pressure is T1 180, T2 370, T3 510. Machines run efficiently above half of max, and a T1 drill runs at least 89% speed at 0 pressure.
  - Source: [Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
- [OFFICIAL] Drills and harvesters cap the pressure they accept at their tier's maximum ([2.0.6](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] An exploit was removed: "Removed ability to spam-click drills to produce more resources" ([3.0.5](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Speed-buffed drills had been outputting less than slower ones (fixed), and Heavy Drill output was boosted ([3.0.7](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [GUIDE] Excavation tools ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)):
  - The pickaxe removes a slightly larger area than the shovel, and shovel and pickaxe clear the same amount at every tier.
  - TNT clears roughly a 1-block area.
  - A Mini Nuke clears a roughly spherical 3-block radius. Space them 4–5 blocks apart.
  - Explosives release Scrap as a by-product ([Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites)).
- Abandoned mines, a timed passive source that appeared with 3.0 (2024):
  - [COMMUNITY] A restored mine's switch picks one of two ores. Nugget weight grows with game time since the last nugget: "The longer you wait, the bigger the Nugget" (example: a 251-weight iron nugget) ([Steam thread, 2024-04-20](https://steamcommunity.com/app/1106840/discussions/0/4365752495735867565)).
  - A reply says the pairs are fixed per mine (iron/gold, shards/hardstone, cloutium/corestone). The original poster thought they were random, so the sources conflict.
  - [GUIDE] DLC miners ([DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622)): East Shelf iron/gold up to 300 wt at 1 wt per 10 s; West Shelf hardstone/shard up to 500 wt at 15 wt per 10 s; The Barrens corestone/cloutium up to 100 wt at 1 wt per 10 s.
  - Cross-check: East Shelf 300 wt, 1 wt per 10 s. Build costs: East 800 Hardstone Block + 1,200 Iron Bar; West 2,300 HB + 1,400 Iron Bar + 30 Cloutium Bar; Barrens 9,800 HB + 900 Corestone Bar + 400 Cloutium Bar ([Gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)).
- [GUIDE] DLC ice processing: shovelled snow becomes Ice, and lava melts the Ice to release resources (the hand-panning analogue). Harvesters convert Ice into ores. The Ice Melter turns 1 wt Ice into 1 water, which gives 2 s of pressure at 250, and Frost Rock cannot be melted ([DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622)). Shallow digging gives only ice, deeper drilling gives more frost rock ([Gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)).
- [OUTDATED, pre-2.0] Earlier versions had an Excavator vehicle (removed in 2.0, replaced conceptually by the 2.2 Hydro Mole) and a "Goliath Drill" ([2.0 and 1.4 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- No sluice appears anywhere in the 2019–2026 announcements. A web-search summary attributed a "sluice"/"Hog" description to a PC Gamer Hydroneer article, but that article is actually about the different game *Gold Rush* (2017) ([PC Gamer](https://www.pcgamer.com/dig-for-gold-in-this-early-access-mining-sim-and-then-keep-digging-and-then-dig-some-more)). Do not attribute sluices to Hydroneer.

### Inferences
- Design pattern: an infinite-yield drill at a chosen depth plus a weighted random table per processed chunk. Depth scales the weight (value) of each drop, not the odds. Veins re-weight the odds locally. Pressure gives a bonus chance of extra items. This is easy to implement: one table roll per chunk, then a weight roll from a depth distribution.
- The near-identical regular-dirt numbers suggest an underlying table of roughly Iron 50 / Gold 37 / Shard 5 / Gem 5 / Corestone 2 / Cloutium 1 (out of 100). Gem sub-weights follow Emerald > Sapphire > Ruby >> Onyx (about 0.1% of all drops).

### Gaps
- I found no datamined drop table (no pak/blueprint extraction post). All percentages are test-rig measurements.
- Exact gem sub-ratios (Emerald, Sapphire, Ruby) are unknown.
- The per-scrub panning chance and the number of items per panned bucket are unknown.
- The size of the pressure bonus (extra-nugget chance vs. pressure) is unquantified.

## Q3. How do ores physically behave (physics objects, weight, size, stacking, splitting, clumping, despawn)?

### Takeaway
Everything is a physics object and there is no inventory. Each ore piece carries a continuous "weight" value: unitless "wt", measured on a Scale that shows value above and weight below. Pieces roll, pile and can be conveyed or magnetised. Bars and gems can be split with saws or chisels. Ore nuggets cannot be merged, but gems can be compressed into one. Large piles cause performance problems, so the developer added "sleep" handling, minimum sizes and save toggles instead of despawning.

### Cited Findings
- [PRESS] "All resources and objects can be picked up and dropped, and they interact with the environment. There is also no inventory system" ([TheXboxHub review](https://www.thexboxhub.com/hydroneer-review/)). PC Gamer ran a feature on the no-inventory design ([PC Gamer](https://pcgamer.com/i-cant-decide-if-having-no-inventory-system-in-this-crafting-game-is-brilliant-or-brutal)).
- [OFFICIAL] Physics tuning ([1.4](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json); [2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)):
  - "Lowered centre of gravity for resources to reduce rolling on conveyor belts and improve performance" (1.4).
  - "Increased visual minimum resource size by 25%" (1.4).
  - "Shard has a better collision box to improve movement on conveyor belts" (1.4).
  - "Picking up ores from a large pile will no longer wake up all ores around itself" (2.0). This means pile physics bodies sleep.
- [OFFICIAL] Containers ([3.0 notes and dev vlog 2024-03-24](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)):
  - "Moving around with a pan full of thousands of resources will no longer lag". There may still be a hitch on pickup or pour.
  - "Coins/Tokens/Seed Bags/Dirt/Cut Veg now stack whilst they're stored by a Truck/Pan/Bucket". Ores themselves are not listed as stacking.
  - Magnets no longer pull items stored in pans/buckets.
  - All items can be magnetised and conveyored ([2.2](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [GUIDE] Before 3.0, guides warned that containers glitch above roughly 20–50 items ("about 35 items", "around 20 items maximum", "50 ores or so"; the guide is internally inconsistent) ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
- [OFFICIAL] Dirt-chunk behaviour:
  - "Increased dirt chunk max scale size" and "Greatly decreased the chance that tiny specs of dirt will appear when digging" ([2.1.1](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
  - Dirt chunks are textured by the tier they came from ([2.0.6](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
  - Harvester anti-clog fixes ([2.0.3, 2.0.5, 2.0.6](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
  - [GUIDE] Deeper digging pulls bigger dirt chunks, which then need dirt grinders/shredders ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
- [OFFICIAL] There is no timed despawn. The persistence toggles are:
  - "New gameplay option to toggle whether to save raw resources" ([1.6](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
  - "Save Dirt Chunks / Save Raw Resources" options ([2.0.6](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
  - "Very small scrap metal pieces will now be removed when selling to the jeweller" ([2.2.3](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
  - No "despawn" term appears in any announcement.
- [COMMUNITY] Weight is read on a Scale: the "top number is VALUE while the bottom number is WEIGHT". The unit is debated (grams vs. a bare number) ([Steam "How do you know the weight"](https://steamcommunity.com/app/1106840/discussions/0/595139465034351875/); [Steam "A question of weights"](https://steamcommunity.com/app/1106840/discussions/0/834998413871353502/)). Guides write "wt" ([DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622)).
- [GUIDE] Typical nugget weights by depth: surface about 0.5 avg; bottom of T1 (8 blocks) about 3.4; bottom of T2 (14 blocks) about 4.3 ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
  - This conflicts with [COMMUNITY-WIKI]: "maximum weight currently recorded from Tier 1 dirt is 2.53" (flagged "Need update and verify") ([Fandom Iron Ore](https://hydroneer.fandom.com/wiki/Iron_Ore)).
  - A player reports that "3.5+ weight nuggets are Tier 3 weight" ([Steam thread](https://steamcommunity.com/app/1106840/discussions/0/4365752495735867565)).
- [COMMUNITY] Quest thresholds are strict: a request for a 1.5-weight nugget accepts 1.5 or more but rejects 1.48 ([Steam search result, abandoned-mines discussion](https://steamcommunity.com/app/1106840/discussions/0/4365752495735867565)).
- [OFFICIAL / COMMUNITY] Splitting and merging:
  - A Gem Chisel splits gems; saw, cooking knife, chisel and pickaxe each split only their intended item type plus currencies ([2.2](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
  - Bars can be halved with a Saw, or precisely split with the Logic Saw Hook ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)).
  - The keypad for precise splitting accepts whole numbers only ([Steam discussion via search](https://steamcommunity.com/app/1106840/discussions/0/3951407046156696747/)).
  - "Ore nuggets cannot be merged" ([Steam thread](https://steamcommunity.com/app/1106840/discussions/0/4365752495735867565)).
  - The Gem Compressor merges gems into one larger gem. Since 2.0 it outputs regular gems, not "Composite" gems, and does not take uncut gems. Since 2.1 it compresses as gems enter ([2.0, 2.1 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] Item sorting: the Hand Sorter (water input) splits poured resources into categories ([2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).

### Inferences
- For a browser game: give each ore entity {type, weight}, derive its visual scale from weight, and enforce a minimum render size. Batch or "sleep" pile physics, or store items in containers as abstract lists, to avoid what Hydroneer ran into: lag with thousands of pieces.

### Gaps
- There is no official unit definition for weight.
- There is no density figure, i.e. how weight maps to mesh scale.

## Q4. How do purity, quality and weight affect value?

### Takeaway
Hydroneer has no purity or quality stat. Value = base value per weight × weight, and the multiplier rises with each processing step (ore → bar → crafted item). Depth affects value only by making pieces heavier.

| Item | Value per weight |
|---|---|
| Iron ore | ~9–10 |
| Iron bar | 12 |
| Gold ore | ~16–17 |
| Gold bar | 20 |
| Cloutium ore | 170 (official) |
| Cloutium bar | 200 (official) |
| Corestone | ~22 (single source) |
| Common gems, uncut / cut | ~15 / 25 |
| Onyx, uncut / cut | 150 / 250 |
| Diamond, raw / polished | 150 / 250 (DLC) |

### Cited Findings
- [OFFICIAL] "Cloutium Ore now costs 170 per 1 weight instead of 35. Cloutium Bar now costs 200 per 1 weight instead of 40" ([2.0 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Cross-check: Fandom gives "Weight 1 / Value 170" ([Fandom Cloutium](https://hydroneer.fandom.com/wiki/Cloutium)), and Rainrune gives 170c ([Price Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3265890693)).
- [COMMUNITY-MEASURED, v2.0.x, 2022-06-19] Values per weight ([Steam "Item Price Guide" thread](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/)). The developer locked the older 2020 data in this thread as outdated.

  | Item | Ore or uncut | Bar or cut |
  |---|---|---|
  | Iron | 9.5 | 12 |
  | Gold | 16.7 | 20 |
  | Cloutium | 171.3 | 200 |
  | Emerald / Sapphire / Ruby | 15 | 25 |
  | Onyx | 150 | 250 |

  | Crafted item | Value per weight |
  |---|---|
  | Dagger | 13.2 |
  | Axe | 14.4 |
  | Sword | 15.6 |
  | Gem necklace | 24.8 |

- Cross-checks for these numbers:
  - Fandom: Iron ore 9:1, Iron bar 12:1, Gold ore "1 Weight / 17 Value" ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar); [Gold Ore](https://hydroneer.fandom.com/wiki/Gold_Ore)).
  - Fandom worked example: a 400-weight iron bar is worth 4,800; a dagger from it 5,280 (13.2:1); an axe 5,760 (14.4:1); a sword 6,240 (15.6:1) ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)).
  - Rainrune (Jun 2024): unrefined Iron 10, Gold 16, Cloutium 170, Corestone 22, Hardstone 8; refined gems Emerald 22, Ruby 25, Sapphire 26, Onyx 250, Diamond 250; "Refined metal is +30%" ([Price Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3265890693)). This guide's ordering (Sapphire above Ruby) conflicts with the official 2.0.6 ordering (Ruby above Sapphire), and it has self-admitted formula errors.
- [GUIDE] Crafting multipliers over the bar's value: Dagger 1 bar +10%; Ring 1 bar + 1 gem +10%; Axe 2 bars +20%; Necklace 2 bars + 1 gem +20%; Sword 3 bars +30%. Bar uplift before 2.2: iron +33%, others +18%. Gem cutting uplift: Ruby +55%, Sapphire +67%, Onyx +67%, Emerald +83% ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). The +10/20/30% weapon steps agree with the Fandom and Item Price Guide ratios above (12 → 13.2 / 14.4 / 15.6).
- [OUTDATED, Jun 2020, v1.x] Iron Ore 12, Gold Ore 20, Gems 25, Dagger 15, Axe 16, Sword 17, Ring 26, Necklace 28. Formula "Payout = Base Value × Weight", which the developer confirmed in Jun 2020 ([Item Price Guide thread](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/)). A 2022 commenter's 840.17-wt sapphire necklace paid about 20k against a predicted 23.5k, which is unexplained.
- [OFFICIAL] Stock market: redesigned in 2.0 to "only purchase certain resources" ([2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Earlier it was reworked to behave "more realistically" ([1.6](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). [COMMUNITY-WIKI] The stock market can pay up to 110% of base, e.g. iron bar 13.2:1, but rarely does ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)). [GUIDE] Prices change daily or after each sale ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
- [OFFICIAL] Scrap: "Scraping items will give you scrap metal that costs 25% of the original value. Scrap Bars will increase the value of the Scrap metal by 2" ([2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [GUIDE] DLC per-weight values ([DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622); [Gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)):
  - Ice 1 and Frost Rock 1 (both sources).
  - Hardstone 8 raw or refined (both sources, and Rainrune also gives 8).
  - Diamond 150 raw / 250 polished (Mega Guide); Gameplay.tips lists 250, presumably polished.
- [OFFICIAL] Crafted-item size variance: "Decreased the starting scale range of crafted items, and increased the max range" ([2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Scales show the total weight of crafted items by their contents ([2.2.2](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).

### Inferences
- The one-dimensional "weight" stat stands in for both quantity and quality. That is a simple, effective model for an original game: value per weight by material, times a processing-stage multiplier (ore ×1, bar ×~1.2–1.3, item ×1.1–1.3 more), times weight.
- The ratio pattern: commons about 10–20 per weight, rares about 10× higher (Cloutium 170), and top gems about 250.

### Gaps
- I found no datamined value table. Corestone, Shard-bar and Hardstone-block values come from a single source or are missing.
- The gold-ring and gold-necklace multipliers after the 2.2 anvil rework are not confirmed.

## Q5. What is the processing and smelting chain (ore → bar → crafted items, casts, forge, alloys)?

### Takeaway
The chain runs:
1. Ore nugget: melt it in a Crucible over a fire source, then pour it into a Casting Mold. Alternatively use a Smelter, or the automated Logic Smelter.
2. Bar: weight is conserved and value per weight goes up.
3. Anvil: bars (plus gems) become weapons or jewellery. Since 2.2, any material except shards can be used.
4. Icehelm Masterwork Forge: bar weight becomes machines (drills, harvesters) and masterworks.

Gems: uncut → cut (gem cutter/polisher) → optionally compressed. There are no alloys. Mixing materials was in fact prevented.

### Cited Findings
- [COMMUNITY-WIKI] Ore "can be smelted in a crucible being heated by a fire source for long enough... pour the mixture... into a Casting Mold"; the Smelter is "semi-automated... come with it own Casting Mold" ([Fandom Iron Ore](https://hydroneer.fandom.com/wiki/Iron_Ore)). Iron bars come from Crucible + Casting Mold, Smelter, or Logic Smelter ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)).
- [GUIDE] Weight is conserved through smelting and crafting. Blueprint crafting takes a total metal weight: "300 iron, with a 305 iron bar returning 5 iron" ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). Consistent with this, a 400-weight bar makes 400-weight weapons ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)).
- [OFFICIAL] No mixing or alloys:
  - "Smelter and Logic Smelter no longer accepts resources that are different to the current smelted resource" ([2.1.1](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
  - Before 3.0, a crucible holding melted gold deleted iron ore that was poured in. Since 3.0 the ore "will just fall into the crucible and not delete" ([3.0 notes and dev vlog](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
  - Gold and Cloutium liquid colours were changed to tell them apart ([3.0.5](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] Heat model: bars "smelt in a semi-hot state" ([1.6](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). "Rate of crucible/bars heating up increased" ([2.2.2](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Creative mode heats 10× faster ([2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Exact times were not found.
- [OFFICIAL] Anvil: "Complete Anvil crafting rework. Weapons and Jewellery can now be crafted by using any material besides shards. Anvil is also doubled in size" ([2.2](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). A bar balanced across two slots can no longer craft twice ([2.2.4](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). [GUIDE] Weapons need bars only; jewellery needs bars plus gems ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). [COMMUNITY-WIKI] Before 2.0, iron bars could only make weapons ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)).
- Machine crafting at Icehelm (blueprint bought once, then bar weight paid per unit) ([Fandom Drill](https://hydroneer.fandom.com/wiki/Drill); [Fandom Harvester](https://hydroneer.fandom.com/wiki/Harvester); single source):

  | Machine | Blueprint | Bar weight per unit |
  |---|---|---|
  | T1 Drill | 184 | 300 iron |
  | T2 Drill | 1,320 | 1,000 iron + 150 cloutium |
  | T3 Drill | 2,460 | 800 corestone + 500 cloutium |
  | T1 Harvester | 122 | 100 iron |
  | T2 Harvester | 980 | 500 iron + 50 cloutium |
  | T3 Harvester | 1,130 | 600 corestone + 200 cloutium |

  The first T1 drill and harvester are sold once by a travelling merchant or Ember Cradle vendor ([2.0 notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] Pipes are also tiered: Forged Iron, then Cloutium, then Corestone ([2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json); [2.2](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). A line's pressure is capped by its weakest pipe ([2.2](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [GUIDE] DLC Forge Marks:
  - They are refined at Shattered Outpost (3:20 refine time) and added to the Masterwork Forge crucible.
  - They roll a random buff of up to 3 stars, or a defect of up to "3 skulls".
  - Possible buffs: hand tools get Speed or Dig Size; drills get Speed or Output Size; harvesters get Vein or Output Size.
  - Ice output by quality ([DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622)):

    | Tool | 3 skulls | No stars | 1 star | 2 stars | 3 stars |
    |---|---|---|---|---|---|
    | Lava Drill | 0.8 | 1 | 1.15 | 1.3 | 1.5 |
    | Heavy Lava Drill | 2.4 | 3 | 3.45 | 3.9 | 4.5 |
    | Shovel | 0.5 | 1 | 2 | 3 | 4 |

  - Gameplay.tips confirms the same buff list and that forge marks respawn elsewhere when picked up ([Gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)).
- [OFFICIAL] Gems: Compressed Gems (1.4) "can be used in crafting just like regular gems" ([1.4](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Gem cutter and polisher conveyor hooks exist ([2.0, 2.0.3](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Uncut gems cannot be sold at the stock market ([3.0.5](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). [COMMUNITY] Compressed gem value appears to depend on weight, not on whether the inputs were cut ([Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/3135045355780823879/)).
- [OFFICIAL] Shard bars go in pressure tanks ([3.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). [GUIDE] Hardstone goes through a refiner into Hardstone Blocks, which are a building currency for DLC miners ([Gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)).

### Inferences
- The progression loop is: rare ore gates the next machine tier, which allows deeper digging, which gives heavier ore and access to the next rare ore. Iron → Cloutium (T2) → Corestone (T3).
- Weight conservation through every stage makes the economy legible, because every step is a pure value-per-weight multiplier.

### Gaps
- There is no exact smelt time, crucible capacity or cooling time.
- There are no masterwork recipe weights beyond drills and harvesters.

## Q6. Are there rock nodes or deposits with respawn timers, hit counts and tool tiers?

### Takeaway
There are no classic rock nodes. Terrain is voxel dirt inside finite purchasable digsites. Tool tier gates which dirt layer you can dig, there are no hit counts, and dug terrain does not regrow. Infinite supply comes from drills, which never deplete their spot. The "respawning" analogues are:
- Ore veins, fixed at world generation.
- Abandoned mines, which accumulate weight over time up to a cap.
- DLC Forge Marks, which respawn elsewhere when taken.

### Cited Findings
- [OFFICIAL] The voxel plugin drives digging ([2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). The developer cites "pretty harsh technical limitations... with the technical side of terrain digging" as the reason for limiting digsite count and size ([dev vlog 2024-03-24](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] Drills "do not remove the dirt under them" ([2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). The Dirt Wand can re-place dirt anywhere in a dig site ([2.2.4](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [COMMUNITY] Veins are generated with the map at new game and revealed by digging or prospecting ([Ore Veins Data](https://steamcommunity.com/app/1106840/discussions/0/3821909708353152671)).
- [COMMUNITY / GUIDE] Abandoned-mine accumulation: time since the last nugget sets the nugget's size ([Steam thread](https://steamcommunity.com/app/1106840/discussions/0/4365752495735867565)). The DLC miners have caps of 100–500 wt and rates of 1–15 wt per 10 s ([DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622)).
- [GUIDE] Perma Frost (T2/T3 snow) cannot be dug with T1 tools or melted by dripping lava. Lava Thaw upgrade modules let you dig it ([DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622)). The Lava Thaw is a "flamethrower wielding vehicle that is used to dig terrain" with "upgrade modules that allow it to dig deeper" ([dev vlog 2024-03-24](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)).
- [OFFICIAL] Machines take durability damage and need repair with spanners/toolbags. Broken drills and harvesters play a sound ([2.2.3](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json); [2.0](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json)). Exact wear rates were not found.

### Inferences
- For a browser game, Hydroneer's model is: finite diggable volume, a layered tier map that hard-gates tools, infinite stationary extractors, and procedural hotspots (veins). This avoids respawn-timer design entirely.

### Gaps
- I found no machine durability or wear rates, and no harvester repair intervals.
- I found no YouTube transcripts or Reddit threads with additional numbers. Searches for r/Hydroneer surfaced only Steam threads.
- I found no datamine or modding (pak/UE asset) dump of loot tables. Mod tools such as the "Terrain Manipulator" and "Ore Vein Tool" mods, and a resource-counter save, are mentioned, with full results said to be on the Hydroneer Discord ([Ore Veins Data](https://steamcommunity.com/app/1106840/discussions/0/3821909708353152671)). I could not access the Discord.
