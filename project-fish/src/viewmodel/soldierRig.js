// Guns whose downloads' animations were made for arms the game can't use,
// so their clips were retargeted onto the soldier's own arms when the file
// was built (tools/blender/convert_retarget.py: the Xiri X4, x4.js, the
// MP7A1, mp7.js, and the AR-15, ar15.js). Each file is the gun, the soldier's own sleeves and gloves
// (from assets/soldier.glb) and one rig: the gun's bones, and his arm bones
// under an `arms` node, with his names (CC_Base_*), axes and centimetres.
// They're played by animatedGun.js like the guns with their own arms, the
// clips as made (retargeted, nothing added).
//
// What's the same for all of them (a gun's model constants are
// soldierRig({...}) of its own):
// - soldierArms: the arms are his. The outfit's gloves (src/gear.js) go on
//   them as they go on him, from the same files (gunGloves.js: bound to the
//   rig's bones by name), and his own gloves in the file (the mesh tagged
//   soldierGloves) are hidden under them; field gloves and No gloves are
//   his own gloves. His body's hands in photo mode take the rig's hand and
//   finger bones' turns as they are (src/player/fpArms.js).
// - the hand bones (his), and the arm meshes (left out of photo mode's copy
//   of the gun, as his body's own arms hold it there).
// - spareJoint: his skeleton has bones these rigs leave out (his legs, his
//   head...), which his outfit gloves' files list too though nothing in
//   them is weighted to them: they're tied to this bone instead.

export const SOLDIER_RIG = {
  soldierArms: true,
  bones: { shootingHand: 'CC_Base_R_Hand', supportHand: 'CC_Base_L_Hand' },
  meshes: { arms: ['soldier_gloves', 'soldier_sleeves'] },
  spareJoint: 'CC_Base_Spine02',
};

// A gun's model constants on the soldier's arms: its own over SOLDIER_RIG's.
export function soldierRig(model) {
  return { ...SOLDIER_RIG, ...model, bones: { ...SOLDIER_RIG.bones, ...model.bones }, meshes: { ...SOLDIER_RIG.meshes, ...(model.meshes || {}) } };
}
