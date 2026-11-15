// Small pure helpers for the game screen: the status light beside each player's life, the turn controls that are
// legal right now, the opponent seat layout (centre + left/right) and the phone log length. No DOM; tested in node.

const TEMPORARY = new Set(['turn', 'next-turn']);

/**
 * The status light for one player row of the view.
 * green: healthy; yellow: a temporary status (until end of turn, until their next turn …);
 * red: poison counters or a harmful lasting effect (rad counters, an effect marked harmful with no end).
 * Returns { level, reasons } so the details view and the light's label can say why.
 */
export function statusLight(player) {
  if (!player) return { level: 'green', reasons: [] };
  const red = [], yellow = [];
  if (Number(player.poison || 0) > 0) red.push(`${player.poison} poison`);
  if (Number(player.counters?.rad || 0) > 0) red.push(`${player.counters.rad} rad`);
  for (const e of player.effects || []) {
    if (TEMPORARY.has(e.until)) yellow.push(e.text);
    else if (e.harmful) red.push(e.text);
  }
  if (red.length) return { level: 'red', reasons: [...red, ...yellow] };
  if (yellow.length) return { level: 'yellow', reasons: yellow };
  return { level: 'green', reasons: [] };
}

const PROMPT_LABEL = { guided: 'Resolve', blocks: 'Block', discard: 'Discard', proposal: 'Answer' };

/**
 * The turn controls this viewer may use now, in display order: [{ act, label }].
 * Draw (a draw the player makes by hand), Attack, Next Phase and End Turn come from the view's own legality
 * (view.actions); Pass and the prompt buttons reopen a response window or a minimised prompt.
 */
export function playControls(view) {
  if (!view?.you || view.status === 'complete') return [];
  const p = view.prompt || {}, a = view.actions || {};
  switch (p.kind) {
    case 'priority': return [{ act: 'pass', label: 'Pass' }];
    case 'decision': return [{ act: 'prompt', label: /^draw\b/i.test(p.decision?.source || p.decision?.title || '') ? 'Draw' : 'Choose' }];
    case 'vote': return p.canVote || p.canDecide ? [{ act: 'prompt', label: 'Vote' }] : [];
    case 'guided': case 'blocks': case 'discard': case 'proposal': return [{ act: 'prompt', label: PROMPT_LABEL[p.kind] }];
    case 'turn': {
      const out = [];
      if (a.attack?.length) out.push({ act: 'attack', label: 'Attack' });
      // From the second main phase "next phase" is the end of the turn, so only End Turn is shown there.
      if (a.nextPhase && view.phase !== 'postcombat-main') out.push({ act: 'next-phase', label: view.phase === 'precombat-main' ? 'Combat' : 'Next Phase' });
      if (a.endTurn) out.push({ act: 'end-turn', label: 'End Turn' });
      return out;
    }
    default: return [];
  }
}

/**
 * Opponent seats around the local player: one in the centre (shown with its battlefield) and the rest in compact
 * left and right slots. `prev` is the last layout; it is kept while it still matches the opponents.
 * Opponents are given in turn order after the local player; the one across the table starts in the centre.
 */
export function seatLayout(opponentIds, prev = null) {
  const ids = [...opponentIds];
  if (prev && prev.centre && [prev.centre, ...prev.left, ...prev.right].length === ids.length
    && [prev.centre, ...prev.left, ...prev.right].every(id => ids.includes(id))) return prev;
  if (!ids.length) return { centre: null, left: [], right: [] };
  const c = Math.floor(ids.length / 2);
  return { centre: ids[c], left: ids.slice(0, c), right: ids.slice(c + 1) };
}

/** Tapping a side seat: it moves to the centre and the old centre takes its side slot. */
export function rotateTo(layout, id) {
  if (!layout || id === layout.centre) return layout;
  const swap = list => list.map(x => (x === id ? layout.centre : x));
  if (!layout.left.includes(id) && !layout.right.includes(id)) return layout;
  return { centre: id, left: swap(layout.left), right: swap(layout.right) };
}

/** Opponents in turn order starting after `meId` (seat order of the view's player list). */
export function opponentsInOrder(players, meId) {
  const i = players.findIndex(p => p.playerId === meId);
  return i < 0 ? players.filter(p => p.playerId !== meId) : [...players.slice(i + 1), ...players.slice(0, i)];
}

/** Phone-sized screens (an iPhone in either orientation) show the three newest log entries; larger ones keep more. */
export const PHONE_QUERY = '(max-width: 599px), (max-height: 599px)';
export function logLength(phone) { return phone ? 3 : 14; }
