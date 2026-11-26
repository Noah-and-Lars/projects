# Snow Rider 3D

A Unity WebGL build of a sledding game, packed into a single HTML file that runs in the browser.

## Play

Double-click `index.html`. It opens in your browser and starts in a couple of seconds. It works offline in a current Chrome, Edge, Firefox or Safari, because the whole game is inside that one file (about 16 MB).

You can also put `index.html` on any static host, such as GitHub Pages, Netlify or Cloudflare Pages.

## Controls

- **Left / Right arrow**: steer
- **Up arrow**: jump
- **Click / tap**: start, menus, restart

On phones and tablets, on-screen ◀ ▶ ▲ buttons appear in the bottom corners. The **Fullscreen** button is in the top-right corner.

## Files

| File | What it is |
| --- | --- |
| `index.html` | **The game.** Built file: the loader with all three build files inlined. Don't edit it by hand. |
| `src/index.html` | Loader page (source). Over HTTP, it loads the files from `src/Build/`. |
| `src/Build/SnowRider3D.wasm.framework.js` | Unity 2018.4 engine runtime (JavaScript glue) |
| `src/Build/SnowRider3D.wasm.code.unityweb` | Compiled game code (WebAssembly, gzip) |
| `src/Build/SnowRider3D.data.unityweb` | Game assets (`UnityWebData1.0` package, gzip) |
| `tools/build.mjs` | Builds `index.html` from `src/` |

## Building

After changing anything in `src/`, rebuild `index.html` from the repository root:

```bash
node snow-rider-3d/tools/build.mjs
```

It needs only Node.js, with no npm packages. The script gzips the framework and inlines all three build files into the page as base64 `<script type="application/octet-stream">` blocks.

To work on the loader without rebuilding, serve `src/` over HTTP and open http://localhost:8000:

```bash
cd snow-rider-3d/src && python3 -m http.server 8000
```

## How the loader works

The build came without Unity's `UnityLoader.js`, so the page does that job itself:

1. Reads the three build files from the inlined base64 blocks. With no blocks present, as in `src/index.html`, it downloads them from `Build/` instead, with a progress bar.
2. Unpacks the gzip data with the browser's built-in `DecompressionStream`.
3. Sets up the `Module` object and the `UnityLoader.SystemInfo` global that the framework expects.
4. Extracts the asset package into the engine's virtual file system before the game starts.

The game was built with GameDistribution's ad SDK. The page doesn't load that SDK. It puts a stand-in in its place that answers immediately, so no ads are shown and nothing waits for one. Unity Analytics calls in the build already point at a dead local URL, so the browser console shows a few harmless errors for `json/null.json`.

High scores and settings are saved in the browser's IndexedDB.
