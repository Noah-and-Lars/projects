// Motocross bike and rider models built from Three.js primitives.
// Static bike parts are merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BIKE } from './bike.js';
import { LIMB } from './rider.js';
import { numberTexture } from './textures.js';

const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...o });

// Shared materials (colour-independent).
const M = {
  tyre: std(0x1b1b1e, { roughness: 0.92 }),
  rim: std(0x23252b, { roughness: 0.35, metalness: 0.8 }),
  spoke: std(0xd8dce2, { roughness: 0.3, metalness: 0.9 }),
  chrome: std(0xe6e9ee, { roughness: 0.18, metalness: 1.0 }),
  alu: std(0xb9bec6, { roughness: 0.35, metalness: 0.85 }),
  engine: std(0x3a3d44, { roughness: 0.45, metalness: 0.6 }),
  black: std(0x15161a, { roughness: 0.6 }),
  seat: std(0x111114, { roughness: 0.75 }),
  pipe: std(0x8c7a68, { roughness: 0.35, metalness: 0.9 }),
  silencer: std(0x2a2c31, { roughness: 0.3, metalness: 0.8 }),
  fork: std(0xd9a62a, { roughness: 0.25, metalness: 0.85 }),
  boot: std(0xf0f0f0, { roughness: 0.55 }),
  sole: std(0x18181b, { roughness: 0.8 }),
  lens: std(0x1a2230, { roughness: 0.05, metalness: 0.9, envMapIntensity: 1.5 }),
  skinDark: std(0x111111, { roughness: 0.8 }),
};

// ---------- geometry helpers ----------
class Parts {
  constructor() { this.byMat = new Map(); }
  add(mat, geo, pos, rot, scale) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(pos || V3(0, 0, 0), new THREE.Quaternion().setFromEuler(rot || new THREE.Euler()), scale || V3(1, 1, 1));
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return this;
  }
  build(shadows = true) {
    const grp = new THREE.Group();
    for (const [mat, list] of this.byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = shadows;
      grp.add(mesh);
    }
    return grp;
  }
}

// Tube through points (bike-local, with z).
function tube(points, r, seg = 24) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, 8, false);
}
// Extruded side-profile shape, centred on z.
function slab(pts, depth, bevel = 0.012) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function rounded(pts, depth, bevel = 0.02) {
  // Same as slab but with smooth quadratic corners.
  const s = new THREE.Shape();
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  s.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % n]);
    s.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const cyl = (r1, r2, h, seg = 16) => new THREE.CylinderGeometry(r1, r2, h, seg);
const zRot = (a) => new THREE.Euler(0, 0, a);
const xRot90 = new THREE.Euler(Math.PI / 2, 0, 0);

// ---------- wheel (shared geometry) ----------
let WHEEL = null;
function wheelGeometry() {
  if (WHEEL) return WHEEL;
  const R = BIKE.wheelR;
  const tyre = new Parts(), rim = new Parts(), spokes = new Parts();
  tyre.add(M.tyre, new THREE.TorusGeometry(R - 0.072, 0.066, 12, 40));
  const knob = new THREE.BoxGeometry(0.034, 0.05, 0.046);
  const nK = 34;
  for (let i = 0; i < nK; i++) {
    for (const zz of [-0.032, 0.032]) {
      const a = ((i + (zz > 0 ? 0.5 : 0)) / nK) * Math.PI * 2;
      tyre.add(M.tyre, knob, V3(Math.cos(a) * (R - 0.012), Math.sin(a) * (R - 0.012), zz), zRot(a));
    }
  }
  rim.add(M.rim, new THREE.TorusGeometry(R - 0.105, 0.016, 6, 40));
  rim.add(M.rim, new THREE.TorusGeometry(R - 0.105, 0.01, 4, 40), V3(0, 0, 0.022));
  rim.add(M.rim, new THREE.TorusGeometry(R - 0.105, 0.01, 4, 40), V3(0, 0, -0.022));
  spokes.add(M.alu, cyl(0.045, 0.045, 0.13), V3(0, 0, 0), xRot90);
  spokes.add(M.alu, cyl(0.065, 0.065, 0.02), V3(0, 0, 0.05), xRot90);
  spokes.add(M.alu, cyl(0.065, 0.065, 0.02), V3(0, 0, -0.05), xRot90);
  const nS = 32, rimR = R - 0.11;
  for (let i = 0; i < nS; i++) {
    const side = i % 2 ? 1 : -1;
    const a0 = (i / nS) * Math.PI * 2, a1 = a0 + 0.35 * side;
    const a = V3(Math.cos(a0) * 0.06, Math.sin(a0) * 0.06, 0.05 * side);
    const b = V3(Math.cos(a1) * rimR, Math.sin(a1) * rimR, 0.006 * side);
    const len = a.distanceTo(b);
    const g = cyl(0.0045, 0.0045, len, 4);
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    spokes.add(M.spoke, g, mid, new THREE.Euler().setFromQuaternion(q));
  }
  WHEEL = { tyre, rim, spokes };
  return WHEEL;
}

function makeWheel(front) {
  const W = wheelGeometry();
  const spin = new THREE.Group();
  spin.add(W.tyre.build(), W.rim.build(false), W.spokes.build(false));
  if (front) {
    const disc = new THREE.Mesh(cyl(0.13, 0.13, 0.006, 24), M.chrome);
    disc.rotation.x = Math.PI / 2; disc.position.z = 0.075;
    spin.add(disc);
  }
  const holder = new THREE.Group();
  holder.add(spin);
  return { holder, spin };
}

// ---------- bike ----------
export function makeBikeModel(scheme) {
  const plastic = std(scheme.color, { roughness: 0.38 });
  const accent = std(scheme.accent, { roughness: 0.4 });
  const frameM = std(scheme.frame, { roughness: 0.35, metalness: 0.7 });
  const root = new THREE.Group();
  const P = new Parts();

  // Frame tubes (twin spar: near and far side).
  for (const z of [0.07, -0.07]) {
    P.add(frameM, tube([V3(0.42, 0.28, 0), V3(0.2, 0.2, z), V3(-0.12, 0.14, z), V3(-0.2, -0.05, z), V3(-0.15, -0.26, z)], 0.026));
    P.add(frameM, tube([V3(-0.14, 0.14, z), V3(-0.45, 0.2, z), V3(-0.72, 0.24, z * 0.8)], 0.015));
    P.add(frameM, tube([V3(-0.2, -0.02, z), V3(-0.5, 0.12, z), V3(-0.7, 0.22, z * 0.8)], 0.012));
  }
  P.add(frameM, tube([V3(0.42, 0.26, 0), V3(0.3, 0.0, 0), V3(0.18, -0.3, 0), V3(-0.12, -0.36, 0), V3(-0.16, -0.26, 0)], 0.022));
  P.add(frameM, cyl(0.04, 0.04, 0.2), V3(0.43, 0.3, 0), zRot(-0.42)); // steering head

  // Engine: crankcase, cylinder with fins, side covers.
  P.add(M.engine, rounded([[-0.14, -0.36], [0.2, -0.36], [0.24, -0.12], [0.08, -0.04], [-0.12, -0.08]], 0.2, 0.02));
  P.add(M.alu, cyl(0.09, 0.09, 0.03, 20), V3(0.02, -0.22, 0.12), xRot90);
  P.add(M.alu, cyl(0.065, 0.065, 0.03, 20), V3(-0.08, -0.25, -0.12), xRot90);
  for (let i = 0; i < 6; i++) {
    P.add(M.engine, new THREE.BoxGeometry(0.17, 0.012, 0.16), V3(0.14 + i * 0.012, -0.08 + i * 0.03, 0), zRot(-0.35));
  }
  P.add(M.black, cyl(0.04, 0.04, 0.16), V3(0.2, 0.1, 0), xRot90); // carb/throttle body
  // Radiators behind the shrouds.
  for (const z of [0.12, -0.12]) P.add(M.black, new THREE.BoxGeometry(0.16, 0.22, 0.04), V3(0.3, 0.02, z), zRot(-0.4));

  // Exhaust: header curling out of the cylinder, then up into the silencer.
  P.add(M.pipe, tube([V3(0.27, 0.0, 0.03), V3(0.36, -0.12, 0.1), V3(0.24, -0.28, 0.15), V3(0.0, -0.3, 0.16), V3(-0.22, -0.12, 0.15), V3(-0.38, 0.04, 0.14)], 0.026, 32));
  P.add(M.silencer, cyl(0.055, 0.05, 0.44, 18), V3(-0.58, 0.12, 0.14), zRot(Math.PI / 2 - 0.32));
  P.add(M.alu, cyl(0.056, 0.056, 0.03, 18), V3(-0.79, 0.19, 0.14), zRot(Math.PI / 2 - 0.32));

  // Tank and radiator shrouds.
  P.add(plastic, rounded([[0.0, 0.19], [0.4, 0.33], [0.44, 0.26], [0.34, 0.02], [0.18, -0.02], [0.08, 0.12]], 0.3, 0.025));
  P.add(accent, rounded([[0.2, 0.22], [0.4, 0.3], [0.42, 0.25], [0.34, 0.06], [0.24, 0.06]], 0.32, 0.012));
  // Seat: long and flat, MX style.
  P.add(M.seat, rounded([[0.18, 0.25], [-0.74, 0.26], [-0.76, 0.2], [-0.2, 0.17], [0.12, 0.17]], 0.22, 0.03));
  // Side panels and rear fender.
  P.add(plastic, rounded([[-0.2, 0.18], [-0.62, 0.21], [-0.55, 0.04], [-0.24, 0.0]], 0.26, 0.012));
  P.add(plastic, rounded([[-0.45, 0.21], [-1.02, 0.36], [-1.04, 0.33], [-0.5, 0.16]], 0.2, 0.01));
  // Front fender (bolted to the lower triple clamp) and number plate.
  P.add(plastic, rounded([[0.36, 0.2], [0.62, 0.22], [0.86, 0.14], [0.84, 0.11], [0.6, 0.17], [0.38, 0.15]], 0.15, 0.01));
  P.add(accent, rounded([[0.46, 0.33], [0.55, 0.52], [0.6, 0.5], [0.52, 0.3]], 0.26, 0.01));
  // Air box / fork guards hint.
  P.add(M.black, new THREE.BoxGeometry(0.2, 0.12, 0.18), V3(-0.25, 0.09, 0));

  // Triple clamps, bars, grips, levers.
  P.add(M.alu, new THREE.BoxGeometry(0.1, 0.03, 0.28), V3(0.42, 0.39, 0), zRot(-0.42));
  P.add(M.alu, new THREE.BoxGeometry(0.1, 0.03, 0.28), V3(0.48, 0.22, 0), zRot(-0.42));
  P.add(M.alu, cyl(0.016, 0.016, 0.06), V3(0.41, 0.42, 0.04));
  P.add(M.alu, cyl(0.016, 0.016, 0.06), V3(0.41, 0.42, -0.04));
  P.add(M.alu, tube([V3(0.43, 0.4, -0.38), V3(0.4, 0.44, -0.2), V3(0.41, 0.44, 0), V3(0.4, 0.44, 0.2), V3(0.43, 0.4, 0.38)], 0.012, 16));
  for (const z of [0.36, -0.36]) {
    P.add(M.black, cyl(0.02, 0.02, 0.11), V3(0.425, 0.405, z), xRot90);
    P.add(M.black, new THREE.BoxGeometry(0.12, 0.012, 0.012), V3(0.47, 0.41, z * 0.8), new THREE.Euler(0, z > 0 ? 0.4 : -0.4, 0));
  }
  // Footpegs.
  for (const z of [0.17, -0.17]) P.add(M.alu, new THREE.BoxGeometry(0.06, 0.02, 0.1), V3(-0.1, -0.37, z));

  const frame = P.build();
  root.add(frame);

  // Number plates (canvas textures).
  const numTex = numberTexture(scheme.num, '#' + new THREE.Color(scheme.accent).getHexString(), '#' + new THREE.Color(scheme.color).getHexString());
  const numMat = new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.5 });
  for (const z of [0.142, -0.142]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), numMat);
    p.position.set(-0.4, 0.1, z); p.rotation.z = 0.08;
    if (z < 0) p.rotation.y = Math.PI;
    root.add(p);
  }
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.15), numMat);
  front.position.set(0.555, 0.43, 0); front.rotation.set(0, Math.PI / 2, 0); front.rotateX(-0.45);
  root.add(front);

  // Moving parts.
  const forkUpper = [0.075, -0.075].map(z => { const m = new THREE.Mesh(cyl(0.028, 0.028, 0.42, 14), M.fork); m.castShadow = true; m.userData.z = z; root.add(m); return m; });
  const forkLower = [0.075, -0.075].map(z => { const m = new THREE.Mesh(cyl(0.024, 0.022, 0.44, 12), M.chrome); m.castShadow = true; m.userData.z = z; root.add(m); return m; });
  const swing = new THREE.Group();
  const SA = new Parts();
  for (const z of [0.085, -0.085]) SA.add(M.alu, new THREE.BoxGeometry(1, 0.06, 0.028), V3(0.5, 0, z));
  SA.add(M.alu, new THREE.BoxGeometry(0.06, 0.05, 0.2), V3(0.04, 0, 0));
  SA.add(M.black, new THREE.BoxGeometry(0.3, 0.05, 0.012), V3(0.55, 0.05, 0.1)); // chain guide
  swing.add(SA.build());
  root.add(swing);
  const shock = new THREE.Mesh(cyl(0.032, 0.032, 1, 12), accent); shock.castShadow = true;
  root.add(shock);
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 12), accent); // decorative ring
  root.add(spring);

  const rear = makeWheel(false), frontW = makeWheel(true);
  root.add(rear.holder, frontW.holder);

  return { root, frame, forkUpper, forkLower, swing, shock, spring, rear, front: frontW };
}

const tmpQ = new THREE.Quaternion(), up = V3(0, 1, 0), dir = V3(0, 0, 0);
function alignBetween(mesh, ax, ay, az, bx, by, bz, len) {
  dir.set(bx - ax, by - ay, bz - az);
  const l = dir.length();
  dir.divideScalar(l || 1);
  mesh.quaternion.setFromUnitVectors(up, dir);
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  if (len) mesh.scale.set(1, l / len, 1);
}

// Pose the bike from physics state (chassis-local wheel centres and spins).
export function poseBike(m, rearLocal, frontLocal, rearSpin, frontSpin) {
  m.rear.holder.position.set(rearLocal.x, rearLocal.y, 0);
  m.front.holder.position.set(frontLocal.x, frontLocal.y, 0);
  m.rear.spin.rotation.z = rearSpin;
  m.front.spin.rotation.z = frontSpin;
  // Forks: upper tubes fixed in the clamps, lower legs ride with the axle.
  const hx = 0.425, hy = 0.4;
  const dx = frontLocal.x - hx, dy = frontLocal.y - hy;
  const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  for (const f of m.forkUpper) alignBetween(f, hx, hy, f.userData.z, hx + ux * 0.42, hy + uy * 0.42, f.userData.z);
  for (const f of m.forkLower) alignBetween(f, frontLocal.x - ux * 0.44, frontLocal.y - uy * 0.44, f.userData.z, frontLocal.x, frontLocal.y, f.userData.z);
  // Swingarm from the pivot to the rear axle.
  const px = -0.15, py = -0.25;
  const sx = rearLocal.x - px, sy = rearLocal.y - py;
  const sl = Math.hypot(sx, sy);
  m.swing.position.set(px, py, 0);
  m.swing.rotation.z = Math.atan2(sy, sx);
  m.swing.scale.set(sl, 1, 1);
  // Shock from the frame to the swingarm link.
  const lx = px + sx * 0.35, ly = py + sy * 0.35 + 0.04;
  alignBetween(m.shock, -0.14, 0.14, 0, lx, ly, 0, 1);
  m.spring.position.set((-0.14 + lx) / 2, (0.14 + ly) / 2, 0);
  m.spring.rotation.set(Math.PI / 2, Math.atan2(ly - 0.14, lx + 0.14) - Math.PI / 2, 0);
}

// ---------- rider ----------
function stripeCapsule(r, len, c1, c2, bands) {
  const g = new THREE.CapsuleGeometry(r, len, 6, 14);
  const pos = g.attributes.position, col = [];
  const a = new THREE.Color(c1), b = new THREE.Color(c2);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + len / 2 + r) / (len + 2 * r);
    const on = bands.some(([lo, hi]) => t >= lo && t <= hi);
    const c = on ? b : a;
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function makeRiderModel(scheme) {
  const grp = new THREE.Group();
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const pantsM = std(scheme.pants, { roughness: 0.75 });
  const gloveM = std(scheme.jersey2, { roughness: 0.7 });
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; grp.add(m); return m; };

  const torso = mk(stripeCapsule(0.15, LIMB.torso - 0.22, scheme.jersey, scheme.jersey2, [[0.52, 0.64], [0.86, 1]]), vc);
  torso.scale.set(1, 1, 1.25);
  const hips = mk(new THREE.SphereGeometry(0.15, 14, 10), pantsM);
  hips.scale.set(1.05, 0.8, 1.45);
  const thigh = [0, 1].map(() => mk(new THREE.CapsuleGeometry(0.085, LIMB.thigh - 0.1, 4, 12), pantsM));
  const shin = [0, 1].map(() => mk(stripeCapsule(0.072, LIMB.shin - 0.12, 0xf2f2f2, scheme.jersey2, [[0.05, 0.22], [0.72, 0.8]]), vc));
  const boot = [0, 1].map(() => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.1), M.boot); b.position.set(0.05, 0.02, 0); b.castShadow = true;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.035, 0.11), M.sole); s.position.set(0.05, -0.04, 0);
    g.add(b, s); grp.add(g); return g;
  });
  const upper = [0, 1].map(() => mk(stripeCapsule(0.058, LIMB.upper - 0.08, scheme.jersey, scheme.jersey2, [[0.0, 0.18]]), vc));
  const fore = [0, 1].map(() => mk(stripeCapsule(0.05, LIMB.fore - 0.08, scheme.jersey, scheme.jersey2, [[0.0, 0.3]]), vc));
  const glove = [0, 1].map(() => mk(new THREE.SphereGeometry(0.055, 10, 8), gloveM));

  // Helmet: shell with stripe, chin bar, peak, goggles.
  const helmet = new THREE.Group();
  const shellG = new THREE.SphereGeometry(0.16, 20, 14);
  {
    const pos = shellG.attributes.position, col = [];
    const a = new THREE.Color(scheme.helmet), b = new THREE.Color(scheme.helmet2);
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i), y = pos.getY(i);
      const c = Math.abs(z) < 0.035 && y > -0.02 ? b : a;
      col.push(c.r, c.g, c.b);
    }
    shellG.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const shell = new THREE.Mesh(shellG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1 }));
  shell.scale.set(1.12, 1, 0.92); shell.castShadow = true;
  helmet.add(shell);
  const chin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10), std(scheme.helmet2, { roughness: 0.3 }));
  chin.rotation.set(Math.PI / 2, 0, 0); chin.scale.set(1, 1, 0.8); chin.position.set(0.13, -0.09, 0); chin.castShadow = true;
  helmet.add(chin);
  const peak = new THREE.Mesh(rounded([[0.06, 0.1], [0.28, 0.1], [0.26, 0.07], [0.08, 0.05]], 0.2, 0.01), std(scheme.helmet2, { roughness: 0.35 }));
  peak.rotation.z = 0.12; peak.castShadow = true;
  helmet.add(peak);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.018, 6, 28), std(scheme.jersey2, { roughness: 0.6 }));
  strap.rotation.set(0, Math.PI / 2, 0); strap.scale.set(0.92, 1, 1.12); strap.position.set(0.0, 0.02, 0);
  strap.rotation.set(0, Math.PI / 2, 0.15);
  helmet.add(strap);
  const goggle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.2), M.lens);
  goggle.position.set(0.165, 0.01, 0);
  helmet.add(goggle);
  const goggleFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.22), M.black);
  goggleFrame.position.set(0.15, 0.01, 0);
  helmet.add(goggleFrame);
  grp.add(helmet);

  return { group: grp, torso, hips, thigh, shin, boot, upper, fore, glove, helmet };
}

// Place the rider's parts from world-space joints. z0 is the lane depth.
// The two sides (near = 0, far = 1) get different depth offsets.
export function poseRider(r, j, z0, bodyAngle) {
  const Z = (k, side) => z0 + (side ? -k : k);
  const seg = (mesh, a, b, za, zb, len) => alignBetween(mesh, a.x, a.y, za, b.x, b.y, zb, len);
  seg(r.torso, j.hip, j.shoulder, z0, z0);
  r.hips.position.set(j.hip.x, j.hip.y, z0);
  r.hips.rotation.set(0, 0, bodyAngle);
  for (let s = 0; s < 2; s++) {
    seg(r.thigh[s], j.hip, j.knee, Z(0.11, s), Z(0.17, s));
    seg(r.shin[s], j.knee, j.foot, Z(0.17, s), Z(0.19, s));
    r.boot[s].position.set(j.foot.x, j.foot.y, Z(0.19, s));
    r.boot[s].rotation.set(0, 0, bodyAngle);
    seg(r.upper[s], j.shoulder, j.elbow, Z(0.17, s), Z(0.3, s));
    seg(r.fore[s], j.elbow, j.hand, Z(0.3, s), Z(0.34, s));
    r.glove[s].position.set(j.hand.x, j.hand.y, Z(0.34, s));
  }
  r.helmet.position.set(j.head.x, j.head.y, z0);
  r.helmet.rotation.set(0, 0, j.headAngle ?? bodyAngle);
}
