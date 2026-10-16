// Bloom: progressive downsample of the bright part of the HDR image, then an
// additive tent upsample back up the chain. Based on the Call of Duty:
// Advanced Warfare presentation (Jimenez 2014).

struct BloomParams {
  srcSize: vec2f,   // source texture size in pixels
  dstSize: vec2f,   // destination texture size in pixels
  threshold: f32,   // first downsample only: soft knee threshold
  knee: f32,
  mode: f32,        // 0 = downsample (first), 1 = downsample, 2 = upsample
  pad: f32,
};

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> B: BloomParams;
@group(0) @binding(4) var prev: texture_2d<f32>; // upsample: the same-size mip to add to

fn tap(uv: vec2f) -> vec3f {
  return textureSampleLevel(src, samp, uv, 0.0).rgb;
}

fn soften(c: vec3f) -> vec3f {
  // Soft threshold that keeps a little of the mid-tones for a gentle glow.
  let l = luminance(c);
  let k = B.knee;
  let soft = clamp(l - B.threshold + k, 0.0, 2.0 * k);
  let contrib = max(soft * soft / (4.0 * k + 1e-4), l - B.threshold);
  return c * (max(contrib, 0.0) / max(l, 1e-4));
}

// Karis average on the first downsample tames fireflies.
fn karis(c: vec3f) -> f32 {
  return 1.0 / (1.0 + luminance(c));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pix = vec2i(gid.xy);
  if (pix.x >= i32(B.dstSize.x) || pix.y >= i32(B.dstSize.y)) { return; }
  let uv = (vec2f(pix) + 0.5) / B.dstSize;
  let texel = 1.0 / B.srcSize;

  if (B.mode < 1.5) {
    // 13-tap downsample.
    let a = tap(uv + texel * vec2f(-2.0, -2.0));
    let b = tap(uv + texel * vec2f(0.0, -2.0));
    let c = tap(uv + texel * vec2f(2.0, -2.0));
    let d = tap(uv + texel * vec2f(-2.0, 0.0));
    let e = tap(uv);
    let f = tap(uv + texel * vec2f(2.0, 0.0));
    let g = tap(uv + texel * vec2f(-2.0, 2.0));
    let h = tap(uv + texel * vec2f(0.0, 2.0));
    let i = tap(uv + texel * vec2f(2.0, 2.0));
    let j = tap(uv + texel * vec2f(-1.0, -1.0));
    let k = tap(uv + texel * vec2f(1.0, -1.0));
    let l = tap(uv + texel * vec2f(-1.0, 1.0));
    let m = tap(uv + texel * vec2f(1.0, 1.0));
    var o: vec3f;
    if (B.mode < 0.5) {
      let g0 = (j + k + l + m) * 0.25;
      let g1 = (a + b + d + e) * 0.25;
      let g2 = (b + c + e + f) * 0.25;
      let g3 = (d + e + g + h) * 0.25;
      let g4 = (e + f + h + i) * 0.25;
      let w0 = karis(g0) * 0.5;
      let w1 = karis(g1) * 0.125;
      let w2 = karis(g2) * 0.125;
      let w3 = karis(g3) * 0.125;
      let w4 = karis(g4) * 0.125;
      o = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
      o = soften(o);
    } else {
      o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    }
    textureStore(dst, pix, vec4f(o, 1.0));
  } else {
    // 9-tap tent upsample added onto the next finer mip.
    let r = texel * 1.0;
    var o = tap(uv) * 4.0;
    o += (tap(uv + vec2f(-r.x, 0.0)) + tap(uv + vec2f(r.x, 0.0)) + tap(uv + vec2f(0.0, -r.y)) + tap(uv + vec2f(0.0, r.y))) * 2.0;
    o += tap(uv + vec2f(-r.x, -r.y)) + tap(uv + vec2f(r.x, -r.y)) + tap(uv + vec2f(-r.x, r.y)) + tap(uv + vec2f(r.x, r.y));
    o /= 16.0;
    let base = textureLoad(prev, pix, 0).rgb;
    textureStore(dst, pix, vec4f(base + o, 1.0));
  }
}
