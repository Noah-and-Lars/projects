# 10 — Gap analysis: Teardown (2020–2026) vs Wrecking Shift (Nov 2026)

Purpose: list what a player of the genre reference would notice is *missing or weaker* in Wrecking Shift, and
suggest **original** ways to fill each gap. Nothing here asks for Teardown names, levels, characters, text or
assets. Earlier files already hold the deep facts, so this file does not repeat them:
`01-gameplay.md` (campaign, tools, ranks, vehicles, modes, DLC timeline, multiplayer), `03-physics.md`,
`06-ai-audio-art-feel.md`, `07-gap-numbers.md` (tool / explosion / robot / alarm numbers). New facts found for
this pass are mainly about **options, HUD and UX** (from copies of the shipped UI scripts) and the **official
changelog**.

## Source keys

| key | source | reliability |
|---|---|---|
| [CL] | Official changelog, https://teardowngame.com/changelog | official |
| [FAQ] | Official FAQ, https://teardowngame.com/faq.html | official |
| [STEAM] | Store page, https://store.steampowered.com/app/1167630/Teardown/ | official |
| [API] | Modding API, https://teardowngame.com/modding/api.html | official |
| [OPT] | Copy of the shipped `ui/options.lua` (v1.x era) in community repos: https://github.com/TDMP-Team/TDMP-Lua/blob/HEAD/data/ui/options_tdmp.lua and https://github.com/bingleboy/TD-Redux/blob/HEAD/ui/options.lua | game code, but an older version (pre-1.5.1). Later versions add more (see [CL]) |
| [HUD] | Copy of the shipped `ui/hud.lua`, https://github.com/bingleboy/TD-Redux/blob/HEAD/ui/hud.lua | game code, older version |
| [HEIST] | Copy of the shipped `script/heist.lua`, https://github.com/ForCesCustom/Teardown-data/blob/HEAD/script/heist.lua | game code, older version |
| [WIKI] | Fan wiki, https://teardown.fandom.com/wiki/ (Tools, Ranks, Missions, Challenges, Vehicles, Game_Settings) | community; often cited in `01` |
| [GUIDE] | Community guides: https://get-teardown.readthedocs.io/en/latest/tech/performance-boost-guide.html, https://seekingtech.com/how-to-disable-motion-blur-in-teardown/, https://seekingtech.com/how-to-turn-off-depth-of-field-teardown/ | community |
| [PRESS] | Press coverage of the 2026 updates, e.g. https://www.gamespress.com/DROP-THE-BOOM-TEARDOWN-S-ONLINE-MULTIPLAYER-UPDATE-BLASTS-ONTO-STEAM-T, https://mixed-news.com/en/teardown-pc-update-nvidia-dlss-amd-fsr-upscaling/, https://pcgamer.com/games/incredibly-you-can-now-play-teardown-in-third-person | press |

## What Wrecking Shift has today (checked in the code, 2026-11-25)

- **Modes:** job board (career, 13 missions on 4 maps), Sandbox (every map, all tools, infinite ammo, no alarms,
  time-of-day and weather pickers), 2 challenges (Rubble Rush: 90 s voxel count, clock starts after 500 voxels;
  Snatch Sprint: 12 alarmed crates, 60 s), photo mode (P, free camera, FOV zoom). `src/game/ui/menus.ts`,
  `src/sim/challenge.ts`.
- **Missions:** objective kinds `collect / deliver (incl. into water) / destroy % / demolish below height / reach`,
  required + bonus objectives, wired alarm boxes, fire alarm, drones as alarm source, countdown, cosmetic
  helicopter, escape van, valuables (E to pocket, paid on success), flat cash reward, score breakdown, best score.
  `src/sim/mission.ts`, `src/game/missions/*.ts`.
- **Tools (14 + grab):** sledge, spray, extinguisher, blowtorch, handgun, shotgun, plank, cable, pipe bomb, bomb,
  rocket, nitro, rifle, leaf blower; RMB grab/throw. `src/sim/tools/`.
- **Progression:** 11 ranks (score 0–2200) unlocking tools; cash upgrades are **ammo only** (no range, damage,
  blast size, power). `src/game/progress.ts`.
- **Vehicles:** hatchback, van, wheel loader (fixed raised bucket); ramming, damage, flip (R), chase/hood camera.
  `src/sim/prefabs/vehicles.ts`, `src/game/vehicleModule.ts`.
- **Enemies:** security drones (watcher / gunner; die only in water). No chopper that acts.
- **World:** voxel carving, connectivity + debris, structural crush check, fire + smoke, water with buoyancy,
  swimming, drowning, rain/snow (no gameplay effect), day/sunset/overcast/night.
- **HUD:** objective list, alarm clock ("SECURITY ETA"), interaction prompt (targets, valuables, escape),
  numbered tool bar with ammo, condition bar, vehicle speedometer + health, toasts; Tab map (top-down camera with
  DOM markers: required, bonus, van, alarm boxes, player); spray marks visible from above.
- **Settings:** mouse sensitivity, invert Y, FOV 60–110, head bob, master/music/effects volume, quality
  low/medium/high, plus a Diagnostics page. Controls page is read-only. **No key rebinding, no gamepad, no
  difficulty options, no UI scale, no render-scale slider in the menu** (it exists in the renderer API).
- **Saving:** localStorage career; quicksave / quickload F5/F9 during planning (also in the pause menu).

---

## 1. Campaign structure and progression

**Teardown:**
- 40-mission base campaign over 9 playable maps, two parts; side missions marked light blue on the terminal
  ([STEAM], [WIKI] Missions, [CL] 0.7.3 "side missions are clearly marked").
- Hub is a walkable home yard with a **computer terminal**: Messages (emails from clients that carry the
  story and the briefing), Missions (map of the region; replay; skip button when the option is on), Tools
  (upgrade with cash). The hub visibly changes as the story advances; new tools arrive in **crates you pick up**
  in the hub; hub toys (shooting range, snowballs) ([WIKI] Terminal, Tools; [CL] 0.9.6).
- Score per objective -> **rank** -> tool unlock; later ranks pay cash. Max campaign score 204 ([WIKI] Ranks).
  Cash mostly from **valuables**, each with a description and a dollar value shown when you look at it
  ([HUD] `drawPickInfo`: "Value $N").
- Upgrades raise **several stats per tool**: ammo, range, damage (shotgun, gun), blast size (pipe bomb, bomb,
  rocket, nitro), width/length (plank), stretch (cable), power/duration (booster), fuel seconds (blowtorch)
  ([WIKI] Tools; table in `01` §6).
- Unlockable **playable characters** for objectives such as "drown 100 robots" ([CL] 1.6.0).
- 27 Steam achievements rewarding play styles (no-tools run, speedrun < 60 s, 1M/10M/100M voxels) ([CL] 1.1.0;
  `01` §8).
- Options menu shows **Missions played / Tools unlocked / Total score** stats and a **reset progress** button with
  a confirmation ([OPT]).

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Mission count / variety | 40 + DLC | 13 missions, 4 maps | high | Add 1–2 jobs per map reusing existing objective kinds with new twists (e.g. a "move it, don't break it" job: deliver a fragile item intact; a "bring the boss's car home" job using the van). Cheap: data-only in `src/game/missions/`. |
| Story delivery | emails in a hub terminal, story arc | job board with client + brief text | med | A "Messages" tab on the job board: 1–3 short voicey notes from recurring clients (dock foreman, a rival crew, an insurer) unlocked by completed jobs; references to what you wrecked last time. Pure DOM. |
| Hub world | walkable home that changes | menu only | low | Skip for now (large). Later: the test yard becomes "the depot" and gains props per rank. |
| Side jobs flagged | light-blue side missions | all equal | low | Tag jobs "main / side" on the board; side jobs = bonus-heavy, optional for rank. |
| Multi-stat upgrades | ammo + range/damage/blast/size | ammo only | high | Add a second upgrade track per tool: blast radius (bomb, pipe bomb, rocket, nitro), shotgun spread/damage, plank length, cable stretch, blowtorch cut radius. Same `UPGRADES` table pattern, one extra field. |
| Rank rewards beyond tools | cash at top ranks | top rank gives nothing | low | Give cash or cosmetic paint colours for the spray can / van at high ranks. |
| Achievements / feats | 27 | none | med | A "Feats" list (local only): no-tools job, sub-60 s job, 100k/1M voxels, sink a vehicle, 10 valuables in one job, never seen by a drone. Track counters already emitted by the sim. |
| Career stats | missions played, tools, score | rank card on title | low | Stats panel: voxels wrecked, valuables, cash earned, jobs done, time played. |
| Reset progress | yes, with confirm | not in UI (clear localStorage) | low | "Reset career" button in Settings with an "Are you sure?" dialog. |
| Playable characters / cosmetics | yes (1.6) | none | low | Not worth it first-person; maybe van paint jobs as rewards. |

## 2. Mission types and heist rules

**Teardown** (details in `01` §4–5, `07` §7):
- Heist with alarm (60 s default), destruction / demolish-to-height, dump-in-water, vehicle theft into a trailer,
  race (time tiers), chopper-hunted (no timer, chopper with spotlight, autocannon, missiles), chase, destruction %
  with sensors and a 2:00 mission timer, stealth vs robots, photo targets, escort/divert finale.
- Alarm sources: wired alarm boxes, invisible fire alarm, moisture sensors on safes, explosion sensors, demolition
  sensors, electric sensors, hackable terminals that disable the alarm ([WIKI] Security).
- Heavy targets must be **moved into the escape vehicle zone** (`target=heavy` + `IsBodyInTrigger(goal, …)`) and
  "destroy" targets complete when broken ([HEIST]).
- Chopper flies in at ~15 s left, heads for the escape vehicle; mission fails if it gets there ([WIKI] Security
  Chopper).
- Planning phase with no time limit; **one quicksave** in planning; the **fail screen offers Quickload** when a
  quicksave exists ([HUD] `drawEndScreen`: `game.canquickload` -> `Command("game.quickload")`), plus a hint on
  the early mission telling the player to quicksave ([HUD]).
- Weather as a mechanic: rain whose lightning starts fires, storm/tornado, ice-cold water (`01` §4).

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Chopper with a consequence | arrives at ~15 s, fails you at the escape vehicle | cosmetic helicopter | high | Make the security helicopter land a "lockdown team" on the van when the clock hits 0 (visual) and show its approach on the map from ~15 s. Optional: a searchlight cone that adds +1 s penalty while you stand in it. |
| Hunted-style mission | chopper hunts you, no timer | none | med | A "Spotlight" job / challenge: a searchlight drone sweeps the map; while lit, a gunner drone fires; loot crates spawn one by one. Reuses `src/sim/drones.ts`. |
| Fail -> quickload | Quickload button on fail screen | Retry only (quickload in pause) | high | Add "Back to my save" (quickload) on the fail screen when a planning save exists, and a one-time hint "F5 saves your plan" on the first heist. Small DOM change. |
| Mission timer (no alarm) | 2:00 timer + sensors | alarm clock only | med | A "shift ends at…" mission timer for destroy-% jobs: wreck X % before the crane crew arrives. Uses the same clock HUD. |
| Sensor variety | moisture, explosion, demolition, electric, terminals | alarm box, fire alarm, drones | med | Add: (1) "tilt sensor" alarmed object that triggers if knocked over, (2) "wet sensor" crate that alarms in water/rain, (3) a breaker panel you can cut to disarm all boxes in a building (a planning puzzle). |
| Vehicle-theft / race objectives | cars into trailer, race tiers | deliver props into water | med | "Repo job": drive marked cars into a container zone. "Test drive": lap a cone course under time tiers (bonus objectives = faster tiers). |
| Weather that matters | lightning fires, cold water | rain/snow cosmetic | med | A night-rain job where lightning randomly ignites roofs and a fire alarm is active; snow job where water is cold (faster drowning). Uses existing fire + weather modules. |
| Photo objective | camera tool, 70-voxel range | photo mode only | low | "Evidence" job: photograph 5 marked items with photo mode (ray-cast check while in photo mode). |

## 3. Tools

**Teardown:** 17 campaign tools (+ mission tools minigun, camera, laser; DLC jackhammer, gunpowder barrel, space
tools, 5 relic tools) — full list with upgrade costs in `01` §6. Tool selection grouped into categories
(Unlimited, Utility, Firearms, Explosives, Enhancements) since 0.8, redesigned for PC in 1.5.2 ([CL]). Tool name and
ammo shown bottom-centre; ammo can be a custom display string, e.g. seconds for the blowtorch ([HUD] `drawTool`).
Crosshair changes per tool (gun, shotgun, rocket) and a **scope** for the rifle ([HUD] `crosshair`).
Tool sway is an option ([OPT]).

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Strap-on thruster | rocket booster on any object (E to fire, burns 4–8 s) | none | med | "Jet cartridge": stick on any loose object or vehicle, E to ignite, pushes along its normal for a few seconds. Reuses `placeSticky`. Very visible fun. |
| Vehicle thruster | permanent, tied to throttle | none | low | Fold into the jet cartridge (stuck to a vehicle = throttle-linked). |
| Speed boost consumable | energy drink | none | low | "Coffee flask": 15 s faster walk + higher jump, 2 per job. |
| Close-range chipper | jackhammer (DLC) | sledge only melee | med | "Breaker drill": unlimited, slow, chews brick/concrete in a small radius at contact — gives a no-ammo way through masonry. |
| Powder trail | gunpowder barrel (DLC) | none | low | "Fuse cord" tool: lay a line on surfaces, light one end, it burns along and detonates charges at the end. |
| Tool categories | 5 groups, wheel/list | flat 1–0 bar, Q / wheel | med | Group the bar (Hands / Utility / Guns / Explosives) with group-cycle keys; show group header. Pure HUD. |
| Rifle scope | zoomed scope | rifle exists; scope? (check) | low | RMB zoom to 25° FOV with a simple reticle overlay. |
| Per-tool crosshair | yes | one crosshair (hot state) | low | Spread circle for shotgun, drop marks for rocket. CSS only. |
| Upgrade stats | ammo + power stats | ammo only | high | See §1. |
| Throwable explosive arc preview | none (pipe bomb is imprecise by design) | n/a | — | Keep as is. |

## 4. Vehicles

**Teardown:** ~50 base vehicles: cars, trucks, construction (excavator, front loader, mini excavator, dump truck,
cement truck), utility (forklifts, mobile crane, basket lift, telehandler, woodchipper), military (tank), boats
(8 types), bumper car, tractor; DLC race cars and Rally cars (`01` §10). Controls include
`vehicleraise / vehiclelower / vehicleaction` for booms, arms, forks and dump beds ([API]). HUD shows
"VEHICLE CONDITION" bar and the driving keys ([HUD] `drawVehicle`). Frames and wheels are indestructible
([WIKI] Vehicles). Deep water ejects the player.

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Moving arms (loader/forklift/crane) | raise/lower/action keys | loader bucket fixed raised | high | Give the loader a hinged bucket (raise/lower with R/F or wheel) driven by a joint; use it to lift strongboxes into the van. Then add a forklift variant. |
| Boats | 8 boat types, boat escape vehicle | none (harbour map has water) | med | A small skiff for Gullwick Harbour: buoyant hull + propeller force when in water; escape by boat on a harbour job. |
| Heavy demolisher | excavator, tank | loader | med | Tracked "breaker rig" with a swinging ram arm (later; bigger job). |
| Vehicle variety | ~50 | 3 | med | Cheap variants of existing blueprints: pickup truck, tow truck (built-in cable hook), dump truck with tipping bed. |
| Driving key hints | shown on HUD | not shown | low | Show "W/S drive · Space handbrake · E exit · R flip" next to the speedo for the first drive. |
| Ejected in deep water | yes | (check) | low | Force exit when the cabin is submerged. |

## 5. Maps and levels

**Teardown:** 11 campaign maps + DLC maps + 2 multiplayer maps (`01` §3). Design rule: obstacles are only elevation,
distance, water and unbreakable rock; small, cluttered levels ([OFFICIAL] design notes in `01`).
Each map has a sandbox variant with special vehicles ([WIKI] Sandbox).

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Number of maps | 11 + DLC | 4 (one is the test yard) | med | One more compact, dense map with a strong theme (e.g. a hillside market street with stalls, arcades and a funicular). Larger job; not a few-hour item. |
| Map-specific sandbox toys | monster truck, yacht | none | low | Place an extra vehicle or prop pile only in sandbox (flag in level data). |
| Interior density / clutter | very cluttered, every object breakable and described | moderate | med | Add a furniture prop kit (shelves, desks, crates, lamps) scattered with seeded randomness; each prop gets a one-line description (see §7). |

## 6. Game modes

**Teardown:** Campaign, Sandbox (unlimited resources, spawn menu, weather/time options), Challenges Mayhem
(60 s, starts after 1,000 voxels, 5★ at 1M), Hunted (chopper, chests one by one), Fetch (60 s, 15–17 alarmed chests)
([WIKI] Challenges; `01` §11); Creative Mode (build and save voxel objects, 1.4); level editor + Workshop mods;
mini-campaign DLCs (Art Vandals 5 missions, Time Campers 9, Folkrace racing, Greenwash Gambit 14, Relics of Barkuna);
**online multiplayer** since 12 Mar 2026: co-op campaign, sandbox, Deathmatch, Team Deathmatch, Capture the Flag,
Treasure Thieves, up to 12 players, host-as-server ([CL] 2.0.0, [FAQ], [PRESS]). Rally mode (8 Dec 2026, announced).

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Challenge count | 3 per map | 2 per map | med | Third challenge "Spotlight" (hunted-style, see §2) or "Demolition derby": score by ramming vehicles into marked buildings in 90 s. |
| Star tiers | 1–5★ per challenge | stars recorded | — | Present (check thresholds feel achievable). |
| Spawn menu in sandbox | spawn vehicles/props | none | med | Sandbox-only "Drop" menu (key B): spawn a vehicle blueprint, a crate, a gas canister, a nitro pile at the crosshair. Reuses prefab functions. |
| Creative build mode | yes | none | low | Later: a voxel brush in sandbox (place wood/brick/metal boxes). |
| Multiplayer | 12-player online | none | low (for scope) | Out of scope for a few-hour item; note as long-term. |
| Mod support | editor + Workshop | none | low | Out of scope. |

## 7. HUD, UI and UX

**Teardown:**
- **Target outline**: every target body within **8 m** gets an outline whose strength fades with distance
  (0.6 × (1 − d/8)); full outline when it is the interact body ([HEIST] lines 179–186).
- **Look-at info**: aim at any object while idle and its description fades in (typewriter effect), e.g. a prop
  name; targets append "Primary target" / "Target", valuables append "Value $N" ([HUD] `drawPickInfo`). Every prop
  in the game has a (often joking) description.
- Objective panel "Required" / optional counters with icons ([HEIST] lines 349–432); alarm timer with text outline
  ([HEIST] ~310).
- End screen: MISSION COMPLETED / FAILED, score, "New highscore", Quickload, Retry, hint text ([HUD]).
- Cash counter animates when it changes ([HUD]).
- Health bar "HEALTH", vehicle condition bar ([HUD]).
- Tab map, spray marks shown; photo mode with DOF, exposure, bloom, zoom, tool toggle, free/rotate/tilt camera
  ([HUD] `photoMode`; [CL] 0.7.0, 0.7.3).
- Button icons for the active input device (keyboard or gamepad glyphs) ([CL] 0.9.5; [HUD] `game.input.*.icon`).
- Large UI for low-resolution screens (Steam Deck) and a saved font-size setting ([CL] 1.1.0, 1.5.3).
- Audio muted when the window loses focus ([CL] 1.1.0).
- Third-person camera toggle (1.6.0, [CL], [PRESS]).

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Target highlight near player | outline within 8 m | none (map markers only) | high | Draw a pulsing rim (inverted-hull or edge shader on the target body mesh, or a screen-space marker) within ~8 m, stronger when aimed at. One material flag on target bodies. |
| Look-at descriptions | every object described | prompt only for targets/valuables/escape | high | Add an optional `desc` to props/materials; show it under the crosshair after ~0.5 s of looking ("Pallet of roof tiles", "Somebody's lunch"). Adds lots of character for little code. |
| Valuable value on look | "Value $N" | "E — pocket X ($N)" | — | Present. |
| Animated cash / score counters | yes | static | low | Count-up animation in HUD and end screen. |
| End screen quickload + hints | yes | retry/next/board | high | See §2. |
| Driving / tool key hints by device | glyphs per device | static text | med | Show the bound key in prompts from the keymap (needed once rebinding exists). |
| UI scale / font size | yes | none | med | Settings slider that scales the HUD/menu root (`font-size` on the root; everything uses em). |
| Mute on focus loss | yes | (check) | low | `visibilitychange` -> duck master gain. |
| Photo mode controls | DOF, exposure, bloom, zoom, hide tool | free camera, FOV zoom | low | Add exposure and bloom sliders (post chain already has them) and a hide-HUD toggle. |
| Third-person toggle | yes | first person only (+ vehicle chase cam) | low | Optional later; needs a player model. |

## 8. Settings / options

**Teardown** (tabs: Display, Graphics, Audio, Game, Input; from [OPT] unless marked):
- **Display:** mode (fullscreen/window/borderless), resolution, monitor index; restart required.
- **Graphics:** render scale 100 / 75 / 50 %; render quality Low / Medium / High ("shadows, reflections and
  denoising"); gamma 50–150 (default 100); FOV 60–120 (default 90); depth of field on/off; barrel distortion on/off;
  motion blur on/off; vertical sync (incl. adaptive, [CL] 0.7.1); particle density ([CL] 1.5.1); OpenGL / DirectX 12
  ([CL] 1.5.1); DLSS / FSR modes (DX12, [CL] 2.2.0). Ray tracing cannot be turned off; no frame-rate cap option
  ([FAQ]). Players commonly turn off DOF, barrel distortion and motion blur ([GUIDE]).
- **Audio:** music, sound, ambience volume (0–100), menu music toggle.
- **Game (difficulty/accessibility):** intro text "If you think the game is too hard, too easy, or just want a more
  relaxed experience, you can make adjustments here." Alarm time: disabled / +15 / +30 / +60 / −10 / −20 s; ammo
  +50 % / +100 % / no ammo; health +50 % / +100 % / −50 %; mission skipping (adds skip buttons to terminal and fail
  screen); allow spawn; unlock all levels; unlock all tools; stats; reset progress ([OPT]).
- **Input:** sensitivity 25–200 %, mouse smoothing 0–100, invert look, tool sway on/off, head bob 0–100; rebindable
  forward/back/left/right/jump/crouch/interact/flashlight with "reset to default" (custom bindings since 0.7.1);
  gamepad via Steam Input ([CL] 0.7.1), better gamepad navigation in 2.0.2 ([CL]). Native controller support on PC
  promised with Rally ([FAQ]).
- 1.6.1: option to hide characters in vehicles ([CL]).
- Languages: interface in 9 languages, no subtitles listed ([STEAM]).

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Difficulty / assist options | alarm ±, ammo ±, health ±, skip, unlock-all | none | high | "Assists" section: alarm time (off / +15 / +30 / +60 / −10 s), ammo (×1.5, ×2), toughness (×1.5, ×2, ×0.5), "allow skipping a job" (skip button on fail screen), sandbox "unlock all maps/tools". All are multipliers on existing numbers in `progress.ts` / `mission.ts`. Mark runs with assists in the score screen (do not block rank). |
| Key rebinding | 8 movement/interact keys + reset | read-only list | high | Rebind table on the Controls page: click a row, press a key, store `KeyboardEvent.code` in settings; `input.ts` maps logical actions -> codes. |
| Gamepad | Steam Input + glyphs | none | high | Browser Gamepad API: sticks -> move/look, triggers -> use/grab, bumpers -> tool cycle, A jump, X interact, Start pause; menu focus navigation already starts at the primary button. |
| Render scale in menu | 100/75/50 % | renderer API only | med | Slider 50–100 % in Settings (wires to existing `setResolutionScale`). |
| Gamma / brightness | 50–150 | none | med | Brightness slider -> exposure uniform in the post chain. |
| Mouse smoothing | 0–100 | none | low | Exponential smoothing of look delta. |
| Tool sway toggle | yes | (view-model sway?) | low | Toggle to freeze view-model sway (comfort). |
| Head bob amount | 0–100 slider | on/off | low | Turn the checkbox into a 0–100 % slider. |
| Motion comfort (DOF/blur/distortion) | toggles | WS has none of those effects except vignette | low | Add "vignette" and "screen shake" sliders instead (WS-specific comfort). |
| Particle density | yes | tied to quality tier | low | Separate debris/particle density slider (low-end machines). |
| Ambience volume | separate | music + effects | low | Split ambience (wind, rain, sea) from effects. |
| Language | 9 UI languages | English | low | Out of scope. |

## 9. Physics, destruction, fire, water

Covered in depth in `03`, `07`, `09`. Gaps visible to a player that remain:

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Material tiers | 7 hardness tiers, 13 materials | multiple tiers (see `src/sim/materials.ts`) | — | Present; keep the "sledge can't do brick" rule visible by a "too hard" chip sound + toast. |
| Structural support | none (hangs on one voxel) | crush check for thin supports | — | WS is ahead here. |
| Fire limit / spread | 100 fires cap, alarms | spread + fire alarm | — | Present. |
| Rain extinguishes / wet objects | rain wets, moisture sensors | cosmetic rain | low | Rain slowly lowers fire spread; wet-sensor crates (see §2). |
| Ice / cold water | hypothermia | drowning only | low | Snow preset -> water damage over time. |
| Explosive props | propane tanks, gas trucks, car alarms | (check level props) | med | Scatter gas cylinders / fuel drums that explode when shot or burned (chain reactions are a key "fun" moment). |

## 10. AI / enemies

**Teardown:** security chopper (spotlight, autocannon, missiles, reacts to loud noises, cannot be damaged);
robots in Part 2 (gun, flamethrower, missile, alarm-scanner that needs 2 s, spider), 150° / 25 m vision, investigate
sounds, die only in water (`01` §5.5, `07` §6).

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Hearing / investigate noise | robots and chopper turn to sounds | drones (vision-based?) | med | Emit a noise event for explosions/gunshots; drones fly to the last noise position. Enables decoys (throw a pipe bomb away from the loot). |
| Scanner delay | alarm robot needs 2 s of sight | (check drone spot time) | med | Visible "detection meter" ring on the drone (fills over ~2 s), so players can break line of sight. |
| Ground enemy | walking robots | drones only | low | Later. |
| Acting chopper | see §2 | cosmetic | high | See §2. |

## 11. Audio

Teardown: music cues per phase, ambience channel, menu music toggle, mute on focus loss ([OPT], [CL] 1.1.0;
details in `06`). WS: fully procedural audio and music, never human-reviewed (PROGRESS.md).

| feature | Teardown | Wrecking Shift today | impact | suggested ORIGINAL way to fill it |
|---|---|---|---|---|
| Separate ambience bus | yes | no | low | Third volume slider. |
| Alarm countdown audio ramp | tense music when alarm starts | (check `src/audio/music.ts` cues) | med | Ensure a distinct alarm cue + ticking in the last 10 s. |
| Human listening pass | — | not done | med | Not a feature: get one person to listen and report. |

---

## Top 10 gaps a player would notice most (prioritised; each roughly a few hours in TS/three.js)

1. **Difficulty / assist options** — alarm time (off/+15/+30/+60/−10 s), ammo ×1.5/×2, toughness, job skipping,
   sandbox unlock-all. The reference has had these since 0.7.3 and players rely on them; WS has none. Multipliers on
   existing numbers plus a Settings section.
2. **Target highlight within ~8 m** (rim/outline that strengthens when aimed at). Without it players walk past loot
   in cluttered rooms; the reference outlines every target near the player.
3. **Look-at descriptions for props** (name/joke line under the crosshair after a short look; "Primary target" /
   "Bonus" tags). Big gain in character and readability for a small data + HUD change.
4. **Key rebinding** on the Controls page (logical actions -> `KeyboardEvent.code`, reset to defaults), with prompts
   showing the bound key.
5. **Gamepad support** via the browser Gamepad API (move/look, triggers, tool cycle, menu navigation).
6. **Helicopter with a consequence** — approaches from ~15 s left, visible on the map, "lands on the van" at 0 (the
   current one is purely cosmetic, so the final seconds lack a visible threat).
7. **Fail screen "back to my save"** (quickload when a planning save exists) + a first-heist hint to press F5. Matches
   the intended plan -> test -> reload loop.
8. **Multi-stat tool upgrades** (blast radius, shotgun damage/spread, plank length, cable stretch, blowtorch radius)
   so cash buys *power*, not only ammo.
9. **Loader bucket raise/lower (then forklift)** — a working arm to lift strongboxes into the van and pry walls;
   currently the bucket is fixed.
10. **Jet cartridge (strap-on thruster) tool** — stick on any loose object or vehicle, E to fire for a few seconds.
    High fun-per-line-of-code; reuses the sticky-charge code.

Close runners-up: graphics/comfort sliders (render scale, brightness, UI scale, head-bob amount), sandbox spawn
menu, third challenge (hunted-style "Spotlight"), feats/achievements and career stats, noise-investigating drones
with a visible detection meter, weather that matters in a job (lightning fires), explosive gas cylinders, more jobs
per map.

## Uncertainties

- [OPT]/[HUD]/[HEIST] are community copies of pre-1.5 game scripts; menus were redesigned in 1.5.1 and 2.x, so
  exact labels and ranges may differ in the 2026 build (later additions known only from [CL]).
- The 8 m outline distance is from the vanilla heist script copy; later DLC scripts may differ.
- No official accessibility list exists ([STEAM] lists none; [FAQ] says nothing). Subtitles: none found.
- Some WS cells say "(check)" where the code was not read in detail (rifle scope, drone spot delay, mute on focus,
  alarm music cue, deep-water ejection).
