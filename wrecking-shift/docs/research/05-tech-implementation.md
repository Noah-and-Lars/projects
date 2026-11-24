# 05 — Technology and Algorithms for a Teardown-like Voxel Destruction Game

Research date: 2026-11-24. Scope: rendering, physics, destruction, fire and explosions, vehicles, testing in a GPU-less container, and asset creation, for a browser game with 10 cm voxels where everything can be destroyed, built by AI coding agents.

**Evidence labels used below**
- **[MEASURED]**: I ran it in this container (Google Chrome for Testing 158.0.8127.36, Playwright 1.63.0, Node 22.23.5, 4 vCPU, 15 GB RAM, no GPU). The scripts are in `/tmp/claude-0/-home-user/4d42f00d-6ab9-5e5d-b373-6ddf6a8883f9/scratchpad/{gltest,phys,algo}/`.
- **[SOURCE]**: a cited web page.
- **[UNCONFIRMED]**: my engineering judgment, or a claim I could not verify.

---

## 0. TL;DR recommendation

| Decision | Recommendation | Why |
|---|---|---|
| Platform | Web: TypeScript + Vite, static build on GitHub Pages | Testable in headless Chromium here. WebGL2 works through SwiftShader with no flags [MEASURED]. |
| Renderer | **Three.js r187 WebGL2, with chunked binary greedy meshing** (pure TS, 32³ chunks, 32-bit masks). Per-object raymarching is an optional later phase, not the base. | Most robust for agents: standard depth, shadows, picking, and debug tooling. A JS binary mesher runs at roughly 0.1–0.3 ms per 32³ chunk [MEASURED]. |
| WebGPU | Not the primary target. Keep WebGL2 as the baseline. | Firefox on Linux still lacks WebGPU as of the latest status found [SOURCE]. Headless WebGPU works here, but only with a flag and only on a SwiftShader fallback adapter [MEASURED]. |
| Physics | **`@dimforge/rapier3d-compat@0.21.0`** (or `-simd-compat`). Use **native `Voxels` colliders** for the world and large objects, and plain cuboids for small debris. | Rapier has had a voxel shape since JS 0.16.0, with `setVoxel` (O(1)) and dynamic voxel bodies since 0.17.0 [SOURCE]. It ran 1000 debris cuboids on a 187k-voxel world at about 6 ms per step [MEASURED]. Results were bit-identical across runs [MEASURED]. |
| Destruction | Dense per-object `Uint8Array` grids (material index per voxel). Carve with spheres, then run connected-component labeling (BFS) restricted to touched objects. Split unanchored components into new rigid bodies. | Labeling 384k cells takes about 10–28 ms in JS [MEASURED], fine as an event-driven cost. Add a race-BFS optimization later. |
| Vehicles | Rapier `world.createVehicleController(chassis)` (`DynamicRayCastVehicleController`) | Its raycasts hit `Voxels` colliders [MEASURED]. The three.js example `physics_rapier_vehicle_controller` is a reference [SOURCE]. |
| Testing | Vitest/Node for deterministic simulation and algorithm tests. Playwright + SwiftShader for smoke screenshots at small resolution (320×180 to 640×360). | Full 720p raymarch runs at about 330 ms per frame in SwiftShader, so do not run a real-time loop in CI [MEASURED]. |
| Assets | Procedural voxel buildings in code. Load `.vox` with three.js `VOXLoader` (r187 parses nTRN/nGRP/nSHP and has a greedy `buildMesh`) or `vox-reader@4.0.1`. Generate audio with jsfxr/ZzFX plus CC0 SFX. | No artist required. |

---

## 1. Container facts: what the headless browser can do [MEASURED]

### 1.1 WebGL2 in headless Chrome without a GPU

With Playwright's `chromium.launch({ executablePath: '/usr/bin/google-chrome' })` and **no extra flags**:

```
webgl2: true
UNMASKED_RENDERER: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)"
MAX_3D_TEXTURE_SIZE: 2048
```

The no-flag path works because Playwright 1.63 adds `--enable-unsafe-swiftshader` to Chromium's default arguments itself. I confirmed this in `playwright-core/lib/coreBundle.js` (`chromeArguments.push("--enable-unsafe-swiftshader")`).

This matters because Chrome is removing the *automatic* SwiftShader fallback. The deprecation began in Chrome 130, and Chrome 139 started removal experiments on Linux and macOS; after that, SwiftShader has to be opted into with `--enable-unsafe-swiftshader` ([Blink-dev Intent to Remove](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM), [chromedp commit note](https://chromium.googlesource.com/external/github.com/chromedp/chromedp/+/refs/tags/v0.14.1), [Chromium SwiftShader doc](https://chromium.googlesource.com/chromium/src/+/da170c2267b2201954efe1c8fa5d2d89ab09f7bf/docs/gpu/swiftshader.md)). **Recommendation:** pass `--enable-unsafe-swiftshader` and `--use-angle=swiftshader` explicitly in the Playwright config so test behaviour does not depend on Playwright's defaults.

### 1.2 WebGPU in headless Chrome without a GPU

- `navigator.gpu` is **undefined on `about:blank`**. WebGPU needs a secure context, so serve the page over `http://localhost`.
- On localhost **without flags**, `requestAdapter()` returns `null`.
- With **`--enable-unsafe-webgpu` alone**, `requestAdapter()` returns an adapter with `info.architecture: "swiftshader"` and `isFallbackAdapter: true`. `requestDevice()` succeeds, the `webgpu` canvas context exists, `maxStorageBufferBindingSize` is 1 GiB, and `maxTextureDimension3D` is 2048.
- Adding `--use-angle=vulkan --disable-vulkan-surface` (from [Chrome's headless GPU-testing blog](https://developer.chrome.com/blog/supercharge-web-ai-testing)) **broke** adapter acquisition here. Do not copy that recipe blindly; it targets machines with a real NVIDIA GPU.
- Conclusion: WebGPU code *can* be smoke-tested headless, but only on a CPU fallback adapter. A test that passes there tells you nothing about how real GPUs or drivers will behave.

### 1.3 Software rendering throughput (SwiftShader, 4 vCPU)

| Workload | 320×180 | 640×360 | 1280×720 |
|---|---|---|---|
| WebGL2 fragment-shader DDA raymarch, 128³ `R8UI` 3D texture, city scene | 22.8 ms | 76.6 ms | 330.6 ms |
| WebGPU compute DDA raymarch (same scene, storage buffer) | 34.5 ms | 114.6 ms | 362.5 ms |

| Rasterized triangles (WebGL2, 1280×720, small triangles) | ms/frame |
|---|---|
| 100k triangles | 40.5 |
| 1M triangles | 329.5 |

**Implications:**
1. CI cannot judge real-time frame rate. Use it only for correctness: no shader compile errors, non-empty frames, rough image comparison.
2. Render test screenshots at 320×180 or 640×360.
3. Never benchmark rendering here. Benchmark simulation in Node instead (physics, meshing, connectivity), which runs at native-like WASM/JS speed.

---

## 2. Rendering approaches compared

### 2.1 What Teardown actually does [SOURCE]

- **Voxel size is 10 cm.** Dennis Gustafsson: "they are on the scale of where 1 voxel is 10 centimeters", a scale taken from MagicaVoxel ([SE Daily transcript](https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt)).
- **Objects:** each object is a 3D volume texture with one byte per voxel, indexing a 256-entry palette. Each object is drawn as a 36-vertex box. The fragment shader steps the ray through the volume and writes `gl_FragDepth`. Two extra mip levels skip 2³ and 4³ empty blocks, so object dimensions must be multiples of 4 ([Acko.net "Teardown Frame Teardown"](https://acko.net/blog/teardown-frame-teardown/)).
- **Lighting:** a deferred G-buffer with 5 render targets. A CPU-updated **1-bit volumetric shadow map of the whole level** (1752×100×1500 texels, 262 MB on the Marina level) supports raytraced AO, soft shadows, and reflections. Results are denoised and accumulated with TAA ([Acko.net](https://acko.net/blog/teardown-frame-teardown/)). The game has no GI ([80.lv](https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech)).
- **Storage:** Teardown uses a dense, uncompressed grid per shape. Gustafsson's new engine moves to 8×8×8 chunks tracked by a 3D bitmap, uses substepping ("Temporal Gauss Seidel") instead of solver iterations, and replaces the shadow volume with hardware RT ([Voxagon year summary 2024](https://blog.voxagon.se/2024/12/29/year-summary.html)).
- **Physics and multiplayer:** everything is custom ("I wrote everything"). Multiplayer replays destruction commands deterministically instead of sending voxel data ([SE Daily](https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt), [80.lv](https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech)).

### 2.2 Option A: chunked greedy meshing + Three.js WebGL2 (recommended baseline)

**How it works.** Split each object, and the static world, into 32³ chunks. Build a mesh for every chunk that is dirty. Dynamic bodies are `THREE.Group`s with chunk meshes as children, and the body transform moves the group.

**Binary greedy meshing** ([cgerikj/binary-greedy-meshing](https://github.com/cgerikj/binary-greedy-meshing)) stores occupancy as bit columns, culls faces with `col & ~(col >> 1)`, and merges 64 faces at a time with bit operations. Reported times for a 62³ chunk: 50–200 µs in the C version ([docs.rs README](https://docs.rs/crate/binary-greedy-meshing/0.5.2/source/README.md)). The Rust crate `binary-greedy-meshing` 0.5.x reports about 65 µs for "fast_mesh" and about 300 µs for "mesh" on opaque voxels.

**[MEASURED] JavaScript numbers.** I wrote a ~40-line TS-style binary greedy mesher for 32³ chunks (32-bit `Uint32Array` columns, `Math.clz32`; script at `.../scratchpad/algo/bgm.mjs`):

| 32³ chunk content | JS binary greedy | three.js r187 `VOXLoader.buildMesh` (array-based greedy) |
|---|---|---|
| Walls/slabs | ~106 µs | 10.8 ms |
| Smooth terrain | ~105 µs | 5.4 ms |
| Worst-case noise (11.4k quads) | ~314 µs | 26.6 ms |

The prototype handles a single material. Supporting materials means one mask set per material present in the chunk, or merging only when material and AO match. Expect a 2–4× slowdown [UNCONFIRMED].

**Why this is the most agent-feasible option:**
- It uses standard three.js machinery: `MeshStandardMaterial` or a small custom `ShaderMaterial` with vertex colors, `DirectionalLight` shadow maps, `Raycaster` (or Rapier raycasts) for picking, fog, and postprocessing.
- Every step can be tested on the CPU: mesher output, quad counts, and watertightness checks run in Node with no GPU.
- Per-vertex AO (the classic 0–3 neighbor-count technique) is easy to add, but it hurts greedy merging. Either merge only quads with equal AO, or compute AO in the shader from a small 3D occupancy texture [UNCONFIRMED tradeoff].
- Draw-call management: use one `BufferGeometry` per chunk with a packed vertex format, for example one `Uint32` per vertex holding xyz (6 bits each), normal (3 bits), and material (8 bits). Decode it in the vertex shader. For many small debris bodies, use `THREE.BatchedMesh` (three ≥ r159) or `@three.ez/instanced-mesh@0.3.16` to keep draw calls low. One draw call per chunk is fine up to a few thousand chunks [UNCONFIRMED].
- Budget: a 100 m × 100 m × 20 m map is 1000 × 1000 × 200 voxels, so about 6,100 chunks of 32³ if fully allocated. Most are empty, so store chunks sparsely in a `Map<chunkKey, Uint8Array(32768)>`. A full remesh of 1,000 non-empty chunks costs about 0.1–0.3 s and is needed only at load. Destruction dirties 1–8 chunks per event, about 1 ms.

**Weaknesses:** no Teardown-style soft raytraced lighting. Big explosions remesh many chunks, so the work needs a per-frame budget (see §4.6). Triangle counts grow on noisy surfaces.

### 2.3 Option B: per-object raymarching in WebGL2 with 3D textures (Teardown-style)

**How it works.** Each object gets a `THREE.Data3DTexture` (`R8UI`, `RedIntegerFormat`, nearest filtering) and is drawn as a unit box. The fragment shader transforms the ray into object space, runs an Amanatides–Woo DDA, and writes `gl_FragDepth`.

three.js ships **`webgl_volume_instancing`**, which already does the box-rasterize-then-march-and-write-depth setup with `VOXData3DTexture`. However, it marches with fixed steps and does not use a DDA ([three.js r180 example source](https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/webgl_volume_instancing.html)). My benchmark shader (`.../scratchpad/gltest/bench.html`) is a working DDA that agents can start from.

**Pros:**
- Edits are cheap. `texSubImage3D` on a small sub-box updates the GPU copy, and there is no remeshing.
- It looks closest to Teardown and keeps the door open for a raytraced shadow volume.

**Cons and risks for agents:**
1. Writing `gl_FragDepth` disables early-Z, so overdraw is expensive. Teardown needed custom depth-checkpoint passes ([Acko.net](https://acko.net/blog/teardown-frame-teardown/)).
2. Three.js shadow maps do not work with raymarched objects out of the box. You need a custom depth material that also raymarches, or your own shadow volume.
3. Hundreds of debris bodies mean hundreds of textures and boxes. You need a 3D texture atlas (packing, fragmentation) to avoid texture binds.
4. Bugs (precision, back-face starts, the camera inside a box) are hard to test without a GPU. SwiftShader is slow but correct, so screenshot tests remain possible.

**Verdict:** a realistic "phase 2" visual upgrade for large static structures, not the starting point.

### 2.4 Option C: WebGPU compute raytracing

The whole scene lives in a GPU structure, such as a brickmap/64-tree or Gustafsson's 8³-chunk bitmap. A compute shader traces primary rays and shadows.

- [Douglas Dwyer's Octo engine](https://github.com/DouglasDwyer/octo-release) is Rust + WASM + WebGPU and uses "voxel ray marching with compute shaders", with path-traced AO and shadows and connected-component detection. The public repo is an archived August 2024 *release* repo, and its source license is not stated [SOURCE].
- [sbobyn/three-voxel-destruction](https://github.com/sbobyn/three-voxel-destruction) (MIT) is the most relevant web reference. It is Teardown-inspired and built on Three.js WebGPU, with a 94,000-voxel city where every voxel is a body in the GPU AVBD solver of [three-avbd](https://github.com/sbobyn/three-avbd/wiki). Storeys collapse, rubble "settles and freezes", and there are vehicles and fire. It **requires a hardware WebGPU adapter; WebGL fallback cannot run the solver** [SOURCE].
- Browser coverage per web.dev: Chrome/Edge, Safari 26 (macOS/iOS 26), Firefox 141+ on Windows, and Firefox 145+ on Apple-silicon macOS. **Firefox on Linux/Android was still in progress** ([web.dev](https://web.dev/blog/webgpu-supported-major-browsers)).

**Verdict:** the highest ceiling, but the weakest fit for agents working without a GPU. Validation would rest entirely on a SwiftShader fallback adapter. Consider it only if a human with a GPU reviews visuals regularly. A middle path is three.js `WebGPURenderer`, which can also fall back to a WebGL2 backend, though compute features are then unavailable [UNCONFIRMED for r187 details].

### 2.5 Summary table

| | A: Greedy mesh + three.js | B: Per-object raymarch (WebGL2) | C: WebGPU compute RT |
|---|---|---|---|
| Agent implementability | **High** | Medium | Low–medium |
| Testable headless | Yes (CPU mesher tests + SwiftShader) | Yes (SwiftShader, slow) | Only on fallback adapter with flag |
| Browser reach | All WebGL2 browsers | All WebGL2 browsers | WebGPU browsers only |
| Edit cost | Remesh 1–8 chunks (~0.1–0.3 ms each in JS) | `texSubImage3D` (cheap) | Buffer write (cheap) |
| Shadows/AO | three.js shadow maps + vertex AO | Custom | Raytraced (best) |
| Teardown look | Low–medium | High | Highest |

---

## 3. Physics

### 3.1 Library choice and verified versions

npm versions checked on 2026-11-24:

| Package | Version | Notes |
|---|---|---|
| `@dimforge/rapier3d-compat` | 0.21.0 | WASM inlined as base64, so it is simple to ship on GitHub Pages |
| `@dimforge/rapier3d-simd-compat` | 0.21.0 | SIMD build. Barely different in my benchmark. |
| `@dimforge/rapier3d-deterministic-compat` | 0.21.0 | Cross-platform determinism, if replays or multiplayer matter |
| `jolt-physics` (JoltPhysics.js) | 1.1.2 | Strong engine with a verbose Emscripten API. Multithread builds need COOP/COEP headers, which GitHub Pages cannot set [UNCONFIRMED: needs a service-worker workaround]. |
| `cannon-es` | 0.20.0 (last publish 2022-08) | Stale. Not recommended. |
| `ammo.js` | 0.0.10 (2022) | Stale. Not recommended. |
| `three` | 0.187.0 | Ships `examples/jsm/physics/{RapierPhysics,JoltPhysics,AmmoPhysics}.js` helpers |

**Rapier voxel features**, from the [rapier.js CHANGELOG](https://raw.githubusercontent.com/dimforge/rapier.js/master/CHANGELOG.md):
- 0.16.0 (Apr 2025): `ColliderDesc.voxels`, `Collider.setVoxel`, `Voxels` shape.
- 0.16.1: shape-casting and CCD with voxels.
- 0.17.0: **voxel colliders on dynamic bodies**, plus voxel-vs-voxel and voxel-vs-compound contacts.
- 0.17.1: `combineVoxelStates` and `propagateVoxelChange`, which fix internal edges between neighboring voxel colliders.
- 0.19.1: sparse voxel storage, avoiding the 4 GB WASM limit.
- 0.19.3: faster `combineVoxelStates`.

Other notable additions: `RigidBody.velocityAtPoint` (0.15.1), `World.timing*` profiling (0.18.0), and a broad-phase rework for large scenes (0.18.0).

API signatures confirmed in the installed 0.21.0 `.d.ts`:

```ts
static voxels(voxels: Float32Array | Int32Array, voxelSize: Vector): ColliderDesc; // Int32Array = grid coords (x,y,z triplets)
static compound(shapes: Shape[], positions: Vector[], rotations: Rotation[], flags?): ColliderDesc;
static convexDecomposition(vertices: Float32Array, indices: Uint32Array, params?: VHACDParameters, flags?): ColliderDesc | null;
static trimesh(vertices, indices, flags?); static heightfield(nrows, ncols, heights, scale, flags?);
collider.setVoxel(ix, iy, iz, filled: boolean): void;            // O(1), grows grid if needed
collider.combineVoxelStates(other: Collider, sx, sy, sz): void;  // once per neighboring pair
collider.propagateVoxelChange(other, ix, iy, iz, sx, sy, sz): void; // after setVoxel near a boundary
world.createVehicleController(chassis: RigidBody): DynamicRayCastVehicleController;
world.takeSnapshot(): Uint8Array; World.restoreSnapshot(data);
```

**[MEASURED] Voxel coordinate convention:** with `voxelSize = 0.1`, grid voxel `(i,j,k)` occupies `[i·0.1, (i+1)·0.1]` in collider-local space, so the origin is at a corner, not the center. A dynamic body with four 0.1 m voxels at density 1000 got mass 4.0 kg and a local center of mass of (0.2, 0.05, 0.05), so mass properties are computed automatically.

### 3.2 [MEASURED] Rapier performance in Node 22

Setup: static world = one `Voxels` collider holding 187,136 voxels (a 200×200 ground plus 16 hollow 30×60×30 buildings). Building it took about 47–67 ms. Debris was dropped into the buildings and stepped 300 times at the default 1/60 s.

| Debris type | N=100 | N=300 | N=1000 |
|---|---|---|---|
| 1 cuboid per body | 0.9 ms avg | 1.5 ms | **6.3 ms** (worst 27 ms) |
| 8 cuboid colliders per body | 1.4 ms | 6.4 ms | 32.6 ms (worst 101 ms) |
| 1 `Voxels` collider per body (~48 voxels, 5×4×3) | 1.4 ms | 5.1 ms | 33.9 ms (worst 149 ms) |

- `setVoxel` ×290 on the static collider took 0.49 ms in total.
- Determinism: two identical runs of 200 bodies over 300 steps produced bit-identical position hashes (same machine and binary).
- SIMD build: about 10–15% faster on the compound case; otherwise the same.
- Rapier vs Jolt (single-threaded wasm-compat build, box pile on a ground box, 600 steps): N=500 gave Jolt 1.02 ms vs Rapier 1.17 ms. N=2000 gave Jolt 31.5 ms vs Rapier 13.5 ms. Default settings were used for both, so treat this as indicative only.

**Budget guideline [derived from measurements]:** keep **≤ 300 active debris bodies with complex shapes**, or **≤ ~1000 single-cuboid debris bodies**, for a physics step of about 6 ms or less on desktop CPUs. Mobile is likely 2–4× slower [UNCONFIRMED]. Put sleeping bodies to sleep aggressively and freeze them (§4.6).

### 3.3 Collider strategy

| Entity | Collider | Notes |
|---|---|---|
| Static world (terrain, buildings still anchored) | `Voxels` collider **per 32³ chunk** (or one per building) | Edit with `setVoxel` in O(1). Call `combineVoxelStates` once between neighbor chunks, and `propagateVoxelChange` after edits on chunk borders, to avoid internal-edge snagging. |
| Large detached pieces (wall sections, collapsed floors) | One `Voxels` collider per body, holding all the piece's voxels or only its **surface voxels** | Interior voxels do not matter for contacts. Mass comes from density, so set density to compensate for removed interior voxels, or use `setAdditionalMassProperties` [UNCONFIRMED: test which is simpler]. |
| Medium pieces when voxel-vs-voxel cost is too high | Compound of **greedy boxes** (§4.4): `ColliderDesc.compound` or several cuboid colliders on one body | My 80×60×80 hollow house reduced to 7 boxes intact and 129 boxes after cuts, in ~1.6–11 ms in JS. |
| Tiny debris (< ~30 voxels) | One cuboid fit to the AABB, or skip physics and use particles | By far the cheapest option. |
| Vehicles | Cuboid or convex hull chassis + `DynamicRayCastVehicleController` | §6 |
| Player | `world.createCharacterController(offset)` with a capsule | Standard Rapier kinematic controller. |

**Alternatives.** Sampling surface voxels as spheres (the classic "particle-based rigid body" approach) is unnecessary now that Rapier handles voxel-vs-voxel contacts natively. Trimesh colliders built from the greedy mesh also work for static geometry, but each edit forces a full rebuild, so voxels are strictly better for editable geometry. `convexDecomposition` (VHACD) is far too slow to run at destruction time [UNCONFIRMED; it is generally hundreds of ms or more].

### 3.4 Minimal Rapier setup (TypeScript)

```ts
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const VS = 0.1; // 10 cm
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = 1 / 60;           // fixed step; accumulate real dt and step N times
world.numSolverIterations = 4;     // tune; default is fine

// Static chunk collider at chunk origin (cx,cy,cz) in chunk units of 32 voxels
function makeChunkCollider(coords: Int32Array, cx: number, cy: number, cz: number) {
  return world.createCollider(
    RAPIER.ColliderDesc.voxels(coords, { x: VS, y: VS, z: VS })
      .setTranslation(cx * 32 * VS, cy * 32 * VS, cz * 32 * VS)
      .setFriction(0.8));
}

// Dynamic voxel body for a split-off component
function makeVoxelBody(coords: Int32Array, pos: RAPIER.Vector, rot: RAPIER.Rotation,
                       linvel: RAPIER.Vector, angvel: RAPIER.Vector, density: number) {
  const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(pos.x, pos.y, pos.z).setRotation(rot)
    .setLinvel(linvel.x, linvel.y, linvel.z).setAngvel(angvel)
    .setCanSleep(true).setCcdEnabled(false));
  world.createCollider(RAPIER.ColliderDesc.voxels(coords, { x: VS, y: VS, z: VS }).setDensity(density), rb);
  return rb;
}
```

---

## 4. Destruction algorithms

### 4.1 Data model (recommended)

```ts
interface VoxelObject {
  id: number;
  dims: [number, number, number];   // tight bounds, ≤ 256 per axis
  vox: Uint8Array;                  // material/palette index, 0 = empty; idx = x + dims[0]*(y + dims[1]*z)
  health?: Uint8Array;              // optional per-voxel HP for multi-hit materials
  body: RAPIER.RigidBody | null;    // null => static (part of world)
  collider: RAPIER.Collider;
  chunks: Map<number, ChunkMesh>;   // render chunks 32^3 within the object
  anchored: boolean;                // touches ground / static world
}
```

Materials go in a table: `{ hardness: 0 soft | 1 medium | 2 hard, density, flammability, color, breakSound }`. The three tiers mirror Teardown's `MakeHole(pos, r0, r1, r2)`, where r0/r1/r2 are hole radii for soft (glass, foliage, dirt, wood, plaster, plastic), medium (concrete, brick, weak metal), and hard materials (hard metal, hard masonry), with `r1 ≤ r0` and `r2 ≤ r1` ([Teardown API](https://teardowngame.com/modding/api.html)). Teardown explosions take a size from 0.5 to 4.0 (same source).

Dense grids per object (Teardown's model) are simplest. The world can be a sparse map of 32³ dense chunks.

### 4.2 Carving

```ts
// world-space sphere -> each overlapping object's local grid (inverse body transform)
function carveSphere(obj, centerLocal /* voxel units */, rSoft, rMed, rHard, removed: number[]) {
  const r = rSoft, [X, Y, Z] = obj.dims;
  for (let z = max(0, floor(c.z - r)); z <= min(Z - 1, ceil(c.z + r)); z++)
   for (let y = ...) for (let x = ...) {
     const i = x + X * (y + Y * z), m = obj.vox[i]; if (!m) continue;
     const d2 = (x + .5 - c.x) ** 2 + (y + .5 - c.y) ** 2 + (z + .5 - c.z) ** 2;
     const rr = [rSoft, rMed, rHard][MAT[m].hardness];
     if (d2 <= rr * rr) { obj.vox[i] = 0; removed.push(i); }
   }
}
```

After carving:
1. Call `collider.setVoxel(x,y,z,false)` for each removed voxel.
2. Mark the affected render chunks dirty.
3. Spawn debris or particles for a capped subset of the removed voxels.
4. Push the object onto the connectivity queue.

[MEASURED]: 40 carve calls (r=4–6 voxels) removing 1,402 voxels took 3.5 ms in JS, including JIT warm-up.

For rough breakage, add noise to the radius per voxel, for example `rr * (0.85 + 0.3*hash(x,y,z))` [UNCONFIRMED aesthetic choice].

### 4.3 Connectivity and splitting

**Baseline (correct and simple):** after any edit to object O, run connected-component labeling over O's grid. Use 6-connectivity; 26-connectivity feels "stickier". Use an iterative BFS with a preallocated `Int32Array` queue and an `Int32Array` label array, never recursion.

[MEASURED] on an 80×60×80 grid (384k cells, ~60k solid): labeling took 9.8 ms. After cutting the house into 2 components (17,383 anchored, 40,539 floating), it took 28 ms, including GC and JIT noise.

For each component:
- **Static world objects:** a component is anchored if any voxel lies at y = 0, touches the terrain, or carries an `anchor` flag. Any **unanchored** component becomes a new dynamic body.
- **Dynamic objects:** if there is more than one component, keep the largest as the original body and spawn the rest as new bodies.

**Creating the new body:**
1. Compute the component's tight AABB and copy its voxels into a new grid.
2. Clear those voxels from the parent grid and collider.
3. Compute the new body's world transform: the parent transform times the AABB-min offset.
4. Set linear velocity with `parent.velocityAtPoint(newCOM)` (Rapier ≥ 0.15.1), and copy angular velocity from the parent.
5. Very small components (< ~8–30 voxels) become particles, or a single cuboid body, instead of a full voxel body.

**Incremental optimization ("race BFS") [UNCONFIRMED, a standard technique, not from a cited source]:**
- A carve can only disconnect parts that touch the hole. Collect the solid 6-neighbors of removed voxels as seeds, and dedupe seeds already reached by an earlier search.
- Run one BFS per seed, interleaved one step at a time.
- A search stops when it reaches an anchor (that region is still supported), when it merges with another search (same component), or when its frontier is exhausted. An exhausted search *is* a floating island: split it off.
- Since the floating pieces are usually small, this costs O(size of the smaller pieces) instead of O(whole building). Fall back to full labeling if the total visited count exceeds a budget.
- Community write-ups describe similar bounded or limited flood fills and searches that extract islands ([legalian voxel continuity](https://legalian.github.io/voxel/2018/03/19/voxel-continuity-algorithm.html), [Roblox devforum thread](https://devforum.roblox.com/t/how-do-i-make-proper-voxel-destruction-physics-like-teardown/1676135)). The WSCG 2016 SVO fracture paper describes "islands detection ... tunable to a desired level-of-detail" ([Domaradzki PDF](https://dspace5old.zcu.cz/bitstream/11025/29529/1/Domaradzki.pdf)).

Union-find is not a good fit here, because it handles unions but not deletions. Rebuilding union-find costs the same as BFS labeling, so plain BFS is simpler.

### 4.4 Greedy box decomposition (for compound colliders and AABB fitting)

The algorithm: scan voxels in x, y, z order. For each unused solid voxel, extend the run in +x, then extend the rectangle in +y while every voxel in the row is solid and unused, then extend in +z. Mark the result used and emit a box `[x,y,z,w,h,d]`. Convert each box to `ColliderDesc.cuboid(w*VS/2, h*VS/2, d*VS/2)` with a translation to the box center.

It is O(n · box size), deterministic, and not optimal, but good enough. [MEASURED]: 7 boxes for the intact house and 129 after cuts, at 1.6 ms. Cap the box count at around 32. If a piece exceeds the cap, fall back to a `Voxels` collider or merge boxes into AABBs.

### 4.5 Structural collapse: a simple stress model

Teardown itself mostly uses connectivity only. Reviewers note that "entire buildings will often be held up by one voxel" ([PC Gamer review](https://www.pcgamer.com/au/teardown-review/)). Gustafsson said full load-bearing calculation was impractical (Steam discussion quote reported in search results, [UNCONFIRMED primary source]).

A Teardown developer has posted a prototype structural-integrity solver "inspired by Erin [Catto]'s work" ([80.lv](https://80.lv/articles/this-real-time-voxel-building-demolition-is-so-satisfying/)).

Cheap options that agents can implement and test, in order of complexity [UNCONFIRMED designs]:

1. **Connectivity only** (Teardown baseline): described above.
2. **Thin-neck breaking.** After an edit, for each anchored component that touched the edit, find the voxels within k voxels of the hole and count the cross-section connecting the "upper" mass. If `massAbove / crossSectionArea > material.strength`, delete the neck voxels, or split along that plane. Implementation: BFS from the anchors, recording a BFS-layer index; the narrowest layer between the edit and the bulk of the mass is the neck.
3. **Support-distance (Valheim / 7 Days to Die style).** Each voxel's support is the minimum over neighbors of (support + cost), where moving down to an anchor is free, moving horizontally costs 1, and moving up costs a little. Voxels whose support exceeds the material's `maxSpan` detach. Run it as a bounded Dijkstra or BFS in the edited region only. It gives believable overhang failure and is fully deterministic. (The Valheim and 7DTD reference is general knowledge [UNCONFIRMED].)
4. **Joint-based clusters.** Pre-split buildings into clusters, such as wall panels of about 1 m², and connect them with Rapier fixed joints that break when the impulse exceeds a threshold. Rapier JS has no built-in breakable joints, so read impulses yourself [UNCONFIRMED API detail], or approximate with contact-force events. This is more physically plausible but harder to make stable.

Recommendation: ship options 1 and 3. Option 3 makes "cut the pillars and the floor above falls" work, which is the key gameplay beat.

### 4.6 Debris lifecycle and budgets

- **Spawn budget per explosion:** at most N voxel bodies (e.g. 20) plus M cuboid chunks (e.g. 60). The rest become particles: instanced cubes with simple ballistic integration and ground collision against the voxel grid. Particles do not enter Rapier.
- **Sleep and freeze:** when a debris body sleeps (`rb.isSleeping()`) for more than about 2 s, convert small ones (< 64 voxels) into **static world voxels**. Write them into the world grid at their snapped position, or simply keep the frozen body as a fixed body. This is how three-voxel-destruction's rubble "settles and freezes" ([repo](https://github.com/sbobyn/three-voxel-destruction)).
- **Global cap:** when active bodies exceed the cap (e.g. 300), delete the oldest or smallest sleeping debris with a scale-down tween.
- **Fall-out:** remove bodies below y < -50.
- **Remesh budget:** process at most ~2–4 ms of dirty chunks per frame from a priority queue (nearest first). Optionally mesh in a Web Worker, transferring the `Uint8Array` chunk data plus 1-voxel borders and sending back `ArrayBuffer`s.

---

## 5. Fire, smoke, and explosions

### 5.1 Fire as a sparse cellular automaton

Teardown's API exposes `SpawnFire`, `GetFireCount`, `QueryClosestFire`, `RemoveAabbFires`, and `AddHeat(shape,pos,amount)`. For `AddHeat`: "As soon as the heat of the voxel reaches a critical value, it destroys and can ignite the surrounding voxels" ([Teardown API](https://teardowngame.com/modding/api.html)). That suggests a heat-threshold model with a global fire count. I could not find Teardown's exact cap or spread rates [UNCONFIRMED].

The recommended design is deterministic and runs at 10 Hz, separate from rendering:

```ts
// state
fires: Map<voxelKey, { heat: number, fuel: number }>  // active burning voxels only (sparse)
MAX_FIRES = 1500;                                      // hard cap, like Teardown's fire count
MAT = { wood: { flammability: 0.6, fuel: 40 }, plaster: { 0.05, 5 }, concrete: { 0, 0 }, foliage: { 0.9, 10 } ... }

function fireTick(rng /* seeded */) {
  for (const [k, f] of fires) {
    f.fuel -= 1;
    if (f.fuel <= 0) { removeVoxel(k); fires.delete(k); queueConnectivity(k); continue; } // burn-through -> collapse
    for (const n of neighbors26(k)) {              // weight: up 3x, sides 1x, down 0.3x; add wind vector
      const m = material(n); if (!m.flammability) continue;
      heat[n] = (heat[n] ?? 0) + f.heat * weight(n - k) * m.flammability;
      if (heat[n] > IGNITE && fires.size < MAX_FIRES && rng() < 0.5) fires.set(n, { heat: 1, fuel: m.fuel });
    }
    if (rng() < 0.3) spawnSmoke(k); if (rng() < 0.6) spawnFlame(k);
  }
  decayHeatMap(); // heat *= 0.9; delete entries below epsilon
}
```

- An upward bias plus wind gives believable spread. Burning cells deal more damage to neighbors downwind ([GMTK, How Games Do Destruction](https://gmtk.substack.com/p/how-games-do-destruction)).
- Burned-out voxels are removed, so fire feeds the connectivity and collapse system automatically.
- Keep fire on a seeded RNG so tests are reproducible.
- Track per-object fire sets so fires on dynamic bodies move with their body.

### 5.2 Smoke and flames

- **Rendering:** a CPU particle pool rendered as one `THREE.InstancedMesh` of camera-facing quads, or `THREE.Points` with a soft sprite. Use additive blending for flames and alpha blending sorted back-to-front for smoke. Sort only every few frames.
- **Simulation:** velocity = buoyancy + wind + curl noise. Lifetime 2–6 s. Cap at about 2,000 smoke particles.
- Teardown's own smoke particles are "simulated with fluid dynamics internally and rendered with some special tricks", while plain particles handle fire and debris ([Teardown API](https://teardowngame.com/modding/api.html)). A simplified curl-noise field gets 80% of the look [UNCONFIRMED].

### 5.3 Explosions

```ts
function explode(p: Vec3, size /* 0.5..4 like Teardown */) {
  const R = size * 1.0;                                    // meters, tune
  for (const obj of objectsOverlappingSphere(p, R * 1.2))  // via world.intersectionsWithShape(ball)
    carveSphere(obj, toLocal(obj, p), R / VS, 0.6 * R / VS, 0.25 * R / VS, removed);
  spawnDebris(removed, p);                                 // capped bodies + particles, outward velocity
  world.forEachRigidBody / intersectionsWithShape(p, ball(R * 3)) => {
    const d = rb.translation() - p; const dist = |d|;
    const imp = size * K * mass(rb) * max(0, 1 - dist / (3 * R)) / max(dist, 0.3);
    rb.applyImpulseAtPoint(normalize(d) * imp, nearestPointOnBody, true); // wake = true
  };
  igniteFlammable(p, R * 1.3);                             // fire seeds
  cameraShake(size); playExplosionSound(size); spawnFlash(p); spawnSmoke(p, 40 * size);
}
```

- Optional occlusion: raycast from the center to each body and halve the impulse if blocked.
- Apply carving **before** impulses, so newly split bodies also receive the push.
- Use the same impulse function for weapon hits, with a small radius.

---

## 6. Vehicles (Rapier `DynamicRayCastVehicleController`)

- **API:** create with `world.createVehicleController(chassisBody)` (JS ≥ 0.12.0, per the changelog). The full method list is in `dist/control/ray_cast_vehicle_controller.d.ts`:
  - wheels: `addWheel(chassisConnectionCs, directionCs, axleCs, suspensionRestLength, radius)`
  - per wheel: `setWheelSuspensionStiffness`, `setWheelSuspensionCompression`, `setWheelSuspensionRelaxation`, `setWheelMaxSuspensionTravel`, `setWheelMaxSuspensionForce`, `setWheelFrictionSlip`, `setWheelSideFrictionStiffness`, `setWheelEngineForce`, `setWheelBrake`, `setWheelSteering`
  - per step: `updateVehicle(dt, filterFlags?, filterGroups?, filterPredicate?)`
  - readouts: `currentVehicleSpeed()`, `wheelIsInContact(i)`, `wheelSuspensionLength(i)`, `wheelRotation(i)`
- **Gotcha [MEASURED from the .d.ts]:** the forward-axis setter is declared as `set setIndexForwardAxis(axis)` (sic), while `indexUpAxis` has a normal setter. Keep the defaults (+Y up), or check this at runtime.
- **Reference:** the three.js example `physics_rapier_vehicle_controller.html` ([source](https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/physics_rapier_vehicle_controller.html)). It uses `wheelRadius 0.3`, `suspensionRestLength 0.8`, `direction (0,-1,0)`, `axle (-1,0,0)`, `setWheelSuspensionStiffness(24)`, and `setWheelFrictionSlip(1000)`. Note that it passes a boolean to `setWheelSteering` in `addWheel`, which is a bug; don't copy it. The Rust example uses suspension stiffness 100 and damping 10 ([rapier vehicle_controller3.rs](https://git.nea.moe/github/rapier.git/tree/examples3d/vehicle_controller3.rs?h=v0.22.0)).
- **[MEASURED]** A 0.9×0.3×2 m chassis (density 100) with 4 wheels (radius 0.35, rest 0.5, stiffness 30, frictionSlip 2) on a `Voxels` ground collider settled, gained contact, and reached about 28 m/s under engine force -2000. The wheel raycasts **do hit voxel colliders**.
- **Agent tips:**
  - Call `updateVehicle(world.timestep)` *before* `world.step()` every fixed step.
  - Exclude the chassis's own collider in `filterPredicate`.
  - Do the wheel visuals from `wheelSuspensionLength` and `wheelRotation`, as the three.js example does.
  - For destructible vehicles, build the chassis visual as a voxel object, but keep the physics chassis a simple cuboid or convex hull, shrinking or deforming it on damage. Spawn detached voxel parts as debris.
  - Cars ramming walls: on contact-force events (`ActiveEvents.CONTACT_FORCE_EVENTS`, `setContactForceEventThreshold`), carve a small sphere at the contact point, scaled by force.

---

## 7. Testing strategy for an agent-built 3D game in a headless container

### 7.1 Architecture that makes testing possible

1. **Separate the simulation from rendering.** Put `sim/` (pure TS: voxel grids, carving, connectivity, fire, Rapier world, game rules) apart from `render/` (three.js) and `app/` (input, UI, audio). `sim/` must run in Node with no DOM.
2. **Fixed timestep and seeded RNG** (e.g. mulberry32). No `Math.random()` and no `Date.now()` inside `sim/`.
3. **An input-command log.** Every player action is a command `{tick, type, args}`. A replay is a seed plus commands, which also enables Teardown-style deterministic sync ([80.lv](https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech)).
4. **A debug hook** on `window.__game`: `{ tick, stepN(n), state(), exec(cmd), stats() }`, so Playwright can drive the game deterministically.

### 7.2 Test layers

| Layer | Tooling | Examples |
|---|---|---|
| Unit (fast, in Node) | Vitest | Mesher: quad count on known shapes, no faces between solid neighbors, watertight on random grids. Carving removes exactly the expected voxels. Labeling counts components on handcrafted grids. Greedy boxes cover every solid voxel exactly once (property test). Fire spreads only into flammable material. `.vox` loader round-trips. |
| Simulation (in Node, with Rapier WASM) | Vitest + `@dimforge/rapier3d-compat` | "Cut all four pillars, step 300 ticks: the roof body's y drops by more than 2 m." "Explosion near a wall yields ≥ 1 new body and debris < cap." Golden hash of all body transforms after a replay. My test showed exact repeatability across runs. Use `rapier3d-deterministic-compat` if hashes must match across machines. |
| Performance budgets (in Node) | Vitest bench / `performance.now()` | Physics step with 300 debris < 8 ms. Meshing one 32³ chunk < 1 ms. Connectivity on a 64³ object < 15 ms. Fail CI on a > 30% regression versus the stored baseline. CI timings are noisy, so use medians of 5 runs. |
| Browser smoke | Playwright + SwiftShader | Page loads with no console errors and no WebGL shader compile errors (hook `console` and `pageerror`). The canvas is non-blank. A 320×180 screenshot after N fixed ticks compared with `pixelmatch@8.0.0` at a tolerance of about 1–2% of pixels. Keyboard and mouse inputs move the camera (`state()` changes). |
| Visual review | Playwright screenshots saved as artifacts | Agents look at the screenshots, for example through the Read tool on PNGs, to judge visuals. |

### 7.3 Playwright config sketch

```ts
// playwright.config.ts
export default defineConfig({
  use: {
    viewport: { width: 640, height: 360 },
    launchOptions: {
      executablePath: process.env.CHROME_PATH,        // /usr/bin/google-chrome here
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader',
             '--enable-unsafe-webgpu',               // only if testing WebGPU paths
             '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: { command: 'npx vite preview --port 4173', url: 'http://localhost:4173' }, // localhost = secure context
});
// test
await page.goto('/?test=1&seed=42&scene=testbox');
await page.evaluate(() => window.__game.stepN(120));   // don't rely on rAF timing
const shot = await page.locator('canvas').screenshot();
```

Details:
- Create the WebGL context with `preserveDrawingBuffer: true` in test mode, or render on demand and screenshot right after a render.
- With `?test=1`, the app should **not** auto-run `requestAnimationFrame`; the test calls `stepN` and `renderOnce`.
- Playwright's `page.clock` can also freeze time.

---

## 8. Assets without artists

### 8.1 Procedural voxel buildings (primary approach)

Write a generator library in `sim/gen/` that emits voxel objects.

- **Primitives:** `box(x0,y0,z0,x1,y1,z1,mat)`, `hollowBox(..., wallThickness)`, `cylinder`, `sphere`, `roof(gable|flat|hip)`, and `cut(box)` for doors and windows.
- **Building grammar:** lot → footprint (rectangle or L-shape) → floors (2.8–3.2 m = 28–32 voxels) → per floor:
  - outer walls 2 voxels thick (20 cm), in brick, plaster, or wood
  - window openings on a facade grid, with glass panes 1 voxel thick
  - interior partitions in plaster
  - concrete or wood floor slabs 2–3 voxels thick
  - concrete pillars for big buildings
  - stairs
  - roof
- **Props from code:** tables, chairs, shelves, cars (a voxel body plus four wheels), barrels (explosive), trees (trunk + foliage blobs, flammable), fences, and street lamps.
- **Variation and materials:** seeded RNG per lot. Bake per-voxel color noise (±5% brightness) into the palette index, for example 4 shades per material, to get Teardown-like texture with no textures.
- **Size reference:** a 10 × 8 × 10 m two-storey house is 100×80×100 = 800k cells, about 150k solid voxels with walls. It fits easily in a `Uint8Array`. Split anchored world buildings into 32³ chunks for meshing and colliders.

### 8.2 MagicaVoxel `.vox`

- **three.js r187 `VOXLoader`** (`three/addons/loaders/VOXLoader.js`) parses SIZE/XYZI/RGBA chunks **and the scene graph (nTRN, nGRP, nSHP)**. It exports `buildMesh(chunk)` (greedy, per color) and `buildData3DTexture(chunk)` [MEASURED by reading the r187 source]. Its mesher is about 50–100× slower than a binary mesher, so use it only for loading, then convert to your own grid format.
- **`vox-reader@4.0.1`**: MIT, TypeScript types ([npm](https://www.npmjs.com/package/vox-reader), repo FlorianFe/vox-reader.js).
- **`parse-magica-voxel@2.1.2`**: GPLv3 ([GitHub](https://www.github.com/kevzettler/parse-magica-voxel)). **Avoid it because of the copyleft license.**
- **Format spec:** [ephtracy/voxel-model](https://github.com/ephtracy/voxel-model).
- **Size limit:** a single `.vox` model is at most 256³ per model (the XYZI coordinates are bytes). Larger scenes use multiple models via nTRN transforms.

### 8.3 Free voxel assets (verify the license of every item)

- OpenGameArt CC0 packs ([search results](https://opengameart.org/content/voxel-buildings)): "Voxel Buildings" (CC0, .vox + .obj), "55 voxel creatures" (CC0), "Voxel creature pack1" (CC0), "Modular bathroom voxel art" (CC0), and the "Medieval Theme Voxels" pack of 363 models. That pack's listing says CC0, but a commenter reported that the license inside the archive differs.
- [enkisoftware/voxel-models](https://www.github.com/enkisoftware/voxel-models): mixed CC0 and CC-BY, licensed per asset.
- **Caveat:** most hobby `.vox` assets are not at 10 cm scale; characters are often 30–60 voxels tall. Rescale, or use them as props only.
- Teardown's own assets are proprietary. Do not use them.

### 8.4 Audio

- **Procedural (recommended for v1; deterministic and no licensing risk):**
  - `jsfxr@1.4.1` has an `explosion` preset: `sfxr.generate('explosion', {...})` ([jsfxr](https://github.com/chr15m/jsfxr)).
  - `zzfx@1.4.0` (MIT, under 1 KB) generates sounds from 20-parameter arrays ([npm](https://npmjs.com/package/zzfx)).
  - Plain WebAudio graphs for continuous sounds:
    - explosion: a white-noise buffer → lowpass filter sweeping 2 kHz→200 Hz → gain envelope (5 ms attack, 1–2 s exponential decay), layered with a sine thump at 50–60 Hz
    - debris clatter: short filtered noise bursts triggered by contact-force events, with pitch set by material
    - fire: looping brown noise with random crackle impulses
    - engine: a sawtooth/square oscillator with pitch following RPM, through a lowpass filter
  - The `AudioContext` needs a user gesture in real browsers. For tests, use `--autoplay-policy=no-user-gesture-required`, or simply assert that the audio graph was created.
- **CC0 samples:** OpenGameArt CC0 explosion and combat packs ([soundpack 03](https://opengameart.org/content/soundpack-03), [qubodup CC0 audio](https://opengameart.org/content/qubodup-audio-cc0)) and itch.io's CC0 sound-effects tag. Kenney packs are widely known to be CC0 [UNCONFIRMED in this search]. Royalty-free packs such as Sonniss or JDSherbert are *not* CC0, so read their license files.

---

## 9. Native options (for completeness)

| Option | Pros | Cons for this project |
|---|---|---|
| Rust + Bevy + bevy_rapier / parry `Voxels` | Native speed, same Rapier voxel shapes (rapier3d 0.32 re-exports `Voxels` from parry) | GPU rendering untestable here (wgpu would need lavapipe/llvmpipe, [UNCONFIRMED] availability). The web build (wasm + WebGPU/WebGL2) is heavier, iteration is slower, and Bevy API churn hurts agents. |
| Rust → WASM core + three.js renderer | Fast meshing and connectivity in WASM (e.g. the `binary-greedy-meshing` crate, Rust ≥ 0.5 API) | Adds a build toolchain (wasm-pack). JS is already fast enough per my measurements, so defer until profiling shows a need. |
| Godot 4 web export | Editor and tools | Godot voxel plugins (Zylann's godot_voxel) need custom engine builds. Agents can't use an editor GUI. |
| Unity / Unreal | Mature | Not usable from a headless Linux container for builds. Licensing. |

**Verdict:** TypeScript + three.js + Rapier WASM is the best fit. If profiling later demands it, move meshing and connectivity into a Rust WASM worker.

---

## 10. Suggested module layout and build order

```
src/
  sim/voxel/grid.ts        // dense grid, chunk map, indexing, material table
  sim/voxel/mesher.ts      // binary greedy mesher (32^3, 1-voxel border), pure function -> packed Uint32Array
  sim/voxel/carve.ts       // sphere/box/ray carving with hardness tiers
  sim/voxel/connectivity.ts// BFS labeling + race-BFS + anchoring + support-distance
  sim/voxel/boxes.ts       // greedy box decomposition
  sim/physics/world.ts     // Rapier init, fixed step, body<->object mapping, voxel colliders, freeze/cleanup
  sim/fx/fire.ts           // sparse CA, seeded
  sim/fx/explosion.ts
  sim/vehicle.ts           // DynamicRayCastVehicleController wrapper
  sim/gen/buildings.ts     // procedural generator
  render/                  // three.js: chunk meshes, materials (packed vertex shader), particles, camera
  audio/                   // WebAudio synth + sample loader
  app/                     // input, HUD, tools (hammer, gun, bomb, vehicle), test hooks
test/                      // vitest unit + sim tests, playwright e2e
```

Build order, with each step testable before moving on:
1. Grid + mesher + render of a static generated house.
2. Rapier static voxel colliders + player character controller.
3. Carving + collider updates + chunk remesh.
4. Connectivity + splitting into dynamic voxel bodies.
5. Explosions + debris budget and freeze.
6. Support-distance collapse.
7. Fire CA + smoke.
8. Vehicles.
9. Audio.
10. Polish: AO, shadows, postprocessing.

---

## Sources

- Acko.net, Teardown Frame Teardown: https://acko.net/blog/teardown-frame-teardown/
- SE Daily Teardown interview transcript (10 cm voxels, custom engine): https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt
- Voxagon (Dennis Gustafsson), 2024 year summary: https://blog.voxagon.se/2024/12/29/year-summary.html
- 80.lv, Teardown multiplayer and destruction tech: https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech
- 80.lv, structural integrity prototype: https://80.lv/articles/this-real-time-voxel-building-demolition-is-so-satisfying/
- Teardown modding API (MakeHole, Explosion, fire): https://teardowngame.com/modding/api.html
- PC Gamer Teardown review: https://www.pcgamer.com/au/teardown-review/
- GMTK, How Games Do Destruction: https://gmtk.substack.com/p/how-games-do-destruction
- cgerikj/binary-greedy-meshing: https://github.com/cgerikj/binary-greedy-meshing ; Rust crate README: https://docs.rs/crate/binary-greedy-meshing/0.5.2/source/README.md
- rapier.js CHANGELOG: https://raw.githubusercontent.com/dimforge/rapier.js/master/CHANGELOG.md ; Voxels class: https://rapier.rs/javascript3d/classes/Voxels.html ; ColliderDesc: https://rapier.rs/javascript3d/classes/ColliderDesc.html
- three.js examples (volume instancing, rapier vehicle): https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/webgl_volume_instancing.html , https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/physics_rapier_vehicle_controller.html
- Rapier Rust vehicle example: https://git.nea.moe/github/rapier.git/tree/examples3d/vehicle_controller3.rs?h=v0.22.0
- sbobyn/three-voxel-destruction: https://github.com/sbobyn/three-voxel-destruction ; three-avbd: https://github.com/sbobyn/three-avbd/wiki
- Douglas Dwyer Octo release repo: https://github.com/DouglasDwyer/octo-release
- Chrome headless GPU testing blog: https://developer.chrome.com/blog/supercharge-web-ai-testing
- Chromium SwiftShader doc: https://chromium.googlesource.com/chromium/src/+/da170c2267b2201954efe1c8fa5d2d89ab09f7bf/docs/gpu/swiftshader.md
- Blink-dev Intent to Remove SwiftShader fallback: https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM
- chromedp note on Chromium 139 opt-in: https://chromium.googlesource.com/external/github.com/chromedp/chromedp/+/refs/tags/v0.14.1
- web.dev WebGPU browser support: https://web.dev/blog/webgpu-supported-major-browsers
- legalian voxel continuity: https://legalian.github.io/voxel/2018/03/19/voxel-continuity-algorithm.html
- Domaradzki, WSCG 2016 SVO fracture: https://dspace5old.zcu.cz/bitstream/11025/29529/1/Domaradzki.pdf
- Roblox devforum, Teardown-like destruction: https://devforum.roblox.com/t/how-do-i-make-proper-voxel-destruction-physics-like-teardown/1676135
- vox-reader: https://www.npmjs.com/package/vox-reader ; parse-magica-voxel: https://www.github.com/kevzettler/parse-magica-voxel
- OpenGameArt voxel buildings (CC0): https://opengameart.org/content/voxel-buildings ; enkisoftware/voxel-models: https://www.github.com/enkisoftware/voxel-models
- jsfxr: https://github.com/chr15m/jsfxr ; ZzFX: https://npmjs.com/package/zzfx
- OpenGameArt CC0 audio: https://opengameart.org/content/soundpack-03 , https://opengameart.org/content/qubodup-audio-cc0
