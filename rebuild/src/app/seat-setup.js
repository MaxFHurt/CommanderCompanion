// Turns what a player picked on the setup screen (name, deck, commander) into everything the
// game needs for that seat, and checks the deck against the table rules.

import { hydrateDeck } from '../data/card-cache.js';
import { validateCommanderDeck, isCommanderEligible } from '../engine/rules.js';

export function emptySeat(name = '') {
  return { name, deckId: '', deckName: '', deckList: '', commander1: '', commander2: '', sourceType: 'custom', matId: 'default' };
}

export function seatProblems(seat, index) {
  const label = seat.name?.trim() || `Player ${index + 1}`;
  const out = [];
  if (!seat.name?.trim()) out.push(`Player ${index + 1}: enter a player name`);
  if (!seat.deckList?.trim()) out.push(`${label}: choose a deck`);
  if (!seat.commander1?.trim()) out.push(`${label}: choose a commander`);
  return out;
}

const norm = s => String(s || '').trim().toLowerCase();

/** Returns { ok, seat (prepared), errors, warnings }. `strict` = Guided Play (deck must be legal). */
export async function prepareSeat(seat, { rules = {}, strict = true, onProgress } = {}) {
  const name = seat.name.trim();
  const hydrated = await hydrateDeck(seat.deckList, onProgress);
  const errors = [], warnings = [];
  if (hydrated.unresolved.length) errors.push(`These cards were not recognised: ${hydrated.unresolved.slice(0, 5).join(', ')}${hydrated.unresolved.length > 5 ? '…' : ''}`);
  const commanders = [];
  for (const cmd of [seat.commander1, seat.commander2].map(x => String(x || '').trim()).filter(Boolean)) {
    const def = hydrated.definitions.find(d => norm(d.name) === norm(cmd) || norm(d.combinedName) === norm(cmd));
    if (!def) errors.push(`${cmd} is not in this deck list.`);
    else {
      commanders.push(def);
      if (!isCommanderEligible(def)) (strict ? errors : warnings).push(`${def.name} cannot normally be a commander.`);
    }
  }
  if (!errors.length) {
    const check = validateCommanderDeck({ manifest: hydrated.manifest, definitions: hydrated.definitions, commanders, rulesConfig: rules });
    if (!check.legal) (strict ? errors : warnings).push(...check.reasons);
  }
  return {
    ok: !errors.length, errors, warnings,
    seat: {
      name, deckName: seat.deckName || 'Custom deck', deckId: seat.deckId || null, sourceType: seat.sourceType || 'custom', matId: seat.matId || null,
      manifest: hydrated.manifest, commanderIds: commanders.map(d => d.definitionId), definitions: hydrated.definitions,
      commanderNames: commanders.map(d => d.name), total: hydrated.total
    }
  };
}
