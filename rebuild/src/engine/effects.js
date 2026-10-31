// Commander Companion V0.7.27 shared Oracle-effect resolver.
// Design rule: an automated effect must mutate authoritative game state or fail loudly.
import { withOverlay } from './overlay.js';
import { compileCatalogClause, applyCatalogEffect, prepareBindings, regenerates, compileCatalogSequence } from './effects-catalog.js';
import { tokenCount, counterCount, lifeGainAmount, damageAmount, graveyardDestination } from './replacements.js';
import { parseSubject, subjectMatches } from './trigger-subject.js';
import { effectivePower, effectiveToughness } from './combat.js';

// Regular expressions built from a card's name are made once and kept (building them is the slow part of compiling).
const RX_CACHE = new Map();
function rx(source, flags = '') {
  const key = `${flags}/${source}`;
  let r = RX_CACHE.get(key);
  if (!r) { if (RX_CACHE.size > 20000) RX_CACHE.clear(); r = new RegExp(source, flags); RX_CACHE.set(key, r); }
  r.lastIndex = 0;
  return r;
}

const WORD_NUMBERS = Object.freeze({
  zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
});
const PLAYER_ZONES = ['remainingLibrary', 'hand', 'battlefield', 'graveyard', 'exile', 'tokens', 'attachments', 'commandZone'];
const COLOR_NAMES = Object.freeze({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G', colorless: 'C' });
export function numberFromText(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return /^\d+$/.test(s) ? Number(s) : (WORD_NUMBERS[s] ?? null);
}
function cleanOracle(s = '') { let out = String(s || '').replace(/\r/g, '').replace(/[’‘]/g, "'").replace(/[–—]/g, '—').replace(/\u2212/g, '-'); for (let i = 0; i < 4; i++)
  out = out.replace(/\([^()]*\)/g, ' '); return out.replace(/\s+/g, ' ').trim(); }
function zoneArray(deck, zone) {
  if (zone === 'library' || zone === 'remainingLibrary')
    return deck?.remainingLibrary;
  if (zone === 'command' || zone === 'commandZone')
    return deck?.commandZone;
  return deck?.[zone];
}
export function locateCardInGame(game, id) {
  for (const player of game.players || []) {
    for (const zone of PLAYER_ZONES) {
      const array = player.deck?.[zone] || [];
      const index = array.findIndex(c => c.instanceId === id);
      if (index >= 0)
        return { player, zone, array, index, card: array[index] };
    }
  }
  const stack = (game.stack || []).find(x => x?.card?.instanceId === id);
  if (stack)
    return { player: game.players.find(p => p.playerId === stack.controllerId) || null, zone: 'stack', array: game.stack, index: game.stack.indexOf(stack), card: stack.card, stackObject: stack };
  return null;
}
export function definitionFor(game, card) { return withOverlay(card, plainDefinitionFor(game, card)); }
function plainDefinitionFor(game, card) { if (!card)
  return null; const base = game.cardDefinitions?.[card.definitionId] || null, i = Number.isInteger(card?.activeFaceIndex) ? card.activeFaceIndex : null, face = i === null ? null : base?.cardFaces?.[i]; return face ? { ...base, ...face, definitionId: base.definitionId, colorIdentity: base.colorIdentity, cardFaces: base.cardFaces, set: base.set, collectorNumber: base.collectorNumber, printing: base.printing, legalities: base.legalities, hydrationStatus: base.hydrationStatus } : base; }
function ownerFor(game, card, fallback) { return game.players.find(p => p.playerId === card?.ownerId) || fallback || null; }
function currentController(game, card, fallback) { return game.players.find(p => p.playerId === card?.controllerId) || fallback || ownerFor(game, card, fallback); }
function emit(bindings, event) { try {
  bindings?.onEvent?.(event);
}
catch (e) {
  console.error('Effect event bridge failed', e);
} }
function sourceColors(game, bindings) {
  const hit = bindings?.sourceId ? locateCardInGame(game, bindings.sourceId) : null;
  return hit ? (definitionFor(game, hit.card)?.colors || []) : [];
}
function cardName(game, card) { return definitionFor(game, card)?.name || 'Card'; }
function isCreature(def) { return /\bCreature\b/i.test(def?.typeLine || ''); }
function isPermanent(def) { return !/\b(?:Instant|Sorcery)\b/i.test(def?.typeLine || ''); }
function hasKeyword(card, def, name) {
  const k = String(name || '').toLowerCase();
  if ((def?.keywords || []).some(x => String(x).toLowerCase() === k))
    return true;
  if (rx(`\\b${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(String(def?.oracleText || '')))
    return true;
  return (card?.temporaryEffects || []).some(e => e?.kind === 'keyword' && e.enabled !== false && String(e.keyword || '').toLowerCase() === k);
}
function isIndestructible(card, def) { return hasKeyword(card, def, 'Indestructible'); }
/** A card changing zones becomes a new object: it stops being face down and forgets how it was cast. */
export function clearCastState(card, to) {
  if (!card || to === 'battlefield' || to === 'stack')
    return;
  if (card.realDefinitionId) {
    card.definitionId = card.realDefinitionId;
    delete card.realDefinitionId;
    delete card.faceDownKind;
  }
  for (const key of ['castMode', 'kicked', 'kickCount', 'castFlags', 'wasCast'])
    delete card[key];
  delete card.playPermission;
  if (to !== 'exile') {
    delete card.onAdventure;
    delete card.foretold;
    delete card.foretoldTurn;
  }
}
function resetOnZoneChange(card) {
  card.tapped = false;
  card.damageMarked = 0;
  card.deathtouchDamage = false;
  card.counters = {};
  card.attachments = [];
  card.temporaryEffects = [];
  delete card.attacking;
  delete card.blocking;
}
export function moveCard(game, id, to, { controllerId = null, position = 'bottom', tapped = false, preserveCounters = false, onEvent = null, moveReason = null } = {}) {
  const hit = locateCardInGame(game, id);
  if (!hit || hit.zone === 'stack')
    throw new Error('Effect target is no longer in a movable tracked zone.');
  if (to === 'graveyard')
    to = graveyardDestination(game, hit.card);
  // Unearth: "If it would leave the battlefield, exile it instead of putting it anywhere else."
  if (hit.zone === 'battlefield' && to !== 'battlefield' && (hit.card.temporaryEffects || []).some(e => e?.kind === 'exile-if-leaves')) to = 'exile';
  const from = hit.zone;
  const fromController = hit.card.controllerId || hit.player?.playerId;
  const wasTapped = !!hit.card.tapped;
  const [card] = hit.array.splice(hit.index, 1);
  const definition = definitionFor(game, card);
  const owner = ownerFor(game, card, hit.player);
  if (!owner)
    throw new Error('Card owner is unavailable.');
  // Last-known information for "dies" abilities (undying, persist, blitz).
  const last = { counters: { ...(card.counters || {}) }, castMode: card.castMode || null };
  if (!preserveCounters)
    resetOnZoneChange(card);
  clearCastState(card, to);
  card.zone = to;
  if (to === 'battlefield') {
    card.controllerId = controllerId || owner.playerId;
    card.enteredTurn = game.turnNumber;
    card.controlSinceTurn = game.turnNumber;
    card.tapped = !!tapped;
  }
  else {
    card.controllerId = owner.playerId;
  }
  // Tokens can enter non-battlefield zones momentarily by rules, then cease to exist.
  if (moveReason === 'sacrifice' && from === 'battlefield')
    onEvent?.({ type: 'sacrificed', sourceId: card.instanceId, definitionId: card.definitionId, controllerId: fromController, ownerId: card.ownerId, typeLine: definition?.typeLine || '', token: !!card.token });
  if (card.token && to !== 'battlefield') {
    onEvent?.({ type: 'zone-change', sourceId: card.instanceId, definitionId: card.definitionId, from, to, controllerId: fromController, ownerId: card.ownerId, token: true });
    if (from === 'battlefield' && to === 'graveyard' && isCreature(definition))
      onEvent?.({ type: 'dies', sourceId: card.instanceId, definitionId: card.definitionId, controllerId: fromController, ownerId: card.ownerId, typeLine: definition?.typeLine || '', token: true });
    return { card, fromPlayer: hit.player, toPlayer: owner, tokenCeased: true };
  }
  // Permanents live in their controller's battlefield; every other zone belongs to the owner.
  const host = to === 'battlefield' ? (game.players.find(p => p.playerId === card.controllerId) || owner) : owner;
  const target = zoneArray(host.deck, to);
  if (!target)
    throw new Error(`Unsupported destination zone: ${to}`);
  if (to === 'library' && position === 'top')
    target.unshift(card);
  else
    target.push(card);
  onEvent?.({ type: 'zone-change', sourceId: card.instanceId, definitionId: card.definitionId, from, to, controllerId: fromController, ownerId: card.ownerId, typeLine: definition?.typeLine || '' });
  if (from === 'battlefield' && to === 'graveyard' && isCreature(definition))
    onEvent?.({ type: 'dies', sourceId: card.instanceId, definitionId: card.definitionId, controllerId: fromController, ownerId: card.ownerId, typeLine: definition?.typeLine || '', last });
  if (from === 'battlefield' && to !== 'battlefield')
    onEvent?.({ type: 'leaves-battlefield', sourceId: card.instanceId, definitionId: card.definitionId, controllerId: fromController, ownerId: card.ownerId, typeLine: definition?.typeLine || '', destination: to, wasTapped });
  if (to === 'battlefield')
    onEvent?.({ type: 'enters-battlefield', sourceId: card.instanceId, definitionId: card.definitionId, controllerId: card.controllerId, ownerId: card.ownerId, typeLine: definition?.typeLine || '' });
  return { card, fromPlayer: hit.player, toPlayer: host };
}
function shuffled(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
export function cardMatchesFilter(game, card, filter) {
  if (!filter || filter === 'card')
    return true;
  // "creature or planeswalker": any one of the types.
  if (/ or /.test(String(filter).split('|')[0])) {
    const [base, ...conds] = String(filter).split('|');
    return base.split(/ or /).some(b => cardMatchesFilter(game, card, [b.trim(), ...conds].join('|')));
  }
  const d = definitionFor(game, card), type = String(d?.typeLine || '').toLowerCase(), text = String(d?.oracleText || '').toLowerCase();
  const f = String(filter).toLowerCase().trim();
  if (f === 'creature')
    return type.includes('creature');
  if (f === 'land')
    return type.includes('land');
  if (f === 'artifact')
    return type.includes('artifact');
  if (f === 'enchantment')
    return type.includes('enchantment');
  if (f === 'planeswalker')
    return type.includes('planeswalker');
  if (f === 'battle')
    return type.includes('battle');
  if (f === 'instant')
    return type.includes('instant');
  if (f === 'sorcery')
    return type.includes('sorcery');
  if (f === 'permanent')
    return isPermanent(d);
  if (f === 'basic land')
    return /\bbasic\b/.test(type) && /\bland\b/.test(type);
  if (f === 'nonland permanent')
    return isPermanent(d) && !type.includes('land');
  if (f === 'noncreature')
    return !type.includes('creature');
  // "creature|mv<=3": a type, then a mana value limit (Austere Command).
  if (f.includes('|')) {
    const [base, ...conds] = f.split('|');
    if (!cardMatchesFilter(game, card, base)) return false;
    const mv = Number(d?.manaValue ?? d?.cmc ?? 0);
    return conds.every(c => {
      if (c === 'attacking') return (game.combatState?.attackers || []).some(a => a.instanceId === card.instanceId);
      if (c === 'blocking') return Object.values(game.combatState?.blocks || {}).some(b => (b?.assignments || []).some(a => a.blockerId === card.instanceId));
      if (c === 'tapped') return !!card.tapped;
      if (c === 'attacked') return card.attackedTurn === game.turnNumber;
      if (c === 'untapped') return !card.tapped;
      if (c.startsWith('keyword:')) return hasKeyword(card, d, c.slice(8));
      if (c.startsWith('nokeyword:')) return !hasKeyword(card, d, c.slice(10));
      if (c.startsWith('subtype:')) return rx(`\\b${c.slice(8)}s?\\b`, 'i').test(d?.typeLine || '') || /changeling/i.test(text);
      if (c.startsWith('not-id:')) return card.instanceId !== c.slice(7);
      if (c.startsWith('type:')) return type.includes(c.slice(5));
      if (c.startsWith('non:')) return !type.includes(c.slice(4));
      if (c === 'nontoken') return !card.token;
      if (c === 'token') return !!card.token;
      if (c === 'entered') return card.enteredTurn === game.turnNumber;
      if (c.startsWith('color:')) return (d?.colors || []).includes(c.slice(6).toUpperCase());
      if (c.startsWith('counter:')) return Number(card.counters?.[c.slice(8)] || 0) > 0;
      if (c === 'basictype') return /\b(?:plains|island|swamp|mountain|forest)\b/.test(type);
      const pw = c.match(/^power(<=|>=)(\d+)$/);
      if (pw) { const p = Number(effectivePower(card, d, game)); return pw[1] === '<=' ? p <= Number(pw[2]) : p >= Number(pw[2]); }
      const m = c.match(/^mv(<=|>=)(\d+)$/);
      return !m || (m[1] === '<=' ? mv <= Number(m[2]) : mv >= Number(m[2]));
    });
  }
  if (f.startsWith('type:'))
    return type.includes(f.slice(5));
  if (f.startsWith('oracle:'))
    return text.includes(f.slice(7));
  return type.includes(f);
}
function countCards(game, controllerId, expr = {}) {
  const player = game.players.find(p => p.playerId === controllerId);
  if (!player)
    return 0;
  const zone = expr.zone || 'battlefield';
  const cards = zoneArray(player.deck, zone) || [];
  return cards.filter(c => cardMatchesFilter(game, c, expr.filter || 'card')).length;
}
function greatestStat(game, controllerId, stat = 'power', filter = 'creature') {
  const p = game.players.find(x => x.playerId === controllerId);
  if (!p)
    return 0;
  let best = 0;
  for (const c of p.deck?.battlefield || []) {
    if (!cardMatchesFilter(game, c, filter))
      continue;
    const d = definitionFor(game, c);
    const n = stat === 'toughness' ? effectiveToughness(c, d, game) : effectivePower(c, d, game);
    best = Math.max(best, Number(n || 0));
  }
  return best;
}
export function resolveAmount(game, controllerId, amount, bindings = {}) {
  if (typeof amount === 'number')
    return amount;
  if (amount == null)
    return 0;
  if (typeof amount === 'string') {
    if (/^\d+$/.test(amount))
      return Number(amount);
    if (amount.toUpperCase() === 'X')
      return Math.max(0, Number(bindings.X ?? bindings.x ?? 0));
    const n = numberFromText(amount);
    return n == null ? 0 : n;
  }
  if (amount.kind === 'count')
    return amount.all ? game.players.filter(p => !p.eliminated).reduce((n, p) => n + countCards(game, p.playerId, amount), 0) : countCards(game, amount.controllerId || controllerId, amount);
  if (amount.kind === 'opponents')
    return Math.max(0, (game.players || []).filter(p => !p.eliminated && p.playerId !== controllerId).length);
  if (amount.kind === 'hand-size') {
    const p = game.players.find(x => x.playerId === (amount.playerId || bindings[amount.playerBind] || controllerId));
    return p?.deck?.hand?.length || 0;
  }
  if (amount.kind === 'life-total') {
    const p = game.players.find(x => x.playerId === (amount.playerId || bindings[amount.playerBind] || controllerId));
    return Number(p?.life || 0);
  }
  if (amount.kind === 'greatest-power')
    return greatestStat(game, controllerId, 'power', amount.filter || 'creature');
  if (amount.kind === 'greatest-toughness')
    return greatestStat(game, controllerId, 'toughness', amount.filter || 'creature');
  if (amount.kind === 'source-power') {
    const hit = locateCardInGame(game, amount.sourceId || bindings.sourceId);
    return hit ? effectivePower(hit.card, definitionFor(game, hit.card), game) : 0;
  }
  if (amount.kind === 'source-toughness') {
    const hit = locateCardInGame(game, amount.sourceId || bindings.sourceId);
    return hit ? effectiveToughness(hit.card, definitionFor(game, hit.card), game) : 0;
  }
  if (amount.kind === 'binding')
    return Math.max(0, Number(bindings[amount.bind] || 0));
  if (amount.kind === 'devotion') {
    // Mana symbols of that color among the mana costs of permanents you control (hybrid counts once).
    const p = game.players.find(x => x.playerId === controllerId);
    return (p?.deck?.battlefield || []).reduce((n, c) => n + (String(definitionFor(game, c)?.manaCost || '').match(/\{[^}]+\}/g) || []).filter(sym => sym.includes(amount.color)).length, 0);
  }
  if (amount.kind === 'times')
    return Number(amount.n || 1) * resolveAmount(game, controllerId, amount.of, bindings);
  if (amount.kind === 'spells-cast-this-turn')
    return (game.players.find(x => x.playerId === controllerId)?.counters?.castThisTurn || []).length;
  if (amount.kind === 'source-counters')
    return Number(locateCardInGame(game, bindings.sourceId)?.card?.counters?.[amount.counter] || 0);
  if (amount.kind === 'event-card-power') {
    const hit = locateCardInGame(game, bindings.eventCard);
    return hit ? Math.max(0, Number(effectivePower(hit.card, definitionFor(game, hit.card), game) || 0)) : 0;
  }
  if (amount.kind === 'sum')
    return (amount.parts || []).reduce((n, x) => n + resolveAmount(game, controllerId, x, bindings), 0);
  if (amount.kind === 'half') {
    const v = resolveAmount(game, controllerId, amount.of, bindings);
    return amount.round === 'up' ? Math.ceil(v / 2) : Math.floor(v / 2);
  }
  return 0;
}
function targetPlayers(game, controllerId, scope, targetId) {
  if (targetId) {
    const p = game.players.find(x => x.playerId === targetId);
    return p ? [p] : [];
  }
  if (scope === 'you')
    return game.players.filter(x => x.playerId === controllerId);
  if (scope === 'opponents' || scope === 'each-opponent')
    return game.players.filter(x => x.playerId !== controllerId && !x.eliminated);
  if (scope === 'all-players' || scope === 'each-player')
    return game.players.filter(x => !x.eliminated);
  return [];
}
function addCounter(card, name, amount) { card.counters = card.counters || {}; card.counters[name] = Math.max(0, Number(card.counters[name] || 0) + Number(amount || 0)); if (card.counters[name] === 0)
  delete card.counters[name]; }
function makeToken(game, controller, effect, serial) {
  const subtype = effect.subtype || effect.name || effect.tokenName || 'Creature';
  const tokenDefId = `token:${effect.name || effect.tokenName || subtype}:${effect.power ?? ''}/${effect.toughness ?? ''}:${effect.typeLine || ''}`;
  if (!game.cardDefinitions[tokenDefId])
    game.cardDefinitions[tokenDefId] = {
      definitionId: tokenDefId, name: effect.name || effect.tokenName || subtype || 'Token', manaCost: '',
      typeLine: effect.typeLine || `Token Creature — ${subtype}`, oracleText: effect.oracleText || '', power: effect.power ?? null, toughness: effect.toughness ?? null,
      keywords: effect.keywords || [], colorIdentity: [], colors: effect.colors || [], imageUris: null, set: 'token', language: 'en', collectorNumber: '', hydrationStatus: 'complete'
    };
  return { instanceId: `${controller.playerId}:${tokenDefId}:${Date.now()}:${serial}:${Math.random().toString(36).slice(2, 7)}`, definitionId: tokenDefId, ownerId: controller.playerId, controllerId: controller.playerId, zone: 'battlefield', tapped: !!effect.tapped, counters: {}, attachments: [], temporaryEffects: [], enteredTurn: game.turnNumber, controlSinceTurn: game.turnNumber, token: true };
}
function checkLethal(game, targetId, notes, bindings) {
  const hit = locateCardInGame(game, targetId);
  if (!hit || hit.zone !== 'battlefield')
    return;
  const d = definitionFor(game, hit.card);
  if (!isCreature(d))
    return;
  const toughness = effectiveToughness(hit.card, d, game);
  const lethal = toughness <= 0 || Number(hit.card.damageMarked || 0) >= toughness || !!hit.card.deathtouchDamage;
  if (!lethal)
    return;
  if (toughness > 0 && (isIndestructible(hit.card, d) || regenerates(game, hit.card, notes)))
    return;
  const name = d?.name || 'Creature';
  moveCard(game, targetId, 'graveyard', { onEvent: e => emit(bindings, e) });
  notes.push(`${name} is put into its owner's graveyard for lethal damage.`);
}
function resolveBoundId(effect, bindings) { return effect.targetId || effect.cardId || effect.playerId || bindings[effect.bind] || bindings[effect.targetBind] || null; }
function resolveSelectionIds(effect, bindings) {
  const raw = effect.ids || effect.cardIds || bindings[effect.bind] || bindings[effect.cardsBind] || [];
  if (Array.isArray(raw))
    return raw;
  if (raw && typeof raw === 'object')
    return raw;
  return raw ? [raw] : [];
}
function changeControl(game, targetId, newControllerId, { untilEndOfTurn = false, bindings = {} } = {}) {
  const hit = locateCardInGame(game, targetId);
  if (!hit || hit.zone !== 'battlefield')
    throw new Error('Control-change target is no longer on the battlefield.');
  const oldControllerId = hit.card.controllerId || hit.player.playerId;
  const newController = game.players.find(p => p.playerId === newControllerId);
  if (!newController)
    throw new Error('New controller is unavailable.');
  const [card] = hit.array.splice(hit.index, 1);
  card.controllerId = newControllerId;
  newController.deck.battlefield.push(card);
  if (untilEndOfTurn) {
    card.temporaryEffects = card.temporaryEffects || [];
    card.temporaryEffects.push({ kind: 'control', previousControllerId: oldControllerId, expires: 'cleanup' });
  }
  emit(bindings, { type: 'control-changed', sourceId: card.instanceId, definitionId: card.definitionId, fromControllerId: oldControllerId, controllerId: newControllerId });
  return card;
}
function applyScry(game, player, effect, bindings, notes) {
  const amount = Math.max(0, resolveAmount(game, player.playerId, effect.amount, bindings));
  const top = player.deck.remainingLibrary.slice(0, amount);
  const decision = bindings[effect.bind] || effect.decision || {};
  const topIds = Array.isArray(decision.top) ? decision.top : top.map(c => c.instanceId);
  const bottomIds = Array.isArray(decision.bottom) ? decision.bottom : [];
  const allowed = new Set(top.map(c => c.instanceId));
  if ([...topIds, ...bottomIds].some(id => !allowed.has(id)))
    throw new Error('Scry selection contains a card outside the viewed cards.');
  if (new Set([...topIds, ...bottomIds]).size !== top.length)
    throw new Error('Every viewed card must be placed on top or bottom during scry.');
  player.deck.remainingLibrary.splice(0, top.length);
  const byId = new Map(top.map(c => [c.instanceId, c]));
  // topIds is ordered top-first. Prepend in one operation to preserve that order.
  player.deck.remainingLibrary.unshift(...topIds.map(id => byId.get(id)));
  player.deck.remainingLibrary.push(...bottomIds.map(id => byId.get(id)));
  notes.push(`${player.displayName} scries ${amount}.`);
  emit(bindings, { type: 'scry', playerId: player.playerId, controllerId: player.playerId, amount });
}
function applySurveil(game, player, effect, bindings, notes) {
  const amount = Math.max(0, resolveAmount(game, player.playerId, effect.amount, bindings));
  const top = player.deck.remainingLibrary.slice(0, amount);
  const decision = bindings[effect.bind] || effect.decision || {};
  const keepIds = Array.isArray(decision.top) ? decision.top : top.map(c => c.instanceId);
  const graveIds = Array.isArray(decision.graveyard) ? decision.graveyard : [];
  const allowed = new Set(top.map(c => c.instanceId));
  if ([...keepIds, ...graveIds].some(id => !allowed.has(id)) || new Set([...keepIds, ...graveIds]).size !== top.length)
    throw new Error('Every surveilled card must be placed on top or into the graveyard.');
  player.deck.remainingLibrary.splice(0, top.length);
  const byId = new Map(top.map(c => [c.instanceId, c]));
  player.deck.remainingLibrary.unshift(...keepIds.map(id => byId.get(id)));
  for (const id of graveIds) {
    const c = byId.get(id);
    c.zone = 'graveyard';
    player.deck.graveyard.push(c);
    emit(bindings, { type: 'mill', playerId: player.playerId, sourceId: c.instanceId, definitionId: c.definitionId, amount: 1 });
  }
  notes.push(`${player.displayName} surveils ${amount}.`);
  emit(bindings, { type: 'surveil', playerId: player.playerId, controllerId: player.playerId, amount });
}
function applyProliferate(game, controller, effect, bindings, notes) {
  const selections = bindings[effect.bind] || effect.selections || [];
  // Proliferate may legally choose nothing.
  if (!Array.isArray(selections))
    throw new Error('Proliferate choices are unavailable.');
  for (const s of selections) {
    if (s.kind === 'player') {
      const p = game.players.find(x => x.playerId === s.id);
      if (!p)
        continue;
      if (s.counter === 'poison')
        p.poison = Number(p.poison || 0) + 1;
      else {
        p.counters = p.counters || {};
        p.counters[s.counter] = Number(p.counters[s.counter] || 0) + 1;
      }
    }
    else {
      const hit = locateCardInGame(game, s.id);
      if (hit?.zone === 'battlefield')
        addCounter(hit.card, s.counter, 1);
    }
  }
  notes.push(`${controller.displayName} proliferates.`);
  emit(bindings, { type: 'proliferated', playerId: controller.playerId, controllerId: controller.playerId });
}
function preventDamage(game, targetId, amount) { let left = Math.max(0, Number(amount || 0)); if (game.unpreventableTurn === game.turnNumber) return left; const hit = locateCardInGame(game, targetId); if (left > 0 && hit?.zone === 'battlefield' && Number(hit.card?.counters?.shield || 0) > 0) {
  hit.card.counters.shield = Math.max(0, Number(hit.card.counters.shield) - 1);
  return 0;
} for (const shield of game.damagePrevention || []) {
  if (left <= 0)
    break;
  if (shield.targetId !== targetId || Number(shield.amount || 0) <= 0)
    continue;
  const used = Math.min(left, Number(shield.amount || 0));
  shield.amount -= used;
  left -= used;
} game.damagePrevention = (game.damagePrevention || []).filter(s => Number(s.amount || 0) > 0); return left; }
// Last-known information about the card an effect just moved, for follow-up sentences such as
// "Its controller gains life equal to its power."
function rememberLast(game, bindings, hit, def) {
  bindings.lastMoved = [hit.card.instanceId];
  bindings.__lastController = hit.zone === 'battlefield' ? (hit.card.controllerId || hit.player?.playerId) : hit.player?.playerId;
  bindings.__lastPower = /Creature/i.test(def?.typeLine || '') ? Math.max(0, effectivePower(hit.card, def, game)) : 0;
  bindings.__lastToughness = /Creature/i.test(def?.typeLine || '') ? Math.max(0, effectiveToughness(hit.card, def, game)) : 0;
  bindings.__lastManaValue = Math.max(0, Number(def?.manaValue ?? def?.cmc ?? 0));
}
function applyEffectsUnsafe(game, controllerId, effects = [], bindings = {}) {
  const controller = game.players.find(p => p.playerId === controllerId);
  if (!controller)
    throw new Error('Effect controller is unavailable.');
  const notes = [];
  if (!bindings.eventCard && bindings.sourceId) bindings.eventCard = bindings.sourceId;
  prepareBindings(game, bindings);
  for (let effect of effects || []) {
    if (effect.soft && effect.bind && !effect.targetId && effect.kind !== 'copy-stack') { const id = bindings[effect.bind]; const h = id && locateCardInGame(game, id); if (!h || h.zone !== 'battlefield') { notes.push('It is no longer on the battlefield.'); continue; } }
    // "Its controller creates …": remember who controlled the target before it moves, then do it for them.
    if (effect.optionalTarget && effect.bind && !bindings[effect.bind]) { notes.push('No target was chosen.'); continue; }
    // "If you control three or more artifacts, …": checked as it resolves; if not, the effects that follow do nothing.
    if (effect.kind === 'condition') {
      if (bindings.skipEffects > 0) { bindings.skipEffects--; continue; }
      const holds = conditionHolds(game, controllerId, effect, bindings);
      if (effect.negate ? holds : !holds) { bindings.skipEffects = effect.skip || 0; if (!effect.negate) notes.push(effect.failNote || 'The condition is not met.'); }
      continue;
    }
    if (!(bindings.skipEffects > 0) && applyCatalogEffect(game, controllerId, effect, bindings, notes)) continue;
    if (effect.kind === 'flicker') {
      const id = resolveBoundId(effect, bindings), hit = locateCardInGame(game, id);
      if (!hit || hit.zone !== 'battlefield') { notes.push('The creature is no longer there.'); continue; }
      const name = cardName(game, hit.card), owner = hit.card.ownerId, token = !!hit.card.token;
      moveCard(game, id, 'exile', { onEvent: e => emit(bindings, e) });
      if (token) { notes.push(`${name} is exiled and the token ceases to exist.`); continue; }
      moveCard(game, id, 'battlefield', { controllerId: effect.yours ? controllerId : owner, onEvent: e => emit(bindings, e) });
      notes.push(`${name} is exiled and returns to the battlefield.`);
      continue;
    }
    if (effect.kind === 'wheel') {
      const players = game.players.filter(p => !p.eliminated);
      let greatest = 0;
      for (const p of players) { greatest = Math.max(greatest, p.deck.hand.length); notes.push(...applyEffectsUnsafe(game, p.playerId, [{ kind: 'discard-hand', scope: 'you', countBind: 'wheelCount' }], bindings)); }
      const n = effect.amount === 'greatest' ? greatest : Number(effect.amount || 0);
      for (const p of players) notes.push(...applyEffectsUnsafe(game, p.playerId, [{ kind: 'draw', scope: 'you', amount: n }], bindings));
      continue;
    }
    if (effect.kind === 'chaos-warp') {
      const id = resolveBoundId(effect, bindings), hit = locateCardInGame(game, id);
      if (!hit || hit.zone !== 'battlefield') { notes.push('The permanent is no longer there.'); continue; }
      const owner = game.players.find(p => p.playerId === hit.card.ownerId) || hit.player, name = cardName(game, hit.card);
      moveCard(game, id, 'library', { position: 'top', onEvent: e => emit(bindings, e) });
      const lib = owner.deck.remainingLibrary;
      for (let j = lib.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [lib[j], lib[k]] = [lib[k], lib[j]]; }
      const top = lib[0], td = top && definitionFor(game, top);
      notes.push(`${owner.displayName} shuffles ${name} into their library and reveals ${td?.name || 'nothing'}.`);
      if (top && isPermanent(td)) { moveCard(game, top.instanceId, 'battlefield', { controllerId: owner.playerId, onEvent: e => emit(bindings, e) }); notes.push(`${td.name} is put onto the battlefield.`); }
      continue;
    }
    if (effect.kind === 'hand-to-battlefield') {
      const id = bindings[effect.bind], i = controller.deck.hand.findIndex(c => c.instanceId === id);
      if (i < 0) { notes.push('No land was put onto the battlefield.'); continue; }
      moveCard(game, id, 'battlefield', { controllerId, onEvent: e => emit(bindings, e) });
      notes.push(`${controller.displayName} puts ${cardName(game, locateCardInGame(game, id)?.card)} onto the battlefield.`);
      continue;
    }
    if (effect.kind === 'hand-to-top') {
      // Brainstorm: the chosen cards (now in hand) go on top, the first chosen on the very top.
      const ids = [...(bindings[effect.bind]?.top || [])];
      for (const id of ids.reverse()) {
        const i = controller.deck.hand.findIndex(c => c.instanceId === id);
        if (i < 0) continue;
        const [card] = controller.deck.hand.splice(i, 1);
        card.zone = 'library';
        controller.deck.remainingLibrary.unshift(card);
      }
      notes.push(`${controller.displayName} puts ${ids.length} card${ids.length === 1 ? '' : 's'} back on top of their library.`);
      continue;
    }
    if (effect.kind === 'source-to-library-top') {
      const hit = locateCardInGame(game, bindings.sourceId);
      if (hit && hit.zone === 'battlefield') { moveCard(game, bindings.sourceId, 'library', { position: 'top', onEvent: e => emit(bindings, e) }); notes.push(`${cardName(game, hit.card)} goes on top of its owner's library.`); }
      continue;
    }
    if (effect.kind === 'delay') {
      // Leave a delayed trigger. Amounts known now are fixed now; "its controller …" decides who it belongs to.
      const owner = effect.effects.find(e => e.forPlayerBind) ? bindings[effect.effects.find(e => e.forPlayerBind).forPlayerBind] : controllerId;
      const fixed = effect.effects.map(e => {
        const out = { ...e, forPlayerBind: null };
        if (e.bind && typeof bindings[e.bind] === 'string' && !e.targetId) out.targetId = bindings[e.bind];
        // "Sacrifice it / them at the beginning of the next end step": the tokens or cards this effect just made or moved.
        if (e.fromBind === '__recent') out.ids = [...(bindings.lastCreated?.length ? bindings.lastCreated : bindings.lastMoved?.length ? bindings.lastMoved : [bindings.eventCard].filter(Boolean))];
        if (e.amount && typeof e.amount === 'object' && e.amount.kind === 'binding' && bindings[e.amount.bind] !== undefined) out.amount = Number(bindings[e.amount.bind] || 0);
        return out;
      });
      const src = locateCardInGame(game, bindings.sourceId)?.card || (game.stack || []).find(x => x.card?.instanceId === bindings.sourceId)?.card;
      game.delayedTriggers = [...(game.delayedTriggers || []), { id: `delayed:${Date.now()}:${Math.random()}`, controllerId: owner || controllerId, ownerId: controllerId, when: { ...effect.when, afterTurn: effect.when.sameTurn || effect.when.event === 'end-combat' ? game.turnNumber - 1 : game.turnNumber }, effects: fixed, requirements: effect.requirements || [], sourceId: bindings.sourceId || null, sourceDefinitionId: src?.definitionId || null, sourceName: (src && cardName(game, src)) || 'Delayed effect' }];
      notes.push(`${cardName(game, src) || 'It'} will do the rest ${effect.when.event === 'upkeep' ? "at the next turn's upkeep" : effect.when.event === 'end-step' ? 'at the next end step' : 'at the next main phase'}.`);
      continue;
    }
    if (effect.kind === 'their-search') continue;   // done by ops.js as the spell resolves (it asks that player)
    // "… unless that player pays {1}": ops.js asked them before resolving; if they paid, skip what follows.
    if (effect.kind === 'may-pay') {
      // Paid (or not) as the stack object resolved, in ops.js.
      // "Sacrifice this creature unless you pay {2}": paying skips what follows instead.
      if (effect.invert ? bindings.mayPaid : !bindings.mayPaid) { bindings.skipEffects = effect.skip || 0; notes.push(effect.invert ? 'It was paid for.' : 'Nothing was paid.'); }
      continue;
    }
    if (effect.kind === 'unless-pays') {
      // Kept on the bindings: the stack resolves its effects one call at a time.
      if (bindings.unlessPaid) { notes.push(`${game.players.find(p => p.playerId === bindings[effect.payerBind])?.displayName || 'The player'} paid ${effect.cost}.`); bindings.skipEffects = effect.skip || 0; }
      continue;
    }
    if (bindings.skipEffects > 0) { bindings.skipEffects--; continue; }
    if (effect.kind === 'remember-controller') {
      const id = bindings[effect.bind];
      const hit = locateCardInGame(game, id), onStack = (game.stack || []).find(x => x.id === id);
      bindings[effect.as] = onStack?.controllerId || hit?.card?.controllerId || hit?.player?.playerId || null;
      continue;
    }
    if (effect.forPlayerBind) {
      const pid = bindings[effect.forPlayerBind];
      if (pid && game.players.some(p => p.playerId === pid)) notes.push(...applyEffectsUnsafe(game, pid, [{ ...effect, forPlayerBind: null }], bindings));
      continue;
    }
    const amount = Math.max(0, resolveAmount(game, controllerId, effect.amount, bindings));
    if (effect.kind === 'prevent-combat') {
      game.combatPrevention = (game.combatPrevention || []).filter(x => x.turn === game.turnNumber);
      const id = effect.scope === 'card' ? resolveBoundId(effect, bindings) : null;
      game.combatPrevention.push({ turn: game.turnNumber, scope: effect.scope, playerId: effect.scope === 'you' ? controllerId : null, cardId: id });
      notes.push(effect.scope === 'all' ? 'All combat damage is prevented this turn.' : effect.scope === 'you' ? `Combat damage to ${controller.displayName} is prevented this turn.` : 'Combat damage to and from that creature is prevented this turn.');
      continue;
    }
    if (effect.kind === 'return-self-hand') {
      const hit = locateCardInGame(game, bindings.sourceId);
      if (!hit || hit.zone !== 'graveyard') { notes.push('The card is no longer in the graveyard.'); continue; }
      moveCard(game, hit.card.instanceId, 'hand', { onEvent: e => emit(bindings, e) });
      notes.push(`${cardName(game, hit.card)} returns to its owner's hand.`);
      continue;
    }
    if (effect.kind === 'no-max-hand-size') { controller.noMaxHandSize = true; notes.push(`${controller.displayName} has no maximum hand size.`); continue; }
    if (effect.kind === 'cast-lock') {
      game.castLocks = (game.castLocks || []).filter(x => x.turn === game.turnNumber);
      game.castLocks.push({ turn: game.turnNumber, playerIds: game.players.filter(p => p.playerId !== controllerId).map(p => p.playerId), noncreature: !!effect.noncreature, source: cardName(game, locateCardInGame(game, bindings.sourceId)?.card) });
      notes.push(`Opponents can't cast ${effect.noncreature ? 'noncreature ' : ''}spells this turn.`);
      continue;
    }
    if (effect.kind === 'flash-permission') {
      controller.temporaryPermissions = controller.temporaryPermissions || [];
      controller.temporaryPermissions.push({ kind: 'flash', expires: 'cleanup' });
      notes.push(`${controller.displayName} may cast spells as though they had flash this turn.`);
      continue;
    }
    if (effect.kind === 'next-uncounterable' || effect.kind === 'uncounterable-turn') {
      controller.temporaryPermissions = controller.temporaryPermissions || [];
      controller.temporaryPermissions.push({ kind: effect.kind, expires: 'cleanup' });
      notes.push(effect.kind === 'next-uncounterable' ? 'The next spell cast this turn can\u2019t be countered.' : 'Spells you control can\u2019t be countered this turn.');
      continue;
    }
    if (effect.kind === 'commander-to-hand') {
      const cmd = controller.deck.commandZone || [];
      if (!cmd.length) { notes.push('Your commander is not in the command zone.'); continue; }
      const c = cmd.length === 1 ? cmd[0] : cmd[0];
      moveCard(game, c.instanceId, 'hand', { onEvent: e => emit(bindings, e) });
      notes.push(`${cardName(game, c)} is put into ${controller.displayName}'s hand.`);
      continue;
    }
    if (effect.kind === 'set-x') { bindings.X = Math.max(0, resolveAmount(game, controllerId, effect.amount, bindings)); continue; }
    if (effect.kind === 'goad-each') {
      let n = 0;
      for (const p of game.players.filter(x => x.playerId !== controllerId && !x.eliminated))
        for (const c of p.deck?.battlefield || [])
          if (cardMatchesFilter(game, c, 'creature')) { c.temporaryEffects = c.temporaryEffects || []; c.temporaryEffects.push({ kind: 'goad', by: controllerId, expires: `turn-start:${controllerId}` }); n++; }
      notes.push(`${n} creature${n === 1 ? ' is' : 's are'} goaded.`);
      continue;
    }
    if (effect.kind === 'double-counter-each') {
      let n = 0;
      for (const c of controller.deck?.battlefield || [])
        if (cardMatchesFilter(game, c, effect.filter || 'creature') && Number(c.counters?.[effect.counter] || 0) > 0) { addCounter(c, effect.counter, Number(c.counters[effect.counter])); n++; }
      notes.push(`${n} permanent${n === 1 ? '' : 's'} double their ${effect.counter} counters.`);
      continue;
    }
    if (effect.kind === 'double-pt-each') {
      // "Double the power and toughness": each creature gets +X/+Y where X and Y are its power and toughness now.
      let n = 0;
      for (const c of controller.deck?.battlefield || []) {
        const d = definitionFor(game, c);
        if (!isCreature(d)) continue;
        c.temporaryEffects = c.temporaryEffects || [];
        c.temporaryEffects.push({ kind: 'pt', power: Number(effectivePower(c, d, game) || 0), toughness: Number(effectiveToughness(c, d, game) || 0), expires: effect.expires || 'cleanup' });
        n++;
      }
      notes.push(`${n} creature${n === 1 ? '' : 's'} double their power and toughness.`);
      continue;
    }
    if (effect.kind === 'return-self-graveyard') {
      const hit = locateCardInGame(game, bindings.sourceId);
      if (!hit || hit.zone !== 'graveyard') { notes.push('The card is no longer in the graveyard.'); continue; }
      if (effect.transformed && (game.cardDefinitions?.[hit.card.definitionId]?.cardFaces || []).length > 1) hit.card.activeFaceIndex = 1;
      moveCard(game, hit.card.instanceId, 'battlefield', { controllerId: hit.card.ownerId, tapped: !!effect.tapped, onEvent: e => emit(bindings, e) });
      notes.push(`${cardName(game, hit.card)} returns to the battlefield${effect.tapped ? ' tapped' : ''}${effect.transformed ? ' transformed' : ''}.`);
      continue;
    }
    if (effect.kind === 'counter-many') {
      const ids = [].concat(bindings[effect.bind] || []);
      for (const id of ids) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'battlefield') continue;
        addCounter(hit.card, effect.counter || '+1/+1', counterCount(game, hit.card.controllerId, effect.counter || '+1/+1', amount, { creature: isCreature(definitionFor(game, hit.card)) }));
        emit(bindings, { type: 'counter-added', targetId: id, controllerId: hit.card.controllerId, sourceId: bindings.sourceId || null, counter: effect.counter || '+1/+1', amount });
        notes.push(`${cardName(game, hit.card)} gets ${amount} ${effect.counter} counter${amount === 1 ? '' : 's'}.`);
      }
      if (!ids.length) notes.push('No targets were chosen.');
      continue;
    }
    if (effect.kind === 'exile-many' || effect.kind === 'destroy-many') {
      const ids = [].concat(bindings[effect.bind] || []);
      for (const id of ids) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'battlefield') continue;
        const d = definitionFor(game, hit.card), n = cardName(game, hit.card);
        if (effect.kind === 'destroy-many' && isIndestructible(hit.card, d)) { notes.push(`${n} is indestructible.`); continue; }
        if (effect.kind === 'destroy-many' && regenerates(game, hit.card, notes)) continue;
        moveCard(game, id, effect.kind === 'exile-many' ? 'exile' : 'graveyard', { onEvent: e => emit(bindings, e) });
        notes.push(`${n} ${effect.kind === 'exile-many' ? 'is exiled' : 'is destroyed'}.`);
      }
      if (!ids.length) notes.push('No targets were chosen.');
      continue;
    }
    if (effect.optional && bindings[effect.optionalBind] === false) {
      notes.push(`${effect.label || 'Optional effect'} was declined.`);
      continue;
    }
    if (effect.kind === 'draw') {
      const players = targetPlayers(game, controllerId, effect.scope || 'you', effect.playerId || bindings[effect.bind]);
      for (const p of players) {
        let moved = 0;
        for (let i = 0; i < amount; i++) {
          const card = p.deck.remainingLibrary.shift();
          if (!card) {
            p.counters = p.counters || {};
            p.counters.failedDraws = Number(p.counters.failedDraws || 0) + 1;
            emit(bindings, { type: 'failed-draw', playerId: p.playerId });
            break;
          }
          card.zone = 'hand';
          p.deck.hand.push(card);
          moved++;
          emit(bindings, { type: 'draw', playerId: p.playerId, sourceId: card.instanceId, definitionId: card.definitionId, drawNumberThisTurn: Number(p.counters?.cardsDrawnThisTurn || 0) + 1, isFirstNormalDrawStepDraw: game.phase === 'draw' && Number(p.counters?.cardsDrawnThisTurn || 0) === 0 });
          p.counters = p.counters || {};
          p.counters.cardsDrawnThisTurn = Number(p.counters.cardsDrawnThisTurn || 0) + 1;
        }
        notes.push(`${p.displayName} draws ${moved} card${moved === 1 ? '' : 's'}.`);
      }
      continue;
    }
    if (effect.kind === 'discard-hand') {
      const players = targetPlayers(game, controllerId, effect.scope || 'you', effect.playerId || bindings[effect.bind]);
      for (const p of players) {
        const count = p.deck.hand.length;
        bindings[effect.countBind || 'thatMany'] = count;
        while (p.deck.hand.length) {
          const c = p.deck.hand.shift();
          c.zone = 'graveyard';
          p.deck.graveyard.push(c);
          emit(bindings, { type: 'discard', playerId: p.playerId, sourceId: c.instanceId, definitionId: c.definitionId, typeLine: definitionFor(game, c)?.typeLine || '' });
        }
        notes.push(`${p.displayName} discards ${count} card${count === 1 ? '' : 's'}.`);
      }
      continue;
    }
    if (effect.kind === 'discard') {
      const players = targetPlayers(game, controllerId, effect.scope || 'you', effect.playerId || bindings[effect.bind]);
      for (const p of players) {
        let raw = effect.cardIds || bindings[effect.cardsBind] || [];
        let ids = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw[p.playerId] || []) : raw;
        if (!Array.isArray(ids))
          ids = [ids];
        const need = Math.min(amount, p.deck.hand.length);
        if (ids.length < need)
          throw new Error(`${p.displayName} must choose ${need} card${need === 1 ? '' : 's'} to discard.`);
        for (const id of ids.slice(0, need)) {
          const i = p.deck.hand.findIndex(c => c.instanceId === id);
          if (i < 0)
            throw new Error('A selected discard card is no longer in that player’s hand.');
          const [c] = p.deck.hand.splice(i, 1);
          c.zone = 'graveyard';
          p.deck.graveyard.push(c);
          emit(bindings, { type: 'discard', playerId: p.playerId, sourceId: c.instanceId, definitionId: c.definitionId, typeLine: definitionFor(game, c)?.typeLine || '' });
        }
        notes.push(`${p.displayName} discards ${need} card${need === 1 ? '' : 's'}.`);
      }
      continue;
    }
    if (effect.kind === 'mill') {
      const players = targetPlayers(game, controllerId, effect.scope || 'you', effect.playerId || bindings[effect.bind]);
      for (const p of players) {
        let moved = 0;
        for (let i = 0; i < amount; i++) {
          const c = p.deck.remainingLibrary.shift();
          if (!c)
            break;
          c.zone = 'graveyard';
          p.deck.graveyard.push(c);
          moved++;
          emit(bindings, { type: 'mill', playerId: p.playerId, sourceId: c.instanceId, definitionId: c.definitionId, amount: 1 });
        }
        notes.push(`${p.displayName} mills ${moved} card${moved === 1 ? '' : 's'}.`);
      }
      continue;
    }
    if (effect.kind === 'life') {
      const players = targetPlayers(game, controllerId, effect.scope || 'you', effect.playerId || bindings[effect.bind]);
      for (const p of players) {
        const delta = Number(effect.deltaSign || 1) >= 0 ? lifeGainAmount(game, p.playerId, amount) : -amount;
        const before = Number(p.life || 0);
        p.life = Math.max(0, before + delta);
        const actual = p.life - before;
        notes.push(`${p.displayName} ${actual >= 0 ? 'gains' : 'loses'} ${Math.abs(actual)} life.`);
        if (actual < 0) bindings.lifeLostThisWay = Number(bindings.lifeLostThisWay || 0) - actual;   // "life equal to the life lost this way"
        emit(bindings, { type: actual >= 0 ? 'life-gained' : 'life-lost', playerId: p.playerId, amount: Math.abs(actual), sourceId: bindings.sourceId || null, controllerId });
      }
      continue;
    }
    if (effect.kind === 'set-life') {
      const players = targetPlayers(game, controllerId, effect.scope || 'you', effect.playerId || bindings[effect.bind]);
      for (const p of players) {
        const before = Number(p.life || 0);
        p.life = amount;
        const delta = p.life - before;
        emit(bindings, { type: delta >= 0 ? 'life-gained' : 'life-lost', playerId: p.playerId, amount: Math.abs(delta), sourceId: bindings.sourceId || null, controllerId });
        notes.push(`${p.displayName}'s life total becomes ${amount}.`);
      }
      continue;
    }
    if (effect.kind === 'damage') {
      const targetId = effect.toController ? controllerId : resolveBoundId(effect, bindings);
      if (!targetId)
        throw new Error('A damage target was not chosen.');
      const victimCard = locateCardInGame(game, targetId);
      const boosted = damageAmount(game, { sourceControllerId: controllerId, colors: sourceColors(game, bindings), targetPlayerId: game.players.some(x => x.playerId === targetId) ? targetId : null, targetControllerId: victimCard?.card?.controllerId || null }, amount);
      const dealt = preventDamage(game, targetId, boosted);
      const prevented = boosted - dealt;
      const p = game.players.find(x => x.playerId === targetId);
      if (p) {
        p.life = Math.max(0, Number(p.life || 0) - dealt);
        notes.push(`${effect.sourceName || 'Effect'} deals ${dealt} damage to ${p.displayName}${prevented ? ` (${prevented} prevented)` : ''}.`);
        if (dealt)
          emit(bindings, { type: 'damage-player', playerId: p.playerId, amount: dealt, sourceId: bindings.sourceId || effect.sourceId || null, controllerId, combat: false });
        continue;
      }
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('The damage target is no longer legal.');
      hit.card.damageMarked = Number(hit.card.damageMarked || 0) + dealt;
      if (effect.exileIfDies) hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'exile-if-dies', expires: 'cleanup' }];
      notes.push(`${effect.sourceName || 'Effect'} deals ${dealt} damage to ${cardName(game, hit.card)}${prevented ? ` (${prevented} prevented)` : ''}.`);
      if (dealt)
        emit(bindings, { type: 'damage-permanent', targetId, amount: dealt, sourceId: bindings.sourceId || effect.sourceId || null, controllerId });
      checkLethal(game, targetId, notes, bindings);
      continue;
    }
    if (effect.kind === 'return-self') {
      // Undying / persist: the card returns from the graveyard with a counter.
      const hit = locateCardInGame(game, bindings.sourceId);
      if (!hit || hit.zone !== 'graveyard') {
        notes.push('The card is no longer in the graveyard, so it does not return.');
        continue;
      }
      const moved = moveCard(game, hit.card.instanceId, 'battlefield', { controllerId: hit.card.ownerId, onEvent: e => emit(bindings, e) });
      moved.card.counters = moved.card.counters || {};
      moved.card.counters[effect.counter] = Number(moved.card.counters[effect.counter] || 0) + 1;
      notes.push(`${cardName(game, moved.card)} returns to the battlefield with a ${effect.counter} counter.`);
      continue;
    }
    if (effect.kind === 'designation') {
      for (const p of game.players)
        p.statuses = (p.statuses || []).filter(x => x.toLowerCase() !== effect.status.toLowerCase());
      controller.statuses = [...(controller.statuses || []), effect.status];
      notes.push(`${controller.displayName} becomes ${effect.status === 'Monarch' ? 'the monarch' : effect.status}.`);
      continue;
    }
    if (effect.kind === 'goad') {
      const hit = locateCardInGame(game, resolveBoundId(effect, bindings));
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('The goad target is no longer on the battlefield.');
      hit.card.temporaryEffects = hit.card.temporaryEffects || [];
      hit.card.temporaryEffects.push({ kind: 'goad', by: controllerId, expires: `turn-start:${controllerId}` });
      notes.push(`${cardName(game, hit.card)} is goaded.`);
      continue;
    }
    if (effect.kind === 'transform') {
      const hit = locateCardInGame(game, resolveBoundId(effect, bindings));
      const base = hit ? game.cardDefinitions?.[hit.card.definitionId] : null;
      if (!hit || hit.zone !== 'battlefield' || (base?.cardFaces || []).length < 2) {
        notes.push('It cannot transform.');
        continue;
      }
      hit.card.activeFaceIndex = Number(hit.card.activeFaceIndex || 0) === 0 ? 1 : 0;
      notes.push(`${base.name} transforms into ${base.cardFaces[hit.card.activeFaceIndex]?.name || 'its other face'}.`);
      emit(bindings, { type: 'transformed', sourceId: hit.card.instanceId, definitionId: hit.card.definitionId, controllerId: hit.card.controllerId });
      continue;
    }
    if (effect.kind === 'unpreventable') {
      game.unpreventableTurn = game.turnNumber;
      notes.push('Damage can\u2019t be prevented this turn.');
      continue;
    }
    if (effect.kind === 'exile-graveyards') {
      let n = 0;
      for (const p of game.players.filter(x => effect.scope !== 'opponents' || x.playerId !== controllerId)) {
        for (const c of p.deck.graveyard.splice(0)) { c.zone = 'exile'; p.deck.exile.push(c); n++; }
      }
      notes.push(`${n} graveyard card${n === 1 ? '' : 's'} exiled.`);
      continue;
    }
    if (effect.kind === 'damage-each') {
      // "deals N damage to each creature [you don't control] [and each opponent/player]".
      const creatureOwners = effect.creatures === 'opponents' ? game.players.filter(p => p.playerId !== controllerId && !p.eliminated) : effect.creatures ? game.players.filter(p => !p.eliminated) : [];
      const ids = creatureOwners.flatMap(p => (p.deck?.battlefield || []).filter(c => cardMatchesFilter(game, c, effect.filter || 'creature')).map(c => c.instanceId));
      for (const id of ids) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'battlefield') continue;
        const dealt = preventDamage(game, id, damageAmount(game, { sourceControllerId: controllerId, colors: sourceColors(game, bindings), targetControllerId: hit.card.controllerId }, amount));
        hit.card.damageMarked = Number(hit.card.damageMarked || 0) + dealt;
        if (effect.exileIfDies) hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'exile-if-dies', expires: 'cleanup' }];
        if (dealt) emit(bindings, { type: 'damage-permanent', targetId: id, amount: dealt, sourceId: bindings.sourceId || null, controllerId });
      }
      const victims = effect.players === 'opponents' ? game.players.filter(p => p.playerId !== controllerId && !p.eliminated) : effect.players === 'all' ? game.players.filter(p => !p.eliminated) : [];
      for (const p of victims) {
        const dealt = preventDamage(game, p.playerId, damageAmount(game, { sourceControllerId: controllerId, colors: sourceColors(game, bindings), targetPlayerId: p.playerId }, amount));
        p.life = Math.max(0, Number(p.life || 0) - dealt);
        if (dealt) emit(bindings, { type: 'damage-player', playerId: p.playerId, amount: dealt, sourceId: bindings.sourceId || null, controllerId, combat: false });
      }
      notes.push(`${effect.sourceName || 'Effect'} deals ${amount} damage to ${[ids.length ? `${ids.length} ${effect.filter || 'creature'}${ids.length === 1 ? '' : 's'}` : '', victims.length ? `${victims.length} player${victims.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ') || 'nothing'}.`);
      for (const id of ids) checkLethal(game, id, notes, bindings);
      continue;
    }
    if (effect.kind === 'damage-from-creature' || effect.kind === 'damage-from-selected-creature') {
      const sourceId = effect.sourceId || bindings[effect.sourceBind] || bindings.sourceId;
      const targetId = effect.targetId || bindings[effect.targetBind] || bindings[effect.bind];
      const src = locateCardInGame(game, sourceId);
      if (!src || src.zone !== 'battlefield')
        throw new Error('The chosen source creature is no longer on the battlefield.');
      const sd = definitionFor(game, src.card);
      const dmg = effect.amount ? Math.max(0, resolveAmount(game, controllerId, effect.amount, { ...bindings, sourceId })) : effectivePower(src.card, sd, game);
      const p = game.players.find(x => x.playerId === targetId);
      const dealt = preventDamage(game, targetId, dmg), prevented = dmg - dealt;
      if (p) {
        p.life = Math.max(0, Number(p.life || 0) - dealt);
        notes.push(`${sd?.name || 'Creature'} deals ${dealt} damage to ${p.displayName}${prevented ? ` (${prevented} prevented)` : ''}.`);
        if (dealt)
          emit(bindings, { type: 'damage-player', playerId: p.playerId, amount: dealt, sourceId, controllerId: src.card.controllerId || controllerId, combat: false });
      }
      else {
        const th = locateCardInGame(game, targetId);
        if (!th || th.zone !== 'battlefield')
          throw new Error('The chosen damage target is no longer legal.');
        th.card.damageMarked = Number(th.card.damageMarked || 0) + dealt;
        notes.push(`${sd?.name || 'Creature'} deals ${dealt} damage to ${cardName(game, th.card)}${prevented ? ` (${prevented} prevented)` : ''}.`);
        checkLethal(game, targetId, notes, bindings);
      }
      if (effect.sacrificeSource) {
        const live = locateCardInGame(game, sourceId);
        if (live?.zone === 'battlefield') {
          moveCard(game, sourceId, 'graveyard', { moveReason: 'sacrifice', onEvent: e => emit(bindings, e) });
          notes.push(`${sd?.name || 'Creature'} is sacrificed.`);
        }
      }
      continue;
    }
    if (effect.kind === 'fight') {
      const aId = effect.sourceId || bindings[effect.sourceBind] || bindings.sourceId, bId = effect.targetId || bindings[effect.targetBind] || bindings[effect.bind];
      const a = locateCardInGame(game, aId), b = locateCardInGame(game, bId);
      if (!a || !b || a.zone !== 'battlefield' || b.zone !== 'battlefield')
        throw new Error('Both creatures must still be on the battlefield to fight.');
      const ad = definitionFor(game, a.card), bd = definitionFor(game, b.card), ap = effectivePower(a.card, ad, game), bp = effectivePower(b.card, bd, game), toA = preventDamage(game, aId, bp), toB = preventDamage(game, bId, ap);
      a.card.damageMarked = Number(a.card.damageMarked || 0) + toA;
      b.card.damageMarked = Number(b.card.damageMarked || 0) + toB;
      notes.push(`${ad?.name || 'Creature'} and ${bd?.name || 'creature'} fight (${toB} and ${toA} damage dealt after prevention).`);
      checkLethal(game, aId, notes, bindings);
      checkLethal(game, bId, notes, bindings);
      continue;
    }
    if (effect.kind === 'zone-each') {
      const scope = effect.scope || 'all';
      const players = scope === 'you' ? [controller] : scope === 'opponents' ? game.players.filter(p => p.playerId !== controllerId && !p.eliminated) : scope === 'target-player' ? [game.players.find(p => p.playerId === (effect.playerId || bindings[effect.playerBind]))].filter(Boolean) : game.players.filter(p => !p.eliminated);
      let moved = 0;
      const ids = [];
      for (const p of players)
        for (const c of [...(p.deck?.battlefield || [])])
          if (cardMatchesFilter(game, c, effect.filter || 'permanent'))
            ids.push(c.instanceId);
      for (const id of ids) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'battlefield')
          continue;
        const d = definitionFor(game, hit.card);
        if (effect.to === 'graveyard' && effect.destroy && (isIndestructible(hit.card, d) || regenerates(game, hit.card, notes)))
          continue;
        moveCard(game, id, effect.to, { onEvent: e => emit(bindings, e) });
        moved++;
      }
      bindings.movedThisWay = moved;
      notes.push(`${moved} ${String(effect.filter || 'permanent').split('|')[0]}${moved === 1 ? '' : 's'} ${effect.to === 'graveyard' ? 'move to graveyards' : effect.to === 'exile' ? 'are exiled' : 'move zones'}.`);
      continue;
    }
    if (effect.kind === 'untap-selection') {
      const ids = [].concat(bindings[effect.bind] || []);
      for (const id of ids) { const hit = locateCardInGame(game, id); if (hit) hit.card.tapped = false; }
      notes.push(`${ids.length} land${ids.length === 1 ? '' : 's'} untapped.`);
      continue;
    }
    if (effect.kind === 'grant-keyword-each') {
      const players = effect.scope === 'opponents' ? game.players.filter(p => p.playerId !== controllerId && !p.eliminated) : effect.scope === 'all' ? game.players.filter(p => !p.eliminated) : [controller];
      const only = effect.onlyIds ? new Set([].concat(bindings[effect.onlyIds] || [])) : null;
      let changed = 0;
      for (const p of players)
        for (const c of p.deck?.battlefield || [])
          if ((only ? only.has(c.instanceId) : cardMatchesFilter(game, c, effect.filter || 'creature'))) {
            c.temporaryEffects = c.temporaryEffects || [];
            c.temporaryEffects.push({ kind: 'keyword', keyword: effect.keyword, enabled: effect.enabled !== false, expires: effect.expires === 'your-next-turn' ? `turn-start:${controllerId}` : (effect.expires || 'cleanup') });
            changed++;
          }
      notes.push(`${changed} permanent${changed === 1 ? '' : 's'} ${effect.enabled === false ? 'lose' : 'gain'} ${effect.keyword}.`);
      continue;
    }
    if (effect.kind === 'grant-cast-zone') {
      controller.temporaryPermissions = controller.temporaryPermissions || [];
      controller.temporaryPermissions.push({ kind: 'cast-from-zone', zone: effect.zone || 'graveyard', expires: effect.expires || 'cleanup' });
      notes.push(`${controller.displayName} may cast cards from their ${effect.zone || 'graveyard'} this turn.`);
      continue;
    }
    if (effect.kind === 'prevent-damage') {
      const targetId = resolveBoundId(effect, bindings);
      if (!targetId)
        throw new Error('Damage-prevention target is unavailable.');
      game.damagePrevention = game.damagePrevention || [];
      game.damagePrevention.push({ targetId, amount, expires: effect.expires || 'cleanup' });
      notes.push(`The next ${amount} damage to the chosen target is prevented.`);
      continue;
    }
    if (effect.kind === 'force-block') {
      const blockerId = effect.blockerId || bindings[effect.blockerBind], attackerId = effect.attackerId || bindings[effect.attackerBind], hit = locateCardInGame(game, blockerId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('Forced blocker is unavailable.');
      hit.card.temporaryEffects = hit.card.temporaryEffects || [];
      hit.card.temporaryEffects.push({ kind: 'forced-block', attackerId, expires: effect.expires || 'end-combat' });
      notes.push(`${cardName(game, hit.card)} must block the chosen creature this combat if able.`);
      continue;
    }
    if (effect.kind === 'combat-restriction') {
      const targetId = resolveBoundId(effect, bindings), hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('Combat-restriction target is no longer on the battlefield.');
      hit.card.temporaryEffects = hit.card.temporaryEffects || [];
      hit.card.temporaryEffects.push({ kind: 'combat-restriction', restriction: effect.restriction, expires: effect.expires === 'your-next-turn' ? `turn-start:${controllerId}` : (effect.expires || 'cleanup') });
      notes.push(`${cardName(game, hit.card)} gains a temporary combat restriction.`);
      continue;
    }
    if (effect.kind === 'destroy-selected-many') {
      const raw = bindings[effect.bind] || {};
      const ids = Array.isArray(raw) ? raw : Object.values(raw).filter(Boolean);
      let moved = 0;
      for (const id of ids) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'battlefield')
          continue;
        const d = definitionFor(game, hit.card);
        if (isIndestructible(hit.card, d)) {
          notes.push(`${d?.name || 'Permanent'} is indestructible and is not destroyed.`);
          continue;
        }
        if (regenerates(game, hit.card, notes)) continue;
        moveCard(game, id, 'graveyard', { onEvent: e => emit(bindings, e) });
        moved++;
      }
      notes.push(`${moved} selected permanent${moved === 1 ? '' : 's'} ${moved === 1 ? 'is' : 'are'} destroyed.`);
      continue;
    }
    if (['destroy', 'exile', 'bounce', 'sacrifice'].includes(effect.kind)) {
      const targetId = resolveBoundId(effect, bindings);
      if (!targetId)
        throw new Error(`${effect.kind} requires a target or selection.`);
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('The selected permanent is no longer on the battlefield.');
      const d = definitionFor(game, hit.card), name = d?.name || 'Permanent';
      if (effect.kind === 'destroy' && isIndestructible(hit.card, d)) {
        notes.push(`${name} is indestructible and is not destroyed.`);
        continue;
      }
      const to = effect.kind === 'exile' ? 'exile' : effect.kind === 'bounce' ? 'hand' : 'graveyard';
      if (effect.kind === 'destroy' && regenerates(game, hit.card, notes)) continue;
      if (effect.kind === 'destroy' && Number(hit.card?.counters?.shield || 0) > 0) {
        hit.card.counters.shield = Math.max(0, Number(hit.card.counters.shield) - 1);
        notes.push(`${name}'s shield counter prevents the destruction.`);
        continue;
      }
      rememberLast(game, bindings, hit, d);
      // Remember what a permanent exiled ("return the exiled card", "until this leaves the battlefield").
      const linker = effect.kind === 'exile' && targetId !== bindings.sourceId ? locateCardInGame(game, bindings.sourceId) : null;
      if (linker && linker.zone === 'battlefield') {
        linker.card.linkedExile = [...(linker.card.linkedExile || []), targetId];
        if (effect.untilLeaves) linker.card.untilLeavesExile = [...(linker.card.untilLeavesExile || []), targetId];
      }
      moveCard(game, targetId, to, { moveReason: effect.kind === 'sacrifice' ? 'sacrifice' : null, onEvent: e => emit(bindings, e) });
      notes.push(`${name} ${effect.kind === 'bounce' ? 'returns to its owner’s hand' : effect.kind === 'exile' ? 'is exiled' : effect.kind === 'sacrifice' ? 'is sacrificed' : 'is destroyed'}.`);
      continue;
    }
    if (effect.kind === 'sacrifice-many') {
      const players = targetPlayers(game, controllerId, effect.scope || 'you', effect.playerId || bindings[effect.playerBind]);
      const raw = bindings[effect.bind] || {};
      for (const p of players) {
        const ids = Array.isArray(raw) ? raw : (raw[p.playerId] || []);
        // A player sacrifices as many as they can; fewer legal permanents than required is not an error.
        const available = (p.deck?.battlefield || []).filter(c => cardMatchesFilter(game, c, effect.filter || 'permanent')).length;
        const need = Math.min(amount, available);
        if (ids.length < need)
          throw new Error(`${p.displayName} must choose ${need} permanent${need === 1 ? '' : 's'} to sacrifice.`);
        for (const id of ids.slice(0, need)) {
          const hit = locateCardInGame(game, id);
          if (!hit || hit.zone !== 'battlefield' || (hit.card.controllerId || hit.player.playerId) !== p.playerId)
            throw new Error('A sacrifice choice is no longer legal.');
          const n = cardName(game, hit.card);
          moveCard(game, id, 'graveyard', { moveReason: 'sacrifice', onEvent: e => emit(bindings, e) });
          notes.push(`${p.displayName} sacrifices ${n}.`);
        }
      }
      continue;
    }
    if (effect.kind === 'counter') {
      const targetId = resolveBoundId(effect, bindings);
      if (!targetId && effect.optional) { notes.push('No creature was chosen.'); continue; }
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('The counter target is no longer legal.');
      const oldValue = Number(hit.card?.counters?.[effect.counter || '+1/+1'] || 0);
      const real = counterCount(game, hit.card.controllerId || hit.player?.playerId, effect.counter || '+1/+1', amount, { creature: isCreature(definitionFor(game, hit.card)) });
      if (real !== amount) notes.push(`(${real} counters instead of ${amount}.)`);
      addCounter(hit.card, effect.counter || '+1/+1', real);
      const newValue = Number(hit.card?.counters?.[effect.counter || '+1/+1'] || 0);
      notes.push(`${cardName(game, hit.card)} gets ${amount} ${effect.counter || '+1/+1'} counter${amount === 1 ? '' : 's'}.`);
      emit(bindings, { type: 'counter-added', targetId, controllerId: hit.card.controllerId, sourceId: bindings.sourceId || null, counter: effect.counter || '+1/+1', amount, oldValue, newValue });
      checkLethal(game, targetId, notes, bindings);
      continue;
    }
    if (effect.kind === 'counter-each') {
      const player = effect.scope === 'opponents' || effect.scope === 'all' ? null : controller;
      const rows = [];
      for (const p of (player ? [player] : game.players.filter(x => !x.eliminated && (effect.scope === 'all' || x.playerId !== controllerId))))
        for (const c of p.deck?.battlefield || [])
          if (cardMatchesFilter(game, c, effect.filter || 'creature'))
            rows.push(c);
      for (const c of rows) {
        addCounter(c, effect.counter || '+1/+1', counterCount(game, c.controllerId, effect.counter || '+1/+1', amount, { creature: isCreature(definitionFor(game, c)) }));
        emit(bindings, { type: 'counter-added', targetId: c.instanceId, controllerId: c.controllerId, sourceId: bindings.sourceId || null, counter: effect.counter || '+1/+1', amount });
      }
      notes.push(`${rows.length} permanent${rows.length === 1 ? '' : 's'} get ${amount} ${effect.counter || '+1/+1'} counter${amount === 1 ? '' : 's'}.`);
      continue;
    }
    if (effect.kind === 'remove-counter') {
      const targetId = resolveBoundId(effect, bindings);
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('The counter-removal target is no longer legal.');
      addCounter(hit.card, effect.counter || '+1/+1', -amount);
      notes.push(`${amount} ${effect.counter || '+1/+1'} counter${amount === 1 ? '' : 's'} removed from ${cardName(game, hit.card)}.`);
      checkLethal(game, targetId, notes, bindings);
      continue;
    }
    if (effect.kind === 'tap-many' || effect.kind === 'untap-many') {
      const ids = resolveSelectionIds(effect, bindings), tap = effect.kind === 'tap-many';
      for (const id of ids) {
        const hit = locateCardInGame(game, id);
        if (hit?.zone === 'battlefield')
          hit.card.tapped = tap;
      }
      notes.push(`${ids.length} permanent${ids.length === 1 ? '' : 's'} ${tap ? 'tap' : 'untap'}.`);
      continue;
    }
    if (effect.kind === 'tap' || effect.kind === 'untap') {
      const targetId = resolveBoundId(effect, bindings);
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('Tap/untap target is no longer legal.');
      hit.card.tapped = effect.kind === 'tap';
      notes.push(`${cardName(game, hit.card)} ${effect.kind === 'tap' ? 'taps' : 'untaps'}.`);
      emit(bindings, { type: effect.kind === 'tap' ? 'tapped' : 'untapped', sourceId: targetId, controllerId: hit.card.controllerId });
      continue;
    }
    if (effect.kind === 'graveyard-zone-each') {
      const players = effect.scope === 'target-player' ? [game.players.find(p => p.playerId === (effect.playerId || bindings[effect.playerBind]))].filter(Boolean) : effect.scope === 'opponents' ? game.players.filter(p => p.playerId !== controllerId && !p.eliminated) : effect.scope === 'all' ? game.players.filter(p => !p.eliminated) : [controller];
      let moved = 0;
      for (const p of players) {
        const ids = (p.deck.graveyard || []).filter(c => cardMatchesFilter(game, c, effect.filter || 'card')).map(c => c.instanceId);
        for (const id of ids) {
          moveCard(game, id, effect.to, { tapped: !!effect.tapped, ...(effect.to === 'battlefield' ? { controllerId: effect.underYourControl ? controllerId : p.playerId } : {}), onEvent: e => emit(bindings, e) });
          moved++;
        }
      }
      notes.push(`${moved} card${moved === 1 ? '' : 's'} move from graveyards.`);
      continue;
    }
    if (effect.kind === 'extra-turn') {
      const targetId = effect.playerId || bindings[effect.playerBind] || controllerId;
      if (!game.players.some(p => p.playerId === targetId))
        throw new Error('Extra-turn player is unavailable.');
      game.extraTurnQueue = game.extraTurnQueue || [];
      game.extraTurnQueue.push(targetId);
      notes.push(`${game.players.find(p => p.playerId === targetId)?.displayName || 'Player'} gets an extra turn.`);
      continue;
    }
    if (effect.kind === 'extra-land-play') {
      controller.counters = controller.counters || {};
      controller.counters.extraLandPlaysThisTurn = Number(controller.counters.extraLandPlaysThisTurn || 0) + Number(effect.amount || 1);
      notes.push(`${controller.displayName} may play ${effect.amount || 1} additional land this turn.`);
      continue;
    }
    if (effect.kind === 'tap-each' || effect.kind === 'untap-each') {
      const tap = effect.kind === 'tap-each';
      const players = effect.scope === 'target-player' ? [game.players.find(p => p.playerId === (effect.playerId || bindings[effect.playerBind]))].filter(Boolean) : effect.scope === 'opponents' ? game.players.filter(p => p.playerId !== controllerId) : [controller];
      let n = 0;
      for (const p of players)
        for (const c of p.deck?.battlefield || [])
          if (cardMatchesFilter(game, c, effect.filter || 'creature')) {
            c.tapped = tap;
            n++;
          }
      notes.push(`${n} permanent${n === 1 ? '' : 's'} ${tap ? 'tap' : 'untap'}.`);
      continue;
    }
    if (effect.kind === 'pump') {
      const targetId = resolveBoundId(effect, bindings);
      const hit = locateCardInGame(game, targetId);
      // An earlier part of the same effect may already have killed it (Tragic Slip): nothing more happens to it.
      if (!hit || hit.zone !== 'battlefield') { notes.push('That creature is no longer on the battlefield.'); continue; }
      hit.card.temporaryEffects = hit.card.temporaryEffects || [];
      const sizedPt = v => /X/i.test(String(v)) ? (String(v).startsWith('-') ? -1 : 1) * Math.max(0, resolveAmount(game, controllerId, 'X', bindings)) : Number(v || 0);
      effect = { ...effect, power: sizedPt(effect.power), toughness: sizedPt(effect.toughness) };
      hit.card.temporaryEffects.push({ kind: 'pt', power: Number(effect.power || 0), toughness: Number(effect.toughness || 0), expires: effect.expires === 'your-next-turn' ? `turn-start:${controllerId}` : (effect.expires || 'cleanup') });
      if (effect.exileIfDies) hit.card.temporaryEffects.push({ kind: 'exile-if-dies', expires: 'cleanup' });
      notes.push(`${cardName(game, hit.card)} gets ${Number(effect.power || 0) >= 0 ? '+' : ''}${Number(effect.power || 0)}/${Number(effect.toughness || 0) >= 0 ? '+' : ''}${Number(effect.toughness || 0)} until end of turn.`);
      checkLethal(game, targetId, notes, bindings);
      continue;
    }
    if (effect.kind === 'pump-each') {
      const players = effect.scope === 'opponents' ? game.players.filter(p => p.playerId !== controllerId) : effect.scope === 'all' ? game.players.filter(p => !p.eliminated) : [controller];
      // "-X/-X": X chosen as the spell was cast.
      const sized = v => /X/i.test(String(v)) ? (String(v).startsWith('-') ? -1 : 1) * Math.max(0, resolveAmount(game, controllerId, 'X', bindings)) : Number(v || 0);
      effect = { ...effect, power: sized(effect.power), toughness: sized(effect.toughness) };
      let n = 0;
      for (const p of players)
        for (const c of p.deck?.battlefield || [])
          if (cardMatchesFilter(game, c, effect.filter || 'creature') && !(effect.exceptSource && c.instanceId === bindings.sourceId)) {
            c.temporaryEffects = c.temporaryEffects || [];
            c.temporaryEffects.push({ kind: 'pt', power: Number(effect.power || 0), toughness: Number(effect.toughness || 0), expires: effect.expires || 'cleanup' });
            n++;
          }
      notes.push(`${n} permanent${n === 1 ? '' : 's'} get the temporary power/toughness change.`);
      continue;
    }
    if (effect.kind === 'grant-keyword') {
      const targetId = resolveBoundId(effect, bindings);
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('The keyword target is no longer legal.');
      hit.card.temporaryEffects = hit.card.temporaryEffects || [];
      hit.card.temporaryEffects.push({ kind: 'keyword', keyword: effect.keyword, enabled: effect.enabled !== false, expires: effect.expires || 'cleanup' });
      notes.push(`${cardName(game, hit.card)} ${effect.enabled === false ? 'loses' : 'gains'} ${effect.keyword} until end of turn.`);
      continue;
    }
    if (effect.kind === 'create-token') {
      if (effect.chooseBind && effect.alt?.[bindings[effect.chooseBind]]) effect = { ...effect, ...effect.alt[bindings[effect.chooseBind]], chooseBind: null };
      const probe = makeToken(game, controller, effect, 0);
      const made = tokenCount(game, controllerId, amount, { creature: isCreature(definitionFor(game, probe)) });
      for (let i = 0; i < made; i++) {
        const token = makeToken(game, controller, effect, i);
        if (effect.tempKeywords?.length) token.temporaryEffects = effect.tempKeywords.map(keyword => ({ kind: 'keyword', keyword, enabled: true, expires: 'cleanup' }));
        if (effect.tapped) token.tapped = true;
        controller.deck.battlefield.push(token);
        bindings.lastCreated = [...(bindings.lastCreated || []), token.instanceId];
        emit(bindings, { type: 'token-created', sourceId: token.instanceId, definitionId: token.definitionId, controllerId, ownerId: controllerId, typeLine: definitionFor(game, token)?.typeLine || '' });
        emit(bindings, { type: 'enters-battlefield', sourceId: token.instanceId, definitionId: token.definitionId, controllerId, ownerId: controllerId, typeLine: definitionFor(game, token)?.typeLine || '', token: true });
      }
      notes.push(`${controller.displayName} creates ${made} ${effect.name || effect.tokenName || 'token'} token${made === 1 ? '' : 's'}.`);
      continue;
    }
    if (effect.kind === 'return-from-graveyard') {
      const targetId = resolveBoundId(effect, bindings);
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'graveyard')
        throw new Error('The selected graveyard card is no longer legal.');
      const d = definitionFor(game, hit.card), to = effect.to || 'hand';
      rememberLast(game, bindings, hit, d);
      moveCard(game, targetId, to, { controllerId, to, tapped: !!effect.tapped, onEvent: e => emit(bindings, e) });
      notes.push(`${d?.name || 'Card'} returns from the graveyard to ${to === 'battlefield' ? 'the battlefield' : 'its owner’s hand'}.`);
      continue;
    }
    if (effect.kind === 'move-zone') {
      const targetId = resolveBoundId(effect, bindings);
      const hit = locateCardInGame(game, targetId);
      if (!hit)
        throw new Error('The selected card is no longer in a tracked zone.');
      const n = cardName(game, hit.card);
      moveCard(game, targetId, effect.to, { controllerId: effect.controllerId || controllerId, position: effect.position || 'bottom', tapped: !!effect.tapped, onEvent: e => emit(bindings, e) });
      notes.push(`${n} moves to ${effect.to}.`);
      continue;
    }
    if (effect.kind === 'choose-color') {
      const targetId = effect.targetId || bindings[effect.bind] || bindings.sourceId;
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('The permanent that needs a color choice is unavailable.');
      const color = effect.color || bindings[effect.colorBind || 'color'];
      if (!['W', 'U', 'B', 'R', 'G'].includes(color))
        throw new Error('A legal color must be chosen.');
      hit.card.chosenColor = color;
      notes.push(`${cardName(game, hit.card)} has ${color} chosen.`);
      continue;
    }
    if (effect.kind === 'choose-creature-type') {
      const targetId = effect.targetId || bindings.sourceId;
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('The permanent that needs a creature type choice is unavailable.');
      const value = String(effect.value || bindings[effect.bind || 'creatureType'] || '').trim();
      if (!value)
        throw new Error('Choose a creature type.');
      hit.card.chosenCreatureType = value;
      notes.push(`${cardName(game, hit.card)} has ${value} chosen.`);
      continue;
    }
    if (effect.kind === 'add-mana') {
      const color = effect.color || bindings[effect.colorBind || 'manaColor'];
      if (!['W', 'U', 'B', 'R', 'G', 'C'].includes(color))
        throw new Error('A legal mana color/type must be chosen.');
      controller.mana.available[color] = Number(controller.mana.available[color] || 0) + amount;
      controller.mana.floating = controller.mana.floating || { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      controller.mana.floating[color] = Number(controller.mana.floating[color] || 0) + amount;
      notes.push(`${controller.displayName} adds ${amount} ${color} mana.`);
      continue;
    }
    if (effect.kind === 'double-power') {
      const id = resolveBoundId(effect, bindings), hit = locateCardInGame(game, id);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('Power-doubling target is unavailable.');
      const current = effectivePower(hit.card, definitionFor(game, hit.card), game);
      hit.card.temporaryEffects = hit.card.temporaryEffects || [];
      hit.card.temporaryEffects.push({ kind: 'pt', power: current, toughness: 0, expires: effect.expires || 'cleanup' });
      notes.push(`${cardName(game, hit.card)}'s power is doubled.`);
      continue;
    }
    if (effect.kind === 'double-counter') {
      const id = resolveBoundId(effect, bindings), hit = locateCardInGame(game, id);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('Counter-doubling target is unavailable.');
      const cur = Number(hit.card.counters?.[effect.counter] || 0);
      addCounter(hit.card, effect.counter, cur);
      notes.push(`${cardName(game, hit.card)} now has ${cur * 2} ${effect.counter} counters.`);
      continue;
    }
    if (effect.kind === 'exchange-life') {
      const q = game.players.find(p => p.playerId === (effect.playerId || bindings[effect.playerBind]));
      if (!q)
        throw new Error('Life-exchange opponent is unavailable.');
      const a = controller.life;
      controller.life = q.life;
      q.life = a;
      notes.push(`${controller.displayName} and ${q.displayName} exchange life totals.`);
      continue;
    }
    if (effect.kind === 'attach') {
      const eid = effect.equipmentId || bindings[effect.equipmentBind], cid = effect.creatureId || bindings[effect.creatureBind], eq = locateCardInGame(game, eid), cr = locateCardInGame(game, cid);
      if (!eq || eq.zone !== 'battlefield' || !cr || cr.zone !== 'battlefield')
        throw new Error('Attachment target is unavailable.');
      eq.card.attachedTo = cid;
      cr.card.attachments = cr.card.attachments || [];
      if (!cr.card.attachments.includes(eid))
        cr.card.attachments.push(eid);
      notes.push(`${cardName(game, eq.card)} attaches to ${cardName(game, cr.card)}.`);
      continue;
    }
    if (effect.kind === 'copy-stack') {
      const id = effect.stackId || bindings[effect.bind], obj = (game.stack || []).find(x => x.id === id);
      if (!obj || !['spell', 'spell-copy', 'ability', 'trigger'].includes(obj.kind)) {
        if (effect.soft) { notes.push('That spell is no longer on the stack.'); continue; }
        throw new Error('The targeted spell is no longer on the stack.');
      }
      // The copy is controlled by whoever copied it (Reverberate, Dualcaster Mage); "copy it twice" makes several.
      const times = Math.max(1, resolveAmount(game, controllerId, effect.times ?? 1, bindings));
      for (let n = 0; n < times; n++) {
        const copy = structuredClone(obj);
        copy.id = `stack-copy:${Date.now()}:${Math.random()}`;
        copy.kind = obj.kind === 'spell' || obj.kind === 'spell-copy' ? 'spell-copy' : obj.kind;
        copy.isCopy = true;
        copy.controllerId = controllerId;
        copy.retarget = !!effect.retarget;
        if (copy.card) copy.card = { ...copy.card, instanceId: `copy:${copy.card.instanceId}:${Date.now()}:${n}`, token: true, zone: 'stack' };
        game.stack.push(copy);
      }
      notes.push(`${obj.label || 'Spell'} is copied${times > 1 ? ` ${times} times` : ''}.`);
      continue;
    }
    if (effect.kind === 'gain-control') {
      const targetId = resolveBoundId(effect, bindings);
      changeControl(game, targetId, effect.controllerId || controllerId, { untilEndOfTurn: !!effect.untilEndOfTurn, bindings });
      if (effect.untap) {
        const hit = locateCardInGame(game, targetId);
        if (hit)
          hit.card.tapped = false;
      }
      if (effect.haste) {
        const hit = locateCardInGame(game, targetId);
        if (hit) {
          hit.card.temporaryEffects = hit.card.temporaryEffects || [];
          hit.card.temporaryEffects.push({ kind: 'keyword', keyword: 'Haste', enabled: true, expires: 'cleanup' });
        }
      }
      notes.push(`${cardName(game, locateCardInGame(game, targetId)?.card)} changes control${effect.untilEndOfTurn ? ' until end of turn' : ''}.`);
      continue;
    }
    if (effect.kind === 'scry') {
      const p = targetPlayers(game, controllerId, effect.scope || 'you', effect.playerId || bindings[effect.playerBind])[0] || controller;
      applyScry(game, p, effect, bindings, notes);
      continue;
    }
    if (effect.kind === 'surveil') {
      const p = targetPlayers(game, controllerId, effect.scope || 'you', effect.playerId || bindings[effect.playerBind])[0] || controller;
      applySurveil(game, p, effect, bindings, notes);
      continue;
    }
    if (effect.kind === 'shuffle') {
      shuffled(controller.deck.remainingLibrary);
      notes.push(`${controller.displayName} shuffles their library.`);
      continue;
    }
    if (effect.kind === 'proliferate') {
      applyProliferate(game, controller, effect, bindings, notes);
      continue;
    }
    if (effect.kind === 'counter-spell') {
      const stackId = effect.stackId || bindings[effect.bind];
      const i = (game.stack || []).findIndex(x => x.id === stackId);
      if (i < 0)
        throw new Error('The targeted spell is no longer on the stack.');
      if (game.stack[i].kind === 'spell' && (game.stack[i].cantBeCountered || /This spell can'?t be countered/i.test(definitionFor(game, game.stack[i].card)?.oracleText || ''))) {
        notes.push(`${game.stack[i].label || cardName(game, game.stack[i].card)} can't be countered.`);
        continue;
      }
      const [obj] = game.stack.splice(i, 1);
      if (obj.kind !== 'spell')
        throw new Error('The chosen stack object is not a spell.');
      bindings.counteredManaValue = Number(definitionFor(game, obj.card)?.manaValue ?? definitionFor(game, obj.card)?.cmc ?? 0);   // Mana Drain
      const owner = ownerFor(game, obj.card, game.players.find(p => p.playerId === obj.controllerId));
      const where = effect.exile ? 'exile' : 'graveyard';   // Force of Negation exiles it
      obj.card.zone = where;
      obj.card.controllerId = owner.playerId;
      owner.deck[where].push(obj.card);
      notes.push(`${obj.label || cardName(game, obj.card)} is countered.`);
      emit(bindings, { type: 'spell-countered', sourceId: obj.card.instanceId, definitionId: obj.card.definitionId, controllerId: obj.controllerId });
      continue;
    }
    if (effect.kind === 'copy-token') {
      const targetId = resolveBoundId(effect, bindings);
      const hit = locateCardInGame(game, targetId);
      if (!hit || hit.zone !== 'battlefield')
        throw new Error('Copy target is no longer on the battlefield.');
      const d = definitionFor(game, hit.card);
      const token = makeToken(game, controller, { name: d?.name || 'Copy', typeLine: d?.typeLine || 'Token', oracleText: d?.oracleText || '', power: d?.power, toughness: d?.toughness, keywords: d?.keywords || [], colors: d?.colors || [], tapped: !!effect.tapped }, 0);
      controller.deck.battlefield.push(token);
      bindings.lastCreated = [...(bindings.lastCreated || []), token.instanceId];
      emit(bindings, { type: 'token-created', sourceId: token.instanceId, definitionId: token.definitionId, controllerId });
      emit(bindings, { type: 'enters-battlefield', sourceId: token.instanceId, definitionId: token.definitionId, controllerId, typeLine: definitionFor(game, token)?.typeLine || '', token: true });
      notes.push(`${controller.displayName} creates a token copy of ${d?.name || 'the permanent'}.`);
      continue;
    }
    if (effect.kind === 'manual')
      throw new Error(`Guided resolution required: ${effect.text || 'Unsupported Oracle effect.'}`);
    throw new Error(`Unsupported tracked effect kind: ${effect.kind}`);
  }
  return notes;
}
// AV Effects + Triggers: effect packages are atomic. If any later effect in a
// multi-effect spell/ability fails validation, restore the complete pre-effect
// game state so a partially applied result can never leak into Guided play.
// Card definitions are large and never mutated by gameplay (tokens only add new ones), so
// snapshots leave them out and restoring keeps whatever definitions the game holds now.
export function snapshotGame(game) {
  const definitions = game.cardDefinitions;
  game.cardDefinitions = null;
  try {
    return structuredClone(game);
  }
  finally {
    game.cardDefinitions = definitions;
  }
}
export function restoreGameSnapshot(game, snapshot) {
  const definitions = game.cardDefinitions;
  for (const key of Object.keys(game))
    delete game[key];
  Object.assign(game, structuredClone(snapshot));
  game.cardDefinitions = definitions;
}
/** "if you control a creature with power 4 or greater", "if this artifact is tapped", "if it's not your turn". */
/** "you control six or more lands", "there are seven or more cards in your graveyard", "an opponent controls more lands
 * than you", "its power is 3 or greater", "you cast it" …: a condition test, or null if the wording is not understood. */
export function parseCondition(text) {
  const t = String(text || '').trim().replace(/\.$/, '');
  const counts = { a: 1, an: 1, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, thirteen: 13, twenty: 20 };
  let m;
  if ((m = t.match(/^you control (\w+) or more lands with different names$/i))) return { test: 'distinct-lands', min: counts[m[1].toLowerCase()] ?? Number(m[1]) };
  const sing = w => /plains$/i.test(w) ? w : w.replace(/s$/, '');
  if ((m = t.match(/^you control (a|an|no|(\w+) or more) (.+)$/i)) && parseSubject(sing(m[3]), null)) return { test: 'control', subject: sing(m[3]), min: m[2] ? (counts[m[2].toLowerCase()] ?? Number(m[2])) : 1, ...(/^no$/i.test(m[1]) ? { none: true } : {}) };
  if ((m = t.match(/^there are (\w+) or more cards in your graveyard$/i))) return { test: 'graveyard-count', min: counts[m[1].toLowerCase()] ?? Number(m[1]) };
  if (/^an opponent controls more lands than you$/i.test(t)) return { test: 'opponent-more-lands' };
  if (/^two or more of those creatures are attacking you/i.test(t)) return { test: 'always' };   // the trigger already checked it (Mangara)
  if (/^an opponent has more life than you$/i.test(t)) return { test: 'opponent-more-life' };
  if ((m = t.match(/^(?:its|that creature's) power is (\d+) or greater$/i))) return { test: 'event-power', min: Number(m[1]) };
  if ((m = t.match(/^you have (\d+) or more life$/i))) return { test: 'life', min: Number(m[1]) };
  if (/^you cast it$/i.test(t)) return { test: 'source-cast' };
  if (/^it'?s your turn$/i.test(t)) return { test: 'your-turn' };
  if (/^it'?s not your turn$/i.test(t)) return { test: 'not-your-turn' };
  if (/^a creature died this turn$/i.test(t)) return { test: 'creature-died' };
  return null;
}
export function checkCondition(game, controllerId, text, bindings = {}) { const c = parseCondition(text); return c ? conditionHolds(game, controllerId, c, bindings) : null; }
function conditionHolds(game, controllerId, effect, bindings) {
  const me = game.players.find(p => p.playerId === controllerId);
  if (effect.test === 'distinct-lands') return new Set((me?.deck?.battlefield || []).filter(c => /\bLand\b/.test(definitionFor(game, c)?.typeLine || '')).map(c => definitionFor(game, c)?.name)).size >= (effect.min || 1);
  if (effect.test === 'graveyard-count') return (me?.deck?.graveyard || []).length >= (effect.min || 1);
  if (effect.test === 'opponent-more-lands') { const n = p => (p.deck?.battlefield || []).filter(c => /\bLand\b/.test(definitionFor(game, c)?.typeLine || '')).length; return game.players.some(p => !p.eliminated && p.playerId !== controllerId && n(p) > n(me)); }
  if (effect.test === 'opponent-more-life') return game.players.some(p => !p.eliminated && p.playerId !== controllerId && Number(p.life || 0) > Number(me?.life || 0));
  if (effect.test === 'event-power') { const h = locateCardInGame(game, bindings.eventCard || bindings.sourceId); return !!h && effectivePower(h.card, definitionFor(game, h.card), game) >= (effect.min || 0); }
  if (effect.test === 'life') return Number(me?.life || 0) >= (effect.min || 0);
  if (effect.test === 'source-cast') { const h = locateCardInGame(game, bindings.sourceId); return !!h?.card?.castMode || !!h?.card?.wasCast; }
  if (effect.test === 'control') {
    const subject = parseSubject(effect.subject, null);
    if (!subject || !me) return false;
    const row = { card: { instanceId: bindings.sourceId || 'none' }, player: me };
    const n = (me.deck?.battlefield || []).filter(c => subjectMatches(game, row, { ...subject, controller: null }, c, definitionFor(game, c), controllerId)).length;
    return effect.none ? n === 0 : n >= (effect.min || 1);
  }
  if (effect.test === 'chosen') return bindings[effect.bind] === true;
  if (effect.test === 'source-untapped') { const c = locateCardInGame(game, bindings.sourceId)?.card; return !!c && !c.tapped; }
  if (effect.test === 'control-commander') return (me?.deck?.battlefield || []).some(c => !c.token && (me.commanders || []).some(k => k.cardId === c.definitionId));
  if (effect.test === 'creature-died') return game.creatureDiedTurn === game.turnNumber;
  if (effect.test === 'source-tapped') return !!locateCardInGame(game, bindings.sourceId)?.card?.tapped;
  if (effect.test === 'not-your-turn') return game.activePlayerId !== controllerId;
  if (effect.test === 'your-turn') return game.activePlayerId === controllerId;
  if (effect.test === 'x-ge-library') return Number(bindings.X || 0) >= Number(me?.deck?.remainingLibrary?.length || 0);
  if (effect.test === 'last-turn-spells') { const s = game.lastTurnSpells || { total: 0, most: 0 }; return effect.none ? s.total === 0 : s.most >= (effect.atLeast || 2); }
  return true;
}
export function applyEffects(game, controllerId, effects = [], bindings = {}) {
  const snapshot = snapshotGame(game);
  try {
    return applyEffectsUnsafe(game, controllerId, effects, bindings);
  }
  catch (error) {
    restoreGameSnapshot(game, snapshot);
    throw error;
  }
}
function countExprFromPhrase(phrase) {
  const s = String(phrase || '').toLowerCase();
  if (!/graveyard|hand|library|opponent|player/.test(s) && /\bwith\b|that entered|nontoken|\bgreen|\bwhite|\bblue|\bblack|\bred\b/.test(s)) {
    const f = filterFromNoun(s);
    if (f) return { kind: 'count', zone: 'battlefield', filter: f };
  }
  let zone = 'battlefield', filter = 'card';
  if (/in your graveyard/.test(s))
    zone = 'graveyard';
  else if (/in your hand/.test(s))
    zone = 'hand';
  else if (/in your library/.test(s))
    zone = 'library';
  if (/basic land/.test(s))
    filter = 'basic land';
  else if (/creature/.test(s))
    filter = 'creature';
  else if (/artifact/.test(s))
    filter = 'artifact';
  else if (/enchantment/.test(s))
    filter = 'enchantment';
  else if (/planeswalker/.test(s))
    filter = 'planeswalker';
  else if (/land/.test(s))
    filter = 'land';
  else if (/permanent/.test(s))
    filter = 'permanent';
  return { kind: 'count', zone, filter };
}
/** "where X is …": the amount, counted as it resolves. */
export function whereXExpr(phrase) {
  const p = String(phrase || '').trim();
  return /devotion/i.test(p) ? { kind: 'devotion', color: { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[p.split(' ').pop().toLowerCase()] }
    : /'?s power$/i.test(p) ? { kind: 'source-power' }
    : /^the number of (.+?) on the battlefield$/i.test(p) ? { kind: 'count', zone: 'battlefield', filter: filterFromNoun(p.replace(/^the number of /i, '')) || 'creature', all: true }
    : /^the number of /i.test(p) && filterFromNoun(p.replace(/^the number of /i, '')) && !/graveyard|hand|library/i.test(p) ? { kind: 'count', zone: 'battlefield', filter: filterFromNoun(p.replace(/^the number of /i, '')) }
    : /^that spell'?s mana value$/i.test(p) ? { kind: 'binding', bind: 'eventManaValue' }
    : amountExpr(p);
}
function amountExpr(text) {
  const s = String(text || '').trim();
  const literal = numberFromText(s);
  if (literal != null)
    return literal;
  if (/^X$/i.test(s))
    return 'X';
  let m = s.match(/^the number of (.+)$/i);
  if (m)
    return countExprFromPhrase(m[1]);
  m = s.match(/^the greatest power among (.+)$/i);
  if (m)
    return { kind: 'greatest-power', filter: /creature/i.test(m[1]) ? 'creature' : 'permanent' };
  m = s.match(/^the greatest toughness among (.+)$/i);
  if (m)
    return { kind: 'greatest-toughness', filter: /creature/i.test(m[1]) ? 'creature' : 'permanent' };
  m = s.match(/^your life total$/i);
  if (m)
    return { kind: 'life-total' };
  m = s.match(/^the number of opponents you have$/i);
  if (m)
    return { kind: 'opponents' };
  return null;
}
function parseAmountPhrase(phrase) {
  const s = String(phrase || '').trim();
  const m = s.match(/^(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|X|the number of .+|the greatest power among .+|the greatest toughness among .+)/i);
  if (!m)
    return null;
  return amountExpr(m[1]);
}
function scopeFromSubject(subject = 'you') {
  const s = String(subject).toLowerCase();
  if (s.includes('each opponent'))
    return 'each-opponent';
  if (s.includes('each player'))
    return 'each-player';
  if (s.includes('all players'))
    return 'all-players';
  if (s.includes('target opponent'))
    return 'target-opponent';
  if (s.includes('target player'))
    return 'target-player';
  return 'you';
}
function targetRequirement(requirements, scope, label, extra = {}) { const bind = `target${requirements.length}`; requirements.push({ kind: 'target', bind, scope, label: label || scope, ...extra }); return bind; }
function playerRequirement(requirements, scope, label) { const bind = `player${requirements.length}`; requirements.push({ kind: 'player', bind, scope, label: label || scope }); return bind; }
function cardSelectionRequirement(requirements, { scope = 'you', filter = 'permanent', amount = 1, label = 'Choose permanent', playerBind = null } = {}) { const bind = `cards${requirements.length}`; requirements.push({ kind: 'card-selection', bind, scope, filter, amount, playerBind, label }); return bind; }
function normalizeClause(clause) { return String(clause || '').replace(/^•\s*/, '').replace(/\s+/g, ' ').trim(); }
function splitSentences(raw) {
  // Keep modal bullets as independent clauses; avoid splitting decimal-like content.
  // "When you do, …" (a reflexive trigger after "you may pay …") works like "If you do, …".
  return cleanOracle(raw).split(/\n+|(?<=\.)\s+(?=[A-Z])|(?<=\.")\s+(?=[A-Z])/).map(normalizeClause).filter(Boolean).map(c => c.replace(/^When you do,/i, 'If you do,'));
}
function stripReminderText(text) { return String(text || '').replace(/\([^()]*\)/g, '').replace(/\s+/g, ' ').trim(); }
function compileSingleClause(clause, { sourceName = 'Effect' } = {}) {
  const effects = [], requirements = [], unsupported = [];
  let c = stripReminderText(normalizeClause(clause));
  if (!c)
    return { effects, requirements, unsupported };
  if (/^(?:Activate only|This ability|Cast this spell|Play this ability|Do this only)\b/i.test(c))
    return { effects, requirements, unsupported };
  if (/^Choose (?:one|two|three|four|five|any number|one or more)\s*[—-]/i.test(c))
    return { effects, requirements, unsupported: [c] };
  let m;
  // Draw.
  if ((m = c.match(/^(You|Target player|Target opponent|Each player|Each opponent) draws? (a|an|one|two|three|four|five|six|seven|eight|nine|ten|X|cards? equal to the number of .+|cards? equal to the greatest power among .+|cards? equal to the greatest toughness among .+|that many cards?)(?: cards?)?\.?$/i))) {
    const scope = scopeFromSubject(m[1]);
    let phrase = m[2].replace(/^cards? equal to /i, '');
    let amount = phrase === 'that many cards' ? { kind: 'binding', bind: 'thatMany' } : amountExpr(phrase);
    if (amount == null)
      amount = numberFromText(phrase);
    const e = { kind: 'draw', scope: scope.startsWith('target-') ? 'you' : scope, amount };
    if (scope.startsWith('target-'))
      e.bind = playerRequirement(requirements, scope === 'target-opponent' ? 'opponent' : 'player', m[1]);
    effects.push(e);
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Draw (a|an|one|two|three|four|five|six|seven|eight|nine|ten|X) cards?\.?$/i))) {
    effects.push({ kind: 'draw', scope: 'you', amount: numberFromText(m[1]) ?? m[1].toUpperCase() });
    return { effects, requirements, unsupported };
  }
  if (/^Draw that many cards?\.?$/i.test(c)) {
    effects.push({ kind: 'draw', scope: 'you', amount: { kind: 'binding', bind: 'thatMany' } });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Draw cards? equal to (the number of .+|the greatest power among .+|the greatest toughness among .+)\.?$/i))) {
    effects.push({ kind: 'draw', scope: 'you', amount: amountExpr(m[1]) });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Draw a card for each (.+)\.?$/i))) {
    effects.push({ kind: 'draw', scope: 'you', amount: countExprFromPhrase(m[1]) });
    return { effects, requirements, unsupported };
  }
  // Discard.
  if (/^Discard your hand\.?$/i.test(c)) {
    effects.push({ kind: 'discard-hand', scope: 'you', countBind: 'thatMany' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(You|Target player|Target opponent|Each player|Each opponent) discards? (a|an|one|two|three|four|five|six|seven|X) cards?\.?$/i))) {
    const scope = scopeFromSubject(m[1]), amount = numberFromText(m[2]) ?? m[2].toUpperCase();
    const e = { kind: 'discard', scope: scope.startsWith('target-') ? 'you' : scope, amount };
    if (scope.startsWith('target-'))
      e.bind = playerRequirement(requirements, scope === 'target-opponent' ? 'opponent' : 'player', m[1]);
    e.cardsBind = `discardCards${requirements.length}`;
    requirements.push({ kind: 'discard-cards', bind: e.cardsBind, playerBind: e.bind || null, scope: scope === 'each-opponent' ? 'each-opponent' : scope === 'each-player' ? 'each-player' : scope === 'you' ? 'you' : 'target', amount });
    effects.push(e);
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Discard (a|an|one|two|three|four|five) cards?\.?$/i))) {
    const amount = numberFromText(m[1]);
    const bind = `discardCards${requirements.length}`;
    requirements.push({ kind: 'discard-cards', bind, scope: 'you', amount });
    effects.push({ kind: 'discard', scope: 'you', amount, cardsBind: bind });
    return { effects, requirements, unsupported };
  }
  // Mill.
  if ((m = c.match(/^(You|Target player|Target opponent|Each player|Each opponent) mills? (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) cards?\.?$/i))) {
    const scope = scopeFromSubject(m[1]), e = { kind: 'mill', scope: scope.startsWith('target-') ? 'you' : scope, amount: numberFromText(m[2]) ?? m[2].toUpperCase() };
    if (scope.startsWith('target-'))
      e.bind = playerRequirement(requirements, scope === 'target-opponent' ? 'opponent' : 'player', m[1]);
    effects.push(e);
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Mill (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) cards?\.?$/i))) {
    effects.push({ kind: 'mill', scope: 'you', amount: numberFromText(m[1]) ?? m[1].toUpperCase() });
    return { effects, requirements, unsupported };
  }
  // Life.
  if ((m = c.match(/^(You|Target player|Target opponent|Each player|Each opponent) (gains?|loses?) (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) life\.?$/i))) {
    const scope = scopeFromSubject(m[1]), e = { kind: 'life', scope: scope.startsWith('target-') ? 'you' : scope, amount: numberFromText(m[3]) ?? m[3].toUpperCase(), deltaSign: /gain/i.test(m[2]) ? 1 : -1 };
    if (scope.startsWith('target-'))
      e.bind = playerRequirement(requirements, scope === 'target-opponent' ? 'opponent' : 'player', m[1]);
    effects.push(e);
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Each opponent|Each player) loses life equal to (the number of .+|the greatest power among .+|the greatest toughness among .+)\.?$/i))) {
    effects.push({ kind: 'life', scope: scopeFromSubject(m[1]), amount: amountExpr(m[2]), deltaSign: -1 });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^You gain life equal to (the number of .+|the greatest power among .+|the greatest toughness among .+)\.?$/i))) {
    effects.push({ kind: 'life', scope: 'you', amount: amountExpr(m[1]), deltaSign: 1 });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Your life total becomes (\d+|one|two|three|four|five|ten|twenty|forty)\.?$/i))) {
    effects.push({ kind: 'set-life', scope: 'you', amount: numberFromText(m[1]) });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Each opponent loses (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) life and you gain (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) life\.?$/i))) {
    effects.push({ kind: 'life', scope: 'each-opponent', amount: numberFromText(m[1]) ?? m[1].toUpperCase(), deltaSign: -1 }, { kind: 'life', scope: 'you', amount: numberFromText(m[2]) ?? m[2].toUpperCase(), deltaSign: 1 });
    return { effects, requirements, unsupported };
  }
  // Damage, fight.
  if ((m = c.match(/^(?:This spell|[^.]+?) deals? (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) damage to (any target|target creature|target creature or planeswalker|target player or planeswalker|target opponent or planeswalker|target player|target opponent|target permanent)\.?$/i))) {
    const bind = targetRequirement(requirements, m[2].toLowerCase(), m[2]);
    effects.push({ kind: 'damage', amount: numberFromText(m[1]) ?? m[1].toUpperCase(), bind, sourceName });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^It deals damage equal to its power to (any target|target creature|target player|target opponent|target permanent)\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'damage', amount: { kind: 'source-power' }, bind, sourceName });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Target creature you control deals damage equal to its power to (any other target|any target|target creature|target player|target opponent)\.?$/i))) {
    const sourceBind = targetRequirement(requirements, 'target creature you control', 'Creature you control');
    const targetBind = targetRequirement(requirements, m[1].toLowerCase(), m[1], { excludeBind: sourceBind });
    effects.push({ kind: 'damage-from-selected-creature', sourceBind, targetBind, amount: { kind: 'source-power' } });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target creature you control) fights (target creature you don'?t control|another target creature)\.?$/i))) {
    const sourceBind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    const targetBind = targetRequirement(requirements, m[2].toLowerCase(), m[2], { excludeBind: sourceBind });
    effects.push({ kind: 'fight', sourceBind, targetBind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target creature) fights (target creature|target creature you don'?t control|another target creature)\.?$/i))) {
    const sourceBind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    const targetBind = targetRequirement(requirements, m[2].toLowerCase(), m[2], { excludeBind: sourceBind });
    effects.push({ kind: 'fight', sourceBind, targetBind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Return all (creature|artifact|enchantment|land|permanent) cards? from your graveyard to your hand\.?$/i))) {
    effects.push({ kind: 'graveyard-zone-each', scope: 'you', filter: m[1].toLowerCase(), to: 'hand' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Exile all cards from (target player)'?s graveyard\.?$/i))) {
    const playerBind = playerRequirement(requirements, 'player', m[1]);
    effects.push({ kind: 'graveyard-zone-each', scope: 'target-player', filter: 'card', to: 'exile', playerBind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Tap|Untap) all (creatures|artifacts|lands|permanents) (target player) controls\.?$/i))) {
    const playerBind = playerRequirement(requirements, 'player', m[3]);
    effects.push({ kind: m[1].toLowerCase() === 'tap' ? 'tap-each' : 'untap-each', scope: 'target-player', filter: m[2].replace(/s$/, ''), playerBind });
    return { effects, requirements, unsupported };
  }
  // Mass removal / bounce and temporary combat restrictions.
  if ((m = c.match(/^Destroy all (creatures|artifacts|enchantments|lands|permanents)\.?$/i))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: m[1].replace(/s$/, ''), to: 'graveyard', destroy: true });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Exile all (creatures|artifacts|enchantments|lands|permanents)\.?$/i))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: m[1].replace(/s$/, ''), to: 'exile' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Return all (creatures|artifacts|enchantments|lands|permanents) to their owners?' hands?\.?$/i))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: m[1].replace(/s$/, ''), to: 'hand' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target creature[^.]*) can'?t block this turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'combat-restriction', bind, restriction: 'cant-block', expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target creature[^.]*) can'?t be blocked this turn\.?$/i))) {
    // Rogue's Passage, Access Tunnel ("with power 3 or less")
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'combat-restriction', bind, restriction: 'cant-be-blocked', expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target creature[^.]*) can'?t attack or block this turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'combat-restriction', bind, restriction: 'cant-attack-or-block', expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target creature[^.]*) must attack this combat if able\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'combat-restriction', bind, restriction: 'must-attack', expires: 'end-combat' });
    return { effects, requirements, unsupported };
  }
  if (/^Target creature blocks target creature this turn if able\.?$/i.test(c)) {
    const blockerBind = targetRequirement(requirements, 'target creature', 'Creature that must block');
    const attackerBind = targetRequirement(requirements, 'target creature', 'Creature to block', { excludeBind: blockerBind });
    effects.push({ kind: 'force-block', blockerBind, attackerBind, expires: 'end-combat' });
    return { effects, requirements, unsupported };
  }
  // Destroy/exile/bounce / graveyard moves.
  if ((m = c.match(/^For each opponent, destroy up to one target (artifact or enchantment|artifact|enchantment) that player controls\.?$/i))) {
    const bind = `perOpponent${requirements.length}`;
    requirements.push({ kind: 'per-opponent-up-to-one', bind, filter: m[1].toLowerCase(), label: `Up to one ${m[1]} for each opponent` });
    effects.push({ kind: 'destroy-selected-many', bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Destroy (target .+?)\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'destroy', bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Exile (target .+?)\.?$/i)) && !/ until .+ leaves the battlefield/i.test(c)) {
    const scope = m[1].toLowerCase();
    if (/card .*graveyard/.test(scope)) {
      const bind = `grave${requirements.length}`;
      requirements.push({ kind: 'graveyard-target', bind, scope, label: m[1] });
      effects.push({ kind: 'move-zone', bind, to: 'exile' });
      return { effects, requirements, unsupported };
    }
    const bind = targetRequirement(requirements, scope, m[1]);
    effects.push({ kind: 'exile', bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Return (target .+?) to (?:its|their) owner'?s hand\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'bounce', bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Return (target (?:.+? )?card) from (your|a|target player'?s) graveyard to (?:your|its owner'?s) hand\.?$/i))) {
    const bind = `grave${requirements.length}`;
    requirements.push({ kind: 'graveyard-target', bind, scope: `${m[1].toLowerCase()}${/^your$/i.test(m[2]) ? ' in your graveyard' : ''}`, label: `${m[1]} in ${/^your$/i.test(m[2]) ? 'your' : 'a'} graveyard` });
    effects.push({ kind: 'return-from-graveyard', bind, to: 'hand' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(?:Return|Put) (target (?:.+? )?card) from (your|a|target player'?s) graveyard (?:to|onto) the battlefield( tapped)?(?: under your control)?\.?$/i))) {
    const bind = `grave${requirements.length}`;
    requirements.push({ kind: 'graveyard-target', bind, scope: `${m[1].toLowerCase()}${/^your$/i.test(m[2]) ? ' in your graveyard' : ''}`, label: `${m[1]} in ${/^your$/i.test(m[2]) ? 'your' : 'a'} graveyard` });
    effects.push({ kind: 'return-from-graveyard', bind, to: 'battlefield', tapped: !!m[3] });
    return { effects, requirements, unsupported };
  }
  // Follow-up sentences that refer to the card the previous sentence moved.
  if ((m = c.match(/^Its controller (gains|loses) life equal to its (power|toughness|mana value)\.?$/i))) {
    effects.push({ kind: 'life', scope: 'target', bind: '__lastController', amount: { kind: 'binding', bind: /power/i.test(m[2]) ? '__lastPower' : /toughness/i.test(m[2]) ? '__lastToughness' : '__lastManaValue' }, deltaSign: /gains/i.test(m[1]) ? 1 : -1 });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^You (gain|lose) life equal to (?:its|that (?:card|creature|permanent)'?s) (power|toughness|mana value)\.?$/i))) {
    effects.push({ kind: 'life', scope: 'you', amount: { kind: 'binding', bind: /power/i.test(m[2]) ? '__lastPower' : /toughness/i.test(m[2]) ? '__lastToughness' : '__lastManaValue' }, deltaSign: /gain/i.test(m[1]) ? 1 : -1 });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Put (target .+? card) from (?:your|a) graveyard on top of (?:your|its owner'?s) library\.?$/i))) {
    const bind = `grave${requirements.length}`;
    requirements.push({ kind: 'graveyard-target', bind, scope: m[1].toLowerCase(), label: m[1] });
    effects.push({ kind: 'move-zone', bind, to: 'library', position: 'top' });
    return { effects, requirements, unsupported };
  }
  // Sacrifice as an effect (not a cost).
  if ((m = c.match(/^(You|Each player|Each opponent|Target player|Target opponent) sacrifices? (a|an|one|two|three|four|five|\d+) (creature|artifact|enchantment|land|permanent)s?\.?$/i))) {
    const scope = scopeFromSubject(m[1]), amount = numberFromText(m[2]);
    const e = { kind: 'sacrifice-many', scope: scope.startsWith('target-') ? 'you' : scope, amount, filter: m[3].toLowerCase() };
    if (scope.startsWith('target-'))
      e.playerBind = playerRequirement(requirements, scope === 'target-opponent' ? 'opponent' : 'player', m[1]);
    e.bind = cardSelectionRequirement(requirements, { scope: scope === 'each-opponent' ? 'each-opponent' : scope === 'each-player' ? 'each-player' : scope === 'you' ? 'you' : 'target', filter: e.filter, amount, label: `Choose ${m[3]} to sacrifice`, playerBind: e.playerBind || null });
    effects.push(e);
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Sacrifice (a|an|one|two|three|four|five|\d+) (creature|artifact|enchantment|land|permanent)s?\.?$/i))) {
    const amount = numberFromText(m[1]);
    const bind = cardSelectionRequirement(requirements, { scope: 'you', filter: m[2].toLowerCase(), amount, label: `Choose ${m[2]} to sacrifice` });
    effects.push({ kind: 'sacrifice-many', scope: 'you', amount, filter: m[2].toLowerCase(), bind });
    return { effects, requirements, unsupported };
  }
  // Counters.
  const selfName = String(sourceName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Every way a card's text names itself: full name, the short name before a comma ("Mondrak"), "this artifact" …
  const shortName = String(sourceName || '').split(',')[0].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selfAny = `(?:${selfName}|${shortName}|this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|Saga|Vehicle|planeswalker))`;
  const selfCounterRe = rx(`^Put (a|an|one|two|three|four|five|\\d+) ([+-]\\d+\\/[+-]\\d+|\\+1\\/\\+1|-1\\/-1|[A-Za-z][A-Za-z -]+) counters? on (?:${selfAny}|it)\\.?$`, 'i');
  if ((m = c.match(selfCounterRe))) {
    // "on it" in a trigger is the event's creature (the one that entered); for its own abilities that is the source.
    effects.push({ kind: 'counter', bind: / on it\.?$/i.test(c) ? 'eventCard' : 'sourceId', counter: m[2].trim(), amount: numberFromText(m[1]) });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Put (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? on (target .+?)\.?$/i))) {
    const bind = targetRequirement(requirements, m[3].toLowerCase(), m[3]);
    effects.push({ kind: 'counter', bind, counter: m[2].trim(), amount: numberFromText(m[1]) });
    return { effects, requirements, unsupported };
  }
  // "another target creature", "up to one target creature": the player picks (or, for "up to one", may pick none).
  if ((m = c.match(/^Put (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? on (another target|up to one (?:other )?target) (.+?)\.?$/i))) {
    const upTo = /^up to one/i.test(m[3]), other = /another|other/i.test(m[3]);
    const bind = targetRequirement(requirements, `target ${m[4].toLowerCase()}`, `${m[3].toLowerCase()} ${m[4]}`, { optional: upTo, notSource: other });
    effects.push({ kind: 'counter', bind, counter: m[2].trim(), amount: numberFromText(m[1]), optional: upTo });
    return { effects, requirements, unsupported };
  }
  // "Return a land you control to its owner's hand." (bounce lands): chosen as it resolves.
  if ((m = c.match(/^Return (a|an) (land|creature|artifact|enchantment|permanent|nonland permanent)( you control)? to its owner'?s hand\.?$/i))) {
    const bind = `choice${requirements.length}`;
    requirements.push({ kind: 'choose-permanent', bind, scope: `${m[2].toLowerCase()}${m[3] ? ' you control' : ''}`, label: `${m[1]} ${m[2]}${m[3] || ''} to return to its owner's hand` });
    effects.push({ kind: 'bounce', bind });
    return { effects, requirements, unsupported };
  }
  // "on a creature you control" (no "target"): chosen as it resolves; hexproof does not stop it.
  if ((m = c.match(/^Put (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? on (a|an|another) (creature|artifact creature|artifact|permanent|planeswalker|land)( you control)?\.?$/i))) {
    const bind = `choice${requirements.length}`;
    requirements.push({ kind: 'choose-permanent', optional: true, bind, scope: `${m[4].toLowerCase()}${m[5] ? ' you control' : ''}`, label: `${m[3].toLowerCase()} ${m[4]}${m[5] || ''} to get the counter${numberFromText(m[1]) === 1 ? '' : 's'}`, notSource: /another/i.test(m[3]) });
    effects.push({ kind: 'counter', bind, counter: m[2].trim(), amount: numberFromText(m[1]), optional: true });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Put (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? on each (creature|artifact|enchantment|land|permanent) you control\.?$/i))) {
    effects.push({ kind: 'counter-each', scope: 'you', filter: m[3].toLowerCase(), counter: m[2].trim(), amount: numberFromText(m[1]) });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Remove (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? from (target .+?)\.?$/i))) {
    const bind = targetRequirement(requirements, m[3].toLowerCase(), m[3]);
    effects.push({ kind: 'remove-counter', bind, counter: m[2].trim(), amount: numberFromText(m[1]) });
    return { effects, requirements, unsupported };
  }
  if (/^Proliferate\.?$/i.test(c)) {
    const bind = `proliferate${requirements.length}`;
    requirements.push({ kind: 'proliferate', bind, label: 'Choose permanents and/or players with counters' });
    effects.push({ kind: 'proliferate', bind });
    return { effects, requirements, unsupported };
  }
  // Tap / untap.
  if ((m = c.match(/^(Tap|Untap) up to (one|two|three|four|five|\d+) target (creatures|artifacts|lands|permanents)\.?$/i))) {
    const max = numberFromText(m[2]);
    const bind = `multi${requirements.length}`;
    requirements.push({ kind: 'multi-target', bind, scope: `target ${m[3]}`, min: 0, max, label: `Choose up to ${max} ${m[3]}` });
    effects.push({ kind: m[1].toLowerCase() === 'tap' ? 'tap-many' : 'untap-many', bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Tap|Untap) (target .+?)\.?$/i))) {
    const bind = targetRequirement(requirements, m[2].toLowerCase(), m[2]);
    effects.push({ kind: m[1].toLowerCase(), bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Tap|Untap) all (creatures|artifacts|lands|permanents) you control\.?$/i))) {
    effects.push({ kind: m[1].toLowerCase() === 'tap' ? 'tap-each' : 'untap-each', scope: 'you', filter: m[2].replace(/s$/, '') });
    return { effects, requirements, unsupported };
  }
  // P/T and temporary keywords.
  if ((m = c.match(/^(Target creature[^.]*) gets ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'pump', bind, power: Number(m[2]), toughness: Number(m[3]), expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Creatures you control|Each creature you control) get ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))) {
    effects.push({ kind: 'pump-each', scope: 'you', filter: 'creature', power: Number(m[2]), toughness: Number(m[3]), expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target (?:creature|permanent|legendary creature)[^.]*?) gains? ([A-Za-z][A-Za-z ,-]+?) until end of turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    for (const keyword of m[2].split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim()).filter(Boolean))
      effects.push({ kind: 'grant-keyword', bind, keyword, enabled: true, expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Creatures|Permanents|Artifacts|Each creature|Each permanent) you control gains? ([A-Za-z][A-Za-z ,-]+?) until end of turn\.?$/i))) {
    // "gain hexproof and indestructible", "gain flying, vigilance, and double strike": one effect per keyword.
    const filter = /permanent/i.test(m[1]) ? 'permanent' : /artifact/i.test(m[1]) ? 'artifact' : 'creature';
    for (const keyword of m[2].split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim()).filter(Boolean))
      effects.push({ kind: 'grant-keyword-each', scope: 'you', filter, keyword, expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if (/^This spell can'?t be countered\.?$/i.test(c)) return { effects, requirements, unsupported };
  if ((m = c.match(/^(?:You may )?Draw up to (one|two|three|four|\d+) cards\.?$/i))) {
    const bind = `number${requirements.length}`, max = numberFromText(m[1]);
    requirements.push({ kind: 'number', bind, min: 0, max, label: `Draw how many cards (0–${max})?` });
    effects.push({ kind: 'draw', scope: 'you', amount: { kind: 'binding', bind } });
    return { effects, requirements, unsupported };
  }
  if (/^Add an amount of \{C\} equal to that spell'?s mana value\.?$/i.test(c)) {
    effects.push({ kind: 'add-mana', color: 'C', amount: { kind: 'binding', bind: 'counteredManaValue' } });
    return { effects, requirements, unsupported };
  }
  // "It deals 1 damage to you." (City of Brass, Mana Vault)
  if ((m = c.match(rx(`^(?:This (?:artifact|creature|land|enchantment|permanent)|It|~|${String(sourceName || '~').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}) deals (one|two|three|\\d+) damage to you\\.?$`, 'i')))) {
    effects.push({ kind: 'damage', amount: numberFromText(m[1]), toController: true, sourceName });
    return { effects, requirements, unsupported };
  }   // checked when something tries to counter it
  if ((m = c.match(/^Non-([A-Z][a-z]+) creatures you control get ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))) {
    effects.push({ kind: 'pump-each', scope: 'you', filter: `creature|non:${m[1].toLowerCase()}`, power: Number(m[2]), toughness: Number(m[3]), expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Return all attacking creatures to their owners?'?s? hands?\.?$/i))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: 'creature|attacking', to: 'hand' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Untap up to (one|two|three|four|five|\d+) lands\.?$/i))) {
    const bind = cardSelectionRequirement(requirements, { scope: 'you', filter: 'land', amount: numberFromText(m[1]), label: 'lands to untap' });
    requirements[requirements.length - 1].upTo = true;
    effects.push({ kind: 'untap-selection', bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Each opponent|Target opponent|Target player) loses X life, where X is your devotion to (white|blue|black|red|green)\.?$/i))) {
    const color = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[m[2].toLowerCase()];
    const e = { kind: 'life', scope: /each/i.test(m[1]) ? 'each-opponent' : 'you', amount: { kind: 'devotion', color }, deltaSign: -1 };
    if (!/each/i.test(m[1])) { e.bind = `player${requirements.length}`; requirements.push({ kind: 'player', bind: e.bind, scope: /opponent/i.test(m[1]) ? 'opponent' : 'player', label: m[1].toLowerCase() }); }
    effects.push(e);
    return { effects, requirements, unsupported };
  }
  if (/^You gain life equal to the life lost this way\.?$/i.test(c)) {
    effects.push({ kind: 'life', scope: 'you', amount: { kind: 'binding', bind: 'lifeLostThisWay' }, deltaSign: 1 });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Put (a|an|one|two|\d+) (\+1\/\+1|[A-Za-z]+) counters? on each ([A-Z][a-z]+) creature you control\.?$/i))) {
    effects.push({ kind: 'counter-each', scope: 'you', filter: `creature|type:${m[3].toLowerCase()}`, counter: m[2], amount: numberFromText(m[1]) });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^All creatures get ([+-](?:\d+|X))\/([+-](?:\d+|X)) until end of turn\.?$/i))) {
    effects.push({ kind: 'pump-each', scope: 'all', filter: 'creature', power: m[1], toughness: m[2], expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Destroy all creatures with mana value (\d+) or (less|greater)\.?$/i))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: `creature|mv${m[2].toLowerCase() === 'less' ? '<=' : '>='}${m[1]}`, to: 'graveyard', destroy: true });
    return { effects, requirements, unsupported };
  }
  if (/^(?:It|They|That creature|A creature destroyed this way|Creatures destroyed this way) can'?t be regenerated\.?$/i.test(c)) {
    return { effects, requirements, unsupported };   // the game has no regeneration shields to stop
  }
  // Tokens.
  if ((m = c.match(/^For each opponent, create a (\d+)\/(\d+) ([^.]*?) creature token\.?$/i))) {
    const typeWords = m[3].trim(), subtype = (typeWords.match(/(?:white|blue|black|red|green|colorless)?\s*([A-Z][A-Za-z'-]+)(?:\s+creature)?$/i) || [])[1] || 'Creature';
    effects.push({ kind: 'create-token', amount: { kind: 'opponents' }, power: Number(m[1]), toughness: Number(m[2]), name: subtype, typeLine: `Token Creature — ${subtype}` });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Create a (\d+)\/(\d+) ([^.]*?) creature token for each (.+)\.?$/i))) {
    const typeWords = m[3].trim(), subtype = (typeWords.match(/(?:white|blue|black|red|green|colorless)?\s*([A-Z][A-Za-z'-]+)(?:\s+creature)?$/i) || [])[1] || 'Creature';
    effects.push({ kind: 'create-token', amount: countExprFromPhrase(m[4]), power: Number(m[1]), toughness: Number(m[2]), name: subtype, typeLine: `Token Creature — ${subtype}` });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Create (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) (\d+)\/(\d+) ([^.]*?) creature tokens?(?: with ([^.]+))?\.?$/i))) {
    const typeWords = m[4].trim();
    const subtype = (typeWords.match(/(?:white|blue|black|red|green|colorless)?\s*([A-Z][A-Za-z'-]+)(?:\s+creature)?$/i) || [])[1] || 'Creature';
    const kws = (m[5] || '').split(/,| and /).map(x => x.trim()).filter(Boolean);
    effects.push({ kind: 'create-token', amount: numberFromText(m[1]) ?? m[1].toUpperCase(), power: Number(m[2]), toughness: Number(m[3]), name: subtype, typeLine: `Token Creature — ${subtype}`, keywords: kws });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Create (a|an|one|two|three|four|five|\d+) (Treasure|Food|Clue|Blood|Map) tokens?\.?$/i))) {
    const name = m[2], text = name === 'Treasure' ? '{T}, Sacrifice this artifact: Add one mana of any color.' : name === 'Clue' ? '{2}, Sacrifice this artifact: Draw a card.' : name === 'Food' ? '{2}, {T}, Sacrifice this artifact: You gain 3 life.' : '';
    effects.push({ kind: 'create-token', amount: numberFromText(m[1]), name, typeLine: 'Token Artifact', oracleText: text });
    return { effects, requirements, unsupported };
  }
  if (/^Investigate\.?$/i.test(c)) {
    effects.push({ kind: 'create-token', amount: 1, name: 'Clue', typeLine: 'Token Artifact', oracleText: '{2}, Sacrifice this artifact: Draw a card.' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Create a token that'?s a copy of (target .+?)(?:, except .+)?\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'copy-token', bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Double (target creature)'?s power until end of turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'double-power', bind, expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Double the number of ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? on (target .+?)\.?$/i))) {
    const bind = targetRequirement(requirements, m[2].toLowerCase(), m[2]);
    effects.push({ kind: 'double-counter', bind, counter: m[1].trim() });
    return { effects, requirements, unsupported };
  }
  if (/^Exchange your life total with target opponent'?s life total\.?$/i.test(c)) {
    const playerBind = playerRequirement(requirements, 'opponent', 'target opponent');
    effects.push({ kind: 'exchange-life', playerBind });
    return { effects, requirements, unsupported };
  }
  if (/^Attach (?:this Equipment|it) to target creature you control\.?$/i.test(c)) {
    const creatureBind = targetRequirement(requirements, 'target creature you control', 'target creature you control');
    effects.push({ kind: 'attach', equipmentBind: 'sourceId', creatureBind });
    return { effects, requirements, unsupported };
  }
  if (/^Activate only as a sorcery\.?$/i.test(c))
    return { effects, requirements, unsupported };
  if (/^Attach target Equipment you control to target creature you control\.?$/i.test(c)) {
    const equipmentBind = targetRequirement(requirements, 'target equipment you control', 'Equipment you control');
    const creatureBind = targetRequirement(requirements, 'target creature you control', 'Creature you control', { excludeBind: equipmentBind });
    effects.push({ kind: 'attach', equipmentBind, creatureBind });
    return { effects, requirements, unsupported };
  }
  // Control.
  if ((m = c.match(/^Gain control of (target .+?)( until end of turn)?\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'gain-control', bind, untilEndOfTurn: !!m[2] });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Gain control of (target .+?) until end of turn\. Untap it\. It gains haste until end of turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'gain-control', bind, untilEndOfTurn: true, untap: true, haste: true });
    return { effects, requirements, unsupported };
  }
  // Scry / surveil.
  if ((m = c.match(/^Scry (one|two|three|four|five|\d+|X)\.?$/i))) {
    const amount = numberFromText(m[1]) ?? m[1].toUpperCase(), bind = `scry${requirements.length}`;
    requirements.push({ kind: 'scry', bind, amount, label: `Scry ${m[1]}` });
    effects.push({ kind: 'scry', scope: 'you', amount, bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Surveil (one|two|three|four|five|\d+|X)\.?$/i))) {
    const amount = numberFromText(m[1]) ?? m[1].toUpperCase(), bind = `surveil${requirements.length}`;
    requirements.push({ kind: 'surveil', bind, amount, label: `Surveil ${m[1]}` });
    effects.push({ kind: 'surveil', scope: 'you', amount, bind });
    return { effects, requirements, unsupported };
  }
  // Mana / shuffle.
  if ((m = c.match(/^Add ((?:\{[WUBRGC]\}){2,})\.?$/i))) {
    const symbols = [...m[1].matchAll(/\{([WUBRGC])\}/gi)].map(x => x[1].toUpperCase());
    const same = symbols.every(x => x === symbols[0]);
    if (same) {
      effects.push({ kind: 'add-mana', amount: symbols.length, color: symbols[0] });
      return { effects, requirements, unsupported };
    }
  }
  if ((m = c.match(/^Add (\{[WUBRGC]\}|one mana of any color|one mana of any type)(?: for each (.+))?\.?$/i))) {
    let color = null, colorBind = null;
    if (/^\{/.test(m[1]))
      color = m[1][1];
    else {
      colorBind = `manaColor${requirements.length}`;
      requirements.push({ kind: 'color', bind: colorBind, includeColorless: /any type/i.test(m[1]), label: m[1] });
    }
    effects.push({ kind: 'add-mana', amount: m[2] ? countExprFromPhrase(m[2]) : 1, color, colorBind });
    return { effects, requirements, unsupported };
  }
  if (/^Shuffle(?: your library)?\.?$/i.test(c)) {
    effects.push({ kind: 'shuffle' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target player|You) takes? an extra turn after this one\.?$/i))) {
    const playerBind = /target/i.test(m[1]) ? playerRequirement(requirements, 'player', m[1]) : null;
    effects.push({ kind: 'extra-turn', playerBind });
    return { effects, requirements, unsupported };
  }
  if (/^You may play an additional land this turn\.?$/i.test(c)) {
    effects.push({ kind: 'extra-land-play', amount: 1 });
    return { effects, requirements, unsupported };
  }
  if (/^You may cast spells from your graveyard this turn\.?$/i.test(c)) {
    effects.push({ kind: 'grant-cast-zone', zone: 'graveyard', expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Prevent the next (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) damage that would be dealt to (any target|target creature|target player|target permanent) this turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[2].toLowerCase(), m[2]);
    effects.push({ kind: 'prevent-damage', bind, amount: numberFromText(m[1]) ?? m[1].toUpperCase(), expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  // Stack interaction.
  if ((m = c.match(/^Counter (target (?:([a-z, ]+?) )?spell)(?: unless its controller pays .+)?\.?$/i))) {
    const bind = `stack${requirements.length}`;
    // "target noncreature spell", "target enchantment, instant, or sorcery spell": which spells may be chosen.
    requirements.push({ kind: 'stack-target', bind, scope: 'spell', label: m[1], spellFilter: m[2] ? m[2].replace(/,?\s*or\s+|,\s*/g, '|').toLowerCase() : null });
    effects.push({ kind: 'counter-spell', bind });
    return { effects, requirements, unsupported };
  }
  if (/^Copy target spell\.?$/i.test(c)) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: 'spell', label: 'target spell' });
    effects.push({ kind: 'copy-stack', bind });
    return { effects, requirements, unsupported };
  }
  // Chosen values attached to a permanent.
  if (/^Choose a color\.?$/i.test(c)) {
    const bind = `color${requirements.length}`;
    requirements.push({ kind: 'color', bind, includeColorless: false, label: 'Choose a color' });
    effects.push({ kind: 'choose-color', colorBind: bind });
    return { effects, requirements, unsupported };
  }
  if (/^Choose a creature type\.?$/i.test(c)) {
    const bind = `creatureType${requirements.length}`;
    requirements.push({ kind: 'creature-type-choice', bind, label: 'Choose a creature type' });
    effects.push({ kind: 'choose-creature-type', bind });
    return { effects, requirements, unsupported };
  }
  // Self references used by keyword reminder text (prowess, evoke, dash …).
  const selfRef = selfAny;
  if ((m = c.match(rx(`^${selfRef} gets ([+-]\\d+)\\/([+-]\\d+) until end of turn\\.?$`, 'i')))) {
    effects.push({ kind: 'pump', bind: 'sourceId', power: Number(m[1]), toughness: Number(m[2]), expires: 'cleanup' });
    return { effects, requirements, unsupported };
  }
  if (rx(`^Sacrifice ${selfRef}\\.?$`, 'i').test(c)) {
    effects.push({ kind: 'sacrifice', bind: 'sourceId' });
    return { effects, requirements, unsupported };
  }
  if (rx(`^Return ${selfRef} to (?:its|their) owner'?s hand\\.?$`, 'i').test(c)) {
    effects.push({ kind: 'bounce', bind: 'sourceId' });
    return { effects, requirements, unsupported };
  }
  // "each" forms (overload and mass effects).
  if ((m = c.match(/^(Destroy|Exile|Return) (?:each|all) (creature|artifact|enchantment|land|planeswalker|permanent|nonland permanent|noncreature permanent)s?( you don['’]?t control| your opponents control)?(?: to (?:its|their) owner(?:['’]s|s['’]?) hands?)?\.?$/i))) {
    const verb = m[1].toLowerCase(), filter = m[2].toLowerCase() === 'noncreature permanent' ? 'noncreature' : m[2].toLowerCase();
    effects.push({ kind: 'zone-each', scope: m[3] ? 'opponents' : 'all', filter, to: verb === 'exile' ? 'exile' : verb === 'return' ? 'hand' : 'graveyard', destroy: verb === 'destroy' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(?:This spell|[^.]+?) deals? (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) damage to each (creature|creature and planeswalker)( you don['’]?t control| your opponents control)?(?: and each (player|opponent))?\.?$/i))) {
    effects.push({ kind: 'damage-each', amount: numberFromText(m[1]) ?? m[1].toUpperCase(), filter: 'creature', creatures: m[3] ? 'opponents' : 'all', players: m[4] ? (/opponent/i.test(m[4]) ? 'opponents' : 'all') : null, sourceName });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(?:This spell|[^.]+?) deals? (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) damage to each (opponent|player)\.?$/i))) {
    effects.push({ kind: 'damage-each', amount: numberFromText(m[1]) ?? m[1].toUpperCase(), creatures: null, players: /opponent/i.test(m[2]) ? 'opponents' : 'all', sourceName });
    return { effects, requirements, unsupported };
  }
  if (/^You become the monarch\.?$/i.test(c)) {
    effects.push({ kind: 'designation', status: 'Monarch' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^Goad (target .+?)\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'goad', bind });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target creature[^.]*) gets ([+-]\d+)\/([+-]\d+) until your next turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'pump', bind, power: Number(m[2]), toughness: Number(m[3]), expires: 'your-next-turn' });
    return { effects, requirements, unsupported };
  }
  if ((m = c.match(/^(Target creature[^.]*) can['’]t attack until your next turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'combat-restriction', bind, restriction: 'cant-attack', expires: 'your-next-turn' });
    return { effects, requirements, unsupported };
  }
  if (rx(`^Transform (?:${selfName}|this creature|this permanent|this artifact|this land|this enchantment|it)\\.?$`, 'i').test(c)) {
    effects.push({ kind: 'transform', bind: 'sourceId' });
    return { effects, requirements, unsupported };
  }
  if (/^Damage can['’]t be prevented this turn\.?$/i.test(c)) {
    effects.push({ kind: 'unpreventable' });
    return { effects, requirements, unsupported };
  }
  if (/^Exile all graveyards\.?$/i.test(c) || /^Exile each opponent['’]s graveyard\.?$/i.test(c)) {
    effects.push({ kind: 'exile-graveyards', scope: /opponent/i.test(c) ? 'opponents' : 'all' });
    return { effects, requirements, unsupported };
  }
  // "Then sacrifice it" / pronoun continuations used after a source-creature choice.
  if (/^Sacrifice it\.?$/i.test(c)) {
    effects.push({ kind: 'sacrifice', bind: 'lastTarget' });
    return { effects, requirements, unsupported };
  }
  const more = compileMoreClauses(c, { sourceName, selfAny, effects, requirements });
  if (more) return { effects, requirements, unsupported };
  if (compileCatalogClause(c, { sourceName, selfAny, effects, requirements })) return { effects, requirements, unsupported };
  unsupported.push(c);
  return { effects, requirements, unsupported };
}
// "creatures you control with power 4 or greater", "green creature that entered this turn", "nontoken creature",
// "creature or planeswalker": a filter for cardMatchesFilter ("creature|power>=4"), or null if not understood.
const COLOR_WORDS = { white: 'w', blue: 'u', black: 'b', red: 'r', green: 'g' };
function filterFromNoun(phrase) {
  let s = String(phrase || '').toLowerCase().trim().replace(/\.$/, '').replace(/^(?:a|an|each|all|other)\s+/, '');
  const conds = [];
  let m;
  s = s.replace(/\s+(?:you control|your opponents control|an opponent controls|you don'?t control|on the battlefield)\b/, '');
  if ((m = s.match(/\s+with power (\d+) or (greater|less)/))) { conds.push(`power${m[2] === 'greater' ? '>=' : '<='}${m[1]}`); s = s.replace(m[0], ''); }
  if ((m = s.match(/\s+with mana value (\d+) or (greater|less)/))) { conds.push(`mv${m[2] === 'greater' ? '>=' : '<='}${m[1]}`); s = s.replace(m[0], ''); }
  if ((m = s.match(/\s+with (?:a|an|one or more) ([+-]\d+\/[+-]\d+|[a-z]+) counters? on (?:it|them)/))) { conds.push(`counter:${m[1]}`); s = s.replace(m[0], ''); }
  if ((m = s.match(/\s+that entered (?:the battlefield )?this turn/))) { conds.push('entered'); s = s.replace(m[0], ''); }
  s = s.trim();
  if ((m = s.match(/^([a-z]+?)s? or ([a-z]+?)s?$/))) return [`${m[1]} or ${m[2]}`, ...conds].join('|');
  const words = s.split(/\s+/).filter(Boolean);
  const noun = (words.pop() || '').replace(/s$/, '');
  if (!/^[a-z]+$/.test(noun)) return null;
  for (const w of words) {
    if (COLOR_WORDS[w]) conds.push(`color:${COLOR_WORDS[w]}`);
    else if (w === 'nontoken' || w === 'token') conds.push(w);
    else if (/^non[a-z]+$/.test(w)) conds.push(`non:${w.slice(3)}`);
    else if (['artifact', 'enchantment', 'legendary', 'snow', 'basic', 'land', 'creature'].includes(w)) conds.push(`type:${w}`);
    else return null;
  }
  return [noun, ...conds].join('|');
}
function scopeOfPhrase(phrase) {
  return /your opponents control|an opponent controls|you don'?t control/i.test(phrase) ? 'opponents' : /you control/i.test(phrase) ? 'you' : 'all';
}
const KEYWORD_LIST = s => String(s || '').split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim()).filter(Boolean);

/** More instructions (build 38). Pushes onto effects/requirements and returns true when the sentence is understood. */
function compileMoreClauses(c, { sourceName, selfAny, effects, requirements }) {
  let m;
  const N = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)';
  // Keyword lines that share a line with the spell's text once reminder text is removed.
  if ((m = c.match(/^(?:Split second|Flash|Cleave [^ ]+)\s+([A-Z].+)$/))) {
    const inner = compileSingleClause(m[1], { sourceName });
    if (inner.unsupported.length || !inner.effects.length) return false;
    effects.push(...inner.effects); requirements.push(...inner.requirements); return true;
  }
  // Ability words: "Ferocious — You gain 4 life for each …" (a condition, if any, is read elsewhere).
  if ((m = c.match(/^(?:Ferocious|Morbid|Raid|Revolt|Hellbent|Delirium|Spell mastery|Coven|Formidable|Alliance|Domain|Landfall|Constellation|Magecraft|Valiant|Heroic) — (?!If\b)(.+)$/))) {
    const inner = compileSingleClause(m[1], { sourceName });
    if (inner.unsupported.length || !inner.effects.length) return false;
    effects.push(...inner.effects); requirements.push(...inner.requirements); return true;
  }
  // Life.
  if ((m = c.match(rx(`^(?:You )?(gain|lose)s? ${N} life\\.?$`, 'i')))) {
    effects.push({ kind: 'life', scope: 'you', amount: numberFromText(m[2]) ?? m[2].toUpperCase(), deltaSign: /gain/i.test(m[1]) ? 1 : -1 });
    return true;
  }
  if ((m = c.match(rx(`^(You|Each opponent|Each player) (gains?|loses?) ${N} life for each (.+?)\\.?$`, 'i')))) {
    const per = numberFromText(m[3]) ?? 1, what = m[4];
    let of;
    if (/^spell you'?ve cast this turn$/i.test(what)) of = { kind: 'spells-cast-this-turn' };
    else if ((m[5] = (what.match(/^([a-z]+) counter on (?:it|.+)$/i) || [])[1])) of = { kind: 'source-counters', counter: m[5] };
    else if (/destroyed this way$/i.test(what)) of = { kind: 'binding', bind: 'movedThisWay' };
    else { const f = filterFromNoun(what); if (!f) return false; of = { kind: 'count', zone: 'battlefield', filter: f, all: scopeOfPhrase(what) === 'all' && !/you control/i.test(what) && /on the battlefield/i.test(what) }; }
    effects.push({ kind: 'life', scope: scopeFromSubject(m[1]), amount: { kind: 'times', n: per, of }, deltaSign: /gain/i.test(m[2]) ? 1 : -1 });
    return true;
  }
  if ((m = c.match(/^You (gain|lose) life equal to (the number of .+|the greatest power among .+|the greatest toughness among .+)\.?$/i))) {
    const amount = amountExpr(m[2]);
    if (amount == null) return false;
    effects.push({ kind: 'life', scope: 'you', amount, deltaSign: /gain/i.test(m[1]) ? 1 : -1 });
    return true;
  }
  // Draw / mill with "a".
  if ((m = c.match(/^(You|Target player|Target opponent|Each player|Each opponent) mills? (?:a card|that many cards)\.?$/i))) {
    const scope = scopeFromSubject(m[1]), e = { kind: 'mill', scope: scope.startsWith('target-') ? 'you' : scope, amount: /that many/i.test(c) ? { kind: 'binding', bind: 'eventAmount' } : 1 };
    if (scope.startsWith('target-')) e.bind = playerRequirement(requirements, scope === 'target-opponent' ? 'opponent' : 'player', m[1]);
    effects.push(e);
    return true;
  }
  if ((m = c.match(/^You and (target opponent|target player) each draw (a|one|two|three) cards?\.?$/i))) {
    const n = numberFromText(m[2]);
    effects.push({ kind: 'draw', scope: 'you', amount: n });
    effects.push({ kind: 'draw', scope: 'you', amount: n, bind: playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]) });
    return true;
  }
  // Sacrifice "of their choice", "nontoken creature", "creature or planeswalker", "each other player".
  if ((m = c.match(/^(You|Each player|Each opponent|Each other player|Target player|Target opponent) sacrifices? (a|an|one|two|three|four|five|\d+) ((?:nontoken )?(?:creature|artifact|enchantment|land|permanent)s?(?: or planeswalkers?)?)(?: of their choice)?\.?$/i))) {
    const scope = /each other player/i.test(m[1]) ? 'each-opponent' : scopeFromSubject(m[1]), amount = numberFromText(m[2]);
    const filter = filterFromNoun(m[3]);
    if (!filter) return false;
    const e = { kind: 'sacrifice-many', scope: scope.startsWith('target-') ? 'you' : scope, amount, filter };
    if (scope.startsWith('target-')) e.playerBind = playerRequirement(requirements, scope === 'target-opponent' ? 'opponent' : 'player', m[1]);
    e.bind = cardSelectionRequirement(requirements, { scope: scope === 'each-opponent' ? 'each-opponent' : scope === 'each-player' ? 'each-player' : scope === 'you' ? 'you' : 'target', filter, amount, label: `Choose ${m[3].toLowerCase()} to sacrifice`, playerBind: e.playerBind || null });
    effects.push(e);
    return true;
  }
  // Untap / tap / goad everything of a kind.
  if ((m = c.match(/^(Tap|Untap) all (nonland permanents|creatures|artifacts|lands|permanents) you control\.?$/i))) {
    effects.push({ kind: m[1].toLowerCase() === 'tap' ? 'tap-each' : 'untap-each', scope: 'you', filter: m[2].toLowerCase().replace(/s$/, '') });
    return true;
  }
  if (/^Goad all creatures (?:you don'?t control|your opponents control)\.?$/i.test(c)) {
    effects.push({ kind: 'goad-each', scope: 'opponents' });
    return true;
  }
  // Self: untap, fight, double counters, return from the graveyard.
  if (rx(`^Untap ${selfAny}\\.?$`, 'i').test(c)) { effects.push({ kind: 'untap', bind: 'sourceId' }); return true; }
  if (rx(`^Tap ${selfAny}\\.?$`, 'i').test(c)) { effects.push({ kind: 'tap', bind: 'sourceId' }); return true; }
  if ((m = c.match(rx(`^${selfAny} fights (another target creature|target creature(?: you don'?t control)?)\\.?$`, 'i')))) {
    const targetBind = targetRequirement(requirements, m[1].toLowerCase(), m[1], { notSource: true });
    effects.push({ kind: 'fight', sourceBind: 'sourceId', targetBind });
    return true;
  }
  if ((m = c.match(rx(`^Double the number of ([+-]\\d+\\/[+-]\\d+|[a-z]+) counters on (?:${selfAny}|it)\\.?$`, 'i')))) {
    effects.push({ kind: 'double-counter', bind: 'sourceId', counter: m[1] });
    return true;
  }
  if ((m = c.match(/^Double the number of ([+-]\d+\/[+-]\d+|[a-z]+) counters on each (creature|permanent) you control\.?$/i))) {
    effects.push({ kind: 'double-counter-each', scope: 'you', filter: m[2].toLowerCase(), counter: m[1] });
    return true;
  }
  if ((m = c.match(/^Return (?:this card|this creature card|it) from your graveyard to the battlefield( tapped)?\.?$/i))) {
    effects.push({ kind: 'return-self-graveyard', tapped: !!m[1] });
    return true;
  }
  // Mass power/toughness and keywords.
  if ((m = c.match(/^(?:Creatures|Each creature) your opponents control gets? ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))) {
    effects.push({ kind: 'pump-each', scope: 'opponents', filter: 'creature', power: Number(m[1]), toughness: Number(m[2]), expires: 'cleanup' });
    return true;
  }
  if ((m = c.match(/^Each creature gets ([+-](?:\d+|X))\/([+-](?:\d+|X)) until end of turn\.?$/i))) {
    effects.push({ kind: 'pump-each', scope: 'all', filter: 'creature', power: m[1], toughness: m[2], expires: 'cleanup' });
    return true;
  }
  // "Each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn." (Goreclaw)
  if ((m = c.match(/^Each (.+?) gets? ([+-]\d+)\/([+-]\d+)(?: and gains? ([a-z ,]+?))? until end of turn\.?$/i))) {
    const filter = filterFromNoun(m[1]);
    if (!filter) return false;
    const scope = scopeOfPhrase(m[1]);
    effects.push({ kind: 'pump-each', scope, filter, power: Number(m[2]), toughness: Number(m[3]), expires: 'cleanup' });
    for (const keyword of KEYWORD_LIST(m[4])) effects.push({ kind: 'grant-keyword-each', scope, filter, keyword, expires: 'cleanup' });
    return true;
  }
  // "Creatures you control gain trample and get +X/+X until end of turn" (Craterhoof; X comes from "where X is …").
  if ((m = c.match(/^(?:Until end of turn, )?creatures you control gain ([a-z ,]+?) and get ([+-](?:\d+|X))\/([+-](?:\d+|X))(?: until end of turn)?\.?$/i))) {
    for (const keyword of KEYWORD_LIST(m[1])) effects.push({ kind: 'grant-keyword-each', scope: 'you', filter: 'creature', keyword, expires: 'cleanup' });
    effects.push({ kind: 'pump-each', scope: 'you', filter: 'creature', power: m[2], toughness: m[3], expires: 'cleanup' });
    return true;
  }
  if ((m = c.match(/^(?:Until end of turn, )?creatures you control get ([+-](?:\d+|X))\/([+-](?:\d+|X)) and gain ([a-z ,]+?)(?: until end of turn)?\.?$/i))) {
    effects.push({ kind: 'pump-each', scope: 'you', filter: 'creature', power: m[1], toughness: m[2], expires: 'cleanup' });
    for (const keyword of KEYWORD_LIST(m[3])) effects.push({ kind: 'grant-keyword-each', scope: 'you', filter: 'creature', keyword, expires: 'cleanup' });
    return true;
  }
  if ((m = c.match(/^(Permanents|Creatures) your opponents control lose ([a-z ,]+?) until end of turn\.?$/i))) {
    for (const keyword of KEYWORD_LIST(m[2])) effects.push({ kind: 'grant-keyword-each', scope: 'opponents', filter: m[1].toLowerCase().replace(/s$/, ''), keyword, enabled: false, expires: 'cleanup' });
    return true;
  }
  if (/^Double the power and toughness of each creature you control until end of turn\.?$/i.test(c)) {
    effects.push({ kind: 'double-pt-each', scope: 'you', expires: 'cleanup' });
    return true;
  }
  if ((m = c.match(/^(Target creature[^.]*) gets ([+-])1\/([+-])1 until end of turn for each (.+?)\.?$/i))) {
    const filter = filterFromNoun(m[4]);
    if (!filter) return false;
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'set-x', amount: { kind: 'count', zone: 'battlefield', filter } }, { kind: 'pump', bind, power: `${m[2]}X`, toughness: `${m[3]}X`, expires: 'cleanup' });
    return true;
  }
  if ((m = c.match(/^(Target creature[^.]*) gets ([+-]X)\/([+-]X) until end of turn\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'pump', bind, power: m[2], toughness: m[3], expires: 'cleanup' });
    return true;
  }
  // Counters on many.
  if ((m = c.match(/^Put (a|an|one|two|three|\d+) ([+-]\d+\/[+-]\d+|[a-z]+) counters? on each (.+?)\.?$/i)) && !/^of /i.test(m[3])) {
    const filter = filterFromNoun(m[3]);
    if (!filter) return false;
    effects.push({ kind: 'counter-each', scope: scopeOfPhrase(m[3]), filter, counter: m[2], amount: numberFromText(m[1]) });
    return true;
  }
  if ((m = c.match(/^Put (a|an|one|two|three|\d+) ([+-]\d+\/[+-]\d+|[a-z]+) counters? on each of up to (two|three|four|\d+) target (.+?)\.?$/i))) {
    const max = numberFromText(m[3]), bind = `multi${requirements.length}`;
    requirements.push({ kind: 'multi-target', bind, scope: `target ${m[4]}`, min: 0, max, label: `Choose up to ${max} ${m[4]}` });
    effects.push({ kind: 'counter-many', bind, counter: m[2], amount: numberFromText(m[1]) });
    return true;
  }
  if ((m = c.match(/^(Exile|Destroy|Tap|Untap) up to (two|three|four|\d+) target (.+?)\.?$/i))) {
    const max = numberFromText(m[2]), bind = `multi${requirements.length}`;
    requirements.push({ kind: 'multi-target', bind, scope: `target ${m[3]}`, min: 0, max, label: `Choose up to ${max} ${m[3]}` });
    effects.push({ kind: `${m[1].toLowerCase()}-many`, bind });
    return true;
  }
  // Mass removal with a condition, graveyards.
  if ((m = c.match(/^Destroy all (creatures) with power (\d+) or (greater|less)\.?$/i))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: `creature|power${m[3].toLowerCase() === 'greater' ? '>=' : '<='}${m[2]}`, to: 'graveyard', destroy: true });
    return true;
  }
  if ((m = c.match(/^Destroy each (nonland permanent|creature|artifact|permanent) with mana value (\d+) or (less|greater)\.?$/i))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: `${m[1].toLowerCase()}|mv${m[3].toLowerCase() === 'less' ? '<=' : '>='}${m[2]}`, to: 'graveyard', destroy: true });
    return true;
  }
  if ((m = c.match(/^Return all (land|creature|artifact|enchantment|permanent) cards from your graveyard to the battlefield( tapped)?\.?$/i))) {
    effects.push({ kind: 'graveyard-zone-each', scope: 'you', filter: m[1].toLowerCase(), to: 'battlefield', tapped: !!m[2] });
    return true;
  }
  if ((m = c.match(/^Put all (creature|artifact|land|permanent) cards from all graveyards onto the battlefield under your control\.?$/i))) {
    effects.push({ kind: 'graveyard-zone-each', scope: 'all', filter: m[1].toLowerCase(), to: 'battlefield', underYourControl: true });
    return true;
  }
  if ((m = c.match(/^Put (target card) from a graveyard on top of its owner'?s library\.?$/i))) {
    const bind = `grave${requirements.length}`;
    requirements.push({ kind: 'graveyard-target', bind, scope: 'target card', label: 'target card in a graveyard' });
    effects.push({ kind: 'move-zone', bind, to: 'library', position: 'top' });
    return true;
  }
  if ((m = c.match(/^Return (another target|target) (.+? card(?: with [^.]+?)?) from your graveyard to (your hand|the battlefield)( tapped)?\.?$/i))) {
    const bind = `grave${requirements.length}`;
    requirements.push({ kind: 'graveyard-target', bind, scope: `${m[1].toLowerCase()} ${m[2].toLowerCase()} in your graveyard`, label: `${m[1]} ${m[2]} in your graveyard` });
    effects.push({ kind: 'return-from-graveyard', bind, to: /hand/i.test(m[3]) ? 'hand' : 'battlefield', tapped: !!m[4] });
    return true;
  }
  // Damage to a wider set of targets ("target creature or planeswalker an opponent controls", "target attacking or blocking creature").
  if ((m = c.match(rx(`^(?:This spell|${selfAny}|It|[A-Z][^.]*?) deals? (one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X) damage to (target [^.]+?)\\.?$`, 'i')))) {
    const bind = targetRequirement(requirements, m[2].toLowerCase(), m[2]);
    effects.push({ kind: 'damage', amount: numberFromText(m[1]) ?? m[1].toUpperCase(), bind, sourceName });
    return true;
  }
  if ((m = c.match(/^(?:This spell|[^.]+?) deals? X damage to each (creature|creature and each player|player|opponent)\.?$/i))) {
    effects.push({ kind: 'damage-each', amount: 'X', filter: 'creature', creatures: /creature/i.test(m[1]) ? 'all' : null, players: /player/i.test(m[1]) ? 'all' : /opponent/i.test(m[1]) ? 'opponents' : null, sourceName });
    return true;
  }
  // "… deals damage equal to that creature's power to any target" (Terror of the Peaks): the creature that caused the trigger.
  if ((m = c.match(/^(?:This creature|It|[A-Z][^.]*?) deals damage equal to that creature'?s power to (any target|target [^.]+?)\.?$/i))) {
    const bind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'damage', amount: { kind: 'event-card-power' }, bind, sourceName });
    return true;
  }
  // Tokens: "a number of … equal to Krenko's power", "that many Treasure tokens", "a Food token or a Treasure token".
  if ((m = c.match(/^Create a number of (\d+)\/(\d+) ([^.]*?) creature tokens equal to (?:its|this creature'?s|[A-Z][^']*'s) power\.?$/i))) {
    const subtype = (m[3].match(/([A-Z][A-Za-z'-]+)$/) || [])[1] || 'Creature';
    effects.push({ kind: 'create-token', amount: { kind: 'source-power' }, power: Number(m[1]), toughness: Number(m[2]), name: subtype, typeLine: `Token Creature — ${subtype}` });
    return true;
  }
  if ((m = c.match(/^Create that many (Treasure|Food|Clue) tokens\.?$/i))) {
    const name = m[1], text = name === 'Treasure' ? '{T}, Sacrifice this artifact: Add one mana of any color.' : name === 'Clue' ? '{2}, Sacrifice this artifact: Draw a card.' : '{2}, {T}, Sacrifice this artifact: You gain 3 life.';
    effects.push({ kind: 'create-token', amount: { kind: 'binding', bind: 'eventAmount' }, name, typeLine: 'Token Artifact', oracleText: text });
    return true;
  }
  if (/^Create a Food token or a Treasure token\.?$/i.test(c)) {
    const bind = `tokenKind${requirements.length}`;
    requirements.push({ kind: 'choose-text', bind, options: ['Food', 'Treasure'], label: 'Create which token?' });
    effects.push({ kind: 'create-token', chooseBind: bind, amount: 1, name: 'Food', typeLine: 'Token Artifact', oracleText: '{2}, {T}, Sacrifice this artifact: You gain 3 life.',
      alt: { Treasure: { name: 'Treasure', oracleText: '{T}, Sacrifice this artifact: Add one mana of any color.' } } });
    return true;
  }
  // Stack: "Counter target spell with mana value 1." "Counter target spell if it's blue." (Pyroblast: only a blue spell is worth it).
  if ((m = c.match(/^Counter target spell with mana value (\d+)\.?$/i))) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: 'spell', label: `target spell with mana value ${m[1]}`, spellFilter: `mv=${m[1]}` });
    effects.push({ kind: 'counter-spell', bind });
    return true;
  }
  if ((m = c.match(/^Counter target spell if it'?s (white|blue|black|red|green)\.?$/i))) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: 'spell', label: `target ${m[1].toLowerCase()} spell`, spellFilter: m[1].toLowerCase() });
    effects.push({ kind: 'counter-spell', bind });
    return true;
  }
  // Equipment entering: "attach it to target legendary creature you control" (Mithril Coat).
  if ((m = c.match(rx(`^Attach (?:${selfAny}|it) to (target [^.]*creature you control)\\.?$`, 'i')))) {
    const creatureBind = targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'attach', equipmentBind: 'sourceId', creatureBind });
    return true;
  }
  // Rancor: "return it to its owner's hand" from the graveyard.
  if (rx(`^Return (?:it|this card|${selfAny}) to its owner'?s hand\\.?$`, 'i').test(c)) { effects.push({ kind: 'return-self-hand' }); return true; }
  if (/^(?:You )?draws? an additional card\.?$/i.test(c)) { effects.push({ kind: 'draw', scope: 'you', amount: 1 }); return true; }
  if (rx(`^(?:It|${selfAny}) can'?t be blocked this turn\\.?$`, 'i').test(c)) { effects.push({ kind: 'combat-restriction', bind: 'sourceId', restriction: 'cant-be-blocked', expires: 'cleanup' }); return true; }
  if ((m = c.match(/^Create X (Treasure|Food|Clue) tokens\.?$/i))) {
    const name = m[1], text = name === 'Treasure' ? '{T}, Sacrifice this artifact: Add one mana of any color.' : name === 'Clue' ? '{2}, Sacrifice this artifact: Draw a card.' : '{2}, {T}, Sacrifice this artifact: You gain 3 life.';
    effects.push({ kind: 'create-token', amount: 'X', name, typeLine: 'Token Artifact', oracleText: text });
    return true;
  }
  // Turn-long rules changes.
  if (/^Prevent all combat damage that would be dealt this turn\.?$/i.test(c)) { effects.push({ kind: 'prevent-combat', scope: 'all' }); return true; }
  if (/^Prevent all combat damage that would be dealt to you this turn\.?$/i.test(c)) { effects.push({ kind: 'prevent-combat', scope: 'you' }); return true; }
  if (/^Prevent all combat damage that would be dealt to and dealt by (?:it|that creature) this turn\.?$/i.test(c)) { effects.push({ kind: 'prevent-combat', scope: 'card', bind: 'lastTarget' }); return true; }
  if (/^You have no maximum hand size(?: for the rest of the game)?\.?$/i.test(c)) { effects.push({ kind: 'no-max-hand-size' }); return true; }
  if ((m = c.match(/^Your opponents can'?t cast (noncreature )?spells this turn\.?$/i))) { effects.push({ kind: 'cast-lock', scope: 'opponents', noncreature: !!m[1] }); return true; }
  if (/^You may cast spells this turn as though they had flash\.?$/i.test(c)) { effects.push({ kind: 'flash-permission' }); return true; }
  if (/^The next spell you cast this turn can'?t be countered\.?$/i.test(c)) { effects.push({ kind: 'next-uncounterable' }); return true; }
  if (/^Spells you control can'?t be countered this turn\.?$/i.test(c)) { effects.push({ kind: 'uncounterable-turn' }); return true; }
  if (/^Put your commander into your hand from the command zone\.?$/i.test(c)) { effects.push({ kind: 'commander-to-hand' }); return true; }
  // Event creature: "it gains haste until end of turn" in a trigger about another creature (Dragon Tempest).
  if ((m = c.match(/^(?:It|That creature) gains? ([a-z ,]+?) until end of turn\.?$/i))) {
    for (const keyword of KEYWORD_LIST(m[1])) effects.push({ kind: 'grant-keyword', bind: 'eventCard', keyword, enabled: true, expires: 'cleanup' });
    return true;
  }
  return false;
}
function mergeCompiled(parts) {
  const effects = [], requirements = [], unsupported = [];
  for (const p of parts) {
    effects.push(...p.effects);
    requirements.push(...p.requirements);
    unsupported.push(...p.unsupported);
  }
  return { effects, requirements, unsupported };
}
function compileThenClause(clause, opts) {
  const pieces = clause.split(/\bthen\b/i).map(x => normalizeClause(x.replace(/^,\s*/, '').replace(/,\s*$/, ''))).filter(Boolean);
  if (pieces.length < 2)
    return null;
  const compiled = pieces.map(p => compileSingleClause(p, opts));
  // Special pronoun bridge: "Target creature you control deals ... Then sacrifice it."
  if (compiled[0]?.effects?.some(e => e.kind === 'damage-from-selected-creature') && /^sacrifice it\.?$/i.test(pieces[1])) {
    const src = compiled[0].effects.find(e => e.kind === 'damage-from-selected-creature');
    compiled[0].effects.push({ kind: 'sacrifice', bind: src.sourceBind });
    compiled.splice(1, 1);
  }
  return mergeCompiled(compiled);
}
function compileAndClause(clause, opts) {
  const text = clause.replace(/\.$/, '');
  let at = text.indexOf(' and ');
  while (at > 0) {
    const left = text.slice(0, at).trim(), right = text.slice(at + 5).trim();
    const variants = [right, `You ${right}`, right.replace(/^you /i, '')].map(r => r.charAt(0).toUpperCase() + r.slice(1));
    const a = compileSingleClause(`${left}.`, opts);
    if (!a.unsupported.length && a.effects.length) {
      for (const v of variants) {
        const b = compileSingleClause(`${v}.`, opts);
        if (!b.unsupported.length && b.effects.length) {
          // Keep requirement binds unique across the two halves.
          const offset = a.requirements.length;
          if (offset && b.requirements.length) {
            const again = { effects: [], requirements: [...a.requirements], unsupported: [] };
            const json = JSON.stringify(b);
            const renamed = JSON.parse(json.replace(/"(target|grave|player|discardCards|cards|number|color)(\d+)"/g, (_, k, n) => `"${k}${Number(n) + offset + 10}"`));
            again.effects.push(...a.effects, ...renamed.effects);
            again.requirements.push(...renamed.requirements);
            return again;
          }
          return mergeCompiled([a, b]);
        }
      }
    }
    at = text.indexOf(' and ', at + 5);
  }
  return null;
}
// "It gains hexproof until end of turn." "Untap it." "Exile that creature." — the same instruction, about the
// card an earlier sentence targeted (Snakeskin Veil, Dispatch). Returns a compiled part, or null.
function bridgePronoun(clause, parts, sourceName) {
  if (/\b(?:this|target)\b/i.test(clause)) return null;
  const pronoun = /^(?:It|That (?:creature|permanent|card)) /i.test(clause) ? clause.replace(/^(?:It|That (?:creature|permanent|card)) /i, 'Target creature ')
    : /\b(?:it|that creature|that permanent)\.?$/i.test(clause) && !/^(?:Sacrifice|Return) it\.?$/i.test(clause) ? clause.replace(/\b(?:it|that creature|that permanent)(\.?)$/i, 'target creature$1') : null;
  const earlier = pronoun && [...parts].reverse().flatMap(p => [...(p.requirements || [])].reverse()).find(r => r.kind === 'target' || r.kind === 'choose-permanent');
  if (!earlier) return null;
  const c = compileSingleClause(pronoun, { sourceName });
  const own = c.requirements.filter(r => r.kind === 'target');
  if (c.unsupported.length || !c.effects.length || own.length !== 1 || c.requirements.length !== 1) return null;
  const rebind = e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v === own[0].bind ? earlier.bind : v]));
  const optional = parts.some(p => p.effects.some(e => e.optionalTarget && e.bind === earlier.bind)) || earlier.optional;
  return { effects: c.effects.map(e => ({ ...rebind(e), ...(optional ? { optionalTarget: true } : {}) })), requirements: [], unsupported: [] };
}
// Compiling is pure (the same text and name always give the same result), and the screen asks again and again, so
// results are kept; each caller gets its own copy because some callers adjust the effects they receive.
const COMPILE_CACHE = new Map();
export function compileEffectText(text, opts = {}) {
  const key = `${opts.sourceName || 'Effect'}\u0000${opts.allowGuidedFallback ? 1 : 0}\u0000${text}`;
  let hit = COMPILE_CACHE.get(key);
  if (!hit) {
    hit = compileEffectTextUncached(text, opts);
    if (COMPILE_CACHE.size > 20000) COMPILE_CACHE.clear();
    COMPILE_CACHE.set(key, hit);
  }
  return structuredClone(hit);
}
function compileEffectTextUncached(text, { sourceName = 'Effect', allowGuidedFallback = false } = {}) {
  const raw = cleanOracle(text);
  const clauses = splitSentences(raw);
  const parts = [];
  let skipNextClause = false;
  // "… at the beginning of the next turn's upkeep" / "At the beginning of your next main phase, …": the clause is
  // compiled as usual, then its effects are wrapped in a delayed trigger (marks are closed when the next clause starts).
  const delays = [];
  const closeDelay = () => { const d = delays[delays.length - 1]; if (d && d.to === undefined) d.to = parts.length; };
  let skipMore = 0, clauseIndex = -1;
  for (let clause of clauses) {
    clauseIndex++;
    closeDelay();
    if (skipNextClause) { skipNextClause = false; continue; }
    if (skipMore > 0) { skipMore--; continue; }
    // Several sentences that are one instruction ("Look at the top four cards … Put the rest …").
    const seq = compileCatalogSequence(clauses, clauseIndex, { sourceName, parts });
    if (seq) { parts.push(seq.part); skipMore = seq.consumed - 1; continue; }
    let dm = clause.match(/^(.+?),? at the beginning of the next turn'?s upkeep\.?$/i);
    if (dm) { delays.push({ from: parts.length, when: { event: 'upkeep', whose: 'any' } }); clause = `${dm[1]}.`; }
    else if ((dm = clause.match(/^At the beginning of (your|the) next (upkeep|main phase|precombat main phase|end step),\s*(.+)$/i))) {
      delays.push({ from: parts.length, when: { event: /upkeep/i.test(dm[2]) ? 'upkeep' : /end step/i.test(dm[2]) ? 'end-step' : 'precombat-main-start', whose: /your/i.test(dm[1]) ? 'owner' : 'any' } });
      clause = dm[3].charAt(0).toUpperCase() + dm[3].slice(1);
    }
    // "…, where X is the number of creatures you control." — X is counted as it resolves.
    const whereX = clause.match(/^(.+?),? where X is (the number of .+?|the greatest power among .+?|your devotion to (?:white|blue|black|red|green)|.+?'?s power)\.?$/i);
    if (whereX) {
      const expr = whereXExpr(whereX[2]);
      const inner = expr != null ? compileEffectText(`${whereX[1]}.`, { sourceName }) : null;
      if (inner && inner.supported) {
        parts.push({ effects: [{ kind: 'set-x', amount: expr }, ...inner.effects], requirements: inner.requirements.filter(r => !(r.kind === 'number' && r.bind === 'X')), unsupported: [] });
        continue;
      }
    }
    // "If you control six or more lands, create a token that's a copy of this creature instead." (Scute Swarm) /
    // "Add {B}{B}{B}{B}{B} instead if there are seven or more cards in your graveyard." (Cabal Ritual): the earlier
    // instruction happens only when the condition fails, this one only when it holds.
    const insteadM = clause.match(/^(?:[A-Z][a-z]+ — )?If (.+?), (.+?) instead\.?$/i) || (m0 => m0 && [m0[0], m0[2], m0[1]])(clause.match(/^(?:[A-Z][a-z]+ — )?(.+?) instead if (.+?)\.?$/i));
    const insteadCond = insteadM && !/^(?:that creature|it|they|that permanent) /i.test(insteadM[2]) && parseCondition(insteadM[1]);
    const prevPart = parts[parts.length - 1];
    if (insteadCond && prevPart && !prevPart.unsupported.length && prevPart.effects.length) {
      const alt = compileEffectText(insteadM[2].charAt(0).toUpperCase() + insteadM[2].slice(1), { sourceName });
      if (alt.supported) {
        prevPart.effects.unshift({ kind: 'condition', ...insteadCond, negate: true, skip: prevPart.effects.length });
        parts.push({ effects: [{ kind: 'condition', ...insteadCond, skip: alt.effects.length, failNote: ' ' }, ...alt.effects], requirements: alt.requirements, unsupported: [] });
        continue;
      }
    }
    // "Draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it." (Tribute to the World Tree)
    const trailingIf = clause.match(/^(.+?) if (.+?)\.?$/i);
    const trailingCond = trailingIf && !/\bwould\b/i.test(clause) && parseCondition(trailingIf[2]);
    if (trailingCond) {
      const body = compileEffectText(`${trailingIf[1].charAt(0).toUpperCase()}${trailingIf[1].slice(1)}.`, { sourceName });
      if (body.supported) { parts.push({ effects: [{ kind: 'condition', ...trailingCond, skip: body.effects.length }, ...body.effects], requirements: body.requirements, unsupported: [], cond: trailingCond }); continue; }
    }
    const otherwise = clause.match(/^Otherwise,? (.+)$/i);
    const condBefore = otherwise && [...parts].reverse().find(p => p.cond)?.cond;
    if (condBefore) {
      const body = compileEffectText(otherwise[1].charAt(0).toUpperCase() + otherwise[1].slice(1), { sourceName });
      if (body.supported) { parts.push({ effects: [{ kind: 'condition', ...condBefore, negate: true, skip: body.effects.length }, ...body.effects], requirements: body.requirements, unsupported: [] }); continue; }
    }
    // "Those creatures gain indestructible until end of turn." (Inspiring Call, Elspeth): the creatures the sentence before counted or changed.
    const those = clause.match(/^Those creatures gain ([a-z ,]+?) until (end of turn|your next turn)\.?$/i);
    const before = those && [...parts].reverse().flatMap(p => [...p.effects].reverse()).find(e => e.kind === 'counter-each' || e.kind === 'pump-each' || (e.kind === 'draw' && e.amount?.kind === 'count'));
    if (before) {
      const filter = before.filter || before.amount?.filter || 'creature';
      parts.push({ effects: KEYWORD_LIST(those[1]).map(keyword => ({ kind: 'grant-keyword-each', scope: before.scope === 'opponents' ? 'opponents' : 'you', filter, keyword, expires: /next turn/i.test(those[2]) ? 'your-next-turn' : 'cleanup' })), requirements: [], unsupported: [] });
      continue;
    }
    // "Create two 1/1 … tokens. They gain haste until end of turn." / "That token gains haste until end of turn."
    const tokenKw = clause.match(/^(?:They|That token|Those tokens|It) gains? ([a-z ,]+?) until end of turn\.?$/i);
    const lastToken = tokenKw && parts[parts.length - 1]?.effects?.slice(-1)[0];
    if (lastToken?.kind === 'create-token') {
      lastToken.tempKeywords = [...(lastToken.tempKeywords || []), ...KEYWORD_LIST(tokenKw[1])];
      continue;
    }
    // "Create a 0/1 Eldrazi Spawn token. It has "Sacrifice this token: Add {C}."" — the token gets that ability.
    const quoted = clause.match(/^(?:It|They|That token|Those tokens|The token|The tokens) (?:has|have) "(.+)"\.?$/i);
    const madeToken = quoted && [...parts].reverse().flatMap(p => [...(p.effects || [])].reverse()).find(e => e.kind === 'create-token');
    if (madeToken) { madeToken.oracleText = [madeToken.oracleText, quoted[1].replace(/"$/, '')].filter(Boolean).join('\n'); continue; }
    // Tragic Slip: "Morbid — That creature gets -13/-13 until end of turn instead if a creature died this turn."
    const instead = clause.match(/^(?:[A-Z][a-z]+ — )?That creature gets ([+-]\d+)\/([+-]\d+) until end of turn instead if a creature died this turn\.?$/i);
    const prevPump = instead && parts[parts.length - 1]?.effects?.find(e => e.kind === 'pump');
    if (prevPump) {
      parts.push({ effects: [{ kind: 'condition', test: 'creature-died', skip: 1 }, { kind: 'pump', bind: prevPump.bind, power: Number(instead[1]) - Number(prevPump.power || 0), toughness: Number(instead[2]) - Number(prevPump.toughness || 0), expires: 'cleanup' }], requirements: [], unsupported: [] });
      continue;
    }
    // Archon of Cruelty: "target opponent sacrifices a creature …, discards a card, and loses 3 life." — one subject, several instructions.
    const list = clause.match(/^(Target opponent|Target player|Each opponent|Each player) ([a-z]+s .+?), ([a-z]+s .+?),? and ([a-z]+s .+)$/i);
    if (list) {
      const pieces = [list[2], list[3], list[4]].map(x => compileSingleClause(`${list[1]} ${x.replace(/\.$/, '')}.`, { sourceName }));
      if (pieces.every(x => !x.unsupported.length && x.effects.length)) {
        const out = { effects: [], requirements: [], unsupported: [] };
        let shared = null;
        pieces.forEach((x, i) => {
          const json = JSON.stringify(x).replace(/"(target|grave|player|discardCards|cards|number|color)(\d+)"/g, (_, k, n) => `"${k}${Number(n) + 20 * (i + 1)}"`);
          const y = JSON.parse(json);
          const preq = y.requirements.find(r => r.kind === 'player');
          if (preq && !shared) shared = preq.bind;
          const swap = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, preq && v === preq.bind ? shared : v]));
          out.effects.push(...y.effects.map(swap));
          out.requirements.push(...y.requirements.filter(r => !(preq && r === preq && preq.bind !== shared)).map(swap));
        });
        parts.push(out);
        continue;
      }
    }
    // "Each player draws a card, then discards a card." — the second instruction keeps the first one's subject.
    const carried = clause.match(/^(Each player|Each opponent|You|Target player|Target opponent) (draws?|discards?|mills?) ([^,]+?),? then (draws?|discards?|mills?|loses?|gains?) (.+)$/i);
    if (carried) {
      const a = compileSingleClause(`${carried[1]} ${carried[2]} ${carried[3]}.`, { sourceName }), b0 = compileSingleClause(`${carried[1]} ${carried[4]} ${carried[5]}`, { sourceName });
      // "Target player draws three cards, then discards three cards": the same player both times.
      const pa = a.requirements.find(r => r.kind === 'player'), pb = b0.requirements.find(r => r.kind === 'player');
      let b = b0;
      if (pa && pb) {
        let json = JSON.stringify(b0).split(`"${pb.bind}"`).join(`"${pa.bind}"`);
        for (const r of b0.requirements) if (r !== pb) json = json.split(`"${r.bind}"`).join(`"${r.bind}_b"`);
        b = JSON.parse(json); b.requirements = b.requirements.filter(r => !(r.kind === 'player' && r.bind === pa.bind));
      }
      if (!a.unsupported.length && !b.unsupported.length && a.effects.length && b.effects.length) { parts.push(mergeCompiled([a, b])); continue; }
    }
    // "that much": the amount from the event that triggered this (life gained, damage dealt).
    if (/\bthat much\b/i.test(clause) && !/\bX\b/.test(clause)) {
      const c = compileSingleClause(clause.replace(/\bthat much\b/gi, 'X'), { sourceName });
      if (!c.unsupported.length && c.effects.length) {
        parts.push({ ...c, effects: c.effects.map(e => (String(e.amount).toUpperCase() === 'X' ? { ...e, amount: { kind: 'binding', bind: 'eventAmount' } } : e)), requirements: c.requirements.filter(r => !(r.kind === 'number' && r.bind === 'X')) });
        continue;
      }
    }
    // "You may pay {4}. If you do, untap this artifact." (Mana Vault, Mentor of the Meek): the controller is asked to pay
    // as it resolves (ops.js); "You may sacrifice another creature. If you do, …": a yes/no choice, then both or neither.
    const nextDo = clauses[clauses.indexOf(clause) + 1]?.match(/^If you do,?\s*(.+)$/i);
    const selfPay = nextDo && clause.match(/^(?:Then )?you may pay ((?:\{[^}]+\})+)(?: and (\d+|one|two|three|four) life)?\.?$/i);
    if (selfPay) {
      const inner = compileEffectText(nextDo[1], { sourceName });
      if (inner.supported) {
        parts.push({ effects: [{ kind: 'may-pay', cost: selfPay[1], lifeCost: numberFromText(selfPay[2] || '0') || 0, skip: inner.effects.length }, ...inner.effects], requirements: inner.requirements, unsupported: [] });
        skipNextClause = true;
        continue;
      }
    }
    const mayDo = nextDo && !selfPay && clause.match(/^(?:Then )?you may (.+)$/i);
    if (mayDo) {
      const first = compileEffectText(mayDo[1].charAt(0).toUpperCase() + mayDo[1].slice(1), { sourceName });
      const then = compileEffectText(nextDo[1], { sourceName });
      if (first.supported && then.supported) {
        const bind = `mayDo${parts.length}`;
        const req = [{ kind: 'yes-no', bind, label: `${mayDo[1].replace(/\.$/, '')}?` }];
        parts.push({ effects: [{ kind: 'condition', test: 'chosen', bind, skip: first.effects.length + then.effects.length }, ...first.effects, ...then.effects], requirements: [...req, ...first.requirements, ...then.requirements], unsupported: [] });
        skipNextClause = true;
        continue;
      }
    }
    // Batch 4: a mandatory instruction followed by “If you do” is a dependent
    // resolution chain. The first instruction either completes or throws, so
    // reaching the dependent clause proves its condition. Optional/unsupported
    // predecessors remain Guided instead of being guessed.
    const dependent = clause.match(/^If you do,?\s*(.+)$/i);
    if (dependent) {
      const previous = parts[parts.length - 1];
      const previousIsSafe = !!previous && previous.unsupported.length === 0 && previous.effects.length > 0 && !previous.effects.some(e => e.optional);
      if (!previousIsSafe) {
        parts.push({ effects: [], requirements: [], unsupported: [clause] });
        continue;
      }
      parts.push(compileSingleClause(dependent[1], { sourceName }));
      continue;
    }
    // "Its controller may search their library for a basic land card, put it onto the battlefield tapped, then
    // shuffle." (Path to Exile, Assassin's Trophy): the game asks that player as the spell resolves (ops.js).
    // Conditions: "If you control a creature with power 4 or greater, draw a card." "Metalcraft — If you control three
    // or more artifacts, …" "if this artifact is tapped, it deals 1 damage to you." Checked as it resolves.
    const cond = clause.match(/^(?:[A-Z][a-z]+ — )?If (you control (a|an|no|one or more|two or more|three or more|four or more|five or more|six or more|seven or more|eight or more|nine or more|ten or more|thirteen or more|twenty or more) (.+?)|this (?:artifact|creature|permanent|land) is (?:un)?tapped|it'?s not your turn|it'?s your turn|you control your commander|a creature died this turn),\s*(.+)$/i);
    const genericIf = !/^If you do\b/i.test(clause) && clause.match(/^(?:[A-Z][a-z]+ — )?if (.+?), (.+)$/i);
    const genericCond0 = genericIf && !/\bwould\b|\binstead\b/i.test(clause) && parseCondition(genericIf[1]);
    const genericCond = genericCond0 && (!cond || genericCond0.test !== 'control') ? genericCond0 : null;
    if (genericCond) {
      const body = compileEffectText(genericIf[2].charAt(0).toUpperCase() + genericIf[2].slice(1), { sourceName });
      if (body.supported) { parts.push({ effects: [{ kind: 'condition', ...genericCond, skip: body.effects.length }, ...body.effects], requirements: body.requirements, unsupported: [], cond: genericCond }); continue; }
    }
    if (cond && !/^If you do\b/i.test(clause)) {
      const inner = compileSingleClause(cond[4].replace(/^it deals/i, 'This deals'), { sourceName });
      const innerAlt = !inner.unsupported.length ? inner : bridgePronoun(`${cond[4].charAt(0).toUpperCase()}${cond[4].slice(1)}`, parts, sourceName) || compileEffectText(cond[4], { sourceName });
      const counts = { a: 1, an: 1, no: 0, 'one or more': 1, 'two or more': 2, 'three or more': 3, 'four or more': 4, 'five or more': 5, 'six or more': 6, 'seven or more': 7, 'eight or more': 8, 'nine or more': 9, 'ten or more': 10, 'twenty or more': 20, 'thirteen or more': 13 };
      const test = cond[2] ? { test: 'control', subject: `a ${cond[3]}`.replace(/^a (an?) /i, 'a '), min: counts[cond[2].toLowerCase()], ...(/^no$/i.test(cond[2]) ? { none: true } : {}) } : /untapped/i.test(cond[1]) ? { test: 'source-untapped' } : /tapped/i.test(cond[1]) ? { test: 'source-tapped' } : /commander/i.test(cond[1]) ? { test: 'control-commander' } : /died/i.test(cond[1]) ? { test: 'creature-died' } : /not your turn/i.test(cond[1]) ? { test: 'not-your-turn' } : { test: 'your-turn' };
      if (test.test !== 'control' || parseSubject(test.subject.replace(/^a /, ''), null)) {
        if (test.test === 'control') test.subject = test.subject.replace(/^a /, '').replace(/(?<!plain)s$/i, '');
        if (!innerAlt.unsupported.length && innerAlt.effects.length) {
          parts.push({ effects: [{ kind: 'condition', ...test, skip: innerAlt.effects.length }, ...innerAlt.effects], requirements: innerAlt.requirements, unsupported: [] });
          continue;
        }
      }
    }
    // Force of Negation: "If that spell is countered this way, exile it instead of putting it into its owner's graveyard."
    if (/^If that spell is countered this way, exile it instead of putting it into its owner'?s graveyard\.?$/i.test(clause)) {
      const cs = [...parts].reverse().flatMap(p => p.effects).find(e => e.kind === 'counter-spell');
      if (cs) { cs.exile = true; continue; }
    }
    // Growth Spiral: "You may put a land card from your hand onto the battlefield." (the card just drawn counts too)
    if (/^You may put a land card from your hand onto the battlefield\.?$/i.test(clause)) {
      const drawn = parts.flatMap(p => p.effects).filter(e => e.kind === 'draw' && typeof e.amount === 'number' && (e.scope || 'you') === 'you').reduce((n, e) => n + e.amount, 0);
      const bind = `handLand${parts.length}`;
      parts.push({ effects: [{ kind: 'hand-to-battlefield', bind, optionalTarget: true }], requirements: [{ kind: 'hand-card', bind, filter: 'land', plusDraw: drawn, label: 'a land card to put onto the battlefield' }], unsupported: [] });
      continue;
    }
    // Brainstorm: "Draw three cards, then put two cards from your hand on top of your library in any order."
    const storm = clause.match(/^Draw (two|three|four|\d+) cards?,? then put (one|two|three|a|\d+) cards? from your hand on top of your library in any order\.?$/i);
    if (storm) {
      const bind = `brainstorm${parts.length}`, draw = numberFromText(storm[1]), put = numberFromText(storm[2]) ?? 1;
      parts.push({ effects: [{ kind: 'draw', scope: 'you', amount: draw }, { kind: 'hand-to-top', bind }], requirements: [{ kind: 'brainstorm', bind, draw, put, label: `put ${put} back` }], unsupported: [] });
      continue;
    }
    // Ponder, Sensei's Divining Top: "Look at the top three cards of your library, then put them back in any order."
    const look = clause.match(/^Look at the top (two|three|four|five|\d+) cards of your library,? then put them back in any order\.?$/i);
    if (look) {
      const bind = `reorder${parts.length}`, amount = numberFromText(look[1]);
      parts.push({ effects: [{ kind: 'scry', scope: 'you', amount, bind }], requirements: [{ kind: 'scry', bind, amount, reorderOnly: true, label: `top ${look[1]} cards` }], unsupported: [] });
      continue;
    }
    if (/^You may shuffle(?: your library)?\.?$/i.test(clause)) {
      const bind = `mayShuffle${parts.length}`;
      parts.push({ effects: [{ kind: 'shuffle', optional: true, optionalBind: bind, label: 'Shuffle' }], requirements: [{ kind: 'yes-no', bind, label: 'Shuffle your library?' }], unsupported: [] });
      continue;
    }
    // Sensei's Divining Top: "Draw a card, then put this artifact on top of its owner's library."
    if (/^Draw a card,? then put (?:this artifact|~|it) on top of its owner'?s library\.?$/i.test(clause)) {
      parts.push({ effects: [{ kind: 'draw', scope: 'you', amount: 1 }, { kind: 'source-to-library-top' }], requirements: [], unsupported: [] });
      continue;
    }
    // Wheels: "Each player discards their hand, then draws seven cards." / "… draws cards equal to the greatest number …"
    const wheel = clause.match(/^Each player discards their hand,? then draws (seven|\d+) cards\.?$/i) || clause.match(/^Each player discards their hand,? then draws cards equal to the greatest number of cards a player discarded this way\.?$/i);
    if (wheel) { parts.push({ effects: [{ kind: 'wheel', amount: wheel[1] ? numberFromText(wheel[1]) : 'greatest' }], requirements: [], unsupported: [] }); continue; }
    // Flicker: "Exile target creature you control, then return it to the battlefield under its owner's control."
    const flick = clause.match(/^Exile (another target|target|up to one target|up to one other target) (.+?),? then return (?:it|that card) to the battlefield under (its owner'?s|your) control\.?$/i);
    if (flick) {
      const bind = `target${parts.reduce((n, p) => n + (p.requirements || []).length, 0) + 50}`;
      parts.push({ effects: [{ kind: 'flicker', bind, yours: /your/i.test(flick[3]), optionalTarget: /up to/i.test(flick[1]) }], requirements: [{ kind: 'target', bind, scope: `target ${flick[2].toLowerCase()}`, label: `${flick[1]} ${flick[2]}`.toLowerCase(), optional: /up to/i.test(flick[1]), notSource: /another|other/i.test(flick[1]) }], unsupported: [] });
      continue;
    }
    // Chaos Warp
    const warp = clause.match(/^The owner of (target permanent) shuffles it into their library,? then reveals the top card of their library\.?$/i);
    if (warp && /^If it'?s a permanent card, they put it onto the battlefield\.?$/i.test(clauses[clauses.indexOf(clause) + 1] || '')) {
      parts.push({ effects: [{ kind: 'chaos-warp', bind: 'target70' }], requirements: [{ kind: 'target', bind: 'target70', scope: 'target permanent', label: 'target permanent' }], unsupported: [] });
      skipNextClause = true;
      continue;
    }
    // "up to one target …": the same instruction, and choosing nothing is allowed.
    if (/\bup to one target\b/i.test(clause) && !/counters? on up to one/i.test(clause)) {
      const c = compileSingleClause(clause.replace(/\bup to one target\b/i, 'target'), { sourceName });
      if (!c.unsupported.length && c.effects.length) {
        const binds = new Set(c.requirements.filter(r => r.kind === 'target').map(r => r.bind));
        parts.push({ effects: c.effects.map(e => (binds.has(e.bind) ? { ...e, optionalTarget: true } : e)), requirements: c.requirements.map(r => (binds.has(r.bind) ? { ...r, optional: true } : r)), unsupported: [] });
        continue;
      }
    }
    // "draw a card unless that player pays {1}" (Rhystic Study), "… pays {X}, where X is this creature's power" (Esper Sentinel)
    const unless = clause.match(/^(.+?),? unless (?:that player|its controller|they) pays? \{(\d+|X)\}(?:, where X is (?:this creature'?s|~'?s|its) power)?\.?$/i);
    if (unless) {
      const inner = compileSingleClause(unless[1].replace(/^you may /i, ''), { sourceName });
      if (!inner.unsupported.length && inner.effects.length) {
        parts.push({ effects: [{ kind: 'unless-pays', cost: unless[2] === 'X' ? 'X' : `{${unless[2]}}`, xFromPower: unless[2] === 'X', payerBind: 'eventPlayer', skip: inner.effects.length }, ...inner.effects], requirements: inner.requirements, unsupported: [] });
        continue;
      }
    }
    // "that player may pay {2}. If the player doesn't, you create a Treasure token." (Smothering Tithe)
    const mayPay = clause.match(/^(?:that player|they) may pay \{(\d+)\}\.?$/i);
    const ifNot = clauses[clauses.indexOf(clause) + 1]?.match(/^If (?:the player|they|that player) (?:doesn'?t|don'?t|does not|do not),?\s*(.+)$/i);
    if (mayPay && ifNot) {
      const inner = compileSingleClause(ifNot[1].replace(/^you (create|draw|gain|put|return|scry|surveil)\b/i, (_, v) => v.charAt(0).toUpperCase() + v.slice(1)), { sourceName });
      if (!inner.unsupported.length && inner.effects.length) {
        parts.push({ effects: [{ kind: 'unless-pays', cost: `{${mayPay[1]}}`, payerBind: 'eventPlayer', skip: inner.effects.length }, ...inner.effects], requirements: inner.requirements, unsupported: [] });
        skipNextClause = true;
        continue;
      }
    }
    const search = clause.match(/^(?:Its|That (?:creature|permanent)'s) controller may search their library for (?:a|up to one) basic land card,? (?:and )?put (?:it|that card) onto the battlefield( tapped)?,? then shuffle\.?$/i);
    const searchTarget = search && [...parts].reverse().flatMap(p => p.requirements || []).find(r => r.kind === 'target');
    if (search && searchTarget) {
      parts.push({ effects: [{ kind: 'their-search', bind: searchTarget.bind, filter: 'basic land', tapped: !!search[1], optional: true }], requirements: [], unsupported: [] });
      continue;
    }
    if (/\bthen\b/i.test(clause)) {
      const t = compileThenClause(clause, { sourceName });
      if (t) {
        parts.push(t);
        continue;
      }
    }
    // "Its controller creates a 3/3 green Beast creature token." (Beast Within, Swan Song, Pongify): the same
    // instruction, done for whoever controlled the earlier target.
    const theirs = clause.match(/^(?:Its|That (?:creature|permanent|spell|card)'s) controller (?:may )?(creates|draws|draw|gains|loses|mills|discards|scries|surveils) (.+)$/i)
      || clause.match(/^(?:That player|Its owner|They) (creates|draws|gains|loses|lose|mills|discards) (.+)$/i);
    const earlier = [...parts].reverse().flatMap(p => p.requirements || []).find(r => r.kind === 'target' || r.kind === 'stack-target');
    // "that player sacrifices a creature of their choice" (Sheoldred, Whispering One): they choose, on their device.
    const theirSac = clause.match(/^That player sacrifices (.+)$/i);
    if (theirSac && !earlier) {
      const c = compileSingleClause(`Target player sacrifices ${theirSac[1]}`, { sourceName });
      const preq = c.requirements.find(r => r.kind === 'player');
      if (!c.unsupported.length && c.effects.length && preq) {
        const swap = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === preq.bind ? 'eventPlayer' : v]));
        parts.push({ effects: c.effects.map(swap), requirements: c.requirements.filter(r => r !== preq).map(swap), unsupported: [] });
        continue;
      }
    }
    if (theirs && !earlier && /^(?:That player|They)\b/i.test(clause)) {
      // In a trigger: "that player" is whoever caused it (Massacre Wurm: "that player loses 2 life").
      const verb = theirs[1].toLowerCase().replace(/s$/, '').replace(/^los$/, 'lose');
      const asYou = compileSingleClause(`You ${verb} ${theirs[2]}`, { sourceName });
      if (!asYou.unsupported.length && asYou.effects.length) {
        parts.push({ effects: asYou.effects.map(e => ({ ...e, forPlayerBind: 'eventPlayer' })), requirements: asYou.requirements, unsupported: [] });
        continue;
      }
    }
    if (theirs && earlier) {
      const verb = theirs[1].toLowerCase().replace(/s$/, '').replace(/^los$/, 'lose');
      const inner = compileSingleClause(`${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${theirs[2]}`, { sourceName });
      const asYou = inner.unsupported.length ? compileSingleClause(`You ${verb} ${theirs[2]}`, { sourceName }) : inner;
      if (!asYou.unsupported.length && asYou.effects.length) {
        const as = `controllerOf${earlier.bind}`;
        parts.forEach(p => { if (p.requirements?.includes(earlier)) p.effects.unshift({ kind: 'remember-controller', bind: earlier.bind, as }); });
        parts.push({ effects: asYou.effects.map(e => ({ ...e, forPlayerBind: as })), requirements: asYou.requirements, unsupported: [] });
        continue;
      }
    }
    const bridged = bridgePronoun(clause, parts, sourceName);
    if (bridged) { parts.push(bridged); continue; }
    const single = compileSingleClause(clause, { sourceName });
    if (single.unsupported.length && / and /i.test(clause)) {
      // "You gain 1 life and draw a card." — try the two halves as separate instructions.
      const joined = compileAndClause(clause, { sourceName });
      if (joined) {
        parts.push(joined);
        continue;
      }
    }
    parts.push(single);
  }
  closeDelay();
  for (const d of delays.reverse()) {
    const inner = mergeCompiled(parts.slice(d.from, d.to));
    if (inner.unsupported.length || !inner.effects.length) continue;
    parts.splice(d.from, d.to - d.from, { effects: [{ kind: 'delay', when: d.when, effects: inner.effects, requirements: inner.requirements }], requirements: [], unsupported: [] });
  }
  const merged = mergeCompiled(parts);
  // "Untap those creatures." after "Creatures you control get +1/+1 …" (Jeskai Ascendancy): untap that same group.
  for (const x of merged.effects.filter(e => e.kind === 'untap-those')) {
    const before = merged.effects.slice(0, merged.effects.indexOf(x)).reverse().find(e => ['pump-each', 'counter-each', 'grant-keyword-each'].includes(e.kind));
    if (before) Object.assign(x, { kind: 'untap-each', scope: before.scope || 'you', filter: before.filter || 'creature' });
  }
  // "You may choose new targets for the copy.": the copy asks its controller as it resolves.
  for (const x of [...merged.effects].filter(e => e.kind === 'retarget-flag')) {
    const at = merged.effects.indexOf(x);
    for (const e of merged.effects.slice(0, at)) if (e.kind === 'copy-stack') e.retarget = true;
    merged.effects.splice(at, 1);
  }
  // "If that creature would die this turn, exile it instead": it must be in place before the damage is dealt.
  for (const x of [...merged.effects].filter(e => e.kind === 'exile-if-dies')) {
    const at = merged.effects.indexOf(x);
    const dmg = merged.effects.slice(0, at).filter(e => ['damage', 'damage-each', 'fight', 'damage-from-selected-creature', 'pump'].includes(e.kind));
    if (x.bind === '__damaged' || (dmg.length && x.bind === 'lastTarget')) { for (const e of dmg) e.exileIfDies = true; merged.effects.splice(at, 1); }
  }
  // "Sacrifice it", "… dealt to and dealt by that creature": the last thing targeted.
  const lastTarget = [...merged.requirements].reverse().find(r => r.kind === 'target');
  if (lastTarget) for (const e of merged.effects) if (e.bind === 'lastTarget') e.bind = lastTarget.bind;
  // "Draw two cards, then discard a card": the discard is chosen as the spell resolves, before the draw is
  // carried out, so the choice also shows the cards about to be drawn (the top of the library).
  const drawn = {};
  let xFrom = null;
  for (const e of merged.effects) {
    if (e.kind === 'set-x' && e.amount?.kind === 'binding') xFrom = e.amount.bind;
    // "Draw cards equal to the sacrificed creature's power, then discard three cards": the count is known before resolving.
    if (e.kind === 'draw' && e.amount === 'X' && xFrom && !e.bind) {
      const after = merged.effects.slice(merged.effects.indexOf(e) + 1).find(x => x.kind === 'discard' && x.cardsBind);
      const req = after && merged.requirements.find(r => r.bind === after.cardsBind);
      if (req) req.plusDrawBind = xFrom;
    }
    if (e.kind === 'draw' && typeof e.amount === 'number') { const k = e.bind ? `bind:${e.bind}` : (e.scope || 'you'); drawn[k] = (drawn[k] || 0) + e.amount; }
    const dk = e.bind ? `bind:${e.bind}` : (e.scope || 'you');
    if (e.kind === 'discard' && e.cardsBind && drawn[dk]) {
      const req = merged.requirements.find(r => r.bind === e.cardsBind);
      if (req) req.plusDraw = drawn[dk];
    }
  }
  // X must be chosen unless a caller already binds it from an X cost.
  if (merged.effects.some(e => JSON.stringify(e).includes('"X"')) && !merged.effects.some(e => e.kind === 'set-x') && !merged.requirements.some(r => r.kind === 'number' && r.bind === 'X'))
    merged.requirements.unshift({ kind: 'number', bind: 'X', label: 'Choose X', min: 0, max: 99 });
  if (allowGuidedFallback && merged.unsupported.length) {
    for (const u of merged.unsupported)
      merged.effects.push({ kind: 'manual', text: u });
  }
  return { supported: merged.unsupported.length === 0 && merged.effects.length > 0, effects: merged.effects, requirements: merged.requirements, unsupported: merged.unsupported, raw, guidedFallbackAvailable: merged.unsupported.length > 0 };
}
export function supportForEffectText(text) { const c = compileEffectText(text); return { supported: c.supported, unsupported: c.unsupported, effectKinds: [...new Set(c.effects.map(e => e.kind))], requirements: c.requirements, guidedFallbackAvailable: c.guidedFallbackAvailable }; }

// Helpers for effects-catalog.js (read when its functions run, never at load time).
export const catalogHelpers = { compileSingleClause, KEYWORD_LIST, filterFromNoun, countExprFromPhrase, targetRequirement, playerRequirement, scopeFromSubject, emit, resolveBoundId, addCounter, targetPlayers, applyEffectsUnsafe, shuffle: a => { for (let j = a.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [a[j], a[k]] = [a[k], a[j]]; } return a; } };
