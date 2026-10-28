// Measures the upgrade box layout of the first suggested card on a touch phone, for one build. node layout-probe.mjs <port> <png>
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW); const fs = require('fs'), path = require('path'), zlib = require('zlib');
const here = path.dirname(new URL(import.meta.url).pathname), SNAP = path.resolve(here, '../snapshot');
const cards = zlib.gunzipSync(fs.readFileSync(SNAP + '/cards.json.gz')).toString();
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390, height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2});
await ctx.route('**/*', route => { const u = route.request().url(); if (u.startsWith('http://127.0.0.1')) return route.continue(); let m;
  if ((m = /pages\/precon\/([a-z0-9-]+)\.json/.exec(u))) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(SNAP + '/precon/' + m[1] + '.json')});
  if ((m = /pages\/commanders\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/edhrec/' + m[1] + '.json')) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(SNAP + '/edhrec/' + m[1] + '.json')});
  return route.abort(); });
const p = await ctx.newPage(); await p.goto('http://127.0.0.1:' + process.argv[2] + '/index.html'); await p.waitForTimeout(1000);
await p.evaluate(raw => { const rows = []; for (const o of JSON.parse(raw)){ const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows){ const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); } useFull([...best.values()], '2026-10-06', true); }, cards);
await p.evaluate(async () => { await loadPreconLive('tramplesaurus-rex', 'Tramplesaurus Rex'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); }); await p.waitForTimeout(800);
const r = await p.evaluate(() => { const path = document.querySelector('.paths .path'); if (!path) return null; path.scrollIntoView({block:'start'});
  const kids = [...path.children].map(e => { const r = e.getBoundingClientRect(); return {cls:e.className, top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height), text:e.innerText.replace(/\s+/g, ' ').slice(0, 40)}; });
  const ov = []; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (kids[i].h && kids[j].h && kids[i].top < kids[j].bottom && kids[j].top < kids[i].bottom) ov.push(kids[i].cls + ' / ' + kids[j].cls);
  return {display:getComputedStyle(path).display, cols:getComputedStyle(path).gridTemplateColumns, kids, overlaps:ov}; });
console.log(JSON.stringify(r, null, 1)); const el = await p.$('.paths .path'); if (el) await el.screenshot({path:process.argv[3]});
await b.close();
