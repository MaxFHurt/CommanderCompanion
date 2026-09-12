# Commander Companion V0.8.0 — Batch 2.1 Correction

Batch 2 remained open after live-device testing exposed two menu-architecture regressions.

## Corrected
- Back control now renders the approved `ui-back.png` as the visible control itself instead of relying on an HTML text button with a CSS background.
- DRAW CARD no longer embeds Random Draw and Cancel controls inside the modal content body.
- DRAW CARD now uses the shared action rail: Cancel bottom-left; Random Draw bottom-right.
- Draw instructions, search field, and tracked-library results remain in the content area.
- Selecting a tracked card continues to open the confirmation flow with contextual Back at the top and Confirm in the shared action rail.

## Not changed
- Draw rules and tracked-library behavior.
- Combat, mana, persistence, profiles, deck import, triggers, priority, startup/cache logic.
- Landing page or base game-screen geometry.
