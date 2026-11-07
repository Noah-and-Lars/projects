// The Galil ACE breakdown: which parts come out, in what order, which way,
// from where the camera watches, and what each label says. src/showcase/
// breakdown.js plays it (new Breakdown({ script: GALIL_ACE_BREAKDOWN, ... })).
//
// The model is assets/breakdown/galil_ace.glb, made by tools/breakdown/
// bake_rigid.mjs and build_breakdown.mjs from "Galil Ace" by MarkLevin
// (CC BY 4.0, see README.md, Credits): a short-barrelled 5.56mm Galil ACE
// with a polymer handguard railed on four sides and its rail covers. The
// download moves its parts by bones; the build bakes each into its own
// rigid part, 29 of them, named in tools/breakdown/galil_ace.json. A node
// sits at the middle of its part.
//
// The model's axes (metres), as the AR-15's: +Z towards the muzzle, +Y up,
// +X the gun's left side (-X its right, the ejection-port side). The bore
// is at y = 0.071.
//
// The steps are written as in src/showcase/arSlrParts.js (see there for
// every field). The first five are the field strip, in the order the real
// rifle comes apart; the rest are an armourer's work or show how a part is
// worked.

export const GALIL_ACE_MODEL = new URL('../../assets/breakdown/galil_ace.glb', import.meta.url);

const BCG = ['bolt_carrier', 'bolt', 'charging_handle'];
const COVER = ['top_cover', 'top_rail', 'rear_sight'];

export const GALIL_ACE_BREAKDOWN = {
  name: 'IWI Galil ACE',
  subtitle: 'Field strip and parts breakdown',
  model: GALIL_ACE_MODEL,
  credit: 'Model: "Galil Ace" by MarkLevin, CC BY 4.0',
  steps: [
    {
      title: 'Magazine',
      text: 'Push the paddle release in front of the trigger guard forward and the magazine rocks forward and out, as on an AK. Its spring and follower push the rounds up to the feed lips. With it out, draw the charging handle back and check the chamber is empty.',
      anchor: 'magazine', offset: [0, 0.02, 0],
      moves: [
        { nodes: ['magazine_catch'], turn: { axis: [1, 0, 0], deg: -14, pivot: [-0.0064, 0.0318, -0.0942] }, time: 0.35, click: false },
        { nodes: ['magazine*', '!magazine_catch'], turn: { axis: [1, 0, 0], deg: -12, pivot: [-0.008, 0.062, 0.04] }, time: 0.6 },
        { nodes: ['magazine*', '!magazine_catch'], path: [[0, -0.03, 0.008], [0, -0.115, 0.02]], time: 1.0 },
      ],
      view: { az: 32, el: 2 },
      keep: true,
    },
    {
      title: '5.56×45mm round',
      text: 'A brass case 45 mm long, necked down to hold a 5.56 mm bullet over its powder. The bolt strips the top round forward out of the lips and into the chamber; the firing pin strikes the primer in the middle of the case head.',
      anchor: 'magazine_round_1',
      moves: [{ nodes: ['magazine_round_1'], path: [[0, 0.003, 0.025], [0, 0.02, 0.05]], time: 1.0 }],
      view: { az: 12, el: 18, min: 0.1, frame: ['magazine_follower'] },
      close: 1, // the round goes back; the magazine stays out for the field strip
    },
    {
      title: 'Top cover',
      text: 'Press in the end of the recoil spring guide at the back of the receiver and the top cover lifts away. It carries the rear sight and the back of the top Picatinny rail, and it locks up tightly, so an optic mounted on it holds its zero.',
      anchor: 'top_cover', offset: [0.02, 0, 0.02],
      moves: [
        { nodes: COVER, turn: { axis: [1, 0, 0], deg: 8, pivot: [-0.006, 0.095, 0.012] }, time: 0.6 },
        { nodes: COVER, by: [-0.045, 0.075, -0.02], time: 1.0 },
      ],
      view: { az: 26, el: 18 },
      keep: true,
    },
    {
      title: 'Bolt carrier and piston',
      text: 'With the recoil spring drawn out, the carrier slides back and lifts free. Carrier and gas piston are one piece, as on an AK: gas from the barrel drives the piston back, the carrier’s cam track turns the bolt to unlock it, and the spring returns it. The charging handle rides on it, on the left.',
      anchor: [{ name: 'bolt_carrier', offset: [0, 0, -0.075] }, 'charging_handle'],
      moves: [
        { nodes: BCG, by: [0, 0, -0.12], time: 1.1 },
        { nodes: BCG, by: [0.045, 0.06, -0.02], time: 0.8 },
      ],
      view: { az: 30, el: 20 },
      keep: true,
    },
    {
      title: 'Bolt',
      text: 'Turned to free its cam lug from the carrier’s track, it slides out of the front. Two lugs lock it into the trunnion behind the barrel; the extractor on its face hooks the case rim, and the firing pin runs through its middle.',
      anchor: 'bolt',
      moves: [
        { nodes: ['bolt'], turn: { axis: [0, 0, 1], deg: 35, pivot: 'bolt' }, time: 0.5 },
        { nodes: ['bolt'], by: [0, 0, 0.035], time: 0.8 },
      ],
      view: { az: 50, el: 25, min: 0.08 },
      close: 1, // the bolt goes back into the carrier; the carrier and cover stay out
    },
    {
      title: 'Trigger',
      text: 'Pulled, it lets the hammer go, which strikes the firing pin in the bolt; the disconnector on the same pin holds the hammer back until the trigger is let go, so one pull fires one shot. An armourer pushes the pin out and lifts the trigger out of the top of the receiver.',
      anchor: ['trigger', 'trigger_pin'],
      moves: [
        { nodes: ['trigger_pin'], by: [0.03, 0, 0], time: 0.6 },
        { nodes: ['trigger'], path: [[0, 0.03, 0], [0, 0.085, -0.005]], time: 1.1 },
      ],
      view: { az: 22, el: 20, min: 0.1 },
      card: 'left',
    },
    {
      title: 'Fire selector',
      text: 'Two levers work it: the thumb lever on the left, marked S for safe, R for single shots and A for automatic, and the long Galil lever on the right. On S the trigger is locked.',
      anchor: 'selector_left',
      moves: [
        { nodes: ['selector_left'], turn: { axis: [-1, 0, 0], deg: 20, pivot: [0.0045, 0.0396, -0.1853] }, time: 0.6 },
        { nodes: ['selector_right'], turn: { axis: [1, 0, 0], deg: 20, pivot: [-0.0382, 0.0667, -0.1747] }, time: 0.6, after: 0 },
      ],
      view: { az: -24, el: 6, min: 0.12 },
    },
    {
      title: 'Rail covers',
      text: 'Press a cover’s latch and it slides forward off its rail. They shield the hand from the rails’ sharp teeth and from the heat of the barrel; take one off to fit a light, a laser or a grip.',
      anchor: ['rail_cover_left', 'rail_cover_bottom'],
      moves: [
        { nodes: ['rail_cover_left_latch'], by: [-0.0025, 0, 0], time: 0.3, click: false },
        { nodes: ['rail_cover_right_latch'], by: [0.0025, 0, 0], time: 0.3, after: 0, click: false },
        { nodes: ['rail_cover_bottom_latch'], by: [0, 0.0025, 0], time: 0.3, after: 0, click: false },
        { nodes: ['rail_cover_left*'], path: [[0, 0, 0.085], [0.03, 0, 0.12]], time: 1.1, after: 0.35 },
        { nodes: ['rail_cover_right*'], path: [[0, 0, 0.085], [-0.03, 0, 0.12]], time: 1.1, after: 0.6 },
        { nodes: ['rail_cover_bottom*'], path: [[0, 0, 0.085], [0, -0.03, 0.12]], time: 1.1, after: 0.85 },
      ],
      view: { az: 36, el: -12 },
    },
    {
      title: 'Handguard',
      text: 'Polymer, with Picatinny rails along its top, sides and bottom (the covers ride on it). It keeps the hand off the barrel and gas tube, which get hot, and takes the light, laser or grip.',
      anchor: [{ name: 'handguard_top_rail', offset: [0.0072, -0.0049, 0.0077] }, { name: 'handguard', offset: [0.0165, 0, 0.0317] }],
      moves: [
        { nodes: ['handguard_top_rail'], by: [0, 0.05, 0], time: 0.8 },
        { nodes: ['handguard', 'rail_cover_*'], path: [[0, 0, 0.03], [0, -0.075, 0.05]], time: 1.2, after: 0.5 },
      ],
      view: { az: 30, el: 8 },
      card: 'left',
      keep: true,
    },
    {
      title: 'Barrel and gas block',
      text: 'Cold hammer-forged and chrome-lined, the barrel is pressed and pinned into the trunnion: an armourer’s job. The gas block pinned on it, under the front sight tower, bleeds gas from a port in the barrel to drive the piston; the flash hider scatters the muzzle flash.',
      anchor: ['barrel', { name: 'gas_block', offset: [0, 0.012, 0.05] }],
      // (The gas block stays on the barrel: the flash hider is in its way.)
      moves: [{ nodes: ['barrel', 'gas_block', 'front_sight_post'], by: [0, 0, 0.1], time: 1.3 }],
      view: { az: 30, el: 8 },
      card: 'left',
    },
    {
      title: 'Rear sight',
      text: 'An aperture on the top cover’s rail, moved sideways for windage. Look through it, centre the front post in it, and the shot goes where the post’s tip sits.',
      anchor: 'rear_sight',
      moves: [{ nodes: ['rear_sight'], by: [0, 0.03, 0], time: 0.8 }],
      view: { az: 22, el: 12, min: 0.09 },
      keep: true,
    },
    {
      title: 'Front sight',
      text: 'A post in the tower on the gas block. It screws up or down to zero the rifle for elevation, with the tool that comes with the rifle.',
      anchor: 'front_sight_post',
      moves: [{ nodes: ['front_sight_post'], turn: { axis: [0, 1, 0], deg: 720, pivot: 'front_sight_post' }, by: [0, 0.018, 0], time: 1.0 }],
      view: { az: 30, el: 12, min: 0.055 },
    },
  ],
};
