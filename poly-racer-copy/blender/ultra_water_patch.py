# Ultra water and soft shadows.
#   water: a depth map of the terrain under the water, so the shallows go pale and clear over the sand, the shore
#   breaks into moving foam, two layers of waves cross the surface, a swell lifts it where it is deep, and it turns
#   to the sky's reflection at a glancing view.
#   shadows: percentage-closer soft shadows: crisp where a shadow touches its caster, softer the further it falls.
#   python3 -I ultra_water_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# ---- soft shadows: patch the shadow chunk before any material compiles
rep("""renderer = makeRenderer();
""", """renderer = makeRenderer();
if (Q.ultra) {
  // Ultra: soft shadows with a real penumbra (percentage-closer soft shadows). A blocker search finds how far the
  // shadow has fallen from what casts it, and the filter widens with that distance, so a car sits on a crisp shadow
  // while a tree top's is soft. PCSS_K is the sun's apparent size in the shadow map's own units (depth 0..1 over
  // 499 m, 120 m across): about one and a half degrees, a little wider than the real sun so it reads at game scale.
  THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment
    .replace('float getShadow( sampler2D shadowMap', `
#define PCSS_N 16
#define PCSS_K ${(0.026 * 499 / 120).toFixed(4)}
vec2 pcssDisk(int i, float a) { float r = sqrt((float(i) + 0.5) / float(PCSS_N)); float t = float(i) * 2.399963 + a; return r * vec2(cos(t), sin(t)); }
float pcssShadow(sampler2D shadowMap, vec2 shadowMapSize, vec4 sc) {
  float ang = 6.2832 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float bl = 0.0, nb = 0.0, sr = 0.004;
  for (int i = 0; i < PCSS_N; i++) { float d = unpackRGBAToDepth(texture2D(shadowMap, sc.xy + pcssDisk(i, ang) * sr)); if (d < sc.z) { bl += d; nb += 1.0; } }
  if (nb < 0.5) return 1.0;
  float r = clamp((sc.z - bl / nb) * PCSS_K, 1.2 / shadowMapSize.x, sr);
  float sh = 0.0;
  for (int i = 0; i < PCSS_N; i++) sh += texture2DCompare(shadowMap, sc.xy + pcssDisk(i, ang + 1.0) * r, sc.z);
  return sh / float(PCSS_N);
}
float getShadow( sampler2D shadowMap`)
    .replace('#if defined( SHADOWMAP_TYPE_PCF )', '#if defined( SHADOWMAP_TYPE_PCF_SOFT )\\n\\t\\t\\tshadow = pcssShadow( shadowMap, shadowMapSize, shadowCoord );\\n\\t\\t#elif defined( SHADOWMAP_TYPE_PCF )');
}
""")

# ---- water: one builder for both worlds
rep("""const world = { group: null, ctr: new V3(), span: 100, groundY: 0, tiles: [], water: null, shadowAt: new V3(1e9, 0, 0) };""",
    """const world = { group: null, ctr: new V3(), span: 100, groundY: 0, tiles: [], water: null, shadowAt: new V3(1e9, 0, 0) };
// the water: a plane at the water level. Ultra gives it depth: a map of how far the terrain lies under it, so the
// shallows go pale and clear over the sand and the shore breaks into moving foam; two layers of waves cross it, a
// swell lifts it where it is deep enough, and it turns to the sky's reflection at a glancing view.
const WATER_U = { time: { value: 0 }, shallow: { value: new THREE.Color() }, depth: { value: null }, rect: { value: new THREE.Vector4() } };
function makeWater(E, terrain, ctr, wl, size) {
  const wm = MAT.water.clone();
  wm.color = C(E.waterCol);
  if (E.ice) { wm.roughness = 0.18; wm.normalScale.set(0.08, 0.08); wm.opacity = 0.97; }
  TEX.water.repeat.set(size / 45, size / 45);
  if (!Q.ultra || E.ice) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), lit(wm));
    w.position.set(ctr.x, wl, ctr.z); w.receiveShadow = true;
    return w;
  }
  // how deep the water is around the track, a texel every few metres, 0..24 m
  const R = terrain.RN + 40, DN = 768, px = new Uint8Array(DN * DN * 4);
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
    const x = ctr.x - R + (i + 0.5) / DN * 2 * R, z = ctr.z - R + (j + 0.5) / DN * 2 * R;
    const d = Math.round(Math.max(0, Math.min(1, (wl - terrain.h(x, z)) / 24)) * 255), o = (j * DN + i) * 4;
    px[o] = px[o + 1] = px[o + 2] = d; px[o + 3] = 255;
  }
  if (WATER_U.depth.value) WATER_U.depth.value.dispose();
  const dtex = new THREE.DataTexture(px, DN, DN, THREE.RGBAFormat); dtex.minFilter = dtex.magFilter = THREE.LinearFilter; dtex.needsUpdate = true;
  WATER_U.depth.value = dtex; WATER_U.rect.value.set(ctr.x - R, ctr.z - R, 0.5 / R, 0.5 / R);
  // real water has next to no colour of its own: it is the sky's reflection over a dark volume, going pale and
  // clear only over sand in the shallows
  WATER_U.shallow.value.copy(wm.color).lerp(C('#8ccac4'), 0.6).multiplyScalar(0.8);
  wm.color.multiplyScalar(0.55);
  wm.roughness = 0.1; wm.normalScale.set(0.5, 0.5); wm.opacity = 0.92;
  wm.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { wTime: WATER_U.time, wShallow: WATER_U.shallow, wDepth: WATER_U.depth, wRect: WATER_U.rect });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\\nuniform float wTime; uniform sampler2D wDepth; uniform vec4 wRect; varying vec3 vWp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float wd = texture2D(wDepth, (wp0.xz - wRect.xy) * wRect.zw).r * 24.0;
  transformed.y += smoothstep(0.0, 2.5, wd) * (0.10 * sin(dot(wp0.xz, vec2(0.040, 0.031)) + wTime * 0.9) + 0.06 * sin(dot(wp0.xz, vec2(-0.071, 0.052)) + wTime * 1.3));
  vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float wTime; uniform vec3 wShallow; uniform sampler2D wDepth; uniform vec4 wRect; varying vec3 vWp;
float wh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
float wFoam = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ vec2 duv = (vWp.xz - wRect.xy) * wRect.zw;
  float wd = all(greaterThan(duv, vec2(0.0))) && all(lessThan(duv, vec2(1.0))) ? texture2D(wDepth, duv).r * 24.0 : 24.0;
  diffuseColor.rgb = mix(wShallow, diffuseColor.rgb, 1.0 - exp(-wd * 0.7));
  diffuseColor.a = mix(0.45, diffuseColor.a, smoothstep(0.0, 2.5, wd));
  float fn = wn(vWp.xz * 0.7 + vec2(wTime * 0.25, -wTime * 0.18)) * 0.6 + wn(vWp.xz * 1.9 - wTime * 0.35) * 0.4;
  float band = smoothstep(1.4, 0.15, wd) * (0.55 + 0.45 * sin(wTime * 0.8 - wd * 3.5));
  wFoam = smoothstep(0.42, 0.72, band * (fn + 0.35));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.94), wFoam);
  diffuseColor.a = max(diffuseColor.a, wFoam * 0.95); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\\nroughnessFactor = mix(roughnessFactor, 0.85, wFoam);')
      .replace('vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;', `vec3 mapN = normalize((texture2D(normalMap, vUv + vec2(wTime * 0.011, wTime * 0.007)).xyz * 2.0 - 1.0) + (texture2D(normalMap, vUv * 2.7 + vec2(-wTime * 0.016, wTime * 0.010)).xyz * 2.0 - 1.0) * 0.7 + vec3(0.0, 0.0, 0.5));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float wFr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0); diffuseColor.a = clamp(diffuseColor.a + wFr * 0.6, 0.0, 1.0); }`);
  };
  wm.customProgramCacheKey = () => 'water-ultra';
  const w = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 96, 96).rotateX(-Math.PI / 2), lit(wm));
  w.position.set(ctr.x, wl, ctr.z); w.receiveShadow = true;
  return w;
}""")
rep("""  if (E.water != null) {
    const wm = MAT.water.clone();
    wm.color = C(E.waterCol);
    if (E.ice) { wm.roughness = 0.18; wm.normalScale.set(0.08, 0.08); wm.opacity = 0.97; }
    const size = terrain.RF * 2.2;
    TEX.water.repeat.set(size / 45, size / 45);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), wm);
    w.position.set(ctr.x, groundY + E.water, ctr.z);
    w.receiveShadow = true;
    grp.add(w); world.water = w;
  } else world.water = null;""",
    """  if (E.water != null) { const w = makeWater(E, terrain, ctr, groundY + E.water, terrain.RF * 2.2); grp.add(w); world.water = w; }
  else world.water = null;""")
rep("""  if (E.water != null) {
    const wm = MAT.water.clone();
    wm.color = C(E.waterCol);
    if (E.ice) { wm.roughness = 0.18; wm.normalScale.set(0.08, 0.08); wm.opacity = 0.97; }
    const size = terrain.RF * 2.2;
    TEX.water.repeat.set(size / 45, size / 45);
    const wmesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), lit(wm));
    wmesh.position.set(ctr.x, wl, ctr.z);
    wmesh.receiveShadow = true;
    grp.add(wmesh); world.water = wmesh;
  } else world.water = null;""",
    """  if (E.water != null) { const wmesh = makeWater(E, terrain, ctr, wl, terrain.RF * 2.2); grp.add(wmesh); world.water = wmesh; }
  else world.water = null;""")
rep("""  if (world.water && world.water.material.normalMap) {
    const o = world.water.material.normalMap.offset;
    o.x += dt * 0.01; o.y += dt * 0.006;
  }""", """  if (world.water && world.water.material.normalMap) {
    const o = world.water.material.normalMap.offset;
    o.x += dt * 0.01; o.y += dt * 0.006;
  }
  WATER_U.time.value += dt;""")
open(p, 'w').write(s); print('ultra water patch applied')
