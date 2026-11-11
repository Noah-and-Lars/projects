# Headlights that light the road: on High and Ultra the player's car carries a real spotlight at night (with
# shadows on Ultra: cars and barriers in your beam throw them), and in rain, fog and snow the beam shows in the air.
#   python3 -I headlights_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# the soft-shadow filter is for the sun; the headlight's small perspective shadow map keeps a plain soft filter
rep("""  if (nb < 0.5) return 1.0;
  float r = clamp""", """  if (nb < 0.5) return 1.0;
  if (shadowMapSize.x < 2000.0) { float sh0 = 0.0; for (int i = 0; i < PCSS_N; i++) sh0 += texture2DCompare(shadowMap, sc.xy + pcssDisk(i, ang) * 1.6 / shadowMapSize.x, sc.z); return sh0 / float(PCSS_N); }
  float r = clamp""")

rep("""scene.add(sun, sun.target);
""", """scene.add(sun, sun.target);
// the player's headlights (High and Ultra): always in the scene so the shaders never change, dark by day
const HEAD = Q.shadows >= 2048 ? new THREE.SpotLight('#fff1dc', 0, 95, 0.46, 0.6, 1.3) : null;
if (HEAD) {
  HEAD.castShadow = !!Q.ultra;
  if (Q.ultra) { HEAD.shadow.mapSize.set(1024, 1024); Object.assign(HEAD.shadow.camera, { near: 0.4, far: 95 }); HEAD.shadow.bias = -0.0006; HEAD.shadow.normalBias = 0.02; HEAD.shadow.autoUpdate = false; }
  scene.add(HEAD, HEAD.target);
}
// the beam in the air, for rain, fog and snow: a cone of light that fades along its length and at its edges
const BEAM = (() => {
  if (!HEAD) return null;
  const g = new THREE.CylinderGeometry(0.15, 11, 34, 32, 8, true).translate(0, -17, 0).rotateX(Math.PI / 2);
  const m = new THREE.ShaderMaterial({ uniforms: { k: { value: 0 }, col: { value: new THREE.Color('#fff1dc') } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = -position.z / 34.0; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float k; uniform vec3 col; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = k * edge * pow(1.0 - vT, 2.2) * smoothstep(0.0, 0.06, vT); gl_FragColor = vec4(col * a, 1.0); }' });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5;
  scene.add(mesh);
  return mesh;
})();
""")
rep("""  if (night > 0.1) for (const c of cars) {
    const v = c.veh, fwd""", """  // the player's headlights also carry a real spotlight (High and Ultra): it lights what stands in the beam and,
  // on Ultra, gives it a shadow. The light system's own headlight stays for the long, soft throw down the road.
  const headOn = !!HEAD && night > 0.1 && !!car;
  if (HEAD) {
    HEAD.intensity = headOn ? 26 * Math.min(1, night * 2) : 0;
    if (HEAD.castShadow) HEAD.shadow.autoUpdate = headOn;
    if (headOn) {
      const q = car.q, fwd = _v[0].set(0, 0, -1).applyQuaternion(q), up = _v[1].set(0, 1, 0).applyQuaternion(q), L = car.type.l / 2, h = 0.62 - car.restH();
      HEAD.position.copy(car.p).addScaledVector(fwd, L + 0.25).addScaledVector(up, h);
      HEAD.target.position.copy(HEAD.position).addScaledVector(fwd, 30).addScaledVector(up, -1.9);
      HEAD.target.updateMatrixWorld();
    }
    if (BEAM) {
      const air = ENV.weather === 'rain' ? 0.06 : ENV.weather === 'fog' ? 0.09 : ENV.weather === 'snow' ? 0.07 : 0.012;
      BEAM.visible = headOn && camMode !== 2;
      if (BEAM.visible) { BEAM.position.copy(HEAD.position); BEAM.lookAt(HEAD.target.position); BEAM.material.uniforms.k.value = air * Math.min(1, night * 2); }
    }
  }
  if (night > 0.1) for (const c of cars) {
    const v = c.veh, fwd""")
open(p, 'w').write(s); print('headlights patch applied')
