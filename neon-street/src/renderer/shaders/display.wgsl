// Final presentation: bicubic upscale of the HDR image, add bloom, expose,
// ACES tone map, encode to sRGB. Also hosts the debug views.

struct DisplayParams {
  exposure: f32,
  vignette: f32,
  mode: f32,        // 0 normal, 1 diffuse only, 2 albedo, 3 normals, 4 specular only
  bloom: f32,
  hdrSize: vec2f,   // render resolution
  sharpen: f32,
  pad: f32,
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

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  if (D.mode > 0.5) {
    let pix = vec2i(in.uv * D.hdrSize);
    if (D.mode < 1.5) { return vec4f(toSrgb(aces(textureLoad(dbgDiff, pix, 0).rgb * D.exposure)), 1.0); }
    if (D.mode < 2.5) { return vec4f(toSrgb(textureLoad(gAlb, pix, 0).rgb), 1.0); }
    if (D.mode < 3.5) { return vec4f(unpackNormal(textureLoad(gPos, pix, 0).w) * 0.5 + 0.5, 1.0); }
    return vec4f(toSrgb(aces(textureLoad(dbgSpec, pix, 0).rgb * D.exposure)), 1.0);
  }
  var c = sampleCatmullRom(in.uv, D.hdrSize);
  // Mild unsharp mask when upscaling, so lower render scales read crisp.
  if (D.sharpen > 0.0) {
    let t = 1.0 / D.hdrSize;
    let blur = (textureSampleLevel(hdr, samp, in.uv + vec2f(t.x, 0.0), 0.0).rgb
      + textureSampleLevel(hdr, samp, in.uv - vec2f(t.x, 0.0), 0.0).rgb
      + textureSampleLevel(hdr, samp, in.uv + vec2f(0.0, t.y), 0.0).rgb
      + textureSampleLevel(hdr, samp, in.uv - vec2f(0.0, t.y), 0.0).rgb) * 0.25;
    c = max(c + (c - blur) * D.sharpen, vec3f(0.0));
  }
  c += textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb * D.bloom;
  c *= D.exposure;
  let d = in.uv - 0.5;
  c *= 1.0 - D.vignette * dot(d, d) * 2.0;
  return vec4f(toSrgb(aces(c)), 1.0);
}
