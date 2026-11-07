// The FN SCAR-L breakdown: which parts come out, in what order, which way,
// from where the camera watches, and what each label says. src/showcase/
// breakdown.js plays it (new Breakdown({ script: SCAR_L_BREAKDOWN, ... })).
//
// The model is assets/breakdown/scar_l.glb, made by tools/breakdown/
// prepare_parts.mjs and build_breakdown.mjs from "SCAR L" by zhe_kan (CC BY
// 4.0, see README.md, Credits): a SCAR-L with a selective-fire trigger
// group, folding iron sights, a 1-6x scope on a thumbscrew mount, a
// suppressor, a vertical foregrip and a folding bipod. Each of its 50 parts
// is a node named in tools/breakdown/scar_l.json (a part of several
// materials is several nodes: its name, then <name>_m2, _m3... for the
// rest); a node sits at the middle of its piece. The download models the
// outside of the rifle, not its bolt carrier group or hammer, so the cards
// tell of those but the film doesn't show them.
//
// The model's axes (metres): +Z towards the muzzle, +Y up, +X the rifle's
// left side (-X its right, the ejection-port side). The bore is at x = 0,
// y = 0.0439.
//
// Each step is laid out as in src/showcase/arSlrParts.js (title, text,
// anchor, offset, moves, view, card, keep, close). Within a step, a move
// listed later is made first, in the parts' resting frame, and the earlier
// ones carry it: so a thumbscrew's turn is listed after the lift of the
// scope it rides on. Moves that overlap in time go back together.

export const SCAR_L_MODEL = new URL('../../assets/breakdown/scar_l.glb', import.meta.url);

const MAGAZINE = ['magazine', 'magazine_rounds*'];
const LOWER = ['lower_receiver', 'pistol_grip', 'trigger', 'safety_selector_*', 'magazine_release_*', 'bolt_release', ...MAGAZINE];
const CAN = ['suppressor', 'suppressor_m2'];
const SUPPRESSOR = [...CAN, 'suppressor_mount', 'suppressor_lever'];
const OPTIC = ['scope*', 'optic_*'];
const BIPOD = ['bipod_*'];
const FOREGRIP = ['foregrip', 'foregrip_lever'];
const STOCK = ['stock_*', 'butt_pad'];
const EXTENSION = ['stock_extension', 'stock_length_latch*', 'butt_pad'];
const BARREL = ['barrel', 'gas_block', 'gas_regulator', 'gas_piston', 'front_sight_*', ...SUPPRESSOR];

// Pivots (metres, in the model's frame).
const LOWER_PIVOT = [0, 0.02, -0.006]; // the front takedown pin
const STOCK_HINGE = [-0.0158, 0.0093, -0.2323];
const REAR_SIGHT_HINGE = [0, 0.0988, -0.203];
const FRONT_SIGHT_HINGE = [0, 0.0788, 0.2019];

export const SCAR_L_BREAKDOWN = {
  name: 'FN SCAR-L',
  subtitle: 'Field strip and parts breakdown',
  model: SCAR_L_MODEL,
  credit: 'Model: "SCAR L" by zhe_kan, CC BY 4.0',
  steps: [
    {
      title: 'Magazine',
      text: 'A standard AR-15 pattern magazine holding thirty rounds of 5.56×45mm NATO; the release on either side drops it free. Its spring pushes the rounds up to the lips, where the bolt strips off the top one. With it out, lock the bolt back and check the chamber is empty.',
      anchor: 'magazine', offset: [0, -0.02, 0],
      moves: [
        { nodes: ['magazine_release_left'], by: [-0.002, 0, 0], time: 0.25, click: false },
        { nodes: MAGAZINE, path: [[0, -0.035, 0.002], [0, -0.12, 0.008]], time: 1.1 },
      ],
      view: { az: 32, el: 4 },
      keep: true, // out till the lower's stripped (it goes back with it)
    },
    {
      title: 'Scope and mount',
      text: 'A 1–6× variable scope in a one-piece cantilever mount. Two thumbscrews clamp the mount to the top rail; undone, they let the clamp open and it lifts straight off, made to come back to the same zero. The rail runs the full length of the receiver.',
      anchor: 'scope', offset: [0.0106, 0.0032, 0.0567], // (the tube's left side, ahead of the turrets)
      moves: [
        { nodes: OPTIC, path: [[0, 0.012, 0], [0.004, 0.07, 0]], time: 1.2, after: 1.0 },
        // (Right-hand thumbscrews, heads on the left: anticlockwise seen from the left undoes them.)
        { nodes: ['optic_thumbscrew_rear'], turn: { axis: [1, 0, 0], deg: 540, pivot: [0.0111, 0.0872, -0.0988] }, by: [0.004, 0, 0], time: 0.8, after: 0 },
        { nodes: ['optic_thumbscrew_front'], turn: { axis: [1, 0, 0], deg: 540, pivot: [0.0109, 0.0872, -0.0667] }, by: [0.004, 0, 0], time: 0.8, after: 0.1 },
        { nodes: ['optic_mount_jaw'], by: [0.0035, 0, 0], time: 0.4, after: 0.6, click: false },
      ],
      view: { az: 48, el: 22, frame: ['rear_sight_base'] },
      keep: true, // off for the iron sights
    },
    {
      title: 'Rear sight',
      text: 'With the scope off, the folding sights flip up. The rear one lies flat under a scope; its aperture is set for windage and range. Look through it and centre the front post in it.',
      anchor: 'rear_sight_leaf',
      moves: [{ nodes: ['rear_sight_leaf'], turn: { axis: [1, 0, 0], deg: 90, pivot: REAR_SIGHT_HINGE }, time: 0.8 }],
      view: { az: 30, el: 14, min: 0.08, frame: ['rear_sight_base'] },
      keep: true,
    },
    {
      title: 'Front sight',
      text: 'The front post folds flat on the gas block to clear a scope’s view. Raised, it is turned up or down to set elevation; with the rear aperture it is a backup if the scope fails.',
      anchor: 'front_sight_post',
      moves: [{ nodes: ['front_sight_post'], turn: { axis: [1, 0, 0], deg: -90, pivot: FRONT_SIGHT_HINGE }, time: 0.8 }],
      view: { az: 30, el: 14, min: 0.08, frame: ['front_sight_base'] },
      close: 3, // the front and rear sights fold, the scope goes back on
    },
    {
      title: 'Suppressor',
      text: 'The can unscrews from its mount, then the latch flips up and the mount slides off the flash hider. Baffles inside slow and cool the escaping gas, muffling the shot and hiding the flash; the gas regulator’s suppressed setting offsets the extra back-pressure.',
      anchor: ['suppressor', 'suppressor_lever'],
      moves: [
        // (Right-hand thread: anticlockwise seen from the muzzle undoes it.)
        { nodes: CAN, turn: { axis: [0, 0, 1], deg: 540, pivot: 'suppressor' }, by: [0, 0, 0.03], time: 1.6 },
        { nodes: ['suppressor_lever'], turn: { axis: [0, 0, 1], deg: -40, pivot: [0.0121, 0.0594, 0.3476] }, time: 0.5 },
        { nodes: SUPPRESSOR, by: [0, 0, 0.08], time: 1.0 },
      ],
      view: { az: 75, el: 18, min: 0.2 },
      close: 1,
    },
    {
      title: 'Bipod',
      text: 'Throw its lever and the clamp jaw opens, freeing it from the bottom rail. The legs fold forward along the barrel when carried and swing down to rest the rifle steadily for long shots.',
      anchor: ['bipod_body', 'bipod_leg_left'],
      moves: [
        { nodes: BIPOD, by: [0, -0.06, 0], time: 1.1, after: 1.0 },
        { nodes: ['bipod_clamp_jaw'], by: [0.003, 0, 0], time: 0.4, after: 0.5, click: false },
        { nodes: ['bipod_lever'], turn: { axis: [0, 1, 0], deg: -85, pivot: [0.0166, 0.0079, 0.1654] }, by: [0.002, 0, 0], time: 0.6, after: 0 },
      ],
      view: { az: 36, el: -14, min: 0.14 },
      close: 1,
    },
    {
      title: 'Vertical foregrip',
      text: 'Clamped to the bottom rail by a cross-bolt: turn its lever, draw the bolt out and the grip slides down off the rail. It gives the support hand a firm hold to steer the muzzle and soak up recoil; the bolt-on side and bottom rails also take lights and lasers.',
      anchor: 'foregrip', offset: [0, -0.01, 0],
      moves: [
        { nodes: FOREGRIP, by: [0, -0.07, 0], time: 1.1, after: 1.2 },
        { nodes: ['foregrip_lever'], by: [0.022, 0, 0], time: 0.6, after: 0.55 },
        { nodes: ['foregrip_lever'], turn: { axis: [1, 0, 0], deg: 42, pivot: [0.0108, 0.0129, 0.0392] }, time: 0.5, after: 0 },
      ],
      view: { az: 14, el: -8, min: 0.12, frame: ['rail_bottom'] },
      close: 1,
    },
    {
      title: 'Lower receiver',
      text: 'The polymer lower, or trigger module, holds the trigger group, the magazine well and the controls. Push out the rear takedown pin and it pivots down on the front one; push that out too and it comes away from the aluminium upper.',
      anchor: 'lower_receiver', offset: [0, 0.012, -0.03],
      moves: [
        { nodes: LOWER, turn: { axis: [1, 0, 0], deg: -12, pivot: LOWER_PIVOT }, time: 1.2 },
        { nodes: LOWER, by: [0, -0.07, 0.01], time: 1.1 },
      ],
      view: { az: 30, el: 4, frame: ['upper_receiver'] },
      keep: true,
    },
    {
      title: 'Pistol grip',
      text: 'An AR-15 pattern grip, held on by one screw up through its base, so any standard AR grip fits. The trigger guard is moulded into the lower itself.',
      anchor: 'pistol_grip',
      moves: [{ nodes: ['pistol_grip'], by: [0, -0.04, -0.014], time: 1.0 }],
      view: { az: 22, el: -4, min: 0.13 },
      keep: true,
    },
    {
      title: 'Selector and trigger',
      text: 'The ambidextrous selector reads S, 1 and A: safe, single shots and automatic. Pulled, the trigger releases the hammer onto the firing pin; on 1 the disconnector holds the hammer after each shot until the trigger is let go.',
      anchor: ['safety_selector_left', { name: 'trigger', offset: [0.0017, 0.0007, -0.0028] }], // (the trigger's blade: its middle is at its thin edge)
      moves: [
        { nodes: ['safety_selector_left'], by: [0.02, 0, 0], time: 0.6 },
        { nodes: ['safety_selector_right'], by: [-0.02, 0, 0], time: 0.6, after: 0 },
        // (It lifts out of the top of the lower, clear of it, as it does with its pin out.)
        { nodes: ['trigger'], path: [[0, 0.06, 0], [0, 0.088, 0.004]], time: 1.1 },
      ],
      view: { az: 34, el: 18, min: 0.085 },
    },
    {
      title: 'Charging handle',
      text: 'It is joined to the bolt carrier, so it shuttles back and forth as the rifle fires; this one has a knob each side. Drawn back to the notch at the rear of its slot it pulls out sideways, freeing the bolt carrier and its recoil spring to slide out of the receiver.',
      anchor: 'charging_handle_left',
      moves: [
        { nodes: ['charging_handle_*'], by: [0, 0, -0.125], time: 1.2 },
        { nodes: ['charging_handle_left'], by: [0.03, 0, 0], time: 0.7 },
        { nodes: ['charging_handle_right'], by: [-0.03, 0, 0], time: 0.7, after: 1.2 },
      ],
      view: { az: 26, el: 24, min: 0.075 },
    },
    {
      title: 'Stock',
      text: 'Press its latch and the polymer stock folds to the right; the rifle still fires folded, as nothing runs back into the stock. It also slides in and out for length, and the cheek piece rises to bring the eye up to a scope.',
      anchor: [{ name: 'stock_hinge', offset: [0.0191, 0.0033, 0.0404] }, 'butt_pad'], // (the hinge's outer face)
      moves: [
        { nodes: ['stock_fold_latch'], by: [-0.0015, 0, 0], time: 0.3, after: 1.0, click: false },
        { nodes: STOCK, turn: { axis: [0, 1, 0], deg: 172, pivot: STOCK_HINGE }, time: 2.2, after: 1.3 },
        { nodes: ['stock_length_latch*'], by: [-0.0015, 0, 0], time: 0.3, after: 0, click: false },
        { nodes: EXTENSION, by: [0, 0, 0.058], time: 0.8, after: 0.2 },
      ],
      view: { az: -165, el: 26, frame: ['upper_receiver'] },
    },
    {
      title: 'Gas regulator',
      text: 'It plugs the front of the gas block and meters the gas that drives the action, with two settings: normal, and suppressed, which lets less gas through to offset a suppressor’s extra back-pressure. Pressed in and turned, it pulls out of the front.',
      anchor: 'gas_regulator',
      moves: [
        { nodes: ['gas_regulator'], turn: { axis: [0, 0, 1], deg: 90, pivot: 'gas_piston' }, time: 0.7 },
        { nodes: ['gas_regulator'], by: [0, 0, 0.035], time: 0.6 },
      ],
      view: { az: 145, el: 12, min: 0.07, frame: ['gas_block'] },
      card: 'left',
      keep: true,
    },
    {
      title: 'Gas piston',
      text: 'A short-stroke piston: gas tapped from the barrel kicks it back a short way, and its push drives the bolt carrier, so the hot gas and fouling stay out of the receiver. With the regulator out it slides out of the front of the gas block.',
      anchor: 'gas_piston', offset: [0, 0, -0.03],
      moves: [{ nodes: ['gas_piston'], by: [0, 0, 0.13], time: 1.2 }],
      view: { az: 125, el: 14, min: 0.1, frame: ['gas_block'] },
      card: 'left',
    },
    {
      title: 'Barrel',
      text: 'Chrome-lined and cold hammer-forged, it is held in the upper by bolts clamping its barrel extension. Loosened, the barrel slides out of the front with its gas block and front sight, so an armourer can swap in a shorter or longer one.',
      anchor: [{ name: 'barrel', offset: [0, 0, -0.13] }, 'gas_block'],
      moves: [{ nodes: BARREL, by: [0, 0, 0.2], time: 1.6 }],
      view: { az: 32, el: 10 },
    },
  ],
};
