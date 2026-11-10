// Procedurally generated canvas textures: raked dirt with ruts and tyre marks, grass, sand, fence mesh, banners and number plates.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000003) / 1000003; };
}
const hex = (c) => '#' + new THREE.Color(c).getHexString();
function shade(c, k) {
  const col = new THREE.Color(c);
  if (k >= 0) col.lerp(new THREE.Color(1, 1, 1), k); else col.multiplyScalar(1 + k);
  return col;
}
const rgba = (c, a) => { const col = new THREE.Color(c); return `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`; };

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  return t;
}

// Speckle noise drawn with horizontal wrap so the texture tiles along x.
function speckle(g, W, H, R, colors, count, maxSize) {
  for (let i = 0; i < count; i++) {
    const x = R() * W, y = R() * H, s = 0.6 + R() * maxSize;
    g.fillStyle = colors[(R() * colors.length) | 0];
    g.fillRect(x, y, s, s * (0.6 + R() * 0.8));
    if (x + s > W) g.fillRect(x - W, y, s, s);
  }
}

// Dirt for the whole track cross-section. u runs along the track, v across
// it from the back foot (0) to the front foot (1). opts.top = [v0, v1] is the
// riding surface; opts.metres is how many metres v spans. lanes: v of each
// racing line.
export function dirtTexture(base, lanes, seed = 7, opts = {}) {
  const W = 1024, H = 1024;
  const [top0, top1] = opts.top || [0, 1];
  const pxm = H / (opts.metres || 7.4); // pixels per metre across
  const [c, g] = canvas(W, H);
  const R = rng(seed);
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  const onTop = (y) => y >= top0 * H && y <= top1 * H;
  // Large soft blotches of lighter / darker dirt.
  for (let i = 0; i < 90; i++) {
    const x = R() * W, y = R() * H, r = 30 + R() * 110;
    const k = (R() - 0.5) * 0.22;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rgba(shade(base, k), 0.5)); grd.addColorStop(1, rgba(shade(base, k), 0));
    for (const dx of [0, -W, W]) { g.fillStyle = grd; g.save(); g.translate(dx, 0); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  // Raked grooves running along the track, over the top and down both
  // shoulders: a dark groove with a lit ridge just above it (light comes from
  // above), gently wavy so they read as sculpted dirt, not printed stripes.
  const wave = (y, x, amp, f, ph) => y + Math.sin((x / W) * Math.PI * 2 * f + ph) * amp;
  for (let y = 2; y < H; y += 4 + R() * 7) {
    const top = onTop(y);
    const a = top ? 0.16 + R() * 0.1 : 0.32 + R() * 0.18;
    const f = 1 + ((R() * 2) | 0), ph = R() * 6, amp = 0.6 + R() * 1.6;
    g.lineWidth = 1.2 + R() * 1.6;
    g.strokeStyle = rgba(shade(base, -0.38), a);
    g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, wave(y, x, amp, f, ph)); g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = rgba(shade(base, 0.22), a * 0.9);
    g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, wave(y - 2, x, amp, f, ph)); g.stroke();
  }
  // Packed racing lines: darker, smoother bands along each lane, with two rut
  // grooves, a lighter crown between them and knobby tread marks.
  const lw = (m) => m * pxm;
  for (const v of lanes) {
    const ph = R() * 6;
    const lane = (off, x) => wave((v + off) * H, x, lw(0.08), 2, ph);
    for (let pass = 0; pass < 5; pass++) {
      g.strokeStyle = rgba(shade(base, -0.24), 0.13);
      g.lineWidth = lw(0.75) - pass * lw(0.12);
      g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, lane(0, x)); g.stroke();
    }
    for (const off of [-0.17, 0.17]) {
      const o = off / (opts.metres || 7.4);
      g.strokeStyle = rgba(shade(base, -0.45), 0.6); g.lineWidth = lw(0.09);
      g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, lane(o, x)); g.stroke();
      g.strokeStyle = rgba(shade(base, 0.2), 0.45); g.lineWidth = Math.max(1, lw(0.03));
      g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, lane(o, x) - lw(0.07)); g.stroke();
      g.fillStyle = rgba(shade(base, -0.55), 0.55);
      for (let x = 0; x < W; x += 9) g.fillRect(x, lane(o, x) - 2 + ((x / 9) % 2 ? 1.5 : -1.5), 4, 2);
    }
  }
  // Wandering secondary tyre tracks on the riding surface.
  for (let i = 0; i < 9; i++) {
    const v = top0 + 0.05 * (top1 - top0) + R() * 0.9 * (top1 - top0), ph = R() * 6, f = 1 + ((R() * 3) | 0);
    g.strokeStyle = rgba(shade(base, -0.3), 0.22); g.lineWidth = lw(0.06);
    g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, wave(v * H, x, lw(0.5), f, ph)); g.stroke();
  }
  // Loose clods, pebbles and grain.
  speckle(g, W, H, R, [rgba(shade(base, -0.35), 0.7), rgba(shade(base, 0.25), 0.7), rgba(shade(base, -0.15), 0.8)], 12000, 2.2);
  for (let i = 0; i < 700; i++) {
    const x = R() * W, y = R() * H, r = 1.2 + R() * 2.8;
    g.fillStyle = rgba(shade(base, -0.4), 0.6); g.beginPath(); g.ellipse(x, y + 1, r, r * 0.7, 0, 0, 7); g.fill();
    g.fillStyle = rgba(shade(base, 0.14), 1); g.beginPath(); g.ellipse(x, y, r * 0.85, r * 0.6, 0, 0, 7); g.fill();
  }
  // Drier, lighter dirt along the top edges where the shoulders roll over.
  for (const [ya, yb] of [[top0, top0 + 0.035], [top1, top1 - 0.035]]) {
    const grd = g.createLinearGradient(0, ya * H, 0, yb * H);
    grd.addColorStop(0, rgba(shade(base, 0.14), 0.55)); grd.addColorStop(1, rgba(shade(base, 0.14), 0));
    g.fillStyle = grd; g.fillRect(0, Math.min(ya, yb) * H, W, Math.abs(yb - ya) * H);
  }
  const map = tex(c);
  const bump = tex(toBump(c), { srgb: false });
  return { map, bump };
}

// Height-ish map from luminance (darker = lower) for bump mapping.
function toBump(src) {
  const [c, g] = canvas(src.width, src.height);
  g.filter = 'grayscale(1) contrast(1.6)';
  g.drawImage(src, 0, 0);
  return c;
}

export function grassTexture(base, seed = 11) {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const R = rng(seed);
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const x = R() * W, y = R() * H, r = 40 + R() * 80, k = (R() - 0.5) * 0.2;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rgba(shade(base, k), 0.6)); grd.addColorStop(1, rgba(shade(base, k), 0));
    // Draw wrapped in both directions so the texture tiles without seams.
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
      g.save(); g.translate(dx, dy); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
    }
  }
  for (let i = 0; i < 12000; i++) {
    const x = R() * W, y = R() * H, l = 2 + R() * 5;
    g.strokeStyle = rgba(shade(base, (R() - 0.5) * 0.45), 0.8);
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 2, y - l); g.stroke();
  }
  return tex(c);
}

export function sandTexture(base, seed = 5) {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const R = rng(seed);
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 6) {
    g.strokeStyle = rgba(shade(base, (R() - 0.5) * 0.15), 0.5); g.lineWidth = 2;
    g.beginPath(); const ph = R() * 6;
    for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x / 30 + ph) * 3);
    g.stroke();
  }
  speckle(g, W, H, R, [rgba(shade(base, -0.2), 0.6), rgba(shade(base, 0.2), 0.6)], 6000, 1.5);
  return tex(c);
}

export function fenceTexture() {
  const [c, g] = canvas(256, 128);
  g.clearRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(235,240,245,0.9)'; g.lineWidth = 2;
  for (let i = -128; i < 384; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
  }
  g.fillStyle = 'rgba(240,240,245,1)'; g.fillRect(0, 0, 256, 5); g.fillRect(0, 123, 256, 5);
  return tex(c);
}

export function bannerTexture(text, bg, fg, style = 0) {
  const [c, g] = canvas(1024, 160);
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 160);
  if (style === 1) {
    g.fillStyle = fg; g.globalAlpha = 0.18;
    for (let i = -160; i < 1024; i += 60) { g.beginPath(); g.moveTo(i, 160); g.lineTo(i + 30, 160); g.lineTo(i + 190, 0); g.lineTo(i + 160, 0); g.fill(); }
    g.globalAlpha = 1;
  } else if (style === 2) {
    g.fillStyle = fg; g.fillRect(0, 0, 1024, 14); g.fillRect(0, 146, 1024, 14);
  }
  g.font = 'italic 900 100px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillText(text, 516, 88);
  g.fillStyle = fg; g.fillText(text, 512, 84);
  return tex(c, { repeat: false });
}

export function numberTexture(num, bg, fg) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.font = 'italic 900 84px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.strokeText(String(num), 64, 70);
  g.fillStyle = fg; g.fillText(String(num), 64, 70);
  return tex(c, { repeat: false });
}

export function checkerTexture(text) {
  const [c, g] = canvas(1024, 192);
  for (let i = 0; i < 32; i++) for (let j = 0; j < 6; j++) {
    g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 32, j * 32, 32, 32);
  }
  if (text) {
    g.fillStyle = '#e8331c'; g.fillRect(240, 30, 544, 132);
    g.fillStyle = '#fff'; g.font = 'italic 900 110px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 100);
  }
  return tex(c, { repeat: false });
}

export function skyTexture(top, bottom, stars = false) {
  const [c, g] = canvas(4, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, top); grd.addColorStop(0.75, bottom); grd.addColorStop(1, bottom);
  g.fillStyle = grd; g.fillRect(0, 0, 4, 512);
  if (stars) {
    // Stars go on a separate wide canvas.
    const [c2, g2] = canvas(1024, 512);
    g2.drawImage(c, 0, 0, 1024, 512);
    const R = rng(99);
    for (let i = 0; i < 400; i++) {
      g2.fillStyle = `rgba(255,255,255,${0.3 + R() * 0.7})`;
      const s = R() < 0.1 ? 2 : 1;
      g2.fillRect(R() * 1024, R() * 300, s, s);
    }
    return tex(c2, { repeat: false });
  }
  return tex(c, { repeat: false });
}

// Rocky strata for canyon walls / mesas (tiles both ways).
export function rockTexture(base, seed = 21) {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const R = rng(seed);
  let y = 0;
  while (y < H) {
    const h = 8 + R() * 30;
    g.fillStyle = hex(shade(base, (R() - 0.5) * 0.35));
    g.fillRect(0, y, W, h + 1);
    y += h;
  }
  speckle(g, W, H, R, [rgba(shade(base, -0.3), 0.5), rgba(shade(base, 0.25), 0.4)], 4000, 3);
  g.strokeStyle = rgba(shade(base, -0.45), 0.4); g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    let x = R() * W, yy = R() * H;
    g.beginPath(); g.moveTo(x, yy);
    for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 10; yy += 10 + R() * 20; g.lineTo(x, yy); }
    g.stroke();
  }
  return tex(c);
}

// Soft round puff for dust clouds (white; tinted by the material colour).
export function puffTexture() {
  const [c, g] = canvas(128, 128);
  const R = rng(17);
  for (let i = 0; i < 7; i++) {
    const x = 64 + (R() - 0.5) * 32, y = 64 + (R() - 0.5) * 24, r = 20 + R() * 24;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.2)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  return tex(c, { repeat: false });
}

// Smooth radial glow (floodlight halos).
export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false });
}
