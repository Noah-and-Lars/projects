# 12 — Tool selection / inventory (Teardown reference → Wrecking Shift spec)

Research for reworking the Wrecking Shift tool bar so it is as easy to use as Teardown's. The look stays our own.
Builds on `01-gameplay.md` §6/§9 and `10-gap-analysis.md` §7 (the row "Tool categories: 5 groups, wheel/list").

Source tags:
- **[HUD]** Community copy of the shipped `ui/hud.lua`, `drawTool()`, lines 189–348: https://github.com/bingleboy/TD-Redux/blob/HEAD/ui/hud.lua. This is real game code from the 0.8–1.4 era, before the 1.5.2 PC redesign.
- **[TERM]** Same repo, `ui/terminal.lua` (`drawTools`, `unlockTool`).
- **[HEIST]** Same repo, `script/heist.lua` (`drawTargetInfo`, `drawTimer`).
- **[API]** Official Lua API: https://teardowngame.com/modding/api.html (`RegisterTool`, `SetToolEnabled`, `SetToolAmmo`, `SetToolAmmoPickupAmount`, input list).
- **[CL]** Official changelog: https://teardowngame.com/changelog. **[NEWS]** Steam news for 0.8.0 ("Adjustable weather and more", 7 Oct 2021).
- **[MOD]** Comments on the "Better old HUD" Workshop mod: https://steamcommunity.com/sharedfiles/filedetails/comments/3086273151

Confidence: **confirmed** means seen in code or official docs. **likely** means inferred from code or design and not seen directly. **unknown** means not found.

## 1. History
- 0.8.0 (Oct 2021): "New tool selector user interface with tool categories and better overview. This will make room for new tools in Part 2" [NEWS]. It added "New tool selection interface with tool groups" and an optional `group` parameter on `RegisterTool` [CL].
- 1.5.2: "Tool selection for PC redesign" [CL]. The fandom wiki files this under 1.5.1. I found no description or code for the redesigned layout. Players describe the newer bar as a "chunky" hotbar that "takes up the full bottom of the screen", where the old one was a small bar [MOD]. **Treat any detail about the post-1.5.2 look as unknown.** Everything below describes the 0.8–1.4 selector, which is well documented by code and is the model worth copying.

## 2. How tools are selected
- **Six numbered groups (confirmed).** `RegisterTool(id, name, file, [group])`: "Tool group for this tool (1-6) Default is 6" [API]. The HUD loops `for g=1,6` and reads `game.tool.<id>.group`, `.enabled` and `.index`. Inside a group, tools are sorted by `.index` [HUD].
- **Group names (confirmed in HUD code)** are `{"Basic", "Utility", "Firearm", "Exposive"[sic], "Special", "Extras"}` [HUD]. The variable is declared but not drawn in that version: the column header is only the number. `01-gameplay.md` lists the wiki's categories (Unlimited, Utility, Firearms, Explosives, Enhancements). The code names are more reliable.
- **Default group of each vanilla tool (likely, from memory and the wiki's categories; not seen in code):**
  - 1 Basic: sledge, spraycan, extinguisher, blowtorch
  - 2 Utility: plank, rope/wire, leaf blower, rocket booster, vehicle thruster
  - 3 Firearm: gun, shotgun, rocket, rifle
  - 4 Explosive: pipe bomb, bomb, nitroglycerin
  - 5 Special: mission or temporary tools (unknown)
  - 6 Extras: mods by default (confirmed by the API default)
- **Number keys 1–6.** The HUD checks `InputDown("1".."6")` only to remember which group was pressed last and draw that key box at full opacity. The engine does the actual switch. Pressing a group's number again moves to the next tool in that group (**likely**). The HUD design supports this: each column keeps its list scrolled to centre the selected tool. Keys 7–0 do nothing in the 0.8 selector (**likely**).
- **Mouse wheel (confirmed):** steps through all enabled tools across groups. A custom tool "can be selected with scroll wheel" [API]. The HUD clears the "last pressed group" when the wheel moves, so no group key stays highlighted [HUD].
- **Logical inputs `tool_group_prev` / `tool_group_next`** ("Switch to previous/next tool group") exist [API]. They are presumably the gamepad bindings. The exact buttons (bumpers or d-pad) are **unknown**. No official radial menu or tool wheel exists. Tool wheels and "Q" tool menus are community mods (Tool Menu, Tool Wheel).
- Right mouse button plus wheel adjusts grab distance (`01-gameplay.md`), so the wheel is not used for tools while grabbing.

## 3. Tool bar on screen (0.8–1.4) [HUD]
**Always visible: one line at bottom centre.**
- The current tool name in UPPERCASE, bold, 26 px, centred about 15 px above the bottom edge.
- Ammo sits directly above the name at 1.6× scale.
- No icons. Nothing is drawn for the tool `none`.

**Expanded selector: only while switching.**
- It is shown while the engine flag `game.player.toolselect` is true. That flag turns on when a tool changes and turns off after a short delay. The delay is set by the engine, so the exact time is **unknown** (about 1–2 s by feel).
- Fade in: alpha and vertical scale 0→1, `easeout`, 0.25 s. Fade out: `easein`, 0.25 s.

**Layout of the expanded selector**
- One **column per non-empty group**, 200 px apart, centred horizontally, sitting just above the name line.
- **Column base:** a 34×34 rounded white box with the group number in black. It is at 30 % opacity unless it is the group whose key was just pressed.
- **Above the base:** a vertical list of that group's enabled tool names, bold, 22 px, one row each.
  - The selected tool is white at 100 % and pops: scale 1.4→1.0 over 0.3 s each time the tool changes.
  - Other tools are white at 30 %.
  - Names over 16 characters are cut to 13 characters plus "…".
- **At most 5 rows per column.** Longer lists sit in a clipped window and scroll smoothly (lerp 0.2 per frame), keeping the selected tool in the middle row.
- While the selector is open, the "look-at" pick info moves up 120 px so the two don't overlap.

**Not present:**
- No icons and no per-tool ammo inside the expanded columns. Ammo appears only on the bottom line, for the current tool.
- No hotbar of all tools while idle.

## 4. Ammo
- **Display rule [HUD]:**
  - If the key `game.tool.<id>.ammo.display` exists, show that string. This lets a tool show seconds of fuel, or show nothing.
  - Otherwise show the integer `game.tool.<id>.ammo`.
  - If ammo ≥ 9990, show nothing. Sandbox sets ammo to 9999 for unlimited. There is **no ∞ symbol**: unlimited simply has no number.
  - Custom ammo display was added in 0.7 [CL]. Mods can read `level.unlimitedammo` and `level.sandbox` [CL].
- **Out of ammo:** the HUD script shows `0` with no special colour. Whether an empty tool stays selectable or greys out is **unknown**.
- **Ammo per mission:** ammo refills every mission. Upgrades raise the maximum. Options can set ammo to +50 %, +100 % or no ammo (`01-gameplay.md`).
- **Pickups:** `SetToolAmmoPickupAmount(toolId, ammo)` sets "the default amount of ammo granted when picking up an ammo crate". It is used for "custom crates or ammo pickups for tools" [API], so ammo crates exist in the current (2.x) API. Where vanilla levels place them is **unknown**. The changelog also lists `SpawnTool` and tool-control functions in 2.0 [CL].

## 5. Locked tools and how new tools are announced
- **Locked tools are hidden, not greyed.** The selector lists only tools with `game.tool.<id>.enabled` [HUD]. The terminal's Tools tab lists only unlocked tools (`savegame.tool.*`) [TERM].
- Mod tools start disabled after `RegisterTool` and need `SetToolEnabled` [API].
- **Unlock flow:**
  - A new tool comes with a rank up. An email in the hub terminal carries a **"Tool – <name>" attachment button** that opens the Tools tab with that tool selected [TERM].
  - The tool is picked up physically in the hub, in a crate (`01-gameplay.md`).
  - `unlockTool()` enables the tool, writes its default upgrade values and **equips it immediately** (sets `game.player.tool`) [TERM].
- In-level messages use a top-centre notification pill: black at 70 % opacity, rounded, 24 px bold, with optional inline icons, timed fade [HUD]. Examples are "Progress saved" and "Progress restored".

## 6. Valuables and mission targets on the HUD
- **Valuables:** looking at one shows "<name> · Value $N" as pick info [HUD].
  - When cash increases, a **"Cash $N" box slides in at top right** and counts up from the old value over 1.2 s with a cash-register sound and a flash, then slides out [HUD].
  - The box is always shown in the hub. It is hidden during the alarm.
- **Targets: two rows of pip icons at bottom right [HEIST].**
  - "Required" row: yellow pips (1, 1, 0.5).
  - "Optional" row: white pips. It appears only if the mission has optional targets.
  - Each pip is an empty or filled target icon. Labels sit to the left. Background is a black box at 15 % opacity, rising to 80 % when the map is open.
  - The block **appears only after the first target is taken**, or while the map is open.
- **Target events:** each pickup shows a large right-aligned banner for 3 s: "Target cleared" / "All targets cleared" / "Mission complete" [HEIST].
  - Targets within 8 m get an outline.
  - Pick info reads "Primary target" or "Target" [HUD].
- **Timer [HEIST]:** large outlined digits at top centre. It shows `m:ss`, switching to tenths below 60 s. A fire meter appears when the level has a fire alarm.

## 7. Upgrade screen (hub terminal, Tools tab) [TERM]
- **Left:** a panel titled "Tools" listing one row per unlocked tool, 250×36 px. The selected row is darker and hovered rows highlight.
- **Right panel:**
  - Tool name.
  - The description types out character by character.
  - A large tool image that slowly bobs.
  - A table headed **Attribute | Upgrade**. Each row has the attribute name (e.g. Ammo, Range, Blast size), the current value, and a **segment bar**: one 10×14 px block per step, white for bought steps and grey for remaining ones. Next comes a **"$price" button**.
  - Hovering a row shows "+<step> <attribute>" and the attribute's description underneath.
  - If cash is too low, the button is at 50 % opacity and disabled, and a "not enough cash" state fades in.
  - Buying plays upgrade and cash sounds and bounces the image (0.8→1, bounce, 0.5 s).
  - Tools without upgrades say "No upgrades available".
- Upgrades write both `savegame.tool.<id>.<attr>` (persistent) and `game.tool.<id>.<attr>` (live).

## 8. Mod tools
- They appear in **group 6 ("Extras") by default**. A mod may pass 1–6 to join a vanilla column. Within a column the order is `game.tool.<id>.index` [API][HUD].
- They show up in the same selector, wheel order and number-key cycling as vanilla tools. They are hidden until enabled.
- They can set custom ammo text through `ammo.display` and an ammo-crate amount through `SetToolAmmoPickupAmount`.
- Name strings may be localisation keys (`"loc@MINIGUN"`) [API].
- Because a column scrolls past 5 tools, a crowded group 6 stays readable.

---

## 9. Design spec for Wrecking Shift (original look, same usability)
Current state: a flat bar with 1–0, Q and wheel (`src/game/ui/menus.ts`, `game.ts` `pendingScroll`). Tools are listed in `src/game/progress.ts`. Mod tools come from `ToolDef` in `src/mods/api.ts`, which has no group field yet.

**A. Groups (slots 1–6)**
- Add `group?: 1|2|3|4|5|6` and `order?: number` to tool definitions and to `ToolDef`. Missing values default to group 6 and order 100.
- Defaults:
  - 1 **Hands**: sledge, spray, extinguisher
  - 2 **Rigging**: blowtorch, plank, cable
  - 3 **Guns**: pistol, shotgun, rifle, rocket
  - 4 **Charges**: pipebomb, bomb, nitro
  - 5 **Job kit**: mission or temporary tools (camera, keycard, etc.)
  - 6 **Extras**: mods
- Group names are our own, shown as small headers on top of each column.

**B. Input**
- **Number key N:**
  - If the current tool is not in group N, select the first enabled tool in group N. If that group was used before, return to the tool last used in it.
  - If the current tool is already in group N, cycle to the next tool in N, wrapping around.
  - If group N is empty, do nothing and briefly shake or flash its slot.
- **Keys 7–0:** unbound, or later a "last used tool" swap on 0 or `X`.
- **Mouse wheel:** step through *all* enabled tools in group order, then by `order` within a group, wrapping around.
  - Accumulate deltas and apply at most one step per ~50 ms, so a trackpad does not overshoot.
  - Ignore the wheel while grabbing; there it keeps controlling grab distance.
- **Q:** keep it as "previous tool" (quick swap). This is more useful than a group cycle.
- **Gamepad:** LB/RB step to the previous/next group. D-pad up/down steps through tools inside the group. This mirrors `tool_group_prev/next`.

**C. Compact bar (always on)**
- Bottom centre.
- Show the current tool's **name** plus a **small icon or glyph** (our own addition; Teardown shows text only) and the **ammo** next to it, in a large tabular-figure number.
- No full hotbar while idle, so the screen stays clean for destruction.

**D. Expanded view (on every switch)**
- Fade and slide up in about 0.2 s. Stay **1.5 s** after the last switch input, then fade out in about 0.25 s. Keep it open while a number key is held.
- One column per non-empty group, with the slot number on a key-cap base and up to 5 rows above it. Longer columns scroll and keep the selection centred.
- **Selected row:** bright, with an accent bar and a 1.3→1 scale pop over 0.25 s.
- **Other rows:** about 35 % opacity, each with its small ammo count on the right.
- The pressed slot's key-cap lights up. A wheel switch lights no key-cap.
- Move pick info and toasts up while the view is open.
- Accessibility: setting "Tool bar: auto-hide / always expanded".

**E. Ammo rules**
- Unlimited tools (sledge, spray, extinguisher, sandbox) show **no number**. Optionally show a faint "∞" in the expanded view only.
- Tools may supply `ammoText()` for custom units, e.g. blowtorch `"18 s"` or a cable count.
- **0 ammo:**
  - The number turns a warning colour and the row is struck through or dimmed.
  - The tool stays selectable, so the player can see why it fails.
  - A use attempt plays a dry-click sound plus "Out of <name>" in the compact bar.
  - Wheel cycling skips empty tools only if the "skip empty tools" option is on (default off).
- **Low ammo** (≤ 20 % of max or ≤ 1 charge): amber.
- **Pickups:** ammo crates (`ammo` tag, amount per tool, cf. `SetToolAmmoPickupAmount`) show the toast "+6 shells", and the compact bar's number does a quick count-up.

**F. Locks and unlocks**
- **In missions, hide locked tools**, as Teardown does.
- **In the hub upgrade screen, show locked tools greyed** with a lock and the rank needed ("Unlocks at Foreman of Ruin"). This adds a goal and is our own choice.
- **On unlock:**
  - The terminal email carries a "Tool – X" link to the upgrade tab.
  - The next spawn shows a top-centre toast "New tool: X [slot 4]".
  - The new tool is **auto-equipped once**, and its slot in the expanded view pulses for its first use.

**G. Targets and valuables HUD**
- **Bottom-right pips:** a "Required" row in the accent colour and an "Optional" row in white, filled when cleared.
  - Hidden until the first clear, or while the map is open.
  - On each clear, show the 3 s banner "Target cleared" / "All required cleared" / "Shift complete".
- **Cash:** a top-right pill slides in on gain and counts up over about 1 s, then hides. It is always shown in the hub.

**H. Upgrade screen**
- Tool list on the left, grouped by slot headers.
- **Right panel:**
  - Name, blurb and icon.
  - One row per stat (ammo now; blast or range later, per `10-gap-analysis.md` §1) with a segment bar, the current value and a "$cost" button.
  - Hovering shows the preview "+6 shells → 24".
  - The button is disabled and dimmed when cash is short.
  - Buying gives a bounce and a sound.

**I. Mods**
- `ToolDef.group` defaults to 6 and `order` keeps registration order.
- Mods may target groups 1–5. They appear in wheel and number cycling with no extra code.
- Names over about 16 characters are truncated with "…" in columns. The full name shows in the compact bar.
