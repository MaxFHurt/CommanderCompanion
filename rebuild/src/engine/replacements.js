// Common replacement effects read from permanents on the battlefield:
//  tokens (Doubling Season, Anointed Procession, Parallel Lives), counters (Doubling Season,
//  Hardened Scales, Corpsejack Menace), life gain (Boon Reflection, Rhox Faithmender),
//  damage (Furnace of Rath, Fiery Emancipation, Torbran) and graveyard → exile (Rest in Peace,
//  Leyline of the Void). Effects that don't match these shapes are left to the players.

const strip = text => String(text || '').replace(/\([^()]*\)/g, '');

function defFor(game, card) {
  return game?.cardDefinitions?.[card?.definitionId] || null;
}

function permanents(game) {
  const out = [];
  for (const p of game?.players || []) {
    if (p.eliminated) continue;
    for (const c of p.deck?.battlefield || []) out.push({ p, c, text: strip(defFor(game, c)?.oracleText) });
  }
  return out;
}

/** How many tokens are actually created when an effect would create `count` of them. */
export function tokenCount(game, controllerId, count, { creature = true } = {}) {
  let n = count;
  for (const { p, text } of permanents(game)) {
    const mine = p.playerId === controllerId;
    if (mine && /If an effect would create one or more tokens under your control, it creates twice that many/i.test(text)) n *= 2;
    else if (mine && creature && /If an effect would create one or more creature tokens under your control, it creates twice that many/i.test(text)) n *= 2;
    else if (/If an effect would create one or more creature tokens under a player'?s control, it creates twice that many/i.test(text) && creature) n *= 2;
  }
  return n;
}

/** How many counters a permanent controlled by `controllerId` actually gets. */
export function counterCount(game, controllerId, counter, count, { creature = true } = {}) {
  if (count <= 0) return count;
  let n = count;
  const plusOne = counter === '+1/+1';
  const rows = permanents(game).filter(x => x.p.playerId === controllerId);
  for (const { text } of rows) {
    if (/If an effect would put one or more counters on a permanent you control, it puts twice that many/i.test(text)) n *= 2;
    else if (plusOne && creature && /If one or more \+1\/\+1 counters would be put on a creature you control, twice that many/i.test(text)) n *= 2;
  }
  for (const { text } of rows) {
    if (plusOne && creature && /If one or more \+1\/\+1 counters would be put on a creature (?:or Vehicle )?you control, that many plus one/i.test(text)) n += 1;
  }
  return n;
}

/** Life actually gained. */
export function lifeGainAmount(game, playerId, amount) {
  if (amount <= 0) return amount;
  let n = amount;
  for (const { p, text } of permanents(game)) {
    if (p.playerId === playerId && /If you would gain life, you gain twice that much life instead/i.test(text)) n *= 2;
    if (p.playerId === playerId && /If you would gain life, you gain that much life plus 1 instead/i.test(text)) n += 1;
  }
  return n;
}

/** Damage actually dealt by a source (controlled by `sourceControllerId`, with `colors`) to a target. */
export function damageAmount(game, { sourceControllerId, colors = [], targetPlayerId = null, targetControllerId = null }, amount) {
  if (amount <= 0) return amount;
  let n = amount;
  const victim = targetPlayerId || targetControllerId;
  for (const { p, text } of permanents(game)) {
    if (/If a source would deal damage to a permanent or player, it deals double that damage/i.test(text)) n *= 2;
    if (p.playerId === sourceControllerId && /If a source you control would deal damage to a permanent or player, it deals triple that damage/i.test(text)) n *= 3;
    else if (p.playerId === sourceControllerId && /If a source you control would deal damage to a permanent or player, it deals double that damage/i.test(text)) n *= 2;
  }
  for (const { p, text } of permanents(game)) {
    const m = text.match(/If a (red )?source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus (\d+) instead/i);
    if (m && p.playerId === sourceControllerId && victim && victim !== sourceControllerId && (!m[1] || colors.includes('R'))) n += Number(m[2]);
  }
  return n;
}

/** Where a card headed for a graveyard actually goes. */
export function graveyardDestination(game, card) {
  // "If that creature would die this turn, exile it instead." (Suplex, Anger of the Gods)
  if ((card?.temporaryEffects || []).some(e => e?.kind === 'exile-if-dies')) return 'exile';
  for (const { p, text } of permanents(game)) {
    if (/If a card or token would be put into a graveyard from anywhere, exile it instead/i.test(text)) return 'exile';
    if (/If a card would be put into an opponent'?s graveyard from anywhere, exile it instead/i.test(text) && card?.ownerId && card.ownerId !== p.playerId) return 'exile';
  }
  return 'graveyard';
}
