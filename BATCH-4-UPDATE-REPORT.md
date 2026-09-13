# Commander Companion V0.8.0 — Batch 4 Profile / Setup Persistence — AC

Checkpoint target: `B4-PROFILE-PERSIST`

## Scope applied
- Preserved the saved player profile name and preferred/favorite deck in the existing durable profile store.
- Preserved preferred/default player names and their setup prefill behavior.
- Preserved saved deck exposure in New Game without re-entry.
- Added startup reconciliation between the durable saved-deck store and profile deck library metadata.
- Profile-to-deck links now refresh saved deck name and commander metadata after reload without losing player selection/game history.
- A favorite deck that no longer exists is cleared instead of leaving a stale setup selection.
- Profile and My Decks continue using localStorage + IndexedDB recovery storage.
- No active-game persistence logic was changed.

## Version marker
Landing pages: `V0.8 AC`.

## Intentionally untouched
Combat, mana, priority, active-game autosave/Continue Game, Freeplay, Table Tracker, startup/cache/service-worker architecture.
