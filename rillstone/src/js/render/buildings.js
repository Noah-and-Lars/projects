// Millbrook's buildings: timber-framed cream plaster, slate gable roofs,
// teal trim, open shopfront counters under awnings. Our own style.
import * as THREE from 'three';
import { paint, merge, place, bevelBox } from './geom.js';

const PLASTER = 0xefe4cc, TIMBER = 0x6e4c2e, SLATE = 0x56616e, SLATE2 = 0x4a5460, STONE = 0xa8a090, WOOD = 0xb07a44, GLASS = 0x2a3a44;
const P = (g, hex, j = 0.06, seed = 1) => paint(g.index ? g.toNonIndexed() : g, hex, j, seed);

// A gable roof: two sloped slabs plus gable triangles. Ridge along x.
function roof(w, d, h, y, hex) {
  const parts = [];
  const slope = Math.hypot(d / 2 + 0.3, h);
  const ang = Math.atan2(h, d / 2 + 0.3);
  for (const s of [-1, 1]) {
    // Slate courses: a few stepped slabs for texture.
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) / 4, len = slope / 4 + 0.05;
      const g = new THREE.BoxGeometry(w + 0.6, 0.09, len);
      place(g, 0, y + h * (1 - t) + 0.05 + k * 0.01, s * (d / 2 + 0.3) * t, s * ang, 0, 0);
      parts.push(P(g, k % 2 ? hex : SLATE2, 0.08, k + (s > 0 ? 10 : 20)));
    }
  }
  const tri = new THREE.BufferGeometry();
  const v = [];
  // Both windings, so each gable shows from outside whichever way it faces.
  for (const sx of [-1, 1]) { const x = sx * w / 2; v.push(x, y, -d / 2, x, y, d / 2, x, y + h, 0, x, y, d / 2, x, y, -d / 2, x, y + h, 0); }
  tri.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  parts.push(P(tri, PLASTER, 0.03, 5));
  parts.push(P(place(new THREE.BoxGeometry(w + 0.7, 0.14, 0.18), 0, y + h + 0.06, 0), TIMBER, 0.05));
  return parts;
}

// A shop building facing +z, centred at the origin. opts: w, d, h, trim, awning, bay (open front), chimney.
export function building(opts) {
  const { w = 8, d = 6, h = 3.4, trim = 0x2a8a86, bay = false, chimney = true, roofH = 2.2 } = opts;
  const parts = [];
  parts.push(P(place(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), 0, 0.1, 0), STONE, 0.1, 1)); // plinth
  if (bay) {
    // Open-fronted shed: back and side walls only, posts at the front.
    parts.push(P(place(new THREE.BoxGeometry(w, h, 0.2), 0, h / 2 + 0.3, -d / 2 + 0.1), PLASTER, 0.04, 2));
    for (const s of [-1, 1]) parts.push(P(place(new THREE.BoxGeometry(0.2, h, d), s * (w / 2 - 0.1), h / 2 + 0.3, 0), PLASTER, 0.04, 3));
    for (let i = 0; i <= 3; i++) parts.push(P(place(new THREE.BoxGeometry(0.28, h, 0.28), -w / 2 + 0.14 + i * (w - 0.28) / 3, h / 2 + 0.3, d / 2 - 0.14), TIMBER, 0.06, i + 4));
    parts.push(P(place(new THREE.BoxGeometry(w, 0.3, 0.3), 0, h + 0.15, d / 2 - 0.14), TIMBER, 0.06));
  } else {
    parts.push(P(place(new THREE.BoxGeometry(w, h, d), 0, h / 2 + 0.3, 0), PLASTER, 0.04, 2));
    // Timber frame: corner posts, mid posts, a sill and a header, cross braces.
    const fz = d / 2 + 0.03;
    for (const x of [-w / 2, -w / 6, w / 6, w / 2]) parts.push(P(place(new THREE.BoxGeometry(0.2, h, 0.08), x, h / 2 + 0.3, fz), TIMBER, 0.06, 7));
    for (const y of [0.4, h + 0.2]) parts.push(P(place(new THREE.BoxGeometry(w + 0.1, 0.18, 0.08), 0, y, fz), TIMBER, 0.06, 8));
    for (const s of [-1, 1]) for (const zz of [-1, 1]) parts.push(P(place(new THREE.BoxGeometry(0.16, h, 0.08), s * (w / 2 + 0.03), h / 2 + 0.3, zz * (d / 2 - 0.1), 0, Math.PI / 2), TIMBER, 0.06, 9));
    for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.14, Math.hypot(w / 3, h) * 0.95, 0.06); place(g, s * w / 3, h / 2 + 0.3, fz + 0.01, 0, 0, s * Math.atan2(w / 3, h)); parts.push(P(g, TIMBER, 0.06, 10)); }
    // Shop window (the open counter hatch) and a door.
    parts.push(P(place(new THREE.BoxGeometry(w * 0.42, 1.3, 0.1), 0, 1.95, fz + 0.02), 0x2c2a28, 0.03, 11));
    parts.push(P(place(new THREE.BoxGeometry(1.0, 2.1, 0.1), w / 2 - 1.0, 1.35, fz + 0.02), TIMBER, 0.06, 12));
    parts.push(P(place(new THREE.BoxGeometry(0.12, 0.12, 0.06), w / 2 - 1.3, 1.35, fz + 0.08), 0xc89a48, 0.03));
    for (const s of [-1, 1]) { parts.push(P(place(new THREE.BoxGeometry(0.9, 0.9, 0.1), s * (w / 2 - 0.9) - (s > 0 ? 1.1 : 0), 2.4, fz + 0.02), GLASS, 0.03, 13)); parts.push(P(place(new THREE.BoxGeometry(1.0, 0.08, 0.14), s * (w / 2 - 0.9) - (s > 0 ? 1.1 : 0), 1.92, fz + 0.06), PLASTER, 0.03)); }
  }
  parts.push(...roof(w, d, roofH, h + 0.3, SLATE));
  if (chimney) { parts.push(P(place(new THREE.BoxGeometry(0.6, 1.6, 0.6), w / 2 - 1.2, h + roofH * 0.7, -d / 4), STONE, 0.12, 14)); parts.push(P(place(new THREE.BoxGeometry(0.7, 0.12, 0.7), w / 2 - 1.2, h + roofH * 0.7 + 0.8, -d / 4), SLATE, 0.05)); }
  // Awning over the counter in the shop's trim colour, striped.
  if (!bay) for (let i = 0; i < 6; i++) { const g = new THREE.BoxGeometry(w * 0.5 / 6, 0.05, 1.5); place(g, -w * 0.25 + (i + 0.5) * w * 0.5 / 6, 2.62, d / 2 + 0.7, -0.35, 0, 0); parts.push(P(g, i % 2 ? trim : 0xf4ecd8, 0.03, i + 30)); }
  return merge(parts);
}

// The counter in front of a shop window: a heavy wooden top on two cabinets.
export function counter(w = 3) {
  return merge([
    P(place(new THREE.BoxGeometry(w, 0.1, 0.9), 0, 1.0, 0), WOOD, 0.08, 1),
    P(place(new THREE.BoxGeometry(w - 0.1, 0.9, 0.7), 0, 0.5, -0.05), 0x8a5a30, 0.08, 2),
    P(place(new THREE.BoxGeometry(w - 0.3, 0.06, 0.04), 0, 0.7, 0.31), 0xc89a48, 0.04, 3),
  ]);
}
// A brass desk bell on a little wooden base.
export function bell() {
  return merge([
    P(new THREE.CylinderGeometry(0.1, 0.11, 0.04, 12).translate(0, 0.02, 0), 0x6e4c2e, 0.05),
    P(new THREE.SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.04, 0), 0xd8aa50, 0.04),
    P(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6).translate(0, 0.13, 0), 0xd8aa50, 0.03),
    P(new THREE.SphereGeometry(0.018, 8, 6).translate(0, 0.16, 0), 0xd8aa50, 0.03),
  ]);
}
// A market stall: four posts, a striped canopy, a counter.
export function stall(trim) {
  const parts = [];
  for (const [x, z] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]]) parts.push(P(place(new THREE.BoxGeometry(0.12, 2.6, 0.12), x, 1.3, z), 0x6e4c2e, 0.06));
  for (let i = 0; i < 6; i++) { const g = new THREE.BoxGeometry(2.9 / 6, 0.05, 1.7); place(g, -1.45 + (i + 0.5) * 2.9 / 6, 2.65, 0, 0.18, 0, 0); parts.push(P(g, i % 2 ? trim : 0xf4ecd8, 0.03, i)); }
  return merge(parts);
}
// A chalkboard on an A-frame. Returns { geo, faceSize } — text goes on a canvas texture.
export function chalkboardFrame() {
  return merge([
    P(place(new THREE.BoxGeometry(1.0, 1.25, 0.06), 0, 1.0, 0, -0.12), 0x6e4c2e, 0.06),
    P(place(new THREE.BoxGeometry(0.06, 1.3, 0.06), -0.45, 0.65, -0.25, 0.2), 0x6e4c2e, 0.06),
    P(place(new THREE.BoxGeometry(0.06, 1.3, 0.06), 0.45, 0.65, -0.25, 0.2), 0x6e4c2e, 0.06),
  ]);
}
// A sign or board face with text drawn on a canvas.
export function textPlane(lines, { w = 2, h = 0.5, bg = '#1f7a7a', fg = '#f6eedb', font = 'bold 64px', px = 512, chalk = false } = {}) {
  const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * h / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  if (!chalk) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 8; g.strokeRect(10, 10, c.width - 20, c.height - 20); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const L = Array.isArray(lines) ? lines : [lines];
  const lh = c.height / (L.length + 0.6);
  L.forEach((t, i) => {
    // Shrink the font until the line fits inside the border.
    let size = parseInt(font.match(/\d+/)[0]) * (i === 0 ? 1 : 0.7);
    const set = () => { g.font = `${font.replace(/\d+px/, Math.round(size) + 'px')} ui-rounded, "Nunito", "Segoe UI", sans-serif`; };
    set(); while (size > 10 && g.measureText(t).width > c.width * 0.88) { size *= 0.92; set(); }
    size = Math.min(size, lh * 0.8); set();
    g.fillText(t, c.width / 2, lh * (i + 0.8));
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.userData.redraw = (newLines) => { const mm = textPlane(newLines, { w, h, bg, fg, font, px, chalk }); m.material.map.dispose(); m.material.map = mm.material.map; };
  return m;
}
// A shopkeeper: apron, rolled sleeves, a cap in the shop's colour.
export function clerk(trim, skin = 0xd8a882) {
  return merge([
    P(place(new THREE.CylinderGeometry(0.2, 0.24, 0.75, 8), 0, 1.05, 0), 0xe8e0d0, 0.05, 1),
    P(place(new THREE.CylinderGeometry(0.205, 0.245, 0.6, 8, 1, true, -Math.PI / 2.4, Math.PI / 1.2), 0, 0.98, 0), trim, 0.04, 2),
    P(place(new THREE.SphereGeometry(0.16, 10, 8), 0, 1.6, 0), skin, 0.04, 3),
    P(place(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10), 0, 1.72, 0), trim, 0.04, 4),
    P(place(new THREE.BoxGeometry(0.2, 0.03, 0.14), 0, 1.69, 0.12), trim, 0.04, 5),
    P(place(new THREE.CylinderGeometry(0.08, 0.07, 0.5, 6), -0.26, 1.15, 0.05, 0.2, 0, 0.15), 0xe8e0d0, 0.05, 6),
    P(place(new THREE.CylinderGeometry(0.08, 0.07, 0.5, 6), 0.26, 1.15, 0.05, 0.2, 0, -0.15), 0xe8e0d0, 0.05, 7),
    P(place(new THREE.CylinderGeometry(0.11, 0.1, 0.7, 6), -0.1, 0.35, 0), 0x4a4e58, 0.05, 8),
    P(place(new THREE.CylinderGeometry(0.11, 0.1, 0.7, 6), 0.1, 0.35, 0), 0x4a4e58, 0.05, 9),
  ]);
}
// A wooden delivery pad with a painted ring.
export function pad() {
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(P(place(new THREE.BoxGeometry(0.42, 0.1, 2.6), -1.05 + i * 0.42, 0.05, 0), i % 2 ? 0xb07a44 : 0x9a6a3a, 0.08, i));
  parts.push(P(place(new THREE.TorusGeometry(0.9, 0.05, 4, 24), 0, 0.11, 0, Math.PI / 2), 0xf0e4c4, 0.03));
  return merge(parts);
}
// A timber bridge deck with rails, on stone piers.
export function bridge(len, w) {
  const parts = [];
  for (let i = 0; i < Math.ceil(len / 0.5); i++) parts.push(P(place(new THREE.BoxGeometry(w, 0.12, 0.46), 0, 0, -len / 2 + i * 0.5 + 0.25), i % 2 ? 0xa8743e : 0x946234, 0.1, i));
  for (const s of [-1, 1]) {
    parts.push(P(place(new THREE.BoxGeometry(0.14, 0.14, len), s * (w / 2 - 0.07), 0.95, 0), 0x6e4c2e, 0.06));
    for (let i = 0; i <= len / 2; i++) parts.push(P(place(new THREE.BoxGeometry(0.14, 0.95, 0.14), s * (w / 2 - 0.07), 0.48, -len / 2 + i * 2), 0x6e4c2e, 0.06, i + 50));
  }
  for (const z of [-len / 4, len / 4]) parts.push(P(place(new THREE.BoxGeometry(w * 0.8, 3.5, 1.2), 0, -1.85, z), 0x9a9488, 0.15, z > 0 ? 70 : 71));
  return merge(parts);
}
export { bevelBox };
