/* Island Front: the Ultra graphics level, one step above Realistic. Same world and layout; what changes is the light.
   The scene is drawn in high dynamic range into an off-screen picture, then finished in a few passes:
   - sun shafts: the bright sky round the sun is smeared outwards from it, so whatever stands in front of it (trees, ridges, clouds,
     an aircraft) cuts dark fingers into the light;
   - bloom: very bright things (the sun, its glitter on water, the afterburner) glow into what is next to them;
   - lens flare when the sun itself is in view and not hidden;
   - air: distance fades into a haze that lies thicker in the low ground and turns warm looking towards the sun;
   - film response (ACES), a slight grade and vignette, and edge smoothing (FXAA).
   A lower, warmer sun and a sky with sun-lit clouds go with it. */
'use strict';
const ULTRA = { on: false, ready: false, sunDir: new V3(-.56, .33, .76).normalize(), exposure: .88, ray: .5, bloomAmt: .5, fogDen: .00011, fogH: 320, haze: .000022 };
const ULTRA_VS = 'varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function ultraPass(frag, uniforms) { return new THREE.ShaderMaterial({ vertexShader: ULTRA_VS, fragmentShader: 'precision highp float; varying vec2 vUv;\n' + frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, fog: false }); }

/* ---------------- the sky: blue overhead, pale at the horizon and warm towards a low sun; clouds lit from the sun's side ---------------- */
const ULTRA_SKY_U = { uSun: { value: ULTRA.sunDir.clone() }, uTime: SKY_U.uTime };
const ULTRA_SKY_GLSL = `
  vec3 ultraSky(vec3 d, vec3 sun) {
    float y = max(d.y, 0.0), sd = dot(d, sun), sdc = max(sd, 0.0), low = 1.0 - smoothstep(.1, .6, sun.y);
    vec3 zen = vec3(.05, .17, .56), hor = mix(vec3(.60, .78, .93), vec3(1.0, .74, .46), low * (.22 + .62 * pow(sdc, 3.0)));
    vec3 col = mix(hor, zen, pow(y, .48)) * 1.3;
    float g = .78, mie = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * sd, 1.5);
    col += vec3(1.0, .84, .62) * mie * .03 * (1.0 + low);
    return col;
  }`;
function buildUltraSkyMat() {
  return new THREE.ShaderMaterial({
    uniforms: ULTRA_SKY_U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uSun; uniform float uTime; varying vec3 vD; ${SKY_FRAG_NOISE} ${ULTRA_SKY_GLSL}
      void main(){ vec3 d = normalize(vD); float sd = dot(d, uSun), sdc = max(sd, 0.0);
        vec3 col = ultraSky(d, uSun);
        col += vec3(1.0, .92, .78) * smoothstep(.99968, .99990, sd) * 120.0; // the sun's disc, far brighter than anything else
        if (d.y > 0.0) {
          vec2 wind = vec2(uTime * .0035, uTime * .0013), p = d.xz / (d.y + .1) * 1.25 + wind;
          float n = fbm2(p), den = smoothstep(.5, .8, n), fade = smoothstep(0.0, .22, d.y);
          // how much cloud lies between this spot and the sun: thick towards the sun means the near side is in shade
          vec2 ls = normalize(uSun.xz + 1e-4) * .09; float toSun = smoothstep(.45, .85, fbm2(p + ls)) * .6 + smoothstep(.45, .85, fbm2(p + ls * 2.2)) * .4;
          float lit = exp(-toSun * 2.2) * (.55 + .45 * (1.0 - den));
          vec3 shade = vec3(.36, .42, .52) * 1.1, sunlit = mix(vec3(1.0, .9, .74), vec3(1.0, .97, .93), smoothstep(.1, .6, uSun.y)) * 2.3;
          vec3 cc = mix(shade, sunlit, lit) + vec3(1.0, .82, .55) * pow(sdc, 10.0) * (1.0 - den) * 2.5; // thin edges glow when the sun is behind them
          col = mix(col, cc, den * fade * .92);
          // high thin cloud
          float ci = smoothstep(.55, .9, fbm2(d.xz / (d.y + .3) * vec2(.5, 2.2) + wind * .4 + 31.0)) * smoothstep(.05, .4, d.y) * .16;
          col = mix(col, vec3(1.0, .96, .9) * (1.2 + 2.0 * pow(sdc, 6.0)), ci * (1.0 - den));
        }
        col = mix(col, ultraSky(vec3(d.x, 0.0, d.z), uSun) * .8, smoothstep(0.0, -.12, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
}

/* ---------------- the ground in Ultra ---------------- */
/* Rock: layers of noise for the mottled face, thin dark fissures where a ridged noise peaks, warm and cool patches. No drawn shapes,
   so it holds up both close to and stretched over a mountainside. */
function ultraRockTex() {
  if (ULTRA.rock) return ULTRA.rock;
  const S = 512, a = tfbm(S, 18, 5, 901), r = tfbm(S, 9, 5, 907, true), c = tfbm(S, 13, 3, 913), // (no low octaves: stretched over a hillside they would show as a regular quilt)
    sp = tnoise(S, 128, 921), r2 = tfbm(S, 11, 3, 931, true);
  return ULTRA.rock = texOf(paint(S, (x, y, i) => {
    const crack = Math.pow(clamp(r[i] * 1.12, 0, 1), 8) * .6 + Math.pow(clamp(r2[i] * 1.2, 0, 1), 10) * .3, v = (.58 + a[i] * .34) * (1 - crack) + sp[i] * .035;
    const col = mixc([118, 112, 104], [146, 132, 112], clamp(c[i] * .9 + .5, 0, 1)); return [clamp(col[0] * v * 1.2, 0, 255), clamp(col[1] * v * 1.2, 0, 255), clamp(col[2] * v * 1.2, 0, 255)];
  }));
}
/* Added to the terrain shader in Ultra: warm and cool tracts of rock, a patchwork of differently coloured fields (so the farmland reads from the air
   the way real countryside does), damp sand at the waterline, and greener grass in sheltered hollows. */
const ULTRA_TERRAIN_GLSL = `
        { tAlb = mix(tAlb, tAlb * mix(vec3(.94, .95, .98), vec3(1.08, 1.0, .9), texture2D(tMacro, vWP.xz / 1900.0 + .2).r), w.z); // warm and cool tracts of rock, far too large to repeat in view
          float fid = fract(sin(floor(vField.y * 31.0 + .5) * 12.9898 + floor(vField.x + .5) * 78.233) * 43758.5453), isField = smoothstep(.5, .9, vField.x);
          vec3 tone = fid < .25 ? vec3(1.28, 1.16, .72) : fid < .5 ? vec3(.82, .98, .7) : fid < .75 ? vec3(1.08, 1.0, .82) : vec3(.9, .86, .74); // ripe grain, young green, stubble, bare
          tAlb = mix(tAlb, tAlb * tone * (.88 + .3 * fract(fid * 7.3)), isField * mix(.35, .8, far));
          tAlb *= mix(1.0, .72, w.w * (1.0 - smoothstep(.2, 1.4, vWP.y))); // wet sand is darker
          float hollow = 1.0 - texture2D(tShade, vWP.xz / uWorld).g; tAlb *= mix(vec3(1.0), vec3(.86, 1.02, .8), w.x * clamp(hollow * 2.2, 0.0, 1.0)); }`;

/* ---------------- the passes ---------------- */
const ULTRA_ACES = `
  vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 aces(vec3 color) {
    const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color = I * color; color = RRTAndODTFit(color); color = O * color; return clamp(color, 0.0, 1.0); }
  vec3 toSRGB(vec3 c) { return mix(pow(c, vec3(.41666)) * 1.055 - .055, c * 12.92, vec3(lessThanEqual(c, vec3(.0031308)))); }`;
function ultraInit() {
  if (ULTRA.ready) return true;
  const gl2 = renderer.capabilities.isWebGL2, hdr = gl2 && !!renderer.extensions.get('EXT_color_buffer_float');
  if (!gl2) return false; // (needs a depth texture and float targets: any graphics card from the last ten years has them)
  ULTRA.type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rt = (type, depth) => { const t = new THREE.WebGLRenderTarget(4, 4, { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!depth, stencilBuffer: false }); t.texture.generateMipmaps = false; if (depth) { t.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType); t.depthTexture.format = THREE.DepthFormat; } return t; };
  ULTRA.scene = rt(ULTRA.type, true); ULTRA.raysA = rt(ULTRA.type); ULTRA.raysB = rt(ULTRA.type); ULTRA.ldr = rt(THREE.UnsignedByteType);
  ULTRA.bloom = [0, 1, 2, 3, 4].map(() => [rt(ULTRA.type), rt(ULTRA.type)]);
  const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  ULTRA.quad = new THREE.Mesh(tri, null); ULTRA.quad.frustumCulled = false; ULTRA.qScene = new THREE.Scene(); ULTRA.qScene.add(ULTRA.quad); ULTRA.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  ULTRA.mMask = ultraPass(`uniform sampler2D tScene, tDepth; uniform vec2 uSunUv; uniform float uAspect, uSunVis;
    void main(){ float d = texture2D(tDepth, vUv).x; vec3 c = texture2D(tScene, vUv).rgb; if (!(dot(c, c) < 1e8)) c = vec3(0.0);
      c = max(min(c, vec3(14.0)) - 1.1, 0.0); // only what is brighter than open sky: the sun, its halo, bright cloud edges
      vec2 q = vUv - uSunUv; q.x *= uAspect; float w = exp(-dot(q, q) * 5.0);
      gl_FragColor = vec4(c * step(.9999995, d) * w * uSunVis, 1.0); }`, { tScene: { value: null }, tDepth: { value: null }, uSunUv: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uSunVis: { value: 1 } });
  ULTRA.mRays = ultraPass(`uniform sampler2D tIn; uniform vec2 uSunUv; uniform float uLen;
    void main(){ vec2 st = (uSunUv - vUv) * uLen / 8.0, p = vUv; vec3 s = vec3(0.0); float w = 1.0, tw = 0.0;
      for (int i = 0; i < 8; i++) { s += texture2D(tIn, p).rgb * w; tw += w; w *= .93; p += st; }
      gl_FragColor = vec4(s / tw, 1.0); }`, { tIn: { value: null }, uSunUv: { value: new THREE.Vector2() }, uLen: { value: 1 } });
  ULTRA.mBright = ultraPass(`uniform sampler2D tIn; uniform float uThr;
    void main(){ vec3 c = texture2D(tIn, vUv).rgb; if (!(dot(c, c) < 1e8)) c = vec3(0.0); c = min(c, vec3(24.0)); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * max(0.0, l - uThr) / max(l, 1e-4), 1.0); }`, { tIn: { value: null }, uThr: { value: 1.6 } });
  ULTRA.mBlur = ultraPass(`uniform sampler2D tIn; uniform vec2 uDir;
    void main(){ vec3 s = texture2D(tIn, vUv).rgb * .227027;
      s += (texture2D(tIn, vUv + uDir * 1.3846).rgb + texture2D(tIn, vUv - uDir * 1.3846).rgb) * .316216;
      s += (texture2D(tIn, vUv + uDir * 3.2308).rgb + texture2D(tIn, vUv - uDir * 3.2308).rgb) * .070270;
      gl_FragColor = vec4(s, 1.0); }`, { tIn: { value: null }, uDir: { value: new THREE.Vector2() } });
  ULTRA.mFinal = ultraPass(`uniform sampler2D tScene, tDepth, tRays, tB0, tB1, tB2, tB3, tB4; uniform mat4 uInvProj, uCamW; uniform vec3 uCamPos, uSun, uFogCol, uSunCol;
    uniform float uFogDen, uFogH, uHaze, uExposure, uRay, uBloom, uAspect, uSunVis, uTime, uCloudT; uniform vec2 uSunUv; ${ULTRA_ACES}
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main(){
      vec3 col = texture2D(tScene, vUv).rgb; float d = texture2D(tDepth, vUv).x; if (!(dot(col, col) < 1e8)) col = vec3(0.0);
      if (d < .9999995) { // the air between here and there
        vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w; float dist = length(v.xyz); vec3 dir = normalize((uCamW * vec4(v.xyz, 0.0)).xyz);
        { // cloud shadows drifting over the land and sea: where a cloud stands between a spot and the sun, its light is cut
          vec3 wp = uCamPos + dir * dist; vec2 cp = (wp.xz + uSun.xz / max(uSun.y, .1) * (1500.0 - wp.y)) / 2600.0 + vec2(uCloudT * .011, uCloudT * .004);
          float cl = vnoise(cp) * .55 + vnoise(cp * 2.1 + 7.3) * .3 + vnoise(cp * 4.3 + 1.7) * .15;
          col *= 1.0 - .34 * smoothstep(.52, .7, cl) * smoothstep(9000.0, 3000.0, dist); }
        float k = dir.y / uFogH, base = uFogDen * exp(-max(uCamPos.y, 0.0) / uFogH);
        float tau = (abs(k) < 1e-6 ? base * dist : base * (1.0 - exp(-k * dist)) / k) + dist * uHaze;
        float f = 1.0 - exp(-tau), sd = max(dot(dir, uSun), 0.0);
        col = mix(col, mix(uFogCol, uSunCol, pow(sd, 8.0) * .8), f);
      }
      col += texture2D(tRays, vUv).rgb * vec3(1.0, .9, .74) * uRay;
      col += (texture2D(tB0, vUv).rgb * .35 + texture2D(tB1, vUv).rgb * .3 + texture2D(tB2, vUv).rgb * .3 + texture2D(tB3, vUv).rgb * .3 + texture2D(tB4, vUv).rgb * .35) * uBloom;
      if (uSunVis > .001) { // lens flare: only when the sun's own light reaches the lens (read from the shaft picture at the sun)
        float vis = clamp(dot(texture2D(tRays, uSunUv).rgb, vec3(.34)) * .5, 0.0, 1.0) * uSunVis;
        vec2 c = vec2(.5), ax = c - uSunUv, q; vec3 fl = vec3(0.0);
        q = vUv - (uSunUv + ax * .55); q.x *= uAspect; fl += vec3(.35, .5, .25) * smoothstep(.055, .045, length(q)) * .05;
        q = vUv - (uSunUv + ax * 1.35); q.x *= uAspect; fl += vec3(.5, .35, .2) * smoothstep(.09, .07, length(q)) * .035;
        q = vUv - (uSunUv + ax * 2.3); q.x *= uAspect; fl += vec3(.45, .3, .5) * smoothstep(.16, .0, length(q)) * .03;
        q = vUv - uSunUv; fl += vec3(1.0, .8, .55) * exp(-abs(q.y) * 90.0) * exp(-abs(q.x) * 3.5) * .16; // a faint streak across the sun
        col += fl * vis * 3.0;
      }
      col = aces(col * uExposure);
      float l = dot(col, vec3(.2126, .7152, .0722)); col = mix(vec3(l), col, 1.1); // a touch more colour
      col = mix(col, col * col * (3.0 - 2.0 * col), .18); // and contrast
      vec2 q = vUv - .5; col *= 1.0 - dot(q, q) * .42;
      col = toSRGB(clamp(col, 0.0, 1.0)) + (hash(vUv * 917.0 + uTime) - .5) / 255.0;
      gl_FragColor = vec4(col, dot(col, vec3(.299, .587, .114)));
    }`, { tScene: { value: null }, tDepth: { value: null }, tRays: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, tB4: { value: null },
    uInvProj: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() }, uCamPos: { value: new V3() }, uSun: { value: new V3() }, uFogCol: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uFogDen: { value: 0 }, uFogH: { value: 300 }, uHaze: { value: 0 }, uExposure: { value: 1 }, uRay: { value: 1 }, uBloom: { value: 1 }, uAspect: { value: 1 }, uSunVis: { value: 0 }, uTime: { value: 0 }, uCloudT: { value: 0 }, uSunUv: { value: new THREE.Vector2() } });
  // FXAA: finds edges by their brightness step and blends along them (brightness was stored in alpha by the pass before)
  ULTRA.mFxaa = ultraPass(`uniform sampler2D tIn; uniform vec2 uPx;
    void main(){ vec4 m = texture2D(tIn, vUv);
      float lNW = texture2D(tIn, vUv + vec2(-1.0, -1.0) * uPx).a, lNE = texture2D(tIn, vUv + vec2(1.0, -1.0) * uPx).a, lSW = texture2D(tIn, vUv + vec2(-1.0, 1.0) * uPx).a, lSE = texture2D(tIn, vUv + vec2(1.0, 1.0) * uPx).a, lM = m.a;
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float red = max((lNW + lNE + lSW + lSE) * .03125, .0078125), rc = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rc, vec2(-8.0), vec2(8.0)) * uPx;
      vec4 a = .5 * (texture2D(tIn, vUv + dir * (1.0 / 3.0 - .5)) + texture2D(tIn, vUv + dir * (2.0 / 3.0 - .5)));
      vec4 b = a * .5 + .25 * (texture2D(tIn, vUv + dir * -.5) + texture2D(tIn, vUv + dir * .5));
      gl_FragColor = vec4((b.a < lMin || b.a > lMax) ? a.rgb : b.rgb, 1.0); }`, { tIn: { value: null }, uPx: { value: new THREE.Vector2() } });
  ULTRA.size = new THREE.Vector2(); ULTRA.ready = true; return true;
}
function ultraResize() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2()); if (s.x === ULTRA.size.x && s.y === ULTRA.size.y) return;
  ULTRA.size.copy(s); const w = s.x, h = s.y;
  ULTRA.scene.setSize(w, h); ULTRA.ldr.setSize(w, h); ULTRA.raysA.setSize(w >> 1, h >> 1); ULTRA.raysB.setSize(w >> 1, h >> 1);
  ULTRA.bloom.forEach((p, i) => { const d = 2 << i; p[0].setSize(Math.max(2, Math.round(w / d)), Math.max(2, Math.round(h / d))); p[1].setSize(Math.max(2, Math.round(w / d)), Math.max(2, Math.round(h / d))); });
}
const _uv3 = new V3(), _ufw = new V3();
function ultraDraw(mat, target) { ULTRA.quad.material = mat; renderer.setRenderTarget(target); renderer.render(ULTRA.qScene, ULTRA.qCam); }
function ultraRender() {
  ultraResize();
  const U = ULTRA, w = U.size.x, h = U.size.y, as = w / h;
  renderer.setRenderTarget(U.scene); renderer.render(scene, camera);
  // where the sun is on the screen, and how squarely we face it
  camera.getWorldDirection(_ufw); const facing = _ufw.dot(SUN_DIR); _uv3.copy(camera.position).addScaledVector(SUN_DIR, 5000).project(camera);
  const sx = _uv3.x * .5 + .5, sy = _uv3.y * .5 + .5, vis = facing > 0 ? clamp((facing - .15) / .35, 0, 1) * clamp(1.6 - Math.max(Math.abs(sx - .5), Math.abs(sy - .5)) * 1.6, 0, 1) : 0;
  const m = U.mMask.uniforms; m.tScene.value = U.scene.texture; m.tDepth.value = U.scene.depthTexture; m.uSunUv.value.set(sx, sy); m.uAspect.value = as; m.uSunVis.value = vis;
  if (vis > .001) {
    ultraDraw(U.mMask, U.raysA);
    const r = U.mRays.uniforms; r.uSunUv.value.set(sx, sy);
    r.tIn.value = U.raysA.texture; r.uLen.value = .9 / 64; ultraDraw(U.mRays, U.raysB);
    r.tIn.value = U.raysB.texture; r.uLen.value = .9 / 8; ultraDraw(U.mRays, U.raysA);
    r.tIn.value = U.raysA.texture; r.uLen.value = .9; ultraDraw(U.mRays, U.raysB);
  } else { renderer.setRenderTarget(U.raysB); renderer.setClearColor(0x000000, 1); renderer.clear(); }
  // bloom: keep only what is very bright, then blur it at five sizes
  U.mBright.uniforms.tIn.value = U.scene.texture; ultraDraw(U.mBright, U.bloom[0][0]);
  for (let i = 0; i < 5; i++) { const [a, b] = U.bloom[i], bu = U.mBlur.uniforms;
    if (i > 0) { bu.tIn.value = U.bloom[i - 1][0].texture; bu.uDir.value.set(0, 0); ultraDraw(U.mBlur, a); }
    bu.tIn.value = a.texture; bu.uDir.value.set(1 / a.width, 0); ultraDraw(U.mBlur, b);
    bu.tIn.value = b.texture; bu.uDir.value.set(0, 1 / a.height); ultraDraw(U.mBlur, a); }
  const f = U.mFinal.uniforms; f.tScene.value = U.scene.texture; f.tDepth.value = U.scene.depthTexture; f.tRays.value = U.raysB.texture;
  for (let i = 0; i < 5; i++) f['tB' + i].value = U.bloom[i][0].texture;
  f.uInvProj.value.copy(camera.projectionMatrixInverse); f.uCamW.value.copy(camera.matrixWorld); f.uCamPos.value.copy(camera.position); f.uSun.value.copy(SUN_DIR);
  f.uFogCol.value.copy(U.fogCol); f.uSunCol.value.copy(U.sunFog); f.uFogDen.value = U.fogDen; f.uFogH.value = U.fogH; f.uHaze.value = U.haze; f.uExposure.value = U.exposure; f.uRay.value = U.ray; f.uBloom.value = U.bloomAmt; f.uAspect.value = as; f.uSunVis.value = vis; f.uSunUv.value.set(sx, sy); f.uTime.value = (performance.now() % 1000) / 1000; f.uCloudT.value = SKY_U.uTime.value;
  ultraDraw(U.mFinal, U.ldr);
  U.mFxaa.uniforms.tIn.value = U.ldr.texture; U.mFxaa.uniforms.uPx.value.set(1 / w, 1 / h); ultraDraw(U.mFxaa, null);
}
/* every frame goes through here */
function renderFrame() { if (ULTRA.on && ULTRA.ready) ultraRender(); else renderer.render(scene, camera); }

/* ---------------- switching it on and off (called from applyLook, after the Realistic look is in place) ---------------- */
function ultraApply(on) {
  on = on && ultraInit(); ULTRA.on = !!on; WORLD.ultra = !!on;
  if (on) {
    const low = 1 - sstep(.1, .6, SUN_DIR.y);
    ULTRA.fogCol = new THREE.Color(.60, .78, .93).lerp(new THREE.Color(1.0, .74, .46), low * .22).multiplyScalar(1.3 * .92);
    ULTRA.sunFog = new THREE.Color(1.0, .8, .56).multiplyScalar(1.3 * (1.05 + low * .5));
    ULTRA.fogSaved = scene.fog; scene.fog = null; // the haze is laid on afterwards, from the depth of each pixel
    renderer.toneMapping = THREE.NoToneMapping; // (the film response is applied at the end, after the glow and the haze)
    sun.intensity = 4.4; sun.color.setRGB(1.0, .84, .64); hemi.intensity = .74; hemi.color.setRGB(.62, .76, 1.0); hemi.groundColor.setRGB(.42, .36, .24);
    ULTRA_SKY_U.uSun.value.copy(SUN_DIR);
    if (REAL.sky) { REAL.skyMat0 = REAL.skyMat0 || REAL.sky.material; REAL.sky.material = ULTRA.skyMat || (ULTRA.skyMat = buildUltraSkyMat()); }
    if (!ULTRA.env) { const pm = new THREE.PMREMGenerator(renderer), sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(15000, 48, 24), buildUltraSkyMat())); ULTRA.env = pm.fromScene(sc).texture; pm.dispose(); }
    scene.environment = ULTRA.env;
    document.body.classList.add('ultra');
  } else {
    if (ULTRA.fogSaved) { scene.fog = ULTRA.fogSaved; ULTRA.fogSaved = null; }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (REAL.sky && REAL.skyMat0) REAL.sky.material = REAL.skyMat0;
    document.body.classList.remove('ultra');
  }
}
/* the sea and anything else built with the world picks up the Ultra light here (called once the world is built) */
function ultraWorld() {
  if (!ULTRA.on) return;
  if (REAL.water) { const u = REAL.water.material.uniforms; REAL.water.material.depthWrite = true; u.uTop.value.setRGB(.05 * 1.3, .17 * 1.3, .56 * 1.3); u.uHz.value.copy(ULTRA.fogCol); u.uGlint.value = 1; }
}
