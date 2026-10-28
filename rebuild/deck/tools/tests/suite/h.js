// Test harness: loads one engine copy (baseline or candidate) in Node against the frozen snapshot.
// Usage: const H = require('./h.js')(engineDir);  Nothing here writes outside proto/out.
const fs = require('fs'), vm = require('vm'), zlib = require('zlib'), path = require('path');
const SNAP = path.resolve(__dirname, '../snapshot'), FIX = path.resolve(__dirname, '../fixtures'), D2 = path.resolve(__dirname, '../data2');
// Tuning-set decks and their EDHREC pages (fetched 10 Oct) live in data2/; the frozen snapshot is checked first.
const pick = (a, b) => fs.existsSync(a) ? a : b;
const RAW = JSON.parse(zlib.gunzipSync(fs.readFileSync(SNAP + '/cards.json.gz'))), TAGS = JSON.parse(fs.readFileSync(SNAP + '/tags.json'));
const slug = n => String(n).split(' // ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-');
module.exports = function load(dir, files){
  const ctx = vm.createContext({console, Math, JSON, Set, Map, Date, RegExp, Object, Array, String, Number, Infinity, isNaN, parseFloat, parseInt, Error});
  for (const f of (files || (() => { const F = JSON.parse(fs.readFileSync(path.join(dir, 'files.json'), 'utf8')); return F.data.concat(F.engine); })())) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__raw = RAW; ctx.__tags = TAGS;
  // Combos (data2/spellbook/combos.json.gz, the card-data job's output format); H.noCombos leaves them out.
  const CF = path.resolve(__dirname, '../data2/spellbook/combos.json.gz');
  run(`(()=>{const rows=[];for(const o of __raw){const c=fromScryfall(o);if(c)rows.push(c);} const best=new Map();for(const c of rows){const k=norm(c.n),o=best.get(k);if(!o||(o.p==null&&c.p!=null))best.set(k,c);} buildIndex(mergeLibrary(typeof STARTER!=='undefined'?STARTER:parseStarter(STARTER_RAW),[...best.values()])); BTAGS={mld:new Set(__tags.mld.map(norm)),turns:new Set(__tags.turns.map(norm)),v:1};})()`);
  if (fs.existsSync(CF) && !module.exports.noCombos && run('typeof useCombos') === 'function'){ ctx.__cj = JSON.parse(zlib.gunzipSync(fs.readFileSync(CF))); run('useCombos(__cj)'); delete ctx.__cj; }
  // EDHREC play data for a commander, read exactly as ui.js loadEdh() reads it.
  function edh(name){ let f = pick(SNAP + '/edhrec/' + slug(name) + '.json', D2 + '/edhrec/' + slug(name) + '.json'); if (!fs.existsSync(f) && process.env.EDHX) f = path.resolve(__dirname, '..', process.env.EDHX, slug(name) + '.json'); if (!fs.existsSync(f)){ run(`EDH={key:'',map:null,decks:0,state:'fail'}`); return 0; }
    const j = JSON.parse(fs.readFileSync(f)), seen = new Map(); let decks = 0;
    ((j.container && j.container.json_dict && j.container.json_dict.cardlists) || []).forEach(L => (L.cardviews || []).forEach(v => { if (!v.name || !v.potential_decks) return; decks = Math.max(decks, v.potential_decks);
      const inc = Math.min(1, v.num_decks / v.potential_decks), old = seen.get(v.name); if (!old || inc > old[1]) seen.set(v.name, [v.name, inc, +(v.synergy || 0).toFixed(3)]); }));
    ctx.__er = [...seen.values()]; ctx.__ek = name; ctx.__ed = decks; run(`EDH={key:find(__ek).n,map:new Map(__er.map(r=>[norm(r[0]),{inc:r[1],syn:r[2]}])),decks:__ed,state:'ok',pre:null}`);
    // the commander's bracket 4 page (EDHREC "optimized"; data2/edhrec-opt), when downloaded: what stronger decks run
    { const fo = D2 + '/' + (process.env.EDHOPT || 'edhrec-opt') + '/' + slug(name) + '.json'; if (fs.existsSync(fo)){ const jo = JSON.parse(fs.readFileSync(fo)), so = new Map(); let dd = 0;
      ((jo.container && jo.container.json_dict && jo.container.json_dict.cardlists) || []).forEach(L => (L.cardviews || []).forEach(v => { if (!v.name || !v.potential_decks) return; dd = Math.max(dd, v.potential_decks); const inc = Math.min(1, v.num_decks / v.potential_decks); if (!so.has(v.name) || inc > so.get(v.name)) so.set(v.name, inc); }));
      ctx.__eo = [...so]; ctx.__eod = dd; run(`EDH.opt = new Map(__eo.map(r => [norm(r[0]), {inc:r[1]}])); EDH.optDecks = __eod;`); } }
    // The commander's themes (EDHREC tags) and every downloaded theme page (data2/themes/<commander>__<theme>.json).
    if (run('typeof parseTags') === 'function'){ ctx.__mj = j; run('EDH.tags = parseTags(__mj); EDH.tmap = {}; if (typeof parseLands === "function") EDH.lands = parseLands(__mj)');
      const TD = path.resolve(__dirname, '../data2/themes'), pre = slug(name) + '__';
      if (fs.existsSync(TD)) fs.readdirSync(TD).filter(f => f.startsWith(pre)).forEach(f => { ctx.__tj = JSON.parse(fs.readFileSync(path.join(TD, f))); ctx.__ts = f.slice(pre.length, -5); run('EDH.tmap[__ts] = parseTheme(__tj)'); }); }
    // The precon this commander leads (named on its EDHREC page), read as ui.js loadEdh reads it. H.noPrecon turns it off.
    const pn = j.container && j.container.json_dict && j.container.json_dict.card && j.container.json_dict.card.precon;
    if (pn && !module.exports.noPrecon){ const pf = pick(SNAP + '/precon/' + slug(pn) + '.json', D2 + '/precon/' + slug(pn) + '.json'); if (fs.existsSync(pf)){ ctx.__pj = JSON.parse(fs.readFileSync(pf)); if (run('typeof parsePrecon') === 'function') run('EDH.pre = parsePrecon(__pj)'); } }
    return seen.size; }
  const blank = () => ({id:'t', name:'t', format:'commander', commander:'', tier:'budget', aims:[], tribe:'', colors:[], cards:[], dismissed:[]});
  // A0 input: the retail fixture text through the app's own text import.
  function retail(slugName, extra){ ctx.__t = fs.readFileSync(pick(FIX + '/retail-' + slugName + '.txt', D2 + '/fixtures/retail-' + slugName + '.txt'), 'utf8'); ctx.__x = Object.assign(blank(), extra || {});
    return run(`(()=>{const r=parseDeckText(__t),d=Object.assign(__x,{cards:r.cards});setCommander(d,r.commander);if(r.partner)setPartner(d,r.partner);return d;})()`); }
  // L0 replay: the EDHREC precon page through the same steps as ui.js loadPreconLive() (a source replay, not a live capture).
  function preconReplay(slugName){ ctx.__j = JSON.parse(fs.readFileSync(SNAP + '/precon/' + slugName + '.json')); ctx.__x = blank();
    return run(`(()=>{const j=__j,dk=j.deck||{},cmds=dk.commander||[],map=new Map();
      const put=(n,q)=>{const c=find(n),name=c?c.n:n,k=norm(name);if(map.has(k))map.get(k).q+=q;else map.set(k,{n:name,q,l:false});};
      Object.values(dk.cards||{}).forEach(arr=>(arr||[]).forEach(t=>{if(t&&t[0])put(t[0],+t[1]||1);}));cmds.slice(2).forEach(n=>put(n,1));
      if(cmds[1]&&!(find(cmds[0])&&find(cmds[1])&&canPair(find(cmds[0]),find(cmds[1]))))put(cmds[1],1);
      const d=Object.assign(__x,{cards:[...map.values()]});if(cmds[0]){setCommander(d,cmds[0]);if(cmds[1]&&find(cmds[0])&&find(cmds[1])&&canPair(find(cmds[0]),find(cmds[1])))setPartner(d,cmds[1]);}
      if(d.aims.length)d.auto='precon';return d;})()`); }
  return {ctx, run, edh, retail, preconReplay, RAW, slug};
};
