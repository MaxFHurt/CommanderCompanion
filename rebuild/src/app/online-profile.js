// Online profile: this device's profile, decks and playmats (the same backup as Save Profile)
// kept online under a private 12-letter key, so the player can load it on another device.
// Once a device is linked to a key, it saves again quietly whenever the profile changed
// (checked when the start screen opens). If another device saved first, nothing is overwritten:
// the player chooses on the Profile screen.

import { buildProfileBackup, restoreProfileBackup } from '../data/profile-backup.js';
import { fetchOnlineProfile, saveOnlineProfile } from '../net/online.js';

const LINK_KEY = 'cc-online-profile';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function onlineProfileLink() {
  try { return JSON.parse(localStorage.getItem(LINK_KEY) || 'null'); } catch { return null; }
}
function setLink(link) {
  try { link ? localStorage.setItem(LINK_KEY, JSON.stringify(link)) : localStorage.removeItem(LINK_KEY); } catch { /* optional */ }
}
export function unlinkOnlineProfile() { setLink(null); }

/** "ABCD-EFGH-JKLM" for showing; keys are stored without dashes. */
export const formatKey = key => String(key || '').replace(/(.{4})(?=.)/g, '$1-');
export const cleanKey = text => String(text || '').toUpperCase().replace(/[^A-Z]/g, '');

// Cheap fingerprint of the backup, to skip saving when nothing changed.
function fingerprint(backup) {
  const text = JSON.stringify({ ...backup, exportedAt: null });
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/** Save now. Creates a new key the first time. Throws OnlineError (status 409: another device saved first). */
export async function saveProfileOnline({ force = false } = {}) {
  let link = onlineProfileLink();
  const backup = buildProfileBackup();
  if (!link) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    link = { key: [...bytes].map(b => LETTERS[b % LETTERS.length]).join(''), rev: 0 };
  }
  let base = link.rev;
  if (force) base = (await fetchOnlineProfile(link.key).catch(() => ({ rev: 0 }))).rev || 0;
  const done = await saveOnlineProfile(link.key, base, backup);
  setLink({ key: link.key, rev: done.rev, savedAt: new Date().toISOString(), print: fingerprint(backup) });
  return onlineProfileLink();
}

/** Replace this device's profile with the online one, and link this device to that key. */
export async function loadProfileOnline(key) {
  const data = await fetchOnlineProfile(key);
  await restoreProfileBackup(data.backup);
  setLink({ key, rev: data.rev, savedAt: new Date(data.updatedAt).toISOString(), print: fingerprint(buildProfileBackup()) });
  return data;
}

/** Quiet save when linked and something changed. Returns 'saved', 'same', 'conflict', 'offline' or 'off'. */
export async function autoSaveProfile() {
  const link = onlineProfileLink();
  if (!link) return 'off';
  if (fingerprint(buildProfileBackup()) === link.print) return 'same';
  try { await saveProfileOnline(); return 'saved'; }
  catch (error) { return error.status === 409 ? 'conflict' : 'offline'; }
}
