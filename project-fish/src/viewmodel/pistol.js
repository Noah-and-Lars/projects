// A modern polymer-frame 9 mm pistol, built to real dimensions (about 19 cm
// long and 14 cm tall).
//
// Gun space: metres, +X right, +Y up, -Z forward. The bore runs along Z at
// y = 0; the muzzle is at z = -0.152, the back of the slide at z = +0.032.
// Most parts are side profiles traced in (s, y), where s = -z is the distance
// forward, and pushed out sideways to their thickness.

import * as THREE from 'three';

// Where the grip is, for posing the hands around it (gun space).
export const GRIP = {
  top: new THREE.Vector3(0, -0.058, 0.004), // centre of the grip just under the trigger guard
  down: new THREE.Vector3(0, -0.062, 0.022).normalize(), // along the grip, towards the magazine
  // A slice across the grip is a rounded rectangle (the grip shell made in Blender):
  halfWidth: 0.0153, // side to side
  halfDepth: 0.0275, // front strap to back strap
  cornerRadius: 0.0055,
};
GRIP.front = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), GRIP.down).normalize();

// The magazine, seated (gun space). Its body runs along the grip, a little in
// front of the grip's centre line, and a slice across it is a rounded
// rectangle. Distances along the grip (u) are from GRIP.top along GRIP.down;
// the grip ends, and the magazine well opens, at GRIP.bottom. The Blender
// magazine (build_pistol.py) matches.
export const MAGAZINE = {
  forward: 0.0063, // its centre line is this far in front of the grip's, along GRIP.front
  halfWidth: 0.011,
  halfDepth: 0.0146,
  cornerRadius: 0.003,
  top: -0.0404, // u of the top of the body (the feed lips)
  bottom: 0.0673, // u of the bottom of the body, where the baseplate starts
  base: 0.0752, // u of the bottom of the baseplate
  baseHalfWidth: 0.0148, // the baseplate is wider and longer than the body
  baseHalfDepth: 0.0296, // (with the lip at the front)
};
GRIP.bottom = 0.0678;

// The slide (gun space, slide forward): a box in front of the frame, from its
// back face to the muzzle, and the front serrations near the muzzle that a
// hand takes hold of to ease it back. The Blender pistol matches.
export const SLIDE = {
  halfWidth: 0.01225,
  top: 0.0165,
  bottom: -0.0105,
  front: -0.152, // the muzzle end (z)
  back: 0.032,
  frontSerrations: [-0.128, -0.106], // z, front to back
};

// The iron sights (gun space). Looking down the sights, the three dots line up
// at this height: the two on the back of the rear sight and the one on the
// back of the front sight. The Blender pistol (build_pistol.py) matches.
export const SIGHTS = {
  height: 0.01975, // of the dots above the bore
  rearZ: 0.0248, // back face of the rear sight
  frontZ: -0.1376, // back face of the front sight
};

const SLIDE_PROFILE = [
  [-0.032, -0.0105], [0.152, -0.0105], [0.152, 0.009], [0.146, 0.0165], [-0.03, 0.0165], [-0.032, 0.012],
];

// A polygon with its corners rounded off: each point is [s, y, radius]. Works
// for corners that point in as well as out.
export function filleted(points) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [px, py, radius] = points[i];
    const [ax, ay] = points[(i + n - 1) % n];
    const [bx, by] = points[(i + 1) % n];
    if (!radius) {
      out.push([px, py]);
      continue;
    }
    const la = Math.hypot(ax - px, ay - py);
    const lb = Math.hypot(bx - px, by - py);
    const u1 = [(ax - px) / la, (ay - py) / la];
    const u2 = [(bx - px) / lb, (by - py) / lb];
    const half = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))) / 2;
    if (half < 1e-3 || half > Math.PI / 2 - 1e-3) {
      out.push([px, py]);
      continue;
    }
    // How far back along each side the curve starts, kept within the sides.
    const d = Math.min(radius / Math.tan(half), 0.45 * la, 0.45 * lb);
    const r = d * Math.tan(half);
    const bis = [u1[0] + u2[0], u1[1] + u2[1]];
    const lbis = Math.hypot(bis[0], bis[1]);
    const cx = px + (bis[0] / lbis) * (r / Math.sin(half));
    const cy = py + (bis[1] / lbis) * (r / Math.sin(half));
    const t1 = [px + u1[0] * d, py + u1[1] * d];
    const t2 = [px + u2[0] * d, py + u2[1] * d];
    let a1 = Math.atan2(t1[1] - cy, t1[0] - cx);
    let a2 = Math.atan2(t2[1] - cy, t2[0] - cx);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
    for (let k = 0; k <= steps; k++) {
      const t = a1 + (sweep * k) / steps;
      out.push([+(cx + r * Math.cos(t)).toFixed(6), +(cy + r * Math.sin(t)).toFixed(6)]);
    }
  }
  return out;
}

// The frame, with smooth curves: dust cover, trigger guard (squared off at the
// front, its bottom curving up into the front strap under a small undercut),
// the front strap, and the beavertail sweeping back over the web of the hand.
// Its top sits 0.4 mm under the slide, so a dark line shows between them.
const FRAME_PROFILE = filleted([
  [-0.024, -0.0109, 0], [0.137, -0.0109, 0.0012], [0.137, -0.027, 0.0018], [0.088, -0.027, 0.0022],
  [0.0855, -0.0635, 0.0068], [0.04, -0.0702, 0.004], [0.0305, -0.0668, 0.003], [0.026, -0.058, 0.0035],
  [0.02, -0.075, 0.012], [0.011, -0.1, 0.02], [0.0035, -0.1215, 0.003], [0.002, -0.124, 0.0012],
  [-0.046, -0.124, 0.0018], [-0.05, -0.118, 0.004], [-0.034, -0.058, 0.012], [-0.031, -0.042, 0.007],
  [-0.04, -0.03, 0.009], [-0.0455, -0.0235, 0.005], [-0.041, -0.0175, 0.006], [-0.03, -0.0155, 0.004],
]);

const TRIGGER_GUARD_HOLE = filleted([
  [0.083, -0.031, 0.0015], [0.0815, -0.0605, 0.0052], [0.042, -0.0657, 0.0042], [0.0332, -0.0605, 0.0045],
  [0.0292, -0.05, 0.006], [0.028, -0.031, 0.0015],
]);

const GRIP_PANEL = [
  [0.021, -0.064], [0.009, -0.1], [0.003, -0.116], [-0.044, -0.116], [-0.047, -0.111],
  [-0.032, -0.054], [-0.027, -0.045], [0.011, -0.045], [0.019, -0.055],
];

const TRIGGER_PROFILE = [
  [0.05, -0.031], [0.056, -0.031], [0.059, -0.04], [0.058, -0.052], [0.054, -0.06], [0.05, -0.0595], [0.0525, -0.05], [0.0525, -0.04],
];

// The magazine baseplate, with a lip sticking out at the front to pull it by.
const MAG_BASE = [[0.007, -0.1235], [0.0075, -0.1262], [0.0112, -0.1272], [0.0112, -0.131], [-0.051, -0.131], [-0.05, -0.1235]];

// The side profiles and their thicknesses (metres), shared with the Blender
// pistol (tools/blender/build_pistol.py) so both have exactly the same shape.
export const PROFILES = {
  slide: { points: SLIDE_PROFILE, width: 0.0245 },
  frame: { points: FRAME_PROFILE, width: 0.0235, holes: [TRIGGER_GUARD_HOLE] },
  grip: { points: GRIP_PANEL, width: 0.0305 },
  trigger: { points: TRIGGER_PROFILE, width: 0.0065 },
  magazine: { points: MAG_BASE, width: 0.0295 },
};

// Pushes a side profile out to `width` (centred on x = 0) with rounded edges.
export function profile(points, width, bevel, holes = []) {
  const shape = new THREE.Shape(points.map(([s, y]) => new THREE.Vector2(s, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([s, y]) => new THREE.Vector2(s, y))));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  geometry.rotateY(Math.PI / 2); // s → -z, sideways → x
  geometry.computeVertexNormals();
  return geometry;
}

// Profiles are textured in their own (s, y) coordinates, in metres; this maps
// a texture over the box [s0, s1] × [y0, y1].
function fitTexture(texture, s0, s1, y0, y1) {
  texture.repeat.set(1 / (s1 - s0), 1 / (y1 - y0));
  texture.offset.set(-s0 / (s1 - s0), -y0 / (y1 - y0));
  return texture;
}

// Normal map for the slide: angled cocking serrations at the back.
function serrationTexture() {
  const W = 1024, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, W, H);
  // Texture covers s ∈ [-0.04, 0.16], y ∈ [-0.015, 0.02]; serrations at s ∈ [-0.027, -0.006], y ∈ [-0.007, 0.012].
  const px = (s) => ((s + 0.04) / 0.2) * W;
  const py = (y) => H - ((y + 0.015) / 0.035) * H;
  for (let i = 0; i < 8; i++) {
    const s = -0.026 + i * 0.0027;
    const x = px(s);
    const halfWidth = (0.0009 / 0.2) * W;
    // Each groove is a V: one side faces back, the other forward.
    g.fillStyle = 'rgb(60,128,215)';
    g.beginPath();
    g.moveTo(x - halfWidth, py(0.012));
    g.lineTo(x, py(0.012));
    g.lineTo(x - 2, py(-0.007));
    g.lineTo(x - halfWidth - 2, py(-0.007));
    g.fill();
    g.fillStyle = 'rgb(196,128,215)';
    g.beginPath();
    g.moveTo(x, py(0.012));
    g.lineTo(x + halfWidth, py(0.012));
    g.lineTo(x + halfWidth - 2, py(-0.007));
    g.lineTo(x - 2, py(-0.007));
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return fitTexture(texture, -0.04, 0.16, -0.015, 0.02);
}

// Normal map for the grip: fine stippling.
function stippleTexture() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    const x = random() * S;
    const y = random() * S;
    const r = 1.2 + random() * 1.6;
    // A small bump: lit from one side, dark on the other.
    const grad = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
    grad.addColorStop(0, 'rgb(90,166,240)');
    grad.addColorStop(1, 'rgb(166,90,240)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.repeat.set(1 / 0.03, 1 / 0.03); // one tile every 3 cm
  return texture;
}

export function createPistol() {
  const pistol = new THREE.Group();
  pistol.name = 'pistol';

  const slideMetal = new THREE.MeshStandardMaterial({
    color: 0x2b2d30, metalness: 0.85, roughness: 0.36,
    normalMap: serrationTexture(), normalScale: new THREE.Vector2(1.2, 1.2),
  });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x1d1e20, metalness: 0, roughness: 0.62 });
  const gripPolymer = new THREE.MeshStandardMaterial({
    color: 0x1b1c1e, metalness: 0, roughness: 0.85,
    normalMap: stippleTexture(), normalScale: new THREE.Vector2(0.9, 0.9),
  });
  const barrelSteel = new THREE.MeshStandardMaterial({ color: 0x55524c, metalness: 0.9, roughness: 0.28 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.7, roughness: 0.45 });
  const bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const sightDot = new THREE.MeshBasicMaterial({ color: 0xf4f4ec });

  const part = (geometry, material, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    if (name) mesh.name = name;
    return mesh;
  };

  // The slide moves back when firing, so it gets its own group.
  const slide = new THREE.Group();
  slide.name = 'slide';
  slide.add(part(profile(SLIDE_PROFILE, 0.0245, 0.0012), slideMetal));

  // Ejection port on top, with the barrel hood showing through it.
  const port = part(new THREE.BoxGeometry(0.0145, 0.0008, 0.04), bore);
  port.position.set(0.0015, 0.0167, -0.024);
  const hood = part(new THREE.BoxGeometry(0.0115, 0.001, 0.034), barrelSteel);
  hood.position.set(0.0015, 0.0169, -0.026);
  slide.add(port, hood);

  // Muzzle: barrel crown and bore.
  const crown = part(new THREE.CylinderGeometry(0.0068, 0.0068, 0.002, 24), barrelSteel);
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, 0, -0.1525);
  const hole = part(new THREE.CircleGeometry(0.0046, 20), bore);
  hole.position.set(0, 0, -0.1537);
  hole.rotation.y = Math.PI;
  slide.add(crown, hole);

  // Sights: a front post with one dot and a rear notch with two, all facing the shooter.
  const front = part(new THREE.BoxGeometry(0.0034, 0.0052, 0.006), darkSteel);
  front.position.set(0, 0.0165 + 0.0026, -0.141);
  const frontDot = part(new THREE.CircleGeometry(0.0011, 16), sightDot);
  frontDot.position.set(0, 0.0165 + 0.0034, -0.1379);
  slide.add(front, frontDot);
  for (const side of [-1, 1]) {
    const ear = part(new THREE.BoxGeometry(0.0062, 0.0058, 0.0075), darkSteel);
    ear.position.set(side * 0.005, 0.0165 + 0.0029, 0.021);
    const dot = part(new THREE.CircleGeometry(0.001, 16), sightDot);
    dot.position.set(side * 0.005, 0.0165 + 0.003, 0.0249);
    slide.add(ear, dot);
  }
  const rearBase = part(new THREE.BoxGeometry(0.016, 0.0018, 0.0075), darkSteel);
  rearBase.position.set(0, 0.0165 + 0.0009, 0.021);
  slide.add(rearBase);
  pistol.add(slide);

  // Frame, grip panels, trigger and magazine base.
  pistol.add(part(profile(FRAME_PROFILE, 0.0235, 0.0012, [TRIGGER_GUARD_HOLE]), polymer, 'frame'));
  pistol.add(part(profile(GRIP_PANEL, 0.0305, 0.0015), gripPolymer, 'grip'));
  pistol.add(part(profile(TRIGGER_PROFILE, 0.0065, 0.0008), polymer, 'trigger'));
  pistol.add(part(profile(MAG_BASE, 0.0295, 0.0012), polymer, 'magazine'));

  // Small controls on the frame: slide stop, takedown lever, magazine release.
  const slideStop = part(new THREE.BoxGeometry(0.0022, 0.004, 0.018), polymer);
  slideStop.position.set(-0.0125, -0.0145, -0.005);
  const takedownLeft = part(new THREE.BoxGeometry(0.0016, 0.0035, 0.009), darkSteel);
  takedownLeft.position.set(-0.0122, -0.016, -0.047);
  const takedownRight = takedownLeft.clone();
  takedownRight.position.x = 0.0122;
  const magRelease = part(new THREE.BoxGeometry(0.0026, 0.0075, 0.0055), polymer);
  magRelease.position.set(-0.0125, -0.04, -0.023);
  pistol.add(slideStop, takedownLeft, takedownRight, magRelease);

  return pistol;
}
