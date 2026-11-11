# Poly Racer 2.0 — car pipeline (Blender, headless)

The cars in `../models/` are built from Sketchfab models (all CC Attribution, see `../models/credits.json`) by the
scripts here, run inside Blender 5.2 in background mode. Nothing needs the Blender UI.

## What the game reads

`models/<id>.fcm` is the game's own binary format (`FCM1`, a JSON header + float32 positions, int8 normals, uint8
vertex colours, float32 uvs, uint16/32 indices per part). New in 2.0, a part carries **groups**: index ranges that each
have their own material (`k`: paint / plain / glass / lamp / chrome / mirror / emit / decal, with `tex` colour map,
`ntex` normal map, `rtex` roughness(G)/metal(B) map, `col`, `r`, `m`, `a`, and `base` = the colour a painted texture was
made in, so the game can tint it). Parts: `body` (paint), `det` (trim, lamps housings, chrome), `glass`, `lamp`,
`wheel` (one front wheel on its hub; `meta.wheels` places all four), `interior`, `swheel` (the steering wheel on its hub,
`meta.swheel` = position, axis, radius), `mid` and `lo` (far versions). `meta.eye` is the driver's eye, `meta.cluster`
where the live gauges go, `meta.mirror` the rear-view mirror glass. Paint is the magenta marker colour in the vertex
colours; the game swaps it for the car's colour in the shader (`modelPaint`, `FC_PAINT`).

## Building

1. Put your Sketchfab API token in `poly-racer-copy/.skfb_token` (git-ignored). `python3 -I skfb_dl.py <uid>` then
   downloads a model into `poly-racer-copy/skfb-dl/<uid>/`.
2. `cars.json` lists each car: Sketchfab `uid`, real `len` in metres, `side` (L/R hand drive) and optional overrides:
   `classify` (regex on `objectname|materialname` → part and options), `swheel`/`eye` placed by hand (Blender metres,
   nose at -Y, ground at z = 0), `tint: false` (flat paint instead of a tinted texture), `auto_paint`, `drop_skins`.
3. `blender -b --python pr_build.py -- <out-dir> <car-id|all>` builds `<id>.fcm` + `tex/*.jpg|png`.
4. `blender -b --python pr_check.py -- <out-dir> <car-id> <out.png> [paint] [samples]` renders the export like the
   game sees it: outside front and rear, the cockpit from `meta.eye`, and the dash.
5. `blender -b --python pr_cover.py -- <models-dir> <out.png> <morning|evening|night> [samples] [width] id:hex...`
   renders the cover scene (Poly Haven HDRIs expected in `../../polyhaven/`).
6. `python3 -I credits.py` prints the `CREDITS` line for `index.html` from `cars.json` and the downloaded metadata.

`inspect_gltf.py` and `render_views.py` look at a raw download (names, materials, whether it has an interior).
`shot.js` screenshots the game in headless Chromium (Playwright); `jscheck.js` syntax-checks the single-file game.

## How the exporter decides things (pr_export.py)

- Parts by keywords on object and material names (`KW`), with per-car `classify` overrides.
- Scale to `len`, nose to -Y (the end nearer the steering wheel), tyres on the ground.
- Wheels: named wheel objects clustered into four corners, else ring-shaped pieces found in the geometry; the
  corner's cylinder is cut out of the body and the +x front wheel becomes the `wheel` part.
- Interior: triangles inside the cabin box between the axles. Steering wheel: a named part if it is a wheel-sized ring,
  else the ring found by a Hough vote in the dashboard zone; it is cut out by its box and centred on its hub.
- Decal sheets (badges, stripes) keep their texture alpha; duplicate shells lying on the paint are left out; no paint
  by name → the material covering the most outside area is the paint.
- Triangle budgets per part (`BUDGET`) through Decimate; `mid`/`lo` are decimated copies without wheels or interior.
