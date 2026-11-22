# Rillstone

A first-person mining and water-automation sandbox for the browser. You dig
gravel in a riverside claim, wash it in a pan, then build water-driven
machines, belts and logic that mine, wash, smelt and sort on their own. It's
built with [Three.js](https://threejs.org/) for rendering and
[Rapier](https://rapier.rs/) for physics, running in a Web Worker.

Work in progress: see `BUILD_BRIEF.md` for the plan and `NOTES.md` for
measurements and decisions so far.

## Play

`index.html` is the whole game in one self-contained file, the same way the
other games in this repo ship. Three.js, Rapier (with its WebAssembly inlined),
fflate, the styles and the icon are all built in, so it makes no outside
requests. Put it on any static host, or just open it in a desktop browser. It
works offline.

Don't edit `index.html` by hand. It's generated from `src/` (see below).

## Develop

The source lives in `src/` as plain ES modules. While you work, serve the
`rillstone` folder and open `src/`:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765/src/>. In development, the libraries load
from jsDelivr through the import map in `src/index.html`, pinned to the same
versions the build bundles.

To rebuild the single-file `index.html` after changing anything in `src/`:

```bash
cd tools && npm install && npm run build
```

`tools/build.mjs` bundles each Web Worker into a string first, then bundles
and minifies the game with esbuild and inlines it with the CSS and icon. It
stops with an error if the import map's library versions drift from the ones
in `tools/package.json`, or if the file grows past 8 MB.

## Code layout

| File (in `src/` unless noted) | What it does |
| --- | --- |
| `js/main.js` | Entry point |
| `js/core/workers.js` | Starts workers from Blob URLs (bundled strings in the build, rewritten modules in dev) |
| `js/core/physics.js` | Main-thread side of the physics worker: latest poses, batched queries |
| `js/workers/physics.js` | Rapier world at a fixed 60 Hz, character controller, bodies, queries |
| `tools/build.mjs` | Builds the single-file `index.html` (not in `src/`) |
| `tools/test.cjs` | Headless browser smoke test (not in `src/`) |
| `tools/bench.cjs`, `tools/bench/` | Benchmarks from the brief's section 10 (not in `src/`) |
| `tools/THIRD_PARTY_LICENSES.txt` | three.js, Rapier and fflate licence texts |

## Testing

Serve the `rillstone` folder first, then run:

```bash
node tools/test.cjs <screenshot-dir>
```

By default it tests the built `index.html`, and blocks and fails on any
outside request to prove the file is self-contained. Add `--src` to test
`src/index.html` instead. It fails on any console error.
