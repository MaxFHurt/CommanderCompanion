# Rules audit — the 1,000 most-played Commander cards

Made with `node tools/rules-audit.mjs` on 29 Oct 2026 (build 32) from Scryfall's cards ordered by EDHREC rank.
It checks each card the way Guided Play does: does each trigger ever fire, can each effect be applied automatically.
Static rules text other than keywords is not checked here (the game handles it in many places) and is not counted as a gap.

**521 of 1000 cards** have nothing to resolve by hand; **479** need something by hand.

| Cards | What players do by hand |
|---:|---|
| 152 | Spell: effect not applied automatically |
| 115 | Activated ability: effect not applied automatically |
| 108 | Trigger fires, but its effect is resolved by hand |
| 53 | Trigger never fires: other enter/leave/die wording |
| 20 | Trigger never fires: other combat wording |
| 13 | Trigger never fires: other cast wording |
| 13 | Trigger never fires: other |
| 13 | Keyword: Enchant (common cases only) |
| 10 | Trigger never fires: other step/phase wording |
| 6 | Trigger never fires: other draw wording |
| 6 | Keyword: Landfall (common cases only) |
| 4 | Spell: Overload |
| 4 | Spell: Flashback |
| 4 | Keyword: Changeling (common cases only) |
| 3 | Trigger never fires: counters placed/removed |
| 2 | Trigger never fires: noncombat damage |
| 2 | Trigger never fires: cards put into graveyard |
| 2 | Spell: Kicker |
| 1 | Keyword: Magecraft (common cases only) |
| 1 | Keyword: Metalcraft (common cases only) |
| 1 | Trigger never fires: searching a library |
| 1 | Keyword: Bestow (by hand) |
| 1 | Trigger never fires: exiling |
| 1 | Keyword: Aura (common cases only) |
| 1 | Keyword: Improvise (by hand) |
| 1 | Spell: Cycling |

## Cards by gap

### Spell: effect not applied automatically (152)

Path to Exile, Blasphemous Act, Beast Within, Heroic Intervention, Chaos Warp, An Offer You Can't Refuse, Arcane Denial, Negate, Generous Gift, Swan Song, Toxic Deluge, Brainstorm, Deflecting Swat, Fierce Guardianship, Frantic Search, Deadly Rollick, Jeska's Will, Teferi's Protection, Mana Drain, Assassin's Trophy, Victimize, Deadly Dispute, Big Score, Ponder, Pongify, Windfall, Flawless Maneuver, Austere Command, Return of the Wildspeaker, Farewell, Boros Charm, Akroma's Will, Stroke of Midnight, Village Rites, Force of Will, Rapid Hybridization, Thrill of Possibility, Terminate, Dovin's Veto, Malakir Rebirth // Malakir Mire, Growth Spiral, Rishkar's Expertise, Untimely Malfunction, Unexpected Windfall, Exsanguinate, Force of Negation, Snap, Inspiring Call, Reality Shift, Aetherize, Flusterstorm, Rakdos Charm, Putrefy, Dawn's Truce, Shamanic Revelation, Pact of Negation, Nature's Claim, Damnation, Silence, Demand Answers, Snakeskin Veil, Ephemerate, Cabal Ritual, Dispatch, Living Death, Red Elemental Blast, Tamiyo's Safekeeping, Supreme Verdict, Chandra's Ignition, Mental Misstep, Pyroblast, Rise of the Dark Realms, Blasphemous Edict, Culling the Weak, Redirect Lightning, Bolt Bend, Valakut Awakening // Valakut Stoneforge, Overwhelming Stampede, Veil of Summer, Gitaxian Probe, Clever Concealment, Mindbreak Trap, Second Harvest, Return the Favor, Unbreakable Formation, Saw in Half, Wheel of Fortune, Ghostly Flicker, Culling Ritual, Tibalt's Trickery, Corrupted Conviction, Archdruid's Charm, Torment of Hailfire, Dig Through Time, Noxious Revival, Borne Upon a Wind, Fog, Imp's Mischief, Treasure Cruise, Sea Gate Restoration // Sea Gate, Reborn, Bridgeworks Battle // Tanglespan Bridgeworks, Krosan Grip, Into the Flood Maw, Dramatic Reversal, Snuff Out, Wrath of God, Kindred Dominance, Sundering Eruption // Volcanic Fissure, Fact or Fiction, Chain Reaction, Life from the Loam, Narset's Reversal, Grapeshot, Flare of Fortitude, Seize the Spoils, Void Rend, Collective Resistance, Abrupt Decay, Revitalizing Repast // Old-Growth Grove, Cloudshift, Brain Freeze, Vanquish the Horde, Inkshield, High Tide, Bitter Triumph, Ripples of Potential, Curse of the Swine, Raise the Palisade, Breach the Multiverse, Splendid Reclamation, Expressive Iteration, Tragic Slip, Tainted Pact, Spell Pierce, Disrupt Decorum, Essence Flux, Thoughtcast, Promise of Loyalty, Demonic Consultation, Resculpt, Desperate Ritual, Cut a Deal, Approach of the Second Sun, Dispel, Agadeem's Awakening // Agadeem, the Undercrypt, All Is Dust, Dusk // Dawn, Defile, Last March of the Ents, Eerie Interlude, Chain of Vapor, Fumigate

### Activated ability: effect not applied automatically (115)

Rogue's Passage, Boseiju, Who Endures, Urza's Saga, Chrome Mox, Nykthos, Shrine to Nyx, Three Tree City, Command Beacon, Mosswort Bridge, Professional Face-Breaker, Sensei's Divining Top, Takenuma, Abandoned Mire, Bloom Tender, Syr Konrad, the Grim, Shadowspear, Loran of the Third Path, Ketria Triome, Goldspan Dragon, Shifting Woodland, Jetmir's Garden, Mistrise Village, Eiganjo, Seat of the Empire, Dauthi Voidwalker, Spara's Headquarters, Zagoth Triome, Kami of Whispered Hopes, Fanatic of Rhonas, Selvala, Heart of the Wilds, Gilded Lotus, Mystic Forge, Raffine's Tower, Mondrak, Glory Dominus, Bident of Thassa, Geier Reach Sanitarium, Treasure Vault, Plaza of Heroes, Xander's Lounge, Raugrin Triome, Indatha Triome, Faeburrow Elder, Savai Triome, Liquimetal Torque, Necropotence, Emergence Zone, Ziatora's Proving Ground, Maze of Ith, Nesting Grounds, Talon Gates of Madara, Basalt Monolith, Conduit of Worlds, Thespian's Stage, Access Tunnel, Emry, Lurker of the Loch, Strionic Resonator, Shizo, Death's Storehouse, Aftermath Analyst, Greater Good, Caretaker's Talent, Wizard Class, Incubation Druid, Altar of Dementia, Elspeth, Storm Slayer, Ozolith, the Shattered Spire, Sheltered Thicket, Midnight Clock, Windbrisk Heights, The Earth Crystal, Grim Monolith, Sanctum Weaver, Canyon Slough, Innkeeper's Talent, Aggravated Assault, Whip of Erebos, Lion's Eye Diamond, Oran-Rief, the Vastwood, Isochron Scepter, Liliana, Dreadhorde General, Elspeth, Sun's Champion, Reassembling Skeleton, Castle Locthwain, Escape Tunnel, Spinerock Knoll, Steel Overseer, Peregrin Took, Urza, Lord High Artificer, Ranger-Captain of Eos, Irrigated Farmland, Etali, Primal Conqueror // Etali, Primal Sickness, Brash Taunter, The Fire Crystal, Cankerbloom, Yawgmoth, Thran Physician, The Soul Stone, Ghost Quarter, The Mycosynth Gardens, Loot, Exuberant Explorer, Cephalid Coliseum, Fetid Pools, Lotus Field, Forgotten Cave, Boromir, Warden of the Tower, Evendo, Waking Haven, Reconnaissance, Throne of Eldraine, Solphim, Mayhem Dominus, Grim Hireling, Reconnaissance Mission, Bristly Bill, Spine Sower, Field of Ruin, Archway of Innovation, Evolution Witness, Unearth, Devoted Druid, Narset, Parter of Veils, Sokenzan, Crucible of Defiance, Mirror Entity

### Trigger fires, but its effect is resolved by hand (108)

Solemn Simulacrum, Garruk's Uprising, City of Brass, The One Ring, Eternal Witness, Herald's Horn, Mana Vault, Chrome Mox, Mystic Sanctuary, Mithril Coat, Gray Merchant of Asphodel, Orcish Bowmasters, Inventors' Fair, Craterhoof Behemoth, Braids, Arisen Nightmare, The Ozolith, Sun Titan, Simic Growth Chamber, Reclamation Sage, Golgari Rot Farm, Land Tax, Aetherflux Reservoir, Dimir Aqueduct, Forgotten Ancient, Helm of the Host, Selvala, Heart of the Wilds, Orzhov Basilica, Enduring Vitality, Sram, Senior Edificer, Izzet Boilerworks, Bident of Thassa, Disciple of Freyalise // Garden of Freyalise, Thassa's Oracle, Conjurer's Closet, Gruul Turf, Accursed Marauder, Azorius Chancery, Vito, Thorn of the Dusk Rose, Adeline, Resplendent Cathar, Field of the Dead, Birgi, God of Storytelling // Harnfel, Horn of Bounty, Sanguine Bond, Terror of the Peaks, Massacre Wurm, The Meathook Massacre, Exquisite Blood, Boros Garrison, Rakdos Carnarium, Necropotence, Talon Gates of Madara, Beastmaster Ascension, Grave Pact, Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun, Selesnya Sanctuary, Six, Hydroelectric Specimen // Hydroelectric Laboratory, Ancient Copper Dragon, Plaguecrafter, Knight of the White Orchid, Archaeomancer's Map, Wood Elves, Black Market, Shared Animosity, Dualcaster Mage, Reflections of Littjara, Mortuary Mire, Imperial Recruiter, Riveteers Overlook, Hammer of Nazahn, Sheoldred, Whispering One, Enduring Innocence, Hellkite Tyrant, Chimil, the Inner Sun, Veyran, Voice of Duality, Loyal Apprentice, Spelunking, Isochron Scepter, Bloodchief Ascension, Soul's Attendant, Enduring Tenacity, Springbloom Druid, Fleshbag Marauder, Bloodthirsty Conqueror, Ranger-Captain of Eos, Enduring Curiosity, Mesa Enchantress, Witch's Cottage, Scrap Trawler, Myr Retriever, Padeem, Consul of Innovation, Descent into Avernus, Kappa Cannoneer, Reconnaissance Mission, The Gitrog Monster, Emeria, the Sky Ruin, Thopter Spy Network, Myr Battlesphere, Old Gnawbone, Peregrine Drake, Cyberdrive Awakener, Cabaretti Courtyard, Teleportation Circle, Archon of Cruelty, Mechanized Production, Mindcrank, Angel of the Ruins, Tataru Taru, Annie Joins Up

### Trigger never fires: other enter/leave/die wording (53)

Skullclamp, Garruk's Uprising, Tireless Provisioner, Impact Tremors, Animate Dead, The Great Henge, Scute Swarm, Syr Konrad, the Grim, Avenger of Zendikar, Authority of the Consuls, Guardian Project, Lotus Cobra, Loran of the Third Path, Rampaging Baloths, Evolution Sage, Welcoming Vampire, Tatyova, Benthic Druid, Massacre Wurm, The Meathook Massacre, Felidar Retreat, Elemental Bond, Cathars' Crusade, Puresteel Paladin, Icetill Explorer, Emry, Lurker of the Loch, Tribute to the World Tree, Caretaker's Talent, Reckless Fireweaver, Tireless Tracker, Mentor of the Meek, Archaeomancer's Map, Springheart Nantuko, Enduring Innocence, Warstorm Surge, Mossborn Hydra, Kenrith's Transformation, Urza, Lord High Artificer, Tocasia's Welcome, Etali, Primal Conqueror // Etali, Primal Sickness, Ayara, First of Locthwain, Sigarda's Aid, Dragon Tempest, Aesi, Tyrant of Gyre Strait, Rishkar, Peema Renegade, Temur Ascendancy, Warleader's Call, Bristly Bill, Spine Sower, Ojer Taq, Deepest Foundation // Temple of Civilization, Omnath, Locus of Rage, Moraug, Fury of Akoum, Bloodghast, Kardur, Doomscourge, Kodama of the East Tree

### Trigger never fires: other combat wording (20)

Sword of the Animist, Etali, Primal Storm, Ragavan, Nimble Pilferer, Kindred Discovery, Kutzil, Malamet Exemplar, Unnatural Growth, Sword of Feast and Famine, Mangara, the Diplomat, Trouble in Pairs, Goreclaw, Terror of Qal Sisma, Curse of Opulence, Aqueous Form, Aurelia, the Warleader, Buster Sword, Kodama of the West Tree, Sword of Hearth and Home, Krenko, Tin Street Kingpin, Thopter Spy Network, Mask of Memory, Kardur, Doomscourge

### Trigger never fires: other cast wording (13)

Rhystic Study, Esper Sentinel, Mystic Remora, Forgotten Ancient, Lotho, Corrupt Shirriff, Displacer Kitten, Mangara, the Diplomat, Valley Floodcaller, Niv-Mizzet, Parun, Coruscation Mage, Ledger Shredder, Boromir, Warden of the Tower, Taurean Mauler

### Trigger never fires: other (13)

Wild Growth, Morbid Opportunist, Utopia Sprawl, Crypt Ghast, Marionette Apprentice, Caretaker's Talent, Wizard Class, Mirari's Wake, Forbidden Orchard, Rancor, Forsaken Monument, Burgeoning, Caged Sun

### Keyword: Enchant (common cases only) (13)

Wild Growth, Animate Dead, Utopia Sprawl, Curiosity, Darksteel Mutation, All That Glitters, Curse of Opulence, Kenrith's Transformation, Aqueous Form, Kaya's Ghostform, Rancor, Bear Umbra, Mechanized Production

### Trigger never fires: other step/phase wording (10)

Black Market Connections, Mana Vault, Sylvan Library, Pact of Negation, Underworld Breach, Ripples of Undeath, Ophiomancer, Midnight Clock, Black Market, Howling Mine

### Trigger never fires: other draw wording (6)

Smothering Tithe, Faerie Mastermind, Sheoldred, the Apocalypse, Scrawling Crawler, Consecrated Sphinx, Tataru Taru

### Keyword: Landfall (common cases only) (6)

Scute Swarm, Rampaging Baloths, Icetill Explorer, Tireless Tracker, Mossborn Hydra, Omnath, Locus of Rage

### Spell: Overload (4)

Cyclonic Rift, Vandalblast, Damn, Mizzix's Mastery

### Spell: Flashback (4)

Faithless Looting, Sevinne's Reclamation, Dread Return, Strike It Rich

### Keyword: Changeling (common cases only) (4)

Realmwalker, Changeling Outcast, Taurean Mauler, Mirror Entity

### Trigger never fires: counters placed/removed (3)

Midnight Clock, Terrasymbiosis, Evolution Witness

### Trigger never fires: noncombat damage (2)

Curiosity, Brash Taunter

### Trigger never fires: cards put into graveyard (2)

Bloodchief Ascension, The Gitrog Monster

### Spell: Kicker (2)

Tear Asunder, Rite of Replication

### Keyword: Magecraft (common cases only) (1)

Storm-Kiln Artist

### Keyword: Metalcraft (common cases only) (1)

Puresteel Paladin

### Trigger never fires: searching a library (1)

Archivist of Oghma

### Keyword: Bestow (by hand) (1)

Springheart Nantuko

### Trigger never fires: exiling (1)

Kaya's Ghostform

### Keyword: Aura (common cases only) (1)

Danitha Capashen, Paragon

### Keyword: Improvise (by hand) (1)

Kappa Cannoneer

### Spell: Cycling (1)

Unearth
