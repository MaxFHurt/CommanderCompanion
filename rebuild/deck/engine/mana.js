// A land may replace another only if it makes every deck colour the old one made (Build 137): Thriving Isle (blue and one chosen
// colour) needs a land making blue and another colour; a basic needs its colour.
function landCovers(cut, add, ident) {
  if (!cut || !add) return false;
  const A = new Set([...landColors(add)].filter(z => ident.includes(z))),
    sc = simCard(cut, ident);
  if (sc.chosen) {
    const fx = (sc.fixed || []).filter(z => ident.includes(z));
    return fx.every(z => A.has(z)) && A.size >= fx.length + 1;
  }
  return [...landColors(cut)].filter(z => ident.includes(z)).every(z => A.has(z));
}
function fixSwaps(d, kind, o) {
  o = o || {};
  if (d.format !== 'commander' || !find(d.commander)) return [];
  const ctx = ctxOf(d),
    A = analyze(d),
    T = A.T,
    val = o.val || (c => baseScore(c, d, ctx).s),
    n = o.n || 6;
  const inDeck = new Set(d.cards.map(e => keyOf(e.n)).concat([keyOf(d.commander)], d.partner ? [keyOf(d.partner)] : [])),
    dis = new Set((d.dismissed || []).map(keyOf));
  const priceOk = c => !d.tier || d.tier === 'apex' || c.p == null || underCap(c.p, d.tier);
  const addOk = c =>
    c &&
    !inDeck.has(c._k) &&
    !dis.has(c._k) &&
    !isBasic(c.n) &&
    legalIn(c, d.format) &&
    c.ci.every(z => ctx.ident.includes(z)) &&
    mustOk(c, d) &&
    priceOk(c);
  const short = j => (A.roles[j] || 0) <= (T[j] || 0); // a job at or below its target is not given up
  const spells = d.cards
    .map(e => ({e, c: find(e.n)}))
    .filter(x => x.c && !x.e.l && !tags(x.c).land)
    .map(x => ({n: x.e.n, c: x.c, v: val(x.c), roles: tags(x.c).roles}));
  const cutsFor = keep =>
    spells
      .filter(x => ![...x.roles].some(r => ['ramp', 'draw', 'removal', 'wipe'].includes(r) && (r === keep || short(r))))
      .sort((a, b) => a.v - b.v);
  const evid = c => {
    const e = ctx.edh && edhOf(ctx.edh.map, c);
    return (e && e.inc >= 0.05) || (c.r && c.r < 3000);
  };
  const best = (f, k) =>
    LIB.filter(c => addOk(c) && f(c) && evid(c))
      .map(c => ({c, v: val(c)}))
      .sort((a, b) => b.v - a.v)
      .slice(0, k);
  // With o.score (the deck-score change of a swap), each fixing card is tried against the five cards the deck can best spare
  // and keeps the cut that leaves the deck strongest; the swaps are then listed best first.
  const pairUp = (adds, cuts, why) => {
    if (!o.score) return adds.slice(0, Math.min(n, cuts.length)).map((a, i) => ({cut: cuts[i].n, add: a.c.n, q: 1, kind, why}));
    const spare = o.spareLands && o.landScore && !adds.some(a => tags(a.c).land) ? spareLands(d) : [],
      uL = [];
    const used = new Set(),
      out = [];
    for (const [ai, a] of adds.slice(0, n + 4).entries()) {
      let b = null;
      for (const cu of cuts.filter(x => !used.has(x.n)).slice(0, 5)) {
        const v = o.score(cu.n, a.c.n);
        if (v != null && (!b || v > b.v)) b = {cu, v};
      }
      // a spare land (the deck runs more than its target) can go instead; land changes need fresh practice games to measure
      const ln = ai < 3 && spare.find((x, i) => !uL.includes(i));
      if (ln) {
        const v = o.landScore(ln, a.c.n);
        if (v != null && (!b || v > b.v)) b = {cu: {n: ln}, v, land: spare.findIndex((x, i) => x === ln && !uL.includes(i))};
      }
      if (b) {
        if (b.land != null) uL.push(b.land);
        else used.add(b.cu.n);
        out.push({
          cut: b.cu.n,
          add: a.c.n,
          q: 1,
          kind,
          why: b.land != null ? why + ' · takes out a spare land' : why,
          dScore: b.v
        });
      }
    }
    return out.sort((x, y) => y.dScore - x.dScore).slice(0, n);
  };
  if (['ramp', 'draw', 'removal', 'wipe'].includes(kind))
    return pairUp(
      best(c => !tags(c).land && tags(c).roles.has(kind), n),
      cutsFor(kind),
      'Adds ' + FIX_KINDS[kind].toLowerCase()
    );
  if (kind === 'landsUp') {
    const lands = best(c => tags(c).land && [...landColors(c)].some(z => ctx.ident.includes(z)) && landSpeed(c) !== 'tapped', n);
    const bas = splitBasics(Math.max(1, n - lands.length), ctx)
      .map(x => ({c: find(x.n), v: 0}))
      .filter(x => x.c);
    return pairUp(lands.concat(bas), cutsFor(''), 'Adds a land');
  }
  if (kind === 'landsDown') {
    const L = d.cards
      .map(e => ({e, c: find(e.n)}))
      .filter(x => x.c && !x.e.l && tags(x.c).land)
      .map(x => ({n: x.e.n, v: isBasic(x.c.n) ? -1 : val(x.c) - (landSpeed(x.c) === 'tapped' ? 5 : 0)}))
      .sort((a, b) => a.v - b.v);
    const need = ['ramp', 'draw', 'removal', 'wipe'].sort((a, b) => A.roles[a] - T[a] - (A.roles[b] - T[b]))[0];
    return pairUp(
      best(c => !tags(c).land && tags(c).roles.has(need), n),
      L,
      'Swaps a land for ' + FIX_KINDS[need].toLowerCase()
    );
  }
  if (kind === 'mana') {
    if (ctx.ident.length < 2) return []; // one-colour decks can't be stuck on a colour
    const cols = c => [...landColors(c)].filter(z => ctx.ident.includes(z)).length;
    // in: lands that make two or more of the deck's colours and can enter untapped. Out: lands that always enter tapped, then
    // spare basics (from the most common type). Other lands may do something besides make mana, so they are left alone.
    const adds = best(c => tags(c).land && cols(c) >= 2 && landSpeed(c) !== 'tapped', n + 3);
    const basicsBy = {};
    d.cards.forEach(e => {
      const c = find(e.n);
      if (c && isBasic(c.n)) basicsBy[c.n] = (basicsBy[c.n] || 0) + e.q;
    });
    const L = d.cards
      .map(e => ({e, c: find(e.n)}))
      .filter(x => x.c && !x.e.l && tags(x.c).land && (landSpeed(x.c) === 'tapped' || isBasic(x.c.n)))
      .map(x => ({
        n: x.e.n,
        v:
          (landSpeed(x.c) === 'tapped' && !isBasic(x.c.n) ? 0 : 10) -
          (isBasic(x.c.n) ? basicsBy[x.c.n] || 0 : 0) * 0.1 +
          cols(x.c)
      }));
    const cuts = [];
    L.sort((a, b) => a.v - b.v).forEach(x => {
      if (isBasic(x.n)) {
        const k = cuts.filter(y => y.n === x.n).length;
        if (k < Math.min(3, (basicsBy[x.n] || 0) - 1)) for (let q = 0; q < 1; q++) cuts.push(x);
      } else cuts.push(x);
    });
    // a basic can be cut more than once: each pairing takes one copy
    const used = new Map(),
      out = [];
    for (const a of adds) {
      if (out.length >= n) break;
      const cu = cuts.find(
        x =>
          (used.get(x.n) || 0) < (isBasic(x.n) ? Math.min(3, (basicsBy[x.n] || 0) - 1) : 1) &&
          (!UP.lfix || landCovers(find(x.n), a.c, ctx.ident))
      );
      if (!cu) continue;
      used.set(cu.n, (used.get(cu.n) || 0) + 1);
      const v = o.landScore ? o.landScore(cu.n, a.c.n) : undefined;
      out.push({
        cut: cu.n,
        add: a.c.n,
        q: 1,
        kind,
        why:
          landSpeed(find(cu.n)) === 'tapped'
            ? 'Replaces a land that enters tapped'
            : 'Replaces a basic with a land making more of your colours',
        dScore: v
      });
    }
    return out.filter(x => x.dScore == null || x.dScore >= -0.05).sort((a, b) => (b.dScore || 0) - (a.dScore || 0));
  }
  if (kind === 'curve') {
    const hi = spells
      .filter(x => (x.c.cmc || 0) >= 5 && !short([...x.roles].find(r => JOBS.includes(r)) || 'x'))
      .sort((a, b) => a.v - (a.c.cmc || 0) - (b.v - (b.c.cmc || 0)));
    const out = [];
    const used = new Set();
    for (const h of hi) {
      if (out.length >= n) break;
      const j = [...h.roles].find(r => JOBS.includes(r));
      const a = LIB.filter(
        c => addOk(c) && !used.has(c._k) && !tags(c).land && (c.cmc || 0) <= 2 && (!j || tags(c).roles.has(j)) && evid(c)
      )
        .map(c => ({c, v: val(c)}))
        .sort((x, y) => y.v - x.v)[0];
      if (a) {
        used.add(a.c._k);
        out.push({
          cut: h.n,
          add: a.c.n,
          q: 1,
          kind,
          why: 'Mana value ' + (h.c.cmc || 0) + ' → ' + (a.c.cmc || 0),
          dScore: o.score ? o.score(h.n, a.c.n) : undefined
        });
      }
    }
    return o.score ? out.sort((x, y) => (y.dScore || 0) - (x.dScore || 0)) : out;
  }
  if (kind === 'wins') {
    const cb = COMBOS.list.length ? combosOf(d, ctx.ident) : {near: []},
      seen = new Set();
    const adds = cb.near
      .filter(x => x.x.win)
      .map(x => find(x.miss))
      .filter(c => addOk(c) && !seen.has(c._k) && seen.add(c._k))
      .map(c => ({c, v: val(c)}));
    const fin =
      adds.length >= n ? [] : best(c => !tags(c).land && isFinisher(c) && !adds.some(a => a.c._k === c._k), n - adds.length);
    return pairUp(adds.concat(fin), cutsFor(''), 'Adds a way to win');
  }
  return [];
}
// "I want this card in my deck": rank what the deck can best do without. A land replaces a land, a spell a spell.
// Cards that would leave ramp/draw/removal/wipes short, or identity cards making way for an off-theme card, are
// held back; a card with a similar mana cost is preferred so the curve stays put. Locked cards are never offered.
// Spare lands: when a deck runs more lands than its target, the extras may go for other cards (owner's rule). Lands that
// enter tapped first, then basics from the most common type; lands that do something besides make mana are kept. At most
// the surplus is offered (a basic can be named more than once, one copy each).
function spareLands(d) {
  const A = analyze(d),
    extra = A.lands - A.T.lands;
  if (extra <= 0) return [];
  const L = d.cards
    .map(e => ({e, c: find(e.n)}))
    .filter(x => x.c && !x.e.l && tags(x.c).land && (isBasic(x.c.n) || landSpeed(x.c) === 'tapped'));
  const out = [];
  L.filter(x => !isBasic(x.c.n)).forEach(x => out.push(x.e.n));
  L.filter(x => isBasic(x.c.n))
    .sort((a, b) => b.e.q - a.e.q)
    .forEach(x => {
      for (let i = 0; i < Math.max(0, x.e.q - 1); i++) out.push(x.e.n);
    });
  return out.slice(0, extra);
}
// A deck is short of mana when its practice games run out of lands by turn 5 in UP.starve of games or more, or it runs fewer
// lands than its target: then a spell may make room for a land (owner, Build 138), if the deck score agrees.
function manaStarved(d, e) {
  const A = analyze(d);
  return A.lands < A.T.lands || !!(e && e.sim && e.sim.screwT5 >= UP.starve);
}
// The lands the Mana fix offers: untapped lands making two or more of the deck's colours, then (short of mana) any untapped land
// making a deck colour.
function manaAdds(d, n, starved) {
  const ctx = ctxOf(d),
    inDeck = new Set(d.cards.map(e => keyOf(e.n))),
    dis = new Set((d.dismissed || []).map(keyOf)),
    val = c => baseScore(c, d, ctx).s;
  const ok = c =>
    tags(c).land &&
    !isBasic(c.n) &&
    !monoJunkLand(c, ctx.ident) &&
    !inDeck.has(c._k) &&
    !dis.has(c._k) &&
    legalIn(c, d.format) &&
    c.ci.every(z => ctx.ident.includes(z)) &&
    mustOk(c, d) &&
    (!d.tier || d.tier === 'apex' || c.p == null || underCap(c.p, d.tier)) &&
    landSpeed(c) !== 'tapped';
  const evid = c => {
      const e = ctx.edh && edhOf(ctx.edh.map, c);
      return (e && e.inc >= 0.05) || (c.r && c.r < 3000);
    },
    cols = c => [...landColors(c)].filter(z => ctx.ident.includes(z)).length;
  return LIB.filter(c => ok(c) && evid(c) && (ctx.ident.length < 2 ? cols(c) >= 1 : cols(c) >= 2 || (starved && cols(c) >= 1)))
    .map(c => ({c, v: val(c)}))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map(x => x.c);
}
function bestCuts(d, addName, k, o) {
  o = o || {};
  const add = find(addName);
  if (!add) return [];
  const A = analyze(d),
    ctx = A.ctx,
    T = A.T,
    top = (d.aims || [])[0],
    addLand = tags(add).land,
    roles = Object.assign({}, A.roles);
  if (!addLand)
    tags(add).roles.forEach(r => {
      if (r in roles) roles[r]++;
    });
  const isId = c => !!(top && matchAim(c, top, ctx.tribe) >= 0.7),
    addId = !addLand && isId(add),
    out = [];
  for (const e of d.cards) {
    if (e.l || norm(e.n) === add._n) continue;
    const c = find(e.n);
    if (!c) continue;
    const land = tags(c).land;
    if (land !== addLand && !(addLand && o.starved && !land)) continue; // short of mana: a spell may go for a land (Build 138)
    if (land) {
      out.push(
        isBasic(c.n)
          ? {n: e.n, s: -e.q, why: ['You run ' + e.q + ' of these']}
          : {n: e.n, s: baseScore(c, d, ctx).s + 3, why: ['Least useful land']}
      );
      continue;
    }
    const b = baseScore(c, d, ctx);
    let s = b.s,
      why = addLand
        ? 'The deck runs short of lands: a weak spell can make room'
        : b.hit
          ? 'Weakest fit for the build'
          : "Doesn't serve the build";
    tags(c).roles.forEach(r => {
      if (r in roles) s += roles[r] - 1 < T[r] ? 2.5 : 0.6;
    });
    s += 0.2 * Math.abs(c.cmc - add.cmc);
    if (isId(c) && !addId) s += 2;
    if (mainType(c) !== mainType(add)) s += 1.5;
    if (!legalIn(c, d.format)) {
      s = -90;
      why = 'Not legal in ' + d.format;
    } else if (!c.ci.every(x => ctx.ident.includes(x))) {
      s = -80;
      why = 'Outside your colors';
    }
    out.push(addLand ? {n: e.n, s: s + 4, spell: true, why: [why]} : {n: e.n, s, why: [why]});
  }
  if (!addLand)
    [...new Set(spareLands(d))].forEach(n =>
      out.push({n, s: 50, land: true, why: ['Spare land: ' + A.lands + ' lands, about ' + T.lands + ' needed']})
    );
  return out.sort((a, b) => a.s - b.s).slice(0, k || 3);
}
// Player tip for a card being added by hand: how well does it fit this deck, and why?
// sw (optional): the measured best swap for this card, {cut, dScore, gain}. The tip then leads with what the swap does to the
// deck score, and the card's own rating (play data, fit) is kept as a separate signal instead of contradicting it.
const IMPACT = [
  [2, 'Major upgrade', 'great'],
  [1, 'Strong upgrade', 'good'],
  [SCORE_MIN, 'Small upgrade', 'ok'],
  [-SCORE_MIN + 1e-9, 'No real change', 'ok'],
  [-Infinity, 'Lowers the deck score', 'poor']
];
const PART_LABEL = {
  synergy: 'synergy',
  balance: 'balance (jobs and lands)',
  quality: 'card quality',
  routes: 'ways to win',
  mana: 'mana'
};
function evalFit(d, c, sw) {
  const A = analyze(d),
    ctx = A.ctx,
    T = A.T,
    tg = tags(c),
    b = baseScore(c, d, ctx),
    pros = [],
    cons = [],
    cmdName = ctx.cmd ? ctx.cmd.n.split(',')[0] : '';
  let pts = 0;
  if (!legalIn(c, d.format))
    return {
      level: 'bad',
      title: 'Not legal here',
      pros,
      cons: [
        c.n +
          ' is not legal in ' +
          (d.format === 'commander' ? 'Commander' : 'Standard') +
          ', so the deck could not be played with it.'
      ]
    };
  if (tg.land) {
    if (A.lands < T.lands) {
      pts += 2;
      pros.push('The deck has ' + A.lands + ' lands and wants about ' + T.lands + ', so another land helps.');
    } else
      cons.push(
        'The deck already has ' +
          A.lands +
          ' lands (target ' +
          T.lands +
          '), so it should replace one of them rather than a spell.'
      );
    if (!isBasic(c.n)) {
      if (c.r && c.r < 1500) {
        pts += 2;
        pros.push('A widely played land.');
      } else pts += 1;
    }
    if (/enters (the battlefield )?tapped/i.test(c.o || '')) cons.push('It enters tapped, which slows you down a turn.');
  } else {
    // Every mechanic of the build counts, not only the first: the main plan, the secondary plans, partial fits, the
    // commander's own strategy and the filters. A card that does a core job, or a staple, is never told it fits no plan.
    const aims = [],
      part = [],
      AL = (d.aims || []).map(a => aimLabel(a, ctx.tribe));
    (d.aims || []).forEach((a, i) => {
      const m = matchAim(c, a, ctx.tribe);
      if (m >= 0.7) aims.push({i, l: AL[i]});
      else if (m >= 0.3) part.push(AL[i]);
    });
    const multi = aims.length >= 2,
      fb = filtBonus(c, d),
      jobby = ['ramp', 'draw', 'removal', 'wipe', 'protect', 'counter', 'tutor'].some(r => tg.roles.has(r)),
      staple = CORE.has(c._n) || (c.r && c.r < 250);
    const ft = foreignTribe(c),
      wrongTribe = ft && ft !== ctx.tribe && !(ctx.cmd && new RegExp('\\b' + ft + '\\b').test(ctx.cmd.t));
    if (wrongTribe) {
      pts -= 3;
      cons.push(
        'It rewards ' +
          ft +
          ' cards' +
          (ctx.tribe ? ', and this is a ' + ctx.tribe + ' deck' : ', which this deck is not built around') +
          ', so most of its text would do nothing.'
      );
    } else if (aims.length) {
      // Plans are weighted by rank but closely: the main plan 2, the second 1.75, the third 1.5, and each further plan a
      // card hits adds 1.25. A card that hits two secondary plans (3) outweighs one that only hits the main plan (2).
      const main = aims.find(x => x.i === 0),
        sub = aims.filter(x => x.i > 0).map(x => x.l),
        w = i => Math.max(1, 2 - 0.25 * i);
      pts += w(aims[0].i) + 1.25 * (aims.length - 1);
      pros.push(
        main
          ? 'Supports the deck’s main plan (' + main.l + ')' + (sub.length ? ' and also ' + sub.join(', ') : '') + '.'
          : 'Supports ' +
              (sub.length > 1
                ? 'two of the deck’s secondary plans: ' + sub.join(' and ')
                : 'a secondary plan of the deck: ' + sub[0]) +
              '.'
      );
      if (aims.length >= 2 && AL.length >= 2) pros.push('It hits ' + aims.length + ' of the deck’s ' + AL.length + ' plans.');
    } else if (ctx.cmdThemes.some(a => matchAim(c, a, ctx.cmdTribe) >= 1)) {
      pts += 2;
      pros.push('Works with ' + cmdName + '’s own strategy.');
    } else if (fb.why.length) {
      pts += 1;
      pros.push('Matches your filters: ' + fb.why.join(', ') + '.');
    } else if (part.length) {
      pros.push('Loosely ties into ' + part.join(', ') + ', though it isn’t a core piece.');
    } else if (jobby || staple) {
      /* a job card or a staple earns its slot without feeding a plan; its job is judged below */
    } else if (AL.length || ctx.cmdThemes.length) {
      pts -= 1;
      cons.push(
        'It doesn’t feed any of the deck’s plans' +
          (AL.length ? ' (' + AL.join(', ') + ')' : '') +
          (ctx.cmdThemes.length && cmdName ? ' or ' + cmdName + '’s own strategy' : '') +
          '.'
      );
    }
    if (ctx.edh) {
      const x = edhOf(ctx.edh.map, c);
      if (x) {
        const pc = Math.round(x.inc * 100);
        if (x.inc >= 0.25) {
          pts += 2;
          pros.push('Played in ' + pc + '% of ' + cmdName + ' decks.');
        } else {
          pts += 1;
          pros.push(
            'Shows up in ' +
              Math.max(1, pc) +
              '% of ' +
              cmdName +
              ' decks' +
              (x.syn > 0.1 ? ', far more than in other decks' : '') +
              '.'
          );
        }
      } else if (ctx.edh.map.size > 80) {
        pts -= multi ? 0.5 : 1;
        cons.push(cmdName + ' players rarely run it.');
      }
    }
    const RN = {ramp: 'mana ramp', draw: 'card draw', removal: 'removal', wipe: 'board wipes'};
    let filled = false;
    for (const r in RN)
      if (tg.roles.has(r)) {
        if (A.roles[r] < T[r]) {
          if (!filled) pts += 2;
          filled = true;
          pros.push('The deck is short on ' + RN[r] + ' (' + A.roles[r] + ' of about ' + T[r] + ') and this adds one.');
        } else if (!sw) pros.push('Adds ' + RN[r] + '; the deck already has enough (' + A.roles[r] + ').');
      } // with a measured swap, the score line says what it adds
    if (CORE.has(c._n) || (c.r && c.r < 300)) {
      pts += 1;
      pros.push('A staple that is good in almost any deck.');
    }
    if (ctx.bracket && c.gc) {
      const nb = bracketOf(ctx.gcIn + 1, ctx.mldIn);
      cons.push(
        nb > ctx.bracket
          ? 'A Game Changer. Adding it moves the deck from Bracket ' + ctx.bracket + ' to Bracket ' + nb + '.'
          : 'A Game Changer: it would be number ' +
              (ctx.gcIn + 1) +
              (ctx.bracket === 3 ? ' of the 3 that Bracket 3 allows.' : ' in the deck.')
      );
    }
    if (ctx.bracket && ctx.bracket < 4 && BTAGS.mld.has(c._n))
      cons.push('Mass land denial. Adding it moves the deck from Bracket ' + ctx.bracket + ' to Bracket 4.');
    const big = A.curve[5] + A.curve[6],
      bigMax = Math.round(A.nonland * 0.18);
    if (c.cmc >= 5 && A.nonland >= 20 && big >= bigMax) {
      pts -= 1;
      cons.push('The deck already has ' + big + ' cards costing 5 or more; another expensive card makes slow hands more likely.');
    } else if (c.cmc <= 2 && A.avg > 3.4)
      pros.push('Cheap to cast, which helps a deck whose average cost is ' + A.avg.toFixed(1) + '.');
    const offF = c.ci.filter(x => !ctx.focus.includes(x) && ctx.ident.includes(x));
    if (offF.length)
      cons.push(
        'It needs ' +
          offF.map(k => ({W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green'})[k]).join(' and ') +
          ' mana, which is not one of your focus colors.'
      );
    const sc = [];
    d.cards.forEach(en => {
      const x = find(en.n);
      if (x && !tags(x).land) sc.push(baseScore(x, d, ctx).s);
    });
    if (sc.length >= 10) {
      const below = sc.filter(v => v < b.s).length,
        pc = below / sc.length;
      if (pc >= 0.6) {
        pts += 1;
        pros.push('By my scoring it beats ' + below + ' of the ' + sc.length + ' spells already in the deck.');
      }
      // that ranking already counts how rarely players run it, so a card hitting two or more plans isn't marked down twice
      else if (pc <= 0.15) {
        const up = sw && sw.dScore != null && sw.dScore >= SCORE_MIN,
          nw = newCard(c);
        if (!multi && !up && !nw) pts -= 1;
        cons.push(
          nw
            ? 'It is a new card (first printed ' +
                nw +
                '), so players have had little time to pick it up; on the play data so far it rates below most spells in the deck.'
            : up
            ? 'On play data and fit alone it rates below nearly every spell in the deck' +
                '; the score gain comes from the swap itself (see above).'
            : 'By my scoring it ranks below nearly every spell already in the deck.'
        );
      }
    }
  }
  const level = pts >= 4 ? 'great' : pts >= 2 ? 'good' : pts >= -1 ? 'ok' : 'poor';
  if (!pros.length && !cons.length) cons.push('Nothing in its text connects to the deck’s plan, but nothing clashes with it.');
  const fitT = {great: 'Great fit', good: 'Good fit', ok: 'Playable, not a natural fit', poor: 'Poor fit'}[level];
  if (sw && sw.dScore != null && !tags(c).land) {
    const im = IMPACT.find(x => sw.dScore >= x[0]),
      g = Object.entries(sw.gain || {})
        .filter(([, v]) => Math.abs(v) >= 0.05)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const s = (sw.dScore >= 0 ? '+' : '−') + Math.abs(sw.dScore).toFixed(1);
    pros.unshift(
      'Swapping out ' +
        sw.cut +
        ' changes the deck score by ' +
        s +
        (g.length
          ? ': ' +
            g
              .slice(0, 3)
              .map(([k, v]) => PART_LABEL[k] + ' ' + (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1))
              .join(', ')
          : '') +
        '.'
    );
    return {level: im[2], title: im[1] + ' · ' + fitT.toLowerCase(), fit: level, impact: im[1], pros, cons};
  }
  return {level, title: fitT, fit: level, pros, cons};
}

// A card first printed in the last 12 months (owner, 26 Oct: The Mind Stone read as weak): its play data is still catching up,
// so the card window says so instead of marking it down. Returns the month it was printed, or ''.
function newCard(c) {
  if (!c.nw) return '';
  const [y, m] = c.nw.split('-').map(Number),
    now = new Date(),
    ago = (now.getFullYear() - y) * 12 + now.getMonth() + 1 - m;
  return ago >= 0 && ago <= 12 ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + y : '';
}
