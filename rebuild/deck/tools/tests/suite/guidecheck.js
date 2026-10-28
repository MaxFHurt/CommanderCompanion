// Published-guide spot-check (never used for tuning): how the engine's upgrade rows compare with upgrade guides written for
// the 5 test precons (guides/guides.json). For each guide card: is it in the deck already, legal, offered by any row (pick,
// cheaper tier, alternative or Most played), how often real players add it, and what the deck score says about it.
// node guidecheck.js <engineDir> [--detail]
const path = require('path'), fs = require('fs'), detail = process.argv.includes('--detail');
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', 'test', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run, G = JSON.parse(fs.readFileSync(path.join(__dirname, 'guides/guides.json'), 'utf8'));
const keyOf = run('keyOf'), tags = run('tags'), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, pct = x => Math.round(100 * x) + '%';
const tot = {adds:0, unknown:0, have:0, off:0, elig:0, pick:0, offered:0, popMiss:0, upMiss:0, cuts:0, cutHit:0, ourCuts:0, ourCutGuide:0, gPair:[], ourPick:[], beat:[]};
for (const [slug, file] of B.SETS.test){
  const ev = B.evidence(slug, file), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
  const R = run('(() => { const R0 = upgradePaths(__d); try { scoreCheck(__d, R0, {apex:apexRef(__d)}); } catch (e) {} return R0; })()');
  const inDeck = new Set(d.cards.map(e => keyOf(e.n))), ident = run('ctxOf')(d).ident, dOf = R.dOf || (() => null);
  const offered = new Map(), picks = new Set(), ourCuts = new Set();
  R.paths.forEach((L, i) => { ourCuts.add(keyOf(L.cut)); const put = (n, how) => { if (n && !offered.has(keyOf(n))) offered.set(keyOf(n), how + ' (row ' + (i + 1) + ')'); };
    if (L.opts.apex) { picks.add(keyOf(L.opts.apex.add)); put(L.opts.apex.add, 'Apex pick'); }
    ['mid', 'budget'].forEach(t => L.opts[t] && put(L.opts[t].add, t + ' pick'));
    Object.values(L.alts || {}).forEach(a => (a || []).forEach(x => put(x.n, 'alternative')));
    Object.values(L.pop || {}).forEach(x => put(x && (x.add || x.n), 'Most played')); if (L.top) put(L.top.n, 'highest score'); });
  const cutsTop = R.paths.slice(0, 12).map(L => L.cut).filter(n => !tags(X.find(n) || {t:''}).land);
  R.paths.slice(0, 10).forEach(L => L.opts.apex && L.opts.apex.dScore != null && tot.ourPick.push(L.opts.apex.dScore));
  console.log('\n== ' + slug + ' (' + d.commander + ', ' + ev.n + ' upgraded copies) ==');
  const guideCuts = new Set();
  for (const g of G[slug]){
    const same = g.cmd.split(',')[0] === d.commander.split(',')[0] || (d.partner && g.cmd.split(',')[0] === d.partner.split(',')[0]);
    const adds = g.pairs ? g.pairs.map(p => p[1]) : g.adds, cuts = g.pairs ? g.pairs.map(p => p[0]) : g.cuts;
    if (!same){ console.log('  ' + g.src + ': built around ' + g.cmd + ', not ' + d.commander + ' (reported, not scored)'); continue; }
    const rows = [];
    adds.forEach(n => { tot.adds++; const c = X.find(n), nm = x => String(x).toLowerCase().split(' // ')[0].replace(/[^a-z0-9]/g, ''); if (!c || nm(c.n) !== nm(n)){ tot.unknown++; rows.push([n, 'not in card data']); return; }
      if (inDeck.has(c._k)){ tot.have++; rows.push([c.n, 'already in deck']); return; }
      if (tags(c).land){ rows.push([c.n, 'land (not judged)']); return; }
      if (!c.cmd || (ident.length && !c.ci.every(x => ident.includes(x)))){ tot.off++; rows.push([c.n, 'not legal for this deck']); return; }
      tot.elig++; const pa = ev.A.get(c._k) || 0, how = offered.get(c._k);
      if (picks.has(c._k)) tot.pick++; if (how) tot.offered++;
      // Fair test for a missed card: in its best row, does it beat that row's own Apex pick on the deck score?
      let best = null; if (!how) R.paths.slice(0, 15).forEach(L => { const p = L.opts.apex; if (!p || p.dScore == null || tags(X.find(L.cut) || {t:''}).land) return; const v = dOf(L.cut, c.n); if (v != null && (best == null || v - p.dScore > best.m)) best = {m:+(v - p.dScore).toFixed(2), v, row:L.cut}; });
      if (!how && pa >= 0.1) tot.popMiss++; if (!how && best && best.m > 0){ tot.upMiss++; tot.beat.push([slug, c.n, best.m, pa, best.row]); }
      rows.push([c.n, how ? 'OFFERED: ' + how : 'missed', 'players add ' + pct(pa), best ? 'vs our pick ' + (best.m > 0 ? '+' : '') + best.m + ' (for ' + best.row + ')' : '']); });
    if (g.pairs) g.pairs.forEach(([ct, ad]) => { const a = X.find(ad), cc = X.find(ct); if (a && cc && inDeck.has(cc._k) && !inDeck.has(a._k) && !tags(a).land){ const v = dOf(cc.n, a.n); if (v != null) tot.gPair.push(v); } });
    cuts.forEach(n => { const c = X.find(n); if (!c || !inDeck.has(c._k) || tags(c).land) return; guideCuts.add(c._k); tot.cuts++; if (ourCuts.has(c._k)) tot.cutHit++; });
    const el = rows.filter(r => r[1] === 'missed' || /^OFFERED/.test(r[1])), of = el.filter(r => /^OFFERED/.test(r[1]));
    console.log('  ' + g.src + ': ' + of.length + ' of ' + el.length + ' judged adds offered; cuts ' + cuts.filter(n => { const c = X.find(n); return c && ourCuts.has(c._k); }).length + ' of ' + cuts.length + ' match ours');
    if (detail) rows.forEach(r => console.log('     ' + r[0].padEnd(40) + r.slice(1).filter(Boolean).join(' | ')));
  }
  cutsTop.forEach(n => { tot.ourCuts++; if (guideCuts.has(keyOf(n))) tot.ourCutGuide++; });
  if (detail) console.log('  our first 12 cuts: ' + cutsTop.map(n => (guideCuts.has(keyOf(n)) ? '*' : '') + n).join('; ') + '   (* = a guide cuts it too)');
}
console.log('\nTOTAL guide adds ' + tot.adds + ': not in card data ' + tot.unknown + ', already in deck ' + tot.have + ', not legal ' + tot.off + ', judged ' + tot.elig);
console.log('  offered anywhere ' + tot.offered + ' (' + pct(tot.offered / tot.elig) + '), as the Apex pick ' + tot.pick + ' (' + pct(tot.pick / tot.elig) + ')');
console.log('  missed but players add it >=10%: ' + tot.popMiss + ' | missed and it beats our own pick for some slot: ' + tot.upMiss);
tot.beat.sort((a, b) => b[2] - a[2]).forEach(b => console.log('    ' + b[0].padEnd(18) + b[1].padEnd(36) + ' +' + b[2] + ' over our pick for ' + b[4] + ', players add ' + pct(b[3])));
console.log('  guide cuts (nonland, in deck) we also cut: ' + tot.cutHit + ' of ' + tot.cuts + ' (' + pct(tot.cutHit / tot.cuts) + '); our first 12 cuts a guide also cuts: ' + tot.ourCutGuide + ' of ' + tot.ourCuts);
console.log('  score change: guide\'s own swaps avg ' + mean(tot.gPair).toFixed(2) + ' (' + tot.gPair.filter(v => v > 0).length + ' of ' + tot.gPair.length + ' raise it) | our first 10 Apex picks avg ' + mean(tot.ourPick).toFixed(2));
