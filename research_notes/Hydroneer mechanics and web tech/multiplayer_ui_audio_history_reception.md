# Hydroneer: Multiplayer, Saves, UI/Menus, Audio, Update History, Reception and Performance

Research date: 2026-11-22. Main primary source: the full Steam announcement and patch-note feed for app 1106840, pulled through the public Steam News API (62 posts, Oct 2019 to May 2026). The per-post URLs are cited inline, and the feed itself is at https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&feeds=steam_community_announcements. Abbreviations: "SN" means the Steam News post with that title, and "FH" means Foulball Hangover.

**Correction to the brief's premise.** Hydroneer was **not** a Steam Early Access game, and it had no "1.0 in 2021". It launched on Steam as a full release on **8 May 2020**. Developer Max ("grandmaMax") said: "Hydroneer isn't an early access game... It has never been listed as an Early Access game and has always primarily been sold as a $15 open-ended mining sandbox game" — [SN: A Message From Max, 2024-01-11](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533). The Steam store page also lists the release date as May 8, 2020 — [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/). An earlier paid alpha/beta was sold on itch.io before the Steam launch, and itch buyers got Steam keys — [itch.io post](https://itch.io/post/831858); [itch.io post](https://itch.io/post/1069784). I could not pin down exact itch.io dates. Max describes starting it "as a solo developer back in 2019" — [SN: ONE MILLION HYDRONEERS, 2025-06-18](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1802893906702139). Version numbers run 1.3 (Jul 2020) → 2.0 (May 2022) → 2.2 (Apr 2023) → 3.0.x (Apr 2024, with the DLC) → 3.0.9 (Mar 2025) → an optimization patch (May 2026). The developer declared the game "finished" in April 2024.

---

## 1. Multiplayer / co-op

### Takeaway
Hydroneer has **no true networked multiplayer**. Since 2.0 (8 May 2022), "multiplayer" means local split-screen for 2–4 players, which can be streamed online through **Steam Remote Play Together**. The host's PC runs a single game instance, so the developer never had to deal with sync or desync. Real 1–4 player online multiplayer on a new physics engine was announced in Feb 2021 and then abandoned in Dec 2021. The stated reason was that UE4's non-deterministic physics makes syncing thousands of physical items impractical for a small team.

### Cited Findings
- **Original plan (Feb 2021):** "Online multiplayer to support 1-4 players", "Launching Summer 2021", a free update, "Complete rework of the game, and new physics engine", a closed beta through Discord, and old saves reset but kept playable on an old-version branch — [SN: Hydroneer Multiplayer is Coming!, 2021-02-05](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4051520458173386771). The post was later edited to say: "Due to complications with development we are no longer developing true multiplayer, instead we're taking a splitscreen approach due to issues with physics engines." (same source)
- The project was delayed in Sept 2021 ("We've got some bad news") — [SN: News for the 2.0 Multiplayer Update, 2021-09-04](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4020014099096439405). In Jan 2022 the developer reported "big setbacks again with multiplayer, but making great progress on our new approach" — [SN: Jan 2022 Dev Vlog](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4224939245934084649).
- **Why the plan was dropped (2.0 launch post):** "we had to essentially start again in December 2021, throwing out a lot of work... Due to technical limitations of physics engines, and our dedication to staying indie and not taking on outside investors, I decided the best move forward was to make the multiplayer aspects of the update as Steam Remote Play Splitscreen." — [SN: HYDRONEER 2.0 IS HERE!, 2022-05-08](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
- **Official Multiplayer FAQ** (grandmaMax, posted 7 Jan 2022, edited 24 Sep 2023): UE4 physics is non-deterministic, which makes syncing many simulated objects very hard. Remote Play gets around this by running one instance on the host. It supports **2 to 4 players**, and **connecting players must use a gamepad**. **Only the host needs to own the game**. Skipping replication code sped up development. The FAQ contrasts Hydroneer with Satisfactory, whose conveyor items are "graphical shaders, not physical objects" and whose developer is much larger — [Steam Community FAQ](https://steamcommunity.com/app/1106840/discussions/0/3203748171375176286/)
- A secondary source agrees: as of April 2024, Remote Play is "the only available option" and will most likely stay that way, because UE4 physics "is non-deterministic" — [Gamepressure, 2024-04-08](https://www.gamepressure.com/newsroom/hydroneer-2024-multiplayer-and-coop-explained/ze6bcc)
- **Store feature flags:** Shared/Split Screen Co-op, Remote Play Together, Single-player — [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/). The PS5 store lists "1 - 4 players" — [PlayStation Store](https://store.playstation.com/en-gb/concept/10016411).
- **Split-screen issues fixed in patches (these show where split-screen breaks):**
  - The held-fish model and coin stacks did not appear correctly on both screens — [SN: 2.0.1, 2022-05-11](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4288001105332311583).
  - A "New UI menu for remote play to aid players with setting up controllers" — [SN: 2.0.3, 2022-05-17](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5849624375836275751).
  - A reset-resolution button, for when "multi-monitor splitscreen" pushes half the game off screen — [SN: 2.0.5, 2022-05-23](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4292505348839841359).
  - Two players sleeping at the same time soft-locked one of them in endless sleep — [SN: 2.2.2, 2023-04-18](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519503928900).
  - The coin text display did not show in split-screen — [SN: 3.0.6, 2024-04-15](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6474562312195671416).
- 2.0 added customisable third-person characters, "viewable... when playing with friends" — [SN: 2.0 patch notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462).
- **Player reaction:** "Remote Play sucks please add real multiplayer" (57.1 h, recommended). Another reviewer called multiplayer the game's biggest limitation — [Steam reviews, top rated](https://steamcommunity.com/app/1106840/reviews/?browsefilter=toprated&filterLanguage=english).
- FH's next game, *Die Trying*, is a "co-op multiplayer extraction shooter" — [SN: Announcing our next game, 2025-05-08](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1799088287836850).

### Inferences
- Because the game uses single-instance split-screen, there are no networked desync bugs at all. The multiplayer bugs are about **per-viewport UI and state**: HUD elements, held items, sleep and time-skip, and controller assignment.
- Design lesson for a browser game: if every ore is a physics body, deterministic lockstep or server-authoritative replication is the main blocker for co-op. Hydroneer's developers said this outright. A browser game that wants co-op should plan for it from day one. Options include deterministic or non-physical items on belts (the Satisfactory approach the FAQ contrasts with), a server-authoritative simulation, or async/shared-world co-op.

### Gaps
- I found no specifics on bandwidth, latency, or input-lag complaints about Remote Play in this game.
- I could not confirm whether console versions (May 2026) support online co-op natively or only couch co-op.

---

## 2. Save system

### Takeaway
Hydroneer uses UE4 `.sav` files in four slots, stored under `%LOCALAPPDATA%\Mining\Saved\SaveGames` ("Mining" is the internal project name). It has configurable autosave, Steam Cloud since Oct 2020, and an optimized new save format in 2.0 that broke compatibility with older saves. There are options to skip saving loose dirt and raw resources for performance, and automatic backup fallback since Apr 2023. Rare save corruption was a long-running complaint. It was finally addressed in 3.0.9 (Mar 2025) by crashing deliberately instead of writing a corrupt file.

### Cited Findings
- **Location and slots** (community reports, 2020): saves live in `%LOCALAPPDATA%\Mining\Saved\SaveGames`, with slot files `HydroSave.sav`, `HydroSave2.sav`, `HydroSave3.sav`, `HydroSave4.sav`. Copying them for backup works — [Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/2254559285371961229). *This may be outdated after the 2.0 save-system rewrite; I did not verify the current file names.*
- **Steam Cloud saving** was added in 1.5 (Oct 2020) — [SN: 1.5 Hydroween, 2020-10-14](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164). Since 1.6, "UserData will now be saved to the Steam cloud, or locally if cloud is not available" and the previous save slot is remembered — [SN: 1.6, 2021-01-15](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099). The store lists Steam Cloud — [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/).
- **Cloud bugs:** "Cloud saves now work properly" — [SN: 2.0.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4288001105332311583). Steam Cloud did not save DLC save files correctly until it was fixed in [SN: 3.0.5, 2024-04-10](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762993398268899735).
- **Performance-oriented save options:** 1.6 added a gameplay option "to toggle whether to save raw resources (iron ore/gold ore/shards/cloutium ore/uncut gems)" and optimised loading of large saves — [SN: 1.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099). The developer told players with lots of dirt or resources to use "'Toggle Save Dirt Chunks' and 'Toggle Save Raw Resources'... this will help with FPS" — [SN: 1.6.11 Optimisation, 2021-09-17](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5418383147738990807). 2.2.3 added a "Remove Resources" option when continuing a save — [SN: 2.2.3, 2023-04-28](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166). The ESC menu has "Clear all Dirt Chunks" — [SN: 3.0.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364318958392).
- **2.0 save rewrite:** a "Brand new save file system which is a lot more optimized and stable... This will not work with old save files, they'll still be accessible with the old game version on the steam beta tab." — [SN: 2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462). Before 2.0, saves carried over between versions (e.g. 1.3: "Save files will continue over from previous versions") — [SN: 1.3, 2020-07-15](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3659688711190803493).
- **Autosave changes over time:**
  - A save icon appears on screen while auto-saving — [SN: 1.7.2, 2021-11-24](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4224935490632757895).
  - "New options for auto-save time intervals" — [SN: 2.0.6, 2022-07-05](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4474904295773706248).
  - "Save & Quit to Desktop" was added to the ESC menu in 2.0. "Skip Save and Return to Menu" came in Apr 2024 — [SN: Mega Patch, 2024-04-05](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366).
  - The fix list in that mega patch includes "Removed issue with saves sometimes taking an extended time to complete" (same source).
  - The game now saves whether the player is inside a vehicle (same source).
  - The save browser lists the date each file was saved — [SN: 3.0.8, 2024-06-03](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5742731639345340037).
- **Achievement "dirty" flag:** the loading menu shows whether a save is eligible for Steam Achievements. Mods and creative mode disable them — [SN: 2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166); [SN: 3.0.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762994032406039149).
- **Corruption and data loss timeline:**
  - Dec 2022: "Removed the issue where a small amount of players would have their save file completely empty while loading" — [SN: 2.1.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5000716037439281378).
  - Feb 2023: "Fixed issues with save file corruptions" — [SN: 2.1.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5035622743880239340).
  - Apr 2023: "You'll automatically be directed to the backup of the save file if it detects a corruption" — [SN: 2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166).
  - Mar 2025: the developer said "in extremely rare circumstances some players have their save file corrupted... impossible to reproduce... It seems like some anti-virus programs would prevent Hydroneer from saving". The fix: "Instead of corrupting the save file, the game will crash to desktop and give you an error... use the previous auto-save" — [SN: 3.0.9, 2025-03-10](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1793384379499131).
- **Player complaint:** "my world is completely wiped", unfixed "for over two years", and the developer chose to "bring out dlc before fixing this issue" (176 h, not recommended) — [Steam reviews](https://steamcommunity.com/app/1106840/reviews/?browsefilter=toprated&filterLanguage=english).
- **Smaller state-loss bugs:** crucible liquid states, logic light values, Hydro Cropper contents, quest notes, and splitter or keypad settings were all lost on reload until patched — [SN: 2.0.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4288001105332311583); [SN: 2.0.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4292505348839841359); [SN: 2.1.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574127321166); [SN: 2.2.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5124584686246033158).

### Inferences
- Saving the full state of every physics item, including loose ore and dirt chunks, is what makes saves big and slow. Hydroneer's answer was to let players opt out of saving loose items. A browser game should serialize compactly: aggregate stacks and avoid per-particle state. It should also write atomically (temp file then swap) and keep rolling backups. Hydroneer only added those protections late, after years of complaints.
- Many bugs came from per-machine settings (filter choice, keypad value) that were missing from serialization. A browser game should have a schema-driven save that covers every configurable field.

### Gaps
- I found no reliable figures for typical save file sizes. The current (post-2.0) file names and format details are also unverified.

---

## 3. UI / HUD / menus

### Takeaway
Hydroneer's UI is minimal and diegetic. There is **no inventory**: you hold one physical item at a time and carry the rest in pans, buckets, carts, toolbags and trucks. Item info comes from hover tooltips with "badges". Weight is read from physical scales and logic weight readers, and value from sell tables and stores. Navigation uses a physical world map item and signposts, not a compass HUD. 2.0 brought a full UI redesign, a reworked settings menu with sound sliders, DLSS and a rebinding menu, and partial and then improved controller support. Accessibility options are basic: subtitles with scaling, toggle sprint and crouch, mouse inversion, and drop-reticule options.

### Cited Findings
- **No inventory / one item at a time:** "Only being able to hold one item at a time was also something I did not like" — [Thumb Culture PS5 review, 2026-05-22](https://www.thumbculture.co.uk/hydroneer-ps5-review). The Xbox review notes items "aren't dropped directly where you are looking" and placed items are often picked up by accident — [The Xbox Hub review, 2026-05-11](https://www.thexboxhub.com/hydroneer-review/). PC Gamer ran a feature headlined "I can't decide if having no inventory system in this mining sandbox is brilliant or brutal" — [PC Gamer](https://pcgamer.com/i-cant-decide-if-having-no-inventory-system-in-this-crafting-game-is-brilliant-or-brutal) (body not retrievable).
- **2.0 UI changes:** "Complete redesign of the game UI"; "New drop circle when carrying resources"; "Item descriptions now contain certain badges to improve understanding of their abilities"; "Red/Blue placement material improved"; a settings rework with "Additional sound sliders", "Nvidia DLSS" and "Controller rework/rebind menu major improvements"; "UI checkbox changed from a X to a tick to resolve confusion" — [SN: 2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
- **Controls and rebinding:**
  - Partial controller support arrived in 1.6 — [SN: 1.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099).
  - Keybind reset button. Binding LMB/RMB was blocked because it broke interaction. Mouse inversion now saves and applies to vehicles — [SN: 2.0.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5849624375836275751).
  - Toggle sprint/crouch options, drop-reticule options, holding Ctrl to reverse R/T/Y rotation, and hold-LMB for repeated pickaxe and hammer strikes — [SN: 2.0.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4474904295773706248).
  - Left Ctrl became bindable — [SN: 3.0.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762994032406039149).
  - Controller vehicle driving uses triggers, with doubled right-stick X sensitivity — [SN: Mega Patch 2024-04-05](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366).
- **Tooltips and info:**
  - Tooltip key prompts update to match keybindings — [SN: 1.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651).
  - Store tooltips were widened for long (German) strings — [SN: 2.0.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4474904295773706248). Tooltips "dynamically change size depending on its contents" — [SN: Mega Patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366).
  - Soup contents are shown in the description — [SN: 2.1.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574127321166).
  - Scales show the total weight of crafted items by their contents — [SN: 2.2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519503928900).
  - A "Logic Weight Reader which outputs resource weight" — [SN: 1.7.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4224935490632757895).
  - Pressing **B** while looking at an item opens its wiki page (interactive wiki integration) — [SN: 1.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164).
- **Currency display:** a coin-text overhaul with unique colours per currency, thousands separators ("1,420,690") and split-screen support — [SN: 3.0.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6474562312195671416). Prices are shown with "c"/"t" suffixes for coins and tokens — [SN: 3.0.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762994032406039149).
- **Map and navigation:**
  - Quest markers on the map were made easier to see — [SN: 2.1.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574127321166).
  - Task notes show the NPC's location — [SN: 2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435).
  - A Task Note Board, which "can also be used to [display] world maps" — [SN: 2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166).
  - World map zoom on RMB and a player-facing direction indicator. Larger signposts were added "making traversal around the map a lot easier" — [SN: Mega Patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366).
  - Unstuck points have separate locations for players and vehicles (2.0).
- **Notifications and feedback:** NPCs display their name and reward token type overhead — [SN: 2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166). Keybind tips appear when entering vehicles. The highlight outline was improved — [SN: Mega Patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366).
- **Onboarding:** a tutorial board in the Ember Cradle store explains purchasing — [SN: 2.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724). A tutorial became accessible from the main menu, and the ESC menu pauses time — [SN: 2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435). A press review faults "inadequate tutorials" and "clumsy controls" (3.0/5) — [Virus.hr](https://virus.hr/en/reviews/hydroneer). A 1,428-hour player notes the tutorial doesn't cover everything — [Steam reviews](https://steamcommunity.com/app/1106840/reviews/?browsefilter=toprated&filterLanguage=english).
- **Shops are physical:** you place items and coins on purchasing platforms or buckets. A rounding bug once broke a store with "multiple currency types... delete the un-used currency" — [SN: 2.1.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5000716037439281378). Purchasing platforms were visually overhauled in Apr 2024 — [SN: Mega Patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366).
- **Other menus:** a screenshot camera in the ESC menu — [SN: 1.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164). A character customisation window (2.0). Mods can be enabled or disabled from the menu — [SN: 2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166). The game has 19 languages, with full English audio and interface/subtitles in 18 more — [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/).
- **Graphics settings:** DLSS (2.0). The FPS cap defaults to 60 instead of uncapped — [SN: Mega Patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366). There are LOW quality presets (implied by "bones not having a particle effect on LOW settings") — [SN: 3.0.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762993398268899735). Night and shadow brightness were raised for visibility — [SN: 2.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724); [SN: Mega Patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366). The Xbox reviewer says the drop shadow is hard to see in some lighting — [The Xbox Hub](https://www.thexboxhub.com/hydroneer-review/).

### Inferences
- Hydroneer gets much of its tactile appeal from making information physical: scales for weight, sale tables for value, a map you hold. The cost is friction, and most UI patches added on-screen helpers (tooltips, badges, keybind tips, drop circle, overhead NPC labels). A browser game can keep the "physical" fantasy but should offer hover readouts (weight, value, purity) from the start.
- Placement precision is a recurring pain point: drop offset, accidental pickup, red/blue ghost, snapping. The patches kept adding snapping, grids, R/T/Y rotation and scroll-to-distance. A 2D or isometric browser game avoids much of this, but it still needs clear ghost previews and snapping.

### Gaps
- I found no full list of graphics options (resolution scale, shadows, view distance). Colour-blind modes, if any exist, are unknown. I found no evidence of colour-blind support.
- I found no compass or minimap HUD documentation. Navigation appears to rely on the map item and signposts.

---

## 4. Audio

### Takeaway
The music has a calm "high fantasy" feel, and press call the atmosphere cosy and stress-free. Beyond the music, the soundscape is fairly sparse: ambient world sounds (overhauled for 2.0), NPC voice one-liners, and physical impact sounds. Machines give audible state feedback: drills and harvesters make a sound when broken, vehicles play an empty-fuel sound, and machine audio stops when machines are switched off. Volume is split into per-category sliders (including "machines" and water), and many patches dealt with machine audio being too loud or playing globally.

### Cited Findings
- "I quite enjoyed the soundtrack, which had a high fantasy vibe to it... The rest, unfortunately, doesn't have quite the same effect, and is pretty limited overall", with occasional NPC one-liners and basic ambient sound. The art style creates a "cosy, stress-free feeling" — [Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review)
- "We've also overhauled all of the ambient world sounds in the game!" (for 2.0) — [SN: Happy Hydroween, 2021-10-23](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4103335143113114554). 2.0 added "New and updated sound effects across the entire game" and "Additional sound sliders to edit various sound effect levels" — [SN: 2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
- **Sound categories:**
  - "Water sounds are now appropriately in their correct volume level switchers" — [SN: 2.1.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5000716037439281378).
  - "Logic Gem Compressor sound effects now linked to the 'machines' sound slider" — [SN: 2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435).
  - Lever sound applied to its slider — [SN: 3.0.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6474562312195671416).
  - Subtitles can be scaled in the audio settings — [SN: 2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166).
- **Machine and feedback sounds:**
  - "Broken Drills and Harvesters will now play a sound effect when they're broken" — [SN: 2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166).
  - "Vehicles now have an 'empty fuel tank' sound" — [SN: 1.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4186652991113411288).
  - "D.A.V.I.D. no longer plays audio when turned off" — [SN: 1.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099).
  - Vehicle horns — [SN: 2.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724).
  - House door sounds — [SN: 2.0.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4474904295773706248).
  - Jumping sounds — [SN: 1.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651).
  - New voicelines (2.2), and NPCs whistle — [SN: 3.0.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762994032406039149).
- **Loudness and spam problems:**
  - "Multiple resources hitting the floor/other objects will now sound much quieter" — [SN: 1.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099).
  - "Reduced the volume of crucibles and smelters when a large amount of ores enter" — [SN: 2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435).
  - "Massively decreased the sound of the logic saw hook" — [SN: 2.2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519503928900).
  - "Logic Destroyer idle sound effect lowered" — [SN: 2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166).
  - "Limited the amount of sounds effects to occur with the gem compressor" — [SN: 3.0.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762993398268899735).
  - Gem compressor and soup sounds were "playing globally" (not spatialised) until fixed — [SN: 2.1.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574127321166). A lantern extinguish sound also played globally — [SN: 2.2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519503928900).
  - The "soundtrack restarts when hundreds of items are dropped at once causing memory issues" — [SN: 2.2.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5124584686246033158).
- Conveyor belt visual speeds were "changed to represent pressure and physical speed better", which is visual rather than audio feedback for water pressure — [SN: 1.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651). Pressure gauges and readers give numeric pressure feedback (2.0, 2.2).

### Inferences
- Hydroneer's audio problems are mostly about **scale**: hundreds of ores colliding, many machines running, and non-spatialised one-shots. A browser automation game needs voice limits, per-category busses, distance attenuation, and pooled or aggregated sounds (e.g. one loop per machine cluster) from the start.
- State-change sounds (broken, out of fuel, switched off) are cheap and effective feedback for automation. Players also rely on them to notice failures across a base.

### Gaps
- **Composer and soundtrack details are unknown.** Searches returned only Astroneer results, and I found no OST listing on Steam. Track count, style specifics and whether music is adaptive could not be verified.

---

## 5. Update / patch history timeline (and roadmap/sequel)

### Takeaway
Releases: Steam launch 8 May 2020 → monthly-ish content updates through 1.7 (Nov 2021) → **2.0** full codebase rewrite (8 May 2022: Remote Play split-screen, tiered drills, hooks system, new save format, new areas) → **2.1 Farming Season** (Dec 2022) → **2.2 Prospecting** (Apr 2023: Tier 3, Corestone, ore veins, main quest, achievements) → **Journey to Volcalidus DLC + 3.0 Mega Patch** (5 Apr 2024), after which the game was declared finished → 3.0.9 save fix (Mar 2025) → **console ports plus a PC Mega-Optimization patch** (8 May 2026, ported by PlayEveryWare). No Hydroneer sequel has been announced. FH's next game is *Die Trying* (a co-op extraction shooter).

### Cited Findings (chronological; all from the Steam News feed unless stated)
- **2019-10-23:** weekly YouTube dev show — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/2504491307401104125)
- **2020-05-08:** Steam release — [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/); confirmed by "Celebrating one year on Steam" on 2021-05-08 — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4072920612509569801)
- **1.3 Engineering Update (2020-07-15):** blueprint crafting workbench, the new Bridgepour Harbour location, the D.A.V.I.D. shard-powered dirt duplicator, the super-rare Cloutium ore plus spawn-rate rebalance, and a conveyor rework (corners, barriers, arrows) — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3659688711190803493)
- **1.4 Gem Crisis (2020-09-11):** Gem Compressor, sprinting, **Steam Workshop mod support**, the community wiki moving from Fandom to Bridgepour.com, and a lower centre of gravity for resources "to reduce rolling on conveyor belts and improve performance" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651)
- **1.5 Hydroween (2020-10-14):** GeForce Now, shovelling dirt directly onto conveyors, the screenshot camera, B-key wiki lookup, **Steam Cloud**, an excavator and UI overhaul, and limited-time Jack-O-Lanterns — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164)
- **1.6 Logic and Power (2021-01-15):** "40 new items", Powerline and **Logic system**, Hobson's Powerworks store, hand carts, partial controller support, the save-raw-resources toggle, a stock market rework, and a durability rebalance — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099)
- **2021-02-05:** 2.0 multiplayer announced (1–4 online, Summer 2021). Later retracted (see §1) — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4051520458173386771)
- **2021-05-08:** Mini Nuke (a logic-powered terrain obliterator), with 2.0 promised to bring a "Total rework of the entire codebase", a graphical overhaul and creative mode — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4072920612509569801)
- **2021-09-04:** 2.0 delayed — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4020014099096439405). **1.6.11 (2021-09-17)**: optimisation patch for saves with many items — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5418383147738990807)
- **1.7 Creative Update (2021-11-05):** Creative Mode (creative wand dupe/delete, gravity tool, flight cap, hourglass time control), Onyx (0.1% spawn chance), a fishing expansion with fish cooking. Built solo by Max on the old branch, so none of the 2.0 work was included — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4186652991113411288). **1.7.2**: Logic Weight Reader and autosave icon — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4224935490632757895)
- **2.0 (2022-05-08)** (in development since Jan 2021 and restarted in Dec 2021):
  - Codebase overhaul, Remote Play split-screen, and a vehicle rework ("Trucks no longer fly off into the atmosphere").
  - A new save system.
  - Icehelm crafting. The Hand Sorter. **Tiered drills, harvesters, pipes, pickaxes and shovels**, which dig only to depth tiers.
  - A **"Hooks" attachment system**: conveyor and pipe modules, plus logic hooks such as delay, repeater and flip-flop.
  - House building sets. The rake. Throwable TNT.
  - A voxel plugin update. The Icehelm and Snowrune Falls areas. A travelling merchant. A stock market redesign.
  - Character customisation, DLSS, and a UI redesign.
  - The excavator was removed, and power items were merged into logic.
  - Economy: Cloutium ore 35→170 per weight unit, Cloutium bar 40→200, scrap at 25% of value.
  - [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462). Secondary coverage: [PC Gamer](https://pcgamer.com/mining-sandbox-hydroneer-now-has-multiplayer-vehicles-and-an-optimized-code-rework); [TechRaptor](https://techraptor.net/gaming/news/hydroneer-20-multiplayer-update-is-out-now). One search summary dated the PC Gamer piece to "2025", which is wrong: the update was 2022.
- **2.0.1–2.0.5 (May 2022):** stabilisation, including the conveyor centraliser hook, logic validator, and animation optimisations for many drills — [SN 2.0.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4292505348839841359). **2022-06-20**: "Half a million Hydroneers!" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6214419350718857877)
- **2.0.6 Suggestions Update (2022-07-05):** conveyor merger and alt splitter, distinct textures per dirt tier, the creative hard hat, autosave interval options, logic lamp/multiply/divide, toggle sprint/crouch, and "Big conveyor optimisations". Rebalances: Cloutium ore drill-only (still pannable at any level), changed gem prices and spawn rates (Onyx > Ruby > Sapphire > Emerald), and drill/harvester pressure capped by tier — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4474904295773706248)
- **2.1 Farming Season (2022-12-09):** the new town Grangefield, NPCs with soup tasks paying **Farming Guild Tokens** ("NOT MICROTRANSACTIONS!!"), farming and cooking, a greenhouse build set, the Hydro Quad, Hydro Roller and Hydro Cropper, horns, a Gem Compressor rework, and Norwegian, Swedish and Danish — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724). 2.1.1 made farming more rewarding — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574127321166). 2.1.2 delivered a "full vehicle overhaul" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5000716037439281378)
- **2.2 Prospecting Update (2023-04-14):** **Tier 3** (Corestone tools, pipes, drills, harvesters), the Corestone resource, the Hydro Mole tunnelling vehicle, an anvil rework, **Prospecting Guild Tokens** from crafting tasks, the main quest "For The King!" ("A common request from players is a reason to progress"), **ore veins** with a prospecting helmet and Hydro Prospector, the logic saw hook, **50+ Steam Achievements**, a main-menu tutorial, and the ESC menu pausing time. Pipe pressure is now capped by the weakest pipe in a line, and shards and Cloutium were rebalanced — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
- **2.2.2–2.2.5 (Apr–Jul 2023):** a resource duplication glitch fixed, the backup-on-corruption system, and achievement-eligibility UI — [SN 2.2.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5133583642655153166); [SN 2.2.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5124584686246033158)
- **DLC announcement (2024-01-10):** *Journey to Volcalidus*, $10, "6x the map size", a separate island with its own progression (no items carried over), lava-powered machines, water produced from ice, tiered **stores** instead of tiered drills, a Hauler crane vehicle, and buff stones with random buffs and debuffs — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5510783579247049777). The community pushed back on releasing a paid DLC. Max responded that sales were slowing and DLC revenue would grow the team, and that he had "turned down offers from large publishers" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533)
- **2024-03-24 dev vlog:** pan and truck carrying thousands of items no longer lags. The DLC has 6 dig sites because "players tend to only use a maximum of 3 dig sites" and there are "pretty harsh technical limitations... with terrain digging". Also a Volcalidus Trophy costing 99,999 tokens as a long-term goal — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)
- **3.0 Mega Patch and DLC launch (2024-04-05):** build snapping, brighter shadows, pipe and logic cable optimisations, skip-save, vehicle handling rework, the Logic Content Reader, stacking in storage, the crucible no longer deleting mixed ore, map zoom and facing arrow, and a 60 FPS default cap — [SN Mega Patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366); [SN DLC](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335693). 3.0.1–3.0.8 hotfixes ran Apr–Jun 2024.
- **3.0.9 (2025-03-10):** the save corruption fix — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1793384379499131)
- **2025-05-08:** *Die Trying* announced. "In April 2024, we released 'Hydroneer: Journey to Volcalidus' DLC to mark us finishing Hydroneer" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1799088287836850). **2025-06-18**: 1,000,000 players — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1802893906702139). **2025-08-14**: FH developer fund backing *Backseat Drivers* — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1808061939348397)
- **2026-03-01:** console ports announced: Xbox Series X|S and PS5 on 8 May 2026 (the 6th anniversary), by PlayEveryWare, at the same prices ($15 base, $10 DLC) — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1825727806715718)
- **2026-05-08:** PC "Mega-Optimization" update ("significant increase in performance... large mining setups", localisation fixes). "Even though Hydroneer is a finished title, we want to continue to support the game with optimizations and bug fixes." — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1832065502815252). Console reviews followed — [The Xbox Hub](https://www.thexboxhub.com/hydroneer-review/); [Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review)

### Inferences
- The 2.0 rewrite took 16 months, multiplayer failed during it, and old saves had to be abandoned. This is a cautionary tale: architecture decisions about physics, save format and netcode are very costly to change later.
- The content cadence follows a pattern: the core loop first, then automation depth (logic, tiers, hooks), then **progression goals** (quests, tokens, achievements, trophies). The goals were added late in response to "a reason to progress" feedback. A browser game should design long-term goals from the start.

### Gaps
- I could not retrieve the full 1.0–1.2 (May–July 2020) patch notes or the 1.3 detailed notes, which are on a Steam discussion thread.

---

## 6. Reception

### Takeaway
On Steam, Hydroneer is rated **Very Positive: 86% of ~19.9k English reviews** (fetched 2026-11-22). Recent reviews are lower: **Mostly Positive, 72% of 121 in the last 30 days**, after the console and optimisation period. It passed 500k players in June 2022 and 1M in June 2025. Players praise the hands-on progression from panning by hand to elaborate automated water, conveyor and logic setups, the physical "every ore is an object" feel, and creative problem-solving. Complaints centre on clumsy one-item physics controls, a slow and grindy early game, physics bugs (items flinging), performance with big bases, save loss, and the lack of true online multiplayer. Press scores are middling to good: The Xbox Hub 4/5, Virus.hr 3/5, and a Thumb Culture Bronze Award. Common comparisons are Satisfactory, Cash Cleaner Simulator and Astroneer, the last by name echo only.

### Cited Findings
- **Steam (as fetched 2026-11-22):** All English reviews: Very Positive, 86% of 19,939. Recent: Mostly Positive, 72% of 121. Price $14.99, DLC $9.99. Top tags: Base Building, Automation, Mining, Sandbox, Co-op, Multiplayer, Open World, Building, Funny, Simulation — [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/)
- **Player milestones:** "Half a million Hydroneers!" on 2022-06-20 — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6214419350718857877). "ONE MILLION HYDRONEERS" on 2025-06-18 — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1802893906702139). Max also said "game sales are starting to slow down" by early 2024 — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533).
- **What players praise (Steam top reviews):**
  - "From simple hand mining, you can move on to automation" (22.6 h).
  - "It is a game that makes you think" (1,428.6 h).
  - Developer communication is praised: the team members "keep in constant contact with their players" (110 h).
  - [Steam reviews](https://steamcommunity.com/app/1106840/reviews/?browsefilter=toprated&filterLanguage=english)
- **What players complain about (Steam):**
  - Grind: "designed to be just about as tedious as working in real life" (22.6 h, still recommended).
  - Physics bugs: "items flying into space when you kick them", now mostly fixed.
  - Performance: "careful not to overload the game too much or it can get a little lagging" (1,428 h).
  - Save wipe (176 h, negative).
  - Remote-Play-only multiplayer.
  - [Steam reviews](https://steamcommunity.com/app/1106840/reviews/?browsefilter=toprated&filterLanguage=english)
- **The Xbox Hub (Xbox Series X, 2026-05-11), 4/5:**
  - Praises "Expansive automation systems", "Tons of content" and satisfying automated collection.
  - Criticises "Controls are awkward and will be polarizing", a "Very slow start", and that "The early stretch... will test players on their patience".
  - Describes the game as a blend of Cash Cleaner Simulator and Satisfactory.
  - "for the right player, I can't recommend Hydroneer enough"
  - [The Xbox Hub](https://www.thexboxhub.com/hydroneer-review/)
- **Thumb Culture (PS5, 2026-05-22), Bronze Award:**
  - "every item and resource can (and will) be thrown around the map".
  - Hydropower is "much less stressful" than Satisfactory's power balancing.
  - "unwieldy controls"; truck-bed placement fights the physics.
  - The late game grows stale: "There is no 'you win!' or final mission".
  - The reviewer mentions *Let's Game It Out* videos showing the game slowing and crashing.
  - [Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review)
- **Virus.hr, 3.0/5:** praises "satisfying progression system and unique feel due to physics" and criticises "clumsy controls and inadequate tutorials". Physics is "a double-edged sword" — [Virus.hr](https://virus.hr/en/reviews/hydroneer) (via search summary; the page was not fetched directly)
- **Physics-heavy design vs Satisfactory** is the developer's own framing (shader-based belt items vs physical ores) — [Steam FAQ](https://steamcommunity.com/app/1106840/discussions/0/3203748171375176286/)
- **DLC reaction:** the Jan 2024 announcement drew enough negative feedback that Max posted a clarification and apology ("looks like I've missed the mark with expectations") — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533).
- **Developer's goals for the late game:** a main quest (2.2) and a 99,999-token trophy (DLC) were added because testers "really wanted an expensive item to work towards" — [SN 2024-03-24](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870).

### Inferences
- **What makes the core loop satisfying** (synthesised from the sources above): a tactile manual start (pan, shovel, carry, sell); clear step-ups in power (hand → harvester → drills → tiers → logic); visible physical output (piles of ore, coins, bars on belts); and open-ended engineering with water pressure and logic puzzles. The same physicality causes the main frustrations: clumsy handling, item chaos and lag.
- For an original browser game: keep the hand-labour-to-automation arc and the physical sense of output. Reduce friction with a small inventory or quick-carry, readable drop targets and snapping. Add goals (quests, milestones) early. Bound the item count to avoid performance and save problems.

### Gaps
- I could not get SteamDB peak concurrent players or owner estimates (403). Metacritic scores were not retrieved. Reddit sentiment was not directly sampled because searches returned no r/Hydroneer threads. Major-outlet reviews (RPS, PC Gamer scored review) do not appear to exist. PC Gamer's coverage is news and features.

---

## 7. Performance

### Takeaway
The official minimum spec is modest: Win10 64-bit, a quad-core at 2.4 GHz, 8 GB RAM, a 1 GB DX11 GPU, and 10 GB disk. There is no real recommended spec. Performance is limited by **CPU and physics as the number of items grows**. Loose ore and dirt chunks, many drills, conveyors, storage containers and pans holding thousands of items all cut FPS, while the GPU often sits partly idle. Optimisation was an ongoing theme: 1.6, 1.6.11, the 2.0 rewrite, 2.0.5/2.0.6, the 2024 Mega Patch, and the 2026 Mega-Optimization. Players are advised to cap FPS, clear dirt chunks, and toggle off saving raw resources and dirt.

### Cited Findings
- **System requirements:** minimum Windows 10 64-bit, quad-core 64-bit Intel/AMD at 2.4 GHz, 8 GB RAM, 1 GB DirectX 11 dedicated GPU, 10 GB storage. The recommended spec only says 64-bit — [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/). GeForce Now has been supported since 2020 for players below spec — [SN: 1.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164).
- **Item-count scaling:**
  - 1.6.11 "effects save files with lots of items in the world". Use the save toggles "if you have lots of dirt/resources in your base, this will help with FPS" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5418383147738990807).
  - 2.0.5: "Major optimisations on animations: most importantly making running large amounts of drills work better" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4292505348839841359).
  - 2.0.6: "Big conveyor optimisations", "Major animation optimisations making large drill sites easier to run", "Improvements for loading game files with large amounts of items", "Storage items no longer occasionally cause the game to lag", and "Moving far away from a dig site will no longer fudge collisions while machinery is running" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4474904295773706248).
  - 2.0: "Picking up ores from a large pile will no longer wake up all ores around itself", i.e. physics sleep management — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462).
- **Earlier micro-optimisations:** "Removed dynamic light on Goliath Drill to improve performance" and a lower resource centre of gravity "to reduce rolling on conveyor belts and improve performance" — [SN: 1.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651).
- **Logic saw:** "Logic Saw no longer drops FPS after using it to cut many items" — [SN: 2.2.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5138087875075946141).
- **2024 Mega Patch:** carrying pans, buckets or trucks with large item counts "will no longer heavily reduce frame rate". There are "Water Pipe and Logic Cable optimizations". The FPS cap now defaults to 60 "which increases performance" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366). Dev vlog: "Moving around with a pan full of thousands of resources will no longer lag", though a "tiny hitch" on pickup and a "larger hitch when pouring" remain — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870).
- **Terrain limits:** "pretty harsh technical limitations... with the technical side of terrain digging" capped the number and size of dig sites — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870). The voxel plugin update in 2.0 brought "Performance improvements and much smoother voxels" — [SN: 2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462).
- **2026 Mega-Optimization:** "upgrades with large mining setups... significant increase in performance with certain scenarios" — [SN](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1832065502815252).
- **Player reports:**
  - An RTX 3090 owner says the GPU never goes above ~40%, with 15–30 FPS in a big base. The poster felt performance was better in the DLC, possibly because it had fewer items — [Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/4362375983949354240).
  - An automated fish bucket holding ~3,707 coins' worth of fish caused disproportionate FPS drops — [Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/3821909708349337292).
  - YouTube *Let's Game It Out* videos show slowdowns and crashes in extreme builds — [Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review).
  - (Player reports come from search summaries. The individual threads were not fetched in full.)

### Inferences
- The bottleneck is per-entity physics and actor overhead on the CPU (UE4 is largely single-threaded for game logic), not rendering. Every fix moved toward fewer active bodies: sleeping, stacking in containers, opting out of saving loose resources, and clearing chunks.
- For a browser game, a hard requirement: represent bulk resources as aggregated quantities or pooled sprites, not individual simulated bodies. Use fixed-timestep simulation with sleeping and off-screen simplification, and keep containers as counts rather than collections of objects. This avoids Hydroneer's most persistent complaint.

### Gaps
- I found no quantified benchmarks (FPS vs item count) or official guidance on recommended hardware. The specific changes in the 2026 optimisation patch were not itemised in the announcement.
