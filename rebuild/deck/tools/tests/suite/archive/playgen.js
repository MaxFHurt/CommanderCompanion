// Exploratory: generate for many commanders (no play data for most), check legality, size, errors, timing, evaluator.
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
run("EDH={key:'',map:null,decks:0,state:'fail',pre:null,tags:[],tmap:{}}");
const special = [['Kozilek, the Great Distortion'], ['Karn, Living Legacy'], ['Kenrith, the Returned King'], ['Thrasios, Triton Hero', 'Tymna the Weaver'], ['Wilson, Refined Grizzly', 'Raised by Giants'], ['The Fourteenth Doctor', 'Rose Tyler'], ['Teferi, Temporal Archmage'], ['Atraxa, Praetors\' Voice'], ['Krenko, Mob Boss'], ['Edgar Markov'], ['Urza, Lord High Artificer'], ['Niv-Mizzet, Parun'], ['Sliver Overlord'], ['General Ferrous Rokiric'], ['Jodah, the Unifier'], ['Ghalta, Primal Hunger'], ['Esika, Chariot of the Gods'], ['Sisay, Weatherlight Captain'], ['Tergrid, God of Fright // Tergrid\'s Lantern'], ['Prossh, Skyraider of Kher'], ['Lord Windgrace'], ['Yarok, the Desecrated'], ['Rhys the Redeemed'], ['Isshin, Two Heavens as One'], ['Light-Paws, Emperor\'s Voice'], ['Ellivere of the Wild Court'], ['Sythis, Harvest\'s Hand'], ['Talrand, Sky Summoner'], ['Purphoros, God of the Forge'], ['Kaalia of the Vast']];
const rnd = (() => { let a = 99; return () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648; })();
const legends = run('LIB.filter(c => canLead(c) && c.cmd && !pairKind(c)).map(c => c.n)'); for (let i = 0; i < 35; i++) special.push([legends[Math.floor(rnd() * legends.length)]]);
let bad = 0, rows = [];
for (const [cmd, par] of special){
  const c = X.find(cmd); if (!c){ console.log('MISSING', cmd); continue; }
  X.__n = c.n; X.__p = par || ''; const t0 = Date.now(); let r;
  try { r = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n);
      if (__p){ if (!setPartner(d, __p)) return {err:'partner refused'}; }
      if (!d.aims.length) d.aims = ['tokens'];
      const plan = buildPlan(d, [], null, new Set()), deck = JSON.parse(JSON.stringify(d)); deck.cards = []; plan.forEach(s => addCard(deck, s.a, s.q));
      const A = analyze(deck), v = validateDeck(deck).map(x => x.key + ':' + (x.card || '')), tiers = ['mid', 'budget'].map(t => { const dd = JSON.parse(JSON.stringify(d)); dd.cards = []; plan.forEach(s => addCard(dd, planPick(s, t), s.q)); return validateDeck(dd).length; });
      const e = evaluateDeck(deck, {games:100}); const R = upgradePaths(deck);
      return {size:A.size, lands:A.lands, v, tiers, total:e.total, parts:e.parts, aims:d.aims, ident:ctxOf(d).ident.join(''), stuck:e.sim.colourStuck, cmdT:e.sim.cmdMedianTurn, paths:R.paths.length, partner:d.partner || ''}; })()`); }
  catch (err){ r = {err:err.message + ' @ ' + (err.stack || '').split('\n')[1]}; }
  const ms = Date.now() - t0; const fail = r.err || r.size !== 100 || r.v.length || r.tiers.some(x => x) || (par && !r.partner);
  if (fail) bad++;
  console.log((fail ? 'BAD ' : 'ok  ') + cmd.slice(0, 30).padEnd(31) + (par ? '+ ' + par.slice(0, 18).padEnd(19) : ''.padEnd(21)) + JSON.stringify(r.err ? r : {size:r.size, lands:r.lands, ident:r.ident, v:r.v.slice(0, 3), tiers:r.tiers, total:r.total, stuck:r.stuck, cmdT:r.cmdT, paths:r.paths}) + ' ' + ms + 'ms');
}
console.log('\nBAD', bad, 'of', special.length);
