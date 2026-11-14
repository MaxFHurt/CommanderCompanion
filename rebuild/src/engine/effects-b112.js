// Card wordings added in build 112 (rules long tail, batch 5 part B). Hooked like effects-b111.js: compileB112Clause is tried
// last (from compileB111Clause), compileB112Sequence from compileB111Sequence, applyB112 from applyB111, gatherB112 from
// gatherB111, parseConditionB112 / conditionHoldsB112 from the build-110 condition hooks.
import { numberFromText, locateCardInGame, definitionFor, resolveAmount, catalogHelpers as H } from './effects.js';
import { effectivePower } from './combat.js';

const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const playerById = (game, id) => (game.players || []).find(p => p.playerId === id) || null;
const SELF = '(?:SELFNAME|this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|Saga|Vehicle|planeswalker|card|token))';
const esc = x => String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const selfPattern = sourceName => `(?:${SELF}|${esc(sourceName)}|${esc(String(sourceName).split(',')[0])}|${esc(String(sourceName).split(' // ')[0])}|${esc(String(sourceName).split(' // ')[0].split(',')[0])})`;
const isPrepareCard = (game, card) => { const b = game.cardDefinitions?.[card?.definitionId]; return b?.layout === 'prepare' && (b.cardFaces || []).length > 1; };

const KW = new Set(['flying', 'first strike', 'double strike', 'deathtouch', 'lifelink', 'vigilance', 'trample', 'haste', 'menace', 'reach', 'hexproof', 'indestructible', 'shroud', 'intimidate', 'fear', 'skulk', 'prowess', 'defender']);
/** "flying, vigilance, and trample" → keywords, or null if any is not a plain keyword. */
function KEYWORDS_OK(s) {
  const list = String(s || '').split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim().toLowerCase()).filter(Boolean);
  return list.every(k => KW.has(k)) ? list : null;
}
/** A group of creatures at the start of a sentence: { scope, filter, other, rest }. */
function massGroup(c) {
  let m;
  const sub = w => w.replace(/ves$/, 'f').replace(/^Mice$/, 'Mouse').replace(/oes$/, 'o').replace(/s$/, '');
  // words that start a sentence or describe creatures, not creature types; land types and Vehicles aren't creatures
  const NOT_TYPE = /^(?:Creatures?|Artifacts?|Permanents?|Lands?|Tokens?|Other|Attacking|Blocking|Tapped|Untapped|Each|All|Then|It|They|Those|These|Target|Equipped|Enchanted|Legendary|Nontoken|Modified|Vehicles?|Forests?|Islands?|Plains|Swamps?|Mountains?|Deserts?|Gates?|Caves?|Spacecraft|Planets?)$/;
  if ((m = c.match(/^(Other )?((?:[A-Z][a-z]+(?:folk)?, )*(?:[A-Z][a-z]+ (?:and|or) )?[A-Z][a-z]+) (?:creatures )?you control (gets? .+|gains? .+)$/))) {
    const words = m[2].split(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/).filter(Boolean);
    if (words.length === 1 && /^Legendary$/.test(words[0])) return { scope: 'you', filter: 'creature|type:legendary', other: !!m[1], rest: m[3] };   // Hajar
    if (!words.some(w => NOT_TYPE.test(w))) return { scope: 'you', filter: `creature|anysub:${words.map(sub).join(',')}`, other: !!m[1], rest: m[3] };
  }
  if ((m = c.match(/^(?:All|Each) (other )?([A-Z][a-z]+)(?: creatures)? (gets? .+|gains? .+)$/)) && !NOT_TYPE.test(m[2]))
    return { scope: 'all', filter: `creature|anysub:${sub(m[2])}`, other: !!m[1], rest: m[3] };
  if ((m = c.match(/^(Other )?creature tokens you control (gets? .+|gains? .+)$/i))) return { scope: 'you', filter: 'creature|token', other: !!m[1], rest: m[2] };
  if ((m = c.match(/^(Other )?(attacking|blocking|tapped|untapped) creatures you control (gets? .+|gains? .+)$/i))) return { scope: 'you', filter: `creature|${m[2].toLowerCase()}`, other: !!m[1], rest: m[3] };
  if ((m = c.match(/^(other )?(attacking|blocking) creatures (gets? .+|gains? .+)$/i))) return { scope: 'all', filter: `creature|${m[2].toLowerCase()}`, other: !!m[1], rest: m[3] };
  if ((m = c.match(/^Creatures you control with (?:a )?([a-z+\/0-9-]+) counters? on (?:it|them) (gets? .+|gains? .+)$/i))) return { scope: 'you', filter: `creature|counter:${m[1]}`, other: false, rest: m[2] };
  return null;
}

const CIPHER_TEXT = 'Whenever this creature deals combat damage to a player, you may copy the exiled card. If you do, you may cast the copy without paying its mana cost.';

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
  // --- Mass pumps and keywords for a group: "Elves you control get +2/+2 and gain deathtouch until end of turn." (Elvish Warmaster), "All Zombies gain menace until end of turn."
  // (Lord of the Accursed), "Creature tokens you control gain indestructible until end of turn." (Ainok Strike Leader), "Attacking creatures you control get +1/+0 and gain first strike …"
  {
    const g = massGroup(c);
    if (g) {
      const rest = g.rest;
      let mm, power = null, toughness = null, kw = '';
      if ((mm = rest.match(/^gets? ([+-](?:\d+|X))\/([+-](?:\d+|X))(?:,? and gains? ([a-z ,]+?))? until end of turn\.?$/i))) { power = mm[1]; toughness = mm[2]; kw = mm[3] || ''; }
      else if ((mm = rest.match(/^gains? ([a-z ,]+?) until end of turn\.?$/i))) kw = mm[1];
      else mm = null;
      const kws = KEYWORDS_OK(kw);
      if (mm && kws) {
        const base = { scope: g.scope, filter: g.filter, expires: 'cleanup', ...(g.other ? { exceptSource: true } : {}) };
        if (power !== null) effects.push({ kind: 'pump-each', ...base, power: /X/.test(power) ? power : Number(power), toughness: /X/.test(toughness) ? toughness : Number(toughness) });
        for (const keyword of kws) effects.push({ kind: 'grant-keyword-each', ...base, keyword });
        return true;
      }
    }
  }
  // --- "Until end of turn, target creature gets +1/+1 and gains lifelink." → the same sentence with "until end of turn" at the end (Resplendent Angel, Legion Leadership …)
  if ((m = c.match(/^Until end of turn, (.+?)\.?$/)) && !/until end of turn/i.test(m[1]) && !/[."]/.test(m[1]) && !/^it\b|\byour choice\b|\bprotection from\b|\bif\b|\bable to block\b/i.test(m[1])) {
    const r = H.compileEffectText(`${cap(m[1])} until end of turn.`, { sourceName });
    const kwOk = r.effects.every(e => !/^grant-keyword/.test(e.kind) || KW.has(String(e.keyword).toLowerCase()))
      && (!/\bbase power\b/i.test(m[1]) || r.effects.some(e => (e.kind === 'animate' && e.power != null) || e.fx?.power != null));   // "has base power and toughness 5/5" must not be dropped (Creeperhulk)
    if (r.supported && r.effects.length && !r.unsupported.length && kwOk) { effects.push(...r.effects); requirements.push(...r.requirements); return true; }
  }
  // --- A target the base reader only knows as "target creature": "Target artifact or creature gains hexproof and indestructible until end of turn." (Loran's Escape)
  if ((m = c.match(/^Target (artifact or creature|creature or artifact|creature or Vehicle|creature or planeswalker|artifact creature|creature token|nontoken creature|legendary creature|tapped creature|untapped creature) (gets? .+|gains? .+)$/i))) {
    const r = H.compileEffectText(`Target creature ${m[2]}`, { sourceName });
    const t = r.supported && !r.unsupported.length && r.requirements.filter(q => q.kind === 'target');
    if (t && t.length === 1 && r.requirements.length === 1 && r.effects.length) { t[0].scope = `target ${m[1].toLowerCase()}`; t[0].label = t[0].scope; effects.push(...r.effects); requirements.push(...r.requirements); return true; }
  }
  // --- "Target spell or permanent becomes blue." (Thoughtlace, Deathlace …) / "… becomes the color of your choice until end of turn." (Blind Seer)
  if ((m = c.match(/^Target spell or permanent becomes (white|blue|black|red|green|the color of your choice)( until end of turn)?\.?$/i))) {
    const bind = H.targetRequirement(requirements, 'target spell or permanent', 'target spell or permanent');
    const fixed = /^the color/i.test(m[1]) ? null : [m[1].toLowerCase()], colorBind = fixed ? null : `pickedColor${requirements.length}`;
    if (!fixed) requirements.push({ kind: 'b110-pick-color', bind: colorBind });
    effects.push({ kind: 'b112-recolor-any', bind, ...(fixed ? { colors: fixed } : { colorBind }), expires: m[2] ? 'cleanup' : null });
    return true;
  }
  // --- Endure N (Tarkir: Dragonstorm): "Put N +1/+1 counters on it or create an N/N white Spirit creature token." The controller chooses as it resolves.
  if ((m = prep.replace(/\s*\(Put [^)]*Spirit creature token\.?\)\s*/i, '').match(new RegExp(`^(${SELFP}|it|target creature you control) endures (\\d+|X)(?:, where X is (.+?))?\\.?$`, 'i')))) {
    let amount = /^X$/i.test(m[2]) ? 'X' : Number(m[2]);
    if (m[3]) { const a = H.countExprFromPhrase(m[3]); if (!a) return false; effects.push({ kind: 'set-x', amount: a }); }
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature you control', 'target creature you control') : /^it$/i.test(m[1]) ? 'eventCard' : 'sourceId';
    const pick = `endure${requirements.length}`;
    requirements.push({ kind: 'b112-endure', bind: pick, of: bind, amount, label: 'Endure' });
    effects.push({ kind: 'b112-endure', bind, pick, amount });
    return true;
  }
  // --- Cipher: "Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may
  // cast a copy of the encoded card without paying its mana cost." The creature gets that trigger (the Isochron Scepter wording, reading the encoded card).
  if (/^Cipher\.?$/i.test(prep)) {
    const bind = `cipher${requirements.length}`;
    requirements.push({ kind: 'choose-permanent', bind, scope: 'creature you control', label: 'a creature you control to encode this spell on (or none)', optional: true });
    effects.push({ kind: 'b112-cipher', bind });
    return true;
  }
  // --- Day and night: "It becomes night." (Into the Night), "It becomes day."
  if ((m = prep.match(/^(?:Then )?it becomes (day|night)\.?$/i))) { effects.push({ kind: 'b112-day-night', to: m[1].toLowerCase() }); return true; }
  // --- Empower Jace N (2026): "Put N loyalty counters on a Jace token you control. If you don't control one, first create a blue Jace planeswalker token with "[−1]: Surveil 1" and "[−3]: Draw a card."" X amounts go through the amount reader.
  if ((m = prep.replace(/\s*\(Put [^)]*Jace token[^)]*\)\s*/i, '').match(/^Empower Jace (\d+|X)(?:, where X is (.+?))?\.?$/i))) {
    let amount = /^X$/i.test(m[1]) ? 'X' : Number(m[1]);
    if (m[2]) { const a = H.countExprFromPhrase(m[2]); if (!a) return false; amount = a; }
    effects.push({ kind: 'b112-empower-jace', amount });
    return true;
  }
  return false;
}

/** Sentences that need their neighbours. Returns { part, consumed } or null. */
export function compileB112Sequence(clauses, i, { sourceName, parts = [] }) {
  const clean = x => String(x || '').replace(/\([^()]*\)/g, '').trim();
  const c0 = clean(clauses[i]);
  let m;
  // --- "Target creature gets +1/+1 until end of turn. Then if that creature has power 4 or greater, it gains first strike until end of turn." (Strider): "it" is that creature.
  if ((m = c0.match(/^(?:Then )?if that creature has power (\w+) or greater, it gains ([a-z ,]+?) until end of turn\.?$/i)) && KEYWORDS_OK(m[2])) {
    const prior = [...parts.flatMap(p => p.effects || [])].reverse().find(e => typeof e.bind === 'string' && /^target\d*$/.test(e.bind));
    if (prior) return { part: { effects: [{ kind: 'condition', test: 'b112-that-power', min: numberFromText(m[1]) ?? Number(m[1]), skip: KEYWORDS_OK(m[2]).length, thatBind: prior.bind }, ...KEYWORDS_OK(m[2]).map(keyword => ({ kind: 'grant-keyword', bind: prior.bind, keyword, enabled: true, expires: 'cleanup' }))], requirements: [], unsupported: [] }, consumed: 1 };
  }
  // --- "You may tap or untap target permanent, then you may tap or untap another target permanent." (Hidden Strings): two targets, two choices (both used to read the first target).
  if (/^You may tap or untap target permanent, then you may tap or untap another target permanent\.?$/i.test(c0)) {
    const one = (n, another) => ({ effects: [{ kind: 'condition', test: 'chosen', bind: `mayTap${n}`, skip: 1 }, { kind: 'tap-or-untap', bind: `tapTarget${n}`, howBind: `tapHow${n}` }],
      requirements: [{ kind: 'yes-no', bind: `mayTap${n}`, label: `Tap or untap ${another ? 'another ' : ''}target permanent?` }, { kind: 'target', bind: `tapTarget${n}`, scope: 'target permanent', label: `${another ? 'another ' : ''}target permanent`, optional: true, ...(another ? { excludeBind: 'tapTarget0' } : {}) }, { kind: 'choose-text', bind: `tapHow${n}`, options: ['Tap', 'Untap'], label: 'Tap or untap the permanent?' }] });
    const a = one(0, false), b = one(1, true);
    return { part: { effects: [...a.effects, ...b.effects], requirements: [...a.requirements, ...b.requirements], unsupported: [] }, consumed: 1 };
  }
  // --- "If it's night, it becomes day. Otherwise, it becomes night." (The Celestus): one switch, read before either half changes it.
  if (/^If it(?:'|’)s night, it becomes day\.?$/i.test(c0) && /^Otherwise, it becomes night\.?$/i.test(clean(clauses[i + 1])))
    return { part: { effects: [{ kind: 'b112-day-night', to: 'toggle' }], requirements: [], unsupported: [] }, consumed: 2 };
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
    case 'b112-recolor-any': {
      const id = bindings[effect.bind], obj = (game.stack || []).find(x => x.id === id && (x.kind === 'spell' || x.kind === 'spell-copy'));
      if (!obj) { notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ ...effect, kind: 'b110-recolor' }], bindings)); return true; }   // a permanent: the build-110 colour change
      const CODE = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
      const names = effect.colors || [].concat(bindings[effect.colorBind] || []), colors = names.map(n => CODE[String(n).toLowerCase()]).filter(Boolean);
      if (!colors.length) { notes.push('No color was chosen.'); return true; }
      obj.card.temporaryEffects = [...(obj.card.temporaryEffects || []), { kind: 'animate', addTypes: [], subtypes: [], keywords: [], colors, ...(effect.expires ? { expires: effect.expires } : {}) }];
      notes.push(`${obj.label || 'The spell'} becomes ${names.join(' and ')}.`);
      return true;
    }
    case 'b112-endure': {
      const n = Math.max(0, Number(resolveAmount(game, controllerId, effect.amount, bindings) || 0));
      const id = bindings[effect.bind] || (/^(?:sourceId|eventCard)$/.test(effect.bind) ? bindings.sourceId : null), hit = id && locateCardInGame(game, id);
      const onField = hit && hit.zone === 'battlefield';
      if (n <= 0) { notes.push('It endures 0: nothing happens.'); return true; }
      if (onField && bindings[effect.pick] !== 'spirit') { H.addCounter(hit.card, '+1/+1', n); notes.push(`${definitionFor(game, hit.card)?.name || 'It'} endures ${n}: ${n} +1/+1 counter${n === 1 ? '' : 's'}.`); return true; }
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'create-token', amount: 1, power: n, toughness: n, name: 'Spirit', typeLine: 'Token Creature — Spirit', colors: ['W'] }], bindings));
      return true;
    }
    case 'b112-cipher': {
      // only the card itself, as it resolves (a copy is never encoded: resolvingSpellId is null for copies)
      const sid = bindings.sourceId, cid = bindings[effect.bind], host = cid && locateCardInGame(game, cid);
      if (!sid || game.resolvingSpellId !== sid || !host || host.zone !== 'battlefield') { if (cid) notes.push('The spell is not encoded.'); return true; }
      const spell = { card: (game.stack || []).find(x => x.card?.instanceId === sid)?.card || locateCardInGame(game, sid)?.card || { instanceId: sid } };
      game.spellExileSelf = sid;
      host.card.imprintIds = [...(host.card.imprintIds || []), sid];
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'grant-text', bind: 'cipherHost', texts: [CIPHER_TEXT], until: 'permanent' }], { ...bindings, cipherHost: cid }));
      notes.push(`${definitionFor(game, spell.card)?.name || 'The spell'} is encoded on ${definitionFor(game, host.card)?.name || 'the creature'}.`);
      return true;
    }
    case 'b112-day-night': {
      const was = game.dayNight || null, to = effect.to === 'toggle' ? (was === 'night' ? 'day' : 'night') : effect.to;
      game.dayNight = to;
      notes.push(`It becomes ${to}.`);
      if (was && was !== to) H.emit(bindings, { type: 'day-night-changed', to, playerId: controllerId });
      return true;
    }
    case 'b112-empower-jace': {
      const me = playerById(game, controllerId);
      if (!me) return true;
      const n = Math.max(0, Number(resolveAmount(game, controllerId, effect.amount, bindings) || 0));
      const isJace = c => c.token && (c.controllerId || controllerId) === controllerId && /\bPlaneswalker\b.*\bJace\b/.test(definitionFor(game, c)?.typeLine || '');
      let jace = (me.deck.battlefield || []).find(isJace);
      if (!jace) {
        const b = { ...bindings, lastCreated: [] };
        notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'create-token', amount: 1, name: 'Jace', typeLine: 'Token Planeswalker — Jace', oracleText: '−1: Surveil 1.\n−3: Draw a card.', colors: ['U'], loyalty: '1' }], b));
        jace = (me.deck.battlefield || []).find(c => c.instanceId === (b.lastCreated || []).slice(-1)[0]);
        if (jace) { jace.counters = { ...(jace.counters || {}), loyalty: 0 }; jace.loyaltyInitialised = true; }
      }
      if (!jace) return true;
      H.addCounter(jace, 'loyalty', n);
      jace.counters.loyalty = Number(jace.counters.loyalty || 0);
      notes.push(`Empower Jace ${n}: Jace has ${jace.counters.loyalty} loyalty.`);
      return true;
    }
    default: return false;
  }
}

export function gatherB112(game, ctx, req, bindings, ask, key, title, base, util) {
  if (req.kind === 'b112-endure') {
    // Endure: +1/+1 counters on the creature, or an N/N Spirit (always the Spirit if the creature has left the battlefield).
    const id = bindings[req.of] || (/^(?:sourceId|eventCard)$/.test(req.of) ? bindings.sourceId : null), hit = id && locateCardInGame(game, id);
    const n = Math.max(0, Number(resolveAmount(game, ctx.player.playerId, req.amount, bindings) || 0));
    if (!hit || hit.zone !== 'battlefield') { bindings[req.bind] = 'spirit'; return true; }
    const name = definitionFor(game, hit.card)?.name || 'it';
    bindings[req.bind] = ask(key, () => ({ ...base, playerId: ctx.player.playerId, kind: 'choose-one', title, prompt: `Endure ${n}: choose one.`, options: [{ id: 'counters', label: `Put ${n} +1/+1 counter${n === 1 ? '' : 's'} on ${name}` }, { id: 'spirit', label: `Create a ${n}/${n} white Spirit creature token` }] }));
    return true;
  }
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
  if ((m = t.match(/^it(?:'|’)s (day|night)$/i))) return { test: 'b112-is-daynight', v: m[1].toLowerCase() };
  if (/^it(?:'|’)s neither day nor night$/i.test(t)) return { test: 'b112-is-daynight', v: null };
  if (/^(?:this creature|it|SELFNAME|[A-Z][A-Za-z' ,-]+) (?:isn'?t|is not) prepared$/.test(t)) return { test: 'b112-prepared', not: true };
  if (/^(?:this creature|it|SELFNAME|[A-Z][A-Za-z' ,-]+) is prepared$/.test(t)) return { test: 'b112-prepared' };
  return null;
}
export function conditionHoldsB112(game, controllerId, effect, bindings = {}) {
  switch (effect.test) {
    case 'b112-is-daynight': return (game.dayNight || null) === effect.v;
    case 'b112-opp-more-hand': { const mine = (playerById(game, controllerId)?.deck?.hand || []).length; return (game.players || []).some(p => !p.eliminated && p.playerId !== controllerId && (p.deck?.hand || []).length > mine); }
    case 'b112-any-hand-le': return (game.players || []).some(p => !p.eliminated && (p.deck?.hand || []).length <= effect.n);
    case 'b112-gy-any-type': return (playerById(game, controllerId)?.deck?.graveyard || []).filter(c => effect.types.some(w => new RegExp(`\\b${w}\\b`, 'i').test(definitionFor(game, c)?.typeLine || ''))).length >= effect.min;
    case 'b112-that-power': {
      const id = (effect.thatBind && bindings[effect.thatBind]) || bindings.lastTarget || bindings.target0 || bindings.thatCard, hit = id && locateCardInGame(game, id);
      if (!hit || hit.zone !== 'battlefield') return false;
      return Number(effectivePower(hit.card, definitionFor(game, hit.card), game) || 0) >= effect.min;
    }
    case 'b112-prepared': { const v = !!locateCardInGame(game, bindings.sourceId)?.card?.prepared; return effect.not ? !v : v; }
    default: return undefined;
  }
}
