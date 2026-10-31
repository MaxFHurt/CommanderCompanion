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

// Classes ("{2}{U}: Level 2" then that level's abilities) and level up ("LEVEL 1-4 / 1/2 / {T}: Add {G}{G}."): the
// definition keeps only the text of the levels the permanent has reached, so every reader of rules text agrees.
const LEVEL_CACHE = new Map();
function leveled(card, def) {
  const type = String(def?.typeLine || ''), text = String(def?.oracleText || '');
  if (/\bClass\b/.test(type) && /: Level \d/.test(text)) {
    const level = Math.max(1, Number(card?.classLevel || 1));
    const key = `class|${def.definitionId}|${def.name}|${level}`;
    if (!LEVEL_CACHE.has(key)) {
      let at = 1;
      const keep = text.split('\n').filter(line => { const m = line.match(/^(?:\{[^}]+\})+:\s*Level (\d+)/); if (m) { at = Number(m[1]); return true; } return at <= level; });
      LEVEL_CACHE.set(key, { ...def, oracleText: keep.join('\n') });
    }
    return LEVEL_CACHE.get(key);
  }
  if (/^Level up /m.test(text) && /^LEVEL \d/m.test(text)) {
    const n = Number(card?.counters?.level || 0);
    const key = `levelup|${def.definitionId}|${def.name}|${n}`;
    if (!LEVEL_CACHE.has(key)) {
      const lines = text.split('\n'), keep = [];
      let block = null, pt = null;
      for (const line of lines) {
        const m = line.match(/^LEVEL (\d+)(?:-(\d+)|\+)/);
        if (m) { block = n >= Number(m[1]) && (!m[2] || n <= Number(m[2])); continue; }
        if (block === null) { keep.push(line); continue; }
        if (!block) continue;
        const p = line.match(/^(\d+|\*)\/(\d+|\*)$/);
        if (p) { pt = p; continue; }
        keep.push(line);
      }
      LEVEL_CACHE.set(key, { ...def, oracleText: keep.join('\n'), ...(pt ? { power: pt[1], toughness: pt[2] } : {}) });
    }
    return LEVEL_CACHE.get(key);
  }
  return def;
}

/** The definition with every animate effect on this card applied (or the definition itself when there is none). */
export function withOverlay(card, def) {
  if (def && /Class|Level up/.test(`${def.typeLine}${String(def.oracleText || '').slice(0, 12)}`)) def = leveled(card, def);
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
