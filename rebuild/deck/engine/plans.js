// ===== Game plan: enabler -> payoff chains (roadmap 6b, batch A; design rebuild/roadmap/6b-design.md) =====
// What a deck's cards set off in a game, from the plan facts (plan-facts.js, made by tools/plan-facts.mjs from the game
// engine's readings first, the Deck Builder's reader second): a card that returns creatures to hand feeds the cards with
// enters triggers, a sacrifice outlet feeds the death triggers, and so on. Batch A uses it for what is shown only (the Game
// plan read-out in Build stats, "Works with" in the card window, the upgrade reasons); batches B-D add Fix picks (UP.planFix),
// suggested plans (UP.planList) and upgrade value (UP.chain, chainBonus).
// A fact is 6 characters (tools/plan-facts.mjs): g/w · event · side · what · repeat; its source is e (game engine),
// r (Deck Builder reader), k (keyword) or x (text).
const PF_SRC = {e: 'game engine', r: 'Deck Builder reader', k: 'keyword', x: 'text', y: 'card type'};
// PLAN_FACTS is stored by fact list ({"wens-o": "Mulldrifter|…"}); read into card name -> fact list once
let PF_MAP = null;
function pfMap() {
  if (PF_MAP) return PF_MAP;
  PF_MAP = new Map();
  if (typeof PLAN_FACTS !== 'undefined') for (const k in PLAN_FACTS) for (const n of PLAN_FACTS[k].split('|')) PF_MAP.set(n, k);
  return PF_MAP;
}
function planFacts(c) {
  if (!c) return [];
  if (c._pf) return c._pf;
  const M = pfMap(),
    raw = M.get(c.n) || M.get(String(c.n).split(' // ')[0]) || '',
    i = raw.indexOf(':'),
    codes = i < 0 ? raw : raw.slice(0, i),
    src = i < 0 ? '' : raw.slice(i + 1),
    out = [];
  for (let k = 0; k * 6 < codes.length; k++) out.push({code: codes.slice(k * 6, k * 6 + 6), src: src[k] || 'e'});
  // instants and sorceries cast spells (the Spells chain's enablers), read from the type line
  const t = frontType(c);
  if (/\b(?:Instant|Sorcery)\b/.test(t)) out.push({code: 'gcamio', src: 'y'});
  // a creature enters when it is cast (Purphoros, Captain America's Heroes); a noncreature permanent is a noncreature spell
  else if (/\bCreature\b/.test(t)) out.push({code: 'genmco', src: 'y'});
  else if (/\b(?:Artifact|Enchantment|Planeswalker|Battle)\b/.test(t) && !/\bLand\b/.test(t)) out.push({code: 'gcamno', src: 'y'});
  return (c._pf = out);
}
// The chains. E: what feeds it (gives), P: what it pays off (wants). `en`/`pay`: how a card on that side is described.
const CHAINS = [
  {id: 'recast', label: 'Re-cast for enters and cast triggers', E: /^gth[sm][cp-]/, P: /^wens|^wcam[c-]/,
    en: 'returns creatures to hand', pay: 'has an enters or cast trigger'},
  {id: 'blink', label: 'Blink for enters triggers', E: /^gfl/, P: /^wens|^wenm[ct-]/, en: 'blinks your permanents', pay: 'has an enters trigger'},
  {id: 'discard', label: 'Full hand into discard payoffs', E: /^gdrm-1|^gth[sm]|^ghs/, P: /^gdcm-1|^wdc[sm]/,
    en: 'fills your hand', pay: 'discards or rewards discarding'},
  {id: 'handsize', label: 'Full hand into hand-size payoffs', E: /^gdrm-1|^gth[sm]|^ghsm/, P: /^whs/, en: 'fills your hand', pay: 'counts the cards in your hand'},
  {id: 'aristocrats', label: 'Sacrifice into death triggers', E: /^gscm|^gtkmt/, P: /^wdy[ma]|^wsc[ma]/,
    en: 'sacrifices or makes fodder', pay: 'has a death or sacrifice trigger'},
  {id: 'tokens', label: 'Creatures and tokens entering into enters triggers', E: /^gtkmt|^genm[ct]/, P: /^wenm[ct-]|^wtkm/, en: 'is a creature or makes creature tokens', pay: 'triggers when creatures enter or tokens are made'},
  {id: 'spells', label: 'Spells into cast triggers', E: /^gcam[in]/, P: /^wcam[in-]/, en: 'is an instant, sorcery or other noncreature spell', pay: 'triggers on casting spells'},
  {id: 'landfall', label: 'Extra lands into landfall', E: /^glfm/, P: /^wlf[ma]/, en: 'puts extra lands onto the battlefield', pay: 'has landfall'},
  {id: 'counters', label: '+1/+1 counters into counter payoffs', E: /^gctm/, P: /^wct[ms]/, en: 'puts +1/+1 counters', pay: 'pays off +1/+1 counters'},
  {id: 'lifegain', label: 'Life gain into life-gain triggers', E: /^glgm/, P: /^wlg[ma]/, en: 'gains life', pay: 'triggers on gaining life'},
  {id: 'graveyard', label: 'Filling the graveyard for recursion', E: /^ggym|^gdcm|^gscm/, P: /^wgy/, en: 'puts cards in your graveyard', pay: 'uses cards from your graveyard'},
  {id: 'drawpunish', label: 'Opponents draw into draw punishers', E: /^gdra/, P: /^wdrt/, en: 'makes players draw', pay: 'punishes opponents for drawing'}
];
// how much a card weighs on a side: 1 when it does it again and again, 0.5 once
function chainSide(c, re) {
  let w = 0;
  for (const f of planFacts(c)) if (re.test(f.code)) w = Math.max(w, f.code[5] === '1' ? 1 : 0.5);
  return w;
}
// the card does it from its own text (not only from its type line)
const chainOwn = (c, re) => planFacts(c).some(f => f.src !== 'y' && re.test(f.code));
const PLANC = new Map();
// The deck's chains: [{id, label, E, P, en: [names], pay: [names], thin, strength}], strongest first. A chain counts when it
// has 3+ enabler weight and 3+ payoff weight, or the commander on one side and 2+ on the other; the commander counts x3.
function planOf(d) {
  if (!d) return {chains: [], cover: {}};
  // the deck's list is compared card by card with the one the chains were read from (no string joins: this runs for every
  // upgrade candidate)
  const cards = d.cards || [], k0 = d.id || d.commander || '', hit = PLANC.get(k0);
  if (hit && hit.cmd === d.commander && hit.partner === (d.partner || '') && hit.cards.length === cards.length && cards.every((e, i) => e.n === hit.cards[i] && (e.q || 1) === hit.qs[i]))
    return hit.v;
  const rows = [];
  for (const n of [d.commander, d.partner].filter(Boolean)) {
    const c = find(n);
    if (c) rows.push({c, q: 1, cmd: true});
  }
  for (const e of d.cards || []) {
    const c = find(e.n);
    if (c && !tags(c).land) rows.push({c, q: e.q || 1, cmd: false});
    else if (c) rows.push({c, q: e.q || 1, cmd: false, land: true});
  }
  const chains = [];
  for (const ch of CHAINS) {
    let E = 0, P = 0, cmdSide = '';
    const en = [], pay = [];
    for (const r of rows) {
      if (r.land && ch.id !== 'landfall') continue;   // lands count for landfall only (an enters-tapped land is not an enters trigger)
      const we = chainSide(r.c, ch.E), wp = chainSide(r.c, ch.P), m = r.cmd ? 3 : r.q;
      const own = we && chainOwn(r.c, ch.E);   // a commander counts as the plan's engine only from its own text, not its type line
      if (we) (E += we * m, en.push({n: r.c.n, w: we + (r.cmd && own ? 2 : 0) + (own ? 1 : 0)}), r.cmd && own && (cmdSide += 'E'));
      if (wp) (P += wp * m, pay.push({n: r.c.n, w: wp + (r.cmd ? 2 : 0)}), r.cmd && (cmdSide += 'P'));
    }
    // shown in order: the commander, then cards that do it from their own text again and again, then the rest
    const order = L => L.sort((a, b) => b.w - a.w).map(x => x.n);
    en.splice(0, en.length, ...order(en));
    pay.splice(0, pay.length, ...order(pay));
    const ok = (E >= 3 && P >= 3) || (cmdSide.includes('E') && P >= 2) || (cmdSide.includes('P') && E >= 2);
    if (!ok) continue;
    const thin = E < P / 2 ? 'enablers' : P < E / 3 ? 'payoffs' : '';
    chains.push({id: ch.id, label: ch.label, E, P, en, pay, thin, strength: Math.min(E, P), cmd: cmdSide, ch});
  }
  chains.sort((a, b) => b.strength - a.strength);
  // where the readings came from (nonland cards)
  const cover = {cards: 0, e: 0, r: 0, none: 0};
  for (const r of rows)
    if (!r.land && !r.cmd) {
      const f = planFacts(r.c).filter(x => x.src !== 'y');
      cover.cards++;
      if (!f.length) cover.none++;
      else if (f.some(x => x.src === 'r' || x.src === 'x')) cover.r++;
      else cover.e++;
    }
  const v = {chains, cover};
  PLANC.set(k0, {cmd: d.commander, partner: d.partner || '', cards: cards.map(e => e.n), qs: cards.map(e => e.q || 1), v});
  if (PLANC.size > 50) PLANC.delete(PLANC.keys().next().value);
  return v;
}
// Which of the deck's chains card c joins, and the deck cards it works with there:
// [{id, label, side: 'E'|'P', n, with: [names], thin}] (a card already in the deck leaves itself out)
function chainFit(d, c) {
  if (!d || !c || !(d.cards || []).length) return [];
  const P = planOf(d),
    out = [];
  for (const x of P.chains) {
    const se = chainSide(c, x.ch.E), sp = chainSide(c, x.ch.P);
    if (se) {
      const w = x.pay.filter(n => n !== c.n);
      if (w.length) out.push({id: x.id, label: x.label, side: 'E', n: w.length, with: w, thin: x.thin === 'enablers'});
    }
    if (sp) {
      const w = x.en.filter(n => n !== c.n);
      if (w.length) out.push({id: x.id, label: x.label, side: 'P', n: w.length, with: w, thin: x.thin === 'payoffs'});
    }
  }
  return out.sort((a, b) => b.n - a.n);
}
// ===== Upgrade value (roadmap 6b batch D, UP.chain; design 6b-design.md section 2) =====
// How much card c fills the thin side of one of the deck's chains: 1 when its own text does it again and again, 0.5 once,
// 0 when it only joins a full side or does it from its type line alone (any creature is a creature entering). strValue
// adds UP.chain times this to the card's value. The thin sides are read once per deck reading (planOf's result).
const CH_THIN = new WeakMap();
function chainBonus(d, c) {
  if (!d || !c || !(d.cards || []).length) return 0;
  const P = planOf(d);
  let T = CH_THIN.get(P);
  if (!T) CH_THIN.set(P, (T = {sides: P.chains.filter(x => x.thin).map(x => (x.thin === 'enablers' ? x.ch.E : x.ch.P)), m: new Map()}));
  if (!T.sides.length) return 0;
  let v = T.m.get(c.n);
  if (v !== undefined) return v;
  v = 0;
  for (const re of T.sides) for (const f of planFacts(c)) if (f.src !== 'y' && re.test(f.code)) v = Math.max(v, f.code[5] === '1' ? 1 : 0.5);
  T.m.set(c.n, v);
  return v;
}
// The reason an upgrade shows (text only): "Re-cast for enters and cast triggers: returns creatures to hand for 6 cards in
// the deck". Null when the card joins no chain with 3+ cards on the other side.
function chainWhy(d, c) {
  const f = chainFit(d, c).find(x => x.n >= 3);
  if (!f) return null;
  const ch = CHAINS.find(x => x.id === f.id);
  return f.label + ': ' + (f.side === 'E' ? ch.en : ch.pay) + ', works with ' + f.n + ' cards in the deck';
}
// ===== Plans list (roadmap 6b batch C, UP.planList; design 6b-design.md section 2) =====
// A strong chain is offered as a plan ('plan:<id>' in d.aims) next to the commander's EDHREC themes. Only strong chains:
// 4+ weight on its weaker side and no thin side (a few incidental tokens are not a plan), unless the commander itself is on
// both sides (Anje loots and pays off the discard). Suggested in the build only while the commander has little or no play
// data (buildThemes); a well-known commander keeps its EDHREC themes.
const isPlanAim = a => typeof a === 'string' && a.startsWith('plan:');
const PLAN_TWIN = {aristocrats: 'sacrifice', tokens: 'tokens', spells: 'spells', landfall: 'lands', counters: 'counters', lifegain: 'lifegain', graveyard: 'graveyard', blink: 'blink'};
function planList(d) {
  if (!UP.planList || !d || !(d.cards || []).length) return [];
  return planOf(d).chains.filter(x => x.strength >= 4 && (!x.thin || x.cmd.includes('E') && x.cmd.includes('P')));
}
// How well card c fits the plan: 1 when its own text does it again and again, 0.7 once, 0.5 from its type line only (an
// instant for a spells plan: in the plan, not a reason on its own), as the keyword themes weigh their text and type.
function planAim(c, key) {
  const ch = CHAINS.find(x => 'plan:' + x.id === key);
  if (!ch || !c) return 0;
  let v = 0;
  for (const f of planFacts(c)) if (ch.E.test(f.code) || ch.P.test(f.code)) v = Math.max(v, f.src === 'y' ? 0.5 : f.code[5] === '1' ? 1 : 0.7);
  return v;
}
const planLabel = key => (CHAINS.find(x => 'plan:' + x.id === key) || {label: key.slice(5)}).label;
function planDesc(key) {
  const ch = CHAINS.find(x => 'plan:' + x.id === key);
  return ch ? 'A game plan read from your deck’s cards: cards that ' + ch.en + ' set off cards that ' + ch.pay + '. Suggestions lean toward cards on either side.' : '';
}
