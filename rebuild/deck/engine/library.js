const norm0 = s =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
// The same names are normalised many thousands of times while a deck is built, so each result is kept (Build 143; same answers).
const NORM_C = new Map();
const norm = s => {
  let v = NORM_C.get(s);
  if (v === undefined) {
    if (NORM_C.size > 200000) NORM_C.clear();
    v = norm0(s);
    NORM_C.set(s, v);
  }
  return v;
};
const frontType = c => {
  const t = c.t || '';
  return t.indexOf(' // ') < 0 ? t : t.split(' // ')[0];
};
const isBasic = n => Object.prototype.hasOwnProperty.call(BASICS, n) || String(n).startsWith('Snow-Covered ');

function costFmt(s) {
  return (s || '').replace(/(\d+|[WUBRGXC])/g, '{$1}');
}
function cmcOf(m) {
  let v = 0;
  (m.match(/\{([^}]+)\}/g) || []).forEach(x => {
    const k = x.slice(1, -1);
    if (/^\d+$/.test(k)) v += +k;
    else if (k !== 'X') v += 1;
  });
  return v;
}
function identityOf(text, type) {
  const s = new Set();
  (text.match(/\{[^}]*\}/g) || []).forEach(x => {
    for (const ch of x) if ('WUBRG'.includes(ch)) s.add(ch);
  });
  for (const b in COLOR_BASIC) if (new RegExp('\\b' + COLOR_BASIC[b] + '\\b').test(type)) s.add(b);
  return 'WUBRG'.split('').filter(c => s.has(c));
}
function parseStarter(raw) {
  const out = raw
    .trim()
    .split('\n')
    .map(l => {
      const [n, cost, t, p, o, fl, pt] = l.split('|');
      const m = costFmt(cost),
        text = (o || '').replace(/~/g, n);
      return {
        n,
        m,
        t,
        o: text,
        ci: identityOf(m + text, t),
        cmc: cmcOf(m),
        p: +p,
        std: /S/.test(fl || ''),
        cmd: true,
        r: 0,
        pt: pt || '',
        src: 'starter'
      };
    });
  for (const b in BASICS)
    out.push({
      n: b,
      m: '',
      t: 'Basic Land' + (b === 'Wastes' ? '' : ' — ' + b),
      o: b === 'Wastes' ? '{T}: Add {C}.' : '({T}: Add {' + BASICS[b] + '}.)',
      ci: BASICS[b] ? [BASICS[b]] : [],
      cmc: 0,
      p: 0.1,
      std: b !== 'Wastes',
      cmd: true,
      r: 0,
      pt: '',
      src: 'starter'
    });
  return out;
}
function fromScryfall(o) {
  if (!o || o.object !== 'card') return null;
  if (/token|emblem|art_series|vanguard|scheme|planar/.test(o.layout || '')) return null;
  if (o.games && !o.games.includes('paper')) return null;
  const lg = o.legalities || {},
    cmd = lg.commander === 'legal',
    std = lg.standard === 'legal';
  if (!cmd && !std) return null;
  const f = o.card_faces,
    f0 = (f && f[0]) || {};
  const pr = o.prices || {},
    p = parseFloat(pr.usd || pr.usd_foil || pr.usd_etched);
  const pw = o.power != null ? o : f0;
  return {
    n: o.name,
    m: o.mana_cost || f0.mana_cost || '',
    t: o.type_line || f0.type_line || '',
    o: o.oracle_text != null ? o.oracle_text : (f || []).map(x => x.oracle_text || '').join(' // '),
    ci: o.color_identity || [],
    cmc: o.cmc || 0,
    p: isNaN(p) ? null : p,
    std,
    cmd,
    r: o.edhrec_rank || 0,
    pt: pw.power != null ? pw.power + '/' + pw.toughness : o.loyalty ? 'Loyalty ' + o.loyalty : '',
    set: o.set_name || '',
    id: o.id || '',
    sc: o.set || '',
    oid: o.oracle_id || '',
    rar: o.rarity || '',
    cn: o.collector_number || '',
    gc: !!o.game_changer,
    nw: o.reprint === false && o.released_at ? o.released_at.slice(0, 7) : '', // first printing's month, for new cards with little play data yet
    fn: o.flavor_name || f0.flavor_name || '',
    src: 'full',
    df: !!(f && f.length === 2 && f[0].image_uris && f[1].image_uris),
    fc:
      f && f.length === 2 && f[0].image_uris
        ? f.map(x => ({
            n: x.name || '',
            m: x.mana_cost || '',
            t: x.type_line || '',
            pt:
              x.power != null
                ? x.power + '/' + x.toughness
                : x.loyalty
                  ? 'Loyalty ' + x.loyalty
                  : x.defense
                    ? 'Defense ' + x.defense
                    : ''
          }))
        : null
  };
}
// ----- card identity -----
// Every comparison between cards uses one identity: the Scryfall Oracle ID (c._k). Display names stay as the player or the
// source wrote them. The name index resolves, in order: the exact card name; a face of a double-faced or split card (only
// if no real card has that name); then an alternate printed name (ALT_NAMES in lists.js, e.g. "Vibranium Dynamo" is Thran
// Dynamo). A printed name that is also a different real card's name is ambiguous and is never used (listed in ALT_CLASH).
let ALT_CLASH = [];
function buildIndex(cards) {
  LIB = cards;
  IDX = new Map();
  ALT_CLASH = [];
  for (const c of cards) {
    c._n = norm(c.n);
    c._k = c.oid || 'n:' + c._n;
    if (!IDX.has(c._n)) IDX.set(c._n, c);
  }
  for (const c of cards)
    if (c.n.includes(' // '))
      c.n.split(' // ').forEach(f => {
        const k = norm(f);
        if (!IDX.has(k)) IDX.set(k, c);
      });
  if (typeof ALT_NAMES !== 'undefined')
    for (const a in ALT_NAMES) {
      const k = norm(a),
        real = IDX.get(norm(ALT_NAMES[a]));
      if (!real) continue;
      if (IDX.has(k)) {
        if (IDX.get(k) !== real) ALT_CLASH.push(a);
        continue;
      }
      IDX.set(k, real);
    }
}
function mergeLibrary(starter, full) {
  const seen = new Set(full.map(c => norm(c.n)));
  return full.concat(starter.filter(c => !seen.has(norm(c.n))));
}
function find(name) {
  if (!name) return null;
  return IDX.get(norm(name)) || IDX.get(norm(String(name).split(' // ')[0])) || null;
}
// The identity key for a name: the card's Oracle identity when it resolves, otherwise the normalised text (unresolved names
// still never match a different card).
function keyOf(name) {
  const c = find(name);
  return c ? c._k : 'u:' + norm(name || '');
}
// The deck entry holding a card, whatever name or printing it was entered under.
function entryOf(d, name) {
  const k = keyOf(name);
  return (d.cards || []).find(x => keyOf(x.n) === k) || null;
}
// Alternate printed names (see ALT_NAMES in lists.js): the real card name for a name printed on a reskinned card, or ''.
let ALT_IDX = null;
function altName(name) {
  if (typeof ALT_NAMES === 'undefined' || !name) return '';
  if (!ALT_IDX) {
    ALT_IDX = new Map();
    for (const k in ALT_NAMES) ALT_IDX.set(norm(k), ALT_NAMES[k]);
  }
  const k = norm(name);
  return k ? ALT_IDX.get(k) || ALT_IDX.get(norm(String(name).split(' // ')[0])) || '' : '';
}

// a creature's power and toughness as numbers (a * counts as 0)
const ptOf = c =>
  String(c.pt || '0/0')
    .split('/')
    .map(x => parseInt(x, 10) || 0);
function tags(c) {
  if (c._t) return c._t;
  const o = c.o || '',
    t = frontType(c),
    land = /\bLand\b/.test(t),
    th = {},
    roles = new Set();
  // a spell with a land on its back face is judged for jobs by its front face only
  let ro = / \/\/ [^/]*\bLand\b/.test(c.t || '') ? o.split(' // ')[0] : o;
  // a planeswalker's ultimate (minus 5 or more) is not one of its jobs (UP.bs): Nissa, Vital Force is not card draw
  if (UP.bs && /Planeswalker/.test(t))
    ro = ro
      .split('\n')
      .filter(l => !/^[−-]([5-9]|\d\d|X):/.test(l))
      .join('\n');
  for (const k in THEMES) {
    const T = THEMES[k];
    if (!T.re || (T.v2 && !UP.newTh.includes(k))) continue;
    th[k] = T.re.test(o)
      ? 1
      : (T.kw && T.kw.test(o)) ||
          (T.pw && /Creature/.test(t) && parseInt(String(c.pt || '0').split('/')[0], 10) >= T.pw) ||
          // stats when the words say nothing: a wall (toughness 6+, over twice its power), a creature that costs nothing
          (T.wall && /Creature/.test(t) && ptOf(c)[1] >= 6 && ptOf(c)[1] > 2 * ptOf(c)[0]) ||
          (T.free && /Creature/.test(t) && !(c.cmc > 0) && !/\{X\}/.test(c.m || '')) ||
          (T.mv && c.cmc >= 10 && T.mv.test(o))
        ? 0.7
        : T.type && T.type.test(t)
          ? 0.5
          : 0;
  }
  if (UP.kw)
    for (const k in KW_RE)
      if (
        th[k] !== 1 &&
        KW_RE[k].test(o) &&
        !(k === 'tokens' && !/\btokens?\b|populate|amass|incubate|fabricate|investigate|treasure|food|clue/i.test(o))
      )
        th[k] = 1; // keywords (Build 139)
  if (!land) {
    if (ROLE_RE.ramp.test(ro)) roles.add('ramp');
    // A permanent that makes the spells you cast cheaper (Ruby Medallion, Dragonspeaker Shaman) gives that mana every turn: it is
    // ramp for those spells (UP.costR, Build 143). One-time reductions and taxes on opponents are not.
    if (
      UP.costR &&
      !roles.has('ramp') &&
      !/^(Instant|Sorcery)/.test(t) &&
      /\bspells? you cast\b[^.]{0,40}\bcosts? \{\d+\} less\b/i.test(ro.replace(/this spell costs[^.]*\./gi, ''))
    )
      roles.add('ramp');
    // Card draw is drawing more cards than you discard, for you: looting and conniving (draw one, discard one) only filter,
    // and a draw any player may get (Selvala) is not yours. The monarch and the initiative draw every turn.
    {
      const fx = UP.fx ? effectsOf(c).effects : null,
        real =
          fx &&
          fx.some(
            e =>
              (e.kind === 'draw' && !e.symmetric && e.who !== 'each opponent') || e.kind === 'monarch' || e.kind === 'initiative'
          ) &&
          (!UP.bs || ro === o || THEMES.draw.re.test(ro) || /you become the monarch|take the initiative/i.test(ro)),
        only = fx && !real && fx.some(e => e.kind === 'filter' || (e.kind === 'draw' && e.symmetric));
      // Rules audit (Build 141): cycling ("Discard this card: Draw a card", in its reminder text) replaces itself, so it is not card draw;
      // "target player draws" can target you (Peer into the Abyss)
      const rd = ro.replace(/\([^()]*discard this card: draw a card\.?\)/gi, ''),
        rd2 = UP.nmh ? rd.replace(/you have no maximum hand size\.?/gi, '') : rd;
      if (
        (real && (rd === ro || THEMES.draw.re.test(rd2) || /you become the monarch|take the initiative/i.test(rd2))) ||
        (((THEMES.draw.re.test(rd2) && !/each player draws|target opponent draws/i.test(ro)) ||
          /you become the monarch|take the initiative|target player draws (cards|\w+ cards)/i.test(rd2)) &&
          !(UP.fx && only))
      )
        roles.add('draw');
    }
    // Each sentence or mode is judged on its own: a wipe clause makes a wipe, and a separate one-target clause on the same
    // card (Ugin's Binding, a planeswalker's minus) still counts as removal. Blink text ("exile ..., then return it") is not removal.
    const parts = ro
      .replace(/exile[^.]*\.?( then,?)? ?return[^.]*(to|onto) the battlefield[^.]*\./gi, '')
      .split(/(?<=\.)\s+|•|\n/);
    if (parts.some(x => ROLE_RE.wipe.test(x)) || (/\bOverload\b/.test(ro) && ROLE_RE.wipe.test(ro))) roles.add('wipe'); // overload: one target, or all of them
    if (parts.some(x => ROLE_RE.removal.test(x) && !ROLE_RE.wipe.test(x))) roles.add('removal');
    if (ROLE_RE.counter.test(ro)) roles.add('counter');
    if (ROLE_RE.tutor.test(ro) && !roles.has('ramp')) roles.add('tutor');
    if (ROLE_RE.protect.test(ro) || (/\bInstant\b/.test(t) && ROLE_RE.blink.test(ro))) roles.add('protect'); // an instant-speed blink saves a creature; a blink engine does not count
  }
  // engine v2: a card's jobs come from its rules reading (engine/functions.js) as well as, or instead of, the text patterns above
  // UP.v2 1: the reading's jobs replace the patterns'; 2: both; UP.v2r: the jobs taken from the reading (the rest keep the patterns')
  // (only removal, wipes and card draw are taken from the reading: a card with no removal words and no 0.9.3 removal is left unread, the same
  // result faster)
  if (
    UP.v2 &&
    !land &&
    !(
      UP.v2 === 1 &&
      UP.v2r &&
      UP.v2r.every(r => r === 'removal' || r === 'wipe+' || r === 'draw+') &&
      !roles.has('removal') &&
      !(
        UP.v2r.includes('draw+') &&
        /\bdraws?\b|\bhand\b|exile the top|look at the top|investigate|clue|connive|monarch|initiative|may (?:play|cast)/i.test(o)
      ) &&
      !/destroy|exile|damage|\/[-−]|sacrific|fights?\b|gains? control|controls enchanted|owners?'?s? (?:hand|library)|hands\b|top or bottom of|shuffles|loses all|can't attack|base power|tap target|doesn't untap|waterbend/i.test(
        o
      )
    )
  ) {
    const f = fnOf(c, new Set(roles)).roles;
    for (const [o, n] of FN_OLD) {
      // a role listed as "wipe+" is only added from the reading, never taken away
      const only = UP.v2r && UP.v2r.includes(o + '+');
      if (UP.v2r && !only && !UP.v2r.includes(o)) continue;
      if (f.has(n)) roles.add(o);
      else if (UP.v2 === 1 && !only) roles.delete(o);
    }
  }
  return (c._t = {land, th, roles});
}
function matchAim(c, key, tribe) {
  if (isEdhAim(key)) {
    const m = EDH.tmap && EDH.tmap[key.slice(4)],
      x = m && edhOf(m, c),
      all = EDH.map && edhOf(EDH.map, c);
    if (!x || x.inc < 0.2) return 0;
    // A card that is a core piece of the theme (in UP.dom of its decks or more) fits it even when it is just as common across
    // all of this commander's decks (Zombie lords for Gisa, whose players mostly build Zombies anyway).
    if (UP.dom && x.inc >= UP.dom && x.inc >= (all ? all.inc : 0)) return 1;
    return x.inc >= (all ? all.inc : 0) + 0.05 ? 1 : 0;
  }
  if (key === 'tribal') {
    if (!tribe) return 0;
    // the answer depends only on the card's text and the type, so it is kept on the card (Build 143; same answers)
    const M = c._mt || (c._mt = {}),
      h = M[tribe];
    if (h && h.t === c.t && h.o === c.o) return h.v;
    const v = tribeMatch(c, tribe);
    M[tribe] = {t: c.t, o: c.o, v};
    return v;
  }
  const tg = tags(c);
  if (key === 'combo') return UP.newTh.includes('combo') && (COMBOS.by.get(c._k) || []).some(x => x.keys.length <= 3) ? 1 : 0;
  if (key === 'control') return tg.roles.has('counter') || tg.roles.has('removal') || tg.roles.has('wipe') ? 1 : 0;
  return tg.th[key] || 0;
}
function tribeMatch(c, tribe) {
  // Creature types are capitalised in rules text; a named Role token ("Young Hero Role") is not the type.
  const re = new RegExp('\\b' + tribe.replace(/[^A-Za-z ]/g, '') + '(s|es|ves)?\\b'),
    alt = tribe === 'Elf' ? /\bElves\b/ : null;
  if (re.test(frontType(c).split('—')[1] || '')) return 1;
  const o = (c.o || '').replace(/\b(?:[A-Z][\w']* )+Role\b/g, '');
  if (re.test(o) || (alt && alt.test(o))) return 1;
  // Eldrazi decks run colourless cards that care about colourless (Ancient Stirrings for Ulalek; misread.js, 24 Oct)
  if (tribe === 'Eldrazi' && /\bcolorless (?:card|spell|creature|permanent)s?\b/i.test(o)) return 0.7;
  return /chosen type|shares a creature type|changeling/i.test(c.o || '') ? 0.7 : 0;
}
const subtypes = c => (frontType(c).split('—')[1] || '').trim().split(/\s+/).filter(Boolean);
// The creature type a deck is built around. If the commander's text names types ("Mutants, Ninjas, and/or Turtles"),
// the one the deck runs most wins. If it names none, the commander's own type counts once the deck is full of it
// (a Dinosaur commander leading a pile of Dinosaurs, a Hero leading Heroes). Human is too common to mean anything.
function deckTribe(d, cmd, named) {
  const cnt = {};
  ((d && d.cards) || []).forEach(e => {
    const c = find(e.n);
    if (c && /Creature/.test(frontType(c))) subtypes(c).forEach(t => (cnt[t] = (cnt[t] || 0) + e.q));
  });
  if (named.length) return named.slice().sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0))[0];
  let best = '',
    n = 9;
  (cmd ? subtypes(cmd) : []).forEach(t => {
    if (TRIBE_SET.has(t) && t !== 'Human' && (cnt[t] || 0) > n) {
      n = cnt[t];
      best = t;
    }
  });
  return best;
}
// Every plan this commander's players build (its EDHREC themes, as the app's plans, or as the theme pages when they are loaded)
function xPlansOf(cmd) {
  if (!UP.xPlan || !cmd || EDH.key !== cmd.n || !(EDH.tags || []).length) return [];
  const rev = {};
  for (const k in TAG_OF) rev[TAG_OF[k]] = k;
  Object.assign(rev, TAG_ALIAS);
  const on = new Set(themeKeys()),
    out = [];
  EDH.tags.forEach(t => {
    if (EDH.tmap && EDH.tmap[t.slug]) out.push('edh:' + t.slug);
    else if (rev[t.slug] && on.has(rev[t.slug])) out.push(rev[t.slug]);
  });
  return [...new Set(out)];
}
function detectStrategy(cmd, d, thin) {
  if (!cmd) return {themes: [], tribe: ''};
  const tg = tags(cmd),
    o = (cmd.o || '').replace(new RegExp(cmd.n.split(',')[0], 'g'), '');
  // (Build 145, UP.cbec) what the commander turns other things into ("are 4/4 Elemental creatures") is not a creature type it rewards
  const o2 = o
    .replace(/[^.]*\bcreates?\b[^.]*tokens?[^.]*\./gi, ' ')
    // a type it only searches for is not a type it rewards (Magda finds "an artifact or Dragon card" but leads Dwarves; 21 Oct)
    .replace(/\bsearch your library for [^.]*\./gi, ' ')
    .replace(
      UP.cbec ? /\b(is|are|becomes?)\s+(an?\s+)?(\d+\/\d+\s+)?([a-z]+\s+)*?([A-Z][a-z]+\s+)+(artifact\s+)?creatures?\b/g : /$^/,
      ' '
    );
  // (UP.ctok) a commander that keeps making creature tokens of one type (Ghoulcaller Gisa's Zombies) leads that type's deck; only once its play data is known to be missing or thin:
  // with data of its own, the players' choices say whether it does (measured: the data alone matches them better)
  const tokT =
    !UP.ctok || !(thin || (EDH.key === cmd.n && EDH.state !== 'loading' && (!EDH.map || EDH.map.size < 60)))
      ? []
      : effectsOf(cmd)
          .effects.filter(x => x.kind === 'token' && x.creature && x.mine && !x.once)
          .flatMap(x => TRIBES.filter(t => t !== 'Human' && new RegExp('\\b' + t + '\\b').test(x.what || '')));
  const tribe = deckTribe(
    d,
    cmd,
    TRIBES.filter(
      t => new RegExp('\\b(' + t + '|' + t[0] + tribeSlug(t).replace(/-/g, ' ').slice(1) + ')s?\\b').test(o2) || tokT.includes(t)
    ) // irregular plurals too (Elves, Dwarves, Wolves)
  );
  // Read the plan, not the payoff: counters a commander only puts on itself are growth, not a counters deck, and
  // making Treasure-style artifact tokens is an artifact plan, not going wide.
  const self = cmd.n.split(',')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plan = (cmd.o || '')
    .replace(new RegExp('put (a|an|one|two|three|four|x|that many) \\+1/\\+1 counters? on ' + self + '\\b', 'gi'), '')
    .replace(/\bcreates? [^.]*\b(Treasure|Clue|Food|Blood|Map|Powerstone|Vibranium|Gold|Junk|Incubator) tokens?/gi, ' artifact ');
  const order = [
    'counters',
    'tokens',
    'graveyard',
    'sacrifice',
    'spells',
    'artifacts',
    'enchantments',
    'lifegain',
    'lands',
    'voltron',
    'blink',
    'burn',
    'aggro',
    'flying',
    'defenders',
    'goad',
    'untap',
    'theft',
    'evasion',
    'stax',
    'voting',
    'clones',
    'cheat',
    'topdeck'
  ];
  const themes = order.filter(
    k =>
      !(THEMES[k].v2 && !UP.newTh.includes(k)) &&
      THEMES[k].pick !== false &&
      (THEMES[k].re ? THEMES[k].re.test(plan) : tg.th[k] === 1) &&
      (k !== 'blink' || /whenever (a|another|one or more)|then return/i.test(o))
  );
  return {themes: (tribe ? ['tribal'] : []).concat(themes), tribe};
}

// ----- deck text import -----
// Official decklists write some names differently: "and" for "&" (Bebop, Skull and Crossbones), and a deck label after a
// reprint's name ("Sol Ring Avengers", "Command Tower (Villains)"). Only tried when the name as typed is no card; a label
// must be capitalised words, so a misspelling ("Sol Rings") or a different card ("Sword of Fire and Ice") never resolves.
function labelled(name) {
  const s = String(name).trim(),
    a = s.replace(/ and /g, ' & '),
    b = s.replace(/ & /g, ' and ');
  for (const x of [a, b]) if (x !== s && find(x)) return find(x).n;
  const p = /^(.+?)\s*\(([^()]+)\)$/.exec(s);
  if (p && find(p[1])) return find(p[1]).n;
  const w = s.split(/\s+/);
  for (let k = 1; k <= 3 && k < w.length - 1; k++) {
    const rest = w.slice(-k);
    if (!rest.every(x => /^[A-Z][A-Za-z']*$/.test(x))) break;
    const c = find(w.slice(0, -k).join(' '));
    if (c) return c.n;
  }
  return '';
}
function parseDeckText(txt) {
  const out = {cards: [], commander: '', side: 0, name: ''};
  let section = 'main';
  const map = new Map();
  for (let line of String(txt).replace(/\r/g, '').split('\n')) {
    line = line.trim();
    if (!line) continue;
    let hm = line.replace(/^(\/\/|#)+\s*/, '');
    const head =
      /^(commander|commanders|deck|main|mainboard|main deck|sideboard|side|maybeboard|companion|about|lands?|creatures?|instants?|sorcer(y|ies)|artifacts?|enchantments?|planeswalkers?|spells?)\b\s*(\(\d+\))?:?$/i.exec(
        hm
      );
    if (head) {
      const h = head[1].toLowerCase();
      section = /^commander/.test(h)
        ? 'commander'
        : /^(sideboard|side|maybeboard)$/.test(h)
          ? 'side'
          : h === 'about'
            ? 'about'
            : h === 'companion'
              ? 'side'
              : 'main';
      continue;
    }
    if (/^(\/\/|#)/.test(line)) continue;
    if (section === 'about') {
      const nm = /^name\s+(.+)/i.exec(line);
      if (nm) out.name = nm[1];
      continue;
    }
    let sb = false;
    if (/^SB:\s*/i.test(line)) {
      sb = true;
      line = line.replace(/^SB:\s*/i, '');
    }
    let q = 1,
      name = line;
    const m = /^(\d+)\s*x?\s+(.+)$/i.exec(line);
    if (m) {
      q = +m[1];
      name = m[2];
    }
    const isCmd = /\*CMDR\*/i.test(name);
    const pm = /[\(\[]([A-Za-z0-9]{2,6})[\)\]]\s*([A-Za-z0-9★-]{1,8})?/.exec(name); // "(SET) 123": the printing
    name = name
      .replace(/\*[A-Z]+\*/g, '')
      .replace(/\s+#.*$/, '')
      .replace(/\s*[\(\[][A-Za-z0-9]{2,6}[\)\]].*$/, '')
      .trim();
    if (!find(name) && !altName(name)) name = name.replace(/\s+\d+[a-z★]?$/i, '').trim(); // a trailing collector number, unless it is part of the name
    if (!name || q < 1 || q > 250) continue;
    if (sb || section === 'side') {
      out.side += q;
      continue;
    }
    const typed = name;
    let c = find(name);
    if (!c) {
      const real = altName(name) || labelled(name);
      if (real) {
        c = find(real);
        name = real;
      }
    }
    if (c) name = c.n;
    const pn = c && norm(typed) !== c._n && altName(typed) ? typed : ''; // printed under another name (Humongous Fungus is Corpsejack Menace)
    if ((section === 'commander' || isCmd) && !out.commander) {
      out.commander = name;
      continue;
    }
    if ((section === 'commander' || isCmd) && !out.partner) {
      out.partner = name;
      continue;
    }
    const k = norm(name);
    if (map.has(k)) map.get(k).q += q;
    else {
      const e = {n: name, q, l: false};
      if (pn) e.pn = pn;
      if (pm) {
        e.psc = pm[1].toLowerCase();
        if (pm[2]) e.pcn = pm[2];
      }
      map.set(k, e);
      out.cards.push(e);
    }
  }
  return out;
}

// ----- analysis -----
function ctxOf(d) {
  const cmd = d.format === 'commander' ? find(d.commander) : null,
    par = cmd && d.partner ? find(d.partner) : null;
  const ident =
    d.format === 'commander'
      ? cmd
        ? 'WUBRG'.split('').filter(k => cmd.ci.includes(k) || (par && par.ci.includes(k)))
        : []
      : d.colors || [];
  let focus = (d.colors || []).filter(x => ident.includes(x));
  if (!focus.length) focus = ident.slice();
  const strat = detectStrategy(cmd, d);
  if (par) {
    const ps = detectStrategy(par, d);
    strat.themes = strat.themes.concat(ps.themes.filter(t => !strat.themes.includes(t)));
    if (!strat.tribe) strat.tribe = ps.tribe;
  }
  // Bracket: a label only. It is worked out from what is in the deck (Game Changers, mass land denial) and never limits
  // what the deck may hold or what is recommended; gcCap stays unlimited so no gate downstream ever closes.
  let gcIn = (cmd && cmd.gc ? 1 : 0) + (par && par.gc ? 1 : 0);
  let mldIn = 0;
  if (d.format === 'commander')
    (d.cards || []).forEach(e => {
      const c = find(e.n);
      if (c && c.gc) gcIn += e.q;
      if (c && BTAGS.mld.has(c._n)) mldIn += e.q;
    });
  const bracket = d.format !== 'commander' ? 0 : bracketOf(gcIn, mldIn);
  return {
    engine: UP.kw ? commanderEngine([cmd, par]) : null,
    cmd,
    par,
    ident,
    focus,
    edh: cmd && EDH.map && EDH.key === cmd.n ? EDH : null,
    fall: cmd && UP.fbW && EDH.key === cmd.n && (EDH.fall || []).length && (!EDH.map || EDH.map.size < 60) ? EDH.fall : null,
    cap: TIERS[d.tier || 'budget'].cap,
    cmdThemes: strat.themes,
    xPlans: xPlansOf(cmd),
    cmdTribe: strat.tribe,
    tribe: d.tribe || strat.tribe,
    bracket,
    gcIn,
    mldIn,
    gcCap: Infinity,
    uni: universeOf(cmd) || universeOf(par)
  };
}
function isAimed(d) {
  if (!d.aims || !d.aims.length) return false;
  if (d.aims.includes('tribal') && !(d.tribe || ctxOf(d).cmdTribe)) return false;
  return d.format === 'commander' ? !!find(d.commander) : (d.colors || []).length > 0;
}
// Untouched precon copies count every precon card as "played". The least-played precon cards show roughly how many copies
// are untouched (u); taking that share out judges precon cards and outside cards by the players who built the deck.
function preDeflate(E) {
  if (!E || !E.map) return {u: 0, preK: new Set(), inc: x => x};
  if (E._pd && E._pd.m === E.map && E._pd.p === E.pre) return E._pd.v;
  const pre = E.pre && E.pre.list && E.pre.list.length ? E.pre : null,
    preK = new Set(pre ? pre.list.map(keyOf) : []);
  const vv = pre
    ? [...new Set(pre.list)]
        .map(find)
        .filter(c => c && !tags(c).land)
        .map(c => edhOf(E.map, c))
        .filter(Boolean)
        .map(x => x.inc)
        .sort((a, b) => a - b)
    : [];
  const u = vv.length >= 20 ? Math.min(0.6, vv[Math.floor(vv.length * 0.05)]) : 0;
  const v = {u, preK, inc: (c, inc) => (!u ? inc : preK.has(c._k) ? Math.max(0, inc - u) / (1 - u) : Math.min(1, inc / (1 - u)))};
  E._pd = {m: E.map, p: E.pre, v};
  return v;
}
// What this commander's players run: the sum of play rates of the ramp (draw, removal, wipe) cards on its EDHREC page, scaled
// for the cards the page leaves out (checked against ~4,000 real decks: within about one card), and its average land count.
function roleNeeds(E) {
  if (!E || !E.map || E.map.size < 60) return null;
  if (E._needs && E._needs.m === E.map && E._needs.r === UP.rdef && E._needs.p === E.pre) return E._needs.v;
  const D = UP.rdef ? preDeflate(E) : null,
    t = {ramp: 0, draw: 0, removal: 0, wipe: 0};
  E.map.forEach((x, k) => {
    const c = IDX.get(k);
    if (!c || tags(c).land) return;
    const inc = D ? D.inc(c, x.inc) : x.inc;
    tags(c).roles.forEach(r => {
      if (r in t) t[r] += inc;
    });
  });
  const F = {ramp: 1.15, draw: 1.25, removal: 1.25, wipe: 1.2},
    lim = {ramp: [5, 22], draw: [6, 22], removal: [4, 12], wipe: [1, 5]},
    v = {};
  for (const r in t) v[r] = Math.max(lim[r][0], Math.min(lim[r][1], Math.round(t[r] * F[r])));
  E._needs = {m: E.map, v, r: UP.rdef, p: E.pre};
  return v;
}
// How many finishers (cards that close a game: mass pumps, extra combats, drains, big evasive threats, "win the game") and how
// many protection pieces this commander's players run: the sum of those cards' play rates, as for roleNeeds.
function routeNeeds(E) {
  if (!E || !E.map || E.map.size < 60) return null;
  if (E._rn && E._rn.m === E.map) return E._rn.v;
  let fin = 0,
    prot = 0;
  E.map.forEach((x, k) => {
    const c = IDX.get(k);
    if (!c || tags(c).land) return;
    if (isFinisher(c)) fin += x.inc;
    const r = tags(c).roles;
    if (r.has('protect') || r.has('counter')) prot += x.inc;
  });
  const v = {fin: Math.max(2, Math.min(14, Math.round(fin * 1.1))), prot: Math.max(1, Math.min(10, Math.round(prot * 1.2)))};
  E._rn = {m: E.map, v};
  return v;
}
function targetsOf(d, ctx) {
  const a = d.aims || [];
  if (d.format === 'commander') {
    const N = UP.roleT && ctx && ctx.edh ? roleNeeds(ctx.edh) : null,
      base = {
        size: 100,
        lands: a[0] === 'lands' ? 39 : a[0] === 'aggro' ? 35 : 37,
        ramp: 10,
        draw: 10,
        removal: 8,
        wipe: a.includes('control') ? 4 : 3
      };
    return N ? Object.assign(base, N) : base;
  }
  return {
    size: 60,
    lands: a.includes('control') ? 26 : a[0] === 'aggro' || a[0] === 'burn' ? 22 : 24,
    ramp: ctx.ident.includes('G') ? 4 : 0,
    draw: 4,
    removal: 6,
    wipe: a.includes('control') ? 2 : 0
  };
}
// Copies allowed: one in Commander (singleton), four in Standard; basics and "any number of cards named" cards are unlimited.
function copyLimit(d, c) {
  if (c && (isBasic(c.n) || /a deck can have any number of cards named/i.test(c.o || ''))) return Infinity;
  const m = c && /a deck can have up to (\w+) cards named/i.exec(c.o || ''),
    W = {two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10};
  if (m) return W[m[1].toLowerCase()] || +m[1] || 1;
  return d.format === 'commander' ? 1 : 4;
}
const TYPE_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land'];
function mainType(c) {
  const t = c ? frontType(c) : '';
  if (/\bLand\b/.test(t) && !/Creature/.test(t)) return 'Land';
  return TYPE_ORDER.find(k => new RegExp('\\b' + k + '\\b').test(t)) || 'Artifact';
}
// Lands = 31.5 + 1.6 × average mana value of the spells − 0.32 × cheap ramp (mana value 2 or less) + 0.72 × landfall cards,
// between 30 and 42. Commander decks with at least 40 spells; otherwise null (the starting target is used).
function landTarget(A, d) {
  if (!d || d.format !== 'commander' || A.nonland < 40) return null;
  return Math.max(30, Math.min(42, Math.round(31.5 + 1.6 * A.avg - 0.32 * A.cheapRamp + 0.72 * A.landfall)));
}
function legalIn(c, fmt) {
  return fmt === 'commander' ? c.cmd : c.std;
}
// Jobs shown to the player (Phase 3, owner's choice A, 24 Oct): the jobs scoring uses, plus counterspells and protection the
// rules reading finds (against Scryfall's tags: counterspells 90% -> 95% of cards found, protection 61% -> 69%, nearly as
// precise). Display only: scoring keeps tags(), and the reading done here is not kept on the card, so it never changes a score.
function jobsShown(c) {
  const tg = tags(c);
  if (c._js && c._js.t === tg) return c._js.v;
  const out = new Set(tg.roles);
  c._js = {t: tg, v: out};
  if (tg.land || typeof fnOf !== 'function') return out;
  try {
    const had = c._fn,
      f = fnOf(c, new Set(tg.roles)).roles;
    if (!had) delete c._fn;
    if (f.has('counterspell')) out.add('counter');
    if (f.has('protection')) out.add('protect');
  } catch (e) {}
  return out;
}
function analyze(d) {
  const ctx = ctxOf(d),
    T = targetsOf(d, ctx);
  const A = {
    ctx,
    T,
    size: (ctx.cmd || (d.format === 'commander' && d.commander) ? 1 : 0) + (ctx.par ? 1 : 0),
    lands: 0,
    nonland: 0,
    cmcSum: 0,
    curve: [0, 0, 0, 0, 0, 0, 0],
    roles: {ramp: 0, draw: 0, removal: 0, wipe: 0},
    unknown: [],
    over: [],
    offColor: [],
    illegal: [],
    dupes: [],
    gc: [],
    mld: [],
    turns: [],
    types: {},
    aim: (d.aims || []).map(() => 0),
    price: 0,
    priced: true,
    cheapRamp: 0,
    landfall: 0
  };
  if (ctx.cmd && ctx.cmd.p != null) A.price += ctx.cmd.p;
  if (ctx.par && ctx.par.p != null) A.price += ctx.par.p;
  [ctx.cmd, ctx.par].forEach(c => {
    if (c && c.gc) A.gc.push(c.n);
  });
  for (const e of d.cards) {
    A.size += e.q;
    const c = find(e.n);
    if (!c) {
      A.unknown.push(e.n);
      continue;
    }
    const tg = tags(c),
      pp = e.pp != null ? e.pp : c.p;
    if (pp != null) A.price += pp * e.q;
    else A.priced = false; // the chosen printing's price when one is set
    const mt = mainType(c);
    A.types[mt] = (A.types[mt] || 0) + e.q;
    if (tg.land) A.lands += e.q;
    else {
      A.nonland += e.q;
      A.cmcSum += c.cmc * e.q;
      A.curve[Math.min(6, Math.floor(c.cmc))] += e.q;
      for (const r in A.roles) if (tg.roles.has(r)) A.roles[r] += e.q;
      if (tg.roles.has('ramp') && (c.cmc || 0) <= 2) A.cheapRamp += e.q;
      if (THEMES.lands.re.test(c.o || '')) A.landfall += e.q;
      (d.aims || []).forEach((a, i) => {
        if (matchAim(c, a, ctx.tribe)) A.aim[i] += e.q;
      });
    }
    if (c.gc) A.gc.push(c.n);
    if (BTAGS.mld.has(c._n)) A.mld.push(c.n);
    if (BTAGS.turns.has(c._n)) A.turns.push(c.n);
    if (!isBasic(c.n)) {
      if (c.p != null && c.p > ctx.cap) A.over.push(c.n);
      if (ctx.ident.length || ctx.cmd) {
        if (!c.ci.every(x => ctx.ident.includes(x))) A.offColor.push(c.n);
      }
      if (!legalIn(c, d.format)) A.illegal.push(c.n);
      if (e.q > copyLimit(d, c)) A.dupes.push(c.n);
    }
  }
  A.avg = A.nonland ? A.cmcSum / A.nonland : 0;
  // The land target comes from the deck's own spells (owner's decision, Build 114): our formula, fitted to how many lands
  // players run with 52 commanders (EDHREC averages; misses by about 1.5 lands on commanders it was not fitted to, against
  // 2.2 for a flat 37). Until the deck has most of its spells, the starting target stands.
  {
    const t = landTarget(A, d);
    if (t != null) T.lands = t;
    else if (d.format === 'commander' && (d.aims || [])[0] === 'aggro' && A.avg > 3.2) T.lands = 37;
  }
  return A;
}

// ----- scoring & recommendations -----
// Tuning weights: how much what the commander's players actually run counts against theme-word matching.
// EDHREC lists a double-faced, adventure or split card under its front face; the card data uses the full name. Look up both.
function edhOf(map, c) {
  if (!map || !c) return undefined;
  const v = map.get(c._n);
  if (v !== undefined) return v;
  if (c._f === undefined) c._f = String(c.n).includes(' // ') ? norm(String(c.n).split(' // ')[0]) : c._n || norm(c.n);
  return c._f === c._n ? undefined : map.get(c._f);
}
let EDH_MISS = 3,
  W_INC = 10,
  W_SYN = 4,
  AIM_K = 1,
  STAPLE_K = 1,
  POP_K = 1;
const AIM_W = [5, 3.6, 2.6, 1.9, 1.4, 1];
const CORE = new Set(['sol ring', 'arcane signet', 'command tower']);
const TRIBE_SET = new Set(TRIBES);
function foreignTribe(c) {
  if (c._ft !== undefined) return c._ft;
  // "Non-Human creatures" is not a Human card, and a card that makes its own tokens of a type (Myr Battlesphere) brings its tribe with it.
  const re =
      /(?<![Nn]on-)\b([A-Z][a-z]+?)(?:s|es)? (?:creatures? you control|creatures? get|spells?|you control|cards? in|on the battlefield|gain|creature spell)/g,
    o = c.o || '';
  let m,
    r = '';
  while ((m = re.exec(o))) {
    const w = m[1] === 'Elv' ? 'Elf' : m[1];
    if (TRIBE_SET.has(w) && !new RegExp('\\b[Cc]reates? [^.]*\\b' + w + '\\b').test(o)) {
      r = w;
      break;
    }
  }
  return (c._ft = r);
}
// ----- build filters: creature types and keywords -----
// A filter is either a preference (matching cards score higher) or a rule. A creature-type rule applies to creature slots
// only; a keyword rule applies to theme slots only, so the deck still gets its lands, ramp, card draw and removal.
const KEYWORDS = {
  stun: {label: 'Stun', re: /stun counter/i},
  tap: {label: 'Tap / freeze', re: /\btap (?:target|up to|all)|doesn.t untap/i},
  flying: {label: 'Flying', re: /\bflying\b/i},
  trample: {label: 'Trample', re: /\btrample\b/i},
  haste: {label: 'Haste', re: /\bhaste\b/i},
  deathtouch: {label: 'Deathtouch', re: /\bdeathtouch\b/i},
  lifelink: {label: 'Lifelink', re: /\blifelink\b/i},
  vigilance: {label: 'Vigilance', re: /\bvigilance\b/i},
  menace: {label: 'Menace', re: /\bmenace\b/i},
  strike: {label: 'First / double strike', re: /\b(?:first|double) strike\b/i},
  hexproof: {label: 'Hexproof / ward', re: /\bhexproof\b|\bward\b/i},
  indestructible: {label: 'Indestructible', re: /\bindestructible\b/i},
  flash: {label: 'Flash', re: /\bflash\b/i},
  proliferate: {label: 'Proliferate', re: /\bproliferate/i},
  goad: {label: 'Goad', re: /\bgoad/i},
  mill: {label: 'Mill', re: /\bmills?\b/i},
  treasure: {label: 'Treasure', re: /\bTreasure token/},
  food: {label: 'Food', re: /\bFood token/},
  clue: {label: 'Clues / investigate', re: /\binvestigate|\bClue token/i},
  scry: {label: 'Scry / surveil', re: /\bscry \d|\bsurveil \d/i},
  bounce: {label: 'Bounce', re: /return (?:target|up to|each|all)[^.]*to (?:its|their) owner(?:'|’)s? hands?/i},
  exile: {label: 'Exile effects', re: /\bexile (?:target|up to|each|all)/i},
  copy: {label: 'Copy effects', re: /\bcopy (?:target|that|it|of)\b|create a token that.s a copy/i},
  sneak: {label: 'Ninjutsu / unblockable', re: /\bninjutsu\b|can.t be blocked/i}
};
function creatureTypes() {
  if (creatureTypes.n === LIB.length && creatureTypes.v) return creatureTypes.v;
  const m = new Map();
  for (const c of LIB) {
    if (!/\bCreature\b/.test(c.t)) continue;
    c.t.split(' // ').forEach(f => {
      if (!/\bCreature\b/.test(f)) return;
      (f.split('—')[1] || '')
        .trim()
        .split(/\s+/)
        .forEach(w => {
          if (/^[A-Z][A-Za-z'’-]+$/.test(w)) m.set(w, (m.get(w) || 0) + 1);
        });
    });
  }
  creatureTypes.n = LIB.length;
  return (creatureTypes.v = [...m.entries()]
    .filter(x => x[1] >= 2)
    .map(x => x[0])
    .sort());
}
function hasCType(c, t) {
  if (!/\bCreature\b/.test(c.t)) return false;
  if (/\bChangeling\b/.test(c.o || '')) return true;
  return c.t.split(' // ').some(f => new RegExp('\\b' + t + '\\b').test(f.split('—')[1] || ''));
}
function hasKey(c, k) {
  const K = KEYWORDS[k];
  return !!K && K.re.test(c.o || '');
}
// Card sets as a filter: SETCARDS holds, per set code, the cards printed in that set (every printing, read from Scryfall by
// the app). A set is a preference (matching cards score higher) or a rule (only cards printed in the chosen sets; basic
// lands always allowed). A set whose card list has not loaded yet matches only by each card's own shown printing.
let SETCARDS = new Map();
function inSets(c, d) {
  const ss = d.sets || [];
  return ss.some(code => c.sc === code || (SETCARDS.has(code) && SETCARDS.get(code).has(c._n)));
}
function mustOk(c, d) {
  if (d.setsMust && (d.sets || []).length && !isBasic(c.n) && !inSets(c, d)) return false;
  if (d.typesMust && d.types && d.types.length && /\bCreature\b/.test(frontType(c)) && !d.types.some(t => hasCType(c, t)))
    return false;
  if (d.keysMust && d.keys && d.keys.length && !tags(c).land) {
    const r = tags(c).roles;
    if (!['ramp', 'draw', 'removal', 'wipe'].some(j => r.has(j)) && !d.keys.some(k => hasKey(c, k))) return false;
  }
  return true;
}
let FILT_W = 6,
  FILT_MUST = 10;
function filtBonus(c, d) {
  let s = 0;
  const why = [],
    wt = 4,
    wk = d.keysMust ? FILT_MUST : FILT_W; // a type rule already narrows the creatures, so it needs no extra push
  (d.types || []).forEach(t => {
    if (hasCType(c, t)) {
      s += wt;
      why.push(t);
    } else if (new RegExp('\\b' + t + 's?\\b').test(c.o || '')) s += wt / 2;
  });
  (d.keys || []).forEach(k => {
    if (hasKey(c, k)) {
      s += wk;
      why.push(KEYWORDS[k].label);
    }
  });
  if ((d.sets || []).length && !d.setsMust && inSets(c, d)) {
    s += FILT_W;
    why.push('From your chosen set');
  }
  // Theme first (a generation choice): cards from the commander's own set family or of its creature types are pushed up
  // like a preferred set, so the deck is built from the theme and the rest of the card pool tops it up.
  if (d.themeFirst && d.format === 'commander' && !isBasic(c.n) && themeOf(c, themeCtxC(d))) s += UP.tf;
  return {s, why};
}
const FAST_MANA = new Set(
  [
    'Sol Ring',
    'Mana Crypt',
    'Mana Vault',
    'Chrome Mox',
    'Mox Diamond',
    'Jeweled Lotus',
    'Lotus Petal',
    'Mox Opal',
    'Mox Amber',
    'Grim Monolith',
    'Ancient Tomb',
    'Arcane Signet',
    'Fellwar Stone',
    'Mind Stone',
    'Simian Spirit Guide',
    'Elvish Spirit Guide',
    'Dark Ritual',
    'Cabal Ritual',
    'Culling the Weak',
    "Jeska's Will",
    'Gemstone Caverns'
  ].map(n => norm(n))
);
