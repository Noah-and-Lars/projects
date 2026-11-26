// Procedural bikes and rider. Everything is built from primitives at load
// time; nothing is loaded from files.
//
// Bike local space: +Z forward, +Y up, origin on the ground midway between
// the tyre contact patches.

import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function mat(color, rough = 0.6, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
const capGeo = new THREE.CapsuleGeometry(1, 1, 4, 10);
const sphGeo = new THREE.SphereGeometry(1, 16, 12);

// A tube between two points.
function tube(a, b, r, material, geo = cylGeo) {
  const m = new THREE.Mesh(geo, material);
  placeBetween(m, a, b, r);
  m.castShadow = true;
  return m;
}
const _d = new THREE.Vector3(), _q = new THREE.Quaternion();
export function placeBetween(m, a, b, r, capsule = false) {
  _d.subVectors(b, a);
  const len = _d.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  if (len > 1e-6) m.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
  if (capsule) m.scale.set(r, Math.max(0.001, (len - 2 * r) / 1), r);
  else m.scale.set(r, len, r);
}

const clamp01 = (x) => Math.max(-0.4, Math.min(1, x));

function wheel(R, tyreW, mats, spokes = 28) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - tyreW, tyreW, 8, 36), mats.tyre);
  tyre.rotation.y = Math.PI / 2;
  tyre.castShadow = true;
  g.add(tyre);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - tyreW * 2.05, tyreW * 0.42, 6, 36), mats.rim);
  rim.rotation.y = Math.PI / 2;
  g.add(rim);
  // Knobs: a ring of little boxes for a dirt-tyre silhouette.
  const knob = new THREE.BoxGeometry(tyreW * 1.6, 0.018, 0.022);
  const knobs = new THREE.InstancedMesh(knob, mats.tyre, 44);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(1, 1, 1);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    q.setFromAxisAngle(V(1, 0, 0), a);
    m4.compose(V(0, Math.cos(a) * (R - 0.004), Math.sin(a) * (R - 0.004)), q, s);
    knobs.setMatrixAt(i, m4);
  }
  g.add(knobs);
  // Spokes.
  const pts = [];
  const rr = R - tyreW * 2.2;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const side = i % 2 ? 0.03 : -0.03;
    const off = (i % 4 < 2 ? 1 : -1) * 0.35;
    pts.push(side, Math.cos(a + off) * 0.03, Math.sin(a + off) * 0.03);
    pts.push(0, Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x9aa0a6 })));
  const hub = new THREE.Mesh(cylGeo, mats.metal);
  hub.rotation.z = Math.PI / 2; hub.scale.set(0.028, 0.1, 0.028);
  g.add(hub);
  const rotor = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.006, 4, 24), mats.metal);
  rotor.rotation.y = Math.PI / 2; rotor.position.x = -0.05;
  g.add(rotor);
  return g;
}

export const BIKE_GEOM = {
  trail: { R: 0.37, tyre: 0.034, head: 65, fork: 0.56, bbDrop: 0.03, seatH: 0.5, fs: true, dual: false },
  dj: { R: 0.33, tyre: 0.032, head: 69, fork: 0.5, bbDrop: -0.01, seatH: 0.18, fs: false, dual: false },
  enduro: { R: 0.37, tyre: 0.036, head: 63.5, fork: 0.6, bbDrop: 0.02, seatH: 0.46, fs: true, dual: false },
  dh: { R: 0.37, tyre: 0.04, head: 62.5, fork: 0.66, bbDrop: 0.0, seatH: 0.3, fs: true, dual: true },
};

/**
 * Build a bike. Returns { root, body, steer, frontWheel, rearWheel, cranks,
 * grips(): [L, R] local, pedals(): [L, R] local, update(dt, sim) }.
 */
export function buildBike(id, wb, colorHex) {
  const G = BIKE_GEOM[id] || BIKE_GEOM.trail;
  const R = G.R;
  const frameMat = mat(colorHex, 0.38, 0.35);
  const mats = {
    frame: frameMat,
    dark: mat(0x1d1f23, 0.55, 0.3),
    metal: mat(0xb9bec4, 0.3, 0.85),
    tyre: mat(0x17181a, 0.95, 0),
    rim: mat(0x2a2c30, 0.4, 0.6),
    stanchion: mat(colorHex === '#f2c230' ? 0xd8a43a : 0xc9a035, 0.25, 0.8),
    seat: mat(0x101012, 0.8, 0),
    grip: mat(0x161616, 0.9, 0),
  };

  const root = new THREE.Group();       // positioned/rotated by the game
  const whipPivot = new THREE.Group();  // whip twist + lay happens here
  const body = new THREE.Group();       // the bike itself
  root.add(whipPivot);
  whipPivot.add(body);
  const pivot = V(0, 0.95, wb * 0.18);
  whipPivot.position.copy(pivot);
  body.position.copy(pivot).multiplyScalar(-1);

  const rA = V(0, R, -wb / 2), fA = V(0, R, wb / 2);
  const ha = G.head * Math.PI / 180;
  const steerDir = V(0, Math.sin(ha), -Math.cos(ha));
  const crown = fA.clone().addScaledVector(steerDir, G.fork);
  const htTop = crown.clone().addScaledVector(steerDir, G.dual ? 0.13 : 0.14);
  const bb = V(0, R - G.bbDrop, -wb / 2 + (id === 'dj' ? 0.39 : 0.44));
  const seatDir = V(0, Math.sin(74 * Math.PI / 180), -Math.cos(74 * Math.PI / 180));
  const stTop = bb.clone().addScaledVector(seatDir, id === 'dj' ? 0.36 : 0.44);

  // Frame.
  const f = mats.frame;
  body.add(tube(htTop, crown, 0.024, f));                      // head tube
  body.add(tube(htTop.clone().add(V(0, -0.02, 0)), stTop, 0.022, f)); // top tube
  body.add(tube(crown.clone().add(V(0, 0.03, 0)), bb, 0.03, f));      // down tube
  body.add(tube(bb, stTop.clone().addScaledVector(seatDir, 0.02), 0.022, f)); // seat tube
  const sL = V(0.06, 0, 0), sR = V(-0.06, 0, 0);
  // Rear end. The swingarm (stays + rear wheel) pivots so the suspension
  // can be seen working; hardtails keep it fixed.
  const piv = G.fs ? bb.clone().add(V(0, 0.1, -0.03)) : bb.clone();
  const rearArm = new THREE.Group();
  rearArm.position.copy(piv);
  body.add(rearArm);
  const inArm = (p) => p.clone().sub(piv);
  const armLen = Math.max(0.2, Math.abs(rA.z - piv.z));
  if (G.fs) {
    for (const sd of [sL, sR]) {
      rearArm.add(tube(inArm(piv.clone().add(sd)), inArm(rA.clone().add(sd)), 0.017, f));
      rearArm.add(tube(inArm(rA.clone().add(sd)), inArm(stTop.clone().add(V(0, -0.12, 0)).add(sd).addScaledVector(seatDir, -0.05)), 0.014, f));
    }
    const rocker = stTop.clone().addScaledVector(seatDir, -0.13);
    const shockA = rocker.clone().add(V(0, 0.02, 0.02));
    const shockB = bb.clone().lerp(crown, 0.32);
    body.add(tube(shockA, shockB, 0.024, mats.dark));
    body.add(tube(shockA.clone().lerp(shockB, 0.2), shockA.clone().lerp(shockB, 0.65), 0.03, mats.stanchion));
  } else {
    for (const sd of [sL, sR]) {
      rearArm.add(tube(inArm(bb.clone().add(sd.clone().multiplyScalar(0.6))), inArm(rA.clone().add(sd)), 0.014, f));
      body.add(tube(stTop.clone().add(V(0, -0.03, 0)), rA.clone().add(sd), 0.012, f));
    }
  }
  // Seat post + saddle.
  const postTop = stTop.clone().addScaledVector(seatDir, G.seatH - 0.18);
  body.add(tube(stTop, postTop, 0.015, mats.dark));
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.27), mats.seat);
  saddle.position.copy(postTop).add(V(0, 0.02, 0.02));
  saddle.castShadow = true;
  body.add(saddle);

  // Cranks.
  const cranks = new THREE.Group();
  cranks.position.copy(bb);
  body.add(cranks);
  const crankL = 0.17;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 4, 24), mats.dark);
  ring.rotation.y = Math.PI / 2; ring.position.x = -0.06;
  cranks.add(ring);
  const pedalGeo = new THREE.BoxGeometry(0.1, 0.018, 0.1);
  const pedals = [];
  for (const sd of [1, -1]) {
    const arm = tube(V(sd * 0.07, 0, 0), V(sd * 0.08, sd * -crankL, 0), 0.012, mats.metal);
    cranks.add(arm);
    const p = new THREE.Mesh(pedalGeo, mats.dark);
    p.position.set(sd * 0.13, sd * -crankL, 0);
    p.castShadow = true;
    cranks.add(p);
    pedals.push(p);
  }
  // Chain line.
  const chainPts = [];
  for (const y of [0.09, -0.09]) chainPts.push(-0.06, bb.y + y, bb.z, -0.06, rA.y + y * 0.5, rA.z);
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(chainPts, 3));
  body.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x55585c })));

  // Wheels.
  const rearWheel = wheel(R, G.tyre, mats, id === 'dj' ? 32 : 28);
  rearWheel.position.copy(inArm(rA));
  rearArm.add(rearWheel);

  // Steering assembly: fork, bar and front wheel turn about the head axis.
  const steerPivot = new THREE.Group();
  steerPivot.position.copy(crown);
  steerPivot.quaternion.setFromUnitVectors(UP, steerDir);
  body.add(steerPivot);
  const steer = new THREE.Group();
  steerPivot.add(steer);
  const toSteer = (p) => {
    const inv = steerPivot.quaternion.clone().invert();
    return p.clone().sub(crown).applyQuaternion(inv);
  };
  const fAs = toSteer(fA);
  const legs = G.dual ? 0.075 : 0.06;
  // Fork lowers and the front wheel slide up the stanchions.
  const forkSlide = new THREE.Group();
  steer.add(forkSlide);
  for (const sd of [1, -1]) {
    const lowerTop = fAs.clone().add(V(0, 0.3, 0));
    forkSlide.add(tube(fAs.clone().add(V(sd * legs, 0, 0)), lowerTop.clone().add(V(sd * legs, 0, 0)), 0.022, mats.dark));
    const top = G.dual ? V(sd * legs, 0.16, 0) : V(sd * legs, 0.02, 0);
    steer.add(tube(lowerTop.clone().add(V(sd * legs, -0.05, 0)), top, 0.017, mats.stanchion));
  }
  const crownMesh = new THREE.Mesh(new THREE.BoxGeometry(legs * 2 + 0.06, 0.03, 0.06), mats.dark);
  steer.add(crownMesh);
  if (G.dual) {
    const c2 = crownMesh.clone(); c2.position.y = 0.16; steer.add(c2);
  }
  const steererTop = V(0, (G.dual ? 0.2 : 0.17), 0);
  steer.add(tube(V(0, 0, 0), steererTop, 0.017, mats.dark));
  // Bar: rise and sweep, in steer space (y along the steerer).
  const stemEnd = steererTop.clone().add(V(0, 0.02, 0.05));
  steer.add(tube(steererTop, stemEnd, 0.02, mats.dark));
  const barW = id === 'dj' ? 0.36 : 0.39;
  const gripL = stemEnd.clone().add(V(barW, 0.035, -0.02));
  const gripR = stemEnd.clone().add(V(-barW, 0.035, -0.02));
  steer.add(tube(gripL, gripR, 0.012, mats.dark));
  if (id === 'dj') steer.add(tube(gripL.clone().lerp(gripR, 0.2).add(V(0, 0.07, -0.02)), gripL.clone().lerp(gripR, 0.8).add(V(0, 0.07, -0.02)), 0.009, mats.dark));
  for (const g of [gripL, gripR]) {
    const gm = tube(g.clone().add(V(Math.sign(g.x) * -0.07, 0, 0)), g.clone().add(V(Math.sign(g.x) * 0.01, 0, 0)), 0.017, mats.grip);
    steer.add(gm);
  }
  const frontWheel = wheel(R, G.tyre, mats, id === 'dj' ? 32 : 28);
  frontWheel.position.copy(fAs);
  frontWheel.quaternion.copy(steerPivot.quaternion).invert();
  forkSlide.add(frontWheel);
  const steerAxisY = steerDir.y;

  const gripMarkers = [new THREE.Object3D(), new THREE.Object3D()];
  gripMarkers[0].position.copy(gripL); gripMarkers[1].position.copy(gripR);
  steer.add(gripMarkers[0], gripMarkers[1]);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const travelF = G.dual ? 0.2 : G.fs ? 0.15 : 0.1;
  const travelR = G.fs ? (G.dual ? 0.2 : 0.14) : 0;
  const frontQ0 = steerPivot.quaternion.clone().invert();
  const api = {
    id, root, whipPivot, body, steer, frontWheel, rearWheel, cranks, pedals, mats, R, wb,
    gripMarkers, bb, travelF, travelR, steerAxisY, dual: G.dual,
    // World-space positions of grips / pedals (call after updateMatrixWorld).
    worldGrip(i, out) { return gripMarkers[i].getWorldPosition(out); },
    worldPedal(i, out) { return pedals[i].getWorldPosition(out); },
    worldSaddle(out) { return saddle.getWorldPosition(out); },
    setColor(hex) { frameMat.color.set(hex); },
    spin: 0, spinR: 0,
    // Wheels roll with the ground speed; a locked rear stops turning.
    roll(dt, speed, rearLock = 0) {
      this.spin += (speed / R) * dt;
      this.spinR += (speed / R) * dt * (1 - rearLock);
      rearWheel.rotation.x = this.spinR;
      frontWheel.quaternion.copy(frontQ0);
      frontWheel.rotateX(this.spin);
    },
    setBar(angle) { steer.rotation.y = angle; },
    setCrank(a) {
      cranks.rotation.x = a;
      for (const p of pedals) p.rotation.x = -a;   // pedals stay flat
    },
    // front: travel along the fork (m), rear: wheel travel (m).
    setSuspension(front, rear) {
      forkSlide.position.y = clamp01(front / travelF) * travelF;
      rearArm.rotation.x = travelR ? Math.asin(Math.min(0.9, clamp01(rear / travelR) * travelR / armLen)) : 0;
    },
    setWhip(twist, lay) {
      whipPivot.rotation.order = 'YXZ';
      whipPivot.rotation.set(0, twist, -lay);
    },
    // Legacy convenience used by the showroom.
    update(dt, sim) {
      this.roll(dt, sim.grounded ? sim.speed : 0);
      this.setBar(-sim.steerVis * 0.32 - sim.barAngle);
      this.setCrank(sim.pedalPhase + Math.PI / 2);
      this.setWhip(sim.whip * 0.75, sim.whip * 0.55);
    },
  };
  return api;
}

// ---------------------------------------------------------------- rider --

export const KIT_COLORS = ['#e8562a', '#2fb8e6', '#8bc34a', '#f2c230', '#b06ad9', '#f2f2f2', '#2d2f35', '#ff5d8f'];

function twoBone(root, target, l1, l2, pole, outMid) {
  const d = target.clone().sub(root);
  let len = d.length();
  const maxL = (l1 + l2) * 0.999;
  if (len > maxL) { d.multiplyScalar(maxL / len); len = maxL; }
  const minL = Math.abs(l1 - l2) + 1e-3;
  if (len < minL) { d.multiplyScalar(minL / Math.max(len, 1e-6)); len = minL; }
  const dir = d.clone().normalize();
  const a = (l1 * l1 + len * len - l2 * l2) / (2 * l1 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - (a * l1) * (a * l1)));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  outMid.copy(root).addScaledVector(dir, a * l1).addScaledVector(p, h);
  return root.clone().add(d);
}

export function buildRider(kit = {}) {
  const jersey = mat(kit.jersey || '#2fb8e6', 0.85);
  const pants = mat(kit.pants || '#2d2f35', 0.9);
  const skin = mat('#d9a27e', 0.7);
  const glove = mat(kit.gloves || '#1b1c20', 0.8);
  const shoe = mat('#1b1c20', 0.8);
  const helmetMat = mat(kit.helmet || '#f2f2f2', 0.35, 0.1);
  const visorMat = mat(kit.helmetAccent || '#1b1c20', 0.5);
  const lensMat = mat('#e08a2c', 0.15, 0.6);
  const strapMat = mat('#4a4f55', 0.8);
  const packMat = mat(kit.pack || '#3a3d42', 0.85);

  const g = new THREE.Group();
  const parts = {};
  const limb = (name, r, m) => {
    const mesh = new THREE.Mesh(capGeo, m);
    mesh.castShadow = true;
    mesh.userData.r = r;
    g.add(mesh);
    parts[name] = mesh;
    return mesh;
  };
  limb('thighL', 0.075, pants); limb('thighR', 0.075, pants);
  limb('shinL', 0.058, pants); limb('shinR', 0.058, pants);
  limb('upperL', 0.052, jersey); limb('upperR', 0.052, jersey);
  limb('foreL', 0.045, jersey); limb('foreR', 0.045, jersey);
  limb('torso', 0.15, jersey);
  limb('neck', 0.05, skin);
  for (const n of ['handL', 'handR']) {
    const m = new THREE.Mesh(sphGeo, glove); m.scale.setScalar(0.048); m.castShadow = true; g.add(m); parts[n] = m;
  }
  for (const n of ['footL', 'footR']) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), shoe); m.castShadow = true; g.add(m); parts[n] = m;
  }
  const hips = new THREE.Mesh(sphGeo, pants); hips.scale.set(0.17, 0.11, 0.13); hips.castShadow = true; g.add(hips); parts.hips = hips;

  // Head: full-face helmet with chin bar, peak and goggles; all procedural.
  const head = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), helmetMat);
  shell.scale.set(1, 1.02, 1.12);
  shell.castShadow = true;
  head.add(shell);
  const chin = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.032, 8, 16, Math.PI * 0.9), helmetMat);
  chin.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.05 + Math.PI);
  chin.rotation.order = 'XZY';
  chin.position.set(0, -0.07, 0.05);
  chin.castShadow = true;
  head.add(chin);
  const chinVent = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.02), visorMat);
  chinVent.position.set(0, -0.085, 0.165);
  head.add(chinVent);
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.11), visorMat);
  peak.position.set(0, 0.09, 0.15); peak.rotation.x = -0.25;
  head.add(peak);
  const gogFrame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.04), visorMat);
  gogFrame.position.set(0, 0.015, 0.135);
  head.add(gogFrame);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.012), lensMat);
  lens.position.set(0, 0.015, 0.158);
  head.add(lens);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.012, 4, 24), strapMat);
  strap.rotation.x = Math.PI / 2 + 0.12; strap.position.y = 0.02; strap.scale.set(1, 1.1, 1);
  head.add(strap);
  g.add(head);
  parts.head = head;

  // Backpack (hydration pack) on the torso.
  const pack = new THREE.Group();
  const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.11), packMat);
  packBody.castShadow = true;
  pack.add(packBody);
  const packStripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.115), mat(kit.jersey || '#2fb8e6', 0.7));
  packStripe.position.y = 0.08;
  pack.add(packStripe);
  g.add(pack);
  parts.pack = pack;

  const L = { thigh: 0.43, shin: 0.44, upper: 0.29, fore: 0.29, torso: 0.5 };
  const tmp = {
    hip: V(0, 0, 0), shoulder: V(0, 0, 0), knee: V(0, 0, 0), elbow: V(0, 0, 0),
    a: V(0, 0, 0), b: V(0, 0, 0), c: V(0, 0, 0),
  };

  const setLimb = (mesh, a, b) => placeBetween(mesh, a, b, mesh.userData.r, true);

  return {
    group: g, parts,
    setKit(k) {
      if (k.jersey) { jersey.color.set(k.jersey); packStripe.material.color.set(k.jersey); }
      if (k.helmet) helmetMat.color.set(k.helmet);
      if (k.pants) pants.color.set(k.pants);
    },
    /**
     * Pose the rider in the bike root's local space. All motion decisions
     * live in animate.js; this just builds the body from its channels and
     * pins hands and feet with two-bone IK.
     * c: { bb, handL, handR, footL, footR, poleL?, poleR?, drop, fore, hipX,
     *      torso (forward fold, rad), hipYaw, hipRoll, headPitch, headYaw,
     *      toes (0..1 pointed feet) }
     */
    pose(c) {
      const hip = tmp.hip.set(c.hipX || 0, c.bb.y + 0.76 - c.drop, c.bb.z - 0.14 + c.fore);
      const yawQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.hipYaw || 0, c.hipRoll || 0, 'YXZ'));
      // Torso: leaning toward the bar from upright, folded by the channels.
      const gripMid = tmp.a.copy(c.handL).add(c.handR).multiplyScalar(0.5);
      const toBar = gripMid.sub(hip).normalize();
      const base = Math.atan2(toBar.z, toBar.y);            // forward lean of the reach line
      const lean = THREE.MathUtils.clamp(base * 0.62 + (c.torso || 0), -0.3, 1.45);
      const torsoDir = new THREE.Vector3(0, Math.cos(lean), Math.sin(lean)).applyQuaternion(yawQ);
      const shoulder = tmp.shoulder.copy(hip).addScaledVector(torsoDir, L.torso);
      setLimb(parts.torso, hip, shoulder);
      parts.hips.position.copy(hip);
      parts.hips.quaternion.copy(parts.torso.quaternion);
      const neckTop = shoulder.clone().addScaledVector(torsoDir, 0.08).add(V(0, 0.03, 0));
      setLimb(parts.neck, shoulder, neckTop);
      parts.head.position.copy(neckTop).add(V(0, 0.12, 0.03));
      parts.head.rotation.set(c.headPitch || 0, c.headYaw || 0, 0, 'YXZ');
      parts.pack.position.copy(hip).lerp(shoulder, 0.62);
      parts.pack.quaternion.copy(parts.torso.quaternion);
      parts.pack.translateZ(-0.19);
      const side = (sgn) => V(sgn * 0.19, 0, 0).applyQuaternion(parts.torso.quaternion);
      for (const sgn of [1, -1]) {
        const sh = shoulder.clone().add(side(sgn)).addScaledVector(torsoDir, -0.05);
        const hand = sgn > 0 ? c.handL : c.handR;
        const pole = (sgn > 0 ? c.poleL : c.poleR) || V(sgn * 1.4, 0.3, -0.1);
        const h = twoBone(sh, hand, L.upper, L.fore, pole, tmp.elbow);
        setLimb(sgn > 0 ? parts.upperL : parts.upperR, sh, tmp.elbow);
        setLimb(sgn > 0 ? parts.foreL : parts.foreR, tmp.elbow, h);
        (sgn > 0 ? parts.handL : parts.handR).position.copy(h);
      }
      for (const sgn of [1, -1]) {
        const hp = hip.clone().add(V(sgn * 0.1, -0.05, 0).applyQuaternion(yawQ));
        const foot = (sgn > 0 ? c.footL : c.footR).clone().add(V(0, 0.05, 0));
        const h = twoBone(hp, foot, L.thigh, L.shin, V(sgn * (c.kneeOut || 0.2), 0.2, 1), tmp.knee);
        setLimb(sgn > 0 ? parts.thighL : parts.thighR, hp, tmp.knee);
        setLimb(sgn > 0 ? parts.shinL : parts.shinR, tmp.knee, h);
        const ft = sgn > 0 ? parts.footL : parts.footR;
        ft.position.copy(h).add(V(0, -0.02, 0.03));
        ft.rotation.set((c.toes || 0) * 0.9, 0, 0);
      }
      return { shoulder, hip };
    },
  };
}
