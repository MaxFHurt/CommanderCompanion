# Commander Companion — the whole roadmap

Every change still open across the app, in one place (written 2 Nov 2026, updated 7 Nov: live build 1.0.0-rebuild.66, Deck
Builder 0.9.40 build 185). Each section lists its items in the suggested order. Details and history stay in the documents named at the end
of each item; this file is the list. Update it when an item is done (move it to "Done" at the bottom with its build).

**Owner's rules for all of it** (full list in HANDOFF.md section 2):
- Work in batches; stop every 500 newly automated cards to check in (owner, 12 Nov; was 100). Nothing is to be left resolved by hand (owner, 12 Nov).
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
**Online-game privacy — done, build 76 (owner: "pass turns to a player offline… but I cannot pay"):** new online games run
on a rules server, a Supabase Edge Function on the owner's free Supabase project (2 s CPU per request; one move takes about
35 ms cold). The game is dealt there and lives only there; each device sends its moves and gets only its own player's view,
so no device ever holds another player's hand or library. Seats have private keys (the server keeps their hashes); the
online profile carries them to the player's other devices; a device with only the code gets names, never a view. Moves
need a connection (offline moves are refused, not queued). Games made before build 76 carry on the old way on the Worker.
Tried first: the Cloudflare free plan (10 ms CPU) cut off heavier requests, so it was not safe to rely on.

---

## Order of work (owner, 13 Nov: "All judgement tools should come last on actual changes, right before the code
optimization. That way we don't have to rework anything later due to new mechanics.")

1. **Features and screens** that are not judgement: 1.4 device checks, 4, 4b, 7, 7b, 7c, 7f.2, test-suite speed.
2. **Card rules and mechanics**: section 2 (the long tail, the mechanics still by hand: Connive, Forage …).
3. **Judgement tools**, once the rules are complete: deck score, card strength and the power bar's marks, mana rules,
   upgrade reasons, Fix menu picks, generator picks, game-plan awareness (6, 6b, 7f.3, 7f.5, 5.1-5.2). Parked work for this
   step: `rebuild/wip/README.md`.
4. **Optimise all the code** (section 99), after everything else.

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

1. **The card long tail:** 22,630 of 32,300 Commander-legal cards run by themselves (build 103, batch 2: 679 more; 178 of batch 1's 272 sent-back cards restored, 94 left). Build 101: 21,958 ( batch 1 of 12 Nov on that day's Scryfall file: 237 newly automatic, 272 misread cards sent back to by hand; PROGRESS.md). Before: 21,695 of 31,836 (build 89, 8 Nov; was about 21,500) (top 1,000: all; build 78 added 171 and build 79 269,
   most-played first: Earthbend, Discover and energy payments inside effects, wipes with qualifiers, "equal to" amounts,
   Syphon Mind, Noxious Gearhulk, Kozilek, Soul Shatter, Homeward Path, Balefire Dragon …). About 10,270 still need
   something done by hand. Work most-played first, in batches of wordings (each covers a few dozen cards); Forge's scripts are
   the answer key. Tools: `tools/rules-audit.mjs`, the Scryfall bulk file split into 4 chunks. (RULES_AUDIT.md, PROGRESS.md)
2. **Mechanics still resolved by hand** (build 79 did the medium round: Rooms (doors unlock as a special action; "When you
   unlock this door" fires; 28 Room cards, 4 left by hand), flip cards ("flip this creature", ki-counter flips), time travel,
   Classes' and energy cards' wordings (Druid Class, Paladin, Sorcerer, Warlock, Guide of Souls, Lightning Runner …), and
   Echo/Cumulative upkeep paid with a choice ("Sacrifice a creature", "Discard a card": asked whether to pay, then which
   cards; Cumulative upkeep asks for one per age counter). Build 86: Cumulative upkeep costs an opponent takes part in (Wall
   of Shards, Varchild's War-Riders, Sheltering Ancient: the opponent chosen again for each age counter), suspend given by
   other cards (Delay, Jhoira of the Ghitu, Taigam), "you may pay any amount of {E}" (Galvanic Discharge). Still by hand:
   Herald of Leshrac and Jötun Grunt's upkeep costs, Clockspinning, flip conditions the game doesn't track (Rune-Tail's 30
   life, "enchanted by two or more Auras"), splice, cipher, attractions/stickers, banding, haunt, assist, forecast, and
   anything the terms key marks "manual" or "partial".
3. **(Done.)** **Known rule limits:** Moraug, Kardur, copied lands, Dredge for other players' draws, Echo/Cumulative upkeep
   action costs (build 68); costs that need a choice (build 79); costs an opponent takes part in, and card data cached before
   build 28 (split/adventure costs repaired on load; build 86).
4. **Measure which cards real decks resolve by hand most** (from played games) and automate those first. No data yet: the shared rulings store
   is empty (7 Nov), and the app sends nothing else about hand resolutions. Recording that would mean sending play data, so it
   needs the owner's say. Until then the order is EDHREC popularity (`tools/rules-audit.mjs` on the Scryfall file).

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
1. **(Done, build 69.)** Engine side, screens, and Worker deployed (`sh cloud/deploy.sh`); commits 6d3b374 and 0137f90.
(PROGRESS.md "Paused: not finished" 1)

## 4. Multiplayer and sync

1. **(Done, build 70.)** **Hosted games between devices** (owner, 2 Nov: later): moving an in-person hosted game (room code or QR pairing) to
   another device means handing over the host role mid-game: the old host stops (or becomes a player), the new one reopens
   the room with the same code, every connected device follows. Single-device games already travel with the profile
   (build 53); online "play over time" games live on the Worker and their list travels with the profile.
2. **Online games privacy:** each device holds the whole game (it runs the rules), so someone using developer tools could
   read other hands. **Done for online games, build 76** (top of this file): they run on the free Supabase rules server.
   Hosted live games: each phone is sent only its own view (other hands hidden); only the host device itself holds the
   whole game in memory (readable with developer tools, never shown), so it matters only when someone plays on the host
   device. Hosting on a device nobody plays on avoids it.
3. **Native iOS wrapper with Multipeer Connectivity** (true Bluetooth): on hold (owner, 1 Nov). Needs an Apple Developer
   account and a Mac.

## 4b. Card data job

1. **(Done 7 Nov; schedule moved to minute 17.)** **Merge the card-data job change into Deck-Companion `main`** (branch `claude/card-effects-fixes-rcosbu`, commit 3a9d2c0):
   the daily `cards.json.gz` then also keeps battles' defense, reprint and printed (flavor) names. The app works without it.
2. **(Checked 7 Nov, build 77.)** Every run since the schedule change succeeded (the push runs of 7 Nov 10:58 UTC); the first
   run at the new time is 8 Nov 09:17 UTC (4:17 a.m. New York). Before the change the scheduled runs started 7-8 hours late.
3. **(Done, build 77.)** The job also asks the online-games rules server for a code that does not exist (a read of the games
   table) on every run, so the free Supabase project is used every day and never pauses for a week without use.

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
1. **(Done, build 80.)** Rebuilt with build 79's engine, the engine list adds only 2 cards, both wrong (Chainer and Goblin
   Pyromancer destroy their own Nightmares/Goblins), so it was kept as it was. The engine's wipe and protect readings were
   mostly wrong (Maelstrom Pulse as a wipe, self-hexproof as protection). The comparison's real use was the other way: 129
   Deck Builder misreads fixed (0.9.48) — draw triggers ("Whenever you draw a card, …": Sheoldred, Bowmasters, Smothering
   Tithe) are not card draw; a target you own or control (blinks, Staff of Compleation) is not removal; Demonic Consultation
   is not a wipe. Benchmark: holdout 0.325 → 0.334, test 0.317 = 0.317, tuneall 0.281 → 0.280 (owner: ship it, 8 Nov).
   Earlier (build 70): lists.js ENGINE_ROLES fills cards the reader gives no role. **Use the game engine's card reading in the Deck Builder:** feed it the game side's compiled effects for every card the
   rules engine understands, for better roles (ramp, draw, removal, wipes, protection, finishers) and theme tags. Biggest gain
   for the effort. Measure with the Deck Builder benchmark (`bench.js`, must not drop) before shipping.
2. **(Done, build 81: measured, kept as a reason only.)** Counting the cards in the deck an upgrade works with (library.js
   ixDeckMatches, the card window's "Works with" interactions) at 0.1–1 per card, capped at 2 or 6, never raised agreement
   with the expert lists (tuneall 0.280 → 0.277 at 0.3, 0.265 at 1; test and holdout the same or lower), as with synergy
   with the commander (UP.syn) before. An upgrade that works with 3+ cards in the deck now says so ("Works with N cards in
   the deck"); the score is unchanged. Earlier (build 71): "Works with" in the card window. **Card interactions from triggers:** pairs where one card's effects set off another's triggers (sacrifice outlets with
   death triggers, token makers with "whenever a creature enters", spells with cast triggers…) count as synergy, and the card
   window says which cards it works with. Builds on 1.
3. **(Done, build 99, 12 Nov.)** **Real practice
   games:** full games with the game engine and bots (as `soak.mjs` does) to measure how a deck performs,
   beyond mana and curve. Most accurate; slow in a browser, so run in the background helpers and keep the goldfish numbers
   as the fast first answer. Builds on 1.
   What was built: `src/game/bot.js` (a steady casual player: keeps 2–5 lands, plays a land then its biggest spell, attacks
   that don't lose a creature for nothing or that are lethal, blocks to survive or trade up, removal at opponents, declines
   optional sacrifices, counters big spells), `src/game/practice-match.js` (playMatch: one seeded, repeatable game; loops are
   cut off at 500 moves a turn and reported), `src/game/practice-cards.js` (the Deck Builder's card rows back into game cards),
   `deck/match-worker.js` (a module worker; the page splits the games over up to 3 of them). In the Deck Builder: Build stats →
   Practice games → **Games against other decks** (owner, 12 Nov: "simulating your newly built deck vs any other deck in your
   deck library including precons"): up to three opponents, each one of the player's own Commander decks or a built-in precon
   ("No player" for a smaller game, so 1-on-1 works); 6 games; shows wins, average winning round, round knocked out, commander
   cast round, spells and damage, and the cards the engine left to be resolved by hand (skipped by the bot). About 3–4 s a
   4-player game on a laptop core (6 games ≈ 10–40 s across 3 workers). Tests: `tests/node/practice.mjs` (20 checks: card
   conversion, bot choices, 4-player and 1-on-1 precon games with no problems, same seed = same game). The hand-resolved list
   is also data for 2.4 (which cards to automate next): e.g. Orcish Bowmasters, Laboratory Drudge, Frontier Siege.
   Not done: the deck score does not use these games (too slow and too noisy at 6 games); offline, the worker needs the game
   files cached (the service worker precaches every file, so this should hold, but it was not tried on a device).

## 6. Deck Builder

1. **Smarter deck score** (large, discuss first): close the gap to top tournament lists at Apex (about half our cards match;
   we miss fetch lands, original duals, fast mana, free interaction, tutors and win cards; we include protection equipment,
   slow rocks, wipes and big creatures they never play). Must be measured against the upgrade benchmark and the tournament
   comparison before and after. (deck/ROADMAP.md "Queue", Large 3)
2. **Open questions for the owner** (deck/WORK_SESSION_HANDOFF.md section 0):
   - (Answered 9 Nov: keep it as it is.) The Apex rule against players: keep, or review the biggest score finds (Archpriest
     of Shadows, Evolution Witness, The Soul Stone…) in case the score overrates them.
   - (Answered 8 Nov, build 82.) The upgrade list is kept after a swap (owner: "Apex suggestions should not change based on an
     upgrade I made of a mid or budget quality"): the row keeps its higher tiers, shows the card you put in (In your deck)
     and the card you took out (a red Replaced chip); the list is worked out again only on Regenerate or another change.
   - (Done, Build 95.) Speed: each card's reading is kept between launches and the background core reuses
     it (phone speed: every card ready 37.8 s -> 1.4 s, opening a precon 47 s -> about 24 s); the library was already sent to the
     background core once at launch (Build 143).
   - (Answered 9 Nov: "The engine should see all plans.") Plans the engine can't see yet: fliers, defenders/toughness, goad,
     untap and opponents' cards were already in (engine v2, 20 Oct); Big creatures switched on and Keyword counters added (both
     offered, not picked for a deck on their own).
   - Do the reasons on cards read the owner's commanders correctly?
   - (Answered 9 Nov: "either".) Should alternatives be matched to the card going out rather than to the pick? See
     alternatives now lists cards doing either card's job, in the pick's price band. (guide blind spots: Sheoldred and Yawgmoth
     for Doom, Swords to Plowshares for Turtle Power, Brightglass Gearhulk for Wakanda)
   - (Answered 10 Nov, replacing 9 Nov's "match EDH": "If our deck needs mana to swing because of its current state we need to
     adapt to the deck's mana needs".) Land count: a deck with most of its spells follows its own mana needs (our formula:
     average mana value, cheap ramp, landfall); a deck still being built starts from the commander's EDHREC average.
3. **(Done, build 68.)** **Printings (build 67 system):** owned cards (the library keeps names only, so "the printing I own" cannot
   win yet: store set + number when cards are added to the library, then make it rule 2b); built-in precons (lists.js) get
   their printings only through the by-name EDHREC lookup on opening (store set + number in lists.js instead); generated
   decks and upgrade swaps use the commander's set or the default printing by design.
4. **(Done: the first two in build 68, the third in build 77.)** **Upgrades page polish (from this week):**
   - The card window's lead swap shows no reason line; add "The swap this upgrade suggests" when opened from a row.
   - Path to Apex inside Show all details repeats the health list below it; fold the two together.
   - The green + is decided from card tags; check its picks against the Fix menus (which measure each swap) and use the same
     rule if they disagree. Build 77: they disagreed on lands (the + marked lands that always enter tapped, which the Fix menus
     take out, and lands making none of the deck's colours) and on Win routes (the fix also offers the missing card of a
     winning combo). The + now uses the Fix menus' rules (ui/upgrades.js fixesMore, comboWins); test UI-B192-01.
5. **Known limits:** checking upgrades takes about 1 s more per deck (2–3 s on a phone); opening a card for a full deck takes
   about half a second; deck history records only changes made through the app's buttons.
6. **Suite speed:** (Done, Build 95.) The full live run 83 min -> 36 min: independent checks 3 side by side,
   cisweep 1,466 s -> 623 s and genstrong 727 s -> 250 s split across 3 processes; every number identical. Still open: the
   UI suite itself (about 650 s on 3 browsers) needs less work per test (fewer practice games, a smaller card library).

## 6b. Game-plan aware Deck Builder (owner, 13 Nov)

Owner: "The app needs to be gameplan aware for decks also. Some functions such as web-slinging instigate reactions from other
effects. If I keep putting cards into my hand I'm either trying to force a discard OR I'm using spells that have an entering
trigger. ... There are a lot of actions and interactions that are just looking for keywords and not actual gameplay aware."

Today the Deck Builder reads cards mostly by keywords and EDHREC theme pages (themes, reasons, synergy, Fix menus). Goal: read
what the deck actually does: chains of enablers and payoffs (bounce to hand → re-cast / enters triggers; filling the hand →
discard outlets, madness, "no maximum hand size", or hand-size payoffs; sacrifice outlets → death triggers; tokens → enters
triggers), so plans, synergy, upgrade reasons, Fix menus and generation follow the deck's real game plan.
1. Design first (owner approves before building): how plans are detected (game engine's compiled effects and triggers, section
   5, rather than keywords), what each part of the app does with them, and how it is measured (owner's decks, the upgrade
   benchmark, tournament match).
2. Build in batches; each batch measured. Builds on 5.1-5.2 (engine readings, card interactions from triggers).

## 7. Look and layout

1. **(Done, build 72: the last unused rules removed; the override sections had already been folded; pixel-identical.)** **Stylesheet cleanup:** fold `styles/app.css` override sections 16–32 into their base rules, checked pixel-for-pixel with
   `tests/style_diff.py` (and the Deck Builder's `cc-theme.css` appended sections into its base rules).
2. Anything the real-device checks in section 1.4 turn up.

## 7b. Profile page clean-up (owner, 10 Nov; 7b.1 done, 7b.3 built, not live)

1. **(Done: Settings → Backup, built on branch claude/vibrant-faraday-9fv5in, build 104.)** **Profile page clean-up:** anything not about the player moves off the page or goes. List the page's sections and have the
   owner confirm what goes before removing anything.
2. Sign-in and automatic saving: dropped (owner, 10 Nov: "If it's already transferable by profile key, then none of this is
   necessary"). The profile key already backs a linked device up automatically. Offered instead, not decided: a warning on a
   device that is not linked (its data lives only there) and a reminder to keep the key safe.
3. **Recovery email (owner, 10 Nov: "We should tie the profile to an email or phone number also"):** a player can add an email
   to the profile (optional, prompted on the profile page); a lost key is recovered with a sign-in link sent to that email
   (Supabase on the owner's project; free at this volume). Phone (SMS) later if wanted: it needs a paid SMS service. The key
   keeps working as now; the email only finds the profile again. Checks: both apps' tests, recovery tried on a second device.
   **Built (recovery branch, not released):** Settings → Backup → Online has a Recovery email row (add/change/remove) and "Lost your key? Recover by email";
   `src/app/profile-recovery.js`, Supabase Auth email links (magic link) by plain fetch; the tapped link returns to the app with ?recovery=link|recover|unlink and the token in the hash, table + row rules in `cloud/supabase-recovery.sql`.
   **At release:** apply that SQL; paste the project's anon key into `SUPABASE_ANON_KEY`; Auth → URL Configuration: site_url and redirect allow-list `https://maxfhurt.github.io/CommanderCompanion/rebuild/**` (no template change; the free plan cannot edit it);
   later a custom SMTP sender (the free default allows a few emails an hour). Test: `tests/recovery_ui.py`.

## 7c. Landing buttons: use the owner's original art (owner, 10 Nov)

The six landing buttons (assets/img/landing/*.png, about 830 x 250 px) were cut from a landing mock-up on 4 Oct (commit
0580abe) with a flat black box pasted over each label area; that box covers the inner edge of the frame, and the images are
blown up about 3x on an iPhone, so the frames look soft and doubled. Next: the owner re-sends the original button files (at
least about 2,500 px wide, or SVG); put them in unchanged, check phone, iPad and PC sizes (and an ultra-wide screen, where the
landing stretches), and use the same art for the other screens' buttons (mode select, Profile, Settings use one stretched
frame, ui/button-frame-large.png, with typed labels).

## 7d. Clearer deck generation (Done, build 97, live in 98: setup pop-up for empty decks, plan listed to add) (owner, 10 Nov: "If you don't know where to look, you don't know where to start")

1. **Setup pop-up on first generation:** after choosing how to make a deck (the mode), the criteria (commander or colours,
   tier, mechanics/themes, owned cards, budget) open as a pop-up that walks the player through them the first time, instead of
   being spread over the page.
2. **Empty decks fill by suggestion:** a player who starts an empty Commander deck (or an empty Standard deck) sees every
   remaining card of a base-level (precon-level) build as upgrade suggestions to add, with no replacements (no cuts) until
   the deck is full; each can be added on its own or all at once.
3. Before building: confirm with the owner the pop-up's steps and wording, and whether the precon-level fill uses the Budget
   tier's prices. Checks: generator benchmarks (genstrong, tourney), UI suite, phone and iPad layouts.

## 7f. Owner's reports of 12 Nov (Build 100)
1. **(Done, Build 100.)** Heralds of the Shredder read as Vigor in the decklist.
2. **Decklist images slow (Build 100: pictures load lazily):** not reproduced in Chromium; owner to say whether it is better on the
   phone, and if not: which deck, how long, Wi-Fi or cell, and whether only on the first open after an update.
4. **(Done, Build 102.)** The Upgrades tab's number did not match the cards listed to replace.
5. **Deck score to agree with the strongest version (owner, 12 Nov: "make the score match the strongest version of the deck"):**
   the score's synergy part rewards cards specific to the commander, so strong staples (Sol Ring, tutors) lower it, and its card
   quality part measures against the engine's own Apex reference, not the strength build. Next, before item 3 ships.
3. **Generated Apex deck at power 66 with 28 upgrades (owner chose the strongest version, 12 Nov; built on branch team/apex):** power and the upgrade list use the strength
   builds (Build 93), the generator does not. Built and reverted (commit 8fa9ab2): finishing generated decks on the strength build
   (power 100), which swaps 59-76 of the generator's cards and lowers the engine's score (Turtles 91 -> 77, synergy 100 -> 62) and
   needs Theme first, the land formula, no-play-data decks and building ahead reworked (five tests). Other way: generate with
   the strength values from the start. Owner to choose.

## 8. Needs the owner's approval before any work

- **The corrections report** (rule corrections players send in, read with the dev PIN): nothing from it is fixed without the
  owner's say.
- Deck Builder "discuss first" items (section 6.1 and 6.2).

---

## 99. Last of all: optimise all the code (owner, 13 Nov: "When we are completely done with the roadmap all code needs optimization")

After ALL other roadmap work is done, including the rules long tail, the game-plan work (6b) and section 8 (owner, 13 Nov: "Make sure the optimize all code is at the end of ALL roadmap work"): a pass over the whole codebase (game app src/, Deck Builder deck/, cloud/, tests) for speed,
size and duplication, with no change in behaviour. Measure first (load time on a phone, bundle sizes, background-core time,
suite time), change only what the numbers point to, and prove each step with the full suites and the benchmarks unchanged.

## Done (recent, newest first)

- Build 102 (Deck Builder 0.9.67, build 212): the Upgrades tab counts the cards the page lists to replace.
- Build 100 (Deck Builder 0.9.66, build 211): decklist names follow the printing the picture shows (Heralds of the Shredder); card pictures load as they come into view.
- Build 99 (Deck Builder 0.9.65, build 210): real practice games: your deck against any of your decks or the precons, full bot games on the rules engine (5.3).
- Build 98 (Deck Builder 0.9.64, build 209): top bar re-checked on every layout change; Flip chip on two-sided cards (Reverse for reversible).
- Build 97 (Deck Builder 0.9.63, build 208): the top bar fits every screen; Profile clean-up (Settings pop-up for engine and card data); Set up your deck pop-up for empty decks with the full build listed to add (7d).
- Build 96 (Deck Builder 0.9.62, build 207): typing no longer interrupted, practice games once per deck, I don't have this card
  shows real variations (the wait-for-data rule for the upgrade list is built but off) (owner, 10 Nov). Next week: options C + D (upgrade list
  on the background helper, built ahead).
- Build 95 (Deck Builder 0.9.61, build 206): health fixes only in the Health pop-up, land target from the deck's own mana
  needs, card readings kept between launches (precon opens in about half the time), full test run 83 -> 36 min (owner, 10 Nov).
- Build 94 (Deck Builder 0.9.60, build 205): Fix menus and alternatives by card strength (either job), EDHREC land target,
  all plans seen (Big creatures, Keyword counters), on-theme spare rows, benchmark scores the list players see (owner, 9 Nov).
- Build 93 (Deck Builder 0.9.59, build 204): card strength on: deck power and the upgrade list from the strength builds
  (Apex like tournament decks, Budget and Mid as cheaper versions of it), following every deck rule (owner, 9 Nov).
- Build 92 (Deck Builder 0.9.58, build 203): Health pop-up with the fixes in place, one section per problem (best fix,
  options, a 'for now' card); card strength built but off until its picks follow the deck rules (owner, 8 Nov).
- Build 91 (Deck Builder 0.9.57, build 202): pop-ups on iPhone and iPad keep every part in their scrolling body (the card
  window's details were squeezed to nothing on a phone held sideways); a search's list of cards stays open through background
  redraws, so a tapped result is not missed; a tap outside a search closes its list (owner, 8 Nov).
- Build 90 (Deck Builder 0.9.56, build 201): card quality shown as the deck's rating against its Apex build by what the cards
  do (synergy, balance, ways to win, mana), not popularity; upgrade picks unchanged.
- Build 89: 18 more cards (21,695 of 31,836): triggers that never fired (Niv-Mizzet, Visionary; Glaring Fleshraker; Argent
  Dais; Tome of Legends), token colours, Planar Genesis, Peer into the Abyss, Ad Nauseam.
- Build 88 (Deck Builder 0.9.55, build 200): deck history across devices and windows; the card window opens at once.
- Build 87 (Deck Builder 0.9.54, build 199): health fixes shown at the top of the upgrade list.
- Build 86: 148 more cards (21,677 of 31,836): Galvanic Discharge, suspend from Delay/Jhoira/
  Taigam, Cumulative upkeep costs with an opponent, old cached split/adventure costs repaired, and long-tail wordings (Lairs,
  Blackmail, Disallow, Scarab God, Pestilence, damage equal to a land count …; PROGRESS.md).
- Build 85 (Deck Builder 0.9.53, build 198): search finds cards by printed (flavor) names, including ones published after the build.
- Build 84 (Deck Builder 0.9.52, build 197): mana stuck only when nothing could be cast for colour; health warnings red only
  when severely short; a reskinned commander (the Miku precon) shown under its printing's name and art everywhere.
  Open from this round (owner, 8 Nov): health fixes in the upgrade list (done, build 87);
  card quality by what the cards do, not popularity (done, build 90: shown, not scored; scoring picks by it lowered the
  benchmark to 0.221/0.203/0.287, so the owner chose display only, and UP.qEff stays off); card search
  finding newly renamed printings (done, build 85).
- Build 83 (Deck Builder 0.9.51, build 196): tokens the deck makes listed at the bottom of the decklist, not counted in the 100.
- Build 82 (Deck Builder 0.9.50, build 195): the upgrade list stays after a swap; the row shows Replaced and In your deck.
- Build 81 (Deck Builder 0.9.49, build 194): upgrades say how many cards in the deck they work with (measured: not scored).
- Build 80 (Deck Builder 0.9.48, build 193): 129 card-role misreads fixed (draw triggers, own-permanent targets, Demonic Consultation).
- Build 79: Rooms, flip cards, time travel, Echo/Cumulative upkeep paid with a choice, Class and energy wordings (269 more cards).
- Build 78: 171 more cards run by themselves (the long tail, most-played first).
- Build 77 (Deck Builder 0.9.47, build 192): the green + follows the Fix menus' rules; the card-data job keeps the free
  rules server awake; the job's schedule checked.
- Build 76: online games on the free Supabase rules server; no device holds another player's hidden cards.
- Build 75: Modular, Companion, voting, Suspect, Devour, Sunburst, Awaken.
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
