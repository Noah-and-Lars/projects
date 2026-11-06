// The outfit's gloves on the guns that bring their own arms (the Beretta
// 92FS, the FN 502 and the Browning Hi-Power, see animatedGun.js).
//
// Each glove option in SLOTS (src/gear.js) that can be worn on those arms
// names a file for each of them (`guns`: assets/gear/gloves_<id>_<gun>.glb,
// made by tools/gear/gun_gloves.mjs): the glove rigged to that gun's own
// hand and finger bones, so the gun's clips move it exactly as they move
// the hands it came with. Nothing is posed on top of the clips: the glove
// is only skinned to the rig's bones (found by name), with its own inverse
// bind matrices.
//
// The gun's own hand is cut out of its arm mesh under the glove, so it
// never shows through: the glove file says how (gunGlove in the glove
// node's extras, see gun_gloves.mjs and cutHand below). The cut is a second
// index buffer over the same points, made once for each glove and kept,
// so going back to the gun's own hands is just using the first one again.
//
// "No gloves" and "Field gloves" have no file for these guns (the
// soldier's own field gloves were never made for them), so they show the
// hands the gun came with: the Beretta's bare hands, the FN 502's leather
// gloves, the Hi-Power's black gloves.
//
// A gun is dressed when it's taken out (from when the switch to it starts,
// so the file has the old gun's putting away to load in), and again when
// the gloves are changed if it's been dressed before (one out of view
// takes its old glove off at once, so it's never drawn in it). A new glove goes on
// only once its file is in and its materials are ready, in the same frame
// as its hand is cut away, so the hand never shows bare in between; until
// then the gun keeps what it had.

import * as THREE from 'three';
import { loadGear, optionOf } from '../gear.js';

const IDENTITY = new THREE.Matrix4();
const q = new THREE.Vector3();

// The triangles of `mesh` (the gun's arm mesh) left once its hand is cut
// away as `spec` (the glove's gunGlove) says: a point belongs to the side
// whose sideJoints carry most of its weight (at least half); in that side's
// hand bone's bind frame it's on the hand if it's past the plane. Every
// triangle with a point on the hand goes. Returns a geometry sharing the
// mesh's points (never to be disposed: that would free them too).
function cutHand(mesh, spec) {
  const geometry = mesh.geometry;
  const bones = mesh.skeleton.bones;
  const index = (name) => bones.findIndex((b) => b.name === name);
  const sides = Object.values(spec.sides).map((side) => ({
    plane: side.plane,
    inverse: mesh.skeleton.boneInverses[index(side.hand)],
    joints: new Set(side.sideJoints.map(index).filter((i) => i >= 0)),
  })).filter((side) => side.inverse);
  const joint = geometry.attributes.skinIndex;
  const weight = geometry.attributes.skinWeight;
  const position = geometry.attributes.position;
  const onHand = new Uint8Array(position.count);
  for (let v = 0; v < position.count; v++) {
    let best = null;
    let most = 0;
    for (const side of sides) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (side.joints.has(joint.getComponent(v, k))) w += weight.getComponent(v, k);
      if (w > most) {
        most = w;
        best = side;
      }
    }
    if (!best || most < 0.5) continue;
    q.fromBufferAttribute(position, v).applyMatrix4(best.inverse);
    const [nx, ny, nz, d] = best.plane;
    if (nx * q.x + ny * q.y + nz * q.z + d > 0) onHand[v] = 1;
  }
  const all = geometry.index.array;
  const kept = new (position.count > 65535 ? Uint32Array : Uint16Array)(all.length);
  let n = 0;
  for (let t = 0; t < all.length; t += 3) {
    if (onHand[all[t]] || onHand[all[t + 1]] || onHand[all[t + 2]]) continue;
    kept[n++] = all[t];
    kept[n++] = all[t + 1];
    kept[n++] = all[t + 2];
  }
  const cut = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) cut.setAttribute(name, attribute);
  cut.setIndex(new THREE.BufferAttribute(kept.slice(0, n), 1));
  cut.boundingBox = geometry.boundingBox;
  cut.boundingSphere = geometry.boundingSphere;
  cut.name = `${geometry.name || mesh.name}_cut`;
  return cut;
}

// Frees what a glove put on a gun had of its own: its copies of the
// materials and its skeleton's bone texture (the file's geometry and
// textures are shared, and stay).
function disposePiece(mesh) {
  for (const m of [].concat(mesh.material)) m.dispose();
  mesh.skeleton.dispose();
}

export class GunGloves {
  // outfit: the Outfit (src/gear.js); viewmodel: the gun layer, with its
  // guns loaded.
  constructor(outfit, viewmodel) {
    this.outfit = outfit;
    this.viewmodel = viewmodel;
    // Gun key -> { arms: its arm meshes' original geometries (mesh ->
    // geometry), cuts: file -> (mesh -> cut geometry), worn: { file,
    // pieces }, ticket (counting the calls to dress it: only the latest
    // goes on), loading: { file, ticket, promise } } for each gun dressed
    // so far.
    this.state = new Map();
    // (A gun that isn't in the hands, or coming up into them, takes its
    // old glove off at once, so it can never be drawn still wearing it; its
    // new one loads from now.)
    outfit.onChange((slot) => {
      if (slot !== 'gloves') return;
      const { current, switching } = viewmodel;
      const shown = new Set([current && current.key, switching && switching.to]);
      for (const key of this.state.keys()) this.dress(key, !shown.has(key));
    });
  }

  // The glove file the outfit has for gun `key` (null: its own hands).
  fileFor(key) {
    const option = optionOf('gloves', this.outfit.get('gloves'));
    return (option && option.guns && option.guns[key]) || null;
  }

  stateOf(g) {
    if (!this.state.has(g.key)) this.state.set(g.key, { arms: new Map(), cuts: new Map(), worn: { file: null, pieces: [] }, ticket: 0, loading: null });
    return this.state.get(g.key);
  }

  // Puts the outfit's gloves on gun `key` (if it has its own arms), or its
  // own hands back. Resolves once it's done (or given up for a newer choice).
  // offNow: the glove it has on comes off straight away, before the new
  // one is in (for a gun out of view).
  dress(key, offNow = false) {
    const g = this.viewmodel.guns[key];
    if (!g || !g.animated || !g.rig) return;
    const s = this.stateOf(g);
    const file = this.fileFor(key);
    // (Already on its way: the same call goes on.)
    if (s.loading && s.loading.ticket === s.ticket && s.loading.file === file) return s.loading.promise;
    const ticket = ++s.ticket;
    if (s.worn.file === file) return;
    if (offNow) this.swap(g, s, null, [], null);
    const promise = this.putOn(g, s, file, ticket);
    s.loading = { file, ticket, promise };
    return promise;
  }

  async putOn(g, s, file, ticket) {
    let pieces = [];
    let cut = null;
    let wearing = file;
    if (file) {
      try {
        const gltf = await loadGear(file);
        if (s.ticket !== ticket) return;
        ({ pieces, cut } = this.fit(g, s, file, gltf));
        await this.ready(pieces);
      } catch (error) {
        console.warn(`Couldn't put ${file} on the ${g.rules.name}; it keeps its own hands.`, error);
        for (const m of pieces) disposePiece(m);
        pieces = [];
        cut = null;
        wearing = null;
      }
      // (Something else was chosen meanwhile.)
      if (s.ticket !== ticket) {
        for (const m of pieces) disposePiece(m);
        return;
      }
    }
    this.swap(g, s, wearing, pieces, cut);
    s.loading = null;
  }

  // In one go: off with the old glove, the hand cut (or put back), on with
  // the new (`file`, its `pieces`, and `cut`, its arm meshes' cut
  // geometries; null and none: the gun's own hands).
  swap(g, s, file, pieces, cut) {
    for (const m of s.worn.pieces) {
      m.removeFromParent();
      disposePiece(m);
    }
    for (const [mesh, geometry] of s.arms) mesh.geometry = (cut && cut.get(mesh)) || geometry;
    for (const m of pieces) g.object.add(m);
    s.worn = { file, pieces };
  }

  // The glove's meshes for gun g, on its bones, and its hand cut away for
  // it (made once per glove and kept).
  fit(g, s, file, gltf) {
    const bones = new Map();
    g.rig.root.traverse((o) => {
      if (o.isBone && !bones.has(o.name)) bones.set(o.name, o);
    });
    let spec = null;
    const sources = [];
    gltf.scene.traverse((o) => {
      if (o.userData && o.userData.gunGlove) spec = o.userData.gunGlove;
      if (o.isSkinnedMesh) sources.push(o);
    });
    if (!spec || !sources.length) throw new Error('not a glove for a gun with its own arms');
    // Its arm mesh (or, for one with several materials, the meshes the
    // loader makes of it, under a node of that name).
    const arms = [];
    g.rig.root.traverse((o) => {
      if (o.isSkinnedMesh && (o.name === spec.armMesh || (o.parent && o.parent.name === spec.armMesh))) arms.push(o);
    });
    if (!arms.length) throw new Error(`no arm mesh ${spec.armMesh}`);
    for (const mesh of arms) if (!s.arms.has(mesh)) s.arms.set(mesh, mesh.geometry);
    if (!s.cuts.has(file)) {
      const cuts = new Map();
      for (const mesh of arms) {
        const original = s.arms.get(mesh);
        const shown = mesh.geometry;
        mesh.geometry = original; // (cut from the whole mesh)
        cuts.set(mesh, cutHand(mesh, spec));
        mesh.geometry = shown;
      }
      s.cuts.set(file, cuts);
    }
    const pieces = sources.map((o) => {
      const joints = o.skeleton.bones.map((b) => bones.get(b.name));
      const missing = o.skeleton.bones.find((b, i) => !joints[i]);
      if (missing) throw new Error(`the ${g.rules.name} has no bone ${missing.name}`);
      const materials = [].concat(o.material).map((m) => m.clone());
      const mesh = new THREE.SkinnedMesh(o.geometry, materials.length === 1 ? materials[0] : materials);
      mesh.name = `${g.key}_${o.name}`;
      mesh.userData = { ...o.userData, gunGlovePiece: true };
      mesh.bind(new THREE.Skeleton(joints, o.skeleton.boneInverses), IDENTITY);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false; // (the clips move it far from where it was bound)
      return mesh;
    });
    return { pieces, cut: s.cuts.get(file) };
  }

  // Gets the pieces' materials and textures ready for the gun layer, so
  // putting them on doesn't stall a frame.
  async ready(pieces) {
    const { renderer, camera, scene } = this.viewmodel;
    if (!renderer) return;
    const group = new THREE.Group();
    for (const m of pieces) group.add(m);
    try {
      if (renderer.compileAsync) await renderer.compileAsync(group, camera, scene);
      for (const m of pieces) {
        for (const material of [].concat(m.material)) {
          for (const value of Object.values(material)) if (value && value.isTexture) renderer.initTexture(value);
        }
      }
    } finally {
      for (const m of pieces) group.remove(m);
    }
  }
}
