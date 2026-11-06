// The soldier's own arms holding the gun in first person.
//
// The hands and fingers are still animated by the gun layer's hand rigs
// (src/viewmodel/handRig.js and the poses in viewmodel.js): every reload,
// inspect and grip shape is theirs. Each frame this puts his arm bones where
// those hands are: his hand where the rig's hand is (his middle knuckle on
// its middle knuckle), each of his finger bones turned as the rig's, and his
// upper arm and forearm by two-bone IK from his shoulder, the elbow hanging
// down and out.
//
// His sleeves and gloves are drawn in the gun layer (so they hold the gun and
// never poke into walls) with their own copy of his skeleton: the same model
// file and geometry, its own bones. That copy stands at rest, with its chest
// held where his chest is seen from the camera standing still and looking
// straight ahead, so the arms reach the gun the same way whatever his body
// does as he walks or runs, and however far up you look (his body only
// leans a little with the view). Looking down, where his real shoulders are
// in view, its chest goes over to where his body's chest really is, so the
// sleeves meet his shoulders.
//
// His body in the world (src/player/body.js) gets the same arm pose from its
// own shoulders, for its shadow.
//
// If his arms can't reach where the hands are, the whole gun is drawn in
// towards his shoulders by the difference, so the hands never leave it.
//
// A gun that brings its own arms (the Beretta 92FS and the FN 502, see
// src/viewmodel/animatedGun.js) is held by those: his arms aren't drawn in
// the gun layer then, and nothing pulls the gun in or fits his fingers to
// it. His body's arms (seen in photo mode, and in his shadow) take the hold
// its own arms' clips have: see reachOwnArms.

import * as THREE from 'three';
import { bonesOf, firstPersonTag } from '../soldier.js';
import { twoBoneIK } from './ik.js';
import { GunVolume, solidMeshes } from './gunVolume.js';

const SIDES = { right: 'R', left: 'L' };
const DIGITS = ['Index', 'Mid', 'Ring', 'Pinky', 'Thumb']; // the rigs' chain order
const REACH = { start: 0.9, full: 0.97 }; // of his arm's length: pulling the gun in
const PULL_SPEED = 0.35; // m/s at most
// Looking down, the arms' chest goes over to his body's real one between
// these (radians, eased).
const LOOKING_DOWN = { from: -0.35, to: -0.95 };
const CHEST = 'CC_Base_Spine02';
// How his hands fit the rigs' poses, his gloved hands being thicker than
// theirs: each hand moved out from its palm by `out` (metres), and further
// out of the gun if its palm is still in it; and each finger bone, if it's
// in the gun, turned out of it till it's on its surface (`radius`: how
// thick his glove is round each bone, metres: the fingers' and the thumb's,
// knuckle to tip, and the palm's; turned at most `most` radians).
const FIT = {
  out: { right: -0.012, left: -0.012 },
  radius: { finger: [0.012, 0.011, 0.01], thumb: [0.014, 0.012, 0.011], palm: 0.014 },
  most: 0.9,
};
const ALONG = [0.35, 0.7, 1]; // where along each bone its fit is checked
const TIP = 0.85; // a fingertip's length, of the bone before it

const v = () => new THREE.Vector3();
// Scratch vectors for reachOwnArms.
const OWN = {
  target: new THREE.Vector3(), shoulder: new THREE.Vector3(), out: new THREE.Vector3(),
  wrist: new THREE.Vector3(), mid: new THREE.Vector3(), index: new THREE.Vector3(), pinky: new THREE.Vector3(),
  a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(),
  turn: new THREE.Quaternion(), his: new THREE.Quaternion(), q: new THREE.Quaternion(), p: new THREE.Quaternion(),
  m: new THREE.Matrix4(),
};
// A gun's own arms' finger bones, by the names its converter gives them
// (tools/blender/): in the rigs' chain order (DIGITS), each from its first
// knuckle out, and its hand bone. (Its pinky is `pinky` or `little`.)
const OWN_DIGITS = [['index'], ['middle'], ['ring'], ['pinky', 'little'], ['thumb']];
function ownHand(root, s) {
  const bone = (name) => root.getObjectByName(`${name}_${s}`) || null;
  const hand = bone('hand');
  const digits = OWN_DIGITS.map((names) => {
    for (const n of names) {
      const chain = [1, 2, 3].map((k) => bone(`${n}${k}`));
      if (chain.every(Boolean)) return chain;
    }
    return null;
  });
  return hand && digits.every(Boolean) ? { hand, digits } : null;
}
// The rotation whose columns are (along, across, their normal), into `out`.
function frameInto(out, along, across) {
  const x = along.normalize();
  const y = across.addScaledVector(x, -across.dot(x)).normalize();
  const z = OWN.c.crossVectors(x, y);
  return out.setFromRotationMatrix(OWN.m.makeBasis(x, y, z));
}
const q = () => new THREE.Quaternion();

// A rotation whose columns are the frame (along, across, normal) built from
// two directions.
function frame(along, across) {
  const x = along.clone().normalize();
  const y = across.clone().addScaledVector(x, -across.dot(x)).normalize();
  const z = v().crossVectors(x, y);
  return q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// The arm bones of one copy of the model.
function armBones(bones, s) {
  const bone = (n) => bones[`CC_Base_${s}_${n}`];
  const arm = {
    upper: bone('Upperarm'),
    fore: bone('Forearm'),
    hand: bone('Hand'),
    foreTwist: bone('ForearmTwist02'),
    digits: DIGITS.map((d) => [1, 2, 3].map((k) => bone(`${d}${k}`))),
  };
  if (!arm.upper || !arm.fore || !arm.hand || arm.digits.some((d) => d.some((b) => !b))) return null;
  arm.foreTwistRest = arm.foreTwist ? arm.foreTwist.quaternion.clone() : null;
  return arm;
}

// A transform part of the way (k) from a to b (both rigid, same scale).
function blend(a, b, k) {
  const pa = v();
  const qa = q();
  const sa = v();
  const pb = v();
  const qb = q();
  const sb = v();
  a.decompose(pa, qa, sa);
  b.decompose(pb, qb, sb);
  return new THREE.Matrix4().compose(pa.lerp(pb, k), qa.slerp(qb, k), sa.lerp(sb, k));
}

export class FirstPersonArms {
  // body: the PlayerBody (it brings the arms' copy of the model too);
  // viewmodel: the Viewmodel (its rigs and scene).
  constructor(body, viewmodel) {
    this.body = body;
    this.viewmodel = viewmodel;
    this.ready = false;
    this.meshes = [];
    this.fit = FIT;
    this.volumes = new Map(); // each gun's GunVolumes, by which of its parts are there
  }

  // Once both are loaded: the arms' copy of the model, the calibration
  // between his hands and the rigs', and his arms in the gun layer. Returns
  // whether it worked.
  setUp() {
    const { body, viewmodel } = this;
    if (!body.model || !body.armsModel || !viewmodel.shooter || !viewmodel.hand) return false;
    // The arms' copy, at rest, unturned at the origin.
    const model = body.armsModel;
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    model.updateMatrixWorld(true);
    const bones = bonesOf(model);
    this.model = model;
    this.rest = new Map(Object.values(bones).map((b) => [b, { position: b.position.clone(), quaternion: b.quaternion.clone() }]));
    this.chest = bones[CHEST];
    this.bodyChest = body.bones[CHEST];
    if (!this.chest || !this.bodyChest) return false;
    // The chest's place in the model (to put the model where its chest goes).
    this.chestInModel = this.chest.matrixWorld.clone();

    this.arms = {};
    this.bodyArms = {};
    for (const [side, s] of Object.entries(SIDES)) {
      const rig = side === 'right' ? viewmodel.shooter : viewmodel.hand;
      const arm = armBones(bones, s);
      const bodyArm = armBones(body.bones, s);
      if (!arm || !bodyArm) return false;
      // His hand at rest: where its knuckles are, in its own frame (metres).
      const handPos = arm.hand.getWorldPosition(v());
      const handTurn = arm.hand.getWorldQuaternion(q());
      const local = (b) => b.getWorldPosition(v()).sub(handPos).applyQuaternion(handTurn.clone().invert());
      const hisMid = local(arm.digits[1][0]);
      const hisAcross = local(arm.digits[3][0]).sub(local(arm.digits[0][0]));
      // The rig's hand as modelled, in its wrist's frame (it rests unturned).
      const rest = rig.rest;
      const knuckle = (c) => rest.fingers[c].joints[0].clone().sub(rest.wrist);
      const ourAcross = knuckle(3).sub(knuckle(0));
      // His hand's frame in the rig's: lines up the knuckle rows.
      const handMap = frame(knuckle(1), ourAcross).multiply(frame(hisMid.clone(), hisAcross).invert());
      // Where his wrist goes in the rig's wrist frame: his middle knuckle on
      // the rig's.
      const wristAt = knuckle(1).sub(hisMid.clone().applyQuaternion(handMap));
      // Each finger bone: its turn relative to the rig's matching bone, so
      // it points where the rig's finger points.
      const fingerMap = arm.digits.map((digit, c) => digit.map((b, k) => {
        const chain = c === 4 ? rest.thumb : rest.fingers[c];
        const ourDir = chain.joints[k + 1].clone().sub(chain.joints[k]);
        const next = k < 2 ? digit[k + 1] : null;
        const hisDir = next ? local(next).sub(local(b)) : local(b).sub(local(digit[k - 1]));
        const hisTurn = handTurn.clone().invert().multiply(b.getWorldQuaternion(q())); // in his hand's frame
        const mapped = handMap.clone().multiply(hisTurn); // in the rig's wrist frame
        const fix = q().setFromUnitVectors(hisDir.clone().applyQuaternion(handMap).normalize(), ourDir.normalize());
        return fix.multiply(mapped); // the rig's bone rests unturned in its wrist frame
      }));
      const reach = arm.upper.getWorldPosition(v()).distanceTo(arm.fore.getWorldPosition(v()))
        + arm.fore.getWorldPosition(v()).distanceTo(handPos);
      // Out of the palm, in the rig's wrist frame.
      const palmOut = knuckle(1).cross(ourAcross).normalize();
      // The far end of each finger bone in its own frame: the next bone, or
      // past the last, its tip.
      const ends = arm.digits.map((digit) => digit.map((b, k) => {
        const end = k < digit.length - 1 ? digit[k + 1].getWorldPosition(v())
          : b.getWorldPosition(v()).lerp(digit[k - 1].getWorldPosition(v()), -TIP);
        return b.worldToLocal(end);
      }));
      const shared = { rig, handMap, wristAt, fingerMap, reach, palmOut, ends, hisMid, hisAcross };
      this.arms[side] = Object.assign(arm, shared);
      this.bodyArms[side] = Object.assign(bodyArm, shared);
      // (His body's finger bones as they were, to turn from each frame while
      // a gun with its own arms is held: see reachOwnArms.)
      bodyArm.digitRest = bodyArm.digits.map((bones) => bones.map((b) => b.quaternion.clone()));
    }
    // His sleeves and gloves in the gun layer, with the arms' copy's bones.
    this.inGunLayer = new Map(); // his mesh in the arms' copy -> its copy in the gun layer
    model.traverse((o) => {
      if (!o.isSkinnedMesh || firstPersonTag(o) !== 'arms') return;
      this.inGunLayer.set(o, this.addToGunLayer(o));
    });
    // Gloves from his outfit (src/gear.js: the gloves slot): a glove that
    // isn't his own goes in the gun layer on the arms' copy's bones, and
    // his own gloves are left out.
    if (body.wardrobe) {
      body.wardrobe.dress(model, {
        slots: ['gloves'],
        add: (piece) => {
          this.inGunLayer.set(piece, this.addToGunLayer(piece));
          this.setThickness(piece.userData.gear && piece.userData.gear.thickness);
        },
        remove: (piece) => {
          const mesh = this.inGunLayer.get(piece);
          if (piece.userData.gear && this.gloves === piece.userData.gear.thickness) this.setThickness(null);
          if (mesh) {
            mesh.removeFromParent();
            for (const m of [].concat(mesh.material)) m.dispose(); // (its own copies; the file's geometry stays)
            this.meshes.splice(this.meshes.indexOf(mesh), 1);
            this.inGunLayer.delete(piece);
          }
        },
        hide: (own, hidden) => {
          const mesh = this.inGunLayer.get(own);
          if (mesh) mesh.userData.gearHidden = hidden;
        },
      });
    }
    // The gloves model's own gloves and sleeves are no longer drawn (its
    // hand rigs still move the magazine and the like).
    viewmodel.hideGloves();
    // Each gun's shape now, rather than the first time it's drawn.
    for (const gun of Object.values(viewmodel.guns || {})) if (gun.pistol && !gun.animated) this.gunVolume(gun.pistol);
    this.ready = true;
    return true;
  }

  // How thick the gloves he's wearing are, to his own (by bone: each of
  // the fingers' and the thumb's three, and the palm; null: his own), so
  // their fingers rest on the gun as his do: FIT's radii scaled by it.
  setThickness(thickness) {
    const k = (x) => THREE.MathUtils.clamp(Number(x) || 1, 0.7, 1.4);
    const t = thickness || {};
    this.gloves = thickness ? t : null;
    this.fit = {
      ...FIT,
      radius: {
        finger: FIT.radius.finger.map((r, i) => r * k(t.finger && t.finger[i])),
        thumb: FIT.radius.thumb.map((r, i) => r * k(t.thumb && t.thumb[i])),
        palm: FIT.radius.palm * k(t.palm),
      },
    };
  }

  // One of his meshes (or a glove from his outfit), on the arms' copy's
  // bones, drawn in the gun layer: its own copies of the materials, lit by
  // the gun layer's sky.
  addToGunLayer(o) {
    const material = [].concat(o.material).map((m) => {
      const own = m.clone();
      own.envMap = null; // the gun layer's own sky
      own.envMapIntensity = 1;
      return own;
    });
    const mesh = new THREE.SkinnedMesh(o.geometry, material.length === 1 ? material[0] : material);
    mesh.bind(o.skeleton, o.bindMatrix);
    mesh.bindMode = THREE.DetachedBindMode;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = `fp_${o.name}`;
    this.viewmodel.scene.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  // camera: the world camera, after it's placed for this frame; player: the
  // movement state; pitch: how far the view is turned up (radians). Runs
  // after the viewmodel and the body have been updated.
  update(camera, player = null, pitch = 0, frameSeconds = 1 / 60) {
    if (!this.ready && !this.setUp()) return;
    const { viewmodel } = this;
    camera.updateMatrixWorld();
    const C = camera.matrixWorld;
    const Cq = camera.getWorldQuaternion(q());
    const toView = C.clone().invert();
    const wrists = viewmodel.ownWrists;
    for (const mesh of this.meshes) mesh.visible = !wrists && !mesh.userData.gearHidden;
    if (wrists) {
      this.reachOwnArms(wrists, C, Cq);
      return;
    }

    // Where his chest is, seen from the camera, standing still and looking
    // straight ahead: measured the first time he does.
    const calm = !player || (player.grounded && player.move === 'ground' && player.stance === 'stand' && Math.hypot(player.vx, player.vz) < 0.2);
    if (!this.chestSeen && calm && Math.abs(pitch) < 0.08) this.chestSeen = toView.clone().multiply(this.bodyChest.matrixWorld);
    // The arms' chest: held there (moving with the camera), going over to
    // his body's real chest as the view turns down.
    let chest = this.bodyChest.matrixWorld.clone();
    if (this.chestSeen) {
      const held = new THREE.Matrix4().multiplyMatrices(C, this.chestSeen);
      chest = blend(chest, held, THREE.MathUtils.smoothstep(pitch, LOOKING_DOWN.to, LOOKING_DOWN.from));
    }
    // The arms' copy at rest with its chest there.
    for (const [bone, rest] of this.rest) {
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
    }
    chest.multiply(this.chestInModel.clone().invert()).decompose(this.model.position, this.model.quaternion, this.model.scale);
    this.model.updateMatrixWorld(true);

    // How far each hand is past his reach: draw the gun in by that much. (The
    // gun already has last frame's pull; the wrists are measured without it.
    // The viewmodel adds the pull from the next frame on, so everything that
    // reads the gun's place, the muzzle flash and the shots, agrees.)
    viewmodel.scene.updateMatrixWorld(true);
    const pull = v();
    const had = viewmodel.reachPull.clone();
    for (const arm of Object.values(this.arms)) {
      const shoulder = arm.upper.getWorldPosition(v()).applyMatrix4(toView);
      const wrist = arm.wristAt.clone().applyMatrix4(arm.rig.root.matrixWorld).sub(had);
      const d = wrist.distanceTo(shoulder);
      const k = THREE.MathUtils.smoothstep(d / arm.reach, REACH.start, REACH.full + 0.02);
      const excess = Math.max(0, d - arm.reach * REACH.start) * k;
      // (The support hand only pulls while it's on the gun.)
      const w = arm.rig === viewmodel.shooter ? 1 : viewmodel.supportOnGun ? 1 : 0;
      pull.addScaledVector(shoulder.sub(wrist).normalize(), excess * w);
    }
    if (pull.length() > 0.25) pull.setLength(0.25);
    // (Eased, and never faster than PULL_SPEED, so the gun can't jump.)
    const step = pull.sub(viewmodel.reachPull).multiplyScalar(0.25);
    const most = PULL_SPEED * Math.min(0.05, frameSeconds || 1 / 60);
    if (step.length() > most) step.setLength(most);
    viewmodel.reachPull.add(step);
    // (This frame's gun moves by the change straight away.)
    viewmodel.holder.position.add(viewmodel.reachPull.clone().sub(had));
    viewmodel.scene.updateMatrixWorld(true);

    // Both copies' arms to the rigs' hands: the arms' (drawn) and his body's
    // (its shadow).
    // The drawn hands are on the gun, not in it: a palm that's in it moves
    // out (the arm reaching there instead), and fingers turn out of it.
    const volume = this.gunVolume();
    const toGun = volume && viewmodel.pistol.matrixWorld.clone().invert().multiply(toView);
    const toWorld = volume && toGun.clone().invert();
    for (const arm of Object.values(this.arms)) {
      this.pose(arm, C, Cq);
      if (!volume) continue;
      const push = this.palmPush(arm, volume, toGun, toWorld);
      if (push) this.pose(arm, C, Cq, push);
      this.fitFingers(arm, volume, toGun, toWorld);
    }
    for (const arm of Object.values(this.bodyArms)) this.pose(arm, C, Cq);
    // His arms drawn in the gun layer: the world as the camera sees it.
    for (const mesh of this.meshes) {
      mesh.matrix.copy(toView);
      mesh.matrixWorld.copy(toView);
    }
  }

  // A gun with its own arms in the hands: no pull (it's let go of at once:
  // the gun was out of view as it was swapped), and his body's arms (seen
  // in photo mode, and in his shadow) take the hold its own arms' clips
  // have: each of his hands turned as its hand is, his middle knuckle on
  // its middle knuckle, each finger bone pointing as its matching one does,
  // and his arm reaching there by two-bone IK from his shoulder, the elbow
  // hanging down and out as when he holds the others. (Its own arms, in the
  // gun layer, aren't changed: they play its clips as made.)
  reachOwnArms(wrists, C, Cq) {
    const { viewmodel } = this;
    viewmodel.holder.position.sub(viewmodel.reachPull);
    viewmodel.reachPull.set(0, 0, 0);
    const root = viewmodel.current && viewmodel.current.rig && viewmodel.current.rig.root;
    if (!this.ownHands || this.ownHands.root !== root) {
      this.ownHands = { root, right: root && ownHand(root, 'R'), left: root && ownHand(root, 'L') };
    }
    // (It runs every frame: it reuses the same few vectors.)
    for (const [side, arm] of Object.entries(this.bodyArms)) {
      if (!wrists[side]) continue;
      const its = this.ownHands[side];
      const target = OWN.target.copy(wrists[side]).applyMatrix4(C);
      let turn = null;
      if (its) {
        // Its hand's frame in the world, from its knuckles; his hand turned
        // to match, and moved so his middle knuckle is on its.
        const wristAt = its.hand.getWorldPosition(OWN.wrist).applyMatrix4(C);
        const mid = its.digits[1][0].getWorldPosition(OWN.mid).applyMatrix4(C);
        const index = its.digits[0][0].getWorldPosition(OWN.index).applyMatrix4(C);
        const pinky = its.digits[3][0].getWorldPosition(OWN.pinky).applyMatrix4(C);
        frameInto(OWN.turn, OWN.a.subVectors(mid, wristAt), OWN.b.subVectors(pinky, index));
        frameInto(OWN.his, OWN.a.copy(arm.hisMid), OWN.b.copy(arm.hisAcross));
        turn = OWN.turn.multiply(OWN.his.invert());
        target.copy(mid).sub(OWN.a.copy(arm.hisMid).applyQuaternion(turn));
      }
      const shoulder = arm.upper.getWorldPosition(OWN.shoulder);
      const out = OWN.out.set(side === 'right' ? 1 : -1, -1.4, 0.35).applyQuaternion(Cq);
      const pole = shoulder.lerp(target, 0.5).addScaledVector(out.normalize(), 0.3);
      twoBoneIK(arm.upper, arm.fore, arm.hand, target, pole);
      if (!turn) continue;
      arm.hand.quaternion.copy(arm.fore.getWorldQuaternion(OWN.q).invert().multiply(turn));
      arm.hand.updateMatrixWorld(true);
      // Each finger bone from where it was, turned to point as its does.
      arm.digits.forEach((bones, c) => bones.forEach((b, k) => {
        b.quaternion.copy(arm.digitRest[c][k]);
        b.updateMatrixWorld(true);
        const chain = its.digits[c];
        const from = b.getWorldPosition(OWN.a);
        const hisDir = (k < bones.length - 1 ? bones[k + 1].getWorldPosition(OWN.b) : OWN.b.copy(from).sub(bones[k - 1].getWorldPosition(OWN.c)).add(from)).sub(from);
        const p0 = chain[k].getWorldPosition(OWN.c).applyMatrix4(C);
        const itsDir = (k < chain.length - 1 ? chain[k + 1].getWorldPosition(OWN.d).applyMatrix4(C) : OWN.d.copy(p0).sub(chain[k - 1].getWorldPosition(OWN.e).applyMatrix4(C)).add(p0)).sub(p0);
        if (hisDir.lengthSq() < 1e-12 || itsDir.lengthSq() < 1e-12) return;
        const delta = OWN.q.setFromUnitVectors(hisDir.normalize(), itsDir.normalize());
        // (A world turn, as a turn in the bone's parent's frame.)
        const parent = b.parent.getWorldQuaternion(OWN.his);
        b.quaternion.premultiply(OWN.p.copy(parent).invert().multiply(delta).multiply(parent));
        b.updateMatrixWorld(true);
      }));
    }
  }

  // Puts one arm's hand where its rig's hand is, the arm reaching it.
  // (push: moves the hand by that much more, in the world.)
  pose(arm, C, Cq, push = null) {
    const root = arm.rig.root;
    const handTurn = Cq.clone().multiply(root.getWorldQuaternion(q())).multiply(arm.handMap);
    const palmOut = this.fit.out[arm.rig === this.viewmodel.shooter ? 'right' : 'left'];
    const target = arm.wristAt.clone().addScaledVector(arm.palmOut, palmOut).applyMatrix4(root.matrixWorld).applyMatrix4(C);
    if (push) target.add(push);
    // The elbow hangs down and out to his side.
    const shoulder = arm.upper.getWorldPosition(v());
    const out = new THREE.Vector3(arm.rig === this.viewmodel.shooter ? 1 : -1, -1.4, 0.35).applyQuaternion(Cq);
    const pole = shoulder.clone().lerp(target, 0.5).addScaledVector(out.normalize(), 0.3);
    twoBoneIK(arm.upper, arm.fore, arm.hand, target, pole);
    // The hand turned as the rig's (its forearm twists to share it).
    const foreTurn = arm.fore.getWorldQuaternion(q());
    arm.hand.quaternion.copy(foreTurn.clone().invert().multiply(handTurn));
    arm.hand.updateMatrixWorld(true);
    if (arm.foreTwist && arm.foreTwistRest) {
      // Half the hand's twist about the forearm goes into the lower forearm,
      // so the cuff turns with the wrist.
      const axis = arm.hand.position.clone().normalize();
      const h = arm.hand.quaternion;
      const along = h.x * axis.x + h.y * axis.y + h.z * axis.z;
      const twist = q().set(axis.x * along, axis.y * along, axis.z * along, h.w).normalize();
      arm.foreTwist.quaternion.copy(arm.foreTwistRest).premultiply(q().slerpQuaternions(q(), twist, 0.5));
      arm.foreTwist.updateMatrixWorld(true);
    }
    // His fingers as the rig's.
    arm.digits.forEach((bones, c) => bones.forEach((b, k) => {
      const ours = Cq.clone().multiply(arm.rig.bones[c][k].getWorldQuaternion(q()));
      const want = ours.multiply(arm.fingerMap[c][k]);
      b.quaternion.copy(b.parent.getWorldQuaternion(q()).invert().multiply(want));
      b.updateMatrixWorld(true);
    }));
  }

  // The gun in hand's GunVolume, made the first time it's held with these
  // parts on it (attachments and the like).
  gunVolume(gun = this.viewmodel.pistol) {
    if (!gun) return null;
    const meshes = solidMeshes(gun);
    const key = meshes.map((m) => m.id).join();
    let made = this.volumes.get(gun);
    if (!made) this.volumes.set(gun, made = new Map());
    if (!made.has(key)) {
      if (made.size > 8) made.clear();
      made.set(key, new GunVolume(gun, meshes));
    }
    return made.get(key);
  }

  // How far a hand's palm must move (in the world) to be out of the gun, or
  // null if it is: checked at the wrist, each knuckle and between.
  palmPush(arm, volume, toGun, toWorld) {
    const points = [arm.hand.getWorldPosition(v())];
    for (let c = 0; c < 4; c++) points.push(arm.digits[c][0].getWorldPosition(v()));
    points.push(points[0].clone().lerp(points[2], 0.5), points[0].clone().lerp(points[4], 0.5));
    let worst = 0;
    const deepest = v();
    for (const p of points) {
      p.applyMatrix4(toGun);
      const d = volume.distance(p) - this.fit.radius.palm;
      if (d < worst) { worst = d; deepest.copy(p); }
    }
    if (worst >= 0) return null;
    return volume.outward(deepest, v()).transformDirection(toWorld).multiplyScalar(Math.min(-worst + 0.002, 0.04));
  }

  // Turns each of an arm's finger bones that's in the gun out of it, knuckle
  // to tip, about its joint, the way its deepest point gets out fastest, till
  // it rests on the gun's surface. toGun: from the world into the gun's
  // space; toWorld: back.
  fitFingers(arm, volume, toGun, toWorld) {
    const { radius, most } = this.fit;
    const p = v(), joint = v(), out = v(), axis = v(), deepest = v(), turn = q();
    arm.digits.forEach((bones, c) => bones.forEach((b, k) => {
      const r = (c === 4 ? radius.thumb : radius.finger)[k];
      let turned = 0;
      for (let tries = 0; tries < 6 && turned < most; tries++) {
        let worst = 0;
        for (const t of ALONG) {
          p.copy(arm.ends[c][k]).multiplyScalar(t);
          b.localToWorld(p).applyMatrix4(toGun);
          const d = volume.distance(p) - r;
          if (d < worst) { worst = d; deepest.copy(p); }
        }
        if (worst >= 0) break;
        // (A thumb lies along the gun's side: it goes out sideways, not up
        // over the top.)
        if (c === 4) out.set(Math.sign(deepest.x - volume.middle.x) || 1, 0, 0);
        else volume.outward(deepest, out);
        out.transformDirection(toWorld);
        b.getWorldPosition(joint);
        const lever = deepest.applyMatrix4(toWorld).sub(joint);
        axis.crossVectors(lever, out);
        if (axis.lengthSq() < 1e-12) break;
        const angle = Math.min(-worst / lever.length() * 1.2 + 0.005, most - turned);
        turn.setFromAxisAngle(axis.normalize(), angle);
        const parent = b.parent.getWorldQuaternion(q()).invert();
        b.quaternion.copy(parent.multiply(turn.multiply(b.getWorldQuaternion(q()))));
        b.updateMatrixWorld(true);
        turned += angle;
      }
    }));
  }
}
