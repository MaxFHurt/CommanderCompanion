// Card functions (engine redesign, layer 2): what a card makes for the deck, what it uses or rewards, and the jobs it does,
// all taken from its rules reading (engine/rules.js) instead of from patterns over its text. The words are the answer key's
// (tools/rules/testset/README.md): makes/uses mana, cards, tokens, treasure, counters, life, graveyard, bodies, damage, plus
// the events a card listens for; roles ramp, draw, removal, wipe, counterspell, tutor, protection, recursion, sac-outlet,
// finisher, stax, combat. fnOf(c) caches the result on the card as c._fn; tags(c) passes its 0.9.3 roles as oldRoles.

// The engine settings that make every choice the way 0.9.3 did ("?engine=old", ui/boot.js; the benchmark's baseline)
const ENGINE_OLD = {v2: 0, v2r: null, syn: 0, v2sim: 0, newTh: [], xPlan: 0, poolX: 0, poolRows: 0, aimText: 0};

// every ability of a reading with its effects (a modal ability's modes count as its effects), front and back faces
function fnAbilities(r) {
  const out = [];
  const add = abs => {
    for (const a of abs || []) out.push({a, effects: [].concat(a.effects || [], ...(a.modes || []))});
  };
  add(r.abilities);
  for (const f of r.faces || []) add(f.abilities);
  return out;
}
const FN_YOURS = /\b(?:you control|your)\b/i;
const FN_THEIRS = /\b(?:opponent|an opponent controls|you don't control|target player|each player)\b/i;
// what a wipe hits: every creature (or nonland permanent, artifact...), maybe narrowed ("with power 4 or greater")
const FN_BIG =
  /^(?:(?:other|attacking|nonland|nontoken|non\w+|tapped|untapped),? )*(?:creatures?|permanents?|artifacts?|enchantments?)\b(?! you control)/i;
const FN_KEEPS = /\b(?:indestructible|hexproof|shroud|protection|ward)\b/i;
const FN_OLD = [
  ['ramp', 'ramp'],
  ['draw', 'draw'],
  ['removal', 'removal'],
  ['wipe', 'wipe'],
  ['counter', 'counterspell'],
  ['tutor', 'tutor'],
  ['protect', 'protection']
];
// a target that is not your own permanent ("creature you control"); "you control" further on ("with mana value up to the
// number of counters among permanents you control") does not make it yours
const FN_MINE =
  /^(?:up to \w+ |another |other )*(?:nonland |noncreature |nontoken )?(?:creature|permanent|artifact|enchantment|land|planeswalker)s?(?: or \w+)? you control\b/i;
const fnIsTarget = e => !!((e.target && !FN_MINE.test(e.target.what || '')) || /\btarget\b/i.test(e.what || ''));
const fnLandSearch = e => e.do === 'search' && /\bland\b|\b(?:Plains|Island|Swamp|Mountain|Forest)\b/i.test(e.what || '');
// who keeps a protective keyword: your side, or the creature an Equipment or Aura is on, or a creature you target
const FN_OURS = /\byou control\b|equipped creature|enchanted (?:creature|permanent)|^target\b|^(?:those creatures|it|you)$/i;
// Synergy with the commander (engine v2, UP.syn): the card makes something the commander uses, or uses something the commander
// makes. Mana, cards and damage are left out: every deck uses them. A word a card makes feeds these uses.
const FN_FEEDS = {
  tokens: ['tokens', 'token-created'],
  treasure: ['tokens', 'token-created'],
  counters: ['counters', 'counters-placed', 'creature-leaves-with-counters'],
  bodies: ['bodies', 'creature-dies'],
  graveyard: ['graveyard'],
  life: ['life']
};
function fnSynergy(c, cmd) {
  if (!cmd || c === cmd) return {n: 0, words: []};
  const a = fnOf(c),
    b = fnOf(cmd),
    words = [];
  const feeds = (m, u) => (FN_FEEDS[m] || []).some(x => u.has(x));
  for (const m of a.makes) if (feeds(m, b.uses)) words.push('makes ' + m);
  for (const m of b.makes) if (feeds(m, a.uses) && !words.includes('uses ' + m)) words.push('uses ' + m);
  return {n: words.length, words};
}
function fnOf(c, oldRoles) {
  if (c._fn) return c._fn;
  const r = rrRead(c),
    makes = new Set(),
    uses = new Set(),
    roles = new Set(),
    types = (r.types && r.types.card) || [],
    land = types.includes('land'),
    o = (c.o || '').replace(/\([^()]*\)/g, '');
  for (const {a, effects} of fnAbilities(r)) {
    const t = a.trigger || {},
      ev = [t.event].concat(t.also || []),
      cost = a.cost || [],
      repeat = a.kind === 'triggered' || a.kind === 'activated' || a.kind === 'mana' || a.kind === 'static';
    // ---- what it listens for ----
    if (a.kind === 'triggered') {
      if (ev.includes('cast') && t.controller === 'opponent') uses.add('opponent-casts');
      if (ev.includes('draw') && t.controller === 'opponent') uses.add('opponent-draws');
      if (ev.includes('dies') && !/^~ dies/i.test(t.subject || '')) uses.add('creature-dies');
      if (ev.includes('leaves') && /counters? on it/i.test(t.subject || '')) uses.add('creature-leaves-with-counters');
      if (ev.includes('token-created')) uses.add('token-created');
      if (ev.includes('counters-placed')) uses.add('counters-placed');
      if (ev.includes('combat-damage-player')) uses.add('combat-damage');
      if (ev.includes('landfall')) uses.add('landfall');
      if (ev.includes('gain-life')) uses.add('life');
    }
    if (a.kind === 'replacement') {
      if (a.event === 'create-token') (uses.add('token-created'), makes.add('tokens'));
      if (a.event === 'put-counters') (uses.add('counters-placed'), makes.add('counters'));
      if (a.event === 'deal-damage') (uses.add('combat-damage'), makes.add('damage'), roles.add('combat'));
      if (a.event === 'create-token' && /creature/i.test((a.instead || {}).plus || '')) makes.add('bodies');
    }
    // ---- what it pays ----
    for (const k of cost) {
      if (k.sacrifice) {
        const w = k.sacrifice.what || '';
        if (/creature|permanent|artifact|\b[A-Z][a-z]+s?\b/.test(w) && !/^~$/.test(w)) {
          uses.add('tokens');
          if (/creature|permanent|[A-Z][a-z]+s\b/.test(w)) uses.add('bodies');
          if (
            /^(?:another |other |two other |x )?(?:artifacts?|creatures?|permanents?)(?: (?:or|and\/or) (?:artifacts?|creatures?))?$/i.test(
              w.trim()
            ) &&
            !land
          )
            roles.add('sac-outlet');
        }
      }
      if (k['remove-counters']) uses.add('counters');
      if (k['exile-from-graveyard']) uses.add('graveyard');
      if (k.discard) uses.add('cards');
    }
    if (a.kind === 'mana' && !land) (makes.add('mana'), roles.add('ramp'));
    if (a.kind === 'mana' && land) makes.add('mana');
    // ---- what it does ----
    for (const e of effects) {
      const w = e.what || (e.target && e.target.what) || e.all || '',
        theirs = fnIsTarget(e) || (e.all && !FN_YOURS.test(e.all));
      switch (e.do) {
        case 'add-mana':
          makes.add('mana');
          // a mana rock or dork, or a ritual that makes more than it costs (three or more, or one for each of something)
          if (!land && (repeat || /\{[^}]+\}\{[^}]+\}\{/.test(e.mana || '') || /\badd [^.]* for each\b/i.test(o)))
            roles.add('ramp');
          break;
        case 'search':
          if (fnLandSearch(e)) {
            makes.add('mana');
            if (!land) roles.add('ramp');
            if (/\bhand\b/i.test(o) && /\btwo\b/i.test(w)) makes.add('cards');
          } else if (e.from !== 'graveyard') (makes.add('cards'), roles.add('tutor'));
          break;
        case 'extra-land':
          if (!land) roles.add('ramp');
          break;
        case 'draw':
          if (!e.who || !/opponent/i.test(e.who)) (makes.add('cards'), roles.add('draw'));
          break;
        case 'may-play-exiled':
        case 'monarch':
        case 'initiative':
          makes.add('cards');
          if (repeat || e.do !== 'may-play-exiled') roles.add('draw');
          break;
        case 'create-token': {
          const tk = e.token || '';
          makes.add('tokens');
          if (/\bAdd \{/.test(e.ability || '') && !land) (makes.add('mana'), roles.add('ramp'));
          if (/treasure/i.test(tk) || /\bcreate [^.]*\bTreasure token/.test(o))
            (makes.add('treasure'), makes.add('mana'), !land && roles.add('ramp'));
          else if (/creature|\d+\/\d+/i.test(tk)) makes.add('bodies');
          break;
        }
        case 'put-counters':
          if (/^-1\/-1$/.test(e.kind || '') && /\btarget\b/i.test(e.on || '')) roles.add('removal');
        case 'proliferate':
        case 'double-counters':
        case 'move-counters':
        case 'amass':
          makes.add('counters');
          if (e.do === 'move-counters' || e.do === 'proliferate') uses.add('counters');
          break;
        case 'gain-life':
          makes.add('life');
          break;
        case 'lose-life':
        case 'damage':
          if (!/\byou\b/.test(e.who || '') || /opponent|player|each/i.test(w + ' ' + (e.who || ''))) makes.add('damage');
          if (e.do === 'damage' && fnIsTarget(e) && /creature|permanent|planeswalker|any target/i.test(w)) roles.add('removal');
          if (e.do === 'damage' && e.all && /creature/i.test(e.all)) roles.add('wipe');
          if (
            a.kind === 'triggered' &&
            ev.some(x => ['dies', 'cast', 'enters', 'gain-life', 'token-created', 'sacrifice'].includes(x)) &&
            !/^~/.test(t.subject || '')
          )
            roles.add('finisher');
          break;
        case 'destroy':
        case 'exile':
        case 'bounce':
        case 'tuck':
          // overload: one target, or (for the overload cost) all of them
          if (fnIsTarget(e) && r.abilities.some(x => x.kind === 'keyword' && x.name === 'overload')) roles.add('wipe');
          if (e.all && FN_BIG.test(e.all)) roles.add('wipe');
          else if (
            theirs &&
            /creature|permanent|artifact|enchantment|planeswalker|land|nonland/i.test(w) &&
            (!/card/i.test(w) || /permanent/i.test(w))
          )
            roles.add('removal');
          else if (/^(?:that creature|enchanted (?:creature|permanent))$/i.test(w) && e.do !== 'bounce') roles.add('removal');
          if (/\bspells?\b(?! you control)/i.test(w) && !/\bcards?\b/i.test(w) && (fnIsTarget(e) || e.all))
            roles.add('counterspell');
          if (e.do === 'exile' && /graveyard/i.test(w)) uses.add('graveyard');
          // "chooses a creature you don't control" then destroys it (Sadistic Shell Game)
          if (
            /\bchooses? (?:a|an) creature you don't control\b|\bchoose (?:any number of|up to \w+|two) target creatures[^.]*\.\s*(?:destroy|return) (?:the chosen|those) creatures/i.test(
              o
            )
          )
            roles.add('removal');
          break;
        case 'sacrifice':
          // an edict: someone else sacrifices; all of them is a wipe
          if (
            /\b(?:each (?:other )?player|each opponent|target (?:player|opponent)|that player|defending player)\b/i.test(
              e.who || ''
            )
          ) {
            if (/^(?:all|the rest)$/i.test(e.count || '') || rrNum(e.count) >= 3) roles.add('wipe');
            else if (/creature|permanent|planeswalker|artifact|enchantment/i.test(w)) roles.add('removal');
          }
          break;
        case 'lose-abilities':
        case 'restrict':
          if (
            /^enchanted (?:creature|permanent)$/i.test(e.who || w) ||
            (a.kind === 'static' &&
              /^enchanted creature\b/i.test(o.split('\n').find(l => /can't attack|loses all abilities/i.test(l)) || ''))
          )
            roles.add('removal');
          if (e.do === 'restrict' && a.kind === 'static' && FN_THEIRS.test(w + ' ' + (e.who || ''))) roles.add('stax');
          break;
        case 'fight':
        case 'gain-control':
          if (fnIsTarget(e) || e.do === 'fight') roles.add('removal');
          break;
        case 'pump':
          if (/^-/.test(String(e.toughness || '')) && /\btarget\b/i.test(e.who || '')) roles.add('removal');
          if (
            /^-/.test(String(e.toughness || '')) &&
            /^(?:all|each) (?:other )?creatures?\b|creatures your opponents control/i.test(e.who || '')
          )
            roles.add('wipe');
          if (
            /creatures you control|other creatures you control/i.test(e.who || '') &&
            (/X/.test(e.power || '') || +(e.power || 0) >= 2)
          )
            (makes.add('damage'), uses.add('bodies'), roles.add('finisher'));
          if (/X is the number of creatures you control|for each creature you control/i.test(o))
            (uses.add('bodies'), uses.add('tokens'));
          break;
        case 'grant':
          if (/creatures you control/i.test(e.who || '') && (e.keywords || []).some(k => /double strike|trample/i.test(k)))
            (makes.add('damage'), uses.add('bodies'), roles.add('finisher'));
          if (FN_OURS.test(e.who || '') && ((e.keywords || []).some(k => FN_KEEPS.test(k)) || FN_KEEPS.test(e.ability || '')))
            roles.add('protection');
          // a mana ability given to your creatures, lands or equipped creature (Cryptolith Rite, Paradise Mantle)
          if (/\bAdd \{|\badd one mana\b|\bTreasure token/i.test(e.ability || '') && !land)
            (makes.add('mana'), roles.add('ramp'));
          // "When this creature dies, return it to the battlefield" given to your creature
          if (/\bdies, return it to the battlefield\b/i.test(e.ability || '')) roles.add('protection');
          break;
        case 'counter':
          // "Counter target spell that targets a permanent you control" also protects
          roles.add('counterspell');
          if (/\bthat targets (?:you|a (?:creature|permanent) you control)/i.test(w)) roles.add('protection');
          break;
        case 'regenerate':
          if (/\b(?:each|all) creatures? you control\b/i.test(o)) roles.add('protection');
          break;
        case 'return-to-battlefield':
        case 'cheat-into-play':
          if (e.do === 'cheat-into-play' && /\bput (?:a|up to \w+) lands? cards? from your hand onto the battlefield/i.test(o)) {
            if (!land) roles.add('ramp');
            break;
          }
          // a blink: exile your own permanent and return it (saves it from removal)
          if (e.do === 'return-to-battlefield' && /\bexile [^.]*\btargets? [^.]*you control[^.]*then return/i.test(o))
            roles.add('protection');
          // "return each creature card put there from the battlefield this turn" (Into the Pit style undo)
          if (e.do === 'return-to-battlefield' && /put there from the battlefield this turn/i.test(o)) roles.add('protection');
          makes.add('bodies');
          if (e.do === 'return-to-battlefield' && /graveyard/i.test(o)) (uses.add('graveyard'), roles.add('recursion'));
          break;
        case 'regrow':
        case 'cast-from-graveyard':
        case 'play-from-graveyard':
          (uses.add('graveyard'), roles.add('recursion'));
          if (e.do === 'regrow') makes.add('cards');
          break;
        case 'mill':
        case 'surveil':
          makes.add('graveyard');
          break;
        case 'discard':
          if (!e.who || /\byou\b/.test(e.who)) makes.add('graveyard');
          break;
        case 'prevent-damage':
          if (/\bprevent all (?:combat )?damage\b|\bwould be dealt to (?:another )?creatures? you control\b/i.test(o))
            roles.add('protection');
          break;
        case 'phase-out':
        case 'protection':
        case 'life-total-cant-change':
          roles.add('protection');
          break;
        case 'goad':
        case 'must-attack':
        case 'double-damage':
        case 'triple-damage':
        case 'assign-damage-by-toughness':
          roles.add('combat');
          if (e.do === 'assign-damage-by-toughness') uses.add('high-toughness');
          if (/damage/.test(e.do)) (makes.add('damage'), uses.add('combat-damage'));
          break;
        case 'extra-combat':
        case 'extra-turn':
        case 'win-game':
          roles.add('finisher');
          break;
        case 'untap':
          if (e.all && /permanents you control/i.test(e.all)) (makes.add('mana'), uses.add('tap-abilities'));
          if (/\blands you control\b|^target (?:land|forest|plains|island|swamp|mountain)$/i.test(e.all || w) && !land)
            (makes.add('mana'), roles.add('ramp'));
          break;
        case 'cost-more':
          roles.add('stax');
          break;
      }
    }
  }
  // a land put onto the battlefield from the top of the library or the graveyard is ramp too (Coiling Oracle, Splendid Reclamation)
  if (
    !land &&
    /\b(?:if it's a land card, (?:you may )?put it onto the battlefield|put (?:a|up to \w+) land cards? from among them onto the battlefield|return (?:all |target |up to \w+ )?land cards? from your graveyard to the battlefield)/i.test(
      o
    )
  )
    (makes.add('mana'), roles.add('ramp'));
  if (r.abilities.some(x => x.kind === 'keyword' && /umbra armor|totem armor/.test(x.name))) roles.add('protection');
  if (!land && /\bcreates? [^."]*\bTreasure tokens?\b/i.test(o)) (makes.add('treasure'), makes.add('mana'), roles.add('ramp'));
  // a card the reader could not fully read keeps the jobs the 0.9.3 text patterns give it, so no card loses a job it had
  if (r.unknown.length && (oldRoles || typeof tags === 'function')) {
    const old = oldRoles || tags(c).roles;
    for (const [from, to] of FN_OLD) if (old.has(from)) roles.add(to);
  }
  // a card can be both: Vandalblast hits one target or, overloaded, all of them; Swift Demise damages a target first
  return (c._fn = {makes, uses, roles});
}
