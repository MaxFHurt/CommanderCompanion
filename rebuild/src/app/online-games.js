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

export function forgetOnlineGame(code) {
  write(listOnlineGames().filter(r => r.code !== code));
}

export function onlineGame(code) {
  return listOnlineGames().find(r => r.code === code) || null;
}
