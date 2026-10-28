const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const n = run('find("Don & Leo, Problem Solvers") && find("Don & Leo, Problem Solvers").n'); console.log('cmd', n); H.edh(n);
for (const aims of [null, ['blink', 'artifacts']]){
  X.__a = aims; const r = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(d, ${JSON.stringify(n)}); if (__a) d.aims = __a; else d.aims = ctxOf(d).cmdThemes.slice(0, 3);
    const P = buildPlan(d, [], null, new Set()); return {aims:d.aims, slots:P.length, total:P.reduce((s, x) => s + x.q, 0), basics:P.filter(x => x.basic).map(x => x.a + ' ' + x.q), size:analyze(d).T.size}; })()`); console.log(JSON.stringify(r)); }
