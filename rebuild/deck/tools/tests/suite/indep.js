// Independent checker. Shares NO code with the app engine: it rebuilds card identity from the raw Scryfall records in the
// frozen snapshot, the alternate printed-name lists and the official ban policy, then checks decks and recommendations.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const SNAP = path.resolve(__dirname, '../snapshot'), FIX = path.resolve(__dirname, '../fixtures');
const RAW = JSON.parse(zlib.gunzipSync(fs.readFileSync(SNAP + '/cards.json.gz')));
const BAN = JSON.parse(fs.readFileSync(FIX + '/commander_ban_policy.json'));
const key = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Identity source: the handoff's legality snapshot (every Oracle record, including banned and not_legal ones), joined by
// Oracle ID to the scoring snapshot for rules text and prices. Full card names are indexed before face names, so a face of
// another card ("Dirgur Focusmage // Braingeyser") can never take a real card's name. Token/art/emblem records never take a
// name either (ID-06: Llanowar Elves the creature, not its token).
const LEG = JSON.parse(fs.readFileSync(FIX + '/Commander_Card_Legality_Snapshot.json')).records;
const rawById = new Map(); RAW.forEach(o => rawById.set(o.oracle_id, o));
const byName = new Map(), conflicts = [];
const playable = r => !/token|emblem|art_series|vanguard|scheme|planar|double_faced_token|front_card/.test(r.layout || '');
const recs = LEG.filter(playable).map(r => { const o = rawById.get(r.oracleId) || {}; return {oracle_id:r.oracleId, name:r.name, type_line:r.typeLine, color_identity:r.colorIdentity, layout:r.layout, status:r.commanderFormatStatus,
  oracle_text:o.oracle_text != null ? o.oracle_text : (o.card_faces || []).map(x => x.oracle_text || '').join(' // '), prices:o.prices || {}, power:o.power != null ? o.power : (o.card_faces && o.card_faces[0] ? o.card_faces[0].power : null), inScoring:!!o.oracle_id}; });
const ambiguous = new Set();
for (const r of recs){ const k = key(r.name), had = byName.get(k);
  if (!had){ byName.set(k, r); continue; } if (had.oracle_id === r.oracle_id) continue;
  // Same name, different card: the Commander-legal one wins; otherwise the name is ambiguous and is reported, never guessed.
  const hl = had.status === 'legal', rl = r.status === 'legal';
  if (rl && !hl) byName.set(k, r); else if (hl === rl){ ambiguous.add(k); conflicts.push([r.name, had.oracle_id, r.oracle_id]); } }
for (const r of recs) if (r.name.includes(' // ')) r.name.split(' // ').forEach(fn => { const k = key(fn); if (!byName.has(k)) byName.set(k, r); });
// Alternate printed names: the snapshot's Scryfall flavor-name list plus the handoff's verified mappings.
const altFrom = {}; Object.assign(altFrom, JSON.parse(fs.readFileSync(SNAP + '/alt.json')));
{ const M = JSON.parse(fs.readFileSync(FIX + '/Printed_Name_Mappings.json')).mappings; for (const p in M) altFrom[p] = M[p].name; }
function resolve(name){
  const k = key(name); if (ambiguous.has(k)) return {o:null, via:'ambiguous'}; let o = byName.get(k); if (o) return {o, via:'name'};
  const real = Object.keys(altFrom).find(a => key(a) === k); if (real){ o = byName.get(key(altFrom[real])); if (o) return {o, via:'alt'}; }
  return {o:null, via:'unresolved'};
}
const idOf = name => { const r = resolve(name); return r.o ? r.o.oracle_id : 'unresolved:' + key(name); };

const bannedIds = new Set(BAN.namedBans.map(b => b.oracleId));
BAN.categories.forEach(c => (c.bannedStatusExpansion || c.snapshotExpansion || c.expansion || []).concat(c.additionalNotLegalRecords || []).forEach(b => bannedIds.add(b.oracleId)));
const price = o => { const p = o.prices || {}; const v = parseFloat(p.usd); return isNaN(v) ? null : v; };   // nonfoil USD only: one comparable basis
function legality(o){
  if (!o) return 'unresolved_identity';
  if (bannedIds.has(o.oracle_id)) return 'named_or_category_ban';
  if (/\bConspiracy\b/.test(o.type_line || '')) return 'category_ban';
  if (/\bante\b/i.test(o.oracle_text || '')) return 'category_ban';
  if (o.status === 'banned') return 'format_banned_status';
  if (o.status !== 'legal') return 'format_not_legal';
  return '';
}
const ciOf = o => o.color_identity || [];
const BASIC_TYPES = {Plains:'W', Island:'U', Swamp:'B', Mountain:'R', Forest:'G'};
const isBasicName = n => /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(n);
const anyNumber = o => /a deck can have any number of cards named/i.test(o.oracle_text || '');
const upTo = o => { const m = /a deck can have up to (\w+) cards named/i.exec(o.oracle_text || ''); if (!m) return 0; const w = {one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10}; return w[m[1].toLowerCase()] || +m[1] || 0; };
const isLand = o => /\bLand\b/.test(((o.type_line || '').split(' // ')[0]));

// Full-deck check: commanders [names], cards [{n,q}] (the 99 or 98).
function validateDeck(commanders, cards){
  const v = [], cmdR = commanders.map(resolve);
  cmdR.forEach((r, i) => { if (!r.o) v.push(['unresolved_identity', commanders[i]]); else { const L = legality(r.o); if (L) v.push([L, commanders[i]]);
    const t = r.o.type_line || '', front = t.split(' // ')[0], ok = /Legendary/.test(front) && (/Creature/.test(front) || ((/Vehicle|Spacecraft/.test(front)) && r.o.power != null)) || /can be your commander/i.test(r.o.oracle_text || '');
    if (!ok) v.push(['commander_ineligible', commanders[i]]); } });
  const ident = new Set(); cmdR.forEach(r => r.o && ciOf(r.o).forEach(c => ident.add(c)));
  let total = commanders.length; const seen = new Map();
  for (const e of cards){ total += e.q; const r = resolve(e.n); if (!r.o){ v.push(['unresolved_identity', e.n]); continue; }
    const L = legality(r.o); if (L) v.push([L, e.n]);
    if (!ciOf(r.o).every(c => ident.has(c))) v.push(['off_color_identity', e.n]);
    const types = ((r.o.type_line || '').split('—')[1] || '').split(/\s+/); types.forEach(t => { if (BASIC_TYPES[t] && !ident.has(BASIC_TYPES[t])) v.push(['land_type_color_invalid', e.n]); });
    seen.set(r.o.oracle_id, (seen.get(r.o.oracle_id) || 0) + e.q);
    const cap = isBasicName(r.o.name) || anyNumber(r.o) ? Infinity : upTo(r.o) || 1; if (seen.get(r.o.oracle_id) > cap) v.push(['singleton_conflict', e.n]); }
  cmdR.forEach(r => { if (r.o && seen.has(r.o.oracle_id)) v.push(['singleton_conflict', r.o.name + ' (commander also in deck)']); });
  if (total !== 100) v.push(['wrong_deck_size', total]);
  return v;
}
// Apply pairs to a copy of the deck (cuts must exist; adds must not be installed), then validate the result.
function applyPairs(cards, pairs){
  const m = new Map(); cards.forEach(e => { const id = idOf(e.n); m.set(id, {n:e.n, q:(m.get(id) || {q:0}).q + e.q}); }); const v = [];
  for (const p of pairs){ const ci = idOf(p.cut), ai = idOf(p.add); const c = m.get(ci);
    if (!c || c.q < 1){ v.push(['cut_absent_or_repeated', p.cut]); continue; } if (m.has(ai) && !isBasicName(p.add)){ v.push(['installed_addition', p.add]); }
    c.q -= 1; if (!c.q) m.delete(ci); const a = m.get(ai); if (a) a.q += 1; else m.set(ai, {n:p.add, q:1}); }
  return {cards:[...m.values()], v};
}
// Recommendation-output checks (product rules): installed additions, uniqueness, legality/colour, strict tier prices.
function checkRecs(commanders, cards, rows){
  const v = [], ident = new Set(); commanders.map(resolve).forEach(r => r.o && ciOf(r.o).forEach(c => ident.add(c)));
  const installed = new Set(cards.map(e => idOf(e.n)).concat(commanders.map(idOf))), shown = new Map();
  for (const r of rows){ for (const t of ['apex', 'mid', 'budget']){ const n = r.opts[t]; if (!n) continue; const R = resolve(n);
    if (!R.o){ v.push(['unresolved_recommendation', n]); continue; } const id = R.o.oracle_id;
    if (installed.has(id)) v.push(['installed_addition', n + ' (for ' + r.cut + ', ' + t + ')']);
    if (shown.has(id)) v.push(['repeated_recommendation', n + ' in ' + shown.get(id) + ' and ' + r.cut + '/' + t]); else shown.set(id, r.cut + '/' + t);
    const L = legality(R.o); if (L) v.push([L, n]);
    if (!ciOf(R.o).every(c => ident.has(c))) v.push(['off_color_identity', n]);
    const p = price(R.o), ap = r.opts.apex ? price((resolve(r.opts.apex).o) || {}) : null;
    if (t === 'budget' && !(p != null && p < 3)) v.push(['tier_price_invalid', n + ' budget $' + p]);
    if (t === 'mid' && !(p != null && p < 12)) v.push(['tier_price_invalid', n + ' mid $' + p]);
    if (t !== 'apex' && !r.opts.apex) v.push(['tier_without_apex', n + ' (' + t + ' for ' + r.cut + ')']);
    // When this checker's own price list lacks one of the two cards it cannot judge the pair; that is reported, not counted as a breach.
    else if (t !== 'apex' && (p == null || ap == null)) v.push(['price_unverifiable', n + ' $' + p + ' vs Apex ' + r.opts.apex + ' $' + ap]);
    else if (t !== 'apex' && !(p < ap)) v.push(['not_cheaper_than_apex', n + ' $' + p + ' vs Apex ' + r.opts.apex + ' $' + ap]); }
    if (r.opts.apex && [r.opts.mid, r.opts.budget].some(x => x && idOf(x) === idOf(r.opts.apex))) v.push(['apex_repeated_in_tier', r.opts.apex]); }
  return v;
}
function readRetail(slugName){
  let zone = '', cmd = [], cards = [];
  for (const l of fs.readFileSync(FIX + '/retail-' + slugName + '.txt', 'utf8').split('\n')){ const s = l.trim(); if (!s) continue; if (s === 'Commander' || s === 'Deck'){ zone = s; continue; }
    const m = /^(\d+)\s+(.+)$/.exec(s); if (!m) continue; if (zone === 'Commander') cmd.push(m[2]); else cards.push({n:m[2], q:+m[1]}); }
  return {commanders:cmd, cards};
}
module.exports = {resolve, idOf, legality, validateDeck, applyPairs, checkRecs, readRetail, price, isLand, conflicts, key};
