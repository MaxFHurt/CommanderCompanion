// Small key/value persistence used for saved games and settings.
// Writes go to localStorage (fast, survives reloads) and IndexedDB (survives Safari
// clearing localStorage under storage pressure). Reads take whichever copy is newer.

import { durableGet, durableSet, durableDelete } from './userdata-db.js';

function readLocal(key) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function saveRecord(key, value) {
  const record = { savedAt: Date.now(), value };
  let localOk = true;
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    localOk = false;
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
  let durableOk = true;
  try {
    await durableSet(key, record);
  } catch {
    durableOk = false;
  }
  if (!localOk && !durableOk) throw new Error('This browser is not allowing Commander Companion to save.');
  return true;
}

export async function loadRecord(key) {
  const local = readLocal(key);
  let durable = null;
  try { durable = await durableGet(key); } catch { /* IndexedDB unavailable */ }
  const best = !durable ? local : !local ? durable : (Number(durable.savedAt || 0) > Number(local.savedAt || 0) ? durable : local);
  return best ? best.value : null;
}

export async function deleteRecord(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  try { await durableDelete(key); } catch { /* ignore */ }
}

/** Synchronous check used to enable the Continue button quickly. */
export function hasLocalRecord(key) {
  return !!readLocal(key);
}

// Device settings (not tied to a game).
const SETTINGS_KEY = 'cc-settings-v1';
const DEFAULT_SETTINGS = { guidance: 'coach', tips: true };

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(readLocal(SETTINGS_KEY)?.value || {}) };
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ savedAt: Date.now(), value: next })); } catch { /* ignore */ }
  return next;
}
