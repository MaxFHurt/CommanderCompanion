// Running statistics for each player (fed by every game event) and the awards handed out when the
// game ends. Stats live on player.stats so they survive saves and are undone with the game.

const ZERO = () => ({ damage: 0, commanderDamage: 0, biggestHit: 0, spells: 0, cardsDrawn: 0, lifeGained: 0, tokens: 0, creaturesLost: 0, landsPlayed: 0 });

function statsOf(game, playerId) {
  const p = (game.players || []).find(x => x.playerId === playerId);
  if (!p) return null;
  p.stats = { ...ZERO(), ...(p.stats || {}) };
  return p.stats;
}

/** Count one event. Called from the engine's event funnel. */
export function recordStat(game, event) {
  if (!game || !event) return;
  const s = id => statsOf(game, id);
  switch (event.type) {
    case 'damage-player':
    case 'combat-damage-player': {
      const st = s(event.controllerId);
      if (st && event.controllerId !== event.playerId) {
        st.damage += Number(event.amount || 0);
        if (event.type === 'combat-damage-player') st.biggestHit = Math.max(st.biggestHit, Number(event.amount || 0));
      }
      break;
    }
    case 'spell-cast': { const st = s(event.controllerId); if (st) st.spells += 1; break; }
    case 'draw': { const st = s(event.playerId); if (st) st.cardsDrawn += 1; break; }
    case 'life-gained': { const st = s(event.playerId); if (st) st.lifeGained += Number(event.amount || 0); break; }
    case 'token-created': { const st = s(event.controllerId); if (st) st.tokens += 1; break; }
    case 'dies': { const st = s(event.controllerId); if (st && !event.token) st.creaturesLost += 1; break; }
    default:
  }
}

const AWARDS = [
  { key: 'most-damage', label: 'Heavy Hitter', stat: 'damage', unit: 'damage dealt' },
  { key: 'biggest-hit', label: 'Biggest Swing', stat: 'biggestHit', unit: 'combat damage in one hit' },
  { key: 'most-spells', label: 'Spellslinger', stat: 'spells', unit: 'spells cast' },
  { key: 'most-cards', label: 'Card Advantage', stat: 'cardsDrawn', unit: 'cards drawn' },
  { key: 'most-life', label: 'Life Gain Leader', stat: 'lifeGained', unit: 'life gained' },
  { key: 'most-tokens', label: 'Token Maker', stat: 'tokens', unit: 'tokens made' }
];

/** Awards for a finished game: one per category, only when someone scored and there is no tie. */
export function gameAwards(game) {
  const players = (game.players || []).map(p => ({ playerId: p.playerId, name: p.displayName, stats: { ...ZERO(), ...(p.stats || {}) }, eliminated: !!p.eliminated, life: Number(p.life || 0) }));
  const awards = [];
  for (const a of AWARDS) {
    const sorted = [...players].sort((x, y) => y.stats[a.stat] - x.stats[a.stat]);
    const top = sorted[0];
    if (!top || top.stats[a.stat] <= 0 || (sorted[1] && sorted[1].stats[a.stat] === top.stats[a.stat])) continue;
    awards.push({ key: a.key, label: a.label, playerId: top.playerId, value: top.stats[a.stat], detail: `${top.stats[a.stat]} ${a.unit}` });
  }
  const alive = players.filter(p => !p.eliminated);
  if (alive.length > 1 || (alive.length === 1 && players.length > 1)) {
    const best = [...alive].sort((x, y) => y.life - x.life)[0];
    if (best && best.playerId !== game.winner && best.life > 0) awards.push({ key: 'survivor', label: 'Last One Standing', playerId: best.playerId, value: best.life, detail: `${best.life} life left` });
  }
  return awards;
}

export function statsView(player) {
  return { ...ZERO(), ...(player.stats || {}) };
}
