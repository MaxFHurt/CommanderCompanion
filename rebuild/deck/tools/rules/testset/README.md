# Rules test set (engine redesign, phase 0)

Hand-checked expected readings of cards that cover every area of the rules reader (plan: "What the rules reader must
understand"). The new reader must produce these readings; `cards.json` is the answer key. Readings are written from each
card's Oracle text (quoted with it) by a person or, offline, by Claude in a work session (owner, 20 Oct), never at runtime.

## A reading

| Field | Meaning |
| --- | --- |
| `types` | `super` (legendary, basic, snow), `card` (artifact, creature, enchantment, instant, land, planeswalker, sorcery, battle), `sub` (Elf, Equipment, Aura...) |
| `cost` | `mana` as printed, `mv` mana value, `colors` paid; `x: true` when it has {X} |
| `body` | `power` / `toughness` (creatures), `loyalty`, `defense` |
| `abilities` | in printed order, one entry per ability (below) |
| `makes` | what the card produces for the deck: `mana`, `cards`, `tokens`, `treasure`, `counters`, `life`, `graveyard` (cards put there), `bodies` (creatures returned or put in play), `damage` |
| `uses` | what it consumes or rewards: the same words, plus events (`creature-dies`, `creature-leaves-with-counters`, `opponent-casts`, `opponent-draws`, `token-created`, `counters-placed`, `combat-damage`) |
| `roles` | ramp, draw, removal, wipe, counterspell, tutor, protection, recursion, sac-outlet, finisher, stax, combat |

## An ability

| `kind` | Fields |
| --- | --- |
| `keyword` | `name` (flying, haste, forestwalk, equip, enchant...), `cost` when it has one (equip {1}), `what` (enchant creature card in a graveyard) |
| `static` | `effects`, `scope` (what it affects) |
| `triggered` | `trigger` {`event`, `subject`, `condition`, `limit`}, `optional`, `unless` {`who`, `pays`}, `effects` |
| `activated` | `cost` (list), `timing` (instant unless `sorcery`), `effects` |
| `mana` | `cost` (list), `makes` {`amount`, `colors` or `choice`}, never on the stack |
| `replacement` | `event` (create-token, put-counters, deal-damage, ...), `scope`, `instead` {`times` or `plus`} |
| `spell` | what an instant or sorcery does as it resolves: `effects`, or `modes` + `choose` |

Cost atoms: `{"mana": "{B}"}`, `{"tap": true}`, `{"sacrifice": {"count": 1, "what": "creature"}}`, `{"discard": ...}`,
`{"life": n}`, `{"remove-counters": ...}`, `{"exile-self": true}`.
Effect atoms: `{"do": "<verb>", ...}` with verbs add-mana, draw, search, destroy, exile, counter, create-token, gain-life,
lose-life, mill, return-to-battlefield, put-counters, move-counters, pump, grant, goad, untap, phase-out, protection,
double-damage, assign-damage-by-toughness, attach. A target is `{"target": {"count": n, "what": "..."}}`; "all" is
`{"all": "..."}`. A duration is `"until": "end-of-turn" | "your-next-turn"`.
