// Test cards for the mechanics the engine automates (kicker, flashback, cascade, …). Real card
// names and Oracle text, Scryfall-shaped. Used by the five-color "lab" deck in the node tests.

const IMG = name => ({ small: `fixture://${encodeURIComponent(name)}`, normal: `fixture://${encodeURIComponent(name)}`, art_crop: `fixture://${encodeURIComponent(name)}` });
let n = 0;
function cmc(cost) { return (cost.match(/\{([^}]+)\}/g) || []).reduce((sum, s) => sum + (/\d+/.test(s) ? Number(s.match(/\d+/)[0]) : /X/.test(s) ? 0 : 1), 0); }
export function labCard(name, mana_cost, type_line, oracle_text, extra = {}) {
  n += 1;
  const colors = [...new Set((String(mana_cost).match(/[WUBRG]/g) || []))];
  return {
    id: `lab-${String(n).padStart(3, '0')}`, name, mana_cost, type_line, oracle_text,
    colors: extra.colors || colors, color_identity: extra.color_identity || colors, keywords: extra.keywords || [],
    power: extra.power ?? null, toughness: extra.toughness ?? null, loyalty: extra.loyalty ?? null,
    cmc: extra.cmc ?? cmc(mana_cost), layout: extra.layout || 'normal',
    set: 'lab', set_name: 'Lab', collector_number: String(n), rarity: 'common', lang: 'en',
    scryfall_uri: '', legalities: { commander: 'legal' }, image_uris: IMG(name), ...(extra.raw || {})
  };
}
const c = (name, cost, sub, text, p, t, keywords = []) => labCard(name, cost, `Creature — ${sub}`, text, { power: String(p), toughness: String(t), keywords });

export const LAB_CARDS = [
  labCard('The Ur-Dragon', '{4}{W}{U}{B}{R}{G}', 'Legendary Creature — Dragon Avatar', 'Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.', { power: '10', toughness: '10', keywords: ['Flying'] }),
  labCard('Chaos Warp', '{2}{R}', 'Instant', 'The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it\'s a permanent card, they put it onto the battlefield.'),
  c('Gladecover Scout', '{G}', 'Elf Scout', 'Hexproof (This creature can\'t be the target of spells or abilities your opponents control.)', 1, 1, ['Hexproof']),
  // Alternative and additional costs
  labCard('Burst Lightning', '{R}', 'Instant', 'Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.', { keywords: ['Kicker'] }),
  labCard('Think Twice', '{1}{U}', 'Instant', 'Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)', { keywords: ['Flashback'] }),
  labCard('Whispers of the Muse', '{U}', 'Instant', 'Buyback {5} (You may pay an additional {5} as you cast this spell. Put this card into your hand as it resolves.)\nDraw a card.', { keywords: ['Buyback'] }),
  c('Underworld Rage-Hound', '{1}{R}', 'Elemental Dog', 'Underworld Rage-Hound attacks each combat if able.\nEscape—{3}{R}, Exile three other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)\nUnderworld Rage-Hound escapes with a +1/+1 counter on it.', 3, 1, ['Escape']),
  c('Mardu Scout', '{R}{R}', 'Goblin Scout', 'Dash {1}{R} (You may cast this spell for its dash cost. If you do, it gains haste, and it\'s returned from the battlefield to its owner\'s hand at the beginning of the next end step.)', 1, 1, ['Dash']),
  labCard('Cyclonic Rift', '{1}{U}', 'Instant', 'Return target nonland permanent you don\'t control to its owner\'s hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")', { keywords: ['Overload'] }),
  labCard('Saw It Coming', '{1}{U}{U}', 'Instant', 'Counter target spell.\nForetell {1}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)', { keywords: ['Foretell'] }),
  labCard('Stoke the Flames', '{2}{R}{R}', 'Instant', 'Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature\'s color.)\nStoke the Flames deals 4 damage to any target.', { keywords: ['Convoke'] }),
  labCard('Treasure Cruise', '{7}{U}', 'Sorcery', 'Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nDraw three cards.', { keywords: ['Delve'] }),
  c('Exalted Angel', '{4}{W}{W}', 'Angel', 'Flying, lifelink\nMorph {2}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)', 4, 5, ['Flying', 'Lifelink', 'Morph']),
  labCard('Frogmite', '{4}', 'Artifact Creature — Frog', 'Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)', { power: '2', toughness: '2', keywords: ['Affinity'] }),
  labCard('Bonecrusher Giant', '{2}{R}', 'Creature — Giant', 'Whenever Bonecrusher Giant becomes the target of a spell, Bonecrusher Giant deals 2 damage to that spell\'s controller.', { power: '4', toughness: '3', layout: 'adventure', raw: { mana_cost: '{2}{R} // {1}{R}', card_faces: [
    { name: 'Bonecrusher Giant', mana_cost: '{2}{R}', type_line: 'Creature — Giant', oracle_text: 'Whenever Bonecrusher Giant becomes the target of a spell, Bonecrusher Giant deals 2 damage to that spell\'s controller.', power: '4', toughness: '3', colors: ['R'] },
    { name: 'Stomp', mana_cost: '{1}{R}', type_line: 'Instant — Adventure', oracle_text: 'Damage can\'t be prevented this turn. Stomp deals 2 damage to any target.', colors: ['R'] }] } }),
  // Keyword triggers
  c('Bloodbraid Elf', '{2}{R}{G}', 'Elf Berserker', 'Cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom of your library in a random order.)\nHaste', 3, 2, ['Cascade', 'Haste']),
  labCard('Grapeshot', '{1}{R}', 'Sorcery', 'Grapeshot deals 1 damage to any target.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)', { keywords: ['Storm'] }),
  c('Ninja of the Deep Hours', '{3}{U}', 'Human Ninja', 'Ninjutsu {1}{U} ({1}{U}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever Ninja of the Deep Hours deals combat damage to a player, you may draw a card.', 2, 2, ['Ninjutsu']),
  labCard('Renewed Faith', '{2}{W}', 'Instant', 'You gain 6 life.\nCycling {1}{W} ({1}{W}, Discard this card: Draw a card.)\nWhen you cycle Renewed Faith, you may gain 2 life.', { keywords: ['Cycling'] }),
  c('Young Wolf', '{G}', 'Wolf', 'Undying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner\'s control with a +1/+1 counter on it.)', 1, 1, ['Undying']),
  c('Kitchen Finks', '{1}{G/W}{G/W}', 'Ouphe', 'When Kitchen Finks enters, you gain 2 life.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner\'s control with a -1/-1 counter on it.)', 3, 2, ['Persist']),
  c('Monastery Swiftspear', '{R}', 'Human Monk', 'Haste\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)', 1, 2, ['Haste', 'Prowess']),
  labCard('History of Benalia', '{1}{W}{W}', 'Legendary Enchantment — Saga', '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn.'),
  // Designations
  labCard('Queen Marchesa', '{1}{R}{W}{B}', 'Legendary Creature — Human Assassin', 'Deathtouch, haste\nWhen Queen Marchesa enters, you become the monarch.\nAt the beginning of your upkeep, if an opponent is the monarch, create a 1/1 black Assassin creature token with deathtouch and haste.', { power: '3', toughness: '3', keywords: ['Deathtouch', 'Haste'] }),
  c('Aarakocra Sneak', '{3}{U}', 'Bird Rogue', 'Flying\nWhen Aarakocra Sneak enters, you take the initiative.', 1, 4, ['Flying']),
  // Replacement and static effects
  labCard('Doubling Season', '{4}{G}', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.'),
  labCard('Rest in Peace', '{1}{W}', 'Enchantment', 'When Rest in Peace enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.'),
  labCard('Thalia, Guardian of Thraben', '{1}{W}', 'Legendary Creature — Human Soldier', 'First strike\nNoncreature spells cost {1} more to cast.', { power: '2', toughness: '1', keywords: ['First strike'] }),
  labCard('Kappa Cannoneer', '{5}{U}', 'Artifact Creature — Turtle Warrior', 'Improvise (Your artifacts can help cast this spell. Each artifact you tap after you\'re done activating mana abilities pays for {1}.)\nWard {4} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {4}.)\nWhenever an artifact you control enters, put a +1/+1 counter on Kappa Cannoneer and it can\'t be blocked this turn.', { power: '4', toughness: '4', keywords: ['Improvise', 'Ward'] }),
  c('Riveteers Requisitioner', '{1}{R}', 'Human Rogue', 'When this creature dies, create a Treasure token.\nBlitz {2}{R} (If you cast this spell for its blitz cost, it gains haste and "When this creature dies, draw a card." Sacrifice it at the beginning of the next end step.)', 2, 1, ['Blitz']),
  c('Akrasan Squire', '{W}', 'Human Soldier', 'Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)', 1, 1, ['Exalted']),
  labCard('Shivan Whelp', '{2}{R}', 'Creature — Dragon', 'Flying', { power: '2', toughness: '2', keywords: ['Flying'] })
];

export const LAB_LIST = names => names;
