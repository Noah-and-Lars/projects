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
//                 offset: [x, y, z] metres from it
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
      text: 'A 30-round box magazine of 5.56×45mm rounds. A spring pushes the follower and the rounds up to the feed lips, where the bolt strips off the top round each time it closes.',
      anchor: 'magazine', offset: [0, -0.02, 0],
      moves: [{ nodes: ['magazine*'], path: [[0, -0.04, 0.002], [0, -0.13, 0.006]], time: 1.3 }],
      view: { az: 35, el: 4 },
    },
    {
      title: 'Magazine release',
      text: 'Pressing the button on the right, or the ambidextrous lever on the left, pulls the magazine catch out of the notch in the magazine, which then drops free.',
      anchor: 'magazine_release_button',
      moves: [
        { nodes: ['magazine_release_button*'], by: [-0.016, 0, 0], time: 0.8 },
        { nodes: ['magazine_release_lever_left'], by: [0.014, 0, 0], time: 0.8, after: 0 },
      ],
      view: { az: 205, el: -4, min: 0.07 },
    },
    {
      title: 'Bolt catch',
      text: 'After the last shot the empty magazine’s follower pushes the bolt catch up to hold the bolt open. Its paddle on the left, or the lever on the right, lets the bolt fly forward again.',
      anchor: 'bolt_catch',
      moves: [
        { nodes: ['bolt_catch'], by: [0.016, 0.004, 0], time: 0.8 },
        { nodes: ['bolt_release_lever_right'], by: [-0.014, 0, 0], time: 0.8, after: 0 },
      ],
      view: { az: 20, el: 8, min: 0.07 },
    },
    {
      title: 'Safety selector',
      text: 'A quarter turn moves it between SAFE and FIRE. On SAFE its shaft sits under the tail of the trigger so the trigger can’t be pulled. There’s a lever on each side.',
      anchor: 'safety_selector_left',
      moves: [
        { nodes: ['safety_selector_left'], by: [0.016, 0, 0], time: 0.8 },
        { nodes: ['safety_selector_right'], by: [-0.016, 0, 0], time: 0.8, after: 0 },
      ],
      view: { az: -25, el: 10, min: 0.07 },
    },
    {
      title: 'Rear takedown pin',
      text: 'Pushed out from the left, the captive takedown pin frees the back of the upper receiver. It stays in the lower, held by a spring and detent, so it can’t get lost.',
      anchor: 'rear_takedown_pin_head',
      moves: [{ nodes: ['rear_takedown_pin*'], by: [-0.016, 0, 0], time: 0.8 }],
      view: { az: 215, el: 8, min: 0.07 },
      keep: true,
    },
    {
      title: 'Upper receiver',
      text: 'It carries the barrel, the bolt carrier group and the charging handle. Hinged on the front pivot pin, it tips open so the parts inside can slide out of the back.',
      anchor: 'upper_receiver', offset: [0, 0.01, -0.03],
      moves: [{ nodes: UPPER, turn: { axis: [1, 0, 0], deg: 32, pivot: PIVOT }, time: 1.6 }],
      view: { az: 30, el: 10 },
      keep: true,
    },
    {
      title: 'Charging handle',
      text: 'Pulling it back drags the bolt carrier with it, to load the first round or clear the chamber. It stays put when the rifle fires; a latch on each side holds it closed.',
      anchor: 'charging_handle', offset: [0, 0, -0.03],
      moves: [{ nodes: ['charging_handle*'], path: [[0, 0, -0.11], [0, 0.03, -0.16]], time: 1.3 }],
      view: { az: -38, el: 22 },
      keep: true,
    },
    {
      title: 'Bolt carrier group',
      text: 'The heart of the rifle. Gas drives the carrier back, which unlocks the bolt and throws out the empty case; the buffer spring then drives it forward to chamber the next round and lock.',
      anchor: 'bolt_carrier', offset: [0, 0, -0.03],
      moves: [{ nodes: BCG, by: [0, 0, -0.27], time: 1.6 }],
      view: { az: -32, el: 18 },
      keep: true,
    },
    {
      title: 'Cam pin',
      text: 'Riding in a curved slot in the carrier, the cam pin twists the bolt to lock and unlock it. With the small firing pin retaining pin pulled, it turns a quarter and lifts out.',
      anchor: 'cam_pin',
      moves: [
        { nodes: ['firing_pin_retaining_pin'], by: [-0.03, 0, 0], time: 0.8 },
        { nodes: ['cam_pin'], turn: { axis: [0, 1, 0], deg: 90, pivot: 'cam_pin' }, by: [0, 0.035, 0], time: 1.0 },
      ],
      view: { az: 10, el: 28, min: 0.09 },
      keep: true,
    },
    {
      title: 'Bolt',
      text: 'It locks into the barrel extension with seven lugs. Its hooked extractor grips the case rim, and the spring-loaded ejector in its face flicks the empty case out of the port.',
      anchor: 'bolt',
      moves: [{ nodes: ['bolt', 'extractor', 'ejector', 'firing_pin', 'firing_pin_tip'], by: [0, 0, 0.055], time: 1.1 }],
      view: { az: 20, el: 35, min: 0.1 },
      keep: true,
    },
    {
      title: 'Gas key',
      text: 'Screwed and staked to the carrier, it takes the gas coming back down the gas tube and turns it into the push that cycles the action. It isn’t removed in normal cleaning.',
      anchor: 'gas_key',
      moves: [
        { nodes: ['gas_key', 'gas_key_tip', 'gas_key_screw_*'], by: [0, 0.022, 0], time: 0.9 },
        { nodes: ['gas_key_screw_*'], by: [0, 0.014, 0], time: 0.6, after: 0.5 },
      ],
      view: { az: 25, el: 30, min: 0.1 },
      close: 5, // the bolt carrier group and charging handle go back; the upper stays open
    },
    {
      title: 'Trigger',
      text: 'Pulled, the flat-faced trigger releases the hammer onto the firing pin; the disconnector catches the hammer after each shot, so it fires once per pull. Two cross pins hold it in.',
      anchor: 'trigger_unit', offset: [0, 0.006, 0],
      moves: [
        { nodes: ['trigger_pin_plate_left'], by: [0.018, 0, 0], time: 0.7 },
        { nodes: ['trigger_pin_plate_right'], by: [-0.018, 0, 0], time: 0.7, after: 0 },
        { nodes: ['trigger_unit*'], by: [0, 0.05, 0], time: 1.1 },
      ],
      view: { az: 28, el: 16, min: 0.1, frame: ['lower_receiver'] },
    },
    {
      title: 'Dust cover',
      text: 'It keeps dirt out of the ejection port and springs open the moment the bolt carrier moves. It hangs on a hinge pin held in by a small clip.',
      anchor: 'dust_cover',
      moves: [
        { nodes: ['dust_cover_clip'], by: [-0.006, -0.01, 0], time: 0.6 },
        { nodes: ['dust_cover_hinge_pin'], by: [0, 0, -0.1], time: 1.0 },
        { nodes: ['dust_cover', 'dust_cover_spring'], by: [-0.03, -0.006, 0], time: 0.9, after: 1.2 },
      ],
      view: { az: 200, el: 10, min: 0.1 },
    },
    {
      title: 'Forward assist',
      text: 'Struck with the palm, its pawl catches the notches on the side of the bolt carrier and shoves it the last bit forward if it hasn’t locked, for example in a dirty chamber.',
      anchor: 'forward_assist',
      moves: [{ nodes: ['forward_assist*'], by: [-0.022, 0.002, -0.022], time: 0.9 }],
      view: { az: 220, el: 14, min: 0.08 },
    },
    {
      title: 'Handguard',
      text: 'Free-floating: it clamps to the barrel nut and never touches the barrel, so a sling or rest can’t bend the barrel and shift the shot. Hand stops bolt into its M-LOK slots.',
      anchor: 'handguard', offset: [0, -0.012, 0],
      moves: [
        { nodes: ['handguard_clamp_screw_*'], by: [-0.014, 0, 0], time: 0.7 },
        { nodes: ['handguard_clamp_nut_*'], by: [0.012, 0, 0], time: 0.7, after: 0 },
        { nodes: HANDGUARD, by: [0, 0, 0.42], time: 1.9 },
      ],
      view: { az: 35, el: 12 },
      keep: true,
    },
    {
      title: 'Muzzle brake',
      text: 'It screws onto the threaded end of the barrel. Its ports throw the escaping gas sideways and back, cutting recoil and muzzle climb.',
      anchor: 'muzzle_device',
      moves: [{ nodes: ['muzzle_device'], turn: { axis: [0, 0, 1], deg: -540, pivot: 'muzzle_device' }, by: [0, 0, 0.06], time: 1.4 }],
      view: { az: 50, el: 8, min: 0.12 },
      keep: true,
    },
    {
      title: 'Gas block and gas tube',
      text: 'Gas from a small port in the barrel flows up through the gas block and back along the tube to the bolt carrier: the direct impingement system that cycles the rifle.',
      anchor: 'gas_block',
      moves: [
        { nodes: ['gas_block_set_screw_*'], by: [0, -0.012, 0], time: 0.7 },
        { nodes: ['gas_block', 'gas_tube'], by: [0, 0, 0.07], time: 1.2 },
      ],
      view: { az: 30, el: 12, min: 0.18, frame: ['gas_tube'] },
      keep: true,
    },
    {
      title: 'Barrel and barrel nut',
      text: 'The barrel nut screws onto the upper receiver and clamps the barrel extension, where the bolt locks, in place. The rifling inside spins the bullet so it flies point first.',
      anchor: 'barrel_nut',
      moves: [
        { nodes: ['barrel_nut'], turn: { axis: [0, 0, 1], deg: 360, pivot: 'barrel_nut' }, by: [0, 0, 0.03], time: 1.2 },
        { nodes: BARREL, by: [0, 0, 0.07], time: 1.2 },
      ],
      view: { az: 28, el: 10, min: 0.2 },
    },
    {
      title: 'Pistol grip',
      text: 'One screw inside holds it to the lower. It also traps the spring and detent that give the safety selector its clicks.',
      anchor: 'pistol_grip',
      moves: [{ nodes: ['pistol_grip*'], by: [0, -0.042, -0.03], time: 1.1 }],
      view: { az: 30, el: -6, min: 0.12 },
    },
    {
      title: 'Buttstock',
      text: 'Lifting its latch frees the lock pin from the row of holes under the buffer tube, so the stock slides to fit the shooter, or right off.',
      anchor: 'stock', offset: [0, 0.01, 0],
      moves: [
        { nodes: ['stock_latch_*', 'stock_lock_pin'], by: [0, -0.006, 0], time: 0.5 },
        { nodes: ['stock*', 'butt_pad_*'], by: [0, 0, -0.13], time: 1.4 },
      ],
      view: { az: -30, el: 8 },
      keep: true,
    },
    {
      title: 'Buffer tube',
      text: 'It screws into the lower and holds the buffer and recoil spring that send the bolt carrier back forward. The castle nut locks it and keeps the end plate tight.',
      anchor: 'buffer_tube',
      moves: [
        { nodes: ['castle_nut'], turn: { axis: [0, 0, 1], deg: 270, pivot: 'castle_nut' }, by: [0, 0, -0.035], time: 1.0 },
        { nodes: ['end_plate*'], by: [0, 0, -0.02], time: 0.6 },
        { nodes: ['buffer_tube', 'castle_nut', 'end_plate*'], turn: { axis: [0, 0, 1], deg: -360, pivot: 'buffer_tube' }, by: [0, 0, -0.045], time: 1.1 },
      ],
      view: { az: -25, el: 12, min: 0.16 },
    },
    {
      title: 'Rear sight',
      text: 'It clamps to the top rail and folds flat when an optic is fitted. The shooter looks through its aperture; the knob on the side moves it left and right to zero the rifle.',
      anchor: 'rear_sight_base',
      moves: [{ nodes: ['rear_sight_*'], by: [0, 0.035, 0], time: 0.9 }],
      view: { az: -35, el: 16, min: 0.09 },
    },
    {
      title: 'Front sight',
      text: 'Its post screws up or down to set elevation. With the post centred in the rear aperture, the bullet goes where the top of the post sits.',
      anchor: 'front_sight_base',
      moves: [{ nodes: ['front_sight_*'], by: [0, 0.035, 0], time: 0.9 }],
      view: { az: 60, el: 14, min: 0.09 },
    },
  ],
};
