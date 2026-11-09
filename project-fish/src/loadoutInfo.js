// What the loadout menu (src/loadoutMenu.js) says about each gun, and its
// pictures (assets/loadout/thumbs/, drawn by tools/loadout/thumbs.html; see
// tools/loadout/render_thumbs.mjs).
//
// The numbers (calibre, magazine, fire mode, rate) are the guns' own rules
// in src/shared/config.js; here is only what a player reads about each gun,
// and what is fitted to the guns whose attachments can't be changed.

import { GUNS } from './shared/config.js';

// A picture's address, by name (gun_<key>, pf9_..., gear_<slot>_<id>).
export const thumbUrl = (name) => new URL(`../assets/loadout/thumbs/${name}.webp`, import.meta.url).href;

// For each gun (its key in GUNS): a line or two on what it is, and what is
// fitted to it for good ({ slot name, what }), shown in place of
// attachments it can't change.
export const GUN_INFO = {
  pistol: {
    about: 'A compact, striker-fired 9 mm pistol with a railed frame. The only gun here that takes attachments: a red dot, two mounts, three suppressors, two lights and a laser.',
  },
  pistol45: {
    about: 'The classic single-action .45 ACP pistol, all steel. Seven heavy rounds: slower to fire again and harder-kicking than the 9 mm guns.',
  },
  beretta: {
    about: 'A full-size, double-action 9 mm service pistol with an open-top slide and a 15-round magazine. Heavy, so it kicks a little less than the M1911.',
  },
  fn502: {
    about: 'The FN 502 Tactical, a .22 LR pistol with a 10-round magazine. The lightest round here: it barely kicks and strays a little less.',
  },
  hipistol: {
    about: 'A classic all-steel, single-action 9 mm with a 13-round double-stack magazine; a little lighter than the Beretta.',
  },
  x4: {
    about: 'A full-size pistol, played here as a 9 mm holding 15 rounds; quick to reload. Held in the soldier\'s own arms.',
  },
  mp7: {
    about: 'A compact sub-machine gun firing the small, fast 4.6×30 mm round from a 40-round magazine, fully automatic. Each shot kicks far less than a pistol\'s, but the kick builds in a burst.',
    fitted: [{ slot: 'Sight', what: 'Red dot' }, { slot: 'Muzzle', what: 'Suppressor' }],
  },
  ar15: {
    about: 'A civilian 5.56×45 mm rifle, semi-automatic: one shot per pull of the trigger, from a 30-round magazine. Shouldered, it kicks a little less than the PF-9 and strays least aimed.',
    fitted: [{ slot: 'Sight', what: 'Holographic sight and magnifier' }, { slot: 'Muzzle', what: 'Suppressor' }],
  },
  makarov: {
    about: 'The Soviet service pistol: a small all-steel blowback gun in 9×18 mm Makarov, eight rounds, with a short, sharp kick.',
  },
  ak74m: {
    about: 'A 5.45×39 mm assault rifle with a 30-round magazine, fully automatic. Its muzzle brake keeps the kick down, though it grows in a burst.',
    fitted: [{ slot: 'Muzzle', what: 'Muzzle brake' }],
  },
  ak74u: {
    about: 'The AK-74\'s short carbine: the same 5.45×39 mm from a 30-round magazine, a little faster. Its short barrel and small muzzle booster make it kick and climb more, and stray more aimed.',
    fitted: [{ slot: 'Muzzle', what: 'Muzzle booster' }],
  },
  saps12: {
    about: 'A 12-gauge combat shotgun, fired semi-automatically: eight shells in the tube under the barrel and one in the chamber, each throwing nine buckshot pellets. Reloaded a shell at a time.',
  },
};

// The facts shown as rows under a gun's description, from its rules.
export function gunSpecs(key) {
  const gun = GUNS[key];
  const rows = [
    { label: 'Calibre', value: gun.calibre },
    { label: 'Magazine', value: `${gun.magazine} ${gun.pellets ? 'shells' : 'rounds'}${gun.reserve ? ` · ${gun.reserve} spare` : ''}` },
    { label: 'Fire mode', value: gun.fireMode === 'auto' ? 'Fully automatic' : 'Semi-automatic' },
    { label: 'Rate', value: `${gun.fireMode === 'auto' ? 'About' : 'Up to'} ${Math.round(60 / gun.fireInterval / 10) * 10} rounds a minute` },
  ];
  if (gun.pellets) rows.push({ label: 'Each shot', value: `${gun.pellets} pellets` });
  return rows;
}

// The PF-9's attachments are drawn as layers over its picture
// (pf9_kit.webp: framed to fit it with everything on), one per attachment
// and per place it can sit (src/viewmodel/viewmodel.js, setAttachments,
// moves some to sit on another: the red dot on either mount, the lights on
// the clamp's rail, the frame's or the box suppressor's, the box suppressor
// a little forward with the rail cover on). In the order they're drawn.
export const PF9_LAYERS = [
  ['clamp'], ['cover'],
  ['can_short'], ['can_long'], ['can_box'], ['can_box', 'cover'],
  ['light_long', 'clamp'], ['light_long', 'frame'], ['light_long', 'can_box'],
  ['light_compact', 'frame'], ['light_compact', 'clamp'], ['light_compact', 'can_box'],
  ['laser'],
  ['reddot', 'clamp'], ['reddot', 'cover'],
].map(([id, seat = null]) => ({ id, seat, name: seat ? `pf9_${id}_${seat}` : `pf9_${id}` }));

// Where each attachment on the PF-9 sits, with the others that are on
// (ids: a Set of attachment ids), as setAttachments has it.
export function pf9Seats(ids) {
  const mount = ids.has('clamp') ? 'clamp' : ids.has('cover') ? 'cover' : null;
  const rail = ids.has('clamp') ? 'clamp' : ids.has('can_box') ? 'can_box' : 'frame';
  return { reddot: mount, light_long: rail, light_compact: rail, can_box: ids.has('cover') ? 'cover' : null };
}

// The layers to draw for the PF-9 with these attachments on, in order.
export function pf9LayersFor(ids) {
  const seats = pf9Seats(ids);
  return PF9_LAYERS.filter((l) => ids.has(l.id) && (seats[l.id] === undefined ? !l.seat : l.seat === seats[l.id]));
}
