---
name: release
description: Ship a tested build live (version bumps, stamp, notes, push main). Use only after the full Deck Builder run (and the game suites if src/ changed) passed.
---
1. `git fetch origin`; rebase/merge onto `origin/main` (never undo another session's work). Next numbers: `grep -o "rebuild\.[0-9]*" rebuild/src/version.js`, `cat rebuild/deck/version.json`.
2. `sh rebuild/deck/tools/tests/suite/release.sh <app N> <deck build> <deck version>` bumps src/version.js, sw.js cache, deck/index.html, deck/version.json, runs stamp.mjs and build.sh.
3. Notes (short): HANDOFF.md live line (line 11, prepend), PROGRESS.md "Live build" + a `### Build N` entry at the top of the Log
   (what changed, owner's words, tests with numbers), ROADMAP.md Done line (and mark the item done).
4. `sh rebuild/deck/tools/tests/suite/run.sh quick` on the stamped build, then commit "Build N live: …", push the branch,
   `git push origin HEAD:main`, and wait for https://maxfhurt.github.io/CommanderCompanion/rebuild/deck/version.json to show it.
