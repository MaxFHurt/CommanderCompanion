# Deck Builder reader vs game engine compiler (roadmap 5.0)

Script: `deck/tools/readers-compare.mjs` (`node tools/readers-compare.mjs <oracle.jsonl.gz> <out.json>`). All 32,643 Commander-legal
cards (permanents and lands included, Deck Builder's engine list ENGINE_ROLES emptied). Full per-card list (12,800+ rows):
`/home/user/dc-runs/readers/readers-full.json`; top 30: `/home/user/dc-runs/readers/top30.json`.

Engine side: each spell text, trigger effect, activated effect and static line goes through `compileEffectText`; effect kinds map to
roles (add-mana/Treasure/land search = ramp, draw = draw, destroy/exile/bounce/damage/fight/-X/-X on a target = removal, zone-each/
damage-each = wipe, protective keyword grants/phase-out/prevent = protect, counter-spell = counter, non-land search = tutor).
Third check ("arbiter"): plain sentence patterns, used only to sort a disagreement. It is weaker than both readers, so
`db-wrong` is a candidate list: in a hand check of about 80 candidates roughly half were real misreads.

## Counts per role (cards)
| role | agree | DB misses (engine sees, text confirms) | DB wrong (candidates) | DB on purpose | artefact: engine unread / kind / loose / land | text only, neither reader (unchecked) |
|---|---|---|---|---|---|---|
| ramp | 905 | 1 | 163 | 232 | 632 / 99 / 0 / 0 | 117 |
| draw | 2297 | 2 | 502 | 140 | 985 / 121 / 33 / 54 | 32 |
| removal | 2893 | 30 | 640 | 193 | 725 / 79 / 115 / 25 | 1206 (noisy: sacrifice costs) |
| wipe | 380 | 0 | 157 | 0 | 318 / 22 / 16 / 2 | 34 |
| protect | 247 | 17 | 160 | 18 | 413 / 103 / 28 / 6 | 224 |
| counter | 307 | 1 | 0 | 0 | 144 / 22 / 0 / 0 | 6 |
| tutor | 149 | 11 | 28 | 0 | 245 / 3 / 0 / 0 | 42 |

Reading: the readers agree on 7,000+ role calls. "Engine unread" (the engine cannot compile that line) is the largest class and
is not a Deck Builder fault. "DB on purpose" are jobs the Deck Builder gives by its own rules (cost reducers and Sprawl-style auras
as ramp, impulse draw / Clues / connive as card flow, edicts as removal, umbra armor as protection). The engine only sees an
effect the Deck Builder misses in about 60 cards (2 draw, 30 removal, 17 protect, 11 tutor, 1 ramp/counter each), so the engine
adds little over the Deck Builder; the Deck Builder is more often over-generous than blind.

## Top 30 real misreads (by EDHREC rank)
| rank | card | kind | role | DB roles now | why |
|---|---|---|---|---|---|
| 162 | Windfall | DB wrong | draw | draw | symmetric wheel counted as draw |
| 181 | Boros Charm | DB wrong | removal | protect, removal | 4 damage to a player or planeswalker only (no creature); protect mode is right |
| 362 | Dawn's Truce | DB wrong | draw | draw, protect | the gift makes the OPPONENT draw |
| 567 | Scrawling Crawler | DB wrong | draw | draw | each player draws |
| 573 | Conduit of Worlds | DB wrong | draw | draw | recasts from graveyard, no draw |
| 580 | Wheel of Fortune | DB wrong | draw | draw | symmetric wheel |
| 600 | Emry, Lurker of the Loch | DB wrong | draw | draw | casts from graveyard, no draw |
| 604 | Opposition Agent | DB wrong | draw | draw | plays opponent's searched cards, no draw |
| 713 | Muddle the Mixture | DB wrong | tutor | counter, tutor | transmute (discard: search) read as tutor |
| 794 | Urza, Lord High Artificer | DB wrong | draw | ramp, draw | shuffle-and-exile play, ramp is right |
| 1241 | Wheel of Misfortune | DB wrong | draw | draw | symmetric damage game, no draw |
| 1304 | Valgavoth, Terror Eater | DB wrong | draw | draw | plays cards exiled with it |
| 1596 | Ashling, Flame Dancer | DB wrong | wipe | ramp, wipe, draw | damage only on the 2nd resolution per turn; also ramp/draw are weak |
| 2082 | Paradise Druid | DB wrong | protect | ramp, protect | self-hexproof only |
| 2387 | Fury | DB wrong | wipe | wipe | divided damage on chosen targets = removal, not wipe |
| 2710 | Invisible Stalker | DB wrong | protect | protect | self-hexproof only |
| 2719 | Fire Covenant | DB wrong | wipe | wipe | divided damage on chosen targets = removal |
| 2727 | Step Through | DB wrong | tutor | tutor, removal | wizardcycling read as tutor |
| 2771 | Shimmer Dragon | DB wrong | protect | draw, protect | self-hexproof only (also 'draw' is the tap-artifacts ability, ok) |
| 2777 | Fog Bank | DB wrong | protect | protect | prevents damage to/by itself only |
| 3027 | Liliana of the Veil | DB wrong | wipe | removal, wipe | -2 edict is removal; -6 is an ultimate |
| 3081 | Abyssal Harvester | DB wrong | wipe | wipe | 'exile all other Nightmare tokens' is its own tokens |
| 4485 | Dragonlord Atarka | DB wrong | wipe | wipe | divided damage on chosen targets = removal |
| 5184 | Traverse the Ulvenwald | DB wrong | tutor | tutor | basic-land fetch into hand read as tutor (lands are ramp/fixing) |
| 6367 | Jirina, Dauntless General | DB misses | protect | - | sacrifice: Humans gain hexproof and indestructible (type-restricted group not matched) |
| 6860 | Werefox Bodyguard | DB misses | removal | - | 'exile up to one other target non-Fox creature' not matched |
| 8538 | Power Word Kill | DB misses | removal | - | 'non-Angel, non-Demon...' target is skipped by the removal pattern |
| 10164 | Victim of Night | DB misses | removal | - | same 'non-' target skip |
| 13457 | Icefall Regent | DB misses | removal | - | lock-down (tap, stays tapped) not read as removal |
| 15948 | Unravel the Aether | DB misses | removal | - | 'shuffles it into their library' not read |

## Patterns (what a fix would touch)
- **Removal misses**: "destroy/exile target non-X creature" (Power Word Kill, Victim of Night, Werefox Bodyguard: the `non-` is
  excluded by the removal pattern), "shuffles it into library" (Unravel the Aether, Deglamer), lock-down (Icefall Regent).
- **Draw over-reads (about 500 candidates)**: symmetric wheels (Windfall, Wheel of Fortune, Magus of the Wheel, ~70 cards, against the
  reader's own symmetric rule), "cast/play from graveyard or exile" (Conduit, Emry, Opposition Agent, Urza, Valgavoth, ~200), opponent
  draws (Dawn's Truce gift).
- **Wipe over-reads (~150)**: divided damage among chosen targets (Fury, Fire Covenant, Atarka, ~18), planeswalker edicts/ultimates
  (Liliana of the Veil), own-token exile (Abyssal Harvester), "damage on the 2nd resolution" riders.
- **Protect**: over-read: self-only hexproof/damage prevention (Paradise Druid, Invisible Stalker, Fog Bank, ~28); missed: type-restricted
  groups ("Humans/Soldiers and Heroes you control gain indestructible": Jirina, Captain America, Karvanista, King Darien, ~17).
- **Tutor over-reads (28)**: transmute and cycling-type searches (17), basic-land fetches into hand (Traverse, Sazh, Tithe).
- Lands: the Deck Builder gives no role to lands at all; the 87 land rows (Mikokoro, Midgar...) are by design.

## Which roles would gain most
Draw (-500 false positives, the most scores touch it), removal (+30 misses, -a few hundred over-reads to confirm), wipe (-~150),
protect (+17 / -~130). Ramp, counter and tutor are close to right.

## Options (decision for the owner; nothing implemented)
A. Leave as is, fix only the confirmed removal/protect misses: add `non-X` and "shuffles into library" and type-restricted group
   grants to the patterns (about 50 cards, small score changes, low risk).
B. A. plus tighten the over-reads: drop symmetric wheels, from-graveyard/exile casts, divided damage, self-only protection from their
   roles (about 400 to 600 cards lose a role: deck scores and generator picks move, wheels and graveyard decks change most). Needs a
   bench run before and after.
C. Replace pattern reading with the engine's compiled effects where it compiles (about 55% of cards) and keep patterns for the rest:
   largest change and least predictable; the engine misreads wipes and protection itself (its mapping needed rules above), so not advised
   before the judgement step.
Whichever is chosen changes scores, the generator and Fix picks, so run the benchmark first.

## Option B built (28 Nov, switch UP.roles2, awaiting the owner's approval)
`roles2Fix` (engine/reading.js, called last in tags()) adds the misses and drops the over-reads by general patterns; a job is dropped
only when a clause of a known kind is on the card and nothing else on it shows the job. Cards changed (417 in all): draw -192
(wheels and "each player draws", opponent draws and Gift, cast/play from graveyard or exile), removal +31 / -49 (+14 real misses,
+17 divided-damage cards moved from wipe; -49 damage to a player or planeswalker only), wipe -26 (divided damage, planeswalker
ultimates, own-token exile, 2nd/3rd-resolution riders), protect +30 / -92 (type-restricted groups added; self-only hexproof, phasing,
damage prevention on itself and locks on an opponent's permanent dropped), tutor -16 (transmute, typecycling). Ramp and counter 0.
Left as they were: Urza, Lord High Artificer (draw), Traverse the Ulvenwald (its delirium line is a real creature-or-land fetch),
Ashling, Flame Dancer (draw is its rummage), Dawn's Truce keeps protect. Nothing else was touched.
