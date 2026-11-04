// Effects out in the world: the flash lighting up the surroundings, smoke
// from the muzzle, spent brass bouncing on the ground, and bullet impacts
// (a puff of dust and a hole left behind).

import * as THREE from 'three';
import { playCasing } from './audio.js';

const GRAVITY = 9.8;

function softDot(inner = 'rgba(255,255,255,1)') {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function bulletHoleTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const c = size / 2;
  // Scorched, chipped ring around a dark hole.
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = c * (0.25 + Math.random() * 0.55);
    g.fillStyle = `rgba(30,28,25,${0.15 + Math.random() * 0.25})`;
    g.beginPath();
    g.arc(c + Math.cos(a) * r * 0.6, c + Math.sin(a) * r * 0.6, c * (0.05 + Math.random() * 0.12), 0, Math.PI * 2);
    g.fill();
  }
  const ring = g.createRadialGradient(c, c, 0, c, c, c * 0.75);
  ring.addColorStop(0, 'rgba(8,8,8,1)');
  ring.addColorStop(0.28, 'rgba(12,11,10,0.95)');
  ring.addColorStop(0.45, 'rgba(45,42,38,0.6)');
  ring.addColorStop(1, 'rgba(60,56,50,0)');
  g.fillStyle = ring;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class WorldEffects {
  constructor(scene) {
    this.scene = scene;

    // The flash lights up the surroundings for a moment.
    this.flashLight = new THREE.PointLight(0xffb066, 0, 9, 2);
    scene.add(this.flashLight);
    this.flashTime = 1;

    // Smoke and dust: soft round sprites.
    this.puffTexture = softDot();
    this.puffs = [];

    // Spent cases: little brass tubes.
    this.caseGeometry = new THREE.CylinderGeometry(0.0049, 0.0049, 0.019, 12);
    // Not fully metallic: the world has no reflections for pure metal to show, so it would look black.
    this.caseMaterial = new THREE.MeshStandardMaterial({ color: 0xd4a84e, metalness: 0.35, roughness: 0.35 });
    this.cases = [];

    // Bullet holes.
    this.holeGeometry = new THREE.PlaneGeometry(0.03, 0.03);
    this.holeMaterial = new THREE.MeshBasicMaterial({
      map: bulletHoleTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.holes = [];
  }

  flash(position) {
    this.flashLight.position.copy(position);
    this.flashTime = 0;
  }

  // A soft sprite that grows and fades.
  puff(position, velocity, { color, opacity, size, grow, life, drag = 2, rise = 0 }) {
    const material = new THREE.SpriteMaterial({ map: this.puffTexture, color, transparent: true, opacity, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    this.scene.add(sprite);
    this.puffs.push({ sprite, velocity: velocity.clone(), opacity, size, grow, life, age: 0, drag, rise });
    if (this.puffs.length > 120) this.removePuff(0);
  }

  removePuff(i) {
    const p = this.puffs[i];
    this.scene.remove(p.sprite);
    p.sprite.material.dispose();
    this.puffs.splice(i, 1);
  }

  // A wisp of smoke drifting away from the muzzle.
  smoke(position, forward) {
    for (let i = 0; i < 3; i++) {
      const v = forward.clone().multiplyScalar(0.4 + Math.random() * 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.1 + Math.random() * 0.15, (Math.random() - 0.5) * 0.15));
      this.puff(position.clone().addScaledVector(forward, i * 0.02), v, { color: 0xb8b8b4, opacity: 0.16, size: 0.04, grow: 0.25, life: 1.1 + Math.random() * 0.6, drag: 2.5, rise: 0.12 });
    }
  }

  // A thin curl of smoke off a hot barrel. heat: 0..1, how hot.
  barrelSmoke(position, heat) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.05 + Math.random() * 0.06, (Math.random() - 0.5) * 0.04);
    this.puff(position, v, { color: 0xc9c9c4, opacity: 0.05 + 0.09 * heat, size: 0.012, grow: 0.05, life: 1.6 + Math.random() * 1.0, drag: 0.8, rise: 0.04 });
  }

  // A spent case flying out of the ejection port.
  ejectCase(position, velocity) {
    const mesh = new THREE.Mesh(this.caseGeometry, this.caseMaterial);
    mesh.position.copy(position);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40);
    this.cases.push({ mesh, velocity: velocity.clone(), spin, age: 0, bounces: 0, resting: false });
    if (this.cases.length > 40) {
      this.scene.remove(this.cases[0].mesh);
      this.cases.shift();
    }
  }

  // Where a bullet hit: a hole and a puff of dust (and a few grains of grit).
  impact(hit, color) {
    const normal = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
    const point = new THREE.Vector3(hit.x, hit.y, hit.z);
    const hole = new THREE.Mesh(this.holeGeometry, this.holeMaterial);
    hole.position.copy(point).addScaledVector(normal, 0.001);
    hole.lookAt(point.clone().add(normal));
    hole.rotateZ(Math.random() * Math.PI * 2);
    hole.scale.setScalar(0.8 + Math.random() * 0.4);
    this.scene.add(hole);
    this.holes.push(hole);
    if (this.holes.length > 80) this.scene.remove(this.holes.shift());

    for (let i = 0; i < 7; i++) {
      const v = normal.clone().multiplyScalar(0.6 + Math.random() * 1.4)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(0.9));
      this.puff(point.clone().addScaledVector(normal, 0.02), v, { color, opacity: 0.45, size: 0.05 + Math.random() * 0.05, grow: 0.35, life: 0.5 + Math.random() * 0.5, drag: 4 });
    }
    for (let i = 0; i < 5; i++) {
      const v = normal.clone().multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(2));
      this.puff(point.clone(), v, { color: 0x5a564e, opacity: 0.9, size: 0.012, grow: 0, life: 0.35, drag: 0.5, rise: -GRAVITY });
    }
  }

  update(dt) {
    this.flashTime += dt;
    const f = Math.max(0, 1 - this.flashTime / 0.06);
    this.flashLight.intensity = 6 * f * f;

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.removePuff(i);
        continue;
      }
      p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
      p.velocity.y += p.rise * dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      const t = p.age / p.life;
      p.sprite.scale.setScalar(p.size + p.grow * p.age);
      p.sprite.material.opacity = p.opacity * (1 - t) * Math.min(1, p.age * 30);
    }

    for (const c of this.cases) {
      c.age += dt;
      if (c.resting) continue;
      c.velocity.y -= GRAVITY * dt;
      c.mesh.position.addScaledVector(c.velocity, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.mesh.position.y < 0.005 && c.velocity.y < 0) {
        c.mesh.position.y = 0.005;
        const speed = -c.velocity.y;
        playCasing(Math.min(1, speed / 3));
        c.velocity.y = speed * 0.35;
        c.velocity.x *= 0.55;
        c.velocity.z *= 0.55;
        c.spin.multiplyScalar(0.5);
        c.bounces++;
        if (speed < 0.6 || c.bounces > 4) {
          // Settles lying on its side.
          c.resting = true;
          c.mesh.position.y = 0.0049;
          c.mesh.rotation.set(Math.PI / 2, 0, c.mesh.rotation.z);
        }
      }
    }
  }
}
