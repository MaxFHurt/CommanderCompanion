# Commander Companion — handoff (build 1.0.0-rebuild.22, 2026-10-10)

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

    node tests/node/game.mjs          # 117 rules/coach checks
    node tests/node/soak.mjs 20       # random full games, expects "0 problems"
    python3 -m http.server 4180 --bind 127.0.0.1 &   # needed by the Playwright suites
    python3 tests/tracker_test.py     # 40   (also writes tracker screenshots)
    python3 tests/game_ui.py          # 26
    python3 tests/flows_ui.py         # 25
    python3 tests/net_ui.py           # 16
    python3 tests/shots_more.py       # game screenshots, phone + iPad

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

## Recent state / open items

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
- `styles/app.css` grew by appended override sections (13–24). Later sections win. A cleanup
  pass that folds overrides into their base rules would help, but re-check screenshots after.
