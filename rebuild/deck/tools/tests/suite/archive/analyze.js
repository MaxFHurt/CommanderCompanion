// Build analysis (buildThemes, deckColors, findCommanders) on hand-built decks.
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const show = (name, d) => { X.__d = d; const b = run('buildThemes(__d)'); console.log(name.padEnd(36), JSON.stringify({suggest:b.suggest, edh:b.edh.slice(0, 3).map(x => x.label + ' ' + x.n), gen:b.gen.slice(0, 4).map(x => x.label + ' ' + x.n)})); return b; };
const pd = H.retail('doom-prevails'); H.edh(pd.commander); console.log('Doom theme pages loaded', Object.keys(run('EDH').tmap).length, 'of', run('EDH').tags.length);
const hand = JSON.parse(JSON.stringify(pd)); hand.aims = []; hand.cards = hand.cards.slice(0, 45); show('Doom, 45 hand-picked cards, no build', hand);
const full = JSON.parse(JSON.stringify(pd)); full.aims = []; show('Doom, full precon, no build', full);
const nocmd = JSON.parse(JSON.stringify(pd)); nocmd.commander = ''; nocmd.aims = []; nocmd.cards = nocmd.cards.slice(0, 50); X.__d = nocmd;
console.log('No commander, 50 cards'.padEnd(36), JSON.stringify(run('(() => { const c = deckColors(__d); return {colors:c.join(""), commanders:findCommanders(__d, c, 5).map(x => x.n + (x.outside ? " (" + x.outside + " off-colour)" : ""))}; })()')));
for (const s of ['tramplesaurus-rex', 'turtle-power', 'squirreled-away']){ const p = H.retail(s); H.edh(p.commander); const g = JSON.parse(JSON.stringify(p)); g.aims = []; show(p.commander.split(',')[0] + ' precon, no build', g); }
X.__s = {id:'s', name:'s', format:'standard', commander:'', tier:'budget', aims:[], tribe:'', colors:['R'], cards:[{n:'Mountain', q:20}, {n:'Lightning Strike', q:4}, {n:'Monastery Swiftspear', q:4}, {n:'Play with Fire', q:4}, {n:'Kumano Faces Kakkazan', q:4}], dismissed:[]};
console.log('Standard red, 36 cards'.padEnd(36), JSON.stringify(run('buildThemes(__s).suggest')), 'rules:', JSON.stringify(run('validateDeck(__s).map(x => x.key)')));
X.__e = {id:'e', name:'e', format:'commander', commander:'', tier:'budget', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; console.log('Empty deck'.padEnd(36), JSON.stringify(run('buildThemes(__e)')));
