// The PF-9 breakdown: which parts come out, in what order, which way, from
// where the camera watches, and what each label says. src/showcase/
// breakdown.js plays it (new Breakdown({ script: PF9_BREAKDOWN, ... })).
//
// The model is assets/breakdown/pf9.glb, made by tools/breakdown/
// prepare_pf9.py and build_breakdown.mjs from "Pistol 9mm Custom" by ~D-Try~
// (CC BY 4.0, see README.md, Credits), the model the game's PF-9 is made
// from: a compact striker-fired 9 mm with a polymer frame, and its
// attachments (a clamp mount, a slide rail cover, a red dot sight, a laser,
// two lights and three suppressors). Each of its 97 parts is a node named
// in tools/breakdown/pf9.json; a node sits at the middle of its part. The
// download models the pistol's outside and its main parts, not the springs
// and small parts inside the frame and slide (the locking block, the
// trigger housing, the striker's spring), so the cards tell of those but
// the film doesn't show them.
//
// The model's axes (metres): +Z towards the muzzle, +Y up, +X the pistol's
// left side (-X its right, the ejection-port side). The bore is at
// x = -0.0065, y = 0.0337; the muzzle at z = 0.003.
//
// Each step is laid out as in src/showcase/arSlrParts.js (title, text,
// anchor, offset, moves, view, card, keep, close). An offset is in the
// part's own frame, in metres from its middle. Within a step, a move listed later is made first, in the parts' resting frame, and the earlier
// ones carry it (the barrel slides out along its own line once it has
// tipped). A move with enter: true brings its parts in from out of the
// picture instead (they rest where they're mounted, and aren't there till
// it plays): the attachments come on that way, are labelled, and come off
// again (the clamp mount, red dot, laser, light and long suppressor stay on
// for the end).
//
// The film goes in the order of a field strip: the magazine, the slide
// (trigger pulled, slide lock down), then out of the slide the recoil
// spring and the barrel, which go back in; the slide's own parts (cover
// plate, extractor; they go back in the reverse order) and the sights (the
// download has no striker: the block behind the cover plate is the slide's
// own rear, so the cover plate's card tells of the striker); then the frame's pins, slide stop lever and trigger, after which
// everything goes back together. Then the attachments, one at a time: the
// ones that can't go on with the clamp mount, then the clamp mount and what
// goes on its rails, and last the long suppressor.

export const PF9_MODEL = new URL('../../assets/breakdown/pf9.glb', import.meta.url);

const SLIDE = ['slide', 'front_sight', 'rear_sight', 'slide_cover_plate', 'slide_rear_block', 'slide_insert', 'extractor', 'barrel', 'recoil_spring'];
const MAGAZINE = ['magazine', 'magazine_lips', 'magazine_follower', 'magazine_floorplate'];
const TRIGGER = ['trigger', 'trigger_safety'];
// Pivots and lines (metres, in the model's frame).
const TRIGGER_PIVOT = [-0.0065, 0.004, -0.089];
const BARREL_FRONT = [-0.0065, 0.0337, 0.002];
// Along the magazine, out of the grip (the grip's rake, 20.7 degrees), and
// across its floor, forward.
const MAG_OUT = [0, -0.935, -0.354];
const MAG_FORWARD = [0, -0.354, 0.935];
const along = (dir, d, plus = [0, 0, 0]) => dir.map((c, k) => +(c * d + plus[k]).toFixed(4));

export const PF9_BREAKDOWN = {
  name: 'PF-9',
  subtitle: 'Field strip and attachments',
  model: PF9_MODEL,
  credit: 'Model: "Pistol 9mm Custom" by ~D-Try~, CC BY 4.0',
  steps: [
    {
      title: 'Magazine',
      text: 'Fifteen rounds of 9×19mm in a double stack, fed from alternate sides. Press the catch behind the trigger guard and it drops free; then pull the slide back and check the chamber is empty.',
      anchor: 'magazine',
      moves: [
        { nodes: ['magazine_release', 'magazine_catch'], by: [-0.0015, 0, 0], time: 0.25, click: false },
        { nodes: MAGAZINE, path: [along(MAG_OUT, 0.04), along(MAG_OUT, 0.12)], time: 1.1 },
      ],
      view: { az: 34, el: 2, min: 0.14 },
      keep: true,
    },
    {
      title: 'Floorplate and follower',
      text: 'Press the locking insert through the hole in the floorplate and slide the plate forward; the spring and follower come out of the bottom. The spring pushes the follower and the rounds up to the feed lips, where the slide strips off the top one.',
      anchor: ['magazine_floorplate', 'magazine_follower'],
      moves: [
        { nodes: ['magazine_floorplate'], path: [along(MAG_FORWARD, 0.03), along(MAG_FORWARD, 0.05, along(MAG_OUT, 0.012))], time: 0.9 },
        { nodes: ['magazine_follower'], path: [along(MAG_OUT, 0.115), along(MAG_OUT, 0.135)], time: 1.4 },
      ],
      view: { az: 30, el: -30, min: 0.1 },
      close: 1,
    },
    {
      title: 'Slide',
      text: 'With the chamber empty, pull the trigger to let the striker forward, draw the slide back a few millimetres and pull the slide lock down on both sides: the slide runs forward off the frame’s four steel rails.',
      anchor: 'slide',
      moves: [
        { nodes: TRIGGER, turn: { axis: [1, 0, 0], deg: 12, pivot: TRIGGER_PIVOT }, time: 0.4 },
        { nodes: SLIDE, by: [0, 0, -0.003], time: 0.35, click: false },
        { nodes: ['slide_lock'], by: [0, -0.002, 0], time: 0.3, click: false },
        { nodes: SLIDE, path: [[0, 0, 0.05], [0, 0.035, 0.09], [0, 0.07, 0.11]], time: 1.5 },
      ],
      view: { az: 28, el: 12, frame: ['frame'] },
      keep: true,
    },
    {
      title: 'Recoil spring assembly',
      text: 'A captive spring on its guide rod. The slide compresses it as it recoils; it drives the slide forward again, which strips the next round from the magazine and pushes it into the chamber.',
      anchor: 'recoil_spring',
      moves: [{ nodes: ['recoil_spring'], path: [[0, 0, 0.004], [0, -0.03, 0.006], [0, -0.032, 0.05]], time: 1.2 }],
      view: { az: 38, el: 16, frame: ['slide'] },
      keep: true,
    },
    {
      title: 'Barrel',
      text: 'Locked, its squared chamber sits in the ejection port. Firing, slide and barrel recoil together for a few millimetres, then a cam under the chamber meets the locking block and tips the barrel’s rear down, unlocking it. Polygonal rifling spins the bullet.',
      anchor: 'barrel',
      moves: [
        { nodes: ['barrel'], turn: { axis: [1, 0, 0], deg: -7, pivot: BARREL_FRONT }, time: 0.6 },
        { nodes: ['barrel'], path: [[0, -0.022, 0.002], [0, -0.03, -0.045]], time: 1.0 },
      ],
      view: { az: 140, el: 14, frame: ['slide'] },
      card: 'left',
      close: 2, // the barrel goes back in, then the recoil spring
    },
    {
      title: 'Slide cover plate',
      text: 'Push the spacer sleeve forward and the plate slides down off the slide. It holds in the striker assembly, which fires the pistol in place of a hammer: the slide half-cocks the striker as it closes, and the trigger pull finishes cocking it and lets it go.',
      anchor: 'slide_cover_plate',
      moves: [{ nodes: ['slide_cover_plate'], path: [[0, -0.022, 0], [0, -0.028, -0.014]], time: 0.9 }],
      view: { az: -130, el: 28, min: 0.065 },
      keep: true,
    },
    {
      title: 'Extractor',
      text: 'Its claw grips the rim of the case so the slide can draw it out of the chamber until the ejector knocks it out of the port. It stands out a little when a round is chambered: a loaded-chamber indicator you can see and feel.',
      anchor: 'extractor',
      moves: [{ nodes: ['extractor'], by: [-0.022, 0, 0], time: 0.8 }],
      view: { az: -150, el: 16, min: 0.07 },
      card: 'left',
      close: 2, // the extractor, then the cover plate
    },
    {
      title: 'Sights',
      text: 'Front post centred in the rear notch, level across the top: the shot goes where the top of the post sits. The rear sight sits in a dovetail and is drifted sideways for windage; the front is fixed from inside the slide.',
      anchor: ['rear_sight', 'front_sight'],
      moves: [
        { nodes: ['rear_sight'], by: [-0.03, 0, 0], time: 0.8 },
        { nodes: ['front_sight'], by: [0, 0.018, 0], time: 0.7, after: 0.3 },
      ],
      view: { az: 155, el: 24, frame: ['slide'] },
      card: 'left',
      close: 1,
    },
    {
      title: 'Frame pins',
      text: 'Three pins hold the steel parts in the polymer frame: the trigger housing pin at the back, the trigger pin and the locking block pin above the trigger. Pushed out with a punch, they free the slide stop lever, the locking block and the trigger mechanism.',
      // (Each pin is only its two ends: the dot goes on the right-hand one.)
      anchor: [
        { name: 'trigger_housing_pin', offset: [-0.0079, 0, 0] },
        { name: 'trigger_pin', offset: [-0.0109, 0, 0] },
        { name: 'locking_block_pin', offset: [-0.0105, 0, 0] },
      ],
      moves: [
        { nodes: ['trigger_housing_pin'], by: [-0.026, 0, 0], time: 0.7 },
        { nodes: ['trigger_pin'], by: [-0.034, 0, 0], time: 0.7, after: 0.35 },
        { nodes: ['locking_block_pin'], by: [-0.044, 0, 0], time: 0.8, after: 0.7 },
      ],
      view: { az: 118, el: 30, min: 0.075 },
      card: 'left',
      keep: true,
    },
    {
      title: 'Slide stop lever',
      text: 'After the last shot the magazine follower pushes it up, and it catches the slide open: the pistol shows it is empty and is ready for a fresh magazine. Press it down, or pull the slide back and let go, to close the slide.',
      anchor: 'slide_stop_lever',
      moves: [{ nodes: ['slide_stop_lever'], path: [[0, 0, -0.008], [0.012, 0.025, -0.012]], time: 1.0 }],
      view: { az: 45, el: 20, min: 0.055 },
      keep: true,
    },
    {
      title: 'Trigger',
      text: 'The blade in its face is the first of three passive safeties: the trigger can’t move unless the blade is pressed too. Pulled, the trigger bar lifts the striker’s safety plunger and draws the striker back until it slips free and fires.',
      anchor: 'trigger',
      moves: [{ nodes: TRIGGER, path: [[0, 0.055, 0], [0, 0.066, 0.02]], time: 1.3 }],
      view: { az: 32, el: 14, min: 0.1, frame: ['frame'] },
      // Then everything goes back together.
    },
    {
      title: 'Slide rail cover',
      text: 'It fits over the front of the slide and gives it a rail on top, so an optic can ride on the slide itself. A sight up there moves with every shot, so it has to take the slide’s full recoil.',
      anchor: 'rail_cover', offset: [0, 0.0151, 0.0079], // (its rail: its middle is in the slide)
      moves: [{ nodes: ['rail_cover'], enter: true, path: [[0, 0, 0.07], [0, 0.02, 0.1]], time: 1.3 }],
      view: { az: 40, el: 20 },
    },
    {
      title: 'Compact weapon light',
      text: 'On the frame’s accessory rail, it lights and identifies a target in the dark while both hands stay on the pistol; its switches at the back work it with the trigger finger or the support thumb.',
      anchor: 'compact_light',
      moves: [{ nodes: ['compact_light*'], enter: true, path: [[0, 0, 0.05], [0, -0.025, 0.07]], time: 1.2 }],
      view: { az: 30, el: -4, min: 0.12 },
    },
    {
      title: 'Short suppressor',
      text: 'It screws onto the threaded barrel. Baffles inside slow and cool the expanding gas, so the shot leaves with far less noise and flash: some 25 decibels quieter, though a supersonic bullet still cracks. Shorter and lighter than the long one, it quiets less.',
      anchor: 'short_suppressor',
      moves: [{ nodes: ['short_suppressor*'], enter: true, turn: { axis: [0, 0, 1], deg: 1080, pivot: 'short_suppressor' }, by: [0, 0, 0.05], time: 1.6 }],
      view: { az: 58, el: 10 },
    },
    {
      title: 'Box suppressor',
      text: 'A rectangular can built round the barrel and clamped to the frame’s rail. Most of its volume sits below the bore, so it adds room for the gas to expand without blocking the sights, and it carries a rail of its own underneath.',
      anchor: 'box_suppressor',
      moves: [{ nodes: ['box_suppressor*'], enter: true, path: [[0, 0, 0.08], [0, 0.015, 0.11]], time: 1.5 }],
      view: { az: 32, el: 8 },
    },
    {
      title: 'Clamp mount',
      text: 'It clamps to the frame’s accessory rail and bridges over the front of the slide, which runs freely beneath it. Its rails on top, both sides and underneath carry the optic, laser and light; an optic up here stays still while the slide moves.',
      anchor: 'clamp_mount', offset: [0.0139, -0.0166, 0.0099], // (its side plate, under the jaw: its middle is in the slide)
      moves: [
        { nodes: ['clamp_mount*'], enter: true, path: [[0, 0, 0.06], [0, 0.02, 0.09]], time: 1.4 },
        { nodes: ['clamp_mount_screw_rear'], enter: true, turn: { axis: [0, -1, 0], deg: 720, pivot: 'clamp_mount_screw_rear' }, by: [0, -0.01, 0], time: 0.7 },
        { nodes: ['clamp_mount_screw_front'], enter: true, turn: { axis: [0, -1, 0], deg: 720, pivot: 'clamp_mount_screw_front' }, by: [0, -0.01, 0], time: 0.7, after: 1.4 },
      ],
      view: { az: 34, el: 14 },
      keep: true,
    },
    {
      title: 'Red dot sight',
      text: 'An LED shines a dot onto a coated lens that reflects it back to the eye. The dot appears out at the target, so you aim with both eyes open: where the dot sits, the shot goes. Buttons on the sides set its brightness.',
      anchor: 'red_dot',
      moves: [{ nodes: ['red_dot*'], enter: true, path: [[0, 0.03, 0], [0, 0.05, -0.02]], time: 1.3 }],
      view: { az: -38, el: 16, min: 0.1 },
      keep: true,
    },
    {
      title: 'Laser',
      text: 'It projects a red dot zeroed to the bore at a set distance, so the pistol can be aimed without the sights, from awkward positions. Its two adjusters set the dot for windage and elevation.',
      anchor: 'laser',
      moves: [{ nodes: ['laser*'], enter: true, path: [[0, 0, 0.04], [0.03, 0, 0.06]], time: 1.3 }],
      view: { az: 30, el: 8, min: 0.12 },
      keep: true,
    },
    {
      title: 'Weapon light',
      text: 'The longer body holds a bigger battery, for a brighter beam that lasts longer. A lever clamps it to the mount’s bottom rail; the switch at the back turns it on, or on only while it’s pressed.',
      anchor: 'light',
      moves: [{ nodes: ['light*'], enter: true, path: [[0, 0, 0.05], [0, -0.03, 0.075]], time: 1.3 }],
      view: { az: 26, el: -8, min: 0.12 },
      keep: true,
    },
    {
      title: 'Suppressor',
      text: 'The long can: more volume and more baffles, so it quiets the shot most. Its mount holds a spring booster that lets the barrel tip and unlock in spite of the can’s weight; without one, a pistol like this may not cycle.',
      anchor: 'suppressor',
      moves: [{ nodes: ['suppressor', 'suppressor_mount'], enter: true, turn: { axis: [0, 0, 1], deg: 1080, pivot: 'suppressor' }, by: [0, 0, 0.06], time: 1.6 }],
      view: { az: 48, el: 10 },
      keep: true,
    },
  ],
};
