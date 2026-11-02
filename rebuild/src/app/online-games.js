// This device's list of online games: code, the seat this device plays, and who is in it.
// The games themselves live online; this list is only how the Online Games screen finds them.

const KEY = 'cc-online-games';

export function listOnlineGames() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

function write(rows) {
  try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 30))); } catch { /* optional */ }
}

/** Add or update one game ({ code, clientId, name, names, mode }). Most recent first. */
export function rememberOnlineGame(row) {
  const old = listOnlineGames().find(r => r.code === row.code) || {};
  write([{ ...old, ...row, at: Date.now() }, ...listOnlineGames().filter(r => r.code !== row.code)]);
}

/** Online games joined on another device (from the online profile): added, keeping this device's own rows. */
export function mergeOnlineGames(rows) {
  if (!Array.isArray(rows)) return;
  const mine = listOnlineGames(), have = new Set(mine.map(r => r.code));
  const extra = rows.filter(r => r && typeof r.code === 'string' && !have.has(r.code));
  if (extra.length) write([...mine, ...extra].sort((a, b) => (b.at || 0) - (a.at || 0)));
}

export function forgetOnlineGame(code) {
  write(listOnlineGames().filter(r => r.code !== code));
}

export function onlineGame(code) {
  return listOnlineGames().find(r => r.code === code) || null;
}
