# Commander Companion V0.8 AH — Complete Mana System + shared menu cleanup

## Mana engine
- Flexible mana sources are represented as one source with multiple legal color options instead of being counted once in every possible color.
- Flexible sources are committed to exactly one production choice when a payment uses them, then the actual source card is tapped.
- Fixed colored sources and floating mana remain separate; automatic payment spends existing floating mana before tapping another fixed source.
- Generic costs spend colorless first, then unused flexible sources, then colored fixed mana.
- Mana added by abilities/effects is explicitly tracked as floating mana and cleared at phase boundaries.
- Phase/turn resets rebuild available fixed mana from actual battlefield tap state instead of blindly copying total capacity, preventing double-counting after untap.
- Mana-producing lands, artifacts, and tap-mana permanents register capacity from safe `{T}: Add ...` abilities; multi-output fixed sources such as `{C}{C}` keep their full production amount.
- Mana creatures obey summoning sickness for `{T}` mana abilities unless they have haste; they become available on a later turn without inflating mana on entry.
- Multi-color sources register as flexible sources; commander-color-identity sources are restricted to the active commander identity when that wording is detected.
- The Available Mana display adds split-color indicators for flexible untapped sources, one count per actual source.
- Mana-source removal now unregisters capacity correctly whether the source leaves untapped, tapped, or is sacrificed as an activation cost.

## Shared menu cleanup
- All graphical Back controls now render the PNG itself; legacy visible BACK text was removed from static dialog markup.
- Cancel/Deny/Reject semantics use the red Cancel treatment.
- Confirm/primary actions, including End Turn, Start Game, Confirm & Next, Apply, Cast, Play and Done, use the green Confirm treatment.

## Scope preserved
No Freeplay redesign, Virtual Deck/draw redesign, card-detail redesign, combat changes, startup/service-worker changes, or landing-page layout changes were included.
