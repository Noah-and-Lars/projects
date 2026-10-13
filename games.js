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
];
