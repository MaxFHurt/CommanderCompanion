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
// Build 143: a generated deck is built on a background core (work.js) and comes out the same as one built on the page.
const cdp = await ctx.newCDPSession(page);
const heap = async () => { try { const r = await cdp.send('Runtime.getHeapUsage'); return Math.round(r.usedSize / 1e6); } catch (e) { return -1; } };
const r1 = await page.evaluate(async (args) => { const out = {}; const runOnce = async (noW, name, tier) => { S.noWorker = noW; let ticks = 0; const iv = setInterval(() => ticks++, 50); const t0 = Date.now();
    await loadEdh(name); const aims = await edhAimsFor(find(name)); const g = await startPlan(name, [], null, null, {fill:tier, aims}); clearInterval(iv); S.draft = null;
    return {ms:Date.now() - t0, ticks, worker:!noW && !!(genRun.last && genRun.last.worker), list:g.cards.map(e => e.n + 'x' + e.q).sort().join('|'), n:g.cards.reduce((a, e) => a + e.q, 0)}; };
  for (const [name, tier] of [['Don & Leo, Problem Solvers', 'apex'], ['Captain America, Team Leader', 'budget']]){ genRun.last = null;
    const w = await runOnce(false, name, tier), m = await runOnce(true, name, tier), w2 = await runOnce(false, name, tier);
    out[name + ' ' + tier] = {same:w.list === m.list && w2.list === m.list, wMs:w.ms, w2Ms:w2.ms, mMs:m.ms, wTicks:w.ticks, mTicks:m.ticks, worker:w.worker, n:w.n}; }
  S.noWorker = false; return out; });
console.log(JSON.stringify(r1, null, 1));
// Prefetch: pick a commander in Generate, wait while the "player" reads the options, then press Build.
const r2 = await page.evaluate(async () => { const out = {}; const name = 'Kenrith, the Returned King';
  for (const pre of [false, true]){ S.draft = null; apexRef.cache = new Map(); await wkSend({kind:'sync'}); S.gen.cmd = name; S.gen.tier = 'apex'; S.gen.mech = []; S.gen.best = true; S.gen.sets = []; await loadEdh(name);
    if (pre){ openGenerate(); for (let i = 0; i < 100 && !(genPrefetch.k && !WK.cb.size); i++) await new Promise(r => setTimeout(r, 100)); } else { genPrefetch.k = null; }
    const t0 = Date.now(); if (!pre) openGenerate(); clearTimeout(genPrefetch.t); document.querySelector('[data-act="gen-go"]').click(); for (let i = 0; i < 300 && !(S.draft && S.draft.cards.length); i++) await new Promise(r => setTimeout(r, 50));
    out[pre ? 'withPrefetch' : 'without'] = {ms:Date.now() - t0, n:S.draft ? S.draft.cards.length : 0, list:S.draft ? S.draft.cards.map(e => e.n).sort().join('|').length : 0}; }
  return out; });
console.log(JSON.stringify(r2));
const bs = await b.newBrowserCDPSession(); const tg = (await bs.send('Target.getTargets')).targetInfos; console.log('targets', tg.map(t => t.type + ':' + t.url.slice(-20)).join(' , '));
for (const t of tg.filter(t => t.type === 'worker' || t.type === 'page')){ const {sessionId} = await bs.send('Target.attachToTarget', {targetId:t.targetId, flatten:false});
  const got = new Promise(res => bs.on('Target.receivedMessageFromTarget', e => { if (e.sessionId === sessionId){ const m = JSON.parse(e.message); if (m.id === 7) res(m.result); } }));
  await bs.send('Target.sendMessageToTarget', {sessionId, message:JSON.stringify({id:7, method:'Runtime.getHeapUsage'})}); const r = await Promise.race([got, new Promise(r => setTimeout(() => r(null), 3000))]);
  console.log(t.type, t.url.slice(-25), r ? Math.round(r.usedSize / 1e6) + ' MB used / ' + Math.round(r.totalSize / 1e6) + ' MB heap' : 'n/a'); }
const ws = page.workers(); console.log('workers', ws.length, 'page heap MB', await heap());
for (const w of ws){ try { const s = await ctx.newCDPSession(w); const r = await s.send('Runtime.getHeapUsage'); console.log('worker heap MB', Math.round(r.usedSize / 1e6)); } catch (e) { console.log('worker heap n/a', e.message.slice(0, 80)); } }
console.log('errors', errs.slice(0, 5));
await b.close();
