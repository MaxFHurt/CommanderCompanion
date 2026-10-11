// Cards the engine can't fully automate are resolved by hand — but their targets are still
// chosen when they are cast, exactly as the rules say, so the resolution screen can point at
// them and offer the right actions. This reads the "target …" phrases from rules text.

const TYPE_WORDS = '(?:non)?(?:creature|artifact|enchantment|planeswalker|land|permanent|battle|equipment|aura|vehicle|spell|player|opponent|card|instant|sorcery|tapped|untapped|attacking|blocking|legendary|token|nontoken|basic|white|blue|black|red|green|colorless|multicolored|activated|triggered|ability|abilities)s?';
const PHRASE = new RegExp(`\\b(up to (?:one|two|three|four|five|\\d+) )?(?:(?:another|other) )?target ((?:${TYPE_WORDS}(?:,? (?:or|and/or|and) |, | ))*${TYPE_WORDS})((?: card)?(?: (?:from|in) (?:a|an|your|target player's|an opponent's|any) graveyards?)?)( (?:you control|you don'?t control|an opponent controls|that player controls|defending player controls|with [a-z +/-]+ on it))?`, 'gi');
const COUNT = { one: 1, two: 2, three: 3, four: 4, five: 5 };

function clean(text) { return String(text || '').replace(/\([^()]*\)/g, ' ').replace(/[’]/g, "'"); }

/**
 * Requirements (in the shape gatherRequirements understands) for every target the text names.
 * "any target" is a creature, player, planeswalker or battle; "target player/opponent" a player;
 * "target spell / ability" something on the stack; "target … card in a graveyard" a card there.
 */
export function targetRequirementsFromText(text) {
  const out = [];
  const t = clean(text);
  if (/\bany (?:other )?target\b/i.test(t)) out.push({ kind: 'target', scope: 'any target', label: 'any target' });
  for (const m of t.matchAll(PHRASE)) {
    if (out.length >= 4) break;
    const upTo = m[1] ? (Number(m[1].match(/\d+/)?.[0]) || COUNT[m[1].split(' ')[2]] || 1) : 0;
    const words = m[2].toLowerCase(), tail = (m[3] || '').toLowerCase(), control = (m[4] || '').toLowerCase().trim();
    const scope = `target ${words}${tail}${control ? ` ${control}` : ''}`.trim();
    const label = `${upTo ? 'up to one ' : ''}${scope}`;
    let req;
    if (/graveyard/.test(tail) || /\bcard\b/.test(words)) req = { kind: 'graveyard-target', scope, label };
    else if (/\bspell\b/.test(words) && !/permanent|creature/.test(words)) req = { kind: 'stack-target', scope: /activated|triggered/.test(words) ? 'any' : 'spell', label };
    else if (/\b(?:activated|triggered)\b|\babilit/.test(words)) req = { kind: 'stack-target', scope: 'any', label };
    else if (/^(?:player|opponent)s?$/.test(words)) req = { kind: 'player', scope: /opponent/.test(words) ? 'opponent' : 'player', label };
    else if (/^(?:player|opponent)s? or /.test(words) || /or (?:player|opponent)/.test(words)) req = { kind: 'target', scope: `any target`, label };
    else req = { kind: 'target', scope, label };
    if (upTo) req.optional = true;
    out.push(req);
  }
  return out.map((r, i) => ({ ...r, bind: `guided${i}` }));
}
