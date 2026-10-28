const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const pd = H.retail('doom-prevails'); H.edh(pd.commander); X.__d = pd;
let t = Date.now();
const R = run('(() => { const R = upgradePaths(__d); return R.paths.slice(0, 5).map(L => Object.entries(L.opts).filter(([t]) => t !== "free").map(([t, p]) => ({t, cut:p.cut, add:p.add, p:find(p.add).p, alts:altsFor(__d, p.add, {cut:p.cut, val:R.valOf, skip:[]})}))); })()');
console.log('upgrade alts', Date.now() - t, 'ms'); R.flat().forEach(x => console.log(x.t, x.cut, '->', x.add, '$' + x.p, '|', x.alts.map(a => a.n + ' $' + a.p + ' ' + a.close).join('; ')));
// generated plan
const g = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(d, __d.commander); d.aims = ctxOf(d).cmdThemes.slice(0, 3); d.plan = buildPlan(d, [], null, new Set()); return d; })()`);
X.__g = g; t = Date.now();
const P = run('__g.plan.filter(x => !x.basic).slice(0, 14).map(x => ({a:x.a, p:find(x.a).p, alts:altsFor(__g, x.a, {deck:__g.plan.map(y => ({n:y.a, q:y.q}))})}))');
console.log('plan alts', Date.now() - t, 'ms'); P.forEach(x => console.log(x.a, '$' + x.p, '|', x.alts.map(a => a.n + ' $' + a.p + ' ' + a.close).join('; ')));
