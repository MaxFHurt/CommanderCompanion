// Test cards for the mechanics the engine automates (kicker, flashback, cascade, …). Real card
// names and Oracle text, Scryfall-shaped. Used by the five-color "lab" deck in the node tests.

const IMG = name => ({ small: `fixture://${encodeURIComponent(name)}`, normal: `fixture://${encodeURIComponent(name)}`, art_crop: `fixture://${encodeURIComponent(name)}` });
let n = 0;
function cmc(cost) { return (cost.match(/\{([^}]+)\}/g) || []).reduce((sum, s) => sum + (/\d+/.test(s) ? Number(s.match(/\d+/)[0]) : /X/.test(s) ? 0 : 1), 0); }
export function labCard(name, mana_cost, type_line, oracle_text, extra = {}) {
  n += 1;
  const colors = [...new Set((mana_cost.match(/[WUBRG]/g) || []))];
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
  c('Gladecover Scout', '{G}', 'Elf Scout', 'Hexproof (This creature can\'t be the target of spells or abilities your opponents control.)', 1, 1, ['Hexproof'])
];

export const LAB_LIST = names => names;
