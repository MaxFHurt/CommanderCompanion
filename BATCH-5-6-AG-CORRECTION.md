# V0.8 AG — Current Batch Correction

- Fixed precon-to-player binding so selecting a preconstructed deck carries its actual deck name/source into hydration instead of falling back to `Setup deck`.
- Manual deck edits clear saved/precon source binding so stale metadata cannot survive edits.
- Removed explanatory/deck/mulligan text above Opening Hand; the hand is now the visual focus.
- Removed stale `Virtual Hand does not choose a random card automatically` sentence pending the later Virtual Deck rules pass.
- Corrected shared Confirm/Cancel PNG geometry: preserve image aspect ratio, use `background-size: contain`, and remove underlying HTML button border/outline/shadow.
- No combat, mana, priority, trigger, startup/cache, or rules-engine changes.
