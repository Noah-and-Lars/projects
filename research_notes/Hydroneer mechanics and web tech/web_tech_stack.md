# Web Tech Stack for a First-Person Physics Mining & Automation Sandbox (Browser, Cloudflare-hosted) — as of 2026-11-22

Method note: versions and publish dates were pulled live from the npm registry (registry.npmjs.org) on 2026-11-22. Bundle sizes were measured by downloading the published files from jsDelivr and compressing with `gzip -9`. Cloudflare serves Brotli, which is typically a bit smaller. GitHub API access was not available in this session, so GitHub release pages were not read directly. Items marked "[background, unverified]" come from prior knowledge and were not confirmed by a source in this session. The report writer should treat them as plausible but uncited.

## Rendering: Three.js (WebGL vs WebGPU), Babylon.js, PlayCanvas, and WebGPU support in 2026

### Takeaway
All three engines are actively maintained, with releases in the last 4 weeks. For a custom voxel and physics game, Three.js r187 is the leanest and most flexible base. Its WebGPURenderer, which falls back to WebGL2, is usable for new projects, but sources disagree on whether it is "production-ready". Babylon.js 9.x is the batteries-included choice: Havok integration, clustered lighting for hundreds or thousands of lights, and floating origin. WebGPU now ships in all major browsers. Firefox on Android and older devices are the main gaps, so a WebGL2 fallback is still mandatory.

### Cited Findings
**Versions (live npm, 2026-11-22)**
- `three` latest is **0.187.0** (r187), published 2026-10-30. npm unpacked size is 21.0 MB, which is source, not shipped size. — [npm registry: three](https://registry.npmjs.org/three)
- `@babylonjs/core` latest is **9.37.1**, published 2026-11-18. npm unpacked size is 74 MB. — [npm registry: @babylonjs/core](https://registry.npmjs.org/@babylonjs/core)
- `playcanvas` latest is **2.24.2**, published 2026-11-18. npm unpacked size is 66 MB. — [npm registry: playcanvas](https://registry.npmjs.org/playcanvas)
- `@react-three/fiber` latest is **9.8.2** (2026-10-14). — [npm registry](https://registry.npmjs.org/@react-three/fiber)
- `three-mesh-bvh` latest is **0.9.18** (2026-11-03). It is useful for fast raycasts against large terrain meshes. — [npm registry](https://registry.npmjs.org/three-mesh-bvh)

**Three.js shipped size (measured, r187 full prebuilt builds, before tree-shaking)**
- `three.core.min.js` is about **105 KB gzip**. `three.module.min.js` (the WebGLRenderer entry, which imports core) is 392 KB raw and about **89 KB gzip**. The full WebGL build is therefore about **195 KB gzip**. — [jsDelivr three@0.187.0/build/three.module.min.js](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.min.js), [three.core.min.js](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.core.min.js)
- `three.webgpu.min.js` is 492 KB raw and about **123 KB gzip** on top of core. The full WebGPU+TSL build is therefore about **228 KB gzip**. — [jsDelivr three@0.187.0/build/three.webgpu.min.js](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.webgpu.min.js)

**Three.js WebGPURenderer status**
- The renderer falls back to WebGL 2.0 when WebGPU is unavailable. — [buildmvpfast migration post](https://www.buildmvpfast.com/blog/threejs-webgl-to-webgpu-renderer-migration-2026), [threejs.org manual: WebGPURenderer](https://threejs.org/manual/en/webgpurenderer)
- Optimistic view: a January 2026 guide says "WebGPU is production-ready. All major browsers support it." Another newsletter says that with Safari support, Three.js with TSL and WebGPURenderer can be used in production unless you need older devices. — [Utsubo migration guide (2026)](https://www.utsubo.com/blog/webgpu-threejs-migration-guide); [Sensei Notes #01](https://buttondown.com/wawasensei/archive/sensei-notes-01-webgpu-is-ready-for-production)
- Cautious view: Codrops says the renderer is "not fully production-ready yet" but "shows great promise". ICS calls it a work in progress that still needs validation. — [Codrops BatchedMesh + WebGPURenderer](https://tympanus.net/codrops/?p=81678); [ICS getting started](https://ics.media/en/entry/250501/)
- The API is still churning. In r183, `PostProcessing` was renamed to `RenderPipeline`. — [buildmvpfast](https://www.buildmvpfast.com/blog/threejs-webgl-to-webgpu-renderer-migration-2026)
- Performance caveat: a community report found WebGPURenderer slower than WebGLRenderer on CPU time and first frame for many-mesh scenes in r183. This is anecdotal, not an official benchmark. — [discourse.threejs.org webgpu-renderer tag](https://discourse.threejs.org/tag/webgpu-renderer/1686)

**Babylon.js 9**
- Babylon.js 9.0 was announced on 2026-03-26. Its headline feature is a **clustered lighting system** that renders "hundreds or thousands of dynamic lights at smooth frame rates on both WebGPU and WebGL 2". It also adds a Frame Graph, volumetric lighting, particle flow maps and attractors, Nav Mesh updates, Large World Rendering with a floating origin, Inspector v2, and a Playground with ESM imports. — [Windows Developer Blog: Announcing Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0); [Part 2](https://blogs.windows.com/windowsdeveloper/2026/03/30/part-2-babylon-js-9-0-tooling-updates-and-new-geospatial-features/); [Part 3](https://blogs.windows.com/windowsdeveloper/2026/04/02/part-3-babylon-js-9-0-openpbr-and-additional-engine-updates/)
- `@babylonjs/havok` latest is **1.3.14** (2026-07-29). `HavokPhysics.wasm` is 2.09 MB raw and about **658 KB gzip**. — [npm registry](https://registry.npmjs.org/@babylonjs/havok); [jsDelivr HavokPhysics.wasm](https://cdn.jsdelivr.net/npm/@babylonjs/havok@1.3.14/lib/esm/HavokPhysics.wasm)

**PlayCanvas**
- PlayCanvas's built-in physics is still **ammo.js**. Its components go through an **alpha** `PhysicsWorld` backend layer that PlayCanvas calls "the intended seam" for plugging in Rapier or Jolt. Neither has an official integration yet. — [PlayCanvas: Alternatives to ammo.js](https://developer.playcanvas.com/user-manual/physics/ammo-alternatives/)

**WebGPU browser support**
- Chrome/Edge desktop have supported WebGPU since 113. Chrome on Android has supported it since 121, on Android 12+ devices with Qualcomm or ARM GPUs. Firefox has it on Windows since 141 and on macOS ARM64 since 145. **Firefox Android is not supported.** Safari 26 ships it on macOS, iOS, iPadOS and visionOS. — [web.dev: WebGPU is now supported in major browsers (Nov 2025)](https://web.dev/blog/webgpu-supported-major-browsers); [TechSpot](https://www.techspot.com/news/110456--now-brings-desktop-quality-graphics-all-major.html)

### Inferences
- For a Hydroneer-like game, which is low-poly, stylized and has many small objects, the renderer matters less than physics and terrain throughput. Three.js gives the smallest core (about 195–230 KB gz) and the most control over custom voxel meshes, instancing and worker pipelines.
- Recommended Three.js path: build on `WebGPURenderer` with TSL so the WebGL2 fallback comes for free. Pin the exact three version, because the API is still changing (for example the r183 rename). If profiling shows CPU-side regressions, keep `WebGLRenderer` as an option. TSL compute is attractive for GPU-side particles such as dirt spray and water.
- Babylon.js is the strongest "engine" choice if the team wants built-in Havok, clustered lights for lanterns in caves, an inspector, navmesh and floating origin with less custom code. The cost is a larger bundle; tree-shaken Babylon is typically 1 MB+ minified [background, unverified].
- PlayCanvas is excellent for its editor workflow. However, its physics is ammo.js and the swap-in layer is alpha, which makes it the weakest fit for a physics-heavy game.
- WebGPU covers roughly all modern desktop browsers plus iOS 26 and most recent Android Chrome. WebGL2 fallback is still required for Firefox Android and older iOS and Android devices.

### Gaps
- The official three.js r187 release notes and the threejs.org WebGPURenderer manual page were not readable in this session; the manual URL returned 404 via fetch. The exact list of WebGLRenderer features missing from WebGPURenderer is unverified.
- No reliable 2026 global WebGPU usage percentage was found; caniuse was not fetched.
- Tree-shaken Babylon.js and PlayCanvas bundle sizes were not measured.

## Physics: Rapier vs Jolt vs Cannon-es vs Ammo.js/Havok (many bodies, sleeping, CCD, determinism, character and vehicle controllers, workers)

### Takeaway
The two serious choices are **Rapier (JS 0.21.0, Sep 2026)** and **Jolt (`jolt-physics` 1.1.2, Nov 2026)**. Both are maintained by the engine authors. Rapier offers an ergonomic JS API, a built-in kinematic character controller, a raycast vehicle controller, experimental **voxel colliders** with `setVoxel` (directly relevant to digging), and cross-platform determinism. Jolt offers the more full-featured game physics: WheeledVehicle and tracked vehicles, CharacterVirtual, an official multithreaded WASM build, and a smaller WASM. The price is manual memory management. Cannon-es and ammo.js are stale. Havok is strong but practically tied to Babylon.

### Cited Findings
**Versions and sizes (live npm / measured)**
- `@dimforge/rapier3d-compat` **0.21.0**, published 2026-09-25. It inlines WASM as base64, so `rapier.mjs` is 4.34 MB raw and about **1.65 MB gzip**. `@dimforge/rapier3d-simd-compat` 0.21.0 was also published. — [npm registry](https://registry.npmjs.org/@dimforge/rapier3d-compat); [jsDelivr rapier.mjs](https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/dist/rapier.mjs); [npm simd-compat](https://registry.npmjs.org/@dimforge/rapier3d-simd-compat)
- Non-compat `@dimforge/rapier3d` 0.21.0 ships a separate `rapier_wasm3d_bg.wasm` of 3.08 MB raw and about **1.17 MB gzip**. — [jsDelivr wasm](https://cdn.jsdelivr.net/npm/@dimforge/rapier3d@0.21.0/rapier_wasm3d_bg.wasm)
- The rapier3d-compat package.json now points its repository at `github.com/dimforge/rapier`, the monorepo. — [jsDelivr package.json](https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/package.json)
- `jolt-physics` **1.1.2**, published 2026-11-21. Exports include `wasm`, `wasm-compat`, `asm`, `wasm-multithread`, `wasm-compat-multithread` and debug variants. `jolt-physics.wasm.wasm` is 2.03 MB raw and about **747 KB gzip**; the compat JS is about **912 KB gzip**. — [npm registry](https://registry.npmjs.org/jolt-physics); [jsDelivr package.json](https://cdn.jsdelivr.net/npm/jolt-physics@1.1.2/package.json); [jsDelivr wasm](https://cdn.jsdelivr.net/npm/jolt-physics@1.1.2/dist/jolt-physics.wasm.wasm)
- `cannon-es` latest is **0.20.0**, from **2022-08-12**. It has had no release in more than 4 years and is **outdated**. — [npm registry](https://registry.npmjs.org/cannon-es)
- The `ammo.js` npm package is **0.0.10**, from **2016**, and is **outdated**. PlayCanvas notes that ammo.js has "quite high performance and memory requirements". — [npm registry](https://registry.npmjs.org/ammo.js); [PlayCanvas](https://developer.playcanvas.com/user-manual/physics/ammo-alternatives/)
- `@react-three/rapier` latest is **2.2.0**, from 2025-11-03. That is about a year old, so it may lag Rapier 0.21. — [npm registry](https://registry.npmjs.org/@react-three/rapier)

**Rapier engine changes in 2025–2026 (Rust changelog; JS bindings wrap these)**
- **v0.36.0 (2026-09-24):** the JS/TS bindings moved into the `bindings/` directory of the main repo. It also added soft bodies (ropes, cloth, volumes), CCD fixes, and a fix so that `dt==0` no longer produces NaNs. Snapshots from older versions can't be loaded. — [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)
- **v0.35.0 (2026-08-08):** the **character controller** snap-to-ground now triggers on any non-upward movement, which fixes `grounded` flicker. The **vehicle controller** now rotates wheels in the actual rolling direction and bounds braking friction by `friction_slip`. The broad phase skips collider pairs that share a parent, which made one stress scene about 90x faster when stationary. Determinism uses canonical signed zeros. — [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)
- **v0.35.0-beta.0 (2026-08-02):** SIMD is always on, with a new `simd8` (AVX2) option. A thread-pool API was added and the solver became multithreaded within an island. `enhanced-determinism` works with `parallel`. **CCD was rewritten** around sweep-based time of impact, and fast dynamic bodies always CCD against fixed colliders. — [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)
- **v0.30.0 (2025-10):** parry 0.25 brought "improved voxel storage for large maps". v0.30.1 stopped kinematic bodies with non-zero velocity from falling asleep. **v0.29.0 (2025-09):** a solver rework made simulations up to 25% faster. **v0.32.0 (2026-01):** math moved from nalgebra to glam. — [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)
- **Voxel colliders in rapier.js:** `ColliderDesc.voxels` and `Collider.setVoxel` (add or remove a voxel) arrived in JS 0.16.0 and are still called "experimental". Later releases added shape-casting, CCD and dynamic-body support. JS 0.17.3 added `Collider.combineVoxelStates`, which fixes internal-edge seams between adjacent voxel colliders, and `propagateVoxelChange`. Parry implements voxels specifically to avoid the "internal edges problem". — [rapier.js changelog via search summary / rapier.rs colliders docs](https://rapier.rs/docs/user_guides/javascript/colliders); [parry3d voxels source](https://docs.rs/crate/parry3d/0.28.0/source/src/shape/voxels/voxels.rs)

**Comparisons and benchmarks**
- No direct browser/WASM benchmark comparing Jolt, Rapier and Havok was found. In native Godot benchmarks for Rapier v0.35, Rapier3D ranked first on a "query storm" test, with Jolt 4.46x behind. That is native, not WASM. — [godot.rapier.rs blog v0.35](https://godot.rapier.rs/blog/v0-35-0)
- Havok anecdotes: about 3000 entities at 60 fps single-threaded in a modified Babylon sample, plus a forum thread on processing 19,200 rigid bodies with WASM threading. One commenter says Rapier lacks Havok-style broad-phase multithreading. — [Babylon forum: Havok benchmark](https://forum.babylonjs.com/t/havok-physics-benchmark-multithreading-question/49009); [Babylon forum: 19,200 rigidbodies](https://forum.babylonjs.com/t/processing-19-200-rigidbodies-with-wasm-threading/51187)
- Determinism: Rapier is deterministic. Jolt requires `CROSS_PLATFORM_DETERMINISTIC` at compile time, which the **prebuilt JoltPhysics.js packages do not set**. Only the Rapier and Jolt bindings are maintained by their engine authors. — [PlayCanvas: Alternatives to ammo.js](https://developer.playcanvas.com/user-manual/physics/ammo-alternatives/)
- Jolt memory management: `new Jolt.X` objects must be freed with `Jolt.destroy()`. RefTarget objects (shapes, constraints) start at refcount 0 and use `AddRef`/`Release`. Bodies are freed with `BodyInterface.DestroyBody`. Build options include `DOUBLE_PRECISION`, `ENABLE_SIMD` (on by default in multithread builds) and `CROSS_PLATFORM_DETERMINISTIC`. Reference-counted types include `VehicleCollisionTester`, `VehicleControllerSettings`, `WheelSettings` and `CharacterBase`. — [JoltPhysics.js README](https://github.com/jrouwe/JoltPhysics.js)
- An official three.js addon `RapierPhysics` exists. — [threejs.org docs: RapierPhysics](https://threejs.org/docs/pages/RapierPhysics.html)
- A pmndrs `react-three-jolt` wrapper exists. — [pmndrs/react-three-jolt](https://www.Github.com/pmndrs/react-three-jolt)

**Multithreading and SharedArrayBuffer**
- SharedArrayBuffer, which Jolt's multithread build and any shared-memory worker design need, requires cross-origin isolation: `Cross-Origin-Opener-Policy: same-origin` plus `Cross-Origin-Embedder-Policy: require-corp`. `credentialless` is a softer COEP. — [MDN COEP](https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy); [web.dev COOP/COEP](https://web.dev/articles/coop-coep)

### Inferences
- **Recommendation: Rapier (`@dimforge/rapier3d-simd-compat` or the non-compat package with a separate .wasm) running in a dedicated Web Worker.** Reasons:
  1. It has a built-in `KinematicCharacterController` for the first-person player, with 2026 fixes to snap-to-ground [controller existence is background knowledge; fixes are cited].
  2. It has `DynamicRayCastVehicleController` for trucks [class name is background knowledge, unverified; the vehicle controller fixes are cited].
  3. **Voxel colliders with `setVoxel`** can make dig edits O(1) on the physics side, avoiding trimesh rebuilds. This is experimental, so prototype early.
  4. It is deterministic, which supports replay and save consistency.
  5. Its sleeping and islands handle hundreds to low thousands of mostly-resting ore chunks well [background, unverified for JS].
- The rapier.js JS version (0.21) does **not** match the Rust crate version (0.36). Rust v0.21 is from 2024. The JS 0.21.0 publish date (2026-09-25), one day after Rust v0.36.0 and its "bindings moved" note, suggests JS 0.21 wraps Rust 0.36. This is inferred, not confirmed. Whether the Rust `parallel` thread pool is exposed in the JS WASM build is unknown; assume single-threaded in the browser.
- **Choose Jolt instead** if trucks, excavators or tracked vehicles are central and need realistic engine, gearbox and differential simulation, or if multithreaded physics is needed. Jolt's `WheeledVehicleController`, `TrackedVehicleController` and `CharacterVirtual` are the most complete in this space [background, unverified]. Accept manual `destroy()` discipline and COOP/COEP headers for the multithread build.
- **Choose Havok** only if the renderer is Babylon.js. The plugin is first-class there; using it with three.js means writing your own glue.
- Avoid cannon-es (stale since 2022, JS-only and slower) and ammo.js (stale, heavy) for new projects.
- Worker pattern: run physics at a fixed 60 Hz step in a worker. Post transforms back each step in a transferable `Float32Array` (position + quaternion per body), or use SharedArrayBuffer when cross-origin isolated. Interpolate on the main thread. Keep the authoritative world state, including voxel edits, in the worker so dig edits update the collider and mesher without round trips.
- CCD: enable it only on fast or small bodies, such as thrown ore nuggets or truck chassis. Rapier's 2026 rewrite always CCDs fast dynamics against fixed colliders, which helps small chunks not tunnel through thin terrain.

### Gaps
- No apples-to-apples WASM benchmark of Rapier vs Jolt vs Havok for 1k–5k mostly-sleeping small bodies was found. The team should build a 1-day benchmark scene.
- The exact rapier.js 0.21.0 JS changelog was not read; it lives in the monorepo `bindings/` directory and GitHub access was unavailable.
- Jolt vehicle and character API details were not confirmed from the README fetch, which covered build and memory topics only.

## Diggable terrain: voxels + meshing (MC / surface nets / DC), SDF edits, chunking, colliders, workers, compact saves

### Takeaway
Use chunked voxel density (SDF) fields, for example 32³ chunks of uint8 or int8 density plus material IDs. Edit them with spherical SDF brushes, remesh only the dirty chunk and its neighbours with **naive surface nets** (or marching cubes) in a worker pool, and update physics. Rapier's experimental voxel collider is one physics option; a per-chunk trimesh is the other. No turnkey 2026 library does all of this for three.js. Existing open-source demos cover the pieces.

### Cited Findings
- The `isosurface` npm package offers surface nets, marching cubes and marching tetrahedra in JS. It dates from 2014, so it is a reference implementation only. — [npm isosurface](https://www.npmjs.org/package/isosurface); [guybrush/isosurface](https://github.com/guybrush/isosurface); [npm registry date](https://registry.npmjs.org/isosurface)
- A three.js forum post reports that switching from dual marching cubes to **naive surface nets** "dramatically improved the performance". — [discourse.threejs.org: ultra-optimized voxel terrain](https://discourse.threejs.org/t/how-to-make-a-ultra-optimized-voxel-terrain-like-this-in-a-html-file/83315.md)
- A WebGL marching cubes project runs each mesh rebuild in its own Web Worker so the UI thread isn't interrupted. — [NCSU CG4Games: WebGL Marching Cubes](https://cg4games.csc.ncsu.edu/2014/05/webgl-marching-cubes.html)
- `Xyzrr/voxels` is a three.js voxel engine with modifiable terrain (add and remove) and Web Workers for generation. — [github.com/Xyzrr/voxels](https://github.com/Xyzrr/voxels)
- `ivanwang123/marching-cubes-v2` is a three.js/TypeScript marching-cubes terrain generator and editor with add and remove. — [github.com/ivanwang123/marching-cubes-v2](https://github.com/ivanwang123/marching-cubes-v2)
- One project terminates workers that are meshing chunks no longer needed. That pattern matters when rapid digging invalidates queued jobs. — [lele394/threejs_shenannigans](https://www.github.com/lele394/threejs_shenannigans)
- `vanruesc/rabbit-hole` is a JS volumetric (dual contouring / hermite data) terrain-editing library. — [github.com/vanruesc/rabbit-hole](https://www.github.com/vanruesc/rabbit-hole)
- three.js's built-in `MarchingCubes` addon is a metaball renderer, not a terrain system. — [threejs.org MarchingCubes](https://threejs.org/docs/pages/MarchingCubes.html)
- Rapier voxel colliders support `setVoxel` edits, with seam handling between adjacent voxel colliders (`combineVoxelStates`, `propagateVoxelChange`). Heightfield colliders cannot represent caves or overhangs. Parry 0.25 (Rapier 0.30) improved voxel storage for large maps. — [rapier.rs colliders](https://rapier.rs/docs/user_guides/javascript/colliders); [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)
- `fflate` **0.8.3** (2026-05-16) and `idb-keyval` **6.3.0** (2026-07-08) are current, small libraries for compressing and storing chunk deltas. — [npm fflate](https://registry.npmjs.org/fflate); [npm idb-keyval](https://registry.npmjs.org/idb-keyval)

### Inferences
- **Meshing algorithm:** naive surface nets produce smooth, organic dig holes in the Hydroneer/Deep Rock style. They emit about half the triangles of marching cubes, give shared vertices that make smooth normals easy, and are simple to code. Dual contouring keeps sharp edges but is more complex and needs Hermite data. For a low-poly stylized look, flat-shade the surface-nets output.
- **Chunk layout:** 32³ voxels per chunk at 0.25–0.5 m voxels. Store `Int8Array` density plus `Uint8Array` material. Each chunk mesh needs a 1-voxel apron from neighbours, so an edit near a border must remesh up to 7 neighbours.
- **Pipeline:**
  1. The player digs; the main thread sends a brush (centre, radius, strength) to the world worker.
  2. The worker updates density and removes mass. It yields the dug material, for example spawning N "dirt" items into inventory or a bucket.
  3. The worker remeshes dirty chunks (surface nets typically take a few ms per 32³ chunk in JS [background, unverified]).
  4. The worker transfers positions, normals and indices back as transferable ArrayBuffers.
  5. The physics collider is updated.
- **Collider choice:**
  - (a) A per-chunk Rapier `trimesh` rebuilt on edit. It is simplest, but building a BVH costs time and dynamic bodies resting on the old trimesh must be woken.
  - (b) Rapier `voxels` collider at a coarser physics resolution, edited with `setVoxel`. Edits are near-free, but it is blocky, mismatches the smooth render mesh, and is experimental.
  - (c) Heightfield, which cannot do tunnels or caves, so it is unsuitable if caves exist.
  - Recommended: (a) with remeshing throttled to at most N chunks per frame, falling back to (b) if trimesh rebuild cost becomes the bottleneck.
- **Saves:** don't save whole worlds. Generate procedurally from a seed and store **only modified chunks** as compressed deltas. Either store a full chunk's density run-length encoded then deflated with fflate (a 32 KB chunk often compresses to well under 2 KB), or store an XOR against the generated chunk. Key IndexedDB entries by `"x,y,z"`. Machines and items go in a separate JSON or binary entity table.

### Gaps
- No maintained 2025–2026 npm library was found that does chunked, editable surface nets with worker meshing and three.js integration out of the box. The team should expect to write about 500–1500 lines of custom code.
- No measured JS surface-nets timings per chunk were found in this session.
- Rapier `setVoxel` performance and stability with many dynamic bodies resting on edited voxels is undocumented beyond "experimental".

## Loose granular materials (dirt piles): practical approximations

### Takeaway
No browser demo simulates true granular dirt at game scale. The practical, proven approach is a hybrid: dug material becomes discrete **items or "bags"**, or a small number of pooled rigid "clump" bodies. Clumps that come to rest settle back into terrain as voxels or a pile, so a pile is just added terrain density, optionally relaxed to an angle of repose.

### Cited Findings
- A Codrops tutorial shows a three.js + Rapier pixel-to-voxel "drop" effect: many small voxel cubes as Rapier rigid bodies rendered via instancing. It is a reference for small-body counts and instancing patterns. — [Codrops: Pixel-to-Voxel Video Drop Effect with Three.js and Rapier](https://tympanus.net/codrops/?p=106970)
- Babylon 9 added particle-system flow maps and gravity attractors, which are suitable for visual-only dirt spray. — [Windows Developer Blog: Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0)

### Inferences
- **Recommended hybrid** (mirrors how Hydroneer-like games feel, without simulating sand):
  1. Digging removes density and produces a "paydirt" amount.
  2. That amount goes into a bucket or shovel as a scalar, or spawns 1–5 pooled rigid "dirt clump" bodies, which are small convex hulls or spheres with high friction and damping.
  3. Clumps that sleep for about 1–2 s, or land in a valid spot, are **removed and stamped into terrain** as an SDF sphere (a pile), or deposited into a machine's hopper scalar.
  4. Optionally run a cellular-automaton "slump" pass on the voxel grid, where material moves down if the neighbour height difference exceeds a threshold. This gives an angle of repose for piles, runs in the world worker, and only remeshes affected chunks.
- Machines such as conveyors, sluices and hoppers should transport **abstract quantities** (kg of paydirt, ore nuggets as items) rather than physical particles. Spawn physical bodies only where the player can see or interact, for example the conveyor output. This keeps dynamic body counts in the hundreds.
- GPU particles (three.js TSL compute or Babylon particles) handle visual dust and spray at no physics cost.

### Gaps
- No published browser game or demo was found that does full granular dirt with terrain conversion. These patterns are design inference, not sourced.

## Water: cheap stylized water and flow approximations (sluices, water wheels)

### Takeaway
No specific 2026 sources were found in this session. The standard approach is shader-only stylized water: a flat or scrolling plane with depth-fade foam, plus scripted "flow" volumes. Real fluid simulation is not needed for sluices and wheels.

### Cited Findings
- Babylon 9 particle flow maps could drive visual water spray and flow. — [Windows Developer Blog: Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0)

### Inferences
- **Rendering:** a stylized water material with vertex-wave displacement, depth-based colour and foam (using the scene depth texture), scrolling normal maps along a flow direction, and Fresnel. Both three.js (TSL or ShaderMaterial) and Babylon (NodeMaterial) handle this in a few hundred lines [background].
- **Flow logic:** model water as a graph or pipe network. A source (pump or river) has a flow rate, and channel or sluice segments carry a flow value along a direction. A water wheel's torque or RPM is proportional to the incoming flow. A sluice's processing rate is proportional to flow times paydirt input. Flow can be animated with UV scrolling whose speed is proportional to flow.
- **Physics interaction:** apply buoyancy and drag forces to bodies inside water trigger volumes (Rapier sensor colliders), with force proportional to submerged fraction estimated from AABB depth. This is cheap and sufficient for floating ore pans or nuggets washing down a sluice.
- For pooling or flooding, use a simple 2D heightmap shallow-water or cellular automaton on a coarse grid, run in a worker, only if gameplay needs it.

### Gaps
- No sourced 2026 examples of browser stylized water or flow systems were gathered; the tool-call budget was spent elsewhere.

## Lighting: stylized low-poly, shadows/CSM, day/night, many point lights in caves, voxel AO

### Takeaway
Use one directional sun or moon with cascaded shadow maps and a hemisphere or ambient term driven by a time-of-day gradient. Bake per-vertex AO into voxel meshes during meshing. For many lanterns, either use Babylon 9's clustered lighting, which handles hundreds to thousands of lights on WebGPU and WebGL2, or in three.js cap shadow-casting point lights at about 1–4 and keep the rest unshadowed or faked.

### Cited Findings
- Babylon.js 9.0's clustered lighting renders "hundreds or thousands of dynamic lights at smooth frame rates on both WebGPU and WebGL 2". It also adds a volumetric lighting system and a Physically Based Atmosphere addon, which suits day/night skies. — [Windows Developer Blog: Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0); [Part 2](https://blogs.windows.com/windowsdeveloper/2026/03/30/part-2-babylon-js-9-0-tooling-updates-and-new-geospatial-features/)

### Inferences
- three.js has a `CSM` addon for cascaded shadows on WebGLRenderer, and WebGPURenderer has its own CSM and tiled-lighting examples [background, unverified for r187]. Without tiled or clustered lighting, three.js forward-shades every light per fragment, so keep active lights at roughly 8–16 or fewer. Toggle lanterns by distance, reusing a pooled set of N real `PointLight`s assigned to the nearest lanterns, and render distant lanterns as emissive sprites or bloom.
- **Point-light shadows are expensive:** each one renders six cube faces. Allow at most 1–2, for example the player's headlamp as a `SpotLight` shadow (one frustum) and the nearest lantern.
- **Voxel AO:** compute per-vertex AO at mesh time by sampling the density field (the 0fps "ambient occlusion for Minecraft-like worlds" approach for blocky voxels, or density-sampled occlusion for surface nets). Store it as a vertex colour attribute. It is free at runtime and gives caves strong depth. Add a cheap "depth darkness" term (light falloff by distance below the surface) so caves get dark at night or underground without shadow cost.
- **Day/night:** animate sun direction, colour and intensity, hemisphere colours, fog colour and sky shader uniforms from a single time-of-day curve. Update CSM light direction every frame and keep shadow distance short (about 50–80 m) with 2–3 cascades.
- **Stylized look:** flat shading, vertex colours or palette textures, fog, light bloom and tonemapping (ACES or AgX). This is cheaper than PBR texture sets and suits a low-poly mining game.

### Gaps
- three.js r187 support for clustered or tiled lighting in WebGPURenderer was not verified in this session.
- No benchmark of three.js vs Babylon light counts was found.

## Controls: Pointer Lock, first-person controller patterns, Gamepad API, mobile

### Takeaway
Use the Pointer Lock API for mouse-look, a physics kinematic character controller in the worker (Rapier `KinematicCharacterController` or Jolt `CharacterVirtual`), the Gamepad API polled each frame, and touch joysticks as a secondary mobile path.

### Cited Findings
- Rapier 0.35 (Aug 2026) fixed character-controller snap-to-ground so `grounded` no longer flickers on lateral motion. — [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)
- Kinematic bodies with non-zero velocity no longer fall asleep (Rapier 0.30.1, Oct 2025). This is relevant for moving platforms and elevators. — [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)

### Inferences
- **Pointer Lock:** call `canvas.requestPointerLock({ unadjustedMovement: true })` on click to get raw mouse input where supported (Chromium). Read `movementX` and `movementY`, and handle `pointerlockchange`. Pressing Esc exits the lock, so show a pause menu on exit [background, unverified].
- **First-person pattern:**
  - Separate camera yaw and pitch from the body.
  - Use a capsule kinematic body moved via `computeColliderMovement` with an autostep and slope limit.
  - Interact via raycast from the camera for picking up ore, using machines and digging.
  - Hold items with a joint or spring to a kinematic "hand" target, Hydroneer-style, rather than parenting. This keeps carried objects physical.
- **Vehicles:** on enter, switch input mapping to the vehicle controller and move the camera to the cab. Disable the player capsule collider or set it to a sensor.
- **Gamepad:** poll `navigator.getGamepads()` each frame, using the "standard" mapping, with dead-zones of about 0.15. **Mobile:** use virtual joysticks plus touch-drag look, lower render scale and shadow quality, and fewer physics bodies. iOS Safari has no Pointer Lock, so mobile is a secondary target.

### Gaps
- Pointer Lock, Gamepad API and mobile support details were not re-verified against MDN or caniuse in this session.

## Saving: IndexedDB/localStorage limits, Cloudflare cloud saves (D1/KV/R2/Durable Objects)

### Takeaway
Store saves locally in **IndexedDB**: quotas are huge (about 60% of disk in Chrome and Safari, 10 GiB best-effort in Firefox). Call `navigator.storage.persist()`, and beware Safari's 7-day inactivity eviction. Use localStorage (about 5 MiB) only for settings. For optional cloud saves on Cloudflare, put compressed save blobs in **R2** with metadata in **D1** (or KV), behind a Worker with auth. Durable Objects are only needed for live multiplayer.

### Cited Findings
- Chrome/Edge allow up to **60% of total disk** per origin, in both best-effort and persistent modes. Firefox best-effort allows the **smaller of 10% of disk or 10 GiB** (a group limit), and persistent allows up to 50% of disk. Safari (macOS 14+ / iOS 17+) browser apps get about **60% of disk**, and embedded WebViews about 15%. — [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- localStorage and sessionStorage allow about **5 MiB each per origin**; exceeding it throws `QuotaExceededError`. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- `navigator.storage.persist()` behaves differently by browser: Firefox prompts the user, while Chrome and Safari auto-decide based on engagement. Eviction is all-or-nothing per origin, with LRU under storage pressure. **Safari deletes script-created data after 7 days of browser use with no user interaction** on the site when tracking prevention is on. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- Cloudflare Workers Free tier allows **100,000 requests per day** and 50 subrequests per invocation. — [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits)
- D1 Free allows 10 databases, 500 MB max per database and 5 GB per account. **Starting 2026-09-01, D1 queries on Workers Free fail once the daily row read or write limits are exceeded.** — [D1 limits](https://developers.cloudflare.com/d1/platform/limits); [Cloudflare changelog 2026-09-01](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)
- KV Free allows 100k reads per day, **1,000 writes per day** and 1 GB storage. — [KV limits](https://developers.cloudflare.com/kv/platform/limits); [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- R2 Free includes 10 GB-month of storage, 1M Class A and 10M Class B operations. Durable Objects Free includes 100k requests per day and 5 GB SQL storage. — [Cloudflare plans](https://www.cloudflare.com/plans.md); [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits)
- Cloudflare static assets support a `_headers` file to add response headers, such as COOP/COEP for SharedArrayBuffer. In Workers code, request headers are immutable, so to add headers you fetch from `env.ASSETS` and build a new Response. — [Cloudflare Workers static assets headers](https://developers.cloudflare.com/workers/static-assets/headers/); [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/index.md); [AnswerOverflow thread](https://www.answeroverflow.com/m/1370085130017964114)

### Inferences
- **Local saves:**
  - Use IndexedDB via `idb-keyval` for simple key/value or `idb`.
  - Store one record per modified chunk (`chunk:x,y,z` mapped to a compressed Uint8Array), plus an `entities` blob for machines, items and vehicles, and a `meta` record holding the seed, version, playtime and an autosave rotation.
  - Write chunk deltas incrementally on edit, debounced, and snapshot entities every 30–60 s.
  - Offer an "Export save" (.bin download) and "Import" to guard against Safari eviction.
  - Request `persist()` after the player's first meaningful save.
- **Cloud saves:**
  - A Worker endpoint does `PUT /save/:slot`. It stores the gzip blob in R2 (no per-value size problem and cheap) and writes the slot metadata row (user, slot, size, updated_at, version) to D1.
  - Avoid KV for saves because of the 1,000 writes per day free limit and eventual consistency.
  - Auth via Cloudflare Access, a third-party OAuth, or anonymous device tokens.
  - Durable Objects fit later co-op, where one DO per world handles authoritative state and WebSockets.
- **Hosting:** serve the game as static assets with long-cache, content-hashed filenames. Serve WASM as a separate `.wasm` file (non-compat builds) so it's cached, Brotli-compressed and streaming-compiled, rather than base64-inlined, which adds about 33% size and blocks streaming compile. Add COOP/COEP via `_headers` only if Jolt multithread or SharedArrayBuffer transform buffers are used. Note that COEP `require-corp` blocks third-party embeds and ads unless they send CORP headers.
- Cloudflare's per-file static asset limit is about 25 MiB [background, unverified]. All the WASM files measured here are 2–4.4 MB raw, well under it.

### Gaps
- The exact KV max value size and current Workers static-asset file size and count limits were not confirmed in this session.
- Whether Cloudflare now recommends Workers static assets over Pages for new projects was not confirmed in this session; it is widely reported [background, unverified].

## Performance budgets, instancing, LOD, pooling, and shipped browser voxel/physics examples

### Takeaway
Target 60 fps on mid-range laptops: about 16.6 ms per frame, with physics under about 4 ms in its worker, remeshing in a separate worker pool, and rendering at 300 draw calls or fewer. Instance all repeated objects (ore chunks, bolts, conveyor segments). Pool physics bodies and meshes. Simulate distant machines abstractly. Shipped browser references are mostly Minecraft-likes; few physics-heavy 3D sandboxes exist in the browser.

### Cited Findings
- Codrops shows Three.js `BatchedMesh` combined with WebGPURenderer for interactive scenes with many objects. — [Codrops: BatchedMesh and WebGPURenderer](https://tympanus.net/codrops/?p=81678)
- A community report says WebGPURenderer can be slower than WebGLRenderer on CPU time in many-mesh scenes (r183). This argues for aggressive instancing and batching either way. — [discourse.threejs.org](https://discourse.threejs.org/tag/webgpu-renderer/1686)
- Rapier v0.35's broad-phase same-parent filtering (about 90x on one stationary stress scene) and v0.29's solver gains of up to 25% benefit scenes with many resting bodies. — [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)
- Havok anecdote: about 3000 entities at 60 fps single-threaded in Babylon. — [Babylon forum](https://forum.babylonjs.com/t/havok-physics-benchmark-multithreading-question/49009)
- three.js voxel engines with workers and editable terrain exist as open-source references, for example Xyzrr/voxels. — [github.com/Xyzrr/voxels](https://github.com/Xyzrr/voxels)

### Inferences
- **Budgets (desktop mid-range, 60 fps):**
  - Main thread: render submission at 6 ms or less, plus game logic and interpolation at 2 ms or less.
  - Physics worker: at most about 6 ms per 16.6 ms step.
  - Mesher workers: 2–4 workers (`navigator.hardwareConcurrency - 2`), with remesh throttled.
  - Dynamic awake bodies: aim for 300 or fewer awake, with 1–3k sleeping allowed.
  - Draw calls: 300 or fewer. Triangles: 1–3M or fewer.
  - Initial download: about 3–5 MB compressed (engine about 0.2–1 MB, physics WASM about 0.7–1.2 MB, plus assets).
- **Instancing:** use one `InstancedMesh` or `BatchedMesh` per ore type or chunk shape, updating matrices from the physics transform buffer each frame. Use the same approach for conveyor rollers, pipes and bolts.
- **Pooling:**
  - Pre-allocate rigid bodies and colliders for ore chunks and toggle them enabled or disabled rather than creating and destroying them. This matters doubly in Jolt because of manual `destroy()`.
  - Reuse geometry buffers for chunk meshes, sized to max vertex count with `setDrawRange`.
  - Avoid per-frame allocations in the render loop to keep GC pauses away.
- **LOD and simulation LOD:**
  - Terrain chunks beyond about 64–96 m can be meshed at half resolution, or skipped for collision.
  - Machines outside a radius run as abstract tick-based simulation (items per second), with no physics bodies.
  - Ore items on distant conveyors become instanced visuals only.
  - Freeze bodies in unloaded chunks: serialize them to the chunk's entity list and remove them from the physics world.
- **Merging rule:** when more than N loose ore items pile up in one spot, auto-merge them into a "pile" or "crate" entity to protect the body budget.
- Profile on low-end targets (integrated GPUs, Chromebooks, iPhone with Safari 26). Expose render-scale, shadow-quality and max-physics-objects settings.

### Gaps
- No shipped 2025–2026 browser game closely matching "first-person physics mining + automation" was identified in this session. Searches surfaced only voxel-engine demos.
- No sourced numeric frame budgets for browser physics games were found. The budgets above are engineering estimates.

## Overall recommended stack (synthesis)

### Takeaway
**Three.js r187 (WebGPURenderer + TSL, auto WebGL2 fallback) + Rapier 0.21 (WASM in a Web Worker) + custom chunked surface-nets voxel terrain meshed in workers + IndexedDB chunk-delta saves + Cloudflare static assets with an R2/D1 cloud-save Worker.** The alternative "engine" path is Babylon.js 9 + Havok, which brings clustered lighting for many cave lanterns and an inspector. Pick Jolt over Rapier if realistic multi-axle or tracked vehicles become a core pillar.

### Cited Findings
- Current versions: three 0.187.0 (2026-10-30); @babylonjs/core 9.37.1 (2026-11-18); playcanvas 2.24.2 (2026-11-18); @dimforge/rapier3d(-compat/-simd-compat) 0.21.0 (2026-09-25); jolt-physics 1.1.2 (2026-11-21); @babylonjs/havok 1.3.14 (2026-07-29). **Outdated:** cannon-es 0.20.0 (2022-08); ammo.js npm 0.0.10 (2016); @react-three/rapier 2.2.0 (2025-11, borderline). — [npm registry](https://registry.npmjs.org/)
- Rapier has voxel colliders with runtime `setVoxel` edits, a character controller and vehicle-controller fixes in 2026, and a CCD rewrite. — [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md); [rapier.rs colliders](https://rapier.rs/docs/user_guides/javascript/colliders)
- Babylon 9 has clustered lighting for hundreds or thousands of lights. — [Windows Developer Blog](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0)

### Inferences
- Rationale for Three.js + Rapier:
  - It has the smallest rendering core.
  - Rapier's JS API is ergonomic, without the manual memory management Jolt needs.
  - Rapier has built-in kinematic character and raycast vehicle controllers.
  - Voxel collider support aligns directly with diggable terrain.
  - Rapier is deterministic.
  - Both have large communities and examples (three.js `RapierPhysics` addon, pmndrs ecosystem).
- Key risks to prototype in week 1:
  1. Trimesh-collider rebuild cost on dig, vs voxel colliders.
  2. 1–2k ore bodies with sleeping, measured in the worker.
  3. Truck handling on the Rapier raycast vehicle over bumpy, dug terrain. If it's poor, evaluate Jolt's WheeledVehicle.
  4. WebGPURenderer CPU overhead vs WebGLRenderer on the target scene.

### Gaps
- None of the recommended combination was benchmarked end-to-end in this research. The recommendations rest on feature fit and the cited changelogs and docs.
