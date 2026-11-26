# 13 — Lighting, atmosphere and game feel: what still separates us from the genre reference

Research date 2026-11-26. This builds on `02-engine-rendering.md` (the reference's pipeline), `08-lighting-look.md`
(our traced sun / AO prototype), `09-voxels-deep-dive.md` (voxel surface look) and `06-ai-audio-art-feel.md` (feel, audio).
It does not repeat those. It answers one question: **with traced sun, face/cone AO, TAA and bloom already in, what
makes Teardown still look and feel different from Wrecking Shift (WS), and what do we build next?**
We match the *qualities* (contrast, air, smoke, weight), not assets, code, names or exact numbers.

Tags: **[SRC]** primary or strong secondary source · **[RE]** reverse-engineered by a third party · **[OBS]** from
watching the reference or our screenshots · **[INF]** our inference · **[CODE]** read from our source.

## 1. Sources

1. acko.net, "Teardown Frame Teardown" (Steven Wittens): https://acko.net/blog/teardown-frame-teardown/ [RE]
2. J. D. Montoya, "Teardown breakdown": https://juandiegomontoya.github.io/teardown_breakdown.html [RE]
3. D. Gustafsson, "From screen space to voxel space" (2018): https://blog.voxagon.se/2018/10/17/from-screen-space-to-voxel-space.html [SRC]
4. D. Gustafsson, "Bokeh depth of field in a single pass" (2018): https://blog.voxagon.se/2018/05/04/bokeh-depth-of-field-in-single-pass.html [SRC]
5. D. Gustafsson, "The importance of good noise" (2018): https://blog.voxagon.se/2018/12/07/the-importance-of-good-noise.html [SRC]
6. Official modding API v2.x: https://teardowngame.com/modding/api.html (`ShakeCamera`, `SetCameraFov` "horizontal field of
   view", `SetCameraDof`, `SetToolTransform(..., sway)`, `PointLight`, `Explosion(pos, 0.5..4)`, `SetTimeScale`
   "experimental", particle API with `ParticleEmissive/Stretch/Sticky/Drag/Collide`, `SetPostProcessingProperty`
   saturation / colorbalance / brightness / gamma / bloom) [SRC]
7. PCGH "Teardown im Technik-Test", p. 3–4: https://www.pcgameshardware.de/Teardown-Spiel-73677/Specials/PC-Game-Test-Benchmark-Voxel-Dynamic-Destruction-1394545/3/
   (cost scales with ray length, resolution and march step; light jittered over a sphere for soft shadows; volumetrics
   are ray-marched and noisy) [SRC via interview]
8. TechRadar, "Ray tracing is so crucial to Teardown…": https://www.techradar.com/gaming/consoles-pc/ray-tracing-is-so-crucial-to-teardown-that-the-world-goes-black-if-you-turn-it-off
   and "Teardown dev's top priority is always physics…": https://techradar.com/gaming/consoles-pc/teardown-devs-top-priority-is-always-physics-the-game-can-come-later
   (smoke/extinguisher sim "way more advanced than it would have needed") [SRC]
9. PC Gamer review and feature: https://www.pcgamer.com/teardown-review/ , https://www.pcgamer.com/theres-nothing-quite-like-tearing-things-down-in-teardown
   ("the lighting and shadows make the blocky world feel really solid"; storm scene with "dappled reflections" on wet
   furniture; rainy night map "akin to a survival horror game") [SRC, press]
10. Kotaku on the 0.7 smoke rework (Gustafsson tweet, Mar 2021): https://kotaku.com/some-good-ass-video-game-smoke-1846507147 [SRC via press]
11. Douglas Holmquist, audio write-up: https://www.tonalitet.com/project/teardown/ [SRC] (already summarised in `06`)
12. Our code: `src/render/{renderer,post,worldMaterial,sky,fireFx,particles,toolFx,lamps}.ts`, `src/game/{game,uiModule,
    atmosModule,weatherModule}.ts`, `src/audio/*` [CODE]; screenshots `tests/e2e/out/{pc-city-*,pc-harbor-*,look-*,
    f3-explosion-*,modes-17-*}.png` [OBS]

Not found despite searching: an official per-tier breakdown of "render quality", Digital Foundry coverage, and any
statement about which base-game events shake the camera or by how much. Feel numbers below are therefore [OBS]/[INF].

## 2. What the reference does that we do not (new findings beyond 02/08/09)

**Image formation [RE 1,2]**
- Tone map `1 − exp(−c)` after exposure, then saturation + colour balance + gamma, all per level / scriptable [SRC 6].
  This curve keeps saturated midtones and rolls highlights to a soft white; AgX (ours) desaturates on purpose.
- **Auto-exposure**: luminance at 256², mip 6 (4×4) sampled 5× in an X weighted to the centre, target =
  `brightness / lum`, eased with α = 0.05 per frame, clamped by the level's exposure min/max. Effect [OBS]: from inside
  a dark room the windows blow out to near white and the room opens up after a moment; stepping outside dims it again.
- **Bloom**: heavily thresholded ("all but the brightest areas are black"), blurred down to ~8–20 px wide images,
  7×7 Gaussian per level, 50 % temporal blend. Lens dirt overlay only when the sun is on screen; subtle barrel
  distortion (optional). Motion blur up to 10 taps, "extremely subtle". DOF focus = average depth at screen centre,
  20 % per-frame focal blend, golden-angle single-pass gather [SRC 4].
- "The all-pervasive grain": blue-noise stochastic sampling resolved by TAA is visible as a fine, calm grain [RE 1].

**Air [RE 1,2; SRC 3,7]**
- Volumetric sun and lamp light at ½×½ resolution: march camera → depth, at each jittered step one visibility ray
  toward the light; 50/50 temporal + depth-aware bilateral. The sun "covers the full screen". This is what draws
  shafts through holes in walls and the glowing haze at golden hour.
- Distance fog depends on the **vertical view direction** (looks like height fog, costs nothing), with start / end /
  amount / exponent per level.

**Smoke and particles [RE 1,2; SRC 6,8,10]**
- Smoke is CPU-simulated (fluid-like), drawn as viewer-facing 4-triangle pyramids, every other pixel's normal
  mirrored about the view vector to fake scattering, alpha by **blue-noise discard** (no sorting, writes depth), and it
  is **lit by the same deferred lighting, so it receives raytraced shadows** and lamp/fire light.
- [OBS] Explosion smoke is dense, dark grey, billows up into a column and lingers for tens of seconds, drifting.

**Surfaces and weather [RE 1,2]**
- Every voxel has reflectivity; a full-screen reflection pass traces up to 32 units through the shadow volume, uses
  the lit screen colour if the hit is on screen, else sky; temporal-only denoise. Glossy floors, metal and glass show
  soft reflections of sky and nearby lit things.
- **Puddles**: procedural noise splotches raise smoothness on **upward-facing** surfaces; indoor and awning areas are
  excluded using the shadow volume (sky visibility). Rain/snow = a few thousand camera-facing billboards.
- Local lights are area lights: one ray to a **random point on the light's surface** per pixel → soft shadows; sun /
  lamp glare sprites shown when the light centre is visible; breaking the lamp shape kills its light [SRC 6].

**Feel [SRC 6; OBS]**
- Camera: horizontal FOV setting (default 90° per `06`; the API names it horizontal; the options slider is presumably
  the same, **UNCONFIRMED**). Head-movement slider, strafe tilt, tool sway with walking (`SetToolTransform` sway).
- `ShakeCamera(normalised strength)`; slow-motion only experimental; no hit-stop found. The "weight" comes from
  physics response, chips, dust, lingering smoke, and layered material × size audio with room acoustics.

## 3. What WS looks like now [CODE + OBS]

- **FOV**: `game.fov = 80` fed straight to three's **vertical** FOV (`game.ts:329`, `progress.ts:102`). At 16:9 that is
  **≈ 112° horizontal**, versus the reference's 90° horizontal (≈ 59° vertical). Screenshots show stretched edges
  (`look-medium-day-interior.png`) and small-looking buildings (`pc-city-0-norm.png`); a voxel is drawn about 1/3 smaller (under half the pixels) than at the reference default.
- **Grade**: AgX + contrast 1.02 + vignette 0.28; albedo desaturated to 0.72 in the material; static exposure per
  preset. Result: milky, low-contrast frames; sun:sky ratio 2.6 : 1.1 (hemisphere) makes shadowed sides barely darker
  than lit ones (`pc-harbor-1-perf.png`). Interiors are evenly bright and windows are not blown out.
- **Fog**: `THREE.Fog` linear, single colour, no sun inscatter, no shafts. Golden hour reads as "beige", not glowing.
- **Specular**: none (`MeshLambertMaterial`; glass gets a fake sky Fresnel). No wet look; rain is `THREE.Points`
  dots that also fall indoors.
- **Smoke** (`fireFx.ts`): sorted alpha-blended sprites, **unlit** (one global light scalar), blast smoke lives 3–6 s.
  `f3-explosion-0.3s.png`: a small beige puff and a scorch ring — no flash read, no column, no dust skirt.
- **Lamps**: point lights with a single hard traced ray to the centre; no glare; flashlight is a shadowless SpotLight
  (`atmosModule.ts`), no beam in air.
- **Camera feel**: punch spring (k 170, c 15), white-noise shake `Math.random()` every frame (`renderer.setCamera`),
  hit-stop 55–75 ms on tool impacts (`game.ts:263`), head bob + roll. White-noise shake is high-frequency jitter (and
  it rejects TAA history every frame it is active).
- **Audio**: procedural bank with material groups and a masonry rumble; no room acoustics (no reverb / convolver).

## 4. Prioritised implementation list

Tiers as in `renderer.ts`: **Perf** (= low + LITE, no TAA, ≤ 1 dpr, reduced res), **Low**, **Medium** (traced sun,
TAA), **High**. Costs are per pixel at scene resolution unless noted; "trace" = one `vxTrace` call (the sun shadow
costs one per pixel today, so "+1 trace" ≈ doubling the sun-shadow cost). ★ = biggest visible wins.

### ★1. Horizontal 90° FOV by default (cost: zero)
- Teardown: 90° horizontal default, 60–120 slider. WS: 80° vertical ≈ 112° horizontal.
- Build: store the setting as **horizontal degrees**, default 90, slider 70–120; convert per frame:
  `vfov = 2·atan(tan(h/2) / aspect)`. Keep vertical clamped ≥ 50° for portrait / ultrawide sanity. Migrate saved
  settings once (old vertical v → horizontal). Apply the same conversion in `mapView`, photo mode, mods `fov`.
- Also add a tiny transient FOV kick (+2–4°, 150 ms) on explosions near the player and while sprinting (+3°).
- Tiers: all. Effect: voxels ~1.5× bigger on screen, buildings feel massive, edge stretching gone.

### ★2. Tone curve, grade and light balance (cost: ~0)
- Teardown: `1−exp(−c)`, per-level saturation and colour balance; strong sun vs sky contrast; shadows dark but not black.
- Build in `post.ts` COMPOSITE: `c = 1 − exp(−c·exposure)`; then `sat` (preset 1.05–1.2), `colorBalance` (vec3,
  e.g. sunset 1.06/1.0/0.9, night 0.9/0.95/1.08), contrast as now, keep the sRGB + IGN dither. Keep AgX as a
  setting for comparison. Raise material `uSaturation` 0.72 → ~0.9. Re-balance presets: sun 3.2–4.0, hemisphere
  0.55–0.75 with a bluer sky colour and darker ground colour, so outdoor shadow ≈ 25–35 % of lit (now ≈ 45 %).
  Lock this with a screenshot test of the look matrix (`look-*`).
- Tiers: all (Perf too; the composite runs there already).

### ★3. Auto-exposure (eye adaptation) (cost: < 0.1 ms/frame)
- Teardown: 256² luminance → mips → 1×1, α 0.05/frame, clamped min/max.
- Build: one pass writing `log(lum)` of the scene (or of bloom level 0) into a 64×36 R16F target, generate mips
  (or 3 manual down passes to 1×1, centre-weighted 5-tap X at the 4×4 level), then a 1×1 ping-pong target
  `e = mix(prev, clamp(key/exp(avgLog), eMin, eMax), 1 − exp(−dt·rate))` with rate ≈ 3/s brightening, 1.5/s
  darkening. Composite samples the 1×1 texture (no CPU readback). Presets get `key`, `eMin`, `eMax`.
- Look: windows blow out from inside; interiors (already dark thanks to cone AO) become readable after ~0.5 s.
- Tiers: all; Perf uses a 32×18 source and updates every 2nd frame.

### ★4. Atmospheric fog with sun inscatter (cost: ~10 ALU + 1 depth fetch)
- Teardown: distance fog shaped by vertical view direction + volumetric sun haze.
- Build: drop `THREE.Fog` for the world and apply fog in a full-screen pass after the scene (needs the depth
  texture: TAA tiers already have it; Perf/Low: keep per-material fog but with the formula below in `fog_fragment`).
  `f = 1 − exp(−density·max(0, d − start)·heightTerm(viewDir.y))`; colour =
  `mix(horizonCol, zenithCol, viewDir.y)` + `sunCol · HG(dot(viewDir, sunDir), g=0.6..0.75) · inscatterAmount`.
  Sky dome uses the same function at d = ∞ so the horizon matches. Per-preset `density`, `heightFalloff`,
  `inscatter` (sunset high, overcast flat grey, night ~0 except moon tint).
- Tiers: all. Biggest single atmosphere win at sunset / overcast.

### ★5. Volumetric sun shafts (Medium/High) and screen-space god rays (Perf/Low)
- Teardown: ½×½ res march with a visibility ray per step, temporal + bilateral.
- Medium: ¼×¼ res, 12 steps, each step tests sun visibility in a **cached static sun-space depth map** (orthographic,
  2048² over the level ≈ 10 cm texels for a 200 m level, re-rendered only for the dirty region / once per
  destruction burst; debris uses the existing small dynamic shadow map). Jitter start per pixel with blue noise
  (golden-ratio animated, per `5`), temporal blend 0.5 with reprojection (reuse TAA matrices), 4-tap depth-aware
  upsample. Cost ≈ 12 shadow-map fetches per *quarter-res* pixel ≈ 0.75 fetch per full-res pixel.
- High: ½×½ res, 16 steps, steps inside 30 m use `vxTrace` with tMax 300 voxels (exact shafts through holes), the
  rest the sun map. Also feed smoke density (see 6) as extra extinction if cheap.
- Perf/Low: radial blur toward the sun's screen position over a sky/bright mask from depth, ¼ res, 24 taps, only
  when the sun is within ~1.2 screen of the view; additive in composite. ~0.1 ms.
- Interiors: shafts through blown holes are the reference's signature shot; the static sun map must be updated after
  carving (same dirty-box path as the volume upload).

### ★6. Smoke that is lit, shadowed, dense and lingers
- Teardown: CPU smoke, blue-noise dithered, lit by the same lighting incl. raytraced shadows, fake scattering normals.
- Build (in `fireFx.ts`):
  - Lighting per particle in the vertex shader: `sun = vxTrace(p, L, 300 voxels) ? 0 : 1` (Medium/High; Low/Perf:
    look up the cached sun map, or the CPU occupancy every 4th frame per particle). Shade
    `albedo·(ambient·skyVis + sun·sunCol·phase)` with `phase = mix(0.6, 1.6, HG(dot(V, L)))` so smoke backlit by the
    sun glows (golden hour!). Add nearby fire/lamp lights: fire clusters already exist as lights; evaluate the 2–4
    strongest per particle in the vertex shader.
  - Medium/High: alpha via blue-noise discard, depth write on, no sort (saves the CPU sort; TAA resolves). Perf/Low
    keep sorted blending (no TAA there).
  - Explosion smoke: lifetime 15–30 s scaled by size, rising column (buoyancy decaying over 3 s, then wind drift
    0.3–1 m/s), size growing ×3, darker (albedo 0.08–0.2), particle budget raised for blasts (Medium 500 → 800).
    Dust skirt: low, wide, light-brown ring expanding 4–8 m/s for 0.5 s, settling slowly over 8–12 s.
- Cost: ~1 trace per particle vertex (4 × ≤ 800 particles = 3 200 traces/frame, negligible vs pixels); fill-rate is
  the real cost: cap screen coverage by fading particles closer than 1 m and merging distant ones.

### ★7. Explosion choreography (cost: mostly CPU / particles)
- Teardown [OBS]: instant hot flash lighting the surroundings, short fireball, chip spray + falling debris bodies,
  thick smoke column that stays, dust drifting down from damaged ceilings, shake scaled by distance.
- Build an explicit timeline per blast size s:
  - t=0: flash point light (exists, 120·s peak, 0.35 s) **with traced shadows** (it uses the lamp path: make sure it
    is a shadowed light slot) + 1-frame exposure spike (+0.3 EV, bypasses adaptation) + bloom boost.
  - 0–0.25 s: fireball (emissive, additive, expanding 1.5·s m), embers with stretch along velocity.
  - 0–0.1 s: shockwave: dust ring (item 6), grass/loose chips pushed outward, screen-space distortion ring only on
    High (optional, 1 pass).
  - 0.1–2 s: chips (exist) + **dust fall**: for each carve sample with empty space below and solid above, spawn
    slow light-grey motes falling for 1–3 s (sells "ceiling damage").
  - 0.2 s→30 s: smoke column (item 6). Sound with distance delay `d/343 s` and low-pass by distance (bank already
    has a `delay` param), plus a 0.5–1.5 s debris rattle tail scaled by removed voxels.
  - Camera: smooth shake (item 9) `min(1.5, 6s/(d+2))`, FOV kick (item 1), no hit-stop for explosions.

### 8. Specular and reflections (Medium/High; cheap sky-only for Low/Perf)
- Teardown: per-voxel reflectivity / shininess / metallic; reflection rays through the volume, screen colour if on
  screen, else sky.
- Build in `worldMaterial.ts` (palette gets `reflectivity`, `rough`, `metal`; default: concrete/brick 0.04, painted
  metal 0.1, raw metal 0.5 metal, glass 0.9, wet asphalt see 9):
  - All tiers: GGX sun highlight from the traced sun visibility already computed (+~15 ALU), and Fresnel sky term
    from `uSkyZenith/Horizon` (already in the glass path) multiplied by **specular occlusion = cone AO** (free).
  - High: Teardown-style "volume SSR": one `vxTrace` along `reflect(-V, n)` jittered by roughness, max 32–64 voxels;
    on hit project the hit point with the *previous* frame's VP into the TAA history texture and use that colour; on
    miss use sky; skip pixels with reflectivity < 0.02. Needs a hit-distance variant of `vxTrace` (return t). TAA's
    neighbourhood clamp is the denoiser. Cost +1 trace on reflective pixels only (~30 % of a city frame).
  - Medium: same at half resolution, or only on reflectivity ≥ 0.3 (glass, metal, wet).
- Visible win: glossy floors, windows reflecting the street, metal containers in the harbor.

### 9. Rain: wet surfaces, puddles, occluded rain (cost: +1 trace on up-facing pixels while raining)
- Teardown: noise-mask puddles on upward faces, excluded under cover via the volume; wet layer in audio.
- Build: `uWet` (0..1, ramps 30 s after rain starts / dries 60 s). For `n.y > 0.7`: sky visibility = one upward
  `vxTrace` (Medium/High; Low/Perf use cone-AO's up cone or a 2D "roof height" map) × world-space 2-octave noise
  threshold → puddle mask. Wet: albedo × 0.6–0.7, reflectivity 0.3, rough 0.15; puddle: reflectivity 0.8, rough
  0.02, flat normal (cancel the per-voxel tilt) + animated ripple normals from rain hits. Vertical walls darken ×0.85
  only. Rain: stretched streak quads (velocity-aligned) instead of dots, particles killed where the 2D roof map says
  covered; splash sprites on hits near the camera. Night rain + lamps + puddle reflections is the "survival horror"
  map look the press singled out [9].

### 10. Soft area lights, lamp glare, flashlight beam (Medium/High; glare all tiers)
- Teardown: random point on the light's sphere per pixel (30 cm), soft shadows resolved temporally; glare sprites.
- Build: in `vxPointShadow` aim at `lightPos + r·blueNoiseDisk(pixel, frame)` with r = 0.15–0.3 m (TAA tiers only;
  Perf/Low keep hard rays). Add the same trace to **spot lights** (flashlight, headlights: patch
  `getSpotLightInfo`). Glare: additive billboard per lamp / sun, occlusion tested by 5 depth taps in the vertex
  shader, size by distance. Flashlight beam: additive cone mesh with soft edges, intensity × (fog density + smoke
  nearby), depth-faded against the scene (cheap fake of volumetric spot). Night needs more lamps lit: raise Medium
  lamp count 6 → 8 with distance-sorted clusters.

### 11. Bloom and lens (cost: +2 tiny passes)
- Teardown: thresholded, very wide (down to ~8 px), temporally stable; lens dirt only with the sun on screen.
- Build: extend `BLOOM_LEVELS` 5 → 7 (stop at ≤ 8 px), weight wide levels more for night lamps; threshold relative
  to the adapted exposure (item 3) so a lamp blooms at night and not at noon; 50 % temporal blend of level 0 to calm
  flicker from sparks. Lens dirt: a procedural smudge texture (generated once on a canvas) × bloom of the 2 widest
  levels × `sunOnScreen` fade. Perf: keep bloom off but allow a single 1/8-res level when exposure adaptation exists.

### 12. Camera and tool feel
- Teardown [OBS, SRC 6]: smooth shake, tool sway and lag, strafe tilt, recoil animated through the tool transform.
- Build:
  - Replace white-noise shake with smooth noise: sum of 3 sines per axis at 11/17/23 Hz with random phases, amplitude
    `shake²` (trauma model), rotation ≤ 2.5° pitch/yaw, 1.5° roll, translation ≤ 3 cm; decay 1.5/s. Optional
    "screen shake" accessibility slider (the reference has none; we should).
  - Landing: on ground contact with vy < −4 m/s, eye dips `min(0.12, 0.015·|vy|)` m with a spring (k 120, c 14)
    and a soft thud; tool dips twice as much.
  - Tool view model: lag behind look rotation (spring k 90, c 12, clamp 6°), walk sway figure-8 synced to the head
    bob, strafe roll 2°, idle breathing 0.5 Hz × 3 mm. Sledge: 120 ms wind-up, 80 ms strike, impact punch (exists) +
    tool recoil 4° + 3 cm back. Guns: recoil kick pitch 1.5–3° recovering over 120 ms, view model kick 6 cm back,
    muzzle light (exists) + a 1-frame emissive muzzle sprite.
  - Keep hit-stop ≤ 60 ms only for sledge hits on hard material (current 55–75 ms is fine; never for explosions).
  - TAA: apply shake *after* computing the history's camera so shake is not mistaken for disocclusion, or lower the
    TAA blend to 0.2 while shaking.

### 13. Surface grime and detail (cost: ~8 ALU)
- Teardown: per-shape detail texture sampled one texel per voxel (grime, rust, moss) [`09`]; buildings read weathered.
- WS: per-voxel hash grain only; city facades look uniformly clean (`pc-city-0-norm.png`).
- Build: per-voxel value from a world-space 3-octave value noise sampled at voxel centres (`floor(vVox)`), plus two
  authored gradients: darker/dirtier within 0.6 m of the ground, streaks under window sills (voxels below an opening
  via `vxSolidSafe` checks, High only). Tint table per material (brick: soot, concrete: water stains, metal: rust).
  Tiers: all (Perf: ground gradient only).

### 14. Room acoustics and destruction audio layers (CPU only)
- Teardown: voxel ray-traced acoustics set early reflections and tail; wood damps more than masonry [11].
- Build: every 250 ms cast 16 rays from the listener through the CPU occupancy (max 30 m), compute mean free path
  and enclosure (fraction of rays that hit) and dominant hit material; drive a `ConvolverNode` with 3 procedurally
  generated impulse responses (small room / hall / outdoor) cross-faded by these values, plus pre-delay =
  mean path / 343. Destruction layering: impact (material × size) + debris rattle tail scaled by removed voxels +
  low-frequency rumble for collapses > 2 000 voxels + delayed distant boom for explosions > 30 m.

### 15. Lower priority
- **DOF**: photo mode first (Gustafsson's single-pass golden-angle gather at ½ res, focus = average centre depth,
  20 %/frame blend [4]); in-game only as an option, very subtle. ~1 ms at ½ res; High only.
- **Motion blur**: the reference's is "extremely subtle"; skip until motion vectors exist for bodies.
- **Grain**: do not add fake film grain; our IGN output dither already covers banding. The reference's grain is an
  artifact of stochastic lighting, not an art goal.

## 5. Summary table

| # | Item | Visible win | Cost | Perf | Low | Med | High |
|---|---|---|---|---|---|---|---|
| 1 | 90° horizontal FOV | ★★★ | 0 | ✓ | ✓ | ✓ | ✓ |
| 2 | Exp tone curve, saturation, balance, sun:sky contrast | ★★★ | 0 | ✓ | ✓ | ✓ | ✓ |
| 3 | Auto-exposure | ★★★ | <0.1 ms | ✓ (½ rate) | ✓ | ✓ | ✓ |
| 4 | Sun-inscatter fog | ★★★ | ~10 ALU/px | per-material | per-material | post | post |
| 5 | Sun shafts / god rays | ★★★ | ¼-res march | radial | radial | ¼ res, sun map | ½ res, traced near |
| 6 | Lit, shadowed, lingering smoke | ★★★ | per-vertex trace | sun map | sun map | traced, dithered | traced, dithered |
| 7 | Explosion timeline | ★★★ | CPU/particles | reduced counts | ✓ | ✓ | ✓ + distortion |
| 8 | Specular / reflections | ★★ | +1 trace on reflective px | sun spec + sky | same | ½ res SSR | full SSR |
| 9 | Wet surfaces, puddles, rain streaks | ★★ (rain only) | +1 trace up-facing | roof map | roof map | traced | traced |
| 10 | Soft lamps, glare, beam | ★★ (night) | 0 extra traces | glare | glare | ✓ | ✓ |
| 11 | Wider bloom, lens dirt | ★ | 2 tiny passes | 1 level | ✓ | ✓ | ✓ |
| 12 | Smooth shake, landing, sway, recoil | ★★ feel | 0 | ✓ | ✓ | ✓ | ✓ |
| 13 | Grime / detail | ★★ | ~8 ALU | ground only | ✓ | ✓ | ✓ |
| 14 | Room acoustics, audio layers | ★★ feel | CPU 16 rays/250 ms | ✓ | ✓ | ✓ | ✓ |
| 15 | DOF, motion blur | ★ | ~1 ms | — | — | — | photo/option |

**Suggested order**: 1 → 2 → 3 → 4 (one afternoon each, zero GPU risk, and they change every screenshot), then 6 + 7
together (explosions are the core loop), then 5, 12, 8, 13, 10, 9, 11, 14. Re-shoot the `look-*` matrix and the
perf screenshots after each step, and keep every new effect behind a define plus a `?flag=0` URL switch, as the
existing look code does.

**Notes**
- Items 5 Medium, 6 Medium/High, 8 and 10 rely on TAA as the denoiser (as the reference does); they must not run
  in Perf, where TAA is off.
- The cached static sun-space depth map (item 5) can also give Perf/Low long-range sun shadows beyond the current
  22–34 m shadow-map radius: distant buildings currently cast no shadow there.
