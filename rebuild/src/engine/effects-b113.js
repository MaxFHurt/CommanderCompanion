// Conditions added in build 113 (rules long tail, batch 7): the "conditional wording riders" ("If X, …", "… instead if X",
// "Raid / Morbid / Revolt / Threshold / Delirium …") as one set of predicates. Hooked like the earlier batches: parseConditionB113
// from effects.js parseCondition (tried last), conditionHoldsB113 from conditionHolds. A condition is a plain { test, … } object
// read as the effect resolves; the ones that depend only on the game state or on the trigger's own event carry `iv: true`, which
// lets effects.js interveningIfFails check them when the trigger would go on the stack (CR 603.4).
//
// Pieces: a card descriptor ("creature card", "nonland permanent", "legendary", "Human") read by parseDescB113 and tested by
// fitsDescB113; "it" / "that creature" settle on the card the effect is about (refCardB113); this turn's tallies come from
// triggers.js tallyTurn (turnTally.left / entered / died) and the per-turn life counters.
import { numberFromText, locateCardInGame, definitionFor, parseCondition, conditionHolds } from './effects.js';
import { effectivePower, effectiveToughness } from './combat.js';

const cnt = w => { const s = String(w ?? '').toLowerCase(); return /^\d+$/.test(s) ? Number(s) : ({ a: 1, an: 1, no: 0, zero: 0 })[s] ?? numberFromText(s); };
const playerById = (game, id) => (game.players || []).find(p => p.playerId === id) || null;
const esc = x => String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- the card the clause is about ("this permanent": the name of the card being compiled is read as that) ----
let SOURCE_NAME = '';
export function setSourceNameB113(name) { const was = SOURCE_NAME; SOURCE_NAME = String(name || ''); return was; }
function selfNames() {
  const n = SOURCE_NAME;
  if (!n || n.length < 3) return [];
  const full = n.split(' // ')[0];
  return [...new Set([full, full.split(',')[0], full.split(' ')[0].length > 3 && !/^(?:the|of|a|an)$/i.test(full.split(' ')[0]) && /,/.test(full) ? full.split(',')[0] : null].filter(Boolean))].sort((a, b) => b.length - a.length);
}
function normalizeSelf(t) {
  let s = t;
  for (const n of selfNames()) s = s.replace(new RegExp(`(^|[^A-Za-z])${esc(n)}(?![A-Za-z])`, 'g'), '$1this permanent');
  return s;
}

// ---- card descriptors ----
const TYPES = ['artifact', 'battle', 'creature', 'enchantment', 'instant', 'land', 'planeswalker', 'sorcery', 'kindred'];
const SUPERS = ['legendary', 'basic', 'snow', 'world'];
const COLOR_LETTER = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
/** "creature card", "nonland permanent", "legendary creature", "artifact or creature", "Human" → alternatives, or null if a word is unknown. */
export function parseDescB113(text) {
  let s = String(text || '').trim().replace(/^(?:a|an|another|one|the)\s+/i, '').replace(/\s+(?:cards?|permanents?|spells?)$/i, m => (/permanent/i.test(m) ? ' permanent' : ''));
  if (!s) return null;
  const alts = [];
  for (const part of s.split(/\s*,\s*(?:and\/or |or )?|\s+(?:and\/or|or)\s+/).filter(Boolean)) {
    const alt = { has: [], not: [], colors: [], token: null, perm: false, subs: [], nonsubs: [], hist: false };
    for (const raw of part.trim().split(/\s+/)) {
      const w = raw.replace(/^non-/i, 'non'), lw = w.toLowerCase();
      if (/^permanents?$/.test(lw)) { alt.perm = true; continue; }
      if (/^(?:cards?|spells?)$/.test(lw)) continue;
      if (lw === 'token' || lw === 'tokens') { alt.token = true; continue; }
      if (lw === 'nontoken') { alt.token = false; continue; }
      if (lw === 'historic') { alt.hist = true; continue; }
      if (TYPES.includes(lw.replace(/s$/, ''))) { alt.has.push(lw.replace(/s$/, '')); continue; }
      if (SUPERS.includes(lw)) { alt.has.push(lw); continue; }
      if (COLOR_LETTER[lw]) { alt.colors.push(COLOR_LETTER[lw]); continue; }
      if (lw === 'colorless') { alt.colorless = true; continue; }
      if (lw === 'multicolored') { alt.multi = true; continue; }
      let m;
      if ((m = lw.match(/^non(land|creature|artifact|enchantment|basic|legendary|snow|instant|sorcery|planeswalker)$/))) { alt.not.push(m[1]); continue; }
      if (/^non[A-Za-z]+$/.test(w) && /^[A-Z]/.test(w.slice(3))) { alt.nonsubs.push(w.slice(3)); continue; }
      if (/^[A-Z][A-Za-z'-]*$/.test(w)) { alt.subs.push(w.replace(/s$/, '')); continue; }
      return null;
    }
    alts.push(alt);
  }
  return alts.length ? alts : null;
}
const hasWord = (tl, w) => new RegExp(`\\b${esc(w)}\\b`, 'i').test(tl);
/** A card (given as its type line, token flag and colours) fits one of the alternatives. */
export function fitsTypeLineB113(tl, token, alts, colors = null) {
  const front = String(tl || '');
  const isPerm = !/\b(?:Instant|Sorcery)\b/.test(front.split('—')[0]);
  return alts.some(a => {
    if (a.perm && !isPerm) return false;
    if (a.token === true && !token) return false;
    if (a.token === false && token) return false;
    if (a.hist && !(/\bArtifact\b|\bLegendary\b|\bSaga\b/.test(front))) return false;
    if (!a.has.every(w => hasWord(front.split('—')[0], w))) return false;
    if (a.not.some(w => hasWord(front.split('—')[0], w))) return false;
    if (!a.subs.every(w => hasWord(front, w) || hasWord(front, w.replace(/f$/, 'ves')))) return false;
    if (a.nonsubs.some(w => hasWord(front, w))) return false;
    if (a.colors.length || a.colorless || a.multi) {
      if (!colors) return false;
      if (!a.colors.every(c => colors.includes(c))) return false;
      if (a.colorless && colors.length) return false;
      if (a.multi && colors.length < 2) return false;
    }
    return true;
  });
}
const fitsCard = (game, card, alts) => { const d = definitionFor(game, card); return !!d && fitsTypeLineB113(d.typeLine, !!card.token, alts, d.colors || d.colorIdentity || []); };
const descOk = text => parseDescB113(text);

// ---- this turn's tallies ----
const tally = game => (game.turnTally?.turn === Number(game.turnNumber || 0) ? game.turnTally : null);
const whoFits = (who, rowController, controllerId) => who === 'any' || (who === 'you' ? rowController === controllerId : rowController !== controllerId);

// ---- the card "it" is ----
function refIdB113(effect, bindings) {
  const lastMoved = [].concat(bindings.lastMoved || []).slice(-1)[0];
  const dig = Object.keys(bindings).filter(k => /^dig\d+$/.test(k)).map(k => { const v = bindings[k]; return v && (v.rest?.[0] || v.groups?.flat?.()[0]) || (typeof v === 'string' ? v : null); }).filter(Boolean).slice(-1)[0];
  return (effect.bind && effect.bind !== 'lastTarget' ? bindings[effect.bind] : null) || bindings.revealedTop || dig || [].concat(bindings.lastLinkedMoved || []).slice(-1)[0] || lastMoved || bindings.target0 || bindings.eventCard || bindings.thatCard || null;
}
function refCardB113(game, effect, bindings) { const id = refIdB113(effect, bindings); return id ? locateCardInGame(game, id) : null; }
/** The spell being resolved (this spell's own flags), when the clause is about "this spell". */
function spellObjB113(game, bindings) {
  const o = game.__resolvingFull;
  return o && (o.kind === 'spell' || o.kind === 'spell-copy') && (!bindings.sourceId || o.card?.instanceId === bindings.sourceId) ? o : null;
}
/** What a "cast" clause reads: the spell on the stack as it resolves, or the permanent that entered (flags kept on the card). */
function castInfoB113(game, bindings) {
  const o = spellObjB113(game, bindings);
  const card = o?.card || locateCardInGame(game, bindings.eventCard || bindings.sourceId)?.card || null;
  const from = o ? (o.fromZone || card?.castFromZone || 'hand') : (card?.castFromZone || (card?.wasCast ? 'hand' : null));
  return { o, card, from, cast: !!(o || card?.wasCast) };
}
const REF = '(?:it|that (?:creature|permanent|card|land|artifact|enchantment|planeswalker|token|spell)|the (?:revealed|exiled|milled|chosen) (?:card|creature|permanent|artifact|land))';
const SELFW = '(?:this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|Saga|Vehicle|planeswalker|card|spell|token)|it)';

export function parseConditionB113(t0) {
  const t = normalizeSelf(String(t0 || '').trim()).replace(/’/g, "'").replace(/^it's /i, 'it is ').replace(/^(it|that creature|that permanent|that card) isn't /i, '$1 is not ');
  let m;
  const REFRE = new RegExp(`^${REF}`, 'i');
  // ---- you: life, hand, graveyard ----
  if ((m = t.match(/^you have (\w+) or (?:less|fewer) life$/i)) && cnt(m[1]) != null) return { test: 'b113-life', op: 'le', n: cnt(m[1]), iv: true };
  if ((m = t.match(/^your life total is (\w+) or (less|fewer|greater|more)$/i)) && cnt(m[1]) != null) return { test: 'b113-life', op: /less|fewer/i.test(m[2]) ? 'le' : 'ge', n: cnt(m[1]), iv: true };
  if ((m = t.match(/^you have (?:at least|exactly) (\w+) life$/i)) && cnt(m[1]) != null) return { test: 'b113-life', op: /exactly/i.test(t) ? 'eq' : 'ge', n: cnt(m[1]), iv: true };
  if ((m = t.match(/^you have exactly (\w+) life$/i)) && cnt(m[1]) != null) return { test: 'b113-life', op: 'eq', n: cnt(m[1]), iv: true };
  if ((m = t.match(/^you have at least (\w+) life more than your starting life total$/i)) && cnt(m[1]) != null) return { test: 'b113-life', op: 'ge', n: cnt(m[1]), plusStart: true, iv: true };
  if ((m = t.match(/^you have (more|less|fewer) life than (an opponent|each opponent|each other player|any other player|the player with the most life|target opponent)$/i))) return { test: 'b113-life-vs', cmp: /more/i.test(m[1]) ? 'more' : 'less', each: /each|most/i.test(m[2]), iv: true };
  if ((m = t.match(/^(?:an opponent has|each opponent has|your opponent has) (\w+) or (less|fewer) life$/i)) && cnt(m[1]) != null) return { test: 'b113-opp-life', n: cnt(m[1]), iv: true };
  if (/^you have more cards in hand than each opponent$/i.test(t)) return { test: 'b113-hand-vs', cmp: 'more', each: true, iv: true };
  if (/^you have more cards in hand than an opponent$/i.test(t)) return { test: 'b113-hand-vs', cmp: 'more', each: false, iv: true };
  if ((m = t.match(/^(?:there (?:are|is|'s) (\w+)(?: or more)?|you have (\w+) or more) (.+?) cards? in your graveyard$/i)) && !/^(?:card types?|different)/i.test(m[3])) {
    const n = cnt(m[1] || m[2]), alts = m[3] === '' ? null : descOk(m[3]);
    if (n != null && alts) return { test: 'b113-gy-desc', min: /^(?:a|an)$/i.test(m[1] || '') ? 1 : n, alts, iv: true };
  }
  if ((m = t.match(/^(?:there (?:are|is|'s) (\w+) or more|you have (\w+) or more) permanent cards in your graveyard$/i))) return { test: 'b113-gy-desc', min: cnt(m[1] || m[2]), alts: parseDescB113('permanent'), iv: true };
  if ((m = t.match(/^(?:your graveyard has|there are) (\w+) or more cards in (?:your graveyard|it)$/i)) && cnt(m[1]) != null) return { test: 'graveyard-count', min: cnt(m[1]), iv: true };
  if ((m = t.match(/^(?:a|that|target) (?:player'?s? )?graveyard has (\w+) or more cards in it$/i)) && cnt(m[1]) != null) return { test: 'b113-any-gy', min: cnt(m[1]), iv: true };
  if ((m = t.match(/^(?:that|target) player'?s? graveyard has (\w+) or more cards in it$/i)) && cnt(m[1]) != null) return { test: 'b113-any-gy', min: cnt(m[1]), iv: true };
  if ((m = t.match(/^(?:that player|they|target player|target opponent) (?:has|have) (\w+) or (fewer|less|more) cards in (?:their )?hand$/i)) && cnt(m[1]) != null) return { test: 'b113-player-hand', n: cnt(m[1]), more: /more/i.test(m[2]) };
  if ((m = t.match(/^(?:an? )?opponent has (\w+) or more cards in (?:their )?graveyard$/i)) && cnt(m[1]) != null) return { test: 'b113-opp-gy', min: cnt(m[1]), iv: true };
  if ((m = t.match(/^this (?:card|permanent|creature) is in (?:your|a) (graveyard|exile|hand)$/i))) return { test: 'b113-src-zone', zone: m[1].toLowerCase() };
  if ((m = t.match(/^(?:you had|you have had) (?:another |an? |one or more )(.+?) enter(?:ed)? (?:the battlefield )?under your control this turn$/i)) && descOk(m[1])) return { test: 'b113-entered', alts: descOk(m[1]), min: 1, iv: true };
  if ((m = t.match(/^(?:an opponent has|a player has) (\w+) or more poison counters$/i)) && cnt(m[1]) != null) return { test: 'b113-poison', min: cnt(m[1]), iv: true };
  if (/^your life total is less than your starting life total$/i.test(t)) return { test: 'b113-life', op: 'lt-start', n: 0, plusStart: true, iv: true };
  if ((m = t.match(/^each player has (\w+) or less life$/i)) && cnt(m[1]) != null) return { test: 'b113-each-life', n: cnt(m[1]), iv: true };
  if ((m = t.match(/^creatures you control have total toughness (\w+) or greater$/i)) && cnt(m[1]) != null) return { test: 'b113-total-toughness', min: cnt(m[1]), iv: true };
  if ((m = t.match(/^you control (an? [^,]+?) and (an? [^,]+)$/i))) { const a = parseCondition(`you control ${m[1]}`), b = parseCondition(`you control ${m[2]}`); if (a && b && a.test === 'control' && b.test === 'control') return { test: 'b113-and', parts: [a, b], iv: true }; }
  if ((m = t.match(/^(?:an?|one or more) (.+?) cards? (?:was|were|is|are) (exiled|discarded) this way$/i)) && descOk(m[1])) return { test: 'b113-moved-this-way', alts: descOk(m[1]), verb: m[2].toLowerCase() };
  // ---- designations ----
  if (/^you have the initiative$/i.test(t)) return { test: 'b113-designation', what: 'initiative', iv: true };
  if (/^there is no monarch$/i.test(t)) return { test: 'b113-designation', what: 'monarch', none: true, iv: true };
  if (/^an opponent is the monarch$/i.test(t)) return { test: 'b113-designation', what: 'monarch', opp: true, iv: true };
  if (/^(?:you(?:'ve| have) completed (?:a|an|one) dungeon|you(?:'ve| have) completed a dungeon)$/i.test(t)) return { test: 'b113-dungeon', iv: true };
  // ---- this turn ----
  if ((m = t.match(/^(?:a|an) (.+?) (?:you controlled |you control )?left the battlefield (?:under your control )?this turn$/i)) || (m = t.match(/^(?:a|an) (.+?) you controlled left the battlefield this turn$/i))) {
    const mine = /you controlled|under your control/i.test(t), alts = /^permanent$/i.test(m[1]) ? parseDescB113('permanent') : descOk(m[1]);
    if (alts) return { test: 'b113-left', who: mine ? 'you' : 'any', alts, min: 1, iv: true };
  }
  if ((m = t.match(/^(\w+) or more (.+?) (?:you controlled )?left the battlefield (?:under your control )?this turn$/i)) && cnt(m[1]) != null && descOk(m[2])) return { test: 'b113-left', who: /you controlled|under your control/i.test(t) ? 'you' : 'any', alts: descOk(m[2]), min: cnt(m[1]), iv: true };
  if ((m = t.match(/^(?:a|an|one or more) (.+?) died (under your control )?this turn$/i)) && descOk(m[1])) return { test: 'b113-died', who: m[2] ? 'you' : 'any', alts: descOk(m[1]), min: 1, iv: true };
  if ((m = t.match(/^(?:a|an) (.+?) you controlled died this turn$/i)) && descOk(m[1])) return { test: 'b113-died', who: 'you', alts: descOk(m[1]), min: 1, iv: true };
  if ((m = t.match(/^(?:a|an|one or more) (?:other )?(.+?) entered (?:the battlefield )?under your control this turn$/i)) && descOk(m[1])) return { test: 'b113-entered', alts: descOk(m[1]), min: 1, other: /\bother\b|another/i.test(t), iv: true };
  if ((m = t.match(/^another (.+?) entered (?:the battlefield )?under your control this turn$/i)) && descOk(m[1])) return { test: 'b113-entered', alts: descOk(m[1]), min: 1, other: true, iv: true };
  if ((m = t.match(/^(\w+) or more (.+?) entered (?:the battlefield )?under your control this turn$/i)) && cnt(m[1]) != null && descOk(m[2])) return { test: 'b113-entered', alts: descOk(m[2]), min: cnt(m[1]), iv: true };
  if ((m = t.match(/^you(?:'ve| have)? lost (?:(\w+) or more )?life this turn$/i)) || (m = t.match(/^you lost (?:(\w+) or more )?life this turn$/i))) return { test: 'b113-life-lost', min: m[1] ? cnt(m[1]) : 1, who: 'you', iv: true };
  if ((m = t.match(/^(?:an opponent|a player) lost (\w+) or more life this turn$/i)) && cnt(m[1]) != null) return { test: 'b113-life-lost', min: cnt(m[1]), who: /opponent/i.test(t) ? 'opp' : 'any', iv: true };
  if (/^you gained or lost life this turn$/i.test(t)) return { test: 'b113-gained-or-lost', iv: true };
  if (/^you gained and lost life this turn$/i.test(t)) return { test: 'b113-gained-and-lost', iv: true };
  if ((m = t.match(/^you(?:'ve| have) drawn (\w+) or more cards this turn$/i)) && cnt(m[1]) != null) return { test: 'b113-drew', min: cnt(m[1]), iv: true };
  if (/^you discarded (?:a|one or more) cards? this turn$/i.test(t)) return { test: 'b113-discarded', min: 1, iv: true };
  if ((m = t.match(/^you(?:'ve| have) cast (\w+) or more spells this turn$/i)) && cnt(m[1]) != null) return { test: 'b113-cast-count', min: cnt(m[1]), iv: true };
  if ((m = t.match(/^you(?:'ve| have) cast (another|an?|one) (noncreature|creature|instant or sorcery|instant|sorcery|artifact|enchantment|historic|multicolored|nonland|colorless|white|blue|black|red|green)? ?spell this turn$/i))) return { test: 'b113-cast-count', min: 1, other: /another/i.test(m[1]), alts: m[2] ? parseDescB113(m[2].replace(/ or /, ' or ')) : null, iv: true };
  if ((m = t.match(/^you(?:'ve| have) cast (another|an?|one) spell this turn$/i))) return { test: 'b113-cast-count', min: 1, other: /another/i.test(m[1]), alts: null, iv: true };
  if (/^you(?:'ve| have) cast both a creature spell and a noncreature spell this turn$/i.test(t)) return { test: 'b113-cast-both', iv: true };
  if (/^you (?:didn'?t|haven'?t) cast (?:a|any) spells? this turn$/i.test(t) || /^you(?:'ve| have) not cast (?:a|any) spells? this turn$/i.test(t)) return { test: 'b113-cast-none', iv: true };
  if (/^you (?:didn'?t|haven'?t) cast (?:a|any) spells? from your hand this turn$/i.test(t)) return { test: 'b113-cast-none-hand', iv: true };
  if (/^you (?:didn'?t|haven'?t) attack(?:ed)? this turn$/i.test(t)) return { test: 'b113-attacked', not: true, iv: true };
  if (/^this creature (?:attacked|dealt combat damage) this turn$/i.test(t) && /attacked/.test(t)) return { test: 'b113-src-attacked', iv: true };
  if (/^this creature (?:didn'?t|did not) attack this turn$/i.test(t)) return { test: 'b113-src-attacked', not: true, iv: true };
  if (/^this creature attacked or blocked this combat$/i.test(t)) return { test: 'b113-src-combat', iv: true };
  if (/^it (?:is|'s) not your turn$/i.test(t) || /^it isn'?t your turn$/i.test(t)) return { test: 'not-your-turn' };
  if (/^it (?:is|'s) not their turn$/i.test(t)) return { test: 'b113-not-their-turn' };
  // ---- X ----
  if ((m = t.match(/^x is (\w+) or (more|greater|less)$/i)) && cnt(m[1]) != null) return { test: 'b113-x', n: cnt(m[1]), less: /less/i.test(m[2]) };
  // ---- this spell / this permanent: how it was cast ----
  if ((m = t.match(/^(?:this spell|it|this creature|this permanent|this artifact|this enchantment) was cast from (?:your |a |an? )?(graveyard|exile|hand|library|anywhere other than your hand)$/i)) || (m = t.match(/^you cast (?:it|this spell|this creature|this permanent) from (?:your |a )?(graveyard|exile|hand|library)$/i)))
    return { test: 'b113-cast-from', zone: /other than/.test(m[1]) ? 'not-hand' : m[1].toLowerCase(), iv: false };
  if ((m = t.match(/^you (didn'?t|did not) cast (?:it|this spell|this creature) from your hand$/i))) return { test: 'b113-cast-from', zone: 'not-hand' };
  if (/^(?:this spell|it) wasn'?t cast from your hand$/i.test(t)) return { test: 'b113-cast-from', zone: 'not-hand' };
  if ((m = t.match(/^you cast (?:it|this spell) during your main phase$/i)) || /^this spell was cast during your main phase$/i.test(t)) return { test: 'b49-cast-in-main' };
  if ((m = t.match(/^(?:this spell|it) was foretold$/i))) return { test: 'b113-cast-mode', mode: 'foretell' };
  if ((m = t.match(/^(?:this spell|it)'?s? (?:was )?(?:madness|flashback|escape|overload|prototype)(?: cost)? (?:was )?(?:paid|cast)$/i))) return null;
  if ((m = t.match(/^(\w+) or more mana was spent to cast (?:it|this spell|that spell|this creature)$/i)) && cnt(m[1]) != null) return { test: 'b113-mana-spent', min: cnt(m[1]), which: /that spell/i.test(t) ? 'event' : 'self' };
  if ((m = t.match(/^at least (\w+) mana was spent to cast (?:it|this spell|that spell|this creature)$/i)) && cnt(m[1]) != null) return { test: 'b113-mana-spent', min: cnt(m[1]), which: /that spell/i.test(t) ? 'event' : 'self' };
  if ((m = t.match(/^(?:the )?amount of mana spent to cast (?:it|this spell) was less than its mana value$/i))) return { test: 'b113-mana-less-than-mv' };
  // ---- the card "it" is ----
  if ((m = t.match(new RegExp(`^(${REF}) (?:is|was|are|were) (not |n't )?(?:a |an )?(.+)$`, 'i'))) || (m = t.match(new RegExp(`^(${REF}) (isn'?t|wasn'?t) (?:a |an )?(.+)$`, 'i')))) {
    const neg = /^(?:not |n't|isn'?t|wasn'?t)/i.test(m[2] || '') || /n'?t$/i.test(m[2] || ''), body = m[3].trim();
    if (!/\b(?:attacking|blocking|tapped|untapped|attacked|blocked|renowned|suspected|enchanted|equipped|dealt|countered|exiled|destroyed|kicked|bargained|cast|sacrificed|put|declared|being)\b/i.test(body)) {
      const alts = descOk(body.replace(/^(?:a|an) /, ''));
      if (alts && !alts.some(a => a.token !== null)) return { test: 'b113-ref-is', alts, not: neg, bind: 'lastTarget', that: /spell/i.test(m[1]) };
    }
  }
  // Only the present tense: "it was attacking / tapped / blocking" asks about a card that has since changed zones, whose state is no longer known.
  if ((m = t.match(new RegExp(`^(${REF}) is (attacking|blocking|tapped|untapped|renowned|suspected)$`, 'i')))) return { test: 'b113-ref-state', state: m[2].toLowerCase(), bind: 'lastTarget' };
  if ((m = t.match(new RegExp(`^(${REF}) (?:isn'?t|is not) (attacking|blocking|tapped|untapped|suspected)$`, 'i')))) return { test: 'b113-ref-state', state: m[2].toLowerCase(), not: true, bind: 'lastTarget' };
  if ((m = t.match(new RegExp(`^(?:${REF}'s|its|that (?:creature|permanent|card|spell)'s) mana value (?:is|was) (\\w+) or (less|greater|more)$`, 'i'))) || (m = t.match(new RegExp(`^(?:${REF}) (?:has|had) mana value (\\w+) or (less|greater|more)$`, 'i')))) { if (cnt(m[1]) != null) return { test: 'b113-ref-mv', n: cnt(m[1]), less: /less/i.test(m[2]), bind: 'lastTarget' }; }
  if ((m = t.match(new RegExp(`^(?:${REF}'s|its|that (?:creature|permanent|spell)'s) (power|toughness) is (\\w+) or (less|greater|more)$`, 'i'))) && cnt(m[2]) != null) return { test: 'b113-ref-stat', stat: m[1].toLowerCase(), n: cnt(m[2]), less: /less/i.test(m[3]), bind: 'lastTarget' };
  if ((m = t.match(new RegExp(`^(?:${REF}) (?:has|had) (\\w+) or more ([+\\-\\d/a-z]+) counters on (?:it|them)$`, 'i'))) && cnt(m[1]) != null) return { test: 'b113-ref-counters', counter: m[2].toLowerCase(), min: cnt(m[1]), bind: 'lastTarget' };
  if ((m = t.match(new RegExp(`^(?:${REF}) (?:has|had) (?:no|an?) ([+\\-\\d/a-z]+) counters? on (?:it|them)$`, 'i')))) return { test: 'b113-ref-counters', counter: m[1].toLowerCase(), min: /\bno\b/i.test(t) ? 0 : 1, none: /\bno\b/i.test(t), bind: 'lastTarget' };
  if ((m = t.match(new RegExp(`^(?:${REF}) (?:has|had) no counters on (?:it|them)$`, 'i')))) return { test: 'b113-ref-counters', counter: '*', min: 0, none: true, bind: 'lastTarget' };
  if ((m = t.match(new RegExp(`^(?:${REF}) (?:has|had) (flying|reach|trample|haste|vigilance|deathtouch|lifelink|menace|first strike|double strike|toxic|defender|hexproof|indestructible)$`, 'i')))) return { test: 'b113-ref-keyword', keyword: m[1].toLowerCase(), bind: 'lastTarget' };
  if (/^it shares a creature type with this creature$/i.test(t) || /^it shares a creature type with this permanent$/i.test(t)) return { test: 'b113-shares-type', bind: 'lastTarget' };
  // ---- this permanent ----
  if ((m = t.match(/^this (?:permanent|creature|artifact|enchantment|land) (?:is|was) (?:a|an) (.+)$/i)) && !/^(?:token|copy)$/i.test(m[1]) && descOk(m[1])) return { test: 'b113-src-is', alts: descOk(m[1]) };
  if ((m = t.match(/^this (?:permanent|creature|artifact|enchantment|land|Equipment|Aura|Vehicle) is (tapped|untapped)$/i))) return { test: m[1].toLowerCase() === 'tapped' ? 'source-tapped' : 'source-untapped', iv: false };
  if ((m = t.match(/^this (?:permanent|creature|artifact|enchantment|land|Equipment|Aura|Vehicle) (?:is|isn'?t|is not) (?:a |an )?(?:un)?(tapped|untapped|attacking|blocking|suspected|enchanted|equipped|renowned)$/i)) && !/^(?:tapped|untapped)$/i.test(m[1])) return { test: 'b113-src-state', state: m[1].toLowerCase(), not: /n'?t|not/i.test(t) };
  if ((m = t.match(/^this (?:permanent|creature|artifact|enchantment|land) is (attacking|blocking)$/i))) return { test: 'b113-src-state', state: m[1].toLowerCase() };
  if ((m = t.match(/^this (?:permanent|creature|artifact|enchantment|land) (?:has|had) (\w+) or more ([+\-\d/a-z]+) counters on it$/i)) && cnt(m[1]) != null) return { test: 'b113-src-counters', counter: m[2].toLowerCase(), min: cnt(m[1]) };
  if ((m = t.match(/^this (?:permanent|creature|artifact|enchantment|land)(?:'s)? (?:power|toughness) is (\w+) or (greater|less)$/i)) && cnt(m[1]) != null) return { test: 'b113-src-stat', stat: /power/i.test(t) ? 'power' : 'toughness', n: cnt(m[1]), less: /less/i.test(m[2]) };
  if ((m = t.match(/^this permanent'?s? (power) is (\w+) or greater$/i)) && cnt(m[2]) != null) return { test: 'b113-src-stat', stat: 'power', n: cnt(m[2]), less: false };
  if ((m = t.match(/^this (?:permanent|creature) has (\w+) or more (power|toughness)$/i)) && cnt(m[1]) != null) return { test: 'b113-src-stat', stat: m[2].toLowerCase(), n: cnt(m[1]), less: false };
  return null;
}

// ---- evaluation ----
const cmpN = (v, op, n) => op === 'le' ? v <= n : op === 'ge' ? v >= n : v === n;
export function conditionHoldsB113(game, controllerId, effect, bindings = {}) {
  const me = playerById(game, controllerId), tl = d => String(d?.typeLine || '');
  const T = tally(game), turn = Number(game.turnNumber || 0);
  switch (effect.test) {
    case 'b113-src-zone': return locateCardInGame(game, bindings.sourceId)?.zone === effect.zone;
    case 'b113-poison': return (game.players || []).some(p => !p.eliminated && p.playerId !== controllerId && Number(p.poison || 0) >= effect.min);
    case 'b113-each-life': return (game.players || []).filter(p => !p.eliminated).every(p => Number(p.life || 0) <= effect.n);
    case 'b113-total-toughness': return (me?.deck?.battlefield || []).filter(c => /\bCreature\b/.test(tl(definitionFor(game, c)))).reduce((n, c) => n + Math.max(0, effectiveToughness(c, definitionFor(game, c), game)), 0) >= effect.min;
    case 'b113-and': return effect.parts.every(p => conditionHolds(game, controllerId, p, bindings));
    case 'b113-moved-this-way': return [].concat(effect.verb === 'discarded' ? (bindings.discardedCards || []) : (bindings.lastMoved || [])).some(id => { const h = locateCardInGame(game, id); return !!h && fitsCard(game, h.card, effect.alts); });
    case 'b113-life': if (effect.op === 'lt-start') return Number(me?.life || 0) < Number(game.rules?.startingLife || me?.startingLife || 40); return cmpN(Number(me?.life || 0), effect.op, Number(effect.n) + (effect.plusStart ? Number(game.rules?.startingLife || me?.startingLife || 40) : 0));
    case 'b113-life-vs': {
      const others = (game.players || []).filter(p => !p.eliminated && p.playerId !== controllerId), mine = Number(me?.life || 0);
      const f = p => effect.cmp === 'more' ? mine > Number(p.life || 0) : mine < Number(p.life || 0);
      return effect.each ? others.length > 0 && others.every(f) : others.some(f);
    }
    case 'b113-opp-life': return (game.players || []).some(p => !p.eliminated && p.playerId !== controllerId && Number(p.life || 0) <= effect.n);
    case 'b113-hand-vs': {
      const others = (game.players || []).filter(p => !p.eliminated && p.playerId !== controllerId), mine = (me?.deck?.hand || []).length, f = p => mine > (p.deck?.hand || []).length;
      return effect.each ? others.length > 0 && others.every(f) : others.some(f);
    }
    case 'b113-gy-desc': return (me?.deck?.graveyard || []).filter(c => fitsCard(game, c, effect.alts)).length >= effect.min;
    case 'b113-any-gy': {
      const id = bindings.player0 || bindings.eventPlayer, ps = id ? (game.players || []).filter(p => p.playerId === id) : (game.players || []);
      return ps.some(p => (p.deck?.graveyard || []).length >= effect.min);
    }
    case 'b113-opp-gy': return (game.players || []).some(p => !p.eliminated && p.playerId !== controllerId && (p.deck?.graveyard || []).length >= effect.min);
    case 'b113-player-hand': {
      const id = bindings.player0 || bindings.eventPlayer, p = playerById(game, id), n = (p?.deck?.hand || []).length;
      return !!p && (effect.more ? n >= effect.n : n <= effect.n);
    }
    case 'b113-designation': {
      const has = p => (p.statuses || []).some(s => String(s).toLowerCase() === effect.what);
      if (effect.none) return !(game.players || []).some(p => !p.eliminated && has(p));
      return effect.opp ? (game.players || []).some(p => !p.eliminated && p.playerId !== controllerId && has(p)) : !!me && has(me);
    }
    case 'b113-dungeon': return Number(me?.dungeonsCompleted || me?.counters?.dungeonsCompleted || 0) > 0;
    case 'b113-left': return !!T && (T.left || []).filter(r => whoFits(effect.who, r.controllerId, controllerId) && fitsTypeLineB113(r.typeLine, r.token, effect.alts)).length >= effect.min;
    case 'b113-died': return !!T && (T.died || []).filter(r => whoFits(effect.who, r.controllerId, controllerId) && fitsTypeLineB113(r.typeLine, r.token, effect.alts)).length >= effect.min;
    case 'b113-entered': return !!T && (T.entered || []).filter(r => r.controllerId === controllerId && (!effect.other || !r.id || r.id !== bindings.sourceId) && fitsTypeLineB113(r.typeLine, r.token, effect.alts)).length >= effect.min;
    case 'b113-life-lost': {
      const row = id => { const x = game.lostLifeAmount?.[id]; return x && x.turn === turn ? Number(x.n || 0) : (game.lostLifeTurn?.[id] === turn ? 1 : 0); };
      const ids = (game.players || []).filter(p => !p.eliminated && (effect.who === 'you' ? p.playerId === controllerId : effect.who === 'opp' ? p.playerId !== controllerId : true)).map(p => p.playerId);
      return ids.some(id => row(id) >= effect.min);
    }
    case 'b113-gained-or-lost': { const g = game.gainedLifeTurn?.[controllerId], l = game.lostLifeTurn?.[controllerId]; return (!!g && g.turn === turn) || l === turn; }
    case 'b113-gained-and-lost': { const g = game.gainedLifeTurn?.[controllerId], l = game.lostLifeTurn?.[controllerId]; return !!g && g.turn === turn && l === turn; }
    case 'b113-drew': return Number(T?.draws?.[controllerId] || 0) >= effect.min;
    case 'b113-discarded': return Number(T?.discards?.[controllerId] || 0) >= effect.min;
    case 'b113-cast-count': {
      const list = me?.counters?.castThisTurn || [], inCast = !!spellObjB113(game, bindings) || bindings.eventManaSpent != null || !!bindings.eventStackId;
      const fit = list.filter(x => !effect.alts || fitsTypeLineB113(x.typeLine, false, effect.alts, x.colors || []));
      return fit.length - (effect.other && inCast && (!effect.alts || true) ? 1 : 0) >= effect.min;
    }
    case 'b113-cast-both': { const list = me?.counters?.castThisTurn || []; return list.some(x => /\bCreature\b/.test(x.typeLine)) && list.some(x => !/\bCreature\b/.test(x.typeLine)); }
    case 'b113-cast-none': return !(me?.counters?.castThisTurn || []).length;
    case 'b113-cast-none-hand': return !(me?.counters?.castThisTurn || []).length || Number(T?.nonHandPlays?.[controllerId] || 0) >= (me?.counters?.castThisTurn || []).length;
    case 'b113-attacked': { const a = T?.attacked?.[controllerId]; const v = !!(a && a.length); return effect.not ? !v : v; }
    case 'b113-src-attacked': { const c = locateCardInGame(game, bindings.sourceId)?.card; const v = c?.attackedTurn === turn; return effect.not ? !v : v; }
    case 'b113-src-combat': { const c = locateCardInGame(game, bindings.sourceId)?.card; return c?.attackedTurn === turn || c?.blockedTurn === turn || !!c?.attacking || !!c?.blocking; }
    case 'b113-not-their-turn': return !!bindings.eventPlayer && game.activePlayerId !== bindings.eventPlayer;
    case 'b113-x': { const x = Number(bindings.X ?? bindings.x ?? 0); return effect.less ? x <= effect.n : x >= effect.n; }
    case 'b113-cast-from': {
      const { from, cast } = castInfoB113(game, bindings);
      if (!cast) return effect.zone === 'not-hand' ? false : false;
      return effect.zone === 'not-hand' ? from !== 'hand' : from === effect.zone;
    }
    case 'b113-cast-mode': { const { o, card } = castInfoB113(game, bindings); return (o?.castMode || card?.castMode) === effect.mode || (effect.mode === 'foretell' && !!(card?.foretold || o?.castMode === 'foretell')); }
    case 'b113-mana-spent': {
      if (effect.which === 'event' || (!spellObjB113(game, bindings) && bindings.eventManaSpent != null)) return Number(bindings.eventManaSpent ?? 0) >= effect.min;   // "cast it" in a cast trigger is the spell that was cast
      const { o, card } = castInfoB113(game, bindings); return Number(o?.manaSpentCount ?? card?.manaSpentCount ?? 0) >= effect.min;
    }
    case 'b113-mana-less-than-mv': { const { o, card } = castInfoB113(game, bindings), d = card && definitionFor(game, card); return !!o && !!d && Number(o.manaSpentCount ?? 0) < Number(d.manaValue ?? d.cmc ?? 0); }
    case 'b113-ref-is': {
      const hit = refCardB113(game, effect, bindings), id = refIdB113(effect, bindings);
      if (!hit) { if (id && id === bindings.eventCard && bindings.eventTypeLine) { const v = fitsTypeLineB113(bindings.eventTypeLine, !!bindings.eventToken, effect.alts, null); return effect.not ? !v : v; } return !!effect.not; }
      const v = fitsCard(game, hit.card, effect.alts); return effect.not ? !v : v;
    }
    case 'b113-ref-state': {
      const hit = refCardB113(game, effect, bindings), c = hit?.card; if (!c) return !!effect.not;
      const v = effect.state === 'tapped' ? !!c.tapped : effect.state === 'untapped' ? !c.tapped : effect.state === 'attacking' ? !!c.attacking || (game.combatState?.attackers || []).some(a => a.instanceId === c.instanceId) : effect.state === 'blocking' ? !!c.blocking || Object.values(game.combatState?.blocks || {}).flat().includes?.(c.instanceId) : effect.state === 'renowned' ? !!c.renowned : !!c.suspected;
      return effect.not ? !v : v;
    }
    case 'b113-ref-mv': { const hit = refCardB113(game, effect, bindings), d = hit && definitionFor(game, hit.card); if (!d) return false; const mv = Number(d.manaValue ?? d.cmc ?? 0); return effect.less ? mv <= effect.n : mv >= effect.n; }
    case 'b113-ref-stat': { const hit = refCardB113(game, effect, bindings), d = hit && definitionFor(game, hit.card); if (!d) return false; const v = effect.stat === 'power' ? effectivePower(hit.card, d, game) : effectiveToughness(hit.card, d, game); return effect.less ? v <= effect.n : v >= effect.n; }
    case 'b113-ref-counters': {
      const id = refIdB113(effect, bindings), hit = id && locateCardInGame(game, id);
      const own = (id && id === bindings.eventCard && bindings.eventCounters && hit?.zone !== 'battlefield' ? bindings.eventCounters : null) || hit?.card?.counters || {};
      const n = effect.counter === '*' ? Object.values(own).reduce((a, v) => a + Number(v || 0), 0) : Number(own[effect.counter] || 0);
      return effect.none ? n === 0 : n >= effect.min;
    }
    case 'b113-ref-keyword': { const hit = refCardB113(game, effect, bindings), d = hit && definitionFor(game, hit.card); return !!d && (d.keywords || []).some(k => String(k).toLowerCase() === effect.keyword) || !!d && new RegExp(`(?:^|\\n|, )${esc(effect.keyword)}\\b`, 'i').test(d.oracleText || ''); }
    case 'b113-shares-type': {
      const hit = refCardB113(game, effect, bindings), src = locateCardInGame(game, bindings.sourceId);
      if (!hit || !src) return false;
      const types = c => String(definitionFor(game, c)?.typeLine || '').split('—')[1]?.trim().split(/\s+/).filter(Boolean) || [], mine = types(src.card);
      return types(hit.card).some(w => mine.includes(w)) || (/\bChangeling\b/i.test(definitionFor(game, hit.card)?.oracleText || '') && mine.length > 0);
    }
    case 'b113-src-is': { const hit = locateCardInGame(game, bindings.sourceId); return !!hit && fitsCard(game, hit.card, effect.alts); }
    case 'b113-src-state': {
      const c = locateCardInGame(game, bindings.sourceId)?.card; if (!c) return false;
      const v = effect.state === 'attacking' ? !!c.attacking || (game.combatState?.attackers || []).some(a => a.instanceId === c.instanceId) : effect.state === 'blocking' ? !!c.blocking : effect.state === 'suspected' ? !!c.suspected : effect.state === 'renowned' ? !!c.renowned : effect.state === 'enchanted' ? (game.players || []).some(p => (p.deck?.battlefield || []).some(x => x.attachedTo === c.instanceId && /\bAura\b/.test(definitionFor(game, x)?.typeLine || ''))) : effect.state === 'equipped' ? (game.players || []).some(p => (p.deck?.battlefield || []).some(x => x.attachedTo === c.instanceId && /\bEquipment\b/.test(definitionFor(game, x)?.typeLine || ''))) : false;
      return effect.not ? !v : v;
    }
    case 'b113-src-counters': return Number(locateCardInGame(game, bindings.sourceId)?.card?.counters?.[effect.counter] || 0) >= effect.min;
    case 'b113-src-stat': { const hit = locateCardInGame(game, bindings.sourceId), d = hit && definitionFor(game, hit.card); if (!d) return false; const v = effect.stat === 'power' ? effectivePower(hit.card, d, game) : effectiveToughness(hit.card, d, game); return effect.less ? v <= effect.n : v >= effect.n; }
    default: return undefined;
  }
}
