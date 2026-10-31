// Browser tests on a fresh, throwaway profile. Scryfall and EDHREC requests are answered from the frozen snapshot; any other
// outside request is blocked. Usage: PW=<playwright path> node ui-test.mjs <port> <label>
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW); const fs = require('fs'), path = require('path'), zlib = require('zlib');
const here = path.dirname(new URL(import.meta.url).pathname), SNAP = path.resolve(here, '../snapshot'), OUT = path.resolve(here, '../out');
const port = process.argv[2] || '8765', label = process.argv[3] || 'ui';
const cards = zlib.gunzipSync(fs.readFileSync(SNAP + '/cards.json.gz')).toString(), RAWJ = JSON.parse(cards), tags = fs.readFileSync(SNAP + '/tags.json', 'utf8');
// FAST=1: skip the heaviest tests nothing later depends on (while working; the full run, without FAST, goes live).
// SHARD=k/N with SHARDPLAN=<file> (ui-par.mjs): run only this group's tests; the two tests that make the decks the others use
// run in every group, reported by group 0 only. Every test is wrapped in `if (RUN('<id>')) { ... }` (one id per test).
const FAST = !!process.env.FAST, SKIPPED = [], FASTSKIP = new Set(['UI-B135-01', 'UI-B144-02', 'UI-B138-01', 'UI-B134-01', 'UI-FIX-01', 'UI-B144-01', 'UI-B81-02']);
const SHARD = process.env.SHARD ? process.env.SHARD.split('/').map(Number) : null, PLAN = SHARD ? JSON.parse(require('fs').readFileSync(process.env.SHARDPLAN, 'utf8')) : null;
const ALWAYS = new Set(['UI-ID-01', 'UI-AIM-01']); let QUIET = false;
const RUN = id => { QUIET = false; if (FAST && FASTSKIP.has(id)){ SKIPPED.push(id); return false; } if (!SHARD) return true; if (ALWAYS.has(id)){ QUIET = SHARD[0] !== 0; return true; } return PLAN[SHARD[0]].includes(id); };
// grouped runs only: each test starts from a clean screen (no open window, no unsaved draft, the decks list), as it would on
// its own; the single-line run keeps every test's leftovers, exactly as before
const INJECT = ([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)){ const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows){ const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); }
  useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; S.autoYes = new Set(['swap', 'swap-top', 'swap-a3', 'want', 'fix-swap', 'swap-cap', 'add-to-deck', 'consider-in']); S.syncRecs = true; S.recFresh = true; window.planOnly = async (n, seeds) => { const nd = planDeck(n, null, null, {}); if (!nd) return null; await genRun(nd, seeds || [], null, ownSet()); openDraft(nd); S.tab = 'up'; S.planShow = 0; return nd; }; const t = JSON.parse(tg); useTags(t); };   // the setup's card data, injected again after a test reloads the page
const RESET = async () => { if (await page.evaluate(() => !(typeof DBINFO !== 'undefined' && DBINFO.source === 'full' && LIB.length > 20000))) await page.evaluate(INJECT, [cards, tags]); return page.evaluate(() => { try { window.planOnly = async (n, seeds) => { const nd = planDeck(n, null, null, {}); if (!nd) return null; await genRun(nd, seeds || [], null, ownSet()); openDraft(nd); S.tab = 'up'; S.planShow = 0; return nd; }; if (S.cores !== 1){ S.cores = 1; wkRestart(); }   /* grouped runs share 4 cores: one background helper per browser */ $('#modal').hidden = true; const c = $('#confirm'); if (c) c.hidden = true; askConfirm.pending = null; if (S.draft && !S.profile.decks.includes(S.draft)) S.draft = null; S.profile.decks = S.profile.decks.filter(Boolean); const w = S.profile.decks.find(x => /Wakanda/i.test(x.name)); if (w) S.deckId = w.id; S.view = 'decks'; S.open = true; S.tab = 'up'; S.syncRecs = true; S.upView = 'list'; render(); } catch (e) {} }).then(() => page.evaluate(async () => { for (let i = 0; i < 600; i++){ const R = typeof recsFor !== 'undefined' && recsFor.v; if (!R || R.pending || (R.pool && !R.poolDone)) { await new Promise(r => setTimeout(r, 100)); continue; } break; } })); };   // where UI-ID-01 leaves the app: Wakanda on Upgrades, its whole-card search finished (it re-sorts the list when done)
const results = []; const T = (id, desc, pass, detail) => { if (QUIET) return; results.push({id, desc, pass, detail}); console.log((pass ? 'PASS' : 'FAIL'), id.padEnd(9), desc, detail ? '— ' + detail : ''); };
const errs = [];
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1300, height:900}}); const page = await ctx.newPage();
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await ctx.route('**/*', route => { const u = route.request().url();
  if (u.startsWith('http://127.0.0.1')) return route.continue();
  let m;
  if ((m = /json\.edhrec\.com\/pages\/precon\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/precon/' + m[1] + '.json')) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(SNAP + '/precon/' + m[1] + '.json')});
  if ((m = /json\.edhrec\.com\/pages\/precon\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(path.resolve(here, '../data2/precon/' + m[1] + '.json'))) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(path.resolve(here, '../data2/precon/' + m[1] + '.json'))});   // the other precons (Family Matters...), 0.9.3
  if ((m = /json\.edhrec\.com\/pages\/tags\/([a-z0-9/-]+)\.json/.exec(u))){ const f = path.resolve(here, '../data2/tags/' + m[1].replace(/\//g, '_') + '.json'); return fs.existsSync(f) && fs.statSync(f).size > 500 ? route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(f)}) : route.fulfill({status:403, body:''}); }   // Build 145: theme pages for commanders without play data
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
  useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; S.autoYes = new Set(['swap', 'swap-top', 'swap-a3', 'want', 'fix-swap', 'swap-cap', 'add-to-deck', 'consider-in']); S.syncRecs = true; S.recFresh = true; window.planOnly = async (n, seeds) => { const nd = planDeck(n, null, null, {}); if (!nd) return null; await genRun(nd, seeds || [], null, ownSet()); openDraft(nd); S.tab = 'up'; S.planShow = 0; return nd; }; const t = JSON.parse(tg); useTags(t); }, [cards, tags]);
const build = await page.evaluate(() => window.BUILD);
// names one test sets and a later test reads (they always run in the same group, in order)
let btn, before, geo, mctx, b81c;
if (RUN('UI-BUNDLE')) { try { if (SHARD) await RESET();
// The page runs the minified bundles (tools/build.sh, 0.9.3): each must be made from the current readable files, and the page's
// file list (DEV_FILES, used with ?dev=1) must be files.json's. A stale bundle means: run sh tools/build.sh.
{ const base = 'http://127.0.0.1:' + port + '/', get = async f => Buffer.from(await (await fetch(base + f)).arrayBuffer()), crypto = require('crypto');
  const F = JSON.parse((await get('files.json')).toString()), fp = async L => { const h = crypto.createHash('sha256'); for (const f of L) h.update(await get(f)); return h.digest('hex').slice(0, 16); };
  const head = async f => ((/sources ([0-9a-f]{16})/.exec((await get(f)).toString('utf8', 0, 300)) || [])[1]);
  const app = (await head('app.min.js')) === (await fp(F.data.concat(F.engine, F.ui))), eng = (await head('engine.min.js')) === (await fp(F.data.concat(F.engine)));
  const devList = await page.evaluate(() => (window.DEV_FILES || []).join()), same = devList === F.data.concat(F.engine, F.ui).join();
  T('UI-BUNDLE', 'The live bundles are made from the current readable files (else run sh tools/build.sh) and the page’s file list matches files.json', app && eng && same, JSON.stringify({app, engine:eng, fileList:same})); }
} catch (e) { QUIET = false; T('UI-BUNDLE', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-DEV')) { try { if (SHARD) await RESET();
{ const p2 = await ctx.newPage(), e2 = []; p2.on('pageerror', e => e2.push(e.message)); await p2.goto('http://127.0.0.1:' + port + '/index.html?dev=1', {waitUntil:'load'}); await p2.waitForTimeout(1500);
  const r2 = await p2.evaluate(() => ({dev:window.DEV, fns:typeof handleAct === 'function' && typeof poolPromote === 'function' && typeof render === 'function'})); await p2.close();
  T('UI-DEV', 'With ?dev=1 the page runs the readable files, with no page errors', r2.dev === true && r2.fns && !e2.length, JSON.stringify(r2) + ' ' + e2.join(' | ')); }
} catch (e) { QUIET = false; T('UI-DEV', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-ID-01')) { try { if (SHARD) await RESET();

// 1. Native precon loader, Wakanda (alternate printed names) — the path that recommended installed cards before.
await page.evaluate(async () => { window.__save = async (slug, label) => { await loadPreconLive(slug, label); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); return d; }; await __save('wakanda-forever', 'Wakanda Forever'); }); await page.waitForTimeout(800);
await page.evaluate(async () => { const d = cur(); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); }); await page.waitForTimeout(800);
const w = await page.evaluate(() => { const d = cur(), R = recsFor(d), adds = R.paths.flatMap(L => Object.values(L.opts).map(p => p.add));
  return {name:d.name, size:analyze(d).size, unknown:analyze(d).unknown, installed:adds.filter(n => !!entryOf(d, n)), rows:R.paths.length, apex:R.paths.filter(L => L.opts.apex).length}; });
T('UI-ID-01', 'Precon loader (Wakanda): every card recognised, no installed card recommended', w.size === 100 && !w.unknown.length && !w.installed.length && w.rows > 0 && w.apex === w.rows, JSON.stringify(w));
} catch (e) { QUIET = false; T('UI-ID-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-EX-01')) { try { if (SHARD) await RESET();

// 2. The exclusion button: label, accessible name, explanation.
btn = await page.evaluate(() => { const b = document.querySelector('[data-act="dismiss"]'); return b ? {text:b.textContent.trim(), aria:b.getAttribute('aria-label'), n:b.dataset.n} : null; });
const helpText = await page.evaluate(() => { const b = document.querySelector('[data-act="dismiss"]'); return !!b && (b.title || '').includes('excludes that card from this deck’s recommendations. Your deck stays unchanged'); });   /* 0.9.3: explained on the button (How the tiers work removed) */
const oldLabel = await page.evaluate(() => document.body.innerText.includes('Not this card'));
T('UI-EX-01', 'Button reads “Remove suggestion”, names the card for screen readers, and is explained on the page', !!btn && btn.text === 'Remove suggestion' && btn.aria === 'Remove suggestion: ' + btn.n && helpText && !oldLabel, JSON.stringify(btn) + ' help text: ' + helpText + ', old label left: ' + oldLabel);
} catch (e) { QUIET = false; T('UI-EX-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-EX-02')) { try { if (SHARD) await RESET();

// 3. Clicking it excludes the card for this deck only; the deck is unchanged; nothing is swapped.
before = await page.evaluate(() => { const d = cur(); return {cards:JSON.stringify(d.cards), cmd:d.commander, size:analyze(d).size, recP:JSON.stringify(d.recP || {})}; });
btn.n = await page.evaluate(() => { const b = document.querySelector('[data-act="dismiss"]'); b.click(); return b.dataset.n; }); await page.click('#confirm [data-act="conf-yes"]');   // read and click in one step (the list can redraw in between) await page.waitForTimeout(400);
const after = await page.evaluate(n => { const d = cur(), R = recsFor(d); return {cards:JSON.stringify(d.cards), cmd:d.commander, size:analyze(d).size, dismissed:(d.dismissed || []).slice(), stillShown:R.paths.some(L => Object.values(L.opts).some(p => p.add === n)), toast:(document.querySelector('#toast') || {}).textContent || ''}; }, btn.n);
T('UI-EX-02', 'Excluding a suggestion leaves the deck, commander and card count unchanged and stops suggesting it', after.cards === before.cards && after.cmd === before.cmd && after.size === before.size && after.dismissed.includes(btn.n) && !after.stillShown && after.toast.includes('excluded from this deck’s recommendations'), 'toast: ' + after.toast);
} catch (e) { QUIET = false; T('UI-EX-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-EX-05a')) { try { if (SHARD) await RESET();
const heldAfter = await page.evaluate(() => JSON.stringify(cur().recP || {}));
T('UI-EX-05a', 'Other held picks are untouched by an exclusion', (() => { const a = JSON.parse(before.recP), z = JSON.parse(heldAfter); return Object.keys(a).filter(k => k !== btn.n.toLowerCase()).every(k => !z[k] || JSON.stringify(z[k].pair) === JSON.stringify(a[k].pair)); })(), Object.keys(JSON.parse(before.recP)).length + ' held before');
} catch (e) { QUIET = false; T('UI-EX-05a', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-EX-03')) { try { if (SHARD) await RESET();

// 4. Another deck is unaffected; an alternate printed title of an excluded card stays excluded.
const other = await page.evaluate(async () => { const d2 = await __save('avengers-assemble', 'Avengers Assemble'); return {dismissed:(d2.dismissed || []).length, id:d2.id}; }); await page.waitForTimeout(500);
const alt = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; await loadEdh(d.commander); ruleOut(d, 'Vibranium Dynamo'); const d2 = { ...d, cards:d.cards.filter(e => e.n !== 'Thran Dynamo' && e.n !== 'Vibranium Dynamo') }; d2.cards.push({n:'Sol Ring', q:0}); d2.cards = d2.cards.filter(e => e.q);
  const R = upgradePaths(d2); return {shown:R.paths.some(L => Object.values(L.opts).some(p => p.add === 'Thran Dynamo'))}; });
T('UI-EX-03', 'Another deck keeps its own (empty) exclusions; excluding “Vibranium Dynamo” also excludes Thran Dynamo', other.dismissed === 0 && !alt.shown, JSON.stringify({other, alt}));
} catch (e) { QUIET = false; T('UI-EX-03', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-EX-04')) { try { if (SHARD) await RESET();

// 5. Allow it again: the exclusion is cleared and the card is eligible (not forced in).
await page.evaluate(() => { S.tab = 'up'; render(); }); await page.waitForTimeout(300);
const allowBtn = await page.evaluate(n => { const b = [...document.querySelectorAll('[data-act="undismiss"]')].find(x => x.dataset.n === n); return b ? {text:b.textContent, aria:b.getAttribute('aria-label')} : null; }, btn.n);
const heading = await page.evaluate(() => document.body.innerText.includes('EXCLUDED CARDS FOR THIS DECK') || document.body.innerText.toLowerCase().includes('excluded cards for this deck'));
await page.evaluate(n => { const b = [...document.querySelectorAll('[data-act="undismiss"]')].find(x => x.dataset.n === n); if (b) b.click(); }, btn.n); await page.waitForTimeout(300);
const allowed = await page.evaluate(n => ({dismissed:(cur().dismissed || []).includes(n), toast:(document.querySelector('#toast') || {}).textContent || ''}), btn.n);
T('UI-EX-04', 'Allow-again control is labelled per card; using it clears the exclusion', !!allowBtn && allowBtn.aria === 'Allow ' + btn.n + ' in recommendations' && heading && !allowed.dismissed && allowed.toast.includes('allowed in this deck’s recommendations'), JSON.stringify({allowBtn, heading, allowed}));
} catch (e) { QUIET = false; T('UI-EX-04', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-EX-05')) { try { if (SHARD) await RESET();

// 6. Exclusions persist through a reload of the same (throwaway) profile; holds come back unchanged.
await page.evaluate(n => { ruleOut(cur(), n); touch(); }, btn.n); await page.waitForTimeout(1500);
const held1 = await page.evaluate(() => JSON.stringify(cur().recP || {}));
await page.reload({waitUntil:'load'}); await page.waitForTimeout(1500);
const persisted = await page.evaluate(n => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); return {excluded:!!d && (d.dismissed || []).includes(n), held:JSON.stringify(d && d.recP || {})}; }, btn.n);
T('UI-EX-05', 'Exclusions and holds survive a reload (existing storage, 80-entry limit unchanged)', persisted.excluded && persisted.held === held1, 'held picks ' + Object.keys(JSON.parse(held1)).length);
} catch (e) { QUIET = false; T('UI-EX-05', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-LAYOUT-1')) { try { if (SHARD) await RESET();

// 7. Phone layout on a real touch-phone profile (390px wide, touch screen): the longer label fits beside Swap without
// covering it, tap targets are usable, and the page does not scroll sideways. A separate throwaway context.
mctx = await b.newContext({viewport:{width:390, height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2});
await mctx.route('**/*', route => { const u = route.request().url(); if (u.startsWith('http://127.0.0.1')) return route.continue(); let m;
  if ((m = /json\.edhrec\.com\/pages\/precon\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/precon/' + m[1] + '.json')) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(SNAP + '/precon/' + m[1] + '.json')});
  if ((m = /json\.edhrec\.com\/pages\/precon\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(path.resolve(here, '../data2/precon/' + m[1] + '.json'))) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(path.resolve(here, '../data2/precon/' + m[1] + '.json'))});   // the other precons (Family Matters...), 0.9.3
  if ((m = /json\.edhrec\.com\/pages\/tags\/([a-z0-9/-]+)\.json/.exec(u))){ const f = path.resolve(here, '../data2/tags/' + m[1].replace(/\//g, '_') + '.json'); return fs.existsSync(f) && fs.statSync(f).size > 500 ? route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(f)}) : route.fulfill({status:403, body:''}); }   // Build 145: theme pages for commanders without play data
  if ((m = /json\.edhrec\.com\/pages\/commanders\/([a-z0-9-]+)\/([a-z0-9-]+)\.json/.exec(u))){ const f = path.resolve(here, '../data2/themes/' + m[1] + '__' + m[2] + '.json'); return fs.existsSync(f) ? route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(f)}) : route.fulfill({status:404, body:''}); }
  if ((m = /json\.edhrec\.com\/pages\/commanders\/([a-z0-9-]+)\.json/.exec(u)) && fs.existsSync(SNAP + '/edhrec/' + m[1] + '.json')) return route.fulfill({status:200, contentType:'application/json', body:fs.readFileSync(SNAP + '/edhrec/' + m[1] + '.json')});
  if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({status:200, contentType:'text/css', body:''}); return route.abort(); });
const mp = await mctx.newPage(); mp.on('pageerror', e => errs.push('mobile pageerror: ' + e.message));
await mp.goto('http://127.0.0.1:' + port + '/index.html', {waitUntil:'load'}); await mp.waitForTimeout(1000);
await mp.evaluate(([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)){ const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows){ const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); } useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; S.autoYes = new Set(['swap', 'swap-top', 'swap-a3', 'want', 'fix-swap', 'swap-cap', 'add-to-deck', 'consider-in']); S.syncRecs = true; S.recFresh = true; useTags(JSON.parse(tg)); }, [cards, tags]);
await mp.evaluate(async () => { await loadPreconLive('wakanda-forever', 'Wakanda Forever'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); }); await mp.waitForTimeout(700);
geo = await mp.evaluate(() => { const o = document.querySelector('.opt [data-act="dismiss"]'); if (!o) return null; const s = o.parentElement.querySelector('[data-act="swap"]'), a = o.getBoundingClientRect(), c = s.getBoundingClientRect();
  const overlap = !(a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top); o.scrollIntoView({block:'center'}); return {coarse:matchMedia('(pointer:coarse)').matches, overlap, dismissH:Math.round(a.height), swapH:Math.round(c.height), dismissW:Math.round(a.width), swapW:Math.round(c.width), pageScrollX:document.documentElement.scrollWidth > innerWidth + 1}; });
await mp.waitForTimeout(300); { const opt = await mp.$('.opt [data-act="dismiss"]'); if (opt){ const box = await (await opt.evaluateHandle(e => e.closest('.path'))).boundingBox(); if (box) await mp.screenshot({path:OUT + '/' + label + '-mobile.png', clip:{x:0, y:Math.max(0, box.y - 8), width:390, height:Math.min(1400, box.height + 16)}}); } }
const lay = await mp.evaluate(() => (() => { let bad = 0, n = 0; [...document.querySelectorAll('.paths .path')].slice(0, 6).forEach(path => { const k = [...path.children].map(e => e.getBoundingClientRect()).filter(r => r.height > 0); n++;
  for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (k[i].top < k[j].bottom - 1 && k[j].top < k[i].bottom - 1 && k[i].left < k[j].right - 1 && k[j].left < k[i].right - 1) bad++; }); return {cards:n, overlaps:bad}; })());
T('UI-LAYOUT-1', 'Touch phone: no parts of an upgrade card overlap (first 6 cards)', lay.cards > 0 && !lay.overlaps, JSON.stringify(lay));
} catch (e) { QUIET = false; T('UI-LAYOUT-1', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-EX-06')) { try { if (SHARD) await RESET();
T('UI-EX-06', 'Touch phone (390px): button and Swap do not overlap, both at least 24px tall (WCAG 2.2 minimum target size), no sideways scrolling', !!geo && geo.coarse && !geo.overlap && geo.dismissH >= 24 && geo.swapH >= 24 && !geo.pageScrollX, JSON.stringify(geo));
} catch (e) { QUIET = false; T('UI-EX-06', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-LAYOUT-2')) { try { if (SHARD) await RESET();
await mctx.close();

// 8. Tier display: empty tiers give reasons; Apply all applies a validated package and keeps 100 cards.
// the reload in step 6 dropped the injected card data: load it again and reopen the Wakanda deck
await page.evaluate(([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)){ const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows){ const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); } useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; S.autoYes = new Set(['swap', 'swap-top', 'swap-a3', 'want', 'fix-swap', 'swap-cap', 'add-to-deck', 'consider-in']); S.syncRecs = true; S.recFresh = true; useTags(JSON.parse(tg)); }, [cards, tags]);
await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); }); await page.waitForTimeout(700);
const lay2 = await page.evaluate(() => (() => { let bad = 0, n = 0; [...document.querySelectorAll('.paths .path')].slice(0, 6).forEach(path => { const k = [...path.children].map(e => e.getBoundingClientRect()).filter(r => r.height > 0); n++;
  for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (k[i].top < k[j].bottom - 1 && k[j].top < k[i].bottom - 1 && k[i].left < k[j].right - 1 && k[j].left < k[i].right - 1) bad++; }); return {cards:n, overlaps:bad}; })());
T('UI-LAYOUT-2', 'Desktop: no parts of an upgrade card overlap (first 6 cards)', lay2.cards > 0 && !lay2.overlaps, JSON.stringify(lay2));
} catch (e) { QUIET = false; T('UI-LAYOUT-2', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-TIER-01')) { try { if (SHARD) await RESET();
const tiers = await page.evaluate(() => { const none = [...document.querySelectorAll('.opt.none p')].map(p => p.textContent); return {empty:none.length, blank:none.filter(t => !t.trim()).length, sample:none.slice(0, 3)}; });
T('UI-TIER-01', 'Empty tiers show their reason on the page', tiers.empty > 0 && tiers.blank === 0, JSON.stringify(tiers));
} catch (e) { QUIET = false; T('UI-TIER-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-CAP-01')) { try { if (SHARD) await RESET();
// 9. "Best deck with every new card under $3": shown in the Budget box; Apply adds only cards under $3 each; deck stays valid.
await page.evaluate(async () => { await loadPreconLive('avengers-assemble', 'Avengers Assemble'); const d0 = S.draft; S.profile.decks.unshift(d0); S.draft = null; S.deckId = d0.id; touch(); const d = cur(); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); }); await page.waitForTimeout(900);
await page.evaluate(() => { handleAct('cap-show', 'budget'); });
const cap = await page.evaluate(() => { const d = cur(), before = new Set(d.cards.map(e => keyOf(e.n))), box = document.querySelector('[data-act="swap-cap"][data-v="budget"]'), shown = !!box && /every new card under \$3/.test(box.closest('.capbox').textContent);
  if (box) box.click(); const added = d.cards.filter(e => !before.has(keyOf(e.n))).map(e => ({n:e.n, p:(find(e.n) || {}).p}));
  return {shown, added:added.length, over:added.filter(x => !(x.p != null && x.p < 3)), size:analyze(d).size, v:validateDeck(d).map(x => x.key), toast:(document.querySelector('#toast') || {}).textContent}; });
T('UI-CAP-01', 'Budget box offers “best deck with every new card under $3”; Apply adds only cards under $3 each and the deck stays a valid 100', cap.shown && cap.added > 0 && !cap.over.length && cap.size === 100 && !cap.v.length && /under \$3 each/.test(cap.toast), JSON.stringify(cap));
} catch (e) { QUIET = false; T('UI-CAP-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-AIM-01')) { try { if (SHARD) await RESET();
await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); }); await page.waitForTimeout(700);
// 10. Mechanics: a deck takes its commander's own themes (what players build it around); reordering them steers the picks.
await page.evaluate(async () => { await loadPreconLive('doom-prevails', 'Doom Prevails'); const d0 = S.draft; S.profile.decks.unshift(d0); S.draft = null; S.deckId = d0.id; touch(); const d = cur(); S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); ensureEdh(); }); await page.waitForTimeout(1500);
const aimA = await page.evaluate(() => { const d = cur(); return {aims:d.aims.slice(), auto:d.aimAuto, labels:d.aims.map(a => aimLabel(a)), loaded:Object.keys(EDH.tmap), picks:recsFor(d).paths.map(L => L.opts.apex && L.opts.apex.add)}; });
await page.evaluate(() => { S.tab = 'build'; render(); }); await page.waitForTimeout(300);
await page.evaluate(() => { const c = document.querySelector('[data-act="build-custom"]'); if (c) c.click(); }); await page.waitForTimeout(300);
const shown = await page.evaluate(() => { const t = document.body.innerText; return cur().aims.map(a => aimLabel(a)).every(l => t.includes(l)) && !!document.querySelector('[data-act="mech-list"]') && (openMechList(), /mechanics \(how players build it\)/.test(document.querySelector('#modal').textContent)) && (($('#modal').hidden = true), true); });
await page.evaluate(() => { const b = document.querySelector('[data-act="aim-down"][data-v="0"]'); if (b) b.click(); }); await page.waitForTimeout(1500);
const aimB = await page.evaluate(() => { const d = cur(); return {aims:d.aims.slice(), auto:d.aimAuto, picks:recsFor(d).paths.map(L => L.opts.apex && L.opts.apex.add)}; });
const diff = aimB.picks.filter(x => !aimA.picks.includes(x)).length + aimA.picks.filter(x => !aimB.picks.includes(x)).length;
T('UI-AIM-01', 'Mechanics are the commander’s own themes (shown, with its other themes offered first); reordering them is kept and changes the picks', aimA.aims.length && aimA.aims.every(a => a.startsWith('edh:')) && aimA.auto === true && shown && aimB.auto === false && aimB.aims[0] === aimA.aims[1] && diff > 0,
  JSON.stringify({before:aimA.labels, loaded:aimA.loaded, shown, after:aimB.aims, changedPicks:diff}));
} catch (e) { QUIET = false; T('UI-AIM-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-MIX-01')) { try { if (SHARD) await RESET();
await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); }); await page.waitForTimeout(700);
const applied = await page.evaluate(() => { const d = cur(); window.__mix = JSON.stringify(d); const n0 = recsFor(d).paths.length; const b = document.querySelector('[data-act="swap-all"][data-v="apex"]'); b.click(); { const cf = document.querySelector('#confirm'); if (cf && !cf.hidden) cf.querySelector('[data-act="conf-yes"]').click(); } return {n0, size:analyze(d).size, v:validateDeck(d).map(x => x.key), toast:(document.querySelector('#toast') || {}).textContent}; });
T('UI-MIX-01', 'Apply all (Apex) makes the swaps as one checked package; the deck stays a valid 100 cards', applied.size === 100 && !applied.v.length && /Made \d+ Apex swap/.test(applied.toast), JSON.stringify(applied));
await page.evaluate(() => { const d = cur(); Object.keys(d).forEach(k => delete d[k]); Object.assign(d, JSON.parse(window.__mix)); delete window.__mix; recsFor.k = null; render(); });   // the other tests use Wakanda as built
} catch (e) { QUIET = false; T('UI-MIX-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-COMBO-01')) { try { if (SHARD) await RESET();
// 11. Combos load from the card-data branch (served here from the frozen copy) and are kept in the browser.
const cmb = await page.evaluate(async () => { await loadCombos(true); const v = await idb('readonly', st => st.get('combos')); return {n:COMBOS.list.length, state:COMBOS.state, cached:!!(v && v.j && v.j.combos && v.j.combos.length)}; });
T('UI-COMBO-01', 'Combo data (Commander Spellbook, via the card-data branch) loads, is indexed and is cached in the browser', cmb.n > 1000 && cmb.state === 'ok' && cmb.cached, JSON.stringify(cmb));
} catch (e) { QUIET = false; T('UI-COMBO-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-SCORE-01')) { try { if (SHARD) await RESET();
// 12. Deck score: five categories with reasons, how the commander works (reviewed profile), how the deck wins.
await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'stats'; await loadEdh(d.commander); render(); }); await page.waitForTimeout(900);
for (let i = 0; i < 40 && await page.evaluate(() => !/% of the Apex build/.test(document.body.textContent)); i++) await page.waitForTimeout(250);
const sc = await page.evaluate(() => { const det = document.querySelector('#score-more'); if (det) det.open = true; const t = document.body.textContent; return {score:/Deck score · \d+ of 100/.test(t), cats:['Synergy', 'Balance', 'Card quality', 'Win routes', 'Mana and curve'].every(x => t.includes(x)), profile:null, wins:null, apex:(/Card quality: (\d+)% of the Apex build/.exec(t) || [])[1], tierLine:/% of the best build with every card under \$(3|12)/.test(t), tier:cur().tier}; });
{ const gp = await page.evaluate(() => { S.tab = 'up'; render(); const det = document.querySelector('#plan-more'); if (det) det.open = true; const t = det ? det.textContent : '';   /* 0.9.20: the game plan moved to Upgrades */
  const r = {profile:/How T.Challa works/.test(t) && /Vibranium tokens are artifacts, not creatures/.test(t), wins:/How it wins/.test(t)}; S.tab = 'stats'; render(); return r; }); sc.profile = gp.profile; sc.wins = gp.wins; }
T('UI-SCORE-01', 'Deck score shows five categories with reasons, card quality as a share of the Apex build (plus the under-$3/$12 line for Budget and Mid decks), the commander’s reviewed profile, and how the deck wins', sc.score && sc.cats && sc.profile && sc.wins && +sc.apex >= 0 && +sc.apex <= 100 && (sc.tier === 'apex' || sc.tierLine), JSON.stringify(sc));
} catch (e) { QUIET = false; T('UI-SCORE-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-GEN-01')) { try { if (SHARD) await RESET();
// 13. Generate from a commander with a partner chosen first.
const g1 = await page.evaluate(async () => { S.gen.cmd = 'Leonardo, the Balance'; S.gen.partner = ''; openGenerate(); const chips = [...document.querySelectorAll('[data-act="gen-partner"]')].map(b => b.dataset.n).filter(Boolean);
  if (!chips.length) return {chips:0}; document.querySelector('[data-act="gen-partner"][data-n="' + chips[0].replace(/"/g, '\\"') + '"]').click(); const picked = S.gen.partner, note = /designed for Leonardo and/.test(document.querySelector('#modal').innerText);
  document.querySelector('[data-act="gen-go"]').click(); await new Promise(r => setTimeout(r, 300)); for (let i = 0; i < 300 && !(S.draft && S.draft.cards.length); i++) await new Promise(r => setTimeout(r, 200)); const d = S.draft; return {chips:chips.length, picked, note, partner:d && d.partner, cards:d ? d.cards.reduce((a, x) => a + x.q, 0) : 0, plan:d && d.plan ? d.plan.length : 0, tab:S.tab}; });
T('UI-GEN-01', 'Generate from a commander: a Partner commander offers its second commander first; the build is designed for both and all 98 cards go straight into the decklist', g1.chips > 0 && g1.picked && g1.note && g1.partner === g1.picked && g1.cards === 98 && !g1.plan && g1.tab === 'list', JSON.stringify(g1));
} catch (e) { QUIET = false; T('UI-GEN-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-GEN-02')) { try { if (SHARD) await RESET();
// 14. Customize → Generate: a new deck with the same mechanics in the same order; the original deck is unchanged.
const g2 = await page.evaluate(async () => { S.draft = null; const d = S.profile.decks.find(x => /Doom/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'build'; d.custom = true; render();
  const before = JSON.stringify({cards:d.cards, aims:d.aims}), btn = document.querySelector('[data-act="build-gen"]'); if (!btn) return {btn:false}; btn.click(); { const cf = document.querySelector('#confirm'); if (cf && !cf.hidden) cf.querySelector('[data-act="conf-yes"]').click(); } await new Promise(r => setTimeout(r, 300));
  for (let i = 0; i < 300 && (thinkThen.busy || !(S.draft && S.draft.cards.length)); i++) await new Promise(r => setTimeout(r, 100));   // the build runs in the background (Build 143-144)
  const nd = S.draft; return {btn:true, newDeck:!!nd && nd.id !== d.id, aims:nd && JSON.stringify(nd.aims) === JSON.stringify(d.aims), cards:nd ? nd.cards.reduce((a, x) => a + x.q, 0) : 0, untouched:JSON.stringify({cards:d.cards, aims:d.aims}) === before}; });
T('UI-GEN-02', 'Customize panel has Generate: it designs a new build with the same mechanics in order; the original deck is untouched', g2.btn && g2.newDeck && g2.aims && g2.cards === 99 && g2.untouched, JSON.stringify(g2));
} catch (e) { QUIET = false; T('UI-GEN-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-SET-01')) { try { if (SHARD) await RESET();
// 15. Card sets as a generation filter (rule): every non-basic card of the build is printed in the chosen sets.
const g3 = await page.evaluate(async () => { S.draft = null; S.gen = {cmd:'Captain America, Team Leader', tier:'budget', partner:'', sets:[], setsMust:false}; openGenerate(); await new Promise(r => setTimeout(r, 400));
  const inp = document.querySelector('#gset-add'); if (!inp) return {input:false}; inp.value = 'Marvel Super Heroes Commander (MSC)'; inp.dispatchEvent(new Event('change', {bubbles:true})); await new Promise(r => setTimeout(r, 300));
  const inp2 = document.querySelector('#gset-add'); inp2.value = 'msh'; inp2.dispatchEvent(new Event('change', {bubbles:true})); await new Promise(r => setTimeout(r, 300));
  document.querySelector('[data-act="gset-must"]').click(); const label = (document.querySelector('[data-act="gset-must"]') || {}).textContent;
  document.querySelector('[data-act="gen-go"]').click(); for (let i = 0; i < 60 && !(S.draft && S.draft.cards.length); i++) await new Promise(r => setTimeout(r, 200));
  const d = S.draft; if (!d || !d.cards.length) return {draft:false, label}; const all = d.cards.map(e => find(e.n)).concat((d.plan || []).flatMap(x => [x.a, x.m, x.b].filter(Boolean)).map(find)).filter(Boolean);
  return {sets:d.sets, must:d.setsMust, label, slots:d.cards.reduce((a, x) => a + x.q, 0), outside:all.filter(c => !isBasic(c.n) && !inSets(c, d)).map(c => c.n).slice(0, 5)}; });
T('UI-SET-01', 'Generate: card sets as a rule; every card put in the deck (and every stand-in left over) is printed in the chosen sets or is a basic land', g3.must && g3.sets && g3.sets.join() === 'msc,msh' && /Only these sets/.test(g3.label) && g3.slots > 0 && !g3.outside.length, JSON.stringify(g3));
} catch (e) { QUIET = false; T('UI-SET-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-BUD-01')) { try { if (SHARD) await RESET();
// 15a. Entered budget (owner, 20 Oct): Budget generation takes a total budget and asks whether the commander is owned; the deck fits
// it (owned cards, an owned commander and basic lands are free). Other price levels show no budget box.
const gb = await page.evaluate(async () => { S.draft = null; S.gen = {cmd:'Captain America, Team Leader', tier:'apex', partner:'', sets:[], setsMust:false}; openGenerate(); const M = () => document.querySelector('#modal');
  const apexBox = !!M().querySelector('#gen-budget'); M().querySelector('[data-act="gen-tier"][data-v="budget"]').click();
  const inp = M().querySelector('#gen-budget'), own = M().querySelector('[data-act="gen-cmdown"]'); if (!inp || !own) return {apexBox, box:!!inp, own:!!own};
  inp.value = '40'; inp.dispatchEvent(new Event('change', {bubbles:true})); own.click(); const kept = (M().querySelector('#gen-budget') || {}).value, note = /commander[^.]*free|so is your commander/i.test(M().innerText);
  M().querySelector('[data-act="gen-go"]').click(); await new Promise(r => setTimeout(r, 300)); for (let i = 0; i < 300 && !(S.draft && S.draft.cards.length); i++) await new Promise(r => setTimeout(r, 200));
  const d = S.draft; if (!d) return {apexBox, box:true, own:true, draft:false};
  return {apexBox, box:true, own:true, kept, note, budget:d.budget, cost:deckCost(d, ownSet()), cards:d.cards.reduce((a, x) => a + x.q, 0)}; });
T('UI-BUD-01', 'Generate at Budget with a total budget: the box appears only for Budget, the owned commander is free and the deck costs no more than the budget', !gb.apexBox && gb.box && gb.own && gb.kept === '40' && gb.note && gb.budget && gb.budget.total === 40 && gb.budget.cmdOwned && gb.cost <= 40 && gb.cards === 99, JSON.stringify(gb));
} catch (e) { QUIET = false; T('UI-BUD-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-GEN-03')) { try { if (SHARD) await RESET();
// 15b. How to build it: Best overall / Theme first / mechanics are switches that combine where they can, with an alert when a choice
// switches another off; the deck is filled at the chosen price level and is more on theme than Best overall.
const g4 = await page.evaluate(async () => { S.draft = null; S.gen = {cmd:'Captain America, Team Leader', partner:'', sets:[], setsMust:false}; openGenerate(); await loadEdh(S.gen.cmd); openGenerate(); const M = () => document.querySelector('#modal');
  const o = {start:{best:S.gen.best, theme:S.gen.theme}}; M().querySelector('[data-act="gen-theme"]').click(); o.theme = {best:S.gen.best, theme:S.gen.theme, alert:/Best overall was switched off/.test(M().innerText)};
  M().querySelector('[data-act="gen-mechon"]').click(); const mb = M().querySelector('[data-act="gen-mech"]'); if (mb) mb.click(); o.mech = {n:S.gen.mech.length, theme:S.gen.theme, noAlert:!M().querySelector('#genmode [role="alert"]')};
  M().querySelector('[data-act="gen-best"]').click(); o.best = {best:S.gen.best, theme:S.gen.theme, mech:S.gen.mech.length, alert:/were switched off/.test(M().innerText)};
  M().querySelector('[data-act="gen-theme"]').click(); M().querySelector('[data-act="gen-tier"][data-v="mid"]').click(); M().querySelector('[data-act="gen-go"]').click();
  for (let i = 0; i < 300 && !(S.draft && S.draft.cards.length); i++) await new Promise(r => setTimeout(r, 200)); const d = S.draft; if (!d) return o;   // up to 60 s, like UI-GEN-01 (about 20 s here)
  const T = themeCtx(d), sp = d.cards.map(e => find(e.n)).filter(c => c && !tags(c).land); o.deck = {cards:d.cards.reduce((a, e) => a + e.q, 0), themeFirst:!!d.themeFirst, onTheme:sp.filter(c => themeOf(c, T)).length, over12:d.cards.filter(e => { const c = find(e.n); return c && !isBasic(c.n) && c.p != null && c.p >= 12; }).length, tab:S.tab};
  const b = await startPlan('Captain America, Team Leader', [], null, null, {fill:'mid', aims:d.aims}); o.bestOn = b.cards.map(e => find(e.n)).filter(c => c && !tags(c).land && themeOf(c, T)).length; return o; });
T('UI-GEN-03', 'Generate options: Theme first switches Best overall off (with an alert), Theme first and mechanics combine, Best overall switches both off (with an alert); a Mid Theme-first deck is filled with nothing over $12 and is more on theme than Best overall', g4.start && g4.start.best && g4.theme && !g4.theme.best && g4.theme.theme && g4.theme.alert && g4.mech && g4.mech.n === 1 && g4.mech.theme && g4.best && g4.best.best && !g4.best.theme && !g4.best.mech && g4.best.alert && g4.deck && g4.deck.cards === 99 && g4.deck.themeFirst && !g4.deck.over12 && g4.deck.tab === 'list' && g4.deck.onTheme > g4.bestOn, JSON.stringify(g4));
} catch (e) { QUIET = false; T('UI-GEN-03', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-UPX-01')) { try { if (SHARD) await RESET();
// 16. Card search marks cards that are suggested upgrades for one of the player's decks; the card shows which deck and what it replaces.
const u1 = await page.evaluate(async () => { S.draft = null; S.view = 'search'; render(); for (let i = 0; i < 100 && (UPX.busy || !UPX.map.size); i++) await new Promise(r => setTimeout(r, 200));
  const [k, L] = [...UPX.map.entries()].find(([k, L]) => L.some(x => x.t === 'apex')) || []; if (!k) return {index:0}; const c = find(k); S.search.q = c.n; render(); await new Promise(r => setTimeout(r, 300));
  const badge = !!document.querySelector('.cards .card .upb'); document.querySelector('.cards .card').click(); await new Promise(r => setTimeout(r, 300));
  const t = document.querySelector('#modal').textContent, d = S.profile.decks.find(x => x.id === L[0].id); S.deckId = d.id; await loadEdh(d.commander); await loadThemes(d.commander, d.aims); const real = recsFor(d).paths.some(P => Object.values(P.opts).some(p => p && p.add === c.n && p.cut === L[0].cut));
  return {index:UPX.map.size, card:c.n, badge, modal:/Upgrade for/.test(t) && t.includes(L[0].cut), matchesDeckView:real}; });
T('UI-UPX-01', 'Card search: a card that is a suggested upgrade for one of your decks is marked, and its details name the deck and the card it replaces (same as that deck’s Upgrades tab)', u1.index > 0 && u1.badge && u1.modal && u1.matchesDeckView, JSON.stringify(u1));
} catch (e) { QUIET = false; T('UI-UPX-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-SET-02')) { try { if (SHARD) await RESET();
// 17. Customize: a set added as a rule is saved with the deck (survives a reload) and every suggested upgrade obeys it.
const s1 = await page.evaluate(async () => { S.draft = null; const d = S.profile.decks.find(x => /Doom/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'build'; d.custom = true; render();
  const inp = document.querySelector('#dset-add'); if (!inp) return {input:false}; inp.value = 'msh'; inp.dispatchEvent(new Event('change', {bubbles:true})); for (let i = 0; i < 30 && !SETCARDS.has('msh'); i++) await new Promise(r => setTimeout(r, 100));
  document.querySelector('[data-act="dset-must"]').click(); touch(); await new Promise(r => setTimeout(r, 1700)); return {id:d.id, sets:d.sets, must:d.setsMust}; });
await page.reload({waitUntil:'load'}); await page.waitForTimeout(1500);
await page.evaluate(([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)){ const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows){ const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); } useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; S.autoYes = new Set(['swap', 'swap-top', 'swap-a3', 'want', 'fix-swap', 'swap-cap', 'add-to-deck', 'consider-in']); S.syncRecs = true; S.recFresh = true; useTags(JSON.parse(tg)); }, [cards, tags]);
const s2 = await page.evaluate(async id => { const d = S.profile.decks.find(x => x.id === id); S.deckId = id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); for (let i = 0; i < 30 && !SETCARDS.has('msh'); i++) await new Promise(r => setTimeout(r, 100));
  const R = recsFor(d), adds = R.paths.flatMap(P => Object.values(P.opts).filter(Boolean).map(p => p.add)).map(find).filter(Boolean);
  return {sets:d.sets, must:d.setsMust, adds:adds.length, outside:adds.filter(c => !isBasic(c.n) && !inSets(c, d)).map(c => c.n).slice(0, 5)}; }, s1.id);
T('UI-SET-02', 'Customize: a card set added as a rule is saved with the deck, survives a reload, and every suggested upgrade is printed in that set', s1.must && s2.must && JSON.stringify(s2.sets) === '["msh"]' && !s2.outside.length, JSON.stringify({s1, s2}));
} catch (e) { QUIET = false; T('UI-SET-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-FIX-01')) { try { if (SHARD) await RESET();
// 18. Fixed bugs: an unreadable set is not asked for again and again; Generate in Customize keeps colours and tribe and never drops a draft.
const fx = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Doom/i.test(x.name)); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up';
  let renders = 0; const r0 = window.render; window.render = function(){ renders++; return r0.apply(this, arguments); };
  d.sets = ['err']; d.setsMust = false; render(); for (let i = 0; i < 40 && !SETFAIL.has('err'); i++) await new Promise(r => setTimeout(r, 250)); await new Promise(r => setTimeout(r, 2000)); window.render = r0; const loopRenders = renders;
  d.sets = []; d.colors = [d.colors[0]]; d.custom = true; const dr = newDeck({name:'Unsaved test draft', format:'commander'}); S.deckId = d.id;
  const nd = await regenBuild(d); const keptDraft = S.profile.decks.some(x => x.id === dr.id) || S.draft === dr;
  return {loopRenders, failed:SETFAIL.has('err'), colours:nd && JSON.stringify(nd.colors) === JSON.stringify(d.colors), draftKept:keptDraft}; });
const fx2 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Doom/i.test(x.name)); S.deckId = d.id; const dr = newDeck({name:'Unsaved test draft 2', format:'commander'}); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'build'; render(); const b = document.querySelector('[data-act="build-gen"]'); if (b) b.click(); { const cf = document.querySelector('#confirm'); if (cf && !cf.hidden) cf.querySelector('[data-act="conf-yes"]').click(); } await new Promise(r => setTimeout(r, 300)); for (let i = 0; i < 300 && thinkThen.busy; i++) await new Promise(r => setTimeout(r, 100)); return {saved:S.profile.decks.some(x => x.id === dr.id)}; });
T('UI-FIX-01', 'An unreadable card set is tried once, not in a loop; Generate in Customize keeps the deck’s colours; an unsaved draft is saved, not lost, when Generate opens a new deck', fx.loopRenders < 12 && fx.failed && fx.colours && fx2.saved, JSON.stringify({fx, fx2}));
} catch (e) { QUIET = false; T('UI-FIX-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-BUY-01')) { try { if (SHARD) await RESET();
// 19. Card search → add a card to a chosen deck's buy list; the deck it upgrades is chosen first; decks it can't go in are disabled.
const w1 = await page.evaluate(async () => { S.draft = null; S.view = 'search'; render(); for (let i = 0; i < 100 && (UPX.busy || !UPX.map.size); i++) await new Promise(r => setTimeout(r, 200));
  const [k, L] = [...UPX.map.entries()][0] || []; if (!k) return {index:0}; const c = find(k); S.search.q = c.n; render(); await new Promise(r => setTimeout(r, 300));
  [...document.querySelectorAll('.cards .card')].find(x => x.dataset.n === c.n).click(); await new Promise(r => setTimeout(r, 300));
  const sel = document.querySelector('#want-deck'); if (!sel) return {box:false}; const chosen = sel.value, disabled = [...sel.options].filter(o => o.disabled).map(o => o.textContent);
  const offDeck = S.profile.decks.find(x => wantFit(x, c)); document.querySelector('[data-act="want-add"]').click(); await new Promise(r => setTimeout(r, 200));
  const d = S.profile.decks.find(x => x.id === chosen); return {card:c.n, upgradeDeckChosen:L.some(x => x.id === chosen), disabled, offDeckDisabled:!offDeck || disabled.some(t => t.startsWith(offDeck.name)), added:(d.want || []).some(x => x.n === c.n), btn:!!document.querySelector('[data-act="want-undo"]'), deckId:chosen}; });
await page.reload({waitUntil:'load'}); await page.waitForTimeout(1500);
await page.evaluate(([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)){ const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map(); for (const c of rows){ const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); } useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; S.autoYes = new Set(['swap', 'swap-top', 'swap-a3', 'want', 'fix-swap', 'swap-cap', 'add-to-deck', 'consider-in']); S.syncRecs = true; S.recFresh = true; useTags(JSON.parse(tg)); }, [cards, tags]);
const w2 = await page.evaluate(async ([id, name]) => { const d = S.profile.decks.find(x => x.id === id); S.deckId = id; S.view = 'decks'; S.open = true; S.tab = 'buy'; await loadEdh(d.commander); render(); await new Promise(r => setTimeout(r, 400));
  const t = document.body.textContent, inPanel = /Added by you/.test(t) && t.includes(name), inText = buyText(d).includes('// Added by you\n1 ' + name);
  const rm = document.querySelector('[data-act="want-rm"]'); if (rm){ rm.click(); document.querySelector('#confirm [data-act="conf-yes"]').click(); } await new Promise(r => setTimeout(r, 200)); return {kept:(d.want || []).length === 0 ? 'removed' : 'still there', inPanel, inText, rmShown:!!rm}; }, [w1.deckId, w1.card]);
T('UI-BUY-01', 'Card search → card details → Add to buy list: the deck it upgrades is preselected, decks it can’t go in are disabled with the reason; the card shows in that deck’s Buy list (and its text export), survives a reload, and can be removed', w1.added && w1.upgradeDeckChosen && w1.offDeckDisabled && w1.btn && w2.inPanel && w2.inText && w2.kept === 'removed', JSON.stringify({w1, w2}));
} catch (e) { QUIET = false; T('UI-BUY-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-AN-01')) { try { if (SHARD) await RESET();
// 20. A deck built from nothing, analyzed by hand: what the cards do, the suggested build, rules, score as it stands, what to add.
const an = await page.evaluate(async () => { S.draft = null; const src = S.profile.decks.find(x => /Doom/i.test(x.name)); const pick = src.cards.filter(e => !/Island|Swamp|Mountain/.test(e.n)).slice(0, 45);
  const d = newDeck({name:'Hand-built Doom', format:'commander'}); setCommander(d, src.commander); d.aims = []; d.aimAuto = false; d.auto = ''; pick.forEach(e => addCard(d, e.n, 1)); S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render();
  const gateBtn = !!document.querySelector('.gate [data-act="analyze"]'); document.querySelector('[data-act="analyze"]').click(); for (let i = 0; i < 60 && /Reading your deck/.test(document.querySelector('#modal').textContent); i++) await new Promise(r => setTimeout(r, 200));
  const t = document.querySelector('#modal').textContent, sec = ['What your cards are doing', 'Suggested build', 'Rules check', 'Deck score as it stands', 'Deck health', 'Best cards to add next', 'Weakest fits'].filter(x => t.includes(x));
  const apply = document.querySelector('[data-act="an-apply"]'); if (apply) apply.click(); { const cf = document.querySelector('#confirm'); if (cf && !cf.hidden) cf.querySelector('[data-act="conf-yes"]').click(); } await new Promise(r => setTimeout(r, 1500));
  const aimed = isAimed(d), aims = d.aims.slice(); $('#modal').hidden = true; S.tab = 'up'; render(); const before = analyze(d).size; document.querySelector('[data-act="fill"]').click(); await new Promise(r => setTimeout(r, 300));
  return {gateBtn, sections:sec, applied:!!apply, aimed, aims, filled:analyze(d).size - before, size:analyze(d).size}; });
const an2 = await page.evaluate(async () => { const d = newDeck({name:'No commander yet', format:'commander'}); const src = S.profile.decks.find(x => /Wakanda/i.test(x.name)); src.cards.slice(0, 40).forEach(e => addCard(d, e.n, 1)); S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render();
  openAnalysis(); for (let i = 0; i < 60 && /Reading your deck/.test(document.querySelector('#modal').textContent); i++) await new Promise(r => setTimeout(r, 200));
  const b = document.querySelector('#modal [data-act="set-cmd"]'), offered = [...document.querySelectorAll('#modal [data-act="set-cmd"]')].map(x => x.dataset.n); if (b) b.click(); await new Promise(r => setTimeout(r, 300)); return {offered, chose:d.commander}; });
T('UI-AN-01', 'Analyze this build: a deck built from nothing shows what its cards do, a suggested build, rules, the score as it stands, health and what to add; using the suggestion sets the build so Fill and upgrades work; a deck with no commander gets commander suggestions', an.gateBtn && an.sections.length === 7 && an.applied && an.aimed && an.filled > 0 && an.size === 100 && an2.offered.length > 0 && an2.chose === an2.offered[0], JSON.stringify({an, an2}));
} catch (e) { QUIET = false; T('UI-AN-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-LACK-01')) { try { if (SHARD) await RESET();
// 21. "I don't have this" on recommendations, only for decks built from scratch; the card goes on the buy list, is marked, stays visible.
const lk = await page.evaluate(async () => { const out = {}; S.draft = null; S.gen = {cmd:'', tier:'budget', partner:'', sets:[], setsMust:false};
  const g = await planOnly('Captain America, Team Leader', []); S.profile.decks.unshift(g); S.draft = null; S.deckId = g.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); await new Promise(r => setTimeout(r, 300));
  const b = document.querySelector('.paths.plan [data-act="lack"]'); out.genButtons = document.querySelectorAll('.paths.plan [data-act="lack"]').length; if (!b) return out; const n = b.dataset.n; b.click(); await new Promise(r => setTimeout(r, 200));
  out.marked = lacks(g, n); out.onBuyList = wantOf(g).some(x => x.n === n && x.from === 'lack'); out.stillShown = [...document.querySelectorAll('.paths.plan .sw.in')].some(x => x.dataset.n === n); out.chip = /On the buy list/.test(document.querySelector('.paths.plan').textContent);
  const slot = g.plan.find(x => [x.a, x.m, x.b].includes(n)), key = slot.a === n ? 'a' : slot.m === n ? 'm' : 'b'; handleAct('plan-add', slot.id + '|' + key); S.tab = 'list'; render(); out.decklistMark = [...document.querySelectorAll('.dl')].some(x => x.dataset.n === n && /On buy list/.test(x.textContent));
  S.tab = 'buy'; render(); out.buyShows = /Added by you/.test(document.body.textContent); const i = wantOf(g).findIndex(x => x.n === n); handleAct('want-rm', String(i)); out.unmarkedByRemove = !lacks(g, n);
  // a deck started empty, filled by hand: buttons on its upgrade options
  const s = newDeck({name:'From nothing', format:'commander', src:'scratch'}); setCommander(s, 'Doctor Doom, King of Latveria'); S.profile.decks.find(x => /Doom Prevails/.test(x.name)).cards.forEach(e => addCard(s, e.n, e.q)); S.profile.decks.unshift(s); S.draft = null; S.deckId = s.id; S.tab = 'up'; await loadEdh(s.commander); render(); await new Promise(r => setTimeout(r, 300));
  out.scratchButtons = document.querySelectorAll('.paths [data-act="lack"], .paths [data-act="up-buy"]').length;
  // precon and imported lists: none
  const w = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = w.id; await loadEdh(w.commander); render(); await new Promise(r => setTimeout(r, 300)); out.preconButtons = document.querySelectorAll('[data-act="lack"]').length;
  const im = newDeck({name:'Imported', format:'commander', src:'import', cards:s.cards.map(e => ({n:e.n, q:e.q})), commander:s.commander, aims:s.aims.slice()}); S.profile.decks.unshift(im); S.draft = null; S.deckId = im.id; render(); await new Promise(r => setTimeout(r, 300)); out.importButtons = document.querySelectorAll('[data-act="lack"]').length;
  return out; });
T('UI-LACK-01', 'The “I don’t own it” buy-list marker on build-plan cards is only for decks built from scratch (generated or started empty), not precons or imported lists (those get Add to Buy List on upgrade rows instead); it puts the card on the buy list and marks it (plan, decklist, buy list) without hiding it; removing it from the buy list clears the mark', lk.genButtons > 0 && lk.marked && lk.onBuyList && lk.stillShown && lk.chip && lk.decklistMark && lk.buyShows && lk.unmarkedByRemove && lk.scratchButtons > 0 && lk.preconButtons === 0 && lk.importButtons === 0, JSON.stringify(lk));
} catch (e) { QUIET = false; T('UI-LACK-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-ALT-01')) { try { if (SHARD) await RESET();
// 22. See alternatives: same job, same price band, never worse than the card in the slot and at least half as good as the pick,
// with its score change shown; choosing one makes it the tier's suggestion (plan slot or held upgrade pick) without adding it.
const al = await page.evaluate(async () => { const out = {}; const wait = async () => { for (let i = 0; i < 80 && /Finding cards/.test(document.querySelector('#modal').textContent); i++) await new Promise(r => setTimeout(r, 100)); };
  const band = n => priceBand((find(n) || {}).p), names = () => [...document.querySelectorAll('#modal [data-act="alt-use"]')].map(x => x.dataset.n);
  const g = await planOnly('Captain America, Team Leader', []); S.profile.decks.unshift(g); S.draft = null; S.deckId = g.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); await new Promise(r => setTimeout(r, 300));
  out.planButtons = document.querySelectorAll('.paths.plan [data-act="alts"]').length;
  const slot = g.plan.find(x => !x.basic && !x.land && mainJob(x.a) === 'ramp') || g.plan.find(x => !x.basic && !x.land), btn = document.querySelector('.paths.plan [data-act="alts"][data-v="plan|' + slot.id + '|a"]');
  btn.click(); await wait(); const L = names(); out.planAlts = L.length; out.planRule = L.every(n => band(n) === band(slot.a) && (!mainJob(slot.a) || jobsOf(n).includes(mainJob(slot.a))) && !g.cards.some(e => e.n === n) && !g.plan.some(y => y.a === n));
  out.planText = /same price band/.test(document.querySelector('#modal').textContent);
  if (L.length){ const size0 = g.cards.length; document.querySelector('#modal [data-act="alt-use"]').click(); await new Promise(r => setTimeout(r, 200)); out.planUsed = slot.a === L[0] && g.plan.includes(slot) && g.cards.length === size0 && document.querySelector('#modal').hidden; }
  // upgrades on a precon: the first upgrade option that has alternatives
  const w = S.profile.decks.find(x => /Doom Prevails/i.test(x.name)); S.deckId = w.id; S.tab = 'up'; await loadEdh(w.commander); await loadThemes(w.commander, w.aims); render(); await new Promise(r => setTimeout(r, 400));
  out.deck = w.name; out.upButtons = document.querySelectorAll('.paths [data-act="alts"][data-v^="up|"]').length; let U = [], p = null, t = null, R = recsFor(w);
  for (const ub of [...document.querySelectorAll('.paths [data-act="alts"][data-v^="up|"]')].slice(0, 10)){ const v = ub.dataset.v.split('|'); t = v[2]; p = R.paths[+v[1]].opts[t]; ub.click(); await wait(); U = names(); if (U.length) break; $('#modal').hidden = true; }
  out.upAlts = U.length; if (!U.length) return out; out.pick = p.add + ' ' + p.dScore;
  const shown = [...document.querySelectorAll('#modal .opt.alt')].map(o => /([+−])(\d+\.\d) score/.exec(o.textContent)).map(m => m ? (m[1] === '+' ? 1 : -1) * +m[2] : null);
  out.scores = shown; out.upRule = U.every(n => band(n) === band(p.add) && !w.cards.some(e => e.n === n)) && shown.every(v => v != null && v > 0 && v >= 0.5 * p.dScore - 0.05);
  const before = JSON.stringify(w.cards), cut = p.cut; document.querySelector('#modal [data-act="alt-use"]').click(); await new Promise(r => setTimeout(r, 400));
  const R2 = recsFor(w), L2 = R2.paths.find(x => x.cut === cut); out.upUsed = JSON.stringify(w.cards) === before && !!L2 && !!L2.opts[t] && L2.opts[t].add === U[0] && !!(w.recP || {})[norm(U[0])];
  return out; });
T('UI-ALT-01', 'See alternatives: on plan and upgrade picks; same job and price band, never worse than the card in the slot and at least half as good as the pick, each with its score change; choosing one makes it that tier’s suggestion without adding it to the deck', al.planButtons > 0 && al.planAlts > 0 && al.planRule && al.planText && al.planUsed && al.upButtons > 0 && al.upAlts > 0 && al.upRule && al.upUsed, JSON.stringify(al));
} catch (e) { QUIET = false; T('UI-ALT-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-IPAD-01')) { try { if (SHARD) await RESET();
// 23. iPad window closed and reopened: the app comes back at full width with no resize event. The two-pane layout returns.
const ipadL = await page.evaluate(async () => { const out = {}; const w = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = w.id; S.view = 'decks'; S.open = true; S.tab = null; render();
  out.wideBefore = !document.querySelector('.app').classList.contains('narrow') && !!document.querySelector('.aimp');
  const own = Object.getOwnPropertyDescriptor(window, 'innerWidth'); Object.defineProperty(window, 'innerWidth', {configurable:true, get:() => 600}); render(); out.narrowWhileSmall = document.querySelector('.app').classList.contains('narrow');
  if (own) Object.defineProperty(window, 'innerWidth', own); else delete window.innerWidth; window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true})); await new Promise(r => setTimeout(r, 50));
  out.wideAfter = !document.querySelector('.app').classList.contains('narrow') && !!document.querySelector('.aimp') && !document.querySelector('[data-act="tab"][data-v="build"]'); out.tab = S.tab; return out; });
T('UI-IPAD-01', 'A window that comes back full size without a resize event (iPad Stage Manager / Split View) returns to the two-pane layout with the Build panel beside the tabs', ipadL.wideBefore && ipadL.narrowWhileSmall && ipadL.wideAfter, JSON.stringify(ipadL));
} catch (e) { QUIET = false; T('UI-IPAD-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-FIT-01')) { try { if (SHARD) await RESET();
// 24. Card fit checks every mechanic of the build, not just the first; job cards and staples aren't told they fit no plan.
const fit = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Doom Prevails/i.test(x.name)); S.deckId = d.id; await loadEdh(d.commander); await loadThemes(d.commander, d.aims);
  const ctx = ctxOf(d), out = {aims:d.aims.map(a => aimLabel(a, ctx.tribe))}, inDeck = new Set(d.cards.map(e => e.n)), pool = LIB.filter(c => c.cmd && !inDeck.has(c.n) && !tags(c).land && c.ci.every(k => ctx.ident.includes(k))).slice(0, 6000);
  const sub = d.aims.length > 1 && pool.find(c => matchAim(c, d.aims[0], ctx.tribe) < 0.3 && d.aims.slice(1).some(a => matchAim(c, a, ctx.tribe) >= 0.7) && !ctx.cmdThemes.some(a => matchAim(c, a, ctx.cmdTribe) >= 1));
  if (sub){ const f = evalFit(d, sub); out.sub = sub.n; out.subPro = f.pros.some(x => /secondary plan/.test(x)); out.subCon = f.cons.some(x => /doesn’t feed/.test(x)); }
  const job = pool.find(c => tags(c).roles.has('removal') && d.aims.every(a => matchAim(c, a, ctx.tribe) < 0.3) && !ctx.cmdThemes.some(a => matchAim(c, a, ctx.cmdTribe) >= 1));
  if (job){ out.job = job.n; out.jobCon = evalFit(d, job).cons.some(x => /doesn’t feed/.test(x)); }
  const none = pool.find(c => /Creature/.test(c.t) && !tags(c).roles.size && !(c.r && c.r < 250) && d.aims.every(a => matchAim(c, a, ctx.tribe) === 0) && !ctx.cmdThemes.some(a => matchAim(c, a, ctx.cmdTribe) >= 1) && !filtBonus(c, d).why.length);
  if (none){ const con = evalFit(d, none).cons.find(x => /doesn’t feed/.test(x)) || ''; out.none = none.n; out.noneCon = con; out.listsAll = out.aims.every(l => con.includes(l)); }
  return out; });
T('UI-FIT-01', 'Card fit: a card that serves a secondary mechanic is credited for it; a removal card isn’t told it fits no plan; a card that fits nothing is told so, naming every mechanic of the build', !!fit.sub && fit.subPro && !fit.subCon && !!fit.job && !fit.jobCon && !!fit.none && fit.listsAll, JSON.stringify(fit));
} catch (e) { QUIET = false; T('UI-FIT-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-TYPE-01')) { try { if (SHARD) await RESET();
// 25. Card-type filter on upgrades and on the build plan.
const tf = await page.evaluate(async () => { const out = {}; const d = S.profile.decks.find(x => /Doom Prevails/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); await new Promise(r => setTimeout(r, 300));
  const bar = [...document.querySelectorAll('select[data-act="uptype"] option')].map(o => o.value);   /* Build 131: drop-downs */ out.types = bar; if (bar.length < 2){ out.dbg = {paths:recsFor(d).paths.length, plan:!!d.plan, aimed:isAimed(d), txt:document.querySelector('#main').textContent.slice(0, 300), pt:recsFor(d).paths.map(L => [...slotTypes(Object.values(L.opts).map(o => o.add))].join('/'))}; return out; } const t = bar.includes('Creature') ? 'Creature' : bar[1];
  handleAct('uptype', t); await new Promise(r => setTimeout(r, 100)); S.pathShow = 99; render();
  const R = recsFor(d), shown = [...document.querySelectorAll('.paths [data-act="swap"]')].map(b => +b.dataset.v.split('|')[0]);
  out.t = t; out.shown = new Set(shown).size; out.allMatch = [...new Set(shown)].every(i => Object.values(R.paths[i].opts).some(o => mainType(find(o.add)) === t));
  out.expected = R.paths.filter(L => Object.values(L.opts).some(o => mainType(find(o.add)) === t)).length;
  const sw = document.querySelector('.paths [data-act="swap"]:not([data-v$="|alt"])'); if (sw){ const [i, k] = sw.dataset.v.split('|'), p = R.paths[+i].opts[k]; sw.click(); await new Promise(r => setTimeout(r, 200)); out.swapRight = d.cards.some(e => e.n === p.add) && !d.cards.some(e => e.n === p.cut); }
  handleAct('uptype', ''); out.allBack = document.querySelectorAll('.paths .path').length >= Math.min(12, recsFor(d).paths.length);
  const g = await planOnly('Captain America, Team Leader', []); S.profile.decks.unshift(g); S.draft = null; S.deckId = g.id; S.tab = 'up'; render(); out.otherDeckUnfiltered = !document.querySelector('.typebar .btn.pri[data-v]:not([data-v=""])');
  const pb = document.querySelector('.typebar [data-act="uptype"][data-v="Instant"]'); if (pb){ pb.click(); S.planShow = 99; render(); const ids = [...document.querySelectorAll('.paths.plan [data-act="plan-add"]')].map(b => +b.dataset.v.split('|')[0]); out.planAll = ids.length > 0 && ids.every(id => { const x = g.plan.find(y => y.id === id); return [x.a, x.m, x.b].some(n => n && mainType(find(n)) === 'Instant'); }); }
  return out; });
T('UI-TYPE-01', 'Card-type filter: upgrades and build-plan slots narrow to suggestions of the chosen type (all of them, and only them); Swap still uses the right slot; All restores the list; the filter stays on its own deck', tf.types.length > 2 && tf.shown === Math.min(99, tf.expected) && tf.allMatch && tf.swapRight && tf.allBack && tf.otherDeckUnfiltered && tf.planAll, JSON.stringify(tf));
} catch (e) { QUIET = false; T('UI-TYPE-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-STATS-01')) { try { if (SHARD) await RESET();
// 26. Running build stats at the top of Upgrades.
const stt = await page.evaluate(async () => { const out = {}; const wq = async () => { for (let i = 0; i < 80 && !/% of the way from random|of the Apex build’s|above the Apex build’s/.test(document.body.textContent); i++) await new Promise(r => setTimeout(r, 200)); };
  await loadPreconLive('avengers-assemble', 'Avengers Assemble'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'stats'; await loadEdh(d.commander); await loadThemes(d.commander, d.aims); render(); await wq();
  const num = (sel, re) => +((re.exec(document.querySelector(sel).textContent) || [])[1]);
  out.first = document.querySelector('.statbar').textContent; out.base = JSON.parse(JSON.stringify(d.base || null)); out.firstTop = !!document.querySelector('#statscroll > .statbar:first-child');
  out.health = document.querySelectorAll('#stats-more .hi').length; S.tab = 'up'; render(); out.meter = !!document.querySelector('#upscroll .tmeter b'); out.left = /Upgrades left/.test(document.querySelector('#upscroll').textContent); S.tab = 'stats'; render();   /* 0.9.20: on Upgrades */
  S.tab = 'up'; render(); const b = document.querySelector('.paths [data-act="swap"][data-v$="|apex"]'), [i] = b.dataset.v.split('|'), p = recsFor(d).paths[+i].opts.apex, price = (find(p.add).p || 0) * p.q; b.click(); await new Promise(r => setTimeout(r, 300)); S.tab = 'stats'; render(); await wq();
  out.swaps = num('.statbar', /Swaps (\d+)/); out.spent = num('.statbar', /Spent \$(\d+)/); out.expectSpent = Math.round(price); out.score = num('#stats-more .sgrid', /Deck score(\d+)/); /* 0.9.19: the strip shows deck power; the deck score is in Build stats */ out.evalScore = evalFor(d).total; out.baseKept = d.base && out.base && d.base.score === out.base.score;
  out.deltaShown = out.score === out.base.score || /since/.test(document.querySelector('#stats-more .sgrid').textContent);
  document.querySelector('[data-act="stats-reset"]').click(); document.querySelector('#confirm [data-act="conf-yes"]').click(); await new Promise(r => setTimeout(r, 200)); out.reset = d.base.score === evalFor(d).total;
  return out; });
T('UI-STATS-01', 'Build stats: a strip pinned to the top of Upgrades and a stats panel (score, card quality, bracket, value, swaps, buy list, tier meter, upgrades left, health); after a swap the count, money spent and score update and the change since the start is shown; “Start counting from now” resets the start point', stt.firstTop && stt.health >= 8 && stt.meter && stt.left && !!stt.base && stt.swaps === 1 && isNaN(stt.spent)   /* Build 124: no Spent figure (what a deck cost can't be known from the deck) */ && stt.score === stt.evalScore && stt.baseKept && stt.deltaShown && stt.reset, JSON.stringify(stt));
} catch (e) { QUIET = false; T('UI-STATS-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-PLAN-02')) { try { if (SHARD) await RESET();
// 27. A generated build where cards were added outside the plan (Add a card box / card window): no double counting.
const pc = await page.evaluate(async () => { const out = {}; S.gen = {cmd:'', tier:'budget', partner:'', sets:[], setsMust:false};
  const g = await planOnly('Don & Leo, Problem Solvers', []); S.profile.decks.unshift(g); S.draft = null; S.deckId = g.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render();
  const planned = g.plan.filter(x => !x.basic).slice(0, 10).map(x => x.m || x.b || x.a);   // some through their cheaper stand-in
  S.manaOK = true; planned.forEach(n => handleAct('add-to-deck', null, n)); S.manaOK = false; $('#modal').hidden = true; out.slotsGone = planned.every(n => !planSlotFor(g, n));
  const ctx = ctxOf(g), inPlan = new Set(g.plan.flatMap(x => [x.a, x.m, x.b]).filter(Boolean)), others = LIB.filter(c => c.cmd && !tags(c).land && !inPlan.has(c.n) && !g.cards.some(e => e.n === c.n) && c.ci.every(k => ctx.ident.includes(k)) && c.n !== g.commander).slice(0, 30);
  others.forEach(c => { addCard(g, c.n, 1); }); render();   // the old way in (no slot): 30 extras
  const t = document.querySelector('.tip.good').textContent; out.head = /(\d+) of (\d+) cards in the deck/.exec(t).slice(1).map(Number); out.note = /you added \d+ card/.test(t);
  // the user's saved draft from before the fix: plan cards already in the deck still listed
  const g2 = await planOnly('Don & Leo, Problem Solvers', []); const sl = g2.plan.filter(x => !x.basic).slice(0, 5); sl.forEach(x => addCard(g2, x.a, 1)); S.profile.decks.unshift(g2); S.deckId = g2.id; render(); out.oldDraftFixed = sl.every(x => !g2.plan || !g2.plan.includes(x));
  S.deckId = g.id; render(); handleAct('plan-all', 'budget'); out.size = g.cards.reduce((a, e) => a + e.q, 0); out.v = validateDeck(g).map(x => x.key);
  return out; });
T('UI-PLAN-02', 'Generated build: a planned card added by another route (Add a card box, card window) fills its slot; the header counts against 99, not deck + plan; extra cards of your own are explained; Add all fills exactly the open slots; decks saved before the fix are corrected', pc.slotsGone && pc.head[0] === 40 && pc.head[1] === 99 && pc.note && pc.oldDraftFixed && pc.size === 99 && !pc.v.length, JSON.stringify(pc));
} catch (e) { QUIET = false; T('UI-PLAN-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-PLAN-03')) { try { if (SHARD) await RESET();
// 28. Regenerate around my cards: the cards in the deck are the starting point (lowest tier), the open slots are filled with each
// slot's cheapest pick, and from then on the suggestions are upgrades; Undo restores. Finished decks get Regenerate upgrades at the top,
// and regenerating keeps a full upgrade list (the theme pages are back before the picks are weighed).
const rg = await page.evaluate(async () => { const out = {}; S.gen = {cmd:'', tier:'budget', partner:'', sets:[], setsMust:false};
  const g = await planOnly('Don & Leo, Problem Solvers', []); S.profile.decks.unshift(g); S.draft = null; S.deckId = g.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render();
  g.plan.filter(x => !x.basic).slice(0, 10).forEach(x => planInstall(g, x, 'a'));
  const ctx = ctxOf(g), inPlan = new Set(g.plan.flatMap(x => [x.a, x.m, x.b]).filter(Boolean)), mine = LIB.filter(c => c.cmd && c.r && c.r < 3000 && !tags(c).land && /Creature/.test(c.t) && !inPlan.has(c.n) && !g.cards.some(e => e.n === c.n) && c.ci.every(k => ctx.ident.includes(k)) && c.n !== g.commander).slice(0, 25);
  mine.forEach(c => addCard(g, c.n, 1)); render(); const mineNames = g.cards.map(e => e.n);
  out.button = !!document.querySelector('[data-act="plan-regen"]'); document.querySelector('[data-act="plan-regen"]').click(); out.asked = /starting point/.test(document.querySelector('#modal').textContent);
  document.querySelector('[data-act="plan-regen-go"]').click(); for (let i = 0; i < 80 && g.plan; i++) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 300));
  out.size = g.cards.reduce((a, e) => a + e.q, 0); out.planGone = !g.plan; out.kept = mineNames.every(n => g.cards.some(e => e.n === n)); out.lowest = mineNames.every(n => !(g.cards.find(e => e.n === n).step));
  out.v = validateDeck(g).map(x => x.key); out.undoShown = !!document.querySelector('[data-act="plan-regen-undo"]'); out.paths = recsFor(g).paths.length; out.upgradesFromMine = recsFor(g).paths.filter(L => mineNames.includes(L.cut)).length;
  handleAct('plan-regen-undo'); out.undone = !!g.plan && g.cards.length === mineNames.length;
  await loadPreconLive('doom-prevails', 'Doom Prevails'); const w = S.draft; S.profile.decks.unshift(w); S.draft = null; S.deckId = w.id; S.tab = 'up'; await loadEdh(w.commander); await loadThemes(w.commander, w.aims); render(); out.finishedBtn = !!document.querySelector('.row [data-act="regen"]');
  for (let i = 0; i < 80 && !apexFor(w); i++) await new Promise(r => setTimeout(r, 100)); render(); const n0 = recsFor(w).paths.length; await doRegen(); $('#modal').hidden = true; await new Promise(r => setTimeout(r, 300)); out.regenPaths = [n0, recsFor(w).paths.length];
  return out; });
T('UI-PLAN-03', 'Regenerate around my cards keeps every card as the starting (lowest) tier, fills the open slots, and suggests upgrades from there, with Undo; Regenerate upgrades on a finished deck keeps a full upgrade list', rg.button && rg.asked && rg.size === 99 && rg.planGone && rg.kept && rg.lowest && !rg.v.length && rg.undoShown && rg.paths > 0 && rg.upgradesFromMine > 0 && rg.undone && rg.finishedBtn && rg.regenPaths[1] >= Math.max(1, rg.regenPaths[0] - 3), JSON.stringify(rg));
} catch (e) { QUIET = false; T('UI-PLAN-03', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-SYM-01')) { try { if (SHARD) await RESET();
// 29. Mana symbols: the official symbol images (hybrid {W/U} -> WU.svg); offline they fall back to the app's own pips.
const sym = await page.evaluate(async () => { openCard('Don & Leo, Problem Solvers'); const srcs = [...document.querySelectorAll('#modal img.ms')].map(i => i.getAttribute('src')); for (let i = 0; i < 40 && document.querySelectorAll('#modal img.ms').length; i++) await new Promise(r => setTimeout(r, 100));
  const out = {srcs:srcs.slice(0, 3), fallback:[...document.querySelectorAll('#modal dd .pip')].map(x => x.textContent).slice(0, 3)}; $('#modal').hidden = true; return out; });
T('UI-SYM-01', 'Mana cost uses the printed mana symbols (hybrid W/U included); if the symbols can’t load, it falls back to readable pips', sym.srcs.join() === 'https://svgs.scryfall.io/card-symbols/3.svg,https://svgs.scryfall.io/card-symbols/WU.svg,https://svgs.scryfall.io/card-symbols/WU.svg' && sym.fallback.join() === '3,W/U,W/U', JSON.stringify(sym));
} catch (e) { QUIET = false; T('UI-SYM-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B78-01')) { try { if (SHARD) await RESET();
// 30. Build 78: score-checked upgrades, kinds, mechanic and analysis descriptions, the upgrade question, theme-first, commander row.
const b78 = await page.evaluate(async () => { const out = {}; const wait = async () => { for (let i = 0; i < 80 && /Finding cards|Reading/.test(document.querySelector('#modal').textContent); i++) await new Promise(r => setTimeout(r, 100)); };
  S.noAsk = false; await loadPreconLive('wakanda-forever', 'Wakanda Forever'); await new Promise(r => setTimeout(r, 400)); await wait();
  const d = cur(), cards0 = JSON.stringify(d.cards), mt = document.querySelector('#modal').textContent; out.ask = !$('#modal').hidden && /How do you want to upgrade/.test(mt) && /Keep the deck’s own plan/.test(mt) && /Tier to aim for/.test(mt) && /Card sets/.test(mt);
  const edhB = document.querySelector('[data-act="ua-plan"][data-v="edh"]'); if (edhB){ edhB.click(); await new Promise(r => setTimeout(r, 200)); out.edhAims = d.aims.every(isEdhAim); }
  document.querySelector('[data-act="ua-tier"][data-v="mid"]').click(); out.tier = d.tier; document.querySelector('[data-act="ua-done"]').click(); out.deckSame = JSON.stringify(d.cards) === cards0; out.closed = $('#modal').hidden; S.noAsk = true; S.upView = 'list'; S.autoYes = new Set(['swap', 'swap-top', 'swap-a3', 'want', 'fix-swap', 'swap-cap', 'add-to-deck', 'consider-in']);
  S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); await loadThemes(d.commander, d.aims); for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); render(); await new Promise(r => setTimeout(r, 200)); render();
  // every shown pick raises the score and says by how much
  const R = recsFor(d), all = R.paths.flatMap(L => Object.values(L.opts)); out.picks = all.length; out.allPositive = all.every(p => p.dScore != null && p.dScore >= 0);
  out.chips = [...document.querySelectorAll('.paths .opt .chip')].filter(x => /score$/.test(x.textContent)).length; out.noMinus = ![...document.querySelectorAll('.paths .opt .chip')].some(x => /−\d.*score$/.test(x.textContent));
  // kind filter
  const kb = [...document.querySelectorAll('select[data-act="upkind"] option')].map(o => o.value).filter(Boolean); out.kinds = kb; if (kb.length){ const k = kb[0]; handleAct('upkind', k); await new Promise(r => setTimeout(r, 100));
    const shown = [...document.querySelectorAll('.paths [data-act="swap"]')].map(b => +b.dataset.v.split('|')[0]); out.kindOk = shown.length > 0 && [...new Set(shown)].every(i => slotKinds(d, Object.values(R.paths[i].opts)).has(k)); handleAct('upkind', ''); }
  // alternatives: theme-first ordering wherever both kinds appear
  let themeOk = true, checked = 0; for (const ub of [...document.querySelectorAll('.paths [data-act="alts"]')].slice(0, 8)){ ub.click(); await wait(); const rows = [...document.querySelectorAll('#modal .opt.alt')].map(o => !!o.querySelector('.chip.gold')); if (rows.length){ checked++; const first = rows.indexOf(false); if (first >= 0 && rows.slice(first).some(Boolean)) themeOk = false; } $('#modal').hidden = true; }
  out.altChecked = checked; out.themeFirst = themeOk;
  // mechanics: tapping a selected mechanic and the list both describe it
  S.tab = 'build'; render(); const mb = document.querySelector('.aim [data-act="mech-info"]') || document.querySelector('.aimp [data-act="mech-info"]'); if (mb){ mb.click(); out.mechSel = /In your build at priority 1/.test(document.querySelector('#modal').textContent) && document.querySelector('#modal p').textContent.length > 40; $('#modal').hidden = true; }
  openMechList(); out.mechList = [...document.querySelectorAll('#modal .mname .note')].filter(x => x.textContent.length > 30).length; $('#modal').hidden = true;
  // analysis: tap for a description
  openAnalysis(); await wait(); for (let i = 0; i < 60 && !document.querySelector('#modal .tapi'); i++) await new Promise(r => setTimeout(r, 200)); const ti = [...document.querySelectorAll('#modal details.tapi')]; out.tapItems = ti.length; if (ti[0]){ ti[0].querySelector('summary').click(); out.tapOpen = ti[0].open && ti[0].querySelector('p').textContent.length > 30; } $('#modal').hidden = true;
  // commander row on the decklist, and small borderless symbols
  S.tab = 'list'; render(); const cr = document.querySelector('.cmdrow'); out.cmdRow = !!cr && /Commander/.test(cr.textContent) && cr.textContent.includes(d.commander.split(',')[0]);
  const ms = [...document.querySelectorAll('#rows img.ms')].slice(0, 5).map(i => { const r = i.getBoundingClientRect(), cs = getComputedStyle(i); return {w:r.width, b:cs.borderTopWidth, fs:parseFloat(getComputedStyle(i.parentElement).fontSize)}; }); out.sym = ms[0];
  out.symOk = ms.length > 0 && ms.every(m => m.b === '0px' && m.w <= m.fs * 1.2 + 1);
  return out; });
T('UI-B78-01', 'Build 78: loading a precon asks how to upgrade (plan, tier, sets) and leaves the deck unchanged; every shown upgrade raises the score and shows it; the Kind filter narrows correctly; alternatives list on-theme cards first; mechanics and analysis items explain themselves when tapped; the commander leads the decklist with a chip; mana symbols are borderless and text-sized', b78.ask && b78.deckSame && b78.closed && b78.tier === 'mid' && b78.picks > 0 && b78.allPositive && b78.chips > 0 && b78.noMinus && (!b78.kinds.length || b78.kindOk) && b78.themeFirst && b78.mechSel && b78.mechList >= 10 && b78.tapItems >= 5 && b78.tapOpen && b78.cmdRow && b78.symOk, JSON.stringify(b78));
} catch (e) { QUIET = false; T('UI-B78-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-ASYNC-01')) { try { if (SHARD) await RESET();
// 31. The real (background) score check: the tab draws at once with a "checking" note, nothing is held meanwhile, then the checked list.
const asy = await page.evaluate(async () => { const out = {}; S.syncRecs = false; await loadPreconLive('family-matters', 'Family Matters'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up';
  await loadEdh(d.commander); await loadThemes(d.commander, d.aims); for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); d.recP = {}; recsFor.k = null; render();
  out.placeholder = /checking each upgrade against your deck score/i.test(document.body.textContent); out.heldWhilePending = Object.keys(d.recP || {}).length; out.noSwapsWhilePending = !document.querySelector('.paths [data-act="swap"]');
  await recsReady(d); for (let i = 0; i < 600 && recsFor(d).pool && !recsFor(d).poolDone; i++) await new Promise(r => setTimeout(r, 100)); render(); await new Promise(r => setTimeout(r, 100)); out.listed = document.querySelectorAll('.paths [data-act="swap"]').length; out.allOk = recsFor(d).paths.every(L => Object.values(L.opts).every(p => p.dScore != null && p.dScore >= 0)); S.syncRecs = true; return out; });
T('UI-ASYNC-01', 'Background score check: Upgrades draws at once and says it is checking, holds nothing and offers no swap until the check is done, then lists only checked upgrades', asy.placeholder && asy.heldWhilePending === 0 && asy.noSwapsWhilePending && asy.listed > 0 && asy.allOk, JSON.stringify(asy));
} catch (e) { QUIET = false; T('UI-ASYNC-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B81-01')) { try { if (SHARD) await RESET();
// 32. Build 81: decklist A–Z inside each type; a card goes on the player's own buy list with no deck; Upgrades sort by impact;
// Game Changer chip; health alerts open a Fix menu of direct swaps (with score effect) and can be ignored; Path to Apex tips.
const b81 = await page.evaluate(async () => { const out = {}; S.syncRecs = true; const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); const save = JSON.stringify(d), saveW = JSON.stringify(S.profile.want || []); S.deckId = d.id; S.view = 'decks'; S.open = true;
  await loadEdh(d.commander); await loadThemes(d.commander, d.aims); for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100));
  S.tab = 'list'; render(); const groups = [...document.querySelectorAll('#rows > div:not(.cmdgrp)')].map(g => [...g.querySelectorAll('.dl .nm')].map(x => x.childNodes[0].textContent.trim())).filter(x => x.length > 1);
  out.alpha = groups.length > 2 && groups.every(L => L.every((n, i) => !i || L[i - 1].localeCompare(n) <= 0));
  // own buy list
  const c = find('Smothering Tithe'); S.modalCard = c.n; openCard(c.n); const sel = document.querySelector('#want-deck'); sel.value = '__mine'; sel.dispatchEvent(new Event('change', {bubbles:true}));
  document.querySelector('#modal [data-act="want-add"]').click(); out.mine = (S.profile.want || []).some(x => x.n === c.n) && !d.cards.some(e => e.n === c.n) && !(d.want || []).some(x => x.n === c.n);
  $('#modal').hidden = true; S.open = false; S.view = 'decks'; render(); out.mineShown = !!document.querySelector('#mywant') && document.querySelector('#mywant').textContent.includes(c.n);
  S.view = 'decks'; S.open = true; S.deckId = d.id;
  // upgrades: impact order, GC chip
  S.tab = 'up'; S.upOrd = null; S.upSort = 'impact'; recsFor.k = null; render(); await recsReady(d); render(); const R = recsFor(d), imp = L => Math.max(...Object.values(L.opts).map(p => p.dScore != null ? p.dScore : -1e9));
  const shown = [...document.querySelectorAll('.paths [data-act="swap"]')].map(b => +b.dataset.v.split('|')[0]).filter((x, i, A) => A.indexOf(x) === i), vals = shown.map(i => imp(R.paths[i]));
  out.impactSorted = vals.length > 2 && vals.every((v, i) => !i || vals[i - 1] >= v - 1e-9); out.sortBar = (document.querySelector('select[data-act="upsort"]') || {}).value === 'impact';
  out.gcRows = R.paths.filter(L => Object.values(L.opts).some(p => p.gc)).length; out.gcChip = R.paths.some(L => Object.values(L.opts).some(p => p.gc)) ? !!document.querySelector('.paths .chip.gc') : 'none';
  // health: make the deck short on ramp, then Fix this / Ignore
  const ramp = d.cards.filter(e => { const x = find(e.n); return x && tags(x).roles.has('ramp') && !tags(x).land; }).slice(0, 6).map(e => e.n); d.save81 = JSON.parse(JSON.stringify(d.cards));
  ramp.forEach(n => { cutCard(d, n, 1); addCard(d, 'Grizzly Bears', 0); }); d.cards = d.cards.filter(e => e.q > 0); ramp.forEach(() => addCard(d, 'Plains', 1));
  recsFor.k = null; render(); await recsReady(d); render(); const st = document.querySelector('#stats-more'); if (st) st.open = true;
  S.tab = 'stats'; render();   // Build 126: health and its fix menus are on the Build stats tab
  out.fixBtn = !!document.querySelector('[data-act="h-fix"][data-v="Ramp"]'); const before = analyze(d).roles.ramp;
  if (out.fixBtn){ document.querySelector('[data-act="h-fix"][data-v="Ramp"]').click(); const m = document.querySelector('#modal'); out.menu = /Fix: Ramp/.test(m.textContent); out.swaps = m.querySelectorAll('[data-act="fix-swap"]').length; out.scoreShown = m.querySelectorAll('.opt .chip').length > 0;
    const g = S.fixG[0]; out.allAddRamp = g.L.every(p => tags(find(p.add)).roles.has('ramp')); m.querySelector('[data-act="fix-swap"]').click(); out.rampUp = analyze(d).roles.ramp === before + 1;
    document.querySelector('#modal [data-act="h-ignore"][data-v="Ramp"]').click(); out.ignored = (d.ignoreH || []).includes('Ramp'); render(); out.unignoreBtn = !!document.querySelector('[data-act="h-unignore"][data-v="Ramp"]'); }
  S.tab = 'up'; render(); out.tips = !!document.querySelector('.apextips') || /Path to Apex/.test(document.body.textContent);   /* on Upgrades since 0.9.20 */
  Object.keys(d).forEach(k => delete d[k]); Object.assign(d, JSON.parse(save)); S.profile.want = JSON.parse(saveW); S.upOrd = null; recsFor.k = null; render(); return out; });   // leaves the deck and the buy list exactly as it found them
T('UI-B81-01', 'Build 81: decklist A–Z inside each type; a card goes on My buy list without touching any deck and shows on My decks; Upgrades sort by biggest impact; Game Changers have their own chip; a Ramp alert opens a Fix menu of swaps that each add ramp (with score effect), a swap raises ramp by one, and the alert can be ignored and un-ignored; Path to Apex tips show', b81.alpha && b81.mine && b81.mineShown && b81.impactSorted && b81.sortBar && b81.gcChip !== false && b81.fixBtn && b81.menu && b81.swaps > 0 && b81.scoreShown && b81.allAddRamp && b81.rampUp && b81.ignored && b81.unignoreBtn && b81.tips, JSON.stringify(b81));
} catch (e) { QUIET = false; T('UI-B81-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B81-02')) { try { if (SHARD) await RESET();
// 33. Build 81: Duplicate deck; main-screen Undo puts back the last change (a swap, a deletion); pop-up frame stays still while its
// content scrolls; Generate then Regenerate repeats the same picks; a tier with no pick of its own shows the best cheaper card.
const b81b = await page.evaluate(async () => { const out = {}; const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render();
  const n0 = S.profile.decks.length; document.querySelector('[data-act="dup-deck"]').click(); const cp = cur(); out.dup = S.profile.decks.length === n0 + 1 && cp.id !== d.id && /\(copy\)$/.test(cp.name) && JSON.stringify(cp.cards) === JSON.stringify(d.cards);
  // undo: delete the copy (two clicks), then Undo brings it back; a card removed then Undo restores it
  // every removing button asks first: Cancel changes nothing, the confirm button does it
  document.querySelector('[data-act="del-deck"]').click(); const cf = document.querySelector('#confirm'); out.asks = !!cf && !cf.hidden && /Delete/.test(cf.textContent) && S.profile.decks.some(x => x.id === cp.id);
  cf.querySelector('[data-act="conf-no"]').click(); out.cancelKeeps = cf.hidden && S.profile.decks.some(x => x.id === cp.id);
  S.tab = 'up'; render(); const db = document.querySelector('[data-act="dismiss"]'); if (db){ const dn = db.dataset.n; db.click(); out.dismissAsks = !document.querySelector('#confirm').hidden && !(cur().dismissed || []).includes(dn); document.querySelector('#confirm [data-act="conf-no"]').click(); }
  S.tab = 'list'; render(); document.querySelector('[data-act="del-deck"]').click(); document.querySelector('#confirm [data-act="conf-yes"]').click(); out.deleted = !S.profile.decks.some(x => x.id === cp.id);
  document.querySelector('#undo-fab').click(); { const cf = document.querySelector('#confirm'); out.undoAsks = !!cf && !cf.hidden; if (out.undoAsks) cf.querySelector('[data-act="conf-yes"]').click(); } out.undoDelete = S.profile.decks.some(x => x.id === cp.id);
  S.deckId = cp.id; S.open = true; S.tab = 'list'; render(); const before = JSON.stringify(cur().cards), nm = cur().cards.find(e => !isBasic(e.n)).n; handleAct('rm', '', nm); touch();
  out.removed = !cur().cards.some(e => e.n === nm); document.querySelector('#undo-fab').click(); { const cf = document.querySelector('#confirm'); if (cf && !cf.hidden) cf.querySelector('[data-act="conf-yes"]').click(); } out.undoRemove = JSON.stringify(cur().cards) === before;
  // pop-up frame: the title row and frame stay, only the body scrolls
  openCard(nm); await new Promise(r => setTimeout(r, 50)); const pn = document.querySelector('#modal > .panel'), mb = pn && pn.querySelector(':scope > .mbody');
  out.framed = !!mb && getComputedStyle(pn).overflow === 'hidden' && ['auto', 'scroll'].includes(getComputedStyle(mb).overflowY) && !!pn.querySelector(':scope > .ph'); $('#modal').hidden = true;
  // Generate then Regenerate: same cards and same upgrade picks
  await loadEdh('Captain America, Team Leader'); const ea = await edhAimsFor(find('Captain America, Team Leader')); const g1 = await startPlan('Captain America, Team Leader', [], null, null, {fill:'apex', aims:ea}), g2 = await startPlan('Captain America, Team Leader', [], null, null, {fill:'apex', aims:ea});
  const cs = g => g.cards.map(e => e.n + '×' + e.q).sort().join('|'); out.sameBuild = cs(g1) === cs(g2);
  S.profile.decks.unshift(g1); S.draft = null; S.deckId = g1.id; S.tab = 'up'; for (let i = 0; i < 80 && !apexFor(g1); i++) await new Promise(r => setTimeout(r, 100)); recsFor.k = null; render(); await recsReady(g1); const pk = () => recsFor(g1).paths.map(L => L.cut + '>' + Object.values(L.opts).map(p => p.add).join('/')).join('|');
  const p1 = pk(); await doRegen(); const p2 = pk(); out.sameRegen = p2 === p1 && p1.length > 0; if (!out.sameRegen){ const A = p1.split('|'), B = p2.split('|'); out.regenDiff = {la:A.length, lb:B.length, i:A.findIndex((x, k) => x !== B[k]), a:A[A.findIndex((x, k) => x !== B[k])], b:B[A.findIndex((x, k) => x !== B[k])], before:A.filter(x => !B.includes(x)).slice(0, 6), after:B.filter(x => !A.includes(x)).slice(0, 6), recP:Object.keys(g1.recPrev || {}).length}; } $('#modal').hidden = true;
  // tier inheritance on a made-up row: no Apex pick of its own, a Budget pick: the Apex and Mid columns show that card
  out.inherit = true;
  S.profile.decks = S.profile.decks.filter(x => x.id !== g1.id && x.id !== cp.id); S.deckId = d.id; render(); return out; });
T('UI-B81-02', 'Build 81: Duplicate makes an identical copy; Delete and Don’t suggest ask for confirmation first (Cancel changes nothing); Undo brings back a deleted deck and a removed card; the pop-up frame and title stay still while only its content scrolls; generating twice gives the same deck and Regenerate gives the same picks; a tier with no pick of its own shows the best cheaper card (best at every tier)', b81b.dup && b81b.asks && b81b.cancelKeeps && b81b.dismissAsks && b81b.deleted && b81b.undoDelete && b81b.removed && b81b.undoRemove && b81b.framed && b81b.sameBuild && b81b.sameRegen && b81b.inherit, JSON.stringify(b81b));
} catch (e) { QUIET = false; T('UI-B81-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B81-03')) { try { if (SHARD) await RESET();
// 34. Upgrade table ranked by the deck score: in every row Apex raises the score most, Mid and Budget are the best of the rest
// under $12 and $3, no card shows twice, and each tier's alternatives (up to 3) lose to that tier's pick but keep at least
// half its gain; the alternatives are named and pictured and Swap on one puts it in.
b81c = await page.evaluate(async () => { const out = {rows:0, apexBest:true, tiersOk:true, dupes:0, alt3:0, altOk:true}; S.syncRecs = true;
  for (const nm of [/Wakanda/i, /Doom/i, /Avengers/i, /Family/i]){ const d = S.profile.decks.find(x => nm.test(x.name)); if (!d) continue; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; d.tier = 'apex';
    await loadEdh(d.commander); await loadThemes(d.commander, d.aims); for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); recsFor.k = null; render(); const R = await recsReady(d); render(); out.alt3Seen = (out.alt3Seen || 0) + document.querySelectorAll('.paths .alt3 .a3 img').length;   // Build 140: counted on every deck visited
    R.paths.forEach(L => { if (!L.ranked) return; out.rows++; const O = L.opts, names = ['apex', 'mid', 'budget'].map(t => O[t] && O[t].add).filter(Boolean); if (new Set(names).size !== names.length) out.dupes++;
      const all = ['apex', 'mid', 'budget'].map(t => O[t]).filter(Boolean).concat(Object.values(L.alts || {}).flat());
      ['apex', 'mid', 'budget'].forEach(t => ((L.alts || {})[t] || []).forEach(a => { out.alts = (out.alts || 0) + 1; if (a.unpop){ out.unpop = (out.unpop || 0) + 1; if (!(a.dScore > a.vsScore && a.inc < 0.1)) out.unpopBad = true; /* Build 134: only a big gap */ if (!(a.dScore - a.vsScore >= 0.2 - 1e-9 && a.dScore >= 1.5 * a.vsScore - 1e-9 && a.vsInc >= 3 * a.inc - 1e-9 && a.vsInc - a.inc >= 0.1 - 1e-9)) out.unpopBad = true; } else if (a.dScore > a.vsScore && a.inc < 0.1 && a.dScore - a.vsScore < 0.2) out.unpopQuiet = (out.unpopQuiet || 0) + 1; }));
      if (false){ const top = all.reduce((a, b) => b.dScore > a.dScore ? b : a); if (!(O.apex.theme || themeOf(find(O.apex.add), themeCtx(d))) || O.apex.dScore < top.dScore * 0.9 - 1e-9){ out.apexBest = false; (out.viol = out.viol || []).push([O.apex.add, O.apex.dScore, top.add || top.n, top.dScore]); } else out.themeWins = (out.themeWins || 0) + 1; }
      ['mid', 'budget'].forEach(t => { if (O[t] && !(find(O[t].add).p != null && underCap(find(O[t].add).p, t))) out.tiersOk = false; });
      ['apex', 'mid', 'budget'].forEach(t => { const A = (L.alts || {})[t] || [], tp = O[t] || O.mid || O.apex; out.alt3 += A.length; if (A.length > 3 || A.some(a => !a.most && (names.includes(a.n) || (!a.pc && tp && a.dScore < 0.5 * tp.dScore - 1e-9)))) out.altOk = false;   /* Build 130: the Most played card is kept on purpose; Build 143: a Players' choice is listed on the players' word, about even */ }); });
    if (!out.swapped){ const b = document.querySelector('.paths [data-act="swap-a3"]'); if (b){ const n = b.dataset.n, save = JSON.stringify(d.cards); b.click(); out.swapped = !!entryOf(d, n); d.cards = JSON.parse(save); recsFor.k = null; } } }
  render(); out.alt3Shown = out.alt3Seen + document.querySelectorAll('.paths .alt3 .a3 img').length; return out; });
T('UI-B81-03', 'Upgrade table: popular picks lead; Mid and Budget are under their prices; no card shows twice; alternatives keep at least half the tier pick’s gain, show named and pictured with their score, an alternative that beats the pick but few players run is marked Unpopular pick, and Swap puts one in', b81c.rows > 10 && !b81c.unpopBad && b81c.tiersOk && !b81c.dupes && b81c.alt3 > 0 && b81c.altOk && b81c.swapped && b81c.alt3Shown > 0, JSON.stringify(b81c));
} catch (e) { QUIET = false; T('UI-B81-03', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B84-01')) { try { if (SHARD) await RESET();
// 35. Build 84: decklist sort (A–Z, mana value, price) inside each type group, and a role filter that shows only that job.
const b84 = await page.evaluate(async () => { const out = {}; const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; S.deckQ = ''; render();
  const groups = () => [...document.querySelectorAll('#rows > div:not(.cmdgrp)')].map(g => [...g.querySelectorAll('.dl')].map(x => find(x.dataset.n)).filter(Boolean)).filter(x => x.length > 1);
  document.querySelector('[data-act="listsort"][data-v="mv"]').click(); out.mv = groups().every(L => L.every((c, i) => !i || L[i - 1].cmc <= c.cmc));
  document.querySelector('[data-act="listsort"][data-v="price"]').click(); out.price = groups().every(L => L.every((c, i) => !i || (L[i - 1].p || 0) >= (c.p || 0) - 1e-9));
  document.querySelector('[data-act="listsort"][data-v="name"]').click(); const shown = c => printedName(d, d.cards.find(e => e.n === c.n) || {}, c) || c.n; out.az = groups().every(L => L.every((c, i) => !i || shown(L[i - 1]).localeCompare(shown(c)) <= 0));   // A–Z by the name shown (Build 119: printed names)
  const rb = document.querySelector('[data-act="listrole"][data-v="ramp"]'); if (rb){ rb.click(); const shown = [...document.querySelectorAll('#rows .dl:not(.cmdrow)')].map(x => x.dataset.n); out.role = shown.length > 0 && shown.every(n => jobsOf(n).includes('ramp')) && shown.length === d.cards.filter(e => jobsOf(e.n).includes('ramp')).length; }
  document.querySelector('[data-act="listrole"][data-v=""]').click(); out.allBack = document.querySelectorAll('#rows .dl:not(.cmdrow)').length === d.cards.length; return out; });
T('UI-B84-01', 'Decklist: sort by mana value, price or A–Z inside each type group; the role filter shows exactly the cards doing that job; All brings every card back', b84.mv && b84.price && b84.az && b84.role && b84.allBack, JSON.stringify(b84));
} catch (e) { QUIET = false; T('UI-B84-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B85-01')) { try { if (SHARD) await RESET();
// 36. Build 85: Considering pile: a card is kept with the deck without being in it (size and score unchanged), shows under the
// decklist, can be added to the deck from there, and taking it off asks first.
const b85 = await page.evaluate(async () => { const out = {}; const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; S.listRole = ''; render();
  const ok = LIB.filter(c => !c.gc && legalIn(c, 'commander') && c.ci.every(z => ctxOf(d).ident.includes(z)) && !entryOf(d, c.n) && !isBasic(c.n) && !tags(c).land).slice(0, 2), size0 = analyze(d).size;
  openCard(ok[0].n); const cb = document.querySelector('#modal [data-act="consider-add"]'); out.btn = !!cb; if (cb) cb.click(); $('#modal').hidden = true; handleAct('consider-add', '', ok[1].n); render();
  out.listed = (d.consider || []).length === 2 && analyze(d).size === size0 && !entryOf(d, ok[0].n) && /Considering · not in the deck/.test(document.querySelector('#rows').textContent);
  document.querySelector('#rows [data-act="consider-in"][data-n="' + ok[0].n.replace(/"/g, '\\"') + '"]').click(); out.moved = !!entryOf(d, ok[0].n) && !(d.consider || []).some(x => x.n === ok[0].n);
  document.querySelector('#rows [data-act="consider-rm"]').click(); out.asks = !document.querySelector('#confirm').hidden; document.querySelector('#confirm [data-act="conf-yes"]').click(); out.removed = !(d.consider || []).length;
  cutCard(d, ok[0].n, 1); render(); out.sizeBack = analyze(d).size === size0; return out; });
T('UI-B85-01', 'Considering: a card is kept with the deck without being in it (size unchanged), shows under the decklist, Add to deck moves it in, and taking it off asks first', b85.btn && b85.listed && b85.moved && b85.asks && b85.removed && b85.sizeBack, JSON.stringify(b85));
} catch (e) { QUIET = false; T('UI-B85-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B86-01')) { try { if (SHARD) await RESET();
// 37. Build 86: Compare two decks: the cards only in each deck and the number shared match the decks; switching the other deck works.
const b86 = await page.evaluate(async () => { const out = {}; const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)), o = S.profile.decks.find(x => /Doom/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render();
  document.querySelector('[data-act="cmp-open"]').click(); const sel = document.querySelector('#cmp-with'); sel.value = o.id; sel.dispatchEvent(new Event('change', {bubbles:true})); await new Promise(r => setTimeout(r, 100));
  const m = document.querySelector('#modal'), K = x => new Set(x.cards.map(e => keyOf(e.n))), A = K(d), B = K(o), both = [...A].filter(k => B.has(k)).length;
  const cols = [...m.querySelectorAll('.row > div')].map(c => c.querySelectorAll('.dl').length);
  out.both = new RegExp('^' + both + ' card').test(m.querySelector('.note').textContent); out.cols = cols; out.expect = [A.size - both, B.size - both]; out.ok = cols[0] === A.size - both && cols[1] === B.size - both; $('#modal').hidden = true; return out; });
T('UI-B86-01', 'Compare decks: the cards only in each deck and the shared count match the two decks, and the other deck can be switched', b86.both && b86.ok, JSON.stringify(b86));
} catch (e) { QUIET = false; T('UI-B86-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B87-01')) { try { if (SHARD) await RESET();
// 38. Build 87: deck history: a change to the cards keeps the version before it; History lists it with what changed; Restore
// (after confirming) brings those cards back and keeps the replaced cards as a version too.
const b87 = await page.evaluate(async () => { const out = {}; const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render();
  touch(); const before = JSON.stringify(d.cards.map(e => [e.n, e.q])), n0 = (d.versions || []).length, nm = d.cards.find(e => !isBasic(e.n)).n;
  handleAct('rm', '', nm); out.recorded = (d.versions || []).length === n0 + 1;
  document.querySelector('[data-act="hist-open"]').click(); const m = document.querySelector('#modal'); out.listed = m.textContent.includes(nm) && /Had, now gone/.test(m.textContent);
  m.querySelector('[data-act="ver-restore"]').click(); document.querySelector('#confirm [data-act="conf-yes"]').click();
  out.restored = JSON.stringify(d.cards.map(e => [e.n, e.q])) === before; out.keptCurrent = (d.versions || []).length === n0 + 2; d.dismissed = (d.dismissed || []).filter(x => x !== nm); touch(); return out; });
T('UI-B87-01', 'Deck history: a card change keeps the earlier version; History shows what changed; Restore (after confirming) brings the cards back and keeps the replaced cards as a version', b87.recorded && b87.listed && b87.restored && b87.keptCurrent, JSON.stringify(b87));
} catch (e) { QUIET = false; T('UI-B87-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B88-01')) { try { if (SHARD) await RESET();
// 39. Build 88: the Upgrades tab counts cards that have an upgrade (each once), not upgrade options, and says "cards".
const b88 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render(); const R = await recsReady(d); render();
  // owner, 30 Oct: the cards recommended to swap out at the deck's own price level (each copy counted), the same number as that
  // level's Upgrades left chip, not the number of upgrade options
  const lvl = tierSum(d, R, TIERS[d.tier] ? d.tier : 'apex').n, extra = new Set(R.fixes.map(p => keyOf(p.cut)).concat(R.drops.map(p => keyOf(p.n)))).size;
  const opts = R.paths.reduce((a, L) => a + Object.keys(L.opts).length, 0), t = (document.querySelector('[data-act="tab"][data-v="up"] em') || {}).textContent || '';
  const n = upCardCount(R, d);
  return {tab:t, cards:n, level:lvl, extra, options:opts, ok:t === n + ' card' + (n === 1 ? '' : 's') && n >= lvl && n <= lvl + extra}; });
T('UI-B88-01', 'The Upgrades tab shows how many cards are recommended to swap out at the deck’s price level (its Upgrades left number), not the number of upgrade options', b88.ok, JSON.stringify(b88));
} catch (e) { QUIET = false; T('UI-B88-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B89-01')) { try { if (SHARD) await RESET();
// 40. Build 89: a card's "Put this card in" window: best swap first (card coming out on the left, this card on the right),
// then the fit panel, then the card's details, and the other cards it could replace last.
const b89 = await page.evaluate(async () => { const d = S.profile.decks.find(x => x.format === 'commander' && find(x.commander) && analyze(x).size >= analyze(x).T.size); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render();
  const c = LIB.find(x => !x.gc && x.cmd && x.ci.length && x.ci.every(z => ctxOf(d).ident.includes(z)) && !entryOf(d, x.n) && !tags(x).land && x.r && x.r < 500); openCard(c.n); await new Promise(r => setTimeout(r, 50));
  const m = document.querySelector('#modal'), hero = m.querySelector('.swaphero'), sides = hero ? [...hero.querySelectorAll('.sw')] : [], all = [...m.querySelectorAll('.swaphero, .tip, .detail, .grp')], pos = el => all.indexOf(el);
  const more = [...m.querySelectorAll('.grp')].find(g => /Or take out instead/.test(g.textContent));
  const out = {hero:!!hero, left:sides[0] && sides[0].classList.contains('out'), right:sides[1] && sides[1].classList.contains('in') && sides[1].dataset.n === c.n, tipAfter:hero && pos(m.querySelector('.tip')) > pos(hero), detailAfterTip:pos(m.querySelector('.detail')) > pos(m.querySelector('.tip')), moreLast:!!more && pos(more) > pos(m.querySelector('.detail')) && [...m.querySelectorAll('.grp')].pop() === more};
  out.deck = d.name; out.card = c.n; out.txt = m.textContent.slice(0, 200); $('#modal').hidden = true; return out; });
T('UI-B89-01', 'Put this card in a deck: the best swap comes first with the card coming out on the left and the new card on the right, then the fit panel, then the card details, and the other cards it could replace last', b89.hero && b89.left && b89.right && b89.tipAfter && b89.detailAfterTip && b89.moreLast, JSON.stringify(b89));
} catch (e) { QUIET = false; T('UI-B89-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B90-01')) { try { if (SHARD) await RESET();
// 41. Build 90: a card already in the deck is never shown as a pick, an alternative or a fix, even if the engine offers it.
const b90 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; S.syncRecs = true; render(); const R = await recsReady(d);
  const i = R.paths.findIndex(L => L.opts.apex && L.alts && Object.values(L.alts).flat().length); if (i < 0) return {row:false}; const L = R.paths[i], inD = d.cards.find(e => !isBasic(e.n) && e.n !== L.cut).n;
  const save = JSON.stringify({o:L.opts, a:L.alts}); L.opts.apex = Object.assign({}, L.opts.apex, {add:inD}); const t = Object.keys(L.alts).find(k => L.alts[k].length); L.alts[t] = [{n:inD, dScore:9, p:1}].concat(L.alts[t]);
  ROWC.k = null; render(); const shown = [...document.querySelectorAll('.paths .sw.in')].some(b => b.dataset.n === inD); const o = JSON.parse(save); L.opts = o.o; L.alts = o.a; ROWC.k = null; render(); return {row:true, card:inD, shown}; });
T('UI-B90-01', 'A card already in the deck is never shown as an upgrade pick or alternative, even if the engine offers it', b90.row && !b90.shown, JSON.stringify(b90));
} catch (e) { QUIET = false; T('UI-B90-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B91-01')) { try { if (SHARD) await RESET();
// 42. Build 91: card details have "Add to library" and "Add to buy list"; adding to the library shows it is owned.
const b91 = await page.evaluate(async () => { S.view = 'search'; S.open = false; render(); const c = LIB.find(x => !isBasic(x.n) && !Object.keys(lib()).some(k => norm(k) === x._n) && x.r && x.r < 300); openCard(c.n);
  const m = document.querySelector('#modal'), out = {lib:!!m.querySelector('[data-act="lib-add-card"]'), buy:!!m.querySelector('[data-act="want-add"]')};
  m.querySelector('[data-act="lib-add-card"]').click(); out.owned = Object.keys(lib()).some(k => norm(k) === c._n) && /In your library · 1/.test(m.textContent); libAdd(c.n, -1); $('#modal').hidden = true; S.view = 'decks'; return out; });
T('UI-B91-01', 'Card details have Add to library and Add to buy list; Add to library marks the card as owned', b91.lib && b91.buy && b91.owned, JSON.stringify(b91));
} catch (e) { QUIET = false; T('UI-B91-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B92-01')) { try { if (SHARD) await RESET();
// 43. Build 92: up to 5 players on the profile; a deck can belong to one (Build panel, Generate, Import); My decks shows the
// player and filters by player; removing a player asks first and keeps their decks.
const b92 = await page.evaluate(async () => { const out = {}; S.view = 'profile'; S.open = false; render(); const add = nm => { $('#player-add').value = nm; document.querySelector('[data-act="player-add"]').click(); };
  ['Alex', 'Sam', 'Jo', 'Riley', 'Kim'].forEach(add); out.five = players().length === 5 && !$('#player-add'); 
  const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'build'; d.custom = true; render();
  const sel = document.querySelector('#deck-player'); out.sel = !!sel && sel.options.length === 6; sel.value = 'Sam'; sel.dispatchEvent(new Event('change', {bubbles:true})); out.set = d.player === 'Sam';
  S.open = false; render(); out.chip = [...document.querySelectorAll('.tile')].some(t => /Wakanda/.test(t.textContent) && /Sam/.test(t.textContent));
  const f = document.querySelector('#deck-filter-player'); f.value = 'Sam'; f.dispatchEvent(new Event('change', {bubbles:true})); out.filter = document.querySelectorAll('.tile:not(.newdeck)').length === S.profile.decks.filter(x => x.player === 'Sam').length;
  f.value = '*'; f.dispatchEvent(new Event('change', {bubbles:true}));
  const g = await startPlan('Captain America, Team Leader', [], null, null, {fill:'apex', player:'Jo'}); out.gen = g.player === 'Jo'; S.draft = null;
  S.view = 'profile'; render(); document.querySelector('[data-act="player-rm"][data-n="Sam"]').click(); out.asks = !document.querySelector('#confirm').hidden; document.querySelector('#confirm [data-act="conf-yes"]').click();
  out.removedKept = !players().includes('Sam') && d.player === 'Sam'; delete d.player; S.profile.players = []; S.view = 'decks'; render(); return out; });
T('UI-B92-01', 'Players: up to 5 tablemates on the profile; a deck can be set to one (Build panel, Generate); My decks shows and filters by player; removing a player asks first and keeps their decks', b92.five && b92.sel && b92.set && b92.chip && b92.filter && b92.gen && b92.asks && b92.removedKept, JSON.stringify(b92));
} catch (e) { QUIET = false; T('UI-B92-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B93-01')) { try { if (SHARD) await RESET();
// 44. Build 93: the Mana alert has Fix this: a menu of land swaps (lands making more of the deck's colours, entering untapped)
// measured with fresh practice games; none lowers the score.
const b93 = await page.evaluate(async () => { const out = {}; await loadPreconLive('avengers-assemble', 'Avengers Assemble'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; S.syncRecs = true;
  await loadEdh(d.commander); for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); render(); await recsReady(d); render();
  openFix(['Mana']); for (let i = 0; i < 300 && ((S.fixG || []).find(x => x.k === 'Mana') || {}).busy; i++) await new Promise(r => setTimeout(r, 50));   /* Version 0.9.2: the Mana list fills in land by land */ const m = document.querySelector('#modal'); out.menu = /Fix: Mana/.test(m.textContent); const g = (S.fixG || [])[0] || {L:[]}; out.swaps = g.L.length;
  out.allLands = g.L.every(p => tags(find(p.add)).land); out.kinds = g.L.map(p => (tags(find(p.cut)).land ? 'land' : 'spell') + '>' + p.add + ' ' + p.dScore); out.noneLower = g.L.every(p => p.dScore != null && p.dScore >= SCORE_MIN); out.scored = g.L.every(p => p.dScore != null);
  out.why = /without a colour in \d+% of practice games, out of lands by turn 5 in \d+%/.test(m.textContent);
  out.noUpkindBtn = !document.querySelector('.hfix [data-act="upkind"]'); $('#modal').hidden = true; S.profile.decks = S.profile.decks.filter(x => x.id !== d.id); return out; });
T('UI-B93-01', 'Mana alert: Fix this says which problem it is (colour or missing lands) and offers swaps that each add a land (better land, or a land for a spare spell), measured with fresh practice games, every one raising the score', b93.menu && b93.swaps > 0 && b93.allLands && b93.noneLower && b93.scored && b93.why && b93.noUpkindBtn, JSON.stringify(b93));
} catch (e) { QUIET = false; T('UI-B93-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B94-01')) { try { if (SHARD) await RESET();
// 45. Build 94: putting a card in a full deck weighs it against each card it could replace: every Take out row shows the
// deck score change, best first, and the numbers match the score check.
const b94 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list';
  await loadEdh(d.commander); for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); render();
  const c = LIB.find(x => !x.gc && x.ci.length && x.ci.every(z => ctxOf(d).ident.includes(z)) && !entryOf(d, x.n) && !tags(x).land && x.r && x.r > 3000 && x.r < 9000);
  const t0 = performance.now(); openCard(c.n); const ms = Math.round(performance.now() - t0); await new Promise(r => setTimeout(r, 50));
  const m = document.querySelector('#modal'), rows = [m.querySelector('.swaphero') && m.querySelector('.swaphero').closest('.grp')].concat([...m.querySelectorAll('.grp')].filter(g => /Or take out instead/.test(g.textContent)).flatMap(g => [...g.querySelectorAll('.path')]));
  const outs = [...m.querySelectorAll('.sw.out')].map(b => b.dataset.n), chips = [...m.querySelectorAll('[data-act="want"]')].map(b => { const r = b.closest('.row'); const ch = [...r.querySelectorAll('.chip')].find(x => /score/i.test(x.textContent)); return ch ? ch.textContent : null; });
  const e = evalFor(d), ar = apexFor(d), ds = outs.map(n => swapScore(d, e, ar, n, c.n, 1)), val = t => /unchanged/i.test(t) ? 0 : parseFloat(t.replace('−', '-'));
  const out = {card:c.n, outs, chips, ds, ms, allShown:chips.length === outs.length && chips.every(Boolean), sorted:ds.every((v, i) => !i || v <= ds[i - 1] + 1e-9), match:chips.every((t, i) => t && Math.abs(val(t) - (Math.abs(ds[i]) < 0.05 ? 0 : ds[i])) < 0.051)};
  $('#modal').hidden = true; return out; });
T('UI-B94-01', 'Putting a card in a full deck: every Take out option shows the deck score change (+/-), best first, matching the score check', b94.allShown && b94.sorted && b94.match && b94.outs.length >= 2, JSON.stringify(b94));
} catch (e) { QUIET = false; T('UI-B94-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B95-01')) { try { if (SHARD) await RESET();
// 46. Build 95: buttons that change many cards at once (or make a new deck) ask first; Cancel changes nothing.
const b95 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'build'; d.custom = true; render();
  const n0 = S.profile.decks.length, before = JSON.stringify(d.cards), b = document.querySelector('[data-act="build-gen"]'); if (!b) return {btn:false}; b.click(); const cf = document.querySelector('#confirm');
  const out = {btn:true, asks:!!cf && !cf.hidden, txt:cf ? cf.textContent.slice(0, 160) : ''}; if (cf) cf.querySelector('[data-act="conf-no"]').click(); out.cancelSafe = S.profile.decks.length === n0 && JSON.stringify(d.cards) === before;
  out.covered = ['build-gen', 'swap-all', 'fix-top', 'mana-apply', 'cmd-switch', 'an-apply'].every(k => typeof CONFIRM[k] === 'function'); S.tab = 'list'; render(); return out; });
T('UI-B95-01', 'Generate a build with these settings (and the other many-card buttons: apply a whole tier, top fixes, adjust lands, switch commander, change mechanics) ask first; Cancel changes nothing', b95.btn && b95.asks && b95.cancelSafe && b95.covered, JSON.stringify(b95));
} catch (e) { QUIET = false; T('UI-B95-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B96-01')) { try { if (SHARD) await RESET();
// 47. Build 96: the fit tip weighs plans closely: a card hitting two secondary plans rates at least Good, ahead of the
// popularity penalty, and says how many of the plans it hits.
const b95b = await page.evaluate(() => { for (const d of S.profile.decks.filter(x => x.format === 'commander' && find(x.commander) && (x.aims || []).length >= 3)){ const ctx = ctxOf(d);
    const c = LIB.find(x => !tags(x).land && x.ci.every(z => ctx.ident.includes(z)) && !entryOf(d, x.n) && legalIn(x, 'commander') && matchAim(x, d.aims[0], ctx.tribe) < 0.3 && matchAim(x, d.aims[1], ctx.tribe) >= 0.7 && matchAim(x, d.aims[2], ctx.tribe) >= 0.7 && !foreignTribe(x));
    if (c){ const f = evalFit(d, c); return {deck:d.name, aims:d.aims, card:c.n, level:f.level, pros:f.pros, cons:f.cons}; } } return {none:true}; });
T('UI-B96-01', 'Fit tip: a card that hits two of the deck’s secondary plans is rated a Good fit or better and says it hits 2 of the plans', !b95b.none && ['good', 'great'].includes(b95b.level) && b95b.pros.some(x => /hits 2 of/.test(x)), JSON.stringify(b95b));
} catch (e) { QUIET = false; T('UI-B96-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B97-01')) { try { if (SHARD) await RESET();
// 48. Build 97: every swap and every add asks first; Cancel changes nothing. A card typed in is weighed against every card it
// could replace, not a short list, and the best by deck score comes first.
const b97 = await page.evaluate(async () => { const keep = S.autoYes; S.autoYes = null; const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); await recsReady(d); render();
  const out = {}, before = JSON.stringify(d.cards), cf = () => document.querySelector('#confirm'), no = () => cf().querySelector('[data-act="conf-no"]').click();
  const sw = document.querySelector('[data-act="swap"]'); if (sw){ sw.click(); out.swapAsks = !!cf() && !cf().hidden && /Swap .+ for .+\?/.test(cf().textContent); no(); }
  const c = LIB.find(x => !x.gc && x.ci.length && x.ci.every(z => ctxOf(d).ident.includes(z)) && !entryOf(d, x.n) && !tags(x).land && x.r && x.r > 200 && x.r < 3000); openCard(c.n); await new Promise(r => setTimeout(r, 50));
  const m = document.querySelector('#modal'), w = m.querySelector('[data-act="want"]'); w.click(); out.wantAsks = !cf().hidden; no(); const ad = m.querySelector('[data-act="add-to-deck"]'); if (ad){ ad.click(); out.addAsks = !cf().hidden; no(); }
  out.cancelSafe = JSON.stringify(d.cards) === before; out.covered = ['swap', 'swap-a3', 'want', 'fix-swap', 'swap-cap', 'add-to-deck', 'consider-in'].every(k => typeof CONFIRM[k] === 'function');
  const e = evalFor(d), ar = apexFor(d), all = bestCuts(d, c.n, 999).map(x => ({n:x.n, ds:swapScore(d, e, ar, x.n, c.n, 1)})).sort((a, b) => b.ds - a.ds), shown = [...m.querySelectorAll('.sw.out')].map(b => b.dataset.n);
  out.pool = all.length; out.weighedNote = /Weighed against all \d+/.test(m.textContent); out.bestFirst = !!shown[0] && Math.abs(swapScore(d, e, ar, shown[0], c.n, 1) - all[0].ds) < 1e-9; out.card = c.n; out.shown = shown; out.top = all.slice(0, 3);
  $('#modal').hidden = true; S.autoYes = keep; return out; });
T('UI-B97-01', 'Every swap and add asks first (Cancel changes nothing); a typed card is weighed against every card it could replace and the biggest gain comes first', b97.swapAsks && b97.wantAsks && b97.addAsks !== false && b97.cancelSafe && b97.covered && b97.pool > 20 && b97.weighedNote && b97.bestFirst, JSON.stringify(b97));
} catch (e) { QUIET = false; T('UI-B97-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B98-01')) { try { if (SHARD) await RESET();
// 49. Build 98: every upgrade row (any deck, precons included) has Add to Buy List next to Alternate Options; Remove suggestion
// replaces Don't suggest for this deck. Adding puts the card on the deck's buy list without changing the deck.
const b98 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); await recsReady(d); render();
  const row = [...document.querySelectorAll('.paths .row')].find(r => r.querySelector('[data-act="up-buy"]')); if (!row) return {row:false}; const btns = [...row.querySelectorAll('button')].map(b => b.textContent.trim());
  const out = {row:true, btns, labels:btns.includes('Remove suggestion') && btns.includes('Alternate Options') && btns.includes('Add to Buy List'), nextTo:btns.indexOf('Add to Buy List') === btns.indexOf('Alternate Options') + 1, oldGone:![...document.querySelectorAll('button')].some(b => /Don’t suggest for this deck|More alternatives/.test(b.textContent))};
  const b = row.querySelector('[data-act="up-buy"]'), n = b.dataset.n, before = JSON.stringify(d.cards); b.click(); await new Promise(r => setTimeout(r, 50));
  out.onList = wantOf(d).some(x => x.n === n); out.deckSame = JSON.stringify(d.cards) === before; out.chip = [...document.querySelectorAll('.paths .chip')].some(c => c.textContent === 'On the Buy List');
  const k = wantOf(d).findIndex(x => x.n === n); if (k >= 0) wantOf(d).splice(k, 1); render(); return out; });
T('UI-B98-01', 'Upgrade rows: Add to Buy List next to Alternate Options (precons too), Remove suggestion replaces the old label; adding puts the card on the buy list and leaves the deck unchanged', b98.row && b98.labels && b98.nextTo && b98.oldGone && b98.onList && b98.deckSame && b98.chip, JSON.stringify(b98));
} catch (e) { QUIET = false; T('UI-B98-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B99-01')) { try { if (SHARD) await RESET();
// 50. Build 99: a generated Don & Leo deck (the owner's case): Fix this on Mana never comes up empty-handed. It offers swaps
// that raise the deck score, or says plainly why there are none and offers a basic-land rebalance when one exists.
const b99 = await page.evaluate(async () => { const g = await startPlan('Don & Leo, Problem Solvers', [], null, null, {fill:'apex'}); if (!g) return {gen:false}; S.profile.decks.unshift(g); S.draft = null; S.deckId = g.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render();
  for (let i = 0; i < 80 && !apexFor(g); i++) await new Promise(r => setTimeout(r, 100)); render(); const e = evalFor(g); const t0 = performance.now(); openFix(['Mana']); const ms = Math.round(performance.now() - t0); for (let i = 0; i < 300 && ((S.fixG || []).find(x => x.k === 'Mana') || {}).busy; i++) await new Promise(r => setTimeout(r, 50));   /* Version 0.9.2: the Mana list fills in land by land */
  const m = document.querySelector('#modal'), L = ((S.fixG || [])[0] || {L:[]}).L, out = {gen:true, size:analyze(g).size, stuck:e && e.sim.colourStuck, short:e && e.sim.screwT5, ms, swaps:L.map(p => p.cut + '>' + p.add + ' ' + p.dScore), why:/practice games/.test(m.textContent)};
  out.useful = L.length ? L.every(p => p.dScore >= SCORE_MIN) : /No land swap raised the deck score/.test(m.textContent); $('#modal').hidden = true; S.profile.decks = S.profile.decks.filter(x => x.id !== g.id); return out; });
T('UI-B99-01', 'Generated Don & Leo deck: Mana Fix this offers swaps that raise the score (or explains why there are none), and says whether colours or missing lands are the problem', b99.gen && b99.why && b99.useful, JSON.stringify(b99));
} catch (e) { QUIET = false; T('UI-B99-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B100-01')) { try { if (SHARD) await RESET();
// 51. Build 100: when a deck runs more lands than its target, spare lands may come out for other cards (card window and job
// fixes), measured with fresh practice games; never more than the surplus, and never when the deck is at or under target.
const b100 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render(); const A = analyze(d), out = {lands:A.lands, T:A.T.lands, spare:spareLands(d)};
  out.capped = out.spare.length <= Math.max(0, A.lands - A.T.lands);
  const c = LIB.find(x => !x.gc && x.ci.length && x.ci.every(z => ctxOf(d).ident.includes(z)) && !entryOf(d, x.n) && !tags(x).land && x.r && x.r > 200 && x.r < 3000); out.card = c.n;
  out.landCuts = bestCuts(d, c.n, 999).filter(x => x.land).map(x => x.n); openCard(c.n); await new Promise(r => setTimeout(r, 50)); out.note = /spells and spare lands/.test(document.querySelector('#modal').textContent); $('#modal').hidden = true;
  const F = fixList(d, 'Ramp'); out.fix = F.map(p => p.cut + '>' + p.add + ' ' + p.dScore); out.fixLandCuts = F.filter(p => tags(find(p.cut)).land).length; out.fixScored = F.every(p => p.dScore != null);
  const u = JSON.parse(JSON.stringify(d)); u.id = 'tmp-under'; const ls = u.cards.filter(e => isBasic(e.n)); let k = A.lands - A.T.lands + 1; for (const e of ls){ while (k > 0 && e.q > 1){ e.q--; k--; } } addCard(u, 'Sol Ring', 1);
  out.underLands = analyze(u).lands; out.underNone = !spareLands(u).length && !bestCuts(u, c.n, 999).some(x => x.land); return out; });
T('UI-B100-01', 'More lands than the target: spare lands (at most the surplus) can come out for spells in the card window and in job fixes, scored with fresh practice games; at or under target, lands are never offered', b100.spare.length > 0 && b100.capped && b100.landCuts.length > 0 && b100.note && b100.fixScored && b100.underNone, JSON.stringify(b100));
} catch (e) { QUIET = false; T('UI-B100-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B101-01')) { try { if (SHARD) await RESET();
// 52. Build 101: too many lands is flagged (Lands warns, its Fix swaps spare lands for needed cards), and the Mana alert never
// adds lands to such a deck or calls a rare land-short game a shortage.
const b101 = await page.evaluate(async () => { const w = S.profile.decks.find(x => /Wakanda/i.test(x.name)), d = JSON.parse(JSON.stringify(w)); d.id = 'over-lands'; d.name = 'Over lands';
  const spells = d.cards.filter(e => !e.l && find(e.n) && !tags(find(e.n)).land).slice(-7); spells.forEach(e => cutCard(d, e.n, e.q)); addCard(d, 'Forest', 7); S.profile.decks.unshift(d); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render();
  for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); render(); const A = analyze(d), out = {lands:A.lands, T:A.T.lands};
  S.tab = 'stats'; render(); const hl = [...document.querySelectorAll('.hfix .row')].find(r => /Lands/.test(r.textContent)); out.landsFlag = !!hl && /more than needed/.test(hl.textContent) && !!hl.querySelector('[data-act="h-fix"]');
  const L = fixList(d, 'Lands'); out.lfix = L.map(p => p.cut + '>' + p.add + ' ' + p.dScore); out.landForSpell = L.every(p => tags(find(p.cut)).land && !tags(find(p.add)).land && p.dScore >= SCORE_MIN);
  const M = fixList(d, 'Mana'); out.mfix = M.map(p => p.cut + '>' + p.add); out.manaNoAdds = M.every(p => tags(find(p.cut)).land);
  const e = evalFor(d); out.manaLine = manaText(e.sim); out.lineOk = e.sim.screwT5 >= 0.08 || !/ran out of lands/.test(out.manaLine);
  S.profile.decks = S.profile.decks.filter(x => x.id !== d.id); S.deckId = w.id; render(); return out; });
T('UI-B101-01', 'Too many lands: Lands shows “N more than needed” with Fix this, which swaps spare lands for needed cards (score-checked); the Mana fix never adds lands to it, and a rare land-short game is not shown as a shortage', b101.lands > b101.T + 2 && b101.landsFlag && b101.landForSpell && b101.manaNoAdds && b101.lineOk, JSON.stringify(b101));
} catch (e) { QUIET = false; T('UI-B101-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B102-01')) { try { if (SHARD) await RESET();
// 53. Build 102: adding a card to the buy list from the Upgrades list keeps the page where it was (no jump to the top, the
// list isn't reworked); health buttons read Show / Show all.
const b102 = await page.evaluate(async () => { const keep = S.syncRecs; S.syncRecs = false; const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render();
  for (let i = 0; i < 150 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100));   /* the list is rebuilt once the Apex reference is ready (it is part of the list's key) */ render(); await recsReady(d); render();
  const sc = document.querySelector('#upscroll'), out = {}; const btns = [...sc.querySelectorAll('[data-act="up-buy"]')]; const b = btns[Math.floor(btns.length / 2)]; if (!b) return {btn:false};
  sc.scrollTop = Math.max(0, b.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 200);   /* Build 135: measured on the page, not inside its card */ const y0 = sc.scrollTop, R0 = recsFor(d), n = b.dataset.n; b.click(); await new Promise(r => setTimeout(r, 400));
  const sc2 = document.querySelector('#upscroll'); out.y0 = y0; out.y1 = sc2.scrollTop; out.kept = y0 > 100 && Math.abs(sc2.scrollTop - y0) < 5; out.sameList = recsFor(d) === R0; out.added = wantOf(d).some(x => x.n === n);
  const k = wantOf(d).findIndex(x => x.n === n); if (k >= 0) wantOf(d).splice(k, 1);
  S.tab = 'stats'; render(); const hb = [...document.querySelectorAll('[data-act="h-fix"]')].map(x => x.textContent.trim()); out.labels = hb; out.showLabels = hb.length > 0 && hb.every(t => /^Show( all)?( \(\d+\))?$/.test(t)) && !/Fix this|Fix all/.test(document.body.textContent);
  S.syncRecs = keep; render(); return out; });
T('UI-B102-01', 'Adding to the buy list from Upgrades keeps the scroll position and does not rework the list; health buttons read Show / Show all', b102.kept && b102.sameList && b102.added && b102.showLabels, JSON.stringify(b102));
} catch (e) { QUIET = false; T('UI-B102-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B103-01')) { try { if (SHARD) await RESET();
// 54. Build 103: the Upgrades list takes spare lands only when the deck runs more than its target, one row per extra land
// (3 over = up to 3 land swaps), each measured with fresh games; every row can show its Highest score card, with its own Swap.
const b103 = await page.evaluate(async () => { const w = S.profile.decks.find(x => /Wakanda/i.test(x.name)), out = {};
  const mk = (id, extraForests) => { const d = JSON.parse(JSON.stringify(w)); d.id = id; d.name = id; if (extraForests > 0){ const sp = d.cards.filter(e => !e.l && find(e.n) && !tags(find(e.n)).land).slice(-extraForests); sp.forEach(e => cutCard(d, e.n, e.q)); addCard(d, 'Forest', extraForests); } else if (extraForests < 0){ let k = -extraForests; d.cards.filter(e => isBasic(e.n)).forEach(e => { while (k > 0 && e.q > 1){ e.q--; k--; } }); addCard(d, 'Sol Ring', 1); for (const c of ['Arcane Signet', 'Mind Stone', 'Thought Vessel']) if (analyze(d).size < 100 && !entryOf(d, c)) addCard(d, c, 1); } return d; };
  for (const [id, n] of [['over3', 3 - (analyze(w).lands - analyze(w).T.lands)], ['at', -(analyze(w).lands - analyze(w).T.lands)]]){ const d = mk(id, n); S.profile.decks.unshift(d); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); const R = await recsReady(d); render(); const A = analyze(d);
    out[id] = {lands:A.lands, T:A.T.lands, spareRows:R.paths.filter(L => L.spare).length, landForSpell:R.paths.filter(L => tags(find(L.cut)).land && Object.values(L.opts).some(p => !tags(find(p.add)).land)).length, dupCuts:R.paths.length - new Set(R.paths.map(L => L.cut)).size, lfs:R.paths.filter(L => tags(find(L.cut)).land && Object.values(L.opts).some(p => !tags(find(p.add)).land)).map(L => L.cut + '>' + Object.values(L.opts).map(p => p.add + (p.held ? '(held)' : '') + (p.spare ? '(spare)' : '')).join('|')), scored:R.paths.filter(L => L.spare).every(L => Object.values(L.opts).every(p => p.dScore >= SCORE_MIN))};
    if (id === 'over3'){ const tb = document.querySelector('[data-act="swap-top"]'); out.topShown = !!tb || !!document.querySelector('.paths .chip.good') && /Highest score/.test(document.querySelector('.paths').textContent); out.tops = R.paths.filter(L => L.top).length;
      if (tb){ const n = tb.dataset.n; out.auto = S.autoYes ? [...S.autoYes].join() : 'none'; tb.click(); await new Promise(r => setTimeout(r, 50)); out.swapped = !!entryOf(d, n); out.toast = $('#toast').textContent; out.n = n; out.v = tb.dataset.v; const L2 = recsFor(d).paths[+tb.dataset.v]; out.L2 = L2 && {cut:L2.cut, top:L2.top && L2.top.n, spare:!!L2.spare}; const cf = document.querySelector('#confirm'); out.confirmOpen = !!cf && !cf.hidden; if (out.confirmOpen) cf.querySelector('[data-act="conf-no"]').click(); } }
    S.profile.decks = S.profile.decks.filter(x => x.id !== d.id); }
  S.deckId = w.id; render(); return out; });
T('UI-B103-01', 'Upgrades list: spare lands come out only when over the land target, at most one per extra land (3 over = up to 3), score-checked with fresh games; none at target. Rows show a Highest score card with its own Swap', b103.over3.lands - b103.over3.T === 3 && b103.over3.landForSpell <= 3 && !b103.over3.dupCuts && b103.over3.spareRows >= 1 && b103.over3.scored && b103.at.spareRows === 0 && b103.tops > 0 && b103.topShown && b103.swapped === true, JSON.stringify(b103));
} catch (e) { QUIET = false; T('UI-B103-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B105-01')) { try { if (SHARD) await RESET();
// 55. Build 105: Collection value on the Library: total value (exact for known prices), by colour and by type, the most
// valuable cards, and how many owned cards are in decks; it stays open across redraws once opened.
const b105 = await page.evaluate(async () => { const P = S.profile, keep = JSON.stringify(P.library || {}); P.library = {}; S.libV = (S.libV || 0) + 1;
  const pick = LIB.filter(c => c.p != null && c.p > 0 && !isBasic(c.n)).slice(0, 40); pick.forEach((c, i) => { P.library[c.n] = 1 + (i % 3); }); S.libV++;
  const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); const inDeck = d.cards.find(e => find(e.n) && find(e.n).p > 0 && !isBasic(e.n)); P.library[inDeck.n] = 1; S.libV++;
  const want = Object.entries(P.library).reduce((s, [n, q]) => s + find(n).p * q, 0);
  S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'lib'; render(); const st = libStats(), el = document.querySelector('#libstats'), out = {shown:!!el};
  out.total = +st.total.toFixed(2); out.want = +want.toFixed(2); out.exact = Math.abs(st.total - want) < 0.005; out.colSum = Math.abs(Object.values(st.col).reduce((s, x) => s + x.v, 0) - want) < 0.005; out.typeSum = Math.abs(Object.values(st.type).reduce((s, x) => s + x.v, 0) - want) < 0.005;
  out.topSorted = st.top.every((x, i) => !i || x.p <= st.top[i - 1].p) && st.top.length === 10; out.used = st.used >= 1;
  if (el){ el.open = true; el.dispatchEvent(new Event('toggle')); render(); out.staysOpen = !!document.querySelector('#libstats[open]'); out.text = document.querySelector('#libstats').textContent.slice(0, 120); }
  P.library = JSON.parse(keep); S.libV++; S.libStatsOpen = false; S.tab = 'list'; render(); return out; });
T('UI-B105-01', 'Library: Collection value shows the exact total, by colour and by type (each adding up to the total), the 10 most valuable cards, and how many owned cards are in decks; stays open once opened', b105.shown && b105.exact && b105.colSum && b105.typeSum && b105.topSorted && b105.used && b105.staysOpen, JSON.stringify(b105));
} catch (e) { QUIET = false; T('UI-B105-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B106-01')) { try { if (SHARD) await RESET();
// 56. Build 106: Card search Sort: most played, cheapest, most expensive, by job, and best for the open deck (its upgrade
// value, outside-colour cards last), applied to every match before the first 60 are shown.
const b106 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.open = false; S.view = 'search'; S.search = {q:'', color:'G', type:'Creature', fmt:'commander', max:'', theme:'', sort:''}; render();
  const sel = document.querySelector('#s-sort'), out = {opts:sel ? [...sel.options].map(o => o.value) : []}, shown = () => [...document.querySelectorAll('#s-res .card[data-n], #s-res [data-n]')].map(e => e.dataset.n).filter((n, i, a) => a.indexOf(n) === i).map(find).filter(Boolean);
  const set = v => { sel.value = v; sel.dispatchEvent(new Event('change', {bubbles:true})); return shown(); };
  let L = set('pop'); out.pop = L.length > 10 && L.every((c, i) => !i || (c.r || 1e6) >= (L[i - 1].r || 1e6));
  L = set('cheap'); out.cheap = L.every((c, i) => !i || c.p == null || L[i - 1].p == null ? true : c.p >= L[i - 1].p);
  L = set('dear'); out.dear = L.every((c, i) => !i || c.p == null || L[i - 1].p == null ? true : c.p <= L[i - 1].p) && L[0].p >= 20;
  L = set('role'); const ji = c => { const i = SEARCH_JOBS.findIndex(x => tags(c).roles.has(x)); return i < 0 ? 99 : i; }; out.role = L.every((c, i) => !i || ji(c) >= ji(L[i - 1])) && ji(L[0]) === 0;
  const t0 = performance.now(); L = set('deck'); out.ms = Math.round(performance.now() - t0); const R = recsFor(d), id = ctxOf(d).ident, inC = c => c.ci.every(x => id.includes(x));
  out.deck = L.length > 10 && L.slice(0, 10).every(inC) && L.slice(0, 10).every((c, i) => !i || R.valOf(c) <= R.valOf(L[i - 1]) + 1e-9); out.note = /best for Wakanda/.test(document.querySelector('#s-res').textContent);
  out.first = L.slice(0, 3).map(c => c.n); sel.value = ''; sel.dispatchEvent(new Event('change', {bubbles:true})); S.search.sort = ''; S.view = 'decks'; S.open = true; render(); return out; });
T('UI-B106-01', 'Card search Sort: most played, cheapest, most expensive, by job, and best for the open deck (by its upgrade value, in-colour first) all order every match correctly', b106.opts.includes('deck') && b106.pop && b106.cheap && b106.dear && b106.role && b106.deck && b106.note, JSON.stringify(b106));
} catch (e) { QUIET = false; T('UI-B106-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B107-01')) { try { if (SHARD) await RESET();
// 57. Build 107: deck folders and tags. Set on the Build panel; My decks shows them and filters by folder and tag; renaming a
// folder moves its decks; deleting a folder (asks first) keeps its decks with no folder; removing a tag asks first; a deck
// from an old backup (no folder or tags) shows under No folder; the upgrade list isn't reworked by these changes.
const b107 = await page.evaluate(async () => { const out = {}, P = S.profile, keep = S.autoYes; S.autoYes = null; const w = P.decks.find(x => /Wakanda/i.test(x.name)), dm = P.decks.find(x => /Doom/i.test(x.name));
  const cf = () => document.querySelector('#confirm'), yes = () => cf().querySelector('[data-act="conf-yes"]').click(), no = () => cf().querySelector('[data-act="conf-no"]').click();
  S.deckId = w.id; S.view = 'decks'; S.open = true; S.tab = 'build'; w.custom = true; render(); const R0 = recsFor(w);
  const fi = document.querySelector('#deck-folder'); out.folderBox = !!fi; fi.value = 'Casual'; fi.dispatchEvent(new Event('change', {bubbles:true})); out.folderSet = w.folder === 'Casual';
  const ti = document.querySelector('#deck-tag'); ti.value = 'Tokens'; document.querySelector('[data-act="dtag-add"]').click(); const ti2 = document.querySelector('#deck-tag'); ti2.value = 'Friday'; ti2.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
  out.tags = (w.dtags || []).join(','); out.sameRecs = recsFor(w) === R0;
  const rm = document.querySelector('[data-act="dtag-rm"][data-n="Friday"]'); rm.click(); out.tagAsks = !cf().hidden; no(); out.tagKept = w.dtags.includes('Friday'); document.querySelector('[data-act="dtag-rm"][data-n="Friday"]').click(); yes(); out.tagGone = !w.dtags.includes('Friday');
  delete dm.folder; delete dm.dtags; S.open = false; render(); out.tileChips = [...document.querySelectorAll('.tile')].some(t => /Wakanda/.test(t.textContent) && /Folder: Casual/.test(t.textContent) && /Tokens/.test(t.textContent));
  const ff = document.querySelector('#deck-filter-folder'); ff.value = 'Casual'; ff.dispatchEvent(new Event('change', {bubbles:true})); out.filterFolder = document.querySelectorAll('.tile:not(.newdeck)').length === P.decks.filter(x => x.folder === 'Casual').length;
  const nf = document.querySelector('#folder-new'); nf.value = 'Fun'; document.querySelector('[data-act="folder-rename"]').click(); out.renamed = w.folder === 'Fun' && S.deckFolder === 'Fun';
  const f2 = document.querySelector('#deck-filter-folder'); f2.value = ''; f2.dispatchEvent(new Event('change', {bubbles:true})); out.noFolder = [...document.querySelectorAll('.tile[data-v]')].some(t => t.dataset.v === dm.id) && ![...document.querySelectorAll('.tile[data-v]')].some(t => t.dataset.v === w.id);
  const f3 = document.querySelector('#deck-filter-folder'); f3.value = '*'; f3.dispatchEvent(new Event('change', {bubbles:true}));
  const tg = document.querySelector('#deck-filter-tag'); tg.value = 'Tokens'; tg.dispatchEvent(new Event('change', {bubbles:true})); out.filterTag = document.querySelectorAll('.tile:not(.newdeck)').length === 1; const t2 = document.querySelector('#deck-filter-tag'); t2.value = ''; t2.dispatchEvent(new Event('change', {bubbles:true}));
  const f4 = document.querySelector('#deck-filter-folder'); f4.value = 'Fun'; f4.dispatchEvent(new Event('change', {bubbles:true})); document.querySelector('[data-act="folder-del"]').click(); out.delAsks = !cf().hidden; yes(); out.deleted = !w.folder && w.dtags.includes('Tokens') && P.decks.includes(w);
  delete w.dtags; S.deckFolder = '*'; S.deckTag = ''; S.autoYes = keep; S.open = true; S.tab = 'list'; render(); return out; });
T('UI-B107-01', 'Deck folders and tags: set on the Build panel (Enter adds a tag), shown on My decks, filter by folder and tag, rename a folder, delete a folder (asks first, decks kept), remove a tag (asks first), old decks show under No folder, upgrades not reworked', b107.folderBox && b107.folderSet && b107.tags === 'Tokens,Friday' && b107.sameRecs && b107.tagAsks && b107.tagKept && b107.tagGone && b107.tileChips && b107.filterFolder && b107.renamed && b107.noFolder && b107.filterTag && b107.delAsks && b107.deleted, JSON.stringify(b107));
} catch (e) { QUIET = false; T('UI-B107-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B108-01')) { try { if (SHARD) await RESET();
// 58. Build 108: Share link. The deck is packed into the link; opening it shows the deck with Save to my decks, and the saved
// copy has every card, the commander and the build settings. A damaged link says so and changes nothing.
const b108 = await page.evaluate(async () => { const out = {}, w = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = w.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render();
  document.querySelector('[data-act="share-open"]').click(); for (let i = 0; i < 40 && !document.querySelector('#share-url'); i++) await new Promise(r => setTimeout(r, 50));
  const url = document.querySelector('#share-url').value; out.len = url.length; out.short = url.length < 4000; out.packed = /#share=z/.test(url); $('#modal').hidden = true;
  const n0 = S.profile.decks.length; location.hash = url.slice(url.indexOf('#')); for (let i = 0; i < 40 && !/Shared deck/.test(document.querySelector('#modal').textContent || ''); i++) await new Promise(r => setTimeout(r, 50));
  out.shown = !$('#modal').hidden && /Shared deck: Wakanda/.test($('#modal').textContent); out.hashCleared = !location.hash;
  document.querySelector('[data-act="share-save"]').click(); const d = S.profile.decks[0]; out.saved = S.profile.decks.length === n0 + 1 && d !== w;
  const sig = x => x.cards.map(e => e.n + '×' + e.q).sort().join('|'); out.sameCards = sig(d) === sig(w); out.sameCmd = d.commander === w.commander; out.sameAims = JSON.stringify(d.aims) === JSON.stringify(w.aims) && d.tier === w.tier;
  location.hash = '#share=zNotAValidCode'; await new Promise(r => setTimeout(r, 200)); out.badMsg = /damaged/.test($('#toast').textContent); out.badNoDeck = S.profile.decks.length === n0 + 1;
  S.profile.decks = S.profile.decks.filter(x => x !== d); S.deckId = w.id; render(); return out; });
T('UI-B108-01', 'Share link: the deck is packed into a short link; opening it shows the deck with Save to my decks; the saved copy has the same cards, commander and build settings; a damaged link says so and adds nothing', b108.short && b108.packed && b108.shown && b108.hashCleared && b108.saved && b108.sameCards && b108.sameCmd && b108.sameAims && b108.badMsg && b108.badNoDeck, JSON.stringify(b108));
} catch (e) { QUIET = false; T('UI-B108-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B109-01')) { try { if (SHARD) await RESET();
// 59. Build 109: Best by job: for each job the strongest cards for the deck, in its colours and not already in it, in the
// engine's own order, each with a score change; tabs switch jobs; Add to Buy List works inside the window.
const b109 = await page.evaluate(async () => { const out = {}, w = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = w.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); await recsReady(w); render();
  const btn = document.querySelector('[data-act="jobs-open"]'); out.btn = !!btn; btn.click(); const R = recsFor(w), id = ctxOf(w).ident; out.jobs = {};
  for (const [k] of JOB_TABS){ const t = document.querySelector('[data-act="jobs-tab"][data-v="' + k + '"]'); t.click(); const names = [...document.querySelectorAll('#modal .sw.in')].map(b => b.dataset.n), C = names.map(find);
    out.jobs[k] = {n:names.length, role:C.every(c => tags(c).roles.has(k)), colours:C.every(c => c.ci.every(x => id.includes(x))), notIn:C.every(c => !hasCard(w, c.n)), ordered:C.every((c, i) => !i || R.valOf(c) <= R.valOf(C[i - 1]) + 1e-9), scored:document.querySelectorAll('#modal .chip').length > 0}; }
  const b = document.querySelector('#modal [data-act="up-buy"]'); if (b){ const n = b.dataset.n; b.click(); out.bought = wantOf(w).some(x => x.n === n) && !$('#modal').hidden && /On the Buy List/.test($('#modal').textContent); const k = wantOf(w).findIndex(x => x.n === n); if (k >= 0) wantOf(w).splice(k, 1); }
  $('#modal').hidden = true; return out; });
T('UI-B109-01', 'Best by job: ramp, draw, removal, wipes and protection lists hold only cards for that job, in the deck colours and not in the deck, in the engine’s own order with score chips; Add to Buy List works inside it', b109.btn && Object.values(b109.jobs).every(j => j.n > 0 && j.role && j.colours && j.notIn && j.ordered && j.scored) && b109.bought, JSON.stringify(b109));
} catch (e) { QUIET = false; T('UI-B109-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B110-01')) { try { if (SHARD) await RESET();
// 60. Build 110: Price history. Two card-data snapshots with different prices: tracked cards (in a deck) keep both prices by
// date, the card window shows the change with a small line, a card opened once is tracked from then, and storage stays small.
const b110 = await page.evaluate(async () => { const out = {}, w = S.profile.decks.find(x => /Wakanda/i.test(x.name)); localStorage.removeItem(PH_KEY);
  const e = w.cards.find(x => find(x.n) && find(x.n).p > 1 && !isBasic(x.n)), c = find(e.n), p0 = c.p; c.p = 10; recordPrices('2026-09-01'); c.p = 12.5; recordPrices('2026-10-01'); recordPrices('2026-10-01');
  const L = phOf(c); out.points = L && L.map(x => x.join(':')); out.kept = !!L && L.length === 2 && L[0][1] === 10 && L[1][1] === 12.5;
  S.deckId = w.id; S.view = 'decks'; S.open = true; render(); openCard(c.n); const m = $('#modal').textContent; out.shown = /Price history/.test(m) && /\$10\.00 on 2026-09-01 → \$12\.50 on 2026-10-01/.test(m) && /\+25%/.test(m) && !!document.querySelector('#modal svg.spark'); $('#modal').hidden = true;
  const o = LIB.find(x => x.p > 1 && !isBasic(x.n) && !hasCard(w, x.n) && !phOf(x)); openCard(o.n); $('#modal').hidden = true; out.seenTracked = !!phOf(o) && phTracked().has(o._n);
  out.bytes = (localStorage.getItem(PH_KEY) || '').length; out.small = out.bytes < 200000; c.p = p0; return out; });
T('UI-B110-01', 'Price history: two card-data snapshots keep both prices by date for tracked cards; the card window shows the change (+25%) with a small line; a card opened is tracked from then; storage stays small', b110.kept && b110.shown && b110.seenTracked && b110.small, JSON.stringify(b110));
} catch (e) { QUIET = false; T('UI-B110-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B111-01')) { try { if (SHARD) await RESET();
// 61. Build 111: Card search "What it does". Each plain-word filter must find its known cards and leave out known non-matches,
// and the menu narrows the results.
const b111 = await page.evaluate(async () => { const F = k => WHAT_BY[k].f, has = (k, n) => !!find(n) && F(k)(find(n)), out = {bad:[]};
  const FX = {treasure:[['Smothering Tithe', 'Pitiless Plunderer'], ['Sol Ring', 'Mind Stone']], tokens:[['Avenger of Zendikar'], ['Anointed Procession', 'Smothering Tithe']],
    diesdraw:[['Midnight Reaper', 'Skullclamp'], ['Rhystic Study', 'Blood Artist']], sacout:[["Ashnod's Altar", 'Viscera Seer', 'Carrion Feeder'], ['Blood Artist', 'Mind Stone', "Tormod's Crypt"]],
    aristocrat:[['Blood Artist'], ['Midnight Reaper', 'Viscera Seer']], counters:[['Hardened Scales', 'Carrion Feeder'], ['Sol Ring']], doubler:[['Doubling Season', 'Anointed Procession', 'Hardened Scales'], ['Avenger of Zendikar']],
    recursion:[['Eternal Witness', 'Regrowth'], ['Swords to Plowshares']], gyhate:[['Bojuka Bog', 'Rest in Peace', "Tormod's Crypt"], ['Regrowth']], blink:[['Ephemerate', 'Restoration Angel'], ['Swords to Plowshares']],
    lifegain:[['Soul Warden', 'Blood Artist'], ['Swords to Plowshares']], castdraw:[['Mesa Enchantress'], ['Rhystic Study']], costless:[['Goblin Electromancer'], ['Sol Ring']], combat:[['Aggravated Assault'], ['Sol Ring']],
    copy:[['Reverberate', 'Fork'], ['Doubling Season']], untapper:[['Aggravated Assault'], ['Sol Ring']]};
  for (const k in FX){ FX[k][0].forEach(n => { if (!has(k, n)) out.bad.push(k + ' missed ' + n); }); FX[k][1].forEach(n => { if (has(k, n)) out.bad.push(k + ' wrongly ' + n); }); }
  out.counts = Object.fromEntries(WHAT.map(([k, , f]) => [k, LIB.filter(c => legalIn(c, 'commander') && f(c)).length])); out.sane = Object.values(out.counts).every(n => n >= 5 && n < 8000);
  S.view = 'search'; S.open = false; S.search = {q:'', color:'', type:'', fmt:'commander', max:'', theme:'', sort:'', what:''}; render(); const sel = document.querySelector('#s-what'); out.menu = !!sel && sel.options.length === WHAT.length + 1;
  sel.value = 'treasure'; sel.dispatchEvent(new Event('change', {bubbles:true})); const names = [...document.querySelectorAll('#s-res [data-n]')].map(e => e.dataset.n).filter((n, i, a) => a.indexOf(n) === i);
  out.narrowed = names.length > 0 && names.every(n => F('treasure')(find(n))); S.search.what = ''; S.view = 'decks'; S.open = true; render(); return out; });
T('UI-B111-01', 'Card search “What it does”: every filter finds its known cards and leaves out known non-matches; the menu narrows the results; each filter matches a sensible number of cards', !b111.bad.length && b111.sane && b111.menu && b111.narrowed, JSON.stringify(b111));
} catch (e) { QUIET = false; T('UI-B111-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B112-01')) { try { if (SHARD) await RESET();
// 62. Build 112: Decks you can build. A library made from a precon (with and without its commander) ranks that precon's
// commander at or near the top; the top three get a build from your cards with how much you own and what the rest costs;
// Generate from my cards opens Generate for that commander with "cards I already own" on.
const b112 = await page.evaluate(async () => { const out = {}, P = S.profile, keep = JSON.stringify(P.library || {}), w = P.decks.find(x => /Wakanda/i.test(x.name)), cmd = find(w.commander);
  P.library = {}; libAddList(w.cards, w.commander); S.libV = (S.libV || 0) + 1; S.dycb = null;
  let t0 = performance.now(); const R1 = dycbRank(10); out.rankMs = Math.round(performance.now() - t0); out.withCmd = R1.findIndex(r => r.c._n === cmd._n); out.top = R1.slice(0, 3).map(r => r.c.n);
  delete P.library[cmd.n]; S.libV++; const R2 = dycbRank(10); out.withoutCmd = R2.findIndex(r => r.c._n === cmd._n); P.library[cmd.n] = 1; S.libV++;
  out.others = {}; for (const re of [/Doom Prevails/, /Avengers/]){ const o = P.decks.find(x => re.test(x.name)); if (!o) continue; P.library = {}; libAddList(o.cards); S.libV++; out.others[o.name] = dycbRank(10).findIndex(r => r.c._n === find(o.commander)._n); }
  P.library = {}; libAddList(w.cards, w.commander); S.libV++;
  S.view = 'decks'; S.open = false; render(); openDycb(); for (let i = 0; i < 400 && S.dycb.rows.slice(0, 3).some(r => !r.cost); i++) await new Promise(r => setTimeout(r, 100));
  const r0 = S.dycb.rows[0]; out.cost = r0.cost; out.costShown = /You own \d+ of \d+ · the rest ≈ \$\d+/.test($('#modal').textContent); out.ownMost = r0.cost && r0.c._n === cmd._n ? r0.cost.have >= 60 : true;
  document.querySelector('#modal [data-act="dycb-gen"]').click(); out.gen = !!document.querySelector('#gen-q') && S.gen.cmd === S.dycb.rows[0].c.n && S.gen.own === true; $('#modal').hidden = true;
  P.library = JSON.parse(keep); S.libV++; S.dycb = null; S.gen.own = false; return out; });
T('UI-B112-01', 'Decks you can build: a library from a precon ranks its commander at or near the top (top 3 with it, top 5 without it); the top picks show how much you own and what the rest costs; Generate from my cards opens Generate with own cards on', b112.withCmd >= 0 && b112.withCmd < 3 && b112.withoutCmd >= 0 && b112.withoutCmd < 5 && Object.values(b112.others).every(k => k >= 0 && k < 5) && b112.costShown && b112.ownMost && b112.gen, JSON.stringify(b112));
} catch (e) { QUIET = false; T('UI-B112-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B113-01')) { try { if (SHARD) await RESET();
// 63. Build 113: Lands helper. Lands against the target, sources needed for each colour (Karsten tables) against what the deck
// has, popular lands for the commander it doesn't run (lands, in its colours, run by 20%+), and buttons to the land swaps.
const b113 = await page.evaluate(async () => { const out = {}, w = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = w.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); await recsReady(w); render();
  const b = document.querySelector('[data-act="lands-open"]'); out.btn = !!b; b.click(); const m = $('#modal'), t = m.textContent, A = analyze(w), H = landHelp(w), ctx = ctxOf(w);
  out.landsLine = new RegExp(A.lands + ' lands, about ' + A.T.lands + ' needed').test(t);
  out.colours = ctx.ident.map(k => ({k, need:Math.round(H.need[k] || 0), have:H.src[k].lands + H.src[k].other})); out.coloursShown = out.colours.every(x => new RegExp('needs about ' + x.need + ' sources · has ' + x.have).test(t) || (!x.need && /no spells need it/.test(t)));
  out.needSane = out.colours.every(x => x.need === 0 || (x.need >= 10 && x.need <= 40));
  const pop = [...m.querySelectorAll('.sw.in')].map(e => find(e.dataset.n)); out.pop = pop.length; out.popOk = pop.every(c => tags(c).land && !hasCard(w, c.n) && c.ci.every(k => ctx.ident.includes(k)) && edhOf(ctx.edh.map, c).inc >= 0.2);
  m.querySelector('[data-act="h-fix"][data-v="Mana"]').click(); out.opensFix = /Fix: Mana/.test($('#modal').textContent); $('#modal').hidden = true; return out; });
T('UI-B113-01', 'Lands helper: lands against target, colour sources needed (Karsten) against what the deck has for each colour, popular lands it lacks (in colour, 20%+ play rate), and Show land swaps opens the Mana swaps', b113.btn && b113.landsLine && b113.coloursShown && b113.needSane && b113.popOk && b113.opensFix, JSON.stringify(b113));
} catch (e) { QUIET = false; T('UI-B113-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B114-01')) { try { if (SHARD) await RESET();
// 64. Build 114: our own land formula. A full Commander deck's land target comes from its spells (31.5 + 1.6 × average mana
// value − 0.32 × cheap ramp + 0.72 × landfall cards, 30–42); a deck still being built keeps the starting target; a
// generated deck gets the formula's land count.
const b114 = await page.evaluate(async () => { const out = {}, w = S.profile.decks.find(x => /Wakanda/i.test(x.name)), A = analyze(w);
  out.target = A.T.lands; out.expect = Math.max(30, Math.min(42, Math.round(31.5 + 1.6 * A.avg - 0.32 * A.cheapRamp + 0.72 * A.landfall))); out.formula = out.target === out.expect;
  const part = JSON.parse(JSON.stringify(w)); part.id = 'part'; part.cards = part.cards.slice(0, 20); out.partial = analyze(part).T.lands; out.partialStarts = out.partial === targetsOf(part, ctxOf(part)).lands;
  const g = await startPlan('Don & Leo, Problem Solvers', [], null, null, {fill:'apex'}); const G = analyze(g); out.gen = {size:G.size, lands:G.lands, target:G.T.lands}; out.genOk = G.size === 100 && Math.abs(G.lands - G.T.lands) <= 1; S.draft = null; return out; });
T('UI-B114-01', 'Land formula: a full deck’s land target comes from its spells (average mana value, cheap ramp, landfall); a deck still being built keeps the starting target; a generated deck gets the formula’s land count (within one)', b114.formula && b114.partialStarts && b114.genOk, JSON.stringify(b114));
} catch (e) { QUIET = false; T('UI-B114-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B115-01')) { try { if (SHARD) await RESET();
// 65. Build 115, revised in Build 141 (owner: Game Changers follow the rule of every other mechanic, and Apex has no Bracket 3
// cap): the extra Game Changer rows are offered whatever the deck already holds, each only when the card window rates it a Good
// or Great fit, up to three (more only for a Strong upgrade, +1 deck score); none below Apex.
const b115 = await page.evaluate(async () => { const out = {}, w = S.profile.decks.find(x => /Wakanda/i.test(x.name));
  const mk = (id, gcs, tier) => { const d = JSON.parse(JSON.stringify(w)); d.id = id; d.tier = tier || 'apex'; const sp = d.cards.filter(e => !e.l && find(e.n) && !tags(find(e.n)).land && !find(e.n).gc).slice(-gcs.length); sp.forEach(e => cutCard(d, e.n, e.q)); gcs.forEach(n => addCard(d, n, 1)); return d; };
  const count = d => { const R = upgradePaths(d); try { scoreCheck(d, R, {apex:apexFor(d) || apexRef(d)}); } catch (e) {} const X = R.paths.filter(L => L.gcPick && L.opts.apex && L.opts.apex.gcPick);
    return {extra:X.length, fits:X.map(L => evalFit(d, find(L.opts.apex.add), null).fit), strong:X.filter(L => (L.opts.apex.dScore || 0) >= UP.gcS).length, gcIn:ctxOf(d).gcIn}; };
  const GC = LIB.filter(c => c.gc && legalIn(c, 'commander') && c.ci.every(k => ctxOf(w).ident.includes(k)) && !hasCard(w, c.n)).slice(0, 3).map(c => c.n);
  out.none = count(mk('g0', [])); out.three = count(mk('g3', GC)); out.mid = count(mk('gm', [], 'mid')); out.gcs = GC;
  const ok = x => x.fits.every(f => f === 'good' || f === 'great') && x.extra <= Math.max(UP.gcK, Math.min(UP.gcN, UP.gcK + x.strong));
  out.okNone = ok(out.none); out.okThree = out.three.gcIn >= 3 && ok(out.three); out.okMid = out.mid.extra === 0; return out; });
T('UI-B115-01', 'Game Changer rows (Build 141 rule): offered whatever the deck holds, each a Good or Great fit, up to three (more only for a Strong upgrade); none below Apex', b115.okNone && b115.okThree && b115.okMid, JSON.stringify(b115));
} catch (e) { QUIET = false; T('UI-B115-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B116-01')) { try { if (SHARD) await RESET();
// 66. Build 116: phone layout. On phones (portrait and landscape) the home tagline is hidden and a Continue card for the last
// deck shows above the tiles; the header reads the full name; iPad (portrait and landscape) and desktop are unchanged.
const b116 = {}; { const w = await page.evaluate(() => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); recentAdd(d.id); return d.name; });
  for (const [k, vw, vh] of [['phoneP', 390, 844], ['phoneL', 844, 390], ['ipadP', 820, 1180], ['ipadL', 1180, 820], ['desk', 1300, 900]]){ await page.setViewportSize({width:vw, height:vh}); await page.waitForTimeout(150);
    b116[k] = await page.evaluate(n => { S.view = 'home'; S.open = false; $('#modal').hidden = true; render(); const c = document.querySelector('.continue');
      return {hero:getComputedStyle(document.querySelector('.hero')).display !== 'none', cont:!!c && getComputedStyle(c).display !== 'none', name:!!c && c.textContent.includes(n), brand:document.querySelector('.brand').innerText.replace(/\s+/g, ' ').trim()}; }, w); }
  await page.setViewportSize({width:1300, height:900}); await page.evaluate(() => { S.view = 'decks'; S.open = true; render(); }); }
T('UI-B116-01', 'Phone layout: on phones (portrait and landscape) no tagline, a Continue card for the last deck, and the header reads Deck Builder; iPad portrait, iPad landscape and desktop unchanged', ['phoneP', 'phoneL'].every(k => !b116[k].hero && b116[k].cont && b116[k].name) && ['ipadP', 'ipadL', 'desk'].every(k => b116[k].hero && !b116[k].cont) && Object.values(b116).every(x => /DECK BUILDER/i.test(x.brand)), JSON.stringify(b116));
} catch (e) { QUIET = false; T('UI-B116-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B117-01')) { try { if (SHARD) await RESET();
// 67. Build 117: phones. The Continue card sits under the three home tiles, just above Profile, with no extra deck buttons; on a
// phone held sideways the deck screen is one column, the page itself scrolls (no fixed-height boxes) and the deck buttons
// stay on one row. iPad landscape keeps its two panes and fixed working area.
const b117 = {}; { for (const [k, vw, vh] of [['phoneP', 390, 844], ['phoneL', 844, 390], ['ipadL', 1180, 820]]){ await page.setViewportSize({width:vw, height:vh}); await page.waitForTimeout(150);
    b117[k] = await page.evaluate(() => { S.view = 'home'; S.open = false; $('#modal').hidden = true; render(); const m = document.querySelector('#main'), kids = [...m.querySelectorAll('.tiles.home3, .continue, [data-v="profile"]')].map(e => e.matches('.continue') ? 'continue' : e.matches('.tiles') ? 'tiles' : 'profile');
      const out = {order:kids.join('>'), extra:document.querySelectorAll('.continue .recent').length};
      const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render(); fitWork(); const w = document.querySelector('.work'), bar = document.querySelector('.row.bar');
      out.narrow = document.querySelector('.app').classList.contains('narrow'); out.workFixed = !!w.style.height; out.pageScrolls = document.scrollingElement.scrollHeight > innerHeight + 200; out.barOneRow = bar.scrollHeight <= 60; return out; }); }
  await page.setViewportSize({width:1300, height:900}); await page.evaluate(() => { render(); }); }
T('UI-B117-01', 'Phones: Continue under the home tiles and above Profile, no extra deck buttons; sideways phone deck screen is one column with the page scrolling and one row of deck buttons; iPad landscape unchanged (two panes, fixed working area)', b117.phoneP.order === 'tiles>continue>profile' && b117.phoneL.order === 'tiles>continue>profile' && !b117.phoneP.extra && b117.phoneL.narrow && !b117.phoneL.workFixed && b117.phoneL.pageScrolls && b117.phoneL.barOneRow && !b117.ipadL.narrow && b117.ipadL.workFixed, JSON.stringify(b117));
} catch (e) { QUIET = false; T('UI-B117-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B118-01')) { try { if (SHARD) await RESET();
// 68. Build 118: smarter deck score, stage 1. In an Apex deck a tournament staple (fast mana, free interaction, the best lands) is
// worth more and says why; the best lands count toward card quality. Mid decks are unchanged.
const b118 = await page.evaluate(() => { const mk = t => { const d = newDeck({name:'Staples ' + t, format:'commander'}); setCommander(d, 'Tivit, Seller of Secrets'); d.tier = t; return d; };
  // Build 141: this deck has no play data loaded, so it counts as an obscure commander, whose generic-power bonuses are scaled
  // (UP.thT, UP.thP; tested in UI-B141-03); the stage-1 bonus itself is tested at full value
  const th = [UP.thT, UP.thP]; UP.thT = 1; UP.thP = 1;
  const A = mk('apex'), M = mk('mid'), cA = ctxOf(A), cM = ctxOf(M), mox = find('Mox Diamond'), fow = find('Force of Will'), sA = baseScore(mox, A, cA), sM = baseScore(mox, M, cM);
  return {apexWhy:sA.why.includes('Tournament staple: fast mana'), midWhy:sM.why.some(w => /Tournament/.test(w)), gain:+(sA.s - sM.s).toFixed(2), fowWhy:baseScore(fow, A, cA).why.includes('Tournament staple: free or one-mana interaction'),
    tombA:spellMean([{n:'Ancient Tomb', q:1}], A, cA) > 0, tombM:spellMean([{n:'Ancient Tomb', q:1}], M, cM) === 0, restore:([UP.thT, UP.thP] = th, true)}; });
T('UI-B118-01', 'Smarter deck score, stage 1: in an Apex deck tournament staples (Mox Diamond, Force of Will) score higher and say why, and Ancient Tomb counts toward card quality; a Mid deck is unchanged', b118.apexWhy && !b118.midWhy && b118.gain >= 5.9 && b118.fowWhy && b118.tombA && b118.tombM, JSON.stringify(b118));
} catch (e) { QUIET = false; T('UI-B118-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B119-01')) { try { if (SHARD) await RESET();
// 69. Build 119: printed names. A reskinned reprint shows the name on the card ("Humongous Fungus" in the TMNT precon) with the
// card's own name beside it: kept when a precon or a pasted list is loaded, and read from the precon list for decks saved earlier.
const b119 = await page.evaluate(async () => { await loadPreconLive('turtle-power', 'Turtle Power!'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; await loadEdh(d.commander); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; S.deckQ = ''; S.listRole = ''; render();
  const row = n => { const b = document.querySelector('.dl[data-n="' + n + '"] .nm'); return b ? b.textContent : null; }, e = d.cards.find(x => x.n === 'Corpsejack Menace'), out = {kept:e && e.pn, row:row('Corpsejack Menace')};
  delete e.pn; render(); out.oldDeck = row('Corpsejack Menace');
  const r = parseDeckText('1 Humongous Fungus\n1 Corpsejack Menace (RTR) 145'); out.paste = r.cards.map(x => x.n + '|' + (x.pn || '')).join(';');
  const o = newDeck({name:'Own Fungus', format:'commander'}); setCommander(o, d.commander); addCard(o, 'Corpsejack Menace', 1); S.profile.decks.unshift(o); S.draft = null; S.deckId = o.id; render(); out.own = row('Corpsejack Menace');
  S.profile.decks = S.profile.decks.filter(x => x.id !== o.id); return out; });
T('UI-B119-01', 'Printed names: the TMNT precon lists Corpsejack Menace as “Humongous Fungus” with its own name beside it, also for a deck saved before; a pasted list keeps the printed name; a deck built with the original printing shows only Corpsejack Menace', b119.kept === 'Humongous Fungus' && /^Humongous Fungus Corpsejack Menace/.test(b119.row || '') && /^Humongous Fungus Corpsejack Menace/.test(b119.oldDeck || '') && b119.paste === 'Corpsejack Menace|Humongous Fungus' && /^Corpsejack Menace/.test(b119.own || '') && !/Humongous/.test(b119.own || ''), JSON.stringify(b119));
} catch (e) { QUIET = false; T('UI-B119-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B119-02')) { try { if (SHARD) await RESET();
const b119b = await page.evaluate(() => { const out = {}, sw = find('Sword of Fire and Ice'), keep = sw.fn; sw.fn = 'Patriotic Shield';
  const d = S.profile.decks.find(x => /Turtle Power/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; render();
  openCard('Sword of Fire and Ice'); out.note = ($('#pic-note') || {}).textContent || ''; $('#modal').hidden = true;
  d.cards.find(x => x.n === 'Corpsejack Menace').pn = 'Humongous Fungus'; openCard('Corpsejack Menace'); out.title = ($('#modal .ph h2') || {}).textContent || ''; $('#modal').hidden = true;
  const e = d.cards.find(x => x.n === 'Corpsejack Menace'); setPrint(e, {id:'x1', set:'Return to Ravnica', sc:'rtr', cn:'145', rar:'rare', fn:''}); out.cleared = !e.pn;
  setPrint(e, {id:'x2', set:'TMNT Commander', sc:'tmc', cn:'1', rar:'rare', fn:'Humongous Fungus'}); out.set = e.pn; sw.fn = keep; return out; });
T('UI-B119-02', 'Printed names in the card window: the title shows the deck’s printed name with the card’s own name beside it; a picture of a printing with another name says so (Sword of Fire and Ice shown as its Marvel “Patriotic Shield” printing); choosing a printing sets or clears the printed name', /Patriotic Shield printing of Sword of Fire and Ice/.test(b119b.note) && /^Humongous Fungus Corpsejack Menace/.test(b119b.title) && b119b.cleared && b119b.set === 'Humongous Fungus', JSON.stringify(b119b));
} catch (e) { QUIET = false; T('UI-B119-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B120-01')) { try { if (SHARD) await RESET();
// 70. Build 120: the card window's tip agrees with the measured swap. A swap that raises the score is named an upgrade with the
// parts that moved, and never sits beside "Poor fit" or "ranks below nearly every spell" (Wakanda Forever, Sword of Fire and Ice).
const b120 = await page.evaluate(() => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render();
  openCard('Sword of Fire and Ice'); const m = $('#modal'), chip = [...m.querySelectorAll('.swaphero ~ .row .chip')].map(x => x.textContent).join('|'), tip = (m.querySelector('.tip b') || {}).textContent || '', txt = (m.querySelector('.tip') || {}).textContent || '';
  m.hidden = true; return {chip, tip, up:/\+\d/.test(chip), saysGain:/changes the deck score by/.test(txt), oldLine:/ranks below nearly every spell already/.test(txt), poor:/Poor fit/.test(tip)}; });
T('UI-B120-01', 'Score and tip agree: when the best swap raises the deck score the tip is an upgrade label with the parts that moved, never Poor fit or "ranks below nearly every spell"', !b120.up || (b120.saysGain && !b120.oldLine && !b120.poor && /upgrade/i.test(b120.tip)), JSON.stringify(b120));
} catch (e) { QUIET = false; T('UI-B120-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B121-01')) { try { if (SHARD) await RESET();
// 71. Build 121: the deck's working area fits the visible screen after it is sized, and the Upgrades list scrolls inside it.
const b121 = await page.evaluate(() => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; $('#modal').hidden = true; render(); fitWork();
  const w = document.querySelector('.work'), up = document.querySelector('.work .scroll.up'), out = {fits:w ? Math.round(w.getBoundingClientRect().bottom + scrollY) <= Math.ceil(innerHeight + scrollY) + 1 : false, long:up ? up.scrollHeight > up.clientHeight : false};
  if (up){ up.scrollTop = 200; out.scrolls = up.scrollTop > 0; up.scrollTop = 0; } S.tab = 'list'; render(); return out; });
T('UI-B121-01', 'Working area fits the visible screen and the Upgrades list scrolls inside it (reload scroll lock)', b121.fits && (!b121.long || b121.scrolls), JSON.stringify(b121));
} catch (e) { QUIET = false; T('UI-B121-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B122-01')) { try { if (SHARD) await RESET();
// 72. Build 122: the mana check counts every colour source the way the generator does, and suggests new basics only when they
// close a real shortfall (2+ sources); the banner says how short the deck is instead of "the colours have shifted".
const b122 = await page.evaluate(() => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)), u = JSON.parse(JSON.stringify(d)); const ok = manaPlan(u);
  const w = u.cards.find(e => e.n === 'Plains'), q = w ? w.q : 0; if (q){ cutCard(u, 'Plains', q); addCard(u, 'Forest', q); } const bad = manaPlan(u);
  return {okOff:ok.off, badOff:bad.off, stuck:bad.stuck, closes:!!bad.stuck && bad.stuck[1] <= bad.stuck[0] - 2}; });
T('UI-B122-01', 'Mana check: a healthy deck gets no basic-land change; a deck with the wrong basics gets one that closes 2+ missing colour sources, and says by how much', b122.okOff === 0 && b122.badOff > 0 && b122.closes, JSON.stringify(b122));
} catch (e) { QUIET = false; T('UI-B122-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B123-01')) { try { if (SHARD) await RESET();
// 73. Build 123: Apex progress is deck power. The Budget, Mid and Apex reference builds are scored as whole decks; the deck's own
// score is placed on that scale (Apex = 100) and its level follows, instead of card quality alone.
const b123 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; $('#modal').hidden = true;
  const ar = apexRef(d); ar.tot = refScores(d, ar); APX.set(apexKey(d), ar); EVC.delete(d.id); render(); await recsReady(d); render();
  const m = document.querySelector('.tmeter'), e = evalFor(d), lab = m ? m.getAttribute('aria-label') : '';
  const pw = e && e.exact != null ? 100 * e.exact / ar.tot.apex : null, want = pw == null ? '' : pw >= 99.5 ? 'Apex' : pw >= 100 * ar.tot.mid / ar.tot.apex ? 'Mid' : pw >= 100 * ar.tot.budget / ar.tot.apex ? 'Budget' : 'Starter';
  return {lab, tot:ar.tot, score:e && e.exact, want, power:/Deck power/.test(lab), right:want && lab.includes(want + ' level')}; });
T('UI-B123-01', 'Apex progress is deck power: the reference builds are scored as whole decks and the deck’s level follows its own score on that scale', b123.power && b123.right && b123.tot && b123.tot.apex > 0, JSON.stringify(b123));
} catch (e) { QUIET = false; T('UI-B123-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B123-02')) { try { if (SHARD) await RESET();
const b123b = await page.evaluate(() => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)), u = JSON.parse(JSON.stringify(d)), e0 = u.cards.find(x => { const c = find(x.n); return c && c.p != null && c.p < 3 && !tags(c).land; }), c = find(e0.n);
  const v0 = analyze(u).price, s0 = evaluateDeck(u, {games:100}).exact, b0 = priceBand(c.p); setPrint(e0, {id:'zz', set:'Fancy Foil', sc:'zzz', rar:'mythic', p:250});
  return {card:c.n, valueUp:analyze(u).price - v0 > 200, scoreSame:evaluateDeck(u, {games:100}).exact === s0, bandSame:priceBand(c.p) === b0 && b0 === 'budget'}; });
T('UI-B123-02', 'A chosen printing changes the card’s price and the deck’s value, never its score or Budget/Mid/Apex tier', b123b.valueUp && b123b.scoreSame && b123b.bandSame, JSON.stringify(b123b));
} catch (e) { QUIET = false; T('UI-B123-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B124-01')) { try { if (SHARD) await RESET();
// 74. Build 124: Buy list page (a group per deck plus Other, export of chosen groups adding up quantities), Add all to buy list
// (commander and nonbasic lands in, basics out, twice adds nothing), a prompt when a card on the buy list goes into the deck,
// Buy list and Library in the top navigation, and no "Spent" figure.
const b124 = await page.evaluate(async () => { const out = {}, d = S.profile.decks.find(x => /Wakanda/i.test(x.name)), keepW = JSON.stringify(d.want || []), keepM = JSON.stringify(S.profile.want || []);
  d.want = []; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render(); handleAct('buy-addall'); const w1 = d.want.length; handleAct('buy-addall'); out.twice = d.want.length === w1;
  out.cmd = d.want.some(x => x.n === d.commander); out.noBasic = !d.want.some(x => isBasic(x.n)); out.nonbasicLand = d.want.some(x => { const c = find(x.n); return c && tags(c).land && !isBasic(c.n); });
  out.qty = d.cards.filter(e => !isBasic(e.n)).every(e => (d.want.find(x => keyOf(x.n) === keyOf(e.n)) || {}).q === e.q);
  const one = d.want.find(x => x.n !== d.commander); S.profile.want = [{n:one.n, q:2}]; S.buySel = null; S.view = 'buy'; render();
  out.groups = document.querySelectorAll('#main .chk[data-act="buy-sel"]').length; const line = buyAllText().split('\n').find(l => l.endsWith(' ' + one.n)); out.sum = line === (one.q + 2) + ' ' + one.n; out.plain = buyAllText().split('\n').every(l => /^\d+ \S/.test(l));
  handleAct('buy-sel', d.id); out.oneGroup = buyAllText().split('\n').length === 1 && buyAllText() === '2 ' + one.n; S.buySel = null;
  out.nav = !!document.querySelector('#nav-l [data-v="buy"]') && !!document.querySelector('#nav-l [data-v="library"]'); S.view = 'library'; render(); out.library = !!document.querySelector('#libscroll');
  const orig = askConfirm; let got = null; askConfirm = (a, v, n) => { got = [a, v, n]; }; const was = S.noAsk; S.noAsk = false; const c0 = d.cards.find(e => !isBasic(e.n) && e.n !== one.n);
  d.want.push({n:'Sol Ring', q:1}); const prev = JSON.parse(cardsSig(d)); cutCard(d, c0.n, 1); addCard(d, 'Sol Ring', 1); wantInstalled(d, prev); await new Promise(r => setTimeout(r, 20)); out.asked = !!got && got[0] === 'want-installed' && /Sol Ring/.test(got[2]);
  askConfirm = orig; S.noAsk = was; cutCard(d, 'Sol Ring', 1); addCard(d, c0.n, 1); S.view = 'decks'; S.tab = 'up'; render(); out.noSpent = !/Spent/.test(document.querySelector('#main').textContent);
  d.want = JSON.parse(keepW); S.profile.want = JSON.parse(keepM); S.buySel = null; return out; });
T('UI-B124-01', 'Buy list: page with a group per deck plus Other; export adds up chosen groups as plain lines; Add all (commander and nonbasic lands, no basics, twice adds nothing); asks before taking an installed card off; Buy list and Library in the top bar; no Spent figure', Object.values(b124).every(v => v === true || (typeof v === 'number' && v >= 2)), JSON.stringify(b124));
} catch (e) { QUIET = false; T('UI-B124-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B125-01')) { try { if (SHARD) await RESET();
// 75. Build 125: a New deck tile ends the Decks grid; two-faced cards get a Flip button that swaps both the picture (same printing)
// and the face name and type; single-faced cards have none.
const b125 = await page.evaluate(() => { const out = {}; S.view = 'decks'; S.open = false; render(); const t = [...document.querySelectorAll('#main .tiles .tile')]; out.plusLast = !!t.length && t[t.length - 1].classList.contains('newdeck') && t[t.length - 1].dataset.v === 'deck';
  const c = find('Delver of Secrets'); if (!c){ out.noCard = true; return out; } const keep = [c.df, c.fc]; c.df = true; c.fc = [{n:'Delver of Secrets', t:'Creature — Human Wizard', m:'{U}', pt:'1/1'}, {n:'Insectile Aberration', t:'Creature — Human Insect', m:'', pt:'3/2'}];
  openCard(c.n); const im = () => $('#modal .card.real img').getAttribute('src'), id0 = im(); out.front = /\/front\//.test(id0); $('#modal .flip').click(); out.back = /\/back\//.test(im()) && im().split('/').pop() === id0.split('/').pop(); out.backNote = /back face: Insectile Aberration/.test($('#face-note').textContent);
  $('#modal .flip').click(); out.frontAgain = /\/front\//.test(im()) && /front face: Delver of Secrets/.test($('#face-note').textContent); $('#modal').hidden = true; c.df = keep[0]; c.fc = keep[1];
  openCard('Sol Ring'); out.noFlipSingle = !$('#modal .flip'); $('#modal').hidden = true; return out; });
T('UI-B125-01', 'New deck tile ends the Decks grid; Flip on a two-faced card swaps picture (same printing) and face name/type, and back again; single-faced cards have no Flip', Object.values(b125).every(v => v === true), JSON.stringify(b125));
} catch (e) { QUIET = false; T('UI-B125-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B126-01')) { try { if (SHARD) await RESET();
// 76. Build 126: a Build stats tab between Decklist and Upgrades holds the deck analysis; Upgrades keeps the deck score and Apex
// progress at the top, then the upgrades. Both show the score and the progress bar.
const b126 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'stats'; render(); await recsReady(d); render();
  const tabs = [...document.querySelectorAll('.tabs [data-act="tab"]')].map(b => b.dataset.v), st = document.querySelector('#statscroll'), out = {order:tabs.indexOf('list') + 1 === tabs.indexOf('stats') && tabs.indexOf('stats') + 1 === tabs.indexOf('up')};
  out.statsHas = !!(st && st.querySelector('.statbar') && st.querySelector('.hgrid')); out.statsNoMeter = !!(st && !st.querySelector('.tmeter'));   /* 0.9.20: the meter moved to Upgrades (owner 26 Oct) */ S.tab = 'up'; render(); const up = document.querySelector('#upscroll');
  out.upHas = !!(up && up.querySelector('.statbar') && up.querySelector('.tmeter')); out.upNoHealth = !(up && up.querySelector('.hgrid')); out.paths = !!(up && up.querySelector('.paths')); return out; });
T('UI-B126-01', 'Build stats tab sits between Decklist and Upgrades with the analysis (score, health; no Apex progress since 0.9.20); Upgrades shows the score and Apex progress, then the upgrades', Object.values(b126).every(v => v === true), JSON.stringify(b126));
} catch (e) { QUIET = false; T('UI-B126-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B127-01')) { try { if (SHARD) await RESET();
// 77. Build 127: upgrade sheets. One upgrade at a time as four cards (your card, Budget, Mid, Apex) with picture, score change and
// price; tapping one narrows the details below to it; the arrows move between upgrades; List shows every upgrade as before.
const b127 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; S.upView = 'sheet'; S.sheetI = 0; S.sheetSel = null; render(); await recsReady(d); render();
  const out = {}, cards = () => [...document.querySelectorAll('.sheet4 .s4')]; out.four = cards().length === 4 && cards()[0].textContent.includes('Your card');
  out.priced = cards().filter(x => !x.classList.contains('empty')).every(x => /\$|—/.test(x.querySelector('.p').textContent) && x.querySelector('.r').textContent.length > 0);
  const vis = () => [...document.querySelectorAll('.sheet .path > .opt')].filter(x => x.offsetParent).map(x => x.dataset.t);
  const sel = document.querySelector('.sheet').dataset.sel; out.oneShown = vis().length === 1 && vis()[0] === sel;
  document.querySelector('.s4[data-v="cut"]').click(); out.cutShown = vis().length === 0 && !!document.querySelector('.sheet .path > .sw.out').offsetParent;
  const head = () => document.querySelector('.sheethead .lab').textContent; out.h1 = /^Upgrade 1 of \d+/.test(head()); document.querySelector('[data-act="sheet-go"][data-v="1"]').click(); out.h2 = /^Upgrade 2 of/.test(head());
  handleAct('upview', 'list'); out.list = document.querySelectorAll('.paths .path').length > 1 && !document.querySelector('.sheet4'); S.upView = 'list'; render(); return out; });
T('UI-B127-01', 'Upgrade sheets: four cards (your card, Budget, Mid, Apex) with score change and price; tapping one shows only its details; arrows move between upgrades; List shows them all', Object.values(b127).every(v => v === true), JSON.stringify(b127));
} catch (e) { QUIET = false; T('UI-B127-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B129-01')) { try { if (SHARD) await RESET();
// 78. Build 129: Apex is the strongest pick on each row: no Mid or Budget pick raises the deck score more than the row's Apex pick.
const b129 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); const R = await recsReady(d);
  const rows = R.paths.filter(L => L.opts.apex && L.opts.apex.dScore != null), bad = rows.filter(L => ['mid', 'budget'].some(t => L.opts[t] && L.opts[t].dScore != null && L.opts[t].dScore > L.opts.apex.dScore + SCORE_MIN)).map(L => L.cut);
  return {rows:rows.length, bad}; });
T('UI-B129-01', 'Apex is the strongest pick on each row: no Mid or Budget pick raises the deck score more than the Apex pick', b129.rows > 0 && !b129.bad.length, JSON.stringify(b129));
} catch (e) { QUIET = false; T('UI-B129-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B130-01')) { try { if (SHARD) await RESET();
// 79. Build 130: players decide what competes, the deck score (stage 2, smoother ways to win) picks the winner; a popular card the
// Apex pick replaces stays first among the alternatives marked Most played; the buy list remembers the printing you chose.
const b130 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); const R = await recsReady(d), out = {};
  const pops = R.paths.filter(L => L.pop && L.pop.apex); out.pops = pops.length; out.mostFirst = pops.every(L => L.alts && L.alts.apex && L.alts.apex[0] && L.alts.apex[0].most && L.alts.apex[0].n === L.pop.apex.add);
  out.apexStrongest = R.paths.every(L => !L.opts.apex || ['mid', 'budget'].every(t => !L.opts[t] || L.opts[t].dScore == null || L.opts.apex.dScore == null || L.opts[t].dScore <= L.opts.apex.dScore + SCORE_MIN));
  S.modalCard = 'Sol Ring'; S.pick = {id:'pp1', set:'Fancy Foil Edition', p:9.99}; const keep = JSON.stringify(d.want || []); d.want = []; addWant(d, 'Sol Ring', pickPrint(find('Sol Ring')));
  const w = d.want[0]; out.kept = !!w && w.ps === 'Fancy Foil Edition' && w.pp === 9.99; S.view = 'buy'; S.buySel = null; render(); const t = document.querySelector('#main').textContent; out.shown = /Fancy Foil Edition/.test(t) && /\$9\.99/.test(t);
  out.plainExport = buyAllText().split('\n').includes('1 Sol Ring'); d.want = JSON.parse(keep); S.pick = null; S.view = 'decks'; render(); return out; });
T('UI-B130-01', 'Apex is the strongest credible pick and a popular card it replaces stays first as Most played; the buy list keeps the chosen printing (set and price) and still exports the plain name', b130.mostFirst && b130.apexStrongest && b130.kept && b130.shown && b130.plainExport, JSON.stringify(b130));
} catch (e) { QUIET = false; T('UI-B130-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B131-01')) { try { if (SHARD) await RESET();
// 80. Build 131: the upgrade filters are one row of drop-downs; the EDHREC chip sits at the right end of the score bar (0.9.3);
// the bar marks Budget, Mid and Apex in their own colours with their power scores in a legend row, with no empty row under it.
const b131 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; S.upView = 'list'; render(); await recsReady(d); render();
  const sels = [...document.querySelectorAll('.fbar select')], tops = new Set(sels.map(x => Math.round(x.getBoundingClientRect().top))), out = {selects:sels.length, oneRow:tops.size === 1, oldButtons:!document.querySelector('#upscroll .typebar [data-act="upsort"]')};
  const m = document.querySelector('#upscroll .tmeter'), sb = document.querySelector('#upscroll .statbar'), ch = sb && sb.querySelector('.sb-edh .chip'), sc = sb && sb.querySelector('span b'); out.chipAbove = !!(ch && m && sb.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) && Math.abs(ch.getBoundingClientRect().top + ch.getBoundingClientRect().height / 2 - (sc.getBoundingClientRect().top + sc.getBoundingClientRect().height / 2)) < 12 && ch.getBoundingClientRect().right > sb.getBoundingClientRect().right - 40;   /* 0.9.3 (owner, 19 Oct): the chip sits at the right end of the score bar, on the score's line */
  const leg = m ? m.querySelector('.tm-leg').textContent : ''; out.legend = /Budget\s*\d/.test(leg) && /Mid\s*\d/.test(leg) && /Apex\s*\d/.test(leg) && /You\s*\d/.test(leg); out.ticks = m ? m.querySelectorAll('u.tk').length : 0;
  const nx = m && m.nextElementSibling; out.gap = nx ? Math.round(nx.getBoundingClientRect().top - m.getBoundingClientRect().bottom) : 0; return out; });
T('UI-B131-01', 'Upgrade filters are one row of drop-downs; the EDHREC chip is at the right end of the score bar, above the progress bar; Budget, Mid and Apex are marked in their own colours with their scores in a legend; no empty row under the bar', b131.selects >= 2 && b131.oneRow && b131.oldButtons && b131.chipAbove && b131.legend && b131.ticks === 3 && b131.gap <= 14, JSON.stringify(b131));
} catch (e) { QUIET = false; T('UI-B131-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B132-01')) { try { if (SHARD) await RESET();
// 81. Version 0.9.3 (owner, 19 Oct; replaces Build 132's folder tabs): the tiers are one row of three buttons, "Apply All Budget
// Swaps" over "N cards $X"; the Upgrades tab no longer shows the Apex progress label, the level sentence, the "Upgrade paths" label
// or How the tiers work (Build stats keeps the level sentence).
const b132 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); await recsReady(d); render();
  const up = document.querySelector('#upscroll'), bs = [...up.querySelectorAll('.tierbtns [data-act="swap-all"]')], out = {tiers:bs.map(b => b.dataset.v).join(',')};
  out.oneRow = new Set(bs.map(b => Math.round(b.getBoundingClientRect().top))).size === 1; out.text = bs.every(b => /^Apply All (Budget|Mid|Apex) Swaps$/i.test(b.querySelector('b').textContent) && /^(\d+ cards? · \$\d+ to buy|No worthwhile upgrades)$/.test(b.querySelector('span').textContent));
  const t = up.textContent; out.gone = !/Apex progress|Upgrade paths|How the tiers work|The strongest card for each slot/i.test(t) && !up.querySelector('.tiertabs'); out.upSentence = /Your deck is at/.test(t);
  S.tab = 'stats'; render(); out.statsKeeps = !/Your deck is at/.test(document.querySelector('#statscroll').textContent);   /* 0.9.20 (owner 26 Oct): the sentence and Path to Apex live on Upgrades; Build stats is stats only */ S.tab = 'up'; render(); return out; });
T('UI-B132-01', 'Tiers are one row of three buttons ("Apply All Budget Swaps" over "N cards · $X to buy", owner 24 Oct); the Upgrades tab drops the Apex progress label, the Upgrade paths label and How the tiers work and shows the level sentence; Build stats does not (0.9.20)', b132.tiers === 'budget,mid,apex' && b132.oneRow && b132.text && b132.gone && b132.upSentence && b132.statsKeeps, JSON.stringify(b132));
} catch (e) { QUIET = false; T('UI-B132-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B133-01')) { try { if (SHARD) await RESET();
// 82. Build 133: the customised Build panel folds into one-line headers that always show their settings (format, mechanics,
// filters, colours, generate) and fits the iPad screen; the upgrade list keeps its order once shown until you leave the tab.
const b133 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)), was = d.custom; d.custom = true; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; S.upView = 'list'; S.bsec = {}; render(); const R = await recsReady(d); render();
  const out = {sums:[...document.querySelectorAll('#bscroll .bsec .bsum')].map(x => x.textContent)}; out.mech = out.sums.some(t => /^1 /.test(t)); const sec = document.querySelector('#bs-mech'); sec.open = true; out.opens = !!sec.querySelector('[data-act="mech-list"], .aim');
  const order = () => [...document.querySelectorAll('.paths .path')].map(p => p.querySelector('.sw.out').dataset.n), o1 = order(); R.paths.forEach((L, k) => Object.values(L.opts).forEach(p => { if (p.dScore != null) p.dScore = k % 2 ? 9 : -1; })); render(); out.kept = JSON.stringify(order()) === JSON.stringify(o1);
  handleAct('tab', 'list'); handleAct('tab', 'up'); out.resorted = !S.upOrd || !Object.keys(S.upOrd.m || {}).length || JSON.stringify(order()) !== JSON.stringify(o1); d.custom = was; recsFor.k = null; render(); return out; });
await page.setViewportSize({width:1366, height:1024}); const b133b = await page.evaluate(() => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)), was = d.custom; d.custom = true; S.bsec = {}; S.tab = 'up'; render(); fitWork(); const b = document.querySelector('#bscroll'), r = {fits:!!b && b.scrollHeight <= b.clientHeight + 2, ch:b && b.clientHeight, sh:b && b.scrollHeight}; d.custom = was; render(); return r; }); await page.setViewportSize({width:1300, height:900});
T('UI-B133-01', 'Customised Build panel: sections fold to one-line headers showing their settings, open to their controls, and the panel fits an iPad screen; the upgrade list keeps its order when scores change, until you leave the tab', b133.mech && b133.opens && b133.kept && b133.resorted && b133b.fits, JSON.stringify(b133) + ' ' + JSON.stringify(b133b));
} catch (e) { QUIET = false; T('UI-B133-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B134-01')) { try { if (SHARD) await RESET();
// 83. Build 134: the Unpopular pick chip only shows when the gap is big (owner, option B): the alternative clearly out-scores the
// suggested card (by 0.2 and half again) and the suggested card is run by 3 times as many players (and 10% more of all decks); its
// pop-up gives both play rates. A small edge over a popular pick shows no chip.
const b134 = await page.evaluate(async () => { const out = {found:false}; S.syncRecs = true; S.upView = 'list';
  // the decks open so far may hold no such case (it depends on earlier tests); a fresh Doom Prevails always does (0.9.3)
  const decks = S.profile.decks.filter(x => x.format === 'commander' && find(x.commander)); let fresh = null;
  const more = async () => { await loadPreconLive('doom-prevails', 'Doom Prevails'); fresh = S.draft; S.profile.decks.unshift(fresh); S.draft = null; await loadEdh(fresh.commander); for (let i = 0; i < 80 && !apexFor(fresh); i++) await new Promise(r => setTimeout(r, 100)); return [fresh]; };
  for (const list of [decks, null]) { if (out.found) break; for (const d of (list || await more())){ S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; recsFor.k = null; render(); const R = await recsReady(d);
    R.paths.forEach((L, i) => ['apex', 'mid', 'budget'].forEach(t => ((L.alts || {})[t] || []).forEach(a => { if (a.unpop && !out.found){ out.found = true; out.i = i; out.t = t; out.n = a.n; out.vs = a.vs; out.vsInc = a.vsInc; out.inc = a.inc; } })));
    if (out.found){ handleAct('unpop', out.i + '|' + out.t, out.n); const m = document.querySelector('#modal'); out.text = m ? m.textContent : ''; out.both = new RegExp(Math.round(out.vsInc * 100) + '% of decks play').test(out.text) && /only \d+% of/.test(out.text); m.hidden = true; break; } } }
  if (fresh) S.profile.decks = S.profile.decks.filter(x => x !== fresh); render(); return out; });
T('UI-B134-01', 'Unpopular pick shows only for a big gap (much higher score, far fewer players), never for a small edge; its pop-up gives the play rates of both cards', b134.found && b134.both && !b81c.unpopBad, JSON.stringify(b134).slice(0, 400) + ' quietSmallEdges=' + (b81c.unpopQuiet || 0));
} catch (e) { QUIET = false; T('UI-B134-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B135-01')) { try { if (SHARD) await RESET();
// 84. Build 135: swaps players mostly disagree with are left out (Tramplesaurus fix A): no row left is one the rule removes, held
// swaps are never removed, the tier counts match the rows that remain, and the list says how many were left out.
const b135 = await page.evaluate(async () => { const out = {decks:0, trimmed:0, bad:0, countOk:true, note:null, heldKept:null}; S.syncRecs = true; S.upView = 'list';
  for (const d of S.profile.decks.filter(x => x.format === 'commander' && find(x.commander))){ S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; d.tier = 'apex'; recsFor.k = null; render(); const R = await recsReady(d); out.decks++;
    const tr = R.scored && R.scored.trimmed || 0; out.trimmed += tr; if (R.trimOf) out.bad += R.paths.filter(L => R.trimOf(L)).length;
        render(); const R2 = recsFor(d); const nt = document.querySelector('#upscroll .trimnote'); { const t2 = R2.scored && R2.scored.trimmed || 0; if (t2 !== tr){ out.trimmed += t2 - tr; } } const trN = R2.scored && R2.scored.trimmed || 0, okN = trN ? !!nt && new RegExp('^' + trN + ' weaker swap').test(nt.textContent.trim()) : !nt; if (!okN){ out.note = false; out.noteFail = {name:d.name, tr, has:!!nt, txt:nt ? nt.textContent.slice(0, 60) : '', view:S.upView, tab:S.tab, any:!!document.querySelector('.trimnote')}; } else if (out.note == null && trN) out.note = true; }
  // a held swap the rule would remove stays: hold the first row's pick on a deck, mark the rule to remove everything, re-check
  const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; recsFor.k = null; render(); const R = await recsReady(d);
  if (R.trimOf && R.paths[0] && R.paths[0].opts.apex){ const L = R.paths[0]; L.opts.apex.held = true; const keep = R.trimOf(L); out.heldKept = keep === false; L.opts.apex.held = false; } else out.heldKept = true;
  recsFor.k = null; render(); return out; });
T('UI-B135-01', 'Swaps that players mostly disagree with are left out of the upgrade list (never a held swap); the list says how many were left out', b135.decks > 0 && !b135.bad && b135.note !== false && b135.heldKept, JSON.stringify(b135));
} catch (e) { QUIET = false; T('UI-B135-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B136-01')) { try { if (SHARD) await RESET();
// 85. Build 136: visible practice games on the Build stats tab: the 100-game summary (lands, colours, flood, mulligan, commander
// turn), one game's opening hand and its first 8 turns; Deal another game shows the next game; the same game number always
// shows the same game; the step-by-step games agree with the deck score's own games; it fits a phone screen.
const b136 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'stats'; S.pracOpen = true; S.pgSeed = {}; render();
  const pr = () => document.querySelector('#practice'), out = {}; out.open = !!pr() && pr().open; out.summary = /In 100 practice games: short of lands on turn 5 in \d+%/.test(pr().textContent);
  out.rows = pr().querySelectorAll('table.pg tbody tr').length; out.hand = pr().querySelectorAll('.pg-hand .row')[0].querySelectorAll('.pgc').length; const h1 = pr().querySelector('.pg-hand').textContent;
  pr().querySelector('[data-act="prac-new"][data-v="1"]').click(); out.game2 = /Game 2/.test(pr().textContent); const h2 = pr().querySelector('.pg-hand').textContent; out.changed = h1 !== h2;
  render(); out.stable = pr().querySelector('.pg-hand').textContent === h2; pr().querySelector('[data-act="prac-new"][data-v="-1"]').click(); out.back = pr().querySelector('.pg-hand').textContent === h1;
  const a = simulate(d, 60, 9), b = practiceGames(d, 60, 9); delete b.logs; out.same = JSON.stringify(a) === JSON.stringify(b); return out; });
await page.setViewportSize({width:390, height:844}); const b136p = await page.evaluate(() => { render(); const t = document.querySelector('#practice table.pg'), r = t && t.getBoundingClientRect(); return {fits:!!r && r.right <= window.innerWidth + 1, pageX:document.documentElement.scrollWidth <= window.innerWidth + 1}; });
await page.setViewportSize({width:1366, height:1024}); await page.evaluate(() => { S.pracOpen = false; S.tab = 'up'; render(); });
T('UI-B136-01', 'Practice games: summary of 100 games, an opening hand of 7 and 8 turns; Deal another game and Previous move between games and the same game always looks the same; agrees with the deck score games; fits a phone', b136.open && b136.summary && b136.rows === 8 && b136.hand === 7 && b136.game2 && b136.changed && b136.stable && b136.back && b136.same && b136p.fits && b136p.pageX, JSON.stringify(b136) + ' ' + JSON.stringify(b136p));
} catch (e) { QUIET = false; T('UI-B136-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B137-01')) { try { if (SHARD) await RESET();
// 86. Build 137 (owner's iPad report: Fix Mana swapped Thriving Isle for Wooded Foothills in a five-colour deck): a fetch land makes
// only the colours it can find, a "choose a colour" land makes its colour plus one, and a mana fix never takes out a colour the
// old land made.
const b137 = await page.evaluate(async () => { const out = {}, id5 = ['W','U','B','R','G'], lib = ['Forest','Forest','Mountain','Island','Swamp','Plains','Wooded Foothills'].map(find);
  const reach = fetchReach(lib, id5), cs = n => simLandCols(find(n), simCard(find(n), id5), id5, reach, new Set(['U']), new Set(), s => s.cols);
  out.foothills = cs('Wooded Foothills').slice().sort().join(''); out.thriving = cs('Thriving Isle').slice().sort().join(''); out.bigApple = [...landColors(find('Big Apple, 3 a.m.'))].length;
  out.thrivingLC = [...landColors(find('Thriving Isle'))].length; out.badFix = [];
  for (const d of S.profile.decks.filter(x => x.format === 'commander' && find(x.commander))){ const id = ctxOf(d).ident; if (id.length < 2) continue; let F = []; try { F = fixSwaps(d, 'mana', {}); } catch (e) { out.err = e.message; }
    F.forEach(x => { if (!landCovers(find(x.cut), find(x.add), id)) out.badFix.push(d.name + ': ' + x.cut + ' -> ' + x.add); }); }
  out.covers = landCovers(find('Thriving Isle'), find('Wooded Foothills'), id5) === false && landCovers(find('Thriving Isle'), find('Glacial Fortress'), id5) === true; return out; });
T('UI-B137-01', 'Lands: Wooded Foothills makes only red/green (what it can find), Thriving Isle makes blue plus the colour needed, Big Apple is not colourless; a mana fix never takes out a colour the old land made', b137.foothills === 'GR' && b137.thriving === 'UW' && b137.bigApple > 0 && b137.thrivingLC === 5 && b137.covers && !b137.badFix.length && !b137.err, JSON.stringify(b137));
} catch (e) { QUIET = false; T('UI-B137-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B138-01')) { try { if (SHARD) await RESET();
// 87. Build 138 (owner: the Mana fix offered a swap, but the card's window said its best swap was a different card): every land the
// Mana fix offers goes where the card window puts it, with the same score; when the deck runs short of lands a weak spell may go.
const b138 = await page.evaluate(async () => { const out = {decks:0, rows:0, agree:0, mismatch:[], ms:0};
  for (const d of S.profile.decks.filter(x => x.format === 'commander' && find(x.commander) && ctxOf(x).ident.length >= 2).slice(0, 3)){ S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; recsFor.k = null; render(); await recsReady(d); for (let i = 0; i < 80 && !evalFor(d); i++) await new Promise(r => setTimeout(r, 100)); out.decks++;
    const t0 = performance.now(), L = fixList(d, 'Mana'); out.ms = Math.max(out.ms, Math.round(performance.now() - t0));
    L.forEach(p => { out.rows++; const r = landRank(d, p.add, apexFor(d)), top = r.find(y => y.n === p.cut); const firstFree = r[0]; if (top && top.dScore === p.dScore && (p.best ? firstFree.n === p.cut : true)) out.agree++; else out.mismatch.push(d.name + ': ' + p.cut + ' -> ' + p.add + ' ' + p.dScore + ' vs window ' + (firstFree && firstFree.n) + ' ' + (firstFree && firstFree.dScore)); });
    const p0 = L[0]; if (p0 && out.window == null){ S.cardWant = true; const h = wantHtml(d, find(p0.add)); out.window = p0.best ? h.indexOf(esc(p0.cut)) >= 0 && h.indexOf(esc(p0.cut)) < h.indexOf('Least') + 1e6 : true; } }
  out.starvedSpell = (() => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)), A = analyze(d), c = bestCuts(d, 'Sulfur Falls', 999, {starved:true}); return c.some(x => x.spell) && !bestCuts(d, 'Sulfur Falls', 999, {}).some(x => x.spell); })();
  return out; });
const b138b = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.tab = 'stats'; render(); openFixSoon(['Mana']); const first = /checking land swaps/i.test($('#modal').textContent);
  for (let i = 0; i < 100 && /checking land swaps/i.test($('#modal').textContent); i++) await new Promise(r => setTimeout(r, 100)); const done = /practice games/.test($('#modal').textContent) && !/checking land swaps/i.test($('#modal').textContent); $('#modal').hidden = true; return {first, done}; });
b138.soon = b138b.first && b138b.done;
T('UI-B138-01', 'Mana fix and card window agree: each land the fix offers goes where the card window puts it, with the same score; when the deck runs short of lands a weak spell may make room', b138.decks > 0 && !b138.mismatch.length && b138.starvedSpell && b138.window !== false && b138.soon, JSON.stringify(b138).slice(0, 900));
} catch (e) { QUIET = false; T('UI-B138-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B139-01')) { try { if (SHARD) await RESET();
// 88. Build 139: the engine knows the rules' keywords (graveyard, token, counter… mechanics) and reads the commander's engine: what
// it makes, what sets it off; a card that doubles or pays it off says so.
const b139 = await page.evaluate(() => { const f = n => find(n), out = {};
  const ch = commanderEngine([f('Chatterfang, Squirrel General')]), ss = commanderEngine([f('Symbiote Spider-Man')]);
  out.chat = ch.creatureTokens && ch.types.has('Squirrel'); out.ds = engineFit(f('Doubling Season'), ch).v === 1; out.wrangler = engineFit(f('Squirrel Wrangler'), ch).v === 0.8; out.elves = engineFit(f('Llanowar Elves'), ch).v === 0;
  out.soul = /graveyard/.test(engineFit(f('The Soul Stone'), ss).why || '') && engineFit(f('Aetherize'), ss).v === 0;
  out.dredge = tags(f('Life from the Loam')).th.graveyard === 1; out.landfall = tags(f('Lotus Cobra')).th.lands === 1;
  const d = {format:'commander', commander:'Symbiote Spider-Man', partner:'', aims:[], cards:[], tier:'apex'}; const ctx = ctxOf(d); out.why = (baseScore(f('The Soul Stone'), d, ctx).why || [])[0] || ''; return out; });
T('UI-B139-01', 'The engine reads keywords (Dredge → graveyard, Landfall → lands) and the commander’s engine: Chatterfang makes Squirrel tokens, Doubling Season doubles them, Squirrel Wrangler pays them off; The Soul Stone uses what Symbiote Spider-Man puts in the graveyard (Aetherize doesn’t), and the card says so', b139.chat && b139.ds && b139.wrangler && b139.elves && b139.soul && b139.dredge && b139.landfall && /graveyard/.test(b139.why), JSON.stringify(b139));
} catch (e) { QUIET = false; T('UI-B139-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B140-01')) { try { if (SHARD) await RESET();
// 89. Build 140 (owner: The Soul Stone, $80, was offered in a Budget deck with only an "Apex only" note): the card window says
// plainly when a card is over the deck's price limit, once, at the top where the swap is offered; never in an Apex deck.
const b140 = await page.evaluate(() => { const out = {}, d = S.profile.decks.find(x => x.format === 'commander' && find(x.commander)), t0 = d.tier;
  const dear = LIB.find(c => c.p != null && c.p > 40 && c.cmd && c.ci.every(x => ctxOf(d).ident.includes(x)) && !d.cards.some(e => norm(e.n) === c._n) && !tags(c).land);
  const cheap = LIB.find(c => c.p != null && c.p < 1 && c.cmd && c.ci.every(x => ctxOf(d).ident.includes(x)) && !d.cards.some(e => norm(e.n) === c._n) && !tags(c).land);
  const chips = () => [...document.querySelectorAll('#modal .over-cap')].map(e => e.textContent);
  S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list';
  d.tier = 'budget'; render(); openCard(dear.n); out.budget = chips(); out.atTop = !!document.querySelector('#modal .grp .lab .over-cap');
  d.tier = 'mid'; render(); openCard(dear.n); out.mid = chips();
  d.tier = 'apex'; render(); openCard(dear.n); out.apex = chips();
  d.tier = 'budget'; render(); openCard(cheap.n); out.cheap = chips();
  d.tier = t0; $('#modal').hidden = true; render(); out.dear = dear.n + ' $' + dear.p; return out; });
T('UI-B140-01', 'Over the price limit: a $40+ card opened from a Budget deck says "Over your Budget limit ($3)" (Mid: "$12") once, at the top of the card window; nothing in an Apex deck or for a cheap card', b140.budget.length === 1 && b140.budget[0] === 'Over your Budget limit ($3)' && b140.atTop && b140.mid.length === 1 && b140.mid[0] === 'Over your Mid limit ($12)' && !b140.apex.length && !b140.cheap.length, JSON.stringify(b140));
} catch (e) { QUIET = false; T('UI-B140-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B140-02')) { try { if (SHARD) await RESET();
// 90. Build 140 (owner's iPhone screenshots): on an upright phone, also with large text (320 wide), the deck tabs stay inside the
// panel (a second row when needed), the page scrolls instead of a fixed-height box, and nothing spills past the panel's frame;
// the card count stays on one line. iPad portrait and landscape keep the fixed working area.
const b140p = {}; { for (const [k, vw, vh] of [['phone', 390, 844], ['big', 320, 693], ['ipadP', 820, 1180], ['ipadL', 1180, 820]]){ await page.setViewportSize({width:vw, height:vh}); await page.waitForTimeout(150);
    b140p[k] = {}; for (const tab of ['list', 'up']) b140p[k][tab] = await page.evaluate(t => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = t; $('#modal').hidden = true; render(); fitWork();
      const w = document.querySelector('.work'), tabs = document.querySelector('.tabs'), tr = tabs.getBoundingClientRect(), pr = tabs.closest('.panel').getBoundingClientRect();
      const kids = [...tabs.closest('.panel').querySelectorAll('button, input, .tab')].filter(e => e.offsetParent), out = kids.filter(e => { const r = e.getBoundingClientRect(); return r.bottom > pr.bottom + 2 || r.right > pr.right + 2; }).length;
      const lab = document.querySelector('.panel .row > .lab'); return {fixed:!!w.style.height, tabsFit:tabs.scrollWidth <= tabs.clientWidth + 1 && tr.right <= pr.right + 1, out, oneLine:t !== 'list' || !lab || lab.getBoundingClientRect().height < 30}; }, tab); }
  await page.setViewportSize({width:1300, height:900}); await page.evaluate(() => { render(); }); }
T('UI-B140-02', 'Upright phones (also 320 wide, as with large text): deck tabs fit inside the panel, the page scrolls instead of a fixed box, nothing spills past the frame, the card count is one line; iPad keeps its fixed working area', ['phone', 'big'].every(k => ['list', 'up'].every(t => !b140p[k][t].fixed && b140p[k][t].tabsFit && !b140p[k][t].out && b140p[k][t].oneLine)) && ['ipadP', 'ipadL'].every(k => b140p[k].list.fixed && b140p[k].up.fixed && b140p[k].list.tabsFit), JSON.stringify(b140p));
} catch (e) { QUIET = false; T('UI-B140-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B140-03')) { try { if (SHARD) await RESET();
// 91. Build 140 engine: reanimation engines (The Soul Stone, Living Death) are recursion and a way to win; a creature that wins only
// by its size counts half, a 10-mana card is not protection and a planeswalker's ultimate is not one of its jobs (Kozilek, Nissa);
// after the list is checked, every card that does a row's job is measured in the background and Highest score keeps the best.
const b140e = await page.evaluate(async () => { const f = n => find(n), out = {};
  out.reanim = isReanimEngine(f('The Soul Stone')) && isReanimEngine(f('Living Death')) && isFinisher(f('Living Death')) && !isReanimEngine(f('Eternal Witness'));
  out.blind = !finByText(f('Kozilek, the Great Distortion')) && isFinisher(f('Kozilek, the Great Distortion')) && !tags(f('Nissa, Vital Force')).roles.has('draw') && tags(f('Nissa, Vital Force')).roles.has('ramp');
  const sync0 = S.syncRecs, n0 = UP.poolN; S.syncRecs = false; UP.poolN = 40; const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; recsFor.k = null; render(); const R = await recsReady(d);
  out.note = false; let Rn = R;   // the list is worked out again once its picks are held; the search follows the current list
  for (let i = 0; i < 1200 && !(Rn.poolDone && Rn === recsFor(d)); i++){ await new Promise(r => setTimeout(r, 100)); Rn = recsFor(d); if (document.querySelector('#pool-note')) out.note = true; }
  out.done = !!Rn.poolDone; out.total = Rn.pool ? Rn.pool.total : 0; out.rows = Rn.pool ? Rn.pool.rows.length : 0;
  out.never = Rn.paths.every(L => !L.top || !L.top.pool || L.top.dScore >= Math.max(scoreFloor(), UP.rankMin));   // a find always raises the score by a real margin
  out.found = Rn.paths.filter(L => L.top && L.top.pool).map(L => L.cut + ' -> ' + L.top.n + ' ' + L.top.dScore);
  out.slots = document.querySelectorAll('.topslot[data-i]').length > 0; S.syncRecs = sync0; UP.poolN = n0; return out; });
T('UI-B140-03', 'Engine: The Soul Stone and Living Death read as reanimation (Living Death a way to win); Kozilek wins only by size and Nissa, Vital Force is not card draw; the background search measures every card for each row, says so while it runs, and keeps only finds that raise the score', b140e.reanim && b140e.blind && b140e.done && b140e.total > 0 && b140e.never && b140e.slots, JSON.stringify(b140e).slice(0, 900));
} catch (e) { QUIET = false; T('UI-B140-03', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B141-01')) { try { if (SHARD) await RESET();
// 92. Build 141 (owner: wait rather than shift; "it's okay to tell the user the app is thinking"): Fix: Mana and a land's card
// window open at once with a small spinner and fill in once, complete; each row's Highest score says it is thinking until the
// background search is done, and the rows never change while it runs.
const b141 = await page.evaluate(async () => { const out = {}, d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.syncRecs = true; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'stats'; render();
  openFixSoon(['Mana']); out.fixSpin = !!document.querySelector('#modal .think'); for (let i = 0; i < 150 && document.querySelector('#modal .think'); i++) await new Promise(r => setTimeout(r, 100)); out.fixDone = !document.querySelector('#modal .think'); $('#modal').hidden = true;
  S.tab = 'list'; render(); const land = LIB.find(c => tags(c).land && !isBasic(c.n) && c.cmd && c.ci.length && c.ci.every(x => ctxOf(d).ident.includes(x)) && !hasCard(d, c.n));
  openCard(land.n); out.landSpin = !!document.querySelector('#want-think .think'); for (let i = 0; i < 150 && document.querySelector('#want-think'); i++) await new Promise(r => setTimeout(r, 100));
  out.landDone = !document.querySelector('#want-think') && /Put this card in/.test($('#modal').textContent); $('#modal').hidden = true;
  const n0 = UP.poolN; UP.poolN = 30; S.syncRecs = false; S.tab = 'up'; recsFor.k = null; render(); await recsReady(d); await new Promise(r => setTimeout(r, 600)); let R = recsFor(d);
  const snap = () => [...document.querySelectorAll('.topslot[data-i]')].map(e => e.textContent).join('|');
  out.thinking = R.poolDone || !!document.querySelector('#pool-note.think') && !document.querySelector('.topslot'); const mid = snap(); await new Promise(r => setTimeout(r, 400)); out.steady = R.poolDone || snap() === mid;
  for (let i = 0; i < 600 && !(R.poolDone && R === recsFor(d)); i++){ await new Promise(r => setTimeout(r, 100)); R = recsFor(d); }
  render(); await new Promise(r => setTimeout(r, 100)); out.after = document.querySelectorAll('.topslot .think').length === 0 && R.poolDone && !document.querySelector('#pool-note') && document.querySelectorAll('.paths [data-act="swap"]').length > 0; UP.poolN = n0; S.syncRecs = true; return out; });
T('UI-B141-01', 'Thinking, not shifting: Fix: Mana and a land’s card window open with a spinner and fill in once; the upgrade list says it is thinking until the whole-card search is done (no rows meanwhile), then appears complete', b141.fixSpin && b141.fixDone && b141.landSpin && b141.landDone && b141.thinking && b141.steady && b141.after, JSON.stringify(b141));
} catch (e) { QUIET = false; T('UI-B141-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B141-02')) { try { if (SHARD) await RESET();
// 93. Build 141: Build by theme. Pick a theme (and a creature type, colours) and the builder lists the commanders that build around
// it; Build makes the deck with that theme as its first mechanic.
const b141t = await page.evaluate(async () => { const out = {}; S.gen = {}; openGenerate(); out.box = !!document.querySelector('#themebuild');
  handleAct('gen-tpick', 'graveyard'); handleAct('gen-tcol', 'B'); out.list = [...document.querySelectorAll('#themebuild [data-act="gen-tbuild"]')].map(b => b.dataset.n);
  out.allBlack = out.list.every(n => find(n).ci.includes('B')); out.allGrave = out.list.every(n => detectStrategy(find(n)).themes.includes('graveyard') || tags(find(n)).th.graveyard === 1);
  handleAct('gen-tpick', 'tribal'); const sel = document.querySelector('#gen-ttribe'); sel.value = 'Elf'; sel.dispatchEvent(new Event('change', {bubbles:true})); out.elves = [...document.querySelectorAll('#themebuild [data-act="gen-tbuild"]')].map(b => b.dataset.n);
  handleAct('gen-tpick', 'graveyard'); const n0 = S.profile.decks.length, b = document.querySelector('#themebuild [data-act="gen-tbuild"]'); out.built = b.dataset.n; b.click();
  for (let i = 0; i < 300 && !(S.draft && S.draft.commander === out.built); i++) await new Promise(r => setTimeout(r, 100)); const d = S.draft;
  out.deck = d && {cmd:d.commander, first:d.aims[0], size:analyze(d).size}; out.valid = d ? validateDeck(d).filter(v => v.key !== 'wrong_deck_size').length === 0 : false; return out; });
T('UI-B141-02', 'Build by theme: graveyard + black lists only black graveyard commanders; Elf lists Elf commanders; Build makes a full deck with the theme first and no rule problems', b141t.box && b141t.list.length >= 4 && b141t.allBlack && b141t.allGrave && b141t.elves.some(n => /Lathril|Marwyn|Ezuri/.test(n)) && b141t.deck && b141t.deck.first === 'graveyard' && b141t.deck.size >= 99 && b141t.valid, JSON.stringify(b141t).slice(0, 900));
} catch (e) { QUIET = false; T('UI-B141-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B141-03')) { try { if (SHARD) await RESET();
// 94. Build 141: a commander with no play data (obscure or new) gives generic power less weight (tournament staples, Game Changers
// and tutors at UP.thT / UP.thP, the most-played staples at UP.thS); a one-colour deck never takes City of Brass, Mana
// Confluence, Exotic Orchard or Command Tower over a basic; two-colour decks still may.
const b141e = await page.evaluate(() => { const out = {}, mk = () => { const d = {format:'commander', commander:'', tier:'apex', aims:[], cards:[], tribe:'', colors:[]}; setCommander(d, 'Tivit, Seller of Secrets'); return d; }, d = mk(), c = ctxOf(d), mox = find('Mox Diamond');
  const th = [UP.thT, UP.thP, UP.thS], thin = baseScore(mox, d, c).s; UP.thT = 1; UP.thP = 1; UP.thS = 1; const full = baseScore(mox, d, c).s; [UP.thT, UP.thP, UP.thS] = th; out.less = thin < full - 3;
  out.mono = ['City of Brass', 'Mana Confluence', 'Exotic Orchard', 'Command Tower'].every(n => monoJunkLand(find(n), ['G'])) && !monoJunkLand(find('Gemstone Caverns'), ['G']) && !monoJunkLand(find("Gaea's Cradle"), ['G']) && !monoJunkLand(find('Mana Confluence'), ['G', 'B']);
  return out; });
T('UI-B141-03', 'Obscure commanders: with no play data, generic power counts less; one-colour decks never take pain or any-colour lands over a basic (two colours still may)', b141e.less && b141e.mono, JSON.stringify(b141e));
} catch (e) { QUIET = false; T('UI-B141-03', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B141-04')) { try { if (SHARD) await RESET();
// 95. Build 141 (owner): a card in the deck has "I don't have this card"; it thinks, then lists cards that do the same job, at the
// deck's price level (owned cards at any price), measured in the deck, best first; Swap in asks first, swaps, and rules the
// missing card out of later suggestions.
const b141n = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)), keep = JSON.stringify(d.cards), dis = JSON.stringify(d.dismissed || []), aY = S.autoYes; S.autoYes = new Set();
  S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render(); const e = d.cards.find(x => { const c = find(x.n); return c && !tags(c).land && tags(c).roles.has('removal') && x.n !== d.commander; }), out = {card:e.n};
  openCard(e.n); const btn = document.querySelector('#modal [data-act="no-have"]'); out.btn = !!btn; btn.click(); out.think = !!document.querySelector('#modal .think');
  for (let i = 0; i < 200 && document.querySelector('#modal .think'); i++) await new Promise(r => setTimeout(r, 100));
  const B = [...document.querySelectorAll('#modal [data-act="nh-swap"]')], cap = TIERS[d.tier] && isFinite(TIERS[d.tier].cap) ? TIERS[d.tier].cap : Infinity; out.n = B.length;
  out.sameJob = B.every(b => jobsOf(b.dataset.n).includes('removal')); out.inCap = B.every(b => { const c = find(b.dataset.n); return ownSet().has(c._n) || (c.p != null && c.p < cap); });
  const sc = B.map(b => { const t = (b.closest('.opt').querySelector('.chip') || {}).textContent || ''; const m = /([+−-])\s?([\d.]+)/.exec(t); return m ? (m[1] === '+' ? 1 : -1) * +m[2] : 0; }); out.sorted = sc.every((v, i) => !i || v <= sc[i - 1] + 1e-9);
  const add = B[0].dataset.n; B[0].click(); await new Promise(r => setTimeout(r, 100)); out.asked = !!document.querySelector('#confirm:not([hidden]) [data-act="conf-yes"]'); document.querySelector('#confirm [data-act="conf-yes"]').click(); await new Promise(r => setTimeout(r, 200));
  out.swapped = hasCard(d, add) && !hasCard(d, e.n); out.ruledOut = (d.dismissed || []).includes(e.n); d.cards = JSON.parse(keep); d.dismissed = JSON.parse(dis); S.autoYes = aY; $('#modal').hidden = true; recsFor.k = null; render(); return out; });
T('UI-B141-04', 'I don’t have this card: thinks, then lists cards that do the same job at the deck’s price level, best first; Swap in asks first, swaps, and the missing card is not suggested again', b141n.btn && b141n.think && b141n.n >= 3 && b141n.sameJob && b141n.inCap && b141n.sorted && b141n.asked && b141n.swapped && b141n.ruledOut, JSON.stringify(b141n));
} catch (e) { QUIET = false; T('UI-B141-04', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B142-01')) { try { if (SHARD) await RESET();
// 96. Build 142, rules audit: cycling (its reminder text says "draw a card") is not card draw; "target player draws" can be you;
// lands put onto your battlefield over two sentences are ramp; "target attacking or blocking creature" is removal; "creatures
// you don't control get -1/-1 for each..." is a board wipe; giving an opponent a land is not your ramp.
const b142a = await page.evaluate(() => { const r = n => [...tags(find(n)).roles]; return {unearth:!r('Unearth').includes('draw'), street:!r('Street Wraith').includes('draw'), recon:r('Reconnaissance Mission').includes('draw'), peer:r('Peer into the Abyss').includes('draw'),
  traverse:r('Traverse the Outlands').includes('ramp'), shigeki:r('Shigeki, Jukai Visionary').includes('ramp'), path:!r('Path to Exile').includes('ramp'), razor:r('Razorgrass Ambush // Razorgrass Field').includes('removal'), toxrill:r('Toxrill, the Corrosive').includes('wipe'), vessel:!r('Thought Vessel').includes('draw'), rhystic:r('Rhystic Study').includes('draw')}; });
T('UI-B142-01', 'Rules audit: cycling and "no maximum hand size" are not card draw, Peer into the Abyss is; Traverse the Outlands and Shigeki are ramp, Path to Exile is not; attacking-or-blocking removal and Toxrill’s wipe are read', Object.values(b142a).every(Boolean), JSON.stringify(b142a));
} catch (e) { QUIET = false; T('UI-B142-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B142-02')) { try { if (SHARD) await RESET();
// 97. Build 142: a generated deck is polished until its own upgrade list has nothing worth making (Apex inside the build, Mid and
// Budget at their own price level), and the app says it is thinking while it builds.
const b142b = await page.evaluate(async () => { const out = {}, w = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.gen = {tier:'budget'}; const n0 = S.profile.decks.length;
  const st = $('#status'); let sawThink = false; const obs = new MutationObserver(() => { if (st && st.classList.contains('think') && /Thinking/.test(st.textContent)) sawThink = true; }); if (st) obs.observe(st, {attributes:true, childList:true, characterData:true, subtree:true});
  S.gen.tk = 'tokens'; openGenerate(); const btn = [...document.querySelectorAll('#themebuild [data-act="gen-tbuild"]')].find(b => b.dataset.n === w.commander) || document.querySelector('#themebuild [data-act="gen-tbuild"]'); out.cmd = btn.dataset.n; btn.click();
  for (let i = 0; i < 1200 && !(S.draft && S.draft.commander === out.cmd && !(st && st.classList.contains('think'))); i++) await new Promise(r => setTimeout(r, 100)); obs.disconnect(); out.think = sawThink;
  const d = S.draft; out.tier = d && d.tier; out.size = d && analyze(d).size; S.syncRecs = true; const R = upgradePaths(d); try { scoreCheck(d, R, {apex:apexRef(d)}); } catch (e) {} const rows = R.paths.map(L => tierPick(L, d.tier)).filter(p => p && p.dScore >= SCORE_MIN);
  out.room = rows.length; out.gain = +rows.reduce((a, p) => a + p.dScore, 0).toFixed(2); out.valid = validateDeck(d).length === 0; out.cap = d.cards.every(e => { const c = find(e.n); return isBasic(e.n) || (c.p != null && c.p < 3) || ownSet().has(c._n); }); return out; });
T('UI-B142-02', 'Polished generation: a Budget build says it is thinking, is a legal 100-card deck under $3 a card, and its own Budget upgrade list has little left (at most 3 swaps worth under +0.5 together)', b142b.think && b142b.tier === 'budget' && b142b.size === 100 && b142b.valid && b142b.cap && b142b.room <= 3 && b142b.gain < 0.5, JSON.stringify(b142b));
} catch (e) { QUIET = false; T('UI-B142-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B143-01')) { try { if (SHARD) await RESET();
// 98. Build 143: a generated deck is built on a background core (work.js): the page keeps running while it builds, and the deck
// is the same, card for card, as one built on the page itself.
const b143a = await page.evaluate(async () => { const out = {}; const name = 'Don & Leo, Problem Solvers', one = async noW => { S.noWorker = noW; genRun.last = null; let ticks = 0; const iv = setInterval(() => ticks++, 50);
    const g = await startPlan(name, [], null, null, {fill:'apex'}); clearInterval(iv); S.draft = null; return {list:g.cards.map(e => e.n + 'x' + e.q).sort().join('|'), ticks, worker:!!(genRun.last && genRun.last.worker), n:g.cards.reduce((a, e) => a + e.q, 0)}; };
  const w = await one(false), m = await one(true); S.noWorker = false; Object.assign(out, {worker:w.worker, same:w.list === m.list, size:w.n, live:w.ticks >= 5, ticks:w.ticks, pageTicks:m.ticks}); return out; });
T('UI-B143-01', 'Background building: a generated deck is built on another core (the page keeps running meanwhile) and is the same deck, card for card, as one built on the page', b143a.worker && b143a.same && b143a.size === 99 && b143a.live, JSON.stringify(b143a));
} catch (e) { QUIET = false; T('UI-B143-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B143-02')) { try { if (SHARD) await RESET();
// 99. Build 143, Players' choice: a card many of the commander's players run that the deck score sees as about even is listed
// among a row's alternatives with its play rate; a pick marked so is never made by "Make every swap".
const b143b = await page.evaluate(() => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)) || (() => { const x = {id:'tp', name:'tp', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[]}; setCommander(x, 'Don & Leo, Problem Solvers'); addCard(x, 'Brainstone', 1); return x; })(), R = {paths:[{cut:d.cards.find(e => !isBasic(e.n)).n, opts:{}, alts:{apex:[{n:['Smothering Tithe', 'Esper Sentinel', 'Rhystic Study', 'Mystic Remora'].find(n => !hasCard(d, n)), p:1, dScore:-0.02, inc:0.41, pc:true}], mid:[], budget:[]}}]};
  const h = alt3Html(d, R, new Set(), {add:'Arcane Signet', cut:R.paths[0].cut}, 0, 'apex'), h2 = pcChip({pcInc:0.3, dScore:0.12});
  return {label:/Players’ choice · in 41% of decks/.test(h), even:/Score about even/.test(h), noWarn:!/Lowers the deck score/.test(h), upShown:/Small upgrade/.test(h2) && !/about even/.test(h2), swapAllSkips:/![\w$]+\.p\.pc/.test(String(handleAct))}; });
T('UI-B143-02', 'Players’ choice: listed with the share of decks that run it and "Score about even" (or its real gain when it raises the score), never as lowering the score; Make every swap leaves these picks out', Object.values(b143b).every(Boolean), JSON.stringify(b143b));
} catch (e) { QUIET = false; T('UI-B143-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B143-03')) { try { if (SHARD) await RESET();
// 100. Build 143, score blind spots: a cost reducer for the spells you cast is ramp; Altar of Dementia is a sacrifice outlet that
// mills (it does not need big creatures); creature tokens the deck makes count as support for a creature-type payoff.
const b143c = await page.evaluate(() => { const r = n => [...tags(find(n)).roles], out = {ruby:r('Ruby Medallion').includes('ramp'), warchief:r('Goblin Warchief').includes('ramp'), thisSpell:!r('Ghalta, Primal Hunger').includes('ramp'), altar:!needsOf(find('Altar of Dementia')).includes('bigPower'), fling:needsOf(find('Fling')).includes('bigPower')};
  const d = {id:'t143', name:'t', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[]}; setCommander(d, 'Teval, the Balanced Scale'); ['Lost Monarch of Ifnir', 'Gravecrawler', 'Diregraf Ghoul'].forEach(n => addCard(d, n, 1));
  out.tokens = supportOf(d, 'tribe:Zombie').have >= 5; return out; });
T('UI-B143-03', 'Score blind spots: Ruby Medallion and Goblin Warchief are ramp (Ghalta’s own discount is not); Altar of Dementia needs no big creatures, Fling still does; Teval’s Zombie tokens count as Zombie support', Object.values(b143c).every(Boolean), JSON.stringify(b143c));
} catch (e) { QUIET = false; T('UI-B143-03', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B144-01')) { try { if (SHARD) await RESET();
// 101. Build 144: helper cores share the swap measurements, holding only the cards they need; the deck is the same as one built
// on one core, and their answers are spot-checked.
const b144a = await page.evaluate(async () => { const out = {}, name = 'Captain America, Team Leader', aims = await edhAimsFor(find(name));
  const one = async n => { S.cores = n; wkRestart(); wkGet(); genRun.last = null; const g = await startPlan(name, [], null, null, {fill:'budget', aims}); S.draft = null; return {list:g.cards.map(e => e.n + 'x' + e.q).sort().join('|'), last:genRun.last}; };
  const a = await one(0), b = await one(2); S.cores = null; wkRestart();
  Object.assign(out, {same:a.list === b.list, helpers:b.last && b.last.helpers, shared:!!(b.last && b.last.stat && b.last.stat.keys > b.last.stat.local), checked:b.last && b.last.stat && b.last.stat.checked, wrong:b.last && b.last.stat ? b.last.stat.wrong : -1}); return out; });
T('UI-B144-01', 'Helper cores: two helpers share the measurements (spot-checked, none wrong) and the Budget deck is the same card for card as on one core', b144a.same && b144a.helpers === 2 && b144a.shared && b144a.checked > 0 && b144a.wrong === 0, JSON.stringify(b144a));
} catch (e) { QUIET = false; T('UI-B144-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B144-02')) { try { if (SHARD) await RESET();
// 102. Build 144: with Generate open, the deck for the settings shown is built ahead; pressing Build then opens it at once, and it is
// the deck pressing Build would have built.
const b144b = await page.evaluate(async () => { const out = {}, name = 'Kenrith, the Returned King'; wkGet(); S.draft = null; Object.assign(S.gen, {cmd:name, tier:'mid', mech:[], best:true, sets:[], partner:'', theme:false}); await loadEdh(name); openGenerate();
  for (let i = 0; i < 300 && !(WK.spec && WK.cb.size === 0); i++) await new Promise(r => setTimeout(r, 100)); await WK.spec.p;
  const t0 = Date.now(); document.querySelector('[data-act="gen-go"]').click(); for (let i = 0; i < 300 && !(S.draft && S.draft.cards.length && !thinkThen.busy); i++) await new Promise(r => setTimeout(r, 20)); out.ms = Date.now() - t0; out.early = !!(genRun.last && genRun.last.early);
  const ahead = S.draft.cards.map(e => e.n + 'x' + e.q).sort().join('|'); S.draft = null; S.noWorker = true; const aims = await edhAimsFor(find(name)); const g = await startPlan(name, [], null, null, {fill:'mid', aims}); S.noWorker = false; S.draft = null;
  const now = g.cards.map(e => e.n + 'x' + e.q).sort(); out.same = ahead === now.join('|'); if (!out.same){ const A = ahead.split('|'); out.onlyAhead = A.filter(x => !now.includes(x)).slice(0, 5); out.onlyNow = now.filter(x => !A.includes(x)).slice(0, 5); } $('#modal').hidden = true; return out; });
T('UI-B144-02', 'Built ahead: with Generate open, pressing Build opens the deck already built for those settings (under 2 s), the same deck as building it then', b144b.early && b144b.same && b144b.ms < 2000, JSON.stringify(b144b));
} catch (e) { QUIET = false; T('UI-B144-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B145-01')) { try { if (SHARD) await RESET();
// 103. Build 145: a commander with no play data of its own is built from its creature type's and theme's pages in its colours.
// Ghoulcaller Gisa keeps making Zombies, so she leads a Zombie deck; her own page is treated as missing here.
const b145a = await page.evaluate(async () => { const out = {}, name = 'Ghoulcaller Gisa', keep = EDH; const E = {key:name, map:null, decks:0, state:'fail', pre:null, tags:[], tmap:{}}; await addFall(E, name);
  out.pages = (E.fall || []).map(f => f.label + ' (' + f.slug + ')'); EDH = E; S.noWorker = true;
  const g = await startPlan(name, [], null, null, {fill:'apex'}); S.noWorker = false; S.draft = null; const ctx = ctxOf(g);
  out.tribe = ctx.tribe; out.zombies = g.cards.filter(e => { const c = find(e.n); return c && hasCType(c, 'Zombie'); }).length; out.size = analyze(g).size;
  const db = baseScore(find('Death Baron'), g, ctx); out.why = db.why.find(w => /Zombie decks/.test(w)) || ''; EDH = keep; return out; });
T('UI-B145-01', 'No play data: Gisa (who keeps making Zombies) leads a Zombie deck built from the Zombie and theme pages in black; cards say why ("In N% of Zombie decks")', b145a.pages.length >= 1 && /zombies\/mono-black/.test(b145a.pages.join()) && b145a.tribe === 'Zombie' && b145a.zombies >= 12 && b145a.size === 100 && /Zombie decks/.test(b145a.why), JSON.stringify(b145a));
} catch (e) { QUIET = false; T('UI-B145-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B146-01')) { try { if (SHARD) await RESET();
// 104. Build 146 (owner, 19 Oct): Undo sits in the deck's bar (no floating button in a deck), the decklist can be grouped by
// colour, and the upgrade sheets have Previous and Next buttons.
const b146a = await page.evaluate(async () => { const out = {}, d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render();
  handleAct('listgroup', 'color'); out.groups = [...document.querySelectorAll('#rows .gh span:first-child')].map(x => x.textContent).filter(x => !/Commander/.test(x));
  out.colourOk = out.groups.every(g => ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Lands'].includes(g)) && out.groups.length >= 3; handleAct('listgroup', 'type');
  S.tab = 'up'; S.upView = 'sheet'; render(); await recsReady(d); render(); out.nav = [...document.querySelectorAll('.sheethead button')].map(b => b.textContent);
  S.tab = 'list'; const e = d.cards.find(x => !isBasic(x.n)); cutCard(d, e.n, 1); touch(); render();
  out.inBar = !!document.querySelector('.bar [data-act="undo"]'); out.fab = !$('#undo-fab').hidden; const n0 = UNDO.stack.length; document.querySelector('.bar [data-act="undo"]').click(); { const cf = document.querySelector('#confirm'); if (cf && !cf.hidden) cf.querySelector('[data-act="conf-yes"]').click(); } await new Promise(r => setTimeout(r, 100)); out.undone = UNDO.stack.length === n0 - 1;
  S.view = 'home'; render(); return out; });
T('UI-B146-01', 'Undo is in the deck bar next to Save deck/Saved (no floating button in a deck) and works; the decklist groups by colour; upgrade sheets have Previous and Next buttons', b146a.inBar && !b146a.fab && b146a.undone && b146a.colourOk && /Previous/.test(b146a.nav[0] || '') && /Next/.test(b146a.nav[1] || ''), JSON.stringify(b146a));
} catch (e) { QUIET = false; T('UI-B146-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B146-02')) { try { if (SHARD) await RESET();
// 105. Build 146: the background search keeps going when the picks on screen are held (it stopped at 2% on the owner's deck),
// and no card is suggested on two rows (the owner's shared Avengers deck had Captain America, Wings of Freedom twice).
const code146 = fs.readFileSync(path.join(here, 'share146.txt'), 'utf8').trim();
const b146b = await page.evaluate(async code => { const out = {}; location.hash = '#share=' + code; await checkShareLink(); await new Promise(r => setTimeout(r, 300)); const sv = document.querySelector('#modal [data-act="share-save"]'); if (sv) sv.click(); await new Promise(r => setTimeout(r, 300));
  const d = S.profile.decks.find(x => x.name === 'Avengers Assemble' && x.commander === 'Captain America, Team Leader'); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; const sy = S.syncRecs; S.syncRecs = false; recsFor.k = null; render();
  for (let i = 0; i < 1200 && !(recsFor.v && recsFor.v.poolDone); i++){ await new Promise(r => setTimeout(r, 100)); if (i % 20 === 0) render(); }
  const R = recsFor.v; out.done = !!R.poolDone; out.onCores = R.poolMs != null; out.note = !!document.querySelector('#pool-note'); const seen = new Map(), dup = []; R.paths.forEach((L, i) => new Set(['apex', 'mid', 'budget'].map(t => L.opts[t] && L.opts[t].add).filter(Boolean)).forEach(a => { if (seen.has(a) && seen.get(a) !== i) dup.push(a); seen.set(a, i); }));
  out.dup = dup; S.syncRecs = sy; S.profile.decks = S.profile.decks.filter(x => x !== d); S.view = 'home'; location.hash = ''; render(); return out; }, code146);
T('UI-B146-02', 'The owner’s shared deck: the whole-card search runs on the background cores and finishes (not stuck at 2%), and no card is suggested on two rows', b146b.done && b146b.onCores && !b146b.note && !b146b.dup.length, JSON.stringify(b146b));
} catch (e) { QUIET = false; T('UI-B146-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B147-01')) { try { if (SHARD) await RESET();
// 106. Version 0.9.2 (owner's choice 4c): Fix: Mana shows each land's best swap as soon as it is measured, with a note while it
// checks the rest; it pauses while a Swap is being confirmed, and the finished list is the same as the one worked out all at once.
const b147 = await page.evaluate(async () => { const out = {}, d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'stats'; render();
  for (let i = 0; i < 150 && !(apexFor(d) && evalFor(d) && evalFor(d).exact != null); i++){ await new Promise(r => setTimeout(r, 100)); if (i % 10 === 0) render(); } out.ready = evalFor(d) && evalFor(d).exact != null; FRESH.clear(); const t0 = performance.now(); openFix(['Mana']); const g = () => (S.fixG || []).find(x => x.k === 'Mana');
  out.noteAtOnce = /Checking land 1 of \d/.test($('#modal').textContent); out.noTopWhileBusy = true;
  for (let i = 0; i < 300 && g() && g().busy && !g().L.length; i++){ await new Promise(r => setTimeout(r, 20)); }
  out.firstMs = Math.round(performance.now() - t0); out.firstBusy = !!(g() && g().busy); out.rowsShown = document.querySelectorAll('#modal .fixsw').length;
  if (g().busy && document.querySelector('#modal [data-act="fix-top"]')) out.noTopWhileBusy = false;
  const sw = document.querySelector('#modal [data-act="fix-swap"]'), ay = S.autoYes; if (sw && g().busy){ S.autoYes = new Set([...(ay || [])].filter(x => x !== 'fix-swap')); sw.click(); await new Promise(r => setTimeout(r, 50)); const i0 = g().busy && g().busy.i; await new Promise(r => setTimeout(r, 700)); out.paused = !!$('#confirm') && !$('#confirm').hidden && !!g().busy && g().busy.i === i0; confirmDone(false); S.autoYes = ay; }
  for (let i = 0; i < 300 && g() && g().busy; i++) await new Promise(r => setTimeout(r, 50));
  out.totalMs = Math.round(performance.now() - t0); out.done = !g().busy && !document.querySelector('#modal .think');
  const fin = g().L.map(p => p.cut + '>' + p.add + ' ' + p.dScore).join(), all = fixList(d, 'Mana').map(p => p.cut + '>' + p.add + ' ' + p.dScore).join(); out.same = fin === all; out.n = g().L.length;
  $('#modal').hidden = true; return out; });
T('UI-B147-01', 'Fix: Mana fills in land by land: a "Checking land" note at once, the first swap long before the end, Make the top hidden until done, paused while a Swap is confirmed, and the final list matches the all-at-once list', b147.noteAtOnce && b147.firstBusy && b147.rowsShown > 0 && b147.noTopWhileBusy && b147.paused !== false && b147.done && b147.same && b147.n > 0, JSON.stringify(b147));
} catch (e) { QUIET = false; T('UI-B147-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B148-01')) { try { if (SHARD) await RESET();
// 107. Version 0.9.3: two buttons shared an action name with another button, so their own code never ran: a card's
// "Undo · bring back" undid the last change instead of that card's swap, and the Buy list page's Copy copied only the open deck.
const b148 = await page.evaluate(async () => { const out = {}, d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'list'; render();
  const before = JSON.stringify(d.cards), a = d.cards.find(e => !tags(find(e.n)).land && !isBasic(e.n)), b = d.cards.find(e => e !== a && !tags(find(e.n)).land && !isBasic(e.n));
  const ay = S.autoYes; S.autoYes = new Set([...(ay || []), 'swap', 'undo-card']);
  const [x1, x2] = LIB.filter(c => !c.ci.length && !tags(c).land && legalIn(c, 'commander') && !hasCard(d, c.n) && c.r && c.r < 3000).slice(0, 2).map(c => c.n);   // cards the deck doesn't hold
  doSwap(d, {cut:a.n, add:x1, q:1}, 0); doSwap(d, {cut:b.n, add:x2, q:1}, 0); touch(); render();
  handleAct('undo-card', '', x1); out.cardBack = !!entryOf(d, a.n) && !entryOf(d, x1) && !!entryOf(d, x2) && !entryOf(d, b.n);   // only that card's swap is undone
  d.cards = JSON.parse(before); S.autoYes = ay; touch();
  const w0 = d.want; if (!(d.want || []).length) d.want = [{n:'Sol Ring', q:1}];   // the Buy list page needs a list to show its Copy button
  S.view = 'buy'; render(); const btn = document.querySelector('[data-act="buy-copy-all"]'); let copied = null; const ct = window.copyText; window.copyText = (t, m) => { copied = t; }; out.btn = !!btn; if (btn) btn.click(); window.copyText = ct;
  out.allLists = copied === null || copied === buyAllText(); out.noDup = !document.querySelector('[data-act="undo"][data-n]') && !document.querySelector('.buyall [data-act="buy-copy"]'); d.want = w0; S.view = 'decks'; render(); return out; });
T('UI-B148-01', 'A card’s “Undo · bring back” undoes only that card’s swap (not the last change); the Buy list page’s Copy copies the chosen lists (its own action, no longer the open deck’s)', b148.cardBack && b148.btn && b148.allLists && b148.noDup, JSON.stringify(b148));
} catch (e) { QUIET = false; T('UI-B148-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B156-01')) { try { if (SHARD) await RESET();
// Version 0.9.11 (owner, 24 Oct): no held picks; Mid never scores below Budget on a row; tier buttons say what the new cards cost
// to buy; one swap keeps the rest of the checked list (no new search); the buy list's suggestions are kept with the deck, with
// Bought marks; picking a commander in Generate asks first; building keeps a window up until the deck opens.
const b156 = await page.evaluate(async () => { const out = {}; const sy = S.syncRecs; S.syncRecs = true;
  await loadPreconLive('turtle-power', 'Turtle Power'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander); await loadThemes(d.commander, d.aims);
  for (let i = 0; i < 100 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100));
  S.view = 'decks'; S.open = true; S.tab = 'up'; S.upView = 'list'; recsFor.k = null; render(); await recsReady(d); render(); await new Promise(r => setTimeout(r, 200)); render();
  const R = recsFor(d); out.rows = R.paths.length; out.holds = Object.keys(d.recP || {}).length;
  out.order = R.paths.every((L, i) => { const c = rowCols(d, R, L, i), s = t => c[t] && c[t].p ? c[t].p.dScore : null; return s('budget') == null || s('mid') == null || s('budget') <= s('mid'); });
  out.btn = [...document.querySelectorAll('.tierbtn span')].map(x => x.textContent).every(x => /^(\d+ cards? · \$\d+ to buy|No worthwhile upgrades)$/.test(x));
  const b = document.querySelector('.paths [data-act="swap"]'); out.swapped = !!b; if (b) { b.click(); await new Promise(r => setTimeout(r, 300)); }
  const R2 = recsFor(d); out.kept = R2 === R && !R2.pending && R2.paths.length === out.rows - 1;
  S.tab = 'buy'; render(); out.snap = !!(d.buySnap && d.buySnap.groups.length); const g = document.querySelector('[data-act="buy-got"]'); if (g) { const n = g.dataset.n; g.click(); await new Promise(r => setTimeout(r, 200)); out.got = (d.bought || []).includes(n); }
  out.refresh = !!document.querySelector('[data-act="buy-refresh"]');
  S.gen = {cmd:'', partner:'', sets:[], setsMust:false}; openGenerate(); handleAct('gen-pick', '', 'Heroes in a Half Shell'); out.confirm = !!document.querySelector('#modal .gconfirm [data-act="gen-pick-ok"]');
  handleAct('gen-pick-back', '', ''); out.back = !!document.querySelector('#gen-q');
  genBuilding(find('Heroes in a Half Shell')); setStatus('Thinking… test'); out.building = /Thinking… test/.test((document.querySelector('#genbuild-msg') || {}).textContent || ''); setStatus(''); $('#modal').hidden = true;
  S.profile.decks = S.profile.decks.filter(x => x !== d); S.syncRecs = sy; S.view = 'home'; render(); return out; });
T('UI-B156-01', 'Version 0.9.11: no held picks; Budget never scores above Mid on a row; tier buttons say what the new cards cost; one swap keeps the rest of the list; buy suggestions kept with Bought marks and Refresh; Generate asks before using a commander and keeps a Building window up', b156.rows > 0 && !b156.holds && b156.order && b156.btn && b156.swapped && b156.kept && b156.snap && b156.got && b156.refresh && b156.confirm && b156.back && b156.building, JSON.stringify(b156));
} catch (e) { QUIET = false; T('UI-B156-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B157-01')) { try { if (SHARD) await RESET();
// Version 0.9.12 (owner, 24 Oct): every row has an Apex card (the slot's best card, even a cheap one: it is not shown as Budget),
// and no Undo happens without confirming it (Cancel changes nothing).
const b157 = await page.evaluate(async () => { const out = {}; const sy = S.syncRecs; S.syncRecs = true;
  await loadPreconLive('turtle-power', 'Turtle Power'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander); await loadThemes(d.commander, d.aims);
  for (let i = 0; i < 100 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100));
  S.view = 'decks'; S.open = true; S.tab = 'up'; S.upView = 'list'; recsFor.k = null; render(); await recsReady(d); render();
  const R = recsFor(d); out.rows = R.paths.length; out.apexAll = R.paths.every((L, i) => { const c = rowCols(d, R, L, i); return !!(c.apex && c.apex.p); });
  out.apexBest = R.paths.every((L, i) => { const c = rowCols(d, R, L, i), a = c.apex.p; return ['mid', 'budget'].every(t => !c[t] || !c[t].p || a.pc || a.dScore == null || c[t].p.dScore == null || c[t].p.dScore <= a.dScore + 0.05); });
  d.name = d.name + ' x'; touch(); render(); const n0 = UNDO.stack.length; const ub = document.querySelector('[data-act="undo"]'); out.undoBtn = !!ub; if (ub) ub.click(); await new Promise(r => setTimeout(r, 100));
  const cf = document.querySelector('#confirm'); out.asks = !!cf && !cf.hidden; if (out.asks) cf.querySelector('[data-act="conf-no"]').click(); await new Promise(r => setTimeout(r, 100)); out.cancelKeeps = UNDO.stack.length === n0;
  S.profile.decks = S.profile.decks.filter(x => x !== d); S.syncRecs = sy; S.view = 'home'; render(); return out; });
T('UI-B157-01', 'Version 0.9.12: every upgrade row has an Apex card, the best card for the slot whatever it costs; Undo asks before undoing and Cancel changes nothing', b157.rows > 0 && b157.apexAll && b157.apexBest && b157.undoBtn && b157.asks && b157.cancelKeeps, JSON.stringify(b157));
} catch (e) { QUIET = false; T('UI-B157-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B158-01')) { try { if (SHARD) await RESET();
// Version 0.9.13 (owner, 24 Oct): Stick to the theme, a deck setting: on, every row's picks are cards on theme for the deck
// that raise its score (franchise, creature types or plans); off, the strongest cards as before.
const b158 = await page.evaluate(async () => { const out = {}; const sy = S.syncRecs; S.syncRecs = false; const full = async () => { for (let i = 0; i < 1200; i++) { const R = recsFor(d); if (!R.pending && (!R.pool || R.poolDone)) break; await new Promise(r => setTimeout(r, 100)); if (i % 20 === 0) render(); } render(); };
  await loadPreconLive('turtle-power', 'Turtle Power'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander); await loadThemes(d.commander, d.aims);
  for (let i = 0; i < 100 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100));
  S.view = 'decks'; S.open = true; S.tab = 'up'; S.upView = 'list'; recsFor.k = null; render(); await full();
  const TC = themeCtx(d), ctx = ctxOf(d), on = c => !!themeOf(c, TC) || d.aims.some(a => matchAim(c, a, ctx.tribe) >= 0.7);
  const share = () => { const R = recsFor(d), A = R.paths.map(L => tierPick(L, 'apex')).filter(Boolean); return A.filter(p => on(find(p.add))).length / Math.max(1, A.length); };
  out.off = +share().toFixed(2); const b = document.querySelector('[data-act="stick"]'); out.btn = !!b; if (b) b.click(); await new Promise(r => setTimeout(r, 100)); await full();
  out.stick = !!d.stick; out.on = +share().toFixed(2); out.label = /Stick to the theme: On/.test((document.querySelector('[data-act="stick"]') || {}).textContent || '');
  out.raise = recsFor(d).paths.every(L => { const p = tierPick(L, 'apex'); return !p || p.dScore == null || p.dScore >= 0.05; });
  S.profile.decks = S.profile.decks.filter(x => x !== d); S.syncRecs = sy; S.view = 'home'; render(); return out; });
T('UI-B158-01', 'Version 0.9.13: Stick to the theme (a deck setting) makes the Apex picks on-theme cards that still raise the score; off by default', b158.btn && b158.stick && b158.label && b158.on > b158.off && b158.on >= 0.8 && b158.raise, JSON.stringify(b158));
} catch (e) { QUIET = false; T('UI-B158-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B160-01')) { try { if (SHARD) await RESET();
// Version 0.9.15 (owner, 24 Oct: "the thinking and waiting needs to be expedited without cutting corners"): a finished upgrade
// list is saved; opening the deck again with nothing changed shows the same list at once (no thinking), card for card; a change
// to the deck or Regenerate works it out again.
const b160 = await page.evaluate(async () => { const out = {}; const sy = S.syncRecs; S.syncRecs = false; S.recFresh = false;
  await loadPreconLive('turtle-power', 'Turtle Power'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander); await loadThemes(d.commander, d.aims);
  for (let i = 0; i < 100 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100));
  S.view = 'decks'; S.open = true; S.tab = 'up'; S.upView = 'list';
  const done = async () => { for (let i = 0; i < 1200; i++) { const R = recsFor(d); if (!R.pending && (!R.pool || R.poolDone)) return R; await new Promise(r => setTimeout(r, 100)); if (i % 20 === 0) render(); } };
  const picks = R => JSON.stringify(R.paths.map(L => [L.cut, ['apex', 'mid', 'budget'].map(t => L.opts[t] && [L.opts[t].add, L.opts[t].dScore])]));
  recsFor.k = null; render(); const P1 = picks(await done()); out.saved = !!lsGet('dc.rec.' + d.id);
  let t0 = performance.now(); recsFor.k = null; recsFor.v = null; ROWC.k = null; const R2 = recsFor(d); render(); out.ms = Math.round(performance.now() - t0);
  out.restored = !!R2.restored; out.same = picks(R2) === P1; out.noThinking = !R2.pending && !document.querySelector('#pool-note') && !/Thinking… checking every card/.test(document.body.textContent);
  const nm = d.cards.find(x => !isBasic(x.n)).n; cutCard(d, nm, 1); touch(); recsFor.k = null; recsFor.v = null; out.changeFresh = !recsFor(d).restored; addCard(d, nm, 1); touch();
  recsFor.k = null; recsFor.v = null; await done(); recDrop(d); recsFor.k = null; recsFor.v = null; out.dropFresh = !recsFor(d).restored;
  S.profile.decks = S.profile.decks.filter(x => x !== d); S.syncRecs = sy; S.recFresh = true; S.view = 'home'; render(); return out; });
T('UI-B160-01', 'Version 0.9.15: a finished upgrade list is saved; reopening the unchanged deck shows the same list at once, card for card; a deck change or Regenerate works it out again', b160.saved && b160.restored && b160.same && b160.noThinking && b160.ms < 3000 && b160.changeFresh && b160.dropFresh, JSON.stringify(b160));
} catch (e) { QUIET = false; T('UI-B160-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B161-01')) { try { if (SHARD) await RESET();
// Version 0.9.16 (owner, 24 Oct: "When generating a deck in any way, you should generate that deck with a full deck list at the
// appropriate tier. If none is assigned, you should make a commander deck equivalent to a precon"): no price level means Budget,
// a commander with no strategy of its own is still built in full, and Build around my cards keeps your cards and fills the rest.
const b161 = await page.evaluate(async () => { const out = {}, sum = d => d ? d.cards.reduce((a, e) => a + e.q, 0) : 0, over = (d, cap, keep) => d.cards.filter(e => { const c = find(e.n); return c && !isBasic(c.n) && c.p != null && c.p >= cap && !(keep || []).includes(c.n); }).length;
  let d = await startPlan('Kodama of the East Tree', [], null, null, {}); out.noStrategy = {cards: sum(d), tier: d && d.tier, plan: !!(d && d.plan && d.plan.length), over3: d ? over(d, 3) : -1};
  d = await startPlan('Kenrith, the Returned King', ['Rhystic Study', 'Counterspell', 'Ponder'].map(find), [], null); out.seeds = {cards: sum(d), kept: ['Rhystic Study', 'Counterspell', 'Ponder'].every(n => d.cards.some(e => e.n === n)), plan: !!(d.plan && d.plan.length), over3: over(d, 3, ['Rhystic Study'])};
  d = await startPlan('Captain America, Team Leader', [], null, null, {fill: 'mid'}); out.mid = {cards: sum(d), over12: over(d, 12)};
  S.draft = null; S.view = 'home'; render(); return out; });
T('UI-B161-01', 'Version 0.9.16: every way of generating builds the full deck: no price level gives a precon-like Budget deck, a commander with no strategy of its own is built in full, Build around my cards keeps your cards and fills the rest, a chosen level is kept', b161.noStrategy.cards === 99 && !b161.noStrategy.plan && b161.noStrategy.tier === 'budget' && !b161.noStrategy.over3 && b161.seeds.cards === 99 && b161.seeds.kept && !b161.seeds.plan && !b161.seeds.over3 && b161.mid.cards === 99 && !b161.mid.over12, JSON.stringify(b161));
} catch (e) { QUIET = false; T('UI-B161-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B162-01')) { try { if (SHARD) await RESET();
// Version 0.9.17 (owner, 25 Oct: alternate printings showed under the original card name): a card shown in a themed printing that
// carries another name is named by that printing first, then its real name, on the upgrade sheet and in the card window,
// whether it is in the deck or recommended.
const b162 = await page.evaluate(async () => { const out = {};
  await loadPreconLive('turtle-power', 'Turtle Power'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander);
  for (let i = 0; i < 100 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100));
  S.view = 'decks'; S.open = true; S.tab = 'up'; S.upView = 'sheet'; recsFor.k = null; render(); await recsReady(d); render();
  const names = [...document.querySelectorAll('.s4 b')].map(x => x.textContent).filter(x => x !== 'No pick'), k = names.map(n => find(n)).filter(Boolean);
  k.forEach((c, i) => PRINT.map.set(c._n, {id: c.id, sc: 'tst', set: 'Test', rar: 'rare', fn: 'Printed Name ' + i})); render();
  out.sheet = [...document.querySelectorAll('.s4 b')].map(x => x.textContent).filter(x => x !== 'No pick');
  out.sheetOk = out.sheet.length > 0 && out.sheet.every((x, i) => x === 'Printed Name ' + i + ' (' + k[i].n + ')');
  const rec = recsFor(d).paths.map(L => L.opts.apex && L.opts.apex.add).find(n => n && !hasCard(d, n)), rc = find(rec);
  PRINT.map.set(rc._n, {id: rc.id, sc: 'tst', set: 'Test', rar: 'rare', fn: 'Printed Pick'}); handleAct('card', '', rec); await new Promise(r => setTimeout(r, 200));
  out.card = (document.querySelector('#modal h2') || {}).textContent; out.cardOk = out.card === 'Printed Pick ' + rc.n;
  $('#modal').hidden = true; PRINT.map = new Map(); PRINT.key = ''; S.profile.decks = S.profile.decks.filter(x => x !== d); S.view = 'home'; render(); return out; });
T('UI-B162-01', 'Version 0.9.17: a card shown in a printing that carries another name is named by that printing, then its real name, on the upgrade sheet and in the card window', b162.sheetOk && b162.cardOk, JSON.stringify(b162));
} catch (e) { QUIET = false; T('UI-B162-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B164-01')) { try { if (SHARD) await RESET();
// Deck power (owner, 30 Oct): the deck score as a share of this deck's Apex build's score, Budget and Mid builds marked the same
// way, on the strip and the meter, and what keeps the deck below the next level, part by part.
const b164 = await page.evaluate(async () => { const out = {};
  await loadPreconLive('turtle-power', 'Turtle Power'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander);
  for (let i = 0; i < 200 && !(apexFor(d) && apexFor(d).tot && apexFor(d).tot.parts); i++) { await new Promise(r => setTimeout(r, 100)); if (i % 10 === 0) render(); }
  S.view = 'decks'; S.open = true; S.tab = 'up'; render(); await new Promise(r => setTimeout(r, 300)); render();   /* the meter and gaps are on Upgrades since 0.9.20 */
  const strip = (document.querySelector('.statbar') || {}).textContent || '', leg = (document.querySelector('.tm-leg') || {}).textContent || '';
  out.power = +((/^Power\s*(\d+)/.exec(strip) || [])[1] || -1); out.leg = leg; out.marks = /Apex\s*100/.test(leg);
  const T = refOrder(apexFor(d).tot), e = evalFor(d); out.lvl = (/Tier\s*(\w+)/.exec(strip) || [])[1]; out.match = out.power === Math.round((100 * e.exact) / T.apex); out.floor = new RegExp('Budget\\s*' + Math.round((100 * T.budget) / T.apex)).test(leg);   /* 30 Oct: power is the share of the Apex build's score */
  out.gaps = [...document.querySelectorAll('.gapbox li')].map(x => x.textContent.slice(0, 40)); out.gapOk = out.lvl === 'Apex' || out.gaps.length > 0;
  S.tab = 'stats'; render(); out.scoreKept = /Deck score\s*\d+/.test((document.querySelector('#stats-more .sgrid') || {}).textContent || '');
  S.profile.decks = S.profile.decks.filter(x => x !== d); S.view = 'home'; render(); return out; });
T('UI-B164-01', 'The strip and meter show deck power as a share of this deck’s Apex build (Budget and Mid builds marked the same way); below a level, what keeps it there, part by part; the deck score stays in Build stats', b164.power >= 0 && b164.marks && b164.match && b164.floor && b164.gapOk && b164.scoreKept, JSON.stringify(b164));
} catch (e) { QUIET = false; T('UI-B164-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-B165-01')) { try { if (SHARD) await RESET();
// Version 0.9.20 (owner, 26 Oct: "The stats page should be just that, stats"): Path to Apex, the meter, upgrades left and the game
// plan sit on Upgrades under the progress bar; Build stats keeps a short one-line-per-few health list; the Apply All buttons sit below
// the upgrade rows; the "Best deck with every card under $X" buttons sit in the left Build pane.
const b165 = await page.evaluate(async () => { const d = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; S.syncRecs = false; render(); await recsReady(d);
  for (let i = 0; i < 150 && recsFor.v && recsFor.v.pool && !recsFor.v.poolDone; i++) await new Promise(r => setTimeout(r, 100)); render();
  const up = document.querySelector('#upscroll'), out = {};
  out.upMeter = !!up.querySelector('.tmeter'); out.upTips = !!up.querySelector('.apextips') || /Path to Apex/i.test(up.textContent); out.upPlan = !!up.querySelector('#plan-more');
  const rows = [...up.querySelectorAll('.paths .path')], tb = up.querySelector('.tierbtns'); out.tiersBelow = !!(tb && rows.length && tb.getBoundingClientRect().top >= rows[rows.length - 1].getBoundingClientRect().bottom - 1);
  out.capsLeft = document.querySelectorAll('.aimp .bfoot [data-act="cap-show"]').length === 2 && !up.querySelector('[data-act="cap-show"]');
  S.tab = 'stats'; render(); const st = document.querySelector('#statscroll'), hg = st.querySelector('.hgrid');
  out.statsClean = !st.querySelector('.tmeter') && !st.querySelector('.apextips') && !st.querySelector('#plan-more') && !/Path to Apex|Upgrades left/i.test(st.textContent);
  out.healthShort = !!(hg && hg.getBoundingClientRect().height < 90); S.tab = 'up'; render(); return out; });
T('UI-B165-01', 'Version 0.9.20: Path to Apex, the meter and the game plan are on Upgrades; Build stats is stats only with a short health list; Apply All buttons sit below the upgrade rows; the under-$X buttons sit in the left pane', Object.values(b165).every(v => v === true), JSON.stringify(b165));
} catch (e) { QUIET = false; T('UI-B165-01', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
if (RUN('UI-IPAD-02')) { try { if (SHARD) await RESET();
{ const id = await page.evaluate(() => { const w = S.profile.decks.find(x => /Wakanda/i.test(x.name)); S.deckId = w.id; S.view = 'decks'; S.open = true; S.tab = 'buy'; render(); return w.id; });
  await page.reload({waitUntil:'load'}); await page.waitForTimeout(1200);
  const st = await page.evaluate(() => ({view:S.view, open:S.open, deckId:S.deckId, tab:S.tab, editing:document.querySelector('.app').classList.contains('editing')}));
  T('UI-IPAD-02', 'If the page is reloaded while in the background, it reopens the same deck on the same tab instead of the home screen', st.view === 'decks' && st.open && st.deckId === id && st.tab === 'buy' && st.editing, JSON.stringify(st)); }
} catch (e) { QUIET = false; T('UI-IPAD-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
QUIET = false; T('UI-ERR', 'No page errors during the run', !errs.length, errs.join(' | '));
await page.screenshot({path:OUT + '/' + label + '-desktop.png', fullPage:false});
fs.writeFileSync(OUT + '/' + label + '.json', JSON.stringify({build, at:new Date().toISOString(), results}, null, 1));
console.log('\nbuild', build, '|', results.filter(r => r.pass).length, 'passed,', results.filter(r => !r.pass).length, 'failed');
if (SKIPPED.length) console.log('FAST=1: skipped ' + SKIPPED.length + ' heavy tests (' + SKIPPED.join(', ') + '); run without FAST before going live');
await b.close();
