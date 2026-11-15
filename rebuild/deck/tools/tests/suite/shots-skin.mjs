// Visual rebuild (stage 3c): one screenshot per Deck Builder route on each device, to compare with the handoff's
// screens/<route>/<device>.jpg. Serve rebuild/ (python3 -m http.server <port> from rebuild/) and give the test data folder
// (a setup.sh work folder's proto/, for the card snapshot and EDHREC pages):
//   PW=<playwright> DATA=<work>/proto OUT=<dir> node shots-skin.mjs <port> [route…] [PALETTE=ember]
// Devices: iPhone 844x390 and iPad 1180x820 held sideways, iPhone 390x844 upright; deviceScaleFactor 2.
// Files: <OUT>/<route>-<device>.png (device: iPhone, iPad, iPhone-portrait). Card pictures are not downloaded.
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW); const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DATA = path.resolve(process.env.DATA || '../'), SNAP = DATA + '/snapshot', OUT = path.resolve(process.env.OUT || 'shots');
const port = process.argv[2] || '8765', only = process.argv.slice(3);
fs.mkdirSync(OUT, {recursive: true});
const cards = zlib.gunzipSync(fs.readFileSync(SNAP + '/cards.json.gz')).toString(), tags = fs.readFileSync(SNAP + '/tags.json', 'utf8');
const DEVICES = [['iPhone', 844, 390, true], ['iPad', 1180, 820, true], ['iPhone-portrait', 390, 844, true]];
// route -> state set on the page (S.view, S.open, S.tab), or the card window
const ROUTES = {
  'deck-home': "S.view='home'; S.open=false;",
  'deck-list': "S.view='decks'; S.open=false;",
  'deck-builder': "S.view='deck'; S.open=false;",
  'deck-open': "S.view='decks'; S.open=true; S.tab='list';",
  'deck-upgrades': "S.view='decks'; S.open=true; S.tab='up';",
  'deck-stats': "S.view='decks'; S.open=true; S.tab='stats';",
  'deck-search': "S.view='search'; S.open=false;",
  'deck-buy': "S.view='buy'; S.open=false;",
  'deck-library': "S.view='library'; S.open=false;",
  'deck-profile': "S.view='profile'; S.open=false;",
  'deck-card': "S.view='decks'; S.open=true; S.tab='list'; CARD=1;"
};
const errs = [];
const b = await chromium.launch();
for (const [dev, vw, vh, touch] of DEVICES) {
  const ctx = await b.newContext({viewport: {width: vw, height: vh}, deviceScaleFactor: 2, isMobile: dev.startsWith('iPhone'), hasTouch: touch});
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(dev + ' pageerror: ' + e.message));
  await ctx.route('**/*', route => {
    const u = route.request().url(); let m;
    if (u.startsWith('http://127.0.0.1')) return route.continue();
    if ((m = /json\.edhrec\.com\/pages\/precon\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/precon/' + m[1] + '.json')) return route.fulfill({status: 200, contentType: 'application/json', body: fs.readFileSync(SNAP + '/precon/' + m[1] + '.json')});
    if ((m = /json\.edhrec\.com\/pages\/commanders\/([a-z0-9-]+)\/([a-z0-9-]+)\.json/.exec(u))) { const f = DATA + '/data2/themes/' + m[1] + '__' + m[2] + '.json'; return fs.existsSync(f) ? route.fulfill({status: 200, contentType: 'application/json', body: fs.readFileSync(f)}) : route.fulfill({status: 404, body: ''}); }
    if ((m = /json\.edhrec\.com\/pages\/commanders\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/edhrec/' + m[1] + '.json')) return route.fulfill({status: 200, contentType: 'application/json', body: fs.readFileSync(SNAP + '/edhrec/' + m[1] + '.json')});
    if (/combos\.json\.gz/.test(u)) return route.fulfill({status: 200, contentType: 'application/octet-stream', body: fs.readFileSync(DATA + '/data2/spellbook/combos.json.gz')});
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({status: 200, contentType: 'text/css', body: ''});
    return route.abort();
  });
  const pal = process.env.PALETTE;
  if (pal) await ctx.addInitScript(p => { try { localStorage.setItem('cc.look', JSON.stringify({palette: p})); } catch (e) {} }, pal);
  await page.goto('http://127.0.0.1:' + port + '/deck/index.html', {waitUntil: 'load'}); await page.waitForTimeout(1200);
  await page.evaluate(([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)) { const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows) { const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); }
    useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; useTags(JSON.parse(tg)); }, [cards, tags]);
  await page.evaluate(async () => { await loadPreconLive('wakanda-forever', 'Wakanda Forever'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.profile.example = false; S.deckId = d.id; touch(); recentAdd(d.id); await loadEdh(d.commander); await loadThemes(d.commander, d.aims); for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); });
  for (const [route, js] of Object.entries(ROUTES)) {
    if (only.length && !only.includes(route)) continue;
    await page.evaluate(async js => { let CARD = 0; $('#modal').hidden = true; eval(js); render(); if (typeof fitWork === 'function') fitWork(); window.scrollTo(0, 0);
      if (S.tab === 'up' && S.open) { const d = cur(); try { await recsReady(d); } catch (e) {} for (let i = 0; i < 100 && recsFor.v && recsFor.v.pool && !recsFor.v.poolDone; i++) await new Promise(r => setTimeout(r, 100)); render(); }
      const st = document.getElementById('status'); if (st) st.hidden = true;
      if (CARD) openCard('Sol Ring'); }, js);
    await page.waitForTimeout(500);
    await page.screenshot({path: OUT + '/' + route + '-' + dev + '.png'});
  }
  await ctx.close();
}
await b.close();
console.log('shots in', OUT, errs.length ? '\nerrors: ' + errs.join(' | ') : '(no page errors)');
