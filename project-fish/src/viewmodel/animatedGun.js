// A gun that brings its own arms and animations (the Beretta 92FS, see
// beretta.js, the FN 502, fn502.js, and the Browning Hi-Power, hipistol.js):
// one skeleton with the forearms,
// hands and gun on it, and the clips its maker made for it. The gun layer (viewmodel.js) puts it where
// the eye is and moves the whole rig with the same sway, bob, recoil kick,
// aiming and sprinting offsets as the other guns; this plays its clips as
// the gun's state says, as they were made.
//
// The clips it can have (a gun may lack any but idle; see has()):
// - idle: the pose it rests in: a still, or a loop (its maker's breathing,
//   longer than a still: see STILL). idleEmpty: the same with the slide
//   locked back on an empty magazine (where shootLast ends).
// - draw, hide: taking it out and putting it away. Without them, the gun
//   layer lowers and raises the whole rig as it does the other guns, held in
//   its rest pose (idle, or idleEmpty).
// - shoot: one shot, from the idle pose back to it. shootLast: the last
//   round, ending with the slide locked back. Each shot plays it from the
//   moment the shot goes off (model.events.shoot.fire), so the kick comes
//   with the flash.
// - reload (with rounds left) and reloadEmpty (from empty, slide locked back
//   at the start). With only one, it plays for both.
// - inspect.
// - walk, run: loops of the hands' sway as the player walks and runs (each
//   starting and ending in the idle pose). Played in place of the idle pose
//   (not idleEmpty) as much as the player is walking or running.
// - aimIdle, aimWalk, aimShoot: the same held up to the sights, for a gun
//   whose maker made its aiming too. Each is played in place of its clip
//   (idle, walk, shoot; at the same time into it) as much as the gun layer
//   has the gun up to the sights (the state's aim), so it blends in with
//   the gun layer's own move up to the sights. A gun without them is aimed
//   by the gun layer alone.
//
// The clips are sampled, not played: each frame the gun layer says which one
// the gun is in and how far (the reload's progress, how far the switch has
// gone), so they always match the game's own timings, which are each clip's
// own length. When that changes (from a reload to putting the gun away,
// say), the pose it was in fades out over a moment instead of jumping.
//
// Opt-in extras, for a gun whose clips can't show its state (model.overrides,
// all off unless a gun asks for them; no gun does now): `slide` (the slide
// held back once the last round has gone, and home through a reload with
// rounds left), `trigger` (pulled back as it breaks), `hammer` (falls on
// each shot, cocked again by the slide), `slideStop` (up while the slide is
// locked back), `additiveShots` (each shot's clip added on top of whatever
// pose the gun is in, rather than played from its start) and `bendWrists`
// (sprinting, the hands bend at the wrists with the gun, as the other guns'
// do).
//
// (The mixer only sets a bone when the clips move it from where they last
// put it, so the bones changed on top of them are put back where the clips
// had them before each frame's pose: see keep and putBack.)

import * as THREE from 'three';

// How long (seconds) the pose a clip was in takes to fade out when another
// takes over; when a shot starts, a little quicker (its first frame is
// nearly the idle pose, and a slower fade would soften the kick).
const FADE = 0.15;
const SHOT_FADE = 0.05;
// (additiveShots) Reloading or being put away, any shot still playing fades
// out this quickly; and how many shots can be playing at once.
const SHOT_LEAVE = 0.1;
const SHOT_SLOTS = 3;
// (trigger, hammer, slideStop) How far (radians, about the gun's X) the
// trigger turns back when it's pulled, the hammer falls from cocked, and the
// slide stop's back end lifts into the slide's notch when it's locked back.
const TRIGGER_TURN = -0.2;
const HAMMER_FALL = -0.85;
const STOP_LIFT = 0.12;

// The clip played instead when a gun hasn't one.
const STAND_IN = { idleEmpty: 'idle', shootLast: 'shoot', reloadEmpty: 'reload' };
// The loops played in place of the idle pose walking and running.
const LOOPS = ['walk', 'run'];
// The clips aimed variants can stand in for (see aimIdle above).
const AIMED = { idle: 'aimIdle', walk: 'aimWalk', shoot: 'aimShoot' };
// A rest clip (idle, idleEmpty, aimIdle) at most this long (seconds) is a
// still, held at its start; a longer one loops.
const STILL = 0.1;

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
// Adds weight `w` to an action at `t` seconds into its clip. (A still holds
// still, so an action set twice just adds up its weight.)
function setAction(a, t, w) {
  a.enabled = true;
  a.time = Math.min(Math.max(t, 0), Math.max(0, a.getClip().duration - 1e-4));
  a.weight += w;
}
const restOf = (part) => part && { position: part.position.clone(), quaternion: part.quaternion.clone() };

export class AnimatedGun {
  // scene: the loaded model's scene (its root at the eye); animations: its
  // clips; model: its constants (bones, clips, points and event times).
  constructor(scene, animations, model) {
    this.model = model;
    this.root = scene;
    this.extra = model.overrides || {};
    const bone = (key) => (model.bones[key] && scene.getObjectByName(model.bones[key])) || null;
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
    // another time).
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
    // (All of them, to zero each frame.)
    this.allActions = [...Object.values(this.actions), ...Object.values(this.ghosts)];
    // (additiveShots) A few actions adding the shoot clip on top, one for
    // each shot that may still be playing.
    this.shots = [];
    if (this.extra.additiveShots && clips.shoot) {
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
    // The shot playing (its clip from its start): { time, last } (last: it
    // emptied the gun, found on the next frame; null till then).
    this.shot = null;
    // (walk, run) How far into the loops (seconds), and how much of each is
    // played in place of the idle pose.
    this.loopTime = 0;
    this.loops = LOOPS.filter((key) => clips[key]);
    // Whether the slide was locked back last frame (see update).
    this.wasEmpty = false;
    // How far up to the sights the gun layer has it (0..1, see update).
    this.aim = 0;

    // The pose at rest (the opt-in parts' rest is where the idle pose has them).
    if (this.actions.idle) {
      this.actions.idle.weight = 1;
      this.mixer.update(0);
      this.actions.idle.weight = 0;
    }

    this.base = { clip: 'idle', time: 0, toIdle: 0, rest: 'idle' };
    this.ghost = null; // { clip, time, toIdle, rest, weight, fade }
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

  // Whether it has a clip of its own for `key` (draw, hide, inspect...).
  has(key) {
    return Boolean(this.clips[key]);
  }

  // The clip that plays for `key` (its own, or the one standing in for it).
  clipFor(key) {
    if (this.clips[key]) return key;
    const stand = STAND_IN[key];
    return stand && this.clips[stand] ? stand : 'idle';
  }

  // Whether it's in (or holding the pose of) a reload.
  get reloading() {
    return Boolean(this.lowering) || this.base.clip === 'reload' || this.base.clip === 'reloadEmpty';
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
    this.base.clip = this.clipFor(clip);
    this.base.time = time;
    this.base.toIdle = 0;
    this.lowering = null;
    this.ghost = null;
    this.shot = null;
    for (const s of this.shots) {
      s.time = Infinity;
      s.weight = 0;
    }
    this.newest = null;
    this.hammerDown = 0;
  }

  // A shot: the shoot clip from the moment the shot goes off.
  fire() {
    if (this.shots.length) {
      const slot = this.shots.reduce((a, s) => (s.time > a.time ? s : a));
      slot.time = 0;
      slot.weight = 1;
      this.newest = slot;
    } else if (this.clips.shoot) {
      this.shot = { time: 0, last: null };
    }
    this.hammerDown = 1;
  }

  // Poses the rig for this frame. state:
  // - clip, time: what the gun's state says it's doing (idle, draw, hide,
  //   reload, reloadEmpty, inspect) and how far into it (seconds); a shot
  //   playing takes the place of idle and draw.
  // - toIdle: how far (0..1) the pose has gone from the clip's over to the
  //   rest pose (an inspect cut short).
  // - empty: the slide is locked back on an empty magazine (the rest pose is
  //   idleEmpty, and a shot that has just emptied it plays shootLast).
  // - shotDt: the time a shot moves on by (real time, which the gun's fire
  //   rate keeps to, even when dt has been cut short for a slow frame).
  // - moving: { walk, run }, how much (0..1, eased) the player is walking
  //   and running (for the walk and run loops, if it has them).
  // - aim: how far (0..1, eased) the gun layer has brought it up to the
  //   sights (for the aimed clips, if it has them).
  // - (Opt-in extras) slide: 'clip' (as the clip has it), 'home' (held
  //   forward) or 'locked' (held back once it's gone back); triggerPull: how
  //   far the trigger is pulled (0..1).
  update(dt, { clip, time = 0, toIdle = 0, empty = false, shotDt = dt, moving = null, aim = 0, slide = 'clip', triggerPull = 0 }) {
    if (!this.ok) return;
    this.slideMode = slide;
    this.aim = THREE.MathUtils.clamp(aim, 0, 1);
    const b = this.base;
    // (The frame the last round goes, the gun says it's empty before its
    // shot has started: till then it stays in the idle pose, so shootLast
    // plays from that, as its maker made it.)
    const justEmptied = empty && !this.wasEmpty && !this.shot;
    this.wasEmpty = empty;
    const rest = empty && !justEmptied ? this.clipFor('idleEmpty') : 'idle';
    // Put away in the middle of a reload, the pose it's in is held (the gun
    // layer lowers it out of view as it does the other guns: see lowering).
    // Fading from it into the hide clip would swing the support hand, down
    // at the belt, up past the eye.
    if (clip === 'hide' && (this.lowering || this.reloading)) {
      if (!this.lowering) this.lowering = { clip: b.clip, time: b.time, toIdle: b.toIdle };
      ({ clip, time, toIdle } = this.lowering);
    } else this.lowering = null;

    // A shot plays its clip from where it goes off, in place of the rest
    // pose or the end of the draw.
    let fade = FADE;
    const shot = this.shot;
    if (shot) {
      if (shot.last === null) shot.last = empty;
      const key = this.clipFor(shot.last ? 'shootLast' : 'shoot');
      const events = (this.model.events || {})[key] || {};
      const t = (events.fire || 0) + shot.time;
      shot.time += shotDt;
      if (t >= this.duration(key) || (clip !== 'idle' && clip !== 'draw')) this.shot = null;
      else {
        if (b.clip !== key || t < b.time - 0.02) fade = SHOT_FADE;
        clip = key;
        time = t;
      }
    }
    // (Drawn or put away without a clip for it, it's held in its rest pose.)
    if (clip === 'idle' || ((clip === 'draw' || clip === 'hide') && !this.has(clip))) clip = rest;
    clip = this.clipFor(clip);
    const length = this.duration(clip);
    time = Math.min(Math.max(time, 0), Math.max(0, length - 1e-4));

    // Another clip, or a jump in this one: the old pose fades out.
    if (clip !== b.clip || time < b.time - 0.05 || time > b.time + 0.25) {
      this.ghost = { clip: b.clip, time: b.time, toIdle: b.toIdle, rest: b.rest, weight: 1, fade };
    }
    b.clip = clip;
    b.time = time;
    b.rest = rest;
    b.toIdle = clip === rest ? 0 : THREE.MathUtils.clamp(toIdle, 0, 1);
    if (this.ghost) {
      this.ghost.weight -= dt / this.ghost.fade;
      if (this.ghost.weight <= 0) this.ghost = null;
    }

    // (additiveShots) Each shot added in full till it's done, or fading out
    // if the gun is reloading or being put away.
    for (const s of this.shots) {
      s.time += shotDt;
      if (s.time >= this.duration('shoot')) s.weight = 0; // done: back where it was
      else if (clip !== rest && clip !== 'draw') s.weight = Math.max(0, s.weight - dt / SHOT_LEAVE);
    }

    // Every action's weight and time: the clips' adding up to 1 (and any
    // added shots on top).
    for (const a of this.allActions) a.weight = 0;
    const fading = this.ghost ? this.ghost.weight * this.ghost.weight * (3 - 2 * this.ghost.weight) : 0;
    this.loopTime += dt;
    const A = this.actions;
    if (clip === rest) this.restPose(A, rest, (1 - fading) * (1 - b.toIdle), moving);
    else this.play(A, clip, time, (1 - fading) * (1 - b.toIdle));
    if (b.toIdle) this.restPose(A, rest, (1 - fading) * b.toIdle, moving);
    if (this.ghost) {
      // (The pose fading out: its rest pose with the loops as they are now,
      // so a shot or reload started walking doesn't jump by the loop's sway.)
      const g = this.ghost;
      const G = this.ghosts;
      if (g.clip === g.rest) this.restPose(G, g.rest, fading * (1 - g.toIdle), moving);
      else this.play(G, g.clip, g.time, fading * (1 - g.toIdle));
      if (g.toIdle) this.restPose(G, g.rest, fading * g.toIdle, moving);
    }
    for (const s of this.shots) {
      s.action.weight = 0;
      setAction(s.action, s.time, s.weight);
    }
    this.putBack();
    this.mixer.update(0);
    this.setParts(dt, clip, slide, triggerPull);
  }

  // The rest pose `key` from the action set `actions` (the playing ones or
  // the fading copies), weighted `w`: the idle pose with the walk and run
  // loops in place of as much of it as the player is walking and running.
  // (A rest clip longer than a still loops.)
  restPose(actions, key, w, moving) {
    let left = w;
    if (key === 'idle' && moving) {
      for (const loop of this.loops) {
        const share = w * THREE.MathUtils.clamp(moving[loop] || 0, 0, 1);
        if (share <= 0) continue;
        this.play(actions, loop, this.loopTime % this.duration(loop), share);
        left -= share;
      }
    }
    const length = this.duration(key);
    this.play(actions, key, length > STILL ? this.loopTime % length : 0, Math.max(0, left));
  }

  // Clip `key` from `actions` at `time`, weighted `w`: with as much of that
  // in its aimed variant, if it has one, as the gun is up to the sights.
  play(actions, key, time, w) {
    const aimed = AIMED[key];
    const share = aimed && actions[aimed] ? this.aim : 0;
    if (share < 1) setAction(actions[key], time, w * (1 - share));
    if (share > 0) setAction(actions[aimed], time, w * share);
  }

  // The opt-in extras on the gun's parts (none unless model.overrides asks).
  setParts(dt, clip, slide, triggerPull) {
    const x = this.extra;
    const S = x.slide ? this.slide : null;
    if (S) this.keep(S);
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
    // (A reload clip that eases the locked slide on past where the slide
    // stop holds it would leave it hanging off the frame: it stays where it
    // locked.)
    if (S && clip.startsWith('reload')) S.position.z = Math.min(S.position.z, this.slideRest.position.z + travel);
    const back = S ? THREE.MathUtils.clamp((S.position.z - this.slideRest.position.z) / travel, 0, 1) : 0;

    if (x.hammer && this.hammer) {
      // The hammer is cocked again as the slide goes back over it.
      this.keep(this.hammer);
      this.hammerDown = Math.min(this.hammerDown, 1 - back);
      turnPart(this.hammer, this.hammerRest, HAMMER_FALL * this.hammerDown);
    }
    if (x.trigger && this.trigger) {
      this.keep(this.trigger);
      turnPart(this.trigger, this.triggerRest, TRIGGER_TURN * triggerPull);
    }
    if (x.slideStop && this.slideStop) {
      this.keep(this.slideStop);
      this.stopLift += ((slide === 'locked' ? 1 : 0) - this.stopLift) * Math.min(1, dt * 40);
      turnPart(this.slideStop, this.stopRest, STOP_LIFT * this.stopLift);
    }
  }

  // (bendWrists, opt-in) Bends both hands and the gun `angle` radians at the
  // wrists, about the line from the shooting hand's wrist to the support
  // hand's (positive is muzzle down), on top of the pose the clips gave them.
  bendWrists(angle) {
    const { shooting, support } = this.hands;
    if (!this.extra.bendWrists || !angle || !shooting || !support || !this.frame) return;
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
