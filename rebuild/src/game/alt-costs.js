// Alternative costs of the "rather than pay this spell's mana cost" family (build 111, rules long tail batch 5):
// exile cards of a colour from your hand (Fury of the Horde, the Shoals), return or sacrifice lands (Gush, Daze, Fireblast),
// discard a land card (Foil, Snag), tap a creature while you control a land type (Angelic Favor), have opponents gain life
// (Invigorate), exile the top black cards of your graveyard (Spinning Darkness). casting.js lists each as a cast mode, ops.js
// asks the choices of the caster, transactions.js pays them (altPayOps) as the spell is put on the stack.
import { defOf } from './helpers.js';

const WORDN = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 };
const COLOR = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const LAND = '(Plains|Island|Swamp|Mountain|Forest)';
const TAIL = "rather than pay this spell'?s mana cost";
const PATTERNS = [
  { id: 'exile-hand', rx: new RegExp(`(?:If you control an? ${LAND}, )?you may exile (a|an|one|two|three) (white|blue|black|red|green) cards?( with mana value X)? from your hand ${TAIL}\\.`, 'i') },
  { id: 'lands', rx: new RegExp(`you may (return|sacrifice) (an?|one|two|three) ${LAND}s?(?: you control)?(?: to (?:its|their) owner'?s'? hands?)? ${TAIL}\\.`, 'i') },
  { id: 'discard-land', rx: new RegExp(`you may discard an? ${LAND} card( and another card)? ${TAIL}\\.`, 'i') },
  { id: 'tap', rx: new RegExp(`If you control an? ${LAND}, you may tap an untapped creature you control ${TAIL}\\.`, 'i') },
  { id: 'opp-life', rx: new RegExp(`If you control an? ${LAND}, ${TAIL}, you may have (an opponent|each other player) gain (\\d+) life\\.`, 'i') },
  { id: 'exile-gy', rx: new RegExp(`you may exile the top (two|three|four) (white|blue|black|red|green) cards of your graveyard ${TAIL}\\.`, 'i') }
];

/** Sentences of this family, read into { id, spec, label, cond }. A single "exile a blue card" / "sacrifice a Mountain" stays with the older readings. */
export function altPaySpecs(text) {
  const t = String(text || '').replace(/\([^()]*\)/g, '');
  const out = [];
  for (const p of PATTERNS) {
    const g = new RegExp(p.rx.source, 'gi');
    for (const m of t.matchAll(g)) {
      if (p.id === 'exile-hand') {
        const n = WORDN[m[2].toLowerCase()], color = COLOR[m[3].toLowerCase()], mvX = !!m[4];
        if (n === 1 && !mvX && !m[1]) continue;
        out.push({ id: p.id, cond: m[1] || null, n, color, mvX, label: `Exile ${n === 1 ? 'a' : n} ${m[3].toLowerCase()} card${n === 1 ? '' : 's'}${mvX ? ' (mana value X)' : ''} from your hand instead` });
      } else if (p.id === 'lands') {
        const n = WORDN[m[2].toLowerCase()], verb = m[1].toLowerCase();
        if (verb === 'sacrifice' && n === 1) continue;
        out.push({ id: p.id, verb, n, land: m[3], label: `${verb === 'return' ? 'Return' : 'Sacrifice'} ${n === 1 ? 'an' : n} ${m[3]}${n === 1 ? '' : 's'} instead` });
      } else if (p.id === 'discard-land') out.push({ id: p.id, land: m[1], extra: !!m[2], label: `Discard ${/^[AEIOU]/i.test(m[1]) ? 'an' : 'a'} ${m[1]} card${m[2] ? ' and another card' : ''} instead` });
      else if (p.id === 'tap') out.push({ id: p.id, cond: m[1], label: 'Tap an untapped creature you control instead' });
      else if (p.id === 'opp-life') out.push({ id: p.id, cond: m[1], who: /each other/i.test(m[2]) ? 'others' : 'one', life: Number(m[3]), label: `${/each other/i.test(m[2]) ? 'Each other player gains' : 'An opponent gains'} ${m[3]} life instead` });
      else if (p.id === 'exile-gy') out.push({ id: p.id, n: WORDN[m[1].toLowerCase()], color: COLOR[m[2].toLowerCase()], label: `Exile the top ${m[1].toLowerCase()} ${m[2].toLowerCase()} cards of your graveyard instead` });
    }
  }
  return out;
}

/** The sentences removed from a spell's text before its effects are read (they are costs, not things the spell does). */
export function stripAltPay(t) {
  let s = String(t || '');
  for (const p of PATTERNS) s = s.replace(new RegExp(`${p.rx.source}\\s*`, 'gi'), m => (altPaySpecs(m).length ? '' : m));
  return s;
}

const hasLand = (game, player, land) => (player.deck?.battlefield || []).some(c => new RegExp(`\\b${land}\\b`, 'i').test(defOf(game, c)?.typeLine || ''));
const isCreature = (game, c) => /\bcreature\b/i.test(defOf(game, c)?.typeLine || '');
const landRows = (game, player, land) => (player.deck?.battlefield || []).filter(c => (c.controllerId || player.playerId) === player.playerId && new RegExp(`\\bBasic\\b|\\b${land}\\b`, 'i').test(defOf(game, c)?.typeLine || '') && new RegExp(`\\b${land}\\b`, 'i').test(defOf(game, c)?.typeLine || ''));
const colorHand = (game, player, card, color) => (player.deck?.hand || []).filter(c => c.instanceId !== card.instanceId && (defOf(game, c)?.colors || []).includes(color));
const colorGrave = (game, player, color) => (player.deck?.graveyard || []).filter(c => (defOf(game, c)?.colors || []).includes(color));

/** Can this alternative cost be paid right now? */
export function altPayAvailable(game, player, card, spec) {
  if (spec.cond && !hasLand(game, player, spec.cond)) return false;
  switch (spec.id) {
    case 'exile-hand': return colorHand(game, player, card, spec.color).length >= spec.n;
    case 'lands': return landRows(game, player, spec.land).length >= spec.n;
    case 'discard-land': return (player.deck?.hand || []).filter(c => c.instanceId !== card.instanceId && new RegExp(`\\b${spec.land}\\b`, 'i').test(defOf(game, c)?.typeLine || '') && /\bland\b/i.test(defOf(game, c)?.typeLine || '')).length >= 1 && (!spec.extra || (player.deck?.hand || []).length >= 3);
    case 'tap': return (player.deck?.battlefield || []).some(c => !c.tapped && isCreature(game, c) && (c.controllerId || player.playerId) === player.playerId);
    case 'opp-life': return (game.players || []).some(q => !q.eliminated && q.playerId !== player.playerId);
    case 'exile-gy': return colorGrave(game, player, spec.color).length >= spec.n;
    default: return false;
  }
}

const row = (game, c, sub) => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: sub || defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId });

/** Ask the caster for the cards that pay it. Returns { ops, X } (ops are paid in transactions.js). */
export function altPayChoose(game, player, card, spec, ask, title) {
  const base = { playerId: player.playerId, cancellable: true, source: title, title: `${title} — alternative cost` };
  const ops = []; let X = null;
  const many = (key, rows, n, prompt, priv) => [].concat(ask(key, () => ({ ...base, kind: 'choose-many', private: !!priv, prompt, options: rows, min: n, max: n })));
  switch (spec.id) {
    case 'exile-hand': {
      const rows = colorHand(game, player, card, spec.color);
      let picked;
      if (spec.mvX) {
        // "with mana value X": one card; X is its mana value.
        const id = ask('cost:alt-exile', () => ({ ...base, kind: 'choose-one', private: true, prompt: `Exile a ${spec.label.match(/(white|blue|black|red|green)/i)?.[1] || ''} card from your hand; X is its mana value.`, options: rows.map(c => row(game, c, `mana value ${Number(defOf(game, c)?.manaValue ?? defOf(game, c)?.cmc ?? 0)}`)) }));
        picked = [id];
        const c = rows.find(r => r.instanceId === id);
        X = Number(defOf(game, c)?.manaValue ?? defOf(game, c)?.cmc ?? 0);
      } else picked = many('cost:alt-exile', rows.map(c => row(game, c)), spec.n, `Exile ${spec.n} card${spec.n === 1 ? '' : 's'} from your hand.`, true);
      for (const id of picked) ops.push({ op: 'exile-hand', id });
      break;
    }
    case 'lands': {
      const rows = landRows(game, player, spec.land);
      const picked = spec.n >= rows.length ? rows.map(c => c.instanceId) : many('cost:alt-lands', rows.map(c => row(game, c)), spec.n, `${spec.verb === 'return' ? 'Return' : 'Sacrifice'} ${spec.n} ${spec.land}${spec.n === 1 ? '' : 's'} you control.`);
      for (const id of picked) ops.push({ op: spec.verb === 'return' ? 'return' : 'sacrifice', id });
      break;
    }
    case 'discard-land': {
      const hand = (player.deck?.hand || []).filter(c => c.instanceId !== card.instanceId);
      const lands = hand.filter(c => new RegExp(`\\b${spec.land}\\b`, 'i').test(defOf(game, c)?.typeLine || '') && /\bland\b/i.test(defOf(game, c)?.typeLine || ''));
      const id = ask('cost:alt-discard', () => ({ ...base, kind: 'choose-one', private: true, prompt: `Discard ${/^[AEIOU]/i.test(spec.land) ? 'an' : 'a'} ${spec.land} card.`, options: lands.map(c => row(game, c)) }));
      ops.push({ op: 'discard', id });
      if (spec.extra) {
        const rest = hand.filter(c => c.instanceId !== id);
        const id2 = ask('cost:alt-discard2', () => ({ ...base, kind: 'choose-one', private: true, prompt: 'Discard another card.', options: rest.map(c => row(game, c)) }));
        ops.push({ op: 'discard', id: id2 });
      }
      break;
    }
    case 'tap': {
      const rows = (player.deck?.battlefield || []).filter(c => !c.tapped && isCreature(game, c) && (c.controllerId || player.playerId) === player.playerId);
      const id = ask('cost:alt-tap', () => ({ ...base, kind: 'choose-one', prompt: 'Tap an untapped creature you control.', options: rows.map(c => row(game, c)) }));
      ops.push({ op: 'tap', id });
      break;
    }
    case 'opp-life': {
      const opps = (game.players || []).filter(q => !q.eliminated && q.playerId !== player.playerId);
      if (spec.who === 'others') for (const q of opps) ops.push({ op: 'gain-life', playerId: q.playerId, amount: spec.life });
      else {
        const pid = opps.length === 1 ? opps[0].playerId : ask('cost:alt-opp', () => ({ ...base, kind: 'choose-one', prompt: `Choose an opponent: they gain ${spec.life} life.`, options: opps.map(q => ({ id: q.playerId, label: q.displayName, playerId: q.playerId })) }));
        ops.push({ op: 'gain-life', playerId: pid, amount: spec.life });
      }
      break;
    }
    case 'exile-gy': {
      const top = colorGrave(game, player, spec.color).slice(-spec.n);
      for (const c of top) ops.push({ op: 'exile-gy', id: c.instanceId });
      break;
    }
  }
  return { ops, X };
}
