# Card automation progress

Updated with every push (owner's rule, 1 Nov 2026). Newest first. Counts come from `tools/rules-audit.mjs`: the top 1,000 from
`tests/fixtures/top-commander-cards.json.gz`, the whole catalog from the Scryfall Commander-legal list (31,770 cards, split into
4 chunks and run in parallel). New wordings live mainly in `src/engine/effects-b49.js` and `src/engine/keyword-triggers-b49.js`;
tests are in `tests/node/catalog.mjs`. See HANDOFF.md for architecture and release steps.

## Where it stands

- **Live build:** 1.0.0-rebuild.103 (Deck Builder {"build": 212, "version": "0.9.67"})
- **Top 1,000:** 1,000 run by themselves (all done).
- **Whole catalog:** 22,630 of 32,300 (about 70%; Scryfall oracle file of 12 Nov 2026; build 103, long-tail batch 2).
  Build 101: 21,958. About 9,670 still need something done by hand, each wording now covering only a
  handful of cards. Of the 272 cards batch 1 sent back to "by hand" for being misread, 178 now run correctly; 94 remain.
- **Status: paused** (owner, 1 Nov: "pause all other work … until I have data to press forward with"). Build 52 fixed the
  Deck Builder on iPad so the app is usable meanwhile. Pick up from "Paused: not finished" below when the owner says go.

## Paused: not finished

The complete roadmap of every open change across the app is `ROADMAP.md`.

1. **Player toolbox (the next card-decisions feature).** When a card is resolved by hand, the player gets a toolbox of steps
   (move a card, tap, counters, life, draw, create a token …) with the tools the card's text suggests listed first, "that card"
   carrying from one step to the next, and the steps applied as one change; a remembered ruling replays its steps next time.
   - Done but kept out of the app: the engine side, saved as `wip/toolbox-engine.patch` at the repo root (apply with
     `git apply wip/toolbox-engine.patch` from the repo root). It adds `src/game/toolbox.js` (TOOLS, rankTools, stepLabel,
     applyToolSteps), the controller's `guided-stage` / `guided-done` intents with staged steps (several devices: a
     `manual-resolution` proposal everyone agrees to; one device: applied straight away), `rememberedOutcomes`, the view's
     `prompt.toolbox`, flow.js staging stored ruling moves automatically, and `cloud/worker.js` accepting `moves` on a stored
     outcome. The node suites passed with it applied (game 248, mechanics 62, smoke 6, catalog 364).
   - Not done: the screens. `panels.js` openGuided rewritten around the toolbox (staged steps listed, suggested tools first,
     "that card" chaining, on one device an "everyone agrees" confirm, remembered outcomes offered); a toolbox in Host tools →
     Edit game; the ruling pop-up sending `moves`; a Playwright suite for it. Then deploy the Worker (`sh cloud/deploy.sh`), since
     the live Worker does not keep `moves` yet.
2. **Stylesheet cleanup** (roadmap): fold `styles/app.css` override sections 16–32 into their base rules, checked pixel-for-pixel
   with `tests/style_diff.py`. Not started.
3. **The card long tail:** about 10,770 cards of the whole catalog still need something done by hand (batches, check in every 100).
4. **Hosted games between devices (owner, 2 Nov: "ignore hosted games for now, but put it in our handoff").** Build 53 carries
   only games played on one device. A hosted game (room code or QR pairing) runs on its host device and the others connect to it,
   so moving it means handing over the host role mid-game: the old host must stop (or become a player) before the new one reopens
   the room with the same code, and every connected device must follow. Online games ("play over time") already live on the
   Worker and need none of this; their list now travels with the profile.
5. **Profile sync:** the Deck Builder sends its edits when a deck is closed (build 54) and when the app is put away (build 59).
   A device that declines "Continue your game?" keeps its own game and uploads it next time it
   changes. Not yet checked on two real devices.
6. **Needs the owner's devices:** the Deck Builder iPad fix (portrait, landscape, as a home-screen app), QR pairing over a
   hotspot, offline after the first launch, hosted rooms between devices.
7. **Deck Builder test UI-B145-01** (Gisa, no play data: a Zombie deck from the theme pages) fails with no theme pages loaded
   (`pages: []`), on build 171 as well as 172, so it predates the iPad fix; probably the test-data branch lacks the Zombie theme
   page. The other 127 Deck Builder UI checks pass (UI-B146-02 is timing-sensitive: it failed once while other tests shared the
   machine and passed alone).
8. **iOS app:** on hold (owner, 1 Nov: "We don't want to develop for iOS yet").

## Known limits

- Moraug, Kardur, copied lands, Dredge for other players' draws and Echo/Cumulative upkeep action costs: done (build 68);
  costs that need a choice (build 79); costs an opponent takes part in (build 86).
- Still by hand: Banding, Haunt, Assist, Forecast, Clockspinning, Herald of Leshrac's upkeep, and most of the long tail.

## Log

### Build 102 — 12 Nov 2026 (Deck Builder 0.9.67, build 212; app 1.0.0-rebuild.102): the Upgrades tab count matches the list
- Owner, 12 Nov: "I don't know why the upgrade tab displays the number on the tab. It never matches the number of cards that are
  currently in the deck that need to be replaced." The tab counted only the swaps at the deck's own price level (owner's rule of
  30 Oct: the Upgrades left number), while the page lists every card with a suggested replacement at any level (Wakanda Forever
  at Budget: tab 10, page "Upgrade 1 of 19"). The tab now counts the cards the page lists (views.js upCardCount). Test UI-TAB-01
  (new); UI-B88-01 updated to the new rule (still: cards, each once, never fewer than the level's own swaps, not options).
- Tests: Deck Builder full live run: UI 143 passed, 3 failed side by side; UI-B88-01 (the old rule) then updated and passing;
  UI-ASYNC-01 and UI-B197-02 pass alone (their known side-by-side flakes). Benchmark, genstrong, tourney identical; accept 39 x2;
  semantics 2 old failures; claims 40; scheck bad 2 (as on Build 99); cisweep 0; edge 0. Game files unchanged since Build 101.
- Next (owner, 12 Nov): make the deck score agree with the strongest version of the deck (the strength build), then ship the
  strength finish for generated decks (branch team/apex: tournament match Apex 30% -> 70%, core 30% -> 79%).

### Build 100 — 12 Nov 2026 (Deck Builder 0.9.66, build 211; app 1.0.0-rebuild.100): card names follow the picture; lazy card pictures
- Owner, 12 Nov: "heralds of the shredder still reads as vigor". Heralds of the Shredder is Vigor's printed name in the Turtles
  precon set. A generated deck shows cards in the commander's set printing (ensureTheme), but the decklist named a card by a
  printed name only from a precon's own list, so the Turtles picture of Vigor was labelled Vigor. The decklist name now comes from
  the printing the picture shows (views.js printedName reads shownPrint first). Test UI-NAME-01 (fails on Build 99, passes now).
- Owner, 12 Nov: "the card images in the deck list are taking forever to load now". Not reproduced in Chromium: on a phone-sized,
  throttled screen the visible rows' pictures finished in 3-6 s, through the service worker too, with its picture cache filled to
  4,000 entries; no request was cancelled by the page's redraws. Found: the list asks for every picture at once (about 100 art
  crops, ~15 MB on a phone) and the page is redrawn about 22 times while data arrives. Pictures now load as they come into view
  and decode off the main thread (cards.js render). Needs the owner's phone to confirm.
- Not shipped: "I generated an apex deck with heroes in a half shell. It says it's deck power 66 with 28 cards on the upgrade
  page". Cause: since Build 93 deck power and the upgrade list measure a deck against its card-strength builds, but the
  generator still builds by the engine's score, so a fresh Apex deck sits at power 32-65 with its strength build's swaps listed.
  Finishing generated decks on the strength build (strFinish, commit 8fa9ab2) gave power 100 with no Apex swaps left for six
  commanders, but swaps 59-76 cards (Turtles Apex: engine score 91 -> 77, synergy 100 -> 62, bracket 3 -> 4) and broke five
  generation tests (UI-GEN-03 Theme first, UI-B114-01 land formula, UI-B142-02 Budget list, UI-B144-02 built ahead, UI-B145-01
  no-play-data reasons). Reverted (f57e65c); waits for the owner's decision (ROADMAP 7f.3).
- Tests: Deck Builder full live run: UI suite 144 passed, 1 failed side by side (UI-PLAN-03, passes alone); upgrade benchmark,
  genstrong and tourney identical to the run with the reverted change; accept 39 x 2; semantics 2 old failures; claims 40;
  scheck bad 2 (the same on Build 99); cisweep 0; edge 0. Game files unchanged, so the game suites were not rerun (owner, 9 Nov);
  they passed on Build 99 this morning (game 254, mechanics 85, catalog 409, smoke 6, tracker 20, practice 20, rules-server 27,
  forge, soak 40 with 0 problems). Rules audit of 12 Nov (Scryfall file of 11 Nov): 21,993 of 32,300 Commander cards run by
  themselves.

### Build 99 — 12 Nov 2026 (Deck Builder 0.9.65, build 210; app 1.0.0-rebuild.99): real practice games, deck vs any deck (roadmap 5.3)
- Deck Builder: Build stats → Practice games → Games against other decks. 6 full games on the rules engine, every seat played by
  the practice bot (src/game/bot.js), against up to three opponents each chosen from the player's own Commander decks or the
  built-in precons ("No player" for smaller games; 1-on-1 works) (owner, 12 Nov). Shows wins, winning round, round knocked out,
  commander round, spells, damage and the cards left to be resolved by hand. Runs in module workers (deck/match-worker.js,
  up to 3). No rules change; whole catalog still 21,695 of 31,836.
- Tests: node catalog 409, game 254, mechanics 85, smoke 6, tracker 20, rules-server 27, forge passed, practice 20 (new), soak 40
  three times (0 problems); every Playwright suite (tracker 40, game 28, flows 29, net 30, offline 5, pair 5, online 41,
  challenge 13, scan, tracker-net 44). Deck Builder live suite: UI 144/144, accept 39 ×2, cisweep 0, edge 0, scheck bad 2,
  claims 40 and semantics 2 failures (known since builds 83-87; its engine bundle is unchanged by this build).

### Build 98 — 11 Nov 2026 (Deck Builder 0.9.64, build 209; app 1.0.0-rebuild.98): Build 97's three changes plus the top-bar re-check and the Flip chip
- Build 97 (10 Nov, Deck Builder 0.9.63, build 208) was the three changes below.
### Build 97 — 10 Nov 2026 (Deck Builder 0.9.63, build 208): three changes in one build (owner: "make a build of several changes, test it, and push it live")
- Full run: UI suite 142 passed + UI-STATS-01 (timed out side by side; passes alone 2 of 2); upgrade benchmark identical to Build 94-96; accept 39 x 2; semantics 2 old failures; claims 40; cisweep 0; edge 0.
- Deck Builder profile clean-up (owner: "any irrelevant data needs to go off the profile page"): the Profile page keeps the
  player's things (name, game record, players at your table, backup file); the upgrade engine and the card database moved
  to a Settings pop-up opened from the Profile header (redrawn with the page, so card-data progress shows live); the
  saved-decks list left (the Decks page lists, opens and deletes decks). Files: deck/ui/cards.js (viewProfile, settingsHtml,
  openSettings), deck/ui/events.js. Test UI-PROF-01 (new; also checks the top bar below).

- Clearer deck generation (roadmap 7d; owner: "If you don't know where to look, you don't know where to start"): choosing
  Empty Commander deck or Empty Standard deck opens a "Set up your deck" pop-up with three steps in order: commander (search;
  Standard: up to three colors), price level (Budget = precon level, Mid, Apex), mechanics (set from the commander; Standard
  adds its own; "Change mechanics" opens the list and closing it returns to the pop-up). "Show the cards to add" designs the
  deck's plan: every card of a full build is listed on the Upgrades tab as a card to add, Budget (precon level) stand-in first
  for each slot, with Add all per price level; nothing goes in the deck and nothing is swapped until the player adds it. Skip,
  Escape or tapping outside closes it; the Build panel keeps the same choices. Files: deck/ui/deck.js (setupHtml, openSetup,
  setupGo), deck/ui/events.js, deck/ui/cards.js (render keeps the pop-up in step). Test UI-SETUP-01 (new).
- Recovery email (7b.3): not started. It needs an email-sending service in the owner's name (account and key): to set up
  with the owner.

- Top bar on the owner's iPhone (11 Nov): it stayed too wide after the phone changed width until it was rotated. The bar is now checked on every layout check (page show, focus, visual-viewport resize, orientation change) and uses the visible width. Checks: a 932 px wide load shrunk to 667 px and 320 px with no action: no button past the edge. Files: deck/ui/events.js (ensureLayout, orientation, visual viewport), deck/ui/views.js (fitNav). Live in Build 98.

- Flip (owner, 11 Nov: "I don't see a flip function in the deck builder"): the Flip control was in the card pop-up but never
  showed. The published card data keeps no pictures on card faces, and the app only flagged a card two-sided when both faces
  had pictures, so no card qualified. A card is now two-sided by its layout (transform, modal_dfc, reversible_card: 489 cards in
  the test data); the control is a chip, and reads Reverse for reversible cards. Pictures come from the same printing's back
  side. Files: deck/engine/library.js (twoSided, rv), deck/ui/base.js (chip), index.html (cc-theme v=182). Test UI-FLIP-01 (new).
  Live in Build 98 (checked by the test only).

#### The top bar fits every screen
- Owner's iPhone, held sideways: the top bar ran off the right edge and Profile was cut off. Now the bar checks its own fit (on
  open, on resize and once the fonts load): if the buttons don't fit on one line the labels go and the icons stay (each
  button keeps its name for screen readers); if even that doesn't fit, the "Deck Builder" title goes too. Wide screens are
  unchanged. Files: deck/ui/views.js (fitNav), deck/ui/boot.js, deck/cc-theme.css (v=181), bundles rebuilt.
- Checks: no button past the edge at 13 screen sizes (phones both ways, iPad, desktop), also with notch-sized side margins;
  screen suite (check.sh screens live) 141 passed, 0 failed.

### Open (10 Nov, not live): the upgrade-list wait-for-data rule (ui/library.js recsSettling; off unless S.settle = true)
- Owner asked to fix it; not fixed yet. With it on, full UI-suite runs (3 groups side by side) fail one check about every run: UI-ASYNC-01 (no swaps drawn) or UI-B197-02 (the Health pop-up opened with 2 of 3 sections filled). Never alone (11 solo runs), never seen with it off in 3 full runs (not proof at this rate). One failing UI-ASYNC-01 run had the deck with no mechanics (Upgrades drew "Set up the build first") after an earlier test's play data replaced its commander's; the test now reloads its own play data and takes its themes, which did not stop the failures. Next: record the gate's holds during a full run (which deck, how long, what triggered the release) and compare with the failing tests' timing; check whether a held list delays recsFor.done / the background health fixes (UPFIX), which UI-B197-02 reads.

### Build 96 — 10 Nov 2026
- Deck Builder 0.9.62 (build 207): text boxes no longer close while typing (a background redraw waits, and the box keeps focus, text and cursor); practice games are played once per deck (scoring about twice as fast, Fix: Mana 5.3 -> 2.6 s on desktop, scores unchanged); the upgrade list is built once its data has arrived (opening a precon: 9 builds -> 4, Upgrades complete 8.4 -> 4.0 s on desktop); I don't have this card lists the card's own variations (same mechanic, similar mana value) (owner, 10 Nov). Tests: UI-TYPE-02, UI-NH-01 new; UI suite 140 + UI-STATS-01 (passes alone); benchmark test Mid identical. Game files unchanged. Next (owner: next week): build the upgrade list on the background helper and ahead of time (options C + D).
- The upgrade-list wait from Build 96 is switched off (S.settle; kept for the background-helper work, roadmap options C + D): under load it still left a list without swaps (UI-ASYNC-01 failed side by side even after narrowing it to a finished list for the same cards, 4 s, never for recsReady). With it off: UI suite 140 + UI-STATS-01 (passes alone 3 of 3; it waits a fixed 16 s and timed out side by side). ixDeckMatches compares the deck name by name instead of joining 100 names on each call (benchmark test Mid identical; UI-B81-01 passes). Pushed as Build 96 in place of the first Build 96 commit, whose Pages deploy was stuck on GitHub's side (owner: yes).

- Upgrade list built once the data settles (owner, 10 Nov: 'How do we make this instant?', options A + B chosen; C + D, the background helper building it and building ahead, left for next week): while play data or the Apex reference is still arriving, the deck keeps the list it has, marked as checking, and builds once (at most 8 s later); a deck seen before then matches its saved checked list. Opening a precon (desktop): 9 builds -> 4 (plus one the timing script forces), Upgrades list complete 8.4 s -> 4.0 s. UI suite 140 + UI-STATS-01 (passes alone twice; it timed out once side by side).
- Speed (owner, 10 Nov: 'Optimize the app. It's running slow'): practice games are kept for the same deck (engine practice.js simulate: same commander, cards in order, games, seed, settings and card library; the last 400): a measured session played 488 sets of games for 203 different decks. Desktop timings in that session: practice games 13.6 s -> 6.0 s, deck scoring 28.9 s -> 14.7 s, Fix: Mana 5.3 s -> 2.6 s, generating a deck 7.6 s -> 5.8 s; the UI suite 650 s -> 535 s. Scores unchanged (benchmark test Mid identical; practice panel agrees game for game, UI-B136-01). Full UI suite 141 passed. Still open: the upgrade list is worked out again as each piece of data arrives (9 times opening a precon, 0.2-0.5 s each on desktop) and runs on the page.
- Typing (owner, 10 Nov: 'entered text boxes closing while I'm typing and you have to reselect the box'): a background redraw (upgrades measured, fixes found, prices, card data) waits while a text box has focus and a key was pressed in the last 3 s (up to 15 s), and every redraw puts the box back focused with its text and cursor (ui/cards.js focusSnap/focusBack); an open search list reopens. New test UI-TYPE-02.
- "I don't have this card" (owner, 10 Nov: "just pulls the same cards for every card ... It should show the alternate recommendations for that card. Other variations of the same mechanic with similar mana costs"): the list is ranked by how alike each card is to the missing one (engine likeness in generator.js: what it does and hits, speed, type, jobs, themes, times mana-value closeness), with popularity and the deck score as a smaller weight. Wakanda: Dispatch -> Path to Exile, Swords to Plowshares; Beast Within -> Emergency Eject, Stroke of Midnight; Fight for the Throne -> Ancient Animus; Arcane Signet -> Fellwar Stone. Lands keep their colour rule. New test UI-NH-01; UI-B141-04 no longer requires strongest first. Engine scoring unchanged (likeness is used only by this list).

### Build 95 — 10 Nov 2026
- Deck Builder 0.9.61 (build 206): the Health pop-up holds the health alerts' fixes, not the Upgrades page (owner, 10 Nov); a full deck's land target follows its own mana needs again, the commander's EDHREC average only starts a deck still being built (owner, 10 Nov); card readings are kept between launches and reused by the background core (phone speed: every card ready 37.8 s -> 1.4 s, opening a precon 47 s -> about 24 s). Tests: the full live run 83 -> 36 min (checks side by side, cisweep and genstrong split by deck; numbers identical); guidecheck scores the strength list; UI-READS-01 new, UI-B197-02 and UI-B114-01 updated. Benchmark identical to Build 94 on all nine numbers. Game files unchanged.
- Deck Builder speed (roadmap 6.2, owner 9 Nov: 'Do 1, 2, and 3'): each card's reading (tags and functions) is kept between launches in the browser's storage (about 2.8 MB, keyed by build, engine settings and each card's text), and the background core reuses it. At phone speed (4x slowed): every card ready 37.8 s -> 1.4 s on the next launch, opening a precon 47 s -> about 24 s, the background core's warm-up 15 s -> 0.2 s. Readings match a fresh reading exactly (all 32,115 cards in Node; a sample in the browser, test UI-READS-01). Sending the library to the background core once at launch was already done (Build 143).
- Health fixes (owner, 10 Nov: 'The health upgrades listed on the upgrade page were meant to go on the health pop up directly, not the main page'): the Upgrades page no longer shows the 'Fixes <alert>' rows (Build 87); it still works them out in the background, and the Health pop-up opens with them already in each alert's section. UI-B197-02 rewritten for this; UI-HPOP-01, UI-ASYNC-01, UI-B192-01 pass.
- Land target (owner, 10 Nov: 'If our deck needs mana to swing because of its current state we need to adapt to the deck's mana needs', replacing 9 Nov's 'match EDH'): a deck with most of its spells (40+) takes its target from its own spells again (our formula: average mana value, cheap ramp, landfall); a deck still being built starts from the commander's EDHREC average when loaded. Benchmark identical on all nine numbers (3 sets x 3 tiers); the 21 land-related UI checks pass.
- Test speed (roadmap 6.6): the full live run 4,982 s -> 2,161 s (83 -> 36 min). `check.sh ... live` runs independent checks 3 side by side; cisweep (1,466 s -> 623 s) and genstrong (727 s -> 250 s) split their decks across 3 processes (`PAR`, tools/tests/suite/par.js). Every number is identical to Build 94's one-at-a-time run. UI-B114-01 updated: a deck still being built takes the commander's EDHREC land average once its page is loaded (owner, 9 Nov), the starting target otherwise; it had passed only when the page was not loaded yet. Full run on this branch: UI suite 139 passed, accept 39 x 2, semantics 2 old failures, claims 40, cisweep 0, edge 0.
- Published-guides check (roadmap 6.2 guide blind spots) now scores the strength list players see: Swords to Plowshares (Turtle Power) is offered; Sheoldred and Yawgmoth (Doom) score below our pick by card strength; Brightglass Gearhulk (Wakanda) still missed; guide cuts we also make 49% -> 61%; guide adds we offer 49% -> 39% (strength rows show fewer popular cards).

### Build 94 — 9 Nov 2026
- Deck Builder 0.9.60 (build 205): the Fix menus and See alternatives pick by card strength (owner, 9 Nov: 'Fix the fix menu and alternatives'); an alternative may do the pick's job or the job of the card going out; mana fixes stay tested in practice games. The land target follows EDHREC's average for the commander when its page is loaded ('our land counter should match EDH'). The engine sees every plan, with two new ones: Big creatures and Keyword counters. With Stick to the theme on, spare-land rows keep only on-theme picks. The upgrade benchmark now scores the list players see, per tier (agreement@5 tuneall/test/holdout): Mid 0.187/0.245/0.314, Budget 0.156/0.188/0.292, Apex 0.020/-0.078/0.076 (Apex adds tournament staples few precon upgraders add; it is judged on the tournament comparison). Testing rule (owner, 9 Nov): targeted checks while working, one full Deck Builder run before going live, game suites only when game files change. Tests: UI suite 138 (GEN-03 passes alone; it clashes only side by side), accept 39 x 2, semantics 2 old failures, claims 40 unrecognised, cisweep 0, edge clean. Game files unchanged.

### Build 93 — 9 Nov 2026
- Deck Builder 0.9.59 (build 204): card strength is on (roadmap 6.1, owner 9 Nov: 'Push with the strength upgrade'). Deck power runs from replacement level (0) to the deck's Apex build (100), with its Budget and Mid builds marked; the upgrade list comes from the three strength builds (how often strong decks that could play a card do, from EDHREC's bracket pages, refreshed weekly from the Deck-Companion card-data branch), each deck's own tier leading, following the deck's rules (card sets, exclusions, held picks, Stick to the theme), no card on two rows; a Mid or Budget deck's order is labelled Best for Mid/Budget. Benchmarks: tournament match Apex 60% -> 70% (core 58% -> 79%), Mid 35% -> 64%; players' upgrades (agreement@5, tuneall/test/holdout) Mid 0.188/0.185/0.269 -> 0.187/0.245/0.314 (the owner accepted the 0.001 on tuneall), Budget 0.119/0.108/0.208 -> 0.156/0.188/0.292. Themes steer the picks once the player chooses or reorders them. UI tests serve pinned strength data (tools/tests/suite/strength). Rules unchanged (game 254, mechanics 85, catalog 409 passed).

### Build 92 — 8 Nov 2026
- Deck Builder 0.9.58 (build 203): the Health pop-up shows each problem as its own section with the fix in place: the best swap, up to two other options and a 'for now' card (one you own, else one under $1) when the best card isn't owned, each with Swap; the long explanations are cut to one line. Card strength (roadmap 6.1) is in the build but off (UP.str 0): with the hosted data its picks broke 15 UI checks (set rules, excluded cards, repeats), so it waits for those fixes. Rules unchanged (game 254, mechanics 85, catalog 409 passed).

### Build 91 — 2 Nov 2026
- Deck Builder 0.9.57 (build 202): pop-ups on iPhone and iPad keep every part in their scrolling body (parts added after a window opened, like the card window's 'Or take out instead', had squeezed its details to nothing on a phone held sideways); background redraws wait (up to 15 s) while a search's list of cards is open, so a tapped result is not missed; a tap outside a search closes its list. Test UI-POP-01.

### Build 90 — 2 Nov 2026
- Deck Builder 0.9.56 (build 201): card quality shown as the deck's rating against its Apex build by what the cards do (synergy, balance, ways to win, mana), not popularity; Budget and Mid decks keep their under-$3/$12 line. Upgrade picks unchanged: scoring picks by it lowered the benchmark (0.221/0.203/0.287), so the owner chose display only (UP.qEff stays 0).

### Build 103 — 13 Nov 2026: long tail, batch 2 (owner, 13 Nov: send it live)
- **679 more cards run by themselves** (21,958 → 22,630 of 32,300; one misread card sent back). Owner, 12 Nov: batches of
  500; fix the cards sent back; nothing left by hand.
- **Amounts read from the text** (new `src/engine/amounts-b101.js`): whose cards ("you control", "your opponents control",
  "that player controls", "on the battlefield", in a hand, graveyard, library or exile), noun lists ("Squirrels, Bats,
  Lizards, and Rats"), qualities (tapped, attacking, nontoken, nonbasic, legendary, a colour, a keyword, with counters,
  power/mana value limits, attached), and arithmetic ("twice", "3 plus", "minus 4", "half … rounded up", "… plus the number
  of …"). This turn's tally (triggers.js tallyTurn): creatures that died (under your control, nontoken, a subtype),
  cards drawn and discarded, tokens made, creatures that entered under your control, opponents attacked, permanents
  sacrificed. Also party size, blockers of a creature, opponents with more/fewer creatures, domain, colours among
  permanents, card types in graveyards, different mana values/powers, commander casts, colours of the spell cast.
- **New wordings** (`src/engine/effects-b101.js`): colour changes ("becomes red and gains haste"), Hurricane/Earthquake
  damage, "can't attack", "return another creature you control", "up to one other target", Twiddle, "target opponent gains
  control of this", fights an opponent's creature, delayed returns and destroys, "double its power", tap/untap all,
  damage to each other creature, three-type wipes, damage to two different targets, "discard up to two", "sacrifice it
  unless you discard", he/she/him, prevention of combat damage by or to one creature, prevention of all damage to a
  target, "can't be regenerated", "skip your next turn" (phase.js), "can block an additional creature" (rules.js), "blocks
  this turn if able", "must be blocked if able", Lure for a turn (rules.js validateForcedBlockAssignments), "can attack as
  though it didn't have defender", "fewer than seven cards … the difference", "each other opponent", Clockwork counters.
- **Misreads fixed** (found by reading every newly passing card, tools/longtail/cardfx.mjs):
  - "each player … equal to the number of lands that player controls" (Price of Progress, Acidic Soil, Mjölnir, Folio of
    Fancies) is worked out for each player (it was once, for no one).
  - "its power" / "that creature's power": the target (Soul's Might, Berserk), the creature that entered (Hamletback
    Goliath, Railway Brawler), the enchanted creature that died (Dying Wish), the sacrificed creature (Disciple of Bolas,
    Rupture, Twisted Justice); "It deals damage equal to its power" is dealt by that creature (Venom Blast, Bionic Blow,
    Knockout Maneuver; misread since before build 101).
  - "Put X +1/+1 counters on it" after making a token or manifesting is that permanent (Fractal tokens); "Choose target
    creature … that creature" is the target; a count that names its own target player is asked first (Reap); "that
    player" after an earlier target player (The Mouth of Sauron); "its controller controls" left to the player.
- Tests: catalog 447 (+16), game 254, mechanics 85, smoke 6, tracker 20, practice 20, rules-server 27, forge 301/302,
  soak 40 three times (0 problems), every Playwright suite (game_ui 28, flows_ui 29, net_ui 30, online_ui 41, offline_ui 5,
  pair_ui 5, challenge_ui 13, scan_ui, tracker_test 40, tracker_net_ui 44). Deck Builder untouched.

### Build 101 — 12 Nov 2026: long tail, batch 1 (owner, 12 Nov: release it; batches of 500 from now on; the 272 sent-back cards are to be fixed, nothing left by hand)
- **237 more cards run by themselves.** New wordings in `src/engine/effects-b101.js` (hooked after the build-49 ones): random
  discards (Hymn to Tourach, Mind Twist, Hypnotic Specter: the game picks, nobody is asked); damage to "that land's /
  artifact's / spell's controller" (Ankh of Mishra, Zo-Zu, Smash to Smithereens, Ionize); "loses flying / defender /
  indestructible until end of turn"; "has base power and toughness N/N until end of turn" for the card itself; a group
  "target player controls" (Contagion Engine, Great Oak Guardian, Overwhelming Forces, Tempest Caller); several targets each
  with a one-target instruction ("Two target creatures each get …", "deals 1 damage to each of up to two targets": Jaya's
  Immolating Inferno, Fall of the Titans, Profane Command's last mode); "defending player …" (Nemesis of Reason,
  Thraximundar); "you may have target creature get/gain/fight …" (Disciple of the Vault, Duelist's Heritage); a pronoun
  where the game reads a target ("That creature can't block this turn", "That land becomes a 0/0 Elemental …": the earlier
  target when there is one, else the trigger's card); "Investigate twice".
- **Engine misreads fixed** (found while reading how each newly passing card compiles):
  - "Target player sacrifices a creature and loses 10 life": the life was lost by the caster. Now the same player.
  - Counting phrases the reader did not know were silently counted as "every permanent you control" (The One Ring drew a
    card per permanent; Chasm Skulker, Distant Melody, Descent into Avernus the same way; Shared Animosity counted every
    creature). Unknown phrases are now left to the player; these are read properly: counters on this card (also its last
    known counters when it dies), "counters on it", domain, colors among permanents, card types in your graveyard, instant
    and sorcery cards in your graveyard, attacking creatures (and "other attacking Goblins"), tapped/untapped things you
    control, creatures you control with a keyword, a subtype's cards in your graveyard, opponents you have, permanents of
    the chosen type, other attackers sharing a creature type. Plural creature types are read (Elves, Allies, Zombies).
  - A target description that swallowed the rest of the sentence ("target opponent and you gain 4 life": the life gain was
    dropped; "target creature gets +1/+0 until end of turn and can't be blocked": the pump was dropped) is now read in two
    halves about the same target, or left to the player.
  - "where X is that creature's / its power" on a targeted creature is the target's power (Xenagos, Berserk), not the
    source's. "Up to X target creatures …, where X is …" counts X as the targets are chosen (it was 0).
- **272 cards went back to "by hand"**: the game had been running them with a wrong amount or half the sentence (list from
  the audit comparison; examples: Sage's Reverie, Pact of the Serpent, Storm Herd, Thalisse, Folio of Fancies, Keeper of
  Secrets, Crimson Wisps). The commonest of their wordings are the next batch's first candidates ("creatures target player
  controls" as a count, "twice the number of", "that spell's mana value", "your life total", "becomes red and gains haste").
- Top 1,000: still all (1,000). Whole catalog on today's Scryfall file (32,300 cards): 21,993 → 21,958.
- Tests: catalog 431 (+22), game 254, mechanics 85, smoke 6, tracker 20, practice 20, rules-server 27, forge triggers
  unchanged, soak 40 three times (0 problems), every Playwright suite (game_ui 28, flows_ui 29, net_ui 30, online_ui 41, offline_ui 5, pair_ui 5, challenge_ui 13, scan_ui, tracker_test 40, tracker_net_ui 44). Deck Builder unchanged since build 100 (its suite ran then).
- Tools for the next batches: `tools/longtail/` (README there).

### Build 89 — 8 Nov 2026
- 18 more cards run by themselves (21,677 → 21,695 of 31,836), none lost: "Whenever a source you control deals noncombat
  damage to an opponent" (Niv-Mizzet, Visionary; Chandra's Incinerator, Chandra's Pyreling) with "that many" read as the
  damage; "another colorless creature you control enters" (Glaring Fleshraker, Flayer Drone, Dust Stalker); "Whenever one /
  two or more creatures attack" (Argent Dais); "your commander" as a trigger subject (Tome of Legends); creature tokens carry
  the colours their text names; Planar Genesis's "If you don't, put a card into your hand"; Peer into the Abyss; Ad Nauseam.
- Tests: catalog 409 (+8), game 254, mechanics 85, smoke 6, tracker 20, forge 301/302, soak 40 three times (0 problems), every
  Playwright suite (online_ui 41). Deck Builder unchanged since build 88 (its live suite ran then).

### Build 88 — 8 Nov 2026
- Deck Builder 0.9.55 (build 200), roadmap known limits: deck history keeps the cards from before a change that arrives from
  another window or device (labelled, once; UI-HIST-02); a card's window for a full Commander deck opens at once and fills in
  its swaps when measured (the same swaps; UI-CW-01). The measuring itself is unchanged (faster needs an engine change).
  No rules change; whole catalog still 21,677 of 31,836.
- Tests: Deck Builder live suite: UI 136/136, benchmark 0.280 / 0.317 / 0.334 (unchanged), accept 39 ×2, cisweep 0, edge 0,
  scheck bad 2, claims 41 and semantics 2 failures (as builds 83-87); node game 254, mechanics 85 (the Room test now lets the
  setup's stack resolve first: it failed 1 run in 15; 25/25 after), catalog 401, smoke 6, tracker 20, forge 301/302, soak 40
  three times (0 problems); every Playwright suite (online_ui 41).

### Build 87 — 2 Nov 2026
- Build 87: Deck Builder 0.9.54 (build 199): each active health alert (yellow or red, not ignored) shows its best two swaps from its Fix menu at the top of the upgrade list, marked 'Fixes <alert>', with a Swap button that keeps the upgrade list (owner, 8 Nov: 'Why are deck health fixes not shown as upgrades?'). Worked out in the background one alert at a time, only while that deck's Upgrades tab is open, its list finished and its Apex reference made, and stopped when that changes; never redrawn over an open window (build 84's first try broke deck generation and See alternatives: UI-B81-02, UI-ALT-01). Rebased onto the other session's build 86; every suite run on the combined code (game 254, mechanics 85, catalog 401, soaks 0 problems, every Playwright suite) and the Deck Builder suite (UI 134, benchmark unchanged).

### Build 86 — 8 Nov 2026
- Roadmap round, smallest first; 148 more cards run by themselves (21,529 → 21,677 of 31,836), none lost. Galvanic
  Discharge (pay any amount of {E}); suspend from Delay, Jhoira of the Ghitu and Taigam; Cumulative upkeep costs an opponent
  takes part in (Wall of Shards, Varchild's War-Riders, Sheltering Ancient: chosen again per age counter); card data cached
  before build 28 repaired on load; "Activate no more than twice each turn"; Lairs and Visions karoos ("sacrifice it unless
  you return a non-Lair land / an untapped Island"), Quickling, Mistbind Clique; spells to the bottom of their library;
  Bontu's Last Reckoning's untap skip; Scorching Dragonfire; Blackmail-style "reveals three cards and you choose one" (the
  revealing player picks the three); Traumatic Revelation, Perish the Thought, Stinging Vitriol; "unless {G} was spent to
  cast it" (Plaxmanta); Disallow, Rebuff the Wicked; The Scarab/Locust/Scorpion God's return; Pestilence; damage equal to a
  land count (Spitting Earth and about 40 more); Corrupt's life gain; Marrow Shards; Oust.
- Tests: node game 254, mechanics 85, catalog 401, smoke 6, tracker 20, forge 301/302, soak 40 (0 problems); Playwright
  game_ui 28, flows_ui 29, challenge_ui 13, tracker_test 40, net_ui 30, offline_ui 5, pair_ui 5, tracker_net_ui 44,
  online_ui 41 (its two Deck Builder sync waits raised from 10 s to 30 s: the push takes about 11 s on this
  test machine with builds 83, 84 and 85 alike, so it timed out; 41/41 twice with the longer wait). Release checks (8 Nov, on top of build 85): soak 40 three times, 0 problems each; Deck Builder live suite on build 84's
  Deck Builder (unchanged here): UI 132/132, benchmark 0.280 / 0.317 / 0.334, accept 39 ×2, cisweep 0, edge 0, scheck bad 2
  (build 83: 1; Doom Prevails' Stilt-Man for Taskmaster measures 0 and Avengers' Tome of Legends -0.02, after build 84's
  practice-game change), claims 41 unrecognised and semantics 2 failures as on build 83.
### Build 85 — 2 Nov 2026
- Build 85: Deck Builder 0.9.53 (build 198): card search finds cards by their printed (flavor) names (owner, 8 Nov: 'The search function can't find newly renamed printings'). The card-data job's alt.json (every printed name with its real card, written daily) is downloaded once a day and kept in the browser; names the built-in list lacks are added to the name index (library.js addAltNames; storage.js loadAltNames), so new reskins resolve in search, imports and decklists. Search matches printed names and shows the one it matched (quick search: printed name with the real name; card search: a chip). 617 names live (561 built in). Tests: UI-B198-01 new; UI suite 133; benchmark unchanged.

### Build 84 — 2 Nov 2026
- Build 84: Deck Builder 0.9.52 (build 197). Mana stuck (owner, 8 Nov: 'strictly … a player cannot play anything from their hand due to the mana being completely wrong'): a turn counts only when nothing was cast and a spell the sources could pay for by amount needs a colour none of them makes (practice.js); Avengers 15% to 8%, Doom 13% to 6%, Turtle Power 13% to 8%, Wakanda 7% to 5%; the alert reads 'Nothing castable for lack of a colour'. Health warnings: red only when 2+ short and at half the target or less (lands: 4+ short); other shortfalls yellow. Miku precon: the commander in a reskinned printing shows that printing's name and art in the decklist, deck panel, deck tiles and card window (d.cmdPn; kept from EDHREC's listing or the pinned printing's flavor name; older decks fill it in once). Not shipped: health fixes in the upgrade list (its background work broke UI-B81-02 and UI-ALT-01; wip/health-fixes-in-upgrades.md) and card quality by effect (wip/card-quality-qEff.patch). Tests: UI suite 132, UI-B197-01 new, UI-B93-01 new wording; benchmark unchanged.

### Build 83 — 2 Nov 2026
- Build 83: Deck Builder 0.9.51 (build 196): the tokens a deck makes are listed at the very bottom of the decklist, not counted in the 100 (owner, 8 Nov). Read from rules text (library.js tokenKindsOf/deckTokens): 'create two 1/1 green Saproling creature tokens' is a 1/1 green Saproling, Treasure/Food/Clue …, keywords that make tokens (investigate, afterlife, fabricate, amass, incubate, living weapon, mobilize), copies; one per card per kind; doublers (Doubling Season) add none. Also: a carried upgrade list applies only to the refresh its own swap causes (a Regenerate in between drops it). Tests: semantics +5, UI-B196-01 new; UI-B84/B81/B146 leave the token rows out; UI-B135-01 waits for the page to settle (it failed the same way on build 82's code once the test order changed). UI suite 131; online_ui timed out once in the full run and passed 41/41 alone.

### Build 82 — 2 Nov 2026
- Build 82: Deck Builder 0.9.50 (build 195): the upgrade list stays after a swap (owner, 8 Nov, replacing 31 Oct's 'all upgrades should be regenerated': 'Apex suggestions should not change based on an upgrade I made of a mid or budget quality'). The row you swapped on keeps its higher tiers, now replacing the card you put in; that card shows in its tier as In your deck; the card you took out is shown with a big red Replaced chip; the other rows stay (library.js keepRecs/carryRecs, upgrades.js rowCols, deck.js). The list is worked out again on Regenerate or another change. Tests: UI-B195-01 (new), UI-B156-01 updated; UI suite 130; benchmark unchanged.

### Build 81 — 2 Nov 2026
- Build 81: Deck Builder 0.9.49 (build 194): an upgrade that works with three or more cards already in the deck says so ('Works with N cards in the deck'; library.js ixDeckMatches, the card window's interactions). Scoring it was measured and not kept: 0.1 to 1 per card, capped at 2 or 6, never raised agreement with the expert lists (tuneall 0.280 to 0.277 at 0.3, 0.265 at 1). Benchmark unchanged; UI suite 129.

### Build 80 — 2 Nov 2026
- Build 80: Deck Builder 0.9.48 (build 193): card roles checked against the game engine's reading (roadmap 5.1); 129 misreads fixed: a trigger on drawing is not card draw (Sheoldred, Orcish Bowmasters, Smothering Tithe, Psychosis Crawler …; library.js), a target you own or control is not removal (blinks such as Restoration Angel and Felidar Guardian, Staff of Compleation; library.js and functions.js), 'exile all other cards revealed this way' is not a wipe (Demonic Consultation). Benchmark: holdout 0.325 to 0.334, test unchanged, tuneall 0.281 to 0.280 (owner: ship it). Tests: semantics 56 (+7; the 2 failures are older, cards missing from the test data), UI suite 129.

### Build 79 — 2 Nov 2026
- Build 79: the medium rules round, 269 more cards run by themselves: Rooms (unlock a door as a special action paying its cost, only as a sorcery; 'When you unlock this door' fires for that door; both doors' abilities once both are unlocked; the doors lock again when it leaves), flip cards (flip this creature; ki-counter flips), time travel, Echo/Cumulative upkeep paid with a choice (asked whether to pay, then which cards; one per age counter), 'Pay {B} and 1 life' upkeep, Druid/Paladin/Sorcerer/Warlock Class, Hunter's/Gossip's/Blacksmith's Talent, Guide of Souls, Lightning Runner, Sphinx of the Revelation, Electrosiphon, Unholy Annex and other Rooms, 'damage equal to' amounts, life lost this turn tracked. Tests: mechanics 81.

### Build 78 — 2 Nov 2026
- Build 78: 171 more cards run by themselves, most-played first (long tail): Earthbend; Discover and optional energy payments inside effects (energy paid as the step resolves, counting energy the ability gave first); wipes with qualifiers (nontoken, nonartifact, non-Dragon, no counters, you don't control); 'equal to' amounts read as X; Syphon Mind, Noxious Gearhulk, Jace Wielder of Mysteries, Kozilek/Ulamog graveyard shuffles, Soul Shatter, Homeward Path, Balefire Dragon, Mahadi, Persist, Brass's Bounty, Wave Goodbye, Fling, Elixir of Immortality and others; life gained this turn tracked. Tests: mechanics 73.

### Build 77 — 2 Nov 2026
- Build 77: Deck Builder 0.9.47 (build 192): the green + on upgrades follows the Fix menus' rules (no always-tapped lands, lands only when they make a deck colour, the missing card of a winning combo counts for Win routes; ui/upgrades.js fixesMore, comboWins; test UI-B192-01). The Deck-Companion card-data job pings the free Supabase rules server on every run so the project never pauses (commit db48c60); its new schedule checked (first run at minute 17: 8 Nov 09:17 UTC).

### Build 76 — 2 Nov 2026
- Build 76: new online games run on a free rules server (Supabase), so no device holds another player's hand

### Build 75 — 2 Nov 2026
- Build 75: Modular dies transfer, Companion, voting (Will of the council, Council's dilemma); Deck Builder 0.9.46

### Build 74 — 2 Nov 2026
- Mechanics: **Suspect** (menace and can't block while suspected), **Devour** (as it enters, sacrifice any number of creatures; N +1/+1 counters each), **Sunburst** (a counter per colour of mana spent; the spell records colorsSpent), **Awaken** (a cast mode that adds the land animation). Glossary labels updated. Still by hand, each a sizeable piece: Companion (a companion slot in decks and import, the outside-the-game zone, the {3} action; conditions per card), Vote / Council's dilemma (per-card outcomes), Modular's dies transfer, and the rare old mechanics (Banding, Haunt, Cipher, Assist …). Tests: every suite (catalog 378).

### Build 73 — 2 Nov 2026
- Mechanics: **Forage** as a cost (exile three graveyard cards or sacrifice a Food, the player chooses), **Vanishing**, **Fading**, **Modular** and **Bloodthirst** counters as it enters, Vanishing and Fading upkeep (new condition b49-own-counters), **Landwalk** (attack-time cant-be-blocked), **Decayed** (can't block; sacrificed at end of combat after attacking). Connive, Explore and Populate were already automatic: Connive and Populate are now labelled so (Connive tested). Modular's dies-transfer stays by hand (glossary: partial). Deck Builder 0.9.45 (build 190): ENGINE_ROLES also adds the removal, draw or ramp the game engine reads on cards the Deck Builder reads only partly (69 cards; role-compare now measures the Deck Builder's own reader); benchmark unchanged. Tests: every suite (catalog 374), Deck Builder UI 128/128. Practice games with bots: held by the owner (7 Nov).

### Build 72 — 2 Nov 2026
- Stylesheet cleanup (roadmap 7.1): the last two unused rules removed with tools/css-clean.mjs; the numbered override sections had already been folded; style_diff 32/32 identical (one capture-noise screen re-captured). Glossary (src/data/mechanics.js): Manifest, Manifest dread, Clash, Gift, Monstrous, Renowned, Blood, Die rolling and Coin flips marked automatic (the engine reads them; tests cover each). ROADMAP.md: the round of 7 Nov and what is still open. Tests: every suite green (soaks 0 problems, forge 301/302).

### Build 71 — 2 Nov 2026
- Deck Builder 0.9.44 (build 189): **card interactions** (roadmap 5.2): the card window lists the cards in the open deck it works with and why — one produces what the other's trigger waits for (creatures dying, creatures entering, life gain, card draw, +1/+1 counters, lands entering, instants and sorceries, cards going to the graveyard, sacrifices). deck/engine/library.js IX, ixOf, worksWith; display only (no score change). E.g. Blood Artist: Viscera Seer and Lightning Bolt (creatures dying), Ajani's Pridemate (life gain). Tests: Deck Builder UI 128/128, quick check 12; the main app is unchanged since build 70 (every suite passed).

### Build 70 — 2 Nov 2026
- **Hosted games move between devices** (roadmap 4.1): Host tools → Move hosting to another device. The host sends the whole game to a connected player's device (seats relabelled: that device's seat is played on it directly, the old host's seat from the old host as a client), which reopens the room under the same code (session.js takeOverHosting, retried); the old host drops its saved copy and rejoins (handOverHosting); everyone else's reconnect loop finds the new host and gets their seats back. Only when each player has their own device. room.js handover/online, joinRoom onHandover. net_ui 30 (hosting moves, the old host rejoins as a client, the new host's edit reaches the other player). Deck Builder 0.9.43 (build 188): **the game engine's reading fills gaps** (roadmap 5.1, first step): lists.js ENGINE_ROLES (64 nonland cards the Deck Builder's reader gave no role; ramp, draw, removal, wipe, counter; written by tools/role-compare.mjs --lists, which no longer counts your own permanents as removal targets) is used only when the reader finds no role. Benchmark unchanged (agreement@5 0.252, weighted 0.281). Tests: every suite (online_ui 40 when run alone; it timed out once while the benchmark shared the machine), Deck Builder UI 128/128.

### Build 69 — 2 Nov 2026
- **The player toolbox** (roadmap 3): a card resolved by hand is done with staged steps — a tool done to a target, to "that card" (what the last step moved or made), to you or to each opponent; the tools the card's unread text calls for come first (src/game/toolbox.js TOOLS, rankTools). Done applies the steps together through the engine (applyToolSteps): on several devices the other players accept first (a manual-resolution proposal), on one device the screen asks the table. The steps are remembered for the card (game.rememberedOutcomes, offered next time) and an owner ruling keeps them as `moves` (Worker deployed 7 Nov; flow.js stages a stored ruling's moves). Screen: openGuided in src/ui/game/panels.js; the old immediate edit buttons are gone (Host Tools stays). The wip patch is applied and removed. Tests: every suite (flows_ui 29 with a toolbox step: "gains 2 life … applied by hand"; offline_ui after the precache list took toolbox.js).

### Build 68 — 2 Nov 2026
- **All suites pass again** (owner, 7 Nov: "fix everything except the 10k rulings left"): node suites, three soaks with 0 problems, forge 301/302, every Playwright suite, the full Deck Builder UI suite 128/128. Fixed tests: UI-B145-01 (EDHREC theme pages now kept in deck/tools/tests/suite/tags/), tracker_test (Scryfall's 404 for a made-up card), and seven Deck Builder tests that read the old layout and labels (B162 was a real bug: the badges were <b> like the Sheets names; now <span>). Rules: Moraug's extra combat comes before the second main phase (game.extraBeforeMain2, flow.js toAfterCombat); Kardur's goad covers creatures the opponents get later (game.goadEach, rules.js goadersOf; rule 611.2c); a land that becomes a copy makes the copied mana (transactions.js refreshManaSource); Dredge is offered for every player a resolving draw affects, asked of that player; Echo and Cumulative upkeep paid with an action that needs no choice (keyword-triggers-b49.js, may-pay doEffects). Deck Builder 0.9.42 (build 187): owned printings (profile.libPrint) and the 16 built-in precons' printings (lists.js Name@set#number); the card window says "This upgrade's swap"; Path to Apex in Show all details no longer repeats the health list. Card data job (Deck-Companion main): defense, reprint and flavor names kept; schedule at minute 17 (on-the-hour runs started 7-8 hours late). New tools/role-compare.mjs: the Deck Builder's roles against the game engine's reading for every card.

### Build 67 — 2 Nov 2026
- Deck Builder 0.9.41 (build 186): **one printing system for every card** (owner, 7 Nov: "all cards follow the right printing"). Order: 1 the player's choice (printing picker; never replaced), 2 the source's exact printing (psc + pcn: precon, pasted "(SET) 123" line, share link), 3 the name it was listed under (pn: a reskin's printed name), 4 the commander's set (themed printings, shown only), 5 the default printing. Every way into a deck stores those hints; `pinPrints` (deck/ui/deck.js) turns them into printings 75 per Scryfall collection request (printed-name-only cards: one exact-name search each), on import, precon load, share links and once per deck per session on opening, so older decks are fixed too. It replaces the precon-only pinning and the one-request-per-card import lookup (which dropped printed names). Share links now carry each card's set and number and the commander's printing. A code that resolves to a different card is ignored. Tests: quick check 12; Hatsune Miku precon 87/87 and commander; a pasted list with set codes and a printed name only; a share-link round trip; an old precon repaired on opening; a player's choice left alone.

### Build 66 — 2 Nov 2026
- Deck Builder 0.9.40 (build 185): no Scryfall card download in the app (owner, 7 Nov). Cards come from the daily snapshot `cards.json.gz` on the Deck-Companion card-data branch (one ~5 MB file, written every day at 4 a.m. New York time by card-data.yml); once a day the app reads `meta.json` and downloads again only when the snapshot is newer with a different card count (new cards). Scryfall's paged search stays only as the fallback. `snapshotUpdate`, `snapMeta` and the checkReleases change in deck/ui/storage.js. The job's file now also keeps defense, reprint and flavor names (Deck-Companion branch claude/card-effects-fixes-rcosbu, commit 3a9d2c0; takes effect when merged to Deck-Companion main). Tests: quick check 12; a fresh load with Scryfall's API blocked fills all 32,183 cards from the snapshot.

### Build 65 — 2 Nov 2026
- Deck Builder 0.9.39 (build 184): precons load in the printings they actually contain (owner: the Hatsune Miku precon showed the original printings of its reskinned cards). EDHREC lists each card's set and collector number; `pinPrecPrints` (deck/ui/deck.js) fetches those printings from Scryfall's collection endpoint (75 per request) and pins each entry (art, set, rarity, printed name, price) and the commander's printing. Precon decks loaded before this are repaired once when opened (`repairPrecPrints`, looked up by name in EDHREC's catalogue). Tests: quick check 12; Hatsune Miku: 87 of 87 entries pinned, reskins named (Shalai → Miku, Voice Over All), and an old-style copy repaired on opening.

### Build 64 — 2 Nov 2026
- Deck Builder 0.9.38 (build 183): build 63's fix never reached the card window: handleAct rebuilds the clicked button as {dataset: {p}} so data-cut was lost (the check passed because that row's cut was also the best measured cut). The click now passes data-cut (5th handleAct argument). Sheets: tapping the tile that is already chosen opens the card, also leading with the row's swap (data-n / data-cut on .s4). Tests: quick check 12; on three Wakanda Forever rows the card window from the row and from the tile leads with that row's card (Queen Mother Ramonda, Loyal Retainers, Nakia).

### Build 63 — 2 Nov 2026
- Deck Builder 0.9.37 (build 182): a card opened from an upgrade row leads with that row's swap (the row's card coming out, measured the same way); the other cuts follow. Upgrade buttons carry data-cut (deck.js side, alternatives a3); the card handler sets S.rowCut, wantHtml in deck/ui/cards.js puts that cut first; closing resets it. Cards opened from search or elsewhere are unchanged. Tests: quick check 12; Wakanda Forever: Dyadrine opened from its row leads with Greater Good.

### Build 62 — 2 Nov 2026
- Deck Builder 0.9.36 (build 181): the green + also covers Curve (a spell costing 2 or less, not an X spell), Win routes (a finisher, isFinisher) and Mana (a land making two or more of the deck's colours, one in a mono deck; any land when practice games run out of lands more than colours) — `fixesMore` in deck/ui/upgrades.js. Tests: quick check 12; on Wakanda Forever (Ramp, Curve, Mana alerts) the + lands on Avacyn's Pilgrim and Farseek (Ramp, Curve), Path to Exile, Swords to Plowshares, Heroic Intervention, Swiftfoot Boots (Curve), Jhoira's Familiar, Foundry Inspector (Ramp).

### Build 61 — 2 Nov 2026
- Deck Builder 0.9.35 (build 180): badges on upgrade card images (owner, 2 Nov). GC on every Game Changer, and a green + on a card that helps a health alert the deck has now (ramp, card draw, removal, wipes, or lands when short; tooltip names it). `cardBadges` / `HFIX` in deck/ui/upgrades.js (HFIX filled by statsHtml), used by every upgrade card renderer: rows (deck.js side), three-column rows (a3), Sheets tiles (.s4), plan rows, Highest score, swap list. Tests: quick check 12; checked on Wakanda Forever (Explore, Gleaming Splendor, Sword of Forge and Frontier get +).

### Build 60 — 2 Nov 2026
- Deck Builder 0.9.34 (build 179): a shorter Upgrades page (owner's screenshot, 2 Nov). The stats bar is one row (the EDHREC chip moved up; the health line left it); under the power bar sit only the health line and Show all details. Path to Apex, the 'Next: Budget, N power to go' line (now leading the pop-up's Health part) and Lands helper moved into Show all details; Best by job took Lands helper's place in the toolbar row. Show by impact in the pop-up closes it. Tests: quick check 12; UI-B81, B113, B126, B165 updated and passing (B81 had been failing since 0.9.29: the Fix buttons moved into the pop-up).

### Build 59 — 2 Nov 2026
- Deck Builder 0.9.33 (build 178): putting the app away with a deck open sends the edits to the online profile (the Deck Builder's hide handler calls `pushDeckEdits`), closing the last profile-sync gap. Tests: quick check 12, online_ui 40 (new: a deck renamed while open reaches the online copy when the page is hidden).

### Build 58 — 2 Nov 2026
- Deck Builder 0.9.32 (build 177): a Back button on every page (item 6) except the home screen and an open deck (which has All decks), and every page or tab change is a history entry, so the browser or phone back gesture returns to the previous page and closes an open pop-up (`trackSpot` and the popstate handler at the end of deck/ui/events.js; the button in render, deck/ui/cards.js). Pop-ups still close with their × (not a Back button). Tests: quick check 12, a back-navigation check. With this, all eight planning-chat items are done or checked.

### Build 57 — 2 Nov 2026
- Deck Builder 0.9.31 (build 176): searched cards replace by function (item 8). `bestCuts` (deck/engine/mana.js) marks cuts sharing the incoming card's jobs (`same`, why 'Also removal') and cards doing a job the deck is short of (`shortJob`); the search panel (deck/ui/cards.js) never offers a shortJob cut, ranks the same-job cuts by measured score change, and falls back to every cut when none shares the job or the deck is short of the incoming job. Item 4 checked: nothing hides Budget or Mid picks after a tier is passed (no pick is marked beaten; picks show whenever they raise the score), so no change. Tests: quick check 12, a bestCuts check on Wakanda Forever.

### Build 56 — 2 Nov 2026
- Deck Builder 0.9.30 (build 175): swap gains shown in power (`gainTxt` in deck/ui/upgrades.js: power = score as a share of the Apex build, as the bar), on upgrade chips, the swap sheet, alternatives and Path to Apex. Item 1 (power as the only headline) was already met. Tests: quick check 12, UI-ALT-01 and UI-B78-01 (updated to read power).

### Build 55 — 2 Nov 2026 — Deck Builder: health in one line, details in a pop-up
- Deck Builder 0.9.29: the planning chat's items 3 and 5 (Deck-Companion CHAT_TO_WORK_HANDOFF.md). One colour-coded health line,
  a short positive lead under the power bar, and a Show all details pop-up with the full picture; "Foundation" replaces "Starter".
  Still open from that list: 1 (power as the only headline number), 2 (swaps labelled in power), 4 (tier picks after a tier is
  passed), 6 (back button on every page), 8 (searched cards replace by job).

### Build 54 — 2 Nov 2026 — Deck Builder edits sync when a deck is closed
- Deck Builder 0.9.28: closing a deck saves it and sends the profile to the online copy on a linked device. Minimum tests
  (online_ui 39, Deck Builder quick check 12) by the owner's choice.

### Build 53 — 2 Nov 2026 — profile sync between devices
- Linked devices take the newer online profile when the app opens, and save it on the start screen, every minute and when put
  away. The profile now carries the online games list and the game in progress (single-device games; asked before it is
  continued on another device). Hosted games stay on their host (see "Paused: not finished", 4).
- Released with minimum tests by the owner's choice (listed in HANDOFF.md). Card counts unchanged.

### Build 52 — 1 Nov 2026 — iPad fix, then paused
- Deck Builder 0.9.27 (build 172): on iPad the header sat under the status bar and the frames ran under the screen's rounded
  corners and home bar. The page, the deck screen, pop-ups and the undo button now keep inside the safe area, and the deck
  screen's working area ends above the home bar. Desktop and Android look the same as before.
- Released with it (finished since build 51): the legend rule (its controller chooses which to keep), ward on activated
  abilities and ward "Pay N life", phasing, mutate, offline use after the first launch, QR pairing without internet.
- Card counts unchanged (top 1,000: 1,000; whole catalog: 21,001).

### Build 51 — 1 Nov 2026 — the top 1,000 complete
- Top 1,000: 969 → 1,000. Whole catalog: 20,892 → 21,001.
- The last 31 top cards: copy lands (Thespian's Stage, Shifting Woodland, Mycosynth Gardens), Dauthi Voidwalker (void counters),
  Kutzil, Ripples of Undeath, Return the Favor, Conduit of Worlds, Culling Ritual, Puresteel Paladin and Danitha (equip costs),
  Tibalt's Trickery, Hydroelectric Specimen, Trouble in Pairs, Archdruid's Charm, Springheart Nantuko, Life from the Loam (Dredge),
  Bloodchief Ascension and The Gitrog Monster (a "put into a graveyard" event for every way a card gets there), Inkshield,
  Buster Sword, The Soul Stone (harness, ∞), Ripples of Potential, Breach the Multiverse, Throne of Eldraine, Promise of Loyalty,
  Desperate Ritual (Splice onto Arcane), Cut a Deal, Moraug, Mechanized Production, Kardur.

### Build 50 — 1 Nov 2026 — batch 2
- Audit made honest: keyword lines are read without reminder text, so about 580 cards with by-hand keywords are no longer counted
  as automatic. Honest build 49 figure: 20,226. Build 50: 20,892 (+666). Top 1,000: 944 → 969.
- Engine bug fixed: "Target creature gets +X/+X and gains …" dropped the +X/+X (about 140 cards).
- Keywords: Bushido, Rampage, Afflict, Flanking, Battle cry, Annihilator, Dethrone, Melee, Mentor, Training, Evolve, Fabricate,
  Living weapon, Renown, Soulshift, Extort, Echo, Cumulative upkeep, Ingest, Backup, Myriad, Enlist, Provoke, Champion, Umbra armor,
  Outlast, Embalm, Eternalize, Transmute, Reconfigure, Craft, Disturb, More Than Meets the Eye, Prototype, Bestow, Surge, Strive,
  Read ahead, Amplify, Tribute, Ascend, Split second; plus many top-list wordings.

### Build 49 — 1 Nov 2026 — batch 1
- Known bugs fixed: extra mana of another colour (Utopia Sprawl, Wild Growth on a non-Forest, Fertile Ground); "you may tap or
  untap" no longer offers "Neither" after the yes/no.
- Gift, Hideaway, Imprint, casting copies, abilities granted until end of turn, Entwine, Escalate, Spree, Replicate, Casualty,
  Bargain, Offspring, Squad, and top cards (The Ozolith, Etali, Braids, Sevinne's Reclamation …). Top 1,000: 924 → 944.
