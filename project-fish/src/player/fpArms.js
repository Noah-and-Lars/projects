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

import * as THREE from 'three';
import { bonesOf, firstPersonTag } from '../soldier.js';
import { twoBoneIK } from './ik.js';

const SIDES = { right: 'R', left: 'L' };
const DIGITS = ['Index', 'Mid', 'Ring', 'Pinky', 'Thumb']; // the rigs' chain order
const REACH = { start: 0.9, full: 0.97 }; // of his arm's length: pulling the gun in
// Looking down, the arms' chest goes over to his body's real one between
// these (radians, eased).
const LOOKING_DOWN = { from: -0.35, to: -0.95 };
const CHEST = 'CC_Base_Spine02';

const v = () => new THREE.Vector3();
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
      const shared = { rig, handMap, wristAt, fingerMap, reach };
      this.arms[side] = Object.assign(arm, shared);
      this.bodyArms[side] = Object.assign(bodyArm, shared);
    }
    // His sleeves and gloves in the gun layer, with the arms' copy's bones.
    model.traverse((o) => {
      if (!o.isSkinnedMesh || firstPersonTag(o) !== 'arms') return;
      const material = [].concat(o.material).map((m) => {
        const own = m.clone();
        own.envMap = null; // the gun layer's own sky
        own.envMapIntensity = 1;
        return own;
      });
      const mesh = new THREE.SkinnedMesh(o.geometry, material.length === 1 ? material[0] : material);
      mesh.bind(o.skeleton, new THREE.Matrix4());
      mesh.bindMode = THREE.DetachedBindMode;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = `fp_${o.name}`;
      viewmodel.scene.add(mesh);
      this.meshes.push(mesh);
    });
    // The gloves model's own gloves and sleeves are no longer drawn (its
    // hand rigs still move the magazine and the like).
    viewmodel.hideGloves();
    this.ready = true;
    return true;
  }

  // camera: the world camera, after it's placed for this frame; player: the
  // movement state; pitch: how far the view is turned up (radians). Runs
  // after the viewmodel and the body have been updated.
  update(camera, player = null, pitch = 0) {
    if (!this.ready && !this.setUp()) return;
    const { viewmodel } = this;
    camera.updateMatrixWorld();
    const C = camera.matrixWorld;
    const Cq = camera.getWorldQuaternion(q());
    const toView = C.clone().invert();

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
    viewmodel.reachPull.lerp(pull, 0.25);
    // (This frame's gun moves by the change straight away.)
    viewmodel.holder.position.add(viewmodel.reachPull.clone().sub(had));
    viewmodel.scene.updateMatrixWorld(true);

    // Both copies' arms to the rigs' hands: the arms' (drawn) and his body's
    // (its shadow).
    for (const arms of [this.arms, this.bodyArms]) {
      for (const arm of Object.values(arms)) this.pose(arm, C, Cq);
    }
    // His arms drawn in the gun layer: the world as the camera sees it.
    for (const mesh of this.meshes) {
      mesh.matrix.copy(toView);
      mesh.matrixWorld.copy(toView);
    }
  }

  // Puts one arm's hand where its rig's hand is, the arm reaching it.
  pose(arm, C, Cq) {
    const root = arm.rig.root;
    const handTurn = Cq.clone().multiply(root.getWorldQuaternion(q())).multiply(arm.handMap);
    const target = arm.wristAt.clone().applyMatrix4(root.matrixWorld).applyMatrix4(C);
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
}
