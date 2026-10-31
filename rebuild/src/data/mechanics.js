// The Magic terms key: every mechanic the game can meet, written for the engine as much as for
// people. For each term it records what it does, the rule points that decide hard cases, how the
// app handles it, and — when a card has to be resolved by hand — the few steps a player follows
// and which quick actions to offer. `detect` finds the term in a card's rules text.
//
// automation: 'auto'    the engine applies it by itself
//             'partial' the engine applies the common case; unusual wordings are resolved by hand
//             'manual'  the players resolve it with the guided options below
//             'info'    a rule or concept, nothing to resolve
//
// Quick action ids (the buttons offered while resolving by hand):
//   destroy exile bounce tap untap counter+ counter- counter-other damage gain-control sacrifice
//   return-hand return-battlefield to-library life-gain life-loss draw discard mill poison token
//   copy-token counter-spell shuffle search status pt attach scry transform

const E = [];
function m(name, kind, summary, o = {}) {
  E.push({
    id: o.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name, kind, summary,
    rules: o.rules || [], tricky: o.tricky || [],
    automation: o.auto || 'manual',
    steps: o.steps || '',
    actions: o.actions || [],
    detect: o.detect === undefined ? `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b` : o.detect
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Core rules concepts — what the engine leans on to settle interactions
// ─────────────────────────────────────────────────────────────────────────────────────────────
m('The stack', 'concept', 'Spells and abilities wait on the stack and resolve last in, first out.', {
  auto: 'info', detect: null,
  rules: ['Each player gets priority in turn order; a spell or ability resolves only when every player passes in a row with it on top.', 'Mana abilities and special actions (playing a land, turning a face-down card up, foretelling, suspending) do not use the stack.', 'If every target of a spell or ability is illegal when it would resolve, it does nothing (it is not "countered by the rules" for triggers that care about countering, except where cards say so).'],
  tricky: ['Responding to your own spell is legal: you keep priority after casting.', 'A triggered ability goes on the stack the next time a player would get priority, even in the middle of combat damage.']
});
m('Priority', 'concept', 'The right to cast a spell or activate an ability. The active player gets it first.', { auto: 'info', detect: null, rules: ['After a spell or ability resolves, the active player gets priority again.', 'Passing priority with an empty stack ends the step when all players pass.'] });
m('State-based actions', 'concept', 'Checks the game makes whenever a player would get priority.', {
  auto: 'auto', detect: null,
  rules: ['A player at 0 or less life loses; a player with 10 or more poison counters loses; a player who attempted to draw from an empty library since the last check loses.', 'Commander: 21 or more combat damage from a single commander makes that player lose.', 'A creature with 0 or less toughness is put into its owner\'s graveyard (indestructible does not help).', 'A creature with lethal damage marked on it, or any damage from a deathtouch source, is destroyed (indestructible prevents this).', 'A planeswalker with 0 loyalty goes to the graveyard.', 'Legend rule: if a player controls two or more legendary permanents with the same name, they choose one and the rest go to the graveyard.', 'An Aura attached to an illegal object or to nothing goes to the graveyard; an Equipment or Fortification attached illegally becomes unattached.', 'A token in a zone other than the battlefield ceases to exist; a copy of a spell not on the stack ceases to exist.', 'If a permanent has both +1/+1 and -1/-1 counters, they are removed in pairs.', 'A Saga with lore counters at least equal to its final chapter number, and no chapter ability on the stack, is sacrificed.'],
  tricky: ['All applicable state-based actions happen at the same time, then the check repeats.', 'A creature that gets -X/-X dies even if it is indestructible.']
});
m('Layers', 'concept', 'The order continuous effects apply in when they change what a permanent is.', {
  auto: 'info', detect: null,
  rules: ['Layer 1 copy effects (1a copiable values, 1b face-down); 2 control; 3 text; 4 type; 5 color; 6 abilities (adding/removing); 7 power/toughness.', 'Layer 7: 7a characteristic-defining abilities, 7b effects that set P/T, 7c modifications (+N/+N, counters), 7d switching power and toughness.', 'Within a layer, effects apply in timestamp order unless one depends on another.'],
  tricky: ['"Lose all abilities" (layer 6) does not remove a P/T-setting effect from layer 7b that came from elsewhere.', 'A creature that becomes a copy keeps counters and effects that modify it (they are not copiable).', 'Humility + Opalescence and similar loops are resolved with dependency and timestamps — rule by hand.']
});
m('Timestamps', 'concept', 'Later effects win ties: an effect\'s timestamp is when it began.', { auto: 'info', detect: null, rules: ['A permanent\'s static abilities get the timestamp of the permanent entering.', 'An Aura or Equipment that moves gets a new timestamp for its effect.'] });
m('Replacement effects', 'concept', 'Effects that say "instead" or "skip" change an event as it happens; they never use the stack.', {
  auto: 'partial', detect: '\\binstead\\b',
  rules: ['The affected player (or controller of the affected object) chooses the order when several replacement effects apply.', 'Each replacement effect applies only once to a given event.', '"Enters with" counters and "as ~ enters" choices are replacement effects.'],
  tricky: ['Doubling Season + Hardened Scales: the controller of the creature picks the order (usually Scales first, then double).', 'Rest in Peace stops "dies" triggers from seeing a graveyard but the creature still dies.'],
  steps: 'Apply the change to the event, not afterwards.', actions: ['exile', 'counter+', 'token', 'life-gain', 'damage']
});
m('Prevention effects', 'concept', 'Effects that say "prevent" stop damage before it is dealt.', { auto: 'partial', detect: '\\bprevent', rules: ['Prevented damage was never dealt: no lifelink, no deathtouch, no "deals damage" triggers.', '"Damage can\'t be prevented" beats prevention.'], actions: ['damage'] });
m('Triggered abilities', 'concept', 'Abilities that start with "when", "whenever" or "at".', {
  auto: 'partial', detect: '\\b(?:When|Whenever|At the beginning)\\b',
  rules: ['If several trigger at once, the active player puts theirs on the stack first in any order, then the others in turn order (APNAP), so the last player\'s resolve first.', 'An "intervening if" clause ("When X, if Y, ...") checks the condition both when it triggers and when it resolves.', 'Leaves-the-battlefield triggers look back in time at the game just before the event.'],
  tricky: ['A trigger with no legal target is removed from the stack.', 'Optional triggers ("you may") are chosen at resolution.']
});
m('Last known information', 'concept', 'When an object has left its zone, effects use what it was like just before it left.', { auto: 'partial', detect: null, rules: ['"Its power" after a creature died uses the power it had on the battlefield.', 'A sacrificed creature\'s last known information includes counters and effects on it.'] });
m('Zone change makes a new object', 'concept', 'A card that changes zones is a new object with no memory of its past.', { auto: 'auto', detect: null, rules: ['Counters, damage, Auras, and effects targeting it stop applying when it leaves the battlefield.', 'Exceptions: effects that say "return it" can find the object they exiled; linked abilities track it.'], tricky: ['A flickered creature comes back as a new object: summoning sick, without counters, untapped.'] });
m('Summoning sickness', 'concept', 'A creature can\'t attack or use {T}/{Q} abilities unless you controlled it continuously since your most recent turn began.', { auto: 'auto', detect: null, rules: ['Haste removes the restriction.', 'It applies to permanents that become creatures too (manlands, vehicles crewed the turn they arrived).'] });
m('Mana value', 'concept', 'The total of a card\'s mana cost. X is 0 everywhere except on the stack.', { auto: 'auto', detect: null, rules: ['Split cards: the sum of both halves (except while on the stack as one half).', 'Modal double-faced cards and adventurers use the front face (or the face being cast).', 'Transforming DFC back faces use the front face\'s mana value.', 'Copies of spells have the copied spell\'s mana value; tokens with no mana cost have 0.'] });
m('Copiable values', 'concept', 'What a copy takes: name, mana cost, color, types, rules text, P/T, loyalty — as printed plus other copy effects.', { auto: 'partial', detect: null, rules: ['Counters, Auras, damage, control and non-copy effects are not copied.', 'A copy of a face-down creature is a face-down 2/2.', 'A token copy of a double-faced permanent is a copy of the face that was up.'], actions: ['copy-token'] });
m('Control vs ownership', 'concept', 'The owner is who started the game with the card; the controller is who it is under now.', { auto: 'auto', detect: null, rules: ['Cards always go to their owner\'s hand, library, graveyard and exile.', 'If a player leaves a multiplayer game, everything they own leaves and control effects they gave end.'] });
m('Can\'t beats can', 'concept', 'If one effect says something can happen and another says it can\'t, it can\'t.', { auto: 'info', detect: null });
m('Characteristic-defining abilities', 'concept', 'Abilities that set a card\'s own P/T, color or type ("~\'s power is equal to…"). They work in every zone.', { auto: 'partial', detect: '(?:power|toughness)(?: and toughness)? (?:is|are each) equal to', rules: ['They apply in layer 7a, before other P/T changes.'] });
m('Legend rule', 'concept', 'You can\'t control two legendary permanents with the same name: choose one, the rest go to the graveyard.', { auto: 'manual', detect: '\\bLegendary\\b', steps: 'Choose which copy stays; put the others in the graveyard (this is not sacrificing and not destroying).', actions: ['to-library', 'sacrifice'] });
m('Damage', 'concept', 'Damage to a player causes life loss; to a creature it is marked until cleanup; to a planeswalker it removes loyalty; to a battle it removes defense counters.', { auto: 'auto', detect: '\\bdeals? \\w+ damage\\b', rules: ['All combat damage in a step is dealt at the same time.', 'A source with infect or wither deals -1/-1 counters to creatures; infect deals poison counters to players.'], actions: ['damage'] });
m('Life loss vs damage', 'concept', '"Loses life" is not damage: it can\'t be prevented and has no lifelink, but it still causes "whenever a player loses life" triggers.', { auto: 'auto', detect: '\\blos(?:e|es) \\w+ life\\b', actions: ['life-loss'] });
m('Destroy vs sacrifice vs exile', 'concept', 'Destroy moves to the graveyard and is stopped by indestructible and regeneration; sacrifice is done by the controller and ignores both; exile removes it to the exile zone.', { auto: 'auto', detect: null, rules: ['Sacrificing is not destroying: no indestructible, no regenerate, but it still "dies" for a creature.', 'Hexproof and shroud do not stop "each player sacrifices".'] });
m('Countering', 'concept', 'A countered spell goes to its owner\'s graveyard without resolving; a countered ability simply ends.', { auto: 'partial', detect: '\\bcounter target\\b', rules: ['"Can\'t be countered" spells can still be removed by other effects (exile from the stack is rare).', 'Flashback, jump-start and rebound spells that are countered go to exile instead of the graveyard (flashback/jump-start) or the graveyard (rebound has no effect).'], actions: ['counter-spell'] });
m('Targets', 'concept', 'The word "target" means a choice made when the spell or ability is put on the stack.', { auto: 'auto', detect: '\\btarget\\b', rules: ['A spell with no legal targets can\'t be cast.', 'Checked again on resolution: if some targets became illegal, the spell does as much as it can to the rest; if all did, it does nothing.', 'The same object can\'t be chosen twice for one instance of "target", but can for separate instances.'], steps: 'The targets were chosen when it was cast — apply the effect to them.', actions: [] });
m('X costs', 'concept', 'X is chosen as the spell is cast and paid with mana. It is 0 in every zone except the stack.', { auto: 'auto', detect: '\\{X\\}' });
m('Additional and alternative costs', 'concept', 'An alternative cost (flashback, evoke, dash, overload, commander free-cast effects) replaces the mana cost; additional costs (kicker, buyback, sacrifice as you cast) are added.', { auto: 'partial', detect: null, rules: ['Only one alternative cost can be used per spell; any number of additional costs.', 'Cost increases and reductions apply to the total after choosing the alternative cost; commander tax is an additional cost.', 'Casting "without paying its mana cost" is an alternative cost: no other alternative cost, but additional costs (kicker) may be paid; X is 0.'] });
m('Copying spells', 'concept', 'A copy of a spell is created on the stack (not cast) and may often choose new targets.', { auto: 'partial', detect: '\\bcop(?:y|ies) (?:target|that|it)\\b', rules: ['Copies are not cast: no "whenever you cast" triggers, no cost paid.', 'Choices made on casting (modes, X, kicker paid) are copied.'], actions: ['counter-spell'] });
m('Emblems', 'concept', 'Permanent effects in the command zone, usually from planeswalkers. They can\'t be removed.', { auto: 'manual', detect: '\\bemblem\\b', steps: 'Note the emblem\'s ability; it stays for the rest of the game.', actions: ['status'] });
m('Turn structure', 'concept', 'Beginning (untap, upkeep, draw), first main, combat (beginning, attackers, blockers, damage, end), second main, ending (end step, cleanup).', { auto: 'auto', detect: null, rules: ['No player gets priority in untap or (usually) cleanup.', '"Until end of turn" effects end and damage is removed in cleanup.', 'If something triggers in cleanup, players get priority and another cleanup step follows.'] });
m('Combat damage assignment', 'concept', 'An attacker blocked by several creatures assigns damage in an order; lethal damage must go to one before the next.', { auto: 'auto', detect: null, rules: ['Deathtouch makes 1 damage lethal for assignment.', 'Trample assigns lethal to all blockers, the rest to the player.', 'A blocked creature stays blocked even if its blockers leave (no damage unless it has trample).'] });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Evergreen keyword abilities
// ─────────────────────────────────────────────────────────────────────────────────────────────
m('Deathtouch', 'keyword', 'Any damage this deals to a creature is enough to destroy it.', { auto: 'auto', rules: ['Works with any damage, not just combat (fight, "deals damage" effects).', 'With trample, 1 damage per blocker counts as lethal and the rest tramples over.'], tricky: ['Indestructible creatures survive deathtouch damage.', '-1/-1 counters from a deathtouch+wither source still destroy (damage was dealt).'] });
m('Defender', 'keyword', 'This creature can\'t attack.', { auto: 'auto', rules: ['It can still block and use tap abilities.'] });
m('Double strike', 'keyword', 'Deals both first-strike and regular combat damage.', { auto: 'auto', tricky: ['Lifelink and "deals combat damage" triggers happen in both damage steps.', 'Gaining double strike after first-strike damage still lets it deal regular damage.'] });
m('Enchant', 'keyword', 'An Aura\'s "Enchant [quality]" sets what it can be attached to.', { auto: 'partial', rules: ['If the enchanted object becomes illegal or leaves, the Aura goes to the graveyard (state-based action).', 'An Aura spell targets; an Aura put onto the battlefield without being cast does not target (so it can go on a hexproof creature).'], actions: ['attach'] });
m('Equip', 'keyword', 'Pay the cost: attach this Equipment to target creature you control. Only as a sorcery.', { auto: 'auto', rules: ['The Equipment stays on the battlefield if the creature leaves.', 'Equipping to a creature that has protection from artifacts fails (illegal target).'], actions: ['attach'] });
m('First strike', 'keyword', 'Deals combat damage before creatures without first strike.', { auto: 'auto' });
m('Flash', 'keyword', 'You may cast this any time you could cast an instant.', { auto: 'auto' });
m('Flying', 'keyword', 'Can be blocked only by creatures with flying or reach.', { auto: 'auto' });
m('Haste', 'keyword', 'Can attack and use {T} abilities the turn it comes under your control.', { auto: 'auto' });
m('Hexproof', 'keyword', 'Can\'t be the target of spells or abilities your opponents control.', { auto: 'auto', rules: ['"Hexproof from [quality]" only stops sources with that quality.', 'Does not stop mass effects or "each opponent sacrifices".'] });
m('Indestructible', 'keyword', 'Can\'t be destroyed by damage or "destroy" effects.', { auto: 'auto', tricky: ['Still dies to 0 toughness (-X/-X), sacrifice, exile, or the legend rule.'] });
m('Lifelink', 'keyword', 'Damage dealt by this source also makes its controller gain that much life.', { auto: 'auto', rules: ['Works for any damage, at the same time it is dealt.', 'Multiple instances of lifelink are redundant.'] });
m('Menace', 'keyword', 'Can\'t be blocked except by two or more creatures.', { auto: 'auto' });
m('Protection', 'keyword', 'Protection from [quality]: it can\'t be Damaged, Enchanted/Equipped, Blocked, or Targeted by anything with that quality (DEBT).', { auto: 'auto', detect: '\\bProtection from\\b', rules: ['Damage from sources with that quality is prevented.', 'Auras and Equipment with that quality fall off.', 'It doesn\'t stop mass removal ("destroy all creatures") or non-targeted effects.'], tricky: ['"Protection from everything" stops all of the above from any source.', 'A creature with protection from a color can still block creatures of that color.'] });
m('Reach', 'keyword', 'Can block creatures with flying.', { auto: 'auto' });
m('Shroud', 'keyword', 'Can\'t be the target of any spell or ability, including its controller\'s.', { auto: 'auto' });
m('Trample', 'keyword', 'Excess combat damage beyond lethal to its blockers is dealt to the player or planeswalker it attacks.', { auto: 'auto', tricky: ['If all blockers are removed, all its damage goes to the player.', '"Trample over planeswalkers" lets excess go to the planeswalker\'s controller.'] });
m('Vigilance', 'keyword', 'Attacking doesn\'t cause this creature to tap.', { auto: 'auto' });
m('Ward', 'keyword', 'Whenever this becomes the target of a spell or ability an opponent controls, counter it unless that player pays the ward cost.', { auto: 'partial', detect: '\\bWard\\b', rules: ['The ward cost is paid when the ward trigger resolves; most groups simply pay it as part of targeting.', 'Ward costs can be mana, life, discarding, or sacrificing.'], steps: 'Ask the targeting player to pay the ward cost; if they don\'t, counter the spell or ability.', actions: ['counter-spell', 'life-loss', 'discard', 'sacrifice'] });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Keyword actions
// ─────────────────────────────────────────────────────────────────────────────────────────────
m('Activate', 'action', 'Put an activated ability on the stack by paying its cost.', { auto: 'auto', detect: null });
m('Attach', 'action', 'Move an Aura, Equipment or Fortification onto an object.', { auto: 'auto', actions: ['attach'] });
m('Cast', 'action', 'Take a spell from where it is, put it on the stack and pay its costs.', { auto: 'auto', detect: null });
m('Counter', 'action', 'Cancel a spell or ability on the stack.', { auto: 'partial', detect: '\\bcounter (?:target|that|it)\\b', actions: ['counter-spell'] });
m('Create', 'action', 'Put a token onto the battlefield.', { auto: 'partial', detect: '\\bcreate\\b', actions: ['token'] });
m('Destroy', 'action', 'Move a permanent to its owner\'s graveyard (stopped by indestructible and regeneration).', { auto: 'auto', actions: ['destroy'] });
m('Discard', 'action', 'Move a card from your hand to your graveyard.', { auto: 'auto', actions: ['discard'] });
m('Double', 'action', 'Doubling P/T gives +X/+0 or +0/+X equal to the current value; doubling counters adds that many more; doubling life gains that much.', { auto: 'partial', detect: '\\bdouble\\b', actions: ['counter+', 'pt', 'life-gain'] });
m('Exchange', 'action', 'Swap control, life totals, or zones. If one half can\'t happen, nothing happens.', { auto: 'partial', actions: ['gain-control'] });
m('Exile', 'action', 'Put an object into the exile zone.', { auto: 'auto', actions: ['exile'] });
m('Fight', 'action', 'Each of two creatures deals damage equal to its power to the other.', { auto: 'auto', tricky: ['If either creature is gone or an illegal target, no damage is dealt by or to it.'] , actions: ['damage'] });
m('Goad', 'action', 'Until your next turn, the goaded creature attacks each combat if able, and attacks a player other than you if able.', { auto: 'auto', steps: 'The goaded creature must attack each combat, and not you if it can attack someone else.', actions: ['status'] });
m('Investigate', 'action', 'Create a Clue token ("{2}, Sacrifice this: Draw a card").', { auto: 'auto', actions: ['token'] });
m('Mill', 'action', 'Put the top N cards of a library into its owner\'s graveyard.', { auto: 'auto', actions: ['mill'] });
m('Play', 'action', 'Play a land, or cast a spell.', { auto: 'auto', detect: null });
m('Proliferate', 'action', 'Choose any number of permanents and/or players with counters; give each one more of a kind it already has.', { auto: 'auto', actions: ['counter+', 'poison'] });
m('Reveal', 'action', 'Show a card to all players.', { auto: 'partial', actions: [] });
m('Sacrifice', 'action', 'Move a permanent you control to its owner\'s graveyard. Not stopped by indestructible.', { auto: 'auto', actions: ['sacrifice'] });
m('Scry', 'action', 'Look at the top N cards; put any on the bottom and the rest back on top in any order.', { auto: 'auto', actions: ['scry'] });
m('Search', 'action', 'Look through a zone for cards; when searching a hidden zone for a card with a quality, you may fail to find it.', { auto: 'partial', detect: '\\bsearch (?:your|their|target player\'s|its owner\'s)\\b', actions: ['search', 'shuffle'] });
m('Shuffle', 'action', 'Randomize a library.', { auto: 'auto', actions: ['shuffle'] });
m('Surveil', 'action', 'Look at the top N cards; put any into your graveyard and the rest back in any order.', { auto: 'auto', actions: ['mill'] });
m('Tap and untap', 'action', 'Turn a permanent sideways to tap it; straighten it to untap.', { auto: 'auto', detect: '\\b(?:un)?tap target\\b', actions: ['tap', 'untap'] });
m('Transform', 'action', 'Turn a transforming double-faced permanent to its other face. It is the same object.', { auto: 'partial', actions: ['transform'], rules: ['Only transforming double-faced cards (and meld, specially) can transform; a modal DFC can\'t.', 'Counters, Auras and damage stay.'] });
m('Convert', 'action', 'Turn a double-faced permanent to its other face (Transformers cards).', { auto: 'manual', actions: ['transform'] });
m('Venture into the dungeon', 'action', 'Enter a dungeon (or move to the next room) and get that room\'s ability.', { auto: 'partial', detect: '\\bventure into the dungeon\\b', rules: ['The dungeons are Lost Mine of Phandelver, Dungeon of the Mad Mage, Tomb of Annihilation, and (only through the initiative) Undercity.', 'Completing the last room removes the dungeon; your next venture starts a new one.'] });
m('Explore', 'action', 'Reveal the top card: if it is a land, put it in your hand; otherwise put a +1/+1 counter on the creature and you may put the card into your graveyard.', { auto: 'auto', steps: 'Reveal the top card. Land: to hand. Nonland: +1/+1 counter on the explorer, then keep it on top or put it in the graveyard.', actions: ['counter+', 'mill', 'draw'] });
m('Adapt', 'action', 'Adapt N: if this has no +1/+1 counters, put N +1/+1 counters on it.', { auto: 'auto', steps: 'Only if it has no +1/+1 counters: add N.', actions: ['counter+'] });
m('Amass', 'action', 'Amass [type] N: put N +1/+1 counters on an Army you control; if you have none, create a 0/0 Army token first.', { auto: 'auto', steps: 'No Army? Create a 0/0 Army token. Then put N +1/+1 counters on your Army.', actions: ['token', 'counter+'] });
m('Connive', 'action', 'Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.', { auto: 'auto', steps: 'Draw, discard; nonland discarded → +1/+1 counter.', actions: ['draw', 'discard', 'counter+'] });
m('Learn', 'action', 'You may reveal a Lesson card from outside the game and put it in your hand, or discard a card to draw a card.', { auto: 'manual', steps: 'Commander: usually discard a card and draw a card (Lessons from outside the game need the Wishes rule).', actions: ['discard', 'draw'] });
m('Populate', 'action', 'Create a token that is a copy of a creature token you control.', { auto: 'manual', actions: ['copy-token'] });
m('Manifest', 'action', 'Put the top card of your library onto the battlefield face down as a 2/2 creature. If it is a creature card, you may turn it face up for its mana cost.', { auto: 'manual', steps: 'Put the top card face down as a 2/2. If it is a creature, it can be turned face up any time for its mana cost.', actions: ['token'] });
m('Manifest dread', 'action', 'Look at the top two cards, manifest one, put the other into your graveyard.', { auto: 'manual', actions: ['token', 'mill'] });
m('Cloak', 'action', 'Like manifest, but the face-down 2/2 has ward {2}.', { auto: 'manual', actions: ['token'] });
m('Bolster', 'action', 'Bolster N: put N +1/+1 counters on the creature you control with the least toughness (choose if tied).', { auto: 'auto', actions: ['counter+'] });
m('Support', 'action', 'Support N: put a +1/+1 counter on each of up to N other target creatures.', { auto: 'auto', actions: ['counter+'] });
m('Monstrosity', 'action', 'Monstrosity N: if this isn\'t monstrous, put N +1/+1 counters on it; it becomes monstrous.', { auto: 'auto', actions: ['counter+', 'status'] });
m('Regenerate', 'action', 'The next time this would be destroyed this turn, instead tap it, remove all damage, and remove it from combat.', { auto: 'auto', tricky: ['Does not help against sacrifice, exile, -X/-X, or "can\'t be regenerated".'], actions: ['tap'] });
m('Detain', 'action', 'Until your next turn, the detained permanent can\'t attack or block and its activated abilities can\'t be activated.', { auto: 'manual', actions: ['status'] });
m('Fateseal', 'action', 'Look at the top N cards of an opponent\'s library and put any on the bottom.', { auto: 'manual', actions: [] });
m('Clash', 'action', 'You and an opponent each reveal your top card; whoever has the higher mana value wins. Each player puts their card on the top or bottom.', { auto: 'manual', actions: [] });
m('Planeswalk', 'action', 'Move to the next plane (Planechase).', { auto: 'manual' });
m('Abandon', 'action', 'Turn a face-up ongoing scheme face down (Archenemy).', { auto: 'manual' });
m('Vote', 'action', 'Each player votes, starting with you and going in turn order.', { auto: 'manual', steps: 'Each player votes in turn order; then apply the result the card describes.', actions: [] });
m('Assemble', 'action', 'Put Contraptions from your Contraption deck onto the battlefield (Un-sets).', { auto: 'manual' });
m('Meld', 'action', 'Exile two specific cards you own and control and put them onto the battlefield combined as one permanent.', { auto: 'manual' });
m('Open an Attraction', 'action', 'Put the top card of your Attraction deck onto the battlefield (Un-sets).', { auto: 'manual' });
m('Roll to visit', 'action', 'Roll a six-sided die; Attractions with that number lit visit (Un-sets).', { auto: 'manual' });
m('Time travel', 'action', 'For each permanent you control and suspended card you own with a time counter, you may add or remove a time counter.', { auto: 'manual', actions: ['counter+', 'counter-other'] });
m('Discover', 'action', 'Discover N: exile cards from the top until a nonland card with mana value N or less; cast it free or put it in your hand. The rest go to the bottom in a random order.', { auto: 'auto', detect: '\\bDiscover \\d+' });
m('Forage', 'action', 'Exile three cards from your graveyard or sacrifice a Food.', { auto: 'manual', actions: ['exile', 'sacrifice'] });
m('Collect evidence', 'action', 'Collect evidence N: exile any number of cards from your graveyard with total mana value N or more.', { auto: 'manual', actions: ['exile'] });
m('Suspect', 'action', 'A suspected creature has menace and can\'t block.', { auto: 'manual', actions: ['status'] });
m('Incubate', 'action', 'Incubate N: create an Incubator artifact token with N +1/+1 counters and "{2}: Transform this artifact" (back: 0/0 Phyrexian artifact creature).', { auto: 'partial', actions: ['token', 'counter+'] });
m('The Ring tempts you', 'action', 'Choose a Ring-bearer; your Ring gains its next ability (legendary, can\'t be blocked by greater power; loot on attack; opponents lose 3 on block; each opponent loses 3 on combat damage).', { auto: 'partial', detect: '\\bthe Ring tempts you\\b', actions: ['status'] });
m('Villainous choice', 'action', 'An opponent chooses one of two outcomes that both hurt them.', { auto: 'manual', steps: 'The named opponent picks one of the two options; apply it.', actions: [] });
m('Endure', 'action', 'Endure N: put N +1/+1 counters on it, or create an N/N white Spirit creature token.', { auto: 'manual', actions: ['counter+', 'token'] });
m('Exert', 'action', 'You may exert a creature as it attacks; it won\'t untap during your next untap step.', { auto: 'manual', actions: ['status'] });
m('Set in motion', 'action', 'Move a scheme off the top of your scheme deck and turn it face up (Archenemy).', { auto: 'manual' });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Keyword abilities (A–Z), including old and unusual ones
// ─────────────────────────────────────────────────────────────────────────────────────────────
m('Absorb', 'keyword', 'Absorb N: if a source would deal damage to this creature, prevent N of that damage.', { auto: 'manual', actions: ['damage'] });
m('Affinity', 'keyword', 'Affinity for [type]: this spell costs {1} less for each [type] you control.', { auto: 'auto' });
m('Afflict', 'keyword', 'Afflict N: whenever this becomes blocked, defending player loses N life.', { auto: 'manual', actions: ['life-loss'] });
m('Afterlife', 'keyword', 'Afterlife N: when this dies, create N 1/1 white and black Spirit tokens with flying.', { auto: 'auto', actions: ['token'] });
m('Aftermath', 'keyword', 'Cast the second half of this split card only from your graveyard; then exile it.', { auto: 'manual' });
m('Amplify', 'keyword', 'Amplify N: as this enters, reveal any number of cards of its creature type from your hand; it enters with N +1/+1 counters for each.', { auto: 'manual', actions: ['counter+'] });
m('Annihilator', 'keyword', 'Annihilator N: whenever this attacks, defending player sacrifices N permanents.', { auto: 'manual', steps: 'The defending player sacrifices N permanents of their choice.', actions: ['sacrifice'] });
m('Ascend', 'keyword', 'If you control ten or more permanents, you get the city\'s blessing for the rest of the game.', { auto: 'manual', actions: ['status'] });
m('Assist', 'keyword', 'Another player can pay any amount of this spell\'s generic mana.', { auto: 'manual' });
m('Aura swap', 'keyword', 'Exchange this Aura with an Aura card in your hand.', { auto: 'manual' });
m('Awaken', 'keyword', 'Cast for the awaken cost: also put N +1/+1 counters on target land you control; it becomes a 0/0 Elemental creature with haste.', { auto: 'manual', actions: ['counter+'] });
m('Backup', 'keyword', 'Backup N: when this enters, put N +1/+1 counters on target creature; if that\'s another creature, it gains this creature\'s other abilities until end of turn.', { auto: 'manual', actions: ['counter+'] });
m('Banding', 'keyword', 'Creatures with banding can attack or block as a group; their controller assigns combat damage dealt to the band.', { auto: 'manual' });
m('Bands with others', 'keyword', 'A narrower form of banding.', { auto: 'manual' });
m('Bargain', 'keyword', 'As an additional cost you may sacrifice an artifact, enchantment or token; bargained spells get a bonus.', { auto: 'manual', actions: ['sacrifice'] });
m('Battle cry', 'keyword', 'Whenever this attacks, each other attacking creature gets +1/+0 until end of turn.', { auto: 'manual', actions: ['pt'] });
m('Bestow', 'keyword', 'Cast as an Aura for the bestow cost; if the enchanted creature leaves, it becomes a creature again.', { auto: 'manual', actions: ['attach'] });
m('Blitz', 'keyword', 'Cast for the blitz cost: it has haste and "When this dies, draw a card", and is sacrificed at the next end step.', { auto: 'auto' });
m('Bloodthirst', 'keyword', 'Bloodthirst N: if an opponent was dealt damage this turn, this enters with N +1/+1 counters.', { auto: 'manual', actions: ['counter+'] });
m('Boast', 'keyword', 'Activate only if this creature attacked this turn and only once each turn.', { auto: 'manual' });
m('Bushido', 'keyword', 'Bushido N: whenever this blocks or becomes blocked, it gets +N/+N until end of turn.', { auto: 'manual', actions: ['pt'] });
m('Buyback', 'keyword', 'You may pay the buyback cost as you cast this; if you do, it returns to your hand as it resolves.', { auto: 'auto' });
m('Cascade', 'keyword', 'When you cast this, exile from the top until a nonland card that costs less; you may cast it free. The rest go to the bottom in a random order.', { auto: 'auto', tricky: ['Cascade triggers on cast, so it resolves before the cascading spell.', 'Split cards check the total mana value of both halves.'] });
m('Casualty', 'keyword', 'Casualty N: as you cast this, you may sacrifice a creature with power N or greater; if you do, copy this spell.', { auto: 'manual', actions: ['sacrifice'] });
m('Champion', 'keyword', 'When this enters, sacrifice it unless you exile another [quality] you control; when this leaves, return the exiled card.', { auto: 'manual', actions: ['exile', 'sacrifice'] });
m('Changeling', 'keyword', 'This is every creature type (in every zone).', { auto: 'auto' });
m('Cipher', 'keyword', 'After this resolves, you may exile it encoded on a creature you control; whenever that creature deals combat damage to a player, you may cast a copy free.', { auto: 'manual' });
m('Cleave', 'keyword', 'Cast for the cleave cost and remove the words in square brackets.', { auto: 'manual' });
m('Companion', 'keyword', 'If your deck meets the condition, you may start with this outside the game; once per game pay {3} to put it in your hand.', { auto: 'manual' });
m('Compleated', 'keyword', 'Phyrexian mana in this planeswalker\'s cost can be paid with life; it enters with two fewer loyalty for each one paid that way.', { auto: 'manual' });
m('Conspire', 'keyword', 'As you cast this, you may tap two untapped creatures you control that share a color with it; if you do, copy it.', { auto: 'manual', actions: ['tap'] });
m('Convoke', 'keyword', 'Each creature you tap while casting this pays for {1} or one mana of that creature\'s color.', { auto: 'auto' });
m('Craft', 'keyword', 'Craft with [materials]: exile this and the materials from the battlefield or graveyard, then return it transformed. Sorcery speed.', { auto: 'manual', actions: ['exile', 'transform'] });
m('Crew', 'keyword', 'Crew N: tap untapped creatures with total power N or more: this Vehicle becomes an artifact creature until end of turn.', { auto: 'auto', steps: 'Tap creatures with total power N or more; the Vehicle is a creature until end of turn.', actions: ['tap'] });
m('Cumulative upkeep', 'keyword', 'At the beginning of your upkeep, put an age counter on this, then pay the cost once per age counter or sacrifice it.', { auto: 'manual', actions: ['counter-other', 'sacrifice'] });
m('Cycling', 'keyword', 'Pay the cost and discard this card from your hand: draw a card.', { auto: 'auto', tricky: ['Cycling is an activated ability from hand; "when you cycle" triggers happen too.'] });
m('Landcycling', 'keyword', '[Type]cycling: pay and discard this card: search for a [type] card, reveal it, put it in your hand, then shuffle.', { auto: 'auto', detect: '\\b\\w+cycling \\{' });
m('Dash', 'keyword', 'Cast for the dash cost: it has haste and returns to its owner\'s hand at the next end step.', { auto: 'auto' });
m('Daybound and nightbound', 'keyword', 'Once it is day or night, it changes each turn: a player casting no spells during their own turn makes it night; casting two or more makes it day.', { auto: 'manual', detect: '\\b(?:Daybound|Nightbound)\\b', actions: ['transform', 'status'] });
m('Decayed', 'keyword', 'Can\'t block; when it attacks, sacrifice it at end of combat.', { auto: 'manual', actions: ['sacrifice'] });
m('Delve', 'keyword', 'Each card you exile from your graveyard while casting this pays for {1}.', { auto: 'auto' });
m('Demonstrate', 'keyword', 'When you cast this, you may copy it; if you do, an opponent also copies it.', { auto: 'manual' });
m('Dethrone', 'keyword', 'Whenever this attacks the player with the most life (or tied), put a +1/+1 counter on it.', { auto: 'manual', actions: ['counter+'] });
m('Devoid', 'keyword', 'This card has no color.', { auto: 'auto' });
m('Devour', 'keyword', 'Devour N: as this enters, you may sacrifice any number of creatures; it enters with N +1/+1 counters for each.', { auto: 'manual', actions: ['sacrifice', 'counter+'] });
m('Disguise', 'keyword', 'Cast face down for {3} as a 2/2 with ward {2}; turn face up any time for the disguise cost.', { auto: 'auto' });
m('Disturb', 'keyword', 'Cast this card transformed from your graveyard for the disturb cost; if it would leave the battlefield later, exile it.', { auto: 'manual', actions: ['transform', 'exile'] });
m('Double team', 'keyword', 'When this attacks, if it isn\'t a token, conjure a duplicate into your hand; both lose double team (Alchemy).', { auto: 'manual' });
m('Dredge', 'keyword', 'Dredge N: if you would draw, you may mill N instead and return this card from your graveyard to your hand.', { auto: 'manual', actions: ['mill', 'return-hand'] });
m('Echo', 'keyword', 'At the beginning of your upkeep, if this came under your control since your last upkeep, sacrifice it unless you pay its echo cost.', { auto: 'manual', actions: ['sacrifice'] });
m('Embalm', 'keyword', 'Exile this card from your graveyard and pay: create a token copy, except it is a white Zombie with no mana cost. Sorcery speed.', { auto: 'manual', actions: ['copy-token', 'exile'] });
m('Emerge', 'keyword', 'Cast by sacrificing a creature and paying the emerge cost reduced by that creature\'s mana value.', { auto: 'manual', actions: ['sacrifice'] });
m('Encore', 'keyword', 'Exile this card from your graveyard and pay: for each opponent, create a token copy that attacks that opponent this turn if able; sacrifice them at the next end step.', { auto: 'manual', actions: ['copy-token'] });
m('Enlist', 'keyword', 'As this attacks, you may tap a nonattacking creature without summoning sickness; this gets +X/+0 equal to its power.', { auto: 'manual', actions: ['tap', 'pt'] });
m('Entwine', 'keyword', 'Pay the entwine cost to choose all modes.', { auto: 'manual' });
m('Epic', 'keyword', 'For the rest of the game you can\'t cast spells; at each of your upkeeps, copy this spell.', { auto: 'manual' });
m('Escalate', 'keyword', 'Pay the escalate cost for each mode beyond the first.', { auto: 'manual' });
m('Escape', 'keyword', 'Cast this from your graveyard for its escape cost (including exiling other cards from your graveyard).', { auto: 'auto' });
m('Eternalize', 'keyword', 'Exile this card from your graveyard and pay: create a token copy that is a 4/4 black Zombie with no mana cost.', { auto: 'manual', actions: ['copy-token', 'exile'] });
m('Evoke', 'keyword', 'Cast for the evoke cost; when it enters, sacrifice it.', { auto: 'auto', tricky: ['Its enters-the-battlefield triggers still happen; you choose the order with the sacrifice trigger.'] });
m('Evolve', 'keyword', 'Whenever a creature enters under your control with greater power or toughness than this, put a +1/+1 counter on this.', { auto: 'manual', actions: ['counter+'] });
m('Exalted', 'keyword', 'Whenever a creature you control attacks alone, it gets +1/+1 until end of turn for each instance of exalted you control.', { auto: 'auto', actions: ['pt'] });
m('Exploit', 'keyword', 'When this enters, you may sacrifice a creature.', { auto: 'manual', actions: ['sacrifice'] });
m('Extort', 'keyword', 'Whenever you cast a spell, you may pay {W/B}; if you do, each opponent loses 1 life and you gain that much.', { auto: 'manual', actions: ['life-loss', 'life-gain'] });
m('Fabricate', 'keyword', 'Fabricate N: when this enters, put N +1/+1 counters on it or create N 1/1 Servo artifact creature tokens.', { auto: 'manual', actions: ['counter+', 'token'] });
m('Fading', 'keyword', 'Enters with N fade counters; at your upkeep remove one, or sacrifice it if you can\'t.', { auto: 'manual', actions: ['counter-other', 'sacrifice'] });
m('Fear', 'keyword', 'Can be blocked only by artifact creatures and black creatures.', { auto: 'auto' });
m('Flanking', 'keyword', 'Whenever this becomes blocked by a creature without flanking, the blocker gets -1/-1 until end of turn.', { auto: 'manual', actions: ['pt'] });
m('Flashback', 'keyword', 'Cast this from your graveyard for its flashback cost; then exile it.', { auto: 'auto', tricky: ['If a flashed-back spell is countered or leaves the stack any way, it is exiled.'] });
m('Forecast', 'keyword', 'Reveal this card from your hand during your upkeep for an effect, once per turn.', { auto: 'manual' });
m('Foretell', 'keyword', 'During your turn, pay {2} and exile this face down; cast it on a later turn for its foretell cost.', { auto: 'auto' });
m('Fortify', 'keyword', 'Attach this Fortification to target land you control. Sorcery speed.', { auto: 'manual', actions: ['attach'] });
m('For Mirrodin!', 'keyword', 'When this Equipment enters, create a 2/2 red Rebel creature token and attach this to it.', { auto: 'manual', actions: ['token', 'attach'] });
m('Freerunning', 'keyword', 'You may cast this for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.', { auto: 'manual' });
m('Frenzy', 'keyword', 'Frenzy N: whenever this attacks and isn\'t blocked, it gets +N/+0 until end of turn.', { auto: 'manual', actions: ['pt'] });
m('Fuse', 'keyword', 'Cast both halves of this split card from your hand.', { auto: 'manual' });
m('Gift', 'keyword', 'As you cast this, you may choose an opponent to get the gift (a card, Food, etc.); gifted spells get a bonus.', { auto: 'manual', actions: ['draw', 'token'] });
m('Graft', 'keyword', 'Enters with N +1/+1 counters; whenever another creature enters, you may move a counter onto it.', { auto: 'manual', actions: ['counter+', 'counter-'] });
m('Gravestorm', 'keyword', 'When you cast this, copy it for each permanent put into a graveyard this turn.', { auto: 'manual' });
m('Haunt', 'keyword', 'When this dies (or resolves, for a spell), exile it haunting target creature; when that creature dies, the haunt effect happens again.', { auto: 'manual', actions: ['exile'] });
m('Hidden agenda', 'keyword', 'Start the game with this conspiracy face down with a card name secretly chosen (Conspiracy draft).', { auto: 'manual' });
m('Hideaway', 'keyword', 'When this enters, look at the top N cards, exile one face down and the rest to the bottom; later you may play the exiled card free when a condition is met.', { auto: 'manual', actions: ['exile'] });
m('Horsemanship', 'keyword', 'Can be blocked only by creatures with horsemanship.', { auto: 'auto' });
m('Impending', 'keyword', 'Cast for the impending cost: it enters with N time counters and isn\'t a creature while it has any; remove one at your end step.', { auto: 'manual', actions: ['counter-other'] });
m('Improvise', 'keyword', 'Each artifact you tap while casting this pays for {1}.', { auto: 'manual', actions: ['tap'] });
m('Infect', 'keyword', 'Deals damage to creatures as -1/-1 counters and to players as poison counters.', { auto: 'auto' });
m('Ingest', 'keyword', 'Whenever this deals combat damage to a player, that player exiles the top card of their library.', { auto: 'manual', actions: ['exile'] });
m('Intimidate', 'keyword', 'Can be blocked only by artifact creatures and creatures that share a color with it.', { auto: 'auto' });
m('Jump-start', 'keyword', 'Cast this from your graveyard by discarding a card in addition to its cost; then exile it.', { auto: 'auto', actions: ['discard', 'exile'] });
m('Kicker', 'keyword', 'You may pay an additional kicker cost as you cast this for an extra effect ("if this spell was kicked").', { auto: 'auto', tricky: ['Multikicker can be paid any number of times.', 'A copy of a kicked spell is also kicked.'] });
m('Landwalk', 'keyword', '[Type]walk: can\'t be blocked as long as the defending player controls a land of that type.', { auto: 'manual', detect: '\\b(?:Plains|Island|Swamp|Mountain|Forest|Desert|Legendary land|Nonbasic land)walk\\b' });
m('Level up', 'keyword', 'Pay the level up cost: put a level counter on this (sorcery speed); its abilities change at each level band.', { auto: 'auto', actions: ['counter-other'] });
m('Living metal', 'keyword', 'As long as it\'s your turn, this Vehicle is also an artifact creature.', { auto: 'manual' });
m('Living weapon', 'keyword', 'When this Equipment enters, create a 0/0 black Phyrexian Germ token and attach this to it.', { auto: 'manual', actions: ['token', 'attach'] });
m('Madness', 'keyword', 'If you discard this card, you may exile it instead and cast it for its madness cost.', { auto: 'auto', actions: ['exile'] });
m('Melee', 'keyword', 'Whenever this attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.', { auto: 'manual', actions: ['pt'] });
m('Mentor', 'keyword', 'Whenever this attacks, put a +1/+1 counter on target attacking creature with lesser power.', { auto: 'manual', actions: ['counter+'] });
m('Miracle', 'keyword', 'If this is the first card you drew this turn, you may reveal it and cast it for its miracle cost.', { auto: 'manual' });
m('Modular', 'keyword', 'Enters with N +1/+1 counters; when it dies, you may put its +1/+1 counters on target artifact creature.', { auto: 'manual', actions: ['counter+'] });
m('More Than Meets the Eye', 'keyword', 'You may cast this converted (back face up) for its More Than Meets the Eye cost.', { auto: 'manual', actions: ['transform'] });
m('Morph', 'keyword', 'Cast face down for {3} as a 2/2 with no name or abilities; turn face up any time for the morph cost.', { auto: 'auto', rules: ['Turning face up is a special action: no stack, can\'t be responded to.', 'Megamorph also puts a +1/+1 counter on it when turned up.'] });
m('Megamorph', 'keyword', 'Like morph; when turned face up it also gets a +1/+1 counter.', { auto: 'auto' });
m('Mutate', 'keyword', 'Cast for the mutate cost targeting a non-Human creature you own: it merges with that creature, on top or underneath, and becomes one creature with all abilities.', { auto: 'manual', steps: 'Choose top or bottom. The merged creature uses the top card\'s name and P/T and has every card\'s abilities; it is one creature.', actions: ['attach'] });
m('Myriad', 'keyword', 'Whenever this attacks, for each other opponent, you may create a token copy attacking that player; exile the tokens at end of combat.', { auto: 'manual', actions: ['copy-token'] });
m('Ninjutsu', 'keyword', 'Pay the cost and return an unblocked attacker you control to hand: put this onto the battlefield tapped and attacking.', { auto: 'auto' });
m('Commander ninjutsu', 'keyword', 'Ninjutsu that also works from the command zone.', { auto: 'partial' });
m('Offering', 'keyword', 'You may cast this as though it had flash by sacrificing a creature of the type and paying the difference in costs.', { auto: 'manual', actions: ['sacrifice'] });
m('Offspring', 'keyword', 'You may pay the offspring cost; when this enters, create a 1/1 token copy of it.', { auto: 'manual', actions: ['copy-token'] });
m('Outlast', 'keyword', 'Pay and tap: put a +1/+1 counter on this. Sorcery speed.', { auto: 'manual', actions: ['counter+', 'tap'] });
m('Overload', 'keyword', 'Cast for the overload cost and change "target" to "each".', { auto: 'auto' });
m('Partner', 'keyword', 'You can have two commanders if both have partner.', { auto: 'auto', rules: ['"Partner with [name]" pairs only with that card and lets you search for it when it enters.', 'Friends forever, Doctor\'s companion and Choose a Background are related pairing rules.'] });
m('Persist', 'keyword', 'When this dies, if it had no -1/-1 counters on it, return it with a -1/-1 counter.', { auto: 'auto' });
m('Phasing', 'keyword', 'At your untap step it phases out (treated as though it doesn\'t exist) or phases in.', { auto: 'manual', tricky: ['Phasing out doesn\'t trigger leaves-the-battlefield; Auras and Equipment phase with it.'], actions: ['status'] });
m('Plot', 'keyword', 'Pay the plot cost and exile this card from your hand; cast it free on a later turn as a sorcery.', { auto: 'manual', actions: ['exile'] });
m('Poisonous', 'keyword', 'Poisonous N: whenever this deals combat damage to a player, that player gets N poison counters.', { auto: 'manual', actions: ['poison'] });
m('Prototype', 'keyword', 'Cast for the prototype cost with smaller P/T and a different color.', { auto: 'manual' });
m('Provoke', 'keyword', 'Whenever this attacks, you may have target creature defending player controls untap and block it if able.', { auto: 'manual', actions: ['untap'] });
m('Prowess', 'keyword', 'Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.', { auto: 'auto' });
m('Prowl', 'keyword', 'You may cast this for its prowl cost if you dealt combat damage to a player this turn with a creature of its type.', { auto: 'manual' });
m('Rampage', 'keyword', 'Rampage N: whenever this becomes blocked, it gets +N/+N for each creature blocking it beyond the first.', { auto: 'manual', actions: ['pt'] });
m('Ravenous', 'keyword', 'Enters with X +1/+1 counters; if X is 5 or more, draw a card when it enters.', { auto: 'manual', actions: ['counter+', 'draw'] });
m('Read ahead', 'keyword', 'As this Saga enters, choose a chapter to start on.', { auto: 'manual' });
m('Rebound', 'keyword', 'If cast from your hand, exile it as it resolves; at your next upkeep you may cast it from exile free.', { auto: 'auto', actions: ['exile'] });
m('Reconfigure', 'keyword', 'Attach this to target creature you control, or unattach it. While attached it isn\'t a creature. Sorcery speed.', { auto: 'manual', actions: ['attach'] });
m('Recover', 'keyword', 'When a creature is put into your graveyard, you may pay the recover cost to return this card to your hand; otherwise exile it.', { auto: 'manual', actions: ['return-hand', 'exile'] });
m('Reinforce', 'keyword', 'Discard this card and pay: put N +1/+1 counters on target creature.', { auto: 'manual', actions: ['counter+', 'discard'] });
m('Renown', 'keyword', 'When this deals combat damage to a player, if it isn\'t renowned, put N +1/+1 counters on it; it becomes renowned.', { auto: 'manual', actions: ['counter+'] });
m('Replicate', 'keyword', 'Pay the replicate cost any number of times; copy the spell that many times.', { auto: 'manual' });
m('Retrace', 'keyword', 'Cast this from your graveyard by discarding a land card in addition to its cost.', { auto: 'auto', actions: ['discard'] });
m('Riot', 'keyword', 'Enters with your choice of a +1/+1 counter or haste.', { auto: 'auto', actions: ['counter+'] });
m('Ripple', 'keyword', 'When you cast this, reveal the top N cards; you may cast cards with the same name free; the rest go to the bottom.', { auto: 'manual' });
m('Saddle', 'keyword', 'Tap creatures with total power N or more: this Mount becomes saddled until end of turn. Sorcery speed.', { auto: 'manual', actions: ['tap', 'status'] });
m('Scavenge', 'keyword', 'Exile this card from your graveyard and pay: put +1/+1 counters equal to its power on target creature. Sorcery speed.', { auto: 'auto', actions: ['exile', 'counter+'] });
m('Shadow', 'keyword', 'Can block or be blocked only by creatures with shadow.', { auto: 'auto' });
m('Skulk', 'keyword', 'Can\'t be blocked by creatures with greater power.', { auto: 'auto' });
m('Soulbond', 'keyword', 'Pair this with another unpaired creature when either enters; both get the listed bonus while paired.', { auto: 'manual', actions: ['status'] });
m('Soulshift', 'keyword', 'Soulshift N: when this dies, return target Spirit card with mana value N or less from your graveyard to your hand.', { auto: 'manual', actions: ['return-hand'] });
m('Spectacle', 'keyword', 'You may cast this for its spectacle cost if an opponent lost life this turn.', { auto: 'manual' });
m('Splice', 'keyword', 'Splice onto [type]: reveal this as you cast a spell of that type and pay the cost to add this card\'s effect to it.', { auto: 'manual' });
m('Split second', 'keyword', 'While this is on the stack, players can\'t cast spells or activate non-mana abilities.', { auto: 'manual' });
m('Spree', 'keyword', 'Choose one or more modes, paying each chosen mode\'s additional cost.', { auto: 'manual' });
m('Squad', 'keyword', 'Pay the squad cost any number of times as you cast this; when it enters, create that many token copies.', { auto: 'manual', actions: ['copy-token'] });
m('Storm', 'keyword', 'When you cast this, copy it for each spell cast before it this turn. Copies may choose new targets.', { auto: 'auto' });
m('Sunburst', 'keyword', 'Enters with a +1/+1 counter (or charge counter if not a creature) for each color of mana spent to cast it.', { auto: 'manual', actions: ['counter+', 'counter-other'] });
m('Surge', 'keyword', 'You may cast this for its surge cost if you or a teammate cast another spell this turn.', { auto: 'manual' });
m('Suspend', 'keyword', 'Pay the suspend cost and exile this from your hand with N time counters; remove one each upkeep; when the last is removed, cast it free (creatures get haste).', { auto: 'manual', actions: ['exile', 'counter-other'] });
m('Toxic', 'keyword', 'Toxic N: combat damage this deals to a player also gives them N poison counters.', { auto: 'auto' });
m('Training', 'keyword', 'Whenever this attacks with another creature with greater power, put a +1/+1 counter on this.', { auto: 'manual', actions: ['counter+'] });
m('Transfigure', 'keyword', 'Sacrifice this and pay: search for a creature card with the same mana value, put it onto the battlefield.', { auto: 'manual', actions: ['sacrifice', 'search'] });
m('Transmute', 'keyword', 'Discard this and pay: search for a card with the same mana value and put it in your hand. Sorcery speed.', { auto: 'manual', actions: ['discard', 'search'] });
m('Tribute', 'keyword', 'As this enters, an opponent may put N +1/+1 counters on it; if they don\'t, its tribute ability happens.', { auto: 'manual', actions: ['counter+'] });
m('Umbra armor', 'keyword', 'If the enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura. (Formerly totem armor.)', { auto: 'manual', detect: '\\b(?:Umbra|Totem) armor\\b', actions: ['destroy'] });
m('Undaunted', 'keyword', 'This spell costs {1} less for each opponent you have.', { auto: 'auto' });
m('Undying', 'keyword', 'When this dies, if it had no +1/+1 counters on it, return it with a +1/+1 counter.', { auto: 'auto' });
m('Unearth', 'keyword', 'Return this from your graveyard with haste; exile it at the next end step or if it would leave the battlefield. Sorcery speed.', { auto: 'auto', actions: ['return-battlefield', 'exile'] });
m('Unleash', 'keyword', 'You may have this enter with a +1/+1 counter; it can\'t block while it has one.', { auto: 'auto', actions: ['counter+'] });
m('Vanishing', 'keyword', 'Enters with N time counters; remove one at your upkeep; when the last is removed, sacrifice it.', { auto: 'manual', actions: ['counter-other', 'sacrifice'] });
m('Wither', 'keyword', 'Deals damage to creatures in the form of -1/-1 counters.', { auto: 'auto' });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Ability words (no rules meaning of their own — they label a condition)
// ─────────────────────────────────────────────────────────────────────────────────────────────
for (const [word, meaning] of [
  ['Landfall', 'Triggers whenever a land enters under your control.'],
  ['Constellation', 'Triggers whenever an enchantment enters under your control.'],
  ['Metalcraft', 'Works while you control three or more artifacts.'],
  ['Threshold', 'Works while seven or more cards are in your graveyard.'],
  ['Delirium', 'Works while four or more card types are among cards in your graveyard.'],
  ['Raid', 'Works if you attacked this turn.'],
  ['Revolt', 'Works if a permanent you controlled left the battlefield this turn.'],
  ['Ferocious', 'Works if you control a creature with power 4 or greater.'],
  ['Morbid', 'Works if a creature died this turn.'],
  ['Magecraft', 'Triggers whenever you cast or copy an instant or sorcery spell.'],
  ['Heroic', 'Triggers whenever you cast a spell that targets this creature.'],
  ['Coven', 'Works if you control three or more creatures with different powers.'],
  ['Domain', 'Counts the basic land types among lands you control.'],
  ['Hellbent', 'Works if you have no cards in hand.'],
  ['Formidable', 'Works if creatures you control have total power 8 or greater.'],
  ['Enrage', 'Triggers whenever this creature is dealt damage.'],
  ['Eerie', 'Triggers whenever an enchantment enters under your control or you fully unlock a Room.'],
  ['Survival', 'Triggers at the beginning of your second main phase if this creature is tapped.'],
  ['Valiant', 'Triggers the first time each turn this becomes the target of a spell or ability you control.'],
  ['Alliance', 'Triggers whenever another creature enters under your control.'],
  ['Adamant', 'Works if at least three mana of one color was spent to cast this.'],
  ['Battalion', 'Triggers whenever this and at least two other creatures attack.'],
  ['Bloodrush', 'Discard this card to give target attacking creature its bonus.'],
  ['Celebration', 'Works if two or more nonland permanents entered under your control this turn.'],
  ['Channel', 'Discard this card from your hand to use its channel ability.'],
  ['Cohort', 'Tap this and an untapped Ally you control for an effect.'],
  ['Corrupted', 'Works if an opponent has three or more poison counters.'],
  ['Descend', 'Counts permanent cards in your graveyard (descend 4 / descend 8).'],
  ['Fateful hour', 'Works if you have 5 or less life.'],
  ['Grandeur', 'Discard another card with the same name for an effect.'],
  ['Imprint', 'Remembers a card exiled with this permanent.'],
  ['Inspired', 'Triggers whenever this creature becomes untapped.'],
  ['Join forces', 'Each player may pay any amount of mana toward the effect.'],
  ['Kinship', 'At your upkeep, reveal the top card; if it shares a creature type, get the bonus.'],
  ['Lieutenant', 'Works if you control your commander.'],
  ['Parley', 'Each player reveals the top card of their library.'],
  ['Pack tactics', 'Works if you attacked with creatures with total power 6 or greater this combat.'],
  ['Radiance', 'Affects each permanent that shares a color with the target.'],
  ['Spell mastery', 'Works if two or more instants and/or sorceries are in your graveyard.'],
  ['Strive', 'This spell costs more for each target beyond the first.'],
  ['Sweep', 'Return any number of lands of a type to your hand for an effect.'],
  ['Tempting offer', 'Each opponent may accept the offer; you get the effect once more for each one who does.'],
  ['Undergrowth', 'Counts creature cards in your graveyard.'],
  ['Will of the council', 'Players vote; the option with the most votes (or tied) happens.'],
  ['Council\'s dilemma', 'Players vote; each vote gives its effect.'],
  ['Max speed', 'Works once your speed is 4 (speed rises by 1 the first time each turn an opponent loses life, during your turn).'],
  ['Start your engines!', 'You start with speed 1; your speed goes up once on each of your turns when an opponent loses life, to a maximum of 4.']
]) m(word, 'ability word', meaning, { auto: 'partial' });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Commander, multiplayer and designations
// ─────────────────────────────────────────────────────────────────────────────────────────────
m('Commander', 'commander', 'Your legendary creature (or eligible card) starts in the command zone and leads your deck.', { auto: 'auto', detect: null, rules: ['100-card singleton deck; every card within the commander\'s color identity.', 'You may cast your commander from the command zone; it costs {2} more for each previous time you cast it from there (commander tax).', 'If your commander is put into a graveyard or exile, its owner may move it to the command zone the next time state-based actions are checked.', 'If your commander would be put into your hand or library, you may put it into the command zone instead (a replacement).', '21 combat damage from a single commander makes a player lose.'], tricky: ['Because it reaches the graveyard first, "dies" triggers (yours and other players\' ) still happen before it moves to the command zone.', 'Commander damage counts damage dealt by the commander itself, even if another player controls it.', 'Commander tax counts only casts from the command zone.'] });
m('Commander tax', 'commander', 'Casting your commander from the command zone costs {2} more for each earlier cast from there.', { auto: 'auto', detect: null });
m('Commander damage', 'commander', '21 or more combat damage from one commander makes a player lose.', { auto: 'auto', detect: null });
m('Color identity', 'commander', 'All mana symbols in a card\'s cost and rules text, plus color indicators. Reminder text doesn\'t count.', { auto: 'auto', detect: null, tricky: ['Hybrid symbols count both colors.', 'A land\'s basic land type does not add identity unless it has a mana symbol in its text.'] });
m('Command zone', 'commander', 'Where commanders, emblems, the monarch-like designations\' cards and dungeons live.', { auto: 'auto', detect: null });
m('Background', 'commander', '"Choose a Background" lets a legendary creature pair with a legendary Background enchantment as a second commander.', { auto: 'auto', detect: '\\bChoose a Background\\b' });
m('Friends forever', 'commander', 'Two commanders with friends forever can be paired.', { auto: 'auto' });
m('Doctor\'s companion', 'commander', 'Pairs with a Doctor as a second commander.', { auto: 'auto' });
m('The monarch', 'designation', 'At the beginning of the monarch\'s end step, they draw a card. Dealing combat damage to the monarch makes you the monarch.', { auto: 'auto', detect: '\\b(?:the monarch|become the monarch)\\b', rules: ['Only one player is the monarch.', 'If the monarch leaves the game, the active player becomes the monarch (or the next player in turn order if the active player is leaving).'] });
m('The initiative', 'designation', 'When you take the initiative, venture into Undercity; at the beginning of your upkeep, venture again. Dealing combat damage to the player with the initiative takes it.', { auto: 'auto', detect: '\\binitiative\\b' });
m('City\'s blessing', 'designation', 'A permanent designation for the rest of the game (from ascend).', { auto: 'manual', detect: '\\bcity\'s blessing\\b', actions: ['status'] });
m('Day and night', 'designation', 'Once it becomes day, it alternates: if the active player casts no spells during their turn it becomes night; two or more spells in a turn makes it day.', { auto: 'manual', detect: '\\b(?:it becomes day|it becomes night|day|night)\\b', actions: ['status', 'transform'] });
m('Speed', 'designation', 'Players start at speed 1 when a card says "start your engines"; it rises to 4.', { auto: 'manual', detect: '\\bspeed\\b', actions: ['status'] });
m('Energy counters', 'counter', 'A resource players collect ({E}) and spend on costs.', { auto: 'auto', detect: '\\{E\\}', actions: ['counter-other'] });
m('Experience counters', 'counter', 'Counters a player collects that cards count.', { auto: 'manual', detect: '\\bexperience counter', actions: ['counter-other'] });
m('Poison counters', 'counter', 'A player with ten or more poison counters loses the game.', { auto: 'auto', detect: '\\bpoison counter', actions: ['poison'] });
m('Rad counters', 'counter', 'At the beginning of your precombat main phase, mill cards equal to your rad counters; lose 1 life and remove a rad counter for each nonland card milled.', { auto: 'manual', detect: '\\brad counter', actions: ['mill', 'life-loss', 'counter-other'] });
m('Ticket counters', 'counter', 'Counters spent to use Attractions (Un-sets).', { auto: 'manual', detect: '\\bticket counter', actions: ['counter-other'] });
m('Shield counters', 'counter', 'If a permanent with a shield counter would be dealt damage or destroyed, remove the counter instead.', { auto: 'auto', detect: '\\bshield counter' });
m('Stun counters', 'counter', 'If a permanent with a stun counter would become untapped, remove the counter instead.', { auto: 'manual', detect: '\\bstun counter', actions: ['counter-other'] });
m('Keyword counters', 'counter', 'Counters that grant a keyword (flying, deathtouch, lifelink, etc.) while on the permanent.', { auto: 'partial', detect: '\\b(?:flying|first strike|double strike|deathtouch|hexproof|indestructible|lifelink|menace|reach|trample|vigilance) counter', actions: ['counter-other'] });
m('Lore counters', 'counter', 'Count a Saga\'s chapters.', { auto: 'auto', detect: '\\blore counter' });
m('Loyalty', 'counter', 'Planeswalkers enter with loyalty counters and spend them on abilities; one loyalty ability per planeswalker per turn, sorcery speed.', { auto: 'auto', detect: null });
m('Defense counters', 'counter', 'Battles enter with defense counters; damage removes them; at zero the battle is defeated (Sieges are then cast transformed).', { auto: 'manual', detect: '\\bdefense counter', actions: ['damage', 'counter-other'] });
m('Goaded', 'designation', 'See goad.', { auto: 'auto', detect: '\\bgoaded\\b' });
m('Monstrous', 'designation', 'Set by monstrosity.', { auto: 'manual', detect: '\\bmonstrous\\b' });
m('Renowned', 'designation', 'Set by renown.', { auto: 'manual', detect: '\\brenowned\\b' });
m('Suspected', 'designation', 'Has menace and can\'t block.', { auto: 'manual', detect: '\\bsuspected\\b' });
m('Saddled', 'designation', 'A Mount that was saddled this turn.', { auto: 'manual', detect: '\\bsaddled\\b' });
m('Ring-bearer', 'designation', 'The creature chosen when the Ring tempts you.', { auto: 'manual', detect: '\\bRing-bearer\\b' });
m('Voting and council', 'multiplayer', 'Will of the council and council\'s dilemma votes include every player, starting with the caster.', { auto: 'manual', detect: null });
m('Range of influence', 'multiplayer', 'Limited range of influence: players outside it are not affected. Not used in standard Commander.', { auto: 'info', detect: null });
m('Leaving the game', 'multiplayer', 'When a player loses, everything they own leaves the game, and effects that gave them control end.', { auto: 'auto', detect: null, rules: ['Spells and abilities they controlled on the stack are removed.', 'If they were the monarch, a new monarch is chosen; if they had the initiative, the active player takes it.'] });
m('Wishes (outside the game)', 'commander', 'Cards that get cards "from outside the game" only work if the table allows a sideboard/wish pile.', { auto: 'manual', detect: '\\boutside the game\\b' });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Card types, layouts and special cards
// ─────────────────────────────────────────────────────────────────────────────────────────────
m('Saga', 'type', 'An enchantment with chapter abilities: a lore counter as it enters and after your draw step; each chapter triggers; sacrifice after the last.', { auto: 'auto', detect: '\\bSaga\\b' });
m('Adventure', 'layout', 'Cast the Adventure half (instant/sorcery); it goes to exile and you may cast the creature later from exile.', { auto: 'auto', detect: null });
m('Split card', 'layout', 'Two spells on one card; cast one half (or both with fuse).', { auto: 'partial', detect: null, rules: ['Its mana value off the stack is the sum of both halves.'] });
m('Modal double-faced card', 'layout', 'Choose a face to play from your hand; the other face is ignored.', { auto: 'auto', detect: null });
m('Transforming double-faced card', 'layout', 'Enters front face up; transforms back and forth when an effect says so.', { auto: 'partial', detect: null });
m('Flip card', 'layout', 'A Kamigawa card that turns upside down when it flips; same object.', { auto: 'manual', detect: null, actions: ['transform'] });
m('Room', 'type', 'An enchantment with two doors; cast one door; unlock the other later by paying its cost.', { auto: 'manual', detect: '\\bunlock\\b', actions: ['status'] });
m('Class', 'type', 'An enchantment with levels gained by paying level costs at sorcery speed.', { auto: 'auto', detect: '\\bClass\\b', actions: ['counter-other'] });
m('Case', 'type', 'An enchantment that becomes solved at the end step when its condition is met, turning on its "solved" ability.', { auto: 'manual', detect: '\\bTo solve\\b', actions: ['status'] });
m('Battle', 'type', 'A permanent that enters with defense counters and is attacked; when defeated, its protector\'s opponent gets the reward.', { auto: 'manual', detect: '\\bBattle\\b', actions: ['damage', 'counter-other'] });
m('Vehicle', 'type', 'An artifact that becomes a creature when crewed.', { auto: 'auto', detect: '\\bVehicle\\b', actions: ['tap'] });
m('Equipment', 'type', 'An artifact you attach to creatures with equip.', { auto: 'auto', detect: '\\bEquipment\\b' });
m('Aura', 'type', 'An enchantment attached to what it enchants.', { auto: 'partial', detect: '\\bAura\\b' });
m('Token', 'type', 'A permanent made by an effect. It ceases to exist outside the battlefield.', { auto: 'auto', detect: '\\btoken\\b' });
m('Treasure', 'type', 'An artifact token: "{T}, Sacrifice this: Add one mana of any color."', { auto: 'auto', detect: '\\bTreasure\\b', actions: ['token'] });
m('Food', 'type', 'An artifact token: "{2}, {T}, Sacrifice this: You gain 3 life."', { auto: 'auto', detect: '\\bFood\\b', actions: ['token'] });
m('Clue', 'type', 'An artifact token: "{2}, Sacrifice this: Draw a card."', { auto: 'auto', detect: '\\bClue\\b', actions: ['token'] });
m('Blood', 'type', 'An artifact token: "{1}, {T}, Discard a card, Sacrifice this: Draw a card."', { auto: 'manual', detect: '\\bBlood token', actions: ['token'] });
m('Map', 'type', 'An artifact token: "{1}, {T}, Sacrifice this: Target creature you control explores. Sorcery speed."', { auto: 'manual', detect: '\\bMap token', actions: ['token'] });
m('Powerstone', 'type', 'An artifact token: "{T}: Add {C}. This mana can\'t be spent to cast a nonartifact spell." Enters tapped.', { auto: 'manual', detect: '\\bPowerstone\\b', actions: ['token'] });
m('Incubator', 'type', 'An artifact token that transforms into a Phyrexian artifact creature.', { auto: 'manual', detect: '\\bIncubator\\b', actions: ['token', 'transform'] });
m('Dungeon', 'type', 'A card in the command zone you move through room by room with venture.', { auto: 'auto', detect: '\\bdungeon\\b' });
m('Conspiracy', 'type', 'Draft-only cards that start the game in the command zone.', { auto: 'manual', detect: null });
m('Contraption and Attraction', 'type', 'Un-set artifact decks (Contraptions assemble; Attractions are visited on die rolls).', { auto: 'manual', detect: '\\b(?:Contraption|Attraction)\\b' });
m('Stickers', 'type', 'Un-set: put stickers on cards to change names, abilities or power.', { auto: 'manual', detect: '\\bsticker\\b' });
m('Die rolling', 'action', 'Roll a die with the stated number of sides; "roll a d20" etc.', { auto: 'manual', detect: '\\broll (?:a|two) d\\d+', steps: 'Roll the die (a real one, or the dice in the tools) and apply the row that matches.', actions: [] });
m('Coin flips', 'action', 'Flip a coin; "win the flip" if it matches your call.', { auto: 'manual', detect: '\\bflip a coin\\b', actions: [] });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Lookup helpers for the engine and the guided resolution screen
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const MECHANICS = E;
const COMPILED = E.filter(e => e.detect).map(e => ({ entry: e, re: new RegExp(e.detect, 'i') }));

function clean(text) {
  // Reminder text explains a mechanic; it is not part of the card's rules.
  return String(text || '').replace(/\([^()]*\)/g, ' ');
}

/** Every term the text mentions (reminder text ignored). Most specific (keywords, actions) first. */
export function mechanicsIn(text) {
  const t = clean(text);
  const order = { keyword: 0, action: 1, designation: 2, counter: 3, type: 4, layout: 5, 'ability word': 6, commander: 7, multiplayer: 8, concept: 9 };
  return COMPILED.filter(({ re }) => re.test(t)).map(x => x.entry).sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
}

export function mechanicByName(name) {
  const n = String(name || '').toLowerCase();
  return E.find(e => e.name.toLowerCase() === n || e.id === n) || null;
}

// Verbs in rules text → the quick actions that do them.
const VERBS = [
  [/\bdestroys?\b/i, ['destroy']], [/\bexiles?\b/i, ['exile']], [/\breturn [^.]*? to (?:its|their) owner'?s? hands?\b/i, ['bounce']],
  [/\breturn [^.]*? from [^.]*? graveyard to (?:your|its owner'?s|their owner'?s?) hand\b/i, ['return-hand']],
  [/\b(?:return|put) [^.]*? from [^.]*? graveyard (?:to|onto) the battlefield\b/i, ['return-battlefield']],
  [/\buntap\b/i, ['untap']], [/(?:^|[^n])\btap\b/i, ['tap']],
  [/\+1\/\+1 counter/i, ['counter+']], [/-1\/-1 counter/i, ['counter-']], [/\bcounters? on\b/i, ['counter-other']],
  [/\bdeals? [^.]*?damage\b/i, ['damage']], [/\bgain control\b/i, ['gain-control']], [/\bsacrifices?\b/i, ['sacrifice']],
  [/\bgains? [^.]*?life\b/i, ['life-gain']], [/\blos(?:e|es) [^.]*?life\b/i, ['life-loss']],
  [/\bdraws?\b/i, ['draw']], [/\bdiscards?\b/i, ['discard']], [/\bmills?\b/i, ['mill']], [/\bpoison counter/i, ['poison']],
  [/\bcreate\b[^.]*\btoken\b/i, ['token']], [/\bcopy of\b/i, ['copy-token']], [/\bcounter target (?:spell|activated|triggered)/i, ['counter-spell']],
  [/\bshuffles?\b/i, ['shuffle']], [/\bput (?:it|that card|them) onto the battlefield\b/i, ['return-battlefield']], [/\bsearch\b/i, ['search']], [/\b[+-]\d+\/[+-]\d+\b/, ['pt']], [/\battach\b/i, ['attach']], [/\bscry\b/i, ['scry']],
  [/\btransform\b/i, ['transform']], [/\b(?:monarch|initiative|city's blessing)\b/i, ['status']]
];

/** The quick actions worth offering for this text: from its verbs, then from the mechanics it uses. */
export function guidedActionsFor(text) {
  const t = clean(text), out = new Set();
  for (const [re, ids] of VERBS) if (re.test(t)) ids.forEach(id => out.add(id));
  for (const e of mechanicsIn(t)) e.actions.forEach(id => out.add(id));
  return [...out];
}

/** One short instruction for resolving this text by hand: the most specific mechanic's steps. */
export function guidedHintFor(text) {
  const hit = mechanicsIn(text).find(e => e.steps && e.automation !== 'auto');
  return hit ? { name: hit.name, steps: hit.steps } : null;
}
