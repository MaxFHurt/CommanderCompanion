# Deck Companion

A Magic: The Gathering deck builder for Commander and Standard.

- Import a plain-text decklist or pick cards through search
- Aim the deck: ranked mechanics and land-color focus
- Upgrade recommendations, Apex first: the strongest card for each slot at any price, then cheaper cards that do the same job (Mid under $12, Budget under $3 per card), plus a best-deck option using only cards under each limit; nonbasic lands are upgraded too
- Mechanics come from the commander: its own themes as players build them (EDHREC), in priority order you can change to steer upgrades and generated decks
- Commander Brackets: each Commander deck shows which bracket it currently sits in, with a progress bar for Game Changers. It is a label, not a limit: nothing is blocked, and upgrades that would move the deck up a bracket are marked. The card lists come from Scryfall and update on their own.
- Official preconstructed Commander decklists for new players
- Generate a deck from any commander
- Card text, prices, legality and artwork from Scryfall, refreshed about once a day

It is a static site: no build step and no server. Decks are saved in the browser's local storage. The Profile screen can save a backup file to the device and restore from it, and in Chrome or Edge on a computer it can keep a chosen backup file updated automatically.

## Publish with GitHub Pages

1. Repository **Settings → Pages**
2. Under **Build and deployment**, set **Source** to "Deploy from a branch"
3. Pick the `main` branch and the `/ (root)` folder, then save
4. The site appears at `https://<your-username>.github.io/<repository-name>/` after a minute or two

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page markup and styles |
| `data.js` | Built-in starter card library, precon and theme definitions |
| `lists.js` | Official precon decklists |
| `engine/` | Deck logic, in load order: `core` (themes, keywords, commander engines), `practice` (practice games, combos), `reading` (card text), `score` (deck score, Apex reference), `library` (card lookup, analysis), `upgrades` (scoring, upgrade list, whole-card search), `mana` (fixes, lands), `generator` (deck building) |
| `ui/` | Screens, in load order: `base`, `storage` (saving, undo, background cores), `library`, `views`, `upgrades`, `deck`, `cards`, `events`, `boot` |
| `work.js` | The background worker that builds decks and measures swaps |
| `files.json` | The script list in load order (the page, the worker and the tests all follow it) |
| `app.min.js`, `engine.min.js` | What the live page downloads: the scripts joined and minified by `sh tools/build.sh`. Never edit these; edit the readable files and rebuild. `?dev=1` on the page runs the readable files instead |

## Making a change

1. Edit the readable files in `engine/` and `ui/` (formatted with Prettier, settings in `.prettierrc.json`).
2. Run `sh tools/build.sh` so the bundles match (the tests fail on a stale bundle).
3. Test with `sh tools/tests/suite/check.sh <kind> quick|live` (see the work session handoff).

## Credits

Card data and images: [Scryfall](https://scryfall.com). Precon decklists: EDHREC.

Deck Companion is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
