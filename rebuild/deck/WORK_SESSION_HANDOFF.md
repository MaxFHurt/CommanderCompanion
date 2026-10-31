# Work session handoff

Read this first in a new Claude Code session. It replaces digging through old chats.
Last updated: 31 October 2026. Version 0.9.23 (build 168, on the work branch): decks saved as cc.deckProfile with an IndexedDB copy, the old Deck Companion forwards here, every swap saves and re-works the list, the search measures the strongest cards on every row (ROADMAP). Before: 0.9.21 (build 166; deck power below Budget is a curve that is 0 only for an empty deck; 0.9.20 moved Path to Apex, meter and game plan to Upgrades). Owner (25 Oct): keep the Mid/Budget polish step (the strongest option); UP.tierPolish 1, UP.polishSlot 0.
**Next: the engine redesign** (plan: https://claude.ai/code/artifact/d9cbe86d-e5af-49e5-ad89-e76e8ada72be). Owner, 20 Oct: "all the
engine rework stays here until we're sure we are doing better choices. I still want all the options available that were
available before... I don't want to change our app. Just the way choices are made behind the scenes." Decisions: the rules
reader understands everything a card does before practice games get smarter; Scryfall community tags yes; Forge scripts yes
(kept in tests only, GPL); offline AI reading asked how (plan, Where card knowledge comes from); Apex learned from tournament
and bracket 4-5 decks (both); Budget = $3 per card and an entered total (both).

**Engine v2 progress (branch `engine-v2`, see ROADMAP "Engine redesign"):** Phase 1 rules reader and Phase 2 card functions
done (`engine/rules.js`, `engine/functions.js`, checks `rrcheck.js`, `forgecheck.js`, `fncheck.js`). Phase 3: the new jobs and
the synergy signal sit behind `UP.v2` / `UP.v2r` / `UP.syn`, all off until a mix beats 0.9.3 on all six benchmark numbers
(removal/wipe/counterspell from the reader: tuneall and test up, holdout down, so still off). Entered total budget for
generated Budget decks is built (Generate → Budget → Total budget, "I already own" the commander; `fitBudget`; UI-BUD-01).

## 0. Open questions for the owner (ask these first, numbered)

**Owner's rule (18 Oct): do not push anything without the owner's confirmation.**
**REMINDER (owner, 19 Oct): "We need to stop and talk about why the full suite takes so long to run. Remember this and remind
me when you're done working but don't act on it till I say so."** Raise it at the end of every report; change nothing about the
suite's speed until the owner says so.

1. **Engine redesign decisions (owner, 20 Oct):** offline AI reading is done in work sessions (no API key, no job). The
   rework lives on the branch `engine-v2` (never served to players; `main` stays the live app). Entered budget: owned cards
   are free; when a player builds by commander they are asked whether they own the commander, and an owned commander counts
   as free too, and basic lands are free. Progress bar: tiers are both a price rule and a power level, shown separately.
2. **The Apex rule against players** (benchmark with the search): the players' card is still offered on each row as often
   (row@5 0.247 -> 0.249) but Apex now disagrees with players (agreement@5 0.246 -> -0.121). Owner: "the strongest card is the
   Apex card". 2a. Keep as is. 2b. Review the biggest score finds (Archpriest of Shadows, Evolution Witness, The Soul Stone...):
   the gap suggests the deck score overrates some of them.
3. **Progress bar and budget plan (talked through 19 Oct, not built):** 3a. Tier = price rule, power level, or both shown
   separately? 3b. Marks = the deck with all of a tier's swaps applied, measured together, frozen until settings change?
   3c. Entered budget: owned cards free? Commander included? Basics free?
4. **Speed next steps:** 4a. Keep each card's reading between launches (about 14 s at phone speed now, a little at a time).
   4b. Send the card library to the background core once at launch, in pieces.
5. **iPhone check of 0.9.1-0.9.3** (Safari stays up while generating; the new tier buttons; the chip; Undo per card).
6. **Plans the engine can't see yet** (`misread.js`): 6a fliers, 6b defenders/toughness, 6c goad, 6d untap, 6e opponents'
   cards, 6f keyword counters. Which are worth adding?
7. **Commander engine reasons** (not answered): do the reasons on cards read the owner's commanders correctly?

Versions now count from 0.9; the owner names each next release (0.9.2, 0.10...). Cores: the owner asked for as many as
possible; the app uses up to 5 helpers (`hardwareConcurrency - 1`, capped at 5; see ROADMAP, Build 144).

## 1. What this is

**Deck Companion** is a Magic: The Gathering deck builder for Commander and Standard.
- **Live:** https://maxfhurt.github.io/Deck-Companion/ (GitHub Pages, served from `main`).
- **Repository:** `MaxFHurt/Deck-Companion`. Work branch: `claude/build-140` (still the name; live is Version 0.9.1, build 146).
- **App files (0.9.3: flattened and split):** `index.html` (CSS, boot, build number, script loader), `engine/*.js` (all deck
  logic, 8 files), `ui/*.js` (screens and buttons, 9 files), `work.js` (background worker: builder and helper cores),
  `data.js` and `lists.js` (static data), `files.json` (the script list in load order), `version.json`. The live page loads
  `app.min.js` and the worker `engine.min.js`, both made by `sh tools/build.sh` (owner's choice 2c); `?dev=1` runs the
  readable files. Code is formatted with Prettier (`.prettierrc.json`); `tools/tests/suite/samecode.js` proves a reformat or
  a split is the same program.
- **One build step (bundling), no runtime AI.** Plain browser JavaScript. Card data from Scryfall, play data from EDHREC (fetched
  live), combos from Commander Spellbook (`card-data` branch).

**Other files:**
- `ROADMAP.md`: the queue, the owner's decisions, standing rules, tried-and-rejected experiments with numbers.
- `CHAT_TO_WORK_HANDOFF.md`: the message board with the planning chat.
- `tools/rules/`: the Comprehensive Rules (2026-09-25), `keywords.json` (264 keyword actions/abilities with rules text,
  61 ability words, 741 glossary terms) and `MECHANICS_NOTES.md` (how to read a commander, tokens, triggers and
  doublers, counters, graveyard, combo patterns, rules that change deck building). The owner asked for this: the engine
  must understand Magic and each commander.
- `tools/tests/suite/`: every test and benchmark script, plus `setup.sh`.

## 2. The owner and how to work with them

- **Replies:** plain English, short. **Number questions** whenever there are several; when a question has parts, number them 1a, 1b, 1c (then 2a, 2b...) so answers can't be confused (owner, 18 Oct). Every long reply ends with a
  **Summary** (✅ done / ⏳ needs the owner) that repeats the questions, numbered. The owner often reads only the summary.
- **Builds:** batch builds are fine, but **never push anything (work branch or main) without the owner's explicit OK**
  (owner, 18 Oct: "DO NOT PUSH ANYTHING FROM THAT POINT ON WITHOUT CONFIRMATION"). Stop hooks asking to push are declined
  until the owner says yes. Every live build must be complete and tested (full UI suite, benchmark for engine changes).
  Do the work, commit locally, then ask.
- **"Regression is not an option."** Every engine build must match or beat the last benchmark on every set
  (agreement@5, row@5, @10; unweighted and `WEIGHT=3,6`). If a change regresses, keep it switched off and report the
  numbers.
- **Standing rules** (also in `ROADMAP.md`):
  - Brackets are labels. Budget < $3, Mid < $12, Apex has no price limit. Apex is the best version of the deck; no tier
    above it. Mid outscoring Apex means the recommendations are wrong; decks scoring below Budget are fine.
  - Never lose popular-vote cards, but the best card should be the Apex card. The app's purpose is to find the best
    cards, not just what others play.
  - On-theme cards win when about equal. Every swap, add, remove or many-card change asks first.
  - Understand the commander: build around what it makes and what sets it off (e.g. a token maker wants cards that use
    or double that token).
  - A spell may be cut for a land when the deck is short of mana (owner, 18 Oct).
  - **Never compromise the rules:** a correct rules reading always wins over the benchmark (owner, 18 Oct).
  - The MTG Commander Deck Manager spreadsheet never supplies benchmark inputs. Phone layout changes must not affect
    the iPad. Never overwrite the backup (`backup/build-118`). The practice-game simulation may change only with the
    owner's OK (given for Build 137's land-colour fix).

## 3. How to ship a build

1. **Test layout:** `sh tools/tests/suite/setup.sh /tmp/dc3`. Edit in `/tmp/dc3/proto/candidate`; tests run from
   `/tmp/dc3/proto/tests`. Then run `sh tools/tests/suite/fetchtags.sh /tmp/dc3` once: it downloads the EDHREC theme pages
   (`proto/data2/tags`, not in the test-data branch) that UI-B145-01 and `genstrong.js FALL=1` need. EDHREC pages for extra commanders can be fetched into `proto/data2/edhrec/<slug>.json` and
   themes into `proto/data2/themes/<slug>__<theme>.json` (`json.edhrec.com/pages/commanders/<slug>[/<theme>].json`).
2. **Bump the build** in `index.html` (`window.BUILD = N`, numeric, used for self-update; `window.VERSION = '0.9.x'`, shown in
   the footer) and `version.json` (`{"build": N, "version": "0.9.x"}`). The owner names the version. Then **`sh tools/build.sh`**
   after every script change (the bundles carry the build number and a fingerprint of their sources; Q-BUNDLE/UI-BUNDLE fail
   on a stale bundle). esbuild comes from `npx` (or set `ESBUILD=<path>`).
3. **Test:**
   - **One command (testing 3c):** `sh check.sh <kinds> quick|live` (kinds: screens, upgrade, cards, generator, sim, all) runs
     exactly the rows of the table below, one at a time, rebuilds the bundles first and prints one summary line per check.
   - While working, after each change: the quick check `PW=/opt/node22/lib/node_modules/playwright node ui-quick.mjs 8765 q`
     (about 25 s, 12 checks). The full UI suite runs once per live build, never alongside the benchmark (owner, 18 Oct).
   - **UI suite side by side (owner's speedup, 20 Oct):** `PW=... node ui-par.mjs 8765 bN 3` runs the 118 tests as 3 groups in
     parallel browsers: 5.6 min (one line: 9.5 min); `FAST=1` skips 7 heavy independent tests (4.9 min). Every test is wrapped
     `if (RUN('<id>')) { try { ... } catch ... }`; a new test must be written the same way. Groups: `ui-test.groups.json`
     (tests that share variables run together); times for balancing: `ui-times.json`; UI-ID-01 and UI-AIM-01 make the decks
     the others use and run in every group. In a group each test starts from a reset screen (Wakanda on Upgrades, card data
     re-injected after a reload). Kept apart: UI-PLAN-02 and UI-B81-02 (open finding in ROADMAP). Four groups is no faster
     on this 4-core machine.
   - UI suite in one line: `(cd ../candidate && setsid nohup python3 -m http.server 8765 >/dev/null 2>&1 &)` then
     `PW=/opt/node22/lib/node_modules/playwright node ui-test.mjs 8765 bN`. Must pass every test (118 at Version 0.9.3), side by side or in one line. If it
     prints `ERR_CONNECTION_REFUSED`, restart the server (don't rely on `pgrep -f`, it can match its own shell).
   - Benchmark (engine changes), all six must not drop:
     `SCORECHECK=1 ALSOW=3,6 node bench.js ../candidate x tuneall|test|holdout --quiet` gives the plain and the weighted numbers
     from one run (testing 3a; `WEIGHT=3,6` alone still works). `POOL=1` adds the whole-card search and its picks (slow:
     about 15-20 min a set).
     **Always set `SCORECHECK=1`**, otherwise the Apex pick rule is skipped and the numbers are wrong.
   - Add one UI test per build, inserted before the iPad reload test near the end of `ui-test.mjs`.
   - **Run only what the change can affect; always run its regression check (owner, 18 Oct).**

     | What changed | While working | Before going live (regression) |
     |---|---|---|
     | Screens only (ui.js, CSS in index.html) | quick check | full UI suite |
     | Upgrade or score logic (scoreCheck, evaluateDeck, upgradePaths, UP settings) | quick check; benchmark tuneall only | benchmark, all six; scheck, claims, cisweep, edge |
     | Card reading (tags, roles, keywords, isFinisher) | semantics | benchmark, all six; semantics, claims, accept |
     | Deck generator (buildPlan, fillDeck, manaBase) | quick check (it generates a deck) | accept (both), genstrong, tourney |
     | Practice games (simulate, lands) | quick check | benchmark, all six; full UI suite (practice panel tests) |
     | Screens and engine together | quick check | everything both rows list |
     | Docs, roadmap, test tools only | nothing | nothing |

     Economies: screen an experiment on tuneall first and run test and holdout only for versions that pass it; never run the
     benchmark and the UI suite at the same time (each slows the other); fix every failure found before re-running the full
     suite, so it runs once more, not once per fix.
4. **Ship:** after the owner's OK, copy `engine/ ui/ work.js index.html version.json files.json app.min.js engine.min.js` and
   the changed test tools into the repo (or edit the repo and copy into the test layout), update `ROADMAP.md` and this file, commit with the session's attribution lines, then
   `git push origin <work branch>` and `git push origin HEAD:main` (fast-forward). Poll
   `https://maxfhurt.github.io/Deck-Companion/version.json` until it shows N, then load the live page in Playwright and
   check `window.BUILD` and zero page errors.
5. **Gotchas:** a `// comment` at the end of a one-line function comments out the rest of the line (syntax-check with
   `node -e "new (require('vm').Script)(require('fs').readFileSync('engine/upgrades.js','utf8'))"`); Prettier's layout makes
   this rare now. Old one-off scripts are in `tools/tests/suite/archive/` (copy one back next to `h.js` to run it). The remote was renamed to
   `Deck-Companion`; if git says "unpushed commits", refresh the tracking ref
   (`git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*' && git fetch origin`).

## 4. Benchmark baseline (Version 0.9.2, build 147, SCORECHECK=1)

| Set | agreement@5 | @10 | weighted @5 / @10 |
|---|---|---|---|
| tuneall | 0.248 | 0.130 | 0.279 / 0.158 |
| test | 0.298 | 0.191 | 0.317 / 0.210 |
| holdout | 0.300 | 0.211 | 0.326 / 0.245 |

Other checks at 0.9.2: accept 39 (both modes), semantics 51, claims 20 unrecognised, cisweep 0, edge clean, scheck bad 1
(Doom HYDRA, known). No-play-data commanders: typicality 0.184 -> 0.293 (genstrong FALL=1 NOEDH=1). Score blind spots 9 -> 5
of 472 (`blind.js`). Generator: tourney MID2 (a real Mid build) 39% match.

Helper tools: `misread.js` (cards players pick for a commander that the app says fit no plan: likely misreads), `guidecheck.js` (9 published guides, check only), `unpopcount.js`, `rowfeat.js` (per-row evidence),
`fullsearch.js` (scores every legal same-job card per slot), `wcheck.js` (weighted yardstick validity).

## 5. Engine map (where things live)

Since 0.9.3 the functions below live in `engine/<part>.js` and `ui/<part>.js` (README lists what each part holds); find one
with `grep -n "function name" engine/*.js ui/*.js`. Names written as "engine.js" / "ui.js" below mean those folders.
- **Best card is Apex (0.9.3):** after the whole-card search, `poolPromote(Q, d)` (engine/upgrades.js) makes each row's Apex the
  highest-scoring card measured (search finds in `L.finds` via `poolKeep`, and the check's own `L.top`), Budget and Mid the best
  of the rest under $3 / $12; the pick it replaces goes into `L.alts.apex` as a Popular pick (`most`), and an on-theme card
  within 10% (`RANK_THEME`) as the On theme alternative (`onTheme`). Holds are released for replaced picks (`poolFree`, ui) and
  picks are held only after the search (watchAlerts waits for `R.poolDone`).

- **Upgrade list:** `upgradePaths(d)` picks rows; `scoreCheck(d, R, o)` confirms every swap with `swapScore`, ranks,
  builds alternatives (`L.alts`, Unpopular pick only for a big gap: `UP.unpopX/G/S/R`), `L.top`, spare-land rows, and at
  the end leaves out swaps players mostly disagree with (`R.trimOf`, `UP.trim/trimPa/trimCi`, precon cards only).
  Settings: the `UP` object.
- **Deck score:** `evaluateDeck(d, {games, apex, sim})`: synergy, balance, quality, routes, mana. Returns `exact` and
  `cmp` (past-the-maximum compare value, used only when `UP.unc` > 0; `cmpOf(e)`). Synergy maxes at raw 0.72
  (`EV_SUFF`), balance at 1, quality at the Apex reference.
- **Practice games:** `simulate(d, games, seed)`; `practiceGames` is a step-by-step copy for the Practice panel (a test
  checks they agree). Lands: `fetchReach`/`simLandCols` (`UP.lfix`): fetch lands make only what they can find;
  "choose a colour" lands make their colour plus the needed one.
- **Mana fixes:** `fixList`/`openFixSoon` (ui.js). Lands use `landRank` (shared with the card window): lands that keep
  every colour (`landCovers`) plus, when `manaStarved` (out of lands by turn 5 in `UP.starve` 8%+ of games or under
  target), weak spells; measured with `freshDelta` (fresh practice games, remembered).
- **Rules knowledge:** `KW_THEMES`/`KW_RE` (keywords → themes, `UP.kw`), `commanderEngine(cmds)` (token kinds, creature
  tokens and type, counters, fills graveyard, sacrifices, triggers), `engineFit(c, E)` (doubler 1 / payoff 0.8 / enabler
  0.6, with a reason). Shown on cards via `baseScore` reasons; scoring weight `UP.kwB`/`UP.kwS` = 0 (didn't pass yet).
- **Build 140 settings (on):** `UP.unc` 0.25 + `uncTail` (synergy ceiling; rows whose gain is only past the maximum go last),
  `UP.reF` (reanimation engines, `isReanimEngine`), `UP.bs` (`finByText`: size-only finishers count `bsF` 0.5, cards costing
  `bsP` 9+ aren't protection, planeswalker ultimates aren't jobs), `UP.altCut` 2 (alternatives may match the card going out;
  `x.oc` keeps them out of the pick choice), `UP.rcap` 2 (generator ramp cap, in `buildPlan` after the mana base), `UP.pool2`
  (`poolQueue`/`poolStep` in engine.js, `poolRun` in ui.js; `UP.poolN` 250 per row).
- **Experiments left switched off:** `UP.uncR`, `UP.uncPick`, `UP.kwB`/`kwS` (engine fit in score), `UP.stN`
  (Commander-wide staples per slot), `UP.rs3`, `UP.aw/aiw/amb` (plan weighting). Numbers in `ROADMAP.md`.
- **Generator:** `buildPlan(d, seeds, ownOnly, ownAll)`; `genDeck(nd, seeds, ownOnly, ownAll, fill)` builds a new deck from its
  plan at a price level (engine.js, shared by the page and the background worker `work.js`). In ui.js: `genRun` sends the job
  to the worker (`wkGet`, `wkState` sends only what changed, `wkSend`), falling back to `genDeck` on the page; `genPrefetch`
  designs the reference build while Generate is open; `wkWarm` reads every card in the worker when the card data arrives.
  `startPlan`, `regenBuild`, `regenPlan` and `seedBuild` are async; `planDeck` sets up the new deck without opening it.
- **Cores (Build 144):** `scoreCheckG` and the generators above it hand out batches (`measureBatch`, `runSync` on the page);
  work.js role=help holds a slice of the cards (`batchCards`, `packFor`), spot-checked (`spread`); `wkCores` (up to 5),
  `wkRestart`; built ahead: `genPrefetch` -> `WK.spec`, `genKey`, `genCancel`.
- **No play data (Version 0.9):** `fallTags`, `parseTag`, `TAG_OF`, `COLOR_PAGE`, `tribeSlug` (engine), `addFall` (ui.js);
  `ctx.fall` in `baseScore` (UP.fbW); `detectStrategy(cmd, d, thin)` (UP.ctok, UP.cbec).
- **Players' choice:** `pcOk` in `scoreCheck` (UP.plc/plcS/plcG/plcD); `pcChip` in ui.js.
- **UI:** `viewDecks`, `upPanel` (Upgrades + Build stats, `practiceHtml`), `wantHtml` (card window), `openFix`,
  `openShare`/`checkShareLink` (share links decode with base64url + raw deflate; `shareRead`).

## 6. Where things stand

- **Live: Version 0.9.1 (build 146).** What 143-146 added (details and numbers in `ROADMAP.md`):
  - 143: decks are built on a background core (`work.js`), so the page stays responsive; Players' choice alternatives
    (cards real players add); score blind-spot fixes (cost reducers count as ramp, tokens support their type); about 25%
    faster through memoisation.
  - 144: helper cores (up to 5) and the next deck built ahead while Generate is open (Captain America Budget 6.5 s -> 1.0 s).
  - 0.9 (145): commanders without EDHREC play data use EDHREC theme pages for their tribe and colours.
  - 0.9.1 (146): Undo next to Save deck; "Previous" / "Next" buttons in the card window; decklist grouped by colour; the
    background search no longer stops at 2%; no card suggested on two rows; the whole-card search runs on the cores and the
    Upgrades list appears once, complete (10-19 s -> 4-7 s on a desktop).
- **Timings (desktop):** a deck generates in 1.5-9 s (worst case Budget with many owned cards); the complete Upgrades list
  takes 4-7 s. The owner said these times are fine.
- **Still worth a look (whole-pool finds, 18 Oct):** The Seriema (Wakanda), Gravebreaker Lamia (Turtles, counted as a tutor),
  Quilled Greatwurm (Turtles, a 2-finisher deck).
- **Owner's test deck:** Symbiote Spider-Man (generated), Budget tier, Marvel/Spider-Man sets only, themes reanimator,
  self-mill, graveyard. Share link in the chat of 18 Oct. Its EDHREC page and three theme pages are in the test data folder
  (`proto/data2/edhrec`, `proto/data2/themes`) of this session only; `gensym.js` generates a deck for any commander and shows
  ramp, reanimation engines and fast mana.
- **0.9.2 (147, live):** Fix: Mana fills in land by land (`openFix` step loop, `manaPick`, `fixDraw`); counters theme reads
  kept/moved counters (The Ozolith); token, damage and power doublers read (THEMES in engine.js).
- **Known limits:** Fix: Mana takes ~2.5 s on desktop (first swap ~1 s); Node test runs must go one at a time (running them in
  parallel crashed, cause not traced); local test servers die now and then: restart them.

## 7. Prompt for a new Claude Code session

> You're continuing work on Deck Companion (repo MaxFHurt/Deck-Companion, live at maxfhurt.github.io/Deck-Companion).
> Read `WORK_SESSION_HANDOFF.md` (start with section 0, the open questions), then `ROADMAP.md`, `tools/rules/MECHANICS_NOTES.md`
> and `CHAT_TO_WORK_HANDOFF.md`. Follow the owner's rules exactly: plain English, numbered questions, a Summary at the end of
> every reply, questions numbered 1a/1b/1c, complete and tested builds, no engine change that regresses any benchmark number,
> and never push anything without the owner's explicit OK. Set up tests with `sh tools/tests/suite/setup.sh /tmp/dc3` and
> `sh tools/tests/suite/fetchtags.sh /tmp/dc3`. Live is Version 0.9.2 (build 147); 0.9.3 (build 148) is committed and waits for the owner's OK to push. Ask the owner the open questions in
> section 0 first.
