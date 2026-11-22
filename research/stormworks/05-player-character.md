# 05 - Player Character: movement, physics, survival (Stormworks as genre reference)

Research caveat: the Fandom wiki returned HTTP 402 to our fetcher, SteamDB patch notes returned 403, and web search found nothing Stormworks-specific for moving-platform bugs. Findings below come from search-engine summaries of the wiki, a Steam guide, defkey's key list and SteamDB patch-note snippets. Items marked (UNVERIFIED) are inference or design suggestion, not sourced facts. All text is paraphrased.

## Summary
- The player is a first/third-person walker with walk, sprint, crouch, jump, ladders and surface/underwater swimming, and sits in seats that expose vehicle-defined controls.
- Survival is modular: oxygen via outfits (scuba, diving suit, oxygen mask), hazard outfits (firefighting, hazmat, arctic), and rescue loops (medkit, defibrillator, beds).
- Inventory is small and typed: 4 small equipment slots, 1 large equipment slot, 1 outfit slot (per Steam guide; wiki says small/large slots were added in v1.0.0).
- Vehicles carry the player via seats (locked to vehicle); free-walking on moving vehicles is a known weak spot in the genre.
- Ragdoll exists (creature drags, incapacitation), with multiplayer sync bugs fixed over many patches.

## Detailed findings

### Locomotion and keys (default PC, from a 2019-era list, may have changed)
- WASD move; Shift sprint (hold); Ctrl crouch (hold); Space jump.
- Q or E: use / hold object. F: enter/exit seat or ladder. V: flashlight. Tab: toggle third-person. R: return vehicle to workbench (in editor context).
- Seated: Q/E use, F exit, Tab third-person of vehicle. Driver: Left Alt trim menu, H toggles controls UI; A/D roll or steer, W/S pitch or throttle depending on vehicle type.
- Controls shown on the seat UI are the labels the vehicle builder assigned to the seat in the editor, i.e. seat inputs are per-vehicle data, not global.
- Other: M map, N missions, F12 creative menu, J toggle controller input, multiplayer player list/chat/voice/emote.
- Patch notes show gamepad support exists (fix for inverted swimming direction on controllers; ladder climbing respects an inverted-movement setting).
- Parachute (an outfit item) deploys with the "use seat" key when falling fast enough; it can be re-stored to refold.

### Ladders
- Climbing is entered with the same enter/exit key as seats. Patch notes mention ladder climbing and NPC "ladder breadcrumbs" (NPC pathing across ladders). A climbable lookout tower exists at the start base.

### Swimming and diving
- Surface swimming plus underwater; first-person surface-swimming camera was reworked (v1.1.23-24) and a drowning-while-surface-swimming-in-first-person bug fixed (v1.0.2).
- Outfit figures from the Steam guide: Scuba outfit about 50 m depth / 2 min oxygen, rechargeable; Diving suit about 250 m / 10 min, rechargeable; Oxygen mask is a stopgap. Oxygen is refilled by lockers/equipment storage with oxygen connected (wiki summary).
- Underwater torch works underwater but with less fuel than the surface torch. Space suit also exists.

### Equipment (known items)
- Small/large equipment: flashlight (battery, rechargeable; spawn item), binoculars (spawn item; night-vision variant), radio (8 channels, multiplayer), compass-like/ map via M, light sticks (12 per set), flares, welding torch and underwater torch (fuel), fire extinguisher (large; about 9 L water, not refillable), defibrillator (large; 4 charges; wiki says rechargeable in equipment rack, the guide says not rechargeable - conflict), first aid / medkit (4 doses; heals a survivor in 1-3 doses; carry 3+), remote control unit (control vehicles remotely), rescue harness / control harness, weapons (DLC: pistol 17 rounds, rifle 30, SMG 40, harpoon gun 1 per load).
- Outfits (1 worn): scuba, diving, firefighting SCBA (strongly reduces fire damage), hazmat (reduces radiation), arctic (prevents freezing), parachute, space suit.
- Item IDs seen in patch notes (internal enumeration): fire_extinguisher 10, first_aid 11, oxygen_mask 18 - confirms a numeric item-type enum.

### Health, injury, death
- Characters (player and NPC survivors) lose health from hurt state until incapacitated; a defibrillator revives to minimal health, then a medkit is needed. Medical beds heal much faster but cannot be used to skip time. Fire, radiation, cold and drowning are damage sources mitigated by outfits. Equipment drops on death (bug fixed for death during ragdoll). Beds are also spawn/rest points. Ragdoll cleared on revive (bug fix v1.4.17).

### Cameras
- First-person overhauled in v1.0.0; Tab toggles third person; seated third-person views the vehicle.

### Customisation
- Not found in sources (UNVERIFIED that any exists beyond outfits).

### Temperature
- Arctic outfit prevents freezing in cold zones; no numeric details found.

## Player-facing feel
- Deliberately utilitarian: the player is a small rescue worker, mostly a means to enter seats, carry gear and treat survivors; carrying/dragging details were not found (UNVERIFIED).
- Gear loop: pick the right outfit and a few tools before a mission; limited slots force loadouts.

## Known problems to avoid
- Players falling through or being left behind on moving vehicles (common across genre; Stormworks-specific evidence not found, see Empyrion "players clip through walls in a moving ship" thread).
- Multiplayer ragdoll/incapacitation desync; equipment not dropping on death during ragdoll; inverted controls on gamepad swimming; drowning while surface swimming in first person; ragdoll not clearing on revive.
- Conflicting charge rules (rechargeable vs not) confuse players; keep one rule and show it in UI.

## Implementation notes for our original game
Kinematic character controller on moving platforms:
- Represent the player in the local frame of a "support body" when grounded on a vehicle: store local position p_l; each tick world pos = T_body * p_l, then apply input velocity in local space and sweep against the vehicle's collision in local space. Use the body's velocity at the contact point v = v_cm + w x r when leaving the platform to preserve momentum.
- Support detection: downward capsule/sphere cast each tick, choose the body under feet with hysteresis (keep previous support for ~0.15 s grace to avoid flicker). Inherit yaw: rotate the player yaw by body delta-yaw.
- Anti-tunnelling: do the sweep in the body's local frame with continuous collision; clamp per-tick platform displacement; if the capsule is embedded after a vehicle moves, depenetrate along the minimum translation vector, and as a last resort teleport to the last valid local position. Run character update after the vehicle physics step in the same fixed tick. Keep the vehicle's inbound force from the player small (apply feet force/mass only) to avoid the Roblox/Unreal "player pushes vehicle" issue.
- Seats: attach by kinematic constraint to a seat local transform; input mapping comes from vehicle data (label -> axis/button).
Swim/dive state machine: Ground -> (water depth > ~1.0 m) Wade -> (head below surface) Submerged -> Drowning. Submerged: oxygen O drains at rate r (scuba: 2 min = 120 s, diving: 600 s per Stormworks figures; our suggestion: O = O_max, dO/dt = -1/T_outfit, no outfit baseline ~20-30 s (UNVERIFIED)). Depth limit: pressure damage when depth > outfit.maxDepth, damage = k*(depth-maxDepth)/s. Buoyancy: F = rho_w * g * V_submerged; use neutral-ish with outfit mass modifiers.
Inventory data model:
```
Character { health, oxygen, temp, outfit: ItemId?, large: ItemId?, small: ItemId[4], active: slotRef }
Item { type, charges, capacity, fuel, flags } // type enum like fire_extinguisher, first_aid
```
Rules: refill stations by item tag; hazard matrix damage = base * (1 - outfit.resist[hazard]). Health states: Healthy -> Hurt (bleed tick) -> Incapacitated (ragdoll) -> Dead; defib -> Hurt(minimal).
Controls: map actions not keys; per-seat control labels declared on the vehicle.

## Open questions
- Exact walk/sprint speeds, jump height, capsule size, fall damage threshold, oxygen without outfit.
- How carrying/dragging survivors works; harness mechanics; hypothermia rates; character customisation; true multiplayer authority model for moving-vehicle walkers.
- Defibrillator rechargeability conflict.

## Sources
- https://stormworks.fandom.com/wiki/Equipment (via search summary; direct fetch blocked)
- https://stormworks.fandom.com/wiki/Wiki/Key_Assignment (via search summary)
- https://defkey.com/stormworks-build-and-rescue-shortcuts
- https://steamcommunity.com/sharedfiles/filedetails/?id=2375369089 (Stormworks 101 guide)
- https://steamdb.info/patchnotes/5558270/ and other SteamDB patch notes (via search summary: 8604192, 11219765, 10116368, 15202413)
- https://empyriononline.com/threads/players-clipping-through-walls-in-a-moving-ship.101299 (analogous issue, other game)
