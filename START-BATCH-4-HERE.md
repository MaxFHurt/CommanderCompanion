# Commander Companion — START BATCH 4 HERE

Last updated: 2026-09-19

## Purpose

This is the clean handoff point for a new Commander Companion development chat.

**Do not reconstruct project state from chat memory. Read the repository files listed below first.**

## Safe starting point

**Roadmap:** 12-batch plan  
**Completed:** Batches 1, 2, and 3  
**Next:** Batch 4 of 12 — Effects + Triggers  
**Safe build:** V0.8 BZ  
**Safe checkpoint commit:** `65e7b83b22684f4a1bf9faf9a4e42fbead4f00d6`  
**Final Batch 3 Browser Test run:** `35446925832` — success  
**Final Batch 3 Pages deployment:** `35446925122` — success

Do not start from old BN/BP/BQ/BR/BS/BT/BU/BV/BW/BX/BY prep branches. Use current `main`.

## Read these files before any implementation

1. `BUILD-PROGRESS-LOCK.md`
2. `COMMANDER-COMPANION-CURRENT-STATE.md`
3. `BATCH-3-COMPLETION-REPORT.md`
4. `LOCKED-DEVELOPMENT-WORKFLOW.md`
5. `GUIDED-RESOLUTION-CARD-LIST.md`
6. `FUTURE-WORK.md`
7. `BUILD-HISTORY.md`

## First action in the new chat

Before changing gameplay code, UI code, tests used to advance a checkpoint, or a build letter:

1. Confirm current `main` still descends from / contains V0.8 BZ.
2. Read `BUILD-PROGRESS-LOCK.md`.
3. Claim the lock for the new Batch 4 chat by updating `BUILD-PROGRESS-LOCK.md`.
4. Update `COMMANDER-COMPANION-CURRENT-STATE.md` from “Batch 3 complete / Batch 4 next” to “Batch 4 active” only when actual Batch 4 work begins.
5. Create the first Batch 4 checkpoint from current `main`; do not reuse an older prep branch.

## Batch 4 scope

**Batch 4 — Effects + Triggers**

Batch 4 should expand native effect/trigger automation from the safe Batch 3 engine foundation.

Before implementation, write the Batch 4 mechanic checklist into Current State / active notes so progress can be tracked without inventing new roadmap batches.

The 398-card Guided Resolution audit is a source of concrete effect/trigger patterns to automate, but the entire backlog is not required to be cleared in one pass unless Aaron explicitly changes scope.

## Guided Resolution rule

Unsupported card behavior may remain in Guided Resolution when:
- fallback is explicit and recoverable
- game state is not silently committed
- stack/Undo recovery stays exact
- the named card remains in `GUIDED-RESOLUTION-CARD-LIST.md`

Future approved feature:
- authorized user teaches **the app** a card resolution
- saved recipe is reused automatically later
- teaching/editing/deleting recipes is PIN-protected
- normal use of saved recipes does not require the PIN
- this is not a player tutorial

## UI rule

Do not casually alter the working UI.

When Batch 4 work touches UI:
- isolate the change
- preserve the current approved layout/theme
- test it
- present it to Aaron
- Aaron must explicitly approve the implemented UI change before that UI checkpoint advances

## Batch handoff rule

Only one chat may advance actual build progress at a time.

At the end of Batch 4:
- stop
- write a detailed Batch 4 completion report into the repo
- give Aaron the same detailed handoff
- do not begin Batch 5 until that handoff is complete
