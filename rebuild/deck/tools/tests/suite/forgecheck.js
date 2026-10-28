// Checks the rules reader (engine/rules.js) against Forge's hand-written card scripts (tools/rules/data/forge-cards.json.gz,
// GPL, kept in tests only): for every Commander card both know, does the reader find the same number of triggered, activated,
// mana and replacement abilities, and do its triggers listen for the same events? node forgecheck.js <engineDir> [precons]
// EX=<kind> prints example disagreements of that kind (triggered, activated, mana, replacement, event).
const path = require('path'), fs = require('fs'), zlib = require('zlib'), dir = path.resolve(process.argv[2] || '../candidate');
const H = require('./h.js')(dir), X = H.ctx, run = H.run;
if (run('typeof rrRead') !== 'function') require('vm').runInContext(fs.readFileSync(path.join(dir, 'engine/rules.js'), 'utf8'), X, {filename:'rules.js'});
const rr = run('rrRead'), FORGE = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'tools/rules/data/forge-cards.json.gz')))).cards;
const field = (line, k) => { const m = new RegExp('\\b' + k + '\\$ ?([^|]*)').exec(line); return m ? m[1].trim() : ''; };
// Forge's trigger modes, mapped onto the reader's event names (null = no counterpart the reader names; left out of the check)
function forgeEvent(t){
  const mode = field(t, 'Mode'), o = field(t, 'Origin'), d = field(t, 'Destination'), v = field(t, 'ValidCard');
  switch (mode){
    case 'ChangesZone': case 'ChangesZoneAll':
      if (/Battlefield/.test(d) && !/Battlefield/.test(o)) return /^Land/.test(v) ? 'landfall' : 'enters';
      if (/Battlefield/.test(o) && /^Graveyard$/.test(d)) return 'dies';
      if (/Battlefield/.test(o)) return 'leaves';
      if (/Graveyard/.test(d)) return 'to-graveyard';
      return null;
    case 'Phase': return 'beginning-of';
    case 'Attacks': case 'AttackersDeclared': case 'AttackersDeclaredOneTarget': return 'attacks';
    case 'Blocks': case 'AttackerBlocked': case 'AttackerBlockedByCreature': return 'blocks';
    case 'DamageDone': case 'DamageDoneOnce': case 'DamageDealtOnce': case 'DamageAll': return 'damage';
    case 'SpellCast': case 'SpellCastOrCopy': return /Card\.Self/.test(v) ? 'cast-self' : 'cast';
    case 'Drawn': return 'draw';
    case 'LifeGained': return 'gain-life';
    case 'LifeLost': case 'LifeLostAll': return 'lose-life';
    case 'Sacrificed': return 'sacrifice';
    case 'Discarded': case 'DiscardedAll': return 'discard';
    case 'Taps': return 'tapped';
    case 'TapsForMana': return 'tapped-for-mana';
    case 'Untaps': return 'untapped';
    case 'BecomesTarget': case 'BecomesTargetOnce': return 'targeted';
    case 'Cycled': return 'cycle';
    case 'TokenCreated': case 'TokenCreatedOnce': return 'token-created';
    case 'CounterAdded': case 'CounterAddedOnce': case 'CounterAddedAll': return 'counters-placed';
    case 'LandPlayed': return 'landfall';
    case 'AbilityCast': case 'AbilityActivated': return 'activate';
    case 'Scry': case 'Surveil': return 'scry';
    case 'Explored': return 'explore';
    case 'BecomeMonarch': return 'monarch';
  }
  return null;
}
// The reader's events folded the same way (damage to a player is still damage; every "beginning of" is one)
const fold = e => /^beginning-of/.test(e) ? 'beginning-of' : e === 'combat-damage-player' ? 'damage' : e;
function forgeCount(c){
  const n = {triggered:0, activated:0, mana:0, replacement:0}, ev = [];
  for (const t of c.T || []){ if (/Static\$ True/.test(t) || !/TriggerDescription\$/.test(t)) continue; n.triggered++; ev.push(forgeEvent(t)); }
  for (const a of c.A || []){ if (/^SP\$/.test(a)) continue; if (/^AB\$ Mana\b/.test(a)) n.mana++; else n.activated++; }
  for (const r of c.R || []) if (/Description\$/.test(r) && !/Secondary\$ True/.test(r)) n.replacement++;
  return {n, ev};
}
function readerCount(r){
  const n = {triggered:0, activated:0, mana:0, replacement:0}, ev = [];
  const walk = abs => { for (const a of abs || []){ const k = a.kind === 'loyalty' ? 'activated' : a.kind;
    if (k === 'triggered'){ const t = a.trigger || {}; [t.event || 'unknown'].concat(t.also || []).forEach(e => { n.triggered++; ev.push(fold(e)); }); }
    else if (k in n) n[k]++; } };
  walk(r.abilities); return {n, ev};
}
let list = run('LIB').filter(c => c.cmd);
if (process.argv[3] === 'precons'){ const seen = new Set(); list = [];
  for (const s of ['avengers-assemble', 'doom-prevails', 'tramplesaurus-rex', 'turtle-power', 'wakanda-forever']) H.retail(s).cards.forEach(e => { const c = X.find(e.n); if (c && !seen.has(c.n)){ seen.add(c.n); list.push(c); } }); }
const kinds = ['triggered', 'activated', 'mana', 'replacement'], agree = {}, total = {}, ex = {};
kinds.concat('event').forEach(k => { agree[k] = 0; total[k] = 0; ex[k] = []; });
let cards = 0, allAgree = 0;
for (const c of list){
  const f = FORGE[c.n]; if (!f || f.faces || /\n\/\/|\/\//.test(c.n)) continue; const r = rr(c); if (r.faces) continue;
  if (r.unknown.length) continue; // only cards the reader says it read fully: an unread sentence is already counted elsewhere
  cards++; const F = forgeCount(f), R = readerCount(r); let all = true;
  for (const k of kinds){ total[k]++; if (F.n[k] === R.n[k]) agree[k]++; else { all = false; ex[k].push(c.n + ': forge ' + F.n[k] + ', reader ' + R.n[k]); } }
  if (F.n.triggered === R.n.triggered && F.ev.every(Boolean)){ total.event++; const a = F.ev.slice().sort().join(), b = R.ev.slice().sort().join();
    if (a === b) agree.event++; else { all = false; ex.event.push(c.n + ': forge ' + a + ' | reader ' + b); } }
  if (all) allAgree++;
}
console.log('forge agreement over ' + cards + ' fully read cards:');
for (const k of kinds.concat('event')) console.log('  ' + k.padEnd(12) + ' ' + (100 * agree[k] / Math.max(1, total[k])).toFixed(1) + '%  (' + (total[k] - agree[k]) + ' differ)');
console.log('cards agreeing on everything: ' + allAgree + ' of ' + cards + ' (' + (100 * allAgree / Math.max(1, cards)).toFixed(1) + '%)');
if (process.env.EX) (ex[process.env.EX] || []).slice(0, +(process.env.N || 25)).forEach(s => console.log('  - ' + s));
