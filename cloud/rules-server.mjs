// Online games ("play over time") run by a server, so no device holds another player's hidden cards (owner, 7 Nov:
// "I want the ability to pass turns to a player offline and await their response but I cannot pay").
// The game lives only here. Each device sends its own moves and gets back only what its player may see (the same
// view a hosted room sends a joined device, src/game/view.js). The live copy runs as a Supabase Edge Function
// (cloud/supabase-games.mjs, free plan: 2 s of CPU per request; one move takes about 35 ms from a cold start);
// tests run it on this computer inside cloud/dev-server.mjs.
//
// Every seat has a private key, made on the device that takes the seat and kept in its online games list (which the
// online profile carries to the player's other devices). The server keeps only a hash of it. Without the key a device
// gets the lobby's names and the summary, never a view.
//
//   POST /games                 { lobby, key }   → { code, rev }        new game; lobby.seats[0] is this device's seat
//   GET  /games/:code?rev=N     (X-Seat-Key)     → 204 if still N, else { rev, phase: 'lobby', lobby, you } or
//                                                  { rev, phase: 'playing', seats, view }  (view only with a seat's key)
//   POST /games/:code/seat      { seat, key }    → { rev, index }       take an open seat; the last seat starts the game
//   POST /games/:code/act       { intent } (X-Seat-Key) → { rev, result, view }
//   GET  /games/:code/summary                    → { rev, summary, updatedAt }   (small, for lists)
//
// The store: get(code) → row | null; insert(row) → bool (false if the code is taken); update(code, rev, patch) → bool
// (false if the row is no longer at `rev`: someone else moved first, so the move is replayed on the newer game).
// A row is { code, rev, phase, lobby, game (JSON text), keys: [{ hash, clientId }], summary, updated_at }.

import { createGame } from '../rebuild/src/game/setup.js';
import { createController } from '../rebuild/src/game/controller.js';
import { settle } from '../rebuild/src/game/flow.js';

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: easy to read out loud
const CODE_RE = /^[A-Z]{6}$/;
const KEY_RE = /^[a-f0-9]{32,64}$/;
const MAX_BODY = 12 * 1024 * 1024;

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Seat-Key, Authorization, apikey, x-client-info',
  'Access-Control-Max-Age': '86400'
};

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
const fail = (status, error) => json({ error }, status);
const httpError = (status, message) => Object.assign(new Error(message), { status });

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(b => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
}

export async function hashKey(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(key)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw httpError(413, 'That is too large to send.');
  try { return JSON.parse(text || '{}'); } catch { throw httpError(400, 'Bad request.'); }
}

/** The lobby anyone with the code may see: names and decks' names, never the deck lists. */
const publicLobby = lobby => lobby && ({
  mode: lobby.mode, rules: lobby.rules || {}, firstPlayer: lobby.firstPlayer, seatsWanted: lobby.seatsWanted,
  seats: (lobby.seats || []).map(s => ({ name: s.name, deckName: s.deckName || '', clientId: s.clientId || null }))
});

/** The game for a lobby whose seats are all taken (as src/app/start-game.js buildGame, without the device-only parts). */
function startGame(lobby, code) {
  const defs = {};
  for (const s of lobby.seats) for (const d of s.definitions || []) {
    const { legalities, printing, language, ...slim } = d;
    defs[d.definitionId] = slim;
  }
  const game = createGame({
    mode: lobby.mode, deviceMode: 'multi-device', rules: { ...(lobby.rules || {}), priorityTimer: 0 }, firstPlayer: lobby.firstPlayer ?? 'random', definitions: defs,
    players: lobby.seats.map(s => ({ name: s.name, manifest: s.manifest, commanderIds: s.commanderIds, companionIds: s.companionIds || [], deckName: s.deckName, deckId: s.deckId, sourceType: s.sourceType, matId: s.matId, advice: s.advice !== false, clientId: s.clientId || null }))
  });
  game.hasJudge = false;
  game.online = { code, server: true };
  settle(game);
  return game;
}

function summaryOf(game, controller) {
  const waiting = game.players.find(p => p.playerId === controller.actorId());
  const done = game.status === 'complete';
  return {
    status: done ? 'complete' : 'playing', names: game.players.map(p => p.displayName),
    waitingOn: done ? '' : waiting?.displayName || '', waitingClientId: done ? '' : waiting?.ownership?.clientId || '', turn: game.turnNumber || 0
  };
}

/**
 * The request handler. `store` keeps the games; `outcomes()` gives the owner's stored rulings (or {}); `corrections(records)`
 * forwards new rule corrections to the Dev report.
 */
export function rulesServer({ store, outcomes = async () => ({}), corrections = async () => {} }) {
  async function seatOf(row, request) {
    const key = request.headers.get('X-Seat-Key') || '';
    if (!KEY_RE.test(key)) return null;
    const hash = await hashKey(key);
    const index = (row.keys || []).findIndex(k => k.hash === hash);
    return index < 0 ? null : { index, clientId: row.keys[index].clientId };
  }

  function load(row, rulings) {
    const game = JSON.parse(row.game);
    game.storedOutcomes = rulings;
    return game;
  }
  function freeze(game) {
    const { storedOutcomes, ...rest } = game;
    return JSON.stringify(rest);
  }
  const playerFor = (game, seat) => game.players.find(p => p.ownership?.clientId === seat.clientId) || null;
  const viewFor = (controller, player) => controller.view({ playerId: player.playerId, isHost: false });

  async function create(request) {
    const { lobby, key } = await readBody(request);
    if (!lobby || !Array.isArray(lobby.seats) || lobby.seats.length !== 1 || !lobby.seats[0]?.name) throw httpError(400, 'A new game needs its first player.');
    if (!KEY_RE.test(String(key || ''))) throw httpError(400, 'Update the app to create online games.');
    const seatsWanted = Math.max(2, Math.min(6, Number(lobby.seatsWanted) || 2));
    const full = { ...lobby, seatsWanted };
    const keys = [{ hash: await hashKey(key), clientId: lobby.seats[0].clientId || null }];
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = newCode();
      const row = { code, rev: 1, phase: 'lobby', lobby: full, game: null, keys, summary: { names: [lobby.seats[0].name], seatsWanted, status: 'lobby' } };
      if (await store.insert(row)) return json({ code, rev: 1 });
    }
    throw httpError(503, 'Could not find a free game code. Try again.');
  }

  async function takeSeat(row, request) {
    const { seat, key } = await readBody(request);
    if (!seat?.name) throw httpError(400, 'Choose a name and a deck first.');
    if (!KEY_RE.test(String(key || ''))) throw httpError(400, 'Update the app to join online games.');
    for (let attempt = 0; attempt < 5; attempt++) {
      if (row.phase !== 'lobby') throw httpError(409, 'This game has already started.');
      const hash = await hashKey(key);
      const lobby = structuredClone(row.lobby), keys = [...(row.keys || [])];
      let index = keys.findIndex(k => k.hash === hash);
      if (index >= 0) lobby.seats[index] = { ...seat, clientId: keys[index].clientId };
      else if (lobby.seats.length >= lobby.seatsWanted) throw httpError(409, 'All seats in this game are taken.');
      else { lobby.seats.push(seat); keys.push({ hash, clientId: seat.clientId || null }); index = lobby.seats.length - 1; }
      const patch = { lobby, keys, summary: { ...row.summary, names: lobby.seats.map(s => s.name) } };
      if (lobby.seats.length >= lobby.seatsWanted) {
        // The last seat starts the game: dealt and shuffled here, so no device ever sees a library's order.
        const game = startGame(lobby, row.code);
        const controller = createController(game);
        Object.assign(patch, { phase: 'playing', game: freeze(game), summary: summaryOf(game, controller), lobby: { ...publicLobby(lobby), started: true } });
      }
      if (await store.update(row.code, row.rev, patch)) return json({ rev: row.rev + 1, index });
      row = await store.get(row.code);
      if (!row) throw httpError(404, 'That game code does not exist.');
    }
    throw httpError(409, 'Several players joined at once. Try again.');
  }

  async function read(row, request, url) {
    const since = Number(url.searchParams.get('rev'));
    if (since && since === row.rev) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', ...CORS } });
    const seat = await seatOf(row, request);
    if (row.phase === 'lobby') return json({ rev: row.rev, phase: 'lobby', lobby: publicLobby(row.lobby), you: seat ? seat.index : -1 });
    const game = load(row, await outcomes());
    const player = seat && playerFor(game, seat);
    const seats = game.players.map(p => ({ playerId: p.playerId, name: p.displayName }));
    if (!player) return json({ rev: row.rev, phase: 'playing', seats, view: null });
    return json({ rev: row.rev, phase: 'playing', seats, view: viewFor(createController(game), player) });
  }

  async function act(row, request) {
    const { intent } = await readBody(request);
    if (!intent || typeof intent.type !== 'string') throw httpError(400, 'Bad request.');
    const seat = await seatOf(row, request);
    if (!seat) throw httpError(403, 'This device does not have a seat in this game.');
    // Like a joined device: nobody acts for another player or with host powers.
    const clean = { ...intent };
    delete clean.as; delete clean.approved;
    if (['edit', 'undo', 'veto', 'end-game'].includes(clean.type)) clean.force = false;
    const rulings = await outcomes();
    for (let attempt = 0; attempt < 6; attempt++) {
      if (row.phase !== 'playing') throw httpError(409, 'The game has not started.');
      const game = load(row, rulings);
      const player = playerFor(game, seat);
      if (!player) throw httpError(403, 'This device does not have a seat in this game.');
      const controller = createController(game);
      const before = (game.corrections || []).length;
      const result = controller.dispatch(clean, { playerId: player.playerId, isHost: false });
      if (!result?.ok) return json({ rev: row.rev, result, view: viewFor(controller, player) });
      if (await store.update(row.code, row.rev, { game: freeze(game), summary: summaryOf(game, controller) })) {
        const fresh = (game.corrections || []).slice(before);
        if (fresh.length) await corrections(fresh).catch(() => {});
        return json({ rev: row.rev + 1, result, view: viewFor(controller, player) });
      }
      // Someone else moved first: play this move again on their game.
      row = await store.get(row.code);
      if (!row) throw httpError(404, 'That game code does not exist.');
    }
    throw httpError(409, 'The other players are moving quickly. Try again.');
  }

  return async function handle(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const at = parts.indexOf('games');
    if (at < 0) return json({ ok: true, service: 'Commander Companion online games (rules server)' });
    const [code = '', action = ''] = parts.slice(at + 1);
    try {
      if (!code) {
        if (request.method === 'POST') return await create(request);
        return fail(405, 'Not allowed.');
      }
      if (!CODE_RE.test(code) || !['', 'seat', 'act', 'summary'].includes(action)) return fail(404, 'That game code does not exist. Check the letters.');
      const row = await store.get(code);
      if (!row) return fail(404, 'That game code does not exist. Check the letters.');
      if (action === 'summary') return json({ rev: row.rev, summary: row.summary, updatedAt: row.updated_at || null });
      if (action === 'seat' && request.method === 'POST') return await takeSeat(row, request);
      if (action === 'act' && request.method === 'POST') return await act(row, request);
      if (action === '' && request.method === 'GET') return await read(row, request, url);
      return fail(405, 'Not allowed.');
    } catch (error) {
      if (!error.status) console.error(error);
      return fail(error.status || 500, error.status ? error.message : 'The online game service had a problem. Try again.');
    }
  };
}

/** Games kept in memory (tests and cloud/dev-server.mjs). */
export function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async get(code) { return rows.has(code) ? structuredClone(rows.get(code)) : null; },
    async insert(row) { if (rows.has(row.code)) return false; rows.set(row.code, { ...structuredClone(row), updated_at: new Date().toISOString() }); return true; },
    async update(code, rev, patch) {
      const row = rows.get(code);
      if (!row || row.rev !== rev) return false;
      rows.set(code, { ...row, ...structuredClone(patch), rev: rev + 1, updated_at: new Date().toISOString() });
      return true;
    }
  };
}
