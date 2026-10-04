# Commander Companion — rebuild

A clean rewrite of Commander Companion. Static site, no build step: host the folder as-is
(GitHub Pages works) or run `python3 -m http.server 4180` and open it in a browser.

## What is in it

| Area | Notes |
|---|---|
| Table Tracker (2–6 players) | Digital counters for games played with real cards |
| Guided Play | Rules-checked games with hints; guidance level and tips are device settings |
| Free Play | Same screen, everything editable, illegal plays allowed with "Play anyway" |
| Hosting | One device / host a room and play / host device (table + judge view) / join a room |
| Host tools | Life, counters, cards, tokens, phases, stack, rules, undo, veto, end game |
| Deck Editor | Build, import ManaBox files, precon catalog, validate, save |
| Profile | Stats, achievements, playmats, Table Defaults, game history, backup |
| Ask the Judge, Card ID | Rules reference; card lookup with optional camera scan |

## Layout

    index.html            the only page
    styles/app.css        the only stylesheet (1rem = 10px on the 844×390 iPhone landscape master)
    src/version.js        the only version stamp
    src/main.js           startup and screen registration
    src/app/              router, session (local / host / client), setup-to-game steps
    src/ui/               screens, popups, shared widgets; src/ui/game/ = in-game popups
    src/game/             game logic, no DOM: controller, flow, ops, edits, view, coach, tracker
    src/engine/           rules engine carried over from the old app, bugs fixed
    src/net/              room hosting/joining (PeerJS, with a same-browser fallback)
    src/data/             profile, decks, playmats, achievements, card lookup + cache, judge text
    tests/                node tests (tests/node) and Playwright tests (tests/*.py)

## How a game runs

Screens never change the game. They send an *intent* to the controller
(`src/game/controller.js`), which checks who is asking, applies it, lets the game move on
until a person must decide something (`src/game/flow.js`), and redraws from a per-viewer
*view* (`src/game/view.js`). Remote devices receive only their own view, so hands and
libraries never leave the host.

Cards the engine cannot automate go on the stack as "resolve by hand": the player reads the
card, uses the tools, and presses Effect resolved.

## Tests

    node tests/node/game.mjs          # rules and flow, 109 checks
    node tests/node/soak.mjs 40       # random play-throughs, must report 0 problems
    python3 -m http.server 4180 &     # then:
    python3 tests/tracker_test.py
    python3 tests/game_ui.py          # Guided Play on phone and iPad sizes
    python3 tests/flows_ui.py         # mulligan, search, scry, Free Play, deck editor
    python3 tests/net_ui.py           # host device + two joined players

The UI tests use fixture cards (`tests/fixtures/cards.mjs`) in place of Scryfall.

## Not verified in the test environment

The build machine had no access to Scryfall, MTGJSON or the PeerJS service, so these need a
check on a real device: live card download and images, the precon catalog, and joining a
room across two phones (tested here only between tabs of one browser).

## Changing common things

- Achievements and playmat unlocks: `src/data/achievements.js`
- Coach wording and tips: `src/game/coach.js`
- Ask the Judge entries: `src/data/judge.js`
- Colors, spacing, fonts: tokens at the top of `styles/app.css`
- Release number: `src/version.js`

Saved decks and profile use the old app's storage keys, so existing data carries over.
