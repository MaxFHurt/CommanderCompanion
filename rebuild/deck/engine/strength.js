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
// fit with the commander's plan: EDHREC synergy on its page, or with the deck's chosen themes (their EDHREC theme pages; the
// first theme counts most, so reordering them steers the picks)
const STR_AIM_W = [1, 0.8, 0.6, 0.5, 0.4];
// how much the deck's themes count: UP.strAim for the commander's own (automatic) themes, UP.strAimSet once the player has
// chosen or reordered them (they asked for those themes to steer the picks)
function strAimW(d) {
  return d.aimAuto === false ? UP.strAimSet : UP.strAim;
}
// how many of the deck's theme pages are loaded (they arrive after the commander's page)
function strTm(d) {
  const E = strCtx(d).E;
  return E && E.tmap ? (d.aims || []).filter(a => isEdhAim(a) && E.tmap[a.slice(4)]).length : 0;
}
function strFit(c, d) {
  const E = strCtx(d).E,
    x = E && E.map && edhOf(E.map, c),
    f0 = x ? Math.max(0, Math.min(1, 3 * x.syn)) : 0;
  const w = strAimW(d);
  if (!w || !(d.aims || []).length) return f0;
  let f = f0;
  (d.aims || []).slice(0, 5).forEach((a, i) => {
    const m = isEdhAim(a) && E && E.tmap && E.tmap[a.slice(4)],
      y = m && edhOf(m, c);
    if (y) f = Math.max(f, Math.min(1, w * STR_AIM_W[i] * Math.max(0, Math.min(1, 3 * y.syn))));
    // a mechanic the card does (or a theme whose page isn't loaded) counts too, a little less
    else if (matchAim(c, a, d.tribe) >= 0.7) f = Math.max(f, Math.min(1, w * STR_AIM_W[i] * 0.5));
  });
  return f;
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
    k = c._n + (casual ? '|c' : '') + '|' + UP.strFit + '|' + UP.strExp + '|' + UP.strLand + '|' + UP.strInc + '|' + strAimW(d) + '|' + (strAimW(d) ? (d.aims || []).join(',') + ':' + strTm(d) : '');
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
  const ident = ctxOf(d).ident,
    isL = c => tags(c).land,
    A0 = analyze(d),
    // UP.strKeepJobs: the deck's own counts are the floor (not only the formula's targets): a 9-mana commander needs more ramp than
    // the minimum, and the deck's finishers and protection are how it wins (owner, 12 Nov: fix the mana first)
    need = Object.fromEntries(STR_ROLES.map(r => [r, UP.strKeepJobs ? A0.roles[r] : Math.min(A0.T[r], A0.roles[r])])),
    winJob = c => isFinisher(c) || tags(c).roles.has('protect'),
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
        // a land only replaces a land whose deck colours it also makes (the Fix menus' rule, Build 137): strong decks of other
        // colours run Polluted Delta and Reliquary Tower, but in a mono-red deck they would take the place of its Mountains
        if (isL(add) && (UP.strLands === 0 || !landCovers(cut, add, ident))) continue;
        if (STR_ROLES.some(r => tags(cut).roles.has(r) && !tags(add).roles.has(r) && rc[r] - 1 < need[r])) continue;
        if (UP.strKeepJobs && winJob(cut) && !winJob(add)) continue;
        if (!best || g > best.g) best = {add, cut, g};
        break;
      }
    }
    if (!best) break;
    const at = list.indexOf(best.cut);
    list[at] = best.add;
    done.push({cut: best.cut.n, add: best.add.n, i: at});
  }
  return {list, done};
}
const STR_REF = new Map();
// The three builds and the replacement level for a deck (kept per deck settings and card data).
function strengthRef(d) {
  if (!strengthOn(d)) return null;
  const ctx = ctxOf(d),
    k = apexKey(d) + '|' + STRENGTH.date + '|' + STRENGTH.cmd.size + '|' + JSON.stringify([UP.strFit, UP.strExp, UP.strLand, UP.strInc, strAimW(d), strTm(d)]) + '|' + JSON.stringify(d.cards.map(e => [e.n, e.q]));
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
  const R = {key: k, core, pool, apex, mid, budget, floor, top: strMean(d, apex.list)};
  STR_REF.set(k, R);
  if (STR_REF.size > 6) STR_REF.delete(STR_REF.keys().next().value);
  return R;
}
// the average strength value of the spells in a deck's strongest build (the scale the score's synergy part reads strength on)
function strTopSpell(d, SR) {
  if (SR.topS == null) {
    const sp = SR.apex.list.filter(c => !tags(c).land);
    SR.topS = sp.length ? sp.reduce((a, c) => a + strValue(c, d, false), 0) / sp.length : 0;
  }
  return SR.topS;
}
// the strength builds scored as players see the score (opt.str), for "What keeps it below the next level"
function strRefParts(d, SR) {
  if (SR.parts) return SR.parts;
  const out = {parts: {}};
  for (const t of ['budget', 'mid', 'apex']) {
    const u = JSON.parse(JSON.stringify(d)),
      cnt = new Map();
    SR[t].list.forEach(c => cnt.set(c.n, (cnt.get(c.n) || 0) + 1));
    delete u.plan;
    u.tier = t;
    u.cards = [...cnt].map(([n, q]) => ({n, q, l: false}));
    const e = evaluateDeck(u, {games: 100, str: true, strRef: SR});
    out[t] = +e.exact.toFixed(2);
    out.parts[t] = e.parts;
  }
  return (SR.parts = out);
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
// The swaps a build makes, against the deck as it stands: slot by slot, what went out and what is there now (a card a build
// put in and later replaced again is not a swap).
function strNet(d, B) {
  const orig = strSlots(d),
    first = new Map(); // slot -> when the build first changed it (its biggest swaps come first)
  B.done.forEach((s, k) => s.i != null && !first.has(s.i) && first.set(s.i, k));
  const out = [];
  B.list.forEach((c, i) => {
    if (orig[i] && c !== orig[i] && c.n !== orig[i].n) out.push({cut: orig[i].n, add: c.n, k: first.has(i) ? first.get(i) : 1e6});
  });
  return out.sort((a, b) => a.k - b.k);
}
// What an upgrade pick may be for this deck: legal, in its colours, not a basic, not already in it (any printing), not ruled
// out by the player (excluded), and inside its own rules (card sets, creature types, keywords marked as must).
function strOk(d) {
  const ctx = ctxOf(d),
    dis = new Set((d.dismissed || []).map(keyOf)),
    inD = new Set(
      d.cards
        .map(e => keyOf(e.n))
        .concat(d.cards.map(e => find(e.n)).filter(Boolean).map(c => keyOf(c.n)), [keyOf(d.commander)], d.partner ? [keyOf(d.partner)] : [])
    );
  return c =>
    !!c && legalIn(c, 'commander') && c.ci.every(z => ctx.ident.includes(z)) && !isBasic(c.n) && !dis.has(c._k) && !dis.has(keyOf(c.n)) && !inD.has(c._k) && !inD.has(keyOf(c.n)) && mustOk(c, d);
}
// The pick builds: the reference builds when nothing rules a card out, else the same builds from the allowed cards only
// (the power scale stays the reference builds').
function strPicks(d, SR) {
  const ok = strOk(d),
    k = SR.key + '|' + JSON.stringify([d.dismissed || [], d.sets || [], !!d.setsMust, d.types || [], !!d.typesMust, d.keys || [], !!d.keysMust]);
  if (SR.picks && SR.picks.k === k) return SR.picks;
  const pool = SR.pool.filter(ok),
    same = pool.length === SR.pool.length;
  const B = same
    ? {apex: SR.apex, mid: SR.mid, budget: SR.budget}
    : {apex: strBuild(d, null, false, pool, SR.core), mid: strBuild(d, 12, true, pool, SR.core), budget: strBuild(d, 3, true, pool, SR.core)};
  SR.picks = {k, pool, apex: strNet(d, B.apex), mid: strNet(d, B.mid), budget: strNet(d, B.budget)};
  return SR.picks;
}
// A generated deck finished on the strength scale (owner, 12 Nov: "I generated an apex deck with heroes in a half shell. It says
// it's deck power 66 with 28 cards on the upgrade page"): deck power and the upgrade list measure a deck against its strength
// builds, so a deck generated at a price level takes that level's strength build's swaps (the same rule-following picks the
// upgrade list shows), again until the build finds nothing more. An Apex deck is then its own Apex build (power 100, no Apex
// rows); Mid and Budget are their builds. Cards in keep (the player's own picks) and locked cards stay. Returns the swaps made.
function strFinish(d, tier, keep) {
  if (!strengthOn(d) || !TIERS[tier]) return 0;
  // Theme first: the theme stays ahead of strength, so an on-theme card is only ever replaced by another on-theme card
  const TH = d.themeFirst ? themeCtx(d) : null,
    onT = c => !!c && themeOf(c, TH),
    themeOk = (cut, add) => !TH || !onT(find(cut)) || onT(find(add));
  const casual = tier !== 'apex',
    cap = TIERS[tier].cap,
    kept = n => keep && keep.has(keyOf(n));
  // practice-game mana (the score's mana part), to check the finished deck against the deck as generated
  const manaOf = () => {
    const S = simulate(d, 200, 7);
    return Math.max(0, Math.min(1, 0.3 * Math.min(1, S.manaUsedBy6 / 19) + 0.15 * S.cmdByT6 + 0.55 * (1 - 0.6 * S.colourStuck - 1.5 * S.screwT5 - S.floodT8)));
  };
  const mana0 = UP.strManaGuard ? manaOf() : 0;
  let n = 0;
  // the generator's land count is the floor (UP.strKeepLands): strength picks are cheaper spells, so the land formula would cut
  // lands, and practice games then came up short of lands more often (Krenko 35 -> 33 lands, mana 100 -> 89)
  const lands0 = analyze(d).lands;
  for (let round = 0; round < 8; round++) {
    const SR = strengthRef(d);
    if (!SR || SR.top <= SR.floor) break;
    const P = strPicks(d, SR),
      L = (P[tier] || []).filter(s => !kept(s.cut) && themeOk(s.cut, s.add));
    let k = 0;
    for (const s of L) {
      const e = entryOf(d, s.cut);
      if (!e || e.l || entryOf(d, s.add)) continue;
      cutCard(d, e.n, 1);
      addCard(d, s.add, 1);
      k++;
    }
    // the swaps change the spells, so the land count follows the deck's own land formula again (the generator's rule): spare
    // basics give way to the strongest spells allowed, or the weakest spells (not the deck's core, not a job it is short of)
    // to basics, whose colours are then split by what the spells need
    const A = analyze(d),
      diff = A.lands - (UP.strKeepLands ? Math.max(A.T.lands, lands0) : A.T.lands);
    if (Math.abs(diff) > 1) {
      const ok = strOk(d),
        vv = c => strValue(c, d, casual);
      if (diff > 1) {
        const adds = SR.pool.filter(c => ok(c) && !tags(c).land && (!TH || onT(c)) && (cap === Infinity || (c.p != null && c.p <= cap))).sort((a, b) => vv(b) - vv(a));
        for (let i = 0; i < diff - 1 && adds[i]; i++) {
          // a spare basic first; a deck without basics (five colours) loses its weakest land instead
          const b =
            d.cards.filter(e => BASICS[e.n] && !e.l).sort((x, y) => y.q - x.q)[0] ||
            d.cards
              .filter(e => !e.l && !kept(e.n) && find(e.n) && tags(find(e.n)).land)
              .sort((x, y) => vv(find(x.n)) - vv(find(y.n)))[0];
          if (!b) break;
          cutCard(d, b.n, 1);
          addCard(d, adds[i].n, 1);
          k++;
        }
      } else {
        const A2 = analyze(d),
          need = r => Math.min(A2.T[r], A2.roles[r]),
          cuts = strSlots(d)
            .filter((c, i, a) => a.indexOf(c) === i && !tags(c).land && !SR.core.has(c.n) && !kept(c.n) && !(TH && onT(c)) && !(entryOf(d, c.n) || {}).l)
            .sort((a, b) => vv(a) - vv(b));
        let left = -diff - 1;
        for (const c of cuts) {
          if (!left) break;
          if (STR_ROLES.some(r => tags(c).roles.has(r) && A2.roles[r] - 1 < need(r))) continue;
          cutCard(d, c.n, 1);
          addCard(d, BASIC_OF[(ctxOf(d).ident || [])[0]] || 'Wastes', 1);
          left--;
          k++;
        }
      }
      try {
        const mp = manaPlan(d);
        if (mp.changes.reduce((a, x) => a + x.delta, 0) === 0) applyMana(d, mp);
      } catch (e) {}
    }
    n += k;
    if (!k) break;
  }
  // mana guard (owner, 12 Nov: "Fix the mana first"): while the finished deck's practice games run worse on mana than the deck as
  // generated did, its weakest spell (not its core, not a job it needs) gives way to a land of the colour its spells need most,
  // kept only when the games get better; at most three lands
  if (n && UP.strManaGuard) {
    const SR = strengthRef(d);
    let m = manaOf();
    for (let i = 0; i < 3 && SR && m < mana0 - 0.005; i++) {
      const A2 = analyze(d),
        vv = c => strValue(c, d, casual),
        cut = strSlots(d)
          .filter((c, j, a) => a.indexOf(c) === j && !tags(c).land && !SR.core.has(c.n) && !kept(c.n) && !(entryOf(d, c.n) || {}).l)
          .filter(c => !STR_ROLES.some(r => tags(c).roles.has(r) && A2.roles[r] - 1 < Math.min(A2.T[r], A2.roles[r])))
          .sort((a, b) => vv(a) - vv(b))[0];
      if (!cut) break;
      const mp = manaPlan(d),
        col = Object.keys(mp.want || {}).sort((a, b) => (mp.want[b] || 0) - (mp.have[b] || 0) - ((mp.want[a] || 0) - (mp.have[a] || 0)))[0],
        land = BASIC_OF[col] || BASIC_OF[(ctxOf(d).ident || [])[0]] || 'Wastes',
        snap = JSON.stringify(d.cards);
      cutCard(d, cut.n, 1);
      addCard(d, land, 1);
      const m2 = manaOf();
      if (m2 <= m) {
        d.cards = JSON.parse(snap);
        break;
      }
      m = m2;
      n++;
    }
  }
  // the basics' colours follow what the new spells need (the generator's split was for its own spells)
  // (only a re-split: a plan that would also change how many lands there are is left out)
  if (n)
    try {
      const mp = manaPlan(d);
      if (mp.changes.length && mp.changes.reduce((a, x) => a + x.delta, 0) === 0) applyMana(d, mp);
    } catch (e) {}
  return n;
}
// A swap's change in power on the strength scale (strengthGain), with each card's value worked out once: for lists that
// measure many swaps (the upgrade list, the Fix menus, See alternatives). Null when strength is off.
function strGainFn(d, SR) {
  SR = SR || strengthRef(d);
  if (!SR || SR.top <= SR.floor) return null;
  const VA = new Map(),
    va = n => {
      let v = VA.get(n);
      if (v === undefined) VA.set(n, (v = strValue(find(n), d, false)));
      return v;
    },
    gk = 100 / ((strSlots(d).length || 1) * (SR.top - SR.floor));
  return (cut, add, q) => (va(add) - va(cut)) * gk * (q || 1);
}
// The upgrade list from the strength builds (UP.str): one row per card the Apex build replaces, biggest gain first (at most
// UP.strRows), each with that row's Apex pick and, where the Mid and Budget builds replace the same card, their picks.
// The Apex pick is the strongest of the row's picks, Mid the stronger of Mid and Budget; no card is picked on two rows (the
// next best card for the slot takes its place); held picks (a chosen alternative) are kept; each tier lists up to three
// alternatives that keep at least half its pick's gain. A pick's dScore is its change in deck power on this scale, so the
// chips and sheets read it as power. Spare-land rows from the regular list stay, measured the same way.
function strengthPaths(d, R) {
  const SR = strengthRef(d);
  if (!SR || !R) return R;
  const P = strPicks(d, SR),
    ok = strOk(d),
    A0 = analyze(d),
    E = strCtx(d).E;
  const rate = n => {
    const c = find(n),
      v = c && STRENGTH.cards.get(c._n);
    return v ? v[0] : strIsNew(c) ? null : 0;
  };
  const gain = strGainFn(d, SR);
  const inc = c => {
    const x = E && E.map && edhOf(E.map, c);
    return x ? +x.inc.toFixed(3) : 0;
  };
  const priceOk = (c, t) => t === 'apex' || (c.p != null && underCap(c.p, t));
  // a card may take a slot if it is a land for a land, and it doesn't drop a job (ramp, draw, removal, wipes) below what the
  // deck needs
  const fits = (cutC, c) => {
    if (!cutC || !c || !!tags(cutC).land !== !!tags(c).land) return false;
    if (tags(c).land && (UP.strLands === 0 || !landCovers(cutC, c, ctxOf(d).ident))) return false;
    return !STR_ROLES.some(r => tags(cutC).roles.has(r) && !tags(c).roles.has(r) && A0.roles[r] - 1 < Math.min(A0.T[r], A0.roles[r]));
  };
  const pick = (cut, add, t, held) => {
    const r = rate(add),
      g = gain(cut, add);
    return {
      cut,
      add,
      q: 1,
      t,
      gain: g,
      dScore: g,
      str: true,
      held: !!held,
      why: [r == null ? 'New card: too new for play data; read by what it does' : 'Card strength ' + r + ' of 100 (how often strong decks that could play it do)'],
      cutWhy: ['Card strength ' + (rate(cut) ?? 0) + ' of 100' + (SR.core.has(cut) ? '' : ', not part of this deck’s core')],
      gc: !!(find(add) || {}).gc,
      gcOut: !!(find(cut) || {}).gc,
      own: false,
      smart: true
    };
  };
  // held picks: a chosen alternative stays that tier's pick while its slot card is in the deck and it may still go in
  const held = new Map();
  for (const k in d.recP || {}) {
    const r = d.recP[k],
      p = r && r.pair;
    if (!p || !TIERS[r.t] || !entryOf(d, p.cut) || !ok(find(p.add))) continue;
    const cut = entryOf(d, p.cut).n;
    if (!held.has(cut)) held.set(cut, {});
    held.get(cut)[r.t] = p.add;
  }
  const by = L => new Map(L.map(s => [s.cut, s.add])),
    T = {apex: by(P.apex), mid: by(P.mid), budget: by(P.budget)};
  // a row for every card any of the three builds replaces (and every held pick's slot)
  // a deck over its land target keeps the regular list's spare-land rows: they claim their land before any strength row
  const spareCut = new Set((R.paths || []).filter(L => L.spare).map(L => L.cut));
  const cuts = [...new Set(P.apex.concat(P.mid, P.budget).map(s => s.cut).concat([...held.keys()]))].filter(c => !spareCut.has(c) || held.has(c));
  let rows = cuts
    .map(cut => {
      const H = held.get(cut) || {},
        o = {};
      for (const t of ['apex', 'mid', 'budget']) {
        const n = H[t] || T[t].get(cut);
        if (n && find(n)) o[t] = pick(cut, n, t, !!H[t]);
      }
      // Apex is the row's strongest pick, Mid the stronger of Mid and Budget (each within its price)
      const best = (ts, t) => ts.map(x => o[x]).filter(p => p && priceOk(find(p.add), t)).sort((a, b) => b.dScore - a.dScore)[0];
      if (!H.apex) {
        const b = best(['apex', 'mid', 'budget'], 'apex');
        if (b) o.apex = Object.assign({}, b, {t: 'apex'});
      }
      if (!H.mid) {
        const b = best(['mid', 'budget'], 'mid');
        if (b) o.mid = Object.assign({}, b, {t: 'mid'});
      }
      return {cut, opts: o, none: false, gain: o.apex ? o.apex.dScore : 0, str: true, ranked: true};
    })
    .filter(L => L.opts.apex || L.opts.mid || L.opts.budget);
  // each tier ranks rows by its own pick's gain as that tier values cards (Mid and Budget: the casual rating with this
  // commander's play rate), so a Mid deck's list leads with the Mid build's biggest swaps; the deck's own tier sets the order
  const tierOf = t => (TIERS[t] ? t : 'apex'),
    showP = (L, t) => tierPick(L, t), // the card the row shows at that tier
    ord = {},
    keyT = (L, t) => {
      // the build's own order first (its biggest swaps lead), then any other row by its gain
      const p = showP(L, t);
      if (!p) return -1e9;
      const k = ord[t].get(L.cut + '>' + p.add);
      return k != null ? 1000 - k : t === 'apex' ? p.dScore : strValue(find(p.add), d, true) - strValue(find(p.cut), d, true);
    },
    dt = tierOf(d.tier);
  for (const t of ['apex', 'mid', 'budget']) ord[t] = new Map(P[t].map((x, k) => [x.cut + '>' + x.add, k]));
  rows.sort((a, b) => keyT(b, dt) - keyT(a, dt));
  // no card on two rows: a row whose pick is already on a stronger row takes the next best card for its slot instead
  const used = new Map(); // card -> its row
  rows.forEach(L => Object.values(L.opts).forEach(p => p.held && used.set(p.add, L))); // a held pick keeps its card
  const nextFor = (L, t, avoid) => {
    const cutC = find(L.cut);
    let b = null;
    for (const c of P.pool) {
      if (avoid.has(c.n) || (used.has(c.n) && used.get(c.n) !== L) || !priceOk(c, t) || !fits(cutC, c)) continue;
      const g = gain(L.cut, c.n);
      if (g > SCORE_MIN && (!b || g > b.g)) b = {c, g};
    }
    return b && pick(L.cut, b.c.n, t);
  };
  const tOrder = [dt].concat(['apex', 'mid', 'budget'].filter(t => t !== dt));
  // tier by tier, the deck's own tier first: every row keeps its pick at that tier before the other tiers claim cards
  for (const t of tOrder)
    rows.forEach(L => {
      const p = L.opts[t];
      if (!p) return;
      if (!p.held && used.has(p.add) && used.get(p.add) !== L) {
        const r = nextFor(L, t, new Set([p.add]));
        if (r) L.opts[t] = r;
        else delete L.opts[t];
      }
      if (L.opts[t]) used.set(L.opts[t].add, L);
    });
  rows.forEach(L => {
    // one card per row: a cheaper tier showing the Apex card falls back to it (the row shows each card once); a pick that
    // would lower power on this scale (a casual pick can) takes the next best card or leaves the tier to the one above
    for (const t of ['mid', 'budget']) {
      const p = L.opts[t];
      if (!p || p.held) continue;
      if (p.dScore < SCORE_MIN && !UP.strKeepNeg) {
        const r = nextFor(L, t, new Set(Object.values(L.opts).map(x => x.add)));
        if (r) L.opts[t] = r;
        else delete L.opts[t];
      }
    }
    // Apex stays the strongest after every replacement
    for (const t of ['mid', 'budget']) {
      const p = L.opts[t],
        ap = L.opts.apex;
      if (p && (!ap || (!ap.held && p.dScore > ap.dScore))) L.opts.apex = Object.assign({}, p, {t: 'apex'});
    }
    if (L.opts.mid && L.opts.apex && L.opts.mid.add === L.opts.apex.add && !L.opts.mid.held) delete L.opts.mid;
    if (L.opts.budget && [L.opts.apex, L.opts.mid].some(x => x && x.add === L.opts.budget.add) && !L.opts.budget.held) delete L.opts.budget;
    for (const t of ['apex', 'mid', 'budget']) if (L.opts[t]) used.set(L.opts[t].add, L);
    L.gain = L.opts.apex ? L.opts.apex.dScore : Math.max(...Object.values(L.opts).map(p => p.dScore));
  });
  rows = rows.filter(L => L.opts.apex || L.opts.mid || L.opts.budget);
  // the list: each tier's strongest UP.strRows rows, in the deck's own tier order
  {
    const keep = new Set();
    for (const t of ['apex', 'mid', 'budget'])
      rows
        .filter(L => showP(L, t))
        .sort((a, b) => keyT(b, t) - keyT(a, t))
        .slice(0, UP.strRows)
        .forEach(L => keep.add(L));
    rows = rows.filter(L => keep.has(L));
    rows.forEach(L => (L.rk = {apex: keyT(L, 'apex'), mid: keyT(L, 'mid'), budget: keyT(L, 'budget')}));
    rows.sort((a, b) => b.rk[dt] - a.rk[dt]);
  }
  const TC = d.stick && typeof themeCtx === 'function' ? themeCtx(d) : null,
    aimsT = (d.aims || []).filter(a => a !== 'tribal'),
    tribe = ctxOf(d).tribe,
    onTheme = c => !!TC && (!!themeOf(c, TC) || aimsT.some(a => matchAim(c, a, tribe) >= 0.7) || (!!tribe && matchAim(c, 'tribal', tribe) >= 0.7));
  // every on-theme card the deck allows (not only the strongest cards), worked out once
  let TP = null;
  const themePool = () => TP || (TP = LIB.filter(c => ok(c) && onTheme(c)));
  // alternatives: the next strongest cards for the slot at each tier's price, up to three, each keeping at least half the
  // pick's gain; the strongest card measured for the slot is the row's Highest score card
  rows.forEach(L => {
    const cutC = find(L.cut),
      names = new Set(Object.values(L.opts).map(p => p.add)),
      C = P.pool
        .filter(c => fits(cutC, c))
        .map(c => ({c, g: gain(L.cut, c.n)}))
        .filter(x => x.g > SCORE_MIN)
        .sort((a, b) => b.g - a.g);
    L.alts = {apex: [], mid: [], budget: []};
    for (const t of ['apex', 'mid', 'budget']) {
      const tp = L.opts[t] || L.opts.mid || L.opts.apex;
      if (!tp) continue;
      L.alts[t] = C.filter(x => !names.has(x.c.n) && priceOk(x.c, t) && x.g >= 0.5 * tp.dScore && x.g <= tp.dScore + 1e-9)
        .slice(0, 3)
        .map(x => ({n: x.c.n, p: x.c.p, dScore: x.g, inc: inc(x.c), vs: tp.add, vsScore: tp.dScore, str: true}));
    }
    const top = C[0];
    L.top = top ? {n: top.c.n, p: top.c.p, dScore: top.g, inc: inc(top.c)} : null;
    // Stick to the theme: the slot's strongest on-theme cards, for stickTheme to choose from
    if (d.stick)
      L.finds = themePool()
        .filter(c => fits(cutC, c))
        .map(c => ({c, g: gain(L.cut, c.n)}))
        .filter(x => x.g > SCORE_MIN)
        .sort((a, b) => b.g - a.g)
        .slice(0, 4)
        .map(x => ({n: x.c.n, dScore: x.g}));
  });
  // spare lands (a deck over its land target) come from the regular list, measured on this scale
  const spare = (R.paths || [])
    .filter(L => L.spare && !rows.some(x => x.cut === L.cut))
    .map(L => {
      Object.values(L.opts).forEach(p => {
        p.dScore = gain(p.cut || L.cut, p.add);
        p.str = true;
      });
      return L;
    })
    .filter(L => {
      // a card already picked on another row, or one that doesn't raise power, is not offered here
      for (const t of Object.keys(L.opts)) {
        const p = L.opts[t];
        if (!used.has(p.add) && p.dScore >= SCORE_MIN) continue;
        // its card went to another row (or doesn't raise power): the strongest spell for the spare land at that tier's price
        let b = null;
        for (const c of P.pool) {
          if (tags(c).land || used.has(c.n) || Object.values(L.opts).some(x => x.add === c.n) || !(t === 'apex' || (c.p != null && underCap(c.p, t)))) continue;
          const g = gain(L.cut, c.n);
          if (g >= SCORE_MIN && (!b || g > b.g)) b = {c, g};
        }
        if (b) L.opts[t] = Object.assign({}, p, {add: b.c.n, dScore: b.g, gain: b.g, why: ['Card strength: uses a spare land'], str: true});
        else delete L.opts[t];
      }
      const ps = Object.values(L.opts);
      ps.forEach(p => used.set(p.add, L));
      return ps.length > 0;
    });
  R.paths = rows.concat(spare);
  // every other swap the list shows (health-alert fixes, alternatives) is measured on the same scale; one that would lower
  // deck power is not offered as an upgrade (fixes the deck needs anyway, like an illegal card, stay)
  const seenObj = new Set(),
    walk = o => {
      if (!o || typeof o !== 'object' || seenObj.has(o)) return;
      seenObj.add(o);
      if (typeof o.cut === 'string' && typeof o.add === 'string' && !o.str) {
        o.dScore = gain(o.cut, o.add) * (o.q || 1);
        o.str = true;
      }
      for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v);
    };
  for (const k of ['fixes', 'fills', 'drops', 'smart']) walk(R[k]);
  for (const k of ['fills', 'smart']) if (Array.isArray(R[k])) R[k] = R[k].filter(p => !p || typeof p.dScore !== 'number' || p.dScore >= 0);
  // Stick to the theme (a deck setting): each row's pick becomes its strongest on-theme card that still raises power
  if (d.stick && typeof stickTheme === 'function')
    try {
      stickTheme(d, R);
      // a row with no on-theme card that raises power leaves the list while the setting is on (spare-land rows stay)
      R.paths = R.paths.filter(L => {
        // a spare-land row keeps only its on-theme picks
        if (L.spare) for (const t of Object.keys(L.opts)) if (!onTheme(find(L.opts[t].add))) delete L.opts[t];
        return Object.values(L.opts).some(p => p && onTheme(find(p.add)));
      });
    } catch (e) {}
  R.str = true;
  return R;
}
