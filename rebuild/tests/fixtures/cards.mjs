// Scryfall-shaped card fixtures for tests. The test environment cannot reach Scryfall,
// so both the node tests and the Playwright route mocks read from this list.

const IMG = name => ({ small: `fixture://${encodeURIComponent(name)}`, normal: `fixture://${encodeURIComponent(name)}`, art_crop: `fixture://${encodeURIComponent(name)}` });
let n = 0;
function card(name, mana_cost, type_line, oracle_text, extra = {}) {
  n += 1;
  const colors = [...new Set((mana_cost.match(/[WUBRG]/g) || []))];
  return {
    id: `fx-${String(n).padStart(3, '0')}`, name, mana_cost, type_line, oracle_text,
    colors, color_identity: extra.color_identity || colors, keywords: extra.keywords || [],
    power: extra.power ?? null, toughness: extra.toughness ?? null,
    cmc: (mana_cost.match(/\{([^}]+)\}/g) || []).reduce((sum, s) => sum + (/\d+/.test(s) ? Number(s.match(/\d+/)[0]) : 1), 0),
    set: 'fix', set_name: 'Fixtures', collector_number: String(n), rarity: 'common', lang: 'en',
    scryfall_uri: '', legalities: { commander: 'legal' }, image_uris: IMG(name), ...(extra.raw || {})
  };
}
const creature = (name, cost, sub, text, p, t, keywords = []) => card(name, cost, `Creature — ${sub}`, text, { power: String(p), toughness: String(t), keywords });
const legend = (name, cost, sub, text, p, t, keywords = []) => card(name, cost, `Legendary Creature — ${sub}`, text, { power: String(p), toughness: String(t), keywords });

export const CARDS = [
  card('Plains', '', 'Basic Land — Plains', '({T}: Add {W}.)', { color_identity: ['W'] }),
  card('Island', '', 'Basic Land — Island', '({T}: Add {U}.)', { color_identity: ['U'] }),
  card('Swamp', '', 'Basic Land — Swamp', '({T}: Add {B}.)', { color_identity: ['B'] }),
  card('Mountain', '', 'Basic Land — Mountain', '({T}: Add {R}.)', { color_identity: ['R'] }),
  card('Forest', '', 'Basic Land — Forest', '({T}: Add {G}.)', { color_identity: ['G'] }),
  card('Command Tower', '', 'Land', "{T}: Add one mana of any color in your commander's color identity."),
  card('Badlands', '', 'Land — Swamp Mountain', '({T}: Add {B} or {R}.)', { color_identity: ['B', 'R'] }),
  card('Evolving Wilds', '', 'Land', '{T}, Sacrifice Evolving Wilds: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.'),
  card('Sol Ring', '{1}', 'Artifact', '{T}: Add {C}{C}.'),
  card('Arcane Signet', '{2}', 'Artifact', "{T}: Add one mana of any color in your commander's color identity."),
  card('Mind Stone', '{2}', 'Artifact', '{T}: Add {C}.\n{1}, {T}, Sacrifice Mind Stone: Draw a card.'),
  creature('Llanowar Elves', '{G}', 'Elf Druid', '{T}: Add {G}.', 1, 1),
  creature('Grizzly Bears', '{1}{G}', 'Bear', '', 2, 2),
  creature('Serra Angel', '{3}{W}{W}', 'Angel', 'Flying, vigilance', 4, 4, ['Flying', 'Vigilance']),
  creature('White Knight', '{W}{W}', 'Human Knight', 'First strike', 2, 2, ['First strike']),
  creature('Fencing Ace', '{1}{W}', 'Human Soldier', 'Double strike', 1, 1, ['Double strike']),
  creature('Vampire Nighthawk', '{1}{B}{B}', 'Vampire Shaman', 'Flying, deathtouch, lifelink', 2, 3, ['Flying', 'Deathtouch', 'Lifelink']),
  creature('Elvish Visionary', '{1}{G}', 'Elf Shaman', 'When Elvish Visionary enters the battlefield, draw a card.', 1, 1),
  creature('Mulldrifter', '{4}{U}', 'Elemental', 'Flying\nWhen Mulldrifter enters the battlefield, draw two cards.', 2, 2, ['Flying']),
  creature('Raging Goblin', '{R}', 'Goblin Berserker', 'Haste', 1, 1, ['Haste']),
  creature('Wall of Omens', '{1}{W}', 'Wall', 'Defender\nWhen Wall of Omens enters the battlefield, draw a card.', 0, 4, ['Defender']),
  creature('Soul Warden', '{W}', 'Human Cleric', 'Whenever another creature enters the battlefield, you gain 1 life.', 1, 1),
  creature('Simian Spirit Guide', '{2}{R}', 'Ape Spirit', 'Exile Simian Spirit Guide from your hand: Add {R}.', 2, 2),
  creature('Colossal Dreadmaw', '{4}{G}{G}', 'Dinosaur', 'Trample', 6, 6, ['Trample']),
  creature('Air Elemental', '{3}{U}{U}', 'Elemental', 'Flying', 4, 4, ['Flying']),
  creature('Gravedigger', '{3}{B}', 'Zombie', 'When Gravedigger enters the battlefield, you may return target creature card from your graveyard to your hand.', 2, 2),
  card('Lightning Bolt', '{R}', 'Instant', 'Lightning Bolt deals 3 damage to any target.'),
  card('Shock', '{R}', 'Instant', 'Shock deals 2 damage to any target.'),
  card('Counterspell', '{U}{U}', 'Instant', 'Counter target spell.'),
  card('Giant Growth', '{G}', 'Instant', 'Target creature gets +3/+3 until end of turn.'),
  card('Divination', '{2}{U}', 'Sorcery', 'Draw two cards.'),
  card('Cultivate', '{2}{G}', 'Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.'),
  card('Rampant Growth', '{1}{G}', 'Sorcery', 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.'),
  card('Day of Judgment', '{2}{W}{W}', 'Sorcery', 'Destroy all creatures.'),
  card('Murder', '{1}{B}{B}', 'Instant', 'Destroy target creature.'),
  card('Naturalize', '{1}{G}', 'Instant', 'Destroy target artifact or enchantment.'),
  card('Reanimate', '{B}', 'Sorcery', 'Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.'),
  card('Opt', '{U}', 'Instant', 'Scry 1.\nDraw a card.'),
  card('Swords to Plowshares', '{W}', 'Instant', 'Exile target creature. Its controller gains life equal to its power.'),
  card('Mind Rot', '{2}{B}', 'Sorcery', 'Target player discards two cards.'),
  card('Raise Dead', '{B}', 'Sorcery', 'Return target creature card from your graveyard to your hand.'),
  card('Dragon Fodder', '{1}{R}', 'Sorcery', 'Create two 1/1 red Goblin creature tokens.'),
  card('Swiftfoot Boots', '{2}', 'Artifact — Equipment', 'Equipped creature has hexproof and haste.\nEquip {1}'),
  card('Bonesplitter', '{1}', 'Artifact — Equipment', 'Equipped creature gets +2/+0.\nEquip {1}'),
  card('Holy Strength', '{W}', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature gets +1/+2.'),
  card('Glorious Anthem', '{1}{W}{W}', 'Enchantment', 'Creatures you control get +1/+1.'),
  card("Healer's Hawk", '{W}', 'Creature — Bird', 'Flying, lifelink', { power: '1', toughness: '1', keywords: ['Flying', 'Lifelink'] }),
  card('Fog Bank', '{1}{U}', 'Creature — Wall', 'Defender, flying\nPrevent all combat damage that would be dealt to and dealt by Fog Bank.', { power: '0', toughness: '2', keywords: ['Defender', 'Flying'] }),
  card('Storm the Vault Oddity', '{2}{R}', 'Sorcery', 'Each player sacrifices a land unless the moon is full, then everyone votes.'),
  legend('Isamaru, Hound of Konda', '{W}', 'Dog', '', 2, 2),
  legend('Tatyova, Benthic Druid', '{3}{G}{U}', 'Merfolk Druid', 'Landfall — Whenever a land enters the battlefield under your control, you gain 1 life and draw a card.', 3, 3),
  legend('Lyzolda, the Blood Witch', '{1}{B}{R}', 'Human Cleric', '{2}, Sacrifice a creature: Lyzolda, the Blood Witch deals 2 damage to any target if the sacrificed creature was red. Draw a card if the sacrificed creature was black.', 3, 1),
  legend('Zada, Hedron Grinder', '{3}{R}', 'Goblin Ally', '', 3, 3),
  {
    ...card('Bala Ged Recovery // Bala Ged Sanctuary', '{2}{G}', 'Sorcery // Land', '', { color_identity: ['G'] }),
    image_uris: undefined,
    card_faces: [
      { name: 'Bala Ged Recovery', mana_cost: '{2}{G}', type_line: 'Sorcery', oracle_text: 'Return target card from your graveyard to your hand.', colors: ['G'], image_uris: IMG('Bala Ged Recovery') },
      { name: 'Bala Ged Sanctuary', mana_cost: '', type_line: 'Land', oracle_text: 'Bala Ged Sanctuary enters the battlefield tapped.\n{T}: Add {G}.', colors: [], image_uris: IMG('Bala Ged Sanctuary') }
    ]
  }
];

export const BY_NAME = new Map(CARDS.flatMap(c => [[c.name.toLowerCase(), c], ...(c.card_faces ? [[c.card_faces[0].name.toLowerCase(), c]] : [])]));

/** A 100-card singleton-ish list for a commander (basics may repeat). */
export function deckList(commander, spells, basics) {
  const lines = [`1 ${commander}`, ...spells.map(s => `1 ${s}`)];
  const fill = 100 - 1 - spells.length;
  const names = Object.keys(basics);
  const totalWeight = names.reduce((s, k) => s + basics[k], 0);
  let left = fill;
  names.forEach((name, i) => {
    const qty = i === names.length - 1 ? left : Math.round(fill * basics[name] / totalWeight);
    left -= qty;
    lines.push(`${qty} ${name}`);
  });
  return lines.join('\n');
}

export const DECKS = {
  white: { commander: 'Isamaru, Hound of Konda', list: deckList('Isamaru, Hound of Konda', ['Sol Ring', 'Mind Stone', 'Serra Angel', 'White Knight', 'Fencing Ace', 'Wall of Omens', 'Soul Warden', "Healer's Hawk", 'Day of Judgment', 'Swords to Plowshares', 'Glorious Anthem', 'Evolving Wilds', 'Swiftfoot Boots', 'Bonesplitter', 'Holy Strength'], { Plains: 1 }) },
  simic: { commander: 'Tatyova, Benthic Druid', list: deckList('Tatyova, Benthic Druid', ['Sol Ring', 'Arcane Signet', 'Command Tower', 'Llanowar Elves', 'Grizzly Bears', 'Elvish Visionary', 'Mulldrifter', 'Colossal Dreadmaw', 'Air Elemental', 'Fog Bank', 'Counterspell', 'Giant Growth', 'Divination', 'Cultivate', 'Rampant Growth', 'Naturalize', 'Opt', 'Evolving Wilds', 'Bala Ged Recovery // Bala Ged Sanctuary'], { Forest: 1, Island: 1 }) },
  rakdos: { commander: 'Lyzolda, the Blood Witch', list: deckList('Lyzolda, the Blood Witch', ['Sol Ring', 'Arcane Signet', 'Command Tower', 'Badlands', 'Vampire Nighthawk', 'Raging Goblin', 'Simian Spirit Guide', 'Gravedigger', 'Lightning Bolt', 'Shock', 'Murder', 'Reanimate', 'Mind Rot', 'Raise Dead', 'Dragon Fodder', 'Storm the Vault Oddity'], { Swamp: 1, Mountain: 1 }) },
  red: { commander: 'Zada, Hedron Grinder', list: deckList('Zada, Hedron Grinder', ['Sol Ring', 'Raging Goblin', 'Simian Spirit Guide', 'Lightning Bolt', 'Shock', 'Dragon Fodder'], { Mountain: 1 }) }
};
