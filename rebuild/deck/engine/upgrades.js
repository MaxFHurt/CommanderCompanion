// Tournament staples (smarter deck score, stage 1): what top-16 tournament lists run that our Apex builds missed (EDHTop16,
// October 2026): fast mana, free or one-mana interaction, and the best lands. Apex only: each is worth UP.ts to a card's
// value (generation, card quality), the lands also count toward card quality, and the mana base may pick them past its usual room.
const TOURNEY = {
  fast: [
    'Mana Vault',
    'Chrome Mox',
    'Mox Diamond',
    'Mox Opal',
    'Mox Amber',
    'Jeweled Lotus',
    'Lotus Petal',
    "Lion's Eye Diamond",
    'Grim Monolith',
    'Dark Ritual',
    'Cabal Ritual',
    'Rite of Flame',
    'Desperate Ritual',
    'Pyretic Ritual',
    'Seething Song',
    'Culling the Weak',
    "Jeska's Will",
    'Simian Spirit Guide',
    'Elvish Spirit Guide',
    'Springleaf Drum',
    'Carpet of Flowers',
    'Birds of Paradise',
    'Noble Hierarch',
    'Ignoble Hierarch',
    'Llanowar Elves',
    'Elvish Mystic',
    'Fyndhorn Elves',
    'Arbor Elf',
    'Delighted Halfling',
    "Avacyn's Pilgrim",
    'Elves of Deep Shadow',
    'Deathrite Shaman'
  ],
  free: [
    'Force of Will',
    'Force of Negation',
    'Pact of Negation',
    'Mindbreak Trap',
    'Fierce Guardianship',
    'Deflecting Swat',
    'Deadly Rollick',
    'Flawless Maneuver',
    'Obscuring Haze',
    'Snuff Out',
    'Misdirection',
    'Commandeer',
    'Subtlety',
    'Solitude',
    'Endurance',
    'Grief',
    'Fury',
    'Daze',
    'Gut Shot',
    'Mental Misstep',
    'Flusterstorm',
    'Spell Pierce',
    'Swan Song',
    "An Offer You Can't Refuse",
    'Stern Scolding',
    'Veil of Summer',
    'Silence',
    "Orim's Chant",
    'Dispel',
    'Spell Snare'
  ],
  land: [
    'Ancient Tomb',
    'City of Traitors',
    "Urza's Saga",
    'Cavern of Souls',
    'Gemstone Caverns',
    "Gaea's Cradle",
    'Mana Confluence',
    'City of Brass',
    'Otawara, Soaring City',
    'Boseiju, Who Endures',
    'Tundra',
    'Underground Sea',
    'Badlands',
    'Taiga',
    'Savannah',
    'Scrubland',
    'Volcanic Island',
    'Bayou',
    'Plateau',
    'Tropical Island',
    'Flooded Strand',
    'Polluted Delta',
    'Bloodstained Mire',
    'Wooded Foothills',
    'Windswept Heath',
    'Marsh Flats',
    'Scalding Tarn',
    'Verdant Catacombs',
    'Arid Mesa',
    'Misty Rainforest'
  ]
};
const TOURNEY_OF = new Map();
for (const k in TOURNEY) TOURNEY[k].forEach(n => TOURNEY_OF.set(norm(n), k));
const TOURNEY_WHY = {
  fast: 'Tournament staple: fast mana',
  free: 'Tournament staple: free or one-mana interaction',
  land: 'Tournament staple: one of the best lands'
};
// (UP.tsMid, Build 145) a Mid build counts the tournament staples under its price too: the strongest decks' cheap cards
function tourneyOf(c, d) {
  return UP.ts &&
    c &&
    d &&
    d.format === 'commander' &&
    (d.tier === 'apex' || !d.tier || (UP.tsMid && d.tier === 'mid' && c.p != null && underCap(c.p, 'mid')))
    ? TOURNEY_OF.get(c._n) || ''
    : '';
}
// The short combo (four cards or fewer) a card completes with this commander or with cards a fifth of its players run, as a reason
function comboFor(c, ctx) {
  if (!COMBOS.list.length || !ctx.cmd || c === ctx.cmd) return '';
  const common = k => {
    if (k === ctx.cmd._k || k === c._k) return true;
    const x = ctx.edh && ctx.edh.map && edhOf(ctx.edh.map, KEYMAP().get(k));
    return !!x && x.inc >= 0.2;
  };
  const cb = (COMBOS.by.get(c._k) || []).find(x => x.keys.length <= 4 && x.keys.every(common));
  if (!cb) return '';
  const others = cb.names.filter(n => n !== c.n).map(n => n.split(',')[0]);
  return 'Combo with ' + others.join(' + ') + (cb.what ? ': ' + cb.what : '');
}
const KEYMAP = () => KEYMAP.m || (KEYMAP.m = new Map(LIB.map(x => [x._k, x])));
function baseScore(c, d, ctx) {
  let s = 0,
    hit = false,
    a0 = 0;
  const why = [];
  // Little or no play data for this commander (obscure or new; UP.th*): the deck's own mechanics count more and generic power
  // (tournament staples, Game Changers, tutors, the most-played staples) less, so the build follows the commander's plan.
  const thinE = d.format === 'commander' && (!ctx.edh || !ctx.edh.map || ctx.edh.map.size < 60),
    kA = thinE ? UP.thA : 1,
    kP = thinE ? UP.thP : 1,
    kT = thinE ? UP.thT : 1,
    kS = thinE ? UP.thS : 1;
  (d.aims || []).forEach((a, i) => {
    const m = matchAim(c, a, ctx.tribe);
    if (m) {
      s += kA * AIM_K * (AIM_W[i] || 1) * m;
      if (m >= 0.7) {
        hit = true;
        why.push(a === 'tribal' ? ctx.tribe + ' synergy' : isEdhAim(a) ? themeWhy(a, c) : aimLabel(a, ctx.tribe));
      }
    }
  });
  ctx.cmdThemes.forEach(a => {
    if (!(d.aims || []).includes(a) && matchAim(c, a, ctx.cmdTribe) >= 1) {
      s += 2;
      hit = true;
      why.push('Commander strategy');
    }
  });
  // the commander's engine (Build 139): shown as the reason only (adding it to the value, UP.kwB, did not pass the benchmark;
  // removed with the other switched-off experiments in 0.9.3, numbers in ROADMAP)
  if (ctx.engine) {
    const f = engineFit(c, ctx.engine);
    if (f.v) {
      if (f.v >= 0.8) why.unshift(f.why);
      else why.push(f.why);
    }
  }
  // a combo with the commander, or with cards a quarter of its players run (Commander Spellbook): said as a reason only;
  // combos already count in the deck score (21 Oct)
  {
    const cb = comboFor(c, ctx);
    if (cb) why.push(cb);
  }
  // engine v2 (UP.xPlan): a card that fits another plan this commander's players build (beyond the deck's own plans) counts a
  // little, so the small packages players add are found too; the deck's own plans still lead (owner, 21 Oct)
  if (UP.xPlan && !hit && (ctx.xPlans || []).length) {
    const xp = ctx.xPlans.find(a => !(d.aims || []).includes(a) && matchAim(c, a, ctx.tribe) >= 0.7);
    if (xp) {
      s += UP.xPlan;
      hit = true;
      why.push(aimLabel(xp, ctx.tribe) + ' (a plan ' + ctx.cmd.n.split(',')[0] + ' players build)');
    }
  }
  // engine v2 (UP.syn): the card makes what the commander uses, or uses what it makes (engine/functions.js)
  if (UP.syn && ctx.cmd && d.format === 'commander') {
    const y = fnSynergy(c, ctx.cmd);
    if (y.n) {
      s += UP.syn * Math.min(2, y.n);
      hit = true;
      why.push('Works with ' + ctx.cmd.n.split(',')[0] + ' (' + y.words.join(', ') + ')');
    }
  }
  // engine v2 (UP.optW): what the commander's stronger decks (EDHREC's bracket 4 page) run more often than its decks overall,
  // trusted in proportion to how many strong decks there are (UP.optN) and not at all below UP.optMin of them
  if (UP.optW && ctx.edh && ctx.edh.opt && ctx.edh.optDecks >= UP.optMin) {
    const xo = edhOf(ctx.edh.opt, c);
    if (xo) {
      const x = edhOf(ctx.edh.map, c),
        lift = xo.inc - (x ? x.inc : 0);
      if (lift > 0) s += (UP.optW * lift * ctx.edh.optDecks) / (ctx.edh.optDecks + UP.optN);
    }
  }
  // with no play data of its own, the commander's tribe and theme pages (UP.fbW of the weight its own data would have)
  if (ctx.fall) {
    let best = null;
    for (const F of ctx.fall) {
      const x = edhOf(F.map, c);
      if (x) {
        s += (UP.fbW * (W_INC * x.inc + W_SYN * Math.max(0, x.syn))) / ctx.fall.length;
        if (!best || x.inc > best.x.inc) best = {x, F};
      }
    }
    if (best && best.x.inc >= 0.1) {
      hit = true;
      why.unshift('In ' + Math.round(best.x.inc * 100) + '% of ' + best.F.label);
    }
  }
  if (ctx.edh) {
    const x = edhOf(ctx.edh.map, c);
    if (x) {
      s += W_INC * x.inc + W_SYN * Math.max(0, x.syn);
      hit = true;
      why.unshift('In ' + Math.round(x.inc * 100) + '% of ' + ctx.cmd.n.split(',')[0] + ' decks');
    }
    // When there is plenty of data for this commander, a card none of its players run needs a better reason to be here.
    else if (ctx.edh.map.size >= 100 && !(c.r && c.r < 400) && !CORE.has(c._n)) s -= EDH_MISS;
  }
  if ((d.types && d.types.length) || (d.keys && d.keys.length) || (d.sets && d.sets.length && !d.setsMust) || d.themeFirst) {
    const fb = filtBonus(c, d);
    if (fb.s) {
      s += fb.s;
      if (fb.why.length) {
        hit = true;
        fb.why.forEach(w => why.unshift(w));
      }
    }
  }
  if (d.prevCmd && d.prevCmd === c.n) {
    s += 3;
    hit = true;
    why.unshift('Your previous commander');
  }
  a0 = s;
  s += POP_K * (c.r ? 3 * (1 - Math.log(c.r + 1) / Math.log(40000)) : c.src === 'starter' ? 1.6 : 0.8); // no rank usually means a new card, not a bad one
  c.ci.forEach(x => {
    if (!ctx.focus.includes(x)) s -= 1.5;
  });
  const ft = foreignTribe(c);
  if (ft && ft !== ctx.tribe && !(ctx.cmd && new RegExp('\\b' + ft + '\\b').test(ctx.cmd.t))) {
    s -= 5;
    hit = false;
    a0 = 0;
  }
  // Proven staples: the most-played cards anywhere (Rhystic Study, Teferi's Protection, Swords to Plowshares) earn their
  // slot in any deck, tapering off by about #400. The top ~250 count as a fit even when they touch no aim.
  if (CORE.has(c._n) || (c.r && c.r < 60)) s += 6 * STAPLE_K * kS;
  else if (c.r && c.r < 400) s += (kS * STAPLE_K * 6 * Math.log(400 / c.r)) / Math.log(400 / 60);
  if (!hit && (CORE.has(c._n) || (c.r && c.r < 250)) && !(ft && ft !== ctx.tribe)) {
    hit = true;
    why.push('Proven staple');
  }
  // Apex power: what the strongest real decks (bracket 4–5) run that average decks skip. Wizards' Game Changer list (the
  // cards that warp games most), tutors and fast mana. Only for the Apex build (d.tier apex), so Budget and Mid are unchanged.
  if (
    (UP.pw || UP.pt || UP.pf) &&
    (d.tier === 'apex' || !d.tier || (UP.pwMid && d.tier === 'mid')) &&
    d.format === 'commander' &&
    !(ft && ft !== ctx.tribe)
  ) {
    const r = tags(c).roles;
    if (c.gc && UP.pw) {
      s += kP * UP.pw;
      why.push('Game Changer: among the strongest cards in Commander');
    }
    if (r.has('tutor') && UP.pt) s += kP * UP.pt;
    if (UP.pf && FAST_MANA.has(c._n)) s += UP.pf;
  }
  // a staple this commander's players rarely run is worth less here (full value at UP.tsk of decks; all of it without play data)
  {
    const tk = !(ft && ft !== ctx.tribe) && tourneyOf(c, d);
    if (tk) {
      const x = ctx.edh && ctx.edh.map && ctx.edh.map.size >= 100 ? edhOf(ctx.edh.map, c) : null,
        f = !UP.tsk || !(ctx.edh && ctx.edh.map && ctx.edh.map.size >= 100) ? 1 : x ? Math.min(1, x.inc / UP.tsk) : 0;
      if (f > 0) {
        s += kT * UP.ts * f;
        if (f >= 0.5) why.push(TOURNEY_WHY[tk]);
      }
    }
  }
  return {s, hit, why, a: a0};
}
function splitBasics(k, ctx) {
  const cols = ctx.ident.length ? ctx.ident : [];
  if (!cols.length) return k > 0 ? [{n: 'Wastes', q: k}] : [];
  const w = cols.map(c => (ctx.focus.includes(c) ? 3 : 1)),
    tot = w.reduce((a, b) => a + b, 0);
  const raw = w.map(x => (k * x) / tot),
    q = raw.map(Math.floor);
  let rest = k - q.reduce((a, b) => a + b, 0);
  raw
    .map((x, i) => [x - q[i], i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (rest > 0) {
        q[i]++;
        rest--;
      }
    });
  return cols.map((c, i) => ({n: COLOR_BASIC[c], q: q[i]})).filter(x => x.q > 0);
}
function recommend(d, swaps, fillOnly) {
  const A = analyze(d),
    ctx = A.ctx,
    T = A.T,
    std = d.format === 'standard';
  const have = new Map(d.cards.map(e => [keyOf(e.n), e])),
    dismissed = new Set((d.dismissed || []).map(keyOf));
  const open = T.size - A.size;
  let nAdd = Math.max(0, open) + (fillOnly ? 0 : swaps),
    nCut = Math.max(0, -open) + (fillOnly ? 0 : swaps);
  const adds = [],
    cuts = [],
    def = {};
  for (const r in A.roles) def[r] = T[r] - A.roles[r];
  // Filling or generating a Commander deck: it also needs ways to win and to protect them (see routeNeeds).
  const RN = fillOnly && UP.fin && d.format === 'commander' && ctx.edh ? routeNeeds(ctx.edh) : null,
    rdef = {fin: 0, prot: 0};
  if (RN) {
    const cs = d.cards.map(e => find(e.n)).filter(c => c && !tags(c).land);
    rdef.fin = RN.fin - cs.filter(isFinisher).length;
    rdef.prot = RN.prot - cs.filter(c => tags(c).roles.has('protect') || tags(c).roles.has('counter')).length;
  }
  // Used to fill open slots and to generate decks; upgrades use upgradePaths(). Brackets are a label, never a limit here.
  const okCard = c =>
    mustOk(c, d) &&
    legalIn(c, d.format) &&
    c.ci.every(x => ctx.ident.includes(x)) &&
    (ctx.cap === Infinity || underCap(c.p, d.tier || 'budget')) &&
    (!recommend.own || recommend.own.has(c._n)) &&
    !dismissed.has(c._k);

  // lands first
  let landNeed = Math.min(nAdd, Math.max(0, T.lands - A.lands));
  if (landNeed > 0) {
    let nonbasic = 0;
    d.cards.forEach(e => {
      const c = find(e.n);
      if (c && tags(c).land && !isBasic(c.n)) nonbasic += e.q;
    });
    let room = std ? (ctx.ident.length > 1 ? 4 : 0) : Math.max(0, Math.min(12, 4 + ctx.ident.length * 3) - nonbasic);
    const pool = LIB.filter(
      c =>
        tags(c).land &&
        !isBasic(c.n) &&
        okCard(c) &&
        !have.has(c._k) &&
        c._k !== keyOf(d.commander) &&
        (!d.partner || c._k !== keyOf(d.partner))
    )
      .map(c => ({c, b: baseScore(c, d, ctx)}))
      .sort((x, y) => y.b.s - x.b.s);
    for (const p of pool) {
      if (room <= 0 || landNeed <= 0) break;
      if (std && !/basic land card/.test(p.c.o)) continue;
      const q = std ? Math.min(4, room, landNeed) : 1;
      adds.push({n: p.c.n, q, kind: 'land', why: [p.b.hit ? p.b.why[0] : 'Utility land'], s: p.b.s});
      room -= q;
      landNeed -= q;
      nAdd -= q;
    }
    splitBasics(landNeed, ctx).forEach(b => {
      adds.push({n: b.n, q: b.q, kind: 'land', why: ['Reach ' + T.lands + ' lands'], s: 99});
      nAdd -= b.q;
    });
  }
  // spells
  if (nAdd > 0) {
    const pool = LIB.filter(
      c =>
        !tags(c).land && okCard(c) && !have.has(c._k) && c._k !== keyOf(d.commander) && (!d.partner || c._k !== keyOf(d.partner))
    ).map(c => ({c, b: baseScore(c, d, ctx), used: false}));
    // Seeded variation (generation benchmark and multistart): each card's value moves by a fixed random amount.
    if (recommend.noise && recommend.noise.amp) {
      const r = rng32(recommend.noise.seed);
      pool.forEach(p => {
        p.b = Object.assign({}, p.b, {s: p.b.s + (r() - 0.5) * recommend.noise.amp});
      });
    }
    // Per-card facts read once; each card's largest possible bonus bounds the search (deficits only shrink as cards are added).
    pool.forEach((p, i) => {
      p.i = i;
      p.roles = tags(p.c).roles;
      p.fin = RN ? isFinisher(p.c) : false;
      p.prot = p.roles.has('protect') || p.roles.has('counter');
      let mb = 0;
      p.roles.forEach(r => {
        if (r in def) mb += 4;
      });
      if (RN) {
        if (p.fin) mb += 2 * UP.fin;
        if (p.prot) mb += UP.fin * 0.75;
      }
      p.ub = p.b.s + mb;
    });
    const order = pool.slice().sort((x, y) => y.ub - x.ub || x.i - y.i);
    const bonus = c => {
      let b = 0,
        w = null,
        over = 0;
      tags(c).roles.forEach(r => {
        if (def[r] > 0) {
          b += 2 + Math.min(2, def[r] / 3);
          w = w || r;
        } else if (r in def && def[r] < 0) over = Math.max(over, -def[r]);
      });
      if (over && !b) b -= UP.over * Math.min(4, over);
      if (RN) {
        if (rdef.fin > 0 && isFinisher(c)) {
          b += UP.fin * (1 + Math.min(1, rdef.fin / 3));
          w = w || 'fin';
        }
        const r = tags(c).roles;
        if (rdef.prot > 0 && (r.has('protect') || r.has('counter'))) {
          b += UP.fin * 0.75;
          w = w || 'prot';
        }
      }
      return [b, w];
    }; // past the target, another card of the same role is worth less
    let guard = 0;
    while (nAdd > 0 && guard++ < 400) {
      let best = null,
        bs = -1e9,
        bw = null,
        strict = true;
      for (let pass = 0; pass < 2 && !best; pass++) {
        strict = pass === 0;
        for (const p of order) {
          if (p.ub < bs) break;
          if (p.used) continue;
          const [b, w] = bonus(p.c);
          if (strict && !p.b.hit && b === 0) continue;
          const s = p.b.s + b;
          if (s > bs || (s === bs && best && p.i < best.i)) {
            bs = s;
            best = p;
            bw = w;
          }
        }
      }
      if (!best) break;
      best.used = true;
      const q = std ? Math.min(nAdd, /Legendary/.test(best.c.t) ? 2 : 4) : 1;
      const why = best.b.why.slice(0, 2);
      if (bw)
        why.push(
          bw === 'fin' ? 'A way to win' : bw === 'prot' ? 'Protects your plan' : 'Fills ' + ROLE_LABEL[bw].toLowerCase() + ' gap'
        );
      if (!why.length) why.push('Solid staple');
      adds.push({n: best.c.n, q, kind: 'spell', why, s: bs, a: best.b.a});
      nAdd -= q;
      tags(best.c).roles.forEach(r => {
        if (r in def) def[r] -= q;
      });
      if (RN) {
        if (isFinisher(best.c)) rdef.fin -= q;
        const r = tags(best.c).roles;
        if (r.has('protect') || r.has('counter')) rdef.prot -= q;
      }
    }
  }
  // cuts
  if (nCut > 0) {
    const landExcess = A.lands - T.lands;
    if (landExcess > 2) {
      let k = Math.min(landExcess, nCut);
      d.cards
        .filter(e => isBasic(e.n) && !e.l)
        .sort((a, b) => b.q - a.q)
        .forEach(e => {
          if (k > 0) {
            const q = Math.min(k, Math.max(0, e.q - 1));
            if (q > 0) {
              cuts.push({n: e.n, q, why: ['Above ' + T.lands + ' land target'], s: -10});
              k -= q;
              nCut -= q;
            }
          }
        });
    }
    const cand = [];
    for (const e of d.cards) {
      if (e.l) continue;
      const c = find(e.n);
      if (!c || tags(c).land) continue;
      const b = baseScore(c, d, ctx);
      let s = b.s,
        why = [];
      tags(c).roles.forEach(r => {
        if (r in A.roles) s += A.roles[r] <= T[r] ? 2.5 : 0.6;
      });
      if (!c.ci.every(x => ctx.ident.includes(x))) {
        s = -80;
        why = ['Outside your colors'];
      } else if (!legalIn(c, d.format)) {
        s = -90;
        why = ['Not legal in ' + d.format];
      } else if (!b.hit) why = ["Doesn't serve your aims"];
      else why = ['Weakest fit for your aims'];
      cand.push({n: e.n, q: e.q, why, s, a: b.a});
    }
    cand.sort((a, b) => a.s - b.s);
    const cur = Object.assign({}, A.roles);
    for (const x of cand) {
      if (nCut <= 0) break;
      const q = Math.min(x.q, nCut),
        rs = [...tags(find(x.n)).roles].filter(r => r in cur);
      if (x.s > -40 && rs.some(r => cur[r] - q < T[r])) continue;
      rs.forEach(r => (cur[r] -= q));
      cuts.push({n: x.n, q, why: x.why, s: x.s, a: x.a});
      nCut -= q;
    }
  }
  // stop swapping when the deck's worst card already beats the best addition
  let tuned = false;
  if (!fillOnly && open === 0) {
    const sp = adds.filter(a => a.kind === 'spell'),
      opt = cuts.filter(c => c.s > -40);
    if (sp.length && opt.length) {
      let keep = 0,
        ci = 0,
        ai = 0,
        cq = 0;
      for (; ai < sp.length && ci < opt.length; ai++) {
        if (opt[ci].s >= sp[ai].s) break;
        keep++;
        cq += sp[ai].q;
        while (ci < opt.length && cq >= opt[ci].q) {
          cq -= opt[ci].q;
          ci++;
        }
      }
      if (keep < sp.length) {
        tuned = true;
        const dropA = new Set(sp.slice(keep).map(a => a.n));
        let removed = 0;
        sp.slice(keep).forEach(a => (removed += a.q));
        for (let i = adds.length - 1; i >= 0; i--) if (dropA.has(adds[i].n)) adds.splice(i, 1);
        for (let i = cuts.length - 1; i >= 0 && removed > 0; i--) {
          if (cuts[i].s <= -40) continue;
          const q = Math.min(removed, cuts[i].q);
          cuts[i].q -= q;
          removed -= q;
          if (!cuts[i].q) cuts.splice(i, 1);
        }
      }
    }
  }
  return {adds, cuts, A, tuned};
}
// ===== Upgrade recommendations: one pipeline, Apex first =====
// 1. Fixes the deck needs anyway: cards outside the colours or not legal, extra copies, too many or too few cards.
// 2. Every possible addition and every card that could leave gets a value: how often this commander's players run it, its
//    synergy with the commander, and its fit with the deck's build. Price is never part of a card's value.
// 3. Apex: for each card worth replacing, the strongest fitting card, whatever it costs (a $0.50 card can be Apex). Cuts and
//    additions are paired best-first so no card is used twice. Held picks stay exactly where they are.
// 4. The Apex package is checked as a whole: a swap that leaves a job the deck relies on short, or pushes the curve up, is
//    dropped (held picks are never dropped).
// 5. Mid and Budget are cheaper alternatives for the same slot: strictly under $12 / $3, strictly cheaper than the Apex card,
//    doing the same job as the Apex card, and still an improvement on the card being replaced. Otherwise the tier is left
//    empty and says why. A card appears only once in the whole list.
// A card that does a job (ramp, draw, removal, wipes, protection, counterspells, tutors; gear, auras and vehicles) is what an
// alternative has to match.
const JOBS = ['ramp', 'draw', 'removal', 'wipe', 'protect', 'counter', 'tutor'];
const JOB_LABEL = {
  cost: 'a cost reducer',
  ramp: 'ramp',
  draw: 'card draw',
  removal: 'removal',
  wipe: 'a board wipe',
  protect: 'protection',
  counter: 'a counterspell',
  tutor: 'a tutor',
  gear: 'equipment',
  aura: 'an aura',
  vehicle: 'a vehicle'
};
const JOB_ORDER = ['wipe', 'removal', 'counter', 'tutor', 'draw', 'ramp', 'protect', 'cost', 'gear', 'aura', 'vehicle']; // a card's main job, when it has several
// Beyond the deck's core jobs: card types and cost reducers (Medallions, Urza's Incubator) — used to match like with like,
// never counted toward the ramp/draw/removal/wipe minimums.
const COST_RE = /\bspells?\b[^.]{0,60}\bcosts? \{\d+\} less\b|\bcosts? \{\d+\} less to (cast|activate)\b/i;
// The colours of mana a land can make (for land upgrades: a new land must make every colour of the deck the old one made).
const LTYPE = {Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G'};
function landColors(c) {
  if (c._lc) return c._lc;
  const o = (c.o || '').split(' // ')[0],
    t = frontType(c),
    out = new Set();
  Object.keys(LTYPE).forEach(k => {
    if (new RegExp('\\b' + k + '\\b').test(t)) out.add(LTYPE[k]);
  });
  // Only mana that can cast anything counts: "Spend this mana only to cast a creature spell" (Cavern of Souls, the Villages) and
  // copies of what your other lands make (Reflecting Pool) are not a source of that colour.
  const sent = o.split(/(?<=\.)\s+/);
  sent.forEach((x, i) => {
    if (!/\badd\b/i.test(x) || /^Spend this mana only/i.test(sent[i + 1] || '') || /a land you control could produce/i.test(x))
      return;
    (x.match(/\{([WUBRG])\}/g) || []).forEach(y => out.add(y[1]));
    if (/mana of any (one )?colou?r|any colou?r|mana of any type/i.test(x)) 'WUBRG'.split('').forEach(z => out.add(z));
  });
  // "As it enters, choose a color … Add one mana of the chosen color" (Thriving lands, Big Apple): any colour, picked as it enters.
  if (UP.lfix && /choose a colou?r/i.test(o) && /chosen colou?r/i.test(o)) 'WUBRG'.split('').forEach(z => out.add(z));
  const f =
    /search your library for (an? |up to \w+ )?(basic land|[^.]*?(Plains|Island|Swamp|Mountain|Forest)[^.]*?) cards?/i.exec(o);
  if (f) {
    if (/basic land/i.test(f[2])) 'WUBRG'.split('').forEach(x => out.add(x));
    else
      Object.keys(LTYPE).forEach(k => {
        if (new RegExp('\\b' + k + '\\b').test(f[2])) out.add(LTYPE[k]);
      });
  }
  return (c._lc = out);
}
// How a land enters: 'tapped' always, 'cond' tapped only sometimes (check, snarl, shock, fast lands), 'untapped' otherwise.
// A land that fetches puts its land in tapped (Evolving Wilds) counts as tapped.
function landSpeed(c) {
  const o = (c.o || '').split(' // ')[0];
  if (
    /enters tapped unless|if you don't[^.]*enters tapped|if you control (two|three) or (more|fewer) other lands[^.]*enters tapped|you may pay \d life\. if you don't/i.test(
      o
    )
  )
    return 'cond';
  if (/(this land|it|~|\bthis) enters tapped\.|enters the battlefield tapped\.|onto the battlefield tapped/i.test(o))
    return 'tapped';
  return 'untapped';
}
function jobsOf(n) {
  const c = find(n);
  if (!c || tags(c).land) return [];
  if (c._jb) return c._jb.slice();
  return (c._jb = jobsOf0(c)).slice();
}
function jobsOf0(c) {
  const j = [...tags(c).roles].filter(r => JOBS.includes(r)),
    t = frontType(c);
  if (COST_RE.test((c.o || '').replace(/this spell costs[^.]*\./gi, '')) && !/^(Instant|Sorcery)/.test(t)) j.push('cost');
  if (/\bEquipment\b/.test(t)) j.push('gear');
  else if (/\bAura\b/.test(t)) j.push('aura');
  else if (/\bVehicle\b/.test(t)) j.push('vehicle');
  return j;
}
const mainJob = n => {
  const j = jobsOf(n);
  return JOB_ORDER.find(x => j.includes(x)) || '';
};
const TIER_KEYS_UP = ['apex', 'mid', 'budget'];
// Tier ceilings are strict: Budget is under $3 and Mid under $12; exactly $3 or $12 does not qualify.
const underCap = (p, t) => t === 'apex' || (p != null && p < TIERS[t].cap);
// The card a tier's package uses for one slot: the Apex card when it already fits the tier's price, otherwise the tier's own
// alternative (Mid falls back to the Budget pick). Unknown prices never count as fitting a cap.
// Score check: every swap shown is played out on the whole-deck evaluator (synergy, balance, card quality, win routes, mana
// from the deck's own practice games). A swap that does not raise the deck score is never recommended: it is dropped and the
// tier says why. Each kept pick carries dScore, the score change it makes, which the app shows instead of a value guess.
const SCORE_MIN = 0.05; // a swap counts as raising the score from here
function scoreFloor() {
  return UP.smin != null ? UP.smin : SCORE_MIN;
} // every suggestion must raise the deck score by a margin the practice games cannot undo
// The value swaps are compared on: past the parts' maximum when UP.unc is on (Build 139).
function cmpOf(e) {
  return UP.unc && e && e.cmp != null ? e.cmp : e.exact;
}
// Both measures of one swap from a single evaluation (Build 140): [past the maximum (or exact when UP.unc is off), exact].
function swapScore2(d, base, apex, cut, add, q) {
  const u = JSON.parse(JSON.stringify(d));
  delete u.plan;
  cutCard(u, cut, q || 1);
  addCard(u, add, q || 1);
  try {
    const a = evaluateDeck(u, {apex, sim: base.sim}),
      ex = +(a.exact - base.exact).toFixed(2);
    return [UP.unc && a.cmp != null && base.cmp != null ? +(a.cmp - base.cmp).toFixed(2) : ex, ex];
  } catch (e) {
    return [null, null];
  }
}
function swapScore(d, base, apex, cut, add, q, exactOnly) {
  const u = JSON.parse(JSON.stringify(d));
  delete u.plan;
  cutCard(u, cut, q || 1);
  addCard(u, add, q || 1);
  try {
    const a = evaluateDeck(u, {apex, sim: base.sim});
    return +(!exactOnly && UP.unc && a.cmp != null && base.cmp != null ? a.cmp - base.cmp : a.exact - base.exact).toFixed(2);
  } catch (e) {
    return null;
  }
}
function recount(out) {
  out.count = {free: 0, budget: 0, mid: 0, apex: 0};
  out.cost = {free: 0, budget: 0, mid: 0, apex: 0};
  for (const t of ['free'].concat(TIER_KEYS_UP))
    out.paths.forEach(L => {
      const p = t === 'free' ? L.opts.free : tierPick(L, t);
      if (!p) return;
      out.count[t] += p.q;
      const a = find(p.add),
        c = find(p.cut);
      out.cost[t] += ((p.own ? 0 : (a && a.p) || 0) - ((c && c.p) || 0)) * p.q;
    });
}
// The score check is a generator (Build 144): where it has a batch of swaps to measure, it hands the batch out (yield) and gets
// the measurements back, so a batch can be spread across helper cores (work.js). scoreCheck runs it here, measuring each batch
// itself with measureBatch, the same function the helpers run, so the result is the same either way.
function scoreCheck(d, R, o) {
  return runSync(scoreCheckG(d, R, o));
}
function runSync(g) {
  let r = g.next();
  while (!r.done) {
    let v,
      err = null;
    try {
      v = measureBatch(r.value);
    } catch (e) {
      err = e;
    }
    r = err ? g.throw(err) : g.next(v);
  }
  return r.value;
} // a measurement that fails fails where it was asked for
// A batch: kind 'swap' gives swapScore2 for each [cut, add, q] on the deck's stored practice games; kind 'fresh' gives the
// value compared (cmpOf) of each swapped deck on its own fresh practice games.
function measureBatch(b) {
  return b.keys.map(([cut, add, q]) => {
    if (b.kind === 'swap') return swapScore2(b.d, b.base, b.apex, cut, add, q);
    const u = JSON.parse(JSON.stringify(b.d));
    delete u.plan;
    if (cut) {
      cutCard(u, cut, q || 1);
      addCard(u, add, q || 1);
    }
    return cmpOf(evaluateDeck(u, {apex: b.apex, games: b.games}));
  });
}
function* scoreCheckG(d, R, o) {
  o = o || {};
  if (!R || d.format !== 'commander' || !find(d.commander)) return R;
  let base;
  try {
    base = o.base || evaluateDeck(d, {apex: o.apex, games: 300});
  } catch (e) {
    return R;
  }
  if (!base || base.exact == null) return R;
  const memo = new Map(),
    mk = p => p.cut + '>' + p.add + '>' + (p.q || 1),
    both = p => {
      const k = mk(p);
      if (!memo.has(k)) memo.set(k, swapScore2(d, base, o.apex, p.cut, p.add, p.q));
      return memo.get(k);
    },
    // the swaps of a batch not measured yet (each once), as a batch to hand out
    batch = ps => {
      const seen = new Set(),
        keys = [];
      ps.forEach(p => {
        const k = mk(p);
        if (memo.has(k) || seen.has(k)) return;
        seen.add(k);
        keys.push([p.cut, p.add, p.q || 1]);
      });
      return keys.length ? {kind: 'swap', d, base, apex: o.apex, keys} : null;
    },
    took = (b, v) => b.keys.forEach((k, i) => memo.set(k[0] + '>' + k[1] + '>' + k[2], v[i])),
    dOf = p => both(p)[0];
  // the main pick keeps the shown score's own measure (Build 139): lifting the parts' maximum changes the numbers shown and the
  // alternatives, not which card is picked
  const dOfE = p => (!UP.unc ? dOf(p) : both(p)[1]);
  // repairs, refills and theme swaps on a row are judged on the shown score, so lifting the maximum only adds rows
  const dOfR = dOf;
  // Unpopular pick (owner, option B): only when the gap is big: the alternative raises the score more, few players run it, and
  // the suggested card is run by at least UP.unpopX times as many (and UP.unpopG more of all decks), and the alternative clearly
  // scores more (by UP.unpopS, and UP.unpopR times the pick's gain), so the chip is rare and means something.
  const incN = n => {
    const c = find(n),
      e = c && ctx0.edh && edhOf(ctx0.edh.map, c);
    return e ? e.inc : 0;
  };
  const unpopOf = (w, inc, tp) => {
    if (!(w > tp.dScore && inc < UP.unpop)) return false;
    if (!UP.unpopX) return true;
    if (w - tp.dScore < UP.unpopS || w < UP.unpopR * tp.dScore) return false;
    const pi = incN(tp.add);
    return pi >= UP.unpopX * inc && pi - inc >= UP.unpopG;
  };
  // Players' choice (owner, 18 Oct; UP.plc): a card at least UP.plc of this commander's players run (and clearly more than run the
  // card going out) stays suggested when the deck score sees the swap as about even (no worse than UP.plcS, within the practice
  // games' noise), labelled with its play rate. Only with enough decks behind the numbers (UP.plcD); the rules still apply, since
  // only cards the engine already found legal, in colour and in price are kept this way.
  const pcOk = (p, v) => {
    const ac = find(p.add);
    return (
      !!UP.plc &&
      !!ac &&
      !tags(ac).land &&
      v != null &&
      v >= UP.plcS &&
      !!ctx0.edh &&
      (ctx0.edh.decks || 0) >= UP.plcD &&
      incN(p.add) >= UP.plc &&
      incN(p.add) - incN(p.cut) >= UP.plcG
    );
  }; // not a land: the stored practice games can't measure a land swap, so its 0 is not "about even"
  const LAB = {apex: 'Apex', mid: 'Mid', budget: 'Budget'};
  let dropped = 0,
    refilled = 0,
    themed = 0,
    repaired = 0;
  const extra = [];
  const T = themeCtx(d),
    VM = new Map(),
    ctx0 = ctxOf(d),
    dis0 = new Set((d.dismissed || []).map(norm));
  let TP = null;
  const own = upgradePaths.own,
    inUse = () => new Set(R.paths.concat(extra).flatMap(L => Object.values(L.opts).map(p => p.add))); // the rows the repairs made too (Build 146: a card was suggested on two rows)
  const swapTo = (p, n, v, why) => {
    const c = find(n);
    return Object.assign({}, p, {
      add: c.n,
      dScore: v,
      held: false,
      own: !!(own && own.has(c._n)),
      gc: !!c.gc,
      why: (why ? [why] : []).concat((p.why || []).filter(w => !/^From |theme$/.test(w))).slice(0, 2),
      alt: p.add
    });
  };
  {
    const b = batch(R.paths.flatMap(L => ['apex', 'mid', 'budget', 'free'].map(t => L.opts[t]).filter(Boolean)));
    if (b) took(b, yield b);
  }
  for (const L of R.paths)
    for (const t of ['apex', 'mid', 'budget', 'free']) {
      const p = L.opts[t];
      if (!p) continue;
      const v = dOf(p);
      p.dScore = v;
      if (v != null && v < scoreFloor()) {
        // the pick would not raise the score: the strongest close card for the same job and price band that does takes its place
        let rep = null;
        // first: the same card against another weak card in the deck (the cut, not the card, was the problem)
        if (t !== 'free' && o.repair !== false && R.valOf) {
          const cutsInUse = new Set(R.paths.map(x => x.cut).concat(extra.map(x => x.cut))),
            addC = find(p.add),
            addLand = addC && !!tags(addC).land;
          const pool = d.cards
            .filter(e => !e.l && !cutsInUse.has(e.n) && !isBasic(e.n) && e.n !== p.cut)
            .map(e => ({e, c: find(e.n)}))
            .filter(x => x.c && !!tags(x.c).land === addLand && !x.c.gc === !p.gcOut)
            .map(x => ({n: x.e.n, v: R.valOf(x.c)}))
            .sort((a, b) => a.v - b.v)
            .slice(0, 6);
          {
            const b = batch(pool.map(x => ({cut: x.n, add: p.add, q: 1})));
            if (b) took(b, yield b);
          }
          let best = null;
          for (const x of pool) {
            const w = dOfR({cut: x.n, add: p.add, q: 1});
            if (w != null && w >= SCORE_MIN && (!best || w > best.w)) best = {n: x.n, w};
          }
          if (best) {
            delete L.opts[t];
            extra.push({
              after: L,
              cut: best.n,
              opts: {
                [t]: Object.assign({}, p, {
                  cut: best.n,
                  q: 1,
                  dScore: best.w,
                  cutWhy: ['Weakest fit for the build'],
                  repaired: p.cut
                })
              },
              none: {},
              gain: p.gain
            });
            repaired++;
            if (LAB[t])
              (L.none = L.none || {})[t] =
                p.add.split(' // ')[0] +
                ' is suggested in place of ' +
                best.n.split(' // ')[0] +
                ' instead, where it raises the deck score';
            continue;
          }
        }
        if (t !== 'free' && o.refill !== false) {
          const used = inUse();
          for (const a of altsFor(d, p.add, {cut: p.cut, val: R.valOf, skip: [...used], n: 3, vmemo: VM})) {
            const w = dOfR({cut: p.cut, add: a.n, q: p.q});
            if (w != null && w >= SCORE_MIN) {
              rep = swapTo(p, a.n, w, a.theme);
              break;
            }
          }
        }
        if (rep) {
          L.opts[t] = rep;
          refilled++;
          continue;
        }
        if (pcOk(p, v)) {
          L.opts[t] = Object.assign({}, p, {pc: true, pcInc: +incN(p.add).toFixed(3)});
          continue;
        }
        delete L.opts[t];
        dropped++;
        if (LAB[t])
          (L.none = L.none || {})[t] =
            'No ' +
            LAB[t] +
            ' card for this slot raises the deck score (' +
            p.add.split(' // ')[0] +
            ' would not), so none is suggested';
        continue;
      }
      // AT ALL TIMES: an on-theme card (the commander's set or theme creature types) that is about as strong is the suggestion
      if (t !== 'free' && !p.held && o.theme !== false && !themeOf(find(p.add), T) && v != null) {
        const pc = find(p.add),
          vc = R.valOf ? R.valOf(pc) : null,
          vcu = R.valOf ? R.valOf(find(p.cut)) : null,
          used = new Set([...inUse()].map(norm)),
          band = priceBand(pc.p),
          same = sameJobAs(pc, d, ctx0);
        if (!TP)
          TP = LIB.filter(
            x =>
              !isBasic(x.n) &&
              legalIn(x, d.format) &&
              x.ci.every(k => ctx0.ident.includes(k)) &&
              mustOk(x, d) &&
              themeOf(x, T) &&
              !entryOf(d, x.n) &&
              !dis0.has(x._n)
          );
        const cand = TP.filter(x => !used.has(x._n) && priceBand(x.p) === band && (x.p != null || band === 'apex') && same(x))
          .map(x => ({n: x.n, theme: themeOf(x, T), v: vc == null ? 0 : R.valOf(x)}))
          .filter(a => vc == null || (a.v > vcu && a.v >= vc - 0.25 * Math.max(0, vc - vcu)))
          .sort((a, b) => b.v - a.v);
        for (const a of cand.slice(0, 2)) {
          const w = dOfR({cut: p.cut, add: a.n, q: p.q});
          if (w != null && w >= SCORE_MIN && w >= 0.75 * v) {
            L.opts[t] = swapTo(p, a.n, w, a.theme);
            themed++;
            break;
          }
        }
      }
    }
  // The deck score decides every slot (the owner's rule). Among the cards that do the same job as the slot's pick, measured
  // against the same card going out: the one that raises the deck score most is the Apex card, whatever it costs; the best
  // of the rest under $12 is Mid and the best of the rest under $3 is Budget. A card that raises the score but loses to its
  // own price tier's pick is an alternative there (at least half that pick's gain, best three). Nothing else is suggested.
  // An on-theme card counts as equal when it is within RANK_THEME of the best (the "on theme, within reason" rule).
  if (o.rank !== false && UP.rank) {
    const used = new Set(),
      rows = R.paths.concat(extra);
    rows.forEach(L =>
      ['apex', 'mid', 'budget', 'free'].forEach(t => {
        if (L.opts[t]) used.add(norm(L.opts[t].add));
      })
    );
    const inDeck = new Set(d.cards.map(e => norm(e.n)).concat([norm(d.commander)], d.partner ? [norm(d.partner)] : []));
    // the deck's playable cards, each with a quick strength guess (play rate with this commander, then popularity) used only
    // to choose which cards are measured; the deck score then decides
    const U = LIB.filter(
      x =>
        !isBasic(x.n) &&
        legalIn(x, d.format) &&
        x.ci.every(k => ctx0.ident.includes(k)) &&
        mustOk(x, d) &&
        !inDeck.has(x._n) &&
        !dis0.has(x._n)
    )
      .map(x => {
        const e = ctx0.edh && edhOf(ctx0.edh.map, x);
        return {
          c: x,
          g: (e ? 10 * e.inc + 4 * Math.max(0, e.syn) : 0) + (x.r ? Math.max(0, 1 - Math.log(x.r + 1) / Math.log(40000)) : 0)
        };
      })
      .sort((a, b) => b.g - a.g);
    // the cards measured for a row: its picks and the strongest cards that do the same job, as of the cards already used on the list
    const sel = L => {
      const O = L.opts,
        ref = O.apex || O.mid || O.budget;
      if (!ref) return null;
      const rc = find(ref.add);
      if (!rc) return null;
      const mine = new Set(['apex', 'mid', 'budget'].map(t => O[t] && norm(O[t].add)).filter(Boolean)),
        weak = !!(UP.weakD && ref.dScore != null && ref.dScore < UP.weakD),
        sameP = sameJobAs(rc, d, ctx0, weak ? 2 : undefined),
        cc = UP.altCut && find(L.cut),
        sameC = cc && !!tags(cc).land === !!tags(rc).land ? sameJobAs(cc, d, ctx0, weak ? 2 : undefined) : null,
        same = !sameC ? sameP : x => sameP(x) || sameC(x),
        strict = weak && UP.weakA ? sameJobAs(rc, d, ctx0) : null,
        land = !!tags(rc).land; // a slot whose pick barely helps may take an off-theme card (owner: on-theme wins when about equal)
      const pool = [],
        nb = {budget: 0, mid: 0};
      for (const y of U) {
        const x = y.c;
        if (
          !!tags(x).land !== land ||
          (used.has(x._n) && !mine.has(x._n)) ||
          x.p == null ||
          (R.cap && !(x.p < R.cap) && !(own && own.has(x._n))) ||
          !same(x)
        )
          continue;
        const b = underCap(x.p, 'budget'),
          m = underCap(x.p, 'mid');
        if (pool.length >= UP.rankP && !(b && nb.budget < UP.rankB * 2) && !(m && nb.mid < UP.rankB * 2)) {
          if (nb.budget >= UP.rankB * 2 && nb.mid >= UP.rankB * 2) break;
          continue;
        }
        pool.push(x);
        if (b) nb.budget++;
        if (m) nb.mid++;
      }
      const vv = x => {
        if (!VM.has(x._k)) VM.set(x._k, R.valOf ? R.valOf(x) : 0);
        return VM.get(x._k);
      };
      const byV = pool.slice().sort((a, b) => vv(b) - vv(a)),
        pick = new Map();
      byV.slice(0, UP.rankN).forEach(x => pick.set(x._n, x));
      ['budget', 'mid'].forEach(t =>
        byV
          .filter(x => underCap(x.p, t))
          .slice(0, UP.rankB)
          .forEach(x => pick.set(x._n, x))
      );
      mine.forEach(k => {
        const c = pool.find(x => x._n === k) || LIB.find(x => x._n === k);
        if (c) pick.set(k, c);
      });
      return {O, ref, rc, mine, weak, sameP, cc, sameC, same, strict, land, pool, vv, byV, pick};
    };
    // With helper cores (Build 144: measureBatch.par), every row's candidates are measured up front in one batch they share,
    // instead of a small batch per row; each row then finds its measurements already made (any it lacks are measured as before).
    if ((measureBatch.par || 0) > 1) {
      const ps = [];
      for (const L of rows) {
        const s = sel(L);
        if (s) s.pick.forEach(c => ps.push({cut: L.cut, add: c.n, q: s.ref.q}));
      }
      const b = batch(ps);
      if (b) took(b, yield b);
    }
    for (const L of rows) {
      const s = sel(L);
      if (!s) continue;
      const {O, ref, rc, mine, weak, sameP, cc, sameC, same, strict, land, pool, vv, byV, pick} = s;
      {
        const b = batch([...pick.values()].map(c => ({cut: L.cut, add: c.n, q: ref.q})));
        if (b) took(b, yield b);
      }
      const C0 = [...pick.values()].map(c => ({
          c,
          w: dOf({cut: L.cut, add: c.n, q: ref.q}),
          we: dOfE({cut: L.cut, add: c.n, q: ref.q}),
          th: themeOf(c, T),
          rx: !!(strict && !strict(c)),
          oc: !!(sameC && !sameP(c))
        })),
        C = C0.filter(x => x.w != null && x.w >= Math.max(scoreFloor(), UP.rankMin)).sort(
          (a, b) => b.w - a.w || vv(b.c) - vv(a.c)
        );
      {
        const b = C[0],
          e = b && ctx0.edh && edhOf(ctx0.edh.map, b.c);
        L.top = b ? {n: b.c.n, p: b.c.p, dScore: b.w, inc: e ? +e.inc.toFixed(3) : 0} : null;
      } // the highest score measured for this slot
      const take = (list, t) => {
        if (!list.length) return null;
        const top = list[0],
          th = list.find(x => x.th && x.w >= top.w - Math.abs(top.w) * RANK_THEME);
        return th || top;
      };
      // a held pick (the player has seen it and it holds its place until swapped, ruled out or regenerated) keeps its tier
      const out = {},
        left = C.slice();
      ['apex', 'mid', 'budget'].forEach(t => {
        const p = O[t];
        if (!p || (UP.rankPick && !p.held)) return;
        const i = left.findIndex(y => y.c._n === norm(p.add));
        out[t] = Object.assign({}, p, {dScore: i >= 0 ? left[i].w : p.dScore});
        if (i >= 0) left.splice(i, 1);
      });
      for (const t of ['apex', 'mid', 'budget']) {
        if (out[t] || !UP.rankPick) continue;
        const x = take(t === 'apex' ? left : left.filter(y => underCap(y.c.p, t)), t);
        if (!x) continue;
        left.splice(left.indexOf(x), 1);
        const old = ['apex', 'mid', 'budget'].map(k => O[k]).find(p => p && norm(p.add) === x.c._n);
        out[t] = old ? Object.assign({}, old, {dScore: x.w, t}) : Object.assign(swapTo(ref, x.c.n, x.w, x.th), {t});
      }
      if (!UP.rankPick) for (let k = left.length - 1; k >= 0; k--) if (mine.has(left[k].c._n)) left.splice(k, 1); // the slot's own picks are not their own alternatives
      // Alternatives, by price tier: cards that raise the deck score by at least half as much as that tier's pick. With
      // popular picks leading, one may raise the score more than the pick; when few of this commander's players run it,
      // it is marked an unpopular pick, with the numbers behind it.
      const alts = {apex: [], mid: [], budget: []};
      left.forEach(x => {
        const t =
            x.c.p != null && underCap(x.c.p, 'budget') ? 'budget' : x.c.p != null && underCap(x.c.p, 'mid') ? 'mid' : 'apex',
          tp = out[t] || out.mid || out.apex;
        if (!tp || alts[t].length >= 3 || (UP.rankPick && x.w > tp.dScore) || x.w < Math.max(scoreFloor(), 0.5 * tp.dScore))
          return;
        const e = ctx0.edh && edhOf(ctx0.edh.map, x.c),
          inc = e ? e.inc : 0;
        alts[t].push({
          n: x.c.n,
          p: x.c.p,
          dScore: x.w,
          theme: x.th,
          inc: +inc.toFixed(3),
          decks: ctx0.edh ? ctx0.edh.decks || 0 : 0,
          vs: tp.add,
          vsScore: tp.dScore,
          vsInc: +incN(tp.add).toFixed(3),
          unpop: unpopOf(x.w, inc, tp)
        });
      });
      if (UP.rankPick)
        ['apex', 'mid', 'budget'].forEach(t => {
          if (out[t]) O[t] = out[t];
          else if (O[t] && O[t].pc && !['apex', 'mid', 'budget'].some(k => out[k] && norm(out[k].add) === norm(O[t].add))) {
            /* a Players' choice pick holds when no card raises the score */
          } else if (O[t]) {
            delete O[t];
            (L.none = L.none || {})[t] =
              'No card under $' + TIERS[t].cap + ' that does this job raises the deck score enough after the cards above it';
          }
        });
      // Players decide what competes, the deck score picks the winner (UP.cand): the candidates are cards this commander's players
      // run in at least UP.cand of decks, proven staples and tournament staples. In each column the highest-scoring candidate at
      // that price is the pick (each card once on the row); the popular pick it replaces stays first among the alternatives, marked
      // Most played, so the popular vote is never lost.
      if (UP.cand > 0) {
        const thin = !ctx0.edh || !ctx0.edh.map || ctx0.edh.map.size < 100,
          cred = x =>
            thin ||
            CORE.has(x.c._n) ||
            (x.c.r && x.c.r < 400) ||
            !!tourneyOf(x.c, d) ||
            ((ctx0.edh && edhOf(ctx0.edh.map, x.c)) || {inc: 0}).inc >= UP.cand;
        // the players' vote counts as evidence of strength the score can't see: each candidate's value is its score gain plus
        // UP.candL times the share of this commander's players who run it (UP.candL 0: the score alone decides)
        const incOf = x => ((ctx0.edh && edhOf(ctx0.edh.map, x.c)) || {inc: 0}).inc,
          est = x => (x.we != null ? x.we : x.w) + (UP.candL || 0) * incOf(x);
        const CR = C.filter(x => cred(x) && !x.rx && !x.oc && (x.we != null ? x.we : x.w) >= UP.candMin).sort(
            (a, b) => est(b) - est(a)
          ),
          taken = new Set(),
          pop = {}; // a new pick clears practice-game noise
        for (const t of ['apex', 'mid', 'budget']) {
          let cur = O[t];
          if (cur && (cur.held || (UP.gcT && t === 'apex' && cur.gcPick && L.gcPick))) {
            taken.add(norm(cur.add));
            continue;
          } // a pick the player chose holds its place, and so does an Apex Game Changer row's (UP.gcT)
          if (cur && taken.has(norm(cur.add))) {
            cur = null;
            delete O[t];
          }
          const b = (t === 'apex' ? CR : CR.filter(x => x.c.p != null && underCap(x.c.p, t))).find(x => !taken.has(x.c._n));
          const curEst = cur
            ? (cur.dScore != null ? cur.dScore : -1e9) +
              (UP.candL || 0) * ((ctx0.edh && edhOf(ctx0.edh.map, find(cur.add))) || {inc: 0}).inc
            : -1e9;
          if (
            b &&
            (!cur || (est(b) > curEst + Math.max(SCORE_MIN, UP.candM || 0) && b.w > (cur.dScore != null ? cur.dScore : -1e9))) &&
            !(cur && norm(cur.add) === b.c._n)
          ) {
            if (cur) pop[t] = cur;
            O[t] = Object.assign(swapTo(ref, b.c.n, b.w, b.th), {t, held: false, cut: L.cut, q: ref.q});
          }
          if (O[t]) taken.add(norm(O[t].add));
          else if (!(L.none && L.none[t])) (L.none = L.none || {})[t] = 'The Apex card already costs under $' + TIERS[t].cap;
        }
        const onRow = new Set(['apex', 'mid', 'budget'].map(t => O[t] && norm(O[t].add)).filter(Boolean));
        for (const t in pop) {
          const p0 = pop[t];
          if (onRow.has(norm(p0.add))) continue;
          const c0 = find(p0.add),
            e0 = c0 && ctx0.edh && edhOf(ctx0.edh.map, c0);
          (L.pop = L.pop || {})[t] = p0;
          alts[t] = [
            {
              n: p0.add,
              p: c0 ? c0.p : null,
              dScore: p0.dScore,
              theme: themeOf(c0, T),
              inc: e0 ? +e0.inc.toFixed(3) : 0,
              decks: ctx0.edh ? ctx0.edh.decks || 0 : 0,
              vs: O[t] && O[t].add,
              vsScore: O[t] && O[t].dScore,
              most: true
            }
          ]
            .concat(alts[t].filter(x => norm(x.n) !== norm(p0.add)))
            .slice(0, 3);
          onRow.add(norm(p0.add));
        }
        // Mid and Budget never raise the deck score more than the Apex pick: a cheaper card that would is moved to the
        // alternatives (still on the row) and the column takes the best candidate that doesn't
        const ap = O.apex && O.apex.dScore != null ? O.apex.dScore : null;
        if (ap != null)
          for (const t of ['mid', 'budget']) {
            const p = O[t];
            if (!p || p.held || p.dScore == null || p.dScore <= ap + SCORE_MIN) continue;
            const c0 = find(p.add),
              e0 = c0 && ctx0.edh && edhOf(ctx0.edh.map, c0);
            alts[t] = [
              {
                n: p.add,
                p: c0 ? c0.p : null,
                dScore: p.dScore,
                theme: themeOf(c0, T),
                inc: e0 ? +e0.inc.toFixed(3) : 0,
                decks: ctx0.edh ? ctx0.edh.decks || 0 : 0,
                vs: O.apex.add,
                vsScore: ap,
                unpop: false
              }
            ]
              .concat(alts[t])
              .slice(0, 3);
            onRow.delete(norm(p.add));
            const b = CR.filter(x => x.c.p != null && underCap(x.c.p, t)).find(
              x => !onRow.has(x.c._n) && x.w <= ap + SCORE_MIN && x.c._n !== norm(p.add)
            );
            if (b) {
              O[t] = Object.assign(swapTo(ref, b.c.n, b.w, b.th), {t, held: false, cut: L.cut, q: ref.q});
              onRow.add(b.c._n);
            } else {
              delete O[t];
              (L.none = L.none || {})[t] =
                'The cheaper cards for this job would raise the score more than the Apex pick; they are listed as alternatives';
            }
          }
        ['apex', 'mid', 'budget'].forEach(t => {
          const tp = O[t] || O.mid || O.apex;
          alts[t] = alts[t].filter(
            x =>
              x.most ||
              (!onRow.has(norm(x.n)) && (!tp || x.dScore >= Math.max(scoreFloor(), 0.5 * tp.dScore) || x.dScore > tp.dScore))
          );
        });
      }
      // Apex is the strongest pick on the row: a cheaper pick (or, with UP.apexMax 2, the row's highest-scoring card) that raises the
      // deck score more becomes the Apex pick, and is not repeated in its cheaper column.
      if (UP.apexMax) {
        let best = O.apex,
          bw = O.apex && O.apex.dScore != null ? O.apex.dScore : -1e9;
        ['mid', 'budget'].forEach(t => {
          const p = O[t];
          if (p && p.dScore != null && p.dScore > bw + SCORE_MIN) {
            best = p;
            bw = p.dScore;
          }
        });
        if (UP.apexMax > 1 && L.top && L.top.dScore > bw + SCORE_MIN && !(O.apex && norm(O.apex.add) === norm(L.top.n))) {
          const tc = find(L.top.n);
          if (tc) {
            best = Object.assign(swapTo(ref, tc.n, L.top.dScore, themeOf(tc, T)), {t: 'apex'});
            bw = L.top.dScore;
          }
        }
        if (best && best !== O.apex) {
          const nb = Object.assign({}, best, {t: 'apex', held: false});
          O.apex = nb;
          used.add(norm(nb.add));
          ['mid', 'budget'].forEach(t => {
            if (O[t] && norm(O[t].add) === norm(nb.add)) {
              delete O[t];
              (L.none = L.none || {})[t] = 'The Apex card already costs under $' + TIERS[t].cap;
            }
          });
          // alternatives are measured against their tier's pick again (it may now be the stronger Apex card)
          ['apex', 'mid', 'budget'].forEach(t => {
            const tp = O[t] || O.mid || O.apex;
            alts[t] = alts[t]
              .filter(x => norm(x.n) !== norm(nb.add) && tp && x.dScore >= Math.max(scoreFloor(), 0.5 * tp.dScore))
              .map(x =>
                Object.assign(x, {
                  vs: tp.add,
                  vsScore: tp.dScore,
                  vsInc: +incN(tp.add).toFixed(3),
                  unpop: unpopOf(x.dScore, x.inc, tp)
                })
              );
          });
        }
      }
      // Players' choice (UP.plc): a card at least UP.plc of this commander's players run (and clearly more than run the card going out)
      // that the deck score sees as about even here (no worse than UP.plcS) is listed among the alternatives, labelled with its play
      // rate, so the players' pick is never hidden. One per price column, after the cards that raise the score.
      if (UP.plc) {
        const onRow = new Set(
          ['apex', 'mid', 'budget']
            .map(t => O[t] && norm(O[t].add))
            .concat(
              Object.values(alts)
                .flat()
                .map(a => norm(a.n))
            )
            .filter(Boolean)
        );
        C0.filter(
          x =>
            x.w != null &&
            x.w < Math.max(scoreFloor(), UP.rankMin) &&
            !x.rx &&
            !onRow.has(x.c._n) &&
            !used.has(x.c._n) &&
            pcOk({cut: L.cut, add: x.c.n}, x.w)
        )
          .sort((a, b) => incN(b.c.n) - incN(a.c.n) || b.w - a.w)
          .forEach(x => {
            const t =
              x.c.p != null && underCap(x.c.p, 'budget') ? 'budget' : x.c.p != null && underCap(x.c.p, 'mid') ? 'mid' : 'apex';
            if (alts[t].some(a => a.pc) || onRow.has(x.c._n)) return;
            const tp = O[t] || O.mid || O.apex;
            const a = {
              n: x.c.n,
              p: x.c.p,
              dScore: x.w,
              theme: x.th,
              inc: +incN(x.c.n).toFixed(3),
              decks: ctx0.edh.decks || 0,
              vs: tp && tp.add,
              vsScore: tp && tp.dScore,
              pc: true
            };
            if (alts[t].length >= 3) alts[t][2] = a;
            else alts[t].push(a);
            onRow.add(x.c._n);
          });
      }
      ['apex', 'mid', 'budget'].forEach(t => {
        if (O[t]) used.add(norm(O[t].add));
      });
      Object.values(alts)
        .flat()
        .forEach(a => used.add(norm(a.n)));
      L.alts = alts;
      L.ranked = true;
    }
  }
  // Spare lands (owner's rule): when the deck runs more lands than its target, each extra land is a slot that can go for a
  // stronger card, never more than the surplus and never when the deck is at or under target. Land changes are measured
  // with fresh practice games (the stored games can't show what losing a land does); each card must raise the score.
  if (o.spare !== false && UP.spare) {
    const rows0 = R.paths.concat(extra),
      cutting = new Set(rows0.map(L => norm(L.cut))),
      already = rows0.filter(L => {
        const c = find(L.cut);
        return (
          c &&
          tags(c).land &&
          Object.values(L.opts).some(p => {
            const a = find(p.add);
            return a && !tags(a).land;
          })
        );
      }).length;
    // never more land-for-spell swaps than the surplus, counting any the list already has; a land already being cut is skipped
    const sp = spareLands(d)
      .filter((n, i, a) => isBasic(n) || !cutting.has(norm(n)))
      .slice(0, Math.max(0, spareLands(d).length - already));
    if (sp.length) {
      try {
        const A = analyze(d);
        const used = new Set(R.paths.concat(extra).flatMap(L => Object.values(L.opts).map(p => norm(p.add)))),
          inDeck = new Set(d.cards.map(e => norm(e.n)).concat([norm(d.commander)], d.partner ? [norm(d.partner)] : []));
        const vv = x => {
          if (!VM.has(x._k)) VM.set(x._k, R.valOf ? R.valOf(x) : 0);
          return VM.get(x._k);
        };
        const P = LIB.filter(
            x =>
              !tags(x).land &&
              !isBasic(x.n) &&
              legalIn(x, d.format) &&
              x.ci.every(k => ctx0.ident.includes(k)) &&
              mustOk(x, d) &&
              !inDeck.has(x._n) &&
              !dis0.has(x._n) &&
              !used.has(x._n) &&
              x.p != null &&
              !(R.cap && !(x.p < R.cap) && !(own && own.has(x._n)))
          ).sort((a, b) => vv(b) - vv(a)),
          pick = new Map();
        P.slice(0, UP.spareN).forEach(x => pick.set(x._n, x));
        ['budget', 'mid'].forEach(t =>
          P.filter(x => underCap(x.p, t))
            .slice(0, 2)
            .forEach(x => pick.set(x._n, x))
        );
        // measured on fresh practice games, as one batch: the deck itself first, then each spare land swapped for a candidate
        const PK = [...pick.values()],
          fv = yield {kind: 'fresh', d, apex: o.apex, games: 200, keys: [['', '', 0]].concat(PK.map(c => [sp[0], c.n, 1]))},
          b0 = fv[0];
        const M = PK.map((c, i) => ({c, w: +(fv[i + 1] - b0).toFixed(2)}))
            .filter(x => x.w != null && x.w >= Math.max(scoreFloor(), UP.rankMin))
            .sort((a, b) => b.w - a.w),
          taken = new Set();
        const why = 'Uses a spare land: the deck runs ' + A.lands + ' lands, about ' + A.T.lands + ' needed';
        const mk = (cut, x, t) => ({
          cut,
          add: x.c.n,
          q: 1,
          t,
          why: [why],
          cutWhy: ['Spare land (' + A.lands + ' lands, about ' + A.T.lands + ' needed)'],
          gc: !!x.c.gc,
          gcOut: false,
          own: !!(own && own.has(x.c._n)),
          dScore: x.w,
          spare: true
        });
        sp.forEach(cut => {
          const O = {},
            nx = f => M.find(x => !taken.has(x.c._n) && f(x));
          const a = nx(() => true);
          if (!a) return;
          taken.add(a.c._n);
          O.apex = mk(cut, a, 'apex');
          for (const t of ['mid', 'budget']) {
            if (underCap(a.c.p, t)) continue;
            const x = nx(y => underCap(y.c.p, t));
            if (x) {
              taken.add(x.c._n);
              O[t] = mk(cut, x, t);
            }
          }
          extra.push({cut, opts: O, none: {}, gain: 0, alts: {apex: [], mid: [], budget: []}, ranked: true, spare: true});
        });
      } catch (e) {}
    }
  }
  // re-paired picks follow the engine's own list (measured: better agreement with players than keeping their old place)
  extra.forEach(x => delete x.after);
  R.paths = R.paths.filter(L => ['apex', 'mid', 'budget', 'free'].some(t => L.opts[t])).concat(extra);
  // the engine's order (strongest upgrade first, checked against real players) is kept
  // Borderline swaps are confirmed (UP.conf, Build 141): a swap that raises the score by less than UP.conf on the stored practice
  // games is measured again on fresh ones, and left out unless it still raises the score; the floor is meant to be a margin the
  // practice games cannot undo, and near it they sometimes can.
  if (UP.conf) {
    let b1 = null;
    const fresh = new Map(),
      fr = p => {
        const k = p.cut + '>' + p.add + '>' + (p.q || 1);
        if (!fresh.has(k)) {
          try {
            if (b1 == null) b1 = evaluateDeck(d, {apex: o.apex, games: 300}).exact;
            const u = JSON.parse(JSON.stringify(d));
            delete u.plan;
            cutCard(u, p.cut, p.q || 1);
            addCard(u, p.add, p.q || 1);
            fresh.set(k, evaluateDeck(u, {apex: o.apex, games: 300}).exact - b1);
          } catch (e) {
            fresh.set(k, 1);
          }
        }
        return fresh.get(k);
      };
    R.paths.forEach(L => {
      if (L.spare) return;
      for (const t in L.opts) {
        const p = L.opts[t];
        if (!p || p.held || p.dScore == null || p.dScore >= UP.conf) continue;
        const c = find(p.cut),
          a = find(p.add);
        if ((c && tags(c).land) || (a && tags(a).land)) continue;
        if (fr(p) < UP.confT) {
          (R.confDrop = R.confDrop || []).push([L.cut, p.add, t, p.dScore, +fr(p).toFixed(2)]);
          delete L.opts[t];
        }
      }
    });
    R.paths = R.paths.filter(L => Object.values(L.opts).some(Boolean));
  }
  // Game Changers follow the rule of every other mechanic (owner, 18 Oct): an Apex Game Changer row stays only when the card is a
  // Good or Great fit for this deck (evalFit, the card window's own rating); up to UP.gcK of them, and more only when one is a
  // Strong upgrade or better (raises the deck score by UP.gcS or more).
  if (UP.gcF) {
    const G = R.paths
      .filter(L => L.gcPick && L.opts.apex && L.opts.apex.gcPick)
      .sort((a, b) => (b.opts.apex.dScore || 0) - (a.opts.apex.dScore || 0));
    let k = 0;
    const drop = new Set();
    for (const L of G) {
      const p = L.opts.apex,
        c = find(p.add);
      let f = 'poor';
      try {
        f = evalFit(d, c, null).fit;
      } catch (e) {}
      if (!(f === 'great' || f === 'good') || (k >= UP.gcK && !((p.dScore || 0) >= UP.gcS))) drop.add(L);
      else k++;
    }
    if (drop.size) {
      R.paths = R.paths.filter(L => !drop.has(L));
      R.gcDropped = (R.gcDropped || 0) + drop.size;
    }
  }
  if (R.trimOf) {
    const n0 = R.paths.length;
    R.paths = R.paths.filter(L => !R.trimOf(L));
    R.trimN = (R.trimN || 0) + n0 - R.paths.length;
  }
  const trimmed = R.trimN || 0;
  // Past the maximum (UP.uncTail): a row whose gain shows only past the parts' maximum (its pick raises the shown score by less
  // than the floor) stays on the list but goes after every row with a gain on the shown score.
  if (UP.unc && UP.uncTail) {
    const ex = L => {
      const p = tierPick(L, 'apex') || L.opts.apex || Object.values(L.opts)[0];
      if (!p || L.spare) return 1;
      const c = find(p.cut),
        a = find(p.add);
      if ((c && tags(c).land) || (a && tags(a).land)) return 1;
      const v = both(p)[1];
      return v == null ? 1 : v;
    };
    const pcRow = L => {
      const p = tierPick(L, 'apex') || L.opts.apex || Object.values(L.opts)[0];
      return !!(p && p.pc);
    };
    const lo = [],
      pcs = [];
    R.paths = R.paths
      .filter(L => {
        const v = ex(L);
        if (v >= scoreFloor()) return true;
        if (pcRow(L)) {
          L.pcRow = true;
          pcs.push(L);
          return false;
        }
        if (v >= 0) {
          L.pastMax = true;
          lo.push(L);
        }
        return false;
      })
      .concat(lo, pcs);
  } // never a swap that lowers the shown score (owner's rule)   // scoreCheck can run twice on one list recount(R);   // picks changed above (and rows left out): the tier counts follow
  R.scored = {base: base.exact, dropped, refilled, themed, repaired, trimmed};
  R.dOf = (cut, add, q) => swapScore(d, base, o.apex, cut, add, q);
  R.base = {sim: base.sim, exact: base.exact, cmp: base.cmp};
  R.apexR = o.apex;
  return R; // so the search can be measured on other cores (Build 146)
}
// Whole-pool search (owner, 18 Oct; UP.pool2): after the list is checked, every legal card that does the same job as a row's pick
// (the alternatives' rule) is measured as well, a few at a time while the app is idle, so a row's Highest score is the best of
// the whole pool, not only of the shortlist. poolQueue lists the work; poolStep does some of it and says which rows changed.
// The cards the search may offer: legal, in colours, not in the deck or ruled out, priced, under the list's cap; most played first.
function poolU(d, R) {
  const ctx = ctxOf(d),
    dis = new Set((d.dismissed || []).map(norm));
  const inDeck = new Set(d.cards.map(e => norm(e.n)).concat([norm(d.commander)], d.partner ? [norm(d.partner)] : [])),
    own = upgradePaths.own;
  const used = new Set(
    R.paths.flatMap(L =>
      Object.values(L.opts)
        .filter(Boolean)
        .map(p => norm(p.add))
    )
  );
  const U = LIB.filter(
    x =>
      !isBasic(x.n) &&
      !tags(x).land &&
      legalIn(x, d.format) &&
      x.ci.every(k => ctx.ident.includes(k)) &&
      mustOk(x, d) &&
      !inDeck.has(x._n) &&
      !dis.has(x._n) &&
      x.p != null &&
      !(R.cap && !(x.p < R.cap) && !(own && own.has(x._n)))
  )
    .map(x => {
      const e = ctx.edh && edhOf(ctx.edh.map, x);
      return {
        c: x,
        g: (e ? 10 * e.inc + 4 * Math.max(0, e.syn) : 0) + (x.r ? Math.max(0, 1 - Math.log(x.r + 1) / Math.log(40000)) : 0)
      };
    })
    .sort((a, b) => b.g - a.g)
    .map(y => y.c);
  return {ctx, U, used};
}
// Scouting for the strongest cards whatever their job (UP.poolX): a swap's gain is close to "the card in" minus "the card out",
// so each likely card (the UP.poolXs most played and the UP.poolXb best by card value) is measured once against one slot (the
// list's first row), and the UP.poolX best of them are then measured on every row by the search. Returns the swaps to measure.
function poolScout(d, R) {
  if (!UP.poolX || !R || !R.dOf || d.format !== 'commander') return null;
  const ref = R.paths.find(L => {
    const c = find(L.cut);
    return c && !L.spare && !tags(c).land && (L.opts.apex || L.opts.mid || L.opts.budget);
  });
  if (!ref) return null;
  const {U} = poolU(d, R),
    seen = new Set(),
    out = [];
  const put = x => {
    if (!seen.has(x._n)) {
      seen.add(x._n);
      out.push(x.n);
    }
  };
  U.slice(0, UP.poolXs || 0).forEach(put);
  if (UP.poolXb && R.valOf)
    U.slice(0, UP.poolXw || 3000)
      .map(x => ({x, v: R.valOf(x)}))
      .sort((a, b) => b.v - a.v)
      .slice(0, UP.poolXb)
      .forEach(y => put(y.x));
  return {cut: ref.cut, names: out, keys: out.map(n => [ref.cut, n, 1])};
}
// The scouting results (one value per name, in order): the UP.poolX best, for poolQueue.
function poolScoutApply(R, S0, vals) {
  R.scout = S0.names
    .map((n, i) => ({n, v: vals[i]}))
    .filter(y => y.v != null)
    .sort((a, b) => b.v - a.v)
    .slice(0, UP.poolX)
    .map(y => y.n);
}
function poolQueue(d, R) {
  if (!R || !R.dOf || d.format !== 'commander') return null;
  const {ctx, U, used} = poolU(d, R);
  // The strongest cards for this deck, whatever their job (owner, 31 Oct: "the apex deck should be the strongest deck possible
  // for that commander"), from the scouting above: they are measured on every row too, so a card the job rule files elsewhere
  // (The Soul Stone as ramp, Animate Dead as an aura, Entomb as a tutor) still wins the slot it improves most.
  const G = (R.scout || []).map(n => find(n)).filter(x => x && !tags(x).land);
  const rows = [],
    withG = (A, mine) => {
      const have = new Set(A.map(x => x._n));
      return A.concat(G.filter(x => !have.has(x._n) && (!used.has(x._n) || mine.has(x._n))));
    };
  R.paths.forEach((L, i) => {
    const p = L.opts.apex || L.opts.mid || L.opts.budget,
      rc = p && find(p.add),
      cc = find(L.cut);
    if (!rc || !cc || L.spare || tags(cc).land || tags(rc).land) return;
    const mine = new Set(
        Object.values(L.opts)
          .filter(Boolean)
          .map(o => norm(o.add))
      ),
      same = sameJobAs(rc, d, ctx);
    rows.push({
      L,
      i,
      q: p.q || 1,
      mine,
      pool: withG(U.filter(x => (!used.has(x._n) || mine.has(x._n)) && same(x)).slice(0, UP.poolN), mine),
      k: 0
    });
  });
  // More rows (UP.poolRows): the deck's weakest spells that have no row yet are measured against the same strongest cards, so
  // a weak card is not kept only because no card of its own job beat it. A new row is shown only if a card raises the score.
  if (UP.poolRows && G.length && R.valOf) {
    const cutSet = new Set(R.paths.map(L => norm(L.cut))),
      lead = new Set([norm(d.commander), d.partner ? norm(d.partner) : ''].filter(Boolean));
    d.cards
      .map(e => ({e, c: find(e.n)}))
      .filter(
        ({e, c}) => c && !e.l && !isBasic(c.n) && !tags(c).land && !cutSet.has(c._n) && !lead.has(c._n) && !c.gc && !isFinisher(c)
      )
      .map(y => Object.assign(y, {v: R.valOf(y.c)}))
      .sort((a, b) => a.v - b.v)
      .slice(0, UP.poolRows)
      .forEach(({e}) => {
        const L = {cut: e.n, opts: {}, gain: 0, extra: true, ranked: true}; // joins the list in poolPromote, once it has a pick
        rows.push({L, i: -1, q: 1, mine: new Set(), pool: withG([], new Set()), k: 0});
      });
  }
  return {rows, r: 0, done: 0, total: rows.reduce((a, x) => a + x.pool.length, 0), dOf: R.dOf, edh: ctx.edh, R};
}
function poolStep(Q, ms) {
  const t0 = Date.now(),
    changed = new Set();
  if (!Q) return changed;
  while (Q.r < Q.rows.length && Date.now() - t0 < ms) {
    const x = Q.rows[Q.r];
    if (x.k >= x.pool.length) {
      Q.r++;
      continue;
    }
    const c = x.pool[x.k++];
    Q.done++;
    const L = x.L,
      v = Q.dOf(L.cut, c.n, x.q);
    if (v == null || v < Math.max(scoreFloor(), UP.rankMin)) continue;
    poolKeep(L, c, v);
    if (L.top && v <= L.top.dScore) continue;
    const e = Q.edh && edhOf(Q.edh.map, c);
    L.top = {n: c.n, p: c.p, dScore: v, inc: e ? +e.inc.toFixed(3) : 0, pool: true};
    changed.add(x.i);
  }
  return changed;
}
// The whole search at once (Build 146): every swap it measures, in order, as one batch for the background cores (measureBatch
// 'swap': its first value is R.dOf's), then the results applied exactly as poolStep would, so the outcome is the same.
function poolKeys(Q) {
  return Q.rows.flatMap(x => x.pool.map(c => [x.L.cut, c.n, x.q]));
}
function poolApply(Q, vals) {
  let i = 0;
  for (const x of Q.rows) {
    for (const c of x.pool) {
      const r = vals[i++],
        v = r && r[0] != null ? r[0] : null;
      const L = x.L;
      if (v == null || v < Math.max(scoreFloor(), UP.rankMin)) continue;
      poolKeep(L, c, v);
      if (L.top && v <= L.top.dScore) continue;
      const e = Q.edh && edhOf(Q.edh.map, c);
      L.top = {n: c.n, p: c.p, dScore: v, inc: e ? +e.inc.toFixed(3) : 0, pool: true};
    }
    x.k = x.pool.length;
  }
  Q.r = Q.rows.length;
  Q.done = Q.total;
}
// Version 0.9.3 (owner, 19 Oct: "If a 38 cent card is the best card, it's the Apex card. We have too many rules conflicting"):
// once the whole-card search is done, one rule decides each row's picks. Apex is the card that raises the deck score most of every
// card measured for the slot (the search's finds and the check's own best included), Mid and Budget the best of the rest under $12 and $3 (or owned). A held
// pick or a Game Changer row no longer keeps a weaker card in place (its hold is released). Each card is on one row: biggest finds first.
// A pick that loses its place is not lost: it stays on the row as Mid or Budget when its price fits, and in the alternatives.
// Each row's best few search finds (0.9.3), so a card another row takes leaves this row its next best.
function poolKeep(L, c, v) {
  const A = L.finds || (L.finds = []);
  if (A.some(y => y.n === c.n)) return;
  A.push({n: c.n, dScore: v});
  A.sort((a, b) => b.dScore - a.dScore);
  // with the strongest cards measured on every row, every row's best few are the same cards: keep enough that a row still has
  // its own best once other rows have taken those
  const keep = UP.poolX ? UP.poolKeep || 30 : 6;
  if (A.length > keep) A.length = keep;
}
function poolPromote(Q, d) {
  if (!Q) return [];
  const own = upgradePaths.own,
    used = new Set(),
    freed = [],
    T3 = ['apex', 'mid', 'budget'],
    TC = d ? themeCtx(d) : null,
    inc = n => {
      const e = Q.edh && edhOf(Q.edh.map, find(n));
      return e ? +e.inc.toFixed(3) : 0;
    };
  const fits = (p, t) => underCap((find(p.add) || {}).p, t) || !!p.own,
    best = O =>
      T3.map(t => O[t])
        .filter(p => p && p.dScore != null)
        .sort((a, b) => b.dScore - a.dScore)[0];
  Q.rows.forEach(x =>
    Object.values(x.L.opts).forEach(p => {
      if (p) used.add(norm(p.add));
    })
  );
  // every row's candidates: its search finds and the best card its own check measured (L.top), biggest gains first across rows
  const cand = [];
  Q.rows.forEach(x => {
    const L = x.L,
      seen = new Set();
    (L.finds || []).concat(L.top ? [L.top] : []).forEach(f => {
      if (!seen.has(f.n)) {
        seen.add(f.n);
        cand.push({x, n: f.n, v: f.dScore});
      }
    });
  });
  cand.sort((a, b) => b.v - a.v);
  const done = new Set();
  for (const y of cand) {
    const L = y.x.L,
      O = L.opts,
      k = norm(y.n),
      c = find(y.n),
      base = O.apex || O.mid || O.budget;
    if (done.has(L) || !c || (!base && !L.extra)) continue;
    const b = best(O);
    if (b && norm(b.add) === k) {
      done.add(L);
      continue;
    } // the row's best card is already its pick
    if (used.has(k)) continue; // suggested on another row: this row tries its next find
    if (b && y.v < b.dScore + SCORE_MIN) {
      done.add(L);
      continue;
    } // nothing left beats the row's own best
    const np = Object.assign({}, base || {cut: L.cut, q: y.x.q || 1, smart: true, cutWhy: ['One of the weakest cards in this deck by the deck score']}, {
      add: c.n,
      dScore: y.v,
      held: false,
      own: !!(own && own.has(c._n)),
      gc: !!c.gc,
      pc: false,
      gcPick: false,
      why: ['Highest score of every card checked'],
      alt: base ? base.add : undefined
    });
    const left = T3.map(t => O[t])
        .filter(p => p && p.dScore != null)
        .concat([np])
        .sort((a, b) => b.dScore - a.dScore),
      out = {apex: left.shift()};
    for (const t of ['budget', 'mid']) {
      const i = left.findIndex(p => fits(p, t));
      if (i >= 0) out[t] = left.splice(i, 1)[0];
    } // Budget first: a cheap card fills the cheapest tier it fits
    const kept = new Set(Object.values(out).map(p => norm(p.add)));
    T3.forEach(t => {
      if (O[t] && !kept.has(norm(O[t].add))) {
        if (O[t].held) freed.push(norm(O[t].add));
        used.delete(norm(O[t].add));
      }
    });
    T3.forEach(t => {
      if (out[t]) O[t] = Object.assign({}, out[t], {t});
      else delete O[t];
    });
    used.add(k);
    done.add(L);
    // owner, 19 Oct: the strongest card is the Apex card; the card it pushed out stays on the row as an alternative (a Popular pick
    // when this commander's players run it), and an on-theme card nearly as strong is offered as the On theme alternative
    const A = L.alts || (L.alts = {apex: [], mid: [], budget: []}),
      ax = A.apex || (A.apex = []),
      has = n => T3.some(t => O[t] && norm(O[t].add) === norm(n)) || ax.some(a => norm(a.n) === norm(n));
    const gone = left; // the picks that lost their tier (the old best among them)
    gone.forEach(p => {
      if (has(p.add)) return;
      const c2 = find(p.add),
        ic = inc(p.add);
      ax.unshift({
        n: p.add,
        p: c2 && c2.p,
        dScore: p.dScore,
        inc: ic,
        most: ic >= 0.1,
        theme: themeOf(c2, TC),
        vs: np.add,
        vsScore: np.dScore
      });
      used.add(norm(p.add));
    });
    if (TC && !themeOf(c, TC)) {
      const lim = y.v - Math.max(Math.abs(y.v) * RANK_THEME, 0.1),
        th = (L.finds || [])
          .concat(gone.map(p => ({n: p.add, dScore: p.dScore})))
          .filter(f => f.dScore >= lim && !has(f.n) && !used.has(norm(f.n)) && themeOf(find(f.n), TC))
          .sort((a, b2) => b2.dScore - a.dScore)[0];
      const prior = th ? null : ax.find(a => a.theme && a.dScore >= lim);
      if (th) {
        ax.unshift({
          n: th.n,
          p: (find(th.n) || {}).p,
          dScore: th.dScore,
          inc: inc(th.n),
          theme: themeOf(find(th.n), TC),
          onTheme: true,
          vs: np.add,
          vsScore: np.dScore
        });
        used.add(norm(th.n));
      } else if (prior) prior.onTheme = true;
    }
    if (ax.length > 4) ax.length = 4;
  }
  // a row's Highest score never names a card suggested on another row
  Q.rows.forEach(x => {
    const L = x.L,
      mine = new Set(
        Object.values(L.opts)
          .filter(Boolean)
          .map(p => norm(p.add))
      );
    if (L.top && used.has(norm(L.top.n)) && !mine.has(norm(L.top.n))) L.top = null;
  });
  // the new rows for weak cards that found a card raising the score join the list, biggest gain first
  if (Q.R)
    Q.rows
      .filter(x => x.L.extra && x.L.opts.apex && !Q.R.paths.includes(x.L))
      .sort((a, b) => b.L.opts.apex.dScore - a.L.opts.apex.dScore)
      .forEach(x => {
        x.L.gain = x.L.opts.apex.dScore;
        Q.R.paths.push(x.L);
      });
  if (Q.R && Q.R.count) recount(Q.R);
  return freed;
} // the held picks that lost their place: their holds are released
const RANK_THEME = 0.1;
// Stick to the theme (owner, 24 Oct; a deck setting, d.stick, off unless the player turns it on): each row's picks come from
// the cards on theme for the deck that still raise its score: the commander's franchise and creature types (themeOf) or one of
// the deck's plans. Of those, the best is the Apex card, then the best of the rest under $12 and under $3; each card once
// across the list. A row with no on-theme card that raises the score keeps its usual picks.
function stickTheme(d, R) {
  if (!d || !d.stick || !R || !R.paths || !R.paths.length) return;
  const TC = themeCtx(d),
    ctx = ctxOf(d),
    aims = (d.aims || []).filter(a => a !== 'tribal'),
    onTheme = c =>
      !!c &&
      (!!themeOf(c, TC) ||
        aims.some(a => matchAim(c, a, ctx.tribe) >= 0.7) ||
        (!!ctx.tribe && matchAim(c, 'tribal', ctx.tribe) >= 0.7)),
    why = c => themeOf(c, TC) || aimLabel(aims.find(a => matchAim(c, a, ctx.tribe) >= 0.7) || 'tribal') + ' (on theme)',
    own = upgradePaths.own,
    T3 = ['apex', 'mid', 'budget'];
  const taken = new Set();
  R.paths.forEach(L => T3.forEach(t => L.opts[t] && taken.add(norm(L.opts[t].add))));
  const rows = R.paths
    .map(L => {
      const seen = new Map();
      const add = (n, v) => {
        const c = n && find(n);
        if (!c || v == null || v < SCORE_MIN || hasCard(d, c.n) || !onTheme(c)) return;
        const k = norm(c.n);
        if (!seen.has(k) || seen.get(k).v < v) seen.set(k, {c, v});
      };
      T3.forEach(t => L.opts[t] && add(L.opts[t].add, L.opts[t].dScore));
      (L.finds || []).forEach(f => add(f.n, f.dScore));
      T3.forEach(t => ((L.alts || {})[t] || []).forEach(a => add(a.n, a.dScore)));
      if (L.top) add(L.top.n, L.top.dScore);
      return {L, list: [...seen.values()].sort((a, b) => b.v - a.v)};
    })
    .filter(x => x.list.length)
    .sort((a, b) => b.list[0].v - a.list[0].v);
  for (const {L, list} of rows) {
    const O = L.opts,
      base = O.apex || O.mid || O.budget;
    if (!base) continue;
    const mine = new Set(T3.map(t => O[t] && norm(O[t].add)).filter(Boolean)),
      free = list.filter(x => !taken.has(x.c._n) || mine.has(x.c._n));
    if (!free.length) continue;
    T3.forEach(t => O[t] && taken.delete(norm(O[t].add)));
    const out = {};
    for (const t of T3) {
      const i = free.findIndex(x => t === 'apex' || (own && own.has(x.c._n)) || underCap(x.c.p, t));
      if (i >= 0) out[t] = free.splice(i, 1)[0];
    }
    T3.forEach(t => {
      const x = out[t];
      if (!x) {
        delete O[t];
        return;
      }
      const old = T3.map(k => O[k]).find(p => p && norm(p.add) === x.c._n);
      O[t] = Object.assign({}, old || base, {
        t,
        add: x.c.n,
        dScore: x.v,
        held: false,
        pc: false,
        own: !!(own && own.has(x.c._n)),
        gc: !!x.c.gc,
        why: old ? old.why : [why(x.c)],
        alt: base.add
      });
      taken.add(x.c._n);
    });
    L.stuck = true;
  }
  // a row added for a weak card (poolRows) stays only with an on-theme pick
  R.paths = R.paths.filter(L => !L.extra || (L.opts.apex && onTheme(find(L.opts.apex.add))));
}
// A row's cards strongest first (owner, 24 Oct: a Budget card never scores above Mid, nor Mid above Apex). A card's score is its
// gain in the deck score (dScore); before the score check has run, the engine's order stands (Apex, Mid, Budget).
const tierFits = (p, t) => t === 'apex' || p.own || underCap((find(p.add) || {}).p, t);
function tierRank(ps) {
  const known = ps.every(p => p.dScore != null);
  return known ? ps.slice().sort((a, b) => b.dScore - a.dScore) : ps.slice();
}
// What "Apply all" uses for a tier: the strongest card on the row that fits its price (a cheap Apex card is also the Mid pick).
// The Apex slot always holds the best card for the slot (owner, 24 Oct): the engine's Apex pick, or, when it has none or a
// cheaper pick raises the deck score clearly more, that cheaper card. A Players' choice Apex pick (listed on the players'
// word, its score about even) keeps its place. The card that moves up leaves its cheaper column; no cheaper card is forced in.
function apexOf(O, ok) {
  const a = O.apex && ok(O.apex) ? O.apex : null,
    rest = tierRank([O.mid, O.budget].filter(p => p && ok(p))),
    b = rest[0];
  if (!a) return b || null;
  if (b && !a.pc && a.dScore != null && b.dScore != null && b.dScore > a.dScore + SCORE_MIN) return b;
  return a;
}
// What "Apply all" uses for a tier: Apex the slot's best card; Mid and Budget the strongest card on the row at their price
// (a cheap Apex card is also their pick).
function tierPick(L, t) {
  const O = L.opts;
  if (t === 'apex') return apexOf(O, () => true);
  return tierRank([O.apex, O.mid, O.budget].filter(Boolean)).find(p => tierFits(p, t)) || null;
}
// The three columns shown on a row: Apex the slot's best card (apexOf), Mid the strongest of the rest under $12, Budget the
// strongest of the rest under $3, each card once. skip(p) leaves out a card (one already in the deck).
function tierCols(O, skip) {
  const seen = new Set(),
    ok = p => p && !(skip && skip(p)) && !seen.has(norm(p.add)) && seen.add(norm(p.add)),
    use = p => p && !(skip && skip(p)),
    out = {},
    ap = apexOf(O, use);
  if (ap) {
    out.apex = ap;
    seen.add(norm(ap.add));
  }
  const ps = tierRank([O.apex, O.mid, O.budget].filter(ok));
  for (const t of ['apex', 'mid', 'budget']) {
    if (out[t]) continue;
    const i = ps.findIndex(p => tierFits(p, t));
    if (i >= 0) out[t] = ps.splice(i, 1)[0];
  }
  return out;
}
// Tuning carried over from Build 72/73 unchanged (wi: play rate, ws: synergy, wf: fit with the build, wd/wk: jobs lost/gained,
// T: job count treated as enough, m: smallest gain worth offering, fn: same-theme/type bonus). Thin = little play data.
const UP = {
  v2: 1, // engine v2: jobs from the rules reading (engine/rules.js, engine/functions.js); see tags()
  v2r: ['removal', 'wipe+', 'draw+'], // removal from the reading, wipes and card draw added from it: no benchmark number below 0.9.3 (ROADMAP)
  syn: 0, // engine v2: weight of synergy with the commander (fnSynergy)
  optW: 0, // engine v2: weight of what the commander's bracket 4 decks run more than its decks overall (EDHREC optimized page)
  optN: 100,
  optMin: 30,
  newTh: [
    'flying',
    'defenders',
    'goad',
    'untap',
    'theft',
    'evasion',
    'stax',
    'voting',
    'clones',
    'cheat',
    'topdeck',
    'combo',
    'infect',
    'minus',
    'mill',
    'pillowfort',
    'dice',
    'legends',
    'xspells',
    'weenies',
    'bigmana'
  ], // engine v2: plans added 20 Oct (all offered; defenders is never picked on its own)
  xPlan: 0.25, // engine v2: weight of fitting another plan this commander's players build (xPlansOf); owner took the trade-off 21 Oct
  v2sim: 1, // on from 0.9.11 (benchmark identical; owner: "Do all 5"). engine v2: practice games read mana and creatures from the rules reading, with combat (simReading)
  polP: 0,
  polG: 0.3,
  midOpen: 0,
  budOpen: 0,
  tsMid: 0,
  pwMid: 0,
  fbW: 4,
  cbec: 1,
  ctok: 1,
  ttok: 1,
  altar: 1,
  rld: 2,
  costR: 1,
  plc: 0.25,
  plcS: -0.1,
  plcG: 0.1,
  plcD: 100,
  conf: 0,
  confT: 0,
  polish: 4,
  polishK: 10,
  polishMin: 0.1,
  gcT: 1,
  gc3: 0,
  nmh: 1,
  thA: 1,
  thP: 0.3,
  thT: 0.3,
  thS: 1.5,
  reF: 1,
  rcap: 2,
  rs: 1,
  rf: 0.2,
  rfn: 6,
  rc: 0.05,
  ra: [0.399, 0.604],
  cand: 0.1,
  candL: 6,
  candMin: 0.3,
  apexMax: 0,
  planMax: 1,
  msrc: 1,
  ts: 6,
  tsk: 0.1,
  tl: 1,
  tr: 6,
  lf: 1,
  spare: 1,
  spareN: 5,
  rank: 1,
  rankPick: 0,
  kw: 1,
  unc: 0.25,
  uncK: '',
  uncTail: 1,
  altCut: 2,
  pool2: 1,
  poolN: 250,
  poolX: 40, // the strongest cards whatever their job, measured on every row (poolScout); 0: off
  poolXs: 300, // scouted: the most played ...
  poolXb: 100, // ... and the best by card value
  poolRows: 10, // rows for the deck's weakest spells that have none
  planCore: 2, // a reanimator deck's best reanimation engines always in a generated deck (buildPlanG)
  staples: 1, // Sol Ring and Arcane Signet in every generated Commander deck (buildPlanG, STAPLES)
  aimText: 1, // a plan's core pieces fit its EDHREC theme by their text (matchAim, AIM_TEXT)
  bs: 1,
  bsF: 0.5,
  bsP: 9,
  starve: 0.08,
  lfix: 1,
  sjx: 1,
  tierPolish: 1, // generated Mid / Budget decks: the polish rounds after they are made from the Apex build (UP.polish rounds)
  polishSlot: 0, // generated Mid / Budget decks: polish only swaps a stand-in for another card serving the same Apex slot
  looseAll: 0, // tests only (generator buildPlan): every cheaper stand-in from the loose pass
  weakD: 0.2,
  weakA: 1,
  trim: 1,
  trimPa: 0.15,
  trimCi: 10,
  unpop: 0.1,
  unpopX: 3,
  unpopG: 0.1,
  unpopS: 0.2,
  unpopR: 1.5,
  rankN: 18,
  rankB: 4,
  rankP: 30,
  rankMin: 0.15,
  gv: 0,
  gcN: 6,
  gcB: 10,
  gcK: 3,
  gcS: 1,
  gcF: 1,
  tf: 6,
  tfDrop: 0.25,
  tfEval: 2,
  dom: 0.4,
  pw: 1.5,
  pt: 1.5,
  theme: 1,
  jmu: 0,
  jn: 10,
  jk: 8,
  weak: 1,
  fx: 1,
  rdef: 0,
  mb: 1,
  fin: 2,
  cb: 0.5,
  ck: 3,
  roleT: 1,
  over: 2,
  lt: 0.5,
  wa: 0,
  wo: 0,
  pbDyn: 0,
  pk: 7.5,
  lslack: 1,
  lfast: 1,
  inflate: 0,
  pb: 0.25,
  pc: 3,
  preMin: 0.4,
  wi: 15,
  ws: 4,
  wf: 0.1,
  wd: 1,
  wk: 0.75,
  T: 8,
  m: 2,
  fn: 0.3,
  pool: 300,
  extra: 120,
  prior: 0.15,
  fitMin: 5,
  wfThin: 1,
  mThin: 5,
  fitMinThin: 6,
  extraThin: 400,
  curve: 0.25
};
// opt.cap: the "best deck with every new card under $cap" package (per card; a card you own counts as free). The same engine,
// with dearer additions left out from the start instead of being replaced afterwards; held picks belong to the tier rows, not here.
function upgradePaths(d, opt) {
  opt = opt || {};
  const ctx = ctxOf(d),
    K = UP,
    A0 = analyze(d),
    std = d.format === 'standard';
  const thin = !ctx.edh || ctx.edh.map.size < 60,
    wf = thin ? K.wfThin : K.wf,
    mMin = thin ? K.mThin : K.m;
  const E = c => (ctx.edh ? edhOf(ctx.edh.map, c) : undefined),
    isNew = c => !E(c) && !c.r;
  const dd = Object.assign({}, d, {tier: 'apex'});
  const fitCache = new Map(),
    fit = c => {
      if (fitCache.has(c._k)) return fitCache.get(c._k);
      const a = W_INC,
        b = W_SYN,
        p = POP_K;
      W_INC = 0;
      W_SYN = 0;
      if (!thin) POP_K = 0;
      let s;
      try {
        s = baseScore(c, dd, ctx).s;
      } finally {
        W_INC = a;
        W_SYN = b;
        POP_K = p;
      }
      if (isNew(c)) s += EDH_MISS;
      fitCache.set(c._k, s);
      return s;
    };
  // Precon evidence: when the deck still holds most of the precon its commander comes from, what that precon's owners do
  // counts too. A card they add often gains (its rate among their decks is blended with the commander-wide rate); a card on
  // their most-cut list loses, most for the top of the list.
  const pre = ctx.edh && ctx.edh.pre && ctx.edh.pre.list && ctx.edh.pre.list.length ? ctx.edh.pre : null;
  const preNL = pre
    ? [
        ...new Set(
          pre.list
            .map(n => find(n))
            .filter(c => c && !tags(c).land && !isBasic(c.n))
            .map(c => c._k)
        )
      ]
    : [];
  const have = new Set(d.cards.map(x => keyOf(x.n))),
    preShare = preNL.length ? preNL.filter(k => have.has(k)).length / preNL.length : 0;
  const preOn = !!pre && preShare >= K.preMin,
    preCut = new Map(),
    preAdd = new Map();
  const preLCut = new Map();
  if (preOn) {
    pre.cut.forEach((n, i) => {
      const k = keyOf(n);
      if (!preCut.has(k)) preCut.set(k, i);
    });
    (pre.lcut || []).forEach((n, i) => {
      const k = keyOf(n);
      if (!preLCut.has(k)) preLCut.set(k, i);
    });
    pre.add.forEach(r => preAdd.set(keyOf(r[0]), {inc: r[1], syn: r[2]}));
  }
  // Unchanged precons inflate the play rate of every precon card: a precon card is "in" every untouched copy. The least-played
  // precon cards show roughly how many copies are untouched (u). Taking those out puts precon cards and outside cards on the same
  // footing: the share of players who changed the deck that kept a card, against the share that added one.
  const preAll = preOn ? new Set(pre.list.map(n => keyOf(n))) : new Set();
  const preU = (() => {
    if (!preOn || !K.inflate) return 0;
    const v = [...preAll]
      .map(k => LIB.find(c => c._k === k))
      .filter(Boolean)
      .map(c => E(c))
      .filter(Boolean)
      .map(e => e.inc)
      .sort((a, b) => a - b);
    return v.length >= 20 ? Math.min(0.6, v[Math.floor(v.length * 0.05)]) : 0;
  })();
  // When the precon's owners are only part of the commander's EDHREC population (Eshki: 1,370 of 14,841 decks), the
  // commander-wide numbers describe other builds with other plans. Then a precon card its own owners do not list among their
  // most-cut cards is protected, in proportion to how little of the population the precon is — the deck keeps its plan.
  const preOther = preOn && ctx.edh && ctx.edh.decks && pre.decks ? Math.max(0, 1 - Math.min(1, pre.decks / ctx.edh.decks)) : 0;
  const PA = c => (preOn ? preAdd.get(c._k) : null),
    PCL = c => (preOn ? preLCut.get(c._k) : undefined),
    PC = c => (preOn ? (tags(c).land ? preLCut.get(c._k) : preCut.get(c._k)) : undefined);
  // The player's ranked mechanics steer the build: a card that does the first mechanic counts most, the next less, and so
  // on, so reordering them changes the picks. A spell that does none of them and no core job needs a stronger case.
  const AW = [1, 0.75, 0.55, 0.4, 0.3],
    aims = (d.aims || []).slice(0, 5);
  const aimV = c => {
    if (tags(c).land || !aims.length) return 0;
    let v = 0;
    aims.forEach((a, i) => {
      const m = matchAim(c, a, ctx.tribe);
      if (m >= 0.7) v += AW[i] * m;
    });
    return v ? K.wa * v : jobsOf(c.n).some(j => JOBS.includes(j)) ? 0 : -K.wo;
  };
  // Ranked commander themes: the play rate is blended with the rate among decks built for each chosen theme (first counts most).
  const TA = aims
      .map((a, i) =>
        isEdhAim(a) && ctx.edh && ctx.edh.tmap && ctx.edh.tmap[a.slice(4)] ? {m: ctx.edh.tmap[a.slice(4)], w: AW[i], a} : null
      )
      .filter(Boolean),
    TW = TA.reduce((s, t) => s + t.w, 0);
  const themeInc = c =>
    TA.reduce((s, t) => {
      const x = edhOf(t.m, c);
      return s + t.w * (x ? x.inc : 0);
    }, 0) / (TW || 1);
  // Game Changers (Wizards' list of the cards that most change games) are what lifts a deck into the top brackets; at Apex
  // they are pushed up the list. Budget and Mid lists are unchanged.
  const gcV0 = (d.tier === 'apex' || !d.tier) && d.format === 'commander',
    gcV = gcV0 ? UP.gv || 0 : 0;
  const val = c => {
    const e = E(c),
      pa = PA(c),
      ci = PC(c);
    let inc = e ? e.inc : isNew(c) ? K.prior : 0;
    // Themes judge the precon's own cards only as far as the theme's players are the precon's players (Eshki: barely at all).
    if (TA.length && !tags(c).land) {
      const lt = preAll.has(c._k) ? K.lt * (1 - preOther) : K.lt;
      inc = (1 - lt) * inc + lt * themeInc(c);
    }
    if (preU && e) inc = preAll.has(c._k) ? Math.max(0, inc - preU) / (1 - preU) : inc / (1 - preU);
    const pb = K.pbDyn ? Math.max(K.pb, preOther) : K.pb;
    if (pa) inc = e ? (1 - pb) * inc + pb * pa.inc : pa.inc;
    return (
      K.wi * inc +
      K.ws * (e ? e.syn : 0) +
      wf * fit(c) +
      aimV(c) +
      (c.gc ? gcV : 0) -
      (ci != null
        ? K.pc * (1 - ci / Math.max(1, (tags(c).land ? preLCut : preCut).size))
        : preOther && preAll.has(c._k)
          ? -K.pk * preOther
          : 0)
    );
  };
  const own = upgradePaths.own && upgradePaths.own.size ? upgradePaths.own : null,
    owned = c => !!own && own.has(c._n);
  const capOk = c => !opt.cap || owned(c) || (c.p != null && c.p < opt.cap);
  const installed = new Set(
    d.cards
      .map(x => keyOf(x.n))
      .concat([keyOf(d.commander || '')])
      .concat(d.partner ? [keyOf(d.partner)] : [])
  );
  const dis = new Set((d.dismissed || []).map(keyOf));
  const legalHere = c => legalIn(c, d.format) && c.ci.every(z => ctx.ident.includes(z));
  const usable = c =>
    c && !installed.has(c._k) && !dis.has(c._k) && !tags(c).land && !isBasic(c.n) && legalHere(c) && mustOk(c, d) && capOk(c);
  const out = {
    paths: [],
    fixes: [],
    drops: [],
    fills: Math.max(0, A0.T.size - A0.size),
    count: {free: 0, budget: 0, mid: 0, apex: 0},
    cost: {free: 0, budget: 0, mid: 0, apex: 0},
    shift: {free: {}, budget: {}, mid: {}, apex: {}},
    unlock: [],
    conflicts: [],
    smart: true,
    thin,
    A: A0
  };
  const taken = new Set(); // every card shown anywhere in this list (Apex, alternatives, fixes)

  // --- 1. fixes ---
  const fixCut = new Set();
  const repl = (x, want) => {
    let best = null,
      bv = -1e9;
    for (const c of LIB) {
      if (!usable(c) || taken.has(c._k)) continue;
      const v = val(c) + (want && jobsOf(c.n).includes(want) ? 2 : 0);
      if (v > bv) {
        bv = v;
        best = c;
      }
    }
    return best;
  };
  const basic = (splitBasics(1, ctx)[0] || {}).n;
  d.cards.forEach(e => {
    const c = find(e.n);
    if (!c || e.l) return;
    let why = '';
    if (!c.ci.every(z => ctx.ident.includes(z)) && (ctx.ident.length || ctx.cmd)) why = 'Outside your colors';
    else if (!legalIn(c, d.format)) why = 'Not legal in ' + d.format;
    if (!why || isBasic(c.n)) return;
    fixCut.add(c._k);
    if (tags(c).land) {
      if (basic)
        out.fixes.push({cut: e.n, add: basic, q: e.q, land: true, fix: true, why: ['Basic land in its place'], cutWhy: [why]});
      return;
    }
    const a = repl(c, mainJob(e.n));
    if (!a) {
      out.drops.push({n: e.n, q: e.q, s: -80, why: [why]});
      return;
    }
    taken.add(a._k);
    out.fixes.push({
      cut: e.n,
      add: a.n,
      q: e.q,
      fix: true,
      why: baseScore(a, dd, ctx).why.slice(0, 2),
      cutWhy: [why],
      gc: !!a.gc
    });
  });
  d.cards.forEach(e => {
    const c = find(e.n),
      lim = copyLimit(d, c);
    if (c && e.q > lim)
      out.drops.push({
        n: e.n,
        q: e.q - lim,
        s: -95,
        why: [d.format === 'commander' ? 'Commander allows one copy' : 'More than four copies']
      });
  });
  {
    let over = A0.size - A0.T.size - out.drops.reduce((s, x) => s + x.q, 0);
    if (over > 0)
      d.cards
        .map(e => ({e, c: find(e.n)}))
        .filter(x => x.c && !x.e.l && !tags(x.c).land && !fixCut.has(x.c._k))
        .map(x => ({n: x.e.n, q: x.e.q, v: val(x.c)}))
        .sort((a, b) => a.v - b.v)
        .forEach(x => {
          if (over > 0) {
            const q = Math.min(over, x.q);
            out.drops.push({n: x.n, q, s: -10, why: ['The deck has ' + A0.size + ' cards; it needs ' + A0.T.size]});
            over -= q;
            fixCut.add(keyOf(x.n));
          }
        });
  }

  // --- 2. values ---
  // Combos (Commander Spellbook): a card that is part of a complete winning combo in the deck is kept unless something much
  // better comes; a card that completes one gets a small push (players add these only a little more than their play rate
  // says) and says which combo it completes.
  const CB = (K.cb || K.ck) && COMBOS.list.length && d.format === 'commander' ? combosOf(d, ctx.ident) : null,
    inWin = new Set(),
    completes = new Map();
  if (CB) {
    CB.full.filter(x => x.win).forEach(x => x.keys.forEach(k => inWin.add(k)));
    CB.near.forEach(n => {
      const c = find(n.miss);
      if (!c) return;
      const o = completes.get(c._k);
      if (!o || (n.x.win && !o.win) || (n.x.win === o.win && n.x.decks > o.decks)) completes.set(c._k, n.x);
    });
  }
  const cbBonus = c => {
    const x = completes.get(c._k);
    return x && x.win ? K.cb : 0;
  };
  const mk = c => ({c, jobs: jobsOf(c.n), v: val(c) + cbBonus(c)});
  const seen = new Set(),
    C = [];
  [...(ctx.edh ? ctx.edh.map.entries() : [])]
    .map(([k, v]) => ({c: IDX.get(k), inc: v.inc}))
    .filter(x => usable(x.c) && !taken.has(x.c._k))
    .sort((a, b) => b.inc - a.inc)
    .slice(0, K.pool)
    .forEach(x => {
      if (seen.has(x.c._k)) return;
      seen.add(x.c._k);
      C.push(mk(x.c));
    });
  LIB.filter(c => !seen.has(c._k) && usable(c) && !taken.has(c._k))
    .map(c => ({c, f: fit(c)}))
    .filter(x => x.f >= (thin ? K.fitMinThin : K.fitMin))
    .sort((a, b) => b.f - a.f)
    .slice(0, thin ? K.extraThin : K.extra)
    .forEach(x => {
      seen.add(x.c._k);
      C.push(mk(x.c));
    });
  if (CB)
    completes.forEach((x, k) => {
      if (!x.win || seen.has(k)) return;
      const c = LIB.find(z => z._k === k);
      if (c && usable(c) && !taken.has(k)) {
        seen.add(k);
        C.push(mk(c));
      }
    });
  const cuts = d.cards
    .map(e => ({e, c: find(e.n)}))
    .filter(x => x.c && !tags(x.c).land && !x.e.l && !fixCut.has(x.c._k))
    .map(x => ({n: x.e.n, q: std ? x.e.q : 1, c: x.c, jobs: jobsOf(x.e.n), v: val(x.c) + (inWin.has(x.c._k) ? K.ck : 0)}));
  const cnt = {};
  d.cards.forEach(e => jobsOf(e.n).forEach(j => (cnt[j] = (cnt[j] || 0) + e.q)));
  const th = c => Object.keys(tags(c).th).filter(k => tags(c).th[k] === 1 && k !== 'aggro');
  const fn = (a, b) => 2 * th(a).filter(k => th(b).includes(k)).length + (mainType(a) === mainType(b) ? 1 : 0);
  // How much a swap improves the deck: value in minus value out, minus the hole it leaves in a job the deck is thin on, plus
  // the gap it fills, plus a little for staying on the same theme and card type.
  // Each job is measured against what the deck needs of it (about 10 ramp, 10 draw, 8 removal, 3 wipes; 8 for the rest).
  const tj = j => (A0.T && A0.T[j] != null && ['ramp', 'draw', 'removal', 'wipe'].includes(j) ? A0.T[j] : K.T);
  const delta = (cut, add, N) => {
    let x = add.v - cut.v;
    N = N || cnt;
    cut.jobs.forEach(j => {
      if (j !== 'cost' && !add.jobs.includes(j)) x -= K.wd * Math.max(0, (tj(j) - ((N[j] || 0) - 1)) / tj(j));
    });
    add.jobs.forEach(j => {
      if (j !== 'cost' && !cut.jobs.includes(j)) x += K.wk * Math.max(0, (tj(j) - (N[j] || 0)) / tj(j));
    });
    return x + K.fn * fn(add.c, cut.c);
  };
  // Some evidence the card belongs: played or synergistic with this commander, a strong fit with the build, or too new for data.
  const ev = a => {
    const e = E(a.c),
      pa = PA(a.c);
    return (
      (pa && pa.inc >= 0.1) || (e && (e.inc >= 0.1 || e.syn >= 0.1)) || fit(a.c) >= (thin ? K.fitMinThin : K.fitMin) || isNew(a.c)
    );
  };
  const aimsOf = c => {
    const s = new Set();
    (d.aims || []).forEach(a => {
      if (matchAim(c, a, ctx.tribe) >= 0.7) s.add(a === 'tribal' ? 'tribal:' + ctx.tribe : a);
    });
    ctx.cmdThemes.forEach(a => {
      if (matchAim(c, a, ctx.cmdTribe) >= 1) s.add(a === 'tribal' ? 'tribal:' + ctx.cmdTribe : a);
    });
    return s;
  };
  const pct = x => Math.round(x * 100),
    cmdShort = ctx.cmd ? ctx.cmd.n.split(',')[0] : '';
  const preName = pre ? pre.name : '',
    preDecks = pre && pre.decks ? pre.decks.toLocaleString('en-US') + ' ' : '';
  const comboWhy = c => {
    const x = completes.get(c._k);
    if (!x || !x.win) return [];
    const others = x.names.filter(n => n !== c.n),
      ok = others.map(keyOf),
      src = ' (Commander Spellbook, ' + x.decks.toLocaleString('en-US') + ' decks)';
    // The deck may already have this combo with another card in this card's place: then it is a backup piece.
    const f = CB.full.find(y => y.win && ok.every(k => y.keys.includes(k)));
    if (f) {
      const inPlace = f.names.filter(n => !ok.includes(keyOf(n)));
      return [
        'Backup for your ' +
          f.names.join(' + ') +
          ' combo (' +
          x.what.toLowerCase() +
          '): it can take the place of ' +
          inPlace.join(' and ') +
          src
      ];
    }
    return ['Completes a combo with ' + others.join(' and ') + ': ' + x.what.toLowerCase() + src];
  };
  const whyAdd = (a, cu) => {
    const pa = PA(a.c),
      why = comboWhy(a.c)
        .concat(pa ? ['Added in ' + pct(pa.inc) + '% of ' + preDecks + 'decks built from ' + preName] : [])
        .concat(isNew(a.c) ? ['New card · not enough play data yet'] : [])
        .concat(baseScore(a.c, dd, ctx).why);
    const gap = a.jobs.find(j => !cu.jobs.includes(j) && (cnt[j] || 0) < K.T * 0.75);
    if (gap && why.length < 2 && JOB_LABEL[gap]) why.push('Adds ' + JOB_LABEL[gap]);
    return why.slice(0, 2);
  };
  // Why the card leaving is the one to go: its own evidence, and what happens to the job it does.
  const whyCut = (cu, a) => {
    const e = E(cu.c),
      w = [],
      ci = PC(cu.c);
    if (ci != null)
      w.push(
        (tags(cu.c).land ? 'One of the lands most often cut from ' : 'One of the cards most often cut from ') +
          preName +
          ' (#' +
          (ci + 1) +
          ' of ' +
          (tags(cu.c).land ? preLCut : preCut).size +
          ')'
      );
    w.push(
      e
        ? 'In ' + pct(e.inc) + '% of ' + cmdShort + ' decks'
        : ctx.edh
          ? 'Rarely run with ' + cmdShort
          : 'Weakest fit for the build'
    );
    if (!aimsOf(cu.c).size) w.push('Does little for the deck’s plan');
    const lost = cu.jobs.filter(j => !a.jobs.includes(j)),
      kept = cu.jobs.filter(j => a.jobs.includes(j));
    if (kept.length) w.push('Its ' + (JOB_LABEL[kept[0]] || kept[0]) + ' role is kept');
    else if (lost.length)
      w.push('Gives up ' + (JOB_LABEL[lost[0]] || lost[0]) + '; the deck keeps ' + Math.max(0, (cnt[lost[0]] || 0) - 1));
    return w.slice(0, 2);
  };
  const pair = (cu, a, v, t) => ({
    cut: cu.n,
    add: a.c.n,
    q: cu.q,
    t,
    gain: +v.toFixed(2),
    aq: +a.v.toFixed(2),
    cv: +cu.v.toFixed(2),
    why: whyAdd(a, cu),
    cutWhy: whyCut(cu, a),
    gc: !!a.c.gc,
    gcOut: !!cu.c.gc,
    own: owned(a.c),
    smart: true
  });

  // --- held picks: kept exactly, never displaced by a higher score. A hold whose card can no longer go in is reported. ---
  const held = new Map(); // cut name -> {tier -> pair}
  for (const k in opt.cap ? {} : d.recP || {}) {
    const r = d.recP[k],
      p = r && r.pair;
    if (!p || !TIERS[r.t]) continue;
    const c = find(p.add),
      cutE = entryOf(d, p.cut);
    if (!cutE || (c && installed.has(c._k)) || (c && dis.has(c._k))) continue; // the player swapped it in, or ruled it out: the hold is done
    if (!c || !legalHere(c)) {
      out.conflicts.push({
        k,
        cut: p.cut,
        add: p.add,
        t: r.t,
        why: !c
          ? 'Card not found in the card data'
          : !legalIn(c, d.format)
            ? 'No longer legal in ' + d.format
            : 'Outside this deck’s colors'
      });
      continue;
    }
    if (!held.has(cutE.n)) held.set(cutE.n, {});
    held.get(cutE.n)[r.t] = {p, c};
    taken.add(c._k);
  }

  // --- 3. Apex: strongest fitting card per slot ---
  const T = A0.T,
    floor = {ramp: T.ramp, draw: T.draw, removal: T.removal, wipe: T.wipe};
  const flo = j => (floor[j] != null ? Math.min(floor[j], cnt[j] || 0) : Math.min(cnt[j] || 0, 2)); // a job may not fall below what the deck needs (or has)
  const rows = new Map(),
    cutIdx = new Map(cuts.map((cu, i) => [cu.n, i]));
  const apexPick = new Map(); // cut index -> {a, v, held}
  for (const [cutN, H] of held) {
    const i = cutIdx.get(cutN);
    if (i == null || !H.apex) continue;
    const a = mk(H.apex.c);
    apexPick.set(i, {a, v: delta(cuts[i], a), held: true});
  }
  {
    const L = C.filter(x => !taken.has(x.c._k)),
      M = [];
    cuts.forEach((cu, i) => {
      if (apexPick.has(i)) return;
      L.forEach((a, k) => {
        const v = delta(cu, a);
        if (v >= mMin && ev(a)) M.push([v, i, k]);
      });
    });
    M.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
    const ua = new Set();
    // The deck's skeleton is kept while pairing, not after: a swap that would take ramp, draw, removal or wipes below what the
    // deck needs is skipped, so a weak removal spell is paired with a better removal spell instead of losing its upgrade.
    const run = Object.assign({}, cnt);
    apexPick.forEach((x, i) => {
      cuts[i].jobs.forEach(j => (run[j] = (run[j] || 0) - 1));
      x.a.jobs.forEach(j => (run[j] = (run[j] || 0) + 1));
    });
    for (const [v, i, k] of M) {
      if (apexPick.has(i) || ua.has(k)) continue;
      const a = L[k],
        lost = cuts[i].jobs.filter(j => !a.jobs.includes(j));
      if (lost.some(j => JOBS.includes(j) && (run[j] || 0) - 1 < flo(j))) continue; // card types (equipment, auras, vehicles) are not floors
      lost.forEach(j => run[j]--);
      a.jobs.forEach(j => {
        if (!cuts[i].jobs.includes(j)) run[j] = (run[j] || 0) + 1;
      });
      ua.add(k);
      apexPick.set(i, {a, v, held: false});
    }
  }
  // --- 4. package check on the Apex package (held picks are never removed) ---
  const nonland = d.cards.map(e => find(e.n)).filter(c => c && !tags(c).land),
    avg0 = nonland.reduce((s, c) => s + (c.cmc || 0), 0) / Math.max(1, nonland.length);
  let removed = 0,
    after = Object.assign({}, cnt),
    avg = avg0;
  for (let pass = 0; pass < 8; pass++) {
    const act = [...apexPick.entries()];
    after = Object.assign({}, cnt);
    let sum = nonland.reduce((s, c) => s + (c.cmc || 0), 0);
    act.forEach(([i, x]) => {
      cuts[i].jobs.forEach(j => (after[j] = (after[j] || 0) - 1));
      x.a.jobs.forEach(j => (after[j] = (after[j] || 0) + 1));
      sum += (x.a.c.cmc || 0) - (cuts[i].c.cmc || 0);
    });
    avg = sum / Math.max(1, nonland.length);
    const mine = act.filter(([, x]) => !x.held);
    let drop = null;
    for (const j of JOBS) {
      const fl = flo(j);
      if ((after[j] || 0) < fl) {
        const z = mine.filter(([i, x]) => cuts[i].jobs.includes(j) && !x.a.jobs.includes(j)).sort((a, b) => a[1].v - b[1].v)[0];
        if (z) {
          drop = z;
          break;
        }
      }
    }
    if (!drop && avg > avg0 + K.curve)
      drop =
        mine
          .map(z => ({z, up: (z[1].a.c.cmc || 0) - (cuts[z[0]].c.cmc || 0)}))
          .filter(y => y.up > 0)
          .sort((a, b) => b.up / Math.max(0.5, b.z[1].v) - a.up / Math.max(0.5, a.z[1].v))
          .map(y => y.z)[0] || null;
    if (!drop) {
      let worst = null,
        wv = 1e9;
      mine.forEach(z => {
        const N = Object.assign({}, after);
        cuts[z[0]].jobs.forEach(j => (N[j] = (N[j] || 0) + 1));
        z[1].a.jobs.forEach(j => (N[j] = (N[j] || 0) - 1));
        const v = delta(cuts[z[0]], z[1].a, N);
        if (v < mMin * 0.75 && v < wv) {
          wv = v;
          worst = z;
        }
      });
      drop = worst;
    }
    if (!drop) break;
    apexPick.delete(drop[0]);
    removed++;
  }
  // --- 4b. joint refinement of the top picks: the strongest swaps are chosen together, not one by one. A pick's addition or
  // its cut may be exchanged for another candidate when the swaps' value plus the whole-deck evaluator (synergy, balance,
  // quality, win routes; the mana practice games are the deck's own and are not re-run) rises. Held picks never move.
  if (K.jmu && d.format === 'commander' && apexPick.size >= 3) {
    const S0 = simulate(d, 150, 7),
      top = () =>
        [...apexPick.entries()]
          .filter(([, x]) => !x.held)
          .sort((a, b) => b[1].v - a[1].v)
          .slice(0, K.jn);
    const evalOf = P => {
      const u = JSON.parse(JSON.stringify(d));
      P.forEach(([i, x]) => {
        cutCard(u, cuts[i].n, 1);
        addCard(u, x.a.c.n, 1);
      });
      try {
        return evaluateDeck(u, {sim: S0}).total;
      } catch (e) {
        return 0;
      }
    };
    const job = (cu, a) => {
      const N = Object.assign({}, after);
      return !cu.jobs.filter(j => !a.jobs.includes(j)).some(j => JOBS.includes(j) && (N[j] || 0) <= flo(j));
    };
    let P = top(),
      cur = P.reduce((t, [, x]) => t + x.v, 0) + K.jmu * evalOf(P);
    const usedA = () => new Set([...apexPick.values()].map(x => x.a.c._k));
    const altA = C.filter(x => !taken.has(x.c._k) && !usedA().has(x.c._k) && ev(x))
      .sort((a, b) => b.v - a.v)
      .slice(0, K.jk);
    const altC = cuts
      .map((cu, i) => i)
      .filter(i => !apexPick.has(i) && !held.has(cuts[i].n))
      .sort((a, b) => cuts[a].v - cuts[b].v)
      .slice(0, K.jk);
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (let q = 0; q < P.length; q++) {
        const [i, x] = P[q];
        for (const a of altA) {
          if (usedA().has(a.c._k)) continue;
          const v = delta(cuts[i], a);
          if (v < mMin || !job(cuts[i], a)) continue;
          const P2 = P.slice();
          P2[q] = [i, {a, v, held: false}];
          const o = P2.reduce((t, [, y]) => t + y.v, 0) + K.jmu * evalOf(P2);
          if (o > cur + 1e-6) {
            cur = o;
            P = P2;
            apexPick.set(i, {a, v, held: false});
            moved = true;
          }
        }
        const [i1, x1] = P[q];
        for (const j of altC) {
          if (apexPick.has(j)) continue;
          const v = delta(cuts[j], x1.a);
          if (v < mMin || !job(cuts[j], x1.a)) continue;
          const P2 = P.slice();
          P2[q] = [j, {a: x1.a, v, held: false}];
          const o = P2.reduce((t, [, y]) => t + y.v, 0) + K.jmu * evalOf(P2);
          if (o > cur + 1e-6) {
            cur = o;
            P = P2;
            apexPick.delete(i1);
            apexPick.set(j, {a: x1.a, v, held: false});
            moved = true;
            break;
          }
        }
      }
      if (!moved) break;
    }
  }
  // --- 4c. Game Changers at Apex: a few more Game Changer upgrades are offered after the ranked picks, each paired with the
  // card it best replaces (job floors kept). They need not beat the ranked picks on play rates; the score check still has to
  // show each one raises the deck score, or it is not offered.
  // Trimmed (owner's decision, Build 115): only the deck's remaining room under Bracket 3's three Game Changers, counting
  // those already in the deck and among the picks above; a deck at or past three gets none (a Game Changer can still win a
  // normal row on its own merits).
  if (gcV0 && UP.gcN) {
    const usedA = new Set([...apexPick.values()].map(x => x.a.c._k));
    let n = 0;
    const room = UP.gc3
      ? Math.min(UP.gcN, Math.max(0, 3 - (ctxOf(d).gcIn || 0) - [...apexPick.values()].filter(x => x.a.c.gc).length))
      : UP.gcN;
    const G = C.filter(x => x.c.gc && !taken.has(x.c._k) && !usedA.has(x.c._k) && ev(x)).sort((a, b) => b.v - a.v);
    for (const a of G) {
      if (n >= room) break;
      let best = null;
      cuts.forEach((cu, i) => {
        if (apexPick.has(i) || held.has(cu.n) || cu.c.gc) return;
        const lost = cu.jobs.filter(j => !a.jobs.includes(j));
        if (lost.some(j => JOBS.includes(j) && (after[j] || 0) - 1 < flo(j))) return;
        const v = delta(cu, a);
        if (v + UP.gcB >= mMin && (!best || v > best.v)) best = {i, v};
      });
      if (!best) continue;
      apexPick.set(best.i, {a, v: best.v, held: false, gcPick: true});
      usedA.add(a.c._k);
      cuts[best.i].jobs.forEach(j => (after[j] = (after[j] || 0) - 1));
      a.jobs.forEach(j => (after[j] = (after[j] || 0) + 1));
      n++;
    }
  }
  out.pre = pre
    ? {
        name: pre.name,
        decks: pre.decks,
        share: +preShare.toFixed(2),
        on: preOn,
        untouched: +preU.toFixed(3),
        otherBuilds: +preOther.toFixed(2)
      }
    : null;
  out.valOf = c => val(c); // the value this deck's upgrades are chosen by (card quality uses it too)
  out._dbg = {
    cuts: cuts.map(cu => ({n: cu.n, k: cu.c._k, v: +cu.v.toFixed(2), jobs: cu.jobs})),
    pool: C.map(x => ({k: x.c._k, v: +x.v.toFixed(2)})),
    cnt,
    floor
  }; // diagnostics for tests only
  out.pack = {
    apex: {
      removed,
      jobs: Object.fromEntries(['ramp', 'draw', 'removal', 'wipe'].map(j => [j, [cnt[j] || 0, after[j] || 0]])),
      avg: [+avg0.toFixed(2), +avg.toFixed(2)]
    }
  };
  apexPick.forEach(x => taken.add(x.a.c._k));

  // --- 5. Mid and Budget alternatives, strongest Apex slots first ---
  const order = [...apexPick.entries()].sort((a, b) => b[1].v - a[1].v);
  // Same job as the Apex card: its main job, or (for a card with no job, a threat or synergy piece) the same card type and at
  // least one shared part of the deck's plan. A shared theme or type alone is not enough for a card that does a job.
  const sameFn = (A, X) => {
    const j = mainJob(A.c.n);
    if (j) return X.jobs.includes(j);
    if (X.jobs.length || mainType(X.c) !== mainType(A.c)) return false;
    const s = aimsOf(A.c);
    return [...aimsOf(X.c)].some(x => s.has(x));
  };
  const buildRow = (cu, x, sameF, C) => {
    const A = x.a,
      ap = A.c.p,
      H = held.get(cu.n) || {},
      row = {cut: cu.n, opts: {}, none: {}, gain: 0};
    row.opts.apex = Object.assign(pair(cu, A, x.v, 'apex'), x.held ? {held: true} : {}, x.gcPick ? {gcPick: true} : {});
    row.gain = x.v;
    if (x.gcPick) row.gcPick = true;
    const fits = X => X.c._k !== A.c._k && X.c.p != null && ap != null && X.c.p < ap && sameF(A, X);
    const pool = C.filter(X => !taken.has(X.c._k) && fits(X))
      .map(X => ({X, v: delta(cu, X)}))
      .filter(y => y.v >= mMin && ev(y.X))
      .sort((a, b) => b.v - a.v || a.X.c.p - b.X.c.p);
    // Same-job cheaper cards that are already suggested elsewhere in this deck (each card is suggested once), for an honest reason.
    const elsewhere = C.filter(X => taken.has(X.c._k) && fits(X))
      .map(X => ({X, v: delta(cu, X)}))
      .filter(y => y.v >= mMin && ev(y.X));
    for (const t of ['budget', 'mid']) {
      if (H[t]) {
        const a = mk(H[t].c);
        row.opts[t] = Object.assign(pair(cu, a, delta(cu, a), t), {held: true});
        continue;
      }
      if (ap == null) {
        row.none[t] = 'The Apex card’s price is unknown, so no cheaper option can be confirmed';
        continue;
      }
      if (underCap(ap, t)) {
        row.none[t] = 'The Apex card already costs under $' + TIERS[t].cap;
        continue;
      }
      const floorV = t === 'mid' && row.opts.budget ? row.opts.budget.gain : -1e9;
      const y = pool.find(y => !taken.has(y.X.c._k) && underCap(y.X.c.p, t) && y.v > floorV);
      if (!y) {
        const z = elsewhere.filter(y => underCap(y.X.c.p, t) && y.v > floorV).map(y => y.X.c.n.split(' // ')[0]);
        row.none[t] =
          t === 'mid' && row.opts.budget
            ? 'The Budget pick is the best option under $12'
            : z.length
              ? 'The cards under $' +
                TIERS[t].cap +
                ' that do the same job (' +
                z.slice(0, 2).join(', ') +
                ') are already suggested elsewhere in this deck'
              : 'No card under $' +
                TIERS[t].cap +
                ' does the same job as ' +
                A.c.n.split(' // ')[0] +
                ' and still improves on ' +
                cu.n.split(' // ')[0];
        continue;
      }
      taken.add(y.X.c._k);
      row.opts[t] = pair(cu, y.X, y.v, t);
    }
    const ownPick = ['apex', 'mid', 'budget'].map(t => row.opts[t]).find(p => p && p.own);
    if (ownPick) row.opts.free = Object.assign({}, ownPick, {t: 'free'});
    rows.set(cu.n, row);
  };
  for (const [i, x] of order) buildRow(cuts[i], x, sameFn, C);

  // --- 6. Lands: a nonbasic land may give way to a better nonbasic land — never a basic, never a spell, land count kept
  //     (APP-040). The new land must make every colour of the deck that the old one made, and needs play evidence.
  if (!std) {
    const deckCols = ctx.ident,
      covers = (a, b) => [...landColors(b)].filter(x => deckCols.includes(x)).every(x => landColors(a).has(x));
    const isLandUp = c => c && tags(c).land && !isBasic(c.n) && !/\bBasic\b/.test(frontType(c));
    const lcuts = d.cards
      .map(e => ({e, c: find(e.n)}))
      .filter(x => isLandUp(x.c) && !x.e.l && !fixCut.has(x.c._k))
      .map(x => ({n: x.e.n, q: 1, c: x.c, jobs: [], v: val(x.c)}));
    const lk = new Set();
    const LP = [];
    (ctx.edh ? [...ctx.edh.map.keys()].map(k => IDX.get(k)) : [])
      .concat(preOn ? [...preAdd.keys()].map(k => LIB.find(c => c._k === k)) : [])
      .forEach(c => {
        if (
          isLandUp(c) &&
          capOk(c) &&
          mustOk(c, d) &&
          !lk.has(c._k) &&
          !installed.has(c._k) &&
          !dis.has(c._k) &&
          !taken.has(c._k) &&
          legalHere(c)
        ) {
          lk.add(c._k);
          LP.push({c, jobs: [], v: val(c)});
        }
      });
    const evL = a => {
      const e = E(a.c),
        pa = PA(a.c);
      return (pa && pa.inc >= 0.05) || (e && e.inc >= 0.1);
    };
    // Lands are compared on play rates with untouched precons taken out (see preU): a precon land is otherwise "in" every
    // unchanged copy. A land that always enters tapped may give way to an untapped one making the same colours when the two
    // are about as well played; anything else needs the usual clear gain.
    const lv = c => {
      const e = E(c);
      if (!e || !preU) return val(c);
      const inc = preAll.has(c._k) ? Math.max(0, e.inc - preU) / (1 - preU) : e.inc / (1 - preU);
      return val(c) + K.wi * (inc - e.inc) * (1 - (PA(c) && e ? K.pb : 0));
    };
    lcuts.forEach(cu => (cu.v = lv(cu.c)));
    LP.forEach(a => (a.v = lv(a.c)));
    const faster = (a, cu) => landSpeed(cu.c) === 'tapped' && landSpeed(a.c) !== 'tapped';
    const ldelta = (cu, a) => a.v - cu.v;
    const lok = (cu, a, v) => v >= mMin || (faster(a, cu) && v >= -K.lslack);
    const lpick = new Map();
    lcuts.forEach((cu, i) => {
      const H = held.get(cu.n);
      if (H && H.apex) {
        const a = {c: H.apex.c, jobs: [], v: val(H.apex.c)};
        lpick.set(i, {a, v: ldelta(cu, a), held: true});
        taken.add(a.c._k);
      }
    });
    const M = [];
    lcuts.forEach((cu, i) => {
      if (lpick.has(i)) return;
      LP.forEach((a, k) => {
        const v = ldelta(cu, a);
        if (lok(cu, a, v) && evL(a) && covers(a.c, cu.c)) M.push([v + (faster(a, cu) ? K.lfast : 0), i, k]);
      });
    });
    M.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
    const ua = new Set();
    for (const [v, i, k] of M) {
      if (lpick.has(i) || ua.has(k) || taken.has(LP[k].c._k)) continue;
      ua.add(k);
      lpick.set(i, {a: LP[k], v, held: false});
    }
    lpick.forEach(x => taken.add(x.a.c._k));
    // A cheaper land stands in for an expensive one when it makes at least the same deck colours.
    const sameLand = (A, X) => covers(X.c, A.c);
    const sameLandAlt = (A, X) => covers(X.c, A.c) && (landSpeed(A.c) === 'tapped' || landSpeed(X.c) !== 'tapped'); // a stand-in is never slower than its Apex land
    [...lpick.entries()]
      .sort((a, b) => b[1].v - a[1].v)
      .forEach(([i, x]) => {
        buildRow(
          lcuts[i],
          x,
          sameLandAlt,
          LP.filter(evL).map(y => Object.assign({}, y, {jobs: []}))
        );
        const row = rows.get(lcuts[i].n);
        if (!row) return;
        Object.values(row.opts).forEach(p => {
          const a = find(p.add);
          if (a && faster({c: a}, lcuts[i])) {
            p.cutWhy = ['Always enters tapped'].concat(p.cutWhy).slice(0, 2);
            p.why = ['Makes the same colours and can enter untapped'].concat(p.why).slice(0, 2);
          }
        });
      });
    // A land hold with no Apex pick (only a Mid or Budget hold) still shows, exactly as held.
    lcuts.forEach(cu => {
      const H = held.get(cu.n);
      if (!H || rows.has(cu.n)) return;
      const row = {cut: cu.n, opts: {}, none: {}, gain: 0};
      for (const t of TIER_KEYS_UP)
        if (H[t]) {
          const a = {c: H[t].c, jobs: [], v: val(H[t].c)},
            v = ldelta(cu, a);
          row.opts[t] = Object.assign(pair(cu, a, v, t), {held: true});
          row.gain = Math.max(row.gain, v);
        }
      rows.set(cu.n, row);
    });
  }
  // Holds whose slot has no Apex pick (its Apex was a different hold, or the slot dropped out) still show, exactly as held.
  for (const [cutN, H] of held) {
    if (rows.has(cutN)) continue;
    const i = cutIdx.get(cutN);
    if (i == null) continue;
    const cu = cuts[i],
      row = {cut: cutN, opts: {}, none: {}, gain: 0};
    for (const t of TIER_KEYS_UP)
      if (H[t]) {
        const a = mk(H[t].c),
          v = delta(cu, a);
        row.opts[t] = Object.assign(pair(cu, a, v, t), {held: true});
        row.gain = Math.max(row.gain, v);
      }
    rows.set(cutN, row);
  }
  out.paths = [...rows.values()].sort(
    (a, b) => (b.opts.free ? 1 : 0) - (a.opts.free ? 1 : 0) || (a.gcPick ? 1 : 0) - (b.gcPick ? 1 : 0) || b.gain - a.gain
  );
  // Fewer swaps where players keep the precon (owner, Tramplesaurus fix A): a swap whose card out is not among the 10 cards players
  // cut most from this precon, for a card under 15% of them add, is one players mostly disagree with (76 of 80 such rows on the
  // benchmark decks). It is left out. Only the precon's own cards count (players' keep rates are about them); held swaps, your
  // own cards and lands are never left out.
  // The rows are left out at the end of scoreCheck, once every pick is final, so leaving them out changes no other row.
  out.trimOf = !(UP.trim && preOn)
    ? null
    : L => {
        const p = L.opts.apex;
        if (!p || p.held || (UP.gcT && L.gcPick && p.gcPick) || L.opts.free || Object.values(L.opts).some(x => x && x.held))
          return false;
        const cc = find(L.cut),
          ca = find(p.add);
        if (!cc || !ca || tags(cc).land || tags(ca).land || !preAll.has(cc._k)) return false;
        const pa = PA(ca),
          ci = PC(cc);
        return (pa ? pa.inc : 0) < UP.trimPa && (ci == null || ci >= UP.trimCi);
      };
  recount(out);
  out.bracket = ctx.bracket;
  out.gcIn = ctx.gcIn;
  out.mldIn = ctx.mldIn;
  out.gcCap = ctx.gcCap;
  out.cap = opt.cap || 0;
  return out;
}
// Fix a health alert: direct swaps that remedy one shortfall (a job below its target, too few or too many lands, a heavy
// curve, no way to win). Each swap takes out a card the deck can best spare (never a held card, the commander, or a card
// whose job the deck is already short of) and puts in the strongest card that fixes the problem, at the deck's price level.
// o.val: the deck's own card values (the upgrade list's), o.n: how many swaps to offer.
const FIX_KINDS = {
  ramp: 'Ramp',
  draw: 'Card draw',
  removal: 'Removal',
  wipe: 'Board wipes',
  landsUp: 'More lands',
  landsDown: 'Fewer lands',
  curve: 'Lower curve',
  wins: 'A way to win',
  mana: 'Better mana'
};
