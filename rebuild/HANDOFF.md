# Commander Companion — handoff (build 1.0.0-rebuild.36, 2026-10-29)

Read this before changing anything. It records what the app is, how it is built and shipped,
what each part does, the owner's rules, open notes, and the roadmap.

## 1. Where things are

- Repo: `MaxFHurt/CommanderCompanion`, branch `main`. The app is the `rebuild/` folder; the repo root only
  forwards to it. The Deck Builder (formerly Deck Companion) is `rebuild/deck/` — see README.md, Deck Builder.
- Live: https://maxfhurt.github.io/CommanderCompanion/rebuild/ (GitHub Pages, serves `main`).
- Live build: **1.0.0-rebuild.78** (2 Nov): Build 78: 171 more cards run by themselves, most-played first (long tail): Earthbend; Discover and optional energy payments inside effects (energy paid as the step resolves, counting energy the ability gave first); wipes with qualifiers (nontoken, nonartifact, non-Dragon, no counters, you don't control); 'equal to' amounts read as X; Syphon Mind, Noxious Gearhulk, Jace Wielder of Mysteries, Kozilek/Ulamog graveyard shuffles, Soul Shatter, Homeward Path, Balefire Dragon, Mahadi, Persist, Brass's Bounty, Wave Goodbye, Fling, Elixir of Immortality and others; life gained this turn tracked. Tests: mechanics 73.
  Build 77 (2 Nov): Build 77: Deck Builder 0.9.47 (build 192): the green + on upgrades follows the Fix menus' rules (no always-tapped lands, lands only when they make a deck colour, the missing card of a winning combo counts for Win routes; ui/upgrades.js fixesMore, comboWins; test UI-B192-01). The Deck-Companion card-data job pings the free Supabase rules server on every run so the project never pauses (commit db48c60); its new schedule checked (first run at minute 17: 8 Nov 09:17 UTC).
  Build 76 (2 Nov): Build 76: new online games run on a free rules server (Supabase), so no device holds another player's hand
  Build 75 (2 Nov): Build 75: Modular dies transfer, Companion, voting (Will of the council, Council's dilemma); Deck Builder 0.9.46
  Build 74 (2 Nov): Mechanics: **Suspect** (menace and can't block while suspected), **Devour** (as it enters, sacrifice any number of creatures; N +1/+1 counters each), **Sunburst** (a counter per colour of mana spent; the spell records colorsSpent), **Awaken** (a cast mode that adds the land animation). Glossary labels updated. Still by hand, each a sizeable piece: Companion (a companion slot in decks and import, the outside-the-game zone, the {3} action; conditions per card), Vote / Council's dilemma (per-card outcomes), Modular's dies transfer, and the rare old mechanics (Banding, Haunt, Cipher, Assist …). Tests: every suite (catalog 378).
  Build 73 (2 Nov): Mechanics: **Forage** as a cost (exile three graveyard cards or sacrifice a Food, the player chooses), **Vanishing**, **Fading**, **Modular** and **Bloodthirst** counters as it enters, Vanishing and Fading upkeep (new condition b49-own-counters), **Landwalk** (attack-time cant-be-blocked), **Decayed** (can't block; sacrificed at end of combat after attacking). Connive, Explore and Populate were already automatic: Connive and Populate are now labelled so (Connive tested). Modular's dies-transfer stays by hand (glossary: partial). Deck Builder 0.9.45 (build 190): ENGINE_ROLES also adds the removal, draw or ramp the game engine reads on cards the Deck Builder reads only partly (69 cards; role-compare now measures the Deck Builder's own reader); benchmark unchanged. Tests: every suite (catalog 374), Deck Builder UI 128/128. Practice games with bots: held by the owner (7 Nov).
  Build 72 (2 Nov): Stylesheet cleanup (roadmap 7.1): the last two unused rules removed with tools/css-clean.mjs; the numbered override sections had already been folded; style_diff 32/32 identical (one capture-noise screen re-captured). Glossary (src/data/mechanics.js): Manifest, Manifest dread, Clash, Gift, Monstrous, Renowned, Blood, Die rolling and Coin flips marked automatic (the engine reads them; tests cover each). ROADMAP.md: the round of 7 Nov and what is still open. Tests: every suite green (soaks 0 problems, forge 301/302).
  Build 71 (2 Nov): Deck Builder 0.9.44 (build 189): **card interactions** (roadmap 5.2): the card window lists the cards in the open deck it works with and why — one produces what the other's trigger waits for (creatures dying, creatures entering, life gain, card draw, +1/+1 counters, lands entering, instants and sorceries, cards going to the graveyard, sacrifices). deck/engine/library.js IX, ixOf, worksWith; display only (no score change). E.g. Blood Artist: Viscera Seer and Lightning Bolt (creatures dying), Ajani's Pridemate (life gain). Tests: Deck Builder UI 128/128, quick check 12; the main app is unchanged since build 70 (every suite passed).
  Build 70 (2 Nov): **Hosted games move between devices** (roadmap 4.1): Host tools → Move hosting to another device. The host sends the whole game to a connected player's device (seats relabelled: that device's seat is played on it directly, the old host's seat from the old host as a client), which reopens the room under the same code (session.js takeOverHosting, retried); the old host drops its saved copy and rejoins (handOverHosting); everyone else's reconnect loop finds the new host and gets their seats back. Only when each player has their own device. room.js handover/online, joinRoom onHandover. net_ui 30 (hosting moves, the old host rejoins as a client, the new host's edit reaches the other player). Deck Builder 0.9.43 (build 188): **the game engine's reading fills gaps** (roadmap 5.1, first step): lists.js ENGINE_ROLES (64 nonland cards the Deck Builder's reader gave no role; ramp, draw, removal, wipe, counter; written by tools/role-compare.mjs --lists, which no longer counts your own permanents as removal targets) is used only when the reader finds no role. Benchmark unchanged (agreement@5 0.252, weighted 0.281). Tests: every suite (online_ui 40 when run alone; it timed out once while the benchmark shared the machine), Deck Builder UI 128/128.
  Build 69 (2 Nov): **The player toolbox** (roadmap 3): a card resolved by hand is done with staged steps — a tool done to a target, to "that card" (what the last step moved or made), to you or to each opponent; the tools the card's unread text calls for come first (src/game/toolbox.js TOOLS, rankTools). Done applies the steps together through the engine (applyToolSteps): on several devices the other players accept first (a manual-resolution proposal), on one device the screen asks the table. The steps are remembered for the card (game.rememberedOutcomes, offered next time) and an owner ruling keeps them as `moves` (Worker deployed 7 Nov; flow.js stages a stored ruling's moves). Screen: openGuided in src/ui/game/panels.js; the old immediate edit buttons are gone (Host Tools stays). The wip patch is applied and removed. Tests: every suite (flows_ui 29 with a toolbox step: "gains 2 life … applied by hand"; offline_ui after the precache list took toolbox.js).
  Build 68 (2 Nov): **All suites pass again** (owner, 7 Nov: "fix everything except the 10k rulings left"): node suites, three soaks with 0 problems, forge 301/302, every Playwright suite, the full Deck Builder UI suite 128/128. Fixed tests: UI-B145-01 (EDHREC theme pages now kept in deck/tools/tests/suite/tags/), tracker_test (Scryfall's 404 for a made-up card), and seven Deck Builder tests that read the old layout and labels (B162 was a real bug: the badges were <b> like the Sheets names; now <span>). Rules: Moraug's extra combat comes before the second main phase (game.extraBeforeMain2, flow.js toAfterCombat); Kardur's goad covers creatures the opponents get later (game.goadEach, rules.js goadersOf; rule 611.2c); a land that becomes a copy makes the copied mana (transactions.js refreshManaSource); Dredge is offered for every player a resolving draw affects, asked of that player; Echo and Cumulative upkeep paid with an action that needs no choice (keyword-triggers-b49.js, may-pay doEffects). Deck Builder 0.9.42 (build 187): owned printings (profile.libPrint) and the 16 built-in precons' printings (lists.js Name@set#number); the card window says "This upgrade's swap"; Path to Apex in Show all details no longer repeats the health list. Card data job (Deck-Companion main): defense, reprint and flavor names kept; schedule at minute 17 (on-the-hour runs started 7-8 hours late). New tools/role-compare.mjs: the Deck Builder's roles against the game engine's reading for every card.
  Build 67 (2 Nov): Deck Builder 0.9.41 (build 186): **one printing system for every card** (owner, 7 Nov: "all cards follow the right printing"). Order: 1 the player's choice (printing picker; never replaced), 2 the source's exact printing (psc + pcn: precon, pasted "(SET) 123" line, share link), 3 the name it was listed under (pn: a reskin's printed name), 4 the commander's set (themed printings, shown only), 5 the default printing. Every way into a deck stores those hints; `pinPrints` (deck/ui/deck.js) turns them into printings 75 per Scryfall collection request (printed-name-only cards: one exact-name search each), on import, precon load, share links and once per deck per session on opening, so older decks are fixed too. It replaces the precon-only pinning and the one-request-per-card import lookup (which dropped printed names). Share links now carry each card's set and number and the commander's printing. A code that resolves to a different card is ignored. Tests: quick check 12; Hatsune Miku precon 87/87 and commander; a pasted list with set codes and a printed name only; a share-link round trip; an old precon repaired on opening; a player's choice left alone.
  Build 66 (2 Nov): Deck Builder 0.9.40 (build 185): no Scryfall card download in the app (owner, 7 Nov). Cards come from the daily snapshot `cards.json.gz` on the Deck-Companion card-data branch (one ~5 MB file, written every day at 4 a.m. New York time by card-data.yml); once a day the app reads `meta.json` and downloads again only when the snapshot is newer with a different card count (new cards). Scryfall's paged search stays only as the fallback. `snapshotUpdate`, `snapMeta` and the checkReleases change in deck/ui/storage.js. The job's file now also keeps defense, reprint and flavor names (Deck-Companion branch claude/card-effects-fixes-rcosbu, commit 3a9d2c0; takes effect when merged to Deck-Companion main). Tests: quick check 12; a fresh load with Scryfall's API blocked fills all 32,183 cards from the snapshot.
  Build 65 (2 Nov): Deck Builder 0.9.39 (build 184): precons load in the printings they actually contain (owner: the Hatsune Miku precon showed the original printings of its reskinned cards). EDHREC lists each card's set and collector number; `pinPrecPrints` (deck/ui/deck.js) fetches those printings from Scryfall's collection endpoint (75 per request) and pins each entry (art, set, rarity, printed name, price) and the commander's printing. Precon decks loaded before this are repaired once when opened (`repairPrecPrints`, looked up by name in EDHREC's catalogue). Tests: quick check 12; Hatsune Miku: 87 of 87 entries pinned, reskins named (Shalai → Miku, Voice Over All), and an old-style copy repaired on opening.
  Build 64 (2 Nov): Deck Builder 0.9.38 (build 183): build 63's fix never reached the card window: handleAct rebuilds the clicked button as {dataset: {p}} so data-cut was lost (the check passed because that row's cut was also the best measured cut). The click now passes data-cut (5th handleAct argument). Sheets: tapping the tile that is already chosen opens the card, also leading with the row's swap (data-n / data-cut on .s4). Tests: quick check 12; on three Wakanda Forever rows the card window from the row and from the tile leads with that row's card (Queen Mother Ramonda, Loyal Retainers, Nakia).
  Build 63 (2 Nov): Deck Builder 0.9.37 (build 182): a card opened from an upgrade row leads with that row's swap (the row's card coming out, measured the same way); the other cuts follow. Upgrade buttons carry data-cut (deck.js side, alternatives a3); the card handler sets S.rowCut, wantHtml in deck/ui/cards.js puts that cut first; closing resets it. Cards opened from search or elsewhere are unchanged. Tests: quick check 12; Wakanda Forever: Dyadrine opened from its row leads with Greater Good.
  Build 62 (2 Nov): Deck Builder 0.9.36 (build 181): the green + also covers Curve (a spell costing 2 or less, not an X spell), Win routes (a finisher, isFinisher) and Mana (a land making two or more of the deck's colours, one in a mono deck; any land when practice games run out of lands more than colours) — `fixesMore` in deck/ui/upgrades.js. Tests: quick check 12; on Wakanda Forever (Ramp, Curve, Mana alerts) the + lands on Avacyn's Pilgrim and Farseek (Ramp, Curve), Path to Exile, Swords to Plowshares, Heroic Intervention, Swiftfoot Boots (Curve), Jhoira's Familiar, Foundry Inspector (Ramp).
  Build 61 (2 Nov): Deck Builder 0.9.35 (build 180): badges on upgrade card images (owner, 2 Nov). GC on every Game Changer, and a green + on a card that helps a health alert the deck has now (ramp, card draw, removal, wipes, or lands when short; tooltip names it). `cardBadges` / `HFIX` in deck/ui/upgrades.js (HFIX filled by statsHtml), used by every upgrade card renderer: rows (deck.js side), three-column rows (a3), Sheets tiles (.s4), plan rows, Highest score, swap list. Tests: quick check 12; checked on Wakanda Forever (Explore, Gleaming Splendor, Sword of Forge and Frontier get +).
  Build 60 (2 Nov): Deck Builder 0.9.34 (build 179): a shorter Upgrades page (owner's screenshot, 2 Nov). The stats bar is one row (the EDHREC chip moved up; the health line left it); under the power bar sit only the health line and Show all details. Path to Apex, the 'Next: Budget, N power to go' line (now leading the pop-up's Health part) and Lands helper moved into Show all details; Best by job took Lands helper's place in the toolbar row. Show by impact in the pop-up closes it. Tests: quick check 12; UI-B81, B113, B126, B165 updated and passing (B81 had been failing since 0.9.29: the Fix buttons moved into the pop-up).
  Build 59 (2 Nov): Deck Builder 0.9.33 (build 178): putting the app away with a deck open sends the edits to the online profile (the Deck Builder's hide handler calls `pushDeckEdits`), closing the last profile-sync gap. Tests: quick check 12, online_ui 40 (new: a deck renamed while open reaches the online copy when the page is hidden).
  Build 58 (2 Nov): Deck Builder 0.9.32 (build 177): a Back button on every page (item 6) except the home screen and an open deck (which has All decks), and every page or tab change is a history entry, so the browser or phone back gesture returns to the previous page and closes an open pop-up (`trackSpot` and the popstate handler at the end of deck/ui/events.js; the button in render, deck/ui/cards.js). Pop-ups still close with their × (not a Back button). Tests: quick check 12, a back-navigation check. With this, all eight planning-chat items are done or checked.
  Build 57 (2 Nov): Deck Builder 0.9.31 (build 176): searched cards replace by function (item 8). `bestCuts` (deck/engine/mana.js) marks cuts sharing the incoming card's jobs (`same`, why 'Also removal') and cards doing a job the deck is short of (`shortJob`); the search panel (deck/ui/cards.js) never offers a shortJob cut, ranks the same-job cuts by measured score change, and falls back to every cut when none shares the job or the deck is short of the incoming job. Item 4 checked: nothing hides Budget or Mid picks after a tier is passed (no pick is marked beaten; picks show whenever they raise the score), so no change. Tests: quick check 12, a bestCuts check on Wakanda Forever.
  Build 56 (2 Nov): Deck Builder 0.9.30 (build 175): swap gains shown in power (`gainTxt` in deck/ui/upgrades.js: power = score as a share of the Apex build, as the bar), on upgrade chips, the swap sheet, alternatives and Path to Apex. Item 1 (power as the only headline) was already met. Tests: quick check 12, UI-ALT-01 and UI-B78-01 (updated to read power).
  Build 55 (2 Nov): Deck Builder 0.9.29 (build 174): **deck health in one colour-coded line** (red / yellow /
  green from the worst alert that isn't ignored; info never colours it; names the problem areas) in the Upgrades bar and on Build
  stats, and **a positive one-line lead** under the power bar ("Stronger than this deck's Budget build … Next: Mid, N power to go").
  Everything else (power against each build, "To reach <next build>" part by part, every alert with its numbers, why it matters,
  Fix and Ignore, then what is going well) is in the **Show all details** pop-up (`openDeckPop`, `DECKPOP` in deck/ui/upgrades.js).
  Below Budget now reads **Foundation** (internally still 'Starter'). Tests: Deck Builder quick check 12; UI-B101/B123/B126/B165
  updated to the new layout and passing. Minimum tests by the owner's choice.
  Build 54 (2 Nov): Deck Builder 0.9.28 (build 173): **closing a deck sends the edits to the online
  profile** straight away on a linked device (`pushDeckEdits` in `deck/ui/cards.js` → `pushProfileNow` in online-profile.js, which
  loads the profile, deck and playmat stores first). Tests: online_ui 39 (new: a deck renamed and closed reaches the online copy),
  Deck Builder quick check 12. Minimum tests again by the owner's choice.
  Build 53 (2 Nov): **profile sync between devices** (`src/app/online-profile.js`). A device linked to an
  online profile takes the newer copy when the start screen opens, if it has nothing new of its own; it saves on the start screen,
  every minute and when the app goes to the background. The backup now also carries the online games list (so online games
  show on every device) and the game in progress when it is played on one device (`currentGame`; the other device asks
  "Continue your game?" and never swaps it in silently). Both devices changed → nothing is overwritten, the player chooses on
  Profile → Online, as before. Times alone (`updatedAt`) are not a change. No Worker change: profiles were already stored in
  chunks up to 12 MB. **Released with minimum tests (owner, 2 Nov):** node game, mechanics, smoke and catalog, online_ui (38, five
  new sync checks) and game_ui; the soaks, forge, tracker, net, challenge and Deck Builder suites were not run for this push.
  Build 52 (1 Nov): **work paused by the owner** to fix the Deck Builder on iPad (0.9.27, build 172: the
  header sat under the status bar and frames ran under the screen's corners and home bar; every edge now keeps to the safe area,
  `rebuild/deck/cc-theme.css` end and `fitWork`'s `safeBottom()` in `deck/ui/cards.js`). Also released: the legend rule (its controller
  chooses), ward on activated abilities and ward "Pay N life", phasing, mutate, offline after the first launch (`precache.json`
  from stamp.mjs, sw.js), and QR pairing for nearby devices without internet (`src/net/local-link.js`). **What is not finished is
  listed in PROGRESS.md, "Paused: not finished".** The half-built player toolbox is kept out of the app as `wip/toolbox-engine.patch`
  (repo root).
  Build 51 (1 Nov): **the top 1,000 complete** — every one of the 1,000 most-played Commander cards runs by itself.
  The last 31: copy lands (`card.copyOf`, effects.js definitionFor), Dauthi Voidwalker (void counters), Kutzil, Ripples of Undeath, Return
  the Favor, Conduit of Worlds (`lockAfterNextCast`), Culling Ritual (split mana), Puresteel Paladin and Danitha (equip cost changes in
  rules.js activationReduction), Tibalt's Trickery, Hydroelectric Specimen, Trouble in Pairs, Archdruid's Charm, Springheart Nantuko,
  Dredge (Life from the Loam: the draw step and resolving draws ask draw or dredge), Bloodchief Ascension and The Gitrog Monster (one
  `put-into-graveyard` event per card, triggers.js), Inkshield, Buster Sword, The Soul Stone (harness, ∞ abilities, exile-a-creature costs),
  Mycosynth Gardens, Ripples of Potential, Breach the Multiverse, Throne of Eldraine (chosen-colour payment), Promise of Loyalty (vow
  counters), Splice onto Arcane, Cut a Deal, Approach-style "If X, Y instead", Moraug, Mechanized Production, Kardur.
  Whole catalog: 21,001 of 31,770 (Moonshadow restored after the count: 21,000 + 1).
  Build 50 (1 Nov): **card fixes, batch 2**. Audit fix first: keyword lines are now read without their reminder
  text, so cards with keywords the terms key marks "by hand" (Echo, Bushido, Cumulative upkeep …) are no longer counted as automatic
  (about 580 were; the honest count for build 49 was 20,226). Engine bug fixed: "Target creature gets +X/+X and gains <keyword>" dropped
  the +X/+X (about 140 cards, e.g. Blossoming Defense). New keywords: Bushido, Rampage, Afflict, Flanking, Battle cry, Annihilator,
  Dethrone, Melee, Mentor, Training, Evolve, Fabricate, Living weapon, Renown, Soulshift, Extort, Echo and Cumulative upkeep (mana or life),
  Ingest, Backup, Myriad, Enlist, Provoke, Champion (keyword-triggers-b49.js); Umbra armor (regenerates()), Outlast, Embalm, Eternalize,
  Transmute, Reconfigure, Craft (special actions in legal.js / ops.js); Disturb, More Than Meets the Eye (back face, `mode.backFace`),
  Prototype, Bestow, Surge, Strive (cast modes); Read ahead, Amplify, Tribute (as it enters); Ascend (`citysBlessing`, set in sba.js);
  Split second (`splitSecondOnStack`). Wordings: any number of targets, "for each … this way, its controller", "If X, Y instead", Veil of
  Summer colour hexproof, Approach of the Second Sun, Torment of Hailfire, Liliana's −9, Demonic Consultation, Tainted Pact, Mizzix's
  Mastery, Chain of Vapor, Saw in Half, Sword of Hearth and Home, Myr Battlesphere, Boromir, Urza, Expressive Iteration and more.
  Top 1,000: 969 by themselves. Whole catalog: 20,892 of 31,770 (honest build 49: 20,226; 669 newly automatic, 3 honestly back to by hand).
  Build 49 (1 Nov): **card fixes, batch 1** (new wordings live in `src/engine/effects-b49.js`, hooked into
  effects-catalog.js the same way as round 3). Known bugs fixed: extra mana of another colour (Utopia Sprawl, Wild Growth on an Island,
  Fertile Ground's any colour — `manaExtras` in mana-extras.js; payMana taps a source for its extra colour; a hand tap asks the colour)
  and "you may tap or untap" no longer offers "Neither" after the yes/no. New: Gift (asked as you cast; the promised opponent gets it
  first; `castText(…, { gift })`), High Tide-style turn mana, Hideaway (exiled face down, `hiddenExile`), Imprint (Chrome Mox, Isochron
  Scepter), casting copies (`castCopy`, a free-cast queue `flow.freeCastQueue`, uncast copies vanish in sba.js), abilities granted until
  end of turn (`temporaryGrants`), Entwine, Escalate, Spree, Replicate, Casualty, Bargain, Offspring, Squad, The Ozolith, Etali (both),
  Braids, "copy this spell" while it resolves (Sevinne's Reclamation), Midnight Clock, Archaeomancer's Map, Curse of Opulence, Scrap
  Trawler, and conditions for hideaway lands. Leaves-the-battlefield events now carry last-known counters and fire for tokens.
  Top 1,000: 944 run by themselves (was 924). Whole catalog: 20,777 of 31,770 (was 20,624; 156 newly automatic, 3 Spree cards now honestly by hand for one mode).
  Build 48 (1 Nov): **owner rulings** ("stored outcomes"). With the dev PIN (the Dev report PIN) the owner
  saves how a card resolves, for everyone, while playing: "Store outcome" on the resolve-by-hand panel (the steps just taken
  are filled in) and "Correct ruling" on any card's detail view. A ruling can switch the card's automation off ("resolve by
  hand"): the effect then waits on the panel with the ruling shown and its chosen targets listed (flow.js `applyOwnerRuling`;
  a permanent spell still enters, its abilities follow the ruling). Rulings live on the Worker (`GET/POST /outcomes`, key
  `out:<card name>` in the reports object), every device loads them (`src/net/outcomes.js`, cached for offline, refreshed
  every 2 minutes) into `game.storedOutcomes`. The monthly Claude audit treats them as decided and never changes report
  items without the owner's approval (it writes a proposal file and asks). Dev report is the last item in Settings.
  Build 47 (1 Nov): rule corrections and the Dev report. Every manual resolution (with the steps
  players took), manual edit, engine error, agreed undo and upheld challenge is logged in the game (`src/game/corrections.js`)
  and sent to the Worker (`src/net/corrections.js` → `POST /corrections`; Settings → "Send rule corrections", on by default,
  never from localhost test pages). Settings → **Dev report** (PIN, set on first use, hashed on the server) fetches every new
  record from all games, shows a grouped text report to copy to Claude, and "Mark as reported" starts the next one after
  them. The Worker also accepts `X-Report-Key` (secret `REPORT_KEY`) for the monthly Claude audit, once that secret is set.
  Build 46 (1 Nov): more card wordings (subtype targets and pumps, colour-filtered bounce, Threshold /
  Delirium / Metalcraft / Hellbent bonuses, self-suspend, finality, Valakut Awakening, no combat damage …); the soak bot now
  blocks menace attackers with two creatures (that old "refused block" note is fixed). Build 45 (1 Nov): more card wordings — opponent library searches (Bribery, Praetor's Grasp), Clash,
  Fuse, Learn, "Choose target …" spells, hand reveals until it leaves, exile-until-nonland free casts, finality counters, damage
  prevention to you, tap-or-untap, counters from a creature that left. 924 of the top 1,000 and 20,343 of 31,776 Commander cards
  (64%) run by themselves. Build 44 (1 Nov): the whole-catalog card work (section 3, "Whole-catalog card work"): 914 of the
  1,000 most-played cards and about 63% of all Commander cards run by themselves, plus Saddle, Encore, Miracle, Suspend, Plot,
  Boast, Improvise, Emerge, Spectacle, Reinforce, Soulbond, Exploit, stun counters and alternative costs. Build 43 (another
  session): Deck Builder daily prices. Build 42 (31 Oct): on iPhone the screens fill the frame and sit centered in it (section 7). Build 40 (another session):
  Deck Builder 0.9.25. Build 39: 785 of the 1,000 most-played cards run by themselves (RULES_AUDIT.md), Deck Builder power as a
  share of the Apex build. The old standalone Deck Companion (MaxFHurt/Deck-Companion) only forwards to the Deck Builder; the
  owner chose (31 Oct) to keep that repo as it is: its card-data branch (combo list, refreshed weekly by its workflow) and
  test-data branch are still used.
- **Prices (build 43 / Deck Builder 0.9.26):** the Deck-Companion card-data job runs every day at 4:00 a.m. New York time and
  publishes `prices.json.gz` (each card's cheapest TCGplayer price, via Scryfall). The Deck Builder downloads it once a day
  (`loadPrices` in `deck/ui/storage.js`) and shows prices with source and time, e.g. "$5.00 at tcgplayer.com at 04:00 EST"
  (`priceStamp`). Full card downloads still come from Scryfall as before; a download newer than the file keeps its own prices.
  Same build: every card's text reading (`tags`) is now done in small idle slices after card data loads (`warmTags`), so
  the first deck opened no longer stalls for seconds; UI-B144-02 times Build with syncRecs off (the app's own setting).
  Full UI suite 128/128 (3 groups side by side), quick check 12/12. Old copies can't overwrite decks: the Deck Builder saves under cc.* names and reads
  dc.profile only when nothing is saved under the new name.
- **Visual masters:** the owner's approved screens were in `design/` until build 30 and are kept in git history
  (`git show b0755ed:rebuild/design/visual-master-game-ipad.png > master.png`). Match them.
- Primary devices: iPad landscape (home-screen icon) and iPhone landscape. Design master is
  844×390; `1rem = 10px` there and scales with the viewport. iPad tier is
  `@media (min-width:1000px) and (min-height:700px)`.
- Static ES modules, **no build step, no framework**. `index.html`, one stylesheet
  `styles/app.css`, code in `src/`. README.md has the folder map.

## 2. Owner's rules (do not break these)

- **Every push updates `PROGRESS.md`** (owner, 1 Nov 2026): the live build, the top-1,000 and whole-catalog counts, what
  changed (a new log entry, newest first), known limits and what's next.

- **Never push to `main` (ship a build) without the owner's explicit confirmation.** Commit
  locally, report what is ready, and wait for a yes.
- **Do only what was asked; ask if a change goes beyond the request.** When the owner says
  "don't build", only answer or take notes.
- **Stop anything you start** (test servers, background jobs) as soon as the work is done.
- **Use the owner's approved art. Never replace art with something you drew** unless asked.
  If art has a defect, repair the image file and keep the original (landing button originals are
  in `assets/img/landing/orig/`). Art source so far: the owner's "Complete Handoff 2026-10-04" pack.
- Top logo is always the horizon-style logo. The "CC" icon is `assets/img/ui/crest.png`.
- Top bar (game): Home, Card ID, Chat, logo, Help, Settings, Profile — all the same gem-pill style.
  No duplicate buttons elsewhere.
- Buttons in one row must be identical in style and size; check alignment against frames.
- Hand cards must never be larger than battlefield or land cards (three equal rows).
- Playmat must be clearly visible — keep overlays light.
- The jewel is a gem, not the logo. Its label is an **action** ("PLAY LAND", "CAST SPELL",
  "ATTACK", "TO COMBAT", "END TURN", "PASS"…). Pressing it lists all options with the
  suggestion first and a reason. It pulses when an action is available.
- Tip bar: with a player's **Advice** toggle on it always gives advice and explains *why*.
- Card counters (+1/+1, keyword counters, etc.) are anchored to a specific card.
- Available Mana shows only the commanders' colors plus colorless, on one evenly spaced row
  (`manaPoolHtml` in `src/ui/card-view.js`, `identityOf` in `src/ui/screens/game.js`).
- Guided Play enforces the rules: no casting without mana, no "Play anyway" outside Free Play.
- Resolving by hand must give all the right options and say in as few words as possible what to
  do; targeted effects ask for the target first.
- **Look at screenshots before claiming a visual fix.** Playwright screenshots never show real card
  images (no network); the owner's device screenshots are the truth.

## 3. Architecture

- `src/game/` is DOM-free. `controller.dispatch(intent, actor)` → `flow.js` `settle` (state-based
  actions → ops → special free casts → triggers → stack/priority → step queue → auto-advance) →
  `view.js` builds a per-viewer redacted view (hands, face-down cards and foretold cards hidden;
  includes `coach` from `coach.js`: tip text, jewel label, jewel option list).
- Ops (`ops.js`) ask for choices with `ask(key, specFn)` and replay; nothing changes until every
  answer is in, so cancelling half-way is safe. Requirements/targets: `requirements.js`
  (`gatherRequirements`, `candidatesFor` with hexproof/shroud/protection). Legality: `legal.js`.
- `src/engine/` is the older rules engine (patched): `transactions.js` (all state changes as
  commit types), `effects.js` (`compileEffectText` turns rules text into effects; `applyEffects`),
  `triggers.js` (`collectTriggers`), `combat.js`, `rules.js` (mana planning, play/attack/block legality).
- Sessions: `src/app/session.js` — `local`, `host-player`, `host-device`, `client`; `deviceMode`
  single-device / multi-device. `src/net/` PeerJS rooms (BroadcastChannel loopback with
  `?net=loopback` for tests). Checkpoints persist in IndexedDB (`src/app/checkpoints.js`); a host
  restart reopens the same room and phones reconnect to their seats.
- **Online games ("play over time")**: Start Game → a mode → *Online games*. The shared copy lives in a
  Cloudflare Worker (`../cloud/worker.js`, live at https://commander-companion-games.ajw226.workers.dev, one
  Durable Object per 6-letter game code). Every device runs the game itself (`src/app/online-session.js`,
  role `online`) and saves after its own moves with the version it was based on; a save based on an old
  copy is refused (409), the device takes the newer copy and repeats its own actions on it. Devices check
  for new moves every 4 s (20 s after 10 quiet minutes, 60 s in the background). Moves made offline are
  kept in IndexedDB (`cc-online:CODE`) and saved when the connection is back. Setup: the creator picks
  their deck, the number of players and the rules; the others join with the code (joining = accepting the
  rules); the device that sees every seat filled deals the game. This device's games: `src/app/online-games.js`
  (localStorage). Screen: `src/ui/screens/online.js`. No priority timer and no judge in online games.
  Deploy the Worker: `sh cloud/deploy.sh` (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, set in the
  cloud environment). Games nobody opens for 120 days are deleted. Free Cloudflare plan: 100,000 requests a
  day, far more than a few games need.
  **Build 76: new online games run on the rules server** (`cloud/rules-server.mjs`), so no device holds another
  player's hand. Live: the Supabase Edge Function `games` on the owner's free project `wdngytwilqxcdoqtefgg`
  (`https://wdngytwilqxcdoqtefgg.supabase.co/functions/v1/games`), games in the table `public.cc_games` (row level
  security on, no policies; only the function's service key touches it). The server deals the game when the last seat
  is taken, checks every move with the rules and answers with that seat's view (`src/game/view.js`, as a hosted room).
  Seat keys: made on the device (`newSeatKey`), kept in the online games list (carried by the online profile); the
  server stores SHA-256 hashes. Device side: `openServerGame`/`serverSession` in `src/app/online-session.js`, calls in
  `src/net/online.js`. Tests: `tests/node/rules-server.mjs`, and `tests/online_ui.py` runs it inside
  `cloud/dev-server.mjs` under `/rules`. Deploy: `sh cloud/deploy-games.sh` (the Supabase access token is a network
  secret for api.supabase.com in the cloud environment). Games made before build 76 still use the Worker path.
- **Online profile** (build 32): Profile → Online. The profile backup (same as Save Profile) is kept by the
  same Worker under a private 12-letter key (`/profiles/KEY`, kept 2 years after last use). A linked device saves
  again by itself when the start screen opens and the profile changed (`src/app/online-profile.js`); if
  another device saved first it never overwrites — the player chooses. Load on a new device with the key.
- **Combat (build 32):** "Whenever ~ deals combat damage" (no "to a player") and "… to a creature" fire when
  attacking or blocking, once per damage step (`combat-damage-dealt` event). Creatures can attack planeswalkers
  and battles (`targetId` on an attacker; defending player = the planeswalker's controller / battle's protector).
  Damage removes loyalty / defense. Sieges get an opponent as protector as they enter (asked when there are
  several); a defeated Siege is exiled and its back face is cast by hand.
- **Sharing codes (build 32):** `src/ui/share-code.js` — Copy code, Text invite (share sheet, link) and a QR code
  on the online waiting room, the room lobby and the Table Tracker's "Devices in this room". Links: `?join=ABCDEF`
  (online game), `?room=ABCD` (hosted game), `?table=ABCD` (Table Tracker); `main.js` opens the join screen and
  drops the code from the address. "Scan QR" on the join screens reads a code with the camera (`src/vendor/jsqr.js`,
  loaded only when scanning; QR drawing `src/vendor/qrcode.js`; licences in `src/vendor/LICENSES.md`). A QR scanned
  with the iPhone Camera app opens Safari, not the home-screen app (iOS keeps their saved data apart) — scanning
  from inside the app is the way for players who use the home-screen icon.
- **Counter choices (build 32):** "put … counters on a/another creature you control" asks which creature as it
  resolves (no hexproof check, no question with one choice); "another target creature" leaves out the source;
  "up to one target creature" may choose none.
- **Trigger reading (build 33):** `src/engine/trigger-subject.js` reads the subject of any trigger ("a land you
  control", "another nontoken creature you control with power 4 or greater", "Omnath or another Elemental you
  control", "equipped creature", a legendary card's short name) and `generalMatch` in `src/engine/triggers.js` uses it
  for every event, plus plural verbs ("an opponent casts / draws"), "their second spell each turn" (per-player
  `counters.castThisTurn`), steps ("draw step", "first main phase", "each upkeep"; new `draw-step` event), "plays a
  land" (`played` on the land's enters event), "searches their library" (`library-searched`), "is dealt damage",
  "cast or copy". Anything it does not understand falls back to the older readers below it.
  **Forge answer key:** `node tests/node/forge-triggers.mjs [--list]` builds a small game for each Forge trigger of
  the top 1,000 cards (`tests/fixtures/forge-top-commander.json.gz`, GPL-3.0, tests only — the app never loads it;
  Scryfall cards in `tests/fixtures/top-commander-cards.json.gz`): 99.0% fire when they should, 100% stay quiet
  for the wrong player. Run it after any trigger change.
- **Spells and effects (build 34):** "Its controller creates / draws …" (`remember-controller` + `forPlayerBind`:
  done for the target's controller — Beast Within, Swan Song, An Offer You Can't Refuse); "Its controller may search
  … for a basic land" (`their-search`, ops.js asks that player — Path to Exile, Assassin's Trophy); "Counter target
  noncreature / instant or sorcery … spell" (`spellFilter` on stack targets); "unless that player pays {N}" and
  "that player may pay {N}. If the player doesn't, …" (`unless-pays`, ops.js asks the payer; `pay-mana`
  transaction — Rhystic Study, Smothering Tithe, Esper Sentinel, Mystic Remora); triggers remember `eventPlayer` and
  `eventAmount` ("that player", "that much life"); several keywords at once ("gain hexproof and indestructible");
  "All creatures get -X/-X"; "Destroy all creatures with mana value 3 or less"; "can't be blocked this turn";
  "return a land you control to its owner's hand" (bounce lands); casting: free with a commander
  (`commander-free` mode), additional costs (`additionalCost`: sacrifice, discard, pay X life). Keyword lines'
  reminder text is no longer read as an ability (the cycling lands' fake "Draw a card.)").
- **More effects (build 35):** conditions checked as they resolve (`condition`: "if you control three or more
  artifacts", "if this artifact is tapped", "if it's not your turn"; the subject is read by trigger-subject.js);
  "up to one target …" for any instruction (`optionalTarget`); wheels (`wheel`), flicker (`flicker`), Chaos Warp
  (`chaos-warp`), devotion (`{ kind: 'devotion' }`), "life equal to the life lost this way" (`lifeLostThisWay`),
  "untap up to N lands" (`upTo` on card-selection), "can't be countered" (respected by counter-spell), several
  keywords on one target, "Non-Human creatures you control get …", "return all attacking creatures …",
  "it deals N damage to you" (`toController`).
- **One-off spells (build 37):** Brainstorm (`hand-to-top` + 'brainstorm' gather: arrange with `pick`), Ponder /
  "put them back in any order" (scry `reorderOnly`), "You may shuffle." ('yes-no'), Sensei's Top
  (`source-to-library-top`); delayed effects ("at the beginning of the next turn's upkeep", "At the beginning of
  your next main phase, …") become `{ kind: 'delay' }` → `game.delayedTriggers`, fired by `dueDelayedTriggers`
  in triggers.js (Arcane Denial, Mana Drain with `counteredManaValue`); modal "Choose one or more" (Farewell) and
  "you may choose both instead" with a commander (`modalSpellSpec` → `oneOrMore`, `commanderBoth`); Force of Will's
  alternative cost (cast mode 'force-exile', `exileFromHandForCost`); Growth Spiral (`hand-to-battlefield` +
  'hand-card' gather). An instant or sorcery now goes to the graveyard after its effects (608.2n), so Farewell's
  "Exile all graveyards" no longer takes the spell itself.
- **More wordings (build 39, `compileMoreClauses` in effects.js):** mass pumps and keywords with filters
  (`filterFromNoun`: "creatures you control with power 4 or greater", "nontoken", colours), "where X is …" (`set-x`),
  "it / that creature" pointing back at the last target (`bridgePronoun`), "Those creatures gain …", sacrifices "of their
  choice", "You may pay {N}. If you do, …" (`may-pay`, asked in ops.js) and "You may X. If you do, Y" (yes/no),
  Fog/Maze of Ith (`game.combatPrevention`), Silence (`game.castLocks`), flash and "can't be countered" permissions, no
  maximum hand size, multi-mana sources (`manaAmountForAbility` with game context), Channel abilities from the hand and
  "return this card from your graveyard" abilities (`abilityZone` in legal.js), "Activate only if/during/once"
  (`activationRules`, unknown ones count as by hand in the audit), morbid (`game.creatureDiedTurn`). Looting fixed: a
  discard after a draw in the same spell can choose the cards about to be drawn (`plusDraw`).
- **Whole-catalog card work (built on branch `claude/card-effects`, shipped as build 44):** from the owner's card-by-card handoff
  (every Oracle card), the most common wordings still resolved by hand were automated, measured over all 31,776
  Commander-legal cards (Scryfall oracle-cards 2026-10-31; see RULES_AUDIT.md, "Whole catalog"). New modules:
  - `src/engine/effects-catalog.js` — more instructions, tried after the older readers in effects.js: self / enchanted /
    equipped / "that creature" wordings ("it" = the event's card, "that creature" = the other creature in a block or the one
    dealt damage, bound in ops.js `runTrigger`), "another target …", regeneration (shields, used by every destroy path,
    SBA and combat), keyword actions (monstrosity, adapt, bolster, explore, connive, amass, incubate, support, the Ring),
    energy / experience / poison / rad counters, Classes ("Level N", one level at a time, sorcery speed), creature lands and
    "becomes a creature" (`animate`), token copies of "that creature", end-step clean-up of what was just made or moved
    (`lastCreated` / `lastMoved` bindings), "doesn't untap during its next untap step" (`skip-next-untap`), "exile it
    instead if it would die" (`exile-if-dies`), Oblivion Ring family (`linkedExile` / `untilLeavesExile`, returned in
    triggers.js `queueTriggers`), Flickerwisp returns, copying spells (copies controlled by the copier, "choose new targets"
    asked as the copy resolves), extra combat phases (`game.extraCombats`, flow.js `nextPhase`), Birgi's kept mana, Timetwister
    family, Snapcaster flashback (`grantedFlashback`), dice, win/lose the game (`counters.lostGame`, read by `evaluateLosses`),
    player protection from everything. Multi-sentence instructions (`compileCatalogSequence`): look at / reveal the top N
    cards and distribute them (`dig` requirement: the player picks, "any order" asks for the order), Fact or Fiction piles,
    casting a revealed card free (`game.flow.freeCast`), impulse draw (`card.playPermission`, read by casting.js `castModes`,
    expired in phase.js), hand disruption (Duress: the caster sees the hand, `hand-pick`), Timetwisters.
  - Conditions (effects.js `parseCondition` / `checkCondition`): "instead" upgrades (Scute Swarm, Cabal Ritual), trailing "if"
    with "Otherwise", intervening "if" before library searches (Land Tax), lands with different names, "if you cast it".
  - `src/engine/triggers-catalog.js` — trigger wordings read before the older ones (turned face up, cycling, monstrous,
    untapping, second main phase, scry/surveil, crime, becomes the target, damage wordings, tapping for mana, transforms,
    crewing, Class levels). New events: `scry`, `surveil`, `crime`, `becomes-target` (ops.js `announceTargets`),
    `postcombat-main-start`, `untapped` in the untap step, `tapped-for-mana`, `class-level`, `crewed`, `die-rolled`,
    `special-request` (venture / initiative / rebound asked as their own step). The audit probe has a second, wider pass
    (`probeTrigger`) so triggers the game does fire are not reported as never firing.
  - `src/engine/overlay.js` — `withOverlay(card, def)` used by every definition lookup (helpers `defOf`, effects
    `definitionFor`, triggers/transactions `defFor`, combat `definition`): temporary type/P/T changes (creature lands, Crew,
    "base power and toughness"), Class levels and level-up blocks (only the reached levels' text is seen).
  - `src/engine/mana-extras.js` — extra mana when tapping (Mana Reflection, Nyxbloom, Crypt Ghast, Caged Sun, Gauntlet of
    Power, Mirari's Wake, Zendikar Resurgent, Wild Growth-style Auras): counted by `playerManaAvailability` and `payMana`
    (surplus stays in the pool). Only extra mana of the source's own type is counted.
  - Keywords: Crew (special action), Riot, Unleash, Skulk, Afterlife, Unearth, Scavenge (graveyard special rows), Level up,
    Madness (discard → exile → its owner may cast it for the madness cost), Rebound, "When you cast this spell" triggers,
    Auras that enchant a player (Curses) or a graveyard creature card (Animate Dead), Cycling spells.
  - Speed: compiled texts are cached (`COMPILE_CACHE`) and the catalog patterns see the card's name as `SELFNAME`, so the
    regular expressions are built once.
  - Tests: `node tests/node/catalog.mjs` (357 in-game checks, every new family; choices answered by the player who makes them).
  - Later in the same work (build 44): keyword mechanics as special actions or keyword triggers — Saddle (`saddledTurn`,
    "attacks while saddled"), Encore (tokens that must attack one player: `combat-restriction` with `playerId`), Miracle
    and Suspend (special triggers in ops.js, suspended cards are trigger sources in exile), Plot (`card.plotted`, cast free
    later as a sorcery), Boast (`activationBlock`), Improvise and Emerge (casting.js), Spectacle (`game.lostLifeTurn`),
    Reinforce, Soulbond (`card.pairedWith`, bonuses in attachments.js `syncAttachments`), Exploit (`exploited` event);
    alternative costs "pay … rather than pay this spell's mana cost [if …]"; stun counters (`setTapped` and the untap step);
    damage to planeswalkers/battles removes loyalty/defense (`markDamage`); Expend (`player.manaSpent`); coin flips;
    reveal-until; divide damage/counters as cast (`distribute`); emblems (`player.emblems`, read by combat.js
    `staticSources`); casting from the graveyard with "exile it instead" (`exileInsteadOfGraveyard`); "one or more cards leave
    your graveyard" once per resolution (`resolutionId` on events); library searches for land types filter correctly.
  - The handoff's ledgers were filled from the before/after audits (CONFIRMATION-LEDGER.csv / ABILITY-LEDGER.csv; delivered
    with the session, not in the repo): engine confirmation is the audit, not a card-by-card review of rulings.
- **Rules audit:** `node tools/rules-audit.mjs cards.json [report.json]` (Scryfall card list). Findings for the
  1,000 most-played Commander cards: `RULES_AUDIT.md`. `auditTriggers` now also checks that a trigger ever fires
  (`triggerCanFire` probes every game event).
- Screens `src/ui/screens/`, in-game popups `src/ui/game/`.
- Table Tracker is separate: `src/game/tracker.js` (pure state), `src/ui/screens/tracker.js`,
  hosted via `src/app/tracker-session.js`, `src/net/tracker-room.js`, `src/ui/screens/tracker-join.js`.

## 4. What the app does (feature map)

### Modes
- **Guided Play** (fully tracked, rules enforced), **Free Play** (every tool, nothing illegal,
  no Challenge), **Table Tracker** (life/counters/commander damage, no cards).
- One shared device, or hosted: Host (playing), Host device (table/judge view, not playing), Join.

### Host powers, Challenge, Undo, Rules (build 28)
- **Judge powers** (Host Tools, Judge mode, Reverse) only for a non-playing host device, or a
  one-device Guided game. `isJudge` in `src/game/controller.js`. A playing host has no special
  powers and proposes changes like any player.
- **Challenge** (hosted games without a non-playing host device): one button where Host Tools
  would be. Every player still in the game must approve; the challenger then proposes a
  correction, which must also be approved, or they see "Correction rejected".
- **Undo:** free on one device and in the Table Tracker (anyone takes back the newest change).
  In multiplayer games it is a table rule (`rules.undo`, off by default): the requester confirms,
  every living player gets Accept/Decline, any decline keeps the play, and never after passing the
  turn. Eliminated players never vote.
- **Rules agreement:** a non-playing host sets the rules alone; otherwise every player accepts
  them before the game. Profile default rules are **House rules** with a chip next to the toggle.
- **Host screens / Judge mode:** host device switches TABLE / JUDGE; Judge mode shows every play
  with a legality mark and Reverse. The table never shows hands.

### Guided Play rules engine
- Automatic: mana and casting legality, priority and the stack, combat with evasion and keywords
  (flying, reach, trample, deathtouch, lifelink, first/double strike, menace, vigilance, haste,
  indestructible, infect, wither, toxic, fear, shadow, intimidate, horsemanship), targeting
  (hexproof, shroud, protection), state-based actions every settle, common effect wordings,
  triggers, library search, modal spells, tokens, anthems, equipment and auras.
- **Ways to cast** (`src/game/casting.js`): normal, kicker/multikicker, buyback, flashback,
  jump-start, retrace, escape, evoke, dash, blitz, overload, foretell (special action),
  morph/megamorph/disguise (face down: `definitionId` → `face-down-2-2`, real id in
  `realDefinitionId`; owner and judge can see it), adventure. Cost changes: commander tax,
  affinity, undaunted, "costs {N} less for each", eminence, Thalia-style increases; convoke
  (creatures pay last), delve. Graveyard/exile cards you can cast glow.
- **Keyword triggers** (`src/engine/keyword-triggers.js`): prowess, exalted, evoke, dash, blitz,
  undying, persist, sagas (lore counters; sacrificed by state-based action), cascade, storm,
  discover, monarch and initiative. Cascade/discover/storm/venture/initiative choices resolve in
  `runSpecial` (`src/game/ops.js`); dungeons in `src/data/dungeons.js`.
- **Hand/special actions** (`specialRows` in `src/game/legal.js`): cycling, typecycling,
  ninjutsu (priority stops after blockers for it), turn face up.
- **Replacement effects** (`src/engine/replacements.js`): token/counter/life-gain doublers,
  Hardened Scales, damage doubling/tripling/+N (Torbran), Rest in Peace, Leyline of the Void.
- Also: ward on spells (pay or countered), goad (attack picker preselects it), "until your next
  turn", transform, "damage can't be prevented", exile all graveyards.
- Dies events carry last-known counters and cast mode (`event.last`); a card changing zones loses
  its cast state (`clearCastState` in `src/engine/effects.js`).
- Anything else goes on the stack as **resolve by hand** (`openGuided` in `src/ui/game/panels.js`):
  targets are chosen at cast, one short instruction, each target with its quick actions, Done.

### Magic terms key
- `src/data/mechanics.js`, 373 terms (concepts, keywords, actions, ability words, designations,
  counters, layouts). Each has a summary, rule points, tricky cases, `automation`
  ('auto' / 'partial' / 'manual' / 'info'), hand-resolution steps and quick actions.
  **Keep `automation` honest** when automation changes. `guidedActionsFor` / `guidedHintFor`
  feed the resolve-by-hand panel.

### Content
- **Stats and awards:** `src/game/stats.js` counts damage, biggest hit, spells, cards drawn,
  life gained, tokens per player; the Game complete screen shows awards (Heavy Hitter, Biggest
  Swing, Spellslinger, Card Advantage, Life Gain Leader, Token Maker, Last One Standing). Your
  profile counts only awards you won.
- **Deck Builder** (`deck/`): every deck lives there; analytics, upgrades and generation are its own.
- **Ask the Judge** (`src/data/judge.js`): 86 answers in 7 topics.
- **Card ID:** name lookup, plus camera scan with a card frame and Tesseract OCR (iOS-capable).
- **Profile:** games, wins, decks, achievements, awards, house rules.

### Table Tracker
- Labels, commander art, Monarch crown, tools bar, counters (`CARD_COUNTER_GROUPS`), game log with
  Ask the Judge and Card ID. Hosted: phones change any seat (other seats amber, host blue), Judge
  badge turns red when a player should be out (0 life, 10 poison, 21 commander damage, out player
  still holding Monarch/Initiative). Undo is free; the host reverses anything.

## 5. Shipping (every change, only after the owner says yes)

1. Bump `src/version.js` (`1.0.0-rebuild.N` → N+1).
2. `node tools/stamp.mjs` (writes `build.json`).
3. Bump the cache name in `sw.js` (`commander-companion-vN`).
4. Commit and push `main`. Open apps check `build.json` on open / focus / every 60 s and reload
   once per new version (local games are saved and resumed; hosted/joined games wait).

## 6. Tests (run before every push)

    node tests/node/game.mjs          # 248 rules/coach/judge/undo/challenge checks
    node tests/node/mechanics.mjs     # 62 terms key, targeting, every automated mechanic, awards
    node tests/node/tracker.mjs       # 20 hosted-tracker store checks
    node tests/node/forge-triggers.mjs # triggers against Forge's scripts (expect ≥99% / 100%)
    node tests/node/catalog.mjs       # 357 catalog-effect checks (builds 43-51)
    node tests/node/soak.mjs 20       # random full games (includes the lab deck), expects "0 problems"
                                      # (now and then 1 "refused block … requires at least 2 blockers": the random bot
                                      #  blocks a menace creature with one creature and the game rightly refuses — a bot gap)
    python3 -m http.server 4180 --bind 127.0.0.1 &   # needed by the Playwright suites — stop it after
    python3 tests/tracker_test.py     # 40
    python3 tests/game_ui.py          # 28
    python3 tests/flows_ui.py         # 25
    python3 tests/challenge_ui.py     # 13   (challenge, correction, voted undo, rules agreement)
    python3 tests/net_ui.py           # 26   (hosted game: Table / Judge, reverse, watcher)
    python3 tests/online_ui.py        # 33   (online games, copy/invite/QR scan with a fake camera, online profile; starts cloud/dev-server.mjs)
    python3 tests/tracker_net_ui.py   # 44   (hosted Table Tracker)
    python3 tests/shots_judge.py      # host-screen screenshots
    python3 tests/shots_more.py       # game screenshots
    python3 tests/style_diff.py capture DIR / compare A B   # pixel check for CSS changes
    python3 tests/scan_ui.py          # Card ID scan (needs internet)

Playwright needs the version matching /opt/pw-browsers (chromium-1243 → `pip install playwright==1.63.0`; was 1.56.0). Lab test cards for
mechanics are in `tests/fixtures/lab-cards.mjs` (the `lab` deck).

Stylesheet: `node tools/css-clean.mjs [--write]` removes unused selectors and always-overridden
declarations; verify with `tests/style_diff.py` (build 28 cleanup was pixel-identical on 32 screens).

## 7. Known issues and limits

- Online games: hands are hidden on screen, but each device holds the whole game (it runs the rules), so
  someone reading the app's data with developer tools could see other hands. Fine between friends.
- **Backdrop frame (build 36, owner 29 Oct: on iPhone it had no top edge and its corners were cut off):** the art
  `assets/img/ui/background.webp` now has a top edge made by mirroring its own bottom edge and corners (original
  kept in `assets/img/ui/orig/background.webp`). On phones (`max-height: 699px`) the backdrop is inset 12px / 5px
  so the frame's rounded corners stay inside the screen's, and `.page` gets a 14px top margin so headers sit under
  the frame. On iPad the art still covers the screen (sides cropped as before, now with top and bottom lines).
- **Content inside the frame on iPhone (build 41, owner 31 Oct: "everything else sits too high now; center all screens
  vertically within these borders"):** installed on the home screen, iOS reports the page shorter than the screen; the
  backdrop was already sized from the screen (`--cc-screen-h`), so on phones (`max-height: 699px`) `#app` and the pop-up layer
  get the same box (5px in, `max(100dvh, --cc-screen-h) - 10px`), and `.page` keeps 10px clear of the frame's bottom edge.
  iPad unchanged (owner to check at home).
  Build 42 (owner, 31 Oct: "still spaced wrong on iPhone"): the content sat high because the bottom padding added
  iOS's bottom safe area (about 21pt in landscape) and the top had none. On phones the home screen, pages, game and Table
  Tracker now use the larger of the two at both ends (37px above and below on the home screen). Choose Game Mode is left as
  is: its art carries its own frame (moving it showed two frames). Test with the safe areas set by hand (Chromium has none).
- Ward works for spells only, not activated abilities.
- Still resolved by hand: mutate, suspend, spectacle, phasing, fuse, splice, cipher, attractions/stickers, and anything the terms key marks
  'manual' or 'partial' (e.g. split/fuse, flip cards, Room, Class, attractions).
- The legend rule is not automated.
- Cross-device rooms (games and Table Tracker), the precon catalog (MTGJSON) and the camera scan
  are tested only in one browser, not on real hardware.
- **iPad home-screen black strip** (iPadOS 26 WebKit bug 301108): build 22 switched the status bar
  style to `black`; the owner must delete and re-add the home-screen icon. Not yet confirmed.
- Cached card definitions from builds before 28 keep the old mana cost for split/adventure cards
  until the deck is re-validated.
- `styles/app.css` still has appended override sections (16–32); folding them into their base
  rules is optional cleanup (verify with `style_diff.py`).

## 8. Roadmap

**The complete list of every open change is `ROADMAP.md` (2 Nov 2026).** The notes below are older detail.

**Next rules work (owner, 29 Oct: "start wherever you deem best"):** see RULES_AUDIT.md (785 of 1,000 automatic).
1. The rest of the by-hand spells (~110: Chaos Warp, Arcane Denial, Brainstorm, Deflecting Swat …), trigger effects
   (~125) and activated abilities (~110), most-played first; Forge's `A:`/`SVar` lines are the answer key.
2. Extra mana when tapping: done (build 43 same type, build 49 other colours and any colour).
3. Rare trigger wordings (Class levels, "from anywhere", Kutzil, Trouble in Pairs).

**Paused (owner, 1 Nov: "pause all other work … until I have data to press forward with")** — see PROGRESS.md, "Paused: not
finished": the player toolbox (`wip/toolbox-engine.patch`), stylesheet cleanup, and the card long tail.

**Done in build 52 (owner, 1 Nov: go):** QR pairing for local multiplayer (host offer → joiner answer, over a phone or iPad hotspot
without internet; room codes stay for remote play) and offline use after the first launch. Both need checking on the owner's devices.

**Needs the owner's real devices**
- Hosted rooms between separate phones and iPads (games, Judge mode, Table Tracker).
- Card ID camera scan on iPhone/iPad.
- iPad home-screen black strip after re-adding the icon.
- Whether Personal Hotspot can be switched on with no cell signal, and Safari's local (mDNS)
  connection candidates over a hotspot.

**Rules engine, when wanted**
- (Ward on activated abilities, the legend rule, mutate and phasing: done in build 52.) Suspend, spectacle; more effect wordings
  (measure which cards real decks resolve by hand most and automate those first).

**Later / bigger**
- Native iOS wrapper with Multipeer Connectivity (true Bluetooth). Needs an Apple Developer
  account and a Mac. **On hold (owner, 1 Nov: "We don't want to develop for iOS yet").**
- Fold the stylesheet override sections into their base rules.
