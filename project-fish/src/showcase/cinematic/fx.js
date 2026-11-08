// The film's effects, each a plain function of time (so any frame can be
// drawn on its own, at any speed): the muzzle blast (the air pushed out
// ahead of the bullet, the fireball of hot gas, burning grains of powder
// and the smoke), the air the bullet disturbs, the strike on the plate
// (the bullet flattening, lead and jacket spraying out along the face,
// sparks, a grey cloud and the splash left on the paint), and the dust in
// the air that shows how fast the camera goes.
//
// The glows and smoke are drawn on layer FX_LAYER, after the depth of
// field (their soft shapes don't need blurring, and the blur would smear
// them with whatever is behind them); the rest is in the scene as usual.

import * as THREE from 'three';
import { canvasTexture, clamp01, seeded, smoothstep } from './util.js';
import { drawSplash } from './set.js';

export const FX_LAYER = 1;

const ms = (x) => x / 1000;

function blobTexture(rng, hot) {
  return canvasTexture(128, 128, (g, w) => {
    const c = w / 2;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2, d = Math.pow(rng(), 1.5) * c * 0.45, r = c * (0.18 + rng() * 0.3);
      const grad = g.createRadialGradient(c + Math.cos(a) * d, c + Math.sin(a) * d, 0, c + Math.cos(a) * d, c + Math.sin(a) * d, r);
      grad.addColorStop(0, hot ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.22)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    }
  }, { srgb: false });
}

function softDot() {
  return canvasTexture(64, 64, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  }, { srgb: false });
}

// A streak along +X (for sparks and grains: a sprite turned to its motion).
function streakTexture() {
  return canvasTexture(128, 16, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2, h / 2 - 1, 0, 0, Math.PI * 2);
    g.fill();
  }, { srgb: false });
}

function smokeTexture(rng) {
  return canvasTexture(128, 128, (g, w) => {
    const c = w / 2;
    for (let i = 0; i < 30; i++) {
      const a = rng() * Math.PI * 2, d = Math.pow(rng(), 0.8) * c * 0.5, r = c * (0.15 + rng() * 0.3);
      const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    }
  }, { srgb: false });
}

// A pool of sprites set afresh each frame.
class Sprites {
  constructor(parent, count, texture, { additive = true, layer = FX_LAYER } = {}) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture, transparent: true, depthWrite: false, toneMapped: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
      });
      const s = new THREE.Sprite(material);
      s.visible = false;
      s.layers.set(layer);
      s.frustumCulled = false;
      parent.add(s);
      this.items.push(s);
    }
    this.used = 0;
  }
  begin() { this.used = 0; }
  // One sprite: position, size (w, h metres), screen rotation, colour (may
  // be brighter than 1, for the bloom), opacity.
  put(pos, w, h, rotation, color, opacity, texture = null) {
    // (Thinned out where it would be right in front of the lens.)
    if (this.camera) opacity *= smoothstep(0.4, 1.6, pos.distanceTo(this.camera.position) / Math.max(w, h));
    if (this.used >= this.items.length || opacity <= 0.002) return;
    const s = this.items[this.used++];
    s.visible = true;
    s.position.copy(pos);
    s.scale.set(w, h, 1);
    s.material.rotation = rotation;
    s.material.color.copy(color);
    s.material.opacity = opacity;
    if (texture && s.material.map !== texture) s.material.map = texture;
  }
  end() {
    for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
  }
}

// The screen angle of a direction in the world, for turning a streak
// sprite along it.
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function screenAngle(camera, at, dir) {
  _a.copy(at).project(camera);
  _b.copy(at).addScaledVector(dir, 0.01).project(camera);
  return Math.atan2(_b.y - _a.y, (_b.x - _a.x) * camera.aspect);
}

// Glow colours: white hot, yellow, orange, dull red, by how far it has
// cooled (0..1); `heat` scales it past 1 for the bloom.
const HOT = [new THREE.Color(1, 0.97, 0.9), new THREE.Color(1, 0.78, 0.38), new THREE.Color(1, 0.45, 0.12), new THREE.Color(0.6, 0.12, 0.03)];
function glow(cool, heat, out) {
  const x = clamp01(cool) * (HOT.length - 1);
  const i = Math.min(HOT.length - 2, Math.floor(x));
  return out.copy(HOT[i]).lerp(HOT[i + 1], x - i).multiplyScalar(heat);
}

export class Effects {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'effects';
    scene.add(this.group);
    const rng = seeded(4242);
    this.tex = {
      blobs: [blobTexture(rng, true), blobTexture(rng, true), blobTexture(rng, false)],
      dot: softDot(),
      streak: streakTexture(),
      smoke: [smokeTexture(rng), smokeTexture(rng)],
    };
    this.glows = new Sprites(this.group, 90, this.tex.blobs[0]);
    this.streaks = new Sprites(this.group, 140, this.tex.streak);
    this.smoke = new Sprites(this.group, 70, this.tex.smoke[0], { additive: false });
    this.bits = new Sprites(this.group, 80, this.tex.dot, { additive: false });
    this.color = new THREE.Color();

    // The blast's pieces, chosen once (seeded): each gas lump, grain and
    // smoke puff has its own direction, speed and timing.
    const r = seeded(77);
    this.lumps = Array.from({ length: 26 }, (_, i) => ({
      start: ms(0.39 + r() * 0.12), along: 0.015 + r() * 0.07, out: 0.006 + r() * 0.026, angle: r() * Math.PI * 2,
      size: 0.012 + r() * 0.024, tau: ms(0.15 + r() * 0.2), life: ms(0.9 + r() * 1.3), tex: i % 2, spin: r() * 6,
    }));
    this.grains = Array.from({ length: 34 }, () => ({
      start: ms(0.39 + r() * 0.35), speed: 260 + r() * 200, spread: r() * 0.11, angle: r() * Math.PI * 2,
      drag: ms(1.2 + r() * 2.5), life: ms(1.5 + r() * 4), size: 0.0004 + r() * 0.0006,
    }));
    this.puffs = Array.from({ length: 30 }, (_, i) => ({
      start: ms(0.6 + r() * 2.4), along: 0.02 + r() * 0.1, out: 0.008 + r() * 0.04, angle: r() * Math.PI * 2,
      size: 0.02 + r() * 0.035, grow: 0.12 + r() * 0.22, rise: 0.02 + r() * 0.05, drift: r() - 0.5, port: i >= 24,
      tex: i % 2, rot: r() * 6, shade: 0.75 + r() * 0.2,
    }));
    this.frags = Array.from({ length: 80 }, () => ({
      angle: r() * Math.PI * 2, speed: 50 + r() * 170, lift: 0.05 + r() * 0.3, life: ms(30 + r() * 140), size: 0.001 + r() * 0.002, spark: r() < 0.18,
    }));

    // Dust floating in the air along the bullet's path (set by setPath).
    this.dust = null;

    // The splash the bullet leaves: a decal on the plate's face.
    const splash = canvasTexture(256, 256, (g, w) => drawSplash(g, w / 2, w / 2, w * 0.2, seeded(31337), 1));
    this.splash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshStandardMaterial({ map: splash, transparent: true, roughness: 0.5, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }),
    );
    this.splash.visible = false;
    this.splash.name = 'splash';
  }

  // Motes of dust in a slab round the path from a to b.
  setPath(a, b) {
    const rng = seeded(555);
    const count = 4000;
    const pos = new Float32Array(count * 3);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    for (let i = 0; i < count; i++) {
      const s = -0.5 + rng() * (len + 1);
      // Denser close to the line, where the camera rides.
      const r = 0.6 * Math.pow(rng(), 2.2) + 0.004;
      const a2 = rng() * Math.PI * 2;
      const p = a.clone().addScaledVector(dir, s).addScaledVector(side, Math.cos(a2) * r).add(new THREE.Vector3(0, Math.sin(a2) * r, 0));
      pos.set([p.x, p.y, p.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.0007, map: this.tex.dot, alphaTest: 0.35, transparent: false, color: 0xfff6e6, sizeAttenuation: true, fog: false,
    }));
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  // Draws the effects for this instant. s (seconds since the primer fired;
  // negative before), the camera, and where things are:
  // - muzzle, dir: the muzzle and the bore's direction (world)
  // - port, portDir: the ejection port and its outward direction
  // - bullet: the bullet's middle; speed (m/s); flying (it's out and not yet struck)
  // - hit: { s, at, normal, plate } once it strikes (s: when)
  update(s, camera, w) {
    for (const pool of [this.glows, this.streaks, this.smoke, this.bits]) {
      pool.camera = camera;
      pool.begin();
    }
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(w.dir, up).normalize();
    const upAcross = new THREE.Vector3().crossVectors(side, w.dir).normalize();
    const radial = (angle, out = new THREE.Vector3()) => out.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(upAcross, Math.sin(angle));
    const p = new THREE.Vector3(), q = new THREE.Vector3();

    if (s > ms(0.2)) {
      // The air in the barrel, pushed out just ahead of the bullet: a pale,
      // fast-spreading puff.
      const air = s - ms(0.26);
      if (air > 0 && air < ms(1.2)) {
        const k = 1 - air / ms(1.2);
        p.copy(w.muzzle).addScaledVector(w.dir, 0.004 + 40 * air);
        const size = 0.008 + 20 * air;
        this.glows.put(p, size, size, 0, this.color.setRGB(0.5, 0.55, 0.6), 0.15 * k * k, this.tex.blobs[2]);
      }
      // The fireball: lumps of hot gas burst out round the muzzle, push
      // forward and outward, swell and cool from white through orange to
      // a dull red.
      for (const L of this.lumps) {
        const t = s - L.start;
        if (t <= 0 || t > L.life) continue;
        const grow = 1 - Math.exp(-t / L.tau);
        const cool = t / L.life;
        p.copy(w.muzzle).addScaledVector(w.dir, L.along * grow + 0.004).addScaledVector(radial(L.angle, q), L.out * grow);
        const size = L.size * (0.3 + 0.9 * grow);
        const fade = smoothstep(0, ms(0.05), t) * (1 - smoothstep(0.55, 1, cool));
        this.glows.put(p, size, size, L.spin + cool * 2, glow(cool * 1.15, 1.1 * (1 - cool * 0.6), this.color), 0.4 * fade, this.tex.blobs[L.tex]);
      }
      // The flash's white core at the muzzle, for an instant.
      const core = s - ms(0.39);
      if (core > 0 && core < ms(0.6)) {
        const k = 1 - core / ms(0.6);
        p.copy(w.muzzle).addScaledVector(w.dir, 0.01);
        this.glows.put(p, 0.016 * (0.5 + k), 0.016 * (0.5 + k), core * 9000, glow(0.15, 1.2, this.color), k, this.tex.blobs[0]);
      }
      // Burning grains of powder shot out with the gas, slowing fast.
      for (const G of this.grains) {
        const t = s - G.start;
        if (t <= 0 || t > G.life) continue;
        const dist = G.speed * G.drag * (1 - Math.exp(-t / G.drag));
        const v = G.speed * Math.exp(-t / G.drag);
        const d = q.copy(w.dir).addScaledVector(radial(G.angle, p), G.spread).normalize();
        p.copy(w.muzzle).addScaledVector(d, dist + 0.004);
        const cool = t / G.life;
        // (A short streak: longer while it's fast.)
        const len = G.size * (1.5 + Math.min(4, v / 90));
        this.streaks.put(p, len, G.size, screenAngle(camera, p, d), glow(0.2 + cool * 0.8, 2.2, this.color), 1 - cool * cool);
      }
      // Smoke: grey puffs from the blast (and from the ejection port as
      // the case leaves), swelling fast at first, then drifting, rising
      // and thinning over a couple of seconds.
      for (const P of this.puffs) {
        const start = P.port ? 0.0036 + (P.start - ms(0.6)) * 0.4 : P.start;
        const t = s - start;
        if (t <= 0 || t > 3.5) continue;
        const base = P.port ? w.port : w.muzzle;
        const dir = P.port ? w.portDir : w.dir;
        const burst = 1 - Math.exp(-t / ms(2.5));
        const slow = 1 - Math.exp(-t / 0.8);
        p.copy(base).addScaledVector(dir, P.along * (P.port ? 0.3 : 1) * burst + 0.15 * slow * (P.port ? 0.2 : 1))
          .addScaledVector(radial(P.angle, q), P.out * burst + 0.05 * slow);
        p.y += P.rise * slow + 0.04 * t;
        p.x += P.drift * 0.1 * slow;
        const size = (P.size * (0.3 + burst) + P.grow * slow) * (P.port ? 0.6 : 1);
        const fade = smoothstep(0, ms(0.3), t) * (1 - smoothstep(0.8, 3.5, t));
        const shade = P.shade;
        this.smoke.put(p, size, size, P.rot + slow * 0.6, this.color.setRGB(shade, shade, shade * 1.02), 0.38 * fade, this.tex.smoke[P.tex]);
      }
    }

    // The air the bullet tears through: a faint streak behind it.
    if (w.flying) {
      p.copy(w.bullet).addScaledVector(w.dir, -0.09);
      const len = 0.16;
      this.streaks.put(p, len, 0.0045, screenAngle(camera, p, w.dir), this.color.setRGB(0.75, 0.82, 0.9), 0.1, this.tex.streak);
      p.copy(w.bullet).addScaledVector(w.dir, -0.03);
      this.streaks.put(p, 0.05, 0.007, screenAngle(camera, p, w.dir), this.color.setRGB(0.9, 0.92, 0.95), 0.06, this.tex.streak);
    }

    // The strike.
    if (w.hit && s >= w.hit.s) {
      const t = s - w.hit.s;
      const n = w.hit.normal;
      const a1 = new THREE.Vector3().crossVectors(n, up).normalize();
      const a2 = new THREE.Vector3().crossVectors(a1, n).normalize();
      // A white flash where it strikes.
      if (t < ms(0.25)) {
        const k = 1 - t / ms(0.25);
        p.copy(w.hit.at).addScaledVector(n, 0.004);
        this.glows.put(p, 0.06 * (0.4 + k), 0.06 * (0.4 + k), 0, glow(0.05, 6, this.color), k, this.tex.dot);
      }
      // Lead and jacket spraying out along the face, and sparks.
      for (const F of this.frags) {
        if (t > F.life) continue;
        const d = q.copy(a1).multiplyScalar(Math.cos(F.angle)).addScaledVector(a2, Math.sin(F.angle)).addScaledVector(n, F.lift).normalize();
        const drag = ms(25);
        const dist = F.speed * drag * (1 - Math.exp(-t / drag));
        p.copy(w.hit.at).addScaledVector(d, dist + 0.003);
        p.y -= 4.9 * t * t;
        const k = 1 - t / F.life;
        const v = F.speed * Math.exp(-t / drag);
        const len = F.size * (1.5 + Math.min(10, v / 25));
        if (F.spark) this.streaks.put(p, len * 0.6, F.size * 0.7, screenAngle(camera, p, d), glow(0.3 + (1 - k) * 0.6, 2.2, this.color), k);
        else this.bits.put(p, len * 0.35, F.size * 1.2, screenAngle(camera, p, d), this.color.setRGB(0.18, 0.18, 0.19), 0.95 * k, this.tex.dot);
      }
      // A grey cloud of lead spreading over the face and drifting off.
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + 0.3;
        const spread = 1 - Math.exp(-t / 0.04);
        const r = 0.03 + 0.16 * spread * (0.7 + 0.3 * Math.sin(i * 7.1));
        p.copy(w.hit.at).addScaledVector(a1, Math.cos(angle) * r).addScaledVector(a2, Math.sin(angle) * r).addScaledVector(n, 0.02 + 0.08 * spread);
        p.y += 0.05 * t;
        const size = 0.05 + 0.25 * spread + 0.1 * t;
        const fade = smoothstep(0, ms(1), t) * (1 - smoothstep(0.3, 2.2, t));
        this.smoke.put(p, size, size, i, this.color.setRGB(0.6, 0.61, 0.63), 0.35 * fade, this.tex.smoke[i % 2]);
      }
    }

    // The splash on the plate.
    if (w.hit && w.hit.plate) {
      if (this.splash.parent !== w.hit.plate) {
        w.hit.plate.add(this.splash);
        this.splash.position.copy(w.hit.local).add(new THREE.Vector3(0, 0, 0.0002));
      }
      const t = s - w.hit.s;
      this.splash.visible = t > 0;
      this.splash.scale.setScalar(0.15 + 0.85 * smoothstep(0, ms(0.25), t));
    }

    this.glows.end();
    this.streaks.end();
    this.smoke.end();
    this.bits.end();
  }
}
