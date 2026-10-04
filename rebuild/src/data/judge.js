// "Ask the Judge" — a searchable plain-language rules reference for Commander.
// Each entry: { id, topic, question, answer, keywords }. Keep answers short and practical;
// this is a table aid, not a replacement for the Comprehensive Rules.

export const JUDGE_TOPICS = ['Turn & Priority', 'Combat', 'Commander', 'Counters & Status', 'Keywords', 'Zones & Cards'];

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
