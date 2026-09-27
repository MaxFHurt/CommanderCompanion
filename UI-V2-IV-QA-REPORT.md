# Commander Companion V0.8 IV — UI V2 QA Report

Date: 2026-09-26

## Protected baseline

- Protected rollback baseline: **V0.8 IU**
- Baseline commit: `2f679350cef8c722021678c80b6feb259f51969f`
- Rollback branch: `ui-v2-iu-rollback-2026-09-26`
- The supplied V0.8 IU backup ZIP was kept intact while V2 was built.

## V2 architecture

V0.8 IV migrates the active unlocked presentation layer to a clean V2 system while preserving existing engine/state/rules hooks.

- Added `ui-v2.css` as the authoritative unlocked UI presentation layer.
- Added `game-mode-locked.css` as an isolated compatibility freeze for the locked Game Mode Select page.
- Removed `menu-landscape.css` and `menu-fit.css` from the active build; their responsibilities are replaced by V2.
- `menu-landscape.js` and `menu-fit.js` retain their legacy behavior only when V2 is absent and do not mutate V2 DOM.
- Existing DOM IDs/classes used by application logic were retained.
- Landing was visually restyled into the same purple/silver Commander Companion family.
- Player Setup uses the supplied approved Player Setup visual master as its presentation shell.
- Rules, Device Setup, Deck Editor, settings/profile/general modal surfaces, Table Tracker and gameplay viewport presentation were migrated/normalized under V2.

## Locked Game Mode verification

The Game Mode Select DOM in both `index.html` and `ipad.html` is identical to the V0.8 IU baseline. The compatibility stylesheet reproduces the IU layout after the old global menu stylesheets were retired.

Browser screenshot comparison against IU at the tested viewports produced a pixel-identical result for the locked Game Mode page:

- iPhone landscape 932×430: identical
- iPad landscape 1194×834: identical

No Game Mode content, button artwork, text, navigation behavior, or layout geometry was intentionally redesigned.

## Minimal router corrections

Two pre-existing lightweight-mode routing problems were exposed by functional testing and corrected without rewriting the game engine:

- Freeplay Device Setup now starts through the existing `startLightweightMode(mode)` path rather than the Guided `startSetup()` path.
- Table Tracker Device Setup now uses that same intended lightweight-mode path.
- A null-safe read was added for the optional `#modePlayerCount` control inside `startLightweightMode`.

Aside from cache/version imports and those targeted routing corrections, the underlying gameplay/rules engine was not redesigned by the V2 work.

## Functional browser QA

All tested V2 navigation and visible-control checks passed in headless Chromium using a 932×430 iPhone-landscape viewport.

Verified flows include:

- App boot and Landing
- Landing → Game Mode → Back
- Fully Guided → Player Setup
- Player Setup player tabs, adding Player 3, tab switching, deck/precon/view-deck hooks
- Player Setup → Rules → Device Setup and complete Back navigation
- Cancel behavior
- Deck Editor open/close and preserved controls for new/copy/precon/import/name/commander/deck list/validate/save/delete
- Settings and Profile modal routing/back behavior
- Freeplay Rules → Device Setup → game start
- Table Tracker Rules → Device Setup → tracker start
- Table Tracker life adjustment and change-log update
- Table Tracker player-name editing
- Table Tracker status editor
- Table Tracker inline mana control
- Table Tracker footer Mana chooser, color chooser and mana editor
- Table Tracker Edit Decks route
- Table Tracker Reset confirmation
- In-game Settings
- No functional page errors on tested Table Tracker or Freeplay routes

## Visual/layout QA

Verified browser renders were captured for:

- Landing
- Locked Game Mode Select
- Player Setup
- Rules
- Device Setup
- Deck Editor
- Settings
- Profile
- Table Tracker device setup
- Live Table Tracker
- Live Freeplay/gameplay
- iPad Table Tracker
- iPad Freeplay/gameplay

The 1536×709 Table Tracker/gameplay masters are uniformly scaled as a single canvas. At 932×430 they fit the phone landscape viewport; at 1194×834 their aspect ratio is preserved and centered rather than stretched.

## Static QA

Passed:

- JavaScript syntax checks for root JS and `tests/*.js`
- CSS parsing for `ui-v2.css` and `game-mode-locked.css` with zero parse errors
- Duplicate-ID scan for `index.html` and `ipad.html` with zero duplicate IDs
- No horizontal page overflow in the tested phone-landscape route flow

## Release status

**V0.8 IV UI V2 passed the tested browser, routing, visible-control, static and visual regression checks.**

The V0.8 IU rollback branch remains available for recovery.