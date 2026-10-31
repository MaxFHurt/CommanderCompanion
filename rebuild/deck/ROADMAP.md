# Deck Companion roadmap

Live: Version 0.9.3 (build 148). Next: the engine redesign, kept off the live app until it makes better choices (plan: https://claude.ai/code/artifact/d9cbe86d-e5af-49e5-ad89-e76e8ada72be). Each item ships as its own build: build, run the full test suite
(`tools/tests/suite/README.md`), then go live only if nothing fails.

## Queue (smallest first)

Proposed order (12 October 2026): small items first, quickest first within each size.
Items marked "discuss first" need the owner's decision before they are built; the real-device check needs the owner's phone and iPad.

### Small

2. **Real-device check**
   - *You'll see:* nothing new: confirmation that card pictures, symbols and layout look right on a real phone and iPad.
   - *Builds on:* all screens.
   - *Size:* Small. *Upgrades engine:* no.
   - *Risks:* the test environment blocks the image server, so this needs the owner's phone and iPad or a test run with images allowed.
   - *Tested by:* screenshots on real devices of every main screen.


### Large

3. **Smarter deck score**
   - *You'll see:* better suggestions in every list, and fewer odd "Unpopular pick" chips.
   - *Builds on:* the deck score (synergy, balance, card quality, ways to win, practice games).
   - *Size:* Large. *Upgrades engine:* yes, discuss first.
   - *Risks:* any change moves every suggestion; it must be measured against real players (upgrade benchmark) and against top tournament decks (see findings below) before and after.
   - *Tested by:* the upgrade benchmark (must not drop), the tournament comparison below (should rise), and all suite checks.
   - *Findings, top tournament decks (October 2026):* 10 popular tournament commanders, our Apex "Best
     overall" deck compared with 20 top-16 tournament lists each (EDHTop16, events of 48+ players, last year).
     - About **half** our cards match the tournament lists (51% on average; best Tivit 69%, Thrasios/Tymna
       67%, Sisay 63%; worst Vivi 36%, K'rrik 37%, Yuriko 38%). We include 59% of the cards most lists share.
     - What we miss most: **lands** (fetch lands, original duals, Ancient Tomb, Urza's Saga, Cavern of Souls,
       Gemstone Caverns), **fast mana** (Mox Diamond, Chrome Mox, Mox Opal, Lotus Petal, rituals), **free
       interaction** (Force of Will, Mindbreak Trap, Pact of Negation) and **tutors and win cards** (Demonic
       Consultation, Tainted Pact, Thassa's Oracle).
     - What we include that they never play: protection equipment (Swiftfoot Boots, Lightning Greaves),
       slow mana rocks (Thought Vessel, Commander's Sphere, Mind Stone), board wipes and big creatures.
     - Why: two thirds of the cards we miss are played by under 30% of EDHREC decks for that commander, so
       popular picks don't lead to them; and the deck score doesn't favour them either (adding them in place
       of our weakest card raised our score only 17 times in 80).
     - Mid decks fall further behind (Winota 57% to 45%, Lumra 44% to 29%, Yuriko 38% to 32%), because many
       tournament staples cost far more than $12.
     - Note: tournament decks are the strongest level of play (Bracket 5). The owner ruled (17 Oct) that there is no
       tier above Apex: Apex is the best version of the deck, so closing this gap is Apex work.

## Decided by the owner (12 October 2026), to build in this order

1. ~~Our own land formula~~: done in Build 114.
2. ~~Game Changer rows: trim~~: done in Build 115.
3. ~~Phone layout~~: done in Build 116.
4. ~~Smarter deck score, stage 1~~: done in Build 118 (tournament comparison: match 49% to 57%, core 45% to 55%; benchmark unchanged).

## Done from the parked list

- ~~Visible practice games~~: done in Build 136 (owner: "finish the road map"). Build stats tab → Practice games:
  a 100-game summary (short of lands on turn 5, stuck on a colour, flooded, mulligan, commander turn), then one game's
  opening hand, mulligan and first 8 turns (draw, land, spells cast, mana used of available), with Deal another game /
  Previous. It uses `practiceGames`, a step-by-step copy of `simulate`; `simulate` is unchanged and a test checks the
  two agree game for game.

## Builds 137-139

- Owner's iPad report: Fix Mana offered Thriving Isle -> Wooded Foothills (+0.3) in the five-colour Turtle deck. Three bugs:
  in the practice games every fetch land made all the deck's colours (Wooded Foothills can only find Mountains and Forests);
  "choose a colour" lands counted as one colour (Thriving) or none (Big Apple, 3 a.m.); and the mana fix list never checked
  that the new land makes the colours the old one made. Fixed (UP.lfix): fetch lands make what they can find in this deck,
  chosen-colour lands make their colour plus the one the hand needs, and a mana fix must keep every colour (landCovers).
  Spell benchmark unchanged; of the benchmark precons only Turtle Power's practice games change (stuck on a colour 18% -> 16%).
- Build 138 (owner: the Mana fix offered a swap, but the card's window said its best swap was a different card): the card window
  measured a land swap with the old practice games (so the mana change was never measured) and weighed its own set of cuts.
  Now one method (landRank) serves both: lands that keep every colour (6 best by the quick guess) plus, when the deck runs short
  of lands (practice games out of lands by turn 5 in 8%+ of games, or under the land target), its 3 weakest spells; each measured
  with fresh practice games and remembered, so both show the same swap and the same number. The Mana fix opens at once and fills
  in when ready (about 3 s on a desktop).
- Full-pool measurement (`fullsearch.js`): scoring every legal same-job card finds a higher-scoring card than the app measured
  in 62 of 80 slots (mean gap 0.4), nearly all run by under 10% of players; many look wrong (Kozilek in Avengers, Quilled
  Greatwurm in Turtles, Nissa, Vital Force in 5 of 8 Ghalta slots) because the deck score credits any big creature as a way
  to win and stacks multi-job credit. Plan agreed with the owner: fix those score blind spots first, then a background full search
  whose best find is always shown (Highest score / alternative); the Apex pick keeps score + popularity.

- Build 139 (owner: "the engine must know every keyword and understand the commander"): `tools/rules/` holds the
  Comprehensive Rules (2026-09-25), `keywords.json` (all 264 keyword actions and abilities with their rules text, 61 ability
  words, 741 glossary terms) and `MECHANICS_NOTES.md` (how to read a commander; tokens; triggers and doublers; counters;
  graveyard; combo patterns; rules that change deck building). Engine: KW_THEMES maps theme-defining keywords to the app's
  themes (UP.kw, on: benchmark equal or better, tuneall sum 8.69 -> 9.01); commanderEngine reads what a commander makes (token
  kinds, creature tokens and their type, counters, cards into the graveyard), what sets it off and whether it sacrifices;
  engineFit judges a card as doubler / payoff / enabler and the reason is shown on the card. Using the fit in the score was
  benchmarked and does not pass yet (in the deck score: tuneall 0.238 -> 0.234; as a candidate bonus UP.kwB 0.5: @10 0.124 ->
  0.123, holdout sum 15.0 -> 14.5), so it stays a shown reason (UP.kwB 0, UP.kwS 0) until a version passes.
- Synergy ceiling (owner's Symbiote Spider-Man deck): 10 of 26 precons sit at the synergy part's maximum, where better-fitting
  cards cannot raise the score. Settled in Build 140 (owner: "find the best option; if this is it, so be it").

## Build 140 (18 October 2026)

Owner's answers to the open questions: 1 find the best ceiling version; 3 yes; 4 yes; 5 yes; 7 yes; 8 iPhone screenshots sent.
- **Synergy ceiling** (UP.unc 0.25, UP.uncTail 1): swaps are compared past the parts' maximum at a quarter of the rate, and a row
  whose gain shows only past the maximum goes after every row with a real gain on the shown score. Versions tried (benchmark,
  each alone): unc 0.1 / 0.25 / 0.5 / 1, uncPick, synergy part only, tail order, repairs on the shown score (uncR). The tail order
  removed the @5 dip (0.236 -> 0.238); unc 0.25 + tail was best: tuneall @10 0.124 -> 0.121, test sum 6.84 -> 6.69, holdout sum
  15.0 -> 15.75. Combined with the blind-spot fix below, every agreement number matches or beats Build 139; only test's whole-list
  sum stays lower (6.84 -> 6.69, weighted 7.73 -> 7.59), the exception the owner accepted.
- **Over-budget warning:** the card window says "Over your Budget limit ($3)" / "Over your Mid limit ($12)" once, at the top where
  the swap is offered (in the Price line when there is no swap box); never in an Apex deck. Price bands now use the owner's
  strict limits there too (Budget under $3, Mid under $12; it said "fits Budget" at exactly $3).
- **Reanimation engines** (UP.reF): The Soul Stone (once harnessed), Sheoldred, Whispering One and other every-turn reanimators,
  and mass reanimation (Living Death, Rise of the Dark Realms) count as recursion and a way to win. Benchmark equal or better
  (holdout sum 15.0 -> 15.05).
- **Score blind spots** (UP.bs, bsF 0.5, bsP 9; from the whole-pool measurement): a creature that is a finisher only for its size
  counts half of one that wins by what it does; a card costing 9 or more is not counted as protection (Kozilek's counter, Krang's
  indestructible); a planeswalker's ultimate (minus 5 or more) is not one of its jobs (Nissa, Vital Force is ramp, not card draw).
  Kozilek in Avengers: +0.89 -> +0.20 (Rhystic Study +0.34). Tuneall @5 0.238 -> 0.244, @10 0.124 -> 0.127; holdout sum 15.0 ->
  14.95. Versions tried: bsF 0.5 / 0.75, bsP 6 / 7 / 8 / 9 / off.
- **Alternatives matched to the card going out** (UP.altCut 2): a row's alternatives may do the pick's job or the job of the card
  coming out (Path to Exile for Palace Jailer); the pick itself is still chosen from cards doing the pick's job (letting the wider
  pool choose the pick cost test @5 0.303 -> 0.301). Guide check: guide cards offered 52 -> 55, popular guide cards missed 21 -> 16.
- **Ramp cap in generated decks** (UP.rcap 2): after the mana base, ramp over target + 2 gives way, weakest pure mana card first
  (not on theme, not a seed or owned), to the best spell that makes no mana. Generated decks: ramp over target 3.3 -> 1.7 on
  average; tournament comparison match 55% -> 55%, core 54% -> 53%, mid 50% -> 49%; strong-deck typicality 0.398 -> 0.396 (the
  owner asked for fewer fast-mana cards, which tournament lists run).
- **Whole-pool search** (UP.pool2, UP.poolN 250): after the list is checked, every legal card that does a row's job (up to 250
  per row, most-played first) is measured in the background, a few milliseconds at a time; Highest score updates in place and a
  note shows progress. It stops when the list changes. About 30 s on a desktop for a typical deck.
- **Speed:** comparing past the maximum measured every candidate twice (Build 139 code, switched off until now): the check took
  3.9 s instead of 2.6 s per deck. One evaluation now gives both numbers (swapScore2); benchmark identical, 2.5 s.
- **Tests:** UI-B81-03 now counts inline alternatives on every deck it visits, not only the last one (in the suite's altered
  Avengers deck the one row with alternatives, Hero's Blade -> Spectacular Spider-Man, no longer passes the score floor once a
  size-only finisher counts half; its other rows are spare lands, which have no alternatives).
- **iPhone (owner's screenshots):** upright phones scroll the page instead of a fixed-height deck box (with large text the box
  left the card list no room and buttons spilled past the frame); deck tabs take a second row instead of running off the panel;
  the card count stays on one line. iPad and desktop unchanged.

## Build 141 (18 October 2026; pushed with the owner's OK. The owner confirms every push)

Owner: "Let them wait if that's what it takes... a loading style message with a small animation rather than shifting results";
"optimize every recommendation"; "a build by theme option in the deck builder"; tweak settings, no major system changes.
- **Thinking, not shifting:** Fix: Mana, a land's card window (now opens at once instead of freezing for a few seconds), the
  upgrade check and the card-quality line show a small spinner ("Thinking…") and fill in once, complete. Each row's Highest score
  says it is thinking until the whole-pool search is done, then every row fills at once (it used to update row by row).
- **Build by theme** (Generate window, "Or start from a theme"): pick one of the 16 themes (creature type: pick the type), and
  optionally colours; commanders are ranked by how much they build around it (their own text), how many strong cards for it
  exist in their colours, and how proven they are; More commanders shows 30 (less-known ones). Build loads the commander's
  play data, puts the theme first and the commander's matching EDHREC theme page next, at the chosen price level.
- **Obscure commanders** (little or no play data; UP.thP 0.3, thT 0.3, thS 1.5): generated with no play data at all, decks
  leaned on generic power (6.2 Game Changers, 6.6 tutors). Tournament-staple, Game Changer and tutor bonuses now count 0.3 and
  the most-played staples 1.5 when play data is thin. Against strong real decks: typicality 0.134 -> 0.176, core coverage 18% ->
  28%, deck score 81 -> 85. Tried: more weight on the detected mechanics (worse: 0.112), fewer staples (worse), power 0 (0.155).
  Decks with play data are unchanged (typicality 0.396, coverage 0.69).
- **One-colour mana bases** (rules): City of Brass, Mana Confluence, Exotic Orchard, Reflecting Pool, Forbidden Orchard and
  Command Tower are never better than a basic in a one-colour deck; they no longer go into generated mono-coloured decks or the
  Mana fix (Ghalta now gets Mosswort Bridge, Myriad Landscape, Gemstone Caverns instead). Two-colour and up unchanged.
- **Upgrades** (UP.rankN 12 -> 18: more of each slot's most-played candidates are measured): tuneall sum 9.12 -> 9.30 (weighted
  14.06 -> 14.19), every other number equal. Screened on tuneall (about 30 settings, each halved and raised by half): almost all
  flat. Game Changer / tutor bonus 1.5 -> 2.25 helped upgrades slightly (@10 0.126 -> 0.127) but made generated decks worse
  (typicality 0.396 -> 0.393), so it stays. Fewer trimmed rows (trimPa 0.2) raised the sum to 12.0 but lowered @10: rejected.
- **Card reading (UP.nmh 1, owner: "the hand size should always be fixed"):** "You have no maximum hand size" (Thought Vessel,
  Spellbook, Venser's Journal, Decanter of Endless Water) is no longer read as card draw. The correct reading lowers the test
  set a little (@10 0.199 -> 0.197, sum 6.69 -> 6.58, weighted 0.219 -> 0.215 / 7.59 -> 7.49) and takes back the rankN sum gain
  (tuneall 9.30 -> 9.12); the owner ruled the correct reading wins. Generated decks improve (beat the median strong deck 10 ->
  11 of 13; tournament match 55% -> 56%, core 53% -> 54%). A check of ramp, removal and board-wipe readings found no misreads.
- **Game Changers at Apex** (owner: "if we need them to move up in bracket shouldn't they be included?"; replaces Build 115's
  trim to the room under Bracket 3's three): the Apex list now offers up to 3 Game Changer rows (UP.gcN 3) whatever the deck
  already holds (UP.gc3 0), lets a Game Changer that beats the card it replaces by less than usual in play value still be
  offered (UP.gcB 4 -> 10), and keeps those rows from being left out because the precon's casual owners rarely add the card
  or replaced by a more-played card (UP.gcT). Every one still has to raise the deck score. Why they were missing: Game
  Changers that raised the score (Notion Thief +1.72, Farewell +0.83, Smothering Tithe +0.77, Enlightened Tutor +0.62) were all
  removed after scoring by those two steps; the three-card limit itself changed nothing. Apex upgrade lists on the tuning set:
  2 Game Changers in 197 picks -> 25 in 222, 6 of them ones strong (bracket 4+) players commonly add. They sort after the other
  rows, so the benchmark is unchanged. Each row already says when it moves the deck up a bracket.
  Owner's rule (18 Oct): Game Changers follow the rule of every other mechanic: recommended only when they fit. A Game Changer
  row stays only when the card window would rate it a Good or Great fit (evalFit); up to 3 (UP.gcK), and more (up to 6, UP.gcN)
  only when one is a Strong upgrade or better (deck score +1 or more, UP.gcS). Tuning set: 27 suggested in 224 Apex picks, 7 of
  them ones strong players commonly add (3 rows without the fit gate: 25 and 6; 6 rows: 40 and 7). Generated Apex decks already
  hold Game Changers (2.9 on average; strong real decks 1.7). `gcwhy.js` shows how the score judges each Game Changer row.
- **"I don't have this card"** (owner): a card in the deck has the button in its window. It thinks, then lists cards that do
  the same job (the alternatives' rule) under the deck's price limit (cards you own at any price), each measured in the deck in
  the missing card's place, best first; owned cards are listed first ("In your library"). Swap in asks first, swaps, and rules
  the missing card out of later suggestions. Wakanda (Budget), Beast Within: Collective Resistance +0.2, Path to Exile +0.1, ...
- **Tests:** UI suite 104/104 (UI-B115-01 updated to the Build 141 Game Changer rule; new: UI-B141-01 thinking not shifting, -02 Build by theme, -03 obscure commanders and one-colour
  lands). UI-B118-01 (Tivit with no play data loaded) now tests the stage-1 bonus with the obscure-commander multipliers at 1.
  New tools: `genstrong.js` takes NOEDH=1 (no play data), `landsof.js` (a generated deck's lands).
- **Benchmark (Build 141):** tuneall 0.244 / 0.245 / 0.126 / 9.12 (weighted 0.274 / 0.275 / 0.153 / 14.06); test 0.303 / 0.303
  / 0.197 / 6.58 (weighted 0.322 / 0.322 / 0.215 / 7.49); holdout 0.292 / 0.292 / 0.205 / 15.74 (weighted 19.37). Equal to Build
  140 except test @10 and sums, lowered by the hand-size reading (owner's ruling).

## Build 142 (18 October 2026; pushed with the owner's OK, together with Build 143)

Owner: "do the rules audit, then push the deck builder to its max potential. Every generation should be the best it can be,
no more leaving room for better."
- **Rules audit** (every role the engine reads, on the 3,000 most-played Commander cards; misreads fixed, correct reading wins):
  - Cycling is not card draw (its reminder text "Discard this card: Draw a card" made about 20 popular cards count as draw:
    Unearth, Migration Path, Cloud of Faeries, Cast Out, Street Wraith, Starstorm...).
  - "Target player draws" can be you: Peer into the Abyss is card draw.
  - Lands put onto your battlefield over two sentences are ramp: Traverse the Outlands, Open the Way, Planar Genesis,
    Shigeki, Hedge Shredder, Archdruid's Charm (giving an opponent a land, as Path to Exile does, stays not ramp).
  - "Target attacking or blocking creature" is removal (Razorgrass Ambush); "creatures you don't control get -1/-1 for each"
    is a board wipe (Toxrill).
  - Checked and correct: counterspells, tutors (land searches are ramp, not tutors), protection (self-only protection and
    "can't be countered" are not), land speed and colours, wipes (one-sided ones included), finishers (a few judgement calls,
    such as Garruk's Uprising's team trample, left as they are). Side effect: Archdruid's Charm no longer counts as a tutor.
  - Benchmark: holdout @5 0.292 -> 0.295, @10 0.205 -> 0.209 (weighted 0.318 -> 0.322, 0.241 -> 0.244); test @10 0.197 ->
    0.196, sum 6.58 -> 5.98 (weighted @5 0.322 -> 0.321); tuneall @10 0.126 -> 0.127, sum 9.12 -> 9.24. Correct readings win.
- **Never a swap that lowers the shown score:** a row whose gain is only past the parts' maximum (UP.uncTail) is now dropped,
  not just moved last, when it lowers the shown score.
- **Polished generation** (UP.polish 4 rounds, UP.polishK 10 swaps a round): the finished Apex build is run through the
  upgrade engine itself and every swap it finds that raises the deck score is made, strongest first, until none is left; Mid
  and Budget builds are then polished the same way at their own price level (polishDeck). The Apex reference build (the 100%
  mark for card quality) is never polished and is now cached. The deck builder's buttons say "Thinking..." with the spinner
  while it builds (the build takes about 13 s on a desktop at Apex, 25-30 s at Mid or Budget; longer on a phone).
  Room left in a generated deck's own upgrade list (13 tuneall commanders): Apex 3.5 swaps / +0.74 -> 2.1 / +0.18; Mid 2.2 /
  +0.26 -> 0.6 / +0.03; Budget 4.0 / +0.91 -> 1.5 / +0.10. Deck score Apex 94.7 -> 95.0, Budget 91.0 -> 91.6. Against strong
  real decks: typicality 0.396 -> 0.409, core coverage 0.69 -> 0.71; tournament lists: match 55% -> 59%, core 53% -> 57%,
  Mid 50% -> 53%. Commanders with no play data are unchanged (0.176): polishing relies on the same play data.
- **Tried and not taken:** a higher score floor (0.08 / 0.1) or confirming borderline swaps on fresh practice games removes
  many swaps players make (holdout @5 0.295 -> 0.271-0.282). Finding: for some swaps the stored practice games (which don't
  play the new card) and fresh ones disagree (Sultai: Muldrotha +0.05 stored, -0.40 fresh), while players add those cards. One
  borderline swap in the score check (Doom: Endless Ranks of HYDRA -> Taskmaster, +0.07 stored, -0.07 on 300 fresh games,
  -0.01 on 600) remains: scheck bad 1.
- **Speed (exact, same results):** the reference builds' card values are now kept per deck settings (apexMeans) instead of
  being worked out again for every swap measured: generation Apex 13.1 s -> 8.2 s, Budget 27.7 s -> 14.6 s on a desktop
  (identical decks and benchmark); upgrade lists are faster too. `genprof.js` shows where the time goes.
- **Tests:** UI suite 106/106 (new UI-B142-01 rules audit, UI-B142-02 polished Budget build with the thinking line). Tools:
  `genroom.js` (room left in a generated deck; TIER=mid|budget, NOEDH=1), `scheck.js` takes UP, `confdbg.js`.

## Version 0.9.23 (build 168, 31 October 2026; owner: "We need to shut down deck companions old build from saving over commander companions new build ... Every swap should trigger a save and all upgrades should be regenerated ... we can't miss critical things like a soul stone being excluded from a graveyard/reanimate deck")

- **Lost swaps, causes found:** (1) the old Deck Companion (maxfhurt.github.io/Deck-Companion) and the Deck Builder share one site,
  so one storage, and both saved decks as `dc.profile`. An old Deck Companion page left open (a tab, a backgrounded app) saved
  its stale copy whenever it was hidden or closed, over the Deck Builder's newer decks. The Deck Builder did the same between
  two of its own windows. (2) Saves that failed (local storage full: playmat images, saved upgrade lists and deck history
  share about 5 MB on Safari) failed silently. (3) A swap on a deck not yet saved (a generated or loaded draft) was lost when
  another draft replaced it.
- **Saving now:** decks are kept as `cc.deckProfile` / `cc.deckDraft` (moved once from `dc.profile`, which is never read again
  once moved and never written). Every save carries a number (`saveRev`, from the clock; `cc.deckRev`) and a copy goes to this
  app's own IndexedDB (`cc-deck-builder`), which brings decks back when local storage was cleared or was full. A window saves
  only what it changed; if another window saved since, it takes that save's decks first and keeps its own newer ones
  (`updatedAt` per deck; a deck deleted here stays deleted), and an idle window takes other windows' saves as they happen.
  When local storage is full the caches (saved upgrade lists, search index, old copies) are cleared and the save retried; a
  save that fails everywhere says so on screen. A swap saves at once, and a swap on a draft makes it one of your decks.
  The game side reads and restores the decks under the new name (`src/data/deck-builder.js`). `savecheck.mjs`: 9 checks.
- **Old app shut down:** Deck-Companion's page is now a forwarding page that saves nothing, and its version.json says build
  1000, so every old copy updates itself onto it at its next check.
- **After a swap the whole upgrade list is worked out again** (replaces 24 Oct's "only its own slot": keepRecs no longer
  carries the list). UI-B156-01 now checks that.
- **Apex picks, missed cards:** the whole-card search only measured cards doing the same job as a row's pick, so The Soul
  Stone (filed as ramp), Animate Dead (an aura) and Entomb (a tutor) never competed for the slots they improve most; in the
  Teval precon at Apex The Soul Stone raises the score +1.9 against Steward of the Harvest, where Demonic Tutor was offered at
  +1.6. Now (UP.poolX 40): about 400 likely cards (the 300 most played, the 100 best by card value) are scouted against one
  slot (a swap's gain is close to "card in" minus "card out"), and the 40 best are measured on every row; rows keep their
  30 best finds (was 6) so each still has its own best after other rows take the stars. UP.poolRows 10: the deck's 10
  weakest spells without a row are measured against the same 40 and get a row when a card raises the score (dropped with
  Stick to the theme unless an on-theme card does). Whole-search Apex lists (rows, total gain): Teval 22, 18.8 -> 31, 25.3
  (The Soul Stone offered); Turtle Power 10, 9.9 -> 20, 18.0; Wakanda 13, 15.3 -> 22, 22.3; about 20% more swaps measured.
- **Reanimator themes read card text** (UP.aimText): an EDHREC theme only counted cards in 20% of its decks, so The Soul Stone
  (7% of Teval decks) never fitted "reanimator". Reanimation engines, reanimation spells and Entomb-style tutors now fit the
  reanimator and graveyard themes; a generated Teval Apex deck now has Entomb and Buried Alive.
- **Sol Ring and Arcane Signet in every generated Commander deck** (UP.staples; owner, 31 Oct): only play data put them in,
  so a commander without an EDHREC page (or a failed download) got neither (Teval, Turtle Power with no data). They go in like
  the player's seeds when the deck's rules allow (legal, colours, set filters, owned when building from the collection, not
  ruled out; Arcane Signet needs a colour). `staples2.js` / `staples3.js` (NOEDH=1) check all tiers.
- A swap the player makes on a draft saves the draft as a deck; the app's own swaps while generating leave it a draft
  (UI-SET-01). Stick to the theme drops a weak-card row whose pick is not on theme (UI-B158-01).
- `?engine=old` keeps 0.9.3's choices (poolX, poolRows, aimText, staples 0). The benchmark runs without the whole search (POOL=1 adds
  it), so its numbers do not see poolX/poolRows.

## Version 0.9.21 (build 166, 26 October 2026; owner: "How can a deck's score be 0? ... When 1 card enters the deck's power should be above 0")

- Deck power below the Budget build was a straight line that reached 0 at 25 score points under it, so a half-built deck
  (score 57 against a Budget build of 90) showed power 0. It is now a curve, 70 x (score / Budget's)^(Budget's / 25): just as
  steep near Budget (a precon moves 56 -> 57), 0 only for an empty deck, and at least 1 for any deck with a score (that deck
  now reads 13). UI only: the deck score and upgrades are unchanged. UI-B164-01 checks the floor.

## Version 0.9.20 (build 165, 26 October 2026; owner: "The stats page should be just that, stats ... Gameplans and upgrade plans should all be on the upgrades tab")

- **Layout.** Upgrades now holds the meter (You / Budget 70 / Mid 85 / Apex 100), the level sentence, what keeps the deck below
  the next level, Path to Apex, Upgrades left and the game plan ("Game plan: how X works and how the deck wins", moved out of the
  deck score's details), all under the progress bar and above the upgrades. Build stats keeps the strip, the stat tiles, a short
  health list (several items per line) and the rest of the analysis. The Apply All Budget / Mid / Apex buttons sit below the
  upgrade rows; the "Best deck with every card under $3 / $12" buttons are in the left Build pane above Regenerate upgrades.
- **The Mind Stone read as weak (owner's screenshot).** "Fits Graveyard" was wrong: the keyword list for the graveyard theme
  held "harness" and "∞" (the Infinity Stones' mechanic, not a graveyard one); both removed (rules 32/32, misread unchanged,
  benchmark identical on all 15 numbers). "Ranks below nearly every spell" came from play data: a card first printed in June
  has had four months to be picked up (EDHREC rank 3784, in 8% of T'Challa decks) while Mind Stone is a top-40 staple. The card
  window now says a card first printed in the last 12 months is new and has little play data yet, and does not mark it down for
  that (fit text only; the upgrade scoring is unchanged). Card data now keeps each card's first-printing month (Scryfall's
  `reprint: false`); it fills in on the next card-data refresh. "Score unchanged" is the measured result of that swap (the deck
  score moves less than its smallest step), not play data.
- **Tests:** UI-B126-01, UI-B132-01, UI-B164-01, UI-B81-01, UI-SCORE-01 and UI-STATS-01 follow the move; new UI-B165-01 checks
  the new arrangement. UI-B133-01 caught the left pane running 10 px past an iPad screen, so the two buttons sit side by side
  ("Best deck under $3" / "$12", full wording on hover). Full suite: all pass but the known timing tests; UI-B144-02 now takes
  2.0-2.5 s against its 2 s limit on this test machine even on the live 0.9.19 code (not this change).

## After 0.9.19 (25 October 2026): switches for the Mid/Budget polish decision (all at today's behaviour)

- UP.tierPolish (1): the polish rounds on a generated Mid / Budget deck after it is made from the Apex build (UP.polish also
  polishes the Apex build itself while it is designed; that stays). UP.polishSlot (0): polish only swaps a stand-in for
  another card serving the same Apex slot, undoes a round that does not raise the score, and builds Mid no weaker than Budget.
- Measured with the Apex build made the same way each time (node, apexRef, 300 games): Mid/Budget polish adds about 0.6
  points on average (Edgar Markov Budget 87.31 -> 89.25) by bringing in 1-6 cards per deck that are not cheaper versions of
  Apex cards; slot-faithful polish finds almost no swaps (same as none). Mid scored above Budget for all four commanders in
  every mode (an earlier browser reading of Captain America Budget above Mid scored before its reference loaded).
- **Owner's decision (25 Oct): "Keep the strongest option" = B, keep Mid/Budget polish** (UP.tierPolish 1, UP.polishSlot 0,
  today's behaviour). Benchmark identical.

## Version 0.9.19 (build 164, 25 October 2026; owner: "Budget being 87 and Apex being 91 is too tight ... Combo of A and B, for sure. Let's try C as well")

Why the tiers sat close: the deck score is synergy 30 + balance 25 + card quality 20 + win routes 15 + mana 10, and synergy and
balance reach 100 on any well-built deck (a precon too), so card strength moves only a fifth of it (Turtle Power: precon 83.6,
Budget build 87.5, Mid 90.5, Apex 92.2; Avengers' Budget build 91.0 above its Mid build 90.3).
- **A. Deck power** (`powerOf`, display only): the deck score placed on the deck's own builds, Budget build 70, Mid 85, Apex
  100, in between by the score; below Budget it reaches 0 at 25 score points under the Budget build (a precon lands near 50);
  past Apex each score point adds 3. On the strip ("Power 50") and the tier meter; the deck score stays in Build stats.
- **B. What keeps it below the next level** (`gapHtml`): each part against that level's build, biggest weighted gaps first,
  with the part's own explanation (Turtle Power: win routes 29 vs 59, card quality 64 vs 86; already ahead on mana). The
  reference builds' parts are saved with them (refScores `parts`; saved references are scored again once).
- **C. Reweighting the score: tried, not kept.** UP.evW / UP.evSuff (off) override the weights and where a part stops rising.
  Quality 40 (synergy 20, balance 15): test @10 0.198 -> 0.207, wide row@5 0.429 -> 0.433, but tuneall @10 0.139 -> 0.136,
  holdout @10 0.213 -> 0.212. Plus later caps: tuneall @10 0.132. Quality 30: wide @10 0.303 -> 0.307 but tuneall @10 0.138,
  holdout 0.212. The Budget-to-Apex gap widens only a little (Turtle 4.7 -> 6.4 at quality 40), so with A it is no gain.
- Benchmark identical to 0.9.18 on all fifteen numbers. UI-B164-01 added; UI-STATS-01 reads the deck score from Build stats.

## Version 0.9.18 (build 163, 25 October 2026; owner: Apex first, then Mid and Budget as cheaper versions of it; "it is okay to recommend another card that may not be quite as useful to the deck but provides value to the slot rather than just filling it with anything")

- **Mid uses the Budget card** when a slot has no Mid card of its own (`planPick`): a $1 card fits under $12. Before, 11-12
  Mid slots per deck were left open (Captain America, Doctor Doom) and filled with the best Mid card overall.
- **Loose stand-ins** (buildPlan `alt(x, cap, true)`): when no card under the price does the same job, the best card under the
  price that still serves the slot (shares a job with the Apex card, or fits a deck plan it is there for), marked mx / bx.
  Real decks rarely need it (0 slots across ten commanders, 0 in a one-set deck); forced on every slot (UP.looseAll, tests
  only) it picks Rip Apart for Cyclonic Rift, We Say Thee Nay! for Fierce Guardianship, Patriot, Shield Wielder for Flawless
  Maneuver. Only a slot nothing serves falls back to the best card at that price.
- The Building window shows only the deck-building steps (the card-data download's "Connection to Scryfall dropped" message
  showed there). UI-GEN-03 waits up to 60 s for its deck (about 20 s in the tests on 0.9.17 too).
- Benchmark identical on all fifteen numbers. UI suite 125 (B81-02, B135-01 pass alone; B144-02's 2 s limit is met by 0.9.17
  and 0.9.18 alike, 1.5-1.8 s).

## Version 0.9.17 (build 162, 25 October 2026; owner: "alternate printings of cards as the original card name and the wrong card being displayed")

- A deck's themed set printings (ensureTheme) now keep the name printed on them (Scryfall flavor_name; cache dc.theme2 ->
  dc.theme3, fetched again once). `shownPrint` gives the printing a card is shown in (the entry's own, the themed set's, or the
  card's own, the same choice as the picture) and `nameHtml` names it: a printing that carries another name shows that name,
  then the real name in small type ("Marauding Mutagen (Acidic Slime)").
- Used on the upgrade sheets (Your card now shows the printing you chose), the card window (recommended cards too, not only
  cards in the deck), the card pop-up's own frame, the price alerts and the theme commander lists.
- Engine unchanged. UI-B162-01 added; UI suite 125 (B135-01, B146-02, GEN-03 pass alone).

## Version 0.9.16 (build 161, 24 October 2026; owner: "When generating a deck in any way, you should generate that deck with a full deck list at the appropriate tier. If none is assigned, you should make a commander deck equivalent to a precon.")

- **Every way of generating builds the whole list** (`startPlan`): Build around my cards (seed-go) used to design a build plan
  you added from by hand, and a commander with no strategy of its own (49 of the 357 most-played) opened an empty deck asking for
  mechanics. Now both fill all 99 cards. A chosen price level is kept (Generate, Theme build).
- **No level chosen: built like a precon**, at Budget (every card under $3): the level nearest a retail precon (Turtle Power's
  precon scores 80, the best Budget build 87). The toast says so.
- **No strategy of its own:** the commander's EDHREC themes lead; with none, the deck is built on card strength and jobs.
- Build-plan decks saved before keep working (plan slots, alternatives, Regenerate around my cards); the tests make one with
  `planOnly` (the old way) to keep testing them. UI-B161-01 added; UI-B160-01 checks the upgrade list's own thinking note.
- Engine bundle unchanged (same sources hash as 0.9.15): benchmark identical. UI suite 124 (B146-02, GEN-03, BUY-01 pass alone).

## Version 0.9.15 (build 160, 24 October 2026; owner: "the thinking and waiting needs to be expedited without cutting corners")

Measured first (one core): the whole-card search is most of the wait (7-14 s; 1,750-3,750 candidates, each a full deck
score on the stored practice games), the score check 1-3 s, building the list 0.5-1.7 s.
- **Saved upgrade lists** (`recSave` / `recRestore`): a finished list is saved with everything it depends on (the deck and
  its settings, the build, the engine choice, the card data date, the commander's play data); opening the deck again with
  nothing changed shows the same list at once. Turtle Power: 11.8 s the first time, 0.3 s reopened, card for card and score
  for score the same as working it out again. A change, Regenerate (`recDrop`) or new data works it out again. The last 12
  decks' lists are kept. Tests start with saving off (S.recFresh) so they keep testing the search; UI-B160-01 tests saving.
- **Skipping cards that can't win: not done.** No safe upper bound exists: one card moves several parts of the deck score
  (synergy, job balance, curve, practice games), and a card's value depends on the rest of the deck (which jobs it still
  needs), so per-card caching would not be exact either. Any shortcut could change a pick, so none was made.
- **Benchmark in one command** (`benchall.js`): the engine's picks for a deck are worked out once and judged with both player
  deck sets (bench.js RCACHE, a per-run cache keyed by the engine's files and settings), with the sets side by side on four
  cores: all fifteen numbers and the weighted ones in about 4 minutes instead of about 14, identical values.
- Benchmark identical to 0.9.14 on all fifteen numbers. UI suite: 120 + UI-B160-01 (B81-02, GEN-03, BUY-01 pass alone).

## Version 0.9.14 (build 159, 24 October 2026; owner: Phase 3 options "A then B")

- **A. Jobs shown from both card readings** (`jobsShown`, display only): against Scryfall's tags on equal terms the live app
  already matched the rules reading for removal, draw and wipes (removal 94% / 77%); taking the reading's counterspells and
  protection as well finds more (counterspells 90% -> 95% of cards, protection 61% -> 69%, precision 99 -> 98 and 84 -> 82).
  Shown in the card window's Does line, a new Interaction tile in Build stats and a line in Analyze this build. Scoring
  still uses tags(); the reading done for display is not kept on the card, and analyze() is untouched (counting it there cost
  10% of its time). Ramp and tutors were left alone: both readings together lose precision (ramp 85 -> 80, tutors 98 -> 94).
- **B. A bigger benchmark: the wide set.** 24 more precons, the most built of every Commander precon on EDHREC whose cards are
  all in the snapshot (Szarel, Hakbal, Auntie Ool, Wise Mothman, Pantlaza, Ashling, Frodo, Ms. Bumbleflower, Ulalek, Kilo,
  Eowyn, Killian, both Zimones, Temmet, Dina, Quintorius, Jace, Clavileno, Caesar, Aminatou, Satya, Zhulodok, Rootha), each
  judged with 400 public Archidekt decks (85 to 286 upgraded copies per precon). Data: data2/precon and data2/fixtures
  (retail lists), data3/edhrec (commander pages), data2/themes (5 theme pages each), corpus5. Run with CORPUS=corpus5.
  Baseline (0.9.14): agreement@5 0.420, row@5 0.429, @10 0.303 (weighted 0.448 / 0.458 / 0.334). The Classic engine (0.9.3)
  on the same decks: 0.409 / 0.423 / 0.294 (weighted 0.438 / 0.451 / 0.324): fresh data confirms the current engine.
  With the wide set the no-drop rule covers fifteen numbers (old and corpus5 tuneall, test, holdout, and wide).
- **Baseline note (my mistake, fixed):** fetching the wide set overwrote 16 precon pages that the commander pages name
  (data2/precon, EDHREC's slugs differ from the fixture names), and a cleanup step deleted them. They were downloaded again
  from EDHREC (today's versions; no copy of the old ones was kept). Only one benchmark deck is affected: Invisible Woman
  (The Fantastic Four), so tuneall @10 moves 0.136 -> 0.139 (weighted 0.163 -> 0.166; corpus5 0.162 -> 0.166, weighted
  0.191 -> 0.194). 0.9.13 and 0.9.14 give identical numbers on all twelve on the restored data. New baseline: those four
  numbers; every other number is unchanged.
- UI suite as before (B81-02, B135-01, GEN-03 pass alone; they clash only side by side).

## Version 0.9.13 (build 158, 24 October 2026; owner: "Yes" to Stick to the theme, "Fix the problem cards")

- **Stick to the theme** (a deck setting on the Upgrades tab, `d.stick`, off by default; engine `stickTheme`): each row's picks
  are rebuilt from the cards on theme for the deck that still raise its score (the commander's franchise and creature types,
  or one of the deck's plans): the best is the Apex card, then the best of the rest under $12 and under $3, each card once.
  A row with no on-theme upgrade keeps its usual picks. Turtle Power: on-theme Apex picks 43% -> 100% (Sun Titan, Sheoldred,
  Craterhoof give way to Evolution Witness, Raphael, Splinter's Technique). The generic power picks come from the
  whole-card search; the score check alone already picks 93% on theme.
- misread.js on 160 commanders 11 -> 5: new plans offered to all, never auto-picked: Small creatures (EDHREC weenies; Raise
  the Past for Arabella) and Big mana (big-mana; Zhulodok and Horizon Stone for Omnath); "prepared" counts for Spellslinger
  (Codie), a cast trigger for Free casting / cascade (Oblivion Sower for Zhulodok), colourless cards for Eldrazi (Ancient
  Stirrings for Ulalek). Left (one-offs with no plan behind them): Giant Growth (Xyris), Radagast the Brown, Molecule Man
  (Omnath), Return to the Light Realms (Dack), Timber Protector (Doran's deck is not built as Treefolk).
- Benchmark identical to 0.9.12 on all twelve numbers. UI-B158-01 added.

## Version 0.9.12 (build 157, 24 October 2026; owner: "There should always be an apex card" / "The undo button should not undo anything without confirmation")

- **Every row has an Apex card** (engine `apexOf`): the slot's best card holds the Apex slot whatever it costs. With no Apex
  pick of its own, or when a cheaper pick raises the deck score clearly more (by more than SCORE_MIN; a Players' choice Apex
  pick keeps its place), the cheaper card moves up to Apex and leaves its column; no cheaper card is forced into Mid or
  Budget. "Apply all Apex" and the buy list use the same columns (the buy list no longer labels the slot's best card Budget).
- **Undo always asks first** with what it will undo: the main Undo (deck bar and floating button), a card's Undo swap,
  Undo last regenerate and Undo rebuild. Cancel changes nothing.
- Benchmark identical to 0.9.11 on all twelve numbers. UI-B157-01 added; UI-B81-02 confirms its Undo.

## Version 0.9.11 (build 156, 24 October 2026; owner: "Catch up on the chat and get to work")

The owner's list (24 Oct):
- **Held picks removed.** A pick shown once no longer holds its slot ("Apply all" refused to run when a held pick differed
  from the one shown: held_pick_changed). Only an alternative the player chooses is kept ("Your choice").
- **Tiers in order.** On a row, Mid is the best of the rest under $12 and Budget the best of the rest under $3 by deck-score
  gain, so a Budget card never scores above Mid (engine `tierCols`). "Apply all" for a tier uses the strongest card on the row
  at that price (a cheap Apex card is also the Mid pick, `tierPick`); Apex stays the engine's own pick. When two tiers make
  the same swaps the list says why (the strongest cards already cost under $12). An empty column says when the card above
  already costs under its price. The bar's Budget / Mid / Apex marks are kept in order and show a decimal on near-ties.
- **Tier buttons say what the new cards cost to buy** ("14 cards · $151 to buy"); the cards taken out are no longer
  subtracted (the "−$3" for eleven cards).
- **One swap re-thinks only its slot** (`keepRecs` / `carryRecs`): the checked list stays, the swapped row leaves, and the
  card that went in is no longer offered elsewhere. Undo, Regenerate and other edits still work the list out again.
- **Buy list kept.** The suggested buys are worked out once and saved with the deck (`d.buySnap`), each with a Bought mark
  (`d.bought`); Refresh suggestions works them out again (it asks first).
- **Generate asks first** (`genConfirm`: art, type, rules text, colours, price, EDHREC decks, strategy) and keeps a
  "Building your deck" window with live progress until the new deck opens (`genBuilding`).
- **Profile → Upgrade engine:** Current or Classic (0.9.3), kept on the device (`dc.engine`); `ENGINE_OLD` now also turns off
  the newer plans and the xPlan bonus. Old engine on the benchmark: tuneall 0.248 / 0.250 / 0.129 (current 0.252 / 0.254 /
  0.136), test 0.298 / 0.300 / 0.191 (0.299 / 0.299 / 0.198), holdout 0.300 / 0.300 / 0.211 (0.301 / 0.301 / 0.213);
  corpus5 likewise. On Turtle Power both engines pick nearly the same Apex cards (Six, Sun Titan, Craterhoof...): the
  generic-power picks come from the whole-card search (0.9.3), not from the engine change.

Also: misread.js widened to 160 commanders (EDHX=data3/edhrec: 109 more EDHREC pages): 62 -> 11. New plans offered to
every player, never auto-picked: Infect / poison, -1/-1 counters, Mill (opponents), Pillow fort, Dice rolling, Legends /
historic, X spells; wording for Shrines and Sagas, land tutors, burn amplifiers, extra blocks, mass blink, lure, life
thresholds, dies-and-returns, commanders you control, legend pump, {0} casting, Protean Hulk; scry / surveil count lightly for
Top of library. Two broad patterns ("when this creature dies", "search for a basic land") and self-mill in the Mill plan
lowered a number and were narrowed. Practice games play by more rules (UP.v2sim on): creatures are summoning sick, a
creature tapped for mana doesn't attack, rocks pay only what they net; the Practice panel shows each turn's unblocked
attack and the damage by turn 8 (practiceGames matches simulate game for game). Phase 3 trials (counterspells, protection,
tutors, ramp from the reader): none raised the benchmark; off. Benchmark identical to 0.9.10 on all twelve numbers. UI
suite: 119 + UI-B156-01 pass (B81-02, B135-01, B146-02, GEN-03 pass alone; they clash only when run three side by side).

## Version 0.9.10 (build 155, 21 October 2026; owner: "finish all the cards, don't ask for permission")

misread.js 12 -> 0: every card on the 52 test commanders' upgrade lists now shows a reason tied to the deck's plans. New
Combo pieces plan (off for auto-pick, offered to everyone): a card in a known combo of three cards or fewer fits it
(Thassa's Oracle, Seedborn Muse, Training Grounds, Wilderness Reclamation, Marvin, Continue?). Top of library reads "on top in
any order" and huge spells that put cards on top (Lim-Dul's Vault, Shadow of Mortality); a dropped "reveal the top card ...
if it's a" alternative stopped false hits. Sacrifice reads "by sacrificing" (Sevinne's Reclamation). Card functions: a tuck
of a permanent card is removal (Endless Detour), "return each creature card put there from the battlefield this turn" is
protection (Into the Pit), "each player chooses a creature you don't control ... destroy" is removal (Sadistic Shell
Game). Benchmark equal to 0.9.9 on all twelve numbers except tuneall @10 0.135 -> 0.136. Reader answer key 32/32; quick UI
check 12/12.

## Version 0.9.9 (build 154, 21 October 2026; owner: "Yes make the trade off and push live")

UP.xPlan 0.25 on: a card that fits a plan this commander's players build, beyond the deck's own three, scores a little more
and says so ("Graveyard (a plan Bello players build)"). Benchmark: test @10 0.192 -> 0.198 (corpus5 0.191 -> 0.197), holdout
0.300 / 0.300 / 0.212 -> 0.301 / 0.301 / 0.213 (corpus5 0.345 -> 0.346); tuneall @10 0.136 -> 0.135 (corpus5 0.163 -> 0.162),
test row@5 0.300 -> 0.299. The owner took the trade-off. misread.js 176 -> 22.

## Version 0.9.8 (build 153, 21 October 2026; pushed to main when the benchmark was clean, as the owner asked)

Reasons say when a card completes a short combo (three cards or fewer) with the commander or with cards a quarter of its
players run ("Combo with ..."; combos already counted in the score). Shield counters count for +1/+1 counters, land-count
cards for lands, "exile any number of target spells" (Mindbreak Trap) is a counterspell, "put them back in any order" is top
of library; a commander that reveals its top card into your hand (Yuriko) leads Top of library. Benchmark identical to 0.9.7
on all twelve numbers. UP.xPlan 0.5 (cards fitting a plan the commander's players build beyond the deck's top three;
misreads 176 -> 22) stays off: test @10 0.192 -> 0.198 and holdout up, but tuneall @10 0.136 -> 0.132 (corpus5 0.163 -> 0.159).

## Version 0.9.7 (build 152, 21 October 2026; pushed to main with the owner's OK: "Push it live")

Remaining misreads: theft read in "target opponent exiles ... you may cast" wording (Gonti), more stax wording (Ethersworn
Canonist, Damping Sphere); new plans players can choose: Free casting / cascade, Top of library (never picked on their own).
Held back (each lowered the benchmark): a Big creatures plan (test 0.298 -> 0.294 even unpicked; off and hidden) and reading
Hazel as a Squirrel deck from her players' themes (Squirreled Away @10 0.362 -> 0.293; removed: tribes are the player's call).
Benchmark identical to 0.9.6 on all twelve numbers; misread.js 177 -> 176. Built, off: UP.xPlan (cards fitting a plan the
commander's players build beyond the deck's top three; misreads -> 31 at 0.5), not yet benchmarked.

## Version 0.9.6 (build 151, 21 October 2026; pushed to main with the owner's OK: "Push it live")

Owner (21 Oct): push straight to main from now on (not engine-v2), only when asked. Creature types: a type a commander only
searches for no longer makes its tribe, and irregular plurals are read (Magda: Dragon -> Dwarf). New plans players can
choose: Unblockable / evasion, Stax / lock pieces, Clones / copies (never picked for a commander on its own), Voting.
Benchmark identical to 0.9.5 on all twelve numbers (old decks and corpus5); misread.js 229 -> 177.

## Version 0.9.5 (build 150, 21 October 2026; pushed with the owner's OK: "Push it live")

New plans players can choose for any deck: Fliers, Defenders / toughness, Goad / forced combat, Tap / untap, Theft
(opponents' cards), read from card text and matched to EDHREC's tags (flying, defenders, toughness-matters, forced-combat,
tap-untap, theft). The engine picks a plan for a commander on its own only from text that rewards it, never Defenders (owner,
21 Oct: "We need to give players all their choices"; picking it for Felothar's precon lowered that deck from 0.527 to 0.430).
A plain flier or defender fits its plan but is not "on theme" for pairing swaps. Benchmark identical to 0.9.4 on all six
numbers; misread.js 255 -> 229 cards. UI suite 118/119 (UI-B146-02, background cores under the grouped run's load; passes
alone). Test data: 25,691 Archidekt decks (up to 1,000 per commander, corpus5, `CORPUS=corpus5`).
**Re-measured on corpus5 (21 Oct), 0.9.3 -> 0.9.5:** tuneall 0.274 / 0.275 / 0.159 -> 0.276 / 0.278 / 0.163 (weighted
0.304 / 0.305 / 0.187 -> 0.305 / 0.306 / 0.191); test 0.296 / 0.296 / 0.192 -> 0.296 / 0.296 / 0.191 (weighted @10 0.218 ->
0.217); holdout 0.345 / 0.345 / 0.256 both. With three times the decks the tuning gain holds; test @10 is 0.001 lower (one
swap among the five retail decks). From now on changes are judged on corpus5 as well.

## On engine-v2 after 0.9.5 (21 Oct, not live)

- **Unblockable / evasion** plan players can choose (EDHREC "unblockable"; never picked for a commander on its own).
  Benchmark identical to 0.9.5 on all twelve numbers (old decks and corpus5); misread.js 229 -> 204. Quick check 12/12.
- **Explanations checked:** the reasons on upgrade picks match the data ("In 44% of T'Challa decks", "Added in 32% of
  2,366 decks built from Wakanda Forever"). Gap left: a pick that fits the deck's plan rarely says so.
- **Next:** the remaining 204 misreads (Ghalta's big creatures, Bello's cast triggers, Emmara's untap creatures without a
  tap/untap plan picked); a plan line in the reasons; full UI suite before the next release.

## Version 0.9.4 (build 149, 20 October 2026; pushed with the owner's OK: "Push it live")

The first engine-v2 release: the rules reader decides which cards are removal, and adds wipes and card draw the text patterns
missed (never taking one away). Benchmark against 0.9.3: tuneall 0.252 / 0.254 / 0.136 (was 0.248 / 0.249 / 0.130), weighted
0.281 / 0.282 / 0.163 (0.279 / 0.279 / 0.158); test 0.298 / 0.300 / 0.192 and holdout 0.300 / 0.300 / 0.212 (equal or
above). New: a total budget for generated Budget decks (owned cards, an owned commander and basic lands free); the price
level on the stats strip, apart from the power tier; `?engine=old` runs every choice as 0.9.3. Fix: the first version
snapshot of a deck reworked the upgrade list and jumped it to the top. UI suite 118/119 (UI-B81-02, the known open finding).

## Engine redesign on `engine-v2` (from 20 October 2026; never served to players until it beats 0.9.3)

- **Phase 0 (done):** rules test set (32 cards, 31 rule areas), Forge scripts (tests only, GPL), Scryfall tags (90 tags,
  27,189 cards), baseline `tools/rules/baseline-0.9.3.json`.
- **UI suite (owner: speed it up):** side by side in 3 groups, 118/118 in 5.6 min (was 9.5); fast mode 4.9 min. Tests fixed on
  the way: UI-ASYNC-01 now really loads Family Matters (the test server only served 5 precons, so it was checking whatever
  draft was left over); UI-B81-03 exempts Players' choice alternatives (listed on the players' word since Build 143);
  UI-B134-01 loads a fresh Doom Prevails when no open deck has an Unpopular pick; UI-B98-01 checks buttons, not the whole
  page; UI-B148-01 makes its own buy list; UI-FIX-01's redraw limit 6 -> 12 (a loop is hundreds; a busy machine adds a few);
  UI-GEN-01 waits up to 60 s for a generated deck.
- **App fix found by the grouped runs:** the progress bar's level compared rounded percentages, so a deck at 95.6% of Apex
  with the Budget mark at 95.74% read "Budget level"; it now compares the unrounded scores (ui/upgrades.js statsHtml).
- **Open finding:** after UI-PLAN-02 in the same browser, UI-B81-02's "generating twice gives the same deck" fails (Captain
  America); not reproduced outside the suite yet. The grouped runner keeps the two apart.
- **Phase 1 (done): rules reader** `engine/rules.js` (`rrRead(c)`): every ability of a card as kind (keyword, static,
  triggered, activated, mana, loyalty, replacement, spell, modal, chapter, level), costs, triggers, conditions, "unless" taxes,
  durations and effect atoms. Answer key 32/32; retail precon spell sentences read 98.9% (281 of 289 cards fully; 0.9.3
  read 156); every Commander card 89%. A sentence it cannot cover is reported as unread, never guessed. Agreement with
  Forge's scripts (`forgecheck.js`, fully read cards): triggered 97.5%, activated 98.1%, mana 99.9%, replacement 97.9%,
  trigger events 99.1%. Checks: `rrcheck.js` (answer key, coverage, EX= examples), `forgecheck.js`.
- **Phase 2 (done): card functions** `engine/functions.js` (`fnOf(c)`): what a card makes (mana, cards, tokens, treasure,
  counters, life, graveyard, bodies, damage), uses (the same plus events it listens for) and its jobs, all from the reading.
  A card with an unread sentence keeps 0.9.3's jobs, so none is lost. Against Scryfall's community tags over 25,234 Commander
  cards (precision / recall, 0.9.3 in brackets): ramp 86/81 (85/82), draw 95/63 (96/60), removal 94/77 (94/58), wipe 86/77
  (87/77), counterspell 98/94 (99/89), tutor 93/53 (98/53), protection 83/60 (84/60). `fncheck.js`.
- **Phase 3 (in progress):** `UP.v2` / `UP.v2r` in `tags()` take a card's jobs from the reading. All jobs from the reading
  scored lower (tuneall 0.245 / 0.247 / 0.12); removal, wipe and counterspell from the reading and the rest from 0.9.3 scored
  higher on all three tuneall numbers (0.251 / 0.253 / 0.133, weighted 0.281 / 0.283 / 0.160; baseline 0.248 / 0.249 / 0.130,
  0.279 / 0.279 / 0.158) but holdout lower (wipe and counterspell lower it). **On by default on engine-v2: removal only**
  (after the fix keeping removal on cards that can also wipe, Vandalblast, Cyclonic Rift): tuneall 0.249 / 0.250 / 0.134,
  weighted 0.279 / 0.280 / 0.162; test and holdout identical to 0.9.3. Then **wipes added from the reading** (never
  taken away, `v2r: ['removal', 'wipe+']`): tuneall 0.251 / 0.253 / 0.135, weighted 0.282 / 0.283 / 0.162; test and
  holdout identical. Counterspells added the same way lowered holdout (0.295 / 0.302 / 0.207); off. Synergy (UP.syn 0.25,
  0.5, 1.5) lower (0.25: test 0.293 / 0.295 / 0.185); off. Added the same way with no change on holdout (left off, they
  only cost reading time): protection, tutors; ramp added lowered holdout to 0.278. Practice games from the reading
  (UP.v2sim): holdout unchanged; off. **Learning adds from stronger decks** (UP.optW: cards the commander's EDHREC
  power-level page runs more than its decks overall, trusted by sample size): bracket 4 ("optimized") weight 5: tuneall
  @10 0.136 -> 0.135, 10: 0.134, holdout unchanged; bracket 3 ("upgraded") weight 5: identical to 0.9.4 everywhere, 10:
  @10 0.134. No gain; off. The players in the benchmark upgrade precons, and EDHREC's commander page already holds what
  they run; the power-level pages say little beyond it. Pages kept in the test data (data2/edhrec-opt, edhrec-upg).
  `?engine=old` restores 0.9.3. **Entered budget** for generated Budget decks: a "Total budget" box (and "I already own" the
  commander) on Generate; `fitBudget` swaps the priciest cards for the strongest same-job cards that cost less until the
  deck fits (owned cards, an owned commander and basic lands are free). The stats strip shows the price level (and the cost
  against the budget) apart from the power tier.

## Version 0.9.3 (build 148, 19-20 October 2026; pushed with the owner's OK)

Owner's reports from the iPad (4 Brothers, Heroes in a Half Shell) and choices 1c / 2c / 3 (19 Oct).
- **The strongest card is the Apex card** (owner: "If a .38 cent card is the best card, it's the Apex card. We have too many
  rules conflicting"): after the whole-card search, Apex is the card that raises the deck score most of every card measured
  for the slot; Budget and Mid the best of the rest under $3 / $12 (Budget first). Held picks and Game Changer rows no longer
  keep a weaker card in place; picks are held only after the search. The pick it replaces stays as the row's **Popular pick**
  (when 10%+ of the commander's players run it) and an on-theme card within 10% is the **On theme alternative** (owner).
  Turtle Power: 10 of 14 Apex picks changed (Krang: Splinter +0.06 -> Graveshifter $0.17 +0.55).
  **Benchmark with the search (POOL=1):** the players' card is still on the row as often (row@5 0.247 -> 0.249, test 0.300 ->
  0.300, holdout 0.300 -> 0.300) but the Apex picks now disagree with players (agreement@5 0.246 -> -0.121, test -0.132,
  holdout -0.085) while the deck score's own gain rises (0.79 -> 1.36 per swap). The owner chose this rule knowing it may
  disagree; the size of the gap suggests the deck score overrates some cards the search finds (open question).
- **Upgrades tab:** the tiers are one row of buttons ("Apply All Budget Swaps" / "6 cards $4"); under them the Apex package
  line and the Best deck under $3 / $12 boxes. Removed: the Apex progress label, the level sentence (kept on Build stats),
  "Upgrade paths · N cards", How the tiers work (Remove suggestion is explained on its button) and the folder tabs.
  The EDHREC chip sits at the right end of the score bar ("4,374 T'Challa decks (EDHREC)"; phones "4,374 decks").
- **Bugs:** a card's "Undo · bring back" undid the last change instead of that swap, and the Buy list page's Copy copied the
  open deck's list: both buttons shared an action name with another (found by the minifier).
- **Flattened (owner 1c):** engine.js and ui.js split into `engine/` (8 files) and `ui/` (9 files) at their sections and laid
  out by Prettier (one statement per line; 5,000 dense lines -> 22,000); `samecode.js` proved the split and the layout are the
  same program (syntax trees identical). Switched-off experiments removed (UP.uncR, uncPick, kwB, kwS, stN and its settings;
  numbers stay in this file) plus the tier tabs' leftovers.
- **Smaller download (owner 2c):** `tools/build.sh` joins and minifies the scripts (esbuild) into `app.min.js` (page) and
  `engine.min.js` (worker): 278 KB -> 210 KB compressed, 1 request instead of 19. `?dev=1` runs the readable files.
  Q-BUNDLE/UI-BUNDLE fail if a bundle is older than its sources.
- **Speed (owner 2a), measured with speed.mjs (processor slowed 4x, roughly a phone; desktop in brackets):** page load 1.1 s;
  first open of a deck until its Apex reference is built 15 s (1.9 s), page busy most of it; complete Upgrades list 10-17 s;
  Fix: Mana 8.4 s; switching tabs 0.1-0.2 s; reading every card's text 14 s (3.4 s), done a little at a time as cards are
  needed. Tried and reverted: building the Apex reference on the background core: sending it the card library costs more
  than it saves (fresh start 1.9 s -> 11.1 s on desktop, 15 s -> 22 s at phone speed, and the page still freezes while it
  sends). Proposed next: keep each card's reading (tags) between launches (stored by card text and engine build), which
  removes most of the 14 s; send the library to the background core once at launch, in pieces, so later jobs are cheap.
- **Checks:** UI suite 118/118 (new UI-BUNDLE, UI-DEV, UI-B148-01; UI-B131-01, UI-B132-01, UI-EX-01, UI-CAP-01, UI-B143-02 updated),
  quick check 12/12, semantics 51/51, benchmark without the search identical to 0.9.2 on all six numbers.
- **Testing (owner 3):** `check.sh` (one command per kind of change), `ALSOW` (plain and weighted numbers from one benchmark
  run, half the time), `POOL` (benchmark with the whole-card search), 68 unused scripts in `archive/`. The UI suite's speed
  waits for the owner's talk (owner: "don't act on it till I say so").

## Version 0.9.2 (build 147, 19 October 2026; pushed with the owner's OK)

- **Fix: Mana fills in land by land (owner's choice 4c):** the window opens with "Checking land 1 of 5…" and each land's best
  swap appears as soon as its practice games are done (openFix -> step, manaPick; fixList still gives the same list at once).
  First swap 0.6-1.3 s, all five about 2.5 s on a desktop (unchanged total). "Make the top N swaps" waits until every land is
  checked; the run pauses while a Swap is being confirmed and stops when the window closes or the deck changes. The rows can
  reorder as better swaps arrive (each card going out is still used once).
- **The Ozolith misread (owner's iPad report, 4 Brothers / Heroes in a Half Shell):** "doesn't feed any of the deck's plans
  (+1/+1 counters…)" and "Fits: No specific mechanic". The counters theme needed the words "+1/+1"; it now also reads cards that
  keep or move counters ("put those counters on", "move all counters", "had counters on it"): 16 more cards (The Ozolith,
  Raphael the Muscle, Fate Transfer, Nexus Mentality, Heroic Sacrifice, Leech Bonder...). The Ozolith now reads "Good fit:
  supports the deck's main plan (+1/+1 counters)". engineFit uses the same reading for counter commanders.
- **misread.js (new):** for every commander with play data, the cards its players pick far more than other decks (synergy 0.2+,
  10%+ of decks) that the app says feed no plan (job cards, staples and lands left out). 192 at first. Three plain misreads fixed:
  token doublers worded "If one or more tokens would be created" (Chatterfang, Exalted Sunborn, Divine Visitation: 17 cards)
  are token cards; damage doublers (Gratuitous Violence, Fiery Emancipation, Dictate of the Twin Gods, Solphim: 35) are attack
  and burn cards; "double the power" (Unnatural Growth, Unleash Fury, Devilish Valet: 28) are attack cards. 180 remain: mostly
  plans the engine has no theme for (fliers: Isperia; defenders/toughness: Felothar; goad; untap; casting opponents' cards:
  Gonti), for the owner to decide.
- **Benchmark (SCORECHECK=1):** tuneall 0.246 -> 0.248, @10 0.128 -> 0.130, weighted 0.276 / 0.156 -> 0.279 / 0.158; test and
  holdout identical. Semantics 51/51 (7 new), accept 39, claims 18 unrecognised (unchanged).
- **Tests:** UI suite 115/115. New UI-B147-01 (the land-by-land window); UI-B93-01 and UI-B99-01 wait for the list; the quick
  check's Upgrades test waits for the whole-card search (stale since 0.9.1, it failed on 0.9.1 too). UI-B144-02 (built-ahead
  deck under 2 s) missed by 40-45 ms in two earlier runs on this machine and passed in the final one: worth a look if it recurs.

## Version 0.9.1 (build 146, 19 October 2026; pushed with the owner's OK)

Owner's report from the iPhone: Undo wastes space, the upgrade arrows are tiny, the decklist should group by colour, the
thinking stuck at 2%, and an upgrade suggested twice (shared Avengers Assemble deck).
- **Undo in the deck bar:** right of Save deck on an unsaved deck, right of the "Saved" note on a saved one (undoBtn); the
  floating button is now only on screens without a deck bar, and the space kept under the page for it only when it shows.
- **Previous and Next:** the upgrade sheets' arrows are now "‹ Previous" (Prev on a phone) and a highlighted "Next ›".
- **Decklist by colour:** a Group choice (Card type / Color) above Sort; colour follows the buy list's rule (colour identity:
  one colour, Multicolor, Colorless; lands on their own), remembered in this browser.
- **Stuck at 2%:** holding the picks on screen re-keys the same list, and the background search took the new key for a new
  list and stopped, leaving its note behind. It now checks only that the list is the same (poolRun).
- **A card on two rows:** a repaired row (a pick moved onto another card going out) was not counted as in use when another
  row's dropped pick was refilled, so the refill could pick the same card (Captain America, Wings of Freedom for both Rescue,
  Pepper Potts and Jocasta). inUse now counts every row. Benchmark decks with a card on two rows: 2 of 26 -> 0 (dupall.js).
  Benchmark: holdout and test identical; tuneall @10 0.131 -> 0.128 (weighted 0.159 -> 0.156): the duplicates were counted
  as hits.
- **The upgrade list appears complete (owner: "wait until it's done", on the extra cores):** the whole-card search is now one batch
  on the background cores (poolKeys -> worker 'measure' -> poolApply, applied in poolStep's own order), and Upgrades shows one
  "Thinking..." line until both the score check and the search are done, then the full list at once. Without a worker the page
  searches in slices as before (poolSlices). Every swap value checked identical to the page's own (10,262 swaps on 4 decks).
  Time until the complete list (desktop Chrome, this machine): Turtle Power 13.0 s -> 4.2 s, Doom 18.8 s -> 6.6 s, Wakanda
  10.0 s -> 4.9 s, Avengers 12.6 s -> 6.3 s. On an iPhone expect roughly 2-3x (not measured). The owner suggested a core per card
  type; equal shares keep every core busy (creatures alone are about half the cards), so the batch is split evenly instead.
- **Checks:** UI suite 114/114 (new UI-B146-01 layout, UI-B146-02 the owner's shared deck: the search runs on the cores and
  finishes, no duplicates; share146.txt; UI-ASYNC-01, UI-B141-01 and UI-B81-01 updated for the list that appears complete),
  accept 39, scheck bad 1 (unchanged).

## Version 0.9 (build 145, 19 October 2026; pushed with the owner's OK: "Finish those 2 improvements. When you are done we are complete for the day and you can push the new build as v.9")

The footer now reads "Version 0.9 (build 145)"; window.BUILD stays the number the self-update check compares (version.json
has both).
- **Commanders with little or no play data (fallback pages, UP.fbW 4):** when a commander has no EDHREC page of its own, or
  under 60 cards of data, the app loads EDHREC's theme pages for its creature type and its first theme in its colours
  (`/pages/tags/<theme>/<colours>.json`, e.g. zombies/mono-black; engine fallTags, parseTag; ui.js addFall, saved a week) and
  counts them at UP.fbW of the weight its own data would have. Cards say why ("In 41% of Zombie decks"). Pages EDHREC doesn't
  have (Krakens, Centaurs...) are simply left out. Measured (genstrong.js FALL=1 NOEDH=1, all 26 commanders): strong-deck
  typicality 0.184 -> 0.293, strong-core coverage 0.30 -> 0.52, beats the median strong deck 0/26 -> 12/26 (weights 0.5-6
  tried; 3-4 best). Commanders with their own data: typicality 0.405 -> 0.403 and Mid 0.399 -> 0.396 (Build 144 -> 0.9, all
  26 / tuneall), from the correct Bello reading below; still above the median strong deck for 25 of 26.
- **Two readings of a commander's text (detectStrategy):** a creature type the commander only turns things into ("are 4/4
  Elemental creatures", Bello) is not a type it rewards (UP.cbec, every commander: the correct reading); a commander that keeps
  making creature tokens of one type (Ghoulcaller Gisa's Zombies, Krenko's Goblins; never Humans) leads that type's deck
  (UP.ctok), used only once its own play data is known to be missing or thin (with data of its own, the benchmark was better
  without it: tuneall @5 0.246 vs 0.243). Measured without play data: +0.003 (ctok), -0.002 (cbec).
- **Mid tier, measured properly:** the tournament comparison's "mid match" (52%) built its Mid deck slot by slot from the Apex
  plan, keeping Apex cards over $12 when a slot had no cheaper pick: not a Mid deck. The app's real Mid build (genDeck: filled
  and polished at Mid, every card under $12) matches the tournament lists 39% (tourney.js MID2=1; the best any Mid deck could do
  there is 61%, and their cheap cards are cEDH pieces such as Mental Misstep and Mockingbird). Against strong player decks
  (genstrong.js MID=1): Mid typicality 0.396-0.400, the Apex build's 0.403-0.409, above the median strong deck's 0.334-0.358,
  deck score 93.5 with about one swap of room. Tried and not taken (each within +-0.005): tournament staples and Apex power
  credit at Mid (UP.tsMid, UP.pwMid), leaving over-price slots open for the best Mid card overall (UP.midOpen, UP.budOpen), and
  keeping popular cards during polishing (UP.polP). All off.
- **Exact page/worker agreement fixed:** the worker now gets the page's own combo list (it re-read the combo file against its
  library, and a page that had read combos against a smaller library built different decks; UI-B144-02 caught it), and the
  reference build's cache key now holds everything the build reads (settings, combos, bracket and set lists, fallback pages).
- **Checks:** UI suite 112/112 (new UI-B145-01: no play data, Gisa builds Zombies from the Zombie and theme pages and cards say
  why). Benchmark: holdout and test identical to Build 144; tuneall @10 0.132 -> 0.131 (weighted 0.160 -> 0.159), from the
  correct Bello reading. accept 39 x 2, semantics 44, claims unchanged (20 unrecognised), cisweep 0, edge clean, scheck bad 1
  (the known Doom swap). Tools: `fetchtags.sh` (downloads the theme pages the no-data checks use into proto/data2/tags),
  `fallrep.js`/`fallrep2.js` (no-data builds repeat exactly; page vs a fresh engine), `dbg145c.mjs`/`dbg145f.mjs` (page vs
  worker, step by step); genstrong.js FALL=1 and MID=1, tourney.js MID2=1.

## Build 144 (18 October 2026; pushed with the owner's OK)

Owner: "Add as many [cores] as we can to lighten this up. If we run 6 or 8 and it takes no time that's best."
- **Helper cores (work.js, role=help):** as many as the device reports beyond the page's own, up to 5 (wkCores). The score
  check is now a generator (scoreCheckG; buildPlanG, polishDeckG and genDeckG above it): where it has a batch of swaps to
  measure it hands the batch out, and the builder worker splits it across the helpers and itself. On the page, and with no
  helpers, runSync measures each batch in place (measureBatch, the same function), so results are identical (benchmark and
  every generated list unchanged).
  - A helper holds only the cards its measurements look up (the deck, the cards measured, the reference build, the commander's
    play data and precon, and the combos those touch): about 1,200 cards and 12 MB, instead of 32,000 cards and about 190 MB.
    The reference build's key now counts the whole library's size (LIB.full), since a helper's slice is smaller.
  - Exactness guards: a helper reports any card it looked up and was not given (the builder measures that part itself and sends
    the card next time), and its first answer and every 16th after are measured by the builder too; a helper that differs
    is not used again. Checked: helpcheck.js (9 decks, every swap identical), UI-B144-01.
  - With helper cores, every row's candidates are measured up front in one batch (measureBatch.par), not a batch per row.
  - Measured (desktop Chrome, this 4-core machine): Budget build 4.0 s -> 3.5 s with 3 helpers (about 12%); Apex and Mid builds
    unchanged (their swap measurements are only 0.1 s of 1.4-2.5 s). Only the swap measurements can be shared: the rest of a
    build reads the whole card library and would need a full copy of it per core (about 190 MB each, too much for an iPhone).
    More than 5 helpers would sit idle: a batch is rarely big enough to give more cores a share.
- **Built ahead (what makes it feel instant):** with Generate open and a commander picked, the background cores build the whole
  deck for the settings shown, exactly as pressing Build asks for it (genPrefetch -> WK.spec; genKey decides that two builds
  are the same: the deck's settings, the cards and options, and the data). Pressing Build with those settings opens it at once:
  Captain America (Budget) 6.5 s -> 1.0 s, Kenrith (Mid) 3.0 s -> 0.4 s after 8 s on the dialog; the same deck as building it
  then (UI-B144-02). Nothing from it is shown until Build is pressed; changed settings build again, and a build no longer
  wanted is called off at its next step (genCancel; the worker lets waiting messages in every few batches).
- **Tests:** UI suite 111/111 (new UI-B144-01 helpers, UI-B144-02 built ahead; two tests that started a build and moved on
  after 0.3 s now wait for it to finish, since a finished build opens its deck). Benchmark identical to Build 143 on all six
  sets; generated lists identical (genlist.js); accept 39. Tools: `helpcheck.js` (a helper's slice measures exactly like the
  full engine), `libuse.js` (which library reads a swap measurement makes: none), `dbg144.mjs` (0-N helpers: same decks,
  times, memory), `dbg144b.mjs` (built ahead), `prof4.js` (a warm build's profile).

## Build 143 (18 October 2026; pushed with the owner's OK, together with Build 142)

Owner: "1a. Yes. Increase cores 1 at a time until we find the best settings. 2a. yes. 2b. Yes fix this so the app is more
like players choices."
- **Speed, exact (same decks, same benchmark):** card names are normalised once and kept (norm), the commander's play data is
  looked up without re-reading split-card names (edhOf), creature-type matches are kept on the card (matchAim), and two small
  helpers no longer build throwaway strings. Generation about 25% faster: the test set's Apex and Budget builds 110 s -> 80 s
  on a desktop; a Budget build 20 s -> 15 s, Apex 12 s -> 9 s. Checked: every generated list identical (genlist.js), and
  the benchmark identical to Build 142 on all six sets.
- **One background core (work.js):** a generated deck (Generate, Build by theme, From your cards, Build a new deck, Regenerate
  the open slots) is built by a Web Worker running the same engine files, with the page's own card library, play data,
  combos, bracket lists, set lists, owned cards and settings sent to it. The page stays responsive and the Thinking spinner
  keeps moving (during a build the page ran 85 timer ticks in the background vs 0 before). Without a worker, or if it
  fails, the page builds the deck itself (genDeck, the same function). The decks are the same card for card (UI-B143-01).
  A half-built deck is never shown: the new deck opens once it is built. A second build pressed meanwhile waits with a note.
  The plan helpers (planAll, planInstall, syncPlan, planNeed) moved from ui.js to engine.js so both sides share them.
- **Designed ahead while choosing:** with Generate open and a commander picked, the background core designs the reference build
  for the settings shown (it depends on the commander, mechanics, colours and sets, not the price level), so pressing Build
  skips that step: the wait after pressing Build 2.9 s -> 2.0 s (Kenrith, desktop). Settings changed afterwards just design a
  new one; nothing from it is shown. The worker reads every card once when the card data arrives (warm-up).
- **More cores: measured, not added yet.** Memory per core: about 140-220 MB (the worker's heap in Chrome; the page itself is
  about 190-240 MB). What more cores could speed up: the swap measurements are about 28% of a Budget build, and they can only
  be spread across cores if they are known before the build asks for them; only about 41% are (keyrec.js: the list's own
  picks plus the swaps the previous round measured). Estimate: 5-10% faster per extra core for about 200 MB each. Next step
  per the owner's plan: check the one background core on the iPhone (Safari reloads a tab that uses too much memory), then
  decide on a second.
- **Players' choice (owner's option C, limits 2a):** a card at least 25% of this commander's decks run (and at least 10 points
  more than run the card going out), that the deck score sees as about even (no worse than -0.1), is listed among a row's
  alternatives as "Players' choice · in N% of decks" with "Score about even" (or its real gain when it raises the score a
  little but loses to the cards above it). One per price column; never a land (the stored practice games can't measure a land
  swap, so its 0 is not "about even"); only cards the engine already found legal, in colour and in price; only with 100+ decks
  of play data. "Make every swap" leaves them out. A pick the score check would otherwise drop, with nothing raising the score
  for that slot, stays as a Players' choice pick (rare). Settings UP.plc 0.25, plcS -0.1, plcG 0.1, plcD 100.
  Count after the score fixes below: 27 across the three sets (tuneall 17 in 13 decks, holdout 8, test 2), and real players
  add all 27 (100%), against 93-95% for the picks that raise the score (pccount.js).
- **Score blind spots (owner's option B, 2b):** blind.js lists cards real players add (25%+ of upgraded copies) that the score
  rates below the floor, with the parts that go down. Before: 9 of 472 (15%+: 30 of 920). Fixes, by the rules:
  - **Cost reducers are ramp (UP.costR):** a permanent that makes the spells you cast cheaper (Ruby and Jet Medallion, Goblin
    Warchief, Dragonspeaker Shaman, Herald's Horn) gives that mana every turn. One-time reductions ("this spell costs") and
    instants or sorceries are not.
  - **Ramp is not counted as flood (UP.rld 2):** extra ramp still makes up for missing lands, but whether it floods the deck is
    left to the mana part's practice games; the balance check counted it a second time and marked down the cheap ramp players
    add (Farseek, Rampant Growth, Nature's Lore: -0.16 to -0.19 stored, +0.04 to +0.07 on fresh games).
  - **Creature tokens count as creature-type support (UP.ttok):** a card that keeps making tokens of the type counts as three of
    it, a one-time maker as one. Teval makes a Zombie Druid whenever cards leave the graveyard, so a Zombie lord is supported.
  - **Altar of Dementia is a sacrifice outlet that mills (UP.altar):** it works with any creature; payoffs that need power
    (Fling, Greater Good) still need big creatures.
  After: 5 of 472 (15%+: 24 of 920). Most of what is left is a real trade-off (Farseek on top of a deck already over its land
  count means a land should go too; the spare-land swaps say so) or within the practice games' noise.
  Benchmark (Build 142 -> 143): holdout @5 0.295 -> 0.300, @10 0.209 -> 0.211, sum 15.73 -> 16.39 (weighted 0.322 -> 0.326,
  0.244 -> 0.245, 19.24 -> 19.94); test @5 0.303 -> 0.298, @10 0.196 -> 0.191, sum 5.98 -> 5.70 (weighted 0.321 -> 0.317,
  0.215 -> 0.210); tuneall @5 0.244 -> 0.246, @10 0.127 -> 0.132, sum 9.24 -> 10.02 (weighted 0.274 -> 0.276, 0.154 -> 0.160,
  14.16 -> 14.66). Generator: strong-deck typicality 0.409 (same), beats the median strong deck 11 -> 12 of 13; tournament
  match 59%, core 57% (same), Mid match 53% -> 52%.
- **Checks:** accept 39 x 2, semantics 44, claims unchanged (20 unrecognised), cisweep 0, edge clean, scheck bad 1 (the known
  Doom swap). UI suite 109/109 (a first run failed only the new Players' choice test, which used a card the test deck already has;
  fixed). New tests UI-B143-01 background core, UI-B143-02 Players' choice, UI-B143-03
  blind-spot fixes. The UI tests now wait for generation (startPlan, regenBuild and regenPlan return promises).
- **Tools:** `genlist.js` (generated lists, to prove a speed change changes nothing), `prof2.js`/`prof3.js` (where generation
  time goes), `keyrec.js` (how predictable the swap measurements are), `pccount.js` (Players' choice count and hit rate),
  `blind.js` (score blind spots), `dbg143.mjs` (background core: same deck, timings, memory per core).

## Open decisions

- ~~EDHREC land count in the app~~: decided, our own land formula (see above). Found in Build 104's cleanup: the tests and
  benchmark set each commander's land target from EDHREC's average land count, but
  the app never reads it, so app targets can differ by a land (Wakanda: 37 in the
  app, 36 in tests). Hooking it up would change land targets, the Lands alert,
  spare lands and upgrades; needs the owner's go-ahead and a benchmark run.
- ~~Unpopular pick chip~~: decided (option B), done in Build 134. It shows only for a
  big gap: the alternative out-scores the pick by 0.2 and half again, and the pick is
  run by 3 times as many players (and 10% more of all decks). Alternatives carrying it:
  24% -> 9% over every benchmark precon. Its pop-up now gives both play rates.
- **Published-guides spot-check (17 Oct, Build 134 tools):** `node guidecheck.js ../candidate
  [--detail]` compares our rows with 9 written guides for the 5 test precons
  (`guides/guides.json`: Draftsim, EDHREC, Card Kingdom, Wargamer). A check only, never for
  tuning. Build 134: we offer 44% of the guides' adds somewhere (24% as the Apex pick); a
  guide also cuts 30 of our first 56 cuts. The guides' own swaps lower our deck score on
  average (-0.11; ours +0.57). Blind spots worth a look: Sheoldred, the Apocalypse and
  Yawgmoth for Doom (almost no Doom players run them, so never candidates), Swords to
  Plowshares for Turtle Power (18% of players add it, no removal slot), Brightglass Gearhulk
  for Wakanda.
- ~~Tramplesaurus cut accuracy~~: done in Build 135 (owner chose fix A, fewer swaps). Our cut order was
  right; we offered too many swaps. A swap is now left out when its card out is a precon card not among the
  10 players cut most and fewer than 15% of upgraders add its replacement (76 of 80 such swaps went against
  players). Ghalta: 26 swaps -> 17. The list says how many were left out. Benchmark: first 5 unchanged
  everywhere; @10 tuneall 0.119 -> 0.124, test 0.196 -> 0.198, holdout 0.199 -> 0.205; whole-list sums up
  on every set (tuneall -0.96 -> 8.69). `rowfeat.js` dumps the per-row evidence.
- **Guide blind spots (looked into 17 Oct, Build 135):**
  - Shipped: a slot whose pick does no core job may take a card that also does one (sjx), and a slot whose
    pick barely helps (under 0.2) may show off-theme cards as alternatives, never as its pick (weakD/weakA).
    Matches or beats every benchmark number.
  - Not closed: Sheoldred and Yawgmoth (Doom), Swords to Plowshares (Turtle Power), Brightglass Gearhulk
    (Wakanda). Each beats our pick only in a slot whose pick is a different kind of card (a creature slot
    for Swords; Sheoldred barely run by Doom players). Every version that showed them (a few top Commander
    staples measured per slot, stN; off-theme picks in weak slots) cost popular alternatives (row@5 0.240
    -> 0.239) or agreement (@10 0.124 -> 0.122), so they were rejected. Open question for the owner:
    should alternatives be matched to the card going out rather than to the pick?
- **Closer plan weighting: tried and rejected (17 Oct, after Build 133).** The
  fit tip's closer weights (2 / 1.75 / 1.5, plus a bonus per extra plan) were
  benchmarked in the engine. Main scorer 5/4.4/3.75: test 0.303 -> 0.281. Milder
  5/4/3.1: test 0.298. Extra-plan bonus +1: test 0.286 (+0.5: no change).
  Upgrade-theme weights alone: no change. Kept as is.
- **Deck score stage 3: tried and rejected (17 Oct).** Smoother protection,
  recursion and tutor credit, and part credit for a combo one card short: test
  0.303 -> 0.298 (weighted 0.322 -> 0.318). Code left in engine history, not shipped.
- **Strength-weighted yardstick (17 Oct):** `WEIGHT=3,6 node bench.js ...` counts
  bracket-3 decks 3x and bracket 4+ 6x. `wcheck.js` checked it: valid (overlap with
  strong-only decks 0.77 -> 0.82, same build ordering) but adds little. Used as a
  second must-not-drop check. Baseline: tuneall 0.268, test 0.322, holdout 0.318.
- **Deck-score ranking** (tried in Build 82, reverted in 83): ranking slots purely
  by the app's deck score cut agreement with real players to about zero, so popular
  picks lead. Revisit only with proof the score beats player data.

### Settled

- Every swap and every add asks first (Builds 95 and 97).
- Spare lands may come out for other cards, one per land over the target, never at
  or under it (Builds 100 and 103).
- Each upgrade row shows its Highest score card beside the popular picks (Build 103).

## Known limits

- Checking upgrades takes about 1 s longer per deck (2-3 s on a phone) because
  alternatives are measured; the list shows "checking" meanwhile. Decks over their
  land target take a few seconds more (spare-land swaps need fresh practice games).
- Opening a card's window to put it in a full deck takes about half a second (it is
  weighed against every card it could replace).
- Deck history records changes saved through the app's buttons.

## Standing rules from the owner

- Never commit, push or go live without the owner's go-ahead for that build.
- Don't change the upgrades engine without discussing it first.
- Brackets are a label, not a cap. Budget is strictly under $3, Mid under $12;
  price never limits Apex.
- Alternatives do the same job. The best card for a slot is its Apex card, shown
  once (never copied into a cheaper slot).
- Popular picks lead; the deck score must confirm every suggestion (no swap may
  lower it).
- On-theme cards (commander's set, theme creature types) win when about equal.
- Every button that removes or rules out something asks first, and so does every
  swap, every add and every button that changes many cards at once.
- When a deck runs more lands than its target, the extra lands may come out for
  other cards (never more than the surplus).
- Plain English in the app and in reports. No runtime AI.
- Replies to the owner: plain English, and every long reply ends with a short
  summary (done / works / needs the owner). Any question asked in a reply is
  repeated, reworded, at the end of that summary. Several questions or inputs are
  always numbered so the owner can answer by number.
- **Never compromise the rules (owner, 18 Oct).** A correct reading of the Magic rules always wins over the benchmark (first case:
  no maximum hand size is not card draw).
- No regression: otherwise every engine build must match or beat the last benchmark.
- Tests: run only the checks the change can affect, and always its regression check before going live (the table in
  `WORK_SESSION_HANDOFF.md`, section 3). No tests for changes that can't affect them.
- The MTG Commander Deck Manager spreadsheet never supplies benchmark inputs.

## Done (recent builds)

78-81: score-checked upgrades, alternatives, theme preference, fix-this menus,
Path to Apex, generated decks built in full, buy list, undo, duplicate.
82-87: inline alternatives, confirmations, popular picks with Unpopular pick
chip, decklist sort and role filter, Considering list, compare decks, deck history.
88-96: Upgrades tab counts cards, card window shows the best swap first with a
+/- score on every option, no suggestions already in the deck, Add to buy list
and Add to library, players at your table, Mana alert Fix this (land swaps),
confirmations on many-card buttons, fit tip weighs plans more closely.
97-103: every swap and add asks first, a typed card is weighed against the whole
deck, Add to Buy List on every upgrade row (Remove suggestion, Alternate Options),
Mana fix handles missing lands, spare lands can go for other cards (Show menus,
card window, Upgrades list; never past the surplus), too many lands is flagged,
the buy list keeps your place, Show / Show all buttons, Highest score pick per row.
104: removed leftover code (old cloud-save hook, unused Buy list window, three
unused helpers and button handlers); about 3 KB smaller.
105: Collection value on the Library (total, by colour and type, most valuable cards,
how many owned cards are in decks).
106: Card search Sort (most played, cheapest, most expensive, by job, best for the
open deck).
107: deck folders and coloured tags (Build panel; My decks filters, rename and delete
folder); a player, folder or tag filter that no longer exists resets instead of hiding
every deck.
108: Share link (the deck packed into the link; opening it shows the deck with Save to
my decks).
109: Best by job (top ramp, draw, removal, wipes and protection for a deck, with price,
play rate and score chips).
110: Price history (tracked cards keep their price by card-data date; the card window
shows the change with a small line; held-pick chip shows now vs when picked).
111: Card search "What it does" (18 plain-word filters such as Makes Treasure, Sacrifice
outlet, Draws when a creature dies), each checked against known cards.
112: Decks you can build (commanders your library fits best; the top three built from your
cards with how much you own and what the rest costs; Generate from my cards).
113: Lands helper (lands against target, colour sources needed against what the deck has,
popular lands it lacks, buttons to the land swaps); no engine change.
114: our own land formula (lands = 31.5 + 1.6 × average mana value − 0.32 × cheap ramp + 0.72 ×
landfall cards, 30–42), fitted to 52 commanders' real averages (misses by ~1.5 lands vs 2.2 for a flat 37);
used by the app, the tests and the deck generator; benchmark unchanged.
115: Game Changer extra rows trimmed to the room left under Bracket 3's three (deck and picks
counted); Apex only; benchmark unchanged.
116: phone layout (phones only): no tagline, Continue card with recent decks above the tiles,
full name in the landscape header, tighter landscape margins; iPad and desktop unchanged; footer shows
the real build number.
117: phones: Continue card moved under the home tiles (above Profile), extra deck buttons removed; sideways
phones get shorter home tiles and a one-column deck screen where the page scrolls (no fixed boxes), one row of
deck buttons and smaller tabs; iPad unchanged.
118: smarter deck score, stage 1: in Apex decks, tournament staples (fast mana, free or one-mana interaction, the best lands)
are worth more when this commander's players run them (full value at 10% of decks), say why, and the best lands count toward card
quality and may replace basics (up to 6 past the usual room). Tournament comparison (`tourney.js`, 10 commanders, 20 top-16 lists each):
our cards matching 49% to 57%, shared core 45% to 55%, missed core cards that raise the score 24 to 43 of 80, Mid 45% to 50%;
upgrade benchmark agreement@5 unchanged (0.233 / 0.286 / 0.292); popular picks still lead the upgrade list.
119: printed names: a reskinned reprint shows the name on your card (the TMNT precon's "Humongous Fungus" is Corpsejack Menace)
with the card's own name beside it, in the deck list (A–Z by the name shown, search finds either) and the card window; kept from
precons and pasted lists, read from the precon list for decks saved earlier, and set by choosing a printing. A picture of a printing
with another name says so (Sword of Fire and Ice's Marvel "Patriotic Shield"). Backup of Build 118: branch backup/build-118.
120: the card window's tip agrees with the measured swap: a swap that raises the score leads with an upgrade label (Major / Strong /
Small upgrade, No real change, Lowers the deck score) and the parts of the score that moved; the card's own rating (play data, fit)
stays a separate line instead of "Poor fit" beside "+2.4" (Wakanda Forever, Greater Good -> Sword of Fire and Ice).
121: the deck's working area is sized again once fonts and images finish loading and never taller than the visible screen (Upgrades
scroll lock after reload; reproduced only partly in Chromium, needs an iPad check).
122: the mana check counts every colour source the way the generator does (nonbasic lands, rocks and dorks) and suggests new basics only
when they close 2+ missing colour sources; the banner says how short the deck is (a fresh Peter Parker deck no longer gets "colours shifted").
123: Apex progress is deck power: the Budget, Mid and Apex reference builds are scored as whole decks and the deck's score is placed
on that scale (Apex = 100); a chosen printing changes price and deck value, never score or tier (tested).
124: Buy list page (Buy list and Library in the top bar and on Home): a group per deck plus Other, export of the chosen groups as plain
"N Card Name" lines with quantities added up; Add all to buy list on the decklist (commanders and nonbasic lands, no basics, twice adds
nothing); putting a buy-list card into its deck asks before taking it off that deck's list; no "Spent" figure.
125: a New deck tile ends the Decks grid; Flip on two-faced cards swaps picture (same printing) and face name/type.
126: Build stats tab between Decklist and Upgrades holds the analysis (health and fixes, score breakdown, bracket, curve, mana);
Upgrades keeps the deck score and Apex progress at the top.
127: upgrade sheets (default; List still there): one upgrade at a time as four cards (your card, Budget, Mid, Apex) with score
change and price; tapping one shows its details and actions below; arrows move between upgrades.
128: Build panel: player, folder and tags fold into one line; Regenerate upgrades sits at the panel's foot; the tier explanation folds.
129: Apex is the strongest pick: a row's cheaper pick that raises the score more becomes its Apex pick, and the Apex reference build
takes a cheaper stand-in when it makes the whole deck score higher (Doom: Apex 94.6 -> 96.2, above Mid 95.8). Benchmark agreement@5
0.231 / 0.281 / 0.283 (was 0.233 / 0.286 / 0.292); making the highest-scoring card Apex outright was measured and rejected (0.018).
130: smarter deck score, stage 2, and "players decide what competes, the score picks the winner". Ways to win rise smoothly (each
finisher adds less than the one before; a winning combo is a small step), so one card can't swing the score more than it is worth;
the scale is shifted so a typical deck keeps its score. Each column's pick is the candidate (in 10%+ of this commander's decks, a
proven staple or a tournament staple; gain at least 0.3) with the best estimate: score gain + 6 x share of players who run it. The
popular card a pick replaces stays first among the alternatives, marked Most played; Mid and Budget never raise the score more than
Apex (a cheaper card that would is listed as an alternative); held picks stay. Buy lists remember the chosen printing (set and price;
exports keep the plain name). Benchmark agreement@5 0.238 / 0.303 / 0.292 (Build 128 0.233 / 0.286 / 0.292, Build 129 0.231 / 0.281 /
0.283); new row@5 (best match among the cards a row offers) 0.240 / 0.303 / 0.292. Tested and rejected on the way: 10-40% floors with the
score alone (agreement 0.05-0.13), lambda 4 (holdout 0.286). bench.js now also prints row@5 and gain@5.
131: Upgrades layout: the filters (view, sort, card type, kind) are one row of drop-downs; the EDHREC chip sits in the stats module
above the Apex progress bar; the bar zooms to the range that matters and marks Budget (bronze), Mid (silver) and Apex (gold) with their
power scores in a legend row (labels never overlap); the empty row under the bar is gone. No engine change.
132: Upgrade paths as folder tabs: Budget, Mid and Apex stacked on the left with swaps and cost; the chosen tier's description,
Apply all and Best deck under $X on the right (opens on the deck's own tier); about half the height. No engine change.
133: customised Build panel: format, mechanics, filters, land colours and generate fold into one-line headers that always show their
settings (open to change them; a section that needs input starts open); fits an iPad screen. The upgrade list keeps its order once
shown (later scores don't move cards); it re-sorts when you leave the tab, change sort or filters, or regenerate. No engine change.
