// Card strength and deck power by it (roadmap 6.1, "smarter deck score"; owner, 8 Nov). Off unless UP.str is set.
//
// A card's strength is how often decks that could play it do, across every commander and bracket on EDHREC, weighted toward
// the strong brackets (the card-data job writes it: strength.json). Two ratings per card: with cEDH decks (picks for Apex) and
// without (picks for Budget and Mid). A commander's own optimized and cEDH decks can raise a card for that commander (plan
// cards they keep), never lower it; a card in the commander's precon counts only by how much more than precon owners keep it.
// Cards first printed in the last two months with no rating yet are new, not weak: their strength is the engine's own
// reading of them until play data arrives.
//
// A card's value for a deck: ((1 - fit weight) * strength + fit weight * fit)^curve, fit being the commander's EDHREC synergy.
// Deck power: 0 = replacement level (the deck's lands and median playable spells), 100 = this deck's Apex build, both on the
// same values. The Apex, Mid and Budget builds start from the deck, keep its core (on-plan cards its stronger decks keep), and
// swap its weakest slot for the strongest card allowed (no price cap / $12 / $3) while that gains, never dropping a job below
// what the deck covers.
let STRENGTH = {cards: null, date: '', cmd: new Map()};
// commanders are keyed by their EDHREC page name ("T'Challa, the Black Panther" -> tchalla-the-black-panther)
function strSlug(n) {
  return String(n || '')
    .split(' // ')[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}
function useStrength(blob) {
  if (!blob || !blob.cards) return;
  STRENGTH.cards = new Map(Object.entries(blob.cards).map(([n, v]) => [norm(n), v]));
  STRENGTH.date = blob.date || '';
  if (blob.cmd) for (const [n, v] of Object.entries(blob.cmd)) STRENGTH.cmd.set(n, v);
  STR_C.clear();
}
function useStrengthCmd(slug, data) {
  if (slug && data) STRENGTH.cmd.set(slug, data);
  STR_C.clear();
}
function strengthOn(d) {
  return !!(UP.str && STRENGTH.cards && d && d.format === 'commander' && find(d.commander));
}
const STR_C = new Map(); // per deck settings: the strengths worked out once
function strMonths(a, b) {
  const [ya, ma] = String(a).split('-').map(Number),
    [yb, mb] = String(b).split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
function strIsNew(c) {
  return !!(c && c.nw && STRENGTH.date && !STRENGTH.cards.has(c._n) && strMonths(c.nw, STRENGTH.date.slice(0, 7)) <= 2);
}
function strCtx(d) {
  const E0 = typeof EDH !== 'undefined' ? EDH : null,
    k = d.commander + '|' + (d.partner || '') + '|' + STRENGTH.date + '|' + STRENGTH.cmd.size + '|' + (E0 ? E0.key + ':' + (E0.map ? E0.map.size : 0) : '');
  let X = STR_C.get(k);
  if (X) return X;
  const C = STRENGTH.cmd.get(strSlug(d.commander)) || {},
    pre = EDH && EDH.pre && EDH.pre.list ? new Set(EDH.pre.list.map(norm)) : new Set(d.cards.map(e => norm(e.n)));
  // precon bias per bracket: the 5th-percentile keep rate of the precon's cards is the share of unmodified precons
  const U = {};
  for (const b of ['o', 'c']) {
    const x = C[b];
    if (!x) continue;
    const v = [...pre].map(n => (x[1][n] || 0) / 100).filter(p => p > 0).sort((a, b) => a - b);
    U[b] = v.length >= 20 ? Math.min(0.6, v[Math.floor(v.length * 0.05)]) : 0;
  }
  const local = new Map(),
    keep = new Map();
  for (const b of ['o', 'c']) {
    const x = C[b];
    if (!x) continue;
    for (const [n0, p0] of Object.entries(x[1])) {
      const n = norm(n0);
      let p = p0 / 100;
      if (pre.has(n) && U[b]) p = Math.max(0, p - U[b]) / (1 - U[b]);
      const o = local.get(n) || {num: 0};
      o.num += x[0] * p;
      local.set(n, o);
    }
  }
  const den = 20 + ['o', 'c'].reduce((a, b) => a + ((C[b] && C[b][0]) || 0), 0);
  for (const [b, w] of [['u', 1], ['o', 2]]) {
    const x = C[b];
    if (!x) continue;
    for (const [n0, p] of Object.entries(x[1])) {
      const n = norm(n0),
        o = keep.get(n) || 0;
      keep.set(n, o + w * x[0] * (p / 100));
    }
  }
  const kw = [['u', 1], ['o', 2]].reduce((a, [b, w]) => a + w * ((C[b] && C[b][0]) || 0), 0);
  const E = ctxOf(d).edh;
  X = {local, den, keep: n => (kw ? (keep.get(norm(n)) || 0) / kw : 0), E, vals: new Map()};
  STR_C.set(k, X);
  return X;
}
// strength 0..1 of a card for this deck; casual: the rating without cEDH decks (Budget and Mid picks)
function cardStrength(c, d, casual) {
  if (!c) return 0;
  const v = STRENGTH.cards.get(c._n),
    X = strCtx(d),
    g = v ? v[casual ? 1 : 0] / 100 : strIsNew(c) ? Math.min(0.5, baseScore(c, d, ctxOf(d)).s / 60) : 0,
    l = X.local.get(c._n);
  return Math.min(1, Math.max(g, l ? (0.8 * l.num) / X.den : 0));
}
function strFit(c, d) {
  const E = strCtx(d).E,
    x = E && E.map && edhOf(E.map, c);
  return x ? Math.max(0, Math.min(1, 3 * x.syn)) : 0;
}
function strInc(c, d) {
  const E = strCtx(d).E,
    x = E && E.map && edhOf(E.map, c);
  if (!x) return 0;
  const D = preDeflate(E);
  return Math.max(0, Math.min(1, D.inc(c, x.inc)));
}
function strValue(c, d, casual) {
  if (!c || isBasic(c.n)) return 0;
  const V = strCtx(d).vals,
    k = c._n + (casual ? '|c' : '') + '|' + UP.strFit + '|' + UP.strExp + '|' + UP.strLand + '|' + UP.strInc;
  let v = V.get(k);
  if (v === undefined) {
    const w = UP.strFit;
    // Budget and Mid picks also weigh what this commander's players run (EDHREC play rate, precon bias removed): players
    // upgrading at those prices add the commander's popular cards, not what strong decks of every commander play
    const inc = casual && UP.strInc ? strInc(c, d) : 0,
      base = casual && UP.strInc ? (1 - w - UP.strInc) * cardStrength(c, d, casual) + w * strFit(c, d) + UP.strInc * inc : (1 - w) * cardStrength(c, d, casual) + w * strFit(c, d);
    v = Math.pow(base, UP.strExp) * (tags(c).land ? UP.strLand : 1);
    V.set(k, v);
  }
  return v;
}
// the deck's core: on-plan cards (not general staples, not ramp) that at least half of this commander's upgraded and
// optimized decks keep; at most 12
function deckCore(d) {
  const X = strCtx(d);
  return new Set(
    d.cards
      .map(e => find(e.n))
      .filter(c => c && !tags(c).land && c.n !== d.commander && c.n !== d.partner && !tags(c).roles.has('ramp'))
      .filter(c => ((STRENGTH.cards.get(c._n) || [0])[0] || 0) < 50 && strFit(c, d) >= 0.3 && X.keep(c.n) >= 0.5)
      .sort((a, b) => X.keep(b.n) - X.keep(a.n))
      .slice(0, 12)
      .map(c => c.n)
  );
}
const STR_ROLES = ['ramp', 'draw', 'removal', 'wipe'];
function strSlots(d) {
  return d.cards.flatMap(e => {
    const c = find(e.n);
    return c && c.n !== d.commander && c.n !== d.partner ? Array(e.q).fill(c) : [];
  });
}
// a build from the deck: the weakest slot swapped for the strongest card allowed while it gains (cap: price limit or null)
function strBuild(d, cap, casual, pool, core) {
  const isL = c => tags(c).land,
    A0 = analyze(d),
    need = Object.fromEntries(STR_ROLES.map(r => [r, Math.min(A0.T[r], A0.roles[r])])),
    vv = c => strValue(c, d, casual),
    list = strSlots(d),
    done = [];
  const cand = pool.filter(c => cap == null || (c.p != null && c.p <= cap)).map(c => [c, vv(c)]).sort((a, b) => b[1] - a[1]);
  for (let k = 0; k < 99; k++) {
    const have = new Set(list.map(c => c.n)),
      rc = Object.fromEntries(STR_ROLES.map(r => [r, list.filter(c => tags(c).roles.has(r)).length]));
    let best = null;
    const open = [...new Set(list)].filter(c => !core.has(c.n)).sort((a, b) => vv(a) - vv(b)),
      cutsOf = {true: open.filter(isL), false: open.filter(c => !isL(c))}; // sorted once per pass, weakest first
    for (const [add, vin] of cand) {
      if (have.has(add.n)) continue;
      if (best && vin <= best.g) break;
      for (const cut of cutsOf[isL(add)]) {
        const g = vin - vv(cut);
        if (g <= 1e-4) break;
        if (STR_ROLES.some(r => tags(cut).roles.has(r) && !tags(add).roles.has(r) && rc[r] - 1 < need[r])) continue;
        if (!best || g > best.g) best = {add, cut, g};
        break;
      }
    }
    if (!best) break;
    list[list.indexOf(best.cut)] = best.add;
    done.push({cut: best.cut.n, add: best.add.n});
  }
  return {list, done};
}
const STR_REF = new Map();
// The three builds and the replacement level for a deck (kept per deck settings and card data).
function strengthRef(d) {
  if (!strengthOn(d)) return null;
  const ctx = ctxOf(d),
    k = apexKey(d) + '|' + STRENGTH.date + '|' + STRENGTH.cmd.size + '|' + JSON.stringify([UP.strFit, UP.strExp, UP.strLand, UP.strInc]) + '|' + JSON.stringify(d.cards.map(e => [e.n, e.q]));
  if (STR_REF.has(k)) return STR_REF.get(k);
  const legal = c => legalIn(c, 'commander') && c.ci.every(z => ctx.ident.includes(z)) && c.n !== d.commander && c.n !== d.partner && !isBasic(c.n),
    pool = LIB.filter(legal)
      .map(c => [c, Math.max(strValue(c, d, false), strValue(c, d, true))])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 600)
      .map(x => x[0]),
    core = deckCore(d);
  const apex = strBuild(d, null, false, pool, core),
    mid = strBuild(d, 12, true, pool, core),
    budget = strBuild(d, 3, true, pool, core);
  const sp = LIB.filter(c => !tags(c).land && legal(c))
      .map(c => strValue(c, d, false))
      .sort((a, b) => a - b),
    r0 = sp.length ? sp[Math.floor(sp.length / 2)] : 0,
    slots = strSlots(d),
    nS = slots.filter(c => !tags(c).land).length,
    floor = slots.length ? (nS * r0) / slots.length : 0;
  const R = {key: k, core, apex, mid, budget, floor, top: strMean(d, apex.list)};
  STR_REF.set(k, R);
  if (STR_REF.size > 6) STR_REF.delete(STR_REF.keys().next().value);
  return R;
}
function strMean(d, list) {
  return list.length ? list.reduce((a, c) => a + strValue(c, d, false), 0) / list.length : 0;
}
// Deck power 0..100+ on the strength scale, with the Budget and Mid builds marked the same way; null when off.
function strengthPower(d) {
  const R = strengthRef(d);
  if (!R || R.top <= R.floor) return null;
  const P = list => (100 * (strMean(d, list) - R.floor)) / (R.top - R.floor);
  return {power: P(strSlots(d)), budget: P(R.budget.list), mid: P(R.mid.list), apex: 100, core: [...R.core]};
}
// What one swap does to deck power on this scale (cut -> add, q copies).
function strengthGain(d, cut, add, q) {
  const R = strengthRef(d);
  if (!R || R.top <= R.floor) return null;
  const n = strSlots(d).length || 1,
    dv = (strValue(find(add), d, false) - strValue(find(cut), d, false)) * (q || 1);
  return (100 * (dv / n)) / (R.top - R.floor);
}
