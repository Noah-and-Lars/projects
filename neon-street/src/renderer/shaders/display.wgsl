// Final composite: remodulate albedo, add direct emission, expose, tone map,
// encode to sRGB. Also hosts the debug views.

struct DisplayParams {
  exposure: f32,
  vignette: f32,
  mode: f32, // 0 normal, 1 radiance only, 2 albedo only, 3 normals
  pad: f32,
};

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var rad: texture_2d<f32>;
@group(0) @binding(2) var alb: texture_2d<f32>;
@group(0) @binding(3) var emit: texture_2d<f32>;
@group(0) @binding(4) var<uniform> D: DisplayParams;
@group(0) @binding(5) var gPos: texture_2d<f32>;
@group(0) @binding(6) var<uniform> U: Uniforms;

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

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let r = textureSampleLevel(rad, samp, in.uv, 0.0).rgb;
  let a = textureSampleLevel(alb, samp, in.uv, 0.0).rgb;
  let e = textureSampleLevel(emit, samp, in.uv, 0.0).rgb;
  var c = r * a + e;
  if (D.mode > 0.5 && D.mode < 1.5) { c = r; }
  if (D.mode > 1.5 && D.mode < 2.5) { return vec4f(toSrgb(a), 1.0); }
  if (D.mode > 2.5) {
    let pix = vec2i(in.uv * U.res.xy);
    let n = unpackNormal(textureLoad(gPos, pix, 0).w);
    return vec4f(n * 0.5 + 0.5, 1.0);
  }
  c *= D.exposure;
  let d = in.uv - 0.5;
  c *= 1.0 - D.vignette * dot(d, d) * 2.0;
  return vec4f(toSrgb(aces(c)), 1.0);
}
