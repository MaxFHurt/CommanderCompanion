# Commander Companion — Build Progress Lock

Last updated: 2026-09-19

## PAUSED — WAITING FOR BATCH 4 OWNER

There is currently **no active build-progress owner**.

Batch 3 is complete. The project is intentionally paused at the Batch 4 boundary so a clean new chat can take ownership.

**Next roadmap batch:** 4 of 12 — Effects + Triggers  
**Safe starting build:** V0.8 BZ  
**Safe checkpoint commit:** `65e7b83b22684f4a1bf9faf9a4e42fbead4f00d6`

## Rule

Only one ChatGPT conversation may advance actual Commander Companion build progress at a time.

Before a new chat performs any build-advancing write, it must:
1. read this file
2. read `COMMANDER-COMPANION-CURRENT-STATE.md`
3. read `START-BATCH-4-HERE.md`
4. update this file to name itself as the active Batch 4 build-progress owner
5. only then begin implementation

Build-advancing work includes:
- gameplay implementation changes
- UI implementation changes
- build/version-letter changes
- checkpoint promotion
- regression/test changes whose purpose is to advance the active checkpoint
- merges/promotions to `main`

While no owner is active, chats may:
- inspect/analyze source
- research
- draft proposed fixes
- add batch notes
- add future-work notes
- add Guided Resolution backlog information
- prepare non-advancing documentation

They must not advance the build.

## Claim procedure

The new Batch 4 chat should replace this PAUSED section with:

- **Status:** ACTIVE
- **Build-progress owner:** the current Batch 4 conversation
- **Roadmap batch:** 4 of 12 — Effects + Triggers
- **Starting checkpoint:** V0.8 BZ / current `main`

Aaron's explicit request to begin Batch 4 in that new chat authorizes the new chat to claim this currently unowned lock.

## Transfer procedure

Once claimed, ownership changes only after Aaron explicitly says to transfer, hand off, release, or otherwise move build ownership.

If ownership is uncertain, **do not advance the build**.
