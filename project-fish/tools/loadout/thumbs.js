// Draws the loadout menu's pictures (see thumbs.html): window.thumbs gets
// each as a WebP data URL by name, and window.thumbsDone is set at the end.
//
// - gun_<key>: each gun (1024×512, clear background), from its right side,
//   muzzle to the right, without the arms its file brings. A gun whose clips
//   play on its own arms is posed as its idle clip starts; it's turned so
//   its length runs across the picture and its widest side faces the camera
//   (the PF-9 and the M1911, which are posed in code, are already level).
// - pf9_kit and pf9_<attachment>[_<seat>]: the PF-9 framed to fit it with
//   every attachment on, then each attachment alone, where it sits (layers
//   the menu draws over pf9_kit; PF9_LAYERS in src/loadoutInfo.js). The
//   gun hides what's behind it in each layer.
// - gear_<slot>_<id>: every outfit option (512×512), on the soldier as he
//   stands in his idle, everything else of him left out; "None" on his
//   head and vest is him without it, and "No gloves" the bare hands the
//   Beretta came with.
//
// Everything is drawn at twice the size and shrunk, in a studio light:
// a soft room for the reflections, a cool key light, a fill, and a red rim
// from behind, as the menu lights the soldier.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LOADOUT } from '../../src/shared/config.js';
import { MODEL9 } from '../../src/viewmodel/pistol9.js';
import { SLOTS, Outfit, Wardrobe } from '../../src/gear.js';
import { loadSoldier } from '../../src/soldier.js';
import { PF9_LAYERS } from '../../src/loadoutInfo.js';

const only = new URLSearchParams(location.search).get('only');
const wanted = (name) => !only || only.split(',').some((p) => name.startsWith(p));
const status = document.getElementById('status');
const outs = document.getElementById('outs');
window.thumbs = {};

const SS = 2; // drawn at twice the size
const GUN_SIZE = [1024, 512];
const GEAR_SIZE = [512, 512];
// The arms, gloves and sleeves a gun's file brings, and spare magazines and
// shells its reloads hand over: left out.
const NOT_GUN = /arms|gloves|sleeves|hands|shell|mag2|magazine_b/i;
const SPARE = /^(magazine_2|mag2_j)$/;
// A gun's turn about the camera's line once levelled (degrees, + turns the
// muzzle up), where its long axis isn't quite its bore.
const TILT = {};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const pmrem = new THREE.PMREMGenerator(renderer);
const room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// A scene with the studio's lights, which follow the camera.
function studio(camera, { key = 2.4, rim = 2.2 } = {}) {
  const scene = new THREE.Scene();
  scene.environment = room;
  scene.environmentIntensity = 0.55;
  scene.add(camera);
  const keyLight = new THREE.DirectionalLight(0xdfe8ff, key);
  keyLight.position.set(-2, 2.5, 3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(3, -0.5, 2);
  const rimLight = new THREE.DirectionalLight(0xff3a2a, rim);
  rimLight.position.set(2.5, 1.5, -3);
  const top = new THREE.DirectionalLight(0xbfd0ff, 0.8);
  top.position.set(0, 4, -1);
  camera.add(keyLight, keyLight.target, fill, fill.target, rimLight, rimLight.target, top, top.target);
  return scene;
}

// Draws the scene and keeps the picture as `name`.
function keep(name, scene, camera, [w, h]) {
  renderer.setSize(w * SS, h * SS, false);
  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(renderer.domElement, 0, 0, w, h);
  const url = out.toDataURL('image/webp', 0.92);
  window.thumbs[name] = url;
  const box = document.createElement('div');
  box.className = 'out';
  box.innerHTML = `<img alt="" src="${url}"><a download="${name}.webp" href="${url}">${name}</a>`;
  outs.append(box);
}

// Points on a mesh where it is now (skinned or not), every `step`th.
function pointsOf(mesh, out, step = 1) {
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += step) {
    if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v);
    else v.fromBufferAttribute(pos, i);
    out.push(v.applyMatrix4(mesh.matrixWorld).clone());
  }
  return out;
}

// The axes of a cloud of points, longest first (Jacobi on its covariance).
function axesOf(points) {
  const c = new THREE.Vector3();
  for (const p of points) c.add(p);
  c.divideScalar(points.length);
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += d[i] * d[j];
  }
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(m[p][q]) < 1e-12) continue;
      const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cs = 1 / Math.sqrt(t * t + 1);
      const sn = t * cs;
      for (let k = 0; k < 3; k++) {
        const a = m[k][p], b = m[k][q];
        m[k][p] = cs * a - sn * b;
        m[k][q] = sn * a + cs * b;
      }
      for (let k = 0; k < 3; k++) {
        const a = m[p][k], b = m[q][k];
        m[p][k] = cs * a - sn * b;
        m[q][k] = sn * a + cs * b;
      }
      for (let k = 0; k < 3; k++) {
        const a = v[k][p], b = v[k][q];
        v[k][p] = cs * a - sn * b;
        v[k][q] = sn * a + cs * b;
      }
    }
  }
  return [0, 1, 2]
    .map((i) => ({ value: m[i][i], axis: new THREE.Vector3(v[0][i], v[1][i], v[2][i]).normalize() }))
    .sort((a, b) => b.value - a.value)
    .map((e) => e.axis);
}

// Which way a gun points and which way is up, from its shape: the muzzle
// end is the slimmer end (a pistol's grip and a long gun's stock are at the
// back), and up is from the gun's middle towards its muzzle end's (the grip
// and magazine hang below the bore).
function gunAxes(points) {
  const [length, height] = axesOf(points);
  const along = points.map((p) => p.dot(length));
  const lo = Math.min(...along), hi = Math.max(...along);
  const slab = (from, to) => points.filter((p, i) => along[i] >= from && along[i] <= to);
  const span = (list) => {
    const h = list.map((p) => p.dot(height));
    return Math.max(...h) - Math.min(...h);
  };
  const front = slab(hi - (hi - lo) * 0.12, hi);
  const back = slab(lo, lo + (hi - lo) * 0.12);
  const muzzle = span(front) < span(back) ? length.clone() : length.clone().negate();
  const end = muzzle.equals(length) ? front : back;
  const mid = (list) => list.reduce((s, p) => s + p.dot(height), 0) / list.length;
  const up = mid(end) > mid(points) ? height.clone() : height.clone().negate();
  return { muzzle, up };
}

// An orthographic camera looking at the gun's right side (muzzle to the
// right), fitted round `points` with a little room, at the picture's shape.
function sideCamera(points, muzzle, up, [w, h], margin = 1.06) {
  const side = new THREE.Vector3().crossVectors(muzzle, up).normalize();
  const upTrue = new THREE.Vector3().crossVectors(side, muzzle).normalize();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of points) {
    const x = p.dot(muzzle), y = p.dot(upTrue), z = p.dot(side);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const aspect = w / h;
  const half = Math.max((x1 - x0) / 2, ((y1 - y0) / 2) * aspect) * margin;
  const camera = new THREE.OrthographicCamera(-half, half, half / aspect, -half / aspect, 0.01, 20);
  const centre = muzzle.clone().multiplyScalar((x0 + x1) / 2)
    .addScaledVector(upTrue, (y0 + y1) / 2)
    .addScaledVector(side, (z0 + z1) / 2);
  camera.position.copy(centre).addScaledVector(side, 5);
  camera.up.copy(upTrue);
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);
  return camera;
}

const tilted = (muzzle, up, degrees) => {
  if (!degrees) return { muzzle, up };
  const side = new THREE.Vector3().crossVectors(muzzle, up).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(side, (-degrees * Math.PI) / 180);
  return { muzzle: muzzle.clone().applyQuaternion(q), up: up.clone().applyQuaternion(q) };
};

async function loadGun(key) {
  const gltf = await loader.loadAsync(`../../assets/${key}.glb`);
  const root = gltf.scene;
  const clip = gltf.animations.find((a) => a.name === 'idle') || gltf.animations[0];
  if (clip) {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).play();
    mixer.update(0);
  }
  // (A spare magazine its reloads hand over, on a bone of its own: shrunk
  // to nothing.)
  root.traverse((o) => {
    if (o.isBone && SPARE.test(o.name)) o.scale.setScalar(0);
  });
  root.updateMatrixWorld(true);
  // The gun's meshes; the PF-9's attachments (att_ nodes) start hidden.
  const gun = [];
  root.traverse((o) => {
    if (/^att_/.test(o.name) && !/^att_/.test(o.parent.name)) o.visible = false;
    if (!o.isMesh) return;
    o.frustumCulled = false;
    let attachment = false;
    for (let p = o; p; p = p.parent) if (/^att_/.test(p.name)) attachment = true;
    if (attachment) return;
    if (NOT_GUN.test(o.name)) o.visible = false;
    else gun.push(o);
  });
  return { gltf, root, gun };
}

async function drawGuns() {
  for (const key of LOADOUT) {
    const name = `gun_${key}`;
    if (!wanted(name) && !(key === 'pistol' && wanted('pf9'))) continue;
    status.textContent = `Drawing ${name}…`;
    const { root, gun } = await loadGun(key);
    const shown = gun;
    const points = [];
    for (const m of shown) pointsOf(m, points, Math.max(1, Math.floor(m.geometry.attributes.position.count / 6000)));
    // Gun space is muzzle -Z, up +Y: the PF-9's and the M1911's files are
    // in it, and a gun with its own arms has a `gun` node that is, in its
    // idle pose. (Else, from its shape.)
    const frame = root.getObjectByName('gun');
    const turn = frame ? frame.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const found = frame || key === 'pistol' || key === 'pistol45'
      ? { muzzle: new THREE.Vector3(0, 0, -1).applyQuaternion(turn), up: new THREE.Vector3(0, 1, 0).applyQuaternion(turn) }
      : gunAxes(points);
    const axes = tilted(found.muzzle, found.up, TILT[key]);
    if (wanted(name)) {
      const camera = sideCamera(points, axes.muzzle, axes.up, GUN_SIZE);
      const scene = studio(camera);
      scene.add(root);
      keep(name, scene, camera, GUN_SIZE);
      scene.remove(root);
    }
    if (key === 'pistol' && wanted('pf9')) drawPf9Layers(root, shown, points, axes);
  }
}

// The PF-9's attachments, each a layer over pf9_kit.
function drawPf9Layers(root, base, basePoints, { muzzle, up }) {
  const nodes = {};
  root.traverse((o) => {
    if (o.name.startsWith('att_') && !o.parent.name.startsWith('att_')) nodes[o.name.slice(4)] = o;
  });
  // Puts an attachment where it sits with `seat` (moved by its offset in
  // gun space, which the file's root is), or where it was modelled.
  const home = new Map(Object.values(nodes).map((n) => [n, n.matrix.clone()]));
  const seatOf = (layer) => {
    const node = nodes[layer.id];
    node.matrix.copy(home.get(node));
    node.matrix.decompose(node.position, node.quaternion, node.scale);
    const seat = layer.seat && (MODEL9.attachments[layer.id] || {}).on && MODEL9.attachments[layer.id].on[layer.seat];
    if (seat && seat.offset) {
      node.updateMatrixWorld(true);
      const world = new THREE.Matrix4().makeTranslation(...seat.offset).multiply(node.matrixWorld);
      node.parent.updateMatrixWorld(true);
      new THREE.Matrix4().copy(node.parent.matrixWorld).invert().multiply(world).decompose(node.position, node.quaternion, node.scale);
    }
    node.updateMatrixWorld(true);
    return node;
  };
  const meshesOf = (node) => {
    const list = [];
    node.traverse((o) => { if (o.isMesh) list.push(o); });
    return list;
  };
  // The frame: the gun with every attachment, in every place it can sit.
  const points = basePoints.slice();
  for (const layer of PF9_LAYERS) {
    for (const m of meshesOf(seatOf(layer))) pointsOf(m, points, 2);
  }
  const camera = sideCamera(points, muzzle, up, GUN_SIZE, 1.04);
  const scene = studio(camera);
  scene.add(root);
  for (const n of Object.values(nodes)) n.visible = false;
  if (wanted('pf9_kit')) keep('pf9_kit', scene, camera, GUN_SIZE);
  // Each layer: the gun drawn only into the depth buffer first, so it
  // hides whatever of the attachment is behind it.
  const colour = new Map();
  for (const m of base) {
    m.renderOrder = -1;
    for (const mat of [].concat(m.material)) colour.set(mat, mat.colorWrite);
  }
  for (const mat of colour.keys()) mat.colorWrite = false;
  for (const layer of PF9_LAYERS) {
    if (!wanted(layer.name) && !wanted('pf9_layers')) continue;
    status.textContent = `Drawing ${layer.name}…`;
    const node = seatOf(layer);
    node.visible = true;
    keep(layer.name, scene, camera, GUN_SIZE);
    node.visible = false;
  }
  for (const [mat, was] of colour) mat.colorWrite = was;
  scene.remove(root);
}

// ---- The outfit ----

// A perspective camera from `direction`, fitted round `points` (at the
// picture's shape, with room round them).
function fitCamera(points, direction, [w, h], { fov = 22, margin = 1.14 } = {}) {
  const camera = new THREE.PerspectiveCamera(fov, w / h, 0.02, 50);
  const box = new THREE.Box3().setFromPoints(points);
  const target = box.getCenter(new THREE.Vector3());
  const dir = direction.clone().normalize();
  const tanY = Math.tan((fov * Math.PI) / 360) / margin;
  const tanX = tanY * camera.aspect;
  const v = new THREE.Vector3();
  for (let pass = 0; pass < 4; pass++) {
    // As far back as the points need, then centred on them.
    let distance = 0.1;
    camera.position.copy(target).addScaledVector(dir, 10);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    const inv = camera.matrixWorldInverse;
    for (const p of points) {
      v.copy(p).applyMatrix4(inv);
      const along = -v.z - 10; // its depth from the target's plane
      distance = Math.max(distance, Math.abs(v.x) / tanX - along, Math.abs(v.y) / tanY - along);
    }
    camera.position.copy(target).addScaledVector(dir, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    for (const p of points) {
      v.copy(p).project(camera);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const upward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    target.addScaledVector(right, ((x0 + x1) / 2) * tanX * margin * distance)
      .addScaledVector(upward, ((y0 + y1) / 2) * tanY * margin * distance);
  }
  return camera;
}

const waitFor = async (test, ms = 30000) => {
  const start = performance.now();
  while (!test()) {
    if (performance.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};

// How each slot's pictures are taken: from where (his front is +Z, his
// right hand at -X), and round which bone (and how far from it) when only
// part of what's shown counts.
const VIEW = {
  head: { direction: new THREE.Vector3(-0.55, 0.12, 1) },
  vest: { direction: new THREE.Vector3(-0.5, 0.08, 1) },
  gloves: { direction: new THREE.Vector3(-1, 0.05, 0.45), around: ['CC_Base_R_Hand', 0.16] },
};
const NONE_VIEW = {
  head: { around: ['CC_Base_Head', 0.17, [0, 0.07, 0]] },
  vest: { around: ['CC_Base_Spine02', 0.34, [0, -0.04, 0]] },
};

async function drawGear() {
  const list = [];
  for (const slot of SLOTS) for (const option of slot.options) if (wanted(`gear_${slot.id}_${option.id}`)) list.push([slot, option]);
  if (!list.length) return;
  const outfit = new Outfit();
  const wardrobe = new Wardrobe(outfit);
  const { gltf, preview: model } = await loadSoldier();
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(gltf.animations[0]).play();
  mixer.update(0);
  model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  await wardrobe.dress(model);
  const copy = wardrobe.copies[0];
  const bones = copy.bones;
  for (const [slot, option] of list) {
    const name = `gear_${slot.id}_${option.id}`;
    status.textContent = `Drawing ${name}…`;
    if (slot.id === 'gloves' && option.id === 'none') {
      await drawBareHands(name);
      continue;
    }
    outfit.set(slot.id, option.id);
    await waitFor(() => copy.worn[slot.id] && copy.worn[slot.id].id === option.id);
    model.updateMatrixWorld(true);
    // What's shown: the piece alone, or for "None" all of him.
    const pieces = option.file ? copy.worn[slot.id].meshes : option.own ? copy.own[slot.id] : null;
    const was = new Map();
    model.traverse((o) => { if (o.isMesh) was.set(o, o.visible); });
    if (pieces) model.traverse((o) => { if (o.isMesh) o.visible = pieces.includes(o); });
    const view = { ...VIEW[slot.id], ...(pieces ? {} : NONE_VIEW[slot.id]) };
    let points = [];
    for (const m of (pieces || [...was.keys()].filter((o) => o.visible))) pointsOf(m, points, Math.max(1, Math.floor(m.geometry.attributes.position.count / 8000)));
    if (view.around) {
      const [bone, radius, shift = [0, 0, 0]] = view.around;
      const at = bones[bone].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...shift));
      points = points.filter((p) => p.distanceTo(at) < radius);
    }
    const camera = fitCamera(points, view.direction, GEAR_SIZE);
    if (view.around) {
      // (Nothing further back than what counts: his other hand.)
      camera.far = Math.max(...points.map((p) => p.distanceTo(camera.position))) + 0.05;
      camera.updateProjectionMatrix();
    }
    const scene = studio(camera, { key: 2.8, rim: 2.6 });
    scene.add(model);
    keep(name, scene, camera, GEAR_SIZE);
    scene.remove(model);
    for (const [m, v] of was) m.visible = v;
  }
}

// "No gloves": the bare hands the guns with their own arms keep (the
// Beretta's right hand, as its idle clip starts, its gun left out).
async function drawBareHands(name) {
  const gltf = await loader.loadAsync('../../assets/beretta.glb');
  const root = gltf.scene;
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(gltf.animations.find((a) => a.name === 'idle')).play();
  mixer.update(0);
  root.updateMatrixWorld(true);
  let arms = null;
  let hand = null;
  root.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      if (o.name === 'arms') arms = o;
      else o.visible = false;
    }
    if (o.isBone && /right.?hand$|hand_r$|r_hand$|righthand$/i.test(o.name)) hand = hand || o;
  });
  let points = pointsOf(arms, [], 2);
  if (hand) {
    const at = hand.getWorldPosition(new THREE.Vector3());
    points = points.filter((p) => p.distanceTo(at) < 0.11);
  }
  // From in front and above, where the gun would be: both hands round its
  // grip (the camera of a first-person gun is at the origin looking down
  // -Z).
  const camera = fitCamera(points, new THREE.Vector3(0.2, 0.5, 1), GEAR_SIZE);
  const scene = studio(camera, { key: 2.8, rim: 2.6 });
  scene.add(root);
  keep(name, scene, camera, GEAR_SIZE);
}

try {
  await drawGuns();
  await drawGear();
  status.textContent = `Done: ${Object.keys(window.thumbs).length} pictures.`;
} catch (error) {
  console.error(error);
  status.textContent = `Failed: ${error.message}`;
  window.thumbsError = String(error && error.stack || error);
}
window.thumbsDone = true;
