# Polish batch 5: the photo mode becomes a spectator camera. F switches orbit and free flight (WASD, Q/E, drag to
# look, Shift fast), Space pauses or runs the world, [ and ] set the depth of field (Ultra), Enter saves.
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# ---- the composite pass: depth of field from the occlusion pass's depth, Ultra only
rep("""  const comp = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, b: { value: null }, k: { value: 0.55 }, ao: { value: null }, aoK: { value: 0 } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D t; uniform sampler2D b; uniform float k; uniform sampler2D ao; uniform float aoK; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb * mix(1.0, texture2D(ao, vUv).r, aoK) + texture2D(b, vUv).rgb * k; vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.55; c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.06); gl_FragColor = vec4(c, 1.0); }' });""",
    """  const comp = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, b: { value: null }, k: { value: 0.55 }, ao: { value: null }, aoK: { value: 0 }, dof: { value: null }, tD: { value: null }, dofOn: { value: 0 }, focus: { value: 10 }, range: { value: 6 }, near: { value: 0.3 }, far: { value: 1000 } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: `#include <packing>
uniform sampler2D t; uniform sampler2D b; uniform float k; uniform sampler2D ao; uniform float aoK; uniform sampler2D dof; uniform sampler2D tD; uniform float dofOn; uniform float focus; uniform float range; uniform float near; uniform float far; varying vec2 vUv;
void main(){
  vec3 c = texture2D(t, vUv).rgb * mix(1.0, texture2D(ao, vUv).r, aoK);
  if (dofOn > 0.5) {
    // depth of field: the picture goes soft away from the focus distance, like a camera with a wide aperture
    float z = -perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(tD, vUv)), near, far);
    float coc = smoothstep(range * 0.35, range * 1.6, abs(z - focus));
    c = mix(c, texture2D(dof, vUv).rgb, coc);
  }
  c += texture2D(b, vUv).rgb * k;
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.55; c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.06); gl_FragColor = vec4(c, 1.0); }` });""")
rep("""      comp.uniforms.t.value = rt.texture; comp.uniforms.b.value = bA.texture; comp.uniforms.k.value = ENV.night ? 0.85 : 0.5;
      pass(comp, null);""",
    """      comp.uniforms.t.value = rt.texture; comp.uniforms.b.value = bA.texture; comp.uniforms.k.value = ENV.night ? 0.85 : 0.5;
      // photo mode on Ultra: a soft copy of the picture for the depth of field, and the depth to judge it by
      const dofNow = AO && photo.on && photo.dof > 0;
      comp.uniforms.dofOn.value = dofNow ? 1 : 0;
      if (dofNow) {
        blur.uniforms.t.value = rt.texture; blur.uniforms.d.value.set(1.4 / bB.width, 0); pass(blur, bB);
        blur.uniforms.t.value = bB.texture; blur.uniforms.d.value.set(0, 1.4 / bB.height); pass(blur, dB || (dB = new THREE.WebGLRenderTarget(bB.width, bB.height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })));
        blur.uniforms.t.value = dB.texture; blur.uniforms.d.value.set(1.4 / bB.width, 0); pass(blur, bB);
        blur.uniforms.t.value = bB.texture; blur.uniforms.d.value.set(0, 1.4 / bB.height); pass(blur, dB);
        comp.uniforms.dof.value = dB.texture; comp.uniforms.tD.value = dRT.texture; comp.uniforms.near.value = c.near; comp.uniforms.far.value = c.far;
        comp.uniforms.focus.value = photo.focusDist(); comp.uniforms.range.value = photo.dof;
      }
      pass(comp, null);""")
rep("""  let dRT = null, aA = null, aB = null, aoList = [], aoListT = 0;""", """  let dRT = null, aA = null, aB = null, aoList = [], aoListT = 0, dB = null;""")

# ---- the camera: orbit or free flight, the world paused or running
rep("""function step(dt) {
  if (photo.on) dt = 0;""", """function step(dt) {
  if (photo.on) { photo.tick(dt); if (!photo.run) dt = 0; }""")
rep("""const photo = { on: false, a: 2.3, h: 0.9, d: 8, fov: 34, drag: null, save: false,
  toggle() {
    this.on = !this.on; document.body.classList.toggle('photo', this.on);""",
    """const photo = { on: false, a: 2.3, h: 0.9, d: 8, fov: 34, drag: null, save: false, free: false, run: false, dof: 0, keys: {}, pos: new V3(), yaw: 0, pitch: 0,
  toggle() {
    this.on = !this.on; document.body.classList.toggle('photo', this.on);
    if (!this.on) { this.run = false; this.free = false; this.keys = {}; }""")
rep("""  apply() {
    const p = car.p;
    camera.position.set(p.x + Math.cos(this.a) * this.d, p.y + this.h, p.z + Math.sin(this.a) * this.d);""",
    """  // free flight: the camera goes where the keys take it
  setFree(on) {
    this.free = on;
    if (on) { this.pos.copy(camera.position); const d = camera.getWorldDirection(_v[9]); this.yaw = Math.atan2(d.x, d.z); this.pitch = Math.asin(Math.max(-1, Math.min(1, d.y))); }
    this.hint();
  },
  hint() {
    $('photoHint').textContent = (this.free ? 'Free camera · W A S D move, Q E up and down, Shift fast, drag to look' : 'Orbit · drag to orbit the car, wheel to zoom') +
      ' · F ' + (this.free ? 'orbit' : 'free camera') + ' · Space ' + (this.run ? 'pause' : 'run') + ' the world' + (Q.ultra ? ' · [ ] depth of field' + (this.dof ? ' ' + this.dof.toFixed(0) + ' m' : ' off') : '') + ' · Shift + wheel lens · Enter saves · F9 leaves';
  },
  tick(dt) {
    if (!this.free) return;
    const k = this.keys, sp = (k.ShiftLeft || k.ShiftRight ? 32 : 9) * dt;
    const f = _v[9].set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)), r = _v[8].set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (k.KeyW || k.ArrowUp) this.pos.addScaledVector(f, sp); if (k.KeyS || k.ArrowDown) this.pos.addScaledVector(f, -sp);
    if (k.KeyD || k.ArrowRight) this.pos.addScaledVector(r, sp); if (k.KeyA || k.ArrowLeft) this.pos.addScaledVector(r, -sp);
    if (k.KeyE) this.pos.y += sp; if (k.KeyQ) this.pos.y -= sp;
    if (terrain) this.pos.y = Math.max(this.pos.y, terrain.h(this.pos.x, this.pos.z) + 0.25);
  },
  focusDist() { return Math.max(1, camera.position.distanceTo(car.p)); },
  apply() {
    const p = car.p;
    if (this.free) {
      camera.position.copy(this.pos); camera.up.set(0, 1, 0);
      camera.lookAt(this.pos.x + Math.sin(this.yaw) * Math.cos(this.pitch), this.pos.y + Math.sin(this.pitch), this.pos.z + Math.cos(this.yaw) * Math.cos(this.pitch));
      if (Math.abs(camera.fov - this.fov) > 0.01) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
      return;
    }
    camera.position.set(p.x + Math.cos(this.a) * this.d, p.y + this.h, p.z + Math.sin(this.a) * this.d);""")
rep("""  el.addEventListener('pointerdown', e => { if (photo.on) { photo.drag = { x: e.clientX, y: e.clientY, a: photo.a, h: photo.h }; try { el.setPointerCapture(e.pointerId); } catch (err) {} } });
  el.addEventListener('pointermove', e => { if (photo.on && photo.drag) { photo.a = photo.drag.a - (e.clientX - photo.drag.x) * 0.006; photo.h = Math.max(-0.5, Math.min(14, photo.drag.h + (e.clientY - photo.drag.y) * 0.02)); } });""",
    """  el.addEventListener('pointerdown', e => { if (photo.on) { photo.drag = { x: e.clientX, y: e.clientY, a: photo.a, h: photo.h, yaw: photo.yaw, pitch: photo.pitch }; try { el.setPointerCapture(e.pointerId); } catch (err) {} } });
  el.addEventListener('pointermove', e => {
    if (!photo.on || !photo.drag) return;
    if (photo.free) { photo.yaw = photo.drag.yaw - (e.clientX - photo.drag.x) * 0.004; photo.pitch = Math.max(-1.5, Math.min(1.5, photo.drag.pitch - (e.clientY - photo.drag.y) * 0.004)); }
    else { photo.a = photo.drag.a - (e.clientX - photo.drag.x) * 0.006; photo.h = Math.max(-0.5, Math.min(14, photo.drag.h + (e.clientY - photo.drag.y) * 0.02)); }
  });""")
rep("""  if (photo.on) { if (e.code === 'Enter') { e.preventDefault(); photo.save = true; } else if (e.code === 'Escape') photo.toggle(); return; }""",
    """  if (photo.on) {
    e.preventDefault();
    if (e.code === 'Enter') photo.save = true;
    else if (e.code === 'Escape') photo.toggle();
    else if (e.code === 'KeyF') photo.setFree(!photo.free);
    else if (e.code === 'Space') { photo.run = !photo.run; photo.hint(); }
    else if (e.code === 'BracketLeft' || e.code === 'BracketRight') { const steps = [0, 2, 4, 8, 16, 32]; let i = steps.indexOf(photo.dof); i = Math.max(0, Math.min(steps.length - 1, i + (e.code === 'BracketRight' ? 1 : -1))); photo.dof = steps[i]; photo.hint(); }
    else photo.keys[e.code] = true;
    return;
  }""")
rep("""document.addEventListener('keyup', e => { if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = false; e.preventDefault(); } });""",
    """document.addEventListener('keyup', e => { photo.keys[e.code] = false; if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = false; e.preventDefault(); } });""")
rep("""    hint.hidden = !this.on;""", """    hint.hidden = !this.on; if (this.on) this.hint();""")
rep("""        <li>Photo mode: press F9 anywhere, orbit the car with the mouse, Enter saves a picture</li>""",
    """        <li>Photo mode: press F9 anywhere. Orbit the car or fly a free camera (F), pause or run the world (Space), depth of field on Ultra ([ and ]), Enter saves a picture</li>""")
open(p, 'w').write(s); print('polish batch 5 applied')
