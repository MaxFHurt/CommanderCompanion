// Online games ("play over time"). New games (build 76) live on the rules server (cloud/rules-server.mjs, a Supabase Edge
// Function): it runs the rules and sends each device only what its player may see, so nobody's device holds another
// player's hand. Games made before build 76 live with the Cloudflare Worker (cloud/worker.js): each device runs those
// itself and saves after its own moves. Profiles, rulings and the Dev report stay on the Worker.

const LIVE_URL = 'https://commander-companion-games.ajw226.workers.dev';

/** Tests point the app at a local copy of the Worker with ?online=http://127.0.0.1:8787 */
export function onlineUrl() {
  try {
    const custom = new URLSearchParams(location.search).get('online');
    if (custom && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(custom)) return custom;
  } catch { /* default */ }
  return LIVE_URL;
}

export class OnlineError extends Error {
  constructor(message, status = 0, data = null) { super(message); this.status = status; this.data = data; }
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(onlineUrl() + path, {
      method, cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new OnlineError('No internet connection. Your game is safe on this device until it can save.', 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new OnlineError(data.error || `The online save service answered ${res.status}.`, res.status, data);
  return data;
}

const RULES_URL = 'https://wdngytwilqxcdoqtefgg.supabase.co/functions/v1';

/** The rules server; tests use the copy inside cloud/dev-server.mjs (?online=http://127.0.0.1:8787 → …/rules). */
export function rulesUrl() {
  const local = onlineUrl();
  return local === LIVE_URL ? RULES_URL : `${local}/rules`;
}

async function callRules(method, path, body, key = '') {
  let res;
  try {
    res = await fetch(rulesUrl() + path, {
      method, cache: 'no-store',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'X-Seat-Key': key } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new OnlineError('No internet connection. Moves in online games need a connection.', 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new OnlineError(data.error || `The online game service answered ${res.status}.`, res.status, data);
  return data;
}

/** A seat's private key: made on the device that takes the seat; the server keeps only its hash. */
export function newSeatKey() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const createServerGame = (lobby, key) => callRules('POST', '/games', { lobby, key });
/** The lobby, or this seat's view of the game; null if nothing changed since `rev`. */
export const fetchServerGame = (code, key, rev = 0) => callRules('GET', `/games/${code}${rev ? `?rev=${rev}` : ''}`, null, key);
export const takeServerSeat = (code, seat, key) => callRules('POST', `/games/${code}/seat`, { seat, key });
export const actServerGame = (code, intent, key) => callRules('POST', `/games/${code}/act`, { intent }, key);
export const serverSummary = code => callRules('GET', `/games/${code}/summary`);

/** Slim copy of a prepared seat: only what the game needs (deck-check details stay home). */
export function onlineSeat(seat, clientId) {
  const definitions = seat.definitions.map(({ legalities, printing, language, ...slim }) => slim);
  return { ...seat, definitions, clientId };
}

export const createOnlineGame = lobby => call('POST', '/games', { lobby });
/** The whole game, or null if nothing changed since `rev`. */
export const fetchOnlineGame = (code, rev = 0) => call('GET', `/games/${code}${rev ? `?rev=${rev}` : ''}`);
export const takeOnlineSeat = (code, seat) => call('POST', `/games/${code}/seat`, { seat });
export const saveOnlineGame = (code, baseRev, game, summary) => call('PUT', `/games/${code}`, { baseRev, game, summary });
export const onlineSummary = code => call('GET', `/games/${code}/summary`);

export function newCodeOk(code) { return /^[A-Z]{6}$/.test(code); }

// Online profile: a profile backup kept under a private 12-letter key, to load on another device.
export const fetchOnlineProfile = key => call('GET', `/profiles/${key}`);
export const saveOnlineProfile = (key, baseRev, backup) => call('PUT', `/profiles/${key}`, { baseRev, backup });
