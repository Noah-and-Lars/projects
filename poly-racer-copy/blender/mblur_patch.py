# Motion blur on Ultra: each pixel is smeared along the way it moved on screen since the last frame (worked out from
# the depth and the camera's last view), so the scenery streaks past at speed while your own car, a few metres from
# the camera, stays sharp. A setting turns it off.
#   python3 -I mblur_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

rep("""  speedo: 'analog', fps: false, line: 'brake', damage: true,""", """  speedo: 'analog', fps: false, line: 'brake', damage: true, mblur: true,""")
rep("""    <div class="opt"><div><label>Damage</label>""", """    <div class="opt"><div><label>Motion blur</label><small>Ultra only: the scenery streaks past at speed</small></div><div class="seg" data-set="mblur"><button data-v="1">On</button><button data-v="0">Off</button></div></div>
    <div class="opt"><div><label>Damage</label>""")
rep("""k === 'damage' || k === 'menuMusic') settings[k] = v === '1';""", """k === 'damage' || k === 'menuMusic' || k === 'mblur') settings[k] = v === '1';""")

# the composite shader: blurred fetch of the picture along each pixel's motion
rep("""uniform float lens; uniform vec2 sunUV; uniform vec3 sunCol; uniform float time; uniform vec2 res;""",
    """uniform float lens; uniform vec2 sunUV; uniform vec3 sunCol; uniform float time; uniform vec2 res;
uniform float mb; uniform mat4 mbIP; uniform mat4 mbIV; uniform mat4 mbPrev;""")
rep("""  } else c = texture2D(t, vUv).rgb;
  c *= mix(1.0, texture2D(ao, vUv).r, aoK);""", """  } else c = texture2D(t, vUv).rgb;
  if (mb > 0.0) {
    // where this pixel was last frame: its depth back to a world point, then through the last frame's camera
    float dd = unpackRGBAToDepth(texture2D(tD, vUv));
    vec4 vp = mbIP * vec4(vUv * 2.0 - 1.0, dd * 2.0 - 1.0, 1.0); vp /= vp.w;
    vec4 pc = mbPrev * (mbIV * vp);
    vec2 vel = (vUv - (pc.xy / pc.w * 0.5 + 0.5)) * mb * smoothstep(7.0, 16.0, -vp.z);
    float vl = length(vel); if (vl > 0.035) vel *= 0.035 / vl;
    if (vl > 0.0015 && pc.w > 0.0) {
      vec3 acc = c;
      for (int i = 1; i < 8; i++) acc += texture2D(t, vUv - vel * (float(i) / 7.0 - 0.5)).rgb;
      c = acc / 8.0;
    }
  }
  c *= mix(1.0, texture2D(ao, vUv).r, aoK);""")
# uniforms on the composite material
rep("""lens: { value: 0 }, sunUV""", """lens: { value: 0 }, mb: { value: 0 }, mbIP: { value: new THREE.Matrix4() }, mbIV: { value: new THREE.Matrix4() }, mbPrev: { value: new THREE.Matrix4() }, sunUV""")
# feed it: the last frame's view (kept for the reflections) before it is replaced by this one
rep("""        SSR_U.ssrPVP.value.multiplyMatrices(c.projectionMatrix, sVP.copy(c.matrixWorldInverse));""",
    """        const mbU = comp.uniforms, moving = settings.mblur && race.state === 'racing' && !photo.on && !cine.on;
        mbU.mb.value = moving && sFilled ? 0.55 : 0;
        if (mbU.mb.value) { mbU.mbPrev.value.copy(SSR_U.ssrPVP.value); mbU.mbIP.value.copy(c.projectionMatrixInverse); mbU.mbIV.value.copy(c.matrixWorld); }
        SSR_U.ssrPVP.value.multiplyMatrices(c.projectionMatrix, sVP.copy(c.matrixWorldInverse));""")
open(p, 'w').write(s); print('motion blur patch applied')
