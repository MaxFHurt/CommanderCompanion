// ----- whole-deck evaluator -----
// Five scores out of 100, weighted into one: synergy 30, balance 25, card quality 20, win routes and resilience 15, mana
// and curve 10. Each part says what drove it. It judges a finished list; it does not choose cards. Raw measures are mapped
// to 0–100 by anchors fitted on ~6,700 real player decks (EV_ANCHOR: the raw value of a typical deck → 60, of a top-tenth
// deck → 85), so 60 means "like a typical real deck for its commander" and 85 "like the best tenth".
const EV_W = {synergy: 30, balance: 25, quality: 20, routes: 15, mana: 10};
let EV_ANCHOR = {
  synergy: [0.642, 0.793],
  balance: [0.818, 0.967],
  quality: [0.344, 0.401],
  routes: [0.675, 0.88],
  mana: [0.745, 0.824]
};
const FINISH_RE =
  /you win the game|(target player|each opponent|that player) loses the game|creatures you control get \+([2-9]|x)\/|(other )?creatures you control (gain|have) (double strike|trample|flying)|additional combat phase|takes? an extra turn|double (the )?(damage|power)|deals? (double|twice|triple) th|deals? (x|\d+|that much) damage to each opponent|each opponent loses (x|[2-9]|\d\d|that much|half)|(whenever|at the beginning)[^.]*,[^.]*each opponent loses \d+ life|\binfect\b/i;
const RECUR_RE =
  /return (target|up to (one|two)|a|all|each|it|that card)[^.]*from (your|a) graveyard to (the battlefield|your hand)|(cast|play) [^.]*from your graveyard|shuffle your graveyard into/i;
// Synergy, balance and mana are health checks: past "enough" (about the top quarter of real decks) more does not make a
// deck stronger, so they saturate. Card quality and win routes keep rising: among healthy decks they separate strong from weak.
let EV_SUFF = {synergy: 0.72, balance: 1, mana: 0.81};
function evScale(v, a) {
  const [mid, top] = a,
    s = top > mid ? (v - mid) / (top - mid) : 0;
  return Math.max(0, Math.min(100, 60 + 25 * s));
}
// Reanimation engines (owner, 18 Oct): a card that brings creatures back every turn (The Soul Stone once harnessed, Sheoldred) or
// all at once (Living Death, Rise of the Dark Realms) is recursion and, with UP.reF, a way to win.
const REANIM_EVERY =
    /(at the beginning of|whenever)[^.]*return (target|a|up to one target) creature card from your graveyard to the battlefield/i,
  REANIM_ALL =
    /(puts all cards they exiled this way|returns? all creature cards from (your|all|their) graveyards?|put all creature cards from all graveyards) (onto|to) the battlefield/i;
function isReanimEngine(c) {
  const o = (c && c.o) || '';
  return REANIM_EVERY.test(o) || REANIM_ALL.test(o);
}
// Score blind spots (UP.bs, owner's plan of 18 Oct): a creature that is a finisher only for its size counts UP.bsF of one that closes
// the game by what it does, and a card costing UP.bsP or more is not counted as protection (it can't be held up).
function finByText(c) {
  const o = c.o || '';
  return (FINISH_RE.test(o) && !/^Extort/m.test(o)) || (!!UP.reF && isReanimEngine(c));
}
function isFinisher(c) {
  if (c._fin !== undefined) return c._fin;
  const o = c.o || '',
    t = frontType(c),
    pw = parseInt(String(c.pt || '').split('/')[0], 10) || 0;
  return (c._fin =
    (FINISH_RE.test(o) && !/^Extort/m.test(o)) ||
    (/Creature/.test(t) && pw >= 6 && /flying|trample|can't be blocked|haste|menace/i.test(o)) ||
    (/Creature/.test(t) && pw >= 8) ||
    (!!UP.reF && isReanimEngine(c)));
}
// Card quality against the Apex build. The Apex build for this deck (same commander or pair, mechanics in order, filters,
// colours) is the 100% mark; a deck of random playable cards in its colours is 0%. A card's value is the one generation and
// upgrades use (baseScore: what this commander's players run, its fit with the mechanics, how proven it is). Spells only:
// lands are judged under mana and curve. Also the best build with every card under $12 and under $3 (Mid and Budget), so
// a budget deck is measured against what its price limit allows. The reference depends on the build settings, not on the
// deck's cards, so it is worked out once per settings (apexKey) and reused while cards change.
// (LIB.full: a helper core holds only a slice of the library and is told the whole library's size, so its keys match; Build 144)
function apexKey(d) {
  return JSON.stringify([
    d.commander,
    d.partner || '',
    d.aims,
    d.tribe || '',
    d.colors,
    d.types || [],
    d.keys || [],
    d.typesMust,
    d.keysMust,
    d.sets || [],
    d.setsMust,
    EDH.key,
    EDH.state,
    Object.keys(EDH.tmap || {}).length,
    LIB.full || LIB.length
  ]);
}
// A spell's value for card quality: baseScore, with the commander's play rates counted among players who changed the deck
// (untouched precon copies taken out, preDeflate), so a precon card is not "great" merely because the precon ships with it.
// How much raw card power (how widely played across all of Commander) adds to a card's quality value. 40 orders real decks
// by declared power bracket and by price (checked on ~280 bracket-labelled decks); without it typical-for-the-commander wins.
let QPOW = 40;
function qualVal(c, d, ctx) {
  let v = baseScore(c, d, ctx).s;
  const E = ctx.edh,
    x = E && edhOf(E.map, c);
  if (x) {
    const D = preDeflate(E);
    v += W_INC * (D.inc(c, x.inc) - x.inc);
  }
  if (QPOW) v += QPOW * (CORE.has(c._n) ? 1 : c.r ? Math.max(0, 1 - Math.log(c.r + 1) / Math.log(40000)) : 0.35);
  return v;
}
function spellMean(cards, d, ctx, vf) {
  let t = 0,
    n = 0;
  cards.forEach(e => {
    const c = typeof e === 'string' ? find(e) : find(e.n),
      q = typeof e === 'string' ? 1 : e.q;
    if (!c || (tags(c).land && !(UP.tl && tourneyOf(c, d) === 'land'))) return;
    t += (vf ? vf(c) : qualVal(c, d, ctx)) * q;
    n += q;
  });
  return n ? t / n : 0;
}
function apexRef(d) {
  if (d.format !== 'commander' || !find(d.commander)) return null;
  // the same settings give the same reference build: kept for the last few (polishing asks for it again; Build 141)
  // (Build 145) everything the build reads goes in the key: the settings, combos, bracket lists, set lists and fallback pages too
  const ck =
    apexKey(d) +
    '|' +
    LIB.length +
    '|' +
    ((EDH && EDH.key) || '') +
    '|' +
    ((EDH && EDH.map && EDH.map.size) || 0) +
    '|' +
    Object.keys((EDH && EDH.tmap) || {}).join(',') +
    '|' +
    ((EDH && EDH.fall) || []).map(f => f.slug).join(',') +
    '|' +
    COMBOS.list.length +
    '|' +
    COMBOS.at +
    '|' +
    BTAGS.v +
    '|' +
    [...SETCARDS].map(([k, v]) => k + ':' + v.size).join() +
    '|' +
    JSON.stringify(UP);
  apexRef.cache = apexRef.cache || new Map();
  if (apexRef.cache.has(ck)) return apexRef.cache.get(ck);
  const out = apexRef0(d);
  apexRef.cache.set(ck, out);
  if (apexRef.cache.size > 4) apexRef.cache.delete(apexRef.cache.keys().next().value);
  return out;
}
function apexRef0(d) {
  const nd = JSON.parse(JSON.stringify(d));
  nd.cards = [];
  nd.tier = 'apex';
  delete nd.plan;
  nd.recP = {};
  const was = buildPlan.inRef;
  buildPlan.inRef = true;
  let plan;
  try {
    plan = buildPlan(nd, [], null, new Set());
  } finally {
    buildPlan.inRef = was;
  } // the reference build is never polished
  const ctx = ctxOf(d),
    pick = t => plan.map(x => ({n: planPick(x, t), q: x.q}));
  const pool = LIB.filter(
      c =>
        !tags(c).land &&
        c.r &&
        legalIn(c, 'commander') &&
        c.ci.every(z => ctx.ident.includes(z)) &&
        mustOk(c, d) &&
        c.n !== d.commander &&
        c.n !== d.partner
    ),
    r = rng32(7),
    sample = [];
  for (let i = 0; i < Math.min(400, pool.length); i++) sample.push(pool[Math.floor(r() * pool.length)].n);
  return {
    key: apexKey(d),
    cards: {apex: pick('apex'), mid: pick('mid'), budget: pick('budget'), floor: sample.map(n => ({n, q: 1}))}
  };
}
// Deck power of the reference builds: the Budget, Mid and Apex builds for this deck's settings, each scored as a whole deck by
// evaluateDeck (the same score the player's deck gets). Apex progress places the player's deck on this scale, Apex = 100.
function refScores(d, AR) {
  if (!AR || !AR.cards) return null;
  const out = {parts: {}}; // each build's parts too: what a deck lacks against the next level (owner, 25 Oct)
  for (const t of ['budget', 'mid', 'apex']) {
    const u = JSON.parse(JSON.stringify(d));
    delete u.plan;
    u.tier = t;
    u.cards = AR.cards[t].filter(x => x && x.n).map(x => ({n: x.n, q: x.q, l: false}));
    try {
      const e = evaluateDeck(u, {apex: AR, games: 100});
      out[t] = +e.exact.toFixed(2);
      out.parts[t] = e.parts;
    } catch (e) {
      return null;
    }
  }
  return out;
}
// The reference means for a deck, with a value function (the deck's own upgrade values when given).
// The reference builds' card values depend only on the deck's settings and the card values used, never on the deck's own cards,
// so they are kept per reference build and settings (Build 142, speed): a swap being measured reuses them. Same numbers, less work.
function apexMeans(AR, d, ctx, vf) {
  const C = apexMeans.C || (apexMeans.C = new WeakMap());
  let M = C.get(AR);
  if (!M) {
    M = new Map();
    C.set(AR, M);
  }
  const vid = vf ? vf.__id || (vf.__id = ++apexMeans.n) : 0,
    k = JSON.stringify([
      vid,
      d.format,
      d.tier,
      d.aims,
      d.types,
      d.keys,
      d.typesMust,
      d.keysMust,
      d.sets,
      d.setsMust,
      d.themeFirst,
      d.prevCmd,
      d.commander,
      d.partner,
      ctx.tribe,
      ctx.cmdTribe,
      ctx.focus,
      ctx.ident,
      ctx.cmdThemes,
      ctx.edh ? [ctx.edh.key, ctx.edh.decks, ctx.edh.map && ctx.edh.map.size, Object.keys(ctx.edh.tmap || {})] : 0,
      UP,
      W_INC,
      W_SYN,
      POP_K,
      AIM_K,
      STAPLE_K,
      QPOW
    ]);
  if (M.has(k)) return M.get(k);
  const m = L => spellMean(L, d, ctx, vf),
    out = {apex: m(AR.cards.apex), mid: m(AR.cards.mid), budget: m(AR.cards.budget), floor: m(AR.cards.floor)};
  if (M.size > 50) M.clear();
  M.set(k, out);
  return out;
}
apexMeans.n = 0;
// Share of the way from the floor (random playable cards) to a reference build, 0–100.
function qualityPct(mean, ref, floor) {
  return ref > floor ? Math.max(0, Math.min(100, Math.round((100 * (mean - floor)) / (ref - floor)))) : 0;
}
function evaluateDeck(d, opt) {
  opt = opt || {};
  const A = analyze(d),
    ctx = A.ctx,
    E = ctx.edh,
    why = {},
    spells = [];
  d.cards.forEach(e => {
    const c = find(e.n);
    if (c && !tags(c).land) for (let i = 0; i < e.q; i++) spells.push(c);
  });
  const n = Math.max(1, spells.length);
  // Synergy: how much this commander's players (and, for chosen EDHREC themes, that theme's players) run each spell, plus
  // EDHREC's synergy (how much more than in other decks). Without play data: share of spells that fit a chosen mechanic.
  let syn = 0;
  const aims = (d.aims || [])
    .filter(isEdhAim)
    .map((a, i) => ({m: E && E.tmap && E.tmap[a.slice(4)], w: AIM_W[i] || 1}))
    .filter(x => x.m);
  const pre = E && E.pre && E.pre.list && E.pre.list.length ? E.pre : null,
    PD = preDeflate(E),
    u = PD.u,
    preK = PD.preK; // see preDeflate
  const preCut = new Map(pre ? pre.cut.map((n, i) => [keyOf(n), i]) : []);
  const incOf = c => {
    const x = edhOf(E.map, c);
    if (!x) return null;
    const pc = preK.has(c._k);
    let inc = pc ? Math.max(0, x.inc - u) / (1 - u) : Math.min(1, x.inc / (1 - u)),
      sy = pc ? x.syn - u : x.syn;
    if (preCut.has(c._k)) inc *= 0.5 + (0.5 * preCut.get(c._k)) / Math.max(1, preCut.size);
    return {inc, syn: sy};
  };
  // Per spell: the best of (a) it does one of the chosen mechanics (first counts most) or the commander's own strategy, and
  // (b) EDHREC synergy, how much more this commander's players run it than other decks of its colours. Popularity alone
  // is not synergy: a precon card is "popular" because the precon ships with it.
  const AWv = [1, 0.85, 0.7, 0.6, 0.5],
    aimL = (d.aims || []).slice(0, 5),
    hasE = !!(E && E.map && E.map.size >= 40);
  const fitOf = c => {
    let f = 0;
    aimL.forEach((a, i) => {
      if (matchAim(c, a, ctx.tribe) >= 0.7) f = Math.max(f, AWv[i]);
    });
    if (!f && ctx.cmdThemes.some(a => matchAim(c, a, ctx.cmdTribe) >= 1)) f = 0.7;
    return f;
  };
  const synOf = c => {
    const x = hasE ? incOf(c) : null,
      l = x ? Math.max(0, Math.min(1, 3 * x.syn + 0.25 * x.inc)) : 0;
    let t = 0;
    if (aims.length) {
      let tw = 0,
        tv = 0;
      aims.forEach(a => {
        const y = edhOf(a.m, c);
        tw += a.w;
        tv += a.w * (y ? Math.min(1, y.inc * 1.5) : 0);
      });
      t = tv / tw;
    }
    return Math.max(fitOf(c), l, t);
  };
  spells.forEach(c => (syn += synOf(c)));
  syn /= n;
  why.synergy =
    spells.filter(c => synOf(c) >= 0.5).length +
    ' of ' +
    n +
    ' spells work with ' +
    (ctx.cmd ? ctx.cmd.n.split(',')[0] : 'the deck') +
    '’s plan' +
    (aimL.length
      ? ' (' +
        aimL
          .slice(0, 3)
          .map(a => aimLabel(a, ctx.tribe))
          .join(', ') +
        ')'
      : '');
  // Balance: the deck's jobs against what this commander's players run (roleNeeds), and lands against the target. A short
  // role costs per missing card; an overfull one costs a little (those slots could do something else).
  const short = [],
    over = [];
  let pen = 0;
  // Targets are what this commander's players run, so one card either side is normal; past that, each missing card costs.
  // The targets are what this commander's players run, with untouched precon copies taken out (roleNeeds with UP.rdef on):
  // judged by the players who changed the deck. The upgrade engine keeps its own targets (rdef off measured better there).
  const T = Object.assign({}, A.T);
  if (hasE && d.format === 'commander') {
    const sv = UP.rdef;
    UP.rdef = 1;
    try {
      const N = roleNeeds(E);
      if (N) ['ramp', 'draw', 'removal', 'wipe'].forEach(r => (T[r] = N[r]));
    } finally {
      UP.rdef = sv;
    }
  }
  ['ramp', 'draw', 'removal', 'wipe'].forEach(r => {
    const have = A.roles[r],
      want = T[r],
      tol = r === 'wipe' ? 0 : 1;
    if (have < want - tol) {
      pen += ((want - tol - have) / Math.max(3, want)) * (r === 'wipe' ? 0.6 : 1);
      short.push(ROLE_LABEL[r] + ' ' + have + '/' + want);
    } else if (have > want * 1.8 + 2) {
      pen += 0.1;
      over.push(ROLE_LABEL[r] + ' ' + have);
    }
  });
  const ramp = A.roles.ramp - T.ramp,
    ld = A.lands - T.lands + (ramp > 2 ? Math.min(2, (ramp - 2) / 3) : 0); // extra ramp stands in for a land or two
  // UP.rld 2 (Build 143): extra ramp makes up for missing lands, but does not count as flood: whether ramp floods the deck is
  // what the mana part's practice games measure, and counting it here too marked down the cheap ramp players add
  if (ld < -1) pen += (-ld - 1) * 0.15;
  else if ((UP.rld === 2 ? A.lands - T.lands : ld) > 2) pen += ((UP.rld === 2 ? A.lands - T.lands : ld) - 2) * 0.06;
  const inter = spells.filter(c => {
    const r = tags(c).roles;
    return r.has('removal') || r.has('wipe') || r.has('counter');
  }).length;
  if (inter < 8) pen += (8 - inter) * 0.03;
  // Cards whose condition the deck barely meets (Divine Visitation without creature tokens, a Dinosaur lord with few Dinosaurs).
  const weak = weakHere(d),
    dead = [...new Set(weak.map(w => w.n))];
  pen += Math.min(0.4, dead.length * 0.06);
  const bal = Math.max(0, 1 - pen / 2.5);
  why.balance =
    (short.length ? 'Short against what players who changed the deck run: ' + short.join(', ') : 'Every job covered') +
    (over.length ? '; heavy: ' + over.join(', ') : '') +
    '; lands ' +
    A.lands +
    '/' +
    T.lands +
    (dead.length ? '; ' + dead.length + ' card' + (dead.length > 1 ? 's' : '') + ' the deck barely supports' : '');
  // Card quality: how widely each spell is played across all of Commander (EDHREC rank), staples counting fully.
  const q = c => (CORE.has(c._n) ? 1 : c.r ? Math.max(0, 1 - Math.log(c.r + 1) / Math.log(40000)) : 0.35);
  let qual = spells.reduce((a, c) => a + q(c), 0) / n,
    qPct = null,
    qExact = null,
    qTier = null,
    qOver = 0;
  why.quality = spells.filter(c => c.r && c.r < 400).length + ' proven staples (top 400 cards in Commander)';
  // With the Apex reference: card quality is how far the spells are from random playable cards (0%) to the Apex build (100%).
  const AR = opt.apex && opt.apex.key === apexKey(d) ? opt.apex : null;
  if (AR) {
    const vf = opt.valOf || null,
      M = apexMeans(AR, d, ctx, vf),
      m = spellMean(d.cards, d, ctx, vf);
    Object.assign(AR, {apex: M.apex, mid: M.mid, budget: M.budget, floor: M.floor});
    qPct = qualityPct(m, AR.apex, AR.floor);
    qExact = AR.apex > AR.floor ? Math.max(0, Math.min(100, (100 * (m - AR.floor)) / (AR.apex - AR.floor))) : 0;
    qOver = AR.apex > AR.floor ? Math.max(0, (100 * (m - AR.floor)) / (AR.apex - AR.floor) - 100) : 0;
    why.quality = qPct + '% of the way from random playable cards to the Apex build (the best cards for this deck at any price)';
    if (d.tier === 'budget' || d.tier === 'mid') {
      const ref = d.tier === 'budget' ? AR.budget : AR.mid;
      qTier = {tier: d.tier, pct: qualityPct(m, ref, AR.floor)};
      why.quality += '; ' + qTier.pct + '% of the best build with every card under $' + (d.tier === 'budget' ? 3 : 12);
    }
  }
  // Win routes and resilience: complete combos that win, cards that close a game, ways to protect or rebuild, card flow.
  const cb = COMBOS.list.length ? combosOf(d, ctx.ident) : {full: [], near: []},
    wins = cb.full.filter(x => x.win),
    fin = spells.filter(isFinisher),
    prot = spells.filter(
      c => (tags(c).roles.has('protect') || tags(c).roles.has('counter')) && !(UP.bs && c.cmc >= UP.bsP)
    ).length,
    rec = spells.filter(c => RECUR_RE.test(c.o || '') || (UP.reF && REANIM_ALL.test(c.o || ''))).length,
    tut = spells.filter(c => tags(c).roles.has('tutor')).length;
  // Smarter deck score, stage 2 (UP.rs): ways to win rise smoothly, so one card can't swing the score more than it is worth. Each
  // finisher adds less than the one before (1 - e^(-n/UP.rfn)), and winning combos count by how many there are (the first 60% of UP.rc).
  const finN = UP.bs ? fin.reduce((a, c) => a + (finByText(c) ? 1 : UP.bsF), 0) : fin.length,
    finV = UP.rs ? 1 - Math.exp(-finN / UP.rfn) : Math.min(1, finN / 6),
    cbV = UP.rs
      ? wins.length
        ? UP.rc * (0.6 + 0.4 * Math.min(1, (wins.length - 1) / 3))
        : cb.full.length
          ? UP.rc * 0.5
          : 0
      : wins.length
        ? 0.25
        : cb.full.length
          ? 0.12
          : 0;
  const routes = Math.min(
    1,
    (UP.rs ? UP.rf : 0.45) * finV +
      cbV +
      0.15 * Math.min(1, prot / 5) +
      0.1 * Math.min(1, rec / 3) +
      0.05 * Math.min(1, tut / 2) +
      0.1 * Math.min(1, A.roles.draw / Math.max(6, T.draw))
  );
  why.routes =
    fin.length +
    ' finishers' +
    (wins.length
      ? ', ' +
        wins.length +
        ' winning combo' +
        (wins.length > 1 ? 's' : '') +
        ' (' +
        wins
          .slice(0, 2)
          .map(x => x.names.join(' + '))
          .join('; ') +
        ')'
      : '') +
    ', ' +
    prot +
    ' protection/counters, ' +
    rec +
    ' recursion';
  // Mana and curve: goldfish games (seeded, so the same deck always gets the same score).
  // An unfinished deck (opt.partial) is not played out: practice games with a part of a deck say nothing about its mana.
  const S = opt.partial ? null : opt.sim || simulate(d, opt.games || 300, opt.seed || 7);
  // Running short of lands and drawing too many cost the same; mana spent counts up to about a land a turn plus a little ramp.
  let mana = 0;
  if (S) {
    mana = Math.max(
      0,
      Math.min(
        1,
        0.3 * Math.min(1, S.manaUsedBy6 / 19) + 0.15 * S.cmdByT6 + 0.55 * (1 - 0.6 * S.colourStuck - 1.5 * S.screwT5 - S.floodT8)
      )
    );
    why.mana =
      'commander out by turn ' +
      S.cmdMedianTurn +
      ' (median), ' +
      S.manaUsedBy6 +
      ' mana used by turn 6, stuck on colour ' +
      Math.round(100 * S.colourStuck) +
      '%, short of lands ' +
      Math.round(100 * S.screwT5) +
      '%, flooded ' +
      Math.round(100 * S.floodT8) +
      '%';
  } else why.mana = 'available once the deck has its full 100 cards';
  // the parts' weights and where a part stops rising (UP.evW / UP.evSuff override them: score experiments, 25 Oct)
  const EVW = UP.evW || EV_W,
    SU = UP.evSuff || EV_SUFF;
  const raw = {synergy: syn, balance: bal, quality: qual, routes, mana},
    parts = {};
  let total = 0;
  // parts are shown as whole numbers; exact keeps the unrounded parts, so a small real gain (a better card) is not lost to rounding
  // Comparing swaps (Build 139, UP.unc): the shown parts stop at their maximum, but a deck already at the maximum can still get
  // better; cmp lets each part keep rising past its maximum at UP.unc of the rate, so a stronger, on-theme card still scores
  // above a weak one in a strong deck. Only differences in cmp are used (swap gains); the score shown is unchanged.
  let cmp = 0;
  const pastMax = k => {
    if (!UP.unc || (UP.uncK && UP.uncK !== k)) return 0;
    if (k === 'quality') return qOver;
    if (SU[k]) return Math.max(0, raw[k] / SU[k] - 1) * 100;
    const a = k === 'routes' && UP.rs ? UP.ra : EV_ANCHOR[k],
      top = a[1] > a[0] ? 60 + (25 * (raw[k] - a[0])) / (a[1] - a[0]) : 0;
    return Math.max(0, top - 100);
  };
  let wsum = 0,
    exact = 0;
  const contrib = {};
  for (const k in EVW) {
    if (k === 'mana' && !S) {
      parts[k] = null;
      continue;
    }
    const pe =
      k === 'quality' && qExact != null
        ? qExact
        : SU[k]
          ? 100 * Math.min(1, raw[k] / SU[k])
          : evScale(raw[k], k === 'routes' && UP.rs ? UP.ra : EV_ANCHOR[k]);
    cmp += ((pe + UP.unc * pastMax(k)) * EVW[k]) / 100; // stage 2: the smoother ways-to-win, shifted so a typical deck keeps its score
    parts[k] = k === 'quality' && qPct != null ? qPct : Math.round(pe);
    total += (parts[k] * EVW[k]) / 100;
    exact += (pe * EVW[k]) / 100;
    contrib[k] = (pe * EVW[k]) / 100;
    wsum += EVW[k];
  }
  if (wsum && wsum < 100) {
    total = (total * 100) / wsum;
    exact = (exact * 100) / wsum;
    cmp = (cmp * 100) / wsum;
    for (const k in contrib) contrib[k] *= 100 / wsum;
  } // the parts that could be judged, weighted as usual
  const onPlan = spells.filter(
    c => (d.aims || []).some(a => matchAim(c, a, ctx.tribe) >= 0.7) || ctx.cmdThemes.some(a => matchAim(c, a, ctx.cmdTribe) >= 1)
  ).length;
  const feat = {
    lands: A.lands,
    tLands: T.lands,
    avg: +A.avg.toFixed(2),
    ramp: A.roles.ramp,
    draw: A.roles.draw,
    removal: A.roles.removal,
    wipe: A.roles.wipe,
    tRamp: T.ramp,
    tDraw: T.draw,
    tRem: T.removal,
    tWipe: T.wipe,
    inter,
    fin: fin.length,
    prot,
    rec,
    tut,
    wins: wins.length,
    combos: cb.full.length,
    onPlan: onPlan / n,
    synPos:
      E && E.map
        ? spells.filter(c => {
            const x = incOf(c);
            return x && x.syn >= 0.1;
          }).length / n
        : 0,
    cheap: spells.filter(c => c.cmc <= 2).length,
    big: spells.filter(c => c.cmc >= 6).length,
    gc: A.gc.length,
    weak: dead.length
  };
  const prof = profileOf(ctx.cmd),
    needs = prof
      ? prof.needs.map(k =>
          Object.assign({key: k, label: k.startsWith('tribe:') ? k.slice(6) + ' creatures' : NEEDS[k].label}, supportOf(d, k))
        )
      : [];
  return {
    total: Math.round(total),
    exact: +exact.toFixed(3),
    cmp: +cmp.toFixed(3),
    parts,
    contrib,
    raw,
    why,
    sim: S,
    u,
    feat,
    weak,
    profile: prof,
    needs,
    quality: {
      vsApex: qPct,
      tier: qTier,
      pending: qPct == null,
      marks:
        AR && AR.apex != null
          ? {budget: qualityPct(AR.budget, AR.apex, AR.floor), mid: qualityPct(AR.mid, AR.apex, AR.floor)}
          : null
    },
    combos: {win: wins, all: cb.full, near: cb.near.slice(0, 5)},
    finishers: fin.map(c => c.n)
  };
}
function parsePrecon(j) {
  const jd = (j && j.container && j.container.json_dict) || {},
    dk = (j && j.deck) || {},
    L = t => ((jd.cardlists || []).find(x => x.tag === t) || {}).cardviews || [];
  const list = [];
  Object.values(dk.cards || {}).forEach(a =>
    (a || []).forEach(t => {
      if (t && t[0]) list.push(t[0]);
    })
  );
  return {
    name: dk.name || (jd.card && jd.card.precon) || '',
    decks: (jd.card && jd.card.num_decks) || 0,
    list,
    cut: L('cardstocut')
      .map(v => v.name)
      .filter(Boolean),
    lcut: L('landstocut')
      .map(v => v.name)
      .filter(Boolean),
    add: L('cardstoadd')
      .concat(L('landstoadd'))
      .filter(v => v.name && v.potential_decks)
      .map(v => [v.name, Math.min(1, v.num_decks / v.potential_decks), +(v.synergy || 0)])
  };
}
