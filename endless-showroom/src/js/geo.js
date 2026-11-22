// Builds merged, vertex-coloured geometry from boxes and cylinders, so a whole
// piece of furniture (or a whole chunk of shelving) is a single draw call.
import * as THREE from 'three';

const tmp = new THREE.Color();

export class GeoBuilder {
  // mat: the surface id (mats.js SURF) for the next shapes. matOf(hex), if
  // set, may override it per colour (e.g. metal handles on a wooden door).
  constructor() { this.pos = []; this.nor = []; this.col = []; this.mid = []; this.idx = []; this.n = 0; this.mat = 0; this.matOf = null; }
  _m(hex) { const m = this.matOf ? this.matOf(hex) : null; return m == null ? this.mat : m; }

  _c(hex, shade = 1) { tmp.setHex(hex); return [tmp.r * shade, tmp.g * shade, tmp.b * shade]; }

  // Axis-aligned box centred on (cx, cy, cz).
  box(cx, cy, cz, sx, sy, sz, hex, opts) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const skipBottom = opts && opts.noBottom;
    const faces = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], 0.92],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], 0.92],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], 1.0],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], 0.7],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], 0.96],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], 0.88],
    ];
    for (let f = 0; f < 6; f++) {
      if (skipBottom && f === 3) continue;
      const [a, b, c, d, nrm, sh] = faces[f];
      const col = this._c(hex, sh), m = this._m(hex);
      for (const v of [a, b, c, d]) { this.pos.push(v[0], v[1], v[2]); this.nor.push(nrm[0], nrm[1], nrm[2]); this.col.push(col[0], col[1], col[2]); this.mid.push(m); }
      const n = this.n; this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3); this.n += 4;
    }
    return this;
  }

  // Box given by its min corner and size (handy for shelving).
  boxMin(x, y, z, sx, sy, sz, hex, opts) { return this.box(x + sx / 2, y + sy / 2, z + sz / 2, sx, sy, sz, hex, opts); }

  // Upright cylinder; (cx, cy, cz) is the centre of its base.
  cyl(cx, cy, cz, r, h, hex, seg = 8, rTop = r) {
    const col = this._c(hex, 0.95), top = this._c(hex, 1.0), sm = this._m(hex);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n = this.n;
      this.pos.push(cx + c0 * r, cy, cz + s0 * r, cx + c1 * r, cy, cz + s1 * r, cx + c1 * rTop, cy + h, cz + s1 * rTop, cx + c0 * rTop, cy + h, cz + s0 * rTop);
      const nm = (Math.cos((a0 + a1) / 2)), ns = Math.sin((a0 + a1) / 2);
      for (let k = 0; k < 4; k++) { this.nor.push(nm, 0, ns); this.col.push(col[0], col[1], col[2]); this.mid.push(sm); }
      this.idx.push(n, n + 3, n + 2, n, n + 2, n + 1); this.n += 4;
      // top cap triangle
      const m = this.n;
      this.pos.push(cx, cy + h, cz, cx + c1 * rTop, cy + h, cz + s1 * rTop, cx + c0 * rTop, cy + h, cz + s0 * rTop);
      for (let k = 0; k < 3; k++) { this.nor.push(0, 1, 0); this.col.push(top[0], top[1], top[2]); this.mid.push(sm); }
      this.idx.push(m, m + 1, m + 2); this.n += 3;
    }
    return this;
  }

  // Sphere centred on (cx, cy, cz). hex may be a function (ring, segment) ->
  // colour, for stripes and panels.
  sphere(cx, cy, cz, r, hex, seg = 12, rings = 8) {
    const n0 = this.n;
    for (let j = 0; j <= rings; j++) {
      const v = j / rings, phi = v * Math.PI, y = Math.cos(phi), rr = Math.sin(phi);
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, th = u * Math.PI * 2, x = Math.cos(th) * rr, z = Math.sin(th) * rr;
        const h = typeof hex === 'function' ? hex(Math.min(j, rings - 1), Math.min(i, seg - 1)) : hex;
        const col = this._c(h, 0.8 + 0.2 * (y * 0.5 + 0.5));
        this.pos.push(cx + x * r, cy + y * r, cz + z * r); this.nor.push(x, y, z); this.col.push(col[0], col[1], col[2]); this.mid.push(this._m(h));
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = n0 + j * (seg + 1) + i, b = a + seg + 1;
      this.idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
    this.n += (rings + 1) * (seg + 1);
    return this;
  }

  // Flat horizontal quad (rugs, signs lying down) at height y.
  quadY(cx, y, cz, sx, sz, hex) {
    const col = this._c(hex), n = this.n, m = this._m(hex);
    this.pos.push(cx - sx / 2, y, cz + sz / 2, cx + sx / 2, y, cz + sz / 2, cx + sx / 2, y, cz - sz / 2, cx - sx / 2, y, cz - sz / 2);
    for (let k = 0; k < 4; k++) { this.nor.push(0, 1, 0); this.col.push(col[0], col[1], col[2]); this.mid.push(m); }
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3); this.n += 4;
    return this;
  }

  get empty() { return this.n === 0; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mid, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
