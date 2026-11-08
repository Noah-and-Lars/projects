// A 9×19 mm Parabellum round, made in code (lathe shapes) at its real size:
// the loaded cartridge, the fired bullet (with the barrel's rifling pressed
// into its jacket) and the spent case (open mouth, struck primer).
//
// Sizes (millimetres), from the C.I.P./SAAMI cartridge drawing as given on
// Wikipedia's "9×19mm Parabellum" page (checked 2026-11): bullet diameter
// 9.01, neck 9.65, base 9.93, rim 9.96, rim thickness 1.27, case length
// 19.15, overall length 29.69 (maximum). The extractor groove's diameter
// (8.79) and the small pistol primer's (4.45, 0.175 in) are the usual
// SAAMI figures. The bullet is a 124 grain round-nose FMJ (the load in
// ballistics.js): about 0.605 in (15.4 mm) long (the overall length given
// for Speer's 124 gr 9 mm round-nose TMJ bullet in retailers' listings,
// e.g. https://www.tractorsupply.com/tsc/product/speer-ammo-9mm-124-grain-total-metal-jacket-reloading-rifle-bullets-600-rounds-6113171;
// FMJ round noses of that weight are within a few hundredths of it), so
// seated to 29.69 mm it sits 19.15 + 15.40 - 29.69 = 4.86 mm deep in the
// case.
//
// Every shape here is built along +Z (base at z = 0, nose towards +Z) in
// metres, so it can be pointed anywhere with one quaternion.

import * as THREE from 'three';

export const ROUND = {
  bullet: { diameter: 0.00901, length: 0.0154 },
  case: { length: 0.01915, base: 0.00993, mouth: 0.00965, rim: 0.00996, rimThick: 0.00127, groove: 0.00879, wall: 0.0005 },
  primer: 0.00445,
  overall: 0.02969,
};
ROUND.seat = ROUND.case.length + ROUND.bullet.length - ROUND.overall; // how deep the bullet sits in the case

const mm = (v) => v / 1000;

// The bullet's outline from its base (z = 0) to its tip, [radius, z] in
// metres: a short bevel at the base, the straight bearing surface the
// rifling grips, then the round nose to its blunt tip.
// With `open`, the base is left open inside the jacket's folded rim (the
// lead base, baseDisc, fills it).
function bulletOutline(segments = 32, open = false) {
  const R = ROUND.bullet.diameter / 2;
  const L = ROUND.bullet.length;
  const pts = [[open ? R - mm(0.55) : 0, 0], [R - mm(0.35), 0], [R, mm(0.35)], [R, mm(7.0)]];
  // The round nose: from the end of the bearing surface (tangent to it)
  // to the tip, a curve between an ellipse and a cone (a superellipse,
  // power 1.8), which rounds off smoothly at the tip.
  const z0 = mm(7.0);
  const Ln = L - z0;
  const p = 1.8;
  for (let i = 1; i <= segments; i++) {
    const u = Math.sin((i / segments) * (Math.PI / 2));
    pts.push([i === segments ? 0 : R * (1 - u ** p) ** (1 / p), z0 + Ln * u]);
  }
  return pts;
}

// The case's outline, base to mouth, outside then back down inside; with
// `open`, the mouth is open (a spent case), else the inside isn't modelled.
function caseOutline(open) {
  const C = ROUND.case;
  const rimR = C.rim / 2, baseR = C.base / 2, mouthR = C.mouth / 2, grooveR = C.groove / 2;
  const L = C.length;
  const pts = [
    [ROUND.primer / 2 + mm(0.25), 0], // the base around the primer pocket
    [rimR - mm(0.3), 0],
    [rimR, mm(0.3)], // the rim's chamfered edge
    [rimR, C.rimThick],
    [grooveR, C.rimThick + mm(0.35)], // the extractor groove: a bevel down...
    [grooveR, C.rimThick + mm(0.85)],
    [baseR, C.rimThick + mm(1.55)], // ...and the 45° bevel back up to the body
    [baseR - mm(0.02), mm(4.5)],
    [mouthR, L - mm(0.15)], // the body tapers to the mouth
    [mouthR - mm(0.1), L],
  ];
  if (open) {
    const inR = mouthR - C.wall;
    pts.push([inR, L], [inR + mm(0.02), L - mm(0.6)], [baseR - mm(0.9), mm(5.5)], [baseR - mm(1.3), mm(3.4)], [mm(1.3), mm(3.2)], [0, mm(3.2)]);
  }
  return pts;
}

function lathe(pts, segments = 64) {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  // (A lathe turns about Y: turned so its axis is +Z.)
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

// The fired bullet: the rifling has pressed the barrel's lands into its
// bearing surface. The PF-9's barrel has polygonal rifling (as its
// breakdown says): six soft flats twisting one turn in 250 mm, which leave
// smooth, shallow facets rather than sharp grooves. They're modelled as a
// small dip in the radius, twisted the way the rifling turns (right hand).
function firedBulletGeometry() {
  const outline = bulletOutline(32, true);
  const radial = 128;
  const positions = [], uvs = [];
  const twist = 0.254; // metres a turn (ballistics.js)
  const lands = 6;
  const depth = mm(0.09);
  const bearingTop = mm(7.2);
  for (let i = 0; i < outline.length; i++) {
    const [r, z] = outline[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      let rr = r;
      if (z > mm(0.2) && z < bearingTop) {
        const fade = Math.min(1, (z - mm(0.2)) / mm(0.4)) * Math.min(1, (bearingTop - z) / mm(1.2));
        const phase = lands * (a - (2 * Math.PI * z) / twist);
        rr -= depth * fade * (0.5 + 0.5 * Math.cos(phase)) ** 3;
      }
      positions.push(Math.cos(a) * rr, Math.sin(a) * rr, z);
      // (Round it, and along it in millimetres, for the striations.)
      uvs.push(j / radial, z / ROUND.bullet.length);
    }
  }
  // (A seam where the texture wraps; its normals are matched below, so
  // it's smooth.)
  const index = [];
  const row = radial + 1;
  for (let i = 0; i < outline.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, a1 = a + 1;
      const b = a + row, b1 = a1 + row;
      index.push(a, a1, b, a1, b1, b); // (counter-clockwise from outside)
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < outline.length; i++) {
    const s0 = i * row, s1 = s0 + radial;
    const x = n.getX(s0) + n.getX(s1), y = n.getY(s0) + n.getY(s1), z = n.getZ(s0) + n.getZ(s1);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(s0, x / l, y / l, z / l);
    n.setXYZ(s1, x / l, y / l, z / l);
  }
  return g;
}

// The rifling's fine striations on the fired bullet's bearing surface:
// scratches running along the twist (bump), and the engraved band a touch
// duller (roughness). u: round the bullet, v: along it (0 base, 1 tip).
function engravingMaps() {
  const W = 1024, H = 256;
  const rng = (() => { let a = 1234567; return () => ((a = (a * 1103515245 + 12345) >>> 0) / 4294967296); })();
  const top = 7.2 / 15.4; // the bearing surface's end (v)
  const slant = ((2 * Math.PI * 0.0154) / 0.254 / (2 * Math.PI)) * W; // pixels round per bullet length
  const draw = (g, bump) => {
    g.fillStyle = bump ? '#808080' : '#5a5a5a';
    g.fillRect(0, 0, W, H);
    // (Canvas y runs down: v = 1 - y / H.)
    const y0 = H * (1 - top);
    for (let k = 0; k < 900; k++) {
      const x = rng() * W;
      const shade = bump ? (rng() < 0.5 ? 70 : 190) : 110 + rng() * 60;
      g.strokeStyle = `rgba(${shade},${shade},${shade},${0.25 + rng() * 0.5})`;
      g.lineWidth = 0.5 + rng() * 1.5;
      g.beginPath();
      for (const dx of [0, W, -W]) {
        g.moveTo(x + dx, H);
        g.lineTo(x + dx + slant * top, y0 + rng() * 6);
      }
      g.stroke();
    }
    if (!bump) {
      // The nose, never touched by the barrel: smoother.
      g.fillStyle = '#4a4a4a';
      g.fillRect(0, 0, W, y0 - 4);
    }
  };
  const make = (bump) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    draw(c.getContext('2d'), bump);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { bump: make(true), rough: make(false) };
}

// The materials: a copper-alloy (gilding metal) jacket, the bare lead of
// the base, cartridge brass and the nickel-coloured primer cup.
export function roundMaterials(envMap = null) {
  const m = (o) => Object.assign(new THREE.MeshPhysicalMaterial(o), envMap ? { envMap } : {});
  return {
    jacket: m({ color: new THREE.Color(0.93, 0.5, 0.29), metalness: 1, roughness: 0.2 }),
    lead: m({ color: new THREE.Color(0.13, 0.135, 0.14), metalness: 0.35, roughness: 0.75, side: THREE.DoubleSide }),
    brass: m({ color: new THREE.Color(0.95, 0.74, 0.34), metalness: 1, roughness: 0.24 }),
    primer: m({ color: new THREE.Color(0.78, 0.76, 0.72), metalness: 1, roughness: 0.32 }),
  };
}

// A bullet's lead base, seen from behind: most FMJ pistol bullets leave
// the base open, so the lead core shows there.
function baseDisc() {
  // (A shallow dome of lead, meeting the jacket's rim.)
  const r = ROUND.bullet.diameter / 2 - mm(0.55);
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    pts.push([r * Math.sin((k * Math.PI) / 2), mm(0.12) * Math.cos((k * Math.PI) / 2)]);
  }
  const g = lathe(pts, 48);
  // (Its outside faces backwards, -Z.)
  return g;
}

// The primer: a cup set flush in the base; `struck` gives it the striker's
// dent (the PF-9 is striker fired, which leaves a small oblong dent).
function primerGeometry(struck) {
  const r = ROUND.primer / 2;
  const pts = [[0, struck ? mm(0.25) : mm(0.02)]];
  if (struck) pts.push([mm(0.35), mm(0.24)], [mm(0.75), mm(0.08)]);
  pts.push([r - mm(0.15), 0], [r, mm(0.08)], [r, mm(0.6)]);
  const g = lathe(pts.map(([rr, z]) => [rr, -z + mm(0.02)]), 32);
  if (struck) g.scale(1, 1.35, 1); // (oblong)
  return g;
}

function group(name, parts) {
  const g = new THREE.Group();
  g.name = name;
  for (const p of parts) {
    p.castShadow = true;
    p.receiveShadow = true;
    g.add(p);
  }
  return g;
}

// A loaded round, base at the origin, nose along +Z.
export function makeCartridge(mat) {
  const bullet = new THREE.Mesh(lathe(bulletOutline()), mat.jacket);
  bullet.position.z = ROUND.case.length - ROUND.seat;
  const shell = new THREE.Mesh(lathe(caseOutline(false)), mat.brass);
  const primer = new THREE.Mesh(primerGeometry(false), mat.primer);
  return group('cartridge', [shell, bullet, primer]);
}

// The fired bullet, base at the origin, nose along +Z.
export function makeFiredBullet(mat) {
  if (!mat.engraved) {
    const maps = engravingMaps();
    mat.engraved = mat.jacket.clone();
    Object.assign(mat.engraved, { bumpMap: maps.bump, bumpScale: 0.6, roughnessMap: maps.rough, roughness: 0.38 });
  }
  const body = new THREE.Mesh(firedBulletGeometry(), mat.engraved);
  const base = new THREE.Mesh(baseDisc(), mat.lead);
  const g = group('bullet', [body, base]);
  // (Too small for the wide shots' shadows to land on cleanly.)
  for (const m of g.children) m.receiveShadow = false;
  return g;
}

// The spent case, base at the origin, mouth along +Z: open (its inside
// wall down to the web) and the struck primer.
export function makeSpentCase(mat) {
  const shell = new THREE.Mesh(lathe(caseOutline(true)), mat.brass);
  const primer = new THREE.Mesh(primerGeometry(true), mat.primer);
  return group('case', [shell, primer]);
}
