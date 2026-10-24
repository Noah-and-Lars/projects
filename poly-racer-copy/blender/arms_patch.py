# Realistic hands and arms in the cockpit: a real glove model (posed gripping a rim in Blender, with its creases and
# baked shading) on each side of the wheel, and the sleeves one continuous skinned tube from the shoulder to over the
# glove's cuff, bending at a real elbow, with fabric folds. The old built-up hands stay as the fallback.
#   python3 -I arms_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# ---- load the glove with the cars
rep("""  await Promise.all(TEX_WAIT);
  // the police cruiser""", """  // the driver's glove: a right hand gripping a rim (blender/glove_grip.py); the left hand is its mirror image
  try {
    const r = await fetch('models/glove.fcm?v=' + VERSION);
    if (r.ok) {
      const G = parseFCM(await r.arrayBuffer()), g = G.glove;
      // the baked occlusion (the colour's fourth channel) as plain colour: creases and the gaps between the fingers
      const c4 = g.attributes.color, c3 = new Float32Array(c4.count * 3);
      for (let i = 0; i < c4.count; i++) { const a = 0.3 + 0.7 * c4.getW(i); c3[i * 3] = c3[i * 3 + 1] = c3[i * 3 + 2] = a; }
      g.setAttribute('color', new THREE.BufferAttribute(c3, 3));
      const L = g.clone(); L.scale(1, -1, 1);
      const ix = L.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      g.userData.shared = L.userData.shared = true;
      MODELS.glove = { R: g, L, wrist: (G.meta && G.meta.wrist) || [0.017, 0, 0.076] };
    }
  } catch (e) { console.warn('glove', e); }
  await Promise.all(TEX_WAIT);
  // the police cruiser""")

# ---- materials: the glove (the suit's glove colour, a little sheen like leather) and the skinned sleeve
rep("""    dark: lit(new THREE.MeshStandardMaterial({ color: C('#151618'), roughness: 0.7 })),""",
    """    dark: lit(new THREE.MeshStandardMaterial({ color: C('#151618'), roughness: 0.7 })),
    gloveM: lit(new THREE.MeshPhysicalMaterial({ color: C(SUITS[av.suit] ? (SUITS[av.suit].pal[1] === '#151515' ? SUITS[av.suit].pal[0] : SUITS[av.suit].pal[1]) : '#e8e8e8'), vertexColors: true, roughness: 0.62, metalness: 0, sheen: new THREE.Color(0.22, 0.22, 0.22), side: THREE.DoubleSide })),
    sleeve: lit(new THREE.MeshStandardMaterial({ map: suitTex(av.suit), roughness: 0.86, metalness: 0, skinning: true })),""")

# ---- the sleeve: a tube along +z (shoulder at 0, elbow at L1, the end at L1 + L2), skinned to two bones
rep("""// hands: gloves gripping the rim at quarter to three""", """// a racing-suit sleeve: shoulder at z = 0, elbow at z = L1, the cuff end at L1 + L2. Skinned to two bones (upper
// arm, forearm) that blend over the elbow, so it bends like an arm; the cloth gathers in folds at the elbow and
// bunches at the cuff.
function makeSleeve(mat, L1, L2) {
  const NZ = 70, NT = 30, len = L1 + L2, pos = [], uv = [], si = [], sw = [], idx = [];
  const fold = (t, z) => Math.sin(t * 3 + z * 41) * 0.45 + Math.sin(t * 5 - z * 23 + 1.7) * 0.3 + Math.sin(t * 2 + z * 67 + 0.4) * 0.25 + Math.sin(t * 7 + z * 97) * 0.12;
  for (let j = 0; j <= NZ; j++) {
    const z = len * j / NZ, u = z / len;
    let r = z < L1 ? 0.056 - 0.01 * (z / L1) : 0.046 - 0.014 * ((z - L1) / L2);
    if (z > len - 0.05) r += 0.004 * (1 - (len - z) / 0.05);          // a looser cuff over the glove
    const near = Math.exp(-(((z - L1) / 0.07) ** 2)), cuff = Math.exp(-(((len - z) / 0.06) ** 2));
    const w1 = Math.max(0, Math.min(1, (z - (L1 - 0.06)) / 0.12)), wE = w1 * w1 * (3 - 2 * w1);
    for (let i = 0; i <= NT; i++) {
      const t = i / NT * Math.PI * 2;
      const rr = r * (1 + (0.05 + 0.14 * near + 0.09 * cuff) * fold(t, z));
      pos.push(Math.cos(t) * rr, Math.sin(t) * rr, z);
      uv.push(i / NT, 0.32 + u * 0.2);
      si.push(0, 1, 0, 0); sw.push(1 - wE, wE, 0, 0);
    }
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NT; i++) {
    const a = j * (NT + 1) + i, b = a + NT + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(g, mat), b0 = new THREE.Bone(), b1 = new THREE.Bone();
  b1.position.set(0, 0, L1); b0.add(b1); mesh.add(b0);
  mesh.updateMatrixWorld(true);   // the bones' rest pose, for their inverses
  mesh.bind(new THREE.Skeleton([b0, b1]));
  mesh.frustumCulled = false;
  return { mesh, b0, b1, L1, L2 };
}
// hands: gloves gripping the rim at quarter to three""")
# the real glove when there is one
rep("""    const hand = new THREE.Group();
    const ang = s < 0 ? Math.PI * 0.94 : Math.PI * 0.06;  // left hand at about 9, right at about 3
    hand.position.set(Math.cos(ang) * wr, Math.sin(ang) * wr, 0);
    hand.rotation.z = ang;
""", """    const hand = new THREE.Group();
    const ang = s < 0 ? Math.PI * 0.94 : Math.PI * 0.06;  // left hand at about 9, right at about 3
    hand.position.set(Math.cos(ang) * wr, Math.sin(ang) * wr, 0);
    hand.rotation.z = ang;
    const GL = MODELS.glove;
    if (GL) {
      // the modelled glove: its frame has the rim's tube along y, the palm towards the wheel's centre (-x), the wrist
      // towards the driver (+z). The left hand is the mirror image (thumb up is -y once it's turned round to 9 o'clock).
      hand.add(new THREE.Mesh(s > 0 ? GL.R : GL.L, AM.gloveM));
      wheel.add(hand);
      const L1 = 0.3, L2 = 0.29, sl = makeSleeve(AM.sleeve, L1, L2);
      grp.add(sl.mesh);
      hands.push({ s, hand, ang, wr, sleeve: sl, wristL: new V3(GL.wrist[0], s * GL.wrist[1], GL.wrist[2]), sh: new V3(dx + s * 0.2, eyeY - 0.42, eyeZ + 0.26) });
      continue;
    }
""")
# posing: the sleeve's bones follow the two-bone arm, and its end goes over the glove's cuff
rep("""    // wrist (world) at the cuff
    const wrist = _ckE.set(0, -0.01, 0.12); H.hand.localToWorld(wrist);""", """    // wrist (world) at the cuff
    const wrist = H.wristL ? _ckE.copy(H.wristL) : _ckE.set(0, -0.01, 0.12); H.hand.localToWorld(wrist);""")
rep("""    const elbow = mid.addScaledVector(down, h);
    H.elbowB.position.copy(elbow.clone().applyMatrix4(gInv));""", """    const elbow = mid.addScaledVector(down, h);
    if (H.sleeve) {
      // the sleeve ends over the glove's cuff, a few centimetres towards the hand from the cuff's edge
      const SL = H.sleeve, handW = H.hand.getWorldPosition(_ck3), end = wrist.clone().addScaledVector(_ck2.subVectors(handW, wrist).normalize(), 0.035);
      const s0 = sh.clone().applyMatrix4(gInv), e0 = elbow.clone().applyMatrix4(gInv), w0 = end.applyMatrix4(gInv);
      const d1 = e0.clone().sub(s0), d2 = w0.clone().sub(e0);
      SL.b0.position.copy(s0); SL.b0.quaternion.setFromUnitVectors(_ZAX, d1.clone().normalize()); SL.b0.scale.set(1, 1, d1.length() / SL.L1);
      SL.b1.position.set(0, 0, SL.L1);
      // the forearm's direction in the upper arm's frame (undoing its stretch), stretched to reach the cuff
      const q0i = SL.b0.quaternion.clone().invert();
      SL.b1.quaternion.setFromUnitVectors(_ZAX, d2.clone().applyQuaternion(q0i).normalize());
      SL.b1.scale.set(1, 1, d2.length() / SL.L2 * SL.L1 / d1.length());
      continue;
    }
    H.elbowB.position.copy(elbow.clone().applyMatrix4(gInv));""")
rep("""const _ck = new V3(), _ck2 = new V3(), _ck3 = new V3(), _ckE = new V3(), _ckM = new THREE.Matrix4();""",
    """const _ck = new V3(), _ck2 = new V3(), _ck3 = new V3(), _ckE = new V3(), _ckM = new THREE.Matrix4(), _ZAX = new V3(0, 0, 1);""")
open(p, 'w').write(s); print('arms patch applied')
# ---- the hands go on the rim itself: the rim's radius and depth measured from the model's own steering wheel
s = open(p).read()
rep("""    wheel = U.swheel.rot; wr = Math.max(0.15, Math.min(0.22, U.swheel.r - 0.015));""",
    """    wheel = U.swheel.rot; wr = Math.max(0.15, Math.min(0.22, U.swheel.r - 0.015));
    rimSW = U.swheel;""")
rep("""  // the steering wheel: the model's own, turning about its column; else the game's wheel where the model's would be
  let wheel, wr;""", """  // the steering wheel: the model's own, turning about its column; else the game's wheel where the model's would be
  let wheel, wr, rimSW = null;""")
rep("""  const hands = cockpitHands(wheel, wr, AM, grp, dx, eyeY, eyeZ);
  // the live gauges, just in front of the model's instrument cluster""", """  const hands = cockpitHands(wheel, wr, AM, grp, dx, eyeY, eyeZ, rimSW);
  // the live gauges, just in front of the model's instrument cluster""")
rep("""function cockpitHands(wheel, wr, AM, grp, dx, eyeY, eyeZ) {""", """// the rim where a hand goes: the wheel's outermost points within a few degrees of that angle are the rim's outside
// edge; its middle is a rim's thickness in from there, at the depth of those points (all in the wheel's turning frame)
function rimFit(sw, ang) {
  const P = sw.mesh.geometry.attributes.position, q = sw.mesh.quaternion, v = new V3(), pts = [];
  let maxR = 0;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).applyQuaternion(q);
    let da = Math.atan2(v.y, v.x) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 0.16) continue;
    const r = Math.hypot(v.x, v.y); pts.push([r, v.z]); if (r > maxR) maxR = r;
  }
  if (pts.length < 8 || maxR < 0.14 || maxR > 0.26) return null;
  const zs = pts.filter(t => t[0] > maxR - 0.03).map(t => t[1]).sort((a, b) => a - b);
  return { r: maxR - 0.015, z: zs[zs.length >> 1] };
}
function cockpitHands(wheel, wr, AM, grp, dx, eyeY, eyeZ, rimSW = null) {""")
rep("""    hand.position.set(Math.cos(ang) * wr, Math.sin(ang) * wr, 0);
    hand.rotation.z = ang;
    const GL = MODELS.glove;""", """    const fit = rimSW ? rimFit(rimSW, ang) : null, hr = fit ? fit.r : wr, rimZ = fit ? fit.z : 0;
    hand.position.set(Math.cos(ang) * hr, Math.sin(ang) * hr, rimZ);
    hand.rotation.z = ang;
    const GL = MODELS.glove;""")
rep("""      hands.push({ s, hand, ang, wr, sleeve: sl,""", """      hands.push({ s, hand, ang, wr: hr, rz: rimZ, sleeve: sl,""")
rep("""    H.hand.position.set(Math.cos(H.ang - extra) * hr, Math.sin(H.ang - extra) * hr, 0);""",
    """    H.hand.position.set(Math.cos(H.ang - extra) * hr, Math.sin(H.ang - extra) * hr, H.rz || 0);""")
# slimmer sleeves: a forearm in a race suit, not a pipe
rep("""    let r = z < L1 ? 0.056 - 0.01 * (z / L1) : 0.046 - 0.014 * ((z - L1) / L2);""",
    """    let r = z < L1 ? 0.047 - 0.008 * (z / L1) : 0.039 - 0.011 * ((z - L1) / L2);""")
open(p, 'w').write(s); print('rim fit applied')
s = open(p).read()
rep("""damageCar, crackGlass, get playerModel() { return playerModel; } };""", """damageCar, crackGlass, get playerModel() { return playerModel; }, photo };""")
open(p, 'w').write(s); print('photo on the debug handle')
# ---- the sleeve's cloth: a normal map of soft folds round the arm and a fine weave (in the suit texture's sleeve
# band, v 0.32..0.52, since the normal map shares the colour map's uvs)
s = open(p).read()
rep("""    sleeve: lit(new THREE.MeshStandardMaterial({ map: suitTex(av.suit), roughness: 0.86, metalness: 0, skinning: true })),""",
    """    sleeve: lit(new THREE.MeshStandardMaterial({ map: suitTex(av.suit), normalMap: clothNormal(), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.88, metalness: 0, skinning: true })),""")
rep("""function avMats(av) {""", """let CLOTH_N = null;
function clothNormal() {
  if (CLOTH_N) return CLOTH_N;
  const W = 256, Hh = 512, H = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / Hh;
    // folds: rings round the arm that wander, about every 3-4 cm along it; then the weave
    const fold = Math.sin(2 * Math.PI * (v * 70 + 0.6 * Math.sin(2 * Math.PI * (u * 2 + v * 9)) + 0.3 * Math.sin(2 * Math.PI * u * 5))) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 3 + v * 23)));
    const weave = (Math.sin(x * 2.1) * Math.sin(y * 1.05)) * 0.12 + (Math.random() - 0.5) * 0.08;
    H[y * W + x] = fold * 0.9 + weave;
  }
  CLOTH_N = canvasTex(W, Hh, (g, w, h) => pixels(g, w, h, (x, y) => {
    const xl = (x + w - 1) % w, xr = (x + 1) % w, yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    const nx = (H[y * w + xl] - H[y * w + xr]) * 1.2, ny = (H[yd * w + x] - H[yu * w + x]) * 1.2, inv = 1 / Math.hypot(nx, ny, 1);
    return [(nx * inv * 0.5 + 0.5) * 255, (ny * inv * 0.5 + 0.5) * 255, (inv * 0.5 + 0.5) * 255];
  }), { data: 1 });
  return CLOTH_N;
}
function avMats(av) {""")
open(p, 'w').write(s); print('cloth normal map')
# credit for the glove (CC Attribution)
s = open(p).read()
rep("""Trees on Ultra from Sketchfab, CC Attribution:""", """The driver's gloves: "Glove Rigged" by Masterbauer (Sketchfab, CC Attribution), posed for the game. Trees on Ultra from Sketchfab, CC Attribution:""")
open(p, 'w').write(s); print('glove credit')
