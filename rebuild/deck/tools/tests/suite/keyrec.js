// How predictable are the swaps scoreCheck measures? Per call: total keys, how many are phase-1 (the list's own picks), how many the previous call also measured.
const path = require('path'), [, , dir, slug, tier] = process.argv; const H = require('./h.js')(path.resolve(dir)), X = H.ctx, run = H.run;
const pd = H.retail(slug || 'abzan-armor'); H.edh(pd.commander); X.__n = pd.commander; X.__tier = tier || 'budget';
run(`(() => { globalThis.__K = []; const sc = scoreCheck, s2 = swapScore2; let cur = null;
  scoreCheck = function(d, R){ const p1 = new Set(); R.paths.forEach(L => Object.values(L.opts).forEach(p => p && p1.add(p.cut + '>' + p.add + '>' + (p.q || 1)))); cur = {p1, keys:[]}; __K.push(cur); try { return sc.apply(this, arguments); } finally { cur = null; } };
  swapScore2 = function(d, b, a, cut, add, q){ if (cur) cur.keys.push(cut + '>' + add + '>' + (q || 1)); return s2.apply(this, arguments); }; })()`);
run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n);
  const E = EDH, t = (E.tags || []).filter(x => E.tmap && E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug);
  genDeck(d, [], null, new Set(), __tier); return 1; })()`);
const K = run('__K'); let prev = new Set();
K.forEach((c, i) => { const ks = c.keys, u = new Set(ks); const inP1 = [...u].filter(k => c.p1.has(k)).length, inPrev = [...u].filter(k => prev.has(k)).length, either = [...u].filter(k => prev.has(k) || c.p1.has(k)).length;
  console.log('call', i, 'measured', u.size, '| phase-1 known', inP1, '| measured last call too', inPrev, '| either', either, '(' + Math.round(100 * either / u.size) + '%)'); prev = u; });
