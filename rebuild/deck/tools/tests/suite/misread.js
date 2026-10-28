// Possible misreads (owner, 19 Oct: The Ozolith was read as fitting none of a +1/+1 counters deck's plans).
// For every commander with an EDHREC page, lists the cards its players pick far more than other decks (synergy 0.2+, in 10%+
// of its decks) that the app says feed none of the deck's plans, the commander's strategy or its engine. Job cards (ramp,
// draw, removal...), staples and lands are left out: they earn their slot without a plan. What remains is either a card the
// rules reading misses or a card players run for a reason outside the plans; each needs a look, not an automatic fix.
// node misread.js <engineDir> [minSyn=0.2] [minInc=0.1]   AIMS=edh: plans are the commander's top EDHREC themes with their
// theme pages, as the app builds them (the default maps EDHREC's tags onto the built-in plans only)
const fs = require('fs'), path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const minSyn = +(process.argv[3] || 0.2), minInc = +(process.argv[4] || 0.1);
const dirs = ['../snapshot/edhrec', '../data2/edhrec'].concat(process.env.EDHX ? ['../' + process.env.EDHX] : []).map(d => path.resolve(__dirname, d)).filter(fs.existsSync), seen = new Set();
const REV = run('(() => { const r = {}; for (const k in TAG_OF) r[TAG_OF[k]] = k; if (typeof TAG_ALIAS === "object") Object.assign(r, TAG_ALIAS); return r; })()');
let total = 0, cmds = 0;
for (const dir of dirs) for (const f of fs.readdirSync(dir).filter(f => /^[a-z0-9-]+\.json$/.test(f))){
  const j = JSON.parse(fs.readFileSync(path.join(dir, f))), card = j.container && j.container.json_dict && j.container.json_dict.card, name = card && card.name;
  if (!name || seen.has(name) || !X.find(name)) continue; seen.add(name); if (!H.edh(name)) continue; cmds++;
  X.__n = name; X.__rev = REV; X.__edhAims = process.env.AIMS === 'edh';
  const out = run(`(() => { const d = {id:'m', name:'m', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(d, __n);
    const tg = (EDH.tags || []).slice().sort((a, b) => b.count - a.count).map(t => __edhAims ? (EDH.tmap[t.slug] ? 'edh:' + t.slug : null) : __rev[t.slug]).filter(Boolean); d.aims = [...new Set(tg)].slice(0, 3);
    const ctx = ctxOf(d); if (ctx.tribe && !d.aims.includes('tribal')) d.aims.push('tribal');
    const res = []; for (const [k, v] of EDH.map){ if (v.syn < ${minSyn} || v.inc < ${minInc}) continue; const c = find(k); if (!c || c.n === ctx.cmd.n) continue; const t = tags(c);
      if (t.land || ['ramp', 'draw', 'removal', 'wipe', 'protect', 'counter', 'tutor'].some(r => t.roles.has(r)) || CORE.has(c._n) || (c.r && c.r < 250)) continue;
      const fit = d.aims.some(a => matchAim(c, a, ctx.tribe) >= 0.7) || ctx.cmdThemes.some(a => matchAim(c, a, ctx.cmdTribe) >= 1) || (ctx.engine && engineFit(c, ctx.engine).v > 0) || (ctx.xPlans || []).some(a => matchAim(c, a, ctx.tribe) >= 0.7) || !!comboFor(c, ctx);
      if (!fit) res.push({n:c.n, inc:Math.round(v.inc * 100), syn:+v.syn.toFixed(2), o:(c.o || '').replace(/\\n/g, ' ').slice(0, 150)}); }
    return {aims:d.aims, cmdThemes:ctx.cmdThemes, tribe:ctx.tribe, res:res.sort((a, b) => b.syn - a.syn)}; })()`);
  if (!out.res.length) continue; total += out.res.length;
  console.log('\n## ' + name + ' — plans: ' + out.aims.join(', ') + (out.cmdThemes.length ? ' · commander: ' + out.cmdThemes.join(', ') : '') + (out.tribe ? ' · tribe ' + out.tribe : ''));
  out.res.forEach(r => console.log('  ' + r.n + ' (' + r.inc + '%, synergy ' + r.syn + '): ' + r.o));
}
console.log('\n' + total + ' cards across ' + cmds + ' commanders');
