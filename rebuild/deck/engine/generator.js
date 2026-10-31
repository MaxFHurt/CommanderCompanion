// Two commanders: which cards may share the command zone. Covers Partner, "Partner with", named partner variants
// (both cards must have the same one), Friends forever, Choose a Background and Doctor's companion.
function pairKind(c) {
  if (!c) return '';
  if (c._pk !== undefined) return c._pk;
  const o = c.o || '',
    t = c.t || '';
  let m,
    k = '';
  if ((m = /(^|\n)Partner with ([^\n(]+?)\s*(\(|\n|$)/.exec(o))) k = 'with:' + norm(m[2]);
  else if ((m = /(^|\n)Partner\s*[—–-]\s*([^\n(]+?)\s*(\(|\n|$)/.exec(o))) k = 'var:' + m[2].trim().toLowerCase();
  else if (/(^|\n)Partner\b/.test(o)) k = 'partner';
  else if (/(^|\n)Friends forever/i.test(o)) k = 'friends';
  else if (/Choose a Background/i.test(o)) k = 'bg';
  else if (/Doctor’s companion|Doctor's companion/i.test(o)) k = 'companion';
  else if (/Legendary/.test(t) && /\bBackground\b/.test(t)) k = 'isbg';
  else if (/Time Lord Doctor/.test(t)) k = 'doctor';
  return (c._pk = k);
}
function pairLabel(c) {
  const k = pairKind(c);
  return k === 'partner'
    ? 'Partner'
    : k.startsWith('var:')
      ? 'Partner—' + k.slice(4).replace(/^./, x => x.toUpperCase())
      : k.startsWith('with:')
        ? 'Partner with'
        : k === 'friends'
          ? 'Friends forever'
          : k === 'bg' || k === 'isbg'
            ? 'Choose a Background'
            : k
              ? 'Doctor’s companion'
              : '';
}
function canPair(a, b) {
  const x = pairKind(a),
    y = pairKind(b);
  if (!x || !y || a.n === b.n) return false;
  if (x.startsWith('with:') || y.startsWith('with:')) return x === 'with:' + b._n || y === 'with:' + a._n;
  if (x === 'bg' || y === 'bg') return x === 'isbg' || y === 'isbg';
  if (x === 'companion' || y === 'companion') return x === 'doctor' || y === 'doctor';
  if (x === 'isbg' || x === 'doctor' || y === 'isbg' || y === 'doctor') return false;
  return x === y;
}
// Make a card the deck's second commander if the rules allow the pairing; otherwise it stays an ordinary card.
function setPartner(d, name) {
  const c = find(name),
    cmd = find(d.commander);
  if (!c || !cmd || !canPair(cmd, c)) {
    if (name && norm(name) !== norm(d.commander || '')) addCard(d, c ? c.n : name, 1);
    return false;
  }
  d.partner = c.n;
  cutCard(d, c.n, 99);
  const st = detectStrategy(c, d);
  if (!d.aimLocked) {
    st.themes.forEach(a => {
      if (d.aims.length < 3 && !d.aims.includes(a)) d.aims.push(a);
    });
    if (!d.tribe) d.tribe = st.tribe || '';
    d.colors = ctxOf(d).ident.slice();
  }
  return true;
}
function canLead(c) {
  if (!c || !c.cmd) return false;
  const t = frontType(c);
  return (
    (/Legendary/.test(t) && (/Creature/.test(t) || (/\b(Vehicle|Spacecraft)\b/.test(t) && /\d|\*/.test(c.pt || '')))) ||
    /can be your commander/i.test(c.o || '') ||
    (/Legendary/.test(t) && /isn.t on the battlefield, it.s an? [^.]*\bcreature\b/i.test(c.o || ''))
  );
}
// Commander pairs that together cover a set of colors, ranked by fit.
function findPairs(d, colors, k) {
  const ctx = ctxOf(d),
    X = LIB.filter(c => c.cmd && pairKind(c)).map(c => ({
      c,
      s: baseScore(c, d, Object.assign({}, ctx, {focus: c.ci, ident: c.ci, edh: null})).s
    })),
    out = [];
  for (let i = 0; i < X.length; i++)
    for (let j = i + 1; j < X.length; j++) {
      const a = X[i],
        b = X[j];
      if (!canPair(a.c, b.c) || (!canLead(a.c) && !canLead(b.c))) continue;
      const ci = 'WUBRG'.split('').filter(z => a.c.ci.includes(z) || b.c.ci.includes(z));
      if (!colors.every(z => ci.includes(z))) continue;
      const lead = canLead(a.c) && (a.s >= b.s || !canLead(b.c)) ? a : b,
        other = lead === a ? b : a;
      out.push({n: lead.c.n, p: other.c.n, ci, s: a.s + b.s - 1.2 * (ci.length - colors.length)});
    }
  return out.sort((x, y) => y.s - x.s).slice(0, k || 4);
}
// Find a commander for an existing deck: legendary creatures that include the colors the player asks for, ranked by
// how well they fit the deck's build, how popular they are, and how few of the deck's cards they would strand.
function findCommanders(d, colors, k) {
  const ctx = ctxOf(d),
    out = [];
  for (const c of LIB) {
    if (!c.cmd || c.n === d.commander || !/Legendary/.test(c.t) || !/Creature/.test(frontType(c))) continue;
    if (!colors.every(x => c.ci.includes(x))) continue;
    const b = baseScore(c, d, Object.assign({}, ctx, {focus: c.ci, ident: c.ci, edh: null}));
    let outside = 0;
    d.cards.forEach(en => {
      const x = find(en.n);
      if (x && !x.ci.every(y => c.ci.includes(y))) outside += en.q;
    });
    out.push({n: c.n, s: b.s - 1.2 * (c.ci.length - colors.length) - 0.6 * outside, why: b.why.slice(0, 2), outside});
  }
  return out.sort((a, b) => b.s - a.s).slice(0, k || 12);
}
// Mana balance: split the deck's basic lands in proportion to the colored mana symbols its spells actually need.
// One blue card means a couple of Islands, not a third of the land base.
function manaPlan(d) {
  const ctx = ctxOf(d),
    pips = {W: 0, U: 0, B: 0, R: 0, G: 0},
    have = {W: 0, U: 0, B: 0, R: 0, G: 0};
  let basics = 0;
  const count = (c, w) =>
    (c.m.match(/\{[^}]+\}/g) || []).forEach(s => {
      for (const k of 'WUBRG') if (s.includes(k)) pips[k] += w;
    });
  d.cards.forEach(e => {
    const c = find(e.n);
    if (!c) return;
    if (tags(c).land) {
      if (BASICS[c.n]) {
        have[BASICS[c.n]] += e.q;
        basics += e.q;
      }
      return;
    }
    count(c, e.q);
  });
  const spell = Object.assign({}, pips); // what the 99 need, before the commander's own cost is weighed in
  if (ctx.cmd) count(ctx.cmd, 2);
  if (ctx.par) count(ctx.par, 2);
  const cols = 'WUBRG'.split('').filter(k => pips[k] > 0 && (d.format !== 'commander' || !ctx.cmd || ctx.ident.includes(k))),
    tot = cols.reduce((s, k) => s + pips[k], 0),
    want = {W: 0, U: 0, B: 0, R: 0, G: 0};
  // Commander (when no colour is short, a basic stays as it is): the basics are split the way the generator's mana base does it (manaBase): every colour source counts (nonbasic
  // lands fully, rocks and dorks at 0.75), each basic goes to the colour furthest below what its spells need (colourDemand).
  // Splitting basics by mana symbols alone ignored the other lands and told freshly built decks their colours had shifted.
  if (basics && tot && d.format === 'commander' && ctx.ident.length && UP.msrc) {
    const id = ctx.ident,
      req = colourDemand(d, ctx),
      src = {};
    id.forEach(k => (src[k] = 0));
    d.cards.forEach(e => {
      const c = find(e.n);
      if (!c || isBasic(c.n)) return;
      if (tags(c).land)
        [...landColors(c)].forEach(k => {
          if (k in src) src[k] += e.q;
        });
      else {
        const sm = simCard(c, id);
        if (sm.mana)
          sm.cols.forEach(k => {
            if (k in src) src[k] += e.q * 0.75;
          });
      }
    });
    const gap = k => (req[k] ? Math.max(0, 1 - src[k] / req[k]) : 0);
    for (let i = 0; i < basics; i++) {
      const k = id
        .filter(x => COLOR_BASIC[x])
        .slice()
        .sort((a, b) => gap(b) - gap(a) || (want[b] < have[b]) - (want[a] < have[a]) || req[b] - req[a])[0];
      if (!k) break;
      want[k]++;
      src[k] += 1;
    }
  } else if (basics && tot) {
    const min = basics >= 20 && cols.length <= 4 ? 2 : 1,
      f = cols.map(k => (basics * pips[k]) / tot);
    cols.forEach((k, i) => (want[k] = Math.max(min, Math.floor(f[i]))));
    let left = basics - cols.reduce((s, k) => s + want[k], 0);
    cols
      .map((k, i) => [f[i] - Math.floor(f[i]), k])
      .sort((a, b) => b[0] - a[0])
      .forEach(([, k]) => {
        if (left > 0) {
          want[k]++;
          left--;
        }
      });
    while (left > 0) {
      const k = cols.slice().sort((a, b) => pips[b] - pips[a])[0];
      want[k]++;
      left--;
    }
    while (left < 0) {
      const k = cols.filter(x => want[x] > min).sort((a, b) => want[b] - want[a])[0];
      if (!k) break;
      want[k]--;
      left++;
    }
  }
  let changes =
      basics && tot
        ? 'WUBRG'
            .split('')
            .filter(k => want[k] !== have[k])
            .map(k => ({n: COLOR_BASIC[k], k, delta: want[k] - have[k]}))
        : [],
    stuck = null;
  // A suggested rebalance must prove itself on the generator's own measure: the colour sources short of what the spells need
  // (Karsten's tables, colourDemand) must drop by at least 2. Otherwise nothing is suggested. (The practice games barely react
  // to basic lands, so they cannot be the judge here.)
  if (changes.length && d.format === 'commander' && UP.msrc) {
    const id = ctx.ident,
      req = colourDemand(d, ctx),
      src = {};
    id.forEach(k => (src[k] = 0));
    d.cards.forEach(e => {
      const c = find(e.n);
      if (!c || isBasic(c.n)) return;
      if (tags(c).land)
        [...landColors(c)].forEach(k => {
          if (k in src) src[k] += e.q;
        });
      else {
        const sm = simCard(c, id);
        if (sm.mana)
          sm.cols.forEach(k => {
            if (k in src) src[k] += e.q * 0.75;
          });
      }
    });
    const short = b => id.reduce((t, k) => t + Math.max(0, (req[k] || 0) - src[k] - (b[k] || 0)), 0);
    stuck = [+short(have).toFixed(1), +short(want).toFixed(1)];
    if (!(stuck[1] <= stuck[0] - 2)) {
      changes = [];
      Object.assign(want, have);
    }
  }
  return {pips, spell, have, want, basics, changes, stuck, off: changes.reduce((s, x) => s + Math.max(0, x.delta), 0)};
}
function applyMana(d, plan) {
  plan.changes.forEach(x => {
    if (x.delta > 0) addCard(d, x.n, x.delta);
    else cutCard(d, x.n, -x.delta);
  });
}
function addCard(d, n, q) {
  const k = keyOf(n),
    e = d.cards.find(x => keyOf(x.n) === k);
  if (d.dismissed && d.dismissed.length) d.dismissed = d.dismissed.filter(x => keyOf(x) !== k);
  if (e) e.q += q;
  else d.cards.push({n, q, l: false});
}
function cutCard(d, n, q) {
  const k = keyOf(n),
    i = d.cards.findIndex(x => keyOf(x.n) === k);
  if (i < 0) return;
  d.cards[i].q -= q;
  if (d.cards[i].q <= 0) d.cards.splice(i, 1);
}
// ----- mana base for a generated deck (spells first, then lands) -----
// How many sources of a colour a 99-card deck needs to cast a spell with p pips of it on curve about 90% of the time
// (after Frank Karsten's Commander tables; multiplayer, so a card is drawn on turn 1). Rows: pips 1–3; columns: mana value 1–7.
const KARSTEN = {1: [19, 19, 18, 16, 15, 14, 13], 2: [30, 30, 28, 26, 24, 22, 21], 3: [36, 36, 36, 34, 31, 29, 27]};
function pipNeed(c) {
  const x = {};
  ((c.m || '').split(' // ')[0].match(/\{[^}]+\}/g) || []).forEach(p => {
    const k = p.slice(1, -1);
    if (/^[WUBRG]$/.test(k)) x[k] = (x[k] || 0) + 1;
  });
  return x;
}
// What each colour needs: the mean of its five most demanding spells (one odd card does not set the whole base), the
// commander counted twice since it is cast every game.
function colourDemand(d, ctx) {
  const by = {};
  ctx.ident.forEach(k => (by[k] = []));
  const add = (c, w) => {
    const p = pipNeed(c),
      mv = Math.max(1, Math.min(7, Math.round(c.cmc || 1)));
    for (const k in p) if (by[k]) for (let i = 0; i < w; i++) by[k].push(KARSTEN[Math.min(3, p[k])][mv - 1]);
  };
  d.cards.forEach(e => {
    const c = find(e.n);
    if (c && !tags(c).land) add(c, 1);
  });
  [ctx.cmd, ctx.par].forEach(c => {
    if (c) add(c, 2);
  });
  const req = {};
  for (const k in by) {
    const v = by[k].sort((a, b) => b - a).slice(0, 5);
    req[k] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }
  return req;
}
// Chooses n lands for the deck's spells. Each pick goes to the land that most helps the colours furthest below what they need
// (an untapped land counts fully, a sometimes-tapped one a bit less, an always-tapped one less again), plus how much this
// commander's players run it. Basics fill the rest, each to the colour furthest behind. Mana rocks and dorks count as sources.
// One-colour decks (rules, Build 141): a land whose only job is making a colour of your choice, or that hurts you or depends on an
// opponent's lands to do it (City of Brass, Mana Confluence, Exotic Orchard, Command Tower), is never better than a basic there.
function monoJunkLand(c, id) {
  if (id.length !== 1 || !c || isBasic(c.n)) return false;
  const o = (c.o || '').replace(/\([^)]*\)/g, '');
  if (!/any colou?r|could produce/i.test(o)) return false;
  if (/deals? \d+ damage to you|pay \d+ life|could produce|opponent creates/i.test(o)) return true;
  return !o.replace(/\{T\}[^.\n]*?:\s*Add [^.\n]*\.?/gi, '').trim();
}
function manaBase(d, n, keep) {
  const ctx = ctxOf(d),
    id = ctx.ident.length ? ctx.ident : [],
    req = colourDemand(d, ctx),
    src = {};
  id.forEach(k => (src[k] = 0));
  d.cards.forEach(e => {
    const c = find(e.n);
    if (!c) return;
    const s = simCard(c, id);
    if (!s.land && s.mana)
      s.cols.forEach(k => {
        if (k in src) src[k] += e.q * 0.75;
      });
  });
  (keep || []).forEach(e => {
    const c = find(e.n);
    if (c)
      [...landColors(c)].forEach(k => {
        if (k in src) src[k] += e.q;
      });
  });
  const out = [],
    used = new Set(d.cards.map(e => keyOf(e.n)).concat((keep || []).map(e => keyOf(e.n))));
  used.add(keyOf(d.commander || ''));
  if (d.partner) used.add(keyOf(d.partner));
  if (!id.length) {
    if (n > 0) out.push({n: 'Wastes', q: n});
    return out;
  }
  const gap = k => (req[k] ? Math.max(0, 1 - src[k] / req[k]) : 0),
    room = Math.min(n, [0, 8, 14, 20, 23, 24][id.length]);
  const pool = LIB.filter(
    c =>
      tags(c).land &&
      !isBasic(c.n) &&
      !monoJunkLand(c, id) &&
      legalIn(c, d.format) &&
      c.ci.every(x => id.includes(x)) &&
      !used.has(c._k) &&
      mustOk(c, d) &&
      !(d.dismissed || []).some(x => keyOf(x) === c._k)
  ).map(c => {
    const cols = [...landColors(c)].filter(k => id.includes(k)),
      sp = landSpeed(c);
    return {
      c,
      cols,
      sp,
      v: baseScore(c, d, ctx).s,
      spd: sp === 'untapped' ? 1 : sp === 'cond' ? 0.85 : 0.6,
      t: !!tourneyOf(c, d)
    };
  });
  // Apex: the best lands (tournament staples) may come in past the usual room for nonbasics, up to UP.tr more
  let nb = 0;
  const roomT = Math.min(n, room + (UP.ts ? UP.tr : 0));
  while (nb < roomT) {
    let best = null,
      bs = -1e9;
    for (const p of pool) {
      if (p.used || (nb >= room && !p.t)) continue;
      const fix = p.cols.reduce((a, k) => a + gap(k), 0) * p.spd,
        s = 6 * fix + 0.35 * p.v - (p.cols.length ? 0 : 2 + (id.length - 1) * 1.5);
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    // a basic of the neediest colour is worth 6 × its gap; a nonbasic must beat that
    const kb = id.slice().sort((a, b) => gap(b) - gap(a))[0],
      basicV = 6 * gap(kb) + 0.35 * 3;
    if (!best || bs <= basicV) break;
    best.used = true;
    nb++;
    out.push({n: best.c.n, q: 1});
    best.cols.forEach(k => (src[k] += best.sp === 'tapped' ? 0.9 : 1));
  }
  const basics = {};
  for (let i = nb; i < n; i++) {
    const k = id.slice().sort((a, b) => gap(b) - gap(a) || req[b] - req[a])[0];
    basics[k] = (basics[k] || 0) + 1;
    src[k] += 1;
  }
  for (const k in basics) out.push({n: COLOR_BASIC[k], q: basics[k]});
  return out;
}
// A generated deck starts as a plan, not a decklist. The plan is the strongest (Apex) build, one slot per card; each
// expensive slot also gets a Mid (up to $12) and Budget (up to $3) stand-in that does the same job. Nothing is in the
// deck until the player installs it. Owned cards are marked so they cost nothing.
function buildPlan(d, seeds, ownOnly, ownAll) {
  return runSync(buildPlanG(d, seeds, ownOnly, ownAll));
}
// [name, needs a colour] (Arcane Signet makes nothing for a colourless commander)
const STAPLES = [
  ['Sol Ring', false],
  ['Arcane Signet', true]
];
function* buildPlanG(d, seeds, ownOnly, ownAll) {
  const tmp = JSON.parse(JSON.stringify(d));
  tmp.tier = 'apex';
  tmp.cards = [];
  delete tmp.plan;
  const cmd = find(d.commander),
    id0 = ctxOf(d).ident,
    okC = c => !cmd || c.ci.every(k => id0.includes(k));
  (seeds || []).forEach(c => {
    if (c.n !== d.commander && c.n !== d.partner && okC(c)) addCard(tmp, c.n, 1);
  });
  // Staples (owner, 31 Oct: "you dont include sol ring or arcane signet. This are in like every deck"): they go in every
  // generated Commander deck like the player's own seeds, as long as the deck's rules allow them (legal, colours, set and
  // other filters, owned when building from the collection, not ruled out). Before, only play data put them in, so a
  // commander without an EDHREC page (or a failed download) got neither. UP.staples (0: off).
  if (UP.staples && d.format === 'commander') {
    const dis = new Set((d.dismissed || []).map(norm));
    STAPLES.forEach(([n, needsColor]) => {
      const c = find(n);
      if (!c || (needsColor && !id0.length) || dis.has(c._n) || tmp.cards.some(x => norm(x.n) === c._n)) return;
      if (!legalIn(c, d.format) || !okC(c) || !mustOk(c, d) || (ownOnly && ownOnly.size && !ownOnly.has(c._n))) return;
      addCard(tmp, c.n, 1);
    });
  }
  // Reanimation engines in a reanimator deck (owner, 31 Oct: "yes" to requiring them): a deck aimed at the graveyard or at
  // reanimation always gets its UP.planCore best engines (cards that bring creatures back every turn or all at once: The
  // Soul Stone, Living Death), by its value for this deck, under the same rules as the staples. Mid and Budget builds
  // take cheaper cards for those slots from the Apex plan as usual.
  if (UP.planCore && d.format === 'commander' && (d.aims || []).some(a => /^(graveyard|edh:(reanimator|graveyard))$/.test(a))) {
    const dis = new Set((d.dismissed || []).map(norm)),
      ctxR = ctxOf(tmp),
      have = new Set(tmp.cards.map(x => norm(x.n)));
    LIB.filter(
      c =>
        isReanimEngine(c) &&
        !have.has(c._n) &&
        !dis.has(c._n) &&
        legalIn(c, d.format) &&
        okC(c) &&
        mustOk(c, d) &&
        !(ownOnly && ownOnly.size && !ownOnly.has(c._n))
    )
      .map(c => ({c, v: baseScore(c, tmp, ctxR).s}))
      .sort((a, b) => b.v - a.v)
      .slice(0, UP.planCore)
      .forEach(x => addCard(tmp, x.c.n, 1));
  }
  const seedSet = new Set(tmp.cards.map(x => norm(x.n)));
  if (ownOnly && ownOnly.size) {
    recommend.own = ownOnly;
    try {
      recommend(tmp, 0, true).adds.forEach(a => {
        if (!isBasic(a.n)) addCard(tmp, a.n, a.q);
      });
    } finally {
      recommend.own = null;
    }
  }
  fillDeck(tmp);
  // A card whose condition the finished deck barely meets (a lord with few of its type, a payoff without enablers) is swapped
  // for the next best card. The player's own seeds stay.
  if (UP.weak && d.format === 'commander')
    for (let i = 0; i < 8; i++) {
      const w = weakHere(tmp).filter(x => !seedSet.has(norm(x.n)));
      if (!w.length) break;
      const ctx0 = ctxOf(tmp),
        worst = [...new Set(w.map(x => x.n))].map(n => ({n, s: baseScore(find(n), tmp, ctx0).s})).sort((a, b) => a.s - b.s)[0];
      cutCard(tmp, worst.n, 1);
      (tmp.dismissed = tmp.dismissed || []).push(worst.n);
      if (!fillDeck(tmp)) break;
    }
  // On theme, at all times: a spell that is not from the commander's set family or of its theme creature types gives way to
  // one that is, when that card does the same job, sits in the same price band and scores within 10% of it for this deck.
  if (UP.theme && d.format === 'commander') {
    const ctxT = ctxOf(tmp),
      T = themeCtx(tmp),
      inDeck = () => new Set(tmp.cards.map(x => norm(x.n)).concat(norm(d.commander), d.partner ? norm(d.partner) : ''));
    const TP = LIB.filter(
      c =>
        !tags(c).land &&
        !isBasic(c.n) &&
        legalIn(c, d.format) &&
        c.ci.every(k => ctxT.ident.includes(k)) &&
        mustOk(c, d) &&
        themeOf(c, T) &&
        !(tmp.dismissed || []).some(n => norm(n) === c._n)
    );
    // "within reason" is measured on the whole deck: a theme swap may cost at most 0.3 deck-score points
    let simT = null,
      cur = null;
    const ev = () => {
      try {
        if (!simT) simT = simulate(tmp, 150, 7);
        return evaluateDeck(tmp, {sim: simT}).exact;
      } catch (err) {
        return null;
      }
    };
    if (TP.length)
      for (const e of tmp.cards.slice()) {
        const c = find(e.n);
        if (!c || tags(c).land || seedSet.has(c._n) || (ownOnly && ownOnly.has(c._n)) || themeOf(c, T)) continue;
        const sc = baseScore(c, tmp, ctxT).s,
          need = sc - Math.abs(sc) * (d.themeFirst ? UP.tfDrop : 0.1),
          band = priceBand(c.p),
          same = sameJobAs(c, tmp, ctxT),
          used = inDeck();
        let best = null,
          bs = -1e9;
        for (const x of TP) {
          if (used.has(x._n) || priceBand(x.p) !== band || !same(x)) continue;
          const xs = baseScore(x, tmp, ctxT).s;
          if (xs >= need && xs > bs) {
            best = x;
            bs = xs;
          }
        }
        if (best) {
          if (cur == null) cur = ev();
          cutCard(tmp, e.n, 1);
          addCard(tmp, best.n, 1);
          const nx = ev();
          if (cur != null && nx != null && nx < cur - (d.themeFirst ? UP.tfEval : 0.3)) {
            cutCard(tmp, best.n, 1);
            addCard(tmp, e.n, 1);
          } else if (nx != null) cur = nx;
        }
      }
  }
  // Mana base v2: the spells are chosen, so the lands are rebuilt for them. The player's own lands (seeds, owned) stay.
  if (UP.mb && d.format === 'commander') {
    const keepL = [],
      drop = [];
    tmp.cards.forEach(e => {
      const c = find(e.n);
      if (!c || !tags(c).land) return;
      (seedSet.has(c._n) || (ownOnly && ownOnly.has(c._n)) ? keepL : drop).push(e);
    });
    let nL = drop.reduce((a, e) => a + e.q, 0);
    const keepN = keepL.reduce((a, e) => a + e.q, 0),
      t0 = landTarget(analyze(tmp), tmp);
    drop.forEach(e => cutCard(tmp, e.n, e.q));
    // the land count follows the land formula for the spells chosen: extra spells (the next best) or fewer (the weakest go)
    if (t0 != null && UP.lf) {
      const want = Math.max(0, t0 - keepN),
        diff = want - nL,
        ctxL = ctxOf(tmp);
      if (diff > 0) {
        tmp.cards
          .map(e => ({e, c: find(e.n)}))
          .filter(x => x.c && !tags(x.c).land && !x.e.l && !seedSet.has(x.c._n) && !(ownOnly && ownOnly.has(x.c._n)))
          .map(x => ({n: x.e.n, s: baseScore(x.c, tmp, ctxL).s}))
          .sort((a, b) => a.s - b.s)
          .slice(0, diff)
          .forEach(x => cutCard(tmp, x.n, 1));
        nL = want;
      } else if (diff < 0) {
        const used = new Set(
            tmp.cards.map(e => norm(e.n)).concat([norm(tmp.commander || '')], tmp.partner ? [norm(tmp.partner)] : [])
          ),
          dis = new Set((tmp.dismissed || []).map(norm));
        const add = LIB.filter(
          c =>
            !tags(c).land &&
            !isBasic(c.n) &&
            legalIn(c, tmp.format) &&
            c.ci.every(k => ctxL.ident.includes(k)) &&
            mustOk(c, tmp) &&
            !used.has(c._n) &&
            !dis.has(c._n) &&
            (!tmp.tier || tmp.tier === 'apex' || (c.p != null && underCap(c.p, tmp.tier))) &&
            (!ownOnly || ownOnly.has(c._n))
        )
          .map(c => ({c, s: baseScore(c, tmp, ctxL).s}))
          .sort((a, b) => b.s - a.s)
          .slice(0, -diff);
        add.forEach(x => addCard(tmp, x.c.n, 1));
        nL -= add.length;
      }
    }
    manaBase(tmp, nL, keepL).forEach(x => addCard(tmp, x.n, x.q));
  }
  // Ramp cap (owner, 18 Oct; UP.rcap): no more than UP.rcap ramp cards over the target, so extra fast mana doesn't push out
  // on-theme cards. The weakest card that only makes mana (not on theme, not a seed or owned) gives way to the best spell that
  // makes no mana.
  if (UP.rcap && d.format === 'commander')
    for (let i = 0; i < 12; i++) {
      const A = analyze(tmp);
      if (A.roles.ramp <= A.T.ramp + UP.rcap) break;
      const ctxR = ctxOf(tmp),
        TR = themeCtx(tmp),
        pure = tmp.cards
          .map(e => find(e.n))
          .filter(
            c =>
              c &&
              !tags(c).land &&
              !seedSet.has(c._n) &&
              !(ownOnly && ownOnly.has(c._n)) &&
              tags(c).roles.size === 1 &&
              tags(c).roles.has('ramp') &&
              !themeOf(c, TR)
          );
      if (!pure.length) break;
      const worst = pure.map(c => ({c, s: baseScore(c, tmp, ctxR).s})).sort((a, b) => a.s - b.s)[0];
      const used = new Set(
          tmp.cards.map(e => norm(e.n)).concat([norm(tmp.commander || '')], tmp.partner ? [norm(tmp.partner)] : [])
        ),
        dis = new Set((tmp.dismissed || []).map(norm));
      let best = null,
        bs = -1e9;
      for (const c of LIB) {
        if (
          tags(c).land ||
          tags(c).roles.has('ramp') ||
          isBasic(c.n) ||
          used.has(c._n) ||
          dis.has(c._n) ||
          !legalIn(c, tmp.format) ||
          !c.ci.every(k => ctxR.ident.includes(k)) ||
          !mustOk(c, tmp)
        )
          continue;
        const v = baseScore(c, tmp, ctxR).s;
        if (v > bs) {
          bs = v;
          best = c;
        }
      }
      if (!best) break;
      cutCard(tmp, worst.c.n, 1);
      (tmp.dismissed = tmp.dismissed || []).push(worst.c.n);
      addCard(tmp, best.n, 1);
    }
  // Polish (UP.polish rounds; Build 141): the finished Apex build is run through the upgrade engine itself, and every swap it
  // finds that raises the deck score is made, strongest first, until it finds none (or UP.polish rounds), so a generated deck
  // leaves no Apex upgrade on the table. The player's own seeds and owned cards stay. Not inside the Apex reference build.
  if (UP.polish && d.format === 'commander' && !buildPlan.inRef && tmp.cards.reduce((a, e) => a + e.q, 0) >= 90) {
    const ar = apexRef(tmp);
    for (let r = 0; r < UP.polish; r++) {
      let R;
      try {
        const e = evaluateDeck(tmp, {apex: ar, games: 300});
        R = upgradePaths(tmp);
        yield* scoreCheckG(tmp, R, {apex: ar, base: e});
      } catch (err) {
        break;
      }
      const P = R.paths
        .map(L => L.opts.apex)
        .filter(
          p =>
            p &&
            p.dScore != null &&
            p.dScore >= Math.max(scoreFloor(), UP.polishMin) &&
            polishOk(tmp, p) &&
            !seedSet.has(norm(p.cut)) &&
            !(ownOnly && ownOnly.has(norm(p.cut)))
        )
        .sort((a, b) => b.dScore - a.dScore);
      const cutU = new Set(),
        addU = new Set();
      let k = 0;
      for (const p of P) {
        if (
          k >= UP.polishK ||
          cutU.has(norm(p.cut)) ||
          addU.has(norm(p.add)) ||
          !entryOf(tmp, p.cut) ||
          tmp.cards.some(e => keyOf(e.n) === keyOf(p.add))
        )
          continue;
        cutCard(tmp, p.cut, p.q || 1);
        addCard(tmp, p.add, p.q || 1);
        cutU.add(norm(p.cut));
        addU.add(norm(p.add));
        k++;
      }
      if (!k) break;
    }
  }
  const ctx = ctxOf(tmp),
    TH = themeCtx(tmp),
    used = new Set(tmp.cards.map(x => norm(x.n)));
  used.add(norm(d.commander));
  if (d.partner) used.add(norm(d.partner));
  const pool = LIB.filter(
    c =>
      c.p != null &&
      c.p < 12 &&
      legalIn(c, d.format) &&
      c.ci.every(x => ctx.ident.includes(x)) &&
      !used.has(c._n) &&
      !isBasic(c.n) &&
      mustOk(c, d)
  ).map(c => ({c, s: baseScore(c, tmp, ctx).s, land: tags(c).land, ty: mainType(c), th: !!themeOf(c, TH)}));
  // A stand-in is strictly under the tier's price and does the same job as the card it stands in for (its main job; for a
  // card with no job, the same card type), the same rule as upgrade alternatives.
  // loose (owner, 25 Oct: "it is okay to recommend another card that may not be quite as useful to the deck but provides value
  // to the slot rather than just filling it with anything"): when no card does the same job, the best card under the price that
  // still serves the slot: it shares a job with the Apex card or fits one of the deck's plans the Apex card is there for.
  const AIMS = new Map(),
    aimsOf = y => {
      if (!AIMS.has(y._k)) AIMS.set(y._k, new Set((tmp.aims || []).filter(a => matchAim(y, a, ctx.tribe) >= 0.7)));
      return AIMS.get(y._k);
    },
    alt = (x, cap, loose) => {
      const tx = tags(x),
        ty = mainType(x),
        j = mainJob(x.n),
        xa = loose ? aimsOf(x) : null;
      let best = null,
        bs = -1e9;
      for (const p of pool) {
        if (p.used || !(p.c.p < cap) || !(x.p == null || p.c.p < x.p) || p.land !== tx.land) continue;
        if (loose) {
          if (p.land) continue;
          const roles = tags(p.c).roles;
          if (![...tx.roles].some(r => roles.has(r)) && ![...aimsOf(p.c)].some(a => xa.has(a))) continue;
        } else if (!p.land && (j ? !jobsOf(p.c.n).includes(j) : p.ty !== ty || jobsOf(p.c.n).some(r => JOBS.includes(r))))
          continue;
        if (p.land && ![...landColors(x)].filter(k => ctx.ident.includes(k)).every(k => landColors(p.c).has(k))) continue;
        let s = p.s + (p.ty === ty ? 3 : 0) + (p.th ? 2 : 0),
          share = 0;
        tags(p.c).roles.forEach(r => {
          if (tx.roles.has(r)) share++;
        });
        s += share * 2;
        if (s > bs) {
          bs = s;
          best = p;
        }
      }
      if (best) best.used = true;
      return best ? best.c.n : null;
    };
  const basic = (splitBasics(1, ctx)[0] || {}).n || null,
    own = ownAll || new Set();
  const out = tmp.cards.map((en, i) => {
    const c = find(en.n),
      S0 = {id: i + 1, a: en.n, q: en.q};
    if (!c) return S0;
    if (isBasic(c.n)) {
      S0.basic = true;
      S0.land = true;
      return S0;
    }
    if (tags(c).land) S0.land = true;
    if (seedSet.has(c._n)) {
      S0.seed = true;
      if (own.has(c._n)) S0.own = true;
      return S0;
    }
    if (own.has(c._n)) {
      S0.own = true;
      return S0;
    }
    if (c.p == null || c.p < 3) return S0;
    if (c.p >= 12) {
      const m = alt(c, 12),
        mc = m && find(m);
      if (mc && mc.p < 3) S0.b = m;
      else {
        if (m) S0.m = m;
        S0.b = alt(c, 3);
      }
    } else S0.b = alt(c, 3);
    if (UP.looseAll) (delete S0.m, delete S0.b); // tests only: every slot takes the loose pass, to check what it picks
    // no card under the price does the same job: the closest card that still serves the slot (loose), marked so
    if (c.p >= 12 && !S0.m && !S0.b) {
      S0.m = alt(c, 12, true);
      if (S0.m) S0.mx = true;
    }
    if (!S0.b && !S0.land) {
      S0.b = alt(c, 3, true);
      if (S0.b) S0.bx = true;
    }
    if (!S0.b && S0.land && basic) S0.b = basic;
    if (!S0.b) delete S0.b;
    return S0;
  });
  // The Apex build is the strongest one: where a slot's cheaper stand-in makes the whole Apex deck score higher, it becomes the
  // Apex card (and the cheaper tiers use it when it fits their price). Measured with the deck's own practice games.
  if (UP.planMax && d.format === 'commander' && tmp.cards.length >= 90) {
    try {
      const S1 = simulate(tmp, 150, 7);
      let base = evaluateDeck(tmp, {sim: S1}).exact;
      for (const S0 of out) {
        if (S0.seed || S0.own || S0.land || S0.basic) continue;
        for (const k of ['m', 'b']) {
          const alt = S0[k];
          if (!alt) continue;
          const u = JSON.parse(JSON.stringify(tmp));
          cutCard(u, S0.a, 1);
          addCard(u, alt, 1);
          const v = evaluateDeck(u, {sim: S1}).exact;
          if (v > base + SCORE_MIN) {
            cutCard(tmp, S0.a, 1);
            addCard(tmp, alt, 1);
            S0.a = alt;
            base = v;
            const ac = find(alt);
            if (ac && ac.p != null && ac.p < 12) delete S0.m;
            if (ac && ac.p != null && ac.p < 3) delete S0.b;
            break;
          }
        }
      }
    } catch (e) {}
  }
  return out;
}
// Polish a finished deck at its own price level (Build 141): the upgrade engine is run on it and every swap it finds for that
// level that raises the deck score is made, strongest first, round after round until none is left (UP.polish rounds). Locked
// cards stay. Used after a Mid or Budget build is filled (the Apex build is polished inside buildPlan).
// Polishing keeps the players' cards (UP.polP, Build 145): a card at least UP.polP of this commander's players run is swapped out
// only for a clear gain (UP.polG or more), unless the card coming in is run about as much.
function polishOk(d, p) {
  if (!UP.polP) return true;
  const E = ctxOf(d).edh;
  if (!E || !E.map || E.map.size < 100) return true;
  const inc = n => {
    const c = find(n),
      x = c && edhOf(E.map, c);
    return x ? x.inc : 0;
  };
  const ic = inc(p.cut);
  return ic < UP.polP || p.dScore >= UP.polG || inc(p.add) >= ic - 0.1;
}
function polishDeck(d, rounds) {
  return runSync(polishDeckG(d, rounds));
}
// slots (UP.polishSlot, owner 25 Oct: Mid and Budget are cheaper versions of the Apex build): each card's Apex slot card. A swap
// may only replace a stand-in (a slot whose Apex card is over the price keeps its Apex card otherwise) with another card that
// serves the same Apex slot (does its job, shares a job, or fits a plan it is there for), so every card stays traceable.
function slotServes(d, a, add, t) {
  const A = a && find(a),
    X = add && find(add);
  if (!A || !X) return false;
  if (underCap(A.p, t)) return false; // the slot holds its Apex card: it stays
  const ctx = ctxOf(d);
  if (sameJobAs(A, d, ctx)(X)) return true;
  const ra = tags(A).roles,
    rx = tags(X).roles;
  if ([...ra].some(r => rx.has(r))) return true;
  return (d.aims || []).some(k => matchAim(A, k, ctx.tribe) >= 0.7 && matchAim(X, k, ctx.tribe) >= 0.7);
}
function* polishDeckG(d, rounds, slots) {
  if (!UP.polish || d.format !== 'commander' || !find(d.commander)) return 0;
  const t = d.tier || 'apex',
    ar = apexRef(d);
  let n = 0;
  for (let r = 0; r < (rounds || UP.polish); r++) {
    let R, e;
    try {
      e = evaluateDeck(d, {apex: ar, games: 300});
      R = upgradePaths(d);
      yield* scoreCheckG(d, R, {apex: ar, base: e});
    } catch (err) {
      break;
    }
    const keep = new Set(d.cards.filter(x => x.l).map(x => norm(x.n))),
      P = R.paths
        .map(L => tierPick(L, t))
        .filter(
          p =>
            p &&
            p.dScore != null &&
            p.dScore >= Math.max(scoreFloor(), UP.polishMin) &&
            polishOk(d, p) &&
            !keep.has(norm(p.cut)) &&
            (!slots || slotServes(d, slots.get(norm(p.cut)), p.add, t))
        )
        .sort((a, b) => b.dScore - a.dScore);
    const cutU = new Set(),
      addU = new Set();
    let k = 0;
    const before = UP.polishSlot ? JSON.stringify(d.cards) : null; // a round that does not raise the score is undone
    for (const p of P) {
      if (
        k >= UP.polishK ||
        cutU.has(norm(p.cut)) ||
        addU.has(norm(p.add)) ||
        !entryOf(d, p.cut) ||
        d.cards.some(x => keyOf(x.n) === keyOf(p.add))
      )
        continue;
      cutCard(d, p.cut, p.q || 1);
      addCard(d, p.add, p.q || 1);
      if (slots) slots.set(norm(p.add), slots.get(norm(p.cut)));
      cutU.add(norm(p.cut));
      addU.add(norm(p.add));
      k++;
    }
    if (k && before) {
      let after = null;
      try {
        after = evaluateDeck(d, {apex: ar, games: 300}).exact;
      } catch (err) {}
      if (after == null || after < e.exact + SCORE_MIN) {
        d.cards = JSON.parse(before);
        break;
      }
    }
    n += k;
    if (!k) break;
  }
  return n;
}
// Price band by the owner's rule: Budget strictly under $3, Mid strictly under $12, Apex anything else (or unknown).
function priceBand(p) {
  return p == null ? 'apex' : p < 3 ? 'budget' : p < 12 ? 'mid' : 'apex';
}
// "See alternatives": cards that fill the same slot as a recommended card when the player doesn't have it. Each one does the
// same job (the stand-in rule above: its main job, or for a card with no job the same type and part of the deck's plan),
// sits in the same price band, and is among the strongest such cards for this deck: in the top ALT_TOP of every same-job,
// same-band card it could play. The pick itself was chosen as the best, so closeness is measured against that field, not
// against the pick's own score. Same card type and shared roles rank first. For an upgrade (o.cut) every alternative must
// still beat the card it replaces. An Apex-band alternative costs at most twice the pick, so it is no big step up in price.
const ALT_TOP = 0.2;
// Does card x do the same job as card c in this deck? Its main job; for a card with no job, the same card type and a shared
// part of the deck's plan; a land must make every deck colour the other land makes.
function sameJobAs(c, ref, ctx, lv) {
  const sx = lv != null ? lv : UP.sjx,
    land = !!tags(c).land,
    ty = mainType(c),
    j = mainJob(c.n);
  const aimSet = x => {
      const s = new Set();
      (ref.aims || []).forEach(a => {
        if (matchAim(x, a, ctx.tribe) >= 0.7) s.add(a);
      });
      return s;
    },
    aims = aimSet(c);
  return x => {
    const t = tags(x);
    if (!!t.land !== land) return false;
    if (land) return [...landColors(c)].filter(k => ctx.ident.includes(k)).every(k => landColors(x).has(k));
    if (j) return jobsOf(x.n).includes(j);
    if (mainType(x) !== ty || (sx < 1 && jobsOf(x.n).some(r => JOBS.includes(r)))) return false;
    return sx >= 2 || !aims.size || [...aimSet(x)].some(a => aims.has(a));
  };
}
function altsFor(d, name, o) {
  o = o || {};
  const c = find(name);
  if (!c) return [];
  const ref = JSON.parse(JSON.stringify(d));
  delete ref.plan;
  if (o.deck) ref.cards = o.deck.map(x => ({n: x.n, q: x.q}));
  const ctx = ctxOf(ref),
    val = o.val || (x => baseScore(x, ref, ctx).s),
    band = priceBand(c.p),
    tc = tags(c),
    land = !!tc.land,
    ty = mainType(c),
    j = mainJob(c.n);
  const used = new Set(ref.cards.map(x => norm(x.n)));
  used.add(norm(d.commander));
  if (d.partner) used.add(norm(d.partner));
  used.add(c._n);
  (o.skip || []).forEach(n => used.add(norm(n)));
  const dis = new Set((d.dismissed || []).map(norm));
  const same = sameJobAs(c, ref, ctx);
  const vcut = o.cut && find(o.cut) ? val(find(o.cut)) : null;
  // The deck's playable pool (format, colours, filter rules) is the same for every search on this deck, so it is kept.
  const pk = [
    d.format,
    ctx.ident.join(''),
    JSON.stringify([d.setsMust && d.sets, d.typesMust && d.types, d.keysMust && d.keys]),
    LIB.length,
    SETCARDS.size
  ].join('|');
  if (!altsFor.pool || altsFor.pool.k !== pk)
    altsFor.pool = {
      k: pk,
      L: LIB.filter(x => !isBasic(x.n) && legalIn(x, d.format) && x.ci.every(k => ctx.ident.includes(k)) && mustOk(x, d))
    };
  const vm = o.vmemo || new Map(),
    V = x => {
      if (!vm.has(x._k)) vm.set(x._k, val(x));
      return vm.get(x._k);
    };
  const C = altsFor.pool.L.filter(
    x =>
      !used.has(x._n) &&
      !dis.has(x._n) &&
      (x.p != null || band === 'apex') &&
      priceBand(x.p) === band &&
      (band !== 'apex' || c.p == null || x.p == null || x.p <= 2 * c.p) &&
      same(x)
  ).map(x => {
    let share = 0;
    tags(x).roles.forEach(r => {
      if (tc.roles.has(r)) share++;
    });
    const v = V(x);
    return {c: x, v, fit: v + (mainType(x) === ty ? 3 : 0) + 2 * share};
  });
  if (!C.length) return [];
  // Cards from the commander's own set (or franchise) and cards of its theme creature types come first, always; they need
  // half of the pick's gain over the card in the slot, where the rest need the top-of-field floor.
  const T = themeCtx(ref),
    vc = val(c),
    half = vcut != null ? vcut + 0.5 * (vc - vcut) : vc - Math.abs(vc) * 0.25;
  C.forEach(y => {
    y.theme = themeOf(y.c, T);
  });
  const vs = C.map(y => y.v).sort((a, b) => b - a),
    floor = vs[Math.min(vs.length - 1, Math.floor(vs.length * ALT_TOP))];
  const ok = C.filter(y => (vcut == null || y.v > vcut) && (o.all || y.v >= floor || (y.theme && y.v >= half)));
  return ok
    .sort((a, b) => !!b.theme - !!a.theme || b.fit - a.fit || (a.c.p || 0) - (b.c.p || 0))
    .slice(0, o.all ? 400 : o.n || 6)
    .map(y => ({n: y.c.n, p: y.c.p, v: +y.v.toFixed(2), band, job: j || '', type: mainType(y.c), theme: y.theme}));
}
// On theme: the commander's own set family (a Universes Beyond franchise counts as one: every Marvel set is Marvel), or a
// creature type the commander or the deck's tribe is built on. Class types every set uses (Human, Warrior, Wizard…) don't count.
const GENERIC_TYPES = new Set(
  'Human Warrior Soldier Wizard Cleric Rogue Shaman Knight Noble Advisor Artificer Scout Citizen Peasant Monk Druid Assassin Berserker Archer Scientist Detective Spellshaper Mercenary Coward Performer Rebel Pilot Spirit Construct Avatar'.split(
    ' '
  )
);
function franchiseOf(c) {
  const s = (c && c.set) || '';
  if (/^Marvel/.test(s)) return 'Marvel';
  return s.replace(/\s+(Commander|Eternal|Jumpstart.*|Art Series|Alchemy.*|Promos|Tokens)$/, '').trim();
}
function subtypesOf(c) {
  const t = c ? frontType(c) : '';
  return /Creature|Kindred|Tribal/.test(t) && t.includes('—') ? t.split('—')[1].trim().split(/\s+/) : [];
}
function themeCtx(d) {
  const cs = [find(d.commander), d.partner && find(d.partner)].filter(Boolean),
    fam = new Set(),
    types = new Set();
  cs.forEach(c => {
    const f = franchiseOf(c);
    if (f) fam.add(f);
    subtypesOf(c).forEach(t => {
      if (!GENERIC_TYPES.has(t)) types.add(t);
    });
  });
  if (d.tribe) types.add(d.tribe);
  return {fam, types};
}
function themeCtxC(d) {
  const k = [d.commander, d.partner || '', d.tribe || ''].join('|');
  if (themeCtxC.k !== k) {
    themeCtxC.k = k;
    themeCtxC.v = themeCtx(d);
  }
  return themeCtxC.v;
}
function themeOf(c, T) {
  if (!c || !T) return '';
  const f = franchiseOf(c);
  if (f && T.fam.has(f)) return 'From ' + f;
  const st = subtypesOf(c).find(x => T.types.has(x));
  return st ? 'Fits the ' + st + ' theme' : '';
}
function syncPlan(d) {
  if (!d.plan) return false;
  const inDeck = new Set(d.cards.filter(e => !isBasic(e.n)).map(e => keyOf(e.n))),
    n0 = d.plan.length;
  d.plan = d.plan.filter(x => x.basic || ![x.a, x.m, x.b].some(y => y && inDeck.has(keyOf(y))));
  if (!d.plan.length) delete d.plan;
  return (d.plan ? d.plan.length : 0) !== n0;
}
function planNeed(d) {
  return analyze(d).T.size - (d.format === 'commander' && d.commander ? 1 : 0) - (d.partner ? 1 : 0);
}
// Add every plan slot at one price level (or only the cards you own), best picks first, as many as there is room for.
function planAll(d, v) {
  let k = 0,
    room = planNeed(d) - d.cards.reduce((a, e) => a + e.q, 0);
  const rk = x => (x.seed ? 0 : x.own ? 1 : x.basic ? 4 : x.land ? 3 : 2);
  // Mid and Budget are strict price levels: a slot whose only pick is over the price (no same-job stand-in) is left open,
  // and the open slots are filled by the generator at that price level instead.
  const over = n => {
    const c = find(n);
    return (v === 'mid' || v === 'budget') && c && c.p != null && !underCap(c.p, v);
  };
  (d.plan || [])
    .slice()
    .sort((a, b) => rk(a) - rk(b) || a.id - b.id)
    .forEach(x => {
      if (room <= 0 || (v === 'own' && !x.own)) return;
      if (x.q > room) {
        if (x.basic) {
          addCard(d, x.a, room);
          x.q -= room;
          k += room;
          room = 0;
        }
        return;
      }
      if (v === 'own') {
        room -= x.q;
        if (planInstall(d, x, 'a')) k += x.q;
        return;
      }
      const n = x.own || x.seed || x.basic ? x.a : planPick(x, v);
      if (!x.own && !x.seed && over(n)) return;
      // (UP.midOpen, Build 145) at Mid (and Budget with UP.budOpen), a spell slot whose Apex card is over the price is left open for the
      // best card at that price overall, instead of the cheaper card that does the same job
      if (!x.own && !x.seed && !x.land && n !== x.a && ((v === 'mid' && UP.midOpen) || (v === 'budget' && UP.budOpen))) return;
      room -= x.q;
      if (planInstall(d, x, n === x.b ? 'b' : n === x.m ? 'm' : 'a')) k += x.q;
    });
  if ((v === 'mid' || v === 'budget') && room > 0) {
    const t0 = d.tier,
      n0 = d.cards.reduce((a, e) => a + e.q, 0);
    d.tier = v;
    try {
      fillDeck(d);
    } finally {
      d.tier = t0;
    }
    k += d.cards.reduce((a, e) => a + e.q, 0) - n0;
    syncPlan(d);
  }
  return k;
}
function planInstall(d, x, key) {
  const n = key === 'b' ? x.b : key === 'm' ? x.m : x.a;
  if (!n) return false;
  addCard(d, n, x.q);
  const en = d.cards.find(y => y.n === n);
  if (en && !x.basic) {
    en.step = key === 'b' ? 1 : key === 'm' ? 2 : 3;
    if (x.seed) en.l = true;
  }
  d.plan = d.plan.filter(y => y !== x);
  if (!d.plan.length) delete d.plan;
  return true;
}
// Fill a new deck from its generated plan (Build 143): the plan is designed, then, when a price level is chosen, the deck is built
// straight from it and polished at that level. The same function runs in the background worker (work.js) and on the page, so
// a deck comes out the same wherever it was built. ownAll: the player's owned cards; ownOnly: build from them first.
function genDeck(nd, seeds, ownOnly, ownAll, fill) {
  return runSync(genDeckG(nd, seeds, ownOnly, ownAll, fill));
}
function* genDeckG(nd, seeds, ownOnly, ownAll, fill) {
  const own0 = upgradePaths.own;
  upgradePaths.own = ownAll || new Set();
  try {
    nd.plan = yield* buildPlanG(nd, seeds || [], ownOnly, ownAll || new Set());
    const n = nd.plan.reduce((s, x) => s + x.q, 0);
    let k = 0;
    if (fill) {
      const slots = new Map();
      if (UP.polishSlot)
        nd.plan.forEach(x => [x.a, x.m, x.b].filter(Boolean).forEach(n => slots.has(norm(n)) || slots.set(norm(n), x.a)));
      const nb = fill === 'mid' && UP.polishSlot ? JSON.parse(JSON.stringify(nd)) : null,
        nbSlots = nb ? new Map(slots) : null;
      k = planAll(nd, fill);
      delete nd.plan;
      nd.tier = fill;
      if (fill !== 'apex' && UP.tierPolish) yield* polishDeckG(nd, 0, UP.polishSlot ? slots : null);
      // Mid is never weaker than Budget (owner, 25 Oct): the Budget build is made from the same Apex build, and when it scores
      // higher it is the Mid deck too (every card is under $12)
      if (fill === 'mid' && UP.polishSlot && nb) {
        planAll(nb, 'budget');
        delete nb.plan;
        nb.tier = 'budget';
        if (UP.tierPolish) yield* polishDeckG(nb, 0, nbSlots);
        try {
          const ar = apexRef(nd),
            vm = evaluateDeck(nd, {apex: ar, games: 300}).exact,
            vb = evaluateDeck(Object.assign({}, nb, {tier: 'mid'}), {apex: ar, games: 300}).exact;
          if (vb > vm) nd.cards = nb.cards;
        } catch (err) {}
      }
      if (fill === 'budget' && nd.budget && nd.budget.total > 0) fitBudget(nd, nd.budget.total, ownAll || new Set());
    }
    return {n, k};
  } finally {
    upgradePaths.own = own0;
  }
}
// A generated Budget deck with a total budget (owner, 20 Oct) fits it. Owned cards and basic lands cost nothing, and so does the
// commander when the player owns it. deckCost is what the player would still have to buy.
function deckCost(d, own) {
  own = own || new Set();
  let t = 0;
  const price = n => {
    if (!n || isBasic(n) || own.has(norm(n))) return 0;
    const c = find(n);
    return (c && c.p) || 0;
  };
  for (const e of d.cards) t += price(e.n) * (e.q || 1);
  if (!(d.budget && d.budget.cmdOwned)) t += price(d.commander) + price(d.partner);
  return Math.round(t * 100) / 100;
}
// While the deck costs more than the budget, one paid card gives way to the strongest card that does the same job for less
// (an owned card is free; nothing new costs $3 or more): of the eight priciest cards, the swap that loses the least strength per
// dollar saved. With no cheaper stand-in left, the priciest card gives way to a basic land (ten at most, so the deck is not
// gutted to reach an impossible total). The player's own seeds stay.
const BASIC_OF = {W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest'};
function fitBudget(d, total, own) {
  own = own || new Set();
  const ctx = ctxOf(d),
    vm = new Map(),
    val = x => {
      if (!vm.has(x._k)) vm.set(x._k, baseScore(x, d, ctx).s);
      return vm.get(x._k);
    },
    cost = x => (own.has(x._n) ? 0 : x.p),
    used = new Set(d.cards.map(e => norm(e.n)).concat([norm(d.commander), norm(d.partner || '')])),
    dis = new Set((d.dismissed || []).map(norm)),
    pool = LIB.filter(
      x => !isBasic(x.n) && legalIn(x, d.format) && x.ci.every(k => ctx.ident.includes(k)) && mustOk(x, d) && !dis.has(x._n)
    );
  // the commander alone over the budget: nothing in the 99 can fix that, so the deck is left as built
  const cmdOnly = deckCost({cards: [], commander: d.commander, partner: d.partner, budget: d.budget}, own);
  let left = deckCost(d, own),
    guard = 150,
    lands = 10;
  // each card's cheaper stand-ins, found once: [card, its price, its strength]
  const subs = new Map(),
    subsOf = c => {
      if (!subs.has(c._k)) {
        const same = sameJobAs(c, d, ctx);
        subs.set(
          c._k,
          pool
            .filter(y => {
              const py = cost(y);
              return py != null && py < c.p && (py === 0 || py < TIERS.budget.cap) && y._n !== c._n && same(y);
            })
            .map(y => [y, cost(y), val(y)])
        );
      }
      return subs.get(c._k);
    };
  while (left > total && cmdOnly < total && guard-- > 0) {
    const paid = d.cards
      .filter(e => !e.l && !isBasic(e.n) && !own.has(norm(e.n)))
      .map(e => ({e, c: find(e.n)}))
      .filter(x => x.c && x.c.p > 0)
      .sort((a, b) => b.c.p - a.c.p)
      .slice(0, 8);
    if (!paid.length) break;
    let best = null;
    for (const x of paid) {
      const vx = val(x.c);
      for (const [y, py, vy] of subsOf(x.c)) {
        if (used.has(y._n)) continue;
        const loss = (vx - vy) / (x.c.p - py);
        if (!best || loss < best.loss) best = {x, y, loss};
      }
    }
    if (best) {
      cutCard(d, best.x.e.n, 1);
      addCard(d, best.y.n, 1);
      used.add(best.y._n);
    } else if (lands-- > 0) {
      cutCard(d, paid[0].e.n, 1);
      addCard(d, BASIC_OF[ctx.ident[0]] || 'Wastes', 1);
    } else break;
    left = deckCost(d, own);
  }
  d.budget = Object.assign({}, d.budget, {cost: left});
  return left;
}
// A slot's card at a price level: its own card for that level, else (Mid) the Apex card when it already fits, else a cheaper
// level's card (a Budget card is under $12 too; owner, 25 Oct: Mid had left such slots open).
function planPick(s, t) {
  if (t === 'apex') return s.a;
  if (t === 'mid') return s.m || (underCap((find(s.a) || {}).p, 'mid') ? s.a : s.b || s.a);
  return s.b || s.m || s.a;
}
function fillDeck(d) {
  const r = recommend(d, 0, true);
  r.adds.forEach(a => addCard(d, a.n, a.q));
  return r.adds.reduce((s, a) => s + a.q, 0);
}
function setCommander(d, name) {
  const c = find(name),
    old = d.commander,
    fromDeck = !!entryOf(d, name),
    next = c ? c.n : name;
  if (old && keyOf(old) !== keyOf(next) && fromDeck) addCard(d, old, 1);
  d.commander = next;
  cutCard(d, next, 1);
  if (d.partner) {
    const p = find(d.partner);
    if (!p || !c || !canPair(c, p)) delete d.partner;
  }
  if (c && !d.aimLocked) {
    const st = detectStrategy(c, d);
    d.tribe = st.tribe || d.tribe || '';
    if (!d.aims.length) d.aims = st.themes.slice(0, 3);
    d.colors = c.ci.slice();
  }
}
// ----- independent deck validator -----
// Checks a deck against the Commander construction rules and the app's own rules. It shares nothing with the
// recommendation scoring: a high score can never make an invalid deck pass. Returns [{key, card, note}].
function validateDeck(d) {
  const v = [],
    push = (key, card, note) => v.push({key, card: card || '', note: note || ''});
  if (d.format !== 'commander') {
    return v;
  }
  const cmd = find(d.commander),
    par = d.partner ? find(d.partner) : null;
  if (!d.commander) push('commander_missing');
  else if (!cmd) push('unresolved_identity', d.commander);
  else {
    if (!cmd.cmd) push('format_not_legal', cmd.n);
    if (!canLead(cmd)) push('commander_ineligible', cmd.n);
  }
  if (d.partner) {
    if (!par) push('unresolved_identity', d.partner);
    else if (!cmd || !canPair(cmd, par)) push('commander_pair_invalid', par.n);
  }
  const ident = new Set((cmd ? cmd.ci : []).concat(par ? par.ci : [])),
    BT = {Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G'};
  let total = (d.commander ? 1 : 0) + (d.partner ? 1 : 0);
  const seen = new Map();
  for (const e of d.cards) {
    total += e.q;
    const c = find(e.n);
    if (!c) {
      push('unresolved_identity', e.n);
      continue;
    }
    if (!c.cmd) push('format_not_legal', c.n);
    if (!c.ci.every(x => ident.has(x))) push('off_color_identity', c.n);
    (frontType(c).split('—')[1] || '')
      .trim()
      .split(/\s+/)
      .forEach(t => {
        if (BT[t] && !ident.has(BT[t])) push('land_type_color_invalid', c.n, t);
      });
    seen.set(c._k, (seen.get(c._k) || 0) + e.q);
    if (seen.get(c._k) > copyLimit(d, c)) push('singleton_conflict', c.n);
  }
  [cmd, par].forEach(c => {
    if (c && seen.has(c._k)) push('singleton_conflict', c.n, 'also in the deck');
  });
  if (total !== 100) push('wrong_deck_size', '', total + ' cards');
  return v;
}
// A package of swaps applied to a copy of the deck: every cut must be in the deck, no addition may already be there (under
// any name or printing), held picks must be the ones the player holds, and the result must still be a valid deck.
function validatePackage(d, pairs) {
  const v = [],
    copy = JSON.parse(JSON.stringify(d));
  for (const p of pairs) {
    if (!entryOf(copy, p.cut)) {
      v.push({key: 'cut_absent', card: p.cut});
      continue;
    }
    if (entryOf(copy, p.add) && !isBasic(p.add)) v.push({key: 'installed_addition', card: p.add});
    cutCard(copy, p.cut, p.q || 1);
    addCard(copy, p.add, p.q || 1);
  }
  // Only active holds count, the same ones upgradePaths keeps: a hold whose card was excluded, installed, or whose cut card
  // has left the deck is not active (allowing an excluded card again brings its hold back).
  const dis = new Set((d.dismissed || []).map(keyOf));
  for (const k in d.recP || {}) {
    const r = d.recP[k];
    if (!r || !r.pair || dis.has(keyOf(r.pair.add)) || entryOf(d, r.pair.add) || !entryOf(d, r.pair.cut)) continue;
    const P = pairs.find(p => keyOf(p.cut) === keyOf(r.pair.cut));
    if (P && keyOf(P.add) !== keyOf(r.pair.add) && P.t === r.t) v.push({key: 'held_pick_changed', card: r.pair.add});
  }
  const before = new Set(validateDeck(d).map(x => x.key + '|' + x.card));
  validateDeck(copy).forEach(x => {
    if (!before.has(x.key + '|' + x.card)) v.push(x);
  });
  return v;
}
function searchCards(q, f, limit) {
  const nq = norm(q || ''),
    lq = (q || '').toLowerCase().trim(),
    res = [];
  for (const c of LIB) {
    let rank = 3;
    if (nq) {
      if (c._n.startsWith(nq)) rank = 0;
      else if (c._n.includes(nq)) rank = 1;
      else if (lq.length >= 3 && ((c.o || '').toLowerCase().includes(lq) || (c.t || '').toLowerCase().includes(lq))) rank = 2;
      else continue;
    }
    if (f) {
      if (f.fmt && !legalIn(c, f.fmt)) continue;
      if (f.color && (f.color === 'C' ? c.ci.length : !c.ci.includes(f.color))) continue;
      if (f.within && !c.ci.every(x => f.within.includes(x))) continue;
      if (f.type && !new RegExp('\\b' + f.type + '\\b').test(c.t)) continue;
      if (f.legend && !canLead(c)) continue; // anything that may be a commander: legendary creatures, "can be your commander" cards, legendary vehicles with power
      if (f.max && !(c.p != null && c.p <= f.max)) continue;
      if (f.theme && !(matchAim(c, f.theme, f.tribe) >= 0.7)) continue;
    }
    res.push([rank, c]);
  }
  res.sort((a, b) => a[0] - b[0] || (a[1].r || 1e6) - (b[1].r || 1e6) || a[1].n.localeCompare(b[1].n));
  return {total: res.length, cards: res.slice(0, limit || 60).map(x => x[1])};
}
