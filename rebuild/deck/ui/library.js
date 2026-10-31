// ---------- library: the cards the player owns ----------
function lib() {
  const P = S.profile;
  if (!P.library || typeof P.library !== 'object') P.library = {};
  return P.library;
}
function ownSet() {
  if (ownSet.v !== S.libV || !ownSet.s) {
    ownSet.v = S.libV;
    ownSet.s = new Set(Object.keys(lib()).map(norm));
  }
  return ownSet.s;
}
function libAdd(name, q) {
  const c = find(name),
    n = c ? c.n : String(name || '').trim();
  if (!n || isBasic(n)) return 0;
  const L = lib(),
    k = Object.keys(L).find(x => norm(x) === norm(n)) || n;
  L[k] = Math.max(0, (L[k] || 0) + q);
  if (!L[k]) delete L[k];
  S.libV = (S.libV || 0) + 1;
  return 1;
}
function libCount() {
  return Object.keys(lib()).length;
}
async function ensureSets() {
  if (S.setList || ensureSets.busy) return;
  ensureSets.busy = true;
  try {
    const j = await (await sfetch('https://api.scryfall.com/sets')).json(),
      today = new Date().toISOString().slice(0, 10);
    S.setList = (j.data || [])
      .filter(
        s =>
          !s.digital &&
          s.card_count &&
          s.released_at &&
          s.released_at <= today &&
          !/^(token|memorabilia|minigame|vanguard)$/.test(s.set_type)
      )
      .map(s => ({code: s.code, name: s.name, yr: s.released_at.slice(0, 4), n: s.card_count}));
    const st = $('#lib-set');
    if (st) st.placeholder = 'Set name or code, e.g. Bloomburrow';
  } catch (err) {
    S.setList = null;
    S.setErr = true;
    const st = $('#lib-set');
    if (st) st.placeholder = 'Set list unavailable · type a set code, e.g. blb';
  }
  ensureSets.busy = false;
}
function setDrop(input, box) {
  const q = input.value.trim().toLowerCase();
  if (q.length < 2 || !S.setList) {
    box.hidden = true;
    return;
  }
  const hit = S.setList
    .filter(s => s.code === q)
    .concat(
      S.setList.filter(s => s.code !== q && s.name.toLowerCase().startsWith(q)),
      S.setList.filter(s => s.code !== q && !s.name.toLowerCase().startsWith(q) && s.name.toLowerCase().includes(q))
    )
    .slice(0, 8);
  box.innerHTML =
    hit
      .map(
        s =>
          '<button style="grid-template-columns:1fr auto" data-act="lib-set-pick" data-v="' +
          esc(s.name + ' (' + s.code.toUpperCase() + ')') +
          '"><span>' +
          esc(s.name) +
          '<small>' +
          s.yr +
          ' · ' +
          s.n +
          ' cards</small></span><span class="chip">' +
          esc(s.code.toUpperCase()) +
          '</span></button>'
      )
      .join('') || '<p class="note" style="margin:8px">No set matches that.</p>';
  box.hidden = false;
}
// A set from what the player typed: "Name (CODE)", a code, or a name.
function resolveSet(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const m = /\(([A-Za-z0-9]{2,6})\)\s*$/.exec(t),
    list = S.setList || [];
  return m
    ? list.find(x => x.code === m[1].toLowerCase()) || {code: m[1].toLowerCase(), name: m[1].toUpperCase()}
    : list.find(x => x.code === t.toLowerCase()) ||
        list.find(x => x.name.toLowerCase() === t.toLowerCase()) ||
        list.find(x => x.name.toLowerCase().includes(t.toLowerCase())) ||
        (/^[A-Za-z0-9]{2,6}$/.test(t) ? {code: t.toLowerCase(), name: t.toUpperCase()} : null);
}
const setName = code => ((S.setList || []).find(x => x.code === code) || {name: code.toUpperCase()}).name;
// Card sets as a build filter: every card printed in each chosen set, read from Scryfall once and kept in this browser.
async function loadSetCards(codes) {
  const miss = (codes || []).filter(c => !SETCARDS.has(c));
  if (!miss.length) return true;
  let ok = true;
  for (const code of miss) {
    const cached = lsGet('dc.setcards.' + code);
    if (cached && cached.length) {
      SETCARDS.set(code, new Set(cached));
      continue;
    }
    const names = new Set();
    try {
      await scry('e:' + code, '', 20, o => {
        names.add(norm(o.name));
        (o.card_faces || []).length && names.add(norm(String(o.name).split(' // ')[0]));
      });
    } catch (e) {
      ok = false;
      continue;
    }
    SETCARDS.set(code, names);
    lsSet('dc.setcards.' + code, [...names]);
  }
  return ok;
}
// A set list that could not be read is not asked for again until the browser comes back online or the set is added again.
const SETFAIL = new Set();
addEventListener('online', () => {
  if (SETFAIL.size) {
    SETFAIL.clear();
    render();
  }
});
function ensureSetCards(d) {
  if (!d || !(d.sets || []).length || ensureSetCards.busy) return;
  const miss = d.sets.filter(c => !SETCARDS.has(c) && !SETFAIL.has(c));
  if (!miss.length) return;
  ensureSetCards.busy = true;
  loadSetCards(miss).then(ok => {
    ensureSetCards.busy = false;
    miss.forEach(c => {
      if (!SETCARDS.has(c)) SETFAIL.add(c);
    });
    if (!ok) toast('Some set lists could not be read from Scryfall; those sets match only by each card’s shown printing.');
    render();
  });
}
function setFilterHtml(sets, must, actPre, dis) {
  return (
    '<div class="row">' +
    sets
      .map(
        (c, i) =>
          '<button class="chip gold" data-act="' +
          actPre +
          '-rm" data-v="' +
          i +
          '"' +
          (dis || '') +
          '>' +
          esc(setName(c)) +
          ' ×</button>'
      )
      .join('') +
    (dis || sets.length >= 4
      ? ''
      : '<input type="search" id="' +
        actPre +
        '-add" list="set-list" placeholder="+ Card set…" autocomplete="off" style="flex:1 1 130px;min-width:0;width:auto"><datalist id="set-list">' +
        (S.setList || [])
          .slice(0, 400)
          .map(x => '<option value="' + esc(x.name + ' (' + x.code.toUpperCase() + ')') + '">')
          .join('') +
        '</datalist>') +
    (sets.length
      ? '<button class="btn sm' +
        (must ? ' pri' : '') +
        '" data-act="' +
        actPre +
        '-must"' +
        (dis || '') +
        ' title="Switch between a preference and a rule">' +
        (must ? 'Only these sets' : 'Preferred') +
        '</button>'
      : '') +
    '</div>'
  );
}
async function libAddSet(text) {
  const t = String(text || '').trim();
  if (!t) return;
  const m = /\(([A-Za-z0-9]{2,6})\)\s*$/.exec(t),
    list = S.setList || [];
  const s = m
    ? list.find(x => x.code === m[1].toLowerCase()) || {code: m[1].toLowerCase(), name: m[1].toUpperCase()}
    : list.find(x => x.code === t.toLowerCase()) ||
      list.find(x => x.name.toLowerCase() === t.toLowerCase()) ||
      list.find(x => x.name.toLowerCase().includes(t.toLowerCase())) ||
      (/^[A-Za-z0-9]{2,6}$/.test(t) ? {code: t.toLowerCase(), name: t.toUpperCase()} : null);
  if (!s) {
    toast('No set matches “' + t + '”.');
    return;
  }
  if (S.libBusy) return;
  S.libBusy = s.name;
  render();
  const names = new Set();
  try {
    await scry('e:' + s.code, '', 12, o => names.add(o.name));
  } catch (err) {
    S.libBusy = '';
    render();
    toast('Could not load ' + s.name + ' from Scryfall. Try again.');
    return;
  }
  let k = 0;
  names.forEach(n => {
    const c = find(n);
    if (!lib()[c ? c.n : n]) k += libAdd(n, 1);
  });
  S.libBusy = '';
  touch();
  render();
  toast(
    names.size
      ? 'Added ' +
          k +
          ' new card' +
          (k === 1 ? '' : 's') +
          ' from ' +
          s.name +
          ' (' +
          (names.size - k) +
          ' already owned or basic lands).'
      : 'No cards found for ' + s.name + '.'
  );
}
function libAddList(cards, cmd) {
  let k = 0;
  if (cmd) k += libAdd(cmd, 1);
  cards.forEach(x => {
    k += libAdd(x.n, x.q || 1);
  });
  return k;
}
function libRows(q) {
  const L = lib(),
    f = norm(q || ''),
    d = cur(),
    inDeck = new Set(d ? d.cards.map(x => norm(x.n)).concat(norm(d.commander || '')) : []);
  const names = Object.keys(L)
    .filter(n => !f || norm(n).includes(f))
    .sort((a, b) => a.localeCompare(b));
  if (!names.length)
    return (
      '<p class="note" style="margin:0">' +
      (Object.keys(L).length
        ? 'No owned card matches that search.'
        : 'Your library is empty. Add the cards you own above: single cards, a whole deck, or a whole set.') +
      '</p>'
    );
  return (
    names
      .slice(0, 150)
      .map(n => {
        const c = find(n);
        return (
          '<div class="dl libr"><button class="nm" data-act="card" data-n="' +
          esc(n) +
          '">' +
          esc(n) +
          (inDeck.has(norm(n)) ? ' <span class="chip">In this deck</span>' : '') +
          (c ? '' : ' <span class="chip warn">Not in card data</span>') +
          '</button><span class="pr">' +
          money(c) +
          '</span><span class="qty"><button class="ico" data-act="lib-dec" data-n="' +
          esc(n) +
          '" aria-label="Own one fewer">−</button><b>' +
          L[n] +
          '</b><button class="ico" data-act="lib-inc" data-n="' +
          esc(n) +
          '" aria-label="Own one more">+</button></span></div>'
        );
      })
      .join('') +
    (names.length > 150
      ? '<p class="note" style="margin:6px 0 0">Showing 150 of ' +
        names.length.toLocaleString() +
        '. Search to narrow the list.</p>'
      : '')
  );
}
// Collection value and stats: what the cards you own are worth (card-data prices, so estimates), by colour and type, the
// most valuable ones, and how many of them are in your decks.
function libStats() {
  const L = lib(),
    inDecks = new Set(
      S.profile.decks.flatMap(x =>
        x.cards.map(e => norm(e.n)).concat(x.commander ? [norm(x.commander)] : [], x.partner ? [norm(x.partner)] : [])
      )
    );
  const out = {total: 0, copies: 0, cards: 0, unpriced: 0, col: {}, type: {}, top: [], used: 0, usedVal: 0};
  const COL = {W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green'},
    add = (o, k, v, q) => {
      const x = o[k] || (o[k] = {v: 0, n: 0});
      x.v += v;
      x.n += q;
    };
  for (const [n, q] of Object.entries(L)) {
    const c = find(n);
    out.cards++;
    out.copies += q;
    if (!c || c.p == null) {
      out.unpriced++;
      continue;
    }
    const v = c.p * q;
    out.total += v;
    add(out.col, c.ci.length > 1 ? 'Multicolour' : c.ci.length ? COL[c.ci[0]] : 'Colourless', v, q);
    add(out.type, mainType(c), v, q);
    out.top.push({n: c.n, p: c.p, q});
    if (inDecks.has(c._n)) {
      out.used++;
      out.usedVal += v;
    }
  }
  out.top.sort((a, b) => b.p - a.p);
  out.top = out.top.slice(0, 10);
  return out;
}
function libStatsHtml() {
  if (!libCount()) return '';
  const st = libStats(),
    $$ = v => '$' + v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const bars = o =>
    Object.entries(o)
      .sort((a, b) => b[1].v - a[1].v)
      .map(
        ([k, x]) =>
          '<dt>' + esc(k) + '</dt><dd>' + $$(x.v) + ' · ' + x.n.toLocaleString() + ' card' + (x.n === 1 ? '' : 's') + '</dd>'
      )
      .join('');
  return (
    '<details class="grp libstats" id="libstats"' +
    (S.libStatsOpen ? ' open' : '') +
    '><summary class="lab">Collection value · ' +
    $$(st.total) +
    '</summary>' +
    '<p class="note" style="margin:0">' +
    st.copies.toLocaleString() +
    ' copies of ' +
    st.cards.toLocaleString() +
    ' cards. Prices are estimates from the card data' +
    (DBINFO.when ? ' (' + esc(String(DBINFO.when)) + ')' : '') +
    (st.unpriced
      ? '; ' + st.unpriced + ' card' + (st.unpriced === 1 ? ' has' : 's have') + ' no price and are not counted'
      : '') +
    '. ' +
    st.used.toLocaleString() +
    ' of your cards are in your decks (' +
    $$(st.usedVal) +
    ').</p>' +
    '<div class="row" style="align-items:flex-start;gap:18px"><div style="flex:1 1 200px"><span class="lab">By colour</span><dl class="kv">' +
    bars(st.col) +
    '</dl></div><div style="flex:1 1 200px"><span class="lab">By type</span><dl class="kv">' +
    bars(st.type) +
    '</dl></div></div>' +
    (st.top.length
      ? '<span class="lab">Most valuable</span><div class="allrows">' +
        st.top
          .map(
            x =>
              '<div class="dl libr"><button class="nm" data-act="card" data-n="' +
              esc(x.n) +
              '">' +
              esc(x.n) +
              '</button><span>' +
              (x.q > 1 ? x.q + '× ' : '') +
              '</span><span>$' +
              x.p.toFixed(2) +
              '</span></div>'
          )
          .join('') +
        '</div>'
      : '') +
    '</details>'
  );
}
// ---------- Buy list and Library pages (top navigation) ----------
// Every buy list in one place: one group per deck plus Other (cards for no deck). Each group keeps its own quantities; the export
// adds up the chosen groups into a plain decklist, one "N Card Name" line per card, by the card's own name.
function buyGroups() {
  const G = S.profile.decks.filter(d => (d.want || []).length).map(d => ({id: d.id, name: d.name, deck: d, list: d.want}));
  if (myWant().length) G.push({id: 'other', name: 'Other (not for a deck)', list: myWant()});
  return G;
}
function buySel() {
  if (!S.buySel) S.buySel = new Set(buyGroups().map(g => g.id));
  return S.buySel;
}
function buyAllText() {
  const sel = buySel(),
    m = new Map();
  buyGroups()
    .filter(g => sel.has(g.id))
    .forEach(g =>
      g.list.forEach(x => {
        const c = find(x.n),
          k = keyOf(x.n),
          o = m.get(k);
        if (o) o.q += x.q || 1;
        else m.set(k, {n: c ? c.n : x.n, q: x.q || 1});
      })
    );
  return [...m.values()]
    .sort((a, b) => a.n.localeCompare(b.n))
    .map(x => x.q + ' ' + x.n)
    .join('\n');
}
function viewBuy() {
  const G = buyGroups(),
    sel = buySel(),
    price = L =>
      L.reduce((a, x) => {
        const c = find(x.n),
          p = x.pp != null ? x.pp : c && c.p;
        return a + (p != null ? p * (x.q || 1) : 0);
      }, 0),
    est = DBINFO.source === 'starter' ? '~' : '';
  const row = x => {
    const c = find(x.n);
    return (
      '<button class="dl" data-act="card" data-n="' +
      esc(c ? c.n : x.n) +
      '">' +
      (c ? '<img alt="" src="' + artFor(c) + '">' : '<span></span>') +
      '<span class="q">' +
      (x.q || 1) +
      '×</span><span class="nm">' +
      esc(c ? c.n : x.n) +
      (x.ps ? ' <span class="pnm" title="The printing you chose">' + esc(x.ps) + '</span>' : '') +
      '</span><span class="cost">' +
      (c ? pips(c.m) : '') +
      '</span><span class="lk"></span><span class="pr">' +
      (x.pp != null ? '$' + x.pp.toFixed(2) : money(c)) +
      '</span></button>'
    );
  };
  const n = G.filter(g => sel.has(g.id)).reduce((a, g) => a + g.list.reduce((b, x) => b + (x.q || 1), 0), 0);
  return (
    '<section class="panel"><div class="ph"><h2>Buy list</h2><small>' +
    G.length +
    ' list' +
    (G.length === 1 ? '' : 's') +
    '</small></div>' +
    (!G.length
      ? '<p class="note" style="margin:0">Nothing to buy yet. Add cards from a deck’s Upgrades, its decklist (Add all to buy list) or Card search.</p>'
      : '<div class="row"><button class="btn sm" data-act="buy-all">Choose all</button><button class="btn sm" data-act="buy-none">Choose none</button><span class="note" style="flex:1">' +
        n +
        ' card' +
        (n === 1 ? '' : 's') +
        ' chosen</span><button class="btn sm" data-act="buy-copy-all">Copy</button><button class="btn pri sm" data-act="buy-export">Export .txt</button></div>' +
        G.map(
          g =>
            '<div class="grp"><div class="row"><button class="chk' +
            (sel.has(g.id) ? ' on' : '') +
            '" data-act="buy-sel" data-v="' +
            esc(g.id) +
            '" role="checkbox" aria-checked="' +
            sel.has(g.id) +
            '" aria-label="Include ' +
            esc(g.name) +
            ' in the export"></button><b style="flex:1;min-width:0">' +
            esc(g.name) +
            '</b><span class="chip">' +
            g.list.reduce((a, x) => a + (x.q || 1), 0) +
            ' cards · ' +
            est +
            '$' +
            price(g.list).toFixed(2) +
            '</span>' +
            (g.deck ? '<button class="btn sm" data-act="open-deck" data-v="' + esc(g.id) + '">Open deck</button>' : '') +
            '</div>' +
            '<details open><summary class="note">Cards</summary>' +
            g.list.map(row).join('') +
            '</details></div>'
        ).join('')) +
    '</section>'
  );
}
function viewLibrary() {
  const d = cur() || S.profile.decks[0];
  if (!d)
    return '<section class="panel"><div class="ph"><h2>Library</h2></div><p class="note" style="margin:0">Make or load a deck first; then add the cards you own here.</p></section>';
  return (
    '<section class="panel"><div class="ph"><h2>Library</h2><small>Every card you own, shared by all your decks</small></div>' +
    libPanel(d) +
    '</section>'
  );
}
// Add all to buy list: every card in the deck with its quantity, the commanders and nonbasic lands too, basic lands left out
// (Snow-Covered and Wastes included, by type line). Only what is missing is added, so pressing it twice adds nothing.
function addAllPlan(d) {
  const need = new Map(),
    add = (n, q) => {
      if (!n) return;
      const c = find(n);
      if (isBasic(n) || (c && /\bBasic\b/.test(frontType(c)) && /\bLand\b/.test(frontType(c)))) return;
      const k = keyOf(n),
        o = need.get(k);
      if (o) o.q += q;
      else need.set(k, {n: c ? c.n : n, q});
    };
  add(d.commander, 1);
  add(d.partner, 1);
  d.cards.forEach(e => add(e.n, e.q));
  return [...need.entries()]
    .filter(([k, x]) => {
      const w = (d.want || []).find(y => keyOf(y.n) === k);
      return !w || (w.q || 1) < x.q;
    })
    .map(([, x]) => x);
}
function libPanel(d) {
  const P = S.profile,
    n = libCount(),
    tot = Object.values(lib()).reduce((s, x) => s + x, 0);
  ensureSets();
  const deckOpts = P.decks
    .concat(S.draft && !P.decks.includes(S.draft) ? [S.draft] : [])
    .map(x => '<option value="d:' + esc(x.id) + '"' + (x.id === d.id ? ' selected' : '') + '>' + esc(x.name) + '</option>')
    .join('');
  const preOpts =
    typeof PRECON_LISTS === 'object'
      ? Object.keys(PRECON_LISTS)
          .sort()
          .map(k => '<option value="p:' + esc(k) + '">' + esc(k) + '</option>')
          .join('')
      : '';
  return (
    '<div class="scroll" id="libscroll" data-keep><p class="note" style="margin:0">Your library is every card you own, shared by all your decks. Cards here that would improve a deck show up on its Upgrades tab as free swaps, and never appear on a buy list.</p>' +
    '<div class="grp"><span class="lab">Add single cards</span><div class="dd"><input type="search" id="lib-q" placeholder="Search for a card you own" autocomplete="off"><div class="ddl" id="lib-res" hidden></div></div></div>' +
    '<div class="grp"><span class="lab">Add a deck</span><div class="row"><select id="lib-deck" style="flex:1 1 180px;min-width:0"><optgroup label="Your decks">' +
    deckOpts +
    '</optgroup>' +
    (preOpts ? '<optgroup label="Precons">' + preOpts + '</optgroup>' : '') +
    '</select><button class="btn" data-act="lib-add-deck">Add deck</button><button class="btn" data-act="lib-paste">Paste a list</button></div></div>' +
    '<div class="grp"><span class="lab">Add a set</span><div class="row"><div class="dd" style="flex:1 1 180px;min-width:0"><input type="search" id="lib-set" placeholder="' +
    (S.setList
      ? 'Set name or code, e.g. Bloomburrow'
      : S.setErr
        ? 'Set list unavailable · type a set code, e.g. blb'
        : 'Loading the list of sets…') +
    '" autocomplete="off"><div class="ddl" id="set-res" hidden></div></div><button class="btn" data-act="lib-add-set"' +
    (S.libBusy ? ' disabled' : '') +
    '>' +
    (S.libBusy ? 'Adding ' + esc(S.libBusy) + '…' : 'Add set') +
    '</button></div><p class="note" style="margin:0">Adds one copy of every card in the set.</p></div>' +
    libStatsHtml() +
    '<div class="grp"><div class="row"><span class="lab" style="flex:1">Cards you own · ' +
    n.toLocaleString() +
    (tot !== n ? ' (' + tot.toLocaleString() + ' copies)' : '') +
    '</span>' +
    (n ? '<button class="btn sm" data-act="dycb-open">Decks you can build</button>' : '') +
    (n
      ? '<button class="btn sm danger" data-act="lib-clear">' +
        (S.confirmLib ? 'Confirm: empty the library' : 'Empty library') +
        '</button>'
      : '') +
    '</div>' +
    (n
      ? '<input type="search" id="lib-f" placeholder="Search your library" value="' + esc(S.libF || '') + '" autocomplete="off">'
      : '') +
    '<div id="librows">' +
    libRows(S.libF) +
    '</div></div></div>'
  );
}
function openLibPaste() {
  S.modalCard = null;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Add a list to your library"><div class="ph"><h2>Add a list to your library</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><p class="note" style="margin:0">Paste a decklist or any list of cards you own, one per line, like “1 Sol Ring”.</p><textarea id="lib-text" placeholder="1 Sol Ring&#10;1 Cultivate&#10;2 Llanowar Elves"></textarea><div class="row"><button class="btn pri" data-act="lib-paste-go">Add to library</button><button class="btn" data-act="close">Cancel</button></div></div>';
  $('#modal').hidden = false;
}
// "Best deck with every new card under $X" (per card; owned cards are free): its own engine run, cached like recsFor.
function capFor(d, t) {
  const cap = TIERS[t].cap,
    key = JSON.stringify([
      t,
      d,
      [...SETCARDS.keys()].join(),
      COMBOS.list.length,
      DBINFO.count,
      EDH.key,
      EDH.state,
      Object.keys(EDH.tmap || {}).length,
      S.libV || 0,
      libCount(),
      BTAGS.v
    ]);
  capFor.c = capFor.c || {};
  if (!capFor.c[t] || capFor.c[t].k !== key) {
    upgradePaths.own = ownSet();
    capFor.c[t] = {k: key, v: upgradePaths(d, {cap})};
    try {
      const b = d.format === 'commander' && DBINFO.complete && analyze(d).size >= 90 ? evalFor(d) : null;
      if (b) scoreCheck(d, capFor.c[t].v, {apex: apexFor(d), base: b, refill: false, theme: false});
    } catch (e) {}
  }
  return capFor.c[t].v;
}
function capList(d, t) {
  return capFor(d, t)
    .paths.map(L => L.opts.apex)
    .filter(p => p && entryOf(d, p.cut) && !entryOf(d, p.add));
}
// What the upgrade list depends on. The buy list, Considering, ignored alerts, the player and the name don't change any
// suggestion, so editing them doesn't rework the list (which used to jump the page back to the top). Nor do the deck's version
// snapshots (one is added on a change, such as putting a card on the buy list; found 20 Oct) or a generated deck's budget.
const RECS_SKIP = new Set([
  'want',
  'lack',
  'consider',
  'ignoreH',
  'player',
  'name',
  'folder',
  'dtags',
  'versions',
  'budget',
  'buySnap',
  'bought',
  'updatedAt',
  'saveRev'
]);
function recsKey(d) {
  return JSON.stringify([
    JSON.stringify(d, (k, v) => (RECS_SKIP.has(k) ? undefined : v)),
    S.swaps,
    !!apexFor(d),
    [...SETCARDS.keys()].join(),
    COMBOS.list.length,
    DBINFO.count,
    EDH.key,
    EDH.state,
    Object.keys(EDH.tmap || {}).length,
    S.libV || 0,
    libCount(),
    BTAGS.v
  ]);
}
// Held picks are gone (owner, 24 Oct): a pick the app showed is not kept once shown; only an alternative the player chose is.
function dropHolds(d) {
  for (const k in d.recP || {}) if (!d.recP[k] || !d.recP[k].chosen) delete d.recP[k];
}
// After a swap the whole upgrade list is worked out again (owner, 31 Oct: "every swap should trigger a save and all upgrades
// should be regenerated"; it replaces 24 Oct's "only its own slot"): one card changes what every other slot needs (curve,
// roles, the commander's plan, combos), so the old list is not kept. carryRecs stays for a list carried on purpose.
function keepRecs(d, p) {
  recsFor.carry = null;
  recDrop(d);
}
function carryRecs(d, key) {
  const cy = recsFor.carry;
  recsFor.carry = null;
  if (!cy || cy.id !== d.id || cy.R !== recsFor.v) return null;
  const R = cy.R;
  R.paths = R.paths.filter(L => norm(L.cut) !== norm(cy.cut) || entryOf(d, L.cut));
  R.paths.forEach(L => {
    for (const t of Object.keys(L.opts)) {
      const p = L.opts[t];
      if (p && norm(p.add) === norm(cy.add) && !isBasic(p.add) && hasCard(d, p.add)) delete L.opts[t];
    }
  });
  R.paths = R.paths.filter(L => Object.values(L.opts).some(Boolean));
  ROWC.k = null;
  recsFor.k = key;
  recsFor.done(d);
  recSave(d, R);
  return R;
}
// A finished upgrade list is saved with the deck's inputs (owner, 24 Oct: "it needs to be checked one time"): opening the deck
// again with nothing changed shows the same list at once instead of thinking again. Anything the list depends on (the deck,
// its settings, the app build, the engine, the card data and its prices, the commander's play data) changes the key, and then
// the list is worked out again. Regenerate drops the saved list. The last 12 decks' lists are kept.
const REC_KEEP = 12,
  recSig = (d, key) => strHash(JSON.stringify([key, window.BUILD || 0, engineMode(), DBINFO.when || '', EDH.decks || 0])),
  REC_FIELDS = [
    'paths',
    'fixes',
    'drops',
    'fills',
    'count',
    'cost',
    'shift',
    'conflicts',
    'scored',
    'base',
    'apexR',
    'pack',
    'trimN',
    'bracket',
    'gcIn',
    'mldIn',
    'gcCap',
    'cap',
    'smart',
    'thin',
    'poolMs'
  ];
function recSave(d, R) {
  if (S.recFresh || !d || !d.id || !R || R.pending || (R.pool && !R.poolDone) || !S.profile.decks.some(x => x.id === d.id))
    return;
  try {
    const v = {};
    REC_FIELDS.forEach(k => {
      if (R[k] !== undefined) v[k] = R[k];
    });
    lsSet('dc.rec.' + d.id, {sig: recSig(d, recsFor.k), at: Date.now(), v});
    const idx = (lsGet('dc.recIdx') || []).filter(x => x !== d.id).concat(d.id);
    while (idx.length > REC_KEEP) localStorage.removeItem('dc.rec.' + idx.shift());
    lsSet('dc.recIdx', idx);
  } catch (e) {}
}
function recDrop(d) {
  try {
    if (d && d.id) localStorage.removeItem('dc.rec.' + d.id);
  } catch (e) {}
}
function recRestore(d, key) {
  if (S.recFresh || !d || !d.id || d.format !== 'commander' || !DBINFO.complete) return null;
  const s = lsGet('dc.rec.' + d.id);
  if (!s || !s.v || s.sig !== recSig(d, key)) return null;
  upgradePaths.own = ownSet();
  const R = upgradePaths(d); // the quick first step, for the helpers the screens use (card values, trims)
  REC_FIELDS.forEach(k => {
    if (s.v[k] !== undefined) R[k] = s.v[k];
  });
  R.pending = false;
  R.pool = null;
  R.poolDone = true;
  R.restored = s.at;
  // a swap's score for the card window's alternatives, against this deck's score (worked out when first asked)
  R.dOf = (cut, add, q) => {
    const b = evalFor(d);
    return b ? swapScore(d, b, apexFor(d), cut, add, q) : 0;
  };
  return R;
}
function recsFor(d) {
  dropHolds(d);
  const key = recsKey(d);
  if (recsFor.k !== key && carryRecs(d, key)) return recsFor.v;
  if (recsFor.k !== key) {
    const R0 = recRestore(d, key);
    if (R0) {
      recsFor.k = key;
      recsFor.v = R0;
      ROWC.k = null;
      recsFor.done(d);
      return R0;
    }
  }
  if (recsFor.k !== key) {
    recsFor.k = key;
    upgradePaths.own = ownSet();
    recsFor.v = upgradePaths(d);
    // Every swap is checked against the deck score before it is shown. The check runs just after the screen is drawn, so the
    // app stays responsive; until it finishes the list says so and nothing is held or offered.
    if (d.format === 'commander' && DBINFO.complete && analyze(d).size >= 90) {
      const R = recsFor.v,
        k = key,
        run1 = () => {
          try {
            const b = evalFor(d);
            if (b) scoreCheck(d, R, {apex: apexFor(d), base: b});
            stickTheme(d, R);
          } catch (e) {
            console.error(e);
          }
          R.pending = false;
          if (UP.pool2 && !S.syncRecs) poolRun(d, R, k);
          if (!R.pool) recSave(d, R);
        };
      if (S.syncRecs) run1();
      else {
        R.pending = true;
        clearTimeout(recsFor.t);
        recsFor.t = setTimeout(() => {
          if (recsFor.k !== k || !R.pending) return;
          run1();
          recsFor.done(d);
          render();
        }, 30);
      }
    }
    if (!recsFor.v.pending) recsFor.done(d);
  }
  return recsFor.v;
}
// The card-search upgrade index reuses the checked result, so a deck the player has looked at costs nothing to index.
recsFor.done = d => {
  try {
    const c = find(d.commander);
    if (
      d.format === 'commander' &&
      c &&
      EDH.key === c.n &&
      EDH.state === 'ok' &&
      !(d.plan && d.plan.length) &&
      S.profile.decks.some(x => x.id === d.id)
    ) {
      lsSet('dc.upx.' + d.id, {
        sig: deckSig(d),
        rows: recsFor.v.paths.flatMap(L =>
          Object.entries(L.opts)
            .filter(([, p]) => p && p.add)
            .map(([t, p]) => [p.add, p.cut, t])
        )
      });
      UPX.sig = '';
    }
  } catch (e) {}
};
// Whole-pool search (owner, 18 Oct): once the list is checked, every card that does the same job is measured in the background,
// a few milliseconds at a time. Each row's Highest score says the app is thinking until the search is done, then all of them
// appear at once (owner: wait rather than shift). It stops when the list changes (another deck, a swap, a new list).
function poolRun(d, R, k) {
  // first the scouting for the strongest cards whatever their job (poolScout, UP.poolX), on the background cores when there are any
  let S0 = null;
  try {
    S0 = poolScout(d, R);
  } catch (e) {}
  if (!S0 || !S0.keys.length) return poolGo(d, R, k);
  R.pool = {rows: [], r: 0, done: 0, total: S0.keys.length * 15, scout: true}; // the list waits for the search (about 1/15 of it)
  const done = vals => {
    if (recsFor.v !== R) return;
    try {
      poolScoutApply(R, S0, vals);
    } catch (e) {}
    poolGo(d, R, k);
  };
  if (wkGet() && R.base) {
    const p = wkSend(
      {kind: 'measure', b: {kind: 'swap', d: JSON.parse(JSON.stringify(d)), base: R.base, apex: R.apexR || null, keys: S0.keys}},
      600000
    );
    poolRun.job = p.id;
    p.then(r => {
      if (r && r.vals && r.vals.length === S0.keys.length) done(r.vals.map(x => (x && x[0] != null ? x[0] : null)));
      else poolScoutSlices(S0, R, done);
    });
    return;
  }
  poolScoutSlices(S0, R, done);
}
// the scouting on this page, a few milliseconds at a time (no background cores)
function poolScoutSlices(S0, R, done) {
  const vals = [];
  const tick = () => {
    if (recsFor.v !== R) return;
    const t0 = Date.now();
    while (vals.length < S0.keys.length && Date.now() - t0 < 12) {
      const [c, a, q] = S0.keys[vals.length];
      let v = null;
      try {
        v = R.dOf(c, a, q);
      } catch (e) {}
      vals.push(v);
    }
    if (R.pool && R.pool.scout) R.pool.done = vals.length;
    if (vals.length < S0.keys.length) setTimeout(tick, 8);
    else done(vals);
  };
  setTimeout(tick, 0);
}
function poolGo(d, R, k) {
  let Q = null;
  try {
    Q = poolQueue(d, R);
  } catch (e) {
    return;
  }
  if (!Q || !Q.total) {
    if (R.pool) {
      // only the scouting ran: the list is final as it is
      R.poolDone = true;
      recSave(d, R);
      render();
    }
    return;
  }
  R.pool = Q;
  // Build 146 (owner: wait until it's done, on the extra cores): the whole search goes to the background cores as one batch, and
  // the list appears once it is back. Without them (or if they fail), the page searches in slices as before.
  if (wkGet() && R.base) {
    if (poolRun.job)
      try {
        WK.w.postMessage({kind: 'cancel', job: poolRun.job});
      } catch (e) {}
    const p = wkSend(
      {
        kind: 'measure',
        b: {kind: 'swap', d: JSON.parse(JSON.stringify(d)), base: R.base, apex: R.apexR || null, keys: poolKeys(Q)}
      },
      600000
    );
    poolRun.job = p.id;
    p.then(r => {
      if (recsFor.v !== R) return;
      if (r && r.vals && r.vals.length === Q.total) {
        poolApply(Q, r.vals);
        poolFree(d, poolPromote(Q, d));
        stickTheme(d, R);
        ROWC.k = null;
        R.poolDone = true;
        R.poolMs = r.ms;
        recSave(d, R);
        render();
      } else poolSlices(d, R, Q);
    });
    return;
  }
  poolSlices(d, R, Q);
}
function poolSlices(d, R, Q) {
  // the search belongs to this list: holding the picks on screen re-keys the same list (recsFor.k), which must not stop it (Build 146)
  const tick = () => {
    if (recsFor.v !== R) return;
    let ch;
    try {
      ch = poolStep(Q, 12);
    } catch (e) {
      Q.r = Q.rows.length;
    }
    const n = document.querySelector('#pool-note'),
      done = Q.r >= Q.rows.length;
    if (n) {
      n.textContent = done ? '' : poolNote(Q);
      if (done) n.remove();
    }
    if (!done) {
      setTimeout(tick, 8);
      return;
    }
    // every row's Highest score appears at once, when the search is done: nothing shifts while it runs
    poolFree(d, poolPromote(Q, d));
    stickTheme(d, R);
    ROWC.k = null;
    R.poolDone = true;
    recSave(d, R);
    render();
  }; // the whole list appears now, the best card of each slot as its Apex pick (0.9.3)
  setTimeout(tick, 400);
}
// A held pick that a better card replaced (0.9.3) is no longer held; the picks now shown are held instead (watchAlerts).
function poolFree(d, keys) {
  if (!d.recP) return;
  let ch = false;
  (keys || []).forEach(k => {
    if (d.recP[k]) {
      delete d.recP[k];
      ch = true;
    }
  });
  if (ch) persistSoon();
}
function poolNote(Q) {
  return (
    'Thinking… checking every card that could fill these slots for a higher score: ' +
    Math.floor((100 * Q.done) / Math.max(1, Q.total)) +
    '%'
  );
}
// Waits for the score check of the current list (Regenerate and the tests use it).
async function recsReady(d) {
  for (let i = 0; i < 200 && recsFor(d).pending; i++) await new Promise(r => setTimeout(r, 50));
  return recsFor(d);
}

// The Undo button for the deck bar (shown once there is something to undo).
function undoBtn() {
  const last = UNDO.stack[UNDO.stack.length - 1];
  if (!last) return '';
  const t = 'Undo: ' + (last.label || 'last change');
  return (
    '<button class="btn undo-in" data-act="undo" title="' +
    esc(t) +
    '" aria-label="' +
    esc(t) +
    '">' +
    SVG.undo +
    '<span>Undo</span></button>'
  );
}
