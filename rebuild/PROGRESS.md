# Card automation progress

Updated with every push (owner's rule, 1 Nov 2026). Newest first. Counts come from `tools/rules-audit.mjs`: the top 1,000 from
`tests/fixtures/top-commander-cards.json.gz`, the whole catalog from the Scryfall Commander-legal list (31,770 cards, split into
4 chunks and run in parallel). New wordings live mainly in `src/engine/effects-b49.js` and `src/engine/keyword-triggers-b49.js`;
tests are in `tests/node/catalog.mjs`. See HANDOFF.md for architecture and release steps.

## Where it stands

- **Live build:** 1.0.0-rebuild.94 (Deck Builder {"build": 205, "version": "0.9.60"})
- **Top 1,000:** 1,000 run by themselves (all done).
- **Whole catalog:** 21,695 of 31,836 (about 68%; Scryfall oracle file of 7 Nov 2026, build 89, measured 8 Nov); about 10,140 still need something done by hand. It is a long tail: the
  commonest remaining wordings cover only a few dozen cards each. Before this round: 21,529 of the same file.
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

### Next build (on the branch `claude/commander-companion-roadmap-ilkx1o`, not live)
- Deck Builder speed (roadmap 6.2, owner 9 Nov: 'Do 1, 2, and 3'): each card's reading (tags and functions) is kept between launches in the browser's storage (about 2.8 MB, keyed by build, engine settings and each card's text), and the background core reuses it. At phone speed (4x slowed): every card ready 37.8 s -> 1.4 s on the next launch, opening a precon 47 s -> about 24 s, the background core's warm-up 15 s -> 0.2 s. Readings match a fresh reading exactly (all 32,115 cards in Node; a sample in the browser, test UI-READS-01). Sending the library to the background core once at launch was already done (Build 143).
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
