// The film's effects, each a plain function of time (so any frame can be
// drawn on its own, at any speed): the muzzle blast (the gas leaking out
// ahead of the bullet, the fireball of hot gas, burning grains of powder
// and the smoke; the air it disturbs is film.js's air pass), the strike
// on the plate
// (the bullet flattening, lead and jacket spraying out along the face,
// sparks, a grey cloud and the splash left on the paint), and the dust in
// the air that shows how fast the camera goes.
//
// The glows and smoke are drawn on layer FX_LAYER, after the depth of
// field (their soft shapes don't need blurring, and the blur would smear
// them with whatever is behind them); the rest is in the scene as usual.

import * as THREE from 'three';
import { canvasTexture, clamp01, seeded, smoothstep, tileNoise } from './util.js';
import { drawSplash } from './set.js';
import { SHOT } from './ballistics.js';

const EXIT = SHOT.exit; // the bullet's base clears the muzzle (s)

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

// A wisp of smoke: billowing noise (a few octaves) inside a soft,
// lumpy edge, so the puffs read as smoke and not as round blobs.
function smokeTexture(rng) {
  const N = 128;
  const n = tileNoise(N, N, rng, [[4, 0.45], [8, 0.3], [16, 0.17], [32, 0.08]]);
  const lump = Array.from({ length: 7 }, () => 0.75 + rng() * 0.35);
  return canvasTexture(N, N, (g) => {
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.5;
      const a = Math.atan2(dy, dx), r = Math.hypot(dx, dy) * 2;
      // (The edge wobbles round the puff.)
      const f = ((a / (Math.PI * 2)) + 1) * 7 % 7, i = Math.floor(f), k = f - i;
      const edge = lump[i] + (lump[(i + 1) % 7] - lump[i]) * (k * k * (3 - 2 * k));
      const fall = Math.max(0, 1 - r / edge);
      const v = n[y * N + x];
      const alpha = Math.max(0, Math.min(1, fall * fall * (0.25 + 1.5 * (v - 0.25))));
      const o = (y * N + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(alpha * 255);
    }
    g.putImageData(img, 0, 0);
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
    this.smoke = new Sprites(this.group, 100, this.tex.smoke[0], { additive: false });
    this.bits = new Sprites(this.group, 100, this.tex.dot, { additive: false });
    this.color = new THREE.Color();

    // The blast's pieces, chosen once (seeded): each gas lump, grain and
    // smoke puff has its own direction, speed and timing.
    const r = seeded(77);
    this.lumps = Array.from({ length: 26 }, (_, i) => ({
      start: ms(r() * 0.12), along: 0.012 + r() * 0.085, out: 0.004 + r() * 0.026, angle: r() * Math.PI * 2,
      size: 0.016 + r() * 0.03, tau: ms(0.12 + r() * 0.22), life: ms(0.8 + r() * 1.2), tex: i % 2, spin: r() * 6,
    }));
    this.grains = Array.from({ length: 34 }, () => ({
      start: EXIT + ms(r() * 0.35), speed: 260 + r() * 200, spread: r() * 0.11, angle: r() * Math.PI * 2,
      drag: ms(1.2 + r() * 2.5), life: ms(1.5 + r() * 4), size: 0.00022 + r() * 0.0003,
    }));
    this.puffs = Array.from({ length: 30 }, (_, i) => ({
      start: i < 10 ? EXIT + ms(r() * 0.4) : ms(0.9 + r() * 2.2), along: 0.02 + r() * 0.1, out: 0.008 + r() * 0.04, angle: r() * Math.PI * 2,
      size: 0.02 + r() * 0.035, grow: 0.12 + r() * 0.22, rise: 0.02 + r() * 0.05, drift: r() - 0.5, port: i >= 24,
      tex: i % 2, rot: r() * 6, shade: i < 10 ? 0.62 + r() * 0.12 : 0.75 + r() * 0.2, gas: i < 10,
    }));
    // The strike's pieces: flakes of lead and jacket thrown out flat
    // along the plate's face (a 'splash' disc), and sparks of hot metal,
    // thinner and quicker, some flying farther and arcing down.
    this.frags = Array.from({ length: 130 }, (_, i) => {
      const spark = i % 3 === 0;
      return {
        angle: r() * Math.PI * 2, speed: spark ? 70 + r() * 220 : 40 + r() * 150, lift: spark ? 0.08 + r() * 0.45 : 0.02 + r() * 0.18,
        life: spark ? ms(60 + r() * 380) : ms(30 + r() * 140), size: spark ? 0.00035 + r() * 0.0005 : 0.0008 + r() * 0.0018, spark,
        drag: spark ? ms(40 + r() * 120) : ms(20 + r() * 15),
      };
    });

    // Dust floating in the air along the bullet's path (set by setPath).
    this.dust = null;

    // The splash the bullet leaves: a decal on the plate's face.
    const splash = canvasTexture(512, 512, (g, w) => drawSplash(g, w / 2, w / 2, w * 0.2, seeded(31337), 0.65));
    this.splash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.06),
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
      // The gas that leaks past the bullet before it's out (blow-by): a
      // small grey puff spreading just ahead of the muzzle.
      const leak = s - (EXIT - ms(0.16));
      if (leak > 0 && leak < ms(2.5)) {
        const grow = 1 - Math.exp(-leak / ms(0.25));
        p.copy(w.muzzle).addScaledVector(w.dir, 0.003 + 0.03 * grow);
        const size = 0.006 + 0.03 * grow;
        const fade = smoothstep(0, ms(0.08), leak) * (1 - smoothstep(ms(0.8), ms(2.5), leak));
        this.smoke.put(p, size, size, 1.3, this.color.setRGB(0.72, 0.72, 0.74), 0.3 * fade, this.tex.smoke[0]);
      }
      // The flash: as the base clears the muzzle, the hot gas behind it
      // bursts out in lumps that rush forward and outward round the bullet,
      // swell and cool from yellow through orange to a dull red. (Kept to
      // a pistol's modest flash: most of a 9 mm's light is this one small,
      // short orange burst.)
      for (const L of this.lumps) {
        const t = s - (EXIT + L.start);
        if (t <= 0 || t > L.life) continue;
        const grow = 1 - Math.exp(-t / L.tau);
        const cool = t / L.life;
        p.copy(w.muzzle).addScaledVector(w.dir, L.along * grow + 0.003).addScaledVector(radial(L.angle, q), L.out * grow);
        const size = L.size * (0.25 + 0.8 * grow);
        const fade = smoothstep(0, ms(0.04), t) * (1 - smoothstep(0.45, 1, cool));
        // (Its body drawn over the picture, so it shows orange against the
        // bright sky, and its glow added on top.)
        glow(0.3 + cool * 0.9, 1, this.color);
        this.color.multiplyScalar(0.92 - 0.35 * cool);
        this.smoke.put(p, size * 0.9, size * 0.9, L.spin + 1, this.color, 0.4 * fade * (1 - cool * 0.5), this.tex.smoke[L.tex]);
        this.glows.put(p, size, size, L.spin + cool * 2, glow(0.15 + cool * 1.0, 1.2 * (1 - cool * 0.6), this.color), 0.26 * fade, this.tex.blobs[L.tex]);
      }
      // Its hottest moment: a small bright ring of light right at the
      // muzzle as the gas first meets the air.
      const core = s - EXIT;
      if (core > 0 && core < ms(0.4)) {
        const k = 1 - core / ms(0.4);
        p.copy(w.muzzle).addScaledVector(w.dir, 0.004);
        this.glows.put(p, 0.012 * (0.6 + 0.6 * (1 - k)), 0.012 * (0.6 + 0.6 * (1 - k)), core * 9000, glow(0.18, 1.0, this.color), k * k, this.tex.blobs[0]);
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
        this.streaks.put(p, len * 2, G.size, screenAngle(camera, p, d), glow(0.2 + cool * 0.8, 1.7, this.color), 1 - cool * cool);
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
        // (The gas itself bursts out in a fraction of a millisecond; the
        // smoke after it and from the port spreads more slowly.)
        const burst = 1 - Math.exp(-t / (P.gas ? ms(0.35) : ms(2.5)));
        const slow = 1 - Math.exp(-t / 0.8);
        p.copy(base).addScaledVector(dir, P.along * (P.port ? 0.3 : 1) * burst + 0.15 * slow * (P.port ? 0.2 : 1))
          .addScaledVector(radial(P.angle, q), P.out * burst + 0.05 * slow);
        p.y += P.rise * slow + 0.04 * t;
        p.x += P.drift * 0.1 * slow;
        const size = (P.size * (0.3 + burst) * (P.gas ? 1.6 : 1) + P.grow * slow) * (P.port ? 0.45 : 1);
        const fade = smoothstep(0, P.gas ? ms(0.06) : ms(0.3), t) * (1 - smoothstep(0.8, 3.5, t));
        const shade = P.port ? P.shade * 0.82 : P.shade;
        this.smoke.put(p, size, size, P.rot + slow * 0.6, this.color.setRGB(shade, shade, shade * 1.02), (P.port ? 0.2 : 0.36) * fade, this.tex.smoke[P.tex]);
      }
    }

    // (The air the bullet tears through is drawn by film.js's air pass:
    // the picture bends round it.)

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
        this.glows.put(p, 0.02 * (0.4 + k), 0.02 * (0.4 + k), 0, glow(0.12, 1.8, this.color), k * k, this.tex.dot);
      }
      // Lead and jacket spraying out along the face, and sparks.
      for (const F of this.frags) {
        if (t > F.life) continue;
        const d = q.copy(a1).multiplyScalar(Math.cos(F.angle)).addScaledVector(a2, Math.sin(F.angle)).addScaledVector(n, F.lift).normalize();
        const drag = F.drag;
        const dist = F.speed * drag * (1 - Math.exp(-t / drag));
        p.copy(w.hit.at).addScaledVector(d, dist + 0.003);
        p.y -= 4.9 * t * t;
        const k = 1 - t / F.life;
        const v = F.speed * Math.exp(-t / drag);
        // (Streaked along its motion, as a film camera's shutter smears it:
        // longer while it's fast.)
        const len = F.size * (1.5 + Math.min(F.spark ? 60 : 10, v / (F.spark ? 6 : 25)));
        const fall = q.copy(d).multiplyScalar(v).add(_b.set(0, -9.81 * t, 0)).normalize();
        if (F.spark) this.streaks.put(p, len, F.size, screenAngle(camera, p, fall), glow(0.35 + (1 - k) * 0.6, 1.25 * (0.5 + 0.5 * k), this.color), Math.min(1, k * 1.6));
        else this.bits.put(p, len * 0.35, F.size * 1.2, screenAngle(camera, p, d), this.color.setRGB(0.18, 0.18, 0.19), 0.95 * k, this.tex.dot);
      }
      // A grey cloud of lead spreading over the face and drifting off.
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + 0.3;
        const spread = 1 - Math.exp(-t / 0.04);
        const r = 0.03 + 0.16 * spread * (0.7 + 0.3 * Math.sin(i * 7.1));
        p.copy(w.hit.at).addScaledVector(a1, Math.cos(angle) * r).addScaledVector(a2, Math.sin(angle) * r).addScaledVector(n, 0.02 + 0.08 * spread);
        p.y += 0.05 * t;
        const size = 0.04 + 0.14 * spread + 0.06 * t;
        const fade = smoothstep(0, ms(1), t) * (1 - smoothstep(0.3, 2.2, t));
        this.smoke.put(p, size, size, i, this.color.setRGB(0.58, 0.59, 0.61), 0.16 * fade, this.tex.smoke[i % 2]);
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
