# Commander Companion — Current State

Last updated: 2026-09-19

## Build-progress ownership

**BUILD PROGRESS IS PAUSED AT THE BATCH 4 BOUNDARY.**

There is currently **no active build-progress owner**.

The next development chat must:
1. read `BUILD-PROGRESS-LOCK.md`
2. read `START-BATCH-4-HERE.md`
3. explicitly claim the build-progress lock in the repository before making build-advancing changes

Until that happens, no chat may advance gameplay/UI implementation, build letters, checkpoint tests, or promotions.

## Roadmap position

**BATCH 3 OF 12 — CARD INTERACTION ENGINE: COMPLETE**

**NEXT ROADMAP BATCH: 4 OF 12 — EFFECTS + TRIGGERS**

Batch 4 has **not started**.

## Current safe checkpoint

**V0.8 BZ**

- checkpoint commit: `65e7b83b22684f4a1bf9faf9a4e42fbead4f00d6`
- final Browser Test run: `35446925832` — completed / success
- final Pages deployment run: `35446925122` — completed / success
- phone and iPad both identify as V0.8 BZ and use the BZ app cache key
- current `main` contains all Batch 3 promoted work and post-Batch-3 documentation

Use current `main`. Do not restart from older prep branches.

## Batch 3 completion

Full details: `BATCH-3-COMPLETION-REPORT.md`

Batch 3 verified:
- stack preservation / Clear Stack recovery
- exact zone/mana/tap/sacrifice Undo
- deck/opening-hand identity isolation
- cleanup discard confirmation
- graveyard cards cannot tap
- battlefield counter visibility
- flexible-mana counting/display safety
- Reanimate legality
- MDFC land-per-turn legality
- As-Enters Back / Close noncommit
- Simian Spirit Guide hand-zone mana ability
- sacrifice-cost event correctness
- life-payment correctness and rollback
- Fabled Passage/search/tutor exact tracked movement
- tap-cost legality
- modal spell automation and safe alternate-cost Guided fallback
- Lita unique modal-trigger ledger
- paired commander legality and independent commander tax
- combat keyword/state-based-action safety
- simultaneous triggers / last-known event safety
- enters-with-counters numeric parser fix
- multi-object stack / priority / LIFO / response Undo
- Turtle Power vs Wakanda Forever live Guided setup/gameplay regression
- Guided stack pause survives Back and remains visible in Game History

## Guided Resolution backlog

`GUIDED-RESOLUTION-CARD-LIST.md` is authoritative.

Batch 3 ten-precon audit:
- 10 real Commander precons
- **398 named Guided Resolution candidates**
- cards remain OPEN for later automation unless separately verified/fixed
- these are not Batch 3 failures when the card safely enters Guided Resolution and game state remains recoverable

Safe Guided fallback is an accepted product behavior.

## Approved future feature — teach Commander Companion a resolution

See `FUTURE-WORK.md`.

Future behavior:
- from Guided Resolution, an authorized user may teach **Commander Companion itself** how to resolve a specific card
- the resolution recipe is saved and automatically reused in later games when compatible
- creating/editing/replacing/deleting taught recipes is PIN-protected
- normal use of a saved recipe does not require the PIN
- teaching is not a player tutorial/coaching feature
- taught resolutions must still obey legality/state checks and safe Back/Cancel/Undo rules

This feature is approved future work and is not part of the completed Batch 3 build.

## UI approval gate

The current UI is working and approved as the baseline.

Any UI-affecting change must:
- be isolated to the requested scope
- preserve unrelated layout/style/function
- be tested before presentation
- be explicitly reviewed and approved by Aaron before advancing that UI checkpoint

Do not batch cosmetic changes into engine work.

## Single-chat development rule

Only one chat may advance actual build progress at a time.

Other chats may:
- research
- inspect
- analyze
- add notes
- add future-work entries
- add Guided Resolution backlog information

They may not implement/promote actual build changes while another chat owns the lock.

## Clean next-chat entry point

Open `START-BATCH-4-HERE.md`.

That file contains the exact Batch 4 startup procedure, source-of-truth files, safe commit, lock-claim rule, and next-batch boundary.
