# Plan detection check set: the plans each deck should show (roadmap 6b)

**Owner: please correct rows 1-5 (your workbook decks; my first guesses) and say if any other row is wrong.**
The check (`node plancheck.js <engine>` in the test folder) reads this table: a deck passes when it shows every chain in
"Must show" and none in "Must not show". Decklists: `decks.json` (your 5 workbook decks; EDHREC average decks of 21 Nov
for the rest). Web-slinging deck: **Silk, Web Weaver** (G/W: her "whenever you cast a creature spell" token trigger, and
the most web-slinging cards of the Spider-Man commanders' average decks).

Chains (ids): `recast` re-cast for enters and cast triggers (bounce, ninjutsu, web-slinging) · `blink` blink for enters
triggers · `discard` full hand into discard payoffs (outlets, madness, wheels) · `handsize` full hand into hand-size payoffs ·
`aristocrats` sacrifice into death triggers · `tokens` creatures and tokens entering into enters triggers · `spells` spells
into cast triggers · `landfall` extra lands into landfall · `counters` +1/+1 counters into counter payoffs · `lifegain`
life gain into life-gain triggers · `graveyard` filling the graveyard for recursion · `drawpunish` opponents draw into draw
punishers.

| # | Commander | Must show | Must not show | Why (first guess) |
|---|---|---|---|---|
| 1 | Captain America, Team Leader | `tokens` | `spells` | Heroes entering put +1/+1 counters on them and on Captain America |
| 2 | Doctor Doom, King of Latveria | `discard` | `landfall` | connive each combat and discarding lands drains |
| 3 | Ghalta, Primal Hunger | `tokens` | `spells` | big creatures entering (Garruk's Packleader, Elemental Bond) |
| 4 | Heroes in a Half Shell | `counters` | `spells` | combat damage puts +1/+1 counters and draws |
| 5 | T'Challa, the Black Panther | `spells` | `aristocrats` | casting big artifact spells grows T'Challa |
| 6 | Silk, Web Weaver | `recast`, `tokens` | `blink` | web-slinging returns tapped creatures to re-cast them for Silk's cast trigger |
| 7 | Yuriko, the Tiger's Shadow | `recast` | `spells` | ninjutsu returns attackers to hand |
| 8 | Brago, King Eternal | `blink` | `aristocrats` | Brago blinks enters-trigger permanents |
| 9 | Anje Falkenrath | `discard` | `drawpunish` | Anje loots; madness cards pay off the discard |
| 10 | Nekusar, the Mindrazer | `drawpunish`, `discard` | `recast` | wheels and extra draws hurt opponents |
| 11 | Teysa Karlov | `aristocrats` | `spells` | sacrifice outlets and doubled death triggers |
| 12 | Purphoros, God of the Forge | `tokens` | `aristocrats` | every creature entering deals 2 to each opponent |
| 13 | Veyran, Voice of Duality | `spells` | `recast` | magecraft and prowess payoffs, doubled |
| 14 | Tatyova, Benthic Druid | `landfall` | `recast` | extra lands and bounce lands for landfall draws |
| 15 | Meren of Clan Nel Toth | `aristocrats`, `graveyard` | `spells` | creatures dying fuel experience and returns |
