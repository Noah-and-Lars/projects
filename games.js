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
    title: 'Block Drop',
    category: 'Puzzle',
    description: 'Stack falling blocks, clear lines and survive as the speed climbs.',
    controls: 'Keyboard or touch',
    path: 'block-drop/index.html',
    thumb: 'block-drop/thumb.svg',
    isNew: true,
  },
];
