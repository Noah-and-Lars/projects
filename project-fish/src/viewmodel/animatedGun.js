// A gun that brings its own arms and animations (none in the game yet; kept
// for the next gun that comes with its own animated arms):
// one skeleton with the forearms, hands and gun on it, and clips made for
// it (idle, draw, hide, shoot, reload). The gun layer (viewmodel.js) puts it
// where the eye is and moves it with the same sway, bob, recoil, aiming and
// sprinting as the other guns; this plays its clips as the gun's state says.
//
// The clips are sampled, not played: each frame the gun layer says which one
// the gun is in and how far (the reload's progress, how far the switch has
// gone), so they always match the game's own timings. When that changes
// (from a reload to putting the gun away, say), the pose it was in fades out
// over a moment instead of jumping. Each shot plays the shoot clip from its
// start, added on top of whatever pose the gun is in (as how far the clip
// moves each bone from its first frame, the idle pose): so a shot that comes
// before the last one has settled kicks on from where that one has got to,
// instead of the gun snapping back to the idle pose first.
//
// The clips can't know the gun's state, so a few parts are set on top of
// them: the slide is held back once the last round has gone, and held home
// through a reload with rounds left (the clip's reload starts from empty,
// slide locked back); the slide stop comes up while it's locked back; the
// trigger comes back as it breaks; and the hammer falls on each shot and is
// cocked again by the slide going back over it.
//
// Sprinting, the hands bend at the wrists with the gun in them, as the other
// guns' do (bendWrists): the forearms stay where the clip has them.
//
// (The mixer only sets a bone when the clips move it from where they last
// put it, so the bones changed on top of them are put back where the clips
// had them before each frame's pose: see keep and putBack.)

import * as THREE from 'three';

// How long (seconds) the pose a clip was in takes to fade out when another
// takes over.
const FADE = 0.15;
// Reloading or being put away, any shot still playing fades out this
// quickly. (Drawn, it can fire once it's on target, before the draw has
// quite settled: a shot then plays on top of the draw.)
const SHOT_LEAVE = 0.1;
// How many shots can be playing at once (each lasts 0.33 s; one comes every
// 0.2 s at most).
const SHOT_SLOTS = 3;
// The moving parts: how far (radians, about the gun's X) the trigger turns
// back when it's pulled, the hammer falls from cocked, and the slide stop's
// back end lifts into the slide's notch when it's locked back.
const TRIGGER_TURN = -0.2;
const HAMMER_FALL = -0.85;
const STOP_LIFT = 0.12;

const ACROSS = new THREE.Vector3(1, 0, 0);
const turn = new THREE.Quaternion();
const m1 = new THREE.Matrix4();
const m2 = new THREE.Matrix4();
const bendAbout = new THREE.Matrix4();
const m3 = new THREE.Matrix4();
const inRoot = new THREE.Matrix4();
const parentInRoot = new THREE.Matrix4();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

// Sets a part `angle` radians about X from where it rests (its bone sits on
// its pivot).
function turnPart(part, rest, angle) {
  if (!part) return;
  part.position.copy(rest.position);
  part.quaternion.copy(rest.quaternion).multiply(turn.setFromAxisAngle(ACROSS, angle));
}
const restOf = (part) => part && { position: part.position.clone(), quaternion: part.quaternion.clone() };

export class AnimatedGun {
  // scene: the loaded model's scene (its root at the eye); animations: its
  // clips; model: its constants (bones, parts, points and event times).
  constructor(scene, animations, model) {
    this.model = model;
    this.root = scene;
    const bone = (key) => scene.getObjectByName(model.bones[key]) || null;
    this.frame = bone('frame');
    this.slide = bone('slide');
    this.trigger = bone('trigger');
    this.hammer = bone('hammer');
    this.slideStop = bone('slideStop');
    this.hands = { support: bone('supportHand'), shooting: bone('shootingHand') };
    this.armMeshes = model.meshes.arms.map((name) => scene.getObjectByName(name)).filter(Boolean);
    scene.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false; // (the clips move it far from where it was bound)
    });

    // Each clip has two actions: the one playing, and a copy for its pose
    // fading out after another clip takes over (it may be the same clip, from
    // another time). The shoot clip also has a few that add it on top (one
    // for each shot that may still be playing).
    this.mixer = new THREE.AnimationMixer(scene);
    const clips = {};
    for (const [key, name] of Object.entries(model.clips)) {
      const clip = animations.find((a) => a.name === name);
      if (clip) clips[key] = clip;
    }
    this.clips = clips;
    const action = (clip) => {
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
      a.weight = 0;
      return a;
    };
    const copy = (clip, suffix) => {
      const c = clip.clone();
      c.name = clip.name + suffix;
      return c;
    };
    this.actions = {};
    this.ghosts = {};
    for (const [key, clip] of Object.entries(clips)) {
      this.actions[key] = action(clip);
      this.ghosts[key] = action(copy(clip, '_fading'));
    }
    this.shots = [];
    if (clips.shoot) {
      for (let i = 0; i < SHOT_SLOTS; i++) {
        const added = THREE.AnimationUtils.makeClipAdditive(copy(clips.shoot, `_added${i}`), 0);
        const a = this.mixer.clipAction(added, null, THREE.AdditiveAnimationBlendMode);
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        a.play();
        a.weight = 0;
        this.shots.push({ action: a, time: Infinity, weight: 0 });
      }
    }
    this.newest = null;

    // Where the slide rests in the idle pose (it's held there through a
    // reload with rounds left).
    if (this.actions.idle) {
      this.actions.idle.weight = 1;
      this.mixer.update(0);
      this.actions.idle.weight = 0;
    }

    this.base = { clip: 'idle', time: 0, toIdle: 0 };
    this.ghost = null; // { clip, time, toIdle, weight }
    this.lowering = null; // the pose held while it's put away mid-reload (see update)
    this.slideMode = 'clip'; // how the slide was held last frame (see update)
    this.slideRest = restOf(this.slide);
    this.triggerRest = restOf(this.trigger);
    this.hammerRest = restOf(this.hammer);
    this.stopRest = restOf(this.slideStop);
    // The bones changed on top of the clips this frame, and for each bone
    // ever changed, where the clips had it (one record each, reused).
    this.kept = new Set();
    this.keptAt = new Map();
    this.lockHold = -Infinity; // how far back the locked slide is held (its z in the frame)
    this.hammerDown = 0; // 1 = fallen, 0 = cocked
    this.stopLift = 0;
    this.ok = Boolean(clips.idle && this.frame);
  }

  // Remembers where the clips put a bone, before it's changed on top of them.
  keep(bone) {
    if (!bone || this.kept.has(bone)) return;
    let was = this.keptAt.get(bone);
    if (!was) {
      was = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };
      this.keptAt.set(bone, was);
    }
    was.position.copy(bone.position);
    was.quaternion.copy(bone.quaternion);
    was.scale.copy(bone.scale);
    this.kept.add(bone);
  }

  // Puts the bones changed last frame back where the clips had them.
  putBack() {
    for (const bone of this.kept) {
      const was = this.keptAt.get(bone);
      bone.position.copy(was.position);
      bone.quaternion.copy(was.quaternion);
      bone.scale.copy(was.scale);
    }
    this.kept.clear();
  }

  // A clip's length (seconds).
  duration(key) {
    return this.clips[key] ? this.clips[key].duration : 0;
  }

  // Starts it afresh in `clip` at `time`, with nothing to fade from (it's
  // just been drawn, from out of view).
  reset(clip = 'idle', time = 0) {
    this.base.clip = clip;
    this.base.time = time;
    this.base.toIdle = 0;
    this.lowering = null;
    this.ghost = null;
    for (const s of this.shots) {
      s.time = Infinity;
      s.weight = 0;
    }
    this.newest = null;
    this.hammerDown = 0;
  }

  // A shot: the shoot clip from its start (in the slot that's been playing
  // longest, or is free).
  fire() {
    if (!this.shots.length) return;
    const slot = this.shots.reduce((a, s) => (s.time > a.time ? s : a));
    slot.time = 0;
    slot.weight = 1;
    this.newest = slot;
    this.hammerDown = 1;
  }

  // Poses the rig for this frame. clip, time: the clip it's in (idle,
  // reload, draw, hide) and how far (seconds). slide:
  // 'clip' (as the clip has it), 'home' (held forward) or 'locked' (held
  // back once it's gone back). triggerPull: how far the trigger is pulled
  // (0..1). toIdle: how far (0..1) the pose has gone from the clip's over to
  // the idle pose (a reload with rounds left leaves its clip before the end:
  // see MODEL23.reloadWithRounds). shotDt: the time the shots move on by
  // (real time, which the gun's fire rate keeps to, even when dt has been
  // cut short for a slow frame).
  update(dt, clip, time, slide = 'clip', triggerPull = 0, toIdle = 0, shotDt = dt) {
    if (!this.ok) return;
    this.slideMode = slide;
    const b = this.base;
    // Put away in the middle of a reload, the pose it's in is held (the gun
    // layer lowers it out of view as it does the other guns: see lowering).
    // Fading from it into the hide animation would swing the support hand,
    // down at the belt, up past the eye.
    if (clip === 'hide' && (this.lowering || b.clip === 'reload')) {
      if (!this.lowering) this.lowering = { clip: b.clip, time: b.time, toIdle: b.toIdle };
      ({ clip, time, toIdle } = this.lowering);
    } else this.lowering = null;
    if (!this.clips[clip]) clip = 'idle';
    const length = this.duration(clip);
    time = Math.min(Math.max(time, 0), Math.max(0, length - 1e-4));

    // Another clip, or a jump in this one: the old pose fades out.
    if (clip !== b.clip || time < b.time - 0.05 || time > b.time + 0.25) {
      this.ghost = { clip: b.clip, time: b.time, toIdle: b.toIdle, weight: 1 };
    }
    b.clip = clip;
    b.time = time;
    b.toIdle = clip === 'idle' ? 0 : THREE.MathUtils.clamp(toIdle, 0, 1);
    if (this.ghost) {
      this.ghost.weight -= dt / FADE;
      if (this.ghost.weight <= 0) this.ghost = null;
    }

    // The shots, each added in full till it's done (or fading out if the gun
    // is reloading or being put away).
    for (const s of this.shots) {
      s.time += shotDt;
      if (s.time >= this.duration('shoot')) s.weight = 0; // done: back where it was
      else if (clip !== 'idle' && clip !== 'draw') s.weight = Math.max(0, s.weight - dt / SHOT_LEAVE);
    }

    // Every action's weight and time: the clips' adding up to 1, the shots
    // added on top.
    // (The idle pose holds still, so an action set twice, idle's, just adds
    // up its weight.)
    for (const a of Object.values(this.actions)) a.weight = 0;
    for (const a of Object.values(this.ghosts)) a.weight = 0;
    const set = (a, t, w) => {
      a.enabled = true;
      a.time = Math.min(Math.max(t, 0), Math.max(0, a.getClip().duration - 1e-4));
      a.weight += w;
    };
    const fading = this.ghost ? this.ghost.weight * this.ghost.weight * (3 - 2 * this.ghost.weight) : 0;
    set(this.actions[clip], time, (1 - fading) * (1 - b.toIdle));
    if (b.toIdle) set(this.actions.idle, 0, (1 - fading) * b.toIdle);
    if (this.ghost) {
      const g = this.ghost;
      set(this.ghosts[g.clip], g.time, fading * (1 - g.toIdle));
      if (g.toIdle) set(this.ghosts.idle, 0, fading * g.toIdle);
    }
    for (const s of this.shots) {
      s.action.weight = 0;
      set(s.action, s.time, s.weight);
    }
    this.putBack();
    this.mixer.update(0);
    for (const part of [this.slide, this.trigger, this.hammer, this.slideStop]) this.keep(part);

    // The slide, held where the gun's state says.
    const S = this.slide;
    const travel = this.model.slideTravel;
    if (S && slide === 'home') {
      S.position.copy(this.slideRest.position);
      S.quaternion.copy(this.slideRest.quaternion);
    }
    if (S && slide === 'locked') {
      // (It goes back with the shot that emptied it, and stays there.)
      const shooting = this.newest && this.newest.time < this.model.events.shoot.slideBack;
      this.lockHold = Math.max(this.lockHold, shooting ? S.position.z : this.slideRest.position.z + travel);
      S.position.z = Math.max(S.position.z, this.lockHold);
    } else this.lockHold = -Infinity;
    // The reload animation eases the locked slide on another 17 mm as the
    // hands work, past where the slide stop holds it, so it would hang off
    // the back of the frame: it stays where it locked (and goes home when
    // the animation sends it forward past there, as the thumb drops it).
    if (S && clip === 'reload') S.position.z = Math.min(S.position.z, this.slideRest.position.z + travel);
    const back = S ? THREE.MathUtils.clamp((S.position.z - this.slideRest.position.z) / travel, 0, 1) : 0;

    // The hammer is cocked again as the slide goes back over it.
    this.hammerDown = Math.min(this.hammerDown, 1 - back);
    turnPart(this.hammer, this.hammerRest, HAMMER_FALL * this.hammerDown);
    turnPart(this.trigger, this.triggerRest, TRIGGER_TURN * triggerPull);
    this.stopLift += ((slide === 'locked' ? 1 : 0) - this.stopLift) * Math.min(1, dt * 40);
    turnPart(this.slideStop, this.stopRest, STOP_LIFT * this.stopLift);
  }

  // Bends both hands and the gun `angle` radians at the wrists, about the
  // line from the shooting hand's wrist to the support hand's (positive is
  // muzzle down), on top of the pose the clips gave them.
  bendWrists(angle) {
    const { shooting, support } = this.hands;
    if (!angle || !shooting || !support || !this.frame) return;
    const root = this.root;
    root.updateMatrixWorld(true);
    const toRoot = m1.copy(root.matrixWorld).invert();
    const right = v1.setFromMatrixPosition(shooting.matrixWorld).applyMatrix4(toRoot);
    const left = v2.setFromMatrixPosition(support.matrixWorld).applyMatrix4(toRoot);
    const axis = left.sub(right).normalize();
    // (In the root's space: about the line through the right wrist.)
    bendAbout.makeTranslation(right.x, right.y, right.z)
      .multiply(m2.makeRotationAxis(axis, angle))
      .multiply(m3.makeTranslation(-right.x, -right.y, -right.z));
    for (const bone of [shooting, support, this.frame]) {
      this.keep(bone);
      inRoot.multiplyMatrices(toRoot, bone.matrixWorld);
      parentInRoot.multiplyMatrices(toRoot, bone.parent.matrixWorld);
      parentInRoot.invert().multiply(bendAbout).multiply(inRoot).decompose(bone.position, bone.quaternion, bone.scale);
    }
    root.updateMatrixWorld(true);
  }
}
