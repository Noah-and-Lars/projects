// Renderer, sky, sun and the day/night cycle.
//
// One sun with cascaded shadows (three's CSM addon) plus a hemisphere sky
// light. A day lasts 24 real minutes. The hemisphere light never drops below
// a minimum level, so nights and caves stay readable (BUILD_BRIEF 3.1).
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';

export const DAY_SECONDS = 24 * 60;
const MIN_AMBIENT = 0.9;

// Colour keys by sun elevation (-1 .. 1).
const KEYS = [
  { e: -0.35, top: 0x0c1838, hor: 0x2a3a60, sun: 0x8090c0, si: 0.0, hemiSky: 0x8aa0d8, hemiGnd: 0x3a4258, hi: MIN_AMBIENT },
  { e: -0.06, top: 0x22356a, hor: 0x7a6a88, sun: 0xff9a60, si: 0.0, hemiSky: 0x9aa0d0, hemiGnd: 0x4a4a58, hi: MIN_AMBIENT + 0.1 },
  { e: 0.06, top: 0x3d68a8, hor: 0xf2aa78, sun: 0xffa868, si: 1.2, hemiSky: 0xd8c8c0, hemiGnd: 0x6a5a4a, hi: 1.0 },
  { e: 0.3, top: 0x4a92d0, hor: 0xbfdcea, sun: 0xfff0d8, si: 2.6, hemiSky: 0xe8f0ff, hemiGnd: 0x8a8060, hi: 1.15 },
  { e: 1.0, top: 0x3f8ad0, hor: 0xc4e2f0, sun: 0xfff6e8, si: 3.0, hemiSky: 0xeef4ff, hemiGnd: 0x928866, hi: 1.2 },
];
const cA = new THREE.Color(), cB = new THREE.Color();
function sample(e, key, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)));
  if (typeof a[key] === 'number' && key !== 'si' && key !== 'hi') return out.copy(cA.setHex(a[key])).lerp(cB.setHex(b[key]), t);
  return a[key] + (b[key] - a[key]) * t;
}

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const skyFrag = `
uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uNight;
varying vec3 vDir;
float h31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = y > 0.0 ? mix(uHor, uTop, pow(smoothstep(0.0, 0.7, y), 0.8)) : mix(uHor, uGround, smoothstep(0.0, -0.25, y));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25);
  // Stars and a moon at night.
  if (uNight > 0.0 && y > 0.0) {
    vec3 g = floor(d * 220.0);
    float s = step(0.9975, h31(g));
    col += vec3(s) * uNight * smoothstep(0.0, 0.25, y) * 0.9;
    float md = max(dot(d, -uSunDir), 0.0);
    col += vec3(0.85, 0.9, 1.0) * pow(md, 1600.0) * 3.0 * uNight;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createScene(canvas, settings) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.08, 1400);
  scene.fog = new THREE.Fog(0xbfdcea, 140, 620);

  const hemi = new THREE.HemisphereLight(0xeef4ff, 0x928866, 1.2);
  scene.add(hemi);

  // Sky dome drawn at the far plane.
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color(0x6a7a6a) }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uNight: { value: 0 } },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // Shared noise texture for grain on every lit material.
  const N = 64, data = new Uint8Array(N * N * 4);
  let s = 12345; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N * N; i++) { const v = 170 + r() * 85; data.set([v, v, v, 255], i * 4); }
  const grain = new THREE.DataTexture(data, N, N); grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.magFilter = THREE.LinearFilter; grain.needsUpdate = true;

  let csm = null, gen = 0, shadowQ = null;
  const csmMaterials = new Set();
  function setupShadows() {
    if (shadowQ === settings.graphics) return;
    shadowQ = settings.graphics; gen++;
    if (csm) { csm.remove(); csm.dispose(); csm = null; }
    const q = settings.graphics;
    renderer.shadowMap.enabled = q !== 'low';
    if (q === 'low') return;
    csm = new CSM({ camera, parent: scene, cascades: q === 'high' ? 3 : 2, maxFar: q === 'high' ? 240 : 160, shadowMapSize: q === 'high' ? 2048 : 1024, lightDirection: new THREE.Vector3(-1, -1, -1).normalize(), lightIntensity: 3, lightFar: 900, shadowBias: -0.0004 });
    csm.fade = true;
    for (const l of csm.lights) { l.shadow.normalBias = 0.04; }
    for (const m of csmMaterials) { csm.setupMaterial(m); chain(m); m.needsUpdate = true; }
  }
  // A fallback sun used when shadows are off (CSM provides its own lights).
  const plainSun = new THREE.DirectionalLight(0xffffff, 3);
  scene.add(plainSun); scene.add(plainSun.target);

  // Our own shader tweaks, chained after CSM's onBeforeCompile.
  const hooks = new WeakMap();
  function chain(m) {
    const csmHook = m.onBeforeCompile;
    const mine = hooks.get(m);
    m.onBeforeCompile = (sh, rr) => { if (csmHook && csm) csmHook.call(m, sh, rr); if (mine) mine(sh, rr); };
    // A new CSM setup must compile new programs, not reuse cached ones.
    m.customProgramCacheKey = () => 'rill-' + gen + (csm ? '-csm' : '');
  }
  // Register a lit material: grain + shadows.
  function litMaterial(m, extraHook) {
    const grainHook = (sh) => {
      sh.uniforms.uGrain = { value: grain };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uGrain; varying vec3 vGrainPos;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n{ vec3 gp = vGrainPos * 0.6; float g = texture2D(uGrain, gp.xz).r * 0.5 + texture2D(uGrain, gp.xy * 0.9).r * 0.25 + texture2D(uGrain, gp.zy * 0.9).r * 0.25; diffuseColor.rgb *= 0.86 + 0.2 * g; }');
      if (extraHook) extraHook(sh);
    };
    hooks.set(m, grainHook);
    csmMaterials.add(m);
    if (csm) csm.setupMaterial(m);
    chain(m);
    return m;
  }

  const materials = {
    terrain: litMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 })),
    vcolor: litMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0 })),
    vcolorSmooth: litMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 })),
    claim: litMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.97, metalness: 0 })),
    brass: litMaterial(new THREE.MeshStandardMaterial({ color: 0xc89a48, roughness: 0.38, metalness: 0.85, flatShading: true })),
    copper: litMaterial(new THREE.MeshStandardMaterial({ color: 0xc0704a, roughness: 0.4, metalness: 0.8, flatShading: true })),
  };
  materials.litMaterial = litMaterial;

  const env = { sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), horizon: new THREE.Color(), sunIntensity: 1, elevation: 1, night: 0, waterLight: 1 };
  const tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
  let cave = 0;
  function setTime(dayFrac, caveFactor = 0) {
    cave = caveFactor;
    const ang = (dayFrac - 0.25) * Math.PI * 2;
    const e = Math.sin(ang);
    // Sun arcs from east to west, tilted south.
    env.sunDir.set(Math.cos(ang) * 0.9, e, 0.35).normalize();
    env.elevation = e;
    sample(e, 'top', skyMat.uniforms.uTop.value);
    sample(e, 'hor', env.horizon);
    skyMat.uniforms.uHor.value.copy(env.horizon);
    skyMat.uniforms.uGround.value.copy(env.horizon).multiplyScalar(0.55);
    sample(e, 'sun', env.sunColor);
    env.sunIntensity = sample(e, 'si');
    skyMat.uniforms.uSunDir.value.copy(env.sunDir);
    skyMat.uniforms.uSunCol.value.copy(env.sunColor).multiplyScalar(e > -0.1 ? 1 : 0);
    env.night = Math.min(1, Math.max(0, (-e - 0.02) / 0.2));
    skyMat.uniforms.uNight.value = env.night;
    sample(e, 'hemiSky', hemi.color); sample(e, 'hemiGnd', hemi.groundColor);
    hemi.intensity = Math.max(MIN_AMBIENT, sample(e, 'hi'));
    scene.fog.color.copy(env.horizon);
    // Below the horizon the same light becomes a cool moon opposite the sun,
    // so nights keep soft shadows and shape.
    const moon = e < -0.02;
    const lightFrom = moon ? tmpV.copy(env.sunDir).negate() : tmpV.copy(env.sunDir);
    if (lightFrom.y < 0.25) { lightFrom.y = 0.25; lightFrom.normalize(); }
    const lc = moon ? tmpC.setHex(0x9fb4ff) : env.sunColor;
    const li = (moon ? 0.9 * env.night : env.sunIntensity) * (1 - cave * 0.85);
    if (csm) {
      csm.lightDirection.copy(lightFrom).negate();
      for (const l of csm.lights) { l.color.copy(lc); l.intensity = li; }
    }
    plainSun.visible = !csm;
    plainSun.color.copy(lc); plainSun.intensity = li;
    plainSun.position.copy(camera.position).addScaledVector(lightFrom, 100); plainSun.target.position.copy(camera.position);
    hemi.intensity *= 1 - cave * 0.25;
    env.waterLight = 0.35 + 0.65 * Math.min(1, Math.max(0, (e + 0.1) / 0.35));
  }

  function resize() {
    const pr = Math.min(devicePixelRatio, settings.graphics === 'low' ? 1 : settings.graphics === 'medium' ? 1.5 : 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (csm) csm.updateFrustums();
  }
  addEventListener('resize', resize);
  setupShadows();
  resize();

  return {
    renderer, scene, camera, hemi, sky, materials, env, grain,
    setTime, resize,
    applySettings() { camera.fov = settings.fov; setupShadows(); resize(); },
    render() {
      sky.position.copy(camera.position);
      if (csm) csm.update();
      renderer.render(scene, camera);
    },
  };
}
