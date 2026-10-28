const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
run("(()=>{const m=new Map();LIB.forEach(c=>{if(!c.sc)return;if(!m.has(c.sc))m.set(c.sc,new Set());m.get(c.sc).add(c._n)});SETCARDS=m;})()");
const base = H.retail('avengers-assemble'); H.edh(base.commander);
const cases = {
  'unknown + off-colour + dupes + 110 cards': d => { d.cards.push({n:'Totally Fake Card', q:1}, {n:'Llanowar Elves', q:1}, {n:'Sol Ring', q:3}); for (let i = 0; i < 6; i++) d.cards.push({n:'Plains', q:1}); },
  '60 cards only': d => { d.cards = d.cards.slice(0, 40); },
  'commander only': d => { d.cards = []; },
  'all basics': d => { d.cards = [{n:'Plains', q:33}, {n:'Island', q:33}, {n:'Mountain', q:33}]; },
  'set rule, set with no fitting cards': d => { d.sets = ['zzz']; d.setsMust = true; },
  'set rule, empty deck fill': d => { d.cards = []; d.sets = ['blb']; d.setsMust = true; },
};
for (const [name, f] of Object.entries(cases)){
  const d = JSON.parse(JSON.stringify(base)); f(d); X.__d = d; let out = {};
  for (const step of ['analyze(__d).size', 'validateDeck(__d).map(x => x.key).join()', 'evaluateDeck(__d, {games:50}).total', 'upgradePaths(__d).paths.length', 'weakHere(__d).length', 'combosOf(__d, ctxOf(__d).ident).full.length', 'manaPlan(__d).off', 'JSON.stringify(recommend(__d, 0, true).adds.reduce((a, x) => a + x.q, 0))']){
    try { out[step.split('(')[0]] = run(step); } catch (e) { out[step.split('(')[0]] = 'THROW ' + e.message; } }
  console.log(name.padEnd(42), JSON.stringify(out));
}
// generation with a set rule that yields nothing
X.__n = base.commander; const r = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[], sets:['zzz'], setsMust:true}; setCommander(d, __n); const p = buildPlan(d, [], null, new Set()); return {slots:p.reduce((a, x) => a + x.q, 0), lands:p.filter(x => x.land).reduce((a, x) => a + x.q, 0)}; })()`);
console.log('generate, set rule with no cards:', JSON.stringify(r));
// standard deck evaluate / upgrade
X.__s = {id:'s', name:'s', format:'standard', commander:'', tier:'budget', aims:['aggro'], tribe:'', colors:['R'], cards:[{n:'Mountain', q:20}], dismissed:[]};
try { console.log('standard fill', run('fillDeck(__s)'), 'size', run('analyze(__s).size'), 'evaluate', run('evaluateDeck(__s,{games:20}).total'), 'paths', run('upgradePaths(__s).paths.length')); } catch (e) { console.log('standard THROW', e.message); }
