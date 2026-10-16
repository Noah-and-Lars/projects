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
2. **Denoiser, upscaling and performance** — DONE
   Diffuse/specular split with virtual-point reprojection for sharp
   reflections in motion, light grid along the street, bloom, bicubic
   upscale with sharpening, per-pass GPU timing, presets retuned for a
   3060 Ti (measured 18 fps on the old Ultra).
3. **The street** — DONE
   Eight CC0 ambientCG textures with normal mapping (asphalt, paving,
   bricks, concrete, metal). Interior-mapped rooms behind every lit window
   and shopfront (parallax, ceiling lights, shelves, flickering TVs),
   animated billboards, floating holograms, procedural glyph neon,
   balconies, an overhead walkway, drains, manholes, banners, zebra
   crossings and distant towers with beacons.
4. **Rain and water** — DONE
   GPU shallow-water simulation on a 10 cm grid (crowned road, gutters,
   dips, drains): rain fills it, water flows downhill and pools, a wave
   layer carries raindrop and footstep ripples into the puddle normals.
   Rain streaks and splashes as GPU particles around the camera, lit by a
   progressive irradiance probe volume and depth-tested against the path
   tracer's G-buffer; drips from awnings and the walkway; animated drops
   running down every pane; a wet sheen at the foot of the walls; lightning
   flashes with a temporal-blend boost so they read instantly.
5. **The drone** — DONE
   H-frame quadcopter traced as a rigidly transformed second BVH: four
   blurred prop discs, status LEDs, red/green nav lights, tail strobe,
   rail LED strips, camera gimbal. Analytic searchlight sampled by
   surfaces, fog (visible beam) and the probe volume. Patrols waypoints,
   hovers, tilts into motion, sweeps the light; downwash ripples the
   puddles and blows rain outward.
6. **Sound** — DONE
   Procedural Web Audio: rain bed muffled under cover, awning drumming,
   drips at the nearest awnings, footsteps and splashes, neon hum with
   crackle, hologram bleeps, city rumble, distant sirens, drone rotors
   with doppler, thunder after lightning, synthetic street reverb.
7. **Intro sequence** — DONE (skip with Space/click, replay from the menu)
   Wake up inside a cracked helmet: eyelids, blur, rain on the visor,
   booting HUD, muffled breathing. Sit up, press a gloved hand into a
   puddle (ripples, splash, drips). Both hands lift the helmet off: the
   view clears, sound opens up, the helmet drops beside you and its HUD
   dies. Stand up and take control.
8. **Polish and performance pass** — next (needs measurements on the 3060 Ti).

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
