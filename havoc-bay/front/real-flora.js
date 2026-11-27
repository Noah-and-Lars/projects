/* Island Front, Realistic mode: European countryside plants.
   Mixed woods of oak, beech, birch, Norway spruce and Scots pine with hazel undergrowth, each tree in three levels of detail
   (a full model with branches and leaf sprays, a lighter model, a billboard far away). The leaf cards' normals are bent onto
   a sphere round each crown so a tree shades as one volume. Hedgerows round the fields, wind-blown grass blades, wheat, ferns. */
'use strict';
const FL = { built: false };
const REAL_CAM = { value: new THREE.Vector3(1e9, 0, 1e9) };
const FCELL = 512;                                             // foliage atlas: 4 x 2 cells of 512 px
const FC = { oak: 0, beech: 1, birch: 2, hazel: 3, spruce: 4, pine: 5, fern: 6, hedge: 7 };
const NEAR_R = 140, FAR_R = 620;                               // full model < 140 m, light model < 620 m, billboard beyond

/* ---------------- foliage and bark textures ---------------- */
// a cut-out texture with its own mip chain: colour bleeds into the see-through texels, and each smaller level's alpha is
// scaled so the same share of it passes the alpha test (otherwise leaves and needles thin away to nothing at a distance)
function alphaMips(cv, thr = .45) {
  const w0 = cv.width, h0 = cv.height, src = cv.getContext('2d').getImageData(0, 0, w0, h0).data;
  let lv = new Float32Array(w0 * h0 * 4), r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) { const i = (y * w0 + x) * 4, o = ((h0 - 1 - y) * w0 + x) * 4; for (let c = 0; c < 4; c++) lv[o + c] = src[i + c] / 255; if (src[i + 3] > 128) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; } }
  const fill = [r / (n || 1) / 255, g / (n || 1) / 255, b / (n || 1) / 255];
  const cover = (A, s) => { let c = 0; for (let i = 3; i < A.length; i += 4) if (A[i] * s > thr) c++; return c / (A.length / 4); };
  const c0 = cover(lv, 1), mips = []; let w = w0, h = h0;
  const toBytes = (A) => { const out = new Uint8Array(A.length); for (let i = 0; i < A.length; i += 4) { const a = A[i + 3]; for (let c = 0; c < 3; c++) out[i + c] = (a > .02 ? A[i + c] : fill[c]) * 255; out[i + 3] = Math.min(1, a) * 255; } return out; };
  mips.push({ data: toBytes(lv), width: w, height: h });
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), nx = new Float32Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let sa = 0, sr = 0, sg = 0, sb = 0, k = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const xx = Math.min(w - 1, x * 2 + dx), yy = Math.min(h - 1, y * 2 + dy), i = (yy * w + xx) * 4, a = lv[i + 3]; sa += a; sr += lv[i] * a; sg += lv[i + 1] * a; sb += lv[i + 2] * a; k++; }
      const o = (y * nw + x) * 4; nx[o + 3] = sa / k; if (sa > 1e-4) { nx[o] = sr / sa; nx[o + 1] = sg / sa; nx[o + 2] = sb / sa; } else { nx[o] = fill[0]; nx[o + 1] = fill[1]; nx[o + 2] = fill[2]; }
    }
    let lo = .5, hi = 6; for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2; if (cover(nx, m) < c0) lo = m; else hi = m; }
    for (let i = 3; i < nx.length; i += 4) nx[i] = Math.min(1, nx[i] * hi);
    lv = nx; w = nw; h = nh; mips.push({ data: toBytes(lv), width: w, height: h });
  }
  const t = new THREE.DataTexture(mips[0].data, w0, h0, THREE.RGBAFormat); t.mipmaps = mips; t.generateMipmaps = false;
  t.encoding = THREE.sRGBEncoding; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t;
}
function leafPath(g, kind, L, W) { // a leaf with its stalk at (0,0) pointing up the canvas (-y)
  const side = [], n = 18;
  for (let k = 0; k <= n; k++) {
    const t = k / n; let w;
    if (kind === 'oak') w = W * Math.sin(Math.PI * Math.pow(t, .8)) * (.6 + .4 * Math.abs(Math.sin(t * Math.PI * 4.5)));
    else if (kind === 'birch') w = W * Math.pow(t < .38 ? t / .38 : (1 - t) / .62, .85);
    else if (kind === 'hazel') w = W * Math.pow(Math.sin(Math.PI * Math.pow(t, .7)), .8);
    else if (kind === 'fern') w = W * (1 - t) * .9 + W * .1 * Math.sin(t * 30) * (1 - t);
    else w = W * Math.pow(Math.sin(Math.PI * Math.pow(t, .9)), .9); // beech
    side.push([w, -t * L]);
  }
  g.beginPath(); g.moveTo(0, 0); for (const p of side) g.lineTo(p[0], p[1]); for (let k = side.length - 1; k >= 0; k--) g.lineTo(-side[k][0], side[k][1]); g.closePath();
}
function drawLeaf(g, kind, x, y, ang, L, W, col, R) {
  g.save(); g.translate(x, y); g.rotate(ang);
  leafPath(g, kind, L, W);
  const k = .82 + R() * .36, gr = g.createLinearGradient(-W, 0, W, -L * .3);
  gr.addColorStop(0, rgb(col, k * 1.18)); gr.addColorStop(.5, rgb(col, k)); gr.addColorStop(1, rgb(col, k * .72));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = rgb(col, k * 1.35); g.lineWidth = Math.max(.8, W * .08); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L * .92); g.stroke();
  g.restore();
}
function spray(g, kind, cx, R, o) { // a twig with leaves along it, growing up from the bottom of the cell
  const S = FCELL;
  const twig = (x, y, ang, len, w, depth) => {
    const n = 7; let px = x, py = y, a = ang;
    for (let k = 0; k < n; k++) {
      const t = k / n, nx = px + Math.sin(a) * len / n, ny = py - Math.cos(a) * len / n;
      g.strokeStyle = o.twig; g.lineWidth = w * (1 - t * .7); g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      if (t > o.bare) for (const sd of [-1, 1]) if (R() < o.dens) { const L = o.L * (.7 + R() * .5) * (1 - t * .35); drawLeaf(g, kind, nx, ny, a + sd * (o.spread + R() * .5), L, L * o.ratio, o.cols[(R() * o.cols.length) | 0], R); }
      if (depth < 2 && k > 1 && R() < .5) twig(nx, ny, a + (R() < .5 ? -1 : 1) * (.5 + R() * .4), len * (.45 + R() * .2), w * .6, depth + 1);
      a += (R() - .5) * .25; px = nx; py = ny;
    }
    drawLeaf(g, kind, px, py, a, o.L, o.L * o.ratio, o.cols[0], R);
  };
  for (let k = 0; k < o.stems; k++) twig(cx + (R() - .5) * S * .3, S - 4, (R() - .5) * 1.1, S * (.62 + R() * .3), 5, 0);
}
function needleFrond(g, cx, R) { // a spruce branch: a stem with side shoots, all furred with short needles
  const S = FCELL, cols = [[34, 56, 36], [42, 66, 40], [28, 48, 32], [52, 76, 46]];
  const needles = (x0, y0, x1, y1, len, n) => { for (let k = 0; k < n; k++) { const t = k / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t), a = Math.atan2(x1 - x0, -(y1 - y0)); for (const sd of [-1, 1]) { const aa = a + sd * (.7 + R() * .5), l = len * (.7 + R() * .5) * (1 - t * .4); g.strokeStyle = rgb(cols[(R() * 4) | 0], .9 + R() * .3); g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(aa) * l, y - Math.cos(aa) * l); g.stroke(); } } };
  const top = 20, bot = S - 6;
  g.strokeStyle = '#4a3a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx, bot); g.lineTo(cx, top); g.stroke();
  for (let y = bot - 20; y > top + 20; y -= 22 + R() * 8) {
    const t = (bot - y) / (bot - top), L = (1 - t) * 170 + 30;
    for (const sd of [-1, 1]) { const x1 = cx + sd * L * .8, y1 = y - L * .6; g.strokeStyle = '#4a3a2a'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx, y); g.lineTo(x1, y1); g.stroke(); needles(cx, y, x1, y1, 22, Math.ceil(L / 3)); }
  }
  needles(cx, bot, cx, top, 18, 70);
}
function pineTufts(g, R) {
  const S = FCELL, cols = [[70, 92, 60], [80, 102, 66], [60, 82, 54], [92, 110, 72]];
  for (let k = 0; k < 9; k++) {
    const x = 70 + R() * (S - 140), y = 90 + R() * (S - 170), a = (R() - .5) * 1.4, len = 70 + R() * 50;
    g.strokeStyle = '#6a4a32'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - Math.sin(a) * 60, y + Math.cos(a) * 60); g.lineTo(x, y); g.stroke();
    for (let q = 0; q < 70; q++) { const aa = a + (R() - .5) * 2.4, l = len * (.6 + R() * .5), ox = x - Math.sin(a) * R() * 50, oy = y + Math.cos(a) * R() * 50; g.strokeStyle = rgb(cols[(R() * 4) | 0], .85 + R() * .3); g.lineWidth = 1.8; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.sin(aa) * l, oy - Math.cos(aa) * l); g.stroke(); }
  }
}
function fernFrond(g, R) {
  const S = FCELL, col = [[78, 112, 44], [88, 122, 50], [70, 100, 40]];
  for (let f = 0; f < 3; f++) {
    const x0 = S / 2 + (f - 1) * 110, bend = (f - 1) * .5 + (R() - .5) * .3; let px = x0, py = S - 4, a = bend * .3;
    for (let k = 0; k < 26; k++) {
      const t = k / 26, nx = px + Math.sin(a) * 17, ny = py - Math.cos(a) * 17; g.strokeStyle = '#4c5e2a'; g.lineWidth = 3 * (1 - t * .6); g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      if (k > 2) for (const sd of [-1, 1]) { const L = 70 * Math.sin(Math.PI * Math.min(1, (t - .08) * 1.15)) + 8; drawLeaf(g, 'fern', nx, ny, a + sd * 1.25, L, 9, col[(R() * 3) | 0], R); }
      a += bend * .06; px = nx; py = ny;
    }
  }
}
function makeFloraTextures() {
  if (FL.leaf) return;
  const A = canvasOf(FCELL * 4, FCELL * 2), ag = A.getContext('2d'), R = rng(9090);
  const cell = (k, fn) => { const cv = canvasOf(FCELL), g = cv.getContext('2d'); g.lineCap = 'round'; fn(g); ag.drawImage(cv, (k % 4) * FCELL, ((k / 4) | 0) * FCELL); };
  cell(FC.oak, g => spray(g, 'oak', FCELL / 2, R, { stems: 3, L: 46, ratio: .5, spread: .9, dens: .95, bare: .1, twig: '#4a3b2b', cols: [[52, 76, 32], [60, 84, 36], [46, 68, 30], [66, 88, 40]] }));
  cell(FC.beech, g => spray(g, 'beech', FCELL / 2, R, { stems: 3, L: 40, ratio: .45, spread: 1.1, dens: .95, bare: .05, twig: '#55463a', cols: [[66, 98, 36], [76, 108, 40], [58, 88, 32], [84, 112, 44]] }));
  cell(FC.birch, g => spray(g, 'birch', FCELL / 2, R, { stems: 4, L: 26, ratio: .5, spread: .9, dens: .85, bare: .05, twig: '#5a4a3a', cols: [[92, 124, 48], [104, 134, 54], [84, 114, 44], [114, 140, 60]] }));
  cell(FC.hazel, g => spray(g, 'hazel', FCELL / 2, R, { stems: 3, L: 42, ratio: .62, spread: 1.0, dens: .9, bare: .08, twig: '#5a4630', cols: [[62, 92, 38], [72, 100, 42], [56, 84, 34]] }));
  cell(FC.spruce, g => needleFrond(g, FCELL / 2, R));
  cell(FC.pine, g => pineTufts(g, R));
  cell(FC.fern, g => fernFrond(g, R));
  cell(FC.hedge, g => { for (let k = 0; k < 900; k++) { const a = R() * TAU, r = Math.sqrt(R()) * FCELL * .47, x = FCELL / 2 + Math.cos(a) * r, y = FCELL / 2 + Math.sin(a) * r * .9; drawLeaf(g, R() < .5 ? 'hazel' : 'beech', x, y, R() * TAU, 20 + R() * 10, 10 + R() * 4, [[48, 74, 30], [58, 84, 34], [42, 64, 28], [66, 90, 38]][(R() * 4) | 0], R); } });
  FL.leaf = alphaMips(A);
  { // bark: brown furrowed on the left half, birch on the right
    const S = 256, n = tfbm(S, 4, 4, 9191), cv = canvasOf(S), g = cv.getContext('2d'), img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, o = i * 4;
      if (x < S / 2) { const f = Math.abs(Math.sin((x / (S / 2)) * Math.PI * 7 + n[i] * 5)), v = .55 + .45 * Math.pow(f, .6) + n[i] * .15; img.data[o] = 92 * v; img.data[o + 1] = 78 * v; img.data[o + 2] = 64 * v; }
      else { const v = 1 + n[i] * .08, dark = Math.abs(Math.sin(y * .23 + n[i] * 6)) > .93 ? .25 : n[(i * 7) % (S * S)] > .45 ? .45 : 1; img.data[o] = 222 * v * dark; img.data[o + 1] = 218 * v * dark; img.data[o + 2] = 206 * v * dark; }
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0); FL.bark = texOf(cv); FL.bark.wrapS = THREE.ClampToEdgeWrapping;
  }
  { // a solid mass of hedge leaves for the hedgerow bodies
    const S = 512, cv = canvasOf(S), g = cv.getContext('2d'), Rh = rng(5150); g.fillStyle = '#24341a'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 6500; k++) { const x = Rh() * S, y = Rh() * S; for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) if (Math.abs(x + ox - S / 2) < S * .6 && Math.abs(y + oy - S / 2) < S * .6) drawLeaf(g, Rh() < .5 ? 'hazel' : 'beech', x + ox, y + oy, Rh() * TAU, 11 + Rh() * 7, 5.5 + Rh() * 3, [[48, 74, 30], [58, 84, 34], [40, 60, 26], [66, 90, 38], [74, 94, 40]][(Rh() * 5) | 0], Rh); }
    FL.hedgeMass = texOf(cv);
  }
}

/* ---------------- tree models ---------------- */
class FG { // geometry under construction
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
  vert(p, n, u, c) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.u.push(u[0], u[1]); this.c.push(c[0], c[1], c[2]); return this.v++; }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.i), 1)); g.computeBoundingSphere(); g.computeBoundingBox(); return g; }
}
const v3add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k], v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3len = a => Math.hypot(a[0], a[1], a[2]), v3norm = a => { const l = v3len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const v3cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function limbSeg(G, a, b, ra, rb, sides, birch, tint, va) { // a tapered bark tube from a to b
  const d = v3norm(v3sub(b, a)), ref = Math.abs(d[1]) > .9 ? [1, 0, 0] : [0, 1, 0], e1 = v3norm(v3cross(d, ref)), e2 = v3cross(d, e1), L = v3len(v3sub(b, a)), u0 = birch ? .5 : 0, base = G.v;
  for (let s = 0; s <= sides; s++) {
    const an = s / sides * TAU, n = v3add(v3add([0, 0, 0], e1, Math.cos(an)), e2, Math.sin(an));
    G.vert(v3add(a, n, ra), n, [u0 + .5 * s / sides, va / 2.2], tint); G.vert(v3add(b, n, rb), n, [u0 + .5 * s / sides, (va + L) / 2.2], tint);
  }
  for (let s = 0; s < sides; s++) { const q = base + s * 2; G.i.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  return va + L;
}
function leafCard(G, ctr, up, side, w, h, cell, nfn, aofn, tint, bend = 0) { // a leaf spray card (optionally bent along its length)
  const cu = (cell % 4) / 4, cv = 1 - (((cell / 4) | 0) + 1) / 2, rows = bend ? 3 : 2, base = G.v;
  const fwd = v3norm(v3cross(side, up));
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1), c = v3add(v3add(ctr, up, (t - .5) * h), fwd, bend * (t - .5) * (t - .5) * h * 2 - bend * h * .25);
    for (const s of [-.5, .5]) { const p = v3add(c, side, s * w); G.vert(p, nfn(p), [cu + (s + .5) * .25 * .98 + .0025, cv + t * .5 * .98 + .005], v3mulC(tint, aofn(p))); }
  }
  for (let r = 0; r < rows - 1; r++) { const q = base + r * 2; G.i.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
}
const v3mulC = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
function randDir(R) { const z = R() * 2 - 1, a = R() * TAU, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), z, r * Math.sin(a)]; }
function crownFns(C, rad, upBias = .35) { // normals bent onto the crown's ellipsoid; darker deep inside and underneath
  return {
    nfn: p => { const q = [(p[0] - C[0]) / rad[0], (p[1] - C[1]) / rad[1], (p[2] - C[2]) / rad[2]]; return v3norm(v3add(v3norm(q), [0, 1, 0], upBias)); },
    aofn: p => { const q = [(p[0] - C[0]) / rad[0], (p[1] - C[1]) / rad[1], (p[2] - C[2]) / rad[2]], r = v3len(q); return clamp(.45 + .6 * r, .4, 1.05) * (.78 + .22 * clamp(q[1] * .5 + .5, 0, 1)); },
  };
}
function genBroad(sp, lod, seed) { // oak, beech, birch: a trunk and limbs reaching into a crown made of clustered lobes, leaf sprays on each lobe
  const R = rng(seed), W = new FG(), F = new FG(), H = sp.h, near = lod === 0;
  const C = [(R() - .5) * H * .06, H * sp.cy, (R() - .5) * H * .06], rad = [H * sp.rx * (.9 + R() * .2), H * sp.ry, H * sp.rx * (.9 + R() * .2)], crown = crownFns(C, rad);
  const bt = sp.barkTint, birch = !!sp.birch, trunkTop = [C[0] * .6, C[1] - rad[1] * .25, C[2] * .6];
  // the crown's lobes: clumps of foliage round the upper part of the crown, each shading as its own rounded mass
  const lobes = [], nLobe = (sp.lobes || 6) + ((R() * 2) | 0);
  for (let k = 0; k < nLobe; k++) { const az = k / nLobe * TAU + R() * .6, el = k === nLobe - 1 ? 1.4 : lerp(-.25, .85, R()), d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)], f = .45 + R() * .08;
    lobes.push({ c: [C[0] + d[0] * rad[0] * f, C[1] + d[1] * rad[1] * f, C[2] + d[2] * rad[2] * f], r: [rad[0] * (.5 + R() * .12), rad[1] * (.5 + R() * .12), rad[2] * (.5 + R() * .12)] }); }
  const lobeOf = p => { let best = lobes[0], bd = 1e9; for (const L of lobes) { const q = [(p[0] - L.c[0]) / L.r[0], (p[1] - L.c[1]) / L.r[1], (p[2] - L.c[2]) / L.r[2]], d = v3len(q); if (d < bd) { bd = d; best = L; } } return best; };
  const nfn = p => { const L = lobeOf(p), ln = v3norm([(p[0] - L.c[0]) / L.r[0], (p[1] - L.c[1]) / L.r[1], (p[2] - L.c[2]) / L.r[2]]), cn = crown.nfn(p); return v3norm(v3add(v3add(v3mulC(ln, .6), cn, .5), [0, 1, 0], .15)); };
  const aofn = p => { const L = lobeOf(p), r = v3len([(p[0] - L.c[0]) / L.r[0], (p[1] - L.c[1]) / L.r[1], (p[2] - L.c[2]) / L.r[2]]); return crown.aofn(p) * (.72 + .3 * clamp(r, 0, 1)); };
  const onLobe = (L, d, r) => [L.c[0] + d[0] * L.r[0] * r, L.c[1] + d[1] * L.r[1] * r, L.c[2] + d[2] * L.r[2] * r];
  // trunk with a slight wander
  let va = 0, prev = [0, -.6, 0];
  const tn = near ? 4 : 1;
  for (let k = 1; k <= tn; k++) { const t = k / tn, p = [trunkTop[0] * t + (near ? (R() - .5) * .25 : 0), lerp(-.6, trunkTop[1], t), trunkTop[2] * t + (near ? (R() - .5) * .25 : 0)]; va = limbSeg(W, prev, p, sp.r0 * lerp(1.15, .62, (k - 1) / tn), sp.r0 * lerp(1.15, .62, t), near ? 8 : 5, birch, bt, va); prev = p; }
  const tips = [];
  for (const [k, L] of lobes.entries()) { // one limb into each lobe, twigs out to its surface
    if (!near && k % 2) continue;
    const start = k === lobes.length - 1 ? trunkTop : v3add([0, 0, 0], trunkTop, lerp(.72, 1, R())), tgt = L.c;
    const mid = v3add(v3add(start, v3sub(tgt, start), .5), [0, .4 + R() * .5, 0]);
    let vv = limbSeg(W, start, mid, sp.r0 * .5, sp.r0 * .3, near ? 6 : 4, birch, bt, 0); limbSeg(W, mid, tgt, sp.r0 * .3, sp.r0 * .12, near ? 5 : 3, birch, bt, vv);
    if (near) for (let b = 0; b < sp.twigs; b++) { const from = v3add(mid, v3sub(tgt, mid), .4 + R() * .6), end = onLobe(L, randDir(R), .85 + R() * .15); limbSeg(W, from, end, sp.r0 * .09, sp.r0 * .025, 3, birch, bt, 0); tips.push(end, v3add(from, v3sub(end, from), .55)); }
    tips.push(tgt);
  }
  const tint = sp.leafTint, cell = sp.cell;
  const card = (p, s) => { const L = lobeOf(p), out = v3norm(v3add(v3norm(v3sub(p, L.c)), v3norm(v3sub(p, C)), .6)), up = v3norm(v3add(v3add(out, randDir(R), .7), [0, .35, 0])), side = v3norm(v3cross(up, randDir(R))); leafCard(F, v3add(p, up, s * .3), up, side, s, s, cell, nfn, aofn, tint, near ? .12 : 0); };
  if (near) {
    for (const t of tips) for (let k = 0; k < sp.perTip; k++) card(v3add(t, randDir(R), sp.leaf * .35), sp.leaf * (.8 + R() * .4));
    for (let k = 0; k < sp.fill; k++) { const L = lobes[(R() * lobes.length) | 0], d = randDir(R); card(onLobe(L, d, .6 + Math.sqrt(R()) * .4), sp.leaf * (.85 + R() * .4)); }
  } else for (let k = 0; k < sp.midCards; k++) { const L = lobes[k % lobes.length]; card(onLobe(L, randDir(R), .55 + R() * .35), Math.max(L.r[0], L.r[1]) * 1.05); }
  return { wood: W.geo(), leaf: F.geo() };
}
function genSpruce(sp, lod, seed) { // Norway spruce: whorls of drooping needle fronds round a straight trunk
  const R = rng(seed), W = new FG(), F = new FG(), H = sp.h, near = lod === 0, base = H * .1, R0 = H * sp.rw;
  limbSeg(W, [0, -.6, 0], [0, H * .5, 0], .34, .2, near ? 7 : 5, false, sp.barkTint, 0); limbSeg(W, [0, H * .5, 0], [0, H, 0], .2, .03, near ? 5 : 3, false, sp.barkTint, H * .5);
  const step = near ? .6 : 1.4, per = near ? 5 : 4; let wi = 0;
  for (let y = base; y < H - .7; y += step * (.9 + R() * .2), wi++) {
    const t = (y - base) / (H - base), r = R0 * Math.pow(1 - t, .85) + .35;
    for (let k = 0; k < per + (t < .3 ? 1 : 0); k++) {
      const az = wi * 2.4 + k / per * TAU + (R() - .5) * .5, dir = [Math.cos(az), 0, Math.sin(az)], droop = .32 + R() * .15 - t * .15;
      const p0 = [dir[0] * .15, y, dir[2] * .15], p1 = [dir[0] * r, y - r * droop, dir[2] * r], len = v3len(v3sub(p1, p0)), up = v3norm(v3sub(p1, p0));
      const side0 = [-Math.sin(az), 0, Math.cos(az)], roll = (R() - .5) * .3;
      const nfn = p => { const h = Math.hypot(p[0], p[2]) || 1; return v3norm([p[0] / h, .55 + (p[1] - y) * .05, p[2] / h]); };
      const aofn = p => (.5 + .55 * Math.min(1, Math.hypot(p[0], p[2]) / r)) * (.8 + .25 * t);
      for (const rl of [-.62, .62]) { // two cards crossed along the branch, so it never shows edge-on
        const c = Math.cos(rl + roll), sn = Math.sin(rl + roll), side = v3norm(v3add(v3mulC(side0, c), v3cross(up, side0), sn));
        leafCard(F, v3add(p0, up, len / 2), up, side, Math.max(1.0, r * .8), len * 1.06, FC.spruce, nfn, aofn, sp.leafTint, near ? -.14 : 0);
      }
    }
  }
  const nfnTop = p => v3norm([p[0], 1, p[2]]);
  for (const a of [0, Math.PI / 2]) leafCard(F, [0, H - .4, 0], [0, 1, 0], [Math.cos(a), 0, Math.sin(a)], 1.1, 1.8, FC.spruce, nfnTop, () => 1, sp.leafTint);
  return { wood: W.geo(), leaf: F.geo() };
}
function genPine(sp, lod, seed) { // Scots pine: a tall bare trunk, orange above, and a flat-topped crown of needle clumps
  const R = rng(seed), W = new FG(), F = new FG(), H = sp.h, near = lod === 0;
  const C = [(R() - .5) * 1.2, H * .8, (R() - .5) * 1.2], rad = [H * .21, H * .12, H * .21], cr = crownFns(C, rad, .5);
  const bend = [(R() - .5) * .8, 0, (R() - .5) * .8];
  let va = limbSeg(W, [0, -.6, 0], [bend[0] * .5, H * .4, bend[2] * .5], .36, .25, near ? 7 : 5, false, sp.barkTint, 0);
  limbSeg(W, [bend[0] * .5, H * .4, bend[2] * .5], [C[0], H * .86, C[2]], .25, .12, near ? 6 : 4, false, [1.25, .78, .55], va);
  const nb = near ? 8 : 5;
  for (let k = 0; k < nb; k++) {
    const az = k / nb * TAU + R() * .6, el = .15 + R() * .5, dir = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
    const s = [C[0] * lerp(.4, 1, R()), H * lerp(.62, .84, R()), C[2] * lerp(.4, 1, R())], e = [C[0] + dir[0] * rad[0] * .85, C[1] + dir[1] * rad[1] * .8, C[2] + dir[2] * rad[2] * .85];
    limbSeg(W, s, e, .13, .05, near ? 4 : 3, false, [1.2, .8, .6], 0);
    const nc = near ? 9 : 4;
    for (let q = 0; q < nc; q++) {
      const p = v3add(e, randDir(R), near ? 1.4 : 1.0), up = v3norm(v3add([dir[0], .15, dir[2]], randDir(R), .5)), side = v3norm(v3cross(up, [0, 1, 0])), sz = near ? 2.4 + R() * .8 : rad[0] * .8;
      leafCard(F, p, up, v3norm(v3add(side, [0, 1, 0], (R() - .5) * .8)), sz, sz, FC.pine, cr.nfn, cr.aofn, sp.leafTint);
    }
  }
  return { wood: W.geo(), leaf: F.geo() };
}
function genBush(sp, lod, seed) { // hazel or yew: a few stems and a dome of leaf sprays
  const R = rng(seed), W = new FG(), F = new FG(), H = sp.h, near = lod === 0;
  const C = [0, H * .52, 0], rad = [H * sp.rx, H * .5, H * sp.rx], { nfn, aofn } = crownFns(C, rad, .3);
  if (near) for (let k = 0; k < 5; k++) { const d = randDir(R); limbSeg(W, [0, -.3, 0], [d[0] * rad[0] * .6, H * (.5 + R() * .3), d[2] * rad[2] * .6], .05, .02, 3, false, sp.barkTint, 0); }
  const n = near ? sp.fill : sp.midCards;
  for (let k = 0; k < n; k++) {
    const d = randDir(R); d[1] = Math.abs(d[1]) * .9 - .1; const r = .5 + Math.sqrt(R()) * .5, p = [C[0] + d[0] * rad[0] * r, C[1] + d[1] * rad[1] * r, C[2] + d[2] * rad[2] * r];
    const out = v3norm(v3sub(p, C)), up = v3norm(v3add(v3add(out, randDir(R), .6), [0, .4, 0])), side = v3norm(v3cross(up, randDir(R))), s = (near ? sp.leaf : H * .55) * (.8 + R() * .4);
    leafCard(F, v3add(p, up, s * .25), up, side, s, s, sp.cell, nfn, aofn, sp.leafTint);
  }
  return { wood: W.geo(), leaf: F.geo() };
}
const SPECIES = {
  oak: { gen: genBroad, cell: FC.oak, h: 15, rx: .36, ry: .3, cy: .6, r0: .42, limbs: 7, twigs: 4, perTip: 3, leaf: 2.1, fill: 80, midCards: 34, lobes: 7, elev: [.1, .75], barkTint: [1, 1, 1], leafTint: [.95, 1, .9] },
  beech: { gen: genBroad, cell: FC.beech, h: 19, rx: .26, ry: .34, cy: .6, r0: .36, limbs: 7, twigs: 4, perTip: 3, leaf: 2.1, fill: 84, midCards: 34, lobes: 6, elev: [.35, 1.0], barkTint: [1.35, 1.35, 1.45], leafTint: [1, 1, .95] },
  birch: { gen: genBroad, cell: FC.birch, h: 15, rx: .16, ry: .32, cy: .62, r0: .2, limbs: 7, twigs: 3, perTip: 3, leaf: 1.4, fill: 52, midCards: 24, lobes: 5, elev: [.6, 1.2], barkTint: [1, 1, 1], leafTint: [1, 1, .95], birch: true },
  spruce: { gen: genSpruce, cell: FC.spruce, h: 22, rw: .2, barkTint: [.9, .85, .8], leafTint: [.95, 1, 1] },
  pine: { gen: genPine, cell: FC.pine, h: 19, barkTint: [.95, .85, .78], leafTint: [1, 1, .95] },
  hazel: { gen: genBush, cell: FC.hazel, h: 4.2, rx: .62, leaf: 1.5, fill: 30, midCards: 9, barkTint: [1, 1, 1], leafTint: [1, 1, .95] },
  yew: { gen: genBush, cell: FC.spruce, h: 7, rx: .38, leaf: 1.6, fill: 46, midCards: 12, barkTint: [1, 1, 1], leafTint: [.62, .72, .7] },
};
const SP_KEYS = Object.keys(SPECIES).flatMap(k => k === 'hazel' || k === 'yew' ? [k] : [k, k + '#1']); // two shapes of each tree
const spOf = k => SPECIES[k.split('#')[0]];

/* ---------------- materials: wind, two-sided light, distance culling against the real camera (also in the shadow pass) ---------------- */
function cullPatch(sh, cull, wind) {
  sh.uniforms.uCull = { value: cull }; sh.uniforms.uCam = REAL_CAM; sh.uniforms.uTime = REAL_T;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uCull; uniform vec3 uCam; uniform float uTime;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ipw = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 ipw = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      ${wind ? `{ float wk = ${wind.toFixed(3)} * max(0.0, position.y); transformed.x += sin(uTime * 1.7 + ipw.x * .05 + position.y * .35 + position.z) * wk; transformed.z += cos(uTime * 1.3 + ipw.z * .05 + position.x * .45) * wk; }` : ''}`)
    .replace('#include <project_vertex>', `#include <project_vertex>
      { float dd = distance(ipw.xz, uCam.xz); if (dd < uCull.x || dd >= uCull.y) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`);
}
function plantLight(sh, trans) { // baked hill shadow and sky occlusion, and light shining through leaves when the sun is behind them
  Object.assign(sh.uniforms, { tShade: REAL_SHADE, uWorld: { value: new THREE.Vector2(WORLD_W, WORLD_H) }, uSun: SKY_U.uSun });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform sampler2D tShade; uniform vec2 uWorld; uniform vec3 uSun;')
    .replace('#include <lights_lambert_vertex>', `#include <lights_lambert_vertex>
      { vec2 shd = texture2D(tShade, ipw.xz / uWorld).rg; vLightFront *= shd.r; vIndirectFront *= .55 + .45 * shd.g;
        vec3 wpos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #ifdef USE_INSTANCING
          wpos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #endif
        float back = pow(max(0.0, dot(normalize(wpos - cameraPosition), uSun)), 3.0);
        vLightFront += vec3(1.0, .92, .62) * back * ${trans.toFixed(2)} * shd.r; }`);
}
function floraMat(map, cull, o = {}) {
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest: o.alpha || 0, side: o.alpha ? THREE.DoubleSide : THREE.FrontSide, alphaToCoverage: !!o.alpha });
  m.onBeforeCompile = sh => { cullPatch(sh, cull, o.wind || 0); plantLight(sh, o.alpha ? 1.1 : 0); sh.fragmentShader = sh.fragmentShader.replace(/:\s*vLightBack/g, ': vLightFront').replace(/:\s*vIndirectBack/g, ': vIndirectFront'); };
  m.customProgramCacheKey = () => 'flora' + (o.wind || 0) + (o.alpha ? 'a' : '');
  return m;
}
function floraDepth(map, cull, wind) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map || null, alphaTest: map ? .5 : 0, side: map ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = sh => cullPatch(sh, cull, wind || 0);
  m.customProgramCacheKey = () => 'floraD' + (wind || 0) + (map ? 'a' : '');
  return m;
}
function billboardMatF(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: .32, side: THREE.DoubleSide, fog: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uCull = { value: new THREE.Vector2(FAR_R, 9000) }; sh.uniforms.uCam = REAL_CAM;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uCull; uniform vec3 uCam;').replace('#include <project_vertex>', `
      vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float sc = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
      vec3 toCam = cameraPosition - ip; toCam.y = 0.0; vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
      vec3 wp = ip + right * position.x * sc + vec3(0.0, position.y * sy, 0.0);
      vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
      float dd = distance(ip.xz, uCam.xz); if (dd < uCull.x || dd >= uCull.y) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
  };
  m.customProgramCacheKey = () => 'bbF';
  return m;
}
function impostorOf(sp, wood, leaf, mats) { // the full model drawn from the side into a texture
  const bb = new THREE.Box3().union(wood.boundingBox).union(leaf.boundingBox), w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 1.04, h = bb.max.y * 1.02;
  const rt = new THREE.WebGLRenderTarget(256, 512, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }); rt.texture.encoding = THREE.sRGBEncoding;
  const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, -60, 60);
  sc.add(new THREE.HemisphereLight(0xdfeaf5, 0x3a4a2a, .9)); const dl = new THREE.DirectionalLight(0xfff2dd, 1.7); dl.position.set(-.4, .8, .7); sc.add(dl);
  const lm = mats.leaf.clone(); lm.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace(/:\s*vLightBack/g, ': vLightFront').replace(/:\s*vIndirectBack/g, ': vIndirectFront'); };
  sc.add(new THREE.Mesh(wood, new THREE.MeshLambertMaterial({ map: FL.bark, vertexColors: true })), new THREE.Mesh(leaf, lm));
  cam.position.set(0, 0, 30); cam.lookAt(0, 0, 0);
  const old = renderer.getRenderTarget(), oc = renderer.getClearColor(new THREE.Color()), oa = renderer.getClearAlpha(), fog = scene.fog;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x3c4a30, 0); renderer.clear(); renderer.render(sc, cam); renderer.setRenderTarget(old); renderer.setClearColor(oc, oa);
  return { tex: rt.texture, w, h };
}
function floraModels() {
  if (FL.models) return FL.models;
  makeFloraTextures();
  const out = {};
  for (const k of SP_KEYS) {
    const sp = spOf(k), sd = k.length * 7 + (k.includes('#') ? 991 : 0), near = sp.gen(sp, 0, 101 + sd), mid = sp.gen(sp, 1, 202 + sd);
    out[k] = { near, mid };
  }
  FL.models = out; return out;
}

/* ---------------- placing the plants ---------------- */
function fieldFrames(M) { // the farm field grids round the towns (the terrain shader paints the same fields)
  return M.towns.map(t => ({ x: t.x * 1000, z: t.y * 1000, a: hash2(t.x * 100 | 0, t.y * 100 | 0, 9) * Math.PI }));
}
function cropAt(frames, x, z) { // 0 none, 1 ploughed, 2 wheat, 3 young crop, 4 pasture; -1 on a hedge line
  for (const t of frames) {
    const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz); if (d > 1300 || d < 260) continue;
    const c = Math.cos(t.a), s = Math.sin(t.a), u = dx * c + dz * s, v = -dx * s + dz * c, pu = Math.floor(u / 160), pv = Math.floor(v / 110), k = hash2(pu + 500, pv + 500, 7);
    const edge = Math.min(Math.abs(u / 160 - Math.round(u / 160)) * 160, Math.abs(v / 110 - Math.round(v / 110)) * 110);
    if (edge < 4) return 0;
    FL.cropAng = t.a; return 1 + Math.floor(k * 4) * (d < 1100 ? 1 : 0);
  }
  return 0;
}
function addTree(list, sp, x, z, s, R, sink = .3) { const y = terrainY(x, z), alt = SP_KEYS.indexOf(sp + '#1'); list.push([alt >= 0 && R() < .5 ? alt : SP_KEYS.indexOf(sp), x, y - sink, z, R() * TAU, s, s * (.9 + R() * .22), R()]); }
function buildRealFlora(M) {
  const t0 = performance.now(), mods = floraModels(), R = rng(M.seed * 53 + 1), trees = [];
  FL.frames = fieldFrames(M);
  const houses = REAL.townHouses || [], hg = new Set();
  for (const o of houses) { const r = Math.hypot(o.W, o.D) / 2 + 6; for (let gx = Math.floor((o.x - r) / 32); gx <= Math.floor((o.x + r) / 32); gx++) for (let gz = Math.floor((o.z - r) / 32); gz <= Math.floor((o.z + r) / 32); gz++) hg.add(gx * 4096 + gz); }
  const nearHouse = (x, z, pad) => hg.has(Math.floor(x / 32) * 4096 + Math.floor(z / 32)) && houses.some(o => { const dx = x - o.x, dz = z - o.z, lx = dx * Math.cos(o.ang) + dz * Math.sin(o.ang), lz = -dx * Math.sin(o.ang) + dz * Math.cos(o.ang); return Math.abs(lx) < o.W / 2 + pad && Math.abs(lz) < o.D / 2 + pad; });
  // woods: conifer stands and mixed broadleaf, with birch and hazel thickening the edges
  for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
    const id = j * GW + i; if (!M.F[id]) continue;
    const open = 4 - (M.F[id - 1] + M.F[id + 1] + M.F[id - GW] + M.F[id + GW]), cx = i * CELL, cz = j * CELL, ch = M.H[id];
    const conif = fbm(cx * .0011, cz * .0011, M.seed + 300, 3) + (ch > 220 ? (ch - 220) / 300 : 0), mixed = fbm(cx * .004, cz * .004, M.seed + 301, 2);
    const tries = Math.round((open ? 6 : 7) * (WORLD.ultra ? 1.8 : 1)), p = open ? .55 : .74; // (Ultra: closer to a real wood's stocking, so the canopy closes when seen from the air)
    for (let n = 0; n < tries; n++) {
      if (R() > p) continue;
      const x = (i + R() - .5) * CELL, z = (j + R() - .5) * CELL; if (terrainY(x, z) < 4 || onRoad(x, z)) continue;
      let sp; const r = R();
      if (conif + mixed * .25 > .14) sp = r < (ch > 360 ? .5 : .74) ? 'spruce' : 'pine';
      else if (open) sp = r < .4 ? 'birch' : r < .72 ? 'oak' : 'beech';
      else sp = r < .14 ? 'birch' : r < .55 ? 'oak' : 'beech';
      const young = R() < .12, s = young ? .42 + R() * .2 : .72 + R() * .45;
      addTree(trees, sp, x, z, s, R);
    }
    if (open) for (let n = 0; n < 2 + open; n++) { // edge scrub, pushed out towards the open side
      if (R() > .6) continue;
      const ox = (M.F[id + 1] ? 0 : .4) - (M.F[id - 1] ? 0 : .4), oz = (M.F[id + GW] ? 0 : .4) - (M.F[id - GW] ? 0 : .4);
      const x = (i + R() - .5 + ox) * CELL, z = (j + R() - .5 + oz) * CELL; if (terrainY(x, z) < 4 || onRoad(x, z)) continue;
      addTree(trees, 'hazel', x, z, .7 + R() * .6, R, .2);
    }
  }
  // fruit and shade trees in the gardens, yews in the churchyards
  for (const [gx2, gy2] of M.gardens || []) { if (R() < .35) continue; const x = gx2 * 1000 + (R() - .5) * 6, z = gy2 * 1000 + (R() - .5) * 6; if (terrainY(x, z) < 3 || onRoad(x, z) || nearHouse(x, z, 2.5)) continue; addTree(trees, R() < .6 ? 'oak' : R() < .5 ? 'birch' : 'beech', x, z, .42 + R() * .25, R); }
  for (const e of REAL.hedgeExtra || []) if (e.yew) addTree(trees, 'yew', e.x, e.z, .8 + R() * .3, R, .1); else if (e.tree) addTree(trees, e.tree, e.x, e.z, e.s, R);
  FL.hedges = buildHedges(M, trees, R, nearHouse);
  // sort the trees into 64 m bins for picking the near ones quickly
  const BIN = 64, BW = Math.ceil(WORLD_W / BIN), BH = Math.ceil(WORLD_H / BIN), bins = Array.from({ length: BW * BH }, () => []);
  trees.forEach((t, k) => { const bx = clamp(Math.floor(t[1] / BIN), 0, BW - 1), bz = clamp(Math.floor(t[3] / BIN), 0, BH - 1); bins[bz * BW + bx].push(k); });
  Object.assign(FL, { trees, bins, BIN, BW, BH, lastNear: new V3(1e9, 0, 1e9), lastMid: new V3(1e9, 0, 1e9) });
  // instanced meshes: near and mid sets refilled as the camera moves; billboards in 2 km tiles
  FL.near = {}; FL.mid = {};
  const count = SP_KEYS.map(() => 0); for (const t of trees) count[t[0]]++;
  FL.mats = {};
  SP_KEYS.forEach((k, si) => {
    if (!count[si]) return;
    const m = mods[k], wind = k.startsWith('spruce') || k.startsWith('pine') ? .006 : .012;
    const mk = (lod, cull, cap) => {
      const geo = lod ? m.mid : m.near, cv = new THREE.Vector2(cull[0], cull[1]);
      const leafM = floraMat(FL.leaf, cv, { alpha: .45, wind }), woodM = floraMat(FL.bark, cv, {});
      const wood = new THREE.InstancedMesh(geo.wood, woodM, cap), leaf = new THREE.InstancedMesh(geo.leaf, leafM, cap);
      for (const im of [wood, leaf]) { im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.count = 0; im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); WORLD.group.add(im); }
      leaf.customDepthMaterial = floraDepth(FL.leaf, cv, wind); wood.customDepthMaterial = floraDepth(null, cv, 0);
      if (!lod) FL.mats[k] = { leaf: leafM };
      return { wood, leaf, cap, cull: cv };
    };
    FL.near[si] = mk(0, [0, NEAR_R], Math.min(count[si], 2500));
    FL.mid[si] = mk(1, [NEAR_R, FAR_R], Math.min(count[si], 16000));
  });
  if (!FL.bb) FL.bb = {};
  const TILE = 2000, tiles = new Map(), dummy = new THREE.Object3D(), col = new THREE.Color();
  for (const t of trees) { const key = t[0] + ':' + Math.floor(t[1] / TILE) + ',' + Math.floor(t[3] / TILE); let a = tiles.get(key); if (!a) tiles.set(key, a = []); a.push(t); }
  for (const [key, list] of tiles) {
    const si = +key.split(':')[0], k = SP_KEYS[si];
    if (!FL.bb[k]) FL.bb[k] = impostorOf(spOf(k), mods[k].near.wood, mods[k].near.leaf, FL.mats[k]);
    const bb = FL.bb[k], g = new THREE.PlaneGeometry(bb.w, bb.h); g.translate(0, bb.h / 2, 0);
    const im = new THREE.InstancedMesh(g, FL.bbMat && FL.bbMat[k] || ((FL.bbMat = FL.bbMat || {})[k] = billboardMatF(bb.tex)), list.length);
    let cx = 0, cz = 0;
    list.forEach((t, q) => { dummy.position.set(t[1], t[2], t[3]); dummy.rotation.set(0, 0, 0); dummy.scale.set(t[5], t[6], t[5]); dummy.updateMatrix(); im.setMatrixAt(q, dummy.matrix); const c = t[7]; im.setColorAt(q, col.setRGB(.86 + c * .24, .9 + c * .16, .86 + c * .16)); cx += t[1]; cz += t[3]; });
    cx /= list.length; cz /= list.length; let r = 0; for (const t of list) r = Math.max(r, Math.hypot(t[1] - cx, t[3] - cz)); g.boundingSphere = new THREE.Sphere(new V3(cx, list[0][2] + 10, cz), r + 40);
    WORLD.group.add(im);
  }
  buildGrassF();
  FL.built = true;
  console.log('flora', trees.length, 'trees', (performance.now() - t0 | 0) + ' ms');
}
const _fm = new THREE.Matrix4(), _fq = new THREE.Quaternion(), _fp = new V3(), _fs = new V3(), _fu = new V3(0, 1, 0);
function refillTrees(set, cam, r0, r1) {
  const { trees, bins, BIN, BW, BH } = FL, n = SP_KEYS.map(() => 0);
  const b0x = clamp(Math.floor((cam.x - r1) / BIN), 0, BW - 1), b1x = clamp(Math.floor((cam.x + r1) / BIN), 0, BW - 1), b0z = clamp(Math.floor((cam.z - r1) / BIN), 0, BH - 1), b1z = clamp(Math.floor((cam.z + r1) / BIN), 0, BH - 1);
  for (let bz = b0z; bz <= b1z; bz++) for (let bx = b0x; bx <= b1x; bx++) for (const k of bins[bz * BW + bx]) {
    const t = trees[k], d = Math.hypot(t[1] - cam.x, t[3] - cam.z); if (d < r0 || d > r1) continue;
    const S = set[t[0]]; if (!S || n[t[0]] >= S.cap) continue;
    const q = n[t[0]]++; _fq.setFromAxisAngle(_fu, t[4]); _fm.compose(_fp.set(t[1], t[2], t[3]), _fq, _fs.set(t[5], t[6], t[5]));
    _fm.toArray(S.wood.instanceMatrix.array, q * 16); _fm.toArray(S.leaf.instanceMatrix.array, q * 16);
    const c = t[7], ca = S.leaf.instanceColor.array; ca[q * 3] = .86 + c * .24; ca[q * 3 + 1] = .9 + c * .16; ca[q * 3 + 2] = .86 + c * .16; const cw = S.wood.instanceColor.array; cw[q * 3] = cw[q * 3 + 1] = cw[q * 3 + 2] = .85 + c * .3;
  }
  for (const si in set) { const S = set[si]; for (const im of [S.wood, S.leaf]) { im.count = n[si]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; } }
}
function updateFlora(cam) {
  if (!FL.built) return;
  REAL_CAM.value.set(cam.x, cam.y, cam.z);
  if (Math.hypot(cam.x - FL.lastNear.x, cam.z - FL.lastNear.z) > 8) { FL.lastNear.copy(cam); refillTrees(FL.near, cam, 0, NEAR_R + 12); refillHedgeFluff(cam); }
  if (Math.hypot(cam.x - FL.lastMid.x, cam.z - FL.lastMid.z) > 30) { FL.lastMid.copy(cam); refillTrees(FL.mid, cam, NEAR_R - 34, FAR_R + 34); }
  updateGrassF(cam);
}

/* ---------------- hedgerows round the fields ---------------- */
function buildHedges(M, trees, R, nearHouse) {
  const pts = [], runs = [], frames = FL.frames;
  const zones = M.zones.concat(M.towns.map(t => t.zone)), inZone = (x, z) => zones.some(zn => { const dx = x / 1000 - zn.x, dz = z / 1000 - zn.y, c = Math.cos(zn.ang || 0), s = Math.sin(zn.ang || 0); return Math.abs(dx * c + dz * s) < zn.hx + .015 && Math.abs(-dx * s + dz * c) < zn.hy + .015; });
  const ok = (x, z, f) => { const d = Math.hypot(x - f.x, z - f.z); if (d < 280 || d > 1260) return false; const h = terrainY(x, z); if (h < 6) return false; const sl = Math.hypot(terrainY(x + 4, z) - terrainY(x - 4, z), terrainY(x, z + 4) - terrainY(x, z - 4)) / 8; return sl < .3 && !onRoadFine(x, z) && !inForest(x, z) && !inZone(x, z) && !nearHouse(x, z, 3); };
  const T = typeof TB === 'function' ? new TB() : null; let walls = 0;
  frames.forEach((f, fi) => {
    const c = Math.cos(f.a), s = Math.sin(f.a), W = (u, v) => [f.x + u * c - v * s, f.z + u * s + v * c];
    const segs = [];
    for (let pu = -9; pu <= 9; pu++) for (let pv = -12; pv <= 12; pv++) { segs.push([pu * 160, pv * 110, pu * 160, (pv + 1) * 110]); segs.push([pu * 160, pv * 110, (pu + 1) * 160, pv * 110]); }
    for (const [u0, v0, u1, v1] of segs) {
      const h = hash2(u0 + 9000, v0 + 9000 + fi * 777, 31); if (h < .1) continue; // some boundaries are just a strip of grass
      const L = Math.hypot(u1 - u0, v1 - v0), n = Math.round(L / 3), gate = .15 + hash2(u0, v0, 32) * .7, wall = h > .9 && T;
      let run = [];
      const flush = () => { if (run.length > 1) (wall ? (T && wallRun(T, run), walls++) : runs.push(run)); run = []; };
      for (let k = 0; k <= n; k++) {
        const t = k / n; if (Math.abs(t - gate) * L < 3.5) { flush(); continue; }
        const [x, z] = W(lerp(u0, u1, t) + (R() - .5) * .8, lerp(v0, v1, t) + (R() - .5) * .8);
        if (!ok(x, z, f)) { flush(); continue; }
        run.push([x, z]);
        if (!wall && k % 10 === 5 && R() < .3) addTree(trees, R() < .75 ? 'oak' : 'beech', x + (R() - .5) * 2, z + (R() - .5) * 2, .7 + R() * .4, R); // hedgerow oaks
      }
      flush();
    }
  });
  for (const e of REAL.hedgeExtra || []) if (!e.yew && !e.tree) { const L = Math.hypot(e.x1 - e.x0, e.z1 - e.z0), n = Math.max(1, Math.round(L / 2.5)), run = []; for (let k = 0; k <= n; k++) run.push([lerp(e.x0, e.x1, k / n), lerp(e.z0, e.z1, k / n), e.h]); runs.push(run); }
  if (T) T.flush(WORLD.group);
  // the hedge bodies: a rounded, lumpy ribbon per run with a dense leaf texture
  const P = [], N = [], U = [], C = [], I = []; let v = 0;
  for (const run of runs) {
    let along = 0; const base = v;
    for (let k = 0; k < run.length; k++) {
      const [x, z, hh] = run[k], a = run[Math.max(0, k - 1)], b = run[Math.min(run.length - 1, k + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      if (k) along += Math.hypot(x - run[k - 1][0], z - run[k - 1][1]);
      const lump = Math.sin(along * .9 + x * .01) * .5 + Math.sin(along * 2.3) * .3, y = terrainY(x, z) - .3, H = (hh || 2.3) * (.78 + hash2(x | 0, z | 0, 41) * .3 + lump * .14), Wd = (.85 + hash2(x | 0, z | 0, 42) * .25) * (1 + lump * .12);
      const prof = [[-Wd, 0], [-Wd * 1.05, H * .55], [-Wd * .55, H * .95], [0, H * 1.04], [Wd * .55, H * .95], [Wd * 1.05, H * .55], [Wd, 0]];
      prof.forEach(([o, hy], q) => { P.push(x + nx * o, y + hy, z + nz * o); const nn = v3norm([nx * (q / 3 - 1) * 1.2, .55 + Math.sin(q / 6 * Math.PI) * .8, nz * (q / 3 - 1) * 1.2]); N.push(nn[0], nn[1], nn[2]); U.push(along / 2.6, q / 6 * 1.6); const ao = (q === 0 || q === 6 ? .38 : q === 3 ? .9 : .72) * (.85 + hash2(x * 3 | 0, z * 3 | 0, 43) * .3); C.push(ao * .95, ao, ao * .9); v++; });
      if (k) for (let q = 0; q < 6; q++) { const p0 = base + (k - 1) * 7 + q, p1 = base + k * 7 + q; I.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1); }
      if (k % 2 === 0) pts.push([x, y, z, H, Wd, Math.atan2(nz, nx)]);
    }
  }
  if (v) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(I), 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: FL.hedgeMass, vertexColors: true })); m.castShadow = m.receiveShadow = true; m.name = 'hedges'; WORLD.group.add(m);
  }
  // fluffy leaf sprays over the hedge bodies near the camera
  const fg = new FG(), cr = crownFns([0, .9, 0], [1.6, 1.1, 1.0], .4), Rf = rng(77);
  for (let k = 0; k < 24; k++) { const d = randDir(Rf); d[1] = Math.abs(d[1]); const p = [d[0] * 1.5, .8 + d[1] * 1.15, d[2] * .95], up = v3norm(v3add(v3norm([d[0], d[1] + .3, d[2]]), randDir(Rf), .6)), side = v3norm(v3cross(up, randDir(Rf))); leafCard(fg, p, up, side, 1.5, 1.5, FC.hedge, cr.nfn, cr.aofn, [.78, .84, .74]); }
  const cv = new THREE.Vector2(0, 220), im = new THREE.InstancedMesh(fg.geo(), floraMat(FL.leaf, cv, { alpha: .45, wind: .01 }), 6000);
  im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.count = 0; im.customDepthMaterial = floraDepth(FL.leaf, cv, .01); WORLD.group.add(im);
  const BIN = 64, BW = Math.ceil(WORLD_W / BIN), BH = Math.ceil(WORLD_H / BIN), bins = new Map();
  pts.forEach((p, k) => { const key = Math.floor(p[0] / BIN) + Math.floor(p[2] / BIN) * BW; let a = bins.get(key); if (!a) bins.set(key, a = []); a.push(k); });
  console.log('hedges', runs.length, 'runs', pts.length, 'tufts', walls, 'stone walls');
  return { pts, bins, BIN, BW, BH, im };
}
function wallRun(T, run) { for (let k = 0; k < run.length - 1; k++) stoneWallSeg(T, run[k][0], run[k][1], run[k + 1][0], run[k + 1][1], 1.05); }
function refillHedgeFluff(cam) {
  const Hd = FL.hedges; if (!Hd) return;
  const { pts, bins, BIN, BW, im } = Hd, r = 230; let n = 0;
  const b0x = Math.floor((cam.x - r) / BIN), b1x = Math.floor((cam.x + r) / BIN), b0z = Math.floor((cam.z - r) / BIN), b1z = Math.floor((cam.z + r) / BIN);
  for (let bz = b0z; bz <= b1z; bz++) for (let bx = b0x; bx <= b1x; bx++) { const a = bins.get(bx + bz * BW); if (!a) continue; for (const k of a) {
    const p = pts[k]; if (n >= 6000 || Math.hypot(p[0] - cam.x, p[2] - cam.z) > r) continue;
    _fq.setFromAxisAngle(_fu, -p[5] + Math.PI / 2 + (hash2(k, 1, 3) - .5) * .4); _fm.compose(_fp.set(p[0], p[1] + .15, p[2]), _fq, _fs.set(1, p[3] / 2.1, p[4] / .95)); _fm.toArray(im.instanceMatrix.array, n * 16); n++;
  } }
  im.count = n; im.instanceMatrix.needsUpdate = true;
}

/* ---------------- grass: real blades near the camera, finer cards further out, wheat, ferns, pebbles ---------------- */
function bladeClump(nBlades, seed, hMin, hMax, spread, wBase) { // curved, tapering blades in one clump
  const R = rng(seed), P = [], N = [], C = [], U = [], I = []; let v = 0;
  for (let b = 0; b < nBlades; b++) {
    const a = R() * TAU, r = Math.sqrt(R()) * spread, ox = Math.cos(a) * r, oz = Math.sin(a) * r, face = R() * TAU, h = lerp(hMin, hMax, R()), lean = .15 + R() * .5, w = wBase * (.7 + R() * .6);
    const fx = Math.cos(face), fz = Math.sin(face), lx = Math.cos(a + (R() - .5)), lz = Math.sin(a + (R() - .5)); // blade faces along (fx, fz), leans outward (lx, lz)
    const segs = 4, base = v;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, bend = lean * t * t * h, y = h * t * (1 - lean * .25 * t), ww = w * (1 - Math.pow(t, 1.4)) * .5;
      const cx = ox + lx * bend, cz = oz + lz * bend, sh = .42 + .7 * Math.pow(t, .8) + (R() - .5) * .06, tip = Math.max(0, t - .7) * .5;
      for (const sd of s === segs ? [0] : [-1, 1]) {
        P.push(cx - fz * ww * sd, y, cz + fx * ww * sd); const nn = v3norm([lx * .25 + fz * .2 * sd, 1, lz * .25 - fx * .2 * sd]); N.push(nn[0], nn[1], nn[2]);
        C.push(sh * (1 + tip * .6), sh * (1 + tip * .25), sh * (1 - tip * .3)); U.push(sd * .5 + .5, t); v++;
      }
    }
    for (let s = 0; s < segs - 1; s++) { const q = base + s * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    const q = base + (segs - 1) * 2; I.push(q, q + 1, q + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); return g;
}
function meadowGeo(kind, seed) { // wildflowers (a coloured head on each stem) or seed-head stalks
  const R = rng(seed), P = [], C = [], N = [], U = [], I = []; let v = 0;
  const quad = (a, b, c, d, ca, cb) => { for (const [p, cc] of [[a, ca], [b, ca], [c, cb], [d, cb]]) { P.push(...p); C.push(...cc); N.push(0, 1, 0); U.push(0, p[1]); } I.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4; };
  const n = kind === 'flower' ? 6 : 4;
  for (let k = 0; k < n; k++) {
    const a = R() * TAU, r = R() * .18, x = Math.cos(a) * r, z = Math.sin(a) * r, h = kind === 'flower' ? .22 + R() * .22 : .55 + R() * .4, lean = (R() - .5) * .12, f = R() * TAU, fx = Math.cos(f) * .007, fz = Math.sin(f) * .007;
    const stem = kind === 'flower' ? [.16, .26, .08] : [.42, .44, .2], top = [x + lean, h, z + lean * .5];
    quad([x - fx, 0, z - fz], [x + fx, 0, z + fz], [top[0] + fx, h, top[2] + fz], [top[0] - fx, h, top[2] - fz], [stem[0] * .6, stem[1] * .6, stem[2] * .6], stem);
    if (kind === 'flower') { const s2 = .03 + R() * .02; for (let q = 0; q < 3; q++) { const b = q / 3 * Math.PI + R(), cx = Math.cos(b) * s2, cz = Math.sin(b) * s2; quad([top[0] - cx, h - .005, top[2] - cz], [top[0] + cx, h - .005, top[2] + cz], [top[0] + cx, h + .012, top[2] + cz], [top[0] - cx, h + .012, top[2] - cz], [1, 1, 1], [1, 1, 1]); } }
    else { const hl = .07 + R() * .05; for (let q = 0; q < 2; q++) { const b = q * Math.PI / 2 + f, cx = Math.cos(b) * .012, cz = Math.sin(b) * .012; quad([top[0] - cx, h, top[2] - cz], [top[0] + cx, h, top[2] + cz], [top[0] + cx * .3, h + hl, top[2] + cz * .3], [top[0] - cx * .3, h + hl, top[2] - cz * .3], [.62, .55, .32], [.78, .7, .44]); } }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); return g;
}
function grassMat(base, o) { // matches the ground: the same dry/green macro patches the terrain shader uses, wind, fades at the edge of its ring
  const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(base[0], base[1], base[2]), vertexColors: true, side: THREE.DoubleSide, map: o.map || null, alphaTest: o.map ? .5 : 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime: REAL_T, uCam: REAL_CAM, tMacro: { value: TEX.macro }, uRing: { value: new THREE.Vector4(...o.ring) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uCam; uniform sampler2D tMacro; uniform vec4 uRing;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float dd = distance(ipw.xz, uCam.xz);
        float ring = smoothstep(uRing.x, uRing.y, dd) * (1.0 - smoothstep(uRing.z, uRing.w, dd));
        transformed *= ring;
        float gust = sin(uTime * .9 + ipw.x * .04 + ipw.z * .03) * .5 + .5, h = position.y;
        float sway = (sin(uTime * 2.1 + ipw.x * .55 + ipw.z * .37) * .6 + sin(uTime * 3.7 + ipw.z * .9) * .25) * (.35 + gust * .8);
        transformed.x += sway * .09 * h * h * 4.0; transformed.z += cos(uTime * 1.6 + ipw.z * .43) * .05 * h * h * 4.0 * (.4 + gust);`)
      .replace('#include <color_vertex>', `vec3 ipw = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #include <color_vertex>
        { float dry = smoothstep(.42, .72, texture2D(tMacro, ipw.xz / 2300.0 + .37).r) * .8 + smoothstep(.6, .8, texture2D(tMacro, ipw.xz / 310.0 + .71).r) * .35;
          float mac = texture2D(tMacro, ipw.xz / 900.0).r * .7 + texture2D(tMacro, ipw.xz / 211.0).r * .3;
          ${o.noTone ? 'vColor.rgb *= .85 + mac * .25;' : `vColor.rgb *= mix(vec3(.7, .8, .56), vec3(1.16, 1.02, .62), clamp(dry, 0.0, 1.0) * ${o.dry.toFixed(2)}) * (.66 + mac * .55);`} }`);
    plantLight(sh, 1.4);
    sh.fragmentShader = sh.fragmentShader.replace(/:\s*vLightBack/g, ': vLightFront').replace(/:\s*vIndirectBack/g, ': vIndirectFront');
  };
  m.customProgramCacheKey = () => 'grassF' + o.dry + (o.map ? 'm' : '') + (o.noTone ? 't' : '');
  return m;
}
function buildGrassF() {
  makeFloraTextures();
  // the ground's grass albedo, linear: what the terrain shader makes of its grass texture
  const base = [.1, .135, .036];
  const near = new THREE.InstancedMesh(bladeClump(9, 5, .2, .5, .16, .05), grassMat(base, { ring: [-1, 0, 20, 27], dry: 1 }), 16000);
  const P = []; const card = a => { const c = Math.cos(a), s = Math.sin(a); return [[-c * .38, 0, -s * .38, 0, 0], [c * .38, 0, s * .38, 1, 0], [c * .38, .42, s * .38, 1, 1], [-c * .38, 0, -s * .38, 0, 0], [c * .38, .42, s * .38, 1, 1], [-c * .38, .42, -s * .38, 0, 1]]; };
  for (const a of [0, 1.05, 2.1]) P.push(...card(a));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(p => [p[0], p[1], p[2]]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap(p => [p[3], p[4]]), 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(P.flatMap(() => [0, 1, 0]), 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(P.flatMap(p => { const k = .55 + p[4] * .75; return [k, k, k]; }), 3));
  if (!FL.bladeTex) { // finer blades for the far cards, white so the material colour shows through
    const cv = canvasOf(128), gg = cv.getContext('2d'), R = rng(31);
    for (let k = 0; k < 46; k++) { const x = 4 + R() * 120, h = 50 + R() * 76, bend = (R() - .5) * 30, w = 1.2 + R() * 1.8, v = 200 + R() * 55 | 0; gg.fillStyle = `rgb(${v},${v},${v})`; gg.beginPath(); gg.moveTo(x - w, 128); gg.quadraticCurveTo(x + bend * .3, 128 - h * .6, x + bend, 128 - h); gg.quadraticCurveTo(x + bend * .3 + w * .3, 128 - h * .6, x + w, 128); gg.fill(); }
    FL.bladeTex = alphaMips(cv, .5);
  }
  const far = new THREE.InstancedMesh(g, grassMat(base, { ring: [18, 25, 62, 80], dry: 1, map: FL.bladeTex }), 26000);
  const fern = new THREE.InstancedMesh((() => { const f = new FG(), nf = p => v3norm([p[0], 1.2, p[2]]); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + .3, d = [Math.cos(a), 0, Math.sin(a)], up = v3norm([d[0], .9, d[2]]), side = [-d[2], 0, d[0]]; leafCard(f, v3add([0, 0, 0], up, .5), up, side, .8, 1.1, FC.fern, nf, p => .6 + p[1] * .5, [1, 1, 1], .25); } return f.geo(); })(), floraMat(FL.leaf, new THREE.Vector2(0, 1e9), { alpha: .45, wind: .03 }), 3000);
  const bush = new THREE.InstancedMesh(floraModels().hazel.near.leaf, floraMat(FL.leaf, new THREE.Vector2(0, 1e9), { alpha: .45, wind: .02 }), 900);
  const rockG = new THREE.IcosahedronGeometry(1, 1); { const p = rockG.attributes.position, Rr = rng(9); for (let i = 0; i < p.count; i++) { const k = .75 + Rr() * .5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * .7, p.getZ(i) * k); } rockG.computeVertexNormals(); }
  const rocks = new THREE.InstancedMesh(rockG, new THREE.MeshStandardMaterial({ map: TEX.rock, roughness: .95 }), 1600);
  const flowers = new THREE.InstancedMesh(meadowGeo('flower', 3), grassMat([1, 1, 1], { ring: [-1, 0, 22, 27], dry: 0, noTone: true }), 2500);
  const heads = new THREE.InstancedMesh(meadowGeo('stalk', 4), grassMat([1, 1, 1], { ring: [-1, 0, 22, 27], dry: 1 }), 3500);
  for (const im of [flowers, heads]) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.instanceMatrix.count * 3), 3);
  for (const im of [near, far, fern, bush, rocks, flowers, heads]) { im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); WORLD.group.add(im); }
  near.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16000 * 3), 3); far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(26000 * 3), 3);
  fern.castShadow = bush.castShadow = rocks.castShadow = true; rocks.receiveShadow = fern.receiveShadow = bush.receiveShadow = true;
  FL.grass = { near, far, fern, bush, rocks, flowers, heads, lastN: new V3(1e9, 0, 1e9), lastF: new V3(1e9, 0, 1e9) };
}
function roadBins(M) { // road segments in metres, binned, for a precise "is this on the road" test
  const B = 40, map = new Map();
  for (const r of M._roads) { const P = r.P.map(kmToM), hw = (r.main ? 4.6 : 3.2) + .8; for (let k = 0; k < P.length - 1; k++) { const a = P[k], b = P[k + 1], s = [a[0], a[1], b[0], b[1], hw]; for (let gx = Math.floor((Math.min(a[0], b[0]) - hw) / B); gx <= Math.floor((Math.max(a[0], b[0]) + hw) / B); gx++) for (let gz = Math.floor((Math.min(a[1], b[1]) - hw) / B); gz <= Math.floor((Math.max(a[1], b[1]) + hw) / B); gz++) { const key = gx * 8192 + gz; let l = map.get(key); if (!l) map.set(key, l = []); l.push(s); } } }
  return { B, map };
}
function onRoadFine(x, z) {
  const RB = FL.roads || (FL.roads = roadBins(WORLD.M)), l = RB.map.get(Math.floor(x / RB.B) * 8192 + Math.floor(z / RB.B)); if (!l) return false;
  for (const [ax, az, bx, bz, hw] of l) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1); if (Math.hypot(ax + dx * t - x, az + dz * t - z) < hw) return true; }
  return false;
}
function grassKind(x, z) { // [density, height, r, g, b] for the ground here
  const M = WORLD.M, i = Math.round(x / CELL), j = Math.round(z / CELL); if (i < 1 || j < 1 || i >= GW - 1 || j >= GH - 1) return null;
  const id = j * GW + i; if (M.ROAD[id] && onRoadFine(x, z)) return null;
  const h = terrainY(x, z); if (h < 4) return null;
  const sl = Math.hypot(terrainY(x + 3, z) - terrainY(x - 3, z), terrainY(x, z + 3) - terrainY(x, z - 3)) / 6; if (sl > .55) return null;
  for (const zn of M.zones) { const dx = x / 1000 - zn.x, dz = z / 1000 - zn.y, c = Math.cos(zn.ang || 0), s = Math.sin(zn.ang || 0); if (Math.abs(dx * c + dz * s) < zn.hx + .01 && Math.abs(-dx * s + dz * c) < zn.hy + .01) return [.1, .7, 1.45, 1.15, .72]; } // worn compounds: a few dry tufts
  const k = 1 - sstep(.35, .55, sl);
  if (M.F[id]) return [.25 * k, .8, .62, .66, .58];
  const cp = h > 6 && sl < .2 ? cropAt(FL.frames, x, z) : 0;
  if (cp === 1) return [.05, .6, 1.1, .95, .8];          // ploughed: a few weeds
  if (cp === 2) return [1, 2.1, 2.6, 1.85, .7];          // wheat
  if (cp === 3) { const fr = -x * Math.sin(FL.cropAng) + z * Math.cos(FL.cropAng); return Math.sin(fr * 10.5) > .55 ? [1, .55, .95, 1.3, .8] : [.02, .5, 1, 1, 1]; } // young crop, in rows
  if (cp === 4) return [1, 1.15, 1, 1.05, .95];          // pasture
  return [k, 1, 1, 1, 1];
}
const FLOWER_COLS = [[1.0, 1.0, .96], [1.0, .86, .18], [.72, .5, .95], [1.0, .97, .9], [.95, .55, .7], [1.0, .9, .3]]; // daisy, buttercup, clover, yarrow, campion, dandelion
function updateGrassF(cam) {
  const G = FL.grass; if (!G) return;
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  if (Math.hypot(cam.x - G.lastN.x, cam.z - G.lastN.z) > 3.5) { // blades
    G.lastN.copy(cam); const S = .46, RAD = 28, im = G.near, cx = Math.floor(cam.x / S), cz = Math.floor(cam.z / S), r = Math.ceil(RAD / S), MAX = im.instanceMatrix.count, MF = G.flowers.instanceMatrix.count, MH = G.heads.instanceMatrix.count; let n = 0, nf = 0, nh = 0;
    for (let j = -r; j <= r && n < MAX; j++) for (let i = -r; i <= r && n < MAX; i++) {
      const gi = cx + i, gj = cz + j, x = (gi + hash2(gi, gj, 1)) * S, z = (gj + hash2(gi, gj, 2)) * S; if (Math.hypot(x - cam.x, z - cam.z) > RAD) continue;
      const w = grassKind(x, z); if (!w || hash2(gi, gj, 3) > w[0]) continue;
      const s = .75 + hash2(gi, gj, 4) * .5, hy = w[1] * (.75 + hash2(gi, gj, 6) * .5);
      dummy.position.set(x, terrainY(x, z) - .03, z); dummy.rotation.set(0, hash2(gi, gj, 5) * TAU, 0); dummy.scale.set(s * (w[1] > 1.5 ? .7 : 1), s * hy, s * (w[1] > 1.5 ? .7 : 1)); dummy.updateMatrix(); im.setMatrixAt(n, dummy.matrix);
      const k = hash2(gi, gj, 7) * .26 - .13, dryc = hash2(gi, gj, 8) < .12 ? .35 : 0; im.setColorAt(n, col.setRGB(w[2] * (1 + k + dryc * .9), w[3] * (1 + k * .7 + dryc * .3), w[4] * (1 + k * .5 - dryc * .2))); n++;
      if (w[1] >= .9 && w[1] < 1.5 && w[0] > .5) { // meadows (not crops): patches of wildflowers and seed heads
        const patch = fbm(x * .05, z * .05, 77, 2), hf = hash2(gi, gj, 9);
        if (hf < .045 + Math.max(0, patch) * .12 && nf < MF) { dummy.scale.setScalar(.8 + hash2(gi, gj, 10) * .5); dummy.updateMatrix(); G.flowers.setMatrixAt(nf, dummy.matrix); const fc = FLOWER_COLS[(patch * 9 + 9 + (hash2(gi, gj, 12) < .35 ? hash2(gi, gj, 13) * 6 : 0) | 0) % FLOWER_COLS.length]; G.flowers.setColorAt(nf++, col.setRGB(fc[0], fc[1], fc[2])); }
        else if (hf > .9 - Math.max(0, -patch) * .1 && nh < MH) { dummy.scale.set(1, .8 + hash2(gi, gj, 11) * .5, 1); dummy.updateMatrix(); G.heads.setMatrixAt(nh, dummy.matrix); G.heads.setColorAt(nh++, col.setRGB(1, 1, 1)); }
      }
    }
    im.count = n; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    for (const [m2, c2] of [[G.flowers, nf], [G.heads, nh]]) { m2.count = c2; m2.instanceMatrix.needsUpdate = true; m2.instanceColor.needsUpdate = true; }
  }
  if (Math.hypot(cam.x - G.lastF.x, cam.z - G.lastF.z) < 10) return;
  G.lastF.copy(cam);
  { // far cards
    const S = 1.0, RAD = 80, im = G.far, cx = Math.floor(cam.x / S), cz = Math.floor(cam.z / S), r = Math.ceil(RAD / S), MAX = im.instanceMatrix.count; let n = 0;
    for (let j = -r; j <= r && n < MAX; j++) for (let i = -r; i <= r && n < MAX; i++) {
      const gi = cx + i, gj = cz + j, x = (gi + hash2(gi, gj, 11)) * S, z = (gj + hash2(gi, gj, 12)) * S, d = Math.hypot(x - cam.x, z - cam.z); if (d > RAD || d < 16) continue;
      const w = grassKind(x, z); if (!w || hash2(gi, gj, 13) > w[0]) continue;
      const s = (.7 + hash2(gi, gj, 14) * .6) * (1 + d / 120);
      dummy.position.set(x, terrainY(x, z) - .04, z); dummy.rotation.set(0, hash2(gi, gj, 15) * TAU, 0); dummy.scale.set(s, s * w[1] * (.8 + hash2(gi, gj, 16) * .4), s); dummy.updateMatrix(); im.setMatrixAt(n, dummy.matrix);
      const k = hash2(gi, gj, 17) * .2 - .1; im.setColorAt(n, col.setRGB(w[2] * (1 + k), w[3] * (1 + k * .7), w[4] * (1 + k * .5))); n++;
    }
    im.count = n; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  }
  { // forest floor: ferns and hazel; pebbles and boulders on slopes and beaches
    const M = WORLD.M, S = 2.2, RAD = 90; let nf = 0, nb = 0, nr = 0;
    for (let j = -Math.ceil(RAD / S); j <= Math.ceil(RAD / S); j++) for (let i = -Math.ceil(RAD / S); i <= Math.ceil(RAD / S); i++) {
      const gi = Math.floor(cam.x / S) + i, gj = Math.floor(cam.z / S) + j, x = (gi + hash2(gi, gj, 21)) * S, z = (gj + hash2(gi, gj, 22)) * S; if (Math.hypot(x - cam.x, z - cam.z) > RAD) continue;
      const id = Math.round(z / CELL) * GW + Math.round(x / CELL), forest = M.F[id], h = terrainY(x, z); if (h < 4 || (M.ROAD[id] && onRoadFine(x, z))) continue;
      if (forest && nf < 3000 && hash2(gi, gj, 23) < .42) { const s = .6 + hash2(gi, gj, 24) * .7; dummy.position.set(x, h - .05, z); dummy.rotation.set(0, hash2(gi, gj, 25) * TAU, 0); dummy.scale.set(s, s, s); dummy.updateMatrix(); G.fern.setMatrixAt(nf++, dummy.matrix); }
      else if (nb < 900 && hash2(gi, gj, 26) < (forest ? .06 : .004)) { const s = .35 + hash2(gi, gj, 27) * .45; dummy.position.set(x, h - .1, z); dummy.rotation.set(0, hash2(gi, gj, 28) * TAU, 0); dummy.scale.set(s, s * .8, s); dummy.updateMatrix(); G.bush.setMatrixAt(nb++, dummy.matrix); }
    }
    const Sr = 7;
    for (let j = -Math.ceil(140 / Sr); j <= Math.ceil(140 / Sr) && nr < 1600; j++) for (let i = -Math.ceil(140 / Sr); i <= Math.ceil(140 / Sr) && nr < 1600; i++) {
      const gi = Math.floor(cam.x / Sr) + i, gj = Math.floor(cam.z / Sr) + j, x = (gi + hash2(gi, gj, 11)) * Sr, z = (gj + hash2(gi, gj, 12)) * Sr; if (Math.hypot(x - cam.x, z - cam.z) > 140) continue;
      const h = terrainY(x, z), sl = Math.hypot(terrainY(x + 3, z) - terrainY(x - 3, z), terrainY(x, z + 3) - terrainY(x, z - 3)) / 6, want = sl > .35 ? .35 : h < 3 && h > -1 ? .12 : .02; if (hash2(gi, gj, 13) > want || onRoad(x, z)) continue;
      const s = sl > .35 ? .5 + hash2(gi, gj, 14) * 1.8 : .2 + hash2(gi, gj, 14) * .5;
      dummy.position.set(x, h - s * .2, z); dummy.rotation.set(hash2(gi, gj, 15) * 3, hash2(gi, gj, 16) * 6, 0); dummy.scale.set(s, s, s); dummy.updateMatrix(); G.rocks.setMatrixAt(nr++, dummy.matrix);
    }
    for (const [im, n] of [[G.fern, nf], [G.bush, nb], [G.rocks, nr]]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
  }
}
