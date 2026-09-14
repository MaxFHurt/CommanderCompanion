# Commander Companion V0.8 AJ — Mana / UI Correction Pass

This corrective build stays inside the Complete Mana System batch.

## Fixed in AJ
- Removed the duplicate Back-button artwork on static dialogs by making the embedded `ui-back.png` the only visible Back graphic.
- Centered red/green footer action labels horizontally and vertically, including paired and single-action buttons.
- Available-mana displays now hide zero-value mana types and show only mana/sources that are currently available.
- Flexible mana appears directly inside Available Mana rather than in a separate FLEX category.
- Two-color flexible sources use one circular diagonal split badge, matching the approved split-mana visual language.
- Five-color/any-color sources use one distinct any-color flexible badge rather than pretending to be two colors.
- Gemstone Caverns now resolves its mana source state conditionally:
  - no luck counter: `{T}: Add {C}` only;
  - luck counter present: `{T}: Add one mana of any color` only.
- Adding/removing a counter from a battlefield mana source refreshes its registered mana capacity so Gemstone Caverns can switch correctly between colorless and any-color states.
- Gemstone Caverns now exposes `luck` in its card-counter controls for testing/state correction.
- Mana payment continues to treat one flexible source as one source; one any-color source cannot pay two colored symbols at once.

## Preserved from AI
- Compact activated-ability cost/effect layout.
- Choice-before-commit flow for modal mana abilities.
- Red Cancel / green action buttons.
- Action-specific commit labels such as PLAY LAND, CAST CARD, USE ABILITY, etc.

## Not included
No Virtual Deck, Freeplay, combat, card-detail redesign, Safari/startup/cache, or unrelated subsystem work was added.
