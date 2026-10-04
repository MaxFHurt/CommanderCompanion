// "Search your library for …" effects. The spec is plain data so it can be stored on a stack object,
// saved, and sent to another device; the filter is rebuilt from `filterKey` when needed.

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };

const FILTERS = [
  ['basic-land', /basic land card/i, 'basic land card', d => /\bBasic\b/i.test(d?.typeLine || '') && /\bLand\b/i.test(d?.typeLine || '')],
  ['land', /land card/i, 'land card', d => /Land/i.test(d?.typeLine || '')],
  ['creature', /creature card/i, 'creature card', d => /Creature/i.test(d?.typeLine || '')],
  ['artifact', /artifact card/i, 'artifact card', d => /Artifact/i.test(d?.typeLine || '')],
  ['enchantment', /enchantment card/i, 'enchantment card', d => /Enchantment/i.test(d?.typeLine || '')],
  ['instant', /instant card/i, 'instant card', d => /Instant/i.test(d?.typeLine || '')],
  ['sorcery', /sorcery card/i, 'sorcery card', d => /Sorcery/i.test(d?.typeLine || '')]
];

export function librarySearchSpec(effectText = '') {
  const text = String(effectText || '').replace(/\s+/g, ' ').trim();
  if (!/search your library/i.test(text)) return null;
  let destination = 'hand';
  if (/put (?:that|it|the card|those cards|one)[^.]*onto the battlefield/i.test(text)) destination = 'battlefield';
  else if (/put (?:that|it|the card|those cards)[^.]*on top of your library/i.test(text) || /shuffle and put (?:that|the) card on top/i.test(text)) destination = 'library';
  const entersTapped = destination === 'battlefield' && /onto the battlefield tapped/i.test(text);
  let filterKey = 'any', label = 'card';
  for (const [key, re, name] of FILTERS) {
    if (re.test(text)) { filterKey = key; label = name; break; }
  }
  const untapMatch = text.match(/if you control (\d+|one|two|three|four|five) or more lands?, untap (?:that|it|the) land/i);
  const untapIfLandsAtLeast = untapMatch ? (Number(untapMatch[1]) || NUMBER_WORDS[untapMatch[1].toLowerCase()] || 0) : 0;
  return {
    text, destination, entersTapped, filterKey, label,
    optional: /search your library for up to/i.test(text) || /you may search/i.test(text),
    shuffle: /shuffle/i.test(text),
    untapIfLandsAtLeast
  };
}

export function searchFilter(spec) {
  const row = FILTERS.find(f => f[0] === spec?.filterKey);
  return row ? row[3] : () => true;
}
