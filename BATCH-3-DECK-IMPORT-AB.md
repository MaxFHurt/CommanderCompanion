# Commander Companion V0.8 — Batch 3 / Build AB

Checkpoint target: `B3-DECK-IMPORT`

## Scope
This batch is limited to Deck Import / Deck Persistence / Commander Setup. No gameplay engine, combat, mana, priority, active-game persistence, Freeplay, Table Tracker, service-worker, startup, or cache architecture was changed.

## Changes
- Hardened ManaBox TXT parsing:
  - flexible Commander/Deck/Mainboard headings including count annotations
  - `1 Card`, `1x Card`, and `1 x Card` quantity forms
  - strips common set/collector-number/finish suffixes without changing card names
  - ignores Sideboard/Maybeboard/Considering/Tokens-style sections
  - aggregates duplicate card rows while preserving exact quantities
- Hardened ManaBox CSV parsing:
  - handles quoted fields
  - supports common Name/Quantity/Board/Section/Category/Zone headers
  - preserves Commander/Command Zone designation and optional commander flags
  - ignores non-deck side/maybe/token rows
- Parser now reports exact imported card total, unique row count, commander count, and format.
- Import status shows exact card count and detected commander designation.
- Imported-deck metadata is retained when the deck is saved/reloaded/copied and linked into the profile deck record.
- Saved deck records now retain a stable `createdAt` while updating `updatedAt` on saves.
- Existing New Game behavior remains in place: saved decks are selectable and loading one fills its saved Commander 1 / Commander 2 and deck list. The profile favorite deck still auto-selects for Player 1 and triggers the same saved-deck load path.
- Landing build annotation advanced from `V0.8 AA` to `V0.8 AB` on iPhone and iPad pages.
- App/module cache-bust identifiers advanced to `080-b3-ab` for changed modules only.

## Verification performed
- All JavaScript files: `node --check` PASS.
- CSS brace validation PASS.
- ManaBox parser fixture: single commander, 100 cards PASS.
- ManaBox parser fixture: dual commanders, 100 cards PASS.
- ManaBox parser fixture: set/collector/finish suffixes PASS.
- ManaBox parser fixture: CSV commander designations PASS.
- Duplicate-row aggregation preserves exact total PASS.
- Sideboard/Maybeboard/Token exclusions PASS.
- Landing version marker `V0.8 AB` confirmed in both `index.html` and `ipad.html`.

## Real-device acceptance tests
Before locking Batch 3, verify on GitHub Pages/iPhone:
1. Import a normal single-commander ManaBox deck; confirm the imported total is 100 and Commander 1 is populated.
2. Import a valid two-commander deck; confirm both commander fields populate and the second commander remains available when the pair is legal.
3. Save the imported deck, reload the page, reopen My Decks, and confirm name, commanders, and deck list remain intact.
4. Start New Game and select the saved deck; confirm deck list and commander field(s) populate together.
5. Mark a saved deck as Favorite in Profile, reopen New Game, and confirm Player 1 receives that deck and its saved commander automatically.
6. Re-test the Batch 2 bottom dock controls after entering a game.

Do not proceed to Batch 4 until the above passes on-device.
