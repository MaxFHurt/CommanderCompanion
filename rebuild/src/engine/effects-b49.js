// Card wordings added in build 49 (the rest of the most-played cards, then the long tail).
// compileB49Clause(c, ctx) is tried by effects-catalog.js before it gives up on a sentence; compileB49Sequence sees the
// sentences around it (and the parts compiled so far); applyB49 runs the effect kinds made here and gatherB49 asks the
// resolve-time questions. Every choice stays with the player who makes it in the rules.
import { numberFromText, locateCardInGame, moveCard, definitionFor, resolveAmount, catalogHelpers as H } from './effects.js';
import { effectivePower } from './combat.js';
import { cardFitsWords } from './effects-catalog.js';

const N = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)';
const num = s => numberFromText(s) ?? (/^x$/i.test(String(s)) ? 'X' : null);
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const playerById = (game, id) => (game.players || []).find(p => p.playerId === id) || null;
const nameOf = (game, id) => definitionFor(game, locateCardInGame(game, id)?.card)?.name || 'a card';
const compile = (text, sourceName) => H.compileSingleClause(text, { sourceName });
const ok = inner => inner && !inner.unsupported.length && inner.effects.length;

/** One sentence. Pushes onto ctx.effects / ctx.requirements and returns true when understood. */
export function compileB49Clause(c, ctx) {
  const { effects, requirements, sourceName } = ctx;
  let m;
  // Dawn's Truce, Blossoming Defense-style: "You and permanents you control gain hexproof until end of turn."
  if ((m = c.match(/^You(?: and permanents you control)? gains? hexproof(?: and indestructible)? until end of turn\.?$/i))) {
    effects.push({ kind: 'player-hexproof' });
    if (/permanents you control/i.test(c)) {
      effects.push({ kind: 'grant-keyword-each', scope: 'you', filter: 'permanent', keyword: 'hexproof', expires: 'cleanup' });
      if (/indestructible/i.test(c)) effects.push({ kind: 'grant-keyword-each', scope: 'you', filter: 'permanent', keyword: 'indestructible', expires: 'cleanup' });
    }
    return true;
  }
  // "Return [up to] two target creature cards [each with mana value 2 or less] from your graveyard to your hand / the battlefield."
  if ((m = c.match(/^Return (up to )?(one|two|three|four|five|\d+) target ([a-z ,]*?)cards?( each with mana value \d+ or (?:less|greater))? from your graveyard to (your hand|the battlefield( tapped)?)\.?$/i))) {
    const n = num(m[2]), bind = `graveMulti${requirements.length}`;
    const filter = `${m[3].trim()}${m[4] ? m[4].replace(/ each/i, '') : ''}`;
    requirements.push({ kind: 'graveyard-multi', bind, filter, max: n, min: m[1] ? 0 : n, label: `${m[1] ? 'up to ' : ''}${m[2]} ${m[3]}card${n === 1 ? '' : 's'}${m[4] || ''} in your graveyard` });
    effects.push(/hand/i.test(m[5]) ? { kind: 'graveyard-to-hand-many', bind } : { kind: 'graveyard-to-battlefield-many', bind, tapped: !!m[6] });
    return true;
  }
  // Consumed by Greed: "Target opponent sacrifices a creature with the greatest power among creatures they control."
  if ((m = c.match(/^(Target opponent|Target player|Each opponent) sacrifices an? (creature|[a-z]+ creature) with the greatest (power|toughness|mana value) among (?:creatures|[a-z]+ creatures) they control\.?$/i))) {
    const each = /^each/i.test(m[1]);
    const pb = each ? null : H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]);
    const bind = `greatest${requirements.length}`;
    requirements.push({ kind: 'b49-greatest', bind, playerBind: pb, each, filter: m[2].toLowerCase(), stat: m[3].toLowerCase(), label: `${m[2]} with the greatest ${m[3]}` });
    effects.push({ kind: 'sacrifice-chosen', bind });
    return true;
  }
  // High Tide, Bubbling Muck: "Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}."
  if ((m = c.match(/^Until end of turn, whenever (a player|you) taps? an? ([A-Z][a-z]+) for mana, (?:that player adds|add) an additional ((?:\{[WUBRGC]\})+)\.?$/i))) {
    const text = /you/i.test(m[1]) ? `Whenever you tap a ${m[2]} for mana, add an additional ${m[3]}` : `Whenever a ${m[2]} is tapped for mana, its controller adds an additional ${m[3]}`;
    effects.push({ kind: 'mana-extra-turn', text });
    return true;
  }
  // Bilbo's Gambit: "Players can't cast spells this turn." (everyone, the caster too)
  if ((m = c.match(/^(?:Players|Each player) can'?t cast (noncreature )?spells this turn\.?$/i))) { effects.push({ kind: 'cast-lock-all', noncreature: !!m[1] }); return true; }
  // "All permanents you control phase out, and until your next turn, …" — two instructions.
  if ((m = c.match(/^(.+?), and (until (?:your next turn|end of turn), .+)$/i))) {
    const a = compile(`${m[1]}.`, sourceName), b = compile(cap(m[2]), sourceName);
    if (ok(a) && ok(b)) { effects.push(...a.effects, ...b.effects); requirements.push(...a.requirements, ...b.requirements); return true; }
  }
  // Wildfire Howl: "~ deals 1 damage to any target and 2 damage to each creature."
  if ((m = c.match(/^(.+?) deals (\w+) damage to (.+?) and (\w+) damage to (.+?)\.?$/i)) && num(m[2]) !== null && num(m[4]) !== null) {
    const a = compile(`${m[1]} deals ${m[2]} damage to ${m[3]}.`, sourceName), b = compile(`${m[1]} deals ${m[4]} damage to ${m[5]}.`, sourceName);
    if (ok(a) && ok(b)) { effects.push(...a.effects, ...b.effects); requirements.push(...a.requirements, ...b.requirements); return true; }
  }
  return false;
}

/** Several sentences, or one that needs the parts before it. Returns { part, consumed } or null. */
export function compileB49Sequence(clauses, i, { sourceName, parts = [] }) {
  const c0 = String(clauses[i] || '').replace(/\([^()]*\)/g, '').trim();
  let m;
  // Blooming Blast: "~ deals 3 damage to that creature's controller." — the controller of the creature targeted before.
  if ((m = c0.match(/^(?:.+? )?deals (\w+) damage to that (creature|permanent)'s controller\.?$/i)) && num(m[1]) !== null) {
    const earlier = [...parts].reverse().flatMap(p => [...(p.requirements || [])].reverse()).find(r => r.kind === 'target');
    if (earlier) {
      const as = `controllerOf${earlier.bind}`;
      parts.forEach(p => { if (p.requirements?.includes(earlier) && !p.effects.some(e => e.kind === 'remember-controller' && e.as === as)) p.effects.unshift({ kind: 'remember-controller', bind: earlier.bind, as }); });
      return { part: { effects: [{ kind: 'damage', amount: num(m[1]), bind: as, sourceName }], requirements: [], unsupported: [] }, consumed: 1 };
    }
  }
  // Longstalk Brawl: "Put a +1/+1 counter on the creature you control." — the one targeted earlier in the spell.
  if ((m = c0.match(/^Put (a|an|one|two|three|\d+) ([+-]\d+\/[+-]\d+|[a-z]+) counters? on the creature you (control|don'?t control)\.?$/i))) {
    const mine = /^control$/i.test(m[3]);
    const earlier = parts.flatMap(p => p.requirements || []).find(r => r.kind === 'target' && (mine ? /you control/i.test(r.scope) : /you don'?t control|opponent controls/i.test(r.scope)));
    if (earlier) return { part: { effects: [{ kind: 'counter', bind: earlier.bind, counter: m[2], amount: num(m[1]) }], requirements: [], unsupported: [] }, consumed: 1 };
  }
  return null;
}

/** Effect kinds made above. Returns true when handled. */
export function applyB49(game, controllerId, effect, bindings, notes) {
  const controller = playerById(game, controllerId);
  switch (effect.kind) {
    case 'player-hexproof':
      controller.hexproofTurn = game.turnNumber;
      notes.push(`${controller.displayName} has hexproof until end of turn.`);
      return true;
    case 'mana-extra-turn':
      game.turnManaExtras = [...(game.turnManaExtras || []).filter(x => x.turn === game.turnNumber), { turn: game.turnNumber, controllerId, text: effect.text }];
      notes.push(`Until end of turn: ${effect.text}.`);
      return true;
    case 'cast-lock-all':
      game.castLocks = [...(game.castLocks || []).filter(x => x.turn === game.turnNumber), { turn: game.turnNumber, playerIds: game.players.map(p => p.playerId), noncreature: !!effect.noncreature, source: nameOf(game, bindings.sourceId) }];
      notes.push(`Players can't cast ${effect.noncreature ? 'noncreature ' : ''}spells this turn.`);
      return true;
    case 'sacrifice-chosen': {
      const emit = e => H.emit(bindings, e);
      for (const id of [].concat(bindings[effect.bind] || [])) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'battlefield') continue;
        const who = playerById(game, hit.card.controllerId)?.displayName || 'Its controller';
        moveCard(game, id, 'graveyard', { moveReason: 'sacrifice', onEvent: emit });
        notes.push(`${who} sacrifices ${nameOf(game, id)}.`);
      }
      return true;
    }
    default:
      return false;
  }
}

/** Resolve-time questions for the requirement kinds above. */
export function gatherB49(game, ctx, req, bindings, ask, key, title, base, util) {
  const { player } = ctx;
  if (req.kind === 'b49-greatest') {
    // Each affected player chooses among their own tied creatures.
    const who = req.each ? util.opponentsOf(game, player) : [playerById(game, bindings[req.playerBind])].filter(Boolean);
    const stat = c => req.stat === 'toughness' ? Number(util.defOf(game, c)?.toughness || 0) : req.stat === 'mana value' ? Number(util.defOf(game, c)?.manaValue ?? 0) : effectivePower(c, util.defOf(game, c), game);
    const picked = [];
    for (const p of who) {
      const rows = (p.deck.battlefield || []).filter(c => cardFitsWords(util.defOf(game, c), req.filter));
      if (!rows.length) continue;
      const top = Math.max(...rows.map(stat)), tied = rows.filter(c => stat(c) === top);
      picked.push(tied.length === 1 ? tied[0].instanceId : ask(`${key}:${p.playerId}`, () => ({ ...base, playerId: p.playerId, cancellable: false, kind: 'choose-one', title, prompt: `Sacrifice a ${req.filter} with the greatest ${req.stat} (${top}).`, options: tied.map(c => util.cardOption(game, c, p)) })));
    }
    bindings[req.bind] = picked;
    return true;
  }
  return false;
}

export { N, num, cap, compile, ok, nameOf, moveCard, resolveAmount };
