# Commander Companion V0.7.9.28 — CURRENT HANDOFF / SAVE POINT

## Authority
This file describes the current Commander Companion build state at V0.7.9.28. Continue from this build; do not rebuild from an older V0.6/V0.7 branch and do not redesign unrelated approved areas.

## Non-negotiable development rule
Change only what the user explicitly requests. No adjacent cleanup, opportunistic refactors, redesigns, spacing changes, or component substitutions. Preserve all locked/working code outside the requested scope.

## Current source/build
- Source directory used to package this handoff: `cc079_game_screen_v07928`
- Version shown on landing: V0.7.9.28
- iPhone is the primary target; iPad remains supported.
- GitHub upload packages must be split into `Uploaded 1st`, `Uploaded 2nd`, etc., with no more than 99 files in any upload folder.

## Locked landing page
Preserve the approved Commander Companion Horizon landing page exactly. The only standing exceptions are the already-approved centering correction, bottom-line trim, and updating the visible version number.

## Visual/game-screen state
- Purple metallic / silver-chrome / black industrial Commander Companion theme.
- One full player board visible at a time; arrows switch the viewed player.
- Entire player-card surface uses that player's palette for stronger player distinction while preserving identical geometry.
- Commander tax remains centered on the commander display.
- Mana icons have counts below them; available-state coloring and nonnegative clamping remain in place.
- Selected-card mana calculator is stripped down to required/available values only; available is green when sufficient and red when insufficient.
- Hand is a live floating tray; current hand/hub geometry from the approved near-final pass is preserved.
- Smart Action uses the center jewel and a slower pulse. Smart Action never advances/ends a phase.
- Draw smart action appears as a dedicated action over the hand when Draw is the contextual smart action.
- Bottom hub includes Card ID, Chat, Home, Smart jewel, Help, Settings, and Profile. Home requires confirmation before returning to landing.
- Game Log is tappable for full history and contains an Undo control that rewinds the last engine/game step. Full-history action buttons must remain visible above the safe area.

## Battlefield correction in V0.7.9.28
The outlined empty card-slot placeholders on the battlefield are intentionally removed. They have no gameplay function and must not return.
- Do NOT remove Graveyard, Exile, Tokens, or Attachments.
- Do NOT remove actual battlefield cards or token stacks.
- Battlefield is now a continuous atmospheric playmat surface rather than fake card slots.
- Played battlefield cards use the same target dimensions as cards in the player's hand.
- Cards should occupy the open playmat naturally rather than appearing to snap into unused outlined slots.

## Game setup
Secondary Commander is hidden by default and is only exposed when the selected primary commander supports Partner or an equivalent legal paired-command-zone mechanic. Preferred/saved deck behavior and commander prefill must remain intact.

## Rules/function notes
- Normal lands should enter untapped unless the card's rules/effect or an explicit choice says they enter tapped. The current land path sets basic lands untapped and uses oracle/rules parsing for nonbasics; this area should be function-tested carefully during the upcoming extensive play test.
- Mana cannot go negative.
- Existing legality, draw/discard confirmation, combat, stack/log, undo, profile/deck persistence, and `.ccsave` backup/restore systems remain part of the build and should not be removed.

## Current QA status
For this package, JavaScript syntax checks passed for `app.js`, `ui-render.js`, and `transactions.js`; required Home/Card ID/Game Log Undo hooks and the V0.7.9.28 battlefield override were checked in source. This does not replace live iPhone gameplay testing.

## Next phase
The user is approaching a visual-master lock. Continue with targeted fixes only, then perform extensive function play testing. Do not call the visual master locked until the user explicitly confirms it.
