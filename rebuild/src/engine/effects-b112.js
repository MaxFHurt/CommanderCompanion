// Card wordings added in build 112 (rules long tail, batch 5 part B). Hooked like effects-b111.js: compileB112Clause is tried
// last (from compileB111Clause), compileB112Sequence from compileB111Sequence, applyB112 from applyB111, gatherB112 from
// gatherB111, parseConditionB112 / conditionHoldsB112 from the build-110 condition hooks.
import { numberFromText, locateCardInGame, definitionFor, catalogHelpers as H } from './effects.js';
import { effectivePower } from './combat.js';

const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const playerById = (game, id) => (game.players || []).find(p => p.playerId === id) || null;
const SELF = '(?:SELFNAME|this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|Saga|Vehicle|planeswalker|card|token))';
const esc = x => String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const selfPattern = sourceName => `(?:${SELF}|${esc(sourceName)}|${esc(String(sourceName).split(',')[0])}|${esc(String(sourceName).split(' // ')[0])}|${esc(String(sourceName).split(' // ')[0].split(',')[0])})`;
const isPrepareCard = (game, card) => { const b = game.cardDefinitions?.[card?.definitionId]; return b?.layout === 'prepare' && (b.cardFaces || []).length > 1; };

/** One sentence. Pushes onto ctx.effects / ctx.requirements and returns true when understood. */
export function compileB112Clause(c, ctx) {
  const { effects, requirements, sourceName } = ctx;
  const SELFP = selfPattern(sourceName);
  let m;
  // --- Prepared (Secrets of Strixhaven): "This creature becomes prepared." / "Target creature becomes prepared." / "Each creature you control becomes prepared." / "… becomes unprepared."
  const prep = c.replace(/\s*\((?:While it'?s prepared|Only creatures with prepare spells)[^)]*\)\s*/gi, '').trim();
  if ((m = prep.match(new RegExp(`^(${SELFP}|it|target creature(?: that attacked this turn)?|each creature you control) becomes (un)?prepared\\.?$`, 'i')))) {
    const un = !!m[2];
    if (/^each creature you control$/i.test(m[1])) { effects.push({ kind: 'b112-prepare', each: true, un }); return true; }
    if (/^target/i.test(m[1])) { effects.push({ kind: 'b112-prepare', bind: H.targetRequirement(requirements, m[1].toLowerCase(), m[1].toLowerCase()), un }); return true; }
    effects.push({ kind: 'b112-prepare', bind: 'sourceId', un });
    return true;
  }
  return false;
}

/** Sentences that need their neighbours. Returns { part, consumed } or null. */
export function compileB112Sequence(clauses, i, { sourceName, parts = [] }) {
  const clean = x => String(x || '').replace(/\([^()]*\)/g, '').trim();
  const c0 = clean(clauses[i]);
  let m;
  // --- "Tap enchanted creature. It becomes unprepared." (Infinite Coursework): "it" is the creature the sentence before acted on.
  if ((m = c0.match(/^It becomes (un)?prepared\.?$/i)) && i > 0) {
    const prior = [...parts.flatMap(p => p.effects || [])].reverse().find(e => typeof e.bind === 'string' && e.bind !== 'sourceId');
    if (prior) return { part: { effects: [{ kind: 'b112-prepare', bind: prior.bind, un: !!m[1] }], requirements: [], unsupported: [] }, consumed: 1 };
  }
  return null;
}

export function applyB112(game, controllerId, effect, bindings, notes) {
  switch (effect.kind) {
    case 'b112-prepare': {
      const cards = effect.each
        ? (game.players || []).flatMap(p => (p.deck?.battlefield || []).filter(c => (c.controllerId || p.playerId) === controllerId && /\bCreature\b/i.test(definitionFor(game, c)?.typeLine || '')))
        : [locateCardInGame(game, bindings[effect.bind] || (/^(?:sourceId|eventCard|b101It)$/.test(effect.bind) ? bindings.sourceId : null))].filter(h => h && h.zone === 'battlefield').map(h => h.card);
      for (const c of cards) {
        const name = definitionFor(game, c)?.name || 'It';
        if (!isPrepareCard(game, c)) { if (!effect.each) notes.push(`${name} has no prepare spell, so it can't become prepared.`); continue; }
        if (effect.un) { delete c.prepared; notes.push(`${name} is no longer prepared.`); }
        else { c.prepared = true; notes.push(`${name} becomes prepared: you may cast a copy of ${game.cardDefinitions[c.definitionId].cardFaces[1].name} (shown in your exile).`); }
      }
      if (!cards.length && !effect.each) notes.push('That creature is no longer on the battlefield.');
      return true;
    }
    default: return false;
  }
}

export function gatherB112(game, ctx, req, bindings, ask, key, title, base, util) {
  return false;
}

/** "If" conditions made here. */
export function parseConditionB112(t) {
  let m;
  const cnt = w => numberFromText(w) ?? Number(w);
  if (/^an opponent has more cards in (?:their )?hand than you$/i.test(t)) return { test: 'b112-opp-more-hand' };   // Joined Researchers
  if ((m = t.match(/^a player has (\w+) or fewer cards in (?:their )?hand$/i))) return { test: 'b112-any-hand-le', n: cnt(m[1]) };   // Naktamun Lorespinner
  if ((m = t.match(/^there are (\w+) or more ((?:artifact|creature|land|enchantment|instant|sorcery|planeswalker)(?:,? (?:and\/or|or) (?:artifact|creature|land|enchantment|instant|sorcery|planeswalker))+) cards in your graveyard$/i)))
    return { test: 'b112-gy-any-type', min: cnt(m[1]), types: m[2].toLowerCase().split(/,? (?:and\/or|or) /) };   // Lorehold Archivist
  if ((m = t.match(/^that creature has power (\w+) or greater$/i))) return { test: 'b112-that-power', min: cnt(m[1]) };   // Yavimaya Bloomsage
  if (/^(?:this creature|it|SELFNAME|[A-Z][A-Za-z' ,-]+) (?:isn'?t|is not) prepared$/.test(t)) return { test: 'b112-prepared', not: true };
  if (/^(?:this creature|it|SELFNAME|[A-Z][A-Za-z' ,-]+) is prepared$/.test(t)) return { test: 'b112-prepared' };
  return null;
}
export function conditionHoldsB112(game, controllerId, effect, bindings = {}) {
  switch (effect.test) {
    case 'b112-opp-more-hand': { const mine = (playerById(game, controllerId)?.deck?.hand || []).length; return (game.players || []).some(p => !p.eliminated && p.playerId !== controllerId && (p.deck?.hand || []).length > mine); }
    case 'b112-any-hand-le': return (game.players || []).some(p => !p.eliminated && (p.deck?.hand || []).length <= effect.n);
    case 'b112-gy-any-type': return (playerById(game, controllerId)?.deck?.graveyard || []).filter(c => effect.types.some(w => new RegExp(`\\b${w}\\b`, 'i').test(definitionFor(game, c)?.typeLine || ''))).length >= effect.min;
    case 'b112-that-power': {
      const id = bindings.lastTarget || bindings.target0 || bindings.thatCard, hit = id && locateCardInGame(game, id);
      if (!hit || hit.zone !== 'battlefield') return false;
      return Number(effectivePower(hit.card, definitionFor(game, hit.card), game) || 0) >= effect.min;
    }
    case 'b112-prepared': { const v = !!locateCardInGame(game, bindings.sourceId)?.card?.prepared; return effect.not ? !v : v; }
    default: return undefined;
  }
}
