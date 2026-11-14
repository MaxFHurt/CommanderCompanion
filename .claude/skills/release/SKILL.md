---
name: release
description: Ship a tested build live (version bumps, stamp, notes, push main). Use only after the batch's suites (rebuild/tools/suites.sh) passed (owner, 14 Nov: push every build live once proven bug free, no separate yes).
---
0. Tests (owner, 13 Nov: batch builds of ~3-5 small items or one large one; test what the batch can break):
   `sh rebuild/tools/suites.sh origin/main plan` shows the suites the changed files need; `... run` runs them in the background.
   A batch touching `deck/engine/` or `src/engine/`/`src/game/` gets the full runs; to finish faster, split them over extra
   cloud sessions (create_session, same branch, one suite group each: Deck Builder `check.sh all live`; node suites + soak;
   browser suites) and collect the summaries.
1. `git fetch origin`; rebase/merge onto `origin/main` (never undo another session's work). Next numbers: `grep -o "rebuild\.[0-9]*" rebuild/src/version.js`, `cat rebuild/deck/version.json`.
2. `sh rebuild/deck/tools/tests/suite/release.sh <app N> <deck build> <deck version>` bumps src/version.js, sw.js cache, deck/index.html, deck/version.json, runs stamp.mjs and build.sh.
3. Notes (short): HANDOFF.md live line (line 11, prepend), PROGRESS.md "Live build" + a `### Build N` entry at the top of the Log
   (what changed, owner's words, tests with numbers), ROADMAP.md Done line (and mark the item done); add phone/iPad checks for anything visible to rebuild/DEVICE_CHECKS.md.
4. `sh rebuild/deck/tools/tests/suite/run.sh quick` on the stamped build, then commit "Build N live: …", push the branch,
   `git push origin HEAD:main`, and wait for https://maxfhurt.github.io/CommanderCompanion/rebuild/deck/version.json to show it.
