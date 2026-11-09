// The main menu's live backdrop: two soldiers on a rooftop at night, seen
// from behind, looking out over a city far below.
//
// Everything but the soldiers is made here in code: the rooftop's parapet
// and a stair housing; the city (a few thousand instanced blocks with lit
// windows drawn by their shader, towers with blinking aircraft lights, the
// streets as slow streams of car lights and rows of street lamps, a glow on
// the street grid between them); a night sky with a low cloud deck lit from
// below by the city; haze, a few out-of-focus lights, light rain, film grain
// and a vignette. The two soldiers are copies of the game's soldier
// (src/soldier.js) in his idle clip, out of step with each other: the one on
// the left wears the player's outfit (the game's Wardrobe, so a change made
// in the loadout menu shows on him at once), the one on the right a
// contrasting outfit picked from the player's (ContrastOutfit, below).
//
// It has its own renderer and canvas (so the game's renderer can stand still
// behind it), lit by a strong red light from the right and cool moonlight
// from behind. It draws only while start()ed and the page is visible, at a
// lower resolution and with less of the city on a phone (QUALITY), and drops
// its resolution if frames come too slowly. dispose() frees all of it,
// leaving what it shares with the game (the soldier's and his gear's
// geometry and textures) as the game had it.

import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { loadSoldier } from '../soldier.js';
import { SLOTS, Wardrobe, disposeOwnMaterials } from '../gear.js';

// How much each kind of device draws: the most pixels per CSS pixel, how
// much of the city (a share of the blocks), how many cars and street lamps,
// raindrops, and whether edges are smoothed.
const QUALITY = {
  high: { pixelRatio: 1.5, city: 1, cars: 5200, lamps: 9000, rain: 700, antialias: true, clouds: 4 },
  low: { pixelRatio: 1.5, city: 0.5, cars: 1800, lamps: 3600, rain: 0, antialias: false, clouds: 2 },
};
// Frames slower than this (ms, averaged) lower the resolution a step, down
// to `floor` pixels per CSS pixel.
const ADAPT = { slowMs: 21, frames: 90, step: 0.25, floor: 0.75 };

// The city: the street level below the roof (metres), the street grid
// (blocks `x` by `z` metres between road centres, roads `road` wide), how far
// it goes, and the two clusters of towers (downtown and a second one).
const CITY = {
  ground: -150,
  x: 72, z: 96, road: 16, z0: -40,
  firstRow: 3, rows: 46, near: 140, spread: 0.85,
  towers: [{ x: -60, z: -1900, r: 650, k: 1 }, { x: 900, z: -2900, r: 560, k: 0.8 }, { x: -1300, z: -3300, r: 500, k: 0.6 }],
};
// The haze: the city fades into this colour (linear), this thick.
const FOG = { color: new THREE.Color(0.08, 0.046, 0.042), density: 0.0005 };

// A warm haze low over the streets, lit by them (thicker further off): GLSL
// for the city's shaders, given the distance `dist` and the height above
// the street `v`.
const HAZE_GLSL = '(vec3(0.15, 0.075, 0.035) * (1.0 - exp(-dist * 0.0007)) * exp(-v / 55.0))';

// Where the soldiers stand (x, z on the roof) and which way they face (0
// faces the camera), and their idle clip's start and speed.
const CAST = [
  { x: 0.42, z: 0.05, turn: Math.PI + 0.24, phase: 0.0, speed: 1.0 },
  { x: 1.36, z: -0.32, turn: Math.PI + 0.06, phase: 2.3, speed: 0.93 },
];
// The camera, wide (16:9 and wider) and upright (a phone): where it is, the
// point it looks at and its vertical field of view; in between, it eases
// from one to the other. It drifts slowly round that (DRIFT, metres) and a
// little after the mouse.
const FRAMING = {
  wide: { pos: [-0.25, 1.5, 2.85], look: [0.62, 0.95, -6], fov: 38 },
  tall: { pos: [0.75, 1.45, 3.7], look: [0.95, 0.55, -6], fov: 55 },
};
const DRIFT = { x: 0.11, y: 0.035, z: 0.08, mouse: 0.07 };

// The lights: the red one from the right (and its glow), moonlight from
// behind on the left, the city's warm glow from in front and below.
const RED = new THREE.Color(1, 0.06, 0.035);
const RED_LIGHT = { pos: [4.6, 2.4, -2.6], target: [0.9, 1.1, 0], intensity: 90 };

export class Backdrop {
  // container: the element the canvas goes in (it fills it). outfit and
  // wardrobe: the player's (src/gear.js).
  constructor(container, { outfit, wardrobe }) {
    this.container = container;
    this.outfit = outfit;
    this.wardrobe = wardrobe;
    this.quality = pickQuality();
    this.q = QUALITY[this.quality];
    this.running = false; // asked to draw (start/stop)
    this.drawing = false;
    this.time = 0;
    this.last = 0;
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    this.slow = { sum: 0, n: 0 };
    this.made = { geometries: new Set(), materials: new Set(), textures: new Set() };
    this.soldiers = [];
    this.retired = new Set(); // the game's geometry and textures of gear taken off them
    this.adaptive = true; // lower the resolution when frames are slow
    this.isReady = false;
    this.disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: this.q.antialias, powerPreference: 'high-performance' });
    this.renderer = renderer;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 1);
    this.canvas = renderer.domElement;
    this.canvas.className = 'menu-backdrop-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.25, 9000);
    this.uniforms = {
      uTime: { value: 0 },
      uPx: { value: 1000 },
      uFogColor: { value: FOG.color },
      uFog: { value: FOG.density },
      uRes: { value: new THREE.Vector2(1, 1) },
    };
    const rng = mulberry32(20261109);
    try {
      this.buildSky();
      this.buildRoof();
      this.buildLights();
      this.buildCity(rng);
      this.buildBokeh(rng);
      if (this.q.rain) this.buildRain(rng);
      this.buildPost();
    } catch (error) {
      // (Nothing half made left behind.)
      this.disposed = true;
      for (const thing of [...this.made.geometries, ...this.made.materials, ...this.made.textures]) thing.dispose();
      if (this.env) this.env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      this.canvas.remove();
      throw error;
    }

    this.frame = this.frame.bind(this);
    this.onResize = () => this.resize();
    this.onVisibility = () => this.update();
    this.onPointer = (e) => {
      this.mouse.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      this.mouse.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    };
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    this.resize();

    // Ready (shown) once the city's shaders are in and the soldiers are on
    // (or after a few seconds without them).
    this.ready = Promise.all([
      renderer.compileAsync(this.scene, this.camera).catch(() => {}),
      Promise.race([this.addSoldiers(), new Promise((resolve) => setTimeout(resolve, 4000))]),
    ]).then(() => {
      if (this.disposed) return;
      this.isReady = true;
      if (!this.drawing) this.render();
      this.canvas.classList.add('shown');
    });
  }

  // ---- Drawing ----

  start() {
    this.running = true;
    this.update();
  }

  stop() {
    this.running = false;
    this.update();
  }

  // Draws while asked to and the page is visible.
  update() {
    const on = this.running && !document.hidden && !this.disposed;
    if (on === this.drawing) return;
    this.drawing = on;
    this.last = 0;
    this.renderer.setAnimationLoop(on ? this.frame : null);
  }

  frame(now) {
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    this.time += dt;
    this.adapt(dt);
    const t = this.time;
    this.uniforms.uTime.value = t;
    for (const s of this.soldiers) s.mixer.update(dt);
    if (this.plane) this.flyPlane(t);
    // The camera: its framing for this shape of window, drifting slowly
    // round it and a little after the mouse.
    const m = this.mouse;
    const k = 1 - Math.exp(-dt * 1.5);
    m.sx += (m.x - m.sx) * k;
    m.sy += (m.y - m.sy) * k;
    const f = this.framing;
    this.camera.position.set(
      f.pos.x + Math.sin(t * 0.071) * DRIFT.x + m.sx * DRIFT.mouse,
      f.pos.y + Math.sin(t * 0.053 + 1.3) * DRIFT.y - m.sy * DRIFT.mouse * 0.4,
      f.pos.z + Math.sin(t * 0.043 + 0.6) * DRIFT.z,
    );
    this.look.copy(f.look);
    this.look.x += Math.sin(t * 0.037 + 2.1) * 0.25;
    this.look.y += Math.sin(t * 0.029) * 0.08;
    this.camera.lookAt(this.look);
    this.sky.position.copy(this.camera.position);
    this.render();
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    r.render(this.postScene, this.camera);
  }

  // Lowers the resolution a step when frames come too slowly.
  adapt(dt) {
    if (!dt || !this.adaptive) return;
    this.slow.sum += dt * 1000;
    this.slow.n++;
    if (this.slow.n < ADAPT.frames) return;
    const average = this.slow.sum / this.slow.n;
    this.slow.sum = this.slow.n = 0;
    if (average > ADAPT.slowMs && this.pixelRatio > ADAPT.floor) {
      this.pixelRatio = Math.max(ADAPT.floor, this.pixelRatio - ADAPT.step);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    // Between the wide and the upright framing by the window's shape.
    const w = FRAMING.wide;
    const n = FRAMING.tall;
    const s = THREE.MathUtils.smoothstep(1.6 - aspect, 0, 1.05);
    const mix = (a, b) => new THREE.Vector3().fromArray(a).lerp(new THREE.Vector3().fromArray(b), s);
    this.framing = { pos: mix(w.pos, n.pos), look: mix(w.look, n.look) };
    this.look = this.look || new THREE.Vector3();
    this.camera.aspect = aspect;
    this.camera.fov = w.fov + (n.fov - w.fov) * s;
    this.camera.updateProjectionMatrix();
    const buffer = height * this.renderer.getPixelRatio();
    this.uniforms.uPx.value = buffer / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.uniforms.uRes.value.set(width * this.renderer.getPixelRatio(), buffer);
    if (!this.drawing) {
      this.camera.position.copy(this.framing.pos);
      this.camera.lookAt(this.framing.look);
      this.sky.position.copy(this.camera.position);
      if (this.isReady && !this.disposed) this.render();
    }
  }

  // ---- The sky ----

  buildSky() {
    const geometry = this.own(new THREE.SphereGeometry(6000, 48, 24));
    const material = this.own(new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uFogColor: this.uniforms.uFogColor },
      defines: { OCTAVES: this.q.clouds },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w; // on the far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFogColor;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < OCTAVES; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
          return v;
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          float toCity = smoothstep(0.1, -0.9, d.z);
          vec3 zenith = vec3(0.003, 0.004, 0.010);
          vec3 mid = vec3(0.012, 0.012, 0.024);
          vec3 glow = max(uFogColor - mid, 0.0);
          float band = exp(-max(h, 0.0) * 7.0);
          vec3 col = mix(mid, zenith, smoothstep(0.02, 0.7, h));
          col += glow * band * (0.45 + 0.55 * toCity);
          // A faint red cast on the side the red light is.
          col += vec3(0.035, 0.002, 0.002) * smoothstep(0.1, 0.9, d.x) * exp(-max(h, 0.0) * 4.0);
          // A low cloud deck, lit from below by the city.
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.06) * 0.9;
            float n = fbm(uv + vec2(uTime * 0.006, uTime * 0.002));
            float cloud = smoothstep(0.42, 0.8, n) * smoothstep(0.0, 0.05, h);
            vec3 lit = glow * (1.6 * band + 0.25) * (0.5 + 0.5 * toCity) + vec3(0.006, 0.006, 0.01);
            col = mix(col, lit, cloud * 0.8);
          } else {
            col = mix(col, uFogColor, smoothstep(0.0, -0.05, h));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
    }));
    this.sky = new THREE.Mesh(geometry, material);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // ---- The rooftop ----

  buildRoof() {
    const concrete = this.own(new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.86, metalness: 0 }));
    const wetTop = this.own(new THREE.MeshStandardMaterial({ color: 0x2e2e33, roughness: 0.32, metalness: 0.05 }));
    const floor = this.own(new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.42, metalness: 0 }));
    const dark = this.own(new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.7, metalness: 0.2 }));
    const box = (w, h, d, material, x, y, z) => {
      const mesh = new THREE.Mesh(this.own(new THREE.BoxGeometry(w, h, d)), material);
      mesh.position.set(x, y + h / 2, z);
      this.scene.add(mesh);
      return mesh;
    };
    // The roof, the parapet in front of them (with a wet cap) and its return
    // on the right.
    const roof = new THREE.Mesh(this.own(new THREE.PlaneGeometry(40, 16)), floor);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(0, 0, 6.5);
    this.scene.add(roof);
    box(30, 0.28, 0.34, concrete, 0, 0, -1.05);
    box(30, 0.05, 0.42, wetTop, 0, 0.28, -1.05);
    box(0.34, 0.28, 9, concrete, 6.2, 0, 3.4);
    // The building's face below the edge, down to the street.
    box(30, -CITY.ground, 0.4, dark, 0, CITY.ground, -1.3);
    // Air-conditioning units low on the left.
    box(1.6, 0.9, 1.1, dark, -2.9, 0, -0.2);
    box(0.9, 0.5, 0.9, concrete, -1.9, 0, 0.4);
  }

  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x1b2440, 0x2a120b, 1.1));
    // Moonlight from behind, on the left: their backs, coolly.
    const moon = new THREE.DirectionalLight(0x8ea6ff, 1.1);
    moon.position.set(-5, 7, 7);
    s.add(moon);
    // The city's glow, from in front and below.
    const city = new THREE.DirectionalLight(0xff8a4a, 0.9);
    city.position.set(-1.5, -1.2, -6);
    s.add(city);
    // The red light, off to the right: rims both of them and the parapet.
    const red = new THREE.SpotLight(RED, RED_LIGHT.intensity, 16, 0.85, 0.65, 1.6);
    red.position.fromArray(RED_LIGHT.pos);
    red.target.position.fromArray(RED_LIGHT.target);
    s.add(red, red.target);
    // A weaker red along the parapet on the left.
    const spill = new THREE.PointLight(RED, 9, 10, 1.8);
    spill.position.set(-2.8, 1.5, -2.6);
    s.add(spill);
    // Their reflections: a dark sky, the city's glow ahead, the red light
    // on the right.
    this.env = makeEnvironment(this.renderer);
  }

  // ---- The city ----

  buildCity(rng) {
    const C = CITY;
    const blocks = [];
    const roadsZ = []; // roads running away from the camera: { x, from, to, big }
    const roadsX = []; // roads across: { z, from, to, big }
    const halfWidth = (z) => C.near + C.spread * Math.abs(z);
    const far = C.z0 - C.rows * C.z;
    // The streets.
    const maxI = Math.ceil(halfWidth(far) / C.x);
    for (let i = -maxI; i <= maxI; i++) {
      const x = i * C.x;
      const start = Math.min(-60, -(Math.abs(x) - C.near) / C.spread);
      if (start > far) roadsZ.push({ x, from: start, to: far, big: i % 4 === 0 });
    }
    for (let j = 1; j <= C.rows; j++) {
      const z = C.z0 - j * C.z;
      const hw = halfWidth(z);
      roadsX.push({ z, from: -hw, to: hw, big: j % 3 === 0 });
    }
    // The blocks: one to four buildings on each, some left open.
    const towersAt = (x, z) => Math.max(...C.towers.map((t) => t.k * Math.exp(-(((x - t.x) ** 2 + (z - t.z) ** 2) / (t.r * t.r)) * 1.6)));
    for (let j = C.firstRow; j <= C.rows; j++) {
      const zRoad = C.z0 - (j - 1) * C.z; // the road nearer the camera
      const hw = halfWidth(zRoad - C.z / 2);
      const n = Math.ceil(hw / C.x);
      for (let i = -n; i < n; i++) {
        const x0 = i * C.x + C.road / 2;
        const x1 = (i + 1) * C.x - C.road / 2;
        const z0 = zRoad - C.road / 2;
        const z1 = zRoad - C.z + C.road / 2;
        const tower = towersAt((x0 + x1) / 2, (z0 + z1) / 2);
        if (rng() > this.q.city && rng() > tower) continue;
        const nx = rng() < 0.45 ? 1 : 2;
        const nz = rng() < 0.3 ? 1 : rng() < 0.75 ? 2 : 3;
        for (let a = 0; a < nx; a++) {
          for (let b = 0; b < nz; b++) {
            if (rng() < 0.07) continue; // a car park, a square
            const lx0 = x0 + ((x1 - x0) * a) / nx;
            const lx1 = x0 + ((x1 - x0) * (a + 1)) / nx;
            const lz0 = z0 + ((z1 - z0) * b) / nz;
            const lz1 = z0 + ((z1 - z0) * (b + 1)) / nz;
            const inset = 1 + rng() * 3;
            let w = Math.abs(lx1 - lx0) - inset * 2;
            let d = Math.abs(lz1 - lz0) - inset * 2;
            let h = 7 + rng() ** 2 * 28;
            const tall = rng() < tower * 0.85;
            if (tall) {
              h = 45 + rng() ** 1.6 * 230 * tower + rng() * 30;
              w = Math.min(w, 22 + rng() * 22);
              d = Math.min(d, 22 + rng() * 22);
            } else if (rng() < 0.05) {
              h = 40 + rng() * 45;
            }
            if (w < 6 || d < 6) continue;
            const block = { x: (lx0 + lx1) / 2, z: (lz0 + lz1) / 2, w, d, h, y: 0, seed: rng(), office: tall || h > 40 ? 1 : 0 };
            blocks.push(block);
            // Some towers step back near the top.
            if (h > 90 && rng() < 0.55) {
              const k = 0.55 + rng() * 0.2;
              blocks.push({ ...block, w: w * k, d: d * k, y: h, h: h * (0.12 + rng() * 0.22), seed: rng() });
              block.capped = true; // (its aircraft lights go on the tier)
            }
          }
        }
      }
    }
    // Two tall residential towers across the way, on the right.
    blocks.push({ x: 330, z: -470, w: 34, d: 30, h: 196, y: 0, seed: 0.37, office: 0 });
    blocks.push({ x: 420, z: -640, w: 30, d: 36, h: 172, y: 0, seed: 0.81, office: 0 });
    this.blockCount = blocks.length;

    // The blocks: one instanced box (no floor), its windows drawn by its
    // shader.
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const geometry = this.own(dropBottom(box));
    box.dispose();
    const material = this.own(new THREE.ShaderMaterial({
      uniforms: { uFogColor: this.uniforms.uFogColor, uFog: this.uniforms.uFog, uGround: { value: C.ground } },
      defines: { HAZE: HAZE_GLSL },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        attribute float aOffice;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vSeed;
        varying float vOffice;
        varying float vTop;
        void main() {
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vNormal = normal;
          vSeed = aSeed;
          vOffice = aOffice;
          vTop = instanceMatrix[3].y + length(instanceMatrix[1].xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform float uFog;
        uniform float uGround;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vSeed;
        varying float vOffice;
        varying float vTop;
        float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        void main() {
          vec3 n = normalize(vNormal);
          float dist = length(vWorld - cameraPosition);
          float v = vWorld.y - uGround;
          vec3 col;
          if (n.y > 0.5) {
            // Roofs: dark, some a little lighter, with a lit rim on a few.
            col = vec3(0.008, 0.008, 0.011) * (0.7 + 0.8 * fract(vSeed * 23.1));
          } else {
            float u = (abs(n.x) > 0.5 ? vWorld.z : vWorld.x) + vSeed * 97.0;
            // Floors 3.4 m, windows 2.4 to 4 m apart; ribbon windows on offices.
            vec2 cellSize = vec2(2.4 + fract(vSeed * 7.3) * 1.6, 3.4);
            vec2 g = vec2(u, v) / cellSize;
            vec2 cell = floor(g);
            vec2 f = fract(g);
            vec2 fw = fwidth(g);
            float wx = mix(0.32 + 0.12 * fract(vSeed * 3.1), 0.06, vOffice * step(0.5, fract(vSeed * 5.7)));
            vec2 lo = vec2(wx, 0.28), hi = vec2(1.0 - wx, 0.84);
            vec2 m = smoothstep(lo - fw, lo + fw, f) * (1.0 - smoothstep(hi - fw, hi + fw, f));
            float mask = m.x * m.y;
            float r = hash(cell + vec2(vSeed * 41.0, n.x * 13.0 + n.z * 5.0));
            float share = mix(0.1 + 0.25 * fract(vSeed * 11.7), 0.25 + 0.3 * fract(vSeed * 2.9), vOffice);
            float on = step(r, share);
            float tone = hash(cell * 1.7 + vSeed * 19.0);
            vec3 warm = vec3(1.0, 0.6, 0.28);
            vec3 white = vec3(0.92, 0.86, 0.74);
            vec3 cool = vec3(0.55, 0.72, 1.0);
            vec3 wcol = tone < 0.62 ? warm : tone < 0.9 ? white : cool;
            wcol = mix(wcol, cool, vOffice * 0.45);
            float bright = 0.7 + 1.6 * hash(cell + 3.7);
            vec3 near = wcol * on * mask * bright;
            // Far off, a window is less than a pixel: its average instead.
            vec3 avg = mix(vec3(0.95, 0.66, 0.38), vec3(0.75, 0.82, 1.0), vOffice * 0.45) * share * (hi.x - lo.x) * (hi.y - lo.y) * 1.45;
            float blur = smoothstep(0.3, 0.9, max(fw.x, fw.y));
            vec3 win = mix(near, avg, blur);
            // Shops at street level, and nothing lit in the plant floors at the top.
            win *= step(vWorld.y, vTop - 3.0) * (1.0 + 1.5 * step(v, 4.2));
            // The facade: dark, warmer near the street, faces to the left a
            // touch lighter (the moon).
            vec3 face = vec3(0.007, 0.008, 0.012) + vec3(0.05, 0.025, 0.012) * exp(-v / 12.0);
            face += vec3(0.004, 0.005, 0.01) * step(n.x, -0.5);
            col = face + win * 0.85;
            // Tall towers: a light strip round the top.
            float crown = step(150.0, vTop - uGround) * step(vTop - 2.0, vWorld.y) * step(0.55, vSeed);
            col += crown * mix(vec3(0.4, 0.9, 1.0), vec3(1.0, 0.25, 0.2), step(0.8, vSeed)) * 1.8;
          }
          col += HAZE;
          float fog = 1.0 - exp(-pow(dist * uFog, 2.0));
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
    const seeds = new Float32Array(blocks.length);
    const office = new Float32Array(blocks.length);
    const matrix = new THREE.Matrix4();
    blocks.forEach((b, i) => {
      matrix.makeScale(b.w, b.h, b.d).setPosition(b.x, C.ground + b.y, b.z);
      mesh.setMatrixAt(i, matrix);
      seeds[i] = b.seed;
      office[i] = b.office;
    });
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute('aOffice', new THREE.InstancedBufferAttribute(office, 1));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.city = mesh;

    // The street level: dark, with a glow along the streets.
    const ground = new THREE.Mesh(this.own(new THREE.PlaneGeometry(12000, 9000)), this.own(new THREE.ShaderMaterial({
      uniforms: {
        uFogColor: this.uniforms.uFogColor, uFog: this.uniforms.uFog,
        uBlock: { value: new THREE.Vector2(C.x, C.z) }, uOrigin: { value: new THREE.Vector2(0, C.z0) }, uRoad: { value: C.road },
      },
      defines: { HAZE: HAZE_GLSL },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform float uFog;
        uniform vec2 uBlock;
        uniform vec2 uOrigin;
        uniform float uRoad;
        varying vec3 vWorld;
        void main() {
          vec2 p = vWorld.xz - uOrigin;
          vec2 d = abs(fract(p / uBlock + 0.5) - 0.5) * uBlock;
          vec2 fw = fwidth(p);
          float w = uRoad * 0.5;
          vec2 road = 1.0 - smoothstep(w - fw, w + fw, d);
          road = mix(road, vec2(uRoad) / uBlock, smoothstep(vec2(uRoad * 0.25), vec2(uRoad), fw));
          vec2 pool = exp(-d * d / 20.0);
          pool = mix(pool, vec2(sqrt(20.0 * 3.14159)) / uBlock, smoothstep(vec2(3.0), vec2(12.0), fw));
          float glow = max(road.x, road.y) * 0.35 + max(pool.x, pool.y) * 0.65;
          vec3 col = vec3(0.006, 0.006, 0.009) + vec3(0.42, 0.2, 0.08) * glow * 0.75;
          float dist = length(vWorld - cameraPosition);
          float v = vWorld.y - ${C.ground.toFixed(1)};
          col += HAZE;
          col = mix(col, uFogColor, 1.0 - exp(-pow(dist * uFog, 2.0)));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, C.ground, -4200);
    this.scene.add(ground);

    // The lights: street lamps (still), cars (moving), and the aircraft
    // lights on the towers (blinking).
    this.buildLamps(rng, roadsZ, roadsX, blocks);
    this.buildCars(rng, roadsZ, roadsX);
    this.buildBeacons(rng, blocks);
  }

  buildLamps(rng, roadsZ, roadsX) {
    const C = CITY;
    const out = [];
    const sodium = [1.0, 0.5, 0.16];
    const led = [0.78, 0.86, 1.0];
    const district = (x, z) => Math.sin(Math.floor(x / 500) * 12.9 + Math.floor(z / 600) * 78.2) > 0.25;
    const along = (road, across) => {
      const spacing = road.big ? 24 : 34;
      const len = Math.abs(road.to - road.from);
      const dir = Math.sign(road.to - road.from);
      for (let s = rng() * spacing; s < len; s += spacing) {
        for (const side of [-1, 1]) {
          const t = road.from + dir * s;
          const off = side * (C.road / 2 + 0.8);
          const x = across ? t : road.x + off;
          const z = across ? road.z + off : t;
          const color = road.big || district(x, z) ? led : sodium;
          out.push([x, C.ground + 7, z, ...color, road.big ? 4.6 : 3.8]);
        }
      }
    };
    for (const r of roadsZ) along(r, false);
    for (const r of roadsX) along(r, true);
    shuffle(out, rng);
    const list = out.slice(0, this.q.lamps);
    const position = new Float32Array(list.length * 3);
    const color = new Float32Array(list.length * 3);
    const size = new Float32Array(list.length);
    list.forEach((l, i) => {
      position.set(l.slice(0, 3), i * 3);
      color.set(l.slice(3, 6).map((c) => c * 1.5), i * 3);
      size[i] = l[6];
    });
    const geometry = this.own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const points = new THREE.Points(geometry, this.own(glowMaterial(this.uniforms, {})));
    points.frustumCulled = false;
    this.scene.add(points);
  }

  // The cars: each a light running along its lane, white coming towards
  // the camera, red going away; the avenues busiest.
  buildCars(rng, roadsZ, roadsX) {
    const C = CITY;
    const roads = [...roadsZ.map((r) => ({ ...r, across: false })), ...roadsX.map((r) => ({ ...r, across: true }))];
    const weights = roads.map((r) => Math.abs(r.to - r.from) * (r.big ? 3.2 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    const n = this.q.cars;
    const start = new Float32Array(n * 3);
    const vec = new Float32Array(n * 3);
    const speed = new Float32Array(n);
    const phase = new Float32Array(n);
    const color = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let pick = rng() * total;
      let r = roads[0];
      for (let i = 0; i < roads.length; i++) {
        pick -= weights[i];
        if (pick <= 0) { r = roads[i]; break; }
      }
      const lane = rng() < 0.5 ? -1 : 1;
      const off = lane * (r.big ? 2.2 + (rng() < 0.5 ? 0 : 3.2) : 2.4);
      let from = r.from;
      let to = r.to;
      // One side of the road goes one way, the other the other way.
      if (lane > 0) [from, to] = [to, from];
      const a = r.across ? [from, C.ground + 0.8, r.z + off] : [r.x + off, C.ground + 0.8, from];
      const b = r.across ? [to, C.ground + 0.8, r.z + off] : [r.x + off, C.ground + 0.8, to];
      start.set(a, k * 3);
      vec.set([b[0] - a[0], 0, b[2] - a[2]], k * 3);
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      speed[k] = (6 + rng() * 9) / Math.max(1, len);
      phase[k] = rng();
      // Towards the camera (+z), or across: headlights; away: tail lights.
      const towards = r.across ? rng() < 0.5 : b[2] > a[2];
      color.set(towards ? [1.7, 1.4, 1.05] : [1.9, 0.09, 0.04], k * 3);
      size[k] = towards ? 2.6 : 2.0;
    }
    const geometry = this.own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(start, 3));
    geometry.setAttribute('aVec', new THREE.BufferAttribute(vec, 3));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const points = new THREE.Points(geometry, this.own(glowMaterial(this.uniforms, { MOVING: '' })));
    points.frustumCulled = false;
    this.scene.add(points);
  }

  // Red aircraft lights on the towers (two on the tallest, one on the
  // rest), a white strobe on the very tallest, a radio mast with red lights
  // up it, the light on the roof's own mast, and a plane crossing far off.
  buildBeacons(rng, blocks) {
    const C = CITY;
    const list = [];
    const tall = blocks.filter((b) => b.y + b.h > 95 && !b.capped).sort((a, b) => b.y + b.h - (a.y + a.h));
    tall.forEach((b, i) => {
      const y = C.ground + b.y + b.h + 1.2;
      const rate = 0.45 + rng() * 0.12;
      const phase = rng();
      list.push([b.x - b.w * 0.4, y, b.z - b.d * 0.4, 2.4, 0.12, 0.06, 4.5, rate, phase]);
      if (b.y + b.h > 160) list.push([b.x + b.w * 0.4, y, b.z + b.d * 0.4, 2.4, 0.12, 0.06, 4.5, rate, phase]);
      if (i === 0) list.push([b.x, y + 4, b.z, 3.5, 3.5, 3.5, 6, 0.9, 0.5]);
    });
    const mast = { x: -1180, z: -2900, h: 330 };
    for (const y of [0.33, 0.66, 1]) list.push([mast.x, C.ground + mast.h * y, mast.z, 2.4, 0.1, 0.05, 6, 0.5, y * 0.3]);
    const position = new Float32Array(list.length * 3);
    const color = new Float32Array(list.length * 3);
    const size = new Float32Array(list.length);
    const rate = new Float32Array(list.length);
    const phase = new Float32Array(list.length);
    list.forEach((l, i) => {
      position.set(l.slice(0, 3), i * 3);
      color.set(l.slice(3, 6), i * 3);
      size[i] = l[6];
      rate[i] = l[7];
      phase[i] = l[8];
    });
    const geometry = this.own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geometry.setAttribute('aRate', new THREE.BufferAttribute(rate, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const points = new THREE.Points(geometry, this.own(glowMaterial(this.uniforms, { BLINK: '' })));
    points.frustumCulled = false;
    this.scene.add(points);
    // The radio mast itself: a thin dark line against the glow.
    const mastMesh = new THREE.Mesh(this.own(new THREE.CylinderGeometry(1.2, 3, mast.h, 4)), this.own(new THREE.MeshBasicMaterial({ color: 0x050506, fog: false })));
    mastMesh.position.set(mast.x, C.ground + mast.h / 2, mast.z);
    this.scene.add(mastMesh);

    // The plane: red and green on its wings, a white strobe.
    const plane = this.own(new THREE.BufferGeometry());
    plane.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-14, 0, 0, 14, 0, 0, 0, 0, -6]), 3));
    plane.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array([2, 0.1, 0.05, 0.1, 2, 0.4, 4, 4, 4]), 3));
    plane.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([9, 9, 12]), 1));
    plane.setAttribute('aRate', new THREE.BufferAttribute(new Float32Array([0, 0, 1.1]), 1));
    plane.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array([0.05, 0.05, 0]), 1));
    this.plane = new THREE.Points(plane, this.own(glowMaterial(this.uniforms, { BLINK: '' })));
    this.plane.frustumCulled = false;
    this.scene.add(this.plane);
  }

  // The plane goes across, high and far off, once every two minutes.
  flyPlane(t) {
    const s = (t / 120 + 0.35) % 1;
    this.plane.position.set(-2600 + 5200 * s, 520 + 40 * s, -3400 + 600 * s);
    this.plane.rotation.y = -0.12;
  }

  // ---- Out-of-focus lights and the haze over downtown ----

  buildBokeh(rng) {
    const list = [];
    // Big soft glows over the brightest parts of the city.
    for (const t of CITY.towers) {
      list.push([t.x, CITY.ground + 90, t.z, 520 * t.k, [0.5, 0.26, 0.12], 0.22, 1]);
      list.push([t.x + 200, CITY.ground + 40, t.z + 300, 380 * t.k, [0.45, 0.24, 0.14], 0.16, 1]);
    }
    // Discs: lights out over the city, out of focus (the camera is
    // focused on the soldiers).
    const colors = [[1, 0.55, 0.2], [1, 0.8, 0.55], [1, 0.12, 0.06], [0.5, 0.75, 1]];
    const count = this.quality === 'high' ? 46 : 22;
    for (let i = 0; i < count; i++) {
      const z = -(520 + rng() ** 1.3 * 900);
      const x = -z * (0.02 + rng() * 0.5) + 60;
      const y = CITY.ground + 6 + rng() * 40;
      const c = colors[Math.floor(rng() ** 1.4 * colors.length)];
      list.push([x, y, z, -z * 0.012 * (0.6 + rng()), c, 0.1 + rng() * 0.16, 0]);
    }
    const geometry = this.own(new THREE.PlaneGeometry(2, 2));
    const material = this.own(new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aSoft;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vSoft;
        void main() {
          vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          centre.xy += position.xy * length(instanceMatrix[0].xyz);
          gl_Position = projectionMatrix * centre;
          vUv = position.xy;
          vColor = aColor;
          vAlpha = aAlpha;
          vSoft = aSoft;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vSoft;
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float disc = (1.0 - smoothstep(0.6, 1.0, r)) * (0.75 + 0.25 * smoothstep(0.3, 0.9, r));
          float soft = exp(-r * r * 4.0) * (1.0 - r);
          gl_FragColor = vec4(vColor * mix(disc, soft, vSoft) * vAlpha, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    const color = new Float32Array(list.length * 3);
    const alpha = new Float32Array(list.length);
    const soft = new Float32Array(list.length);
    const m = new THREE.Matrix4();
    list.forEach((b, i) => {
      m.makeScale(b[3], b[3], b[3]).setPosition(b[0], b[1], b[2]);
      mesh.setMatrixAt(i, m);
      color.set(b[4], i * 3);
      alpha[i] = b[5];
      soft[i] = b[6];
    });
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
    geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    geometry.setAttribute('aSoft', new THREE.InstancedBufferAttribute(soft, 1));
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.scene.add(mesh);

    // The red light's glow, just off the right edge.
    const glow = new THREE.Sprite(this.own(new THREE.SpriteMaterial({
      map: this.own(glowTexture()), color: RED.clone().multiplyScalar(0.55), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    })));
    glow.position.fromArray(RED_LIGHT.pos);
    glow.scale.setScalar(5.5);
    glow.renderOrder = 6;
    this.scene.add(glow);
  }

  // ---- Rain ----

  // Light rain round the soldiers: thin streaks falling, caught red near
  // the red light.
  buildRain(rng) {
    const n = this.q.rain;
    const base = new Float32Array(n * 2 * 3);
    const end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = [-6 + rng() * 14, rng() * 7, -8 + rng() * 9];
      base.set(p, i * 6);
      base.set(p, i * 6 + 3);
      end[i * 2 + 1] = 1;
    }
    const geometry = this.own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
    geometry.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const material = this.own(new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uRed: { value: new THREE.Vector3().fromArray(RED_LIGHT.pos) } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uRed;
        attribute float aEnd;
        varying vec3 vColor;
        void main() {
          vec3 p = position;
          float speed = 7.5 + fract(p.x * 13.1 + p.z * 7.7) * 3.0;
          p.y = mod(p.y - uTime * speed, 7.0) - 1.0;
          p.x += 0.6 * (p.y - 3.0) * 0.08;
          p -= vec3(0.025, -1.0, 0.0) * aEnd * 0.2;
          float red = exp(-dot(p - uRed, p - uRed) / 10.0);
          vColor = mix(vec3(0.028, 0.03, 0.04), vec3(0.32, 0.02, 0.012), red);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    const rain = new THREE.LineSegments(geometry, material);
    rain.frustumCulled = false;
    rain.renderOrder = 7;
    this.scene.add(rain);
  }

  // ---- Grain and vignette, over everything ----

  buildPost() {
    this.postScene = new THREE.Scene();
    const geometry = this.own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const material = this.own(new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uRes: this.uniforms.uRes },
      vertexShader: /* glsl */ `
        void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec2 uRes;
        float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        void main() {
          vec2 uv = gl_FragCoord.xy / uRes;
          vec2 c = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
          float vignette = smoothstep(0.45, 1.25, length(c * vec2(0.85, 1.0)));
          float g = hash(gl_FragCoord.xy + floor(uTime * 24.0) * 37.0) - 0.5;
          // Premultiplied: lighten a touch where the grain is up, darken where it's down.
          gl_FragColor = vec4(vec3(max(g, 0.0) * 0.045), vignette * 0.7 + max(-g, 0.0) * 0.09);
        }`,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    const quad = new THREE.Mesh(geometry, material);
    quad.frustumCulled = false;
    this.postScene.add(quad);
  }

  // ---- The soldiers ----

  async addSoldiers() {
    let loaded;
    try {
      loaded = await loadSoldier();
    } catch {
      return; // no soldiers: the city alone
    }
    if (this.disposed) return;
    const { gltf } = loaded;
    const clip = gltf.animations[0];
    this.contrast = new ContrastOutfit(this.outfit);
    this.contrastWardrobe = new Wardrobe(this.contrast);
    const wardrobes = [this.wardrobe, this.contrastWardrobe];
    const ready = [];
    CAST.forEach((spot, i) => {
      const model = clone(gltf.scene);
      model.position.set(spot.x, 0, spot.z);
      model.rotation.set(0, spot.turn, 0);
      model.scale.set(1, 1, 1);
      model.traverse((o) => {
        if (o.isMesh) this.prepareMesh(o);
      });
      const mixer = new THREE.AnimationMixer(model);
      if (clip) {
        const action = mixer.clipAction(clip);
        action.time = spot.phase % clip.duration;
        action.timeScale = spot.speed;
        action.play();
      }
      mixer.update(0);
      const soldier = { model, mixer, wardrobe: wardrobes[i] };
      this.soldiers.push(soldier);
      ready.push(soldier.wardrobe.dress(model, {
        prepare: (mesh) => this.prepareMesh(mesh),
        remove: (mesh) => {
          this.retired.add(mesh.geometry);
          for (const m of [].concat(mesh.material)) for (const v of Object.values(m)) if (v && v.isTexture) this.retired.add(v);
          mesh.removeFromParent();
        },
      }).catch(() => {}));
    });
    // Their materials and textures ready before they show.
    const group = new THREE.Group();
    for (const s of this.soldiers) group.add(s.model);
    await this.renderer.compileAsync(group, this.camera, this.scene).catch(() => {});
    if (this.disposed) return;
    group.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) for (const v of Object.values(m)) if (v && v.isTexture) this.renderer.initTexture(v);
    });
    for (const s of this.soldiers) this.scene.add(s.model);
    // (Their gear may still be loading; it goes on when it's in.)
    await Promise.race([Promise.all(ready), new Promise((resolve) => setTimeout(resolve, 1500))]);
  }

  // A soldier's (or a piece of gear's) mesh: its own copies of the
  // materials (the game's are lit by the day sky), lit by this night's.
  prepareMesh(mesh) {
    const own = [].concat(mesh.material).map((m) => {
      const copy = m.clone();
      copy.envMap = this.env;
      copy.envMapIntensity = 0.75;
      if (!mesh.userData.gearPiece) this.made.materials.add(copy);
      return copy;
    });
    mesh.material = own.length === 1 ? own[0] : own;
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = false;
  }

  // ---- Freeing it all ----

  own(thing) {
    if (thing.isBufferGeometry) this.made.geometries.add(thing);
    else if (thing.isMaterial) this.made.materials.add(thing);
    else if (thing.isTexture) this.made.textures.add(thing);
    return thing;
  }

  stats() {
    const info = this.renderer.info;
    return { quality: this.quality, pixelRatio: this.pixelRatio, blocks: this.blockCount, soldiers: this.soldiers.length, calls: info.render.calls, triangles: info.render.triangles, programs: info.programs ? info.programs.length : 0 };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const renderer = this.renderer;
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointermove', this.onPointer);
    // This renderer's listeners off what it shares with the game (the
    // soldier's and his gear's geometry and textures, and three.js's own
    // lookup texture), so nothing the game keeps holds on to it: they're
    // the ones on something only this renderer drew.
    const mine = new Set();
    const listeners = (thing) => (thing && thing._listeners && thing._listeners.dispose) || [];
    for (const g of this.made.geometries) listeners(g).forEach((fn) => mine.add(fn));
    for (const t of this.made.textures) listeners(t).forEach((fn) => mine.add(fn));
    const shared = new Set(this.retired);
    for (const s of this.soldiers) {
      s.model.traverse((o) => {
        if (!o.isMesh) return;
        shared.add(o.geometry);
        for (const m of [].concat(o.material)) {
          for (const v of Object.values(m)) if (v && v.isTexture) shared.add(v);
          const uniforms = renderer.properties.get(m).uniforms;
          if (uniforms) for (const u of Object.values(uniforms)) if (u && u.value && u.value.isTexture) shared.add(u.value);
        }
      });
    }
    for (const thing of shared) {
      if (this.made.textures.has(thing) || thing === this.env) continue;
      for (const fn of listeners(thing).slice()) if (mine.has(fn)) thing.removeEventListener('dispose', fn);
    }
    // The soldiers: their gear (only the materials made for it), their own
    // bones, their materials; never the game's geometry or textures.
    for (const s of this.soldiers) {
      s.mixer.stopAllAction();
      s.mixer.uncacheRoot(s.model);
      s.wardrobe.undress(s.model);
      s.model.removeFromParent();
      s.model.traverse((o) => {
        if (o.userData.gearPiece) disposeOwnMaterials(o);
        if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
      });
    }
    this.soldiers = [];
    this.retired.clear();
    if (this.contrast) this.contrast.dispose();
    this.contrast = this.contrastWardrobe = null;
    for (const g of this.made.geometries) g.dispose();
    for (const m of this.made.materials) m.dispose();
    for (const t of this.made.textures) t.dispose();
    if (this.city) this.city.dispose();
    if (this.env) this.env.dispose();
    this.made.geometries.clear();
    this.made.materials.clear();
    this.made.textures.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    this.canvas.remove();
    this.scene = this.postScene = this.city = this.plane = this.sky = this.env = null;
  }
}

// ---- The second soldier's outfit ----

// For each slot, what the second soldier wears: the first that isn't what
// the player has on (so the two always look different).
const CONTRAST = { head: ['comms', 'field'], vest: ['black', 'olive'], gloves: ['black', 'camo'] };

// An outfit for the Wardrobe (get, onChange) that follows the player's,
// always different from it.
class ContrastOutfit {
  constructor(outfit) {
    this.outfit = outfit;
    this.listeners = [];
    this.chosen = {};
    for (const slot of SLOTS) this.chosen[slot.id] = this.pick(slot.id);
    this.onOutfit = () => {
      for (const slot of SLOTS) {
        const id = this.pick(slot.id);
        if (id === this.chosen[slot.id]) continue;
        this.chosen[slot.id] = id;
        for (const fn of this.listeners) fn(slot.id, id);
      }
    };
    outfit.onChange(this.onOutfit);
  }

  pick(slot) {
    const options = CONTRAST[slot];
    if (!options) return this.outfit.get(slot);
    return options.find((id) => id !== this.outfit.get(slot)) || options[0];
  }

  get(slot) {
    return this.chosen[slot];
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  dispose() {
    this.outfit.offChange(this.onOutfit);
    this.listeners = [];
  }
}

// ---- Helpers ----

// 'low' on a phone or tablet (a touch screen, or a small one), else 'high'.
function pickQuality() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.screen.width || 1920, window.screen.height || 1080) < 600;
  return coarse || small ? 'low' : 'high';
}

// A light seen as a soft point: a bright core and a faint halo, never
// smaller than a couple of pixels (smaller ones dim instead), dimmer in the
// haze. MOVING: it runs along aVec (from `position`) at aSpeed (lengths a
// second) from aPhase, fading in and out at the ends. BLINK: it flashes
// aRate times a second from aPhase.
function glowMaterial(uniforms, defines) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uPx: uniforms.uPx, uFog: uniforms.uFog },
    defines,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPx;
      uniform float uFog;
      attribute vec3 aColor;
      attribute float aSize;
      #ifdef MOVING
      attribute vec3 aVec;
      attribute float aSpeed;
      attribute float aPhase;
      #endif
      #ifdef BLINK
      attribute float aRate;
      attribute float aPhase;
      #endif
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float alpha = 1.0;
        #ifdef MOVING
        float s = fract(aPhase + uTime * aSpeed);
        p += aVec * s;
        alpha = smoothstep(0.0, 0.03, s) * (1.0 - smoothstep(0.97, 1.0, s));
        #endif
        #ifdef BLINK
        float b = fract(uTime * aRate + aPhase);
        alpha = smoothstep(0.0, 0.03, b) * (1.0 - smoothstep(0.1, 0.24, b));
        #endif
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 0.1);
        float px = aSize * uPx / dist;
        float size = max(px, 1.6);
        float fog = exp(-pow(dist * uFog, 2.0));
        vAlpha = alpha * min(1.0, (px * px) / (size * size)) * mix(0.3, 1.0, fog);
        vColor = aColor;
        gl_PointSize = min(size * 3.0, 64.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        float light = exp(-r2 * 16.0) + exp(-r2 * 4.0) * 0.18;
        gl_FragColor = vec4(vColor * light * vAlpha, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

// A soft round glow (for the red light's sprite).
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The soldiers' reflections: a dark night sky, the city's warm glow along
// the horizon ahead (−Z), the red light ahead on the right, darker below.
function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 48, 24);
  const position = dome.attributes.position;
  const colors = [];
  const c = new THREE.Color();
  const d = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    d.fromBufferAttribute(position, i).normalize();
    const up = d.y;
    c.setRGB(0.012, 0.014, 0.03);
    if (up > 0) c.lerp(new THREE.Color(0.004, 0.005, 0.014), Math.min(1, up * 1.5));
    else c.lerp(new THREE.Color(0.01, 0.008, 0.008), Math.min(1, -up * 3));
    const ahead = Math.max(0, -d.z);
    c.add(new THREE.Color(0.32, 0.15, 0.07).multiplyScalar(Math.exp(-Math.abs(up) * 6) * ahead));
    const red = Math.max(0, d.dot(new THREE.Vector3(0.75, 0.25, -0.6).normalize()));
    c.add(new THREE.Color(1.6, 0.06, 0.03).multiplyScalar(red ** 12));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
  scene.add(new THREE.Mesh(dome, material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0).texture;
  pmrem.dispose();
  dome.dispose();
  material.dispose();
  return texture;
}

// A box with no bottom face (never seen; a sixth fewer triangles).
function dropBottom(box) {
  const index = box.index.array;
  const keep = [];
  for (let g = 0; g < box.groups.length; g++) {
    if (g === 3) continue; // BoxGeometry's groups: +x, -x, +y, -y, +z, -z
    const { start, count } = box.groups[g];
    for (let k = start; k < start + count; k++) keep.push(index[k]);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', box.attributes.position.clone());
  out.setAttribute('normal', box.attributes.normal.clone());
  out.setIndex(keep);
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
