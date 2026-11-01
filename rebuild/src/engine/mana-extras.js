// Extra mana when a permanent is tapped for mana (build 43): Mana Reflection, Nyxbloom Ancient, Crypt Ghast, Caged Sun,
// Gauntlet of Power, Mirari's Wake, Zendikar Resurgent, Mana Flare, Forsaken Monument, Wild Growth / Utopia Sprawl style
// Auras … These are mana abilities (they happen at once, with no stack), so the mana counter and the auto-payer count
// them as part of what the source makes. Extra mana of another colour (Wild Growth on an Island, Utopia Sprawl's chosen
// colour) and of any colour (Fertile Ground) is added too (build 49).

const ANY = ['W', 'U', 'B', 'R', 'G'];
const syms = t => (t.match(/\{([WUBRGC])\}/g) || []).map(y => y[1]);
// Each pattern returns { add, mult, fixed: [colours], any: n } — `add` is extra mana of the colour tapped for, `fixed` is extra
// mana of another colour (Wild Growth on an Island, Utopia Sprawl's chosen colour), `any` is extra mana of any colour (Fertile Ground).
const split = (list, color) => { const add = list.filter(c => c === color).length, fixed = list.filter(c => c !== color); return { add, fixed }; };
const PATTERNS = [
  // [regex, (ctx) => { add?, mult?, fixed?, any? } | null]
  [/Whenever a player taps a land for mana, that player adds one mana of any type that land produced/i, x => x.land ? { add: 1 } : null],
  [/Whenever you tap a land for mana, add one mana of any type that land produced/i, x => x.land && x.mine ? { add: 1 } : null],
  [/Whenever you tap an? ([A-Z][a-z]+) for mana, add an additional ((?:\{[WUBRGC]\})+)/, (x, m) => x.mine && new RegExp(`\\b${m[1]}\\b`).test(x.type) ? split(syms(m[2]), x.color) : null],
  [/Whenever an? ([A-Z][a-z]+) is tapped for mana, its controller adds an additional ((?:\{[WUBRGC]\})+)/, (x, m) => new RegExp(`\\b${m[1]}\\b`).test(x.type) ? split(syms(m[2]), x.color) : null],
  [/Whenever a basic land is tapped for mana of the chosen color, its controller adds an additional one mana of that color/i, x => x.land && /\bBasic\b/.test(x.type) && x.color === x.sourceCard.chosenColor ? { add: 1 } : null],
  [/Whenever a land'?s ability causes you to add one or more mana of the chosen color, add an additional one mana of that color/i, x => x.land && x.mine && x.color === x.sourceCard.chosenColor ? { add: 1 } : null],
  [/Whenever you tap a permanent for \{C\}, add an additional \{C\}/i, x => x.mine && x.color === 'C' ? { add: 1 } : null],
  [/Whenever you tap a creature for mana, add an additional ((?:\{[WUBRGC]\})+)/i, (x, m) => x.mine && /\bCreature\b/.test(x.type) ? split(syms(m[1]), x.color) : null],
  [/If you tap a permanent for mana, it produces three times as much of that mana instead/i, x => x.mine ? { mult: 3 } : null],
  [/If you tap a permanent for mana, it produces twice as much of that mana instead/i, x => x.mine ? { mult: 2 } : null]
];
const AURA = [
  [/Whenever enchanted (?:land|permanent|creature|Forest|Island|Swamp|Mountain|Plains) is tapped for mana, its controller adds an additional ((?:\{[WUBRGC]\})+)(?! for each)/i, (x, m) => split(syms(m[1]), x.color)],
  [/Whenever enchanted (?:land|Forest|Island|Swamp|Mountain|Plains) is tapped for mana, its controller adds an additional one mana of the chosen color/i, (x, m, aura) => !aura.chosenColor ? null : aura.chosenColor === x.color ? { add: 1 } : { fixed: [aura.chosenColor] }],
  [/Whenever enchanted (?:land|Forest|Island|Swamp|Mountain|Plains) is tapped for mana, its controller adds an additional one mana of any type that land produced/i, () => ({ add: 1 })],
  [/Whenever enchanted (?:land|permanent|creature) is tapped for mana, its controller adds an additional one mana of any color/i, () => ({ any: 1 })],
  [/Whenever enchanted (?:land|Forest) is tapped for mana, its controller adds an additional \{([WUBRG])\} for each ([A-Z][a-z]+) on the battlefield/i, (x, m) => { const n = (x.game.players || []).flatMap(p => p.deck?.battlefield || []).filter(c => new RegExp(`\\b${m[2]}\\b`).test(x.game.cardDefinitions?.[c.definitionId]?.typeLine || '')).length; return split(Array(n).fill(m[1]), x.color); }],   // Elvish Guidance
  [/Whenever enchanted (?:land|permanent|creature) is tapped for mana, its controller adds an additional two mana in any combination of colors/i, () => ({ any: 2 })]
];
export const MANA_EXTRA_TEXT = [...PATTERNS, ...AURA].map(p => p[0]);

/** Every extra-mana effect on a source tapped for `color`: { amount (of that colour), fixed: [other colours], any: n }. */
export function manaExtras(game, card, color, base = 1) {
  const none = { amount: Math.max(1, Number(base || 1)), fixed: [], any: 0 };
  if (!game || !card) return none;
  const defOf = c => game.cardDefinitions?.[c?.definitionId] || null;
  const def = defOf(card), type = String(def?.typeLine || '');
  const ctx = { game, color, type, land: /\bLand\b/.test(type), sourceCard: card, mine: false };
  let add = 0, mult = 1, any = 0;
  const fixed = [];
  const take = r => { if (!r) return; add += r.add || 0; if (r.mult) mult *= r.mult; if (r.fixed) fixed.push(...r.fixed); any += r.any || 0; };
  for (const p of game.players || []) for (const c of p.deck?.battlefield || []) {
    const text = String(defOf(c)?.oracleText || '');
    if (!/tap|tapped/i.test(text)) continue;
    for (const [re, fn] of PATTERNS) {
      const m = text.match(re);
      if (m) take(fn({ ...ctx, mine: (c.controllerId || p.playerId) === (card.controllerId || null), sourceCard: { ...card, chosenColor: c.chosenColor } }, m));
    }
    if (c.attachedTo === card.instanceId) for (const [re, fn] of AURA) {
      const m = text.match(re);
      if (m) take(fn(ctx, m, c));
    }
  }
  return { amount: Math.max(1, Number(base || 1)) * mult + add, fixed, any };
}
export { ANY as ANY_COLORS };

/** How much mana of `color` a source makes when tapped for it, with every extra-mana effect of that colour counted. */
export function effectiveManaAmount(game, card, color, base = 1) {
  return manaExtras(game, card, color, base).amount;
}
