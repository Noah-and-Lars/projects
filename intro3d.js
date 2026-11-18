/* intro3d.js (2026-11-17): the opening trailer on the home page, once per visit. Serious, like a film studio logo.
   Extruded 3D letters ("THE" over "ARCADE", cut from Archivo at full width and weight) sit in total darkness; one
   slow light sweep reveals their chrome while the camera dollies round to face them, then a measured push-in and a
   fade to black into the site. Plain three.js (vendor/three.module.min.js), no post-processing, no other files.
   index.html imports this only when the intro should play and WebGL works; play(root, done) calls done() when the
   trailer ends or is skipped (a tap, a click or any key). */
import * as THREE from './vendor/three.module.min.js';

// glyph outlines in font units (1000/em): M/L/Q/Z commands, y up
const GLYPHS = {
  T: [865, 'M 318 0 L 318 509 L 24 509 L 24 688 L 842 688 L 842 509 L 548 509 L 548 0 Z'],
  H: [1001, 'M 78 0 L 78 688 L 308 688 L 308 439 L 693 439 L 693 688 L 923 688 L 923 0 L 693 0 L 693 260 L 308 260 L 308 0 Z'],
  E: [861, 'M 78 0 L 78 688 L 806 688 L 806 525 L 309 525 L 309 425 L 740 425 L 740 270 L 309 270 L 309 163 L 814 163 L 814 0 Z'],
  A: [946, 'M 11 0 L 346 688 L 600 688 L 935 0 L 688 0 L 642 99 L 292 99 L 248 0 Z M 365 261 L 570 261 L 516 386 Q 513 395 507 410 Q 501 425 494 443 Q 488 461 482 478 Q 476 495 472 506 L 465 506 Q 458 489 449 466 Q 441 443 433 422 Q 425 400 419 386 Z'],
  R: [939, 'M 78 0 L 78 688 L 665 688 Q 741 688 792 656 Q 842 625 868 573 Q 893 522 893 462 Q 893 395 862 341 Q 832 288 771 256 L 909 0 L 650 0 L 542 220 L 308 220 L 308 0 Z M 308 383 L 586 383 Q 617 383 638 403 Q 658 422 658 455 Q 658 478 648 493 Q 639 509 623 517 Q 607 525 586 525 L 308 525 Z'],
  C: [940, 'M 487 -12 Q 340 -12 243 28 Q 145 69 97 148 Q 49 227 49 344 Q 49 515 161 607 Q 273 700 489 700 Q 608 700 698 663 Q 789 626 840 561 Q 891 495 891 408 L 668 408 Q 668 446 645 475 Q 622 504 581 521 Q 540 537 485 537 Q 418 537 373 513 Q 329 490 307 449 Q 285 409 285 357 L 285 332 Q 285 282 307 241 Q 329 200 372 175 Q 416 151 481 151 Q 542 151 585 166 Q 628 182 651 210 Q 674 238 674 276 L 891 276 Q 891 192 843 127 Q 794 61 704 25 Q 613 -12 487 -12 Z'],
  D: [933, 'M 78 0 L 78 688 L 472 688 Q 600 688 692 648 Q 785 608 834 531 Q 884 454 884 344 Q 884 234 834 157 Q 785 80 692 40 Q 600 0 472 0 Z M 308 163 L 458 163 Q 502 163 536 175 Q 571 187 596 210 Q 621 232 635 263 Q 648 294 648 333 L 648 357 Q 648 395 635 426 Q 621 457 596 479 Q 571 501 536 513 Q 502 525 458 525 L 308 525 Z'],
};

// one glyph -> THREE.Shape[] (outer contours are clockwise in font space, holes counter-clockwise)
function shapes(path) {
  const t = path.split(' '), contours = [];
  let cur = null, i = 0;
  const n = () => +t[i++] / 1000;
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M') { cur = new THREE.Path(); cur.moveTo(n(), n()); }
    else if (c === 'L') cur.lineTo(n(), n());
    else if (c === 'Q') { const a = n(), b = n(), x = n(), y = n(); cur.quadraticCurveTo(a, b, x, y); }
    else if (c === 'Z') { contours.push(cur); cur = null; }
  }
  const out = [];
  for (const p of contours) {
    const pts = p.getPoints(12);
    if (THREE.ShapeUtils.isClockWise(pts)) { const s = new THREE.Shape(); s.curves = p.curves; s.currentPoint = p.currentPoint; out.push(s); }
    else if (out.length) out[out.length - 1].holes.push(p);
  }
  return out;
}

const ease = {
  outQuart: x => 1 - Math.pow(1 - x, 4),
  outExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inOutCubic: x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inExpo: x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
};
const clamp01 = x => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;

export function play(root, done) {
  const LEN = 7.0; // seconds
  const canvas = document.createElement('canvas');
  canvas.className = 'intro-gl';
  root.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);

  // ---- a studio made of light strips, baked into an environment map; rotating it slides the reflections ----
  const studio = new THREE.Scene();
  const strip = (w, h, k, color, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); studio.add(m);
  };
  strip(18, 0.7, 7, 0xffffff, [0, 7, -1], [Math.PI / 2, 0, 0]);       // hard overhead strip
  strip(0.8, 12, 4.5, 0xf2f4ff, [-8, 1, 2], [0, Math.PI / 2, 0]);     // key tube
  strip(0.3, 12, 1.6, 0xffffff, [8, 1, -2], [0, -Math.PI / 2, 0]);    // thin edge tube
  strip(14, 0.25, 1.4, 0xff5a2c, [0, -2.5, -8], [0, 0, 0]);           // faint orange edge, low behind
  strip(10, 4, 0.12, 0xffffff, [0, 0, 9], [0, Math.PI, 0]);           // barely any fill: keep it dark
  strip(1.1, 16, 9, 0xffffff, [0, 0, 8.8], [0, Math.PI, 0]);          // the glint: a tall strip behind the camera
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(studio, 0.035).texture;
  scene.environment = env;
  scene.environmentIntensity = 0;

  const key = new THREE.SpotLight(0xffffff, 0, 30, 0.35, 0.6, 1.2);
  key.position.set(-6, 3, 5); scene.add(key); scene.add(key.target);
  const rim = new THREE.PointLight(0xff5a2c, 0, 10, 1.8);
  rim.position.set(0, 0.4, -2.2); scene.add(rim);

  // ---- the letters ----
  const face = new THREE.MeshStandardMaterial({ color: 0xe9e9ec, metalness: 1, roughness: 0.1 });
  const side = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.9, roughness: 0.38 });
  const geoCache = {};
  const geo = ch => geoCache[ch] || (geoCache[ch] = new THREE.ExtrudeGeometry(shapes(GLYPHS[ch][1]), {
    depth: 0.2, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.016, bevelSegments: 4,
  }));
  const word = new THREE.Group(); scene.add(word);
  const letters = [];
  const line = (text, scale, baseY, track, delay, kind) => {
    let w = 0; for (const ch of text) w += GLYPHS[ch][0] / 1000 + track; w -= track;
    let x = -w * scale / 2;
    [...text].forEach((ch, i) => {
      const m = new THREE.Mesh(geo(ch), [face, side]);
      m.scale.setScalar(scale);
      const rest = new THREE.Vector3(x, baseY, -0.1 * scale);
      m.position.copy(rest);
      word.add(m);
      letters.push({
        m, rest, kind, start: delay + i * (kind === 'big' ? 0.07 : 0.06), dur: kind === 'big' ? 3.2 : 2.6,
        from: new THREE.Vector3(rest.x, rest.y, rest.z - (kind === 'big' ? 0.9 : 0.6)),
        rot: new THREE.Euler(0, 0, 0),
      });
      x += (GLYPHS[ch][0] / 1000 + track) * scale;
    });
    return w * scale;
  };
  const W = line('ARCADE', 1, -0.38, 0.045, 0.2, 'big');
  line('THE', 0.42, 0.47, 0.32, 1.1, 'small');

  // ---- dust in the air ----
  const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - .5) * 14; pos[i * 3 + 1] = (Math.random() - .5) * 7; pos[i * 3 + 2] = (Math.random() - .5) * 12 - 1; seed[i] = Math.random(); }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 64;
  const dg = dot.getContext('2d'), grad = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,220,200,.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = grad; dg.fillRect(0, 0, 64, 64);
  const dustMat = new THREE.PointsMaterial({ size: 0.045, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);

  // ---- framing: fit the word to the screen, whatever its shape ----
  let dist = 8;
  const resize = () => {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(32) / 2) * camera.aspect);
    dist = Math.max((W * (camera.aspect < 1 ? 1.12 : 1.32) / 2) / Math.tan(hfov / 2), 5.2);
    camera.updateProjectionMatrix();
  };
  resize(); addEventListener('resize', resize);

  const look = new THREE.Vector3(0, 0.16, 0);
  let t0 = 0, raf = 0, ended = false;
  const finish = () => {
    if (ended) return; ended = true;
    cancelAnimationFrame(raf); removeEventListener('resize', resize);
    done();
    setTimeout(() => {
      renderer.dispose(); env.dispose(); pmrem.dispose(); dustGeo.dispose(); dustMat.dispose(); face.dispose(); side.dispose();
      for (const k in geoCache) geoCache[k].dispose();
      try { renderer.forceContextLoss(); } catch (e) {}
      canvas.remove();
    }, 900);
  };

  const frame = now => {
    if (!t0) t0 = now;
    const t = typeof window.__introT === 'number' ? window.__introT : (now - t0) / 1000; // __introT: tests step through time
    // letters fly in and settle
    for (const L of letters) {
      const k = ease.outExpo(seg(t, L.start, L.start + L.dur));
      L.m.position.lerpVectors(L.from, L.rest, k);
      L.m.rotation.set(L.rot.x * (1 - k), L.rot.y * (1 - k), L.rot.z * (1 - k));
    }
    // a slow breath once they're in place

    // light comes up, reflections slide across the chrome
    scene.environmentIntensity = 1.1 * ease.inOutSine(seg(t, 0.6, 3.6));
    scene.environmentRotation.set(0.05, lerp(-0.75, 0.7, ease.inOutSine(seg(t, 1.2, 5.6))), 0); // carries the glint across the faces
    const sweep = ease.inOutSine(seg(t, 1.4, 4.4)); // one slow highlight travelling left to right
    key.intensity = 90 * Math.sin(Math.PI * sweep);
    key.position.set(lerp(-7, 7, sweep), 2.6, 5); key.target.position.set(lerp(-2.4, 2.4, sweep), 0, 0);
    rim.intensity = 7 * ease.inOutSine(seg(t, 2.2, 4)) * (1 - seg(t, 5.6, 6.6));
    dustMat.opacity = 0.35 * seg(t, 0.8, 2.6) * (1 - seg(t, 5.6, 6.6));
    for (let i = 0; i < N; i++) { pos[i * 3 + 2] += 0.0015 + seed[i] * 0.003; pos[i * 3 + 1] -= 0.0006 * seed[i]; if (pos[i * 3 + 2] > 7) pos[i * 3 + 2] -= 13; }
    dustGeo.attributes.position.needsUpdate = true;
    // camera: a low swing round from the left, a slow drift, then a push straight through the word
    // camera: a slow dolly round from the right to face the word, then a measured push-in
    const a = ease.inOutSine(seg(t, 0, 4.6));
    const p = ease.inOutCubic(seg(t, 4.4, 7.0));
    camera.position.set(lerp(2.2, 0, a), lerp(-0.3, 0.16, a), lerp(dist * 0.78, dist, a) - dist * 0.32 * p);
    camera.fov = 32; camera.updateProjectionMatrix();
    look.z = Math.min(0, camera.position.z - 3); // keep looking ahead while flying through
    camera.lookAt(look);
    renderer.render(scene, camera);
    root.style.setProperty('--t', t.toFixed(3));
    if (t >= LEN && typeof window.__introT !== 'number') return finish();
    raf = requestAnimationFrame(frame);
  };
  // compile everything first, so the first visible frame doesn't stutter
  try { renderer.compile(scene, camera); } catch (e) {}
  raf = requestAnimationFrame(frame);
  return { skip: finish };
}
