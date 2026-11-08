// The film's cast and props: a copy of the soldier (assets/soldier.glb) in
// the player's outfit, his moves (the clips in the film's slots, see
// src/showcase/cinematic/edit.js and tools/cinematic/README.md), and the
// PF-9 (assets/pistol.glb) with its moving slide and barrel.
//
// His moves come from Mixamo clips retargeted onto his skeleton
// (tools/cinematic/retarget_mixamo.py). Every clip, and the stand-in for a
// slot whose clip hasn't been added yet (his idle, carried along the path
// the clip is planned to take), is turned into one frame of reference
// before it plays: his hips' track is moved to where that slot starts in
// the world. So he only ever has one place (his model's own root never
// moves), the mixer can cross-fade from one slot to the next, and any
// frame of the film can be posed on its own (pose(t) sets every action's
// time and weight, then updates the mixer by nothing).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { boneName, loadSoldier } from '../../soldier.js';
import { SOLDIER_SKY } from '../../world.js';
import { Outfit, Wardrobe } from '../../gear.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
export const PISTOL_MODEL = new URL('../../../assets/pistol.glb', import.meta.url);

const HIP = 'CC_Base_Hip';
// The bones an upper-body layer (a slot with layer: true) moves: the spine
// from the waist up, the head, the arms and the hands.
const UPPER = /^CC_Base_(Waist|Spine0[12]|NeckTwist0[12]|Head|[LR]_(Clavicle|Upperarm|UpperarmTwist0[12]|Forearm|ForearmTwist0[12]|ElbowShareBone|Hand|Thumb[123]|Index[123]|Mid[123]|Ring[123]|Pinky[123]))$/;

// Where the PF-9 sits in his right hand: its position and turn in the
// hand bone's frame (the grip in his palm, the muzzle past his knuckles).
// Measured by eye against his hand's mesh (see tools/cinematic/README.md).
export const GRIP = {
  position: new THREE.Vector3(0.012, 0.086, 0.028),
  rotation: new THREE.Euler(-1.45, 0.06, 1.62, 'XYZ'),
};

// A slot's placement: where it starts on the ground (x, z), the way he
// faces (yaw: 0 is +Z) and, for a slot without its clip, how far it's
// planned to take him (in his own frame: +Z forward, +X his left) and how
// far he turns.
export function placement(x, z, yaw) {
  return { x, z, yaw };
}
const yawToQuat = (yaw, out = new THREE.Quaternion()) => out.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
// A placement moved on by (dx, dz) in its own frame and turned by turn.
export function advance(p, dx, dz, turn) {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return { x: p.x + c * dx + s * dz, z: p.z - s * dx + c * dz, yaw: p.yaw + turn };
}
// The inverse: where it was before such a move.
export function retreat(p, dx, dz, turn) {
  const yaw = p.yaw - turn;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: p.x - (c * dx + s * dz), z: p.z - (-s * dx + c * dz), yaw };
}

export class Actor {
  constructor({ renderer, envMap, wardrobe = null }) {
    this.renderer = renderer;
    this.envMap = envMap;
    this.wardrobe = wardrobe || new Wardrobe(new Outfit());
    this.ownMaterials = new Set(); // materials made here (freed on dispose)
    this.shared = new Set(); // geometries, materials and textures shared with the game
  }

  // Loads (or reuses) the soldier and the PF-9; files: clip files by slot id.
  async load(slots) {
    const [{ gltf }, pistol] = await Promise.all([loadSoldier(), loader.loadAsync(PISTOL_MODEL.href)]);
    // His copy: its own bones; the game's geometry and textures, with its
    // own copies of the materials (lit by the film's sky).
    const model = (this.model = clone(gltf.scene));
    model.name = 'soldier';
    model.traverse((o) => {
      if (!o.isMesh) return;
      this.shared.add(o.geometry);
      o.material = [].concat(o.material).map((m) => this.ownMaterial(m));
      if (o.material.length === 1) o.material = o.material[0];
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;
    });
    this.bones = {};
    model.traverse((o) => {
      if (o.isBone) this.bones[boneName(o.name)] = o;
    });
    this.idle = gltf.animations[0];
    this.mixer = new THREE.AnimationMixer(model);
    // The outfit: each piece's materials copied for the film too.
    this.dressed = this.wardrobe.dress(model, {
      prepare: (mesh) => {
        this.shared.add(mesh.geometry);
        mesh.material = [].concat(mesh.material).map((m) => this.ownMaterial(m));
        if (mesh.material.length === 1) mesh.material = mesh.material[0];
      },
    }).catch((error) => console.warn('Cinematic: the outfit could not be put on', error));

    // The pistol: plain (no attachments), its round in the chamber left
    // out (the film shows its own).
    this.pistol = pistol.scene;
    this.pistol.name = 'pf9';
    this.pistolParts = {};
    this.pistol.traverse((o) => {
      if (o.name) this.pistolParts[o.name] = o;
      if (/^att_/.test(o.name) || o.name === 'chamber_round') o.visible = false;
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        for (const m of [].concat(o.material)) m.envMap = this.envMap;
      }
    });
    this.pistolRest = {};
    for (const name of ['slide', 'barrel', 'trigger']) {
      const p = this.pistolParts[name];
      if (p) this.pistolRest[name] = { position: p.position.clone(), quaternion: p.quaternion.clone() };
    }

    // The clips that have been added.
    this.clips = {};
    await Promise.all(slots.filter((s) => s.file).map(async (slot) => {
      try {
        const file = await loader.loadAsync(String(slot.file));
        const clip = file.animations[0];
        if (!clip) throw new Error('no animation in ' + slot.file);
        this.clips[slot.id] = this.adoptClip(clip, slot);
      } catch (error) {
        console.warn(`Cinematic: the ${slot.id} clip couldn't be loaded; its stand-in plays instead.`, error);
      }
    }));
  }

  ownMaterial(m) {
    const c = m.clone();
    for (const key of Object.keys(c)) if (c[key] && c[key].isTexture) this.shared.add(c[key]);
    c.envMap = this.envMap;
    c.envMapIntensity = SOLDIER_SKY;
    this.ownMaterials.add(c);
    return c;
  }

  // A loaded clip's tracks, renamed to his bones (by name without the
  // number his skeleton adds; unknown bones dropped), trimmed and with only
  // the upper body for a layer.
  adoptClip(clip, slot) {
    const tracks = [];
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const node = boneName(track.name.slice(0, dot));
      const bone = this.bones[node];
      if (!bone) continue;
      if (slot.layer && !UPPER.test(node)) continue;
      const t = track.clone();
      t.name = bone.name + track.name.slice(dot);
      tracks.push(t);
    }
    let out = new THREE.AnimationClip(slot.id, clip.duration, tracks);
    if (slot.trim) out = THREE.AnimationUtils.subclip(out, slot.id, Math.round(slot.trim[0] * 30), Math.round(slot.trim[1] * 30), 30);
    return out;
  }

  // The static frame of the hips' parent, in his model's root frame.
  hipParentMatrix() {
    const hip = this.bones[HIP];
    this.model.updateMatrixWorld(true);
    const rootInv = this.model.matrixWorld.clone().invert();
    return rootInv.multiply(hip.parent.matrixWorld.clone());
  }

  // How a clip carries him: his hips' ground position and heading at clip
  // time t, relative to its first frame (in the clip's frame).
  clipDrift(clip, t) {
    const pos = clip.tracks.find((k) => k.name === this.bones[HIP].name + '.position');
    if (!pos) return { dx: 0, dz: 0 };
    const A = this.hipParentMatrix();
    const at = (time) => {
      const v = new THREE.Vector3();
      const interp = pos.createInterpolant();
      v.fromArray(interp.evaluate(Math.min(time, clip.duration)));
      return v.applyMatrix4(A);
    };
    const a = at(0), b = at(t);
    return { dx: b.x - a.x, dz: b.z - a.z };
  }

  // Builds the actions for the film's slots, each placed where it starts
  // (slot.place: { x, z, yaw }) with its start in the story (slot.start,
  // seconds) and how long it plays (slot.length). A slot without a clip
  // gets a stand-in: his idle, carried along its planned path
  // (slot.travel [dx, dz] and slot.turn, over its length).
  setUp(slots) {
    this.mixer.stopAllAction();
    this.actions = [];
    const A = this.hipParentMatrix();
    const Ainv = A.clone().invert();
    const qA = new THREE.Quaternion().setFromRotationMatrix(A);
    const qAinv = qA.clone().invert();
    const hipName = this.bones[HIP].name;
    for (const slot of slots) {
      const own = this.clips[slot.id];
      if (!own && slot.layer) continue; // (a layer without its clip adds nothing)
      const source = own || this.idle;
      const tracks = [];
      let hipPos = null, hipRot = null;
      for (const t of source.tracks) {
        if (t.name === hipName + '.position') hipPos = t;
        else if (t.name === hipName + '.quaternion') hipRot = t;
        else tracks.push(t);
      }
      const length = slot.length;
      // Where the slot's frame is at clip time t.
      const frameAt = (t) => {
        if (own) return slot.place;
        const k = Math.min(1, Math.max(0, t / length));
        const e = slot.ease ? slot.ease(k) : k;
        return advance(slot.place, slot.travel[0] * e, slot.travel[1] * e, (slot.turn || 0) * e);
      };
      // The hips' track, moved into the world (sampled at 30 a second; a
      // clip keeps its own keys).
      if (hipPos && !slot.layer) {
        const times = own ? Array.from(hipPos.times) : Array.from({ length: Math.ceil(length * 30) + 1 }, (_, i) => i / 30);
        const ip = hipPos.createInterpolant(), iq = hipRot ? hipRot.createInterpolant() : null;
        const pv = [], qv = [];
        const v = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), qy = new THREE.Quaternion();
        for (const time of times) {
          const src = own ? time : time % source.duration;
          const f = frameAt(time);
          yawToQuat(f.yaw, qy);
          m.compose(new THREE.Vector3(f.x, 0, f.z), qy, new THREE.Vector3(1, 1, 1));
          v.fromArray(ip.evaluate(src)).applyMatrix4(A).applyMatrix4(m).applyMatrix4(Ainv);
          pv.push(v.x, v.y, v.z);
          if (iq) {
            q.fromArray(iq.evaluate(src));
            q.premultiply(qA).premultiply(qy).premultiply(qAinv);
            qv.push(q.x, q.y, q.z, q.w);
          }
        }
        tracks.push(new THREE.VectorKeyframeTrack(hipName + '.position', times, pv));
        if (iq) tracks.push(new THREE.QuaternionKeyframeTrack(hipName + '.quaternion', times, qv));
      } else if (hipPos && slot.layer) {
        // (A layer leaves the hips to the slot under it.)
      }
      const clip = new THREE.AnimationClip(slot.id + (own ? '' : '-standin'), own ? source.duration : Math.max(length, source.duration), tracks);
      const action = this.mixer.clipAction(clip);
      action.setLoop(own ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      action.play();
      action.weight = 0;
      this.actions.push({ slot, action, own: !!own, speed: slot.speed || 1 });
    }
  }

  // Poses him at story time t (seconds).
  pose(t) {
    // Each slot's weight: in over its blend at its start, out as the next
    // comes in; the first holds before it, the last after it.
    const base = this.actions.filter((a) => !a.slot.layer);
    const weights = base.map((a, i) => {
      const s = a.slot;
      const next = base[i + 1];
      let w = 1;
      if (i > 0) w = Math.min(w, smooth01((t - s.start) / Math.max(1e-3, s.blend)));
      if (next) w = Math.min(w, 1 - smooth01((t - next.slot.start) / Math.max(1e-3, next.slot.blend)));
      return Math.max(0, w);
    });
    base.forEach((a, i) => {
      a.action.enabled = weights[i] > 0;
      a.action.weight = weights[i];
      a.action.time = Math.max(0, (t - a.slot.start) * a.speed + (a.own ? 0 : a.slot.idleFrom || 0));
      if (a.own) a.action.time = Math.min(a.action.time, a.action.getClip().duration);
    });
    for (const a of this.actions.filter((x) => x.slot.layer)) {
      const s = a.slot;
      const local = t - s.start;
      const w = smooth01(local / 0.15) * (1 - smooth01((local - s.length + 0.2) / 0.2));
      a.action.enabled = w > 0;
      a.action.weight = 20 * w;
      a.action.time = Math.min(Math.max(0, local), a.action.getClip().duration);
    }
    this.mixer.update(0);
    this.model.updateMatrixWorld(true);
  }

  // His right hand's world position and turn.
  hand(outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    this.bones.CC_Base_R_Hand.matrixWorld.decompose(outPos, outQuat, new THREE.Vector3());
    return { position: outPos, quaternion: outQuat };
  }

  // Where the PF-9 is when he holds it.
  gunInHand(outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    const { position, quaternion } = this.hand(outPos, outQuat);
    position.add(GRIP.position.clone().applyQuaternion(quaternion));
    quaternion.multiply(new THREE.Quaternion().setFromEuler(GRIP.rotation));
    return { position, quaternion };
  }

  // The PF-9's moving parts: the slide back (m), the barrel's travel and
  // tilt, the trigger pulled (0..1).
  setPistol({ slide = 0, barrel = null, trigger = 0 }, points) {
    const P = this.pistolParts, R = this.pistolRest;
    if (P.slide) P.slide.position.z = R.slide.position.z + slide;
    if (P.barrel && barrel) {
      const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), barrel.tilt);
      const pivot = points.barrel.pivot;
      P.barrel.position.copy(R.barrel.position).sub(pivot).applyQuaternion(turn).add(pivot);
      P.barrel.position.z += barrel.travel;
      P.barrel.quaternion.copy(turn).multiply(R.barrel.quaternion);
    }
    if (P.trigger) P.trigger.position.z = R.trigger.position.z + 0.004 * trigger;
  }

  // Frees what was made here (never the game's shared geometry, textures
  // or its own materials).
  dispose() {
    if (!this.model) return;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.wardrobe.undress(this.model);
    this.model.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
    });
    for (const m of this.ownMaterials) m.dispose();
    this.ownMaterials.clear();
    this.pistol.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) {
        for (const v of Object.values(m)) if (v && v.isTexture && v !== this.envMap) v.dispose();
        m.dispose();
      }
    });
    this.model = this.pistol = null;
  }
}

const smooth01 = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
