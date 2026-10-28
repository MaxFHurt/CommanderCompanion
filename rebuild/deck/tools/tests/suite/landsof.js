// The lands a generated deck runs. node landsof.js <engineDir> "<commander>"   NOEDH=1, UP='{...}'
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const cmd = process.argv[3]; H.edh(cmd); if (process.env.NOEDH) run("EDH={key:'',map:null,decks:0,state:'fail'}"); X.__n = cmd;
const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); return d; })()`);
X.__d = nd; const plan = run('buildPlan(__d, [], null, new Set())'), tg = run('tags');
console.log(cmd, '| lands:', plan.filter(s => { const c = X.find(s.a); return c && tg(c).land; }).map(s => (s.q > 1 ? s.q + ' ' : '') + s.a).join(', '));
