// Owner rulings ("stored outcomes", build 48). The owner saves how a card resolves with the dev PIN; every device loads
// the rulings from the Worker (GET /outcomes), keeps a copy for offline play, and puts them into each game as
// game.storedOutcomes, where the engine and the resolve-by-hand panel read them. Refreshed every two minutes.

import { onlineUrl } from './online.js';

const CACHE_KEY = 'cc-outcomes';
const listeners = new Set();
let current = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } })();
let started = false;

export function storedOutcomes() { return current; }
export function onOutcomes(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function refreshOutcomes() {
  try {
    const res = await fetch(`${onlineUrl()}/outcomes`, { cache: 'no-store' });
    if (!res.ok) return current;
    const data = await res.json();
    current = data.outcomes || {};
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(current)); } catch { /* ignore */ }
    for (const fn of listeners) fn(current);
  } catch { /* offline: keep the saved copy */ }
  return current;
}

/** Start loading rulings (once). */
export function startOutcomes() {
  if (started) return;
  started = true;
  refreshOutcomes();
  setInterval(refreshOutcomes, 120000);
}

/** Save (or remove) the owner ruling for a card. Needs the dev PIN. */
export async function saveOutcome(pin, rec) {
  const res = await fetch(`${onlineUrl()}/outcomes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, ...rec }) });
  const data = await res.json().catch(() => ({}));
  if (res.ok) await refreshOutcomes();
  return { status: res.status, ...data };
}

/** Put the current rulings into a game (and keep them current while it runs). */
export function attachOutcomes(game, onUpdate = () => {}) {
  startOutcomes();
  game.storedOutcomes = current;
  return onOutcomes(next => { game.storedOutcomes = next; onUpdate(); });
}
