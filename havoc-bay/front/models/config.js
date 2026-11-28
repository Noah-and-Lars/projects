/* Island Front: which downloaded model is used for which unit, and how it is fitted (see model-kit.js for every option).
   A model only changes how a unit looks; its armour, modules, weapons and flight stay as defined in vehicles.js and aircraft.js.
   To add one:
     1. python3 tools/pack_model.py <the downloaded folder, .gltf or .glb> <key>     (writes models/<key>.js and lists the model's part names)
     2. add  <script src="models/<key>.js"></script>  to index.html, above this file
     3. add a kitUse(...) line below. If the model's file is missing the unit keeps its built-in model.

   Examples (commented out until the models exist):

   // A tank whose turret and gun are separate named parts:
   // kitUse('m1a2', 'abrams', { fit: { length: 7.9 }, turret: /turret/i, gun: /gun|barrel|mantlet/i, wheels: /wheel/i, tracks: /track/i });
   //   (fit.yaw can be left out for a vehicle or a soldier: the facing is worked out. Give it if the result is back to front.)
   // A tank that is one piece: say where the turret and gun are (metres, x forward, y up, after fitting):
   // kitUse('t90a', 't90', { fit: { length: 6.9 }, split: (x, y, z) => y > 1.55 && Math.hypot(x - .2, z) < 1.7 ? 'turret' : y > 1.6 && x > 1.7 && Math.abs(z) < .25 ? 'gun' : 'hull' });
   // A helicopter:
   // kitUse('ah64', 'apache', { fit: { length: 15 }, rotor: /main.*rotor|rotor.*main|blade/i, tailRotor: /tail.*rotor/i,
   //   parts: (x, y, z) => x < -3 ? 'boom' : x > 3.5 ? 'nose' : y > 2.6 ? 'trans' : Math.abs(z) > 1.2 ? (z < 0 ? 'stubL' : 'stubR') : 'fuse',
   //   stations: { 1: [[.8, .8, -1.25], [.8, .8, 1.25]], 2: [[.9, .7, -2.15], [.9, .7, 2.15]], 3: [[.85, 1.2, -2.6], [.85, 1.2, 2.6]] } });
   // A rigged player model for both teams (Red tinted), posed by the game:
   // kitUse('soldier', 'player', { fit: { height: 1.8 }, tint: [null, [1, .85, .8]] });
   //   (the skeleton is recognised by its bone names or its shape; the figure gets the team's rifle. rifle: false if it carries its own.)
   // ... or using the model's own animations:
   // kitUse('soldier', 'player', { fit: { height: 1.8 }, clips: { idle: /idle/i, walk: /walk/i, run: /run/i, crouch: /crouch/i } });
*/
'use strict';

// Red's main battle tank: "Uralvagonzavod T-90AM Main Battle Tank" by Muhamad Mirza Arrafi (CC-BY-4.0). One piece, so it is cut up here:
// the turret is the raised part round its ring (behind the middle), the gun the thin part ahead of the hull at gun height.
kitUse('t90a', 't90am', { fit: { length: 9.6 }, tracks: /03babf5e/, trackScroll: [0, -3.15], // (the tracks have their own material; their texture runs about 3 turns a metre along the hull)
   split: (x, y, z) => y > 1.62 && x > .35 && Math.abs(z) < .32 ? 'gun' : y > 1.45 && Math.hypot(x + 1.4, z) < 1.95 ? 'turret' : 'hull' });

// Jets for the title screen's jet choice (kitJet in model-kit.js fits the downloaded models). The F-2 and Typhoon keep their hand-fitted models.
const JET_LOOKS = { f2: 'F-2', typhoon: 'Typhoon', mig35: 'MiG-35', a10: 'A-10', fa18: 'F/A-18' };
// where each model's engine flames start (metres, x forward, wheels at y = 0; measured from the models)
const JET_FIT = { mig35: { nozzles: [[-7.3, 1.75, -.68, .5], [-7.3, 1.75, .68, .5]] }, a10: { nozzles: [[-2.3, 2.45, -1.45, .55], [-2.3, 2.45, 1.45, .55]] },
  fa18: { nozzles: [[-7.2, 1.05, -.55, .45], [-7.2, 1.05, .55, .45]] }, f2: { nozzles: [[-7.4, 1.6, 0, .55]] }, typhoon: { nozzles: [[-7.6, 1.6, -.45, .5], [-7.6, 1.6, .45, .5]] } };
// Each choice is a real aircraft: its own gun, engines, weight, wing, handling and limits (figures from public sources, listed in the README),
// built on the F-2's flight model and store layout (so a missile, an air-to-ground missile and a bomb hang where the F-2 carries them).
Object.assign(AMMO, {
  gau8: { name: 'GAU-8/A 30 mm', type: 'API', kind: 'bullet', v: 1010, pen: [60, 38], main: 95, rico: 70, rate: 60 / 3900, spread: .005, range: 2000 }, // 3,900 rounds a minute, depleted-uranium AP
  m61a2: { name: 'M61A2 20 mm', type: 'HEI', kind: 'bullet', v: 1030, pen: [12, 8], main: 40, rico: 70, rate: 60 / 6000, spread: .0035, range: 1800 },     // 6,000 rounds a minute
});
const JET_STATS = {
  // A-10C: two TF34 turbofans, 40.3 kN each, no afterburner; big straight wing (47 m2), light wing loading: slow (about 700 km/h) but turns tight; +7.33 g; 1,174 rounds
  a10: { name: 'Fairchild Republic A-10C Thunderbolt II', short: 'A-10C', mass: 14800, mDry: 11300, fuelMax: 4800, fuel0: 3400, S: 47, thrust: [80.6e3, 80.6e3], CLa: 5.4, aStall: .5, alphaLim: .42, cd0: .032, kInd: .07,
    rates: [3.2, .78, .42], gmax: 7.33, vne: 232, machMax: .75, arcadeTop: .92, len: 16.26, wid: 17.53, info: 'Close-support jet built round the GAU-8 Avenger: 3,900 rounds a minute of 30 mm armour-piercing. Slow, but turns very tight at low speed. AIM-9, Maverick, Mk 82.',
    weapons: [{ k: 'gau8', n: 1174 }, { k: 'aim9x', n: 2 }, { k: 'agm65', n: 2 }, { k: 'mk82', n: 2 }] },
  // MiG-35: two RD-33MK, about 53 kN dry and 88 kN with afterburner each; thrust-vectoring nozzles (quick nose); +9 g; Mach 2.25; GSh-30-1 with 150 rounds
  mig35: { name: 'Mikoyan MiG-35', short: 'MiG-35', mass: 17500, mDry: 11000, fuelMax: 4800, fuel0: 3300, S: 38, thrust: [106e3, 176e3], CLa: 4.4, aStall: .6, alphaLim: .52, cd0: .021, kInd: .12,
    rates: [4.2, .8, .48], gmax: 9, vne: 420, machMax: 2.25, len: 17.3, wid: 12, info: 'Thrust-vectoring Fulcrum: points its nose faster than anything here. GSh-30-1 30 mm, R-73, Kh-29T, FAB-250.',
    weapons: [{ k: 'gsh301', n: 150 }, { k: 'r73', n: 2 }, { k: 'kh29t', n: 2 }, { k: 'fab250', n: 2 }] },
  // F/A-18E: two F414, about 62 kN dry and 98 kN with afterburner each; 46.5 m2 wing; famously good at high angle of attack; +7.5 g; Mach 1.8; M61A2 with 412 rounds
  fa18: { name: 'Boeing F/A-18E Super Hornet', short: 'F/A-18E', mass: 21000, mDry: 14550, fuelMax: 6500, fuel0: 4400, S: 46.5, thrust: [124e3, 196e3], CLa: 4.6, aStall: .66, alphaLim: .6, cd0: .024, kInd: .12,
    rates: [3.6, .62, .36], gmax: 7.5, vne: 400, machMax: 1.8, len: 18.31, wid: 13.62, info: 'Carrier strike fighter: heavy and not the fastest, but keeps flying at angles of attack that stall the others. M61A2 20 mm (6,000 rounds a minute), AIM-9X, Maverick, Mk 82.',
    weapons: [{ k: 'm61a2', n: 412 }, { k: 'aim9x', n: 2 }, { k: 'agm65', n: 2 }, { k: 'mk82', n: 2 }] },
};
if (typeof AIR !== 'undefined' && AIR.f2) for (const [k, st] of Object.entries(JET_STATS)) {
  AIR[k] = Object.assign({}, AIR.f2, st, { mRef: st.mass, model: team => kitJet(k, team, AIR[k], JET_FIT[k], modelF2(team)) || modelF2(team) });
}
const TEAM_AIR_DEFAULT = TEAM_AIR.map(s => s.jet);
function applyJetChoice() { // at the start of each match: each side flies the jet chosen on the title screen
  for (const t of [0, 1]) { const pick = GAME.jetLook && GAME.jetLook[t]; TEAM_AIR[t].jet = pick && AIR[pick] ? pick : TEAM_AIR_DEFAULT[t]; }
  if (typeof WNAME !== 'undefined') Object.assign(WNAME, { gau8: '30 mm GAU-8', m61a2: '20 mm M61A2' });
}
