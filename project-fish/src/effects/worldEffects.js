// Effects out in the world: the flash lighting up the surroundings, smoke
// from the muzzle, spent brass bouncing on the ground, dropped magazines,
// and bullet impacts (a puff of dust and a hole left behind).

import * as THREE from 'three';
import { playCasing, playHull, playMagDrop } from './audio.js';
import { MAGAZINE } from '../viewmodel/pistol.js';

const GRAVITY = 9.8;
const MAX_MAGAZINES = 12; // dropped magazines left lying about (the oldest go first)
// A spent 9 mm case (metres): the one every gun throws out unless its rules
// give a caseSize of its own.
const CASE = { diameter: 0.0098, length: 0.019 };

// A dropped magazine's shape for landing on the ground, in its own frame
// (centred, Y up along it, X across its width): the corners of its body and
// of its wider baseplate.
const MAGAZINE_CORNERS = (() => {
  const half = (MAGAZINE.base - MAGAZINE.top) / 2;
  const bodyBottom = half - (MAGAZINE.bottom - MAGAZINE.top);
  const corners = [];
  for (const [x, z, y0, y1] of [
    [MAGAZINE.halfWidth, MAGAZINE.halfDepth, bodyBottom, half],
    [MAGAZINE.baseHalfWidth, MAGAZINE.baseHalfDepth, -half, bodyBottom],
  ]) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [y0, y1]) corners.push(new THREE.Vector3(sx * x, y, sz * z));
  }
  return corners;
})();
const DOWN = new THREE.Vector3(0, -1, 0);

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

    // Spent cases: little brass tubes, a 9 mm's (scaled for a gun whose
    // rules give its caseSize).
    this.caseGeometry = new THREE.CylinderGeometry(CASE.diameter / 2, CASE.diameter / 2, CASE.length, 12);
    // Not fully metallic: the world has no reflections for pure metal to show, so it would look black.
    this.caseMaterial = new THREE.MeshStandardMaterial({ color: 0xd4a84e, metalness: 0.35, roughness: 0.35 });
    // (A shotgun's hull: plastic in its caseSize's colour, by colour, with
    // a brass head.)
    this.hullMaterials = new Map();
    this.cases = [];

    // Bullet holes.
    this.holeGeometry = new THREE.PlaneGeometry(0.03, 0.03);
    this.holeMaterial = new THREE.MeshBasicMaterial({
      map: bulletHoleTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.holes = [];

    this.magazines = [];
  }

  // strength: 1 for a full flash (a suppressor leaves a faint one).
  flash(position, strength = 1) {
    this.flashLight.position.copy(position);
    this.flashTime = 0;
    this.flashStrength = strength;
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
    this.puff(position, v, { color: 0xc9c9c4, opacity: 0.05 + 0.09 * heat, size: 0.012, grow: 0.05, life: 0.9 + Math.random() * 0.6, drag: 0.8, rise: 0.04 });
  }

  // A spent case flying out of the ejection port.
  // size: { diameter, length } (metres) if it isn't a 9 mm's; with a
  // colour, it's a shotgun's plastic hull, its brass head the bottom fifth.
  ejectCase(position, velocity, size = null) {
    const hull = Boolean(size && size.color !== undefined);
    if (hull && !this.hullMaterials.has(size.color)) this.hullMaterials.set(size.color, new THREE.MeshStandardMaterial({ color: size.color, roughness: 0.6 }));
    const mesh = new THREE.Mesh(this.caseGeometry, hull ? this.hullMaterials.get(size.color) : this.caseMaterial);
    if (hull) {
      const head = new THREE.Mesh(this.caseGeometry, this.caseMaterial);
      head.scale.set(1.04, 0.2, 1.04);
      head.position.y = -0.4 * CASE.length;
      head.castShadow = true;
      mesh.add(head);
    }
    const radius = (size ? size.diameter : CASE.diameter) / 2;
    if (size) mesh.scale.set(size.diameter / CASE.diameter, size.length / CASE.length, size.diameter / CASE.diameter);
    mesh.position.copy(position);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40);
    this.cases.push({ mesh, radius, hull, velocity: velocity.clone(), spin, age: 0, bounces: 0, resting: false });
    if (this.cases.length > 40) {
      this.scene.remove(this.cases[0].mesh);
      this.cases.shift();
    }
  }

  // A dropped magazine: `object` (centred on the magazine, see
  // MAGAZINE_CORNERS) falling from `position`, turned `quaternion`, at
  // `velocity`. It tumbles a little, clatters as it lands, settles on its
  // side and stays.
  dropMagazine(object, position, quaternion, velocity) {
    object.position.copy(position);
    object.quaternion.copy(quaternion);
    this.scene.add(object);
    const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6);
    this.magazines.push({ object, velocity: velocity.clone(), spin, bounces: 0, settling: false, resting: false });
    if (this.magazines.length > MAX_MAGAZINES) this.scene.remove(this.magazines.shift().object);
  }

  updateMagazine(m, dt) {
    const { object, velocity, spin } = m;
    velocity.y -= GRAVITY * dt;
    object.position.addScaledVector(velocity, dt);
    const rate = spin.length();
    if (rate > 1e-4) object.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(spin.clone().divideScalar(rate), rate * dt));

    // How far its lowest corner has gone below the ground.
    let lowest = Infinity;
    for (const c of MAGAZINE_CORNERS) lowest = Math.min(lowest, c.clone().applyQuaternion(object.quaternion).add(object.position).y);
    if (lowest < 0 || m.settling) object.position.y -= lowest;
    if (lowest < 0 && velocity.y < 0) {
      const speed = -velocity.y;
      if (speed > 0.25) playMagDrop(Math.min(1, speed / 4));
      velocity.y = speed * 0.22;
      velocity.x *= 0.45;
      velocity.z *= 0.45;
      // Hitting the ground on a corner knocks it over a bit.
      spin.multiplyScalar(0.35).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(speed * 3));
      m.bounces++;
      if (speed < 0.9 || m.bounces > 3) m.settling = true;
    }

    // Settling: it tips over onto whichever side is lowest and comes to rest.
    if (m.settling) {
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(object.quaternion);
      const down = side.y < 0 ? side : side.negate();
      const rest = new THREE.Quaternion().setFromUnitVectors(down, DOWN).multiply(object.quaternion);
      object.quaternion.slerp(rest, 1 - Math.exp(-12 * dt));
      velocity.multiplyScalar(Math.exp(-9 * dt));
      spin.multiplyScalar(Math.exp(-12 * dt));
      if (object.quaternion.angleTo(rest) < 0.005 && velocity.lengthSq() < 1e-4) {
        object.quaternion.copy(rest);
        m.resting = true;
      }
    }
  }

  // Where a bullet hit: a hole (unless `withHole` is false) and a puff of
  // dust (and a few grains of grit; `amount` of it: less for each of a
  // shotgun's pellets).
  impact(hit, color, withHole = true, amount = 1) {
    const normal = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
    const point = new THREE.Vector3(hit.x, hit.y, hit.z);
    if (withHole) {
      const hole = new THREE.Mesh(this.holeGeometry, this.holeMaterial);
      hole.position.copy(point).addScaledVector(normal, 0.001);
      hole.lookAt(point.clone().add(normal));
      hole.rotateZ(Math.random() * Math.PI * 2);
      hole.scale.setScalar(0.8 + Math.random() * 0.4);
      this.scene.add(hole);
      this.holes.push(hole);
      if (this.holes.length > 80) this.scene.remove(this.holes.shift());
    }

    for (let i = 0; i < Math.max(1, Math.round(7 * amount)); i++) {
      const v = normal.clone().multiplyScalar(0.6 + Math.random() * 1.4)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(0.9));
      this.puff(point.clone().addScaledVector(normal, 0.02), v, { color, opacity: 0.45, size: 0.05 + Math.random() * 0.05, grow: 0.35, life: 0.5 + Math.random() * 0.5, drag: 4 });
    }
    for (let i = 0; i < Math.max(1, Math.round(5 * amount)); i++) {
      const v = normal.clone().multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(2));
      this.puff(point.clone(), v, { color: 0x5a564e, opacity: 0.9, size: 0.012, grow: 0, life: 0.35, drag: 0.5, rise: -GRAVITY });
    }
  }

  update(dt) {
    this.flashTime += dt;
    const f = Math.max(0, 1 - this.flashTime / 0.06);
    this.flashLight.intensity = 6 * f * f * (this.flashStrength ?? 1);

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

    for (const m of this.magazines) if (!m.resting) this.updateMagazine(m, dt);

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
        if (c.hull) playHull(Math.min(1, speed / 3));
        else playCasing(Math.min(1, speed / 3));
        c.velocity.y = speed * 0.35;
        c.velocity.x *= 0.55;
        c.velocity.z *= 0.55;
        c.spin.multiplyScalar(0.5);
        c.bounces++;
        if (speed < 0.6 || c.bounces > 4) {
          // Settles lying on its side.
          c.resting = true;
          c.mesh.position.y = c.radius;
          c.mesh.rotation.set(Math.PI / 2, 0, c.mesh.rotation.z);
        }
      }
    }
  }
}
