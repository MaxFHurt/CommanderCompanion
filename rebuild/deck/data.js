// Starter library. name|cost|type|est. USD|text (~ = card name)|flags (S = Standard pool)|P/T
const STARTER_RAW = String.raw`
Sol Ring|1|Artifact|1.5|{T}: Add {C}{C}.
Arcane Signet|2|Artifact|0.75|{T}: Add one mana of any color in your commander's color identity.
Mind Stone|2|Artifact|0.4|{T}: Add {C}. {1}, {T}, Sacrifice ~: Draw a card.
Thought Vessel|2|Artifact|1.5|You have no maximum hand size. {T}: Add {C}.
Fellwar Stone|2|Artifact|1.2|{T}: Add one mana of any color that a land an opponent controls could produce.
Commander's Sphere|3|Artifact|0.25|{T}: Add one mana of any color in your commander's color identity. Sacrifice ~: Draw a card.
Wayfarer's Bauble|1|Artifact|0.5|{2}, {T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.
Chromatic Lantern|3|Artifact|4|Lands you control have "{T}: Add one mana of any color." {T}: Add one mana of any color.
Hedron Archive|4|Artifact|0.3|{T}: Add {C}{C}. {2}, {T}, Sacrifice ~: Draw two cards.
Worn Powerstone|3|Artifact|1|~ enters tapped. {T}: Add {C}{C}.
Thran Dynamo|4|Artifact|2|{T}: Add {C}{C}{C}.
Gilded Lotus|5|Artifact|2|{T}: Add three mana of any one color.
Mana Vault|1|Artifact|45|~ doesn't untap during your untap step. At the beginning of your upkeep, you may pay {4}. If you do, untap ~. At the beginning of your draw step, if ~ is tapped, it deals 1 damage to you. {T}: Add {C}{C}{C}.
Chrome Mox|0|Artifact|40|Imprint — When ~ enters, you may exile a nonartifact, nonland card from your hand. {T}: Add one mana of any of the exiled card's colors.
The One Ring|4|Legendary Artifact|70|Indestructible. When ~ enters, if you cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1 life for each burden counter on ~. {T}: Put a burden counter on ~, then draw a card for each burden counter on ~.
Sensei's Divining Top|1|Artifact|30|{1}: Look at the top three cards of your library, then put them back in any order. {T}: Draw a card, then put ~ on top of its owner's library.
Swiftfoot Boots|2|Artifact — Equipment|1.5|Equipped creature has hexproof and haste. Equip {1}
Lightning Greaves|2|Artifact — Equipment|5|Equipped creature has haste and shroud. Equip {0}
Skullclamp|1|Artifact — Equipment|4|Equipped creature gets +1/-1. Whenever equipped creature dies, draw two cards. Equip {1}
Blackblade Reforged|2|Legendary Artifact — Equipment|1.5|Equipped creature gets +1/+1 for each land you control. Equip legendary creature {3}. Equip {7}
Colossus Hammer|1|Artifact — Equipment|1|Equipped creature gets +10/+10 and loses flying. Equip {8}
Sword of the Animist|2|Legendary Artifact — Equipment|6|Equipped creature gets +1/+1. Whenever equipped creature attacks, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Equip {2}
Loxodon Warhammer|3|Artifact — Equipment|1.5|Equipped creature gets +3/+0 and has trample and lifelink. Equip {3}
Fireshrieker|3|Artifact — Equipment|0.5|Equipped creature has double strike. Equip {2}
Whispersilk Cloak|3|Artifact — Equipment|1.5|Equipped creature can't be blocked and has shroud. Equip {2}
Solemn Simulacrum|4|Artifact Creature — Golem|0.5|When ~ enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle. When ~ dies, you may draw a card.|S|2/2
Burnished Hart|3|Artifact Creature — Elk|0.2|{3}, Sacrifice ~: Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.||2/2
Meteor Golem|7|Artifact Creature — Golem|0.1|When ~ enters, destroy target nonland permanent an opponent controls.||3/3
Wurmcoil Engine|6|Artifact Creature — Phyrexian Wurm|18|Deathtouch, lifelink. When ~ dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm artifact creature token with lifelink.||6/6
Myr Battlesphere|7|Artifact Creature — Myr Construct|0.8|When ~ enters, create four 1/1 colorless Myr artifact creature tokens. Whenever ~ attacks, you may tap X untapped Myr you control. If you do, ~ gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking.||4/7
Foundry Inspector|3|Artifact Creature — Construct|0.3|Artifact spells you cast cost {1} less to cast.||3/2
Mystic Forge|4|Artifact|3|You may look at the top card of your library any time. You may cast artifact spells and colorless spells from the top of your library. {T}, Pay 1 life: Exile the top card of your library.
Nevinyrral's Disk|4|Artifact|2|~ enters tapped. {1}, {T}: Destroy all artifacts, creatures, and enchantments.
Panharmonicon|4|Artifact|5|If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.
Conjurer's Closet|5|Artifact|2|At the beginning of your end step, you may exile target creature you control, then return that card to the battlefield under your control.
Herald's Horn|3|Artifact|5|As ~ enters, choose a creature type. Creature spells you cast of the chosen type cost {1} less to cast. At the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand.
Icon of Ancestry|3|Artifact|1.5|As ~ enters, choose a creature type. Creatures you control of the chosen type get +1/+1. {3}, {T}: Look at the top three cards of your library. You may reveal a creature card of the chosen type from among them and put it into your hand. Put the rest on the bottom of your library in a random order.
Obelisk of Urd|6|Artifact|1|Convoke. As ~ enters, choose a creature type. Creatures you control of the chosen type get +2/+2.
Vanquisher's Banner|5|Artifact|6|As ~ enters, choose a creature type. Creatures you control of the chosen type get +1/+1. Whenever you cast a creature spell of the chosen type, draw a card.
Dragon's Hoard|3|Artifact|1.5|Whenever a Dragon you control enters, put a gold counter on ~. {T}, Remove a gold counter from ~: Draw a card. {T}: Add one mana of any color.
Ashnod's Altar|3|Artifact|5|Sacrifice a creature: Add {C}{C}.
Well of Lost Dreams|4|Artifact|2|Whenever you gain life, you may pay {X}, where X is less than or equal to the amount of life you gained. If you do, draw X cards.
Command Tower||Land|0.3|{T}: Add one mana of any color in your commander's color identity.
Exotic Orchard||Land|0.6|{T}: Add one mana of any color that a land an opponent controls could produce.
Path of Ancestry||Land|0.5|~ enters tapped. {T}: Add one mana of any color in your commander's color identity. When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1.
Evolving Wilds||Land|0.15|{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.|S
Terramorphic Expanse||Land|0.2|{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.
Myriad Landscape||Land|0.4|~ enters tapped. {T}: Add {C}. {2}, {T}, Sacrifice ~: Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle.
Rogue's Passage||Land|0.4|{T}: Add {C}. {4}, {T}: Target creature can't be blocked this turn.|S
Reliquary Tower||Land|2.5|You have no maximum hand size. {T}: Add {C}.
War Room||Land|2|{T}: Add {C}. {3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card.
Temple of the False God||Land|0.3|{T}: Add {C}{C}. Activate only if you control five or more lands.
Ash Barrens||Land|0.4|{T}: Add {C}. Basic landcycling {1}
Bojuka Bog||Land|1.5|~ enters tapped. When ~ enters, exile target player's graveyard. {T}: Add {B}.
Mystic Sanctuary||Land — Island|3|~ enters tapped unless you control three or more other Islands. When ~ enters untapped, you may put target instant or sorcery card from your graveyard on top of your library.
Ancient Tomb||Land|90|{T}: Add {C}{C}. ~ deals 2 damage to you.
Mana Confluence||Land|35|{T}, Pay 1 life: Add one mana of any color.
Swords to Plowshares|W|Instant|1.2|Exile target creature. Its controller gains life equal to its power.
Path to Exile|W|Instant|1.5|Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.
Generous Gift|2W|Instant|1|Destroy target permanent. Its controller creates a 3/3 green Elephant creature token.
Wrath of God|2WW|Sorcery|2.5|Destroy all creatures. They can't be regenerated.
Austere Command|4WW|Sorcery|1|Choose two — Destroy all artifacts; or destroy all enchantments; or destroy all creatures with mana value 3 or less; or destroy all creatures with mana value 4 or greater.
Farewell|4WW|Sorcery|10|Choose one or more — Exile all artifacts; exile all creatures; exile all enchantments; exile all graveyards.
Hour of Reckoning|4WWW|Sorcery|0.5|Convoke. Destroy all nontoken creatures.
Teferi's Protection|2W|Instant|35|Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. Exile ~.
Flawless Maneuver|2W|Instant|10|If you control a commander, you may cast this spell without paying its mana cost. Creatures you control gain indestructible until end of turn.
Unbreakable Formation|2W|Instant|0.8|Creatures you control gain indestructible until end of turn. Addendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures and they gain vigilance until end of turn.
Smothering Tithe|3W|Enchantment|25|Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.
Esper Sentinel|W|Artifact Creature — Human Soldier|22|Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is ~'s power.||1/1
Enlightened Tutor|W|Instant|25|Search your library for an artifact or enchantment card, reveal it, then shuffle and put that card on top.
Land Tax|W|Enchantment|20|At the beginning of your upkeep, if an opponent controls more lands than you, you may search your library for up to three basic land cards, reveal them, put them into your hand, then shuffle.
Knight of the White Orchid|WW|Creature — Human Knight|1|First strike. When ~ enters, if an opponent controls more lands than you, you may search your library for a Plains card, put it onto the battlefield, then shuffle.||2/2
Archaeomancer's Map|2W|Artifact|6|When ~ enters, search your library for up to two basic Plains cards, reveal them, put them into your hand, then shuffle. Whenever a land enters under an opponent's control, if that player controls more lands than you, you may put a land card from your hand onto the battlefield.
Anointed Procession|3W|Enchantment|40|If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.
Intangible Virtue|1W|Enchantment|0.8|Creature tokens you control get +1/+1 and have vigilance.
Secure the Wastes|XW|Instant|1.5|Create X 1/1 white Warrior creature tokens.
Call the Coppercoats|2W|Instant|4|Strive — This spell costs {1}{W} more to cast for each target beyond the first. Choose any number of target opponents. Create X 1/1 white Human Soldier creature tokens, where X is the number of creatures those opponents control.
Elspeth, Sun's Champion|4WW|Legendary Planeswalker — Elspeth|3|+1: Create three 1/1 white Soldier creature tokens. −3: Destroy all creatures with power 4 or greater. −7: You get an emblem with "Creatures you control get +2/+2 and have flying."
Welcoming Vampire|2W|Creature — Vampire|1|Flying. Whenever one or more other creatures you control with power 2 or less enter, draw a card. This ability triggers only once each turn.||2/3
Mentor of the Meek|2W|Creature — Human Soldier|0.8|Whenever another creature you control with power 2 or less enters, you may pay {1}. If you do, draw a card.||2/2
Soul Warden|W|Creature — Human Cleric|1|Whenever another creature enters, you gain 1 life.||1/1
Archangel of Thune|3WW|Creature — Angel|10|Flying, lifelink. Whenever you gain life, put a +1/+1 counter on each creature you control.||3/4
Cathars' Crusade|3WW|Enchantment|4|Whenever a creature you control enters, put a +1/+1 counter on each creature you control.
Sun Titan|4WW|Creature — Giant|1|Vigilance. Whenever ~ enters or attacks, you may return target permanent card with mana value 3 or less from your graveyard to the battlefield.||6/6
Karmic Guide|3WW|Creature — Angel Spirit|3|Flying, protection from black. Echo {3}{W}{W}. When ~ enters, return target creature card from your graveyard to the battlefield.||2/2
Ephemerate|W|Instant|2|Exile target creature you control, then return it to the battlefield under its owner's control. Rebound
Cloudshift|W|Instant|0.5|Exile target creature you control, then return that card to the battlefield under your control.
Restoration Angel|3W|Creature — Angel|1|Flash. Flying. When ~ enters, you may exile target non-Angel creature you control, then return that card to the battlefield under your control.||3/4
Sram, Senior Edificer|1W|Legendary Creature — Dwarf Advisor|1|Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.||2/2
Puresteel Paladin|WW|Creature — Human Knight|8|Whenever an Equipment enters under your control, you may draw a card. Metalcraft — Equipment you control have equip {0} as long as you control three or more artifacts.||2/2
Stoneforge Mystic|1W|Creature — Kor Artificer|8|When ~ enters, you may search your library for an Equipment card, reveal it, put it into your hand, then shuffle. {1}{W}, {T}: You may put an Equipment card from your hand onto the battlefield.||1/2
Sigarda's Aid|W|Enchantment|6|You may cast Aura and Equipment spells as though they had flash. Whenever an Equipment enters under your control, you may attach it to target creature you control.
All That Glitters|1W|Enchantment — Aura|1|Enchant creature. Enchanted creature gets +1/+1 for each artifact and/or enchantment you control.
Ethereal Armor|W|Enchantment — Aura|0.5|Enchant creature. Enchanted creature gets +1/+1 for each enchantment you control and has first strike.
Sigil of the Empty Throne|3WW|Enchantment|1|Whenever you cast an enchantment spell, create a 4/4 white Angel creature token with flying.
Mesa Enchantress|1WW|Creature — Human Druid|1.5|Whenever you cast an enchantment spell, you may draw a card.||0/2
Ghostly Prison|2W|Enchantment|3.5|Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.
Dispatch|W|Instant|0.5|Tap target creature. Metalcraft — If you control three or more artifacts, exile that creature.
Kinjalli's Caller|W|Creature — Human Cleric|0.3|Dinosaur spells you cast cost {1} less to cast.||0/3
Ajani's Pridemate|1W|Creature — Cat Soldier|0.3|Whenever you gain life, put a +1/+1 counter on ~.|S|2/2
Healer's Hawk|W|Creature — Bird|0.2|Flying, lifelink|S|1/1
Hinterland Sanctifier|W|Creature — Rabbit Cleric|0.5|Whenever another creature you control enters, you gain 1 life.|S|1/2
Dazzling Angel|2W|Creature — Angel|0.3|Flying. Whenever another creature you control enters, you gain 1 life.|S|2/3
Giada, Font of Hope|1W|Legendary Creature — Angel|2.5|Flying, vigilance. Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control. {T}: Add {W}. Spend this mana only to cast an Angel spell.|S|2/2
Youthful Valkyrie|1W|Creature — Angel|0.5|Flying. Whenever another Angel you control enters, put a +1/+1 counter on ~.|S|1/3
Serra Angel|3WW|Creature — Angel|0.1|Flying, vigilance|S|4/4
Lyra Dawnbringer|3WW|Legendary Creature — Angel|4|Flying, first strike, lifelink. Other Angels you control get +1/+1 and have lifelink.|S|5/5
Resolute Reinforcements|1W|Creature — Human Soldier|0.3|Flash. When ~ enters, create a 1/1 white Soldier creature token.|S|1/1
Day of Judgment|2WW|Sorcery|1.5|Destroy all creatures.|S
Banishing Light|2W|Enchantment|0.2|When ~ enters, exile target nonland permanent an opponent controls until ~ leaves the battlefield.|S
Authority of the Consuls|W|Enchantment|4|Creatures your opponents control enter tapped. Whenever a creature an opponent controls enters, you gain 1 life.|S
Felidar Retreat|3W|Enchantment|1|Landfall — Whenever a land you control enters, choose one — Create a 2/2 white Cat Beast creature token; or put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.|S
Valorous Stance|1W|Instant|0.3|Choose one — Target creature gains indestructible until end of turn; or destroy target creature with toughness 4 or greater.|S
Angel of Finality|3W|Creature — Angel|0.3|Flying. When ~ enters, exile target player's graveyard.|S|3/4
Counterspell|UU|Instant|1.2|Counter target spell.
Swan Song|U|Instant|6|Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.
An Offer You Can't Refuse|U|Instant|2.5|Counter target noncreature spell. Its controller creates two Treasure tokens.
Arcane Denial|1U|Instant|1|Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep. You draw a card at the beginning of the next turn's upkeep.
Fierce Guardianship|2U|Instant|40|If you control a commander, you may cast this spell without paying its mana cost. Counter target noncreature spell.
Force of Will|3UU|Instant|70|You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost. Counter target spell.
Mana Drain|UU|Instant|40|Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value.
Cyclonic Rift|1U|Instant|40|Return target nonland permanent you don't control to its owner's hand. Overload {6}{U} (Return all nonland permanents you don't control instead.)
Rhystic Study|2U|Enchantment|40|Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.
Mystic Remora|U|Enchantment|5|Cumulative upkeep {1}. Whenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.
Brainstorm|U|Instant|1.5|Draw three cards, then put two cards from your hand on top of your library in any order.
Ponder|U|Sorcery|1.5|Look at the top three cards of your library, then put them back in any order. You may shuffle. Draw a card.
Preordain|U|Sorcery|0.5|Scry 2, then draw a card.
Opt|U|Instant|0.2|Scry 1. Draw a card.
Fact or Fiction|3U|Instant|0.3|Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.
Windfall|2U|Sorcery|1.5|Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.
Mystical Tutor|U|Instant|15|Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top.
Rapid Hybridization|U|Instant|0.8|Destroy target creature. It can't be regenerated. That creature's controller creates a 3/3 green Frog Lizard creature token.
Pongify|U|Instant|1.2|Destroy target creature. It can't be regenerated. Its controller creates a 3/3 green Ape creature token.
Reality Shift|1U|Instant|0.5|Exile target creature. Its controller manifests the top card of their library.
Propaganda|2U|Enchantment|3.5|Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.
Talrand, Sky Summoner|2UU|Legendary Creature — Merfolk Wizard|0.5|Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.||2/2
Archmage Emeritus|2UU|Creature — Human Wizard|2.5|Magecraft — Whenever you cast or copy an instant or sorcery spell, draw a card.||2/2
Murmuring Mystic|3U|Creature — Human Wizard|0.2|Whenever you cast an instant or sorcery spell, create a 1/1 blue Bird Illusion creature token with flying.||1/5
Ghostly Flicker|2U|Instant|0.5|Exile two target artifacts, creatures, and/or lands you control, then return those cards to the battlefield under your control.
Mulldrifter|4U|Creature — Elemental|0.3|Flying. When ~ enters, draw two cards. Evoke {2}{U}||2/2
Deepglow Skate|4U|Creature — Fish|6|When ~ enters, double the number of each kind of counter on any number of target permanents.||3/3
Thrummingbird|1U|Creature — Phyrexian Bird Horror|0.5|Flying. Whenever ~ deals combat damage to a player, proliferate.||1/1
Inexorable Tide|3UU|Enchantment|3|Whenever you cast a spell, proliferate.
Reconnaissance Mission|2UU|Enchantment|0.4|Whenever a creature you control deals combat damage to a player, you may draw a card. Cycling {2}
Bident of Thassa|2UU|Legendary Enchantment Artifact|1.5|Whenever a creature you control deals combat damage to a player, you may draw a card. {1}{U}, {T}: Creatures your opponents control attack this turn if able.
Kindred Discovery|3UU|Enchantment|10|As ~ enters, choose a creature type. Whenever a creature you control of the chosen type enters or attacks, draw a card.
Etherium Sculptor|1U|Artifact Creature — Vedalken Artificer|0.5|Artifact spells you cast cost {1} less to cast.||1/2
Thopter Spy Network|2UU|Enchantment|0.4|At the beginning of your upkeep, if you control an artifact, create a 1/1 colorless Thopter artifact creature token with flying. Whenever one or more artifact creatures you control deal combat damage to a player, draw a card.
Master of Etherium|2U|Artifact Creature — Vedalken Wizard|0.8|~'s power and toughness are each equal to the number of artifacts you control. Other artifact creatures you control get +1/+1.||*/*
Thoughtcast|4U|Sorcery|0.5|Affinity for artifacts. Draw two cards.
Padeem, Consul of Innovation|3U|Legendary Creature — Vedalken Artificer|1|Artifacts you control have hexproof. At the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest mana value, draw a card.||1/4
Sai, Master Thopterist|2U|Legendary Creature — Human Artificer|1.5|Whenever you cast an artifact spell, create a 1/1 colorless Thopter artifact creature token with flying. {1}{U}, Sacrifice two artifacts: Draw a card.||1/4
Emry, Lurker of the Loch|2U|Legendary Creature — Merfolk Wizard|4|This spell costs {1} less to cast for each artifact you control. When ~ enters, mill four cards. {T}: Choose target artifact card in your graveyard. You may cast that card this turn.||1/2
Merrow Reejerey|2U|Creature — Merfolk Soldier|1|Other Merfolk creatures you control get +1/+1. Whenever you cast a Merfolk spell, you may tap or untap target permanent.||2/2
Master of the Pearl Trident|UU|Creature — Merfolk|1.5|Other Merfolk creatures you control get +1/+1 and have islandwalk.||2/2
Deeproot Waters|2U|Enchantment|1|Whenever you cast a Merfolk spell, create a 1/1 blue Merfolk creature token with hexproof.
Rooftop Storm|5U|Enchantment|2.5|You may pay {0} rather than pay the mana cost for Zombie creature spells you cast.
Negate|1U|Instant|0.1|Counter target noncreature spell.|S
Essence Scatter|1U|Instant|0.1|Counter target creature spell.|S
Think Twice|1U|Instant|0.1|Draw a card. Flashback {2}{U}|S
Refute|1UU|Instant|0.1|Counter target spell. Draw a card, then discard a card.|S
Micromancer|3U|Creature — Human Wizard|0.2|When ~ enters, you may search your library for an instant or sorcery card with mana value 1, reveal it, put it into your hand, then shuffle.|S|3/3
Tolarian Terror|6U|Creature — Serpent|0.3|This spell costs {1} less to cast for each instant and sorcery card in your graveyard. Ward {2}|S|5/5
Spectral Sailor|U|Creature — Spirit Pirate|0.4|Flash. Flying. {3}{U}: Draw a card.|S|1/1
Bigfin Bouncer|3U|Creature — Shark Pirate|0.1|When ~ enters, return target creature an opponent controls to its owner's hand.|S|3/2
Aetherize|3U|Instant|0.5|Return all attacking creatures to their owner's hand.|S
Kiora, the Rising Tide|2U|Legendary Creature — Merfolk Noble|1.5|When ~ enters, draw two cards, then discard two cards. Threshold — Whenever ~ attacks, if there are seven or more cards in your graveyard, you may create Scion of the Deep, a legendary 8/8 blue Octopus creature token.|S|3/2
Demonic Tutor|1B|Sorcery|40|Search your library for a card, put that card into your hand, then shuffle.
Vampiric Tutor|B|Instant|45|Search your library for a card, then shuffle and put that card on top. You lose 2 life.
Diabolic Tutor|2BB|Sorcery|0.5|Search your library for a card, put that card into your hand, then shuffle.
Toxic Deluge|2B|Sorcery|10|As an additional cost to cast this spell, pay X life. All creatures get -X/-X until end of turn.
Damnation|2BB|Sorcery|15|Destroy all creatures. They can't be regenerated.
Feed the Swarm|1B|Sorcery|0.8|Destroy target creature or enchantment an opponent controls. You lose life equal to that permanent's mana value.
Go for the Throat|1B|Instant|1.2|Destroy target nonartifact creature.
Infernal Grasp|1B|Instant|2.5|Destroy target creature. You lose 2 life.
Night's Whisper|1B|Sorcery|0.6|You draw two cards and you lose 2 life.
Sign in Blood|BB|Sorcery|0.3|Target player draws two cards and loses 2 life.
Read the Bones|2B|Sorcery|0.2|Scry 2, then draw two cards. You lose 2 life.
Village Rites|B|Instant|0.5|As an additional cost to cast this spell, sacrifice a creature. Draw two cards.
Deadly Dispute|1B|Instant|0.8|As an additional cost to cast this spell, sacrifice an artifact or creature. Draw two cards and create a Treasure token.
Necropotence|BBB|Enchantment|15|Skip your draw step. Whenever you discard a card, exile that card from your graveyard. Pay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step.
Bolas's Citadel|3BBB|Legendary Artifact|9|You may look at the top card of your library any time. You may play lands and cast spells from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost. {T}, Sacrifice ten nonland permanents: Each opponent loses 10 life.
Blood Artist|1B|Creature — Vampire|1.5|Whenever ~ or another creature dies, target player loses 1 life and you gain 1 life.||0/1
Zulaport Cutthroat|1B|Creature — Human Rogue Ally|0.6|Whenever ~ or another creature you control dies, each opponent loses 1 life and you gain 1 life.||1/1
Bastion of Remembrance|2B|Enchantment|0.4|When ~ enters, create a 1/1 white Human Soldier creature token. Whenever a creature you control dies, each opponent loses 1 life and you gain 1 life.
Viscera Seer|B|Creature — Vampire Wizard|1|Sacrifice a creature: Scry 1.||1/1
Pitiless Plunderer|3B|Creature — Human Pirate|5|Whenever another creature you control dies, create a Treasure token.||1/4
Grave Pact|1BBB|Enchantment|10|Whenever a creature you control dies, each other player sacrifices a creature.
Dictate of Erebos|3BB|Enchantment|9|Flash. Whenever a creature you control dies, each opponent sacrifices a creature.
Fleshbag Marauder|2B|Creature — Zombie Warrior|0.3|When ~ enters, each player sacrifices a creature.||3/1
Plaguecrafter|2B|Creature — Human Shaman|0.4|When ~ enters, each player sacrifices a creature or planeswalker. Each player who can't discards a card.||3/2
Reanimate|B|Sorcery|12|Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.
Animate Dead|1B|Enchantment — Aura|5|Enchant creature card in a graveyard. When ~ enters, return enchanted creature card to the battlefield under your control. It gets -1/-0.
Victimize|2B|Sorcery|0.8|Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.
Entomb|B|Instant|14|Search your library for a card, put that card into your graveyard, then shuffle.
Buried Alive|2B|Sorcery|1.5|Search your library for up to three creature cards, put them into your graveyard, then shuffle.
Stitcher's Supplier|B|Creature — Zombie|0.4|When ~ enters or dies, mill three cards.||1/1
Syr Konrad, the Grim|3BB|Legendary Creature — Human Knight|0.5|Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard, ~ deals 1 damage to each opponent. {1}{B}: Each player mills a card.||5/4
Living Death|3BB|Sorcery|3|Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield.
Gray Merchant of Asphodel|3BB|Creature — Zombie|0.5|When ~ enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way.||2/4
Exquisite Blood|4B|Enchantment|18|Whenever an opponent loses life, you gain that much life.
Sanguine Bond|3BB|Enchantment|2.5|Whenever you gain life, target opponent loses that much life.
Vito, Thorn of the Dusk Rose|2B|Legendary Creature — Vampire Cleric|3.5|Whenever you gain life, target opponent loses that much life. {3}{B}{B}: Creatures you control gain lifelink until end of turn.||1/3
Marionette Master|4BB|Creature — Human Artificer|1|Fabricate 3. Whenever an artifact you control is put into a graveyard from the battlefield, target opponent loses life equal to ~'s power.||1/3
Doomwake Giant|4B|Enchantment Creature — Giant|0.5|Constellation — Whenever ~ or another enchantment you control enters, creatures your opponents control get -1/-1 until end of turn.||4/6
Grim Guardian|2B|Enchantment Creature — Zombie|0.3|Constellation — Whenever ~ or another enchantment you control enters, each opponent loses 1 life.||1/4
Lord of the Accursed|2B|Creature — Zombie|0.4|Other Zombies you control get +1/+1. {1}{B}, {T}: All Zombies gain menace until end of turn.||2/3
Diregraf Colossus|2B|Creature — Zombie Giant|2|~ enters with a +1/+1 counter on it for each Zombie card in your graveyard. Whenever you cast a Zombie spell, create a 2/2 black Zombie creature token tapped.||2/2
Undead Augur|BB|Creature — Zombie Wizard|0.6|Whenever ~ or another Zombie you control dies, you draw a card and you lose 1 life.||2/2
Gravecrawler|B|Creature — Zombie|3.5|~ can't block. You may cast ~ from your graveyard as long as you control a Zombie.||2/1
Cemetery Reaper|1BB|Creature — Zombie|1|Other Zombie creatures you control get +1/+1. {2}{B}, {T}: Exile target creature card from a graveyard. Create a 2/2 black Zombie creature token.||2/2
Captivating Vampire|1BB|Creature — Vampire|3|Other Vampire creatures you control get +1/+1. Tap five untapped Vampires you control: Gain control of target creature. It becomes a Vampire in addition to its other types.||2/2
Indulgent Aristocrat|B|Creature — Vampire|0.4|Lifelink. {2}, Sacrifice a creature: Put a +1/+1 counter on each Vampire you control.||1/1
Cordial Vampire|BB|Creature — Vampire|6|Whenever ~ or another creature dies, put a +1/+1 counter on each Vampire you control.||1/1
Vampire Nighthawk|1BB|Creature — Vampire Shaman|0.3|Flying, deathtouch, lifelink|S|2/3
Marauding Blight-Priest|2B|Creature — Vampire Cleric|0.3|Whenever you gain life, each opponent loses 1 life.|S|3/2
Bloodthirsty Conqueror|3BB|Creature — Vampire Knight|6|Flying, deathtouch. Whenever an opponent loses life, you gain that much life.|S|5/5
Infestation Sage|B|Creature — Elf Warlock|0.2|When ~ dies, create a 1/1 black and green Insect creature token with flying.|S|1/1
Duress|B|Sorcery|0.1|Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.|S
Zombify|3B|Sorcery|0.3|Return target creature card from your graveyard to the battlefield.|S
Macabre Waltz|1B|Sorcery|0.1|Return up to two target creature cards from your graveyard to your hand, then discard a card.|S
Phyrexian Arena|1BB|Enchantment|1.5|At the beginning of your upkeep, you draw a card and you lose 1 life.|S
Liliana, Dreadhorde General|4BB|Legendary Planeswalker — Liliana|9|Whenever a creature you control dies, draw a card. +1: Create a 2/2 black Zombie creature token. −4: Each player sacrifices two creatures. −9: Each opponent chooses a permanent they control of each permanent type and sacrifices the rest.|S
Hero's Downfall|1BB|Instant|0.4|Destroy target creature or planeswalker.|S
Bake into a Pie|2BB|Instant|0.1|Destroy target creature. Create a Food token.|S
Reassembling Skeleton|1B|Creature — Skeleton Warrior|0.3|{1}{B}: Return ~ from your graveyard to the battlefield tapped.|S|1/1
Lightning Bolt|R|Instant|1|~ deals 3 damage to any target.
Chaos Warp|2R|Instant|1|The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.
Blasphemous Act|8R|Sorcery|2.5|This spell costs {1} less to cast for each creature on the battlefield. ~ deals 13 damage to each creature.
Vandalblast|R|Sorcery|1|Destroy target artifact you don't control. Overload {4}{R}
Faithless Looting|R|Sorcery|0.5|Draw two cards, then discard two cards. Flashback {2}{R}
Big Score|3R|Instant|0.3|As an additional cost to cast this spell, discard a card. Draw two cards and create two Treasure tokens.
Unexpected Windfall|2RR|Instant|0.5|As an additional cost to cast this spell, discard a card. Draw two cards and create two Treasure tokens.
Jeska's Will|2R|Sorcery|20|Choose one. If you control a commander as you cast this spell, you may choose both. • Add {R} for each card in target opponent's hand. • Exile the top three cards of your library. You may play them this turn.
Deflecting Swat|2R|Instant|40|If you control a commander, you may cast this spell without paying its mana cost. You may choose new targets for target spell or ability.
Reforge the Soul|3RR|Sorcery|1.5|Each player discards their hand, then draws seven cards. Miracle {1}{R}
Young Pyromancer|1R|Creature — Human Shaman|0.5|Whenever you cast an instant or sorcery spell, create a 1/1 red Elemental creature token.||2/1
Storm-Kiln Artist|3R|Creature — Dwarf Shaman|1|~ gets +1/+0 for each artifact you control. Magecraft — Whenever you cast or copy an instant or sorcery spell, create a Treasure token.||2/2
Purphoros, God of the Forge|3R|Legendary Enchantment Creature — God|12|Indestructible. As long as your devotion to red is less than five, ~ isn't a creature. Whenever another creature you control enters, ~ deals 2 damage to each opponent. {2}{R}: Creatures you control get +1/+0 until end of turn.||6/5
Goblin Bombardment|1R|Enchantment|5|Sacrifice a creature: ~ deals 1 damage to any target.
Goblin Chieftain|1RR|Creature — Goblin|2|Haste. Other Goblin creatures you control get +1/+1 and have haste.||2/2
Hellrider|2RR|Creature — Devil|1|Haste. Whenever a creature you control attacks, ~ deals 1 damage to the player or planeswalker it's attacking.||3/3
Shared Animosity|2R|Enchantment|6|Whenever a creature you control attacks, it gets +1/+0 until end of turn for each other attacking creature that shares a creature type with it.
Aggravated Assault|2R|Enchantment|10|{3}{R}{R}: Untap all creatures you control. After this main phase, there is an additional combat phase followed by an additional main phase. Activate only as a sorcery.
Relentless Assault|2RR|Sorcery|0.5|Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase.
Fervor|2R|Enchantment|1|Creatures you control have haste.
Valakut Exploration|2R|Enchantment|1|Landfall — Whenever a land you control enters, exile the top card of your library. You may play that card for as long as it remains exiled. At the beginning of your end step, if there are cards exiled with ~, put them into their owner's graveyard, then ~ deals that much damage to each opponent.
Dragon Tempest|1R|Enchantment|3.5|Whenever a creature with flying you control enters, it gains haste until end of turn. Whenever a Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control.
Dragonlord's Servant|1R|Creature — Goblin Shaman|0.5|Dragon spells you cast cost {1} less to cast.||1/3
Dragonspeaker Shaman|1RR|Creature — Human Barbarian Shaman|2|Dragon spells you cast cost {2} less to cast.||2/2
Scourge of Valkas|2RRR|Creature — Dragon|1.5|Flying. Whenever ~ or another Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control. {R}: ~ gets +1/+0 until end of turn.||4/4
Utvara Hellkite|6RR|Creature — Dragon|8|Flying. Whenever a Dragon you control attacks, create a 6/6 red Dragon creature token with flying.||6/6
Thunderbreak Regent|2RR|Creature — Dragon|1|Flying. Whenever a Dragon you control becomes the target of a spell or ability an opponent controls, ~ deals 3 damage to that player.||4/4
Lathliss, Dragon Queen|4RR|Legendary Creature — Dragon|1|Flying. Whenever another nontoken Dragon you control enters, create a 5/5 red Dragon creature token with flying. {1}{R}: Dragons you control get +1/+0 until end of turn.||6/6
Terror of the Peaks|3RR|Creature — Dragon|25|Flying. Spells your opponents cast that target ~ cost an additional 3 life to cast. Whenever another creature you control enters, ~ deals damage equal to that creature's power to any target.||5/4
Goldspan Dragon|3RR|Creature — Dragon|10|Flying, haste. Whenever ~ attacks or becomes the target of a spell, create a Treasure token. Treasures you control have "{T}, Sacrifice this artifact: Add two mana of any one color."||4/4
Marauding Raptor|1R|Creature — Dinosaur|0.5|Creature spells you cast cost {1} less to cast. Whenever another creature you control enters, ~ deals 2 damage to it. If a Dinosaur is dealt damage this way, ~ gets +2/+0 until end of turn.||2/3
Otepec Huntmaster|1R|Creature — Human Shaman|0.3|Dinosaur spells you cast cost {1} less to cast. {T}: Target Dinosaur gains haste until end of turn.||1/2
Etali, Primal Storm|4RR|Legendary Creature — Elder Dinosaur|1|Whenever ~ attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs.||6/6
Burst Lightning|R|Instant|0.4|Kicker {4}. ~ deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.|S
Krenko, Mob Boss|2RR|Legendary Creature — Goblin Warrior|3|{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.|S|3/3
Impact Tremors|1R|Enchantment|2|Whenever a creature you control enters, ~ deals 1 damage to each opponent.|S
Searslicer Goblin|1R|Creature — Goblin Warrior|0.5|Raid — At the beginning of your end step, if you attacked this turn, create a 1/1 red Goblin creature token.|S|2/1
Goblin Surprise|2R|Instant|0.2|Choose one — Creatures you control get +2/+0 until end of turn; or create two 1/1 red Goblin creature tokens.|S
Fanatical Firebrand|R|Creature — Goblin Pirate|0.1|Haste. {T}, Sacrifice ~: It deals 1 damage to any target.|S|1/1
Shivan Dragon|4RR|Creature — Dragon|0.2|Flying. {R}: ~ gets +1/+0 until end of turn.|S|5/5
Abrade|1R|Instant|0.3|Choose one — ~ deals 3 damage to target creature; or destroy target artifact.|S
Slagstorm|1RR|Sorcery|1|Choose one — ~ deals 3 damage to each creature; or ~ deals 3 damage to each player.|S
Guttersnipe|2R|Creature — Goblin Shaman|0.3|Whenever you cast an instant or sorcery spell, ~ deals 2 damage to each opponent.|S|2/2
Thrill of Possibility|1R|Instant|0.1|As an additional cost to cast this spell, discard a card. Draw two cards.|S
Cultivate|2G|Sorcery|0.5|Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.
Kodama's Reach|2G|Sorcery — Arcane|0.8|Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.
Rampant Growth|1G|Sorcery|0.3|Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.
Farseek|1G|Sorcery|1.5|Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.
Nature's Lore|1G|Sorcery|2|Search your library for a Forest card, put that card onto the battlefield, then shuffle.
Three Visits|1G|Sorcery|4|Search your library for a Forest card, put that card onto the battlefield, then shuffle.
Harrow|2G|Instant|0.4|As an additional cost to cast this spell, sacrifice a land. Search your library for up to two basic land cards, put them onto the battlefield, then shuffle.
Sakura-Tribe Elder|1G|Creature — Snake Shaman|0.5|Sacrifice ~: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.||1/1
Birds of Paradise|G|Creature — Bird|7|Flying. {T}: Add one mana of any color.||0/1
Elvish Mystic|G|Creature — Elf Druid|0.5|{T}: Add {G}.||1/1
Priest of Titania|1G|Creature — Elf Druid|4|{T}: Add {G} for each Elf on the battlefield.||1/1
Elvish Visionary|1G|Creature — Elf Shaman|0.3|When ~ enters, draw a card.||1/1
Lys Alana Huntmaster|2GG|Creature — Elf Warrior|0.4|Whenever you cast an Elf spell, you may create a 1/1 green Elf Warrior creature token.||3/3
Elvish Warmaster|1G|Creature — Elf Warrior|2|Whenever one or more other Elves you control enter, create a 1/1 green Elf Warrior creature token. This ability triggers only once each turn. {5}{G}{G}: Elves you control get +2/+2 and gain deathtouch until end of turn.||2/2
Wellwisher|1G|Creature — Elf|0.8|{T}: You gain 1 life for each Elf on the battlefield.||1/1
Oracle of Mul Daya|3G|Creature — Elf Shaman|6|You may play an additional land on each of your turns. Play with the top card of your library revealed. You may play lands from the top of your library.||2/2
Rampaging Baloths|4GG|Creature — Beast|1.5|Trample. Landfall — Whenever a land you control enters, you may create a 4/4 green Beast creature token.||6/6
Avenger of Zendikar|5GG|Creature — Elemental|4|When ~ enters, create a 0/1 green Plant creature token for each land you control. Landfall — Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control.||5/5
Scute Swarm|2G|Creature — Insect|2.5|Landfall — Whenever a land you control enters, create a 1/1 green Insect creature token. If you control six or more lands, create a token that's a copy of ~ instead.||1/1
Tireless Provisioner|2G|Creature — Elf Scout|1.5|Landfall — Whenever a land you control enters, create a Food token or a Treasure token.||3/2
Evolution Sage|2G|Creature — Elf Druid|0.5|Landfall — Whenever a land you control enters, proliferate.||3/2
Ramunap Excavator|2G|Creature — Snake Cleric|2|You may play lands from your graveyard.||2/3
Eternal Witness|1GG|Creature — Human Shaman|1.5|When ~ enters, you may return target card from your graveyard to your hand.||2/1
Beast Within|2G|Instant|1.5|Destroy target permanent. Its controller creates a 3/3 green Beast creature token.
Heroic Intervention|1G|Instant|9|Permanents you control gain hexproof and indestructible until end of turn.
Harmonize|2GG|Sorcery|0.2|Draw three cards.
Rishkar's Expertise|4GG|Sorcery|1|Draw cards equal to the greatest power among creatures you control. You may cast a spell with mana value 5 or less from your hand without paying its mana cost.
Return of the Wildspeaker|4G|Instant|1.5|Choose one — Draw cards equal to the greatest power among non-Human creatures you control; or non-Human creatures you control get +3/+3 until end of turn.
Beast Whisperer|2GG|Creature — Elf Druid|2.5|Whenever you cast a creature spell, draw a card.||2/3
Guardian Project|3G|Enchantment|4|Whenever a nontoken creature you control enters, if it doesn't have the same name as another creature you control or a creature card in your graveyard, draw a card.
The Great Henge|7GG|Legendary Artifact|45|This spell costs {X} less to cast, where X is the greatest power among creatures you control. {T}: Add {G}{G}. You gain 2 life. Whenever a nontoken creature you control enters, put a +1/+1 counter on it and draw a card.
Sylvan Library|1G|Enchantment|30|At the beginning of your draw step, you may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of those cards, pay 4 life or put the card on top of your library.
Worldly Tutor|G|Instant|10|Search your library for a creature card, reveal it, then shuffle and put that card on top.
Craterhoof Behemoth|5GGG|Creature — Beast|30|Haste. When ~ enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.||5/5
Overwhelming Stampede|3GG|Sorcery|2.5|Until end of turn, creatures you control gain trample and get +X/+X, where X is the greatest power among creatures you control.
Parallel Lives|3G|Enchantment|35|If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.
Second Harvest|2GG|Instant|3|For each token you control, create a token that's a copy of that permanent.
Beastmaster Ascension|2G|Enchantment|4|Whenever a creature you control attacks, you may put a quest counter on ~. As long as ~ has seven or more quest counters on it, creatures you control get +5/+5.
Hardened Scales|G|Enchantment|3.5|If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.
Branching Evolution|2G|Enchantment|6|If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on that creature instead.
Forgotten Ancient|3G|Creature — Elemental|1.5|Whenever a player casts a spell, you may put a +1/+1 counter on ~. At the beginning of your upkeep, you may move any number of +1/+1 counters from ~ onto other creatures.||0/3
Inspiring Call|2G|Instant|0.8|Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain indestructible until end of turn.
Armorcraft Judge|3G|Creature — Elf Artificer|0.2|When ~ enters, draw a card for each creature you control with a +1/+1 counter on it.||3/3
Rishkar, Peema Renegade|2G|Legendary Creature — Elf Druid|0.5|When ~ enters, put a +1/+1 counter on each of up to two target creatures. Each creature you control with a counter on it has "{T}: Add {G}."||2/2
Enchantress's Presence|2G|Enchantment|3.5|Whenever you cast an enchantment spell, draw a card.
Setessan Champion|2G|Creature — Human Warrior|1|Constellation — Whenever an enchantment you control enters, put a +1/+1 counter on ~ and draw a card.||1/3
Eidolon of Blossoms|2GG|Enchantment Creature — Spirit|0.5|Constellation — Whenever ~ or another enchantment you control enters, draw a card.||2/2
Wild Growth|G|Enchantment — Aura|0.6|Enchant land. Whenever enchanted land is tapped for mana, its controller adds an additional {G}.
Rancor|G|Enchantment — Aura|1.5|Enchant creature. Enchanted creature gets +2/+0 and has trample. When ~ is put into a graveyard from the battlefield, return ~ to its owner's hand.
Ripjaw Raptor|2GG|Creature — Dinosaur|1|Enrage — Whenever ~ is dealt damage, draw a card.||4/5
Topiary Stomper|1GG|Creature — Plant Dinosaur|0.8|Vigilance. When ~ enters, search your library for a basic land card, put it onto the battlefield tapped, then shuffle. ~ can't attack or block unless you control seven or more lands.||4/4
Wayward Swordtooth|2G|Creature — Dinosaur|2.5|Ascend. You may play an additional land on each of your turns. ~ can't attack or block unless you have the city's blessing.||5/5
Old Gnawbone|5GG|Legendary Creature — Dragon|25|Flying. Whenever a creature you control deals combat damage to a player, create that many Treasure tokens.||7/7
Llanowar Elves|G|Creature — Elf Druid|0.3|{T}: Add {G}.|S|1/1
Elvish Archdruid|1GG|Creature — Elf Druid|1|Other Elf creatures you control get +1/+1. {T}: Add {G} for each Elf you control.|S|2/2
Dwynen's Elite|1G|Creature — Elf Warrior|0.3|When ~ enters, if you control another Elf, create a 1/1 green Elf Warrior creature token.|S|2/2
Dwynen, Gilt-Leaf Daen|2GG|Legendary Creature — Elf Warrior|0.5|Reach. Other Elf creatures you control get +1/+1. Whenever ~ attacks, you gain 1 life for each attacking Elf you control.|S|3/4
Imperious Perfect|2G|Creature — Elf Warrior|0.8|Other Elf creatures you control get +1/+1. {G}, {T}: Create a 1/1 green Elf Warrior creature token.|S|2/2
Reclamation Sage|2G|Creature — Elf Shaman|0.3|When ~ enters, you may destroy target artifact or enchantment.|S|2/1
Scavenging Ooze|1G|Creature — Ooze|0.4|{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on ~ and you gain 1 life.|S|2/2
Garruk's Uprising|2G|Enchantment|0.6|When ~ enters, if you control a creature with power 4 or greater, draw a card. Creatures you control have trample. Whenever a creature you control with power 4 or greater enters, draw a card.|S
Overrun|2GGG|Sorcery|0.3|Creatures you control get +3/+3 and gain trample until end of turn.|S
Giant Growth|G|Instant|0.1|Target creature gets +3/+3 until end of turn.|S
Snakeskin Veil|G|Instant|0.3|Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn.|S
Doubling Season|4G|Enchantment|38|If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead. If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.|S
Mossborn Hydra|2G|Creature — Elemental Hydra|2|Trample. ~ enters with a +1/+1 counter on it. Landfall — Whenever a land you control enters, double the number of +1/+1 counters on ~.|S|0/0
Ghalta, Primal Hunger|10GG|Legendary Creature — Elder Dinosaur|2|This spell costs {X} less to cast, where X is the total power of creatures you control. Trample|S|12/12
Bushwhack|G|Sorcery|0.5|Choose one — Search your library for a basic land card, reveal it, put it into your hand, then shuffle; or target creature you control fights target creature you don't control.|S
Anguished Unmaking|1WB|Instant|2|Exile target nonland permanent. You lose 3 life.
Assassin's Trophy|BG|Instant|3.5|Destroy target permanent an opponent controls. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.
Putrefy|1BG|Instant|0.3|Destroy target artifact or creature. It can't be regenerated.
Mortify|1WB|Instant|0.3|Destroy target creature or enchantment.
Terminate|BR|Instant|0.6|Destroy target creature. It can't be regenerated.
Bedevil|BBR|Instant|0.8|Destroy target artifact, creature, or planeswalker.
Growth Spiral|GU|Instant|0.4|Draw a card. You may put a land card from your hand onto the battlefield.
Aura Shards|1GW|Enchantment|9|Whenever a creature you control enters, you may destroy target artifact or enchantment.
Mirari's Wake|3GW|Enchantment|5|Creatures you control get +1/+1. Whenever you tap a land for mana, add one additional mana of any type that land produced.
Rhythm of the Wild|1RG|Enchantment|3.5|Creature spells you cast can't be countered. Nontoken creatures you control have riot.
Dovin's Veto|WU|Instant|1|This spell can't be countered. Counter target noncreature spell.
Supreme Verdict|1WWU|Sorcery|2.5|This spell can't be countered. Destroy all creatures.
Sphinx's Revelation|XWUU|Instant|1|You gain X life and draw X cards.
Baleful Strix|UB|Artifact Creature — Bird|1|Flying, deathtouch. When ~ enters, draw a card.||1/1
Winding Constrictor|BG|Creature — Snake|0.8|If one or more counters would be put on an artifact or creature you control, that many plus one of each of those kinds of counters are put on that permanent instead.||2/3
Corpsejack Menace|2BG|Creature — Fungus|0.5|If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on it instead.||4/4
Shaman of the Pack|1BG|Creature — Elf Shaman|0.4|When ~ enters, target opponent loses life equal to the number of Elves you control.||3/2
Boros Charm|RW|Instant|1.5|Choose one — ~ deals 4 damage to target player or planeswalker; or permanents you control gain indestructible until end of turn; or target creature gains double strike until end of turn.
Lightning Helix|RW|Instant|1|~ deals 3 damage to any target and you gain 3 life.
Assemble the Legion|3RW|Enchantment|1|At the beginning of your upkeep, put a muster counter on ~. Then create a 1/1 red and white Soldier creature token with haste for each muster counter on ~.
Mayhem Devil|1BR|Creature — Devil|0.6|Whenever a player sacrifices a permanent, ~ deals 1 damage to any target.||3/3
Judith, the Scourge Diva|1BR|Legendary Creature — Human Shaman|1|Other creatures you control get +1/+0. Whenever a nontoken creature you control dies, ~ deals 1 damage to any target.||2/2
Stromkirk Captain|1BR|Creature — Vampire Soldier|0.5|First strike. Other Vampire creatures you control get +1/+1 and have first strike.||2/2
Legion Lieutenant|WB|Creature — Vampire Knight|0.5|Other Vampires you control get +1/+1.||2/2
Coiling Oracle|GU|Creature — Snake Elf Druid|0.3|When ~ enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand.||1/1
Merfolk Mistbinder|GU|Creature — Merfolk Shaman|0.5|Other Merfolk you control get +1/+1.||2/2
Goblin Electromancer|UR|Creature — Goblin Wizard|0.3|Instant and sorcery spells you cast cost {1} less to cast.||2/2
Satyr Enchanter|1GW|Creature — Satyr Druid|0.4|Whenever you cast an enchantment spell, draw a card.||2/2
Regisaur Alpha|3RG|Creature — Dinosaur|0.5|Other Dinosaurs you control have haste. When ~ enters, create a 3/3 green Dinosaur creature token with trample.||4/4
Gishath, Sun's Avatar|5RGW|Legendary Creature — Dinosaur Avatar|12|Vigilance, trample, haste. Whenever ~ deals combat damage to a player, reveal that many cards from the top of your library. Put any number of Dinosaur creature cards from among them onto the battlefield and the rest on the bottom of your library in a random order.||7/6
Savage Ventmaw|4RG|Creature — Dragon|0.5|Flying. Whenever ~ attacks, add {R}{R}{R}{G}{G}{G}. Until end of turn, you don't lose this mana as steps and phases end.|S|4/4
Heroic Reinforcements|2RW|Sorcery|0.3|Create two 1/1 white Soldier creature tokens. Until end of turn, creatures you control get +1/+1 and gain haste.|S
Maelstrom Pulse|1BG|Sorcery|1|Destroy target nonland permanent and all other permanents with the same name as that permanent.|S
Tatyova, Benthic Druid|3GU|Legendary Creature — Merfolk Druid|0.3|Landfall — Whenever a land you control enters, you gain 1 life and draw a card.|S|3/3
Empyrean Eagle|1WU|Creature — Bird Spirit|0.2|Flying. Other creatures you control with flying get +1/+1.|S|2/3
Good-Fortune Unicorn|1GW|Creature — Unicorn|0.2|Whenever another creature you control enters, put a +1/+1 counter on that creature.|S|2/2
Atraxa, Praetors' Voice|GWUB|Legendary Creature — Phyrexian Angel Horror|12|Flying, vigilance, deathtouch, lifelink. At the beginning of your end step, proliferate.||4/4
The Ur-Dragon|4WUBRG|Legendary Creature — Dragon Avatar|30|Eminence — As long as ~ is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast. Flying. Whenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.||10/10
Edgar Markov|3RWB|Legendary Creature — Vampire Knight|45|Eminence — Whenever you cast another Vampire spell, if ~ is in the command zone or on the battlefield, create a 1/1 black Vampire creature token. First strike, haste. Whenever ~ attacks, put a +1/+1 counter on each Vampire you control.||4/4
Lathril, Blade of the Elves|2BG|Legendary Creature — Elf Noble|0.5|Menace. Whenever ~ deals combat damage to a player, create that many 1/1 green Elf Warrior creature tokens. {T}, Tap ten untapped Elves you control: Each opponent loses 10 life and you gain 10 life.||2/3
Wilhelt, the Rotcleaver|2UB|Legendary Creature — Zombie Warrior|1|Whenever another Zombie you control dies, if it didn't have decayed, create a 2/2 black Zombie creature token with decayed. At the beginning of your end step, you may sacrifice a Zombie. If you do, draw a card.||3/3
Isperia, Supreme Judge|2WWUU|Legendary Creature — Sphinx|0.5|Flying. Whenever a creature attacks you or a planeswalker you control, you may draw a card.||6/4
Gisa and Geralf|2UB|Legendary Creature — Human Wizard|0.5|When ~ enters, mill four cards. During each of your turns, you may cast a Zombie creature spell from your graveyard.||4/4
Emmara, Soul of the Accord|GW|Legendary Creature — Elf Cleric|0.3|Whenever ~ becomes tapped, create a 1/1 white Soldier creature token with lifelink.||2/2
Kardur, Doomscourge|2BR|Legendary Creature — Demon Berserker|0.5|When ~ enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able. Whenever an attacking creature dies, each opponent loses 1 life and you gain 1 life.||4/3
Atarka, World Render|5RG|Legendary Creature — Dragon|1.5|Flying, trample. Whenever a Dragon you control attacks, it gains double strike until end of turn.||6/4
Pantlaza, Sun-Favored|2RGW|Legendary Creature — Dinosaur|1|Whenever ~ or another Dinosaur you control enters, you may discover X, where X is that creature's toughness. Do this only once each turn.||4/4
Hakbal of the Surging Soul|2GU|Legendary Creature — Merfolk Scout|0.5|At the beginning of combat on your turn, each Merfolk creature you control explores. Whenever ~ attacks, you may put a land card from your hand onto the battlefield. If you don't, draw a card.||3/3
Bello, Bard of the Brambles|1RG|Legendary Creature — Raccoon Bard|6|During your turn, each non-Equipment artifact and non-Aura enchantment you control with mana value 4 or greater is a 4/4 Elemental creature in addition to its other types and has indestructible, haste, and "Whenever this creature deals combat damage to a player, draw a card."||3/3
Neyali, Suns' Vanguard|2RW|Legendary Creature — Human Rebel|0.5|Attacking tokens you control have double strike. Whenever one or more tokens you control attack a player, exile the top card of your library. During any turn you attacked with a token, you may play that card.||3/3
Urza, Chief Artificer|3WUB|Legendary Creature — Human Artificer|1|Affinity for artifact creatures. Artifact creatures you control have menace. At the beginning of your end step, create a 0/0 colorless Construct artifact creature token with "This creature gets +1/+1 for each artifact you control."||4/5
Anikthea, Hand of Erebos|2WBG|Legendary Enchantment Creature — Demigod|1|Menace. Other non-Aura enchantment creatures you control have menace. Whenever ~ enters or attacks, exile up to one target non-Aura enchantment card from your graveyard. Create a token that's a copy of that card, except it's a 3/3 black Zombie creature in addition to its other types.||4/4
`;

const PRECONS = [
  {name:"Token Triumph", set:"Starter Commander Decks", year:2022, cmd:"Emmara, Soul of the Accord", note:"Fill the board with small creatures, then make them all bigger.", aims:["tokens","lifegain","counters"], level:"Made for first-time players"},
  {name:"First Flight", set:"Starter Commander Decks", year:2022, cmd:"Isperia, Supreme Judge", note:"Fliers and card draw that punish players for attacking you.", aims:["control","draw","blink"], level:"Made for first-time players"},
  {name:"Grave Danger", set:"Starter Commander Decks", year:2022, cmd:"Gisa and Geralf", note:"Zombies that keep coming back from the graveyard.", aims:["tribal","graveyard","sacrifice"], tribe:"Zombie", level:"Made for first-time players"},
  {name:"Chaos Incarnate", set:"Starter Commander Decks", year:2022, cmd:"Kardur, Doomscourge", note:"Force your opponents to fight each other and profit when creatures die.", aims:["sacrifice","aggro","burn"], level:"Made for first-time players"},
  {name:"Draconic Destruction", set:"Starter Commander Decks", year:2022, cmd:"Atarka, World Render", note:"Ramp into huge Dragons that hit twice.", aims:["tribal","aggro","lands"], tribe:"Dragon", level:"Made for first-time players"},
  {name:"Elven Empire", set:"Kaldheim Commander", year:2021, cmd:"Lathril, Blade of the Elves", note:"Elf tokens that snowball into a drain for ten.", aims:["tribal","tokens","lifegain"], tribe:"Elf", level:"Easy to pilot"},
  {name:"Undead Unleashed", set:"Midnight Hunt Commander", year:2021, cmd:"Wilhelt, the Rotcleaver", note:"Sacrifice Zombies for cards and replace them for free.", aims:["tribal","sacrifice","graveyard"], tribe:"Zombie", level:"Easy to pilot"},
  {name:"Rebellion Rising", set:"Phyrexia: All Will Be One Commander", year:2023, cmd:"Neyali, Suns' Vanguard", note:"Attack with tokens that strike twice.", aims:["tokens","aggro","voltron"], level:"Easy to pilot"},
  {name:"Explorers of the Deep", set:"Lost Caverns of Ixalan Commander", year:2023, cmd:"Hakbal of the Surging Soul", note:"Merfolk that grow every combat while you ramp.", aims:["tribal","counters","lands"], tribe:"Merfolk", level:"Easy to pilot"},
  {name:"Veloci-Ramp-Tor", set:"Lost Caverns of Ixalan Commander", year:2023, cmd:"Pantlaza, Sun-Favored", note:"Big Dinosaurs that cast free spells when they arrive.", aims:["tribal","lands","blink"], tribe:"Dinosaur", level:"Some decisions"},
  {name:"Animated Army", set:"Bloomburrow Commander", year:2024, cmd:"Bello, Bard of the Brambles", note:"Your big artifacts and enchantments come alive on your turn.", aims:["enchantments","artifacts","aggro"], level:"Some decisions"},
  {name:"Breed Lethality", set:"Commander 2016", year:2016, cmd:"Atraxa, Praetors' Voice", note:"Stack +1/+1 counters and proliferate them every turn.", aims:["counters","lifegain","blink"], level:"Some decisions"},
  {name:"Urza's Iron Alliance", set:"Brothers' War Commander", year:2022, cmd:"Urza, Chief Artificer", note:"An army of artifact creatures led by a growing Construct.", aims:["artifacts","tokens","draw"], level:"Some decisions"},
  {name:"Enduring Enchantments", set:"Commander Masters", year:2023, cmd:"Anikthea, Hand of Erebos", note:"Enchantments that return from the graveyard as Zombies.", aims:["enchantments","graveyard","tokens"], level:"More complex"},
  {name:"Vampiric Bloodlust", set:"Commander 2017", year:2017, cmd:"Edgar Markov", note:"Every Vampire you cast brings a friend.", aims:["tribal","tokens","aggro"], tribe:"Vampire", level:"Easy to pilot"},
  {name:"Draconic Domination", set:"Commander 2017", year:2017, cmd:"The Ur-Dragon", note:"Five-color Dragons at a discount.", aims:["tribal","aggro","lands"], tribe:"Dragon", level:"More complex"}
];

const STD_STARTERS = [
  {name:"Angels and Lifegain", colors:["W"], aims:["lifegain","counters","tribal"], tribe:"Angel", note:"Gain life every turn and grow your creatures for it."},
  {name:"Goblin Swarm", colors:["R"], aims:["tokens","aggro","burn"], tribe:"Goblin", note:"Flood the board with Goblins and burn out the last points."},
  {name:"Elf Company", colors:["G"], aims:["tribal","tokens","counters"], tribe:"Elf", note:"Mana Elves into lords that pump the whole team."},
  {name:"Drain and Gain", colors:["W","B"], aims:["lifegain","sacrifice","control"], note:"Every point of life you gain hurts your opponent."},
  {name:"Spell Tempo", colors:["U","R"], aims:["spells","control","burn"], note:"Cheap instants, counterspells and creatures that reward both."},
  {name:"Graveyard Value", colors:["B","G"], aims:["graveyard","counters","control"], note:"Trade cards freely and bring the best ones back."}
];

