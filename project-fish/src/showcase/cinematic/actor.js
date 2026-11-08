// The film's cast and props: a copy of the soldier (assets/soldier.glb) in
// an outfit (the player's, or the enemy's), his moves, and a PF-9
// (assets/pistol.glb) with its moving slide and barrel.
//
// His moves are Mixamo clips retargeted onto his skeleton
// (tools/cinematic/retarget_mixamo.py, into assets/cinematic/
// soldier_clips.glb: one animation per clip, by name; see
// tools/cinematic/README.md). His body moves only by those clips: the film
// chooses them, trims them, times them, cross-fades them and places the
// whole of him. Nothing here poses a bone.
//
// A timeline is a list of segments, each one clip played from a clip time
// at a story time (see setTimeline). Each segment's hips' track is moved
// into the world (its place and turn) before it plays, so his model's root
// never moves, the mixer can cross-fade one segment into the next, and any
// moment can be posed on its own (pose(t) sets every action's time and
// weight, then updates the mixer by nothing).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { boneName, loadSoldier } from '../../soldier.js';
import { SOLDIER_SKY } from '../../world.js';
import { Outfit, Wardrobe } from '../../gear.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
export const PISTOL_MODEL = new URL('../../../assets/pistol.glb', import.meta.url);
export const CLIPS_FILE = new URL('../../../assets/cinematic/soldier_clips.glb', import.meta.url);

// The clips file, loaded once (it's only animation data) for every actor.
let clipsFile = null;
function loadClips() {
  if (!clipsFile) {
    clipsFile = loader.loadAsync(CLIPS_FILE.href);
    clipsFile.catch(() => { clipsFile = null; });
  }
  return clipsFile;
}

const HIP = 'CC_Base_Hip';
const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

// Where the PF-9 sits in his right hand (CC_Base_R_Hand's frame): the grip
// in his fist (his fingers round its front, the web of his hand just under
// the slide at the back, the index finger along the frame over the trigger
// guard), so the slide and the ejection port are clear above his hand; the
// bore 12° below the knuckles' line, which levels his aim in the pistol
// clips. Worked out from close-ups of his hand in every pistol clip (the
// knuckles never move against the hand bone, so it holds in every one;
// see tools/cinematic/README.md, The pistol in his hand).
export const GRIP = {
  position: new THREE.Vector3(-0.0222, 0.1146, 0.1055),
  rotation: new THREE.Euler(1.727, -0.0071, 0.0012, 'XYZ'),
};
GRIP.quaternion = new THREE.Quaternion().setFromEuler(GRIP.rotation);

// A placement on the ground: (x, z) and a turn about the upright (yaw,
// radians; 0 faces +Z, positive turns him to his left).
const placeMatrix = (x, z, yaw) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));

export class Actor {
  constructor({ renderer, envMap, gunEnv = envMap, wardrobe = null, name = 'soldier' }) {
    this.renderer = renderer;
    this.envMap = envMap;
    this.gunEnv = gunEnv;
    this.wardrobe = wardrobe || new Wardrobe(new Outfit());
    this.name = name;
    this.ownMaterials = new Set(); // materials made here (freed on dispose)
    this.shared = new Set(); // geometries, materials and textures shared with the game
    this.segments = [];
  }

  // Loads (or reuses) the soldier, his clips and a PF-9.
  async load() {
    const [{ gltf }, pistol, clipsGltf] = await Promise.all([loadSoldier(), loader.loadAsync(PISTOL_MODEL.href), loadClips()]);
    // His copy: its own bones; the game's geometry and textures, with its
    // own copies of the materials (lit by the film's sky).
    const model = (this.model = clone(gltf.scene));
    model.name = this.name;
    // (The game's own copy stands by the house and breathes in its idle, so
    // the copy starts where it is and as it's posed: put it back at the
    // origin with every node at the file's rest, which the clips are made
    // against; the bones no clip moves stay there.)
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    model.scale.set(1, 1, 1);
    const rest = new Map();
    gltf.scene.traverse((o) => {
      const a = gltf.parser.associations.get(o);
      if (a && a.nodes !== undefined) rest.set(o.name, gltf.parser.json.nodes[a.nodes]);
    });
    model.traverse((o) => {
      const n = o !== model && rest.get(o.name);
      if (!n) return;
      o.position.fromArray(n.translation || [0, 0, 0]);
      o.quaternion.fromArray(n.rotation || [0, 0, 0, 1]);
      o.scale.fromArray(n.scale || [1, 1, 1]);
    });
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
    this.mixer = new THREE.AnimationMixer(model);
    // The outfit: each piece's materials copied for the film too.
    this.dressed = this.wardrobe.dress(model, {
      prepare: (mesh) => {
        this.shared.add(mesh.geometry);
        mesh.material = [].concat(mesh.material).map((m) => this.ownMaterial(m));
        if (mesh.material.length === 1) mesh.material = mesh.material[0];
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      },
    }).catch((error) => console.warn('Cinematic: the outfit could not be put on', error));

    // The pistol: plain (no attachments), its round in the chamber left
    // out (the film shows its own).
    this.pistol = pistol.scene;
    this.pistol.name = this.name + '-pf9';
    this.pistolParts = {};
    this.pistol.traverse((o) => {
      if (o.name) this.pistolParts[o.name] = o;
      if (/^att_/.test(o.name) || o.name === 'chamber_round') o.visible = false;
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        for (const m of [].concat(o.material)) m.envMap = this.gunEnv;
      }
    });
    this.pistolRest = {};
    for (const name of ['slide', 'barrel', 'trigger']) {
      const p = this.pistolParts[name];
      if (p) this.pistolRest[name] = { position: p.position.clone(), quaternion: p.quaternion.clone() };
    }

    // The clips, their tracks renamed to this copy's bones (by name without
    // the number his skeleton adds; unknown bones dropped).
    this.clips = {};
    for (const anim of clipsGltf.animations) {
      const tracks = [];
      for (const track of anim.tracks) {
        const dot = track.name.lastIndexOf('.');
        const bone = this.bones[boneName(track.name.slice(0, dot))];
        if (!bone) continue;
        const t = track.clone();
        t.name = bone.name + track.name.slice(dot);
        tracks.push(t);
      }
      this.clips[anim.name] = new THREE.AnimationClip(anim.name, anim.duration, tracks);
    }
  }

  ownMaterial(m) {
    const c = m.clone();
    for (const key of Object.keys(c)) if (c[key] && c[key].isTexture) this.shared.add(c[key]);
    c.envMap = this.envMap;
    c.envMapIntensity = SOLDIER_SKY;
    this.ownMaterials.add(c);
    return c;
  }

  // The static frame of the hips' parent, in his model's root frame.
  hipParentMatrix() {
    const hip = this.bones[HIP];
    this.model.updateMatrixWorld(true);
    const rootInv = this.model.matrixWorld.clone().invert();
    return rootInv.multiply(hip.parent.matrixWorld.clone());
  }

  // A clip's hips at clip time t, in his model's frame, unplaced.
  clipHip(clip, t, A = this.hipParentMatrix()) {
    const track = clip.tracks.find((k) => k.name === this.bones[HIP].name + '.position');
    return new THREE.Vector3().fromArray(track.createInterpolant().evaluate(Math.min(Math.max(0, t), clip.duration))).applyMatrix4(A);
  }

  // Builds the actions for a timeline. Each segment:
  //   clip     the clip's name in the clips file
  //   start    when it starts, story seconds
  //   from     the clip time it starts at (seconds; default 0)
  //   to       the clip time it holds at once it gets there (default: the clip's end)
  //   loop     plays round and round instead (an idle)
  //   blend    seconds it cross-fades in over (0: a hard cut)
  //   yaw      the turn given to the whole clip (degrees, his left positive)
  //   place    where it goes: by default its hips (x, z) at `from` meet the
  //            segment before's hips at the same story time, or at that
  //            segment's clip time `alignPrev`; `sameAs: i` uses segment
  //            i's place (moved by `dx`, `dz`); `x`, `z` place it outright (with align: false)
  //   layer    plays over the others, only on bones matching `mask` (a
  //            RegExp of bone names), held at `from`, at `weight`, from
  //            start to `end` (fading over `blend`)
  // and stage: { x, z, yaw (radians) }, a move and turn of the whole timeline
  // in the world; with stage.anchor { segment, at, x, z }, the stage is
  // moved so that segment's hips at its clip time `at` land at (x, z).
  setTimeline(segments, stage = { x: 0, z: 0, yaw: 0 }) {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    const A = this.hipParentMatrix();
    const Ainv = A.clone().invert();
    // (Its turn alone: the frame may be scaled.)
    const qA = new THREE.Quaternion();
    A.decompose(new THREE.Vector3(), qA, new THREE.Vector3());
    const qAinv = qA.clone().invert();
    const hipName = this.bones[HIP].name;

    // Each segment's place, in the timeline's own frame.
    const placed = [];
    segments.forEach((s, i) => {
      const src = this.clips[s.clip];
      if (!src) throw new Error(`Cinematic: no clip "${s.clip}" in ${CLIPS_FILE.pathname}`);
      const yaw = (s.yaw || 0) * DEG;
      const qy = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
      let off = new THREE.Vector3(s.x || 0, 0, s.z || 0);
      const before = placed.filter((p) => !p.s.layer);
      if (s.sameAs !== undefined) off = placed[s.sameAs].off.clone().add(new THREE.Vector3(s.dx || 0, 0, s.dz || 0));
      else if (before.length && s.align !== false && !s.layer) {
        const p = before[before.length - 1];
        const pt = s.alignPrev !== undefined ? s.alignPrev : (p.s.from || 0) + (s.start - p.s.start);
        const prevHip = this.clipHip(p.src, pt, A).applyQuaternion(p.qy).add(p.off);
        const mine = this.clipHip(src, s.alignClip !== undefined ? s.alignClip : s.from || 0, A).applyQuaternion(qy);
        off = new THREE.Vector3(prevHip.x - mine.x, 0, prevHip.z - mine.z);
      }
      placed.push({ s, src, off, qy, yaw });
    });

    // The stage.
    let stageYaw = stage.yaw || 0, sx = stage.x || 0, sz = stage.z || 0;
    if (stage.anchor) {
      const p = placed[stage.anchor.segment];
      const h = this.clipHip(p.src, stage.anchor.at, A).applyQuaternion(p.qy).add(p.off).applyAxisAngle(UP, stageYaw);
      sx = stage.anchor.x - h.x;
      sz = stage.anchor.z - h.z;
    }
    this.stage = { x: sx, z: sz, yaw: stageYaw };
    const S = placeMatrix(sx, sz, stageYaw);

    this.segments = placed.map((p, i) => {
      const { s, src } = p;
      const M = S.clone().multiply(new THREE.Matrix4().compose(p.off, p.qy, new THREE.Vector3(1, 1, 1)));
      const qTurn = new THREE.Quaternion().setFromAxisAngle(UP, stageYaw + p.yaw);
      const tracks = [];
      for (const t of src.tracks) {
        const node = boneName(t.name.slice(0, t.name.lastIndexOf('.')));
        if (s.layer && !(s.mask && s.mask.test(node))) continue;
        if (!s.layer && t.name === hipName + '.position') {
          const v = new THREE.Vector3(), out = [];
          for (let k = 0; k < t.times.length; k++) {
            v.fromArray(t.values, k * 3).applyMatrix4(A).applyMatrix4(M).applyMatrix4(Ainv);
            out.push(v.x, v.y, v.z);
          }
          tracks.push(new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), out));
        } else if (!s.layer && t.name === hipName + '.quaternion') {
          const q = new THREE.Quaternion(), out = [];
          for (let k = 0; k < t.times.length; k++) {
            q.fromArray(t.values, k * 4).premultiply(qA).premultiply(qTurn).premultiply(qAinv);
            out.push(q.x, q.y, q.z, q.w);
          }
          tracks.push(new THREE.QuaternionKeyframeTrack(t.name, Array.from(t.times), out));
        } else tracks.push(t);
      }
      const clip = new THREE.AnimationClip(`${s.clip}#${i}`, src.duration, tracks);
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      action.weight = 0;
      return { s, src, action, matrix: M };
    });
  }

  // Raises the whole of him at times: lift { t0, dt, values, holdEnd }
  // (metres, every dt story seconds from t0; none before, and none after
  // unless holdEnd, when the last is held).
  setLift(lift) {
    this.lift = lift;
  }

  liftAt(t) {
    const L = this.lift;
    if (!L) return 0;
    const x = (t - L.t0) / L.dt, n = L.values.length;
    if (x <= 0) return 0;
    if (x >= n - 1) return L.holdEnd ? L.values[n - 1] : 0;
    const i = Math.floor(x), k = x - i;
    return L.values[i] + (L.values[i + 1] - L.values[i]) * k;
  }

  // Poses him at story time t (seconds), raised as setLift says (unless
  // `lifted` is false).
  pose(t, lifted = true) {
    this.model.position.y = lifted ? this.liftAt(t) : 0;
    const base = this.segments.filter((p) => !p.s.layer);
    base.forEach((p, i) => {
      const s = p.s, next = base[i + 1];
      let w = 1;
      if (i > 0) w = Math.min(w, s.blend ? smooth01((t - s.start) / s.blend) : t >= s.start ? 1 : 0);
      if (next) w = Math.min(w, next.s.blend ? 1 - smooth01((t - next.s.start) / next.s.blend) : t >= next.s.start ? 0 : 1);
      p.action.enabled = w > 0;
      p.action.weight = Math.max(0, w);
      const d = p.src.duration;
      let time = (s.from || 0) + (t - s.start);
      if (s.loop) time = ((time % d) + d) % d;
      p.action.time = Math.min(Math.max(time, 0), s.to ?? d);
    });
    for (const p of this.segments.filter((x) => x.s.layer)) {
      const s = p.s, b = s.blend || 0.1;
      const w = smooth01((t - s.start) / b) * (s.end !== undefined ? 1 - smooth01((t - s.end) / b) : 1);
      p.action.enabled = w > 0;
      p.action.weight = w * (s.weight || 1);
      p.action.time = s.from || 0;
    }
    this.mixer.update(0);
    this.model.updateMatrixWorld(true);
  }

  // The segment playing (the newest with any weight) at story time t.
  segmentAt(t) {
    const base = this.segments.filter((p) => !p.s.layer && p.s.start <= t);
    return base[base.length - 1] || this.segments[0];
  }

  // A bone's world position now.
  at(bone, out = new THREE.Vector3()) {
    return this.bones[bone].getWorldPosition(out);
  }

  // His right hand's world position and turn.
  hand(outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    this.bones.CC_Base_R_Hand.matrixWorld.decompose(outPos, outQuat, new THREE.Vector3());
    return { position: outPos, quaternion: outQuat };
  }

  // Where the PF-9 is when he holds it (grip: { position, quaternion } in
  // his hand bone's frame).
  gunInHand(grip = GRIP, outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    const { position, quaternion } = this.hand(outPos, outQuat);
    position.add(grip.position.clone().applyQuaternion(quaternion));
    quaternion.multiply(grip.quaternion);
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

  // His meshes (and his outfit's), for finding where a ray meets him.
  meshes() {
    const list = [];
    this.model.traverse((o) => {
      if (o.isMesh && o.visible) list.push(o);
    });
    return list;
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
        for (const v of Object.values(m)) if (v && v.isTexture && v !== this.envMap && v !== this.gunEnv) v.dispose();
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
