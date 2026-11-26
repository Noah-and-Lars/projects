# 14 — Matching the reference screenshots: measurements and what we changed

Date 2026-11-26. Task (user): find photos / screenshots of the genre reference game and tweak Wrecking Shift's (WS)
look to match them. Builds on `13-lighting-feel.md` (prioritised list), `08-lighting-look.md`, `09-voxels-deep-dive.md`.
We match measurable *qualities* (tone, colour, haze, exposure behaviour, framing), never assets, levels or UI.

## 1. Reference images (analysis only — not committed, copyright of the publisher)

| id | source | scene |
|---|---|---|
| S1 | Steam store screenshot `ss_b140eeaf…` — https://store.steampowered.com/app/1167630/ (via the store's `api/appdetails` JSON) | golden hour, explosion + fireball, lingering smoke, third person |
| T1 | https://teardowngame.com/assets/img/screens/s1.jpg | sunny plaza, cracked paving, smoke trail, fireball |
| T2 | …/s2.jpg | sunny suburb street, foliage, car, debris |
| T3 | …/s3.jpg | overcast-ish industrial yard, burning wooden house interior, fire light |
| T4 | …/s4.jpg | jungle village, warm sun, saturated greens |
| T5 | …/s5.jpg | harbour / canal, flat light, paving, characters |
| T6 | …/s6.jpg | late-afternoon sawmill village from above, haze, smoke column, flying debris |
| T7 | …/s7.jpg | sunny mall courtyard, crane, crisp shadows (first person) |
| T8 | …/s8.jpg | night, snow, sodium lamps, crane (high view) |
| T9 | …/s9.jpg | pale evening, snow, billboards, laser (first person) |
| T10 | …/s10.jpg | dark industrial interior, laser, smoke (first person) |
| T11 | …/s11.jpg | dusk harbour town, lamps, fire on the water, smoke (first person) |
| T12 | …/s12.jpg | fog / rain, explosion in a brick building, pines, wet ground |
| T13 | …/s13.jpg | night-ish industrial, snow, blue lights, smoke |

The Steam set (11 images) overlaps the website set; S1 is the only extra one. Mostly promo shots of the newer
multiplayer release, several third-person; the look (lighting, grade, haze) is the same as in first person.

## 2. Measurements

Script: `imgstats.py` (scratch, logic below). Images resized to 480×270. `L` = display luma (sRGB values),
`sat` = HSV saturation, `shadow:lit` = linear luminance at the 20th / 85th percentile, `warm` = mean R − mean B.

| set | mean L | p5 | p50 | p95 | contrast (σL) | sat | shadow:lit | black (<0.04) | clipped | warm |
|---|---|---|---|---|---|---|---|---|---|---|
| reference T1–T13 mean | **0.36** | 0.11 | 0.32 | **0.71** | 0.20 | **0.32** | **0.12** | 0.9 % | 0.5 % | **+0.09** |
| reference sunny (T1,T2,T4,T7) | 0.41 | 0.13 | 0.39 | 0.78 | 0.20 | 0.38 | 0.11 | 0.1 % | 0.4 % | +0.15 |
| reference dusk/overcast (T9,T11,T12) | 0.39 | 0.09 | 0.35 | 0.71 | 0.22 | 0.22 | 0.08 | 2.2 % | 0 | +0.06 |
| reference night (T8) | 0.24 | 0.07 | 0.23 | 0.46 | 0.13 | 0.32 | 0.16 | 0.3 % | 0 | −0.07 |
| WS before, city, medium (16 views, 4 presets) | 0.32 | 0.09 | 0.32 | 0.59 | 0.18 | 0.25 | 0.07 | **8 %** | 0 | **−0.04** |
| WS before, day only | 0.42 | 0.14 | 0.41 | 0.71 | 0.20 | **0.16** | 0.12 | 0 | 0 | **−0.04** |
| WS before, sunset only | 0.33 | 0.07 | 0.35 | 0.63 | 0.20 | 0.30 | **0.03** | 0 | 0 | −0.01 |
| WS before, night street | **0.13** | 0.003 | 0.14 | 0.25 | 0.10 | 0.38 | 0.03 | **28 %** | 0 | −0.07 |

Colour of the darkest 10 % / brightest 5 % of pixels (sRGB 0–1):

| image | shadows | highlights | top of frame (sky / haze) |
|---|---|---|---|
| T7 sunny | 0.18 0.14 0.08 (brown) | 0.91 0.90 0.81 (cream) | 0.72 0.72 0.65 (pale haze) |
| T1 sunny | 0.15 0.13 0.10 | 0.92 0.88 0.74 | 0.53 0.54 0.46 |
| S1 golden hour | 0.16 0.11 0.04 | 0.95 0.82 0.68 | 0.60 0.49 0.41 |
| T12 fog | 0.10 0.08 0.05 | 0.78 0.75 0.74 | 0.70 0.69 0.71 |
| T8 night | 0.06 0.08 0.09 (teal) | 0.58 0.56 0.53 | 0.21 0.31 0.38 |
| WS before, day corner | 0.05 0.08 0.12 (navy) | 0.73 0.75 0.77 (cool) | 0.51 0.56 0.61 (blue) |
| WS before, night street | 0.02 0.03 0.06 | — | — |

## 3. What the reference looks like (qualitative, per item the task listed)

- **Palette / saturation**: rich but not neon — saturated greens, brick reds, yellow machinery, warm wood. Mean
  saturation 0.32, twice ours. Colour stays saturated into the highlights (per-channel exponential curve).
- **Colour balance**: warm everywhere except night. Shadows are brown-grey, highlights cream; no pure white, no blue
  shadows in daylight. Skies are pale and hazy rather than deep blue.
- **Contrast / shadow darkness**: strong sun vs fill, but shadows keep detail (5th percentile ≈ 0.11, almost no
  pure black). Shadow : lit ≈ 1 : 8 in linear light. Corners and crevices get strong local AO.
- **Fog**: visible aerial perspective already at 50–100 m, warm grey by day, golden toward the sun at low sun,
  blue-grey at dusk. Distant hills and trees fade into it; the horizon glows around the sun.
- **Sky**: hazy, low saturation near the horizon, bright glow around a low sun, soft clouds.
- **Bloom**: soft and wide, mainly on fire, lamps, the sun and sky near the sun; daylight surfaces do not glow.
- **Exposure**: interiors (T10) are dark but readable (mean 0.20); bright windows/sky clip; night (T8) is brighter
  than ours by 2x (mean 0.24) — lamp pools and snow carry it.
- **Voxel size on screen**: 90° horizontal FOV: a 10 cm voxel 2 m away covers ≈ 48 px at 1920 wide. WS used 80°
  *vertical* (≈ 112° horizontal at 16:9): 33 px, buildings looked small, edges stretched.
- **AO**: strong contact darkening at every inside corner and under objects, soft over ~0.5 m.
- **Smoke**: thick, lit, grey-brown columns that keep rising and drifting long after the blast (T1, T6, T12, S1);
  fire-lit from below; sun-lit tops. Explosions are bright orange fireballs with a white-hot core.

## 4. Changes made (in order of visible impact) and the result

1. **Horizontal 90° FOV** (`progress.ts verticalFov / migrateFov`, `game.ts`): buildings ~1.5x larger on screen,
   no edge stretching. Old saves migrate once.
2. **Tone curve + grade** (`post.ts`, `sky.ts`): `1 − exp(−c)`, per-preset saturation and colour balance; neutral /
   warm fill instead of saturated blue; material desaturation 0.72 → 0.92; exposures re-fitted.
3. **Atmospheric fog with sun glow** (`fog.ts`): radial exponential fog, thinner looking up, sun inscatter matching
   the sky dome's horizon glow.
4. **Auto-exposure** (`post.ts`): eye adaptation with per-preset key / range; bit-identical when still.

5. **Screen-space sun shafts** (`post.ts` SHAFTS): radial blur of the 1/4-res bloom mask toward the sun's screen
   position, faded as the sun leaves the view; strongest at sunset. Cheap enough for performance mode.
6. **Smoke** (`fireFx.ts`, `fireModule.ts`): sun-lit with forward scattering (glows when backlit), shadowed by the
   world via CPU rays (one per blast + 8 particles per frame round robin), sky fill from the hemisphere light; a third
   of the blast smoke lingers 12–25 s, grows 3–5x and keeps rising (decaying buoyancy) into a column.
7. **Smooth camera shake** (`renderer.ts`): sum of 11 / 17 / 23 Hz sines, amplitude ∝ shake^1.5, instead of
   per-frame white noise.

After the changes (same 16 city views, medium; `tests/e2e/refmatch.mjs`):

| set | mean L | p5 | p50 | p95 | contrast | sat | shadow:lit | black | clipped | warm |
|---|---|---|---|---|---|---|---|---|---|---|
| reference T1–T13 mean | 0.36 | 0.11 | 0.32 | 0.71 | 0.20 | 0.32 | 0.12 | 0.9 % | 0.5 % | +0.09 |
| WS after, all presets | 0.39 | 0.15 | 0.40 | 0.64 | 0.17 | 0.22 | 0.19 | 0 | 0.1 % | +0.04 |
| WS after, day | 0.47 | 0.18 | 0.47 | 0.79 | 0.21 | 0.17 | 0.14 | 0 | 0.1 % | +0.06 |
| WS after, sunset | 0.43 | 0.15 | 0.45 | 0.72 | 0.19 | 0.29 | 0.19 | 0 | 0.1 % | +0.16 |
| WS after, night street | 0.21 | 0.05 | 0.23 | 0.30 | 0.09 | 0.32 | 0.32 | 0.2 % | 0.1 % | −0.07 |

Night went from 28 % pure black pixels to 0.2 % and from mean 0.13 to 0.21 (reference night 0.24); sunset shadows
from 3 % to 19 % of lit; every daytime preset is now warm. Remaining gaps (known): overall saturation 0.22 vs 0.32 —
the city map is mostly grey concrete and asphalt, the reference's maps are full of foliage, painted wood and
machinery (a content difference, not a grade one; pushing saturation further made brick neon orange); shadows are a
little lighter than the reference's (0.19 vs 0.12) because eye adaptation lifts shaded streets; day highlights are
neutral white rather than cream (day balance pushed warmer once more after this measurement).

## 5. Before / after renders

`docs/look/ref-*.jpg` (our own renders only, before left / after right): `day-corner`, `sunset-sun`, `sunset-high`,
`sunset-back`, `overcast-street`, `night-street`, `blast-1s` / `blast-4s` / `blast-11s` (explosion sequence),
`perf-sunset-high`, `perf-day-corner` (performance mode). Reproduce: `node tests/e2e/refmatch.mjs <prefix> medium`
(add `low day,sunset 1` for performance mode; `WS_DIST=<dir>` for another build).
