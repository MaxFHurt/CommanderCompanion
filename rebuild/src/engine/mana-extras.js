// Extra mana when a permanent is tapped for mana (build 43): Mana Reflection, Nyxbloom Ancient, Crypt Ghast, Caged Sun,
// Gauntlet of Power, Mirari's Wake, Zendikar Resurgent, Mana Flare, Forsaken Monument, Wild Growth / Utopia Sprawl style
// Auras … These are mana abilities (they happen at once, with no stack), so the mana counter and the auto-payer count
// them as part of what the source makes. Only extra mana of the same type as the source's is counted.

const PATTERNS = [
  // [regex, (ctx) => { add?, mult? } | null]
  [/Whenever a player taps a land for mana, that player adds one mana of any type that land produced/i, x => x.land ? { add: 1 } : null],
  [/Whenever you tap a land for mana, add one mana of any type that land produced/i, x => x.land && x.mine ? { add: 1 } : null],
  [/Whenever you tap a ([A-Z][a-z]+) for mana, add an additional \{([WUBRGC])\}/, (x, m) => x.mine && new RegExp(`\\b${m[1]}\\b`).test(x.type) && m[2] === x.color ? { add: 1 } : null],
  [/Whenever a basic land is tapped for mana of the chosen color, its controller adds an additional one mana of that color/i, x => x.land && /\bBasic\b/.test(x.type) && x.color === x.sourceCard.chosenColor ? { add: 1 } : null],
  [/Whenever a land'?s ability causes you to add one or more mana of the chosen color, add an additional one mana of that color/i, x => x.land && x.mine && x.color === x.sourceCard.chosenColor ? { add: 1 } : null],
  [/Whenever you tap a permanent for \{C\}, add an additional \{C\}/i, x => x.mine && x.color === 'C' ? { add: 1 } : null],
  [/Whenever you tap a creature for mana, add an additional \{([WUBRGC])\}/i, (x, m) => x.mine && /\bCreature\b/.test(x.type) && m[1] === x.color ? { add: 1 } : null],
  [/If you tap a permanent for mana, it produces three times as much of that mana instead/i, x => x.mine ? { mult: 3 } : null],
  [/If you tap a permanent for mana, it produces twice as much of that mana instead/i, x => x.mine ? { mult: 2 } : null]
];
const AURA = [
  [/Whenever enchanted (?:land|permanent|creature) is tapped for mana, its controller adds an additional ((?:\{[WUBRGC]\})+)/i, (x, m) => { const s = m[1].match(/\{([WUBRGC])\}/g).map(y => y[1]); return s.every(c => c === x.color) ? { add: s.length } : null; }],
  [/Whenever enchanted land is tapped for mana, its controller adds an additional one mana of the chosen color/i, (x, m, aura) => aura.chosenColor === x.color ? { add: 1 } : null],
  [/Whenever enchanted land is tapped for mana, its controller adds an additional one mana of any type that land produced/i, () => ({ add: 1 })]
];
export const MANA_EXTRA_TEXT = [...PATTERNS, ...AURA].map(p => p[0]);

/** How much mana a source makes when tapped for `color`, with every extra-mana effect counted. */
export function effectiveManaAmount(game, card, color, base = 1) {
  if (!game || !card) return base;
  const defOf = c => game.cardDefinitions?.[c?.definitionId] || null;
  const def = defOf(card), type = String(def?.typeLine || '');
  const ctx = { color, type, land: /\bLand\b/.test(type), sourceCard: card, mine: false };
  let add = 0, mult = 1;
  for (const p of game.players || []) for (const c of p.deck?.battlefield || []) {
    const text = String(defOf(c)?.oracleText || '');
    if (!/tap|tapped/i.test(text)) continue;
    for (const [re, fn] of PATTERNS) {
      const m = text.match(re);
      if (!m) continue;
      const r = fn({ ...ctx, mine: (c.controllerId || p.playerId) === (card.controllerId || null), sourceCard: { ...card, chosenColor: c.chosenColor } }, m);
      if (r?.add) add += r.add;
      if (r?.mult) mult *= r.mult;
    }
    if (c.attachedTo === card.instanceId) for (const [re, fn] of AURA) {
      const m = text.match(re);
      const r = m && fn(ctx, m, c);
      if (r?.add) add += r.add;
    }
  }
  return Math.max(1, Number(base || 1)) * mult + add;
}
