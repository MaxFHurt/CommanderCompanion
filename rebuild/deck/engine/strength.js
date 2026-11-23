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
// Roadmap 6.1 (smarter deck score), read from the card's text and the practice games' reading, no card lists:
// strSpeed: how much mana a card gives over the first four turns, against playing a land (-1..1): Sol Ring, Mana Vault, the
// Moxen and Ancient Tomb high; a two-mana Signet a little; a three-mana rock, Cultivate and lands that enter tapped below zero.
function strSpeed(c) {
  if (c._spd !== undefined) return c._spd;
  const o = (c.o || '').split(' // ')[0],
    t = frontType(c),
    land = tags(c).land;
  let g = 0;
  if (land) {
    // a land: more than one mana a turn (Ancient Tomb), or entering tapped (a turn without its mana)
    const m = /\{T\}(?:, Pay \d+ life)?: Add ((?:\{[WUBRGC]\})+)(?:\.| or )/i.exec(o),
      n = m && !/ or /.test(m[0]) ? (m[1].match(/\{/g) || []).length : 1;
    g = (Math.max(1, n) - 1) * 4 - (landSpeed(c) === 'tapped' ? 1 : 0);
  } else {
    const x = simCard(c),
      cmc = c.cmc || 0;
    let mana = x.mana || 0;
    // the reading misses some sources it cannot follow (Chrome Mox's imprint): the text's own tap ability counts as one mana
    if (!mana && /^\{T\}: Add /im.test(o) && !/sacrifice ~|sacrifice this/i.test(o) && /Artifact|Creature/.test(t)) mana = 1;
    if (mana) {
      const s = Math.max(1, Math.ceil(cmc)) + (x.sick || x.tappedRock ? 1 : 0),
        uses = /doesn['’]t untap during your untap step/i.test(o) ? Math.min(2, 5 - s) : 5 - s;
      g = mana * Math.max(0, uses) - cmc;
    } else if (x.ramp) {
      const tp = /onto the battlefield tapped|put (it|them|that card|those cards) onto the battlefield tapped/i.test(o) ? 1 : 0,
        s = Math.max(1, Math.ceil(cmc)) + tp;
      g = x.ramp * Math.max(0, 5 - s) - cmc;
    } else if (/^(Instant|Sorcery)/.test(t) || /\{T\}, Sacrifice|Sacrifice ~|Sacrifice this/i.test(o)) {
      // a one-shot: Dark Ritual, Lotus Petal
      const m = /Add ((?:\{[WUBRGC]\})+|one mana)/i.exec(o);
      if (m && tags(c).roles.has('ramp')) g = (m[1].match(/\{/g) || [1]).length - cmc;
    }
  }
  return (c._spd = Math.max(-1, Math.min(1, g / 6)));
}
// strTempo: what one answer costs (-1..1): free (an alternative cost, phyrexian or no mana) 1, one mana 0.5, two 0, three -0.5;
// instants and sorceries that remove or counter only; a counter the opponent can pay through counts half a step lower.
function strTempo(c) {
  if (c._tmp !== undefined) return c._tmp;
  const r = tags(c).roles,
    o = (c.o || '').split(' // ')[0];
  let v = 0;
  if (/^(Instant|Sorcery)/.test(frontType(c)) && (r.has('removal') || r.has('counter'))) {
    const pips = (c.m || '').match(/\{[^}]+\}/g) || [],
      eff = /rather than pay this spell['’]s mana cost|without paying (its|this spell['’]s) mana cost|If it['’]s not your turn, you may/i.test(o)
        ? 0
        : pips.reduce((a, p) => a + (/\/P\}/.test(p) ? 0 : /^\{\d+\}$/.test(p) ? +p.slice(1, -1) : /^\{X\}$/.test(p) ? 0 : 1), 0);
    v = (2 - eff) / 2 - (r.has('counter') && /unless its controller pays/i.test(o) ? 0.5 : 0);
  }
  return (c._tmp = Math.max(-1, Math.min(1, v)));
}
function strValue(c, d, casual, raw, sc) {
  if (!c || isBasic(c.n)) return 0;
  const V = strCtx(d).vals,
    k = c._n + (casual ? '|c' : '') + '|' + UP.strFit + '|' + UP.strExp + '|' + UP.strLand + '|' + UP.strInc + '|' + UP.strPopW + '|' + strAimW(d) + '|' + (strAimW(d) ? (d.aims || []).join(',') + ':' + strTm(d) : '') + (!casual && (sc || UP.sPick) && (UP.sPow || UP.sSpd || UP.sInt) ? '|' + UP.sPow + ':' + UP.sSpd + ':' + UP.sInt : '');
  let v = V.get(k);
  if (v === undefined) {
    const w = UP.strFit;
    // Budget and Mid picks also weigh what this commander's players run (EDHREC play rate, precon bias removed): players
    // upgrading at those prices add the commander's popular cards, not what strong decks of every commander play
    // UP.strPopW (owner, 21 Nov: the 50/50 blend): the card's strength is blended with what this commander's players run
    // (EDHREC play rate, precon bias removed); 0 = strength alone (option A). Only the strength part is blended: fit with the
    // deck's themes keeps its weight, so the chosen themes still steer the picks. The sweep (tools/tests/suite/apex*.js) kept
    // the strength builds' gain (generated Apex power 100) while upgrade picks stayed close to what players add.
    const pw = UP.strPopW || 0,
      inc = (casual && UP.strInc) || pw ? strInc(c, d) : 0,
      S0 = cardStrength(c, d, casual),
      S1 = pw ? (1 - pw) * S0 + pw * inc : S0,
      b2 = casual && UP.strInc ? (1 - w - UP.strInc) * S1 + w * strFit(c, d) + UP.strInc * inc : (1 - w) * S1 + w * strFit(c, d);
    // Roadmap 6.1, the strongest version of the deck (not Budget and Mid picks): UP.sPow, a card much more powerful than its play
    // rate here says is not buried by it (owner: "cards that fit the deck better should be the clear winner unless the other card is
    // meaningfully more powerful"): its value is at least sPow x its strength; UP.sSpd, mana speed (strSpeed); UP.sInt, the cost of
    // an answer (strTempo). 0 = the values before.
    // sc: the score's reading of the deck (strMean, strTopSpell, the score's synergy); the picks (strength builds, the finish,
    // upgrade rows) read them too only with UP.sPick (sweep 22 Nov: sPow in the picks dropped the upgrade benchmark 0.167 -> 0.076)
    let b3 = b2;
    if (!casual && (sc || UP.sPick) && (UP.sPow || UP.sSpd || UP.sInt)) {
      if (UP.sPow) b3 = Math.max(b3, UP.sPow * S0);
      if (UP.sSpd) b3 += UP.sSpd * strSpeed(c);
      if (UP.sInt) b3 += UP.sInt * strTempo(c);
      b3 = Math.max(0, b3);
    }
    v = Math.pow(b3, UP.strExp) * (tags(c).land ? UP.strLand : 1);
    V.set(k, v);
  }
  // UP.chain (roadmap 6b batch D): a spell that fills the thin side of one of the deck's game-plan chains (plans.js
  // chainBonus) adds UP.chain to its blend, as fit does; joining a full side adds nothing. raw: the value without it (the
  // deck score's synergy part, which batch E covers)
  if (UP.chain && !raw && !tags(c).land) {
    const f = chainBonus(d, c);
    if (f) v = Math.pow(Math.pow(v, 1 / UP.strExp) + UP.chain * f, UP.strExp);
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
    // UP.strPips: a spell comes in only if the deck's lands are enough sources for its coloured pips at its mana value (Karsten's
    // table, as the generator's mana base uses it, 2 short allowed), unless it asks no more than the card it replaces
    src = (() => {
      const o = {};
      strSlots(d).forEach(c => {
        if (tags(c).land) landColors(c).forEach(k => (o[k] = (o[k] || 0) + 1));
      });
      return o;
    })(),
    pipsOk = (cut, add) => {
      if (!UP.strPips || tags(add).land) return true;
      const p = pipNeed(add),
        pc = pipNeed(cut),
        mv = Math.max(1, Math.min(7, Math.round(add.cmc || 1)));
      return Object.keys(p).every(k => p[k] <= (pc[k] || 0) || KARSTEN[Math.min(3, p[k])][mv - 1] <= (src[k] || 0) + 2);
    },
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
        if (!pipsOk(cut, add)) continue;
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
// A strength build with every swap checked on the deck score (UP.oneRef): its swaps in the build's order, each kept only when the
// deck with it scores higher (the deck's own practice games, card strength against the reference R); a swap that doesn't is
// replaced by the next strongest card for that slot (price cap, same rules as the build) that does, else the slot stays.
function strChecked(d, B, R, pool, core, cap, casual) {
  const orig = strSlots(d),
    first = new Map();
  B.done.forEach((s, k) => s.i != null && !first.has(s.i) && first.set(s.i, k));
  const idx = B.list.map((c, i) => i).filter(i => orig[i] && B.list[i] !== orig[i] && B.list[i].n !== orig[i].n).sort((a, b) => (first.has(a) ? first.get(a) : 1e6) - (first.has(b) ? first.get(b) : 1e6));
  const u = Object.assign({}, d, {cards: d.cards.map(e => Object.assign({}, e))});
  delete u.plan;
  delete u.refPin;
  const sim = strBasisSim(d, R),
    sc = x => evaluateDeck(x, {sim, str: true, strRef: R}).exact,
    A0 = analyze(d),
    vv = c => strValue(c, d, casual),
    need = Object.fromEntries(STR_ROLES.map(r => [r, UP.strKeepJobs ? A0.roles[r] : Math.min(A0.T[r], A0.roles[r])])),
    winJob = c => isFinisher(c) || tags(c).roles.has('protect');
  let cur = sc(u);
  const list = orig.slice(),
    done = [],
    K = UP.oneRefK == null ? 3 : UP.oneRefK;
  for (const i of idx) {
    const cut = orig[i],
      have = new Set(list.map(c => c.n)),
      rc = Object.fromEntries(STR_ROLES.map(r => [r, list.filter(c => tags(c).roles.has(r)).length])),
      fits = c =>
        !have.has(c.n) && !!tags(c).land === !!tags(cut).land && (cap == null || (c.p != null && c.p <= cap)) && vv(c) > vv(cut) &&
        !STR_ROLES.some(r => tags(cut).roles.has(r) && !tags(c).roles.has(r) && rc[r] - 1 < need[r]) && !(UP.strKeepJobs && winJob(cut) && !winJob(c));
    const cands = [B.list[i]].concat(K ? pool.filter(c => c !== B.list[i] && fits(c)).sort((a, b) => vv(b) - vv(a)).slice(0, K) : []);
    for (const c of cands) {
      if (have.has(c.n)) continue;
      const w = Object.assign({}, u, {cards: u.cards.map(e => Object.assign({}, e))});
      cutCard(w, cut.n, 1);
      addCard(w, c.n, 1);
      const v = sc(w);
      if (v - cur >= SCORE_MIN) {
        u.cards = w.cards;
        cur = v;
        list[i] = c;
        done.push({cut: cut.n, add: c.n, i});
        break;
      }
    }
  }
  return {list, done, checked: true};
}
const STR_REF = new Map();
// The three builds and the replacement level for a deck (kept per deck settings and card data).
// UP.fixRef (owner, 22 Nov: "Fix it until Regenerate"): the builds the power bar measures against are worked out once, from the
// cards the deck had then (d.refPin, set by the app when the upgrade list is made: ui/library.js refPinFor), and kept while
// swaps are made, so a swap moves the bar only by what the card does. Regenerate, a commander change or any other change the
// upgrade list counts as new (settings, cards changed by hand) sets the pin again. Without a pin (the generator, the tests'
// engine runs) the builds follow the deck's own cards, as before.
function strBasis(d) {
  const P = UP.fixRef && d.refPin && Array.isArray(d.refPin.cards) && d.refPin.cmd === d.commander + '|' + (d.partner || '') ? d.refPin : null;
  if (!P) return d;
  const u = Object.assign({}, d, {cards: P.cards.map(([n, q]) => ({n, q, l: false}))});
  delete u.refPin;
  return u;
}
function strengthRef(d0) {
  if (!strengthOn(d0)) return null;
  const d = strBasis(d0);
  const ctx = ctxOf(d),
    k = apexKey(d) + '|' + STRENGTH.date + '|' + STRENGTH.cmd.size + '|' + JSON.stringify([UP.strFit, UP.strExp, UP.strLand, UP.strInc, UP.strPopW, strAimW(d), strTm(d), UP.chain || 0, UP.sPow || 0, UP.sSpd || 0, UP.sInt || 0, UP.oneRef || 0, UP.oneM || 0, UP.oneRefK || 0]) + '|' + JSON.stringify(d.cards.map(e => [e.n, e.q]));
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
  const R = {key: k, core, pool, apex, mid, budget, floor, top: strMean(d, apex.list), basis: JSON.stringify(d.cards.map(e => [e.n, e.q]))};
  // UP.oneRef (owner, 23 Nov: "Yes, rebuild Apex"): the Apex, Mid and Budget builds the bar measures against are made with the
  // one measure too: each of the strength build's swaps goes in only when it raises the deck score (else the next strongest
  // card for that slot that does, up to UP.oneRefK tried), as the upgrade list and the generator's finish take them. The
  // score's own anchors (quality's 100 = the strength build's mean, the synergy reading) stay the strength build's.
  if (UP.oneRef && UP.oneM) {
    strTopSpell(d, R);
    const t0 = Date.now();
    R.apex = strChecked(d, apex, R, pool, core, null, false);
    R.mid = strChecked(d, mid, R, pool, core, 12, true);
    R.budget = strChecked(d, budget, R, pool, core, 3, true);
    R.checkMs = Date.now() - t0;
  }
  STR_REF.set(k, R);
  if (STR_REF.size > 6) STR_REF.delete(STR_REF.keys().next().value);
  return R;
}
// the average strength value of the spells in a deck's strongest build (the scale the score's synergy part reads strength on)
function strTopSpell(d, SR) {
  if (SR.topS == null) {
    const sp = SR.apex.list.filter(c => !tags(c).land);
    SR.topS = sp.length ? sp.reduce((a, c) => a + strValue(c, d, false, true, true), 0) / sp.length : 0;
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
    // UP.oneRef: on the reference deck's own practice games, as the builds were checked (so the Apex build never scores below
    // the deck it was made from)
    const e = evaluateDeck(u, SR.apex && SR.apex.checked ? {sim: strBasisSim(d, SR), str: true, strRef: SR} : {games: 100, str: true, strRef: SR});
    out[t] = +e.exact.toFixed(2);
    out.parts[t] = e.parts;
  }
  return (SR.parts = out);
}
function strBasisSim(d, SR) {
  if (!SR.bsim) {
    const cnt = new Map();
    JSON.parse(SR.basis).forEach(([n, q]) => cnt.set(n, q));
    const u = Object.assign({}, d, {cards: [...cnt].map(([n, q]) => ({n, q, l: false}))});
    delete u.plan;
    delete u.refPin;
    SR.bsim = simulate(u, 300, 7);
  }
  return SR.bsim;
}
function strMean(d, list) {
  return list.length ? list.reduce((a, c) => a + strValue(c, d, false, false, true), 0) / list.length : 0;
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
    k = SR.key + '|' + JSON.stringify([d.dismissed || [], d.sets || [], !!d.setsMust, d.types || [], !!d.typesMust, d.keys || [], !!d.keysMust]) + '|' + (SR.basis === JSON.stringify(d.cards.map(e => [e.n, e.q])) ? '' : JSON.stringify(d.cards.map(e => [e.n, e.q])));
  if (SR.picks && SR.picks.k === k) return SR.picks;
  const pool = SR.pool.filter(ok),
    same = pool.length === SR.pool.length && SR.basis === JSON.stringify(d.cards.map(e => [e.n, e.q])); // a pinned reference (UP.fixRef) from other cards: the picks are the builds from the deck as it is now
  const B = same
    ? {apex: SR.apex, mid: SR.mid, budget: SR.budget}
    : (() => {
        const core = SR.basis === JSON.stringify(d.cards.map(e => [e.n, e.q])) ? SR.core : deckCore(d);
        return {apex: strBuild(d, null, false, pool, core), mid: strBuild(d, 12, true, pool, core), budget: strBuild(d, 3, true, pool, core)};
      })();
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
  delete d.refPin; // the finished deck is new: the app pins its reference again from the finished cards (UP.fixRef)
  // Theme first: the theme stays ahead of strength, so an on-theme card is only ever replaced by another on-theme card
  const TH = d.themeFirst ? themeCtx(d) : null,
    onT = c => !!c && themeOf(c, TH),
    themeOk = (cut, add) => !TH || !onT(find(cut)) || onT(find(add));
  // the pieces of the deck's winning combos stay (UP.strKeepCombos): a combo is a finisher spread over two or three cards, and
  // each piece alone rates low on strength, so the finish broke them (Winota 5 winning combos -> 1, tournament match 75.0% -> 74.7%)
  if (UP.strKeepCombos && COMBOS.list.length) {
    keep = new Set(keep || []);
    combosOf(d, ctxOf(d).ident).full.filter(x => x.win).forEach(x => x.keys.forEach(k => keep.add(k)));
  }
  const casual = tier !== 'apex',
    cap = TIERS[tier].cap,
    kept = n => keep && keep.has(keyOf(n));
  // practice-game mana (the score's mana part), to check the finished deck against the deck as generated
  const manaOf = () => {
    const S = simulate(d, 200, 7);
    return manaPart(S, true); // the score players see reads mana with card strength (rocks count as sources)
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
    // One measure (UP.oneM): a swap goes in only when it raises the deck score (the measure the power bar shows: card strength,
    // this round's reference builds, the deck's practice games at the round's start). 1: the build's own pick, else none;
    // 2: the pick or the next UP.oneK strongest cards that fit the slot at the tier's price, whichever raises the score most.
    const OM = UP.oneM ? {sim: simulate(d, 300, 7)} : null;
    if (OM) OM.cur = evaluateDeck(d, {sim: OM.sim, str: true, strRef: SR}).exact;
    const omScore = (cut, add) => {
      const u = Object.assign({}, d, {cards: d.cards.map(e => Object.assign({}, e))});
      delete u.plan;
      cutCard(u, cut, 1);
      addCard(u, add, 1);
      return evaluateDeck(u, {sim: OM.sim, str: true, strRef: SR}).exact;
    };
    const omCands = s => {
      if (UP.oneM !== 2) return [s.add];
      const cutC = find(s.cut),
        ok = strOk(d),
        A0 = analyze(d),
        vv = c => strValue(c, d, casual),
        cv = vv(cutC),
        fit = c =>
          ok(c) && !!tags(c).land === !!tags(cutC).land && !tags(c).land && (cap === Infinity || (c.p != null && c.p <= cap)) && themeOk(s.cut, c.n) && vv(c) > cv &&
          !STR_ROLES.some(r => tags(cutC).roles.has(r) && !tags(c).roles.has(r) && A0.roles[r] - 1 < Math.min(A0.T[r], A0.roles[r]));
      return [s.add].concat(SR.pool.filter(c => c.n !== s.add && fit(c)).sort((a, b) => vv(b) - vv(a)).slice(0, UP.oneK || 6).map(c => c.n));
    };
    for (const s of L) {
      const e = entryOf(d, s.cut);
      if (!e || e.l || entryOf(d, s.add) || !chainCutOk(d, e.n, s.add)) continue; // UP.chainGen: no kept game-plan chain loses its last cards
      let add = s.add;
      if (OM) {
        let best = null;
        for (const n of omCands(s)) {
          if (entryOf(d, n) || !chainCutOk(d, e.n, n)) continue;
          const v = omScore(e.n, n);
          if (v - OM.cur >= SCORE_MIN && (!best || v > best.v)) best = {n, v};
        }
        if (!best) continue;
        add = best.n;
        OM.cur = best.v;
      }
      cutCard(d, e.n, 1);
      addCard(d, add, 1);
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
          if (STR_ROLES.some(r => tags(c).roles.has(r) && A2.roles[r] - 1 < need(r)) || !chainCutOk(d, c.n)) continue;
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
          .filter((c, j, a) => a.indexOf(c) === j && !tags(c).land && !SR.core.has(c.n) && !kept(c.n) && !(TH && onT(c)) && !(entryOf(d, c.n) || {}).l)
          .filter(c => !STR_ROLES.some(r => tags(c).roles.has(r) && A2.roles[r] - 1 < Math.min(A2.T[r], A2.roles[r])) && chainCutOk(d, c.n))
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
// One measure (UP.oneM; owner, 22 Nov: "If a card tells me it's an upgrade, it should be an upgrade to everything"): a swap's
// change to the power bar. The deck is scored with the swap (the score players see: card strength, against the deck's own
// reference builds, on the deck's own practice games, so no games are replayed) less the deck's score, as a share of the Apex
// build's score, which is what the bar shows. Each swap is measured once per deck state. base: the deck's score when the
// caller has it (the app's evalFor). Null when strength is off.
function barGainFn(d, SR, base) {
  SR = SR || strengthRef(d);
  if (!SR || SR.top <= SR.floor) return null;
  const sig = JSON.stringify(d.cards.map(e => [e.n, e.q]));
  let C = SR.barC;
  if (!C || C.sig !== sig) {
    const b = base && base.sim && base.exact != null ? base : evaluateDeck(d, {games: 300, str: true, strRef: SR}),
      ap = strRefParts(d, SR).apex;
    C = SR.barC = {sig, base: b, apex: ap > 0 ? ap : 100, memo: new Map(), n: 0, ms: 0};
  }
  const f = (cut, add, q) => {
    q = q || 1;
    const k = cut + '>' + add + '>' + q;
    let g = C.memo.get(k);
    if (g === undefined) {
      const t0 = Date.now(),
        u = Object.assign({}, d, {cards: d.cards.map(e => Object.assign({}, e))});
      delete u.plan;
      delete u.refPin;
      cutCard(u, cut, q);
      addCard(u, add, q);
      try {
        // a swap that changes the land count changes the mana itself: its practice games are played (the same seed)
        const lc = n => !!(find(n) && tags(find(n)).land),
          sim = lc(cut) !== lc(add) ? undefined : C.base.sim;
        g = (100 * (evaluateDeck(u, {sim, games: 300, str: true, strRef: SR}).exact - C.base.exact)) / C.apex;
      } catch (e) {
        g = null;
      }
      C.memo.set(k, g);
      C.n++;
      C.ms += Date.now() - t0;
    }
    return g;
  };
  f.ctx = C;
  return f;
}
// A kept upgrade list after a swap (UP.oneM): every pick still offered is measured again on the deck as it now is, so a pick
// the swap made worse (two cards doing the same thing, a part already full) is not still shown as an upgrade: it gives way to
// the first of its alternatives that still raises the bar (2: the one that raises it most), else its tier is left out.
function barRecheck(d, R, G) {
  if (!R || !G || !R.paths) return R;
  const strWhy = n => {
    const c = find(n),
      v = c && STRENGTH.cards.get(c._n);
    return [v ? 'Card strength ' + v[0] + ' of 100 (how often strong decks that could play it do)' : 'New card: too new for play data; read by what it does'];
  };
  for (const L of R.paths) {
    for (const t of Object.keys(L.opts)) {
      const o = L.opts[t];
      if (!o || !o.add || !o.bar) continue;
      const g = G(o.cut || L.cut, o.add, o.q || 1);
      if (g != null && g >= SCORE_MIN) {
        o.dScore = o.gain = g;
        continue;
      }
      const m = ((L.alts && L.alts[t]) || [])
        .filter(a => !hasCard(d, a.n))
        .map(a => ({a, g: G(o.cut || L.cut, a.n, 1)}))
        .filter(x => x.g != null && x.g >= SCORE_MIN);
      if (UP.oneM === 2) m.sort((x, y) => y.g - x.g);
      if (m[0]) {
        L.opts[t] = Object.assign({}, o, {add: m[0].a.n, dScore: m[0].g, gain: m[0].g, held: false, why: strWhy(m[0].a.n), q: 1});
        L.alts[t] = L.alts[t].filter(a => a.n !== m[0].a.n);
      } else delete L.opts[t];
    }
    if (L.top && L.top.n && !L.applied) {
      const g = hasCard(d, L.top.n) ? null : G(L.cut, L.top.n, 1);
      if (g == null || g < SCORE_MIN) L.top = null;
      else L.top.dScore = g;
    }
  }
  R.paths = R.paths.filter(L => L.applied || Object.values(L.opts).some(Boolean));
  return R;
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
        if (!n || !find(n)) continue;
        const p = pick(cut, n, t, !!H[t]);
        if (p.held || !(p.dScore <= 0)) o[t] = p; // a pick that lowers power on the strength scale is not an upgrade
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
    if (UP.oneM) L._C = C;
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
  // One measure (UP.oneM): every pick, alternative and Highest score card is measured on the power bar (barGainFn); only swaps
  // that raise it are offered, and the chip is that change.
  //   1 (check): the strength builds still choose; a pick that doesn't raise the bar gives way to the next of its alternatives
  //     (strength order) that does, else the tier is left out
  //   2 (score ranks): the strength builds shortlist the cards for each slot (the pick, its alternatives and the next UP.oneK
  //     strongest that fit at the tier's price); the one that raises the bar most is the pick, and rows are ordered by it
  const BG = UP.oneM ? barGainFn(d, SR) : null;
  if (BG) {
    const bg = (cut, add) => BG(cut, add, 1),
      taken = new Map(); // card -> its row, as the picks stand after this pass
    rows.forEach(L => Object.values(L.opts).forEach(p => p.held && taken.set(p.add, L)));
    const free = (L, n) => !taken.has(n) || taken.get(n) === L;
    for (const t of tOrder)
      rows.forEach(L => {
        const p = L.opts[t];
        if (!p) return;
        if (p.held) {
          p.sGain = p.dScore;
          p.dScore = p.gain = bg(L.cut, p.add);
          p.bar = true;
          return;
        }
        const C = L._C || [];
        let names = [p.add].concat(UP.oneSub === 0 && UP.oneM === 1 ? [] : (L.alts[t] || []).map(a => a.n));
        if (UP.oneM === 2) names = names.concat(C.filter(x => priceOk(x.c, t)).slice(0, UP.oneK || 6).map(x => x.c.n));
        names = [...new Set(names)].filter(n => free(L, n) && find(n) && priceOk(find(n), t));
        const m = names.map(n => ({n, g: bg(L.cut, n), s: gain(L.cut, n)})).filter(x => x.g != null && x.g >= (UP.oneMin != null ? UP.oneMin : SCORE_MIN));
        if (UP.oneM === 2) m.sort((a, b) => b.g - a.g);
        const b = m[0];
        if (!b) {
          delete L.opts[t];
          return;
        }
        L.opts[t] = Object.assign(pick(L.cut, b.n, t), {dScore: b.g, gain: b.g, sGain: b.s, bar: true});
        taken.set(b.n, L);
        L.alts[t] = m
          .filter(x => x !== b && x.g >= 0.5 * b.g)
          .slice(0, 3)
          .map(x => ({n: x.n, p: find(x.n).p, dScore: x.g, inc: inc(find(x.n)), vs: b.n, vsScore: b.g, str: true, bar: true}));
      });
    rows.forEach(L => {
      // Apex stays the row's best on this measure (2) / strongest pick (1); each card once on a row
      for (const t of ['mid', 'budget']) {
        const p = L.opts[t],
          ap = L.opts.apex;
        if (p && (!ap || (!ap.held && (UP.oneM === 2 ? p.dScore > ap.dScore : p.sGain > ap.sGain)))) L.opts.apex = Object.assign({}, p, {t: 'apex'});
      }
      if (L.opts.mid && L.opts.apex && L.opts.mid.add === L.opts.apex.add && !L.opts.mid.held) delete L.opts.mid;
      if (L.opts.budget && [L.opts.apex, L.opts.mid].some(x => x && x.add === L.opts.budget.add) && !L.opts.budget.held) delete L.opts.budget;
      const ps = Object.values(L.opts);
      L.gain = L.opts.apex ? L.opts.apex.dScore : ps.length ? Math.max(...ps.map(p => p.dScore)) : 0;
      // Highest score: the measured card that raises the bar most
      const all = ps.map(p => ({n: p.add, g: p.dScore})).concat(...Object.values(L.alts).map(A => A.map(a => ({n: a.n, g: a.dScore})))),
        tp = all.sort((a, b) => b.g - a.g)[0];
      L.top = tp ? {n: tp.n, p: find(tp.n).p, dScore: tp.g, inc: inc(find(tp.n))} : null;
      delete L._C;
    });
    rows = rows.filter(L => L.opts.apex || L.opts.mid || L.opts.budget);
    if (UP.oneM === 2) {
      rows.forEach(L => (L.rk = {apex: (tierPick(L, 'apex') || {}).dScore || -1e9, mid: (tierPick(L, 'mid') || {}).dScore || -1e9, budget: (tierPick(L, 'budget') || {}).dScore || -1e9}));
      rows.sort((a, b) => b.rk[dt] - a.rk[dt]);
    }
    R.barMs = BG.ctx.ms;
    R.barN = BG.ctx.n;
  }
  // spare lands (a deck over its land target) come from the regular list, measured on this scale
  // a spare basic for a row whose tapped land no spell beats: a basic the deck runs more than one of (spareLands' rule) that no
  // other row cuts
  const spareBasic = () => {
    const cutN = new Map();
    rows.concat((R.paths || []).filter(L => L.spare)).forEach(L => isBasic(L.cut) && cutN.set(L.cut, (cutN.get(L.cut) || 0) + 1));
    const e = d.cards
      .filter(x => !x.l && isBasic(x.n))
      .sort((a, b) => b.q - a.q)
      .find(x => x.q > 1 && !cutN.has(x.n)); // one row per card cut (rows are keyed by their cut)
    return e ? e.n : null;
  };
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
      const fill = (cut, O0) => {
        const O = {};
        for (const t of Object.keys(O0)) {
          const p = Object.assign({}, O0[t], {cut, dScore: gain(cut, O0[t].add), str: true});
          if (!used.has(p.add) && p.dScore >= SCORE_MIN) {
            O[t] = p;
            continue;
          }
          // its card went to another row (or doesn't raise power): the strongest spell for the spare land at that tier's price
          let b = null;
          for (const c of P.pool) {
            if (tags(c).land || used.has(c.n) || Object.values(O0).some(x => x.add === c.n) || Object.values(O).some(x => x.add === c.n) || !(t === 'apex' || (c.p != null && underCap(c.p, t)))) continue;
            const g = gain(cut, c.n);
            if (g >= SCORE_MIN && (!b || g > b.g)) b = {c, g};
          }
          if (b) O[t] = Object.assign({}, p, {add: b.c.n, dScore: b.g, gain: b.g, why: ['Card strength: uses a spare land'], str: true});
        }
        return O;
      };
      let O = fill(L.cut, L.opts);
      // owner, 22 Nov (option a): a spare tapped land this commander's players often run can be worth about as much as any
      // spell on this scale; the row then cuts one of the deck's spare basics instead (still one row per extra land, tapped
      // lands first), so a deck over its land target is still offered its best spell
      if (!Object.keys(O).length && !isBasic(L.cut)) {
        const b = spareBasic();
        if (b) {
          O = fill(b, L.opts);
          if (Object.keys(O).length) {
            const cw = 'Spare land (' + A0.lands + ' lands, about ' + A0.T.lands + ' needed)';
            Object.values(O).forEach(p => (p.cutWhy = [cw]));
            L.cut = b;
          }
        }
      }
      L.opts = O;
      const ps = Object.values(L.opts);
      ps.forEach(p => used.set(p.add, L));
      return ps.length > 0;
    });
  if (BG)
    spare.forEach(L => {
      for (const t of Object.keys(L.opts)) {
        const p = L.opts[t],
          g = BG(p.cut || L.cut, p.add, 1);
        if (g == null || g < SCORE_MIN) delete L.opts[t];
        else Object.assign(p, {sGain: p.dScore, dScore: g, gain: g, bar: true});
      }
    });
  R.paths = rows.concat(spare.filter(L => Object.keys(L.opts).length));
  // every other swap the list shows (health-alert fixes, alternatives) is measured on the same scale; one that would lower
  // deck power is not offered as an upgrade (fixes the deck needs anyway, like an illegal card, stay)
  const seenObj = new Set(),
    walk = o => {
      if (!o || typeof o !== 'object' || seenObj.has(o)) return;
      seenObj.add(o);
      if (typeof o.cut === 'string' && typeof o.add === 'string' && !o.str) {
        o.dScore = BG ? BG(o.cut, o.add, o.q || 1) : gain(o.cut, o.add) * (o.q || 1);
        o.str = true;
        if (BG) o.bar = true;
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
