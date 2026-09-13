# Commander Companion V0.8 AF — Deck Binding / Opening Hand Correction

This is a corrective build inside the still-open consolidated Persistence + Game Log batch. It does not advance to the next subsystem batch.

## Problem
During one game, Player 1 using the custom Deadpool deck and Player 2 using Avengers Assemble displayed the same opening hand despite different selected decks.

## Changes
- A selected saved deck is now authoritative during setup. Hydration uses the saved deck record directly instead of trusting a possibly stale textarea copy.
- Editing a deck-list textarea after selecting a saved deck explicitly clears that saved-deck binding, preventing the UI from showing one saved deck while hydrating different/custom text.
- Saved commander names are rebound from the selected saved deck during hydration.
- Every hydrated player deck now carries a canonical manifest fingerprint and saved-deck identity.
- Before game start, every card instance across library/hand/public zones is checked for the correct player owner and membership in that player's own manifest.
- If different saved deck IDs unexpectedly hydrate to identical manifests, a diagnostic warning is emitted rather than silently hiding the condition.

## Scope intentionally unchanged
- Shuffle algorithm
- Mulligan rule behavior from AE
- Combat, mana, priority, triggers/effects
- Startup/cache/Safari lifecycle
- Freeplay/Table Tracker reworks

Landing annotation: V0.8 AF.
