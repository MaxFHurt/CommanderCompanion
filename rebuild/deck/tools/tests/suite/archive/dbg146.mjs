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
// The owner's shared deck (19 Oct): an upgrade suggested twice, and the thinking line stuck at 2%.
const code = fs.readFileSync(path.join(here, 'share146.txt'), 'utf8').trim();
await page.evaluate(async code => { location.hash = '#share=' + code; await checkShareLink(); }, code); await page.waitForTimeout(800);
const r0 = await page.evaluate(() => ({modal:!$('#modal').hidden, txt:($('#modal').textContent || '').slice(0, 120), acts:[...document.querySelectorAll('#modal [data-act]')].map(b => b.dataset.act).join(',')}));
console.log(JSON.stringify(r0));
await page.evaluate(() => { const b = [...document.querySelectorAll('#modal [data-act]')].find(b => /share-save|save/.test(b.dataset.act)); if (b) b.click(); }); await page.waitForTimeout(500);
await page.evaluate(async () => { const d = cur() || S.profile.decks[0]; S.deckId = d.id; S.view = 'decks'; S.open = true; S.syncRecs = false; S.tab = 'up'; recsFor.k = null; render(); await loadEdh(d.commander); render(); });
for (let t = 0; t < 12; t++){ await page.waitForTimeout(5000); const s = await page.evaluate(() => { const note = [...document.querySelectorAll('#pool-note, .think, #status')].map(e => e.id + ':' + e.textContent).join(' || ');
    const d = cur(), R = recsFor.v, rows = R ? R.paths.map(L => [L.cut, ...['apex', 'mid', 'budget'].map(t => L.opts[t] && L.opts[t].add)]) : []; const adds = rows.flatMap(r => r.slice(1).filter(Boolean)), dup = adds.filter((a, i) => adds.indexOf(a) !== i);
    const shown = [...document.querySelectorAll('[data-act="swap"],[data-act="swap-top"],[data-act="swap-a3"]')].map(b => b.dataset.n).filter(Boolean), dupShown = shown.filter((a, i) => shown.indexOf(a) !== i);
    const ps = window.__poolStop; let kd = ""; if (ps && ps.old && ps.now){ const A = JSON.parse(ps.old), B = JSON.parse(ps.now); kd = A.map((x, i) => JSON.stringify(x) === JSON.stringify(B[i]) ? "" : i + ":" + JSON.stringify(x).slice(0, 80) + " => " + JSON.stringify(B[i]).slice(0, 80)).filter(Boolean).join(" | "); } const W = R ? R.paths.map((L, i) => [i, L.cut, ...["apex", "mid", "budget"].map(t => L.opts[t] ? t + ":" + L.opts[t].add + (L.opts[t].t ? "(" + L.opts[t].t + ")" : "") : "")].join(" ")).filter(x => /Wings of Freedom/.test(x)) : []; return {wings:W, note:note.slice(0, 120), pool:R && R.pool ? R.pool.done + '/' + R.pool.total : '', rows:rows.length, dup:[...new Set(dup)], dupShown:[...new Set(dupShown)].slice(0, 5)}; }); console.log(t, JSON.stringify(s)); }
await page.screenshot({path:OUT + '/b146-up.png', fullPage:false}); console.log('errors', errs.slice(0, 5)); await b.close();
