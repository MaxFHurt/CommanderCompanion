// Temporary characteristic changes on a permanent (build 43): "This land becomes a 3/3 Elemental creature with haste
// until end of turn. It's still a land." (creature lands), crewed Vehicles, "target land becomes a 0/0 creature" …
// The change lives in card.temporaryEffects as { kind: 'animate', … } and every definition lookup applies it, so
// combat, state-based actions, triggers and the screen all see the creature.

const CARD_TYPES = ['Kindred', 'Tribal', 'Artifact', 'Enchantment', 'Land', 'Creature', 'Planeswalker', 'Battle'];

function addTypes(typeLine, add = [], subtypes = [], { replaceSubtypes = false } = {}) {
  const [left, right = ''] = String(typeLine || '').split(/\s+—\s+/);
  const words = left.split(/\s+/).filter(Boolean);
  for (const t of add) if (!words.includes(t)) {
    // Card types after supertypes, in the usual order (Artifact Creature, Land Creature …).
    words.push(t);
  }
  const supers = words.filter(w => !CARD_TYPES.includes(w)), types = CARD_TYPES.filter(t => words.includes(t));
  const subs = [...new Set([...(replaceSubtypes ? [] : right.split(/\s+/).filter(Boolean)), ...subtypes])];
  return `${[...supers, ...types].join(' ')}${subs.length ? ` — ${subs.join(' ')}` : ''}`;
}

/** The definition with every animate effect on this card applied (or the definition itself when there is none). */
export function withOverlay(card, def) {
  const fx = (card?.temporaryEffects || []).filter(e => e?.kind === 'animate');
  if (!def || !fx.length) return def;
  const out = { ...def };
  for (const e of fx) {
    out.typeLine = addTypes(out.typeLine, e.addTypes || [], e.subtypes || [], { replaceSubtypes: !!e.replaceSubtypes });
    if (e.power !== undefined && e.power !== null) out.power = String(e.power);
    if (e.toughness !== undefined && e.toughness !== null) out.toughness = String(e.toughness);
    if (e.keywords?.length) out.keywords = [...new Set([...(out.keywords || []), ...e.keywords])];
    if (e.colors) out.colors = [...e.colors];
  }
  return out;
}
