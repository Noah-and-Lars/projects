// Temporal accumulation (SVGF-style) for the diffuse and specular channels.
//
// Diffuse history is found by reprojecting the surface point with the
// previous camera. Specular history on smooth surfaces is found by
// reprojecting the *virtual* point behind the mirror (camera ray extended by
// the reflection distance), which is where the reflected object actually
// appears, so reflections stay sharp while the camera moves.

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var curRad: texture_2d<u32>;   // packed diff + spec sums
@group(0) @binding(2) var curPos: texture_2d<f32>;   // xyz, w = packed normal
@group(0) @binding(3) var curAlb: texture_2d<f32>;   // a = roughness
@group(0) @binding(4) var curEmit: texture_2d<f32>;  // rgb emission, a = reflection distance
@group(0) @binding(5) var prevDiff: texture_2d<f32>;
@group(0) @binding(6) var prevSpec: texture_2d<f32>;
@group(0) @binding(7) var prevMom: texture_2d<f32>;  // dm1, dm2, diffLen, specLen
@group(0) @binding(8) var prevEmit: texture_2d<f32>;
@group(0) @binding(9) var prevPos: texture_2d<f32>;
@group(0) @binding(10) var outDiff: texture_storage_2d<rgba16float, write>;
@group(0) @binding(11) var outSpec: texture_storage_2d<rgba16float, write>;
@group(0) @binding(12) var outMom: texture_storage_2d<rgba16float, write>;
@group(0) @binding(13) var outEmit: texture_storage_2d<rgba16float, write>;

struct Unpacked {
  diff: vec3f,
  spec: vec3f,
};

fn unpackRad(pix: vec2i) -> Unpacked {
  let v = textureLoad(curRad, pix, 0);
  let p0 = unpack2x16float(v.x);
  let p1 = unpack2x16float(v.y);
  let p2 = unpack2x16float(v.z);
  var u: Unpacked;
  let spp = max(U.p2.w, 1.0);
  u.diff = vec3f(p0, p1.x) / spp;
  u.spec = vec3f(p1.y, p2) / spp;
  return u;
}

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

struct Taps {
  w: array<f32, 4>,
  q: array<vec2i, 4>,
  sumW: f32,
};

// Bilinear taps around a previous-frame position, keeping only those whose
// stored surface lies on the current pixel's plane with a matching normal.
fn gatherTaps(tgt: vec3f, pos: vec3f, nrm: vec3f, dist: f32) -> Taps {
  var t: Taps;
  t.sumW = 0.0;
  let W = i32(U.res.x);
  let H = i32(U.res.y);
  let pp = projectPrev(tgt);
  if (pp.z <= 0.01) { return t; }
  let base = vec2i(floor(pp.xy));
  let f = fract(pp.xy);
  let wts = array<f32, 4>((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  let offs = array<vec2i, 4>(vec2i(0, 0), vec2i(1, 0), vec2i(0, 1), vec2i(1, 1));
  for (var i = 0; i < 4; i++) {
    let q = base + offs[i];
    t.q[i] = q;
    t.w[i] = 0.0;
    if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= H) { continue; }
    let qp4 = textureLoad(prevPos, q, 0);
    let planeDist = abs(dot(nrm, qp4.xyz - pos));
    if (planeDist > 0.02 + 0.015 * dist) { continue; }
    if (dot(unpackNormal(qp4.w), nrm) < 0.85) { continue; }
    t.w[i] = wts[i];
    t.sumW += wts[i];
  }
  return t;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = i32(U.res.x);
  let H = i32(U.res.y);
  let pix = vec2i(gid.xy);
  if (pix.x >= W || pix.y >= H) { return; }

  let cur = unpackRad(pix);
  let pos4 = textureLoad(curPos, pix, 0);
  let pos = pos4.xyz;
  let nrm = unpackNormal(pos4.w);
  let toCam = pos - U.camPos.xyz;
  let dist = length(toCam);
  let rough = textureLoad(curAlb, pix, 0).a;
  let emit4 = textureLoad(curEmit, pix, 0);
  let ld = luminance(cur.diff);
  let reset = U.p1.z > 0.5;
  let maxHist = max(U.p1.y, 1.0);

  // ---- diffuse + emission: surface reprojection
  var dHist = cur.diff;
  var eHist = emit4.rgb;
  var mom = vec3f(ld, ld * ld, 0.0);
  var dLen = 0.0;
  if (!reset) {
    let t = gatherTaps(pos, pos, nrm, dist);
    if (t.sumW > 0.01) {
      dHist = vec3f(0.0);
      eHist = vec3f(0.0);
      mom = vec3f(0.0);
      for (var i = 0; i < 4; i++) {
        if (t.w[i] <= 0.0) { continue; }
        let w = t.w[i] / t.sumW;
        dHist += textureLoad(prevDiff, t.q[i], 0).rgb * w;
        eHist += textureLoad(prevEmit, t.q[i], 0).rgb * w;
        mom += textureLoad(prevMom, t.q[i], 0).xyz * w;
      }
      dLen = mom.z;
    }
  }
  let nD = min(dLen + 1.0, maxHist);
  let aD = 1.0 / nD;
  let diff = mix(dHist, cur.diff, aD);
  let m1 = mix(mom.x, ld, aD);
  let m2 = mix(mom.y, ld * ld, aD);
  var dVar = max(0.0, m2 - m1 * m1);
  let emit = mix(eHist, emit4.rgb, max(aD, 1.0 / 12.0));

  // ---- specular: virtual-point reprojection on smooth surfaces
  var sHist = cur.spec;
  var sLen = 0.0;
  if (!reset) {
    var tgt = pos;
    if (rough < 0.35 && emit4.a > 0.0) {
      tgt = U.camPos.xyz + toCam * ((dist + emit4.a) / max(dist, 1e-3));
    }
    let t = gatherTaps(tgt, pos, nrm, dist);
    if (t.sumW > 0.01) {
      sHist = vec3f(0.0);
      var lenSum = 0.0;
      for (var i = 0; i < 4; i++) {
        if (t.w[i] <= 0.0) { continue; }
        let w = t.w[i] / t.sumW;
        sHist += textureLoad(prevSpec, t.q[i], 0).rgb * w;
        lenSum += textureLoad(prevMom, t.q[i], 0).w * w;
      }
      sLen = lenSum;
    }
  }
  // Reflections on rougher surfaces blur anyway; keep their history shorter so
  // the approximate reprojection cannot smear them.
  let specMax = mix(maxHist, min(maxHist, 10.0), smoothstep(0.1, 0.5, rough));
  let nS = min(sLen + 1.0, specMax);
  let aS = 1.0 / nS;
  let spec = mix(sHist, cur.spec, aS);

  // ---- variance: spatial estimate for young history and for specular
  var s1 = 0.0;
  var s2 = 0.0;
  var p1 = 0.0;
  var p2 = 0.0;
  var cnt = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let q = pix + vec2i(dx, dy);
      if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= H) { continue; }
      let u = unpackRad(q);
      let a = luminance(u.diff);
      let b = luminance(u.spec);
      s1 += a; s2 += a * a;
      p1 += b; p2 += b * b;
      cnt += 1.0;
    }
  }
  let dMean = s1 / cnt;
  let sMean = p1 / cnt;
  let dSpatial = max(0.0, s2 / cnt - dMean * dMean);
  let sSpatial = max(0.0, p2 / cnt - sMean * sMean);
  if (nD < 4.0) { dVar = max(dVar, dSpatial * 2.0); }
  let sVar = sSpatial / nS;

  textureStore(outDiff, pix, vec4f(diff, dVar));
  textureStore(outSpec, pix, vec4f(spec, sVar));
  textureStore(outMom, pix, vec4f(m1, m2, nD, nS));
  textureStore(outEmit, pix, vec4f(emit, 1.0));
}
