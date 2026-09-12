# Commander Companion V0.7.9.77 — Release Candidate QA

**Code-side status: PASS**

This is the final automated release candidate. A real iPhone/iPad/browser click-through remains required before stamping V1.0 because browser navigation is blocked in this environment.

## Test results
- PASS: 25 terminal draw / winner / elimination / undo integration assertions
- PASS: 25 menu-semantics / Back-vs-Cancel / sealed-screen-scope assertions
- PASS: 17 Available Actions / priority / commander / Strategy Advisor assertions
- PASS: 33 automatic-winner / draw / concession / history-idempotency / remote-seat assertions
- PASS: 374 2–6 player long-session / combat / priority / persistence / undo / network stress assertions
- PASS: 20 stale/out-of-order network-state assertions
- PASS: 22 blocker-capacity / menace / forced-block / network-rejection assertions
- PASS: 17 same-controller simultaneous-trigger ordering assertions
- PASS: 16 APNAP trigger-order / eliminated-source / stack-LIFO assertions
- PASS: 23 priority nested-response / eliminated-holder recovery assertions
- PASS: 20 priority compatibility assertions with eliminated-holder recovery
- PASS: 12 live-card-catalog / exact-first / ManaBox-new-card assertions
- PASS: 7 ManaBox TXT/CSV freshness parser assertions
- PASS: 15 profile/preferred-deck/commander/history continuity assertions
- PASS: 23 deck analytics / mana value / persisted-stat assertions
- PASS: 16 loss-state / thresholds / winner / active-player-elimination assertions
- PASS: 13 end-turn guidance / one-shot notification / never-auto-end-turn assertions
- PASS: 13 smart-phase-skip / never-auto-end-turn / accepted-denied guards
- PASS: 22 phase-gate/cleanup/turn-lifecycle assertions
- PASS: 18 activated-ability/tap-cost/haste/loyalty assertions
- PASS: 12 search/tutor/Fabled Passage/Hidden Hideout assertions
- PASS: 18 mana/payment/capacity scenarios
- PASS: 15 combat-engine regression scenarios
- PASS: 11 attack-declaration/target legality assertions
- PASS: release-candidate structural/import/asset/menu-scope audit
- PASS: 34 JavaScript files syntax checked
- PASS: CSS brace validation
- PASS: 12 sealed visual assets byte-identical to V0.7.9.76

## Final manual V1.0 gate
1. Verify landing and game screen against sealed visual master on iPhone Safari.
2. Start 2-player and 6-player games.
3. Open every primary menu; verify Back vs Cancel and button assets.
4. Exercise multi-defender combat, blockers, priority/response, commander cast, search categories/basic lands, concession, automatic winner/draw, Continue Game, Profile, Deck Editor, Game History, and Undo.
5. Verify no iPhone zoom and no distorted card/mana assets.
6. If all pass, stamp this exact build as V1.0 without redesign.
