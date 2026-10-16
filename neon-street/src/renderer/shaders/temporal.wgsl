// Temporal accumulation (SVGF-style): reproject the previous frame's history
// with the previous camera and blend when the geometry matches.

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var curRad: texture_2d<f32>;
@group(0) @binding(2) var curPos: texture_2d<f32>;   // xyz, w = packed normal
@group(0) @binding(3) var prevHist: texture_2d<f32>;
@group(0) @binding(4) var prevMom: texture_2d<f32>;
@group(0) @binding(5) var prevPos: texture_2d<f32>;
@group(0) @binding(6) var outHist: texture_storage_2d<rgba16float, write>;
@group(0) @binding(7) var outMom: texture_storage_2d<rgba16float, write>;
// Directly visible emission is deterministic but sampled with a per-frame
// jitter, so it is accumulated the same way to anti-alias it.
@group(0) @binding(8) var curEmit: texture_2d<f32>;
@group(0) @binding(9) var prevEmit: texture_2d<f32>;
@group(0) @binding(10) var outEmit: texture_storage_2d<rgba16float, write>;

// Project a world position with the previous frame's camera. Returns pixel
// coordinates (unrounded) and the view depth in z; z <= 0 means behind.
fn projectPrev(p: vec3f) -> vec3f {
  let v = p - U.pCamPos.xyz;
  let z = dot(v, U.pCamFwd.xyz);
  let tanH = U.pCamPos.w;
  let aspect = U.pCamFwd.w;
  let x = dot(v, U.pCamRight.xyz) / (max(z, 1e-4) * tanH * aspect);
  let y = dot(v, U.pCamUp.xyz) / (max(z, 1e-4) * tanH);
  let px = (x * 0.5 + 0.5) * U.res.x - 0.5;
  let py = (0.5 - y * 0.5) * U.res.y - 0.5;
  return vec3f(px, py, z);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = i32(U.res.x);
  let H = i32(U.res.y);
  let pix = vec2i(gid.xy);
  if (pix.x >= W || pix.y >= H) { return; }

  let spp = max(U.p2.w, 1.0);
  let c = textureLoad(curRad, pix, 0).rgb / spp;
  let pos4 = textureLoad(curPos, pix, 0);
  let pos = pos4.xyz;
  let nrm = unpackNormal(pos4.w);
  let dist = length(pos - U.camPos.xyz);
  let lc = luminance(c);

  let e = textureLoad(curEmit, pix, 0).rgb;
  var hist = vec3f(0.0);
  var mom = vec3f(0.0);
  var emitHist = vec3f(0.0);
  var sumW = 0.0;
  let reset = U.p1.z > 0.5;
  if (!reset) {
    let pp = projectPrev(pos);
    if (pp.z > 0.01) {
      let base = vec2i(floor(pp.xy));
      let f = fract(pp.xy);
      let wts = array<f32, 4>((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
      let offs = array<vec2i, 4>(vec2i(0, 0), vec2i(1, 0), vec2i(0, 1), vec2i(1, 1));
      for (var i = 0; i < 4; i++) {
        let q = base + offs[i];
        if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= H) { continue; }
        let qp4 = textureLoad(prevPos, q, 0);
        let planeDist = abs(dot(nrm, qp4.xyz - pos));
        if (planeDist > 0.02 + 0.015 * dist) { continue; }
        if (dot(unpackNormal(qp4.w), nrm) < 0.85) { continue; }
        let w = wts[i];
        hist += textureLoad(prevHist, q, 0).rgb * w;
        mom += textureLoad(prevMom, q, 0).xyz * w;
        emitHist += textureLoad(prevEmit, q, 0).rgb * w;
        sumW += w;
      }
    }
  }

  var histLen = 0.0;
  if (sumW > 0.01) {
    hist /= sumW;
    mom /= sumW;
    emitHist /= sumW;
    histLen = mom.z;
  } else {
    hist = c;
    mom = vec3f(lc, lc * lc, 0.0);
    emitHist = e;
  }

  let n = min(histLen + 1.0, max(U.p1.y, 1.0));
  let alpha = 1.0 / n;
  let color = mix(hist, c, alpha);
  let m1 = mix(mom.x, lc, alpha);
  let m2 = mix(mom.y, lc * lc, alpha);
  var variance = max(0.0, m2 - m1 * m1);

  // Young history: fall back to a spatial variance estimate so the blur
  // knows the pixel is still noisy.
  if (n < 4.0) {
    var s1 = 0.0;
    var s2 = 0.0;
    var cnt = 0.0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let q = pix + vec2i(dx, dy);
        if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= H) { continue; }
        let lq = luminance(textureLoad(curRad, q, 0).rgb / spp);
        s1 += lq;
        s2 += lq * lq;
        cnt += 1.0;
      }
    }
    let mean = s1 / cnt;
    variance = max(variance, max(0.0, s2 / cnt - mean * mean) * 2.0);
  }

  textureStore(outHist, pix, vec4f(color, variance));
  textureStore(outMom, pix, vec4f(m1, m2, n, 0.0));
  // Emission converges faster than radiance; a shorter window keeps it from smearing.
  textureStore(outEmit, pix, vec4f(mix(emitHist, e, max(alpha, 1.0 / 12.0)), 1.0));
}
