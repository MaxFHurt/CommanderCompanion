// Account (owner, 13 Nov): sign up / sign in with an email and a one-time code (Supabase Auth, no SDK). The account
// holds the online profile's key (table profile_recovery: user_id -> profile_key, own row only), so a signed-in device
// syncs its profile with no key to type. The session stays on the device (refresh token in localStorage 'cc.auth');
// signing out removes it. Nothing on the device is ever replaced without a backup copy first (keepBackupCopy).

import { onlineProfileLink, linkDeviceTo, unlinkOnlineProfile, saveProfileOnline, loadProfileOnline, localSnapshot,
  sameBackup, hasLocalData, keepBackupCopy, runExclusive } from './online-profile.js';
import { fetchOnlineProfile } from '../net/online.js';

export const SUPABASE_URL = 'https://wdngytwilqxcdoqtefgg.supabase.co';
// The project's public (anon) key: safe to ship, access is limited by the row rules in cloud/supabase-recovery.sql.
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkbmd5dHdpbHF4Y2RvcXRlZmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNzI4ODIsImV4cCI6MjEwOTY0ODg4Mn0.ilEw4jDoDMwedxdjtYlDVEgKAfGGg5EqIwYPnk9aa6g';

const AUTH_KEY = 'cc.auth';
const PENDING_KEY = 'cc.auth.pending';
export const WELCOME_KEY = 'cc.welcome.done';
const TABLE = '/rest/v1/profile_recovery';

export class AccountError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
}

export const validEmail = text => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(text || '').trim());
export const cleanCode = text => String(text || '').replace(/\D/g, '');
export const validCode = text => /^\d{6,8}$/.test(cleanCode(text));

function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function write(key, value) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional */ } }

export const welcomeDone = () => { try { return !!localStorage.getItem(WELCOME_KEY); } catch { return true; } };
export const setWelcomeDone = () => { try { localStorage.setItem(WELCOME_KEY, new Date().toISOString()); } catch { /* optional */ } };
/** First launch: no account on this device and the welcome screen never answered. */
export const needsWelcome = () => !session() && !welcomeDone();

/** { email, userId, access, refresh, expiresAt (ms), key? } or null. */
export const session = () => { const s = read(AUTH_KEY); return s?.refresh ? s : null; };
export const accountEmail = () => session()?.email || '';
const saveSession = s => write(AUTH_KEY, s);

async function call(path, { method = 'POST', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(SUPABASE_URL + path, {
      method, cache: 'no-store',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch { throw new AccountError('No internet connection.'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 429) throw new AccountError('Too many tries. Try again in a few minutes.', 429);
    throw new AccountError(data?.msg || data?.error_description || data?.message || `The account service answered ${res.status}.`, res.status, data?.error_code || data?.code || data?.error || '');
  }
  return data;
}

function fromAuth(data, prev = {}) {
  const expiresAt = data.expires_at ? data.expires_at * 1000 : Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return { ...prev, email: data.user?.email || prev.email || '', userId: data.user?.id || prev.userId || '', access: data.access_token, refresh: data.refresh_token || prev.refresh, expiresAt };
}

/**
 * Email a one-time code. Sign up creates the account; sign in only works for an existing one. Until the email template
 * shows the code, Supabase may send a link instead: it opens the app with ?auth=1 and the tokens in the hash.
 */
export async function sendCode(email, { create = true } = {}) {
  email = email.trim();
  write(PENDING_KEY, { email, at: Date.now() });
  const redirect = location.origin + location.pathname + '?auth=1';
  try {
    await call(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, { body: { email, create_user: create } });
  } catch (error) {
    if (!create && (error.status === 400 || error.status === 422)) throw new AccountError('No account uses that email. Choose Sign up.', error.status);
    throw error;
  }
}

/** Check the emailed code; keeps the session on this device. */
export async function verifyCode(email, code) {
  let data;
  try { data = await call('/auth/v1/verify', { body: { type: 'email', email: email.trim(), token: cleanCode(code) } }); }
  catch (error) {
    if (error.status === 400 || error.status === 401 || error.status === 403) throw new AccountError('That code is wrong or has expired. Check the email or send a new code.', error.status);
    throw error;
  }
  write(PENDING_KEY, null);
  saveSession(fromAuth(data));
  setWelcomeDone();
  return session();
}

let refreshing = null;
/** Swap the refresh token for a new session. A refused token signs this device out (its profile stays). */
export function refreshSession() {
  const s = session();
  if (!s) return Promise.resolve(null);
  return refreshing ||= (async () => {
    try {
      const data = await call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh } });
      saveSession(fromAuth(data, session() || s));
      return session();
    } catch (error) {
      if (error.status === 400 || error.status === 401 || error.status === 403) saveSession(null);
      throw error;
    } finally { refreshing = null; }
  })();
}

/** A current access token (refreshed when it is about to run out). */
export async function accessToken() {
  const s = session();
  if (!s) throw new AccountError('Not signed in.', 401);
  if (!s.access || s.expiresAt - Date.now() < 60000) return (await refreshSession()).access;
  return s.access;
}

let timer = null;
/** App start: refresh the session now and again before it runs out. */
export function startAuth() {
  const plan = () => {
    clearTimeout(timer);
    const s = session();
    if (!s) return;
    timer = setTimeout(() => refreshSession().then(plan, plan), Math.max(5000, s.expiresAt - Date.now() - 120000));
  };
  if (session()) refreshSession().then(plan, plan);
  document.addEventListener('visibilitychange', () => {
    const s = session();
    if (document.visibilityState === 'visible' && s && s.expiresAt - Date.now() < 180000) refreshSession().then(plan, plan);
  });
}

/** Sign out: the session leaves this device and the device stops saving online. The profile stays on the device. */
export async function signOut() {
  const s = session();
  if (s?.access) await call('/auth/v1/logout?scope=local', { token: s.access }).catch(() => {});
  saveSession(null);
  unlinkOnlineProfile();
}

/** The profile key kept with the account, or null. */
export async function accountKey() {
  const rows = await call(`${TABLE}?select=profile_key`, { method: 'GET', token: await accessToken() });
  return rows?.[0]?.profile_key || null;
}
async function setAccountKey(key) {
  const s = session();
  try {
    await call(`${TABLE}?on_conflict=user_id`, { token: await accessToken(), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { user_id: s.userId, profile_key: key, updated_at: new Date().toISOString() } });
  } catch (error) {
    if (error.status === 409 || error.code === '23505') throw new AccountError('This profile is already kept by another email. Sign in with that email instead.', 409);
    throw error;
  }
}
const markConnected = key => { const s = session(); if (s) saveSession({ ...s, key }); };
/** Signed in, but this device's profile and the account's are not joined yet (the choice was put off). */
export const needsConnect = () => { const s = session(); return !!s && (!s.key || s.key !== onlineProfileLink()?.key); };

/**
 * After a sign-in: join this device's profile and the account's. Never replaces anything without a backup copy first.
 *   account has no key  -> keep this device's key, or make one and upload this device's profile; the account keeps it.
 *   account has a key   -> this device has nothing of its own (or the same profile): load the account's profile.
 *                       -> this device has a different profile: back it up, then `choose()` ('account' | 'device' |
 *                          null = decide later). The profile not kept stays in a backup copy on this device.
 * Returns 'linked', 'same', 'loaded', 'kept-device' or 'later'.
 */
export function connectAccount({ choose, saveFile } = {}) {
  return runExclusive(async () => {
    const key = await accountKey();
    const link = onlineProfileLink();
    if (!key) {
      const mine = link || await saveProfileOnline();
      await setAccountKey(mine.key);
      markConnected(mine.key);
      return 'linked';
    }
    if (link?.key === key) { markConnected(key); return 'same'; }
    let remote = null;
    try { remote = await fetchOnlineProfile(key); } catch (error) { if (error.status !== 404) throw error; }
    const local = await localSnapshot();
    if (!remote) {   // the account's online copy is gone (2 years unused): this device's profile becomes it
      linkDeviceTo(key, 0); await saveProfileOnline({ force: true }); markConnected(key); return 'linked';
    }
    if (!hasLocalData(local) || sameBackup(local, remote.backup)) {
      await loadProfileOnline(key); markConnected(key); return 'loaded';
    }
    return pickOne(key, remote, local, { choose, saveFile });
  });
}

/** Both profiles changed (sync conflict) on a signed-in device: back up this device's, then ask which to keep. */
export function resolveConflict({ choose, saveFile } = {}) {
  return runExclusive(async () => {
    const link = onlineProfileLink();
    if (!link) return 'off';
    const remote = await fetchOnlineProfile(link.key);
    return pickOne(link.key, remote, await localSnapshot(), { choose, saveFile });
  });
}

async function pickOne(key, remote, local, { choose, saveFile }) {
  await keepBackupCopy(local, 'This device');
  await saveFile?.().catch?.(() => {});   // a backup file too, where the browser allows it without a tap
  const pick = await choose?.({ local, remote: remote.backup });
  if (pick === 'account') { await loadProfileOnline(key); markConnected(key); return 'loaded'; }
  if (pick === 'device') {
    await keepBackupCopy(remote.backup, 'The account');
    linkDeviceTo(key, remote.rev);
    await saveProfileOnline({ force: true });
    markConnected(key);
    return 'kept-device';
  }
  return 'later';
}

/**
 * App start: a returning sign-in link (the email held a link, not a code). Strips the tokens and ?auth from the address
 * at once; returns { tokens } / { error: true } or null.
 */
export function readAuthReturn() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const access = hash.get('access_token'), error = hash.get('error') || hash.get('error_description');
  if (!access && !error) return null;
  const url = new URL(location.href);
  for (const k of ['auth', 'recovery']) url.searchParams.delete(k);
  url.hash = '';
  history.replaceState(null, '', url);
  if (error) return { error: true };
  return { tokens: { access_token: access, refresh_token: hash.get('refresh_token'), expires_in: hash.get('expires_in'), expires_at: Number(hash.get('expires_at')) || 0 } };
}

/** Keep the session a sign-in link brought. */
export async function acceptAuthReturn(ret) {
  const user = await call('/auth/v1/user', { method: 'GET', token: ret.tokens.access_token });
  saveSession(fromAuth({ ...ret.tokens, user }, { email: read(PENDING_KEY)?.email || '' }));
  write(PENDING_KEY, null);
  setWelcomeDone();
  return session();
}
