# Realistic driver's gear: photographed materials (Poly Haven, CC0) on the gloves and sleeves. The glove is leather on
# the back and dark suede where it grips (the palm and the insides of the fingers, marked in the model), with a
# stitched seam between them; the grain of both is projected onto the glove in its own space (no uv seams). The suit's
# sleeves get a woven polyester's weave and grain, following the sleeve round and along the arm.
#   python3 -I gear_patch.py <index.html>   (after arms_patch.py)
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# ---- the glove's grip mask and occlusion from its colours
rep("""      const c4 = g.attributes.color, c3 = new Float32Array(c4.count * 3);
      for (let i = 0; i < c4.count; i++) { const a = 0.3 + 0.7 * c4.getW(i); c3[i * 3] = c3[i * 3 + 1] = c3[i * 3 + 2] = a; }
      g.setAttribute('color', new THREE.BufferAttribute(c3, 3));""",
    """      const c4 = g.attributes.color, c3 = new Float32Array(c4.count * 3), gm = new Float32Array(c4.count);
      for (let i = 0; i < c4.count; i++) { const a = 0.3 + 0.7 * c4.getW(i); c3[i * 3] = c3[i * 3 + 1] = c3[i * 3 + 2] = a; gm[i] = Math.pow(c4.getX(i), 1 / 2.2); }
      g.setAttribute('color', new THREE.BufferAttribute(c3, 3)); g.setAttribute('gmask', new THREE.BufferAttribute(gm, 1));""")

# ---- the shader
rep("""let CLOTH_N = null;""", """// the gear's photographed materials: leather and suede for the gloves, a woven polyester for the suit
let GEAR_U = null;
function gearU() {
  if (GEAR_U) return GEAR_U;
  const t = n => { const x = modelTex('gear-' + n + '.jpg', true); x.wrapS = x.wrapT = THREE.RepeatWrapping; return { value: x }; };
  return (GEAR_U = { gLD: t('leather-diff'), gLN: t('leather-nor'), gSD: t('suede-diff'), gSN: t('suede-nor'), gFD: t('fabric-diff'), gFN: t('fabric-nor') });
}
const GEAR_GLSL = `
uniform sampler2D gLD; uniform sampler2D gLN; uniform sampler2D gSD; uniform sampler2D gSN; uniform sampler2D gFD; uniform sampler2D gFN;
varying vec3 vGP; varying vec3 vGN; varying float vGM;
// a tangent-space normal applied with any uv (the frame from screen derivatives)
vec3 gPerturb(vec3 eye, vec3 n, vec3 mapN, vec2 uv) {
  vec3 q0 = dFdx(eye), q1 = dFdy(eye); vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1p = cross(q1, n), q0p = cross(n, q0);
  vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
  float det = max(dot(T, T), dot(B, B)), sc = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(T * (mapN.x * sc) + B * (mapN.y * sc) + n * mapN.z);
}`;
function gearMat(m, glove) {
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.extensions = Object.assign({}, m.extensions, { derivatives: true });
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    Object.assign(sh.uniforms, gearU());
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\\nvarying vec3 vGP; varying vec3 vGN; varying float vGM;' + (glove ? '\\nattribute float gmask;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\\nvGP = position; vGN = normal; vGM = ' + (glove ? 'gmask' : '0.0') + ';');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + GEAR_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
${glove ? `
  // leather on the back, suede where it grips; the grain of each projected onto the glove from three sides (11 cm a tile)
  vec3 gW = pow(abs(normalize(vGN)), vec3(4.0)); gW /= dot(gW, vec3(1.0));
  vec2 gX = vGP.yz * 9.0, gY = vGP.zx * 9.0, gZ = vGP.xy * 9.0;
  float gS = smoothstep(0.3, 0.7, vGM);
  float gDl = texture2D(gLD, gX).r * gW.x + texture2D(gLD, gY).r * gW.y + texture2D(gLD, gZ).r * gW.z;
  float gDs = texture2D(gSD, gX * 1.6).r * gW.x + texture2D(gSD, gY * 1.6).r * gW.y + texture2D(gSD, gZ * 1.6).r * gW.z;
  vec3 gLeather = diffuseColor.rgb * (0.5 + 0.45 * gDl), gSuede = vec3(0.05) * (0.55 + 0.9 * gDs);
  diffuseColor.rgb = mix(gLeather, gSuede, gS);
  // the stitched seam where they meet: a fine dark line, a few pixels wide whatever the distance
  float gSeam = 1.0 - smoothstep(0.0, max(fwidth(vGM) * 1.4, 0.012), abs(vGM - 0.5));
  diffuseColor.rgb *= 1.0 - 0.5 * gSeam;` : `
  // the suit's weave: three tiles round the arm, one every 7 cm along it
  vec2 gF = vec2(vUv.x * 4.0, vGP.z / 0.055);
  float gDf = texture2D(gFD, gF).r;
  diffuseColor.rgb *= 0.6 + 0.55 * gDf;`}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
${glove ? 'roughnessFactor = mix(0.36 + 0.22 * gDl, 0.93, gS);' : 'roughnessFactor = 0.74 + 0.2 * gDf;'}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${glove ? `{
  vec3 nX = mix(texture2D(gLN, gX).xyz, texture2D(gSN, gX * 1.6).xyz, gS) * 2.0 - 1.0;
  vec3 nY = mix(texture2D(gLN, gY).xyz, texture2D(gSN, gY * 1.6).xyz, gS) * 2.0 - 1.0;
  vec3 nZ = mix(texture2D(gLN, gZ).xyz, texture2D(gSN, gZ * 1.6).xyz, gS) * 2.0 - 1.0;
  nX.xy *= 1.8; nY.xy *= 1.8; nZ.xy *= 1.8;
  normal = normalize(gW.x * gPerturb(-vViewPosition, normal, nX, gX) + gW.y * gPerturb(-vViewPosition, normal, nY, gY) + gW.z * gPerturb(-vViewPosition, normal, nZ, gZ));
}` : `{ vec3 nF = texture2D(gFN, gF).xyz * 2.0 - 1.0; nF.xy *= 2.4; normal = gPerturb(-vViewPosition, normal, nF, gF); }`}`);
  };
  m.customProgramCacheKey = () => key + (glove ? '|gear-glove' : '|gear-sleeve');
  return m;
}
let CLOTH_N = null;""")
# ---- the materials
rep("""    gloveM: lit(new THREE.MeshPhysicalMaterial({""", """    gloveM: gearMat(lit(new THREE.MeshPhysicalMaterial({""")
rep("""roughness: 0.62, metalness: 0, sheen: new THREE.Color(0.22, 0.22, 0.22), side: THREE.DoubleSide })),""",
    """roughness: 0.62, metalness: 0, sheen: new THREE.Color(0.15, 0.15, 0.15), side: THREE.DoubleSide })), true),""")
rep("""    sleeve: lit(new THREE.MeshStandardMaterial({ map: suitTex(av.suit), normalMap: clothNormal(), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.88, metalness: 0, skinning: true })),""",
    """    sleeve: gearMat(lit(new THREE.MeshStandardMaterial({ map: suitTex(av.suit), roughness: 0.82, metalness: 0, skinning: true })), false),""")
# credits: the gear's textures
rep("""Driver gloves: "Glove Rigged" by Masterbauer (Sketchfab, CC Attribution), posed for the game.""",
    """Driver gloves: "Glove Rigged" by Masterbauer (Sketchfab, CC Attribution), posed for the game, in leather, suede and suit fabric from Poly Haven (CC0).""")
open(p, 'w').write(s); print('gear patch applied')
