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

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: easy to read out loud
const CODE_RE = /^[A-Z]{6}$/;
const MAX_BODY = 12 * 1024 * 1024;
const CHUNK = 1000 * 1000;                          // stored values must stay under 2 MB
const KEEP_MS = 120 * 24 * 3600 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
    // storage.put takes at most 128 keys at a time.
    const entries = Object.entries(writes);
    for (let i = 0; i < entries.length; i += 100) await this.storage.put(Object.fromEntries(entries.slice(i, i + 100)));
    if (gone.length) await this.storage.delete(gone);
    this.meta = meta;
    await this.storage.setAlarm(Date.now() + KEEP_MS);
  }

  async alarm() {
    const meta = await this.loadMeta();
    if (meta && Date.now() - meta.updatedAt < KEEP_MS - 60000) return this.storage.setAlarm(meta.updatedAt + KEEP_MS);
    await this.storage.deleteAll();
    this.meta = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const [code, action] = url.pathname.split('/').filter(Boolean).concat('');
    try {
      const meta = await this.loadMeta();
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
