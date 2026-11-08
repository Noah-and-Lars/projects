// A 9×19 mm Parabellum round, made in code (lathe shapes) at its real size:
// the loaded cartridge, the fired bullet (with the barrel's rifling pressed
// into its jacket) and the spent case (open mouth, struck primer).
//
// Sizes (millimetres), from the C.I.P./SAAMI cartridge drawing as given on
// Wikipedia's "9×19mm Parabellum" page (checked 2026-11): bullet diameter
// 9.01, neck 9.65, base 9.93, rim 9.96, rim thickness 1.27, case length
// 19.15, overall length 29.69 (maximum). The extractor groove's diameter
// (8.79) and the small pistol primer's (4.45, 0.175 in) are the usual
// SAAMI figures. The bullet is a 115 grain round-nose FMJ: about 0.55 in
// (14 mm) long (Hornady's and Berry's listings for their 115 gr .355 in
// round-nose bullets give 0.549 and 0.553 in), so seated to 29.69 mm it
// sits 3.5 mm deep in the case.
//
// Every shape here is built along +Z (base at z = 0, nose towards +Z) in
// metres, so it can be pointed anywhere with one quaternion.

import * as THREE from 'three';

export const ROUND = {
  bullet: { diameter: 0.00901, length: 0.0140 },
  case: { length: 0.01915, base: 0.00993, mouth: 0.00965, rim: 0.00996, rimThick: 0.00127, groove: 0.00879, wall: 0.0005 },
  primer: 0.00445,
  overall: 0.02969,
};
ROUND.seat = ROUND.case.length + ROUND.bullet.length - ROUND.overall; // how deep the bullet sits in the case

const mm = (v) => v / 1000;

// The bullet's outline from its base (z = 0) to its tip, [radius, z] in
// metres: a short bevel at the base, the straight bearing surface the
// rifling grips, then a round-nose ogive to a small rounded tip.
function bulletOutline(segments = 24) {
  const R = ROUND.bullet.diameter / 2;
  const L = ROUND.bullet.length;
  const pts = [[0, 0], [R - mm(0.35), 0], [R, mm(0.35)], [R, mm(6.2)]];
  // The ogive: a circular arc from the end of the bearing surface (tangent
  // to it) to the tip, whose rounding radius is about 0.9 of the calibre's.
  const z0 = mm(6.2);
  const tipR = mm(1.15); // the small blunt tip
  for (let i = 1; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2);
    // An eased radius: full at the start, the blunt tip at the end.
    const r = tipR + (R - tipR) * Math.cos(a) ** 0.85;
    const z = z0 + (L - z0 - mm(0.25)) * Math.sin(a);
    pts.push([r, z]);
  }
  // The tip's small dome.
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([tipR * Math.cos(a), L - mm(0.25) + mm(0.25) * Math.sin(a)]);
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
  const outline = bulletOutline();
  const radial = 96;
  const positions = [];
  const twist = 0.25; // metres a turn
  const lands = 6;
  const depth = mm(0.045);
  const bearingTop = mm(6.4);
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
    }
  }
  const index = [];
  for (let i = 0; i < outline.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// The materials: a copper-alloy (gilding metal) jacket, the bare lead of
// the base, cartridge brass and the nickel-coloured primer cup.
export function roundMaterials(envMap = null) {
  const m = (o) => Object.assign(new THREE.MeshPhysicalMaterial(o), envMap ? { envMap } : {});
  return {
    jacket: m({ color: new THREE.Color(0.86, 0.47, 0.30), metalness: 1, roughness: 0.22, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
    lead: m({ color: new THREE.Color(0.34, 0.35, 0.37), metalness: 0.7, roughness: 0.55 }),
    brass: m({ color: new THREE.Color(0.93, 0.72, 0.36), metalness: 1, roughness: 0.2 }),
    primer: m({ color: new THREE.Color(0.78, 0.76, 0.72), metalness: 1, roughness: 0.32 }),
  };
}

// A bullet's lead base, seen from behind: most FMJ pistol bullets leave
// the base open, so the lead core shows there.
function baseDisc() {
  const g = new THREE.CircleGeometry(ROUND.bullet.diameter / 2 - mm(0.5), 32);
  g.rotateX(Math.PI); // facing -Z (backwards)
  g.translate(0, 0, mm(0.01));
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
  const body = new THREE.Mesh(firedBulletGeometry(), mat.jacket);
  const base = new THREE.Mesh(baseDisc(), mat.lead);
  return group('bullet', [body, base]);
}

// The spent case, base at the origin, mouth along +Z: open (its inside
// wall down to the web) and the struck primer.
export function makeSpentCase(mat) {
  const shell = new THREE.Mesh(lathe(caseOutline(true)), mat.brass);
  const primer = new THREE.Mesh(primerGeometry(true), mat.primer);
  return group('case', [shell, primer]);
}
