// Online profile: this device's profile, decks, playmats and online games list (the same backup as Save Profile),
// plus the game in progress when it is played on this one device, kept online under a private 12-letter key.
// Sync (build 53, owner 2 Nov): a linked device takes the newer online copy when the start screen opens (and offers
// to continue a game carried from another device; it never swaps a game in without asking), and saves quietly
// whenever something changed: on the start screen, every minute and when the app goes to the background.
// If both devices changed, nothing is overwritten: the player chooses on the Profile screen.
// Hosted and joined games (room codes) do not travel: their host device runs them (see PROGRESS.md).

import { buildProfileBackup, restoreProfileBackup } from '../data/profile-backup.js';
import { fetchOnlineProfile, saveOnlineProfile } from '../net/online.js';
import { loadRecord, saveRecord } from '../data/store.js';
import { durableGet, durableSet } from '../data/userdata-db.js';
import { GAME_SAVE_KEY } from '../game/save-keys.js';
import { confirmDialog } from '../ui/modal.js';
import { initProfileStore } from '../data/profile.js';
import { initDeckStore } from '../data/deck-store.js';
import { initPlaymats } from '../data/playmats.js';

/** After a restore: the stores read the new profile, decks and playmats (they keep a copy in memory). */
async function restoreAndReload(backup) {
  await restoreProfileBackup(backup);
  await Promise.allSettled([initProfileStore(), initDeckStore(), initPlaymats()]);
}

const LINK_KEY = 'cc-online-profile';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function onlineProfileLink() {
  try { return JSON.parse(localStorage.getItem(LINK_KEY) || 'null'); } catch { return null; }
}
function setLink(link) {
  try { link ? localStorage.setItem(LINK_KEY, JSON.stringify(link)) : localStorage.removeItem(LINK_KEY); } catch { /* optional */ }
}
export function unlinkOnlineProfile() { setLink(null); }
/** Point this device at a key (the account's) without loading it; the next save is based on `rev`. */
export function linkDeviceTo(key, rev = 0) { setLink({ key, rev, savedAt: new Date().toISOString(), print: '' }); }

/** "ABCD-EFGH-JKLM" for showing; keys are stored without dashes. */
export const formatKey = key => String(key || '').replace(/(.{4})(?=.)/g, '$1-');
export const cleanKey = text => String(text || '').toUpperCase().replace(/[^A-Z]/g, '');

// Cheap fingerprint of the backup, to skip saving when nothing changed. Times alone are not a change (leaving the
// Profile screen saves the profile again with a new updatedAt), so another device is not told about one.
const TIMES = new Set(['exportedAt', 'updatedAt']);
function fingerprint(backup) {
  const text = JSON.stringify(backup, (k, v) => (TIMES.has(k) ? undefined : v));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/** The game in progress, when it is played on this one device (hosted and joined games stay on their devices). */
async function travellingGame() {
  const game = await loadRecord(GAME_SAVE_KEY).catch(() => null);
  return game && game.status !== 'complete' && !game.roomCode ? game : null;
}
async function syncBackup() { return { ...buildProfileBackup(), currentGame: await travellingGame() }; }
/** This device's profile as the online copy would hold it. */
export const localSnapshot = syncBackup;
/** Same profile (times aside)? */
export const sameBackup = (a, b) => !!a && !!b && fingerprint({ ...a, currentGame: a.currentGame || null }) === fingerprint({ ...b, currentGame: b.currentGame || null });

/** Does this device hold anything of the player's own? Errs towards yes: a yes only means a backup copy and a question. */
export function hasLocalData(b) {
  if (!b) return false;
  const p = b.profile || {}, builder = b.deckBuilder;
  return !!(p.games || p.wins || p.history?.length || Object.keys(p.players || {}).length || Object.keys(p.decks || {}).length
    || p.account?.displayName || b.decks?.length || (builder && !builder.example) || builder?.decks?.some?.(d => !d.example)
    || b.playmats?.length || b.onlineGames?.length || b.currentGame);
}

// Backup copies kept on this device before anything replaces a profile (owner, 13 Nov: "existing users don't lose their
// data"). IndexedDB 'cc.backup.<time>', listed in localStorage 'cc.backups'; localStorage holds the copy only if IndexedDB fails.
const COPIES = 'cc.backups';
export function listBackupCopies() { try { return JSON.parse(localStorage.getItem(COPIES) || '[]'); } catch { return []; } }
export async function keepBackupCopy(backup, label) {
  const print = fingerprint({ ...backup, currentGame: backup.currentGame || null });
  const last = listBackupCopies()[0];
  if (last?.print === print) return last.id;   // the same profile was just kept
  const at = new Date().toISOString(), id = `cc.backup.${at.replace(/[:.]/g, '-')}`;
  const copy = { ...structuredClone(backup), exportedAt: at };
  let where = 'db';
  try { await durableSet(id, copy); }
  catch { localStorage.setItem(id, JSON.stringify(copy)); where = 'local'; }   // throws if neither works: nothing is replaced then
  const name = copy.profile?.account?.displayName || '';
  localStorage.setItem(COPIES, JSON.stringify([{ id, at, label, name, where, print }, ...listBackupCopies()].slice(0, 20)));
  return id;
}
export async function readBackupCopy(id) {
  const row = listBackupCopies().find(r => r.id === id);
  if (!row) return null;
  return row.where === 'local' ? JSON.parse(localStorage.getItem(id) || 'null') : durableGet(id);
}
/** Put a backup copy back on this device (the device keeps its link; the next save sends it online). */
export async function restoreBackupCopy(id) {
  const copy = await readBackupCopy(id);
  if (!copy) throw new Error('That backup copy is gone.');
  await keepBackupCopy(await syncBackup(), 'This device, before restoring a copy');
  await restoreAndReload(copy);
}

/** A game carried from another device: offered, never swapped in silently. True when the player took it. */
async function offerGame(theirs) {
  if (!theirs || theirs.status === 'complete') return false;
  const mine = await loadRecord(GAME_SAVE_KEY).catch(() => null);
  if (mine && JSON.stringify(mine) === JSON.stringify(theirs)) return false;
  if (mine && Date.parse(mine.savedAt || 0) >= Date.parse(theirs.savedAt || 0)) return false;
  const when = theirs.savedAt ? new Date(theirs.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'recently';
  const ok = await confirmDialog({ title: 'Continue your game?', message: `A game from your other device (last played ${when}) is in your online profile. Continue it on this device?${mine && mine.status !== 'complete' ? ' The unfinished game saved on this device is replaced.' : ''}`, confirmLabel: 'Continue here', cancelLabel: 'Not now' });
  if (ok) await saveRecord(GAME_SAVE_KEY, theirs);
  return ok;
}

// One sync at a time: the start screen, the timer and background saves wait their turn.
let queue = Promise.resolve();
const once = fn => (...args) => (queue = queue.catch(() => {}).then(() => fn(...args)));
/** Run `fn` with no sync running alongside (sign-in joins). */
export const runExclusive = fn => once(fn)();

/** Save now. Creates a new key the first time. Throws OnlineError (status 409: another device saved first). */
export async function saveProfileOnline({ force = false } = {}) {
  let link = onlineProfileLink();
  const backup = await syncBackup();
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
  const mine = await syncBackup();
  if (hasLocalData(mine) && !sameBackup(mine, data.backup)) await keepBackupCopy(mine, 'This device, before loading the online profile');
  await restoreAndReload(data.backup);
  await offerGame(data.backup?.currentGame);
  setLink({ key, rev: data.rev, savedAt: new Date(data.updatedAt).toISOString(), print: fingerprint(await syncBackup()) });
  return data;
}

/** Quiet save when linked and something changed. Returns 'saved', 'same', 'conflict', 'offline' or 'off'. */
export const autoSaveProfile = once(async () => {
  const link = onlineProfileLink();
  if (!link) return 'off';
  if (fingerprint(await syncBackup()) === link.print) return 'same';
  try { await saveProfileOnline(); return 'saved'; }
  catch (error) { return error.status === 409 ? 'conflict' : 'offline'; }
});

/**
 * When the start screen opens: take the newer online copy if this device has nothing new, else save this device's.
 * Returns 'off', 'offline', 'same', 'saved', 'conflict' (both changed: the player chooses on Profile), 'loaded'
 * (profile updated from another device) or 'loaded-game' (and the player continues a game carried over).
 */
export const syncProfileOnOpen = once(async () => {
  const link = onlineProfileLink();
  if (!link) return 'off';
  let remote;
  try { remote = await fetchOnlineProfile(link.key); } catch { return 'offline'; }
  const changed = fingerprint(await syncBackup()) !== link.print;
  if ((remote.rev || 0) <= (link.rev || 0)) {
    if (!changed) return 'same';
    try { await saveProfileOnline(); return 'saved'; }
    catch (error) { return error.status === 409 ? 'conflict' : 'offline'; }
  }
  if (changed) return 'conflict';
  await restoreAndReload(remote.backup);
  const took = await offerGame(remote.backup?.currentGame);
  setLink({ key: link.key, rev: remote.rev, savedAt: new Date(remote.updatedAt || Date.now()).toISOString(), print: fingerprint(await syncBackup()) });
  return took ? 'loaded-game' : 'loaded';
});

/** From the Deck Builder page when a deck is closed: read the stores (that page has not loaded them), then save if
 * anything changed. */
export async function pushProfileNow() {
  if (!onlineProfileLink()) return 'off';
  await Promise.allSettled([initProfileStore(), initDeckStore(), initPlaymats()]);
  return autoSaveProfile();
}

/** Save in the background while the app is open: every minute and when it is put away. */
export function startProfileSync() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autoSaveProfile(); });
  setInterval(() => { if (document.visibilityState === 'visible') autoSaveProfile(); }, 60000);
}
