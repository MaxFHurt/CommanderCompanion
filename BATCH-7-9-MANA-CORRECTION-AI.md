# Commander Companion V0.8 AI — Mana / Ability UX correction

## Action labels
- Green commit buttons now show their actual action text instead of hiding it behind the fixed `CONFIRM` artwork.
- Red cancel/rejection buttons also keep their live label visible.
- Generic `CONFIRM` labels were removed from the as-enters play flow; the commit action now says `PLAY LAND` or `CAST CARD` as appropriate.
- Verification-specific labels such as `CONFIRM DRAW`, `CONFIRM HAND`, and `CONFIRM CARD` remain explicit.

## Activated-ability UI
- Activated-ability cards now use a compact shared layout instead of the previous wide fragmented placeholder.
- Costs are displayed as clear chips such as `TAP`, `-1 LIFE`, `SACRIFICE THIS CARD`, mana symbols, discard costs, and loyalty costs.
- Displayed effect text is shortened for the player-facing action screen; automatic trailing shuffle wording is omitted from the compact instruction while engine behavior remains unchanged.
- Selecting an ability opens one compact review screen with red `CANCEL` and green `USE ABILITY` actions.
- Mana abilities with multiple choices collect the choice on that same review screen before committing. Example: Sulfur Falls presents `ADD BLUE` / `ADD RED`; `USE ABILITY` executes the selected choice without a second mana-color page.
- Search abilities such as Polluted Delta show the cost/effect first; `USE ABILITY` then proceeds to the required tracked-library selection.

## Flexible-mana visibility
- Untapped flexible sources are advertised in the main mana box before activation with a split-color icon and a count of actual available sources.
- The display no longer hides a flexible option merely because one of its colors is absent from the commander-identity display set.
- Availability can derive flexible `{T}: Add ... or ...` options directly from tracked Oracle data, so older/restored battlefield instances that lack prior registration metadata still advertise their options.
- A U/R source remains one source: it can satisfy U or R, but cannot satisfy both U and R simultaneously.

## Regression checks
- 34 JavaScript files passed `node --check`.
- `game-threefix.css` brace count: 787 opening / 787 closing.
- Flexible-source test: unregistered Sulfur Falls produces one U/R flexible source; `{U}` succeeds, `{R}` succeeds, `{U}{R}` fails with only that one source.
- Render test confirms the main mana row includes `U/R flexible mana source, 1 available` before the source is tapped.
- Upload folder counts remain below GitHub mobile limit: `Uploaded 1st` = 99 files; `Uploaded 2nd` = 50 files.

## Scope preserved
No Virtual Deck/draw architecture redesign, Freeplay redesign, combat work, card-detail redesign, startup/service-worker changes, or landing-page layout changes were included.
