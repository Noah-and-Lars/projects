# Cube Assault

A first-person 3D shooter in a single HTML file. Defend a village from waves of cubes, earn coins, level up your profile, and play the story campaign.

Play it online at https://noah-and-lars.github.io/projects/cube-assault/, or download `index.html` and open it in Chrome, Edge, Firefox or Safari. It works offline: the 3D engine, fonts and music are all built into the file. Play with a keyboard and mouse, or on a phone or tablet with touch controls.

## Modes

Press Play to choose:

- **Campaign**: story levels played in order; finish one to unlock the next.
  - Level 1, *The Birch Road* (Russia, 1944): a cutscene in an army jeep, then hold the road against 5 waves of Rifle Cubes and claim the cube camp's flag.
  - Level 2, *Tajer Support* (Mumbai, India, 2009): sneak into a tower with your SWAT team, spy on a scam call centre and raid it with them, then decide what happens to the last scammer. Choose right and you get to bring the whole tower down.
  - Levels 3 to 5 are coming soon.
- **Classic Village**: the original walled village. Small, tight and fast.
- **Frontier** (work in progress): four times bigger, with a village, a dense forest, a mountain range, a town and a farm.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Shoot |
| Right click | Zoom (sniper) |
| Space | Jump |
| Shift | Sprint |
| R | Reload |
| 1–5 / scroll wheel | Switch gun |
| 6 | Place your turret |
| 7 | Knife (swipe the mouse or trackpad to slash) |
| 8 | Rocket launcher |
| Q | Swap to last weapon |
| E | Claim the flag (campaign) |
| 1 / 2 | Make your choice (campaign) |
| Esc | Pause |

### Touch controls (phones and tablets)

Touch controls turn on by themselves on phones and tablets; **Settings → Touch controls** switches between Auto, On and Off. Hold the phone sideways.

- Left side: joystick to move (push it all the way to sprint).
- Right side: drag to look.
- Buttons: Fire (slide your thumb while holding it to aim), Jump, Reload, Scope (sniper), Turret, Hold E (campaign) and Pause.
- Tap a gun in the bar at the bottom to switch to it. With the knife, swipe to slash.

## Enemies

| Cube | Arrives | What it does |
|---|---|---|
| Red | Wave 1 | Melee only. The weakest. |
| Green | Wave 4 | Small and very fast. |
| Blue | Wave 7 | Keeps its distance and shoots slow energy shots. |
| Brute (purple) | Wave 10 | Heavy armour, heavy melee. |
| King (gold) | Wave 15, then every 5 waves | Boss. Leaps and slams the ground; jump the shockwave. |
| Rifle Cube (red, armed) | Campaign Level 1 | Keeps its distance and shoots. |
| Scam Cube (yellow, headset) | Campaign Level 2 | Jumps off its chair and rushes you. |

## Weapons and shop

- **Pistol** and **Rifle**: every game starts with these.
- **Shotgun** and **Sniper**: unlock when you reach wave 5, in every game.
- **Knife**: 50 coins. Never runs out.
- **Turret**: 200 coins. Shoots the nearest cube once a second, 200 HP, one at a time.
- **Rocket Launcher**: 250 coins. One rocket at a time; the blast blows holes in houses, buildings and trees until the round ends.
- **Extreme Gun**: 1,000 coins. Full-auto plasma, 200 rounds; every shot explodes.

Every cube you destroy earns 1 coin (the King earns 10).

## Profile and settings

Your profile (top right of the main menu) shows your level, accuracy, shots fired, cubes killed, time played and best wave, and lets you pick a 3D profile picture. Everything is saved in your own browser. **Settings → Reset all data** starts fresh.

Settings also has touch controls (Auto, On or Off), field of view, look speed, volume, menu music on or off, and four graphics levels: Potato, Low, High and Ultra.

## Credits

- [three.js](https://threejs.org) r128, MIT License, embedded in the file.
- Russo One and Barlow fonts, SIL Open Font License, embedded in the file.
- All models, textures, sounds and music are generated in code.
