# Recommendation tests

Runs the app's engine in Node against real card data, so changes to the recommendations can be measured.

1. Get the data: `git clone --depth 1 -b card-data https://github.com/MaxFHurt/Deck-Companion.git tools/tests/data`
   (the `card-data` branch is refreshed weekly by `.github/workflows/card-data.yml`).
2. Run a deck: `node tools/tests/avengers.js`

`tools/commanders.txt` lists the commanders whose EDHREC pages are saved. `tools/tests/data` is not committed.

## Measuring against the workbook

`workbook.json` holds the five decks and the pending Budget/Mid/Apex picks from the hand-built workbook.

- `node tools/tests/score.js` (add `-v` for detail): how many workbook picks the app also suggests, per deck.
- `node tools/tests/miss.js`: every workbook pick with the engine's score for it and for the card it replaces.
- `node tools/tests/played.js`: how often players of each commander run the app's picks versus the workbook's (EDHREC).
