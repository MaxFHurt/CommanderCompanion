# Rules audit — the 1,000 most-played Commander cards, and the whole catalog

Made with `node tools/rules-audit.mjs tests/fixtures/top-commander-cards.json.gz` on 31 Oct 2026 (build 43 work, branch `claude/card-effects`): Scryfall's cards ordered by EDHREC rank.
Each card is checked the way Guided Play runs it: does each trigger fire, and does the game carry out each spell, trigger and activated effect by itself
(the same fallbacks the game uses: optional "you may", library searches, special actions, keyword lines dropped as a spell is cast).
Static rules text other than keywords is not checked here (the game handles it in many places) and is not counted as a gap; supported "Enchant …" lines count as automatic.
Triggers are also checked against Forge's hand-written card scripts: `node tests/node/forge-triggers.mjs` (99% fire when they should, 100% stay quiet for the wrong player).

**847 of 1000 cards** have nothing to resolve by hand; **153** need something by hand.

Progress: build 32 — 521; build 33 (trigger wordings) — 546; build 34 (spells, trigger and activated effects) — 654; build 35 (conditions, up to one target, wheels, devotion, flicker …) — 681; build 37 (library tricks, delayed effects, Force of Will, modal "both"/"one or more" …) — 693; build 39 (mass pumps, looting fix, Channel and graveyard abilities, multi-mana sources, may-pay, Fog, Silence, activation limits …) — 785; build 43 (whole-catalog work, see below) — 847.

| Cards | What players do by hand |
|---:|---|
| 57 | Spell: effect not applied automatically |
| 45 | Trigger fires, but its effect is resolved by hand |
| 35 | Activated ability: effect not applied automatically |
| 6 | Keyword: Landfall (common cases only) |
| 4 | Trigger never fires: other combat wording |
| 4 | Keyword: Changeling (common cases only) |
| 2 | Trigger never fires: other |
| 2 | Trigger never fires: other enter/leave/die wording |
| 2 | Trigger never fires: cards put into graveyard |
| 1 | Keyword: Magecraft (common cases only) |
| 1 | Trigger never fires: other step/phase wording |
| 1 | Keyword: Metalcraft (common cases only) |
| 1 | Keyword: Bestow (by hand) |
| 1 | Keyword: Aura (common cases only) |
| 1 | Keyword: Improvise (by hand) |

## Cards by gap (top 1,000)

### Spell: effect not applied automatically (57)

Deflecting Swat, Teferi's Protection, Victimize, Malakir Rebirth // Malakir Mire, Rishkar's Expertise, Untimely Malfunction, Reality Shift, Rakdos Charm, Sevinne's Reclamation, Dawn's Truce, Pact of Negation, Living Death, Chandra's Ignition, Blasphemous Edict, Redirect Lightning, Bolt Bend, Valakut Awakening // Valakut Stoneforge, Veil of Summer, Clever Concealment, Mindbreak Trap, Second Harvest, Return the Favor, Unbreakable Formation, Saw in Half, Ghostly Flicker, Culling Ritual, Tibalt's Trickery, Archdruid's Charm, Torment of Hailfire, Imp's Mischief, Bridgeworks Battle // Tanglespan Bridgeworks, Into the Flood Maw, Snuff Out, Kindred Dominance, Life from the Loam, Flare of Fortitude, Collective Resistance, Inkshield, High Tide, Mizzix's Mastery, Ripples of Potential, Curse of the Swine, Raise the Palisade, Breach the Multiverse, Expressive Iteration, Tainted Pact, Essence Flux, Promise of Loyalty, Demonic Consultation, Desperate Ritual, Cut a Deal, Approach of the Second Sun, Agadeem's Awakening // Agadeem, the Undercrypt, All Is Dust, Last March of the Ents, Eerie Interlude, Chain of Vapor

### Trigger fires, but its effect is resolved by hand (45)

Chrome Mox, Sylvan Library, Etali, Primal Storm, Braids, Arisen Nightmare, The Ozolith, Guardian Project, Forgotten Ancient, Selvala, Heart of the Wilds, Enduring Vitality, Adeline, Resplendent Cathar, Ripples of Undeath, Talon Gates of Madara, Hydroelectric Specimen // Hydroelectric Laboratory, Mangara, the Diplomat, Midnight Clock, Archaeomancer's Map, Springheart Nantuko, Riveteers Overlook, Hammer of Nazahn, Enduring Innocence, Veyran, Voice of Duality, Spelunking, Valley Floodcaller, Isochron Scepter, Bloodchief Ascension, Enduring Tenacity, Etali, Primal Conqueror // Etali, Primal Sickness, Enduring Curiosity, Buster Sword, Boromir, Warden of the Tower, Scrap Trawler, Padeem, Consul of Innovation, The Gitrog Monster, Sword of Hearth and Home, Emeria, the Sky Ruin, Myr Battlesphere, Ojer Taq, Deepest Foundation // Temple of Civilization, Cyberdrive Awakener, Moraug, Fury of Akoum, Cabaretti Courtyard, Mechanized Production, Kardur, Doomscourge, Tataru Taru, Annie Joins Up, Kodama of the East Tree

### Activated ability: effect not applied automatically (35)

Boseiju, Who Endures, Urza's Saga, Chrome Mox, Mosswort Bridge, Takenuma, Abandoned Mire, Bloom Tender, Shifting Woodland, Dauthi Voidwalker, Mystic Forge, Bident of Thassa, Faeburrow Elder, Liquimetal Torque, Necropotence, Nesting Grounds, Talon Gates of Madara, Conduit of Worlds, Thespian's Stage, Emry, Lurker of the Loch, Windbrisk Heights, The Earth Crystal, Isochron Scepter, Liliana, Dreadhorde General, Elspeth, Sun's Champion, Spinerock Knoll, Urza, Lord High Artificer, Etali, Primal Conqueror // Etali, Primal Sickness, Cankerbloom, The Soul Stone, The Mycosynth Gardens, Cephalid Coliseum, Reconnaissance, Throne of Eldraine, Field of Ruin, Archway of Innovation, Mirror Entity

### Keyword: Landfall (common cases only) (6)

Scute Swarm, Rampaging Baloths, Icetill Explorer, Tireless Tracker, Mossborn Hydra, Omnath, Locus of Rage

### Trigger never fires: other combat wording (4)

Kutzil, Malamet Exemplar, Trouble in Pairs, Curse of Opulence, Kardur, Doomscourge

### Keyword: Changeling (common cases only) (4)

Realmwalker, Changeling Outcast, Taurean Mauler, Mirror Entity

### Trigger never fires: other (2)

Utopia Sprawl, Forbidden Orchard

### Trigger never fires: other enter/leave/die wording (2)

Caretaker's Talent, Nadier's Nightblade

### Trigger never fires: cards put into graveyard (2)

Bloodchief Ascension, The Gitrog Monster

### Keyword: Magecraft (common cases only) (1)

Storm-Kiln Artist

### Trigger never fires: other step/phase wording (1)

Pact of Negation

### Keyword: Metalcraft (common cases only) (1)

Puresteel Paladin

### Keyword: Bestow (by hand) (1)

Springheart Nantuko

### Keyword: Aura (common cases only) (1)

Danitha Capashen, Paragon

### Keyword: Improvise (by hand) (1)

Kappa Cannoneer

## Whole catalog (build 43)

All 31,776 Commander-legal cards with rules text (Scryfall oracle-cards, 31 Oct 2026; tokens, emblems, art and other non-deck layouts left out), with the same audit:

| | Before (build 42) | After (build 43) |
|---|---:|---:|
| Nothing to do by hand | 14,551 (46%) | 19,190 (60%) |
| …of them with other static text the audit cannot verify | 4,829 | 6,386 |
| Something by hand | 17,225 | 12,586 |

What remains, by kind (whole catalog):

| Cards | What players do by hand |
|---:|---|
| 5158 | Trigger fires, but its effect is resolved by hand |
| 3832 | Spell: effect not applied automatically |
| 2545 | Activated ability: effect not applied automatically |
| 408 | Trigger never fires: other |
| 200 | Trigger never fires: other combat wording |
| 117 | Trigger never fires: other enter/leave/die wording |
| 55 | Keyword: Changeling (common cases only) |
| 53 | Trigger never fires: noncombat damage |
| 49 | Trigger never fires: other cast wording |
| 47 | Trigger never fires: cards put into graveyard |
| 37 | Trigger never fires: counters placed/removed |
| 35 | Trigger never fires: activating abilities |
| 30 | Keyword: Saddle (by hand) |
| 28 | Trigger never fires: other step/phase wording |
| 27 | Keyword: Enchant (common cases only) |
| 26 | Keyword: Encore (by hand) |
| 25 | Keyword: Disturb (by hand) |
| 24 | Keyword: Landfall (common cases only) |
| 24 | Keyword: Soulbond (by hand) |
| 24 | Keyword: Plot (by hand) |
| 24 | Keyword: Threshold (common cases only) |
| 23 | Trigger never fires: becomes the target |
| 23 | Keyword: Craft (by hand) |
| 23 | Keyword: Delirium (common cases only) |
| 15 | Keyword: Improvise (by hand) |
| 15 | Trigger never fires: exiling |
| 15 | Keyword: More Than Meets the Eye (by hand) |
| 15 | Keyword: Boast (by hand) |
| 15 | Keyword: Emerge (by hand) |
| 13 | Keyword: Metalcraft (common cases only) |
| 13 | Keyword: Max speed (common cases only) |
| 12 | Spell: Cleave |
| 11 | Keyword: Domain (common cases only) |
| 11 | Keyword: Create (common cases only) |
| 10 | Keyword: Read ahead (by hand) |
| 9 | Keyword: Assist (by hand) |
| 8 | Keyword: Suspend (by hand) |
| 8 | Keyword: Hellbent (common cases only) |
| 7 | Keyword: Haunt (by hand) |
| 6 | Trigger never fires: other draw wording |
| 6 | Trigger never fires: untapping |
| 6 | Keyword: Reinforce (by hand) |
| 6 | Keyword: Spectacle (by hand) |
| 6 | Keyword: Heroic (common cases only) |
| 5 | Spell: Spectacle |
| 5 | Keyword: Descend (common cases only) |
| 5 | Keyword: Imprint (common cases only) |
| 5 | Keyword: Prowl (by hand) |
| 5 | Keyword: Surge (by hand) |
| 5 | Keyword: Forecast (by hand) |
| 4 | Keyword: Aura (common cases only) |
| 4 | Keyword: Constellation (common cases only) |
| 4 | Keyword: Miracle (by hand) |
| 4 | Keyword: Double (common cases only) |
| 4 | Keyword: Enrage (common cases only) |
| 4 | Keyword: Celebration (common cases only) |
| 3 | Keyword: Eerie (common cases only) |
| 3 | Keyword: Freerunning (by hand) |
| 3 | Trigger never fires: copying |
| 3 | Trigger never fires: transform / face up |
| 3 | Keyword: Reveal (common cases only) |
| 2 | Keyword: Modular (by hand) |
| 2 | Keyword: Myriad (by hand) |
| 2 | Keyword: Undergrowth (common cases only) |
| 2 | Keyword: Fortify (by hand) |
| 1 | Keyword: Magecraft (common cases only) |
| 1 | Keyword: Bestow (by hand) |
| 1 | Keyword: Living weapon (by hand) |
| 1 | Keyword: Alliance (common cases only) |
| 1 | Keyword: Stun counters (by hand) |
| 1 | Keyword: Embalm (by hand) |
| 1 | Keyword: Morbid (common cases only) |
| 1 | Keyword: Decayed (by hand) |
| 1 | Keyword: Room (by hand) |
| 1 | Keyword: Battle (by hand) |
| 1 | Keyword: Blood (by hand) |
| 1 | Trigger never fires: searching a library |
| 1 | Keyword: Echo (by hand) |
| 1 | Keyword: Backup (by hand) |
| 1 | Keyword: Inspired (common cases only) |
| 1 | Keyword: Enlist (by hand) |
| 1 | Keyword: Aura swap (by hand) |
| 1 | Keyword: Vanishing (by hand) |
| 1 | Keyword: Corrupted (common cases only) |
| 1 | Keyword: Monstrous (by hand) |
| 1 | Keyword: Raid (common cases only) |

The card-by-card ledgers (CONFIRMATION-LEDGER.csv, ABILITY-LEDGER.csv from the owner's handoff) were filled from these two audits: each card's
engine confirmation, outcome (confirmed_gap → implemented / confirmed_gap (open) / already_correct / not_applicable_to_supported_format) and what remains by hand.
That is a machine check of every spell, trigger and activated ability, plus in-game tests per family (`tests/node/catalog.mjs`), not a card-by-card review of rulings.
