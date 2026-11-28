# Island Front rework: plan

The aim is to make Island Front as much fun as Havoc Bay without losing its vehicles, damage models, flight physics or War Thunder-style interface.

## What makes Havoc Bay fun

Line numbers refer to `havoc-bay/index.html`.

- **A goal you can see and hit.** Each harbour has 25,000 health, shown as two bars at the top. Everything you do pushes one of those bars down: sinking ships, bombing the harbour, holding islands. A match always ends, either at zero or when the clock runs out (15 minutes by default).
- **Quick into the fight.**
  - You respawn 6 seconds after dying, and Enter buys the same unit again.
  - You can spawn on any island you hold, and planes spawn on carriers, so you start near the action.
  - New units get 2 to 3 seconds of spawn protection.
- **A generous, steady reward loop.**
  - Gold comes from damage dealt (0.09 per health point), kills (15 to 500 by unit), claiming islands (150), and passive income (2 a second plus 2 for each island you hold).
  - You start with 300 gold, and the basic boat, fighter and going on foot are free. You are always saving up for the next bigger thing.
- **Short, readable claims.** Taking an island takes about 18 seconds alone and 9 with friends, shown as a tug-of-war bar. An island gives turrets, a spawn and income.
- **Feedback.**
  - Hit markers with a sound, a different kill marker and sound.
  - A kill feed that highlights your own lines.
  - Screen shake that scales with the blast, a red flash when you are hit.
  - Big centre banners: "Blue claimed X!", "Foundation hit!".
  - Harbours visibly burn as they lose health.
- **Forgiveness.** Planes at zero health glide instead of exploding, so you can land them. Landing anywhere friendly repairs, refuels and rearms in 8 seconds.
- **Status.** A Tab scoreboard with kills and deaths, and an end screen with kills, deaths, damage, gold, islands and wins.

## What Island Front lacks

I measured this with a headless 8 v 8 bot match on Ironback Ridge, run for 20 simulated minutes.

- **The teams never meet.** No soldier or vehicle of either team died in 20 minutes. Both sides spent the match shooting neutral guards.
- **The fort stalls the match.** Its 30 guards lost 7 in 10 minutes. The match would have ended at 30 minutes as a 2-2 draw, and holding all five checkpoints, the only other win, never happens.
- **The trip to the fight is too long.** Vehicles start at base, 2.5 km from the first checkpoint and 7.5 km from the middle one, which is several minutes of driving. Only infantry can spawn forward.
- **There is no score you can push.** The top bar only counts checkpoints held. A kill does nothing for your team.
- **The rewards are thin.** Spawn points come only from kills and captures: no damage, no assists, no income. A tank costs everything you start with.
- **Little feedback, and no scoreboard.**
  - There is no kill banner and no distinct kill sound.
  - The end screen shows four numbers, and there is no Tab scoreboard.
- **Hard for newcomers.** The gun is laid for 400 m until you lase, so a new player misses anything further away and doesn't know why. Nothing in the world points to the next objective, and enemies are hard to spot.

## Changes, ranked by fun per effort

1. **Front strength.** Each team gets a strength bar, like Havoc Bay's harbour.
   - Strength falls three ways: when you lose a unit (by its size), while the enemy holds more checkpoints than you, and when the enemy shells or bombs your base.
   - First to zero loses, or the stronger team when the clock runs out. Matches go to 20 minutes.
2. **Fewer guards and owned outposts.**
   - Guards drop from 6, 14 and 30 to 0, 6 and 10. Each team starts holding its own outpost, so the first fight is for the camps and then the fort.
   - Bots and players meet within a couple of minutes.
3. **Forward spawns for vehicles.** Ground vehicles can start at any checkpoint you hold. Aircraft still start at base.
4. **A richer spawn point economy.**
   - New sources: passive income, spawn points for damage and for knocking out modules, assists, and capture ticks.
   - Cheaper kit, and you start with 250 SP.
   - Bots use the same economy.
5. **Kill feedback.**
   - A kill banner ("TANK DESTROYED +200") with a kill sound.
   - Multi-kill and streak banners with a bonus.
   - Your lines highlighted in the kill feed.
   - Warnings when a checkpoint is lost or strength is low.
6. **Quick redeploy.**
   - Enter deploys the same unit at the same place again.
   - The respawn wait drops to 5 seconds.
   - 3 seconds of spawn protection.
7. **Tab scoreboard and a better end screen.**
   - The scoreboard shows score, kills, deaths, captures and the current unit.
   - The end screen adds team strengths, the top players, your stats, your best streak and awards.
8. **Clarity.**
   - A marker in the world over the next objective, with its distance.
   - An objective line under the compass.
   - Red markers over enemies your side can see.
   - A How to play tab on the title screen.
9. **Assisted gunnery, on by default.** The gun is laid for the range under the crosshair automatically, as in War Thunder's Arcade battles. Realistic is an option on the title screen.
10. **Bots.** They defend a checkpoint that is being taken, and keep pushing the fight instead of drifting.

Online play is left out: it does not fall out cheaply from this codebase.
