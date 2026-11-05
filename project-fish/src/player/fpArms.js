// The soldier's own arms holding the gun in first person.
//
// The hands and fingers are still animated by the gun layer's hand rigs
// (src/viewmodel/handRig.js and the poses in viewmodel.js): every reload,
// inspect and grip shape is theirs. Each frame this puts the player body's
// (src/player/body.js) arm bones where those hands are: his hand where the
// rig's hand is (his middle knuckle on its middle knuckle), each of his
// finger bones turned as the rig's, and his upper arm and forearm by
// two-bone IK from his shoulder, the elbow hanging down and out. His sleeves
// and gloves are then drawn in the gun layer with those same bones (the
// same vertex data and skeleton as the body, nothing copied), so they hold
// the gun and never poke into walls; the body draws everything else and
// casts the whole shadow.
//
// If his arms can't reach where the hands are (looking up, mostly), the
// whole gun is drawn in towards his shoulders by the difference, so the
// hands never leave it.

import * as THREE from 'three';
import { firstPersonTag } from '../soldier.js';
import { twoBoneIK } from './ik.js';

const SIDES = { right: 'R', left: 'L' };
const DIGITS = ['Index', 'Mid', 'Ring', 'Pinky', 'Thumb']; // the rigs' chain order
const REACH = { start: 0.9, full: 0.97 }; // of his arm's length: pulling the gun in

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

export class FirstPersonArms {
  // body: the PlayerBody; viewmodel: the Viewmodel (its rigs and scene).
  constructor(body, viewmodel) {
    this.body = body;
    this.viewmodel = viewmodel;
    this.ready = false;
    this.meshes = [];
    this.pull = v();
  }

  // Once both are loaded: his arm bones, the calibration between his hands
  // and the rigs', and his arms in the gun layer. Returns whether it worked.
  setUp() {
    const { body, viewmodel } = this;
    if (!body.model || !viewmodel.shooter || !viewmodel.hand) return false;
    const B = body.bones;
    // His body at rest (as body.update leaves it before posing).
    for (const [bone, rest] of body.rest) {
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
    }
    body.model.updateMatrixWorld(true);
    this.arms = {};
    for (const [side, s] of Object.entries(SIDES)) {
      const bone = (n) => B[`CC_Base_${s}_${n}`];
      const rig = side === 'right' ? viewmodel.shooter : viewmodel.hand;
      const arm = {
        rig,
        upper: bone('Upperarm'),
        fore: bone('Forearm'),
        hand: bone('Hand'),
        shoulder: bone('UpperarmTwist01') || bone('Upperarm'),
        foreTwist: bone('ForearmTwist02'),
        digits: DIGITS.map((d) => [1, 2, 3].map((k) => bone(`${d}${k}`))),
      };
      if (!arm.upper || !arm.fore || !arm.hand || arm.digits.some((d) => d.some((b) => !b))) return false;
      arm.foreTwistRest = arm.foreTwist ? arm.foreTwist.quaternion.clone() : null;
      // His hand: where its knuckles are, in its own frame (metres).
      const handPos = arm.hand.getWorldPosition(v());
      const handTurn = arm.hand.getWorldQuaternion(q());
      const local = (b) => b.getWorldPosition(v()).sub(handPos).applyQuaternion(handTurn.clone().invert());
      const hisMid = local(arm.digits[1][0]);
      const hisAlong = hisMid.clone();
      const hisAcross = local(arm.digits[3][0]).sub(local(arm.digits[0][0]));
      // The rig's hand as modelled, in its wrist's frame (it rests unturned).
      const rest = rig.rest;
      const knuckle = (c) => rest.fingers[c].joints[0].clone().sub(rest.wrist);
      const ourAlong = knuckle(1);
      const ourAcross = knuckle(3).sub(knuckle(0));
      // His hand's frame in the rig's: lines up the knuckle rows.
      arm.handMap = frame(ourAlong, ourAcross).multiply(frame(hisAlong, hisAcross).invert());
      // Where his wrist goes in the rig's wrist frame: his middle knuckle on
      // the rig's.
      arm.wristAt = knuckle(1).sub(hisMid.clone().applyQuaternion(arm.handMap));
      // Each finger bone: its turn relative to the rig's matching bone, so
      // it points where the rig's finger points.
      arm.fingerMap = arm.digits.map((bones, c) => bones.map((b, k) => {
        const chain = c === 4 ? rest.thumb : rest.fingers[c];
        const ourDir = chain.joints[k + 1].clone().sub(chain.joints[k]);
        const next = k < 2 ? bones[k + 1] : null;
        const hisDir = next ? local(next).sub(local(b)) : local(b).sub(local(bones[k - 1]));
        const hisTurn = handTurn.clone().invert().multiply(b.getWorldQuaternion(q())); // in his hand's frame
        const mapped = arm.handMap.clone().multiply(hisTurn); // in the rig's wrist frame
        const fix = q().setFromUnitVectors(hisDir.clone().applyQuaternion(arm.handMap).normalize(), ourDir.normalize());
        return fix.multiply(mapped); // the rig's bone rests unturned in its wrist frame
      }));
      arm.reach = arm.upper.getWorldPosition(v()).distanceTo(arm.fore.getWorldPosition(v()))
        + arm.fore.getWorldPosition(v()).distanceTo(handPos);
      this.arms[side] = arm;
    }
    // His sleeves and gloves in the gun layer, with the body's bones.
    body.model.traverse((o) => {
      if (!o.isSkinnedMesh || firstPersonTag(o) !== 'arms') return;
      const material = [].concat(o.material).map((m) => {
        const own = m.clone();
        delete own.onBeforeCompile; // drawn, unlike the body's (shadow-only) copy
        delete own.customProgramCacheKey;
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

  // camera: the world camera, after it's placed for this frame. Runs after
  // the viewmodel and the body have been updated.
  update(camera) {
    if (!this.ready && !this.setUp()) return;
    const { viewmodel } = this;
    camera.updateMatrixWorld();
    const C = camera.matrixWorld;
    const Cq = camera.getWorldQuaternion(q());
    const toView = C.clone().invert();

    // How far each hand is past his reach: draw the gun in by that much.
    viewmodel.scene.updateMatrixWorld(true);
    const pull = v();
    for (const arm of Object.values(this.arms)) {
      const shoulder = arm.upper.getWorldPosition(v()).applyMatrix4(toView);
      const wrist = arm.wristAt.clone().applyMatrix4(arm.rig.root.matrixWorld);
      const d = wrist.distanceTo(shoulder);
      const k = THREE.MathUtils.smoothstep(d / arm.reach, REACH.start, REACH.full + 0.02);
      const excess = Math.max(0, d - arm.reach * REACH.start) * k;
      // (The support hand only pulls while it's on the gun.)
      const w = arm.rig === viewmodel.shooter ? 1 : viewmodel.supportOnGun ? 1 : 0;
      pull.addScaledVector(shoulder.sub(wrist).normalize(), excess * w);
    }
    if (pull.length() > 0.25) pull.setLength(0.25);
    this.pull.lerp(pull, 0.5);
    viewmodel.holder.position.add(this.pull);
    viewmodel.scene.updateMatrixWorld(true);

    for (const arm of Object.values(this.arms)) {
      const root = arm.rig.root;
      // His hand: where the rig's is.
      const handTurn = Cq.clone().multiply(root.getWorldQuaternion(q())).multiply(arm.handMap);
      const target = arm.wristAt.clone().applyMatrix4(root.matrixWorld).applyMatrix4(C);
      // The elbow hangs down and out to his side.
      const shoulder = arm.upper.getWorldPosition(v());
      const out = v(arm.rig === viewmodel.shooter ? 1 : -1, -1.4, 0.35).applyQuaternion(Cq);
      const pole = shoulder.clone().lerp(target, 0.5).addScaledVector(out.normalize(), 0.3);
      twoBoneIK(arm.upper, arm.fore, arm.hand, target, pole);
      // The hand turned as the rig's (its forearm twists to share it).
      const foreTurn = arm.fore.getWorldQuaternion(q());
      arm.hand.quaternion.copy(foreTurn.clone().invert().multiply(handTurn));
      arm.hand.updateMatrixWorld(true);
      if (arm.foreTwist && arm.foreTwistRest) {
        // Half the hand's twist about the forearm goes into the lower
        // forearm, so the cuff turns with the wrist.
        const axis = arm.hand.position.clone().normalize();
        const local = arm.hand.quaternion;
        const twist = q().set(axis.x * (local.x * axis.x + local.y * axis.y + local.z * axis.z), axis.y * (local.x * axis.x + local.y * axis.y + local.z * axis.z), axis.z * (local.x * axis.x + local.y * axis.y + local.z * axis.z), local.w).normalize();
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
    // His arms drawn in the gun layer: the world as the camera sees it.
    for (const mesh of this.meshes) {
      mesh.matrix.copy(toView);
      mesh.matrixWorld.copy(toView);
    }
  }
}

