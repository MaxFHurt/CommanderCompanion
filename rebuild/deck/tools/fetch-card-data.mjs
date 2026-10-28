// Saves a trimmed snapshot of the card data Deck Companion uses, so the recommendation engine can be tested offline.
// Run by .github/workflows/card-data.yml; output goes to ./out and is published on the card-data branch.
import fs from 'node:fs'; import zlib from 'node:zlib';
const H = {'User-Agent':'DeckCompanion-tests/1.0', 'Accept':'application/json'}, sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 6){ let last = ''; for (let i = 0; i < tries; i++){ try { const r = await fetch(url, {headers:H}); if (r.status === 404) return null; if (r.ok) return await r.json(); last = 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160); } catch (e) { last = String(e && e.message || e); } await sleep(2500 * (i + 1)); } throw new Error('gave up: ' + url.slice(0, 90) + ' :: ' + last); }
const keep = o => { const x = {}; for (const k of ['object','layout','games','name','mana_cost','cmc','type_line','oracle_text','color_identity','edhrec_rank','set','set_name','id','oracle_id','rarity','collector_number','game_changer','power','toughness','loyalty','released_at']) if (o[k] !== undefined) x[k] = o[k];
  x.legalities = {commander:o.legalities && o.legalities.commander, standard:o.legalities && o.legalities.standard}; x.prices = {usd:o.prices && o.prices.usd, usd_foil:o.prices && o.prices.usd_foil, usd_etched:o.prices && o.prices.usd_etched};
  if (o.card_faces) x.card_faces = o.card_faces.map(f => ({name:f.name, type_line:f.type_line, oracle_text:f.oracle_text, mana_cost:f.mana_cost, power:f.power, toughness:f.toughness, loyalty:f.loyalty})); return x; };
fs.mkdirSync('out/edhrec', {recursive:true}); const meta = {at:new Date().toISOString(), notes:[]};
// ./out starts as the previous snapshot (the workflow checks it out), so a section that fails keeps its old files.
let prev = {}; try { prev = JSON.parse(fs.readFileSync('out/meta.json', 'utf8')); } catch (e) {}
// 1. Cards: the same search the app runs (cheapest printing of every Commander- or Standard-legal paper card).
try {
  let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent('(legal:commander or legal:standard) game:paper prefer:usd-low') + '&unique=cards&order=edhrec', cards = [];
  while (url){ const j = await get(url); (j.data || []).forEach(o => cards.push(keep(o))); url = j.has_more ? j.next_page : null; await sleep(250); }
  fs.writeFileSync('out/cards.json.gz', zlib.gzipSync(JSON.stringify(cards))); meta.cards = cards.length;
} catch (e) { meta.notes.push('cards: ' + e.message); meta.cards = prev.cards; meta.cardsAt = prev.cardsAt || prev.at; }
if (!meta.cardsAt) meta.cardsAt = meta.at;
// 2. Sets, and the bracket tag lists.
try { const sets = await get('https://api.scryfall.com/sets'); fs.writeFileSync('out/sets.json', JSON.stringify((sets.data || []).map(s => ({code:s.code, name:s.name, set_type:s.set_type, released_at:s.released_at, card_count:s.card_count, parent_set_code:s.parent_set_code, digital:s.digital})))); } catch (e) { meta.notes.push('sets: ' + e.message); }
const tags = {}; for (const [k, q] of [['mld', 'otag:mass-land-denial'], ['turns', 'otag:extra-turn']]){ tags[k] = []; try { let u = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q + ' legal:commander') + '&unique=cards'; while (u){ const j = await get(u); if (!j) break; (j.data || []).forEach(o => tags[k].push(o.name)); u = j.has_more ? j.next_page : null; await sleep(120); } } catch (e) { meta.notes.push('tags ' + k + ': ' + e.message); } }
if (tags.mld.length || tags.turns.length) fs.writeFileSync('out/tags.json', JSON.stringify(tags));
// 2a. Function tags from Scryfall's community tagger, used only to check the app's own tagging rules against.
{ const truth = {}, tried = {};
  for (const k of ['removal','creature-removal','spot-removal','fight','bite','ramp','mana-rock','mana-dork','draw','card-advantage','boardwipe','sweeper','board-wipe','counterspell','tutor','fog','protection','gives-hexproof','gives-indestructible','gives-protection','recursion','burn','edict']){
    try { let u = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent('otag:' + k + ' legal:commander game:paper') + '&unique=cards', n = []; let pages = 0;
      while (u && pages < 40){ const j = await get(u, pages ? 6 : 2); if (!j) break; (j.data || []).forEach(o => n.push(o.name)); u = j.has_more ? j.next_page : null; pages++; await sleep(300); }
      tried[k] = n.length; if (n.length) truth[k] = n; } catch (e) { tried[k] = 'fail: ' + e.message.slice(-60); } }
  meta.truth = tried; if (Object.keys(truth).length) fs.writeFileSync('out/truth.json', JSON.stringify(truth)); }
// 2b. Alternate names: reprints that carry a different printed name (Universes Beyond reskins and the like).
{ const alt = {}; let okQ = '';
  for (const q of ['has:flavorname', 'is:flavorname', 'has:flavor_name', 'has:flavor-name']){ try { let u = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q + ' game:paper') + '&unique=prints', n = 0; while (u){ const j = await get(u, n ? 6 : 1); if (!j) break; (j.data || []).forEach(o => { n++; if (o.flavor_name) alt[o.flavor_name] = o.name; (o.card_faces || []).forEach(f => { if (f.flavor_name) alt[f.flavor_name] = o.name; }); }); u = j.has_more ? j.next_page : null; await sleep(250); } if (Object.keys(alt).length){ okQ = q; break; } } catch (e) { meta.notes.push('alt ' + q + ': ' + e.message.slice(-120)); } }
  if (Object.keys(alt).length){ fs.writeFileSync('out/alt.json', JSON.stringify(alt)); meta.alt = Object.keys(alt).length; meta.altQuery = okQ; } }

// 3. EDHREC: what players run with each listed commander (plus its budget and expensive pages).
const slug = n => String(n).split(' // ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-');
const names = fs.readFileSync('tools/commanders.txt', 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')); meta.edhrec = {};
for (const n of names){ const s = slug(n); meta.edhrec[n] = [];
  for (const [suffix, path] of [['', s], ['.budget', s + '/budget'], ['.expensive', s + '/expensive']]){
    try { const j = await get('https://json.edhrec.com/pages/commanders/' + path + '.json', 3); if (j){ fs.writeFileSync('out/edhrec/' + s + suffix + '.json', JSON.stringify(j)); meta.edhrec[n].push(suffix || 'main'); } } catch (e) { meta.notes.push('edhrec ' + path + ': ' + e.message); }
    await sleep(400); } }
// Combos the app reads for finishing routes (Commander Spellbook); see tools/build-combos.mjs.
try { const {buildCombos} = await import('./build-combos.mjs'); const c = await buildCombos(); fs.writeFileSync('out/combos.json.gz', zlib.gzipSync(JSON.stringify(c))); meta.combos = c.combos.length; } catch (e) { meta.notes.push('combos: ' + e.message); }
fs.writeFileSync('out/meta.json', JSON.stringify(meta, null, 1)); console.log(JSON.stringify(meta, null, 1));
