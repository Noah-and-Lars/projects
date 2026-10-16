// Final presentation: bicubic upscale of the HDR image, add bloom, expose,
// ACES tone map, encode to sRGB. Also hosts the debug views.

struct DisplayParams {
  exposure: f32,
  vignette: f32,
  mode: f32,        // 0 normal, 1 diffuse only, 2 albedo, 3 normals, 4 specular only
  bloom: f32,
  hdrSize: vec2f,   // render resolution
  sharpen: f32,
  time: f32,
  intro: vec4f,     // eyelid, blur, visor, lift
  intro2: vec4f,    // hud boot glitch, aspect, 0, 0
};

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var hdr: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> D: DisplayParams;
@group(0) @binding(4) var<uniform> U: Uniforms;
@group(0) @binding(5) var gPos: texture_2d<f32>;
@group(0) @binding(6) var gAlb: texture_2d<f32>;
@group(0) @binding(7) var dbgDiff: texture_2d<f32>;
@group(0) @binding(8) var dbgSpec: texture_2d<f32>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = vec2f(-1.0, -1.0);
  if (i == 1u) { p = vec2f(3.0, -1.0); }
  if (i == 2u) { p = vec2f(-1.0, 3.0); }
  var o: VSOut;
  o.pos = vec4f(p, 0.0, 1.0);
  o.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return o;
}

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

// Catmull-Rom bicubic with 9 bilinear fetches (Jimenez / Pettineo).
fn sampleCatmullRom(uv: vec2f, size: vec2f) -> vec3f {
  let samplePos = uv * size;
  let texPos1 = floor(samplePos - 0.5) + 0.5;
  let f = samplePos - texPos1;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let offset12 = w2 / w12;
  let texPos0 = (texPos1 - 1.0) / size;
  let texPos3 = (texPos1 + 2.0) / size;
  let texPos12 = (texPos1 + offset12) / size;
  var r = vec3f(0.0);
  r += textureSampleLevel(hdr, samp, vec2f(texPos0.x, texPos0.y), 0.0).rgb * w0.x * w0.y;
  r += textureSampleLevel(hdr, samp, vec2f(texPos12.x, texPos0.y), 0.0).rgb * w12.x * w0.y;
  r += textureSampleLevel(hdr, samp, vec2f(texPos3.x, texPos0.y), 0.0).rgb * w3.x * w0.y;
  r += textureSampleLevel(hdr, samp, vec2f(texPos0.x, texPos12.y), 0.0).rgb * w0.x * w12.y;
  r += textureSampleLevel(hdr, samp, vec2f(texPos12.x, texPos12.y), 0.0).rgb * w12.x * w12.y;
  r += textureSampleLevel(hdr, samp, vec2f(texPos3.x, texPos12.y), 0.0).rgb * w3.x * w12.y;
  r += textureSampleLevel(hdr, samp, vec2f(texPos0.x, texPos3.y), 0.0).rgb * w0.x * w3.y;
  r += textureSampleLevel(hdr, samp, vec2f(texPos12.x, texPos3.y), 0.0).rgb * w12.x * w3.y;
  r += textureSampleLevel(hdr, samp, vec2f(texPos3.x, texPos3.y), 0.0).rgb * w3.x * w3.y;
  return max(r, vec3f(0.0));
}

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Helmet visor seen from inside: frame, cracks, rain drops, fog, a booting HUD.
struct Visor {
  uvOffset: vec2f, // refraction through drops and cracks
  dark: f32,       // frame coverage
  fog: f32,
  hud: vec3f,
};

fn visorFx(uv0: vec2f) -> Visor {
  var v: Visor;
  v.uvOffset = vec2f(0.0);
  v.dark = 0.0;
  v.fog = 0.0;
  v.hud = vec3f(0.0);
  let lift = D.intro.w;
  let aspect = D.intro2.y;
  // The whole helmet slides up and away as it is taken off.
  let uv = uv0 + vec2f(0.0, lift * 1.3);
  let c = vec2f((uv.x - 0.5) * aspect, uv.y - 0.5);
  // Opening: a rounded rectangle, wider than tall, with a brow and a chin bar.
  let w = 0.83 - 0.12 * smoothstep(0.0, 0.5, abs(c.y) * 2.0);
  let h = 0.46;
  let dx = abs(c.x) - w * 0.5;
  let dy = abs(c.y) - h;
  let outside = max(dx, dy);
  v.dark = smoothstep(-0.02, 0.03, outside);
  // Chin bar notch and brow.
  if (c.y < -0.3 && abs(c.x) < 0.22) { v.dark = max(v.dark, smoothstep(-0.34, -0.3, c.y) * (1.0 - smoothstep(-0.3, -0.26, c.y))); }
  v.fog = smoothstep(-0.25, 0.02, outside) * 0.55;
  // Cracks radiating from a hit point on the upper left.
  let hit = vec2f(-0.42, 0.22);
  let d = c - hit;
  let ang = atan2(d.y, d.x);
  let r = length(d);
  var crack = 0.0;
  for (var i = 0; i < 5; i++) {
    let a0 = -0.4 + f32(i) * 0.55 + 0.2 * hash21(vec2f(f32(i), 1.0));
    let wob = 0.06 * sin(r * 30.0 + f32(i) * 2.0);
    let da = abs(ang - a0 - wob);
    let len = 0.25 + 0.3 * hash21(vec2f(f32(i), 2.0));
    crack = max(crack, smoothstep(0.012, 0.0, da * r) * (1.0 - smoothstep(len * 0.6, len, r)));
  }
  v.uvOffset += vec2f(crack * 0.006, -crack * 0.004);
  v.hud += vec3f(0.9) * crack * 0.35;
  // Rain drops on the outside of the visor: sparse, slowly sliding down.
  let cell = floor(uv * vec2f(14.0, 9.0));
  let seed = hash21(cell + 7.0);
  if (seed < 0.3) {
    let slide = fract(D.time * (0.02 + 0.06 * seed) + seed);
    let centre = vec2f(0.5 + 0.3 * (hash21(cell) - 0.5), 1.0 - slide);
    let f = (fract(uv * vec2f(14.0, 9.0)) - centre) * vec2f(1.0, 0.7);
    let dd = dot(f, f) * 40.0;
    if (dd < 1.0) { v.uvOffset += f * (1.0 - dd) * 0.08; }
  }
  // HUD: cyan readouts on the left, a status bar on the right, booting with glitches.
  let boot = D.intro2.x;
  let glitchRow = step(0.75, hash21(vec2f(floor(uv.y * 40.0), floor(D.time * 9.0)))) * boot;
  let gx = uv.x + glitchRow * 0.03;
  var hud = 0.0;
  // Text-like rows.
  for (var row = 0; row < 5; row++) {
    let ry = 0.66 - f32(row) * 0.045;
    if (abs(uv.y - ry) < 0.012 && gx > 0.08 && gx < 0.28) {
      let cellx = floor((gx - 0.08) * 90.0);
      let on = hash21(vec2f(cellx, f32(row) + floor(D.time * 0.5))) > 0.42;
      hud += select(0.0, 1.0, on) * 0.8;
    }
  }
  // Integrity bar.
  if (abs(uv.y - 0.33) < 0.01 && gx > 0.08 && gx < 0.3) {
    let fill = 0.64 + 0.03 * sin(D.time * 3.0);
    hud += select(0.25, 1.0, (gx - 0.08) / 0.22 < fill);
  }
  // Right-side ticks and a reticle.
  if (gx > 0.72 && gx < 0.74 && fract(uv.y * 12.0) < 0.3 && uv.y > 0.3 && uv.y < 0.7) { hud += 0.7; }
  let rc = length(c * vec2f(1.0, 1.0));
  hud += smoothstep(0.012, 0.0, abs(rc - 0.1)) * 0.4 * step(0.6, fract(ang * 1.0 + D.time * 0.2));
  // Flicker while booting.
  let flick = mix(1.0, step(0.3, hash21(vec2f(floor(D.time * 22.0), 3.0))), boot);
  v.hud += vec3f(0.35, 1.0, 1.1) * hud * 0.35 * flick * (1.0 - v.dark);
  return v;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  if (D.mode > 4.5) {
    // Uniform sanity view: searchlight intensity, object 0 active, object 0 height.
    return vec4f(U.s0.w / 200.0, select(0.0, 1.0, U.objs[0].pos.w >= 0.0), U.objs[0].pos.y / 10.0, 1.0);
  }
  if (D.mode > 0.5) {
    let pix = vec2i(in.uv * D.hdrSize);
    if (D.mode < 1.5) { return vec4f(toSrgb(aces(textureLoad(dbgDiff, pix, 0).rgb * D.exposure)), 1.0); }
    if (D.mode < 2.5) { return vec4f(toSrgb(textureLoad(gAlb, pix, 0).rgb), 1.0); }
    if (D.mode < 3.5) { return vec4f(unpackNormal(textureLoad(gPos, pix, 0).w) * 0.5 + 0.5, 1.0); }
    return vec4f(toSrgb(aces(textureLoad(dbgSpec, pix, 0).rgb * D.exposure)), 1.0);
  }
  var uv = in.uv;
  var visor: Visor;
  visor.dark = 0.0; visor.fog = 0.0; visor.hud = vec3f(0.0); visor.uvOffset = vec2f(0.0);
  if (D.intro.z > 0.0) {
    visor = visorFx(in.uv);
    uv += visor.uvOffset * D.intro.z;
  }
  var c = sampleCatmullRom(uv, D.hdrSize);
  // Mild unsharp mask when upscaling, so lower render scales read crisp.
  if (D.sharpen > 0.0) {
    let t = 1.0 / D.hdrSize;
    let blur = (textureSampleLevel(hdr, samp, uv + vec2f(t.x, 0.0), 0.0).rgb
      + textureSampleLevel(hdr, samp, uv - vec2f(t.x, 0.0), 0.0).rgb
      + textureSampleLevel(hdr, samp, uv + vec2f(0.0, t.y), 0.0).rgb
      + textureSampleLevel(hdr, samp, uv - vec2f(0.0, t.y), 0.0).rgb) * 0.25;
    c = max(c + (c - blur) * D.sharpen, vec3f(0.0));
  }
  let bloomS = textureSampleLevel(bloomTex, samp, uv, 0.0).rgb;
  // Out of focus: the bloom chain runs unthresholded while D.intro.y > 0.
  if (D.intro.y > 0.0) { c = mix(c, bloomS, D.intro.y * 0.9); }
  c += bloomS * D.bloom;
  c *= D.exposure;
  let d = uv - 0.5;
  c *= 1.0 - D.vignette * dot(d, d) * 2.0;
  if (D.intro.z > 0.0) {
    let k = D.intro.z;
    // Fogged edges of the glass, the dark helmet frame, and the HUD glow.
    c = mix(c, vec3f(0.35, 0.4, 0.45) * (0.3 + luminance(c)), visor.fog * k);
    c = mix(c, vec3f(0.01, 0.01, 0.012), visor.dark * k);
    c += visor.hud * k;
  }
  // Eyelids: dark reddish lids closing from the top and bottom.
  if (D.intro.x > 0.0) {
    let open = 1.0 - D.intro.x;
    let edge = abs(in.uv.y - 0.5) - 0.5 * open * (1.0 + 0.15 * sin(in.uv.x * 6.0));
    let lid = smoothstep(-0.06, 0.02, edge);
    c = mix(c, vec3f(0.03, 0.006, 0.004) * (1.0 - lid * 0.5), lid);
  }
  return vec4f(toSrgb(aces(c)), 1.0);
}
