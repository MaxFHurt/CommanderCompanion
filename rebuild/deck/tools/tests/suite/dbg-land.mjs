import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW); const fs = require('fs'), path = require('path'), zlib = require('zlib');
const here = path.dirname(new URL(import.meta.url).pathname), SNAP = path.resolve(here, '../snapshot');
const cards = zlib.gunzipSync(fs.readFileSync(SNAP + '/cards.json.gz')).toString(), tags = fs.readFileSync(SNAP + '/tags.json', 'utf8');
const b = await chromium.launch(); const ctx = await b.newContext(process.env.LAND ? {viewport:{width:844, height:390}, isMobile:true, hasTouch:true, deviceScaleFactor:2} : process.env.PHONE ? {viewport:{width:390, height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2} : (process.env.PORTRAIT ? {viewport:{width:820, height:1180}, deviceScaleFactor:2, hasTouch:true, isMobile:true} : {viewport:{width:1366, height:1024}, deviceScaleFactor:2, hasTouch:true})); const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
await ctx.route('**/*', route => { const u = route.request().url(); if (u.startsWith('http://127.0.0.1')) return route.continue(); let m;
  if ((m = /json\.edhrec\.com\/pages\/precon\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/precon/' + m[1] + '.json')) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(SNAP + '/precon/' + m[1] + '.json')});
  if ((m = /json\.edhrec\.com\/pages\/commanders\/([a-z0-9-]+)\/([a-z0-9-]+)\.json/.exec(u))){ const f = path.resolve(here, '../data2/themes/' + m[1] + '__' + m[2] + '.json'); return fs.existsSync(f) ? route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(f)}) : route.fulfill({status:404, body:''}); }
  if ((m = /json\.edhrec\.com\/pages\/commanders\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/edhrec/' + m[1] + '.json')) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(SNAP + '/edhrec/' + m[1] + '.json')});
  if (/combos\.json\.gz/.test(u)) return route.fulfill({status:200, contentType:'application/octet-stream', body:fs.readFileSync(path.resolve(here, '../data2/spellbook/combos.json.gz'))});
  if (/svgs\.scryfall\.io/.test(u)) return route.fulfill({status:200, contentType:'image/svg+xml', body:require('child_process').execSync('curl -s ' + JSON.stringify(u))}); return route.abort(); });
await page.goto('http://127.0.0.1:' + (process.argv[2] || 8765) + '/index.html', {waitUntil:'load'}); await page.waitForTimeout(1000);
await page.evaluate(([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)){ const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows){ const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); } useFull([...best.values()], '2026-10-06', true); useTags(JSON.parse(tg)); }, [cards, tags]);
globalThis.page = page; globalThis.errs = errs;
const script = fs.readFileSync(process.argv[3], 'utf8'); const r = await (new Function('page', 'errs', 'return (async () => {' + script + '})()'))(page, errs);
console.log(JSON.stringify(r, null, 1)); console.log('errors:', errs.join(' | ')); await b.close();
