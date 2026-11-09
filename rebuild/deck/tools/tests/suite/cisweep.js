// Every card the app suggests or builds must sit inside the commander's colour identity (with a partner, the pair's).
const PAR = require('./par.js');
const out = r => { console.log({decks:r.decks, cardsChecked:r.cards, outsideIdentity:r.bad.length}); r.bad.slice(0, 20).forEach(x => console.log('  ' + x)); console.log('Don & Leo (WU) and Koya (WB):', JSON.stringify(r.k)); };
if (PAR.fan(P => out({decks:P.reduce((a, x) => a + x.decks, 0), cards:P.reduce((a, x) => a + x.cards, 0), bad:P.flatMap(x => x.bad).sort((a, b) => a[0] - b[0]).map(x => x[1]), k:P.find(x => x.k).k}))) return;
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const slugs = ['abzan-armor', 'animated-army', 'calling-all-angels', 'counter-blitz', 'death-toll', 'endless-punishment', 'family-matters', 'fantastic-four', 'grand-larceny', 'jeskai-striker', 'keen-engineering', 'limit-break', 'mardu-surge', 'most-wanted', 'reign-of-dragons', 'revival-trance', 'scions-spellcraft', 'squirreled-away', 'sultai-arisen', 'temur-roar', 'wretched-ranks', 'avengers-assemble', 'doom-prevails', 'tramplesaurus-rex', 'turtle-power', 'wakanda-forever'];
let decks = 0, cards = 0, bad = [];
let si = 0;
const check = (label, id, names) => names.forEach(n => { const c = run('find(' + JSON.stringify(n) + ')'); cards++; if (c && !c.ci.every(k => id.includes(k))) bad.push([si, label + ': ' + n + ' (' + c.ci.join('') + ' outside ' + id.join('') + ')']); });
for (const [i, s] of slugs.entries()){ if (!PAR.mine(i)) continue; si = i; const d = H.retail(s); H.edh(d.commander); X.__d = d; decks++;
  const r = run(`(() => { const id = ctxOf(__d).ident, own = [find(__d.commander), __d.partner && find(__d.partner)].filter(Boolean), union = [...new Set(own.flatMap(c => c.ci))].sort().join('');
    const R = upgradePaths(__d), ups = R.paths.flatMap(L => Object.values(L.opts).map(o => o.add)).concat(R.fixes.map(p => p.add));
    const alts = R.paths.slice(0, 6).flatMap(L => Object.values(L.opts).flatMap(p => altsFor(__d, p.add, {cut:p.cut, val:R.valOf}).map(a => a.n)));
    const g = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(g, __d.commander); if (__d.partner) g.partner = __d.partner; g.aims = ctxOf(g).cmdThemes.slice(0, 3);
    const P = buildPlan(g, [], null, new Set()); return {id, union, idOk:id.slice().sort().join('') === union, ups, alts, plan:P.flatMap(x => [x.a, x.m, x.b]).filter(Boolean), gid:ctxOf(g).ident}; })()`);
  if (!r.idOk) bad.push([i, s + ': deck identity ' + r.id.join('') + ' is not the commander identity ' + r.union]);
  check(s + ' upgrade', r.id, r.ups); check(s + ' alternative', r.id, r.alts); check(s + ' generated', r.gid, r.plan); }
// Koya: never offered to a white-blue Don & Leo deck; allowed for a white-black commander
X.__k = 0; const k = !PAR.first() ? null : run(`(() => { const g = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(g, 'Don & Leo, Problem Solvers'); g.aims = ctxOf(g).cmdThemes.slice(0, 3);
  const P = buildPlan(g, [], null, new Set()), names = P.flatMap(x => [x.a, x.m, x.b]); addCard(g, 'Koya, Death from Above', 1); return {inPlan:names.includes('Koya, Death from Above'), flagged:validateDeck(g).map(v => v.key + (v.card ? ':' + v.card : ''))}; })()`);
if (PAR.part) PAR.emit({decks, cards, bad, k}); else out({decks, cards, bad:bad.map(x => x[1]), k});
