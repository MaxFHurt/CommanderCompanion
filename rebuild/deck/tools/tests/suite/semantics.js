// Required semantic fixtures (roadmap §5). Each expectation was written from the card's current Oracle text, quoted below.
// node semantics.js <engineDir>
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const fx = n => run('effectsOf')(X.find(n)), roles = n => [...run('tags')(X.find(n)).roles], needs = n => run('needsOf')(X.find(n));
const kinds = n => fx(n).effects.map(e => e.kind);
let pass = 0, fail = 0; const ok = (name, cond, info) => { if (cond) pass++; else fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ← ' + JSON.stringify(info))); };
// Return of the Wildspeaker — "Choose one — • Draw cards equal to the greatest power among non-Human creatures you control.
// • Non-Human creatures you control get +3/+3 until end of turn."
{ const f = fx('Return of the Wildspeaker'); ok('Wildspeaker is modal', f.modal); ok('Wildspeaker draw scales with non-Human power', f.effects.some(e => e.kind === 'draw' && /non-Human/.test(e.scale)), f.effects);
  ok('Wildspeaker pump is for non-Humans only', f.effects.some(e => e.kind === 'pump' && /non-?human/i.test(e.who) && e.until === 'turn'), f.effects); ok('Wildspeaker needs non-Human creatures', needs('Return of the Wildspeaker').includes('nonHuman'));
  ok('Wildspeaker counts as a finisher (mass pump)', run('isFinisher')(X.find('Return of the Wildspeaker')));
  const av = H.retail('avengers-assemble'); X.__d = av; X.__k = 'nonHuman'; const s = run('supportOf(__d, __k)'); ok('Captain America deck: non-Human share is low (' + s.have + ')', s.have < 0.5, s); }
// Queen Mother Ramonda — "When Queen Mother Ramonda enters, you become the monarch. As long as you're the monarch, creatures
// with power 2 or less can't attack you."
{ ok('Ramonda: becoming the monarch is read', kinds('Queen Mother Ramonda').includes('monarch'), fx('Queen Mother Ramonda')); ok('Ramonda counts as card draw (monarch draws each end step)', roles('Queen Mother Ramonda').includes('draw')); }
// Mystic Forge — "You may look at the top card of your library any time. You may cast artifact spells and colorless spells from
// the top of your library. {T}, Pay 1 life: Exile the top card of your library."
{ const f = fx('Mystic Forge'); ok('Mystic Forge: top-library casting, artifact/colorless only', f.effects.some(e => e.kind === 'topcast' && /artifact/.test(e.filter) && /colorless/.test(e.filter)), f.effects);
  ok('Mystic Forge: is not card draw', !roles('Mystic Forge').includes('draw')); ok('Mystic Forge: exiling the top card is not draw or impulse', f.effects.some(e => e.kind === 'mill-self') && !f.effects.some(e => e.kind === 'impulse' || e.kind === 'draw'), f.effects);
  ok('Mystic Forge needs artifact spells', needs('Mystic Forge').includes('artifactSpells')); }
// Heliod's Intervention — "Choose one — • Destroy X target artifacts and/or enchantments. • Target player gains twice X life."
{ const f = fx('Heliod\'s Intervention'); ok('Heliod\'s Intervention is modal', f.modal); ok('Heliod\'s Intervention: X-target artifact/enchantment removal at instant speed', f.effects.some(e => e.kind === 'removal' && e.count === 'x' && /artifact/.test(e.hits) && /enchantment/.test(e.hits) && e.speed === 'instant'), f.effects);
  ok('Heliod\'s Intervention: lifegain mode', f.effects.some(e => e.kind === 'lifegain')); ok('Heliod\'s Intervention counts as removal', roles('Heliod\'s Intervention').includes('removal')); }
// T'Challa — "create a tapped Vibranium token. (It's an artifact with indestructible and "{T}: Add {C}. This mana can't be
// spent to cast a nonartifact spell.")"
{ const f = fx('T\'Challa, the Black Panther'); ok('Vibranium mana is restricted to artifact spells', f.effects.some(e => e.kind === 'mana' && e.restrict === 'artifact' && e.source === 'token' && e.tapped), f.effects);
  ok('Vibranium token is not a creature token', f.effects.some(e => e.kind === 'token' && !e.creature && /Vibranium/.test(e.what)), f.effects);
  const w = H.retail('wakanda-forever'); X.__d = w; X.__k = 'creatureTokens'; const before = run('supportOf(__d, __k)').have; X.__q = JSON.parse(JSON.stringify(w)); run("addCard(__q, \"Shuri's Fabricator\", 0)");
  ok('Vibranium makers add nothing to creature-token support for Divine Visitation', ['The Great Mound', 'Vibranium Mining Mech', 'Dora Milaje Elite', 'Shuri\'s Fabricator'].every(n => !fx(n).effects.some(e => e.kind === 'token' && e.creature)), ['The Great Mound', 'Vibranium Mining Mech'].map(fx));
  ok('Divine Visitation needs creature tokens', needs('Divine Visitation').includes('creatureTokens')); }
// Selvala, Heart of the Wilds — "Whenever another creature enters, its controller may draw a card if its power is greater than
// each other creature's power. {G}, {T}: Add X mana in any combination of colors, where X is the greatest power among creatures you control."
{ const f = fx('Selvala, Heart of the Wilds'); ok('Selvala: the draw is symmetric (its controller), not yours', f.effects.some(e => e.kind === 'draw' && e.symmetric), f.effects); ok('Selvala does not count as your card draw', !roles('Selvala, Heart of the Wilds').includes('draw'));
  ok('Selvala: mana costs {G} and a tap, X = greatest power, summoning sick', f.effects.some(e => e.kind === 'mana' && e.amount === 'X' && /\{G\}/.test(e.cost) && e.sick), f.effects); ok('Selvala counts as ramp', roles('Selvala, Heart of the Wilds').includes('ramp')); }
// Greater Good — "Sacrifice a creature: Draw cards equal to the sacrificed creature's power, then discard three cards."
{ const f = fx('Greater Good'); ok('Greater Good: draw scales with sacrificed power, then discards three', f.effects.some(e => e.kind === 'draw' && e.discard === 3 && /power/.test(e.scale) && /Sacrifice a creature/.test(e.cost)), f.effects);
  ok('Greater Good is a sacrifice outlet', f.effects.some(e => e.kind === 'sac-outlet' && e.what === 'creature'), f.effects); ok('Greater Good wants big creatures', needs('Greater Good').includes('bigPower')); }
// Filtering is not card draw: Merfolk Looter "{T}: Draw a card, then discard a card."; connive.
{ ok('Looting is filtering', kinds('Merfolk Looter').includes('filter') && !roles('Merfolk Looter').includes('draw')); ok('Target player draws (Sign in Blood) is still your draw', roles('Sign in Blood').includes('draw'));
  ok('Smothering Tithe: an opponent drawing is the trigger, not your draw', !fx('Smothering Tithe').effects.some(e => e.kind === 'draw')); ok('Beast Within\'s token is the opponent\'s', fx('Beast Within').effects.some(e => e.kind === 'token' && !e.mine)); }
// Commander profiles: reviewed against the current text, with their needs met by the retail decks.
for (const [slug, cmd] of [['avengers-assemble', 'Captain America, Team Leader'], ['doom-prevails', 'Doctor Doom, King of Latveria'], ['tramplesaurus-rex', 'Ghalta, Primal Hunger'], ['turtle-power', 'Leonardo, the Balance'], ['wakanda-forever', 'T\'Challa, the Black Panther']]){
  const p = run('profileOf')(X.find(cmd)); ok(cmd + ': profile reviewed for current text', p && p.reviewed, p);
  const d = H.retail(slug); X.__d = d; ok(cmd + ': retail deck meets its needs', p.needs.every(k => { X.__k = k; const s = run('supportOf(__d, __k)'); return s.have >= s.min; }), p.needs.map(k => { X.__k = k; return [k, run('supportOf(__d, __k)')]; })); }
ok('Doctor Doom: only your own land discards (the need is landDiscard, not opponent discard)', needs('Doctor Doom, King of Latveria').includes('landDiscard') && /you discard/.test(X.find('Doctor Doom, King of Latveria').o));
ok('Ghalta: cost reduction by total power is read', fx('Ghalta, Primal Hunger').effects.some(e => e.kind === 'cost' && e.how === 'total power'));
ok('Leonardo: any token counts (not only creature tokens)', needs('Leonardo, the Balance').includes('tokens') && !needs('Leonardo, the Balance').includes('creatureTokens'));
// Version 0.9.2 (owner's iPad report, 19 Oct: The Ozolith "doesn't feed" a +1/+1 counters deck). The Ozolith — "Whenever a creature
// you control leaves the battlefield, if it had counters on it, put those counters on The Ozolith. ... move all counters from The
// Ozolith onto target creature." Chatterfang — "If one or more tokens would be created under your control, those tokens plus that
// many 1/1 green Squirrel creature tokens are created instead." Gratuitous Violence — "deals double that damage instead".
// Unnatural Growth — "double the power and toughness of each creature you control".
{ const th = n => run('tags')(X.find(n)).th; ok('The Ozolith is a counters card', th('The Ozolith').counters === 1, th('The Ozolith')); ok('Fate Transfer (moves counters) is a counters card', th('Fate Transfer').counters === 1);
  ok('Chatterfang and Divine Visitation are token cards', th('Chatterfang, Squirrel General').tokens === 1 && th('Divine Visitation').tokens === 1); ok('Gratuitous Violence is an attack card', th('Gratuitous Violence').aggro === 1);
  ok('Fiery Emancipation is a burn card', th('Fiery Emancipation').burn === 1); ok('Unnatural Growth is an attack card', th('Unnatural Growth').aggro === 1);
  ok('Counterspells are not counters cards', th('Counterspell').counters !== 1 && th('Mana Leak').counters !== 1); }
// Unknown text stays unknown: coverage over the five retail decks
{ let n = 0, unk = 0; const seen = new Set(); for (const s of ['avengers-assemble', 'doom-prevails', 'tramplesaurus-rex', 'turtle-power', 'wakanda-forever']) H.retail(s).cards.forEach(e => { const c = X.find(e.n); if (!c || seen.has(c.n) || run('tags')(c).land) return; seen.add(c.n); n++; if (fx(c.n).unknown.length) unk++; });
  console.log('coverage: ' + (n - unk) + ' of ' + n + ' distinct spells in the five retail decks have every sentence read; ' + unk + ' keep some text marked unknown (never given a role from it)'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0;
