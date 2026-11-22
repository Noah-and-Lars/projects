# Hydroneer: Economy, Currency and Progression Systems

Scope: how money and progression work in Hydroneer (Foulball Hangover, Unreal Engine), as a reference for designing an original browser mining/automation game.

**Version context (needed to date every number below).** The caller's dates (Early Access 2019, 1.0 in 2021) do not match the primary sources:
- The developer started Hydroneer solo in 2019 ([1M players post, 2025-06-18](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1802893906702139)). Pre-Steam builds were on itch.io.
- The Steam release was 8 May 2020 ([Fandom: Hydroneer](https://hydroneer.fandom.com/wiki/Hydroneer)). Anniversary posts in May 2021 and May 2023 match this date ([Steam News API listing](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=200&maxlength=0&format=json)).

Major milestones:

| Version | Date | What changed |
|---|---|---|
| 1.3 Engineering | Jul 2020 | Added Cloutium |
| 1.6 Logic & Power | Jan 2021 | Reworked the stock market |
| 1.7 Creative | Nov 2021 | Fishing expansion, Onyx |
| 2.0 | 8 May 2022 | Free overhaul update, multiplayer, Icehelm, new price model |
| 2.1 Farming Season | 9 Dec 2022 | NPCs, Farming Guild Tokens |
| 2.2 Prospecting Update | 14 Apr 2023 | Anvil quests, Prospecting Guild Tokens, "For The King!" main quest |
| 3.0 + DLC | 5 Apr 2024 | "Journey to Volcalidus" DLC (US$9.99–10) plus a base-game mega patch |
| 3.0.8 | Jun 2024 | Patch |
| 3.0.9 | Mar 2025 | Save-corruption fix |
| Console + Mega-Optimization | 8 May 2026 | PS5 / Xbox Series release and a PC optimisation patch |

The developer says they "finished Hydroneer in April 2024" ([Consoles post, 2026-03-01](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1825727806715718); [Xbox Wire, 2026-04-30](https://news.xbox.com/en-us/2026/04/30/hydroneer-brings-years-of-updates/)). Economy numbers have therefore been effectively frozen since about 2.2–3.0 (2023–2024). Anything from 2020–2021 (v1.x) is OUTDATED, because 2.0 rewrote prices.

Source-quality notes:
- **Official:** Steam patch notes and developer posts.
- **Small community wiki:** hydroneer.fandom.com (27 pages; read through its MediaWiki API, `https://hydroneer.fandom.com/api.php`). The Fandom "Onyx" page reads like AI-generated filler. It claims supply-and-demand pricing and an "Excavator", neither of which any other source supports, so it is excluded.
- **Not reachable:** hydroneer.wiki.gg (blocked to automated access), Reddit (blocked), and NamuWiki (blocked).
- **Steam guides:** Several community guides now show a Steam "removed / incompatible" banner but are still readable. Their numbers are community measurements, not datamines.
- **No datamine:** I found no datamined price table, so all per-weight prices are community-measured.

## 1. Currency, earning and selling (sell points, vendors, price variance)

### Takeaway
The main currency is physical **Hydrocoins** ("c"). Coins are 3D objects that stack, can be split, and are carried in buckets and trucks; there is no wallet or bank. Money comes from physically hauling goods to a counter:
- **Jeweller:** the universal buyer, at a fixed price per unit of weight. Prices are the same in every town.
- **Grocer:** buys crops, soup and fish.
- **Scrapyard:** pays 25% of item value as scrap metal.
- **Town stock markets:** six, one per town, each buying one item category at a fluctuating price. The price changes daily and drops after you sell (saturation).

Patches 2.1–3.0 added three secondary, non-purchasable currencies, earned only from quests: Farming Guild Tokens, Prospecting Guild Tokens and Scout Guild Tokens (DLC).

### Cited Findings
**Coins are physical objects**
- Coins and tokens physically stack when dropped together. Since 3.0 they also merge while stored in a truck, pan or bucket; before that they could not combine there because they had no collision ([Max's message, 2024-01-11](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533); [Mega Patch 3.0, 2024-04-05](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366); [2.2.5 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5124584686246033158)).
- Coins can be cut with splitting tools: "Saw/Cooking Knife/Chisel/Pickaxe ... as well as currencies" ([2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)). Splitting coins on scales updates the scale reading ([2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)). Coins can be stored on Plinths ([2.2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519503928900)).
- Coin bugs that show coins are simulated objects:
  - Coins got stuck in carts ([3.0.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364315376209)).
  - Coins dropped into cobwebs could not be picked up ([2.0.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4292505348839841359)).
  - Coin text display was overhauled in 3.0.6 with grouping such as "1,420,690" and a separate colour per currency type ([3.0.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6474562312195671416)).
- **Lead check, bank / wallet / debt:** I found no bank, account, loan or debt mechanic. A 2020 new player asked whether there is a "wallet" and where to store money, and got no answer ([Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/2953755177909014869)). Storage is physical: buckets, plinths, and the decorative "Safe" for 450 c ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)).
- **Lead check, coin press:** I found no evidence of a coin press or minting mechanic. Coins come only from selling and from quest rewards.

**Selling flow and buying flow**
- Selling: put the pan or bucket of resources on the jeweller's wooden desk and press the sell button. Coins come out into the container, and you carry them to a store to spend ([Gamesfuze 2.0 beginner guide](https://gamesfuze.com/how-to/hydroneer-2-0-how-to-start-beginners-guide/)). Another walkthrough describes the same flow: put the bucket on the shop table, see the price, accept, receive coins ([Showgamer walkthrough](https://showgamer.com/en/kak-igrat-v-hydroneer)).
- The jeweller removes very small scrap pieces when you sell, to stop micro-item clutter ([2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166)).
- Buying uses physical coins placed in a store "tray" plus a "buy platform" that shows the total:
  - One bug let stores keep working "with no coins in the tray after they've been removed" ([2.1.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5035622743880239340)).
  - T2 and T3 stores show "'t' ... total cost on the buy platform" ([3.0.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762993398268899735)).
- Stores have a shoplifting mechanic. The patch notes mention "un-successfully stealing an item in the store" ([Mega Patch 3.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366)). I found no details on the penalty.
- **Lead check, "sell pads vs vendor counters":** selling is at vendor counters or tables (jeweller, grocer, stock-market tables) in towns. I found no evidence of a remote auto-sell pad or machine. Automation feeds production, but the player hauls goods to town.

**Vendors and where they are**
- **Jewellers** sit in Bastion Keep and Bridgepour and buy "resource sales only". **Grocers** sit in Bastion Keep, Burnscroft, Bridgepour and Grangefield and buy crops, soups and fish ([Map & Store Guide, 2.0.3–2.2, updated 2023-05-03](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)).
- Grocers were added next to jewellers in 2.1 ([2.1 Farming Season](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)).
- In the DLC, "Jewelers buy items like other jewelers", so you don't need to travel to a specific one ([gameplay.tips DLC guide](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)). Inference: jeweller prices do not depend on the town.
- **Lead check, store names:** the real towns are Bridgepour, Bastion Keep, Burnscroft, Ironil, The Crossroads, Grangefield and Icehelm (base game), and New Glade, Lumberton Harbour, Shattered Outpost and Mot's Island (DLC). "Bridgeview" and "Ironfall" do not appear in any source; the likely mix-ups are Bridgepour and Ironil ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513); [Fandom Bridgepour](https://hydroneer.fandom.com/wiki/Bridgepour)).

**Stock markets: specialised, fluctuating, saturating**
- Each market buys one category, and the markets are spread across towns ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)):

| Town | Stock market buys |
|---|---|
| Bastion Keep | Iron ingots |
| Burnscroft | Fish |
| Ironil | Weapons |
| The Crossroads | Gold ingots |
| Bridgepour (harbour) | Jewellery |
| Icehelm | Gems |

- DLC stock markets: Iron, Gems and Jewellery in New Glade; Gold in Shattered Outpost; Weapons in Lumberton Harbour ([gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)).
- Price behaviour ([Call Before You Dig guide, v2.0.2, updated 2023](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)):
  - A green arrow on the market sign means the market pays MORE than the jeweller; a red arrow means it pays less.
  - Prices change daily and right after you sell to that market (a saturation effect). Sleeping overnight gives a new price.
  - The guide gives no percentages.
- Other community guides agree on the daily change and the drop after a sale ([TrueAchievements / guide summary](https://www.trueachievements.com/a625111/wolf-of-bridgepour-achievement)).
- Price ceiling: the Fandom Iron Bar page says the stock market "can give a price up to 110% (13.2:1) compared to base price", but rarely reaches it. Crafting the bar into a weapon (+10–30%) always beats selling it on the market, so the iron market is "basically useless" ([Fandom: Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)). Community-measured.
- History of the system:
  - 1.6 (Jan 2021): "Stock market complete rework. Now behaves more realistically and saves" ([1.6 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099)).
  - 1.7.2: "Fish Stock prices no longer plummets randomly sometimes" ([1.7.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4224935490632757895)).
  - 2.0: "Stock market redesign – Now only purchase certain resources" ([2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)).
  - 2.0.2: "Stock Market prices now work properly" ([2.0.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5849624375818888970)).
- OUTDATED (2020, v1.x): market listings showed an inflated number. Axe and ring showed 2× and sword and necklace 3× the base value, but the payout was still base value × weight. The developer grandmaMax confirmed this ("This is exactly how it works!", Jun 2020) and in 2022 locked the thread as "outdated info" ([Steam: Item Price Guide](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/)).
- Achievements tied to the market: "Wolf of Bridgepour" (sell something at a stock market) and "Stonks" (earn 100,000 coins on the stock market) ([TrueAchievements](https://www.trueachievements.com/a625111/wolf-of-bridgepour-achievement); summary of the [achievement guide, marked outdated](https://steamcommunity.com/sharedfiles/filedetails/?id=2962749196)).

**Other income**
- **Scrapyard:** scrapping items gives scrap metal worth 25% of the original value, and smelting scrap into bars doubles it ([2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)). This matches community values of scrap metal 1/weight and scrap bar 2/weight ([Felwyn PPW guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2550881493)).
- **Fishing, base prices:** small fish 5–7 c, larger fish about 11 c, large blue and yellow fish up to 25 c (older walkthrough) ([Showgamer](https://showgamer.com/en/kak-igrat-v-hydroneer)).
- **Fishing, cooking:** cooking fish in a furnace raises their value ([1.7 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4186652991113411288)). Cooking for about 10 s is fine; burning at about 15 s drops the value to 1 coin ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
- **Fishing, rods:** better rods are traded for specific fish, not bought with coins ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)).
- **Farming:** vegetables, cut vegetables and soup sell at the grocer. Their value was raised in 2.1.1, and soup value now scales with its contents in 2.1.2 ([2.1.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574127321166); [2.1.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5000716037439281378)).

### Inferences
- Hydroneer's economy is **fixed-price at the universal buyer, plus optional speculative side markets.** The jeweller guarantees a predictable floor. Stock markets add variance and a reason to travel and plan, without punishing players who ignore them.
- Saturation on sale (the price drops after you sell) caps how much you can earn by dumping into a premium market. This is a light anti-exploit device worth copying.
- Physical coins create logistics friction: you carry coins back, stack them, and avoid losing them. They also caused many bugs (stacking, collision, duplication). A browser game would probably use an abstract balance and keep only the "deliver goods to a counter" step physical.

### Gaps
- No exact formula for daily stock-market drift or for how much a sale depresses the price. Only "changes daily and after a sale" and a community-observed ceiling of about 110%.
- Shoplifting penalties (guards? fines?) could not be confirmed. The search hits on "guards take your money" were itch.io posts that did not name the game.
- There is no official or datamined price table. All per-weight values are community-measured.

## 2. How item value is computed; values along the processing chain

### Takeaway
Since 2.0, **price = per-weight base value of the material × weight**, with a fixed bonus for each processing step:
- Smelting ore into a bar: about +18–33%.
- Cutting or polishing gems: about +55–83%.
- Anvil crafting: +10% (dagger, ring), +20% (axe, necklace) or +30% (sword), applied to the value of the component materials.

Weight is the main "quality" variable. Nugget weight grows with dig depth, so value scales with depth. There is no separate purity stat.

### Cited Findings
- The formula is a developer-confirmed principle that "Price = Base Value × Weight". The 2020 base values themselves are outdated ([Steam Item Price Guide, dev reply](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/)).
- **Cross-checked per-weight values (post-2.0).** Sources:
  - (A) [Felwyn "Price Per Weight" guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2550881493), posted Jul 2021, updated Jul 2023; the author said in Aug 2023 that prices had not changed.
  - (B) User aRPeaR's v2.0.x measurement, Jun 2022 ([Steam thread](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/)).
  - (C) Fandom pages for [Iron Ore](https://hydroneer.fandom.com/wiki/Iron_Ore), [Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar), [Gold Ore](https://hydroneer.fandom.com/wiki/Gold_Ore) and [Cloutium](https://hydroneer.fandom.com/wiki/Cloutium).
  - (D) [2024 "Hydroneer Price Guide"](https://steamcommunity.com/sharedfiles/filedetails/?id=3265890693), Jun 2024.
  - (E) Official [2.0 patch notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462).

| Item | Raw / uncut (c per wt) | Refined / cut (c per wt) | Step bonus |
|---|---|---|---|
| Iron | 9 (A, C); 9.5 (B); 10 (D) | 12 (A, B, C) | about +33% |
| Gold | 17 (A, C); 16.7 (B); 16 (D) | 20 (A, B) | about +18–20% |
| Cloutium | 170 (A, C, D, E); 171.3 (B) | 200 (A, B, E) | about +18% |
| Corestone ("Core") | 22 (A, D) | 26 (A) | about +18% |
| Hardstone (DLC) | 8 (D, gameplay.tips) | n/a | n/a |
| Emerald | 12 (A); 15 (B) | 22 (A, D); 25 (B) | about +67–83% |
| Sapphire | 15 (A, B) | 25 (A, B); 26 (D) | about +67% |
| Ruby | 18 (A); 15 (B) | 28 (A); 25 (B, D) | about +55–67% |
| Onyx | 150 (A, B) | 250 (A, B, D) | +67% |
| Diamond (DLC era) | n/a | 250 (D; [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)) | n/a |
| Scrap metal / scrap bar | 1 (A) | 2 (A, E: "×2") | ×2 |

- Guide D summarises the refining steps as "refined metal +30%, unrefined gems −70% (versus cut)" ([D](https://steamcommunity.com/sharedfiles/filedetails/?id=3265890693)).
- **Official price change:** in 2.0, Cloutium ore went from 35 to 170 per weight and Cloutium bar from 40 to 200 ([2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)).
- **Official gem rebalance (Jul 2022):** "Gem prices and spawn rates have been changed. Onyx is still expensive and rare, then Rubies, Sapphires, then Emeralds" ([2022-07-05 update](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4474904295773706248)). This explains why B (June 2022, all three gems at 15/25) differs from A (graded 12/15/18 and 22/25/28). D (2024) puts sapphire (26) above ruby (25), which contradicts the official ordering.
- **Anvil products:** Ring +10%, Necklace +20%, Dagger +10%, Axe +20%, Sword +30%, on top of the component value ([A](https://steamcommunity.com/sharedfiles/filedetails/?id=2550881493); same figures in [Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). Fandom checks this with a 400-weight iron bar ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)); aRPeaR measured the same per-weight values ([Steam thread](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/)):

| Item from one 400-wt iron bar | Value | Per weight | Multiplier |
|---|---|---|---|
| Bar | 4,800 | 12 | 1.0× |
| Dagger | 5,280 | 13.2 | 1.1× |
| Axe | 5,760 | 14.4 | 1.2× |
| Sword | 6,240 | 15.6 | 1.3× |

- The 2.2 Prospecting Update reworked the anvil completely: "Weapons and Jewellery can now be crafted by using any material besides shards. Anvil is also doubled in size" ([2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)). Before 2.0, iron could only make weapons ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)). A search summary of a Volcalidus-era wiki lists multipliers of dagger 1.1, axe 1.2, knife 1.3, ring 1.1 and necklace 1.2; I could not verify it directly because wiki.gg was blocked.
- **Jewellery:** jewellers buy rings and necklaces, and Bridgepour harbour runs a jewellery stock market ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513); [2.0.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5849624375818888970)). The DLC added diamonds and diamond jewellery to the villager request pool ([3.0.8](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5742731639345340037)).
- **OUTDATED v1.x (2020) model:** a flat base value per item type: Iron Ore 12, Dagger 15, Axe 16, Sword 17, Gold Ore 20, Gems 25, Ring 26, Necklace 28 ([Steam thread](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/)).
- **Weight as quality ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)):**
  - Average nugget weight is about 0.5 kg at the surface, about 3.4 kg at 8 blocks (the T1 depth limit) and about 4.3 kg at 14 blocks (the bottom of T2).
  - Going deeper with T2 equipment raises nugget weight about 8×.
  - The maximum iron ore recorded from tier-1 dirt is 2.53 weight ([Fandom Iron Ore](https://hydroneer.fandom.com/wiki/Iron_Ore)).
- **Gem compression** (Logic Gem Compressor, 930 c): merges cut gems of one type into a single larger gem to cut item count. Community posts say the value still follows weight, so compression is mostly logistics or performance, not profit ([Steam discussion search summary](https://steamcommunity.com/app/1106840/discussions/0/3135045355780823879)). In 2020 a player asked for value to scale superlinearly with gem size so that big gems matter ([Steam thread](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/)). The game never did this, as far as the sources show.
- **Spawn rates:**
  - Guide D: Iron 50%, Gold 37.3%, Corestone 2%, Cloutium 1.1%, Shards 4.7%, Gems 4.9% ([D](https://steamcommunity.com/sharedfiles/filedetails/?id=3265890693)).
  - Independent 2-hour drill test: about 4.5% gems, about 0.125% onyx, about 0.75% cloutium ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
  - 2.2 made Shards "slightly rarer" and Cloutium "slightly less rare" ([2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)).
- **Shards cannot be sold.** They power and boost machines such as pressure tanks ([Fandom Shard](https://hydroneer.fandom.com/wiki/Shard)).

### Inferences
- Example of the value-added chain: iron ore 9 → bar 12 → sword 15.6, about 1.73× in total. Gold: 17 → 20 → sword about 26 (about 1.5×). Gems: emerald uncut 12 → cut 22 (about 1.8×), then jewellery adds 10–20% more.
- The big multipliers come from **rarity tiers**, not processing. Cloutium and onyx are worth about 10–20× iron per weight.
- Cloutium has a material-versus-money tension: it is often better kept for crafting T2 drills and harvesters than sold ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). This is a strong design lever: rare materials double as currency for upgrades.
- Value is linear in weight and the step bonuses are fixed, so players can calculate profit exactly. Variance comes only from the stock markets and from what the dig yields.

### Gaps
- No datamined base values. Small differences between sources (iron ore 9 / 9.5 / 10; gold ore 16 / 16.7 / 17) may come from rounding, measurement error or patch drift.
- No precise current fish or soup price tables were found.
- The exact value of jewellery that mixes gem and metal components (how components are weighted) is not documented beyond "bonus based on components' value".

## 3. Shop and purchase system and the cost curve

### Takeaway
Players buy tools, pipes, conveyors, logic parts, machines, building pieces, furniture, vehicles and dig sites from many themed stores in towns:
- Prices run from 2–165 c for hand tools, to about 300–1,400 c for first machines and automation parts, to 680–2,460 c for vehicles, to 970–7,200 c for dig sites, and 17,300 c for the Logic Smelter. A 14,500 c throne serves as a luxury sink.
- Higher-tier ("masterwork") machines are forged at Icehelm. You buy a coin blueprint once, then each copy costs metal by weight (iron, cloutium, corestone). This turns mined material, not just coins, into the gate.
- Bought items appear on a buy platform or table in the store, and the player carries them away.

### Cited Findings
All prices below come from the [Map & Store Guide (v2.0.3–2.2, updated 2023-05-03)](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513) unless another source is cited.

**Early game: Ember Cradle starter shop**

| Category | Item: price (c) |
|---|---|
| Panning basics | Pan 12, Bucket 4, Brush 2, Dull Shovel 22, Dull Pickaxe 122 |
| Smelting and smithing | Crucible 18, Casting Mold 42, Small Furnace 86, Anvil 86, Blacksmithing Hammer 105, Grinding Wheel 84, Saw 143 |
| Utility | Hand Sorter 165, My First Fishing Pole 52, Fishing Pot 41, Throwable TNT 48, Map 45, Mining Helmet 361 |
| Iron pipes | Intake 36, Straight 22, Elbow 25, T-pipe 28, Pressure Tank 142 |
| Machine store | Spanner 53, Toolbag 220, Iron Harvester 320, Iron Drill 432 |

- The Iron Harvester and Iron Drill are one-time purchases. 2.0 added a "Travelling merchant who will sell you your first drill and harvester" ([2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)). After you buy one, a lock chain appears and further copies must be forged at Icehelm ([Fandom Drill](https://hydroneer.fandom.com/wiki/Drill)). The Fandom Harvester page also gives 320 c ([Fandom Harvester](https://hydroneer.fandom.com/wiki/Harvester)).

**Mid game: Bridgepour and other towns**
- **Conveyor Nation:**
  - Belts: straight 220, corner 240, vertical 323, splitter 532.
  - Hooks: Centraliser 462, Merger 480, Gem Polisher 462.
  - The same belt prices appear in [NaGuide](https://naguide.com/?p=37241) (straight 220, vertical 323).
- **Tools & Equipment:**
  - Cloutium pipes: straight 210, elbow 286, T 295, intake 632, pressure tank 853.
  - Machines and tools: Smelter 1,320, Logic Gem Compressor 930, Common Shovel 694, Common Pickaxe 742, Magnet on a Stick 428, Scales 146, Water Filter 174, Funnel 110.
- **Hobson's Powerworks (logic):**
  - Basic parts: gates and cables 84–102, Logic Lamp 342, Logic Weight Reader 620, Logic Counter 560, Logic Destroyer 863, Logic Magnet 1,052.
  - Expensive machines: Logic Compressor 2,340, Spanner Hurling Unit 1,200, Logic TNT 360, Logic Mini Nuke 2,600, **Logic Smelter 17,300**.
- **Vehicles:** Hydro Truck (any colour) 1,420, Hydro Quad 680, Hydro Roller 2,460. Carts (Itchy Carts): Wooden 350, Agile or Fast 740. The first Hydro Truck is free ([Fandom Hydro Truck](https://hydroneer.fandom.com/wiki/Hydro_Truck)).
- **Furniture and housing (cosmetic money sinks):** Throne 14,500, Goldhead Statue 1,200, Fancy Chair 850, Safe 450. Building pieces cost about 2–45 c each, plus Pallet 450.
- **Farming (Grangefield, coin store):** Tomato Seed 130, Carrot Seed 180, Seed Mill 235. Other seeds and the Sprinkler Hook (2,100) cost Farming Guild Tokens.

**Masterwork forging at Icehelm: blueprint once in coins, then metal per copy**

| Masterwork | Tier 1 (Forged Iron) | Tier 2 (Cloutium) | Tier 3 (Corestone) |
|---|---|---|---|
| Drill | 184 c blueprint; 300 wt iron each | 1,320 c; 1,000 iron + 150 cloutium each | 2,460 c; 800 corestone + 500 cloutium each |
| Harvester | 122 c; 100 wt iron each | 980 c; 500 iron + 50 cloutium each | 1,130 c; 600 corestone + 200 cloutium each |
| Intake booster | 82 c blueprint; 50 iron; +20% water pressure per unit | 454 c; 50 cloutium; +30% | 50 corestone; +40% |

- Drill and harvester figures: [Fandom Drill](https://hydroneer.fandom.com/wiki/Drill), [Fandom Harvester](https://hydroneer.fandom.com/wiki/Harvester). Blueprint prices also match the Map & Store Guide's "Pedestal Items" list ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)).
- Intake boosters: up to 4 per intake pipe ([Fandom Intake booster](https://hydroneer.fandom.com/wiki/Intake_booster)); blueprint prices 82 c and 454 c ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)).
- Excess metal is handled exactly: an item needing 300 iron accepts a 305-weight bar and returns the extra 5 ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
- 2.2 "Balanced prices of masterwork crafting recipes" ([2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)).
- Pipe tiers matter: since 2.2, pressure is capped by the weakest pipe in the line ([2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)). This forces upgrading the whole pipe network (iron → cloutium → corestone).

**Late game: token-only stores**
- **Prospector Guild store, Bridgepour Harbour (Prospecting Guild Tokens):** Corestone pipes 210–853, Advanced Shovel 2,350, Advanced Pickaxe 1,240, Prospecting Helmet 430, Logic Saw Hook 320, Hydro Mole 3,500, Hydro Prospector 4,300 ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)). Fandom confirms that corestone pipes "require a special type of tokens, not money" ([Fandom Bridgepour](https://hydroneer.fandom.com/wiki/Bridgepour)).
- **Farm Guild store (Farming Guild Tokens):** Hydro Cropper 2,680 ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)).

**DLC (Volcalidus) stores** ([gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)):
- T1 stores take coins: Smelter 1,320, Lava Drill 430, Dull Ice Shovel 22, Dull Icepick 122, Logic TNT T1 120. Masterworks combine coins and metal, e.g. Lava Drill Masterwork 240 c + 500 iron + 100 cloutium.
- T2 and T3 stores take tokens ("t"), e.g. Heavy Lava Drill Masterwork 2,100 t + 400 cloutium + 700 corestone; Advanced Ice Shovel 2,350 t; Logic Mini Nuke 1,800 t.
- Tools and machinery can be crafted with buffs (speed, dig size, output size, vein bonus) using "Forge Marks" refined at Shattered Outpost. No numeric values are given ([gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html); [hydroneer.com DLC page](https://hydroneer.com/journey-to-volcalidus)).

### Inferences
- **Cost curve, roughly a factor of 10 per stage:**

| Stage | Purchases | Price range |
|---|---|---|
| Starter | Hand tools | 2–165 c |
| Early | First machines | 320–432 c |
| Early-mid | Automation pieces and vehicles | 220–1,420 c |
| Mid | Plots | 970–7,200 c |
| Late | Top automation machine | Logic Smelter 17,300 c |
| Endgame | Token sinks | Hydro Prospector 4,300 Prospecting tokens; DLC Volcalidus Trophy 99,999 Scout tokens (see section 4) |

- With per-weight prices of 9–250 c, one bucket of early ore (a few dozen weight units at 9–17 c) is worth tens to low hundreds of coins. That makes a 432 c drill a meaningful first goal.
- Hybrid costs (coins + mined metal + tokens) stop pure money-grinding from skipping the progression. Tier-3 gear requires corestone (2% spawn rate) and quest tokens.

### Gaps
- Store prices are from the 2.0.3–2.2 era (2023). The 2.2.4 patch notes say "Rake prices updated" without listing numbers ([2.2.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5138087875075946141)). Other post-2023 price changes, if any, are undocumented.
- Corestone intake booster blueprint price and DLC vehicle prices (Lava Thaw, Hauler, Bike, Roller on Mot's Island) were not found ("prices vary").
- No source describes delivery trucks. Purchases appear to spawn on the store's buy platform for the player to carry, as implied by the patch notes, but I found no explicit description.

## 4. Land plots, map unlocking, quests and contracts

### Takeaway
The player starts with a free dig site, Ember Cradle, and can buy five more. Combined, they cost 22,970 c. Each site differs in depth, terrain and distance to towns; deeper sites mean heavier, more valuable ore. Towns and roads are open from the start, so plots are the progression gate rather than map fog.

Quests came late in development:
- 2.1 (Dec 2022): NPC soup requests pay Farming Guild Tokens.
- 2.2 (Apr 2023): anvil-crafting requests pay Prospecting Guild Tokens, and a main questline, "For The King!", gives a secret item reward.
- DLC (2024): Scout Guild Tokens, fossil museum rewards, and a town (New Glade) that players help rebuild by funding and supplying shops.

### Cited Findings
**Dig sites (coins)** ([Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites); [Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513); [Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751); Mildew's 970 also in [Twinfinite](https://twinfinite.net/guides/best-dig-site-in-hydroneer/)). Four sources agree.

| Dig site | Price | Notes |
|---|---|---|
| Ember Cradle | 0 (starter) | Flat |
| Mildew's Aquifer | 970 | |
| Dreck Quarry | 1,200 | |
| South Hope | 6,600 | |
| Snowrune Falls | 7,000 | Added in 2.0 |
| Icehelm (Deeps / Underground) | 7,200 | Horizontal dig site, added in 2.0 |

- Ember Cradle is flat and the others are hilly ([Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites)).
- Buying all sites costs 22,970 ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)).
- The official store page says the parcels differ in depth, scenery and distance to stores (search summary of [Steam store page](https://store.steampowered.com/app/1106840)).
- 2.0 added Icehelm and Snowrune Falls, each with a dig site. The Icehelm site is horizontal, and "the deeper you go the better the resources" ([2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)).
- Community advice is to work up through each price bracket rather than buy the most expensive plot first ([Twinfinite summary](https://twinfinite.net/guides/best-dig-site-in-hydroneer/)).

**DLC dig sites**
- Dawn Rest is free. Waterside, Lumberton Bluff, Scoria Chamber, Cinder Footing and Shattered Breach cost 5,000 c each ([Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites); [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)).
- Items and vehicles cannot be taken to Volcalidus, so the DLC is a fresh economy ([Fandom Journey to Volcalidus](https://hydroneer.fandom.com/wiki/Journey_to_Volcalidus)).

**Quests (base game)**
- **2.1 Farming Season:** "NPCs ... occasionally give out tasks for soup in return for Farming Guild Tokens". The token store was billed as "Currency acquired by completing tasks, NOT MICROTRANSACTIONS!!" ([2.1 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)).
- **2.2 Prospecting Update** ([2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)):
  - New currency: Prospecting Guild Tokens.
  - "Craft items for NPCs using the anvil to gain Prospecting Guild Tokens", spent at a new store in Bridgepour Harbour.
  - A main questline "with increasing difficulty, progress through Bastion Keep, to complete a quest for the king, with a pretty sizable reward". The developer added it because "a common request from players is a reason to progress".
- **Quest mechanics:**
  - Quest givers are marked with "!" on the map, and you pick up quest scrolls or task notes.
  - Since 2.2.3, NPCs show their name and the token type they reward. A Task Note Board (25 tokens) holds two notes.
  - Farming-guild progression was accelerated so that "higher value tasks will appear sooner after completing previous tasks" ([2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166)).
  - Since 2.2.5, NPCs pay only if the quest scroll was accepted ([2.2.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5124584686246033158)).
  - 3.0 changed the 'For the King!' quest to require a shark instead of a lobster ([Mega Patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366)).
- **Reward scaling, from player reports** (Steam discussions, search-snippet level, not fetched in full):
  - "The more prospecting guild quests you do, the better the rewards".
  - Examples: 52 Prospecting tokens for a single iron ore; 155 tokens for a gold and emerald ring.
  - Castle quests are the most valuable. Some players say they need progress in both prospector and farming quests; others dispute this.
  - Sources: [thread 1](https://steamcommunity.com/app/1106840/discussions/0/3821911517957079172), [thread 2](https://steamcommunity.com/app/1106840/discussions/0/3821909708341600653), [thread 3](https://steamcommunity.com/app/1106840/discussions/0/4349988612571467992).
- **Museum fossil donations** pay Guild Tokens (search summary of [Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513) and related guides).

**DLC quests and rebuild** ([gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html) unless noted)
- **Scout Guild Tokens** come from quests and NPC scrolls.
- **Museum collection milestones:** 1 bone = 100 tokens; 12 = 1,000; 24 = 3,000; 36 = 5,000. There are 36 fossils across 65 possible spots.
- The King's Quest at Lumberton Harbour gives a free Lava Truck and a map. A boat ticket to Mot's Island costs 200 tokens.
- **Courier quests:** deliver a package to an NPC at Dawn Rest for a small amount of Hydrocoin (search summary).
- **New Glade rebuild:** 5 store slots, started with crates from the Traveling Merchant's Tent and finished with hardstone, iron and cloutium bars. A launch-era guide lists crate prices: Jeweller C 210 plus materials, Tier I store C 50, Tier II C 760, Tier III C 2,400 ([TechRaptor, via search summary](https://techraptor.net/gaming/guides/how-to-build-store-in-hydroneer-restoring-new-glade)).
- **"Abandoned Miner" rebuilds:** passive resource generators that you buy with materials.
  - East Shelf costs 800 hardstone blocks + 1,200 iron bars and produces iron or gold up to 300 wt, at 1 wt per 10 s.
  - West Shelf costs 2,300 hardstone + 1,400 iron + 30 cloutium.
  - The Barrens costs 9,800 hardstone + 900 corestone + 400 cloutium.
- **Endgame sink:** the developer added the Volcalidus Trophy at 99,999 Scout Guild Tokens because beta testers "really wanted an expensive item to work towards when they've finished the main quests, steam achievements, and built up their dig sites" ([Dev Vlog, 2024-03-24](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)).
- The DLC added diamonds and diamond jewellery to villager requests ([3.0.8](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5742731639345340037)).

### Inferences
- Hydroneer uses **dual currencies by design.** Coins pay for scale (plots, machines). Quest-only tokens pay for top-tier gear and vehicles. Quests are therefore mandatory for full progression, which keeps money-grinding from trivialising content.
- Quests were bolted on years after launch in response to "no reason to progress" feedback. An original game should design contracts in from the start.
- The DLC's "rebuild the town" sink (fund stores with coins and materials, which unlocks more stores) and the passive generators are good mid-game sinks that turn surplus materials into permanent upgrades.

### Gaps
- Exact token reward tables per quest tier and the "For the King!" final reward value are not documented in the sources I could reach. The final reward is officially a "secret new item".
- The exact effect of each plot on ore tables beyond depth is unclear; a Steam thread asking whether ore rates vary by plot went unanswered in the snippets.

## 5. Starting money, early loop timings, exploits and balancing

### Takeaway
- **Start:** the player begins with **no coins**, only a free kit: pan, bucket, brush, shovel and the starter plot. The first income comes from hand panning (about 10 c per nugget) or fishing.
- **Early goals:** a 52 c fishing pole, then a starter kit of about 946 c (pipes, furnace, anvil), then the first drill and harvester for about 750 c.
- **Payoff:** once automated, T1 drills earn roughly 35,000 c per drill per 2 hours (one tester's measurement), so plots (970–7,200) quickly become affordable.
- **Exploits:** the developers repeatedly patched duplication exploits: resources, coins when buying vehicles, anvil double-use, cooking boots, and quest-reward skipping.

### Cited Findings
**Starting state and early income**
- New worlds start with a bucket, brush, pan and shovel ([Fandom Panning](https://hydroneer.fandom.com/wiki/Panning)). "Starting items are free. Coins come from panning, fishing and selling" ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). No source gives a starting coin balance.
- The panning loop is: shovel dirt into the bucket, pour it into the pan, add water, brush, collect. The wiki calls it "very time consuming" and recommends saving for a Drill + Harvester ([Fandom Panning](https://hydroneer.fandom.com/wiki/Panning)).
- First ore nuggets are worth about 10 coins. You need more than 55 coins to get going (the fishing pole is 52) ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). Another guide sets a target of a first 52 coins from nearby resources to buy the rod ([Showgamer](https://showgamer.com/en/kak-igrat-v-hydroneer)).
- Early, fishing "will earn you more coin than mining does". A fish trap (about 41 c) pays for itself after about 3–4 catches. The recommended starter shopping list totals 946 c. A T1 drill and harvester cost about 800 c ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). The store guide's prices give 432 + 320 = 752 c ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)).
- **Throughput benchmark:** a 2-hour test with four T1 drills at Ember Cradle made "almost 140,000 coins", about 35,000 per drill ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). This is a single community test (v2.0–2.2).
- The developer's own pitch for the loop is to dig, process and refine by hand, sell, then buy conveyors, pipes and drills to automate ([Xbox Wire](https://news.xbox.com/en-us/2026/04/30/hydroneer-brings-years-of-updates/)).

**Exploits and fixes (official patch notes)**
- Fixed a resource duplication glitch ([2.2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519503928900)).
- "Anvils will no longer be able to craft items using the same bar if balanced the bar between two slots" ([2.2.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5138087875075946141)).
- NPCs no longer pay for quests whose scroll was not collected ([2.2.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5124584686246033158)).
- Fixed coins sometimes duplicating while purchasing vehicles ([3.0.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762994032406039149)).
- Removed an exploit with cooking boots ([3.0.8](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5742731639345340037)).
- Fixed stores still working after the coins were removed from the tray ([2.1.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5035622743880239340)).
- Pipe-pressure bypass (a cheap pipe plus a booster) was closed ([2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)).
- Fixed a scrapyard bug where items in a truck that drove through the burn zone stayed on the list of items to burn after the truck left ([3.0.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364318958392)).
- A community cheat site describes duplicating money with a "well and boots". This is unverified and probably related to the patched boots exploits ([cyberly.org](https://www.cyberly.org/game-cheats/pc/hydroneer.html)).
- Creative mode (1.7+) officially allows duplicating items (Creative Wand, Creative Hard Hat) and taking store items freely. It is sandboxed from survival play ([1.7 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4186652991113411288); [2022-07-05](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4474904295773706248); [Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/4120176169359192465)).
- An official resource multiplier exists: the 1.3 D.A.V.I.D., "a shard powered machine which duplicates dirt", used with the Goliath drill ([1.3 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3659688711190803493)). Whether it survived the 2.0 overhaul is unclear.

**Balancing moves (official)**
- Cloutium ore and bar values raised about 5× in 2.0 ([2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)).
- Gem prices and spawn rates rebalanced ([Jul 2022](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4474904295773706248)).
- Farming made "slightly more rewarding" ([2.1.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574127321166)).
- Shards made rarer, Cloutium less rare, masterwork recipe prices rebalanced ([2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)).
- The player can no longer sprint while holding a pallet, "to balance carts" ([1.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099)).

### Inferences
- Rough timeline from a cold start:
  1. Tens of minutes of panning or fishing to reach about 50–100 c.
  2. Roughly an hour or more to save about 750–950 c for the drill, harvester and pipes.
  3. After automation, income jumps by about two orders of magnitude (about 290 c per minute per T1 drill in the one measured test). All 22,970 c of plots become reachable within a few hours.

  This is an estimate from community figures, not a measured playthrough.
- The steep jump from manual to automated income is the core satisfaction curve. Later gates (corestone rarity, quest-only tokens, material-cost masterworks) are needed because coin income becomes effectively unlimited once automated.
- Most exploits came from physics or physical-object simulation (coins, bars split across slots, items in moving trucks). An abstracted browser economy avoids most of these by design.

### Gaps
- No official or measured time-to-first-drill exists. The times above are inferred.
- I could not reach Reddit or YouTube content (blocked or unfetchable), so community exploit lore from r/Hydroneer is not covered.

## 6. Debt, taxes, upkeep, fuel

### Takeaway
Hydroneer has **no debt, loans, taxes, rent or recurring upkeep fees** in any source found. The only running costs are indirect:
- **Fuel:** trucks run on water (lava in the DLC). It is free, but you have to fetch it.
- **Repairs:** machines take damage and must be repaired with a spanner.
- **Consumables:** water filters, TNT and similar.
- **Scrap:** wrecked or unwanted items can be scrapped for 25% of their value.

### Cited Findings
- The Hydro Truck has a fuel hold above the cabin and a warning light that blinks on low fuel ([Fandom Hydro Truck](https://hydroneer.fandom.com/wiki/Hydro_Truck)). The 2.2 patch notes refer to "water fuel tanks" ([2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)). The DLC guide advises keeping "a pan of water or lava handy to refuel your truck" ([gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)). Vehicles got an "empty fuel tank" sound in 1.7 ([1.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4186652991113411288)).
- Harvesters "must be repaired when damaged" ([Fandom Harvester](https://hydroneer.fandom.com/wiki/Harvester)). Spanners cost 53 c, and the Logic Durability Reader costs 360 c ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)). In 2.2 the Logic Smelter "No longer takes damage" ([2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)).
- Lava pipes in the DLC need 5 filters to stay clean ([gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)). Water filters cost 174 c, and creative mode offers an "Invincible Water Filter", which implies regular filters wear out ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)).
- Recovering losses: scrapping gives 25% of value, and smelting scrap doubles it ([2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)). Before 3.0, pouring the wrong ore into a crucible deleted it ("No more expensive mistakes!" once fixed) ([Dev Vlog 2024-03-24](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)).
- No source mentions taxes, rent, interest, loans or plot upkeep. Plots are one-time purchases ([Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites); [Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)).

### Inferences
- Hydroneer's economy is **purely accumulative**, with no money sinks over time. Sinks are all one-off purchases (plots, machines, cosmetics such as the 14,500 c Throne) plus token-gated items. That fits a relaxed sandbox, but it explains why late-game coins lose meaning and why the developers added token currencies and a 99,999-token trophy.
- An original game wanting longer-lived money could add light upkeep (machine wear and repair costs, consumable filters or fuel), which Hydroneer only hints at.

### Gaps
- The exact durability or damage rates and repair costs (spanner use only, or a coin cost?) are undocumented.
- Fuel consumption rates and tank capacity were not found.
- Whether shoplifting carries a fine (a possible "penalty" mechanic) is unconfirmed.
