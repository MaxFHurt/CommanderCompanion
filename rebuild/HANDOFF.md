# Commander Companion — handoff (build 1.0.0-rebuild.24, 2026-10-11)

Read this before changing anything. It records how the app is built, how to ship it, and the
owner's design rules learned the hard way.

## Where things are

- Repo: `MaxFHurt/CommanderCompanion`, branch `main`. The app is the `rebuild/` folder.
- Live: https://maxfhurt.github.io/CommanderCompanion/rebuild/ (GitHub Pages, serves `main`).
- Primary devices: iPad landscape (home-screen icon) and iPhone landscape. Design master is
  844×390; `1rem = 10px` there and scales with the viewport. iPad tier is
  `@media (min-width:1000px) and (min-height:700px)`.
- Static ES modules, **no build step, no framework**. `index.html`, one stylesheet
  `styles/app.css`, code in `src/`. See README.md for the folder map.

## Architecture in one paragraph

`src/game/` is DOM-free: `controller.dispatch(intent, actor)` → `flow.js` settles (ops → triggers
→ stack/priority → step queue → auto-advance) → `view.js` builds a per-viewer redacted view
(includes `coach` = tip-bar text, jewel label, and the jewel's option list from `coach.js`).
`src/engine/` is the older rules engine (patched). `src/app/session.js` wraps local /
host-player / host-device / client sessions; `src/net/` does PeerJS rooms (BroadcastChannel
loopback with `?net=loopback` for tests). Screens are in `src/ui/screens/`, in-game popups in
`src/ui/game/`. The Table Tracker is separate: `src/game/tracker.js` (pure state + actions) and
`src/ui/screens/tracker.js`.

## Shipping (every change)

1. Bump `src/version.js` (`1.0.0-rebuild.N` → N+1).
2. `node tools/stamp.mjs` (writes `build.json`).
3. Bump the cache name in `sw.js` (`commander-companion-vN`).
4. Commit and push `main`. Open apps check `build.json` on open / focus / every 60 s and reload
   themselves once per new version (local games are saved and resumed; hosted/joined games wait).

## Tests (run before every push)

    node tests/node/game.mjs          # 149 rules/coach/judge/undo/challenge checks
    node tests/node/mechanics.mjs     # 64 terms key, targeting, every automated mechanic, awards, analytics
    node tests/node/tracker.mjs       # 20 hosted-tracker store checks
    node tests/node/soak.mjs 20       # random full games (includes the lab deck), expects "0 problems"
    python3 -m http.server 4180 --bind 127.0.0.1 &   # needed by the Playwright suites
    python3 tests/tracker_test.py     # 40   (also writes tracker screenshots)
    python3 tests/game_ui.py          # 28
    python3 tests/flows_ui.py         # 25
    python3 tests/challenge_ui.py     # 13   (challenge, correction, voted undo, rules agreement)
    python3 tests/net_ui.py           # 26   (hosted game: Table / Judge, reverse, watcher)
    python3 tests/tracker_net_ui.py   # 44   (hosted Table Tracker: phones, seats, judge)
    python3 tests/shots_judge.py      # host-screen screenshots, phone + iPad
    python3 tests/shots_more.py       # game screenshots, phone + iPad
    python3 tests/style_diff.py capture DIR / compare A B   # pixel check for CSS changes

Playwright screenshots never show real card images (no network) — the owner's device
screenshots are the truth. **Look at screenshots before claiming a visual fix.**

## Owner's rules (do not break these)

- **Use the owner's approved art. Never replace art with something you drew** unless asked.
  If art has a defect (bad cut-out, matte), repair the image file and keep the original
  (originals for landing buttons are in `assets/img/landing/orig/`). Handoff art source used so
  far came from the owner's "Complete Handoff 2026-10-04" pack.
- Top logo is always the horizon-style logo. The "CC" icon is `assets/img/ui/crest.png`.
- Top bar (game): Home, Card ID, Chat, logo, Help, Settings, Profile — all the same gem-pill style.
  No duplicate buttons elsewhere (the old bottom chassis buttons were removed on request).
- Buttons in one row must be identical in style and size; check alignment against frames.
- Hand cards must never be larger than battlefield or land cards (three equal rows now).
- Playmat must be clearly visible — keep overlays light.
- The jewel is a gem, not the logo. Its label is an **action** ("PLAY LAND", "CAST SPELL",
  "ATTACK", "TO COMBAT", "END TURN", "PASS"…). Pressing it always lists all available options
  with the suggestion first and a reason. It pulses when an action is available.
- Tip bar: when the player's **Advice** toggle is on (set per player on Player Setup, also in
  Game Settings) it always gives advice and explains *why* (see land advice in `coach.js`).
- Card counters (+1/+1, keyword counters, etc.) must be anchored to a specific card.
- Do only what was asked; ask if a change goes beyond the request.
- **Never push to `main` (ship a build) without the owner's explicit confirmation.** Commit locally, report what is ready, and wait for a yes.
- **Host tools / Play anyway (build 23):** Guided Play on one shared device has no Host Tools and no
  "Play anyway"/Force — the rules are enforced. Hosted Guided games give Host Tools to the host
  device (host-player or table/judge view) but still no forcing. Free Play always has both. Logic:
  `canEdit`/`force` in `src/game/controller.js`, `canEdit`/`canForce` in `src/game/view.js`.
  Playwright tracker tests need `pip install playwright==1.56.0` (matches /opt/pw-browsers 1194).

## Host screens and Judge mode (build 24)

- **Hosted games** (`src/ui/screens/game.js`): the host device switches TABLE / JUDGE in the bottom bar;
  a host who plays switches BOARD / TABLE / JUDGE in the left rail. Judge mode = table view + the
  judge's record (every play, legality mark, Reverse). The table never shows face-up hands.
  Record + restore points live in `src/game/controller.js` (`game.plays`, `checkpoints`, `reverse`);
  legality is checked before each play (forced plays show why they were illegal). Restore points
  are memory-only (last 120 plays) — after an app restart old plays show but cannot be reversed.
- **Hosted Table Tracker**: Table Tracker now asks One device / Host (playing) / Host device / Join.
  `src/app/tracker-session.js` (store: record, legality marks, undo, reverse, permissions),
  `src/net/tracker-room.js` (room; sends the whole table — the tracker has no hidden cards),
  `src/ui/screens/tracker-join.js` (code → pick seat or watch). Phones change any seat; changes to
  another seat are flagged amber, host changes blue. The Judge badge/banner turns red when a player
  should be out (`trackerIssues`: 0 life, 10 poison, 21 commander damage). Undo in the tracker is
  free; the host reverses anything. Updates wait while a tracker room is open.

## Built 2026-10-11 (committed locally, not shipped — waiting for the owner's yes)

- **Host Tools / Challenge / Undo / Rules agreement** as agreed: judge powers only for a non-playing
  host device or a one-device Guided game (`isJudge` in `src/game/controller.js`); Challenge →
  approval → correction → approval (or "Correction rejected"); undo is a table rule (`rules.undo`),
  free on one device and in the Table Tracker, otherwise every living player must accept and never
  after passing the turn; players agree to the rules unless a non-playing host sets them; profile
  defaults show a **House rule** chip.
- **Resolve by hand** (`openGuided` in `src/ui/game/panels.js`): targets are chosen when cast; the panel
  shows one short instruction, each target with the quick actions its words call for, and Done.
- **Magic terms key** `src/data/mechanics.js` (373 terms). `automation` says what the engine does
  ('auto' / 'partial' / 'manual' / 'info'); keep it honest when you add or remove automation.
  `guidedActionsFor` / `guidedHintFor` feed the resolve-by-hand panel.
- **Rules automation** (tests in `tests/node/mechanics.mjs`, lab cards in `tests/fixtures/lab-cards.mjs`):
  - `src/game/casting.js` — every way to cast from the card's zone: normal, kicker/multikicker,
    buyback, flashback, jump-start, retrace, escape, evoke, dash, blitz, overload, foretell (special
    action), morph/megamorph/disguise (face down = `definitionId` swapped to `face-down-2-2`, real id in
    `realDefinitionId`; owner and judge see it), adventure (exile, then cast the creature). Cost
    changes: commander tax, affinity, undaunted, "costs {N} less for each", eminence, Thalia-style
    increases; convoke (creatures pay last) and delve.
  - `src/engine/keyword-triggers.js` — prowess, exalted, evoke, dash, blitz, undying, persist, saga
    chapters (lore counters each precombat main; sacrificed as a state-based action), cascade and
    storm (cast triggers), monarch and initiative (designation triggers). Cascade, discover, storm,
    venture and the initiative resolve with choices in `runSpecial` (`src/game/ops.js`); dungeons in
    `src/data/dungeons.js`.
  - Cycling/typecycling, ninjutsu (stops priority after blockers), turn face up: `specialRows` in
    `src/game/legal.js` → `special-action` transaction.
  - `src/engine/replacements.js` — token, counter and life-gain doublers, Hardened Scales, damage
    doubling/tripling/+N (Torbran), Rest in Peace / Leyline of the Void.
  - Ward (pay or the spell is countered), goad (must attack, not the goader, until their next turn;
    the attack picker preselects it), "until your next turn", transform, "damage can't be prevented",
    exile all graveyards, fear/shadow/intimidate/horsemanship blocking.
  - Dies events carry last-known counters and cast mode (`event.last`); a card changing zones loses
    its cast state (`clearCastState` in `src/engine/effects.js`).
- **Content:** game stats per player (`src/game/stats.js`, fed by every event) and end-of-game awards on
  the Game complete screen (your profile counts only awards you won); deck analytics with roles
  (ramp, draw, removal, wipes, counters, tutors), mana symbols vs sources, curve bars and suggestions;
  Ask the Judge has 86 answers (new Casting topic).
- **Stylesheet cleanup:** `node tools/css-clean.mjs [--write]` removes unused selectors and
  declarations a later identical selector always overrides. Checked pixel-identical on 32 phone/iPad
  screens with `tests/style_diff.py`. The override sections (16–24) still exist; folding them into
  their base rules is the next step if wanted (re-check with style_diff).
- **Later (owner deferred):** play without internet. Safari has no Bluetooth, so the plan is
  local Wi-Fi/hotspot WebRTC with QR-code pairing (the QR reader bundled in the app), plus saving
  all app files for offline use on first launch. A native iOS wrapper with Multipeer Connectivity
  (true Bluetooth) is the bigger alternative and needs an Apple Developer account and a Mac.
- **Ship as build 28** once the owner says yes (version, stamp, sw cache v28).

## Recent state / open items

- Pre-existing: with 5–6 players on a phone the tracker's narrow card layout overlaps the life
  number and buttons (see `phone-tracker6.png`). Judge mode on a phone avoids it with a 22rem panel.
- Hosted Table Tracker and game Judge mode are tested only over the same-browser loopback; check
  across real devices.

- **iPad home-screen black strip at the bottom** — iPadOS 26 WebKit bug 301108 with
  `black-translucent` status bar. Build 22 switched to `apple-mobile-web-app-status-bar-style:
  black`. The owner must delete and re-add the home-screen icon; **not yet confirmed on device.**
  If it persists, the strip is outside the web view and CSS cannot fill it. `src/main.js` also
  sets `--cc-screen-h` for the backdrop (harmless; may be removable).
- Hand-off ("Pass the device to …") screen: build 21 removed the prompt line under the name.
- Table Tracker (build 16–17): labels, commander art in avatar, Monarch crown, bottom tools bar
  (Edit Players, Edit Decks, Game Stats, Reset Game | Counters, Life, Status, Mana), uniform
  top pills, Game Log with Ask the Judge + Card ID. Counter presets in `src/game/tracker.js`
  (`CARD_COUNTER_GROUPS`). The owner's mockup is the reference for remaining polish.
- Not verified on real hardware: PeerJS cross-device rooms, precon catalog (MTGJSON),
  camera card scan.
- `styles/app.css` still has appended override sections (16–32). Dead rules are gone (see above).
