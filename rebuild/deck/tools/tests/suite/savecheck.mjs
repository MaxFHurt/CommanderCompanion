// Saving (0.9.23): decks live under cc.deckProfile, never written by the old Deck Companion; a swap is saved at once; a window
// with nothing changed never writes over another's save; a full local storage is cleared of caches; the IndexedDB copy
// brings decks back. Usage: PW=<playwright path> node savecheck.mjs <port>
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);
const port = process.argv[2] || '8765', url = 'http://127.0.0.1:' + port + '/index.html';
let fails = 0; const T = (id, desc, pass, detail) => { if (!pass) fails++; console.log((pass ? 'PASS' : 'FAIL'), id.padEnd(10), desc, detail ? '— ' + detail : ''); };
const errs = [];
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1300, height:900}});
await ctx.route('**/*', r => r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
const open = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(url, {waitUntil:'load'}); await p.waitForFunction(() => typeof touch === 'function' && S.profile); await p.waitForTimeout(400); return p; };
const deck = (id, n) => ({id, name:'Deck ' + id, format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[{n, q:1}, {n:'Sol Ring', q:1}], dismissed:[]});
const ls = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);

// S1. Decks saved by an earlier build (dc.profile) move to the new name once.
let p1 = await open();
await p1.evaluate(d => { localStorage.clear(); localStorage.setItem('dc.profile', JSON.stringify({name:'Me', decks:[d], updatedAt:1})); }, deck('old1', 'Llanowar Elves'));
await p1.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('cc-deck-builder'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
await p1.reload({waitUntil:'load'}); await p1.waitForTimeout(800);
let s1 = await ls(p1, 'cc.deckProfile');
T('SAVE-MOVE', 'Decks saved under the old name (dc.profile) move to cc.deckProfile', !!s1 && s1.decks.some(d => d.id === 'old1') && s1.saveRev > 0, JSON.stringify(s1 && s1.decks.map(d => d.id)));

// S2. The old app writing dc.profile afterwards changes nothing here.
await p1.evaluate(d => localStorage.setItem('dc.profile', JSON.stringify({name:'Me', decks:[d], updatedAt:Date.now()})), deck('stale', 'Forest'));
await p1.reload({waitUntil:'load'}); await p1.waitForTimeout(800);
const s2 = await p1.evaluate(() => S.profile.decks.map(d => d.id));
T('SAVE-OLDAPP', 'An old Deck Companion page writing dc.profile does not replace the decks', s2.includes('old1') && !s2.includes('stale'), JSON.stringify(s2));

// S3. A swap is saved at once (no waiting for the save timer).
const s3 = await p1.evaluate(() => { const d = S.profile.decks.find(x => x.id === 'old1'); S.deckId = d.id; doSwap(d, {cut:'Llanowar Elves', add:'Elvish Mystic', q:1}, 0); touch();
  const p = JSON.parse(localStorage.getItem('cc.deckProfile')); return p.decks.find(x => x.id === 'old1').cards.map(e => e.n); });
T('SAVE-SWAP', 'A swap is in local storage straight away', s3.includes('Elvish Mystic') && !s3.includes('Llanowar Elves'), JSON.stringify(s3));

// S4. A second window that changed nothing never writes its older copy when it is hidden or closed; it takes the newer save.
const p2 = await open();
await p1.evaluate(() => { const d = S.profile.decks.find(x => x.id === 'old1'); doSwap(d, {cut:'Sol Ring', add:'Arcane Signet', q:1}, 0); touch(); });
await p2.waitForTimeout(300);
const took = await p2.evaluate(() => S.profile.decks.find(x => x.id === 'old1').cards.map(e => e.n));
await p2.evaluate(() => { persist(); dispatchEvent(new Event('pagehide')); });
await p2.close(); await p1.waitForTimeout(200);
const s4 = (await ls(p1, 'cc.deckProfile')).decks.find(x => x.id === 'old1').cards.map(e => e.n);
T('SAVE-STALE', 'A window with no changes takes the other window’s save and never writes over it', s4.includes('Arcane Signet') && took.includes('Arcane Signet'), JSON.stringify({took, s4}));

// S5. Two windows that both changed something: neither loses its deck.
const p3 = await open();
await p3.evaluate(() => { PROF.dirty = true; }); // p3 has a change waiting when p1 saves
await p1.evaluate(d => { S.profile.decks.push(d); touch(); persist(); }, deck('fromA', 'Forest'));
const s5 = await p3.evaluate(d => { S.profile.decks.push(d); touch(); persist(); return JSON.parse(localStorage.getItem('cc.deckProfile')).decks.map(x => x.id); }, deck('fromB', 'Island'));
T('SAVE-MERGE', 'Two windows saving different changes keep both', s5.includes('fromA') && s5.includes('fromB') && s5.includes('old1'), JSON.stringify(s5));
await p3.close();

// S6. Local storage full of caches: they are cleared and the save goes through.
const s6 = await p1.evaluate(() => { let i = 0; const big = 'x'.repeat(200000); try { for (; i < 400; i++) localStorage.setItem('dc.rec.fill' + i, big); } catch (e) {}
  const d = S.profile.decks.find(x => x.id === 'old1'); d.note = 'n'.repeat(400000); doSwap(d, {cut:'Arcane Signet', add:'Mind Stone', q:1}, 0); touch();
  const p = JSON.parse(localStorage.getItem('cc.deckProfile')); return {filled:i, saved:p.decks.find(x => x.id === 'old1').cards.some(e => e.n === 'Mind Stone'), left:Object.keys(localStorage).filter(k => k.startsWith('dc.rec.')).length}; });
T('SAVE-FULL', 'With local storage full, caches are cleared and the swap is still saved', s6.saved && s6.left === 0, JSON.stringify(s6));

// S7. Local storage cleared (Safari can): the IndexedDB copy brings the decks back.
await p1.waitForTimeout(500);
await p1.evaluate(() => localStorage.clear());
await p1.reload({waitUntil:'load'}); await p1.waitForTimeout(1500);
const s7 = await p1.evaluate(() => { const d = S.profile.decks.find(x => x.id === 'old1'); return d ? d.cards.map(e => e.n) : null; });
T('SAVE-IDB', 'With local storage cleared, the device copy brings the decks back', !!s7 && s7.includes('Mind Stone'), JSON.stringify(s7));

// S8. A swap on an unsaved (draft) deck keeps it: the deck joins your decks.
const s8 = await p1.evaluate(() => { const d = newDeck({name:'Draft X', cards:[{n:'Forest', q:1}, {n:'Llanowar Elves', q:1}]}); doSwap(d, {cut:'Llanowar Elves', add:'Elvish Mystic', q:1}, 0); touch();
  return {draft:!!S.draft, saved:JSON.parse(localStorage.getItem('cc.deckProfile')).decks.some(x => x.id === d.id)}; });
T('SAVE-DRAFT', 'A swap on an unsaved deck saves the deck', !s8.draft && s8.saved, JSON.stringify(s8));

T('SAVE-ERR', 'No page errors', !errs.length, errs.slice(0, 3).join(' | '));
await b.close();
console.log('savecheck: ' + (8 + 1 - fails) + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
