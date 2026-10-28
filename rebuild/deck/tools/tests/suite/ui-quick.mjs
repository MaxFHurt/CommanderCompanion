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
// The page runs the minified bundles (tools/build.sh, 0.9.3): each must be made from the current readable files, and the page's
// file list (DEV_FILES, used with ?dev=1) must be files.json's. A stale bundle means: run sh tools/build.sh.
{ const base = 'http://127.0.0.1:' + port + '/', get = async f => Buffer.from(await (await fetch(base + f)).arrayBuffer()), crypto = require('crypto');
  const F = JSON.parse((await get('files.json')).toString()), fp = async L => { const h = crypto.createHash('sha256'); for (const f of L) h.update(await get(f)); return h.digest('hex').slice(0, 16); };
  const head = async f => ((/sources ([0-9a-f]{16})/.exec((await get(f)).toString('utf8', 0, 300)) || [])[1]);
  const app = (await head('app.min.js')) === (await fp(F.data.concat(F.engine, F.ui))), eng = (await head('engine.min.js')) === (await fp(F.data.concat(F.engine)));
  const devList = await page.evaluate(() => (window.DEV_FILES || []).join()), same = devList === F.data.concat(F.engine, F.ui).join();
  T('Q-BUNDLE', 'The live bundles are made from the current readable files (else run sh tools/build.sh) and the page’s file list matches files.json', app && eng && same, JSON.stringify({app, engine:eng, fileList:same})); }
{ const p2 = await ctx.newPage(), e2 = []; p2.on('pageerror', e => e2.push(e.message)); await p2.goto('http://127.0.0.1:' + port + '/index.html?dev=1', {waitUntil:'load'}); await p2.waitForTimeout(1500);
  const r2 = await p2.evaluate(() => ({dev:window.DEV, fns:typeof handleAct === 'function' && typeof poolPromote === 'function' && typeof render === 'function'})); await p2.close();
  T('Q-DEV', 'With ?dev=1 the page runs the readable files, with no page errors', r2.dev === true && r2.fns && !e2.length, JSON.stringify(r2) + ' ' + e2.join(' | ')); }

// 1. Native precon loader, Wakanda (alternate printed names) — the path that recommended installed cards before.
await page.evaluate(async () => { window.__save = async (slug, label) => { await loadPreconLive(slug, label); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); return d; }; await __save('wakanda-forever', 'Wakanda Forever'); }); await page.waitForTimeout(800);
await page.evaluate(async () => { const d = cur(); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); }); await page.waitForTimeout(800);
const t00 = Date.now();
const open = async (tab, sync) => page.evaluate(async ([tab, sync]) => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.syncRecs = sync; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = tab; $('#modal').hidden = true; render(); return d.id; }, [tab, sync]);

// Q1. A precon loads, every card recognised.
const q1 = await page.evaluate(async () => { await loadPreconLive('wakanda-forever', 'Wakanda Forever'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander); await loadThemes(d.commander, d.aims);
  for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); const A = analyze(d); return {size:A.size, unknown:A.unknown.length}; });
T('Q-LOAD', 'A precon loads with every card recognised', q1.size >= 99 && !q1.unknown, JSON.stringify(q1));
// Q2. Upgrades in the background: says it is checking, then lists checked swaps within 15 s (catches a slower score check or a hidden list).
await open('up', false);
const q2 = await page.evaluate(async () => { const d = cur(); recsFor.k = null; render(); const checking = /checking each upgrade/i.test(document.body.textContent), t0 = performance.now(); await recsReady(d); for (let i = 0; i < 150 && recsFor.v && recsFor.v.pool && !recsFor.v.poolDone; i++) await new Promise(r => setTimeout(r, 100)); const ms = Math.round(performance.now() - t0);   /* Version 0.9.1: the list appears once the whole-card search is done */ await new Promise(r => setTimeout(r, 200));
  return {checking, ms, rows:document.querySelectorAll('.paths .path').length, swaps:document.querySelectorAll('.paths [data-act="swap"]').length, alts:document.querySelectorAll('.paths .alt3 .a3').length, slots:document.querySelectorAll('.topslot[data-i]').length}; });
T('Q-UPGRADES', 'Upgrades: says it is checking, then shows rows with Swap buttons, alternatives and Highest score slots within 15 s', q2.checking && q2.ms < 15000 && q2.rows > 0 && q2.swaps > 0 && q2.alts > 0 && q2.slots > 0, JSON.stringify(q2));
// Q3. A swap goes in, and Undo brings the deck back.
await open('up', true);
const q3 = await page.evaluate(async () => { const d = cur(), before = JSON.stringify(d.cards), b = document.querySelector('.paths [data-act="swap"]'); if (!b) return {none:true}; b.click(); await new Promise(r => setTimeout(r, 300)); const changed = JSON.stringify(d.cards) !== before;
  d.cards = JSON.parse(before); recsFor.k = null; render(); return {changed}; });
T('Q-SWAP', 'Swap puts the card in the deck', q3.changed, JSON.stringify(q3));
// Q4. Card window: the swap box, and the price warning in a Budget deck.
const q4 = await page.evaluate(() => { const d = cur(), t0 = d.tier, dear = LIB.find(c => c.p > 40 && c.cmd && c.ci.every(x => ctxOf(d).ident.includes(x)) && !d.cards.some(e => norm(e.n) === c._n) && !tags(c).land);
  d.tier = 'budget'; S.tab = 'list'; render(); openCard(dear.n); const m = $('#modal'), out = {open:!m.hidden, put:/Put this card in/.test(m.textContent), over:m.querySelectorAll('.over-cap').length}; m.hidden = true; d.tier = t0; render(); return out; });
T('Q-CARD', 'Card window opens with its swap box and says when a card is over the deck’s price limit', q4.open && q4.put && q4.over === 1, JSON.stringify(q4));
// Q5. Decklist, Build stats (with practice games) and Buy list tabs draw.
const q5 = {}; for (const t of ['list', 'stats', 'buy']){ await open(t, true); await page.waitForTimeout(300); q5[t] = await page.evaluate(() => ({len:document.querySelector('#main').innerText.length, practice:/Practice games/i.test(document.body.textContent)})); }
T('Q-TABS', 'Decklist, Build stats (practice games) and Buy list draw', q5.list.len > 500 && q5.stats.practice && q5.buy.len > 200, JSON.stringify(q5));
// Q6. Fix: Mana opens at once and fills in.
const q6 = await page.evaluate(async () => { openFixSoon(['Mana']); const first = /checking land swaps/i.test($('#modal').textContent); for (let i = 0; i < 150 && /checking land swaps/i.test($('#modal').textContent); i++) await new Promise(r => setTimeout(r, 100));
  const done = !/checking land swaps/i.test($('#modal').textContent); $('#modal').hidden = true; return {first, done}; });
T('Q-FIX', 'Fix: Mana opens at once and fills in', q6.first && q6.done, JSON.stringify(q6));
// Q7. Layouts: upright phones (390 and 320 wide), phone sideways, iPad portrait and landscape.
const q7 = {}; for (const [k, vw, vh] of [['phone', 390, 844], ['big', 320, 693], ['side', 844, 390], ['ipadP', 820, 1180], ['ipadL', 1180, 820]]){ await page.setViewportSize({width:vw, height:vh}); await page.waitForTimeout(150);
  q7[k] = await page.evaluate(() => { const r = {}; for (const t of ['list', 'up']){ const d = cur(); S.tab = t; render(); fitWork(); const w = document.querySelector('.work'), tabs = document.querySelector('.tabs'), pr = tabs.closest('.panel').getBoundingClientRect();
    r[t] = {fixed:!!w.style.height, tabsFit:tabs.scrollWidth <= tabs.clientWidth + 1, out:[...tabs.closest('.panel').querySelectorAll('button, input, .tab')].filter(e => e.offsetParent).filter(e => { const b = e.getBoundingClientRect(); return b.bottom > pr.bottom + 2 || b.right > pr.right + 2; }).length}; }
    S.view = 'home'; S.open = false; render(); const c = document.querySelector('.continue'); r.cont = !!c && getComputedStyle(c).display !== 'none'; S.view = 'decks'; S.open = true; render(); return r; }); }
await page.setViewportSize({width:1300, height:900}); await page.evaluate(() => render());
T('Q-LAYOUT', 'Phones (upright 390 and 320 wide, sideways): page scrolls, tabs fit, nothing past the frame, Continue card on home; iPad keeps its fixed working area and no Continue card', ['phone', 'big', 'side'].every(k => ['list', 'up'].every(t => !q7[k][t].fixed && q7[k][t].tabsFit) && q7[k].cont) && ['phone', 'big'].every(k => !q7[k].list.out && !q7[k].up.out) && ['ipadP', 'ipadL'].every(k => q7[k].list.fixed && q7[k].up.fixed && !q7[k].cont), JSON.stringify(q7));
// Q8. The background search runs to the end on a small pool and keeps only real finds.
await open('up', false);
const q8 = await page.evaluate(async () => { const d = cur(), n0 = UP.poolN; UP.poolN = 20; recsFor.k = null; render(); await recsReady(d); let R = recsFor(d);
  for (let i = 0; i < 600 && !(R.poolDone && R === recsFor(d)); i++){ await new Promise(r => setTimeout(r, 100)); R = recsFor(d); }
  UP.poolN = n0; S.syncRecs = true; return {done:!!R.poolDone, ok:R.paths.every(L => !L.top || !L.top.pool || L.top.dScore >= Math.max(scoreFloor(), UP.rankMin)), rows:document.querySelectorAll('.paths .path').length}; });
T('Q-SEARCH', 'Background search finishes, keeps only finds that raise the score, and the list stays shown', q8.done && q8.ok && q8.rows > 0, JSON.stringify(q8));
// Q9. A deck is generated for a commander.
const q9 = await page.evaluate(() => { const d = {id:'q', name:'q', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, cur().commander); const t0 = performance.now(), plan = buildPlan(d, [], null, new Set()); return {cards:plan.reduce((a, s) => a + s.q, 0), ms:Math.round(performance.now() - t0)}; });
T('Q-GENERATE', 'A full deck is generated for the commander', q9.cards === 99, JSON.stringify(q9));
T('Q-ERR', 'No page errors', !errs.length, errs.join(' | '));
console.log('\nbuild', build, '| quick check:', results.filter(r => r.pass).length, 'passed,', results.filter(r => !r.pass).length, 'failed in', Math.round((Date.now() - t00) / 1000), 's');
await b.close();
