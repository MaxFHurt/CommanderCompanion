// Build 145: is a no-data build with fallback pages the same every time? node fallrep.js <dir> <commander>
const path = require('path'), fs = require('fs'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run, name = process.argv[3] || 'Kenrith, the Returned King';
X.__n = name; const T = run('fallTags(__n)'), TD = path.resolve(__dirname, '../data2/tags');
X.__fall = T.map(t => { const f = path.join(TD, t.path.replace(/\//g, '_') + '.json'); return fs.existsSync(f) && fs.statSync(f).size > 500 ? [t.label, t.path, JSON.parse(fs.readFileSync(f))] : null; }).filter(Boolean);
run("EDH = {key:find(__n).n, map:null, decks:0, state:'fail', tags:[], tmap:{}, fall:__fall.map(([label, slug, j]) => ({label, slug, map:parseTag(j)}))}");
const gen = t => run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); genDeck(d, [], null, new Set(), '${t}'); return d.cards.map(e => e.n + 'x' + e.q).sort(); })()`);
const a = gen(process.env.TIER || 'mid'), b = gen(process.env.TIER || 'mid');
console.log('pages', T.map(t => t.path).join(', '), '| same both times:', a.join() === b.join(), '| first only:', a.filter(x => !b.includes(x)).slice(0, 6).join('; '), '| commander in deck:', a.some(x => x.startsWith(name)) || b.some(x => x.startsWith(name)));
