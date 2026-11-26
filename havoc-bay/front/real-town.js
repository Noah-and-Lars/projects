/* Island Front, Realistic mode: European villages.
   Stone farmhouses, half-timbered, plaster and brick houses, barns and a church in every town, with real window and door
   recesses, steep tiled or slate roofs with overhangs and chimneys, and stone walls round the gardens.
   All walls share one texture atlas (one draw call), roofs one per covering. Everything is painted here in code. */
'use strict';
const TOWN = {};
const AT = 8, CELLPX = 256;                                   // atlas: 8 x 8 cells, each one bay (about 3 m) by one floor
const ST = { stone: 0, plaster: 1, timber: 2, brick: 3, plank: 4, church: 5, field: 6 }; // atlas rows
const CL = { plain: 0, plain2: 1, winA: 2, winB: 3, door: 4, big: 5, small: 6, extra: 7 }; // atlas columns
// openings in each cell, in pixels (x0, y0, x1, y1; y down) and how deep they are set into the wall
const HOLE = {
  win: [88, 60, 168, 180], small: [102, 86, 154, 138], door: [82, 62, 174, 256], big: [26, 40, 230, 256],
  lancetLo: [100, 0, 156, 256], lancetHi: [100, 120, 156, 256], cdoorLo: [72, 0, 184, 256], cdoorHi: [72, 160, 184, 256], belfry: [92, 70, 164, 230],
};
function holeOf(style, col) {
  if (style === ST.church) return [null, null, HOLE.lancetLo, HOLE.lancetHi, HOLE.cdoorLo, HOLE.cdoorHi, HOLE.belfry, null][col];
  return [null, null, HOLE.win, HOLE.win, HOLE.door, HOLE.big, HOLE.small, HOLE.win][col];
}

/* ---------------- painting the textures ---------------- */
function grain(g, S, amt, R, H = S) { const img = g.getImageData(0, 0, S, H), d = img.data; for (let i = 0; i < d.length; i += 4) { const k = 1 + (R() - .5) * amt; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } g.putImageData(img, 0, 0); }
const rgb = (c, k = 1) => `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;
const jit = (c, R, a) => { const k = 1 + (R() - .5) * a; return [c[0] * k * (1 + (R() - .5) * a * .3), c[1] * k, c[2] * k * (1 + (R() - .5) * a * .3)]; };
function blobPath(g, x, y, w, h, R, r = .3) { // a rough, rounded stone outline
  const pts = [], n = 9;
  for (let k = 0; k < n; k++) { const a = k / n * TAU, cx = Math.cos(a), cy = Math.sin(a), sq = Math.pow(Math.abs(cx), .35) * Math.sign(cx), sy = Math.pow(Math.abs(cy), .35) * Math.sign(cy); pts.push([x + w / 2 + sq * w / 2 * (1 - R() * r * .5), y + h / 2 + sy * h / 2 * (1 - R() * r * .5)]); }
  g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
}
function paintStones(g, S, R, o) { // tileable coursed rubble: o = { mortar, cols, rowH:[a,b], wMul:[a,b], gap }
  g.fillStyle = rgb(o.mortar); g.fillRect(0, 0, S, S);
  const rows = []; let y = 0; while (y < S) { const h = o.rowH[0] + R() * (o.rowH[1] - o.rowH[0]); rows.push([y, h]); y += h; } const k = S / y; rows.forEach(r => { r[0] *= k; r[1] *= k; });
  for (const [ry, rh] of rows) {
    let x = R() * S; const end = x + S;
    while (x < end) {
      const w = Math.min(rh * (o.wMul[0] + R() * (o.wMul[1] - o.wMul[0])), end - x + (end - x < rh * .8 ? 0 : -rh * .4)), c = jit(o.cols[(R() * o.cols.length) | 0], R, .22), hh = rh * (.8 + R() * .2);
      for (const ox of [0, -S]) {
        const sx = x + ox, sy = ry + (rh - hh) * R();
        g.fillStyle = 'rgba(0,0,0,.22)'; blobPath(g, sx + 1, sy + 1.5, w - o.gap, hh - o.gap, R, o.rough); g.fill();
        const gr = g.createLinearGradient(0, sy, 0, sy + hh); gr.addColorStop(0, rgb(c, 1.12)); gr.addColorStop(.6, rgb(c)); gr.addColorStop(1, rgb(c, .82));
        g.fillStyle = gr; blobPath(g, sx, sy, w - o.gap, hh - o.gap, R, o.rough); g.fill();
      }
      x += w;
    }
  }
}
function paintBase(style, g, R, seed) {
  const S = CELLPX;
  if (style === ST.stone || style === ST.field) {
    paintStones(g, S, R, style === ST.stone ? { mortar: [176, 166, 146], cols: [[186, 172, 146], [168, 158, 138], [198, 186, 160], [152, 142, 124], [178, 160, 128]], rowH: [14, 26], wMul: [1.1, 2.6], gap: 2.5, rough: .45 }
      : { mortar: [120, 116, 108], cols: [[132, 128, 120], [112, 110, 104], [146, 140, 128], [104, 100, 92]], rowH: [16, 34], wMul: [.9, 1.8], gap: 3, rough: .7 });
  } else if (style === ST.plaster) {
    const n = tfbm(S, 4, 4, seed), m = tfbm(S, 16, 2, seed + 1), img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const y = (i / S) | 0, v = 1 + n[i] * .06 + m[i] * .025 - Math.max(0, n[i] - .1) * .12 * (y / S); img.data[i * 4] = 214 * v; img.data[i * 4 + 1] = 206 * v; img.data[i * 4 + 2] = 190 * v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  } else if (style === ST.timber) {
    const n = tfbm(S, 4, 3, seed), img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const v = 1 + n[i] * .05; img.data[i * 4] = 218 * v; img.data[i * 4 + 1] = 208 * v; img.data[i * 4 + 2] = 186 * v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  } else if (style === ST.brick) {
    g.fillStyle = rgb([150, 140, 128]); g.fillRect(0, 0, S, S);
    const rows = 39, rh = S / rows, bw = rh * 3.3;
    for (let r = 0; r < rows; r++) for (let x = (r % 2) * bw / 2 - bw; x < S; x += bw) {
      const c = jit([[146, 70, 50], [128, 60, 44], [160, 84, 60], [118, 66, 52], [140, 78, 58]][(R() * 5) | 0], R, .2);
      for (const ox of [0, S]) { g.fillStyle = rgb(c); g.fillRect(x + ox + .6, r * rh + .6, bw - 1.2, rh - 1.2); g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(x + ox + .6, r * rh + rh - 1.6, bw - 1.2, 1); }
    }
  } else if (style === ST.plank) {
    const n = tfbm(S, 8, 3, seed); g.fillStyle = '#2a2219'; g.fillRect(0, 0, S, S);
    const bw = S / 14;
    for (let b = 0; b < 14; b++) {
      const c = jit([112, 92, 70], R, .25), x = b * bw, img = g.createImageData(Math.ceil(bw - 1.5), S);
      for (let y = 0; y < S; y++) for (let xx = 0; xx < img.width; xx++) { const q = (y * img.width + xx) * 4, v = 1 + n[y * S + ((x + xx) | 0)] * .18 + Math.sin(y * .35 + b * 3 + Math.sin(xx * .8) * 1.5) * .05; img.data[q] = c[0] * v; img.data[q + 1] = c[1] * v; img.data[q + 2] = c[2] * v; img.data[q + 3] = 255; }
      g.putImageData(img, x | 0, 0); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect((x | 0) + img.width - 2, 0, 2, S);
    }
  } else if (style === ST.church) {
    g.fillStyle = rgb([150, 142, 126]); g.fillRect(0, 0, S, S);
    const rows = 9, rh = S / rows;
    for (let r = 0; r < rows; r++) { let x = (r % 2) * 40 - 80; while (x < S) { const w = 60 + R() * 40, c = jit([196, 188, 168], R, .12); for (const ox of [0, S]) { const gr = g.createLinearGradient(0, r * rh, 0, r * rh + rh); gr.addColorStop(0, rgb(c, 1.06)); gr.addColorStop(1, rgb(c, .9)); g.fillStyle = gr; g.fillRect(x + ox + 1.2, r * rh + 1.2, w - 2.4, rh - 2.4); } x += w; } }
  }
  grain(g, S, style === ST.plaster || style === ST.timber ? .05 : .09, R);
}
// timber framing: posts at the cell edges, sill and plate beams, braces
function timbers(g, kind) {
  const S = CELLPX, T = (x, y, w, h) => { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 2, y + 2, w, h); g.fillStyle = '#4a3424'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,230,190,.08)'; g.fillRect(x, y, w, 2); };
  const brace = (x0, y0, x1, y1) => { g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(x0 + 2, y0 + 2); g.lineTo(x1 + 2, y1 + 2); g.stroke(); g.strokeStyle = '#4a3424'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  if (kind === 'x') { brace(10, 240, 246, 12); brace(10, 12, 246, 240); }
  else if (kind === 'k') { brace(10, 128, 128, 12); brace(246, 128, 128, 12); T(122, 10, 12, 236); }
  else if (kind === 'win') { T(74, 10, 12, 232); T(170, 10, 12, 232); T(86, 182, 84, 12); T(86, 46, 84, 12); brace(10, 236, 74, 180); brace(246, 236, 182, 180); }
  else if (kind === 'door') { T(68, 10, 12, 232); T(176, 10, 12, 232); T(80, 50, 96, 12); }
  T(0, 0, 10, S); T(S - 10, 0, 10, S); T(0, S - 14, S, 14); T(0, 0, S, 10); T(10, 122, S - 20, 10);
}
function lintels(g, style, x0, y0, x1, y1, R, sill = true) { // the surround round an opening
  const w = x1 - x0;
  if (style === ST.brick) { // a soldier course over the top, a stone sill
    for (let x = x0 - 8; x < x1 + 8; x += 7) { g.fillStyle = rgb(jit([132, 62, 46], R, .2)); g.fillRect(x, y0 - 18, 6, 17); }
    if (sill) { g.fillStyle = rgb([196, 190, 176]); g.fillRect(x0 - 8, y1, w + 16, 9); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x0 - 8, y1 + 9, w + 16, 4); }
  } else if (style === ST.stone || style === ST.field || style === ST.church) { // dressed stones round the opening
    const c = style === ST.field ? [150, 146, 136] : [206, 196, 172];
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x0 - 12, y0 - 20, w + 26, 22);
    g.fillStyle = rgb(jit(c, R, .1)); g.fillRect(x0 - 14, y0 - 22, w + 28, 22);
    for (let y = y0; y < y1; y += 26) for (const sd of [-1, 1]) { g.fillStyle = rgb(jit(c, R, .12)); const bw = 10 + (((y - y0) / 26) % 2) * 6; g.fillRect(sd < 0 ? x0 - bw : x1, y, bw, Math.min(24, y1 - y)); }
    if (sill) { g.fillStyle = rgb(c, 1.04); g.fillRect(x0 - 10, y1, w + 20, 10); g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(x0 - 10, y1 + 10, w + 20, 5); }
  } else if (style === ST.plaster) { // a painted band
    g.fillStyle = 'rgba(255,252,240,.55)'; g.fillRect(x0 - 10, y0 - 10, w + 20, (y1 - y0) + 20);
    if (sill) { g.fillStyle = rgb([200, 194, 180]); g.fillRect(x0 - 10, y1, w + 20, 9); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x0 - 10, y1 + 9, w + 20, 5); }
  } else if (sill) { g.fillStyle = '#4a3424'; g.fillRect(x0 - 6, y1, w + 12, 8); }
}
function glass(g, x0, y0, x1, y1, R, o = {}) { // window glass with frame, glazing bars and reflections
  const w = x1 - x0, h = y1 - y0;
  g.fillStyle = '#1d1f20'; g.fillRect(x0, y0, w, h);
  const f = 5, gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgb(96,112,124)'); gr.addColorStop(.45, 'rgb(38,46,54)'); gr.addColorStop(.7, 'rgb(58,68,76)'); gr.addColorStop(1, 'rgb(30,36,42)');
  g.fillStyle = gr; g.fillRect(x0 + f, y0 + f, w - 2 * f, h - 2 * f);
  if (o.curtain) { g.fillStyle = 'rgba(225,215,195,.55)'; g.fillRect(x0 + f, y0 + f, w * .22, h - 2 * f); g.fillRect(x1 - f - w * .22, y0 + f, w * .22, h - 2 * f); }
  g.fillStyle = o.frame || '#e8e4da';
  g.fillRect(x0, y0, w, f); g.fillRect(x0, y1 - f, w, f); g.fillRect(x0, y0, f, h); g.fillRect(x1 - f, y0, f, h);
  g.fillRect(x0 + w / 2 - 2.5, y0, 5, h); const panes = o.panes || 3; for (let k = 1; k < panes; k++) g.fillRect(x0, y0 + h * k / panes - 1.5, w, 3);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0 + f, y0 + f, w - 2 * f, 4); g.fillRect(x0 + f, y0 + f, 4, h - 2 * f); // the shadow of the reveal
}
function shutters(g, x0, y0, x1, y1, col, R) { // open shutters flat against the wall either side
  const w = (x1 - x0) / 2, h = y1 - y0;
  for (const sx of [x0 - w - 3, x1 + 3]) {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(sx + 3, y0 + 3, w, h);
    g.fillStyle = rgb(jit(col, R, .08)); g.fillRect(sx, y0, w, h);
    g.fillStyle = 'rgba(0,0,0,.22)'; for (let y = y0 + 6; y < y1 - 4; y += 7) g.fillRect(sx + 4, y, w - 8, 2); // louvres
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(sx, y0, w, 3); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(sx, y0, 2, h);
  }
}
function door(g, x0, y0, x1, y1, col, R, o = {}) {
  const w = x1 - x0;
  g.fillStyle = '#1a1714'; g.fillRect(x0, y0, w, y1 - y0);
  const c = jit(col, R, .1), n = o.planks || 6;
  for (let k = 0; k < n; k++) { g.fillStyle = rgb(c, .9 + R() * .2); g.fillRect(x0 + 6 + k * (w - 12) / n, y0 + 6, (w - 12) / n - 1.5, y1 - y0 - 6); }
  if (o.fan) { g.fillStyle = '#2a3036'; g.fillRect(x0 + 6, y0 + 6, w - 12, 26); g.fillStyle = 'rgba(120,140,150,.5)'; g.fillRect(x0 + 8, y0 + 8, w - 16, 10); g.fillStyle = rgb(c); g.fillRect(x0 + 6, y0 + 32, w - 12, 4); }
  if (o.brace) { g.strokeStyle = rgb(c, .7); g.lineWidth = 10; for (let k = 0; k < 2; k++) { const a = y0 + (y1 - y0) * (k ? .55 : .1), b = y0 + (y1 - y0) * (k ? .95 : .5); g.beginPath(); g.moveTo(x0 + 10, b); g.lineTo(x1 - 10, a); g.stroke(); g.fillStyle = rgb(c, .75); g.fillRect(x0 + 6, a - 6, w - 12, 10); g.fillRect(x0 + 6, b - 4, w - 12, 10); } if (o.split) { g.fillStyle = '#1a1714'; g.fillRect(x0 + w / 2 - 1.5, y0, 3, y1 - y0); } }
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x0, y0, w, 5); g.fillRect(x0, y0, 5, y1 - y0);
  g.fillStyle = '#c9b070'; g.beginPath(); g.arc(x1 - 16, (y0 + y1) / 2 + 10, 3.5, 0, 7); g.fill();
}
function paintCell(style, col, g, R, seed) {
  paintBase(style, g, R, seed);
  const S = CELLPX, sh = [[64, 86, 60], [72, 90, 104], [96, 70, 50], [150, 146, 132], [60, 70, 58], [110, 54, 44]], hole = holeOf(style, col);
  if (style === ST.timber) timbers(g, col === CL.plain ? 'x' : col === CL.plain2 ? 'k' : col === CL.door || col === CL.big ? 'door' : col === CL.extra ? 'k' : 'win');
  if (style === ST.church) {
    const st = [206, 198, 176];
    if (col === CL.winA || col === CL.winB) { // a tall lancet window over two cells
      const [x0, y0, x1, y1] = hole;
      for (let y = y0; y < y1; y += 24) for (const sd of [-1, 1]) { g.fillStyle = rgb(jit(st, R, .1)); g.fillRect(sd < 0 ? x0 - 14 : x1, y, 14, 22); }
      g.fillStyle = '#20242a'; if (col === CL.winA) g.fillRect(x0, y0, x1 - x0, y1 - y0); else { g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0 + 40); g.quadraticCurveTo(x0, y0 - 30, (x0 + x1) / 2, y0 - 70); g.quadraticCurveTo(x1, y0 - 30, x1, y0 + 40); g.lineTo(x1, y1); g.fill(); g.strokeStyle = rgb(st); g.lineWidth = 12; g.stroke(); }
      g.strokeStyle = 'rgba(150,140,110,.55)'; g.lineWidth = 1.5; for (let k = -20; k < 30; k++) { g.beginPath(); g.moveTo(x0 + k * 10, y0 - 80); g.lineTo(x0 + k * 10 + 200, y1 + 120); g.stroke(); g.beginPath(); g.moveTo(x1 - k * 10, y0 - 80); g.lineTo(x1 - k * 10 - 200, y1 + 120); g.stroke(); }
      if (col === CL.winA) { g.fillStyle = rgb(st); g.fillRect(x0 - 14, S - 10, x1 - x0 + 28, 10); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0, y0, 5, y1 - y0);
      const t = (col === CL.winB ? 0 : 1); if (t) { g.fillStyle = rgb([200, 192, 170]); g.fillRect(x0 - 14, S - 12, x1 - x0 + 28, 12); }
      // mask the glass outside the window (the lead lines ran over the stone)
      paintBaseMask(g, style, R, seed, x0 - 14, x1 + 14, col === CL.winB ? y0 - 84 : y0);
    } else if (col === CL.door || col === CL.big) {
      const [x0, y0, x1] = hole;
      if (col === CL.door) { door(g, x0, y0, x1, S, [80, 52, 34], R, { planks: 7 }); g.fillStyle = '#1a1714'; for (let y = 20; y < S; y += 40) for (let x = x0 + 14; x < x1 - 8; x += 22) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); } for (const sd of [-1, 1]) for (let y = 0; y < S; y += 30) { g.fillStyle = rgb(jit(st, R, .1)); g.fillRect(sd < 0 ? x0 - 18 : x1, y, 18, 28); } }
      else { // the arch over the door with a carved tympanum
        g.fillStyle = '#5a4430'; g.fillRect(x0, 160, x1 - x0, S - 160);
        g.fillStyle = rgb([186, 178, 158]); g.beginPath(); g.arc((x0 + x1) / 2, 210, (x1 - x0) / 2, Math.PI, 0); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.arc((x0 + x1) / 2, 210, (x1 - x0) / 2 - 10, Math.PI, 0); g.stroke();
        for (let k = 0; k < 13; k++) { const a = Math.PI + k / 12 * Math.PI, r0 = (x1 - x0) / 2, r1 = r0 + 22; g.strokeStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.moveTo((x0 + x1) / 2 + Math.cos(a) * r0, 210 + Math.sin(a) * r0); g.lineTo((x0 + x1) / 2 + Math.cos(a) * r1, 210 + Math.sin(a) * r1); g.stroke(); }
        g.lineWidth = 22; g.strokeStyle = rgb([210, 202, 180]); g.beginPath(); g.arc((x0 + x1) / 2, 210, (x1 - x0) / 2 + 11, Math.PI, 0); g.stroke();
        for (const sd of [-1, 1]) for (let y = 210; y < S; y += 30) { g.fillStyle = rgb(jit(st, R, .1)); g.fillRect(sd < 0 ? x0 - 18 : x1, y, 18, 28); }
      }
    } else if (col === CL.small) { // belfry opening with louvres
      const [x0, y0, x1, y1] = hole;
      g.fillStyle = '#16181a'; g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0 + 36); g.arc((x0 + x1) / 2, y0 + 36, (x1 - x0) / 2, Math.PI, 0); g.lineTo(x1, y1); g.fill();
      for (let y = y0 + 40; y < y1 - 6; y += 13) { g.fillStyle = '#5a4a3a'; g.fillRect(x0 + 4, y, x1 - x0 - 8, 7); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x0 + 4, y + 7, x1 - x0 - 8, 3); }
      g.lineWidth = 14; g.strokeStyle = rgb([210, 200, 178]); g.beginPath(); g.moveTo(x0 - 7, y1); g.lineTo(x0 - 7, y0 + 36); g.arc((x0 + x1) / 2, y0 + 36, (x1 - x0) / 2 + 7, Math.PI, 0); g.lineTo(x1 + 7, y1); g.stroke();
      g.fillStyle = rgb([206, 198, 176]); g.fillRect(x0 - 16, y1, x1 - x0 + 32, 10);
    } else if (col === CL.extra) { // a clock face
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(130, 130, 82, 0, 7); g.fill();
      g.fillStyle = '#e8e2d2'; g.beginPath(); g.arc(128, 128, 80, 0, 7); g.fill(); g.lineWidth = 7; g.strokeStyle = '#2a2a2a'; g.stroke();
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.lineWidth = k % 3 ? 3 : 6; g.beginPath(); g.moveTo(128 + Math.cos(a) * 62, 128 + Math.sin(a) * 62); g.lineTo(128 + Math.cos(a) * 74, 128 + Math.sin(a) * 74); g.stroke(); }
      g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 40, 128 - 20); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 8, 128 - 60); g.stroke();
    }
    return;
  }
  if (!hole) {
    if (style === ST.plank && col === CL.plain2) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 118, S, 16); g.fillStyle = '#5a4630'; g.fillRect(0, 116, S, 14); } // a rail
    return;
  }
  const [x0, y0, x1, y1] = hole;
  if (col === CL.door) {
    lintels(g, style, x0, y0, x1, y1, R, false);
    door(g, x0, y0, x1, y1, [[70, 84, 62], [96, 64, 42], [60, 74, 96], [120, 52, 40]][seed % 4], R, { fan: style === ST.brick || style === ST.plaster, planks: 5 });
    g.fillStyle = rgb([170, 164, 150]); g.fillRect(x0 - 10, S - 8, x1 - x0 + 20, 8);
  } else if (col === CL.big) {
    if (style !== ST.plank) lintels(g, style, x0, y0, x1, y1, R, false);
    door(g, x0, y0, x1, y1, style === ST.plank ? [92, 74, 56] : [86, 62, 44], R, { planks: 12, brace: true, split: true });
  } else {
    lintels(g, style, x0, y0, x1, y1, R, true);
    glass(g, x0, y0, x1, y1, R, { curtain: col !== CL.small && R() < .7, panes: col === CL.small ? 2 : 3, frame: style === ST.plank ? '#5a4630' : style === ST.timber ? '#d8d0c0' : '#e8e4da' });
    const shut = (col === CL.winA && style !== ST.brick) || (col === CL.small && style === ST.plank);
    if (shut) shutters(g, x0, y0, x1, y1, sh[(style * 3 + seed) % sh.length], R);
  }
}
function paintBaseMask(g, style, R, seed, x0, x1, ylim) { // repaint stone outside a lancet's lead lines
  const cv = canvasOf(CELLPX), gg = cv.getContext('2d'); paintBase(style, gg, rng(seed), seed);
  g.save(); g.beginPath(); g.rect(0, 0, x0, CELLPX); g.rect(x1, 0, CELLPX - x1, CELLPX); g.rect(x0, 0, x1 - x0, Math.max(0, ylim)); g.clip(); g.drawImage(cv, 0, 0); g.restore();
}
function makeTownTextures() {
  if (TOWN.atlas) return;
  const A = canvasOf(AT * CELLPX), ag = A.getContext('2d');
  for (let s = 0; s < 7; s++) for (let c = 0; c < AT; c++) {
    const cv = canvasOf(CELLPX), g = cv.getContext('2d'), seed = 1000 + s * 17 + c; paintCell(s, c, g, rng(seed), seed); ag.drawImage(cv, c * CELLPX, s * CELLPX);
  }
  TOWN.atlas = texOf(A); TOWN.atlas.wrapS = TOWN.atlas.wrapT = THREE.ClampToEdgeWrapping; TOWN.atlas.anisotropy = 8;
  const S = 512, R = rng(4242);
  { // clay roof tiles, 2 m square
    const cv = canvasOf(S), g = cv.getContext('2d'), n = tfbm(S, 4, 4, 4243); g.fillStyle = '#3a2418'; g.fillRect(0, 0, S, S);
    const rows = 12, rh = S / rows, tw = S / 8;
    for (let r = 0; r < rows; r++) for (let k = -1; k < 9; k++) {
      const x = k * tw + (r % 2) * tw / 2, y = S - (r + 1) * rh, c = jit([[150, 80, 58], [132, 72, 54], [160, 96, 70], [118, 68, 54], [142, 88, 66], [124, 82, 66]][(R() * 5) | 0], R, .18);
      for (const ox of [0, S]) { const gr = g.createLinearGradient(0, y, 0, y + rh + 6); gr.addColorStop(0, rgb(c, .82)); gr.addColorStop(.75, rgb(c, 1.05)); gr.addColorStop(1, rgb(c, .9)); g.fillStyle = gr; g.fillRect(x + ox - S + 1, y, tw - 2, rh + 5); g.fillStyle = gr; g.fillRect(x + ox + 1, y, tw - 2, rh + 5); }
    }
    const img = g.getImageData(0, 0, S, S), d = img.data; for (let i = 0; i < S * S; i++) { const m = Math.max(0, n[i] - .15) * 1.6; d[i * 4] = lerp(d[i * 4], 92, m * .6); d[i * 4 + 1] = lerp(d[i * 4 + 1], 96, m * .6); d[i * 4 + 2] = lerp(d[i * 4 + 2], 62, m * .6); } g.putImageData(img, 0, 0);
    grain(g, S, .08, R); TOWN.tiles = texOf(cv);
  }
  { // slates, 2 m square
    const cv = canvasOf(S), g = cv.getContext('2d'); g.fillStyle = '#1c1e22'; g.fillRect(0, 0, S, S);
    const rows = 10, rh = S / rows, tw = S / 7;
    for (let r = 0; r < rows; r++) for (let k = -1; k < 8; k++) {
      const x = k * tw + (r % 2) * tw / 2 + (R() - .5) * 4, y = S - (r + 1) * rh, c = jit([[66, 70, 78], [58, 62, 70], [74, 77, 84], [52, 55, 62]][(R() * 4) | 0], R, .16);
      for (const ox of [0, S, -S]) { const gr = g.createLinearGradient(0, y, 0, y + rh + 8); gr.addColorStop(0, rgb(c, .8)); gr.addColorStop(.85, rgb(c, 1.08)); gr.addColorStop(1, rgb(c, .95)); g.fillStyle = gr; g.fillRect(x + ox + 1, y, tw - 2, rh + 7); }
    }
    grain(g, S, .1, R); TOWN.slate = texOf(cv);
  }
  { const cv = canvasOf(CELLPX), g = cv.getContext('2d'); paintBase(ST.field, g, rng(77), 77); TOWN.rubble = texOf(cv); }
  { const cv = canvasOf(CELLPX), g = cv.getContext('2d'); paintBase(ST.stone, g, rng(78), 78); TOWN.dressed = texOf(cv); }
  { const cv = canvasOf(CELLPX), g = cv.getContext('2d'); paintBase(ST.plank, g, rng(79), 79); TOWN.planks = texOf(cv); }
  const M = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, vertexColors: true, roughness: .92, metalness: 0, envMapIntensity: .45 }, o));
  TOWN.mats = { wall: M(TOWN.atlas), tile: M(TOWN.tiles, { roughness: .8 }), slate: M(TOWN.slate, { roughness: .7 }), rubble: M(TOWN.rubble), dressed: M(TOWN.dressed), wood: M(TOWN.planks) };
}

/* ---------------- geometry builders ---------------- */
class MB { // positions, normals, uvs and colours for one material
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
  poly(P, N, UV, C) { // a convex polygon, turned to face along N
    const k = P.length; let nx = 0, ny = 0, nz = 0;
    for (let a = 0; a < k; a++) { const p = P[a], q = P[(a + 1) % k]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
    const flip = nx * N[0] + ny * N[1] + nz * N[2] < 0, b = this.v;
    for (let a = 0; a < k; a++) { const q = flip ? k - 1 - a : a, p = P[q], c = C[0].length ? C[q] : C; this.p.push(p[0], p[1], p[2]); this.n.push(N[0], N[1], N[2]); this.u.push(UV[q][0], UV[q][1]); this.c.push(c[0], c[1], c[2]); }
    for (let a = 1; a < k - 1; a++) this.i.push(b, b + a, b + a + 1);
    this.v += k;
  }
  mesh(mat, shadow = true) {
    if (!this.v) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.i), 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; return m;
  }
}
const cellUV = (style, col, fu, fv) => { const e = .004; return [(col + e + clamp(fu, 0, 1) * (1 - 2 * e)) / AT, 1 - (style + 1) / AT + (e + clamp(fv, 0, 1) * (1 - 2 * e)) / AT]; };
function clipPoly(P, f) { // keep the part of polygon P (2D [u,v]) where f(p) <= 0 (f linear)
  const out = [];
  for (let a = 0; a < P.length; a++) {
    const p = P[a], q = P[(a + 1) % P.length], fp = f(p), fq = f(q);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
// one building's frame: local x along ang, local z across; y is world height
class TB {
  constructor() { this.b = { wall: new MB(), tile: new MB(), slate: new MB(), rubble: new MB(), dressed: new MB(), wood: new MB() }; this.foot = []; }
  at(x, z, ang) { this.x = x; this.z = z; this.c = Math.cos(ang); this.s = Math.sin(ang); this.ang = ang; return this; }
  L(fx, y, fz) { return [this.x + fx * this.c - fz * this.s, y, this.z + fx * this.s + fz * this.c]; }
  N(nx, ny, nz) { return [nx * this.c - nz * this.s, ny, nx * this.s + nz * this.c]; }
  // a wall from local a to b (2D), outward normal n: rows of bays cut from the atlas, with set-in openings
  wall(a, b, n, y0, rows, fh, style, cellFn, tint, foundY) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nb = Math.max(1, Math.round(L / 3)), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, N = this.N(n[0], 0, n[1]), W = this.b.wall;
    const P = (t, y, d = 0) => this.L(a[0] + ux * t - n[0] * d, y, a[1] + uz * t - n[1] * d);
    const dark = [tint[0] * .62, tint[1] * .6, tint[2] * .58];
    const fbase = foundY !== undefined ? (y0 - foundY) / fh : 0;
    for (let r = 0; r < rows; r++) for (let k = 0; k < nb; k++) {
      const t0 = k * L / nb, t1 = (k + 1) * L / nb, ya = y0 + r * fh, yb = ya + fh, col = cellFn(r, k, nb), hole = holeOf(style, col), bw = t1 - t0;
      const quad = (fu0, fv0, fu1, fv1, c0, c1) => W.poly([P(t0 + fu0 * bw, ya + fv0 * fh), P(t0 + fu1 * bw, ya + fv0 * fh), P(t0 + fu1 * bw, ya + fv1 * fh), P(t0 + fu0 * bw, ya + fv1 * fh)], N,
        [cellUV(style, col, fu0, fv0), cellUV(style, col, fu1, fv0), cellUV(style, col, fu1, fv1), cellUV(style, col, fu0, fv1)], [c0, c0, c1, c1]);
      const shade = fv => r === 0 && fv < .2 ? dark : tint; // a damp, darker plinth
      const strip = (fu0, fv0, fu1, fv1) => { if (r === 0 && fv0 < .14) { quad(fu0, fv0, fu1, Math.min(.14, fv1), dark, Math.min(.14, fv1) >= .14 ? lerpC(dark, tint, .7) : dark); if (fv1 > .14) quad(fu0, .14, fu1, fv1, lerpC(dark, tint, .7), tint); } else quad(fu0, fv0, fu1, fv1, tint, tint); };
      if (r === 0 && fbase > 0) W.poly([P(t0, foundY), P(t1, foundY), P(t1, y0), P(t0, y0)], N, [cellUV(style, CL.plain, 0, 0), cellUV(style, CL.plain, 1, 0), cellUV(style, CL.plain, 1, Math.min(1, fbase)), cellUV(style, CL.plain, 0, Math.min(1, fbase))], [dark[0] * .8, dark[1] * .8, dark[2] * .8]);
      if (!hole) { strip(0, 0, 1, 1); continue; }
      const h0 = hole[0] / CELLPX, h1 = hole[2] / CELLPX, v0 = 1 - hole[3] / CELLPX, v1 = 1 - hole[1] / CELLPX, dep = col === CL.big ? .12 : .2;
      strip(0, 0, h0, 1); strip(h1, 0, 1, 1); if (v1 < 1) strip(h0, v1, h1, 1); if (v0 > 0) strip(h0, 0, h1, v0);
      // the opening, set back into the wall, and its reveals
      const Q = (fu, fv, d) => P(t0 + fu * bw, ya + fv * fh, d);
      W.poly([Q(h0, v0, dep), Q(h1, v0, dep), Q(h1, v1, dep), Q(h0, v1, dep)], N, [cellUV(style, col, h0, v0), cellUV(style, col, h1, v0), cellUV(style, col, h1, v1), cellUV(style, col, h0, v1)], tint);
      const rv = cellUV(style, col, h0 - .02, (v0 + v1) / 2), rt = cellUV(style, col, (h0 + h1) / 2, Math.min(1, v1 + .02)), rc = [tint[0] * .8, tint[1] * .8, tint[2] * .8];
      const side = (fu, sgn) => W.poly([Q(fu, v0, 0), Q(fu, v0, dep), Q(fu, v1, dep), Q(fu, v1, 0)], this.N(ux * sgn, 0, uz * sgn), [rv, rv, rv, rv], rc);
      side(h0, 1); side(h1, -1);
      if (v1 < 1 || r < rows - 1) W.poly([Q(h0, v1, 0), Q(h1, v1, 0), Q(h1, v1, dep), Q(h0, v1, dep)], [0, -1, 0], [rt, rt, rt, rt], [rc[0] * .7, rc[1] * .7, rc[2] * .7]);
      if (v0 > 0) { W.poly([Q(h0, v0, 0), Q(h1, v0, 0), Q(h1, v0, dep), Q(h0, v0, dep)], [0, 1, 0], [rt, rt, rt, rt], rc); // sill
        if (col !== CL.door && col !== CL.big && style !== ST.church) this.box('dressed', a[0] + ux * (t0 + (h0 + h1) / 2 * bw) + n[0] * .05, ya + v0 * fh - .05, a[1] + uz * (t0 + (h0 + h1) / 2 * bw) + n[1] * .05, (h1 - h0) * bw + .22, .07, .14, [.95, .93, .88], ux, uz); }
    }
  }
  // the triangle of wall under a gable end (and under the ridge on a hipped roof nothing)
  gable(a, b, n, yE, rh, style, tint, attic) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, N = this.N(n[0], 0, n[1]), W = this.b.wall, fh = 2.9;
    const top = t => yE + rh * (1 - Math.abs(2 * t / L - 1));
    const cols = Math.max(2, 2 * Math.round(L / 6)), cw = L / cols;
    for (let k = 0; k < cols; k++) for (let r = 0; r * fh < rh; r++) {
      const t0 = k * cw, t1 = t0 + cw, ya = yE + r * fh, ys = (t, y) => y - top(t);
      let poly = [[t0, ya], [t1, ya], [t1, ya + fh], [t0, ya + fh]];
      const mid = L / 2, f = t0 < mid - 1e-6 ? p => p[1] - (yE + rh * (p[0] / mid)) : p => p[1] - (yE + rh * (1 - (p[0] - mid) / mid));
      poly = clipPoly(poly, f); if (poly.length < 3) continue;
      const col = attic && r === 0 && (k === cols / 2 - 1 || k === cols / 2) && rh > 3.4 && k === cols / 2 - 1 ? CL.small : CL.plain;
      if (col === CL.small) { // a small attic window spanning the middle
        const tm = mid - 1.5, holeQuad = [[tm, ya], [tm + 3, ya], [tm + 3, ya + fh], [tm, ya + fh]];
        this.wallPatch(a, ux, uz, N, n, holeQuad, style, tint, ya, fh, tm);
      }
      W.poly(poly.map(p => this.L(a[0] + ux * p[0], p[1], a[1] + uz * p[0])), N, poly.map(p => cellUV(style, CL.plain, (p[0] - t0) / cw, (p[1] - ya) / fh)), tint);
    }
  }
  wallPatch(a, ux, uz, N, n, quad, style, tint, ya, fh, tm) { // a small window laid just proud of the gable
    const h = HOLE.small, h0 = h[0] / CELLPX, h1 = h[2] / CELLPX, v0 = 1 - h[3] / CELLPX, v1 = 1 - h[1] / CELLPX, W = this.b.wall;
    const P = (fu, fv) => this.L(a[0] + ux * (tm + fu * 3) + n[0] * .02, ya + fv * fh, a[1] + uz * (tm + fu * 3) + n[1] * .02);
    const m0 = h0 - .12, m1 = h1 + .12, w0 = v0 - .1, w1 = v1 + .12;
    W.poly([P(m0, w0), P(m1, w0), P(m1, w1), P(m0, w1)], N, [cellUV(style, CL.small, m0, w0), cellUV(style, CL.small, m1, w0), cellUV(style, CL.small, m1, w1), cellUV(style, CL.small, m0, w1)], tint);
  }
  box(b, cx, cy, cz, sx, sy, sz, tint, ux = 1, uz = 0, uvm = 2.5, bottom = false) { // a box in local space, x along (ux,uz)
    const vx = -uz, vz = ux, B = this.b[b];
    const C = (i, j, k) => this.L(cx + ux * i * sx / 2 + vx * k * sz / 2, cy + j * sy, cz + uz * i * sx / 2 + vz * k * sz / 2);
    const face = (pts, n, uw, vh) => B.poly(pts, this.N(n[0], n[1], n[2]), [[0, 0], [uw / uvm, 0], [uw / uvm, vh / uvm], [0, vh / uvm]], tint);
    face([C(-1, 0, 1), C(1, 0, 1), C(1, 1, 1), C(-1, 1, 1)], [vx, 0, vz], sx, sy);
    face([C(1, 0, -1), C(-1, 0, -1), C(-1, 1, -1), C(1, 1, -1)], [-vx, 0, -vz], sx, sy);
    face([C(1, 0, 1), C(1, 0, -1), C(1, 1, -1), C(1, 1, 1)], [ux, 0, uz], sz, sy);
    face([C(-1, 0, -1), C(-1, 0, 1), C(-1, 1, 1), C(-1, 1, -1)], [-ux, 0, -uz], sz, sy);
    face([C(-1, 1, 1), C(1, 1, 1), C(1, 1, -1), C(-1, 1, -1)], [0, 1, 0], sx, sz);
    if (bottom) face([C(-1, 0, -1), C(1, 0, -1), C(1, 0, 1), C(-1, 0, 1)], [0, -1, 0], sx, sz);
  }
  // a roof over a W x D footprint: 'gable' or 'hip', ridge along local x (or z when alongZ)
  roof(W, D, E, pitch, kind, cover, tint, alongZ) {
    const hl = (alongZ ? D : W) / 2, hd = (alongZ ? W : D) / 2, t = Math.tan(pitch), ov = .45, og = .35, th = .2, k = Math.sqrt(1 + t * t), R = this.b[cover], Wd = this.b.wood;
    const eY = E - ov * t, rY = E + hd * t, rep = 2;
    const Q = (ra, y, rb) => alongZ ? this.L(rb, y, ra) : this.L(ra, y, rb), QN = (na, ny, nb) => alongZ ? this.N(nb, ny, na) : this.N(na, ny, nb);
    const under = [.32, .27, .22], fas = [.42, .36, .3];
    if (kind === 'hip' && hl >= hd) {
      const rl = hl - hd;
      for (const sg of [-1, 1]) {
        const pts = [[-(hl + ov), eY, sg * (hd + ov)], [hl + ov, eY, sg * (hd + ov)], [rl, rY, 0], [-rl, rY, 0]], uv = pts.map(p => [p[0] / rep, (hd + ov - Math.abs(p[2])) * k / rep]);
        R.poly(pts.map(p => Q(p[0], p[1] + th, p[2])), QN(0, 1, sg * t).map(v => v / k), uv, tint);
        Wd.poly(pts.map(p => Q(p[0], p[1], p[2])), QN(0, -1, -sg * t).map(v => v / k), uv, under);
        Wd.poly([Q(-(hl + ov), eY, sg * (hd + ov)), Q(hl + ov, eY, sg * (hd + ov)), Q(hl + ov, eY + th, sg * (hd + ov)), Q(-(hl + ov), eY + th, sg * (hd + ov))], QN(0, 0, sg), [[0, 0], [1, 0], [1, .1], [0, .1]], fas);
        const e = sg, tri = [[e * (hl + ov), eY, -(hd + ov)], [e * (hl + ov), eY, hd + ov], [e * rl, rY, 0]], tuv = tri.map(p => [p[2] / rep, (hl + ov - Math.abs(p[0])) * k / rep]);
        R.poly(tri.map(p => Q(p[0], p[1] + th, p[2])), QN(e * t, 1, 0).map(v => v / k), tuv, tint);
        Wd.poly(tri.map(p => Q(p[0], p[1], p[2])), QN(-e * t, -1, 0).map(v => v / k), tuv, under);
        Wd.poly([Q(e * (hl + ov), eY, -(hd + ov)), Q(e * (hl + ov), eY, hd + ov), Q(e * (hl + ov), eY + th, hd + ov), Q(e * (hl + ov), eY + th, -(hd + ov))], QN(e, 0, 0), [[0, 0], [1, 0], [1, .1], [0, .1]], fas);
      }
      this.ridgeCap(R, Q, QN, -rl, rl, rY + th, t, tint);
      return rY + th;
    }
    for (const sg of [-1, 1]) {
      const pts = [[-(hl + og), eY, sg * (hd + ov)], [hl + og, eY, sg * (hd + ov)], [hl + og, rY, 0], [-(hl + og), rY, 0]], uv = pts.map(p => [p[0] / rep, (hd + ov - Math.abs(p[2])) * k / rep]);
      R.poly(pts.map(p => Q(p[0], p[1] + th, p[2])), QN(0, 1, sg * t).map(v => v / k), uv, tint);
      Wd.poly(pts.map(p => Q(p[0], p[1], p[2])), QN(0, -1, -sg * t).map(v => v / k), uv, under);
      Wd.poly([Q(-(hl + og), eY, sg * (hd + ov)), Q(hl + og, eY, sg * (hd + ov)), Q(hl + og, eY + th, sg * (hd + ov)), Q(-(hl + og), eY + th, sg * (hd + ov))], QN(0, 0, sg), [[0, 0], [hl, 0], [hl, .1], [0, .1]], fas);
      for (const e of [-1, 1]) Wd.poly([Q(e * (hl + og), eY, sg * (hd + ov)), Q(e * (hl + og), rY, 0), Q(e * (hl + og), rY + th, 0), Q(e * (hl + og), eY + th, sg * (hd + ov))], QN(e, 0, 0), [[0, 0], [1, 0], [1, .1], [0, .1]], fas); // barge boards
    }
    this.ridgeCap(R, Q, QN, -(hl + og), hl + og, rY + th, t, tint);
    return rY + th;
  }
  ridgeCap(R, Q, QN, a0, a1, y, t, tint) {
    const w = .2, c = [tint[0] * .8, tint[1] * .78, tint[2] * .76];
    for (const sg of [-1, 1]) R.poly([Q(a0, y + .08, 0), Q(a1, y + .08, 0), Q(a1, y - w * t + .04, sg * w), Q(a0, y - w * t + .04, sg * w)], QN(0, 1, sg * .8), [[a0 / 2, 0], [a1 / 2, 0], [a1 / 2, .1], [a0 / 2, .1]], c);
  }
  chimney(fx, fz, yBase, yTop, mat, tint) {
    this.box(mat, fx, yBase, fz, .75, yTop - yBase, .62, tint, 1, 0, 2.5);
    this.box(mat, fx, yTop, fz, .95, .12, .82, [tint[0] * .7, tint[1] * .7, tint[2] * .7], 1, 0, 2.5);
    this.box('rubble', fx - .14, yTop + .12, fz, .2, .32, .2, [.55, .36, .28]); this.box('rubble', fx + .16, yTop + .12, fz, .2, .26, .2, [.55, .36, .28]); // chimney pots
  }
  flush(parent) { for (const [k, b] of Object.entries(this.b)) { const m = b.mesh(TOWN.mats[k]); if (m) { m.name = 'town_' + k; parent.add(m); } } }
}
const lerpC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/* ---------------- houses ---------------- */
const TINTS = {
  [ST.stone]: [[1, 1, 1], [.96, .93, .87], [1.04, .99, .9], [.9, .9, .88], [1.02, .96, .86]],
  [ST.plaster]: [[1.04, .98, .84], [1.06, .92, .7], [1.08, 1.06, 1.0], [1.06, .94, .88], [.96, .96, .92], [1.06, 1.0, .76], [.98, 1.0, .9]],
  [ST.timber]: [[1.05, 1.02, .95], [1.04, .97, .85], [1.06, 1.05, 1.0]],
  [ST.brick]: [[1, 1, 1], [.9, .86, .84], [1.04, .96, .9]],
  [ST.plank]: [[1, 1, 1], [1.05, .72, .6], [.82, .82, .8]],
  [ST.field]: [[1, 1, 1], [1.05, 1.02, .96]],
};
const ROOF_TINT = { tile: [[.86, .84, .84], [.8, .72, .7], [.9, .8, .74], [.74, .66, .64], [.84, .78, .76]], slate: [[1, 1, 1], [.88, .92, 1], [1.12, 1.1, 1.06]] };
const TOWN_KIND = [ // what each town is mostly built of
  { st: [[ST.stone, 45], [ST.timber, 32], [ST.plaster, 15], [ST.brick, 8]], slate: .5, pitch: [44, 54], hip: .08 }, // Normandy
  { st: [[ST.plaster, 52], [ST.brick, 28], [ST.timber, 10], [ST.stone, 10]], slate: .25, pitch: [36, 46], hip: .35 }, // Poland
  { st: [[ST.stone, 30], [ST.plaster, 30], [ST.brick, 20], [ST.timber, 20]], slate: .4, pitch: [40, 50], hip: .2 }, // mixed
];
const pickW = (list, r) => { let s = 0; for (const [, w] of list) s += w; let x = r * s; for (const [v, w] of list) { x -= w; if (x <= 0) return v; } return list[0][0]; };
function roadDistKm(M, x, y) { let best = 1e9; for (const r of M._roads) for (let k = 0; k < r.P.length - 1; k++) { const a = r.P[k], b = r.P[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-9, t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1); best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y)); } return best; }
function nearestRoad(M, x, y) { let best = 1e9, out = null; for (const r of M._roads) for (let k = 0; k < r.P.length - 1; k++) { const a = r.P[k], b = r.P[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-9, t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1), d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y); if (d < best) { best = d; out = { x: a[0] + dx * t, y: a[1] + dy * t, ang: Math.atan2(dy, dx), main: r.main, d }; } } return out; }

function buildHouse(T, h) { // h: {x, z, ang, W, D, y0, style, floors, cover, pitch, roof, front (+1/-1 local z), seed, barn}
  const R = rng(h.seed), fh = h.barn ? 4.4 : 2.9, rows = h.barn ? 1 : h.floors, yb = h.y0 + .25, E = yb + rows * fh, W = h.W, D = h.D;
  T.at(h.x, h.z, h.ang);
  const tint = TINTS[h.style][(R() * TINTS[h.style].length) | 0];
  const alongZ = h.alongZ, hip = h.roof === 'hip' && !alongZ && W >= D;
  const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]], normals = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const doorBay = nb => Math.min(nb - 1, Math.max(0, Math.floor(nb / 2 + (R() - .5) * nb * .6)));
  for (let f = 0; f < 4; f++) {
    const a = corners[f], b = corners[(f + 1) % 4], n = normals[f], isFront = n[1] === h.front, isSide = n[0] !== 0, gableEnd = alongZ ? !isSide : isSide;
    const L = isSide ? D : W, nb = Math.max(1, Math.round(L / 3)), db = doorBay(nb), plainP = isFront ? .12 : isSide ? .55 : .4;
    const win = h.style === ST.timber || h.style === ST.stone ? (R() < .6 ? CL.winA : CL.winB) : h.style === ST.brick ? CL.winB : (R() < .55 ? CL.winA : CL.winB);
    const pat = []; for (let k = 0; k < nb * rows; k++) pat.push(R());
    const cellFn = (r, k, n2) => {
      if (h.barn) { if (isFront && k === db) return CL.big; return pat[r * n2 + k] < .7 ? (k % 2 ? CL.plain2 : CL.plain) : CL.small; }
      if (r === 0 && isFront && k === db) return CL.door;
      if (r === 0 && !isFront && !isSide && k === db && pat[k] < .5) return CL.door; // a back door
      if (pat[r * n2 + k] < plainP) return h.style === ST.timber ? (k % 2 ? CL.plain : CL.plain2) : CL.plain;
      return r === rows - 1 && rows > 2 && R() < .3 ? CL.small : win;
    };
    T.wall(a, b, n, yb, rows, fh, h.style, cellFn, tint, h.y0 - 1.6);
    if (gableEnd && !hip) T.gable(a, b, n, E, (alongZ ? W : D) / 2 * Math.tan(h.pitch), h.style === ST.timber ? ST.timber : h.style === ST.plank ? ST.plank : h.style, tint, !h.barn);
  }
  const rt = ROOF_TINT[h.cover][(R() * ROOF_TINT[h.cover].length) | 0];
  const ridge = T.roof(W, D, E, h.pitch, hip ? 'hip' : 'gable', h.cover, rt, alongZ);
  if (!h.barn) { // chimneys: at a gable end or on the ridge
    const along = alongZ ? D : W, n = along > 11 && R() < .6 ? 2 : 1, chimTint = h.style === ST.brick || R() < .3 ? [1.25, .72, .6] : [1, .98, .95], cm = h.style === ST.brick || chimTint[1] < .8 ? 'rubble' : 'dressed';
    for (let k = 0; k < n; k++) {
      const off = (k ? -1 : 1) * (hip ? along / 2 - (alongZ ? W : D) / 2 * .9 : along / 2 - .55) * (R() < .3 && n === 1 ? .2 : 1);
      const [cx, cz] = alongZ ? [(R() - .5) * .4, off] : [off, (R() - .5) * .4];
      T.chimney(cx, cz, E - .5, ridge + .7 + R() * .4, cm, chimTint);
    }
  }
  return E;
}
function buildChurch(T, c) { // nave, chancel, a west tower with a slate spire, buttresses; the door faces the road
  T.at(c.x, c.z, c.ang);
  const st = ST.church, tint = [1, .98, .94], fh = 2.7, y0 = c.y0, yb = y0 + .2, dressed = [1.05, 1.02, .96];
  const NW = 22, ND = 11, nRows = 3, E = yb + nRows * fh, nb = Math.round(NW / 3), roadF = c.side > 0 ? 0 : 2;
  const box4 = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], nn = [[0, -1], [1, 0], [0, 1], [-1, 0]], nave = box4(NW, ND);
  for (let f = 0; f < 4; f++) {
    const cf = f % 2 ? () => CL.plain : (r, k) => {
      if (f === roadF && k === (nb >> 1)) return r === 0 ? CL.door : r === 1 ? CL.big : CL.plain;
      return k % 2 && r > 0 ? (r === 1 ? CL.winA : CL.winB) : CL.plain;
    };
    T.wall(nave[f], nave[(f + 1) % 4], nn[f], yb, nRows, fh, st, cf, tint, y0 - 1.6);
    if (f % 2) T.gable(nave[f], nave[(f + 1) % 4], nn[f], E, ND / 2 * Math.tan(.92), st, tint, false);
  }
  T.roof(NW, ND, E, .92, 'gable', 'slate', [.95, .98, 1.02], false);
  for (let k = 0; k <= nb; k++) for (const sd of [-1, 1]) { if (sd === (roadF ? 1 : -1) && (k === (nb >> 1) || k === (nb >> 1) + 1)) continue; T.box('dressed', -NW / 2 + k * NW / nb, y0 - .5, sd * (ND / 2 + .3), .7, E - y0 - .4, .6, dressed, 1, 0, 2.2); } // buttresses
  // the chancel at the east end, lower and narrower
  T.at(c.x + Math.cos(c.ang) * (NW / 2 + 3.5), c.z + Math.sin(c.ang) * (NW / 2 + 3.5), c.ang);
  const CW = 7, CD = 8, cE = yb + 2 * fh, ch = box4(CW, CD);
  for (let f = 0; f < 3; f++) { T.wall(ch[f], ch[(f + 1) % 4], nn[f], yb, 2, fh, st, (r, k, n2) => k === (n2 >> 1) ? (r ? CL.winB : CL.winA) : CL.plain, tint, y0 - 1.6); if (f === 1) T.gable(ch[f], ch[(f + 1) % 4], nn[f], cE, CD / 2 * Math.tan(.92), st, tint, false); }
  T.roof(CW, CD, cE, .92, 'gable', 'slate', [.95, .98, 1.02], false);
  // the tower at the west end: paired lancets, a clock, paired belfry openings, a four-sided spire
  const TW = 6, tRows = 7, tE = yb + tRows * fh, tx = c.x - Math.cos(c.ang) * (NW / 2 + TW / 2 - .2), tz = c.z - Math.sin(c.ang) * (NW / 2 + TW / 2 - .2);
  T.at(tx, tz, c.ang);
  const tw = box4(TW, TW);
  for (let f = 0; f < 4; f++) T.wall(tw[f], tw[(f + 1) % 4], nn[f], yb, tRows, fh, st, r => r === tRows - 1 ? CL.small : f !== 1 && r === 3 ? CL.winA : f !== 1 && r === 4 ? CL.winB : CL.plain, tint, y0 - 1.6);
  for (let f = 0; f < 4; f++) { if (f === 1) continue; const n = nn[f], ya = yb + 5 * fh + .2, W = T.b.wall, cx = n[0] * (TW / 2 + .03), cz = n[1] * (TW / 2 + .03), ux = -n[1], uz = n[0], s = 1.25; // clock faces
    const P = (u, v) => T.L(cx + ux * u, ya + 1.25 + v, cz + uz * u); W.poly([P(-s, -s), P(s, -s), P(s, s), P(-s, s)], T.N(n[0], 0, n[1]), [cellUV(st, CL.extra, .15, .15), cellUV(st, CL.extra, .85, .15), cellUV(st, CL.extra, .85, .85), cellUV(st, CL.extra, .15, .85)], tint); }
  T.box('dressed', 0, tE - .1, 0, TW + .5, .4, TW + .5, dressed, 1, 0, 2.2, true); // cornice
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) T.box('dressed', a * (TW / 2 + .2), y0 - .5, b * (TW / 2 + .2), .9, 8, .9, dressed, 1, 0, 2.2);
  const sH = 14, base = tE + .3, hw = TW / 2 + .3, S = T.b.slate, top = T.L(0, base + sH, 0), sc = [.9, .94, 1], k = Math.hypot(sH, hw);
  for (const [nx, nz] of nn) { const ax = nz ? -hw : nx * hw, az = nx ? -hw : nz * hw, bx = nz ? hw : nx * hw, bz = nx ? hw : nz * hw; S.poly([T.L(ax, base, az), T.L(bx, base, bz), top], T.N(nx * sH / k, hw / k, nz * sH / k), [[0, 0], [TW / 2, 0], [TW / 4, sH / 2]], sc); }
  T.box('dressed', 0, base + sH - .2, 0, .1, 2, .1, [.3, .28, .25]); T.box('dressed', 0, base + sH + 1.2, 0, .8, .1, .1, [.3, .28, .25]); // the cross
}
function stoneWallSeg(T, x0, z0, x1, z1, h, mat = 'rubble', tint = [1, 1, 1]) { // a dry stone wall between two world points, following the ground
  const L = Math.hypot(x1 - x0, z1 - z0); if (L < .5) return;
  const n = Math.max(1, Math.ceil(L / 3.5)), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  T.at(0, 0, 0);
  for (let k = 0; k < n; k++) {
    const ta = k / n * L, tb = (k + 1) / n * L, mx = x0 + ux * (ta + tb) / 2, mz = z0 + uz * (ta + tb) / 2, y = Math.min(terrainY(x0 + ux * ta, z0 + uz * ta), terrainY(x0 + ux * tb, z0 + uz * tb), terrainY(mx, mz)) - .25;
    const hh = h * (.92 + hash2(mx | 0, mz | 0, 5) * .16);
    T.box(mat, mx, y, mz, tb - ta + .06, hh + .25, .5, tint, ux, uz, 2.4);
    T.box(mat, mx, y + hh + .25, mz, tb - ta + .06, .14, .6, [tint[0] * .78, tint[1] * .78, tint[2] * .76], ux, uz, 2.4); // coping
  }
}

/* ---------------- the towns ---------------- */
function buildRealTowns(M) {
  makeTownTextures();
  const T = new TB(), R = rng(M.seed * 131 + 7), houses = [];
  REAL.townHouses = houses; REAL.hedgeExtra = []; FL.roads = null; // (road bins are per map)
  // a church in every town, beside the road nearest the middle; houses in its way give way
  const churches = M.towns.map((t, ti) => {
    const rd = nearestRoad(M, t.x, t.y); if (!rd) return null;
    const side = hash2(ti, M.seed, 3) < .5 ? -1 : 1, nx = -Math.sin(rd.ang) * side, ny = Math.cos(rd.ang) * side, off = (rd.main ? .016 : .012) + .014;
    const cx = rd.x + nx * off, cy = rd.y + ny * off;
    return { x: cx * 1000, z: cy * 1000, ang: rd.ang, ti, side, y0: groundY(cx * 1000, cy * 1000) - .2 };
  }).filter(Boolean);
  const inChurch = (x, z, pad) => churches.some(c => { const dx = x - c.x, dz = z - c.z, lx = dx * Math.cos(c.ang) + dz * Math.sin(c.ang), lz = -dx * Math.sin(c.ang) + dz * Math.cos(c.ang); return Math.abs(lx - 2) < 23 + pad && Math.abs(lz) < 13 + pad; });
  REAL.churches = churches;
  for (const c of churches) {
    buildChurch(T, c);
    addCollider(c.x, c.z, 11, 5.5, c.ang, c.y0 - 2, c.y0 + 8.5);
    addCollider(c.x - Math.cos(c.ang) * 13.6, c.z - Math.sin(c.ang) * 13.6, 3, 3, c.ang, c.y0 - 2, c.y0 + 19);
    addCollider(c.x + Math.cos(c.ang) * 14.5, c.z + Math.sin(c.ang) * 14.5, 3.5, 4, c.ang, c.y0 - 2, c.y0 + 5.6);
    // churchyard wall with a gate in front of the door
    const P = (lx, lz) => [c.x + lx * Math.cos(c.ang) - lz * Math.sin(c.ang), c.z + lx * Math.sin(c.ang) + lz * Math.cos(c.ang)], s = c.side, back = s * 13, front = -s * 9.5;
    for (const [a, b, cc, d] of [[-21, front, -21, back], [-21, back, 25, back], [25, back, 25, front], [-21, front, -2, front], [2, front, 25, front]]) { const p0 = P(a, b), p1 = P(cc, d); stoneWallSeg(T, p0[0], p0[1], p1[0], p1[1], 1.0, 'dressed', [1, .97, .92]); }
    for (let k = 0; k < 3; k++) { const p = P(-20 + k * 20 + (R() - .5) * 4, back - s * (2.5 + R())); REAL.hedgeExtra.push({ yew: true, x: p[0], z: p[1] }); }
  }
  for (const [x, y, w, d, a] of M.buildings) {
    const wx = x * 1000, wz = y * 1000; if (inChurch(wx, wz, Math.max(w, d) * 500)) continue;
    let ti = 0, best = 1e9; M.towns.forEach((t, k) => { const dd = Math.hypot(t.x - x, t.y - y); if (dd < best) { best = dd; ti = k; } });
    const town = M.towns[ti], kind = TOWN_KIND[(ti + M.seed) % 3], seed = (wx * 7 + wz * 13) | 0, Rh = rng(seed);
    let W = w * 1000, D = d * 1000; const rel = best / town.r;
    const barn = rel > .7 && W * D > 120 && Rh() < .45;
    let style = barn ? (Rh() < .55 ? ST.plank : ST.field) : pickW(kind.st, Rh());
    const k3 = (W * 7 | 0) % 3; let floors = k3 === 0 ? 1 : 2; if (k3 === 2 && rel < .4 && (style === ST.plaster || style === ST.brick)) floors = 3; if (!barn && floors === 1 && Rh() < .4) floors = 2;
    if (barn) { W = Math.max(W, 14); D = Math.max(D, 9); }
    // which long side faces the street
    const c = Math.cos(a), s = Math.sin(a), off = D / 2000 + .008;
    const dPlus = roadDistKm(M, x - s * off, y + c * off), dMinus = roadDistKm(M, x + s * off, y - c * off), front = dPlus < dMinus ? 1 : -1;
    const alongZ = D > W * 1.1 || (!barn && (style === ST.timber || style === ST.brick) && Rh() < .28 && W < 14); // gable end to the street
    const cover = barn ? (Rh() < .5 ? 'slate' : 'tile') : Rh() < kind.slate ? 'slate' : 'tile';
    const pitch = (barn ? 38 + Rh() * 8 : kind.pitch[0] + Rh() * (kind.pitch[1] - kind.pitch[0])) * Math.PI / 180;
    const roof = !barn && Rh() < kind.hip ? 'hip' : 'gable';
    const y0 = groundY(wx, wz) - .3;
    const E = buildHouse(T, { x: wx, z: wz, ang: a, W, D, y0, style, floors, cover, pitch, roof, front, seed, barn, alongZ });
    addCollider(wx, wz, W / 2, D / 2, a, y0 - 2, E);
    houses.push({ x: wx, z: wz, ang: a, W, D, front, barn, ti });
  }
  // garden walls behind the houses (stone or a hedge), with a gap for a gate
  const inHouse = (px, pz, pad) => houses.some(o => { const dx = px - o.x, dz = pz - o.z, lx = dx * Math.cos(o.ang) + dz * Math.sin(o.ang), lz = -dx * Math.sin(o.ang) + dz * Math.cos(o.ang); return Math.abs(lx) < o.W / 2 + pad && Math.abs(lz) < o.D / 2 + pad; });
  for (const o of houses) {
    if (o.barn) continue;
    const Rg = rng((o.x * 3 + o.z * 5) | 0); if (Rg() < .25) continue;
    const gd = 8 + Rg() * 7, c = Math.cos(o.ang), s = Math.sin(o.ang), bk = -o.front, P = (lx, lz) => [o.x + lx * c - lz * s, o.z + lx * s + lz * c];
    const z0 = bk * (o.D / 2 + .3), z1 = bk * (o.D / 2 + gd), x0 = -o.W / 2 - .3, x1 = o.W / 2 + .3;
    const probes = [[x0, z1], [x1, z1], [0, z1], [x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]].map(p => P(p[0], p[1]));
    if (probes.some(([px, pz]) => onRoadFine(px, pz) || inHouse(px, pz, .8) || inChurch(px, pz, 2) || terrainY(px, pz) < 2)) continue;
    const hedge = Rg() < .38, h = .95 + Rg() * .45, gate = (Rg() * 3) | 0;
    for (let k = 0, nt = Rg() < .75 ? 1 + (Rg() < .4) : 0; k < nt; k++) { const p = P((Rg() - .5) * (o.W - 3), bk * (o.D / 2 + 3.5 + Rg() * (gd - 5))); REAL.hedgeExtra.push({ tree: Rg() < .55 ? 'oak' : Rg() < .5 ? 'birch' : 'beech', x: p[0], z: p[1], s: .38 + Rg() * .22 }); } // fruit and shade trees
    const segs = [[x0, z0, x0, z1], [x0, z1, x1, z1], [x1, z1, x1, z0]];
    segs.forEach(([a1, b1, a2, b2], k) => {
      let parts = [[a1, b1, a2, b2]];
      if (k === gate) { const mx = (a1 + a2) / 2, mz = (b1 + b2) / 2, L = Math.hypot(a2 - a1, b2 - b1), ux = (a2 - a1) / L, uz = (b2 - b1) / L; parts = [[a1, b1, mx - ux * 1.4, mz - uz * 1.4], [mx + ux * 1.4, mz + uz * 1.4, a2, b2]]; }
      for (const [p, q, r2, t2] of parts) { const A = P(p, q), B = P(r2, t2); if (hedge) REAL.hedgeExtra.push({ x0: A[0], z0: A[1], x1: B[0], z1: B[1], h: 1.6 + Rg() * .6 }); else stoneWallSeg(T, A[0], A[1], B[0], B[1], h); }
    });
  }
  T.flush(WORLD.group);
}
