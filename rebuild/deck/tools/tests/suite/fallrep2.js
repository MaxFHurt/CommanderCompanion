// Page vs worker for a no-data build: a fresh engine fed clean copies of the library and play data, like work.js.
const path = require('path'), fs = require('fs'), vm = require('vm'), dir = path.resolve(process.argv[2]), H = require('./h.js')(dir), X = H.ctx, run = H.run, name = 'Kenrith, the Returned King';
X.__n = name; const T = run('fallTags(__n)'), TD = path.resolve(__dirname, '../data2/tags');
X.__fall = T.map(t => { const f = path.join(TD, t.path.replace(/\//g, '_') + '.json'); return [t.label, t.path, JSON.parse(fs.readFileSync(f))]; });
run("EDH = {key:find(__n).n, map:null, decks:0, state:'fail', tags:[], tmap:{}, fall:__fall.map(([label, slug, j]) => ({label, slug, map:parseTag(j)}))}");
const G = `(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); genDeck(d, [], null, new Set(), 'mid'); return d.cards.map(e => e.n + 'x' + e.q).sort(); })()`;
const page = run(G);
const v8 = require('v8'), clone = x => v8.deserialize(v8.serialize(x));
const rows = clone(run('LIB.map(c => { const x = {}; for (const k in c) if (k[0] !== "_") x[k] = c[k]; return x; })')), edh = clone(run('(() => { const v = {}; for (const k in EDH) if (k !== "wait" && k[0] !== "_" && typeof EDH[k] !== "function") v[k] = EDH[k]; return v; })()'));
const cj = clone(run('typeof __cj !== "undefined" ? __cj : null'));
const ctx = vm.createContext({console, Math, JSON, Set, Map, Date, RegExp, Object, Array, String, Number, Infinity, isNaN, parseFloat, parseInt, Error});
for (const f of (() => { const F = JSON.parse(fs.readFileSync(path.join(dir, 'files.json'), 'utf8')); return F.data.concat(F.engine); })()) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, {filename:f});
ctx.__rows = rows; ctx.__edh = edh; ctx.__n = name; ctx.__combos = clone(run('COMBOS')); ctx.__bt = clone(run('BTAGS')); ctx.__up = clone(run('UP'));
vm.runInContext('buildIndex(__rows); COMBOS = __combos; BTAGS = __bt; Object.assign(UP, __up); EDH = __edh;', ctx);
const work = vm.runInContext(G, ctx);
console.log('page vs fresh engine: only page', page.filter(x => !work.includes(x)).length, '| only fresh', work.filter(x => !page.includes(x)).slice(0, 6).join('; '));
