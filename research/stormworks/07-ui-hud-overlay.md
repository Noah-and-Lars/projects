# 07 - Game UI, HUD and Overlays (Stormworks genre reference)

Confidence note: the Fandom wiki returned HTTP 402 to our fetcher, so web-verified facts are limited to search-result summaries (marked [V]). Everything else is from general knowledge of the game (marked [K]) and should be re-verified in-game before being relied on. No assets or text are copied; the proposed design is original.

## 1. Summary
Stormworks has a diegetic-leaning UI: a simple radial/quick-select and minimal HUD in the world, a world-space "workbench" editor with docked panels, and a deep in-vehicle screen system (monitors driven by player-written Lua or by logic blocks). The strongest ideas to borrow: (a) editor modes as separate "lenses" on the same vehicle (build / select-logic / paint / measure), (b) in-world screens that are real programmable surfaces, (c) a shared map that doubles as mission board and navigation, (d) a logic overlay that shows wiring over the 3D model. Weak points: dense editor with steep learning curve, logic editor lacking features for years (multi-select, undo, copy/paste only added later [V]), limited controller support (explicitly not planned for the vehicle editor [V]), and spreadsheet-like tooltips.

## 2. Screen-by-screen functional inventory

### 2.1 Main menu / world setup [K]
- Main menu: continue, new game, load, workshop/mods, settings, quit.
- New game: world/scenario selection, difficulty-like toggles (environment hazards, fire, vehicle damage, oxygen/fuel consumption, unlock-all/infinite money "creative" style options), starting money/research, multiplayer toggle and server name/password/visibility/player cap.
- Settings: graphics, audio, controls (rebindable keys, separate sets for on-foot/vehicle), gameplay (units, tooltips, sensitivity), language.

### 2.2 In-game HUD [K]
- Bottom/corner: health, oxygen/stamina, held item slot with ammo/charge, equipment quick bar (number keys / radial).
- Context: crosshair-centred interaction prompt ("press E to ..."), seat/button/lever tooltips naming the control (seat tooltip fixes in patch notes [V]).
- Time/weather indicator, notifications (mission accepted, money changes, damage warnings), compass optional.
- Vehicle: seat view HUD with player-configured hotbar, optional speed/fuel shown via monitors rather than fixed HUD.

### 2.3 Map screen [K]
- Full-screen map overlay (movement is stopped while it is open [V]), pan/zoom, layer toggles (island names, roads, terrain/satellite, weather, ocean depth in some versions).
- Markers: player vehicle locations, mission objectives, beacons, other players, user waypoints, tile/zone labels. Map can be placed on in-vehicle monitors via Lua/logic map component so vehicle navigation reuses the same data.
- Click to place/remove waypoint; hover for names.

### 2.4 Missions / contracts [K]
- Mission list in a phone/tablet-style or menu panel: name, location, reward, difficulty/hazards, status. Accepting spawns the mission and a map marker; completion pays out and may unlock tiers.
- Also: rescue targets and fires marked in world and map.

### 2.5 Workbench / vehicle editor [K, parts V]
- Entering a workbench enters edit mode in a bounded build volume with a part palette on one side: categories (structure, engines, fuel, propulsion, electronics, logic, weapons, doors, controls...), search, per-part tooltip (mass, cost, stats).
- Modes: Build/place, Select/Logic (shows components and connections; rotors render correctly here [V]), Paint (additive paint tool, multiple component paint colours added in v1.4.14 [V]), Measure, Merge/split/submerge tools (subgrid and welding to separate rigid bodies).
- Symmetry (mirror) placement, rotate/flip part, copy/paste of selections, save/load vehicle blueprint, workshop publish.
- Readouts: total mass, cost, part count, fuel/power info; vehicle warnings system for likely logic errors (added 0.10.20 [V]); warning if vehicle obstructs the workbench zone on return [V].
- Microcontroller editor: separate 2D node-graph window with a component palette, drag-box multi-select, undo/redo, copy/paste (added later [V]); dropdowns clipped in scrolling panels was a bug [V]. Later "Layers" update exists (v1.15.10 mentioned [V], details unknown).
- Logic overlay in the 3D editor: link lines between parts, colour-coded channel types (on/off, number, composite, video, audio); components can be connected by dragging between ports.

### 2.5b Vehicle spawn menu [K]
Spawn from saved vehicles / workshop at a workbench; vehicle list with thumbnails, tags, search, delete, favourites.

### 2.6 Pause / escape menu [K]
Resume, settings, save, return to menu, multiplayer player list, server options. Game pauses in single player (onTick halts but onDraw monitors still render [V]).

### 2.7 Multiplayer overlays [K]
Chat (text box with history), player list (names, ping), admin/server panel (kick, ban, auth, teleport, vehicle ownership/despawn), voice indicators.

### 2.8 In-vehicle screens [V/K]
- Monitors of multiple sizes (from small to large grid) with touch input; content from logic (video composites, text, map) or Lua scripts.
- Lua API: onTick (logic rate, 60 Hz sim) and onDraw (per frame per monitor, ~60 or ~30 fps; >16 ms slows FPS, >100 ms discards frame [V]); screen drawing calls work only in onDraw [V]; monitor size queried at runtime [V]; built-in bitmap font about 4x5 px per char [V]; draw API is immediate-mode primitives (rect, line, circle, text, colour).
- Gauges/dials/lights/buttons/switches/sliders are physical logic parts with properties, shown in world or on screens.
- HUD-on-glass style displays achieved by transparent/overlay monitors, vehicle-mounted.

### 2.9 Notifications, accessibility, controller [V/K]
- Toast/banner notifications for missions, warnings, errors.
- Controller support was added to many menus in v1.4.9, with character and vehicle control and universal B-back in v1.4.11; the dev stated no plans for controller support in the vehicle editor [V].
- Accessibility otherwise limited (colour-coding heavy logic wires, small text, no documented colour-blind modes) [K].

## 3. UX pain points
1. Editor discoverability: many modes and hotkeys, no onboarding; steep learning curve [K, widely reported].
2. Logic editing historically missing multi-select, undo, copy/paste (fixed later) [V]; wiring spaghetti at scale; no hierarchy until layers.
3. Lua scripting UI: in-game text editor is crude; people use external IDEs and simulators (npm "stormworks-screen-api" exists as an offline tool [V]); hard operand/limits and silent failures (e.g., long if statements reported failing [V]).
4. Editor lacks controller support by design [V]; no real remappable accessibility options.
5. Error reporting: warnings were retrofitted [V]; hard to see why a vehicle doesn't work (missing power, unconnected channel).
6. Small clipping bugs in scroll panels and dropdowns [V] suggest an immediate-mode style UI toolkit with layout limits.
7. Mass/buoyancy/balance feedback during building is minimal; players iterate by spawning in the world.
Mods/requests commonly cited [K]: better part search/filtering, bigger/denser logic canvas, in-editor Lua IDE with autocompletion, buoyancy/CG visualisation, custom HUD scripting.

## 4. Proposed original UI design

### 4.1 Visual language
"Chart-table / survey sheet": warm off-white paper panels with ink-blue linework, safety-orange accent for the interactive/active thing, thin hairlines and tick-mark borders, monospace numerals. Dark "night watch" theme variant (deep navy, amber text). Shapes: square-cut panels with notch corners, no rounded glossy cards. Icons are single-weight stroke glyphs. Colour never the only signal (every wire type also has a dash pattern and a glyph).

### 4.2 Information architecture
- Top level states: Harbor (menu hub) -> World -> Yard (editor). Hub is a diegetic-feeling screen: tabs Worlds, Fleet (saved vehicles), Contracts, Workshop, Settings.
- World HUD (minimal, 4 zones): bottom-left vitals (a single ring per stat), bottom-centre hand slot + radial, top-centre contextual toast stack, right edge collapsible contract tracker. Interaction prompt appears next to the targeted object, not at screen centre.
- Map (key: M): full-screen chart with layers drawer on the left (terrain, depth, weather, traffic, contracts, vehicles), a bottom bar with coordinates, scale and waypoint list; right-click context radial (place waypoint, share, measure distance, set as autopilot target). Same chart component embeds on vehicle screens.
- Contracts: card board grouped by region with filter chips (hazard, payout, time, required gear); detail pane with route preview on map; one-tap "track".
- Yard editor layout (three columns + bottom strip):
  - Left: Parts drawer - category rail, search with filters (tags, mass range, power, size), recents/favourites, drag or click-to-arm.
  - Centre: viewport with mode strip across top: Build, Wire, Paint, Measure, Test (live physics sandbox in a tank/pad). Symmetry toggle with axis gizmo, grid-snap selector, ruler.
  - Right: Inspector (selection properties, per-part parameters, group/sub-assembly tree).
  - Bottom strip: live budget bar - mass, cost, centre of mass and buoyancy marker, power budget, part count - each clickable to show the offending parts highlighted. Undo history as a scrubbable timeline.
  - Validator panel: errors/warnings with "show me" jump buttons (unpowered, unconnected inputs, floating parts, unreachable seat).
- Wiring: instead of a separate window, the Wire mode overlays ports on the 3D model and offers a "schematic" pop-out sheet with auto-layout; both views edit the same graph. Layers/groups collapse into labelled boxes.
- Scripting: embedded editor pane with sandboxed API, console, live preview of the target screen, and error lines; external-file sync option.
- Multiplayer: Roster (players, ping, role), chat drawer (bottom-left, fades), Harbor-master admin panel with permissions table and audit log.
- Notifications: three tiers - toast (info), banner (needs action), alarm (persistent, top-centre, with sound/haptic); all logged in a history drawer.
- Accessibility/input: every action rebindable; full gamepad navigation for menus AND editor via a cursor-less "focus grid" and radial part picker; UI scale 75-200%; colour-blind-safe palettes; reduced-motion; text-to-speech hooks for notifications; hold-to-confirm alternatives.

### 4.3 Wireframes (text)
Yard:
```
[Mode: Build|Wire|Paint|Measure|Test]   [Sym X Y Z] [Snap 0.25] [Undo<>]
+-Parts------+---------------------------------+-Inspector-+
| search     |                                 | Part: Pump |
| cats       |         3D viewport             | Rate  [__] |
| list/grid  |         ghost part, gizmo       | Link: in1  |
+------------+---------------------------------+------------+
 Mass 4.2t | CoM marker | Cost 12.4k | Power +/-  | Warnings(3)
```
Map:
```
[Layers]  full chart, markers, route line  [Waypoints list]
 bottom: coords | scale | measure tool
```

## 5. Implementation notes
- HTML/CSS overlay on top of the WebGL canvas for menus, HUD, inspector, chat; use a single store (signals/zustand-like) shared with the game loop; pointer-events:none on the HUD root with opt-in on widgets.
- Editor viewport: canvas only; part drawer, inspector in DOM. Use virtualised lists for the part palette. Wire overlay: render link lines in 3D (instanced lines) plus DOM labels projected from world positions with a throttled layout pass.
- In-world monitors: render-to-texture (offscreen canvas / WebGL framebuffer) per screen; scripts run in a sandboxed Worker with a draw-command buffer (immediate-mode primitives like rect/line/text/circle) replayed on a 2D canvas, then uploaded as a texture; cap per-frame ms budget and drop frames over a limit (the reference game drops draws above ~100 ms [V]). Share the map/chart renderer across the map screen and screens.
- Touch input on in-world monitors: raycast to the quad, convert UV to screen pixels, forward as events.
- Fonts: bundled bitmap font for in-world screens, system/web font for DOM UI.
- Gamepad: Gamepad API with a focus-navigation layer; rebind store persisted.
- Notifications as an event bus with severity; DOM layer plus audio.

## 6. Open questions
- Exact monitor sizes/resolutions and logic channel limits in the reference game (not verified; wiki blocked).
- How much of the editor should be playable with a controller vs. an adaptive touch/pointer path?
- Should scripting be a real language (Lua/JS) or a node-only visual language for MVP?
- Is a live "Test" pad in the editor feasible performance-wise?
- Accessibility baseline: which standards (WCAG-like contrast targets for game UI)?

## 7. Sources
- https://steamdb.info/patchnotes/5127004 (patch notes incl. editor/microcontroller UI changes)
- https://steamdb.info/patchnotes/3672276/
- https://steamdb.info/patchnotes/4940458
- https://steamdb.info/patchnotes/8355795 (controller support, tooltips, map notes via search summaries)
- https://stormworks.fandom.com/wiki/Wiki/Guides/Lua/Special_Advice_for_Lua
- https://wikiwiki.jp/sbarjp/Lua%E3%82%B9%E3%82%AF%E3%83%AA%E3%83%97%E3%83%88 (Japanese Lua help translation: onDraw, drawText)
- https://www.github.com/filp/stormworks-screen-api (offline screen API tooling)
- https://www.greenmangaming.com/blog/new-stormworks-update-coming-microprocessors-and-trains/
- https://steamcommunity.com/app/573090/discussions/ (player discussions)
- https://en.wikipedia.org/wiki/Stormworks:_Build_and_Rescue
