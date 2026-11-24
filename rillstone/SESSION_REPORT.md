# Autonomous session (owner away)

While you were at work I reviewed the code, fixed the bugs that held up,
and added a new way to earn: **alloys**. Everything is on
`claude/serene-darwin-vo71ui`. Nothing went to the site, no pull request was
opened, and no cloud resources were created. `MP_SERVER` is still empty.

## ⚠️ Read first: the browser tests were not run

In this session the permission system blocked starting the local web
server (`python3 -m http.server 8765`), and `tools/test.cjs` needs that
server. So **no Playwright section ran**: not `--town`, `--machines`, `--more`,
`--belts`, `--progress`, `--pacing`, `--coop`, `--mp` or `--shots`.

What I checked instead:

- **Unit tests:** `node tools/unit.mjs` gives 43 ok (35 before, 8 new for
  alloys).
- **Build:** `node tools/build.mjs` builds, and the committed `index.html`
  matches the source.
- **Furnace code:** I bundled the real `game/machines.js` with esbuild and
  ran it in Node with stub dependencies. That covered alloy pours, grades,
  refusals, saves from before alloys, the smelter's alloy setting, the
  smelter's new auto-pour, skipping unknown machines on load and the Mix
  Sensor's signal.
- **Existing tests:** I read them, so the changes don't contradict what
  they check (photo mode, Pumphouse items, contract ids).

**Before you merge or deploy,** please run the full suite once:

```bash
python3 -m http.server 8765 &
node tools/unit.mjs
for f in --move --dig --town --machines --more --belts --progress --pacing --coop --mp --shots; do node tools/test.cjs /tmp/rill-shots $f || break; done
```

The new alloy check is in `--more`. I wrote it with the same helpers as its
neighbours, but it has never run, so if anything fails, look there first.

## New: alloys (more money from refining)

- **What it is:** melt two metals together in one furnace and the pour is
  an alloy ingot. Five recipes, all our own names:

  | Alloy | Mix | Fine $/kg at par |
  | --- | --- | --- |
  | Millbrass | 60% copper + 40% iron | 11.5 |
  | Rose gold | 75% gold + 25% copper | 36.3 |
  | Electrum | 50% gold + 50% silver | 36.9 |
  | Moonsilver | 70% silver + 30% glimmerite | 83.9 |
  | Cindersteel | 70% iron + 30% emberite | 99.6 |

- **Grades:** how close the pour is to the mix sets its grade.
  - Fine (within 5 percentage points) pays ×1.25 what the same metals would
    pay as plain ingots.
  - Good (within 15) pays ×1.12.
  - Rough pays ×1. That is never less than the metals, so mixing by
    accident costs nothing, and a unit test proves rough can't beat plain
    ingots.
- **How to use it:**
  - Feed two metals by hand into a kiln or crucible. The panel shows the
    mix, e.g. "Copper 6.0 kg + iron 4.0 kg (60% copper: fine millbrass,
    best 60%)".
  - A smelter has a new **Alloy** setting on its panel, "Pure metal only"
    by default. That keeps old belt lines behaving as before: mixed ore
    still waits on the belt.
  - Pick an alloy and the smelter takes both of its metals from the belt.
  - **Mix Sensor** (new logic part, any shop counter, $30): it outputs the
    nearest furnace's share of its alloy's main metal, in %. Wire it to a
    Compare gate (say > 60 for millbrass) and Belt Gates on the two feed
    belts, and the smelter keeps its pours fine on its own.
- **What carries through:**
  - The ingot keeps its mix and grade through sawing, reheating and the
    workbench, so a fine electrum blade is ×1.25 × 1.35.
  - Tooltips show the grade in the name and the mix underneath.
- **Where it shows:**
  - Alloys use a new twin-bar ingot model, with colours and glyphs
    ◐ ◑ ◒ ◓ ◉.
  - Each alloy has its own daily price, on the price board (marked
    "alloy" in the raw column) and in the full list.
  - The guide (Alloys entry, ore look-ups name their alloy partners) and
    the README describe them.
- **Contracts:** from contract tier 3 (about 8 finished contracts), the
  Guild board can ask for alloy orders, e.g. "Deliver 32 kg of electrum
  ingots (good grade or better)". These take the place of some crafted-goods
  orders and use the same number of random draws.
- **Saves:** old saves load unchanged.
  - The furnace mix is rebuilt from `material` when `state.mix` is missing.
  - New prices default to 100% until the next morning.
  - No saved field was renamed.
- **Co-op:** the new `alloy` setting is checked by the host like the
  other machine settings.
- **Pacing:** this is unchanged. The pacing tests value loot with
  `itemValue` on raw finds, and alloys only add a step after smelting.

### Research behind it

- **The reference game has no alloys:** its smelters reject a second ore
  type, and players noted refining gets thin late on, when money stops
  meaning much.
- **Players liked:** exact, calculable value (base × weight × step bonus)
  and jewellery stacking gem and metal value.
- **So alloys:**
  - add a skill axis (hitting a ratio) without a hidden purity stat;
  - stay calculable;
  - stack with the workbench;
  - give a reason to keep low metals (copper) for mixing late in the game,
    instead of only dumping them.
- **Not copied:** nothing from the banned list or the reference game's
  names is used. The names, models and rules are our own.

## Bugs found and fixed

Three read-only review passes (machines and automation, net/saves/UI, and
hands/town/workshop/economy) found these. I checked each in the code
before fixing it.

**Saves and menus**

1. **Multiplayer quit:** "Save and quit to title" never saved a
   multiplayer world (`state.slot` is null there), so up to 3 minutes of
   shared play could be lost.
2. **Broken saves:** a save that won't load (damaged, or from a newer
   build) left a dead page. It now shows "Could not load slot N" and stays
   on the title.
3. **Import over the current slot:** importing into the slot you're playing
   was silently overwritten by the next autosave. Autosave now turns off
   for that slot, with a message.
4. **Photo mode hint:** it was a toast inside the hidden HUD, so it never
   showed. It now has its own element, and the HUD still hides at once,
   which the `--shots` test expects.

**Co-op**

5. **Double digs for joiners:** terrain digs made just before someone
   joined were applied twice on the joiner, because pending ops were baked
   into the package and sent again. They are now flushed first.
6. **Stuck loading:** a world package that failed to load (bad data, or a
   host on a newer save version) left the guest "loading" forever. It now
   says why, and the retry logic can run.
7. **Sorting Hopper settings:** guests couldn't set a Sorting Hopper to
   "any form" or clear its sample; the host threw those settings away.

**Machines**

8. **Funnel loop:** two funnels spouting into each other recursed until the
   stack overflowed, every 0.2 s.
9. **Ore clods:** ore clods dumped by a machine lost their ore flag, and the
   Stamp Mill refused ore loads from a funnel, lift or trommel.
10. **Counter gate:** it read negative after a load, because belt tallies
    aren't saved but its base is.
11. **Water wheel off:** a switched-off water wheel or turbine still drove
    shaft machines.
12. **Leaks:** shaft drive lines leaked a geometry and a material on every
    rebuild.
13. **Smelter auto-pour:** it never poured on its own when stuck just below
    97 kg with pieces bigger than the gap. A piece refused for lack of room
    now lets it pour.
14. **Unknown machines:** a save naming a machine this build doesn't know
    stopped the load. It's now skipped.

**Shop, economy and text**

15. **Hidden logic parts:** the **logic Scale Plate and Lamp couldn't be
    bought.** Their shop ids clashed with the Hand Scale and the
    Prospector's Lamp, so the one-catalogue de-duplication hid them. They
    now have the ids `logic_scale` and `logic_lamp`; the machine def is
    unchanged.
16. **Pumphouse exploit:** the Pumphouse counted sawn gems (saw one stone
    into ten for stage 3) and 0.05 kg chalices (stage 5). It now follows
    the contract rules: whole gems, and crafts of 1 kg or more. The labels
    say so.
17. **Belt Saw:** a signal could set any cut size. It's now at least
    0.25 kg, like the panel.
18. **Scrapping:** scrapping refused a crate holding things, but not gems
    in a Gem Press, reheating ingots, a hopper's queue or Mender charges.
    It now refuses those too.
19. **Text:**
    - the Booster Pump's description said +50% flow (it's +20% and +10%
      pressure each, up to four);
    - the truck-bed messages always gave the Old Hauler's limits;
    - the guide said cutting "roughly doubles" a gem's price (it's about
      half as much again);
    - the Guild Hall said contracts fill "anywhere in town";
    - the README still described the economy as "market buyers with
      saturation".

## Left alone (worth your decision)

- **Guest hands leak:** each co-op guest gets a `createHands` (a camera and
  a drop ring in the host's scene) that is never disposed when they leave.
  It's small, and I didn't want to touch co-op teardown without the
  `--coop` test.
- **Avatar colours** can repeat after a guest leaves and rejoins.
- **Overlapping multiplayer saves:** `mpSave` calls aren't serialised, so
  an autosave and a manual save could race. This only matters once the
  server is deployed.
- **"Save here" in a multiplayer world** saves to the server, not to the
  slot you clicked.
- **Other leaks:** removed machines don't dispose some per-machine
  materials (belt textures, logic labels, lamp and glow), and the Display
  Panel caches a texture per distinct text, without limit. These are slow
  leaks, only noticeable in very long sessions.
- **Excavator and veins:** the Excavator tags vein loads without the
  near-surface guard the shovel has. That's a possible farm if a vein
  comes near the surface; I haven't confirmed it.
- **Guest drops:** a guest's drop point isn't range-checked by the host.
- **Pumphouse rewards** ($2,000–$15,000) aren't passed through `cheap()`.
  That looks deliberate, since earnings were kept.

## Ideas for next time

- **A quartz refinery** (glass or lenses from spare quartz), giving a use
  for the one unsellable find.
- **A demo alloy line** in the guide: a picture of a smelter, two feed
  belts, a Mix Sensor, a Compare gate and two Belt Gates.
- **More alloys**, or a third tier made from two alloys.
