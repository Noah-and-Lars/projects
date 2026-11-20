# 3008 (Roblox): reference notes

Research notes on the Roblox game *3008* by uglyburger0, collected November 2026
for Endless Showroom. They describe how 3008 plays so we can match the *feel*
and *mechanics*. Endless Showroom does not copy 3008's names, characters,
landmarks, product names, voice lines, art or music.

**Confidence key:** ✅ primary source (Roblox API, creator's update log) or two or more
independent sources agree · ⚠️ one source only, or sources disagree · ❌ looked for, not found.

Most fan-wiki pages (Fandom, NamuWiki) block automated reading, so many facts
below come from search-result snippets of those pages. Numbers can be out of date:
the creator's update log stops at Jan 2023, and the game is now on 2.75.

---

## 1. The game at a glance

| Fact | Value | |
| --- | --- | --- |
| Creator | uglyburger0 (verified) | ✅ API |
| Created | 20 Jan 2019 | ✅ API |
| Current version | "3008 [2.75]"; last updated 31 Oct 2026 | ✅ API |
| Visits / favourites | ~3.35 billion / ~5.86 million | ✅ API |
| Players per server | 16 (main game) | ✅ API |
| Genre | Horror; avatars forced to R15 | ✅ API |
| Premise | Endless, randomly generated furniture store with no exit. Survive day/night cycles, build bases, avoid hostile staff ("Employees") at night | ✅ many |
| Goal | No ending. Survive as many nights as possible; the day counter climbs forever | ✅ many |
| Codes | None; no codes system | ⚠️ 2 SEO-ish sites |

### Places in the universe (Roblox API)
Main game; Singleplayer; Voice Only; archives of versions 2.7, 2.5, 2.4, 2.3, 2.2, 2.1, 1.4;
April Fools versions 4122, 4123, 4124, 4125. Separate games by the creator: **3008 – 100 Players**
(115M visits), **3008 – 700 Players** (53M), **3008 – 4121** (50M), **SCP-3008 – Shattered Reality** (14M),
**3008 – Development**. ✅

### Game modes menu ✅ (wiki + API)
100 players · Singleplayer (with optional VIP/mod menu; singleplayer badges count if no admin
commands are used) · Shattered Reality · 700 players · Voice Only (text chat off) · Version Archives.

### Monetisation ✅ API
| Pass | Price | Effect |
| --- | --- | --- |
| Personal Watch | 8 R$ | Shows when day/night begins, at the top of the screen |
| Death Waypoint | 12 R$ | Auto-waypoint where you died (not if your waypoints are full) |
| Octuple Waypoints | 8 R$ | 8 waypoints instead of 4 |

Plus paid VIP (private) servers with a Mod Menu (⚠️ price disputed: 10 R$/month vs one-off).

---

## 2. Time: days, nights, the week, events

| Mechanic | Detail | |
| --- | --- | --- |
| Day length | 6 min | ✅ many |
| Night length | 5 min on day 0, **+4 s every day** | ✅ GamesKeys + Stealthy Gaming |
| Server age | Server starts at day 0 = Monday; days count up forever; older servers spawn more employees | ✅ |
| Lag | Server lag stretches the timer (a day can take 15+ min on slow servers) | ⚠️ |
| Weekdays | Day counter mod 7 (0 = Monday … 6 = Sunday) | ✅ wiki + update log 2.2 |
| Restock | Food and medkits respawn every **Monday and Friday** | ✅ many + update log |
| Day themes | A different daytime music track for each weekday; one night theme | ✅ update log + OST |
| Friday | 2% chance the Friday theme is swapped for a remix | ✅ update log 2.71m |
| Cycle banner | Text blurb at the top when the phase changes (night, day, blood night, foggy day) | ✅ update log 2.6b |
| Signs | Sign lights switch off by day and glow red on blood nights | ✅ update log 2.72 |

### Events
| Event | When | What changes | |
| --- | --- | --- | --- |
| **Blood Night** | Every 10th night, or 1/20 otherwise (~15% overall); rarely twice in a row | Crimson sky; more employees in larger groups; they run **2–2.5×** the player's run speed, jump higher, climb faster, use multiple routes, attack faster but for less damage; shoves stun them more briefly; they stack on each other to reach bases; ~1 min shorter than a normal day phase | ✅ update log + 4 guides |
| **Foggy Day** | Every 15th day, or 1/100 otherwise | Thick fog by day; employees are hostile but **slower**, hit up to **5× damage (~40)**, and **can't be stunned** | ✅ update log + wiki + guides (⚠️ Gurugamer says every 16th) |
| **Apocalyptic Calendar** | Every 30 days, or 1/2000 | Foggy Day and Blood Night back to back. Whether both can fall on the same day changed between updates | ⚠️ wiki only |
| **Blizzard** (Holiday 2025) | Was every 7 days, later a random daily roll (~1/20–1/25) | Replaces a day; lasts 3 min; snow from a random direction; exposure fills a 0–100 freeze meter that deals damage when full; shelter under a roof | ⚠️ wiki only |
| **Blood Winter Solstice** (Holiday 2025) | Every 70 days, later ~1/400 | Blizzard + Blood Night back to back (~8 min) | ⚠️ wiki only |

---

## 3. The player

### Stats ✅
- Three bars, each 0–100: **health**, **hunger**, **energy**. (Thirst existed briefly in 2.71 and was merged into energy in 2.71f.)
- Over 100 is wasted.
- **Energy** drains all the time, even standing still (≈1 point per 25 s idle per NamuWiki), faster walking, fastest sprinting. Food and drink restore it; soda used to restore it over 30 s.
- **Hunger** drains much more slowly than energy.
- Since 2.71f, health sets how fast energy drains, and energy sets how fast hunger drains.
- **At 0 energy:** no sprinting (✅). Sources disagree on the rest: the wiki says no sliding, shoving or picking up; Robloxdatabase says weaker throws and faster hunger drain. ⚠️
- **At 0 hunger:** health drains until you eat or die. ✅
- **Health** has no passive regeneration; only medkits and some foods restore it. ✅
- **Low health (≤10):** breathing and heartbeat, cloudy/fogged vision, the music fades, and a low-health track plays. ✅ update log 2.4 + NamuWiki
- Stomach growls when hunger drops below 10. ✅ update log 2.71f
- Low energy shows a warning. ✅ update log 2.4

### Movement ✅
Walk (WASD) · Sprint (hold Left Shift; drains energy) · Jump (Space) · Crouch (C; there's a crouch toggle setting) · **Slide** (crouch while sprinting, since 2.71; harder at low health) · climb ladders, pallets, shelves and bookcases by walking into them · heads collide with objects (2.71d).

### Fall damage ✅ (wiki + update log + badges)
- Damage starts at a fall of ~27 studs. A full-health player survives ~100 studs onto the floor.
- **Beds and couches** soften falls when you land on their **top** (~190 studs survivable); **beanbags** soften from any side (~277 studs). Long falls onto a bed can bounce you and hurt more.
- Fall damage became "much more sensitive, realistic and consistent" in 2.5. Falling vignette and hurt effect. VIP servers can turn fall damage off.
- Badges reward having furniture break a lethal fall ("Close Call!").
- Climbing very high (1000+ studs) plays its own vertigo track.

### Death and respawn
- You lose everything you were carrying. ✅
- Death screen shows your stats; since 2.71 you press Reset to come back. ⚠️ wiki
- Respawn location: a random spot (⚠️ 4121 page) vs "at the start" (⚠️ Robloxdatabase).
- Varied death messages (falls, starvation, employees…). ✅ update log
- Death Waypoint pass marks where you died. ✅ API

---

## 4. Controls (PC defaults) ✅ several key lists, ⚠️ some conflicts

| Key | Action |
| --- | --- |
| WASD / Space / Left Shift / C | Move / jump / run / crouch |
| **E** (hold ~0.5 s) | Pick up furniture or items (heavy pieces take longer) |
| **R** | Rotate the held piece; **1 / 2 / 3** choose the X / Y / Z axis |
| Hold **Ctrl** / **Shift** while rotating | 15° / 90° steps |
| **Ctrl+Shift+R** | Reset rotation |
| Mouse wheel | Pull the held piece closer / push it farther |
| **F** (hold) | Throw; F is also listed as Quick Inventory |
| **G** | Inventory (16 slots) |
| **H** | Whistle (one source and the game page say T) |
| **T** or ` | Extras menu (game modes, intro, waypoints, VIP mod menu) |
| **Q** | Settings |
| **Z** | Zoom (not while holding something) |
| Left click | Shove an employee (night only) |
| X | Delete (moderators, VIP only) |

Mobile: on-screen buttons; tap the crosshair on an employee to shove (2.71d). Console: rotation on all axes and the watch supported (2.4). ⚠️ No full mobile or console list found.

---

## 5. Furniture and building ✅ unless marked

- Almost all furniture can be picked up and moved; it floats in front of you where you aim. Picking up takes **0.5 s** of holding E (2.3); the **Heavy Wooden Box** takes much longer (a badge rewards it).
- Rotate on any axis (above). Rotation sounds; tooltips while holding (2.5); camera shake while holding (2.71b).
- **Let go touching a wall, pillar, floor or other furniture → it stays fixed there with a click. Let go not touching anything → it falls with gravity.** Clipping items into each other to support them is normal. ⚠️ NamuWiki + Droid Gamers
- Dropped items are placed by raycasting rather than physics (2.3). Optional **snap-to-grid** setting (range default 0.01, max 2).
- 45° wedges exist (2.3).
- Players can float or build in the air by holding furniture under themselves (NamuWiki) ⚠️.
- Employees **cannot pick up, move or break** normal furniture (✅ several). The King (below) can break structures; only industrial shelving resists him. ⚠️
- Toggle lights on and off (all lights since 2.71; F on some since 2.3); light modes include an RGB fade (2.71j); **light strips** link when dropped touching each other and recolour together (2.75).
- **Doors** can be opened and closed (2.75).
- TVs have a 20% chance of showing a channel (37 images by 2.72); the toilet flushes (2.72).
- Furniture pieces in the game: hundreds (32 community plots and 104 community items in 2.6 alone; the 2.75 update added a Queen Bedroom plot plus a cinnamon roll, mirror, welcome mat, beanbag, door and more). ⚠️ no complete list found.
- Base advice that all guides share: walls on every side, at least two or three layers high; a roof (employees see through gaps, and **pallets are see-through**); crouch-only entrances; build up on industrial shelves and remove the ladders; keep a backup hideout; a light source so you can see them coming.

---

## 6. Food and medkits ✅ (wiki snippets and Robloxdatabase Sept 2026 agree)

| Item | Energy | Hunger | Health | Where |
| --- | --- | --- | --- | --- |
| Meatballs | +6 | +30 | | Cafeteria |
| Chocolate | +18 | +15 | | Rare: one per server on a special pillar, about half of servers |
| Cinnamon roll | +15 | +14 | | Cafeteria |
| Burger | +6 | +20 | | Cafeteria |
| Banana | +6 | +14 | +5 | Cafeteria |
| Lemon | +10 | +10 | +4 | Cafeteria, kitchen |
| Striped donut | +15 | +9 | | Cafeteria |
| Apple | +6 | +12 | +5 | Cafeteria, play plot |
| Hot dog | +3 | +18 | | Cafeteria, kitchen |
| Fish crackers | +2 | +18 | | Child bedroom |
| Ice cream | +13 | +6 | | Snack shop |
| 2 L soda | +23 | | −5 | Cafeteria |
| Soda (either brand) | +17 | | | Cafeteria, snack shop |
| Cookie | +8 | +8 | | Kitchen |
| Water | +12 | | +3 | Cafeteria, kitchen |
| Chips | +4 | +10 | | Cafeteria |
| Beans | +5 | +18 | −10 | Cafeteria |
| Lemon slice | +5 | +5 | +2 | Kitchen |
| Pizza slice | +2 | +5 | | Cafeteria, kitchens, child bedroom |
| Glass shard | | | −33 | Greenhouse (×4): a trap |
| **Medkit** | | | **+30** (2–3 s to use) | Medkit plot (×4), cafeteria (×1) |

- A cafeteria holds ~53–57 items (~527–583 hunger, ~395–446 energy): 10 chips, 8 pizza, 6 burgers, 5–6 bananas, 5 water, 4 soda, 3 big sodas, 3 meatballs, up to 3 cinnamon rolls, 2 hot dogs, 2 apples, 2 lemons, 1 beans, 1 donut, 1 medkit. Cafeteria plots are ~1.8% of plots.
- Event foods: gingerbread cookies (holiday, +8/+8), candy corn (October, +3/+2/+1 health), birthday cake (gone).
- Eat by opening the inventory and clicking the item. Food can be stored in wardrobes and bathtubs.

---

## 7. Employees

### Behaviour ✅ many sources
- **Day:** passive; wander aimlessly; can't hurt you (except on Foggy Days).
- **Night:** hostile; they chase any player they see and repeat a flat, deep "the store is closed, please leave" line (women employees at a higher pitch).
- They **give up** once they lose sight of you for long enough, if you get far away, or if you hide somewhere they can't reach. Pillars are the classic escape; following behind one unnoticed works.
- Pathfinding takes the shortest route and tries alternatives, but ignores their own size, so they get stuck in small spaces like wardrobes.
- They **climb** ladders and ladder-like furniture (pallets, shelves, bookcases); they **jump**; they **cannot crouch** (crouch entrances work, except against short ones); they **cannot pick up or move** objects.
- They **see through gaps**: pallet walls don't hide you.
- They hear you: sprinting and whistling attract them (whistle range became infinite in 2.71g).
- Normal speed: slower than a running player (✅ Pocket Tactics + wiki; ⚠️ one guide says faster).
- Can't be killed. Max ~50–60 natural spawns per server, more as the server ages. Spawning "from the sky" ⚠️ one source.
- Stand still while being chased and one may jump on your head and stop hitting. ⚠️ one source.
- Day vs night lookup: employees can be shoved only at night and on Blood Nights, never on Foggy Days.

### Shoving ✅
Left-click (or tap) an employee within ~2–3 studs: stuns it for **2–4 s** and knocks it back. Costs **4–8 energy** (some sources say 6). Doesn't work on Foggy Days. Useless against hordes because of the energy cost.

### Variety ✅ wiki
- Height classes: tall, average, short, very short. Tall/large ones are slower; small ones faster.
- Body types named on the wiki: regular, buff, block, man, woman, wide (random damage), plus joke/April Fools ones that became permanent (e.g. a much harder hitter, one that flings placed objects, a pair of legs that gets under low cover).
- Random skin tones and outfits; party hats on the birthday; Santa hats and elf variants at Christmas.
- **The King:** a rare, much stronger employee, drawn to lights players switch on, able to break structures (except industrial shelving), stunned by whistling. ⚠️ older guides; appearance varies by version.

---

## 8. The map

- Endless-feeling but finite: **51 × 51 plots** (2,601) with a **7 × 7 grid of 49 pillars**, eight plots apart; each side is over 2,000 studs. ✅ wiki + update log 2.7c
- Pillars are labelled **A1–G7**; D4 is the centre. A screen on each pillar shows its coordinate; **16%** show an error instead. ✅
- Pillar types: default; damaged (~0.1%, chunk missing, screen likely errored); construction (ladder and pallets around it); floating house (a little house on top, holds the rare chocolate); collapsed (removed); the King's remains (rarest; badge); an "In Memory Of" redesign. ✅ wiki
- Plot examples: cafeteria, industrial shelves (long rows of shelving with pallets, ladders and crates spanning a whole aisle, ~17% of plots), medkit station, snack shop, kitchens (checkered, mini classic, modern mini), bedrooms (child, TV, queen), living rooms, dining room, bed display, couches, library, showroom, game area, play plot, cozy area, TV showcase, mini shelves, information booth (a pillar-side hiding spot with stools), greenhouse (glass shards). ✅ wiki, update log
- **Generator odds** from a community seed-map project (88protons/3008 on GitHub, MIT licence; it reproduces the game's map from a server seed, with plot names taken from the wiki) ⚠️ community reverse-engineering, but very detailed:
  - Pillars sit at every 8th cell (2, 10 … 50 on both axes). Pillar type odds: normal ~79%, construction ~13.8%, damaged ~5.6%, floating house ~1.1%, the King's remains ~0.02%, with thin "either" bands between them. A shelf run passing through a pillar deletes it.
  - Big structures roll first: a **cafeteria** is a 5-plot block (≈0.77% chance per anchor plot); an **industrial shelf** run goes along one axis for **4–13 plots** (≈0.56% per anchor).
  - Every other plot rolls one of **54 plot types** by weight. Commonest: living room (~6.4%), dining room (~4.8%), bathroom (~4%), master bedroom (~3.5%), couches, bedroom office and bed display (~3.2% each). Rarest: game area (~0.03%), mannequin showcase (~0.3%), greenhouse (~0.8%), play plot (~1.2%). Medkit plots ~1.3%, snack shop ~1.4%.
  - Families: consumables and storage (medkits, four kinds of kitchen, snack shop, shelving); beds (eleven kinds of bedroom and bed display); outdoors (garden, greenhouse, patio, backyard, fire pit, gazebo); living and dining (fourteen kinds); work and fun (library, office, desks, bar, billiards); misc (bathroom, information booth, showroom, rugs); rare (play plot, game area, mannequins).
- VIP map generation presets: Default, 2.74m, 2.74h, 2.73, 2.5, 2.2, 1.4, Superflat, Pillar Halls (every plot a pillar); size, roof height (default 2,040), pillars and snow can be changed. ⚠️ wiki

---

## 9. Multiplayer and social ✅

- 16 players per public server; 100- and 700-player versions exist.
- **Whistle (H):** costs ~5 energy; marks you for a few seconds (exclamation mark and name) so friends can find you; highlights nearby employees; attracts employees (range infinite since 2.71g).
- **Waypoints:** 4 (8 with the pass), each with a name and colour, visible from anywhere with a distance readout; set from the Extras menu. Other players can't see yours. VIP owners can teleport to them.
- Text chat (with chat tips like "Bananas are powerful"); spatial voice chat; voice-only servers.
- Player names show faintly on screen. Party/private servers; vote-kicking was tried and removed.
- Griefers can knock down bases; abandoned bases pile up on old servers.
- Badges can't be earned in VIP servers (except King's Remains).

## 10. Badges ✅ API (5 enabled)

| Badge | How |
| --- | --- |
| Close Call! | Have furniture save you from a lethal fall (1.5M awarded) |
| Saved by [a specific plush] | Have that plush save you from a lethal fall |
| Time Well Spent | Pick up the heavy wooden box (it takes a long time) |
| The Sacred Chocolate | Find the rarest food, the chocolate |
| King's Remains | Find the rare pillar where the King lies |

Past/event badges: the 2024 **Hunt** event (find a work computer in a pillar during the day, get three random objectives revealed at night such as eating or using furniture, complete them and survive till morning); a holiday snowman hug; the old "lost survivor" badge.

## 11. Settings ✅ wiki snippets
Four categories: Video, Audio, Gameplay, Controls. Field of view (default 90), global shadows, camera shake (on), altitude display (off; studs in the bottom right), mute soundtrack, chat tips (on), crouch toggle, snap-to-grid range, pickup highlights (off on mobile), "show last position ghost", rebindable keys.

## 12. Music and sound ✅ update log + official soundtrack
A track for each weekday (Monday–Sunday themes), a night theme, a Blood Night changeover sound and scream, a chase theme (exists, rarely or never triggered), a low-health track, a vertigo track at 1000+ studs. Landing sounds follow the surface material. The soundtrack is on streaming services as *Roblox 3008, Vol. 1*.

## 13. Update history (highlights) ✅ update log, ⚠️ wiki for 2.73+
- **2.2 (Feb 2020):** new building system; weekdays; Mon/Fri restock; hunger became energy; beds soften falls; better AI; new day/night themes.
- **2.3 (Jul 2020):** hold-E pickup (0.5 s); hold-F throw; Ctrl+Shift+R reset; snap-to-grid; cafeterias; industrial shelves; floating house; max employees 30 → 60; shoves cost 4–8 energy; waypoint gamepass.
- **2.4 (Nov 2020):** Blood Nights and Foggy Days; chase theme; low-health effects; server-age popup; the watch pass.
- **2.5 (Apr 2021):** AI redone; slower medkits; harsher fall damage; pillar screens; beanbags.
- **2.6 (Apr 2021):** 32 community plots and 104 community items; VIP tool gun; badges.
- **2.7 (2021–22):** 51×51 map; spatial voice.
- **2.71 "Energized Refresh" (Jul–Nov 2022):** hunger/thirst bars then merged; sliding; all lights toggle; TV channels; light strips; death-screen stats; voice-only servers.
- **2.72 (Jan 2023):** birthday update (party hats, cake); toilet flushes; pillar computers that error.
- **2.74 Holiday Update (Dec 2025):** blizzards, Blood Winter Solstice, holiday plots and items.
- **2.75 (Sep 2026):** interactive doors, linked light strips, Queen Bedroom plot, new items.
- **April Fools versions** (4121–4125): swapped stats, negative day/night, joke employees, a bomb every 8–10 min, "paranoia" phantoms.

---

## Sources
- Roblox APIs: games, badges, game passes, universe places (primary).
- Creator's update log: https://sites.google.com/view/roblox-3008/3008-update-log
- Robloxdatabase (2026): https://robloxdatabase.com/guides/3008-food/ · https://robloxdatabase.com/games/3008/
- Pocket Tactics: https://www.pockettactics.com/roblox/3008
- Beanstalk: https://beanstalk.io/scp-3008/
- Droid Gamers: https://www.droidgamers.com/guides/how-to-play-3008/
- Gurugamer: https://gurugamer.com/mobile-games/how-to-play-roblox-3008-18896
- GamesKeys: https://gameskeys.net/scp-3008-overview-tips-and-tricks-roblox/
- Stealthy Gaming: https://stealthygaming.com/scp-3008-blood-night-meaning/
- The Nerd Stash (Hunt): https://thenerdstash.com/roblox-how-to-get-the-hunt-badge-3008/
- DefKey controls: https://defkey.com/roblox-scp-3008-shortcuts
- Mejoress / MyDailySpins / Alfintech control guides
- 88protons/3008 seed map (GitHub): https://github.com/88protons/3008
- Roblox 3008 Fandom wiki and NamuWiki (search snippets only)
- Low reliability, used sparingly: desinema.com; pages.dev "employee list" sites were ignored as spam.
