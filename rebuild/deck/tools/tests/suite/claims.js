// Every explanation the engine shows, checked against the raw source it cites. node claims.js <engineDir> [set]
// EDHREC numbers are re-read from the JSON files directly (not through the engine); card facts from Oracle text.
const path = require('path'), fs = require('fs'), which = process.argv[3] || 'all';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'claims', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
const SNAP = path.resolve(__dirname, '../snapshot'), D2 = path.resolve(__dirname, '../data2');
const pick = (...f) => f.find(x => fs.existsSync(x));
const pct = x => Math.round(x * 100), key = n => run('keyOf')(n);
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test) : which === 'every' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : B.SETS[which];
// Combo claims are re-read from the raw combo file (not through the engine's index).
const CJ = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(path.resolve(__dirname, '../data2/spellbook/combos.json.gz')))), comboSets = CJ.combos.map(r => ({names:new Set(r[0].map(i => CJ.cards[i])), what:r[3], decks:r[4], win:r[2] === 'w'}));
const findCombo = (names, what, decks) => comboSets.find(x => x.names.size === names.length && names.every(n => x.names.has(n)) && x.what.toLowerCase() === what && x.decks === decks);
let n = 0, bad = [], kinds = {};
for (const [slug] of list){
  const d = H.retail(slug); H.edh(d.commander); if (process.env.AIMS === 'edh'){ const E = run('EDH'), t = E.tags.filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug); }
  X.__d = d; const R = run('upgradePaths(__d)'), cmd = X.find(d.commander), short = cmd.n.split(',')[0];
  // raw commander page
  const cj = JSON.parse(fs.readFileSync(pick(SNAP + '/edhrec/' + H.slug(cmd.n) + '.json', D2 + '/edhrec/' + H.slug(cmd.n) + '.json'))), inc = new Map();
  cj.container.json_dict.cardlists.forEach(L => L.cardviews.forEach(v => { if (v.name && v.potential_decks){ const k = key(v.name), r = Math.min(1, v.num_decks / v.potential_decks); if (!inc.has(k) || inc.get(k) < r) inc.set(k, r); } }));
  const pn = cj.container.json_dict.card.precon, pf = pn && pick(SNAP + '/precon/' + H.slug(pn) + '.json', D2 + '/precon/' + H.slug(pn) + '.json');
  const pj = pf ? JSON.parse(fs.readFileSync(pf)) : null, PL = t => pj ? ((pj.container.json_dict.cardlists.find(x => x.tag === t) || {}).cardviews || []) : [];
  const pAdd = new Map(PL('cardstoadd').concat(PL('landstoadd')).map(v => [key(v.name), v.num_decks / v.potential_decks])), pCut = PL('cardstocut').map(v => key(v.name)), pLCut = PL('landstocut').map(v => key(v.name));
  const cnt = {}; d.cards.forEach(e => run('jobsOf')(e.n).forEach(j => cnt[j] = (cnt[j] || 0) + e.q));
  const check = (kind, ok, s, p) => { n++; kinds[kind] = (kinds[kind] || 0) + 1; if (!ok) bad.push(slug + ' | ' + p.cut + ' → ' + p.add + ' | ' + s); };
  R.paths.forEach(L => Object.values(L.opts).forEach(p => {
    const ca = X.find(p.add), cc = X.find(p.cut);
    (p.why || []).concat(p.cutWhy || []).forEach((s, i) => {
      const forCut = i >= (p.why || []).length, c = forCut ? cc : ca, k = c._k; let m;
      if ((m = /^In (\d+)% of (.+) decks$/.exec(s))) check('commander %', m[2] === short && inc.has(k) && pct(inc.get(k)) === +m[1], s, p);
      else if ((m = /^Added in (\d+)% of ([\d,]+ )?decks built from (.+)$/.exec(s))) check('precon add %', m[3] === pj.deck.name && pAdd.has(k) && pct(pAdd.get(k)) === +m[1] && (!m[2] || +m[2].replace(/[ ,]/g, '') === pj.container.json_dict.card.num_decks), s, p);
      else if ((m = /^One of the (cards|lands) most often cut from (.+) \(#(\d+) of (\d+)\)$/.exec(s))) { const Lx = m[1] === 'lands' ? pLCut : pCut; check('precon cut rank', m[2] === pj.deck.name && Lx[+m[3] - 1] === k && Lx.length === +m[4], s, p); }
      else if ((m = /^(.+): in (\d+)% of (.+) decks$/.exec(s)) && m[1] === m[3]){ const t = (run('EDH').tags || []).find(x => x.label === m[1]), f = t && path.join(D2, 'themes', H.slug(cmd.n) + '__' + t.slug + '.json');
        let ok = false; if (f && fs.existsSync(f)){ const tj = JSON.parse(fs.readFileSync(f)); tj.container.json_dict.cardlists.forEach(L => L.cardviews.forEach(v => { if (v.potential_decks && key(v.name) === k && pct(v.num_decks / v.potential_decks) === +m[2]) ok = true; })); }
        check('theme %', ok, s, p); }
      else if (s === 'Always enters tapped') check('enters tapped', /enters tapped\.|onto the battlefield tapped/i.test(cc.o) && !/unless|if you don't/i.test(cc.o), s, p);
      else if (s === 'Makes the same colours and can enter untapped') { const id = run('ctxOf')(d).ident, col = c2 => [...run('landColors')(c2)].filter(x => id.includes(x));
        const always = o => (o || '').split(/(?<=\.)\s+/).some(x => /enters tapped\.|onto the battlefield tapped/i.test(x) && !/unless|if you don't|if you control/i.test(x));
        check('same colours, untapped', col(cc).every(x => col(ca).includes(x)) && !always(ca.o), s, p); }
      else if ((m = /^Rarely run with (.+)$/.exec(s))) check('rarely run', m[1] === short && !inc.has(k), s, p);
      else if (/^New card/.test(s)) check('new card', !inc.has(k) && !c.r, s, p);
      else if (s === 'Proven staple') check('staple', !!c.r && c.r < 250, s, p);
      else if ((m = /^Its (.+) role is kept$/.exec(s))) check('role kept', run('jobsOf')(p.cut).some(j => run('JOB_LABEL')[j] === m[1]) && run('jobsOf')(p.add).some(j => run('JOB_LABEL')[j] === m[1]), s, p);
      else if ((m = /^Gives up (.+); the deck keeps (\d+)$/.exec(s))) { const j = Object.keys(run('JOB_LABEL')).find(j => run('JOB_LABEL')[j] === m[1]); check('gives up', !!j && run('jobsOf')(p.cut).includes(j) && !run('jobsOf')(p.add).includes(j) && Math.max(0, (cnt[j] || 0) - 1) === +m[2], s, p); }
      else if ((m = /^Adds (.+)$/.exec(s))) { const j = Object.keys(run('JOB_LABEL')).find(j => run('JOB_LABEL')[j] === m[1]); check('adds job', !!j && run('jobsOf')(p.add).includes(j), s, p); }
      else if (Object.values(run('THEMES')).some(T => T.label === s) || / synergy$/.test(s) || s === 'Commander strategy' || s === 'Does little for the deck’s plan' || s === 'Weakest fit for the build' || /^Outside your colors|^Not legal/.test(s)) check('engine judgement (not externally checkable)', true, s, p);
      else if ((m = /^Completes a combo with (.+): (.+) \(Commander Spellbook, ([\d,]+) decks\)$/.exec(s))){ const others = m[1].split(' and '), have = new Set(d.cards.map(e => e.n).concat([d.commander, d.partner].filter(Boolean)));
        // card names can contain " and " (Gatta and Luzzu): rebuild the split from the deck's own names
        const parts = []; let buf = []; others.forEach(w => { buf.push(w); const nm = buf.join(' and '); if (have.has(nm)){ parts.push(nm); buf = []; } });
        check('combo completes', !buf.length && !!findCombo(parts.concat([ca.n]), m[2], +m[3].replace(/,/g, '')), s, p); }
      else if ((m = /^Backup for your (.+) combo \((.+)\): it can take the place of (.+) \(Commander Spellbook, ([\d,]+) decks\)$/.exec(s))){ const full = m[1].split(' + '), have = new Set(d.cards.map(e => e.n).concat([d.commander, d.partner].filter(Boolean))), rest = full.filter(n => n !== m[3]);
        check('combo backup', full.every(n => have.has(n)) && !!comboSets.find(x => x.names.size === full.length && full.every(n => x.names.has(n)) && x.win) && !!findCombo(rest.concat([ca.n]), m[2], +m[4].replace(/,/g, '')), s, p); }
      else if (s === 'Game Changer: among the strongest cards in Commander') check('game changer (Scryfall flag)', !!c.gc, s, p);
      // tournament staples, checked on the card's own text: fast mana makes mana for 2 or less; free interaction has a way to cast
      // it without its mana cost (or costs 1); the best lands are lands that come in untapped or fetch
      else if (s === 'Tournament staple: fast mana') check('tournament fast mana', (c.cmc || 0) <= 2 && /\badd\b/i.test(c.o || ''), s, p);
      else if (s === 'Tournament staple: free or one-mana interaction') check('tournament free interaction', /rather than pay|without paying|\bEvoke\b/i.test(c.o || '') || (c.cmc || 0) <= 1, s, p);
      else if (s === 'Tournament staple: one of the best lands') check('tournament land', !!run('tags')(c).land && (run('landSpeed')(c) === 'untapped' || /search your library/i.test(c.o || '')), s, p);
      else if (s === 'From your chosen set') check('in chosen set', run('inSets')(c, d), s, p);
      else check('UNRECOGNISED', false, s, p);
    }); }));
}
console.log('claims checked:', n); Object.entries(kinds).forEach(([k, v]) => console.log('  ' + k.padEnd(44) + v));
console.log('FALSE OR UNCHECKABLE:', bad.length); bad.slice(0, 40).forEach(x => console.log('  ' + x));
