// Where bug reports go. Split up so simple spam bots scanning the page don't pick it up.
window.CONTACT_EMAIL = ['jimmyscafe1000', 'gmail.com'].join('@');

// Fills in any "Email us" link on the page, with an optional subject line
window.fillContact = (subject) => {
  for (const a of document.querySelectorAll('.contact')) {
    a.textContent = CONTACT_EMAIL;
    a.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(subject || "Noah's and Lars's Arcade");
  }
};

// The list of games on the arcade. To add a game, put its folder next to this
// file (with an index.html and a thumb.svg) and add one entry below.
window.GAMES = [
  {
    id: 'cube-assault',
    title: 'Cube Assault',
    category: 'Shooter',
    description: 'First-person 3D shooter. Defend the village from waves of cubes, earn coins and unlock new weapons.',
    controls: 'Keyboard + mouse',
    path: 'cube-assault/index.html',
    thumb: 'cube-assault/thumb.svg',
    isNew: false,
  },
  {
    id: 'block-drop',
    title: 'Blocktris',
    category: 'Puzzle',
    description: 'Stack falling blocks, clear lines and survive as the speed climbs.',
    controls: 'Keyboard or touch',
    path: 'block-drop/index.html',
    thumb: 'block-drop/thumb.svg',
    isNew: true,
  },
  {
    id: '2048',
    title: '2048',
    category: 'Puzzle',
    description: 'Slide the tiles, join matching numbers and try to build a 2048 tile.',
    controls: 'Keyboard or swipe',
    path: '2048/index.html',
    thumb: '2048/thumb.svg',
    isNew: true,
  },
  {
    id: 'poly-racer',
    title: 'Poly Racer',
    category: 'Racing',
    description: 'Low-poly time-trial racing. Drift through corners, fly through loops and jumps, and beat your own ghost.',
    controls: 'Keyboard or touch',
    path: 'poly-racer/index.html',
    thumb: 'poly-racer/thumb.svg',
    isNew: true,
  },
];
