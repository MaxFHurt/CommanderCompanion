# Commander Companion — Current State

Last updated: 2026-09-19

## Build-progress ownership

**ACTIVE BUILD-PROGRESS LOCK:** This Commander Companion Batch 3 continuation chat is the sole chat allowed to advance implementation/build progress.

See `BUILD-PROGRESS-LOCK.md` and `LOCKED-DEVELOPMENT-WORKFLOW.md`.

Other chats may add notes/research/backlog documentation, but may not push gameplay/UI implementation, advance build letters, alter active checkpoint tests for promotion, or promote branches until Aaron explicitly transfers the lock.

## Roadmap position

**CURRENT ROADMAP BATCH: 3 of 12 — Card Interaction Engine**

Do not advance to Batch 4 until Batch 3 is fully closed and a detailed batch handoff has been presented to Aaron.

## Current promoted checkpoint

**V0.8 BV**

BT includes the recovered BN stack work plus later Batch 3 safety checkpoints.

## Batch 3 completed / verified checkpoints

- BN stack recovery
  - Guided stack pause survives Back / Close.
  - Game History exposes live stack entries.
  - Clear Stack is explicit recovery and rewinds instead of resolving.
  - Canceling Clear Stack commits nothing.
  - Exact spell/card and paid mana state restore on recovery.
  - Priority clears after recovery.
- deck/opening-hand identity isolation
- cleanup discard confirmation and exact tracked-card zone movement
- graveyard cards do not expose Tap
- battlefield +1/+1 counter badge remains visible
- flexible mana display/counting regression coverage
- Reanimate legality fails closed without a valid creature graveyard target
- MDFC land face respects land-per-turn
- As-Enters Back / Close is non-committing
- Simian Spirit Guide: exact hand card -> exile, add {R}, no stack
- BP sacrifice-cost correctness and exact Undo
- BQ life-payment correctness, life-loss trigger emission, impossible-payment rollback, exact Undo
- BR Fabled Passage / search contract and four-land conditional untap
- BS tap-cost legality, no double activation, exact rollback/Undo
- BT modal/alternate-cost safety
  - supported modal spells remain automatable
  - unautomated alternate-cost keywords are explicitly routed to Guided Resolution rather than partially/silently resolved

## Current active checkpoint

**BU — Lita-style unique modal trigger selection — VERIFIED**

Verified in Chromium + WebKit:
- centralized per-source/per-turn modal-trigger choice ledger in trigger engine
- UI uses trigger-engine ledger
- three unique choices per turn
- duplicate same-turn choice rejection
- exhaustion after all modes selected
- reset next turn
- independent tracking per card instance

**Current active checkpoint: BW — combat keyword + state-based-action interaction safety.**

## Batch 3 remaining closure work

The remaining Card Interaction Engine work includes:
- trigger/replacement-flow regression completion
- commander / partner / dual-commander interaction safety
- combat keyword / state-based-action interaction safety needed by card engine
- deeper multi-object stack / response scenarios
- unsupported/static/alternate-cost card auditing and Guided Resolution backlog population
- representative complex-deck/precon stress testing required for Batch 3 closure

## Mandatory batch boundary

When Batch 3 is complete:
1. STOP.
2. Present Aaron a detailed Batch 3 completion report.
3. Write the same report into repository source documentation.
4. Review remaining Guided Resolution card backlog.
5. Do not begin Batch 4 until this handoff has been delivered.
