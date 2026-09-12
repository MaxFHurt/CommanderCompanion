# Commander Companion V0.7.9.30 — Handoff / Save Point

## Authoritative build
Continue from V0.7.9.30 only. Preserve locked visual and functional work unless the user explicitly asks for a change.

## V0.7.9.30 targeted corrections
- Restored the functional battlefield zone row: Graveyard, Exile, Tokens, Attachments.
- Kept only the useless empty battlefield card placeholder rectangles removed.
- Kept the open atmospheric battlefield/playmat and larger played-card sizing.
- Removed the floating DRAW label/button over the hand. Smart contextual draw remains on the existing Smart jewel/action flow.
- Completed player-card palette propagation so player-specific decorative accents follow the player's assigned color rather than retaining purple.
- Life display rule: heart icon is always red for every player; life-total number uses the current player's palette color.
- Player 2 therefore uses blue card accents while the global Commander Companion frame/chassis remains purple.

## Preserved V0.7.9.29 functional hotfixes
- Normal basic lands enter untapped unless a real card/rule/effect explicitly makes them enter tapped.
- Battlefield cards, including grouped basic-land stacks, remain tappable for card details/actions.
- Card ID search input retains the iPhone focus/input-layer fix.

## Preserved current features
- Home button with confirmation before leaving/closing the current game.
- Secondary Commander is conditional on Partner or an equivalent supported pairing mechanic.
- Game Log Undo rewinds the last game step.
- Full Game History controls stay above the iPhone safe area.
- One full player board at a time with player navigation.
- Nonnegative mana and current over/equal/under coloring.
- Description-free selected-card mana calculator with sufficient/insufficient available mana coloring.
- Slower Smart jewel pulse.
- Approved popup/menu styling and locked landing page preserved except version text.

## Visual lock rules
- Do not alter the landing page except permitted version updates and previously approved centering/bottom-line corrections.
- Global Commander Companion frame/chassis remains purple/chrome/black.
- Player-card-specific surfaces and accents use the player palette.
- Life heart is universally red; life number is player-colored.
- Graveyard / Exile / Tokens / Attachments remain visible and functional.
- Never reintroduce fake empty battlefield card slots.
- Never reintroduce a floating DRAW label/button.

## Packaging
Future packages use upload folders with at most 99 files each named `Uploaded 1st`, `Uploaded 2nd`, `Uploaded 3rd`, etc. Upload folder contents sequentially into the repository root.

## Development discipline
Modify only explicitly requested code. No adjacent cleanup, refactors, redesigns, or unrelated visual changes. Do not claim visual confirmation until tested on iPhone.
