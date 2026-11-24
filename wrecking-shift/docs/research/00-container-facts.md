# Container facts (verified by the research session, 2026-11-24)
- Node v22, npm, Python 3, Rust/cargo, Go available. 4 vCPU, ~15 GB RAM, no physical GPU.
- Headless Chromium (Playwright preinstalled; `require('playwright')` works, `chromium.launch()` without options).
- WebGL2 WORKS headless out of the box: renderer "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))", MAX_3D_TEXTURE_SIZE = 2048. It is software rendering: slow, so use small viewports (e.g. 640x360) for screenshot tests and do NOT treat its FPS as real-world FPS.
- WebGPU WORKS headless only when (a) Chromium is launched with `--enable-unsafe-webgpu` and (b) the page is served from http://localhost (secure context; about:blank has no navigator.gpu). Adapter = google/swiftshader. Software, slow.
- Consequence: real performance can't be measured in the container; measure CPU-side costs (meshing, physics, connectivity) in Node benchmarks and keep GPU work conservative.
- Versions seen: Chromium 158.0.8127.36, Playwright 1.63.0 (do not reinstall Playwright/browsers).
- Playwright 1.63 already adds `--enable-unsafe-swiftshader` to Chromium args by default; pass `--use-angle=swiftshader --enable-unsafe-swiftshader` explicitly in your Playwright config anyway so tests don't depend on defaults. (Your container may differ slightly — re-verify with a quick probe.)
