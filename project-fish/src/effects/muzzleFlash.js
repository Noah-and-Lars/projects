// The muzzle flash on the first-person gun: a hot star-shaped burst facing
// the shooter, two "petals" along the barrel so it reads from the side, and a
// light that lights the hands and slide for a moment.

import * as THREE from 'three';

const DURATION = 0.05; // seconds

function flashTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const c = size / 2;
  // Spikes of light.
  g.translate(c, c);
  for (let i = 0; i < 9; i++) {
    g.rotate((Math.PI * 2) / 9 + Math.random() * 0.3);
    const length = c * (0.55 + Math.random() * 0.45);
    const spike = g.createLinearGradient(0, 0, length, 0);
    spike.addColorStop(0, 'rgba(255,240,200,0.9)');
    spike.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = spike;
    g.beginPath();
    g.moveTo(0, -size * 0.03);
    g.lineTo(length, 0);
    g.lineTo(0, size * 0.03);
    g.fill();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  // White-hot core fading to orange.
  const core = g.createRadialGradient(c, c, 0, c, c, c * 0.6);
  core.addColorStop(0, 'rgba(255,255,240,1)');
  core.addColorStop(0.25, 'rgba(255,220,150,0.9)');
  core.addColorStop(0.6, 'rgba(255,140,50,0.35)');
  core.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function petalTexture() {
  const w = 256, h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(w * 0.08, h / 2, 0, w * 0.08, h / 2, w * 0.9);
  grad.addColorStop(0, 'rgba(255,245,210,1)');
  grad.addColorStop(0.3, 'rgba(255,190,90,0.7)');
  grad.addColorStop(1, 'rgba(255,110,30,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(w * 0.45, h / 2, w * 0.45, h * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class MuzzleFlash {
  // muzzle: [x, y, z] in gun space.
  constructor(muzzle) {
    this.group = new THREE.Group();
    this.group.position.set(...muzzle);
    this.group.visible = false;
    const additive = (map) => new THREE.MeshBasicMaterial({
      map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    this.star = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), additive(flashTexture()));
    this.star.position.z = -0.006;
    const petalMaterial = additive(petalTexture());
    const petal = new THREE.PlaneGeometry(0.09, 0.022).translate(0.045, 0, 0).rotateY(Math.PI / 2);
    this.petals = [new THREE.Mesh(petal, petalMaterial), new THREE.Mesh(petal, petalMaterial)];
    this.petals[1].rotation.z = Math.PI / 2;
    this.group.add(this.star, ...this.petals);
    // Always in the scene (switching lights on and off would make three.js rebuild its shaders).
    this.light = new THREE.PointLight(0xffb066, 0, 1.6, 2);
    this.light.position.set(muzzle[0], muzzle[1] + 0.02, muzzle[2] + 0.05);
    this.time = DURATION;
  }

  // Adds the flash and its light to the pistol model.
  attachTo(pistol) {
    pistol.add(this.group, this.light);
  }

  fire() {
    this.time = 0;
    this.star.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 0.5;
    this.star.scale.setScalar(s);
    for (const p of this.petals) p.scale.set(0.7 + Math.random() * 0.6, 0.8 + Math.random() * 0.4, 1);
    this.group.rotation.z = Math.random() * Math.PI;
  }

  update(dt) {
    this.time += dt;
    const k = Math.max(0, 1 - this.time / DURATION);
    this.group.visible = k > 0;
    this.star.material.opacity = k;
    this.petals[0].material.opacity = k;
    this.light.intensity = 0.9 * k * k;
  }
}
