// Edge-aware a-trous wavelet filter (SVGF). Each pass widens the kernel by
// doubling the step; alpha carries the luminance variance.

struct AtrousParams {
  step: f32,
  sigmaL: f32,
  pad0: f32,
  pad1: f32,
};

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var inRad: texture_2d<f32>;
@group(0) @binding(2) var gPos: texture_2d<f32>;
@group(0) @binding(3) var gNrm: texture_2d<f32>;
@group(0) @binding(4) var outRad: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<uniform> A: AtrousParams;

const KERNEL = array<f32, 3>(0.375, 0.25, 0.0625);

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = i32(U.res.x);
  let H = i32(U.res.y);
  let pix = vec2i(gid.xy);
  if (pix.x >= W || pix.y >= H) { return; }

  let cp = textureLoad(inRad, pix, 0);
  let pp = textureLoad(gPos, pix, 0);
  if (pp.w < 0.5) {
    textureStore(outRad, pix, cp);
    return;
  }
  let np = textureLoad(gNrm, pix, 0);
  let lp = luminance(cp.rgb);

  // 3x3 Gaussian-smoothed variance drives the luminance edge weight.
  var varSum = 0.0;
  var varW = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let q = pix + vec2i(dx, dy);
      if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= H) { continue; }
      let w = select(0.0625, select(0.125, 0.25, dx == 0 && dy == 0), dx == 0 || dy == 0);
      varSum += textureLoad(inRad, q, 0).a * w;
      varW += w;
    }
  }
  let sigmaLum = A.sigmaL * sqrt(max(varSum / max(varW, 1e-4), 0.0)) + 1e-3;
  let sigmaPlane = 0.012 * max(np.w, 1.0) + 0.01;

  let step = i32(A.step);
  var sum = cp.rgb * KERNEL[0] * KERNEL[0];
  var sumVar = cp.a * KERNEL[0] * KERNEL[0] * KERNEL[0] * KERNEL[0];
  var sumW = KERNEL[0] * KERNEL[0];

  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      if (dx == 0 && dy == 0) { continue; }
      let q = pix + vec2i(dx, dy) * step;
      if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= H) { continue; }
      let qp = textureLoad(gPos, q, 0);
      if (qp.w < 0.5) { continue; }
      let qn = textureLoad(gNrm, q, 0);
      let cq = textureLoad(inRad, q, 0);
      let h = KERNEL[abs(dx)] * KERNEL[abs(dy)];
      let wn = pow(max(dot(np.xyz, qn.xyz), 0.0), 64.0);
      let planeDist = abs(dot(np.xyz, qp.xyz - pp.xyz));
      let wz = exp(-planeDist / sigmaPlane);
      let wl = exp(-abs(lp - luminance(cq.rgb)) / sigmaLum);
      let w = h * wn * wz * wl;
      sum += cq.rgb * w;
      sumVar += cq.a * w * w;
      sumW += w;
    }
  }
  textureStore(outRad, pix, vec4f(sum / sumW, sumVar / (sumW * sumW)));
}
