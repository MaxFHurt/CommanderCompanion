# Commander Companion — Batch 3 Completion Report

Last updated: 2026-09-19

## Completion status

**BATCH 3 OF 12 — CARD INTERACTION ENGINE: COMPLETE**

**Final safe checkpoint:** V0.8 BZ  
**Final checkpoint commit:** `65e7b83b22684f4a1bf9faf9a4e42fbead4f00d6`  
**Final Browser Test run:** `35446925832` — completed / success  
**Final Pages deployment run:** `35446925122` — completed / success

Batch 4 has **not** started.

## Final validation

The final V0.8 BZ checkpoint passed:
- local Chromium browser regression
- local WebKit browser regression
- matching GitHub Pages deployment
- live GitHub Pages browser regression
- phone and iPad checkpoint identity alignment
- all promoted Batch 3 deterministic regression tests

The final promoted live-flow suite includes:
1. 4-player Table Tracker starts and preserves direct state edits
2. Freeplay launches into the live game chassis
3. sacrifice-cost triggers and exact Undo
4. life-payment costs, life-loss triggers, failure rollback, exact Undo
5. Fabled Passage-style search, conditional untap, exact Undo
6. tap-cost legality, double-activation rejection, exact Undo
7. modal-spell automation and alternate-cost safe Guided fallback
8. Lita-style unique modal trigger tracking per source/per turn
9. paired commanders and independent commander-tax tracking with exact Undo
10. double strike, lifelink, infect, deathtouch, trample, and state-based deaths
11. simultaneous triggers, last-known events, entry replacement parsing, exact Undo
12. multi-object stack, priority, LIFO resolution, response-spell Undo
13. Fully Guided Turtle Power vs Wakanda Forever live setup/gameplay flow
14. Guided stack pause survives Back and remains visible in Game History

The smoke suite also verifies landing/start/setup/mobile-overflow safety.

## Batch 3 completed work

### Stack / recovery
- Preserved pending Guided stack objects through Back / Close.
- Added visible stack entries in Game History.
- Added explicit Clear Stack recovery.
- Clear Stack rewinds pending stack actions instead of falsely resolving them.
- Canceling Clear Stack commits nothing.
- Recovery restores spell/card zone, paid mana/source taps, sacrifice state, priority, and tracked state.
- Clear Stack has deterministic recovery coverage.

### Card/deck identity
- Different decks remain isolated.
- Opening-hand instances are distinct and tied to the correct tracked deck.
- Setup deck identity no longer leaks across players.

### Costs and Undo
- Sacrifice activation costs emit `sacrificed`, `leaves-battlefield`, and `dies` correctly rather than a false discard event.
- Life-payment activation costs emit life-loss events, reject impossible payment, and roll back exactly.
- Tap costs reject a second activation while the source is already tapped.
- Undo restores exact pre-action zones, taps, mana, counters, triggers, stack, and relevant state.

### Search / tutors
- Fabled Passage-style exact tracked-card search is covered.
- Sacrifice, stack placement, exact library-card movement, conditional four-land untap, shuffle path, and Undo are covered.

### Modal / alternate costs
- Supported modal spells remain automatable.
- Unsupported alternate-cost / alternate-zone keywords are detected before generic parsing.
- Cycling, Overload, Kicker, Multikicker, Buyback, Flashback, Escape, Foretell, Dash, Evoke, Spectacle, Blitz, Cleave, Mutate and similar unsupported patterns fail safely into Guided Resolution rather than being partially/silently resolved.

### Trigger / replacement safety
- Lita-style “choose one that has not been chosen this turn” behavior is tracked per source and per turn.
- Duplicate same-turn mode choices are rejected.
- Mode exhaustion and next-turn reset are covered.
- Simultaneous triggers preserve event batches and APNAP/controller metadata.
- Last-known trigger sourcing is covered.
- Back/Undo restores pending-trigger state exactly.
- Fixed a real replacement/parser defect: numeric counter names such as `+1/+1` were not recognized by the enters-with-counters parser because digits were excluded from the counter-name regex.

### Commander / partner safety
- Legal paired commanders are accepted.
- Illegal shared commander configurations are rejected.
- Commander cast count/tax is independent per commander.
- Undo restores commander zone, cast count, tax, and stack exactly.

### Combat interaction safety
- Double strike performs both damage steps.
- Lifelink gains life from each damage event.
- Infect converts player damage to poison.
- Deathtouch + trample lethal assignment is covered.
- State-based deaths move the exact tracked cards and emit dies events.

### Priority / response / multi-object stack
- Multi-object stack ordering is covered.
- Wrong-player priority responses are rejected.
- Responses reset pass state correctly.
- Full priority pass closes the window.
- Stack resolution is LIFO.
- Undo across response-spell resolution restores the exact stack/hand/priority state.

## Guided Resolution audit

A ten-precon audit was performed against:
- Turtle Power!
- Wakanda Forever
- Avengers Assemble
- Blood Rites
- Chaos Incarnate
- Desert Bloom
- Miracle Worker
- Scions & Spellcraft Collector's Edition (FINAL FANTASY XIV)
- Sliver Swarm
- Witherbloom Pestilence

The audit produced **398 named cards** with one or more Oracle/mechanic patterns that are not yet fully automated.

Those cards are recorded in `GUIDED-RESOLUTION-CARD-LIST.md` with:
- card name
- source deck(s)
- unsupported pattern / reason
- classification
- evidence
- desired automated behavior
- OPEN status

Per Aaron's product decision, these cards are **not Batch 3 blockers** when they fail safely into Guided Resolution and do not corrupt/trap game state.

The dedicated audit also exposed intermittent external MTGJSON/WebKit `Load failed` behavior during repeated remote hydration. This is recorded as external audit infrastructure instability, not a tracked-state/card-engine defect. The successful audit output that generated the 398-card inventory remains preserved in the repository backlog.

## Guided Resolution product decision

For unresolved card patterns:
- safe Guided Resolution fallback is acceptable
- the card must remain in the backlog
- Back / Close / Cancel may not silently commit the unresolved result
- the stack must remain recoverable
- Clear Stack / Undo must preserve exact tracked state where applicable

A future approved feature will allow an authorized user to **teach Commander Companion itself** the correct resolution for a card from Guided Resolution:
- teaching the app is PIN-protected
- creating/editing/replacing/deleting a taught recipe requires the PIN
- normal reuse of a saved recipe does not require the PIN
- this is not a player tutorial/coaching feature
- see `FUTURE-WORK.md`

## Bugs found during Batch 3

Real defects found and corrected:
- sacrifice-cost events incorrectly behaving like discard in some activation paths
- stale-reference assumptions in early regression tests after state restore
- unsupported alternate-cost mechanics could otherwise be mistaken for complete generic automation
- enters-with-counters parser failed numeric counter names such as `+1/+1`
- stale iPad build identity/cache key was corrected at BZ closure

Test/harness assumptions corrected without gameplay changes:
- simultaneous sacrifice and dies events are separate event batches
- `priorityHolder()` returns a player object, not a player ID string
- prep-branch live Pages tests cannot validate unpromoted code on the deployed `main` site

## Known limitations carried forward

- 398 audited cards remain OPEN for future native automation or the future taught-resolution system.
- External precon/card hydration depends on remote services and can intermittently fail independently of the game engine.
- Safe Guided Resolution is an intentional compatibility path until unsupported patterns are automated.
- Batch 3 did not perform the future PIN-protected teaching-system implementation.
- Batch 3 did not perform broad UI restyling.

## UI safety

The current UI remains the approved visual/function baseline.

Future UI-affecting work must:
- preserve the current baseline
- make only the scoped change
- be tested before presentation
- be explicitly reviewed and approved by Aaron before advancing past the UI checkpoint
- never treat a technically passing visual change as automatically approved

## Batch boundary

**STOP HERE.**

Batch 3 is complete.  
Batch 4 — **Effects + Triggers** — is the next roadmap batch and has not started.

A new chat must read `START-BATCH-4-HERE.md`, claim the build-progress lock, and begin only from V0.8 BZ / current `main`.
