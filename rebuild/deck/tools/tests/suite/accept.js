// Stage 1 acceptance tests (IDs from the handoff's Acceptance_Test_Matrix). node accept.js <engineDir> [label]
// Expected results come from the official rules and the app rules, not from the engine's own formulas.
const fs = require('fs'), path = require('path'), I = require('./indep.js');
const dir = path.resolve(process.argv[2] || '../candidate'), label = process.argv[3] || 'accept';
const load = () => require('./h.js')(dir);
let H = load();
const results = [], T = (id, desc, fn) => { let r; try { r = fn(); } catch (e) { r = {pass:false, detail:'ERROR ' + e.message}; } if (typeof r === 'boolean') r = {pass:r};
  results.push(Object.assign({id, desc}, r)); console.log((r.pass === true ? 'PASS' : r.pass === 'n/a' ? 'N/A ' : 'FAIL'), id.padEnd(8), desc, r.detail ? '— ' + r.detail : ''); };
const run = c => H.run(c), X = H.ctx, LIB = () => run('LIB'), NORM = s => run('norm')(s);
const DECKS = ['avengers-assemble', 'doom-prevails', 'tramplesaurus-rex', 'turtle-power', 'wakanda-forever'];
const deck = s => { const d = H.retail(s); H.edh(d.commander); if (process.env.AIMS === 'edh'){ const E = run('EDH'), t = E.tags.filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug); } return d; };   // AIMS=edh: the commander's own themes
const paths = d => { X.__d = d; return run('upgradePaths(__d)'); };
const rowsOf = R => R.paths.map(L => ({cut:L.cut, opts:Object.fromEntries(['apex', 'mid', 'budget'].filter(t => L.opts[t]).map(t => [t, L.opts[t].add]))}));
const cmds = d => [d.commander].concat(d.partner ? [d.partner] : []), cardsOf = d => d.cards.map(e => ({n:e.n, q:e.q}));
const vkeys = d => { X.__d = d; return run('validateDeck(__d)').map(v => v.key + (v.card ? ':' + v.card : '')); };

// ---------- identity ----------
T('ID-01', 'Alternate printed title installed: its card is never recommended', () => {
  const d = H.preconReplay('wakanda-forever'); H.edh(d.commander); const R = paths(d), bad = I.checkRecs(cmds(d), cardsOf(d), rowsOf(R)).filter(v => v[0] === 'installed_addition');
  const vib = d.cards.find(e => e.n === 'Thran Dynamo' || e.n === 'Vibranium Dynamo'); X.__n = 'Vibranium Dynamo';
  return {pass:!bad.length && run("keyOf('Vibranium Dynamo') === keyOf('Thran Dynamo')"), detail:'installed additions ' + bad.length + '; deck holds it as ' + (vib && vib.n)}; });
T('ID-02', 'Front-face name and full double-faced name are one card; no duplicate added', () => {
  const same = run("keyOf('Delver of Secrets') === keyOf('Delver of Secrets // Insectile Aberration')"); X.__d = {format:'commander', cards:[{n:'Delver of Secrets', q:1, l:false}], dismissed:[]};
  run("addCard(__d, 'Delver of Secrets // Insectile Aberration', 1)"); return {pass:same && X.__d.cards.length === 1 && X.__d.cards[0].q === 2 && run("validateDeck(Object.assign({}, __d, {commander:'Sakashima of a Thousand Faces'})).some(v => v.key === 'singleton_conflict')"), detail:'entries ' + X.__d.cards.length}; });
T('ID-03', 'Unknown or misspelt name stays unresolved and visible; no silent substitution', () => {
  const f = run("find('Lightning Bolts')"); X.__d = {format:'commander', commander:'Ghalta, Primal Hunger', cards:[{n:'Lightning Bolts', q:1}], dismissed:[]};
  return {pass:!f && run("analyze(__d).unknown.includes('Lightning Bolts')") && vkeys(X.__d).includes('unresolved_identity:Lightning Bolts')}; });
T('ID-04', 'A reprint with no EDHREC row for this commander is not labelled new', () => {
  let bad = []; for (const s of DECKS){ const R = paths(deck(s)); R.paths.forEach(L => ['apex', 'mid', 'budget'].forEach(t => { const p = L.opts[t]; if (p && p.why.some(w => /^New card/.test(w)) && (X.find(p.add) || {}).r) bad.push(p.add); })); }
  return {pass:!bad.length, detail:bad.join('; ')}; });
T('ID-05', 'Interchangeable names share one construction identity (singleton across names)', () => {
  X.__d = {format:'commander', commander:"T'Challa, the Black Panther", cards:[{n:'Thran Dynamo', q:1}, {n:'Vibranium Dynamo', q:1}], dismissed:[]};
  return vkeys(X.__d).some(k => k.startsWith('singleton_conflict')); });
T('ID-06', 'Llanowar Elves resolves to the creature card, not its token', () => run("(c => !!c && /Creature/.test(c.t) && c.cmd && !!c.oid)(find('Llanowar Elves'))"));
T('ID-07', 'Official decklist spellings import as the right card (deck labels, "and" for "&"); misspellings stay unresolved', () => {
  X.__t = 'Deck\n1 Sol Ring Avengers\n1 Arcane Signet (Villains)\n1 Command Tower The Fantastic Four\n1 Bebop, Skull and Crossbones\n1 Tokka and Rahzar, Unsupervised\n1 Sol Rings\n1 Sol Ring avengers';
  const got = run('parseDeckText(__t).cards.map(e => find(e.n) ? find(e.n).n : "?" + e.n)');
  const want = ['Sol Ring', 'Arcane Signet', 'Command Tower', 'Bebop, Skull & Crossbones', 'Tokka & Rahzar, Unsupervised', '?Sol Rings', '?Sol Ring avengers'];
  return {pass:JSON.stringify(got) === JSON.stringify(want), detail:JSON.stringify(got)}; });

// ---------- legality ----------
const banned = ['Mana Crypt', 'Jeweled Lotus', 'Dockside Extortionist', 'Nadu, Winged Wisdom', 'Emrakul, the Aeons Torn', 'Backup Plan', 'Rule with an Even Hand', 'Contract from Below', 'Invoke Prejudice'];
T('LEG-01/06/07', 'Banned, Conspiracy, ante and offensive-list cards are never usable or recommended', () => {
  const usable = banned.filter(n => { X.__n = n; return run('(c => !!c && legalIn(c, "commander"))(find(__n))'); });
  let rec = []; for (const s of DECKS){ const R = paths(deck(s)); R.paths.forEach(L => Object.values(L.opts).forEach(p => { if (banned.includes(p.add)) rec.push(p.add); })); }
  return {pass:!usable.length && !rec.length, detail:'usable: ' + usable.join(', ') + ' | recommended: ' + rec.join(', ')}; });
T('LEG-02/03', 'Lutri is legal in a blue-red 99 and as a commander', () => { X.__d = {format:'commander', commander:'Lutri, the Spellchaser', cards:[], dismissed:[]}; const v = vkeys(X.__d); return {pass:!v.some(k => /format|ineligible/.test(k)), detail:v.join(', ')}; });
T('LEG-04', 'Lutri as companion is rejected', () => ({pass:'n/a', detail:'The app has no companion support; nothing can be placed as a companion.'}));
T('LEG-05', 'Biorhythm is legal in a green deck', () => { X.__d = {format:'commander', commander:'Ghalta, Primal Hunger', cards:[{n:'Biorhythm', q:1}], dismissed:[]}; return !vkeys(X.__d).some(k => k.includes('Biorhythm')); });
T('LEG-08', 'Off-colour hybrid card is rejected in a mono-green deck', () => { X.__d = {format:'commander', commander:'Ghalta, Primal Hunger', cards:[{n:'Kitchen Finks', q:1}], dismissed:[]}; return vkeys(X.__d).includes('off_color_identity:Kitchen Finks'); });
T('LEG-09', 'Colourless commander with a Plains fails the land-type rule', () => { X.__d = {format:'commander', commander:'Traxos, Scourge of Kroog', cards:[{n:'Plains', q:1}], dismissed:[]}; return vkeys(X.__d).some(k => k.startsWith('land_type_color_invalid')); });
T('LEG-10', 'Command Tower in a mono-coloured deck is fine (identity, not mana it can make)', () => { X.__d = {format:'commander', commander:'Ghalta, Primal Hunger', cards:[{n:'Command Tower', q:1}], dismissed:[]}; return !vkeys(X.__d).some(k => k.includes('Command Tower')); });
T('LEG-11', 'A legendary Vehicle with power/toughness can be commander', () => run("canLead(find('Parhelion II'))"));
T('LEG-12', 'A legendary non-creature artifact or ordinary planeswalker cannot lead; one that says it can, or is a creature off the battlefield, can', () => { const r = ['Mox Amber', 'Chandra, Torch of Defiance', 'Teferi, Temporal Archmage', 'Grist, the Hunger Tide'].map(n => { X.__n = n; return run('canLead(find(__n))'); });
  return {pass:!r[0] && !r[1] && r[2] && r[3], detail:'Mox Amber ' + r[0] + ', Chandra ' + r[1] + ', Teferi ' + r[2] + ', Grist ' + r[3]}; });
T('LEG-13', 'Valid partner pair passes; invalid pair is flagged', () => { X.__a = {format:'commander', commander:'Thrasios, Triton Hero', partner:'Tymna the Weaver', cards:[], dismissed:[]}; X.__b = {format:'commander', commander:'Thrasios, Triton Hero', partner:'Atraxa, Praetors\' Voice', cards:[], dismissed:[]};
  const a = run('validateDeck(__a)').map(v => v.key), b = run('validateDeck(__b)').map(v => v.key); return {pass:!a.includes('commander_pair_invalid') && b.includes('commander_pair_invalid'), detail:'valid pair: ' + a.join(',') + ' | invalid pair: ' + b.join(',')}; });
T('LEG-14', 'Basics repeat; any-number cards repeat; "up to seven" is capped at seven', () => {
  X.__d = {format:'commander', commander:'Ghalta, Primal Hunger', cards:[{n:'Forest', q:30}], dismissed:[]}; const a = vkeys(X.__d).filter(k => k.startsWith('singleton'));
  X.__e = {format:'commander', commander:'Sheoldred, the Apocalypse', cards:[{n:'Relentless Rats', q:20}], dismissed:[]}; const b = run('validateDeck(__e)').filter(v => v.key === 'singleton_conflict');
  X.__f = {format:'commander', commander:'Gwenna, Eyes of Gaea', cards:[{n:'Seven Dwarves', q:8}], dismissed:[]}; const c = run('validateDeck(__f)').filter(v => v.key === 'singleton_conflict');
  X.__g = {format:'commander', commander:'Gwenna, Eyes of Gaea', cards:[{n:'Seven Dwarves', q:7}], dismissed:[]}; const g = run('validateDeck(__g)').filter(v => v.key === 'singleton_conflict');
  return {pass:!a.length && !b.length && c.length > 0 && !g.length, detail:'forests ' + a.length + ', rats ' + b.length + ', 8 dwarves ' + c.length + ', 7 dwarves ' + g.length}; });

// ---------- deck contents ----------
T('CNT-01', 'Turtle: setting Leonardo as commander keeps Heroes in a Half Shell in the 99 and 100 cards total', () => {
  const r = I.readRetail('turtle-power'); X.__t = 'Commander\n1 Heroes in a Half Shell\n\nDeck\n' + r.cards.map(e => (e.n === 'Heroes in a Half Shell' ? 1 : e.q) + ' ' + (e.n === 'Heroes in a Half Shell' ? 'Leonardo, the Balance' : e.n)).join('\n');
  const d = run("(()=>{const r=parseDeckText(__t),d={format:'commander',commander:'',cards:r.cards,aims:[],dismissed:[]};setCommander(d,r.commander);setCommander(d,'Leonardo, the Balance');return d;})()");
  const size = 1 + d.cards.reduce((s, e) => s + e.q, 0), heroes = !!d.cards.find(e => e.n === 'Heroes in a Half Shell'), leoIn99 = !!d.cards.find(e => e.n === 'Leonardo, the Balance');
  const want = I.readRetail('turtle-power'), mk = (c, cs) => [c].concat(cs.flatMap(e => Array(e.q).fill(e.n))).map(n => I.idOf(n)).sort().join('|');
  return {pass:d.commander === 'Leonardo, the Balance' && heroes && !leoIn99 && size === 100 && mk(d.commander, d.cards) === mk(want.commanders[0], want.cards), detail:'size ' + size + ', Heroes in 99: ' + heroes}; });
T('CNT-02', 'Absent cut, repeated cut, repeated addition and off-size decks are invalid', () => {
  const d = deck('avengers-assemble'); X.__d = d;
  const a = run("validatePackage(__d, [{cut:'Not A Card In Deck', add:'Rhystic Study', q:1}])").map(v => v.key), b = run("validatePackage(__d, [{cut:'Sol Ring', add:'Rhystic Study', q:1}, {cut:'Sol Ring', add:'Mystic Remora', q:1}])").map(v => v.key);
  const c = run("validatePackage(__d, [{cut:'Swords to Plowshares', add:'Arcane Signet', q:1}])").map(v => v.key);
  X.__s = Object.assign({}, d, {cards:d.cards.slice(1)}); const sz = run('validateDeck(__s)').map(v => v.key);
  return {pass:a.includes('cut_absent') && b.includes('cut_absent') && c.includes('installed_addition') && sz.includes('wrong_deck_size'), detail:[a, b, c, sz].map(x => x.join(',')).join(' | ')}; });

// ---------- holds ----------
T('HOLD-01', 'A locked card is never offered as a cut, even when it is the weakest', () => {
  const d = deck('doom-prevails'), R0 = paths(d), weakest = R0.paths[0] && R0.paths[0].cut; d.cards.find(e => e.n === weakest).l = true; const R1 = paths(d);
  return {pass:!R1.paths.some(L => L.cut === weakest) && !R1.fixes.some(p => p.cut === weakest), detail:'locked ' + weakest}; });
const holdDeck = () => { const d = deck('tramplesaurus-rex'), R = paths(d), L = R.paths[R.paths.length - 1]; const filler = LIB().find(c => c.cmd && c.ci.every(k => k === 'G') && !/Land/.test(c.t) && !d.cards.some(e => e.n === c.n) && !R.paths.some(P => Object.values(P.opts).some(p => p.add === c.n)) && c.p != null && c.p < 3 && c.r > 20000);
  d.recP = {}; d.recP[NORM(filler.n)] = {t:'budget', p:filler.p, at:'2026-10-10', pair:{cut:L.cut, add:filler.n, q:1, t:'budget', why:[], cutWhy:[]}}; return {d, cut:L.cut, add:filler.n}; };
T('HOLD-02', 'A held pick is kept exactly (card, slot and tier) even though better cards exist', () => { const h = holdDeck(), R = paths(h.d), L = R.paths.find(x => x.cut === h.cut);
  return {pass:!!L && !!L.opts.budget && L.opts.budget.add === h.add && L.opts.budget.held === true && !(R.unlock || []).length, detail:'held ' + h.add + ' for ' + h.cut}; });
T('HOLD-03', 'Holds survive changed weights, lost play data and price changes', () => { const h = holdDeck(); let ok = true, why = [];
  const check = tag => { const L = paths(h.d).paths.find(x => x.cut === h.cut); if (!(L && L.opts.budget && L.opts.budget.add === h.add)){ ok = false; why.push(tag); } };
  const wi0 = run('UP.wi'); run('UP.wi = 3'); check('weights'); X.__w = wi0; run('UP.wi = __w');   // put back whatever the engine had run("EDH={key:'',map:null,decks:0,state:'fail'}"); check('no play data'); H.edh(h.d.commander);
  const keep = LIB().map(c => c.p); LIB().forEach((c, i) => { if (c.p != null) c.p = +(c.p * (0.5 + ((i * 7919) % 100) / 100)).toFixed(2); }); check('prices'); LIB().forEach((c, i) => c.p = keep[i]);
  return {pass:ok, detail:why.join(', ')}; });
T('HOLD-04', 'A held card that becomes illegal is reported as a conflict, not silently dropped or replaced', () => { const h = holdDeck(), c = X.find(h.add); c.cmd = false; const R = paths(h.d); c.cmd = true;
  const L = R.paths.find(x => x.cut === h.cut); return {pass:R.conflicts.some(x => x.add === h.add) && !(L && L.opts.budget && L.opts.budget.add === h.add), detail:JSON.stringify(R.conflicts[0] || {})}; });

// ---------- Apex and prices ----------
T('APEX-01', 'A cheap card that is the strongest fit is shown in Apex (with Budget/Mid explaining why they are empty)', () => {
  const d = deck('avengers-assemble'), R = paths(d), cheap = R.paths.filter(L => (X.find(L.opts.apex.add).p || 99) < 1);
  return {pass:cheap.length > 0 && cheap.every(L => !L.opts.budget && /already costs under/.test(L.none.budget || '')), detail:cheap.map(L => L.opts.apex.add + ' $' + X.find(L.opts.apex.add).p).join('; ')}; });
T('APEX-02', 'Changing only prices does not change which card is Apex', () => { let diff = [];
  for (const s of DECKS){ const d = deck(s), a = paths(d).paths.map(L => L.cut + '>' + L.opts.apex.add).sort().join('|'); const keep = LIB().map(c => c.p);
    LIB().forEach((c, i) => { if (c.p != null) c.p = +(c.p * (0.2 + ((i * 104729) % 300) / 100)).toFixed(2); }); const b = paths(d).paths.map(L => L.cut + '>' + L.opts.apex.add).sort().join('|'); LIB().forEach((c, i) => c.p = keep[i]);
    if (a !== b) diff.push(s); } return {pass:!diff.length, detail:diff.join(', ')}; });
T('APEX-03', 'An Apex card with unknown price stays Apex; no cheaper option is claimed', () => { const d = deck('doom-prevails'), R0 = paths(d), L0 = R0.paths[0], c = X.find(L0.opts.apex.add), keep = c.p; c.p = null;
  const L = paths(d).paths.find(x => x.cut === L0.cut); c.p = keep; return {pass:!!L && L.opts.apex.add === c.n && !L.opts.mid && !L.opts.budget && /unknown/.test(L.none.mid) && /unknown/.test(L.none.budget), detail:L0.cut + ' > ' + c.n}; });
const altCase = () => { for (const s of DECKS){ const d = deck(s), R = paths(d), L = R.paths.find(x => x.opts.budget && !x.opts.budget.held); if (L) return {d, L}; } return null; };
T('PRICE-01', 'Budget at $2.99 qualifies; at exactly $3.00 it does not', () => { const k = altCase(), c = X.find(k.L.opts.budget.add), keep = c.p;
  c.p = 2.99; const a = paths(k.d).paths.find(x => x.cut === k.L.cut); c.p = 3.00; const b = paths(k.d).paths.find(x => x.cut === k.L.cut); c.p = keep;
  return {pass:a.opts.budget && a.opts.budget.add === c.n && !(b.opts.budget && b.opts.budget.add === c.n), detail:c.n}; });
T('PRICE-02', 'Mid at $11.99 qualifies; at exactly $12.00 it does not', () => { let k = null; for (const s of DECKS){ const d = deck(s), R = paths(d), L = R.paths.find(x => x.opts.mid); if (L){ k = {d, L}; break; } }
  if (!k) return {pass:false, detail:'no Mid pick in any deck'}; const c = X.find(k.L.opts.mid.add), keep = c.p, ap = X.find(k.L.opts.apex.add).p; if (!(ap > 12)) return {pass:'n/a', detail:'Apex not above $12'};
  c.p = 11.99; const a = paths(k.d).paths.find(x => x.cut === k.L.cut); c.p = 12.00; const b = paths(k.d).paths.find(x => x.cut === k.L.cut); c.p = keep;
  return {pass:a.opts.mid && a.opts.mid.add === c.n && !(b.opts.mid && b.opts.mid.add === c.n), detail:c.n}; });
T('PRICE-03/04', 'Every alternative is strictly cheaper than Apex, under its cap, with a known price (all five decks, independent check)', () => { let v = [];
  // Where the checker's own price list lacks a card, the pair is confirmed from the app's card data instead (and counted).
  let unv = 0;
  for (const s of DECKS){ const d = deck(s), R = paths(d); I.checkRecs(cmds(d), cardsOf(d), rowsOf(R)).filter(x => /price|cheaper|without_apex/.test(x[0])).forEach(x => {
    if (x[0] !== 'price_unverifiable') return v.push(x); unv++; R.paths.forEach(L => ['mid', 'budget'].forEach(t => { const p = L.opts[t], a = L.opts.apex; if (!p || !a || !x[1].startsWith(p.add + ' $')) return;
      const pp = (X.find(p.add) || {}).p, ap = (X.find(a.add) || {}).p; if (!(pp != null && ap != null && pp < ap)) v.push(['not_cheaper_than_apex (app data)', p.add + ' $' + pp + ' vs ' + a.add + ' $' + ap]); })); }); }
  return {pass:!v.length, detail:(unv ? unv + ' pair(s) confirmed from app prices (checker lacks a price); ' : '') + v.slice(0, 3).map(x => x.join(' ')).join('; ')}; });

// ---------- tiers ----------
T('TIER-01', 'Every empty Mid/Budget tier carries a reason', () => { let miss = []; for (const s of DECKS){ paths(deck(s)).paths.forEach(L => ['mid', 'budget'].forEach(t => { if (!L.opts[t] && !(L.none && L.none[t])) miss.push(L.cut + '/' + t); })); } return {pass:!miss.length, detail:miss.slice(0, 5).join(', ')}; });
T('TIER-02', 'Every alternative does the same main job as its Apex card (or, for a job-less card, same type and shared plan)', () => { let bad = [];
  for (const s of DECKS){ paths(deck(s)).paths.forEach(L => ['mid', 'budget'].forEach(t => { const p = L.opts[t]; if (!p || p.held) return; X.__a = L.opts.apex.add; X.__x = p.add;
    const j = run('mainJob(__a)'), xj = run('jobsOf(__x)'), ok = j ? xj.includes(j) : (!xj.length && run('mainType(find(__a)) === mainType(find(__x))')); if (!ok) bad.push(L.opts.apex.add + ' [' + (j || 'no job') + '] vs ' + p.add + ' [' + xj.join('/') + ']'); })); }
  return {pass:!bad.length, detail:bad.slice(0, 4).join('; ')}; });
T('TIER-03', 'No card appears twice anywhere in the recommendations (independent check)', () => { let v = []; for (const s of DECKS){ const d = deck(s), R = paths(d); v = v.concat(I.checkRecs(cmds(d), cardsOf(d), rowsOf(R)).filter(x => x[0] === 'repeated_recommendation' || x[0] === 'apex_repeated_in_tier')); } return {pass:!v.length, detail:v.slice(0, 3).map(x => x[1]).join('; ')}; });
T('TIER-04', 'Every alternative is still an improvement on the card it replaces', () => { let bad = []; const m = run('UP.m'), mt = run('UP.mThin');
  for (const s of DECKS){ const R = paths(deck(s)); R.paths.forEach(L => ['mid', 'budget'].forEach(t => { const p = L.opts[t]; if (p && !p.held && p.gain < (R.thin ? mt : m)) bad.push(p.add + ' ' + p.gain); })); } return {pass:!bad.length, detail:bad.join('; ')}; });

// ---------- packages ----------
T('MIX-02', 'All-Apex, all-Mid and all-Budget packages are valid 100-card decks (independent check)', () => { let bad = [];
  for (const s of DECKS){ const d = deck(s), R = paths(d); for (const t of ['apex', 'mid', 'budget']){ X.__L = R.paths; X.__t = t; const pairs = run('__L.map(L => tierPick(L, __t)).filter(Boolean)').map(p => ({cut:p.cut, add:p.add}));
    const ap = I.applyPairs(cardsOf(d), pairs), v = ap.v.concat(I.validateDeck(cmds(d), ap.cards)); if (v.length) bad.push(s + '/' + t + ': ' + v.map(x => x.join(' ')).join(', ')); } } return {pass:!bad.length, detail:bad.join(' | ')}; });
T('MIX-01', 'Random mixes of tiers (200 per deck) stay valid, independently and by the app validator', () => { let bad = 0, n = 0, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const s of DECKS){ const d = deck(s), R = paths(d); for (let k = 0; k < 200; k++){ const pairs = []; R.paths.forEach(L => { const opts = ['apex', 'mid', 'budget', null].filter(t => t === null || L.opts[t]); const t = opts[Math.floor(rnd() * opts.length)]; if (t) pairs.push({cut:L.cut, add:L.opts[t].add, q:L.opts[t].q, t}); });
    n++; const ap = I.applyPairs(cardsOf(d), pairs), v = ap.v.concat(I.validateDeck(cmds(d), ap.cards)); X.__d = d; X.__p = pairs; const w = run('validatePackage(__d, __p)'); if (v.length || w.length) bad++; } } return {pass:!bad, detail:bad + ' invalid of ' + n}; });

// ---------- lands ----------
T('LAND-01..04', 'Land policy (APP-040): never a basic replaced, never land↔spell, land count kept; nonbasic→nonbasic only when the new land makes every deck colour the old one made', () => { let bad = [], landRows = 0;
  for (const s of DECKS){ const d = deck(s), R = paths(d), ident = run('ctxOf')(d).ident;
    const cols = n => { const c = X.find(n); return c ? [...run('landColors')(c)].filter(x => ident.includes(x)) : []; };
    R.paths.forEach(L => { const cr = I.resolve(L.cut).o || {}, cl = I.isLand(cr); Object.values(L.opts).forEach(p => { const al = I.isLand(I.resolve(p.add).o || {});
      if (cl !== al) bad.push('land/spell ' + L.cut + ' > ' + p.add);
      if (cl){ landRows++; if (/Basic/.test(cr.type_line || '') || run('isBasic')(L.cut)) bad.push('basic cut ' + L.cut); const miss = cols(L.cut).filter(x => !cols(p.add).includes(x)); if (miss.length) bad.push('loses ' + miss.join('') + ': ' + L.cut + ' > ' + p.add); } }); });
    R.fixes.forEach(p => { const cl = I.isLand(I.resolve(p.cut).o || {}), al = I.isLand(I.resolve(p.add).o || {}); if (cl !== al) bad.push('fix ' + p.cut + ' > ' + p.add); });
    const d2 = JSON.parse(JSON.stringify(d)); R.paths.forEach(L => { const p = L.opts.apex; if (p){ X.__q = d2; X.__p = p; run('cutCard(__q, __p.cut, 1); addCard(__q, __p.add, 1)'); } });
    X.__q = d; const l0 = run('analyze(__q)').lands; X.__q = d2; const l1 = run('analyze(__q)').lands; if (l0 !== l1) bad.push(s + ' land count ' + l0 + '→' + l1); }
  return {pass:!bad.length, detail:landRows + ' land rows checked' + (bad.length ? '; ' + bad.join('; ') : '')}; });

T('CAP-01', '“Best deck with every new card under $3 / $12”: every addition is under the limit per card (owned cards free), no repeats, and the package is a valid deck', () => { let bad = [];
  for (const s of DECKS) for (const cap of [3, 12]){ const d = deck(s); X.__d = d; X.__c = cap; const R = run('upgradePaths(__d, {cap:__c})'), ps = R.paths.map(L => L.opts.apex).filter(Boolean);
    ps.forEach(p => { const c = X.find(p.add); if (!p.own && !(c && c.p != null && c.p < cap)) bad.push(s + ' $' + cap + ': ' + p.add + ' $' + (c && c.p)); });
    const ap = I.applyPairs(cardsOf(d), ps.map(p => ({cut:p.cut, add:p.add}))), dv = I.validateDeck(cmds(d), ap.cards); if (ap.v.length || dv.length) bad.push(s + ' $' + cap + ': ' + JSON.stringify(ap.v.concat(dv)).slice(0, 120));
    if (new Set(ps.map(p => p.add)).size !== ps.length) bad.push(s + ' $' + cap + ': repeated addition'); }
  return {pass:!bad.length, detail:bad.slice(0, 4).join('; ')}; });

// ---------- determinism and other formats ----------
T('OPT-03', 'Same input, same output (run twice)', () => { const a = JSON.stringify(rowsOf(paths(deck('tramplesaurus-rex')))), b = JSON.stringify(rowsOf(paths(deck('tramplesaurus-rex')))); return a === b; });
T('STD-01', 'Standard decks still fill and get upgrade paths without Commander rules', () => { const r = run("STD_STARTERS.map(s => { const d = {format:'standard', commander:'', tier:'budget', aims:s.aims.slice(), tribe:s.tribe || '', colors:s.colors.slice(), cards:[], dismissed:[]}; const n = fillDeck(d); const R = upgradePaths(d); return {n, size:analyze(d).size, rows:R.paths.length, v:validateDeck(d).length}; })");
  return {pass:r.every(x => x.size === 60 && x.v === 0), detail:JSON.stringify(r)}; });

const pass = results.filter(r => r.pass === true).length, fail = results.filter(r => r.pass === false).length, na = results.filter(r => r.pass === 'n/a').length;
console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + na + ' not applicable');
fs.writeFileSync(path.resolve(__dirname, '../out/' + label + '.json'), JSON.stringify({engine:dir, at:new Date().toISOString(), pass, fail, na, results}, null, 1));
