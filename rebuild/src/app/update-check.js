// Keeps the app on the newest published build. build.json sits next to index.html and holds the
// release number; whenever the app is opened, brought back to the front, or left open for a while,
// it is compared with the build that is running and the page reloads if they differ.

import { VERSION } from '../version.js';
import { getSession } from './session.js';
import { toast } from '../ui/toast.js';

const CHECK_EVERY_MS = 60 * 1000;
const RELOADED_FOR = 'cc-reloaded-for';
const RESUME_FLAG = 'cc-resume-after-update';
let pending = null;

async function latestVersion() {
  try {
    const res = await fetch(`build.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return String((await res.json()).version || '') || null;
  } catch {
    return null; // offline: keep using what we have
  }
}

function reloadNow(version) {
  // Never reload twice for the same build, so a mismatched stamp cannot cause a loop.
  try {
    if (sessionStorage.getItem(RELOADED_FOR) === version) return;
    sessionStorage.setItem(RELOADED_FOR, version);
  } catch { /* storage unavailable: reload once anyway */ }
  location.reload();
}

async function check() {
  const latest = await latestVersion();
  if (!latest || latest === VERSION) return;
  const session = getSession();
  if (!session) return reloadNow(latest);
  if (session.role === 'local') {
    // A game on this device is saved first and reopened after the reload.
    session.saveNow?.();
    try { sessionStorage.setItem(RESUME_FLAG, '1'); } catch { /* optional */ }
    setTimeout(() => reloadNow(latest), 900);
    return;
  }
  // Hosting or joined to a room: reloading would drop the connection, so wait until the game is left.
  if (pending !== latest) {
    pending = latest;
    toast('An update is ready. It will load when you leave this game.', { ms: 5000 });
  }
}

/** True once, right after an automatic update reload that interrupted a local game. */
export function shouldResumeAfterUpdate() {
  try {
    const flag = sessionStorage.getItem(RESUME_FLAG) === '1';
    sessionStorage.removeItem(RESUME_FLAG);
    return flag;
  } catch { return false; }
}

export function startUpdateChecks() {
  check();
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('pageshow', event => { if (event.persisted) check(); });
  window.addEventListener('online', check);
}
