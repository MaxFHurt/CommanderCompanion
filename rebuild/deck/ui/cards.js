function viewProfile() {
  const P = S.profile;
  return (
    '<section class="panel"><div class="ph"><h2>Profile</h2><small>' +
    'Saved in this browser' +
    '</small></div>' +
    '<div class="grp" style="max-width:420px"><label class="lab" for="p-name">Player name</label><input type="text" id="p-name" value="' +
    esc(P.name) +
    '" maxlength="40"' +
    (ccName() ? ' readonly title="Your name is set in your player profile"' : '') +
    '></div>' +
    ccRecordHtml() +
    playersHtml() +
    '<div class="grp"><span class="lab">Saved decks · ' +
    P.decks.length +
    '</span>' +
    (P.decks
      .map(
        d =>
          '<div class="row" style="border-bottom:1px solid var(--line);padding-bottom:6px"><b style="flex:1;min-width:140px">' +
          esc(d.name) +
          '</b><span class="chip">' +
          d.format +
          '</span>' +
          priceChip(analyze(d)) +
          '<button class="btn sm" data-act="open-deck" data-v="' +
          d.id +
          '">Open</button><button class="btn sm danger" data-act="del-deck" data-v="' +
          d.id +
          '">' +
          (S.confirmDel === d.id ? 'Confirm delete' : 'Delete') +
          '</button></div>'
      )
      .join('') || '<p class="note">No decks saved.</p>') +
    '</div>' +
    '</section>' +
    // owner, 24 Oct ("is it possible to recover where we were?"): the engine from before the engine change (0.9.3) stays
    // selectable on this device; every version is also kept in the project history
    '<section class="panel"><div class="ph"><h2>Upgrade engine</h2><small>This device</small></div><p class="note" style="margin:0;max-width:75ch">Which engine picks your upgrades and builds generated decks. <b>Current</b> reads every card’s rules and knows more deck plans. <b>Classic</b> picks the way the app did before the engine change (0.9.3). Your decks are not changed; the upgrade lists are worked out again.</p><div class="row">' +
    [
      ['new', 'Current'],
      ['old', 'Classic (0.9.3)']
    ]
      .map(
        ([k, label]) =>
          '<button class="btn' +
          (engineMode() === k ? ' pri' : '') +
          '" data-act="engine-mode" data-v="' +
          k +
          '" aria-pressed="' +
          (engineMode() === k) +
          '">' +
          label +
          '</button>'
      )
      .join('') +
    '</div></section>' +
    backupPanel() +
    '<section class="panel"><div class="ph"><h2>Card database</h2><small>' +
    (DBINFO.source === 'full'
      ? DBINFO.count.toLocaleString() + ' cards · Scryfall data from ' + esc(DBINFO.when)
      : DBINFO.count + '-card starter library') +
    '</small></div>' +
    cardLogHtml() +
    '<p class="note" style="margin:0;max-width:75ch">' +
    (DBINFO.source === 'full'
      ? 'Card text, prices, legality and artwork come from Scryfall. Once a day the app checks Magic’s release calendar and downloads fresh card data only when a new set or Secret Lair drop has released' +
        ((lsGet('dc.relSig') || {}).name
          ? ' (latest seen: ' + esc(lsGet('dc.relSig').name) + ', ' + esc(lsGet('dc.relSig').latest) + ')'
          : '') +
        '. Prices refresh at the same time; press Update now whenever you want today’s prices.'
      : 'The app downloads the full card list from Scryfall the first time it opens, then refreshes it whenever a new set or Secret Lair drop releases. Until that finishes it uses a small built-in starter library with estimated prices.') +
    (DBINFO.err ? ' <span class="unk">The last update failed (' + esc(DBINFO.err) + ').</span>' : '') +
    '</p>' +
    '<div class="row"><button class="btn pri" data-act="db-update">Update card data now</button></div>' +
    '<p class="note" style="margin:0">If the automatic update keeps failing, download <b>Oracle Cards</b> from <a href="https://scryfall.com/docs/api/bulk-data" target="_blank" rel="noopener">scryfall.com/docs/api/bulk-data</a> and load the file here:</p><div class="row"><input type="file" id="db-file" accept=".json,application/json" style="max-width:340px"></div></section>'
  );
}
// The deck editor fills what is left of the screen, and its panes scroll inside themselves.
// One-pane (tabbed) layout for phones in portrait and narrow tablets in portrait; two panes whenever there is room side by side.
// counterspells and protection in a deck, from both card readings (jobsShown); worked out only when the stats are drawn
function shownJobs(d) {
  const out = {counter: 0, protect: 0};
  d.cards.forEach(e => {
    const c = find(e.n);
    if (!c) return;
    const js = jobsShown(c);
    for (const r in out) if (js.has(r)) out[r] += e.q;
  });
  return out;
}
function isNarrow() {
  const w = innerWidth,
    h = innerHeight;
  return w < 700 || (h > w && w < 900) || (w > h && h < 560);
} // phones held sideways too
// sideways phones: the page scrolls (fitWork leaves the work area its natural height), not boxes inside it
const phoneLand = () => innerWidth > innerHeight && innerHeight < 560;
// A phone held upright (owner's iPhone, 18 Oct): the deck panel's buttons left the card list little or no room in a fixed-height
// box (none at all with large text), so the page scrolls instead, as on a phone held sideways. iPad and desktop keep the box.
const phoneTall = () => innerWidth < 500 && innerHeight > innerWidth;
function fitWork() {
  const w = document.querySelector('.work'),
    app = document.querySelector('.app');
  if (!w) return;
  if (phoneLand()) {
    w.style.height = '';
    return;
  }
  if (app) app.classList.toggle('flow', phoneTall());
  if (phoneTall()) {
    w.style.height = '';
    return;
  }
  const vh = Math.min(innerHeight, (window.visualViewport && visualViewport.height) || innerHeight);
  w.style.height =
    Math.max(vh < 480 ? 300 : 200, Math.round(vh - w.getBoundingClientRect().top - scrollY - (vh < 520 ? 6 : 12))) + 'px';
}
function render() {
  // Scroll positions survive a redraw. If the list is briefly shorter (still being worked out), the wanted position is
  // carried for a few redraws until the full list is back.
  const keep = {},
    wn = {};
  document.querySelectorAll('[data-keep]').forEach(el => {
    const w = +el.dataset.want || 0,
      n = +el.dataset.wn || 0;
    keep[el.id] = w && n < 4 ? Math.max(w, el.scrollTop) : el.scrollTop;
    wn[el.id] = w && n < 4 ? n + 1 : 0;
  });
  if (UNDO.base == null) UNDO.base = undoSnap();
  S.profile.decks.forEach(d => {
    if (!VLAST.has(d.id)) VLAST.set(d.id, cardsSig(d));
  });
  navHtml();
  const m = $('#main');
  document.querySelector('.top').classList.toggle('home', S.view === 'home');
  document.querySelector('.app').classList.toggle('home', S.view === 'home');
  m.innerHTML =
    S.view === 'home'
      ? viewHome()
      : S.view === 'decks'
        ? viewDecks()
        : S.view === 'search'
          ? viewSearch()
          : S.view === 'profile'
            ? viewProfile()
            : S.view === 'buy'
              ? viewBuy()
              : S.view === 'library'
                ? viewLibrary()
                : viewDeck();
  m.style.display = 'flex';
  m.style.flexDirection = 'column';
  m.style.gap = S.view === 'home' ? '10px' : '16px';
  document.querySelector('.app').classList.toggle('narrow', isNarrow());
  document.querySelector('.app').classList.toggle('editing', S.view === 'decks' && S.open && !!cur());
  fitWork();
  for (const id in keep) {
    const el = document.getElementById(id);
    if (el && keep[id]) {
      el.scrollTop = keep[id];
      if (el.scrollTop < keep[id] - 2) {
        el.dataset.want = keep[id];
        el.dataset.wn = wn[id];
      }
    }
  }
  watchSoon();
  ensureTheme();
  ensureEdh();
  ensureSetCards(S.view === 'decks' && S.open ? cur() : null);
}
// "I don't have this card" (owner, 18 Oct): the cards that do the same job (the alternatives' rule, at any price your deck's
// level allows; cards you own always count), each measured in this deck with the card swapped out, best first; the ones you own
// are listed first. It thinks first and shows the list once, complete.
function noHaveList(d, n) {
  const c = find(n);
  if (!c) return [];
  const ctx = ctxOf(d),
    same = sameJobAs(c, d, ctx),
    own = ownSet(),
    dis = new Set((d.dismissed || []).map(norm)),
    e = evalFor(d),
    ar = apexFor(d),
    q = (entryOf(d, n) || {q: 1}).q;
  const cap = TIERS[d.tier] && isFinite(TIERS[d.tier].cap) ? TIERS[d.tier].cap : Infinity,
    land = !!tags(c).land;
  const P = LIB.filter(
    x =>
      x._n !== c._n &&
      !isBasic(x.n) &&
      legalIn(x, d.format) &&
      x.ci.every(k => ctx.ident.includes(k) || !ctx.ident.length) &&
      mustOk(x, d) &&
      !dis.has(x._n) &&
      !hasCard(d, x.n) &&
      x.n !== d.commander &&
      x.n !== d.partner &&
      (own.has(x._n) || (x.p != null && x.p < cap)) &&
      same(x)
  )
    .map(x => {
      const r = ctx.edh && edhOf(ctx.edh.map, x);
      return {
        c: x,
        g:
          (own.has(x._n) ? 5 : 0) +
          (r ? 10 * r.inc + 4 * Math.max(0, r.syn) : 0) +
          (x.r ? Math.max(0, 1 - Math.log(x.r + 1) / Math.log(40000)) : 0) +
          0.2 * baseScore(x, d, ctx).s
      };
    })
    .sort((a, b) => b.g - a.g)
    .slice(0, 30);
  const fd = land && e && e.exact != null ? freshDelta(d, ar) : null;
  return P.map(y => ({
    n: y.c.n,
    p: y.c.p,
    own: own.has(y.c._n),
    q,
    dScore: e && e.exact != null ? (land ? fd(n, y.c.n) : swapScore(d, e, ar, n, y.c.n, q)) : null,
    g: y.g
  })).sort((a, b) => (b.dScore ?? -1e9) - (a.dScore ?? -1e9) || b.g - a.g);
}
function openNoHave(n) {
  const d = cur(),
    c = find(n);
  if (!d || !c) return;
  S.modalCard = null;
  S.noHave = n;
  const job = mainJob(n);
  const head =
    '<div class="panel" role="dialog" aria-label="Without ' +
    esc(n) +
    '"><div class="ph"><h2>Without ' +
    esc(n) +
    '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>';
  $('#modal').innerHTML =
    head + '<p class="note think" role="status">Thinking… measuring every card that does the same job in your deck</p></div>';
  $('#modal').hidden = false;
  setTimeout(() => {
    if (cur() !== d || $('#modal').hidden || S.noHave !== n) return;
    let L = [];
    try {
      L = noHaveList(d, n);
    } catch (err) {
      console.error(err);
    }
    if (S.noHave !== n || $('#modal').hidden) return;
    const mine = L.filter(a => a.own).slice(0, 3),
      rest = L.filter(a => !mine.includes(a)).slice(0, 8),
      lab = job
        ? JOB_LABEL[job] || job
        : tags(c).land
          ? 'a land making the same colours'
          : 'a ' + mainType(c).toLowerCase() + ' for the same part of your plan';
    const row = a => {
      const ac = find(a.n);
      return (
        '<div class="opt alt"><button class="sw in" data-act="card" data-n="' +
        esc(a.n) +
        '">' +
        (ac ? '<img alt="" src="' + artFor(ac, {pid: ac.id}) + '">' : '<span></span>') +
        '<span>' +
        (a.q > 1 ? a.q + '× ' : '') +
        esc(a.n) +
        printTag(ac) +
        '</span><em>' +
        money(ac) +
        '</em></button><div class="row">' +
        (a.dScore != null ? scoreChip(a.dScore) : '') +
        (a.own ? '<span class="chip good">You own this</span>' : '') +
        (ac && ac.gc ? '<span class="chip gc">GC</span>' : '') +
        '</div><div class="row">' +
        (a.own ? '' : upBuyBtn(d, a.n)) +
        '<button class="btn pri sm" data-act="nh-swap" data-v="' +
        esc(n) +
        '" data-n="' +
        esc(a.n) +
        '" style="margin-left:auto">Swap in</button></div></div>'
      );
    };
    const cap =
      TIERS[d.tier] && isFinite(TIERS[d.tier].cap)
        ? ' under your ' + TIERS[d.tier].label + ' limit ($' + TIERS[d.tier].cap + ')'
        : '';
    $('#modal').innerHTML =
      head +
      '<p class="note" style="margin:0 0 8px">Cards that do the same job as ' +
      esc(n.split(' // ')[0]) +
      ' (' +
      esc(lab) +
      ')' +
      cap +
      ', each measured in your deck in its place, best first. Cards you own count at any price.</p>' +
      (mine.length
        ? '<div class="grp"><span class="lab">In your library</span><div class="alts">' + mine.map(row).join('') + '</div></div>'
        : '') +
      (rest.length
        ? '<div class="grp"><span class="lab">Best replacements</span><div class="alts">' +
          rest.map(row).join('') +
          '</div></div>'
        : '') +
      (!mine.length && !rest.length
        ? '<p class="note" style="margin:0">No other card' + cap + ' does the same job in this deck’s colours.</p>'
        : '') +
      '</div>';
  }, 40);
}
function ctlHtml(n) {
  const d = cur(),
    e = d && d.cards.find(x => x.n === n);
  if (!e) return '';
  return (
    '<span class="lab">In this deck</span><div class="row"><span class="qty"><button data-act="dec" data-n="' +
    esc(n) +
    '" aria-label="Remove one copy">−</button><span>' +
    e.q +
    '</span><button data-act="inc" data-n="' +
    esc(n) +
    '" aria-label="Add one copy"' +
    (e.q >= copyLimit(d, find(n)) ? ' disabled style="opacity:.35"' : '') +
    '>+</button></span>' +
    '<button class="btn' +
    (e.l ? ' gold' : '') +
    '" data-act="lock" data-n="' +
    esc(n) +
    '" aria-pressed="' +
    !!e.l +
    '">' +
    (e.l ? 'Locked · tap to unlock' : 'Lock card') +
    '</button><button class="btn danger" data-act="rm" data-n="' +
    esc(n) +
    '">Remove from deck</button>' +
    (isBasic(n) || d.commander === n || d.partner === n
      ? ''
      : '<button class="btn" data-act="no-have" data-n="' + esc(n) + '">I don’t have this card</button>') +
    '</div>' +
    '<p class="note" style="margin:0">' +
    (e.l ? 'Locked cards are never suggested as cuts.' : 'Lock a card to keep it out of the suggested cuts.') +
    '</p>'
  );
}
function switchCommander(d, n) {
  const old = d.commander;
  delete d.cmdPid;
  delete d.cmdSet;
  const keepAims = d.aims.slice(),
    keepTribe = d.tribe;
  setCommander(d, n);
  d.aims = keepAims.length ? keepAims : d.aims;
  if (keepTribe) d.tribe = keepTribe;
  const nc = find(n);
  if (nc) d.colors = nc.ci.slice();
  if (old && old !== n) d.prevCmd = old;
  return old;
}
function offColor(d, c) {
  const cmd = d.format === 'commander' ? find(d.commander) : null,
    id = cmd ? ctxOf(d).ident : [];
  return !!(cmd && c && !c.ci.every(x => id.includes(x)));
}
// A card outside the commander's colors can't simply be added: show which commanders would allow it.
function recolorHtml(d, c) {
  const cmd = find(d.commander),
    id = ctxOf(d).ident,
    missing = c.ci.filter(x => !id.includes(x)),
    need = 'WUBRG'.split('').filter(x => id.includes(x) || c.ci.includes(x)),
    res = findCommanders(d, need, 6);
  const pars =
    pairKind(cmd) && !d.partner
      ? LIB.filter(p => p.cmd && canPair(cmd, p) && missing.every(k => p.ci.includes(k)))
          .map(p => ({p, s: baseScore(p, d, Object.assign({}, ctxOf(d), {focus: p.ci, ident: p.ci, edh: null})).s}))
          .sort((a, b) => b.s - a.s)
          .slice(0, 4)
      : [];
  return (
    '<div class="grp"><span class="lab">Put this card in ' +
    esc(d.name) +
    '</span><div class="gate"><b>This card is outside your commander’s colors</b>' +
    esc(c.n) +
    ' needs ' +
    missing.map(k => COLOR_NAME[k]).join(' and ') +
    ', and ' +
    esc(cmd.n) +
    ' doesn’t allow it. To run it, the deck needs a commander that includes ' +
    need.map(k => '<i class="pip p' + k + '">' + k + '</i>').join('') +
    '. Pick one and I will switch commanders; ' +
    esc(cmd.n.split(',')[0]) +
    ' then becomes an ordinary card you can add back.</div>' +
    (pars.length
      ? '<span class="lab">Or keep ' +
        esc(cmd.n.split(',')[0]) +
        ' and add a second commander</span><p class="note" style="margin:0">' +
        esc(cmd.n.split(',')[0]) +
        ' has ' +
        esc(pairLabel(cmd)) +
        ', so a second commander can bring the missing color. Nothing else in the deck changes.</p>' +
        pars
          .map(
            x =>
              '<div class="pre"><img alt="" src="' +
              artFor(x.p) +
              '"><div style="min-width:0"><b>' +
              esc(x.p.n) +
              '</b> ' +
              x.p.ci.map(z => '<i class="pip p' + z + '">' + z + '</i>').join('') +
              '<div class="why"><span class="chip good">Second commander · ' +
              esc(pairLabel(cmd)) +
              '</span></div></div><div class="acts"><button class="btn pri sm" data-act="partner-set" data-n="' +
              esc(x.p.n) +
              '">Add</button></div></div>'
          )
          .join('') +
        '<span class="lab">Or switch to a different commander</span>'
      : '') +
    (res.length
      ? res
          .map(x => {
            const k = find(x.n);
            return (
              '<div class="pre"><img alt="" src="' +
              artFor(k) +
              '"><div style="min-width:0"><b>' +
              esc(k.n) +
              '</b> ' +
              k.ci.map(z => '<i class="pip p' + z + '">' + z + '</i>').join('') +
              '<div class="why">' +
              x.why.map(w => '<span class="chip">' + esc(w) + '</span>').join('') +
              (x.outside
                ? '<span class="chip warn">' + x.outside + ' of your cards would fall outside its colors</span>'
                : '<span class="chip good">Every card in the deck stays legal</span>') +
              '</div></div><div class="acts"><button class="btn pri sm" data-act="cmd-switch" data-n="' +
              esc(k.n) +
              '" data-v="' +
              esc(c.n) +
              '">Switch</button></div></div>'
            );
          })
          .join('')
      : '<p class="note" style="margin:0">No commander in the card data covers all of those colors' +
        (DBINFO.complete ? '.' : ' yet. More appear when the card download finishes.') +
        '</p>') +
    '<div class="row"><button class="btn" data-act="close">Cancel</button></div></div>'
  );
}
function tipHtml(d, c, sw) {
  const f = evalFit(d, c, sw);
  if (ownSet().has(c._n)) f.pros.unshift('You already own this card, so it costs nothing to add.');
  const li = (xs, k, m) => xs.map(x => '<li class="' + k + '"><i>' + m + '</i>' + esc(x) + '</li>').join('');
  return (
    '<div class="tip ' +
    f.level +
    '"><b><small>Tip</small>' +
    esc(f.title) +
    '</b><ul>' +
    li(f.pros, 'pro', '+') +
    li(f.cons, 'con', '–') +
    '</ul></div>'
  );
}
// A swap's deck score change measured with fresh practice games (needed when a land comes out or goes in); the deck's own
// score on those games is kept per deck version so it is worked out once.
const FRESH = new Map();
function freshDelta(d, ar) {
  const k = d.id + '#' + d.cards.map(e => e.n + '×' + e.q).join('|') + '#' + !!ar;
  let b0 = FRESH.get(k);
  // each measured swap is kept (Build 138), so the Mana fix list and the card window show the same number for the same swap
  const cv = cmpOf; // swaps compare past the parts' maximum (Build 139)
  return (cut, add) => {
    const mk = k + '|' + cut + '>' + add;
    if (FRESH.has(mk)) return FRESH.get(mk);
    try {
      if (b0 == null) {
        b0 = cv(evaluateDeck(d, {apex: ar, games: 200}));
        FRESH.clear();
        FRESH.set(k, b0);
      }
      const u = JSON.parse(JSON.stringify(d));
      delete u.plan;
      cutCard(u, cut, 1);
      addCard(u, add, 1);
      const v = +(cv(evaluateDeck(u, {apex: ar, games: 200})) - b0).toFixed(2);
      FRESH.set(mk, v);
      return v;
    } catch (err) {
      return null;
    }
  };
}
// Where a land should go in (Build 138): one method for the card window and the Mana fix list, so both always agree. The lands it
// could replace that keep every colour they made (best few by the quick guess), plus, when the deck runs short of mana, the
// weakest spells; each measured with fresh practice games (lands change the mana), best first.
const LAND_CUTS = 6,
  LAND_SPELLS = 3;
function landRank(d, addName, ar) {
  const add = find(addName),
    id = ctxOf(d).ident,
    e = evalFor(d),
    starved = manaStarved(d, e),
    fd = freshDelta(d, ar);
  const all = bestCuts(d, addName, 999, {starved}),
    lands = all.filter(x => !x.spell && landCovers(find(x.n), add, id)).slice(0, LAND_CUTS),
    spells = all.filter(x => x.spell).slice(0, LAND_SPELLS);
  const out = lands
    .concat(spells)
    .map(x => Object.assign({}, x, {dScore: fd(x.n, addName)}))
    .filter(x => x.dScore != null)
    .sort((a, b) => b.dScore - a.dScore);
  out.starved = starved;
  out.pool = lands.length + spells.length;
  return out;
}
// The deck score change for one swap in the card window; tiny changes read as unchanged.
function wantChip(v) {
  return v == null
    ? ''
    : Math.abs(v) < SCORE_MIN
      ? '<span class="chip" title="Change to the deck score if you make this swap">Score unchanged</span>'
      : '<span class="chip ' +
        (v > 0 ? 'good' : 'warn') +
        '" title="Change to the deck score if you make this swap">' +
        (v > 0 ? '+' : '−') +
        Math.abs(v).toFixed(1) +
        ' score</span>';
}
// Which parts of the deck score a swap moves (practice games reused, as swapScore does; land swaps are not split).
function swapGain(d, e, ar, b, c) {
  if (b.land || !e || !e.contrib) return null;
  try {
    const u = JSON.parse(JSON.stringify(d));
    delete u.plan;
    cutCard(u, b.n, 1);
    addCard(u, c.n, 1);
    const a = evaluateDeck(u, {apex: ar, sim: e.sim}),
      g = {};
    for (const k in e.contrib) if (a.contrib && a.contrib[k] != null) g[k] = a.contrib[k] - e.contrib[k];
    return g;
  } catch (err) {
    return null;
  }
}
function wantHtml(d, c) {
  if (offColor(d, c)) return recolorHtml(d, c);
  const A = analyze(d),
    open = A.T.size - A.size,
    warn = !legalIn(c, d.format)
      ? 'Not legal in ' + d.format
      : (A.ctx.ident.length || A.ctx.cmd) && !c.ci.every(x => A.ctx.ident.includes(x))
        ? 'Outside this deck’s colors'
        : '';
  // Order (owner's layout): the best swap first, the card coming out on the left and this card on the right; then how well
  // it fits; the other cards it could replace come last, after the card's details (wantMore, added at the bottom).
  S.wantMore = '';
  const lab = '<div class="grp"><span class="lab">Put this card in ' + esc(d.name) + overCap(d, c) + '</span>';
  if (open > 0)
    return (
      lab +
      '<div class="row"><button class="btn pri" data-act="add-to-deck" data-n="' +
      esc(c.n) +
      '">Add it · ' +
      open +
      ' open slot' +
      (open === 1 ? '' : 's') +
      '</button></div>' +
      tipHtml(d, c) +
      '</div>'
    );
  // Weigh this card against every card it could plausibly replace: the deck score with each swap made, best first. Both cards
  // can be weak for the deck and the swap still be a gain, so the player sees the +/- on each one.
  const e = d.format === 'commander' && A.size >= 90 ? evalFor(d) : null,
    ar = e && e.exact != null ? apexFor(d) : null;
  let cuts = bestCuts(d, c.n, e && e.exact != null ? 999 : 3);
  let pool = cuts.length;
  const cuts0 = cuts.slice(),
    landIn = tags(c).land && e && e.exact != null;
  if (landIn) {
    const r = landRank(d, c.n, ar);
    pool = r.pool;
    cuts = r.slice(0, 3);
    cuts.starved = r.starved;
  } else if (e && e.exact != null) {
    const ls = cuts.some(x => x.land) ? freshDelta(d, ar) : null;
    cuts.forEach(x => {
      x.dScore = x.land ? ls(x.n, c.n) : swapScore(d, e, ar, x.n, c.n, 1);
    });
    const key = x => (x.s <= -80 ? 1e6 : 0) + (x.dScore ?? -1e9); // a card that is illegal or outside the colours always goes first
    cuts = cuts
      .map((x, i) => [x, i])
      .sort((a, b) => key(b[0]) - key(a[0]) || a[1] - b[1])
      .map(x => x[0])
      .slice(0, 3);
  }
  if (!cuts.length)
    return (
      lab +
      '<p class="note" style="margin:0">Every card it could replace is locked.</p><div class="row"><button class="btn" data-act="add-to-deck" data-n="' +
      esc(c.n) +
      '">Add anyway</button></div>' +
      tipHtml(d, c) +
      '</div>'
    );
  const side = (n, cls, small) => {
    const k = find(n);
    return (
      '<button class="sw ' +
      cls +
      '" data-act="card" data-n="' +
      esc(n) +
      '">' +
      (k ? '<img alt="" src="' + artFor(k) + '">' : '<span></span>') +
      '<span><small>' +
      small +
      '</small>' +
      esc(n) +
      '</span><em>' +
      money(k) +
      '</em></button>'
    );
  };
  const b = cuts[0],
    note =
      b.dScore != null
        ? '<p class="note" style="margin:0">' +
          (landIn
            ? 'Weighed against the ' +
              pool +
              ' cards it could best replace (lands that keep your colours' +
              (cuts.starved ? ', and weak spells: the deck runs short of lands' : '') +
              ') with fresh practice games. '
            : 'Weighed against all ' +
              pool +
              ' ' +
              (cuts0.some(x => x.land) ? 'spells and spare lands' : 'spells') +
              ' it could replace. ') +
          (b.dScore >= SCORE_MIN
            ? 'Each swap shows how the deck score would change.'
            : 'Every swap would ' +
              (b.dScore <= -SCORE_MIN ? 'lower' : 'barely change') +
              ' the deck score; the least harmful one is first.') +
          '</p>'
        : '';
  let h =
    lab +
    note +
    '<div class="swaphero">' +
    side(b.n, 'out', 'Take out') +
    '<span class="arrow" aria-hidden="true">→</span>' +
    side(c.n, 'in', 'Put in') +
    '</div>' +
    '<div class="row"><span class="chip good">Best swap</span>' +
    wantChip(b.dScore) +
    '<span class="chip">' +
    esc(b.why[0]) +
    '</span><button class="btn pri sm" data-act="want" data-n="' +
    esc(c.n) +
    '" data-v="' +
    esc(b.n) +
    '" style="margin-left:auto">Swap in</button></div>' +
    tipHtml(d, c, b.dScore != null ? {cut: b.n, dScore: b.dScore, gain: swapGain(d, e, ar, b, c)} : null) +
    '</div>';
  S.wantMore =
    '<div class="grp"><span class="lab">Or take out instead</span>' +
    cuts
      .slice(1)
      .map(
        x =>
          '<div class="path">' +
          side(x.n, 'out', 'Take out') +
          '<div class="row">' +
          wantChip(x.dScore) +
          '<span class="chip">' +
          esc(x.why[0]) +
          '</span><button class="btn sm" data-act="want" data-n="' +
          esc(c.n) +
          '" data-v="' +
          esc(x.n) +
          '" style="margin-left:auto">Swap in</button></div></div>'
      )
      .join('') +
    '<div class="row"><button class="btn sm" data-act="add-to-deck" data-n="' +
    esc(c.n) +
    '">Add without removing anything</button></div></div>';
  return h;
}
function openEntry(n) {
  S.modalCard = n;
  S.prints = null;
  S.pick = null;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="' +
    esc(n) +
    '"><div class="ph"><h2>' +
    esc(n) +
    '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><p class="note" style="margin:0">This card isn’t in the card data yet, so there are no details to show. It stays in your list.</p><div class="grp" id="ctl">' +
    ctlHtml(n) +
    '</div></div>';
  $('#modal').hidden = false;
}
// Analyze this build: for a deck built by hand (or any deck), read what its cards are doing, score it as it stands, and say
// what it needs. Nothing changes in the deck unless the player presses one of the buttons.
// Plain words for a rules problem from validateDeck.
function validMsg(x) {
  const c = x.card ? x.card + ': ' : '';
  return (
    {
      commander_missing: 'No commander chosen yet.',
      commander_ineligible: c + 'can’t be a commander.',
      commander_pair_invalid: c + 'can’t share the command zone with your commander.',
      format_not_legal: c + 'not legal in this format.',
      off_color_identity: c + 'outside your commander’s colors.',
      singleton_conflict: c + 'more copies than the format allows.',
      wrong_deck_size: 'The deck doesn’t have the right number of cards yet.',
      unresolved_identity: c + 'not found in the card data.',
      land_type_color_invalid: c + 'a land type outside your colors.'
    }[x.key] || c + x.key.replace(/_/g, ' ')
  );
}
// Analysis items open to a plain-English explanation when tapped.
const SCORE_DESC = {
  synergy:
    'How well the cards work with your mechanics and with each other: cards that feed the plan, minus cards your deck can’t support. 30% of the score.',
  balance:
    'Whether the deck has enough of each job: lands, ramp, card draw, removal, board wipes and protection, measured against a typical Commander deck. 25% of the score.',
  quality:
    'How strong your spells are compared with the best possible build for this commander (the Apex build = 100%) and with random playable cards (0%). 20% of the score.',
  routes: 'How the deck wins: finishers (cards that end a game quickly) and complete combos. 15% of the score.',
  mana: 'From 300 practice games the app plays out alone: how often the deck has the right colours and enough lands on time, and how smoothly it spends its mana. 10% of the score.'
};
const HEALTH_DESC = {
  Lands: 'Lands in the deck. Commander decks usually want 35 to 38; fewer means missed land drops, more means flooding.',
  Ramp: 'Cards that make extra mana or put lands onto the battlefield (mana rocks, mana creatures, land ramp). They let you cast big spells early.',
  'Card draw': 'Cards that draw extra cards or give repeated card advantage, so you do not run out of things to do.',
  Removal: 'Cards that deal with a single threat: destroy, exile, bounce or neutralise one permanent.',
  'Board wipes': 'Cards that clear many creatures or permanents at once, to recover when you are behind.'
};
function tapInfo(sum, desc) {
  return desc
    ? '<details class="tapi"><summary>' + sum + '</summary><p class="note" style="margin:2px 0 6px">' + desc + '</p></details>'
    : sum;
}
async function openAnalysis() {
  const d = cur();
  if (!d) return;
  S.modalCard = null;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Build analysis"><div class="ph"><h2>Build analysis</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><p class="note" style="margin:0">Reading your deck…</p></div>';
  $('#modal').hidden = false;
  const c = d.format === 'commander' ? find(d.commander) : null;
  if (c) {
    await loadEdh(c.n);
    if (EDH.key === c.n && EDH.state === 'ok')
      await loadThemes(
        c.n,
        (EDH.tags || []).slice(0, 10).map(t => 'edh:' + t.slug)
      );
  }
  if (cur() !== d || $('#modal').hidden) return;
  const A = analyze(d),
    ctx = A.ctx,
    T = A.T,
    B = buildThemes(d),
    v = validateDeck(d),
    open = Math.max(0, T.size - A.size);
  const label = k =>
    isEdhAim(k)
      ? aimLabel(k)
      : k === 'tribal'
        ? (B.tribe || ctx.tribe || 'Creature type') + ' tribal'
        : (THEMES[k] || {label: k}).label;
  let h =
    '<div class="panel" role="dialog" aria-label="Build analysis"><div class="ph"><h2>Build analysis</h2><small>' +
    esc(d.name) +
    '</small><button class="ico" data-act="close" aria-label="Close">×</button></div>';
  h +=
    '<p class="note" style="margin:0">' +
    A.size +
    ' of ' +
    T.size +
    ' cards' +
    (open ? ' · ' + open + ' open slot' + (open === 1 ? '' : 's') : '') +
    ' · ' +
    A.lands +
    ' lands, ' +
    A.nonland +
    ' spells · average mana value ' +
    A.avg.toFixed(2) +
    '</p>';
  // 1. commander
  if (d.format === 'commander' && !c) {
    const cols = deckColors(d),
      sug = cols.length ? findCommanders(d, cols, 5) : [];
    h +=
      '<div class="grp"><span class="lab">Commander</span><p class="note" style="margin:0">No commander yet.' +
      (cols.length
        ? ' Your spells use ' + cols.join('') + '. These commanders cover those colors and fit your cards:'
        : ' Add some cards first, or pick one.') +
      '</p>' +
      (sug.length
        ? '<div class="row">' +
          sug
            .map(
              x =>
                '<button class="btn sm" data-act="set-cmd" data-n="' +
                esc(x.n) +
                '">' +
                esc(x.n) +
                (x.outside ? ' · ' + x.outside + ' off-color' : '') +
                '</button>'
            )
            .join('') +
          '</div>'
        : '') +
      '</div>';
  }
  // 2. what the cards are doing
  const row = x =>
    tapInfo(
      '<span class="row" style="justify-content:space-between;display:flex"><span>' +
        esc(x.label) +
        '</span><span class="chip">' +
        x.n +
        ' card' +
        (x.n === 1 ? '' : 's') +
        '</span></span>',
      mechDesc(x.key, Object.assign({}, ctx, {tribe: x.tribe || ctx.tribe})) +
        (x.cards && x.cards.length
          ? ' <b>Your cards:</b> ' + x.cards.slice(0, 8).map(esc).join(', ') + (x.cards.length > 8 ? '…' : '')
          : '')
    );
  h +=
    '<div class="grp"><span class="lab">What your cards are doing</span>' +
    (!B.edh.length && !B.gen.length
      ? '<p class="note" style="margin:0">Not enough spells yet to see a plan.</p>'
      : (B.edh.length
          ? '<p class="note" style="margin:0">' +
            esc(c.n.split(',')[0]) +
            '’s themes (what players build it around):</p>' +
            B.edh.slice(0, 5).map(row).join('')
          : '') +
        (B.gen.length
          ? '<p class="note" style="margin:0">' +
            (B.edh.length ? 'General mechanics:' : 'Mechanics in your cards:') +
            '</p>' +
            B.gen.slice(0, 5).map(row).join('')
          : '') +
        (B.suggest.length
          ? '<p class="note" style="margin:0">Suggested build, in order: <b>' +
            B.suggest.map(k => esc(label(k))).join(' › ') +
            '</b>' +
            (JSON.stringify(B.suggest) === JSON.stringify(d.aims)
              ? ' (already set).'
              : '. Your build is set to: ' +
                (d.aims.length ? d.aims.map(k => esc(aimLabel(k, ctx.tribe))).join(' › ') : 'nothing yet') +
                '.') +
            '</p>' +
            (JSON.stringify(B.suggest) !== JSON.stringify(d.aims) && !d.aimLocked
              ? '<div class="row"><button class="btn pri sm" data-act="an-apply">Use the suggested build</button></div>'
              : '')
          : '')) +
    '</div>';
  // 3. rules
  h +=
    '<div class="grp"><span class="lab">Rules check</span>' +
    (v.length
      ? v
          .slice(0, 8)
          .map(x =>
            tapInfo(
              '<span class="note">' + esc(validMsg(x)) + '</span>',
              'Commander rules: 100 cards including the commander, one copy of each card except basic lands, every card inside the commander’s colour identity, and no banned cards. Fix this before playing the deck.'
            )
          )
          .join('')
      : '<p class="note" style="margin:0">' +
        (open
          ? 'Legal so far; it needs ' + open + ' more card' + (open === 1 ? '' : 's') + '.'
          : 'A legal ' + (d.format === 'commander' ? 'Commander' : 'Standard') + ' deck.') +
        '</p>') +
    '</div>';
  // 4. score and health (the deck score panel, scored as the deck stands)
  if (d.format === 'commander' && c) {
    let e = null;
    try {
      e = evaluateDeck(d, {games: 300, apex: apexFor(d), partial: A.size < 90});
    } catch (err) {}
    if (e) {
      const L = {synergy: 'Synergy', balance: 'Balance', quality: 'Card quality', routes: 'Win routes', mana: 'Mana and curve'};
      h +=
        '<div class="grp"><span class="lab">Deck score as it stands · ' +
        e.total +
        ' of 100</span>' +
        (open
          ? '<p class="note" style="margin:0">Scored as the ' +
            A.size +
            ' cards so far; missing lands and jobs count against it.' +
            (A.size < 90 ? ' Mana and curve is left out until the deck is complete.' : '') +
            '</p>'
          : '') +
        Object.keys(L)
          .map(k => {
            const x = e.parts[k];
            if (x == null) return '<p class="note" style="margin:0"><b>' + L[k] + ':</b> ' + esc(e.why[k]) + '.</p>';
            const cls = x >= 75 ? 'good' : x >= 50 ? 'warn' : 'bad';
            return (
              tapInfo(
                '<span class="meter ' +
                  cls +
                  '"><span>' +
                  L[k] +
                  '</span><i><b style="width:' +
                  x +
                  '%"></b></i><span>' +
                  x +
                  '</span></span>',
                SCORE_DESC[k]
              ) +
              '<p class="note" style="margin:-2px 0 4px">' +
              esc(e.why[k]) +
              '</p>'
            );
          })
          .join('') +
        tapInfo(
          e.finishers.length
            ? '<span class="note"><b>Finishers:</b> ' + e.finishers.slice(0, 8).map(esc).join(', ') + '</span>'
            : '<span class="note"><b>No clear finisher yet.</b></span>',
          'A finisher ends a game quickly: a mass pump, extra combats, a big drain, or a large evasive threat. Most decks want three or more so they can actually close games.'
        ) +
        (e.combos.win.length
          ? '<p class="note" style="margin:0"><b>Combo:</b> ' +
            e.combos.win
              .slice(0, 2)
              .map(x => esc(x.names.join(' + ') + ' · ' + x.what.toLowerCase()))
              .join('; ') +
            '</p>'
          : '') +
        (e.weak.length
          ? tapInfo(
              '<span class="note"><b>Barely supported:</b> ' +
                [...new Set(e.weak.map(w => w.n + ' (needs ' + w.label + ')'))].slice(0, 4).map(esc).join('; ') +
                '</span>',
              'These cards need something your deck has too little of (for example a lord with few creatures of its type, or a payoff with few enablers), so they often do little. Add more of what they need, or replace them.'
            )
          : '') +
        '</div>';
    }
  }
  h +=
    '<div class="grp"><span class="lab">Deck health</span>' +
    [
      ['Lands', A.lands, T.lands],
      ['Ramp', A.roles.ramp, T.ramp],
      ['Card draw', A.roles.draw, T.draw],
      ['Removal', A.roles.removal, T.removal],
      ['Board wipes', A.roles.wipe, T.wipe]
    ]
      .map(([n, have, want]) => {
        const cls = have >= want ? 'good' : have >= want * 0.7 ? 'warn' : 'bad';
        return want
          ? tapInfo(
              '<span class="meter ' +
                cls +
                '"><span>' +
                n +
                '</span><i><b style="width:' +
                Math.min(100, (have / want) * 100) +
                '%"></b></i><span>' +
                have +
                ' / ' +
                want +
                '</span></span>',
              HEALTH_DESC[n] + ' This deck has ' + have + '; the target is about ' + want + '.'
            )
          : '';
      })
      .join('') +
    (Sh =>
      '<p class="note" style="margin:4px 0 0">Also in the deck: ' +
      Sh.counter +
      ' counterspell' +
      (Sh.counter === 1 ? '' : 's') +
      ' · ' +
      Sh.protect +
      ' card' +
      (Sh.protect === 1 ? '' : 's') +
      ' that protect your creatures or permanents.</p>')(shownJobs(d)) +
    '</div>';
  // 5. what to add next and the weakest cards
  if (A.nonland) {
    let adds = [];
    try {
      const tmp = JSON.parse(JSON.stringify(d));
      if (!tmp.aims.length) tmp.aims = B.suggest.slice();
      adds = recommend(tmp, 0, true)
        .adds.filter(a => a.kind === 'spell')
        .slice(0, 8);
    } catch (err) {}
    const sc = d.cards
      .map(x => find(x.n))
      .filter(x => x && !tags(x).land)
      .map(x => ({c: x, s: baseScore(x, d, ctx).s}))
      .sort((a, b) => a.s - b.s)
      .slice(0, 5);
    if (adds.length)
      h +=
        '<div class="grp"><span class="lab">' +
        (open ? 'Best cards to add next' : 'Cards that would fit') +
        '</span><div class="row">' +
        adds
          .map(
            a =>
              '<button class="chip" data-act="card" data-n="' +
              esc(a.n) +
              '" title="' +
              esc(a.why.join(' · ')) +
              '">' +
              esc(a.n) +
              '</button>'
          )
          .join('') +
        '</div><p class="note" style="margin:0">Tap one to see why it fits and add it.</p></div>';
    if (sc.length >= 5 && A.nonland >= 20)
      h +=
        '<div class="grp"><span class="lab">Weakest fits in the deck</span><div class="row">' +
        sc.map(x => '<button class="chip" data-act="card" data-n="' + esc(x.c.n) + '">' + esc(x.c.n) + '</button>').join('') +
        '</div><p class="note" style="margin:0">The cards that do least for this build; the Upgrades tab says what to replace them with.</p></div>';
  }
  $('#modal').innerHTML = h + '</div>';
  $('#modal').hidden = false;
}
// Card details: add the card to one of the player's buy lists. The deck it upgrades (or the open deck) is chosen first; decks it
// cannot go in are listed with the reason and cannot be picked.
function wantBox(c) {
  const decks = S.profile.decks.concat(S.draft ? [S.draft] : []),
    fit = d => wantFit(d, c),
    up = upFor(c).map(x => x.id),
    cd = cur(),
    mineOn = myWant().some(x => keyOf(x.n) === (c && c._k));
  let sel =
    S.wantDeck === MINE || (S.wantDeck && decks.some(d => d.id === S.wantDeck && !fit(d)))
      ? S.wantDeck
      : up.find(id => decks.some(d => d.id === id && !fit(d))) || (cd && !fit(cd) ? cd.id : MINE);
  const d = decks.find(x => x.id === sel),
    on = sel === MINE ? mineOn : d && wantOf(d).some(x => keyOf(x.n) === c._k),
    inDeck = d && entryOf(d, c.n);
  return (
    '<div class="grp" id="wantbox"><span class="lab">Add to a buy list</span><div class="row"><select id="want-deck" aria-label="Buy list" style="flex:1 1 180px;min-width:0;width:auto">' +
    '<option value="' +
    MINE +
    '"' +
    (sel === MINE ? ' selected' : '') +
    '>My buy list · not for a deck</option>' +
    decks
      .map(x => {
        const f = fit(x);
        return (
          '<option value="' +
          esc(x.id) +
          '"' +
          (x.id === sel ? ' selected' : '') +
          (f ? ' disabled' : '') +
          '>' +
          esc(x.name) +
          (up.includes(x.id) ? ' · upgrade' : '') +
          (f ? ' (' + esc(f) + ')' : '') +
          '</option>'
        );
      })
      .join('') +
    '</select>' +
    (on
      ? '<button class="btn sm" data-act="want-undo" data-n="' + esc(c.n) + '">On the buy list · remove</button>'
      : '<button class="btn pri sm" data-act="want-add" data-n="' + esc(c.n) + '">Add to buy list</button>') +
    '</div>' +
    '<p class="note" style="margin:0">' +
    (sel === MINE
      ? 'Your own buy list keeps cards you want without putting them in any deck. It is on the My decks page.'
      : 'Added to ' + esc(d.name) + '’s buy list only; the deck itself does not change.') +
    (inDeck
      ? ' ' + esc(d.name) + ' already has this card.'
      : ownSet().has(c._n)
        ? ' You already own this card (it’s in your library).'
        : '') +
    '</p></div>'
  );
}
// My buy list: cards the player wants that belong to no deck. Saved with the profile (and so in backup files).
const MINE = '__mine';
function myWant() {
  return S.profile.want || (S.profile.want = []);
}
function myWantHtml() {
  const W = myWant();
  if (!W.length) return '';
  const tot = W.reduce((a, x) => {
    const c = find(x.n);
    return a + ((c && c.p) || 0) * x.q;
  }, 0);
  return (
    '<section class="panel" id="mywant"><div class="ph"><h2>My buy list</h2><small>' +
    W.length +
    ' card' +
    (W.length === 1 ? '' : 's') +
    ' · ' +
    (DBINFO.source === 'starter' ? '~' : '') +
    '$' +
    tot.toFixed(2) +
    '</small></div><p class="note" style="margin:0">Cards you want that are not tied to a deck. Add more from any card’s details.</p><div class="rows">' +
    W.map(
      (x, i) =>
        '<div class="row" style="flex-wrap:nowrap;gap:6px"><div style="flex:1;min-width:0"><button class="dl buy" data-act="card" data-n="' +
        esc(x.n) +
        '"><span class="q">' +
        x.q +
        '×</span><span class="nm">' +
        esc(x.n) +
        '</span><span></span><span class="pr">' +
        money(find(x.n)) +
        '</span></button></div><button class="ico" data-act="mywant-rm" data-v="' +
        i +
        '" aria-label="Remove ' +
        esc(x.n) +
        ' from my buy list" title="Remove from my buy list">×</button></div>'
    ).join('') +
    '</div><div class="row"><button class="btn pri sm" data-act="mywant-copy">Copy as text</button></div></section>'
  );
}
// Over the open deck's price limit (owner, 18 Oct): said plainly in the card window, e.g. "Over your Budget limit ($3)".
function overCap(d, c) {
  const t = d && TIERS[d.tier];
  return t && isFinite(t.cap) && c.p != null && c.p >= t.cap
    ? ' <span class="chip warn over-cap">Over your ' + t.label + ' limit ($' + t.cap + ')</span>'
    : '';
}
function openCard(name, pid) {
  S.wantMore = '';
  const c = find(name);
  if (!c) {
    if (cur() && cur().cards.some(e => e.n === name)) openEntry(name);
    return;
  }
  phSeen(c);
  const d = cur(),
    tg = tags(c),
    th = themeKeys()
      .filter(k => tg.th[k] === 1)
      .map(k => THEMES[k].label),
    inDeck = d && d.cards.find(e => norm(e.n) === c._n);
  const legend = canLead(c),
    isCmd = d && d.format === 'commander' && (d.commander === c.n || d.partner === c.n),
    wantOn = !inDeck && d && !isCmd && S.view === 'decks' && S.open,
    wantLater = wantOn && !offColor(d, c) && tags(c).land && d.format === 'commander'; // a land is measured with fresh practice games (a few seconds): the window opens at once and says it is thinking
  S.modalCard = c.n;
  S.prints = null;
  S.face = 0;
  S.pick = c.id ? {n: c.n, id: pid || (isCmd && d.cmdPid) || pidOf(c, inDeck)} : null;
  // a card not in the deck (an upgrade pick) shown in a printing with another name says so too (owner, 25 Oct)
  const sfn = !inDeck ? (shownPrint(c, pid ? {pid} : null) || {}).fn : '',
    pnm = inDeck ? printedName(d, inDeck, c) : sfn && norm(sfn) !== c._n ? sfn : '';
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="' +
    esc(c.n) +
    '"><div class="ph"><h2>' +
    esc(pnm || c.n) +
    (pnm ? ' <span class="pnm" title="The card’s own name (this printing carries another name)">' + esc(c.n) + '</span>' : '') +
    '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><p class="note" id="pic-note" style="margin:0 0 6px">' +
    picNote(c) +
    '</p>' +
    (c.df && c.fc ? '<p class="note" id="face-note" style="margin:0 0 6px">' + faceNote(c) + '</p>' : '') +
    (inDeck
      ? '<div class="grp" id="ctl">' + ctlHtml(inDeck.n) + '</div>'
      : wantOn
        ? wantLater
          ? '<div class="grp" id="want-think"><span class="lab">Put this card in ' +
            esc(d.name) +
            overCap(d, c) +
            '</span><p class="note think" role="status" style="margin:0">Thinking… playing practice games with this land in each place it could go</p></div>'
          : wantHtml(d, c)
        : '') +
    '<div class="detail">' +
    cardHtml(c, false, S.pick) +
    '<div class="grp"><dl class="kv">' +
    '<dt>Mana value</dt><dd>' +
    c.cmc +
    ' &nbsp;' +
    pips(c.m) +
    '</dd><dt>Color identity</dt><dd>' +
    (c.ci.length ? c.ci.map(x => symImg(x)).join('') : 'Colorless') +
    '</dd>' +
    '<dt>Price</dt><dd>' +
    money(c) +
    (c.src === 'starter' ? ' <span class="note">(estimate)</span>' : '') +
    ' · ' +
    (c.p == null
      ? 'no tier data'
      : c.p < TIERS.budget.cap
        ? 'fits Budget, Mid and Apex'
        : c.p < TIERS.mid.cap
          ? 'fits Mid and Apex'
          : 'Apex only') +
    (wantOn && !offColor(d, c) ? '' : overCap(d, c)) +
    '</dd>' +
    phHtml(c) +
    '<dt>Legal in</dt><dd>' +
    [c.cmd ? 'Commander' : '', c.std ? 'Standard' : ''].filter(Boolean).join(', ') +
    '</dd>' +
    (c.gc || BTAGS.mld.has(c._n) || BTAGS.turns.has(c._n)
      ? '<dt>Brackets</dt><dd>' +
        [
          c.gc ? '<span class="chip gc">Game Changer</span> Bracket 3 allows up to three; 4 and 5 any' : '',
          BTAGS.mld.has(c._n) ? 'Mass land denial (Bracket 4 and up)' : '',
          BTAGS.turns.has(c._n) ? 'Extra turn (a few at most below Bracket 4)' : ''
        ]
          .filter(Boolean)
          .join('; ') +
        '</dd>'
      : '') +
    (c.pt
      ? '<dt>' +
        (/Loyalty/.test(c.pt) ? 'Loyalty' : 'Power / toughness') +
        '</dt><dd>' +
        esc(c.pt.replace('Loyalty ', '')) +
        '</dd>'
      : '') +
    (c.r ? '<dt>EDHREC rank</dt><dd>#' + c.r.toLocaleString() + '</dd>' : '') +
    (c.set || c.rar ? '<dt>Printing</dt><dd id="pr-info">' + pickHtml(c) + '</dd>' : '') +
    '<dt>Does</dt><dd>' +
    ([...jobsShown(c)]
      .map(r => ROLE_LABEL[r] || {counter: 'Counterspell', tutor: 'Tutor', protect: 'Protection'}[r])
      .concat(tg.land ? ['Land'] : [])
      .join(', ') || 'Threat / synergy piece') +
    '</dd>' +
    (upFor(c).length
      ? '<dt>Upgrade for</dt><dd>' +
        upFor(c)
          .map(
            x =>
              '<button class="btn sm" data-act="open-deck" data-v="' +
              esc(x.id) +
              '">' +
              esc(x.name) +
              '</button> replaces ' +
              esc(x.cut) +
              ' <span class="chip">' +
              {apex: 'Apex', mid: 'Mid', budget: 'Budget'}[x.t] +
              '</span>'
          )
          .join('<br>') +
        '</dd>'
      : '') +
    '<dt>Fits</dt><dd>' +
    (th.join(', ') || 'No specific mechanic') +
    '</dd><dt>Source</dt><dd>' +
    (c.src === 'starter' ? 'Starter library' : 'Scryfall file, ' + DBINFO.when) +
    '</dd></dl>' +
    considerBox(c) +
    wantBox(c) +
    libBox(c) +
    '<div class="row">' +
    (d && d.format === 'commander' && legend && !d.aimLocked
      ? '<button class="btn" data-act="set-cmd" data-n="' + esc(c.n) + '">Make commander</button>'
      : '') +
    '<a class="btn" href="https://scryfall.com/search?q=' +
    encodeURIComponent('!"' + c.n + '"') +
    '" target="_blank" rel="noopener">Scryfall page</a></div></div></div></div>';
  $('#modal').hidden = false;
  if (c.id) {
    const p = $('#modal .panel'),
      mine = inDeck || isCmd,
      box =
        '<div class="grp"><span class="lab">' +
        (mine ? 'Printing in this deck · tap another to switch' : 'Printings · tap one, then add it') +
        '</span><div id="prints"><p class="note" style="margin:0">Loading printings…</p></div></div>';
    const anchor = mine ? $('#modal #ctl') || $('#modal .ph') : null;
    if (anchor) anchor.insertAdjacentHTML('afterend', box);
    else p.insertAdjacentHTML('beforeend', box);
    loadPrints(c);
  }
  // the other cards it could replace come last, after the card details and its printings
  if (!inDeck && S.wantMore && d && !isCmd && S.view === 'decks' && S.open)
    $('#modal .panel').insertAdjacentHTML('beforeend', S.wantMore);
  if (wantLater)
    setTimeout(() => {
      const el = $('#want-think');
      if (!el || S.modalCard !== c.n || $('#modal').hidden) return;
      const h = wantHtml(d, c);
      if (!$('#want-think') || S.modalCard !== c.n) return;
      $('#want-think').outerHTML = h;
      if (S.wantMore) $('#modal .panel').insertAdjacentHTML('beforeend', S.wantMore);
    }, 40);
}
function openImport(preset) {
  const d = cur();
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Import a deck list"><div class="ph"><h2>Import a text list</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p class="note" style="margin:0">One card per line, like <code>1 Sol Ring</code> or <code>4x Llanowar Elves</code>. Lists exported from Arena, Moxfield, Archidekt and MTGO work, including a “Commander” heading. Sideboards are skipped.</p>' +
    '<div class="row"><input type="file" id="imp-file" accept=".txt,.dek,.dec,text/plain" style="max-width:300px"><select id="imp-fmt" style="width:auto" aria-label="Format"><option value="commander">Commander</option><option value="standard"' +
    (preset && preset.format === 'standard' ? ' selected' : '') +
    '>Standard</option></select></div>' +
    playerSel('imp-player', S.impPlayer || '') +
    '<input type="text" id="imp-name" placeholder="Deck name" value="' +
    esc((preset && preset.name) || '') +
    '" maxlength="60"><textarea id="imp-text" placeholder="Commander&#10;1 Lathril, Blade of the Elves&#10;&#10;Deck&#10;1 Sol Ring&#10;1 Elvish Archdruid&#10;12 Forest"></textarea>' +
    '<div class="row"><button class="btn pri" data-act="import-go" data-v="new">Import as a new deck</button></div></div>';
  $('#modal').hidden = false;
  openImport.preset = preset || null;
}
function dropdown(input, box, filter, act) {
  const q = input.value.trim();
  if (q.length < 2) {
    box.hidden = true;
    return;
  }
  const r = searchCards(q, filter, 8);
  box.innerHTML =
    r.cards
      .map(
        c =>
          '<button data-act="' +
          act +
          '" data-n="' +
          esc(c.n) +
          '"><img alt="" src="' +
          artFor(c) +
          '"><span>' +
          nameHtml(c) +
          '<small>' +
          esc(c.t) +
          '</small></span><span>' +
          pips(c.m) +
          '</span></button>'
      )
      .join('') ||
    '<p class="note" style="margin:8px">No match in the ' +
      (DBINFO.source === 'starter' ? 'starter library' : 'database') +
      '.</p>';
  box.hidden = false;
}
async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch (e) {
    $('#modal').innerHTML =
      '<div class="panel"><div class="ph"><h2>Copy this text</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><textarea id="copy-box" readonly></textarea></div>';
    $('#modal').hidden = false;
    const t = $('#copy-box');
    t.value = text;
    t.select();
  }
}
