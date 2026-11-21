// node measure.js <candidateDir> precon|gen <out.json> [decks.json]
// precon: benchmark precons as players see them (score with card strength when the engine has it), power vs the Apex build.
// gen: generate (or read decks.json), finish (strFinish when present), score.
const path = require('path'), fs = require('fs');
const [CD, MODE, OUT, DECKS] = process.argv.slice(2), TD = path.resolve(CD, "../tests");
const B = require(path.join(TD, 'bench.js')), H = B.H, X = H.ctx, run = H.run;
const HAS = run('typeof strRefParts === "function"');
const sets = B.SETS.test.concat(B.SETS.tune);
const out = {};
function measure(d, tier) {
  X.__d = d; d.tier = tier;
  return run(`(() => {
    const d = __d, ar = apexRef(d), st = strengthOn(d);
    const e = evaluateDeck(d, {games: 300, apex: ar, str: st});
    let T;
    if (e.str) T = strRefParts(d, strengthRef(d)); else T = refScores(d, ar);
    const SP = strengthPower(d), SR = strengthRef(d), P = SR ? strPicks(d, SR) : null, A = analyze(d);
    const S = simulate(d, 300, 7);
    return {score: e.total, exact: e.exact, power: T && T.apex > 0 ? +(100 * e.exact / T.apex).toFixed(1) : null,
      apexScore: T ? +T.apex.toFixed(1) : null, midScore: T ? +T.mid.toFixed(1) : null, budgetScore: T ? +T.budget.toFixed(1) : null,
      quality: e.parts.quality, synergy: e.parts.synergy, balance: e.parts.balance, routes: e.parts.routes, mana: e.parts.mana,
      strPower: SP ? +SP.power.toFixed(1) : null, picks: P ? {apex: P.apex.length, mid: P.mid.length, budget: P.budget.length} : null,
      lands: A.lands, screw: S.screwT5, short: S.shortT5, stuck: S.colourStuck};
  })()`);
}
if (MODE === 'own') {
  // the precons as players' own decks at Mid and Budget: plain score (live), with card strength (option A), and UP.strTierQ
  for (const [slug] of sets) for (const tier of ['mid', 'budget']) {
    const d = H.retail(slug); H.edh(d.commander); d.tier = tier; X.__d = d;
    try {
      const r = {};
      run('UP.strTierQ = 0'); const p = run('evaluateDeck(__d, {games: 300, apex: apexRef(__d)})'); r.live = {score: p.total, quality: p.parts.quality};
      r.a = measure(JSON.parse(JSON.stringify(d)), tier);
      run('UP.strTierQ = 1'); r.v = measure(JSON.parse(JSON.stringify(d)), tier); run('UP.strTierQ = 0');
      out[slug + '|' + tier] = r;
    } catch (e) { out[slug + '|' + tier] = {err: String(e.stack || e).slice(0, 300)}; }
    console.error(slug, tier, JSON.stringify(out[slug + '|' + tier]));
  }
} else if (MODE === 'precon') {
  for (const [slug] of sets) {
    const d = H.retail(slug); H.edh(d.commander);
    try { out[slug] = measure(d, 'apex'); } catch (e) { out[slug] = {err: String(e.stack || e).slice(0, 300)}; }
    console.error(slug, JSON.stringify(out[slug]));
  }
} else {
  const made = DECKS && fs.existsSync(DECKS) ? JSON.parse(fs.readFileSync(DECKS, 'utf8')) : null, saved = {};
  for (const [slug] of sets) {
    const pd = H.retail(slug), cmd = pd.commander; H.edh(cmd);
    for (const tf of [false, true]) for (const tier of ['budget', 'mid', 'apex']) {
      const k = slug + '|' + tier + '|' + (tf ? 'theme' : 'best');
      try {
        let nd;
        if (made) nd = made[k];
        else {
          X.__n = cmd; X.__pp = pd.partner || ''; X.__tf = tf;
          nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__pp) d.partner = __pp; if (__tf) d.themeFirst = true; return d; })()`);
          const E = run('EDH'), t = (E.tags || []).filter(x => E.tmap[x.slug]).slice(0, 3);
          if (t.length) nd.aims = t.map(x => 'edh:' + x.slug);
          X.__m = nd; X.__f = tier; run('genDeck(__m, [], null, new Set(), __f)'); nd = run('__m');
          saved[k] = JSON.parse(JSON.stringify(nd));
        }
        nd = JSON.parse(JSON.stringify(nd));
        const r = {gen: measure(JSON.parse(JSON.stringify(nd)), tier)};
        if (run('typeof strFinish === "function"')) {
          X.__m = nd; X.__f = tier; r.swapped = run('strFinish(__m, __f, new Set())');
          r.fin = measure(run('__m'), tier);
        }
        out[k] = r;
      } catch (e) { out[k] = {err: String(e.stack || e).slice(0, 300)}; }
      console.error(k, JSON.stringify(out[k]));
    }
  }
  if (!made && DECKS) fs.writeFileSync(DECKS, JSON.stringify(saved));
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
