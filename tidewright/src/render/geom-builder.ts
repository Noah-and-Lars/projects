// Small helper to accumulate flat-shaded triangles with per-vertex colour.
import * as THREE from 'three';

export type V3 = [number, number, number];

export class GeomBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  /** Transform applied to every point added (cell-space -> body metres). */
  xf: (p: V3) => V3 = (p) => p;
  nxf: (n: V3) => V3 = (n) => n;

  tri(a: V3, b: V3, c: V3, color: THREE.Color, shade: [number, number, number] = [1, 1, 1]) {
    const A = this.xf(a), B = this.xf(b), C = this.xf(c);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    for (const [p, s] of [[A, shade[0]], [B, shade[1]], [C, shade[2]]] as [V3, number][]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(color.r * s, color.g * s, color.b * s);
    }
  }

  /** Quad a-b-c-d counter-clockwise when viewed from outside. ao = per-corner brightness. */
  quad(a: V3, b: V3, c: V3, d: V3, color: THREE.Color, ao: [number, number, number, number] = [1, 1, 1, 1]) {
    // Flip the diagonal to avoid AO anisotropy.
    if (ao[0] + ao[2] < ao[1] + ao[3]) {
      this.tri(b, c, d, color, [ao[1], ao[2], ao[3]]);
      this.tri(b, d, a, color, [ao[1], ao[3], ao[0]]);
    } else {
      this.tri(a, b, c, color, [ao[0], ao[1], ao[2]]);
      this.tri(a, c, d, color, [ao[0], ao[2], ao[3]]);
    }
  }

  box(min: V3, max: V3, color: THREE.Color) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color); // +z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color); // -z
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color); // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color); // -x
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color); // +y
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color); // -y
  }

  /** Cylinder along X from x0 to x1, centre (cy, cz), radius r. */
  cylX(x0: number, x1: number, cy: number, cz: number, r: number, color: THREE.Color, seg = 12, capColor?: THREE.Color) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const y0 = cy + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const y1 = cy + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      this.quad([x0, y0, z0], [x0, y1, z1], [x1, y1, z1], [x1, y0, z0], color);
      const cc = capColor ?? color;
      this.tri([x1, cy, cz], [x1, y0, z0], [x1, y1, z1], cc);
      this.tri([x0, cy, cz], [x0, y1, z1], [x0, y0, z0], cc);
    }
  }

  get count() { return this.pos.length / 3; }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}
