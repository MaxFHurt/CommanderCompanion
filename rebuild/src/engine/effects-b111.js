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
    default: return 0;
  }
}

/** One sentence. Pushes onto ctx.effects / ctx.requirements and returns true when understood. */
export function compileB111Clause(c, ctx) {
  const { effects, requirements, sourceName } = ctx;
  const esc = x => String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SELFP = `(?:${SELF}|${esc(sourceName)}|${esc(String(sourceName).split(',')[0])})`;
  let m;

  // --- "Prevent all damage that would be dealt to creatures this turn." (Forfend, Blinding Fog) / "… by creatures your opponents control" (Thwart the Enemy)
  if (/^Prevent all damage that would be dealt to creatures this turn\.?$/i.test(c)) { effects.push({ kind: 'b111-prevent-all', toCreatures: true }); return true; }
  if (/^Prevent all damage that would be dealt this turn by creatures your opponents control\.?$/i.test(c)) { effects.push({ kind: 'b111-prevent-all', fromOpponentCreatures: true }); return true; }
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
  let m;
  // --- "Gain control of target noncreature spell. You may choose new targets for it." (Commandeer): the spell stays on the stack under your control.
  if ((m = c0.match(/^Gain control of target ((?:noncreature |instant or sorcery |instant |sorcery )?)spell\.?$/i)) && /^You may choose new targets for it\.?$/i.test(clean(clauses[i + 1]))) {
    const bind = 'stack0', pick = 'retarget1', f = m[1].trim().toLowerCase().replace(/ or /g, '|');
    return { part: { effects: [{ kind: 'b111-steal-spell', stackBind: bind }, { kind: 'retarget-stack', stackBind: bind, bind: pick }],
      requirements: [{ kind: 'stack-target', bind, scope: 'spell', spellFilter: f || null, label: `target ${m[1]}spell`.replace(/\s+/g, ' ') }, { kind: 'retarget-stack', bind: pick, stackBind: bind, single: false, mustChange: false }], unsupported: [] }, consumed: 2 };
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
  return false;
}
