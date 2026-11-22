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
- ✅ Tests: 27 vitest tests (sim-core and headless Rapier) + a Playwright e2e smoke test (`tools/e2e.mjs`)
- ⬜ Rebindable controls UI (bindings are data-driven in `input/input.ts`, but there is no settings screen yet)
- ⬜ Sub-assemblies, box-select/move, section plane (brief §5 tools beyond the Phase 1 list)

## Phase 2 — Water ⬜ (next)
Gerstner ocean shared by shader and CPU, buoyancy points, propeller/rudder/drag, basic flooding, floating origin, day/night.

## Phases 3–6 ⬜
Air, multiplayer, career, gallery.
