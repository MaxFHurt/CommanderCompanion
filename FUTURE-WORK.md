# Commander Companion — Future Work

Last updated: 2026-09-19

## Guided Resolution — Teach the App a Card Resolution

**Status:** APPROVED FUTURE FEATURE — not yet scheduled for implementation.

This feature teaches **Commander Companion itself**, not the player.

When a card reaches Guided Resolution because its behavior is not yet automated, an authorized user may enter a protected teaching flow and demonstrate/configure the correct tracked resolution for that specific card. Once the taught resolution is saved, Commander Companion should reuse that saved resolution automatically whenever that card/mechanic reaches the same supported context in future games.

### Required behavior

- A card that is unsupported continues to fall safely into Guided Resolution.
- Guided Resolution offers an owner/admin teaching action for creating or correcting that card's saved resolution recipe.
- Entering teaching mode requires a PIN.
- Creating, editing, replacing, or deleting a saved taught resolution requires the PIN.
- Normal gameplay use of an already-saved taught resolution does **not** require the PIN.
- The teaching flow records the actual tracked operations needed to resolve the card, including as applicable:
  - choices / modes
  - legal targets
  - costs
  - zone movements
  - counters
  - life / poison / mana changes
  - token creation
  - trigger / stack behavior
  - ordering
  - conditional branches
- Saved behavior must identify the card and enough context/version information to avoid incorrectly applying an obsolete or incompatible recipe after Oracle/rules changes.
- A saved taught resolution must still pass normal legality, ownership, target, zone, and state checks. Teaching must not become a general rules bypass.
- Back / Close / Cancel during teaching must not commit gameplay state.
- A failed or incomplete teaching attempt must not overwrite the last verified saved recipe.
- Taught recipes should be reviewable and removable from an owner/admin management screen in a later UI batch.
- Cards with saved recipes remain traceable in the Guided Resolution backlog until the behavior is either promoted into the native engine or explicitly retained as a taught recipe.

### Product intent

The goal is to let Aaron progressively eliminate repeated Guided Resolution work without waiting for every unusual Magic card pattern to receive bespoke engine code.

This is **not** a player tutorial, coaching system, or instructional overlay. The word “teaching” here means teaching the application how to resolve a card.

### UI / security gate

This feature is UI-affecting and therefore remains subject to the locked UI approval rule. Batch 3 is complete; do not infer that this feature automatically belongs to Batch 4 unless Aaron explicitly places it there. The PIN setup/entry UI and the teaching interface must be shown to Aaron for explicit approval before the implementation is allowed to advance.
