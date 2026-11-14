// Temporary characteristic changes on a permanent (build 43): "This land becomes a 3/3 Elemental creature with haste
// until end of turn. It's still a land." (creature lands), crewed Vehicles, "target land becomes a 0/0 creature" …
// The change lives in card.temporaryEffects as { kind: 'animate', … } and every definition lookup applies it, so
// combat, state-based actions, triggers and the screen all see the creature.

const CARD_TYPES = ['Kindred', 'Tribal', 'Artifact', 'Enchantment', 'Land', 'Creature', 'Planeswalker', 'Battle'];

function addTypes(typeLine, add = [], subtypes = [], { replaceSubtypes = false, remove = [] } = {}) {
  const [left, right = ''] = String(typeLine || '').split(/\s+—\s+/);
  const words = left.split(/\s+/).filter(Boolean).filter(w => !remove.includes(w));
  for (const t of add) if (!words.includes(t)) {
    // Card types after supertypes, in the usual order (Artifact Creature, Land Creature …).
    words.push(t);
  }
  const supers = words.filter(w => !CARD_TYPES.includes(w)), types = CARD_TYPES.filter(t => words.includes(t));
  const subs = [...new Set([...(replaceSubtypes ? [] : right.split(/\s+/).filter(Boolean)), ...subtypes])];
  return `${[...supers, ...types].join(' ')}${subs.length ? ` — ${subs.join(' ')}` : ''}`;
}

// Land types (CR 305.6-305.7): a land with a basic land type has that type's mana ability ("{T}: Add {G}."). A change that sets the
// land type ("becomes an Island") removes its other land types and all its abilities and gives the new types' mana abilities;
// "in addition to its other types" keeps everything and adds them. Creature types and card types are not touched.
const BASIC_MANA = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
const LAND_SUBTYPES = [...Object.keys(BASIC_MANA), 'Desert', 'Gate', 'Lair', 'Locus', 'Mine', 'Power-Plant', 'Sphere', 'Tower', "Urza's", 'Cave', 'Town', 'Planet'];
export const BASIC_LAND_TYPES = Object.keys(BASIC_MANA);
function applyLandType(out, e) {
  const [left, right = ''] = String(out.typeLine || '').split(/\s+—\s+/);
  const subs = right.split(/\s+/).filter(Boolean);
  const types = (e.types || []).filter(t => BASIC_MANA[t]);
  const kept = e.set ? subs.filter(w => !LAND_SUBTYPES.includes(w)) : subs;
  const before = new Set(subs);
  out.typeLine = `${left} — ${[...new Set([...kept, ...types])].join(' ')}`.replace(/ — $/, '');
  const lines = types.filter(t => e.set || !before.has(t)).map(t => `{T}: Add {${BASIC_MANA[t]}}.`);
  if (e.set) { out.oracleText = lines.join('\n'); out.keywords = []; }
  else if (lines.length) out.oracleText = [out.oracleText, ...lines].filter(Boolean).join('\n');
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
  // A mutated pile (its combined definition) or a permanent that became a copy (Thespian's Stage): kept on the card.
  if (def && card?.mutatedDef) def = card.mutatedDef;
  else if (def && card?.copyDef) def = card.copyDef;
  // Rooms (build 79): with both doors unlocked the permanent has both halves' abilities (one door: its face, activeFaceIndex).
  if (def && Array.isArray(card?.unlockedFaces) && card.unlockedFaces.length > 1 && (def.cardFaces || []).length > 1) {
    const faces = card.unlockedFaces.map(i => def.cardFaces[i]).filter(Boolean);
    def = { ...def, name: faces.map(f => f.name).join(' // '), oracleText: faces.map(f => f.oracleText || '').join('\n'), manaValue: faces.reduce((n, f) => n + Number(f.manaValue ?? f.cmc ?? 0), 0) };
  }
  if (def && /Class|Level up/.test(`${def.typeLine}${String(def.oracleText || '').slice(0, 12)}`)) def = leveled(card, def);
  // Abilities granted in quotes by an Aura, Equipment or anthem ('Equipped creature has "{T}: …"'), kept on the card by
  // attachments.js syncAttachments.
  if (def && card?.grantedText?.length) def = { ...def, oracleText: [def.oracleText, ...card.grantedText].filter(Boolean).join('\n') };
  // Bestow: cast as an Aura, it is an Aura enchantment (not a creature) until what it enchants leaves.
  if (def && card?.bestowed) def = { ...def, typeLine: `Enchantment — Aura${(String(def.typeLine || '').split('—')[1] || '').trim() ? ` ${String(def.typeLine).split('—')[1].trim()}` : ''}`, oracleText: `Enchant creature\n${def.oracleText || ''}` };
  // Reconfigure: while attached to a creature it isn't a creature.
  if (def && card?.attachedTo && /(?:^|\n)\s*Reconfigure\b/i.test(String(def.oracleText || ''))) def = { ...def, typeLine: String(def.typeLine || '').replace(/\s*\bCreature\b\s*/, ' ').replace(/\s+/g, ' ').trim() };
  // Prototype: cast for its prototype cost, it has that smaller power and toughness, mana cost and colour while on the battlefield or stack.
  if (def && card?.prototype) def = { ...def, power: card.prototype.power, toughness: card.prototype.toughness, manaCost: card.prototype.cost, manaValue: card.prototype.manaValue, colors: card.prototype.colors };
  // Titan of Littjara: "This creature is the chosen type in addition to its other types."
  if (def && card?.chosenCreatureType && /is the chosen type in addition to its other types/i.test(String(def.oracleText || ''))) def = { ...def, typeLine: addTypes(def.typeLine, [], [card.chosenCreatureType], {}) };
  const fx = (card?.temporaryEffects || []).filter(e => e?.kind === 'animate' || e?.kind === 'land-type');
  if (!def || !fx.length) return def;
  const out = { ...def };
  for (const e of fx) {
    if (e.kind === 'land-type') { applyLandType(out, e); continue; }
    out.typeLine = addTypes(out.typeLine, e.addTypes || [], e.subtypes || [], { replaceSubtypes: !!e.replaceSubtypes || (e.removeTypes || []).includes('Creature'), remove: e.removeTypes || [] });
    if (e.power !== undefined && e.power !== null) out.power = String(e.power);
    if (e.toughness !== undefined && e.toughness !== null) out.toughness = String(e.toughness);
    if (e.loseAbilities) { out.oracleText = ''; out.keywords = []; }   // "loses all abilities" (Warkite Marauder)
    if (e.keywords?.length) out.keywords = [...new Set([...(out.keywords || []), ...e.keywords])];
    if (e.colors) out.colors = [...e.colors];
    if (e.addColors?.length) out.colors = [...new Set([...(out.colors || []), ...e.addColors])];
  }
  return out;
}
