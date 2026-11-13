# Chat handoff (13 Nov 2026)

Read `CLAUDE.md` (working rules) and `rebuild/INDEX.md` (where things are) first. Answers short.

## State
- **Live:** Build 102 (app 1.0.0-rebuild.102, Deck Builder 0.9.67 build 212) on `main`.
- **Working branch** `claude/admiring-meitner-6k7j06` = main + CLAUDE.md, INDEX.md, skills `deck-test` / `release`
  (`rebuild/deck/tools/tests/suite/run.sh`, `release.sh`). Not on main yet: ships with the next build.
- **Open work, branch `team/apex2`** (not live; = working branch + the commits below):
  1. *Score matches the strongest version* (owner, 12 Nov): with card strength on, the score players see (`evalFor` →
     `evaluateDeck(…, {str:true})`) counts each spell's strength for the deck in synergy (vs the strength Apex build's average
     spell, `strTopSpell`) and uses strength power as card quality; the next-level box uses the strength builds (`strRefParts`).
     Swap/generation scoring unchanged.
  2. *Generated decks finished on the strength build* (owner's Apex report: generated Apex showed power 66 with 28 upgrades):
     `strFinish` in engine/strength.js, called from `genRun` (ui/storage.js); skips owned-only, dollar-budget and
     no-play-data decks; Theme first only swaps on-theme for on-theme; `ensureEdh` leaves the EDHREC slot alone while Generate
     is open; build-ahead re-reads its commander's page. Test UI-APEX-01.
  3. *Mana rules* (owner: "Fix the mana first"), settings in engine/upgrades.js `UP`: `strLands 0` (strength builds don't swap
     lands), `strKeepJobs 1` (never lower ramp/draw/removal/wipe counts or trade away finishers/protection), `strPips 1`
     (Karsten colour sources), `strKeepLands 1` (generator's land count is the floor), `strManaGuard 1` (adds lands back while
     practice-game mana is below the generated deck's).

## Measured (live data, scripts in /home/user/dc-test/live, may be gone in a new container)
- Tournament match (10 commanders, generator given the button's themes): Apex 64.9% → 71.2%, core 64.6% → 69.1%; Mid 42.6% → 45.8%.
- New score: finished Apex decks 90-95 vs generator 86-93. Mana part generator → finished: Turtles 89→88, Atraxa 100→94,
  Krenko 94→93, Ur-Dragon 91→78 (rocks replace land ramp; practice "short of lands" counts lands only), Edgar 96→92, Yuriko 97→97.
- **Upgrade benchmark drops with the mana rules** (they also shape the live upgrade list): test Mid agreement@5 0.245 → 0.178;
  per rule: strLands→0.190, strPips→0.206, strKeepJobs→0.222 when each is turned off; all off = 0.245.

## Waiting on the owner (asked 12 Nov)
- A: mana rules everywhere (recommended; benchmark drops as above) · B: mana rules only when generating (upgrade list as live;
  generated decks list a few mana-unsafe swaps, power < 100) · C: ship the score change alone.

## Then
- Full run on team/apex2 (`sh rebuild/deck/tools/tests/suite/run.sh full`) had 5 UI failures to fix: UI-SCORE-01, UI-ALT-01,
  UI-B94-01 (likely the score change: check what each reads), UI-TAB-01 (check why it fails on this branch), UI-ASYNC-01 (known
  flake: rerun alone). Fix, rerun, then ship with the `release` skill (next: app 103, Deck Builder build 213 / 0.9.68), merging
  team/apex2 into the working branch first. Update ROADMAP 7f.3 and 7f.5.
- Owner checks still open: decklist images on the phone (Build 100 lazy loading), ROADMAP 7f.2.
- Another chat works the rules long tail (src/engine): stay out.
