// Path tracing kernel: one light path per pixel per dispatch.
//
// Output `outRad` is the running sum over this frame's samples, divided by
// the primary surface albedo (the denoiser works on demodulated radiance and
// the display pass multiplies the albedo back in).

struct Tri {
  v0: vec4f, // xyz, w = material id
  v1: vec4f, // xyz, w = light index or -1
  v2: vec4f, // xyz, w = area
  n: vec4f,  // geometric normal
};

struct Node {
  bmin: vec3f,
  lf: u32,   // left child, or first triangle for leaves
  bmax: vec3f,
  cnt: u32,  // 0 = interior node
};

struct Material {
  base: vec4f,  // rgb base colour, a = metallic
  emis: vec4f,  // rgb emitted radiance
  prm: vec4f,   // roughness, ior, flags, kind
  extra: vec4f, // procedural parameters
};

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var<storage, read> tris: array<Tri>;
@group(0) @binding(2) var<storage, read> nodes: array<Node>;
@group(0) @binding(3) var<storage, read> triIdx: array<u32>;
@group(0) @binding(4) var<storage, read> mats: array<Material>;
@group(0) @binding(5) var<storage, read> lightTris: array<u32>;
@group(0) @binding(6) var<storage, read> lightCdf: array<f32>;

@group(1) @binding(0) var accumIn: texture_2d<f32>;
@group(1) @binding(1) var outRad: texture_storage_2d<rgba16float, write>;
@group(1) @binding(2) var outPos: texture_storage_2d<rgba32float, write>;
@group(1) @binding(3) var outNrm: texture_storage_2d<rgba16float, write>;
@group(1) @binding(4) var outAlb: texture_storage_2d<rgba16float, write>;

const NO_HIT: u32 = 0xffffffffu;
const T_MAX: f32 = 1e30;
const FOG_FAR: f32 = 400.0;
const FOG_ALBEDO: f32 = 0.9;
const FOG_G: f32 = 0.55;
const KIND_OPAQUE: u32 = 0u;
const KIND_GLASS: u32 = 1u;
const KIND_EMITTER: u32 = 2u;
const FLAG_ROAD: u32 = 1u;
const FLAG_WINDOW: u32 = 2u;
const FLAG_GRIME: u32 = 4u;
const FLAG_SIDEWALK: u32 = 8u;

// ---------------------------------------------------------------- random

var<private> rngState: u32;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

fn rnd() -> f32 {
  rngState = pcg(rngState);
  return f32(rngState) * 2.3283064365386963e-10;
}

// ----------------------------------------------------------------- noise

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 4; i++) {
    s += a * vnoise(q);
    q = q * 2.03 + vec2f(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}

// --------------------------------------------------------- intersection

struct Hit {
  t: f32,
  tri: u32,
};

fn aabbHit(bmin: vec3f, bmax: vec3f, ro: vec3f, invDir: vec3f, tmax: f32) -> f32 {
  let t0 = (bmin - ro) * invDir;
  let t1 = (bmax - ro) * invDir;
  let tn3 = min(t0, t1);
  let tf3 = max(t0, t1);
  let tn = max(max(tn3.x, tn3.y), max(tn3.z, 0.0));
  let tf = min(min(tf3.x, tf3.y), min(tf3.z, tmax));
  return select(T_MAX, tn, tn <= tf);
}

fn triHit(i: u32, ro: vec3f, rd: vec3f) -> f32 {
  let tr = tris[i];
  let e1 = tr.v1.xyz - tr.v0.xyz;
  let e2 = tr.v2.xyz - tr.v0.xyz;
  let p = cross(rd, e2);
  let det = dot(e1, p);
  if (abs(det) < 1e-9) { return T_MAX; }
  let inv = 1.0 / det;
  let s = ro - tr.v0.xyz;
  let u = dot(s, p) * inv;
  if (u < 0.0 || u > 1.0) { return T_MAX; }
  let q = cross(s, e1);
  let v = dot(rd, q) * inv;
  if (v < 0.0 || u + v > 1.0) { return T_MAX; }
  let t = dot(e2, q) * inv;
  return select(T_MAX, t, t > 1e-4);
}

fn intersectScene(ro: vec3f, rd: vec3f, tmax0: f32) -> Hit {
  var best = Hit(tmax0, NO_HIT);
  let invDir = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
  var stack: array<u32, 48>;
  var sp = 0u;
  var node = 0u;
  loop {
    let n = nodes[node];
    if (n.cnt > 0u) {
      for (var k = 0u; k < n.cnt; k++) {
        let ti = triIdx[n.lf + k];
        let t = triHit(ti, ro, rd);
        if (t < best.t) { best = Hit(t, ti); }
      }
      if (sp == 0u) { break; }
      sp--;
      node = stack[sp];
      continue;
    }
    let l = n.lf;
    let r = n.lf + 1u;
    let nl = nodes[l];
    let nr = nodes[r];
    var tl = aabbHit(nl.bmin, nl.bmax, ro, invDir, best.t);
    var tr = aabbHit(nr.bmin, nr.bmax, ro, invDir, best.t);
    var near = l;
    var far = r;
    if (tr < tl) {
      let tmp = tl; tl = tr; tr = tmp;
      near = r; far = l;
    }
    if (tl >= T_MAX) {
      if (sp == 0u) { break; }
      sp--;
      node = stack[sp];
      continue;
    }
    node = near;
    if (tr < T_MAX && sp < 48u) {
      stack[sp] = far;
      sp++;
    }
  }
  return best;
}

fn occluded(ro: vec3f, rd: vec3f, tmax: f32) -> bool {
  let invDir = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
  var stack: array<u32, 48>;
  var sp = 0u;
  var node = 0u;
  loop {
    let n = nodes[node];
    if (n.cnt > 0u) {
      for (var k = 0u; k < n.cnt; k++) {
        let t = triHit(triIdx[n.lf + k], ro, rd);
        if (t < tmax) { return true; }
      }
      if (sp == 0u) { break; }
      sp--;
      node = stack[sp];
      continue;
    }
    let l = n.lf;
    let r = n.lf + 1u;
    let nl = nodes[l];
    let nr = nodes[r];
    let tl = aabbHit(nl.bmin, nl.bmax, ro, invDir, tmax);
    let tr = aabbHit(nr.bmin, nr.bmax, ro, invDir, tmax);
    if (tl >= T_MAX && tr >= T_MAX) {
      if (sp == 0u) { break; }
      sp--;
      node = stack[sp];
      continue;
    }
    if (tl < T_MAX && tr < T_MAX) {
      node = l;
      if (sp < 48u) { stack[sp] = r; sp++; }
    } else {
      node = select(r, l, tl < T_MAX);
    }
  }
  return false;
}

// ------------------------------------------------------------ materials

struct Surf {
  p: vec3f,
  n: vec3f,      // shading normal, facing the incoming ray
  ng: vec3f,     // stored geometric normal
  base: vec3f,
  metallic: f32,
  rough: f32,
  emis: vec3f,
  kind: u32,
  ior: f32,
  inside: bool,
};

// Emission pattern for lit windows: curtains, a darker ceiling, frame bars.
fn windowPattern(m: Material, p: vec3f, n: vec3f) -> f32 {
  let along = select(p.x, p.z, abs(n.x) > 0.5);
  let v = clamp((p.y - m.extra.x) / max(m.extra.y, 0.01), 0.0, 1.0);
  let seed = m.extra.z;
  var b = 0.5 + 0.5 * vnoise(vec2f(along * 1.7 + seed, v * 2.2 + seed * 0.37));
  b *= 0.65 + 0.35 * (1.0 - v);
  // Shopfronts (extra.w == 1) get bright product-shelf bands instead.
  if (m.extra.w > 0.5) {
    b = 0.55 + 0.45 * vnoise(vec2f(along * 0.9 + seed, v * 4.0));
    b *= 0.7 + 0.3 * step(0.12, fract(v * 3.0));
  } else {
    // Window frame cross.
    let fu = fract(along / 1.4);
    if (abs(v - 0.5) < 0.025 || abs(fu - 0.5) < 0.02) { b *= 0.08; }
    // Some windows have blinds.
    if (hash21(vec2f(seed, 3.0)) < 0.3 && fract(v * 9.0) < 0.22) { b *= 0.35; }
  }
  return b;
}

fn evalSurface(h: Hit, ro: vec3f, rd: vec3f) -> Surf {
  let tr = tris[h.tri];
  let m = mats[u32(tr.v0.w)];
  var s: Surf;
  s.p = ro + rd * h.t;
  s.ng = tr.n.xyz;
  s.inside = dot(rd, s.ng) > 0.0;
  s.n = select(s.ng, -s.ng, s.inside);
  s.base = m.base.rgb;
  s.metallic = m.base.a;
  s.rough = m.prm.x;
  s.ior = m.prm.y;
  s.kind = u32(m.prm.w + 0.5);
  s.emis = m.emis.rgb;
  let flags = u32(m.prm.z + 0.5);
  let p = s.p;

  if ((flags & FLAG_ROAD) != 0u) {
    let w = fbm(p.xz * 0.55 + vec2f(3.1, -1.7));
    let wet = smoothstep(0.43, 0.48, w);
    var base = s.base * (0.7 + 0.6 * fbm(p.xz * 6.0));
    // Lane markings.
    let zc = fract((p.z + 100.0) / 6.0);
    if (abs(p.x) < 0.08 && zc < 0.5) { base = vec3f(0.45, 0.45, 0.42); }
    if (abs(abs(p.x) - 3.75) < 0.06) { base = vec3f(0.35, 0.35, 0.33); }
    s.base = mix(base, base * 0.35, wet);
    s.rough = mix(0.42 + 0.18 * fbm(p.xz * 2.3), 0.012, wet);
  } else if ((flags & FLAG_SIDEWALK) != 0u) {
    let n2 = fbm(p.xz * 1.3 + vec2f(7.0, 2.0));
    let wet = smoothstep(0.5, 0.64, n2);
    var base = s.base * (0.75 + 0.5 * fbm(p.xz * 8.0));
    let gx = abs(fract(p.x / 1.5) - 0.5);
    let gz = abs(fract(p.z / 1.5) - 0.5);
    if (gx > 0.49 || gz > 0.49) { base *= 0.45; }
    s.base = base * (1.0 - 0.4 * wet);
    s.rough = mix(0.45, 0.07, wet);
  } else if ((flags & FLAG_GRIME) != 0u) {
    let g = fbm(vec2f(p.y * 0.6, (p.x + p.z) * 0.6));
    s.base *= (0.55 + 0.6 * g) * mix(0.45, 1.0, smoothstep(0.0, 3.5, p.y));
    s.rough = min(1.0, s.rough + 0.2 * g);
  }
  if ((flags & FLAG_WINDOW) != 0u) {
    s.emis *= windowPattern(m, p, s.ng);
  }
  return s;
}

// ------------------------------------------------------------------ bsdf

fn schlick(c: f32, f0: vec3f) -> vec3f {
  let k = pow(1.0 - clamp(c, 0.0, 1.0), 5.0);
  return f0 + (1.0 - f0) * k;
}

fn dGgx(a2: f32, ndh: f32) -> f32 {
  let d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-7);
}

fn g1Smith(a2: f32, ndv: f32) -> f32 {
  return 2.0 * ndv / (ndv + sqrt(a2 + (1.0 - a2) * ndv * ndv) + 1e-7);
}

fn tangentFrame(n: vec3f) -> mat3x3f {
  let sgn = select(-1.0, 1.0, n.z >= 0.0);
  let a = -1.0 / (sgn + n.z);
  let b = n.x * n.y * a;
  let t = vec3f(1.0 + sgn * n.x * n.x * a, sgn * b, -sgn * n.x);
  let bt = vec3f(b, sgn + n.y * n.y * a, -n.y);
  return mat3x3f(t, bt, n);
}

// Heitz 2018: sample the GGX distribution of visible normals.
fn sampleVndf(wo: vec3f, alpha: f32, u1: f32, u2: f32) -> vec3f {
  let vh = normalize(vec3f(alpha * wo.x, alpha * wo.y, wo.z));
  let lensq = vh.x * vh.x + vh.y * vh.y;
  let t1 = select(vec3f(1.0, 0.0, 0.0), vec3f(-vh.y, vh.x, 0.0) / sqrt(max(lensq, 1e-12)), lensq > 1e-12);
  let t2 = cross(vh, t1);
  let r = sqrt(u1);
  let phi = 2.0 * PI * u2;
  let p1 = r * cos(phi);
  var p2 = r * sin(phi);
  let sIn = 0.5 * (1.0 + vh.z);
  p2 = (1.0 - sIn) * sqrt(max(0.0, 1.0 - p1 * p1)) + sIn * p2;
  let nh = p1 * t1 + p2 * t2 + sqrt(max(0.0, 1.0 - p1 * p1 - p2 * p2)) * vh;
  return normalize(vec3f(alpha * nh.x, alpha * nh.y, max(0.0, nh.z)));
}

struct Lobes {
  f0: vec3f,
  kd: vec3f,
  alpha: f32,
  pSpec: f32,
};

fn lobes(s: Surf, wo: vec3f) -> Lobes {
  var l: Lobes;
  l.f0 = mix(vec3f(0.04), s.base, s.metallic);
  l.kd = s.base * (1.0 - s.metallic);
  let r = clamp(s.rough, 0.02, 1.0);
  l.alpha = r * r;
  let fAvg = luminance(schlick(max(dot(s.n, wo), 0.0), l.f0));
  let dAvg = luminance(l.kd);
  l.pSpec = select(clamp(fAvg / (fAvg + dAvg), 0.05, 0.95), 1.0, dAvg < 1e-5);
  return l;
}

// Returns rgb = f (BSDF value), a = pdf of sampling wi.
fn bsdfEval(s: Surf, l: Lobes, wo: vec3f, wi: vec3f) -> vec4f {
  let ndl = dot(s.n, wi);
  let ndv = dot(s.n, wo);
  if (ndl <= 0.0 || ndv <= 0.0) { return vec4f(0.0); }
  let h = normalize(wo + wi);
  let ndh = max(dot(s.n, h), 0.0);
  let vdh = max(dot(wo, h), 0.0);
  let a2 = l.alpha * l.alpha;
  let F = schlick(vdh, l.f0);
  let D = dGgx(a2, ndh);
  let g1v = g1Smith(a2, ndv);
  let G = g1v * g1Smith(a2, ndl);
  let spec = F * (D * G / (4.0 * ndv * ndl + 1e-6));
  let diff = l.kd * INV_PI;
  let pdfSpec = D * g1v / (4.0 * ndv + 1e-6);
  let pdf = l.pSpec * pdfSpec + (1.0 - l.pSpec) * ndl * INV_PI;
  return vec4f(spec + diff, pdf);
}

fn sampleBsdf(s: Surf, l: Lobes, wo: vec3f) -> vec3f {
  let frame = tangentFrame(s.n);
  if (rnd() < l.pSpec) {
    let woL = transpose(frame) * wo;
    let hL = sampleVndf(woL, l.alpha, rnd(), rnd());
    let h = frame * hL;
    return reflect(-wo, h);
  }
  let u1 = rnd();
  let u2 = rnd();
  let r = sqrt(u1);
  let phi = 2.0 * PI * u2;
  let d = vec3f(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - u1)));
  return frame * d;
}

fn offsetRay(p: vec3f, n: vec3f) -> vec3f {
  return p + n * (1e-3 + 2e-4 * length(p));
}

// ------------------------------------------------------------- lighting

struct LightSample {
  pos: vec3f,
  n: vec3f,
  le: vec3f,
  pdfA: f32, // probability density per unit area, including light selection
  ok: bool,
};

fn pickLight() -> u32 {
  let count = u32(U.p1.x);
  let u = rnd();
  var lo = 0u;
  var hi = count - 1u;
  for (var it = 0u; it < 24u; it++) {
    if (lo >= hi) { break; }
    let mid = (lo + hi) / 2u;
    if (lightCdf[mid] < u) { lo = mid + 1u; } else { hi = mid; }
  }
  return lo;
}

fn lightProb(li: u32) -> f32 {
  let prev = select(lightCdf[li - 1u], 0.0, li == 0u);
  return max(lightCdf[li] - prev, 1e-8);
}

fn sampleLight() -> LightSample {
  var ls: LightSample;
  ls.ok = false;
  let count = u32(U.p1.x);
  if (count == 0u) { return ls; }
  let li = pickLight();
  let tr = tris[lightTris[li]];
  let r1 = rnd();
  let r2 = rnd();
  let sq = sqrt(r1);
  let b0 = 1.0 - sq;
  let b1 = r2 * sq;
  let b2 = 1.0 - b0 - b1;
  ls.pos = tr.v0.xyz * b0 + tr.v1.xyz * b1 + tr.v2.xyz * b2;
  ls.n = tr.n.xyz;
  let m = mats[u32(tr.v0.w)];
  ls.le = m.emis.rgb;
  if ((u32(m.prm.z + 0.5) & FLAG_WINDOW) != 0u) { ls.le *= windowPattern(m, ls.pos, ls.n); }
  ls.pdfA = lightProb(li) / max(tr.v2.w, 1e-6);
  ls.ok = true;
  return ls;
}

// Resampled importance sampling: draw a few candidates from the power CDF,
// keep one in proportion to its estimated (unshadowed) contribution here.
// With ~1000 lights along the street this is what makes nearby neon win.
struct Reservoir {
  ls: LightSample,
  wSum: f32,
  pHat: f32,
};

fn risPick(p: vec3f, n: vec3f, useCos: bool, rd: vec3f) -> Reservoir {
  var r: Reservoir;
  r.wSum = 0.0;
  r.pHat = 0.0;
  r.ls.ok = false;
  let m = max(u32(U.p3.x + 0.5), 1u);
  for (var k = 0u; k < m; k++) {
    let c = sampleLight();
    if (!c.ok) { break; }
    let d = c.pos - p;
    let d2 = max(dot(d, d), 1e-3);
    let L = d * inverseSqrt(d2);
    let cosL = abs(dot(c.n, L));
    var geom = cosL / d2;
    if (useCos) { geom *= max(dot(n, L), 0.0); } else { geom *= phaseHg(dot(rd, L)); }
    let pHat = luminance(c.le) * geom;
    let w = pHat / c.pdfA;
    r.wSum += w;
    if (w > 0.0 && rnd() * r.wSum < w) {
      r.ls = c;
      r.pHat = pHat;
    }
  }
  // Effective area pdf of the chosen light under RIS, used for MIS.
  if (r.pHat > 0.0) { r.ls.pdfA = r.pHat * f32(m) / r.wSum; }
  return r;
}

fn neeSurface(s: Surf, l: Lobes, wo: vec3f) -> vec3f {
  let r = risPick(s.p, s.n, true, vec3f(0.0));
  if (!r.ls.ok || r.pHat <= 0.0) { return vec3f(0.0); }
  let ls = r.ls;
  let d = ls.pos - s.p;
  let d2 = dot(d, d);
  let dist = sqrt(d2);
  let L = d / dist;
  let cosS = dot(s.n, L);
  let cosL = abs(dot(ls.n, L));
  if (cosS <= 0.0 || cosL < 1e-4) { return vec3f(0.0); }
  if (occluded(offsetRay(s.p, s.n), L, dist - 2e-3)) { return vec3f(0.0); }
  let pdfSa = ls.pdfA * d2 / cosL;
  let fe = bsdfEval(s, l, wo, L);
  let w = pdfSa * pdfSa / (pdfSa * pdfSa + fe.a * fe.a);
  return ls.le * fe.rgb * (cosS / pdfSa) * w;
}

fn phaseHg(cosT: f32) -> f32 {
  let g = FOG_G;
  let d = 1.0 + g * g - 2.0 * g * cosT;
  return (1.0 - g * g) / (4.0 * PI * d * sqrt(d) + 1e-7);
}

fn sampleHg(rd: vec3f) -> vec3f {
  let g = FOG_G;
  let u1 = rnd();
  let u2 = rnd();
  let sq = (1.0 - g * g) / (1.0 - g + 2.0 * g * u1);
  let cosT = clamp((1.0 + g * g - sq * sq) / (2.0 * g), -1.0, 1.0);
  let sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
  let phi = 2.0 * PI * u2;
  let frame = tangentFrame(rd);
  return normalize(frame * vec3f(sinT * cos(phi), sinT * sin(phi), cosT));
}

fn neeFog(p: vec3f, rd: vec3f) -> vec3f {
  let r = risPick(p, vec3f(0.0), false, rd);
  if (!r.ls.ok || r.pHat <= 0.0) { return vec3f(0.0); }
  let ls = r.ls;
  let d = ls.pos - p;
  let d2 = dot(d, d);
  let dist = sqrt(d2);
  let L = d / dist;
  let cosL = abs(dot(ls.n, L));
  if (cosL < 1e-4) { return vec3f(0.0); }
  if (occluded(p, L, dist - 2e-3)) { return vec3f(0.0); }
  let pdfSa = ls.pdfA * d2 / cosL;
  let ph = phaseHg(dot(rd, L));
  let w = pdfSa * pdfSa / (pdfSa * pdfSa + ph * ph);
  return ls.le * (ph / pdfSa) * w;
}

fn insideFog(p: vec3f) -> bool {
  return abs(p.x) < 32.0 && p.z > -28.0 && p.z < 140.0 && p.y < 45.0;
}

fn sky(d: vec3f) -> vec3f {
  let t = clamp(d.y, 0.0, 1.0);
  let horizon = vec3f(0.10, 0.05, 0.045);
  let zenith = vec3f(0.004, 0.006, 0.014);
  return mix(zenith, horizon, exp(-t * 7.0)) * U.p2.y;
}

// ------------------------------------------------------------------ main

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = u32(U.res.x);
  let H = u32(U.res.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let pix = vec2i(gid.xy);
  let sampleIndex = u32(U.p0.y);
  let frame = u32(U.p2.z);
  rngState = pcg(pcg(gid.x + W * gid.y) ^ pcg(frame * 0x9E3779B9u + sampleIndex * 0x85EBCA6Bu + 17u));

  // Camera ray with sub-pixel jitter.
  let jitter = vec2f(rnd(), rnd());
  let uv = (vec2f(gid.xy) + jitter) * U.res.zw;
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let tanH = U.camPos.w;
  let aspect = U.camFwd.w;
  var rd = normalize(U.camFwd.xyz + U.camRight.xyz * (ndc.x * tanH * aspect) + U.camUp.xyz * (ndc.y * tanH));
  var ro = U.camPos.xyz;

  let maxBounces = u32(U.p0.x);
  let fogMode = u32(U.p0.w + 0.5);
  let sigma = U.p0.z;
  let haveLights = U.p1.x > 0.5;

  var L = vec3f(0.0);
  var T = vec3f(1.0);
  var lastPdf = 0.0;
  var lastDelta = true;
  var primaryT = FOG_FAR;
  var gPos = vec4f(0.0);
  var gNrm = vec4f(0.0, 1.0, 0.0, 0.0);
  var gAlb = vec3f(1.0);

  for (var bounce = 0u; bounce <= maxBounces; bounce++) {
    let hit = intersectScene(ro, rd, T_MAX);
    let hasHit = hit.tri != NO_HIT;
    let tHit = select(FOG_FAR, hit.t, hasHit);
    var s: Surf;
    if (hasHit) { s = evalSurface(hit, ro, rd); }

    if (bounce == 0u) {
      primaryT = tHit;
      if (hasHit) {
        gPos = vec4f(s.p, 1.0);
        gNrm = vec4f(s.n, hit.t);
        let lb = lobes(s, -rd);
        gAlb = lb.kd + lb.f0;
        if (s.kind != KIND_OPAQUE || luminance(s.emis) > 0.0) { gAlb = vec3f(1.0); }
      }
    }

    // Volumetric fog: maybe scatter before reaching the surface.
    if (fogMode == 2u && sigma > 0.0) {
      let ts = -log(max(1e-6, 1.0 - rnd())) / sigma;
      if (ts < tHit) {
        let sp = ro + rd * ts;
        if (insideFog(sp)) {
          T *= FOG_ALBEDO;
          if (haveLights) { L += T * neeFog(sp, rd); }
          let nd = sampleHg(rd);
          lastPdf = phaseHg(dot(rd, nd));
          lastDelta = false;
          ro = sp;
          rd = nd;
          continue;
        }
      }
    }

    if (!hasHit) {
      L += T * sky(rd);
      break;
    }

    // Emission (with MIS against light sampling when we got here by BSDF sampling).
    if (luminance(s.emis) > 0.0) {
      var w = 1.0;
      let li = i32(tris[hit.tri].v1.w);
      if (!lastDelta && li >= 0 && haveLights) {
        let cosL = max(abs(dot(s.ng, rd)), 1e-4);
        let pdfSa = (lightProb(u32(li)) / max(tris[hit.tri].v2.w, 1e-6)) * hit.t * hit.t / cosL;
        w = lastPdf * lastPdf / (lastPdf * lastPdf + pdfSa * pdfSa);
      }
      L += T * s.emis * w;
    }
    if (s.kind == KIND_EMITTER) { break; }

    if (s.kind == KIND_GLASS) {
      let eta = select(1.0 / s.ior, s.ior, s.inside);
      let cosI = clamp(-dot(rd, s.n), 0.0, 1.0);
      let k = 1.0 - eta * eta * (1.0 - cosI * cosI);
      let f0 = (1.0 - s.ior) / (1.0 + s.ior);
      let F = select(schlick(cosI, vec3f(f0 * f0)).x, 1.0, k < 0.0);
      if (s.inside) { T *= exp(-hit.t * vec3f(0.06, 0.02, 0.03)); }
      if (rnd() < F) {
        rd = reflect(rd, s.n);
        ro = offsetRay(s.p, s.n);
      } else {
        rd = normalize(eta * rd + (eta * cosI - sqrt(max(k, 0.0))) * s.n);
        ro = offsetRay(s.p, -s.n);
      }
      lastDelta = true;
      continue;
    }

    let wo = -rd;
    let lb = lobes(s, wo);
    if (haveLights) { L += T * neeSurface(s, lb, wo); }

    let wi = sampleBsdf(s, lb, wo);
    let fe = bsdfEval(s, lb, wo, wi);
    if (fe.a <= 0.0) { break; }
    T *= fe.rgb * (dot(s.n, wi) / fe.a);
    lastPdf = fe.a;
    lastDelta = false;
    ro = offsetRay(s.p, s.n);
    rd = wi;

    // Russian roulette.
    if (bounce >= 2u) {
      let q = clamp(max(T.x, max(T.y, T.z)), 0.05, 0.95);
      if (rnd() > q) { break; }
      T /= q;
    }
  }

  // Cheap analytic haze for the Low preset.
  if (fogMode == 1u && sigma > 0.0) {
    let a = exp(-sigma * 0.8 * min(primaryT, FOG_FAR));
    L = L * a + vec3f(0.09, 0.045, 0.08) * (1.0 - a);
  }

  // Firefly clamp.
  let lum = luminance(L);
  let clampV = U.p2.x;
  if (lum > clampV) { L *= clampV / lum; }

  // Demodulate by primary albedo and accumulate this frame's samples.
  var demod = L / max(gAlb, vec3f(0.01));
  if (sampleIndex > 0u) {
    demod += textureLoad(accumIn, pix, 0).rgb;
  }
  textureStore(outRad, pix, vec4f(demod, 1.0));
  if (sampleIndex == 0u) {
    textureStore(outPos, pix, gPos);
    textureStore(outNrm, pix, gNrm);
    textureStore(outAlb, pix, vec4f(gAlb, 1.0));
  }
}
