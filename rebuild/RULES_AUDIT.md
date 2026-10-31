# Rules audit — the 1,000 most-played Commander cards

Made with `node tools/rules-audit.mjs tests/fixtures/top-commander-cards.json.gz` on 29 Oct 2026 (build 39): Scryfall's cards ordered by EDHREC rank.
Each card is checked the way Guided Play runs it: does each trigger fire, and does the game carry out each spell, trigger and activated effect by itself
(the same fallbacks the game uses: optional "you may", library searches, special actions, keyword lines dropped as a spell is cast).
Static rules text other than keywords is not checked here (the game handles it in many places) and is not counted as a gap.
Triggers are also checked against Forge's hand-written card scripts: `node tests/node/forge-triggers.mjs` (99% fire when they should, 100% stay quiet for the wrong player).

**785 of 1000 cards** have nothing to resolve by hand; **215** need something by hand.

Progress: build 32 — 521; build 33 (trigger wordings) — 546; build 34 (spells, trigger and activated effects) — 654; build 35 (conditions, up to one target, wheels, devotion, flicker …) — 681; build 37 (library tricks, delayed effects, Force of Will, modal "both"/"one or more" …) — 693; build 39 (mass pumps, looting fix, Channel and graveyard abilities, multi-mana sources, may-pay, Fog, Silence, activation limits …) — 785.

| Cards | What players do by hand |
|---:|---|
| 75 | Trigger fires, but its effect is resolved by hand |
| 65 | Spell: effect not applied automatically |
| 50 | Activated ability: effect not applied automatically |
| 13 | Keyword: Enchant (common cases only) |
| 9 | Trigger never fires: other |
| 6 | Keyword: Landfall (common cases only) |
| 5 | Trigger never fires: other combat wording |
| 4 | Keyword: Changeling (common cases only) |
| 2 | Trigger never fires: other enter/leave/die wording |
| 2 | Trigger never fires: cards put into graveyard |
| 1 | Keyword: Magecraft (common cases only) |
| 1 | Trigger never fires: other step/phase wording |
| 1 | Trigger never fires: noncombat damage |
| 1 | Keyword: Metalcraft (common cases only) |
| 1 | Trigger never fires: counters placed/removed |
| 1 | Keyword: Bestow (by hand) |
| 1 | Keyword: Aura (common cases only) |
| 1 | Keyword: Improvise (by hand) |
| 1 | Spell: Cycling |

## Cards by gap

### Trigger fires, but its effect is resolved by hand (75)

The One Ring, Herald's Horn, Chrome Mox, Animate Dead, Scute Swarm, Sylvan Library, Orcish Bowmasters, Etali, Primal Storm, Ragavan, Nimble Pilferer, Braids, Arisen Nightmare, The Ozolith, Guardian Project, Land Tax, Forgotten Ancient, Helm of the Host, Selvala, Heart of the Wilds, Enduring Vitality, Disciple of Freyalise // Garden of Freyalise, Thassa's Oracle, Adeline, Resplendent Cathar, Field of the Dead, Birgi, God of Storytelling // Harnfel, Horn of Bounty, Necropotence, Ripples of Undeath, Sword of Feast and Famine, Talon Gates of Madara, Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun, Six, Icetill Explorer, Hydroelectric Specimen // Hydroelectric Laboratory, Mangara, the Diplomat, Tribute to the World Tree, Ancient Copper Dragon, Plaguecrafter, Knight of the White Orchid, Archaeomancer's Map, Shared Animosity, Dualcaster Mage, Reflections of Littjara, Springheart Nantuko, Riveteers Overlook, Hammer of Nazahn, Enduring Innocence, Hellkite Tyrant, Chimil, the Inner Sun, Veyran, Voice of Duality, Spelunking, Valley Floodcaller, Isochron Scepter, Bloodchief Ascension, Kaya's Ghostform, Enduring Tenacity, Springbloom Druid, Urza, Lord High Artificer, Aurelia, the Warleader, Etali, Primal Conqueror // Etali, Primal Sickness, Enduring Curiosity, Buster Sword, Ledger Shredder, Boromir, Warden of the Tower, Scrap Trawler, Padeem, Consul of Innovation, The Gitrog Monster, Sword of Hearth and Home, Emeria, the Sky Ruin, Myr Battlesphere, Ojer Taq, Deepest Foundation // Temple of Civilization, Cyberdrive Awakener, Moraug, Fury of Akoum, Cabaretti Courtyard, Mechanized Production, Kardur, Doomscourge, Tataru Taru, Annie Joins Up, Kodama of the East Tree

### Spell: effect not applied automatically (65)

Deflecting Swat, Jeska's Will, Teferi's Protection, Victimize, Malakir Rebirth // Malakir Mire, Rishkar's Expertise, Untimely Malfunction, Reality Shift, Rakdos Charm, Sevinne's Reclamation, Dawn's Truce, Pact of Negation, Ephemerate, Cabal Ritual, Living Death, Chandra's Ignition, Blasphemous Edict, Redirect Lightning, Bolt Bend, Valakut Awakening // Valakut Stoneforge, Veil of Summer, Gitaxian Probe, Clever Concealment, Mindbreak Trap, Second Harvest, Return the Favor, Unbreakable Formation, Saw in Half, Ghostly Flicker, Culling Ritual, Tibalt's Trickery, Archdruid's Charm, Torment of Hailfire, Dig Through Time, Imp's Mischief, Bridgeworks Battle // Tanglespan Bridgeworks, Into the Flood Maw, Snuff Out, Kindred Dominance, Sundering Eruption // Volcanic Fissure, Fact or Fiction, Life from the Loam, Narset's Reversal, Flare of Fortitude, Collective Resistance, Inkshield, High Tide, Mizzix's Mastery, Ripples of Potential, Curse of the Swine, Raise the Palisade, Breach the Multiverse, Expressive Iteration, Tainted Pact, Essence Flux, Promise of Loyalty, Demonic Consultation, Desperate Ritual, Cut a Deal, Approach of the Second Sun, Agadeem's Awakening // Agadeem, the Undercrypt, All Is Dust, Last March of the Ents, Eerie Interlude, Chain of Vapor

### Activated ability: effect not applied automatically (50)

Boseiju, Who Endures, Urza's Saga, Chrome Mox, Mosswort Bridge, Professional Face-Breaker, Takenuma, Abandoned Mire, Bloom Tender, Shifting Woodland, Dauthi Voidwalker, Mystic Forge, Bident of Thassa, Faeburrow Elder, Liquimetal Torque, Necropotence, Nesting Grounds, Talon Gates of Madara, Conduit of Worlds, Thespian's Stage, Emry, Lurker of the Loch, Strionic Resonator, Greater Good, Caretaker's Talent, Wizard Class, Incubation Druid, Altar of Dementia, Windbrisk Heights, The Earth Crystal, Innkeeper's Talent, Aggravated Assault, Whip of Erebos, Isochron Scepter, Liliana, Dreadhorde General, Elspeth, Sun's Champion, Spinerock Knoll, Urza, Lord High Artificer, Etali, Primal Conqueror // Etali, Primal Sickness, The Fire Crystal, Cankerbloom, The Soul Stone, The Mycosynth Gardens, Loot, Exuberant Explorer, Cephalid Coliseum, Boromir, Warden of the Tower, Reconnaissance, Throne of Eldraine, Field of Ruin, Archway of Innovation, Evolution Witness, Narset, Parter of Veils, Mirror Entity

### Keyword: Enchant (common cases only) (13)

Wild Growth, Animate Dead, Utopia Sprawl, Curiosity, Darksteel Mutation, All That Glitters, Curse of Opulence, Kenrith's Transformation, Aqueous Form, Kaya's Ghostform, Rancor, Bear Umbra, Mechanized Production

### Trigger never fires: other (9)

Wild Growth, Utopia Sprawl, Crypt Ghast, Caretaker's Talent, Wizard Class, Mirari's Wake, Forbidden Orchard, Forsaken Monument, Caged Sun

### Keyword: Landfall (common cases only) (6)

Scute Swarm, Rampaging Baloths, Icetill Explorer, Tireless Tracker, Mossborn Hydra, Omnath, Locus of Rage

### Trigger never fires: other combat wording (5)

Kutzil, Malamet Exemplar, Trouble in Pairs, Curse of Opulence, Kodama of the West Tree, Kardur, Doomscourge

### Keyword: Changeling (common cases only) (4)

Realmwalker, Changeling Outcast, Taurean Mauler, Mirror Entity

### Trigger never fires: other enter/leave/die wording (2)

Caretaker's Talent, Nadier's Nightblade

### Trigger never fires: cards put into graveyard (2)

Bloodchief Ascension, The Gitrog Monster

### Keyword: Magecraft (common cases only) (1)

Storm-Kiln Artist

### Trigger never fires: other step/phase wording (1)

Pact of Negation

### Trigger never fires: noncombat damage (1)

Curiosity

### Keyword: Metalcraft (common cases only) (1)

Puresteel Paladin

### Trigger never fires: counters placed/removed (1)

Midnight Clock

### Keyword: Bestow (by hand) (1)

Springheart Nantuko

### Keyword: Aura (common cases only) (1)

Danitha Capashen, Paragon

### Keyword: Improvise (by hand) (1)

Kappa Cannoneer

### Spell: Cycling (1)

Unearth
