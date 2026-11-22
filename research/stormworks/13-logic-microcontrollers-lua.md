# Stormworks: Logic, Microcontrollers and Lua (genre reference)

Scope: mechanics only, for designing an ORIGINAL browser vehicle sandbox. Facts marked (VERIFIED) came from a source fetched/searched in this session; (RECALLED) are from model memory and need checking; (UNVERIFIED) were reported by community members only. Several primary pages (Fandom wiki, wikiwiki.jp) were blocked (402/403) during research, so numbers below are thinner than ideal.

## Summary
- Logic is a deterministic, tick-based dataflow network (~60 ticks/s, physics-tied). Each logic component adds roughly one tick of delay; players insert extra blocks to deliberately delay signals. (VERIFIED, wiki guide)
- Signal types: bool, number (float), composite (32 bool channels + 32 number channels, stored separately), plus video (RECALLED).
- Microcontrollers (MCs) are user-built sub-circuits in a small grid with a fixed set of input/output pins, which can contain logic nodes and Lua script blocks; Lua inside MCs is the escape hatch for anything complex. (RECALLED for sizes/pin counts.)
- In-vehicle Lua: `onTick` (logic update) and `onDraw` (screen rendering) plus `input.*`, `output.*`, `property.*`, `screen.*`, `map.*`, `async.httpGet`. Script size is capped around 4,000 characters including comments (UNVERIFIED, player reports) - the dominant pain point.
- Addon (mission/server) Lua is a separate, much larger API (`server.*`) with ~40 event callbacks, used for missions, game modes, chat commands and HTTP bridging to external programs on localhost.
- Community tooling centres on external IDE support (type stubs, minifiers, simulators) because of the character cap.

## Detailed findings

### Signal propagation
- Logic ticks run about 60 times/s but can drop on large vehicles or in multiplayer (VERIFIED, wiki Special Advice for Lua). `onTick` is not called while paused; `onDraw` still is.
- One tick delay per logic component; a composite switchbox can be used as a one-tick delay on a composite signal (VERIFIED, same page). Design implication: feedback loops are legal and are made stable by the per-node delay (state machines, memory cells via SR latches/ delays).
- Composite: channels 1-32 for each of bool and number; a composite write block can write a range of channels, whereas a read block reads one channel (VERIFIED, forum reports). Pain point: reading 32 values needs 32 blocks, so players use Lua to unpack composites.

### Microcontrollers
- Sizes range from tiny (1x1) up to a few cells across; larger grid = more room for nodes and more I/O pins (RECALLED; exact counts not verified - treat as an open question). Pins are typed (bool/number/composite/video) and can be marked as exposed "properties" (editable numbers/toggles/text shown in the in-game property UI, read by Lua with `property.getNumber/getBool/getText`) (RECALLED).
- MCs are saved as reusable workshop items and are opaque from outside (nesting inside other MCs is not supported in the base game as far as I recall; RECALLED).

### In-vehicle (microcontroller) Lua API
Verified from a Japanese community wiki translation and wiki guide:
- `onTick()` - logic update, once per tick. Composite I/O (and all `input`/`output`) must be accessed here; composite calls inside `onDraw` do nothing, so values are cached in globals for drawing.
- `onDraw()` - screen rendering; `screen.*` calls only valid here (error from `onTick`). Runs ~60 fps without vsync, ~30 with vsync. If it takes over ~100 ms the engine aborts it and discards the frame. Text is a 4x5 pixel font (VERIFIED, wikiwiki).
- Functions (RECALLED, standard docs): `input.getBool/getNumber(i)`, `output.setBool/setNumber(i,v)`, `property.getNumber/getBool/getText(label)`, `screen.getWidth/getHeight`, `screen.setColor(r,g,b,a)`, `screen.drawLine/drawRect/drawRectF/drawCircle/drawCircleF/drawTriangle/drawTriangleF/drawText/drawTextBox/drawMap`, `screen.setMapColorOcean/Land/...`, `map.mapToScreen/screenToMap`, `async.httpGet(port, path)` with `httpReply(port, request, reply)` callback (localhost only), plus a trimmed Lua standard library (`math`, `string`, `table`; no `io`/`os`). Sandboxed, no filesystem.
- Touch: touchscreen state arrives through composite channels (touch x/y/pressed, screen size), not direct events - Lua reads them in `onTick`.
- Limits: ~4,000 characters per script (counts comments; UNVERIFIED, one post claims 4096 is a Lua-string figure and may not be the cap; I could not confirm the current cap, newer builds may have raised it). A CPU/time budget per script exists (RECALLED; value unknown). Memory limited (RECALLED).
- Debugging: no in-game console in MC Lua; community uses an external simulator (see tools). Component-mod Lua (separate system for custom components) uses `debug.log` visible in DebugView (VERIFIED).

### Related: component-mod Lua (for context)
Per Cuh4's docs (VERIFIED): callbacks `onParse`, `onAddToSimulation`, `onRemoveFromSimulation`, `onTick(tick_time)`, `onRender`; `component.getInputLogicSlotBool/Float/Composite` and matching `setOutput...`; torque bridges (factor 0-1, ratio), fluid flow resolution (13 fluid types), electric charge, heater volumes, sfx, mesh/light/laser render calls, `physicsImpulse/Raycast/GetLinearVelocity`, `spawnProjectile` (15 projectile types, 5 damage types), wind/submergence queries. Shows how a game can expose physics-network slots (torque/fluid/electric) to scripts in a constrained way.

### Addon / mission Lua API (server side)
(VERIFIED from Cuh4 intellisense file)
- Callbacks: `onCreate(is_world_create)`, `onTick(game_ticks)`, `onDestroy`, `onChatMessage`, `onCustomCommand(full_message, peer_id, is_admin, is_auth, command, ...)` (chat messages starting with `?`), player events (`onPlayerJoin/Leave/Die/Respawn/Sit/Unsit`, `onToggleMap`), character/creature/equipment events, vehicle events (`onVehicleSpawn/Despawn/Load/Unload/Teleport/Damaged`, `onGroupSpawn`, `onButtonPress`, `onSpawnAddonComponent`), disaster events (tornado, meteor, tsunami, whirlpool, volcano, oil spill, fires), and `httpReply(port, request, reply)`.
- `server.*` categories: addons/locations/zones (`spawnAddonLocation`, `spawnAddonVehicle`, `isInZone`...), vehicles (`spawnVehicle(matrix, save_name)` -> ids/success, `despawnVehicle`, `getVehiclePos/setVehiclePos(Safe)`, groups, getters/setters for tanks, seats, buttons, batteries, weapons; `pressVehicleButton`, `setVehicleTooltip`, `setVehicleInvulnerable`, `setVehicleShowOnMap`), objects/characters/animals/AI (`spawnObject(matrix, type)`, `spawnCharacter`, `setAIState/Target/Team`), players (`getPlayers`, positions, look direction), UI (`announce`, `notify`, `setPopup`, `setPopupScreen`, `addMapObject/Label/Line`, `removeMap*`), world (disasters, explosions, game settings, astronomy). Also `server.httpGet(port, request)` (RECALLED/partly verified: a translator notes requests over ~4,082 chars crash, i.e. 4096 minus host/port overhead).
- HTTP is restricted to localhost on a chosen port, so the standard pattern is a small external server (Node/Python) bridging Discord, databases, telemetry, web dashboards. Addon scripts persist state via `g_savedata` (RECALLED).
- Version drift: some community packs (e.g. Carsa's Commands) broke on API changes and went end-of-life (VERIFIED, search snippet) - API stability matters to a modding community.

## Community usage and pain points
- Uses (RECALLED, widely known): autopilots (PID heading/altitude hold), fly-by-wire and stabilisation, radar and sonar displays on screens, navigation/GPS computers using the map API, engine management, weapons fire control/targeting, HUD and instrument gauges, dynamically created touch buttons, game modes and mission scripts, multiplayer chat command admin tools.
- Pain points: (1) character cap forces minification and splitting logic across several chained MCs; (2) no good in-game debugger - print-debugging via output channels/screens; (3) onDraw/onTick split and composite-not-in-onDraw rule trips beginners; (4) 100 ms draw abort; (5) per-tick one-delay surprises in logic timing; (6) 32-channel composite plumbing; (7) addon API breaking changes; (8) HTTP request size crash.
- Tools: Cuh4 `StormworksModLuaDocumentation` / `StormworksAddonLuaDocumentation` (intellisense.lua stubs for VS Code) ; `gcrtnst/sw-luadocs`; nameouschangey's `STORMWORKS_VSCodeExtension` (VS Code build processing, with a C# simulator folder - the "LifeBoatAPI" toolchain; feature list not confirmed here); generic Lua minifier extensions (vscode-lua-minify) and web minifiers (lua.flaffipony.rocks, per a Steam post).

## Implementation notes for our original browser game
1. **Logic graph evaluation**: fixed-step (60 Hz) double-buffered evaluation: each node reads the previous tick's outputs, writes new outputs -> uniform 1-tick delay, order-independent, trivially deterministic, loops safe. Store signals in typed arrays (Float32Array/Uint8Array) indexed by wire id; compile the graph to a flat node list; composite = 32 floats + 32 bit-mask. Make delay-free "wire junctions" free and optionally offer a "fast" node class if users complain.
2. **Node editor**: grid-snapped sub-circuit ("chip") editor with pin typing, exposed properties, chip library and sharing. Support nested chips by flattening at compile time. Show live signal values on wires and a probe/scope node (fixes the main debugging pain point).
3. **Sandboxed scripting**: run each user script in a Web Worker (one worker per vehicle or per few chips). Options: JS via QuickJS-wasm (instruction/interrupt handler for budgets, memory limit setting) or Lua via fengari (pure JS, slower, no hard instruction budget, but can use debug hooks) / wasmoon (real Lua, `lua_sethook` count hook for instruction budgets). Enforce per-tick instruction budget (e.g. N thousand VM instructions) with hook-based abort; kill/restart worker on overrun; memory cap. Expose only a narrow API: input/output/property/screen/map/log.
4. **Screen drawing API**: retained-mode-free immediate API called in a separate `onDraw` into an OffscreenCanvas or a command buffer (record draw ops, ship to main thread, replay on Canvas2D/WebGL texture applied to in-world screens). Keep Stormworks-like split: tick reads signals, draw only reads cached state. Use a draw-time budget with frame discard. Do not copy the 4x5 font or exact function names; consider our own naming. Add touch input as structured events rather than composite channels.
5. **Script limits**: avoid the character-cap pain: use a size cap measured post-minification or a large cap (e.g. 32 KB) with multi-file chips; ship an in-browser Monaco editor with type stubs, console/log panel, breakpoints-free step debugger and a paused-simulation mode.
6. **Addon API**: event-bus design with versioned API (semver, deprecation shims), permission-scoped capabilities (spawn, UI, map, network), callbacks similar in spirit (onTick, onPlayerJoin, onCommand, onVehicleSpawn/Damaged). Instead of localhost HTTP, provide a sanctioned WebSocket/fetch bridge through the server with allowlisting and rate limits, and request-size limits.
7. **Server authority**: in multiplayer, run logic server-side or deterministic lockstep; scripts of untrusted users must never run unbounded on the server.

## Open questions
- Exact current Lua character cap and CPU/memory budgets in MC scripts; whether the cap was raised in recent versions.
- MC size list and per-size I/O pin counts; MC nesting rules; video signal specification.
- Exact `async.httpGet` limits for in-vehicle Lua vs. addon `server.httpGet` (in-vehicle HTTP availability is RECALLED).
- LifeBoatAPI feature list (simulator fidelity, build/minify pipeline).
- Precise tick-delay rules for every logic block type (some blocks, e.g. wires/junctions, may be zero-delay).

## Sources
- https://stormworks.fandom.com/wiki/Wiki/Guides/Lua/Special_Advice_for_Lua (tick rate, onDraw, composite notes; surfaced via search)
- https://wikiwiki.jp/sbarjp/Lua%E3%82%B9%E3%82%AF%E3%83%AA%E3%83%97%E3%83%88 (Japanese wiki, MC Lua; via search snippets)
- https://wikiwiki.jp/sbarjp/%E3%82%A2%E3%83%89%E3%82%AA%E3%83%B3Lua/Callbacks , .../Misc , .../Examples (addon Lua; via search snippets)
- https://github.com/Cuh4/StormworksAddonLuaDocumentation (addon API intellisense; raw docs/intellisense.lua fetched)
- https://github.com/Cuh4/StormworksModLuaDocumentation (component mod API; raw file fetched)
- https://github.com/gcrtnst/sw-luadocs
- https://github.com/nameouschangey/STORMWORKS_VSCodeExtension
- https://github.com/informagico/vscode-lua-minify
- https://github.com/carsakiller/Carsas-CommandsV2
- https://steamdb.info/patchnotes/5827478 (spawnVehicle signature history)
- Steam discussions (character limit, composite): https://steamcommunity.com/app/573090/discussions/0/2574320091916447805
