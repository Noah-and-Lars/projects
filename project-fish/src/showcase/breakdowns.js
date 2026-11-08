// The gun breakdowns the loadout menu offers (its Breakdowns picker), in the
// order it shows them. Adding one is one entry here: its script and model
// are only loaded when it's picked (src/main.js openBreakdown), so the list
// itself costs nothing.
//
// Each entry:
//   id      a short name for it (the picker remembers the last one watched)
//   name    the gun's name, as the picker and the film's title show it
//   about   one line on what the film shows
//   thumb   its picture in the picker: the film's last frame, drawn by
//           tools/breakdown/thumbs.html (see README.md, Breakdowns)
//   model   the model the film takes apart (its script loads it; it's here
//           too so the list says which file is whose)
//   credit  the model's credit, as the film's last shot shows it (the full
//           credit is in README.md, Credits, and in index.html)
//   load()  the script (src/showcase/breakdown.js plays it)

const here = (path) => new URL(path, import.meta.url);

export const BREAKDOWNS = [
  {
    id: 'ar15',
    name: 'AR-15',
    about: 'Field strip, then the trigger group, barrel, stock and sights.',
    thumb: here('../../assets/breakdown/thumbs/ar15.webp'),
    model: here('../../assets/breakdown/ar_slr.glb'),
    credit: 'Model: "AR SLR" by luapqq, CC BY 4.0',
    load: () => import('./arSlrParts.js').then((m) => m.AR15_BREAKDOWN),
  },
  {
    id: 'scar-l',
    name: 'FN SCAR-L',
    about: 'Scope, suppressor and bipod off, then the field strip down to the barrel.',
    thumb: here('../../assets/breakdown/thumbs/scar-l.webp'),
    model: here('../../assets/breakdown/scar_l.glb'),
    credit: 'Model: "SCAR L" by zhe_kan, CC BY 4.0',
    load: () => import('./scarLParts.js').then((m) => m.SCAR_L_BREAKDOWN),
  },
  {
    id: 'galil-ace',
    name: 'IWI Galil ACE',
    about: 'Top cover, bolt carrier and bolt, then the trigger, the barrel with its gas block, and the sights.',
    thumb: here('../../assets/breakdown/thumbs/galil-ace.webp'),
    model: here('../../assets/breakdown/galil_ace.glb'),
    credit: 'Model: "Galil Ace" by MarkLevin, CC BY 4.0',
    load: () => import('./galilAceParts.js').then((m) => m.GALIL_ACE_BREAKDOWN),
  },
  {
    id: 'pf9',
    name: 'PF-9',
    about: 'Field strip of the pistol, then each attachment fitted and explained.',
    thumb: here('../../assets/breakdown/thumbs/pf9.webp'),
    model: here('../../assets/breakdown/pf9.glb'),
    credit: 'Model: "Pistol 9mm Custom" by ~D-Try~, CC BY 4.0',
    load: () => import('./pf9Parts.js').then((m) => m.PF9_BREAKDOWN),
  },
];

export const breakdownById = (id) => BREAKDOWNS.find((b) => b.id === id) || null;

// The cinematic (src/showcase/cinematic/film.js), offered first in the same
// picker: a short film of the soldier diving for a PF-9 and the bullet cam
// that follows his shot. Picking it opens it like a breakdown (src/main.js
// openBreakdown). Its picture is a frame of the film (the catch).
export const CINEMATIC = {
  id: 'cinematic',
  name: 'Cinematic: Dive and fire',
  about: 'He dives for a thrown PF-9, rolls into cover and fires; then the bullet cam rides with the 9 mm round to the enemy by the house.',
  thumb: here('../../assets/cinematic/thumb.webp'),
  credit: 'Animations from Mixamo · Soldier by DanlyVostok · PF-9 by ~D-Try~, CC BY 4.0',
};
