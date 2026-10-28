// ----- goldfish simulator -----
// Plays seeded solo games (no opponents) to measure what a deck's mana and curve allow: when the commander comes down, how
// much mana gets used, how often colours strand spells, how often it floods or runs short of lands. It reads the cards'
// own text for mana (lands' colours and whether they enter tapped, rocks, creatures that tap for mana, land searches) and
// one-shot card draw; everything else is just a spell with a cost. These are resource measures, not win rates.
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const NUMW = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7};
function simCard(c, ident) {
  if (c._sim && (c._sim.v2 === undefined || c._sim.v2 === !!UP.v2sim)) return c._sim; // (a fetched basic carries its own)
  const t = frontType(c),
    o = (c.o || '').split(' // ')[0],
    land = tags(c).land,
    x = {
      land,
      cmc: c.cmc || 0,
      pips: {},
      mana: 0,
      cols: [],
      tapped: false,
      sick: false,
      ramp: 0,
      draw: 0,
      perm: !/^(Instant|Sorcery)/.test(t),
      creature: /Creature/.test(t),
      artifact: /Artifact/.test(t),
      power: /Creature/.test(t) ? parseInt(String(c.pt || '0').split('/')[0], 10) || 0 : 0,
      v2: !!UP.v2sim
    };
  // cost reductions the simulator can follow: total power of your creatures (Ghalta), one less per creature or artifact you control
  if (/costs \{X\} less to cast, where X is the total power of creatures you control/i.test(o)) x.redPower = true;
  {
    const m = /costs \{1\} less to cast for each (creature|artifact) you control/i.exec(o);
    if (m) x.redEach = m[1].toLowerCase();
  }
  ((c.m || '').match(/\{[^}]+\}/g) || []).forEach(p => {
    const k = p.slice(1, -1);
    if (/^[WUBRG]$/.test(k)) x.pips[k] = (x.pips[k] || 0) + 1;
    else if (/^[WUBRG]\/[WUBRG]$/.test(k)) x.pips[k] = (x.pips[k] || 0) + 1;
  });
  if (land) {
    x.mana = 1;
    x.cols = [...landColors(c)];
    const sp = landSpeed(c);
    x.tapped = sp === 'tapped';
    x.cond = sp === 'cond';
    if (!x.cols.length && /\{C\}/.test(o)) x.cols = ['C'];
    if (/search your library for/i.test(o) && /sacrifice/i.test(o)) {
      x.fetch = true;
      x.tapped = x.tapped || /tapped/i.test(o);
      x.fetchBasic = /basic land/i.test(o);
      x.fetchTypes = Object.keys(LTYPE).filter(k => new RegExp('\\b' + k + '\\b').test(o));
    }
    if (/choose a colou?r/i.test(o) && /chosen colou?r/i.test(o)) {
      x.chosen = true;
      x.fixed = ((/Add ([^.]*)/i.exec(o) || [])[1] || '').match(/\{[WUBRG]\}/g) || [];
      x.fixed = x.fixed.map(q => q[1]);
    }
  } else {
    const add = /\{T\}[^.]{0,40}: Add ([^.]*)/i.exec(o);
    if (add && !/Spend this mana only/i.test(o)) {
      const sy = add[1].match(/\{[WUBRGC]\}/g) || [];
      x.mana = Math.max(1, sy.length > 1 && !/ or /.test(add[1]) ? sy.length : 1);
      x.cols = /any colou?r|any type/i.test(add[1]) ? 'WUBRG'.split('') : [...new Set(sy.map(q => q[1]))];
      x.sick = /Creature/.test(t) && !/\bhaste\b/i.test(o);
      x.tappedRock = /enters tapped/i.test(o);
    }
    const srch =
      /search your library for (up to (one|two|three) |an? |two |three )?(basic land|basic|land|[A-Z][a-z]+ or [A-Z][a-z]+|Forest|Plains|Island|Swamp|Mountain)[^.]*?cards?[^.]*?onto the battlefield/i.exec(
        o
      );
    if (srch) {
      x.ramp = /up to two|two /i.test(srch[0]) && !/one onto the battlefield|put one/i.test(o) ? 2 : 1;
      x.rampHand = /into your hand/i.test(o) ? 1 : 0;
    }
    const dr = /draws? (a|an|one|two|three|four|five|six|seven|\d+) cards?/i.exec(o);
    if (dr && !/whenever|at the beginning|each player/i.test(o.slice(Math.max(0, dr.index - 60), dr.index)))
      x.draw = NUMW[dr[1].toLowerCase()] || +dr[1] || 0;
  }
  if (UP.v2sim && !land) simReading(c, x);
  return (c._sim = x);
}
// Practice games from the rules reading (engine v2 phase 5, UP.v2sim): a mana ability pays for spells only with what it nets
// (a Signet's "{1}, {T}: Add {U}{B}" makes one more mana, not two) and only when tapping is its whole cost besides mana and life
// (a sacrifice is a one-shot, not a source); a creature that taps for mana is summoning sick unless it has haste, and once
// tapped for mana it cannot attack that turn. Creatures attack from the turn after they come down (haste: at once).
function simReading(c, x) {
  const r = rrRead(c),
    abs = r.abilities.concat(...(r.faces || []).slice(0, 1).map(f => f.abilities)),
    kw = n => abs.some(a => a.kind === 'keyword' && a.name === n);
  x.haste = kw('haste');
  x.evasive =
    ['flying', 'menace', 'trample', 'shadow', 'fear', 'intimidate'].some(kw) ||
    abs.some(a => (a.effects || []).some(e => e.do === 'unblockable' && /^~|^$/.test(e.who || '')));
  if (r.body && x.creature) x.power = typeof r.body.power === 'number' ? r.body.power : 0;
  const o = c.o || '';
  if (/Spend this mana only/i.test(o)) return;
  let best = null;
  for (const a of abs) {
    if (a.kind !== 'mana') continue;
    const cost = a.cost || [];
    if (
      !cost.some(k => k.tap) ||
      cost.some(k => k.sacrifice || k.discard || k['remove-counters'] || k['tap-others'] || k['exile-self'])
    )
      continue;
    const paid = cost
        .filter(k => k.mana)
        .reduce(
          (s, k) =>
            s +
            (k.mana.match(/\{\d+\}/g) || []).reduce((t, q) => t + +q.slice(1, -1), 0) +
            (k.mana.match(/\{[WUBRGC]\}/g) || []).length,
          0
        ),
      mk = a.makes || {},
      net = (+mk.amount || 1) - paid;
    if (net < 1) continue;
    const sym = mk.colors && mk.colors.length ? mk.colors : (String(mk.choice || '').match(/\{[WUBRGC]\}/g) || []).map(q => q[1]);
    if (!best || net > best.net)
      best = {
        net,
        cols: sym.length && !/any|identity|could produce/i.test(mk.choice || '') ? [...new Set(sym)] : 'WUBRG'.split('')
      };
  }
  if (best) {
    x.mana = best.net;
    x.cols = best.cols;
    x.sick = x.creature && !x.haste;
    x.tappedRock =
      abs.some(a => a.kind === 'replacement' && /enters tapped/i.test(a.scope || a.event || '')) || /enters tapped/i.test(o);
  } else if (x.mana) {
    // the text pattern found a source the reading does not count as one (a sacrifice, or a net of nothing)
    x.mana = 0;
    x.cols = [];
    x.sick = false;
  }
}
// Can these pips be paid from these sources (each source: list of colours it can make)? Generic is paid from the rest.
function payable(pips, generic, srcs) {
  const need = [];
  Object.entries(pips).forEach(([k, n]) => {
    for (let i = 0; i < n; i++) need.push(k.split('/'));
  });
  if (need.length + generic > srcs.length) return null;
  const used = new Array(srcs.length).fill(false),
    order = srcs.map((s, i) => i).sort((a, b) => srcs[a].length - srcs[b].length);
  for (const opts of need) {
    const i = order.find(j => !used[j] && opts.some(k => srcs[j].includes(k)));
    if (i == null) return null;
    used[i] = true;
  }
  let g = generic;
  for (const j of order) {
    if (g <= 0) break;
    if (!used[j]) {
      used[j] = true;
      g--;
    }
  }
  return g > 0 ? null : used;
}
// Lands in practice games (Build 137, UP.lfix): a fetch land makes only the colours of the lands it can find in this deck (Wooded
// Foothills: Mountains and Forests, so red and green, or a dual with those types), and a "choose a colour" land makes its fixed
// colour plus the one colour chosen as it enters (the colour the hand needs most).
function fetchReach(lib0, ident) {
  const basics = new Set(),
    typed = {};
  lib0.forEach(c => {
    if (!tags(c).land) return;
    const t = frontType(c);
    Object.keys(LTYPE).forEach(k => {
      if (new RegExp('\\b' + k + '\\b').test(t)) {
        const cols = [...landColors(c)].filter(z => ident.includes(z));
        typed[k] = typed[k] || new Set();
        cols.forEach(z => typed[k].add(z));
        if (/Basic/.test(t)) basics.add(LTYPE[k]);
      }
    });
  });
  return {basics, typed};
}
function simLandCols(c, s, ident, reach, needCol, have, colsOf) {
  if (s.fetch) {
    const out = new Set();
    if (s.fetchBasic) reach.basics.forEach(z => out.add(z));
    (s.fetchTypes || []).forEach(k => (reach.typed[k] || []).forEach(z => out.add(z)));
    const v = [...out].filter(z => ident.includes(z));
    return v.length ? v : ['C'];
  }
  if (s.chosen) {
    const fx = (s.fixed || []).filter(z => ident.includes(z)),
      want = ident.filter(z => !fx.includes(z)),
      pick = want.find(z => needCol.has(z) && !have.has(z)) || want.find(z => !have.has(z)) || want[0];
    return fx.concat(pick ? [pick] : []).length ? fx.concat(pick ? [pick] : []) : ['C'];
  }
  return colsOf(s);
}
function simulate(d, games, seed) {
  const ctx = ctxOf(d),
    ident = ctx.ident.length ? ctx.ident : ['C'],
    cmds = [d.commander, d.partner].filter(Boolean).map(find).filter(Boolean);
  const lib0 = [];
  d.cards.forEach(e => {
    const c = find(e.n);
    if (c) for (let i = 0; i < e.q; i++) lib0.push(c);
  });
  const reach = UP.lfix ? fetchReach(lib0, ident) : null;
  const R = {
      games: games || 500,
      cmdTurn: [],
      spent: [0, 0, 0, 0, 0, 0, 0, 0],
      colourStuck: 0,
      screw: 0,
      flood: 0,
      landsT4: [],
      noPlayT3: 0,
      mull: 0,
      dmg: [0, 0, 0, 0, 0, 0, 0, 0],
      kill: []
    },
    rnd = rng32(seed || 1);
  const colsOf = s => (s.cols.length ? s.cols.filter(k => k === 'C' || ident.includes(k)) : ['C']);
  for (let g = 0; g < R.games; g++) {
    let lib = lib0.slice(),
      hand = [];
    const shuffle = () => {
      for (let i = lib.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [lib[i], lib[j]] = [lib[j], lib[i]];
      }
    };
    shuffle();
    hand = lib.splice(0, 7);
    const nl = () => hand.filter(c => simCard(c, ident).land).length;
    if (nl() < 2 || nl() > 5) {
      R.mull++;
      lib = lib.concat(hand);
      shuffle();
      hand = lib.splice(0, 7);
      const h = hand.map(c => simCard(c, ident)); // keep 7, bottom the worst one (a spare land or the costliest spell)
      const spare =
        nl() > 4
          ? hand.findIndex(c => simCard(c, ident).land)
          : hand.reduce((b, c, i) => (simCard(c, ident).land ? b : b < 0 || c.cmc > hand[b].cmc ? i : b), -1);
      if (spare >= 0) lib.push(hand.splice(spare, 1)[0]);
    }
    const bf = [],
      cz = cmds.slice();
    let cmdT = 0,
      stuckAny = false,
      ramped = 0,
      dmg = 0,
      killT = 0;
    for (let turn = 1; turn <= 10; turn++) {
      if (turn > 1 || true) {
        if (lib.length) hand.push(lib.shift());
      } // multiplayer Commander: everyone draws on turn 1
      bf.forEach(s => {
        s.sickNow = false;
        if (s.wake === turn) s.tappedNow = false;
      });
      // land: the untapped one adding a colour the hand needs, else any
      const lands = hand.map((c, i) => [c, i]).filter(([c]) => simCard(c, ident).land);
      if (lands.length) {
        const needCol = new Set();
        hand.forEach(c => Object.keys(simCard(c, ident).pips).forEach(k => k.split('/').forEach(z => needCol.add(z))));
        const have = new Set(bf.flatMap(s => colsOf(s)));
        const score = ([c]) => {
          const s = simCard(c, ident);
          return (
            colsOf(s).filter(k => needCol.has(k) && !have.has(k)).length * 2 +
            (s.tapped ? 0 : 1) +
            (s.cond && bf.length >= 2 ? 1 : 0)
          );
        };
        const [c, i] = lands.sort((a, b) => score(b) - score(a))[0],
          s = simCard(c, ident);
        hand.splice(i, 1);
        const tap = s.tapped || (s.cond && bf.filter(z => z.land).length < 2);
        bf.push(
          Object.assign({}, s, {
            tappedNow: tap,
            land: true,
            cols: UP.lfix ? simLandCols(c, s, ident, reach, needCol, have, colsOf) : s.fetch ? ident.slice() : colsOf(s)
          })
        );
      }
      // spend mana: commander first, then mana sources, then card draw, then the costliest castable spell
      let spent = 0;
      for (let k = 0; k < 12; k++) {
        const srcs = bf.filter(s => s.mana && !s.tappedNow && !s.sickNow && !s.used),
          pool = [];
        srcs.forEach(s => {
          for (let m = 0; m < s.mana; m++) pool.push({s, cols: s.cols.length ? s.cols : ['C']});
        });
        const red = x =>
          x.redPower
            ? bf.reduce((a, s) => a + (s.power || 0), 0)
            : x.redEach
              ? bf.filter(s => (x.redEach === 'creature' ? s.creature : s.artifact)).length
              : 0;
        const costOf = c => {
          const x = simCard(c, ident),
            pp = Object.values(x.pips).reduce((a, b) => a + b, 0);
          return pp + Math.max(0, c.cmc - pp - red(x));
        };
        const can = c => {
          const x = simCard(c, ident),
            pp = Object.values(x.pips).reduce((a, b) => a + b, 0),
            gen = Math.max(0, c.cmc - pp - red(x));
          return payable(
            x.pips,
            gen,
            pool.map(p => p.cols)
          );
        };
        let pick = null,
          from = null,
          use = null;
        for (const c of cz) {
          const u = can(c);
          if (u) {
            pick = c;
            from = 'cz';
            use = u;
            break;
          }
        }
        if (!pick) {
          const opts = hand
            .map((c, i) => ({c, i, x: simCard(c, ident)}))
            .filter(o => !o.x.land)
            .map(o => Object.assign(o, {u: can(o.c)}))
            .filter(o => o.u);
          const pri = o => (o.x.mana || o.x.ramp ? 100 : 0) + (o.x.draw ? 50 : 0) + costOf(o.c);
          opts.sort((a, b) => pri(b) - pri(a));
          if (opts.length) {
            pick = opts[0].c;
            from = opts[0].i;
            use = opts[0].u;
          }
        }
        if (!pick) {
          // stuck on colour: enough mana sources for a spell, but a colour it needs is made by none of them
          const have = new Set(bf.filter(z => z.mana).flatMap(z => (z.cols.length ? z.cols : ['C']))),
            nSrc = bf.filter(z => z.mana).reduce((a, z) => a + z.mana, 0);
          if (
            hand.some(c => {
              const x = simCard(c, ident);
              return !x.land && c.cmc <= nSrc && Object.keys(x.pips).some(k => !k.split('/').some(z => have.has(z)));
            })
          )
            stuckAny = stuckAny || turn <= 6;
          break;
        }
        use.forEach((u, j) => {
          if (u) pool[j].s.usedCount = (pool[j].s.usedCount || 0) + 1;
        });
        srcs.forEach(s => {
          if ((s.usedCount || 0) >= s.mana) s.used = true;
          s.usedCount = s.usedCount || 0;
        });
        spent += costOf(pick);
        const x = simCard(pick, ident);
        if (from === 'cz') {
          cz.splice(cz.indexOf(pick), 1);
          if (!cmdT) cmdT = turn;
        } else hand.splice(from, 1);
        if (x.mana)
          bf.push(
            Object.assign({}, x, {
              sickNow: x.sick,
              tappedNow: !!x.tappedRock,
              cols: x.cols.length ? x.cols.filter(k => ident.includes(k)) : ['C']
            })
          );
        else if (x.perm)
          bf.push({
            mana: 0,
            cols: [],
            power: x.power,
            creature: x.creature,
            artifact: x.artifact,
            sickNow: !!UP.v2sim && x.creature && !x.haste
          });
        if (x.ramp) {
          ramped += x.ramp;
          for (let r = 0; r < x.ramp; r++) bf.push({land: true, mana: 1, cols: ident.slice(), tappedNow: true, wake: turn + 1});
          if (x.rampHand)
            hand.push({
              n: '(basic)',
              cmc: 0,
              m: '',
              t: 'Basic Land',
              o: '',
              _sim: {land: true, mana: 1, cols: ident.slice(), pips: {}, cmc: 0},
              ci: []
            });
        }
        for (let q = 0; q < (x.draw || 0); q++) if (lib.length) hand.push(lib.shift());
      }
      // combat basics (UP.v2sim): every creature that is not summoning sick and was not tapped for mana attacks an empty board
      if (UP.v2sim) {
        dmg += bf.reduce((a, s) => a + (s.creature && s.power > 0 && !s.sickNow && !s.usedCount ? s.power : 0), 0);
        if (turn <= 8) R.dmg[turn - 1] += dmg;
        if (!killT && dmg >= 40) killT = turn;
      }
      bf.forEach(s => {
        s.used = false;
        s.usedCount = 0;
        s.tappedNow = false;
      });
      if (turn <= 8) R.spent[turn - 1] += spent;
      const L = bf.filter(s => s.land).length;
      if (turn === 4) R.landsT4.push(L);
      if (turn === 3 && !spent && !cmdT) R.noPlayT3++;
      if (turn === 5 && L < 4) R.screw++;
      if (turn === 8 && L + hand.filter(c => simCard(c, ident).land).length - ramped >= 9) R.flood++; // flood: 9+ of the ~15 cards seen by turn 8 are lands
    }
    R.cmdTurn.push(cmdT || 11);
    R.kill.push(killT || 11);
    if (stuckAny) R.colourStuck++;
  }
  const n = R.games,
    med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const combat = UP.v2sim ? {damageT1to8: R.dmg.map(v => +(v / n).toFixed(1)), killMedianTurn: med(R.kill)} : {};
  return Object.assign(combat, {
    games: n,
    cmdMedianTurn: med(R.cmdTurn),
    cmdByT4: R.cmdTurn.filter(t => t <= 4).length / n,
    cmdByT6: R.cmdTurn.filter(t => t <= 6).length / n,
    manaSpentT1to8: R.spent.map(v => +(v / n).toFixed(2)),
    manaUsedBy6: +(R.spent.slice(0, 6).reduce((a, b) => a + b, 0) / n).toFixed(1),
    colourStuck: +(R.colourStuck / n).toFixed(3),
    screwT5: +(R.screw / n).toFixed(3),
    floodT8: +(R.flood / n).toFixed(3),
    mulligan: +(R.mull / n).toFixed(3),
    landsT4: +(R.landsT4.reduce((a, b) => a + b, 0) / n).toFixed(2)
  });
}
// Visible practice games (Build 136): the same games as simulate(), step by step, for the Practice panel. A copy that also
// records each turn, so simulate() (the deck score's 300 games) stays exactly as it is; a test checks both agree game for game.
function practiceGames(d, games, seed) {
  const ctx = ctxOf(d),
    ident = ctx.ident.length ? ctx.ident : ['C'],
    cmds = [d.commander, d.partner].filter(Boolean).map(find).filter(Boolean);
  const lib0 = [];
  d.cards.forEach(e => {
    const c = find(e.n);
    if (c) for (let i = 0; i < e.q; i++) lib0.push(c);
  });
  const reach = UP.lfix ? fetchReach(lib0, ident) : null;
  const R = {
      games: games || 500,
      cmdTurn: [],
      spent: [0, 0, 0, 0, 0, 0, 0, 0],
      colourStuck: 0,
      screw: 0,
      flood: 0,
      landsT4: [],
      noPlayT3: 0,
      mull: 0,
      dmg: [0, 0, 0, 0, 0, 0, 0, 0],
      kill: []
    },
    rnd = rng32(seed || 1),
    logs = [],
    nm = c => (c ? c.n : '');
  const colsOf = s => (s.cols.length ? s.cols.filter(k => k === 'C' || ident.includes(k)) : ['C']);
  for (let g = 0; g < R.games; g++) {
    let lib = lib0.slice(),
      hand = [];
    const shuffle = () => {
      for (let i = lib.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [lib[i], lib[j]] = [lib[j], lib[i]];
      }
    };
    shuffle();
    hand = lib.splice(0, 7);
    const G = {hand0: hand.map(nm), mull: false, bottom: '', turns: []};
    logs.push(G);
    const nl = () => hand.filter(c => simCard(c, ident).land).length;
    if (nl() < 2 || nl() > 5) {
      R.mull++;
      lib = lib.concat(hand);
      shuffle();
      hand = lib.splice(0, 7);
      const h = hand.map(c => simCard(c, ident)); // keep 7, bottom the worst one (a spare land or the costliest spell)
      const spare =
        nl() > 4
          ? hand.findIndex(c => simCard(c, ident).land)
          : hand.reduce((b, c, i) => (simCard(c, ident).land ? b : b < 0 || c.cmc > hand[b].cmc ? i : b), -1);
      if (spare >= 0) {
        G.bottom = nm(hand[spare]);
        lib.push(hand.splice(spare, 1)[0]);
      }
      G.mull = true;
      G.hand1 = hand.map(nm);
    }
    const bf = [],
      cz = cmds.slice();
    let cmdT = 0,
      stuckAny = false,
      ramped = 0,
      dmg = 0,
      killT = 0;
    for (let turn = 1; turn <= 10; turn++) {
      const T = {turn, draw: '', land: '', tapped: false, cast: [], mana: 0, spent: 0};
      G.turns.push(T);
      if (turn > 1 || true) {
        if (lib.length) {
          T.draw = nm(lib[0]);
          hand.push(lib.shift());
        }
      } // multiplayer Commander: everyone draws on turn 1
      bf.forEach(s => {
        s.sickNow = false;
        if (s.wake === turn) s.tappedNow = false;
      });
      // land: the untapped one adding a colour the hand needs, else any
      const lands = hand.map((c, i) => [c, i]).filter(([c]) => simCard(c, ident).land);
      if (lands.length) {
        const needCol = new Set();
        hand.forEach(c => Object.keys(simCard(c, ident).pips).forEach(k => k.split('/').forEach(z => needCol.add(z))));
        const have = new Set(bf.flatMap(s => colsOf(s)));
        const score = ([c]) => {
          const s = simCard(c, ident);
          return (
            colsOf(s).filter(k => needCol.has(k) && !have.has(k)).length * 2 +
            (s.tapped ? 0 : 1) +
            (s.cond && bf.length >= 2 ? 1 : 0)
          );
        };
        const [c, i] = lands.sort((a, b) => score(b) - score(a))[0],
          s = simCard(c, ident);
        hand.splice(i, 1);
        T.land = c.n;
        const tap = s.tapped || (s.cond && bf.filter(z => z.land).length < 2);
        bf.push(
          Object.assign({}, s, {
            tappedNow: tap,
            land: true,
            cols: UP.lfix ? simLandCols(c, s, ident, reach, needCol, have, colsOf) : s.fetch ? ident.slice() : colsOf(s)
          })
        );
        T.tapped = !!tap;
      }
      // spend mana: commander first, then mana sources, then card draw, then the costliest castable spell
      let spent = 0;
      T.mana = bf.filter(s => s.mana && !s.tappedNow && !s.sickNow).reduce((a, s) => a + s.mana, 0);
      for (let k = 0; k < 12; k++) {
        const srcs = bf.filter(s => s.mana && !s.tappedNow && !s.sickNow && !s.used),
          pool = [];
        srcs.forEach(s => {
          for (let m = 0; m < s.mana; m++) pool.push({s, cols: s.cols.length ? s.cols : ['C']});
        });
        const red = x =>
          x.redPower
            ? bf.reduce((a, s) => a + (s.power || 0), 0)
            : x.redEach
              ? bf.filter(s => (x.redEach === 'creature' ? s.creature : s.artifact)).length
              : 0;
        const costOf = c => {
          const x = simCard(c, ident),
            pp = Object.values(x.pips).reduce((a, b) => a + b, 0);
          return pp + Math.max(0, c.cmc - pp - red(x));
        };
        const can = c => {
          const x = simCard(c, ident),
            pp = Object.values(x.pips).reduce((a, b) => a + b, 0),
            gen = Math.max(0, c.cmc - pp - red(x));
          return payable(
            x.pips,
            gen,
            pool.map(p => p.cols)
          );
        };
        let pick = null,
          from = null,
          use = null;
        for (const c of cz) {
          const u = can(c);
          if (u) {
            pick = c;
            from = 'cz';
            use = u;
            break;
          }
        }
        if (!pick) {
          const opts = hand
            .map((c, i) => ({c, i, x: simCard(c, ident)}))
            .filter(o => !o.x.land)
            .map(o => Object.assign(o, {u: can(o.c)}))
            .filter(o => o.u);
          const pri = o => (o.x.mana || o.x.ramp ? 100 : 0) + (o.x.draw ? 50 : 0) + costOf(o.c);
          opts.sort((a, b) => pri(b) - pri(a));
          if (opts.length) {
            pick = opts[0].c;
            from = opts[0].i;
            use = opts[0].u;
          }
        }
        if (!pick) {
          // stuck on colour: enough mana sources for a spell, but a colour it needs is made by none of them
          const have = new Set(bf.filter(z => z.mana).flatMap(z => (z.cols.length ? z.cols : ['C']))),
            nSrc = bf.filter(z => z.mana).reduce((a, z) => a + z.mana, 0);
          if (
            hand.some(c => {
              const x = simCard(c, ident);
              return !x.land && c.cmc <= nSrc && Object.keys(x.pips).some(k => !k.split('/').some(z => have.has(z)));
            })
          )
            stuckAny = stuckAny || turn <= 6;
          break;
        }
        use.forEach((u, j) => {
          if (u) pool[j].s.usedCount = (pool[j].s.usedCount || 0) + 1;
        });
        srcs.forEach(s => {
          if ((s.usedCount || 0) >= s.mana) s.used = true;
          s.usedCount = s.usedCount || 0;
        });
        spent += costOf(pick);
        const x = simCard(pick, ident);
        T.cast.push({n: pick.n, cmd: from === 'cz', cost: costOf(pick)});
        if (from === 'cz') {
          cz.splice(cz.indexOf(pick), 1);
          if (!cmdT) cmdT = turn;
        } else hand.splice(from, 1);
        if (x.mana)
          bf.push(
            Object.assign({}, x, {
              sickNow: x.sick,
              tappedNow: !!x.tappedRock,
              cols: x.cols.length ? x.cols.filter(k => ident.includes(k)) : ['C']
            })
          );
        else if (x.perm)
          bf.push({
            mana: 0,
            cols: [],
            power: x.power,
            creature: x.creature,
            artifact: x.artifact,
            sickNow: !!UP.v2sim && x.creature && !x.haste
          });
        if (x.ramp) {
          ramped += x.ramp;
          for (let r = 0; r < x.ramp; r++) bf.push({land: true, mana: 1, cols: ident.slice(), tappedNow: true, wake: turn + 1});
          if (x.rampHand)
            hand.push({
              n: '(basic)',
              cmc: 0,
              m: '',
              t: 'Basic Land',
              o: '',
              _sim: {land: true, mana: 1, cols: ident.slice(), pips: {}, cmc: 0},
              ci: []
            });
        }
        for (let q = 0; q < (x.draw || 0); q++) if (lib.length) hand.push(lib.shift());
      }
      // combat basics (UP.v2sim), as in simulate(): the panel shows each turn's attack and the running total
      if (UP.v2sim) {
        T.attack = bf.reduce((a, s) => a + (s.creature && s.power > 0 && !s.sickNow && !s.usedCount ? s.power : 0), 0);
        dmg += T.attack;
        T.dmg = dmg;
        if (turn <= 8) R.dmg[turn - 1] += dmg;
        if (!killT && dmg >= 40) killT = turn;
      }
      bf.forEach(s => {
        s.used = false;
        s.usedCount = 0;
        s.tappedNow = false;
      });
      T.spent = spent;
      if (turn <= 8) R.spent[turn - 1] += spent;
      const L = bf.filter(s => s.land).length;
      if (turn === 4) R.landsT4.push(L);
      if (turn === 3 && !spent && !cmdT) R.noPlayT3++;
      if (turn === 5 && L < 4) R.screw++;
      if (turn === 8 && L + hand.filter(c => simCard(c, ident).land).length - ramped >= 9) R.flood++; // flood: 9+ of the ~15 cards seen by turn 8 are lands
    }
    R.cmdTurn.push(cmdT || 11);
    R.kill.push(killT || 11);
    if (stuckAny) R.colourStuck++;
    G.killT = killT;
    G.cmdTurn = cmdT || 0;
    G.stuck = stuckAny;
  }
  const n = R.games,
    med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const combat = UP.v2sim ? {damageT1to8: R.dmg.map(v => +(v / n).toFixed(1)), killMedianTurn: med(R.kill)} : {};
  return Object.assign({logs}, combat, {
    games: n,
    cmdMedianTurn: med(R.cmdTurn),
    cmdByT4: R.cmdTurn.filter(t => t <= 4).length / n,
    cmdByT6: R.cmdTurn.filter(t => t <= 6).length / n,
    manaSpentT1to8: R.spent.map(v => +(v / n).toFixed(2)),
    manaUsedBy6: +(R.spent.slice(0, 6).reduce((a, b) => a + b, 0) / n).toFixed(1),
    colourStuck: +(R.colourStuck / n).toFixed(3),
    screwT5: +(R.screw / n).toFixed(3),
    floodT8: +(R.flood / n).toFixed(3),
    mulligan: +(R.mull / n).toFixed(3),
    landsT4: +(R.landsT4.reduce((a, b) => a + b, 0) / n).toFixed(2)
  });
}
// ----- combos (Commander Spellbook, via the card-data job; see tools/build-combos.mjs) -----
// COMBOS.list: {keys, names, ci, win, what, decks, bt, note}; COMBOS.by: card key -> combos it is in.
let COMBOS = {list: [], by: new Map(), at: '', state: ''};
function useCombos(j) {
  const list = [],
    by = new Map();
  ((j && j.combos) || []).forEach(r => {
    const names = r[0].map(i => j.cards[i]),
      cs = names.map(n => find(n));
    if (cs.some(c => !c)) return;
    const x = {
      keys: cs.map(c => c._k),
      names: cs.map(c => c.n),
      ci: r[1],
      win: r[2] === 'w',
      what: r[3],
      decks: r[4],
      bt: r[5],
      note: r[6] || ''
    };
    list.push(x);
    x.keys.forEach(k => {
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(x);
    });
  });
  COMBOS = {list, by, at: (j && j.at) || '', state: list.length ? 'ok' : 'empty'};
  return list.length;
}
// Combos a deck has (every card present, the commanders included) and is one card short of (the missing card legal here).
function combosOf(d, ident) {
  const have = new Set((d.cards || []).map(e => keyOf(e.n)).concat([d.commander, d.partner].filter(Boolean).map(keyOf))),
    full = [],
    near = [],
    seen = new Set();
  have.forEach(k =>
    (COMBOS.by.get(k) || []).forEach(x => {
      if (seen.has(x)) return;
      seen.add(x);
      const miss = x.keys.filter(q => !have.has(q));
      if (!miss.length) full.push(x);
      else if (miss.length === 1 && x.ci.split('').every(z => z === 'C' || (ident || []).includes(z)))
        near.push({x, miss: x.names[x.keys.indexOf(miss[0])]});
    })
  );
  return {full, near};
}
