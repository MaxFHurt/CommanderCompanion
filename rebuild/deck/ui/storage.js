// ---------- storage ----------
// Saving (0.9.23). The decks are saved under Commander Companion's own names (cc.deckProfile, cc.deckDraft), not the old
// Deck Companion's (dc.profile, dc.draft): both apps sit on one site and share its storage, and an old Deck Companion page
// left open saved its stale copy over the new one whenever it was hidden. The old names are read once, to move decks
// saved before this build, and never written again.
// - Every save carries a number (saveRev, from the clock) and is also kept in this app's own IndexedDB, which survives
//   Safari clearing local storage and has room when local storage is full. Loading takes the newer copy.
// - A window saves only what it changed, and never over a newer save from another window: it takes the other window's
//   decks first, keeping its own newer ones.
// - If local storage is full, the app's caches (saved upgrade lists) are cleared to make room; a save that fails
//   everywhere says so on screen instead of failing silently.
let saveT = 0;
const PROF = {
  key: 'cc.deckProfile',
  draftKey: 'cc.deckDraft',
  revKey: 'cc.deckRev',
  legacy: 'dc.profile',
  legacyDraft: 'dc.draft',
  db: 'cc-deck-builder',
  rev: 0,
  dirty: false,
  warned: 0,
  gone: new Set() // decks deleted in this window, so a merge with another window's save does not bring them back
};
const nextRev = () => Math.max(Date.now(), (PROF.rev || 0) + 1);
function loadLocal() {
  let p = lsGet(PROF.key),
    moved = false;
  if (!(p && Array.isArray(p.decks))) {
    p = lsGet(PROF.legacy);
    moved = !!(p && Array.isArray(p.decks));
  }
  if (p && Array.isArray(p.decks)) {
    S.profile = p;
    PROF.rev = p.saveRev || 0;
  }
  let dr = lsGet(PROF.draftKey);
  if (!dr && moved) dr = lsGet(PROF.legacyDraft);
  if (dr && Array.isArray(dr.cards)) S.draft = dr;
  if (moved && !S.profile.example) {
    PROF.dirty = true;
    persist();
  }
}
// The IndexedDB copy, after the first screen is drawn: when it is newer (local storage was cleared, or was full), it wins.
async function loadDurable() {
  let rec = null;
  try {
    rec = await profDb('readonly', st => st.get('profile'));
  } catch (e) {
    return;
  }
  if (!rec || !rec.profile || !Array.isArray(rec.profile.decks) || (rec.rev || 0) <= (PROF.rev || 0)) {
    if (!S.profile.example && (!rec || (rec.rev || 0) < (PROF.rev || 0))) durableSave(); // the copy is missing or older
    return;
  }
  adoptProfile(rec.profile, rec.draft);
  toast('Your decks were brought back from this device’s saved copy.');
}
function profDb(mode, fn) {
  return new Promise((res, rej) => {
    let rq;
    try {
      rq = indexedDB.open(PROF.db, 1);
    } catch (e) {
      return rej(e);
    }
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => {
      const db = rq.result,
        tx = db.transaction('kv', mode),
        r = fn(tx.objectStore('kv'));
      tx.oncomplete = () => {
        db.close();
        res(r && r.result);
      };
      tx.onerror = () => {
        db.close();
        rej(tx.error);
      };
    };
  });
}
function durableSave() {
  const rec = {rev: PROF.rev, at: Date.now(), profile: S.profile, draft: S.draft || null};
  return profDb('readwrite', st => st.put(JSON.parse(JSON.stringify(rec)), 'profile')).then(
    () => true,
    () => false
  );
}
// Take a profile saved elsewhere (another window, the IndexedDB copy) as this window's own.
function adoptProfile(p, draft) {
  S.profile = p;
  PROF.rev = p.saveRev || 0;
  PROF.dirty = false;
  if (draft !== undefined) S.draft = draft && Array.isArray(draft.cards) ? draft : null;
  VLAST.clear();
  UNDO.base = null;
  undoMark();
  versionMark();
  recsFor.k = null;
  if (S.deckId && !S.profile.decks.some(x => x.id === S.deckId) && !(S.draft && S.draft.id === S.deckId)) {
    S.deckId = (S.profile.decks[0] || {}).id || null;
    if (!S.deckId) S.open = false;
  }
  render();
}
// Another window saved first: its decks, with this window's newer ones (and the ones it just made) on top.
function mergeProfile(theirs) {
  const mine = new Map(S.profile.decks.map(d => [d.id, d])),
    seen = new Set(),
    out = [];
  (theirs.decks || []).forEach(t => {
    if (!t || PROF.gone.has(t.id)) return;
    const m = mine.get(t.id);
    seen.add(t.id);
    out.push(m && (m.updatedAt || 0) >= (t.updatedAt || 0) ? m : t);
  });
  S.profile.decks.forEach((d, i) => {
    if (!seen.has(d.id)) out.splice(Math.min(i, out.length), 0, d);
  });
  S.profile.decks = out;
  VLAST.clear();
  versionMark();
}
// Other windows of this app: take their saves as they happen (when this one has nothing waiting to be saved).
addEventListener('storage', ev => {
  if (ev.key !== PROF.revKey || !ev.newValue) return;
  const r = (JSON.parse(ev.newValue) || {}).rev || 0;
  if (r <= PROF.rev || PROF.dirty) return;
  const p = lsGet(PROF.key);
  if (p && Array.isArray(p.decks) && (p.saveRev || 0) === r) adoptProfile(p, lsGet(PROF.draftKey));
});
// Undo (main screen): every change to your decks, buy lists or library is recorded when it is saved, one step per action, so
// the Undo button puts back the state before the last action, whatever it was. Kept for this visit only (the last 30 steps).
const UNDO = {stack: [], base: null, seq: 0, at: -1, label: ''};
const undoSnap = () => JSON.stringify({p: S.profile, dr: S.draft || null}, (k, v) => (k === 'updatedAt' ? undefined : v));
function undoMark() {
  const cur = undoSnap();
  if (UNDO.base == null) {
    UNDO.base = cur;
    return;
  }
  if (cur === UNDO.base) return;
  if (UNDO.at !== UNDO.seq) {
    UNDO.stack.push({s: UNDO.base, label: UNDO.label});
    if (UNDO.stack.length > 30) UNDO.stack.shift();
    UNDO.at = UNDO.seq;
  }
  UNDO.base = cur;
}
function undoLast() {
  const u = UNDO.stack.pop();
  if (!u) return;
  const o = JSON.parse(u.s);
  S.profile = Object.assign(o.p, {updatedAt: Date.now()});
  S.draft = o.dr || null;
  if (S.deckId && !S.profile.decks.some(x => x.id === S.deckId) && !(S.draft && S.draft.id === S.deckId)) {
    S.deckId = (S.profile.decks[0] || {}).id || null;
    if (!S.deckId) S.open = false;
  }
  UNDO.base = undoSnap();
  UNDO.seq++;
  UNDO.at = UNDO.seq;
  recsFor.k = null;
  clearTimeout(saveT);
  saveT = setTimeout(persist, 300);
  PROF.dirty = true;
  $('#modal').hidden = true;
  render();
  toast('Undid: ' + (u.label || 'last change') + '.');
}
// Deck history: every saved change to a deck's cards keeps the version before it (the last 25, with when and what was done),
// so any earlier version can be looked at and restored. Kept with the deck, so it is in backups too.
const VLAST = new Map(),
  cardsSig = d => JSON.stringify(d.cards.map(e => [e.n, e.q]));
// A card put into a deck while it is on that deck's buy list: ask whether to take it off (never silently; other decks untouched).
function wantInstalled(d, prev) {
  if (S.noAsk || !(d.want || []).length) return;
  const was = new Map(prev.map(([n, q]) => [keyOf(n), q])),
    got = [];
  d.cards.forEach(e => {
    const k = keyOf(e.n),
      add = e.q - (was.get(k) || 0);
    if (add > 0 && d.want.some(x => keyOf(x.n) === k)) got.push(e.n);
  });
  if (got.length) setTimeout(() => askConfirm('want-installed', d.id, got.join('|')), 0);
}
function versionMark() {
  S.profile.decks.forEach(d => {
    const sig = cardsSig(d),
      old = VLAST.get(d.id);
    if (old == null) {
      VLAST.set(d.id, sig);
      return;
    }
    if (old === sig) return;
    wantInstalled(d, JSON.parse(old));
    const prev = JSON.parse(old);
    (d.versions = d.versions || []).push({at: Date.now(), cards: prev.map(([n, q]) => ({n, q})), label: UNDO.label || ''});
    if (d.versions.length > 25) d.versions.shift();
    VLAST.set(d.id, sig);
  });
}
function openHistory() {
  const d = cur();
  if (!d) return;
  const V = (d.versions || []).slice().reverse(),
    now = new Map(d.cards.map(e => [keyOf(e.n), e.q]));
  const diff = v => {
    const m = new Map(v.cards.map(e => [keyOf(e.n), e])),
      add = d.cards.filter(e => !m.has(keyOf(e.n))).map(e => e.n),
      rem = v.cards.filter(e => !now.has(keyOf(e.n))).map(e => e.n);
    return {add, rem};
  };
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Deck history"><div class="ph"><h2>History · ' +
    esc(d.name) +
    '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p class="note" style="margin:0">Earlier versions of this deck’s cards, newest first. Each shows how it differs from the deck now. Restoring puts that version’s cards back; the current cards become a version too, so nothing is lost.</p>' +
    (V.length
      ? V.map((v, i) => {
          const x = diff(v),
            k = V.length - 1 - i;
          return (
            '<div class="grp"><span class="lab">' +
            new Date(v.at).toLocaleString() +
            (v.label ? ' · before “' + esc(v.label) + '”' : '') +
            '</span><p class="note" style="margin:0">' +
            (x.rem.length
              ? 'Had, now gone: ' +
                x.rem.slice(0, 6).map(esc).join(', ') +
                (x.rem.length > 6 ? ' and ' + (x.rem.length - 6) + ' more' : '') +
                '. '
              : '') +
            (x.add.length
              ? 'Added since: ' +
                x.add.slice(0, 6).map(esc).join(', ') +
                (x.add.length > 6 ? ' and ' + (x.add.length - 6) + ' more' : '') +
                '.'
              : '') +
            (!x.rem.length && !x.add.length ? 'Same cards as now (only counts differ).' : '') +
            '</p>' +
            '<div class="row"><button class="btn sm" data-act="ver-restore" data-v="' +
            k +
            '">Restore this version</button></div></div>'
          );
        }).join('')
      : '<p class="note">No earlier versions yet. Every change you make to the cards from now on is kept here.</p>') +
    '</div>';
  $('#modal').hidden = false;
}
function touch() {
  undoMark();
  versionMark();
  S.profile.updatedAt = Date.now();
  S.profile.example = false;
  const d = cur();
  if (d) d.updatedAt = Date.now();
  PROF.dirty = true;
  clearTimeout(saveT);
  // a swap is saved at once (owner, 31 Oct: "every swap should trigger a save"); other edits a moment later, together
  if (S.saveNow) {
    S.saveNow = false;
    persist();
  } else saveT = setTimeout(persist, 700);
}
// Local storage is full: clear what can be worked out again (saved upgrade lists, the search index, the old app's copy).
function freeRoom() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (/^dc\.(rec\.|recIdx$|upx\.|ph$|profile$|draft$)/.test(k)) localStorage.removeItem(k);
    }
  } catch (e) {}
}
function lsPut(k, text) {
  try {
    localStorage.setItem(k, text);
    return true;
  } catch (e) {}
  freeRoom();
  try {
    localStorage.setItem(k, text);
    return true;
  } catch (e) {
    return false;
  }
}
async function persist() {
  clearTimeout(saveT);
  if (!PROF.dirty) return; // nothing changed here: never write this window's copy over a newer one
  const there = lsGet(PROF.revKey);
  if (there && (there.rev || 0) > PROF.rev) {
    const p = lsGet(PROF.key);
    if (p && Array.isArray(p.decks) && (p.saveRev || 0) === there.rev) mergeProfile(p);
    PROF.rev = Math.max(PROF.rev, there.rev || 0);
  }
  PROF.rev = nextRev();
  S.profile.saveRev = PROF.rev;
  PROF.dirty = false;
  const ok =
    lsPut(PROF.key, JSON.stringify(S.profile)) &&
    lsPut(PROF.draftKey, JSON.stringify(S.draft || null)) &&
    lsPut(PROF.revKey, JSON.stringify({rev: PROF.rev}));
  const kept = await durableSave();
  if (!ok && !kept && Date.now() - PROF.warned > 15000) {
    PROF.warned = Date.now();
    PROF.dirty = true;
    toast('Not saved: this browser is out of room or is blocking storage. Save a backup from Profile now.');
  }
  if (S.autoBackup) writeLinked();
}
function idb(mode, fn) {
  return new Promise((res, rej) => {
    let rq;
    try {
      rq = indexedDB.open('deck-companion', 1);
    } catch (e) {
      return rej(e);
    }
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => {
      const tx = rq.result.transaction('kv', mode),
        r = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(r && r.result);
      tx.onerror = () => rej(tx.error);
    };
  });
}
function cardLogHtml() {
  const P = S.profile,
    cd = P && P.cardData,
    log = (P && P.cardLog) || [],
    fmt = t => new Date(t).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'});
  if (!cd)
    return '<div class="grp"><span class="lab">Last rewrite</span><p class="note" style="margin:0">No download has been recorded in this profile yet. The next one will be listed here.</p></div>';
  return (
    '<div class="grp"><span class="lab">Last rewrite · saved in your profile</span><div class="row"><span class="chip good">' +
    esc(fmt(cd.at)) +
    '</span><span class="chip">' +
    (cd.n || 0).toLocaleString() +
    ' cards</span><span class="chip">' +
    esc(cd.why || '') +
    '</span></div>' +
    (log.length > 1
      ? '<div class="allrows">' +
        log
          .slice(1)
          .map(
            x =>
              '<div class="note">' +
              esc(fmt(x.at)) +
              ' · ' +
              (x.n || 0).toLocaleString() +
              ' cards · ' +
              esc(x.why || '') +
              '</div>'
          )
          .join('') +
        '</div>'
      : '') +
    '<p class="note" style="margin:0">This record is part of your profile, so it is also in your backup file. If Safari clears this site’s storage, restoring the backup brings the record back; the card data itself has to be downloaded once more.</p></div>'
  );
}
// Combos: Commander Spellbook's list, trimmed by the weekly card-data job (tools/build-combos.mjs) and served from the repo's
// card-data branch. Saved in this browser and refreshed after a week. Without it, everything works; decks just don't
// show combos or finishing routes.
const COMBO_URL = 'https://raw.githubusercontent.com/MaxFHurt/Deck-Companion/card-data/combos.json.gz';
let COMBO_RAW = null;
async function loadCombos(force) {
  try {
    if (!COMBO_RAW) {
      const v = await idb('readonly', st => st.get('combos'));
      if (v && v.j) COMBO_RAW = v;
    }
    if (COMBO_RAW && LIB.length) useCombos(COMBO_RAW.j);
    if (!force && COMBO_RAW && Date.now() - COMBO_RAW.ts < 7 * 864e5) return;
    if (typeof DecompressionStream === 'undefined') {
      if (!COMBOS.list.length) COMBOS.state = 'unsupported';
      return;
    }
    COMBOS.state = COMBOS.list.length ? COMBOS.state : 'loading';
    const r = await fetch(COMBO_URL, {cache: 'no-cache'});
    if (!r.ok) throw new Error('status ' + r.status);
    const j = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
    if (!j || !Array.isArray(j.combos) || !j.combos.length) throw new Error('empty');
    COMBO_RAW = {j, ts: Date.now()};
    try {
      await idb('readwrite', st => st.put(COMBO_RAW, 'combos'));
    } catch (e) {}
    if (LIB.length) useCombos(j);
    render();
  } catch (e) {
    if (!COMBOS.list.length) COMBOS.state = 'fail';
  }
}
async function loadSavedLibrary() {
  let complete = false,
    hadRows = false;
  try {
    const v = await idb('readonly', s => s.get('cards'));
    if (v && v.rows && v.rows.length) {
      hadRows = true;
      complete =
        !!v.ts && v.rows.some(r => r.sc) && v.rows.some(r => r.rar) && v.rows.some(r => 'gc' in r) && v.rows.some(r => 'cn' in r);
      useFull(v.rows, v.when, complete);
      render();
    }
  } catch (e) {}
  // Ask the browser to keep the saved card data, so it is not cleared (and downloaded again) when storage runs low.
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {}
  // The profile keeps a record of each card-data download. After the browser's storage is cleared and a backup is
  // restored, that record brings back when the data was last rewritten and which release it covered.
  {
    const cd = S.profile && S.profile.cardData;
    if (cd && cd.at) {
      if (!lsGet('dc.dlAt')) lsSet('dc.dlAt', cd.at);
      if (!lsGet('dc.relSig') && cd.sig) lsSet('dc.relSig', cd.sig);
    }
  }
  if (!complete)
    autoUpdate(null, hadRows ? 'Saved card data was from an older version of the app' : 'No card data was saved in this browser');
  else checkReleases();
  loadCombos();
  bracketTags();
}
// Bracket card lists from Scryfall's card tags: mass land denial and extra turns. Kept for a week, then refreshed, so
// new cards join the lists without an app update. (Game Changers come with the card data itself.)
function useTags(t) {
  BTAGS = {mld: new Set((t.mld || []).map(norm)), turns: new Set((t.turns || []).map(norm)), v: (BTAGS.v || 0) + 1};
}
async function bracketTags() {
  const saved = lsGet('dc.btags');
  if (saved && saved.mld) useTags(saved);
  if (saved && Date.now() - saved.ts < 7 * 864e5) return;
  try {
    const names = async q => {
      const out = [];
      let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q + ' game:paper') + '&unique=cards';
      while (url) {
        const r = await sfetch(url);
        if (r.status === 404) break;
        if (!r.ok) throw new Error('status ' + r.status);
        const j = await r.json();
        (j.data || []).forEach(c => out.push(c.name));
        url = j.has_more ? j.next_page : null;
      }
      return out;
    };
    const t = {ts: Date.now(), mld: await names('otag:mass-land-denial'), turns: await names('otag:extra-turn')};
    if (t.mld.length || t.turns.length) {
      lsSet('dc.btags', t);
      useTags(t);
      render();
    }
  } catch (e) {}
}
function useFull(rows, when, complete) {
  buildIndex(mergeLibrary(STARTER, rows));
  DBINFO = {source: 'full', count: LIB.length, when, complete: !!complete};
  ART.clear();
  if (complete) {
    recordPrices(when);
    clearTimeout(wkWarm.t);
    wkWarm.done = false;
    wkWarm.t = setTimeout(wkWarm, 5000);
  }
}
// Price history: each time complete card data arrives, the prices of the cards you care about (your decks, library, buy
// lists and cards you have opened) are kept by the data's date, so history starts when this shipped and grows over time.
// Kept small for phones: a new point only when a price changes, up to 60 per card and 3,000 cards, oldest dropped first.
const PH_KEY = 'dc.ph';
function phLoad() {
  const v = lsGet(PH_KEY);
  return v && v.m ? v : {m: {}};
}
function phTracked() {
  const P = S.profile,
    out = new Set();
  const add = n => {
    if (n) out.add(norm(n));
  };
  P.decks.concat(S.draft ? [S.draft] : []).forEach(d => {
    d.cards.forEach(e => add(e.n));
    add(d.commander);
    add(d.partner);
    (d.want || []).forEach(x => add(x.n));
    Object.keys(d.recP || {}).forEach(add);
  });
  Object.keys(lib()).forEach(add);
  myWant().forEach(x => add(x.n));
  (phLoad().seen || []).forEach(add);
  return out;
}
function recordPrices(when) {
  const day = String(when || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const H = phLoad(),
    T = phTracked();
  T.forEach(k => {
    const c = IDX.get(k);
    if (!c || c.p == null || isBasic(c.n)) return;
    const L = H.m[k] || (H.m[k] = []),
      last = L[L.length - 1];
    if (last && last[0] === day) last[1] = c.p;
    else if (!last || (last[0] < day && last[1] !== c.p)) L.push([day, c.p]);
    if (L.length > 60) L.splice(0, L.length - 60);
  }); // a point only when the price changes
  const keys = Object.keys(H.m);
  if (keys.length > 3000) {
    keys
      .sort((a, b) => (H.m[a][H.m[a].length - 1][0] < H.m[b][H.m[b].length - 1][0] ? -1 : 1))
      .slice(0, keys.length - 3000)
      .forEach(k => delete H.m[k]);
  }
  H.at = day;
  lsSet(PH_KEY, H);
}
function phOf(c) {
  const L = c && phLoad().m[c._n];
  return L && L.length ? L : null;
}
function phSeen(c) {
  if (!c) return;
  const H = phLoad();
  H.seen = (H.seen || [])
    .filter(k => k !== c._n)
    .concat([c._n])
    .slice(-200);
  if (!H.m[c._n] && c.p != null && DBINFO.complete && DBINFO.when) H.m[c._n] = [[String(DBINFO.when).slice(0, 10), c.p]];
  lsSet(PH_KEY, H);
}
function phHtml(c) {
  const L = phOf(c);
  if (!L) return '';
  const f = L[0],
    l = L[L.length - 1],
    ch = f[1] ? (l[1] - f[1]) / f[1] : 0,
    fmt = x => '$' + x.toFixed(2);
  if (L.length < 2)
    return (
      '<dt>Price history</dt><dd><span class="note">Tracking since ' +
      esc(f[0]) +
      ' (' +
      fmt(f[1]) +
      '). The history grows each time new card data downloads.</span></dd>'
    );
  const lo = Math.min(...L.map(x => x[1])),
    hi = Math.max(...L.map(x => x[1])),
    W = 120,
    Hh = 28,
    pts = L.map(
      (x, i) =>
        ((i * W) / (L.length - 1)).toFixed(1) + ',' + (hi === lo ? Hh / 2 : Hh - ((x[1] - lo) / (hi - lo)) * Hh).toFixed(1)
    ).join(' ');
  return (
    '<dt>Price history</dt><dd><svg class="spark" viewBox="0 0 ' +
    W +
    ' ' +
    Hh +
    '" width="' +
    W +
    '" height="' +
    Hh +
    '" role="img" aria-label="Price from ' +
    fmt(f[1]) +
    ' to ' +
    fmt(l[1]) +
    '"><polyline fill="none" stroke="currentColor" stroke-width="2" points="' +
    pts +
    '"/></svg> ' +
    fmt(f[1]) +
    ' on ' +
    esc(f[0]) +
    ' → ' +
    fmt(l[1]) +
    ' on ' +
    esc(l[0]) +
    ' <span class="chip ' +
    (ch > 0.02 ? 'warn' : ch < -0.02 ? 'good' : '') +
    '">' +
    (ch > 0.02 ? '▲ ' : ch < -0.02 ? '▼ ' : '') +
    (ch >= 0 ? '+' : '−') +
    Math.abs(ch * 100).toFixed(0) +
    '%</span> · low ' +
    fmt(lo) +
    ', high ' +
    fmt(hi) +
    '</dd>'
  );
}
function setStatus(t) {
  // the Building window shows the deck-building steps only (not the card-data download's messages)
  const gb = $('#genbuild-msg');
  if (gb && t && /^(Thinking|Reading)/.test(t)) gb.textContent = t;
  const el = $('#status');
  if (el) {
    const was = el.hidden;
    el.textContent = t;
    el.hidden = !t;
    if (was !== el.hidden) fitWork();
  }
}
// Building a deck takes a few seconds (longer on a phone: the build is polished until no upgrade is left). The status line says
// the app is thinking, with the spinner, and is drawn before the work starts so the screen never looks frozen (owner: wait
// rather than shift; "it's okay to tell the user the app is thinking").
async function thinkThen(msg, fn) {
  if (thinkThen.busy) {
    toast('Still building the last deck. It will open when it is ready.');
    return;
  }
  thinkThen.busy = true;
  const el = $('#status');
  setStatus(msg);
  if (el) el.classList.add('think');
  await new Promise(r => setTimeout(r, 60));
  try {
    return await fn();
  } finally {
    thinkThen.busy = false;
    if (el) el.classList.remove('think');
    setStatus('');
  }
}
// Background building (Build 143): a generated deck is built by work.js on another core, with the same engine and the same
// data the page has, so the page stays responsive and the thinking animation keeps moving. Without a worker, or if the
// worker fails, the page builds the deck itself (genDeck), as before. The deck comes out the same either way.
const WK = {w: null, ok: true, seq: 0, cb: new Map(), sig: {}};
// Helper cores (Build 144): as many as the device reports beyond the page's own, up to 5. Each takes a share of every batch of
// swaps the score check measures, holding only the cards it needs (about 12 MB each). Past 5 they would sit idle: a batch is
// rarely big enough to give more cores a useful share. S.cores sets the number (tests).
function wkCores() {
  const n = S.cores != null ? S.cores : (navigator.hardwareConcurrency || 4) - 1;
  return Math.max(0, Math.min(5, n | 0));
}
function wkGet() {
  if (!WK.ok || S.noWorker || typeof Worker === 'undefined') return null;
  if (WK.w) return WK.w;
  try {
    const v = 'work.js?v=' + (window.BUILD || '') + (window.DEV ? '&dev=1' : ''), // the worker loads what the page loaded
      w = new Worker(v);
    w.onmessage = ev => {
      const m = ev.data || {},
        f = WK.cb.get(m.id);
      if (f) {
        WK.cb.delete(m.id);
        f(m);
      }
    };
    w.onerror = () => {
      WK.ok = false;
      WK.w = null;
      WK.cb.forEach(f => f({err: 'worker failed'}));
      WK.cb.clear();
      try {
        w.terminate();
      } catch (e) {}
      wkHelpersStop();
    };
    WK.w = w;
    WK.sig = {};
    // the helpers talk to the builder directly, each over its own channel
    try {
      const ports = [];
      WK.helpers = [];
      for (let i = 0; i < wkCores(); i++) {
        const h = new Worker(v + '&role=help'),
          ch = new MessageChannel();
        h.postMessage({kind: 'port'}, [ch.port2]);
        ports.push(ch.port1);
        WK.helpers.push(h);
      }
      if (ports.length) w.postMessage({kind: 'helpers', id: 0}, ports);
    } catch (e) {
      wkHelpersStop();
    }
    return w;
  } catch (e) {
    WK.ok = false;
    return null;
  }
}
function wkHelpersStop() {
  (WK.helpers || []).forEach(h => {
    try {
      h.terminate();
    } catch (e) {}
  });
  WK.helpers = [];
}
// Start over with a different number of helper cores (tests and the speed check).
function wkRestart() {
  if (WK.w)
    try {
      WK.w.terminate();
    } catch (e) {}
  wkHelpersStop();
  WK.w = null;
  WK.ok = true;
  WK.cb.forEach(f => f({err: 'restarted'}));
  WK.cb.clear();
  WK.sig = {};
  wkWarm.done = false;
  genPrefetch.k = null;
}
// The page's own state, sent only when it changed since the worker last had it.
function wkState() {
  const m = {},
    s = WK.sig,
    clean = c => {
      const x = {};
      for (const k in c) if (k[0] !== '_') x[k] = c[k];
      return x;
    };
  const lib = [DBINFO.source, DBINFO.count, DBINFO.when, LIB.length].join('|');
  if (s.lib !== lib) {
    m.lib = {sig: lib, rows: LIB.map(clean)};
    s.lib = lib;
    s.combosObj = null;
  }
  // the page's own combo list as it stands (Build 145), not the raw file: the worker then uses exactly the combos the page does
  if (s.combosObj !== COMBOS) {
    m.combos = {sig: COMBOS.at + '|' + COMBOS.list.length, v: COMBOS};
    s.combosObj = COMBOS;
  }
  const ed = [
    EDH.key,
    EDH.state,
    EDH.decks,
    EDH.map ? EDH.map.size : 0,
    Object.keys(EDH.tmap || {})
      .sort()
      .join(','),
    EDH.pre ? 1 : 0,
    EDH.lands || 0,
    (EDH.fall || []).map(f => f.slug).join(',')
  ].join('|');
  if (s.edh !== ed) {
    const v = {};
    for (const k in EDH) if (k !== 'wait' && k[0] !== '_' && typeof EDH[k] !== 'function') v[k] = EDH[k];
    m.edh = {sig: ed, v};
    s.edh = ed;
  }
  if (s.bt !== BTAGS.v) {
    m.btags = BTAGS;
    s.bt = BTAGS.v;
  }
  const st = [...SETCARDS].map(([k, v]) => k + ':' + v.size).join();
  if (s.sets !== st) {
    m.sets = SETCARDS;
    s.sets = st;
  }
  m.up = UP;
  return m;
}
function wkSend(m, ms) {
  const w = wkGet();
  if (!w) return Promise.resolve({err: 'no worker'});
  const id = ++WK.seq;
  const p = new Promise(res => {
    const t = setTimeout(() => {
      if (WK.cb.has(id)) {
        WK.cb.delete(id);
        res({err: 'timeout'});
      }
    }, ms || 300000);
    WK.cb.set(id, r => {
      clearTimeout(t);
      res(r);
    });
    try {
      w.postMessage(Object.assign(wkState(), m, {id}));
    } catch (e) {
      WK.cb.delete(id);
      clearTimeout(t);
      WK.sig = {};
      res({err: String(e)});
    }
  });
  p.id = id;
  return p;
}
// Build a deck from its plan (engine genDeck), in the worker when there is one. The reference build it made is kept here too,
// so opening the deck doesn't have to design it again.
// A build job, and the key that says two jobs build the same deck: the deck's settings (not its id, name or player), the cards
// and options it starts from, and the data the worker builds with.
const ND_SKIP = new Set(['id', 'name', 'player']);
function genJob(nd, seeds, ownOnly, ownAll, fill) {
  return {
    nd: JSON.parse(JSON.stringify(nd)),
    seeds: (seeds || []).map(c => c.n),
    ownOnly: ownOnly ? [...ownOnly] : null,
    ownAll: [...(ownAll || [])],
    fill: fill || null
  };
}
function genKey(j) {
  return JSON.stringify([
    JSON.stringify(j.nd, (k, v) => (ND_SKIP.has(k) ? undefined : v)),
    j.seeds,
    j.ownOnly,
    j.ownAll,
    j.fill,
    DBINFO.source,
    DBINFO.count,
    DBINFO.when,
    LIB.length,
    EDH.key,
    EDH.state,
    EDH.decks,
    EDH.map ? EDH.map.size : 0,
    Object.keys(EDH.tmap || {}).sort(),
    (EDH.fall || []).map(f => f.slug),
    COMBOS.list.length,
    COMBOS.at,
    BTAGS.v,
    [...SETCARDS].map(([k, v]) => k + ':' + v.size),
    UP
  ]);
}
async function genRun(nd, seeds, ownOnly, ownAll, fill) {
  const local = () => genDeck(nd, seeds, ownOnly, ownAll, fill);
  if (!wkGet()) return local();
  const job = genJob(nd, seeds, ownOnly, ownAll, fill),
    key = genKey(job),
    t0 = Date.now();
  let r = null,
    early = false;
  // the same deck already built (or being built) while the player was choosing: use it
  if (WK.spec && WK.spec.key === key) {
    r = await WK.spec.p;
    early = !!(r && r.nd);
    if (!early) r = null;
  } else genCancel();
  if (!r) r = await wkSend({kind: 'gen', job: Object.assign(job, {refs: apexRef.cache ? [...apexRef.cache] : []})});
  if (!r || r.err || !r.nd) {
    if (r && r.err && r.err !== 'no worker') console.warn('Background build failed, building here instead:', r.err);
    return local();
  }
  r.nd = Object.assign({}, r.nd);
  ND_SKIP.forEach(k => {
    if (k in nd) r.nd[k] = nd[k];
    else delete r.nd[k];
  });
  Object.keys(nd).forEach(k => {
    if (!(k in r.nd)) delete nd[k];
  });
  Object.assign(nd, r.nd);
  if (r.refs) {
    apexRef.cache = apexRef.cache || new Map();
    r.refs.forEach(([k, v]) => {
      if (!apexRef.cache.has(k)) apexRef.cache.set(k, v);
    });
    while (apexRef.cache.size > 4) apexRef.cache.delete(apexRef.cache.keys().next().value);
  }
  genRun.last = {ms: Date.now() - t0, work: r.ms, worker: true, early, helpers: r.helpers || 0, stat: r.stat || null};
  return {n: r.n, k: r.k};
}
// Stop a build made ahead that is no longer wanted (the worker stops it at its next step).
function genCancel() {
  const s = WK.spec;
  WK.spec = null;
  if (s && s.p.id && WK.w)
    try {
      WK.w.postMessage({kind: 'cancel', job: s.p.id});
    } catch (e) {}
}
// While the player is still choosing in Generate (Build 143), the background core designs the reference build for the settings
// shown, so pressing Build skips that step. Nothing from it is shown; settings changed afterwards simply design a new one.
function genPrefetchSoon() {
  clearTimeout(genPrefetch.t);
  genPrefetch.t = setTimeout(() => genPrefetch().catch(() => {}), 700);
}
async function genPrefetch() {
  const g = S.gen,
    c = find(g.cmd);
  if (!c || !DBINFO.complete || (g.sets || []).length || thinkThen.busy || !wkGet()) return;
  let aims = [];
  if (g.mech.length) {
    if (EDH.key !== c.n || EDH.state !== 'ok') return;
    aims = g.mech.filter(a => !isEdhAim(a) || (EDH.tmap || {})[a.slice(4)]);
  } else aims = await edhAimsFor(c);
  if (S.gen.cmd !== c.n || $('#modal').hidden || EDH.key !== c.n || thinkThen.busy) return;
  const p = find(g.partner);
  const nd = planDeck(
    c.n,
    null,
    p && canPair(c, p) ? p.n : null,
    Object.assign(
      {fill: g.tier || 'apex', themeFirst: !!g.theme && !g.best, mechChosen: !!g.mech.length},
      aims.length ? {aims} : {}
    )
  );
  if (!nd || !nd.aims.length) return;
  const k = apexKey(nd);
  if (genPrefetch.k !== k) {
    genPrefetch.k = k;
    wkSend({kind: 'ref', nd: JSON.parse(JSON.stringify(nd))});
  }
  // Build 144: the whole deck for the settings shown is built ahead too, exactly as pressing Build would ask for it, so pressing
  // Build with these settings opens it at once. Nothing is shown from it until then; changed settings build again.
  const job = genJob(nd, [], S.gen.own ? ownSet() : null, ownSet(), g.tier || 'apex'),
    key = genKey(job);
  if (WK.spec && WK.spec.key === key) return;
  genCancel();
  WK.spec = {key, p: wkSend({kind: 'gen', job: Object.assign(job, {refs: apexRef.cache ? [...apexRef.cache] : []})})};
}
// Warm the worker while the app is idle: it gets the card data and reads every card once, so the first deck is not slower.
function wkWarm() {
  if (wkWarm.done || !DBINFO.complete || !wkGet()) return;
  wkWarm.done = true;
  wkSend({kind: 'warm'}).then(r => {
    if (r && r.err) wkWarm.done = false;
  });
}
async function ingest(stream, size, when) {
  const rows = [];
  let buf = '',
    read = 0,
    lines = 0;
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  const take = line => {
    line = line.trim();
    if (line.endsWith(',')) line = line.slice(0, -1);
    if (line.length < 3) return;
    lines++;
    try {
      const c = fromScryfall(JSON.parse(line));
      if (c) rows.push(c);
    } catch (e) {}
  };
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    read += value.length;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      take(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
    setStatus(
      'Updating card data… ' + Math.min(99, Math.round((read / size) * 100)) + '% · ' + rows.length.toLocaleString() + ' cards'
    );
  }
  if (lines <= 1 && buf.length > 2) {
    const arr = JSON.parse(buf);
    (arr.data || arr).forEach(o => {
      const c = fromScryfall(o);
      if (c) rows.push(c);
    });
  } else take(buf);
  if (rows.length < 100) throw new Error('no cards in file');
  return finalize(rows, when, Date.now());
}
async function finalize(rows, when, ts) {
  const best = new Map();
  for (const c of rows) {
    const k = norm(c.n),
      o = best.get(k);
    if (!o || (o.p == null && c.p != null)) best.set(k, c);
  }
  const list = [...best.values()];
  useFull(list, when, !!ts);
  if (COMBO_RAW) useCombos(COMBO_RAW.j);
  try {
    await idb('readwrite', s =>
      s.put(
        {
          rows: list.map(c => {
            const x = Object.assign({}, c);
            delete x._n;
            delete x._t;
            delete x._ft;
            return x;
          }),
          when,
          ts
        },
        'cards'
      )
    );
  } catch (e) {}
  return list.length;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Every Scryfall API call goes through one queue, spaced out to stay well inside Scryfall's rate limits.
let sfQ = Promise.resolve();
function sfetch(url) {
  const run = sfQ.then(() => fetch(url));
  sfQ = run.catch(() => {}).then(() => sleep(550));
  return run;
}
// Wait, but wake early when the phone comes back online or the tab is shown again.
function sleepOrWake(ms) {
  return new Promise(res => {
    let t;
    const done = () => {
        clearTimeout(t);
        removeEventListener('online', done);
        document.removeEventListener('visibilitychange', vis);
        res();
      },
      vis = () => {
        if (!document.hidden) done();
      };
    t = setTimeout(done, ms);
    addEventListener('online', done);
    document.addEventListener('visibilitychange', vis);
  });
}
const cleanRows = rows =>
  rows.map(c => {
    const x = Object.assign({}, c);
    delete x._n;
    delete x._t;
    delete x._ft;
    return x;
  });
async function pagedUpdate() {
  // Scryfall's search service, 175 cards a page, most-played first. Progress is saved as it goes, so a dropped
  // connection, a closed tab or a reload picks up where it stopped instead of starting over. It keeps retrying until done.
  const base =
    'https://api.scryfall.com/cards/search?q=' +
    encodeURIComponent('(legal:commander or legal:standard) game:paper prefer:usd-low') +
    '&unique=cards&order=edhrec';
  let st = null;
  try {
    st = await idb('readonly', s => s.get('partial'));
  } catch (e) {}
  const resume = st && st.url && /usd-low/.test(decodeURIComponent(st.url)) && st.rows && Date.now() - st.ts < 12 * 3600e3;
  let rows = resume ? st.rows : [],
    url = resume ? st.url : base,
    page = resume ? st.page : 0,
    total = resume ? st.total : 0,
    fails = 0;
  const when = new Date().toISOString().slice(0, 10),
    first = !(DBINFO.source === 'full' && DBINFO.count > 5000);
  if (resume && first) {
    useFull(rows.slice(), when);
    render();
  }
  while (url) {
    let j;
    try {
      const r = await sfetch(url);
      if (r.status === 429 || r.status >= 500) throw {wait: (+r.headers.get('retry-after') || 0) * 1000};
      if (!r.ok) throw new Error('card search returned ' + r.status);
      j = await r.json();
    } catch (e) {
      if (e instanceof Error && /returned 4/.test(e.message)) throw e;
      fails++;
      setStatus('Connection to Scryfall dropped. Retrying… ' + rows.length.toLocaleString() + ' cards so far');
      await sleepOrWake(Math.min(60000, Math.max(e.wait || 0, e.wait !== undefined ? 15000 * fails : 3000 * fails)));
      continue;
    }
    fails = 0;
    page++;
    total = j.total_cards || total;
    (j.data || []).forEach(o => {
      const c = fromScryfall(o);
      if (c) rows.push(c);
    });
    setStatus(
      'Downloading cards from Scryfall… ' +
        (total ? Math.min(99, Math.round((rows.length / total) * 100)) + '% · ' : '') +
        rows.length.toLocaleString() +
        ' cards'
    );
    url = j.has_more ? j.next_page : null;
    if (first && (page === 1 || page % 20 === 0)) {
      useFull(rows.slice(), when);
      if (page === 1) render();
    }
    if (url && page % 15 === 0)
      try {
        await idb('readwrite', s => s.put({rows: cleanRows(rows), url, page, total, ts: Date.now()}, 'partial'));
      } catch (e) {}
  }
  if (rows.length < 100) throw new Error('card search returned no cards');
  const n = await finalize(rows, when, Date.now());
  try {
    await idb('readwrite', s => s.delete('partial'));
  } catch (e) {}
  return n;
}
async function loadBulk(file) {
  try {
    const n = await ingest(file.stream(), file.size, new Date().toISOString().slice(0, 10));
    toast(n.toLocaleString() + ' cards loaded.');
  } catch (e) {
    toast('That file could not be read. Use the "Oracle Cards" file from Scryfall bulk data.');
  }
  setStatus('');
  render();
}
// Releases: one small request lists every set with its release date and size. A newer release date, or more cards in
// released sets (how Secret Lair drops show up), means there is something new to download.
function lsGet(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch (e) {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
}
async function releaseSignature() {
  const j = await (await sfetch('https://api.scryfall.com/sets')).json(),
    today = new Date().toISOString().slice(0, 10);
  // Only real releases count: a new set people play with, or new Secret Lair cards. Scryfall adds promos, tokens and
  // other odds and ends to old sets almost daily, and those must not set off a full download.
  const REL =
    /^(core|expansion|masters|commander|draft_innovation|eternal|funny|starter|duel_deck|planechase|archenemy|premium_deck|from_the_vault|spellbook|arsenal|box)$/;
  let latest = '',
    name = '',
    count = 0;
  const fam = {};
  (j.data || []).forEach(s => {
    if (s.parent_set_code) fam[s.code] = s.parent_set_code;
  });
  lsSet('dc.sets', fam);
  for (const s of j.data || []) {
    if (s.digital || !s.released_at || s.released_at > today) continue;
    if (s.code === 'sld') count = s.card_count || 0;
    if (!REL.test(s.set_type || '') || s.code === 'sld') continue;
    if (s.released_at > latest) {
      latest = s.released_at;
      name = s.name;
    }
  }
  if (!latest) throw new Error('no sets');
  return {latest, name, sld: count, v: 2};
}
async function checkReleases() {
  try {
    if (Date.now() - (lsGet('dc.relCheck') || 0) < 20 * 3600e3) return;
    const sig = await releaseSignature(),
      saved = lsGet('dc.relSig');
    lsSet('dc.relCheck', Date.now());
    // Download again only for a newly released set, for new Secret Lair cards (at most once a week), or when the saved
    // data is over a month old. A signature saved by an older build is replaced without downloading anything.
    const age = Date.now() - (lsGet('dc.dlAt') || 0),
      week = 7 * 864e5;
    if (!saved || saved.v !== 2) {
      lsSet('dc.relSig', sig);
      if (!lsGet('dc.dlAt')) lsSet('dc.dlAt', Date.now());
      return;
    }
    const newSet = sig.latest > saved.latest,
      newLair = sig.sld > saved.sld + 3 && age > week,
      stale = age > 30 * 864e5;
    if (newSet || newLair || stale)
      autoUpdate(
        sig,
        newSet ? 'New set released: ' + sig.name : newLair ? 'New Secret Lair cards' : 'Card data was over 30 days old'
      );
  } catch (e) {}
}
async function autoUpdate(sig, reason) {
  if (autoUpdate.busy) return;
  autoUpdate.busy = true;
  DBINFO.err = '';
  let n = 0,
    why = [];
  setStatus('Checking Scryfall for card updates…');
  // The card search is used (not Scryfall's daily file) because it can return each card's cheapest printing.
  if (!n)
    try {
      n = await pagedUpdate();
    } catch (e) {
      why.push('card search: ' + ((e && e.message) || e));
    }
  if (n) {
    toast(n.toLocaleString() + ' cards updated from Scryfall.');
    lsSet('dc.dlAt', Date.now());
    try {
      lsSet('dc.relSig', sig && sig.latest ? sig : await releaseSignature());
      lsSet('dc.relCheck', Date.now());
    } catch (e) {}
    // Record the rewrite in the profile (and so in the backup file).
    try {
      const P = S.profile,
        rec = {at: Date.now(), n, data: DBINFO.when || '', why: reason || 'Automatic update', sig: lsGet('dc.relSig')};
      P.cardData = rec;
      P.cardLog = [{at: rec.at, n, why: rec.why}].concat(P.cardLog || []).slice(0, 12);
      PROF.dirty = true;
      persist();
    } catch (e) {}
  } else toast('Scryfall refused the card download. Open Profile for details.');
  DBINFO.err = n ? '' : why.join(' · ');
  autoUpdate.busy = false;
  if (n && COMBO_RAW) useCombos(COMBO_RAW.j);
  setStatus('');
  render();
  if (!$('#modal').hidden && $('#gen-q')) openGenerate();
}

// ---------- backup file ----------
let backupHandle = null;
const backupJson = () =>
  JSON.stringify({app: 'deck-companion', version: 1, savedAt: new Date().toISOString(), profile: S.profile}, null, 1);
function markBackup() {
  try {
    localStorage.setItem('dc.lastBackup', String(Date.now()));
  } catch (e) {}
}
function lastBackup() {
  try {
    return +localStorage.getItem('dc.lastBackup') || 0;
  } catch (e) {
    return 0;
  }
}
function downloadBackup() {
  const a = document.createElement('a'),
    url = URL.createObjectURL(new Blob([backupJson()], {type: 'application/json'}));
  a.href = url;
  a.download = 'deck-companion-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  markBackup();
  toast('Backup file saved to your downloads.');
  render();
}
async function writeLinked() {
  if (!backupHandle) return false;
  try {
    if ((await backupHandle.queryPermission({mode: 'readwrite'})) !== 'granted') return false;
    const w = await backupHandle.createWritable();
    await w.write(backupJson());
    await w.close();
    markBackup();
    return true;
  } catch (e) {
    return false;
  }
}
async function linkBackup() {
  try {
    backupHandle = await window.showSaveFilePicker({
      suggestedName: 'deck-companion-backup.json',
      types: [{description: 'Deck Builder backup', accept: {'application/json': ['.json']}}]
    });
    try {
      await idb('readwrite', s => s.put(backupHandle, 'backupHandle'));
    } catch (e) {}
    S.autoBackup = await writeLinked();
    toast(
      S.autoBackup ? 'Auto-backup is on. That file now updates whenever your decks change.' : 'Could not write to that file.'
    );
  } catch (e) {}
  render();
}
async function resumeBackup() {
  try {
    if ((await backupHandle.requestPermission({mode: 'readwrite'})) === 'granted') S.autoBackup = await writeLinked();
  } catch (e) {}
  render();
}
async function initBackup() {
  try {
    const h = await idb('readonly', s => s.get('backupHandle'));
    if (h && h.queryPermission) {
      backupHandle = h;
      S.autoBackup = (await h.queryPermission({mode: 'readwrite'})) === 'granted';
      if (S.view === 'profile') render();
    }
  } catch (e) {}
}
function readBackup(text) {
  let p = null,
    when = '';
  try {
    const j = JSON.parse(text);
    p = j.profile || j;
    when = j.savedAt || '';
  } catch (e) {}
  if (!p || !Array.isArray(p.decks)) {
    toast('That is not a Deck Builder backup file.');
    return;
  }
  p.decks = p.decks
    .filter(d => d && Array.isArray(d.cards))
    .map(d =>
      Object.assign(
        {
          id: uid(),
          name: 'Deck',
          format: 'commander',
          commander: '',
          tier: 'budget',
          aims: [],
          tribe: '',
          colors: [],
          dismissed: []
        },
        d,
        {tier: TIERS[d.tier] ? d.tier : 'budget', aims: (d.aims || []).filter(a => THEMES[a] || isEdhAim(a))}
      )
    );
  S.pendingRestore = {p, when};
  render();
}
function backupPanel() {
  const lb = lastBackup(),
    mine = S.profile.decks.filter(d => !d.example).length,
    R = S.pendingRestore;
  let h =
    '<section class="panel"><div class="ph"><h2>Backup file</h2><small>' +
    (lb ? 'Last backup ' + new Date(lb).toLocaleString() : 'No backup yet') +
    '</small></div>' +
    '<p class="note" style="margin:0;max-width:75ch">Your profile lives in this browser. Clearing browser data erases it, so keep a backup file on your device. Restoring that file brings every deck, aim and lock back.</p>' +
    '<div class="row"><button class="btn pri" data-act="backup-save">Save backup file</button><label class="btn" for="restore-file" style="cursor:pointer">Restore from a backup file</label><input type="file" id="restore-file" accept=".json,application/json" style="position:absolute;width:1px;height:1px;opacity:0"></div>';
  if (R)
    h +=
      '<div class="gate"><b>Restore ' +
      R.p.decks.length +
      ' deck' +
      (R.p.decks.length === 1 ? '' : 's') +
      (R.when ? ' saved ' + esc(new Date(R.when).toLocaleString()) : '') +
      '?</b>' +
      (mine
        ? 'You have ' +
          mine +
          ' deck' +
          (mine === 1 ? '' : 's') +
          ' here now. Replace them, or keep them and add the backup’s decks alongside.'
        : 'This puts the backup’s decks into your profile.') +
      '<div class="row" style="margin-top:10px"><button class="btn pri" data-act="restore-replace">' +
      (mine ? 'Replace my decks' : 'Restore') +
      '</button>' +
      (mine ? '<button class="btn" data-act="restore-merge">Keep mine and add these</button>' : '') +
      '<button class="btn" data-act="restore-cancel">Cancel</button></div></div>';
  if (window.showSaveFilePicker)
    h +=
      '<div class="row">' +
      (S.autoBackup
        ? '<span class="chip good">Auto-backup on</span><span class="note">' +
          esc(backupHandle.name) +
          ' updates whenever your decks change.</span>'
        : backupHandle
          ? '<button class="btn" data-act="backup-resume">Resume auto-backup to ' +
            esc(backupHandle.name) +
            '</button><span class="note">The browser asks again each visit before it lets the app write to your file.</span>'
          : '<button class="btn" data-act="backup-link">Turn on auto-backup</button><span class="note">Pick a file once and the app keeps it up to date as you work.</span>') +
      '</div>';
  else
    h +=
      '<p class="note" style="margin:0">Automatic backup to a file works in Chrome and Edge on a computer. In this browser, save a backup file after you make changes you want to keep.</p>';
  return h + '</section>';
}

// ---------- deck helpers ----------
// later: the deck is not opened yet (a generated deck opens once it is built, so a half-built deck is never shown)
function newDeck(o, later) {
  const d = Object.assign(
    {
      id: uid(),
      name: 'New deck',
      format: 'commander',
      commander: '',
      tier: 'budget',
      aims: [],
      tribe: '',
      colors: [],
      aimLocked: false,
      cards: [],
      dismissed: []
    },
    o
  );
  if (!later) openDraft(d);
  return d;
}
function openDraft(d) {
  S.draft = d;
  S.deckId = d.id;
  S.view = 'decks';
  S.open = true;
  S.pathShow = 0;
  S.tab = null;
  S.deckQ = '';
}
function makeShell(p) {
  const d = newDeck({
    name: p.name + ' starter',
    format: 'commander',
    aims: p.aims.slice(),
    tribe: p.tribe || '',
    src: 'generated'
  });
  setCommander(d, p.cmd);
  if (p.tribe) d.tribe = p.tribe;
  fillDeck(d);
  return d;
}
function exampleDeck() {
  const d = makeShell(PRECONS.find(p => p.name === 'Elven Empire'));
  d.name = 'Example deck: Lathril Elves (auto-built)';
  d.example = true;
  d.tier = 'mid';
  S.draft = null;
  S.profile.decks.unshift(d);
  return d;
}
// Every swap remembers what it replaced: the new card carries the slot's history, so nothing is lost and any swap can be undone.
// A swap that would add a Game Changer past the deck's bracket is refused (several tiers' picks taken together could).
function gcBlocked() {
  return false;
} // brackets never refuse a swap
function gcBlockMsg() {
  return '';
}
function doSwap(d, p, step) {
  // a swap is saved at once, and a deck being upgraded is kept: a draft becomes one of your decks with its first swap
  S.saveNow = true;
  if (S.draft && S.draft === d) {
    S.profile.decks.unshift(d);
    S.draft = null;
    S.deckId = d.id;
  }
  delete d.regenUndo; // once you start upgrading, the rebuild can no longer be undone as a whole (each swap has its own Undo)
  const old = d.cards.find(x => x.n === p.cut),
    keep = step ? Math.max(step, (old && old.step) || 0) : (old && old.step) || 0;
  const hist = old
    ? (old.hist || []).concat({
        n: old.n,
        q: p.q || 1,
        step: old.step || 0,
        pid: old.pid,
        ps: old.ps,
        pr: old.pr,
        pp: old.pp,
        l: !!old.l
      })
    : [];
  cutCard(d, p.cut, p.q);
  addCard(d, p.add, p.q);
  const en = d.cards.find(x => x.n === p.add);
  if (en) {
    if (keep) en.step = keep;
    if (hist.length) en.hist = hist.slice(-8);
  }
  if (old && !isBasic(p.cut) && !d.cards.some(x => x.n === p.cut)) ruleOut(d, p.cut);
}
function ruleOut(d, n) {
  const k = keyOf(n);
  d.dismissed = (d.dismissed || [])
    .filter(x => keyOf(x) !== k)
    .concat(n)
    .slice(-80);
} // the latest 80 are kept
function undoSwap(d, n) {
  const en = d.cards.find(x => x.n === n),
    hh = en && en.hist && en.hist[en.hist.length - 1];
  if (!hh) return false;
  if (d.cards.some(x => x.n === hh.n) && copyLimit(d, find(hh.n)) <= 1) {
    toast(hh.n + ' is already back in the deck.');
    delete en.hist;
    return true;
  }
  const rest = en.hist.slice(0, -1);
  cutCard(d, n, hh.q || 1);
  addCard(d, hh.n, hh.q || 1);
  const b = d.cards.find(x => x.n === hh.n);
  if (b) {
    b.step = hh.step || 0;
    if (hh.pid) {
      b.pid = hh.pid;
      b.ps = hh.ps;
      b.pr = hh.pr;
      if (hh.pp != null) b.pp = hh.pp;
    }
    b.l = !!hh.l;
    if (rest.length) b.hist = rest;
    else delete b.hist;
  }
  toast('Put ' + hh.n + ' back in place of ' + n + '.');
  return true;
}
function histHtml(en) {
  if (!en || !en.hist || !en.hist.length) return '<div></div>';
  const prev = en.hist[en.hist.length - 1];
  return (
    '<div class="hist"><span><small>History</small>' +
    en.hist.map(x => '<button data-act="card" data-n="' + esc(x.n) + '">' + esc(x.n) + '</button> → ').join('') +
    '<b>' +
    esc(en.n) +
    '</b></span><button class="btn sm" data-act="undo-card" data-n="' +
    esc(en.n) +
    '">Undo · bring back ' +
    esc(prev.n) +
    '</button></div>'
  );
}
