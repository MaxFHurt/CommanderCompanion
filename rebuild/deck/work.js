// ===== Deck Companion background worker (Builds 143-144) =====
// Two roles, one file.
// The builder (one per page) builds generated decks on a background core, so the page stays responsive while a deck is
// designed. It runs the same engine files as the page, and the page sends it exactly what the page itself would use: the
// card library, the commander's play data, combos, bracket lists, set lists, owned cards and the engine settings. So a deck
// built here is the same deck the page would build. Anything it can't do, the page does itself (ui.js genRun).
// Helpers (Build 144, as many as the device has cores to spare): the score check hands out batches of swaps to measure
// (engine scoreCheckG); the builder splits each batch across the helpers and itself. A helper holds only the cards its
// measurements need (the deck, the cards being measured, the reference build, the commander's play data), a few MB instead
// of the whole library. If a helper looks up a card it was not given, its answers are thrown away and the builder measures
// that part itself, so the result is always the same as on one core.
const V = self.location.search || '',
  ROLE = /role=help/.test(V) ? 'help' : 'build',
  VS = V.replace(/[?&]role=help/, '').replace(/^&/, '?');
// the engine: the minified bundle (tools/build.sh), or with dev=1 the readable files (index.html's DEV_FILES, data and engine)
importScripts(...(/[?&]dev=1(&|$)/.test(V) ? ["data.js", "lists.js", "engine/core.js", "engine/practice.js", "engine/reading.js", "engine/rules.js", "engine/functions.js", "engine/score.js", "engine/library.js", "engine/upgrades.js", "engine/mana.js", "engine/generator.js"] : ['engine.min.js']).map(f => f + VS));

// ----- helper -----
if (ROLE === 'help') {
  const ROWS = [],
    CMB = new Map(),
    ARS = new Map();
  let MISS = null;
  let FULL = 0;
  const index = () => {
    buildIndex(ROWS);
    LIB.full = FULL;
    const g0 = IDX.get.bind(IDX);
    IDX.get = k => {
      const v = g0(k);
      if (v === undefined && MISS) MISS.add(k);
      return v;
    };
  };
  index();
  const take = m => {
    if (m.full && m.full !== FULL) {
      FULL = m.full;
      LIB.full = FULL;
    }
    if (m.rows && m.rows.length) {
      m.rows.forEach(r => ROWS.push(r));
      index();
    }
    if (m.combos && m.combos.length) {
      m.combos.forEach(([i, x]) => CMB.set(i, x));
      const list = [...CMB.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]),
        by = new Map();
      list.forEach(x =>
        x.keys.forEach(k => {
          if (!by.has(k)) by.set(k, []);
          by.get(k).push(x);
        })
      );
      COMBOS = {list, by, at: '', state: list.length ? 'ok' : 'empty'};
    }
    if (m.edh) EDH = m.edh;
    if (m.btags) BTAGS = m.btags;
    if (m.sets) SETCARDS = m.sets;
    if (m.up) Object.assign(UP, m.up);
    if (m.ar) {
      ARS.set(m.ar.id, m.ar.v);
      while (ARS.size > 4) ARS.delete(ARS.keys().next().value);
    }
  };
  const serve = port => {
    port.onmessage = ev => {
      const m = ev.data || {};
      let out;
      try {
        take(m);
        const b = Object.assign({}, m.b, {apex: m.b.apexId ? ARS.get(m.b.apexId) : null});
        MISS = new Set();
        const t0 = Date.now();
        const vals = measureBatch(b);
        out = {id: m.id, vals, miss: [...MISS], ms: Date.now() - t0};
      } catch (e) {
        out = {id: m.id, err: String((e && e.message) || e), miss: MISS ? [...MISS] : []};
      }
      MISS = null;
      port.postMessage(out);
    };
  };
  onmessage = ev => {
    const m = ev.data || {};
    if (m.kind === 'port' && ev.ports && ev.ports[0]) serve(ev.ports[0]);
  };
}

// ----- builder -----
if (ROLE === 'build') {
  let SIG = {lib: '', combos: '', edh: ''},
    HELP = [],
    CIDX = null,
    ARID = new WeakMap(),
    arN = 0,
    edhN = 0,
    upN = 0,
    btN = 0,
    setN = 0;
  function useState(m) {
    if (m.lib) {
      buildIndex(m.lib.rows);
      SIG.lib = m.lib.sig;
      HELP.forEach(h => h.reset());
    }
    // the page's combo list as it is (Build 145): the same combos the page uses, whatever library it was read against
    if (m.combos) {
      COMBOS = m.combos.v;
      SIG.combos = m.combos.sig;
      CIDX = null;
      HELP.forEach(h => h.reset());
    }
    if (m.edh) {
      EDH = m.edh.v;
      SIG.edh = m.edh.sig;
      edhN++;
    }
    if (m.btags) {
      BTAGS = m.btags;
      btN++;
    }
    if (m.sets) {
      SETCARDS = m.sets;
      setN++;
    }
    if (m.up) {
      Object.assign(UP, m.up);
      upN++;
    }
  }
  // A helper, seen from the builder: what it has been sent, and one batch at a time.
  function helper(port) {
    const h = {port, seq: 0, cb: new Map(), dead: false};
    h.reset = () => {
      h.have = new Set();
      h.combos = new Set();
      h.extra = new Set();
      h.edhN = h.upN = h.btN = h.setN = -1;
      h.ars = new Set();
      h.lib = SIG.lib;
      h.fresh = true;
    };
    port.onmessage = ev => {
      const m = ev.data || {},
        f = h.cb.get(m.id);
      if (f) {
        h.cb.delete(m.id);
        f(m);
      }
    };
    h.send = (m, ms) =>
      new Promise(res => {
        const id = ++h.seq;
        const t = setTimeout(() => {
          if (h.cb.has(id)) {
            h.cb.delete(id);
            h.dead = true;
            res({err: 'timeout'});
          }
        }, ms || 20000);
        h.cb.set(id, r => {
          clearTimeout(t);
          res(r);
        });
        try {
          port.postMessage(Object.assign(m, {id}));
        } catch (e) {
          clearTimeout(t);
          h.cb.delete(id);
          res({err: String(e)});
        }
      });
    h.reset();
    return h;
  }
  const clean = c => {
    const x = {};
    for (const k in c) if (k[0] !== '_') x[k] = c[k];
    return x;
  };
  // The cards a batch's measurements look up: the deck and its commanders, the cards going in and out, the reference build and
  // the commander's play data (and its theme pages). The cards of the combos those touch are added when they are sent.
  function batchCards(b) {
    const cs = new Map(),
      add = n => {
        const c = n && find(n);
        if (c) cs.set(c._k, c);
      };
    (b.d.cards || []).forEach(e => add(e.n));
    add(b.d.commander);
    add(b.d.partner);
    b.keys.forEach(k => {
      add(k[0]);
      add(k[1]);
    });
    const A = b.apex && b.apex.cards;
    if (A) ['apex', 'mid', 'budget', 'floor'].forEach(t => (A[t] || []).forEach(e => add(e.n)));
    if (EDH && EDH.map)
      EDH.map.forEach((v, k) => {
        const c = IDX.get(k);
        if (c) cs.set(c._k, c);
      });
    if (EDH && EDH.pre)
      for (const k in EDH.pre) if (Array.isArray(EDH.pre[k])) EDH.pre[k].forEach(n => typeof n === 'string' && add(n)); // the precon's cards (play rates are judged without untouched copies)
    if (EDH && EDH.tmap)
      for (const t in EDH.tmap)
        EDH.tmap[t].forEach((v, k) => {
          const c = IDX.get(k);
          if (c) cs.set(c._k, c);
        });
    return cs;
  }
  let KIDX = null;
  const byKey = k => {
    if (!KIDX || KIDX.n !== LIB.length) {
      KIDX = new Map(LIB.map(c => [c._k, c]));
      KIDX.n = LIB.length;
    }
    return KIDX.get(k);
  };
  function comboIdx() {
    if (!CIDX) {
      CIDX = new Map();
      COMBOS.list.forEach((x, i) => CIDX.set(x, i));
    }
    return CIDX;
  }
  // One batch for one helper: what it lacks, then the batch itself.
  // (the play data goes without its caches, such as _pd, which hold functions; the helper works them out again)
  function packFor(h, b, keys, cs) {
    if (h.lib !== SIG.lib) h.reset();
    const m = {
        b: {
          kind: b.kind,
          d: b.d,
          base: b.base ? {sim: b.base.sim, exact: b.base.exact, cmp: b.base.cmp} : null,
          games: b.games,
          keys
        }
      },
      rows = [],
      cmb = [],
      ci = comboIdx();
    // a card's combos go with it, and the other cards of those combos (without their own combos: they are never in the deck measured)
    const row = c => {
      if (!c || h.have.has(c._k)) return false;
      h.have.add(c._k);
      rows.push(clean(c));
      return true;
    };
    const give = c => {
      if (!row(c)) return;
      (COMBOS.by.get(c._k) || []).forEach(x => {
        const i = ci.get(x);
        if (h.combos.has(i)) return;
        h.combos.add(i);
        cmb.push([i, x]);
        x.keys.forEach(k => row(byKey(k)));
      });
    };
    cs.forEach(give);
    h.extra.forEach(k => give(IDX.get(k)));
    h.extra.clear();
    if (rows.length) m.rows = rows;
    if (cmb.length) m.combos = cmb;
    m.full = LIB.length;
    if (h.edhN !== edhN) {
      const v = {};
      for (const k in EDH) if (k !== 'wait' && k[0] !== '_' && typeof EDH[k] !== 'function') v[k] = EDH[k];
      m.edh = v;
      h.edhN = edhN;
    }
    if (h.upN !== upN) {
      m.up = UP;
      h.upN = upN;
    }
    if (h.btN !== btN) {
      m.btags = BTAGS;
      h.btN = btN;
    }
    if (h.setN !== setN) {
      m.sets = SETCARDS;
      h.setN = setN;
    }
    if (b.apex) {
      let id = ARID.get(b.apex);
      if (!id) {
        id = ++arN;
        ARID.set(b.apex, id);
      }
      m.b.apexId = id;
      if (!h.ars.has(id)) {
        h.ars.add(id);
        m.ar = {id, v: b.apex};
      }
    }
    return m;
  }
  const STAT = {
    batches: 0,
    keys: 0,
    local: 0,
    redo: 0,
    sent: 0,
    gaps: 0,
    checked: 0,
    wrong: 0,
    tPack: 0,
    tMine: 0,
    tWait: 0,
    tHelp: 0,
    tAll: 0
  };
  // Measure a batch across the helpers and this core. Small batches are measured here (handing them out costs more than it saves).
  async function spread(b) {
    const T0 = performance.now();
    try {
      return await spread0(b);
    } finally {
      STAT.tAll += performance.now() - T0;
    }
  }
  async function spread0(b) {
    const live = HELP.filter(h => !h.dead),
      n = b.keys.length;
    STAT.batches++;
    STAT.keys += n;
    if (!live.length || n < 4) {
      STAT.local += n;
      return measureBatch(b);
    }
    const parts = Math.min(live.length + 1, Math.ceil(n / 2)),
      size = Math.ceil(n / parts),
      chunks = [];
    for (let i = 0; i < n; i += size) chunks.push([i, b.keys.slice(i, i + size)]);
    const t0 = performance.now(),
      cs = batchCards(b),
      mine = chunks[0],
      out = new Array(n);
    const jobs = chunks.slice(1).map(([i, keys], j) => {
      const h = live[j % live.length],
        pk = packFor(h, b, keys, cs);
      STAT.sent += (pk.rows || []).length;
      return h.send(pk).then(r => ({i, keys, r, h}));
    });
    const t1 = performance.now(),
      my = measureBatch(Object.assign({}, b, {keys: mine[1]}));
    my.forEach((v, k) => (out[mine[0] + k] = v));
    STAT.local += mine[1].length;
    const t2 = performance.now();
    const done = await Promise.all(jobs),
      t3 = performance.now();
    STAT.tPack += t1 - t0;
    STAT.tMine += t2 - t1;
    STAT.tWait += t3 - t2;
    done.forEach(x => {
      STAT.tHelp += x.r.ms || 0;
    });
    for (const {i, keys, r, h} of done) {
      // spot check: on a helper's first batch and every 16th after, its first answer is measured here too; one that differs means
      // the helper can't be trusted, and it is not used again
      if (!r.err && r.vals && (h.n = (h.n || 0) + 1) % 16 === 1) {
        const v0 = measureBatch(Object.assign({}, b, {keys: [keys[0]]}))[0];
        STAT.checked++;
        if (JSON.stringify(v0) !== JSON.stringify(r.vals[0])) {
          h.dead = true;
          STAT.wrong++;
          r.err = 'differs';
        }
      }
      // a card the helper was not given (and this core has) means its answers can't be trusted: measured here instead
      const gap = (r.miss || []).filter(k => IDX.has(k));
      gap.forEach(k => h.extra.add(k));
      STAT.gaps += gap.length;
      if (r.err) h.reset(); // a batch that did not arrive: send everything again if (gap.length){ STAT.gaps = STAT.gaps || {}; gap.forEach(k => { const c = IDX.get(k); STAT.gaps[k] = (STAT.gaps[k] || '') + (c ? (h.have.has(c._k) ? 'H' : 'n') + (c.n === k ? '' : '[' + c.n + ']') : '?'); }); }
      if (r.err || gap.length || !r.vals) {
        STAT.redo += keys.length;
        const v = measureBatch(Object.assign({}, b, {keys}));
        v.forEach((x, k) => (out[i + k] = x));
      } else r.vals.forEach((x, k) => (out[i + k] = x));
    }
    return out;
  }
  // Build a deck: run the engine's generator, measuring each batch it hands out. A build made ahead can be called off (CANCEL):
  // every few batches the worker lets waiting messages in, and stops if this build is no longer wanted.
  const CANCEL = new Set();
  let JOB = 0;
  async function drive(g, job) {
    let r = g.next(),
      k = 0;
    while (!r.done) {
      if (++k % 6 === 0) {
        await new Promise(res => setTimeout(res, 0));
        if (CANCEL.has(job)) throw new Error('cancelled');
      }
      let v,
        err = null;
      try {
        v = await spread(r.value);
      } catch (e) {
        err = e;
      }
      r = err ? g.throw(err) : g.next(v);
    }
    return r.value;
  }
  async function handle(m, ev) {
    try {
      if (m.kind === 'helpers') {
        HELP = (ev.ports || []).map(helper);
        postMessage({id: m.id, ok: true, n: HELP.length});
        return;
      }
      useState(m);
      if (m.kind === 'sync') {
        postMessage({
          id: m.id,
          ok: true,
          sig: SIG,
          edh: {key: EDH.key, state: EDH.state, fall: (EDH.fall || []).map(f => f.slug + ':' + (f.map && f.map.size))}
        });
        return;
      }
      // Warm-up: the card reading every build uses is done once, while the app is idle, so the first deck is not slower here.
      if (m.kind === 'warm') {
        const t0 = Date.now();
        for (const c of LIB) tags(c);
        postMessage({id: m.id, ok: true, ms: Date.now() - t0});
        return;
      }
      // The reference build for a deck's settings, designed ahead while the player is still choosing (kept for the build).
      if (m.kind === 'ref') {
        const t0 = Date.now();
        apexRef(m.nd);
        postMessage({id: m.id, ok: true, ms: Date.now() - t0});
        return;
      }
      // A batch of swaps measured for the page (Build 146: the upgrade list's whole-card search), shared across the helper cores.
      if (m.kind === 'measure') {
        if (CANCEL.has(m.id)) {
          CANCEL.delete(m.id);
          postMessage({id: m.id, err: 'cancelled'});
          return;
        }
        const t0 = Date.now();
        measureBatch.par = HELP.filter(h => !h.dead).length + 1;
        let vals;
        try {
          vals = await spread(m.b);
        } finally {
          measureBatch.par = 0;
        }
        postMessage({id: m.id, ok: true, vals, ms: Date.now() - t0, helpers: HELP.filter(h => !h.dead).length});
        return;
      }
      if (m.kind === 'gen') {
        const t0 = Date.now(),
          J = m.job,
          nd = J.nd,
          seeds = (J.seeds || []).map(n => find(n)).filter(Boolean);
        if (J.refs && J.refs.length) {
          apexRef.cache = apexRef.cache || new Map();
          J.refs.forEach(([k, v]) => {
            if (!apexRef.cache.has(k)) apexRef.cache.set(k, v);
          });
          while (apexRef.cache.size > 4) apexRef.cache.delete(apexRef.cache.keys().next().value);
        }
        Object.assign(STAT, {
          batches: 0,
          keys: 0,
          local: 0,
          redo: 0,
          sent: 0,
          gaps: 0,
          checked: 0,
          wrong: 0,
          tPack: 0,
          tMine: 0,
          tWait: 0,
          tHelp: 0,
          tAll: 0
        });
        if (CANCEL.has(m.id)) {
          CANCEL.delete(m.id);
          postMessage({id: m.id, err: 'cancelled'});
          return;
        }
        measureBatch.par = HELP.filter(h => !h.dead).length + 1;
        let r;
        try {
          r = await drive(
            genDeckG(nd, seeds, J.ownOnly ? new Set(J.ownOnly) : null, new Set(J.ownAll || []), J.fill || null),
            m.id
          );
        } finally {
          measureBatch.par = 0;
          CANCEL.delete(m.id);
        }
        postMessage({
          id: m.id,
          ok: true,
          nd,
          n: r.n,
          k: r.k,
          ms: Date.now() - t0,
          helpers: HELP.filter(h => !h.dead).length,
          stat: Object.fromEntries(Object.entries(STAT).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v])),
          refs: apexRef.cache ? [...apexRef.cache] : []
        });
        return;
      }
      postMessage({id: m.id, err: 'unknown job'});
    } catch (e) {
      postMessage({id: m.id, err: String((e && e.stack) || e)});
    }
  }
  // one job at a time, in the order sent (a build waiting on its helpers is not interrupted by the next message)
  let QUEUE = Promise.resolve();
  onmessage = ev => {
    const m = ev.data || {};
    if (m.kind === 'cancel') {
      CANCEL.add(m.job);
      return;
    }
    QUEUE = QUEUE.then(() => handle(m, ev));
  };
}
