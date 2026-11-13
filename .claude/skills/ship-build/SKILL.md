---
name: ship-build
description: Ship a Commander Companion build (version bump, stamp, sw cache bump, PROGRESS.md entry). Use only after the owner explicitly says yes to going live.
---
Only with the owner's explicit yes for this build. From `rebuild/`:
1. `src/version.js`: `1.0.0-rebuild.N` → N+1.
2. `node tools/stamp.mjs` (writes build.json).
3. `sw.js`: cache name `commander-companion-vN` → N+1.
4. If `deck/` changed: `sh deck/tools/build.sh`, bump `deck/version.json`.
5. `PROGRESS.md`: new log entry (newest first), live build, top-1,000 and catalog counts, limits, next. Same one-liner in HANDOFF.md §1.
6. Run the `run-checks` skill (full set for release).
7. Commit, push `main`. Report in 2-3 lines.
