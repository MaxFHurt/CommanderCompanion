# Commander Companion V0.8 AD — Consolidated Persistence + Game Log

This checkpoint consolidates original Batch 5 (Basic Active-Game Persistence) and Batch 6 (Game Log / Player Notifications).

## Persistence
- Active game serialization continues to preserve players, life, turn, phase, battlefield, hands, library, graveyard, exile, command zone, mana, counters, statuses, commander state, rules, stack, pending triggers, multiplayer metadata, and game log.
- Restore normalization now explicitly repairs missing rules, stack, pending triggers, priority, multiplayer, post-game, commander, deck-zone, mana, counter, confirmation, and status containers.
- Undo snapshots remain intentionally excluded from saved payloads to avoid Safari storage growth.
- Existing localStorage + IndexedDB newest-valid-save recovery is preserved.
- Opening-hand randomize/customize/confirm and tracked draw/move actions remain autosaved.
- Direct token creation, Freeplay battlefield add, GM override, and blocker confirmation now force an explicit save before leaving the action flow.
- No visibilitychange/pagehide/beforeunload persistence logic was added. Safari lifecycle/startup remains reserved for the final startup batch.

## Game log / notifications
- Player notifications now carry timestamp, phase, affectedPlayerIds, attention metadata, and event kind.
- Life gain/loss, poison changes, status gain/loss, and publicly meaningful zone movement are compared before/after transactions and logged with the affected player.
- Battlefield -> graveyard movement is distinguished from other zone movement.
- Hand/library-only movement stays private in the public log unless a card moves into or out of a public zone.
- Base transaction log entries now include phase and affected player metadata.
- Existing combat-specific life/poison/permanent notifications remain intact.
- Game log remains part of the serialized active game and therefore survives Continue Game.

## Intentionally unchanged
Combat rules, mana rules/payment, priority behavior, trigger/effect rules, commander rules, deck/profile persistence architecture, Freeplay rules, Table Tracker architecture, service workers, cache purge logic, and Safari startup/resume behavior.
