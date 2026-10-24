# Poly Racer copy: handover

Where the realistic copy of Poly Racer stands, how it is built and tested, and what is left. Read this before
changing anything here. The tool details for the car pipeline are in `blender/README.md`.

## Ground rules

- This folder is a **copy** of the game. The live game is `poly-racer/` on the site branch
  `claude/jimmyscafe-projects-access-9mbcw3`, served by GitHub Pages at https://noah-and-lars.github.io/projects/.
- Push work **only** to `claude/fervent-keller-pjhnvh`. Never push to the site branch or `main` unless the owner asks
  to publish. Nothing here is playable by anyone until it is published.
- No personal names anywhere in the game or on the site.
- The Sketchfab API token is **never** committed. It lives in `poly-racer-copy/.skfb_token` (git-ignored, as are
  `skfb-dl/` and `out-*/`). A new session has to be given it again.
- `../poly-racer-2.3-save/` and the git tag `poly-racer-2.3` are a frozen save of 2.3 from before the polish pass.
  Leave them alone.

## What is in it (version 2.4)

| Path | Size | What |
|---|---|---|
| `index.html` | 1.3 MB | the whole game, Three.js r128 inlined |
| `models/` | 30 MB | nine cars (`<id>.fcm` + `tex/`), `credits.json` (generated) |
| `ultra/sky/` | 8 MB | photographed skies: `<key>_sky.jpg`, `<key>_env.hdr` (512x256 RGBE), `skies.json` |
| `ultra/tex/` | 14 MB | Poly Haven ground and road textures (`_diff`, `_nor`, `_rough`), leaf, twig and grass cards |
| `ultra/trees/` | 16 MB | six real trees (`.fcm` + atlas `.png`) |
| `blender/` | <1 MB | every build tool and every patch script that changed `index.html` |

Players on Low, Medium or High download about 31 MB. Ultra loads `ultra/` on top, about 69 MB in all.

### Features added since 1.2, newest first

- **Smaller models**: car and tree `.fcm` files store positions and uvs as 16-bit steps across each part's range
  (`pq`, `uq` in the part header). `blender/fcm_pack.py` packs a built file; the loader reads both forms. A fresh
  Blender export is unpacked until it is run through the packer.
- **Photo mode on touch**: a Photo mode button in the pause menu; an on-screen bar and hold-to-move arrows; pinch.
- **Motion blur on Ultra** (setting `mblur`): per-pixel camera motion from the depth and last frame's view, in the
  composite pass. Off near the camera so your own car stays sharp.
- **Headlights** (High and Ultra): a real `SpotLight` (`HEAD`) on the player's car at night, shadowed on Ultra, plus
  a visible beam (`BEAM`) in rain, fog and snow. The light system's own soft headlight stays for the long throw.
  The spotlight is always in the scene (dark by day) so the shaders never recompile.
- **Damage look**: scratches fixed to the panels (streaks along the car, scuff, bare metal with a ragged edge) and
  cracked glass on hard hits near a window (`crackGlass`, per-car glass materials with up to four impacts).
- **Ultra reflections and rain**: screen-space reflections (`SSR_U`, `reflective(mat, kind)`) on the water and on
  wet roads, from the Ultra depth pass and last frame's picture (reprojected). Rain adds puddles with raindrop
  rings, rings on the water, darker and glossier kerbs, verges and ground (every tier), and more spray.
- **Ultra water**: depth map of the terrain under it, pale clear shallows, moving shore foam, crossing wave
  layers, swell in deep water, Fresnel. Non-Ultra keeps the flat water. (`makeWater`, `WATER_U`)
- **Ultra soft shadows**: percentage-closer soft shadows patched into `THREE.ShaderChunk.shadowmap_pars_fragment`
  right after the renderer is made, Ultra only. 16 blocker taps + 16 filter taps per pixel. `PCSS_K` sets the
  sun's apparent size. **Never timed on a real GPU**: if Ultra is slow, lower `PCSS_N` first.
- **Baked ambient occlusion in every car**: `pr_export.py` `bake_vertex_ao` (Cycles, vertex colours) stores AO in a
  4th colour channel (`p.ao` offset in the part header); `modelCompile` darkens by it under `USE_COLOR_ALPHA`.
- **Ultra terrain macro variation**: two noise scales over the hills. Uses variables `gA`/`gB`: the game
  `#define`s `m0`..`m6` as macros, so any shader variable named `m1` etc. breaks compilation.
- **Real trees on Ultra**: Sketchfab trees as an InstancedMesh per tile within 120 m (`im.userData.hero`), the game's
  own trees beyond, the light LOD past the far line. Broadleaf kinds only in spring and summer.
- **Lens look on Ultra**: sun glare (tested against the depth buffer), colour fringing, film grain.
- **Photo mode** (F9): orbit or free camera (F), WASD/QE/Shift to move, drag to look, Space runs or pauses the world,
  `[` `]` depth of field (Ultra), Enter saves a PNG. Keyboard only, so not usable on phones yet.
- **Ultra tier**: photographed skies turned so their sun matches the game's, HDR environment lighting, photographed
  road and ground, 4k shadows, more trees, half-res screen-space AO, 16x anisotropy.
- **Five polish batches** (`blender/polish1..5_patch.py`): quality tiers, UI text, flow bugs, profile and lobby.
- **Realistic cars**: nine Sketchfab cars with interiors, working steering wheels, PBR maps and per-car overrides
  (`blender/cars.json`).

## How changes were made

Each feature is a Python patch script in `blender/` that does exact string replacements on `index.html` and asserts
each one matched once. They have **all been applied already**: they are the record of what changed, not something to
run again. For new work, either edit `index.html` directly or write a new patch in the same style.

After any edit to `index.html`:

```
node blender/jscheck.js index.html        # syntax check of the inline scripts
```

## Testing

Chromium and Playwright are preinstalled in the cloud container. `blender/shot.js` serves a folder and screenshots
the game in headless Chromium (software WebGL):

```
SHOT_INIT="localStorage.setItem('polyracer', JSON.stringify({settings:{quality:'ultra', fps:false}}))" \
  node blender/shot.js <folder> out.png '?notos=1&track=45' "<js to run>" 12000
```

- Query `notos=1` skips the terms screen; `track=<n>` loads a time-trial track by index (45 = a coast track, 2 = a
  pine forest track).
- In the page, `__pr` is the debug handle (car, scene, camera, setPlayerCar, carById, loadTrack and more) and
  `__look(angle, dist, height, fov, tx, ty, tz)` holds the camera around the car.
- **Known pitfalls**: `__pr.step(n)` runs whole frames, so a big `n` at High or Ultra takes many minutes in the
  software renderer, and on a circuit it never returns before the race has started. To show a moving car, set
  `race.state = 'racing'` on a time-trial track and give `__pr.car.v` a speed, then wait. A circuit loads with
  `__pr.RM.load(def, opts)` and `__pr.RM.grid([...])` (see the rain test in the git history) and renders fine in
  its ready state, HUD and all.
- Nothing has been tested on a real GPU or a real phone. Frame rate is unknown.

## Pitfalls already hit (don't repeat them)

- Paint triangles were moved into the interior by the cabin split, causing jagged patches: paint is exempt from the
  interior split and the LOD drop.
- The van took a door-height ring as a wheel: the wheel finder prefers rings that touch the ground; the van has
  `rot: 0`. Its sliding door was culled: winding is fixed against the shading normals.
- Poly Haven returns 403 without a browser-like `User-Agent`. Sketchfab search needs `license=by`.
- Blender's Python has no PIL: use numpy for image work.
- In r128 a texture has no `userData`: extra data goes on a plain property (`tex.nmap`).
- The depth pass must swap depth materials per part for meshes with material arrays (the cars), or DoF and AO miss
  them.
- `updateWorld` must not skip tiles without a far version, or palms and other no-LOD trees never show.
- Vertex AO must not count the part being baked as its own occluder (it duplicates itself and goes black).

## What is left

Ranked by how much it changes what you see.

Done since the first version of this file: reflections, rain surfaces, headlights, damage, motion blur, the
Centenario trim, photo mode on touch and smaller models. Still open:

1. **Reflections off-screen**: screen-space reflections can't show what isn't on screen (the sky's env map fills
   in). Planar reflections for the water would fix that at the cost of a second render.
6. **Van side window**: a jagged white patch shows in the window behind the van's front door (there since 2.3).
   It is not the packing and not the cabin split: a rebuild with a narrower cabin box left it and added artifacts,
   so it was reverted. Raycasts put it on body triangles at x 0.81..0.86, y 1.39..1.80, z 0.59..1.63 (game frame);
   look at the source model's sliding door next.

Not graphics:

- **Publish** the copy to the site, alongside 1.2 (e.g. `poly-racer-copy/`) or replacing it. Ask the owner first.
- **Test on a real GPU and phone**, especially Ultra's soft shadows and water.
