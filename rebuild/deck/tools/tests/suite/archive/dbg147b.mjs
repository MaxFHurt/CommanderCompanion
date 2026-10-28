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
// How long until a deck's upgrade list is complete (score check + background search), per deck.
const code = fs.readFileSync(path.join(here, 'share146.txt'), 'utf8').trim();
await page.evaluate(async code => { location.hash = '#share=' + code; await checkShareLink(); await new Promise(r => setTimeout(r, 300)); const sv = document.querySelector('#modal [data-act="share-save"]'); if (sv) sv.click(); }, code); await page.waitForTimeout(400);
await page.evaluate(async () => { for (const [slug, label] of [['wakanda-forever', 'Wakanda Forever'], ['doom-prevails', 'Doom Prevails'], ['turtle-power', 'Turtle Power']]){ try { await loadPreconLive(slug, label); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; } catch (e) {} } });
const res = await page.evaluate(async () => { const out = []; S.syncRecs = false; window.__cmp = true; wkGet(); await wkSend({kind:'warm'});
  for (const d of S.profile.decks.filter(x => x.format === 'commander' && !x.example).slice(0, 4)){ await loadEdh(d.commander); await new Promise(r => setTimeout(r, 1500));
    S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; const t0 = Date.now(); recsFor.k = null; render(); let tList = 0;
    for (let i = 0; i < 1800; i++){ await new Promise(r => setTimeout(r, 100)); const R = recsFor.v; if (!tList && R && !R.pending) tList = Date.now() - t0; if (R && R.poolDone) break; if (i % 10 === 0) render(); }
    const R = recsFor.v, tops = R.paths.map(L => L.top ? L.top.n + ':' + L.top.dScore : '').join('|'), all = Date.now() - t0, helpers = R.poolMs != null;
    let same = null; { const Q = poolQueue(d, R), keys = poolKeys(Q), r = await wkSend({kind:'measure', b:{kind:'swap', d:JSON.parse(JSON.stringify(d)), base:R.base, apex:R.apexR || null, keys}}, 600000);
      const loc = keys.map(k => R.dOf(k[0], k[1], k[2])); const bad = loc.map((v, i) => (r.vals[i] ? r.vals[i][0] : null) === v ? -1 : i).filter(i => i >= 0); same = bad.length ? bad.length + ' of ' + keys.length + ' differ, e.g. ' + bad.slice(0, 2).map(i => keys[i][1] + ' cores=' + (r.vals[i] && r.vals[i][0]) + ' page=' + loc[i]).join('; ') : 'all ' + keys.length + ' identical'; }
    out.push({deck:d.name, list:tList, all, cards:R.pool ? R.pool.total : 0, done:!!R.poolDone, onCores:helpers, sameAsPage:same}); }
  return out; });
console.log(JSON.stringify(res, null, 1)); await b.close();
