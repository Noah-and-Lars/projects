# Ultra reflections and rain: screen-space reflections on the water and on wet roads, puddles with raindrop
# ripples, rain rings on the water, darker and glossier kerbs, verges and ground in the rain.
#   python3 -I ultra_ssr_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# ---- the shared uniforms and the shader code, right after the material light helper
rep("""// ---------- Worlds ----------
// sky: zenith, horizon, ground below horizon.""", """// ---------- Ultra: reflections ----------
// Screen-space reflections: a reflective surface (the water, a wet road) follows its reflected ray through this
// frame's depth (the Ultra depth pass, drawn before the picture) and, where the ray meets something, shows what was
// there in the last frame's picture (reprojected, so the camera moving doesn't smear it). Rays that leave the
// screen or meet nothing keep the sky reflection the material already has. Applied after tone mapping, so the
// reflected colour is in the same space as the picture it came from.
const SSR_U = { ssrD: { value: null }, ssrC: { value: null }, ssrP: { value: new THREE.Matrix4() }, ssrIV: { value: new THREE.Matrix4() },
  ssrPVP: { value: new THREE.Matrix4() }, ssrNF: { value: new THREE.Vector2(0.3, 1000) }, ssrOn: { value: 0 }, ssrWet: { value: 0 }, ssrTime: { value: 0 } };
const SSR_GLSL = `
uniform sampler2D ssrD; uniform sampler2D ssrC; uniform mat4 ssrP; uniform mat4 ssrIV; uniform mat4 ssrPVP; uniform vec2 ssrNF; uniform float ssrOn; uniform float ssrWet; uniform float ssrTime;
float ssrSkyHit = 0.0;
float ssrZ(vec2 uv) { return -perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(ssrD, uv)), ssrNF.x, ssrNF.y); }
vec2 ssrUV(vec3 q) { vec4 c = ssrP * vec4(q, 1.0); return c.xy / c.w * 0.5 + 0.5; }
float ssrH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ssrN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ssrH(i), ssrH(i + vec2(1, 0)), f.x), mix(ssrH(i + vec2(0, 1)), ssrH(i + vec2(1, 1)), f.x), f.y); }
// rain rings: each cell of a grid gets a drop at a random moment; a ring spreads from it and fades. Returns a slope.
vec2 ssrRipple(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 2.3 : 3.7;
    vec2 g = floor(p * sc + float(k) * 0.37), f = fract(p * sc + float(k) * 0.37);
    float ph = fract(t * 1.1 + ssrH(g + float(k) * 7.1));
    vec2 c = f - 0.5 - (vec2(ssrH(g + 1.3), ssrH(g + 2.7)) - 0.5) * 0.5;
    float d = length(c), r = ph * 0.42;
    float ring = sin((d - r) * 55.0) * smoothstep(0.07, 0.0, abs(d - r)) * (1.0 - ph) * (1.0 - ph);
    acc += c / max(d, 1e-3) * ring;
  }
  return acc;
}
// march the reflected ray in view space; returns the colour it found and how far to trust it
vec4 ssrTrace(vec3 P, vec3 N) {
  vec3 R = reflect(normalize(P), N);
  float facing = smoothstep(0.35, -0.05, R.z);   // rays coming back at the camera see what is behind it: fade them
  if (facing <= 0.0) return vec4(0.0);
  vec3 Q = P + N * 0.06, prevQ = Q;
  float stepL = max(0.2, -P.z * 0.025);
  vec2 uv = vec2(0.5), lastUV = vec2(-1.0);
  float hit = 0.0;
  for (int i = 0; i < 30; i++) {
    prevQ = Q; Q += R * stepL; stepL *= 1.17;
    if (Q.z > -ssrNF.x) break;
    uv = ssrUV(Q);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    lastUV = uv;
    float zs = ssrZ(uv), dz = -Q.z - zs;
    if (dz > 0.06 + zs * 0.003 && dz < max(1.2, stepL * 2.0)) {
      vec3 a = prevQ, b = Q;
      for (int j = 0; j < 5; j++) { vec3 mid = (a + b) * 0.5; if (-mid.z - ssrZ(ssrUV(mid)) > 0.0) b = mid; else a = mid; }
      Q = b; hit = 1.0; break;
    }
  }
  float sky = 0.0;
  if (hit < 0.5) {
    // nothing in the way: if the ray left the picture through the sky, show that sky (sharper than the env map)
    if (lastUV.x < 0.0 || ssrZ(lastUV) < ssrNF.y * 0.9) return vec4(0.0);
    Q = P + R * 2000.0; sky = 1.0; ssrSkyHit = 1.0;
  }
  vec4 pc = ssrPVP * (ssrIV * vec4(Q, 1.0));
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  if (pc.w <= 0.0) return vec4(0.0);
  vec2 e = smoothstep(0.0, 0.07, puv) * smoothstep(1.0, 0.93, puv);
  return vec4(texture2D(ssrC, clamp(puv, 0.001, 0.999)).rgb, e.x * e.y * facing * (sky > 0.5 ? 0.75 : 1.0));
}`;
// make a material reflective: kind 'road' (wet only: puddles, ripples, reflections) or 'water'
function reflective(m, kind) {
  if (!Q.ultra || !m || m.userData.ssr) return m;
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    Object.assign(sh.uniforms, SSR_U);
    const road = kind === 'road';
    sh.fragmentShader = sh.fragmentShader.replace('#include <packing>', '#include <packing>' + SSR_GLSL + '\\nfloat ssrPud = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
${road ? `if (ssrWet > 0.0) {
  // puddles: low patches of the road hold water; the rest is a dark, wet sheen
  vec2 wp = vFcP.xz;
  float pn = ssrN(wp * 0.23) * 0.65 + ssrN(wp * 0.9 + 3.1) * 0.35;
  ssrPud = smoothstep(0.6, 0.68, pn) * ssrWet;
  diffuseColor.rgb *= mix(1.0, 0.72, ssrPud);
}` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
${road ? 'roughnessFactor = mix(roughnessFactor, 0.03, ssrPud);' : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${road ? `if (ssrPud > 0.0) {
  normal = normalize(mix(normal, geometryNormal, ssrPud));
  vec2 rp = ssrRipple(vFcP.xz, ssrTime);
  normal = normalize(normal + mat3(viewMatrix) * vec3(rp.x, 0.0, rp.y) * 0.5 * ssrPud);
}` : `if (ssrWet > 0.0) { vec2 rp = ssrRipple(vFcP.xz * 0.8, ssrTime); normal = normalize(normal + mat3(viewMatrix) * vec3(rp.x, 0.0, rp.y) * 0.35 * ssrWet); }`}`)
      .replace('#include <encodings_fragment>', `#include <encodings_fragment>
if (ssrOn > 0.5${road ? ' && ssrWet > 0.0' : ''}) {
  vec3 Nr = normalize(mix(geometryNormal, normal, ${road ? 'mix(0.35, 1.0, ssrPud)' : '0.22'}));
  vec4 rf = ssrTrace(-vViewPosition, Nr);
  float cosv = clamp(dot(normalize(vViewPosition), Nr), 0.0, 1.0), fr = pow(1.0 - cosv, 5.0);
  float w = ${road ? 'ssrWet * mix(0.06 + 0.3 * fr, 0.4 + 0.5 * fr, ssrPud) * mix(1.0, 0.2, ssrSkyHit)' : '0.2 + 0.75 * fr'};
  gl_FragColor.rgb = mix(gl_FragColor.rgb, rf.rgb, clamp(rf.a * w, 0.0, 1.0));
}`);
  };
  m.customProgramCacheKey = () => key + '|ssr-' + kind;
  m.userData.ssr = kind;
  return m;
}

// ---------- Worlds ----------
// sky: zenith, horizon, ground below horizon.""")

# ---- apply: the circuit road and the Ultra water
rep("""  roadMat.userData.wetBase = ULTRA.ready ? 1.0 : 0.85;""", """  roadMat.userData.wetBase = ULTRA.ready ? 1.0 : 0.85;
  reflective(roadMat, 'road');""")
rep("""  const w = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 96, 96).rotateX(-Math.PI / 2), lit(wm));""",
    """  const w = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 96, 96).rotateX(-Math.PI / 2), reflective(lit(wm), 'water'));""")

# ---- the post pass feeds it: depth before the picture, the picture kept (half size) for the next frame
rep("""  let dRT = null, aA = null, aB = null, aoList = [], aoListT = 0, dA = null, dB = null;""",
    """  let dRT = null, aA = null, aB = null, aoList = [], aoListT = 0, dA = null, dB = null, sC = null, sFilled = false;
  const sVP = new THREE.Matrix4();""")
rep("""      if (dA) { dA.dispose(); dB.dispose(); dA = dB = null; }""",
    """      if (dA) { dA.dispose(); dB.dispose(); dA = dB = null; }
      if (sC) sC.dispose();
      sC = new THREE.WebGLRenderTarget(W >> 1, H >> 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); sFilled = false;""")
rep("""      renderer.setRenderTarget(rt); renderer.render(s, c);
      bright.uniforms.t.value = rt.texture; pass(bright, bA);""",
    """      if (AO) {
        const U = SSR_U; U.ssrD.value = dRT.texture; U.ssrC.value = sC.texture; U.ssrP.value.copy(c.projectionMatrix); U.ssrIV.value.copy(c.matrixWorld);
        U.ssrNF.value.set(c.near, c.far); U.ssrOn.value = sFilled ? 1 : 0; U.ssrTime.value = clock;
      }
      renderer.setRenderTarget(rt); renderer.render(s, c);
      if (AO) {
        // keep this picture and where it was seen from, for the next frame's reflections
        SSR_U.ssrOn.value = 0;
        copy.uniforms.t.value = rt.texture; pass(copy, sC); sFilled = true;
        SSR_U.ssrPVP.value.multiplyMatrices(c.projectionMatrix, sVP.copy(c.matrixWorldInverse));
      }
      bright.uniforms.t.value = rt.texture; pass(bright, bA);""")

# ---- the weather: the road's wetness for the shader, wet kerbs, verges and ground in the rain
rep("""      MAT.road.roughness = wet ? 0.25 : 0.82;
      org.set(0, 0, 0);""", """      MAT.road.roughness = wet ? 0.25 : 0.82;
      SSR_U.ssrWet.value = wet;
      // everything else out in the rain goes darker and glossier (kept as it was, to restore in the dry)
      const wetMat = (m, dark, rough) => {
        if (!m) return;
        if (!m.userData.dry) m.userData.dry = { c: m.color.clone(), r: m.roughness };
        m.color.copy(m.userData.dry.c); m.roughness = m.userData.dry.r;
        if (wet) { m.color.multiplyScalar(dark); m.roughness = Math.min(m.roughness, rough); }
      };
      if (mats) { wetMat(mats.kerb, 0.8, 0.3); wetMat(mats.tarmac, 0.7, 0.35); wetMat(mats.sidewalk, 0.75, 0.4); wetMat(mats.gravelroad, 0.75, 0.6); wetMat(mats.dirt, 0.7, 0.6); wetMat(mats.grass, 0.85, 0.7); wetMat(mats.sand, 0.8, 0.7); }
      wetMat(MAT.ground, 0.85, 0.75); wetMat(MAT.concrete, 0.78, 0.45); wetMat(MAT.wall, 0.8, 0.45);
      org.set(0, 0, 0);""")
rep("""    off() { kind = null; lines.visible = pts.visible = false; MAT.road.roughness = 0.82; },""",
    """    off() {
      kind = null; lines.visible = pts.visible = false; MAT.road.roughness = 0.82; SSR_U.ssrWet.value = 0;
      for (const m of [MAT.ground, MAT.concrete, MAT.wall]) if (m && m.userData.dry) { m.color.copy(m.userData.dry.c); m.roughness = m.userData.dry.r; }
    },""")
# heavier spray on Ultra: a fine mist behind every fast car in the rain, from both rear wheels
rep("""    if (on && ENV.wet && hard && speed > 12 && !wh.front && Math.random() < 0.5) emitPuff(""",
    """    if (Q.ultra && on && ENV.wet && hard && speed > 20 && !wh.front && Math.random() < 0.6) emitPuff(p.clone().addScaledVector(up, 0.5).addScaledVector(_v[8].set(0, 0, 1).applyQuaternion(c.q), 0.8), _v[8].copy(c.v).multiplyScalar(0.55).addScaledVector(up, 1.4), 1.3, 2.2, SPRAY_COL, 0.16, 5);
    if (on && ENV.wet && hard && speed > 12 && !wh.front && Math.random() < 0.5) emitPuff(""")
open(p, 'w').write(s); print('ultra ssr patch applied')
# the wet road on Ultra: less of the env sky (the reflections add the real one), and back to its own roughness when dry
s = open(p).read()
rep("""      if (mats && mats.road) { mats.road.roughness = wet ? 0.22 : 0.85; mats.road.color.setScalar(wet ? 0.62 : 1); mats.road.normalScale.set(wet ? 0.15 : 0.5, wet ? 0.15 : 0.5); mats.road.envMapIntensity = wet ? 1.6 : 1; }""",
    """      if (mats && mats.road) {
        const u = !!mats.road.userData.ssr, dry = mats.road.userData.wetBase || 0.85, ns = u ? 0.9 : 0.5;
        mats.road.roughness = wet ? (u ? 0.4 : 0.22) : dry; mats.road.color.setScalar(wet ? (u ? 0.55 : 0.62) : 1);
        mats.road.normalScale.set(wet ? 0.15 : ns, wet ? 0.15 : ns); mats.road.envMapIntensity = wet ? (u ? 0.65 : 1.6) : 1;
      }""")
open(p, 'w').write(s); print('wet road tuned')
