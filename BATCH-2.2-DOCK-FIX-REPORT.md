# Commander Companion V0.8.0 — Batch 2.2 Dock Binding Correction

## Scope
Correction to Batch 2 only. No Batch 3 work and no gameplay/rules-engine changes.

## Defect
The Batch 2 delegated bottom-dock listener replaced the original per-render binding path. On the deployed game screen the dock controls could render but fail to invoke their actions.

## Fix
- Removed the persistent delegated `gameScreen` dock listener introduced in Batch 2.
- Restored binding as part of `bindGameActions()`, which runs after each game render.
- Each newly created `[data-hub]` control receives a fresh `addEventListener('click', ...)` handler.
- The listener prevents default behavior and stops propagation before routing through `openHubAction()`.
- This is safe because the dock nodes themselves are replaced on render, so old listeners disappear with the old nodes.

## Covered controls
- Home
- Card ID
- Game Chat
- Player Rescue
- Settings
- Profile

## Preserved Batch 2.1 work
- Approved Back graphic handling.
- Shared action-rail menu architecture.
- Draw Card layout correction: content in body, Cancel left, Random Draw right.

## Intentionally unchanged
Combat, mana, persistence, decks, profiles, card effects, triggers, priority, multiplayer rules, startup/cache/service-worker behavior, and normal game-screen geometry.
