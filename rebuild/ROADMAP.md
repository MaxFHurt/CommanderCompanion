# Commander Companion — the whole roadmap

Every change still open across the app, in one place (written 2 Nov 2026, updated 7 Nov: live build 1.0.0-rebuild.66, Deck
Builder 0.9.40 build 185). Each section lists its items in the suggested order. Details and history stay in the documents named at the end
of each item; this file is the list. Update it when an item is done (move it to "Done" at the bottom with its build).

**Owner's rules for all of it** (full list in HANDOFF.md section 2):
- Work in batches; stop every 100 newly automated cards to check in.
- Live pushes need every suite to pass (node catalog, game, mechanics, smoke, tracker, forge-triggers; `soak.mjs 40` three
  times with 0 problems; every Playwright suite; the Deck Builder suite). Builds 53–64 went out with the owner's
  minimum-testing waiver: the full runs are owed (section 1).
- Release steps: bump `src/version.js`, `node tools/stamp.mjs`, bump the `sw.js` cache, HANDOFF live line, PROGRESS.md entry,
  push the branch, fast-forward `main`. `git fetch` and check `origin/main` first; never undo another session's work.
- Every choice a card gives a player is asked of that player.
- Nothing from the corrections report is fixed without the owner's approval.
- iOS work is on hold.

**Round of 7 Nov (owner: "fix everything except the 10k rulings left"), builds 68–72 — done:** every suite run and green
(Gisa and tracker tests fixed, seven Deck Builder tests updated, one real badge bug); Moraug, Kardur, copied-land mana, Dredge
for every drawing player, Echo/Cumulative upkeep action costs; the player toolbox (with the Worker deployed); hosted games
move between devices; owned and built-in precon printings; the card-data job merged with its schedule fixed; the reader
comparison over every card, the engine's reading filling the Deck Builder's gaps (64 cards, benchmark unchanged) and card
interactions in the card window; the stylesheet cleanup (pixel-identical); nine mechanics' glossary labels corrected.
**Still open:** the items below not marked done — chiefly the long tail and the card-by-card handoff (set aside by the owner),
the mechanics the glossary still marks manual (113, most rare: Connive and Forage are the common ones; Connive needs its
discard asked after the draw), practice games with bots (5.3), online-game privacy (4.2), and the owner's questions/approvals.

**Round of 7 Nov, part 2 (owner: "do them all"), build 75 — done:** Modular moves its counters when it dies (the
controller is asked, onto a target artifact creature); Companion (a deck's companion sits outside the game, {3}: put it in
hand as a special action, once; imported from a "Companion" section and set in the Deck Builder); voting (Will of the council,
Council's dilemma: every player asked in turn order); Suspect, Devour, Sunburst and Awaken. **Rare old mechanics** (banding,
haunt, cipher, assist, forecast, attractions) stay by hand: each needs its own rules work for a handful of cards.
**Online-game privacy, feasibility (step 0):** the rules engine bundles to 819 KB (228 KB compressed), under the Worker size
limit. One action plus every player's view takes 7 ms (median) on this machine, 14 ms at p90, 24 ms at p99. The free plan's
10 ms CPU per request is exceeded by about 28% of actions, so the Worker would need the paid plan ($5/month, 30 s CPU). A
4-player game is about 170 KB of state, which the existing SQLite Durable Object can hold. Owner's decision before building.

---

## 1. Check first after the reset (owed from the minimum-testing week)

1. **(Done, build 68.)** **Run every suite once on the live build** (the full list above, plus `offline_ui.py`, `pair_ui.py`, and the Deck Builder
   suite: `sh tools/tests/suite/setup.sh <dir>` then `sh check.sh all live` from `<dir>/proto/tests`). Fix anything red before
   new work. Builds 53–64 ran only: node game/mechanics/smoke/catalog, `online_ui.py` (40), `game_ui.py`, the Deck Builder
   quick check, and the Deck Builder tests named in each build's log.
2. **(Done, build 68.)** **Deck Builder test UI-B145-01** (Gisa, no play data): fails with no theme pages loaded on build 171 and later; probably the
   `test-data` branch lacks the Zombie theme page. Add the page or fix the test.
3. **(Done, build 68.)** **`tracker_test.py` "no console errors"** fails only when the test machine has internet (Scryfall answers 404 for the
   test's made-up card). Make the test ignore that 404, so it passes either way.
4. **Real-device checks (owner's phone and iPad):**
   - Deck Builder on iPad: safe area (portrait, landscape, home-screen app), the one-line Upgrades page, Show all details,
     health badges (GC and green +; the Mana and Win routes + were not seen on screen), the Back button and swipe back, the
     card window leading with the row's swap (from a row and from the chosen Sheets tile).
   - Precon printings: load the Hatsune Miku precon (and reopen a Miku deck loaded before build 65): reskins should show
     their Miku art and names.
   - Card data: a fresh Deck Builder load should fill from the daily file in seconds (no "Downloading cards from Scryfall").
   - Profile sync between two linked devices: newer profile taken on open, "Continue your game?", Deck Builder edits sent
     when a deck is closed or the app is put away, the "saved from another device" choice.
   - QR pairing over a phone or iPad hotspot without internet; offline use after the first launch.
   - Hosted rooms between separate devices (games, Judge mode, Table Tracker); Card ID camera scan.
   - iPhone content inside the frame (builds 41–42); iPad home-screen black strip after re-adding the icon (iPadOS 26 WebKit
     bug 301108); whether Personal Hotspot works with no cell signal and Safari's local (mDNS) candidates over it.

## 2. Game rules engine (cards in play)

1. **The card long tail:** 21,001 of 31,770 Commander-legal cards run by themselves (top 1,000: all). About 10,770 still need
   something done by hand. Work most-played first, in batches of wordings (each covers a few dozen cards); Forge's scripts are
   the answer key. Tools: `tools/rules-audit.mjs`, the Scryfall bulk file split into 4 chunks. (RULES_AUDIT.md, PROGRESS.md)
2. **Mechanics still resolved by hand:** suspend, spectacle, fuse/split, splice (other than onto Arcane), cipher,
   attractions/stickers, banding, haunt, assist, forecast, flip cards, Rooms, Class levels, and anything the terms
   key marks "manual" or "partial".
3. **Known rule limits (Moraug, Kardur, copied lands, Dredge, Echo/Cumulative upkeep action costs: done, build 68; Cumulative
   upkeep and Echo costs that need a choice, such as "Sacrifice a creature", stay by hand):**
   - Moraug: the extra combat comes after the second main phase, not straight after the phase it triggered in.
   - Kardur: goads only the creatures it sees as it enters.
   - A land that becomes a copy (Thespian's Stage …) keeps the mana it made before.
   - Dredge is not offered for draws another player's effect gives ("target player draws").
   - Cumulative upkeep and Echo are automatic only for mana costs and "Pay N life".
   - Cached card definitions from before build 28 keep the old mana cost for split/adventure cards until re-validated.
4. **Measure which cards real decks resolve by hand most** (from played games) and automate those first.

5. **The card-by-card handoff (owner, 7 Nov; set aside for now: "except the card data work"):** a zip of machine-assisted
   requirements for all 39,287 cards (42,678 faces, 67,471 ability clauses, 151,838 acceptance contracts, 25,900 audit
   warnings, 13,923 unverified rule lines), with ledgers (CARD-INDEX, CONFIRMATION, ABILITY, WARNING-CONFIRMATION,
   INTERPRETATION-CHECKS) and CARD-BY-CARD.jsonl. Its request: confirm each card against current Oracle text and rulings,
   reproduce, implement confirmed gaps, record real test results; start with Commander-legal flagged and unverified cards;
   document false positives. It is a requirements draft, not proven bugs. The owner also points to TCGplayer's card rulings
   as a source. The zip is not in the repository (25 MB); ask the owner for it again (Commander-Companion-Claude-Full-Card-
   by-Card-Handoff.zip; extract CLAUDE-CARD-HANDOFF.tar.xz and read 00-START-HERE-CLAUDE.md).

## 3. Player toolbox (done, build 69) (the next card-decisions feature)

When a card is resolved by hand, the player gets a toolbox of steps (move a card, tap, counters, life, draw, token …),
suggested tools first, "that card" carried from step to step, applied as one change; a remembered ruling replays its steps.
1. Apply the engine side: `git apply wip/toolbox-engine.patch` (repo root). It passed the node suites when written.
2. Build the screens: `panels.js` openGuided around the toolbox (staged steps, suggested tools first, "that card" chaining,
   one-device "everyone agrees" confirm, remembered outcomes); a toolbox in Host tools → Edit game; the ruling pop-up sending
   `moves`; a Playwright suite.
3. Deploy the Worker (`sh cloud/deploy.sh`): the live Worker does not keep `moves` yet.
(PROGRESS.md "Paused: not finished" 1)

## 4. Multiplayer and sync

1. **(Done, build 70.)** **Hosted games between devices** (owner, 2 Nov: later): moving an in-person hosted game (room code or QR pairing) to
   another device means handing over the host role mid-game: the old host stops (or becomes a player), the new one reopens
   the room with the same code, every connected device follows. Single-device games already travel with the profile
   (build 53); online "play over time" games live on the Worker and their list travels with the profile.
2. **Online games privacy:** each device holds the whole game (it runs the rules), so someone using developer tools could
   read other hands. Fine between friends; a fix would need the Worker to hold hidden information. Feasibility checked
   7 Nov (top of this file): it fits, but needs the paid Workers plan for CPU time.
3. **Native iOS wrapper with Multipeer Connectivity** (true Bluetooth): on hold (owner, 1 Nov). Needs an Apple Developer
   account and a Mac.

## 4b. Card data job

1. **(Done 7 Nov; schedule moved to minute 17.)** **Merge the card-data job change into Deck-Companion `main`** (branch `claude/card-effects-fixes-rcosbu`, commit 3a9d2c0):
   the daily `cards.json.gz` then also keeps battles' defense, reprint and printed (flavor) names. The app works without it.
2. The job runs at 4 a.m. New York time; the snapshot of 6 Nov was taken at 16:32 UTC (a manual or push run). Check the
   scheduled runs in Deck-Companion's Actions.

## 5. Deck Builder × game engine (owner, 2 Nov: add all three)

0. **First: compare the two readers properly.** Quick pass done 7 Nov (top 1,000, instants and sorceries only, a rough
   effect-to-role mapping): the game engine compiles 148 of the 229 spells (65%); where both readers see one of ramp, draw,
   removal or wipes they mostly agree (removal 31, wipes 12, draw 14, ramp 5). Most disagreements came from the rough mapping
   (rituals, Nature's Lore and cantrips count as ramp/draw in the Deck Builder; counterspells are its "Interaction", not
   removal). Real Deck Builder misreads found: Demonic Consultation tagged as a board wipe, Curse of the Swine as single
   removal. So basic spell roles are mostly right already; the gain from item 1 is in permanents, triggers, counters and
   cards the Deck Builder reads as nothing. Next: a proper effect-to-role mapping, then the same comparison over every card
   (permanents included), listing each disagreement. Script: scratch `cmp.mjs` (loads `deck/engine.min.js` in Node with
   `buildIndex`, compiles Oracle text with `src/engine/effects.js` compileEffectText).
Today the Deck Builder has its own simple card reader (`deck/engine/reading.js`), solo mana-only practice games
(`deck/engine/practice.js`) and a score (`deck/engine/score.js`); none of the game's rules work reaches it.
1. **(First step done, build 70: lists.js ENGINE_ROLES fills cards the reader gives no role; next, use more of it once
   benchmarked.)** **Use the game engine's card reading in the Deck Builder:** feed it the game side's compiled effects for every card the
   rules engine understands, for better roles (ramp, draw, removal, wipes, protection, finishers) and theme tags. Biggest gain
   for the effort. Measure with the Deck Builder benchmark (`bench.js`, must not drop) before shipping.
2. **(Done for display, build 71: "Works with" in the card window; scoring them is a benchmark question.)** **Card interactions from triggers:** pairs where one card's effects set off another's triggers (sacrifice outlets with
   death triggers, token makers with "whenever a creature enters", spells with cast triggers…) count as synergy, and the card
   window says which cards it works with. Builds on 1.
3. **Real practice games:** full games with the game engine and bots (as `soak.mjs` does) to measure how a deck performs,
   beyond mana and curve. Most accurate; slow in a browser, so run in the background helpers and keep the goldfish numbers
   as the fast first answer. Builds on 1.

## 6. Deck Builder

1. **Smarter deck score** (large, discuss first): close the gap to top tournament lists at Apex (about half our cards match;
   we miss fetch lands, original duals, fast mana, free interaction, tutors and win cards; we include protection equipment,
   slow rocks, wipes and big creatures they never play). Must be measured against the upgrade benchmark and the tournament
   comparison before and after. (deck/ROADMAP.md "Queue", Large 3)
2. **Open questions for the owner** (deck/WORK_SESSION_HANDOFF.md section 0):
   - The Apex rule against players: keep, or review the biggest score finds (Archpriest of Shadows, Evolution Witness,
     The Soul Stone…) in case the score overrates them.
   - Progress bar and budget plan: marks as the deck with a tier's swaps applied, frozen until settings change?
   - Speed: keep each card's reading between launches; send the card library to the background core once at launch.
   - Plans the engine can't see yet: fliers, defenders/toughness, goad, untap, opponents' cards, keyword counters — which
     to add (section 5.1 may cover several).
   - Do the reasons on cards read the owner's commanders correctly?
   - Should alternatives be matched to the card going out rather than to the pick? (guide blind spots: Sheoldred and Yawgmoth
     for Doom, Swords to Plowshares for Turtle Power, Brightglass Gearhulk for Wakanda)
   - EDHREC land count: the app uses its own land formula; the tests use EDHREC's average (a land apart). Align them?
3. **Printings (build 67 system), still open:** owned cards (the library keeps names only, so "the printing I own" cannot
   win yet: store set + number when cards are added to the library, then make it rule 2b); built-in precons (lists.js) get
   their printings only through the by-name EDHREC lookup on opening (store set + number in lists.js instead); generated
   decks and upgrade swaps use the commander's set or the default printing by design.
4. **Upgrades page polish (from this week):**
   - The card window's lead swap shows no reason line; add "The swap this upgrade suggests" when opened from a row.
   - Path to Apex inside Show all details repeats the health list below it; fold the two together.
   - The green + is decided from card tags; check its picks against the Fix menus (which measure each swap) and use the same
     rule if they disagree.
5. **Known limits:** checking upgrades takes about 1 s more per deck (2–3 s on a phone); opening a card for a full deck takes
   about half a second; deck history records only changes made through the app's buttons.
6. **Suite speed:** the full UI suite is about 435 s on 3 browsers; a real cut needs less work per test (fewer practice games
   in tests, a smaller card library for screen-only tests).

## 7. Look and layout

1. **(Done, build 72: the last unused rules removed; the override sections had already been folded; pixel-identical.)** **Stylesheet cleanup:** fold `styles/app.css` override sections 16–32 into their base rules, checked pixel-for-pixel with
   `tests/style_diff.py` (and the Deck Builder's `cc-theme.css` appended sections into its base rules).
2. Anything the real-device checks in section 1.4 turn up.

## 8. Needs the owner's approval before any work

- **The corrections report** (rule corrections players send in, read with the dev PIN): nothing from it is fixed without the
  owner's say.
- Deck Builder "discuss first" items (section 6.1 and 6.2).

---

## Done (recent, newest first)

- Build 72: stylesheet cleanup; glossary labels for nine automatic mechanics.
- Build 71: card interactions in the card window.
- Build 70: hosted games move between devices; engine roles fill the Deck Builder's gaps.
- Build 69: the player toolbox.
- Build 68: every suite green; Moraug, Kardur, copied lands, Dredge, action upkeep costs; owned and built-in printings.

- Build 67: one printing system for every card (choice, source printing, printed name, commander's set, default).

- Build 66: the Deck Builder's cards come from the daily card-data file, not Scryfall's paged search (fallback only).
- Build 65: precons load in their exact printings (Hatsune Miku reskins); older precon decks repaired once on opening.

- Build 64: the card window leads with the upgrade row's swap (row and chosen Sheets tile).
- Builds 61–62: GC and green + health badges on upgrade card images (ramp, draw, removal, wipes, lands, curve, mana, win routes).
- Build 60: shorter Upgrades page; Path to Apex, the next-build line and Lands helper in Show all details.
- Build 59: Deck Builder edits sync when the app is put away.
- Build 58: Back button on every Deck Builder page; browser and phone back.
- Build 57: searched cards replace a card doing the same job.
- Build 56: swap gains shown in power.
- Build 55: deck health in one colour-coded line with a details pop-up; "Foundation" instead of "Starter".
- Build 54: Deck Builder edits sync when a deck is closed.
- Build 53: profile sync between devices (online games list, single-device game in progress).
- Build 52: Deck Builder iPad safe area; legend rule, ward on abilities, phasing, mutate, offline use, QR pairing.
- Build 51: the top 1,000 cards all run by themselves.
