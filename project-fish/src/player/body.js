// The player's own body: the soldier model (src/soldier.js), standing where
// the player stands, so looking down shows his legs, boots and kit, and the
// sun casts his whole shadow.
//
// The camera sits a little behind his eyes, inside his head, so the parts
// that move with his head (head, helmet, glasses, eyes, head band) are left
// out of the picture but still cast their shadow. So are his sleeves and
// gloves for now (the hands holding the gun are the gun layer's).
//
// He follows the view: he faces where the camera looks, leans forward a
// little looking down (and back a little looking up), and his neck and head
// take the rest of the look up or down (seen in his shadow). His hips move
// to keep his eyes just in front of the camera, sliding back as you look down
// so the camera looks down past his chest rather than out of his collar, and
// his feet stay planted where they stand (two-bone leg IK).

import * as THREE from 'three';
import { bonesOf, firstPersonTag, loadSoldier } from '../soldier.js';
import { outdoorEnvironment, SOLDIER_SKY, SUN_DIRECTION } from '../world.js';
import { twoBoneIK } from './ik.js';
import { PLAYER } from '../shared/config.js';
import { isLow } from '../shared/movement.js';

// How far in front of the camera his eyes are (metres); and how much further
// back he goes as the view turns straight down.
const EYES_AHEAD = 0.1;
const DOWN_SLIDE = 0.18;
// How far he bends with the view (fraction of the look up or down, and the
// most, radians), shared between the lower, middle and upper spine.
const LEAN = { down: 0.15, up: 0.3, maxDown: 0.44, maxUp: 0.21 };
const SPINE = [['CC_Base_Waist', 0.3], ['CC_Base_Spine01', 0.3], ['CC_Base_Spine02', 0.4]];
const NECK = [['CC_Base_NeckTwist01', 0.3], ['CC_Base_NeckTwist02', 0.3], ['CC_Base_Head', 0.4]];
const LEGS = ['L', 'R'].map((s) => [`CC_Base_${s}_Thigh`, `CC_Base_${s}_Calf`, `CC_Base_${s}_Foot`]);
// Walking and running: two steps a cycle, as many steps a metre as the
// gun's bob (so the feet land with its footstep jolts); the part of the
// cycle each foot is on the ground (more walking slowly, less running), how
// high it lifts, how far the hips drop at each step, how far a foot goes
// either side of him at most (shorter strides make more steps), and how far
// he leans into it moving fast. In the air the feet tuck up.
// Sliding: where his feet go (metres ahead of where he is, and to his
// left), how far he leans back (radians), how low his hips can go, and how
// far further back his eyes are (so you look down past his chest).
const SLIDE_POSE = { lead: [0.8, 0.08], tucked: [0.35, -0.13], lean: -0.3, lowestHip: 0.14, back: 0.32 };
const GAIT = { stepsPerMetre: 0.75, stance: [0.6, 0.32], lift: [0.06, 0.12], bob: 0.018, maxStride: 0.36, tuck: 0.22, ease: 10, runLean: 0.12 };

// Leaves a material's mesh out of the picture, keeping its shadow: every
// vertex is put outside the view (the shadow is drawn with a material of its
// own, which this doesn't change).
function hideKeepingShadow(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tgl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
  };
  material.customProgramCacheKey = () => 'hidden-keep-shadow';
}

const turn = new THREE.Quaternion();
const parentTurn = new THREE.Quaternion();
const modelTurn = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);

// Turns a bone by `angle` about the model's own X axis (his left), from its
// rest pose, as seen in the world.
function bend(bone, rest, angle) {
  bone.parent.getWorldQuaternion(parentTurn);
  turn.setFromAxisAngle(AXIS_X, angle).premultiply(modelTurn).multiply(modelTurn.clone().invert());
  bone.quaternion.copy(parentTurn).invert().multiply(turn).multiply(parentTurn).multiply(rest);
}

export class PlayerBody {
  // wardrobe: the Wardrobe (src/gear.js) that dresses him in the chosen
  // outfit (optional).
  constructor(scene, renderer, camera, wardrobe = null) {
    this.model = null;
    this.wardrobe = wardrobe;
    // (The second copy of the model is for the arms holding the gun,
    // src/player/fpArms.js.)
    this.armsModel = null;
    this.ready = loadSoldier().then(({ player, arms }) => {
      this.armsModel = arms;
      return this.setUp(player, scene, renderer, camera);
    }).catch((error) => {
      console.warn('No body for the player (the soldier model didn\'t load).', error);
    });
  }

  setUp(model, scene, renderer, camera) {
    this.sky = outdoorEnvironment(renderer, SUN_DIRECTION);
    model.traverse((o) => {
      if (o.isMesh) this.prepareMesh(o);
    });
    this.bones = bonesOf(model);
    this.rest = new Map();
    for (const bone of Object.values(this.bones)) this.rest.set(bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone() });
    this.eyes = Object.values(this.bones).filter((b) => /_[LR]_Eye$/.test(b.name.replace(/_\d+$/, '')));
    this.hip = this.bones.CC_Base_Hip;
    this.legs = LEGS.map((names) => names.map((n) => this.bones[n]));
    this.model = model;
    return renderer.compileAsync(model, camera, scene).then(() => {
      scene.add(model);
      // His outfit: a new piece gets his materials' set-up, shows as he does
      // (first person or from outside, shown or left out), and its materials
      // are made ready before it goes on.
      if (this.wardrobe) {
        this.wardrobe.dress(model, {
          prepare: (mesh) => {
            this.prepareMesh(mesh);
            mesh.material = this.outside ? mesh.userData.materials.outside : mesh.userData.materials.firstPerson;
            mesh.visible = this.shown !== false;
            return renderer.compileAsync(mesh, camera, scene);
          },
          hide: (mesh, hidden) => {
            mesh.visible = this.shown !== false && !hidden;
          },
        });
      }
    });
  }

  // A mesh of his (or a piece of gear put on him): its own copies of the
  // materials, lit by the sky; in first person the parts tagged for it
  // (his head, what's on it, his arms) are left out of the picture but
  // still cast their shadow, and seen from outside (photo mode) all of him
  // shows (see setFirstPerson).
  prepareMesh(o) {
    const shown = [].concat(o.material).map((m) => {
      const own = m.clone();
      own.envMap = this.sky;
      own.envMapIntensity = SOLDIER_SKY;
      return own;
    });
    let firstPerson = shown.map((m) => {
      if (!firstPersonTag(o)) return m;
      const hidden = m.clone();
      hideKeepingShadow(hidden);
      return hidden;
    });
    if (firstPerson.length === 1) firstPerson = firstPerson[0];
    o.material = firstPerson;
    o.userData.materials = { firstPerson, outside: shown.length === 1 ? shown[0] : shown };
    o.castShadow = o.receiveShadow = true;
    o.frustumCulled = false;
  }

  // feet: where the player stands (world); yaw, pitch: where they look;
  // player: the movement state (crouching lowers his hips; sliding, lying,
  // diving and climbing aren't posed yet, so he's left out then).
  update(feet, yaw, pitch, player = null, dt = 0, eye = player ? player.eye : PLAYER.eyeHeight) {
    const model = this.model;
    if (!model) return;
    // The walking cycle.
    const speed = player && player.grounded ? Math.hypot(player.vx, player.vz) : 0;
    // (At low speeds a foot stays down so long that a full stride would be
    // too long: the cycle shortens so each step is no longer than he can
    // take, still keeping the planted foot put.)
    const stanceNow = THREE.MathUtils.lerp(GAIT.stance[0], GAIT.stance[1], THREE.MathUtils.clamp(speed / 5, 0, 1));
    this.cycle = Math.min(2 / GAIT.stepsPerMetre, (GAIT.maxStride * 2) / stanceNow);
    this.phase = (this.phase || 0) + (speed * dt * 2 * Math.PI) / this.cycle;
    const k = 1 - Math.exp(-dt * GAIT.ease);
    this.walk = (this.walk || 0) + ((speed > 0.3 ? 1 : 0) - (this.walk || 0)) * k;
    this.air = (this.air || 0) + ((player && !player.grounded && player.move !== 'mantle' ? 1 : 0) - (this.air || 0)) * k;
    if (speed > 0.3) this.heading = Math.atan2(player.vx, player.vz);
    // (Still placed when he's left out, so his shoulders stay where his arms
    // need them.)
    // Sliding he sits back on the ground, his lead leg out ahead and the
    // other bent under him.
    const sliding = Boolean(player && player.move === 'slide');
    const posed = !player || sliding || !(isLow(player) || player.move === 'mantle');
    this.setShown(posed || this.outside);
    const crouch = Math.max(0, PLAYER.eyeHeight - eye); // (the camera's eye height this frame)
    model.position.copy(feet);
    model.rotation.set(0, yaw + Math.PI, 0); // he faces +Z
    for (const [bone, rest] of this.rest) {
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
    }
    model.updateMatrixWorld(true);
    model.getWorldQuaternion(modelTurn);
    // Where his feet stand (as they do at rest), to keep them there; walking,
    // each in turn is planted (going back under him as he moves on, at his
    // speed, so it stays put on the ground) and then swung forward, lifted.
    const planted = this.legs.map(([, , foot]) => ({ position: foot.getWorldPosition(new THREE.Vector3()), quaternion: foot.getWorldQuaternion(new THREE.Quaternion()) }));
    let hipBob = 0;
    if (this.walk > 0.01 || this.air > 0.01) {
      const run = THREE.MathUtils.clamp(speed / 5, 0, 1);
      const stance = THREE.MathUtils.lerp(GAIT.stance[0], GAIT.stance[1], run);
      const stride = this.cycle * stance; // how far a foot goes back while it's down
      const lift = THREE.MathUtils.lerp(GAIT.lift[0], GAIT.lift[1], run) * (player && player.stance === 'crouch' ? 0.6 : 1);
      const dir = new THREE.Vector3(Math.sin(this.heading || 0), 0, Math.cos(this.heading || 0));
      planted.forEach((foot, i) => {
        const t = ((this.phase / (2 * Math.PI) + i * 0.5) % 1 + 1) % 1; // 0..1 through this foot's cycle
        let along;
        let up = 0;
        if (t < stance) {
          along = stride * (0.5 - t / stance); // on the ground, going back under him
          hipBob += Math.sin((Math.PI * t) / stance) * 0.5;
        } else {
          const u = (t - stance) / (1 - stance);
          along = stride * (-0.5 + (1 - Math.cos(Math.PI * u)) / 2); // swung forward
          up = Math.sin(Math.PI * u) * lift;
        }
        foot.position.addScaledVector(dir, along * this.walk * (1 - this.air)).add(new THREE.Vector3(0, up * this.walk * (1 - this.air) + GAIT.tuck * this.air * (i ? 0.7 : 1), 0));
      });
    }

    // Leaning with the view (forward is a turn about his left, +X); the neck
    // and head take the rest of it.
    if (sliding) {
      const ahead = new THREE.Vector3(Math.sin(this.heading || yaw + Math.PI), 0, Math.cos(this.heading || yaw + Math.PI));
      const side = new THREE.Vector3(ahead.z, 0, -ahead.x);
      planted.forEach((foot, i) => {
        const [out, across] = i === 0 ? SLIDE_POSE.lead : SLIDE_POSE.tucked;
        foot.position.set(feet.x, feet.y + 0.12, feet.z).addScaledVector(ahead, out).addScaledVector(side, across);
      });
    }
    // (Moving fast, he leans into it a little.)
    const runLean = GAIT.runLean * (this.walk || 0) * THREE.MathUtils.clamp((speed - 2) / 5, 0, 1);
    const lean = sliding ? SLIDE_POSE.lean : (pitch < 0 ? Math.min(LEAN.maxDown, -pitch * LEAN.down) : -Math.min(LEAN.maxUp, pitch * LEAN.up)) + runLean;
    const neckTurn = -pitch - lean;
    for (const [name, share] of SPINE) {
      const bone = this.bones[name];
      if (bone) bend(bone, this.rest.get(bone).quaternion, lean * share);
      if (bone) bone.updateMatrixWorld(true);
    }

    // His eyes just in front of the camera (further back looking down), at
    // its side-to-side place: the hips carry him there.
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const eyes = new THREE.Vector3();
    for (const e of this.eyes) eyes.add(e.getWorldPosition(new THREE.Vector3()));
    if (this.eyes.length) eyes.divideScalar(this.eyes.length);
    const camera = new THREE.Vector3(feet.x, 0, feet.z);
    const want = camera.addScaledVector(forward, EYES_AHEAD - DOWN_SLIDE * Math.max(0, Math.sin(-pitch)) - (sliding ? SLIDE_POSE.back : 0));
    const shift = new THREE.Vector3(want.x - eyes.x, 0, want.z - eyes.z);
    if (shift.length() > 0.35) shift.setLength(0.35);
    const hipAt = this.hip.getWorldPosition(new THREE.Vector3()).add(shift);
    // If that stretches a leg past its reach, the hips drop a little.
    let drop = 0;
    for (let i = 0; i < 2; i++) {
      const [thigh, calf, foot] = this.legs[i];
      const reach = 0.995 * (calf.position.length() + foot.position.length()) * model.scale.x * this.boneScale(thigh);
      const thighAt = thigh.getWorldPosition(new THREE.Vector3()).add(shift);
      const to = planted[i].position;
      const across = Math.hypot(to.x - thighAt.x, to.z - thighAt.z);
      const down = thighAt.y - to.y;
      const most = Math.sqrt(Math.max(0, reach * reach - across * across));
      drop = Math.max(drop, down - most);
    }
    hipAt.y -= Math.max(drop, crouch) + GAIT.bob * hipBob * this.walk;
    hipAt.y = Math.max(hipAt.y, feet.y + SLIDE_POSE.lowestHip);
    this.hip.position.copy(this.hip.parent.worldToLocal(hipAt));
    this.hip.updateMatrixWorld(true);

    // The neck and head take the rest of the look (after placing him: his
    // eyes are placed as he leans, not as his head turns).
    for (const [name, share] of NECK) {
      const bone = this.bones[name];
      if (!bone) continue;
      bend(bone, this.rest.get(bone).quaternion, neckTurn * share);
      bone.updateMatrixWorld(true);
    }

    // Feet back where they stood.
    for (let i = 0; i < 2; i++) {
      const [thigh, calf, foot] = this.legs[i];
      twoBoneIK(thigh, calf, foot, planted[i].position);
      foot.parent.getWorldQuaternion(parentTurn);
      foot.quaternion.copy(parentTurn).invert().multiply(planted[i].quaternion);
      foot.updateMatrixWorld(true);
    }
  }

  // In first person (true) his head and arms are left out of the picture
  // (they still cast their shadow); seen from outside (photo mode) all of
  // him shows.
  setFirstPerson(on) {
    this.outside = !on;
    if (!this.model) return;
    this.model.traverse((o) => {
      if (o.isMesh && o.userData.materials) o.material = on ? o.userData.materials.firstPerson : o.userData.materials.outside;
    });
    if (!on) this.setShown(true);
  }

  // Shows or leaves out his body in the world (his arms, drawn in the gun
  // layer, use its bones either way).
  setShown(shown) {
    if (this.shown === shown) return;
    this.shown = shown;
    this.model.traverse((o) => {
      if (o.isMesh) o.visible = shown && !o.userData.gearHidden; // (his own gear, when something else is worn)
    });
  }

  // The world scale of a bone's parent chain (the model's skeleton is in
  // centimetres under a scaled root).
  boneScale(bone) {
    if (this.scaleOf === undefined) {
      const s = new THREE.Vector3();
      bone.parent.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      this.scaleOf = s.x / this.model.scale.x;
    }
    return this.scaleOf;
  }
}
