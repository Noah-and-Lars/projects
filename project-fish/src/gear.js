// The soldier's outfit: what he wears on his head, his vest and his gloves.
//
// The choices are SLOTS (below), each with its options: his own piece (part
// of the soldier model), pieces made from downloaded models (assets/gear/,
// made by tools/gear/build_gear.mjs, each on a copy of his skeleton), or
// none. The Outfit menu (in the loadout menu, B; src/outfitMenu.js) chooses
// one per slot; the choice is remembered in the browser (Outfit, below).
//
// Every copy of the soldier is dressed by the Wardrobe: the soldier by the
// house (world.js), the player's body (player/body.js: its shadow, looking
// down, photo mode) and the menu's preview (outfitPreview.js). A piece that
// isn't his own hides his own piece for that slot (OWN, below) and is put on
// that copy's own bones, so it moves with him; "None" hides his own piece
// and puts nothing on. Head gear keeps the model's firstPerson 'head' tag,
// so the player's body leaves it out of the first-person camera but keeps
// its shadow, as it does his head.
//
// Gloves are made from downloaded gloves in their own (flat, open-hand)
// pose and bound to his hand bones in that pose (tools/gear/glove.mjs), so
// his bones bend them into whatever his hands do. They're tagged
// firstPerson 'arms': the player's body leaves them out of the first-person
// camera (keeping their shadow), and the first-person arms
// (player/fpArms.js), dressed by a Wardrobe too with `slots: ['gloves']`,
// draw them in the gun layer instead. Each glove file carries how thick its
// fingers are to his own gloves' (gear.thickness in the node's extras), for
// fitting the fingers to the gun.
//
// (They're bound to his hand bones by name: CC_Base_[LR]_Hand, the
// ForearmTwist02 for the cuff, and three bones for each finger and the
// thumb. A skeleton with other bones could wear one by being given those
// names, or by driving a copy of his hand bones from its own.)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { boneName, firstPersonTag } from './soldier.js';

// What's his own in each slot, in the soldier model: by material, and for
// the head and vest by what the piece is weighted to.
// - head: his helmet (with its built-in ear cups); its material also holds
//   the patches on his chest and back, which aren't tagged 'head'.
// - vest: the plate carrier, the patches on it, and the pouches on its
//   front and sides (weighted to his lower spine; the belt and its pouches,
//   on his hips, the thigh pouch and the neck gaiter stay).
// - gloves: his gloves.
const OWN = {
  head: (mesh, material) => material === 'Mark_Helmet1' && firstPersonTag(mesh) === 'head',
  vest: (mesh, material) => material === 'Mark_Plate_1'
    || (material === 'Mark_Helmet1' && firstPersonTag(mesh) !== 'head')
    || (material === 'Mark_Pouches_1' && mainBone(mesh) === 'CC_Base_Spine01'),
  gloves: (mesh, material) => material === 'Mark_Gloves_1',
};

// Other pieces of his an option can leave off (its `hides`): his glasses
// (the lenses, and the frame, in his pouches' material, on his head). Their
// arms were made to tuck under his helmet's ear cups, so with nothing on
// his head they'd stick out behind his ears.
const EXTRA = {
  glasses: (mesh, material) => material === 'Mark_SunGlusses_Glus'
    || (material === 'Mark_Pouches_1' && mainBone(mesh) === 'CC_Base_Head'),
};

const gearFile = (name) => new URL(`../assets/gear/${name}.glb`, import.meta.url).href;

// The slots and their options: { id, name, about, own: true (his own
// piece) | file (a piece from assets/gear) | neither (nothing), hides
// (optional: names in EXTRA also left off with it) }. The first option is
// the one he starts in. (Ids stay as they were saved: the Sage carrier and
// gloves are 'olive'.)
export const SLOTS = [
  {
    id: 'head', name: 'Head',
    options: [
      { id: 'field', name: 'Field helmet', about: 'His own helmet, with ear defenders built in.', own: true },
      { id: 'comms', name: 'Comms helmet', about: 'A high-cut helmet with rails, a counterweight pouch, ear cups and a boom mic.', file: gearFile('helmet_comms') },
      { id: 'headset', name: 'Headset', about: 'Ear defenders and a boom mic, no helmet.', file: gearFile('headset') },
      { id: 'none', name: 'None', about: 'Bare head: just his balaclava (and no glasses).', hides: ['glasses'] },
    ],
  },
  {
    id: 'vest', name: 'Vest',
    options: [
      { id: 'field', name: 'Field carrier', about: 'His own plate carrier with its magazine and side pouches.', own: true },
      { id: 'black', name: 'Black carrier', about: 'A black plate carrier with triple magazine pouches and a flag patch.', file: gearFile('vest_black') },
      { id: 'olive', name: 'Sage carrier', about: 'A heavier sage-grey plate carrier with webbing all round.', file: gearFile('vest_olive') },
      { id: 'none', name: 'None', about: 'No vest: just his jacket.' },
    ],
  },
  {
    id: 'gloves', name: 'Gloves',
    options: [
      { id: 'field', name: 'Field gloves', about: 'His own gloves, with a hard knuckle guard.', own: true },
      { id: 'black', name: 'Black gloves', about: 'Black gloves with a padded knuckle guard, knuckle pads and a wide wrist strap.', file: gearFile('gloves_black') },
      { id: 'olive', name: 'Sage gloves', about: 'Worn sage-green gloves with moulded knuckles and a long strapped cuff.', file: gearFile('gloves_olive') },
      { id: 'camo', name: 'Camo gloves', about: 'Camouflage gloves with a hard knuckle guard and a tan leather palm.', file: gearFile('gloves_camo') },
    ],
  },
];

const slotOf = (id) => SLOTS.find((s) => s.id === id);
export const optionOf = (slot, id) => (slotOf(slot) || { options: [] }).options.find((o) => o.id === id);

const STORAGE_KEY = 'project-fish.outfit';

// The chosen option in each slot, remembered in the browser.
export class Outfit {
  constructor() {
    this.chosen = {};
    this.listeners = [];
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
      // Nothing saved (or storage is off): his own kit.
    }
    for (const slot of SLOTS) {
      this.chosen[slot.id] = optionOf(slot.id, saved[slot.id]) ? saved[slot.id] : slot.options[0].id;
    }
  }

  get(slot) {
    return this.chosen[slot];
  }

  set(slot, id) {
    if (!optionOf(slot, id) || this.chosen[slot] === id) return;
    this.chosen[slot] = id;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.chosen));
    } catch {
      // Can't remember it; it still applies until the page is closed.
    }
    for (const fn of this.listeners) fn(slot, id);
  }

  // Calls fn(slot, id) whenever a choice changes.
  onChange(fn) {
    this.listeners.push(fn);
  }
}

// The bone a mesh is mostly weighted to (its name, see boneName).
function mainBone(mesh) {
  if (!mesh.isSkinnedMesh) return null;
  const index = mesh.geometry.attributes.skinIndex;
  const weight = mesh.geometry.attributes.skinWeight;
  if (!index || !weight) return null;
  const sum = new Map();
  for (let v = 0; v < index.count; v++) {
    for (let k = 0; k < 4; k++) {
      const w = weight.getComponent(v, k);
      if (w) sum.set(index.getComponent(v, k), (sum.get(index.getComponent(v, k)) || 0) + w);
    }
  }
  let best = -1;
  let most = 0;
  for (const [j, w] of sum) if (w > most) { most = w; best = j; }
  const bone = mesh.skeleton.bones[best];
  return bone ? boneName(bone.name) : null;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const files = new Map(); // url -> Promise of the loaded file

// Loads a gear file once (for every copy and the preview).
export function loadGear(url) {
  if (!files.has(url)) files.set(url, loader.loadAsync(url));
  return files.get(url);
}

const IDENTITY = new THREE.Matrix4();

// A piece's file's own materials (shared by every copy), so that taking
// the piece off frees only the copies of them made for it.
const fileMaterials = new WeakMap();

// Frees the materials made for a piece taken off (its mesh's, and the
// first-person and outside sets player/body.js keeps), but never the
// file's own, nor its geometry or textures (shared by every copy).
export function disposeOwnMaterials(mesh) {
  const shared = fileMaterials.get(mesh) || new Set();
  const made = new Set([].concat(mesh.material));
  const kept = mesh.userData.materials;
  if (kept) for (const m of [].concat(kept.firstPerson, kept.outside)) made.add(m);
  for (const m of made) if (m && !shared.has(m)) m.dispose();
}

// Dresses copies of the soldier in the Outfit, and keeps them dressed as it
// changes.
export class Wardrobe {
  constructor(outfit) {
    this.outfit = outfit;
    this.copies = [];
    outfit.onChange((slot) => {
      for (const copy of this.copies) this.apply(copy, slot);
    });
  }

  // Dresses `model` (a copy of the soldier, with its own bones) now and from
  // now on. Options:
  // - prepare(mesh): readies a new piece for this copy (its materials, say);
  //   may return a promise (compiling them), and the piece goes on after.
  // - add(mesh) / remove(mesh): where pieces go (default: under the model).
  // - slots: which slots this copy wears (default: all).
  // - hide(mesh, hidden): hides or shows one of his own pieces (default:
  //   mesh.visible; mesh.userData.gearHidden says it's hidden either way).
  // Returns a promise that settles once the current outfit is on.
  dress(model, options = {}) {
    const bones = {};
    model.traverse((o) => {
      if (o.isBone) bones[boneName(o.name)] = o;
    });
    const own = {};
    const extra = {}; // slot -> { name in EXTRA -> his meshes }, for its options' `hides`
    const slots = options.slots || SLOTS.map((s) => s.id);
    for (const slot of slots) {
      own[slot] = [];
      extra[slot] = {};
      for (const option of slotOf(slot).options) for (const name of option.hides || []) extra[slot][name] = [];
    }
    model.traverse((o) => {
      if (!o.isMesh || o.userData.gearPiece) return;
      const material = [].concat(o.material)[0].name;
      for (const slot of slots) {
        if (OWN[slot] && OWN[slot](o, material)) own[slot].push(o);
        for (const name of Object.keys(extra[slot])) if (EXTRA[name](o, material)) extra[slot][name].push(o);
      }
    });
    const copy = {
      model, bones, own, extra, slots,
      prepare: options.prepare || (() => {}),
      add: options.add || ((mesh) => model.add(mesh)),
      remove: options.remove || ((mesh) => mesh.removeFromParent()),
      hide: options.hide || ((mesh, hidden) => { mesh.visible = !hidden; }),
      worn: {}, // slot -> { id, meshes }
      pending: {}, // slot -> the option being put on
    };
    this.copies.push(copy);
    return Promise.all(slots.map((slot) => this.apply(copy, slot)));
  }

  // Stops dressing a copy (its pieces stay as they are).
  undress(model) {
    this.copies = this.copies.filter((c) => c.model !== model);
  }

  // Puts the chosen option for `slot` on one copy.
  async apply(copy, slot) {
    if (!copy.slots.includes(slot)) return;
    const id = this.outfit.get(slot);
    const option = optionOf(slot, id);
    // (Recorded first, so a piece still loading for an option chosen since
    // and given up sees it was and stays off, even when this one is
    // already on.)
    copy.pending[slot] = id;
    if (!option || (copy.worn[slot] && copy.worn[slot].id === id)) return;
    let meshes = [];
    if (option.file) {
      try {
        const gltf = await loadGear(option.file);
        meshes = this.piecesFor(copy, gltf);
        await Promise.all(meshes.map((m) => copy.prepare(m)));
      } catch (error) {
        console.warn(`Couldn't load ${option.file}; he wears his own instead.`, error);
        meshes = null;
      }
      // (Something else was chosen meanwhile.)
      if (copy.pending[slot] !== id) {
        for (const m of meshes || []) disposeOwnMaterials(m);
        return;
      }
    }
    // Off with what was on, and his own piece shown or hidden.
    if (copy.worn[slot]) {
      for (const m of copy.worn[slot].meshes) {
        copy.remove(m);
        disposeOwnMaterials(m);
      }
    }
    const showOwn = option.own || meshes === null;
    for (const m of copy.own[slot]) {
      m.userData.gearHidden = !showOwn;
      copy.hide(m, !showOwn);
    }
    for (const [name, list] of Object.entries(copy.extra[slot])) {
      const hidden = (option.hides || []).includes(name);
      for (const m of list) {
        m.userData.gearHidden = hidden;
        copy.hide(m, hidden);
      }
    }
    for (const m of meshes || []) copy.add(m);
    copy.worn[slot] = { id, meshes: meshes || [] };
  }

  // The piece's meshes, for one copy: sharing the file's geometry and
  // materials, on that copy's bones (the file's own skeleton is a copy of
  // his, so each joint is found by name; its inverse bind matrices are
  // kept, as they go with the file's geometry).
  piecesFor(copy, gltf) {
    const out = [];
    gltf.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const bones = o.skeleton.bones.map((b) => copy.bones[boneName(b.name)]);
      if (bones.some((b) => !b)) throw new Error(`${o.name}: a joint isn't in the soldier's skeleton`);
      const mesh = new THREE.SkinnedMesh(o.geometry, o.material);
      fileMaterials.set(mesh, new Set([].concat(o.material)));
      mesh.name = o.name;
      mesh.userData = { ...o.userData, gearPiece: true };
      mesh.bind(new THREE.Skeleton(bones, o.skeleton.boneInverses), IDENTITY);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false; // (skinned: his bind pose's bounds don't follow him)
      out.push(mesh);
    });
    return out;
  }
}
