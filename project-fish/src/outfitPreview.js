// The loadout menu's stage: the player's soldier, big, in the chosen outfit,
// standing in his idle clip in a dark studio: a cool key light from the
// front left (casting his soft shadow on the floor), a red rim light from
// behind on the right, a faint cool rim on the left, and dark reflections
// with the same colours. The page draws the dark backdrop behind the
// canvas (src/loadout.css). Drag to turn him; let go and he turns back to
// stand three-quarters on after a moment. Each framing (FRAMINGS) is how
// much of him shows and where the camera looks; the menu picks one for
// each tab and slot, and the camera eases between them.
//
// It has its own renderer and canvas, made the first time the menu shows
// it, and draws only while it's on screen: closed, it costs nothing a
// frame. Its copy of the soldier (src/soldier.js) is dressed by the same
// Wardrobe as the player (src/gear.js), so it changes the moment a choice
// is made.

import * as THREE from 'three';
import { loadSoldier } from './soldier.js';

// target: where the camera looks (metres; he stands at the origin facing
// +Z); height: how much of him shows from top to bottom (at least `width`
// across); turn: how he stands when left alone (radians; + shows his right
// side, where his gun hand is).
export const FRAMINGS = {
  full: { target: [0, 0.92, 0], height: 2.12, width: 0.9, turn: 0.32 },
  outfit: { target: [0, 1.2, 0], height: 1.56, width: 0.84, turn: 0.38 },
  head: { target: [0, 1.28, 0], height: 1.44, width: 0.78, turn: 0.46 },
  vest: { target: [0, 1.2, 0], height: 1.56, width: 0.84, turn: 0.3 },
  gloves: { target: [0, 1.1, 0], height: 1.56, width: 0.9, turn: 0.78 },
};
const TURN = { pause: 2.8, ease: 1.6 }; // seconds before he turns back after a drag, and how quickly
const FOV = 24;
const target = new THREE.Vector3(); // (scratch, each frame)

export class OutfitPreview {
  constructor(wardrobe) {
    this.wardrobe = wardrobe;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'avatar';
    this.canvas.setAttribute('aria-label', 'Your soldier in this outfit (drag to turn him)');
    this.framing = 'full';
    this.turn = FRAMINGS.full.turn; // his turn about the vertical (radians)
    this.idle = TURN.pause; // seconds since the last drag
    this.running = false;
    this.renderer = null;
    this.frame = this.frame.bind(this);
    this.dragging = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = { x: e.clientX, id: e.pointerId };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this.dragging.id) return;
      this.turn += ((e.clientX - this.dragging.x) / Math.max(320, Math.min(this.canvas.clientWidth, 900))) * Math.PI * 1.4;
      this.dragging.x = e.clientX;
      this.idle = 0;
    });
    const stop = (e) => {
      if (this.dragging && e.pointerId === this.dragging.id) this.dragging = null;
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
  }

  // The renderer, his copy and the studio (once).
  setUp() {
    if (this.renderer) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch {
      return false; // no second WebGL canvas: the menu works without the picture
    }
    const r = this.renderer;
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 30);
    this.buildStudio();
    const f = FRAMINGS[this.framing];
    this.focus = new THREE.Vector3(...f.target);
    this.height = f.height;
    this.width = f.width;
    this.last = 0;
    loadSoldier().then(({ gltf, preview }) => {
      const model = preview;
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      // His materials, lit by this studio's reflections (one made by the
      // game's renderer can't be used here).
      model.traverse((o) => {
        if (o.isMesh) this.prepare(o);
      });
      this.model = model;
      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(model);
        this.mixer.clipAction(gltf.animations[0]).play();
      }
      this.scene.add(model);
      this.wardrobe.dress(model, { prepare: (mesh) => this.prepare(mesh) });
    }).catch(() => {
      // No soldier: the menu works without the picture.
    });
    return true;
  }

  // The lights, the floor and the reflections.
  buildStudio() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x33405a, 0x0b0a0c, 0.55));
    // The key: cool, from the front left and above, casting his shadow.
    const key = new THREE.SpotLight(0xd4e0ff, 60, 14, 0.42, 0.75, 1.6);
    key.position.set(-2.4, 4.2, 3.6);
    key.target.position.set(0, 0.9, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 6;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 10;
    // The red rim, from behind on the right.
    const rim = new THREE.SpotLight(0xff2414, 85, 12, 0.5, 0.6, 1.4);
    rim.position.set(2.2, 2.4, -3.6);
    rim.target.position.set(0, 1.1, 0);
    // A faint cool rim from behind on the left, and a low red kick on the right.
    const back = new THREE.SpotLight(0x7f9cff, 26, 12, 0.5, 0.7, 1.4);
    back.position.set(-2.8, 2.4, -2.4);
    back.target.position.set(0, 1.2, 0);
    const kick = new THREE.PointLight(0xc4180e, 1.2, 6, 1.6);
    kick.position.set(1.8, 0.35, 0.8);
    s.add(key, key.target, rim, rim.target, back, back.target, kick);
    // The floor: his soft shadow, a darker contact shadow under his feet,
    // and a faint pool of the key light round him.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.contact = radialTexture([[0, 'rgba(0,0,0,0.75)'], [0.45, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
    this.pool = radialTexture([[0, 'rgba(150,170,205,0.22)'], [0.5, 'rgba(110,125,160,0.08)'], [1, 'rgba(0,0,0,0)']]);
    const disc = (texture, size, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      s.add(m);
      return m;
    };
    disc(this.pool, 4.2, 0.001);
    disc(this.contact, 1.15, 0.002);
    this.env = studioEnvironment(this.renderer);
  }

  prepare(mesh) {
    const own = [].concat(mesh.material).map((m) => Object.assign(m.clone(), { envMap: this.env, envMapIntensity: 1 }));
    mesh.material = own.length === 1 ? own[0] : own;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  }

  // Frames him another way (a key of FRAMINGS); he turns to stand as it
  // has him once he's been let go of for a moment.
  setFraming(name) {
    if (FRAMINGS[name]) this.framing = name;
  }

  // Draws every frame while it's on screen (call when the menu shows it).
  start() {
    if (this.running || !this.setUp()) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // Stops drawing (the menu closed, or something covers him).
  stop() {
    this.running = false;
    this.dragging = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  frame() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    // (Taken off the page: stop.)
    if (!this.canvas.isConnected) {
      this.stop();
      return;
    }
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.render(dt);
  }

  // One frame: dt seconds on.
  render(dt) {
    const r = this.renderer;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    // (Fewer pixels on a big screen: at most about 6.5 million drawn.)
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6.5e6 / (width * height)));
    const size = `${width}x${height}@${ratio.toFixed(2)}`;
    if (this.size !== size) {
      this.size = size;
      r.setPixelRatio(ratio);
      r.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    if (this.mixer) this.mixer.update(dt);
    const f = FRAMINGS[this.framing];
    this.idle += dt;
    if (!this.dragging && this.idle > TURN.pause) {
      // Back to how this framing has him, the short way round.
      const off = THREE.MathUtils.euclideanModulo(f.turn - this.turn + Math.PI, 2 * Math.PI) - Math.PI;
      this.turn += off * (1 - Math.exp(-dt * TURN.ease));
    }
    if (this.model) {
      this.model.rotation.y = this.turn;
      this.model.updateMatrixWorld(true);
    }
    // Ease the framing towards the chosen one.
    target.set(...f.target);
    const k = 1 - Math.exp(-dt * 4.5);
    this.focus.lerp(target, k);
    this.height += (f.height - this.height) * k;
    this.width += (f.width - this.width) * k;
    // Far enough back to show that much of him, a little above, looking
    // slightly down.
    const halfTan = Math.tan((FOV * Math.PI) / 360);
    const fit = Math.max(this.height / 2, this.width / 2 / this.camera.aspect);
    const distance = fit / halfTan;
    this.camera.position.set(this.focus.x, this.focus.y + distance * 0.07, this.focus.z + distance);
    this.camera.lookAt(this.focus);
    r.render(this.scene, this.camera);
  }
}

// A soft round spot (a canvas gradient) for the floor.
function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gradient = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, colour] of stops) gradient.addColorStop(at, colour);
  g.fillStyle = gradient;
  g.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// His reflections: a dark studio, a cool glow where the key light is (front
// left, above), red behind on the right, near black below.
function studioEnvironment(renderer) {
  const scene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 48, 24);
  const position = dome.attributes.position;
  const colours = [];
  const c = new THREE.Color();
  const d = new THREE.Vector3();
  const keyAt = new THREE.Vector3(-2.4, 3.2, 3.6).normalize();
  const rimAt = new THREE.Vector3(2.2, 1.4, -3.6).normalize();
  const backAt = new THREE.Vector3(-2.8, 1.8, -2.4).normalize();
  for (let i = 0; i < position.count; i++) {
    d.fromBufferAttribute(position, i).normalize();
    c.setRGB(0.018, 0.02, 0.026);
    if (d.y < 0) c.multiplyScalar(Math.max(0.25, 1 + d.y * 1.5));
    c.add(new THREE.Color(0.55, 0.62, 0.78).multiplyScalar(Math.max(0, d.dot(keyAt)) ** 10 * 1.4));
    c.add(new THREE.Color(1.2, 0.08, 0.04).multiplyScalar(Math.max(0, d.dot(rimAt)) ** 12 * 1.6));
    c.add(new THREE.Color(0.3, 0.38, 0.7).multiplyScalar(Math.max(0, d.dot(backAt)) ** 14 * 0.8));
    colours.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
  scene.add(new THREE.Mesh(dome, material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0).texture;
  pmrem.dispose();
  dome.dispose();
  material.dispose();
  return texture;
}
