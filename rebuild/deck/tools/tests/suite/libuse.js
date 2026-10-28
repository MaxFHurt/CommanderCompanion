// Which library-wide reads happen while one swap is measured (swapScore2)? Decides whether a helper core can work with a small slice of the cards.
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const d = H.retail(process.argv[3] || 'abzan-armor'); H.edh(d.commander); X.__d = d;
run(`(() => { globalThis.__AR = JSON.parse(JSON.stringify(apexRef(__d))); globalThis.__R = upgradePaths(__d); globalThis.__keys = __R.paths.flatMap(L => ['apex','mid','budget'].map(t => L.opts[t]).filter(Boolean).map(p => [p.cut, p.add, p.q])); })()`);
const H2 = require('./h.js')(path.resolve(process.argv[2])); H2.edh(d.commander); H2.ctx.__d = d; H2.ctx.__AR = run('__AR'); H2.ctx.__keys = run('__keys');
H2.run(`(() => { const real = LIB, sites = globalThis.__S = new Map(); let on = false; globalThis.__on = v => on = v;
  LIB = new Proxy(real, {get(t, p){ if (on && typeof p === 'string' && p !== 'length'){ const s = new Error().stack.split('\\n').slice(2, 6).map(x => x.trim().replace(/^at /, '').replace(/\\(.*?:(\\d+):\\d+\\)/, ':$1')).join(' < '); sites.set(s, (sites.get(s) || 0) + 1); } return t[p]; }});
  const ix = IDX; IDX = new Proxy(ix, {get(t, p){ const v = t[p]; if (on && p === 'get') return k => { (globalThis.__K || (globalThis.__K = new Set())).add(k); return t.get(k); }; return typeof v === 'function' ? v.bind(t) : v; }}); })()`);
H2.run(`(() => { __on(true); const B = evaluateDeck(__d, {apex:__AR, games:300}); for (const [c, a, q] of __keys) swapScore2(__d, B, __AR, c, a, q); __on(false); return 1; })()`);
const S = H2.run('[...__S.entries()]'); console.log('library reads during swap measurements:', S.length ? '' : 'none'); S.sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([s, n]) => console.log(n, s));


console.log('distinct names looked up:', H2.run('__K ? __K.size : 0'), '| deck', d.cards.length, '| edh map', H2.run('EDH.map ? EDH.map.size : 0'), '| combos', H2.run('COMBOS.list.length'));
console.log('in EDH map:', H2.run('[...__K].filter(k => EDH.map && EDH.map.has(k)).length'));
