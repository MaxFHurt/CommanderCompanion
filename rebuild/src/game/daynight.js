// Day and night (CR 726, build 112). game.dayNight is null (neither), 'day' or 'night'.
// - It becomes day as soon as a permanent with daybound is on the battlefield while it is neither (726.2).
// - As each turn begins: day → night if the previous turn's active player cast no spells that turn; night → day if they cast two or more
//   (engine/phase.js advanceTurn records the change, transactions.js emits 'day-night-changed').
// - Daybound permanents show their back (nightbound) face while it is night and their front face while it is day (702.145).

const bound = base => (base?.cardFaces || []).length > 1 && /(?:^|\n)\s*Daybound\b/i.test(String(base.cardFaces[0]?.oracleText || ''));

/** Called with the other state-based checks; returns true when anything changed. */
export function maintainDayNight(game) {
  let changed = false;
  const cards = (game.players || []).flatMap(p => p.deck?.battlefield || []).filter(c => bound(game.cardDefinitions?.[c.realDefinitionId || c.definitionId]) && !c.realDefinitionId);
  if (!game.dayNight && cards.length) { game.dayNight = 'day'; changed = true; }
  if (!game.dayNight) return changed;
  const face = game.dayNight === 'night' ? 1 : 0;
  for (const c of cards) if (Number(c.activeFaceIndex || 0) !== face) { c.activeFaceIndex = face; changed = true; }
  return changed;
}

/** "It becomes night." / "it becomes day." */
export function setDayNight(game, value) {
  const was = game.dayNight || null;
  game.dayNight = value;
  return was && was !== value;
}
