# Ultra lens look: sun glare when the sun is in view, a touch of colour fringing at the edges, fine film grain.
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)
rep("""dofOn: { value: 0 }, focus: { value: 10 }, range: { value: 6 }, near: { value: 0.3 }, far: { value: 1000 } }, vertexShader: VS, depthTest: false, depthWrite: false,""",
    """dofOn: { value: 0 }, focus: { value: 10 }, range: { value: 6 }, near: { value: 0.3 }, far: { value: 1000 }, lens: { value: 0 }, sunUV: { value: new THREE.Vector2(-9, -9) }, sunCol: { value: new THREE.Color() }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } }, vertexShader: VS, depthTest: false, depthWrite: false,""")
rep("""uniform sampler2D dof; uniform sampler2D tD; uniform float dofOn; uniform float focus; uniform float range; uniform float near; uniform float far; varying vec2 vUv;
void main(){
  vec3 c = texture2D(t, vUv).rgb * mix(1.0, texture2D(ao, vUv).r, aoK);""",
    """uniform sampler2D dof; uniform sampler2D tD; uniform float dofOn; uniform float focus; uniform float range; uniform float near; uniform float far; varying vec2 vUv;
uniform float lens; uniform vec2 sunUV; uniform vec3 sunCol; uniform float time; uniform vec2 res;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 c;
  if (lens > 0.5) {
    // a little colour fringing towards the edges, like a real lens
    vec2 off = (vUv - 0.5) * 0.0022;
    c = vec3(texture2D(t, vUv + off).r, texture2D(t, vUv).g, texture2D(t, vUv - off).b);
  } else c = texture2D(t, vUv).rgb;
  c *= mix(1.0, texture2D(ao, vUv).r, aoK);""")
rep("""  c += texture2D(b, vUv).rgb * k;
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.55; c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.06); gl_FragColor = vec4(c, 1.0); }` });""",
    """  c += texture2D(b, vUv).rgb * k;
  if (lens > 0.5 && sunUV.x > -1.0) {
    // sun glare: only when the sky is open at the sun (the depth there is far), fading as it leaves the frame
    float open = step(250.0, -perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(tD, clamp(sunUV, 0.0, 1.0))), near, far));
    vec2 d = (vUv - sunUV) * vec2(res.x / res.y, 1.0); float r = length(d);
    float edge = smoothstep(-0.25, 0.15, sunUV.x) * smoothstep(1.25, 0.85, sunUV.x) * smoothstep(-0.25, 0.15, sunUV.y) * smoothstep(1.25, 0.85, sunUV.y);
    float glow = exp(-r * 7.0) * 0.55 + exp(-r * 1.6) * 0.07;
    vec2 g1 = 0.5 - (sunUV - 0.5) * 0.45, g2 = 0.5 - (sunUV - 0.5) * 1.1;
    float ghosts = exp(-length((vUv - g1) * vec2(res.x / res.y, 1.0)) * 28.0) * 0.08 + exp(-length((vUv - g2) * vec2(res.x / res.y, 1.0)) * 16.0) * 0.05;
    c += sunCol * (glow + ghosts) * open * edge;
  }
  if (lens > 0.5) c += (hash12(vUv * res + fract(time) * 100.0) - 0.5) * 0.022;   // film grain
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.55; c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.06); gl_FragColor = vec4(c, 1.0); }` });""")
rep("""      // photo mode on Ultra: a soft copy of the picture for the depth of field, and the depth to judge it by
      const dofNow = AO && photo.on && photo.dof > 0;""",
    """      // Ultra lens look: where the sun is on screen (for the glare), the clock (for the grain)
      comp.uniforms.lens.value = AO ? 1 : 0;
      if (AO) {
        const sp = _v[7].copy(sunDir).multiplyScalar(2000).add(c.position).project(c);
        comp.uniforms.sunUV.value.set(sp.z < 1 && sunDir.y > -0.05 ? sp.x * 0.5 + 0.5 : -9, sp.z < 1 && sunDir.y > -0.05 ? sp.y * 0.5 + 0.5 : -9);
        comp.uniforms.sunCol.value.copy(sun.color).multiplyScalar(Math.min(1, sun.intensity / 2.5) * 0.9);
        comp.uniforms.time.value = clock; comp.uniforms.res.value.set(rt.width, rt.height);
        comp.uniforms.tD.value = dRT.texture; comp.uniforms.near.value = c.near; comp.uniforms.far.value = c.far;
      }
      // photo mode on Ultra: a soft copy of the picture for the depth of field, and the depth to judge it by
      const dofNow = AO && photo.on && photo.dof > 0;""")
open(p, 'w').write(s); print('ultra lens patch applied')
