// "Ask the Judge" — a searchable plain-language rules reference for Commander.
// Each entry: { id, topic, question, answer, keywords }. Keep answers short and practical;
// this is a table aid, not a replacement for the Comprehensive Rules.

export const JUDGE_TOPICS = ['Turn & Priority', 'Casting', 'Combat', 'Commander', 'Counters & Status', 'Keywords', 'Zones & Cards'];

export const JUDGE_ENTRIES = [
  // ── Turn & Priority ────────────────────────────────────────────────────────────────────
  {
    id: 'turn-order', topic: 'Turn & Priority', question: 'What are the steps of a turn?',
    answer: 'Beginning phase: Untap, Upkeep, Draw. First main phase. Combat: Beginning of Combat, Declare Attackers, Declare Blockers, Combat Damage, End of Combat. Second main phase. Ending phase: End Step, then Cleanup (discard down to 7, damage wears off, "until end of turn" effects end).',
    keywords: 'phases steps untap upkeep draw main combat end cleanup'
  },
  {
    id: 'priority', topic: 'Turn & Priority', question: 'How does priority work?',
    answer: 'The active player gets priority first in each step. A player with priority may cast a spell, activate an ability, or pass. After someone acts, they get priority again. When every player passes in a row, the top object on the stack resolves — or, if the stack is empty, the game moves to the next step.',
    keywords: 'pass respond response window'
  },
  {
    id: 'stack', topic: 'Turn & Priority', question: 'How does the stack resolve?',
    answer: 'Spells and abilities go on the stack and resolve one at a time, last in, first out. After each one resolves, players get priority again before the next one resolves, so you can respond at each point.',
    keywords: 'lifo last in first out resolve order'
  },
  {
    id: 'mana-abilities', topic: 'Turn & Priority', question: 'Can someone respond to me tapping a land for mana?',
    answer: 'No. Mana abilities do not use the stack and cannot be responded to. That includes tapping lands, most mana rocks and mana creatures.',
    keywords: 'mana ability land tap respond'
  },
  {
    id: 'mana-empties', topic: 'Turn & Priority', question: 'When does unspent mana disappear?',
    answer: 'Your mana pool empties at the end of every step and phase. Mana you do not spend is lost — it does not carry into the next step.',
    keywords: 'floating mana pool empties burn'
  },
  {
    id: 'simultaneous-triggers', topic: 'Turn & Priority', question: 'Several abilities triggered at once. What order do they go on the stack?',
    answer: 'Active player first: they put all of their triggers on the stack in any order they choose. Then each other player in turn order does the same. Because the stack resolves last in first out, the last player\'s triggers resolve first.',
    keywords: 'apnap trigger order simultaneous'
  },
  {
    id: 'land-drop', topic: 'Turn & Priority', question: 'How many lands can I play?',
    answer: 'One land per turn, only during your own main phase while the stack is empty, unless an effect gives you additional land plays. Putting a land onto the battlefield with a spell or ability (for example Cultivate) does not use your land play.',
    keywords: 'land per turn play drop'
  },
  {
    id: 'hand-size', topic: 'Turn & Priority', question: 'What is the maximum hand size?',
    answer: 'Seven, checked only during your own cleanup step. You can hold more than seven during the rest of the turn; at cleanup you discard down to seven.',
    keywords: 'discard seven cleanup'
  },
  {
    id: 'draw-empty', topic: 'Turn & Priority', question: 'What happens if I have to draw from an empty library?',
    answer: 'You lose the game the next time state-based actions are checked. Having zero cards in your library is fine — only being required to draw from it loses.',
    keywords: 'deck out mill library empty lose'
  },

  // ── Combat ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'summoning-sickness', topic: 'Combat', question: 'What is summoning sickness?',
    answer: 'A creature cannot attack, or use abilities with the tap or untap symbol in their cost, unless you have controlled it continuously since the start of your most recent turn. Haste ignores this. It can still block and use abilities that do not tap it.',
    keywords: 'haste attack tap new creature'
  },
  {
    id: 'attack-multiplayer', topic: 'Combat', question: 'Can I attack more than one player?',
    answer: 'Yes. Each attacking creature chooses its own target: any opponent, or a planeswalker or battle an opponent controls. Only the players being attacked can block, and only against creatures attacking them.',
    keywords: 'multiplayer attack different players'
  },
  {
    id: 'blocking', topic: 'Combat', question: 'How does blocking work?',
    answer: 'Each untapped creature the defending player controls can block one attacker. Several creatures can block the same attacker. A blocked creature stays blocked even if the blocker leaves combat, and deals no damage to the player unless it has trample.',
    keywords: 'block multiple blockers'
  },
  {
    id: 'first-strike', topic: 'Combat', question: 'How do first strike and double strike work?',
    answer: 'If any creature in combat has first strike or double strike, there are two damage steps. First-strike and double-strike creatures deal damage in the first; creatures killed there deal no damage back. Regular creatures and double-strike creatures deal damage in the second.',
    keywords: 'first strike double strike damage step'
  },
  {
    id: 'trample', topic: 'Combat', question: 'How does trample work?',
    answer: 'An attacker with trample only has to assign lethal damage to each blocker; the rest can go to the player or planeswalker it is attacking. With deathtouch, 1 damage counts as lethal.',
    keywords: 'trample excess damage deathtouch'
  },
  {
    id: 'deathtouch', topic: 'Combat', question: 'What does deathtouch do?',
    answer: 'Any amount of damage a deathtouch source deals to a creature is enough to destroy it. Indestructible creatures still survive.',
    keywords: 'deathtouch lethal'
  },
  {
    id: 'lifelink', topic: 'Combat', question: 'When do I gain life from lifelink?',
    answer: 'At the same moment the damage is dealt, and for any damage that source deals — combat or not. It is not a trigger and cannot be responded to.',
    keywords: 'lifelink gain life'
  },
  {
    id: 'vigilance', topic: 'Combat', question: 'What does vigilance do?',
    answer: 'Attacking does not cause the creature to tap, so it is still untapped to block on other players\' turns.',
    keywords: 'vigilance untap attack'
  },
  {
    id: 'menace-flying', topic: 'Combat', question: 'Who can block flying or menace creatures?',
    answer: 'Flying can only be blocked by creatures with flying or reach. Menace needs two or more blockers. A creature can have both.',
    keywords: 'flying reach menace evasion'
  },
  {
    id: 'combat-damage-removed', topic: 'Combat', question: 'The blocker was removed before damage. Does my attacker hit the player?',
    answer: 'No. Once blocked, an attacker remains blocked. Without trample it deals no combat damage if nothing is left blocking it.',
    keywords: 'blocker removed bounce killed blocked'
  },

  // ── Commander ──────────────────────────────────────────────────────────────────────────
  {
    id: 'commander-tax', topic: 'Commander', question: 'What is commander tax?',
    answer: 'Each time you cast your commander from the command zone, it costs {2} more for each previous time you cast it from there this game. The tax only counts casts from the command zone, and each of two partner commanders tracks its own tax.',
    keywords: 'tax two more recast'
  },
  {
    id: 'commander-damage', topic: 'Commander', question: 'How does commander damage work?',
    answer: 'A player who has been dealt 21 or more combat damage by the same commander over the course of the game loses. It is tracked per commander, it must be combat damage, and it still counts if the commander changed controllers. Gaining life does not reduce it.',
    keywords: '21 combat damage lose voltron'
  },
  {
    id: 'command-zone-return', topic: 'Commander', question: 'When can my commander go back to the command zone?',
    answer: 'If it would go to your hand or library, you may put it in the command zone instead. If it goes to the graveyard or exile, it gets there first and then you may move it to the command zone — so "dies" triggers still happen.',
    keywords: 'dies exile graveyard return replacement'
  },
  {
    id: 'color-identity', topic: 'Commander', question: 'What is color identity?',
    answer: 'A card\'s color identity is every mana symbol in its cost and rules text, plus its color indicator. Your deck may only contain cards whose identity is within your commander\'s. Reminder text does not count; hybrid symbols count as both colors.',
    keywords: 'color identity deck building hybrid'
  },
  {
    id: 'starting-life', topic: 'Commander', question: 'What are the basic Commander rules?',
    answer: '100-card deck including the commander, no duplicates except basic lands, 40 starting life, everyone draws on their first turn, and the first mulligan is free.',
    keywords: 'singleton 100 cards 40 life format'
  },
  {
    id: 'mulligan', topic: 'Commander', question: 'How do mulligans work?',
    answer: 'Shuffle your hand into your library and draw seven. In Commander the first mulligan is free; for each one after that, you put one card from the new hand on the bottom of your library when you keep.',
    keywords: 'mulligan london free'
  },
  {
    id: 'partner', topic: 'Commander', question: 'Can I have two commanders?',
    answer: 'Only with a pairing ability: Partner, "Partner with", Friends forever, Choose a Background, or Doctor\'s companion. Your deck\'s color identity is both combined, and each commander has its own tax and its own commander-damage total.',
    keywords: 'partner background friends forever doctor companion two commanders'
  },
  {
    id: 'eliminated-player', topic: 'Commander', question: 'What happens when a player leaves the game?',
    answer: 'Everything they own leaves the game, including permanents other players control. Their spells and abilities on the stack are removed. Anything they controlled but did not own returns to its owner or is exiled.',
    keywords: 'player loses leaves concede eliminated'
  },

  // ── Counters & Status ──────────────────────────────────────────────────────────────────
  {
    id: 'poison', topic: 'Counters & Status', question: 'How many poison counters lose the game?',
    answer: 'Ten, the same as in two-player Magic. Infect deals damage to players as poison counters; toxic adds poison counters on top of the normal combat damage.',
    keywords: 'poison infect toxic ten'
  },
  {
    id: 'plus-minus-counters', topic: 'Counters & Status', question: 'What happens with +1/+1 and -1/-1 counters on the same creature?',
    answer: 'They cancel out. For each pair, remove one of each until only one kind is left.',
    keywords: '+1/+1 -1/-1 counters cancel annihilate'
  },
  {
    id: 'proliferate', topic: 'Counters & Status', question: 'What does proliferate do?',
    answer: 'Choose any number of players and permanents that already have a counter. Each gets one more of each kind of counter it already has.',
    keywords: 'proliferate counters poison'
  },
  {
    id: 'monarch', topic: 'Counters & Status', question: 'How does the monarch work?',
    answer: 'The monarch draws a card at the beginning of their end step. Whenever a creature deals combat damage to the monarch, that creature\'s controller becomes the monarch. Only one player is the monarch at a time.',
    keywords: 'monarch draw crown'
  },
  {
    id: 'initiative', topic: 'Counters & Status', question: 'How does the initiative work?',
    answer: 'When you take the initiative, and at the beginning of your upkeep while you have it, you venture into the Undercity. Whenever a creature deals combat damage to the player with the initiative, its controller takes it.',
    keywords: 'initiative undercity venture dungeon'
  },
  {
    id: 'citys-blessing', topic: 'Counters & Status', question: 'What is the city\'s blessing?',
    answer: 'Ascend gives you the city\'s blessing once you control ten or more permanents. You keep it for the rest of the game even if you drop below ten.',
    keywords: 'ascend city blessing ten permanents'
  },
  {
    id: 'energy-experience', topic: 'Counters & Status', question: 'What are energy, experience and rad counters?',
    answer: 'They are counters on a player, not on a permanent. Energy is spent to pay costs. Experience only ever goes up and scales certain commanders. With rad counters, at the start of your precombat main phase you mill that many cards and, for each nonland card milled, lose 1 life and remove a rad counter.',
    keywords: 'energy experience rad player counters'
  },
  {
    id: 'shield-stun', topic: 'Counters & Status', question: 'What do shield and stun counters do?',
    answer: 'Shield: if the permanent would be dealt damage or destroyed, remove a shield counter instead. Stun: if the permanent would untap, remove a stun counter instead.',
    keywords: 'shield stun counter'
  },

  // ── Keywords ───────────────────────────────────────────────────────────────────────────
  {
    id: 'hexproof-shroud-ward', topic: 'Keywords', question: 'Hexproof, shroud and ward — what is the difference?',
    answer: 'Hexproof: opponents cannot target it. Shroud: nobody can target it, including you. Ward: when an opponent targets it, that spell or ability is countered unless they pay the ward cost. None of them stop effects that do not target, such as "destroy all creatures".',
    keywords: 'hexproof shroud ward target'
  },
  {
    id: 'indestructible', topic: 'Keywords', question: 'What gets around indestructible?',
    answer: 'Indestructible stops "destroy" effects and lethal damage. It does not stop exile, sacrifice, being returned to hand, or having toughness reduced to 0 or less.',
    keywords: 'indestructible exile sacrifice toughness'
  },
  {
    id: 'flash', topic: 'Keywords', question: 'When can I cast things?',
    answer: 'Instants and cards with flash: any time you have priority. Everything else (creatures, sorceries, artifacts, enchantments, planeswalkers): only in your own main phase while the stack is empty.',
    keywords: 'flash instant sorcery speed timing'
  },
  {
    id: 'legend-rule', topic: 'Keywords', question: 'What is the legend rule?',
    answer: 'If you control two or more legendary permanents with the same name, you choose one and put the rest into the graveyard. Two different players can each control one.',
    keywords: 'legendary legend rule duplicate'
  },
  {
    id: 'protection', topic: 'Keywords', question: 'What does protection do?',
    answer: 'Remember DEBT: it cannot be Damaged, Enchanted or equipped, Blocked, or Targeted by anything with the stated quality. Effects that do not target or deal damage, like a board wipe, still affect it.',
    keywords: 'protection from debt'
  },

  // ── Zones & Cards ──────────────────────────────────────────────────────────────────────
  {
    id: 'tokens', topic: 'Zones & Cards', question: 'What happens to a token that leaves the battlefield?',
    answer: 'It goes to the new zone, triggers anything that cares (for example "dies"), and then ceases to exist. It cannot come back.',
    keywords: 'token dies graveyard cease exist'
  },
  {
    id: 'etb', topic: 'Zones & Cards', question: 'When do "enters the battlefield" abilities happen?',
    answer: 'They trigger when the permanent enters and go on the stack the next time a player would get priority. Players can respond before the ability resolves, but the permanent is already on the battlefield.',
    keywords: 'etb enters trigger'
  },
  {
    id: 'countered', topic: 'Zones & Cards', question: 'What happens when a spell is countered?',
    answer: 'It goes to its owner\'s graveyard without any of its effects happening. Costs already paid are not refunded. A countered commander may go to the command zone instead.',
    keywords: 'counter spell countered graveyard'
  },
  {
    id: 'illegal-target', topic: 'Zones & Cards', question: 'My spell\'s target is gone. What happens?',
    answer: 'If every target is illegal when the spell or ability tries to resolve, it does nothing and is removed from the stack. If at least one target is still legal, it does as much as it can.',
    keywords: 'fizzle target illegal gone'
  },
  {
    id: 'sacrifice', topic: 'Zones & Cards', question: 'Can I respond to a sacrifice or stop it with indestructible?',
    answer: 'Sacrificing is not destroying, so indestructible and regeneration do not help. If the sacrifice is a cost, it is paid immediately and cannot be responded to; if it is an effect, players can respond before it resolves.',
    keywords: 'sacrifice cost indestructible'
  },
  {
    id: 'search-shuffle', topic: 'Zones & Cards', question: 'Do I have to find a card when I search my library?',
    answer: 'If the search is for a card with a stated quality (such as "a basic land card"), you may choose to find nothing. You still shuffle if the effect says to.',
    keywords: 'tutor search fail to find shuffle'
  },
  {
    id: 'mdfc', topic: 'Zones & Cards', question: 'How do double-faced cards with a land on one side work?',
    answer: 'You choose which face to play. Playing the land face uses your land play for the turn and is not casting a spell. Everywhere except the stack and battlefield, the card has only its front face\'s characteristics.',
    keywords: 'mdfc modal double faced land'
  },
  // ── Casting: costs and ways to cast ────────────────────────────────────────────────────
  {
    id: 'kicker', topic: 'Casting', question: 'How do kicker and multikicker work?',
    answer: 'Kicker is an optional extra cost you choose to pay as you cast the spell. If you pay it, the spell is "kicked" and gets the bonus written on it. Multikicker can be paid any number of times. The app asks whether to kick when you cast.',
    keywords: 'kicker kicked multikicker additional cost extra'
  },
  {
    id: 'alt-costs', topic: 'Casting', question: 'Can I combine flashback, evoke, dash or other alternative costs?',
    answer: 'You can use only one alternative cost per spell (flashback, escape, evoke, dash, blitz, overload, foretell, or "without paying its mana cost"). Additional costs such as kicker and buyback can be added on top. Commander tax is also added on top when casting from the command zone.',
    keywords: 'alternative cost flashback evoke dash blitz overload combine free'
  },
  {
    id: 'flashback', topic: 'Casting', question: 'What happens to a flashback or escape spell after it resolves?',
    answer: 'A spell cast with flashback is exiled instead of going anywhere else, even if it is countered. An instant or sorcery cast with escape is exiled too; an escaped permanent stays on the battlefield and often enters with counters.',
    keywords: 'flashback escape graveyard exile cast from graveyard jump-start'
  },
  {
    id: 'cost-reduction', topic: 'Casting', question: 'Can cost reductions lower colored mana or commander tax?',
    answer: 'Generic reductions ("costs {1} less") reduce only the generic part of the total cost, which includes commander tax and kicker. They never reduce colored mana. Increases (like Thalia) are added first, then reductions are applied.',
    keywords: 'cost reduction less more thalia affinity eminence tax generic'
  },
  {
    id: 'convoke-delve', topic: 'Casting', question: 'How do convoke and delve pay for a spell?',
    answer: 'Convoke: tap your untapped creatures while casting; each pays {1} or one mana of its color (summoning sick creatures can convoke). Delve: exile cards from your graveyard while casting; each pays {1} of the generic cost. Neither can pay colored costs beyond what is described.',
    keywords: 'convoke delve tap creatures exile graveyard pay'
  },
  {
    id: 'x-zero', topic: 'Casting', question: 'What is X when a spell is cast for free or is not on the stack?',
    answer: 'If you cast a spell without paying its mana cost, X is 0. On the stack, X is what was chosen; everywhere else (your hand, the graveyard, the battlefield) X is 0 for mana value.',
    keywords: 'x cost free cascade mana value zero'
  },
  {
    id: 'cascade', topic: 'Casting', question: 'How does cascade work?',
    answer: 'When you cast a spell with cascade, exile cards from the top of your library until you exile a nonland card with lower mana value. You may cast it for free right away (ignoring timing). The rest go on the bottom in a random order. Cascade triggers on cast, so the cascaded spell resolves first.',
    keywords: 'cascade free cast exile top library discover'
  },
  {
    id: 'storm', topic: 'Casting', question: 'What counts for storm?',
    answer: 'Storm copies the spell once for each other spell cast before it this turn — by any player. Copies are not cast, so they do not add to the storm count or trigger "whenever you cast". You may choose new targets for each copy.',
    keywords: 'storm copy count spells cast this turn'
  },
  {
    id: 'morph', topic: 'Casting', question: 'How do morph and disguise work?',
    answer: 'Cast the card face down for {3} as a nameless, colorless 2/2 with no abilities (disguise also gives it ward {2}). Any time you have priority you may turn it face up by paying its morph or disguise cost — this does not use the stack. A face-down card that leaves the battlefield is revealed.',
    keywords: 'morph megamorph disguise face down 2/2 manifest turn face up'
  },
  {
    id: 'foretell', topic: 'Casting', question: 'How does foretell work?',
    answer: 'During your turn, pay {2} and exile the card from your hand face down. On a later turn you may cast it from exile for its foretell cost. Opponents do not see what you foretold.',
    keywords: 'foretell exile face down later turn'
  },
  {
    id: 'adventure', topic: 'Casting', question: 'How do adventure cards work?',
    answer: 'You may cast the adventure half (an instant or sorcery). As it resolves it goes to exile instead of the graveyard, and later you may cast the creature half from exile. If the adventure is countered, the card goes to the graveyard.',
    keywords: 'adventure exile cast creature later bonecrusher'
  },
  {
    id: 'split-second', topic: 'Casting', question: 'What does split second stop?',
    answer: 'While a spell with split second is on the stack, players cannot cast spells or activate abilities that aren\'t mana abilities. Triggered abilities still trigger, and special actions such as turning a face-down creature up are still allowed.',
    keywords: 'split second respond stop mana abilities'
  },
  // ── More turn and priority questions ───────────────────────────────────────────────────
  {
    id: 'instant-speed-end-step', topic: 'Turn & Priority', question: 'When is the best time to cast instants on an opponent\'s turn?',
    answer: 'Usually in their end step: they have tapped out, and anything you put onto the battlefield untaps on your turn. You get priority in every step except untap and (usually) cleanup.',
    keywords: 'end step instant flash timing opponent turn'
  },
  {
    id: 'special-actions', topic: 'Turn & Priority', question: 'Which actions do not use the stack?',
    answer: 'Playing a land, mana abilities, turning a face-down creature face up, foretelling, suspending a card, and conceding. Nobody can respond to them.',
    keywords: 'special action stack land play foretell morph suspend respond'
  },
  {
    id: 'fizzle', topic: 'Turn & Priority', question: 'What happens if my target disappears before my spell resolves?',
    answer: 'If every target is gone or no longer legal, the spell or ability does nothing and (for a spell) goes to the graveyard. If only some targets are illegal, it does as much as it can to the legal ones.',
    keywords: 'fizzle target illegal removed countered on resolution'
  },
  {
    id: 'intervening-if', topic: 'Turn & Priority', question: 'What is an "intervening if" trigger?',
    answer: 'A trigger written "When/Whenever/At …, if …" checks the condition twice: when it would trigger and again when it resolves. If the condition is false at either time, it does nothing.',
    keywords: 'intervening if condition trigger undying persist'
  },
  // ── Combat ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'goad', topic: 'Combat', question: 'What does goad do?',
    answer: 'A goaded creature must attack each combat if able, and must attack a player other than the one who goaded it if it can. It lasts until the goading player\'s next turn.',
    keywords: 'goad must attack forced'
  },
  {
    id: 'ninjutsu', topic: 'Combat', question: 'When can I use ninjutsu?',
    answer: 'After blockers are declared, while you have an unblocked attacker. Pay the cost and return the unblocked attacker to your hand: the ninja enters tapped and attacking the same player. It never was declared as an attacker, so "whenever attacks" does not trigger.',
    keywords: 'ninjutsu unblocked attacker return hand ninja'
  },
  {
    id: 'evasion', topic: 'Combat', question: 'Who can block fear, intimidate, shadow and horsemanship creatures?',
    answer: 'Fear: only artifact or black creatures. Intimidate: artifact creatures or creatures sharing a color. Shadow: only creatures with shadow (and shadow creatures can block only shadow creatures). Horsemanship: only creatures with horsemanship.',
    keywords: 'fear intimidate shadow horsemanship skulk evasion block'
  },
  {
    id: 'exalted', topic: 'Combat', question: 'How does exalted work?',
    answer: 'Whenever a creature you control attacks alone, it gets +1/+1 until end of turn for each exalted instance you control. "Alone" means it is the only creature you declared as an attacker.',
    keywords: 'exalted attacks alone bonus'
  },
  {
    id: 'combat-tricks', topic: 'Combat', question: 'When should I cast a pump spell in combat?',
    answer: 'After blockers are declared, before damage. Then the attacker and defender are locked in: blocked creatures stay blocked even if the blocker is removed, and the opponent must answer your trick on the stack.',
    keywords: 'pump trick giant growth combat damage timing'
  },
  // ── Commander ──────────────────────────────────────────────────────────────────────────
  {
    id: 'commander-zone-choice', topic: 'Commander', question: 'Does my commander "die" if I move it to the command zone?',
    answer: 'Yes. Your commander goes to the graveyard (or exile) first, so "dies" and "leaves the battlefield" abilities trigger. Then, the next time state-based actions are checked, you may move it to the command zone.',
    keywords: 'commander dies graveyard command zone trigger'
  },
  {
    id: 'commander-tax-zones', topic: 'Commander', question: 'Does commander tax apply when I cast it from my hand or graveyard?',
    answer: 'No. Commander tax applies only when you cast it from the command zone. It goes up by {2} for every previous cast from the command zone.',
    keywords: 'commander tax hand graveyard cast'
  },
  {
    id: 'commander-damage-copies', topic: 'Commander', question: 'Does damage from a copy of my commander count as commander damage?',
    answer: 'No. Only combat damage from the actual commander card counts. A token copy or a different card with the same name does not. Damage from a commander controlled by another player still counts toward its owner\'s commander.',
    keywords: 'commander damage copy token stolen control'
  },
  {
    id: 'eminence', topic: 'Commander', question: 'What is eminence?',
    answer: 'An eminence ability works while the commander is in the command zone as well as on the battlefield — for example The Ur-Dragon makes your other Dragons cost {1} less even before you cast it.',
    keywords: 'eminence command zone ur-dragon edgar'
  },
  {
    id: 'rule-zero', topic: 'Commander', question: 'What is rule zero?',
    answer: 'Before the game, the table can agree to house rules: proxies, banned cards, undo, power level. In the app, house rules from your profile are shown with a chip and everyone must accept the rules before starting (unless a non-playing host sets them).',
    keywords: 'rule zero house rules agree pregame proxy power level'
  },
  // ── Counters, designations, zones ──────────────────────────────────────────────────────
  {
    id: 'undying-persist', topic: 'Counters & Status', question: 'How do undying and persist work?',
    answer: 'When the creature dies, if it had no +1/+1 counter (undying) or no -1/-1 counter (persist), it returns with one. With both kinds of counter, they cancel in pairs, which can let it return again.',
    keywords: 'undying persist return counter dies'
  },
  {
    id: 'sagas', topic: 'Counters & Status', question: 'How do Sagas work?',
    answer: 'A Saga gets a lore counter as it enters and after your draw step each turn. Each chapter triggers when its number of lore counters is reached. After the last chapter ability leaves the stack, the Saga is sacrificed.',
    keywords: 'saga lore counter chapter sacrifice'
  },
  {
    id: 'dungeons', topic: 'Counters & Status', question: 'How do dungeons and venture work?',
    answer: 'Venture into the dungeon: if you are not in a dungeon, choose one and enter its first room; otherwise move to a connected room. Each room has an ability. Finishing the last room completes the dungeon. Undercity can only be entered through the initiative.',
    keywords: 'dungeon venture room undercity initiative completed'
  },
  {
    id: 'doubling', topic: 'Counters & Status', question: 'How do Doubling Season and Hardened Scales stack?',
    answer: 'Replacement effects apply one at a time, in an order chosen by the affected player (or the controller of the affected permanent). Doubling then +1 gives more than +1 then doubling, so choose the order that helps you most. The app applies doublers first, then +1 effects.',
    keywords: 'doubling season hardened scales replacement order counters tokens'
  },
  {
    id: 'rest-in-peace', topic: 'Zones & Cards', question: 'With Rest in Peace out, do "dies" abilities trigger?',
    answer: 'No. "Dies" means put into a graveyard from the battlefield, and Rest in Peace exiles the card instead. "Leaves the battlefield" abilities still trigger.',
    keywords: 'rest in peace leyline dies exile graveyard replacement'
  },
  {
    id: 'face-down-identity', topic: 'Zones & Cards', question: 'Can I look at my own face-down cards?',
    answer: 'Yes. You may look at your face-down permanents and your foretold cards at any time. Opponents may not. When the game ends or a face-down card leaves the battlefield, it is revealed.',
    keywords: 'face down morph foretold look peek reveal'
  },
  {
    id: 'copies', topic: 'Zones & Cards', question: 'What does a copy of a permanent copy?',
    answer: 'A copy takes the printed card\'s values plus other copy effects: name, mana cost, types, abilities, power and toughness. It does not copy counters, tapped status, Auras, or temporary effects. A copy of a face-down creature is a face-down 2/2.',
    keywords: 'copy clone token copiable values counters'
  },
  {
    id: 'ownership', topic: 'Zones & Cards', question: 'Where does a stolen creature go when it dies?',
    answer: 'To its owner\'s graveyard. Cards always go to their owner\'s hand, library, graveyard or exile; only the battlefield and the stack care about who controls them.',
    keywords: 'steal control owner graveyard dies'
  },
  {
    id: 'cycling', topic: 'Zones & Cards', question: 'Is cycling a spell? Can it be countered?',
    answer: 'Cycling is an activated ability from your hand: pay the cost and discard the card, then draw when the ability resolves. Discarding is part of the cost, so it happens even if the ability is countered. Typecycling searches for a card of that type instead.',
    keywords: 'cycling landcycling typecycling discard draw ability'
  },
  {
    id: 'ward-pay', topic: 'Keywords', question: 'What if I can\'t pay a ward cost?',
    answer: 'Ward triggers when the permanent becomes a target of your spell or ability. If you don\'t pay when it resolves, your spell or ability is countered. The app asks you to pay as you target.',
    keywords: 'ward pay counter target'
  },
  {
    id: 'prowess', topic: 'Keywords', question: 'What triggers prowess?',
    answer: 'Casting a noncreature spell (instants, sorceries, artifacts, enchantments, planeswalkers). The creature gets +1/+1 until end of turn for each one. Copies of spells are not cast, so they do not trigger it.',
    keywords: 'prowess noncreature spell cast trigger'
  },
  {
    id: 'evoke', topic: 'Keywords', question: 'Do I get the enters ability of an evoked creature?',
    answer: 'Yes. Both the "enters" ability and the evoke sacrifice trigger go on the stack; you choose the order, so you can even sacrifice it first and still get the enters effect.',
    keywords: 'evoke sacrifice enters trigger elemental'
  },
  {
    id: 'dash-blitz', topic: 'Keywords', question: 'What is the difference between dash and blitz?',
    answer: 'Both give haste. Dash returns the creature to its owner\'s hand at the beginning of the next end step. Blitz sacrifices it at the next end step and gives it "When this creature dies, draw a card."',
    keywords: 'dash blitz haste end step return sacrifice draw'
  }
];

/** Entries matching a free-text search and optional topic. */
export function searchJudge(query = '', topic = '') {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return JUDGE_ENTRIES.filter(entry => {
    if (topic && entry.topic !== topic) return false;
    if (!words.length) return true;
    const haystack = `${entry.question} ${entry.answer} ${entry.keywords} ${entry.topic}`.toLowerCase();
    return words.every(word => haystack.includes(word));
  });
}
