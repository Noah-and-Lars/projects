// What the loadout menu (src/loadoutMenu.js) says about each gun, and its
// pictures (assets/loadout/thumbs/, drawn by tools/loadout/thumbs.html; see
// tools/loadout/render_thumbs.mjs).
//
// The numbers (calibre, magazine, fire mode, rate) are the guns' own rules
// in src/shared/config.js; here is only what a player reads about each gun,
// and what is fitted to it for good.

import { GUNS } from './shared/config.js';

// A picture's address, by name (gun_<key>, gear_<slot>_<id>).
export const thumbUrl = (name) => new URL(`../assets/loadout/thumbs/${name}.webp`, import.meta.url).href;

// For each gun (its key in GUNS): a line or two on what it is, and what is
// fitted to it for good ({ slot name, what }).
export const GUN_INFO = {
  beretta: {
    about: 'A full-size, double-action 9 mm service pistol with an open-top slide and a 15-round magazine. Heavy for its size, so it kicks less than its round would suggest.',
  },
  mp7: {
    about: 'A compact sub-machine gun firing the small, fast 4.6×30 mm round from a 40-round magazine, fully automatic. Each shot kicks far less than a pistol\'s, but the kick builds in a burst.',
    fitted: [{ slot: 'Sight', what: 'Red dot' }, { slot: 'Muzzle', what: 'Suppressor' }],
  },
  ar15: {
    about: 'A civilian 5.56×45 mm rifle, semi-automatic: one shot per pull of the trigger, from a 30-round magazine. Shouldered, it kicks a little less than a 9 mm pistol and strays least aimed.',
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
