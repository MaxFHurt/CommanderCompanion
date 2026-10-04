// Small shared helpers for the game layer. No DOM access anywhere under src/game.

export const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
export const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
export const ZONE_KEYS = ['hand', 'battlefield', 'graveyard', 'exile', 'commandZone', 'remainingLibrary'];

let idCounter = 0;
export function newId(prefix = 'id') {
  idCounter += 1;
  return `${prefix}:${Date.now().toString(36)}:${idCounter}:${Math.random().toString(36).slice(2, 7)}`;
}

export function playerById(game, id) {
  return (game?.players || []).find(p => p.playerId === id) || null;
}

export function activePlayer(game) {
  return playerById(game, game?.activePlayerId) || game?.players?.[0] || null;
}

export function alivePlayers(game) {
  return (game?.players || []).filter(p => !p.eliminated);
}

export function opponentsOf(game, playerId) {
  return alivePlayers(game).filter(p => p.playerId !== playerId);
}

/** Players in turn order starting with `startId` (active player, then clockwise). */
export function turnOrderFrom(game, startId) {
  const seats = game.players || [];
  const start = Math.max(0, seats.findIndex(p => p.playerId === startId));
  const ordered = [...seats.slice(start), ...seats.slice(0, start)];
  return ordered.filter(p => !p.eliminated);
}

/** Card definition for an instance, honouring the chosen face of a double-faced card. */
export function defOf(game, card) {
  if (!card) return null;
  const base = game?.cardDefinitions?.[card.definitionId] || null;
  if (!base) return null;
  const index = Number.isInteger(card.activeFaceIndex) ? card.activeFaceIndex : null;
  return index === null ? base : faceDefinition(base, index) || base;
}

export function faceDefinition(base, index) {
  const face = base?.cardFaces?.[index];
  if (!face) return null;
  return {
    ...base,
    ...face,
    faceIndex: index,
    definitionId: base.definitionId,
    colorIdentity: base.colorIdentity,
    cardFaces: base.cardFaces,
    set: base.set,
    collectorNumber: base.collectorNumber,
    printing: base.printing,
    legalities: base.legalities,
    hydrationStatus: base.hydrationStatus
  };
}

export function definitionsMap(game) {
  return new Map(Object.entries(game?.cardDefinitions || {}));
}

/** Find a card instance in one player's zones. */
export function findInPlayer(player, instanceId) {
  for (const zone of ZONE_KEYS) {
    const card = player?.deck?.[zone]?.find(c => c.instanceId === instanceId);
    if (card) return { card, zone, player };
  }
  return null;
}

/** Find a card instance anywhere in the game (not the stack). */
export function findCard(game, instanceId) {
  for (const player of game?.players || []) {
    const hit = findInPlayer(player, instanceId);
    if (hit) return hit;
  }
  return null;
}

export function typeIs(def, word) {
  return new RegExp(`\\b${word}\\b`, 'i').test(def?.typeLine || '');
}

export function isLand(def) { return typeIs(def, 'Land'); }
export function isCreature(def) { return typeIs(def, 'Creature'); }
export function isInstantOrSorcery(def) { return /\b(Instant|Sorcery)\b/i.test(def?.typeLine || ''); }

export function hasFlash(def) {
  return /\bFlash\b/i.test(String(def?.oracleText || '')) || (def?.keywords || []).some(k => String(k).toLowerCase() === 'flash');
}

export function isInstantSpeed(def) {
  return typeIs(def, 'Instant') || hasFlash(def);
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

/** Add an entry to the game log (newest first). */
export function log(game, text, extra = {}) {
  game.log = game.log || [];
  game.log.unshift({
    id: newId('log'),
    text,
    turn: game.turnNumber,
    phase: game.phase,
    at: new Date().toISOString(),
    ...extra
  });
  if (game.log.length > 600) game.log.length = 600;
}

export function emptyMana() {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

export function clampInt(value, min, max, fallback = min) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Error whose message is safe and useful to show to a player. */
export class GameError extends Error {
  constructor(message, reasons = []) {
    super(message);
    this.name = 'GameError';
    this.reasons = reasons.length ? reasons : [message];
  }
}
