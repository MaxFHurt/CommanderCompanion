// The player toolbox (build 52): every engine effect as a manual tool for resolving a card by hand.
//
// A step is a general move, not a concrete edit: { tool, ref, amount?, counter?, keyword?, token?, to? } where `ref` names who or
// what it is done to — "target:N" (the card's Nth chosen target), "that" (the card the last step moved or made), "you", "player:<id>",
// "each-opponent", "card:<instanceId>" (a card picked by hand) or "stack:<id>". Because steps name roles rather than objects, the
// same steps can be stored as a card's outcome and replayed the next time it resolves (flow.js / controller.js).
//
// The resolving player stages steps; nothing changes until they press Done and — in a game on several devices — every other player
// accepts. Then the steps run through the engine (applyEffects) in order.
import { applyEffects, locateCardInGame, definitionFor } from '../engine/effects.js';
import { playerById } from './helpers.js';

const TOKENS = {
  Treasure: { name: 'Treasure', typeLine: 'Token Artifact — Treasure', oracleText: '{T}, Sacrifice this token: Add one mana of any color.', colors: [] },
  Food: { name: 'Food', typeLine: 'Token Artifact — Food', oracleText: '{2}, {T}, Sacrifice this token: You gain 3 life.', colors: [] },
  Clue: { name: 'Clue', typeLine: 'Token Artifact — Clue', oracleText: '{2}, Sacrifice this token: Draw a card.', colors: [] },
  Blood: { name: 'Blood', typeLine: 'Token Artifact — Blood', oracleText: '{1}, {T}, Discard a card, Sacrifice this token: Draw a card.', colors: [] }
};

/** Every tool: what it acts on, what it asks for, and the engine effects it runs. */
export const TOOLS = [
  { id: 'destroy', label: 'Destroy', on: 'permanent', words: /\bdestroy/i, fx: s => [{ kind: 'destroy', targetId: s.id }] },
  { id: 'exile', label: 'Exile', on: 'any-card', words: /\bexile/i, fx: s => [{ kind: s.zone === 'battlefield' ? 'exile' : 'move-zone', targetId: s.id, bind: '__id', to: 'exile' }] },
  { id: 'bounce', label: 'Return to hand', on: 'any-card', words: /return .*hand|owner'?s hand|to (?:its|their) owner/i, fx: s => [{ kind: s.zone === 'battlefield' ? 'bounce' : 'move-zone', targetId: s.id, bind: '__id', to: 'hand' }] },
  { id: 'to-battlefield', label: 'Put onto the battlefield', on: 'card', words: /onto the battlefield/i, fx: (s, c) => [{ kind: 'move-zone', targetId: s.id, bind: '__id', to: 'battlefield', controllerId: c }] },
  { id: 'to-graveyard', label: 'Put into the graveyard', on: 'any-card', words: /graveyard/i, fx: s => [{ kind: 'move-zone', targetId: s.id, bind: '__id', to: 'graveyard' }] },
  { id: 'library-top', label: 'Put on top of the library', on: 'any-card', words: /top of (?:its|their|your) (?:owner'?s )?library/i, fx: s => [{ kind: 'move-zone', targetId: s.id, bind: '__id', to: 'library', position: 'top' }] },
  { id: 'library-bottom', label: 'Put on the bottom of the library', on: 'any-card', words: /bottom of/i, fx: s => [{ kind: 'move-zone', targetId: s.id, bind: '__id', to: 'library', position: 'bottom' }] },
  { id: 'sacrifice', label: 'Sacrifice', on: 'permanent', words: /sacrifice/i, fx: s => [{ kind: 'sacrifice-chosen', bind: '__ids' }] },
  { id: 'tap', label: 'Tap', on: 'permanent', words: /\btap\b/i, fx: s => [{ kind: 'tap', targetId: s.id }] },
  { id: 'untap', label: 'Untap', on: 'permanent', words: /\buntap/i, fx: s => [{ kind: 'untap', targetId: s.id }] },
  { id: 'counter-plus', label: '+1/+1 counters…', on: 'permanent', amount: true, words: /\+1\/\+1 counter/i, fx: s => [{ kind: 'counter', targetId: s.id, counter: '+1/+1', amount: s.amount }] },
  { id: 'counter-minus', label: '−1/−1 counters…', on: 'permanent', amount: true, words: /-1\/-1 counter/i, fx: s => [{ kind: 'counter', targetId: s.id, counter: '-1/-1', amount: s.amount }] },
  { id: 'counter-other', label: 'Other counters…', on: 'permanent', amount: true, counter: true, words: /counters? on/i, fx: s => [{ kind: 'counter', targetId: s.id, counter: s.counter || 'charge', amount: s.amount }] },
  { id: 'remove-counter', label: 'Remove counters…', on: 'permanent', amount: true, counter: true, words: /remove .*counter/i, fx: s => [{ kind: 'remove-counter', targetId: s.id, counter: s.counter || '+1/+1', amount: s.amount }] },
  { id: 'pump', label: 'P/T until end of turn…', on: 'permanent', pt: true, words: /gets? [+-]\d+\/[+-]\d+/i, fx: s => [{ kind: 'pump', targetId: s.id, power: Number(s.power || 0), toughness: Number(s.toughness || 0), expires: 'cleanup' }] },
  { id: 'keyword', label: 'Give a keyword until end of turn…', on: 'permanent', keyword: true, words: /gains? (?:flying|haste|trample|vigilance|lifelink|deathtouch|indestructible|hexproof|first strike|double strike|menace|reach)/i, fx: s => [{ kind: 'grant-keyword', targetId: s.id, keyword: s.keyword || 'Haste', enabled: true, expires: 'cleanup' }] },
  { id: 'gain-control', label: 'Gain control', on: 'permanent', words: /gain control/i, fx: s => [{ kind: 'gain-control', targetId: s.id }] },
  { id: 'transform', label: 'Transform', on: 'permanent', words: /transform/i, fx: s => [{ kind: 'transform', targetId: s.id }] },
  { id: 'phase-out', label: 'Phase out', on: 'permanent', words: /phases? out/i, fx: s => [{ kind: 'phase-out', single: '__id' }] },
  { id: 'goad', label: 'Goad', on: 'permanent', words: /\bgoad/i, fx: s => [{ kind: 'goad', targetId: s.id }] },
  { id: 'copy-token', label: 'Create a token copy', on: 'permanent', words: /token that'?s a copy|copy of/i, fx: s => [{ kind: 'copy-token', targetId: s.id }] },
  { id: 'damage', label: 'Damage…', on: 'permanent-or-player', amount: true, words: /\bdamage\b/i, fx: s => [{ kind: 'damage', targetId: s.id, amount: s.amount, sourceName: s.sourceName || 'Effect' }] },
  { id: 'life-gain', label: 'Gain life…', on: 'player', amount: true, words: /gains? .*life|gain \d+ life/i, asPlayer: true, fx: s => [{ kind: 'life', scope: 'you', amount: s.amount, deltaSign: 1 }] },
  { id: 'life-loss', label: 'Lose life…', on: 'player', amount: true, words: /loses? .*life/i, asPlayer: true, fx: s => [{ kind: 'life', scope: 'you', amount: s.amount, deltaSign: -1 }] },
  { id: 'draw', label: 'Draw cards…', on: 'player', amount: true, words: /\bdraws?\b/i, asPlayer: true, fx: s => [{ kind: 'draw', scope: 'you', amount: s.amount }] },
  { id: 'discard', label: 'Discard at random…', on: 'player', amount: true, words: /discards?/i, asPlayer: true, fx: s => [{ kind: 'discard', scope: 'you', cardIds: s.randomIds || [] }] },
  { id: 'mill', label: 'Mill…', on: 'player', amount: true, words: /\bmills?\b/i, asPlayer: true, fx: s => [{ kind: 'mill', scope: 'you', amount: s.amount }] },
  { id: 'shuffle', label: 'Shuffle library', on: 'player', words: /shuffle/i, asPlayer: true, fx: () => [{ kind: 'shuffle' }] },
  { id: 'poison', label: 'Poison counters…', on: 'player', amount: true, words: /poison/i, fx: s => [{ kind: 'player-counter', playerBind: '__id', counter: 'poison', amount: s.amount }] },
  { id: 'token', label: 'Create tokens…', on: 'player', amount: true, tokenPick: true, words: /\bcreate\b/i, asPlayer: true, fx: s => [{ kind: 'create-token', amount: s.amount, ...(TOKENS[s.token] || { name: s.token?.name || 'Token', typeLine: `Token Creature — ${s.token?.type || 'Token'}`, oracleText: '', power: String(s.token?.power ?? 1), toughness: String(s.token?.toughness ?? 1), colors: [] }) }] },
  { id: 'extra-turn', label: 'Take an extra turn', on: 'player', words: /extra turn/i, asPlayer: true, fx: () => [{ kind: 'extra-turn' }] },
  { id: 'counter-spell', label: 'Counter it', on: 'stack', words: /\bcounter target\b|counter (?:that|it)/i, fx: s => [{ kind: 'counter-spell', stackId: s.id }] },
  { id: 'copy-spell', label: 'Copy it', on: 'stack', words: /\bcopy\b/i, fx: s => [{ kind: 'copy-stack', stackId: s.id, retarget: true }] }
];
export const TOKEN_KINDS = Object.keys(TOKENS);
const byId = Object.fromEntries(TOOLS.map(t => [t.id, t]));

/** Tools in the order to offer them: the ones the card's unread sentences call for first. */
export function rankTools(text) {
  const t = String(text || '');
  const hits = TOOLS.filter(x => x.words.test(t)).map(x => x.id);
  return [...hits, ...TOOLS.map(x => x.id).filter(id => !hits.includes(id))];
}

/** A short line for a step ("Destroy target 1", "Draw 2 — you"). */
export function stepLabel(step, names = {}) {
  const tool = byId[step.tool];
  const who = names[step.ref] || refLabel(step.ref);
  const n = step.amount !== undefined && tool?.amount ? ` ${step.amount}` : '';
  const extra = step.counter ? ` ${step.counter}` : step.keyword ? ` ${step.keyword}` : step.token ? ` ${typeof step.token === 'string' ? step.token : step.token.name}` : step.power !== undefined ? ` ${step.power >= 0 ? '+' : ''}${step.power}/${step.toughness >= 0 ? '+' : ''}${step.toughness}` : '';
  return `${(tool?.label || step.tool).replace(/…$/, '')}${n}${extra} — ${who}`;
}
function refLabel(ref) {
  const r = String(ref || '');
  if (r === 'that') return 'that card';
  if (r === 'you') return 'you';
  if (r === 'each-opponent') return 'each opponent';
  if (r.startsWith('target:')) return `target ${Number(r.slice(7)) + 1}`;
  if (r.startsWith('player:')) return 'a player';
  return 'a card';
}

/** Who or what a step's ref means now (player ids, card ids or a stack id). */
function resolveRef(game, ref, ctx) {
  const r = String(ref || '');
  if (r === 'you') return [{ kind: 'player', id: ctx.controllerId }];
  if (r === 'each-opponent') return game.players.filter(p => !p.eliminated && p.playerId !== ctx.controllerId).map(p => ({ kind: 'player', id: p.playerId }));
  if (r === 'that') return ctx.that ? [ctx.that] : [];
  if (r.startsWith('player:')) return [{ kind: 'player', id: r.slice(7) }];
  if (r.startsWith('stack:')) return [{ kind: 'stack', id: r.slice(6) }];
  if (r.startsWith('card:')) return [{ kind: 'card', id: r.slice(5) }];
  if (r.startsWith('target:')) { const t = ctx.targets[Number(r.slice(7))]; return t ? [t] : []; }
  return [];
}

/**
 * Run staged steps for the stack object `top` as its controller. Returns notes. "that" follows what each step moved or made.
 * `targets` are the card's chosen targets ([{ id, kind }]).
 */
export function applyToolSteps(game, top, steps, targets = []) {
  const notes = [];
  const ctx = { controllerId: top.controllerId, targets, that: null };
  for (const step of steps || []) {
    const tool = byId[step.tool];
    if (!tool) continue;
    for (const who of resolveRef(game, step.ref, ctx)) {
      let id = who.id, zone = null;
      if (who.kind !== 'player' && who.kind !== 'stack') { const h = locateCardInGame(game, id); if (!h) continue; zone = h.zone; }
      const s = { ...step, id, zone, sourceName: top.name };
      if (step.tool === 'discard') { const hand = [...(playerById(game, id)?.deck?.hand || [])]; for (let j = hand.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [hand[j], hand[k]] = [hand[k], hand[j]]; } s.randomIds = hand.slice(0, Number(step.amount || 0)).map(c => c.instanceId); }
      const bindings = { sourceId: top.sourceId || top.card?.instanceId || null, __id: id, __ids: [id] };
      const as = tool.asPlayer && who.kind === 'player' ? id : top.controllerId;
      try { notes.push(...applyEffects(game, as, tool.fx(s, top.controllerId), bindings)); }
      catch (error) { notes.push(`${stepLabel(step)}: ${error.message}`); continue; }
      const made = (bindings.lastCreated || []).slice(-1)[0], moved = (bindings.lastMoved || []).slice(-1)[0];
      if (made) ctx.that = { kind: 'card', id: made };
      else if (moved) ctx.that = { kind: 'card', id: moved };
      else if (who.kind !== 'player') ctx.that = who;
    }
  }
  return notes;
}

/** The card a stack object is about, for remembering its outcome. */
export function stackCardName(game, top) {
  const id = top?.card?.definitionId || top?.sourceDefinitionId;
  return (id && game.cardDefinitions?.[id]?.name) || top?.name || 'Effect';
}

export { definitionFor, playerById };
