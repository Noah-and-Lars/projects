# Snow Rider 3D

A Unity WebGL build of a sledding game, with a custom page that loads and runs it in the browser.

## Play

The browser has to download the game files, so you can't double-click `index.html` to play it. Serve this folder over HTTP instead. In this folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in Chrome, Edge, Firefox or Safari.

The game also runs from any static host, such as GitHub Pages, Netlify or Cloudflare Pages. Upload `index.html` together with the `Build/` folder.

## Controls

- **Left / Right arrow**: steer
- **Up arrow**: jump
- **Click / tap**: start, menus, restart

On phones and tablets, on-screen ◀ ▶ ▲ buttons appear in the bottom corners. The **Fullscreen** button is in the top-right corner.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Loader page. It downloads and unpacks the build, then starts the engine. |
| `Build/SnowRider3D.wasm.framework.js` | Unity 2018.4 engine runtime (JavaScript glue) |
| `Build/SnowRider3D.wasm.code.unityweb` | Compiled game code (WebAssembly, gzip) |
| `Build/SnowRider3D.data.unityweb` | Game assets (`UnityWebData1.0` package, gzip) |

## How the loader works

The build came without Unity's `UnityLoader.js`, so `index.html` does that job itself:

1. Downloads the three build files in parallel, with a progress bar.
2. Unpacks the `.unityweb` files with the browser's built-in `DecompressionStream`. Files that a server already decompressed are used as they are.
3. Sets up the `Module` object and the `UnityLoader.SystemInfo` global that the framework expects.
4. Extracts the asset package into the engine's virtual file system before the game starts.

The game was built with GameDistribution's ad SDK. The page doesn't load that SDK. It puts a stand-in in its place that answers immediately, so no ads are shown and nothing waits for one. Unity Analytics calls in the build already point at a dead local URL, so the console shows a few harmless 404s for `json/null.json`.

High scores and settings are saved in the browser's IndexedDB.
