# Photo mode for everyone: a Photo mode button in the pause menu, and an on-screen bar while it's open (close, free
# camera, run or pause the world, depth of field, save) with hold-to-move arrows for the free camera and pinch to
# zoom, so it works on a phone or tablet as well as with the keyboard.
#   python3 -I photo_touch_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

rep("""  #photoHint { position:fixed; left:50%; bottom:12px;""", """  #photoBar { position:fixed; left:50%; bottom:40px; transform:translateX(-50%); display:flex; gap:6px; flex-wrap:wrap; justify-content:center; z-index:31; max-width:calc(100vw - 32px); }
  #photoBar button, #photoPad button { font:600 13px/1 system-ui, sans-serif; color:#fff; background:#0c111dcc; border:1px solid #ffffff33; padding:10px 12px; min-height:40px; touch-action:none; }
  #photoBar button.on { background:#2a5bd7; }
  #photoPad { position:fixed; right:16px; bottom:96px; display:grid; grid-template-columns:repeat(3, 48px); gap:6px; z-index:31; }
  #photoPad button { width:48px; height:48px; padding:0; font-size:16px; }
  #photoHint { position:fixed; left:50%; bottom:12px;""")
rep("""<div id="photoHint" hidden>""", """<div id="photoBar" hidden>
  <button data-ph="close">Close</button><button data-ph="free">Free camera</button><button data-ph="run">Run the world</button>
  <button data-ph="dof-" class="ultraOnly">Focus blur &minus;</button><button data-ph="dof+" class="ultraOnly">Focus blur +</button><button data-ph="save">Save picture</button>
</div>
<div id="photoPad" hidden>
  <button data-hold="KeyQ" title="Down">&#8595;</button><button data-hold="KeyW" title="Forward">&#9650;</button><button data-hold="KeyE" title="Up">&#8593;</button>
  <button data-hold="KeyA" title="Left">&#9664;</button><button data-hold="KeyS" title="Back">&#9660;</button><button data-hold="KeyD" title="Right">&#9654;</button>
</div>
<div id="photoHint" hidden>""")
rep("""      <button class="btn ghost" data-act="cam">Camera</button>
      <button class="btn ghost" data-act="settings" id="pauseSettings">Settings</button>""",
    """      <button class="btn ghost" data-act="cam">Camera</button>
      <button class="btn ghost" data-act="photo">Photo mode</button>
      <button class="btn ghost" data-act="settings" id="pauseSettings">Settings</button>""")
rep("""      case 'resume': resume(); break;""", """      case 'resume': resume(); break;
      case 'photo': if (race.track) photo.toggle(); break;""")
# the bar follows photo mode
rep("""    hint.hidden = !this.on; if (this.on) this.hint();""", """    hint.hidden = !this.on; if (this.on) this.hint();
    for (const id of ['photoBar', 'photoPad']) { const el = $(id); if (el.parentNode !== document.body) document.body.appendChild(el); }
    $('photoBar').hidden = !this.on; $('photoPad').hidden = !this.on || !this.free;
    for (const b of document.querySelectorAll('#photoBar .ultraOnly')) b.hidden = !Q.ultra;""")
rep("""    this.free = on;
    if (on) {""", """    this.free = on;
    $('photoPad').hidden = !this.on || !on;
    if (on) {""")
rep("""  hint() {
    $('photoHint').textContent = (this.free ? 'Free camera · W A S D move, Q E up and down, Shift fast, drag to look' : 'Orbit · drag to orbit the car, wheel to zoom') +""",
    """  dofStep(d) { const steps = [0, 2, 4, 8, 16, 32]; let i = steps.indexOf(this.dof); i = Math.max(0, Math.min(steps.length - 1, i + d)); this.dof = steps[i]; this.hint(); },
  hint() {
    const fb = document.querySelector('#photoBar [data-ph=free]'), rb = document.querySelector('#photoBar [data-ph=run]');
    if (fb) { fb.textContent = this.free ? 'Orbit camera' : 'Free camera'; rb.textContent = this.run ? 'Pause the world' : 'Run the world'; rb.classList.toggle('on', this.run); }
    if (COARSE) { $('photoHint').textContent = (this.free ? 'Drag to look · arrows to move · pinch to fly' : 'Drag to orbit · pinch to zoom') + (Q.ultra && this.dof ? ' · focus blur ' + this.dof + ' m' : ''); return; }
    $('photoHint').textContent = (this.free ? 'Free camera · W A S D move, Q E up and down, Shift fast, drag to look' : 'Orbit · drag to orbit the car, wheel to zoom') +""")
rep("""    else if (e.code === 'BracketLeft' || e.code === 'BracketRight') { const steps = [0, 2, 4, 8, 16, 32]; let i = steps.indexOf(photo.dof); i = Math.max(0, Math.min(steps.length - 1, i + (e.code === 'BracketRight' ? 1 : -1))); photo.dof = steps[i]; photo.hint(); }""",
    """    else if (e.code === 'BracketLeft' || e.code === 'BracketRight') photo.dofStep(e.code === 'BracketRight' ? 1 : -1);""")
# pinch: two fingers zoom the orbit, or fly the free camera forward and back
rep("""  el.addEventListener('pointerup', () => { photo.drag = null; });""", """  el.addEventListener('pointerup', () => { photo.drag = null; });
  const pts = new Map(); let pinch = 0;
  el.addEventListener('pointerdown', e => { if (photo.on) pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  el.addEventListener('pointermove', e => {
    if (!photo.on || !pts.has(e.pointerId)) return;
    pts.get(e.pointerId).x = e.clientX; pts.get(e.pointerId).y = e.clientY;
    if (pts.size !== 2) { pinch = 0; return; }
    photo.drag = null;
    const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) {
      if (photo.free) photo.pos.addScaledVector(_v[9].set(Math.sin(photo.yaw) * Math.cos(photo.pitch), Math.sin(photo.pitch), Math.cos(photo.yaw) * Math.cos(photo.pitch)), (d - pinch) * 0.03);
      else photo.d = Math.max(2.5, Math.min(40, photo.d * pinch / d));
    }
    pinch = d;
  });
  for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, e => { pts.delete(e.pointerId); pinch = 0; });
  // the bar and the arrows
  $('photoBar').addEventListener('click', e => {
    const b = e.target.closest('[data-ph]'); if (!b) return;
    const k = b.dataset.ph;
    if (k === 'close') photo.toggle();
    else if (k === 'free') photo.setFree(!photo.free);
    else if (k === 'run') { photo.run = !photo.run; photo.hint(); }
    else if (k === 'dof-' || k === 'dof+') photo.dofStep(k === 'dof+' ? 1 : -1);
    else if (k === 'save') photo.save = true;
  });
  for (const b of document.querySelectorAll('#photoPad [data-hold]')) {
    const on = e => { e.preventDefault(); photo.keys[b.dataset.hold] = true; }, off = () => { photo.keys[b.dataset.hold] = false; };
    b.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  }""")
open(p, 'w').write(s); print('photo touch patch applied')
