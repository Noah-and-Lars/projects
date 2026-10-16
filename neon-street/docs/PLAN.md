# Neon Street — build plan

A walk-around graphics showcase and PC stress test: one rainy cyberpunk
street at night, path traced live in the browser (WebGPU). No gameplay. The
point is to look as real as possible and let the player see how hard their
PC can go, from Low up to a deliberately absurd Melt preset.

Target hardware for tuning: RTX 3060 Ti at 1080p. High should hold ~60 FPS,
Ultra ~20–40 FPS, Melt is a slideshow on purpose.

## Stages

1. **Engine core** — DONE (this commit)
   WebGPU setup, compute path tracer over a BVH, GGX/glass/emissive
   materials, procedural puddles and grime, volumetric fog, next-event
   estimation with resampled light candidates, SVGF-style temporal +
   a-trous denoiser, procedural street, first-person walking with
   collision, Low..Melt presets, stats overlay, headless check script.
2. **Denoiser, upscaling and performance** — next
   Better reprojection (colour clamping), a proper upscaler instead of
   bilinear, bloom and lens effects, GPU timing per pass, tune presets on
   the 3060 Ti.
3. **The street**
   Real textures (Poly Haven / ambientCG, CC0): wet asphalt, brick, concrete,
   metal. Fake interiors behind see-through reflective windows, a few real
   shop interiors at street level. Holographic ads, animated billboards,
   steam vents, cables, more props. Original brands only.
4. **Rain and water**
   Falling rain lit by neon, splashes near the camera, ripples in puddles,
   a shallow-water simulation so water flows downhill into gutters and
   drains and puddles grow while it pours, drips off awnings and ledges,
   drops running down windows, occasional thunder and lightning.
5. **The drone** (scenery, no gameplay)
   Quadcopter with four spinning propellers, status LEDs, red/green arm
   lights, white strobe, searchlight. Downwash pushes rain sideways and
   ripples the puddles below it. Tilts when it moves.
6. **Sound**
   3D positional audio: rain on different surfaces (puddles, metal awnings,
   the drone), drips and gutters, footsteps, neon buzz, hologram glitches,
   city ambience, the drone's whir, thunder. Mostly generated in code.
7. **Intro sequence** (skippable, replayable)
   Wake up inside a helmet: muffled sound, cracked visor, rain on the glass,
   glitching HUD. A gloved hand (part of the suit) presses into a puddle —
   splash, ripples, drips. Helmet comes off: view goes sharp, sound opens
   up, helmet drops into the puddle and its HUD dies. Stand up.
8. **Polish and performance pass.**

Later options: cars (code-built or paid models), a native .exe build using
Vulkan ray tracing for a big speed-up.

## Running on a PC

```sh
cd neon-street
npm install
npm run dev
```

Open the URL in Chrome or Edge. For development with Claude Code, work in
this folder with the model set to Fable 5.1 on High effort.
