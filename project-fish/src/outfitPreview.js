// The Outfit menu's picture of the player: the soldier in the chosen outfit,
// standing in his idle pose and slowly turning (drag to turn him yourself),
// framed head to toe, or close up on his head or hands.
//
// It has its own small renderer and canvas, made the first time the menu
// shows it, and draws only while it's on screen: closed, it costs nothing a
// frame. Its copy of the soldier (src/soldier.js) is dressed by the same
// Wardrobe as the player (src/gear.js), so it changes the moment a choice
// is made.

import * as THREE from 'three';
import { loadSoldier } from './soldier.js';
import { outdoorEnvironment, SOLDIER_SKY, SUN_DIRECTION } from './world.js';

// Where the camera looks and how much it shows (metres of him, up and
// across, at least), for each framing; and how fast he turns by himself (radians a
// second), and how long after a drag before he does again (seconds).
export const VIEWS = {
  full: { name: 'Full', target: [0, 0.93, 0], height: 2.0, width: 1.0 },
  head: { name: 'Head', target: [0, 1.64, 0], height: 0.48, width: 0.42 },
  hands: { name: 'Gloves', target: 'hands', height: 0.5, width: 0.42 },
};
const TURN = { speed: 0.35, pause: 2.5, start: 0.5 };
const FOV = 26;

export class OutfitPreview {
  constructor(wardrobe) {
    this.wardrobe = wardrobe;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'avatar';
    this.canvas.setAttribute('aria-label', 'Your soldier in this outfit (drag to turn him)');
    this.view = 'full';
    this.turn = TURN.start; // his turn about the vertical (radians)
    this.idle = 0; // seconds since the last drag
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
      this.turn += ((e.clientX - this.dragging.x) / Math.max(1, this.canvas.clientWidth)) * Math.PI * 1.5;
      this.dragging.x = e.clientX;
      this.idle = 0;
    });
    const stop = (e) => {
      if (this.dragging && e.pointerId === this.dragging.id) this.dragging = null;
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
  }

  // The renderer, his copy and the little stage he stands on (once).
  setUp() {
    if (this.renderer) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch {
      return false; // no second WebGL canvas: the menu works without the picture
    }
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 20);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5a5a, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 10 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    // A soft shadow on the floor under him.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.sky = outdoorEnvironment(r, SUN_DIRECTION);
    this.focus = new THREE.Vector3(...VIEWS.full.target);
    this.height = VIEWS.full.height;
    this.width = VIEWS.full.width;
    this.last = 0;
    loadSoldier().then(({ gltf, preview }) => {
      const model = preview;
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      // His materials, lit by this renderer's own sky (one made by the game's
      // renderer can't be used here).
      model.traverse((o) => {
        if (o.isMesh) this.prepare(o);
      });
      this.model = model;
      this.hand = findBone(model, 'CC_Base_R_Hand');
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

  prepare(mesh) {
    const own = [].concat(mesh.material).map((m) => Object.assign(m.clone(), { envMap: this.sky, envMapIntensity: SOLDIER_SKY }));
    mesh.material = own.length === 1 ? own[0] : own;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  }

  // Shows close up on part of him (a key of VIEWS).
  setView(view) {
    if (VIEWS[view]) this.view = view;
  }

  // Draws every frame while it's on screen (call when the menu shows it).
  start() {
    if (this.running || !this.setUp()) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // Stops drawing (the menu closed, or went to another tab).
  stop() {
    this.running = false;
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
    if (this.size !== `${width}x${height}`) {
      this.size = `${width}x${height}`;
      r.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    if (this.mixer) this.mixer.update(dt);
    this.idle += dt;
    if (!this.dragging && this.idle > TURN.pause) this.turn += TURN.speed * dt;
    if (this.model) {
      this.model.rotation.y = this.turn;
      this.model.updateMatrixWorld(true);
    }
    // Ease the framing towards the chosen view.
    const view = VIEWS[this.view];
    const target = new THREE.Vector3();
    if (view.target === 'hands') {
      // (His right hand; its middle, a little past the wrist.)
      if (this.hand) target.copy(this.hand.getWorldPosition(new THREE.Vector3())).y -= 0.05;
      else target.set(-0.4, 0.95, 0);
    } else {
      target.set(...view.target);
    }
    const k = 1 - Math.exp(-dt * 6);
    this.focus.lerp(target, k);
    this.height += (view.height - this.height) * k;
    this.width += (view.width - this.width) * k;
    // Far enough back to show that much of him, a little above, looking
    // slightly down.
    const halfTan = Math.tan((FOV * Math.PI) / 360);
    const fit = Math.max(this.height / 2, this.width / 2 / this.camera.aspect);
    const distance = fit / halfTan;
    this.camera.position.set(this.focus.x, this.focus.y + distance * 0.12, this.focus.z + distance);
    this.camera.lookAt(this.focus);
    r.render(this.scene, this.camera);
  }
}

function findBone(model, name) {
  let found = null;
  model.traverse((o) => {
    if (!found && o.isBone && o.name.replace(/_\d+$/, '') === name) found = o;
  });
  return found;
}
