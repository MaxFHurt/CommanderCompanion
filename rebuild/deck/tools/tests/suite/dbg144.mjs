// Quick browser check (owner, 18 Oct): about 15 self-contained checks of the main screens, for use while working. The full
// suite (ui-test.mjs) still runs before every live build. Usage: PW=<playwright path> node ui-quick.mjs <port> <label>
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW); const fs = require('fs'), path = require('path'), zlib = require('zlib');
const here = path.dirname(new URL(import.meta.url).pathname), SNAP = path.resolve(here, '../snapshot'), OUT = path.resolve(here, '../out');
const port = process.argv[2] || '8765', label = process.argv[3] || 'ui';
const cards = zlib.gunzipSync(fs.readFileSync(SNAP + '/cards.json.gz')).toString(), RAWJ = JSON.parse(cards), tags = fs.readFileSync(SNAP + '/tags.json', 'utf8');
const results = []; const T = (id, desc, pass, detail) => { results.push({id, desc, pass, detail}); console.log((pass ? 'PASS' : 'FAIL'), id.padEnd(9), desc, detail ? '— ' + detail : ''); };
const errs = [];
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1300, height:900}}); const page = await ctx.newPage();
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await ctx.route('**/*', route => { const u = route.request().url();
  if (u.startsWith('http://127.0.0.1')) return route.continue();
  let m;
  if ((m = /json\.edhrec\.com\/pages\/precon\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/precon/' + m[1] + '.json')) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(SNAP + '/precon/' + m[1] + '.json')});
  if ((m = /json\.edhrec\.com\/pages\/commanders\/([a-z0-9-]+)\/([a-z0-9-]+)\.json/.exec(u))){ const f = path.resolve(here, '../data2/themes/' + m[1] + '__' + m[2] + '.json'); return fs.existsSync(f) ? route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(f)}) : route.fulfill({status:404, body:''}); }
  if ((m = /json\.edhrec\.com\/pages\/commanders\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/edhrec/' + m[1] + '.json')) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(SNAP + '/edhrec/' + m[1] + '.json')});
  if ((m = /api\.scryfall\.com\/cards\/search\?q=([^&]+)/.exec(u)) && /\be:([a-z0-9]+)/.test(decodeURIComponent(m[1]))){ const code = /\be:([a-z0-9]+)/.exec(decodeURIComponent(m[1]))[1]; if (code === 'err') return route.fulfill({status:503, body:''}); const data = RAWJ.filter(o => o.set === code).map(o => Object.assign({object:'card'}, o)); return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({object:'list', has_more:false, data})}); }
  if (/api\.scryfall\.com\/sets$/.test(u)) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({data:[{code:'msc', name:'Marvel Super Heroes Commander', released_at:'2026-09-26', set_type:'commander', card_count:300, digital:false}, {code:'msh', name:'Marvel Super Heroes', released_at:'2026-09-26', set_type:'expansion', card_count:300, digital:false}, {code:'blb', name:'Bloomburrow', released_at:'2024-08-02', set_type:'expansion', card_count:280, digital:false}]})});
  if (/raw\.githubusercontent\.com\/MaxFHurt\/Deck-Companion\/card-data\/combos\.json\.gz/.test(u)) return route.fulfill({status:200, contentType:'application/octet-stream', body:fs.readFileSync(path.resolve(here, '../data2/spellbook/combos.json.gz'))});
  if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({status:200, contentType:'text/css', body:''});
  return route.abort(); });
await page.goto('http://127.0.0.1:' + port + '/index.html', {waitUntil:'load'}); await page.waitForTimeout(1200);
// Full card data from the snapshot, loaded the way the app loads its own download.
await page.evaluate(([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)){ const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows){ const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); }
  useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; S.autoYes = new Set(['swap', 'swap-top', 'swap-a3', 'want', 'fix-swap', 'swap-cap', 'add-to-deck', 'consider-in']); S.syncRecs = true; const t = JSON.parse(tg); useTags(t); }, [cards, tags]);
const build = await page.evaluate(() => window.BUILD);
// Build 144: the same decks with 0..N helper cores: identical lists, time per build, and memory per core.
const CORES = (process.env.CORES || '0,1,2,3').split(',').map(Number), DECKS = [['Don & Leo, Problem Solvers', 'apex'], ['Captain America, Team Leader', 'budget'], ['Kenrith, the Returned King', 'mid']];
const ref = await page.evaluate(async (DECKS) => { S.noWorker = true; const out = {}; for (const [n, t] of DECKS){ await loadEdh(n); const aims = await edhAimsFor(find(n)); const t0 = Date.now(); const g = await startPlan(n, [], null, null, {fill:t, aims}); S.draft = null; out[n + ' ' + t] = {list:g.cards.map(e => e.n + 'x' + e.q).sort().join('|'), ms:Date.now() - t0}; } S.noWorker = false; return out; }, DECKS);
console.log('page itself:', Object.entries(ref).map(([k, v]) => k + ' ' + v.ms + ' ms').join(' | '));
for (const n of CORES){
  const r = await page.evaluate(async ([n, DECKS]) => { wkRestart(); S.cores = n; wkGet(); await wkSend({kind:'warm'}); const out = {};
    for (const [name, t] of DECKS){ apexRef.cache = new Map(); const aims = await edhAimsFor(find(name)); const t0 = Date.now(); const g = await startPlan(name, [], null, null, {fill:t, aims}); S.draft = null;
      out[name + ' ' + t] = {list:g.cards.map(e => e.n + 'x' + e.q).sort().join('|'), ms:Date.now() - t0, helpers:genRun.last && genRun.last.helpers, stat:genRun.last && genRun.last.stat}; }
    return out; }, [n, DECKS]);
  const same = Object.keys(ref).every(k => r[k].list === ref[k].list);
  console.log('helpers', n, '| same as page:', same, '|', Object.entries(r).map(([k, v]) => k.split(',')[0] + ' ' + v.ms + ' ms (' + JSON.stringify(v.stat) + ')').join(' | '));
}
const bs = await b.newBrowserCDPSession(); const tg = (await bs.send('Target.getTargets')).targetInfos; let mid = 50;
for (const t of tg.filter(t => t.type === 'worker' || t.type === 'page')){ const {sessionId} = await bs.send('Target.attachToTarget', {targetId:t.targetId, flatten:false}); const id = ++mid;
  const got = new Promise(res => bs.on('Target.receivedMessageFromTarget', e => { if (e.sessionId === sessionId){ const m = JSON.parse(e.message); if (m.id === id) res(m.result); } }));
  await bs.send('Target.sendMessageToTarget', {sessionId, message:JSON.stringify({id, method:'Runtime.getHeapUsage'})}); const r = await Promise.race([got, new Promise(r => setTimeout(() => r(null), 3000))]);
  console.log(t.type, t.url.replace(/^.*\//, ''), r ? Math.round(r.usedSize / 1e6) + ' MB used' : 'n/a'); }
console.log('errors', errs.slice(0, 5)); await b.close();
