// Rule corrections (build 47): what players had to do by hand. Each game keeps a short log; the app sends new entries to
// the server (src/net/corrections.js) so the owner's Dev report — and the monthly Claude audit — see corrections from
// every game. No player names, decks or hands are recorded: only cards, rules text and what was done.

import { VERSION } from '../version.js';

const MAX = 200;

/** Add one correction to the game's log. kind: 'manual-resolution' | 'edit' | 'engine-error' | 'undo' | 'ruling'. */
export function noteCorrection(game, rec) {
  if (!game) return;
  game.corrections = game.corrections || [];
  game.correctionSeq = Number(game.correctionSeq || 0) + 1;
  game.corrections.push({ id: `${game.gameId || 'game'}:${game.correctionSeq}`, at: new Date().toISOString(), version: VERSION, mode: game.mode || 'fully-tracked', turn: game.turnNumber || 0, ...rec });
  if (game.corrections.length > MAX) game.corrections.splice(0, game.corrections.length - MAX);
}

/** A short, name-free description of a manual edit (life, counters, zones …) for the report. */
export function describeEdit(game, e) {
  const name = id => { for (const p of game.players || []) for (const z of ['battlefield', 'hand', 'graveyard', 'exile', 'remainingLibrary', 'commandZone']) { const c = (p.deck?.[z] || []).find(x => x.instanceId === id); if (c) return game.cardDefinitions?.[c.definitionId]?.name || 'a card'; } return null; };
  const parts = [e.kind];
  if (e.instanceId || e.cardId) parts.push(name(e.instanceId || e.cardId) || '');
  for (const k of ['to', 'counter', 'delta', 'set', 'amount', 'keyword', 'power', 'toughness', 'name']) if (e[k] !== undefined && e[k] !== null && e[k] !== '') parts.push(`${k}=${typeof e[k] === 'object' ? JSON.stringify(e[k]) : e[k]}`);
  return parts.filter(Boolean).join(' ');
}
