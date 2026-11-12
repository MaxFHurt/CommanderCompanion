---
name: deck-test
description: Run Deck Builder tests (specific UI test ids, the quick check, or the full live run) without re-deriving the setup each time.
---
Run from the repo root. `rebuild/deck/tools/tests/suite/run.sh` does setup, serving and cleanup:

    sh rebuild/deck/tools/tests/suite/run.sh ids UI-TAB-01 UI-B88-01   # given UI tests, in one group (~1-3 min)
    sh rebuild/deck/tools/tests/suite/run.sh quick                      # 12 main-screen checks (~30 s)
    sh rebuild/deck/tools/tests/suite/run.sh full                       # release run: check.sh all live (~25-35 min; run in background)

Output: the summary lines only. A UI test that fails in the full run (3 groups side by side) but passes alone is a known flake
(UI-ASYNC-01, UI-B197-02, UI-PLAN-03, UI-STATS-01): rerun it with `ids` and report both results.
Rebuilds the bundles first. Uses a fresh folder under /home/user/dc-runs/ each time (never deletes old ones).
