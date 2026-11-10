// Procedurally generated canvas textures: dirt with ruts and tyre marks, the
// cut face strata, grass, sand, fence mesh, banners and number plates.
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

// Top surface of the track. u runs along the track, v across it.
// lanes: v positions (0..1) of the four racing lines.
export function dirtTexture(base, lanes, seed = 7) {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  const R = rng(seed);
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  // Large soft blotches of lighter / darker dirt.
  for (let i = 0; i < 70; i++) {
    const x = R() * W, y = R() * H, r = 30 + R() * 90;
    const k = (R() - 0.5) * 0.25;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rgba(shade(base, k), 0.55)); grd.addColorStop(1, rgba(shade(base, k), 0));
    for (const dx of [0, -W, W]) { g.fillStyle = grd; g.save(); g.translate(dx, 0); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  // Packed racing lines: darker, smoother bands along each lane.
  const wave = (v, x, amp, f, ph) => (v + Math.sin((x / W) * Math.PI * 2 * f + ph) * amp) * H;
  for (const v of lanes) {
    const ph = R() * 6;
    for (let pass = 0; pass < 6; pass++) {
      g.strokeStyle = rgba(shade(base, -0.28), 0.12);
      g.lineWidth = 34 - pass * 4;
      g.beginPath();
      for (let x = 0; x <= W; x += 8) g.lineTo(x, wave(v, x, 0.012, 2, ph));
      g.stroke();
    }
    // Two rut grooves per lane with a lighter crown between them.
    for (const off of [-0.022, 0.022]) {
      g.strokeStyle = rgba(shade(base, -0.42), 0.55); g.lineWidth = 7;
      g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, wave(v + off, x, 0.012, 2, ph)); g.stroke();
      g.strokeStyle = rgba(shade(base, 0.18), 0.35); g.lineWidth = 2;
      g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, wave(v + off, x, 0.012, 2, ph) - 5); g.stroke();
    }
    // Knobby tyre tread marks in the ruts.
    g.fillStyle = rgba(shade(base, -0.55), 0.6);
    for (const off of [-0.022, 0.022]) {
      for (let x = 0; x < W; x += 9) {
        const y = wave(v + off, x, 0.012, 2, ph);
        g.fillRect(x, y - 3 + ((x / 9) % 2 ? 2 : -2), 4, 2);
      }
    }
  }
  // Wandering secondary tyre tracks.
  for (let i = 0; i < 7; i++) {
    const v = 0.08 + R() * 0.84, ph = R() * 6, f = 1 + ((R() * 3) | 0);
    g.strokeStyle = rgba(shade(base, -0.3), 0.25); g.lineWidth = 4;
    g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, wave(v, x, 0.05, f, ph)); g.stroke();
  }
  // Loose clods, pebbles and grain.
  speckle(g, W, H, R, [rgba(shade(base, -0.35), 0.8), rgba(shade(base, 0.25), 0.8), rgba(shade(base, -0.15), 0.9)], 9000, 2.5);
  for (let i = 0; i < 500; i++) {
    const x = R() * W, y = R() * H, r = 1.5 + R() * 3.5;
    g.fillStyle = rgba(shade(base, -0.4), 0.7); g.beginPath(); g.ellipse(x, y + 1, r, r * 0.7, 0, 0, 7); g.fill();
    g.fillStyle = rgba(shade(base, 0.12), 1); g.beginPath(); g.ellipse(x, y, r * 0.85, r * 0.6, 0, 0, 7); g.fill();
  }
  // Looser, lighter dirt along both edges (berms).
  for (const [y0, y1] of [[0, 0.09], [1, 0.91]]) {
    const grd = g.createLinearGradient(0, y0 * H, 0, y1 * H);
    grd.addColorStop(0, rgba(shade(base, 0.12), 0.7)); grd.addColorStop(1, rgba(shade(base, 0.12), 0));
    g.fillStyle = grd; g.fillRect(0, Math.min(y0, y1) * H, W, Math.abs(y1 - y0) * H);
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

// Cross-section of the dirt on the cut front face: strata and stones.
export function strataTexture(base, seed = 3) {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const R = rng(seed);
  g.fillStyle = hex(shade(base, -0.12)); g.fillRect(0, 0, W, H);
  let y = 0;
  while (y < H) {
    const h = 10 + R() * 40;
    const k = (R() - 0.5) * 0.3 - 0.08;
    g.fillStyle = hex(shade(base, k));
    g.beginPath(); g.moveTo(0, y);
    const ph = R() * 6, amp = 2 + R() * 5;
    for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin((x / W) * Math.PI * 4 + ph) * amp);
    for (let x = W; x >= 0; x -= 16) g.lineTo(x, y + h + Math.sin((x / W) * Math.PI * 4 + ph + 1) * amp);
    g.fill();
    y += h;
  }
  speckle(g, W, H, R, [rgba(shade(base, -0.4), 0.7), rgba(shade(base, 0.2), 0.6)], 5000, 2);
  for (let i = 0; i < 160; i++) {
    const x = R() * W, yy = R() * H, r = 2 + R() * 7;
    g.fillStyle = rgba(0x000000, 0.25); g.beginPath(); g.ellipse(x + 1, yy + 2, r, r * 0.75, 0, 0, 7); g.fill();
    g.fillStyle = hex(shade(0x9a9088, (R() - 0.5) * 0.4)); g.beginPath(); g.ellipse(x, yy, r, r * 0.75, R(), 0, 7); g.fill();
  }
  // Roots / cracks.
  g.strokeStyle = rgba(shade(base, -0.5), 0.35); g.lineWidth = 1.5;
  for (let i = 0; i < 25; i++) {
    let x = R() * W, yy = R() * H * 0.4;
    g.beginPath(); g.moveTo(x, yy);
    for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 20; yy += 6 + R() * 12; g.lineTo(x, yy); }
    g.stroke();
  }
  return tex(c);
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
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
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
