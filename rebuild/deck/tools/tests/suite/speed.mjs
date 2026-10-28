// Speed (owner's choice 2a, 0.9.3): the main actions timed with the processor slowed THROTTLE times (default 4, roughly a phone).
// Usage: PW=<playwright> node speed.mjs <port> [label]   (run alone: other tests running at the same time skew it)
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
const TH = +(process.env.THROTTLE || 4), cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', {rate:TH});
const R = {throttle:TH};
for (const mode of ['', '?dev=1']){ const t0 = Date.now(); await page.goto('http://127.0.0.1:' + port + '/index.html' + mode, {waitUntil:'load'}); await page.waitForFunction(() => typeof render === 'function' && document.querySelector('.app'));
  R['load' + (mode ? ' (readable files)' : ' (bundle)') + ' ms'] = Date.now() - t0; }
{ const t0 = Date.now(); await page.evaluate(([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)){ const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows){ const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); }
  useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; S.syncRecs = false; useTags(JSON.parse(tg)); }, [cards, tags]); R['read card data ms'] = Date.now() - t0; }
const timed = async (name, fn, arg) => { const t0 = Date.now(); const x = await page.evaluate(fn, arg); R[name + ' ms'] = Date.now() - t0; if (x && typeof x === 'object') Object.assign(R, x); };
await timed('open precon + play data', async () => { await loadPreconLive('wakanda-forever', 'Wakanda Forever'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander); for (let i = 0; i < 600 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 50)); });
await timed('deck score + Apex reference', async () => { const d = cur(); for (let i = 0; i < 600 && !(evalFor(d) && evalFor(d).exact != null); i++) await new Promise(r => setTimeout(r, 50)); });
await timed('Upgrades list complete', async () => { const d = cur(); S.view = 'decks'; S.open = true; S.tab = 'up'; recsFor.k = null; render(); for (let i = 0; i < 2400 && !(recsFor.v && !recsFor.v.pending && (!recsFor.v.pool || recsFor.v.poolDone)); i++){ await new Promise(r => setTimeout(r, 50)); if (i % 20 === 0) render(); } return {'upgrade rows':recsFor.v ? recsFor.v.paths.length : 0}; });
await timed('switch tabs (render)', () => { const t = []; for (const tab of ['list', 'stats', 'up', 'list', 'up']){ const a = performance.now(); S.tab = tab; render(); t.push(Math.round(performance.now() - a)); } return {'render ms each':t.join(',')}; });
await timed('open a card window', () => { const d = cur(), c = LIB.find(x => !tags(x).land && x.ci.every(k => ctxOf(d).ident.includes(k)) && !hasCard(d, x.n) && x.r && x.r < 500); openCard(c.n); $('#modal').hidden = true; });
await timed('Fix: Mana complete', async () => { FRESH.clear(); openFix(['Mana']); const g = () => (S.fixG || []).find(x => x.k === 'Mana'); for (let i = 0; i < 1200 && g() && g().busy; i++) await new Promise(r => setTimeout(r, 50)); $('#modal').hidden = true; });
await timed('generate a deck (page, Apex)', () => { const d = {id:'q', name:'q', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, cur().commander); buildPlan(d, [], null, new Set()); });
console.log(JSON.stringify(R, null, 1)); fs.mkdirSync(OUT, {recursive:true}); fs.writeFileSync(OUT + '/speed-' + (process.argv[3] || 'x') + '.json', JSON.stringify(R, null, 1)); await b.close();
