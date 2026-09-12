# Commander Companion — V0.8.0-B1-CORE-STABLE

## Scope
Batch 1 only: Core QA / No-New-Feature Stabilization.

No gameplay, combat, mana, persistence architecture, menu, Freeplay, Table Tracker, service-worker, cache, startup, or visual behavior was intentionally changed.

## Result
No reproducible core defect requiring an application-code change was found in the supplied V0.8.0 baseline during this Batch 1 pass. The application source files are therefore preserved byte-for-byte from the supplied baseline. This checkpoint adds this QA report only.

## Automated/static checks completed
- PASS: all 34 JavaScript files parse with Node `--check`.
- PASS: CSS brace balance for `styles.css`.
- PASS: CSS brace balance for `styles-v0739.css`.
- PASS: CSS brace balance for `game-threefix.css`.
- PASS: CSS brace balance for `ipad-layout.css`.
- PASS: `index.html` local stylesheet/image references resolve in the merged flat-root layout.
- PASS: `ipad.html` local stylesheet/image references resolve in the merged flat-root layout.
- PASS: 2, 3, 4, 5, and 6-player `initializeGame()` creation.
- PASS: 1-player and 7-player initialization rejected by the existing 2–6-player guard.
- PASS: basic `saveToStorage()` -> `loadFromStorage()` round trip using a storage mock.
- PASS: `hasValidSave()` recognizes the generated save.
- PASS: original upload split remains <=99 files per upload folder after this report is added: 99 / 72.

## Preserved intentionally
- Landing page visual source/assets unchanged.
- Game-screen visual source/assets unchanged.
- Existing startup/service-worker/cache behavior unchanged.
- Existing combat code unchanged.
- Existing mana code unchanged.
- Existing persistence architecture unchanged.
- Existing menus and dock unchanged.
- Existing Freeplay/Table Tracker behavior unchanged.

## Important baseline observation
`sw.js` in the supplied V0.8.0 build is a zero-byte file, while `index.html` / `ipad.html` contain startup code that unregisters old service workers and deletes Commander Companion caches. Batch 1 explicitly prohibits startup/cache/service-worker changes, so this was documented but not changed. Startup/Safari/cache work remains reserved for Batch 29.

## Manual/device gate still required
The container environment cannot substitute for real iPhone/iPad Safari validation. Before moving to Batch 2, manually verify on the published checkpoint:
1. Landing page loads and remains visually identical.
2. New Game opens setup.
3. Start 2-player game.
4. Start 6-player game.
5. Play multiple turns/phases without a fatal error.
6. Return Home and verify Continue Game becomes available after an active save exists.
7. Refresh and use Continue Game.
8. Confirm game screen remains visually identical to V0.8.0.

If any of those fail, stop here and treat the failure as Batch 1. Do not start Batch 2 until isolated.

## Checkpoint
`V0.8.0-B1-CORE-STABLE`
