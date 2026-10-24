# Damage that looks like damage: scratches are streaks fixed to the panels (running along the car, the way a scrape
# drags), the paint scuffs, then tears down to bare metal; a hard hit near a window cracks it, a spider web of
# radial cracks and broken rings round the point of impact, seen from outside and from the driver's seat.
#   python3 -I damage_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# ---- paint: model-space position for the scratches
rep("""#ifdef FC_PAINT
uniform vec3 fcPaint; uniform float fcPaintOn; uniform vec3 fcBase;
varying float vDmg;
#endif""", """#ifdef FC_PAINT
uniform vec3 fcPaint; uniform float fcPaintOn; uniform vec3 fcBase;
varying float vDmg; varying vec3 vDmgP;
float fcH1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fcN1(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fcH1(i), fcH1(i + vec2(1, 0)), f.x), mix(fcH1(i + vec2(0, 1)), fcH1(i + vec2(1, 1)), f.x), f.y); }
float fcScr = 0.0, fcBare = 0.0, fcScuff = 0.0;
#endif""")
rep("""  // scratches: lighter, rougher streaks, then bare grey metal where it's worst
  float sn = fract(sin(dot(floor(vViewPosition.xy * 90.0), vec2(12.9898, 78.233))) * 43758.5453);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.55 + 0.25, vec3(0.42, 0.43, 0.45), smoothstep(0.55, 1.0, vDmg)), clamp(vDmg * 1.4, 0.0, 1.0) * (0.65 + 0.35 * sn));""",
    """  // damage, fixed to the panels: a dull scuff, fine streaks along the car (a scrape drags lengthwise) that cut
  // through the clear coat and show lighter, then torn paint and bare metal with a ragged edge where it's worst
  if (vDmg > 0.002) {
    float row = floor(vDmgP.y * 260.0 + fcN1(vDmgP.zx * vec2(1.6, 0.7)) * 5.0);
    float along = fcN1(vec2(vDmgP.z * 5.0 + fcH1(vec2(row, 1.7)) * 40.0, row));
    fcScr = step(1.0 - min(0.75, vDmg * 0.9), fcH1(vec2(row, 3.1))) * smoothstep(0.35, 0.6, along);
    fcScuff = smoothstep(0.0, 0.5, vDmg) * (0.6 + 0.4 * fcN1(vDmgP.zy * 7.0));
    fcBare = smoothstep(0.5, 0.62, vDmg + (fcN1(vDmgP.zy * 16.0) - 0.5) * 0.4 + (fcN1(vDmgP.zy * 55.0) - 0.5) * 0.15);
    vec3 dull = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * 0.8 + 0.06, 0.35);
    diffuseColor.rgb = mix(diffuseColor.rgb, dull, fcScuff * 0.7);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45 + 0.42, fcScr * 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.51, 0.53) * (0.8 + 0.3 * fcN1(vDmgP.zy * 90.0)), fcBare);
  }""")
rep("""roughnessFactor = mix(roughnessFactor, 0.32 + vDmg * 0.5, fcPaintMask);""",
    """roughnessFactor = mix(roughnessFactor, mix(mix(0.32 + fcScuff * 0.35, 0.55, fcScr), 0.38, fcBare), fcPaintMask);""")
rep("""metalnessFactor = mix(metalnessFactor, 0.45, fcPaintMask);""", """metalnessFactor = mix(metalnessFactor, mix(0.45, 0.9, fcBare), fcPaintMask);""")
rep("""material.clearcoat *= fcPaintMask * (1.0 - vDmg);""", """material.clearcoat *= fcPaintMask * (1.0 - max(fcScuff * 0.7, fcBare));""")
rep("""#ifdef FC_PAINT
attribute float dmg; varying float vDmg;
#endif""", """#ifdef FC_PAINT
attribute float dmg; varying float vDmg; varying vec3 vDmgP;
#endif""")
rep("""#ifdef FC_PAINT
vDmg = dmg;
#endif""", """#ifdef FC_PAINT
vDmg = dmg; vDmgP = position;
#endif""")

# ---- cracked glass
rep("""// p: where it hit, n: the direction it pushes the panel (both in the car's frame), dent: metres, scratch 0..1""",
    """// a cracked window: the car's glass gets its own materials with up to four points of impact (the car's frame,
// w = how hard). Radial cracks and broken rings round each, seen from outside and from the driver's seat.
const CRACK_GLSL = `
uniform vec4 crP[4]; varying vec3 vCrP; varying vec3 vCrN;
float crH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float crN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(crH(i), crH(i + vec2(1, 0)), f.x), mix(crH(i + vec2(0, 1)), crH(i + vec2(1, 1)), f.x), f.y); }
float crLines() {
  float L = 0.0;
  vec3 n = normalize(vCrN), t = normalize(cross(n, abs(n.y) > 0.8 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0))), b = cross(n, t);
  for (int i = 0; i < 4; i++) {
    float w = crP[i].w; if (w <= 0.0) continue;
    vec3 d3 = vCrP - crP[i].xyz; vec2 q = vec2(dot(d3, t), dot(d3, b));
    float r = length(q), R = 0.22 + 0.5 * w;
    if (r > R * 1.2 || abs(dot(d3, n)) > 0.25) continue;
    float a = atan(q.y, q.x) / 6.2831853 + 0.5, k = 15.0, seed = float(i) * 13.7;
    float wob = (crN(vec2(r * 14.0, seed)) - 0.5) * 0.35;
    float sec = a * k + wob, id = floor(sec);
    float arc = abs(fract(sec) - 0.5) * 6.2831853 / k * r;   // distance to the nearest radial crack, in metres
    float len = R * (0.35 + 0.65 * crH(vec2(id, seed)));
    float px = max(fwidth(r) * 0.9, 0.0006);
    float radial = (1.0 - smoothstep(px * 0.5, px * 1.5, arc - 0.0001)) * (1.0 - smoothstep(len * 0.8, len, r));
    float ring = 0.0;
    for (int j = 0; j < 3; j++) {
      float rr = R * (0.12 + 0.2 * float(j) + 0.08 * crH(vec2(seed, float(j)))) + (crN(vec2(a * 30.0, seed + float(j))) - 0.5) * 0.02;
      float on = step(0.45, crH(vec2(id, seed + float(j) * 3.0)));
      ring = max(ring, (1.0 - smoothstep(px * 0.5, px * 1.5, abs(r - rr) - 0.0001)) * on);
    }
    float core = 1.0 - smoothstep(0.015, 0.05 * (0.5 + w), r);   // crushed glass at the point of impact
    L = max(L, max(max(radial, ring) * (0.55 + 0.45 * w), core * 0.85));
  }
  return L;
}`;
function crackMat(m) {
  const c = m.clone(); c.userData = {};
  lit(c);
  const own = c.onBeforeCompile, key = c.customProgramCacheKey();
  c.extensions = Object.assign({}, c.extensions, { derivatives: true });
  c.onBeforeCompile = function (sh, r) {
    own.call(this, sh, r);
    sh.uniforms.crP = this.userData.crU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\\nvarying vec3 vCrP; varying vec3 vCrN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\\nvCrP = position; vCrN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + CRACK_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float cl = crLines(); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.82, 0.85), cl * 0.6); diffuseColor.a = max(diffuseColor.a, cl * 0.7); }`);
  };
  c.customProgramCacheKey = () => key + '|crack';
  return c;
}
function crackGlass(model, p, w) {
  const U = model.userData;
  if (!U.glass || !U.glassMats) return;
  // the window nearest the hit: crack only if the hit is close to glass
  const P = U.glass.geometry.attributes.position, a = P.array;
  let best = 1e9, bi = -1;
  for (let i = 0; i < P.count; i += 2) { const d = (a[i * 3] - p.x) ** 2 + (a[i * 3 + 1] - p.y) ** 2 + (a[i * 3 + 2] - p.z) ** 2; if (d < best) { best = d; bi = i; } }
  if (bi < 0 || best > 0.8 * 0.8) return;
  if (!U.crU) {
    U.crU = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) };
    const own = list => list.map(m => { const c = crackMat(m); c.userData.crU = U.crU; return c; });
    U.glassMats = own(U.glassMats); if (U.glassMatsIn) U.glassMatsIn = own(U.glassMatsIn);
    U.glass.material = U.glassMats; U.crN = 0;
  }
  const v = U.crU.value, near = v.find(c => c.w > 0 && (c.x - a[bi * 3]) ** 2 + (c.y - a[bi * 3 + 1]) ** 2 + (c.z - a[bi * 3 + 2]) ** 2 < 0.04);
  if (near) { near.w = Math.min(1, near.w + w * 0.5); return; }
  v[U.crN++ % 4].set(a[bi * 3], a[bi * 3 + 1], a[bi * 3 + 2], Math.min(1, 0.3 + w));
}
// p: where it hit, n: the direction it pushes the panel (both in the car's frame), dent: metres, scratch 0..1""")
rep("""    damageCar(view.model, _hp, _hn, 0.35 + k * 0.45, 0.03 + k * 0.1, 0.4 + k * 0.6);
  }""", """    damageCar(view.model, _hp, _hn, 0.35 + k * 0.45, 0.03 + k * 0.1, 0.4 + k * 0.6);
    if (k > 0.3) crackGlass(view.model, _hp, k);
  }""")
# the debug handle gets the damage tools (DEV only)
rep("""studio, makeCar, makeDriverFigure, CARS, post, hud };""", """studio, makeCar, makeDriverFigure, CARS, post, hud, damageCar, crackGlass, get playerModel() { return playerModel; } };""")
open(p, 'w').write(s); print('damage patch applied')
