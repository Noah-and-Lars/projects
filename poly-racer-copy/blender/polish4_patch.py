# Polish batch 4: a photo mode (F9) for the player's own cinematic shots.
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)
rep("""  #keysHint { position:absolute; left:50%; bottom:12px; transform:translateX(-50%); font-size:12px; color:#dfe6f2; background:#0c111d99; padding:6px 12px; white-space:nowrap; }""",
    """  #keysHint { position:absolute; left:50%; bottom:12px; transform:translateX(-50%); font-size:12px; color:#dfe6f2; background:#0c111d99; padding:6px 12px; white-space:nowrap; }
  #photoHint { position:fixed; left:50%; bottom:12px; transform:translateX(-50%); font-size:12px; color:#dfe6f2; background:#0c111d99; padding:6px 12px; white-space:nowrap; z-index:30; }
  body.photo :is(#hud, #fps, #keysHint, #skillPop, #revHint, #ready, #goFlash, #warn, #toast, #vignette, .screen, #tLeft, #tRight, #tBrake, #tGas, #tHand, #tPause, #tCp, #tRestart, #tCam) { visibility:hidden !important; }""")
rep("""<div id="keysHint">""", """<div id="photoHint" hidden>Photo mode · drag to orbit · wheel to zoom · Shift + wheel for the lens · Enter saves a picture · F9 to leave</div>
  <div id="keysHint">""")
# the world freezes and the camera is the player's while photo mode is on
rep("""function step(dt) {
  clock += dt;""", """function step(dt) {
  if (photo.on) dt = 0;
  clock += dt;""")
rep("""  skyFollow(camera);
  post.render(scene, camera);""", """  if (photo.on) photo.apply();
  skyFollow(camera);
  post.render(scene, camera);
  if (photo.save) {
    photo.save = false;
    renderer.domElement.toBlob(b => {
      if (!b) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'poly-racer-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }, 'image/png');
  }""")
rep("""document.addEventListener('keydown', e => {
  sfx.init();""", """// ---------- Photo mode (F9): the HUD goes, the world freezes, the camera orbits the car; Enter saves a picture ----------
const photo = { on: false, a: 2.3, h: 0.9, d: 8, fov: 34, drag: null, save: false,
  toggle() {
    this.on = !this.on; document.body.classList.toggle('photo', this.on); $('photoHint').hidden = !this.on;
    if (this.on) {
      this.a = Math.atan2(camera.position.z - car.p.z, camera.position.x - car.p.x); this.d = Math.max(4, Math.min(30, Math.hypot(camera.position.x - car.p.x, camera.position.z - car.p.z)));
      this.h = camera.position.y - car.p.y; this.fov = camera.fov;
    } else { camera.clearViewOffset(); }
  },
  apply() {
    const p = car.p;
    camera.position.set(p.x + Math.cos(this.a) * this.d, p.y + this.h, p.z + Math.sin(this.a) * this.d);
    if (terrain) camera.position.y = Math.max(camera.position.y, terrain.h(camera.position.x, camera.position.z) + 0.3);
    camera.up.set(0, 1, 0); camera.lookAt(p.x, p.y + 0.5, p.z);
    if (Math.abs(camera.fov - this.fov) > 0.01) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
  },
};
{
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { if (photo.on) { photo.drag = { x: e.clientX, y: e.clientY, a: photo.a, h: photo.h }; try { el.setPointerCapture(e.pointerId); } catch (err) {} } });
  el.addEventListener('pointermove', e => { if (photo.on && photo.drag) { photo.a = photo.drag.a - (e.clientX - photo.drag.x) * 0.006; photo.h = Math.max(-0.5, Math.min(14, photo.drag.h + (e.clientY - photo.drag.y) * 0.02)); } });
  el.addEventListener('pointerup', () => { photo.drag = null; });
  el.addEventListener('wheel', e => { if (!photo.on) return; e.preventDefault(); if (e.shiftKey) photo.fov = Math.max(14, Math.min(90, photo.fov + Math.sign(e.deltaY) * 2)); else photo.d = Math.max(2.5, Math.min(40, photo.d * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
}

document.addEventListener('keydown', e => {
  sfx.init();
  if (e.code === 'F9' && race.track) { e.preventDefault(); photo.toggle(); return; }
  if (photo.on) { if (e.code === 'Enter') { e.preventDefault(); photo.save = true; } else if (e.code === 'Escape') photo.toggle(); return; }""")
rep("""<kbd>L</kbd> driving line · <kbd>Esc</kbd> or <kbd>P</kbd> pause</p>""", """<kbd>L</kbd> driving line · <kbd>Esc</kbd> or <kbd>P</kbd> pause · <kbd>F9</kbd> photo mode</p>""")
rep("""        <li>Polish: a real optimal lap from your best sectors, live cockpit gauges, bronze times on the track cards, clearer settings and a tidier profile</li>""",
    """        <li>Photo mode: press F9 anywhere, orbit the car with the mouse, Enter saves a picture</li>
        <li>Polish: a real optimal lap from your best sectors, live cockpit gauges, bronze times on the track cards, clearer settings and a tidier profile</li>""")
open(p, 'w').write(s); print('polish batch 4 applied')
