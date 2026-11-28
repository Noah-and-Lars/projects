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
kitUse('t90a', 't90am', { fit: { length: 9.6 }, split: (x, y, z) => y > 1.62 && x > .35 && Math.abs(z) < .32 ? 'gun' : y > 1.45 && Math.hypot(x + 1.4, z) < 1.95 ? 'turret' : 'hull' });
