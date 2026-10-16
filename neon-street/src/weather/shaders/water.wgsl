// Shallow water on the street: a ground height map, a depth layer that
// rain fills and that flows downhill into gutters and drains, and a wave
// layer for ripples. Four entry points share this file.
//
// Grid texel (i, j) covers world x = origin.x + (i + 0.5) * cell,
// z = origin.y + (j + 0.5) * cell.

struct WaterParams {
  origin: vec2f,     // world xz of texel (0,0)
  cell: f32,         // metres per texel
  dt: f32,
  size: vec2f,       // texels
  rainRate: f32,     // metres of water per second (cinematically exaggerated)
  time: f32,
  flowK: f32,        // fraction of head difference moved per step
  waveSpeed: f32,    // ripple propagation, cells per step
  damping: f32,
  frame: f32,
  // Up to 8 impulses: xy = world xz, z = radius, w = strength
  impulses: array<vec4f, 8>,
  impulseCount: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
};

@group(0) @binding(0) var<uniform> P: WaterParams;
@group(0) @binding(1) var ground: texture_2d<f32>;        // r = ground height
@group(0) @binding(2) var depthIn: texture_2d<f32>;       // r = water depth
@group(0) @binding(3) var waveIn: texture_2d<f32>;        // rg = displacement, velocity
@group(0) @binding(4) var groundOut: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var depthOut: texture_storage_2d<r32float, write>;
@group(0) @binding(6) var waveOut: texture_storage_2d<rg32float, write>;
@group(0) @binding(7) var surfaceOut: texture_storage_2d<rgba16float, write>; // depth, wave, d/dx, d/dz

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

fn worldOf(t: vec2i) -> vec2f {
  return P.origin + (vec2f(t) + 0.5) * P.cell;
}

fn inside(t: vec2i) -> bool {
  return t.x >= 0 && t.y >= 0 && t.x < i32(P.size.x) && t.y < i32(P.size.y);
}

// Street profile: a crowned road, trenches along the gutters, raised
// sidewalks, and gentle dips everywhere so puddles have somewhere to form.
fn groundHeight(w: vec2f) -> f32 {
  let x = w.x;
  let ax = abs(x);
  var h = 0.0;
  if (ax < 4.0) {
    h = 0.03 * (1.0 - (x * x) / 16.0);
    // Gutter trench against the curb.
    h -= 0.03 * smoothstep(3.45, 3.75, ax) * (1.0 - smoothstep(3.85, 4.0, ax));
    h += 0.012 * (fbm(w * 0.7 + vec2f(3.1, -1.7)) - 0.5) + 0.004 * (fbm(w * 4.0) - 0.5);
  } else {
    h = 0.16 + 0.006 * (fbm(w * 0.9 + vec2f(5.0, 2.0)) - 0.5) + 0.003 * (fbm(w * 5.0) - 0.5);
    // Slabs tilt slightly toward the road.
    h += 0.004 * (ax - 4.0);
  }
  return h;
}

// Drain grates sit against both curbs every 18 m from z = 6.
fn isDrain(w: vec2f) -> bool {
  let ax = abs(w.x);
  if (ax < 3.5 || ax > 3.95) { return false; }
  if (w.y < 6.0 || w.y > 6.0 + 7.0 * 18.0) { return false; }
  return fract((w.y - 6.0) / 18.0) * 18.0 < 0.7;
}

@compute @workgroup_size(8, 8)
fn initGround(@builtin(global_invocation_id) gid: vec3u) {
  let t = vec2i(gid.xy);
  if (!inside(t)) { return; }
  textureStore(groundOut, t, vec4f(groundHeight(worldOf(t)), 0.0, 0.0, 0.0));
  textureStore(depthOut, t, vec4f(0.0));
  textureStore(waveOut, t, vec4f(0.0));
}

fn head(t: vec2i) -> vec2f {
  // Returns (ground + depth, depth). Outside the grid: a tall wall.
  if (!inside(t)) { return vec2f(1e3, 0.0); }
  let g = textureLoad(ground, t, 0).r;
  let d = textureLoad(depthIn, t, 0).r;
  return vec2f(g + d, d);
}

@compute @workgroup_size(8, 8)
fn flow(@builtin(global_invocation_id) gid: vec3u) {
  let t = vec2i(gid.xy);
  if (!inside(t)) { return; }
  let w = worldOf(t);
  let me = head(t);
  var d = me.y;
  var delta = 0.0;
  let offs = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  for (var i = 0; i < 4; i++) {
    let n = head(t + offs[i]);
    if (me.x > n.x) {
      // Water leaves toward the lower neighbour, never more than a quarter per side.
      delta -= min(P.flowK * (me.x - n.x), me.y * 0.25);
    } else if (n.x > me.x) {
      delta += min(P.flowK * (n.x - me.x), n.y * 0.25);
    }
  }
  d += delta;
  d += P.rainRate * P.dt;
  if (isDrain(w)) { d *= 0.55; }
  d *= 1.0 - 0.02 * P.dt;
  d = clamp(d, 0.0, 0.08);
  textureStore(depthOut, t, vec4f(d, 0.0, 0.0, 0.0));
}

fn waveAt(t: vec2i, fallback: f32) -> f32 {
  if (!inside(t)) { return fallback; }
  if (textureLoad(depthIn, t, 0).r < 0.0006) { return fallback; }
  return textureLoad(waveIn, t, 0).r;
}

@compute @workgroup_size(8, 8)
fn wave(@builtin(global_invocation_id) gid: vec3u) {
  let t = vec2i(gid.xy);
  if (!inside(t)) { return; }
  let d = textureLoad(depthIn, t, 0).r;
  var wv = textureLoad(waveIn, t, 0).rg;
  if (d < 0.0006) {
    textureStore(waveOut, t, vec4f(wv * 0.5, 0.0, 0.0));
    return;
  }
  let w0 = wv.x;
  let lap = waveAt(t + vec2i(1, 0), w0) + waveAt(t - vec2i(1, 0), w0) + waveAt(t + vec2i(0, 1), w0) + waveAt(t - vec2i(0, 1), w0) - 4.0 * w0;
  var v = wv.y + P.waveSpeed * P.waveSpeed * lap;
  v *= P.damping;
  var w = w0 + v;
  // Raindrops: a random cell gets a dimple now and then, more often in heavier rain.
  let r = hash21(vec2f(t) * 0.37 + vec2f(P.frame * 0.613, P.frame * 0.291));
  if (r < P.rainRate * 900.0 * P.dt) { w -= 0.0025 + 0.002 * hash21(vec2f(t) + P.frame); }
  // Footsteps, downwash and other explicit impulses.
  let wp = worldOf(t);
  let count = i32(P.impulseCount);
  for (var i = 0; i < count; i++) {
    let imp = P.impulses[i];
    let dist = length(wp - imp.xy);
    if (dist < imp.z) {
      let k = 1.0 - dist / imp.z;
      w -= imp.w * k * k;
    }
  }
  // Deep water damps less than a thin film.
  w *= mix(0.9, 1.0, smoothstep(0.0006, 0.004, d));
  textureStore(waveOut, t, vec4f(w, v, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn finalize(@builtin(global_invocation_id) gid: vec3u) {
  let t = vec2i(gid.xy);
  if (!inside(t)) { return; }
  let d = textureLoad(depthIn, t, 0).r;
  let w = textureLoad(waveIn, t, 0).r;
  let dx = (waveAt(t + vec2i(1, 0), w) - waveAt(t - vec2i(1, 0), w)) / (2.0 * P.cell);
  let dz = (waveAt(t + vec2i(0, 1), w) - waveAt(t - vec2i(0, 1), w)) / (2.0 * P.cell);
  textureStore(surfaceOut, t, vec4f(d, w, dx, dz));
}
