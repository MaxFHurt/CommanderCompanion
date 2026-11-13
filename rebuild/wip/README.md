# Parked work (owner, 13 Nov: judgement tools come last, right before optimising the code)

Resume in roadmap step 3 (judgement tools). Apply on a branch: `git apply --3way rebuild/wip/<file>`, then rebuild the bundles
(`sh rebuild/deck/tools/build.sh`); the *.min.js files are left out of the patches.

- `judgement-apex.patch`: option A from team/apex2 (merged): mana rules everywhere (strLands 0, strKeepJobs, strPips, strKeepLands,
  strManaGuard), generated decks finished on their price level's strength build (strFinish), score reads card strength (opt.str),
  plus an unfinished scoring change (mana rocks as mana sources in practice games). Not tested; stopped mid-work.
  Owner chose A and "modify the way things are scored" so the strongest decks don't score lower.
- `judgement-reasons.patch`: upgrade-row reasons name a plan only when the card does it (engine/core.js ownAim, upgrades.js
  whyOrder); picks and benchmark proven identical. Finished and tested (UI-B118-01, B139-01, B145-01), not shipped.
- Approved, not started: plan-aware Fix menu picks (wipes that hit the deck's own card type, lifegain as "a way to win",
  Vandalblast as a wipe), now part of 6b.
