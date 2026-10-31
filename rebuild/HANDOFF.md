# Commander Companion — handoff (build 1.0.0-rebuild.36, 2026-10-29)

Read this before changing anything. It records what the app is, how it is built and shipped,
what each part does, the owner's rules, open notes, and the roadmap.

## 1. Where things are

- Repo: `MaxFHurt/CommanderCompanion`, branch `main`. The app is the `rebuild/` folder; the repo root only
  forwards to it. The Deck Builder (formerly Deck Companion) is `rebuild/deck/` — see README.md, Deck Builder.
- Live: https://maxfhurt.github.io/CommanderCompanion/rebuild/ (GitHub Pages, serves `main`).
- Live build: **1.0.0-rebuild.39** (31 Oct). Build 38 (another session): the Deck Builder saves decks as `cc.deckProfile` (was `dc.profile`) with an IndexedDB copy, saves every swap and re-works the upgrade list, and its search measures the strongest cards on every row (deck/ROADMAP.md, 0.9.23); `src/data/deck-builder.js` reads the new name. Build 39: 785 of the 1,000 most-played cards run by themselves (RULES_AUDIT.md) and Deck Builder 0.9.24 (power as a share of the Apex build, Upgrades tab counts cards to swap out, simpler health fixes).
- **Visual masters:** the owner's approved screens were in `design/` until build 30 and are kept in git history
  (`git show b0755ed:rebuild/design/visual-master-game-ipad.png > master.png`). Match them.
- Primary devices: iPad landscape (home-screen icon) and iPhone landscape. Design master is
  844×390; `1rem = 10px` there and scales with the viewport. iPad tier is
  `@media (min-width:1000px) and (min-height:700px)`.
- Static ES modules, **no build step, no framework**. `index.html`, one stylesheet
  `styles/app.css`, code in `src/`. README.md has the folder map.

## 2. Owner's rules (do not break these)

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

    node tests/node/game.mjs          # 197 rules/coach/judge/undo/challenge checks
    node tests/node/mechanics.mjs     # 62 terms key, targeting, every automated mechanic, awards
    node tests/node/tracker.mjs       # 20 hosted-tracker store checks
    node tests/node/forge-triggers.mjs # triggers against Forge's scripts (expect ≥99% / 100%)
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

## 7. Notes from the owner (recorded, not built)

- **No new features until the weekly usage reset.** Take notes only.
- **QR pairing:** let two devices in the same place connect by scanning QR codes (e.g. two iPads
  with no cell service). Room codes over the internet stay the main option for players who are not
  together.
- **Phone hotspot as host:** the hotspot only provides local Wi-Fi; the QR codes carry the WebRTC
  offer/answer so no internet signaling server (PeerJS cloud) is needed; game traffic goes device
  to device over that Wi-Fi. Any device (the phone or an iPad) can be the host.

## 8. Known issues and limits

- Online games: hands are hidden on screen, but each device holds the whole game (it runs the rules), so
  someone reading the app's data with developer tools could see other hands. Fine between friends.
- **Backdrop frame (build 36, owner 29 Oct: on iPhone it had no top edge and its corners were cut off):** the art
  `assets/img/ui/background.webp` now has a top edge made by mirroring its own bottom edge and corners (original
  kept in `assets/img/ui/orig/background.webp`). On phones (`max-height: 699px`) the backdrop is inset 12px / 5px
  so the frame's rounded corners stay inside the screen's, and `.page` gets a 14px top margin so headers sit under
  the frame. On iPad the art still covers the screen (sides cropped as before, now with top and bottom lines).
- Ward works for spells only, not activated abilities.
- Still resolved by hand: mutate, madness, suspend, spectacle, and anything the terms key marks
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

## 9. Roadmap

**Next rules work (owner, 29 Oct: "start wherever you deem best"):** see RULES_AUDIT.md (785 of 1,000 automatic).
1. The rest of the by-hand spells (~110: Chaos Warp, Arcane Denial, Brainstorm, Deflecting Swat …), trigger effects
   (~125) and activated abilities (~110), most-played first; Forge's `A:`/`SVar` lines are the answer key.
2. Extra mana when tapping (Wild Growth, Utopia Sprawl, Crypt Ghast, Mirari's Wake, Caged Sun, Forsaken Monument):
   the mana counter and auto-payer (`playerManaAvailability`, `planMana`) must know a source can give more.
3. Rare trigger wordings (Class levels, "from anywhere", Kutzil, Trouble in Pairs).

**Next (after the weekly usage reset, when the owner says go)**
1. QR pairing for local multiplayer (two-step scan: host offer → joiner answer), working over a
   phone or iPad hotspot without internet. Keep room codes for remote play.
2. Make sure the whole app and saved decks/card images work offline after the first launch.

**Needs the owner's real devices**
- Hosted rooms between separate phones and iPads (games, Judge mode, Table Tracker).
- Card ID camera scan on iPhone/iPad.
- iPad home-screen black strip after re-adding the icon.
- Whether Personal Hotspot can be switched on with no cell signal, and Safari's local (mDNS)
  connection candidates over a hotspot.

**Rules engine, when wanted**
- Ward on activated abilities; legend rule; mutate, madness, suspend, spectacle; more effect wordings
  (measure which cards real decks resolve by hand most and automate those first).

**Later / bigger**
- Native iOS wrapper with Multipeer Connectivity (true Bluetooth). Needs an Apple Developer
  account and a Mac.
- Fold the stylesheet override sections into their base rules.
