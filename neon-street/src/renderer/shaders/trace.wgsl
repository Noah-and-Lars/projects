// Path tracing kernel: one light path per pixel per dispatch.
//
// Radiance is split into a diffuse and a specular channel, decided by the
// first scattering event, so the denoiser can treat reflections differently
// (they move with the reflected object, not with the surface). Both channels
// are summed over this frame's samples into one packed rgba32uint texture.
// The diffuse channel is divided by the primary diffuse albedo; emission seen
// directly by the camera goes to its own texture and bypasses the denoiser.

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
  base: vec4f,  // rgb base colour (tint when textured), a = metallic
  emis: vec4f,  // rgb emitted radiance
  prm: vec4f,   // roughness (multiplier when textured), ior, flags, kind
  extra: vec4f, // procedural parameters (windows: bottom y, height, left edge, shop flag; screens: u0, v0, width, height)
  texp: vec4f,  // albedo layer (-1 none), normal layer, metres per tile, bump strength
  aux: vec4f,   // seed, variant, room width, room depth
};

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var<storage, read> tris: array<Tri>;
@group(0) @binding(2) var<storage, read> nodes: array<Node>;
@group(0) @binding(3) var<storage, read> triIdx: array<u32>;
@group(0) @binding(4) var<storage, read> mats: array<Material>;
@group(0) @binding(5) var<storage, read> lightTris: array<u32>;
@group(0) @binding(6) var<storage, read> gridCdf: array<f32>; // per-cell light CDFs
@group(0) @binding(7) var texSamp: sampler;
@group(0) @binding(8) var texAlb: texture_2d_array<f32>; // rgb albedo, a roughness
@group(0) @binding(9) var texNrm: texture_2d_array<f32>; // rgb tangent normal, a ambient occlusion
@group(0) @binding(10) var waterTex: texture_2d<f32>;    // depth, wave, d/dx, d/dz over the street
@group(0) @binding(11) var clampSamp: sampler;

const TEX_SIZE: f32 = 1024.0;

@group(1) @binding(0) var accumIn: texture_2d<u32>;
@group(1) @binding(1) var outRad: texture_storage_2d<rgba32uint, write>;  // packed diff + spec sums
@group(1) @binding(2) var outPos: texture_storage_2d<rgba32float, write>; // xyz, w = packed normal
@group(1) @binding(3) var outAlb: texture_storage_2d<rgba16float, write>; // rgb diffuse albedo, a = roughness
@group(1) @binding(4) var outEmit: texture_storage_2d<rgba16float, write>; // rgb direct emission, a = reflection distance

// Irradiance probe volume (entry point `probes`): running average of the
// light arriving at points in the air, used to light rain and particles.
@group(2) @binding(0) var probeIn: texture_3d<f32>;
@group(2) @binding(1) var probeOut: texture_storage_3d<rgba16float, write>;

const NO_HIT: u32 = 0xffffffffu;
const T_MAX: f32 = 1e30;
const FOG_FAR: f32 = 400.0;
const FOG_ALBEDO: f32 = 0.85;
const FOG_G: f32 = 0.55;
const SKY_DIST: f32 = 1000.0;
const KIND_OPAQUE: u32 = 0u;
const KIND_GLASS: u32 = 1u;
const KIND_EMITTER: u32 = 2u;
const KIND_HOLO: u32 = 3u;
const KIND_TRANSLUCENT: u32 = 4u;
const FLAG_ROAD: u32 = 1u;
const FLAG_WINDOW: u32 = 2u;
const FLAG_GRIME: u32 = 4u;
const FLAG_SIDEWALK: u32 = 8u;
const FLAG_BILLBOARD: u32 = 16u;
const FLAG_GLYPH: u32 = 32u;
const FLAG_BLINK: u32 = 64u;

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

// Traverse the BVH rooted at `root`, improving on `best`.
fn traverse(root: u32, ro: vec3f, rd: vec3f, tmax0: f32) -> Hit {
  var best = Hit(tmax0, NO_HIT);
  let invDir = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
  var stack: array<u32, 48>;
  var sp = 0u;
  var node = root;
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

// ---- the drone: a rigidly transformed second BVH level ------------------
// U.d0 = drone position xyz, w = root node (negative when there is no drone)
// U.d1..d3 = rotation rows (object -> world); d4/d5 = world bounds.

fn droneActive() -> bool { return U.d0.w >= 0.0; }

fn droneToLocalDir(v: vec3f) -> vec3f {
  // Inverse of a rotation is its transpose: dot with the columns.
  return vec3f(dot(vec3f(U.d1.x, U.d2.x, U.d3.x), v), dot(vec3f(U.d1.y, U.d2.y, U.d3.y), v), dot(vec3f(U.d1.z, U.d2.z, U.d3.z), v));
}

fn droneToWorldDir(v: vec3f) -> vec3f {
  return vec3f(dot(U.d1.xyz, v), dot(U.d2.xyz, v), dot(U.d3.xyz, v));
}

fn intersectScene(ro: vec3f, rd: vec3f, tmax0: f32) -> Hit {
  var best = traverse(0u, ro, rd, tmax0);
  if (droneActive()) {
    let invDir = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
    if (aabbHit(U.d4.xyz, U.d5.xyz, ro, invDir, best.t) < T_MAX) {
      let lo = droneToLocalDir(ro - U.d0.xyz);
      let ld = droneToLocalDir(rd);
      let h = traverse(u32(U.d0.w), lo, ld, best.t);
      if (h.t < best.t) { best = h; }
    }
  }
  return best;
}

fn isHologram(tri: u32) -> bool {
  return u32(mats[u32(tris[tri].v0.w)].prm.w + 0.5) == KIND_HOLO;
}

fn anyHit(root: u32, ro: vec3f, rd: vec3f, tmax: f32) -> bool {
  let invDir = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
  var stack: array<u32, 48>;
  var sp = 0u;
  var node = root;
  loop {
    let n = nodes[node];
    if (n.cnt > 0u) {
      for (var k = 0u; k < n.cnt; k++) {
        let ti = triIdx[n.lf + k];
        let t = triHit(ti, ro, rd);
        // Holograms are light, not matter: they never cast shadows.
        if (t < tmax && !isHologram(ti)) { return true; }
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

fn occluded(ro: vec3f, rd: vec3f, tmax: f32) -> bool {
  if (anyHit(0u, ro, rd, tmax)) { return true; }
  if (droneActive()) {
    let invDir = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
    if (aabbHit(U.d4.xyz, U.d5.xyz, ro, invDir, tmax) < T_MAX) {
      return anyHit(u32(U.d0.w), droneToLocalDir(ro - U.d0.xyz), droneToLocalDir(rd), tmax);
    }
  }
  return false;
}

// ------------------------------------------------------------ materials

struct Surf {
  p: vec3f,
  n: vec3f,      // shading normal (normal-mapped), facing the incoming ray
  gf: vec3f,     // geometric normal facing the incoming ray
  ng: vec3f,     // stored geometric normal
  base: vec3f,
  metallic: f32,
  rough: f32,
  emis: vec3f,
  kind: u32,
  ior: f32,
  inside: bool,
};

// ------------------------------------------------------ emissive patterns

fn palette(i: f32) -> vec3f {
  let k = u32(fract(i * 0.1234 + 0.37) * 6.0);
  switch (k) {
    case 0u: { return vec3f(1.0, 0.15, 0.6); }   // magenta
    case 1u: { return vec3f(0.1, 0.85, 1.0); }   // cyan
    case 2u: { return vec3f(1.0, 0.75, 0.1); }   // yellow
    case 3u: { return vec3f(1.0, 0.35, 0.05); }  // orange
    case 4u: { return vec3f(0.3, 0.4, 1.0); }    // electric blue
    default: { return vec3f(0.3, 1.0, 0.45); }   // green
  }
}

// Wall-local coordinates: u along the wall, v up, for axis-aligned facades.
fn wallU(p: vec3f, n: vec3f) -> f32 {
  return select(p.x, p.z, abs(n.x) > 0.5);
}

// Interior mapping: intersect the ray with a virtual room box behind the
// window and shade whichever face it hits, lit by a ceiling fixture.
fn roomRadiance(m: Material, p: vec3f, n: vec3f, dir: vec3f) -> vec3f {
  let time = U.p1.w;
  let seed = m.aux.x;
  let isShop = m.extra.w > 0.5;
  let u = wallU(p, n);
  let du = select(dir.x, dir.z, abs(n.x) > 0.5);
  let dv = dir.y;
  let dw = max(-dot(dir, n), 1e-4);
  let u0 = m.extra.z;
  let width = max(m.aux.z, 0.5);
  let depth = max(m.aux.w, 1.0);
  let floorY = select(m.extra.x - 0.9, m.extra.x - 0.3, isShop);
  let height = select(2.8, 3.2, isShop);
  let v = p.y;

  // Distances to the room's walls along the ray.
  let tu = select((u0 - u) / min(du, -1e-5), (u0 + width - u) / max(du, 1e-5), du > 0.0);
  let tv = select((floorY - v) / min(dv, -1e-5), (floorY + height - v) / max(dv, 1e-5), dv > 0.0);
  let tw = depth / dw;
  let t = min(tu, min(tv, tw));
  let hu = u + du * t;
  let hv = v + dv * t;
  let hw = dw * t;

  let wallCol = mix(vec3f(0.55, 0.5, 0.44), vec3f(0.42, 0.47, 0.58), hash21(vec2f(seed, 1.0)));
  var col = wallCol;
  let lightU = u0 + width * 0.5;
  let lightW = depth * 0.5;
  if (t == tw) {
    // Back wall: wallpaper, furniture band, a picture or a screen.
    col = wallCol * (0.9 + 0.1 * vnoise(vec2f(hu * 3.0, hv * 3.0)));
    if (hv < floorY + 0.95) { col = vec3f(0.12, 0.1, 0.09); }
    let pu = (hu - u0) / width;
    let pv = (hv - floorY) / height;
    if (isShop) {
      // Shelves with products.
      let shelf = fract(pv * 5.0);
      if (shelf < 0.12 && pv > 0.25) { col = vec3f(0.3, 0.28, 0.26); }
      else if (pv > 0.25) {
        let cellId = floor(vec2f(hu * 4.0, pv * 5.0));
        let prod = hash21(cellId + seed);
        col = select(col, palette(prod * 10.0) * (0.4 + 0.6 * hash21(cellId * 1.7 + seed)), prod > 0.35);
      }
    } else {
      // Picture frame or a TV, depending on the seed.
      let kind = hash21(vec2f(seed, 7.0));
      if (abs(pu - 0.55) < 0.17 && abs(pv - 0.58) < 0.14) {
        if (kind < 0.45) {
          let flick = 0.6 + 0.4 * hash21(vec2f(floor(time * 6.0), seed));
          col = mix(vec3f(0.4, 0.55, 1.0), palette(floor(time * 0.7) + seed), 0.5) * 3.0 * flick;
        } else {
          col = palette(seed * 3.0) * 0.5;
        }
      }
    }
  } else if (t == tv) {
    if (dv > 0.0) {
      // Ceiling with the light fixture.
      col = vec3f(0.85, 0.85, 0.82);
      col = vec3f(0.6, 0.6, 0.58);
      let fixture = select(abs(hu - lightU) < 0.45 && abs(hw - lightW) < 0.3,
                           fract((hu - u0) / 2.0) < 0.3 && abs(hw - lightW) < 0.4, isShop);
      if (fixture) { col = vec3f(5.0); }
    } else {
      col = select(vec3f(0.16, 0.13, 0.11), vec3f(0.22, 0.22, 0.24), isShop);
    }
  } else {
    col = wallCol * 0.55;
  }
  // Falloff from the ceiling light; most of the room sits in its shadow.
  let dl = vec3f(hu - lightU, hv - (floorY + height), hw - lightW);
  let fall = 1.0 / (1.0 + 0.18 * dot(dl, dl));
  var out = col * (0.1 + 0.9 * fall) * m.emis.rgb;
  // Window frame: a cross for apartments, a mullion every pane for shops.
  if (isShop) {
    if (fract((u - u0) / 2.4) < 0.02 || (p.y - m.extra.x) / m.extra.y > 0.96) { out *= 0.04; }
  } else {
    let fu = (u - (u0 + 0.5)) / 1.4;
    let fv = (p.y - m.extra.x) / max(m.extra.y, 0.01);
    if (abs(fu - 0.5) < 0.025 || abs(fv - 0.5) < 0.025) { out *= 0.06; }
  }
  // Blinds or curtains on some apartments.
  if (!isShop && hash21(vec2f(seed, 3.0)) < 0.3) {
    let slat = fract((p.y - m.extra.x) * 9.0);
    out *= select(0.35, 1.0, slat > 0.22);
  }
  return out;
}

// Animated advertising screen: palette blocks, a logo, scrolling text bars,
// scanlines and the occasional glitch.
fn billboardPattern(m: Material, p: vec3f, n: vec3f) -> vec3f {
  let time = U.p1.w;
  let seed = m.aux.x;
  var uv = vec2f((wallU(p, n) - m.extra.x) / max(m.extra.z, 0.1), (p.y - m.extra.y) / max(m.extra.w, 0.1));
  // Mirror so text scrolls the right way on both sides of the street.
  if (n.x > 0.5 || n.z < -0.5) { uv.x = 1.0 - uv.x; }
  let aspect = m.extra.z / max(m.extra.w, 0.1);
  let glitch = step(0.92, hash21(vec2f(floor(time * 5.0), seed)));
  if (glitch > 0.5 && hash21(vec2f(floor(uv.y * 20.0), floor(time * 5.0))) > 0.6) { uv.x += 0.06; }
  let c1 = palette(seed);
  let c2 = palette(seed + 1.7);
  var col = c1 * (0.25 + 0.35 * smoothstep(0.0, 1.0, uv.y));
  // Big logo ring on the left.
  let lc = vec2f((uv.x - 0.25) * aspect, uv.y - 0.55);
  let ring = abs(length(lc) - 0.28);
  col = mix(col, c2 * 2.5, smoothstep(0.08, 0.04, ring));
  col = mix(col, vec3f(2.2), smoothstep(0.1, 0.06, length(lc - vec2f(0.12, 0.08))) * 0.6);
  // Rows of text-like bars that scroll.
  for (var row = 0; row < 3; row++) {
    let ry = 0.42 - f32(row) * 0.13;
    if (abs(uv.y - ry) < 0.045 && uv.x > 0.5) {
      let dirn = select(1.0, -1.0, row == 1);
      let x = uv.x * aspect * 6.0 + time * 0.35 * dirn + seed;
      let cell = floor(x);
      let on = hash21(vec2f(cell, f32(row) + seed)) > 0.4 && fract(x) > 0.15;
      col = mix(col, select(c2, vec3f(1.8), row == 0) * 1.6, select(0.0, 1.0, on));
    }
  }
  // Tagline block at the bottom right.
  if (uv.y < 0.12 && uv.x > 0.55) { col = mix(col, c2 * 1.4, step(0.5, hash21(vec2f(floor(uv.x * 30.0), seed + 9.0)))); }
  // Scanlines and flicker.
  col *= 0.86 + 0.14 * sin(uv.y * m.extra.w * 220.0);
  col *= 0.92 + 0.08 * hash21(vec2f(floor(time * 24.0), seed));
  col *= 1.0 - glitch * 0.3;
  return col * m.emis.rgb;
}

// Procedural neon "characters": a column (or row) of blocky glyphs.
fn glyphPattern(m: Material, p: vec3f, n: vec3f) -> f32 {
  let u = wallU(p, n) - m.extra.x;
  let v = p.y - m.extra.y;
  let cell = max(m.aux.z, 0.2);
  let vertical = m.aux.y < 0.5; // variant 0: glyphs stacked vertically
  let along = select(u, v, vertical);
  let across = select(v, u, vertical);
  let ci = floor(along / cell);
  let g = hash21(vec2f(ci, m.aux.x));
  if (g < 0.18) { return 0.0; }
  let fa = fract(along / cell);
  let fc = across / cell;
  let gx = (fc - 0.15) / 0.7 * 5.0;
  let gy = (fa - 0.14) / 0.72 * 7.0;
  if (gx < 0.0 || gx >= 5.0 || gy < 0.0 || gy >= 7.0) { return 0.0; }
  let bx = floor(gx);
  let by = floor(gy);
  var on = hash21(vec2f(bx + by * 5.0, g * 113.0)) < 0.42;
  // Guaranteed strokes keep the shapes readable as characters.
  if (by == 3.0 || bx == 0.0 || (by == 6.0 && g > 0.5)) { on = on || hash21(vec2f(by + bx * 0.3, g * 77.0)) < 0.85; }
  if (!on) { return 0.0; }
  let e = min(min(fract(gx), 1.0 - fract(gx)), min(fract(gy), 1.0 - fract(gy)));
  let flick = 0.85 + 0.15 * step(0.03, hash21(vec2f(floor(U.p1.w * 20.0), m.aux.x + ci)));
  return smoothstep(0.0, 0.2, e) * flick;
}

// Floating holographic ad: returns rgb emission and alpha (coverage).
fn holoPattern(m: Material, p: vec3f, n: vec3f) -> vec4f {
  let time = U.p1.w;
  let seed = m.aux.x;
  let uv = vec2f((wallU(p, n) - m.extra.x) / max(m.extra.z, 0.1), (p.y - m.extra.y) / max(m.extra.w, 0.1));
  let aspect = m.extra.z / max(m.extra.w, 0.1);
  let c = vec2f((uv.x - 0.5) * aspect, uv.y - 0.6);
  let col = palette(seed);
  var a = 0.0;
  // Pulsing rings.
  let r = length(c);
  let pulse = fract(time * 0.5 + seed);
  a += smoothstep(0.03, 0.0, abs(r - 0.32 * pulse)) * (1.0 - pulse) * 0.8;
  a += smoothstep(0.02, 0.0, abs(r - 0.3)) * 0.6;
  // Rotating arc.
  let ang = atan2(c.y, c.x) + time * 1.3;
  a += smoothstep(0.03, 0.0, abs(r - 0.4)) * step(0.0, sin(ang * 2.0)) * 0.9;
  // Centre symbol.
  a += smoothstep(0.12, 0.05, r) * (0.6 + 0.4 * sin(time * 3.0 + seed));
  // Scrolling glyph rows underneath.
  if (uv.y < 0.28 && uv.y > 0.05) {
    let x = uv.x * aspect * 10.0 - time * 0.8 + seed;
    let row = floor(uv.y * 20.0);
    let on = hash21(vec2f(floor(x), row + seed)) > 0.45 && fract(x) > 0.2 && fract(uv.y * 20.0) > 0.25;
    a += select(0.0, 0.7, on);
  }
  // Scanlines, edge fade, flicker, glitch tearing.
  a *= 0.7 + 0.3 * sin(uv.y * 160.0 + time * 10.0);
  let edge = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x) * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.9, uv.y);
  a *= edge;
  a *= 0.8 + 0.2 * hash21(vec2f(floor(time * 30.0), seed));
  if (hash21(vec2f(floor(time * 4.0), seed + 2.0)) > 0.9 && fract(uv.y * 7.0 + time) < 0.1) { a *= 0.2; }
  a = clamp(a, 0.0, 1.0);
  return vec4f(col * m.aux.y * a, a * 0.3);
}

// Emitted radiance of a material at point p (wall normal n) toward -dir,
// where dir is the ray direction arriving at the surface.
fn emitted(m: Material, p: vec3f, n: vec3f, dir: vec3f) -> vec3f {
  let flags = u32(m.prm.z + 0.5);
  if ((flags & FLAG_WINDOW) != 0u) { return roomRadiance(m, p, n, dir); }
  if ((flags & FLAG_BILLBOARD) != 0u) { return billboardPattern(m, p, n); }
  if ((flags & FLAG_GLYPH) != 0u) { return m.emis.rgb * glyphPattern(m, p, n); }
  if ((flags & FLAG_BLINK) != 0u) {
    let t = U.p1.w + m.aux.x;
    let pattern = u32(m.aux.y + 0.5);
    var k = 1.0;
    if (pattern == 1u) { k = 0.45 + 0.55 * sin(t * 3.0) * sin(t * 3.0); }           // slow breathing
    else if (pattern == 2u) { k = step(0.93, fract(t * 1.1)) + 0.6 * step(0.98, fract(t * 1.1 + 0.07)); } // strobe
    else if (pattern == 3u) { k = step(0.5, fract(t * 1.0)); }                       // recording blink
    return m.emis.rgb * k;
  }
  return m.emis.rgb;
}

// Spinning prop disc: a soft dark disc with two faint blade streaks.
fn propCoverage(m: Material, pLocal: vec3f) -> f32 {
  let c = pLocal.xz - m.aux.xy;
  let r = length(c) / max(m.aux.z, 0.01);
  if (r > 1.0 || r < 0.08) { return 0.0; }
  let ang = atan2(c.y, c.x) - U.p1.w * 60.0;
  let blade = pow(abs(sin(ang)), 8.0);
  return (0.22 + 0.25 * blade) * smoothstep(1.0, 0.85, r);
}

// `footprint` is the ray cone's width at the hit in metres; it picks the mip.
fn evalSurface(h: Hit, ro: vec3f, rd: vec3f, footprint: f32) -> Surf {
  let tr = tris[h.tri];
  let m = mats[u32(tr.v0.w)];
  var s: Surf;
  s.p = ro + rd * h.t;
  s.ng = tr.n.xyz;
  // Drone triangles live in object space: rotate their normal into the world.
  if (h.tri >= u32(U.p5.w)) { s.ng = droneToWorldDir(s.ng); }
  s.inside = dot(rd, s.ng) > 0.0;
  s.gf = select(s.ng, -s.ng, s.inside);
  s.n = s.gf;
  s.base = m.base.rgb;
  s.metallic = m.base.a;
  s.rough = m.prm.x;
  s.ior = m.prm.y;
  s.kind = u32(m.prm.w + 0.5);
  s.emis = m.emis.rgb;
  let flags = u32(m.prm.z + 0.5);
  let p = s.p;

  // Textured surfaces: planar mapping along the dominant axis, normal mapping.
  if (m.texp.x >= 0.0) {
    let an = abs(s.ng);
    var uv = p.xy;
    var T = vec3f(1.0, 0.0, 0.0);
    var B = vec3f(0.0, 1.0, 0.0);
    if (an.y > 0.5) {
      uv = p.xz; T = vec3f(1.0, 0.0, 0.0); B = vec3f(0.0, 0.0, 1.0);
    } else if (an.x > 0.5) {
      uv = p.zy; T = vec3f(0.0, 0.0, 1.0); B = vec3f(0.0, 1.0, 0.0);
    }
    let scale = max(m.texp.z, 1e-3);
    uv /= scale;
    let lod = clamp(log2(max(footprint, 1e-5) * TEX_SIZE / scale), 0.0, 9.0);
    let layer = i32(m.texp.x);
    let a = textureSampleLevel(texAlb, texSamp, uv, layer, lod);
    s.base *= a.rgb;
    s.rough = clamp(a.a * m.prm.x, 0.02, 1.0);
    if (m.texp.y >= 0.0) {
      let nm = textureSampleLevel(texNrm, texSamp, uv, i32(m.texp.y), lod);
      let tn = nm.rgb * 2.0 - 1.0;
      let bump = m.texp.w;
      var nn = normalize(T * (tn.x * bump) + B * (tn.y * bump) + s.gf * max(tn.z, 0.2));
      // Never let the bumped normal dip below the real surface.
      let d = dot(nn, s.gf);
      if (d < 0.08) { nn = normalize(nn + s.gf * (0.08 - d)); }
      s.n = nn;
      s.base *= mix(1.0, nm.a, 0.6);
    }
  }

  if ((flags & (FLAG_ROAD | FLAG_SIDEWALK)) != 0u) {
    // Standing water comes from the simulation: depth, ripple height, ripple slope.
    let wuv = (p.xz - U.p4.xy) / U.p4.zw;
    let ws = textureSampleLevel(waterTex, clampSamp, wuv, 0.0);
    let film = U.p5.x;
    let puddle = smoothstep(0.0005, 0.004, ws.x);
    var base = s.base;
    if ((flags & FLAG_ROAD) != 0u) {
      // Lane markings and two zebra crossings.
      let zc = fract((p.z + 100.0) / 6.0);
      if (abs(p.x) < 0.08 && zc < 0.5) { base = vec3f(0.45, 0.45, 0.42); }
      if (abs(abs(p.x) - 3.75) < 0.06) { base = vec3f(0.35, 0.35, 0.33); }
      let crossing = (p.z > -3.2 && p.z < 0.0) || (p.z > 58.5 && p.z < 61.7);
      if (crossing && abs(p.x) < 3.6 && fract(p.x * 1.1 + 0.25) < 0.5) { base = mix(base, vec3f(0.5, 0.5, 0.47), 0.85); }
    }
    // A wet film darkens and smooths everything; puddles are mirrors.
    base *= mix(1.0, 0.62, film);
    s.base = mix(base, base * 0.5, puddle);
    s.rough = mix(s.rough, 0.2, film * 0.85);
    s.rough = mix(s.rough, 0.01, puddle);
    let ripple = normalize(vec3f(-ws.z * 4.0, 1.0, -ws.w * 4.0));
    s.n = normalize(mix(s.n, ripple, puddle));
  } else if ((flags & FLAG_GRIME) != 0u) {
    let g = fbm(vec2f(p.y * 0.6, (p.x + p.z) * 0.6));
    s.base *= (0.7 + 0.45 * g) * mix(0.45, 1.0, smoothstep(0.0, 3.5, p.y));
    s.rough = min(1.0, s.rough + 0.08 * g);
    // Splash zone: the bottom of every wall is soaked.
    let soak = U.p5.x * (1.0 - smoothstep(0.3, 2.2, p.y));
    s.base *= 1.0 - 0.35 * soak;
    s.rough = mix(s.rough, 0.25, soak);
  }
  // Rain running down glass: perturbs reflections and the view inside.
  if (s.kind == KIND_OPAQUE && s.metallic < 0.01 && s.rough < 0.06 && abs(s.ng.y) < 0.5 && U.p5.z > 0.0) {
    let dn = rainOnGlass(p, s.ng);
    var T = vec3f(1.0, 0.0, 0.0);
    if (abs(s.ng.x) > 0.5) { T = vec3f(0.0, 0.0, 1.0); }
    let B = vec3f(0.0, 1.0, 0.0);
    s.n = normalize(s.n + T * dn.x + B * dn.y);
  }
  if (luminance(s.emis) > 0.0 && (flags & (FLAG_WINDOW | FLAG_BILLBOARD | FLAG_GLYPH)) != 0u) {
    // Drops on the glass bend the view into the room a little.
    let viewDir = normalize(rd + (s.n - s.gf) * 1.5);
    s.emis = emitted(m, p, s.ng, viewDir);
  }
  return s;
}

// Rain on a vertical pane: running drops in staggered columns plus a static
// sprinkle of small beads. Returns a tangent-space normal offset.
fn rainOnGlass(p: vec3f, n: vec3f) -> vec2f {
  let time = U.p1.w;
  let strength = clamp(U.p5.z, 0.0, 1.5);
  let u = select(p.x, p.z, abs(n.x) > 0.5);
  let v = p.y;
  var off = vec2f(0.0);
  // Running drops.
  for (var layer = 0; layer < 2; layer++) {
    let colW = select(0.11, 0.17, layer == 1);
    let col = floor(u / colW);
    let seed = hash21(vec2f(col, f32(layer) * 7.3));
    if (seed > 0.35 * strength + 0.25) { continue; }
    let speed = 0.25 + 0.4 * hash21(vec2f(col, 2.0 + f32(layer)));
    let cycle = 1.4 + 1.2 * hash21(vec2f(col, 5.0));
    let dropV = fract(-time * speed / cycle + seed) * cycle;
    let localV = fract(v / cycle) * cycle;
    let dv = localV - dropV;
    let du = fract(u / colW) * colW - colW * 0.5 - 0.015 * sin(v * 9.0 + seed * 20.0);
    let r = vec2f(du / 0.02, dv / 0.03);
    let d2 = dot(r, r);
    if (d2 < 1.0) {
      off += r * (1.0 - d2) * 0.9;
    }
    // Thin trail above the drop.
    if (dv > 0.0 && dv < 0.35 && abs(du) < 0.006) { off.x += du / 0.006 * 0.2; }
  }
  // Static beads.
  let cell = floor(vec2f(u, v) * 40.0);
  let bead = hash21(cell + 11.0);
  if (bead < 0.12 * strength) {
    let c = (fract(vec2f(u, v) * 40.0) - 0.5 - (vec2f(hash21(cell), hash21(cell + 3.0)) - 0.5) * 0.5) / 0.22;
    let d2 = dot(c, c);
    if (d2 < 1.0) { off += c * (1.0 - d2) * 0.5; }
  }
  return off;
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

struct Eval {
  diff: vec3f,
  spec: vec3f,
  pdfD: f32, // pdf of the cosine lobe
  pdfS: f32, // pdf of the GGX lobe
};

fn bsdfEval(s: Surf, l: Lobes, wo: vec3f, wi: vec3f) -> Eval {
  var e: Eval;
  let ndl = dot(s.n, wi);
  let ndv = dot(s.n, wo);
  if (ndl <= 0.0 || ndv <= 0.0) { return e; }
  let h = normalize(wo + wi);
  let ndh = max(dot(s.n, h), 0.0);
  let vdh = max(dot(wo, h), 0.0);
  let a2 = l.alpha * l.alpha;
  let F = schlick(vdh, l.f0);
  let D = dGgx(a2, ndh);
  let g1v = g1Smith(a2, ndv);
  let G = g1v * g1Smith(a2, ndl);
  e.spec = F * (D * G / (4.0 * ndv * ndl + 1e-6));
  e.diff = l.kd * INV_PI;
  e.pdfS = D * g1v / (4.0 * ndv + 1e-6);
  e.pdfD = ndl * INV_PI;
  return e;
}

// Returns the sampled direction; `spec` reports which lobe produced it.
fn sampleBsdf(s: Surf, l: Lobes, wo: vec3f, spec: ptr<function, bool>) -> vec3f {
  let frame = tangentFrame(s.n);
  if (rnd() < l.pSpec) {
    *spec = true;
    let woL = transpose(frame) * wo;
    let hL = sampleVndf(woL, l.alpha, rnd(), rnd());
    let h = frame * hL;
    return reflect(-wo, h);
  }
  *spec = false;
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

fn lightCount() -> u32 { return u32(U.p1.x); }

fn cellOf(p: vec3f) -> u32 {
  let cells = max(i32(U.p3.w), 1);
  let c = i32(floor((p.z - U.p3.y) / max(U.p3.z, 1e-3)));
  return u32(clamp(c, 0, cells - 1));
}

fn pickLight(cell: u32) -> u32 {
  let count = lightCount();
  let base = cell * count;
  let u = rnd();
  var lo = 0u;
  var hi = count - 1u;
  for (var it = 0u; it < 24u; it++) {
    if (lo >= hi) { break; }
    let mid = (lo + hi) / 2u;
    if (gridCdf[base + mid] < u) { lo = mid + 1u; } else { hi = mid; }
  }
  return lo;
}

fn lightProb(cell: u32, li: u32) -> f32 {
  let base = cell * lightCount();
  let prev = select(gridCdf[base + li - 1u], 0.0, li == 0u);
  return max(gridCdf[base + li] - prev, 1e-8);
}

struct LightSample {
  pos: vec3f,
  n: vec3f,
  le: vec3f,
  pdfA: f32, // probability density per unit area, including light selection
  mat: u32,
};

fn sampleLight(cell: u32) -> LightSample {
  var ls: LightSample;
  let li = pickLight(cell);
  let tr = tris[lightTris[li]];
  let r1 = rnd();
  let r2 = rnd();
  let sq = sqrt(r1);
  let b0 = 1.0 - sq;
  let b1 = r2 * sq;
  let b2 = 1.0 - b0 - b1;
  ls.pos = tr.v0.xyz * b0 + tr.v1.xyz * b1 + tr.v2.xyz * b2;
  ls.n = tr.n.xyz;
  ls.mat = u32(tr.v0.w);
  ls.le = mats[ls.mat].emis.rgb;
  ls.pdfA = lightProb(cell, li) / max(tr.v2.w, 1e-6);
  return ls;
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

// Resampled importance sampling: draw a few candidates from the cell's CDF,
// keep one in proportion to its estimated (unshadowed) contribution here.
struct Reservoir {
  ls: LightSample,
  wSum: f32,
  pHat: f32,
};

fn risPick(cell: u32, p: vec3f, n: vec3f, useCos: bool, rd: vec3f) -> Reservoir {
  var r: Reservoir;
  r.wSum = 0.0;
  r.pHat = 0.0;
  let m = max(u32(U.p3.x + 0.5), 1u);
  for (var k = 0u; k < m; k++) {
    var c = sampleLight(cell);
    let d = c.pos - p;
    let d2 = max(dot(d, d), 1e-3);
    let L = d * inverseSqrt(d2);
    // Patterned emitters depend on where they are seen from.
    let flags = u32(mats[c.mat].prm.z + 0.5);
    if ((flags & (FLAG_WINDOW | FLAG_BILLBOARD | FLAG_GLYPH)) != 0u) { c.le = emitted(mats[c.mat], c.pos, c.n, L); }
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

struct Nee {
  diff: vec3f,
  spec: vec3f,
};

fn neeSurface(cell: u32, s: Surf, l: Lobes, wo: vec3f) -> Nee {
  var out: Nee;
  let r = risPick(cell, s.p, s.n, true, vec3f(0.0));
  if (r.pHat <= 0.0) { return out; }
  let ls = r.ls;
  let d = ls.pos - s.p;
  let d2 = dot(d, d);
  let dist = sqrt(d2);
  let L = d / dist;
  let cosS = dot(s.n, L);
  let cosL = abs(dot(ls.n, L));
  if (cosS <= 0.0 || cosL < 1e-4 || dot(s.gf, L) <= 0.0) { return out; }
  if (occluded(offsetRay(s.p, s.gf), L, dist - 2e-3)) { return out; }
  let pdfSa = ls.pdfA * d2 / cosL;
  let ev = bsdfEval(s, l, wo, L);
  // Each lobe is its own sampling technique for MIS purposes.
  let pD = (1.0 - l.pSpec) * ev.pdfD;
  let pS = l.pSpec * ev.pdfS;
  let wD = pdfSa * pdfSa / (pdfSa * pdfSa + pD * pD);
  let wS = pdfSa * pdfSa / (pdfSa * pdfSa + pS * pS);
  let k = ls.le * (cosS / pdfSa);
  out.diff = k * ev.diff * wD;
  out.spec = k * ev.spec * wS;
  return out;
}

fn neeFog(cell: u32, p: vec3f, rd: vec3f) -> vec3f {
  let r = risPick(cell, p, vec3f(0.0), false, rd);
  if (r.pHat <= 0.0) { return vec3f(0.0); }
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

// ---- the drone's searchlight: an analytic spot light ----------------------

struct SpotLight {
  L: vec3f,     // direction from p toward the light
  dist: f32,
  irr: vec3f,   // incident radiance factor (intensity x cone / d^2), before visibility
  ok: bool,
};

fn spotAt(p: vec3f) -> SpotLight {
  var s: SpotLight;
  s.ok = false;
  if (U.s0.w <= 0.0) { return s; }
  let d = U.s0.xyz - p;
  let d2 = max(dot(d, d), 0.01);
  s.dist = sqrt(d2);
  s.L = d / s.dist;
  if (s.dist > U.s2.y) { return s; }
  let cone = smoothstep(U.s1.w, U.s2.x, dot(-s.L, U.s1.xyz));
  if (cone <= 0.0) { return s; }
  s.irr = vec3f(1.0, 0.97, 0.9) * (U.s0.w * cone / d2);
  s.ok = true;
  return s;
}

fn neeSpotSurface(s: Surf, l: Lobes, wo: vec3f) -> Nee {
  var out: Nee;
  let sp = spotAt(s.p);
  if (!sp.ok) { return out; }
  let cosS = dot(s.n, sp.L);
  if (cosS <= 0.0 || dot(s.gf, sp.L) <= 0.0) { return out; }
  if (occluded(offsetRay(s.p, s.gf), sp.L, sp.dist - 1e-2)) { return out; }
  let ev = bsdfEval(s, l, wo, sp.L);
  out.diff = sp.irr * ev.diff * cosS;
  out.spec = sp.irr * ev.spec * cosS;
  return out;
}

fn neeSpotFog(p: vec3f, rd: vec3f) -> vec3f {
  let sp = spotAt(p);
  if (!sp.ok) { return vec3f(0.0); }
  if (occluded(p, sp.L, sp.dist - 1e-2)) { return vec3f(0.0); }
  return sp.irr * phaseHg(dot(rd, sp.L));
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

fn clampLum(c: vec3f, maxLum: f32) -> vec3f {
  let l = luminance(c);
  return select(c, c * (maxLum / l), l > maxLum);
}

// ---------------------------------------------------------------- probes

// One shadowed light sample of the fluence (light from all directions) at p.
fn fluenceSample(p: vec3f) -> vec3f {
  let cell = cellOf(p);
  var best: LightSample;
  var wSum = 0.0;
  var pHatBest = 0.0;
  let m = 4u;
  for (var k = 0u; k < m; k++) {
    var c = sampleLight(cell);
    let d = c.pos - p;
    let d2 = max(dot(d, d), 0.05);
    let L = d * inverseSqrt(d2);
    let flags = u32(mats[c.mat].prm.z + 0.5);
    if ((flags & (FLAG_WINDOW | FLAG_BILLBOARD | FLAG_GLYPH)) != 0u) { c.le = emitted(mats[c.mat], c.pos, c.n, L); }
    let pHat = luminance(c.le) * abs(dot(c.n, L)) / d2;
    let w = pHat / c.pdfA;
    wSum += w;
    if (w > 0.0 && rnd() * wSum < w) { best = c; pHatBest = pHat; }
  }
  if (pHatBest <= 0.0) { return vec3f(0.0); }
  let d = best.pos - p;
  let d2 = max(dot(d, d), 0.05);
  let dist = sqrt(d2);
  let L = d / dist;
  if (occluded(p, L, dist - 2e-3)) { return vec3f(0.0); }
  let pdfA = pHatBest * f32(m) / wSum;
  var f = best.le * (abs(dot(best.n, L)) / d2) / pdfA;
  // The searchlight is deterministic; add it directly.
  let sp = spotAt(p);
  if (sp.ok && !occluded(p, sp.L, sp.dist - 1e-2)) { f += sp.irr; }
  return f;
}

@compute @workgroup_size(4, 4, 4)
fn probes(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= PROBE_DIMS.x || gid.y >= PROBE_DIMS.y || gid.z >= PROBE_DIMS.z) { return; }
  let frame = u32(U.p2.z);
  let idx = gid.x + gid.y * PROBE_DIMS.x + gid.z * PROBE_DIMS.x * PROBE_DIMS.y;
  let prev = textureLoad(probeIn, vec3i(gid), 0);
  // Refresh a quarter of the cells per frame.
  if ((idx + frame) % 4u != 0u) {
    textureStore(probeOut, vec3i(gid), prev);
    return;
  }
  rngState = pcg(pcg(idx) ^ pcg(frame * 0x9E3779B9u + 101u));
  let jitter = vec3f(rnd(), rnd(), rnd());
  let p = PROBE_ORIGIN + (vec3f(gid) + jitter) * PROBE_CELL;
  let est = clampLum(fluenceSample(p), 200.0);
  let n = min(prev.a + 1.0, 96.0);
  let avg = mix(prev.rgb, est, 1.0 / n);
  textureStore(probeOut, vec3i(gid), vec4f(avg, n));
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
  let haveLights = lightCount() > 0u;

  var Ld = vec3f(0.0);   // diffuse channel
  var Ls = vec3f(0.0);   // specular channel
  var T = vec3f(1.0);
  var chan = 0u;         // channel for everything after the first scattering event
  var chanSet = false;
  var tRefl = 0.0;       // distance from the primary hit to what it reflects
  var lastPdf = 0.0;
  var lastDelta = true;
  var lastCell = 0u;
  var primaryT = FOG_FAR;
  // Ray cone for texture LOD: width grows with distance travelled and with
  // the roughness of each bounce.
  let pixelSpread = 2.0 * tanH * U.res.w;
  var pathDist = 0.0;
  var coneSpread = pixelSpread;
  // Misses get a far-away position facing the camera so the sky still gets
  // temporal history and spatial filtering.
  var gPos = ro + rd * SKY_DIST;
  var gNrm = -rd;
  var gKd = vec3f(1.0);
  var gRough = 1.0;
  var gEmit = vec3f(0.0);

  for (var bounce = 0u; bounce <= maxBounces; bounce++) {
    let hit = intersectScene(ro, rd, T_MAX);
    let hasHit = hit.tri != NO_HIT;
    let tHit = select(FOG_FAR, hit.t, hasHit);
    var s: Surf;
    if (hasHit) { s = evalSurface(hit, ro, rd, (pathDist + hit.t) * coneSpread); }

    if (bounce == 0u) {
      primaryT = tHit;
      if (hasHit) {
        gPos = s.p;
        gNrm = s.n;
        let lb = lobes(s, -rd);
        gKd = lb.kd;
        gRough = s.rough;
        if (s.kind != KIND_OPAQUE || luminance(s.emis) > 0.0) { gKd = vec3f(1.0); }
      }
    } else if (bounce == 1u && chan == 1u) {
      tRefl = select(SKY_DIST, hit.t, hasHit);
    }

    // Volumetric fog: maybe scatter before reaching the surface.
    if (fogMode == 2u && sigma > 0.0) {
      let ts = -log(max(1e-6, 1.0 - rnd())) / sigma;
      if (ts < tHit) {
        let sp = ro + rd * ts;
        if (insideFog(sp)) {
          if (!chanSet) { chan = 0u; chanSet = true; }
          T *= FOG_ALBEDO;
          let cell = cellOf(sp);
          if (haveLights) {
            let c = T * (neeFog(cell, sp, rd) + neeSpotFog(sp, rd));
            if (chan == 1u) { Ls += c; } else { Ld += c; }
          }
          let nd = sampleHg(rd);
          lastPdf = phaseHg(dot(rd, nd));
          lastDelta = false;
          lastCell = cell;
          pathDist += ts;
          coneSpread += 0.3;
          ro = sp;
          rd = nd;
          continue;
        }
      }
    }

    if (!hasHit) {
      let c = T * sky(rd);
      if (chan == 1u) { Ls += c; } else { Ld += c; }
      break;
    }

    // Emission (with MIS against light sampling when we got here by BSDF sampling).
    if (luminance(s.emis) > 0.0) {
      if (bounce == 0u) {
        gEmit = s.emis;
      } else {
        var w = 1.0;
        let li = i32(tris[hit.tri].v1.w);
        if (!lastDelta && li >= 0 && haveLights) {
          let cosL = max(abs(dot(s.ng, rd)), 1e-4);
          let pdfSa = (lightProb(lastCell, u32(li)) / max(tris[hit.tri].v2.w, 1e-6)) * hit.t * hit.t / cosL;
          w = lastPdf * lastPdf / (lastPdf * lastPdf + pdfSa * pdfSa);
        }
        let c = T * s.emis * w;
        if (chan == 1u) { Ls += c; } else { Ld += c; }
      }
    }
    if (s.kind == KIND_EMITTER) { break; }

    if (s.kind == KIND_TRANSLUCENT) {
      // Prop disc: attenuate by the blurred blade coverage and continue.
      let m = mats[u32(tris[hit.tri].v0.w)];
      let pl = droneToLocalDir(s.p - U.d0.xyz);
      let cov = propCoverage(m, pl);
      T *= 1.0 - cov * (1.0 - m.base.rgb * 0.4);
      pathDist += hit.t;
      ro = offsetRay(s.p, -s.gf);
      continue;
    }

    if (s.kind == KIND_HOLO) {
      // Translucent light: add its glow, keep going straight through.
      let hp = holoPattern(mats[u32(tris[hit.tri].v0.w)], s.p, s.ng);
      if (bounce == 0u) { gEmit += hp.rgb; } else {
        let c = T * hp.rgb;
        if (chan == 1u) { Ls += c; } else { Ld += c; }
      }
      T *= 1.0 - hp.a;
      pathDist += hit.t;
      ro = offsetRay(s.p, -s.gf);
      continue;
    }

    if (s.kind == KIND_GLASS) {
      if (!chanSet) { chan = 1u; chanSet = true; }
      let eta = select(1.0 / s.ior, s.ior, s.inside);
      let cosI = clamp(-dot(rd, s.n), 0.0, 1.0);
      let k = 1.0 - eta * eta * (1.0 - cosI * cosI);
      let f0 = (1.0 - s.ior) / (1.0 + s.ior);
      let F = select(schlick(cosI, vec3f(f0 * f0)).x, 1.0, k < 0.0);
      if (s.inside) { T *= exp(-hit.t * vec3f(0.06, 0.02, 0.03)); }
      if (rnd() < F) {
        rd = reflect(rd, s.n);
        ro = offsetRay(s.p, s.gf);
      } else {
        rd = normalize(eta * rd + (eta * cosI - sqrt(max(k, 0.0))) * s.n);
        ro = offsetRay(s.p, -s.gf);
      }
      lastDelta = true;
      pathDist += hit.t;
      continue;
    }

    let wo = -rd;
    let lb = lobes(s, wo);
    let cell = cellOf(s.p);
    if (haveLights) {
      var nee = neeSurface(cell, s, lb, wo);
      let spotNee = neeSpotSurface(s, lb, wo);
      nee.diff += spotNee.diff;
      nee.spec += spotNee.spec;
      if (chanSet) {
        let c = T * (nee.diff + nee.spec);
        if (chan == 1u) { Ls += c; } else { Ld += c; }
      } else {
        Ld += T * nee.diff;
        Ls += T * nee.spec;
      }
    }

    var specLobe = false;
    let wi = sampleBsdf(s, lb, wo, &specLobe);
    let ev = bsdfEval(s, lb, wo, wi);
    var f = ev.diff;
    var pdf = (1.0 - lb.pSpec) * ev.pdfD;
    if (specLobe) {
      f = ev.spec;
      pdf = lb.pSpec * ev.pdfS;
    }
    if (pdf <= 0.0 || dot(s.gf, wi) <= 0.0) { break; }
    if (!chanSet) {
      chan = select(0u, 1u, specLobe);
      chanSet = true;
    }
    T *= f * (dot(s.n, wi) / pdf);
    lastPdf = pdf;
    lastDelta = false;
    lastCell = cell;
    pathDist += hit.t;
    coneSpread += select(0.25, s.rough * 0.5, specLobe);
    ro = offsetRay(s.p, s.gf);
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
    Ld = Ld * a + vec3f(0.09, 0.045, 0.08) * (1.0 - a);
    Ls *= a;
  }

  // Firefly clamp, then demodulate the diffuse channel by its albedo.
  let clampV = U.p2.x;
  var d = clampLum(Ld, clampV) / max(gKd, vec3f(0.01));
  var sp = clampLum(Ls, clampV);
  if (sampleIndex > 0u) {
    let prev = textureLoad(accumIn, pix, 0);
    let p0 = unpack2x16float(prev.x);
    let p1 = unpack2x16float(prev.y);
    let p2 = unpack2x16float(prev.z);
    d += vec3f(p0, p1.x);
    sp += vec3f(p1.y, p2);
  }
  textureStore(outRad, pix, vec4u(pack2x16float(d.rg), pack2x16float(vec2f(d.b, sp.r)), pack2x16float(sp.gb), 0u));
  if (sampleIndex == 0u) {
    textureStore(outPos, pix, vec4f(gPos, packNormal(gNrm)));
    textureStore(outAlb, pix, vec4f(gKd, gRough));
    textureStore(outEmit, pix, vec4f(gEmit, tRefl));
  }
}
