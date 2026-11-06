// The second pistol: a classic single-action .45 in the style of the
// full-size 1911 "Government" pistol, 216 mm long with a 127 mm barrel.
//
// The game's model (assets/pistol45.glb) is made from a downloaded model by
// tools/blender/convert_pistol45.py, which puts its grip where the hands hold
// a pistol (GRIP in pistol.js). MODEL45 below is measured from it: where its
// muzzle, sights and moving parts are.
//
// The rest of this file is an earlier 1911-style pistol made from side
// profiles: a simpler built-in version of it is used if the model file can't
// be loaded (with FALLBACK45 instead of MODEL45), and the Blender script
// tools/blender/build_pistol45.py builds the full one from the same profiles.
// It's to real dimensions too, but with its bore higher above the grip.
//
// Gun space as in pistol.js: metres, +X right, +Y up, -Z forward. For the
// profiles the bore is along Z at y = 0; they're traced in (s, y), s = -z the
// distance forward, and pushed out sideways to their thickness.

import * as THREE from 'three';
import { GRIP, filleted, profile } from './pistol.js';

export { GRIP };

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Points on the game's model (gun space; the converter's OFFSET puts the gun
// 10.5 mm higher and 3.7 mm further forward than at first, so these moved
// with it): the muzzle and the ejection port;
// the sight line (the top of the front blade, level with the bottom of the
// rear notch: its height, and the back faces of both sights); how far the
// slide goes back when it fires; the barrel, which tips down at the back as
// it unlocks, about a point near the muzzle; the slide stop, whose thumb pad
// (behind its pin) rises when the slide locks back; the hammer, modelled down
// and cocked back this far (radians) about its pin; and the magazine
// release's face (pressed towards +X).
// Reloading, the M1911 comes up turned further over (canted towards the
// support hand) than the first pistol, so the magazine well faces it.
const RELOAD_POSE45 = { position: V(-0.05, 0.15, 0.11), turn: [0.5, -0.12, -0.62] };

export const MODEL45 = {
  reloadPose: RELOAD_POSE45,
  muzzle: [0, -0.0054, -0.1641],
  port: [0.008, 0.0085, -0.0537],
  sights: { height: 0.0103, rearZ: 0.0096, frontZ: -0.1449 },
  slideTravel: 0.03,
  slideTop: 0.0065, // top of the slide (without the sights), and its half width
  slideHalfWidth: 0.0113,
  barrel: { travel: 0.0035, tilt: 0.011, pivot: V(0, -0.0054, -0.1587) },
  slideStop: { lift: -0.12, pivot: V(0, -0.0211, -0.0553) },
  hammer: { pivot: V(0, -0.0257, 0.0312), cocked: 0.9 },
  magRelease: { face: V(-0.0125, -0.0498, -0.0231), travel: 0.0017 },
};

// The slide: flat sided with a rounded top, from its back face to the muzzle.
// In front of the frame its nose drops down round the recoil spring plug.
export const SLIDE = {
  halfWidth: 0.0117,
  top: 0.0155,
  bottom: -0.0105,
  front: -0.164, // the muzzle end (z)
  back: 0.034,
  noseFrom: 0.129, // s where the frame's dust cover ends and the nose drops down
  noseBottom: -0.0245,
  travel: 0.031, // how far it goes back when firing (metres)
  frontSerrations: null, // none: it's eased back by the rear serrations
  rearSerrations: [0.008, 0.029], // z, front to back
};

// Plain black sights: the top of the front blade lines up with the top of
// the rear sight, either side of its square notch.
export const SIGHTS = {
  height: 0.019, // of the sight line above the bore
  rearZ: 0.026, // back face of the rear sight
  frontZ: -0.1525, // back face of the front blade
};

// The hammer pivots on its pin at the back of the frame; it's modelled down
// (resting on the slide) and is cocked back this far (radians).
export const HAMMER = { pivot: new THREE.Vector3(0, -0.0165, 0.0405), cocked: 0.95 };

// The slide stop pivots on its pin above the trigger; locked back, its thumb
// pad rises this much (radians).
export const SLIDE_STOP = { pivot: new THREE.Vector3(0, -0.0165, -0.0455), lift: 0.16 };

// The magazine release button, on the left behind the trigger guard (the
// shooting hand's thumb presses it, as on the first pistol).
export const MAG_RELEASE = { face: new THREE.Vector3(-0.0134, -0.0415, -0.0225), travel: 0.0017 };

// The magazine, seated: a single stack of seven, slimmer than the first
// pistol's. It runs down the grip just behind the trigger guard. Distances
// along the grip (u) are from GRIP.top along GRIP.down, as in pistol.js
// (worked out from the side profile below).
export const MAGAZINE = {
  forward: 0.0026, // its centre line is this far in front of the grip's, along GRIP.front
  halfWidth: 0.0074,
  halfDepth: 0.01585,
  cornerRadius: 0.0025,
  top: -0.0341, // u of the feed lips
  bottom: 0.0642, // u of the bottom of the body, where the baseplate starts
  base: 0.067, // u of the bottom of the baseplate
  baseHalfWidth: 0.0084,
  baseHalfDepth: 0.0165,
  rounds: 7,
};
// The grip ends, and the magazine well opens, here (u).
export const GRIP_BOTTOM = 0.0643;

// The magazine as a side profile (s, y): its body, level at the top and the
// bottom, at the grip's angle; and the thin baseplate under it, a little
// bigger all round.
const MAG_SLOPE = 0.3417; // forward per metre up
const MAG_TOP = -0.0265;
const MAG_BOTTOM = -0.1195;
const MAG_FRONT_TOP = 0.026;
const MAG_DEPTH = 0.0335; // front to back, along s (a round is 32.4 mm long)
const magFront = (y) => MAG_FRONT_TOP + (y - MAG_TOP) * MAG_SLOPE;
const MAG_BODY = [
  [magFront(MAG_BOTTOM), MAG_BOTTOM], [magFront(MAG_TOP), MAG_TOP],
  [magFront(MAG_TOP) - MAG_DEPTH, MAG_TOP], [magFront(MAG_BOTTOM) - MAG_DEPTH, MAG_BOTTOM],
].map(([a, b]) => [+a.toFixed(5), b]);
const MAG_BASE = [
  [magFront(MAG_BOTTOM) + 0.0007, MAG_BOTTOM], [magFront(MAG_BOTTOM) - MAG_DEPTH - 0.0007, MAG_BOTTOM],
  [magFront(MAG_BOTTOM) - MAG_DEPTH - 0.0012, MAG_BOTTOM - 0.003], [magFront(MAG_BOTTOM) + 0.0012, MAG_BOTTOM - 0.003],
].map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);
export const MAGAZINE_SHAPE = { slope: MAG_SLOPE, top: MAG_TOP, bottom: MAG_BOTTOM, frontTop: MAG_FRONT_TOP, depth: MAG_DEPTH };

const SLIDE_PROFILE = filleted([
  [-0.034, -0.0105, 0], [SLIDE.noseFrom, -0.0105, 0], [SLIDE.noseFrom, SLIDE.noseBottom, 0.003],
  [0.164, SLIDE.noseBottom, 0.0025], [0.164, 0.0125, 0.0025], [0.1615, SLIDE.top, 0.0025],
  [-0.031, SLIDE.top, 0.003], [-0.034, 0.0125, 0.003],
]);

// The frame: dust cover under the slide, a rounded trigger guard, the
// straight front strap, the arched mainspring housing up the back, and the
// grip safety's curved beavertail over the web of the hand, blending into
// the back strap. Its top
// sits 0.4 mm under the slide, so a dark line shows between them.
const FRAME_PROFILE = filleted([
  [-0.037, -0.0109, 0], [SLIDE.noseFrom, -0.0109, 0.0008], [SLIDE.noseFrom, SLIDE.noseBottom, 0.0035], [0.087, SLIDE.noseBottom, 0.008],
  [0.0905, -0.038, 0.016], [0.0835, -0.0632, 0.022], [0.061, -0.0693, 0.016], [0.045, -0.0688, 0.008], [0.034, -0.0665, 0.006], [0.026, -0.0605, 0.006],
  [0.0055, -0.1205, 0.004], [-0.0435, -0.1205, 0.004], [-0.0478, -0.107, 0.018], [-0.0345, -0.0625, 0.01],
  [-0.0335, -0.0465, 0.012], [-0.0395, -0.0338, 0.009], [-0.0478, -0.0262, 0.005], [-0.0493, -0.0222, 0.0025], [-0.0418, -0.0182, 0.004], [-0.037, -0.0165, 0.002],
]);

const TRIGGER_GUARD_HOLE = filleted([
  [0.0845, -0.0275, 0.003], [0.0858, -0.041, 0.013], [0.0785, -0.0603, 0.019], [0.058, -0.0651, 0.013], [0.044, -0.0647, 0.007],
  [0.034, -0.0615, 0.005], [0.03, -0.055, 0.005], [0.029, -0.0275, 0.003],
]);

// Wood grip panels, one each side, covering the grip from just under the
// slide stop and safety to near the bottom: the front edge follows the
// front strap (straight down behind the trigger guard at the top), the back
// edge the arched mainspring housing.
const GRIP_PANEL = filleted([
  [0.0255, -0.0245, 0.004], [0.0255, -0.0538, 0.004], [0.0045, -0.1168, 0.006], [-0.0418, -0.1168, 0.006],
  [-0.0448, -0.1065, 0.01], [-0.0315, -0.0625, 0.006], [-0.0292, -0.0245, 0.004],
]);

// A short, flat-faced trigger that slides straight back.
const TRIGGER_PROFILE = filleted([
  [0.051, -0.0285, 0.001], [0.0575, -0.0285, 0.001], [0.0581, -0.034, 0.002], [0.0577, -0.0478, 0.002],
  [0.0548, -0.0498, 0.0015], [0.0516, -0.0483, 0.0015], [0.0513, -0.034, 0.002],
]);

// The hammer, down (resting against the back of the slide): a body round its
// pin and a spur reaching back and up for the thumb.
const HAMMER_PROFILE = filleted([
  [-0.0345, -0.0135, 0.001], [-0.0345, 0.0035, 0.001], [-0.0362, 0.0072, 0.002], [-0.042, 0.0102, 0.004],
  [-0.0505, 0.0114, 0.002], [-0.0525, 0.0088, 0.0015], [-0.0465, 0.0042, 0.004], [-0.0448, -0.006, 0.004],
  [-0.0462, -0.0172, 0.004], [-0.041, -0.0228, 0.004], [-0.036, -0.0198, 0.002],
]);

// The thumb safety, on the left at the back of the frame just under the
// slide: round and broad at its pivot, with a short checkered paddle
// reaching forward for the thumb.
const THUMB_SAFETY_PROFILE = filleted([
  [-0.0358, -0.0124, 0.004], [-0.026, -0.0113, 0.004], [-0.0045, -0.0113, 0.002], [-0.0028, -0.0127, 0.0015],
  [-0.0055, -0.0158, 0.0018], [-0.019, -0.0168, 0.005], [-0.0238, -0.0238, 0.005], [-0.0345, -0.0242, 0.005],
  [-0.0378, -0.0185, 0.003],
]);

// The slide stop, on the left above the trigger: a broad round body about
// its pin, and a lever sweeping back and up to a big checkered thumb pad.
const SLIDE_STOP_PROFILE = filleted([
  [0.0525, -0.0122, 0.005], [0.04, -0.0112, 0.004], [0.0265, -0.0096, 0.002], [0.0192, -0.0101, 0.002],
  [0.0188, -0.0182, 0.002], [0.0262, -0.0192, 0.003], [0.0368, -0.0196, 0.004], [0.0405, -0.0228, 0.005],
  [0.0505, -0.0228, 0.005], [0.0532, -0.0178, 0.004],
]);

// The side profiles and their thicknesses (metres), shared with the Blender
// model (tools/blender/build_pistol45.py) so both have exactly the same shape.
export const PROFILES = {
  slide: { points: SLIDE_PROFILE, width: SLIDE.halfWidth * 2 },
  frame: { points: FRAME_PROFILE, width: 0.0225, holes: [TRIGGER_GUARD_HOLE] },
  gripPanel: { points: GRIP_PANEL, width: 0.0042, inner: 0.01125 },
  trigger: { points: TRIGGER_PROFILE, width: 0.0062 },
  hammer: { points: HAMMER_PROFILE, width: 0.0068 },
  thumbSafety: { points: THUMB_SAFETY_PROFILE, width: 0.0022 },
  slideStop: { points: SLIDE_STOP_PROFILE, width: 0.0026 },
  magazine: { body: MAG_BODY, base: MAG_BASE, width: MAGAZINE.halfWidth * 2, baseWidth: MAGAZINE.baseHalfWidth * 2, ...MAGAZINE_SHAPE },
};

// The same points on the built-in version (see the top of this file).
export const FALLBACK45 = {
  reloadPose: RELOAD_POSE45,
  muzzle: [0, 0, -0.164],
  port: [0.008, 0.017, -0.03],
  sights: SIGHTS,
  slideTravel: SLIDE.travel,
  slideTop: SLIDE.top,
  slideHalfWidth: SLIDE.halfWidth,
  barrel: null,
  slideStop: null,
  hammer: { pivot: HAMMER.pivot, cocked: HAMMER.cocked },
  magRelease: MAG_RELEASE,
};

// A simpler built-in version, used if the model file can't be loaded.
export function createPistol45() {
  const pistol = new THREE.Group();
  pistol.name = 'pistol';
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: 0.85, roughness: 0.4 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x18191b, metalness: 0.75, roughness: 0.45 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b2b17, metalness: 0, roughness: 0.6 });
  const part = (geometry, material, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    if (name) mesh.name = name;
    return mesh;
  };
  const slide = new THREE.Group();
  slide.name = 'slide';
  slide.add(part(profile(SLIDE_PROFILE, SLIDE.halfWidth * 2, 0.0015), steel));
  const front = part(new THREE.BoxGeometry(0.0028, 0.006, 0.007), darkSteel);
  front.position.set(0, SLIDE.top + 0.003, SIGHTS.frontZ - 0.0035);
  const rear = part(new THREE.BoxGeometry(0.012, 0.006, 0.009), darkSteel);
  rear.position.set(0, SLIDE.top + 0.003, SIGHTS.rearZ - 0.0045);
  slide.add(front, rear);
  pistol.add(slide);
  pistol.add(part(profile(FRAME_PROFILE, 0.0225, 0.001, [TRIGGER_GUARD_HOLE]), steel, 'frame'));
  for (const side of [-1, 1]) {
    const panel = part(profile(GRIP_PANEL, 0.0042, 0.0012), wood);
    panel.position.x = side * (0.01125 + 0.0021);
    pistol.add(panel);
  }
  pistol.add(part(profile(TRIGGER_PROFILE, 0.0062, 0.0006), darkSteel, 'trigger'));
  pistol.add(part(profile(HAMMER_PROFILE, 0.0068, 0.0008), darkSteel, 'hammer'));
  pistol.add(part(profile(MAG_BASE, MAGAZINE.baseHalfWidth * 2, 0.0006), darkSteel, 'magazine'));
  return pistol;
}
