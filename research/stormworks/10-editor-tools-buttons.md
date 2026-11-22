# Stormworks vehicle editor (workbench): tools, buttons, modes (genre reference)

Purpose: mechanics/workflow study only, for an ORIGINAL browser vehicle-building sandbox. Nothing here is to be copied (names, art, UI look). Descriptions are paraphrased.

**Research caveat:** the fandom wiki returned HTTP 402 for direct fetches and SteamDB 403, so much is from search snippets, one long Steam guide, a shortcut list (defkey), and a third-party browser tool. Items marked (unverified) need in-game or wiki confirmation. Version attributions are sparse; only those actually sourced are listed.

## 1. Summary
- The editor ("workbench") is a 3D build space on a 0.25 m voxel-like grid (a block = 0.25 m). Players place blocks and components, shape hulls with wedges/pyramids, wire logic, and spawn the vehicle into the world to test. Return-to-workbench (R) lets you iterate after spawning.
- Screen layout is four panes: top toolbar (tools + file ops), right pane (view/visualiser toggles), bottom hotbar + inventory (keys 1-9, Tab), left pane (context-sensitive: colour swatches, logic type, selection options).
- Strong points: click-drag plane building, symmetry plane, live mass/cost, centre-of-mass visualiser, section plane, editor warnings. Praised by outsiders as a "gold standard" vehicle editor (Keen forum post).
- Microcontroller editor is a separate screen (nodes, boxed multi-select, composite logic) opened from a selected microcontroller part.

## 2. Tool / button / mode inventory
| Name | What it does | Shortcut | Notes |
|---|---|---|---|
| Place (default) | Place selected block/component; click-drag builds a plane/line of blocks; Shift changes build direction | LMB; 1-9 hotbar | Ctrl+LMB copies the pointed component into hand |
| Erase | Toggle between add and remove | X | Cost refunds shown |
| Paint | Colour parts using swatches on left pane; paint-mode options | Ctrl+LMB = eyedropper | Colour swatches are context pane |
| Select | Click a part to read/edit properties (names, min/max, sensitivity) | | Ctrl+LMB creates selection around pointed part; Shift+LMB extends |
| Move | Move selected parts | | |
| Logic | Link logic nodes (red = on/off boolean, green = number); left pane switches logic type | Ctrl held keeps a source selected for fan-out | Composite logic also exists |
| Merge | Joins/merges selected pieces (exact semantics unverified) | | |
| Selection Grid | Box selection with cut / copy / paste / resize options | | Copy keeps logic + properties (patch note via search snippet) |
| Microcontroller editor | Opens MC design screen | | Needs MC part selected |
| Symmetry | Mirror placement across X, Y, Z or Disabled; movable symmetry plane with widget | | Disable for asymmetric parts (rudders) |
| Section Plane | Slices vehicle to reveal interior | | |
| Camera | Reset view; Orbit vs Free mode | RMB-hold pan, wheel zoom, MMB-hold traverse; F recentre pivot | |
| Centre of Mass | Visualises balance point | | Used pre-test for stability |
| Direction arrows | Facing indicators for directional/paint blocks | | |
| Rotation labels | Shows rotation hints on pending block | P | |
| Grid lines / Measurements / World view | Visual aids | | |
| Editor warnings | Flags missing connections/power; optional; can false-positive | | Warning system for likely logic errors and spawn-zone-blocking added v0.10.20 (SteamDB snippet) |
| Spawn | Places vehicle in world; hover shows mass and cost | Enter | |
| Exit workbench | Leaves; refunds in campaign | | |
| New / Load / Save / Workshop | File ops, Steam Workshop publish | | |
| Undo / Redo | | Ctrl+Z / Ctrl+Y | |
| Inventory | Searchable, categorised parts; hotbar for quick slots | Tab | Shows company funds in career |
| Rotate part | About X/Y/Z axes | J / K / L | |
| Mirror/flip part | About X/Y/Z | U / I / O | Also works on pending paste |
| Return vehicle to workbench | From world | R | |
Not found/unknown: favourites (hotbar acts as favourites), gamepad support in editor (unverified), voxel-count stat, layer clipping beyond section plane, X-ray, sign painting details (SWBuild tool mentions pictures on signs, so signs accept images), thumbnails.

## 3. Controls
Defkey list (version unknown; fandom page for 0.8.33 is a stub): X add/erase, Tab inventory, RMB-hold pan, wheel zoom, MMB-hold traverse, Ctrl+LMB context actions (copy component / copy colour / start selection / keep logic source), Shift+LMB extend selection, Ctrl+Z/Y, Enter spawn, U/I/O mirror, J/K/L rotate, P rotation hints, F recentre pivot, 1-9 hotbar. All bindings are remappable per the guides.

## 4. Snapping / connection
- Everything sits on the 0.25 m grid; blocks/components occupy integer cells; parts connect via faces/adjacency (fluid/electric connectors need aligned faces; leaks occur with open faces, hence "spawn to check for leaks" in the guide and a "Find leak" tool in third-party SWBuild).
- Hull shaping uses wedges, pyramids, corners; rotation via J/K/L.
- Workbench has a size boundary and a bow arrow.
- Third-party tool shows parts can be resized in whole cells via drag handles (variable-size parts).
- Logic nodes: link by dragging between a node on one component and one on another; red boolean, green number; composite = multi-channel bundle.

## 5. Microcontroller editor
- Opened via "edit microcontroller" button on a selected MC part; small-grid design screen with logic blocks (composite read/write, etc.) and Lua scripts edited separately.
- Added multi-selection by box-dragging in v0.6.14 "Microcontroller 2.0" (March 2019, SteamDB snippet).
- Switch to composite logic view to see missing composite connections.
- Third-party LogicEditor (itch.io) shows demand for a real-time simulating editor; SWBuild/Screen Bench for external editing.

## 6. UX pain points / requests (thin evidence)
- Wiki key list stale; bindings vary between sources.
- Warnings give false positives.
- Early requests: unselect, copy/paste, merge (since added: copy/paste with logic).
- Cost not reducing in mirror mode on delete (bug fixed v1.4.15).
- Community built external tools for leak finding, bulk painting (bucket, sweep, scatter), colour scheme generation, and view-only wiring tracing: implies in-game gaps in paint bulk tools, leak diagnosis, and wire inspection.
- Beginners confused by mirror keys vs symmetry mode, and by camera/plane build direction.

## 7. Design notes for our browser editor
- Tool set (our own naming): Build, Remove, Paint, Inspect, Wire, Region-select, Move, Symmetry, Section clip, Test.
- Data model: sparse map keyed by integer (x,y,z) -> cell {partId, orientation 0..23, colour, params}; multi-cell parts store an anchor + extents. Connections computed from face metadata, cached per chunk. Wires: array of {fromPart,fromPort,toPart,toPort,type}.
- Undo: command pattern, each command {do, undo}, group drag operations into one transaction; mirror writes N sub-commands under one group; cap stack, serialize diffs.
- Mouse/touch: LMB place, RMB orbit, MMB/two-finger pan, wheel/pinch zoom; touch: tool bar + long-press for eyedropper; drag-to-extrude plane with a face-normal gizmo; show hover ghost.
- Live stats (mass, cost, cell count, centre of mass) update incrementally; warnings panel clickable to focus offending part. Section plane implemented as shader clip.
- Distinct UI: our own icon set and layout (e.g. left toolbar, bottom stats strip), not the four-pane arrangement.
- Add what players lacked: in-editor leak/connection checker, bulk paint, saved sub-assemblies, wire highlighting, favourites, searchable palette.

## 8. Open questions
Exact Merge/Subgrid semantics; editor gamepad support; which update added each tool (Building Editor Update v0.2.36 exists but notes unread); whether X-ray / mass-per-part view exists; thumbnail workflow; Reddit complaints not retrieved.

## 9. Sources
- https://defkey.com/stormworks-build-and-rescue-shortcuts
- https://stormworks.fandom.com/wiki/Wiki/Key_Assignment (via search snippet)
- https://steamcommunity.com/sharedfiles/filedetails/?id=1769221307 (Unofficial Stormworks Tutorial; first 100k chars)
- https://swbuild.danith.com/
- https://steamdb.info/patchnotes/3672276/ and https://steamdb.info/patchnotes/5127004 (snippets)
- https://steamcommunity.com/games/573090/announcements/detail/1683666519611203837 (title only)
- https://stormworks.fandom.com/wiki/V1.4.15 (snippet)
- https://asecondguy.itch.io/logiceditor
- https://support.keenswh.com/spaceengineers/pc/topic/52741/vote/add/1
