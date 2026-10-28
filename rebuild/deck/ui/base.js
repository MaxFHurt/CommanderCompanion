// ===== Deck Companion UI =====
const $ = s => document.querySelector(s);
const esc = s =>
  String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[m]);
const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const STARTER = parseStarter(STARTER_RAW);
buildIndex(STARTER);
let DBINFO = {source: 'starter', count: STARTER.length, when: null};
const S = {
  profile: {name: 'Planeswalker', decks: [], updatedAt: 0, example: true},
  view: 'home',
  open: false,
  deckId: null,
  swaps: 10,
  sync: 'local',
  search: {q: '', color: '', type: '', fmt: '', max: '', theme: ''},
  gen: {cmd: '', tier: 'apex', partner: '', sets: [], setsMust: false, best: true, theme: false, mech: [], warn: ''},
  confirmDel: null,
  busy: ''
};
// A new deck is a draft until the player saves it; cur() is whichever deck is open, draft or saved.
const cur = () => (S.draft && S.draft.id === S.deckId ? S.draft : S.profile.decks.find(d => d.id === S.deckId)) || null;

// ---------- painted sky ----------
function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function spires(g, w, base, h, r, fill, lit) {
  g.fillStyle = fill;
  let x = -20;
  while (x < w + 20) {
    const bw = 14 + r() * 46,
      bh = h * (0.25 + r() * 0.75);
    g.beginPath();
    g.moveTo(x, base);
    g.lineTo(x, base - bh * 0.72);
    g.lineTo(x + bw * 0.5, base - bh);
    g.lineTo(x + bw, base - bh * 0.72);
    g.lineTo(x + bw, base);
    g.fill();
    if (r() < 0.5) {
      g.fillRect(x + bw * 0.44, base - bh - 12, bw * 0.12, 14);
    }
    if (lit) {
      g.fillStyle = lit;
      for (let i = 0; i < 3; i++) if (r() < 0.55) g.fillRect(x + bw * (0.25 + r() * 0.5), base - bh * (0.2 + r() * 0.45), 2.2, 5);
      g.fillStyle = fill;
    }
    x += bw + r() * 12;
  }
}
function paintSky() {
  const cv = $('#sky'),
    dpr = Math.min(2, window.devicePixelRatio || 1),
    w = innerWidth,
    h = innerHeight;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const base = document.createElement('canvas');
  base.width = cv.width;
  base.height = cv.height;
  const g = base.getContext('2d');
  g.scale(dpr, dpr);
  const r = rng('deck-companion');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#05020c');
  sky.addColorStop(0.55, '#150a33');
  sky.addColorStop(1, '#2a1266');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    const x = r() * w,
      y = r() * h * 0.8,
      rad = 160 + r() * 380,
      n = g.createRadialGradient(x, y, 0, x, y, rad);
    n.addColorStop(0, ['rgba(141,92,255,.20)', 'rgba(70,110,255,.13)', 'rgba(220,90,255,.11)'][i % 3]);
    n.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = n;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = 'rgba(255,255,255,' + (0.2 + r() * 0.6) + ')';
    const s = r() < 0.08 ? 1.8 : 0.9;
    g.fillRect(r() * w, r() * h * 0.85, s, s);
  }
  const mx = w * 0.84,
    my = h * 0.22,
    mr = Math.min(70, w * 0.07),
    mg = g.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 4);
  mg.addColorStop(0, 'rgba(210,195,255,.5)');
  mg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mg;
  g.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  g.fillStyle = '#e6dcff';
  g.beginPath();
  g.arc(mx, my, mr, 0, 7);
  g.fill();
  g.fillStyle = 'rgba(120,90,200,.25)';
  g.beginPath();
  g.arc(mx + mr * 0.3, my - mr * 0.2, mr * 0.28, 0, 7);
  g.arc(mx - mr * 0.35, my + mr * 0.3, mr * 0.18, 0, 7);
  g.fill();
  spires(g, w, h, h * 0.42, r, '#170b3a');
  spires(g, w, h, h * 0.3, r, '#0e0626', 'rgba(255,214,140,.75)');
  spires(g, w, h, h * 0.16, r, '#07030f', 'rgba(185,147,255,.8)');
  const fog = g.createLinearGradient(0, h * 0.7, 0, h);
  fog.addColorStop(0, 'rgba(6,3,13,0)');
  fog.addColorStop(1, 'rgba(6,3,13,.75)');
  g.fillStyle = fog;
  g.fillRect(0, h * 0.7, w, h * 0.3);
  const veil = g.createLinearGradient(0, 0, 0, h);
  veil.addColorStop(0, 'rgba(6,3,13,.35)');
  veil.addColorStop(1, 'rgba(6,3,13,.55)');
  g.fillStyle = veil;
  g.fillRect(0, 0, w, h);
  const ctx = cv.getContext('2d'),
    motes = Array.from({length: 46}, () => ({x: r() * w, y: r() * h, s: 0.6 + r() * 1.8, v: 6 + r() * 16, p: r() * 6.3}));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = 0;
  cancelAnimationFrame(paintSky.raf);
  const frame = t => {
    if (t - last > 50 || still) {
      last = t;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.scale(dpr, dpr);
      for (const m of motes) {
        const y = (((m.y - (t / 1000) * m.v) % h) + h) % h,
          a = 0.25 + 0.45 * Math.abs(Math.sin(t / 1300 + m.p));
        ctx.fillStyle = 'rgba(190,160,255,' + a + ')';
        ctx.shadowColor = '#8d5cff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(m.x + Math.sin(t / 2600 + m.p) * 14, y, m.s, 0, 7);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    if (!still) paintSky.raf = requestAnimationFrame(frame);
  };
  paintSky.raf = requestAnimationFrame(frame);
}
function ornaments() {
  const mk = rot =>
    'url("data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#b9b2d6"/><stop offset="1" stop-color="#6a4fd0"/></linearGradient></defs><g transform="rotate(' +
        rot +
        ' 20 20)"><path d="M3 30V9l6-6h21" fill="none" stroke="url(#a)" stroke-width="2.2"/><path d="M9 26V13l4-4h13" fill="none" stroke="#8d5cff" stroke-width="1"/><path d="M6 0l6 6-6 6-6-6z" transform="translate(0 0)" fill="url(#a)"/></g></svg>'
    ) +
    '")';
  const st = document.documentElement.style;
  st.setProperty('--orn-tl', mk(0));
  st.setProperty('--orn-tr', mk(90));
  st.setProperty('--orn-br', mk(180));
  st.setProperty('--orn-bl', mk(270));
}

// ---------- procedural card art ----------
const ART = new Map(),
  IMG = 'https://cards.scryfall.io/';
const PAL = {
  W: ['#fff6d0', '#d9b65a', '#5a4a2a'],
  U: ['#9fe0ff', '#2d6fd6', '#0a1a4a'],
  B: ['#c7a6ff', '#5a2a8a', '#0c0616'],
  R: ['#ffd08a', '#e0452a', '#3a0a0a'],
  G: ['#c8ffb0', '#2f9a55', '#06200f'],
  C: ['#e6e0ff', '#8a84a8', '#191528'],
  L: ['#ffe2b0', '#a8763a', '#1c1208']
};
// Printings: PRINT.map holds, for the open deck's commander set (and its sister sets), which printing of each card to show.
const PRINT = {key: '', map: new Map()};
const imgUrl = (kind, id, back) => IMG + kind + (back ? '/back/' : '/front/') + id[0] + '/' + id[1] + '/' + id + '.jpg';
function pidOf(c, e) {
  return (e && e.pid) || (PRINT.map.get(c._n) || {}).id || c.id;
}
// The printing a card is shown in (the same choice as pidOf): the deck entry's own, the deck's themed set's, or the card's own.
// Themed printings keep the name printed on them (dc.theme3), so a reskin is never shown under the original name alone.
function shownPrint(c, e) {
  if (!c) return null;
  if (e && e.pid) return {id: e.pid, set: e.ps || '', rar: e.pr || '', fn: e.pn || (e.pid === c.id ? c.fn || '' : '')};
  const pm = PRINT.map.get(c._n);
  if (pm) return pm;
  return {id: c.id, set: c.set || '', rar: c.rar || '', fn: c.fn || ''};
}
// A card's name beside its picture (owner, 25 Oct: alternate printings showed under the original name): a printing that carries
// another name gives that name first, then the card's real name ("Patriotic Shield (Sword of Fire and Ice)").
function nameHtml(c, e, n) {
  if (!c) return esc(n || '');
  const fn = (shownPrint(c, e) || {}).fn;
  return fn && norm(fn) !== c._n ? esc(fn) + ' <small class="aka">(' + esc(c.n) + ')</small>' : esc(n || c.n);
}
// Set and rarity of the printing being shown for a card (the commander-set printing when there is one).
function printInfo(c) {
  if (!c) return null;
  const set = c.set || '',
    rar = c.rar || '';
  return set || rar ? {set, rar} : null;
}
function printTag(c) {
  const i = printInfo(c);
  if (!i) return '';
  return (
    '<span class="setline">' +
    (i.set ? '<span class="setn">' + esc(i.set) + '</span>' : '') +
    (i.rar ? '<span class="rar rar-' + esc(i.rar[0]) + '">' + esc(i.rar[0].toUpperCase() + i.rar.slice(1)) + '</span>' : '') +
    '</span>'
  );
}
function priceOf(o) {
  const pr = o.prices || {},
    p = parseFloat(pr.usd || pr.usd_foil || pr.usd_etched);
  return isNaN(p) ? null : p;
}
async function scry(q, extra, maxPages, each) {
  let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q + ' game:paper') + '&unique=prints' + (extra || ''),
    pages = 0;
  while (url && pages++ < maxPages) {
    const r = await sfetch(url);
    if (r.status === 404) return;
    if (!r.ok) throw new Error('search ' + r.status);
    const j = await r.json();
    (j.data || []).forEach(each);
    url = j.has_more ? j.next_page : null;
  }
}
async function ensureTheme() {
  const d = cur(),
    c = d && d.format === 'commander' ? find(d.commander) : null,
    code = c && c.id ? d.cmdSet || c.sc || '' : '';
  if (code === PRINT.key) return;
  PRINT.key = code;
  PRINT.map = new Map();
  if (!code) return;
  const cached = lsGet('dc.theme3.' + code);
  if (cached) {
    PRINT.map = new Map(cached);
    render();
    return;
  }
  try {
    const sets = lsGet('dc.sets') || {},
      fam = [code];
    if (sets[code]) fam.push(sets[code]);
    for (const k in sets) if (sets[k] === code && fam.length < 6) fam.push(k);
    const m = new Map();
    await scry('(' + fam.map(s => 'e:' + s).join(' or ') + ')', '', 8, o => {
      const k = norm(o.name),
        old = m.get(k);
      if (!old || (o.set === code && old.sc !== code))
        m.set(k, {
          id: o.id,
          sc: o.set,
          set: o.set_name || '',
          rar: o.rarity || '',
          fn: o.flavor_name || ((o.card_faces || [])[0] || {}).flavor_name || ''
        });
    });
    if (PRINT.key !== code) return;
    PRINT.map = m;
    if (lsGet('dc.sets')) lsSet('dc.theme3.' + code, [...m]);
    render();
  } catch (e) {}
}
// Remember which printing a deck entry uses, with its set, rarity and price, so the deck shows that printing everywhere.
function setPrint(en, x) {
  if (x.fn) en.pn = x.fn;
  else if (x.id) delete en.pn;
  en.pid = x.id;
  en.ps = x.set;
  en.pr = x.rar || '';
  if (x.p != null) en.pp = x.p;
  else delete en.pp;
  if (x.sc) en.psc = x.sc;
  if (x.cn) en.pcn = x.cn;
  else delete en.pcn;
}
function rarChip(r) {
  return r ? '<span class="rar rar-' + esc(r[0]) + '">' + esc(r[0].toUpperCase() + r.slice(1)) + '</span>' : '';
}
// Set, rarity and price of the printing currently shown in the card pop-up.
// When the picture is a printing that carries another name (Sword of Fire and Ice's Marvel printing is "Patriotic Shield"), say so.
// Two-faced cards: which face is showing (both pictures come from the same printing; flipping changes nothing else).
function faceNote(c) {
  const f = c.fc && c.fc[S.face || 0];
  return f
    ? 'Showing the ' +
        (S.face ? 'back' : 'front') +
        ' face: <b>' +
        esc(f.n) +
        '</b> · ' +
        esc(f.t) +
        (f.pt ? ' · ' + esc(f.pt) : '')
    : '';
}
function picNote(c) {
  const x = S.pick,
    fn = x && x.fn != null ? x.fn : x && x.id === c.id ? c.fn : (shownPrint(c) || {}).fn || '';
  return fn && norm(fn) !== c._n
    ? 'The picture shows the ' + esc(fn) + ' printing of ' + esc(c.n) + ' (same card, another name).'
    : '';
}
function pickHtml(c) {
  const d0 = cur(),
    en = S.view === 'decks' && S.open && d0 ? d0.cards.find(y => y.n === c.n) : null;
  const x = S.pick && S.pick.set ? S.pick : en && en.ps ? {set: en.ps, rar: en.pr, p: en.pp} : null,
    i = x ? {set: x.set, rar: x.rar} : printInfo(c) || {set: '', rar: ''};
  return (
    '<span class="setline" style="margin:0">' +
    (i.set ? '<span class="setn">' + esc(i.set) + '</span>' : '') +
    rarChip(i.rar) +
    (x && x.p != null ? '<span>$' + x.p.toFixed(2) + '</span>' : '') +
    '</span>'
  );
}
function cheapest() {
  const P = S.prints;
  let b = null;
  if (P)
    P.list.forEach(x => {
      if (x.p != null && (!b || x.p < b.p)) b = x;
    });
  return b;
}
function printsHtml() {
  const P = S.prints;
  if (!P || !P.list.length) return '<p class="note" style="margin:0">No other printings found.</p>';
  const ch = cheapest();
  return (
    (ch
      ? '<div class="row"><button class="btn sm' +
        (S.pick && S.pick.id === ch.id ? '' : ' pri') +
        '" data-act="print-cheap"' +
        (S.pick && S.pick.id === ch.id ? ' disabled' : '') +
        '>' +
        (S.pick && S.pick.id === ch.id ? 'Showing the cheapest printing' : 'Use cheapest printing') +
        ' · $' +
        ch.p.toFixed(2) +
        '</button></div>'
      : '') +
    '<div class="prints">' +
    P.list
      .map(
        (x, i) =>
          '<button data-act="print" data-v="' +
          i +
          '" class="' +
          (S.pick && S.pick.id === x.id ? 'on' : '') +
          '"><img loading="lazy" alt="" src="' +
          imgUrl('small', x.id) +
          '"><span>' +
          esc(x.set) +
          '</span><small>' +
          esc(x.yr) +
          (x.rar ? ' · ' + esc(x.rar[0].toUpperCase() + x.rar.slice(1)) : '') +
          (x.p != null ? ' · $' + x.p.toFixed(2) : '') +
          '</small></button>'
      )
      .join('') +
    '</div>'
  );
}
async function loadPrints(c) {
  const list = [];
  try {
    await scry(c.oid ? 'oracleid:' + c.oid : '!"' + c.n + '"', '&order=released&dir=desc', 4, o =>
      list.push({
        id: o.id,
        set: o.set_name,
        sc: o.set,
        cn: o.collector_number || '',
        yr: String(o.released_at || '').slice(0, 4),
        p: priceOf(o),
        rar: o.rarity || '',
        fn: o.flavor_name || ((o.card_faces || [])[0] || {}).flavor_name || ''
      })
    );
  } catch (e) {
    const b = $('#prints');
    if (b && S.modalCard === c.n) b.innerHTML = '<p class="note" style="margin:0">Could not load the list of printings.</p>';
    return;
  }
  if (S.modalCard !== c.n) return;
  S.prints = {n: c.n, list};
  if (S.pick && !S.pick.set) {
    const m = list.find(x => x.id === S.pick.id);
    if (m) S.pick = m;
  }
  const b = $('#prints');
  if (b) b.innerHTML = printsHtml();
  const pi = $('#pr-info');
  if (pi) pi.innerHTML = pickHtml(c);
  const pn = $('#pic-note');
  if (pn) pn.innerHTML = picNote(c);
}
async function printSearch(q) {
  const out = [];
  S.printPending = q;
  try {
    await scry(q, '&order=name', 3, o => {
      const c = find(o.name);
      if (c) out.push({c, id: o.id, set: o.set_name, sc: o.set, yr: String(o.released_at || '').slice(0, 4), p: priceOf(o)});
    });
    S.printRes = {q, out};
  } catch (e) {
    S.printRes = {q, out, err: true};
  }
  S.printPending = '';
  if (S.search.q.trim() === q && S.search.prints) {
    const el = $('#s-res');
    if (el) el.innerHTML = searchResults();
  }
}
const edhSlug = n =>
  String(n)
    .split(' // ')[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
// A commander's EDHREC data as its own object (the global EDH untouched): from this browser's weekly cache, else EDHREC.
async function fetchEdh(name) {
  const E = {key: name, map: null, decks: 0, state: 'loading', pre: null, tags: [], tmap: {}},
    slug = edhSlug(name),
    cached = lsGet('dc.edh.' + slug);
  const apply = rows => {
    E.map = new Map(rows.map(r => [norm(r[0]), {inc: r[1], syn: r[2]}]));
    E.state = 'ok';
  };
  if (cached && Date.now() - cached.ts < 7 * 864e5 && cached.rows.length && cached.tags) {
    E.decks = cached.decks;
    E.pre = cached.pre || null;
    E.tags = cached.tags;
    apply(cached.rows);
  } else {
    try {
      const r = await fetch('https://json.edhrec.com/pages/commanders/' + slug + '.json');
      if (!r.ok) throw new Error('status ' + r.status);
      const j = await r.json(),
        seen = new Map();
      let decks = 0;
      ((j.container && j.container.json_dict && j.container.json_dict.cardlists) || []).forEach(L =>
        (L.cardviews || []).forEach(v => {
          if (!v.name || !v.potential_decks) return;
          decks = Math.max(decks, v.potential_decks);
          const inc = Math.min(1, v.num_decks / v.potential_decks),
            old = seen.get(v.name);
          if (!old || inc > old[1]) seen.set(v.name, [v.name, inc, +(v.synergy || 0).toFixed(3)]);
        })
      );
      if (!seen.size) throw new Error('no cards');
      E.decks = decks;
      E.tags = parseTags(j);
      const pn = j.container && j.container.json_dict && j.container.json_dict.card && j.container.json_dict.card.precon;
      if (pn) {
        try {
          const pr = await fetch('https://json.edhrec.com/pages/precon/' + edhSlug(pn) + '.json');
          if (pr.ok) E.pre = parsePrecon(await pr.json());
        } catch (e) {
          E.pre = null;
        }
      }
      apply([...seen.values()]);
      lsSet('dc.edh.' + slug, {ts: Date.now(), decks, rows: [...seen.values()], pre: E.pre, tags: E.tags});
    } catch (e) {
      E.state = 'fail';
      await addFall(E, name);
      return E;
    }
  }
  // theme pages already saved in this browser
  E.tags.forEach(t => {
    const c = lsGet('dc.edht.' + slug + '__' + t.slug);
    if (c && c.rows && Date.now() - c.ts < 7 * 864e5) E.tmap[t.slug] = new Map(c.rows.map(r => [r[0], {inc: r[1], syn: r[2]}]));
  });
  if (!E.map || E.map.size < 60) await addFall(E, name);
  return E;
}
// Fallback play data (Build 145): a commander with no EDHREC page of its own, or very little data, gets the pages of its
// creature type and its first theme in its colours (engine fallTags: "In 41% of Zombie decks"), saved for a week. A page that
// can't be read is simply left out.
async function addFall(E, name) {
  const T = fallTags(name);
  if (!T.length) return;
  const got = [];
  await Promise.all(
    T.map(async (t, i) => {
      const k = 'dc.edhtag.' + t.path.replace(/\//g, '_'),
        c = lsGet(k);
      let rows = c && c.rows && Date.now() - c.ts < 7 * 864e5 ? c.rows : null;
      if (!rows)
        try {
          const r = await fetch('https://json.edhrec.com/pages/tags/' + t.path + '.json');
          if (r.ok) {
            rows = [...parseTag(await r.json()).entries()].map(([n, x]) => [n, x.inc, x.syn]);
            if (rows.length) lsSet(k, {ts: Date.now(), rows});
          }
        } catch (e) {}
      if (rows && rows.length)
        got.push({i, label: t.label, slug: t.path, map: new Map(rows.map(r => [r[0], {inc: r[1], syn: r[2]}]))});
    })
  );
  E.fall = got.sort((a, b) => a.i - b.i).map(({label, slug, map}) => ({label, slug, map}));
}
// Which of the player's decks each card is a suggested upgrade for: each saved Commander deck's upgrade paths, worked out
// one deck at a time in the background with that deck's own commander data, and kept until the deck changes.
const UPX = {map: new Map(), busy: false, sig: ''};
const strHash = s => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
};
const deckSig = d =>
  strHash(
    JSON.stringify([
      d.commander,
      d.partner,
      d.aims,
      d.tribe,
      d.tier,
      d.colors,
      d.cards.map(e => e.n + '×' + e.q),
      d.dismissed,
      d.sets,
      d.setsMust,
      d.types,
      d.keys,
      d.typesMust,
      d.keysMust,
      DBINFO.count,
      COMBOS.list.length,
      libCount()
    ])
  );
async function buildUpgradeIndex() {
  if (UPX.busy || !DBINFO.complete) return;
  const decks = S.profile.decks.filter(
    d => d.format === 'commander' && find(d.commander) && isAimed(d) && !(d.plan && d.plan.length)
  );
  const sig = decks.map(d => d.id + ':' + deckSig(d)).join('|');
  if (sig === UPX.sig) return;
  UPX.busy = true;
  const map = new Map();
  for (const d of decks) {
    const key = 'dc.upx.' + d.id,
      ds = deckSig(d),
      c0 = lsGet(key);
    let rows = c0 && c0.sig === ds ? c0.rows : null;
    if (!rows) {
      const E = await fetchEdh(find(d.commander).n);
      const saved = EDH;
      EDH =
        E.state === 'ok' || (E.fall || []).length
          ? E
          : {key: '', map: null, decks: 0, state: 'fail', pre: null, tags: [], tmap: {}};
      try {
        upgradePaths.own = ownSet();
        const R = upgradePaths(d);
        try {
          const ar = APX.get(apexKey(d)) || null;
          scoreCheck(d, R, {apex: ar});
        } catch (e2) {}
        rows = R.paths.flatMap(L =>
          Object.entries(L.opts)
            .filter(([, p]) => p && p.add)
            .map(([t, p]) => [p.add, p.cut, t])
        );
      } catch (e) {
        rows = [];
      } finally {
        EDH = saved;
      }
      if (E.state === 'ok') lsSet(key, {sig: ds, rows});
      await new Promise(r => setTimeout(r, 0));
    } // without play data the rows are kept for this visit only
    rows.forEach(([add, cut, t]) => {
      const k = norm(add);
      if (!map.has(k)) map.set(k, []);
      const L = map.get(k);
      if (!L.some(x => x.id === d.id && x.t === t)) L.push({id: d.id, name: d.name, cut, t});
    });
  }
  UPX.map = map;
  UPX.sig = sig;
  UPX.busy = false;
  if (S.view === 'search') {
    const el = $('#s-res');
    if (el) el.innerHTML = searchResults();
  }
}
const upFor = c => (c ? UPX.map.get(c._n) || [] : []);
function upBadge(c) {
  const L = upFor(c);
  if (!L.length) return '';
  const n = new Set(L.map(x => x.id)).size;
  return (
    '<span class="upb" title="Suggested upgrade for ' +
    esc([...new Set(L.map(x => x.name))].join(', ')) +
    '">Upgrade · ' +
    (n === 1 ? esc(L[0].name) : n + ' decks') +
    '</span>'
  );
}
async function loadEdh(name) {
  if (!name) return;
  if (EDH.key === name && EDH.state) return EDH.wait;
  EDH = {key: name, map: null, decks: 0, state: 'loading', pre: null, tags: [], tmap: {}};
  const mine = EDH;
  mine.wait = fetchEdh(name).then(E => {
    Object.assign(mine, {
      map: E.map,
      decks: E.decks,
      pre: E.pre,
      tags: E.tags,
      tmap: Object.assign(E.tmap, mine.tmap),
      state: E.state,
      fall: E.fall || null
    });
  });
  return mine.wait;
}
// Play data inside each chosen commander theme (EDHREC theme pages), cached for a week like the commander page.
async function loadThemes(name, aims) {
  const want = (aims || [])
    .filter(isEdhAim)
    .map(a => a.slice(4))
    .filter(t => EDH.key === name && !EDH.tmap[t]);
  if (!want.length) return false;
  const slug = edhSlug(name);
  let got = false;
  await Promise.all(
    want.map(async t => {
      const k = 'dc.edht.' + slug + '__' + t,
        c = lsGet(k);
      if (c && Date.now() - c.ts < 7 * 864e5) {
        EDH.tmap[t] = new Map(c.rows.map(r => [r[0], {inc: r[1], syn: r[2]}]));
        got = true;
        return;
      }
      try {
        const r = await fetch('https://json.edhrec.com/pages/commanders/' + slug + '/' + t + '.json');
        if (!r.ok) return;
        const m = parseTheme(await r.json());
        if (EDH.key !== name) return;
        EDH.tmap[t] = m;
        got = true;
        lsSet(k, {ts: Date.now(), rows: [...m.entries()].map(([n, x]) => [n, x.inc, x.syn])});
      } catch (e) {}
    })
  );
  return got;
}
// A deck whose mechanics were set automatically takes the commander's own top themes (what players build it around) once
// they are known. Any change the player makes to the mechanics is kept from then on.
// Changing the mechanics asks for a different build, so the picks being held are released (like Regenerate; Undo brings them back).
function aimsChanged(d) {
  if (d.recP && Object.keys(d.recP).length) {
    d.recPrev = d.recP;
    d.recP = {};
    toast('Picks rebuilt for the new mechanics. “Undo last regenerate” brings the old ones back.');
  }
}
function themeDefaults(d) {
  if (!d || d.aimLocked || d.aimAuto === false || !EDH.tags || !EDH.tags.length || EDH.key !== (find(d.commander) || {}).n)
    return false;
  const auto =
    d.aimAuto === true ||
    !d.aims.length ||
    JSON.stringify(d.aims) === JSON.stringify(detectStrategy(find(d.commander), d).themes.slice(0, 3));
  if (!auto) return false;
  const next = EDH.tags.slice(0, 3).map(t => 'edh:' + t.slug);
  if (JSON.stringify(next) === JSON.stringify(d.aims)) return false;
  d.aims = next;
  d.aimAuto = true;
  return true;
}
function ensureEdh() {
  const d = S.view === 'decks' && S.open ? cur() : null,
    c = d && d.format === 'commander' ? find(d.commander) : null;
  if (!c) return;
  const themes = () => {
    if (EDH.key !== c.n || EDH.state !== 'ok') return;
    const ch = themeDefaults(d);
    if (ch) touch();
    loadThemes(c.n, d.aims).then(g => {
      if (g || ch) render();
    });
  };
  if (EDH.key === c.n) {
    if (EDH.state === 'ok' && (d.aims.some(a => isEdhAim(a) && !EDH.tmap[a.slice(4)]) || themeDefaults(d))) themes();
    return;
  }
  loadEdh(c.n).then(() => {
    if (EDH.key === c.n) {
      render();
      themes();
    }
  });
}
function edhNote(c) {
  if (!c || EDH.key !== c.n) return '';
  return EDH.state === 'ok'
    ? '<span class="chip good"><span class="sbl">Using what </span>' +
        EDH.decks.toLocaleString() +
        '<span class="sbn"> ' +
        esc(c.n.split(',')[0]) +
        '</span> decks<span class="sbl"> play</span> (EDHREC)</span>'
    : EDH.state === 'loading'
      ? '<span class="chip">Loading what ' + esc(c.n.split(',')[0]) + ' players run…</span>'
      : '<span class="chip warn">Commander-specific data unavailable · using general popularity</span>';
}
function artFor(c, e) {
  if (c && c.id) return imgUrl('art_crop', pidOf(c, e));
  const key = c ? c.n : '?';
  if (ART.has(key)) return ART.get(key);
  const W = 240,
    H = 168,
    cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d'),
    r = rng(key);
  const t = c ? frontType(c) : '',
    o = c ? c.o || '' : '',
    ci = c ? c.ci : [];
  const p1 = PAL[ci[0] || (/Land/.test(t) ? 'L' : 'C')],
    p2 = PAL[ci[1] || ci[0] || (/Land/.test(t) ? 'L' : 'C')];
  const bg = g.createLinearGradient(0, 0, W * (0.3 + r() * 0.7), H);
  bg.addColorStop(0, p1[2]);
  bg.addColorStop(0.55, p2[1]);
  bg.addColorStop(1, p1[2]);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    const x = r() * W,
      y = r() * H,
      rad = 30 + r() * 90,
      n = g.createRadialGradient(x, y, 0, x, y, rad);
    n.addColorStop(0, (i % 2 ? p1[0] : p2[1]) + '55');
    n.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = n;
    g.fillRect(0, 0, W, H);
  }
  const cx = W * (0.4 + r() * 0.2),
    cy = H * (0.42 + r() * 0.1);
  const glow = (x, y, rad, col) => {
    const n = g.createRadialGradient(x, y, 0, x, y, rad);
    n.addColorStop(0, col);
    n.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = n;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  if (/Land/.test(t)) {
    glow(W * (0.2 + r() * 0.6), H * 0.28, 60, p1[0] + 'cc');
    g.fillStyle = p1[0];
    g.beginPath();
    g.arc(W * (0.2 + r() * 0.6), H * 0.26, 11, 0, 7);
    g.fill();
    for (let l = 0; l < 3; l++) {
      g.fillStyle = ['rgba(0,0,0,.35)', 'rgba(0,0,0,.6)', 'rgba(0,0,0,.85)'][l];
      g.beginPath();
      g.moveTo(0, H);
      let x = 0,
        y = H * (0.5 + l * 0.14);
      while (x <= W) {
        g.lineTo(x, y - r() * 40 * (1 - l * 0.25));
        x += 12 + r() * 26;
      }
      g.lineTo(W, H);
      g.fill();
    }
  } else if (/Instant|Sorcery/.test(t)) {
    glow(cx, cy, 90, p1[0] + 'ee');
    g.strokeStyle = p1[0];
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.3,
        l1 = 14 + r() * 20,
        l2 = 50 + r() * 80;
      g.globalAlpha = 0.25 + r() * 0.6;
      g.lineWidth = 0.6 + r() * 2.4;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * l1, cy + Math.sin(a) * l1);
      g.lineTo(cx + Math.cos(a) * l2, cy + Math.sin(a) * l2);
      g.stroke();
    }
    g.globalAlpha = 0.8;
    for (let i = 0; i < 3; i++) {
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(cx, cy, 22 + i * 16, r() * 6, r() * 6 + 3.5);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(cx, cy, 8, 0, 7);
    g.fill();
  } else if (/Enchantment/.test(t) && !/Creature/.test(t)) {
    const pts = Array.from({length: 7}, () => [W * (0.12 + r() * 0.76), H * (0.14 + r() * 0.7)]);
    g.strokeStyle = p1[0] + 'aa';
    g.lineWidth = 1;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
    pts.forEach(p => {
      glow(p[0], p[1], 22, p1[0] + 'cc');
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(p[0], p[1], 2.6, 0, 7);
      g.fill();
    });
    g.strokeStyle = p2[0] + '66';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse(cx, cy, 40 + i * 22, 14 + i * 8, r() * 3, 0, 7);
      g.stroke();
    }
  } else if (/Artifact/.test(t) && !/Creature/.test(t)) {
    glow(cx, cy, 80, p1[0] + '99');
    for (let i = 0; i < 4; i++) {
      const rg = g.createLinearGradient(cx - 50, cy - 50, cx + 50, cy + 50);
      rg.addColorStop(0, '#fff');
      rg.addColorStop(0.5, p1[1]);
      rg.addColorStop(1, '#222');
      g.strokeStyle = rg;
      g.lineWidth = 5 - i;
      g.beginPath();
      g.ellipse(cx, cy, 48 - i * 10, (48 - i * 10) * (0.55 + r() * 0.45), r() * 3, 0, 7);
      g.stroke();
    }
    g.fillStyle = p2[0];
    g.beginPath();
    g.moveTo(cx, cy - 16);
    g.lineTo(cx + 11, cy);
    g.lineTo(cx, cy + 16);
    g.lineTo(cx - 11, cy);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.beginPath();
    g.moveTo(cx, cy - 16);
    g.lineTo(cx + 11, cy);
    g.lineTo(cx, cy);
    g.fill();
  } else {
    // creature / planeswalker: cloaked figure with an aura, wings for fliers
    glow(cx, cy - 6, 84, p1[0] + 'bb');
    const big = /Dragon|Dinosaur|Beast|Giant|Wurm|Hydra|Avatar|Elemental|Golem|Demon/.test(t),
      sc = big ? 1.3 : 1;
    if (/Flying|Dragon|Angel|Bird|Sphinx/.test(o + t)) {
      g.fillStyle = 'rgba(8,4,18,.82)';
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx, cy - 4);
        g.quadraticCurveTo(cx + sgn * 60 * sc, cy - 70 * sc, cx + sgn * 104 * sc, cy - 26 * sc);
        g.quadraticCurveTo(cx + sgn * 70 * sc, cy - 20, cx + sgn * 62 * sc, cy + 14);
        g.quadraticCurveTo(cx + sgn * 36 * sc, cy - 4, cx, cy + 20);
        g.fill();
      }
    }
    g.fillStyle = 'rgba(6,3,14,.92)';
    g.beginPath();
    g.moveTo(cx - 34 * sc, H);
    g.quadraticCurveTo(cx - 30 * sc, cy + 4, cx - 9 * sc, cy - 16 * sc);
    g.lineTo(cx + 9 * sc, cy - 16 * sc);
    g.quadraticCurveTo(cx + 30 * sc, cy + 4, cx + 34 * sc, H);
    g.fill();
    g.beginPath();
    g.arc(cx, cy - 26 * sc, 12 * sc, 0, 7);
    g.fill();
    if (big || /Elf|Demon|Devil|Dragon/.test(t)) {
      g.beginPath();
      g.moveTo(cx - 9 * sc, cy - 33 * sc);
      g.lineTo(cx - 18 * sc, cy - 52 * sc);
      g.lineTo(cx - 3 * sc, cy - 37 * sc);
      g.moveTo(cx + 9 * sc, cy - 33 * sc);
      g.lineTo(cx + 18 * sc, cy - 52 * sc);
      g.lineTo(cx + 3 * sc, cy - 37 * sc);
      g.fill();
    }
    g.fillStyle = p1[0];
    g.shadowColor = p1[0];
    g.shadowBlur = 8;
    g.beginPath();
    g.arc(cx - 4 * sc, cy - 27 * sc, 1.8, 0, 7);
    g.arc(cx + 4 * sc, cy - 27 * sc, 1.8, 0, 7);
    g.fill();
    g.shadowBlur = 0;
    if (/Planeswalker/.test(t)) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(cx + 34, cy - 50);
      g.lineTo(cx + 39, cy - 38);
      g.lineTo(cx + 51, cy - 33);
      g.lineTo(cx + 39, cy - 28);
      g.lineTo(cx + 34, cy - 16);
      g.lineTo(cx + 29, cy - 28);
      g.lineTo(cx + 17, cy - 33);
      g.lineTo(cx + 29, cy - 38);
      g.fill();
    }
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(255,255,255,' + r() * 0.35 + ')';
    g.fillRect(r() * W, r() * H, 1, 1);
  }
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.6)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  let url = '';
  try {
    url = cv.toDataURL('image/jpeg', 0.82);
  } catch (e) {}
  ART.set(key, url);
  return url;
}

// ---------- small renderers ----------
const SVG = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>',
  decks: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="11" height="15" rx="1.5"/><path d="M8 3h11v15"/></svg>',
  deck: '<svg viewBox="0 0 24 24"><path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg>',
  precons:
    '<svg viewBox="0 0 24 24"><path d="M4 5h6a2 2 0 012 2v13a2 2 0 00-2-2H4zM20 5h-6a2 2 0 00-2 2v13a2 2 0 012-2h6z"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 5-7 8-7s7 2 8 7"/></svg>',
  generate:
    '<svg viewBox="0 0 24 24"><path d="M4 20L15 9M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM19 13l.7 1.8 1.8.7-1.8.7L19 18l-.7-1.8-1.8-.7 1.8-.7z"/></svg>',
  buy: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/></svg>',
  library:
    '<svg viewBox="0 0 24 24"><path d="M4 5h6a2 2 0 012 2v13a2 2 0 00-2-2H4zM20 5h-6a2 2 0 00-2 2v13a2 2 0 012-2h6z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>'
};
// Mana symbols as printed on cards: Scryfall's official symbol images ({W/U} -> WU.svg, {2/W} -> 2W.svg, {T}, {X} …).
// If an image can't load (offline), it falls back to the app's own coloured pip with the symbol's letters.
function symImg(k) {
  return (
    '<img class="ms" src="https://svgs.scryfall.io/card-symbols/' +
    encodeURIComponent(k.replace(/\//g, '')) +
    '.svg" alt="{' +
    esc(k) +
    '}" title="{' +
    esc(k) +
    '}" data-k="' +
    esc(k) +
    '">'
  );
}
function symPip(k) {
  const cls = 'WUBRG'.includes(k) && k.length === 1 ? 'p' + k : 'pN';
  return '<i class="pip ' + cls + '">' + (k === 'T' ? '↷' : esc(k)) + '</i>';
}
function pips(text) {
  return esc(text || '').replace(/\{([^}]+)\}/g, (m, k) => symImg(k));
}
document.addEventListener(
  'error',
  ev => {
    const t = ev.target;
    if (t && t.classList && t.classList.contains('ms')) t.outerHTML = symPip(t.dataset.k || '');
  },
  true
);
function money(c) {
  return !c || c.p == null ? '—' : (c.src === 'starter' ? '~' : '') + '$' + c.p.toFixed(2);
}
function frameCls(c) {
  if (!c) return '';
  if (/\bLand\b/.test(frontType(c))) return 'fL';
  return c.ci.length > 1 ? 'fM' : c.ci.length ? 'f' + c.ci[0] : '';
}
function cardHtml(c, mini, pr, extra) {
  const tag = mini ? 'button' : 'div',
    attrs = mini ? ' data-act="card" data-n="' + esc(c.n) + '"' + (pr ? ' data-p="' + pr.id + '"' : '') : '';
  if (c.id)
    return (
      '<' +
      tag +
      ' class="card real"' +
      attrs +
      '><img loading="lazy" alt="' +
      esc(c.n) +
      '" src="' +
      imgUrl('normal', pr ? pr.id : pidOf(c), !mini && c.df && S.face === 1) +
      '">' +
      (!mini && c.df ? '<button class="btn sm flip" data-act="flip" aria-label="Flip to the other face">⟲ Flip</button>' : '') +
      '<div class="ft"><span>' +
      esc(pr && pr.set ? pr.set + (pr.yr ? ' · ' + pr.yr : '') : mini ? c.n : '') +
      '</span><span>' +
      (pr && pr.set ? (pr.p != null ? '$' + pr.p.toFixed(2) : '—') : money(c) + (c.std ? ' · STD' : '')) +
      '</span></div>' +
      (extra || '') +
      '</' +
      tag +
      '>'
    );
  return (
    '<' +
    tag +
    ' class="card ' +
    frameCls(c) +
    (mini ? ' mini' : '') +
    '"' +
    attrs +
    '><div class="ct"><span>' +
    nameHtml(c) +
    '</span><span>' +
    pips(c.m) +
    '</span></div><img alt="" src="' +
    artFor(c) +
    '"><div class="ty">' +
    esc(c.t) +
    '</div><div class="tx">' +
    pips(c.o) +
    '</div><div class="ft"><span>' +
    money(c) +
    (c.std ? ' · STD' : '') +
    '</span>' +
    (c.pt ? '<span class="pt">' + esc(c.pt) + '</span>' : '') +
    '</div>' +
    (extra || '') +
    '</' +
    tag +
    '>'
  );
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 3200);
}
