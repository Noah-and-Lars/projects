# Progress against the roadmap (brief §10)

Legend: ✅ done · 🟡 partial · ⬜ not started

## Phase 0 — Spikes ✅
- ✅ Vite + TypeScript skeleton (`tidewright/`), strict TS, vitest
- ✅ Rapier in a Web Worker behind `PhysicsBackend` (`src/physics/`)
- ✅ Snapshot pipeline: transferable Float32Array snapshots, interpolation on the main thread, fixed 60 Hz with a 4-tick catch-up cap and time dilation
- ✅ Greedy mesher (plate faces, AO-aware) and greedy collider merging
- ✅ three.js scene: toon shading, outlines, sky, fog, shadows, quality governor (pixel-ratio scaling)
- ✅ Benchmark of 20 jointed vehicles plus 20 raycast-wheel cars; decision written up in `docs/phase0-physics.md` (Rapier; Jolt still to benchmark)
- 🟡 "60 fps proof on desktop": main-thread CPU is about 1.1 ms/frame median and physics about 0.2 ms/tick. The container has no GPU (software rendering gives about 10 fps), so a GPU frame-rate check on real hardware is still needed.

## Phase 1 — Yard + land ✅ (exit criterion met: build a car, drive it on hills, save and reload it)
- ✅ Block editor: place (ghost preview, face-aware anchoring), erase, paint, eyedrop, inspect/edit part settings, mirror (movable plane), undo/redo, validator with "Show", budget bar (parts, cost, mass, power, fuel, top-speed estimate, CoM)
- ✅ Parts: Plate, Slab, Ramp, Corner, Frame, Pane, Helm seat, Roller wheel S/M/L, Spring roller S/M/L, Burner engine S/M/L, Gear stack, Differential, Fuel tank S/M/L, Cell battery S/M, Lamp
- ✅ Vehicle assembly: mass, CoM, inertia, merged box colliders, auto-tuned suspension (sits at half travel)
- ✅ Raycast wheels: spring-damper with bump stop, Pacejka-lite tyres, friction ellipse, low-speed "parking stick"
- ✅ Drivetrain: engine torque curve plus idle governor → auto clutch → 5-speed gear stack (auto or manual) → open / limited-slip / locked differential → wheels, solved implicitly for stability; brakes, handbrake, fuel burn by revs, battery
- ✅ Built-in Ackermann steering with speed-sensitive lock
- ✅ Heightmap island (deterministic), with the physics heightfield matched exactly to the render mesh (tested)
- ✅ Chase camera (mouse orbit) and first-person seat camera
- ✅ Keyboard, gamepad (standard mapping) and touch controls (steering pad + pedals)
- ✅ IndexedDB fleet (save / open / delete with thumbnails), autosave, `.twv` gzip export/import, versioned format with migrations
- ✅ Tests: 38 vitest tests (sim-core, hydro, headless Rapier land + sea) + a Playwright e2e smoke test (`tools/e2e.mjs`) covering the Yard, drive, save/reload, boat, storm, night and phone touch
- ⬜ Rebindable controls UI (bindings are data-driven in `input/input.ts`, but there is no settings screen yet)
- ⬜ Sub-assemblies, box-select/move, section plane (brief §5 tools beyond the Phase 1 list)

## Phase 2 — Water 🟡 (core done; exit criterion met in tests and the browser: build a boat and ride out a rising sea state)
- ✅ Gerstner ocean (5 waves, sea state 0..1 with wind direction) **shared exactly** by the vertex shader and the CPU (`sim-core/waves.ts`, `render/ocean.ts`); the CPU inverts the horizontal displacement, which is unit-tested against the shader maths
- ✅ Hull analysis: solid displacement per part, **sealed interior air** and **open-top interior air** found by flood fill; up to 160 clustered buoyancy points per vehicle
- ✅ Buoyancy ρ·g·V·(submerged fraction) at each point, anisotropic quadratic + linear hydrodynamic drag, wave-relative vertical velocity
- ✅ Basic flooding: open-top regions swamp when the gunwale goes under and drain slowly otherwise (HUD shows "SWAMPING")
- ✅ Marine parts: Float block, Screw S/M (momentum-theory static thrust, ω² law, pitch-speed fade, engine load), Rudder (flat-plate normal force, prop wash, follows the helm)
- ✅ Yard "Float" meter (reserve buoyancy) and leak-finder overlay showing sealed vs open-top hull air
- ✅ Validator: "it will sink" (with litres needed), low reserve buoyancy, screws without an engine
- ✅ Starter boat "Skiff"; boats auto-launch at the nearest open water off the Yard pad, facing the sea
- ✅ Sea-state controls in the drive HUD (−/+ and a "Storm" button that builds the sea steadily)
- ✅ Day/night cycle (60-minute default; +3 h and pause), dusk and night palettes, lamp halos, one real headlight for the player's vehicle
- ⬜ Floating origin. Deferred: the island spans ±768 m, where float32 precision is still sub-millimetre. It becomes necessary with far islands (Phase 5 world).
- ⬜ Watertight hatches/doors, pumps, ballast tanks (later: Phase 3–5 part list)

## Phases 3–6 ⬜
Air, multiplayer, career, gallery.
