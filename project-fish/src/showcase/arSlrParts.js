// The AR-15 breakdown: which parts come out, in what order, which way, from
// where the camera watches, and what each label says. src/showcase/
// breakdown.js plays it (new Breakdown({ script: AR15_BREAKDOWN, ... })).
//
// The model is assets/breakdown/ar_slr.glb, made by tools/breakdown/
// build_breakdown.mjs from "AR SLR" by luapqq (CC BY 4.0, see README.md,
// Credits): a short-barrelled AR-15 with a free-floating M-LOK handguard,
// folding iron sights, ambidextrous controls and a drop-in trigger. Each of
// its 110 parts is a node named in tools/breakdown/ar_slr.json; a node sits
// at the middle of its part.
//
// The model's axes (metres): +Z towards the muzzle, +Y up, +X the rifle's
// left side (-X its right, the ejection-port side). The bore is at
// y = 0.0567.
//
// Each step:
//   title, text   the label (name, and 1 to 3 sentences on what it does)
//   anchor        the part the label's line points at (its middle), and
//                 offset: [x, y, z] metres from it (in its own frame,
//                 so it turns with it)
//   moves         what comes out, in order. Each move:
//                   nodes   names; '*' matches any run of letters, '!name'
//                           leaves a name out
//                   by      [x, y, z] metres, or path: [[x, y, z], ...]
//                           (points it goes through, from where it sits)
//                   turn    { axis, deg, pivot } turns about an axis through
//                           pivot ([x, y, z], or a part's name: its middle);
//                           with by as well it screws out
//                   time    seconds (default 1.1); after: seconds after the
//                           step's first move starts (default: after the
//                           previous move)
//                 A move is made in the model's frame, before the moves of
//                 earlier steps that are still open: so a part that came out
//                 of a part that came out moves with it.
//   view          { az, el }: where the camera looks from, in degrees: az 0
//                 from the rifle's left, 90 from the muzzle, 180 from its
//                 right, -90 from behind; el up from level. fov (degrees),
//                 min (the least size framed, metres), frame (more names to
//                 keep in the picture).
//   card          'left' puts the card on the left of a wide window (it goes
//                 on the right by default, and below in a narrow one)
//   keep          true: the parts stay out for the next step (they go back
//                 when a later step closes them). close: how many open
//                 steps (this one included) go back at its end; default all.

export const AR15_MODEL = new URL('../../assets/breakdown/ar_slr.glb', import.meta.url);

// The parts that belong to the lower receiver; everything else rides on the
// upper when it tips open.
const LOWER = [
  'lower_receiver', 'safety_selector_*', 'rear_takedown_pin*', 'front_pivot_pin*', 'trigger_*', 'magazine*',
  'bolt_catch', 'bolt_release_lever_right', 'pistol_grip*', 'stock*', 'butt_pad_*', 'buffer_tube', 'castle_nut', 'end_plate*',
];
const UPPER = ['*', ...LOWER.map((n) => '!' + n)];
const BCG = ['bolt_carrier', 'gas_key*', 'firing_pin*', 'cam_pin', 'bolt', 'extractor', 'ejector'];
const HANDGUARD = ['handguard*', 'hand_stop*', 'angled_stop*', 'front_sight_*'];
const BARREL = ['barrel', 'barrel_nut', 'gas_block*', 'gas_tube', 'muzzle_device'];
const PIVOT = 'front_pivot_pin';

export const AR15_BREAKDOWN = {
  name: 'AR-15',
  subtitle: 'Field strip and parts breakdown',
  model: AR15_MODEL,
  credit: 'Model: "AR SLR" by luapqq, CC BY 4.0',
  steps: [
    {
      title: 'Magazine',
      text: 'It holds thirty rounds of 5.56×45mm and drops free when the release is pressed; its spring pushes the rounds up to the lips, where the bolt strips off the top one. With it out, lock the bolt back and check the chamber is empty.',
      anchor: 'magazine', offset: [0, -0.02, 0],
      moves: [
        { nodes: ['magazine_release_button*'], by: [0.003, 0, 0], time: 0.25, click: false },
        { nodes: ['magazine*', '!magazine_release*'], path: [[0, -0.04, 0.002], [0, -0.13, 0.006]], time: 1.1 },
      ],
      view: { az: 35, el: 4 },
    },
    {
      title: 'Takedown pins',
      text: 'Push the rear takedown pin across and the upper receiver tips open on the front pivot pin. Both pins stay captive in the lower.',
      anchor: ['rear_takedown_pin_head', 'front_pivot_pin_head'],
      moves: [
        { nodes: ['rear_takedown_pin*'], by: [-0.016, 0, 0], time: 0.7 },
        { nodes: UPPER, turn: { axis: [1, 0, 0], deg: 32, pivot: PIVOT }, time: 1.4 },
      ],
      view: { az: 200, el: 14, frame: ['lower_receiver', 'stock'] },
      card: 'left',
      keep: true,
    },
    {
      title: 'Bolt carrier group',
      text: 'Draw the charging handle back and the carrier slides out with it. In firing, gas piped into the key on top drives it back to unlock the bolt and throw out the empty case; the buffer spring returns it, chambering the next round.',
      anchor: 'bolt_carrier', offset: [0, 0, -0.06], // (its solid back end: its middle is the open cam slot)
      moves: [
        { nodes: ['charging_handle*'], by: [0, 0, -0.06], time: 0.7 },
        { nodes: BCG, by: [0, 0, -0.06], time: 0.7, after: 0 },
        { nodes: BCG, by: [0, 0, -0.26], time: 1.2 },
      ],
      view: { az: 196, el: 18 },
      keep: true,
    },
    {
      title: 'Charging handle',
      text: 'Pulled back to a notch at the rear of the upper, it drops out. It is how you load the first round or clear the chamber, and it stays forward while the rifle fires.',
      anchor: 'charging_handle', offset: [-0.0038, 0.0032, -0.041], // (the T handle at its back: its middle is the thin shaft)
      moves: [{ nodes: ['charging_handle*'], path: [[0, 0, -0.045], [0, -0.022, -0.045], [0, -0.03, -0.09], [0, -0.075, -0.1]], time: 1.4 }],
      view: { az: 190, el: 16, frame: ['bolt_carrier'] },
      keep: true,
    },
    {
      title: 'Cam pin',
      text: 'Push out the firing pin retaining pin and the firing pin slides out of the back of the carrier; then the cam pin turns a quarter and lifts free. Riding in a curved slot in the carrier, it twists the bolt to lock and unlock.',
      anchor: 'cam_pin',
      moves: [
        { nodes: ['firing_pin_retaining_pin'], by: [-0.03, 0, 0], time: 0.6 },
        // (The model's firing pin is only its tip, in the bolt's face: it
        // slides out through the carrier and shows at the back.)
        { nodes: ['firing_pin', 'firing_pin_tip'], by: [0, 0, -0.175], time: 1.1 },
        { nodes: ['cam_pin'], turn: { axis: [0, 1, 0], deg: 90, pivot: 'cam_pin' }, by: [0, 0.035, 0], time: 0.9 },
      ],
      view: { az: 170, el: 30, min: 0.08 },
      keep: true,
    },
    {
      title: 'Bolt',
      text: 'It slides out of the front of the carrier. Seven lugs lock it into the barrel extension; the extractor hooks the case rim, and the spring-loaded ejector flicks the empty case out of the port.',
      anchor: 'bolt', offset: [-0.0062, 0.0004, 0], // (its side: the extractor covers its middle)
      moves: [{ nodes: ['bolt', 'extractor', 'ejector'], by: [0, 0, 0.042], time: 1.0 }],
      view: { az: 150, el: 26, min: 0.06 },
      close: 4, // the bolt carrier group and charging handle go back; the upper stays open
    },
    {
      title: 'Pistol grip',
      text: 'One screw holds it on. It also traps the detent spring that gives the safety selector its clicks, so it comes off first.',
      anchor: 'pistol_grip',
      moves: [{ nodes: ['pistol_grip*'], by: [0, -0.042, -0.03], time: 1.0 }],
      view: { az: 30, el: -6, min: 0.12 },
      keep: true,
    },
    {
      title: 'Trigger group and safety',
      text: 'On SAFE the selector blocks the trigger. Pulled, the trigger releases the hammer, which its spring snaps onto the firing pin; the disconnector catches it so it fires once per pull.',
      anchor: 'trigger_unit', offset: [0, 0.006, 0],
      moves: [
        { nodes: ['safety_selector_left'], by: [0.02, 0, 0], time: 0.6 },
        { nodes: ['safety_selector_right'], by: [-0.02, 0, 0], time: 0.6, after: 0 },
        { nodes: ['trigger_pin_plate_left'], by: [0.018, 0, 0], time: 0.6, after: 0.3 },
        { nodes: ['trigger_pin_plate_right'], by: [-0.018, 0, 0], time: 0.6, after: 0.3 },
        { nodes: ['trigger_unit*'], by: [0, 0.05, 0], time: 1.0 },
      ],
      view: { az: 28, el: 16, min: 0.1, frame: ['lower_receiver'] },
    },
    {
      title: 'Handguard',
      text: 'Free-floating: it clamps to the barrel nut and never touches the barrel, so a grip or rest on it can’t bend the barrel and shift the shot. Two screws loosen and it slides off the front.',
      anchor: 'handguard', offset: [0, -0.012, 0],
      moves: [
        { nodes: ['handguard_clamp_screw_*'], by: [-0.014, 0, 0], time: 0.6 },
        { nodes: ['handguard_clamp_nut_*'], by: [0.012, 0, 0], time: 0.6, after: 0 },
        { nodes: HANDGUARD, path: [[0, 0, 0.3], [0, -0.1, 0.36]], time: 1.8 },
      ],
      view: { az: 32, el: 12, frame: ['upper_receiver'] },
      card: 'left',
      keep: true,
    },
    {
      title: 'Barrel, gas block and muzzle brake',
      text: 'The barrel nut clamps the barrel to the upper; rifling inside spins the bullet so it flies point first. The gas block taps gas from a port drilled partway down the barrel, under the block, and sends it back down the tube to the carrier. The brake throws gas sideways to tame recoil.',
      anchor: [{ name: 'barrel_nut', offset: [0.015, 0.0068, 0.0105] }, 'gas_block', 'muzzle_device'], // (the nut's rim: the barrel runs through its middle)
      moves: [
        { nodes: ['muzzle_device'], turn: { axis: [0, 0, 1], deg: 540, pivot: 'muzzle_device' }, by: [0, 0, 0.05], time: 1.0 },
        { nodes: ['gas_block_set_screw_*'], by: [0, -0.012, 0], time: 0.4 },
        { nodes: ['gas_block*', 'gas_tube', 'muzzle_device'], by: [0, 0, 0.1], time: 0.9 },
        { nodes: ['barrel_nut'], turn: { axis: [0, 0, 1], deg: 360, pivot: 'barrel_nut' }, by: [0, 0, 0.03], time: 0.9 },
        { nodes: BARREL, by: [0, 0, 0.09], time: 0.9 },
      ],
      view: { az: 34, el: 12, frame: ['upper_receiver'] },
      card: 'left',
      keep: true, // it stays out for the dust cover's hinge pin
    },
    {
      title: 'Dust cover and forward assist',
      text: 'The dust cover keeps dirt out of the ejection port and springs open when the carrier moves. Its hinge pin slides out of the front of the upper, once the handguard and barrel are off. The forward assist shoves the carrier home if it hasn’t locked.',
      anchor: ['dust_cover', 'forward_assist'],
      moves: [
        { nodes: ['dust_cover_clip'], by: [-0.006, -0.01, 0], time: 0.5 },
        { nodes: ['dust_cover_hinge_pin'], by: [0, 0, 0.09], time: 0.8 },
        { nodes: ['dust_cover', 'dust_cover_spring'], by: [-0.045, -0.012, 0], time: 0.8, after: 1.0 },
        { nodes: ['forward_assist*'], by: [-0.03, 0.003, -0.03], time: 0.8, after: 1.0 },
      ],
      view: { az: 200, el: 14, min: 0.1 },
      card: 'left',
    },
    {
      title: 'Stock and buffer tube',
      text: 'The latch lets the stock slide along the buffer tube, or off. The tube, locked by the castle nut, holds the buffer and spring that return the carrier.',
      anchor: [{ name: 'stock', offset: [0.0053, 0.0063, -0.0036] }, { name: 'buffer_tube', offset: [0, 0.01, 0] }],
      moves: [
        { nodes: ['stock_latch_*', 'stock_lock_pin'], by: [0, -0.006, 0], time: 0.4 },
        { nodes: ['stock*', 'butt_pad_*'], by: [0, 0, -0.15], time: 1.2 },
        { nodes: ['castle_nut'], turn: { axis: [0, 0, 1], deg: -270, pivot: 'castle_nut' }, by: [0, 0, -0.035], time: 0.8, after: 1.2 },
        { nodes: ['buffer_tube', 'castle_nut', 'end_plate*'], turn: { axis: [0, 0, 1], deg: -360, pivot: 'buffer_tube' }, by: [0, 0, -0.05], time: 1.0 },
      ],
      view: { az: -30, el: 10 },
    },
    {
      title: 'Iron sights',
      text: 'Folding sights on the top rail. Centre the front post in the rear aperture and the shot goes where the post’s tip sits. The post sets elevation, the rear knob windage.',
      anchor: ['rear_sight_base', 'front_sight_base'],
      moves: [
        { nodes: ['rear_sight_*'], by: [0, 0.05, 0], time: 0.8 },
        { nodes: ['front_sight_*'], by: [0, 0.05, 0], time: 0.8, after: 0.25 },
      ],
      view: { az: 22, el: 10, frame: ['upper_receiver', 'handguard'] },
    },
  ],
};
