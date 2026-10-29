# Rules audit — the 1,000 most-played Commander cards

Made with `node tools/rules-audit.mjs tests/fixtures/top-commander-cards.json.gz` on 29 Oct 2026 (build 33): Scryfall's cards ordered by EDHREC rank.
It checks each card the way Guided Play does: does each trigger ever fire, can each effect be applied automatically.
Static rules text other than keywords is not checked here (the game handles it in many places) and is not counted as a gap.
Triggers are also checked against Forge's hand-written card scripts: `node tests/node/forge-triggers.mjs` (99% fire when they should, 100% stay quiet for the wrong player).

**546 of 1000 cards** have nothing to resolve by hand; **454** need something by hand.

Build 32 → 33: triggers that never fired went from 126 (on 120 cards) to 21.

| Cards | What players do by hand |
|---:|---|
| 167 | Trigger fires, but its effect is resolved by hand |
| 152 | Spell: effect not applied automatically |
| 114 | Activated ability: effect not applied automatically |
| 13 | Keyword: Enchant (common cases only) |
| 9 | Trigger never fires: other |
| 6 | Keyword: Landfall (common cases only) |
| 5 | Trigger never fires: other combat wording |
| 4 | Spell: Overload |
| 4 | Spell: Flashback |
| 4 | Keyword: Changeling (common cases only) |
| 2 | Trigger never fires: other enter/leave/die wording |
| 2 | Trigger never fires: cards put into graveyard |
| 2 | Spell: Kicker |
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

### Trigger fires, but its effect is resolved by hand (167)

Solemn Simulacrum, Rhystic Study, Smothering Tithe, Esper Sentinel, Garruk's Uprising, City of Brass, The One Ring, Mystic Remora, Eternal Witness, Herald's Horn, Mana Vault, Chrome Mox, Mystic Sanctuary, Tireless Provisioner, Animate Dead, Sword of the Animist, Mithril Coat, Scute Swarm, Gray Merchant of Asphodel, Sylvan Library, Orcish Bowmasters, Inventors' Fair, Etali, Primal Storm, Ragavan, Nimble Pilferer, Craterhoof Behemoth, Braids, Arisen Nightmare, Avenger of Zendikar, The Ozolith, Sun Titan, Simic Growth Chamber, Guardian Project, Reclamation Sage, Golgari Rot Farm, Loran of the Third Path, Land Tax, Aetherflux Reservoir, Dimir Aqueduct, Underworld Breach, Forgotten Ancient, Helm of the Host, Selvala, Heart of the Wilds, Orzhov Basilica, Enduring Vitality, Unnatural Growth, Sram, Senior Edificer, Izzet Boilerworks, Bident of Thassa, Disciple of Freyalise // Garden of Freyalise, Thassa's Oracle, Sheoldred, the Apocalypse, Conjurer's Closet, Gruul Turf, Accursed Marauder, Azorius Chancery, Vito, Thorn of the Dusk Rose, Adeline, Resplendent Cathar, Field of the Dead, Birgi, God of Storytelling // Harnfel, Horn of Bounty, Sanguine Bond, Terror of the Peaks, Massacre Wurm, The Meathook Massacre, Exquisite Blood, Boros Garrison, Rakdos Carnarium, Necropotence, Ripples of Undeath, Sword of Feast and Famine, Displacer Kitten, Talon Gates of Madara, Beastmaster Ascension, Grave Pact, Scrawling Crawler, Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun, Selesnya Sanctuary, Six, Puresteel Paladin, Icetill Explorer, Hydroelectric Specimen // Hydroelectric Laboratory, Mangara, the Diplomat, Tribute to the World Tree, Ancient Copper Dragon, Ophiomancer, Goreclaw, Terror of Qal Sisma, Plaguecrafter, Consecrated Sphinx, Midnight Clock, Knight of the White Orchid, Mentor of the Meek, Archaeomancer's Map, Wood Elves, Black Market, Shared Animosity, Dualcaster Mage, Reflections of Littjara, Springheart Nantuko, Mortuary Mire, Imperial Recruiter, Riveteers Overlook, Hammer of Nazahn, Howling Mine, Sheoldred, Whispering One, Enduring Innocence, Hellkite Tyrant, Chimil, the Inner Sun, Veyran, Voice of Duality, Mossborn Hydra, Loyal Apprentice, Spelunking, Terrasymbiosis, Valley Floodcaller, Isochron Scepter, Bloodchief Ascension, Kaya's Ghostform, Soul's Attendant, Enduring Tenacity, Springbloom Druid, Fleshbag Marauder, Urza, Lord High Artificer, Bloodthirsty Conqueror, Ranger-Captain of Eos, Aurelia, the Warleader, Etali, Primal Conqueror // Etali, Primal Sickness, Brash Taunter, Enduring Curiosity, Sigarda's Aid, Buster Sword, Dragon Tempest, Ledger Shredder, Aesi, Tyrant of Gyre Strait, Mesa Enchantress, Rancor, Witch's Cottage, Boromir, Warden of the Tower, Scrap Trawler, Rishkar, Peema Renegade, Myr Retriever, Padeem, Consul of Innovation, Descent into Avernus, Temur Ascendancy, Kappa Cannoneer, Burgeoning, Reconnaissance Mission, The Gitrog Monster, Sword of Hearth and Home, Krenko, Tin Street Kingpin, Emeria, the Sky Ruin, Thopter Spy Network, Myr Battlesphere, Ojer Taq, Deepest Foundation // Temple of Civilization, Old Gnawbone, Peregrine Drake, Cyberdrive Awakener, Taurean Mauler, Moraug, Fury of Akoum, Cabaretti Courtyard, Teleportation Circle, Mask of Memory, Archon of Cruelty, Mechanized Production, Mindcrank, Bloodghast, Angel of the Ruins, Kardur, Doomscourge, Tataru Taru, Annie Joins Up, Kodama of the East Tree

### Spell: effect not applied automatically (152)

Path to Exile, Blasphemous Act, Beast Within, Heroic Intervention, Chaos Warp, An Offer You Can't Refuse, Arcane Denial, Negate, Generous Gift, Swan Song, Toxic Deluge, Brainstorm, Deflecting Swat, Fierce Guardianship, Frantic Search, Deadly Rollick, Jeska's Will, Teferi's Protection, Mana Drain, Assassin's Trophy, Victimize, Deadly Dispute, Big Score, Ponder, Pongify, Windfall, Flawless Maneuver, Austere Command, Return of the Wildspeaker, Farewell, Boros Charm, Akroma's Will, Stroke of Midnight, Village Rites, Force of Will, Rapid Hybridization, Thrill of Possibility, Terminate, Dovin's Veto, Malakir Rebirth // Malakir Mire, Growth Spiral, Rishkar's Expertise, Untimely Malfunction, Unexpected Windfall, Exsanguinate, Force of Negation, Snap, Inspiring Call, Reality Shift, Aetherize, Flusterstorm, Rakdos Charm, Putrefy, Dawn's Truce, Shamanic Revelation, Pact of Negation, Nature's Claim, Damnation, Silence, Demand Answers, Snakeskin Veil, Ephemerate, Cabal Ritual, Dispatch, Living Death, Red Elemental Blast, Tamiyo's Safekeeping, Supreme Verdict, Chandra's Ignition, Mental Misstep, Pyroblast, Rise of the Dark Realms, Blasphemous Edict, Culling the Weak, Redirect Lightning, Bolt Bend, Valakut Awakening // Valakut Stoneforge, Overwhelming Stampede, Veil of Summer, Gitaxian Probe, Clever Concealment, Mindbreak Trap, Second Harvest, Return the Favor, Unbreakable Formation, Saw in Half, Wheel of Fortune, Ghostly Flicker, Culling Ritual, Tibalt's Trickery, Corrupted Conviction, Archdruid's Charm, Torment of Hailfire, Dig Through Time, Noxious Revival, Borne Upon a Wind, Fog, Imp's Mischief, Treasure Cruise, Sea Gate Restoration // Sea Gate, Reborn, Bridgeworks Battle // Tanglespan Bridgeworks, Krosan Grip, Into the Flood Maw, Dramatic Reversal, Snuff Out, Wrath of God, Kindred Dominance, Sundering Eruption // Volcanic Fissure, Fact or Fiction, Chain Reaction, Life from the Loam, Narset's Reversal, Grapeshot, Flare of Fortitude, Seize the Spoils, Void Rend, Collective Resistance, Abrupt Decay, Revitalizing Repast // Old-Growth Grove, Cloudshift, Brain Freeze, Vanquish the Horde, Inkshield, High Tide, Bitter Triumph, Ripples of Potential, Curse of the Swine, Raise the Palisade, Breach the Multiverse, Splendid Reclamation, Expressive Iteration, Tragic Slip, Tainted Pact, Spell Pierce, Disrupt Decorum, Essence Flux, Thoughtcast, Promise of Loyalty, Demonic Consultation, Resculpt, Desperate Ritual, Cut a Deal, Approach of the Second Sun, Dispel, Agadeem's Awakening // Agadeem, the Undercrypt, All Is Dust, Dusk // Dawn, Defile, Last March of the Ents, Eerie Interlude, Chain of Vapor, Fumigate

### Activated ability: effect not applied automatically (114)

Rogue's Passage, Boseiju, Who Endures, Urza's Saga, Chrome Mox, Nykthos, Shrine to Nyx, Three Tree City, Command Beacon, Mosswort Bridge, Professional Face-Breaker, Sensei's Divining Top, Takenuma, Abandoned Mire, Bloom Tender, Syr Konrad, the Grim, Shadowspear, Loran of the Third Path, Ketria Triome, Goldspan Dragon, Shifting Woodland, Jetmir's Garden, Mistrise Village, Eiganjo, Seat of the Empire, Dauthi Voidwalker, Spara's Headquarters, Zagoth Triome, Kami of Whispered Hopes, Fanatic of Rhonas, Selvala, Heart of the Wilds, Gilded Lotus, Mystic Forge, Raffine's Tower, Mondrak, Glory Dominus, Bident of Thassa, Geier Reach Sanitarium, Treasure Vault, Plaza of Heroes, Xander's Lounge, Raugrin Triome, Indatha Triome, Faeburrow Elder, Savai Triome, Liquimetal Torque, Necropotence, Emergence Zone, Ziatora's Proving Ground, Maze of Ith, Nesting Grounds, Talon Gates of Madara, Basalt Monolith, Conduit of Worlds, Thespian's Stage, Access Tunnel, Emry, Lurker of the Loch, Strionic Resonator, Shizo, Death's Storehouse, Aftermath Analyst, Greater Good, Caretaker's Talent, Wizard Class, Incubation Druid, Altar of Dementia, Elspeth, Storm Slayer, Ozolith, the Shattered Spire, Sheltered Thicket, Midnight Clock, Windbrisk Heights, The Earth Crystal, Grim Monolith, Sanctum Weaver, Canyon Slough, Innkeeper's Talent, Aggravated Assault, Whip of Erebos, Lion's Eye Diamond, Oran-Rief, the Vastwood, Isochron Scepter, Liliana, Dreadhorde General, Elspeth, Sun's Champion, Reassembling Skeleton, Castle Locthwain, Escape Tunnel, Spinerock Knoll, Steel Overseer, Peregrin Took, Urza, Lord High Artificer, Ranger-Captain of Eos, Irrigated Farmland, Etali, Primal Conqueror // Etali, Primal Sickness, Brash Taunter, The Fire Crystal, Cankerbloom, The Soul Stone, Ghost Quarter, The Mycosynth Gardens, Loot, Exuberant Explorer, Cephalid Coliseum, Fetid Pools, Lotus Field, Forgotten Cave, Boromir, Warden of the Tower, Evendo, Waking Haven, Reconnaissance, Throne of Eldraine, Solphim, Mayhem Dominus, Grim Hireling, Reconnaissance Mission, Bristly Bill, Spine Sower, Field of Ruin, Archway of Innovation, Evolution Witness, Unearth, Devoted Druid, Narset, Parter of Veils, Sokenzan, Crucible of Defiance, Mirror Entity

### Keyword: Enchant (common cases only) (13)

Wild Growth, Animate Dead, Utopia Sprawl, Curiosity, Darksteel Mutation, All That Glitters, Curse of Opulence, Kenrith's Transformation, Aqueous Form, Kaya's Ghostform, Rancor, Bear Umbra, Mechanized Production

### Trigger never fires: other (9)

Wild Growth, Utopia Sprawl, Crypt Ghast, Caretaker's Talent, Wizard Class, Mirari's Wake, Forbidden Orchard, Forsaken Monument, Caged Sun

### Keyword: Landfall (common cases only) (6)

Scute Swarm, Rampaging Baloths, Icetill Explorer, Tireless Tracker, Mossborn Hydra, Omnath, Locus of Rage

### Trigger never fires: other combat wording (5)

Kutzil, Malamet Exemplar, Trouble in Pairs, Curse of Opulence, Kodama of the West Tree, Kardur, Doomscourge

### Spell: Overload (4)

Cyclonic Rift, Vandalblast, Damn, Mizzix's Mastery

### Spell: Flashback (4)

Faithless Looting, Sevinne's Reclamation, Dread Return, Strike It Rich

### Keyword: Changeling (common cases only) (4)

Realmwalker, Changeling Outcast, Taurean Mauler, Mirror Entity

### Trigger never fires: other enter/leave/die wording (2)

Caretaker's Talent, Nadier's Nightblade

### Trigger never fires: cards put into graveyard (2)

Bloodchief Ascension, The Gitrog Monster

### Spell: Kicker (2)

Tear Asunder, Rite of Replication

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
