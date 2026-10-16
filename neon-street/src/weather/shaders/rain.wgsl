// Rain particles: a GPU particle update kernel and a streak/splash render
// pass. Drops live in a box that follows the camera; when one lands it turns
// into a short splash, then respawns above. Some particles are drips that
// fall from awning edges.

struct RainParams {
  camPos: vec4f,     // xyz, w = dt
  wind: vec4f,       // xyz wind velocity, w = time
  counts: vec4f,     // active particles, drip particles, emitter count, frame
  water: vec4f,      // water grid origin xz, cell, 0
  look: vec4f,       // streak time, brightness, max distance, 0
  drone: vec4f,      // drone position, w = downwash strength (0 = none)
};

struct Particle {
  pos: vec4f, // xyz, w = state (0 falling, 1 splash)
  vel: vec4f, // xyz, w = age
};

@group(0) @binding(0) var<uniform> R: RainParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read> emitters: array<vec4f>; // pairs: start xyz, end xyz
@group(0) @binding(3) var groundTex: texture_2d<f32>;              // water ground height (r32float)

const HALF: f32 = 9.0;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

var<private> rngState: u32;
fn rnd() -> f32 {
  rngState = pcg(rngState);
  return f32(rngState) * 2.3283064365386963e-10;
}

fn groundAt(p: vec3f) -> f32 {
  let dims = vec2i(textureDimensions(groundTex));
  let t = vec2i(floor((p.xz - R.water.xy) / R.water.z));
  if (t.x < 0 || t.y < 0 || t.x >= dims.x || t.y >= dims.y) { return 0.0; }
  return textureLoad(groundTex, t, 0).r;
}

fn respawn(i: u32, p: ptr<function, Particle>) {
  let isDrip = i < u32(R.counts.y) && u32(R.counts.z) > 0u;
  if (isDrip) {
    let e = u32(rnd() * R.counts.z) * 2u;
    let a = emitters[e].xyz;
    let b = emitters[e + 1u].xyz;
    (*p).pos = vec4f(mix(a, b, rnd()), 0.0);
    (*p).vel = vec4f(0.0, -0.3, 0.0, 0.0);
  } else {
    let c = R.camPos.xyz;
    (*p).pos = vec4f(c.x + (rnd() * 2.0 - 1.0) * HALF, c.y + 4.0 + rnd() * 9.0, c.z + (rnd() * 2.0 - 1.0) * HALF, 0.0);
    (*p).vel = vec4f(R.wind.x, -(7.5 + rnd() * 3.0), R.wind.z, 0.0);
  }
}

@compute @workgroup_size(64)
fn update(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(R.counts.x)) { return; }
  rngState = pcg(pcg(i) ^ pcg(u32(R.counts.w) * 0x9E3779B9u + 7u));
  var p = particles[i];
  let dt = R.camPos.w;
  let c = R.camPos.xyz;
  if (p.pos.w < 0.5) {
    // Falling.
    let isDrip = i < u32(R.counts.y);
    if (isDrip) { p.vel.y -= 9.8 * dt; }
    p.pos = vec4f(p.pos.xyz + p.vel.xyz * dt, 0.0);
    // Gentle sway.
    p.pos.x += sin(R.wind.w * 2.0 + f32(i) * 0.37) * 0.15 * dt;
    // Rotor downwash blows drops outward and down beneath the drone.
    if (R.drone.w > 0.0) {
      let below = R.drone.y - p.pos.y;
      let r = p.pos.xz - R.drone.xz;
      let rl = length(r);
      if (below > 0.0 && below < 7.0 && rl < 2.8) {
        let push = (1.0 - rl / 2.8) * (1.0 - below / 7.0) * R.drone.w;
        let dir = select(vec2f(1.0, 0.0), r / rl, rl > 1e-3);
        p.pos = vec4f(p.pos.xz + dir * push * 5.0 * dt, p.pos.y - push * 4.0 * dt, 0.0).xzyw;
      }
    }
    // Keep the drop inside the box around the camera.
    if (p.pos.x < c.x - HALF) { p.pos.x += 2.0 * HALF; }
    if (p.pos.x > c.x + HALF) { p.pos.x -= 2.0 * HALF; }
    if (p.pos.z < c.z - HALF) { p.pos.z += 2.0 * HALF; }
    if (p.pos.z > c.z + HALF) { p.pos.z -= 2.0 * HALF; }
    let g = groundAt(p.pos.xyz);
    if (p.pos.y <= g) {
      p.pos = vec4f(p.pos.x, g + 0.005, p.pos.z, 1.0);
      p.vel = vec4f(0.0, 0.0, 0.0, 0.0);
    } else if (p.pos.y < -1.0 || p.pos.y > c.y + 30.0) {
      respawn(i, &p);
    }
  } else {
    // Splash: expand briefly, then come back as a new drop.
    p.vel.w += dt;
    if (p.vel.w > 0.16) { respawn(i, &p); }
  }
  particles[i] = p;
}

// ---------------------------------------------------------------- drawing

@group(1) @binding(0) var<uniform> U: Uniforms;
@group(1) @binding(1) var gPos: texture_2d<f32>;      // primary hit positions, for the depth test
@group(1) @binding(2) var probes: texture_3d<f32>;    // irradiance volume
@group(1) @binding(3) var probeSamp: sampler;
// Vertex shaders may only read storage buffers, so the draw pass gets its own view.
@group(1) @binding(4) var<storage, read> drawParticles: array<Particle>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) dist: f32,
  @location(2) @interpolate(flat) light: vec3f,
  @location(3) @interpolate(flat) kind: f32,
  @location(4) @interpolate(flat) age: f32,
};

// Project a world point: returns ndc xy and view depth.
fn project(p: vec3f) -> vec3f {
  let v = p - U.camPos.xyz;
  let z = dot(v, U.camFwd.xyz);
  let tanH = U.camPos.w;
  let aspect = U.camFwd.w;
  let x = dot(v, U.camRight.xyz) / (max(z, 1e-3) * tanH * aspect);
  let y = dot(v, U.camUp.xyz) / (max(z, 1e-3) * tanH);
  return vec3f(x, y, z);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  var o: VSOut;
  let p = drawParticles[ii];
  let corner = vec2f(f32((vi == 1u || vi == 2u || vi == 4u)), f32((vi == 2u || vi == 4u || vi == 5u))); // 0/1 quad corners
  let s = corner * 2.0 - 1.0;
  o.uv = s;
  o.kind = p.pos.w;
  o.age = p.vel.w;
  let fluence = textureSampleLevel(probes, probeSamp, probeUvw(p.pos.xyz), 0.0).rgb;
  o.light = fluence * R.look.y + vec3f(0.004, 0.005, 0.007);
  var a = p.pos.xyz;
  var b = a;
  if (p.pos.w < 0.5) {
    b = a - p.vel.xyz * R.look.x; // streak tail
  }
  let pa = project(a);
  let pb = project(b);
  o.dist = pa.z;
  if ((pa.z < 0.05 && pb.z < 0.05) || ii >= u32(R.counts.x)) {
    o.pos = vec4f(0.0, 0.0, 2.0, 1.0); // behind the camera: clipped away
    return o;
  }
  let pixel = 2.0 * U.res.zw; // one pixel in ndc
  if (p.pos.w < 0.5) {
    // Streak quad along the projected segment, ~1.3 px wide.
    let along = pb.xy - pa.xy;
    let len = max(length(along), 1e-5);
    let dir = along / len;
    let perp = vec2f(-dir.y, dir.x) * pixel * 0.65 * (1.0 + 0.6 / max(pa.z, 0.5));
    let centre = mix(pa.xy, pb.xy, corner.y);
    o.pos = vec4f(centre + perp * s.x, 0.5, 1.0);
  } else {
    // Splash: small screen-facing quad that grows with age.
    let grow = 0.04 + 0.12 * o.age / 0.16;
    let size = vec2f(grow / (max(pa.z, 0.3) * U.camPos.w * U.camFwd.w), grow * 0.5 / (max(pa.z, 0.3) * U.camPos.w));
    o.pos = vec4f(pa.xy + s * size, 0.5, 1.0);
  }
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  // Manual depth test against the path tracer's primary hits.
  let pix = vec2i(in.pos.xy);
  let scene = textureLoad(gPos, pix, 0).xyz;
  let sceneDist = length(scene - U.camPos.xyz);
  if (in.dist > sceneDist + 0.02) { discard; }
  var a = 0.0;
  if (in.kind < 0.5) {
    a = (1.0 - abs(in.uv.x)) * smoothstep(-1.0, -0.6, in.uv.y) * (1.0 - smoothstep(0.3, 1.0, in.uv.y));
    // Fade very close drops (they'd cover the screen) and distant ones.
    a *= smoothstep(0.25, 0.9, in.dist) * (1.0 - smoothstep(R.look.z * 0.6, R.look.z, in.dist));
  } else {
    let t = in.age / 0.16;
    let r = length(in.uv * vec2f(1.0, 1.4));
    a = (1.0 - smoothstep(0.0, 0.35, abs(r - (0.2 + 0.7 * t)))) * (1.0 - t) * 0.7;
    a *= smoothstep(0.3, 1.0, in.dist) * (1.0 - smoothstep(R.look.z * 0.3, R.look.z * 0.6, in.dist));
  }
  return vec4f(in.light * a, 0.0);
}
