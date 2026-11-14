# Where things are (read this instead of skimming)

Line numbers drift; grep the function name (`grep -n "^function name" file`), then `sed -n a,bp` only what you need.

## Docs (logs: read one section, never the whole file)
| Need | Where |
|---|---|
| Owner's rules | HANDOFF.md §2 |
| Live build line | HANDOFF.md line 11; PROGRESS.md "Live build" |
| Architecture (game) | HANDOFF.md §3 |
| Open work | ROADMAP.md (sections 1-8; 7e-7f = latest owner reports) |
| Game test list | HANDOFF.md §6 |
| Deck Builder tests | deck/tools/tests/suite/README.md, check.sh |
| Which suites a batch needs (and runs them) | tools/suites.sh [base] plan\|run |
| Release steps | `.claude/skills/release/SKILL.md` |

## Deck Builder (`deck/`; sources in engine/ and ui/, bundled by `sh deck/tools/build.sh` into app.min.js / engine.min.js)
| Topic | File · function |
|---|---|
| Deck score (synergy, balance, quality, routes, mana) | engine/score.js · evaluateDeck (EV_W weights; `opt.str` = strength version) |
| Reference Apex/Mid/Budget builds (engine) | engine/score.js · apexRef, refScores; ui/upgrades.js · apexFor |
| Score shown on the page | ui/upgrades.js · evalFor |
| Card strength, power, strength builds | engine/strength.js · strengthRef, strBuild, strPicks, strengthPower, strengthPaths, strFinish (branch team/apex2) |
| Strength settings | engine/upgrades.js `UP = {…}` (str*, lfix …) |
| Practice games (mana part) | engine/practice.js · simulate (screw = <4 lands on turn 5) |
| Generator | engine/generator.js · buildPlan, genDeck, manaPlan (KARSTEN pips), validateDeck; ui/storage.js · genRun, genPrefetch |
| Generate button | ui/events.js case 'gen-go' → ui/upgrades.js · startPlan |
| Upgrade list | engine/upgrades.js · upgradePaths, tierPick; ui/library.js · recsFor; page: ui/deck.js (PV rows, sheets) |
| Upgrades tab number | ui/views.js · upCardCount |
| Fix menus / land rule | engine/mana.js · fixSwaps, landCovers; engine/upgrades.js · landColors |
| Card reading (roles, tags) | engine/reading.js, engine/library.js · analyze, tags |
| Decklist rows, names, pictures | ui/views.js · listRows, printedName; ui/base.js · shownPrint, pidOf, artFor, ensureTheme |
| Page redraw | ui/cards.js · render |
| EDHREC data (one shared slot `EDH`) | ui/base.js · loadEdh, loadThemes, ensureEdh |
| Downloads (cards, prices, strength) | ui/storage.js · loadStrength, loadStrengthCmd, loadPrices |
| UI tests | deck/tools/tests/suite/ui-test.mjs (`if (RUN('UI-…'))` blocks), ui-test.groups.json |

## Game app (`src/`; another chat works the rules long tail)
| Topic | Where |
|---|---|
| Rules text compiler | src/engine/effects.js · compileEffectText; effects-catalog.js, effects-b49.js |
| Triggers | src/engine/triggers.js, triggers-catalog.js, trigger-subject.js |
| Game flow, ops, legality | src/game/flow.js, ops.js, legal.js, casting.js |
| Terms key (automation labels) | src/data/mechanics.js |
| Rules audit | tools/rules-audit.mjs <scryfall.json> |
| Practice-match bot | src/game/bot.js, practice-match.js |
| Node tests | tests/node/*.mjs |

## Scratch scripts (live-data measurements, not in the repo)
/home/user/dc-test/live/*.mjs: tourney-live (tournament match), score (old/new score), manaparts (practice-game mana), apex (power/rows),
tabcount. They serve a checkout with `python3 -m http.server <port>` from `rebuild/` and open `/deck/index.html`.

## Rules long tail (game engine; build 103: 22,630 of 32,300 cards automatic)
| Topic | Where |
|---|---|
| Status, batch log, sent-back list (94 by hand, start batch 3 with them) | PROGRESS.md "Where it stands", "Long tail, batch 2" / "Build 101" entries |
| Batch 1-2 wordings | src/engine/effects-b101.js · compileB101Clause, compileB101Sequence (hooked in effects-catalog.js after b49), applyB101, gatherB101 |
| Batch 4 wordings (build 110) | src/engine/effects-b110.js · compileB110Clause / compileB110Sequence / applyB110 / gatherB110 / parseConditionB110 (hooked in effects-catalog.js after b101; conditions in effects.js). Target descriptors (colours, non-X, tapped, without flying, limits set by the source's power): src/game/requirements.js descriptorFits / sourceLimitFits; untap locks and "for as long as … remains tapped": game/flow.js noUntapHolds, engine/combat.js pruneWhileTapped |
| Review fixes (batch 4 parts 6-8 and after) | Limits by graveyard/colours/X/counters removed: engine/effects.js limitOf, unenforceableLimit; game/requirements.js sourceLimitFits (source card filled in by gatherRequirements). Any player may activate: game/legal.js activationRules / abilityRows (foreign), game/ops.js runActivate (anyPlayer), engine/transactions.js payAbilityCosts, game/view.js. Gerrard (fromBattlefieldTurn in moveCard), colour-choice protection (b110-pick-color) in effects-b110.js |
| Batch 4 review additions (conditions, land types, colours) | Conditions for "If <condition>, X deals N damage": effects-b110.js parseConditionB110 / conditionHoldsB110 (monarch, counters put, left graveyard, event mana value/damage, Desert, snow …); tallies: triggers.js tallyTurn (countersPut, nonHandPlays), game.leftGraveyard; intervening if checked when a trigger goes on the stack: effects.js interveningIfFails, ops.js. Land types (CR 305.7): engine/overlay.js applyLandType (temporary effect kind 'land-type'), effects-b110.js b110-land-type, transactions.js resyncManaSource, game/attachments.js (Urborg-style statics, Auras). Colour changes b110-recolor; excess damage: damage effect excessTo; domain: combat.js selfScalingPt, casting.js countPhrase; Pay N life or {M}: rules.js costChoice, ops.js |
| Amounts in card text | src/engine/amounts-b101.js |
| "where X is …", pronouns, "it" after a token | src/engine/effects.js · b101-per-player, COMPILE_DEPTH, __lastMade |
| Per-turn tallies | src/engine/triggers.js · tallyTurn |
| Forced/extra blocks, skipped turns | src/engine/rules.js; src/engine/phase.js |
| Batch tests | end of tests/node/catalog.mjs (447 checks) |
| Batch tools | tools/longtail/ (README): prep.mjs, audit.sh (8-15 min), cl.sh (group failures), sub.sh (named cards), p.mjs (one sentence), review.mjs / cardfx.mjs (newly passing cards) |

Rules: batches of 500, check in with the owner after each. Compare each audit with the previous one both ways and read every newly
passing card's compiled effects before counting it. Misread cards go back to by hand and must then be fixed. Don't run Playwright
alongside an audit (online_ui times out).
