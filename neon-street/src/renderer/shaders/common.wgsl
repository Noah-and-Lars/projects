// Shared declarations, prepended to every kernel by the TypeScript side.

struct Uniforms {
  camPos: vec4f,    // xyz, w = tan(fov/2)
  camFwd: vec4f,    // xyz, w = aspect
  camRight: vec4f,  // xyz
  camUp: vec4f,     // xyz
  pCamPos: vec4f,   // previous frame camera, same packing
  pCamFwd: vec4f,
  pCamRight: vec4f,
  pCamUp: vec4f,
  res: vec4f,       // width, height, 1/width, 1/height
  p0: vec4f,        // maxBounces, sampleIndex, fogDensity, fogMode
  p1: vec4f,        // lightCount, maxHistory, resetHistory, time
  p2: vec4f,        // fireflyClamp, skyIntensity, frame, spp
  p3: vec4f,        // lightCandidates, light grid z0, cell size, cell count
  p4: vec4f,        // water grid origin xz, size xz (metres)
  p5: vec4f,        // rain wetness (0..1), history boost, rain intensity, first dynamic triangle
  s0: vec4f,        // searchlight position, w = intensity
  s1: vec4f,        // searchlight direction, w = cos(outer cone)
  s2: vec4f,        // cos(inner cone), range, 0, 0
  objs: array<DynObj, 4>, // rigid dynamic objects (drone, arms, helmet)
};

// A rigidly transformed object with its own BVH (object space -> world).
struct DynObj {
  pos: vec4f,  // position, w = BVH root node (< 0: inactive)
  r0: vec4f,   // rotation rows
  r1: vec4f,
  r2: vec4f,
  bmin: vec4f, // world bounds
  bmax: vec4f, // w = first triangle index of this object
};

const PI: f32 = 3.14159265358979;
const INV_PI: f32 = 0.31830988618;

// Irradiance probe volume over the street: half-metre cells.
const PROBE_ORIGIN: vec3f = vec3f(-8.0, 0.0, -20.0);
const PROBE_CELL: f32 = 0.5;
const PROBE_DIMS: vec3u = vec3u(32u, 24u, 300u);

fn probeUvw(p: vec3f) -> vec3f {
  return (p - PROBE_ORIGIN) / (vec3f(PROBE_DIMS) * PROBE_CELL);
}

fn luminance(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

// Octahedral normal packing into one float: two 12-bit components in a
// 24-bit integer, which a 32-bit float represents exactly. Lets the
// G-buffer carry position + normal in a single rgba32float texture.
fn octWrap(v: vec2f) -> vec2f {
  return (1.0 - abs(v.yx)) * select(vec2f(-1.0), vec2f(1.0), v >= vec2f(0.0));
}

fn packNormal(n: vec3f) -> f32 {
  var p = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
  p = select(octWrap(p), p, n.z >= 0.0);
  let q = vec2u(clamp((p * 0.5 + 0.5) * 4095.0 + 0.5, vec2f(0.0), vec2f(4095.0)));
  return f32(q.x | (q.y << 12u));
}

fn unpackNormal(f: f32) -> vec3f {
  // f is an exact integer below 2^24; adding 0.5 here would round up above 2^23.
  let i = u32(f);
  let p = vec2f(f32(i & 4095u), f32(i >> 12u)) / 4095.0 * 2.0 - 1.0;
  var n = vec3f(p, 1.0 - abs(p.x) - abs(p.y));
  let t = max(-n.z, 0.0);
  n.x += select(t, -t, n.x >= 0.0);
  n.y += select(t, -t, n.y >= 0.0);
  return normalize(n);
}
