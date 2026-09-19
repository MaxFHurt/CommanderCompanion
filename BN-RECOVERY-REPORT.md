# Commander Companion — V0.8 BN Recovery Report

Recovery branch: `bn-recovery`

## Result

**BN RECOVERED — ENGINE-SAFETY CHECKPOINT**

The BN stack-recovery work is complete and the recovery suite passed in both Chromium and WebKit.

## Stack safety verified

- Pending Guided stack object remains on the stack when Back/Close is used.
- Back/Close does not silently resolve or accept an Oracle-guided result.
- Pending stack entries are visible from Game History.
- Clear Stack requires explicit confirmation.
- Canceling Clear Stack commits no gameplay state.
- Clear Stack rewinds pending stack actions rather than resolving them.
- Rewind restores the exact spell/card to its prior zone.
- Rewind restores paid/tapped mana sources to their prior state.
- Priority state is cleared after recovery.
- Recovery is logged explicitly as a rewind, not a resolution.

## Related regressions covered during BN recovery

- Different decks produce isolated tracked opening-hand instances.
- Selected deck identity remains correct per player.
- End-step discard requires explicit confirmation.
- Graveyard cards do not expose Tap actions.
- Battlefield +1/+1 counters remain visible.
- Flexible mana availability remains visible and does not double-count a flexible source.
- Reanimate fails closed without a valid graveyard creature target.
- MDFC land face respects the land-per-turn restriction.
- Back from an As-Enters choice does not commit the choice or land play.
- Simian Spirit Guide hand-zone mana ability exiles the exact tracked card, adds {R}, and does not use the stack.

## Validation

GitHub Actions run: `35435383288`
Result: **completed / success**

This branch is preserved as the recovered BN checkpoint. Newer main-line work may continue from descendants that already contain these fixes.
