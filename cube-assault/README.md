# Cube Assault

A first-person 3D shooter in a single HTML file. Defend a village from waves of cubes, earn coins, level up your profile, and buy the Extreme Gun and a turret.

## Play

Download `index.html` and open it in Chrome, Edge, Firefox or Safari. It works offline: the 3D engine and fonts are built into the file. You need a keyboard and mouse.

The first time you play, the game asks for your name. Press Play, then pick a map:

- **Classic Village**: the original walled village. Small, tight and fast.
- **Frontier (work in progress)**: four times bigger, with the village in the middle, a dense forest, a mountain range, a town and a farm.

You always start in the middle of the village.

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
| 1–5 / scroll wheel | Switch weapon |
| Q | Swap to last weapon |
| 6 | Place your turret (if you've bought one) |
| Esc | Pause |

## Enemies

| Cube | Arrives | What it does |
|---|---|---|
| Red | Wave 1 | Melee only. The weakest. |
| Green | Wave 4 | Small and very fast. |
| Blue | Wave 7 | Keeps its distance and shoots slow energy shots. |
| Brute (purple) | Wave 10 | Heavy armour, heavy melee. |
| King (gold) | Wave 15, then every 5 waves | Boss. Leaps and slams the ground; jump the shockwave. |

## Weapons and shop

- **Pistol** and **Rifle**: every game starts with these.
- **Shotgun** and **Sniper**: unlock when you reach wave 5, in every game.
- **Extreme Gun**: 1,000 coins in the Shop. Full-auto plasma; every shot explodes.
- **Turret**: 400 coins in the Shop. Press 6 to set it down next to you. It shoots the nearest cube once a second and finishes any normal cube in two hits. It has 200 HP, never heals, and cubes will attack it. One at a time.

Every cube you destroy earns 1 coin (the King earns 10).

## Profile

Click your profile in the top right of the main menu to see your level, total accuracy, shots fired, cubes killed, time played and best wave, and to pick a profile picture. Every point you score is XP.

Everything is saved in your browser. **Settings → Reset all data** wipes it and starts fresh.

## Graphics

Settings has four graphics levels: Potato, Low, High and Ultra. Field of view goes from 60 to 120.

## Credits

- [three.js](https://threejs.org) r128, MIT License, embedded in the file.
- Russo One and Barlow fonts, SIL Open Font License, embedded in the file.
- All models, textures and sounds are generated in code.
