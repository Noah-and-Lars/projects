// The muzzle flash on the first-person gun.
//
// A real pistol's flash in daylight is a brief, irregular fireball of hot gas
// at the muzzle, a short flame plume forward, and a few sparks of burning
// powder. It's different every shot, lasts a couple of frames, and lights the
// hands and slide orange for an instant.

import * as THREE from 'three';

const DURATION = 0.035; // seconds the fireball shows
const EMBER_LIFE = [0.05, 0.12]; // seconds
const VARIANTS = 4;

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A soft blob of glowing gas.
function blob(g, x, y, r, core, edge) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, core);
  grad.addColorStop(1, edge);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// The fireball seen from behind: lumpy, hottest in the middle, ragged at the edge.
function fireballTexture() {
  return canvasTexture(256, 256, (g, w) => {
    const c = w / 2;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 1.6) * c * 0.55;
      const r = c * (0.12 + Math.random() * 0.22);
      blob(g, c + Math.cos(a) * d, c + Math.sin(a) * d, r, `rgba(255,${120 + Math.random() * 60 | 0},40,0.22)`, 'rgba(255,80,20,0)');
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * c * 0.18;
      blob(g, c + Math.cos(a) * d, c + Math.sin(a) * d, c * (0.08 + Math.random() * 0.12), 'rgba(255,235,170,0.5)', 'rgba(255,170,60,0)');
    }
    blob(g, c, c, c * 0.16, 'rgba(255,255,235,0.95)', 'rgba(255,210,120,0)');
  });
}

// The flame plume seen from the side: hot at the muzzle, breaking up as it goes.
function plumeTexture() {
  return canvasTexture(256, 64, (g, w, h) => {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 22; i++) {
      const t = Math.pow(Math.random(), 0.8);
      const x = w * (0.04 + t * 0.8);
      const y = h / 2 + (Math.random() - 0.5) * h * 0.35 * t;
      const r = h * (0.32 - t * 0.2) * (0.6 + Math.random() * 0.6);
      const hot = 1 - t;
      blob(g, x, y, r, `rgba(255,${130 + hot * 100 | 0},${40 + hot * 80 | 0},${0.18 + hot * 0.3})`, 'rgba(255,90,20,0)');
    }
    blob(g, w * 0.05, h / 2, h * 0.35, 'rgba(255,250,220,0.9)', 'rgba(255,200,110,0)');
  });
}

function emberTexture() {
  return canvasTexture(32, 32, (g, w) => blob(g, w / 2, w / 2, w / 2, 'rgba(255,230,160,1)', 'rgba(255,140,40,0)'));
}

export class MuzzleFlash {
  // muzzle: [x, y, z] in gun space.
  constructor(muzzle) {
    this.muzzle = new THREE.Vector3(...muzzle);
    this.group = new THREE.Group();
    this.group.position.copy(this.muzzle);
    this.group.visible = false;
    const additive = (map) => new THREE.MeshBasicMaterial({
      map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    this.fireballs = Array.from({ length: VARIANTS }, () => additive(fireballTexture()));
    this.plumes = Array.from({ length: VARIANTS }, () => additive(plumeTexture()));
    // The gas fireball is several centimetres across: from behind, it bursts out
    // round the front of the slide.
    this.ball = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), this.fireballs[0]);
    this.ball.position.z = -0.02;
    const plume = new THREE.PlaneGeometry(0.075, 0.019).translate(0.0375, 0, 0).rotateY(Math.PI / 2);
    this.flames = [new THREE.Mesh(plume, this.plumes[0]), new THREE.Mesh(plume, this.plumes[1])];
    this.flames[1].rotation.z = Math.PI / 2;
    this.group.add(this.ball, ...this.flames);

    // Burning powder sparks flying out of the muzzle.
    this.embers = [];
    this.emberMaterial = new THREE.SpriteMaterial({ map: emberTexture(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true });
    for (let i = 0; i < 10; i++) {
      const sprite = new THREE.Sprite(this.emberMaterial.clone());
      sprite.visible = false;
      this.embers.push({ sprite, velocity: new THREE.Vector3(), age: 1, life: 1 });
    }

    // Always in the scene (switching lights on and off would make three.js rebuild its shaders).
    this.light = new THREE.PointLight(0xff9a4a, 0, 1.4, 2);
    this.light.position.set(muzzle[0], muzzle[1] + 0.02, muzzle[2] + 0.06);
    this.time = DURATION;
    this.strength = 1;
  }

  // Moves the flash to another muzzle (gun space), such as a suppressor's
  // front. A suppressor (suppressed) leaves only a faint flicker.
  setMuzzle(muzzle, suppressed = false) {
    this.muzzle.set(...muzzle);
    this.group.position.copy(this.muzzle);
    this.light.position.set(muzzle[0], muzzle[1] + 0.02, muzzle[2] + 0.06);
    this.suppressed = suppressed;
  }

  // Adds the flash, sparks and light to the pistol model.
  attachTo(pistol) {
    pistol.add(this.group, this.light, ...this.embers.map((e) => e.sprite));
  }

  fire() {
    this.time = 0;
    // Every shot is a little different, and now and then barely visible.
    this.strength = Math.random() < 0.15 ? 0.45 : 0.75 + Math.random() * 0.35;
    if (this.suppressed) this.strength *= 0.12;
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    this.ball.material = pick(this.fireballs);
    this.ball.rotation.z = Math.random() * Math.PI * 2;
    this.ball.scale.setScalar(0.75 + Math.random() * 0.5);
    for (const f of this.flames) {
      f.material = pick(this.plumes);
      f.scale.set(0.6 + Math.random() * 0.7, 0.7 + Math.random() * 0.5, 1);
    }
    this.group.rotation.z = Math.random() * Math.PI;
    // Full on straight away: the shot's own frame is drawn before the next
    // update.
    this.group.visible = true;
    this.ball.material.opacity = this.strength;
    for (const f of this.flames) f.material.opacity = this.strength * 0.9;
    this.light.intensity = 0.5 * this.strength;
    for (const e of this.embers) {
      if (Math.random() < (this.suppressed ? 0.95 : 0.4)) continue;
      e.age = 0;
      e.life = EMBER_LIFE[0] + Math.random() * (EMBER_LIFE[1] - EMBER_LIFE[0]);
      e.velocity.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 1.0, -(2 + Math.random() * 4));
      e.sprite.position.copy(this.muzzle);
      // (Its size and brightness as it starts, so it isn't drawn a whole
      // metre across in the shot's own frame, before update has sized it.)
      e.sprite.scale.setScalar(0.0035);
      e.sprite.material.opacity = 1;
      e.sprite.visible = true;
    }
  }

  update(dt) {
    this.time += dt;
    // Full on the first frame, then gone fast.
    const t = this.time / DURATION;
    const k = t >= 1 ? 0 : (1 - t) * (1 - t) * this.strength;
    this.group.visible = k > 0;
    this.ball.material.opacity = k;
    for (const f of this.flames) f.material.opacity = k * 0.9;
    this.light.intensity = 0.5 * k;
    for (const e of this.embers) {
      if (!e.sprite.visible) continue;
      e.age += dt;
      if (e.age >= e.life) {
        e.sprite.visible = false;
        continue;
      }
      e.sprite.position.addScaledVector(e.velocity, dt);
      e.sprite.material.opacity = 1 - e.age / e.life;
      e.sprite.scale.setScalar(0.0035 * (1 - (0.5 * e.age) / e.life));
    }
  }
}
