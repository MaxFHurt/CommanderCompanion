// ---------- price watch ----------
// A pick keeps the tier it was first recommended in (the price it had that day is saved with the deck). Later price moves are
// shown, never acted on silently: a big jump, or an installed card that stops being legal, raises one pop-up with choices.
const PRICE_JUMP = 1.5;
function driftOf(d, n, t) {
  const r = d && d.recP && d.recP[norm(n)],
    c = find(n);
  return r && r.t === t && c && c.p != null && TIERS[t] && c.p > TIERS[t].cap ? r : null;
}
function driftChip(d, n, t) {
  const r = driftOf(d, n, t),
    c = r && find(n);
  return r
    ? '<span class="chip warn" title="The price it had when it was first recommended for this deck, and now">Was $' +
        r.p.toFixed(2) +
        ' when picked · now $' +
        c.p.toFixed(2) +
        (c.p > r.p ? ' ▲' : c.p < r.p ? ' ▼' : '') +
        '</span>'
    : '';
}
function watchAlerts(d) {
  if (!d || !isAimed(d) || (d.plan && d.plan.length) || !DBINFO.complete || DBINFO.source === 'starter') return [];
  {
    const c0 = d.format === 'commander' ? find(d.commander) : null;
    if (c0 && (EDH.key !== c0.n || EDH.state === 'loading' || !EDH.state)) return []; // wait for the play data before holding any pick
    if (
      c0 &&
      EDH.state === 'ok' &&
      (d.aims.some(a => isEdhAim(a) && !(EDH.tmap || {})[a.slice(4)]) || (analyze(d).size >= 90 && !apexFor(d)))
    )
      return [];
  } // and for the theme pages and the Apex reference the score check uses
  const R = recsFor(d),
    out = [];
  let ch = false;
  if (R.pending || (R.pool && !R.poolDone)) return [];
  if (!d.recP) d.recP = {}; // picks are held once shown: after the whole-card search (0.9.3)
  (R.unlock || []).forEach(k => {
    if (d.recP[k]) {
      delete d.recP[k];
      ch = true;
    }
  }); // a clearly better card took the slot
  R.paths.forEach(L =>
    ['apex', 'mid', 'budget'].forEach(t => {
      const p = L.opts[t];
      if (!p || p.beaten) return;
      const c = find(p.add);
      if (!c) return;
      const k = norm(p.add),
        cap = TIERS[t].cap,
        r = d.recP[k];
      if (!r) return; // picks are no longer held once shown (owner, 24 Oct: held picks blocked swaps); only a chosen alternative is kept
      if (!r.pair && r.t === t) {
        r.pair = JSON.parse(JSON.stringify(p));
        ch = true;
      }
      if (t !== 'apex' && r.t === t && c.p != null && c.p > cap * PRICE_JUMP && !r.ack)
        out.push({kind: 'price', n: p.add, t, was: r.p, now: c.p, cut: L.cut});
    })
  );
  const ok = new Set((d.okIllegal || []).map(norm));
  d.cards.forEach(en => {
    const c = find(en.n);
    if (c && !legalIn(c, d.format) && !ok.has(norm(en.n))) out.push({kind: 'legal', n: en.n});
  });
  if (ch) persistSoon();
  return out;
}
function watchHtml(d, L) {
  const fmt = d.format === 'commander' ? 'Commander' : 'Standard',
    up = t => (t === 'budget' ? 'Mid or Apex' : 'Apex');
  let h =
    '<div class="panel" role="dialog" aria-label="Cards that need a decision"><div class="ph"><h2>' +
    (L.length === 1 ? 'One card needs a decision' : L.length + ' cards need a decision') +
    '</h2><small>' +
    esc(d.name) +
    '</small><button class="ico" data-act="close" aria-label="Close">×</button></div><div class="mscroll">';
  L.forEach(a => {
    const c = find(a.n);
    h +=
      '<div class="buygrp"><button class="sw out" data-act="card" data-n="' +
      esc(a.n) +
      '">' +
      (c ? '<img alt="" src="' + artFor(c) + '">' : '<span></span>') +
      '<span><small>' +
      (a.kind === 'price' ? TIERS[a.t].label + ' pick · replaces ' + esc(a.cut) : 'In your deck') +
      '</small>' +
      nameHtml(c, null, a.n) +
      '</span><em>' +
      (a.kind === 'price' ? 'was $' + a.was.toFixed(2) + ' · now $' + a.now.toFixed(2) : 'not legal') +
      '</em></button>' +
      (a.kind === 'price'
        ? '<p class="note" style="margin:6px 0">Its price has risen well past the ' +
          TIERS[a.t].label +
          ' line of $' +
          TIERS[a.t].cap +
          ' since it was recommended.</p><div class="row"><button class="btn pri sm" data-act="watch-keep" data-n="' +
          esc(a.n) +
          '">Keep it in ' +
          TIERS[a.t].label +
          '</button><button class="btn sm" data-act="watch-move" data-n="' +
          esc(a.n) +
          '" title="It becomes a ' +
          up(a.t) +
          ' option if it earns the place, and a cheaper card is suggested for ' +
          TIERS[a.t].label +
          '">Move it up, find another for ' +
          TIERS[a.t].label +
          '</button><button class="btn sm" data-act="watch-drop" data-n="' +
          esc(a.n) +
          '">Drop it</button></div>'
        : '<p class="note" style="margin:6px 0">This card is no longer legal in ' +
          fmt +
          '.</p><div class="row"><button class="btn pri sm" data-act="watch-fix">Show replacements</button><button class="btn sm" data-act="watch-ok" data-n="' +
          esc(a.n) +
          '">Keep it anyway</button></div>') +
      '</div>';
  });
  return h + '</div></div>';
}
function watchRun() {
  const d = cur();
  if (!d || !((S.view === 'decks' && S.open) || S.view === 'deck')) return;
  S.watchOpen = !$('#modal').hidden && !!$('#modal [aria-label="Cards that need a decision"]');
  if (!$('#modal').hidden && !S.watchOpen) return;
  const L = watchAlerts(d);
  watchRun.seen = watchRun.seen || new Set();
  const key = a => d.id + '|' + a.kind + '|' + norm(a.n);
  if (!L.length) {
    if (S.watchOpen) {
      $('#modal').hidden = true;
      S.watchOpen = false;
    }
    return;
  }
  if (!S.watchOpen && !L.some(a => !watchRun.seen.has(key(a)))) return;
  L.forEach(a => watchRun.seen.add(key(a)));
  S.modalCard = null;
  $('#modal').innerHTML = watchHtml(d, L);
  $('#modal').hidden = false;
  S.watchOpen = true;
}
function watchSoon() {
  clearTimeout(watchSoon.t);
  watchSoon.t = setTimeout(() => {
    try {
      watchRun();
    } catch (err) {}
  }, 500);
}
function persistSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(persist, 700);
}
function printOf(d, n) {
  const c = find(n),
    en = d.cards.find(x => x.n === n);
  if (n === d.commander && d.cmdSet) return {sc: d.cmdSet, cn: d.cmdCn || ''};
  if (en && en.psc) return {sc: en.psc, cn: en.pcn || ''};
  return c && c.sc ? {sc: c.sc, cn: c.cn || ''} : null;
}
function exportText(d, what) {
  const pr = S.expPrint !== false,
    ln = (q, n) => {
      const p = pr && !isBasic(n) ? printOf(d, n) : null;
      return q + ' ' + n + (p ? ' (' + p.sc.toUpperCase() + ')' + (p.cn ? ' ' + p.cn : '') : '');
    };
  const L = [];
  if (d.format === 'commander' && d.commander) {
    L.push('Commander', ln(1, d.commander));
    if (d.partner) L.push(ln(1, d.partner));
    L.push('', 'Deck');
  }
  exportRows(d, what).forEach(x => L.push(ln(x.q, x.n)));
  return L.join('\n') + '\n';
}
function exportCsv(d, what) {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"',
    line = (role, n, k) => {
      const c = find(n),
        i = printInfo(c) || {};
      return [k, q(n), role, q(c ? c.t : ''), q(i.set || ''), q(i.rar || ''), c && c.p != null ? c.p.toFixed(2) : ''].join(',');
    };
  const L = ['Quantity,Name,Role,Type,Set,Rarity,Price (USD)'];
  if (d.format === 'commander' && d.commander) {
    L.push(line('Commander', d.commander, 1));
    if (d.partner) L.push(line('Commander', d.partner, 1));
  }
  exportRows(d, what).forEach(x => L.push(line('Deck', x.n, x.q)));
  return L.join('\n') + '\n';
}
function exportName(d) {
  return (
    (d.name
      .replace(/[^\w -]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'deck') + (S.exp && S.exp !== 'deck' ? '-' + S.exp : '')
  );
}
// Share link: the deck is packed into the link itself (compressed), so nothing is stored online and no account is needed.
// Opening the link on any device shows the deck with Save to my decks.
const SHARE_KEYS = [
  'name',
  'format',
  'commander',
  'partner',
  'tier',
  'aims',
  'tribe',
  'colors',
  'types',
  'keys',
  'sets',
  'setsMust',
  'themeFirst',
  'typesMust',
  'keysMust'
];
const b64u = {
  enc: b => {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec: t => {
    const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
};
async function zipBytes(b, how) {
  const st = new Blob([b])
    .stream()
    .pipeThrough(how === 'z' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
async function shareCode(d) {
  const o = {v: 1};
  SHARE_KEYS.forEach(k => {
    const x = d[k];
    if (x != null && x !== '' && !(Array.isArray(x) && !x.length) && x !== false) o[k] = x;
  });
  o.cards = d.cards.map(e => (e.q > 1 ? [e.n, e.q] : e.n));
  const raw = new TextEncoder().encode(JSON.stringify(o));
  if (window.CompressionStream) {
    try {
      return 'z' + b64u.enc(await zipBytes(raw, 'z'));
    } catch (e) {}
  }
  return 'j' + b64u.enc(raw);
}
async function shareRead(code) {
  const t = String(code || ''),
    b = b64u.dec(t.slice(1)),
    raw = t[0] === 'z' ? await zipBytes(b, 'u') : b;
  const o = JSON.parse(new TextDecoder().decode(raw));
  if (!o || o.v !== 1 || !Array.isArray(o.cards)) throw new Error('bad');
  return o;
}
function shareUrl(code) {
  return location.origin + location.pathname + '#share=' + code;
}
async function openShare() {
  const d = cur();
  if (!d) return;
  const url = shareUrl(await shareCode(d));
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Share link"><div class="ph"><h2>Share link</h2><small>' +
    esc(d.name) +
    '</small><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p class="note" style="margin:0">Anyone who opens this link sees the deck (commander, cards and build settings) and can save a copy to their own decks. The deck is packed into the link itself: nothing is uploaded, and later changes to your deck are not included.</p>' +
    '<input type="text" id="share-url" readonly value="' +
    esc(url) +
    '" aria-label="Share link"><p class="note" style="margin:0">' +
    url.length.toLocaleString() +
    ' characters</p>' +
    '<div class="row"><button class="btn pri" data-act="share-copy">Copy link</button>' +
    (navigator.share ? '<button class="btn" data-act="share-send">Share…</button>' : '') +
    '</div></div>';
  $('#modal').hidden = false;
  S.shareUrl = url;
}
// An opened share link: show the deck and offer to save it.
async function checkShareLink() {
  const m = /^#share=([A-Za-z0-9_-]+)$/.exec(location.hash || '');
  if (!m) return;
  let o;
  try {
    o = await shareRead(m[1]);
  } catch (e) {
    toast('That share link is damaged or incomplete.');
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  S.shareIn = o;
  history.replaceState(null, '', location.pathname + location.search);
  showShareIn();
}
function showShareIn() {
  const o = S.shareIn;
  if (!o) return;
  const cards = o.cards.map(x => (Array.isArray(x) ? {n: x[0], q: x[1]} : {n: x, q: 1})),
    tot = cards.reduce((a, x) => a + x.q, 0) + (o.commander ? 1 : 0) + (o.partner ? 1 : 0),
    unknown = DBINFO.complete ? cards.filter(x => !find(x.n)).length : 0;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Shared deck"><div class="ph"><h2>Shared deck: ' +
    esc(o.name || 'Deck') +
    '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p class="note" style="margin:0">' +
    (o.commander ? 'Commander: <b>' + esc(o.commander) + (o.partner ? ' + ' + esc(o.partner) : '') + '</b> · ' : '') +
    tot +
    ' cards · ' +
    esc(o.format === 'standard' ? 'Standard' : 'Commander') +
    (unknown ? ' · ' + unknown + ' card' + (unknown === 1 ? '' : 's') + ' not in the card data yet (kept by name)' : '') +
    '</p>' +
    '<div class="allrows" style="max-height:40vh;overflow:auto">' +
    cards.map(x => '<div class="dl libr"><span class="nm">' + (x.q > 1 ? x.q + '× ' : '') + esc(x.n) + '</span></div>').join('') +
    '</div>' +
    '<div class="row"><button class="btn pri" data-act="share-save">Save to my decks</button><button class="btn" data-act="close">Not now</button></div></div>';
  $('#modal').hidden = false;
}
function saveShared() {
  const o = S.shareIn;
  if (!o) return null;
  const d = newDeck({name: o.name || 'Shared deck', format: o.format || 'commander', src: 'import'});
  if (o.commander) setCommander(d, o.commander);
  SHARE_KEYS.forEach(k => {
    if (k !== 'name' && k !== 'format' && k !== 'commander' && o[k] != null) d[k] = JSON.parse(JSON.stringify(o[k]));
  });
  d.cards = [];
  o.cards.forEach(x => {
    const n = Array.isArray(x) ? x[0] : x,
      q = Array.isArray(x) ? x[1] : 1,
      c = find(n);
    addCard(d, c ? c.n : n, q);
  });
  d.custom = true;
  S.profile.decks.unshift(d);
  S.draft = null;
  S.deckId = d.id;
  S.view = 'decks';
  S.open = true;
  S.tab = 'list';
  S.shareIn = null;
  touch();
  return d;
}
// Card lists by job: for the open deck, the best cards that do each job, ranked by the value its upgrades are chosen by,
// with price, how often this commander's players run them, and the deck score change against the card they'd best replace.
const JOB_TABS = [
  ['ramp', 'Ramp'],
  ['draw', 'Card draw'],
  ['removal', 'Removal'],
  ['wipe', 'Board wipes'],
  ['protect', 'Protection']
];
function jobList(d, job, k) {
  const R = recsFor(d),
    ctx = ctxOf(d),
    id = ctx.ident,
    dis = new Set((d.dismissed || []).map(norm));
  if (!R || !R.valOf) return [];
  return LIB.filter(
    c =>
      !tags(c).land &&
      tags(c).roles.has(job) &&
      c.ci.every(x => id.includes(x)) &&
      legalIn(c, d.format) &&
      !hasCard(d, c.n) &&
      !dis.has(c._n) &&
      !isBasic(c.n)
  )
    .map(c => ({c, v: R.valOf(c)}))
    .sort((a, b) => b.v - a.v || (a.c.r || 1e6) - (b.c.r || 1e6))
    .slice(0, k || 12);
}
function openJobs(job) {
  const d = cur();
  if (!d) return;
  S.jobTab = job = job || S.jobTab || 'ramp';
  const A = analyze(d),
    have = A.roles[job],
    want = A.T[job];
  const e = d.format === 'commander' && A.size >= 90 ? evalFor(d) : null,
    ar = e && e.exact != null ? apexFor(d) : null,
    cmdN = (find(d.commander) || {n: ''}).n.split(',')[0];
  const L = jobList(d, job, 12);
  const rows = L.map(({c}) => {
    let ds = null;
    if (e && e.exact != null) {
      const cu = bestCuts(d, c.n, 1)[0];
      if (cu && !cu.land) ds = swapScore(d, e, ar, cu.n, c.n, 1);
    }
    const x = ctxOf(d).edh && edhOf(ctxOf(d).edh.map, c),
      own = ownSet().has(c._n);
    return (
      '<div class="opt"><button class="sw in" data-act="card" data-n="' +
      esc(c.n) +
      '"><img alt="" src="' +
      artFor(c, {pid: c.id}) +
      '"><span>' +
      esc(c.n) +
      '</span><em>' +
      money(c) +
      '</em></button><div class="row">' +
      (ds != null ? scoreChip(ds) : '') +
      (x ? '<span class="chip">In ' + Math.max(1, Math.round(x.inc * 100)) + '% of ' + esc(cmdN) + ' decks</span>' : '') +
      (c.gc ? '<span class="chip gc">Game Changer</span>' : '') +
      (own ? '<span class="chip good">You own this</span>' : upBuyBtn(d, c.n)) +
      '</div></div>'
    );
  }).join('');
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Best by job"><div class="ph"><h2>Best by job</h2><small>' +
    esc(d.name) +
    '</small><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<div class="row seg">' +
    JOB_TABS.map(
      ([k, l]) =>
        '<button class="btn sm' + (k === job ? ' pri' : '') + '" data-act="jobs-tab" data-v="' + k + '">' + l + '</button>'
    ).join('') +
    '</div>' +
    '<p class="note" style="margin:0">' +
    (want ? 'The deck has ' + have + ' of about ' + want + '. ' : '') +
    'The strongest cards for this job in your colours that aren’t in the deck, ranked the way its upgrades are chosen. The score shows the change if each replaced the card the deck can best spare. Tap a card to put it in.</p>' +
    (rows
      ? '<div class="paths">' + rows + '</div>'
      : '<p class="note" style="margin:0">' +
        (DBINFO.complete ? 'No cards found for this job.' : 'Card data is still downloading.') +
        '</p>') +
    '</div>';
  $('#modal').hidden = false;
}
// Decks you can build: the commanders the cards you own fit best. A quick ranking first (owned cards in the commander's
// colours, counting double those that fit its plan, plus those from its own set; a commander you own counts extra), then, for the top three, a full
// build that prefers your cards (one at a time in the background) to show how much you own and what the rest would cost.
function dycbRank(k) {
  const own = Object.keys(lib())
      .map(find)
      .filter(c => c && !isBasic(c.n)),
    spells = own.filter(c => !tags(c).land),
    ownSetN = ownSet();
  if (!own.length) return [];
  const leads = LIB.filter(c => canLead(c) && legalIn(c, 'commander'));
  // the 300 most played commanders, any you own, and the legendary creatures from the sets most of your cards come from
  const sets = {};
  (own.forEach(c => {
    if (c.sc) sets[c.sc] = (sets[c.sc] || 0) + 1;
  }),
    (mainSets = new Set(
      Object.entries(sets)
        .filter(([, k]) => k >= 5)
        .map(([sc]) => sc)
    )));
  const pool = leads
    .slice()
    .sort((a, b) => (a.r || 1e6) - (b.r || 1e6))
    .slice(0, 300);
  leads.forEach(c => {
    if ((ownSetN.has(c._n) || mainSets.has(c.sc)) && !pool.includes(c)) pool.push(c);
  });
  return pool
    .map(c => {
      const st = detectStrategy(c),
        id = c.ci,
        inC = spells.filter(x => x._n !== c._n && x.ci.every(z => id.includes(z)));
      const onT = inC.filter(x => st.themes.some(t => matchAim(x, t, st.tribe) >= 0.7)).length,
        sameSet = c.sc ? inC.filter(x => x.sc === c.sc).length : 0;
      // owning many cards from a commander's own set (its precon or its set's theme) counts, as the app prefers on-theme cards
      const s = onT * 2 + inC.length * 0.25 + sameSet * 1.5 + (ownSetN.has(c._n) ? 12 : 0) - id.length * 0.5;
      return {c, s, inC: inC.length, onT, own: ownSetN.has(c._n)};
    })
    .filter(x => x.inC >= 5)
    .sort((a, b) => b.s - a.s)
    .slice(0, k || 10);
}
function dycbCost(c) {
  const own = ownSet(),
    d = {
      id: 'dycb',
      name: 'dycb',
      format: 'commander',
      commander: '',
      tier: 'apex',
      aims: [],
      tribe: '',
      colors: [],
      aimLocked: false,
      cards: [],
      dismissed: []
    };
  setCommander(d, c.n);
  const was = buildPlan.inRef;
  buildPlan.inRef = true;
  let P;
  try {
    P = buildPlan(d, [], own, own);
  } finally {
    buildPlan.inRef = was;
  } // a cost estimate for many commanders: no polishing
  let have = own.has(c._n) ? 1 : 0,
    total = 1,
    cost = 0,
    missing = 0;
  P.forEach(sl => {
    const x = find(sl.a);
    total += sl.q;
    if (x && (own.has(x._n) || isBasic(x.n))) have += sl.q;
    else {
      missing += sl.q;
      cost += ((x && x.p) || 0) * sl.q;
    }
  });
  if (!own.has(c._n)) cost += c.p || 0;
  return {have, total, cost, missing};
}
function openDycb() {
  const sig = Object.keys(lib()).length + ':' + S.libV + ':' + DBINFO.count;
  if (!S.dycb || S.dycb.sig !== sig) S.dycb = {sig, rows: dycbRank(10).map(r => Object.assign(r, {cost: null})), i: 0};
  const D = S.dycb,
    cmdOf = r => r.c.n;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Decks you can build"><div class="ph"><h2>Decks you can build</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    (!libCount()
      ? '<p class="note" style="margin:0">Your library is empty. Add the cards you own on any deck’s Library tab, then come back.</p>'
      : !D.rows.length
        ? '<p class="note" style="margin:0">' +
          (DBINFO.complete ? 'No commander fits enough of your cards yet.' : 'Card data is still downloading.') +
          '</p>'
        : '<p class="note" style="margin:0">Commanders your cards fit best, from the 300 most played, any you own, and those from the sets most of your cards come from. The top three are built from your cards to show how much you already own and what the rest would cost.</p><div class="allrows">' +
          D.rows
            .map(
              (r, i) =>
                '<div class="opt"><button class="sw in" data-act="card" data-n="' +
                esc(r.c.n) +
                '"><img alt="" src="' +
                artFor(r.c, {pid: r.c.id}) +
                '"><span>' +
                esc(r.c.n) +
                '</span><em>' +
                money(r.c) +
                '</em></button><div class="row">' +
                (r.own ? '<span class="chip good">You own this commander</span>' : '') +
                '<span class="chip">' +
                r.inC +
                ' of your cards fit its colours · ' +
                r.onT +
                ' on its plan</span>' +
                (r.cost
                  ? '<span class="chip gold">You own ' +
                    r.cost.have +
                    ' of ' +
                    r.cost.total +
                    ' · the rest ≈ $' +
                    r.cost.cost.toFixed(0) +
                    '</span>'
                  : i < 3
                    ? '<span class="chip">Working out the cost…</span>'
                    : '') +
                '<button class="btn pri sm" data-act="dycb-gen" data-n="' +
                esc(cmdOf(r)) +
                '" style="margin-left:auto">Generate from my cards</button></div></div>'
            )
            .join('') +
          '</div>') +
    '</div>';
  $('#modal').hidden = false;
  const next = D.rows.findIndex((r, i) => i < 3 && !r.cost);
  if (next >= 0 && !D.busy) {
    D.busy = true;
    setTimeout(() => {
      try {
        D.rows[next].cost = dycbCost(D.rows[next].c);
      } catch (e) {
        D.rows[next].cost = {have: 0, total: 100, cost: 0};
      }
      D.busy = false;
      if (!$('#modal').hidden && document.querySelector('#modal [aria-label="Decks you can build"]')) openDycb();
    }, 30);
  }
}
// Lands helper: how many lands, how many sources of each colour the spells need (Frank Karsten's tables, as the deck builder
// uses) against what the deck has (lands, plus mana rocks and creatures that make that colour), the popular lands for this
// commander the deck doesn't run, and the land swaps from the Show menus (measured with fresh practice games).
function landHelp(d) {
  const A = analyze(d),
    ctx = ctxOf(d),
    need = colourDemand(d, ctx),
    src = {},
    tapped = [];
  ctx.ident.forEach(k => (src[k] = {lands: 0, other: 0}));
  d.cards.forEach(e => {
    const c = find(e.n);
    if (!c) return;
    const L = landColors(c),
      land = tags(c).land;
    L.forEach(k => {
      if (src[k]) src[k][land ? 'lands' : 'other'] += e.q;
    });
    if (land && landSpeed(c) === 'tapped') tapped.push(e.n);
  });
  const edh = ctx.edh && ctx.edh.map,
    pop = edh
      ? LIB.filter(
          c => tags(c).land && !isBasic(c.n) && !hasCard(d, c.n) && c.ci.every(k => ctx.ident.includes(k)) && legalIn(c, d.format)
        )
          .map(c => ({c, x: edhOf(edh, c)}))
          .filter(o => o.x && o.x.inc >= 0.2)
          .sort((a, b) => b.x.inc - a.x.inc)
          .slice(0, 8)
      : [];
  return {A, need, src, tapped, pop, mp: manaPlan(d)};
}
function openLands() {
  const d = cur();
  if (!d) return;
  const H = landHelp(d),
    A = H.A,
    over = A.lands - A.T.lands,
    cmdN = (find(d.commander) || {n: ''}).n.split(',')[0],
    CN = {W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green'};
  const rows = Object.keys(H.src)
    .map(k => {
      const n = Math.round(H.need[k] || 0),
        h = H.src[k].lands + H.src[k].other,
        short = Math.max(0, n - h);
      return (
        '<dt><i class="pip p' +
        k +
        '">' +
        k +
        '</i> ' +
        CN[k] +
        '</dt><dd>' +
        (n
          ? 'needs about ' +
            n +
            ' sources · has ' +
            h +
            ' (' +
            H.src[k].lands +
            ' lands' +
            (H.src[k].other ? ', ' + H.src[k].other + ' other' : '') +
            ')' +
            (short ? ' <span class="chip warn">' + short + ' short</span>' : ' <span class="chip good">enough</span>')
          : 'no spells need it') +
        '</dd>'
      );
    })
    .join('');
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Lands helper"><div class="ph"><h2>Lands helper</h2><small>' +
    esc(d.name) +
    '</small><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p class="note" style="margin:0"><b>' +
    A.lands +
    ' lands</b>, about ' +
    A.T.lands +
    ' needed' +
    (over > 2
      ? ': ' + over + ' more than needed, so up to ' + over + ' can go for other cards.'
      : over < 0
        ? ': ' + -over + ' short.'
        : '.') +
    (H.tapped.length ? ' ' + H.tapped.length + ' enter tapped.' : '') +
    '</p>' +
    '<span class="lab">Colour sources</span><p class="note" style="margin:0">How many sources of each colour the spells need to be cast on time about 90% of the time (Frank Karsten’s tables, the commander counted twice), and what the deck has.</p><dl class="kv">' +
    rows +
    '</dl>' +
    '<div class="row">' +
    '<button class="btn pri sm" data-act="h-fix" data-v="Mana">Show land swaps</button>' +
    (over > 0 || A.lands < A.T.lands
      ? '<button class="btn sm" data-act="h-fix" data-v="Lands">' +
        (over > 0 ? 'Show spare-land swaps' : 'Show swaps that add lands') +
        '</button>'
      : '') +
    (H.mp.changes.length
      ? '<button class="btn sm" data-act="mana-apply">Rebalance basics: ' + esc(planText(H.mp)) + '</button>'
      : '') +
    '</div>' +
    (H.pop.length
      ? '<span class="lab">Lands ' +
        esc(cmdN) +
        ' decks often run that this one doesn’t</span><div class="allrows">' +
        H.pop
          .map(
            o =>
              '<div class="opt"><button class="sw in" data-act="card" data-n="' +
              esc(o.c.n) +
              '"><img alt="" src="' +
              artFor(o.c, {pid: o.c.id}) +
              '"><span>' +
              esc(o.c.n) +
              '</span><em>' +
              money(o.c) +
              '</em></button><div class="row"><span class="chip">In ' +
              Math.round(o.x.inc * 100) +
              '% of ' +
              esc(cmdN) +
              ' decks</span>' +
              (ownSet().has(o.c._n) ? '<span class="chip good">You own this</span>' : upBuyBtn(d, o.c.n)) +
              '</div></div>'
          )
          .join('') +
        '</div><p class="note" style="margin:0">Tap one to see what it would replace and how the deck score changes.</p>'
      : '') +
    '</div>';
  $('#modal').hidden = false;
}
function openExport() {
  const d = cur();
  if (!d) return;
  S.modalCard = null;
  const hasPlan = d.plan && d.plan.length;
  if (!hasPlan || !S.exp) S.exp = 'deck';
  const rows = exportRows(d, S.exp),
    n = rows.reduce((s, x) => s + x.q, 0) + (d.format === 'commander' && d.commander ? 1 : 0) + (d.partner ? 1 : 0);
  const opts = [['deck', 'Cards in the deck now']].concat(
    hasPlan ? TIER_KEYS.map(t => [t, 'Full build · ' + TIERS[t].label]) : []
  );
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Export deck"><div class="ph"><h2>Export</h2><small>' +
    esc(d.name) +
    '</small><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    (hasPlan
      ? '<div class="grp"><span class="lab">What to export</span><div class="seg">' +
        opts
          .map(
            o =>
              '<button data-act="export-what" data-v="' +
              o[0] +
              '" class="' +
              (S.exp === o[0] ? 'on' : '') +
              '">' +
              o[1] +
              '</button>'
          )
          .join('') +
        '</div><p class="note" style="margin:0">This deck is still a build in progress. A full build includes the cards not yet added, at the tier you choose.</p></div>'
      : '') +
    '<div class="grp"><span class="lab">' +
    n +
    ' cards · plain text</span><div class="seg"><button data-act="export-print" data-v="1" class="' +
    (S.expPrint !== false ? 'on' : '') +
    '">With printings<small>1 Sol Ring (C21) 263</small></button><button data-act="export-print" data-v="0" class="' +
    (S.expPrint === false ? 'on' : '') +
    '">Names only<small>1 Sol Ring</small></button></div><p class="note" style="margin:0">' +
    (S.expPrint !== false
      ? 'Each line carries its set code and collector number: the printing you chose for a card in this deck, or the cheapest printing when you haven’t chosen one. Moxfield, Archidekt and this app’s Import read it and keep those printings.'
      : 'One card per line with a Commander section. Every deck site accepts this; printings are left for the site to pick.') +
    '</p><textarea id="exp-box" readonly style="min-height:180px">' +
    esc(exportText(d, S.exp)) +
    '</textarea>' +
    '<div class="row"><button class="btn pri" data-act="export-copy">Copy text</button><button class="btn" data-act="export-txt">Save .txt file</button>' +
    (navigator.share ? '<button class="btn" data-act="export-share">Share…</button>' : '') +
    '</div></div>' +
    '<div class="grp"><span class="lab">Spreadsheet</span><p class="note" style="margin:0">A .csv file with quantity, name, type, set, rarity and price for each card. Opens in Numbers, Excel or Google Sheets.</p><div class="row"><button class="btn" data-act="export-csv">Save .csv file</button></div></div></div>';
  $('#modal').hidden = false;
}
function saveText(name, text) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function deckColors(d) {
  const s = new Set();
  const c0 = find(d.commander);
  if (c0) c0.ci.forEach(x => s.add(x));
  d.cards.forEach(e => {
    const c = find(e.n);
    if (c) c.ci.forEach(x => s.add(x));
  });
  return 'WUBRG'.split('').filter(x => s.has(x));
}
function openFindCmd() {
  const d = cur();
  if (!d) return;
  S.modalCard = null;
  if (!S.fc || S.fc.id !== d.id) S.fc = {id: d.id, colors: deckColors(d)};
  const cols = S.fc.colors,
    res = findCommanders(d, cols, 12),
    now = find(d.commander);
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Find a commander"><div class="ph"><h2>Find a commander</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p class="note" style="margin:0">Steer this deck toward a different commander. Pick the colors the commander must have: the deck’s current colors are selected, so add one to open the deck up to new cards. Results are ranked by how well they fit this deck’s build.</p>' +
    '<div class="grp"><span class="lab">Commander must include</span><div class="row">' +
    'WUBRG'
      .split('')
      .map(
        c =>
          '<button class="pip p' +
          c +
          (cols.includes(c) ? ' on' : '') +
          '" data-act="fc-color" data-v="' +
          c +
          '" aria-pressed="' +
          cols.includes(c) +
          '">' +
          c +
          '</button>'
      )
      .join('') +
    '</div>' +
    (now
      ? '<p class="note" style="margin:0">Current commander: ' +
        esc(now.n) +
        ' ' +
        now.ci.map(x => '<i class="pip p' + x + '">' + x + '</i>').join('') +
        '</p>'
      : '') +
    '</div>' +
    '<div class="grp">' +
    (res.length
      ? res
          .map(x => {
            const c = find(x.n);
            return (
              '<div class="pre"><img alt="" src="' +
              artFor(c) +
              '"><div style="min-width:0"><button class="nm" data-act="card" data-n="' +
              esc(c.n) +
              '" style="background:none;border:0;padding:0;color:inherit;font:inherit;font-weight:700;text-align:left">' +
              nameHtml(c) +
              '</button> ' +
              c.ci.map(k => '<i class="pip p' + k + '">' + k + '</i>').join('') +
              '<div class="why">' +
              x.why.map(w => '<span class="chip">' + esc(w) + '</span>').join('') +
              (x.outside
                ? '<span class="chip warn">' + x.outside + ' of your cards would fall outside its colors</span>'
                : '<span class="chip good">Every card in the deck stays legal</span>') +
              '</div></div><div class="acts"><button class="btn pri sm" data-act="fc-pick" data-n="' +
              esc(c.n) +
              '">Use</button></div></div>'
            );
          })
          .join('')
      : '<p class="note">No legendary creature in the card data has all of those colors' +
        (DBINFO.complete ? '.' : ' yet. More appear when the card download finishes.') +
        '</p>') +
    '</div>' +
    (DBINFO.complete ? '' : '<p class="note" style="margin:0">Card data is still downloading, so this list is incomplete.</p>') +
    '</div>';
  $('#modal').hidden = false;
}
function openList() {
  const d = cur();
  if (!d) return;
  const A = analyze(d);
  S.modalCard = null;
  S.listOpen = true;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Full decklist"><div class="ph"><h2>' +
    esc(d.name) +
    '</h2><small>' +
    deckStat(d, A) +
    '</small><button class="ico" data-act="close" aria-label="Close">×</button></div><div class="allrows">' +
    listRows(d) +
    '</div></div>';
  $('#modal').hidden = false;
}
const TIER_KEYS = ['budget', 'mid', 'apex'];
// Build plan (generated decks): every card is a recommendation until the player installs it.
function tierOfPrice(c) {
  return priceBand(c ? c.p : null);
}
// Card-type filter for the upgrade list and the build plan: shows only the slots that suggest a card of that type. It
// changes what is listed, not the picks; the tier buttons (Add all / Apply all) still cover the whole deck.
function upT() {
  return S.upType && S.upType.id === S.deckId ? S.upType.t : '';
} // the filter belongs to the deck it was set on
// Upgrade kind: what a suggested card brings (its job, whether it fills a gap in the deck's balance, fits the mechanics,
// is a Game Changer or a land). Filters the upgrade list like the card-type filter, and the two combine.
const KIND_LAB = {
  ramp: 'Ramp',
  draw: 'Card draw',
  removal: 'Removal',
  wipe: 'Board wipes',
  protect: 'Protection',
  counter: 'Counterspells',
  tutor: 'Tutors',
  balance: 'Fills a gap',
  synergy: 'Synergy',
  gc: 'Game Changers',
  land: 'Lands',
  power: 'Raw power'
};
function upK() {
  return S.upKind && S.upKind.id === S.deckId ? S.upKind.k : '';
}
function slotKinds(d, ps) {
  const k = new Set(),
    ctx = ctxOf(d);
  ps.forEach(p => {
    const c = p && find(p.add);
    if (!c) return;
    if (tags(c).land) {
      k.add('land');
      return;
    }
    jobsOf(c.n).forEach(j => {
      if (KIND_LAB[j]) k.add(j);
    });
    if (c.gc) k.add('gc');
    if ((p.why || []).some(w => /^Adds /.test(w))) k.add('balance');
    if (
      (d.aims || []).some(a => matchAim(c, a, ctx.tribe) >= 0.7) ||
      ctx.cmdThemes.some(a => matchAim(c, a, ctx.cmdTribe) >= 1) ||
      p.theme
    )
      k.add('synergy');
    if (![...k].some(x => x !== 'gc')) k.add('power');
  });
  return k;
}
const SORT_LAB = {impact: 'Biggest impact', engine: 'Recommended order', price: 'Cheapest first'};
// Upgrade sheets (the default view): one upgrade at a time as four cards side by side, your card, Budget, Mid and Apex, each with
// its picture, its effect on the deck score and its price. Tapping a card shows its details and actions below (the same row the
// list view shows, narrowed to that card); the arrows move between upgrades. List shows every upgrade as before.
function viewBar() {
  const v = S.upView || 'sheet',
    b = (k, t) =>
      '<button class="btn sm' +
      (v === k ? ' pri' : '') +
      '" data-act="upview" data-v="' +
      k +
      '" aria-pressed="' +
      (v === k) +
      '">' +
      t +
      '</button>';
  return '<div class="row"><span class="lab" style="margin:0">View</span>' + b('sheet', 'Sheets') + b('list', 'List') + '</div>';
}
function sheetSel(d, R, L, i) {
  const RC = rowCols(d, R, L, i),
    ok = t => t === 'cut' || !!(RC[t] && RC[t].p);
  if (S.sheetSel && ok(S.sheetSel)) return S.sheetSel;
  return ['apex', 'mid', 'budget'].find(ok) || 'cut';
}
function sheetHead(d, R, L, i, si, n, sel) {
  const RC = rowCols(d, R, L, i),
    en = d.cards.find(x => x.n === L.cut);
  const slot = (k, lab, name, chip, price) => {
    const c = name && find(name),
      e = k === 'cut' ? en : null; // your card in the printing you chose
    return (
      '<button class="s4' +
      (sel === k ? ' on' : '') +
      (name ? '' : ' empty') +
      '" data-act="sheet-pick" data-v="' +
      k +
      '" aria-pressed="' +
      (sel === k) +
      '"><small>' +
      lab +
      '</small>' +
      (c ? '<img alt="" src="' + artFor(c, e) + '">' : '<span class="noimg"></span>') +
      '<b>' +
      (c ? nameHtml(c, e, name) : esc(name || 'No pick')) +
      '</b><span class="r">' +
      chip +
      '</span><span class="p">' +
      price +
      '</span></button>'
    );
  };
  const sc = p =>
    p.dScore == null
      ? 'Not measured'
      : Math.abs(p.dScore) < SCORE_MIN
        ? 'Score unchanged'
        : (p.dScore > 0 ? '+' : '−') + Math.abs(p.dScore).toFixed(1) + ' score';
  return (
    '<div class="row sheethead"><button class="btn shnav" data-act="sheet-go" data-v="' +
    (si - 1) +
    '"' +
    (si ? '' : ' disabled') +
    ' aria-label="Previous upgrade">‹ Prev<span class="xs-hide">ious</span></button><span class="lab" style="flex:1;text-align:center;margin:0">Upgrade ' +
    (si + 1) +
    ' of ' +
    n +
    '</span><button class="btn pri shnav" data-act="sheet-go" data-v="' +
    (si + 1) +
    '"' +
    (si + 1 < n ? '' : ' disabled') +
    ' aria-label="Next upgrade">Next ›</button></div>' +
    '<div class="sheet4">' +
    slot('cut', 'Your card', L.cut, 'In the deck', en && en.pp != null ? '$' + en.pp.toFixed(2) : money(find(L.cut))) +
    ['budget', 'mid', 'apex']
      .map(t => {
        const p = RC[t] && RC[t].p;
        return slot(t, TIERS[t].label, p ? p.add : '', p ? sc(p) : 'None for this slot', p ? money(find(p.add)) : '');
      })
      .join('') +
    '</div>'
  );
}
// The upgrade filters as one row of drop-downs: view, sort, card type and kind (owner's layout, Build 131).
function filterBar(PT, shown, PK) {
  const sel = (act, lab, opts, v) =>
    '<label class="fsel"><span class="lab">' +
    lab +
    '</span><select data-act="' +
    act +
    '" aria-label="' +
    lab +
    '">' +
    opts.map(([k, t]) => '<option value="' + esc(k) + '"' + (k === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
    '</select></label>';
  const cT = {},
    cK = {};
  PT.forEach(s => s.forEach(t => (cT[t] = (cT[t] || 0) + 1)));
  PK.forEach(s => s.forEach(k => (cK[k] = (cK[k] || 0) + 1)));
  const ts = TYPE_ORDER.filter(t => cT[t]),
    ks = Object.keys(KIND_LAB).filter(k => cK[k]);
  return (
    '<div class="row fbar">' +
    sel(
      'upview',
      'View',
      [
        ['sheet', 'Sheets'],
        ['list', 'List']
      ],
      S.upView || 'sheet'
    ) +
    sel(
      'upsort',
      'Sort',
      Object.keys(SORT_LAB).map(k => [k, SORT_LAB[k]]),
      S.upSort || 'impact'
    ) +
    (ts.length >= 2 || upT()
      ? sel('uptype', 'Card type', [['', 'All · ' + PT.length]].concat(ts.map(t => [t, t + ' · ' + cT[t]])), upT() || '')
      : '') +
    (ks.length >= 2 || upK()
      ? sel('upkind', 'Kind', [['', 'All']].concat(ks.map(k => [k, KIND_LAB[k] + ' · ' + cK[k]])), upK() || '')
      : '') +
    '</div>' +
    (upT() && !shown ? '<p class="note" style="margin:0">No ' + esc(upT().toLowerCase()) + ' suggestions right now.</p>' : '')
  );
}
function sortBar() {
  const so = S.upSort || 'impact',
    b = v =>
      '<button class="btn sm' +
      (so === v ? ' pri' : '') +
      '" data-act="upsort" data-v="' +
      v +
      '" aria-pressed="' +
      (so === v) +
      '">' +
      SORT_LAB[v] +
      '</button>';
  return (
    '<div class="row typebar" role="group" aria-label="Sort upgrades"><span class="lab" style="margin:0">Sort</span>' +
    Object.keys(SORT_LAB).map(b).join('') +
    '</div>'
  );
}
function kindBar(sets) {
  const cnt = {};
  sets.forEach(s => s.forEach(t => (cnt[t] = (cnt[t] || 0) + 1)));
  const ks = Object.keys(KIND_LAB).filter(k => cnt[k]);
  if (ks.length < 2 && !upK()) return '';
  const b = (v, l) =>
    '<button class="btn sm' +
    (upK() === v ? ' pri' : '') +
    '" data-act="upkind" data-v="' +
    v +
    '" aria-pressed="' +
    (upK() === v) +
    '">' +
    l +
    '</button>';
  return (
    '<div class="row typebar" role="group" aria-label="Filter by kind of upgrade"><span class="lab" style="margin:0">Kind</span>' +
    b('', 'All') +
    ks.map(k => b(k, KIND_LAB[k] + ' · ' + cnt[k])).join('') +
    '</div>'
  );
}
function slotTypes(names) {
  const s = new Set();
  names.forEach(n => {
    const c = n && find(n);
    if (c) s.add(mainType(c));
  });
  return s;
}
function typeBar(sets, shown) {
  const cnt = {};
  sets.forEach(s => s.forEach(t => (cnt[t] = (cnt[t] || 0) + 1)));
  const ts = TYPE_ORDER.filter(t => cnt[t]);
  if (ts.length < 2 && !upT()) return '';
  const b = (v, l) =>
    '<button class="btn sm' +
    ((upT() || '') === v ? ' pri' : '') +
    '" data-act="uptype" data-v="' +
    v +
    '" aria-pressed="' +
    ((upT() || '') === v) +
    '">' +
    l +
    '</button>';
  return (
    '<div class="row typebar" role="group" aria-label="Filter by card type"><span class="lab" style="margin:0">Card type</span>' +
    b('', 'All · ' + sets.length) +
    ts.map(t => b(t, t + ' · ' + cnt[t])).join('') +
    '</div>' +
    (upT() && !shown ? '<p class="note" style="margin:0">No ' + esc(upT().toLowerCase()) + ' suggestions right now.</p>' : '')
  );
}
// The slots Add all would fill: best picks first (your picks, cards you own, spells, lands, basics), only as many as there is room for.
function planFill(d) {
  let room = planNeed(d) - d.cards.reduce((a, e) => a + e.q, 0);
  const rk = x => (x.seed ? 0 : x.own ? 1 : x.basic ? 4 : x.land ? 3 : 2);
  return (d.plan || [])
    .slice()
    .sort((a, b) => rk(a) - rk(b) || a.id - b.id)
    .filter(x => {
      if (room <= 0 || x.q > room) return false;
      room -= x.q;
      return true;
    });
}
function planCost(d, t) {
  let s = 0;
  planFill(d).forEach(x => {
    if (x.own || x.basic) return;
    const c = find(planPick(x, t));
    s += ((c && c.p) || 0) * x.q;
  });
  return s;
}
// A card that reaches the deck by any route (the Add a card box, a card's own Add to deck button, the Library) fills the plan
// slot that suggested it, so the slot is not counted twice. Basic lands are left to their own box.
function planSlotFor(d, n) {
  const k = keyOf(n);
  return (d.plan || []).find(x => !x.basic && [x.a, x.m, x.b].some(y => y && keyOf(y) === k));
}
// Regenerate a generated build around the cards already in the deck: they all stay, and the open slots are designed again
// for them (the same generator, with your cards as fixed picks). Cards you added yourself shape the rest of the plan.
async function regenPlan(d) {
  const seeds = d.cards
      .filter(e => !isBasic(e.n))
      .map(e => find(e.n))
      .filter(Boolean),
    have = new Map(d.cards.map(e => [keyOf(e.n), e.q]));
  const tmp = JSON.parse(JSON.stringify(d));
  await genRun(tmp, seeds, S.gen.own ? ownSet() : null, ownSet(), null);
  let P = tmp.plan
    .filter(x => !have.has(keyOf(x.a)) || x.basic)
    .map(x => (x.basic && have.get(keyOf(x.a)) ? Object.assign({}, x, {q: x.q - have.get(keyOf(x.a))}) : x))
    .filter(x => x.q > 0);
  // never more than the open slots: basics give way first, then the lowest-ranked picks
  let over = P.reduce((a, x) => a + x.q, 0) - Math.max(0, planNeed(d) - d.cards.reduce((a, e) => a + e.q, 0));
  for (const x of P.filter(y => y.basic)) {
    if (over <= 0) break;
    const k = Math.min(over, x.q);
    x.q -= k;
    over -= k;
  }
  P = P.filter(x => x.q > 0);
  while (over > 0 && P.length) {
    const i = P.map(x => (x.basic ? -1 : x.own ? 0 : x.land ? 1 : 2)).lastIndexOf(2);
    const j = i >= 0 ? i : P.length - 1;
    over -= P[j].q;
    P.splice(j, 1);
  }
  // Your cards are the starting point (the lowest tier): they stay, the open slots are filled with each slot's cheapest pick,
  // and from then on every suggestion is an upgrade from where the deck is. Undo puts the cards and the old plan back.
  d.regenUndo = {
    cards: JSON.parse(JSON.stringify(d.cards)),
    plan: d.plan ? JSON.parse(JSON.stringify(d.plan)) : null,
    recP: d.recP || {}
  };
  d.cards.forEach(e => {
    if (!isBasic(e.n)) e.step = 0;
  });
  let n = 0;
  P.forEach(x => {
    const pick = x.basic ? x.a : x.b || x.m || x.a,
      c = find(pick);
    addCard(d, pick, x.q);
    n += x.q;
    const en = d.cards.find(y => y.n === (c ? c.n : pick));
    if (en && !x.basic) en.step = x.b || x.m ? 1 : 0;
  });
  delete d.plan;
  delete d.planPrev;
  d.recP = {};
  S.planShow = 0;
  S.pathShow = 0;
  return n;
}
function planHtml(d) {
  const side = (kind, n, q) => {
    const c = find(n);
    return (
      '<button class="sw in" data-act="card" data-n="' +
      esc(n) +
      '">' +
      (c ? '<img alt="" src="' + artFor(c, {pid: c.id}) + '">' : '<span></span>') +
      '<span><small>Add</small>' +
      (q > 1 ? q + '× ' : '') +
      esc(n) +
      printTag(c) +
      '</span><em>' +
      money(c) +
      '</em></button>'
    );
  };
  const P = d.plan,
    total = P.reduce((s, x) => s + x.q, 0),
    done = d.cards.reduce((s, x) => s + x.q, 0),
    need = planNeed(d),
    room = Math.max(0, need - done),
    extra = Math.max(0, total - room),
    nOwn = P.filter(x => x.own).length,
    est = DBINFO.source === 'starter' ? '~' : '';
  const rank = x => (x.seed ? 0 : x.own ? 1 : x.land ? 3 : 2),
    basics = P.filter(x => x.basic),
    slots = P.filter(x => !x.basic).sort((a, b) => rank(a) - rank(b) || a.id - b.id),
    show = S.planShow || 16;
  const short = Math.max(0, need - done - total),
    must = d.typesMust || d.keysMust,
    vis = slots.filter(x => !upT() || slotTypes([x.a, x.m, x.b]).has(upT()));
  const opt = (x, key, t, n) =>
    '<div class="opt"><span class="chip gold">' +
    TIERS[t].label +
    '</span>' +
    side('in', n, x.q) +
    '<div class="row">' +
    altBtn('plan|' + x.id + '|' + key) +
    lackBtn(d, n) +
    '<button class="btn pri sm" data-act="plan-add" data-v="' +
    x.id +
    '|' +
    key +
    '" style="margin-left:auto">Add to deck</button></div></div>';
  const one = (x, label, cls) =>
    '<div class="opt"><span class="chip ' +
    cls +
    '">' +
    label +
    '</span>' +
    side('in', x.a, x.q) +
    '<div class="row">' +
    (x.own && !x.basic
      ? '<button class="btn sm" data-act="lib-not-own" data-n="' + esc(x.a) + '">Add to buy list</button>'
      : '') +
    (!x.basic ? altBtn('plan|' + x.id + '|a') : '') +
    (!x.own && !x.basic ? lackBtn(d, x.a) : '') +
    '<button class="btn pri sm" data-act="plan-add" data-v="' +
    x.id +
    '|a" style="margin-left:auto">Add to deck</button></div></div><div></div><div></div>';
  return (
    '<div class="tip good"><b><small>Build in progress</small>' +
    done +
    ' of ' +
    need +
    ' cards in the deck</b>' +
    (extra
      ? '<p class="note" style="margin:4px 0 0">' +
        room +
        ' slot' +
        (room === 1 ? '' : 's') +
        ' left and ' +
        total +
        ' suggested cards: you added ' +
        extra +
        ' card' +
        (extra === 1 ? '' : 's') +
        ' of your own, so pick the ones you want. Add all fills only the open slots, best picks first.</p>'
      : '') +
    '<ul><li class="pro"><i>+</i>This deck was designed as its strongest version first. Each expensive card also has a Mid and a Budget stand-in that does the same job.</li><li class="pro"><i>+</i>Nothing is in the decklist until you add it. Add cards one at a time, or finish the whole deck at one tier below.</li></ul></div>' +
    '<div class="tiers">' +
    TIER_KEYS.map(
      t =>
        '<div class="tierbox"><b>' +
        TIERS[t].label +
        '</b><span>Finish the deck</span><span>' +
        est +
        '$' +
        planCost(d, t).toFixed(0) +
        '</span><button class="btn sm" data-act="plan-all" data-v="' +
        t +
        '">Add all</button><em>' +
        (t === 'apex' ? 'the strongest build' : t === 'mid' ? 'nothing over $12' : 'nothing over $3') +
        (nOwn ? ', plus cards you own' : '') +
        '</em></div>'
    ).join('') +
    '</div>' +
    (nOwn
      ? '<div class="row"><button class="btn sm" data-act="plan-all" data-v="own">Add the ' +
        nOwn +
        ' card' +
        (nOwn === 1 ? '' : 's') +
        ' you already own</button></div>'
      : '') +
    (short
      ? '<div class="gate"><b>' +
        short +
        ' slot' +
        (short === 1 ? '' : 's') +
        ' could not be filled</b>' +
        (must
          ? 'Your filter rules leave too few cards to choose from. Switch a filter back to Preferred, or add cards yourself.'
          : 'There were not enough suitable cards. You can add cards yourself.') +
        '</div>'
      : '') +
    '<div class="grp"><span class="lab">Cards to add · ' +
    slots.length +
    ' slots</span>' +
    typeBar(
      slots.map(x => slotTypes([x.a, x.m, x.b])),
      vis.length
    ) +
    '<div class="paths plan">' +
    vis
      .slice(0, show)
      .map(x => {
        const c = find(x.a);
        return (
          '<div class="path">' +
          (x.basic
            ? one(x, 'Basic land', '')
            : x.seed
              ? one(x, x.own ? 'Your pick · you own this' : 'Your pick', 'good')
              : x.own
                ? one(x, 'Free · you own this', 'good')
                : !x.b && !x.m
                  ? one(
                      x,
                      tierOfPrice(c) === 'budget'
                        ? 'Best pick at every tier'
                        : TIERS[tierOfPrice(c)].label + ' · no cheaper stand-in found',
                      'gold'
                    )
                  : (x.b
                      ? opt(x, 'b', 'budget', x.b)
                      : '<div class="opt none"><span class="chip">Budget</span><p>No stand-in under $3</p></div>') +
                    (x.m
                      ? opt(x, 'm', 'mid', x.m)
                      : tierOfPrice(c) === 'mid'
                        ? opt(x, 'a', 'mid', x.a)
                        : '<div class="opt none"><span class="chip">Mid</span><p>Same as Budget</p></div>') +
                    (tierOfPrice(c) === 'apex'
                      ? opt(x, 'a', 'apex', x.a)
                      : '<div class="opt none"><span class="chip">Apex</span><p>Same as Mid</p></div>')) +
          '</div>'
        );
      })
      .join('') +
    '</div>' +
    (vis.length > show
      ? '<div class="row"><button class="btn" data-act="plan-more">Show ' +
        Math.min(24, vis.length - show) +
        ' more</button></div>'
      : '') +
    '</div>' +
    basicsBox(
      basics.map(x => ({n: x.a, q: x.q})),
      'plan-basics',
      'Add all basic lands',
      ''
    )
  );
}
// The deck is being built toward its Apex version. The best card found for a slot is that slot's Apex card, whatever it
// costs: when no stronger card exists above a pick, that pick stands for every tier above it.
// A weak upgrade is shown as an option but does not count: the slot's card for a tier is the best substantial pick.
// Each tier's package uses, for every slot, the Apex card when it already costs less than that tier's limit, otherwise the
// tier's own cheaper card (tierPick in engine.js). A card you own costs nothing.
// The best-under-$X package is a second full search, so it is worked out when you ask for it (it is then kept for this deck).
// The pick shown for a tier: its own pick; else the Apex card when it already costs under the tier's price; else, for a higher
// tier, the best cheaper pick (no stronger card was found, so it is the best at every tier above it).
// The upgrade table's three slots for one row. The best card is always in the Apex slot. A cheaper slot whose pick would just
// repeat a card already shown above it gets the next worthwhile card instead: one doing the same job, under that slot's
// price, raising the deck score by at least half as much as the best card (the alternatives rule). Only when there is none
// does the slot repeat the card, marked as the best at that price too.
const ROWC = {k: null, m: new Map()};
function rowCols(d, R, L, i) {
  if (ROWC.k !== R) {
    ROWC.k = R;
    ROWC.m = new Map();
  }
  if (ROWC.m.has(i)) return ROWC.m.get(i);
  // The score check ranks every slot (engine scoreCheck): Apex is the card that raises the deck score most, Mid and Budget the
  // best of the rest under $12 and $3, and each card appears once. Before the check finishes the engine's picks are shown.
  const O = L.opts,
    out = {},
    shown = new Set();
  // strongest first (tierCols): Apex the best card on the row, Mid and Budget the best of the rest at their price, each card once,
  // so a cheaper column never scores above a dearer one (owner, 24 Oct)
  const cols = tierCols(O, p => d.format === 'commander' && hasCard(d, p.add));
  for (const t of ['apex', 'mid', 'budget']) {
    const p = cols[t];
    if (p) {
      const src = p === O.apex ? 'apex' : p === O.mid ? 'mid' : 'budget';
      out[t] = {p, src, kind: src === t ? 'own' : 'moved'};
      shown.add(norm(p.add));
    } else
      out[t] = {
        p: null,
        note: (() => {
          // a stronger card above already costs under this price: it is this tier's pick too (Apply all uses it)
          const up = ['apex', 'mid'].find(u => u !== t && out[u] && out[u].p && tierFits(out[u].p, t));
          return up
            ? 'The ' +
                TIERS[up].label +
                ' card already costs under $' +
                TIERS[t].cap +
                ', so it is the ' +
                TIERS[t].label +
                ' pick too.'
            : (L.none && L.none[t]) ||
                (O.apex
                  ? 'No card under $' + TIERS[t].cap + ' that does this job raises the deck score after the cards above it.'
                  : '');
        })()
      };
  }
  out.shown = shown;
  ROWC.m.set(i, out);
  return out;
}
// Alternatives: cards that raise the deck score but lose to their own price tier's pick (at least half its gain), best three,
// worked out with the ranking in the score check.
function alt3Html(d, R, rowShown, p, i, t) {
  const L = R.paths[i],
    A = ((L && L.alts && L.alts[t]) || []).filter(a => !(d.format === 'commander' && hasCard(d, a.n)));
  if (!p || p.own || !A.length) return '';
  return (
    '<div class="alt3"><small class="lab" style="margin:0">Alternatives</small>' +
    A.map(a => {
      const c = find(a.n);
      return (
        '<div class="a3"><button class="sw in" data-act="card" data-n="' +
        esc(a.n) +
        '">' +
        (c ? '<img alt="" src="' + artFor(c, {pid: c.id}) + '">' : '<span></span>') +
        '<span>' +
        esc(a.n) +
        (a.theme ? ' <span class="chip gold">' + esc(a.theme) + '</span>' : '') +
        (c && c.gc ? ' <span class="chip gc">GC</span>' : '') +
        '</span><em>' +
        money(c) +
        '</em></button>' +
        '<div class="row">' +
        (a.onTheme
          ? '<span class="chip gold" title="On theme for this deck and nearly as strong as the pick above">On theme alternative</span>'
          : '') +
        (a.most
          ? '<span class="chip gold" title="The card this commander’s players choose here; the pick above raises the deck score more">Popular pick' +
            (a.inc ? ' · in ' + Math.round(a.inc * 100) + '% of decks' : '') +
            '</span>'
          : '') +
        (a.pc ? pcChip(a) : scoreChip(a.dScore)) +
        (a.unpop
          ? '<button class="chip warn" data-act="unpop" data-v="' +
            i +
            '|' +
            t +
            '" data-n="' +
            esc(a.n) +
            '" title="Tap for why">Unpopular pick ⓘ</button>'
          : '') +
        '<button class="btn sm" data-act="swap-a3" data-v="' +
        i +
        '|' +
        t +
        '" data-n="' +
        esc(a.n) +
        '" style="margin-left:auto">Swap</button></div></div>'
      );
    }).join('') +
    '</div>'
  );
}
function capBox(d, t) {
  const cap = TIERS[t].cap;
  if (!(S.capOpen && S.capOpen[d.id + t]))
    return (
      '<div class="capbox cb0" style="margin-top:8px;border-top:1px solid var(--line,#8884);padding-top:8px"><button class="btn sm" data-act="cap-show" data-v="' +
      t +
      '" title="Best deck with every card under $' +
      cap +
      '">Best deck under $' +
      cap +
      '</button></div>'
    );
  const L = capList(d, t);
  if (!L.length)
    return '<p class="note" style="margin:6px 0 0">Best deck with every new card under $' + cap + ': no worthwhile swaps.</p>';
  const cost = L.reduce((s, p) => {
    const a = find(p.add),
      c = find(p.cut);
    return s + ((p.own ? 0 : (a && a.p) || 0) - ((c && c.p) || 0)) * p.q;
  }, 0);
  return (
    '<div class="capbox" style="margin-top:8px;border-top:1px solid var(--line,#8884);padding-top:8px"><b style="font-size:.9em">Or: best deck with every new card under $' +
    cap +
    '</b><span>' +
    L.length +
    ' swap' +
    (L.length === 1 ? '' : 's') +
    ' · ' +
    (cost >= 0 ? '+' : '−') +
    '$' +
    Math.abs(cost).toFixed(0) +
    '</span>' +
    '<button class="btn sm" data-act="swap-cap" data-v="' +
    t +
    '">Apply all</button><em>the strongest upgrades using only cards under $' +
    cap +
    ' each; they need not match the Apex card’s job</em>' +
    '<details><summary>See the ' +
    L.length +
    ' swap' +
    (L.length === 1 ? '' : 's') +
    '</summary><ul style="margin:4px 0 0;padding-left:18px">' +
    L.map(
      p =>
        '<li>' +
        esc(p.cut) +
        ' → <b>' +
        esc(p.add) +
        '</b>' +
        (p.own ? ' (you own it)' : ' ($' + ((find(p.add) || {}).p || 0).toFixed(2) + ')') +
        (p.why && p.why[0] ? ' · ' + esc(p.why[0]) : '') +
        '</li>'
    ).join('') +
    '</ul></details></div>'
  );
}
// A tier's swaps: how many, what the new cards cost to buy (cards you own are free; the cards taken out are not subtracted,
// owner 24 Oct: "−$3" for eleven new cards made no sense), and which cards (to tell when two tiers make the same swaps).
function tierSum(d, R, t) {
  let n = 0,
    cost = 0;
  const keys = [];
  R.paths.forEach(L => {
    const p = tierPick(L, t);
    if (!p || !entryOf(d, p.cut)) return;
    n += p.q;
    const a = find(p.add);
    cost += (p.own ? 0 : (a && a.p) || 0) * p.q;
    keys.push(p.cut + '>' + p.add);
  });
  return {n, cost, keys: keys.join('|')};
}
// How big a step a pick is over the card it replaces, from the app's upgrade score. Words rather than percentages: a weak
// current card scores near zero, so a percentage would mislead.
// The size of an upgrade is what it does to the deck score (scoreCheck), measured on the whole deck; a swap that would not
// raise the score is never shown. Before the deck can be scored (fewer than 90 cards) no size is claimed.
// Players' choice (Build 143): many of this commander's players run the card, and the deck score sees the swap as about even.
function pcChip(p) {
  const inc = p.pcInc != null ? p.pcInc : p.inc;
  return (
    '<span class="chip gold" title="' +
    Math.round((inc || 0) * 100) +
    '% of this commander’s decks run this card. ' +
    (p.dScore != null && p.dScore >= SCORE_MIN
      ? 'The deck score rates it below the cards above it'
      : 'The deck score sees this swap as about even (' +
        (p.dScore > 0 ? '+' : '') +
        (p.dScore || 0).toFixed(2) +
        ', within the practice games’ margin)') +
    ', so it is listed on the players’ word.">Players’ choice · in ' +
    Math.round((inc || 0) * 100) +
    '% of decks</span>' +
    (p.dScore != null && p.dScore >= SCORE_MIN
      ? scoreChip(p.dScore)
      : '<span class="chip" title="Change to the deck score if you make this swap: about even, within the practice games’ margin">Score about even</span>')
  );
}
function scoreChip(v) {
  return v == null
    ? ''
    : v >= 0 && v < SCORE_MIN
      ? '<span class="chip" title="This swap keeps the deck score the same; it can still suit your plan or budget better">Score unchanged</span>'
      : '<span class="chip ' +
        (v > 0 ? 'good' : 'warn') +
        '" title="Change to the deck score if you make this swap">' +
        (v >= 2 ? 'Major upgrade · ' : v >= 1 ? 'Strong upgrade · ' : v > 0 ? 'Small upgrade · ' : '') +
        (v >= 0 ? '+' : '−') +
        Math.abs(v).toFixed(1) +
        ' score</span>';
}
function upChip(L, t) {
  const p = L.opts[t];
  return p ? scoreChip(p.dScore) : '';
}
// What applying a whole tier does to the deck's jobs and curve (from the engine's package check).
function packLine(R, t, n) {
  const k = R.pack && R.pack[t];
  if (!k || !n) return '';
  const lab = {ramp: 'Ramp', draw: 'Draw', removal: 'Removal', wipe: 'Wipes'};
  const ch = Object.keys(lab)
    .filter(j => k.jobs[j][0] !== k.jobs[j][1])
    .map(j => lab[j] + ' ' + k.jobs[j][0] + '→' + k.jobs[j][1]);
  return (
    '<em>' +
    (ch.length ? ch.join(' · ') : 'Ramp, draw and removal unchanged') +
    ' · avg cost ' +
    k.avg[0].toFixed(2) +
    '→' +
    k.avg[1].toFixed(2) +
    (k.removed ? ' · ' + k.removed + ' swap' + (k.removed === 1 ? '' : 's') + ' dropped by the package check' : '') +
    '</em>'
  );
}
// Basic lands are shown together in one box, by color: every player has them, so they are never priced or put on a buy list.
function basicsBox(rows, act, btn, note) {
  if (!rows.length) return '';
  const by = new Map();
  rows.forEach(r => by.set(r.n, (by.get(r.n) || 0) + r.q));
  const col = n => Object.keys(COLOR_BASIC).find(k => COLOR_BASIC[k] === n) || 'C',
    order = 'WUBRGC',
    L = [...by.entries()].sort((a, b) => order.indexOf(col(a[0])) - order.indexOf(col(b[0]))),
    tot = L.reduce((s, x) => s + x[1], 0);
  return (
    '<div class="grp"><span class="lab">Basic lands · ' +
    tot +
    '</span><div class="buygrp"><div class="row">' +
    L.map(
      ([n, q]) => '<span class="chip"><i class="pip p' + col(n) + '">' + col(n) + '</i> ' + q + ' × ' + esc(n) + '</span>'
    ).join('') +
    '<button class="btn pri sm" data-act="' +
    act +
    '" style="margin-left:auto">' +
    btn +
    '</button></div>' +
    (note
      ? '<p class="note" style="margin:6px 0 0">' + note + '</p>'
      : '<p class="note" style="margin:6px 0 0">Basic lands are treated as cards you already have. They are not priced and never appear on the buy list.</p>') +
    '</div></div>'
  );
}
// See alternatives: when you don't have a recommended card, cards close enough to fill its slot. Same job, same price band
// (Budget under $3, Mid under $12, Apex otherwise and at most twice the pick's price), strongest for this deck first (altsFor).
function altSrc(d, v) {
  const [k, a, b] = String(v || '').split('|');
  if (k === 'plan') {
    const x = (d.plan || []).find(y => y.id === +a),
      n = x && (b === 'b' ? x.b : b === 'm' ? x.m : x.a);
    return n ? {kind: 'plan', x, key: b, n, q: x.q} : null;
  }
  if (k === 'up') {
    const L = recsFor(d).paths[+a],
      p = L && L.opts[b];
    return p ? {kind: 'up', t: b, n: p.add, q: p.q, cut: p.cut, dScore: p.dScore} : null;
  }
  return null;
}
// Highest score: the card that raises the deck score most for this slot, of the cards measured, shown under the tier picks
// (popular picks still lead). Shown when it is not already one of the picks and beats the Apex pick by a real margin.
function topHtml(d, R, L, i) {
  return '<div class="topslot" data-i="' + i + '">' + topInner(d, R, L, i) + '</div>';
} // always one block, so every row keeps the same rows and lines up
function topInner(d, R, L, i) {
  if (R.pool && !R.poolDone && R.pool.rows.some(x => x.L === L))
    return '<p class="note think" style="margin:0">Thinking… searching every card for a higher score</p>'; // results wait until the search is done (owner)
  const tp = L.top;
  if (!tp || tp.dScore < SCORE_MIN || hasCard(d, tp.n)) return '';
  const cols = rowCols(d, R, L, i),
    picks = TIER_KEYS.map(t => cols[t] && cols[t].p).filter(Boolean),
    same = picks.find(p => keyOf(p.add) === keyOf(tp.n)),
    ap = cols.apex && cols.apex.p;
  if (same)
    return (
      '<p class="note" style="margin:0"><span class="chip good">Highest score</span> ' +
      esc(tp.n) +
      ' (shown above) raises the deck score the most of the cards measured for this slot.</p>'
    );
  if (ap && ap.dScore != null && tp.dScore < ap.dScore + 0.1) return '';
  return (
    '<div class="opt top"><span class="chip good">Highest score</span><button class="sw in" data-act="card" data-n="' +
    esc(tp.n) +
    '">' +
    (find(tp.n) ? '<img alt="" src="' + artFor(find(tp.n), {pid: find(tp.n).id}) + '">' : '<span></span>') +
    '<span><small>Add</small>' +
    esc(tp.n) +
    printTag(find(tp.n)) +
    '</span><em>' +
    money(find(tp.n)) +
    '</em></button>' +
    '<div class="row">' +
    scoreChip(tp.dScore) +
    (tp.inc < UP.unpop ? '<span class="chip warn" title="Few players of this commander run it">Few players run it</span>' : '') +
    '</div><div class="row">' +
    upBuyBtn(d, tp.n) +
    '<button class="btn pri sm" data-act="swap-top" data-v="' +
    i +
    '" data-n="' +
    esc(tp.n) +
    '" style="margin-left:auto">Swap</button></div></div>'
  );
}
function altBtn(v) {
  return '<button class="btn sm" data-act="alts" data-v="' + v + '">See alternatives</button>';
}
// Alternatives are never worse than the card now in the slot: each must raise the deck score, and by at least half of what the
// suggested card does, so it is almost as good. Cards from the commander's set and on-theme cards come first.
function altList(d, s) {
  if (s.kind === 'plan') {
    const P = d.plan || [],
      deck = d.cards.map(e => ({n: e.n, q: e.q})).concat(P.map(y => ({n: y.a, q: y.q})));
    return altsFor(d, s.n, {deck, skip: P.flatMap(y => [y.a, y.m, y.b]).filter(Boolean)});
  }
  const R = recsFor(d),
    L = altsFor(d, s.n, {cut: s.cut, val: R.valOf, skip: R.paths.flatMap(L => Object.values(L.opts).map(o => o.add)), n: 14});
  if (!R.dOf) return L.slice(0, 6);
  const need = Math.max(SCORE_MIN, s.dScore != null ? 0.5 * s.dScore : SCORE_MIN);
  return L.filter(a => !(d.format === 'commander' && hasCard(d, a.n)))
    .map(a => Object.assign(a, {dScore: R.dOf(s.cut, a.n, s.q)}))
    .filter(a => a.dScore != null && a.dScore >= need)
    .slice(0, 6);
}
function openAlts(v) {
  const d = cur(),
    s = d && altSrc(d, v);
  if (!s) return;
  S.modalCard = null;
  const c = find(s.n),
    band = tierOfPrice(c),
    job = mainJob(s.n),
    head =
      '<div class="panel" role="dialog" aria-label="Alternatives"><div class="ph"><h2>Alternatives to ' +
      esc(s.n) +
      '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>';
  $('#modal').innerHTML = head + '<p class="note" style="margin:0">Finding cards that do the same job…</p></div>';
  $('#modal').hidden = false;
  setTimeout(() => {
    if (cur() !== d || $('#modal').hidden) return;
    let L = [];
    try {
      L = altList(d, s);
    } catch (e) {
      console.error(e);
    }
    const tl = s.kind === 'up' ? TIERS[s.t] && TIERS[s.t].label : {a: 'Apex', m: 'Mid', b: 'Budget'}[s.key];
    const rule =
      (job
        ? 'Each one is ' + (JOB_LABEL[job] || job)
        : tags(c || {}).land
          ? 'Each one is a land making the same colours'
          : 'Each one is a ' + mainType(c).toLowerCase() + ' that fits the same part of your plan') +
      ', in the same price band as ' +
      esc(s.n.split(' // ')[0]) +
      ' (' +
      (band === 'budget'
        ? 'Budget: under $3'
        : band === 'mid'
          ? 'Mid: $3 to under $12'
          : 'Apex: $12 or more, and no more than twice its price') +
      ')' +
      (s.cut
        ? ', raises the deck score over ' +
          esc(s.cut.split(' // ')[0]) +
          ' by at least half as much as ' +
          esc(s.n.split(' // ')[0]) +
          ' does'
        : '') +
      '. Cards from your commander’s set and on-theme cards first, then the strongest.';
    const cur0 =
      s.kind === 'up' && s.dScore != null
        ? '<p class="note" style="margin:0 0 8px">Suggested now: <b>' + esc(s.n) + '</b> ' + scoreChip(s.dScore) + '</p>'
        : '';
    $('#modal').innerHTML =
      head +
      '<p class="note" style="margin:0 0 8px">' +
      rule +
      '</p>' +
      cur0 +
      (L.length
        ? '<div class="alts">' +
          L.map(a => {
            const ac = find(a.n);
            return (
              '<div class="opt alt"><button class="sw in" data-act="card" data-n="' +
              esc(a.n) +
              '">' +
              (ac ? '<img alt="" src="' + artFor(ac, {pid: ac.id}) + '">' : '<span></span>') +
              '<span>' +
              (s.q > 1 ? s.q + '× ' : '') +
              esc(a.n) +
              printTag(ac) +
              '</span><em>' +
              money(ac) +
              '</em></button><div class="row">' +
              scoreChip(a.dScore) +
              (a.theme ? '<span class="chip gold">' + esc(a.theme) + '</span>' : '') +
              (ac && ownSet().has(ac._n) ? '<span class="chip good">You own this</span>' : lackBtn(d, a.n)) +
              '<button class="btn pri sm" data-act="alt-use" data-v="' +
              esc(v) +
              '" data-n="' +
              esc(a.n) +
              '" style="margin-left:auto">Make this the ' +
              esc(tl || '') +
              ' pick</button></div></div>'
            );
          }).join('') +
          '</div>'
        : '<p class="note" style="margin:0">No other card in this price band does the same job and is close enough to ' +
          esc(s.n.split(' // ')[0]) +
          (s.cut ? ' while improving on ' + esc(s.cut.split(' // ')[0]) : '') +
          '.</p>') +
      '</div>';
  }, 30);
}
// Choosing an alternative does not add it to the deck: it becomes this slot's suggestion for that tier (held in place like any
// pick you have been shown), and you add it when you are ready, like any other suggestion.
function useAlt(d, v, n) {
  const s = altSrc(d, v),
    c = find(n);
  if (!s || !c) return false;
  if (s.kind === 'plan') {
    const k = s.key === 'b' ? 'b' : s.key === 'm' ? 'm' : 'a';
    s.x[k] = c.n;
    toast(c.n + ' is now the ' + {a: 'Apex', m: 'Mid', b: 'Budget'}[k] + ' pick for this slot.');
    return true;
  }
  if (!d.recP) d.recP = {};
  delete d.recP[norm(s.n)];
  d.recP[norm(c.n)] = {
    t: s.t,
    p: c.p,
    at: new Date().toISOString().slice(0, 10),
    pair: {cut: s.cut, add: c.n, q: s.q, t: s.t},
    chosen: true
  };
  toast(c.n + ' is now the ' + TIERS[s.t].label + ' pick for ' + s.cut + '.');
  return true;
}
// The commander's top EDHREC themes as build aims, with their theme pages loaded (none when the data can't be read).
async function edhAimsFor(c) {
  try {
    await loadEdh(c.n);
    if (EDH.key !== c.n || EDH.state !== 'ok' || !(EDH.tags || []).length) return [];
    const aims = EDH.tags.slice(0, 3).map(t => 'edh:' + t.slug);
    await loadThemes(c.n, aims);
    return aims.filter(a => EDH.tmap[a.slice(4)]);
  } catch (e) {
    return [];
  }
}
// Start a generated deck as a build plan.
// The new deck a generation starts from: commander, partner, mechanics and options, not yet opened or built.
function planDeck(cmdName, extraAims, partner, opts) {
  const c = find(cmdName);
  if (!c) return null;
  const nd = newDeck(
    Object.assign(
      {name: c.n.split(',')[0] + ' (generated)', format: 'commander', tier: 'apex', auto: 'commander', src: 'generated'},
      opts && opts.sets && opts.sets.length ? {sets: opts.sets.slice(), setsMust: !!opts.setsMust} : {}
    ),
    true
  );
  setCommander(nd, c.n);
  {
    const p = partner && find(partner);
    if (p && canPair(c, p)) {
      nd.partner = p.n;
      nd.name = c.n.split(',')[0] + ' & ' + p.n.split(',')[0] + ' (generated)';
      nd.colors = ctxOf(nd).ident.slice();
      ctxOf(nd).cmdThemes.forEach(a => {
        if (nd.aims.length < 3 && !nd.aims.includes(a)) nd.aims.push(a);
      });
    }
  }
  // Apex generation builds around what players build this commander around (EDHREC's top themes, with their theme pages
  // loaded): measured against the strongest real decks (bracket 4–5) it matches them more closely than the detected mechanics.
  if (opts && opts.aims && opts.aims.length) {
    nd.aims = opts.aims.slice(0, 3);
    nd.aimAuto = !opts.mechChosen;
    if (opts.mechChosen) nd.aimLocked = true;
  }
  if (opts && opts.themeFirst) nd.themeFirst = true;
  if (opts && opts.tribe) {
    nd.tribe = opts.tribe;
    nd.aimLocked = true;
  } // Build by theme: the chosen creature type
  if (opts && opts.player) nd.player = opts.player;
  if (opts && opts.budget) nd.budget = Object.assign({}, opts.budget);
  (extraAims || []).forEach(a => {
    if (nd.aims.length < 3 && !nd.aims.includes(a)) nd.aims.push(a);
  });
  return nd;
}
// Every way of generating builds the whole deck list (owner, 24 Oct: "I don't want to manually add all the cards"). With no price
// level chosen the deck is built like a precon: at Budget (every card under $3), the level nearest a retail precon (Turtle
// Power's precon scores 80 against the best Budget build's 87). A commander with no strategy of its own is built on what its
// players build (EDHREC themes) or, with none, on card strength and jobs alone, like a precon.
async function startPlan(cmdName, seeds, extraAims, partner, opts) {
  opts = Object.assign({}, opts);
  const preconLike = !opts.fill;
  if (preconLike) opts.fill = 'budget';
  const c = find(cmdName),
    nd = planDeck(cmdName, extraAims, partner, opts);
  if (!nd) return null;
  if (!nd.aims.length)
    try {
      const ea = await edhAimsFor(c);
      if (ea.length) nd.aims = ea;
    } catch (e) {}
  const G = await genRun(nd, seeds || [], S.gen.own ? ownSet() : null, ownSet(), opts.fill);
  openDraft(nd);
  S.tab = 'up';
  S.planShow = 0;
  {
    const n = G.n,
      want = 100 - 1 - (nd.partner ? 1 : 0),
      short =
        n < want
          ? ' Only ' +
            n +
            ' of ' +
            want +
            ' slots could be filled' +
            ((nd.sets || []).length && nd.setsMust ? ' from the chosen sets' : '') +
            '; the rest stay open.'
          : '';
    // The deck is built straight into the decklist at the chosen price level; the stronger picks stay as its upgrades.
    {
      const k = G.k;
      S.tab = 'list';
      toast(
        'Built ' +
          k +
          ' cards for ' +
          c.n.split(',')[0] +
          ' at ' +
          TIERS[opts.fill].label +
          '.' +
          short +
          (preconLike ? ' No price level was chosen, so it is built like a precon (Budget: every card under $3).' : '') +
          (!nd.aims.length ? ' This commander has no strategy of its own, so the deck is built on card strength and jobs.' : '') +
          (opts.fill === 'apex' ? '' : ' The Upgrades tab shows the steps up.') +
          (nd.budget && nd.budget.total && nd.budget.cost != null
            ? nd.budget.cost <= nd.budget.total
              ? ' It costs $' + nd.budget.cost.toFixed(2) + ' of your $' + (+nd.budget.total).toFixed(2) + ' budget.'
              : ' It could not get under your $' +
                (+nd.budget.total).toFixed(2) +
                ' budget: the cheapest build found costs $' +
                nd.budget.cost.toFixed(2) +
                '.'
            : '')
      );
    }
  }
  return nd;
}
// The total budget for a generated Budget deck, or null (no total, or another price level)
function genBudget(cmdOwned) {
  const g = S.gen;
  return g.tier === 'budget' && g.budget > 0 ? {total: +g.budget, cmdOwned: !!cmdOwned} : null;
}
function ownToggle(kind) {
  const n = libCount();
  return (
    '<div class="row"><button class="chk' +
    (S.gen.own && n ? ' on' : '') +
    '" data-act="gen-own" data-v="' +
    kind +
    '"' +
    (n ? '' : ' disabled') +
    ' role="checkbox" aria-checked="' +
    !!(S.gen.own && n) +
    '"><i></i>Generate a deck with cards I already own</button>' +
    (n
      ? '<span class="note">Uses your library of ' + n.toLocaleString() + ' cards first, then fills the gaps.</span>'
      : '<span class="note">Your library is empty. Add the cards you own on a deck’s Library tab.</span>') +
    '</div>'
  );
}
// Commander Brackets: the deck's target bracket, its Game Changers, and anything the bracket leaves out.
function bracketHtml(d, A) {
  const b = A.ctx.bracket,
    gc = A.gc.length,
    mld = A.mld.length,
    turns = A.turns.length;
  const track =
    '<div class="prog" style="grid-template-columns:repeat(5,1fr)" role="img" aria-label="Bracket ' +
    b +
    ' of 5">' +
    Object.keys(BRACKETS)
      .map(
        k =>
          '<span class="' +
          (+k <= b ? 'done' : '') +
          (+k === b ? ' here' : '') +
          '"><i></i>' +
          k +
          ' · ' +
          BRACKETS[k].label +
          '</span>'
      )
      .join('') +
    '</div>';
  let bar, note;
  if (b === 2) {
    bar = '<div class="meter good"><span>Game Changers</span><i><b style="width:0%"></b></i><span>0</span></div>';
    note = 'No Game Changers, so the deck sits in Bracket 2. The first Game Changer you add moves it to Bracket 3.';
  } else if (b === 3) {
    bar =
      '<div class="meter ' +
      (gc >= 3 ? 'warn' : 'good') +
      '"><span>Game Changers</span><i><b style="width:' +
      Math.min(100, (gc / 3) * 100) +
      '%"></b></i><span>' +
      gc +
      ' / 3</span></div>';
    note =
      gc >= 3
        ? 'The deck is at the top of Bracket 3. One more Game Changer moves it to Bracket 4.'
        : 'Room for ' + (3 - gc) + ' more Game Changer' + (3 - gc === 1 ? '' : 's') + ' before the deck moves to Bracket 4.';
  } else {
    bar = '<div class="meter good"><span>Game Changers</span><i><b style="width:100%"></b></i><span>' + gc + '</span></div>';
    note =
      (mld && gc <= 3 ? 'Mass land denial puts the deck in Bracket 4. ' : gc + ' Game Changers put the deck in Bracket 4. ') +
      'There is no limit from here up.';
  }
  const chips = A.gc
    .map(n => '<button class="chip gc" data-act="card" data-n="' + esc(n) + '">' + esc(n) + '</button>')
    .concat(
      A.mld.map(n => '<button class="chip warn" data-act="card" data-n="' + esc(n) + '">Land denial · ' + esc(n) + '</button>'),
      turns
        ? [
            '<span class="chip">' +
              turns +
              ' extra-turn card' +
              (turns === 1 ? '' : 's') +
              (b < 4 && turns > 2 ? ' · Brackets 2 and 3 expect only a few' : '') +
              '</span>'
          ]
        : []
    );
  return (
    '<div class="grp"><span class="lab">Commander bracket · ' +
    b +
    ' · ' +
    BRACKETS[b].label +
    '</span>' +
    track +
    bar +
    (chips.length ? '<div class="row">' + chips.join('') + '</div>' : '') +
    '<p class="note" style="margin:0">' +
    note +
    ' This is a label showing where the deck stands, not a limit: nothing is blocked, and upgrades that would move the deck up a bracket are marked. Brackets 1 and 5 depend on how you intend to play, so the app does not assign them.</p></div>'
  );
}
// Label for a Game Changer upgrade: where it leaves the deck.
function gcChip(p, R) {
  if (!p.gc) return '';
  const after = R.gcIn + (p.gcOut ? 0 : p.q),
    nb = bracketOf(after, R.mldIn || 0);
  return (
    '<span class="chip gc" title="On Wizards’ Game Changer list: among the cards that most change games. They are often what moves a deck up a tier.">Game Changer' +
    (p.gcOut
      ? ' · replaces one'
      : nb > R.bracket
        ? ' · moves deck to Bracket ' + nb
        : R.bracket === 3
          ? ' · ' + after + ' of 3 in Bracket 3'
          : '') +
    '</span>'
  );
}
// Deck score: the whole-deck evaluator (engine evaluateDeck), cached until the deck, its build or the data behind it changes.
const EVC = new Map(),
  APX = new Map();
// The Apex reference for a deck's build settings (engine apexRef): designed once in the background, then saved in this browser.
function apexFor(d) {
  if (
    d.format !== 'commander' ||
    !find(d.commander) ||
    !DBINFO.complete ||
    (EDH.key === find(d.commander).n && EDH.state === 'loading')
  )
    return null;
  const k = apexKey(d),
    lk = 'dc.apx.' + strHash(k);
  const withTot = v => {
    if (v && (!v.tot || !v.tot.parts) && !apexFor.tbusy) {
      apexFor.tbusy = true;
      setTimeout(() => {
        try {
          v.tot = refScores(d, v);
          lsSet(lk, v);
        } catch (e) {}
        apexFor.tbusy = false;
        render();
      }, 80);
    }
    return v;
  }; // references saved before Build 123 get their deck power
  if (APX.has(k)) return withTot(APX.get(k));
  const c = lsGet(lk);
  if (c && c.key === k) {
    APX.set(k, c);
    return withTot(c);
  }
  if (!apexFor.busy) {
    apexFor.busy = true;
    setTimeout(() => {
      let r = null;
      try {
        r = apexRef(d);
        if (r) r.tot = refScores(d, r);
      } catch (e) {}
      apexFor.busy = false;
      APX.set(k, r);
      if (r) lsSet(lk, r);
      render();
    }, 60);
  }
  return null;
}
function evalFor(d) {
  const key = [
    d.commander,
    d.partner || '',
    (d.aims || []).join(','),
    d.tribe || '',
    EDH.key,
    EDH.state,
    Object.keys(EDH.tmap || {}).length,
    DBINFO.count,
    [...SETCARDS.keys()].join(),
    COMBOS.list.length,
    d.cards
      .map(e => e.n + '×' + e.q)
      .sort()
      .join('|')
  ].join('#');
  const ar = apexFor(d),
    k2 = key + '#' + (ar ? 'apex' : 'pending');
  const old = EVC.get(d.id);
  if (old && old.key === k2) return old.v;
  const sim = old && old.base === key && old.v ? old.v.sim : undefined; // same cards: the practice games need not be replayed
  let v = null;
  try {
    v = evaluateDeck(d, {games: 300, apex: ar, sim});
  } catch (e) {}
  EVC.set(d.id, {key: k2, base: key, v});
  return v;
}
// The game plan (owner, 25 Oct: "Gameplans and upgrade plans should all be on the upgrades tab"): how the commander works (its
// needs) and how the deck wins (combos, finishers, a combo one card away), on the Upgrades tab.
function gamePlanHtml(d, A) {
  if (d.format !== 'commander' || !A.ctx.cmd || A.size < 90 || !DBINFO.complete) return '';
  const e = evalFor(d);
  if (!e) return '';
  const pr = e.profile,
    cmdN = esc(A.ctx.cmd.n.split(',')[0]),
    wins = e.combos.win,
    near = e.combos.near.filter(x => x.x.win).slice(0, 3);
  let more = '';
  if (pr && (pr.plan || e.needs.length))
    more +=
      '<span class="lab">How ' +
      cmdN +
      ' works</span>' +
      (pr.plan ? '<p class="note" style="margin:0">' + esc(pr.plan) + '</p>' : '') +
      (e.needs.length
        ? '<div class="row">' +
          e.needs
            .map(
              x =>
                '<span class="chip ' +
                (x.have >= x.min ? 'good' : 'warn') +
                '">' +
                esc(x.label) +
                ' · ' +
                (x.share ? Math.round(x.have * 100) + '%' : x.have) +
                (x.have >= x.min ? '' : ' (wants ' + (x.share ? Math.round(x.min * 100) + '%' : x.min) + '+)') +
                '</span>'
            )
            .join('') +
          '</div>'
        : '') +
      (pr.reviewed ? '' : '<p class="note" style="margin:0">Read from the commander’s text; not a reviewed profile.</p>');
  more +=
    '<span class="lab">How it wins</span>' +
    (wins.length
      ? wins
          .slice(0, 3)
          .map(
            x =>
              '<p class="note" style="margin:0"><b>Combo:</b> ' +
              esc(x.names.join(' + ')) +
              ' · ' +
              esc(x.what.toLowerCase()) +
              '</p>'
          )
          .join('')
      : '') +
    (e.finishers.length
      ? '<div class="row">' +
        e.finishers
          .slice(0, 10)
          .map(n => '<button class="chip" data-act="card" data-n="' + esc(n) + '">' + esc(n) + '</button>')
          .join('') +
        '</div>'
      : '<p class="note" style="margin:0">No clear finisher: nothing that ends a game quickly (a mass pump, extra combat, drain, or big evasive threat).</p>') +
    (near.length
      ? near
          .map(
            x =>
              '<p class="note" style="margin:0">One card from a combo: add <b>' +
              esc(x.miss) +
              '</b> to ' +
              esc(x.x.names.filter(n => n !== x.miss).join(' + ')) +
              ' · ' +
              esc(x.x.what.toLowerCase()) +
              '</p>'
          )
          .join('')
      : '') +
    (COMBOS.state === 'fail'
      ? '<p class="note" style="margin:0">Combo data could not be downloaded, so combos are not shown.</p>'
      : COMBOS.state === 'loading'
        ? '<p class="note" style="margin:0">Loading combo data…</p>'
        : '') +
    (COMBOS.list.length ? '<p class="note" style="margin:0">Combos from Commander Spellbook.</p>' : '');
  return (
    '<details class="more grp" id="plan-more"' +
    (S.planOpen ? ' open' : '') +
    '><summary><span class="lab" style="margin:0">Game plan: how ' +
    cmdN +
    ' works and how the deck wins</span></summary><div class="grp" style="margin-top:8px">' +
    more +
    '</div></details>'
  );
}
function scoreHtml(d, A) {
  if (d.format !== 'commander' || !A.ctx.cmd || A.size < 90 || !DBINFO.complete) return '';
  const e = evalFor(d);
  if (!e) return '';
  const L = {synergy: 'Synergy', balance: 'Balance', quality: 'Card quality', routes: 'Win routes', mana: 'Mana and curve'};
  const bar = k => {
    const v = e.parts[k],
      cls = v >= 75 ? 'good' : v >= 50 ? 'warn' : 'bad';
    return (
      '<div class="meter ' +
      cls +
      '"><span>' +
      L[k] +
      '</span><i><b style="width:' +
      v +
      '%"></b></i><span>' +
      v +
      '</span></div>'
    );
  };
  const pr = e.profile,
    cmdN = esc(A.ctx.cmd.n.split(',')[0]),
    wins = e.combos.win,
    near = e.combos.near.filter(x => x.x.win).slice(0, 3);
  let more =
    '<p class="note" style="margin:0">' +
    Object.keys(L)
      .map(k => '<b>' + L[k] + '</b> (' + EV_W[k] + '% of the score): ' + esc(e.why[k]))
      .join('<br>') +
    '</p>' +
    '<p class="note" style="margin:0">60 is like a typical real deck for its commander; 85 is like the best tenth. Mana and curve come from ' +
    e.sim.games +
    ' practice games played out by the app (no opponents). The score judges how the deck is built, not how a game will go.</p>';
  if (e.weak.length) {
    const by = new Map();
    e.weak.forEach(w => {
      if (!by.has(w.n)) by.set(w.n, w);
    });
    more +=
      '<span class="lab">Cards this deck barely supports</span>' +
      [...by.values()]
        .slice(0, 6)
        .map(
          w =>
            '<p class="note" style="margin:0"><b>' +
            esc(w.n) +
            '</b> needs ' +
            esc(w.label) +
            ': the deck has ' +
            (w.share ? Math.round(w.have * 100) + '%' : w.have) +
            ' (usually ' +
            (w.share ? Math.round(w.min * 100) + '%' : w.min) +
            ' or more).</p>'
        )
        .join('');
  }
  const qq = e.quality || {},
    qLine = qq.pending
      ? '<p class="note think" style="margin:-2px 0 4px">Thinking… measuring card quality against this deck’s Apex build</p>'
      : '<p class="note" style="margin:-2px 0 4px">Card quality: ' +
        qq.vsApex +
        '% of the Apex build (the best cards for this deck at any price)' +
        (qq.tier
          ? ' · ' + qq.tier.pct + '% of the best build with every card under $' + (qq.tier.tier === 'budget' ? 3 : 12)
          : '') +
        '</p>';
  return (
    '<div class="grp"><span class="lab">Deck score · ' +
    e.total +
    ' of 100</span>' +
    Object.keys(L)
      .map(k => bar(k) + (k === 'quality' ? qLine : ''))
      .join('') +
    '<details class="more" id="score-more"' +
    (S.scoreOpen ? ' open' : '') +
    '><summary>Why each part scores as it does</summary><div class="grp" style="margin-top:8px">' +
    more +
    '</div></details></div>'
  );
}
// Running stats at the top of Upgrades: strength, where the cards sit between Budget and Apex, what the upgrades have cost
// and what is left, and the deck's health. Recomputed on every change, with the change since you started and since the
// last change. The start point is taken the first time the deck is scored and kept with the deck (Reset sets it again).
const STATL = new Map();
function statDelta(v, ref, unit) {
  if (ref == null || v == null || v === ref) return '';
  const x = v - ref;
  return '<em class="' + (x > 0 ? 'up' : 'dn') + '">' + (x > 0 ? '+' : '−') + Math.abs(x) + (unit || '') + '</em>';
}
// Tier-meter labels: marks closer than 22 points share one label so they never overlap on a phone.
// Apex progress bar (Build 131): zoomed to the range that matters (from a little below the lower of your deck and the Budget
// build up to Apex), with Budget, Mid and Apex each marked in their own colour and labelled with their power score in a legend
// row under the bar (labels never overlap).
// The reference builds are scored by practice games, so a cheaper one can land a hair above a dearer one: the marks are kept in
// order (a build allowed every card under $12 can always match the under-$3 one; Apex can match both) (owner, 24 Oct).
function refOrder(T) {
  return T && {budget: T.budget, mid: Math.max(T.mid, T.budget), apex: Math.max(T.apex, T.mid, T.budget)};
}
// Deck power (owner, 25 Oct: "Budget being 87 and Apex being 91 is too tight"): the deck score placed on this deck's own builds,
// Budget build 70, Mid 85, Apex 100, in between by the score. Below Budget the scale curves down to 0 at a score of 0 (owner,
// 26 Oct: "When 1 card enters the deck's power should be above 0"): 70 x (score / Budget's)^(Budget's / 25), as steep near
// Budget as the old straight line that ran out at 25 points under it, so a precon still lands around 55; any deck with a
// score is at least 1. Above the Apex build each score point adds 3. The deck score itself (what upgrades are chosen by) is
// unchanged.
const POWER_MARKS = {budget: 70, mid: 85, apex: 100},
  POWER_FLOOR = 25;
function powerOf(x, T) {
  const b = T.budget,
    m = T.mid,
    a = T.apex;
  if (x >= a) return 100 + 3 * (x - a);
  if (x >= m) return 85 + (15 * (x - m)) / Math.max(0.01, a - m);
  if (x >= b) return 70 + (15 * (x - b)) / Math.max(0.01, m - b);
  if (!(x > 0) || !(b > 0)) return 0;
  return Math.max(1, 70 * Math.pow(x / b, b / POWER_FLOOR));
}
// What keeps a deck below the next level (owner's choice B): each part of its score against that level's build, the biggest
// weighted gaps first, with the part's own explanation (which jobs are short, how many finishers).
const SCORE_PART = {synergy: 'Synergy', balance: 'Balance', quality: 'Card quality', routes: 'Win routes', mana: 'Mana'},
  PART_FIX = {
    synergy: 'more cards that fit the deck’s plans',
    balance: 'cover the jobs players run (ramp, draw, removal, wipes, lands)',
    quality: 'stronger cards',
    routes: 'more ways to win: finishers, combos, protection, recursion',
    mana: 'smoother mana: lands, colours, curve'
  };
function gapHtml(e, T0r, lvl) {
  const next = lvl === 'Starter' ? 'budget' : lvl === 'Budget' ? 'mid' : lvl === 'Mid' ? 'apex' : null,
    P = next && T0r && T0r.parts && T0r.parts[next];
  if (!P || !e || !e.parts) return '';
  const W = typeof EV_W !== 'undefined' ? EV_W : {},
    gaps = Object.keys(P)
      .filter(k => e.parts[k] != null && P[k] != null && P[k] - e.parts[k] >= 3)
      .map(k => ({k, d: P[k] - e.parts[k], w: (P[k] - e.parts[k]) * (W[k] || 10)}))
      .sort((a, b) => b.w - a.w);
  const ahead = Object.keys(P).filter(k => e.parts[k] != null && P[k] != null && e.parts[k] - P[k] >= 3);
  if (!gaps.length) return '';
  return (
    '<div class="gapbox"><p class="note" style="margin:0"><b>What keeps it below ' +
    TIERS[next].label +
    '</b> (this deck’s ' +
    TIERS[next].label +
    ' build, part by part):</p><ul class="gaps">' +
    gaps
      .map(
        g =>
          '<li><b>' +
          SCORE_PART[g.k] +
          ' ' +
          e.parts[g.k] +
          ' vs ' +
          P[g.k] +
          '</b>: ' +
          PART_FIX[g.k] +
          (e.why && e.why[g.k] ? ' <small class="note">(' + esc(e.why[g.k]) + ')</small>' : '') +
          '</li>'
      )
      .join('') +
    '</ul>' +
    (ahead.length
      ? '<p class="note" style="margin:0">Already ahead of it on ' +
        ahead.map(k => SCORE_PART[k].toLowerCase()).join(', ') +
        '.</p>'
      : '') +
    '</div>'
  );
}
function tmeterHtml(qp, mk, lvl, sc, power) {
  const lo = mk ? Math.max(0, Math.floor(Math.min(qp, mk.budget) - 8)) : 0,
    x = v => Math.max(0, Math.min(100, (100 * (v - lo)) / Math.max(1, 100 - lo)));
  const mark = (k, v, t) => '<u class="tk ' + k + '" style="left:' + x(v).toFixed(1) + '%" title="' + t + '"></u>',
    lab = (k, name, v) => '<span class="tml ' + k + '"><i></i>' + name + ' <b>' + v + '</b></span>';
  return (
    '<div class="tmeter" role="img" aria-label="' +
    (power ? 'Deck power ' + qp + ' (Budget build 70, Mid 85, Apex 100); ' : 'Card quality ' + qp + '% of the Apex build; ') +
    lvl +
    ' level"><i><b style="width:' +
    x(qp).toFixed(1) +
    '%"></b>' +
    (mk
      ? mark('tb', mk.budget, 'Best build with every card under $3') + mark('tm', mk.mid, 'Best build with every card under $12')
      : '') +
    mark('ta', 100, 'Apex build') +
    '</i>' +
    '<div class="tm-leg">' +
    lab('ty', 'You', sc ? sc.you : qp + '%') +
    (mk ? lab('tb', 'Budget', sc ? sc.budget : mk.budget + '%') + lab('tm', 'Mid', sc ? sc.mid : mk.mid + '%') : '') +
    lab('ta', 'Apex', sc ? sc.apex : '100%') +
    '</div></div>'
  );
}
function tmLabels(mk) {
  const L = (
      mk
        ? [
            {p: mk.budget, t: 'Budget ' + mk.budget},
            {p: mk.mid, t: mk.mid >= 99 ? 'Mid' : 'Mid ' + mk.mid}
          ]
        : []
    ).concat({p: 100, t: 'Apex'}),
    out = [];
  L.forEach(x => {
    const y = out[out.length - 1];
    if (y && x.p - y.p < 22) {
      y.t += ' · ' + x.t;
      y.p = x.p;
    } else out.push(Object.assign({}, x));
  });
  return out
    .map(
      x =>
        '<span style="' +
        (x.p >= 80
          ? 'right:' + (100 - x.p) + '%;transform:none'
          : x.p <= 15
            ? 'left:' + x.p + '%;transform:none'
            : 'left:' + x.p + '%') +
        '">' +
        esc(x.t) +
        '</span>'
    )
    .join('');
}
function statsHtml(d, A, R, mode) {
  // mode "compact" (Upgrades tab): deck score and Apex progress only
  if (d.format !== 'commander') return '';
  const T = A.T,
    e = A.size >= 90 && A.ctx.cmd && DBINFO.complete ? evalFor(d) : null,
    q = (e && e.quality) || {},
    val = n => {
      const c = find(n);
      return c && c.p != null && !isBasic(c.n) ? c.p : 0;
    };
  if (e && !q.pending && !d.base) {
    d.base = {score: e.total, q: q.vsApex, at: new Date().toISOString().slice(0, 10)};
    persistSoon();
  }
  const L = STATL.get(d.id) || {};
  if (e && !q.pending && (L.score !== e.total || L.q !== q.vsApex)) {
    STATL.set(d.id, {score: e.total, q: q.vsApex, prev: L.score != null ? {score: L.score, q: L.q} : L.prev || null});
  }
  const prev = (STATL.get(d.id) || {}).prev,
    B = d.base;
  // health: each indicator is good, warn or bad
  const H = [],
    st = (have, want) => (have >= want ? 'good' : have >= want * 0.7 ? 'warn' : 'bad');
  const v = validateDeck(d),
    open = Math.max(0, T.size - A.size);
  H.push({
    k: 'Legal',
    s: v.length ? 'bad' : open ? 'warn' : 'good',
    t: v.length
      ? v.length + ' rule problem' + (v.length === 1 ? '' : 's')
      : open
        ? open + ' open slot' + (open === 1 ? '' : 's')
        : A.size + ' cards, legal'
  });
  // Lands: too few is a problem, and so are three or more over the target (owner: the extras can go for other cards)
  if (T.lands) {
    const over = A.lands - T.lands;
    H.push({
      k: 'Lands',
      s: over >= 6 ? 'bad' : over >= 3 ? 'warn' : st(A.lands, T.lands),
      t: A.lands + ' / ' + T.lands + (over >= 3 ? ' · ' + over + ' more than needed' : '')
    });
  }
  [
    ['Ramp', A.roles.ramp, T.ramp],
    ['Draw', A.roles.draw, T.draw],
    ['Removal', A.roles.removal, T.removal],
    ['Wipes', A.roles.wipe, T.wipe]
  ].forEach(([k, h, w]) => {
    if (w) H.push({k, s: st(h, w), t: h + ' / ' + w});
  });
  // counterspells and protection from both card readings (jobsShown, display only; no target, so no colour)
  {
    const J = shownJobs(d);
    H.push({
      k: 'Interaction',
      s: 'info',
      t: J.counter + ' counterspell' + (J.counter === 1 ? '' : 's') + ' · ' + J.protect + ' protection'
    });
  }
  H.push({k: 'Curve', s: A.avg <= 3.3 ? 'good' : A.avg <= 3.7 ? 'warn' : 'bad', t: 'avg ' + A.avg.toFixed(2)});
  if (e && e.sim) {
    const m = e.sim,
      bad = Math.max(m.colourStuck, m.screwT5);
    H.push({k: 'Mana', s: bad <= 0.12 ? 'good' : bad <= 0.22 ? 'warn' : 'bad', t: manaText(m)});
  }
  if (e) {
    const w = e.combos.win.length,
      f = e.finishers.length;
    H.push({
      k: 'Win routes',
      s: w || f >= 4 ? 'good' : f >= 2 ? 'warn' : 'bad',
      t: f + ' finisher' + (f === 1 ? '' : 's') + (w ? ' · ' + w + ' combo' + (w === 1 ? '' : 's') : '')
    });
    const un = e.needs.filter(x => x.have < x.min);
    if (e.needs.length)
      H.push({
        k: 'Commander',
        s: un.length ? 'warn' : 'good',
        t: un.length
          ? 'short on ' +
            un
              .map(x => x.label)
              .slice(0, 2)
              .join(', ')
          : 'its needs are met'
      });
  }
  const ign = new Set(d.ignoreH || []),
    HA = H.filter(x => !ign.has(x.k)),
    nBad = HA.filter(x => x.s === 'bad').length,
    nWarn = HA.filter(x => x.s === 'warn').length,
    hs = nBad ? 'bad' : nWarn ? 'warn' : 'good',
    fixable = HA.filter(x => x.s !== 'good' && FIX_OF[x.k]);
  // upgrade totals
  const sw = d.cards.filter(x => x.hist && x.hist.length),
    nSw = sw.reduce((a, x) => a + x.hist.length, 0),
    own = ownSet();
  const spent = sw.reduce((a, x) => {
      const c = find(x.n);
      return a + (c && !own.has(c._n) ? val(x.n) * x.q : 0);
    }, 0),
    worth = d.cards.reduce((a, x) => a + val(x.n) * x.q, 0);
  const left = R && !R.pending ? TIER_KEYS.map(t => ({t, s: tierSum(d, R, t)})) : [],
    want = wantOf(d),
    wCost = want.reduce((a, x) => a + val(x.n) * (x.q || 1), 0);
  // tier meter: the deck's cards between random playable cards (0) and the Apex build (100), with the best Budget and Mid builds marked
  // Apex progress is deck power: the deck's whole score against the Budget, Mid and Apex reference builds scored the same way
  // (Apex = 100). Card quality alone could put a strong deck below Budget. Before the references are scored, card quality stands in.
  const T0r = (apexFor(d) || {}).tot,
    T0 = refOrder(T0r),
    pw = e && T0 && T0.apex > 0 ? (100 * e.exact) / T0.apex : null,
    pwr = pw != null ? powerOf(e.exact, T0) : null, // deck power: Budget build 70, Mid 85, Apex 100 (owner, 25 Oct)
    pc = v => Math.max(0, Math.min(100, Math.round(v)));
  const mk = pw != null ? {budget: POWER_MARKS.budget, mid: POWER_MARKS.mid} : q.marks,
    qp = pw != null ? pc(pwr) : q.vsApex;
  // the level compares unrounded scores (0.9.3 fix: 95.6% of Apex and a Budget mark at 95.74% both rounded to 96 read as Budget)
  const lvl =
    qp == null || !mk
      ? ''
      : pw != null
        ? pw >= 99.5
          ? 'Apex'
          : e.exact >= T0.mid
            ? 'Mid'
            : e.exact >= T0.budget
              ? 'Budget'
              : 'Starter'
        : qp >= 97
          ? 'Apex'
          : qp >= mk.mid
            ? 'Mid'
            : qp >= mk.budget
              ? 'Budget'
              : 'Starter';
  const tierMeter =
    qp == null
      ? '<p class="note' +
        (e ? ' think' : '') +
        '" style="margin:0">' +
        (e
          ? 'Thinking… measuring against this deck’s Apex build'
          : A.size < 90
            ? 'The tier meter appears once the deck has 90 or more cards.'
            : 'The tier meter appears once the card data has finished downloading.') +
        '</p>'
      : tmeterHtml(
          qp,
          mk,
          lvl,
          pw != null ? {you: Math.round(pwr), budget: POWER_MARKS.budget, mid: POWER_MARKS.mid, apex: POWER_MARKS.apex} : null,
          pw != null
        ) +
        (pw != null
          ? '<p class="note" style="margin:0">Your deck is at <b>' +
            lvl +
            '</b> level' +
            (lvl === 'Starter' ? ' (below the best Budget build)' : '') +
            ': power <b>' +
            Math.round(pwr) +
            '</b>, on this deck’s own builds: the best all-under-$3 build is 70, all-under-$12 85, Apex 100 (deck score ' +
            e.total +
            '; the builds score ' +
            Math.round(T0.budget) +
            ', ' +
            Math.round(T0.mid) +
            ' and ' +
            Math.round(T0.apex) +
            ').</p>' +
            gapHtml(e, T0r, lvl)
          : '<p class="note" style="margin:0">Your cards are at <b>' +
            lvl +
            '</b> level' +
            (lvl === 'Starter' ? ' (below the best Budget build)' : '') +
            ': ' +
            qp +
            '% of the way from random playable cards to the Apex build' +
            statDelta(qp, B && B.q, ' pts') +
            (B && B.q != null && B.q !== qp ? ' since ' + B.at : '') +
            '. The marks show where the best all-under-$3 and all-under-$12 builds land.</p>');
  const strip =
    '<div class="statbar" role="status" aria-live="polite"><span>' +
    (pwr != null
      ? 'Power <b>' +
        Math.round(pwr) +
        '</b>' +
        (prev && prev.score != null ? statDelta(Math.round(pwr), Math.round(powerOf(prev.score, T0))) : '')
      : '<b>' + (e ? e.total : '—') + '</b>/100' + (e ? statDelta(e.total, prev && prev.score) : '')) +
    '</span>' +
    (lvl ? '<span>Tier <b>' + lvl + '</b></span>' : '') +
    // the price level is a rule on what the deck may cost, shown apart from the power tier (owner, 20 Oct); a generated deck
    // with a total budget shows what is left to buy against it
    (d.format === 'commander' && TIERS[d.tier]
      ? '<span>Price <b>' +
        TIERS[d.tier].label +
        '</b>' +
        (d.budget && d.budget.total > 0 ? ' · $' + Math.round(deckCost(d, own)) + ' of $' + Math.round(d.budget.total) : '') +
        '</span>'
      : '') +
    (A.ctx.bracket ? '<span>Bracket <b>' + A.ctx.bracket + '</b></span>' : '') +
    '<span>Swaps <b>' +
    nSw +
    '</b></span><span class="hdot ' +
    hs +
    '">Health ' +
    (nBad + nWarn ? nBad + nWarn + ' to watch' : 'good') +
    '</span>' +
    (edhNote(A.ctx.cmd)
      ? '<span class="sb-edh" title="' + esc(edhNote(A.ctx.cmd).replace(/<[^>]+>/g, '')) + '">' + edhNote(A.ctx.cmd) + '</span>'
      : '') +
    '</div>'; // the play-data chip sits at the bar's right end (owner, 19 Oct)
  const open1 = S.statsOpen !== false;
  // Upgrades tab (owner, 25 Oct: "the path to apex ... needs to be on the upgrades tab ... under the progress bar"; "Gameplans and
  // upgrade plans should all be on the upgrades tab"): the bar, where the deck stands and what keeps it below the next level, the
  // Path to Apex, the upgrades left at each level and how the commander works and wins. Build stats keeps the stats.
  const leftHtml = left.length
    ? '<div class="grp"><span class="lab">Upgrades left</span><div class="row">' +
      left
        .map(
          x =>
            '<span class="chip' +
            (x.s.n ? '' : ' good') +
            '">' +
            TIERS[x.t].label +
            ' · ' +
            (x.s.n ? x.s.n + ' swap' + (x.s.n === 1 ? '' : 's') + ' · $' + x.s.cost.toFixed(0) + ' to buy' : 'done') +
            '</span>'
        )
        .join('') +
      '</div></div>'
    : '';
  if (mode === 'compact')
    return strip + '<div class="grp">' + tierMeter + '</div>' + apexTips(d, A, R, e, HA, lvl) + leftHtml + gamePlanHtml(d, A);
  return (
    strip +
    '<details class="stats grp" id="stats-more"' +
    (open1 ? ' open' : '') +
    '><summary><span class="lab" style="margin:0">Build stats</span></summary>' +
    '<div class="sgrid"><div><small>Deck score</small><b>' +
    (e ? e.total : '—') +
    '</b>' +
    (e
      ? statDelta(e.total, B && B.score) + (B && B.score !== e.total ? '<span class="note"> since ' + B.at + '</span>' : '')
      : '') +
    '</div>' +
    '<div><small>Card quality</small><b>' +
    (qp == null ? '—' : qp + '%') +
    '</b><span class="note">of Apex</span></div>' +
    '<div><small>Bracket</small><b>' +
    (A.ctx.bracket || '—') +
    '</b><span class="note">' +
    (A.ctx.bracket ? esc(BRACKETS[A.ctx.bracket].label) : '') +
    '</span></div>' +
    '<div><small>Deck value</small><b>$' +
    worth.toFixed(0) +
    '</b><span class="note">excluding basics</span></div>' +
    '<div><small>Swaps made</small><b>' +
    nSw +
    '</b></div>' +
    '<div><small>Buy list</small><b>' +
    want.length +
    '</b><span class="note">$' +
    wCost.toFixed(0) +
    '</span></div></div>' +
    // Health in one compact row (owner, 25 Oct: it should not take much vertical space)
    '<span class="lab">Health</span><div class="hgrid compact">' +
    H.map(
      x =>
        '<span class="hi ' +
        (ign.has(x.k) ? 'ign' : x.s) +
        '" title="' +
        esc(x.k + ': ' + x.t) +
        '"><i></i><b>' +
        x.k +
        '</b> ' +
        esc(x.t) +
        (ign.has(x.k) ? ' · ignored' : '') +
        '</span>'
    ).join('') +
    '</div>' +
    healthFixHtml(H, ign, fixable) +
    (B
      ? '<div class="row"><span class="note">Changes are counted from ' +
        B.at +
        ' (score ' +
        B.score +
        (B.q != null ? ', card quality ' + B.q + '%' : '') +
        ').</span><button class="btn sm" data-act="stats-reset" style="margin-left:auto">Start counting from now</button></div>'
      : '') +
    '</details>'
  );
}
// Health alerts: each one that isn't good can be fixed (a menu of direct swaps that remedy it, each with its effect on the
// deck score) or ignored for this deck. Show all opens the same menu for every alert at once.
const FIX_OF = {
  Lands: 'landsUp',
  Ramp: 'ramp',
  Draw: 'draw',
  Removal: 'removal',
  Wipes: 'wipe',
  Curve: 'curve',
  'Win routes': 'wins',
  Mana: 'mana'
};
const FIX_WHY = {
  landsUp: 'More lands mean fewer missed land drops.',
  mana: 'Lands that make more of your colours and enter untapped mean fewer games stuck without the right colour.',
  ramp: 'Ramp gets the deck’s big plays out turns earlier.',
  draw: 'Card draw keeps your hand full so the deck doesn’t run out of gas.',
  removal: 'Removal answers the threats that would beat you.',
  wipe: 'Board wipes reset the game when you fall behind.',
  curve: 'Cheaper cards let you do more each turn.',
  wins: 'A deck needs a clear way to finish the game.'
};
// Path to Apex: the few steps that would move this deck furthest toward its Apex build, from the deck's own numbers:
// its biggest score gains, how it compares with the Apex build on Game Changers, tutors and fast mana, its health alerts,
// combos it is one card away from, and mana trouble. Each tip has a button that does or shows it.
const isTutor = c => tags(c).roles.has('tutor'),
  isFast = c => typeof FAST_MANA !== 'undefined' && FAST_MANA.has(c._n);
function apexTips(d, A, R, e, HA, lvl) {
  if (!e || !R || R.pending || (lvl === 'Apex' && !HA.some(x => x.s === 'bad')))
    return lvl === 'Apex' ? '<div class="tip good"><b><small>Path to Apex</small>This deck is at Apex level</b></div>' : '';
  const T = [],
    ar = apexFor(d),
    cnt = (L, f) =>
      L.reduce((a, x) => {
        const c = find(x.n);
        return a + (c && f(c) ? x.q : 0);
      }, 0);
  const top = R.paths
    .map(L => L.opts.apex)
    .filter(p => p && p.dScore != null && p.dScore > 0)
    .sort((a, b) => b.dScore - a.dScore)
    .slice(0, 3);
  if (top.length)
    T.push({
      w: top.reduce((s, p) => s + p.dScore, 0),
      h:
        '<b>Biggest gains:</b> ' +
        top.map(p => esc(p.add.split(' // ')[0]) + ' for ' + esc(p.cut.split(' // ')[0])).join('; ') +
        ' · together about +' +
        top.reduce((s, p) => s + p.dScore, 0).toFixed(1) +
        ' score',
      b: '<button class="btn sm" data-act="upsort" data-v="impact">Show by impact</button>'
    });
  if (ar && ar.cards) {
    const mine = d.cards,
      ap = ar.cards.apex;
    const kinds = R.paths.map(L => slotKinds(d, Object.values(L.opts)));
    [
      ['Game Changers', c => c.gc, 'gc'],
      ['tutors', isTutor, 'tutor'],
      ['fast mana', isFast, '']
    ].forEach(([lab, f, k]) => {
      const a = cnt(ap, f),
        m = cnt(mine, f),
        rows = k ? kinds.filter(x => x.has(k)).length : 0;
      if (a - m >= 2)
        T.push({
          w: 1.2 * (a - m),
          h:
            '<b>' +
            lab[0].toUpperCase() +
            lab.slice(1) +
            ':</b> the Apex build for this commander runs ' +
            a +
            ', this deck runs ' +
            m +
            '.' +
            (k === 'gc' ? ' Game Changers are often what moves a deck up a tier.' : '') +
            (k && !rows && d.tier && d.tier !== 'apex'
              ? ' Most cost more than this deck’s ' + TIERS[d.tier].label + ' price level.'
              : ''),
          b: rows ? '<button class="btn sm" data-act="upkind" data-v="' + k + '">Show ' + rows + ' ' + lab + '</button>' : ''
        });
    });
  }
  const hb = HA.filter(x => x.s !== 'good' && FIX_OF[x.k]);
  if (hb.length)
    T.push({
      w: 1.5 * hb.length,
      h: '<b>Health:</b> ' + hb.map(x => x.k).join(', ') + (hb.length === 1 ? ' needs' : ' need') + ' attention.',
      b:
        '<button class="btn sm" data-act="h-fix" data-v="' +
        (hb.length === 1 ? esc(hb[0].k) : '*') +
        '">' +
        (hb.length === 1 ? 'Show' : 'Show all') +
        '</button>'
    });
  const near = (e.combos.near || []).filter(x => x.x.win && find(x.miss) && !entryOf(d, x.miss)).slice(0, 1);
  if (near.length && !e.combos.win.length)
    T.push({
      w: 2,
      h: '<b>Win route:</b> one card from a combo (' + esc(near[0].x.what.toLowerCase()) + '): add ' + esc(near[0].miss) + '.',
      b: '<button class="btn sm" data-act="card" data-n="' + esc(near[0].miss) + '">View card</button>'
    });
  if (e.sim && e.sim.colourStuck > 0.15)
    T.push({
      w: 2 * e.sim.colourStuck * 5,
      h:
        '<b>Mana:</b> in ' +
        Math.round(e.sim.colourStuck * 100) +
        '% of practice games a colour was missing. Better lands fix this.',
      b: '<button class="btn sm" data-act="h-fix" data-v="Mana">Show</button>'
    });
  if (!T.length) return '';
  return (
    '<div class="tip ok apextips"><b><small>Path to Apex</small>' +
    (lvl ? 'At ' + lvl + ' level · ' : '') +
    'what would help this deck most</b><ul>' +
    T.sort((a, b) => b.w - a.w)
      .slice(0, 4)
      .map(
        t =>
          '<li class="pro"><i>→</i><span>' +
          t.h +
          (t.b ? '<span class="row" style="margin-top:4px">' + t.b + '</span>' : '') +
          '</span></li>'
      )
      .join('') +
    '</ul></div>'
  );
}
function healthFixHtml(H, ign, fixable) {
  const bad = H.filter(x => x.s !== 'good');
  if (!bad.length) return '';
  return (
    '<div class="hfix"><span class="lab" style="margin:0">Needs attention</span>' +
    bad
      .map(
        x =>
          '<div class="row" style="gap:6px"><span class="hi ' +
          (ign.has(x.k) ? 'ign' : x.s) +
          '" style="flex:1;min-width:0"><i></i><b>' +
          x.k +
          '</b> ' +
          esc(x.t) +
          '</span>' +
          (ign.has(x.k)
            ? '<button class="btn sm" data-act="h-unignore" data-v="' + esc(x.k) + '">Stop ignoring</button>'
            : (FIX_OF[x.k]
                ? '<button class="btn pri sm" data-act="h-fix" data-v="' + esc(x.k) + '">Show</button>'
                : x.k === 'Legal' && /open slot/.test(x.t)
                  ? '<button class="btn pri sm" data-act="tab" data-v="up">Fill slots</button>'
                  : '') +
              '<button class="btn sm" data-act="h-ignore" data-v="' +
              esc(x.k) +
              '">Ignore</button>') +
          '</div>'
      )
      .join('') +
    (fixable.length > 1
      ? '<div class="row"><button class="btn pri sm" data-act="h-fix" data-v="*">Show all (' + fixable.length + ')</button></div>'
      : '') +
    '</div>'
  );
}
// The swaps that fix one alert, best for the deck score first. Worked out when the menu opens.
function fixList(d, key) {
  let kind = FIX_OF[key];
  if (!kind) return [];
  if (kind === 'mana' && ctxOf(d).ident.length < 2) kind = 'landsUp';
  {
    const A0 = analyze(d);
    if (key === 'Lands' && A0.lands > A0.T.lands) kind = 'landsDown';
  }
  const e = evalFor(d),
    ar = apexFor(d),
    R = recsFor(d);
  const score = e && e.exact != null ? (cut, add) => swapScore(d, e, ar, cut, add, 1) : null;
  // land swaps change the mana, so they are measured with fresh practice games (same seed for the deck before and after)
  const landScore =
    FIX_OF[key] === 'mana' || key === 'Lands' || ['ramp', 'draw', 'removal', 'wipe'].includes(kind)
      ? (() => {
          let b0 = null;
          return (cut, add) => {
            try {
              if (b0 == null) b0 = cmpOf(evaluateDeck(d, {apex: ar, games: 200}));
              const u = JSON.parse(JSON.stringify(d));
              delete u.plan;
              cutCard(u, cut, 1);
              addCard(u, add, 1);
              return +(cmpOf(evaluateDeck(u, {apex: ar, games: 200})) - b0).toFixed(2);
            } catch (e) {
              return null;
            }
          };
        })()
      : null;
  // The Mana alert covers two problems: games stuck without a colour, and games short of lands by turn 5. So it offers both
  // kinds of swap (better lands for worse ones, and a land for the spell the deck can best spare), each measured with fresh
  // practice games, and keeps only the ones that raise the deck score, best first.
  // Build 138: each land the fix offers goes where the card window would put it (landRank), so the two always agree; the swaps
  // that raise the score most are taken first, each card once.
  if (FIX_OF[key] === 'mana' && e && e.exact != null) {
    try {
      return manaPick(manaAdds(d, 5, manaStarved(d, e)).map(c => ({c, r: landRank(d, c.n, ar)})));
    } catch (err) {
      return [];
    }
  }
  // adding or cutting lands changes the mana, which only fresh practice games measure; keep the swaps that raise the score
  if (key === 'Lands') {
    try {
      return fixSwaps(d, kind, {n: 5, val: R && R.valOf, score})
        .filter(p => !hasCard(d, p.add))
        .map(p => Object.assign(p, {dScore: landScore(p.cut, p.add)}))
        .filter(p => p.dScore != null && p.dScore >= SCORE_MIN)
        .sort((a, b) => b.dScore - a.dScore);
    } catch (err) {
      return [];
    }
  }
  try {
    return fixSwaps(d, kind, {n: 5, val: R && R.valOf, score, landScore, spareLands: true}).filter(p => !hasCard(d, p.add));
  } catch (err) {
    return [];
  }
}
// The Mana fix's list from the lands measured so far: the swaps that raise the score most are taken first, each card going out once.
function manaPick(ranks) {
  const used = new Set(),
    out = [];
  ranks = ranks.filter(x => x.r.length).sort((a, b) => b.r[0].dScore - a.r[0].dScore);
  for (const x of ranks) {
    if (out.length >= 5) break;
    const b = x.r.find(y => !used.has(y.n) && y.dScore >= SCORE_MIN);
    if (!b) continue;
    used.add(b.n);
    out.push({
      cut: b.n,
      add: x.c.n,
      q: 1,
      kind: 'mana',
      dScore: b.dScore,
      best: b === x.r[0],
      why: b.spell
        ? 'A land for a weak spell: the deck runs short of lands'
        : landSpeed(find(b.n)) === 'tapped'
          ? 'Replaces a land that enters tapped'
          : isBasic(b.n)
            ? 'Replaces a basic with a land making more of your colours'
            : 'A better land for the same colours'
    });
  }
  return out.sort((a, b) => b.dScore - a.dScore);
}
// The Mana fix plays fresh practice games for every land swap it weighs (a few seconds on a phone): the window opens at once with a
// note, and the swaps appear when they are ready (Build 138).
function openFixSoon(keys) {
  if (!keys.includes('Mana')) return openFix(keys);
  const t = keys.length > 1 ? 'Fix all alerts' : 'Fix: ' + keys[0];
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Fix deck health"><div class="ph"><h2>' +
    esc(t) +
    '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><p class="note think" role="status">Thinking… checking land swaps with fresh practice games</p></div>';
  $('#modal').hidden = false;
  setTimeout(() => {
    if (!$('#modal').hidden) openFix(keys);
  }, 40);
}
// Version 0.9.2 (owner's choice 4c): the Mana fix measures one land at a time and shows each land's best swap as soon as it is
// measured, so the first answer comes in about a second (0.6-1.3 s on a desktop); a note says how many lands are still being checked. The run pauses
// while a Swap is being confirmed, and stops when the window closes or the deck changes.
const MFIX = {tok: 0};
function openFix(keys) {
  const d = cur();
  if (!d) return;
  S.fixKeys = keys;
  const ign = new Set(d.ignoreH || []),
    tok = ++MFIX.tok;
  const mk = k => {
    if (FIX_OF[k] !== 'mana') return {k, L: fixList(d, k)};
    const e = evalFor(d);
    if (!e || e.exact == null) return {k, L: fixList(d, k)};
    let adds = [];
    try {
      adds = manaAdds(d, 5, manaStarved(d, e));
    } catch (err) {}
    return {k, L: [], busy: {adds, ranks: [], i: 0}};
  };
  const G = keys.filter(k => !ign.has(k)).map(mk);
  S.fixG = G;
  fixDraw(d, keys, G);
  const g = G.find(x => x.busy);
  if (!g) return;
  const ar = apexFor(d),
    sig = d.id + '#' + d.cards.map(e => e.n + '×' + e.q).join('|');
  const step = () => {
    if (
      tok !== MFIX.tok ||
      $('#modal').hidden ||
      !$('#modal [aria-label="Fix deck health"]') ||
      cur() !== d ||
      d.id + '#' + d.cards.map(e => e.n + '×' + e.q).join('|') !== sig
    )
      return;
    if ($('#confirm') && !$('#confirm').hidden) return setTimeout(step, 150);
    const B = g.busy;
    if (B.i < B.adds.length) {
      const c = B.adds[B.i++];
      try {
        B.ranks.push({c, r: landRank(d, c.n, ar)});
      } catch (err) {}
      g.L = manaPick(B.ranks);
    }
    if (B.i >= B.adds.length) g.busy = null;
    fixDraw(d, keys, G);
    if (g.busy) setTimeout(step, 0);
  };
  setTimeout(step, 0);
}
function fixDraw(d, keys, G) {
  const A = analyze(d),
    sc = $('#modal .mscroll'),
    top = sc ? sc.scrollTop : 0;
  const tgt = {
    Lands: [A.lands, A.T.lands],
    Ramp: [A.roles.ramp, A.T.ramp],
    Draw: [A.roles.draw, A.T.draw],
    Removal: [A.roles.removal, A.T.removal],
    Wipes: [A.roles.wipe, A.T.wipe]
  };
  const need = k => (tgt[k] ? Math.max(1, Math.abs(tgt[k][1] - tgt[k][0])) : 1),
    over = k => k === 'Lands' && tgt.Lands[0] > tgt.Lands[1];
  const sw = (g, p, i) => {
    const a = find(p.add),
      c = find(p.cut);
    return (
      '<div class="opt fixsw"><button class="sw out" data-act="card" data-n="' +
      esc(p.cut) +
      '">' +
      (c ? '<img alt="" src="' + artFor(c, {pid: c.id}) + '">' : '<span></span>') +
      '<span><small>Cut</small>' +
      esc(p.cut) +
      '</span><em>' +
      money(c) +
      '</em></button><button class="sw in" data-act="card" data-n="' +
      esc(p.add) +
      '">' +
      (a ? '<img alt="" src="' + artFor(a, {pid: a.id}) + '">' : '') +
      '<span><small>Add</small>' +
      esc(p.add) +
      '</span><em>' +
      money(a) +
      '</em></button>' +
      '<div class="row">' +
      (p.dScore != null ? scoreChip(p.dScore) : '') +
      (a && a.gc ? '<span class="chip gc">Game Changer</span>' : '') +
      '<span class="chip">' +
      esc(p.why) +
      '</span>' +
      (a && ownSet().has(a._n) ? '<span class="chip good">You own this</span>' : '') +
      '<button class="btn pri sm" data-act="fix-swap" data-v="' +
      esc(g.k) +
      '|' +
      i +
      '" style="margin-left:auto">Swap</button></div></div>'
    );
  };
  let h =
    '<div class="panel" role="dialog" aria-label="Fix deck health"><div class="ph"><h2>' +
    (keys.length > 1 ? 'Fix all alerts' : 'Fix: ' + esc(keys[0])) +
    '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><div class="mscroll">' +
    '<p class="note" style="margin:0">Direct swaps that fix each alert, best for the deck score first. Each swap takes out a card the deck can best spare (never one you hold, and never one doing a job the deck is short of). Every swap can be undone.</p>';
  if (!G.length) h += '<p class="note">Nothing to fix: every alert here is ignored.</p>';
  G.forEach(g => {
    const n = need(g.k),
      good = g.busy ? [] : g.L.filter(p => p.dScore == null || p.dScore >= 0),
      wait = g.busy
        ? '<p class="note think" role="status">Checking land ' +
          Math.min(g.busy.i + 1, g.busy.adds.length) +
          ' of ' +
          g.busy.adds.length +
          ' with fresh practice games… ' +
          (g.L.length ? 'more swaps may appear' : 'the first swaps appear here') +
          '</p>'
        : '';
    h +=
      '<div class="grp"><span class="lab">' +
      esc(g.k) +
      (tgt[g.k] ? ' · ' + tgt[g.k][0] + ' of ' + tgt[g.k][1] : '') +
      '</span><p class="note" style="margin:0">' +
      esc(
        FIX_OF[g.k] === 'mana'
          ? manaWhy(d)
          : over(g.k)
            ? 'The deck runs more lands than it needs, so some can go for cards that do a job the deck is short of. Each swap was tested in fresh practice games and raises the deck score.'
            : FIX_WHY[FIX_OF[g.k]] || ''
      ) +
      (tgt[g.k] ? ' ' + n + (over(g.k) ? ' fewer' : ' more') + ' would reach the target.' : '') +
      '</p>' +
      (g.L.length
        ? '<div class="paths">' + g.L.map((p, i) => sw(g, p, i)).join('') + '</div>' + wait
        : wait
          ? wait
          : FIX_OF[g.k] === 'mana'
            ? manaNone(d)
            : '<p class="note" style="margin:0">No swap found that fixes this without weakening something the deck needs.</p>') +
      '<div class="row">' +
      (good.length
        ? '<button class="btn sm" data-act="fix-top" data-v="' +
          esc(g.k) +
          '">Make the top ' +
          Math.min(n, good.length) +
          ' swap' +
          (Math.min(n, good.length) === 1 ? '' : 's') +
          '</button>'
        : '') +
      '<button class="btn sm" data-act="h-ignore" data-v="' +
      esc(g.k) +
      '">Ignore this alert</button></div></div>';
  });
  h += '</div></div>';
  $('#modal').innerHTML = h;
  $('#modal').hidden = false;
  const sc2 = $('#modal .mscroll');
  if (sc2 && top) sc2.scrollTop = top;
}
// What the Mana alert is about, from the practice games, so the swaps make sense.
// The Mana alert's line: colour trouble always; missing lands only when it happens often enough to matter (8%+ of games).
function manaText(m) {
  const st = Math.round(m.colourStuck * 100),
    sh = Math.round(m.screwT5 * 100);
  return (
    'Stuck without a colour in ' + st + '% of practice games' + (m.screwT5 >= 0.08 ? ' · ran out of lands in ' + sh + '%' : '')
  );
}
function manaWhy(d) {
  const e = evalFor(d),
    m = e && e.sim;
  if (!m) return FIX_WHY.mana;
  const st = Math.round(m.colourStuck * 100),
    sh = Math.round(m.screwT5 * 100);
  return (
    'In practice games the deck is stuck without a colour it needs in ' +
    st +
    '% of games and runs out of lands by turn 5 in ' +
    sh +
    '%' +
    (analyze(d).lands > analyze(d).T.lands
      ? ' (with ' + analyze(d).lands + ' lands that is just bad luck, so no lands are added)'
      : '') +
    '. ' +
    (m.screwT5 >= m.colourStuck && analyze(d).lands <= analyze(d).T.lands
      ? 'Missing lands is the bigger problem, so swaps that add a land for the spell the deck can best spare come first when they help most.'
      : 'Colours are the bigger problem, so lands that make more of your colours and enter untapped come first when they help most.') +
    ' Every swap below raises the deck score.'
  );
}
function manaNone(d) {
  const mp = manaPlan(d);
  return (
    '<p class="note" style="margin:0">No land swap raised the deck score in fresh practice games, so none is suggested. ' +
    (mp.changes.length
      ? 'Rebalancing your basic lands to match the colours your spells need may still help:'
      : 'Your lands already match what your spells need; the alert reflects normal variance for this deck, so ignoring it is reasonable.') +
    '</p>' +
    (mp.changes.length
      ? '<div class="row"><button class="btn pri sm" data-act="mana-apply">Rebalance basics: ' +
        esc(planText(mp)) +
        '</button></div>'
      : '')
  );
}
function fixApply(d, list) {
  let k = 0;
  list.forEach(p => {
    if (entryOf(d, p.cut) && !entryOf(d, p.add)) {
      doSwap(d, {cut: p.cut, add: p.add, q: 1}, 0);
      k++;
    }
  });
  return k;
}
