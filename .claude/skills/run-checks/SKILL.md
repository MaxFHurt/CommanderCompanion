---
name: run-checks
description: Run Commander Companion tests — targeted while working, full set before a live push. Delegate to a haiku sub agent and get back only pass/fail counts and failures.
---
Delegate to a `haiku` sub agent; ask for counts + failing ids/messages only, no logs.
From `rebuild/`:
- **Only Deck Builder changed:** targeted `cd deck/tools/tests/suite && SHARD=0/1 SHARDPLAN=<plan.json> node ui-test.mjs` with the
  test ids; before live: `check.sh all live` (~36 min, run in background).
- **Game files changed** (outside `deck/`): `node tests/node/{game,mechanics,tracker,forge-triggers,catalog}.mjs`,
  `node tests/node/soak.mjs 20` (expect "0 problems"). Playwright: `python3 -m http.server 4180 --bind 127.0.0.1 &`, then
  `python3 tests/{tracker_test,game_ui,flows_ui,challenge_ui,net_ui,online_ui,tracker_net_ui}.py`; **kill the server after**.
- Playwright pip version must match /opt/pw-browsers (see HANDOFF.md §6).
- Expected counts: HANDOFF.md §6 (~L437).
