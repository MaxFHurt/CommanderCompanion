# Handoff for the next chat (28 Nov 2026)

Read `CLAUDE.md` (working rules) first, then this file. Find code through `rebuild/INDEX.md`. Answers to the owner: short.

## Where things stand
- **Live:** Build 122 (app 1.0.0-rebuild.122, Deck Builder 0.9.79 / build 224) on `main`: agreement fix and card roles fix (released 28 Nov).
- **Release branch** `claude/vibrant-faraday-9fv5in` = live. Build 122 contains the agreement fix `UP.agPop 3` and the
  card roles fix `UP.roles2` (417 cards; symmetric draw engines like Howling Mine keep draw, one-shot wheels don't;
  Teferi's Puzzle Box and Righteous Authority left off draw by judgement).
- **Next step:** item 2 of "Open work" below.

## Build 122 baselines
- Bench agreement@5 A/M/B: test 0.191/0.191/0.156, tuneall 0.117/0.144/0.129, holdout 0.198/0.254/0.219.
- semantics 61/2, claims 126, accept 39 x2, scheck bad 2, cisweep 0, edge throws 0, tourney 60/58%,
  genstrong 0.421/0.76. UI suite 155/156 (UI-TAB-01 flaky: passes alone 3/3). Every node/browser suite passed.
- Known flaky UI tests: UI-ASYNC-01, UI-B197-02, UI-PLAN-03, UI-TAB-01. Pass `PORT=89xx` to `run.sh` when agents run.

## Owner's standing decisions (this chat)
- **Card work paused** (owner 23 and 28 Nov): no game-side card updates (rules long tail, verifier `wt/verify1`, batch 6).
  Resume only when the owner says. Batch 7 (148 verified cards) is live.
- **Forge (GPL-3.0): offline check only.** Nothing Forge-derived in the repo; copies live outside it.
- **One power measure** (Build 121): every "power" in the app is the deck's overall power on one scale; "+x power" is the
  real bar change; benchmark fixed until Regenerate; reference builds made with the one measure (bar <= 100);
  Apex = biggest bar gain, Mid/Budget lifted only by a cheaper card that gains more (`UP.oneBest 3`).
- **Be easy on usage** (owner 28 Nov) but keep a few agents busy; cheapest model that can do the job; one large job alone.
- Ask the owner before anything that changes scores, picks or benchmarks; decide wording/layout yourself.

## Open work (non-card), in order
2. **Paired practice games** (same shuffle per card) to cut the power bar's ±0.13-0.3 noise (ROADMAP 6.1b "Open").
3. **Apex decks closer to tournament lists** (generator picks; paused agent work in worktree `wt/genpick`, uncommitted,
   predates one measure: rebase/redo on the release branch). Measure bench, tourney, genstrong; owner chooses.
4. Waiting on the owner (ask again when useful): LABELS.md rows 1-5; more achievements; whether card images are slow on the
   phone (7f.2); whether card reasons read their commanders right (6.2); the player corrections report (section 8).
5. Waiting on the owner's devices: `rebuild/DEVICE_CHECKS.md` (send at the end of the roadmap).
6. Last of all: optimise all code (ROADMAP 99).

## Useful places
- Agreement probes: `/home/user/dc-runs/agree/proto/` (may not survive a new container); role diff tools `/home/user/dc-runs/roles/`.
- Reader comparison: `rebuild/deck/tools/readers-compare.mjs`, `readers-report.md`.
- Card ledger: `rebuild/tools/longtail/ledger.jsonl.gz`, `ledger.mjs`, `GROUPS.md` (for when card work resumes).
