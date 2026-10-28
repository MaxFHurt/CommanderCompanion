const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const d = H.retail('limit-break'); H.edh(d.commander); X.__d = d;
console.log(run(`(() => { const R = upgradePaths(__d), p = R.paths[0].opts.apex, VM = new Map(); let t = Date.now(); altsFor(__d, p.add, {cut:p.cut, val:R.valOf, all:true, vmemo:VM}); const a = Date.now() - t; t = Date.now(); altsFor(__d, p.add, {cut:p.cut, val:R.valOf, all:true, vmemo:VM}); const b = Date.now() - t;
  t = Date.now(); for (let i = 0; i < 300; i++) R.valOf(LIB[i * 7]); const v = (Date.now() - t) / 300; t = Date.now(); const ctx = ctxOf(__d); for (let i = 0; i < 300; i++) matchAim(LIB[i * 7], __d.aims[0], ctx.tribe); const m = (Date.now() - t) / 300;
  t = Date.now(); for (let i = 0; i < 20; i++) ctxOf(JSON.parse(JSON.stringify(__d))); const cx = (Date.now() - t) / 20; return JSON.stringify({first:a, second:b, valMs:v, matchMs:m, ctxMs:cx, pool:altsFor.pool.L.length}); })()`));
