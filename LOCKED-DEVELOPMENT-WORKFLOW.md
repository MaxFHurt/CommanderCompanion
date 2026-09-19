# Commander Companion — Locked Development Workflow Rules

Last updated: 2026-09-19

These rules are authoritative for all future Commander Companion development work.

## 1. Twelve-batch roadmap remains authoritative

Do not replace the 12-batch roadmap with build-letter checkpoints. Build letters such as BN, BP, BQ, BR, BS, BT, BU are checkpoints inside a batch unless explicitly promoted to a new roadmap batch.

Current roadmap:
1. Persistence + Game Log
2. Complete Mana System
3. Card Interaction Engine
4. Effects + Triggers
5. Complete Combat
6. Turn Flow + Priority + Available Actions
7. Commander + Card Regression
8. Multiplayer + End Game
9. Freeplay + Table Tracker
10. Visual Feedback + Final UI Polish
11. iOS Interaction + Safari/Startup
12. Final Full Regression

## 2. Mandatory stop between batches

At the end of every roadmap batch:
- STOP before starting the next batch.
- Give Aaron a detailed status update.
- Record the same update in the repository so it can be reviewed later.
- Include: completed work, tests run, failures found, fixes applied, known limitations, Guided Resolution backlog changes, current safe checkpoint, and exact next-batch scope.
- Do not begin the next roadmap batch until that handoff has been presented.

## 3. UI approval gate

The current UI is considered working and visually successful. Cosmetic and functional UI changes must be handled conservatively.

When a UI-update batch or UI-affecting change is reached:
- Preserve the current approved UI as the comparison baseline.
- Make only the specifically scoped change.
- Do not refactor or restyle adjacent UI without explicit approval.
- Test the implementation before presenting it.
- Aaron must review and explicitly confirm the implemented UI change before development advances past that UI checkpoint.
- A technically passing UI change is NOT automatically approved.
- If Aaron rejects it, restore/revise without carrying the rejected presentation forward.
- Back / Close / Cancel must remain non-committing unless explicitly designed otherwise.

## 4. Guided Resolution backlog is mandatory

Any card observed to enter Guided Resolution must be added to `GUIDED-RESOLUTION-CARD-LIST.md`.

For each card record:
- card name
- mechanic / Oracle pattern causing Guided Resolution
- whether Guided Resolution is intentional safety fallback or an engine defect
- reproduction/test evidence
- desired automated behavior
- status: OPEN / PARTIAL / FIXED / VERIFIED

Cards must remain on the list until their automated behavior is fixed and verified, or until an explicit product decision permanently keeps that mechanic guided.

## 5. Safety definition

Do not advance a gameplay checkpoint if it introduces a game-stopping/corrupting defect, including:
- unresolved stack that traps the game
- card disappears or enters the wrong zone
- incorrect committed state after Back/Cancel
- Undo fails to restore the exact tracked pre-action state
- illegal payment or action corrupts state
- priority/turn flow becomes permanently stuck

Card-specific incomplete automation may temporarily use Guided Resolution only when the fallback is explicit, recoverable, and recorded in the Guided Resolution backlog.

## 6. Testing / checkpoint rule

For each mechanic:
1. implement or isolate the behavior
2. add deterministic regression coverage
3. test Chromium + WebKit where practical
4. live Pages test where the flow depends on deployed/browser behavior
5. preserve the passing checkpoint
6. do not carry a failed implementation forward

GitHub remains the source of truth for code and recorded project state.


## 7. Single active build-progress chat

Only one ChatGPT conversation may advance actual Commander Companion build progress at a time.

The active build-progress chat is identified in `BUILD-PROGRESS-LOCK.md`.

While that lock is active:
- Only the named owner chat may push gameplay code, UI code, build-version changes, test changes that are intended to advance the active checkpoint, or promote a checkpoint to `main`.
- Other chats may research, inspect code, analyze failures, draft proposed fixes, add batch notes, add future-work notes, add Guided Resolution backlog entries, or prepare non-advancing documentation.
- Other chats must not create a competing build checkpoint, change the active build letter, promote a branch, or modify gameplay/UI implementation.
- Before any build-advancing write, the chat must read `BUILD-PROGRESS-LOCK.md` and `COMMANDER-COMPANION-CURRENT-STATE.md`.
- If another chat sees an active owner, it must stop before implementation and record its findings as notes only.
- Ownership transfers only when Aaron explicitly says to transfer, hand off, or release the build-progress lock.
- A transfer must update `BUILD-PROGRESS-LOCK.md` before the new owner performs build-advancing work.
- If ownership is ambiguous, do not advance the build.

This rule exists specifically to prevent concurrent chats from diverging, overwriting newer work, or independently advancing build letters.
