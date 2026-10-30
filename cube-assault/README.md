# Cube Assault

A first-person 3D shooter in a single HTML file. Defend a village from waves of cubes, earn coins, level up your profile, and play the story campaign.

Play it online at https://noah-and-lars.github.io/projects/cube-assault/, or download `index.html` and open it in Chrome, Edge, Firefox or Safari. It works offline: the 3D engine, fonts and music are all built into the file. Play with a keyboard and mouse, or on a phone or tablet with touch controls.

## Modes

Press Play to choose:

- **Campaign**: story levels played in order; finish one to unlock the next.
  - Level 1, *The Birch Road* (Russia, 1944): a cutscene in an army jeep, then hold the road against 5 waves of Rifle Cubes and claim the cube camp's flag.
  - Level 2, *Apex Support* (Mumbai, India, 2009): sneak into a tower with your SWAT team, spy on a scam call centre and raid it with them, then decide what happens to the last scammer. Choose right and you get to bring the whole tower down.
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
| Splitter (orange) | Wave 20, then every 5 waves | Giant; splits into two smaller cubes when destroyed, three times over. |
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

## Multiplayer

Press **Multiplayer** on the main menu to create a match (you get a 5-letter room code and can add a password) or join one by code. In the lobby, pick Red or Blue; the host chooses the mode (Team Deathmatch, Free-for-all or Co-op waves), team size, map, kill limit, time limit, friendly fire and whether the room is locked. During a match, hold **Tab** (or tap **Scores**) for the scoreboard.

Since 2.6 it's real online play for up to 6 players. It runs over the arcade's realtime server, a small Cloudflare Worker (secure WebSockets on port 443; it was Supabase Realtime until 2.9.16): the host's browser is the referee and decides hits, deaths, respawns and scores. Everyone gets the same guns (pistol, rifle, shotgun, sniper, knife and rocket launcher; no Extreme Gun or turret). Rockets blow the same holes in everyone's map. If the host leaves, the next player takes over. In co-op, each player fights the cube waves on their own screen for now. Press **F3** in a match for network stats. If Supabase can't be reached, multiplayer says it's resting and single-player works as usual. The free plan allows roughly 9 hours of full 3v3 a month (see the comment at the top of the `mp-net` block).

The new **Outpost** map (Red and Blue spawns, three lanes, sites A and B, a pump house and watchtowers) can also be played in single-player from the map screen.

### C:S Mode (2.6.1)

Terrorists (orange) against Counter-Terrorists (blue) in rounds on the Outpost; the host picks 3, 5 or 8 rounds to win. Terrorists hold **E** for 3 seconds inside site A or B to plant the bomb, and win the round if it explodes 60 seconds later. Counter-Terrorists defend both sites and hold **E** for 12 seconds next to a planted bomb to defuse it; they also win if time runs out before a plant. Taking out the whole other team wins a round too (but a planted bomb still has to be defused). If you're taken out, you're back at the start of the next round.

In C:S Mode and Free-for-all everyone starts with a pistol and a knife and picks one more gun: a shotgun, a sniper or a rocket launcher. The Extreme Gun and turrets are only allowed in Co-op, against the cubes.

Since 2.6.2 the rifle is a fourth choice in C:S Mode, and every choice shows a 3D picture of the gun.

### Players, victory scene and coins (2.6.2)

Other players show up as low-poly people. There are six looks, and everyone in a room gets their own (in the order they joined), with a band in their team colour; enemies have a red dot above their name. When someone wins a match, a short victory scene plays on the map for everyone: the winners celebrate up front with the losers standing behind them, under VICTORY or DEFEAT, and then the scores show (click, tap or press Space to skip). Winning an online match, as a team or on your own, earns 50 coins.

## Barrels, barricades and scope lock (2.7.2)

Red barrels are full of fuel: shoot one and it starts leaking, shoot it again and it explodes, hurting cubes and you nearby (rockets set them off too). **Barricades** cost 100 coins in the Shop: stand in a house doorway and press **J**, and your hands screw planks over the door. A barricade has 100 HP; cubes batter it down, the Angry Cube goes straight through, and your bullets break it too. **Settings → Scope → Click to lock** makes one right-click (or tap) scope in until you click again.

## The Angry Cube and climbing (2.7.1)

From wave 20, and then every 5 waves, an **Angry Cube** joins the wave: a grey cube that smashes straight through house walls, trees and buildings instead of going round them. Cubes now jump over fences and crates, and up onto crates you're standing on. You can jump onto crates too, and climb a stack of two from a single crate. The purple Brute Cube has twice the health.

## Hands and guns (2.7)

Your hands wear tactical gloves with knuckle pads, and your sleeves come down to the gloves. The rifle has a scope: right-click (or tap the aim button on touch) to look through it. The pistol has a dark slide on a tan frame, and the knife is held blade-up on the right and pokes straight forward.

## Profile and settings

Your profile (top right of the main menu) shows your level, accuracy, shots fired, cubes killed, time played and best wave, and lets you pick a 3D profile picture. Everything is saved in your own browser. **Settings → Reset all data** starts fresh.

Settings also has touch controls (Auto, On or Off), field of view, look speed, volume, menu music on or off, and four graphics levels: Potato, Low, High and Ultra.

## Credits

- [three.js](https://threejs.org) r128, MIT License, embedded in the file.
- Russo One and Barlow fonts, SIL Open Font License, embedded in the file.
- All models, textures, sounds and music are generated in code.
