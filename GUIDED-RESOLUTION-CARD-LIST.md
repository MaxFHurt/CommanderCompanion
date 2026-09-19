# Commander Companion — Guided Resolution Card Backlog

Last updated: 2026-09-19

This file tracks every real card observed to require Guided Resolution. A card stays listed until the relevant behavior is automated and verified, or an explicit decision permanently keeps that mechanic guided.

## OPEN

### Brainstorm
- Status: OPEN
- Observed behavior: casting reaches `ORACLE RESOLUTION REQUIRED`.
- Oracle pattern: draw three cards, then put two cards from hand on top of library in any order.
- Classification: current engine automation gap; Guided Resolution is acting as the safety fallback.
- Existing evidence: deterministic Guided stack recovery test uses Brainstorm and confirms Back does not silently resolve it and Clear Stack safely restores pre-cast state.
- Desired automated behavior:
  - draw exactly three tracked cards
  - choose exactly two cards from the resulting hand
  - preserve chosen ordering
  - place them on top of the tracked library in that order
  - complete stack resolution normally
  - Undo restores exact pre-cast library/hand/mana state

### Dismantling Wave
- Status: OPEN
- Observed behavior: BT alternate-cost safety classification routes the card to Guided Resolution because its Oracle text includes Cycling and a cycling trigger.
- Oracle pattern: normal multi-opponent targeted destruction plus Cycling {6}{W}{W}, with a triggered global artifact/enchantment destruction effect when cycled.
- Classification: intentional safety fallback while Cycling / alternate-zone activation is not fully automated.
- Desired automated behavior:
  - normal spell cast selects up to one legal artifact/enchantment per opponent
  - Cycling is activatable from hand for its cost
  - cycling discards/moves the exact tracked card correctly and draws
  - cycling-triggered global destruction uses the stack correctly
  - all affected tracked permanents move to the correct owners' graveyards
  - Back/Cancel and Undo remain exact

## ADDITION RULE

Whenever testing finds another named card that enters Guided Resolution, add it here immediately with reproduction notes before continuing the mechanic work.
