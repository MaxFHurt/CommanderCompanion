// Card wordings added in build 111 (rules long tail, batch 5). Same hook points as effects-b110.js: compileB111Clause(c, ctx) is
// tried last (from compileB110Clause), compileB111Sequence from compileB110Sequence, applyB111 runs the effect kinds made here
// (from applyB110) and gatherB111 asks the requirement kinds made here (from gatherB110). Most wordings are read as an instruction
// the game already runs; every choice stays with the player who makes it.
import { numberFromText, locateCardInGame, definitionFor, moveCard, catalogHelpers as H } from './effects.js';

const N = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)';
const num = s => numberFromText(s) ?? (/^x$/i.test(String(s)) ? 'X' : null);
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const playerById = (game, id) => (game.players || []).find(p => p.playerId === id) || null;
const ok = inner => inner && !inner.unsupported.length && inner.effects.length;
const rxCache = new Map();
const rx = (src, flags = 'i') => { const k = `${flags}/${src}`; let r = rxCache.get(k); if (!r) { if (rxCache.size > 3000) rxCache.clear(); rxCache.set(k, (r = new RegExp(src, flags))); } return r; };
const SELF = '(?:SELFNAME|this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|Saga|Vehicle|Spacecraft|planeswalker|card|token))';

/** Damage prevention shields made here: "to creatures" / "by creatures your opponents control" (Forfend, Thwart the Enemy). */
export function shieldFitsB111(game, shield, targetId, sourceId) {
  if (shield.toCreatures) {
    const hit = locateCardInGame(game, targetId);
    if (!hit || hit.zone !== 'battlefield' || !/\bcreature\b/i.test(definitionFor(game, hit.card)?.typeLine || '')) return false;
  }
  if (shield.fromCreaturesOppOf) {
    const hit = sourceId ? locateCardInGame(game, sourceId) : null;
    if (!hit || hit.zone !== 'battlefield' || !/\bcreature\b/i.test(definitionFor(game, hit.card)?.typeLine || '')) return false;
    if ((hit.card.controllerId || hit.player?.playerId) === shield.fromCreaturesOppOf) return false;
  }
  return true;
}

/** Amounts made here (resolveAmount in effects.js calls this for kinds starting with "b111-"). */
export function evalAmountB111(game, controllerId, amount, bindings) {
  switch (amount.kind) {
    case 'b111-half-library': {
      const p = playerById(game, bindings[amount.playerBind] || controllerId);
      return Math.floor((p?.deck?.remainingLibrary?.length || 0) / 2);
    }
    case 'b111-count': return [].concat(bindings[amount.bind] || []).length;
    default: return 0;
  }
}

/** One sentence. Pushes onto ctx.effects / ctx.requirements and returns true when understood. */
export function compileB111Clause(c, ctx) {
  const { effects, requirements, sourceName } = ctx;
  const esc = x => String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SELFP = `(?:${SELF}|${esc(sourceName)}|${esc(String(sourceName).split(',')[0])}${/ of /.test(sourceName) ? `|${esc(String(sourceName).split(' ')[0])}` : ''})`;
  let m;

  // --- "Prevent all damage that would be dealt to creatures this turn." (Forfend, Blinding Fog) / "… by creatures your opponents control" (Thwart the Enemy)
  if (/^Prevent all damage that would be dealt to creatures this turn\.?$/i.test(c)) { effects.push({ kind: 'b111-prevent-all', toCreatures: true }); return true; }
  if (/^Prevent all damage that would be dealt this turn by creatures your opponents control\.?$/i.test(c)) { effects.push({ kind: 'b111-prevent-all', fromOpponentCreatures: true }); return true; }
  // --- "Target Merfolk can't be blocked this turn." (Daughter of the Deep): a creature type as the target.
  if ((m = c.match(/^Target ([A-Z][a-z]+) (can'?t be blocked this turn)\.?$/))) {
    const r = H.compileEffectText(`Target creature ${m[2]}.`, { sourceName });
    const t = r.supported && r.requirements.find(q => q.kind === 'target');
    if (t && r.effects.length) { t.scope = `target ${m[1].toLowerCase()} creature`; t.label = t.scope; effects.push(...r.effects); requirements.push(...r.requirements); return true; }
  }
  // --- Named creature tokens: "Create a 0/1 red Kobold creature token named Kobolds of Kher Keep." / "Create Marit Lage, a legendary 20/20 black Avatar creature token with flying and indestructible."
  {
    const COL = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
    const colorsOf = txt => (txt.match(/\b(white|blue|black|red|green)\b/gi) || []).map(w => COL[w.toLowerCase()]);
    const kws = txt => (txt || '').split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    if ((m = c.match(/^Create (a|an|one|two|three|four|X|\d+) (\d+)\/(\d+) (colorless|(?:white|blue|black|red|green)(?: and (?:white|blue|black|red|green))?) ((?:[A-Z][a-z]+ )+?)(artifact )?creature tokens? named ([A-Z][^.]*?)(?: with ([a-z ,]+))?\.?$/))) {
      const types = m[5].trim();
      effects.push({ kind: 'create-token', amount: num(m[1]), power: Number(m[2]), toughness: Number(m[3]), name: ctx.restore ? ctx.restore(m[7]) : m[7], typeLine: `Token ${m[6] ? 'Artifact ' : ''}Creature — ${types}`, keywords: kws(m[8]), colors: /colorless/i.test(m[4]) ? [] : colorsOf(m[4]) });
      return true;
    }
    if ((m = c.match(/^Create ([A-Z][A-Za-z' ,]*?), (a|an) (legendary )?(\d+)\/(\d+) (colorless|(?:white|blue|black|red|green)) ((?:[A-Z][a-z]+ )+?)(artifact )?creature token(?: with ([a-z ,]+))?\.?$/))) {
      effects.push({ kind: 'create-token', amount: 1, power: Number(m[4]), toughness: Number(m[5]), name: m[1], typeLine: `${m[3] ? 'Legendary ' : ''}Token ${m[8] ? 'Artifact ' : ''}Creature — ${m[7].trim()}`, keywords: kws(m[9]), colors: /colorless/i.test(m[6]) ? [] : colorsOf(m[6]) });
      return true;
    }
  }
  // --- "Target player gains twice X life." (Heliod's Intervention)
  if ((m = c.match(/^(Target player|You) gains? twice X life\.?$/i))) {
    const e = { kind: 'life', scope: 'you', amount: { kind: 'times', n: 2, of: 'X' }, deltaSign: 1 };
    if (/^target/i.test(m[1])) { e.bind = H.playerRequirement(requirements, 'player', 'Target player'); }
    effects.push(e); return true;
  }
  // --- "Counter target spell with mana value X." (Spell Blast, Kozilek, the Great Distortion)
  if (/^Counter target spell with mana value X\.?$/i.test(c)) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: 'spell', spellFilter: 'mv=X', label: 'target spell with mana value X' });
    effects.push({ kind: 'counter-spell', bind });
    return true;
  }
  // --- "Counter target spell that wasn't cast from its owner's hand." (Wash Away, cast without cleave)
  if (/^Counter target spell that wasn'?t cast from its owner'?s hand\.?$/i.test(c)) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: 'spell', spellFilter: 'notfromhand', label: "target spell that wasn't cast from its owner's hand" });
    effects.push({ kind: 'counter-spell', bind });
    return true;
  }
  // --- "(You may) have target player mill two cards." (Iceberg Cancrix): the same as the player milling.
  if ((m = c.match(/^(?:You may )?have (target player|target opponent|each opponent|each player) (mill|draw|discard) (.+)$/i))) {
    const r = H.compileEffectText(`${cap(m[1])} ${m[2].toLowerCase()}s ${m[3]}`, { sourceName });
    if (r.supported && r.effects.length) { effects.push(...r.effects); requirements.push(...r.requirements); return true; }
  }
  // --- "Gain control of target creature for as long as you control ~ [and ~ remains tapped]." / "… of that creature …" (Mind Flayer, Willbreaker, Willow Satyr, Hivis of the Scale): the control ends when the condition stops.
  if ((m = c.match(rx(`^Gain control of (target [a-z' ]+?|that creature|it) for as long as you control (${SELFP})( and (?:${SELFP}) remains tapped)?\\.?$`)))) {
    let bind;
    if (/^target/i.test(m[1])) {
      const r = H.compileEffectText(`Gain control of ${m[1]}.`, { sourceName }), t = r.supported && r.requirements.find(q => q.kind === 'target');
      if (!t || r.effects.length !== 1 || r.effects[0].kind !== 'gain-control') return false;
      requirements.push(...r.requirements); bind = t.bind;
    } else bind = /^it$/i.test(m[1]) ? 'b101It' : 'thatCard';
    effects.push({ kind: 'b110-gain-control-while', bind, mode: m[3] ? 'control-tapped' : 'control' });
    return true;
  }
  // --- "Gain control of target creature for as long as this creature remains on the battlefield." (Sower of Temptation, Cytoplast Manipulator, Giant's Grasp)
  if ((m = c.match(rx(`^Gain control of (target [a-z' +\\/0-9]+?) for as long as (${SELFP}) remains on the battlefield\\.?$`)))) {
    const r = H.compileEffectText(`Gain control of ${m[1]}.`, { sourceName }), t = r.supported && r.requirements.find(q => q.kind === 'target');
    if (t && r.effects.length === 1 && r.effects[0].kind === 'gain-control') { requirements.push(...r.requirements); effects.push({ kind: 'b110-gain-control-while', bind: t.bind, mode: 'battlefield' }); return true; }
  }
  // --- "Gain control of target creature for as long as that creature is enchanted." (Rootwater Matriarch) / "… that isn't of the chosen type for as long as this creature remains tapped." (Callous Oppressor)
  if ((m = c.match(/^Gain control of (target [a-z' +\/0-9]+?) for as long as that creature is enchanted\.?$/i))) {
    const r = H.compileEffectText(`Gain control of ${m[1]}.`, { sourceName }), t = r.supported && r.requirements.find(q => q.kind === 'target');
    if (t && r.effects.length === 1 && r.effects[0].kind === 'gain-control') { requirements.push(...r.requirements); effects.push({ kind: 'b110-gain-control-while', bind: t.bind, mode: 'enchanted' }); return true; }
  }
  if ((m = c.match(rx(`^Gain control of (target [a-z' +\\/0-9]+?) for as long as (${SELFP}) remains tapped\\.?$`)))) {
    const r = H.compileEffectText(`Gain control of ${m[1]}.`, { sourceName }), t = r.supported && r.requirements.find(q => q.kind === 'target');
    if (t && r.effects.length === 1 && r.effects[0].kind === 'gain-control') { requirements.push(...r.requirements); effects.push({ kind: 'b110-gain-control-while', bind: t.bind, mode: 'tapped' }); return true; }
  }
  // --- Combat damage prevention: "… dealt to players" (Defend the Hearth), "… target creature would deal" (Falling Timber), "… dealt to and dealt by …" (Cephalid Illusionist), "… by creatures with power 4 or less" (Vine Snare)
  if (/^Prevent all combat damage that would be dealt to players this turn\.?$/i.test(c)) { effects.push({ kind: 'prevent-combat', scope: 'players' }); return true; }
  if ((m = c.match(/^Prevent all combat damage ((?:another )?target creature) would deal this turn\.?$/i))) { effects.push({ kind: 'prevent-combat', scope: 'by-card', bind: H.targetRequirement(requirements, m[1].toLowerCase(), m[1].toLowerCase()) }); return true; }
  if ((m = c.match(rx(`^Prevent all combat damage that would be dealt to and dealt by (target creature you control|${SELFP}) this turn\\.?$`)))) {
    effects.push({ kind: 'prevent-combat', scope: 'card', bind: /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature you control', 'target creature you control') : 'sourceId' });
    return true;
  }
  if ((m = c.match(/^Prevent all combat damage that would be dealt this turn by creatures with power (\d+) or less\.?$/i))) { effects.push({ kind: 'prevent-combat', scope: 'power-le', limit: Number(m[1]) }); return true; }
  // --- "Target player can't play lands this turn." (Turf Wound, Pardic Miner)
  if ((m = c.match(/^(target player|target opponent|your opponents|each opponent|players|each player) can'?t play lands this turn\.?$/i))) {
    if (/^target/i.test(m[1])) effects.push({ kind: 'b111-no-lands', scope: 'target', bind: H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', cap(m[1])) });
    else effects.push({ kind: 'b111-no-lands', scope: /opponent/i.test(m[1]) ? 'opponents' : 'all' });
    return true;
  }
  // --- "Target player mills half their library, rounded down." (Traumatize)
  if ((m = c.match(/^(target player|target opponent) mills half their library, rounded down\.?$/i))) {
    const bind = H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', cap(m[1]));
    effects.push({ kind: 'mill', scope: 'you', bind, amount: { kind: 'b111-half-library', playerBind: bind } });
    return true;
  }
  // --- "Destroy each nonland permanent with mana value X or less." (Gaze of Granite) / "… equal to the number of charge counters on this artifact" (Ratchet Bomb, Blast Zone, Engineered Explosives)
  if ((m = c.match(/^Destroy each (nonland permanent|creature|artifact|permanent) with mana value (X or less|equal to the number of ([a-z]+) counters on (?:this (?:artifact|land|creature|permanent|enchantment)|SELFNAME))\.?$/i))) {
    const filter = m[1].toLowerCase() === 'nonland permanent' ? 'permanent|non:land' : m[1].toLowerCase();
    if (/^X/i.test(m[2])) effects.push({ kind: 'zone-each', scope: 'all', filter, to: 'graveyard', destroy: true, mvMode: 'le', amount: 'X' });
    else effects.push({ kind: 'zone-each', scope: 'all', filter, to: 'graveyard', destroy: true, mvMode: 'eq', amount: { kind: 'b101-source-counters', counter: m[3].toLowerCase() } });
    return true;
  }
  // --- "Gain control of all permanents you own." (Brand, Gruul Charm)
  if (/^Gain control of all permanents you own\.?$/i.test(c)) { effects.push({ kind: 'b111-regain-own' }); return true; }
  // --- "Each player's life total becomes the number of creatures they control." (Biorhythm)
  if (/^Each player'?s life total becomes the number of creatures they control\.?$/i.test(c)) { effects.push({ kind: 'b111-life-creatures' }); return true; }
  // --- "Return the top creature card of your graveyard to the battlefield." (Shallow Grave, Corpse Dance): the card most recently put there.
  if (/^Return the top creature card of your graveyard to the battlefield\.?$/i.test(c)) { effects.push({ kind: 'b111-top-creature-return' }); return true; }
  // --- "Counter target spell if its mana value is X." (Disrupting Shoal): X is the mana value of the card exiled for its alternative cost, or the X paid.
  if (/^Counter target spell if its mana value is X\.?$/i.test(c)) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: 'spell', label: 'target spell' });
    effects.push({ kind: 'condition', test: 'b111-stack-mv-x', stackBind: bind, skip: 1 }, { kind: 'counter-spell', bind });
    return true;
  }
  // --- "Target red or green creature gets -2/-0 until end of turn." / "Target 1/1 creature gets +2/+1 until end of turn." (Wilderness Hypnotist, The Seedcore): the descriptor is a limit on the target.
  if ((m = c.match(/^Target ((?:white|blue|black|red|green)(?: or (?:white|blue|black|red|green))?|\d+\/\d+) (creature) (gets .+)$/i))) {
    const r = H.compileEffectText(`Target creature ${m[3]}`, { sourceName });
    const t = r.supported && r.requirements.find(q => q.kind === 'target');
    if (t && r.effects.length) {
      t.scope = `target ${m[1].toLowerCase()} creature`; t.label = t.scope;
      effects.push(...r.effects); requirements.push(...r.requirements);
      return true;
    }
  }
  // --- "Target creature and all other creatures with the same name as that creature get +2/+2 until end of turn." (Echoing Courage, Bile Blight)
  if ((m = c.match(/^Target creature and all other creatures with the same name as that creature get ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))) {
    effects.push({ kind: 'b111-pump-same-name', bind: H.targetRequirement(requirements, 'target creature', 'target creature'), power: Number(m[1]), toughness: Number(m[2]) });
    return true;
  }
  // --- "Creatures of the creature type of your choice get +X/+X until end of turn." (Tribal Unity, Witch's Vengeance)
  if ((m = c.match(/^Creatures of the creature type of your choice get ([+-](?:\d+|X))\/([+-](?:\d+|X)) until end of turn\.?$/i))) {
    const bind = `creatureType${requirements.length}`;
    requirements.push({ kind: 'creature-type-choice', bind, label: 'Choose a creature type' });
    effects.push({ kind: 'choose-creature-type', bind }, { kind: 'b111-pump-type', power: m[1], toughness: m[2] });
    return true;
  }
  // --- "Sacrifice this creature at the beginning of the next end step." (Pyric Salamander, Varchild's Crusader)
  if ((m = c.match(rx(`^Sacrifice (${SELFP}) at the beginning of the next end step\\.?$`)))) {
    effects.push({ kind: 'delay', when: { event: 'end-step', whose: 'any', sameTurn: true }, effects: [{ kind: 'sacrifice', bind: 'sourceId' }], requirements: [] });
    return true;
  }
  return false;
}

/** Sentences that need their neighbours. Returns { part, consumed } or null. */
export function compileB111Sequence(clauses, i, { sourceName, parts = [] }) {
  const clean = x => String(x || '').replace(/\([^()]*\)/g, '').trim();
  const c0 = clean(clauses[i]);
  let m, mm;
  // --- "Gain control of target noncreature spell. You may choose new targets for it." (Commandeer): the spell stays on the stack under your control.
  if ((m = c0.match(/^Gain control of target ((?:noncreature |instant or sorcery |instant |sorcery )?)spell\.?$/i)) && /^You may choose new targets for it\.?$/i.test(clean(clauses[i + 1]))) {
    const bind = 'stack0', pick = 'retarget1', f = m[1].trim().toLowerCase().replace(/ or /g, '|');
    return { part: { effects: [{ kind: 'b111-steal-spell', stackBind: bind }, { kind: 'retarget-stack', stackBind: bind, bind: pick }],
      requirements: [{ kind: 'stack-target', bind, scope: 'spell', spellFilter: f || null, label: `target ${m[1]}spell`.replace(/\s+/g, ' ') }, { kind: 'retarget-stack', bind: pick, stackBind: bind, single: false, mustChange: false }], unsupported: [] }, consumed: 2 };
  }
  // --- "<Source> deals 5 damage to target creature. Destroy all Equipment attached to that creature." (Blastfire Bolt, Turn to Slag, Fires of Mount Doom)
  if (/^Destroy all Equipment attached to that creature\.?$/i.test(c0)) {
    const prior = [...parts.flatMap(p => p.effects || [])].reverse().find(e => typeof e.bind === 'string' && /^target\d*$/.test(e.bind));
    if (prior) return { part: { effects: [{ kind: 'b111-destroy-equipment', bind: prior.bind }], requirements: [], unsupported: [] }, consumed: 1 };
  }
  // --- "<Source> deals 1 damage to each of up to three target creatures. Those creatures can't block this turn." (Wrap in Flames)
  if (/^Those creatures can'?t block this turn\.?$/i.test(c0)) {
    const prior = [...parts.flatMap(p => p.effects || [])].reverse().find(e => e.kind === 'b101-each-bound' && /^multi/.test(e.bind || ''));
    if (prior) return { part: { effects: [{ kind: 'restrict-many', bind: prior.bind, restriction: 'cant-block' }], requirements: [], unsupported: [] }, consumed: 1 };
  }
  // --- "Reveal any number of green cards in your hand. Target creature gets +X/+X until end of turn, where X is the number of cards revealed this way." (Scent of Ivy, Ivy Seer, …)
  if ((m = c0.match(/^Reveal any number of (white|blue|black|red|green) cards in your hand\.?$/i))) {
    const c1 = clean(clauses[i + 1]);
    const bind = `reveal${i}`, color = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[m[1].toLowerCase()];
    const base = { effects: [{ kind: 'set-x', amount: { kind: 'b111-count', bind } }], requirements: [{ kind: 'b111-reveal-hand', bind, color, label: `any number of ${m[1].toLowerCase()} cards in your hand to reveal` }], unsupported: [] };
    let mm;
    if ((mm = c1.match(/^(.+?), where X is the number of cards revealed this way\.?$/i))) {
      const r = H.compileEffectText(`${mm[1]}.`, { sourceName });
      if (r.supported && r.effects.length) return { part: { effects: [...base.effects, ...r.effects], requirements: [...base.requirements, ...r.requirements.filter(q => !(q.kind === 'number' && q.bind === 'X'))], unsupported: [] }, consumed: 2 };
    }
    if ((mm = c1.match(/^You gain (\d+) life for each card revealed this way\.?$/i)))
      return { part: { effects: [...base.effects, { kind: 'life', scope: 'you', amount: { kind: 'times', n: Number(mm[1]), of: 'X' }, deltaSign: 1 }], requirements: base.requirements, unsupported: [] }, consumed: 2 };
  }
  return null;
}

export function applyB111(game, controllerId, effect, bindings, notes) {
  switch (effect.kind) {
    case 'b111-prevent-all': {
      game.damagePrevention = game.damagePrevention || [];
      game.damagePrevention.push({ anyTarget: true, amount: 99999, expires: 'cleanup', ...(effect.toCreatures ? { toCreatures: true } : {}), ...(effect.fromOpponentCreatures ? { fromCreaturesOppOf: controllerId } : {}) });
      notes.push(effect.toCreatures ? 'All damage that would be dealt to creatures is prevented this turn.' : 'All damage that would be dealt by creatures your opponents control is prevented this turn.');
      return true;
    }
    case 'b111-steal-spell': {
      const obj = (game.stack || []).find(x => x.id === bindings[effect.stackBind]);
      if (!obj) { notes.push('The spell is no longer on the stack.'); return true; }
      obj.controllerId = controllerId;
      notes.push(`${obj.label || 'The spell'} is now controlled by ${playerById(game, controllerId)?.displayName || 'you'}.`);
      return true;
    }
    case 'b111-pump-same-name': {
      const hit = locateCardInGame(game, bindings[effect.bind]);
      if (!hit || hit.zone !== 'battlefield') { notes.push('That creature is no longer on the battlefield.'); return true; }
      const name = definitionFor(game, hit.card)?.name;
      const ids = (game.players || []).flatMap(p => (p.deck?.battlefield || []).filter(c => c.instanceId === hit.card.instanceId || (definitionFor(game, c)?.name === name && /\bcreature\b/i.test(definitionFor(game, c)?.typeLine || ''))).map(c => c.instanceId));
      for (const id of ids) notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'pump', bind: 'b111Id', power: effect.power, toughness: effect.toughness, expires: 'cleanup' }], { ...bindings, b111Id: id }));
      return true;
    }
    case 'b111-pump-type': {
      const type = String(bindings.chosenCreatureType || '').trim();
      if (!type) { notes.push('No creature type was chosen.'); return true; }
      const ids = (game.players || []).flatMap(p => (p.deck?.battlefield || []).filter(c => { const d = definitionFor(game, c); return /\bcreature\b/i.test(d?.typeLine || '') && (new RegExp(`\\b${type.replace(/[^A-Za-z' -]/g, '')}s?\\b`, 'i').test(String(d?.typeLine || '').split('—').slice(1).join(' ')) || /\bChangeling\b/i.test(d?.oracleText || '')); }).map(c => c.instanceId));
      for (const id of ids) notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'pump', bind: 'b111Id', power: effect.power, toughness: effect.toughness, expires: 'cleanup' }], { ...bindings, b111Id: id }));
      return true;
    }
    case 'b111-destroy-equipment': {
      const id = bindings[effect.bind];
      const eq = (game.players || []).flatMap(p => p.deck?.battlefield || []).filter(c => c.attachedTo === id && /\bEquipment\b/i.test(definitionFor(game, c)?.typeLine || ''));
      for (const c of eq) notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'destroy', bind: 'b111Id' }], { ...bindings, b111Id: c.instanceId }));
      if (!eq.length) notes.push('No Equipment is attached to it.');
      return true;
    }
    case 'b111-no-lands': {
      const ps = effect.scope === 'target' ? [playerById(game, bindings[effect.bind])] : (game.players || []).filter(p => !p.eliminated && (effect.scope === 'all' || p.playerId !== controllerId));
      for (const p of ps.filter(Boolean)) { p.noLandPlayTurn = game.turnNumber; notes.push(`${p.displayName} can't play lands this turn.`); }
      return true;
    }
    case 'b111-regain-own': {
      for (const p of game.players || []) for (const c of [...(p.deck?.battlefield || [])]) {
        if (c.ownerId && c.ownerId !== (c.controllerId || p.playerId) && c.ownerId === controllerId && !c.token) {
          H.applyEffectsUnsafe(game, controllerId, [{ kind: 'gain-control', bind: 'regain' }], { ...bindings, regain: c.instanceId });
          notes.push(`${definitionFor(game, c)?.name || 'A permanent'} returns to your control.`);
        }
      }
      return true;
    }
    case 'b111-life-creatures': { 
      for (const p of (game.players || []).filter(q => !q.eliminated)) {
        const n = (p.deck?.battlefield || []).filter(c => (c.controllerId || p.playerId) === p.playerId && /\bcreature\b/i.test(definitionFor(game, c)?.typeLine || '')).length;
        notes.push(...H.applyEffectsUnsafe(game, p.playerId, [{ kind: 'set-life', scope: 'you', amount: n }], bindings));
      }
      return true;
    }
    case 'b111-top-creature-return': {
      const me = playerById(game, controllerId), gy = me?.deck?.graveyard || [];
      const top = [...gy].reverse().find(c => /\bcreature\b/i.test(definitionFor(game, c)?.typeLine || ''));
      if (!top) { notes.push('There is no creature card in the graveyard.'); return true; }
      moveCard(game, top.instanceId, 'battlefield', { controllerId, onEvent: e => H.emit(bindings, e) });
      bindings.lastMoved = [top.instanceId]; bindings.eventCard = top.instanceId; bindings.thatCard = top.instanceId;
      notes.push(`${definitionFor(game, top)?.name || 'A creature'} returns to the battlefield.`);
      return true;
    }
    default: return false;
  }
}

export function gatherB111(game, ctx, req, bindings, ask, key, title, base, util) {
  if (req.kind === 'b111-reveal-hand') {
    // "Reveal any number of <colour> cards in your hand": the caster picks which (none is allowed); the number is what the spell then counts.
    const me = ctx.player, rows = (me.deck.hand || []).filter(c => (util.defOf(game, c)?.colors || []).includes(req.color));
    bindings[req.bind] = rows.length ? [].concat(ask(key, () => ({ ...base, playerId: me.playerId, kind: 'choose-many', private: true, title, prompt: `Reveal ${req.label}.`, options: rows.map(c => util.cardOption(game, c, me, util.defOf(game, c)?.typeLine || '')), min: 0, max: rows.length }))) : [];
    return true;
  }
  return false;
}
