# 08 — Getting a Teardown-like look in WebGL2 (three.js r187)

Research and hands-on prototypes, 2026-11-24. Everything marked **[MEASURED]** or **[TESTED]** was run in this container: three@0.187.0, Chromium 158 via Playwright 1.63, WebGL2 on SwiftShader (software rendering, so only relative timings mean anything). Prototype source to reuse: published next to this file on the research artifact under `lookproto/` (fetch with Artifact read, e.g. paths `lookproto/src/trace.glsl.js`, `lookproto/src/volumes.js`, `lookproto/src/voxelMaterial.js`, `lookproto/src/mesher.js`, `lookproto/src/world.js`, `lookproto/src/main.js`, `lookproto/test_dda.mjs`, `lookproto/bench.mjs`; HTML files are published with a `.txt` suffix, e.g. `lookproto/test_dda.html.txt`; screenshots: `lookproto/shots/compare_close.png`, `A_overview.png`, `Adyn_close.png`, `Afull_overview_acc32.png`). Paths below are relative to `lookproto/`. Reimplement in your own project (TypeScript) rather than copying blindly.

## 0. TL;DR recommendation

**Build option A, the hybrid.** It is robust, verified working in r187, and gets the look most of the way:

1. **Geometry:** keep the planned chunked greedy meshes, rasterized by three.js. Merge quads **on material only** and do not bake AO into the mesh. Without an AO key there are 2.1× fewer quads (9,469 vs 20,078 on the test town) **[MEASURED]**.
2. **World occupancy volume:** a **bit-packed `R8UI` `Data3DTexture`**, where one byte holds a 2×2×2 voxel brick, so 1 bit per voxel. Add a **4³-coarse `R8` density `Data3DTexture` with mipmaps**. Keep CPU mirrors of both and update them with `texSubImage3D` sub-boxes after destruction.
3. **Material:** use **one `MeshLambertMaterial` patched with `onBeforeCompile`**. Do not write a custom ShaderMaterial. You keep three's lights, fog, tone mapping and colour management, and replace only two terms:
   - **Sun:** the `DirectionalLight` colour is multiplied by **1 ray per pixel** traced with a two-level DDA through the bit volume. This gives exact, voxel-accurate, noise-free **hard** shadows. Teardown's own midday `sunSpread` is 0, so hard shadows are on-style.
   - **Ambient (`indirectDiffuse`):** multiplied by **(a) per-pixel "face AO"** and **(b) "cone AO"**.
     - (a) is the classic voxel vertex-AO formula evaluated in the fragment shader from 8 volume fetches. It is smooth and decouples AO from greedy merging.
     - (b) is 5 cones marched through the mipmapped density volume, about 3–10 m reach. It is noise-free and makes **interiors dark and lit through windows and holes**, which is the main thing that reads as "Teardown".
4. **Dynamic debris** (rotated rigid bodies) stays out of the volume. Debris casts into a small, tight three.js shadow map that only debris renders into, and the world material multiplies both terms (preset `Adyn`, shown working). When a body goes to sleep, stamp it into the volume.
5. **Optional phase 2:** soft penumbrae (jittered sun ray) and stochastic ray AO. These look great when accumulated (screenshots below), but 1 spp is visibly dithered, so they need a TAA or reprojection resolve. Do not start with them.
6. **Fallback tier (B / `Low`):** a three.js `DirectionalLight` shadow map plus the same volume-based face AO, same mesh, same material with defines switched. It is cheap and robust, and every receiver gets a flat, uniformly lit interior.

**Option C**, Teardown's real per-object 3D-texture raymarching, stays out of scope for now (§6).

## 1. Screenshots (deviceScaleFactor 1, 640×360, SwiftShader)

All are in `lookproto/shots/`. Close-up camera: `&cx=9.5&cy=2.8&cz=-1.6&tx=5.5&ty=1.6&tz=3`.

| File | What |
|---|---|
| `compare_close.png` | 2×2 montage. B (shadow map + vertex AO) · A (traced sun + face AO + cone AO, 1 frame) · A+ (soft sun + ray AO, 32-frame accumulation) · soft sun at 1 spp (dithered) |
| `B_overview.png`, `B_close.png` | Baseline B: PCF 2048, radius 3, baked vertex AO |
| `B0_overview.png`, `B0_close.png` | Vertex AO only, no shadows |
| `A_overview.png`, `A_close.png` | **Recommended A**, noise-free single frame |
| `Alite_close.png` | A with 3.2 m cones (about 10% cheaper, nearly identical) |
| `Low_close.png` | Fallback tier: shadow map + volume face AO |
| `A_close_aodbg.png`, `B_close_aodbg.png` | Raw AO term (no tone mapping). A shows contact AO plus large-scale darkening inside and near walls; B shows contact only. |
| `Aface_close_aodbg.png`, `Aray_close_aodbg_1f.png` | Face AO only / 4-ray AO at 1 spp |
| `Asoft_close_1f.png`, `Asoft_*_acc32.png` | Soft sun (spread 0.06): 1 spp vs 32-frame accumulated |
| `Aray_*`, `Afull_*` | Ray AO (4 rays, 2.4 m) and "full" (soft sun + 2 AO rays + face AO), 1 spp and 32 accumulated |
| `A_close_blast.png`, `A_overview_blast.png`, `B_*_blast.png` | After runtime carving: volume sub-box upload plus re-mesh. A new sunlit patch appears on the interior floor through the new hole. |
| `Adyn_close.png`, `Bdyn_close.png` | Rotated debris: A world + debris-only shadow map; and B |
| `zoom_speckle.png` | T-junction crack sparkles (pitfall §8.1) |

Visual verdict, judged with Read on the PNGs:
- **A vs B, outdoors:** nearly identical. Both have crisp sun shadows; A's are voxel-exact.
- **Indoors:** clearly different. B interiors are evenly lit by the hemisphere light. In A they are dark, with sunlight patches and darker corners, which is much closer to Teardown.
- **A+ (accumulated soft shadows plus ray AO):** the nicest image, but it only works once temporal accumulation exists.

## 2. Measured numbers [MEASURED]

Frame time is in ms on SwiftShader (4 vCPU). Each figure is the min of 3×8 frames, synced by a 1-px `readPixels`. Scene: 256×96×256 voxels (6.3 M), 129 non-empty 32³ chunks. Only ratios matter.

| Preset | What | 320×180 | 640×360 |
|---|---|---|---|
| B0 | vertex AO, no shadows | 13.1 | 23.6 |
| **B** | shadow map 2048 PCF + vertex AO | **43.5–46.5** | **61.4** |
| B4k | shadow map 4096 | 76.6 | – |
| Low | shadow map 2048 + volume face AO | 42.8 | – |
| **A** | traced sun + face AO + cone AO (96 vox) | **113–132** | **363** |
| Alite | same, cones 32 vox | 104.6 | – |
| Anoao | traced sun only | 60.2 | 186.8 |
| Aface | traced sun + face AO | 70.0 | 200.4 |
| Anosun | face + cone AO only | 63.6 | 184.6 |
| Asoft | jittered sun (1 ray) + face + cone | 121.8 | – |
| Aray1 / Aray | 1 / 4 AO rays (24 vox), traced sun | 93.4 / 190.6 | – |
| Adyn | A + 1024 debris-only shadow map | 131.2 | – |
| A + depth prepass | `?pre=1` | 122.4 (no gain) | – |

Interpretation:
- **Traced cost scales with pixels.** A's per-pixel cost is about 1.5–1.75 µs/px in SwiftShader at both resolutions. Shadow-map cost scales with shadow-map texels.
- **Software ratios are not GPU ratios.** On SwiftShader A is 2.5× B at 320×180 and about 6× at 640×360. On real GPUs the per-pixel DDA is cheap ALU plus `texelFetch`. Teardown's 2018 prototype did all of AO, lights, fog and reflections in about 9 ms at 1080p on a GTX 1080 (see `02-engine-rendering.md`). **Real-GPU cost must be measured on target hardware.** Build it with the quality knobs in §7.
- **Cost breakdown (320×180):** the traced sun costs about +47 ms over B0, face AO about +10 ms, cone AO about +44 ms (the largest), and each extra stochastic AO ray about +30 ms.
- A depth prepass did not help: three already sorts opaque chunks front-to-back. Keep it as a switch to try on real GPUs.

Other measurements:
- **Quad counts:** the AO-keyed greedy mesh had 20,078 quads; the material-only greedy mesh had 9,469.
- **Volume build (JS, 6.3 M voxels):** 75–127 ms for bits + density + mips.
- **Runtime blast (sphere r=9–13 voxels):**
  - Volume CPU update + `texSubImage3D` (bits + 7 density mip levels): 1.6–9.7 ms, dominated by the naive JS recompute (`world.get` per voxel).
  - Prototype array mesher re-mesh: 18–58 ms. The real game uses the binary mesher (0.1–0.3 ms per chunk).
- **Big volume** (`test_bigvol.html`):
  - 1000×150×1000 `R8UI` (143 MiB): allocates OK; full upload 238 ms.
  - Ten 40³-texel `texSubImage3D` sub-box uploads (each = an 8 m explosion box): **0.8 ms total**.
  - 1024×128×1024: OK, 174 ms full upload.
  - 2000×300×2000 one-byte-per-voxel (1.14 GiB): **fails** with `GL_INVALID_OPERATION: glTexStorage3D: Texture total allocation size is too large`.
- **`MAX_3D_TEXTURE_SIZE`:** 2048 here. web3dsurvey reports ≥ 2048 on 100% of Windows, macOS, iOS, Android and Linux reports, and only 8% overall report ≥ 4096 (Android 51%, Linux 35%) — https://web3dsurvey.com/webgl2/parameters/MAX_3D_TEXTURE_SIZE. **Design for 2048 per axis.**

## 3. The tested GLSL (GLSL ES 3.00) [TESTED]

The full file is `lookproto/src/trace.glsl.js` (exports the string `TRACE_GLSL`).

**Validation:** `node test_dda.mjs` traces 65,536 random rays and compares them with the CPU reference `cpuTrace` in `src/world.js`. Rays start inside and outside the volume, include zero and axis-aligned components, and use tMax of 0–40 or 1000. The world is the test town plus 20k random voxels.
- **0 mismatches before an edit.**
- **0 mismatches after 3 sphere carves** uploaded with `texSubImage3D`.
- **Negative control** (edit without upload): 1,090 mismatches, which proves the check is sensitive.

```glsl
uniform highp usampler3D uBits;   // R8UI, ceil(N/2)^3, bit=(x&1)|(y&1)<<1|(z&1)<<2
uniform highp sampler3D uDens;    // R8 mipmapped, ceil(N/4)^3, >0 if any voxel in the 4^3 cell
uniform vec3 uVolSize;            // voxels
uniform vec3 uVolOrigin;          // world pos of voxel (0,0,0) min corner
uniform float uVoxelSize;         // 0.1
#define VX_COARSE 4
#ifndef VX_MAX_COARSE_STEPS
#define VX_MAX_COARSE_STEPS 256
#endif
bool vxSolid(ivec3 v) {
  uint b = texelFetch(uBits, v >> 1, 0).r;
  uint bit = uint((v.x & 1) | ((v.y & 1) << 1) | ((v.z & 1) << 2));
  return ((b >> bit) & 1u) != 0u;
}
// true if any solid voxel intersects ro + rd*t, t in [0,tMax] (voxel units)
bool vxTrace(vec3 ro, vec3 rd, float tMax) {
  vec3 srd = vec3(rd.x >= 0.0 ? max(rd.x, 1e-7) : min(rd.x, -1e-7),
                  rd.y >= 0.0 ? max(rd.y, 1e-7) : min(rd.y, -1e-7),
                  rd.z >= 0.0 ? max(rd.z, 1e-7) : min(rd.z, -1e-7));   // never divide by 0
  vec3 inv = 1.0 / srd;
  vec3 ta = (vec3(0.0) - ro) * inv, tb = (uVolSize - ro) * inv;
  vec3 tlo = min(ta, tb), thi = max(ta, tb);
  float tEnter = max(max(tlo.x, tlo.y), max(tlo.z, 0.0));
  float tExit  = min(min(thi.x, thi.y), min(thi.z, tMax));
  if (tEnter >= tExit) return false;
  ivec3 stp = ivec3(srd.x > 0.0 ? 1 : -1, srd.y > 0.0 ? 1 : -1, srd.z > 0.0 ? 1 : -1);
  vec3 ad = abs(inv);
  vec3 up = vec3(greaterThan(srd, vec3(0.0)));
  ivec3 vmax = ivec3(uVolSize) - 1;
  ivec3 cmax = vmax / VX_COARSE;
  float C = float(VX_COARSE);
  ivec3 c = clamp(ivec3(floor((ro + rd * tEnter) / C)), ivec3(0), cmax);
  vec3 tNextC = ((vec3(c) + up) * C - ro) * inv;
  vec3 tDeltaC = ad * C;
  float tCur = tEnter;
  for (int i = 0; i < VX_MAX_COARSE_STEPS; i++) {
    float tCellExit = min(min(tNextC.x, tNextC.y), min(tNextC.z, tExit));
    if (texelFetch(uDens, c, 0).r > 0.0) {             // coarse cell non-empty -> fine DDA inside it
      ivec3 lo = c * VX_COARSE, hi = min(lo + (VX_COARSE - 1), vmax);
      ivec3 v = clamp(ivec3(floor(ro + rd * tCur)), lo, hi);
      vec3 tN = ((vec3(v) + up) - ro) * inv;
      for (int j = 0; j < 3 * VX_COARSE; j++) {
        if (vxSolid(v)) return true;
        if (tN.x <= tN.y && tN.x <= tN.z) { if (tN.x >= tCellExit) break; v.x += stp.x; tN.x += ad.x; }
        else if (tN.y <= tN.z)            { if (tN.y >= tCellExit) break; v.y += stp.y; tN.y += ad.y; }
        else                              { if (tN.z >= tCellExit) break; v.z += stp.z; tN.z += ad.z; }
        if (any(lessThan(v, lo)) || any(greaterThan(v, hi))) break;
      }
    }
    if (tCellExit >= tExit) return false;
    tCur = tCellExit;
    if (tNextC.x <= tNextC.y && tNextC.x <= tNextC.z) { c.x += stp.x; tNextC.x += tDeltaC.x; }
    else if (tNextC.y <= tNextC.z) { c.y += stp.y; tNextC.y += tDeltaC.y; }
    else { c.z += stp.z; tNextC.z += tDeltaC.z; }
    if (any(lessThan(c, ivec3(0))) || any(greaterThan(c, cmax))) return false;
  }
  return false;
}
```

The same file also contains these functions:
- **`vxFaceAO(pv, n)`:** fetches the 8 neighbours in the empty layer in front of the face. It computes the 4 corner values with the classic `side1&&side2 ? 0 : 3-(s1+s2+c)` rule and interpolates bilinearly with `fract()` of the in-plane coordinates. Its output is continuous across voxels, and greedy quads of any size get correct per-voxel AO.
- **`vxConeAO(pv, n)`:** marches 5 cones (the normal plus 4 at 45°, weighted toward the sky) through `uDens` with `textureLod(uDens, p/(4*texSize), log2(diam/4))`. It accumulates opacity front to back, `occ += (1-occ)*clamp(dens*2.5)`, with up to 8 steps, until `VX_CONE_MAX` (96 voxels by default). The gain of 2.5 compensates for thin walls being diluted in the mips.
- **`vxRayAO(...)`:** N cosine-weighted rays seeded with animated interleaved-gradient noise. It needs accumulation.

Sun shadow in the material: `L_world = normalize((vec4(directionalLight.direction,0.0) * viewMatrix).xyz)`. Three's `directionalLight.direction` is in **view space**, and multiplying on the right by `viewMatrix` gives its inverse rotation. Then:
- return 0 if `dot(n, L) <= 0`;
- `o = pv + n*0.05`;
- `vxTrace(o, L, 2000.0)`.

## 4. three.js r187 integration recipe (exact APIs that worked)

### 4.1 Textures (`src/volumes.js`)

```js
const bitTex = new THREE.Data3DTexture(bits /*Uint8Array*/, bx, by, bz);
bitTex.format = THREE.RedIntegerFormat; bitTex.type = THREE.UnsignedByteType;
bitTex.internalFormat = 'R8UI';                        // (also auto-derived)
bitTex.minFilter = bitTex.magFilter = THREE.NearestFilter; // integer tex: MUST be Nearest, no mips
bitTex.generateMipmaps = false; bitTex.unpackAlignment = 1; bitTex.needsUpdate = true;

const densTex = new THREE.Data3DTexture(dens, cx, cy, cz);
densTex.format = THREE.RedFormat; densTex.type = THREE.UnsignedByteType;   // R8
densTex.minFilter = THREE.LinearMipmapLinearFilter; densTex.magFilter = THREE.LinearFilter;
densTex.generateMipmaps = true;   // three: texStorage3D(levels = log2(max(w,h))+1) + gl.generateMipmap once
densTex.unpackAlignment = 1; densTex.needsUpdate = true;
```

- Uniforms are plain `{ value: tex }`.
- Three's `ShaderMaterial` and `onBeforeCompile` prefix already declares `precision highp usampler3D; sampler3D; ...`, so the sampler declarations compile without extra work. `RawShaderMaterial` does not add this prefix.
- Use `glslVersion: THREE.GLSL3` only for a standalone `ShaderMaterial`, as in `test_dda.html`. Built-in materials patched with `onBeforeCompile` are already GLSL 3.00 under WebGL2.

### 4.2 Material (`src/voxelMaterial.js`)

Start from `MeshLambertMaterial` and patch it in `onBeforeCompile`. Every replace goes through `mustReplace()`, which throws if the chunk string is missing, so a three upgrade fails loudly instead of silently dropping shadows.

| Shader | Replace | With |
|---|---|---|
| Vertex | `#include <common>` | add `attribute float mat, aoBake;` and the varyings |
| Vertex | `#include <project_vertex>` | append `vWPos = (modelMatrix*vec4(transformed,1.0)).xyz; vWNrm = normalize(mat3(modelMatrix)*objectNormal);` |
| Fragment | `#include <common>` | append varyings, palette uniform and `TRACE_GLSL` |
| Fragment | `#include <lights_fragment_begin>` | **first** inline it with `THREE.ShaderChunk.lights_fragment_begin`, because the include is unresolved inside `onBeforeCompile` |
| Fragment (after inlining) | `getDirectionalLightInfo( directionalLight, directLight );` | append `directLight.color *= vxSunShadow( directionalLight.direction );` |
| Fragment | `#include <color_fragment>` | palette albedo (`uniform vec3 uPalette[16]`, colours built with `Color.setRGB(r,g,b,SRGBColorSpace)`) × per-voxel hash from `floor(pv - n*0.5)` |
| Fragment | `#include <aomap_fragment>` | `reflectedLight.indirectDiffuse *= mix(1.0, 0.25+0.75*ao, uAOStrength);` |

Two more settings:
- Set `material.customProgramCacheKey = () => 'vx-'+mode+JSON.stringify(defines)`, and switch features with `material.defines`.
- Store the uniforms object on `material.userData.uniforms` and `Object.assign(shader.uniforms, uniforms)` inside `onBeforeCompile`, so you can update them later (for example `uFrame`).

Mesh setup:
- Geometry: `position` is Float32 in voxel units, `normal` is Int8 non-normalized, plus `mat` (Uint8) and `aoBake` (Float32, B only).
- Use `mesh.scale.setScalar(0.1)`.
- Set a manual `boundingBox` and `boundingSphere` per chunk.

### 4.3 Debris shadows combined with traced world shadows (`Adyn`)

- Set `renderer.shadowMap.enabled = true` with `PCFShadowMap`.
- Set `castShadow = false` on world chunks, `receiveShadow = true` everywhere, and `castShadow = true` on debris.
- Fit a tight ortho frustum, about ±6 m, around the player or action.

Three's `getShadow()` line and the injected traced line both multiply `directLight.color`, so the two kinds of shadow combine with no extra code. Debris should also use the patched material so it receives traced world shadows. That is safe because debris is not in the volume, so it cannot self-shadow.

### 4.4 Shadow-map baseline (B) in r187

- **`PCFSoftShadowMap` is removed in r187.** `WebGLShadowMap` warns and falls back to `PCFShadowMap`, which now uses a 5-tap Vogel disk rotated by interleaved gradient noise with hardware PCF. Use `PCFShadowMap` and `light.shadow.radius` (3 was used here) to soften.
- Settings used: `bias = -0.0005`, `normalBias = 0.02`, ortho ±19 m for a 25.6 m world.
- A 200 m map would need cascades: `three/addons/csm/CSM.js` or a camera-following frustum.

### 4.5 Temporal accumulation used for the screenshots (`src/main.js`)

- Render the scene into a `HalfFloatType` `WebGLRenderTarget`, which is linear because three does not tone-map into render targets.
- Blend into a ping-pong target with `mix(prev, cur, 1/(n+1))`.
- Output with a fullscreen `ShaderMaterial` containing `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`.

This only works with a static camera. A real game needs reprojection TAA (see §7).

## 5. Data-update recipe after destruction [TESTED]

Three r187 cannot partially update a `Data3DTexture`:
- `texture.updateRanges` is honoured only for 2D `DataTexture`s. `WebGLTextures.updateTexture` hard-codes `texSubImage2D` and RGBA.
- `needsUpdate` re-uploads the whole volume: 61–131 ms for 143 MiB in SwiftShader.
- `addLayerUpdate` exists only on `DataArrayTexture`.

So use raw GL through three's state cache:

```js
function uploadSubBox(renderer, tex, data, size, x0,y0,z0, x1,y1,z1, glFormat /*gl.RED_INTEGER|gl.RED*/, level = 0) {
  const gl = renderer.getContext();
  const props = renderer.properties.get(tex);
  if (!props.__webglTexture) renderer.initTexture(tex);          // allocate first
  const st = renderer.state;
  st.activeTexture(gl.TEXTURE0);
  st.bindTexture(gl.TEXTURE_3D, props.__webglTexture);           // keeps three's binding cache coherent
  st.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  st.pixelStorei(gl.UNPACK_ROW_LENGTH, size[0]);                  // read the sub-box straight out of
  st.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, size[1]);                // the full CPU mirror: no copy
  st.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
  st.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
  st.pixelStorei(gl.UNPACK_SKIP_IMAGES, z0);
  gl.texSubImage3D(gl.TEXTURE_3D, level, x0,y0,z0, x1-x0,y1-y0,z1-z0, glFormat, gl.UNSIGNED_BYTE, data);
  for (const p of [gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES]) st.pixelStorei(p, 0);
}
```

Use `state.pixelStorei`, not `gl.pixelStorei`. Three caches these values, and its own uploads only re-set `UNPACK_ALIGNMENT`, `FLIP_Y` and `PREMULTIPLY_ALPHA`, so a stray `UNPACK_ROW_LENGTH` or `SKIP_*` would corrupt the next three upload.

Per edit, carving the voxel box `[x0,x1)…`, see `updateVolumesRegion` in `src/volumes.js`:
1. **Bits:** recompute bricks `[x0>>1, (x1+1)>>1)` per axis and upload them as one sub-box with `RED_INTEGER`.
2. **Density level 0:** recompute cells `[floor(x0/4), ceil(x1/4))` and upload with `RED`.
3. **Density mips:** for each level k, the box becomes `[a>>1, min(size_k, (b+1)>>1))`. Box-filter from level k-1 on the CPU (`updateDensityMipsRegion` in `src/world.js`) and upload with `level = k`. Level sizes follow GL NPOT rules, `max(1, size>>k)`.
4. Batch all edits in a frame into a union box, or a few boxes, and upload once per frame. Teardown clusters simultaneous updates the same way.

The DDA test proved that GPU results equal the CPU world after these uploads (§3).

## 6. Option C (per-object raymarch, Teardown proper): recap

Teardown's per-object 3D textures (palette indices plus mips) are raymarched in a G-buffer pass. A world 1-bit shadow volume carries the secondary rays: AO, soft sun, area lights and reflections, all 1–2 spp and denoised (details in `02-engine-rendering.md`).

| Pros | Cons for us |
|---|---|
| Exact voxels on rotated objects, no meshing, cheap edits | Custom G-buffer, depth output for three.js compositing, custom picking and debug |
| | Stochastic lighting forces a denoiser + TAA stack |
| | Most fragile path for AI agents |
| | WebGL2 has no compute shaders |

Option A already reuses the "world occupancy volume" half of Teardown's design, so C can be added later for dynamic bodies without changing the lighting.

## 7. Quality and performance knobs to build in (real-GPU unknowns)

- **`VX_CONE_AO` on/off and `VX_CONE_MAX`:** cones are the biggest cost. Use 32 voxels for low, 96 for high.
- **Sun ray length:** pass `tMax` as about 300–400 voxels instead of 2000 (Teardown has `sunLength`). Optionally cap `VX_MAX_COARSE_STEPS`.
- **`renderer.setPixelRatio(0.75)`** or dynamic resolution. Traced cost is linear in pixels.
- **Tiers:**
  - Low = shadow map + face AO.
  - Medium = traced sun + face AO.
  - High = + cone AO.
  - Ultra = + soft sun / ray AO with TAA.
- **For big maps, add a third DDA level:** a 16³ mip of occupancy, or a 2D "max solid height" map, so sun rays leave empty sky in a few steps.
- **Phase-2 TAA requirements:**
  - motion vectors from depth, valid because the world is static;
  - neighbourhood clamping, plus rejection on disocclusion;
  - ideally accumulate only the noisy visibility terms (demodulated);
  - invalidate history where destruction happened.

  That is a sizeable job, which is why it is not the default.

## 8. Pitfalls found

1. **T-junction cracks in greedy meshes.** Single background-coloured pixels sparkle on the ground in both A and B (`zoom_speckle.png`). Counted isolated background pixels at inflate 0, 0.002 and 0.01 voxel: 60 → 41 → 12 (`count_cracks.py`). The remaining 12 sat on stair-stepped roof edges and around the window/hole openings, which look like legitimate background showing through rather than cracks.
   - **Fix:** grow each quad by 0.01 voxel (1 mm) in-plane only. This is the `inflate` argument of `meshChunk`, default 0.01 in `main.js`.
2. **Integer 3D textures need `NearestFilter` and no mips**, or they are incomplete and read 0. Sample them with `texelFetch` only.
3. **Three mip allocation for 3D textures** uses `log2(max(width, height)) + 1` and ignores depth (`getMipLevels`). Compute your CPU mip count the same way, `floor(log2(max(w,h)))+1`. Three never uploads `texture.mipmaps` for `Data3DTexture`; it only runs `generateMipmap` once, so later mip updates must be your own `texSubImage3D` per level.
4. **`directionalLight.direction` is view-space** inside three's light loop. Convert it with `(vec4(d,0)*viewMatrix).xyz`.
5. **Ray origin:** use `surface + n*0.05` voxels. Faces sit exactly on integer planes; 0.05 is far above float error even at 2000 voxels (ULP about 1e-4).
6. **Divide-by-zero in a DDA:** GLSL ES 3.00 does not guarantee IEEE inf, so clamp direction components to ±1e-7 with a sign-preserving select.
7. **Backticks inside a GLSL template literal** break the JS module. One cost a debug cycle here.
8. **`onBeforeCompile` cannot see inside `#include`d chunks.** Inline `lights_fragment_begin` first. Always assert that the replace hit, because a silent miss leaves shadows simply missing.
9. **Accumulation and post pipelines change tone mapping.** Rendering into a render target skips tone mapping, so the output pass must include `tonemapping_fragment` and `colorspace_fragment`, and `scene.background` then gets tone-mapped (visibly lighter sky in the `acc32` shots).
10. **Volume quantisation:** rotated debris stamped into the axis-aligned volume self-shadows in stair-steps (Teardown has the same artifact). Do not stamp moving bodies; stamp them once they sleep, and give the moving ones the debris shadow map.
11. **A dense 1 byte/voxel volume does not fit** a 200 m map (allocation refused). Bit-pack it.
12. **`PCFSoftShadowMap`** silently degrades to PCF in r187 (warning only).
13. **Depth prepass** gave no gain in SwiftShader (front-to-back sorting already works). Do not assume it helps; measure on a GPU.

## 9. Memory math

| Map (voxels) | Bit volume, 2×2×2 per byte (R8UI) | 1 B/voxel R8 | Density 4³ R8 + mips (×8/7) | Axis limit OK at 2048? |
|---|---|---|---|---|
| 2000×300×2000 (200×30×200 m), 1.2 G voxels | **1000×150×1000 = 150 MB (143 MiB)**, allocates OK [MEASURED] | 1.2 GB, **refused** [MEASURED] | 500×75×500 = 18.75 MB → ~21.4 MB | yes (1000) |
| 1024×256×1024 (102×25.6×102 m) | 512×128×512 = 32 MiB | 256 MiB | 4 MiB → 4.6 MiB | yes |
| 4096×256×4096 (Teardown-scale 410 m) | 2048×128×2048 = 512 MiB | – | 32 MiB | exactly at 2048 |
| 2000×300×2000 coarsened to 20 cm bits | 500×75×500 = 18.75 MB | – | – | yes |

Notes on the table:
- **CPU mirrors:** add the same amount again in JS typed arrays.
- **Maximum level size:** with 2×2×2 packing, the 2048 limit gives **4096 voxels = 409.6 m** per axis. This is exactly Teardown's "~4000 voxels" limit.
- **20 cm coarsening** saves 8× but leaks light at contacts. The coarse cell containing the surface must be skipped, so contact shadows lag by up to 20 cm and thin (10 cm) walls become fat. Not recommended at 10 cm voxels.
- **Advice:** target ≤ about 64 MiB of volume for broad compatibility (integrated and mobile GPUs) [UNCONFIRMED; no hard browser number found]. For example, use 1024×256×1024, or 2000×300×2000 only on desktop. The scalable alternative is a sparse brick atlas plus an indirection texture, which is more code and not prototyped here.

## 10. Files in `lookproto/`

| Path | Role |
|---|---|
| `src/world.js` | Test town, carving, bit/density/mip builders and sub-region updaters, CPU reference DDA |
| `src/mesher.js` | Greedy mesher (array based, prototype only): AO-keyed or material-only, `inflate` |
| `src/trace.glsl.js` | `TRACE_GLSL`: `vxTrace`, `vxFaceAO`, `vxConeAO`, `vxRayAO`, noise |
| `src/volumes.js` | three r187 `Data3DTexture` setup, `uploadSubBox`, `updateVolumesRegion`, `volumeUniforms` |
| `src/voxelMaterial.js` | Lambert + `onBeforeCompile` patches for A, B and Low |
| `src/main.js` | Presets (`?mode=B0,B,B4k,Low,A,Alite,Anoao,Aface,Anosun,Adyn,Bdyn,Asoft,Aray,Aray1,Afull&w=&h=&pre=1&dbg=ao&inflate=`), accumulation, `window.api` (`render`, `bench`, `blast`, `setCamera`) |
| `server.mjs`, `shoot.mjs`, `bench.mjs` | Static server, screenshot runner (`BLAST=x,y,z,r` env), benchmark |
| `test_dda.html` / `.mjs` | GLSL-vs-CPU DDA validation with an edit and a negative control |
| `test_bigvol.html` / `.mjs` | Large-volume allocation and upload timing |
| `count_cracks.py` | T-junction crack counter |

How to run (from `lookproto/`):
- `node test_dda.mjs`
- `node bench.mjs 320 180 B,A`
- `SHOT=name node shoot.mjs A 640 360 1 '&cx=..'`

Sources:
- https://web3dsurvey.com/webgl2/parameters/MAX_3D_TEXTURE_SIZE: 3D texture size distribution.
- https://threejs.org/docs/pages/VXGIVolume.html: three r187 ships a `VXGIVolume` voxel-cone-tracing addon, but it is **WebGPURenderer-only**, so it is not usable for a WebGL2 build. Its mip-chained occupancy layout matches the approach here.
- Teardown facts (sunSpread 0 at midday, 1–2 spp, shadow-volume CPU updates via glTexSubImage3D, ~4000-voxel limit) come from `02-engine-rendering.md` in this research folder.
- three.js r187 source read locally: `WebGLTextures.js` (`updateTexture` 2D-only `updateRanges`, `getMipLevels`, 3D upload path), `WebGLShadowMap.js` (`PCFSoftShadowMap` removal), `shadowmap_pars_fragment` (Vogel PCF), `WebGLState.js` (`pixelStorei` cache).
