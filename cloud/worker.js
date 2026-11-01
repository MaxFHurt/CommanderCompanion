// Commander Companion online games ("play over time"), a Cloudflare Worker.
//
// Each online game lives in its own Durable Object, found by its 6-letter code, so every read and
// save of one game happens in one place, one at a time. The devices run the game; this Worker only
// keeps the shared copy. A save names the version it was based on (`baseRev`) and is refused if
// someone else saved first, so two devices can never overwrite each other's moves.
//
//   POST /games                 { lobby }               → { code, rev }      new game, seats filling
//   GET  /games/:code?rev=N                              → { rev, lobby, game, summary } or 204 if still N
//   POST /games/:code/seat      { seat }                → { rev, index }     take an open seat
//   PUT  /games/:code           { baseRev, game, summary } → { rev }  or 409 { rev } if someone saved first
//   GET  /games/:code/summary                            → { rev, summary, updatedAt }  (small, for lists)
//
// Games nobody opens for 120 days are deleted.
//
// Online profiles (a player's profile backup, to load on another device) use the same storage under
// a private 12-letter key:
//   GET  /profiles/:key                      → { rev, updatedAt, backup }
//   PUT  /profiles/:key  { baseRev, backup }  → { rev }  or 409 { rev, updatedAt } if another device saved first
// baseRev 0 creates it. Profiles nobody saves or loads for two years are deleted.

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: easy to read out loud
const CODE_RE = /^[A-Z]{6}$/;
const MAX_BODY = 12 * 1024 * 1024;
const CHUNK = 1000 * 1000;                          // stored values must stay under 2 MB
const KEEP_MS = 120 * 24 * 3600 * 1000;
const PROFILE_KEEP_MS = 2 * 365 * 24 * 3600 * 1000;
const PROFILE_RE = /^[A-Z]{12}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Report-Key',
  'Access-Control-Max-Age': '86400'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
}
const fail = (status, error) => json({ error }, status);

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(b => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error('The game is too large to save online.'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Bad request.'), { status: 400 }); }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'profiles') {
      const key = String(parts[1] || '').toUpperCase();
      if (!PROFILE_RE.test(key) || parts.length > 2) return fail(404, 'That profile key does not exist.');
      try {
        const res = await stub(env, `profile:${key}`).fetch(`https://game/${key}/profile`, { method: request.method, body: request.method === 'PUT' ? await request.text() : undefined });
        return withCors(res);
      } catch (error) {
        return fail(500, 'The online save service had a problem. Try again.');
      }
    }
    // Rule corrections from every game, and the owner's Dev report (build 47).
    //   POST /corrections        { records: [...] }                 → { ok, stored }
    //   POST /devreport/pin      { pin }                            → { ok } (sets the PIN once, if none is set)
    //   POST /devreport          { pin, all? }  or X-Report-Key     → { records, total, reportedUpTo }
    //   POST /devreport/mark     { pin, upTo }  or X-Report-Key     → { ok }
    // Owner rulings (stored outcomes): GET /outcomes → { outcomes }; POST /outcomes { pin, card, ruling, steps, override, remove }.
    if (parts[0] === 'outcomes' && parts.length === 1) {
      try {
        const res = await stub(env, 'reports:all').fetch(`https://game/reports/${request.method === 'GET' ? 'outcomes' : 'outcome-set'}`, { method: 'POST', body: request.method === 'GET' ? '{}' : await request.text(), headers: { 'x-key-ok': (!!env.REPORT_KEY && request.headers.get('X-Report-Key') === env.REPORT_KEY) ? '1' : '0' } });
        return withCors(res);
      } catch (error) {
        return fail(500, 'The rulings service had a problem. Try again.');
      }
    }
    if (parts[0] === 'corrections' || parts[0] === 'devreport') {
      if (request.method !== 'POST') return fail(405, 'Not allowed.');
      const action = parts[0] === 'corrections' ? 'add' : (parts[1] || 'read');
      if (!['add', 'pin', 'read', 'mark'].includes(action) || parts.length > 2) return fail(404, 'Not found.');
      const keyOk = !!env.REPORT_KEY && request.headers.get('X-Report-Key') === env.REPORT_KEY;
      try {
        const res = await stub(env, 'reports:all').fetch(`https://game/reports/${action}`, { method: 'POST', body: await request.text(), headers: { 'x-key-ok': keyOk ? '1' : '0' } });
        return withCors(res);
      } catch (error) {
        return fail(500, 'The report service had a problem. Try again.');
      }
    }
    if (parts[0] !== 'games') return parts.length ? fail(404, 'Not found.') : json({ ok: true, service: 'Commander Companion online games' });
    try {
      if (parts.length === 1 && request.method === 'POST') {
        const body = await readBody(request);
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = newCode();
          const res = await stub(env, code).fetch(`https://game/${code}/create`, { method: 'POST', body: JSON.stringify(body) });
          if (res.status !== 409) return withCors(res);
        }
        return fail(503, 'Could not make a new game code. Try again.');
      }
      const code = String(parts[1] || '').toUpperCase();
      if (!CODE_RE.test(code)) return fail(404, 'That game code does not exist.');
      const action = parts[2] || '';
      if (!['', 'seat', 'summary'].includes(action) || parts.length > 3) return fail(404, 'Not found.');
      const inner = new URL(`https://game/${code}/${action}`);
      inner.search = url.search;
      const res = await stub(env, code).fetch(inner, { method: request.method, body: ['POST', 'PUT'].includes(request.method) ? await request.text() : undefined });
      return withCors(res);
    } catch (error) {
      return fail(error.status || 500, error.status ? error.message : 'The online save service had a problem. Try again.');
    }
  }
};

function stub(env, code) { return env.GAMES.get(env.GAMES.idFromName(code)); }

function withCors(res) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

/** One online game. Storage keys: meta (rev, times, summary, chunk counts), lobby:i and game:i (JSON pieces). */
export class GameStore {
  constructor(state) {
    this.storage = state.storage;
    this.meta = undefined;
  }

  async loadMeta() {
    if (this.meta === undefined) this.meta = (await this.storage.get('meta')) || null;
    return this.meta;
  }

  async putBig(name, value, meta) {
    const text = value == null ? '' : JSON.stringify(value);
    const count = Math.ceil(text.length / CHUNK);
    const writes = {};
    for (let i = 0; i < count; i++) writes[`${name}:${i}`] = text.slice(i * CHUNK, (i + 1) * CHUNK);
    const old = meta.chunks?.[name] || 0;
    const gone = [];
    for (let i = count; i < old; i++) gone.push(`${name}:${i}`);
    meta.chunks = { ...(meta.chunks || {}), [name]: count };
    return { writes, gone };
  }

  async getBig(name, meta) {
    const count = meta.chunks?.[name] || 0;
    if (!count) return null;
    const keys = Array.from({ length: count }, (_, i) => `${name}:${i}`);
    const got = await this.storage.get(keys);
    return JSON.parse(keys.map(k => got.get(k) || '').join(''));
  }

  async save(meta, parts) {
    const writes = {}, gone = [];
    for (const [name, value] of Object.entries(parts)) {
      const r = await this.putBig(name, value, meta);
      Object.assign(writes, r.writes);
      gone.push(...r.gone);
    }
    meta.updatedAt = Date.now();
    writes.meta = meta;
    const keep = meta.kind === 'profile' ? PROFILE_KEEP_MS : KEEP_MS;
    // storage.put takes at most 128 keys at a time.
    const entries = Object.entries(writes);
    for (let i = 0; i < entries.length; i += 100) await this.storage.put(Object.fromEntries(entries.slice(i, i + 100)));
    if (gone.length) await this.storage.delete(gone);
    this.meta = meta;
    await this.storage.setAlarm(Date.now() + keep);
  }

  async alarm() {
    const meta = await this.loadMeta();
    const keep = meta?.kind === 'profile' ? PROFILE_KEEP_MS : KEEP_MS;
    if (meta && Date.now() - meta.updatedAt < keep - 60000) return this.storage.setAlarm(meta.updatedAt + keep);
    await this.storage.deleteAll();
    this.meta = null;
  }

  async profile(request, meta) {
    if (request.method === 'GET') {
      if (!meta) return fail(404, 'That profile key does not exist. Check the letters.');
      await this.storage.setAlarm(Date.now() + PROFILE_KEEP_MS);   // loading counts as use
      return json({ rev: meta.rev, updatedAt: meta.updatedAt, backup: await this.getBig('profile', meta) });
    }
    if (request.method !== 'PUT') return fail(405, 'Not allowed.');
    const { baseRev, backup } = await readBody(request);
    if (!backup || typeof backup !== 'object') return fail(400, 'Nothing to save.');
    if (Number(baseRev || 0) !== (meta?.rev || 0)) return json({ error: 'This profile was saved from another device first.', rev: meta?.rev || 0, updatedAt: meta?.updatedAt || 0 }, 409);
    const next = meta || { kind: 'profile', rev: 0, createdAt: Date.now() };
    next.rev += 1;
    await this.save(next, { profile: backup });
    return json({ rev: next.rev });
  }

  /** The single store of rule corrections ("reports:all"). Records are kept by id, so the same correction sent from
   * several devices at one table is stored once. */
  async reports(request, action) {
    const body = await readBody(request);
    const meta = (await this.storage.get('reportsMeta')) || { pinHash: null, reportedUpTo: '' };
    const hash = async pin => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cc-dev:${pin}`)))].map(b => b.toString(16).padStart(2, '0')).join('');
    const authed = async () => request.headers.get('x-key-ok') === '1' || (!!meta.pinHash && /^\d{4,8}$/.test(String(body.pin || '')) && (await hash(body.pin)) === meta.pinHash);
    if (action === 'add') {
      const records = Array.isArray(body.records) ? body.records.slice(0, 100) : [];
      const writes = {};
      for (const r of records) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'string' || r.id.length > 120) continue;
        const text = JSON.stringify(r);
        if (text.length > 6000) continue;
        writes[`rec:${r.id}`] = { ...r, receivedAt: Date.now() };
      }
      const entries = Object.entries(writes);
      for (let i = 0; i < entries.length; i += 100) await this.storage.put(Object.fromEntries(entries.slice(i, i + 100)));
      return json({ ok: true, stored: entries.length });
    }
    if (action === 'outcomes') {
      const out = {};
      for (const v of (await this.storage.list({ prefix: 'out:' })).values()) out[v.card] = v;
      return json({ outcomes: out });
    }
    if (action === 'pin') {
      if (meta.pinHash) return fail(409, 'A PIN is already set.');
      if (!/^\d{4,8}$/.test(String(body.pin || ''))) return fail(400, 'The PIN must be 4 to 8 digits.');
      meta.pinHash = await hash(body.pin);
      await this.storage.put('reportsMeta', meta);
      return json({ ok: true });
    }
    if (!meta.pinHash && request.headers.get('x-key-ok') !== '1') return fail(428, 'Set a PIN first.');
    if (!(await authed())) return fail(403, 'Wrong PIN.');
    if (action === 'outcome-set') {
      const card = String(body.card || '').trim().slice(0, 200);
      if (!card) return fail(400, 'Which card?');
      if (body.remove) { await this.storage.delete(`out:${card}`); return json({ ok: true, removed: true }); }
      const rec = { card, ruling: String(body.ruling || '').slice(0, 2000), steps: (Array.isArray(body.steps) ? body.steps : []).map(x => String(x).slice(0, 300)).slice(0, 30), override: !!body.override, oracle: String(body.oracle || '').slice(0, 3000), updatedAt: new Date().toISOString() };
      await this.storage.put(`out:${card}`, rec);
      return json({ ok: true, outcome: rec });
    }
    if (action === 'mark') {
      meta.reportedUpTo = String(body.upTo || '');
      await this.storage.put('reportsMeta', meta);
      return json({ ok: true });
    }
    const all = [...(await this.storage.list({ prefix: 'rec:' })).values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const records = body.all ? all : all.filter(r => String(r.at) > meta.reportedUpTo);
    return json({ records, total: all.length, reportedUpTo: meta.reportedUpTo });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const [code, action] = url.pathname.split('/').filter(Boolean).concat('');
    if (code === 'reports') { try { return await this.reports(request, action); } catch (error) { return fail(error.status || 500, error.status ? error.message : 'The report service had a problem.'); } }
    try {
      const meta = await this.loadMeta();
      if (action === 'profile') return this.profile(request, meta);
      if (action === 'create') {
        if (meta) return fail(409, 'Code in use.');
        const { lobby } = await readBody(request);
        if (!lobby || !Array.isArray(lobby.seats) || !lobby.seats.length) return fail(400, 'A new game needs its first player.');
        const seatsWanted = Math.max(2, Math.min(6, Number(lobby.seatsWanted) || 2));
        const fresh = { code, rev: 1, createdAt: Date.now(), started: false, summary: { names: lobby.seats.map(s => s.name), seatsWanted, status: 'lobby' } };
        await this.save(fresh, { lobby: { ...lobby, seatsWanted } });
        return json({ code, rev: fresh.rev });
      }
      if (!meta) return fail(404, 'That game code does not exist. Check the letters.');
      if (action === 'summary') return json({ rev: meta.rev, summary: meta.summary, updatedAt: meta.updatedAt });
      if (action === 'seat' && request.method === 'POST') {
        const { seat } = await readBody(request);
        if (!seat?.name) return fail(400, 'Choose a name and a deck first.');
        const lobby = await this.getBig('lobby', meta);
        if (meta.started || !lobby) return fail(409, 'This game has already started.');
        const mine = lobby.seats.findIndex(s => s.clientId && s.clientId === seat.clientId);
        if (mine >= 0) lobby.seats[mine] = seat;
        else if (lobby.seats.length >= lobby.seatsWanted) return fail(409, 'All seats in this game are taken.');
        else lobby.seats.push(seat);
        meta.rev += 1;
        meta.summary = { ...meta.summary, names: lobby.seats.map(s => s.name) };
        await this.save(meta, { lobby });
        return json({ rev: meta.rev, index: mine >= 0 ? mine : lobby.seats.length - 1 });
      }
      if (action === '' && request.method === 'GET') {
        const since = Number(url.searchParams.get('rev'));
        if (since && since === meta.rev) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
        const [lobby, game] = await Promise.all([this.getBig('lobby', meta), this.getBig('game', meta)]);
        return json({ code, rev: meta.rev, started: meta.started, updatedAt: meta.updatedAt, summary: meta.summary, lobby, game });
      }
      if (action === '' && request.method === 'PUT') {
        const { baseRev, game, summary } = await readBody(request);
        if (!game || typeof game !== 'object') return fail(400, 'Nothing to save.');
        if (Number(baseRev) !== meta.rev) return json({ error: 'Someone else saved first.', rev: meta.rev }, 409);
        const parts = { game };
        if (!meta.started) {
          // Once the game exists it carries every card it needs: keep only who sat where.
          const lobby = await this.getBig('lobby', meta);
          if (lobby) parts.lobby = { ...lobby, seats: lobby.seats.map(({ name, clientId, deckName }) => ({ name, clientId, deckName })) };
        }
        meta.started = true;
        meta.rev += 1;
        meta.summary = { ...meta.summary, ...(summary && typeof summary === 'object' ? summary : {}) };
        await this.save(meta, parts);
        return json({ rev: meta.rev });
      }
      return fail(405, 'Not allowed.');
    } catch (error) {
      return fail(error.status || 500, error.status ? error.message : 'The online save service had a problem. Try again.');
    }
  }
}
