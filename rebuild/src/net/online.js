// Online games ("play over time"): the shared copy lives with a Cloudflare Worker (cloud/worker.js).
// Each device runs the game itself and saves after its own moves; a save based on an old copy is
// refused, so nobody's move is ever overwritten.

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
