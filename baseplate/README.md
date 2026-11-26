# Gear baseplate

The bike, full-face helmet, goggles and backpack models laid out at true
scale (metres, Y up, +Z forward) on a large, flat, untextured plate.

- `baseplate.glb` is the whole scene as one glTF file. The plate is a plain grey
  512 m x 512 m slab, 1 m thick, with its top at y = 0. Each model rests on it.
- `index.html` is a viewer with the GLB embedded. Open it in a browser. three.js
  0.170.0 loads from jsDelivr, so it needs a connection.
- `build_baseplate.py` rebuilds `baseplate.glb` from the source models:

```bash
python3 build_baseplate.py <folder with the source .glb files> baseplate.glb
```

| Node | Position (x, y, z) | Yaw | Note |
| --- | --- | --- | --- |
| Bike | 0, 0, 0 | 0° | Tyres touch y = 0 |
| Helmet | 0.95, 0.144, 0.45 | 55° | Rests on its chin bar |
| Goggles | same as helmet | 55° | Shares the helmet's origin, so it sits on the helmet |
| Backpack | 0.95, -0.015, -0.45 | -90° | Back panel faces +X |

The source models have no normals, UVs or textures. Viewers shade them flat,
which gives the low-poly look.
